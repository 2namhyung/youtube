import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const authority=path.join(root,'out/studies/motion-tool-learning-v4-authority-b/originals');
const runtime=path.join(root,'out/studies/motion-tool-learning-v4-research-runtime-a');
const out=path.join(root,'out/studies/motion-tool-learning-v4-research-gsap-lottie-k');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ffmpeg='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
const ffprobe='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
if(fs.existsSync(out)) throw new Error(`append-only output exists: ${out}`);
for(const p of [edge,ffmpeg,ffprobe,path.join(runtime,'node_modules/gsap/package.json')]) if(!fs.existsSync(p)) throw new Error(`missing dependency: ${p}`);
const gsapPkg=JSON.parse(fs.readFileSync(path.join(runtime,'node_modules/gsap/package.json'),'utf8'));
if(gsapPkg.version!=='3.14.2') throw new Error(`GSAP version drift ${gsapPkg.version}`);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const cp=(a,b)=>{mkdir(path.dirname(b));fs.copyFileSync(a,b);};
const allFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?allFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);
mkdir(out);

// Copy exact official source bytes; the sole GSAP adaptation is an allowlisted same-version dependency locator replacement.
const gsapDir=path.join(out,'gsap'); mkdir(gsapDir);
for(const rel of ['LICENSE','examples/vanilla/index.html','examples/vanilla/main.js']) cp(path.join(authority,'gsap-html-v1',rel),path.join(gsapDir,'official',rel));
const originalMain=fs.readFileSync(path.join(gsapDir,'official/examples/vanilla/main.js'),'utf8');
const adapted=originalMain
 .replace('https://cdn.jsdelivr.net/npm/gsap@3.14.2/index.js','/vendor/gsap/index.js')
 .replace('https://cdn.jsdelivr.net/npm/gsap@3.14.2/ScrollTrigger.js','/vendor/gsap/ScrollTrigger.js');
if(adapted===originalMain || /https:\/\/cdn\.jsdelivr\.net/.test(adapted)) throw new Error('GSAP URL-only adaptation failed');
cp(path.join(gsapDir,'official/examples/vanilla/index.html'),path.join(gsapDir,'run/index.html'));
mkdir(path.join(gsapDir,'run')); fs.writeFileSync(path.join(gsapDir,'run/main.js'),adapted);

const lottieDir=path.join(out,'lottie');
for(const rel of ['LICENSE.md','build/player/lottie.js','demo/bodymovin/index.html','demo/bodymovin/data.json']) cp(path.join(authority,'lottie-web-v1',rel),path.join(lottieDir,'official',rel));

function server(){return new Promise(resolve=>{const s=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1'); let p;
  if(u.pathname.startsWith('/gsap/')) p=path.join(gsapDir,'run',u.pathname.slice(6));
  else if(u.pathname.startsWith('/vendor/gsap/')) p=path.join(runtime,'node_modules/gsap',u.pathname.slice('/vendor/gsap/'.length));
  else if(u.pathname.startsWith('/lottie/')) p=path.join(lottieDir,'official/demo/bodymovin',u.pathname.slice(8));
  else if(u.pathname.startsWith('/build/player/')) p=path.join(lottieDir,'official/build/player',u.pathname.slice('/build/player/'.length));
  if(!p || !fs.existsSync(p) || fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(p));
 });s.listen(0,'127.0.0.1',()=>resolve(s));});}
const browser=await chromium.launch({executablePath:edge,headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
const srv=await server(); const port=srv.address().port;
const ctx=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1});
await ctx.route('**/*',route=>{const u=new URL(route.request().url()); if(u.hostname==='127.0.0.1'&&Number(u.port)===port) route.continue(); else route.abort('blockedbyclient');});

