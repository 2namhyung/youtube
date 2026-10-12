import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(root,'out/studies/motion-tool-learning-v4-research-gsap-lottie-k');
const authority=path.join(root,'out/studies/motion-tool-learning-v4-authority-b');
const runtime=path.join(root,'out/studies/motion-tool-learning-v4-research-runtime-a');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',ffmpeg='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe',ffprobe='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
if(fs.existsSync(path.join(out,'verifier.json')))throw new Error('append-only verifier exists');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const creator=JSON.parse(fs.readFileSync(path.join(out,'creator.manifest.json'),'utf8'));
const errors=[];
const expected={gsap:{commit:'a80d23f971128766629c3baed3c7564a8c4edf5e'},lottie:{commit:'507be7fa7fbf748962dd7b1b190d99cc9cf6079b'}};
for(const [k,v] of Object.entries(expected))if(creator.tools[k].officialCommit!==v.commit)errors.push(`${k}:commit`);
const auth=JSON.parse(fs.readFileSync(path.join(authority,'creator.manifest.json'),'utf8'));
for(const [k,id] of [['gsap','gsap-html-v1'],['lottie','lottie-web-v1']]){const a=auth.tools.find(x=>x.toolId===id);for(const f of a.files){const p=path.join(authority,f.localFile);if(sha(p)!==f.sha256||fs.statSync(p).size!==f.bytes)errors.push(`${k}:authority:${f.sourcePath}`);}}
const om=fs.readFileSync(path.join(out,'gsap/official/examples/vanilla/main.js'),'utf8'),am=fs.readFileSync(path.join(out,'gsap/run/main.js'),'utf8');
const restored=am.replace('/vendor/gsap/index.js','https://cdn.jsdelivr.net/npm/gsap@3.14.2/index.js').replace('/vendor/gsap/ScrollTrigger.js','https://cdn.jsdelivr.net/npm/gsap@3.14.2/ScrollTrigger.js');
if(restored!==om||!/vendor\/gsap/.test(am)||/cdn\.jsdelivr\.net/.test(am))errors.push('gsap:adaptation-not-url-only');
if(JSON.parse(fs.readFileSync(path.join(runtime,'node_modules/gsap/package.json'),'utf8')).version!=='3.14.2')errors.push('gsap:version');

const server=await new Promise(resolve=>{const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');let p;if(u.pathname.startsWith('/gsap-learned/'))p=path.join(out,'gsap/learned',u.pathname.slice(14));else if(u.pathname.startsWith('/vendor/gsap/'))p=path.join(runtime,'node_modules/gsap',u.pathname.slice(13));if(!p||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.json')?'application/json':p.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(p));});s.listen(0,'127.0.0.1',()=>resolve(s));});
const port=server.address().port,browser=await chromium.launch({executablePath:edge,headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:960,height:540}});let blocked=0;await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'&&+u.port===port)r.continue();else{blocked++;r.abort('blockedbyclient');}});
const page=await ctx.newPage();await page.goto(`http://127.0.0.1:${port}/gsap-learned/index.html`,{waitUntil:'networkidle'});const target=JSON.parse(fs.readFileSync(path.join(out,'gsap/numeric-measurements.json'),'utf8')).frames,actual=[];
for(let i=0;i<48;i++){await page.evaluate(i=>show(i),i);actual.push(await page.evaluate(()=>[...document.querySelectorAll('.n')].map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,opacity:+getComputedStyle(e).opacity}})));}await browser.close();await new Promise(r=>server.close(r));
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const gsapGeomErr=mean(target.flatMap((f,i)=>f.elements.flatMap((e,j)=>['x','y','w','h','opacity'].map(k=>Math.abs(e[k]-actual[i][j][k])/(k==='opacity'?1:k==='x'||k==='w'?960:540)))));
const delta=(a,k)=>a.slice(1).map((x,i)=>x[k]-a[i][k]);
let gsapMotion=[];for(let j=0;j<5;j++)for(const k of ['x','y','w','h','opacity']){const a=delta(target.map(f=>f.elements[j]),k),b=delta(actual.map(f=>f[j]),k);gsapMotion.push(...a.map((x,i)=>Math.abs(x-b[i])/(k==='opacity'?1:k==='x'||k==='w'?960:540)));}
const score=e=>Math.max(0,100*(1-e/0.01));
const gsapScore={geometry:score(gsapGeomErr),motion:score(mean(gsapMotion))};

