
import React, { useState, useCallback, useRef } from 'react';
import { analyzeScript, generateSceneImage, generateSceneSpeech, playAudio, decodeBase64Audio, generateThumbnail } from './services/geminiService';
import { StoryProject, AppStep, Scene, VisualStyle, Character } from './types';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [script, setScript] = useState('');
  const [project, setProject] = useState<StoryProject | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [selectedStyle, setSelectedStyle] = useState<VisualStyle>('3D Pixar');
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr' | 'Aoede'>('Aoede');
  const [error, setError] = useState<string | null>(null);

  const projectRef = useRef<StoryProject | null>(null);

  const styles: VisualStyle[] = ['3D Pixar', 'Cinematic', 'Anime', 'Realistic', '3D Render', 'Cyberpunk', 'Oil Painting'];
  
  const voices = [
    { id: 'Aoede', desc: 'Trầm ấm, kể chuyện (Narrator)' },
    { id: 'Zephyr', desc: 'Trong trẻo, trẻ trung (Young)' },
    { id: 'Kore', desc: 'Nữ tính, nhẹ nhàng (Soft)' },
    { id: 'Puck', desc: 'Năng động, tinh nghịch (Energetic)' },
    { id: 'Charon', desc: 'Trưởng thành, uy tín (Mature)' },
    { id: 'Fenrir', desc: 'Mạnh mẽ, nam tính (Strong)' }
  ];

  const handleStartAnalysis = async () => {
    if (!script.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeScript(script);
      result.style = selectedStyle;
      setProject(result);
      projectRef.current = result;
      setStep(AppStep.REVIEW);
    } catch (err: any) {
      setError(err.message || "Lỗi phân tích kịch bản. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (!project) return;
    setIsGeneratingThumbnail(true);
    try {
      const url = await generateThumbnail(project.title, selectedStyle, project.characters);
      setThumbnailUrl(url);
    } catch (err: any) {
      setError("Không thể tạo thumbnail: " + err.message);
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const updateCharacterDescription = (name: string, newDesc: string) => {
    setProject(prev => {
      if (!prev) return prev;
      const updatedChars = prev.characters.map(c => 
        c.name === name ? { ...c, description: newDesc } : c
      );
      projectRef.current = { ...prev, characters: updatedChars };
      return projectRef.current;
    });
  };

  const generateCharacterPreview = async (name: string) => {
    if (!project) return;
    const char = project.characters.find(c => c.name === name);
    if (!char) return;

    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        characters: prev.characters.map(c => c.name === name ? { ...c, isGeneratingPreview: true } : c)
      };
    });

    try {
      const previewPrompt = `Portrait of character ${name}. Appearance: ${char.description}. Style: ${selectedStyle}, neutral background, high detail.`;
      const imageUrl = await generateSceneImage(previewPrompt, "1K");
      
      setProject(prev => {
        if (!prev) return prev;
        const updatedChars = prev.characters.map(c => 
          c.name === name ? { ...c, imageUrl, isGeneratingPreview: false } : c
        );
        projectRef.current = { ...prev, characters: updatedChars };
        return projectRef.current;
      });
    } catch (err: any) {
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.map(c => c.name === name ? { ...c, isGeneratingPreview: false } : c)
        };
      });
      setError(`Lỗi tạo preview: ${err.message}`);
    }
  };

  const updateSceneVisualPrompt = (idx: number, newPrompt: string) => {
    setProject(prev => {
      if (!prev) return prev;
      const updatedScenes = [...prev.scenes];
      updatedScenes[idx].visualPrompt = newPrompt;
      projectRef.current = { ...prev, scenes: updatedScenes };
      return projectRef.current;
    });
  };

  const processSceneImage = async (idx: number) => {
    if (!projectRef.current) return;
    const scene = projectRef.current.scenes[idx];
    const charList = projectRef.current.characters.filter(c => scene.charactersInScene.includes(c.name));
    const characterContext = charList.map(c => `${c.name} looks like: ${c.description}`).join(". ");
    const fullPrompt = `Style: ${selectedStyle}. Scene: ${scene.visualPrompt}. Characters appearance: ${characterContext}. High consistency, 8k.`;
    
    setProject(prev => {
      if (!prev) return prev;
      const updated = [...prev.scenes];
      updated[idx].isGeneratingImage = true;
      return { ...prev, scenes: updated };
    });

    try {
      const imageUrl = await generateSceneImage(fullPrompt, imageSize);
      setProject(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[idx].imageUrl = imageUrl;
        updated[idx].isGeneratingImage = false;
        projectRef.current = { ...prev, scenes: updated };
        return projectRef.current;
      });
    } catch (err: any) {
      setProject(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[idx].isGeneratingImage = false;
        return { ...prev, scenes: updated };
      });
      setError(`Lỗi tạo ảnh: ${err.message}`);
    }
  };

  const processSceneAudio = async (idx: number) => {
    if (!projectRef.current) return;
    const scene = projectRef.current.scenes[idx];
    setProject(prev => {
      if (!prev) return prev;
      const updated = [...prev.scenes];
      updated[idx].isGeneratingAudio = true;
      return { ...prev, scenes: updated };
    });
    try {
      const audioBase64 = await generateSceneSpeech(scene.content, selectedVoice);
      setProject(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[idx].audioUrl = audioBase64;
        updated[idx].isGeneratingAudio = false;
        projectRef.current = { ...prev, scenes: updated };
        return projectRef.current;
      });
    } catch (err: any) {
      setProject(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[idx].isGeneratingAudio = false;
        return { ...prev, scenes: updated };
      });
      setError(`Lỗi tạo âm thanh: ${err.message}`);
    }
  };

  const handleAutoProcessAll = async () => {
    if (!project) return;
    setIsAutoProcessing(true);
    setError(null);
    try {
      // Generate thumbnail first if not exists
      if (!thumbnailUrl) await handleGenerateThumbnail();
      
      for (let i = 0; i < project.scenes.length; i++) {
        if (!projectRef.current?.scenes[i].imageUrl) await processSceneImage(i);
        if (!projectRef.current?.scenes[i].audioUrl) await processSceneAudio(i);
      }
    } catch (err: any) {
      setError(`Lỗi: ${err.message}`);
    } finally {
      setIsAutoProcessing(false);
    }
  };

  const handleExportZip = async () => {
    if (!project) return;
    try {
      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const safeTitle = project.title.replace(/[/\\?%*:|"<>]/g, '-');
      const rootFolder = zip.folder(safeTitle);
      const visualsFolder = rootFolder.folder("01_Visuals");
      const audioFolder = rootFolder.folder("02_Audio");

      let promptLog = `PROJECT: ${project.title}\nSTYLE: ${selectedStyle}\nVOICE: ${selectedVoice}\n\nSCENES LOG:\n\n`;

      // Add Thumbnail to zip
      if (thumbnailUrl) {
        const thumbData = thumbnailUrl.split(',')[1];
        rootFolder.file("00_Thumbnail.png", thumbData, {base64: true});
      }

      for (let idx = 0; idx < project.scenes.length; idx++) {
        const scene = project.scenes[idx];
        const sceneNumber = (idx + 1).toString().padStart(3, '0');
        const fileName = `Scene_${sceneNumber}`;

        promptLog += `--- ${fileName} ---\n`;
        promptLog += `CONTENT: ${scene.content}\n`;
        promptLog += `VISUAL PROMPT: ${scene.visualPrompt}\n\n`;

        if (scene.imageUrl) {
          const imgData = scene.imageUrl.split(',')[1];
          visualsFolder.file(`${fileName}.png`, imgData, {base64: true});
        }
        
        if (scene.audioUrl) {
          const pcmData = decodeBase64Audio(scene.audioUrl);
          const wavHeader = new ArrayBuffer(44);
          const view = new DataView(wavHeader);
          const writeString = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
          
          writeString(0, 'RIFF'); view.setUint32(4, 36 + pcmData.length, true);
          writeString(8, 'WAVE'); writeString(12, 'fmt '); view.setUint32(16, 16, true);
          view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true);
          view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
          writeString(36, 'data'); view.setUint32(40, pcmData.length, true);
          
          audioFolder.file(`${fileName}.wav`, new Blob([wavHeader, pcmData]));
        }
      }
      
      rootFolder.file("00_Prompts_And_Script.txt", promptLog);
      
      const content = await zip.generateAsync({type:"blob"});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${safeTitle}_Ready_To_Edit.zip`;
      link.click();
    } catch (err) { 
      setError("Lỗi xuất gói tài liệu."); 
    }
  };

  const isAllDone = project?.scenes.every(s => s.imageUrl && s.audioUrl) && thumbnailUrl;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 selection:bg-indigo-500/30 font-inter">
      <header className="bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-xl rotate-3">
              <span className="text-white font-black text-xl italic">S</span>
            </div>
            <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 uppercase tracking-widest">StoryBoard Pro</h1>
          </div>
          <button onClick={() => (window as any).aistudio?.openSelectKey()} className="text-[10px] font-black text-slate-500 hover:text-indigo-400 px-4 py-2 border border-white/5 rounded-xl transition-all uppercase">Config API</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {step === AppStep.INPUT && (
          <div className="bg-[#0f172a] rounded-[3rem] shadow-2xl border border-white/5 p-10 md:p-14 max-w-3xl mx-auto transition-all animate-in fade-in slide-in-from-bottom-10">
            <h2 className="text-5xl font-black mb-3 text-white tracking-tighter">Video Production</h2>
            <p className="text-slate-400 mb-12 font-medium text-lg">Giữ nguyên văn bản, lồng tiếng chuẩn và tải về file dựng phim.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Visual Style</label>
                <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value as any)} className="w-full p-5 bg-[#020617] border border-white/10 rounded-2xl text-white font-bold outline-none hover:border-indigo-500/50 transition-all appearance-none">
                  {styles.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Voiceover (Chọn giọng phù hợp)</label>
                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value as any)} className="w-full p-5 bg-[#020617] border border-white/10 rounded-2xl text-white font-bold outline-none hover:border-indigo-500/50 transition-all">
                  {voices.map(v => <option key={v.id} value={v.id}>{v.id} - {v.desc}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-4 mb-10">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Full Script Content</label>
              <textarea className="w-full h-80 p-8 bg-[#020617] border border-white/10 rounded-[2.5rem] text-slate-300 leading-relaxed font-medium text-lg outline-none focus:border-indigo-500/50 transition-all" placeholder="Nhập kịch bản tại đây... (Hệ thống sẽ tự động bỏ các phần trong ngoặc như [music], [tiếng cười]...)" value={script} onChange={(e) => setScript(e.target.value)} />
            </div>
            <button onClick={handleStartAnalysis} disabled={isLoading || !script.trim()} className="w-full py-6 rounded-[2rem] font-black text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-2xl transition-all active:scale-95 disabled:opacity-50">
              {isLoading ? "ANALYZING..." : "GENERATE ASSETS"}
            </button>
          </div>
        )}

        {step === AppStep.REVIEW && project && (
          <div className="space-y-12 animate-in fade-in">
            {/* Story Thumbnail Section */}
            <div className="bg-[#0f172a] rounded-[3.5rem] border border-white/5 shadow-2xl p-12 overflow-hidden">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Story Thumbnail</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Design a cover for your video</p>
                  </div>
               </div>
               <div className="flex flex-col md:flex-row gap-10 items-center">
                  <div className="w-full md:w-1/2 aspect-video bg-[#020617] rounded-[2.5rem] border border-white/5 relative overflow-hidden shadow-2xl group">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Thumbnail" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 uppercase font-black tracking-widest text-xs">No Thumbnail Generated</div>
                    )}
                    {isGeneratingThumbnail && (
                      <div className="absolute inset-0 bg-[#020617]/90 backdrop-blur-md flex items-center justify-center">
                        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-4">
                    <h4 className="text-xl font-bold text-white">{project.title}</h4>
                    <p className="text-slate-400 text-sm">Tạo một tấm ảnh bìa ấn tượng với các nhân vật chính và bối cảnh đặc trưng của câu chuyện.</p>
                    <button onClick={handleGenerateThumbnail} disabled={isGeneratingThumbnail} className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-purple-500/20 active:scale-95">
                      {isGeneratingThumbnail ? "Designing..." : (thumbnailUrl ? "Regenerate Thumbnail" : "Generate Cover Image")}
                    </button>
                  </div>
               </div>
            </div>

            {/* Global Character Consistency Editor */}
            <div className="bg-[#0f172a] rounded-[3.5rem] border border-white/5 shadow-2xl p-12">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center"><svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Consistency Center</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Confirm characters look before scene rendering</p>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {project.characters.map((char) => (
                    <div key={char.name} className="flex flex-col bg-[#020617] rounded-[2.5rem] border border-white/5 group hover:border-indigo-500/30 transition-all overflow-hidden shadow-xl">
                      <div className="aspect-square bg-slate-900/50 relative overflow-hidden flex items-center justify-center">
                        {char.imageUrl ? (
                          <img src={char.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        ) : (
                          <div className="text-slate-800 text-[10px] font-black uppercase tracking-[0.3em]">No Preview</div>
                        )}
                        {char.isGeneratingPreview && (
                          <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm flex items-center justify-center">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button onClick={() => generateCharacterPreview(char.name)} disabled={char.isGeneratingPreview} className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                      <div className="p-6">
                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">{char.name}</label>
                        <textarea value={char.description} onChange={(e) => updateCharacterDescription(char.name, e.target.value)} className="w-full h-24 bg-transparent text-slate-400 text-xs font-medium resize-none outline-none border-none focus:ring-0" />
                      </div>
                    </div>
                  ))}
               </div>
            </div>

            <div className="flex justify-between items-center bg-[#0f172a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
               <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Production Timeline</h2>
               <div className="flex gap-4">
                  <button onClick={handleAutoProcessAll} disabled={isAutoProcessing} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm transition-all hover:bg-indigo-700 disabled:opacity-50">
                    {isAutoProcessing ? "SYNCING..." : "RENDER PROJECT"}
                  </button>
                  {isAllDone && <button onClick={handleExportZip} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm transition-all hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">DOWNLOAD ASSETS (.ZIP)</button>}
               </div>
            </div>

            <div className="grid gap-16">
              {project.scenes.map((scene, idx) => (
                <div key={scene.id} className="relative group bg-[#0f172a] rounded-[4rem] border border-white/5 shadow-2xl overflow-hidden p-10 flex flex-col xl:flex-row gap-12 transition-all hover:border-white/10">
                  <div className="xl:w-[45%] flex flex-col gap-6">
                    <div className="aspect-video bg-[#020617] rounded-[2.5rem] overflow-hidden border border-white/5 relative group/img shadow-2xl">
                      {scene.imageUrl ? (
                        <>
                          <img src={scene.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" />
                          <button onClick={() => processSceneImage(idx)} disabled={scene.isGeneratingImage} className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all">
                             <div className="bg-indigo-600 p-5 rounded-3xl shadow-2xl transform scale-75 group-hover/img:scale-100 transition-all">
                                <svg className={`w-8 h-8 text-white ${scene.isGeneratingImage ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                             </div>
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                          {scene.isGeneratingImage ? <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div> : <button onClick={() => processSceneImage(idx)} className="px-8 py-4 border border-indigo-500/30 text-indigo-400 font-black uppercase text-xs rounded-2xl hover:bg-indigo-500/10">Render Frame</button>}
                        </div>
                      )}
                    </div>
                    <div className="bg-[#020617] p-6 rounded-[2rem] border border-white/5">
                      <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">Visual Prompt (Sử dụng cho ảnh)</label>
                      <textarea value={scene.visualPrompt} onChange={(e) => updateSceneVisualPrompt(idx, e.target.value)} className="w-full bg-transparent text-slate-400 text-xs font-medium leading-relaxed resize-none outline-none border-none focus:ring-0" rows={3} />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-between">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <span className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">Scene {(idx + 1).toString().padStart(2, '0')}</span>
                        <h3 className="text-2xl font-black text-white">{scene.title}</h3>
                      </div>
                      <div className="bg-[#020617] p-8 rounded-[2.5rem] border border-white/5 relative min-h-[140px]">
                        <p className="text-slate-200 text-xl font-medium leading-relaxed italic relative z-10">"{scene.content}"</p>
                      </div>
                    </div>

                    <div className="mt-10 flex items-center justify-between pt-8 border-t border-white/5">
                      <div className="flex items-center gap-6">
                        {scene.audioUrl ? (
                          <div className="flex items-center gap-4">
                            <button onClick={() => playAudio(scene.audioUrl!)} className="bg-indigo-600 hover:bg-indigo-500 text-white p-5 rounded-[1.5rem] shadow-xl shadow-indigo-500/20 active:scale-90 transition-all">
                               <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
                            </button>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Voice Preview</span>
                          </div>
                        ) : (
                          <button onClick={() => processSceneAudio(idx)} disabled={scene.isGeneratingAudio} className="bg-white/5 text-slate-400 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-white/10 transition-all">
                            {scene.isGeneratingAudio ? "Encoding WAV..." : "Render WAV Audio"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${scene.imageUrl && scene.audioUrl ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status: {scene.imageUrl && scene.audioUrl ? "Asset Ready" : "Staging"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {isLoading && (
        <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-xl z-[100] flex items-center justify-center text-center p-6">
          <div className="space-y-8 max-w-sm animate-in zoom-in">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Preparing Project</h3>
              <p className="text-slate-500 font-bold text-xs tracking-widest uppercase">Breaking script into detailed scenes & Removing technical notes...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
