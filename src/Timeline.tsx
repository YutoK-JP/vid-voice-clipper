import { memo, useEffect, useRef, useState } from 'react';
import type { Clip, Media } from './types';
import { time } from './model';
export const colors=['#b5e56b','#80bfff','#dfacff','#ffbd80','#72dfcd'];
interface Props {media:Media; clips:Clip[]; selected:string; position:number; zoom:number; disabled:boolean; onSeek:(n:number)=>void; onAdd:(start:number,end:number)=>void; onSelect:(id:string)=>void; onChange:(id:string,patch:Partial<Clip>)=>void}
const Waveform=memo(function Waveform({peaks,width}:{peaks:number[];width:number}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!;const ctx=canvas.getContext('2d')!;const w=Math.min(24000,Math.round(width));canvas.width=w;canvas.height=150;
  ctx.clearRect(0,0,w,150);ctx.fillStyle='#a9d784';
  for(let x=0;x<w;x+=2){const start=Math.floor(x/w*peaks.length);const end=Math.max(start+1,Math.floor((x+2)/w*peaks.length));let peak=0;for(let i=start;i<end;i++)peak=Math.max(peak,peaks[i]||0);const h=Math.max(1,peak*120);ctx.fillRect(x,75-h/2,1.3,h);}
 },[peaks,width]);
 return <canvas ref={ref} className="wave-canvas" style={{width}} aria-label="音声波形"/>;
});
export function Timeline({media,clips,selected,position,zoom,disabled,onSeek,onAdd,onSelect,onChange}:Props){
 const viewport=useRef<HTMLDivElement>(null);const content=useRef<HTMLDivElement>(null);const [base,setBase]=useState(900);const [draft,setDraft]=useState<{start:number;end:number}|null>(null);
 const drag=useRef<{type:'new'|'start'|'end';anchor:number;id?:string;clip?:Clip}|null>(null);
 useEffect(()=>{const observer=new ResizeObserver(entries=>setBase(entries[0].contentRect.width));observer.observe(viewport.current!);return()=>observer.disconnect();},[]);
 const width=base*zoom;const scale=width/media.duration;
 const coordinate=(clientX:number)=>Math.max(0,Math.min(media.duration,(clientX-content.current!.getBoundingClientRect().left)/scale));
 const ticks=Array.from({length:Math.max(2,Math.ceil(zoom*8)+1)},(_,i)=>i*media.duration/Math.ceil(zoom*8));
 return <div className="timeline-scroll" ref={viewport}>
  <div ref={content} className="timeline-content" style={{width,height:Math.max(234,166+clips.length*30)}}
   onPointerMove={e=>{if(!drag.current)return;const t=coordinate(e.clientX);const d=drag.current;if(d.type==='new')setDraft({start:Math.min(d.anchor,t),end:Math.max(d.anchor,t)});else if(d.clip)onChange(d.id!,d.type==='start'?{start:Math.min(t,d.clip.end-.001)}:{end:Math.max(t,d.clip.start+.001)});}}
   onPointerUp={e=>{const d=drag.current;if(!d)return;drag.current=null;if(d.type==='new'){const t=coordinate(e.clientX);if(Math.abs(t-d.anchor)*scale<4)onSeek(t);else if(Math.abs(t-d.anchor)>=.001)onAdd(Math.min(d.anchor,t),Math.max(d.anchor,t));}setDraft(null);}}
   onPointerCancel={()=>{drag.current=null;setDraft(null);}}>
   <div className="ruler">{ticks.map((t,i)=><span key={i} style={{left:t*scale}}>{time(t)}</span>)}</div>
   <div className="wave-hit" data-testid="waveform" onPointerDown={e=>{if(disabled||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const t=coordinate(e.clientX);drag.current={type:'new',anchor:t};setDraft({start:t,end:t});}}>
    <Waveform peaks={media.peaks} width={width}/>
    <div className="wave-midline"/>
    {draft&&<div className="draft" style={{left:draft.start*scale,width:(draft.end-draft.start)*scale}}/>}
   </div>
   {clips.map((clip,i)=><div className={`clip-region ${selected===clip.id?'selected':''}`} key={clip.id} style={{left:clip.start*scale,width:Math.max(3,(clip.end-clip.start)*scale),top:160+i*30,'--clip-color':colors[i%colors.length]} as React.CSSProperties} onClick={()=>onSelect(clip.id)}>
    <button aria-label={`${clip.name} 開始位置を調整`} className="handle start" disabled={disabled} onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);onSelect(clip.id);drag.current={type:'start',anchor:clip.start,id:clip.id,clip};}}/>
    <span>{String(i+1).padStart(2,'0')} · {clip.name}</span>
    <button aria-label={`${clip.name} 終了位置を調整`} className="handle end" disabled={disabled} onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);onSelect(clip.id);drag.current={type:'end',anchor:clip.end,id:clip.id,clip};}}/>
   </div>)}
   <div className="playhead" style={{left:position*scale}}><span/></div>
  </div>
 </div>;
}
