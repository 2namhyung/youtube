import {access, readdir, readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {validateManifestTimingAuthority} from './visual-state-lib.mjs';
import {reviewBundleSha256, runtimeSha256} from './visual-contract-v2.mjs';
import {validateVisualContractV3} from './visual-contract-v3.mjs';
import {validateApprovedContractRequirements, validateManifestAgainstEpisodeContract} from './episode-manifest-contract.mjs';
import {validateSourceVideoContract} from './source-video-contract.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const statePath = path.resolve(root, valueFor('--state', 'video/episodes/episode-001/production-state.json'));
const assetsRoot = path.resolve(root, valueFor('--assets-root', 'video/public/assets'));
const indexPath = path.resolve(root, valueFor('--index', 'video/src/index.tsx'));
const requestedLock = valueFor('--lock', null);
const renderOutput = valueFor('--render-output', null);
const audioDirArg = valueFor('--audio-dir', null);
const failures = [];
const warnings = [];
const stages = ['timing-draft', 'cut-previews-ready', 'cut-review-approved', 'provisional-video-ready', 'visual-review-approved', 'script-locked', 'final-voice-locked', 'audio-timed-assembly', 'picture-locked'];
const bannedCompositionName = /(master|final|picturelocked)/iu;

function fail(message) { failures.push(message); }
function canonicalStage(value) {
  if (!value) return null;
  return ({
    'provisional-visual': 'cut-previews-ready',
    'visual-review': 'visual-review-approved',
    'visual-review-approved': 'visual-review-approved',
    'final-script': 'script-locked',
    'final-script-locked': 'script-locked',
    'script-locked': 'script-locked',
    'final-voice': 'final-voice-locked',
    'final-voice-locked': 'final-voice-locked',
    'audio-timed': 'audio-timed-assembly',
    'audio-timed-assembly': 'audio-timed-assembly',
    'picture-lock': 'picture-locked',
    'picture-locked': 'picture-locked',
  })[value] ?? value;
}
function hasText(value, needle) { return typeof value === 'string' && value.toLowerCase().includes(needle); }
function nonBlank(value) { return typeof value === 'string' && value.trim() !== ''; }
function normalize(value) { return value.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, ''); }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readJson(file, {recordFailure = true} = {}) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { if (recordFailure) fail(`invalid or unreadable JSON: ${path.relative(root, file)}`); return null; }
}
async function cutDirectories(rootDir) {
  const cutsRoot = path.join(rootDir, 'cuts');
  if (!(await exists(cutsRoot))) return [];
  return (await readdir(cutsRoot, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function rejectedRootMap(state) {
  return new Map(Object.entries(state.provisional_artifacts ?? {})
    .filter(([key, status]) => key !== 'note' && ['rejected-provisional-visual', 'historical-rejected-provisional-visual', 'style-calibration-only', 'historical-rejected-style-calibration', 'historical-viewer-quality-failure', 'style-calibration-candidate'].includes(status))
    .map(([key, status]) => [normalize(key), status]));
}
function relativeRoot(rootDir) { return normalize(path.relative(root, rootDir)); }

const state = await readJson(statePath);
if (!state) {
  console.log(JSON.stringify({ok: false, failures}, null, 2));
  process.exit(1);
}
const currentStage = canonicalStage(state.stage);
const manifestContractsPath = path.resolve(root, valueFor('--contracts', 'video/episodes/episode-001/generated/manifest-contracts.json'));
const manifestContractsBytes = await readFile(manifestContractsPath).catch(() => null);
const manifestContractsDocument = manifestContractsBytes ? JSON.parse(manifestContractsBytes.toString('utf8')) : await readJson(manifestContractsPath);
const manifestContracts = new Map((manifestContractsDocument?.cuts ?? []).map((contract) => [contract.shot_id, contract]));
const episodeSpecPath = path.resolve(root, valueFor('--spec', state.draft_inputs?.episode_spec ?? 'video/episodes/episode-001/episode-spec.json'));
const episodeSpecBytes = await readFile(episodeSpecPath).catch(() => null);
const episodeSpecSha256 = episodeSpecBytes ? createHash('sha256').update(episodeSpecBytes).digest('hex') : null;
const episodeSpec = episodeSpecBytes ? JSON.parse(episodeSpecBytes.toString('utf8')) : null;
const manifestContractsSha256 = manifestContractsBytes ? createHash('sha256').update(manifestContractsBytes).digest('hex') : null;
const expectedCutIds = Array.isArray(episodeSpec?.cuts) ? episodeSpec.cuts.map((cut) => cut.shot_id) : [];
const expectedCutCount = expectedCutIds.length;
const sourceLedRevision = ['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(episodeSpec?.editorial_revision?.id)
  && episodeSpec?.production_routing_policy?.version === 1;
const narrativeSourceFirstV3 = episodeSpec?.editorial_revision?.id === 'ep001-narrative-source-first-v3';
const sourceLedAuthority = state.render_authority ?? {};
const sourceLedReview = state.cut_review ?? {};
if (state.episode_id !== 'episode-001') fail('production state must describe episode-001');
if (!stages.includes(currentStage)) fail(`production state has unknown current stage: ${state.stage}`);
if (expectedCutCount === 0 || episodeSpec?.editorial_revision?.cut_count !== expectedCutCount) fail('episode spec must match its declared editorial revision cut count');
if (state.expected_cut_count !== expectedCutCount) fail(`production state expected_cut_count must match the ${expectedCutCount} episode-spec cuts`);
if (state.draft_inputs?.temporary_script_available !== true) fail('timing-draft requires draft_inputs.temporary_script_available=true');
if (state.active_cut_root !== null && typeof state.active_cut_root !== 'string') fail('active_cut_root must be null or a relative path');

const targetStage = canonicalStage(requestedLock) ?? currentStage;
const targetIndex = stages.indexOf(targetStage);
if (!stages.includes(targetStage)) fail(`unknown stage/lock target: ${requestedLock ?? state.stage}`);
if (sourceLedRevision && targetIndex < stages.indexOf('cut-previews-ready') && state.active_cut_root !== null) fail('source-first active_cut_root cannot be selected before cut-previews-ready');
if (episodeSpec?.production_routing_policy && !sourceLedRevision) fail('production routing policy is not attached to a recognized source-led editorial revision');
const sourceLedInactiveDraft = sourceLedRevision
  && episodeSpec?.editorial_revision?.status === 'candidate-plan-blocked'
  && currentStage === 'timing-draft' && targetStage === 'timing-draft' && state.active_cut_root === null
  && sourceLedAuthority.status === 'blocked-superseded-by-editorial-revision'
  && sourceLedAuthority.cut_root === null && sourceLedAuthority.catalog === null
  && sourceLedAuthority.catalog_sha256 === null && sourceLedAuthority.manifest_set_sha256 === null
  && sourceLedAuthority.production_authority === false
  && sourceLedReview.all_cuts_passed === false && sourceLedReview.approval_marker === null
  && sourceLedReview.approved_inputs_sha256 === null
  && state.omni_video_generation?.status === 'blocked_until_all_cuts_passed'
  && state.omni_video_generation?.allowed_after_marker === null
  && state.style_calibration?.status === 'blocked-superseded-by-editorial-revision'
  && state.style_calibration?.authority === null && state.style_calibration?.candidate_root === null
  && state.style_calibration?.user_approved === false && state.style_calibration?.approval_marker === null;
if (sourceLedRevision && episodeSpec.editorial_revision.production_authority !== false) fail('source-first episode-spec must not claim production authority');
if (sourceLedRevision && episodeSpec.editorial_revision.status === 'candidate-plan-blocked'
  && currentStage === 'timing-draft' && !sourceLedInactiveDraft) {
  fail('candidate-plan-blocked source-first timing-draft must retain the exact null-root, unapproved state');
}
if (sourceLedRevision && currentStage !== 'timing-draft'
  && (episodeSpec.editorial_revision.status !== 'source-selected-editorial-plan'
    || !['approved-script-source-first-semantic-plan', 'approved-script-narrative-source-first-plan'].includes(episodeSpec.status))) {
  fail('progressed source-first stages require the source-selected editorial plan revision and approved-script plan status');
}
if (sourceLedInactiveDraft) {
  if (state.production_authority === true) fail('blocked source-first draft cannot claim production authority');
  if (state.final_script?.status === 'locked' || state.final_voice?.status === 'locked' || state.picture_lock?.approved === true
    || state.visual_review?.user_approved === true) fail('blocked source-first draft cannot claim script, voice, visual, or picture lock');
} else if (sourceLedRevision && state.production_authority === true) {
  if (targetIndex < stages.indexOf('cut-review-approved') || sourceLedReview.all_cuts_passed !== true || !nonBlank(sourceLedReview.approval_marker)) {
    fail('source-first production authority requires the cut-review stage and explicit episode PASS marker');
  }
}
const pictureIndex = stages.indexOf('picture-locked');
const cutReviewGateIndex = stages.indexOf('cut-review-approved');
const omniGeneration = state.omni_video_generation ?? {};
if (targetIndex < cutReviewGateIndex) {
  if (omniGeneration.status !== 'blocked_until_all_cuts_passed' || omniGeneration.allowed_after_marker !== null) fail('Omni generation must remain blocked_until_all_cuts_passed with allowed_after_marker=null before cut review approval');
} else {
  const expectedMarker = typeof state.cut_review?.approval_marker === 'string' ? state.cut_review.approval_marker : '';
  if (!['allowed', 'generating', 'generated'].includes(omniGeneration.status) || !expectedMarker || omniGeneration.allowed_after_marker !== expectedMarker) fail('Omni generation after cut review requires allowed/generating/generated status and allowed_after_marker matching cut_review.approval_marker');
}

const indexSource = await readFile(indexPath, 'utf8').catch(() => '');
const compositionIds = [...indexSource.matchAll(/<Composition\s+id="([^"]+)"/gu)].map((match) => match[1]);
if (targetIndex < pictureIndex) {
  for (const id of compositionIds) if (bannedCompositionName.test(id)) fail(`pre-picture-lock composition id cannot contain master/final/picturelocked: ${id}`);
}
if (renderOutput && targetIndex < pictureIndex) {
  const filename = path.basename(renderOutput);
  if (bannedCompositionName.test(filename) || !/(provisional|animatic)/iu.test(filename)) {
    fail(`pre-picture-lock render output must be marked provisional/animatic and cannot contain master/final/picturelocked: ${filename}`);
  }
}

const rejectedRoots = rejectedRootMap(state);
const rejectedCutCount = {value: 0};
const styleCalibrationCutCount = {value: 0};
for (const [relative, status] of rejectedRoots) {
  const rootDir = path.resolve(root, relative);
  if (!(await exists(rootDir))) { warnings.push(`${relative} is state-declared ${status} but missing`); continue; }
  const count = (await cutDirectories(rootDir)).length;
  if (['style-calibration-only', 'style-calibration-candidate'].includes(status)) styleCalibrationCutCount.value += count;
  else rejectedCutCount.value += count;
  warnings.push(`${relative} is ${status === 'style-calibration-candidate' ? 'style-calibration candidate' : status === 'style-calibration-only' ? 'style-calibration-only' : 'rejected/historical provisional'} non-production material`);
}

let activeRootDir = null;
let activeCuts = [];
if (targetIndex >= stages.indexOf('cut-previews-ready')) {
  if (typeof state.active_cut_root !== 'string' || state.active_cut_root.trim() === '') {
    fail(`${targetStage} requires active_cut_root`);
  } else {
    activeRootDir = path.resolve(root, state.active_cut_root);
    const activeRelative = relativeRoot(activeRootDir);
    if (!activeRelative.startsWith(normalize(path.relative(root, assetsRoot)) + '/')) fail('active_cut_root must be inside video/public/assets');
    if (rejectedRoots.has(activeRelative)) fail('active_cut_root cannot point to a rejected provisional/non-production root');
    activeCuts = await cutDirectories(activeRootDir);
    if (activeCuts.length !== state.expected_cut_count) fail(`active_cut_root must contain exactly ${state.expected_cut_count} physical cuts; found ${activeCuts.length}`);
    if (activeCuts.length > 0) {
      const ids = activeCuts.map((cut) => cut.name);
      if (ids.join('|') !== expectedCutIds.join('|')) fail('active_cut_root must contain the exact episode-spec cut set in order');
    }
  }
}

const activeManifests = [];
if (activeRootDir) {
  for (const cut of activeCuts) {
    const file = path.join(activeRootDir, 'cuts', cut.name, 'manifest.json');
    const manifest = await readJson(file, {recordFailure: targetIndex >= stages.indexOf('cut-previews-ready')});
    if (manifest) activeManifests.push({file, manifest, label: `${path.basename(activeRootDir)}/${cut.name}`});
  }
}

if (activeRootDir) {
  for (const {file, manifest, label} of activeManifests) {
    for (const message of validateSourceVideoContract(manifest)) fail(`${label}: ${message}`);
    if (manifest.schema_version !== 3) fail(`${label}: canonical active candidates require schema_version=3`);
    else {
      for (const message of validateVisualContractV3(manifest, {
        requireTransitionArtifact: manifest.approvals?.playable_cut?.user_pass === true,
        requireEvidenceVerification: true,
        requireDeclaration: true,
        episodeSpecSha256,
        manifestContractsSha256,
      })) fail(`${label}: ${message}`);
      const contract = manifestContracts.get(manifest.shot_id);
      if (!contract) fail(`${label}: generated episode manifest contract is missing`);
      else {
        for (const message of validateManifestAgainstEpisodeContract(manifest, contract)) fail(message);
        for (const message of await validateApprovedContractRequirements({root, manifestPath: file, manifest, contract})) fail(message);
      }
    }
  }
}

let narrationTimingPlan = null;
let narrationTimingPlanPath = null;
if (targetIndex >= stages.indexOf('cut-previews-ready')) {
  const configuredPlan = valueFor('--plan', state.draft_inputs?.narration_plan ?? null);
  const canonicalState = normalize(path.relative(root, statePath)).startsWith('video/episodes/');
  if (!nonBlank(configuredPlan)) {
    if (canonicalState) fail('cut-previews-ready and later require draft_inputs.narration_plan timing authority');
  } else {
    narrationTimingPlanPath = path.resolve(root, configuredPlan);
    narrationTimingPlan = await readJson(narrationTimingPlanPath);
    if (narrationTimingPlan && targetIndex < stages.indexOf('final-voice-locked')) {
      for (const message of validateManifestTimingAuthority({manifests: activeManifests.map(({manifest}) => manifest), plan: narrationTimingPlan})) fail(message);
    }
  }
}

const cutPreviewIndex = stages.indexOf('cut-previews-ready');
const cutReviewIndex = stages.indexOf('cut-review-approved');
const provisionalVideoIndex = stages.indexOf('provisional-video-ready');
const cutReviewMarker = typeof state.cut_review?.approval_marker === 'string' ? state.cut_review.approval_marker.trim() : '';
const hasCutReviewMarker = state.cut_review?.all_cuts_passed === true && cutReviewMarker !== '';
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.mpeg', '.mpg', '.ts', '.3gp', '.flv']);
const videoStatusAllowedBeforeReview = new Set(['blocked_until_all_cuts_passed', 'not_applicable', null, undefined]);
const isRealMedia = (file, extensions) => typeof file === 'string'
  && !file.includes('..')
  && !path.basename(file).toLowerCase().includes('placeholder')
  && extensions.has(path.extname(file).toLowerCase());
async function localRealMedia(shotRoot, file, extensions) {
  if (!isRealMedia(file, extensions)) return false;
  try { return (await stat(path.join(shotRoot, file))).isFile(); } catch { return false; }
}
function isPng(buffer) { return buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0; }
async function validateImageFile(file, label) {
  try {
    const buffer = await readFile(file);
    const extension = path.extname(file).toLowerCase();
    const text = buffer.toString('utf8');
    if (extension === '.png' && !isPng(buffer)) { fail(`${label}: PNG signature/dimensions are invalid`); return false; }
    if (extension === '.svg' && (!text.trim() || !/<svg(?:\s|>)/iu.test(text))) { fail(`${label}: SVG must contain non-empty <svg> markup`); return false; }
    if (extension === '.jpg' || extension === '.jpeg' || extension === '.webp') {
      const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
      const report = result.status === 0 ? JSON.parse(result.stdout || '{}') : {};
      if (!(Number(report.streams?.[0]?.width) > 0) || !(Number(report.streams?.[0]?.height) > 0)) { fail(`${label}: raster image failed ffprobe decode/dimensions`); return false; }
    }
    return true;
  } catch { fail(`${label}: media file is unreadable`); return false; }
}
function probeAudio(file, label) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) { fail(`${label}: ffprobe rejected the audio`); return false; }
  try {
    const report = JSON.parse(result.stdout);
    if (!(Number(report.format?.duration) > 0) || !report.streams?.some((stream) => stream.codec_type === 'audio')) { fail(`${label}: audio must have a positive duration and an audio stream`); return false; }
    return true;
  } catch { fail(`${label}: ffprobe returned invalid audio JSON`); return false; }
}
function probeVideo(file, label) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) { fail(`${label}: ffprobe rejected the video`); return false; }
  try {
    const report = JSON.parse(result.stdout);
    const duration = Number(report.format?.duration);
    if (!(duration > 0) || !report.streams?.some((stream) => stream.codec_type === 'video')) { fail(`${label}: video must have a positive duration and a video stream`); return false; }
    return true;
  } catch { fail(`${label}: ffprobe returned invalid JSON`); return false; }
}
async function validateEffectFile(file, label) {
  const extension = path.extname(file).toLowerCase();
  if (imageExtensions.has(extension)) return validateImageFile(file, label);
  if (videoExtensions.has(extension)) return probeVideo(file, label);
  if (extension === '.wav' || extension === '.mp3') return probeAudio(file, label);
  fail(`${label}: unsupported effect media extension`);
  return false;
}
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
async function sha256File(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function approvedInputsHash() {
  const rows = [];
  for (const {file, manifest, label} of activeManifests) {
    const shotRoot = path.dirname(file);
    for (const asset of manifest.assets ?? []) if (typeof asset?.file === 'string' && await exists(path.join(shotRoot, asset.file))) rows.push(`${label}|asset|${normalize(asset.file)}|${await sha256File(path.join(shotRoot, asset.file))}`);
    for (const keyframe of manifest.omni?.keyframes ?? []) if (typeof keyframe?.file === 'string' && await exists(path.join(shotRoot, keyframe.file))) rows.push(`${label}|keyframe|${normalize(keyframe.file)}|${await sha256File(path.join(shotRoot, keyframe.file))}`);
    for (const effect of manifest.effects ?? []) if (typeof effect?.file === 'string' && await exists(path.join(shotRoot, effect.file))) rows.push(`${label}|effect|${normalize(effect.file)}|${await sha256File(path.join(shotRoot, effect.file))}`);
  }
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex');
}
function hasVideoReference(value) { return typeof value === 'string' && /\.(?:mp4|webm|mov|m4v|avi|mkv|mpeg|mpg|ts|3gp|flv)$/iu.test(value); }
function findVideoReferences(value, prefix = '') {
  if (hasVideoReference(value)) return [prefix || value];
  if (Array.isArray(value)) return value.flatMap((entry, index) => findVideoReferences(entry, `${prefix}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value)
    .filter(([key]) => key !== 'runtime_contract')
    .flatMap(([key, entry]) => findVideoReferences(entry, prefix ? `${prefix}.${key}` : key));
  return [];
}
async function validateActiveCutInputs() {
  if (targetIndex < cutPreviewIndex) return;
  if (activeManifests.length !== state.expected_cut_count) return;
  const templatePath = path.join(assetsRoot, '_cut-template', 'background.png');
  if (!(await exists(templatePath))) { fail('active cuts require the fixed template background.png'); return; }
  const templateHash = await sha256File(templatePath);
  for (const {file, manifest, label} of activeManifests) {
    const shotRoot = path.dirname(file);
    const backgroundPath = path.join(shotRoot, 'background.png');
    if (!(await exists(backgroundPath))) { fail(`${label}: active cut requires background.png`); }
    const backgroundHash = await exists(backgroundPath) ? await sha256File(backgroundPath) : null;
    if (backgroundHash && backgroundHash !== templateHash) fail(`${label}: background.png must match the fixed template hash`);
    const files = (manifest.assets ?? []).map((asset) => asset?.file).filter((entry) => typeof entry === 'string');
    const allVideoReferences = findVideoReferences(manifest);
    for (const [index, asset] of (manifest.assets ?? []).entries()) {
      if (typeof asset?.file !== 'string') continue;
      const assetPath = path.join(shotRoot, asset.file);
      if (backgroundHash && await exists(assetPath) && backgroundHash === await sha256File(assetPath)) fail(`${label}: visual asset duplicates the fixed background hash`);
      if (imageExtensions.has(path.extname(asset.file).toLowerCase())) await validateImageFile(assetPath, `${label}: assets[${index}].file`);
      if (videoExtensions.has(path.extname(asset.file).toLowerCase()) && await exists(assetPath)) probeVideo(assetPath, `${label}: assets[${index}].file`);
    }
    const hasAsset = async (prefix, extensions) => {
      for (const entry of files) if (entry.startsWith(prefix) && await localRealMedia(shotRoot, entry, extensions)) return true;
      return false;
    };
    const mode = manifest.production_mode;
    if (manifest.review?.user_pass === true) {
      for (const [index, asset] of (manifest.assets ?? []).entries()) {
        if (typeof asset?.file !== 'string' || typeof asset?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(asset.sha256)) fail(`${label}: passed asset ${index} requires a sha256 hash`);
        else if (await exists(path.join(shotRoot, asset.file)) && asset.sha256 !== await sha256File(path.join(shotRoot, asset.file))) fail(`${label}: passed asset ${index} sha256 no longer matches the local file`);
      }
      for (const [index, keyframe] of (manifest.omni?.keyframes ?? []).entries()) {
        if (typeof keyframe?.file !== 'string' || typeof keyframe?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(keyframe.sha256)) fail(`${label}: passed Omni keyframe ${index} requires a sha256 hash`);
        else if (await exists(path.join(shotRoot, keyframe.file)) && keyframe.sha256 !== await sha256File(path.join(shotRoot, keyframe.file))) fail(`${label}: passed Omni keyframe ${index} sha256 no longer matches the local file`);
      }
      for (const [index, effect] of (manifest.effects ?? []).entries()) {
        if (typeof effect?.file !== 'string' || typeof effect?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(effect.sha256)) fail(`${label}: passed effect ${index} requires a sha256 hash`);
        else if (await exists(path.join(shotRoot, effect.file)) && effect.sha256 !== await sha256File(path.join(shotRoot, effect.file))) fail(`${label}: passed effect ${index} sha256 no longer matches the local file`);
      }
    }
    if (mode === 'remotion' && !(await hasAsset('assets/', imageExtensions))) fail(`${label}: Remotion provisional cut requires a real local image asset in assets/`);
    if (mode === 'source-photo' && !(await hasAsset('source-photo/', imageExtensions)) && !(await hasAsset('assets/', imageExtensions))) fail(`${label}: source-photo provisional cut requires a real local photo`);
    if (mode === 'source-video' && !(await hasAsset('source-video/', videoExtensions)) && !(await hasAsset('assets/', videoExtensions))) fail(`${label}: source-video provisional cut requires a real local video`);
    if (mode === 'omni') {
      const keyframes = Array.isArray(manifest.omni?.keyframes) ? manifest.omni.keyframes : [];
      let keyframe = false;
      for (const item of keyframes) if (item?.file?.startsWith('omni/') && await localRealMedia(shotRoot, item.file, new Set(['.png']))) keyframe = true;
      if (!keyframe) fail(`${label}: Omni provisional cut requires an imagegen PNG keyframe in omni/ and a manifest record`);
      for (const item of keyframes) if (typeof item?.file === 'string' && backgroundHash && await exists(path.join(shotRoot, item.file)) && backgroundHash === await sha256File(path.join(shotRoot, item.file))) fail(`${label}: Omni keyframe duplicates the fixed background hash`);
      const omniDirectory = path.join(shotRoot, 'omni');
      const omniFiles = await filesRecursively(omniDirectory);
      const omniVideos = omniFiles.filter((filePath) => videoExtensions.has(path.extname(filePath).toLowerCase()) || looksLikeVideo(filePath));
      for (const videoPath of omniVideos) {
        const relativeVideo = normalize(path.relative(shotRoot, videoPath));
        if (targetIndex < cutReviewIndex || !hasCutReviewMarker) fail(`${label}: Omni video files are blocked until all ${expectedCutCount} cuts have user PASS and cut-review approval (${relativeVideo})`);
        else probeVideo(videoPath, `${label}: ${relativeVideo}`);
      }
      if (targetIndex < cutReviewIndex || !hasCutReviewMarker) {
        if (allVideoReferences.length > 0) fail(`${label}: manifest video references are blocked before cut-review approval (${allVideoReferences.join(', ')})`);
        if (!videoStatusAllowedBeforeReview.has(manifest.omni?.video_status)) fail(`${label}: Omni video_status must remain blocked_until_all_cuts_passed before cut-review approval`);
      }
      if (targetIndex >= provisionalVideoIndex) {
        const declaredOutput = typeof manifest.omni?.output === 'string' ? manifest.omni.output : '';
        const output = declaredOutput ? path.join(shotRoot, declaredOutput) : '';
        if (!declaredOutput || !declaredOutput.startsWith('omni/') || !hasVideoReference(declaredOutput) || !(await exists(output))) fail(`${label}: provisional-video-ready requires a declared Omni output video`);
        else probeVideo(output, `${label}: ${declaredOutput}`);
      }
    }
    const effectsRequired = manifest.effects_required === true;
    const effectDir = path.join(shotRoot, 'effects');
    let effectFiles = [];
    try { effectFiles = (await readdir(effectDir, {withFileTypes: true})).filter((entry) => entry.isFile() && isRealMedia(entry.name, new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.mp4', '.webm', '.mov', '.wav', '.mp3']))); } catch { /* effects are optional */ }
    if (effectsRequired && effectFiles.length === 0) fail(`${label}: effects_required=true requires a real local effects/ file`);
    if (effectsRequired && (manifest.effects ?? []).length === 0) fail(`${label}: effects_required=true requires manifest.effects records`);
    if (effectFiles.length > 0 && (manifest.effects ?? []).length === 0) fail(`${label}: every real effects/ file must have a manifest.effects record`);
    for (const [index, effect] of (manifest.effects ?? []).entries()) {
      if (typeof effect?.file !== 'string' || effect.file.includes('..')) { fail(`${label}: effects[${index}].file must be a safe local path`); continue; }
      const effectPath = path.join(shotRoot, effect.file);
      if (!(await exists(effectPath))) fail(`${label}: effects[${index}].file does not exist: ${effect.file}`);
      else await validateEffectFile(effectPath, `${label}: effects[${index}].file`);
    }
    if (!effectsRequired && effectFiles.length === 0) {
      try { await stat(effectDir); fail(`${label}: effects/ exists but contains no real effect file; omit it when effects_required=false`); } catch { /* no effects directory is valid */ }
    }
  }
}

async function requireCutReviewApproval() {
  if (activeManifests.length !== state.expected_cut_count) fail(`cut review requires exactly ${state.expected_cut_count} active manifests; found ${activeManifests.length}`);
  const allV3 = activeManifests.length > 0 && activeManifests.every(({manifest}) => manifest.schema_version === 3);
  if (allV3) {
    const currentRuntimeHash = await runtimeSha256(root);
    const generationRows = [];
    const playableRows = [];
    for (const {manifest, file, label} of activeManifests) {
      const input = manifest.approvals?.generation_input;
      if (manifest.runtime_contract?.runtime_sha256 !== currentRuntimeHash) fail(`${label}: approved runtime_contract.runtime_sha256 must match the current renderer/operator runtime`);
      if (input?.user_pass !== true || input.status !== 'passed' || !input.approval_marker || !/^[a-f0-9]{64}$/iu.test(input.approved_bundle_sha256 ?? '')) fail(`${label}: generation-input approval is required`);
      const artifact = manifest.review_requirements?.review_artifact;
      if (input?.user_pass === true && artifact) {
        const actual = await reviewBundleSha256({root, cutRoot: path.dirname(file), manifest, reviewArtifact: artifact});
        if (input.approved_bundle_sha256 !== actual || !input.approval_marker.includes(actual)) fail(`${label}: generation-input approval bundle changed (manifest/assets/runtime/review artifact)`);
        generationRows.push(`${label}|${actual}`);
      } else if (input?.user_pass === true) fail(`${label}: generation-input PASS requires an exact review artifact`);
      if (manifest.review_profile !== 'omni-keyframe-input') {
        const playable = manifest.approvals?.playable_cut;
        if (playable?.user_pass !== true || playable.status !== 'passed' || !playable.approval_marker || !/^[a-f0-9]{64}$/iu.test(playable.approved_bundle_sha256 ?? '')) fail(`${label}: playable-cut approval is required before Omni unlock`);
        if (playable?.user_pass === true && artifact) {
          const actual = await reviewBundleSha256({root, cutRoot: path.dirname(file), manifest, reviewArtifact: artifact});
          if (playable.approved_bundle_sha256 !== actual || !playable.approval_marker.includes(actual)) fail(`${label}: playable-cut approval bundle changed (manifest/assets/runtime/review artifact)`);
          playableRows.push(`${label}|${actual}`);
        }
      }
    }
    const generationHash = createHash('sha256').update(generationRows.sort().join('\n')).digest('hex');
    const playableHash = createHash('sha256').update(playableRows.sort().join('\n')).digest('hex');
    if (state.generation_input_review?.all_inputs_passed !== true || state.generation_input_review?.approved_bundle_sha256 !== generationHash || !String(state.generation_input_review?.approval_marker ?? '').includes(generationHash)) fail('episode generation_input_review must bind every generation-input bundle');
    if (state.playable_cut_review?.all_playable_cuts_passed !== true || state.playable_cut_review?.approved_bundle_sha256 !== playableHash || !String(state.playable_cut_review?.approval_marker ?? '').includes(playableHash)) fail('episode playable_cut_review must bind every pre-generation playable bundle');
    if (state.cut_review?.all_cuts_passed !== true || !cutReviewMarker || !cutReviewMarker.includes(generationHash) || !cutReviewMarker.includes(playableHash)) fail('cut_review marker must combine generation-input and playable-cut review hashes');
    return;
  }
  if (state.cut_review?.all_cuts_passed !== true || !cutReviewMarker) fail('cut review requires cut_review.all_cuts_passed=true and an episode-level cut_review.approval_marker');
  const notPassed = activeManifests.filter(({manifest}) => manifest.review?.user_pass !== true || !['passed', 'approved'].includes(manifest.review?.status));
  if (notPassed.length > 0) fail(`cut review requires user PASS on every active cut; ${notPassed.length}/${state.expected_cut_count} are not passed`);
  for (const {manifest, label} of activeManifests) if (manifest.review?.approval_marker !== cutReviewMarker) fail(`${label}: review.approval_marker must match episode cut_review.approval_marker`);
  for (const {manifest, file, label} of activeManifests) {
    const shotRoot = path.dirname(file);
    for (const [index, asset] of (manifest.assets ?? []).entries()) {
      if (typeof asset?.file !== 'string' || typeof asset?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(asset.sha256)) fail(`${label}: every passed asset ${index} must declare sha256`);
      else if (!(await exists(path.join(shotRoot, asset.file))) || asset.sha256 !== await sha256File(path.join(shotRoot, asset.file))) fail(`${label}: every passed asset ${index} sha256 must match the local file`);
    }
    for (const [index, keyframe] of (manifest.omni?.keyframes ?? []).entries()) {
      if (typeof keyframe?.file !== 'string' || typeof keyframe?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(keyframe.sha256)) fail(`${label}: every passed Omni keyframe ${index} must declare sha256`);
      else if (!(await exists(path.join(shotRoot, keyframe.file))) || keyframe.sha256 !== await sha256File(path.join(shotRoot, keyframe.file))) fail(`${label}: every passed Omni keyframe ${index} sha256 must match the local file`);
    }
    for (const [index, effect] of (manifest.effects ?? []).entries()) {
      if (typeof effect?.file !== 'string' || typeof effect?.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(effect.sha256)) fail(`${label}: every passed effect ${index} must declare sha256`);
      else if (!(await exists(path.join(shotRoot, effect.file))) || effect.sha256 !== await sha256File(path.join(shotRoot, effect.file))) fail(`${label}: every passed effect ${index} sha256 must match the local file`);
    }
  }
  const actualApprovedInputsHash = await approvedInputsHash();
  if (!/^[a-f0-9]{64}$/iu.test(state.cut_review?.approved_inputs_sha256 ?? '') || state.cut_review.approved_inputs_sha256 !== actualApprovedInputsHash) fail('cut review approved_inputs_sha256 must match the sorted actual asset/keyframe path+SHA set');
  if (!cutReviewMarker.includes(actualApprovedInputsHash)) fail('cut_review.approval_marker must include approved_inputs_sha256');
}

async function requireProvisionalVideo() {
  await requireCutReviewApproval();
  const allV3 = activeManifests.length > 0 && activeManifests.every(({manifest}) => manifest.schema_version === 3);
  if (allV3) {
    for (const {manifest, file, label} of activeManifests.filter(({manifest}) => manifest.production_mode === 'omni')) {
      if (manifest.review_profile !== 'omni-generated-motion') fail(`${label}: provisional assembly requires review_profile=omni-generated-motion after generation`);
      const playable = manifest.approvals?.playable_cut;
      const artifact = manifest.review_requirements?.review_artifact;
      if (playable?.user_pass !== true || playable.status !== 'passed' || !artifact) fail(`${label}: generated Omni motion requires a separate playable-cut PASS`);
      else {
        const actual = await reviewBundleSha256({root, cutRoot: path.dirname(file), manifest, reviewArtifact: artifact});
        if (playable.approved_bundle_sha256 !== actual || !String(playable.approval_marker).includes(actual)) fail(`${label}: generated Omni playable approval bundle changed`);
      }
    }
  }
  if (state.provisional_video?.status !== 'ready' || typeof state.provisional_video?.artifact !== 'string' || state.provisional_video.artifact.trim() === '') fail('provisional-video-ready requires provisional_video.status=ready and an artifact path');
  if (state.provisional_video?.approval_marker !== cutReviewMarker) fail('provisional-video-ready requires provisional_video.approval_marker to match cut_review.approval_marker');
  if (typeof state.provisional_video?.artifact === 'string') {
    const artifactPath = path.resolve(root, state.provisional_video.artifact);
    const artifactName = path.basename(artifactPath);
    if (bannedCompositionName.test(artifactName) || !/(provisional|animatic)/iu.test(artifactName)) fail(`provisional video artifact must be named provisional/animatic and cannot contain master/final/picturelocked: ${artifactName}`);
    if (!(await exists(artifactPath))) fail(`provisional video artifact does not exist: ${state.provisional_video.artifact}`);
    else {
      probeVideo(artifactPath, 'provisional video artifact');
      const actualHash = await sha256File(artifactPath);
      if (state.provisional_video?.artifact_sha256 !== actualHash) fail('provisional-video-ready requires provisional_video.artifact_sha256 to match the current artifact');
    }
  }
}

async function requireVisualReviewApproval() {
  if (state.visual_review?.user_approved !== true || typeof state.visual_review?.approval_marker !== 'string' || state.visual_review.approval_marker.trim() === '') fail('script lock requires full provisional-video visual_review.user_approved=true and a visual-review approval_marker');
  if (state.visual_review?.all_cuts_passed !== true) fail('visual review requires visual_review.all_cuts_passed=true after the full provisional video was reviewed');
  if (state.visual_review?.provisional_video_approval_marker !== state.provisional_video?.approval_marker) fail('visual review requires visual_review.provisional_video_approval_marker to match the provisional video marker');
  const artifact = typeof state.provisional_video?.artifact === 'string' ? path.resolve(root, state.provisional_video.artifact) : '';
  if (artifact && await exists(artifact)) {
    const actualHash = await sha256File(artifact);
    if (state.provisional_video?.artifact_sha256 !== actualHash) fail('visual review requires the provisional video artifact hash to remain unchanged');
    if (state.visual_review?.approved_artifact_sha256 !== actualHash) fail('visual review requires visual_review.approved_artifact_sha256 to match the approved artifact');
    if (!state.visual_review.approval_marker.includes(actualHash)) fail('visual review approval_marker must include the approved provisional video hash');
  }
}
async function requireScriptLock() {
  await requireVisualReviewApproval();
  if (state.final_script?.status !== 'locked' || typeof state.final_script?.locked_at !== 'string') fail('final-voice lock requires final_script.status=locked with locked_at');
  if (state.final_script?.user_visual_review_approval_marker !== state.visual_review?.approval_marker) fail('final-voice lock requires final_script.user_visual_review_approval_marker to match the visual-review approval marker');
}
async function requireMeasuredFinalAudio() {
  await requireScriptLock();
  if (activeManifests.length !== state.expected_cut_count) fail(`final-voice lock requires exactly ${state.expected_cut_count} readable active manifests; found ${activeManifests.length}`);
  if (state.final_voice?.status !== 'locked' || typeof state.final_voice?.locked_at !== 'string') fail('final-voice lock requires final_voice.status=locked with locked_at');
  if (state.final_voice?.all_cut_audio_measured !== true) fail('final-voice lock requires final_voice.all_cut_audio_measured=true');
  for (const {manifest, label} of activeManifests) {
    if (manifest.voiceover?.status !== 'final-measured' || typeof manifest.voiceover?.audio !== 'string' || manifest.voiceover.audio.trim() === '') fail(`${label}: every active cut requires voiceover.status=final-measured and a final audio file`);
  }
  const narrationScript = path.join(root, 'video', 'scripts', 'validate-narration-plan.mjs');
  const narrationArgs = [narrationScript, '--strict'];
  if (narrationTimingPlanPath) narrationArgs.push('--plan', narrationTimingPlanPath);
  if (audioDirArg) narrationArgs.push('--audio-dir', audioDirArg);
  const measured = spawnSync(process.execPath, narrationArgs, {cwd: root, encoding: 'utf8', windowsHide: true});
  let narrationReport = null;
  try { narrationReport = JSON.parse(measured.stdout); } catch { /* failures below retain the command output context */ }
  if (measured.status !== 0 || narrationReport?.measured_cut_count !== state.expected_cut_count || narrationReport?.failures?.length > 0) {
    fail(`final-voice lock requires strict narration measurement for all ${state.expected_cut_count} cuts${narrationReport ? ` (measured ${narrationReport.measured_cut_count}/${narrationReport.total_cut_count})` : ''}`);
  } else if (narrationTimingPlan) {
    for (const message of validateManifestTimingAuthority({manifests: activeManifests.map(({manifest}) => manifest), plan: narrationTimingPlan, measuredReport: narrationReport, finalVoice: true})) fail(message);
  }
}
async function requireStrictPictureInputs() {
  await requireMeasuredFinalAudio();
  if (activeManifests.length !== state.expected_cut_count) fail(`strict assembly requires ${state.expected_cut_count} readable active manifests`);
  for (const {manifest, label, file} of activeManifests) {
    if (manifest.status === 'rejected-provisional-visual' || manifest.active === false) fail(`${label}: rejected provisional manifest cannot enter strict assembly`);
    if (manifest.schema_version !== 3 || manifest.fps !== 30 || !Number.isInteger(manifest.duration_frames) || manifest.duration_frames <= 0) fail(`${label}: strict active assembly requires canonical schema v3, fps=30 and positive duration_frames`);
    for (const field of ['assets', 'animations', 'text_cues', 'effects', 'source_ids']) if (!Array.isArray(manifest[field])) fail(`${label}: strict assembly requires ${field} array`);
    for (const [index, asset] of (manifest.assets ?? []).entries()) {
      if (!nonBlank(asset?.media_type) || typeof asset.file !== 'string') { fail(`${label}: assets[${index}] requires a non-blank media_type`); continue; }
      const extension = path.extname(asset.file).toLowerCase();
      const matches = (asset.media_type.startsWith('image/') && ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(extension)) || (asset.media_type.startsWith('video/') && videoExtensions.has(extension));
      if (!matches) fail(`${label}: assets[${index}].media_type does not match file extension`);
      if (asset.media_type.startsWith('audio/')) fail(`${label}: audio is not a visual CutAsset; use a kind=sfx CutEffect`);
    }
    if (!manifest.voiceover || !Array.isArray(manifest.voiceover.word_cues)) fail(`${label}: strict assembly requires voiceover.word_cues array`);
    if (!manifest.lifecycle || !manifest.transition) fail(`${label}: strict assembly requires lifecycle and transition contracts`);
    if (!Array.isArray(manifest.source_materials) || manifest.source_materials.length === 0) fail(`${label}: strict assembly requires source_materials approval metadata`);
    for (const material of manifest.source_materials ?? []) if (!nonBlank(material?.source_id) || !nonBlank(material?.original_url) || !nonBlank(material?.rights_status) || material.approval_status !== 'approved') fail(`${label}: every source_material requires non-blank source_id, original_url, rights_status and approval_status=approved`);
    for (const asset of manifest.assets ?? []) if (hasText(asset?.file, 'placeholder') || hasText(asset?.role, 'placeholder') || hasText(asset?.status, 'placeholder')) fail(`${label}: placeholders are forbidden in strict assembly`);
    if (Array.isArray(manifest.missing_sources) && manifest.missing_sources.length > 0) fail(`${label}: strict assembly forbids missing planned sources`);
    if (manifest.provisional_placeholder === true) fail(`${label}: strict assembly forbids provisional placeholders`);
    if (manifest.production_mode === 'omni') {
      if (!manifest.ai_disclosure || !nonBlank(manifest.ai_disclosure.tool) || !nonBlank(manifest.ai_disclosure.generated_at) || !nonBlank(manifest.ai_disclosure.label) || !nonBlank(manifest.ai_disclosure.prompt)) fail(`${label}: strict Omni assembly requires non-blank ai_disclosure tool, generated_at, label and prompt provenance`);
      const output = typeof manifest.omni?.output === 'string' ? path.join(path.dirname(file), manifest.omni.output) : '';
      if (!output || !(await exists(output))) fail(`${label}: Omni cuts require the declared omni output video`);
      else probeVideo(output, `${label}: declared Omni output`);
    }
    for (const effect of manifest.effects ?? []) {
      const effectPath = typeof effect?.file === 'string' ? path.join(path.dirname(file), effect.file) : '';
      if (!nonBlank(effect?.source_id) || !nonBlank(effect?.original_url) || !nonBlank(effect?.rights_status) || effect.approval_status !== 'approved') fail(`${label}: strict effects require non-blank source_id, original_url, rights_status and approval_status=approved`);
      if (!effectPath || !(await exists(effectPath))) fail(`${label}: strict effect file is missing`);
      else if (effect.sha256 !== await sha256File(effectPath)) fail(`${label}: effect checksum does not match the local file`);
    }
    if (manifest.final_qc?.status !== 'approved' || !nonBlank(manifest.final_qc?.marker)) fail(`${label}: strict assembly requires final_qc.status=approved and a non-blank final_qc.marker`);
  }
}

await validateActiveCutInputs();
if (targetIndex >= stages.indexOf('cut-review-approved')) await requireCutReviewApproval();
if (targetIndex >= stages.indexOf('provisional-video-ready')) await requireProvisionalVideo();
if (targetIndex >= stages.indexOf('visual-review-approved')) await requireVisualReviewApproval();
if (targetIndex >= stages.indexOf('script-locked')) await requireScriptLock();
if (targetIndex >= stages.indexOf('final-voice-locked')) await requireMeasuredFinalAudio();
if (targetIndex >= stages.indexOf('audio-timed-assembly')) await requireStrictPictureInputs();
if (targetStage === 'picture-locked' && (state.picture_lock?.approved !== true || !nonBlank(state.picture_lock?.final_qc_marker))) fail('picture lock requires picture_lock.approved=true and a non-blank picture_lock.final_qc_marker');

const report = {
  ok: failures.length === 0,
  episode_id: state.episode_id,
  current_stage: currentStage,
  requested_lock: requestedLock ? targetStage : null,
  expected_cut_count: state.expected_cut_count,
  editorial_revision: episodeSpec?.editorial_revision?.id ?? null,
  status: sourceLedInactiveDraft ? 'blocked/non-production' : 'production-stage-validation',
  production_authority: sourceLedInactiveDraft ? false : (state.production_authority ?? null),
  active_cut_root: state.active_cut_root,
  active_manifest_count: activeManifests.length,
  active_cut_count: targetIndex >= stages.indexOf('cut-previews-ready') ? activeCuts.length : 0,
  rejected_cut_count: rejectedCutCount.value,
  style_calibration_cut_count: styleCalibrationCutCount.value,
  warnings,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
