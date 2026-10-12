import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const RUNTIME = path.join(ROOT, 'production', 'motion-engines', 'nonhuman-runtime-v1');
export const AUTHORITY_ROOT = path.join(ROOT, 'out', 'private-tests', 'nonhuman-motion-engine-smoke-v1');
export const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const FFMPEG = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
export const FFPROBE = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
export const WIDTH = 972;
export const HEIGHT = 972;
export const FPS = 24;
export const FRAMES = 48;
export const TOOL_IDS = ['gsap-html-v1', 'motion-canvas-v1', 'canvas-d3-v1', 'lottie-web-v1', 'dotlottie-web-v1', 'ffmpeg-layer-keyframes-v1'];
export const PRIMARY = '#e24a3b';
export const PRIMARY_RGB = [226, 74, 59];
export const SPEC_FILE = path.join(HERE, 'reference-mechanics.json');
export const SPEC = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
export const FFMPEG_FILTERS_BY_CLASS = Object.freeze({
  'translate-x': ['overlay'],
  'scale-up': ['scale', 'overlay'],
  'quarter-turn': ['rotate', 'overlay'],
  'opacity-reveal': ['fade', 'colorchannelmixer', 'overlay'],
  'stagger-three': ['overlay'],
  'progressive-draw': ['drawbox'],
  'horizontal-wipe': ['crop', 'overlay'],
  'closed-orbit': ['overlay'],
  'bounce-settle': ['overlay'],
  'two-stage-sequence': ['zoompan', 'xfade', 'overlay']
});

export const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const hashJson = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const fileUrl = file => pathToFileURL(file).href;
export const runtimeUrl = (...parts) => fileUrl(path.join(RUNTIME, 'node_modules', ...parts));
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function readAuthority() {
  const authority = JSON.parse(fs.readFileSync(path.join(AUTHORITY_ROOT, 'creator.json'), 'utf8'));
  if (authority.authorityId !== 'newsroom-deterministic-motion-engines-v1') throw new Error('engine authority id drift');
  if (authority.creatorSha256 !== '63b989bab30c0ee07634a8cd0b32ae7d0615d59b32c5415efae6b9831089fe18') throw new Error('engine creator authority drift');
  if (authority.adapter?.sha256 !== 'ed1f1820ecd1c061c97e4e434b18527ffa9464de45c24d232738aa5bfbd4b59c') throw new Error('engine adapter authority drift');
  for (const tool of TOOL_IDS) if (!authority.engines.some(engine => engine.engineId === tool)) throw new Error(`missing engine authority: ${tool}`);
  return authority;
}

export function authorityFor(tool, authority) {
  const engine = authority.engines.find(item => item.engineId === tool);
  return {
    engineId: tool,
    authorityId: engine.authorityId,
    rendererContract: engine.rendererContract,
    authorityBundleId: authority.authorityId,
    authorityBundleSha256: authority.creatorSha256,
    adapterSha256: authority.adapter.sha256,
    dependencies: engine.dependencies,
    status: 'active-verified'
  };
}

export function topicSvg(topic) {
  const common = 'fill="none" stroke="#28435f" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".42"';
  const shapes = {
    'compass-route': `<circle cx="486" cy="486" r="250" ${common}/><path d="M390 585 520 355 585 520Z" ${common}/>` ,
    'coffee-steam': `<path d="M300 560h300v130H300zM600 585h55q70 0 70 50t-70 50h-55M360 500c-55-65 55-85 0-150M500 500c-55-65 55-85 0-150" ${common}/>` ,
    'wind-turbine': `<path d="M486 500v260M486 500 330 300M486 500 700 390M486 500 410 250" ${common}/><circle cx="486" cy="500" r="36" ${common}/>` ,
    'seedling-growth': `<path d="M486 720V430M486 520c-120 20-180-70-175-150 100-5 170 45 175 150ZM486 610c120 20 180-70 175-150-100-5-170 45-175 150Z" ${common}/>` ,
    'metro-map': `<path d="M220 670 400 490 560 610 760 360M250 390h500" ${common}/><circle cx="400" cy="490" r="25" ${common}/><circle cx="560" cy="610" r="25" ${common}/>` ,
    'weather-front': `<path d="M260 570c0-75 65-130 140-115 40-120 230-90 230 40 100-10 140 150 20 165H310c-70 0-90-90-50-90ZM340 720l-35 75M500 720l-35 75M660 720l-35 75" ${common}/>` ,
    'archive-index': `<path d="M250 340h210l55 70h210v300H250zM315 500h350M315 580h270" ${common}/>` ,
    'solar-orbit': `<circle cx="486" cy="500" r="90" ${common}/><ellipse cx="486" cy="500" rx="300" ry="150" ${common}/><circle cx="755" cy="430" r="34" ${common}/>` ,
    'parcel-sort': `<path d="M300 400 486 300l186 100v220L486 720 300 620ZM300 400l186 100 186-100M486 500v220" ${common}/>` ,
    'music-wave': `<path d="M230 610V500M320 680V420M410 620V480M500 720V380M590 640V460M680 690V410M770 610V500" ${common}/>`
  };
  return shapes[topic];
}