async function captureGsap(){
 const page=await ctx.newPage(); const officialFrames=path.join(gsapDir,'official-frames');mkdir(officialFrames);
 const browserErrors=[];page.on('pageerror',e=>browserErrors.push(String(e)));page.on('requestfailed',r=>browserErrors.push(`${r.url()} ${r.failure()?.errorText}`));
 const started=performance.now(); await page.goto(`http://127.0.0.1:${port}/gsap/index.html`,{waitUntil:'domcontentloaded'}); const metrics=[];
 for(let i=0;i<48;i++){const target=started+i*1000/24;const wait=target-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));const m=await page.evaluate(()=>['#single','.a','.b','.c','.panel'].map(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect(),c=getComputedStyle(e);return {selector,x:b.x,y:b.y,w:b.width,h:b.height,opacity:Number(c.opacity)};}));metrics.push({frame:i,t:(performance.now()-started)/1000,elements:m});await page.screenshot({path:path.join(officialFrames,`${String(i).padStart(3,'0')}.png`)});}
 if(browserErrors.length)throw new Error(`GSAP browser errors: ${browserErrors.join(' | ')}`);
 await page.close(); fs.writeFileSync(path.join(gsapDir,'numeric-measurements.json'),JSON.stringify({schema:'numeric-layout-motion-v1',width:960,height:540,frames:metrics},null,2));
 const learned=path.join(gsapDir,'learned');mkdir(learned);
 fs.writeFileSync(path.join(learned,'metrics.json'),JSON.stringify(metrics));
 fs.writeFileSync(path.join(learned,'index.html'),`<!doctype html><style>html,body{margin:0;width:960px;height:540px;background:#f4f1ec;overflow:hidden}.n{position:absolute;border-radius:8px;background:#7048e8}</style><div id=r></div><script type=module>import{gsap}from'/vendor/gsap/index.js';const M=await(await fetch('/gsap-learned/metrics.json')).json();globalThis.show=n=>{r.replaceChildren();for(const e of M[n].elements){const d=document.createElement('div');d.className='n';r.append(d);gsap.set(d,{x:e.x,y:e.y,width:e.w,height:e.h,opacity:e.opacity});}};show(0)</script>`);
 return {duration:metrics.at(-1).t,metrics};
}
// Extend server for learned content by mirroring under the run root through temporary copies.
const oldListeners=srv.listeners('request'); srv.removeAllListeners('request'); srv.on('request',(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'); if(u.pathname.startsWith('/gsap-learned/')){const p=path.join(gsapDir,'learned',u.pathname.slice(14)); if(fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(p));}else{res.writeHead(404);res.end();}return;} oldListeners[0](req,res);
});
const g=await captureGsap();
async function captureGsapLearned(){const p=await ctx.newPage();const dir=path.join(gsapDir,'learned-frames');mkdir(dir);await p.goto(`http://127.0.0.1:${port}/gsap-learned/index.html`,{waitUntil:'networkidle'});for(let i=0;i<48;i++){await p.evaluate(i=>show(i),i);await p.screenshot({path:path.join(dir,`${String(i).padStart(3,'0')}.png`)});}await p.close();}
await captureGsapLearned();

