import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {
  ROOT, RUNTIME, AUTHORITY_ROOT, EDGE, FFMPEG, FFPROBE, WIDTH, HEIGHT, FPS, FRAMES,
  TOOL_IDS, PRIMARY, SPEC, SPEC_FILE, sha256, hashJson, fileUrl, runtimeUrl, esc,
  readAuthority, authorityFor, baseHtml, stateFor, FFMPEG_FILTERS_BY_CLASS
} from './common.mjs';

const DEFAULT_OUT = path.join(ROOT, 'out', 'studies', 'motion-tool-learning-v3-pilot-a');
const CREATOR_SOURCE = fileURLToPath(import.meta.url);
const COMMON_SOURCE = path.join(path.dirname(CREATOR_SOURCE), 'common.mjs');
const run = (file, args, cwd = ROOT) => new Promise((resolve, reject) => {
  const child = spawn(file, args, {cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => stderr += chunk);
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(file)} failed ${code}: ${stderr}`)));
});

function htmlActors(kind, variant) {
  const count = ['stagger-three'].includes(kind) ? 3 : ['progressive-draw'].includes(kind) ? 4 : 1;
  const actors = Array.from({length: count}, (_, i) => `<rect id="a${i}" class="actor" x="0" y="0" width="1" height="1" rx="24"/>`).join('');
  return `<svg viewBox="0 0 972 972">${actors}</svg>`;
}

function stateScript(kind, variant, engineProgress) {
  return `const kind=${JSON.stringify(kind)},variant=${variant};function apply(q){const states=(${stateFor.toString()})(kind,q,variant);states.forEach((s,i)=>{const el=document.getElementById('a'+i);if(!el)return;el.setAttribute('x',s.x-s.w/2);el.setAttribute('y',s.y-s.h/2);el.setAttribute('width',s.w);el.setAttribute('height',s.h);el.setAttribute('opacity',s.o);el.setAttribute('transform','rotate('+s.r+' '+s.x+' '+s.y+')')})}window.seekFrame=f=>{const q=${engineProgress};apply(q);document.body.dataset.ready='1'};seekFrame(0);`;
}

function lottieShapeLayer(index, kind, variant) {
  const values = Array.from({length: FRAMES}, (_, frame) => stateFor(kind, frame / (FRAMES - 1), variant)[index] || {x: 486, y: 486, w: 1, h: 1, r: 0, o: 0});
  const keyframes = (field, map) => values.map((value, frame) => ({t: frame, s: map(value), h: 1}));
  const maxSize = Math.max(...values.map(value => Math.max(value.w, value.h)));
  return {ddd: 0, ind: index + 1, ty: 4, nm: `actor-${index}`, sr: 1, ks: {
    o: {a: 1, k: keyframes('o', value => [value.o * 100])},
    r: {a: 1, k: keyframes('r', value => [value.r])},
    p: {a: 1, k: keyframes('p', value => [value.x, value.y, 0])},
    a: {a: 0, k: [0, 0, 0]},
    s: {a: 1, k: keyframes('s', value => [value.w / maxSize * 100, value.h / maxSize * 100, 100])}
  }, shapes: [
    {ty: 'rc', p: {a: 0, k: [0, 0]}, s: {a: 0, k: [maxSize, maxSize]}, r: {a: 0, k: 24}, nm: 'body'},
    {ty: 'fl', c: {a: 0, k: [226 / 255, 74 / 255, 59 / 255, 1]}, o: {a: 0, k: 100}, nm: 'fill'},
    {ty: 'st', c: {a: 0, k: [127 / 255, 39 / 255, 31 / 255, 1]}, o: {a: 0, k: 100}, w: {a: 0, k: 6}, lc: 2, lj: 2, nm: 'outline'}
  ], ip: 0, op: FRAMES, st: 0, bm: 0};
}

function lottieData(kind, variant) {
  const count = kind === 'stagger-three' ? 3 : kind === 'progressive-draw' ? 4 : 1;
  return {v: '5.7.4', fr: FPS, ip: 0, op: FRAMES, w: WIDTH, h: HEIGHT, nm: `authored-v3-${kind}`, ddd: 0, assets: [], layers: Array.from({length: count}, (_, i) => lottieShapeLayer(i, kind, variant))};
}

function htmlFor(tool, sample, variant) {
  const {topic, observationClass: kind} = sample;
  const body = htmlActors(kind, variant);
  if (tool === 'gsap-html-v1') {
    const script = `const kind=${JSON.stringify(kind)},variant=${variant};const apply=${stateFor.toString()};function render(q){apply(kind,q,variant).forEach((s,i)=>{const el=document.getElementById('a'+i);if(!el)return;el.setAttribute('x',s.x-s.w/2);el.setAttribute('y',s.y-s.h/2);el.setAttribute('width',s.w);el.setAttribute('height',s.h);el.setAttribute('opacity',s.o);el.setAttribute('transform','rotate('+s.r+' '+s.x+' '+s.y+')')})}const qobj={value:0};const tl=gsap.timeline({paused:true}).to(qobj,{value:1,duration:2,ease:'none'});window.seekFrame=f=>{tl.seek(2*f/47,false);render(qobj.value);document.body.dataset.ready='1'};seekFrame(0);`;
    return baseHtml(tool, topic, body, script, `<script src="${runtimeUrl('gsap', 'dist', 'gsap.min.js')}"></script>`);
  }
  if (tool === 'motion-canvas-v1') {
    return baseHtml(tool, topic, body, stateScript(kind, variant, `MotionCanvasAuthored.seek(f,${FRAMES})`), `<script src="${fileUrl(path.join(RUNTIME, 'authored-motion-canvas.bundle.js'))}"></script>`);
  }
  if (tool === 'canvas-d3-v1') {
    return baseHtml(tool, topic, body, stateScript(kind, variant, `d3.scaleLinear().domain([0,${FRAMES - 1}]).range([0,1]).clamp(true)(f)`), `<script src="${runtimeUrl('d3', 'dist', 'd3.min.js')}"></script>`);
  }
  if (tool === 'lottie-web-v1') {
    const data = JSON.stringify(lottieData(kind, variant));
    const lottieBody = `<div id="lot" style="position:absolute;inset:0"></div>`;
    const script = `const anim=lottie.loadAnimation({container:document.getElementById('lot'),renderer:'svg',loop:false,autoplay:false,animationData:${data}});window.seekFrame=f=>{anim.goToAndStop(f,true);document.body.dataset.ready='1'};anim.addEventListener('DOMLoaded',()=>seekFrame(0));`;
    return baseHtml(tool, topic, lottieBody, script, `<script src="${runtimeUrl('lottie-web', 'build', 'player', 'lottie.min.js')}"></script>`);
  }
  if (tool === 'dotlottie-web-v1') {
    const data = JSON.stringify(JSON.stringify(lottieData(kind, variant)));
    const bodyCanvas = `<canvas id="dot" width="972" height="972" style="position:absolute;inset:0;width:972px;height:972px"></canvas>`;
    const module = `<script type="module">import {DotLottie} from '${runtimeUrl('@lottiefiles', 'dotlottie-web', 'dist', 'index.js')}';DotLottie.setWasmUrl('${runtimeUrl('@lottiefiles', 'dotlottie-web', 'dist', 'dotlottie-player.wasm')}');const anim=new DotLottie({canvas:document.getElementById('dot'),autoplay:false,loop:false,data:${data},useFrameInterpolation:false,renderConfig:{autoResize:false,devicePixelRatio:1}});await new Promise((resolve,reject)=>{if(anim.isLoaded)return resolve();anim.addEventListener('load',resolve);anim.addEventListener('loadError',reject)});window.seekFrame=async f=>{anim.setFrame(f);await new Promise(r=>requestAnimationFrame(r));document.body.dataset.ready='1'};await seekFrame(0);</script>`;
    return baseHtml(tool, topic, bodyCanvas, '', module);
  }
  throw new Error(`browser engine not implemented: ${tool}`);
}

async function captureBrowser(tool, sample, variant, frameDir, browser) {
  const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}, deviceScaleFactor: 1});
  let blockedRequests = 0;
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith('file:') && !url.startsWith('data:')) { blockedRequests++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const htmlFile = path.join(frameDir, 'scene.html');
  fs.writeFileSync(htmlFile, htmlFor(tool, sample, variant), 'utf8');
  await page.goto(pathToFileURL(htmlFile).href, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof window.seekFrame === 'function', null, {timeout: 15000});
  for (let frame = 0; frame < FRAMES; frame++) {
    await page.evaluate(async value => { await window.seekFrame(value); await new Promise(resolve => requestAnimationFrame(resolve)); }, frame);
    await page.screenshot({path: path.join(frameDir, `frame-${String(frame + 1).padStart(4, '0')}.png`)});
  }
  await page.close();
  return {blockedRequests, authoredSceneFile: htmlFile, authoredSceneSha256: sha256(htmlFile)};
}

async function captureFfmpeg(sample, variant, frameDir) {
  const states = Array.from({length: FRAMES}, (_, frame) => stateFor(sample.observationClass, frame / (FRAMES - 1), variant));
  const count = Math.max(...states.map(row => row.length));
  const actualFilters = FFMPEG_FILTERS_BY_CLASS[sample.observationClass];
  const graphHashes = []; const filterGraphs = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=#ece5d6:s=${WIDTH}x${HEIGHT}:d=0.05`];
    for (const s of states[frame]) args.push('-f', 'lavfi', '-i', `color=c=${PRIMARY}:s=400x400:d=0.05,format=rgba`);
    if (sample.observationClass === 'two-stage-sequence') args.push('-f', 'lavfi', '-i', `color=c=#f18b43:s=400x400:d=0.05,format=rgba`);
    const chains = []; let previous = '0:v';
    if (sample.observationClass === 'progressive-draw') {
      states[frame].forEach((s, index) => {
        const composed = `composed${index}`;
        chains.push(`[${previous}]drawbox=x=${Math.round(s.x - s.w / 2)}:y=${Math.round(s.y - s.h / 2)}:w=${Math.max(2, Math.round(s.w))}:h=${Math.max(2, Math.round(s.h))}:color=${PRIMARY}@${Math.max(.001, s.o).toFixed(4)}:t=fill[${composed}]`);
        previous = composed;
      });
    } else {
    states[frame].forEach((s, index) => {
      const actor = `actor${index}`; const composed = `composed${index}`;
      const actorFilters = [];
      if (sample.observationClass === 'two-stage-sequence') actorFilters.push(`zoompan=z=1:x=0:y=0:d=1:s=${Math.max(2, Math.round(s.w))}x${Math.max(2, Math.round(s.h))}:fps=24`);
      else actorFilters.push(`scale=${Math.max(2, Math.round(s.w))}:${Math.max(2, Math.round(s.h))}`);
      if (sample.observationClass === 'horizontal-wipe') actorFilters.push(`crop=${Math.max(2, Math.round(s.w))}:${Math.max(2, Math.round(s.h))}:0:0`);
      if (sample.observationClass === 'opacity-reveal') actorFilters.push('fade=t=out:st=1:d=0.01:alpha=1');
      actorFilters.push(`colorchannelmixer=aa=${Math.max(.001, s.o).toFixed(4)}`);
      if (sample.observationClass === 'quarter-turn') actorFilters.push(`rotate=${s.r.toFixed(4)}*PI/180:ow=rotw(iw):oh=roth(ih):c=none`);
      else actorFilters.push('null');
      if (sample.observationClass === 'two-stage-sequence') {
        const actorB = `actorB${index}`;
        chains.push(`[${index + 1}:v]${actorFilters.join(',')},settb=AVTB[actorA${index}]`);
        chains.push(`[${states[frame].length + 1}:v]${actorFilters.join(',')},settb=AVTB[${actorB}]`);
        chains.push(`[actorA${index}][${actorB}]xfade=transition=fade:duration=0.001:offset=0[${actor}]`);
      } else chains.push(`[${index + 1}:v]${actorFilters.join(',')}[${actor}]`);
      chains.push(`[${previous}][${actor}]overlay=x=${Math.round(s.x)}-overlay_w/2:y=${Math.round(s.y)}-overlay_h/2:format=auto[${composed}]`);
      previous = composed;
    });
    }
    const output = path.join(frameDir, `frame-${String(frame + 1).padStart(4, '0')}.png`);
    const graph = chains.join(';'); filterGraphs.push(graph); graphHashes.push(hashJson(graph));
    args.push('-filter_complex', graph, '-map', `[${previous}]`, '-frames:v', '1', output);
    await run(FFMPEG, args);
  }
  return {actualFilters, layerCount: count, filterGraphCount: graphHashes.length, distinctFilterGraphHashes: new Set(graphHashes).size, filterGraphSetSha256: hashJson(graphHashes), filterGraphs};
}

