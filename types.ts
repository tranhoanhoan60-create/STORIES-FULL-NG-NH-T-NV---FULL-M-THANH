
export interface Character {
  name: string;
  description: string;
  voice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr' | 'Aoede';
  imageUrl?: string;
  isGeneratingPreview?: boolean;
}

export type VisualStyle = 'Cinematic' | 'Anime' | 'Realistic' | '3D Render' | '3D Pixar' | 'Cyberpunk' | 'Oil Painting';

export interface Scene {
  id: string;
  title: string;
  content: string;
  visualPrompt: string;
  charactersInScene: string[];
  imageUrl?: string;
  audioUrl?: string;
  isGeneratingImage?: boolean;
  isGeneratingAudio?: boolean;
}

export interface StoryProject {
  title: string;
  originalScript: string;
  characters: Character[];
  scenes: Scene[];
  style?: VisualStyle;
}

export enum AppStep {
  INPUT = 'INPUT',
  PROCESS = 'PROCESS',
  REVIEW = 'REVIEW'
}
