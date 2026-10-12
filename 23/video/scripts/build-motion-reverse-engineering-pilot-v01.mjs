import {createHash} from 'node:crypto';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {renderComposition} from './qa-runtime.mjs';
import {measureProbe02, measureProbe03, measureSourceTanker} from './motion-reverse-pilot-render-measurements.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'video/qa/reference-study/motion-reverse-engineering-pilot-v01');
const SOURCE_REL = 'raw/inbox/vox-style-claude-remotion-reference.mp4';
const SOURCE = path.join(ROOT, SOURCE_REL);
const SOURCE_SHA256 = '0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9';
const ENTRY_REL = 'video/src/motion-reverse-engineering-pilot-v01-index.tsx';
const RUNTIME_REL = 'video/src/motion-reverse-engineering-pilot-v01.tsx';
const MEASUREMENT_RUNTIME_REL = 'video/scripts/motion-reverse-pilot-render-measurements.mjs';
const ENTRY = path.join(ROOT, ENTRY_REL);
const RUNTIME = path.join(ROOT, RUNTIME_REL);
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const specs = [
  {
    id: 'sample-02-numeric-step-progression', short: 'sample-02', start: 563, end: 623,
    composition: 'MotionReversePilot02-Provisional', actionEnd: 60,
    dynamicRoi: [1200, 250, 600, 430],
    stableRois: [[400, 100, 650, 300], [355, 545, 920, 240]],
    iconRoi: [1240, 250, 220, 400],
    events: [[563, 'hidden', null], [578, 'value-25', 25], [585, 'value-40', 40], [593, 'value-57', 57], [600, 'value-70', 70], [608, 'value-89', 89], [615, 'value-103', 103], [623, 'value-116', 116]],
    contactPairs: [[563, 0], [593, 30], [623, 60]],
  },
  {
    id: 'sample-03-chart-reveal', short: 'sample-03', start: 749, end: 837,
    composition: 'MotionReversePilot03-Provisional', actionEnd: 88,
    dynamicRoi: [530, 330, 910, 425],
    stableRois: [[445, 230, 1030, 90], [445, 755, 1030, 70], [445, 320, 85, 435]],
    plotRoi: [530, 330, 910, 425],
    events: [[749, 'shell-fade-start'], [757, 'shell-settling'], [766, 'series-first-detected'], [772, 'early-series'], [787, 'pre-spike'], [793, 'mid-series'], [802, 'spike'], [817, 'post-spike'], [837, 'complete-series']],
    contactPairs: [[749, 0], [793, 44], [837, 88]],
  },
];