function rgbaBBox(p,w=960,h=540){const q=spawnSync(ffmpeg,['-v','error','-i',p,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:null,maxBuffer:8e6});if(q.status!==0)throw new Error(q.stderr.toString());const b=q.stdout;let x0=w,y0=h,x1=-1,y1=-1,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*3,r=b[j],g=b[j+1],bl=b[j+2];if(Math.abs(r-51)+Math.abs(g-51)+Math.abs(bl-51)>45){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}}return x1<0?{x:0,y:0,w:0,h:0,count}:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count};}
async function captureLottie(){const page=await ctx.newPage();const of=path.join(lottieDir,'official-frames');mkdir(of);await page.goto(`http://127.0.0.1:${port}/lottie/index.html`,{waitUntil:'networkidle'});await page.waitForFunction(()=>globalThis.anim?.isLoaded);const total=await page.evaluate(()=>anim.totalFrames);const raw=[];for(let i=0;i<48;i++){await page.evaluate(f=>anim.goToAndStop(f,true),i*(total-1)/47);const nodes=await page.evaluate(()=>[...document.querySelectorAll('#bodymovin *')].map((e,index)=>{const b=e.getBoundingClientRect(),c=getComputedStyle(e);return{index,tag:e.tagName,x:b.x,y:b.y,w:b.width,h:b.height,opacity:Number(c.opacity)}}));raw.push(nodes);await page.screenshot({path:path.join(of,`${String(i).padStart(3,'0')}.png`)});}await page.close();
 const n=Math.min(...raw.map(x=>x.length));let chosen=-1,best=-1;for(let j=0;j<n;j++){const q=raw.map(x=>x[j]).filter(x=>x.w>8&&x.h>8&&x.opacity>0);if(q.length!==48)continue;const xs=q.map(x=>x.x+x.w/2),ys=q.map(x=>x.y+x.h/2),ws=q.map(x=>x.w),hs=q.map(x=>x.h);const score=Math.max(...xs)-Math.min(...xs)+Math.max(...ys)-Math.min(...ys)+0.5*(Math.max(...ws)-Math.min(...ws)+Math.max(...hs)-Math.min(...hs));if(score>best){best=score;chosen=j;}}
 if(chosen<0||best<2)throw new Error(`no recognizable moving Lottie DOM element: ${best}`);const boxes=raw.map((x,i)=>({frame:i,sourceFrame:i*(total-1)/47,bbox:{x:x[chosen].x,y:x[chosen].y,w:x[chosen].w,h:x[chosen].h},opacity:x[chosen].opacity}));fs.writeFileSync(path.join(lottieDir,'numeric-measurements.json'),JSON.stringify({schema:'numeric-layout-motion-v1',width:960,height:540,selectedDomIndex:chosen,motionRange:best,frames:boxes},null,2));
 const kf=values=>values.map((s,i)=>i===values.length-1?{t:i,s}:{t:i,s,e:values[i+1],i:{x:[0.667],y:[1]},o:{x:[0.333],y:[0]}});
 const animJson={v:'5.13.0',fr:24,ip:0,op:48,w:960,h:540,nm:'neutral geometry',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'neutral shape',sr:1,ks:{o:{a:1,k:kf(boxes.map(q=>[q.opacity*100]))},r:{a:0,k:0},p:{a:1,k:kf(boxes.map(q=>[q.bbox.x+q.bbox.w/2,q.bbox.y+q.bbox.h/2,0]))},a:{a:0,k:[0,0,0]},s:{a:1,k:kf(boxes.map(q=>[q.bbox.w,q.bbox.h,100]))}},shapes:[{ty:'gr',nm:'neutral group',it:[{ty:'rc',d:1,p:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:12},nm:'neutral body'},{ty:'fl',c:{a:0,k:[0.44,0.28,0.91,1]},o:{a:0,k:100},r:1,nm:'neutral fill'},{ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100},sk:{a:0,k:0},sa:{a:0,k:0},nm:'group transform'}]}],ao:0,ip:0,op:48,st:0,bm:0}]};
 const learned=path.join(lottieDir,'learned');mkdir(learned);fs.writeFileSync(path.join(learned,'data.json'),JSON.stringify(animJson));fs.writeFileSync(path.join(learned,'index.html'),`<!doctype html><style>html,body,#bodymovin{margin:0;width:960px;height:540px;background:#333;overflow:hidden}</style><script src='/build/player/lottie.js'></script><div id=bodymovin></div><script>const data=${JSON.stringify(animJson)};globalThis.anim=bodymovin.loadAnimation({wrapper:document.getElementById('bodymovin'),renderer:'svg',loop:false,autoplay:false,animationData:data})</script>`);
 return {total,boxes,selectedDomIndex:chosen,motionRange:best};}
srv.removeAllListeners('request');srv.on('request',(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname.startsWith('/lottie-learned/')){const p=path.join(lottieDir,'learned',u.pathname.slice(16));if(fs.existsSync(p)){res.setHeader('Content-Type',p.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(p));}else{res.writeHead(404);res.end();}return;}oldListeners[0](req,res);});
const l=await captureLottie();
async function captureLottieLearned(){const p=await ctx.newPage();const errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(`console:${m.text()}`)});p.on('pageerror',e=>errors.push(String(e)));p.on('requestfailed',r=>errors.push(`${r.url()} ${r.failure()?.errorText}`));const dir=path.join(lottieDir,'learned-frames');mkdir(dir);await p.goto(`http://127.0.0.1:${port}/lottie-learned/index.html`,{waitUntil:'networkidle'});await p.waitForFunction(()=>globalThis.anim?.isLoaded,null,{timeout:10000});if(errors.length)throw new Error(`learned Lottie browser errors: ${errors.join(' | ')}`);for(let i=0;i<48;i++){await p.evaluate(i=>anim.goToAndStop(i,true),i);await p.screenshot({path:path.join(dir,`${String(i).padStart(3,'0')}.png`)});}await p.close();}
await captureLottieLearned();
await browser.close();await new Promise(r=>srv.close(r));

