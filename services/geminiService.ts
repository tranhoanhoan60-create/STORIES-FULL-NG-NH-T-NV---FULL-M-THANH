
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryProject, Character, Scene } from "../types";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const fetchWithRetry = async <T>(fn: () => Promise<T>, retries = 5, backoff = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const isRetryable = 
      errorMsg.includes('500') || 
      errorMsg.includes('503') || 
      errorMsg.includes('INTERNAL') || 
      errorMsg.includes('overloaded') ||
      errorMsg.includes('UNAVAILABLE');

    if (retries > 0 && isRetryable) {
      console.warn(`API Error (Retryable), retrying in ${backoff}ms... (${retries} attempts left). Error: ${errorMsg}`);
      await delay(backoff);
      return fetchWithRetry(fn, retries - 1, backoff * 2);
    }
    throw error;
  }
};

export const analyzeScript = async (script: string): Promise<StoryProject> => {
  return fetchWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `NHIỆM VỤ: Phân tích kịch bản và chia thành các phân cảnh (scenes) nhỏ chi tiết cho trẻ em.
      
      QUY TẮC BẮT BUỘC:
      1. GIỮ NGUYÊN NỘI DUNG GỐC: Không được tóm tắt, không được viết lại câu chữ. PHẢI giữ nguyên 100% lời thoại và dẫn chuyện từ kịch bản gốc.
      2. LOẠI BỎ CHỈ DẪN TRONG NGOẶC: Trong phần 'content' của mỗi scene, hãy XÓA BỎ các từ nằm trong dấu ngoặc đơn () hoặc ngoặc vuông [] liên quan đến (music), (sound effects), (camera cut),... để phần lồng tiếng được trơn tru.
      3. CHIA NHỎ SCENE: Mỗi khi bối cảnh hoặc hành động thay đổi, hãy tạo một scene mới. Đừng gộp quá nhiều câu vào một scene.
      4. THÊM PHÂN CẢNH BÀI HỌC: Luôn luôn tạo một phân cảnh CUỐI CÙNG có tiêu đề là "Bài học ý nghĩa" hoặc "Moral Lesson". Nội dung phân cảnh này là một lời nhắn nhủ ngắn gọn, ấm áp đúc kết từ câu chuyện dành cho các bé.
      5. NHÂN VẬT: Nhận diện tất cả nhân vật và mô tả ngoại hình bằng tiếng Anh thật chi tiết (ví dụ: "A young boy with messy brown hair, wearing a red striped t-shirt and denim shorts").
      6. VISUAL PROMPT: Viết mô tả bối cảnh và hành động cho mỗi scene bằng tiếng Anh (ví dụ: "In a sunlit garden, the boy is chasing a blue butterfly").

      Kịch bản cần xử lý: ${script}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            characters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING, description: "Detailed visual description in English" },
                  voice: { type: Type.STRING, enum: ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr', 'Aoede'] }
                },
                required: ["name", "description", "voice"]
              }
            },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING, description: "Original text WITHOUT text in brackets like (music)" },
                  visualPrompt: { type: Type.STRING, description: "Visual description in English for image generation" },
                  charactersInScene: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["title", "content", "visualPrompt", "charactersInScene"]
              }
            }
          },
          required: ["title", "characters", "scenes"]
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    return {
      ...data,
      originalScript: script,
      scenes: data.scenes.map((s: any, i: number) => ({ ...s, id: `scene-${i}` }))
    };
  });
};

export const generateSceneImage = async (prompt: string, size: "1K" | "2K" | "4K"): Promise<string> => {
  return fetchWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: `Masterpiece cinematic 3D animation style, Pixar inspired, soft lighting, vibrant colors, highly detailed: ${prompt}` }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: size
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from Gemini");
  });
};

export const generateThumbnail = async (title: string, style: string, characters: Character[]): Promise<string> => {
  return fetchWithRetry(async () => {
    const charContext = characters.map(c => `${c.name}: ${c.description}`).join(". ");
    const prompt = `YouTube Video Thumbnail for a story titled "${title}". Style: ${style}. Vibrant, eye-catching, cinematic lighting. Main characters: ${charContext}. High quality, 4k, professional composition with space for text.`;
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Failed to generate thumbnail");
  });
};

export const generateSceneSpeech = async (text: string, voice: string): Promise<string> => {
  return fetchWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned from Gemini");
    return base64Audio;
  });
};

export const decodeBase64Audio = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const playAudio = async (base64: string) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const data = decodeBase64Audio(base64);
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
};
