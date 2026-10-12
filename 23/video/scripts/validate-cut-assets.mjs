import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {access, readFile, readdir, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {validateVisualStateManifest} from './visual-state-lib.mjs';
import {validateVisualContractV2} from './visual-contract-v2.mjs';
import {validateVisualContractV3} from './visual-contract-v3.mjs';
import {validateApprovedContractRequirements, validateManifestAgainstEpisodeContract} from './episode-manifest-contract.mjs';
import {validateSourceVideoContract} from './source-video-contract.mjs';
import {validatePersonOnlyImagegenPolicy} from './asset-origin-policy.mjs';

const root = process.cwd();
const sharp = createRequire(import.meta.url)('sharp');
const assetsRootArgIndex = process.argv.indexOf('--assets-root');
const stateArgIndex = process.argv.indexOf('--state');
const specArgIndex = process.argv.indexOf('--spec');
const contractsArgIndex = process.argv.indexOf('--contracts');
const assetsRoot = path.resolve(root, assetsRootArgIndex >= 0 ? process.argv[assetsRootArgIndex + 1] : path.join('video', 'public', 'assets'));
const templateBackground = path.join(assetsRoot, '_cut-template', 'background.png');
const requireCuts = process.argv.includes('--require-cuts');
// Effects are opt-in.  An empty effects/ directory is not a valid asset
// contract, so new cuts do not need one until an effect is actually used.
const requiredDirectories = ['assets', 'remotion', 'omni', 'source-photo', 'source-video', 'audio', 'preview'];
const failures = [];
const statePath = path.resolve(root, stateArgIndex >= 0 ? process.argv[stateArgIndex + 1] : path.join('video', 'episodes', 'episode-001', 'production-state.json'));
const productionState = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
const episodeSpecPath = path.resolve(root, specArgIndex >= 0
  ? process.argv[specArgIndex + 1]
  : productionState.draft_inputs?.episode_spec ?? path.join('video', 'episodes', 'episode-001', 'episode-spec.json'));
const episodeSpecBytes = await readFile(episodeSpecPath).catch(() => Buffer.from('{}'));
const episodeSpec = JSON.parse(episodeSpecBytes.toString('utf8'));
const manifestContractsPath = path.resolve(root, contractsArgIndex >= 0
  ? process.argv[contractsArgIndex + 1]
  : path.join('video', 'episodes', 'episode-001', 'generated', 'manifest-contracts.json'));
const manifestContractsBytes = await readFile(manifestContractsPath).catch(() => Buffer.from('{"cuts":[]}'));
const manifestContractsDocument = JSON.parse(manifestContractsBytes.toString('utf8'));
const manifestContracts = new Map((manifestContractsDocument.cuts ?? []).map((contract) => [contract.shot_id, contract]));
const normalize = (value) => value.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '');
const nonProductionRoots = new Map(Object.entries(productionState.provisional_artifacts ?? {})
  .filter(([key, status]) => key !== 'note' && ['rejected-provisional-visual', 'historical-rejected-provisional-visual', 'style-calibration-only', 'historical-rejected-style-calibration', 'historical-viewer-quality-failure', 'style-calibration-candidate'].includes(status))
  .map(([key, status]) => [normalize(key), status]));
const plannedShotIds = (episodeSpec.cuts ?? []).map((cut) => cut.shot_id).filter((shotId) => typeof shotId === 'string' && shotId.trim() !== '');
const expectedCutCount = plannedShotIds.length || productionState.expected_cut_count || 0;
const activeCutRoot = typeof productionState.active_cut_root === 'string' ? normalize(productionState.active_cut_root) : null;
let activeCutRootSeen = false;
const stageOrder = ['timing-draft', 'cut-previews-ready', 'cut-review-approved', 'provisional-video-ready', 'visual-review-approved', 'script-locked', 'final-voice-locked', 'audio-timed-assembly', 'picture-locked'];
const stageAlias = {
  'provisional-visual': 'cut-previews-ready',
  'visual-review': 'visual-review-approved',
  'final-script': 'script-locked',
  'final-script-locked': 'script-locked',
  'final-voice': 'final-voice-locked',
  'audio-timed': 'audio-timed-assembly',
  'picture-lock': 'picture-locked',
};
const productionStage = stageAlias[productionState.stage] ?? productionState.stage;
const enforceActiveAssets = stageOrder.indexOf(productionStage) >= stageOrder.indexOf('cut-previews-ready');
const cutReviewPassed = productionStageIndex('cut-review-approved') >= 0
  && productionStageIndex(productionStage) >= productionStageIndex('cut-review-approved')
  && productionState.cut_review?.all_cuts_passed === true
  && typeof productionState.cut_review?.approval_marker === 'string'
  && productionState.cut_review.approval_marker.trim() !== '';

function productionStageIndex(stage) { return stageOrder.indexOf(stage); }
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const episodeSpecSha256 = sha256(episodeSpecBytes);
const manifestContractsSha256 = sha256(manifestContractsBytes);
const templateBuffer = await readFile(templateBackground);
const templateHash = sha256(templateBuffer);

