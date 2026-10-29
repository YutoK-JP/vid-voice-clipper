import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { readFile, writeFile, mkdtemp, rm, access, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MediaEngine } from './media';
import { fileResponse } from './stream';
import { validateProject, validateClips } from '../src/model';
import type { Project, Media, Clip, AudioFormat } from '../src/types';

protocol.registerSchemesAsPrivileged([{scheme:'clip',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
let win: BrowserWindow; let dirty=false; let closing=false; let busy=false;
let current: Media | undefined; let tempRoot=''; let projectPath: string | undefined;
const allowed = new Map<string,string>();
const toolRoot=app.isPackaged ? path.join(process.resourcesPath,'tools') : path.join(app.getAppPath(),'resources/tools');
const engine = new MediaEngine({ffmpeg:path.join(toolRoot,'ffmpeg.exe'),ffprobe:path.join(toolRoot,'ffprobe.exe')});
function mediaURL(file: string) {const id=crypto.randomUUID();allowed.set(id,file);return `clip://media/${id}`;}
const filters=[{name:'動画・音声',extensions:['mp4','mov','mkv','webm','avi','m4v','mp3','wav','m4a','aac','flac','ogg','opus','wma']},{name:'すべてのファイル',extensions:['*']}];
async function chooseMedia() {const result=await dialog.showOpenDialog(win,{title:'動画・音声を選択',properties:['openFile'],filters});return result.canceled?null:result.filePaths[0];}
async function load(source: string) {
 const meta=await engine.probe(source);
 const peaks=await engine.waveform(source,meta.duration);
 let previewPath=source;
 // Some containers play only their supported audio without reporting a video error.
 // Convert known unsupported video/audio codecs before giving the file to Chromium.
 if(meta.hasVideo && (!['h264','vp8','vp9','av1','theora'].includes(meta.videoCodec) || !['aac','mp3','opus','vorbis','flac'].includes(meta.audioCodec))) {
  previewPath=path.join(tempRoot,`${crypto.randomUUID()}.mp4`);
  await engine.preview(source,previewPath,true);
 }
 const media:Media={path:source,name:path.basename(source),duration:meta.duration,hasVideo:meta.hasVideo,sampleRate:meta.sampleRate,channels:meta.channels,peaks,url:mediaURL(previewPath)};
 allowed.forEach((_,key)=>{if(!media.url.endsWith(key)) allowed.delete(key);});
 current=media; return media;
}
function handle(name: string, fn: (...args:any[])=>unknown) {
 ipcMain.handle(name,async(event,...args)=>{
  if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) throw new Error('操作を許可できません。');
  if(busy && name!=='cancel-export') throw new Error('処理が終わるまでお待ちください。');
  const exclusive=!['cancel-export','confirm-discard'].includes(name);
  if(exclusive) busy=true;
  try {return await fn(...args);} finally {if(exclusive) busy=false;}
 });
}
app.whenReady().then(async()=>{
 tempRoot=await mkdtemp(path.join(os.tmpdir(),'voice-clipper-'));
 protocol.handle('clip',request=>{
  const url=new URL(request.url);const file=url.hostname==='media'?allowed.get(url.pathname.slice(1)):undefined;
  return file ? fileResponse(file,request) : new Response('Not found',{status:404});
 });
 win=new BrowserWindow({width:1440,height:960,minWidth:1050,minHeight:760,backgroundColor:'#101215',title:'Voice Clipper',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.on('close',event=>{if(!closing && (dirty||busy)) {event.preventDefault();if(busy) {void dialog.showMessageBox(win,{type:'info',message:'処理中です。書き出しはキャンセルしてから終了してください。'});} else win.webContents.send('request-close');}});
 ipcMain.on('dirty',(event,value)=>{if(event.sender===win.webContents) dirty=!!value;});
 ipcMain.on('close-ready',event=>{if(event.sender===win.webContents&&!busy){closing=true;win.close();}});
 handle('open-media',async()=>{const source=await chooseMedia();if(!source)return null; const media=await load(source);projectPath=undefined;return media;});
 handle('fallback-preview',async()=>{
  if(!current) throw new Error('素材を読み込んでください。');
  const destination=path.join(tempRoot,`${crypto.randomUUID()}.mp4`);
  await engine.preview(current.path,destination,current.hasVideo);return mediaURL(destination);
 });
 handle('confirm-discard',async()=>{
  const result=await dialog.showMessageBox(win,{type:'question',message:'編集内容を保存しますか？',detail:'保存していない変更があります。',buttons:['保存','破棄','キャンセル'],defaultId:0,cancelId:2});
  return ['save','discard','cancel'][result.response];
 });
 handle('save-project',async(value: Project)=>{
  const p=validateProject(value);if(!current || p.sourcePath!==current.path)throw new Error('素材が一致しません。');
  p.clips=validateClips(p.clips,current.duration);
  let destination=projectPath;
  if(!destination) {const result=await dialog.showSaveDialog(win,{title:'編集データを保存',defaultPath:path.join(path.dirname(current.path),`${path.parse(current.name).name}.voiceclip.json`),filters:[{name:'Voice Clipper 編集データ',extensions:['json']}]});if(result.canceled||!result.filePath)return false;destination=result.filePath;}
  if(path.resolve(destination).toLowerCase()===path.resolve(current.path).toLowerCase())throw new Error('素材ファイルには保存できません。');
  const temporary=`${destination}.${crypto.randomUUID()}.tmp`;
  try {await writeFile(temporary,JSON.stringify(p,null,2),'utf8');await rename(temporary,destination);}finally{await rm(temporary,{force:true}).catch(()=>{});}
  projectPath=destination;dirty=false;return true;
 });
 handle('open-project',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'編集データを開く',properties:['openFile'],filters:[{name:'Voice Clipper 編集データ',extensions:['json']}]});
  if(result.canceled)return null;
  const p=validateProject(JSON.parse(await readFile(result.filePaths[0],'utf8')));
  try {await access(p.sourcePath);}catch{
   const choice=await dialog.showMessageBox(win,{type:'question',message:'元の素材が見つかりません。',detail:p.sourcePath,buttons:['素材を再指定','キャンセル'],cancelId:1});
   if(choice.response===1)return null; const replacement=await chooseMedia();if(!replacement)return null;p.sourcePath=replacement;
  }
  const meta=await engine.probe(p.sourcePath);validateClips(p.clips,meta.duration);
  const media=await load(p.sourcePath);projectPath=result.filePaths[0];return {project:p,media};
 });
 handle('export-clips',async(clips: Clip[],format: AudioFormat)=>{
  if(!current)throw new Error('素材を読み込んでください。');
  validateClips(clips,current.duration);
  if(format==='mp3' && (current.channels>2 || ![8000,11025,12000,16000,22050,24000,32000,44100,48000].includes(current.sampleRate)))throw new Error('この素材のチャンネル数・サンプルレートはMP3で維持できません。WAVを選択してください。');
  const result=await dialog.showOpenDialog(win,{title:'書き出し先フォルダー',properties:['openDirectory','createDirectory']});if(result.canceled)return null;
  return engine.export(current.path,current.duration,clips,format,result.filePaths[0],p=>win.webContents.send('export-progress',p));
 });
 handle('cancel-export',()=>engine.cancel());
 await win.loadFile(path.join(__dirname,'../dist/index.html'));
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{engine.cancel();if(tempRoot)void rm(tempRoot,{recursive:true,force:true}).catch(()=>{});});
