import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import {
  ROOT, FFMPEG, FFPROBE, WIDTH, HEIGHT, FPS, FRAMES, TOOL_IDS, PRIMARY_RGB,
  SPEC, SPEC_FILE, sha256, hashJson, readAuthority, readPngSize, FFMPEG_FILTERS_BY_CLASS
} from './common.mjs';

const DEFAULT_ROOT = path.join(ROOT, 'out', 'studies', 'motion-tool-learning-v3-pilot-a');
const VERIFIER_SOURCE = fileURLToPath(import.meta.url);
const CREATOR_SOURCE = path.join(path.dirname(VERIFIER_SOURCE), 'create-v3.mjs');
const COMMON_SOURCE = path.join(path.dirname(VERIFIER_SOURCE), 'common.mjs');
const DIST_THRESHOLD = 60;
const REQUIRED_RUNTIME_TOKEN = Object.freeze({
  'gsap-html-v1': ['gsap.timeline', '.seek('],
  'motion-canvas-v1': ['MotionCanvasAuthored.seek'],
  'canvas-d3-v1': ['d3.scaleLinear'],
  'lottie-web-v1': ['lottie.loadAnimation', 'goToAndStop'],
  'dotlottie-web-v1': ['new DotLottie', 'setFrame'],
  'ffmpeg-layer-keyframes-v1': []
});

