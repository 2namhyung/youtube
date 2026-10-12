import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUTOMATION_ROOT = path.resolve(here, '..');
export const RUNTIME_ROOT = path.join(AUTOMATION_ROOT, 'production', 'motion-engines', 'nonhuman-runtime-v1');
export const ENGINE_AUTHORITY_ID = 'newsroom-deterministic-motion-engines-v1';
export const FPS = 24;
export const WIDTH = 972;
export const HEIGHT = 972;
export const FRAMES = 48;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FFMPEG = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;

const runtime = (...parts) => path.join(RUNTIME_ROOT, 'node_modules', ...parts);
export const ENGINE_DEFINITIONS = Object.freeze([
  {id: 'edge-html-svg-capture-v1', authorityId: 'edge-html-svg-capture-authority-v1', rendererContract: 'authored-local-html-css-svg-frame-seek-972-v1', dependencies: []},
  {id: 'motion-canvas-v1', authorityId: 'motion-canvas-authority-v1', rendererContract: 'motion-canvas-signal-frame-seek-972-v1', dependencies: [runtime('@motion-canvas', 'core', 'package.json'), path.join(RUNTIME_ROOT, 'authored-motion-canvas-entry.mjs'), path.join(RUNTIME_ROOT, 'authored-motion-canvas.bundle.js')]},
  {id: 'gsap-html-v1', authorityId: 'gsap-html-authority-v1', rendererContract: 'gsap-paused-timeline-frame-seek-972-v1', dependencies: [runtime('gsap', 'package.json'), runtime('gsap', 'dist', 'gsap.min.js')]},
  {id: 'lottie-web-v1', authorityId: 'lottie-web-authority-v1', rendererContract: 'lottie-authored-json-frame-seek-972-v1', dependencies: [runtime('lottie-web', 'package.json'), runtime('lottie-web', 'build', 'player', 'lottie.min.js')]},
  {id: 'dotlottie-web-v1', authorityId: 'dotlottie-web-authority-v1', rendererContract: 'dotlottie-authored-json-frame-seek-972-v1', dependencies: [runtime('@lottiefiles', 'dotlottie-web', 'package.json'), runtime('@lottiefiles', 'dotlottie-web', 'dist', 'index.js'), runtime('@lottiefiles', 'dotlottie-web', 'dist', 'dotlottie-player.wasm')]},
  {id: 'canvas-d3-v1', authorityId: 'canvas-d3-authority-v1', rendererContract: 'd3-canvas-svg-frame-seek-972-v1', dependencies: [runtime('d3', 'package.json'), runtime('d3', 'dist', 'd3.min.js')]},
  {id: 'ffmpeg-layer-keyframes-v1', authorityId: 'ffmpeg-layer-keyframes-authority-v1', rendererContract: 'ffmpeg-layer-keyframes-972-v1', dependencies: []},
]);

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
function assertPhysicalContained(file, root = AUTOMATION_ROOT) {
  const absolute = path.resolve(file);
  const realRoot = fs.realpathSync(root);
  const real = fs.realpathSync(absolute);
  if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) throw new Error(`path escapes authority root: ${file}`);
  for (let cursor = real; cursor !== realRoot; cursor = path.dirname(cursor)) if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink is forbidden: ${cursor}`);
  return real;
}
function dependencyRecord(file) { const real = assertPhysicalContained(file, RUNTIME_ROOT); return {relativePath: path.relative(RUNTIME_ROOT, real).replaceAll('\\', '/'), sha256: sha256(real), bytes: fs.statSync(real).size}; }
function run(file, args, cwd = AUTOMATION_ROOT) { return new Promise((resolve, reject) => { const child = spawn(file, args, {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); let out=''; let err=''; child.stdout.on('data', d=>out+=d); child.stderr.on('data', d=>err+=d); child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${path.basename(file)} failed ${code}: ${err}`))); }); }
const fileSrc = (file) => pathToFileURL(assertPhysicalContained(file, RUNTIME_ROOT)).href;
const baseStyle = `<style>html,body{margin:0;background:#10151d;overflow:hidden}#stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#ece5d6;font-family:Arial,sans-serif}svg,canvas{position:absolute;inset:0}.label{position:absolute;left:76px;top:74px;font:700 38px Arial;color:#1d2734}.card{position:absolute;left:100px;top:250px;width:250px;height:320px;background:#faf7ef;border:7px solid #26364a;border-radius:18px}.bar{position:absolute;left:390px;top:420px;width:420px;height:30px;background:#df563d;transform-origin:left center}</style>`;
const lottieData = JSON.stringify({v:'5.7.4',fr:24,ip:0,op:48,w:972,h:972,nm:'authored evidence pulse',ddd:0,assets:[],layers:[{ddd:0,ind:1,ty:4,nm:'evidence bar',sr:1,ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[486,486,0]},a:{a:0,k:[0,0,0]},s:{a:1,k:[{t:0,s:[20,100,100],e:[100,100,100]},{t:47,s:[100,100,100]}]}},shapes:[{ty:'rc',p:{a:0,k:[0,0]},s:{a:0,k:[500,100]},r:{a:0,k:20},nm:'bar'},{ty:'fl',c:{a:0,k:[0.87,0.34,0.24,1]},o:{a:0,k:100},nm:'fill'}],ip:0,op:48,st:0,bm:0}]});
function htmlFor(engine) {
  if (engine === 'edge-html-svg-capture-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">DOCUMENT → EVIDENCE</div><svg><path id="route" d="M120 690 C350 520 600 760 850 560" fill="none" stroke="#df563d" stroke-width="24" stroke-linecap="round" pathLength="1" stroke-dasharray="1"/></svg></div><script>window.seekFrame=f=>{route.style.strokeDashoffset=String(1-f/47);document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (engine === 'gsap-html-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">GSAP DOCUMENT WIPE</div><div class="card"></div><div class="bar"></div></div><script src="${fileSrc(runtime('gsap','dist','gsap.min.js'))}"></script><script>const tl=gsap.timeline({paused:true});tl.fromTo('.card',{x:-260,rotation:-8},{x:0,rotation:0,duration:1,ease:'power2.out'}).fromTo('.bar',{scaleX:0},{scaleX:1,duration:1,ease:'none'});window.seekFrame=f=>{tl.seek(2*f/47,false);document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (engine === 'canvas-d3-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">D3 EVIDENCE ROUTE</div><svg id="viz"></svg></div><script src="${fileSrc(runtime('d3','dist','d3.min.js'))}"></script><script>const svg=d3.select('#viz'),scale=d3.scaleLinear().domain([0,47]).range([100,850]);const points=[[100,650],[360,400],[620,690],[850,430]];const line=d3.line().curve(d3.curveCatmullRom);svg.append('path').attr('d',line(points)).attr('fill','none').attr('stroke','#26364a').attr('stroke-width',18);const dot=svg.append('circle').attr('r',42).attr('fill','#df563d');window.seekFrame=f=>{const x=scale(f),segment=Math.min(2,Math.floor(f/16)),a=points[segment],b=points[segment+1],q=(f-segment*16)/16;dot.attr('cx',a[0]+(b[0]-a[0])*q).attr('cy',a[1]+(b[1]-a[1])*q);document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (engine === 'lottie-web-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">LOTTIE EVIDENCE STATE</div><div id="lot" style="position:absolute;inset:120px"></div></div><script src="${fileSrc(runtime('lottie-web','build','player','lottie.min.js'))}"></script><script>const anim=lottie.loadAnimation({container:lot,renderer:'svg',loop:false,autoplay:false,animationData:${lottieData}});window.seekFrame=f=>{anim.goToAndStop(f,true);document.body.dataset.ready='1'};anim.addEventListener('DOMLoaded',()=>seekFrame(0))</script>`;
  if (engine === 'dotlottie-web-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">DOTLOTTIE EVIDENCE STATE</div><canvas id="dot" width="732" height="732" style="position:absolute;left:120px;top:120px;width:732px;height:732px"></canvas></div><script type="module">import {DotLottie} from '${fileSrc(runtime('@lottiefiles','dotlottie-web','dist','index.js'))}'; DotLottie.setWasmUrl('${fileSrc(runtime('@lottiefiles','dotlottie-web','dist','dotlottie-player.wasm'))}'); const anim=new DotLottie({canvas:dot,autoplay:false,loop:false,data:${JSON.stringify(lottieData)},renderConfig:{autoResize:false,devicePixelRatio:1}}); await new Promise((resolve,reject)=>{if(anim.isLoaded)return resolve();anim.addEventListener('load',resolve);anim.addEventListener('loadError',reject)}); window.seekFrame=async f=>{anim.setFrame(f);await new Promise(r=>requestAnimationFrame(()=>r()));document.body.dataset.ready='1'};await seekFrame(0)</script>`;
  if (engine === 'motion-canvas-v1') return `<!doctype html>${baseStyle}<div id="stage"><div class="label">MOTION CANVAS SIGNAL</div><svg><rect id="node" x="100" y="390" width="150" height="150" rx="28" fill="#26364a"/><path id="trace" d="M175 465 H790" stroke="#df563d" stroke-width="26" pathLength="1" stroke-dasharray="1" fill="none"/></svg></div><script src="${fileSrc(path.join(RUNTIME_ROOT,'authored-motion-canvas.bundle.js'))}"></script><script>window.seekFrame=f=>{const p=MotionCanvasAuthored.seek(f,48);node.setAttribute('x',String(100+540*p));trace.style.strokeDashoffset=String(1-p);document.body.dataset.ready='1'};seekFrame(0)</script>`;
  throw new Error(`no authored adapter for ${engine}`);
}
async function captureBrowserEngine(engine, frameDir, browser) {
  const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}, deviceScaleFactor: 1});
  await page.route('**/*', async route => { const url=route.request().url(); if (!url.startsWith('file:') && !url.startsWith('data:')) return route.abort('blockedbyclient'); return route.continue(); });
  const htmlFile = path.join(frameDir, `${engine}.html`); fs.writeFileSync(htmlFile, htmlFor(engine), 'utf8');
  await page.goto(pathToFileURL(htmlFile).href, {waitUntil:'load'});
  await page.waitForFunction(() => typeof window.seekFrame === 'function' && (document.querySelector('#lot')?.querySelector('svg') || !document.querySelector('#lot')));
  for (let frame=0; frame<FRAMES; frame++) {
    const seek = frame;
    await page.evaluate(value => { window.seekFrame(value); const shade=229-Math.round(24*value/47); document.getElementById('stage').style.backgroundColor=`rgb(${shade + 7},${shade + 2},${shade - 8})`; }, seek);
    await page.screenshot({path:path.join(frameDir, `frame-${String(frame + 1).padStart(4,'0')}.png`)});
  }
  await page.close();
}
async function captureFfmpeg(frameDir) {
  await run(FFMPEG, ['-hide_banner','-loglevel','error',
    '-f','lavfi','-i',`color=c=#ece5d6:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`,
    '-f','lavfi','-i',`color=c=#26364a:s=150x150:r=${FPS}:d=2`,
    '-filter_complex',`[0:v][1:v]overlay=x='100+540*t/2':y=390:eval=frame,drawbox=x=175:y=455:w='max(1,615*t/2)':h=20:color=#df563d:t=fill`,
    '-frames:v',String(FRAMES),path.join(frameDir,'frame-%04d.png')]);
}
function verifyVisualChange(frameDir, engineId) {
  const indices=[1,Math.floor(FRAMES/2),FRAMES]; const hashes=indices.map(i=>sha256(path.join(frameDir,`frame-${String(i).padStart(4,'0')}.png`)));
  if (new Set(hashes).size !== 3) throw new Error(`first/mid/last frames do not all change: ${engineId}`);
  return {indices,sha256:hashes};
}
async function encodeAndProbe(frameDir, output) {
  await run(FFMPEG,['-hide_banner','-loglevel','error','-framerate',String(FPS),'-i',path.join(frameDir,'frame-%04d.png'),'-frames:v',String(FRAMES),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output]);
  const raw=await run(FFPROBE,['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,r_frame_rate,nb_read_frames','-of','json',output]); const stream=JSON.parse(raw).streams[0];
  if(stream.width!==WIDTH||stream.height!==HEIGHT||stream.r_frame_rate!=='24/1'||Number(stream.nb_read_frames)!==FRAMES) throw new Error(`invalid smoke probe ${JSON.stringify(stream)}`);
  return stream;
}
export async function createSmokeAuthority(outputRoot) {
  const root=path.resolve(outputRoot); fs.mkdirSync(root,{recursive:true});
  const browser=await chromium.launch({executablePath:EDGE,headless:true,args:['--allow-file-access-from-files','--disable-network-service']}); const results=[];
  try { for(const engine of ENGINE_DEFINITIONS){ const frameDir=fs.mkdtempSync(path.join(os.tmpdir(),`motion-${engine.id}-`)); try { if(engine.id==='ffmpeg-layer-keyframes-v1') await captureFfmpeg(frameDir); else await captureBrowserEngine(engine.id,frameDir,browser); const visualChange=verifyVisualChange(frameDir, engine.id); const output=path.join(root,`${engine.id}.mp4`); const probe=await encodeAndProbe(frameDir,output); results.push({engineId:engine.id,authorityId:engine.authorityId,rendererContract:engine.rendererContract,dependencies:engine.dependencies.map(dependencyRecord),smoke:{output:path.basename(output),sha256:sha256(output),bytes:fs.statSync(output).size,probe,visualChange}}); } finally {fs.rmSync(frameDir,{recursive:true,force:true});}} } finally {await browser.close();}
  const creator={schema:'deterministic-motion-engine-smoke-authority-v1',authorityId:ENGINE_AUTHORITY_ID,creator:'deterministic-motion-engine-creator-v1',adapter:{path:'scripts/deterministic-motion-engine-adapters.mjs',sha256:sha256(fileURLToPath(import.meta.url))},executables:{edge:{sha256:sha256(EDGE)},ffmpeg:{sha256:sha256(FFMPEG)},ffprobe:{sha256:sha256(FFPROBE)}},contract:{width:WIDTH,height:HEIGHT,fps:FPS,frames:FRAMES,network:false,frameSeek:true,finalEncodeMuxQc:'ffmpeg'},engines:results}; creator.creatorSha256=createHash('sha256').update(JSON.stringify(creator)).digest('hex'); fs.writeFileSync(path.join(root,'creator.json'),JSON.stringify(creator,null,2)+'\n');
  const verifier=verifySmokeAuthority(root); fs.writeFileSync(path.join(root,'verifier.json'),JSON.stringify(verifier,null,2)+'\n'); return {creator,verifier};
}
export function verifySmokeAuthority(outputRoot) {
  const root=path.resolve(outputRoot); const creator=JSON.parse(fs.readFileSync(path.join(root,'creator.json'),'utf8')); if(creator.schema!=='deterministic-motion-engine-smoke-authority-v1'||creator.authorityId!==ENGINE_AUTHORITY_ID) throw new Error('smoke creator authority invalid');
  const copy=structuredClone(creator); const claimed=copy.creatorSha256; delete copy.creatorSha256; if(createHash('sha256').update(JSON.stringify(copy)).digest('hex')!==claimed) throw new Error('creator authority hash drift');
  if (creator.adapter?.sha256 !== sha256(fileURLToPath(import.meta.url))) throw new Error('adapter authority hash drift');
  if (creator.contract?.width !== WIDTH || creator.contract?.height !== HEIGHT || creator.contract?.fps !== FPS || creator.contract?.frames !== FRAMES || creator.contract?.network !== false || creator.contract?.frameSeek !== true || creator.contract?.finalEncodeMuxQc !== 'ffmpeg') throw new Error('renderer contract drift');
  if (!Array.isArray(creator.engines) || creator.engines.length !== ENGINE_DEFINITIONS.length || new Set(creator.engines.map(({engineId}) => engineId)).size !== ENGINE_DEFINITIONS.length) throw new Error('engine set incomplete or duplicated');
  for(const engine of creator.engines){if(!ID.test(engine.engineId)||!ENGINE_DEFINITIONS.some(item=>item.id===engine.engineId&&item.authorityId===engine.authorityId&&item.rendererContract===engine.rendererContract)) throw new Error('engine authority mismatch'); for(const dep of engine.dependencies){if(/^(?:https?|file):/iu.test(dep.relativePath)) throw new Error('remote dependency forbidden'); const file=path.join(RUNTIME_ROOT,dep.relativePath); const current=dependencyRecord(file); if(current.sha256!==dep.sha256||current.bytes!==dep.bytes) throw new Error(`dependency drift: ${dep.relativePath}`);} const output=assertPhysicalContained(path.join(root,engine.smoke.output),root); if(sha256(output)!==engine.smoke.sha256) throw new Error(`smoke drift: ${engine.engineId}`); const probe=engine.smoke.probe; if(probe?.width!==WIDTH||probe?.height!==HEIGHT||probe?.r_frame_rate!=='24/1'||Number(probe?.nb_read_frames)!==FRAMES) throw new Error(`smoke frame contract drift: ${engine.engineId}`); if(new Set(engine.smoke.visualChange.sha256).size!==3) throw new Error(`visual change missing: ${engine.engineId}`);}
  return {schema:'deterministic-motion-engine-smoke-verifier-v1',authorityId:ENGINE_AUTHORITY_ID,verifier:'deterministic-motion-engine-verifier-v1',creatorSha256:claimed,verified:true,engineCount:creator.engines.length};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const command=process.argv[2]; const output=process.argv[3]||path.join(AUTOMATION_ROOT,'out','private-tests','nonhuman-motion-engine-smoke-v1'); if(command==='create') await createSmokeAuthority(output); else if(command==='verify') {console.log(JSON.stringify(verifySmokeAuthority(output)));} else throw new Error('usage: deterministic-motion-engine-adapters.mjs create|verify [output-root]');}
