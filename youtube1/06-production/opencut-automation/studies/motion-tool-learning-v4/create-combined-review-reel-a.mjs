import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(root,'out/studies/motion-tool-learning-v4-combined-review-c');
const ffmpeg='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
if(fs.existsSync(out))throw new Error(`append-only output exists: ${out}`);fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sources=[
 {id:'gsap-html-v1',label:'GSAP 3.14.2 — official source render vs neutral learned',geometry:99.99977260460088,motion:99.99998091148335,path:path.join(root,'out/studies/motion-tool-learning-v4-research-gsap-lottie-k/gsap/comparison.mp4'),expected:'0fc5d384262808e24f93c14cae60e37f8f7e31f9feab26bd92b75e83be369b17'},
 {id:'lottie-web-v1',label:'Lottie-web 5.13.0 — official source render vs neutral learned',geometry:96.92103009165069,motion:98.29081872770222,path:path.join(root,'out/studies/motion-tool-learning-v4-research-gsap-lottie-k/lottie/comparison.mp4'),expected:'edec8759ded5b39b369951bd49f21228d76d10defb3d3af6d7b0bde58a862e30'},
 {id:'dotlottie-web-v1',label:'dotLottie-web — official pre-rendered GIF vs neutral learned',geometry:44.371/45*100,motion:54.44/55*100,path:path.join(root,'out/studies/motion-tool-learning-v4-dotlottie-pilot-d/official-vs-learned.mp4'),expected:null}
];
for(const s of sources){if(!fs.existsSync(s.path))throw new Error(`missing ${s.path}`);s.sha256=sha(s.path);s.bytes=fs.statSync(s.path).size;if(s.expected&&s.sha256!==s.expected)throw new Error(`source drift ${s.id}`);}
const segs=[];
for(let i=0;i<sources.length;i++){const s=sources[i],slate=path.join(out,`slate-${i+1}.mp4`),body=path.join(out,`body-${i+1}.mp4`),seg=path.join(out,`segment-${i+1}.mp4`);const font='C\\:/Windows/Fonts/arial.ttf';
 let q=spawnSync(ffmpeg,['-y','-f','lavfi','-i','color=c=0x171a21:s=1920x1080:r=24:d=1', '-vf',`drawtext=fontfile='${font}':text='${s.label.replaceAll("'","\\'")}':x=(w-text_w)/2:y=400:fontsize=48:fontcolor=white,drawtext=fontfile='${font}':text='GEOMETRY SCORE ${s.geometry.toFixed(3)}   MOTION SCORE ${s.motion.toFixed(3)}':x=(w-text_w)/2:y=500:fontsize=42:fontcolor=0x8ce99a,drawtext=fontfile='${font}':text='LEFT = OFFICIAL ORIGINAL / SOURCE RENDER    RIGHT = NEUTRAL LEARNED':x=(w-text_w)/2:y=590:fontsize=26:fontcolor=0xced4da`,'-frames:v','24','-c:v','libx264','-pix_fmt','yuv420p',slate],{encoding:'utf8'});if(q.status!==0)throw new Error(q.stderr);
 q=spawnSync(ffmpeg,['-y','-i',s.path,'-vf',`scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,drawbox=x=0:y=0:w=1920:h=46:color=black@0.65:t=fill,drawtext=fontfile='${font}':text='${s.id}  geometry ${s.geometry.toFixed(3)}%  motion ${s.motion.toFixed(3)}%':x=(w-text_w)/2:y=10:fontsize=24:fontcolor=white`,'-an','-r','24','-c:v','libx264','-pix_fmt','yuv420p',body],{encoding:'utf8'});if(q.status!==0)throw new Error(q.stderr);
 fs.writeFileSync(path.join(out,`concat-${i+1}.txt`),`file '${slate.replaceAll("'","'\\''")}'\nfile '${body.replaceAll("'","'\\''")}'\n`);q=spawnSync(ffmpeg,['-y','-f','concat','-safe','0','-i',path.join(out,`concat-${i+1}.txt`),'-c','copy',seg],{encoding:'utf8'});if(q.status!==0)throw new Error(q.stderr);segs.push(seg);
}
fs.writeFileSync(path.join(out,'concat-all.txt'),segs.map(p=>`file '${p.replaceAll("'","'\\''")}'`).join('\n')+'\n');const reel=path.join(out,'official-vs-learned-combined.mp4');const q=spawnSync(ffmpeg,['-y','-f','concat','-safe','0','-i',path.join(out,'concat-all.txt'),'-c','copy',reel],{encoding:'utf8'});if(q.status!==0)throw new Error(q.stderr);
const manifest={schema:'motion-tool-learning-v4-combined-review-a',createdAt:new Date().toISOString(),networkUsed:false,sources:sources.map(s=>({id:s.id,file:path.relative(root,s.path).replaceAll('\\','/'),sha256:s.sha256,bytes:s.bytes,geometryPercent:s.geometry,motionPercent:s.motion})),output:{file:'official-vs-learned-combined.mp4',sha256:sha(reel),bytes:fs.statSync(reel).size},eligibility:{productionEligible:false,promotionEligible:false}};fs.writeFileSync(path.join(out,'creator.manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.output,null,2));
