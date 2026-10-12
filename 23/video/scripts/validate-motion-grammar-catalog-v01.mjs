import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import sharp from 'sharp';

const root = process.cwd();
const argPath = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return path.resolve(root, index >= 0 ? process.argv[index + 1] : fallback);
};
const catalogPath = argPath('--motion-catalog', 'video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json');
const grammarPath = argPath('--grammar-contract', 'video/episodes/episode-001/reference-grammar-contract.json');
const failures = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashFile = async (file) => hash(await readFile(file));
const fileExists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const parseTimecode = (value) => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(value)) return null;
  const [hours, minutes, secondsText] = value.split(':');
  const seconds = Number(secondsText);
  const parsed = Number(hours) * 3600 + Number(minutes) * 60 + seconds;
  return Number.isFinite(parsed) && Number(minutes) < 60 && seconds < 60 ? parsed : null;
};
const imageDimensions = async (file) => { try { const metadata = await sharp(file).metadata(); return {width: metadata.width, height: metadata.height}; } catch { return null; } };
const validateImageRecord = async (record, label) => {
  if (!record || typeof record.path !== 'string' || !/^[a-f0-9]{64}$/u.test(record.sha256 ?? '') || !Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width <= 0 || record.height <= 0) { failures.push(`${label}: image path, 64-hex sha256, and positive dimensions are required`); return null; }
  const file = path.resolve(root, record.path);
  if (!(await fileExists(file))) { failures.push(`${label}: image file is missing`); return null; }
  if (record.sha256 !== await hashFile(file)) failures.push(`${label}: image hash drift`);
  const dimensions = await imageDimensions(file);
  if (!dimensions || dimensions.width !== record.width || dimensions.height !== record.height) failures.push(`${label}: image dimensions/decode drift`);
  return {...record, resolvedPath: file, dimensions};
};
const checkHashRecord = async (record, label) => {
  if (!record || typeof record.path !== 'string' || typeof record.sha256 !== 'string') { failures.push(`${label}: path and sha256 are required`); return; }
  const file = path.resolve(root, record.path);
  if (!(await fileExists(file))) { failures.push(`${label}: file is missing`); return; }
  if (record.sha256 !== await hashFile(file)) failures.push(`${label}: hash drift`);
};
const decodedImageDelta = async (file, expectedRaw, width, height) => {
  try {
    const actual = await sharp(file).ensureAlpha().raw().toBuffer();
    if (actual.length !== expectedRaw.length || !width || !height) return {mean: Infinity, highFraction: 1};
    let sum = 0; let high = 0;
    for (let index = 0; index < actual.length; index += 1) { const delta = Math.abs(actual[index] - expectedRaw[index]); sum += delta; if (delta >= 12) high += 1; }
    return {mean: sum / actual.length, highFraction: high / actual.length};
  } catch { return {mean: Infinity, highFraction: 1}; }
};
const lockedFrameCache = new Map();
const extractLockedReferenceFrame = async (file, timecode) => {
  const key = `${file}|${timecode}`;
  if (lockedFrameCache.has(key)) return lockedFrameCache.get(key);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ss', timecode, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], {encoding: null, windowsHide: true, maxBuffer: 32 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout?.length) { lockedFrameCache.set(key, null); return null; }
  try { const image = sharp(result.stdout).ensureAlpha(); const metadata = await image.metadata(); const value = {width: metadata.width, height: metadata.height, raw: await image.raw().toBuffer()}; lockedFrameCache.set(key, value); return value; } catch { lockedFrameCache.set(key, null); return null; }
};
const rgbaFrameDelta = (left, right) => {
  if (!left || !right || left.length !== right.length || left.length === 0) return null;
  let sum = 0; let changed = 0;
  for (let index = 0; index < left.length; index += 1) { const delta = Math.abs(left[index] - right[index]); sum += delta; if (delta >= 12) changed += 1; }
  return {mean_abs_rgba: sum / left.length, changed_fraction_ge12: changed / left.length};
};
const rawBuffersEqual = (left, right) => Boolean(left && right && left.length === right.length && left.equals(right));
const rawVideoFrame = (file, frame) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),format=rgba`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  return result.status === 0 ? result.stdout : null;
};
const frameHashSequence = (file, count, start = null) => {
  const args = ['-v', 'error', '-i', file];
  if (start) args.push('-ss', start);
  args.push('-an', '-frames:v', String(count), '-vf', 'format=rgba', '-f', 'framemd5', '-hash', 'sha256', '-');
  const result = spawnSync('ffmpeg', args, {encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024});
  return result.status === 0 ? result.stdout.split(/\r?\n/u).filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').at(-1)?.trim()).filter(Boolean) : null;
};
const svgLabel = (value, width, height, fontSize = 24) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="18" y="${Math.round(fontSize * 1.25)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#171717">${String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</text></svg>`);
const validateReviewClip = async (record, label, source, entry, frames) => {
  if (!record) return;
  await checkHashRecord(record, label);
  const file = path.resolve(root, record.path ?? '');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,nb_frames', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  if (probe.status !== 0) { failures.push(`${label}: ffprobe rejected the review clip`); return; }
  let report; try { report = JSON.parse(probe.stdout || '{}'); } catch { failures.push(`${label}: ffprobe returned invalid JSON`); return; }
  const stream = report?.streams?.find((item) => item.codec_type === 'video');
  const [numerator, denominator] = String(stream?.avg_frame_rate ?? '').split('/').map(Number);
  const frameRate = denominator > 0 ? numerator / denominator : NaN;
  const duration = Number(report?.format?.duration); const frameCount = Number(stream?.nb_frames);
  if (!stream || !(duration > 0) || stream.width !== source.width || stream.height !== source.height || Math.abs(frameRate - source.frame_rate) > 0.01) failures.push(`${label}: review clip must be positive-duration source-size/source-rate video`);
  if (record.width !== stream?.width || record.height !== stream?.height || Math.abs(Number(record.frame_rate) - frameRate) > 0.01 || Math.abs(Number(record.duration_seconds) - duration) > 0.05) failures.push(`${label}: recorded review clip metadata drift`);
  const start = parseTimecode(entry?.timecodes?.start); const end = parseTimecode(entry?.timecodes?.end);
  const startFrame = Number.isFinite(start) ? Math.ceil(start * source.frame_rate - 1e-6) : NaN;
  const endFrame = Number.isFinite(end) ? Math.ceil(end * source.frame_rate - 1e-6) : NaN;
  const expectedCount = endFrame - startFrame + 1;
  const range = record.source_range;
  if (!range || range.start !== entry?.timecodes?.start || range.end !== entry?.timecodes?.end || range.start_frame !== startFrame || range.end_frame !== endFrame || range.frame_count !== expectedCount || frameCount !== expectedCount) failures.push(`${label}: source range and decoded frame count must exactly bind the candidate interval`);
  if (record.encoding !== 'libx264rgb-crf0-rgb24' || record.extraction_recipe !== `ffmpeg input-seek-after-decode=${entry?.timecodes?.start}; frames=${expectedCount}; libx264rgb crf=0 rgb24 vsync=0`) failures.push(`${label}: deterministic lossless RGB extraction recipe drift`);
  if (!rawBuffersEqual(rawVideoFrame(file, 0), frames?.start) || !rawBuffersEqual(rawVideoFrame(file, Math.max(0, expectedCount - 1)), frames?.end)) failures.push(`${label}: first/last decoded frames must be byte-identical to the bound source start/end frames`);
  const sourceHashes = frameHashSequence(path.resolve(root, source.path ?? ''), expectedCount, entry?.timecodes?.start);
  const clipHashes = frameHashSequence(file, expectedCount);
  if (!sourceHashes || !clipHashes || sourceHashes.length !== expectedCount || clipHashes.join('|') !== sourceHashes.join('|')) failures.push(`${label}: every decoded frame must be byte-identical to the complete bound source range`);
};
const validateContact = async (record, label, frameRecords) => {
  const validated = await validateImageRecord(record, label); if (!validated) return;
  const layout = {panel_width: 600, panel_height: 338, left: 60, top: 90, horizontal_step: 600, order: ['start', 'mid', 'end'], resize: 'sharp-lanczos3-fill'};
  if (!isDeepStrictEqual(record.child_layout, layout)) { failures.push(`${label}: exact start/mid/end child layout is required`); return; }
  for (const [index, phase] of layout.order.entries()) {
    const expected = await sharp(path.resolve(root, frameRecords?.[phase]?.path ?? '')).resize(layout.panel_width, layout.panel_height, {fit: 'fill', kernel: sharp.kernel.lanczos3}).ensureAlpha().raw().toBuffer();
    const actual = await sharp(validated.resolvedPath).extract({left: layout.left + index * layout.horizontal_step, top: layout.top, width: layout.panel_width, height: layout.panel_height}).ensureAlpha().raw().toBuffer();
    if (!rawBuffersEqual(actual, expected)) failures.push(`${label}: ${phase} panel pixels must derive exactly from the bound ${phase} frame`);
  }
  const layers = [];
  for (const [index, phase] of layout.order.entries()) {
    const panel = await sharp(path.resolve(root, frameRecords?.[phase]?.path ?? '')).resize(layout.panel_width, layout.panel_height, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
    layers.push({input: panel, left: layout.left + index * layout.horizontal_step, top: layout.top});
    const grammarId = label.split('/').at(-1).replace(/ contact$/u, '');
    layers.push({input: svgLabel(index === 0 ? `${grammarId} / START` : phase.toUpperCase(), 600, 70), left: layout.left + index * layout.horizontal_step, top: 20});
  }
  const expectedFull = await sharp({create: {width: 1920, height: 448, channels: 4, background: '#d8cdb8'}}).composite(layers).ensureAlpha().raw().toBuffer();
  const actualFull = await sharp(validated.resolvedPath).ensureAlpha().raw().toBuffer();
  if (!rawBuffersEqual(actualFull, expectedFull)) failures.push(`${label}: full contact image including labels and background must match the deterministic evidence composition`);
};
const validateBoard = async (record, label, entries) => {
  const validated = await validateImageRecord(record, label); if (!validated) return;
  const layout = {panel_width: 960, panel_height: 224, columns: 2, left: 0, top: 88, order: entries.map((entry) => entry.grammar_id), resize: 'sharp-lanczos3-fill'};
  if (!isDeepStrictEqual(record.child_layout, layout)) failures.push(`${label}: exact six-candidate child layout is required`);
  for (const [index, entry] of entries.entries()) {
    const expected = await sharp(path.resolve(root, entry.contact?.path ?? '')).resize(layout.panel_width, layout.panel_height, {fit: 'fill', kernel: sharp.kernel.lanczos3}).ensureAlpha().raw().toBuffer();
    const actual = await sharp(validated.resolvedPath).extract({left: (index % 2) * layout.panel_width, top: layout.top + Math.floor(index / 2) * layout.panel_height, width: layout.panel_width, height: layout.panel_height}).ensureAlpha().raw().toBuffer();
    if (!rawBuffersEqual(actual, expected)) failures.push(`${label}: panel ${entry.grammar_id} must derive exactly from its bound contact sheet`);
  }
  const layers = [{input: svgLabel('MOTION GRAMMAR CALIBRATION CANDIDATES / HUMAN REVIEW PENDING', 1920, 88, 34), left: 30, top: 10}];
  for (const [index, entry] of entries.entries()) {
    const panel = await sharp(path.resolve(root, entry.contact?.path ?? '')).resize(layout.panel_width, layout.panel_height, {fit: 'fill', kernel: sharp.kernel.lanczos3}).png().toBuffer();
    layers.push({input: panel, left: (index % 2) * layout.panel_width, top: layout.top + Math.floor(index / 2) * layout.panel_height});
  }
  const expectedFull = await sharp({create: {width: 1920, height: 760, channels: 4, background: '#eee7da'}}).composite(layers).ensureAlpha().raw().toBuffer();
  const actualFull = await sharp(validated.resolvedPath).ensureAlpha().raw().toBuffer();
  if (!rawBuffersEqual(actualFull, expectedFull)) failures.push(`${label}: full board including title and background must match the deterministic evidence composition`);
};

const validateCatalog = async (catalog, grammarContract) => {
  const label = 'motion grammar catalog';
  if (catalog?.motion_grammar_catalog_version !== 1 || catalog?.status !== 'pending-human-motion-grammar-approval' || catalog?.approval_marker !== null || catalog?.production_eligible !== false || catalog?.authority !== 'calibration-evidence-only' || catalog?.review_profile !== 'source-video-selection') failures.push(`${label}: catalog must remain pending, non-production calibration evidence before human approval`);
  const builder = catalog?.evidence_builder;
  const expectedBuilderPath = 'video/scripts/build-motion-grammar-evidence-v01.mjs';
  const ffmpegVersion = spawnSync('ffmpeg', ['-version'], {encoding: 'utf8', windowsHide: true}).stdout.split(/\r?\n/u)[0];
  if (!builder || builder.script_path !== expectedBuilderPath || builder.script_sha256 !== await hashFile(path.resolve(root, expectedBuilderPath)) || builder.ffmpeg_version !== ffmpegVersion || builder.sharp_version !== sharp.versions.sharp || builder.libvips_version !== sharp.versions.vips) failures.push(`${label}: reproducible builder script and exact ffmpeg/sharp/libvips toolchain binding drift`);
  const source = catalog?.source;
  if (!source || source.path !== grammarContract.source?.path || source.sha256 !== grammarContract.source?.sha256 || source.source_kind !== 'locked-reference-video') failures.push(`${label}: source path/hash/kind must match the frozen grammar source`);
  else {
    await checkHashRecord(source, `${label} source`);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate', '-of', 'json', path.resolve(root, source.path)], {encoding: 'utf8', windowsHide: true});
    let report; try { report = probe.status === 0 ? JSON.parse(probe.stdout || '{}') : null; } catch { report = null; }
    const stream = report?.streams?.find((item) => item.codec_type === 'video'); const [n, d] = String(stream?.avg_frame_rate ?? '').split('/').map(Number); const rate = d > 0 ? n / d : NaN;
    if (!stream || source.width !== stream.width || source.height !== stream.height || Math.abs(source.frame_rate - rate) > 0.01 || Math.abs(source.duration_seconds - Number(report?.format?.duration)) > 0.05) failures.push(`${label}: frozen source metadata drift`);
  }
  const sampledStart = parseTimecode(catalog?.study_scope?.sampled_interval?.start); const sampledEnd = parseTimecode(catalog?.study_scope?.sampled_interval?.end); const finishedStart = parseTimecode(catalog?.study_scope?.finished_composition_interval?.start); const finishedEnd = parseTimecode(catalog?.study_scope?.finished_composition_interval?.end);
  if (catalog?.exhaustive !== false || sampledStart === null || sampledEnd === null || finishedStart === null || finishedEnd === null || sampledStart >= sampledEnd || finishedStart < sampledStart || finishedEnd > sampledEnd || finishedStart >= finishedEnd || !Array.isArray(catalog?.study_scope?.excluded_from_grammar) || catalog.study_scope.excluded_from_grammar.length === 0) failures.push(`${label}: bounded non-exhaustive study scope and explicit exclusions are required`);
  if (catalog?.human_review_board?.status !== 'motion-grammar-calibration-candidate') failures.push(`${label}: review board must remain a calibration candidate`);
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  if (entries.length === 0) failures.push(`${label}: at least one motion/transition candidate is required`);
  const rejected = Array.isArray(catalog?.rejected_or_pending_observations) ? catalog.rejected_or_pending_observations : [];
  const frozenRejected = [
    {grammar_id: 'paper-print-texture', category: 'treatment', status: 'pending-evidence-insufficient', reason: 'The paper/grid appearance persists, but source pixels do not expose a before/after treatment operator or distinguish baked source texture from a runtime treatment.', required_next_evidence: ['source interval with treatment toggled or isolated', 'runtime implementation evidence', 'before/after target-bound frames']},
    {grammar_id: 'camera-reframe', category: 'motion_operator', status: 'rejected-as-overclaim', reason: 'The 33.167–34.033 interval proves a layout reframe with a preserved object, but cannot distinguish a camera transform from coordinated object transforms. The narrower object-preserving-layout-reframe candidate is retained.'},
    {grammar_id: 'source-footage-internal-motion', category: 'motion_operator', status: 'rejected-as-remotion-grammar', reason: 'Wave and tanker motion is visible, but it belongs to the embedded source footage and does not prove a transferable Remotion operator.'},
    {grammar_id: 'document-pop-in', category: 'motion_operator', status: 'not-separate-grammar', reason: 'The newspaper entrance near 00:00:08.600 is an additional object-entry instance and is not counted separately from staggered-object-accumulation without stronger operator-specific evidence.'},
    {grammar_id: 'selective-animated-texture', category: 'treatment', status: 'pending-evidence-insufficient', reason: 'No opening interval cleanly isolates animated texture from source footage, compression, or repost overlays.'},
  ];
  if (!isDeepStrictEqual(rejected, frozenRejected)) failures.push(`${label}: rejected/pending overclaim records are frozen and cannot be deleted, reordered, or weakened`);
  const allIds = [...entries, ...rejected].map((entry) => entry?.grammar_id);
  if (allIds.some((id) => typeof id !== 'string' || id.length === 0) || new Set(allIds).size !== allIds.length) failures.push(`${label}: candidate and rejected IDs must be globally unique`);
  const catalogRelativePath = path.relative(root, catalogPath).replaceAll('\\', '/'); const catalogSha = await hashFile(catalogPath); const pendingById = new Map((grammarContract.pending_evidence_entries ?? []).map((entry) => [entry?.grammar_id, entry])); const activeIds = new Set(['motion_operator', 'transition_operator', 'treatment'].flatMap((category) => (grammarContract.categories?.[category] ?? []).map((entry) => entry?.grammar_id)));
  const allowedCategories = new Set(['motion_operator', 'transition_operator', 'treatment']);
  for (const entry of entries) {
    const entryLabel = `${label}/${entry?.grammar_id ?? 'missing-id'}`;
    if (!allowedCategories.has(entry?.category) || entry?.status !== 'pending-human-motion-grammar-approval' || entry?.human_approval?.status !== 'pending' || entry?.human_approval?.approved !== false || entry?.human_approval?.marker !== null) failures.push(`${entryLabel}: category and pending human approval state are required`);
    if (entry?.source_video_path !== source?.path || entry?.source_video_sha256 !== source?.sha256) failures.push(`${entryLabel}: source binding drift`);
    const start = parseTimecode(entry?.timecodes?.start); const mid = parseTimecode(entry?.timecodes?.mid); const end = parseTimecode(entry?.timecodes?.end); if (start === null || mid === null || end === null || !(start < mid && mid < end) || start < finishedStart || end > finishedEnd) failures.push(`${entryLabel}: strict forward start/mid/end timecodes inside the studied finished interval are required`);
    const decoded = {};
    for (const phase of ['start', 'mid', 'end']) { const record = entry?.frames?.[phase]; const checked = await validateImageRecord(record, `${entryLabel}/${phase}`); if (!checked || parseTimecode(entry?.timecodes?.[phase]) === null || !source?.path) continue; const extracted = await extractLockedReferenceFrame(path.resolve(root, source.path), entry.timecodes[phase]); if (!extracted || extracted.width !== record.width || extracted.height !== record.height) failures.push(`${entryLabel}/${phase}: locked source frame extraction failed or dimensions drifted`); else { const delta = await decodedImageDelta(path.resolve(root, record.path), extracted.raw, extracted.width, extracted.height); if (delta.mean > 0.001 || delta.highFraction > 0) failures.push(`${entryLabel}/${phase}: stored frame is not raw-RGBA identical to the locked source timecode`); decoded[phase] = await sharp(path.resolve(root, record.path)).ensureAlpha().raw().toBuffer(); } }
    if (decoded.start && decoded.mid && decoded.end) { const computed = {start_mid: rgbaFrameDelta(decoded.start, decoded.mid), mid_end: rgbaFrameDelta(decoded.mid, decoded.end), start_end: rgbaFrameDelta(decoded.start, decoded.end)}; if (!computed.start_end || computed.start_end.mean_abs_rgba < 0.5 || computed.start_end.changed_fraction_ge12 < 0.003 || entry.frames.start.sha256 === entry.frames.end.sha256) failures.push(`${entryLabel}: start/end must prove meaningful non-identical motion`); for (const pair of ['start_mid', 'mid_end', 'start_end']) for (const metric of ['mean_abs_rgba', 'changed_fraction_ge12']) if (!Number.isFinite(entry?.observed_delta?.[pair]?.[metric]) || Math.abs(entry.observed_delta[pair][metric] - computed[pair][metric]) > 0.000001) failures.push(`${entryLabel}: observed_delta ${pair}.${metric} drift`); if (entry.grammar_id === 'hard-cut') { const mapped = [start, mid, end].map((time) => Math.ceil(time * source.frame_rate - 1e-6)); const abrupt = computed.start_mid.mean_abs_rgba >= 10 && computed.start_mid.changed_fraction_ge12 >= 0.1; const stableAfter = computed.mid_end.mean_abs_rgba <= 1.5 && computed.mid_end.changed_fraction_ge12 <= 0.01; if (mapped[1] !== mapped[0] + 1 || mapped[2] !== mapped[1] + 1 || end - start > (2 / source.frame_rate) + 0.001 || !abrupt || !stableAfter) failures.push(`${entryLabel}: hard-cut proof requires three adjacent source frames with an abrupt boundary followed by a stable unblended frame`); } }
    if (typeof entry?.observed_delta?.description !== 'string' || entry.observed_delta.description.trim().length === 0 || typeof entry?.target_role !== 'string' || entry.target_role.trim().length === 0 || !Array.isArray(entry?.allowed_transfer) || entry.allowed_transfer.length === 0 || !Array.isArray(entry?.forbidden_extrapolations) || entry.forbidden_extrapolations.length === 0 || typeof entry?.evidence_confidence !== 'string' || entry.evidence_confidence.trim().length === 0) failures.push(`${entryLabel}: observation, target, transfer, exclusions, and confidence are required`);
    const pending = pendingById.get(entry?.grammar_id); if (!pending || pending.status !== 'pending_evidence' || pending.evidence_catalog?.path !== catalogRelativePath || pending.evidence_catalog?.sha256 !== catalogSha || pending.evidence_entry_id !== entry?.grammar_id) failures.push(`${entryLabel}: candidate must remain linked as pending evidence in the grammar contract`);
    await validateReviewClip(entry?.review_clip, `${entryLabel} review clip`, source ?? {}, entry, decoded);
    await validateContact(entry?.contact, `${entryLabel} contact`, entry?.frames);
    if (activeIds.has(entry?.grammar_id)) failures.push(`${entryLabel}: human-pending catalog candidate cannot be active grammar`);
  }
  await validateBoard(catalog?.human_review_board, `${label} review board`, entries);
  for (const observation of rejected) if (!allowedCategories.has(observation?.category) || typeof observation?.reason !== 'string' || !observation.reason.trim() || typeof observation?.status !== 'string' || !/^(?:rejected|pending|not-separate)/u.test(observation.status)) failures.push(`${label}/${observation?.grammar_id ?? 'rejected'}: rejected/pending observation needs category, status, and reason`);
  for (const pending of grammarContract.pending_evidence_entries ?? []) {
    if (!pending?.evidence_catalog) continue;
    if (pending.evidence_catalog.path !== catalogRelativePath || pending.evidence_catalog.sha256 !== catalogSha) failures.push(`${label}: pending grammar ${pending.grammar_id} catalog binding drift`);
    const linkedId = pending.evidence_entry_id ?? pending.evidence_rejection_id;
    if (!allIds.includes(linkedId) || linkedId !== pending.grammar_id) failures.push(`${label}: pending grammar ${pending.grammar_id} must link to its same-ID catalog observation`);
  }
};

try {
  await validateCatalog(await readJson(catalogPath), await readJson(grammarPath));
  if (failures.length) throw new Error(failures.join('\n'));
  process.stdout.write('historical v01 motion grammar catalog valid (QA audit only)\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