export function baseHtml(tool, topic, body, script, extraHead = '') {
  return `<!doctype html><html><head><meta charset="utf-8">${extraHead}<style>html,body{margin:0;overflow:hidden;background:#ece5d6}#stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#ece5d6;font-family:Arial,sans-serif}.title{position:absolute;left:54px;top:42px;font:700 30px Arial;color:#1d2c3d;letter-spacing:.6px}.topic{position:absolute;left:54px;top:82px;font:600 21px Arial;color:#56697d}.plate{position:absolute;inset:150px 60px 70px;border:4px solid #c8bfae;border-radius:36px;background:#f7f1e6}.icon{position:absolute;inset:0}svg{position:absolute;inset:0;width:${WIDTH}px;height:${HEIGHT}px}.actor{fill:${PRIMARY};stroke:#7f271f;stroke-width:6}.actor-line{fill:none;stroke:${PRIMARY};stroke-width:34;stroke-linecap:round;stroke-linejoin:round}</style></head><body><div id="stage"><div class="plate"></div><svg class="icon" viewBox="0 0 972 972">${topicSvg(topic)}</svg><div class="title">${esc(tool)}</div><div class="topic">${esc(topic)}</div>${body}</div><script>${script}</script></body></html>`;
}

export function stateFor(kind, q, variant = 0) {
  const ox = (variant % 3 - 1) * 18;
  const oy = ((variant * 2) % 3 - 1) * 14;
  const ease = q < .5 ? 4 * q * q * q : 1 - ((-2 * q + 2) ** 3) / 2;
  if (kind === 'translate-x') return [{x: 190 + 590 * ease + ox, y: 525 + oy, w: 120, h: 120, r: 0, o: 1}];
  if (kind === 'scale-up') { const size = 68 + 230 * ease; return [{x: 486 + ox, y: 525 + oy, w: size, h: size, r: 0, o: 1}]; }
  if (kind === 'quarter-turn') return [{x: 486 + ox, y: 525 + oy, w: 310, h: 90, r: 90 * ease, o: 1}];
  if (kind === 'opacity-reveal') return [{x: 486 + ox, y: 525 + oy, w: 290, h: 190, r: 0, o: ease}];
  if (kind === 'stagger-three') return [0, 1, 2].map((i) => ({x: 295 + i * 190 + ox, y: 525 + oy, w: 105, h: 105, r: 0, o: Math.max(0, Math.min(1, q * 3 - i))}));
  if (kind === 'progressive-draw') return [0, 1, 2, 3].map((i) => ({x: 230 + i * 150 + ox, y: 410 + (i % 2) * 230 + oy, w: 145, h: 34, r: i % 2 ? -32 : 32, o: Math.max(0, Math.min(1, q * 4 - i))}));
  if (kind === 'horizontal-wipe') return [{x: 225 + 520 * ease / 2 + ox, y: 525 + oy, w: Math.max(3, 520 * ease), h: 250, r: 0, o: 1}];
  if (kind === 'closed-orbit') { const a = -Math.PI / 2 + Math.PI * 2 * q; return [{x: 486 + 260 * Math.cos(a) + ox, y: 525 + 185 * Math.sin(a) + oy, w: 92, h: 92, r: 0, o: 1}]; }
  if (kind === 'bounce-settle') { const y = q < .65 ? 350 + 300 * q / .65 : 600 + 50 * (1 - (q - .65) / .35) * Math.cos(2 * Math.PI * (q - .65) / .35); return [{x: 486 + ox, y: y + oy, w: 130, h: 130, r: 0, o: 1}]; }
  if (kind === 'two-stage-sequence') { const p1 = Math.min(1, q * 2); const p2 = Math.max(0, q * 2 - 1); const size = 95 + 145 * p2; return [{x: 220 + 470 * p1 + ox, y: 525 + oy, w: size, h: size, r: 0, o: 1}]; }
  throw new Error(`unknown mechanic class: ${kind}`);
}

export function readPngSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error(`not png: ${file}`);
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}