function encode(tool){const d=path.join(out,tool);const args=['-y','-framerate','24','-i',path.join(d,'official-frames/%03d.png'),'-framerate','24','-i',path.join(d,'learned-frames/%03d.png'),'-filter_complex',`[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=inputs=2,drawbox=x=0:y=0:w=1920:h=42:color=black@0.75:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='OFFICIAL SOURCE RENDER':x=24:y=10:fontsize=22:fontcolor=white,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='LEARNED NEUTRAL OUTPUT':x=984:y=10:fontsize=22:fontcolor=white[v]`,'-map','[v]','-frames:v','48','-r','24','-c:v','libx264','-pix_fmt','yuv420p',path.join(d,'comparison.mp4')];const q=spawnSync(ffmpeg,args,{encoding:'utf8'});if(q.status!==0)throw new Error(q.stderr);}
encode('gsap');encode('lottie');
const depFiles=allFiles(path.join(runtime,'node_modules/gsap')).filter(p=>fs.statSync(p).isFile()).map(p=>({file:path.relative(root,p).replaceAll('\\','/'),sha256:sha(p),bytes:fs.statSync(p).size,name:'gsap',version:'3.14.2',license:gsapPkg.license||'Standard no charge'}));
const manifest={schema:'motion-tool-learning-v4-research-gsap-lottie-b',createdAt:new Date().toISOString(),scope:'research-only',network:{externalBlocked:true,loopbackPort:port,requestsPolicy:'only exact loopback port continued'},dependencies:{edge:{file:edge,sha256:sha(edge),bytes:fs.statSync(edge).size,version:await chromium.launch({executablePath:edge,headless:true}).then(async b=>{const v=await b.version();await b.close();return v;})},ffmpeg:{file:ffmpeg,sha256:sha(ffmpeg),bytes:fs.statSync(ffmpeg).size},gsapPackage:{name:'gsap',version:'3.14.2',license:gsapPkg.license,files:depFiles}},tools:{gsap:{officialCommit:'a80d23f971128766629c3baed3c7564a8c4edf5e',officialSourceExecuted:true,adaptation:{onlyDependencyLocatorChanged:true,semanticChange:false,originalSha256:sha(path.join(gsapDir,'official/examples/vanilla/main.js')),adaptedSha256:sha(path.join(gsapDir,'run/main.js')),from:['https://cdn.jsdelivr.net/npm/gsap@3.14.2/index.js','https://cdn.jsdelivr.net/npm/gsap@3.14.2/ScrollTrigger.js'],to:['/vendor/gsap/index.js','/vendor/gsap/ScrollTrigger.js']},license:{status:'approved-for-isolated-research-render',file:'gsap/official/LICENSE',sha256:sha(path.join(gsapDir,'official/LICENSE'))},duration:g.duration,comparison:{file:'gsap/comparison.mp4',sha256:sha(path.join(gsapDir,'comparison.mp4'))}},lottie:{officialCommit:'507be7fa7fbf748962dd7b1b190d99cc9cf6079b',officialSourceExecuted:true,sourceAdapted:false,license:{status:'approved-for-isolated-research-render',basis:'MIT text reviewed for research execution; not a production or redistribution determination',file:'lottie/official/LICENSE.md',sha256:sha(path.join(lottieDir,'official/LICENSE.md'))},totalFrames:l.total,comparison:{file:'lottie/comparison.mp4',sha256:sha(path.join(lottieDir,'comparison.mp4'))}}},eligibility:{productionEligible:false,promotionEligible:false}};
fs.writeFileSync(path.join(out,'creator.manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({out,gsap:manifest.tools.gsap.comparison,lottie:manifest.tools.lottie.comparison},null,2));
