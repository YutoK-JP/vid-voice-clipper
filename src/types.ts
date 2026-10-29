export interface Clip { id: string; name: string; start: number; end: number }
export type AudioFormat = 'mp3' | 'wav';
export interface Project { version: 1; sourcePath: string; clips: Clip[]; format: AudioFormat }
export interface Media { path: string; name: string; duration: number; hasVideo: boolean; sampleRate: number; channels: number; peaks: number[]; url: string }
export interface Progress { completed: number; total: number; fraction: number; name: string }
export interface Bridge {
 openMedia(): Promise<Media | null>;
 fallbackPreview(): Promise<string>;
 saveProject(project: Project): Promise<boolean>;
 openProject(): Promise<{project: Project; media: Media} | null>;
 exportClips(clips: Clip[], format: AudioFormat): Promise<{cancelled: boolean; files: string[]; folder?: string} | null>;
 cancelExport(): Promise<void>;
 confirmDiscard(): Promise<'save'|'discard'|'cancel'>;
 setDirty(dirty: boolean): void;
 closeReady(): void;
 onClose(fn: () => void): () => void;
 onProgress(fn: (progress: Progress) => void): () => void;
}
declare global { interface Window { clipper: Bridge } }
