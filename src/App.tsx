import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, FolderOpen, Save, Download, Play, Pause, Scissors, Plus, Trash2, SkipBack, ZoomIn, ZoomOut, FileAudio, X, Check, LoaderCircle } from 'lucide-react';
import type { Clip, Media, Project, AudioFormat, Progress } from './types';
import { time } from './model';
import { Timeline, colors } from './Timeline';

export default function App(){
 const [media,setMedia]=useState<Media|null>(null);const [clips,setClips]=useState<Clip[]>([]);const [format,setFormat]=useState<AudioFormat>('mp3');
 const [selected,setSelected]=useState('');const [position,setPosition]=useState(0);const [playing,setPlaying]=useState(false);const [zoom,setZoom]=useState(1);
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [progress,setProgress]=useState<Progress|null>(null);
 const [saved,setSaved]=useState('');const player=useRef<HTMLVideoElement>(null);const stopAt=useRef<number|null>(null);const fallback=useRef(false);
 const project:Project|null=media?{version:1,sourcePath:media.path,clips,format}:null;
 const snapshot=project?JSON.stringify(project):'';const dirty=snapshot!==saved;
 const chosen=clips.find(c=>c.id===selected);
 useEffect(()=>{window.clipper.setDirty(dirty);},[dirty]);
 useEffect(()=>window.clipper.onProgress(setProgress),[]);
 const save=useCallback(async()=>{if(!project)return false;const ok=await window.clipper.saveProject(project);if(ok){setSaved(snapshot);setMessage('編集データを保存しました。');}return ok;},[snapshot]);
 const discard=async()=>{if(!dirty)return true;const answer=await window.clipper.confirmDiscard();if(answer==='cancel')return false;if(answer==='save')return save();return true;};
 useEffect(()=>window.clipper.onClose(()=>{void (async()=>{try{if(await discard())window.clipper.closeReady();}catch(e){setError(String(e));}})();}),[dirty,snapshot]);
 const act=async(label:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(label);setError('');setMessage('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy('');setProgress(null);}};
 const install=(m:Media,c:Clip[],f:AudioFormat)=>{setMedia(m);setClips(c);setFormat(f);setSelected(c[0]?.id||'');setPosition(0);setZoom(1);setPlaying(false);fallback.current=false;stopAt.current=null;setSaved(JSON.stringify({version:1,sourcePath:m.path,clips:c,format:f}));};
 const open=()=>act('素材を読み込み、波形を作成しています…',async()=>{if(!await discard())return;const m=await window.clipper.openMedia();if(m)install(m,[],'mp3');});
 const openProject=()=>act('編集データを読み込んでいます…',async()=>{if(!await discard())return;const result=await window.clipper.openProject();if(result)install(result.media,result.project.clips,result.project.format);});
 const change=(id:string,patch:Partial<Clip>)=>setClips(list=>list.map(c=>c.id===id?{...c,...patch}:c));
 const add=(start:number,end:number)=>{const c={id:crypto.randomUUID(),name:`クリップ ${clips.length+1}`,start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000};if(c.end<=c.start)return;setClips(list=>[...list,c]);setSelected(c.id);};
 const seek=(t:number)=>{if(player.current){player.current.currentTime=t;setPosition(t);stopAt.current=null;}};
 const toggle=()=>{const p=player.current;if(!p||!media||busy)return;stopAt.current=null;if(p.paused){void p.play().catch(e=>setError(String(e)));}else p.pause();};
 const preview=(c:Clip)=>{const p=player.current;if(!p)return;p.currentTime=c.start;setPosition(c.start);stopAt.current=c.end;void p.play().catch(e=>setError(String(e)));};
 const remove=()=>{if(!selected)return;setClips(list=>list.filter(c=>c.id!==selected));setSelected('');};
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(busy||e.ctrlKey||e.metaKey||e.altKey||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.code==='Delete'){e.preventDefault();remove();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[busy,media,selected]);
 useEffect(()=>{if(!playing)return;let frame:number;const tick=()=>{const p=player.current;if(p){if(stopAt.current!==null&&p.currentTime>=stopAt.current){p.pause();p.currentTime=stopAt.current;stopAt.current=null;}setPosition(p.currentTime);}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing]);
 const exportAudio=()=>act('音声を書き出しています…',async()=>{player.current?.pause();const result=await window.clipper.exportClips(clips,format);if(result)setMessage(`${result.cancelled?'キャンセルしました。':''}${result.files.length} 件の音声を書き出しました。${result.folder?` 保存先: ${result.folder}`:''}`);});
 const recoverPreview=()=>{if(busy)return;if(fallback.current){setError('プレビューを再生できませんでした。音声の切り抜き・書き出しは元の素材から実行できます。');return;}fallback.current=true;void act('プレビュー用に変換しています…',async()=>{const url=await window.clipper.fallbackPreview();setMedia(m=>m?{...m,url}:m);});};
 return <div className="app-shell">
  <header className="app-header"><div className="brand"><div className="brand-icon"><AudioLines size={22}/></div><div>Voice Clipper<span>AUDIO EXTRACTION STUDIO</span></div></div><div className="header-actions"><button disabled={!!busy} onClick={open}><FolderOpen size={16}/>素材を開く</button><button disabled={!!busy} onClick={openProject}>編集データを開く</button><button disabled={!media||!!busy} onClick={()=>act('保存しています…',async()=>{await save();})}><Save size={16}/>保存{dirty?' •':''}</button><button className="primary" disabled={!clips.length||!!busy} onClick={exportAudio}><Download size={16}/>音声を書き出す</button></div></header>
  <main><div className="workspace-heading"><div><div className="eyebrow">YOUR SOUND, IN FOCUS</div><h1>必要な音だけ、切り抜こう。</h1></div><span className="local-badge"><span/>ローカルで処理</span></div>
   <div className="editor-grid"><section className="preview-panel panel"><div className="panel-heading"><span>プレビュー</span><span className="muted">{media?(media.hasVideo?'VIDEO / AUDIO':'AUDIO'):'NO SOURCE'}</span></div>
    <div className={`preview-stage ${media?.hasVideo?'has-video':''}`}>
     {media?<><video ref={player} src={media.url} className={media.hasVideo?'':'audio-player'} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);stopAt.current=null;}} onTimeUpdate={()=>setPosition(player.current?.currentTime||0)} onError={recoverPreview} preload="auto"/>{!media.hasVideo&&<div className="audio-info"><div className="audio-icon"><AudioLines size={44}/></div><h2>{media.name}</h2><p>{media.sampleRate.toLocaleString()} Hz · {media.channels} ch · {time(media.duration)}</p></div>}</>:<div className="empty-source"><div className="empty-symbol"><Scissors size={36}/></div><h2>音声の切り抜きを、もっと手軽に。</h2><p>動画や音声を開いて、波形から好きな範囲を選択。</p><button className="primary" onClick={open} disabled={!!busy}><Plus size={16}/>素材を選択</button><small>MP4 / MOV / MKV / MP3 / WAV / FLAC ほか</small></div>}
     {media&&<div className="source-label"><FileAudio size={14}/><span title={media.path}>{media.name}</span></div>}
    </div>
    <div className="transport"><div className="transport-buttons"><button className="icon-button" aria-label="先頭へ" disabled={!media||!!busy} onClick={()=>seek(0)}><SkipBack size={17}/></button><button className="play-button" aria-label={playing?'停止':'再生'} disabled={!media||!!busy} onClick={toggle}>{playing?<Pause size={19}/>:<Play size={19}/>}</button><span className="time-display">{time(position)}<em>/ {time(media?.duration||0)}</em></span></div><kbd>Space</kbd></div>
   </section>
   <aside className="clips-panel panel"><div className="panel-heading"><span>切り抜き範囲 <b className="count">{clips.length}</b></span><Scissors size={16}/></div><div className="clip-list">
    {!clips.length?<div className="empty-clips"><div className="mini-timeline"><i/><i/><i/></div><h3>最初の範囲を選びましょう</h3><p>波形上をドラッグすると、<br/>切り抜き範囲を追加できます。</p></div>:clips.map((c,i)=><div key={c.id} className={`clip-card ${selected===c.id?'active':''}`} onClick={()=>setSelected(c.id)} style={{'--clip-color':colors[i%colors.length]} as React.CSSProperties}>
     <div className="clip-title"><span className="clip-number">{String(i+1).padStart(2,'0')}</span><input aria-label={`範囲 ${i+1} の名前`} value={c.name} disabled={!!busy} onChange={e=>change(c.id,{name:e.target.value})} maxLength={120}/><button className="icon-button" aria-label={`${c.name} を削除`} disabled={!!busy} onClick={e=>{e.stopPropagation();setClips(list=>list.filter(x=>x.id!==c.id));if(selected===c.id)setSelected('');}}><Trash2 size={14}/></button></div>
     <div className="clip-times"><TimeField label="開始" value={c.start} max={c.end-.001} disabled={!!busy} onChange={v=>change(c.id,{start:v})}/><span>→</span><TimeField label="終了" value={c.end} min={c.start+.001} max={media!.duration} disabled={!!busy} onChange={v=>change(c.id,{end:v})}/></div>
     <div className="clip-footer"><span>{(c.end-c.start).toFixed(3)} 秒</span><button disabled={!!busy} onClick={()=>preview(c)}><Play size={12}/>試聴</button></div>
    </div>)}
   </div><div className="export-settings"><label>書き出し形式<select aria-label="書き出し形式" disabled={!!busy} value={format} onChange={e=>setFormat(e.target.value as AudioFormat)}><option value="mp3">MP3 · 192 kbps</option><option value="wav">WAV · 16bit PCM</option></select></label><p>範囲ごとに別ファイルで保存します。</p></div></aside></div>
   <section className="timeline-panel panel"><div className="panel-heading"><div className="timeline-title"><AudioLines size={17}/><span>タイムライン</span><span className="muted">ドラッグして範囲を追加</span></div><div className="zoom-controls"><button className="icon-button" aria-label="縮小" disabled={!media||zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z/2))}><ZoomOut size={16}/></button><input aria-label="タイムラインの拡大率" type="range" min="0" max="5" step="0.1" value={Math.log2(zoom)} disabled={!media} onChange={e=>setZoom(2**Number(e.target.value))}/><button className="icon-button" aria-label="拡大" disabled={!media||zoom>=32} onClick={()=>setZoom(z=>Math.min(32,z*2))}><ZoomIn size={16}/></button><span>{zoom.toFixed(1)}×</span></div></div>
    {media?<Timeline media={media} clips={clips} selected={selected} position={position} zoom={zoom} disabled={!!busy} onSeek={seek} onAdd={add} onSelect={setSelected} onChange={change}/>:<div className="timeline-empty"><AudioLines size={28}/><p>素材を読み込むと、ここに音声の波形が表示されます</p></div>}
    <div className="timeline-bottom"><span>{media?`${time(media.duration)} · ${media.sampleRate.toLocaleString()} Hz · ${media.channels} ch`:'音声をアップロードせず、このPCで編集できます'}</span><div><button disabled={!media||!!busy} onClick={()=>{const start=Math.min(position,Math.max(0,(media?.duration||0)-.001));add(start,Math.min(media!.duration,start+5));}}><Plus size={13}/>現在位置に範囲を追加</button><button disabled={!chosen||!!busy} onClick={remove}><Trash2 size={13}/>削除</button></div></div>
   </section>
   {busy&&<div className="status busy" role="status"><LoaderCircle className="spinner" size={16}/><div>{busy}{progress&&<><span> {progress.completed} / {progress.total} 件 · {Math.round(progress.fraction*100)}%</span><progress max="1" value={progress.fraction}/></>}</div>{progress&&<button onClick={()=>void window.clipper.cancelExport()}>キャンセル</button>}</div>}
   {error&&<div className="status error" role="alert"><span>{error}</span><button aria-label="エラーを閉じる" onClick={()=>setError('')}><X size={16}/></button></div>}
   {message&&<div className="status success" role="status"><Check size={16}/><span>{message}</span></div>}
  </main><footer className="app-footer"><span>VOICE CLIPPER <b>1.0</b></span><span>範囲を選ぶ。試聴する。音声を書き出す。</span></footer>
 </div>;
}
function TimeField({label,value,min=0,max,disabled,onChange}:{label:string;value:number;min?:number;max:number;disabled:boolean;onChange:(n:number)=>void}){
 const [text,setText]=useState(value.toFixed(3));useEffect(()=>setText(value.toFixed(3)),[value]);
 const commit=()=>{const n=Number(text);if(text.trim()&&Number.isFinite(n)&&n>=min&&n<=max)onChange(Math.round(n*1000)/1000);else setText(value.toFixed(3));};
 return <label>{label}<input aria-label={`${label}時刻（秒）`} type="number" min={min} max={max} step="0.001" value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}
