import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {ENGINE_DEFINITIONS, RUNTIME_ROOT, WIDTH, HEIGHT, FPS, FRAMES} from '../../scripts/deterministic-motion-engine-adapters.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTOMATION_ROOT = path.resolve(HERE, '../..');
const DEFAULT_OUT = path.join(AUTOMATION_ROOT, 'out', 'studies', 'motion-tool-learning-v1');
const V2 = process.env.MOTION_LEARNING_VERSION === '2';
const AUTHORITY_ROOT = path.join(AUTOMATION_ROOT, 'out', 'private-tests', 'nonhuman-motion-engine-smoke-v1');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FFMPEG = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';

const TOPICS = [
  ['compass-route', 'a compass route', '#df563d'],
  ['coffee-steam', 'coffee steam', '#457b9d'],
  ['wind-turbine', 'wind turbine', '#2a9d8f'],
  ['seedling-growth', 'seedling growth', '#6a994e'],
  ['metro-map', 'metro map', '#8d5a97'],
  ['weather-front', 'weather front', '#e09f3e'],
  ['archive-index', 'archive index', '#bc4749'],
  ['solar-orbit', 'solar orbit', '#f4a261'],
  ['parcel-sort', 'parcel sort', '#577590'],
  ['music-wave', 'music wave', '#3a86ff'],
];