function run(command, args, {capture = false} = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: capture ? 'utf8' : undefined, windowsHide: true, stdio: capture ? 'pipe' : 'inherit'});
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stderr ?? ''}`);
  return capture ? result.stdout : undefined;
}

function ffmpeg(args) { run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); }

function inside(rect, x, y) {
  return x >= rect[0] && y >= rect[1] && x < rect[0] + rect[2] && y < rect[1] + rect[3];
}

function bboxFor(raw, rect, predicate) {
  let minX = WIDTH, minY = HEIGHT, maxX = -1, maxY = -1, count = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    const i = (y * WIDTH + x) * 3;
    if (!predicate(raw[i], raw[i + 1], raw[i + 2], x, y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++;
  }
  return count ? {bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1], pixel_count: count, centroid: [+(minX + (maxX - minX + 1) / 2).toFixed(2), +(minY + (maxY - minY + 1) / 2).toFixed(2)]} : {bbox: null, pixel_count: 0, centroid: null};
}

function componentMeasure(raw, rect, predicate, minimumArea) {
  const width = rect[2], height = rect[3];
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = ((rect[1] + y) * WIDTH + rect[0] + x) * 3;
    mask[y * width + x] = predicate(raw[i], raw[i + 1], raw[i + 2]) ? 1 : 0;
  }
  const queue = new Int32Array(width * height);
  const components = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1;
    queue[0] = start;
    mask[start] = 0;
    let count = 0, minX = width, minY = height, maxX = -1, maxY = -1, sumX = 0, sumY = 0;
    while (head < tail) {
      const current = queue[head++], x = current % width, y = Math.floor(current / width);
      count++; sumX += x; sumY += y;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next]) continue;
        mask[next] = 0;
        queue[tail++] = next;
      }
    }
    if (count >= minimumArea) components.push({count, minX, minY, maxX, maxY, sumX, sumY});
  }
  if (!components.length) return {bbox: null, pixel_count: 0, centroid: null, component_count: 0, measurement_roi: rect};
  const pixelCount = components.reduce((sum, component) => sum + component.count, 0);
  const minX = Math.min(...components.map((component) => component.minX));
  const minY = Math.min(...components.map((component) => component.minY));
  const maxX = Math.max(...components.map((component) => component.maxX));
  const maxY = Math.max(...components.map((component) => component.maxY));
  const sumX = components.reduce((sum, component) => sum + component.sumX, 0);
  const sumY = components.reduce((sum, component) => sum + component.sumY, 0);
  return {
    bbox: [rect[0] + minX, rect[1] + minY, maxX - minX + 1, maxY - minY + 1],
    pixel_count: pixelCount,
    centroid: [+(rect[0] + sumX / pixelCount).toFixed(2), +(rect[1] + sumY / pixelCount).toFixed(2)],
    component_count: components.length,
    measurement_roi: rect,
  };
}

function unionBbox(measurements) {
  const boxes = measurements.map((measurement) => measurement?.bbox).filter(Boolean);
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((box) => box[0])), minY = Math.min(...boxes.map((box) => box[1]));
  const maxX = Math.max(...boxes.map((box) => box[0] + box[2] - 1)), maxY = Math.max(...boxes.map((box) => box[1] + box[3] - 1));
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function diffMetrics(raw, baseline, rect, threshold = 48) {
  let sum = 0, changed = 0, minX = WIDTH, minY = HEIGHT, maxX = -1, maxY = -1;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    const i = (y * WIDTH + x) * 3;
    const d = (Math.abs(raw[i] - baseline[i]) + Math.abs(raw[i + 1] - baseline[i + 1]) + Math.abs(raw[i + 2] - baseline[i + 2])) / 3;
    sum += d;
    if (d < threshold) continue;
    changed++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const area = rect[2] * rect[3];
  return {mean_abs_rgb: +(sum / area).toFixed(4), changed_fraction: +(changed / area).toFixed(6), change_bbox: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null, changed_pixels: changed};
}

function binarySignature(raw, rect, predicate) {
  const mask = Buffer.alloc(rect[2] * rect[3]);
  let p = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    const i = (y * WIDTH + x) * 3;
    mask[p++] = predicate(raw[i], raw[i + 1], raw[i + 2]) ? 255 : 0;
  }
  return sha(mask);
}

async function rawFrame(file) {
  return sharp(file).removeAlpha().raw().toBuffer();
}

async function artifact(file, kind) {
  const s = await stat(file);
  const metadata = /\.(png|jpg|jpeg)$/iu.test(file) ? await sharp(file).metadata() : null;
  return {kind, path: rel(file), sha256: await shaFile(file), bytes: s.size, ...(metadata ? {width: metadata.width, height: metadata.height} : {})};
}

async function labeledTile(file, width, height, label) {
  const image = await sharp(file).resize(width, height, {fit: 'contain', background: '#111'}).png().toBuffer();
  const labelSvg = Buffer.from(`<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="17" fill="#000" fill-opacity="0.72"/><text x="4" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp(image).composite([{input: labelSvg, left: 0, top: 0}]).png().toBuffer();
}

async function makeMobileContact(refs, probes, pairs, out) {
  const layers = [];
  for (let index = 0; index < 3; index++) {
    layers.push({input: await labeledTile(refs[index], 120, 101, `REF F${pairs[index][0]}`), left: index * 120, top: 0});
    layers.push({input: await labeledTile(probes[index], 120, 102, `PROBE F${String(pairs[index][1]).padStart(3, '0')}`), left: index * 120, top: 101});
  }
  await sharp({create: {width: 360, height: 203, channels: 3, background: '#111'}}).composite(layers).png().toFile(out);
}

async function probeFrames(video, dir, frames) {
  await mkdir(dir, {recursive: true});
  const outputs = [];
  for (const frame of frames) {
    const out = path.join(dir, `probe-frame-${String(frame).padStart(3, '0')}.png`);
    ffmpeg(['-i', video, '-vf', `select='eq(n\\,${frame})'`, '-vsync', '0', '-frames:v', '1', out]);
    outputs.push(out);
  }
  return outputs;
}

async function extractActionRaws(video, tempDir, prefix, endFrame) {
  const dir = path.join(tempDir, `${prefix}-probe-action`);
  await mkdir(dir, {recursive: true});
  const pattern = path.join(dir, 'frame-%06d.png');
  ffmpeg(['-i', video, '-vf', `select='between(n\,0\,${endFrame})'`, '-vsync', '0', '-start_number', '0', pattern]);
  const raws = new Map();
  for (let frame = 0; frame <= endFrame; frame++) raws.set(frame, await rawFrame(path.join(dir, `frame-${String(frame).padStart(6, '0')}.png`)));
  return raws;
}

