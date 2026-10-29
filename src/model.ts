import type { Clip, Project } from './types';
export function validateClips(value: unknown, duration: number): Clip[] {
 if (!Array.isArray(value) || value.length > 10000) throw new Error('範囲一覧が正しくありません。');
 const ids = new Set<string>();
 return value.map(c => {
  if (!c || typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.name !== 'string' || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end > duration + 0.001 || c.end <= c.start) throw new Error('範囲の開始・終了時刻が正しくありません。');
  ids.add(c.id); return {id:c.id,name:c.name.slice(0,120),start:c.start,end:Math.min(c.end,duration)};
 });
}
export function validateProject(value: unknown): Project {
 const p = value as Project;
 if (!p || p.version !== 1 || typeof p.sourcePath !== 'string' || !p.sourcePath || !['mp3','wav'].includes(p.format)) throw new Error('対応していない編集データです。');
 return {...p, clips: validateClips(p.clips, Number.MAX_VALUE)};
}
export function safeName(name: string): string { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,90) || 'clip'; }
export function time(value: number): string {
 const ms = Math.round(Math.max(0,value)*1000);
 return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
}
