import {access, readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compactCharacterCount, provisionalCutTiming, voiceFrameCount} from './narration-timing-lib.mjs';

const root = process.cwd();
const defaultPlan = path.join(root, 'video', 'episodes', 'episode-001', 'narration-plan.json');
const supportedExtensions = new Set(['.wav', '.mp3', '.m4a', '.webm']);
const strict = process.argv.includes('--strict');
const planArgIndex = process.argv.indexOf('--plan');
const audioArgIndex = process.argv.indexOf('--audio-dir');
const planPath = path.resolve(root, planArgIndex >= 0 ? process.argv[planArgIndex + 1] : defaultPlan);
const audioDir = path.resolve(root, audioArgIndex >= 0 ? process.argv[audioArgIndex + 1] : path.join('video', 'source-intake', 'episode-001', 'narration', 'final'));

const failures = [];
const warnings = [];
const report = [];

function number(value, label) {
  if (!Number.isFinite(value) || value < 0) failures.push(`${label} must be a non-negative number`);
}

function runFfprobe(file) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], {encoding: 'utf8', windowsHide: true});
  if (result.error) throw new Error(`ffprobe unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffprobe failed: ${(result.stderr || '').trim() || `exit ${result.status}`}`);
  const seconds = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('ffprobe returned no positive duration');
  return seconds;
}

async function findAudio(shotId) {
  try { await access(audioDir); } catch { return []; }
  const names = await readdir(audioDir);
  return names
    .filter((name) => name.toUpperCase().startsWith(`${shotId}.`))
    .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(audioDir, name));
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema_version !== 1) failures.push('plan schema_version must be 1');
if (!Number.isInteger(plan.fps) || plan.fps <= 0) failures.push('plan fps must be a positive integer');
if (!Array.isArray(plan.cuts) || plan.cuts.length < 1) failures.push('plan must contain at least one cut');
const target = plan.runtime_target_seconds;
if (!Number.isFinite(target?.min) || !Number.isFinite(target?.max) || target.min <= 0 || target.max < target.min) {
  failures.push('runtime_target_seconds must be an object with positive min/max');
}
const speechRate = plan.draft_timing_assumption?.compact_korean_chars_per_second;
if (!Number.isFinite(speechRate) || speechRate <= 0) failures.push('draft_timing_assumption.compact_korean_chars_per_second must be positive');
const characterTarget = plan.draft_compact_character_target;
if (!Number.isFinite(characterTarget?.min) || !Number.isFinite(characterTarget?.max) || characterTarget.min <= 0 || characterTarget.max < characterTarget.min) {
  failures.push('draft_compact_character_target must be an object with positive min/max');
}

const seen = new Set();
let provisionalFrames = 0;
let draftCompactCharacterCount = 0;
let draftSpeechFrames = 0;
let measuredFrames = 0;
let measuredCount = 0;

for (const [index, cut] of (plan.cuts ?? []).entries()) {
  const label = `cuts[${index}]`;
  if (!/^SH\d{3}$/.test(cut?.shot_id ?? '')) failures.push(`${label}.shot_id must match SH###`);
  if (seen.has(cut?.shot_id)) failures.push(`${label}.shot_id is duplicated: ${cut.shot_id}`);
  seen.add(cut?.shot_id);
  if (typeof cut?.draft_narration !== 'string' || cut.draft_narration.trim() === '') failures.push(`${label}.draft_narration is required`);
  if (!Array.isArray(cut?.source_ids) || cut.source_ids.length === 0) failures.push(`${label}.source_ids is required`);
  for (const sourceId of cut?.source_ids ?? []) {
    if (typeof sourceId === 'string' && sourceId.startsWith('FICTION-') && !/^FICTION-SH\d{3}$/.test(sourceId)) failures.push(`${label}.source_ids fictional IDs must match FICTION-SH###`);
  }
  if (!Array.isArray(cut?.estimated_voice_seconds) || cut.estimated_voice_seconds.length !== 2) failures.push(`${label}.estimated_voice_seconds must be [min,max]`);
  else if (cut.estimated_voice_seconds[0] <= 0 || cut.estimated_voice_seconds[1] < cut.estimated_voice_seconds[0]) failures.push(`${label}.estimated_voice_seconds range is invalid`);
  for (const field of ['pre_roll_frames', 'post_hold_frames', 'transition_overlap_frames']) {
    if (!Number.isInteger(cut?.[field]) || cut[field] < 0) failures.push(`${label}.${field} must be a non-negative integer`);
  }
  if (cut?.duration_frames !== null && cut?.duration_frames !== undefined) failures.push(`${label}.duration_frames must remain null until final audio is measured`);
  if (cut?.master_occupancy_frames !== null && cut?.master_occupancy_frames !== undefined) failures.push(`${label}.master_occupancy_frames must remain null until final audio is measured`);

  const compactCharacters = compactCharacterCount(cut?.draft_narration);
  draftCompactCharacterCount += compactCharacters;
  const draftVoiceFrames = Number.isFinite(speechRate) ? voiceFrameCount(compactCharacters / speechRate, plan.fps) : 0;
  draftSpeechFrames += draftVoiceFrames;
  const provisionalTiming = Number.isFinite(speechRate) && speechRate > 0 && Number.isInteger(plan.fps) && plan.fps > 0
    ? provisionalCutTiming(cut, plan)
    : {durationFrames: 0, masterOccupancyFrames: 0};
  const estimateFrames = provisionalTiming.durationFrames;
  provisionalFrames += provisionalTiming.masterOccupancyFrames;
  const audioFiles = await findAudio(cut.shot_id);
  if (audioFiles.length === 0) {
    const message = `${cut.shot_id}: missing final narration in ${path.relative(root, audioDir)}`;
    if (strict) failures.push(message); else warnings.push(message);
    report.push({shot_id: cut.shot_id, audio: null, draft_compact_characters: compactCharacters, draft_speech_seconds: Number((compactCharacters / speechRate).toFixed(3)), provisional_max_frames: estimateFrames, master_occupancy_frames: Math.max(1, estimateFrames - cut.transition_overlap_frames)});
    continue;
  }
  if (audioFiles.length > 1) warnings.push(`${cut.shot_id}: multiple supported recordings found; using ${path.basename(audioFiles[0])}`);
  try {
    const seconds = runFfprobe(audioFiles[0]);
    const voiceFrames = voiceFrameCount(seconds, plan.fps);
    const durationFrames = voiceFrames + cut.pre_roll_frames + cut.post_hold_frames;
    const occupancy = Math.max(1, durationFrames - cut.transition_overlap_frames);
    measuredFrames += occupancy;
    measuredCount += 1;
    report.push({shot_id: cut.shot_id, audio: path.relative(root, audioFiles[0]), draft_compact_characters: compactCharacters, draft_speech_seconds: Number((compactCharacters / speechRate).toFixed(3)), seconds: Number(seconds.toFixed(3)), voice_frames: voiceFrames, duration_frames: durationFrames, master_occupancy_frames: occupancy, provisional: false});
  } catch (error) {
    failures.push(`${cut.shot_id}: ${error.message}`);
  }
}

