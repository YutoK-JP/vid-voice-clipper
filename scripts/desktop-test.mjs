import { _electron as electron } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('test-results');await mkdir(root,{recursive:true});
const source=path.join(root,'日本語 テスト映像.mp4');const project=path.join(root,'編集.voiceclip.json');const output=path.join(root,'exports');await mkdir(output,{recursive:true});
const ffmpeg=path.resolve('resources/tools/ffmpeg.exe');
const fixture=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=0x24352c:s=640x360:r=25:d=6','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-shortest','-y',source],{windowsHide:true});
assert.equal(fixture.status,0,fixture.stderr?.toString());
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Voice Clipper.exe'),env:{...process.env,PATH:''},timeout:30000});
const errors=[];
let page;
try{
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'必要な音だけ、切り抜こう。'}).waitFor();
 await page.waitForTimeout(300);await page.screenshot({path:path.join(root,'empty.png'),fullPage:true});
 await app.evaluate(({dialog})=>{
  globalThis.__open=[];globalThis.__message=[];
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__open.shift()]});
  dialog.showSaveDialog=async()=>({canceled:false,filePath:globalThis.__save});
  dialog.showMessageBox=async()=>({response:globalThis.__message.shift()??1,checkboxChecked:false});
 });
 const queueOpen=async value=>app.evaluate((_,value)=>{globalThis.__open.push(value);},value);
 await queueOpen(source);await page.getByRole('button',{name:'素材を開く',exact:true}).click();
 await page.getByTestId('waveform').waitFor();await page.waitForFunction(()=>!document.querySelector('.status.busy'));
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=3&&!document.querySelector('.status.busy');},{},{timeout:30000});
 await page.locator('video').evaluate(v=>{window.__mediaEvents=[];for(const event of ['play','playing','pause','seeking','seeked','timeupdate','error','loadstart','loadedmetadata','ended'])v.addEventListener(event,()=>window.__mediaEvents.push({event,time:v.currentTime,ready:v.readyState,error:v.error?.message,src:v.currentSrc}));});
 const waveform=page.getByTestId('waveform');const box=await waveform.boundingBox();
 for(const [a,b] of [[.1,.3],[.5,.8]]){await page.mouse.move(box.x+box.width*a,box.y+70);await page.mouse.down();await page.mouse.move(box.x+box.width*b,box.y+70,{steps:10});await page.mouse.up();}
 assert.equal(await page.locator('.clip-card').count(),2);
 await page.getByLabel('範囲 1 の名前').fill('セリフ A');
 await page.locator('.clip-card').first().getByLabel('開始時刻（秒）').fill('0.500');await page.locator('.clip-card').first().getByLabel('開始時刻（秒）').press('Enter');
 await page.locator('.clip-card').first().getByRole('button',{name:'試聴'}).click();
 await page.waitForFunction(()=>document.querySelector('video')?.paused===false);
 await page.waitForFunction(()=>document.querySelector('video')?.paused===true,{},{timeout:10000});
 await page.waitForTimeout(150);
 const p=await page.locator('video').evaluate(v=>v.currentTime);const end=Number(await page.locator('.clip-card').first().getByLabel('終了時刻（秒）').inputValue());if(Math.abs(p-end)>=.08)console.log(await page.evaluate(()=>window.__mediaEvents));assert.ok(Math.abs(p-end)<.08,`preview stopped at ${p}, expected ${end}`);
 // Handles remain usable independently even when clip times overlap.
 const handle=page.getByRole('button',{name:'セリフ A 開始位置を調整'});const hb=await handle.boundingBox();await page.mouse.move(hb.x+3,hb.y+12);await page.mouse.down();await page.mouse.move(hb.x+23,hb.y+12,{steps:5});await page.mouse.up();
 assert.ok(Number(await page.locator('.clip-card').first().getByLabel('開始時刻（秒）').inputValue())>.5);
 await app.evaluate((_,file)=>{globalThis.__save=file;},project);await page.getByRole('button',{name:/^保存/}).click();await page.getByText('編集データを保存しました。',{exact:true}).waitFor();
 const saved=JSON.parse(await readFile(project,'utf8'));assert.equal(saved.clips.length,2);assert.equal(saved.clips[0].name,'セリフ A');
 // Typing spaces and Delete in an input must not trigger player shortcuts or delete clips.
 const name=page.getByLabel('範囲 1 の名前');await name.focus();await name.press('Space');await name.press('Delete');assert.equal(await page.locator('.clip-card').count(),2);
 await page.getByLabel('書き出し形式').selectOption('wav');await queueOpen(output);await page.getByRole('button',{name:'音声を書き出す',exact:true}).click();await page.getByText(/2 件の音声を書き出しました/).waitFor();assert.ok((await readdir(output)).filter(f=>f.endsWith('.wav')).length>=2);
 // Dirty switch -> cancel leaves the current project intact.
 await app.evaluate(()=>{globalThis.__message.push(2);});await page.getByRole('button',{name:'編集データを開く',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.status.busy'));assert.equal(await page.locator('.clip-card').count(),2);
 // Dirty switch -> discard, then restore saved project.
 await app.evaluate(()=>{globalThis.__message.push(1);});await queueOpen(project);await page.getByRole('button',{name:'編集データを開く',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.status.busy'));assert.equal(await page.getByLabel('範囲 1 の名前').inputValue(),'セリフ A');
 // Missing source relinking.
 const missing=path.join(root,'missing.json');await writeFile(missing,JSON.stringify({...saved,sourcePath:path.join(root,'移動済み.mp4')}));await queueOpen(missing);await queueOpen(source);await app.evaluate(()=>{globalThis.__message.push(0);});await page.getByRole('button',{name:'編集データを開く',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.status.busy'));assert.equal(await page.locator('.clip-card').count(),2);
 await page.screenshot({path:path.join(root,'editor.png'),fullPage:true});
 // A codec unsupported by Chromium must transparently produce a playable proxy.
 const unusual=path.join(root,'非対応コーデック.mkv');const unusualFixture=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc=size=641x360:rate=10:duration=1','-f','lavfi','-i','sine=duration=1','-c:v','ffv1','-c:a','pcm_s16le','-shortest','-y',unusual],{windowsHide:true});assert.equal(unusualFixture.status,0,unusualFixture.stderr?.toString());
 await queueOpen(unusual);await page.getByRole('button',{name:'素材を開く',exact:true}).click();await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=3&&v.videoWidth>0&&!document.querySelector('.status.busy');},{},{timeout:30000});assert.equal(await page.locator('.status.error').count(),0);
 // Audio-only preview, keyboard deletion and MP3 export through the packaged UI.
 const audio=path.join(root,'音声素材.wav');const generated=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=2','-y',audio],{windowsHide:true});assert.equal(generated.status,0);
 await queueOpen(audio);await page.getByRole('button',{name:'素材を開く',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.status.busy'));await page.locator('.audio-info').waitFor();
 await page.getByRole('button',{name:'現在位置に範囲を追加'}).click();await page.getByLabel('書き出し形式').selectOption('mp3');await queueOpen(output);await page.getByRole('button',{name:'音声を書き出す',exact:true}).click();await page.getByText(/1 件の音声を書き出しました/).waitFor();assert.ok((await readdir(output)).some(f=>f.endsWith('.mp3')));
 await page.locator('h1').click();await page.keyboard.press('Delete');assert.equal(await page.locator('.clip-card').count(),0);
 // Close with unsaved changes -> cancel keeps the window; discard closes it.
 await page.getByLabel('書き出し形式').selectOption('wav');await page.getByRole('button',{name:'保存 •',exact:true}).waitFor();
 await app.evaluate(()=>{globalThis.__message.push(2);});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.waitForTimeout(150);assert.equal(page.isClosed(),false);
 await app.evaluate(()=>{globalThis.__message.push(1);});await Promise.all([page.waitForEvent('close',{timeout:10000}),app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close())]);
 assert.deepEqual(errors,[]);
 await writeFile(path.join(root,'desktop-result.json'),JSON.stringify({passed:true,packaged:true,systemPath:'empty',checks:['load video and waveform','drag multiple clips','edit name and timestamps','range preview stops','adjust handles','save and restore JSON','input shortcuts ignored','WAV batch export','dirty cancel and discard','missing source relink','unsupported codec proxy','audio-only preview','MP3 export','Delete shortcut','unsaved close cancel and discard'],rendererErrors:errors},null,2));
 console.log('Desktop checks passed. Screenshots and report: test-results/');
}catch(error){if(page&&!page.isClosed()){console.log(await page.evaluate(()=>({status:Array.from(document.querySelectorAll('.status')).map(x=>x.textContent),video:Array.from(document.querySelectorAll('video')).map(v=>({ready:v.readyState,error:v.error?.message,width:v.videoWidth,src:v.currentSrc}))})));await page.screenshot({path:path.join(root,'failure.png'),fullPage:true}).catch(()=>{});}throw error;
}finally{await app.evaluate(()=>{process.exit(0);}).catch(()=>{});await app.close().catch(()=>{});}
