import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const outputRoot = path.join(root, 'video', 'qa', 'reference-study', 'additional-sources', 'v01');
const acquiredRoot = path.join(root, 'video', 'qa', 'reference-study', 'additional-sources', 'acquired');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const ids = [
  {id: 'Y6mOBK5peDU', grammarId: 'map-camera-continuity', window: [320, 330, 340], hypothesis: 'spatial map camera and continuous-shot scene joining', category: 'motion_operator'},
  {id: 'dv3ADYu74DE', grammarId: 'cited-chart-reveal', window: [35, 45, 55], hypothesis: 'data chart reveal with a stable reading state', category: 'motion_operator'},
  {id: 'aSNYHAzPEKc', grammarId: 'layered-collage-cadence', window: [300, 310, 320], hypothesis: 'layer-first collage assembly and selective cadence', category: 'motion_operator'},
  {id: 'xOhh274Ayac', grammarId: 'voice-line-scene-isolation', window: [100, 110, 120], hypothesis: 'voice-line storyboard mapped to isolated Remotion scenes', category: 'production_grammar'},
  {id: 'dBakc0BdHjY', grammarId: 'parameterized-graphic-inputs', window: [220, 230, 240], hypothesis: 'editable data, text, layout, and transparent graphic inputs', category: 'production_grammar'},
  {id: 'b7KlsXNQobs', grammarId: 'specialized-glass-module', window: [170, 180, 190], hypothesis: 'specialized glass/refraction module; optional for political explainers', category: 'treatment'}
];