const expectedShotIds = (plan.cuts ?? []).map((_, index) => `SH${String(index + 1).padStart(3, '0')}`);
for (const [index, shotId] of expectedShotIds.entries()) {
  if (plan.cuts[index]?.shot_id !== shotId) failures.push(`cuts must be contiguous and ordered; expected ${shotId} at index ${index}`);
}
if (seen.size !== (plan.cuts?.length ?? 0)) failures.push(`expected unique cuts, found ${seen.size}`);
if (Number.isFinite(characterTarget?.min) && draftCompactCharacterCount < characterTarget.min) {
  failures.push(`draft compact character count ${draftCompactCharacterCount} is below target minimum ${characterTarget.min}`);
}
if (Number.isFinite(characterTarget?.max) && draftCompactCharacterCount > characterTarget.max) {
  failures.push(`draft compact character count ${draftCompactCharacterCount} exceeds target maximum ${characterTarget.max}`);
}
const provisionalMasterSeconds = provisionalFrames / plan.fps;
if (Number.isFinite(target?.min) && provisionalMasterSeconds < target.min) {
  failures.push(`provisional max runtime ${provisionalMasterSeconds.toFixed(3)}s is below target minimum ${target.min}s`);
}
if (Number.isFinite(target?.max) && provisionalMasterSeconds > target.max) {
  failures.push(`provisional max runtime ${provisionalMasterSeconds.toFixed(3)}s exceeds target maximum ${target.max}s`);
}
const completeMeasured = measuredCount === (plan.cuts?.length ?? 0);
const measuredMasterSeconds = completeMeasured ? measuredFrames / plan.fps : null;
if (strict && completeMeasured && Number.isFinite(target?.min) && measuredMasterSeconds < target.min) {
  failures.push(`measured master runtime ${measuredMasterSeconds.toFixed(3)}s is below target minimum ${target.min}s`);
}
if (strict && completeMeasured && Number.isFinite(target?.max) && measuredMasterSeconds > target.max) {
  failures.push(`measured master runtime ${measuredMasterSeconds.toFixed(3)}s exceeds target maximum ${target.max}s`);
}
const output = {
  plan: path.relative(root, planPath),
  audio_dir: path.relative(root, audioDir),
  strict,
  measured_cut_count: measuredCount,
  total_cut_count: plan.cuts?.length ?? 0,
  draft_compact_character_count: draftCompactCharacterCount,
  draft_speech_seconds: Number((draftSpeechFrames / plan.fps).toFixed(3)),
  draft_timing_assumption: plan.draft_timing_assumption,
  provisional_master_frames: provisionalFrames,
  runtime_target_seconds: target,
  provisional_master_seconds: Number(provisionalMasterSeconds.toFixed(3)),
  measured_master_frames: completeMeasured ? measuredFrames : null,
  measured_master_seconds: completeMeasured ? Number(measuredMasterSeconds.toFixed(3)) : null,
  warnings,
  failures,
  cuts: report,
};
console.log(JSON.stringify(output, null, 2));
if (failures.length > 0) process.exit(1);
console.error(strict ? `Narration strict validation passed: ${measuredCount}/${plan.cuts.length} cuts measured` : `Narration plan validation passed: ${measuredCount}/${plan.cuts.length} cuts measured; durations remain provisional`);
