import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../src/types';
const bridge: Bridge = {
 openMedia:()=>ipcRenderer.invoke('open-media'),
 fallbackPreview:()=>ipcRenderer.invoke('fallback-preview'),
 saveProject:p=>ipcRenderer.invoke('save-project',p),
 openProject:()=>ipcRenderer.invoke('open-project'),
 exportClips:(clips,format)=>ipcRenderer.invoke('export-clips',clips,format),
 cancelExport:()=>ipcRenderer.invoke('cancel-export'),
 confirmDiscard:()=>ipcRenderer.invoke('confirm-discard'),
 setDirty:dirty=>ipcRenderer.send('dirty',dirty),
 closeReady:()=>ipcRenderer.send('close-ready'),
 onClose:fn=>{const listener=()=>fn();ipcRenderer.on('request-close',listener);return()=>ipcRenderer.removeListener('request-close',listener);},
 onProgress:fn=>{const listener=(_:unknown,p:Parameters<typeof fn>[0])=>fn(p);ipcRenderer.on('export-progress',listener);return()=>ipcRenderer.removeListener('export-progress',listener);}
};
contextBridge.exposeInMainWorld('clipper',bridge);
