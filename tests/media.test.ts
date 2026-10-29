import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MediaEngine } from '../electron/media';
import { validateClips, validateProject, safeName, time } from '../src/model';
import { fileResponse } from '../electron/stream';
let root:string;let source:string;let video:string;
const engine=new MediaEngine({ffmpeg:path.resolve('resources/tools/ffmpeg.exe'),ffprobe:path.resolve('resources/tools/ffprobe.exe')});
before(async()=>{
 root=await mkdtemp(path.join(os.tmpdir(),'voiceclip-test-'));source=path.join(root,'日本語 音声.wav');video=path.join(root,'映像.mp4');
 await engine.run(engine.tools.ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:duration=2:sample_rate=48000','-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[a]','-ac','2',source]);
 await engine.run(engine.tools.ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=25:d=3','-i',source,'-map','0:v','-map','1:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video]);
});
after(async()=>{await rm(root,{recursive:true,force:true});});
test('probe and bounded waveform for Japanese paths and video',async()=>{
 const m=await engine.probe(source);assert.equal(m.sampleRate,48000);assert.equal(m.channels,2);assert.equal(m.hasVideo,false);assert.equal(m.duration,3);
 assert.equal((await engine.probe(video)).hasVideo,true);
 const peaks=await engine.waveform(source,3);assert.equal(peaks.length,1000);assert.ok(Math.max(...peaks)>.05);
});
test('WAV export order, collisions, timing, channels and actual selected sound',async()=>{
 const clips=[{id:'b',name:'後半',start:1.2,end:2.1},{id:'a',name:'先頭',start:0.1,end:.6}];
 const result=await engine.export(source,3,clips,'wav',root,()=>{});assert.equal(result.files.length,2);assert.match(path.basename(result.files[0]),/^001_先頭/);
 const p=await engine.probe(result.files[1]);assert.ok(Math.abs(p.duration-.9)<.002);assert.equal(p.sampleRate,48000);assert.equal(p.channels,2);
 let pcm=Buffer.alloc(0);await engine.run(engine.tools.ffmpeg,['-v','error','-i',result.files[1],'-ac','1','-f','s16le','pipe:1'],b=>{pcm=Buffer.concat([pcm,b]);});
 let crossings=0;for(let i=2;i<pcm.length;i+=2)if(pcm.readInt16LE(i-2)<=0&&pcm.readInt16LE(i)>0)crossings++;
 assert.ok(Math.abs(crossings/p.duration-880)<4,'clip must contain the second tone');
 const duplicate=await engine.export(source,3,clips,'wav',root,()=>{});assert.notEqual(duplicate.files[0],result.files[0]);assert.match(duplicate.files[0],/_2.wav$/);
});
test('MP3 export from video',async()=>{
 const result=await engine.export(video,3,[{id:'x',name:'映像の音声',start:.25,end:1.25}],'mp3',root,()=>{});
 const p=await engine.probe(result.files[0]);assert.equal(p.hasVideo,false);assert.equal(p.audioCodec,'mp3');assert.ok(Math.abs(p.duration-1)<.06);assert.equal(p.sampleRate,48000);assert.equal(p.channels,2);
});
test('fallback preview conversion',async()=>{
 const destination=path.join(root,'preview.mp4');await engine.preview(video,destination,true);const p=await engine.probe(destination);assert.equal(p.videoCodec,'h264');assert.equal(p.audioCodec,'aac');
});
test('invalid ranges and project versions are rejected',()=>{
 for(const c of [{id:'a',name:'bad',start:1,end:1},{id:'a',name:'bad',start:-1,end:2},{id:'a',name:'bad',start:0,end:4}]) assert.throws(()=>validateClips([c],3));
 const project={version:1,sourcePath:source,clips:[{id:'a',name:'範囲',start:0,end:1}],format:'wav'};
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))),project);assert.throws(()=>validateProject({...project,version:2}));
 assert.equal(time(59.9996),'00:01:00.000');assert.equal(safeName('a/b:c?'),'a_b_c_');
});
test('corrupt media and silent video show meaningful errors',async()=>{
 const bad=path.join(root,'bad.mp4');await writeFile(bad,'not media');await assert.rejects(engine.probe(bad),/音声処理/);
 const silent=path.join(root,'silent.mp4');await engine.run(engine.tools.ffmpeg,['-v','error','-f','lavfi','-i','color=s=160x90:d=0.1','-an',silent]);await assert.rejects(engine.probe(silent),/音声トラック/);
});
test('cancel removes incomplete output and keeps completed files',async()=>{
 const folder=path.join(root,'cancel');await mkdir(folder);
 const result=await engine.export(source,3,[{id:'1',name:'cancel',start:0,end:3}],'wav',folder,p=>{if(p.completed===0&&p.fraction>0)engine.cancel();});
 assert.equal(result.cancelled,true);assert.equal(result.files.length,0);assert.deepEqual(await readdir(folder),[]);
});
test('unwritable destination fails without altering the source',async()=>{
 const before=await readFile(source);await assert.rejects(engine.export(source,3,[{id:'a',name:'bad',start:0,end:1}],'wav',source,()=>{}));assert.deepEqual(await readFile(source),before);
});
test('media streaming supports byte ranges, suffixes and rejects invalid requests',async()=>{
 const original=await readFile(video);
 const response=await fileResponse(video,new Request('https://media/test',{headers:{Range:'bytes=10-29'}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('content-length'),'20');assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(10,30));
 const suffix=await fileResponse(video,new Request('https://media/test',{headers:{Range:'bytes=-12'}}));assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),original.subarray(-12));
 assert.equal((await fileResponse(video,new Request('https://media/test',{headers:{Range:'bytes=999999999-'}}))).status,416);
});