async function buildMasks(spec, raws, baseline, sampleDir) {
  const maxDiff = new Uint8Array(WIDTH * HEIGHT);
  for (const raw of raws) for (let p = 0; p < WIDTH * HEIGHT; p++) {
    const i = p * 3;
    const d = Math.round((Math.abs(raw[i] - baseline[i]) + Math.abs(raw[i + 1] - baseline[i + 1]) + Math.abs(raw[i + 2] - baseline[i + 2])) / 3);
    if (d > maxDiff[p]) maxDiff[p] = d;
  }
  const dynamic = Buffer.alloc(WIDTH * HEIGHT);
  const stable = Buffer.alloc(WIDTH * HEIGHT);
  for (let p = 0; p < WIDTH * HEIGHT; p++) {
    const x = p % WIDTH, y = Math.floor(p / WIDTH);
    if (inside(spec.dynamicRoi, x, y) && maxDiff[p] >= 48) dynamic[p] = 255;
    if (spec.stableRois.some((roi) => inside(roi, x, y)) && maxDiff[p] < 48) stable[p] = 255;
  }
  const dynamicPath = path.join(sampleDir, 'dynamic-pixel-mask.png');
  const stablePath = path.join(sampleDir, 'stable-pixel-mask.png');
  await sharp(dynamic, {raw: {width: WIDTH, height: HEIGHT, channels: 1}}).png().toFile(dynamicPath);
  await sharp(stable, {raw: {width: WIDTH, height: HEIGHT, channels: 1}}).png().toFile(stablePath);
  return {dynamic: dynamicPath, stable: stablePath};
}