function run(file, args, options = {}) {
  const result = spawnSync(file, args, {windowsHide: true, encoding: options.encoding ?? 'utf8', maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed ${result.status}: ${result.stderr}`);
  return result.stdout;
}

function decodeArtifact(file, frameDir) {
  run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vsync', '0', path.join(frameDir, 'frame-%04d.png')]);
  const files = fs.readdirSync(frameDir).filter(name => /^frame-\d{4}\.png$/u.test(name)).sort();
  if (files.length !== FRAMES) throw new Error(`decoded frame count invalid: ${files.length}`);
  return files.map(name => path.join(frameDir, name));
}

function measurePng(file) {
  const raw = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {windowsHide: true, maxBuffer: WIDTH * HEIGHT * 4});
  if (raw.status !== 0 || raw.stdout.length !== WIDTH * HEIGHT * 3) throw new Error(`pixel decode failed: ${file}`);
  let count = 0; let sumX = 0; let sumY = 0; let minX = WIDTH; let minY = HEIGHT; let maxX = -1; let maxY = -1; let redEnergy = 0;
  const data = raw.stdout;
  for (let y = 0, p = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++, p += 3) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const d = Math.abs(r - PRIMARY_RGB[0]) + Math.abs(g - PRIMARY_RGB[1]) + Math.abs(b - PRIMARY_RGB[2]);
    redEnergy += Math.max(0, r - g - 20) + Math.max(0, r - b - 20);
    if (d <= DIST_THRESHOLD) { count++; sumX += x; sumY += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return {count, redEnergy, cx: count ? sumX / count : null, cy: count ? sumY / count : null, bbox: count ? {x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1} : {x: 0, y: 0, w: 0, h: 0}};
}

function directionChanges(values) {
  const signs = [];
  for (let i = 1; i < values.length; i++) { const d = values[i] - values[i - 1]; if (Math.abs(d) > .8) signs.push(Math.sign(d)); }
  let changes = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
  return changes;
}

function scoreObservations(kind, frames) {
  const at = fraction => frames[Math.round((frames.length - 1) * fraction)];
  const counts = frames.map(frame => frame.count);
  const cxs = frames.map(frame => frame.cx ?? 0);
  const cys = frames.map(frame => frame.cy ?? 0);
  const areas = frames.map(frame => frame.bbox.w * frame.bbox.h);
  const energies = frames.map(frame => frame.redEnergy);
  const distinctHashesProxy = new Set(frames.map(frame => `${Math.round(frame.cx || 0)}:${Math.round(frame.cy || 0)}:${frame.count}:${frame.bbox.w}:${frame.bbox.h}:${Math.round(frame.redEnergy / 10000)}`)).size;
  const common = [
    {id: 'visible-output', pass: Math.max(...counts) > 2500},
    {id: 'temporal-change', pass: distinctHashesProxy >= 8},
    {id: 'non-static-span', pass: Math.max(...cxs) - Math.min(...cxs) > 30 || Math.max(...cys) - Math.min(...cys) > 30 || Math.max(...areas) / Math.max(1, Math.min(...areas.filter(v => v > 0))) > 1.3},
    {id: 'valid-endpoint', pass: at(1).count > 500},
    {id: 'midpoint-differs', pass: Math.abs(at(.5).count - at(0).count) > 300 || Math.abs((at(.5).cx || 0) - (at(0).cx || 0)) > 25 || Math.abs((at(.5).cy || 0) - (at(0).cy || 0)) > 25}
  ];
  let specific;
  if (kind === 'translate-x') specific = [
    {id: 'x-displacement', pass: at(1).cx - at(0).cx > 420},
    {id: 'y-stability', pass: Math.abs(at(1).cy - at(0).cy) < 40},
    {id: 'size-stability', pass: Math.abs(at(1).bbox.w - at(0).bbox.w) < 55},
    {id: 'forward-majority', pass: cxs.filter((value, i) => i && value >= cxs[i - 1] - 3).length >= 40},
    {id: 'middle-placement', pass: at(.5).cx > at(0).cx + 130 && at(.5).cx < at(1).cx - 100}
  ];
  else if (kind === 'scale-up') specific = [
    {id: 'area-growth', pass: at(1).count > at(0).count * 5},
    {id: 'width-growth', pass: at(1).bbox.w > at(0).bbox.w * 2.4},
    {id: 'height-growth', pass: at(1).bbox.h > at(0).bbox.h * 2.4},
    {id: 'center-stability', pass: Math.abs(at(1).cx - at(0).cx) < 40 && Math.abs(at(1).cy - at(0).cy) < 40},
    {id: 'monotonic-growth', pass: counts.filter((value, i) => i && value >= counts[i - 1] - 150).length >= 40}
  ];
  else if (kind === 'quarter-turn') specific = [
    {id: 'width-height-swap', pass: at(0).bbox.w > at(0).bbox.h * 2 && at(1).bbox.h > at(1).bbox.w * 2},
    {id: 'center-stability', pass: Math.abs(at(1).cx - at(0).cx) < 35 && Math.abs(at(1).cy - at(0).cy) < 35},
    {id: 'mid-square-envelope', pass: Math.abs(at(.5).bbox.w - at(.5).bbox.h) < 90},
    {id: 'area-stability', pass: Math.max(at(0).count, at(1).count) / Math.max(1, Math.min(at(0).count, at(1).count)) < 1.25},
    {id: 'turn-progress', pass: distinctHashesProxy >= 20}
  ];
  else if (kind === 'opacity-reveal') specific = [
    {id: 'energy-growth', pass: at(1).redEnergy > at(0).redEnergy * 4},
    {id: 'late-visible', pass: at(1).count > 12000},
    {id: 'early-hidden', pass: at(0).count < 500},
    {id: 'center-stability', pass: !at(0).cx || Math.abs(at(1).cx - at(.75).cx) < 30},
    {id: 'monotonic-energy', pass: energies.filter((value, i) => i && value >= energies[i - 1] - 10000).length >= 43}
  ];
  else if (kind === 'stagger-three') specific = [
    {id: 'threefold-area', pass: at(1).count > 25000},
    {id: 'successive-reveals', pass: at(.25).count < at(.5).count && at(.5).count < at(1).count},
    {id: 'horizontal-span-growth', pass: at(1).bbox.w > at(.25).bbox.w * 2.5},
    {id: 'height-stability', pass: Math.abs(at(1).bbox.h - at(.5).bbox.h) < 35},
    {id: 'step-diversity', pass: distinctHashesProxy >= 15}
  ];
  else if (kind === 'progressive-draw') specific = [
    {id: 'stroke-count-growth', pass: at(1).count > at(.25).count * 2},
    {id: 'two-axis-span', pass: at(1).bbox.w > 430 && at(1).bbox.h > 160},
    {id: 'ordered-quarter-growth', pass: at(.25).count <= at(.5).count && at(.5).count <= at(.75).count},
    {id: 'thin-elements', pass: at(1).count < at(1).bbox.w * at(1).bbox.h * .5},
    {id: 'draw-diversity', pass: distinctHashesProxy >= 12}
  ];
  else if (kind === 'horizontal-wipe') specific = [
    {id: 'width-reveal', pass: at(1).bbox.w > at(.25).bbox.w * 3},
    {id: 'height-stability', pass: Math.abs(at(1).bbox.h - at(.5).bbox.h) < 35},
    {id: 'left-edge-stability', pass: Math.abs(at(1).bbox.x - at(.5).bbox.x) < 30},
    {id: 'area-growth', pass: at(1).count > at(.25).count * 3},
    {id: 'wipe-progress', pass: distinctHashesProxy >= 20}
  ];
  else if (kind === 'closed-orbit') specific = [
    {id: 'closed-endpoint', pass: Math.hypot(at(1).cx - at(0).cx, at(1).cy - at(0).cy) < 35},
    {id: 'wide-x-span', pass: Math.max(...cxs) - Math.min(...cxs) > 450},
    {id: 'wide-y-span', pass: Math.max(...cys) - Math.min(...cys) > 300},
    {id: 'cyclic-directions', pass: directionChanges(cxs) >= 1 && directionChanges(cys) >= 2},
    {id: 'size-stability', pass: Math.max(...counts) / Math.max(1, Math.min(...counts.filter(v => v > 0))) < 1.3}
  ];
  else if (kind === 'bounce-settle') specific = [
    {id: 'downward-travel', pass: at(1).cy - at(0).cy > 180},
    {id: 'vertical-reversal', pass: directionChanges(cys) >= 1},
    {id: 'x-stability', pass: Math.max(...cxs) - Math.min(...cxs) < 35},
    {id: 'late-overshoot', pass: Math.max(...cys.slice(33)) > at(1).cy + 8},
    {id: 'settled-end', pass: Math.abs(at(1).cy - at(.75).cy) < 160}
  ];
  else if (kind === 'two-stage-sequence') specific = [
    {id: 'first-stage-translation', pass: at(.5).cx - at(0).cx > 380},
    {id: 'first-stage-size-stable', pass: Math.abs(at(.5).bbox.w - at(0).bbox.w) < 45},
    {id: 'second-stage-position-stable', pass: Math.abs(at(1).cx - at(.5).cx) < 40},
    {id: 'second-stage-growth', pass: at(1).count > at(.5).count * 4},
    {id: 'two-phase-midpoint', pass: at(.5).bbox.w < at(1).bbox.w * .6}
  ];
  else throw new Error(`unscored observation class: ${kind}`);
  const observations = [...common, ...specific];
  const passed = observations.filter(item => item.pass).length;
  return {observations, passed, total: observations.length, percent: passed * 10, threshold: 90, status: passed >= 9 ? 'passed' : 'failed'};
}

function compareSamples(a, b) {
  let distance = 0;
  for (let i = 0; i < a.length; i += 4) {
    const ax = (a[i].cx || 0) / WIDTH; const ay = (a[i].cy || 0) / HEIGHT; const aa = a[i].count / (WIDTH * HEIGHT);
    const bx = (b[i].cx || 0) / WIDTH; const by = (b[i].cy || 0) / HEIGHT; const ba = b[i].count / (WIDTH * HEIGHT);
    distance += Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(aa - ba) * 3;
  }
  return Number(distance.toFixed(6));
}

export function verify(root = DEFAULT_ROOT) {
  const creatorFile = path.join(root, 'creator.json');
  const creator = JSON.parse(fs.readFileSync(creatorFile, 'utf8'));
  const creatorCopy = structuredClone(creator); const claimedCreatorSha = creatorCopy.creatorSha256; delete creatorCopy.creatorSha256;
  if (hashJson(creatorCopy) !== claimedCreatorSha) throw new Error('creator hash drift');
  if (creator.referenceMechanics.sha256 !== sha256(SPEC_FILE)) throw new Error('reference mechanics drift');
  if (creator.implementation?.creator?.sha256 !== sha256(CREATOR_SOURCE) || creator.implementation?.common?.sha256 !== sha256(COMMON_SOURCE)) throw new Error('creator implementation drift');
  const authority = readAuthority();
  if (creator.authority.creatorSha256 !== authority.creatorSha256 || creator.authority.adapterSha256 !== authority.adapter.sha256) throw new Error('engine authority drift');
  if (creator.sampleCount !== creator.samples.length || creator.sampleCount !== TOOL_IDS.length * creator.samplesPerTool) throw new Error('sample count drift');
  const verified = []; const measurements = new Map(); const seenTopic = new Set(); const seenMechanic = new Set();
  for (const sampleId of creator.samples) {
    const sampleDir = path.join(root, 'samples', sampleId);
    const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, 'creator.sample.json'), 'utf8'));
    const sampleCopy = structuredClone(sample); const sampleClaim = sampleCopy.recordSha256; delete sampleCopy.recordSha256;
    if (hashJson(sampleCopy) !== sampleClaim || sample.sampleId !== sampleId) throw new Error(`sample record drift: ${sampleId}`);
    if (!TOOL_IDS.includes(sample.tool)) throw new Error(`unknown tool: ${sample.tool}`);
    if (seenTopic.has(`${sample.tool}:${sample.topic}`)) throw new Error(`duplicate tool topic: ${sample.tool}:${sample.topic}`); seenTopic.add(`${sample.tool}:${sample.topic}`);
    if (seenMechanic.has(`${sample.tool}:${sample.referenceMechanic}`)) throw new Error(`duplicate tool mechanic: ${sample.tool}:${sample.referenceMechanic}`); seenMechanic.add(`${sample.tool}:${sample.referenceMechanic}`);
    const expectedSpec = SPEC.samples.find(row => row.topic === sample.topic);
    if (!expectedSpec || expectedSpec.observationClass !== sample.observationClass || !SPEC.tools[sample.tool].mechanics.includes(sample.referenceMechanic)) throw new Error(`reference mechanic binding invalid: ${sampleId}`);
    if (sample.creatorInvocation.networkAllowed !== false || !sample.creatorInvocation.runtime.includes(SPEC.tools[sample.tool].frameApi.split('(')[0])) throw new Error(`runtime invocation missing: ${sampleId}`);
    const executionFile = path.join(sampleDir, sample.creatorInvocation.authoredExecutionEvidence?.file || '');
    const executionEvidence = sample.creatorInvocation.authoredExecutionEvidence;
    if (!executionEvidence || !fs.existsSync(executionFile) || sha256(executionFile) !== executionEvidence.sha256 || fs.statSync(executionFile).size !== executionEvidence.bytes) throw new Error(`authored execution evidence drift: ${sampleId}`);
    const executionText = fs.readFileSync(executionFile, 'utf8');
    if (/https?:\/\//iu.test(executionText)) throw new Error(`remote URL in authored execution evidence: ${sampleId}`);
    for (const token of REQUIRED_RUNTIME_TOKEN[sample.tool]) if (!executionText.includes(token)) throw new Error(`runtime API token missing (${token}): ${sampleId}`);
    if (sample.tool === 'ffmpeg-layer-keyframes-v1') {
      const invocation = sample.creatorInvocation.invocation;
      if (JSON.stringify(invocation.actualFilters) !== JSON.stringify(FFMPEG_FILTERS_BY_CLASS[sample.observationClass]) || invocation.filterGraphCount !== FRAMES || invocation.distinctFilterGraphHashes < 8 || !/^[a-f0-9]{64}$/u.test(invocation.filterGraphSetSha256)) throw new Error(`FFmpeg filter evidence invalid: ${sampleId}`);
      const graphs = JSON.parse(executionText);
      if (graphs.schema !== 'authored-ffmpeg-filter-graphs-v3' || JSON.stringify(graphs.actualFilters) !== JSON.stringify(invocation.actualFilters) || graphs.filterGraphs.length !== FRAMES || hashJson(graphs.filterGraphs.map(hashJson)) !== invocation.filterGraphSetSha256) throw new Error(`FFmpeg graph bytes invalid: ${sampleId}`);
      for (const filter of invocation.actualFilters) if (!graphs.filterGraphs.some(graph => graph.includes(`${filter}=`) || graph.includes(`${filter}:`) || graph.includes(`${filter},`))) throw new Error(`FFmpeg filter token missing (${filter}): ${sampleId}`);
    }
    const artifact = path.join(sampleDir, sample.artifact.file);
    if (sha256(artifact) !== sample.artifact.sha256 || fs.statSync(artifact).size !== sample.artifact.bytes) throw new Error(`artifact hash drift: ${sampleId}`);
    const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', artifact])).streams[0];
    if (probe.codec_name !== 'ffv1' || probe.width !== WIDTH || probe.height !== HEIGHT || probe.r_frame_rate !== '24/1' || Number(probe.nb_read_frames) !== FRAMES) throw new Error(`artifact probe invalid: ${sampleId}`);
    const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), `verify-mtl-v3-${sampleId}-`));
    try {
      const frames = decodeArtifact(artifact, frameDir);
      frames.forEach(file => { const size = readPngSize(file); if (size.width !== WIDTH || size.height !== HEIGHT) throw new Error(`decoded frame dimensions invalid: ${sampleId}`); });
      const measured = frames.map(measurePng);
      const score = scoreObservations(sample.observationClass, measured);
      if (process.env.MOTION_V3_FAIL_FAST === '1' && score.status !== 'passed') throw new Error(`sample mechanic score failed: ${sampleId} (${score.percent})`);
      measurements.set(sampleId, measured);
      verified.push({sampleId, tool: sample.tool, topic: sample.topic, observationClass: sample.observationClass, score, frames: {firstSha256: sha256(frames[0]), midSha256: sha256(frames[23]), lastSha256: sha256(frames[47])}, measurements: {start: measured[0], quarter: measured[11], mid: measured[23], threeQuarter: measured[35], end: measured[47]}});
    } finally { fs.rmSync(frameDir, {recursive: true, force: true}); }
  }
  const nearDuplicatePairs = [];
  for (const tool of TOOL_IDS) {
    const rows = verified.filter(row => row.tool === tool);
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const distance = compareSamples(measurements.get(rows[i].sampleId), measurements.get(rows[j].sampleId));
      if (distance < .35) nearDuplicatePairs.push({tool, a: rows[i].sampleId, b: rows[j].sampleId, distance});
    }
  }
  const byTool = Object.fromEntries(TOOL_IDS.map(tool => {
    const rows = verified.filter(row => row.tool === tool);
    return [tool, {samples: rows.length, passed: rows.filter(row => row.score.status === 'passed').length, mechanicsDistinct: new Set(rows.map(row => row.observationClass)).size === rows.length}];
  }));
  const fullCoverage = TOOL_IDS.every(tool => byTool[tool].samples === 10 && byTool[tool].passed === 10 && byTool[tool].mechanicsDistinct) && nearDuplicatePairs.length === 0;
  if (process.env.MOTION_V3_FAIL_FAST === '1' && nearDuplicatePairs.length) throw new Error(`near-duplicate pairs detected: ${nearDuplicatePairs.length}`);
  const report = {
    schema: 'motion-tool-learning-verifier-v3', verifier: 'independent-decoded-frame-observation-verifier-v3',
    implementation: {verifierSha256: sha256(VERIFIER_SOURCE), creatorSha256: sha256(CREATOR_SOURCE), commonSha256: sha256(COMMON_SOURCE)},
    creatorSha256: claimedCreatorSha, referenceMechanicsSha256: sha256(SPEC_FILE),
    threshold: {observationsPerSample: 10, requiredPasses: 9, percent: 90},
    sampleCount: verified.length, byTool, nearDuplicatePairs, samples: verified,
    verified: verified.every(row => row.score.status === 'passed') && nearDuplicatePairs.length === 0,
    promotionEligible: fullCoverage,
    promotionBlockers: fullCoverage ? [] : [
      ...TOOL_IDS.filter(tool => byTool[tool].samples !== 10).map(tool => `${tool}: ${byTool[tool].samples}/10 samples`),
      ...TOOL_IDS.filter(tool => byTool[tool].passed !== byTool[tool].samples).map(tool => `${tool}: ${byTool[tool].passed}/${byTool[tool].samples} passed`),
      ...(nearDuplicatePairs.length ? [`near-duplicate pairs: ${nearDuplicatePairs.length}`] : [])
    ]
  };
  report.verifierSha256 = hashJson(report);
  fs.writeFileSync(path.join(root, 'verifier.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(JSON.stringify(verify(process.argv[2] || DEFAULT_ROOT)));
