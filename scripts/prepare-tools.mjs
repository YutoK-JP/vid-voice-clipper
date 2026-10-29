import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const source = process.env.FFMPEG_ROOT || 'C:/Program Files/ffmpeg';
await mkdir('resources/tools', {recursive:true});
for (const name of ['ffmpeg.exe','ffprobe.exe']) await copyFile(path.join(source,'bin',name),path.join('resources/tools',name));
for (const name of ['LICENSE','README.txt']) await copyFile(path.join(source,name),path.join('resources/tools',name));
let notices='Runtime dependency licenses\n\n';
for(const name of ['react','react-dom','scheduler','lucide-react']) {
 const root=path.join('node_modules',name);
 for(const file of await readdir(root)) if(/^licen[cs]e/i.test(file)) notices+=`\n===== ${name} / ${file} =====\n${await readFile(path.join(root,file),'utf8')}\n`;
}
await writeFile('resources/tools/DEPENDENCY_LICENSES.txt',notices,'utf8');