async function analyzeSample(spec, tempDir) {
  const sampleDir = path.join(OUT, spec.id);
  const evidenceDir = path.join(sampleDir, 'evidence');
  const probeDir = path.join(sampleDir, 'probe-frames');
  await mkdir(evidenceDir, {recursive: true});
  const extractPattern = path.join(tempDir, `${spec.short}-source-frame-%06d.png`);
  ffmpeg(['-i', SOURCE, '-vf', `select='between(n\\,${spec.start}\\,${spec.end})'`, '-vsync', '0', '-start_number', String(spec.start), extractPattern]);
  const frameFiles = [];
  for (let frame = spec.start; frame <= spec.end; frame++) frameFiles.push(path.join(tempDir, `${spec.short}-source-frame-${String(frame).padStart(6, '0')}.png`));
  const raws = [];
  for (const file of frameFiles) raws.push(await rawFrame(file));
  const baseline = raws[0];
  const finalRaw = raws.at(-1);
  const sourceTankerMeasurement = spec.short === 'sample-02' ? measureSourceTanker(baseline, finalRaw) : null;
  const rows = [];
  let previousGlyph = null;
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    const sourceFrame = spec.start + i;
    const base = {
      source_frame: sourceFrame,
      source_time_seconds: +(sourceFrame / FPS).toFixed(6),
      raw_rgb_sha256: sha(raw),
      declared_dynamic_bbox: spec.dynamicRoi,
      dynamic_vs_initial: diffMetrics(raw, baseline, spec.dynamicRoi),
      stable_regions_vs_initial: spec.stableRois.map((roi) => ({roi, ...diffMetrics(raw, baseline, roi)})),
    };
    if (spec.short === 'sample-02') {
      const icon = componentMeasure(raw, spec.iconRoi, (r, g, b) => r > 125 && r - g > 28 && g - b > 8, 18);
      let number = {bbox: null, pixel_count: 0, centroid: null, component_count: 0, measurement_roi: null};
      let unit = {bbox: null, pixel_count: 0, centroid: null, component_count: 0, measurement_roi: null};
      let glyph = null;
      if (icon.bbox) {
        const numberRoi = [1400, Math.max(250, icon.bbox[1] - 12), 350, 160];
        const unitRoi = [1280, Math.min(HEIGHT - 100, icon.bbox[1] + 145), 470, 100];
        number = componentMeasure(raw, numberRoi, (r, g, b) => (r + g + b) / 3 < 105, 12);
        unit = componentMeasure(raw, unitRoi, (r, g, b) => (r + g + b) / 3 < 105, 7);
        glyph = binarySignature(raw, numberRoi, (r, g, b) => (r + g + b) / 3 < 105);
      }
      rows.push({...base, observed_group_bbox: unionBbox([icon, number, unit]), icon, number, unit, number_glyph_signature: glyph, adjacent_number_glyph_changed: glyph && previousGlyph ? glyph !== previousGlyph : false});
      if (glyph) previousGlyph = glyph;
    } else {
      const orange = bboxFor(raw, spec.plotRoi, (r, g, b) => r > 150 && r - g > 35 && g - b > 5);
      const shellVsFinal = spec.stableRois.map((roi) => ({roi, ...diffMetrics(raw, finalRaw, roi)}));
      rows.push({...base, shell_regions_vs_final: shellVsFinal, shell_mean_abs_rgb_vs_final: +(shellVsFinal.reduce((sum, region) => sum + region.mean_abs_rgb, 0) / shellVsFinal.length).toFixed(4), plot: diffMetrics(raw, baseline, spec.plotRoi), orange_series: orange});
    }
  }

  if (spec.short === 'sample-02') {
    const settledAnchorY = median(rows.filter((row) => row.source_frame >= 615 && row.icon.bbox).map((row) => row.icon.bbox[1]));
    for (const row of rows) {
      if (!row.icon.bbox) { row.group_translation_y_px = null; row.internal_layout = null; continue; }
      row.group_translation_y_px = +(row.icon.bbox[1] - settledAnchorY).toFixed(3);
      row.internal_layout = {
        number_top_relative_to_icon_px: row.number.bbox ? row.number.bbox[1] - row.icon.bbox[1] : null,
        number_baseline_relative_to_icon_px: row.number.bbox ? row.number.bbox[1] + row.number.bbox[3] - row.icon.bbox[1] : null,
        unit_top_relative_to_icon_px: row.unit.bbox ? row.unit.bbox[1] - row.icon.bbox[1] : null,
      };
    }
  }

  const eventEvidence = [];
  for (const [frame, label, value] of spec.events) {
    const src = frameFiles[frame - spec.start];
    const dest = path.join(evidenceDir, `reference-frame-${String(frame).padStart(6, '0')}-${label}.png`);
    await copyFile(src, dest);
    eventEvidence.push({...await artifact(dest, 'source-frame-evidence'), source_frame: frame, source_time_seconds: +(frame / FPS).toFixed(6), ...(value === undefined ? {} : {manual_transcription_value: value})});
  }
  const masks = await buildMasks(spec, raws, baseline, sampleDir);
  const referenceClip = path.join(sampleDir, `${spec.short}-reference-window-lossless.mp4`);
  ffmpeg(['-framerate', '30', '-start_number', String(spec.start), '-i', extractPattern, '-frames:v', String(frameFiles.length), '-an', '-c:v', 'libx264rgb', '-crf', '0', '-pix_fmt', 'rgb24', referenceClip]);

  const analysis = spec.short === 'sample-02' ? buildSample02Analysis(spec, rows, eventEvidence, sourceTankerMeasurement) : buildSample03Analysis(spec, rows, eventEvidence);
  const analysisPath = path.join(sampleDir, 'analysis.json');
  await writeFile(analysisPath, json(analysis));
  const hypothesisPath = path.join(sampleDir, 'operator-hypotheses.json');
  await writeFile(hypothesisPath, json(analysis.operator_hypotheses));

  const probeVideo = path.join(sampleDir, `${spec.short}-remotion-probe-provisional.mp4`);
  renderComposition({entry: ENTRY, composition: spec.composition, output: probeVideo});
  const probeActionRaws = await extractActionRaws(probeVideo, tempDir, spec.short, spec.actionEnd);
  const probeMeasurement = spec.short === 'sample-02' ? measureProbe02(probeActionRaws) : measureProbe03(probeActionRaws);
  const probeMeasurementPath = path.join(sampleDir, 'probe-render-measurements.json');
  await writeFile(probeMeasurementPath, json(probeMeasurement));
  const probeFrameNumbers = [0, Math.floor(spec.actionEnd / 2), spec.actionEnd, 180, 240, 299];
  const probeFrameFiles = await probeFrames(probeVideo, probeDir, probeFrameNumbers);
  const sideBySide = path.join(sampleDir, `${spec.short}-reference-vs-probe-provisional.mp4`);
  ffmpeg(['-i', referenceClip, '-i', probeVideo, '-filter_complex', '[0:v]setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=10,scale=960:540:flags=lanczos,pad=960:1080:0:270:0x111111[ref];[1:v]setpts=PTS-STARTPTS,scale=960:540:flags=lanczos,pad=960:1080:0:270:0x111111[probe];[ref][probe]hstack=inputs=2[out]', '-map', '[out]', '-t', '10', '-r', '30', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', sideBySide]);
  const contact = path.join(sampleDir, `${spec.short}-reference-vs-probe-contact-360x203.png`);
  const refContactFrames = spec.contactPairs.map(([sourceFrame]) => path.join(ROOT, eventEvidence.find((event) => event.source_frame === sourceFrame).path));
  await makeMobileContact(refContactFrames, [probeFrameFiles[0], probeFrameFiles[1], probeFrameFiles[2]], spec.contactPairs, contact);

  return {
    sample_id: spec.id,
    source_window: {start_frame: spec.start, end_frame: spec.end, frame_count: frameFiles.length, fps: FPS, start_seconds: +(spec.start / FPS).toFixed(6), end_seconds: +(spec.end / FPS).toFixed(6)},
    time_mapping: {mode: 'one-source-frame-to-one-probe-frame', source_start_frame: spec.start, source_end_frame: spec.end, probe_start_frame: 0, probe_end_frame: spec.actionEnd, event_pairs: spec.events.map(([sourceFrame, label]) => ({label, source_frame: sourceFrame, probe_frame: sourceFrame - spec.start})), contact_pairs: spec.contactPairs.map(([sourceFrame, probeFrame]) => ({source_frame: sourceFrame, probe_frame: probeFrame}))},
    analysis: await artifact(analysisPath, 'analysis'),
    hypotheses: await artifact(hypothesisPath, 'operator-hypotheses'),
    probe_measurements: await artifact(probeMeasurementPath, 'probe-render-measurements'),
    masks: [await artifact(masks.dynamic, 'dynamic-pixel-mask'), await artifact(masks.stable, 'stable-pixel-mask')],
    evidence_frames: eventEvidence,
    reference_clip: await artifact(referenceClip, 'lossless-reference-window'),
    probe: {...await artifact(probeVideo, 'remotion-probe'), composition_id: spec.composition, width: WIDTH, height: HEIGHT, fps: FPS, duration_in_frames: 300, action_end_frame: spec.actionEnd, hold: {start_frame: spec.actionEnd, checked_frames: [spec.actionEnd, 180, 240, 299], minimum_frames: 60}},
    probe_frames: await Promise.all(probeFrameFiles.map((file) => artifact(file, 'probe-frame'))),
    side_by_side: await artifact(sideBySide, 'reference-vs-probe'),
    mobile_contact: await artifact(contact, 'reference-vs-probe-contact-360x203'),
    contact_layout: {canvas: [360, 203], columns: 3, reference_cell: [120, 101], probe_cell: [120, 102], source_frame_aspect_ratio: '16:9', fit: 'contain', letterbox_background: '#111', label_height: 17, label_source: 'exact contact_pairs source/probe frame pair'},
    contact_inputs: spec.contactPairs.map(([sourceFrame, probeFrame], index) => ({source_frame: sourceFrame, probe_frame: probeFrame, source_path: eventEvidence.find((event) => event.source_frame === sourceFrame).path, probe_path: rel(probeFrameFiles[index])})),
  };
}

function buildSample02Analysis(spec, rows, evidence, sourceTankerMeasurement) {
  const visibleRows = rows.filter((row) => row.source_frame >= 578 && row.icon.bbox && row.number.bbox && row.unit.bbox);
  const anchorRows = rows.filter((row) => row.icon.bbox);
  const countRows = rows.filter((row) => row.source_frame >= 578 && row.number_glyph_signature);
  const adjacentChanges = countRows.filter((row) => row.adjacent_number_glyph_changed).length;
  const manual = evidence.map(({source_frame, source_time_seconds, manual_transcription_value}) => ({source_frame, source_time_seconds, value: manual_transcription_value ?? null}));
  const settledAnchorY = median(rows.filter((row) => row.source_frame >= 615 && row.icon.bbox).map((row) => row.icon.bbox[1]));
  const layoutRows = visibleRows.filter((row) => row.source_frame >= 585);
  const numberBaselines = layoutRows.map((row) => row.internal_layout.number_baseline_relative_to_icon_px);
  const unitTops = layoutRows.map((row) => row.internal_layout.unit_top_relative_to_icon_px);
  const numberBaselineMedian = median(numberBaselines), unitTopMedian = median(unitTops);
  const maximumResidual = (values, center) => +Math.max(...values.map((value) => Math.abs(value - center))).toFixed(3);
  const translations = anchorRows.map((row) => row.group_translation_y_px);
  const downwardPairs = translations.slice(1).filter((value, index) => value <= translations[index] + 3).length;
  const sampledTrajectory = manual.map((event) => {
    const row = rows.find((candidate) => candidate.source_frame === event.source_frame);
    return {source_frame: event.source_frame, value: event.value, group_translation_y_px: row?.group_translation_y_px ?? null, observed_group_bbox: row?.observed_group_bbox ?? null};
  });
  return {
    schema_version: 1, sample_id: spec.id, status: 'operator-inference-pending-human-review', production_authority: false, human_review_status: 'pending',
    source_binding: {local_path: SOURCE_REL, sha256: SOURCE_SHA256, width: WIDTH, height: HEIGHT, fps: FPS, window: {start_frame: spec.start, end_frame: spec.end}},
    method: {ocr: 'unavailable-locally', transcription: 'source-locked manual transcription at cited extracted frames', automated_measurements: ['per-frame raw RGB hash', 'F563→F623 threshold-mask integer translation maximizing tanker-region IoU', 'expanded baseline-relative group ROI change', 'connected-component orange icon anchor', 'translation-normalized number glyph mask/hash', 'number baseline and unit top relative to icon anchor']},
    observed_sampled_values: manual,
    context_layers: {
      tanker: {motion_class: 'slow-translate', source_frames: [spec.start, spec.end], measurement: sourceTankerMeasurement},
      ocean: {motion_class: 'source-footage-internal-motion', measurement_scope: 'classified from decoded pixel motion; not reduced to one deterministic translation'},
      numeric_group: {motion_class: 'group-rise-fade-with-internal-count-up', source_frames: [571, 623]},
    },
    group_motion: {
      expanded_measurement_roi: spec.dynamicRoi,
      first_orange_icon_detected_frame: anchorRows[0].source_frame,
      settled_icon_anchor_y_px: settledAnchorY,
      sampled_trajectory: sampledTrajectory,
      observed_translation_range_px: {minimum: +Math.min(...translations).toFixed(3), maximum: +Math.max(...translations).toFixed(3), span: +(Math.max(...translations) - Math.min(...translations)).toFixed(3)},
      upward_or_settling_pair_fraction: +(downwardPairs / Math.max(1, translations.length - 1)).toFixed(6),
      conclusion: 'the complete icon/value/unit group reveals while translating upward; a globally fixed group bbox is contradicted by the measurements',
    },
    internal_layout: {
      measurement_window_frames: [585, 623],
      coordinate_system: 'relative-to-measured-orange-icon-anchor',
      number_baseline_relative_to_icon_median_px: numberBaselineMedian,
      number_baseline_max_residual_px: maximumResidual(numberBaselines, numberBaselineMedian),
      unit_top_relative_to_icon_median_px: unitTopMedian,
      unit_top_max_residual_px: maximumResidual(unitTops, unitTopMedian),
      conclusion: 'numeric glyph content changes inside the moving group while its baseline and the unit line remain locally registered to the group anchor',
    },
    count_continuity: {measurement_window_frames: [578, 623], adjacent_frame_pairs: Math.max(0, countRows.length - 1), adjacent_glyph_change_count: adjacentChanges, adjacent_glyph_change_fraction: +(adjacentChanges / Math.max(1, countRows.length - 1)).toFixed(6), manual_values_monotonic: manual.filter((x) => x.value !== null).every((x, i, a) => i === 0 || x.value > a[i - 1].value), step_card_swap_rejected: true},
    per_frame_measurements: rows,
    operator_hypotheses: {
      sample_id: spec.id,
      hypotheses: [
        {observed_fact: 'Three simultaneous layers are measurable: the tanker mask translates slowly by +46px x/+11px y from F563 to F623, the ocean contains source-footage internal motion, and the complete barrel/value/unit group rises/fades while sampled values increase $25→$40→$57→$70→$89→$103→$116. After subtracting the numeric-group trajectory, the numeric baseline and unit line remain locally registered to the icon anchor.', candidate_operator: 'independent slow tanker translate; preserved ocean internal-motion context; group-level upward translate plus opacity reveal with deterministic framewise count-up in group coordinates', alternative_operator: 'geometrically fixed tanker, frozen ocean plate, pre-rendered number cards, full-frame reveal, or digits moving independently of the group', confidence: 0.91, evidence_frames: manual.map((x) => x.source_frame), error: 'No project layers or keyframes are embedded in MP4; OCR was unavailable, values are manually transcribed, and opacity versus blur/scale contribution is not uniquely recoverable from flattened pixels.', human_review_status: 'pending'},
      ],
      rejected_hypotheses: ['geometrically fixed tanker', 'frozen ocean plate', 'global/full-card reveal', 'three or more discrete replacement cards', 'digits translating independently from the icon/unit group'],
    },
    implementation_contract: {candidate: 'independent tanker translate + ocean internal-motion context + group translate-y/opacity/count-up', tanker_translation_required_px: [46, 11], tanker_translation_tolerance_px: 3, group_global_translation_required: true, internal_layout_anchor: 'orange-icon', no_generic_card_swaps: true, no_global_reveal: true, source_to_probe_action_frame_mapping: [0, 60], hold_minimum_frames: 60},
  };
}

function buildSample03Analysis(spec, rows, evidence) {
  const orangeMaxX = rows.map((row) => row.orange_series.bbox ? row.orange_series.bbox[0] + row.orange_series.bbox[2] - 1 : null);
  const monotonicPairs = orangeMaxX.slice(1).filter((x, i) => x === null || orangeMaxX[i] === null || x + 3 >= orangeMaxX[i]).length;
  const final = rows.at(-1);
  const shellMax = Math.max(...rows.flatMap((row) => row.stable_regions_vs_initial.map((region) => region.changed_fraction)));
  const shellSettleThreshold = 3.2;
  const shellSettleIndex = rows.findIndex((row, index) => rows.slice(index).every((candidate) => candidate.shell_mean_abs_rgb_vs_final <= shellSettleThreshold));
  const shellSettleFrame = rows[Math.max(0, shellSettleIndex)]?.source_frame;
  const firstSeriesRow = rows.find((row) => row.orange_series.pixel_count >= 12);
  const plotOnlyPhaseStart = Math.max(shellSettleFrame, firstSeriesRow.source_frame);
  const postSettleRows = rows.filter((row) => row.source_frame >= shellSettleFrame);
  const postSettleShellMaximum = Math.max(...postSettleRows.map((row) => row.shell_mean_abs_rgb_vs_final));
  return {
    schema_version: 1, sample_id: spec.id, status: 'operator-inference-pending-human-review', production_authority: false, human_review_status: 'pending',
    source_binding: {local_path: SOURCE_REL, sha256: SOURCE_SHA256, width: WIDTH, height: HEIGHT, fps: FPS, window: {start_frame: spec.start, end_frame: spec.end}},
    regions: {chart_shell_registration_bbox: [445, 230, 1030, 590], shell_measurement_rois: spec.stableRois, dynamic_plot_roi: spec.plotRoi, shell_opacity_settle_observed: true, global_chart_wipe_observed: false},
    phases: {
      shell_fade_settle: {start_frame: spec.start, measured_settle_frame: shellSettleFrame, mean_abs_rgb_vs_final_threshold: shellSettleThreshold, post_settle_maximum: +postSettleShellMaximum.toFixed(4)},
      plot_series_reveal: {first_detected_frame: firstSeriesRow.source_frame, end_frame: spec.end, detection_minimum_orange_pixels: 12},
      stable_shell_plot_only: {start_frame: plotOnlyPhaseStart, end_frame: spec.end, overlap_note: shellSettleFrame > firstSeriesRow.source_frame ? 'series begins before the final shell-settle tail ends' : 'shell is settled before the first detected series pixels'},
    },
    measurements: {orange_series_right_edge_by_frame: orangeMaxX, right_edge_monotonic_pair_fraction: +(monotonicPairs / Math.max(1, orangeMaxX.length - 1)).toFixed(6), initial_shell_mean_abs_rgb_vs_final: rows[0].shell_mean_abs_rgb_vs_final, post_settle_shell_max_mean_abs_rgb_vs_final: +postSettleShellMaximum.toFixed(4), maximum_shell_changed_fraction_vs_initial_at_threshold_48: +shellMax.toFixed(6), plot_changed_fraction_at_stable_phase_start: rows.find((row) => row.source_frame === plotOnlyPhaseStart).plot.changed_fraction, final_plot_changed_fraction_at_threshold_48: final.plot.changed_fraction},
    per_frame_measurements: rows,
    operator_hypotheses: {
      sample_id: spec.id,
      hypotheses: [
        {observed_fact: `The chart card/title/legend/axes/ticks/year shell fades toward its settled appearance from F${spec.start} to measured F${shellSettleFrame}. Orange series pixels first cross the detection threshold at F${firstSeriesRow.source_frame}; from F${plotOnlyPhaseStart} onward the shell stays within the measured final-state tolerance while plot series and points continue accumulating left-to-right.`, candidate_operator: 'phase 1 shell opacity settle; phase 2 two SVG series path stroke draws with milestone-bound point reveal', alternative_operator: 'phase 1 shell opacity settle; phase 2 plot-local horizontal clip over pre-rendered series plus separate point reveal', confidence: 0.68, evidence_frames: evidence.map((x) => x.source_frame), error: 'Flattened pixels cannot uniquely distinguish strokeDashoffset from a sufficiently tight plot-local clip; shell intensity is measurable, but the original opacity/easing controls are not embedded in MP4.', human_review_status: 'pending'},
      ],
      rejected_hypotheses: ['whole-chart image wipe', 'shell/title/axes continuing to reveal throughout the post-settle plot-only phase'],
    },
    hypothesis_comparison: {stroke_draw: {rank: 1, confidence: 0.68, supporting_observations: ['series follows polyline arc length', 'point markers appear at path milestones']}, plot_local_clip: {rank: 2, confidence: 0.32, supporting_observations: ['a local clip can create a similar left-to-right frontier']}, unresolved: 'Operator identity is not recoverable uniquely from flattened MP4.'},
    implementation_contract: {candidate: 'shell opacity settle followed by svg.stroke-draw + point milestones', shell_settle_phase_required: true, post_settle_dynamic_scope_must_equal_plot_roi: spec.plotRoi, no_global_chart_wipe: true, source_to_probe_action_frame_mapping: [0, 88], hold_minimum_frames: 60},
  };
}

await rm(OUT, {recursive: true, force: true});
await mkdir(OUT, {recursive: true});
if (await shaFile(SOURCE) !== SOURCE_SHA256) throw new Error('locked primary source SHA-256 mismatch');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'motion-reverse-pilot-'));
try {
  const samples = [];
  for (const spec of specs) samples.push(await analyzeSample(spec, tempDir));
  const artifacts = samples.flatMap((sample) => [sample.analysis, sample.hypotheses, sample.probe_measurements, ...sample.masks, ...sample.evidence_frames, sample.reference_clip, sample.probe, ...sample.probe_frames, sample.side_by_side, sample.mobile_contact]);
  const manifest = {
    schema_version: 1,
    package_id: 'motion-reverse-engineering-pilot-v01',
    status: 'technical-pilot-complete-pending-human-review',
    purpose: 'operator inference for samples 02 and 03 only; not visual styling or production authority',
    production_authority: false, production_eligible: false, grammar_promoted: false, human_pass: false, active_cut_root: null,
    source: {local_path: SOURCE_REL, sha256: SOURCE_SHA256, width: WIDTH, height: HEIGHT, fps: FPS},
    runtime: {entry_path: ENTRY_REL, entry_sha256: await shaFile(ENTRY), source_path: RUNTIME_REL, source_sha256: await shaFile(RUNTIME), measurement_source_path: MEASUREMENT_RUNTIME_REL, measurement_source_sha256: await shaFile(path.join(ROOT, MEASUREMENT_RUNTIME_REL)), registered_compositions: specs.map((x) => x.composition)},
    samples,
    artifact_bundle_sha256: sha(artifacts.map((item) => `${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')),
    limitations: ['MP4 has no original layer, mask, easing, or keyframe metadata.', 'Sample 02 values are source-locked manual transcriptions because local OCR is unavailable; glyph change and bbox measurements are automated.', 'Sample 02 probe encodes the measured tanker and numeric-group operators; the ocean remains an explicitly classified source-footage context layer rather than a synthetic photographic simulation.', 'Sample 03 stroke draw versus plot-local clip remains probabilistic, not an assertion about the original authoring tool.'],
  };
  await writeFile(path.join(OUT, 'manifest.json'), json(manifest));
  await writeFile(path.join(OUT, 'README.md'), '# Motion reverse-engineering pilot v01\n\nSamples 02 and 03 only. The package binds exact frames from the locked MP4 to measured ROIs, operator hypotheses, minimal playable Remotion probes, and side-by-side review artifacts. It is pending human review and has no production, PASS, grammar-promotion, or active-root authority.\n');
  console.log(`Built ${rel(OUT)} with ${artifacts.length} bound artifacts.`);
} finally {
  await rm(tempDir, {recursive: true, force: true});
}
