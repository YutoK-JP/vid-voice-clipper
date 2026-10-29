import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
const mime:Record<string,string>={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac','.ogg':'audio/ogg','.opus':'audio/ogg'};
// Chromium requires explicit byte-range responses to seek on a custom scheme.
export async function fileResponse(file:string,request:Request):Promise<Response>{
 try{
  const {size}=await stat(file);let start=0;let end=size-1;let status=200;
  const headers:Record<string,string>={'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes'};
  const range=request.headers.get('range');
  if(range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
   if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
   else start=Math.max(0,size-Number(match[2]));
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length']=String(Math.max(0,end-start+1));
  if(request.method==='HEAD'||size===0)return new Response(null,{status,headers});
  if(request.method!=='GET')return new Response(null,{status:405});
  const stream=Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream<Uint8Array>;
  return new Response(stream,{status,headers});
 }catch{return new Response('Not found',{status:404});}
}