const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const hashFile = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const parseRate = (value) => {
  const [numerator, denominator] = String(value).split('/').map(Number);
  return denominator ? numerator / denominator : numerator;
};
const rgbaDelta = (left, right) => {
  let sum = 0;
  let changed = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = Math.abs(left[index] - right[index]);
    sum += delta;
    if (delta >= 12) changed += 1;
  }
  return {mean_abs_rgba: Number((sum / left.length).toFixed(6)), changed_fraction_ge12: Number((changed / left.length).toFixed(6))};
};
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const labelSvg = (value, width, height, fontSize = 22) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="18" y="${Math.round(fontSize * 1.25)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#171717">${escapeXml(value)}</text></svg>`);
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,codec_name,duration:format=duration', '-of', 'json', file]));

await mkdir(outputRoot, {recursive: true});
const sourceRecords = [];
for (const item of ids) {
  const metadataPath = path.join(root, 'raw', 'inbox', 'mo-sidd-remotion', item.id, `${item.id}.info.json`);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const sourcePath = path.join(acquiredRoot, `${item.id}.android.mp4`);
  const streamReport = probe(sourcePath);
  const stream = streamReport.streams[0];
  const fps = parseRate(stream.avg_frame_rate);
  const duration = Number(streamReport.format?.duration ?? stream.duration);
  const sourceSha256 = await hashFile(sourcePath);
  const sourceDir = path.join(outputRoot, item.id);
  await mkdir(sourceDir, {recursive: true});
  const [start, mid, end] = item.window;
  const timecodes = {start, mid, end};
  const frames = {};
  const rawFrames = {};
  for (const phase of ['start', 'mid', 'end']) {
    const output = path.join(sourceDir, `${phase}.png`);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-ss', String(timecodes[phase]), '-frames:v', '1', '-compression_level', '1', '-y', output]);
    const image = sharp(output).ensureAlpha();
    const imageMeta = await image.metadata();
    rawFrames[phase] = await image.raw().toBuffer();
    frames[phase] = {path: rel(output), sha256: await hashFile(output), width: imageMeta.width, height: imageMeta.height, source_time_seconds: timecodes[phase], source_frame: Math.round(timecodes[phase] * fps)};
  }
  const clip = path.join(sourceDir, 'review.mp4');
  const clipFrameCount = Math.max(1, Math.round((end - start) * fps) + 1);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-ss', String(start), '-frames:v', String(clipFrameCount), '-an', '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'medium', '-pix_fmt', 'rgb24', '-vsync', '0', '-movflags', '+faststart', '-y', clip]);
  const clipReport = probe(clip);
  const clipStream = clipReport.streams[0];
  const contact = path.join(sourceDir, 'contact.png');
  const contactLayers = [];
  for (const [index, phase] of ['start', 'mid', 'end'].entries()) {
    const panel = await sharp(path.join(sourceDir, `${phase}.png`)).resize(600, 338, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
    const left = 60 + index * 600;
    contactLayers.push({input: panel, left, top: 88});
    contactLayers.push({input: labelSvg(`${item.id} / ${phase.toUpperCase()} / ${timecodes[phase].toFixed(3)}s`, 600, 60), left, top: 20});
  }
  await sharp({create: {width: 1920, height: 426, channels: 4, background: '#eee7da'}}).composite(contactLayers).png({compressionLevel: 9}).toFile(contact);
  const overviewDir = path.join(sourceDir, 'overview');
  await mkdir(overviewDir, {recursive: true});
  const overviewFrames = [];
  const overviewLayers = [];
  for (let index = 0; index < 12; index += 1) {
    const seconds = Number(Math.min(Math.max(0, duration - 0.8), duration * index / 11).toFixed(3));
    const framePath = path.join(overviewDir, `frame-${String(index + 1).padStart(2, '0')}.png`);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-ss', String(seconds), '-frames:v', '1', '-compression_level', '1', '-y', framePath]);
    const metadata = await sharp(framePath).metadata();
    overviewFrames.push({path: rel(framePath), sha256: await hashFile(framePath), width: metadata.width, height: metadata.height, source_time_seconds: seconds, source_frame: Math.round(seconds * fps)});
    const panel = await sharp(framePath).resize(480, 270, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
    const left = (index % 4) * 480;
    const top = Math.floor(index / 4) * 270 + 54;
    overviewLayers.push({input: panel, left, top});
    overviewLayers.push({input: labelSvg(`${String(index + 1).padStart(2, '0')} / ${seconds.toFixed(1)}s`, 480, 44, 18), left, top: top - 44});
  }
  const overviewContact = path.join(sourceDir, 'overview-contact.png');
  await sharp({create: {width: 1920, height: 864, channels: 4, background: '#eee7da'}}).composite(overviewLayers).png({compressionLevel: 9}).toFile(overviewContact);
  const chapter = (metadata.chapters ?? []).find((candidate) => timecodes.mid >= candidate.start_time && timecodes.mid < candidate.end_time);
  const record = {
    source_video_id: item.id,
    title: metadata.title,
    uploader: metadata.uploader,
    original_url: metadata.webpage_url,
    metadata_source: rel(metadataPath),
    acquired_source: {path: rel(sourcePath), sha256: sourceSha256, acquisition_route: 'yt-dlp youtube android progressive format 18', rights_status: 'research-reference-only-pending-review'},
    stream: {codec: stream.codec_name, width: stream.width, height: stream.height, frame_rate: fps, duration_seconds: duration},
    study_scope: {selected_window_seconds: timecodes, chapter_context: chapter ? {title: chapter.title, start_time: chapter.start_time, end_time: chapter.end_time} : null, selection_reason: item.hypothesis, method: 'three exact source frames plus lossless RGB review clip; human frame inspection still required'},
    frames,
    overview: {frames: overviewFrames, contact: {path: rel(overviewContact), sha256: await hashFile(overviewContact), width: 1920, height: 864, order: overviewFrames.map((_, index) => index + 1)}},
    review_clip: {path: rel(clip), sha256: await hashFile(clip), width: clipStream.width, height: clipStream.height, frame_rate: parseRate(clipStream.avg_frame_rate), duration_seconds: Number(clipReport.format?.duration ?? clipStream.duration), source_range: {start, end, start_frame: Math.round(start * fps), end_frame: Math.round(end * fps), frame_count: clipFrameCount}, encoding: 'libx264rgb-crf0-rgb24'},
    contact: {path: rel(contact), sha256: await hashFile(contact), width: 1920, height: 426, order: ['start', 'mid', 'end']},
    observed_delta: {start_mid: rgbaDelta(rawFrames.start, rawFrames.mid), mid_end: rgbaDelta(rawFrames.mid, rawFrames.end), start_end: rgbaDelta(rawFrames.start, rawFrames.end)},
    human_review: {status: 'pending', approved: false, marker: null}
  };
  const sourceCatalog = {motion_grammar_catalog_version: 1, status: 'pending-human-motion-grammar-approval', review_profile: 'source-video-selection', authority: 'calibration-evidence-only', production_eligible: false, exhaustive: false, source: record, entries: [{grammar_id: item.grammarId, category: item.category, status: 'pending-human-motion-grammar-approval', source_video_id: item.id, timecodes: {start: `${start.toFixed(3)}s`, mid: `${mid.toFixed(3)}s`, end: `${end.toFixed(3)}s`}, evidence: {frames: Object.fromEntries(Object.entries(frames).map(([phase, frame]) => [phase, frame])), review_clip: record.review_clip, contact: record.contact}, observed_delta: record.observed_delta, observed_scope: item.hypothesis, allowed_transfer: ['Use only after human review of the source frames and side-by-side contact.', 'Transfer the observed relationship with political or legal subject matter substituted.'], forbidden_extrapolations: ['Do not treat a thumbnail, subtitle, or tutorial claim as motion proof.', 'Do not promote this candidate into the frozen grammar contract without exact observation and human approval.', 'Do not copy source subject matter or imply that the source licenses production assets.'], evidence_confidence: 'frame-bound-pending-human-observation', human_approval: record.human_review}]};
  const sourceCatalogPath = path.join(sourceDir, 'motion-grammar-catalog.json');
  await writeFile(sourceCatalogPath, `${JSON.stringify(sourceCatalog, null, 2)}\n`, 'utf8');
  sourceRecords.push({source: record, entry: sourceCatalog.entries[0], catalog_path: rel(sourceCatalogPath), catalog_sha256: await hashFile(sourceCatalogPath)});
}

const boardPath = path.join(outputRoot, 'additional-reference-review-board.png');
const boardLayers = [{input: labelSvg('ADDITIONAL REFERENCE VIDEO STUDY / HUMAN REVIEW PENDING', 1920, 70, 30), left: 30, top: 8}];
for (const [index, item] of sourceRecords.entries()) {
  const panel = await sharp(path.join(root, item.source.contact.path)).resize(960, 213, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
  boardLayers.push({input: panel, left: (index % 2) * 960, top: 78 + Math.floor(index / 2) * 213});
}
await sharp({create: {width: 1920, height: 717, channels: 4, background: '#f5f0e6'}}).composite(boardLayers).png({compressionLevel: 9}).toFile(boardPath);
const aggregate = {motion_grammar_catalog_version: 1, status: 'pending-human-motion-grammar-approval', review_profile: 'source-video-selection', authority: 'calibration-evidence-only', production_eligible: false, exhaustive: false, note: 'Six additional MoSidd sources were acquired at 640x360 for frame-bound study. Each source has a separate pending catalog. These artifacts do not modify or promote the frozen episode grammar contract.', sources: sourceRecords.map((item) => item.source), entries: sourceRecords.map((item) => item.entry), review_board: {path: rel(boardPath), sha256: await hashFile(boardPath), width: 1920, height: 717, status: 'motion-grammar-calibration-candidate'}, acquisition_limitations: ['Default web/DASH requests returned HTTP 403 in this environment.', 'The acquired progressive format 18 stream is 640x360 and is adequate for temporal study but not a high-resolution quality reference.', 'YouTube metadata and automatic subtitles remain source context; frame-bound visual claims require human review.', 'No rights approval for reuse in a published program is implied.']};
const aggregatePath = path.join(outputRoot, 'additional-motion-grammar-catalog-v01.json');
await writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({catalog: {path: rel(aggregatePath), sha256: await hashFile(aggregatePath)}, board: {path: rel(boardPath), sha256: await hashFile(boardPath)}, sources: sourceRecords.map((item) => ({id: item.source.source_video_id, video: item.source.acquired_source.path, sha256: item.source.acquired_source.sha256, catalog: item.catalog_path}))}, null, 2));