function validatePng(buffer, label) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    failures.push(`${label}: background.png is not a PNG`);
    return;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 1920 || height !== 1080) failures.push(`${label}: background.png must be 1920x1080, got ${width}x${height}`);
}
function validateImageBuffer(buffer, file, label) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') {
    if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.length < 24 || buffer.readUInt32BE(16) <= 0 || buffer.readUInt32BE(20) <= 0) failures.push(`${label}: PNG signature/dimensions are invalid`);
  } else if (extension === '.svg' && (!buffer.toString('utf8').trim() || !/<svg(?:\s|>)/iu.test(buffer.toString('utf8')))) failures.push(`${label}: SVG must contain non-empty <svg> markup`);
  else if (extension === '.jpg' || extension === '.jpeg' || extension === '.webp') {
    const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
    try { const report = JSON.parse(result.stdout || '{}'); if (result.status !== 0 || !(Number(report.streams?.[0]?.width) > 0) || !(Number(report.streams?.[0]?.height) > 0)) failures.push(`${label}: raster image failed ffprobe decode/dimensions`); } catch { failures.push(`${label}: raster image failed ffprobe decode/dimensions`); }
  }
}
function validateVideo(file, label) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) { failures.push(`${label}: ffprobe rejected the video`); return; }
  try {
    const report = JSON.parse(result.stdout);
    if (!(Number(report.format?.duration) > 0) || !report.streams?.some((stream) => stream.codec_type === 'video')) failures.push(`${label}: video must have a positive duration and a video stream`);
  } catch { failures.push(`${label}: ffprobe returned invalid JSON`); }
}
function validateAudio(file, label) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) { failures.push(`${label}: ffprobe rejected the audio`); return; }
  try {
    const report = JSON.parse(result.stdout);
    if (!(Number(report.format?.duration) > 0) || !report.streams?.some((stream) => stream.codec_type === 'audio')) failures.push(`${label}: audio must have a positive duration and an audio stream`);
  } catch { failures.push(`${label}: ffprobe returned invalid audio JSON`); }
}
function validateEffectMedia(file, label) {
  const extension = path.extname(file).toLowerCase();
  if (visualExtensions.has(extension)) validateImageBuffer(readFileSync(file), file, label);
  else if (videoExtensions.has(extension)) validateVideo(file, label);
  else if (extension === '.wav' || extension === '.mp3') validateAudio(file, label);
  else failures.push(`${label}: unsupported effect media extension`);
}
const nonBlank = (value) => typeof value === 'string' && value.trim() !== '';
function looksLikeVideo(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  try { const report = JSON.parse(result.stdout || '{}'); return result.status === 0 && Number(report.format?.duration) > 0 && report.streams?.some((stream) => stream.codec_type === 'video'); } catch { return false; }
}
async function filesRecursively(directory) {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true}).catch(() => [])) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesRecursively(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

function isFrame(value, durationFrames, {allowEnd = false} = {}) {
  if (!Number.isInteger(value) || value < 0) return false;
  return allowEnd ? value <= durationFrames : value < durationFrames;
}

function validateFrameRange(item, label, durationFrames) {
  if (!isFrame(item?.start_frame, durationFrames)) failures.push(`${label}: start_frame must be within the cut`);
  if (!isFrame(item?.end_frame, durationFrames, {allowEnd: true})) failures.push(`${label}: end_frame must be within the cut`);
  if (Number.isInteger(item?.start_frame) && Number.isInteger(item?.end_frame) && item.end_frame <= item.start_frame) {
    failures.push(`${label}: end_frame must be greater than start_frame`);
  }
}

function validateLifecycle(manifest, label, durationFrames, assetIds, effectIds) {
  if (!['remotion', 'source-photo'].includes(manifest.production_mode)) return;
  if (manifest.asset_directory !== 'assets') failures.push(`${label}: Remotion cuts must declare asset_directory as assets`);
  const lifecycle = manifest.lifecycle;
  if (!lifecycle || typeof lifecycle !== 'object') {
    failures.push(`${label}: Remotion cuts require a lifecycle contract`);
    return;
  }
  const backgroundOnly = lifecycle.background_only;
  validateFrameRange(backgroundOnly, `${label}: lifecycle.background_only`, durationFrames);
  if (backgroundOnly?.start_frame !== 0) failures.push(`${label}: lifecycle.background_only must start at frame 0`);
  if (backgroundOnly?.visible_asset_ids?.length !== 0 || backgroundOnly?.visible_effect_ids?.length !== 0) {
    failures.push(`${label}: lifecycle.background_only must contain only the fixed background`);
  }
  validateFrameRange(lifecycle.reveal, `${label}: lifecycle.reveal`, durationFrames);
  validateFrameRange(lifecycle.final_hold, `${label}: lifecycle.final_hold`, durationFrames);
  if (Number.isInteger(backgroundOnly?.end_frame) && Number.isInteger(lifecycle.reveal?.start_frame) && lifecycle.reveal.start_frame < backgroundOnly.end_frame) {
    failures.push(`${label}: lifecycle.reveal must start after the background-only phase`);
  }
  if (Number.isInteger(lifecycle.reveal?.end_frame) && Number.isInteger(lifecycle.final_hold?.start_frame) && lifecycle.final_hold.start_frame < lifecycle.reveal.end_frame) {
    failures.push(`${label}: lifecycle.final_hold must start after the reveal phase`);
  }
  if (lifecycle.final_hold?.end_frame !== durationFrames) failures.push(`${label}: lifecycle.final_hold must reach the final frame`);
  if (manifest.production_mode === 'remotion' && (!Array.isArray(lifecycle.final_visible_asset_ids) || !assetIds.every((id) => lifecycle.final_visible_asset_ids.includes(id)))) {
    failures.push(`${label}: lifecycle.final_visible_asset_ids must include every asset`);
  }
  if ((lifecycle.final_visible_asset_ids ?? []).some((id) => !assetIds.includes(id))) {
    failures.push(`${label}: lifecycle.final_visible_asset_ids contains an unknown asset`);
  }
  if (!Array.isArray(lifecycle.final_visible_effect_ids) || !effectIds.every((id) => id.persists_to_final !== false ? lifecycle.final_visible_effect_ids.includes(id.effect_id) : true)) {
    failures.push(`${label}: lifecycle.final_visible_effect_ids must include every persistent effect`);
  }
  if ((lifecycle.final_visible_effect_ids ?? []).some((id) => !effectIds.some((effect) => effect.effect_id === id))) {
    failures.push(`${label}: lifecycle.final_visible_effect_ids contains an unknown effect`);
  }
}

function validateManifest(manifest, label, episodeName, shotName, {requireAssetOriginPolicy = false} = {}) {
  const allowedAnimationTypes = new Set(['spring-enter', 'place', 'slap', 'rise', 'wipe', 'highlight', 'camera', 'ease-move', 'scale', 'opacity', 'mask-reveal', 'draw-path', 'chart-draw', 'hold']);
  const allowedChartTypes = new Set(['bar', 'line', 'counter', 'dot-plot', 'timeline', 'process']);
  if (manifest.episode_id !== episodeName || manifest.shot_id !== shotName) {
    failures.push(`${label}: manifest episode_id/shot_id mismatch`);
  }
  for (const message of validatePersonOnlyImagegenPolicy(manifest, {label, requirePolicy: requireAssetOriginPolicy})) failures.push(message);
  if (manifest.background !== 'background.png') failures.push(`${label}: background must be background.png`);
  for (const message of validateSourceVideoContract(manifest)) failures.push(`${label}: ${message}`);
  if (manifest.schema_version === 3 || manifest.schema_version === 2) {
    if (manifest.fps !== 30 || !Number.isInteger(manifest.duration_frames) || manifest.duration_frames <= 0) failures.push(`${label}: schema v2/v3 requires fps=30 and positive duration_frames`);
    const messages = manifest.schema_version === 3
      ? validateVisualContractV3(manifest, {requireTransitionArtifact: manifest.approvals?.playable_cut?.user_pass === true, requireEvidenceVerification: true})
      : validateVisualContractV2(manifest, {requireTransitionArtifact: manifest.approvals?.playable_cut?.user_pass === true});
    for (const message of messages) failures.push(`${label}: ${message}`);
    const assetIds = new Set((manifest.assets ?? []).map((asset) => asset?.asset_id).filter(Boolean));
    validateLifecycle(manifest, label, manifest.duration_frames, [...assetIds], manifest.effects ?? []);
    return;
  }
  if (manifest.schema_version !== 1) failures.push(`${label}: schema_version must be 1, 2 or 3`);
  if (manifest.effects_required !== undefined && typeof manifest.effects_required !== 'boolean') failures.push(`${label}: effects_required must be boolean`);
  if (manifest.review !== undefined && (typeof manifest.review !== 'object' || typeof manifest.review.user_pass !== 'boolean')) failures.push(`${label}: review.user_pass must be boolean when review metadata is present`);
  if (manifest.fps !== 30) failures.push(`${label}: fps must be 30`);
  if (!Number.isInteger(manifest.duration_frames) || manifest.duration_frames <= 0) {
    failures.push(`${label}: duration_frames must be a positive integer`);
    return;
  }

  const durationFrames = manifest.duration_frames;
  for (const field of ['assets', 'animations', 'text_cues', 'effects', 'source_ids']) {
    if (!Array.isArray(manifest[field])) failures.push(`${label}: ${field} must be an array`);
  }
  if (!manifest.voiceover || !Array.isArray(manifest.voiceover.word_cues)) {
    failures.push(`${label}: voiceover.word_cues must be an array`);
  } else {
    if (manifest.voiceover.start_frame !== 0) failures.push(`${label}: voiceover.start_frame must be 0 in a cut-local manifest`);
    if (manifest.voiceover.end_frame !== null && !isFrame(manifest.voiceover.end_frame, durationFrames, {allowEnd: true})) {
      failures.push(`${label}: voiceover.end_frame must be null or within the cut`);
    }
    for (const [index, cue] of manifest.voiceover.word_cues.entries()) {
      if (typeof cue?.word !== 'string' || cue.word.trim() === '') failures.push(`${label}: word_cues[${index}].word is required`);
      if (!isFrame(cue?.frame, durationFrames)) failures.push(`${label}: word_cues[${index}].frame must be within the cut`);
    }
  }

  const assetIds = new Set((manifest.assets ?? []).map((asset) => asset?.asset_id).filter(Boolean));
  if (assetIds.size !== (manifest.assets ?? []).length) failures.push(`${label}: assets must have unique asset_id values`);
  for (const [index, asset] of (manifest.assets ?? []).entries()) {
    if (typeof asset?.file !== 'string') failures.push(`${label}: assets[${index}].file is required`);
    else if (manifest.production_mode === 'remotion' && !asset.file.startsWith('assets/')) failures.push(`${label}: Remotion assets[${index}].file must point inside assets/`);
    const extension = path.extname(asset?.file ?? '').toLowerCase();
    if (['.wav', '.mp3', '.m4a'].includes(extension) || asset?.media_type?.startsWith?.('audio/')) failures.push(`${label}: audio is not a visual CutAsset; use a kind=sfx CutEffect`);
    if (typeof asset?.media_type === 'string') {
      const mediaMatches = (asset.media_type.startsWith('image/') && ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(extension))
        || (asset.media_type.startsWith('video/') && ['.mp4', '.webm', '.mov', '.m4v', '.mpeg', '.mpg'].includes(extension));
      if (!mediaMatches) failures.push(`${label}: assets[${index}].media_type does not match file extension`);
    }
  }
  for (const [index, animation] of (manifest.animations ?? []).entries()) {
    validateFrameRange(animation, `${label}: animations[${index}]`, durationFrames);
    if (!allowedAnimationTypes.has(animation?.type)) failures.push(`${label}: animations[${index}].type is unsupported; counter belongs to chart.type=counter`);
    if (typeof animation?.target_id !== 'string' || animation.target_id.trim() === '') {
      failures.push(`${label}: animations[${index}].target_id is required`);
    } else if (animation.target_id !== 'camera' && animation.target_id !== 'chart' && !assetIds.has(animation.target_id) && !(manifest.effects ?? []).some((effect) => effect?.effect_id === animation.target_id)) {
      failures.push(`${label}: animations[${index}].target_id must reference an asset, effect, camera, or chart`);
    }
  }

  for (const [index, cue] of (manifest.text_cues ?? []).entries()) {
    validateFrameRange(cue, `${label}: text_cues[${index}]`, durationFrames);
    const text = typeof cue?.text === 'string' ? cue.text.trim() : '';
    if (!text) failures.push(`${label}: text_cues[${index}].text is required`);
    if (text && text.split(/\s+/u).length > 5) failures.push(`${label}: text_cues[${index}] exceeds the five-word limit`);
    if (cue?.box === true) failures.push(`${label}: text_cues[${index}] cannot enable a text box`);
  }

  for (const [index, effect] of (manifest.effects ?? []).entries()) {
    validateFrameRange(effect, `${label}: effects[${index}]`, durationFrames);
    if (typeof effect?.file !== 'string' || !effect.file.startsWith('effects/')) {
      failures.push(`${label}: effects[${index}].file must point inside effects/`);
    }
    const effectExtension = path.extname(effect?.file ?? '').toLowerCase();
    if (effectExtension === '.wav' || effectExtension === '.mp3') {
      if (effect.kind !== 'sfx') failures.push(`${label}: audio effects must declare kind=sfx`);
    } else if (effect.kind === 'sfx') failures.push(`${label}: kind=sfx effects must use .wav or .mp3`);
  }

  if (manifest.production_mode === 'remotion') {
    if ((manifest.assets ?? []).length + (manifest.effects ?? []).length === 0) failures.push(`${label}: Remotion cuts require at least one asset or effect to animate`);
    const animatedTargetIds = new Set((manifest.animations ?? []).map((animation) => animation?.target_id));
    const animatedVisualIds = [...assetIds, ...(manifest.effects ?? []).map((effect) => effect?.effect_id)].filter(Boolean);
    const revealStart = manifest.lifecycle?.reveal?.start_frame;
    const revealEnd = manifest.lifecycle?.reveal?.end_frame;
    const hasRevealAnimation = (manifest.animations ?? []).some((animation) => {
      const targetsVisual = animatedVisualIds.includes(animation?.target_id);
      const overlapsReveal = Number.isInteger(revealStart) && Number.isInteger(revealEnd) && animation.start_frame < revealEnd && animation.end_frame > revealStart;
      return targetsVisual && overlapsReveal;
    });
    if (!animatedVisualIds.some((id) => animatedTargetIds.has(id)) || !hasRevealAnimation) failures.push(`${label}: Remotion cuts require an asset/effect animation during lifecycle.reveal`);
  }

  if (manifest.chart !== null) {
    if (!allowedChartTypes.has(manifest.chart?.type)) failures.push(`${label}: chart.type is unsupported`);
    if (!manifest.chart?.source_id) failures.push(`${label}: chart.source_id is required`);
    if (!Array.isArray(manifest.chart?.data)) failures.push(`${label}: chart.data must be an array`);
    validateFrameRange(manifest.chart?.reveal, `${label}: chart.reveal`, durationFrames);
  }

  if (!manifest.transition || typeof manifest.transition.type !== 'string') {
    failures.push(`${label}: transition is required`);
  } else if (!Number.isInteger(manifest.transition.duration_frames) || manifest.transition.duration_frames < 0) {
    failures.push(`${label}: transition.duration_frames must be a non-negative integer`);
  } else if (manifest.transition.duration_frames > durationFrames) {
    failures.push(`${label}: transition.duration_frames exceeds the cut`);
  } else if (manifest.transition.start_frame !== null && (!isFrame(manifest.transition.start_frame, durationFrames) || manifest.transition.start_frame + manifest.transition.duration_frames > durationFrames)) {
    failures.push(`${label}: transition.start_frame and duration_frames must fit inside the cut`);
  }
  validateLifecycle(manifest, label, durationFrames, [...assetIds], manifest.effects ?? []);
  for (const message of validateVisualStateManifest(manifest)) failures.push(`${label}: ${message}`);
}

const visualExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.mpeg', '.mpg', '.ts', '.3gp', '.flv']);
const ignoredAssetNames = new Set(['.gitkeep', 'readme', 'readme.md', 'placeholder', 'placeholder.txt']);
function isRealAssetFile(file, allowedExtensions = new Set([...visualExtensions, ...videoExtensions])) {
  const name = path.basename(file).toLowerCase();
  return !ignoredAssetNames.has(name) && !name.includes('placeholder') && allowedExtensions.has(path.extname(name));
}
async function realFiles(directory, allowedExtensions = new Set([...visualExtensions, ...videoExtensions])) {
  try {
    const entries = await readdir(directory, {withFileTypes: true});
    return entries.filter((entry) => entry.isFile() && isRealAssetFile(entry.name, allowedExtensions)).map((entry) => entry.name);
  } catch { return []; }
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function validateModeAssets(manifest, label, shotRoot) {
  if (!enforceActiveAssets) return;
  let shotBackgroundHash = null;
  try { shotBackgroundHash = sha256(await readFile(path.join(shotRoot, 'background.png'))); } catch { /* background error is reported by the base validator */ }
  const mode = manifest.production_mode;
  const manifestFiles = (manifest.assets ?? []).map((asset) => typeof asset?.file === 'string' ? asset.file : '').filter(Boolean);
  if (manifest.review?.user_pass === true) {
    for (const [index, asset] of (manifest.assets ?? []).entries()) {
      if (typeof asset?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(asset.sha256)) failures.push(`${label}: passed asset ${index} requires sha256`);
      else { try { if (asset.sha256 !== sha256(await readFile(path.join(shotRoot, asset.file)))) failures.push(`${label}: passed asset ${index} sha256 does not match local file`); } catch { /* missing file is reported below */ } }
    }
    for (const [index, keyframe] of (manifest.omni?.keyframes ?? []).entries()) {
      if (typeof keyframe?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(keyframe.sha256)) failures.push(`${label}: passed Omni keyframe ${index} requires sha256`);
      else { try { if (keyframe.sha256 !== sha256(await readFile(path.join(shotRoot, keyframe.file)))) failures.push(`${label}: passed Omni keyframe ${index} sha256 does not match local file`); } catch { /* missing file is reported below */ } }
    }
    for (const [index, effect] of (manifest.effects ?? []).entries()) {
      if (typeof effect?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(effect.sha256)) failures.push(`${label}: passed effect ${index} requires sha256`);
      else { try { if (effect.sha256 !== sha256(await readFile(path.join(shotRoot, effect.file)))) failures.push(`${label}: passed effect ${index} sha256 does not match local file`); } catch { /* missing file is reported below */ } }
    }
  }
  const localManifestFiles = [];
  for (const file of manifestFiles) {
    if (file.includes('..')) continue;
    const absolute = path.join(shotRoot, file);
    if (isRealAssetFile(file)) {
      try { if ((await stat(absolute)).isFile()) localManifestFiles.push(file.replaceAll('\\', '/')); } catch { /* missing file is reported below */ }
    }
  }
  const hasUnder = (prefix, extensions) => localManifestFiles.some((file) => file.startsWith(prefix) && extensions.has(path.extname(file).toLowerCase()));
  if (mode === 'remotion' && !hasUnder('assets/', visualExtensions)) failures.push(`${label}: provisional Remotion cuts require at least one real PNG/SVG/photo asset in assets/`);
  if (mode === 'source-photo' && !hasUnder('source-photo/', visualExtensions) && !hasUnder('assets/', visualExtensions)) failures.push(`${label}: source-photo cuts require a real local photo in source-photo/ or assets/`);
  if (mode === 'source-video' && !hasUnder('source-video/', videoExtensions) && !hasUnder('assets/', videoExtensions)) failures.push(`${label}: source-video cuts require a real local video in source-video/ or assets/`);
  if (mode === 'omni') {
    const keyframes = Array.isArray(manifest.omni?.keyframes) ? manifest.omni.keyframes : [];
    const keyframeFiles = keyframes.map((item) => typeof item?.file === 'string' ? item.file : '').filter(Boolean);
    let hasKeyframe = false;
    for (const file of keyframeFiles) {
      if (!file.startsWith('omni/') || path.extname(file).toLowerCase() !== '.png' || file.includes('..')) continue;
      try { if ((await stat(path.join(shotRoot, file))).isFile()) { hasKeyframe = true; if (shotBackgroundHash && shotBackgroundHash === sha256(await readFile(path.join(shotRoot, file)))) failures.push(`${label}: Omni keyframe duplicates the fixed background hash`); } } catch { /* report missing keyframe below */ }
    }
    if (!hasKeyframe || !hasUnder('omni/', new Set(['.png']))) failures.push(`${label}: Omni provisional cuts require imagegen PNG keyframes in omni/ and manifest omni.keyframes records`);
    const output = path.join(shotRoot, 'omni', 'output.mp4');
    if (!cutReviewPassed) {
      if (await exists(output)) failures.push(`${label}: Omni output.mp4 is blocked until all episode-spec planned cuts have user PASS and the episode cut-review marker`);
      if (manifestFiles.some((file) => file.replaceAll('\\', '/') === 'omni/output.mp4')) failures.push(`${label}: Omni output.mp4 must not be referenced before cut review approval`);
    }
  }
  const effectsDirectory = path.join(shotRoot, 'effects');
  const effectsFiles = await realFiles(effectsDirectory, new Set([...visualExtensions, ...videoExtensions, '.wav', '.mp3']));
  if (effectsFiles.length === 0) {
    try { if ((await stat(effectsDirectory)).isDirectory()) failures.push(`${label}: effects/ exists but contains no real effect file; omit it when effects_required=false`); } catch { /* effects are optional */ }
  }
  const requiredEffects = manifest.effects_required === true;
  if (requiredEffects && (manifest.effects ?? []).length === 0) failures.push(`${label}: effects_required=true requires manifest effect records`);
  if (requiredEffects && effectsFiles.length === 0) failures.push(`${label}: effects_required=true requires at least one real local effects/ file`);
  if (effectsFiles.length > 0 && (manifest.effects ?? []).length === 0) failures.push(`${label}: every real effects/ file must be represented in manifest.effects`);
}

async function validateSourceAssetMaterializations(manifest, label, shotRoot) {
  const entries = manifest.source_asset_materializations ?? [];
  if (!Array.isArray(entries)) {
    failures.push(`${label}: source_asset_materializations must be an array`);
    return;
  }
  const withinShot = (file) => {
    if (typeof file !== 'string' || !file || path.isAbsolute(file)) return null;
    const absolute = path.resolve(shotRoot, file);
    const relative = path.relative(path.resolve(shotRoot), absolute);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? absolute : null;
  };
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label}: source_asset_materializations[${index}]`;
    if (!Number.isSafeInteger(entry?.media_asset_id) || entry.media_asset_id < 1 || !nonBlank(entry?.source_id)) failures.push(`${entryLabel}: media_asset_id and source_id are required`);
    if (entry?.review_state !== 'approved') failures.push(`${entryLabel}: source media must be approved`);
    if (!['source', 'transparent-layers'].includes(entry?.route)) failures.push(`${entryLabel}: invalid route`);
    if (entry?.route === 'transparent-layers' && entry?.usage === 'documentary-evidence') failures.push(`${entryLabel}: transparent cutouts cannot replace documentary evidence`);
    if (!nonBlank(entry?.source?.original_url) || !/^https?:\/\//iu.test(entry.source.original_url) || !nonBlank(entry?.source?.license) || !nonBlank(entry?.source?.attribution)) failures.push(`${entryLabel}: original URL, license and attribution are required`);
    const sourcePath = withinShot(entry?.source?.file);
    if (!sourcePath) failures.push(`${entryLabel}: unsafe source file path`);
    else {
      try {
        const sourceBuffer = await readFile(sourcePath);
        if (sha256(sourceBuffer) !== entry.source.sha256 || sourceBuffer.byteLength !== entry.source.bytes) failures.push(`${entryLabel}: source hash/bytes mismatch`);
      } catch { failures.push(`${entryLabel}: source file is missing`); }
    }
    if (entry?.route === 'source' && !assets.some((asset) => asset?.file === entry?.source?.file && asset?.sha256 === entry?.source?.sha256 && asset?.source_id === entry?.source_id)) failures.push(`${entryLabel}: source route is not bound to a matching manifest asset`);
    for (const [derivativeIndex, derivative] of (entry?.derivatives ?? []).entries()) {
      const derivativeLabel = `${entryLabel}.derivatives[${derivativeIndex}]`;
      if (!['person', 'building', 'object', 'interior'].includes(derivative?.subject_kind)) failures.push(`${derivativeLabel}: invalid subject_kind`);
      if (!assets.some((asset) => asset?.asset_id === derivative?.asset_id && asset?.file === derivative?.file && asset?.sha256 === derivative?.sha256 && asset?.source_id === entry?.source_id)) failures.push(`${derivativeLabel}: derivative is not bound to a matching manifest asset`);
      const derivativePath = withinShot(derivative?.file);
      if (!derivativePath || !String(derivative.file).startsWith('assets/') || path.extname(derivative.file).toLowerCase() !== '.png') failures.push(`${derivativeLabel}: derivative must be a safe assets/*.png path`);
      else {
        try {
          const derivativeBuffer = await readFile(derivativePath);
          if (sha256(derivativeBuffer) !== derivative.sha256) failures.push(`${derivativeLabel}: derivative SHA-256 mismatch`);
          const {data, info} = await sharp(derivativeBuffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
          let transparent = 0; let visible = 0;
          for (let offset = 3; offset < data.length; offset += info.channels) { if (data[offset] < 255) transparent += 1; if (data[offset] > 0) visible += 1; }
          if (transparent === 0 || visible === 0 || transparent !== derivative?.alpha?.transparent_pixels || visible !== derivative?.alpha?.visible_pixels || info.width !== derivative?.width || info.height !== derivative?.height) failures.push(`${derivativeLabel}: transparent PNG decode/alpha metadata mismatch`);
        } catch { failures.push(`${derivativeLabel}: derivative is missing or undecodable`); }
      }
      const inputPath = withinShot(derivative?.derivation_input?.file);
      if (!inputPath) failures.push(`${derivativeLabel}: unsafe derivation input path`);
      else { try { if (sha256(await readFile(inputPath)) !== derivative.derivation_input.sha256) failures.push(`${derivativeLabel}: derivation input SHA-256 mismatch`); } catch { failures.push(`${derivativeLabel}: derivation input is missing`); } }
      if (derivative?.derivation_input?.type === 'alpha-mask' && derivative?.derivation_input?.method !== 'manual-mask') failures.push(`${derivativeLabel}: alpha-mask must declare manual-mask`);
      if (derivative?.derivation_input?.type === 'transparent-png' && (derivative?.derivation_input?.method !== 'external-segmentation' || !nonBlank(derivative?.derivation_input?.provider))) failures.push(`${derivativeLabel}: transparent-png must declare its external segmentation provider`);
    }
  }
}

function validateRemotionContinuity(current, next, episodeName) {
  const label = `${episodeName}/${current.shot_id} -> ${next.shot_id}`;
  const transition = current.transition;
  if (!transition || !['morph', 'scene-to-scene'].includes(transition.type)) {
    failures.push(`${label}: adjacent Remotion cuts require morph or scene-to-scene transition`);
    return;
  }
  if (!Number.isInteger(transition.duration_frames) || transition.duration_frames <= 0) {
    failures.push(`${label}: Remotion continuity transition must have a non-zero duration`);
  }
  if (transition.next_shot_id !== next.shot_id) {
    failures.push(`${label}: transition.next_shot_id must reference the explicit next shot`);
  }
  const continuity = transition.continuity;
  if (!continuity || !['asset-morph', 'camera-state', 'spatial-state'].includes(continuity.relation)) {
    failures.push(`${label}: continuity metadata must declare asset-morph, camera-state, or spatial-state`);
    return;
  }
  const currentIds = new Set([
    ...(current.assets ?? []).map((asset) => asset?.asset_id),
    ...(current.effects ?? []).map((effect) => effect?.effect_id),
  ].filter(Boolean));
  const nextIds = new Set([
    ...(next.assets ?? []).map((asset) => asset?.asset_id),
    ...(next.effects ?? []).map((effect) => effect?.effect_id),
  ].filter(Boolean));
  const outgoing = Array.isArray(continuity.outgoing_asset_ids) ? continuity.outgoing_asset_ids : [];
  const incoming = Array.isArray(continuity.incoming_asset_ids) ? continuity.incoming_asset_ids : [];
  if (continuity.relation === 'asset-morph') {
    if (outgoing.length === 0 || outgoing.some((id) => !currentIds.has(id))) failures.push(`${label}: outgoing_asset_ids must reference current assets/effects`);
    if (incoming.length === 0 || incoming.some((id) => !nextIds.has(id))) failures.push(`${label}: incoming_asset_ids must reference next assets/effects`);
  } else {
    if (!continuity.outgoing_state || typeof continuity.outgoing_state !== 'object') failures.push(`${label}: outgoing_state is required for ${continuity.relation}`);
    if (!continuity.incoming_state || typeof continuity.incoming_state !== 'object') failures.push(`${label}: incoming_state is required for ${continuity.relation}`);
  }
}

validatePng(templateBuffer, '_cut-template');
// Versioned roots are discovered explicitly.  A rejected provisional root is
// reported as review material, never counted as validated production cuts.
const episodes = (await readdir(assetsRoot, {withFileTypes: true})).filter((entry) => entry.isDirectory() && /^episode-\d{3}(?:-v\d+)?$/.test(entry.name));
let shotCount = 0;
let rejectedProvisionalShotCount = 0;
let styleCalibrationShotCount = 0;

for (const episode of episodes) {
  const cutsRoot = path.join(assetsRoot, episode.name, 'cuts');
  try { await access(cutsRoot); } catch { continue; }
  const shots = (await readdir(cutsRoot, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory() && /^SH\d{3}$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const rootRelative = normalize(path.relative(root, path.join(assetsRoot, episode.name)));
  const nonProductionStatus = nonProductionRoots.get(rootRelative);
  const rejectedRoot = nonProductionStatus !== undefined;
  if (activeCutRoot === rootRelative) {
    activeCutRootSeen = true;
    if (shots.length !== expectedCutCount) failures.push(`${episode.name}: production state's active_cut_root must contain exactly ${expectedCutCount} physical cuts; found ${shots.length}`);
    if (plannedShotIds.length && shots.map((shot) => shot.name).join('|') !== plannedShotIds.join('|')) failures.push(`${episode.name}: active_cut_root must contain the exact ordered episode-spec planned cut set`);
    if (!plannedShotIds.length) failures.push(`${episode.name}: active_cut_root cannot be checked without episode-spec planned cut IDs`);
  }
  if (rejectedRoot) {
    if (['style-calibration-only', 'style-calibration-candidate'].includes(nonProductionStatus)) styleCalibrationShotCount += shots.length;
    else rejectedProvisionalShotCount += shots.length;
    continue;
  }
  const manifests = [];
  for (const shot of shots) {
    shotCount += 1;
    const label = `${episode.name}/${shot.name}`;
    const shotRoot = path.join(cutsRoot, shot.name);
    let shotBackgroundHash = null;
    try {
      const background = await readFile(path.join(shotRoot, 'background.png'));
      validatePng(background, label);
      shotBackgroundHash = sha256(background);
      if (sha256(background) !== templateHash) failures.push(`${label}: background.png differs from the fixed template`);
    } catch { failures.push(`${label}: missing background.png`); }
    try {
      if (!(await stat(path.join(shotRoot, 'assets'))).isDirectory()) failures.push(`${label}: assets is not a directory`);
    } catch { failures.push(`${label}: missing assets/`); }
    try {
      const manifest = JSON.parse(await readFile(path.join(shotRoot, 'manifest.json'), 'utf8'));
      manifests.push(manifest);
      if (activeCutRoot === rootRelative && path.resolve(assetsRoot) === path.resolve(root, 'video/public/assets')) {
        if (manifest.schema_version !== 3) failures.push(`${label}: canonical active candidate requires schema_version=3`);
        else {
          for (const message of validateVisualContractV3(manifest, {requireDeclaration: true, episodeSpecSha256, manifestContractsSha256})) failures.push(`${label}: ${message}`);
          const contract = manifestContracts.get(manifest.shot_id);
          if (!contract) failures.push(`${label}: generated episode manifest contract missing`);
          else {
            for (const message of validateManifestAgainstEpisodeContract(manifest, contract)) failures.push(message);
            for (const message of await validateApprovedContractRequirements({root, manifestPath: path.join(shotRoot, 'manifest.json'), manifest, contract})) failures.push(message);
          }
        }
      }
      validateManifest(manifest, label, episode.name, shot.name, {requireAssetOriginPolicy: activeCutRoot === rootRelative});
      await validateModeAssets(manifest, label, shotRoot);
      await validateSourceAssetMaterializations(manifest, label, shotRoot);
      for (const [index, asset] of (manifest.assets ?? []).entries()) {
        if (typeof asset?.file === 'string' && !asset.file.includes('..')) {
          try {
            const assetPath = path.join(shotRoot, asset.file);
            const assetStat = await stat(assetPath);
            if (!assetStat.isFile()) failures.push(`${label}: assets[${index}].file is not a file: ${asset.file}`);
            else if (shotBackgroundHash && shotBackgroundHash === sha256(await readFile(assetPath))) failures.push(`${label}: assets[${index}].file duplicates the fixed background hash`);
            else if (visualExtensions.has(path.extname(asset.file).toLowerCase())) validateImageBuffer(await readFile(assetPath), assetPath, `${label}: assets[${index}].file`);
            else if (videoExtensions.has(path.extname(asset.file).toLowerCase())) validateVideo(assetPath, `${label}: assets[${index}].file`);
          } catch { failures.push(`${label}: assets[${index}].file does not exist: ${asset.file}`); }
        }
      }
      for (const [index, effect] of (manifest.effects ?? []).entries()) {
        if (typeof effect?.file === 'string' && !effect.file.includes('..')) {
          try {
            const effectPath = path.join(shotRoot, effect.file);
            await access(effectPath);
            validateEffectMedia(effectPath, `${label}: effects[${index}].file`);
            if (productionStageIndex(productionStage) >= productionStageIndex('audio-timed-assembly')) {
              if (!nonBlank(effect.source_id) || !nonBlank(effect.original_url) || !nonBlank(effect.rights_status) || effect.approval_status !== 'approved') failures.push(`${label}: strict effects require non-blank source_id, original_url, rights_status and approval_status=approved`);
              if (effect.sha256 !== sha256(await readFile(effectPath))) failures.push(`${label}: effects[${index}] checksum does not match the local file`);
            }
          } catch { failures.push(`${label}: effects[${index}].file does not exist: ${effect.file}`); }
        }
      }
      if ((manifest.effects ?? []).length > 0) {
        try { if (!(await stat(path.join(shotRoot, 'effects'))).isDirectory()) failures.push(`${label}: effects is not a directory`); } catch { failures.push(`${label}: missing effects/ for declared effects`); }
      }
      if (manifest.production_mode === 'omni') {
        const omniDir = path.join(shotRoot, 'omni');
        const omniFiles = await filesRecursively(omniDir);
        for (const videoPath of omniFiles.filter((entry) => videoExtensions.has(path.extname(entry).toLowerCase()) || looksLikeVideo(entry))) {
          const relativeVideo = normalize(path.relative(shotRoot, videoPath));
          if (!cutReviewPassed) failures.push(`${label}: Omni video files are blocked until cut review approval: ${relativeVideo}`);
          else validateVideo(videoPath, `${label}: ${relativeVideo}`);
        }
        if (productionStageIndex(productionStage) >= productionStageIndex('provisional-video-ready')) {
          const declaredOutput = typeof manifest.omni?.output === 'string' ? manifest.omni.output : '';
          const output = declaredOutput ? path.join(shotRoot, declaredOutput) : '';
          if (!declaredOutput || !declaredOutput.startsWith('omni/') || !videoExtensions.has(path.extname(declaredOutput).toLowerCase())) failures.push(`${label}: provisional-video-ready requires declared Omni output video`);
          else { try { await access(output); validateVideo(output, `${label}: ${declaredOutput}`); } catch { failures.push(`${label}: declared Omni output does not exist: ${declaredOutput}`); } }
        }
        if (productionStageIndex(productionStage) < productionStageIndex('cut-review-approved')) {
          const refs = JSON.stringify(manifest).match(/[^"\\]*(?:\.mp4|\.webm|\.mov|\.m4v|\.avi|\.mkv|\.mpeg|\.mpg|\.ts|\.3gp|\.flv)/giu) ?? [];
          if (refs.length > 0) failures.push(`${label}: manifest video references are blocked before cut review approval`);
          if (!['blocked_until_all_cuts_passed', 'not_applicable', null, undefined].includes(manifest.omni?.video_status)) failures.push(`${label}: Omni video_status must remain blocked_until_all_cuts_passed before cut review approval`);
        }
      }
      if (productionStageIndex(productionStage) >= productionStageIndex('audio-timed-assembly') && manifest.production_mode === 'omni') {
        if (!manifest.ai_disclosure || !nonBlank(manifest.ai_disclosure.tool) || !nonBlank(manifest.ai_disclosure.generated_at) || !nonBlank(manifest.ai_disclosure.label) || !nonBlank(manifest.ai_disclosure.prompt)) failures.push(`${label}: strict Omni assembly requires non-blank AI disclosure provenance`);
      }
    } catch { failures.push(`${label}: missing or invalid manifest.json`); }
    for (const directory of requiredDirectories) {
      try {
        if (!(await stat(path.join(shotRoot, directory))).isDirectory()) failures.push(`${label}: ${directory} is not a directory`);
      } catch { failures.push(`${label}: missing ${directory}/`); }
    }
  }
  for (let index = 0; index < manifests.length - 1; index += 1) {
    const current = manifests[index];
    const next = manifests[index + 1];
    if (current?.production_mode === 'remotion' && next?.production_mode === 'remotion') {
      validateRemotionContinuity(current, next, episode.name);
    }
  }
}

const scannedAssetsPrefix = `${normalize(path.relative(root, assetsRoot))}/`;
for (const [relative, status] of nonProductionRoots) {
  if (relative.startsWith(scannedAssetsPrefix)) continue;
  const cutsRoot = path.join(root, relative, 'cuts');
  const historicalShots = (await readdir(cutsRoot, {withFileTypes: true}).catch(() => []))
    .filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name));
  if (['style-calibration-only', 'style-calibration-candidate'].includes(status)) styleCalibrationShotCount += historicalShots.length;
  else rejectedProvisionalShotCount += historicalShots.length;
}

if (activeCutRoot && !activeCutRootSeen) failures.push(`production state's active_cut_root was not discovered: ${activeCutRoot}`);
if (requireCuts && !activeCutRoot) failures.push("--require-cuts requires production state's active_cut_root; unrelated scanned roots are not sufficient");

if (shotCount === 0 && requireCuts) failures.push('No episode cut folders were found; production/publish validation requires at least one cut (omit --require-cuts during planning)');
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(shotCount === 0
  ? `Validated planning stage: template is valid and no active production cut folders exist yet${rejectedProvisionalShotCount ? `; rejected ${rejectedProvisionalShotCount} provisional/historical cut folders` : ''}${styleCalibrationShotCount ? `; skipped ${styleCalibrationShotCount} style-calibration candidate cut folders` : ''}`
  : `Validated ${shotCount} active cut folders with the fixed 1920x1080 background${rejectedProvisionalShotCount ? `; rejected ${rejectedProvisionalShotCount} provisional/historical cut folders (non-active)` : ''}${styleCalibrationShotCount ? `; skipped ${styleCalibrationShotCount} style-calibration candidate cut folders` : ''}`);