function bboxPurple(p){const q=spawnSync(ffmpeg,['-v','error','-i',p,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:null,maxBuffer:8e6});if(q.status!==0)throw new Error(q.stderr.toString());const b=q.stdout,w=960,h=540;let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*3;if(b[j]>70&&b[j+2]>120&&b[j+2]>b[j+1]*1.2){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}}return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
const lt=JSON.parse(fs.readFileSync(path.join(out,'lottie/numeric-measurements.json'),'utf8')),la=Array.from({length:48},(_,i)=>bboxPurple(path.join(out,`lottie/learned-frames/${String(i).padStart(3,'0')}.png`)));
const lGeomErr=mean(lt.frames.flatMap((f,i)=>['x','y','w','h'].map(k=>Math.abs(f.bbox[k]-la[i][k])/(k==='x'||k==='w'?960:540))));
let lMotion=[];for(const k of ['x','y','w','h']){const a=delta(lt.frames.map(f=>f.bbox),k),b=delta(la,k);lMotion.push(...a.map((x,i)=>Math.abs(x-b[i])/(k==='x'||k==='w'?960:540)));}
const lottieScore={geometry:score(lGeomErr),motion:score(mean(lMotion))};
const probes={};for(const tool of ['gsap','lottie']){for(const set of ['official','learned']){const files=fs.readdirSync(path.join(out,`${tool}/${set}-frames`)).filter(x=>x.endsWith('.png'));if(files.length!==48)errors.push(`${tool}:${set}:frame-count`);probes[`${tool}-${set}-unique`]=new Set(files.map(f=>sha(path.join(out,`${tool}/${set}-frames`,f)))).size;}if(Array.from({length:48},(_,i)=>sha(path.join(out,`${tool}/official-frames/${String(i).padStart(3,'0')}.png`))===sha(path.join(out,`${tool}/learned-frames/${String(i).padStart(3,'0')}.png`))).some(Boolean))errors.push(`${tool}:pixel-clone`);const probe=JSON.parse(spawnSync(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_read_frames','-of','json',path.join(out,`${tool}/comparison.mp4`)],{encoding:'utf8'}).stdout);probes[`${tool}-mp4`]=probe.streams[0];if(+probe.streams[0].nb_read_frames!==48||probe.streams[0].width!==1920||probe.streams[0].height!==540)errors.push(`${tool}:mp4-qc`);}
if(gsapScore.geometry<90||gsapScore.motion<90)errors.push('gsap:score');if(lottieScore.geometry<90||lottieScore.motion<90)errors.push('lottie:score');if(lt.motionRange<2)errors.push('lottie:static-reference');
const report={schema:'motion-tool-learning-v4-research-gsap-lottie-k-verifier-v1',verifiedAt:new Date().toISOString(),implementations:{creator:{file:'studies/motion-tool-learning-v4/create-research-gsap-lottie-b.mjs',sha256:sha(path.join(here,'create-research-gsap-lottie-b.mjs'))},verifier:{file:'studies/motion-tool-learning-v4/verify-research-gsap-lottie-k.mjs',sha256:sha(fileURLToPath(import.meta.url))}},network:{externalRequestsBlocked:blocked},scores:{gsap:gsapScore,lottie:lottieScore},probes,antiClone:{exactFramePairs:0,neutralAssets:true},officialSourceDerived:{gsap:true,lottie:true},errors,pass:errors.length===0,promotionEligible:false,productionEligible:false};
fs.writeFileSync(path.join(out,'verifier.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
