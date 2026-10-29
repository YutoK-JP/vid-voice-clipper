import { spawn, type ChildProcess } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { safeName, validateClips } from '../src/model';
import type { Clip, AudioFormat, Progress } from '../src/types';

export interface Tools { ffmpeg: string; ffprobe: string }
export class MediaEngine {
 active?: ChildProcess;
 cancelled = false;
 constructor(public tools: Tools) {}
 async run(exe: string, args: string[], onData?: (data: Buffer) => void): Promise<string> {
  return new Promise((resolve,reject) => {
   const proc = spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
   this.active = proc;
   let output = ''; let error = '';
   proc.stdout!.on('data',(b: Buffer) => { if(onData) onData(b); else output += b.toString(); });
   proc.stderr!.on('data',(b: Buffer) => { error = (error+b.toString()).slice(-6000); });
   proc.once('error',reject);
   proc.once('close',code => { if(this.active===proc) this.active=undefined; code===0 ? resolve(output) : reject(new Error(this.cancelled ? 'キャンセルしました。' : `音声処理に失敗しました。\n${error.slice(-1500)}`)); });
  });
 }
 cancel() { this.cancelled=true; this.active?.kill(); }
 async probe(source: string) {
  const data = JSON.parse(await this.run(this.tools.ffprobe,['-v','error','-show_format','-show_streams','-of','json',source]));
  const audio = data.streams.find((s: {codec_type:string}) => s.codec_type==='audio');
  const video = data.streams.find((s: {codec_type:string; disposition?:{attached_pic:number}}) => s.codec_type==='video' && !s.disposition?.attached_pic);
  const duration = Number(data.format.duration || audio?.duration);
  if(!audio) throw new Error('このファイルには音声トラックがありません。');
  if(!Number.isFinite(duration) || duration<=0) throw new Error('素材の長さを取得できません。');
  return {duration,hasVideo:!!video,sampleRate:Number(audio.sample_rate),channels:Number(audio.channels),audioCodec:audio.codec_name,videoCodec:video?.codec_name};
 }
 async waveform(source: string, duration: number) {
  // Stream low-rate PCM into fixed-size bins; memory usage does not grow with source length.
  const bins = Math.min(30000,Math.max(1000,Math.ceil(duration*50)));
  const peaks = new Array<number>(bins).fill(0);
  const rate = 4000; let index=0; let carry: Buffer = Buffer.alloc(0);
  await this.run(this.tools.ffmpeg,['-v','error','-i',source,'-map','0:a:0','-vn','-ac','1','-ar',String(rate),'-f','s16le','pipe:1'],chunk=>{
   const data = carry.length ? Buffer.concat([carry,chunk]) : chunk;
   for(let i=0;i+1<data.length;i+=2,index++) { const bin=Math.min(bins-1,Math.floor(index/rate/duration*bins)); peaks[bin]=Math.max(peaks[bin],Math.abs(data.readInt16LE(i)/32768)); }
   carry = data.length%2 ? Buffer.from(data.subarray(-1)) : Buffer.alloc(0);
  });
  return peaks;
 }
 async preview(source: string, destination: string, hasVideo: boolean) {
  await this.run(this.tools.ffmpeg,['-v','error','-i',source,...(hasVideo ? ['-map','0:V:0','-map','0:a:0','-vf','scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p'] : ['-map','0:a:0','-vn']),'-c:a','aac','-ac','2','-b:a','160k','-movflags','+faststart','-y',destination]);
 }
 async export(source: string, duration: number, clips: Clip[], format: AudioFormat, folder: string, progress: (p: Progress)=>void) {
  if(format!=='mp3' && format!=='wav') throw new Error('音声形式が正しくありません。');
  const sorted = validateClips(clips,duration).sort((a,b)=>a.start-b.start);
  if(!sorted.length) throw new Error('切り抜く範囲を追加してください。');
  this.cancelled=false; const files:string[]=[];
  const totalDuration=sorted.reduce((sum,c)=>sum+c.end-c.start,0); let doneDuration=0;
  for(let i=0;i<sorted.length;i++) {
   if(this.cancelled) break;
   const c=sorted[i]; const base=`${String(i+1).padStart(3,'0')}_${safeName(c.name)}`;
   let destination='';
   // Reserve the name atomically, preserving existing exports even across concurrent apps.
   for(let suffix=0;;suffix++) {
    destination=path.join(folder,`${base}${suffix ? `_${suffix+1}` : ''}.${format}`);
    try {const handle=await open(destination,'wx'); await handle.close(); break;} catch(e) {if((e as NodeJS.ErrnoException).code!=='EEXIST') throw e;}
   }
   const partial=path.join(folder,`.voiceclipper-${process.pid}-${crypto.randomUUID()}.tmp`);
   try {
    // Explicit output format makes the temporary extension independent of the codec.
    let line='';
    progress({completed:i,total:sorted.length,fraction:doneDuration/totalDuration,name:c.name});
    await this.run(this.tools.ffmpeg,['-v','error','-ss',c.start.toFixed(3),'-i',source,'-t',(c.end-c.start).toFixed(3),'-map','0:a:0','-vn','-c:a',format==='mp3'?'libmp3lame':'pcm_s16le',...(format==='mp3'?['-b:a','192k']:[]),'-progress','pipe:1','-nostats','-f',format==='mp3'?'mp3':'wav','-n',partial],b=>{
     line+=b.toString(); const lines=line.split('\n'); line=lines.pop() || '';
     for(const item of lines) if(item.startsWith('out_time_us=')) {const seconds=Number(item.split('=')[1])/1e6; progress({completed:i,total:sorted.length,fraction:Math.min(1,(doneDuration+Math.min(seconds,c.end-c.start))/totalDuration),name:c.name});}
    });
    if(this.cancelled) throw new Error('キャンセルしました。');
    // Copy into our exclusively reserved destination rather than overwriting another file.
    const { copyFile } = await import('node:fs/promises');
    await copyFile(partial,destination); files.push(destination); doneDuration+=c.end-c.start;
    progress({completed:i+1,total:sorted.length,fraction:doneDuration/totalDuration,name:c.name});
   } catch(e) {
    await unlink(destination).catch(()=>{});
    if(!this.cancelled) throw e;
   } finally { await unlink(partial).catch(()=>{}); }
  }
  return {cancelled:this.cancelled,files,folder};
 }
}