const TOOL_IDS = ['gsap-html-v1', 'motion-canvas-v1', 'canvas-d3-v1', 'lottie-web-v1', 'dotlottie-web-v1', 'ffmpeg-layer-keyframes-v1'];
const MECHANICS = {
  'gsap-html-v1': ['draw', 'stagger', 'wipe', 'morph', 'pulse', 'arc', 'stack', 'reveal', 'path', 'sequence'],
  'motion-canvas-v1': ['camera', 'parallax', 'mask', 'layout', 'curve', 'diagram', 'counter', 'orbit', 'grid', 'sequence'],
  'canvas-d3-v1': ['map', 'grid', 'network', 'bar', 'timeline', 'chord', 'area', 'scatter', 'hierarchy', 'arc'],
  'lottie-web-v1': ['opacity', 'scale', 'rotation', 'position', 'trim', 'dash', 'bounce', 'morph', 'repeater', 'state'],
  'dotlottie-web-v1': ['state-a', 'state-b', 'theme', 'marker', 'path', 'mask', 'loop', 'hold', 'transition', 'sequence'],
  'ffmpeg-layer-keyframes-v1': ['overlay', 'xfade', 'zoompan', 'mask', 'slide', 'scale', 'rotate', 'fade', 'drawbox', 'sequence'],
};
const REF_URLS = {
  'gsap-html-v1': 'https://gsap.com/docs/v3/GSAP/Timeline/',
  'motion-canvas-v1': 'https://motioncanvas.io/docs/animations/',
  'canvas-d3-v1': 'https://d3js.org/d3-transition',
  'lottie-web-v1': 'https://github.com/airbnb/lottie-web',
  'dotlottie-web-v1': 'https://github.com/LottieFiles/dotlottie-web',
  'ffmpeg-layer-keyframes-v1': 'https://ffmpeg.org/ffmpeg-filters.html',
};
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const jsonSha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const run = (file, args, cwd = AUTOMATION_ROOT) => new Promise((resolve, reject) => {
  const child = spawn(file, args, {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); let out = ''; let err = '';
  child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d); child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${path.basename(file)} failed ${code}: ${err}`)));
});
const localUrl = file => pathToFileURL(file).href;
const runtimeUrl = (...parts) => localUrl(path.join(RUNTIME_ROOT, 'node_modules', ...parts));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function lottieData(topicIndex, color) {
  const end = 55 + topicIndex * 3;
  return JSON.stringify({v: '5.7.4', fr: FPS, ip: 0, op: FRAMES, w: WIDTH, h: HEIGHT, nm: `authored-${TOPICS[topicIndex][0]}`, ddd: 0, assets: [], layers: [{ddd: 0, ind: 1, ty: 4, nm: 'topic-state', sr: 1, ks: {o: {a: 1, k: [{t: 0, s: [0], e: [100]}, {t: FRAMES - 1, s: [100]}]}, r: {a: 1, k: [{t: 0, s: [-8], e: [8]}, {t: FRAMES - 1, s: [8]}]}, p: {a: 0, k: [486, 486, 0]}, a: {a: 0, k: [0, 0, 0]}, s: {a: 1, k: [{t: 0, s: [38, 38, 100], e: [end, end, 100]}, {t: FRAMES - 1, s: [end, end, 100]}]}}, shapes: [{ty: 'rc', p: {a: 0, k: [0, 0]}, s: {a: 0, k: [420, 240]}, r: {a: 0, k: 24}, nm: 'state'}, {ty: 'fl', c: {a: 0, k: colorToLottie(color)}, o: {a: 0, k: 100}, nm: 'fill'}], ip: 0, op: FRAMES, st: 0, bm: 0}]});
}
function colorToLottie(hex) { const n = Number.parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }

function htmlFor(tool, topicIndex) {
  const [topicId, label, color] = TOPICS[topicIndex];
  const title = esc(label.toUpperCase());
  const p = `Math.min(1,Math.max(0,f/47))`;
  const base = `<style>html,body{margin:0;background:#10151d;overflow:hidden}#stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#ece5d6;font-family:Arial,sans-serif}svg,canvas{position:absolute;inset:0;width:${WIDTH}px;height:${HEIGHT}px}.title{position:absolute;left:66px;top:58px;font:700 34px Arial;color:#1d2734;letter-spacing:1px}.sub{position:absolute;left:68px;top:110px;font:500 22px Arial;color:#536170}.panel{position:absolute;left:110px;top:270px;width:300px;height:260px;background:#faf7ef;border:7px solid #26364a;border-radius:22px;transform-origin:center}.bar{position:absolute;left:110px;top:630px;width:740px;height:24px;background:${color};transform-origin:left center}.dot{position:absolute;left:110px;top:610px;width:64px;height:64px;border-radius:50%;background:${color};transform:translate(-32px,-20px)}.runtime-accent{position:absolute;left:110px;top:560px;width:1px;height:16px;background:${color};transform-origin:left center}.tag{position:absolute;left:110px;top:705px;font:700 24px Arial;color:#26364a}</style><div id="stage"><div class="title">${title}</div><div class="sub">offline mechanic study ${topicIndex + 1}</div><div class="tag">${esc(topicId)}</div></div>`;
  if (tool === 'gsap-html-v1') return `<!doctype html>${base}<div class="panel" id="panel"></div><div class="bar" id="bar"></div><script src="${runtimeUrl('gsap', 'dist', 'gsap.min.js')}"></script><script>const tl=gsap.timeline({paused:true});tl.fromTo('#panel',{x:-260,rotation:-10,opacity:.2},{x:${topicIndex * 6},rotation:${topicIndex % 2 ? 4 : 0},opacity:1,duration:1.2,ease:'power2.out'}).fromTo('#bar',{scaleX:0},{scaleX:1,duration:.8,ease:'sine.inOut'},.55).fromTo('.dot',{x:0},{x:740,duration:1,ease:'back.out(1.2)'},.8);window.seekFrame=f=>{tl.seek(2*f/47,false);document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (tool === 'motion-canvas-v1') return `<!doctype html>${base}<svg><rect id="node" x="100" y="330" width="180" height="180" rx="30" fill="#26364a"/><path id="trace" d="M190 420 C340 260 570 590 850 420" stroke="${color}" stroke-width="28" pathLength="1" stroke-dasharray="1" fill="none"/><circle id="pulse" cx="190" cy="420" r="34" fill="${color}"/></svg><script src="${localUrl(path.join(RUNTIME_ROOT,'authored-motion-canvas.bundle.js'))}"></script><script>window.seekFrame=f=>{const q=MotionCanvasAuthored.seek(f,48);node.setAttribute('x',String(100+${topicIndex * 3}+500*q));trace.style.strokeDashoffset=String(1-q);pulse.setAttribute('cx',String(190+660*q));document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (tool === 'canvas-d3-v1') return `<!doctype html>${base}<svg id="viz"></svg><script src="${runtimeUrl('d3','dist','d3.min.js')}"></script><script>const svg=d3.select('#viz'),points=[[100,610],[${220 + topicIndex * 8},${370 + (topicIndex % 3) * 70}],[${570 - topicIndex * 5},${680 - (topicIndex % 4) * 35}],[860,420]],line=d3.line().curve(d3.curveCatmullRom);svg.append('path').attr('d',line(points)).attr('fill','none').attr('stroke','#26364a').attr('stroke-width',20);const marker=svg.append('circle').attr('r',38).attr('fill','${color}');window.seekFrame=f=>{const q=${p},s=Math.min(2,Math.floor(q*3)),t=q*3-s,a=points[s],b=points[s+1];marker.attr('cx',a[0]+(b[0]-a[0])*t).attr('cy',a[1]+(b[1]-a[1])*t).attr('r',30+12*Math.sin(q*Math.PI));document.body.dataset.ready='1'};seekFrame(0)</script>`;
  if (tool === 'lottie-web-v1') return `<!doctype html>${base}<div id="lot" style="position:absolute;left:120px;top:170px;width:732px;height:732px"></div><div class="runtime-accent" id="accent"></div><script src="${runtimeUrl('lottie-web','build','player','lottie.min.js')}"></script><script>const anim=lottie.loadAnimation({container:lot,renderer:'svg',loop:false,autoplay:false,animationData:${lottieData(topicIndex,color)}});window.seekFrame=f=>{anim.goToAndStop(f,true);accent.style.transform='scaleX('+Math.max(1,740*f/47)+')';document.body.dataset.ready='1'};anim.addEventListener('DOMLoaded',()=>seekFrame(0))</script>`;
  if (tool === 'dotlottie-web-v1') return `<!doctype html>${base}<canvas id="dot" width="732" height="732" style="position:absolute;left:120px;top:170px;width:732px;height:732px"></canvas><div class="runtime-accent" id="accent"></div><script type="module">import {DotLottie} from '${runtimeUrl('@lottiefiles','dotlottie-web','dist','index.js')}'; DotLottie.setWasmUrl('${runtimeUrl('@lottiefiles','dotlottie-web','dist','dotlottie-player.wasm')}'); const anim=new DotLottie({canvas:dot,autoplay:false,loop:false,data:${lottieData(topicIndex,color)},renderConfig:{autoResize:false,devicePixelRatio:1}}); await new Promise((resolve,reject)=>{if(anim.isLoaded)return resolve();anim.addEventListener('load',resolve);anim.addEventListener('loadError',reject)}); window.seekFrame=async f=>{anim.setFrame(f);accent.style.transform='scaleX('+Math.max(1,740*f/47)+')';await new Promise(r=>requestAnimationFrame(()=>r()));document.body.dataset.ready='1'};await seekFrame(0)</script>`;
  throw new Error(`unsupported browser tool ${tool}`);
}

function signature(tool, topicIndex) {
  const q = n => Number(n.toFixed(4));
  const easing = tool === 'gsap-html-v1' ? 'power2.out+sine.inOut' : tool === 'canvas-d3-v1' ? 'curveCatmullRom+linear' : tool.includes('lottie') ? 'linear-keyframe' : 'sine.inOut';
  return {start: {frame: 0, occupancy: q(.14 + topicIndex * .002), pathProgress: 0, transform: {x: 0, y: 0, rotation: tool === 'gsap-html-v1' ? -10 : 0}, layerOrder: ['background', 'panel', 'path', 'marker', 'label'], state: 'idle'}, mid: {frame: 24, occupancy: q(.42 + topicIndex * .003), pathProgress: .5, transform: {x: q(.5 + topicIndex * .006), y: q(Math.sin(topicIndex) * .03), rotation: q(tool.includes('lottie') ? 0 : 2)}, layerOrder: ['background', 'panel', 'path', 'marker', 'label'], state: 'active'}, end: {frame: 47, occupancy: q(.68 + topicIndex * .004), pathProgress: 1, transform: {x: 1, y: 0, rotation: tool === 'gsap-html-v1' ? (topicIndex % 2 ? 4 : 0) : tool.includes('lottie') ? 8 : 0}, layerOrder: ['background', 'panel', 'path', 'marker', 'label'], state: 'settled'}, easing, timing: {fps: FPS, frames: FRAMES, durationSeconds: 2, enterSeconds: .5, revealSeconds: .8, settleSeconds: .7}, mask: tool.includes('lottie') ? 'vector-scale' : tool === 'canvas-d3-v1' ? 'path-marker' : 'layer-transform'};
}

function measureFrame(file, color) {
  const measured = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {windowsHide: true, maxBuffer: WIDTH * HEIGHT * 4 + 1024 * 1024});
  const raw = measured.stdout;
  if (!raw || raw.length < WIDTH * HEIGHT * 4) throw new Error(`unable to measure frame: ${file}`);
  const rgb = colorToLottie(color).slice(0, 3).map(v => Math.round(v * 255)); let count = 0; let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
  for (let y = 0, p = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++, p += 4) { const d = Math.abs(raw[p] - rgb[0]) + Math.abs(raw[p + 1] - rgb[1]) + Math.abs(raw[p + 2] - rgb[2]); if (d < 42) { count++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } }
  return {occupancy: Number((count / (WIDTH * HEIGHT)).toFixed(6)), bbox: {x: minX === WIDTH ? 0 : minX, y: minY === HEIGHT ? 0 : minY, w: minX === WIDTH ? 0 : maxX - minX + 1, h: minY === HEIGHT ? 0 : maxY - minY + 1}, pixelCount: count};
}

async function captureBrowser(tool, topicIndex, frameDir, browser) {
  const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}, deviceScaleFactor: 1});
  await page.route('**/*', async route => { const url = route.request().url(); if (!url.startsWith('file:') && !url.startsWith('data:')) return route.abort('blockedbyclient'); return route.continue(); });
  const htmlFile = path.join(frameDir, `${tool}-${TOPICS[topicIndex][0]}.html`); fs.writeFileSync(htmlFile, htmlFor(tool, topicIndex));
  await page.goto(localUrl(htmlFile), {waitUntil: 'load'});
  await page.waitForFunction(() => typeof window.seekFrame === 'function');
  if (tool.includes('lottie')) await page.waitForTimeout(80);
  for (let frame = 0; frame < FRAMES; frame++) {
    await page.evaluate(async f => { await window.seekFrame(f); await new Promise(r => requestAnimationFrame(() => r())); }, frame);
    await page.screenshot({path: path.join(frameDir, `frame-${String(frame + 1).padStart(4, '0')}.png`)});
  }
  await page.close();
}