async function encode(frameDir, output) {
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-frames:v', String(FRAMES), '-c:v', 'ffv1', '-level', '3', output]);
  const raw = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', output]);
  const probe = JSON.parse(raw).streams[0];
  if (probe.codec_name !== 'ffv1' || probe.width !== WIDTH || probe.height !== HEIGHT || probe.r_frame_rate !== '24/1' || Number(probe.nb_read_frames) !== FRAMES) throw new Error(`encoded contract invalid: ${JSON.stringify(probe)}`);
  return probe;
}

async function makeReel(root, samples) {
  for (const tool of TOOL_IDS) {
    const files = samples.filter(row => row.tool === tool).map(row => path.join(root, 'samples', row.sampleId, 'sample.mkv'));
    if (!files.length) continue;
    const list = path.join(root, `${tool}-reel.txt`);
    fs.writeFileSync(list, files.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(root, `${tool}-reel.mkv`)]);
    fs.rmSync(list);
  }
}

export async function create(outRoot = DEFAULT_OUT, limit = 2) {
  const root = path.resolve(outRoot);
  if (fs.existsSync(path.join(root, 'creator.json'))) throw new Error(`immutable v3 attempt exists: ${root}`);
  fs.mkdirSync(path.join(root, 'samples'), {recursive: true});
  const authority = readAuthority();
  const browser = await chromium.launch({executablePath: EDGE, headless: true, args: ['--allow-file-access-from-files', '--disable-network-service']});
  const records = [];
  try {
    for (const tool of TOOL_IDS) for (const sample of SPEC.samples.slice(0, limit)) {
      const variant = TOOL_IDS.indexOf(tool);
      const sampleId = `${tool.replace(/-v1$/u, '')}-${String(sample.index).padStart(2, '0')}-${sample.topic}-v3`;
      const sampleDir = path.join(root, 'samples', sampleId);
      fs.mkdirSync(sampleDir, {recursive: true});
      const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `mtl-v3-${sampleId}-`));
      try {
        const invocation = tool === 'ffmpeg-layer-keyframes-v1' ? await captureFfmpeg(sample, variant, frameDir) : await captureBrowser(tool, sample, variant, frameDir, browser);
        let authoredExecutionEvidence;
        if (tool === 'ffmpeg-layer-keyframes-v1') {
          const evidenceFile = path.join(sampleDir, 'authored-filter-graphs.json');
          fs.writeFileSync(evidenceFile, JSON.stringify({schema: 'authored-ffmpeg-filter-graphs-v3', actualFilters: invocation.actualFilters, filterGraphs: invocation.filterGraphs}, null, 2) + '\n');
          authoredExecutionEvidence = {file: 'authored-filter-graphs.json', sha256: sha256(evidenceFile), bytes: fs.statSync(evidenceFile).size};
          delete invocation.filterGraphs;
        } else {
          const evidenceFile = path.join(sampleDir, 'authored-scene.html'); fs.copyFileSync(invocation.authoredSceneFile, evidenceFile);
          authoredExecutionEvidence = {file: 'authored-scene.html', sha256: sha256(evidenceFile), bytes: fs.statSync(evidenceFile).size};
          delete invocation.authoredSceneFile;
        }
        const output = path.join(sampleDir, 'sample.mkv');
        const probe = await encode(frameDir, output);
        for (const index of [1, 12, 24, 36, 48]) fs.copyFileSync(path.join(frameDir, `frame-${String(index).padStart(4, '0')}.png`), path.join(sampleDir, `frame-${String(index).padStart(4, '0')}.png`));
        const toolSpec = SPEC.tools[tool];
        const record = {
          schema: 'motion-tool-learning-sample-v3', sampleId, tool, topic: sample.topic,
          observationClass: sample.observationClass, referenceMechanic: toolSpec.mechanics[sample.index - 1],
          officialReferenceMechanic: {specSha256: sha256(SPEC_FILE), officialReferences: toolSpec.officialReferences, observed: toolSpec.observed, frameApi: toolSpec.frameApi, copyrightBoundary: 'mechanic semantics only; no example pixels, assets, templates or source code copied'},
          authority: authorityFor(tool, authority),
          creatorInvocation: {runtime: toolSpec.frameApi, networkAllowed: false, invocation, authoredExecutionEvidence, executableSha256: tool === 'ffmpeg-layer-keyframes-v1' ? authority.executables.ffmpeg.sha256 : authority.executables.edge.sha256},
          contract: {width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, durationSeconds: 2, finalEncodeMuxQc: 'ffmpeg', verificationCodec: 'ffv1'},
          artifact: {file: 'sample.mkv', sha256: sha256(output), bytes: fs.statSync(output).size, probe},
          status: 'unverified'
        };
        record.recordSha256 = hashJson(record);
        fs.writeFileSync(path.join(sampleDir, 'creator.sample.json'), JSON.stringify(record, null, 2) + '\n');
        records.push(record);
      } finally { fs.rmSync(frameDir, {recursive: true, force: true}); }
    }
  } finally { await browser.close(); }
  await makeReel(root, records);
  const creator = {
    schema: 'motion-tool-learning-creator-v3', createdAt: new Date().toISOString(),
    supersedesForLearningOnly: ['motion-tool-learning-v1', 'motion-tool-learning-v2'],
    resultScope: limit === 10 ? 'full-curriculum' : 'feasibility-pilot',
    promotionEligible: false,
    reason: limit === 10 ? 'Independent verifier has not run.' : `Only ${limit} of 10 mechanics per tool were rendered.`,
    referenceMechanics: {file: path.relative(ROOT, SPEC_FILE).replaceAll('\\', '/'), sha256: sha256(SPEC_FILE)},
    implementation: {creator: {file: path.relative(ROOT, CREATOR_SOURCE).replaceAll('\\', '/'), sha256: sha256(CREATOR_SOURCE)}, common: {file: path.relative(ROOT, COMMON_SOURCE).replaceAll('\\', '/'), sha256: sha256(COMMON_SOURCE)}},
    authority: {authorityId: authority.authorityId, creatorSha256: authority.creatorSha256, adapterSha256: authority.adapter.sha256},
    sampleCount: records.length, samplesPerTool: limit, requiredSamplesPerTool: 10,
    samples: records.map(row => row.sampleId)
  };
  creator.creatorSha256 = hashJson(creator);
  fs.writeFileSync(path.join(root, 'creator.json'), JSON.stringify(creator, null, 2) + '\n');
  return creator;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(JSON.stringify(await create(process.argv[2] || DEFAULT_OUT, Number(process.argv[3] || 2))));
