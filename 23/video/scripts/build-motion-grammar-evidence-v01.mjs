import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const catalogPath = path.join(root, 'video', 'qa', 'reference-study', 'vox-primary', 'motion-grammar-v01', 'motion-grammar-catalog.json');
const contractPath = path.join(root, 'video', 'episodes', 'episode-001', 'reference-grammar-contract.json');
const bindingPath = path.join(root, 'video', 'episodes', 'episode-001', 'reference-grammar-binding.json');
const builderPath = path.join(root, 'video', 'scripts', 'build-motion-grammar-evidence-v01.mjs');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const hashFile = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const parseTimecode = (value) => {
  const [hours, minutes, seconds] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
};
const rgbaDelta = (left, right) => {
  let sum = 0; let changed = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = Math.abs(left[index] - right[index]);
    sum += delta;
    if (delta >= 12) changed += 1;
  }
  return {mean_abs_rgba: Number((sum / left.length).toFixed(6)), changed_fraction_ge12: Number((changed / left.length).toFixed(6))};
};
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const labelSvg = (value, width, height, fontSize = 24) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="18" y="${Math.round(fontSize * 1.25)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#171717">${esc(value)}</text></svg>`);

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const ffmpegVersion = spawnSync('ffmpeg', ['-version'], {cwd: root, encoding: 'utf8', windowsHide: true}).stdout.split(/\r?\n/u)[0];
catalog.evidence_builder = {script_path: rel(builderPath), script_sha256: await hashFile(builderPath), ffmpeg_version: ffmpegVersion, sharp_version: sharp.versions.sharp, libvips_version: sharp.versions.vips};
const source = path.join(root, catalog.source.path);
for (const entry of catalog.entries) {
  const directory = path.join(root, 'video', 'qa', 'reference-study', 'vox-primary', 'motion-grammar-v01', 'candidates', entry.grammar_id);
  await mkdir(directory, {recursive: true});
  const rawFrames = {};
  for (const phase of ['start', 'mid', 'end']) {
    const output = path.join(directory, `${phase}.png`);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source, '-ss', entry.timecodes[phase], '-frames:v', '1', '-compression_level', '1', '-y', output]);
    const image = sharp(output).ensureAlpha();
    const metadata = await image.metadata();
    rawFrames[phase] = await image.raw().toBuffer();
    entry.frames[phase] = {path: rel(output), sha256: await hashFile(output), width: metadata.width, height: metadata.height};
  }
  entry.observed_delta.start_mid = rgbaDelta(rawFrames.start, rawFrames.mid);
  entry.observed_delta.mid_end = rgbaDelta(rawFrames.mid, rawFrames.end);
  entry.observed_delta.start_end = rgbaDelta(rawFrames.start, rawFrames.end);

  const clip = path.join(directory, 'review.mp4');
  const sourceStartFrame = Math.ceil(parseTimecode(entry.timecodes.start) * catalog.source.frame_rate - 1e-6);
  const sourceEndFrame = Math.ceil(parseTimecode(entry.timecodes.end) * catalog.source.frame_rate - 1e-6);
  const sourceFrameCount = sourceEndFrame - sourceStartFrame + 1;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source, '-ss', entry.timecodes.start, '-frames:v', String(sourceFrameCount), '-an', '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'medium', '-pix_fmt', 'rgb24', '-vsync', '0', '-movflags', '+faststart', '-y', clip]);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,avg_frame_rate', '-of', 'json', clip], {cwd: root, encoding: 'utf8', windowsHide: true});
  if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr}`);
  const report = JSON.parse(probe.stdout);
  const stream = report.streams[0];
  entry.review_clip = {path: rel(clip), sha256: await hashFile(clip), width: stream.width, height: stream.height, frame_rate: catalog.source.frame_rate, duration_seconds: Number(report.format.duration), source_range: {start: entry.timecodes.start, end: entry.timecodes.end, start_frame: sourceStartFrame, end_frame: sourceEndFrame, frame_count: sourceFrameCount}, encoding: 'libx264rgb-crf0-rgb24', extraction_recipe: `ffmpeg input-seek-after-decode=${entry.timecodes.start}; frames=${sourceFrameCount}; libx264rgb crf=0 rgb24 vsync=0`};

  const contact = path.join(directory, 'contact.png');
  const contactLayers = [];
  for (const [index, phase] of ['start', 'mid', 'end'].entries()) {
    const panel = await sharp(path.join(directory, `${phase}.png`)).resize(600, 338, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
    contactLayers.push({input: panel, left: 60 + index * 600, top: 90});
    contactLayers.push({input: labelSvg(index === 0 ? `${entry.grammar_id} / START` : phase.toUpperCase(), 600, 70), left: 60 + index * 600, top: 20});
  }
  await sharp({create: {width: 1920, height: 448, channels: 4, background: '#d8cdb8'}}).composite(contactLayers).png({compressionLevel: 9}).toFile(contact);
  entry.contact = {path: rel(contact), sha256: await hashFile(contact), width: 1920, height: 448, child_layout: {panel_width: 600, panel_height: 338, left: 60, top: 90, horizontal_step: 600, order: ['start', 'mid', 'end'], resize: 'sharp-lanczos3-fill'}};
}

const board = path.join(root, 'video', 'qa', 'reference-study', 'vox-primary', 'motion-grammar-v01', 'motion-grammar-review-board.png');
const boardLayers = [{input: labelSvg('MOTION GRAMMAR CALIBRATION CANDIDATES / HUMAN REVIEW PENDING', 1920, 88, 34), left: 30, top: 10}];
for (const [index, entry] of catalog.entries.entries()) {
  const panel = await sharp(path.join(root, entry.contact.path)).resize(960, 224, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
  boardLayers.push({input: panel, left: (index % 2) * 960, top: 88 + Math.floor(index / 2) * 224});
}
await sharp({create: {width: 1920, height: 760, channels: 4, background: '#eee7da'}}).composite(boardLayers).png({compressionLevel: 9}).toFile(board);
catalog.human_review_board = {path: rel(board), sha256: await hashFile(board), width: 1920, height: 760, status: 'motion-grammar-calibration-candidate', child_layout: {panel_width: 960, panel_height: 224, columns: 2, left: 0, top: 88, order: catalog.entries.map((entry) => entry.grammar_id), resize: 'sharp-lanczos3-fill'}};
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

const catalogRecord = {path: rel(catalogPath), sha256: await hashFile(catalogPath)};
const contract = JSON.parse(await readFile(contractPath, 'utf8'));
for (const pending of contract.pending_evidence_entries ?? []) if (pending.evidence_catalog) pending.evidence_catalog = catalogRecord;
await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
const binding = JSON.parse(await readFile(bindingPath, 'utf8'));
binding.grammar_contract.sha256 = await hashFile(contractPath);
await writeFile(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({candidate_count: catalog.entries.length, catalog: catalogRecord, board: catalog.human_review_board, grammar_contract_sha256: binding.grammar_contract.sha256}, null, 2));