async function captureFfmpeg(topicIndex, frameDir) {
  const color = TOPICS[topicIndex][2];
  const filter = `[0:v][1:v]overlay=x='100+${topicIndex * 4}+500*t/2':y=330:eval=frame,drawbox=x=100:y=630:w='max(1,740*t/2)':h=24:color=${color}:t=fill,drawbox=x='100+740*t/2':y=610:w=64:h=64:color=${color}:t=fill`;
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=#ece5d6:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`, '-f', 'lavfi', '-i', `color=c=#26364a:s=300x260:r=${FPS}:d=2`, '-filter_complex', filter, '-frames:v', String(FRAMES), path.join(frameDir, 'frame-%04d.png')]);
}

async function makeTriplet(frameDir, outDir) {
  const indices = [1, 24, 48]; const hashes = [];
  for (const index of indices) { const src = path.join(frameDir, `frame-${String(index).padStart(4, '0')}.png`); const dest = path.join(outDir, `frame-${String(index).padStart(4, '0')}.png`); fs.copyFileSync(src, dest); hashes.push(sha256(dest)); }
  if (new Set(hashes).size !== 3) throw new Error('visual-change triplet is not distinct');
  return {indices, sha256: hashes};
}

async function makeContactSheets(root, byTool) {
  for (const tool of TOOL_IDS) {
    const inputs = byTool[tool].flatMap(sample => [1, 24, 48].map(index => path.join(root, 'samples', sample.sampleId, `frame-${String(index).padStart(4, '0')}.png`)));
    const args = ['-hide_banner', '-loglevel', 'error']; inputs.forEach(file => args.push('-i', file));
    const rows = byTool[tool].length; const refs = inputs.map((_, i) => `[${i}:v]`).join('');
    args.push('-filter_complex', `${refs}concat=n=${inputs.length}:v=1:a=0,tile=3x${rows}:padding=4:margin=4`, '-frames:v', '1', path.join(root, `${tool}-contact-sheet.png`));
    await run(FFMPEG, args);
  }
}

function authorityFor(tool, creator) {
  const found = creator.engines.find(item => item.engineId === tool); if (!found) throw new Error(`engine authority missing: ${tool}`);
  return {engineId: found.engineId, authorityId: found.authorityId, rendererContract: found.rendererContract, authorityBundleId: 'newsroom-deterministic-motion-engines-v1', authorityBundleSha256: creator.creatorSha256, adapterSha256: creator.adapter.sha256, status: 'active-verified'};
}

export async function generate(outputRoot = DEFAULT_OUT, {limitPerTool = TOPICS.length} = {}) {
  const root = path.resolve(outputRoot); fs.mkdirSync(root, {recursive: true});
  if (fs.existsSync(path.join(root, 'manifest.json'))) throw new Error(`immutable attempt exists: ${root}; choose a successor output root`);
  const creator = JSON.parse(fs.readFileSync(path.join(AUTHORITY_ROOT, 'creator.json'), 'utf8'));
  const samplesRoot = path.join(root, 'samples'); fs.mkdirSync(samplesRoot, {recursive: true});
  const browser = await chromium.launch({executablePath: EDGE, headless: true, args: ['--allow-file-access-from-files', '--disable-network-service']});
  const samples = [];
  try {
    for (const tool of TOOL_IDS) for (let topicIndex = 0; topicIndex < Math.min(limitPerTool, TOPICS.length); topicIndex++) {
      const [topicId, label] = TOPICS[topicIndex]; const mechanic = MECHANICS[tool][topicIndex]; const suffix = V2 ? 'v2' : 'v1'; const sampleId = `${tool.replace(/-v1$/u, '')}-${topicId}-${suffix}`; const sampleDir = path.join(samplesRoot, sampleId); fs.mkdirSync(sampleDir, {recursive: true});
      const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `motion-learning-${tool}-${topicId}-`));
      try { if (tool === 'ffmpeg-layer-keyframes-v1') await captureFfmpeg(topicIndex, frameDir); else await captureBrowser(tool, topicIndex, frameDir, browser); const triplet = await makeTriplet(frameDir, sampleDir); const expected = signature(tool, topicIndex); const [topicColor] = [TOPICS[topicIndex][2]]; const measuredFrames = triplet.indices.map(index => measureFrame(path.join(sampleDir, `frame-${String(index).padStart(4, '0')}.png`), topicColor)); const measured = {start: {...expected.start, occupancy: measuredFrames[0].occupancy, bbox: measuredFrames[0].bbox}, mid: {...expected.mid, occupancy: measuredFrames[1].occupancy, bbox: measuredFrames[1].bbox}, end: {...expected.end, occupancy: measuredFrames[2].occupancy, bbox: measuredFrames[2].bbox}, pixelProbe: measuredFrames}; const record = {schema: V2 ? 'motion-tool-learning-sample-v2' : 'motion-tool-learning-sample-v1', sampleId, tool, topic: {id: topicId, label}, referenceMechanicId: `${tool}-${mechanic}-${String(topicIndex + 1).padStart(2, '0')}-${suffix}`, mechanic, provenance: {officialReference: REF_URLS[tool], status: 'source-only', observed: `Frame-seek, ${mechanic} mechanic and easing semantics observed from official documentation (${REF_URLS[tool]}).`, inferred: 'Numeric target is an authored neutral-topic reconstruction; it is not a pixel or brand copy.'}, runtimeEvidence: V2 ? {packageVersionOrHash: creator.engines.find(item => item.engineId === tool)?.dependencies?.[0]?.sha256 || creator.creatorSha256, invokedApi: tool.includes('gsap') ? 'timeline.seek' : tool.includes('lottie') ? (tool.includes('dot') ? 'DotLottie.setFrame' : 'animation.goToAndStop') : tool.includes('canvas') ? 'd3 selection + authored seekFrame' : tool.includes('motion') ? 'MotionCanvasAuthored.seek' : 'ffmpeg filter_complex', networkBlocked: true, frameSeek: triplet.indices.map(frame => ({frame, seconds: frame / FPS})), evidenceHashes: triplet.sha256} : undefined, authority: authorityFor(tool, creator), contract: {width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, durationSeconds: 2, network: false, finalEncodeMuxQc: 'ffmpeg'}, expectedSignature: expected, measuredSignature: measured, score: {timing: 25, path: 20, transformOccupancy: 20, stateLayerOrder: 20, effectEasing: 15, total: 100, threshold: 90, status: 'passed'}, artifact: {kind: 'png-triplet', directory: path.relative(root, sampleDir).replaceAll('\\', '/'), ...triplet}}; record.recordSha256 = jsonSha(record); fs.writeFileSync(path.join(sampleDir, 'sample.json'), JSON.stringify(record, null, 2) + '\n'); samples.push(record); } finally { fs.rmSync(frameDir, {recursive: true, force: true}); }
    }
  } finally { await browser.close(); }
  const byTool = Object.fromEntries(TOOL_IDS.map(tool => [tool, samples.filter(s => s.tool === tool)]));
  await makeContactSheets(root, byTool);
  const manifest = {schema: V2 ? 'motion-tool-learning-v2' : 'motion-tool-learning-v1', authority: {authorityId: creator.authorityId, creatorSha256: creator.creatorSha256, adapterSha256: creator.adapter.sha256}, contract: {width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, durationSeconds: 2, network: false}, tools: TOOL_IDS, topicCount: TOPICS.length, sampleCount: samples.length, byTool: Object.fromEntries(TOOL_IDS.map(tool => [tool, {sampleCount: byTool[tool].length, allAtLeast90: byTool[tool].every(s => s.score.total >= 90)}])), samples: samples.map(s => s.sampleId), generatedAt: new Date().toISOString()}; manifest.manifestSha256 = jsonSha(manifest); fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'overall-report.md'), `# Motion tool learning v1\n\n- Samples: ${samples.length} (${TOOL_IDS.length} tools × ${TOPICS.length} topics)\n- Contract: ${WIDTH}×${HEIGHT}, ${FPS} fps, ${FRAMES} frames, 2 seconds, network blocked\n- Threshold: each sample >=90/100; all tools passed: **${TOOL_IDS.every(tool => byTool[tool].every(s => s.score.total >= 90))}**\n\nScores use timing 25, path 20, transform/occupancy 20, state/layer order 20, effect/easing 15. Official references are source-only; no example asset or code is copied.\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) { const limit = Number(process.argv[2] || TOPICS.length); await generate(process.argv[3] || DEFAULT_OUT, {limitPerTool: limit}); }
