import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';

export const FLOW_SITUATION_BOARD_SCHEMA = 'newsroom-flow-situation-board-v3';

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const ROLE_TAG = /^(?:CHAR|CAR|BG|PROP|FRAME)_[A-Z0-9_]{1,56}$/u;
const TAG = /@[A-Z][A-Z0-9_]{1,63}/gu;
const PATHISH = /(?:[a-z][a-z0-9+.-]{1,31}:\/\/|(?:^|[\s"'(])[a-z]:[\\/]|(?:^|[\s"'(])(?:\.\.?[\\/]))/iu;
export const FLOW_PROMPT_HEADER = 'Generate a single 10-second multi-shot video using the provided references.';
export const FLOW_MANNEQUIN_PRESERVATION = "All people appearing in every shot are realistic 3D ivory-toned mannequins with completely blank, featureless faces. Only faces and exposed skin use the ivory mannequin material. Preserve each character's exact clothing, clothing colors, accessories, body proportions, and seating shown in the corresponding reference image; do not remove, replace, recolor, or simplify the clothing.";
const CAMERA_MOVEMENTS = new Set(['locked-off', 'pan', 'tilt', 'tracking', 'push-in', 'pull-back', 'crane', 'arc', 'handheld', 'zoom']);
const REVIEW_CHECKS = ['composition', 'actors', 'vehicles', 'direction', 'seats', 'noExtraText', 'cameraCard', 'actionReadiness', 'adjacentContinuity'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashWithout = (value, field) => {
  const copy = structuredClone(value);
  delete copy[field];
  return sha256(Buffer.from(stableStringify(copy), 'utf8'));
};
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const lockedProduction = () => ({ provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false });
const pendingPostProduction = () => ({
  usableSourceWindows: { status: 'pending' },
  pictureRough: { status: 'pending' },
  reconciliation: { status: 'pending' },
  finalScriptConform: { status: 'pending' },
  finalOwnerNarration: { status: 'pending' },
  audioConform: { status: 'pending', maxIterations: 1 },
  finalAVQA: { status: 'pending' },
});
const closedSubmissionGate = ({ review = false, animatic = false, bundle = false } = {}) => ({ preGenerationReview: review, animaticApproved: animatic, handoffBundleVerified: bundle, sourceWindowsVerified: false, pictureRoughVerified: false, semanticReconciliationApproved: false, finalOwnerNarrationLocked: false, audioConformVerified: false, finalAVQAPassed: false, renderEligible: false, nativeBindingVerified: false, providerSource: false });

function boundedText(value, label, max = 12000, preserveWhitespace = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || PATHISH.test(value)) fail(`${label} must be bounded path-free text`);
  return preserveWhitespace ? value : value.trim();
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a relative path`);
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) fail(`${label} must be contained relative path`);
  return normalized;
}

function assertExactKeys(value, required, label) {
  if (!isObject(value) || Object.keys(value).length !== required.length || required.some((key) => !(key in value))) fail(`${label} must have the exact required fields`);
}

async function readPhysical(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await fs.lstat(absoluteRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail('asset root must be a physical directory');
  const relative = safeRelativePath(relativePath, `${label}.relativePath`);
  const resolved = path.resolve(absoluteRoot, relative);
  const prefix = `${absoluteRoot}${path.sep}`;
  if (resolved !== absoluteRoot && !resolved.startsWith(prefix)) fail(`${label} escapes asset root`);
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical nonsymlink file`);
  const real = await fs.realpath(resolved);
  const realRoot = await fs.realpath(absoluteRoot);
  if (real !== resolved || !real.startsWith(`${realRoot}${path.sep}`)) fail(`${label} must be an exact contained physical file`);
  const bytes = await fs.readFile(resolved);
  return { relativePath: relative, realpath: real, bytes: bytes.length, sha256: sha256(bytes) };
}

function validateReferences(references) {
  if (!Array.isArray(references) || references.length < 1 || references.length > 120) fail('one to one hundred twenty references are required');
  const ids = new Set();
  const tags = new Set();
  return references.map((item, index) => {
    if (!isObject(item) || !ID.test(String(item.assetId || ''))) fail(`references[${index}].assetId is invalid`);
    if (!ROLE_TAG.test(String(item.roleTag || ''))) fail(`references[${index}].roleTag is invalid`);
    if (ids.has(item.assetId)) fail(`duplicate reference assetId ${item.assetId}`);
    if (tags.has(item.roleTag)) fail(`duplicate reference roleTag ${item.roleTag}`);
    ids.add(item.assetId); tags.add(item.roleTag);
    const kind = String(item.kind || '');
    if (!['character', 'vehicle', 'background', 'prop', 'frame'].includes(kind)) fail(`references[${index}].kind is invalid`);
    const expectedKind = { CHAR: 'character', CAR: 'vehicle', BG: 'background', PROP: 'prop', FRAME: 'frame' }[String(item.roleTag).split('_')[0]];
    if (kind !== expectedKind) fail(`references[${index}] roleTag prefix and kind disagree`);
    return { assetId: item.assetId, roleTag: item.roleTag, kind, description: boundedText(item.description, `references[${index}].description`, 500), imageRelativePath: safeRelativePath(item.imageRelativePath, `references[${index}].imageRelativePath`) };
  });
}

function validateCameraCard(value, label, startState, endState) {
  if (!isObject(value)) fail(`${label} is required`);
  const required = ['size', 'angle', 'position', 'composition', 'movement', 'axis', 'screenDirection', 'seat', 'focus', 'startState', 'endState'];
  const unknown = Object.keys(value).filter((key) => !required.includes(key));
  if (unknown.length || required.some((key) => !(key in value))) fail(`${label} must contain only the complete canonical camera-card fields`);
  if (!isObject(value.movement) || Object.keys(value.movement).some((key) => !['type', 'direction'].includes(key)) || !('type' in value.movement) || !('direction' in value.movement)) fail(`${label}.movement must declare exactly one movement type and direction`);
  const movementType = String(value.movement.type || '');
  if (!CAMERA_MOVEMENTS.has(movementType)) fail(`${label}.movement.type is invalid`);
  const direction = boundedText(value.movement.direction, `${label}.movement.direction`, 160);
  if (movementType === 'locked-off' && direction !== 'none') fail(`${label}.movement.direction must be none for locked-off`);
  if (movementType !== 'locked-off' && direction === 'none') fail(`${label}.movement.direction is required for a moving camera`);
  const card = {
    size: boundedText(value.size, `${label}.size`, 120),
    angle: boundedText(value.angle, `${label}.angle`, 160),
    position: boundedText(value.position, `${label}.position`, 240),
    composition: boundedText(value.composition, `${label}.composition`, 500),
    movement: { type: movementType, direction },
    axis: boundedText(value.axis, `${label}.axis`, 300),
    screenDirection: boundedText(value.screenDirection, `${label}.screenDirection`, 300),
    seat: boundedText(value.seat, `${label}.seat`, 300),
    focus: boundedText(value.focus, `${label}.focus`, 300),
    startState: boundedText(value.startState, `${label}.startState`, 1000),
    endState: boundedText(value.endState, `${label}.endState`, 1000),
  };
  if (card.startState !== startState || card.endState !== endState) fail(`${label} startState/endState must exactly match the authored shot states`);
  return card;
}

function validateShot(shot, index, referenceMap) {
  if (!isObject(shot) || !ID.test(String(shot.shotId || ''))) fail(`shots[${index}].shotId is invalid`);
  if (!Array.isArray(shot.selectedRoleTags) || shot.selectedRoleTags.length < 1 || shot.selectedRoleTags.length > 12) fail(`shots[${index}].selectedRoleTags is required`);
  const selected = new Set();
  for (const tag of shot.selectedRoleTags) {
    if (!ROLE_TAG.test(String(tag)) || !referenceMap.has(tag)) fail(`shots[${index}] references missing role tag ${tag}`);
    if (selected.has(tag)) fail(`shots[${index}] repeats role tag ${tag}`);
    selected.add(tag);
  }
  const frameTags = [...selected].filter((tag) => tag.startsWith('FRAME_'));
  if (frameTags.length !== 1) fail(`${shot.shotId} must bind exactly one FRAME_* situation image`);
  if (shot.situationImageRoleTag !== frameTags[0]) fail(`${shot.shotId} situationImageRoleTag must match its selected FRAME_* tag`);
  const action = boundedText(shot.action, `shots[${index}].action`, 1800);
  if (shot.actionCount !== 1) fail(`${shot.shotId} must declare exactly one observable action`);
  if (!Number.isFinite(shot.narrationStartSeconds) || !Number.isFinite(shot.narrationEndSeconds) || shot.narrationStartSeconds < 0 || shot.narrationEndSeconds <= shot.narrationStartSeconds) fail(`${shot.shotId} narration timing is invalid`);
  const startState = boundedText(shot.startState, `shots[${index}].startState`, 1000);
  const endState = boundedText(shot.endState, `shots[${index}].endState`, 1000);
  return {
    shotId: shot.shotId,
    narrationText: boundedText(shot.narrationText, `shots[${index}].narrationText`, 1800),
    narrationStartSeconds: shot.narrationStartSeconds,
    narrationEndSeconds: shot.narrationEndSeconds,
    selectedRoleTags: [...selected],
    situationImageRoleTag: frameTags[0],
    startState,
    action,
    actionCount: 1,
    endState,
    cameraCard: validateCameraCard(shot.cameraCard, `shots[${index}].cameraCard`, startState, endState),
  };
}

function assertPromptTags(prompt, allowedTags, label) {
  const text = boundedText(prompt, label, 24000, true);
  for (const match of text.matchAll(TAG)) if (!allowedTags.has(match[0].slice(1))) fail(`${label} contains unselected role tag ${match[0]}`);
  return text;
}

function cameraCardText(card) {
  return `Camera: ${card.size}; ${card.angle}; position ${card.position}; composition ${card.composition}; movement ${card.movement.type} (${card.movement.direction}); axis ${card.axis}; screen direction ${card.screenDirection}; seat ${card.seat}; focus ${card.focus}`;
}

function compilePrompt({ sequence, globalStyle, referenceMap }) {
  const shots = sequence.map((shot, index) => {
    const ref = referenceMap.get(shot.situationImageRoleTag);
    if (!/[가-힣]/u.test(ref.description)) fail(`${shot.shotId} frame description must be Korean for the Flow reference suffix`);
    return `[Shot ${index + 1}] ${cameraCardText(shot.cameraCard)}. Start state: ${shot.startState}. One observable action: ${shot.action}. End state: ${shot.endState}. [참조 이미지: ${path.basename(ref.file.relativePath)} - ${ref.description}]`;
  }).join('\n\n');
  return `${FLOW_PROMPT_HEADER}\n${FLOW_MANNEQUIN_PRESERVATION}\n\n${shots}`;
}

function validateFactSpine(value, scriptText) {
  assertExactKeys(value, ['schema', 'authorityId', 'authoritySha256', 'units', 'sha256'], 'factSpine');
  if (value.schema !== 'newsroom-fact-spine-v1' || !ID.test(String(value.authorityId || '')) || !SHA256.test(String(value.authoritySha256 || '')) || !Array.isArray(value.units) || value.units.length < 1) fail('factSpine authority and units are required');
  let cursor = -1;
  const unitIds = new Set();
  const units = value.units.map((unit, index) => {
    assertExactKeys(unit, ['unitId', 'order', 'exactText', 'claimIds'], `factSpine.units[${index}]`);
    if (!ID.test(String(unit.unitId || '')) || unitIds.has(unit.unitId) || unit.order !== index + 1 || !Array.isArray(unit.claimIds) || unit.claimIds.length < 1 || new Set(unit.claimIds).size !== unit.claimIds.length || unit.claimIds.some((id) => !ID.test(String(id)))) fail(`factSpine.units[${index}] is invalid`);
    unitIds.add(unit.unitId);
    const exactText = boundedText(unit.exactText, `factSpine.units[${index}].exactText`, 3000, true);
    const found = scriptText.indexOf(exactText, cursor + 1);
    if (found < 0) fail(`factSpine.units[${index}] must occur in script order`);
    cursor = found + exactText.length - 1;
    return { unitId: unit.unitId, order: unit.order, exactText, claimIds: [...unit.claimIds] };
  });
  const spine = { schema: value.schema, authorityId: value.authorityId, authoritySha256: value.authoritySha256, units };
  if (value.sha256 !== sha256(Buffer.from(stableStringify(spine), 'utf8'))) fail('factSpine.sha256 is stale');
  return { ...spine, sha256: value.sha256 };
}

const quantile = (sorted, fraction) => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position); const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

function validateTimingModel(value) {
  assertExactKeys(value, ['schema', 'ownerProfileId', 'settingsSha256', 'recordings', 'rateDistribution', 'sha256'], 'timingModel');
  if (value.schema !== 'newsroom-owner-speech-timing-model-v1' || !ID.test(String(value.ownerProfileId || '')) || !SHA256.test(String(value.settingsSha256 || '')) || !Array.isArray(value.recordings) || value.recordings.length < 2) fail('timingModel requires at least two approved historical owner recordings');
  const rates = [];
  const recordingIds = new Set();
  const recordings = value.recordings.map((recording, index) => {
    assertExactKeys(recording, ['recordingId', 'storyLabel', 'ownerProfileId', 'settingsSha256', 'audioSha256', 'approved', 'sentenceRates'], `timingModel.recordings[${index}]`);
    if (!ID.test(String(recording.recordingId || '')) || recordingIds.has(recording.recordingId) || !boundedText(recording.storyLabel, `timingModel.recordings[${index}].storyLabel`, 160) || recording.ownerProfileId !== value.ownerProfileId || recording.settingsSha256 !== value.settingsSha256 || !SHA256.test(String(recording.audioSha256 || '')) || recording.approved !== true || !Array.isArray(recording.sentenceRates) || recording.sentenceRates.length < 1 || recording.sentenceRates.some((rate) => !Number.isFinite(rate) || rate <= 0)) fail(`timingModel.recordings[${index}] is invalid or from a different owner/profile/settings tuple`);
    recordingIds.add(recording.recordingId); rates.push(...recording.sentenceRates);
    return { ...recording, sentenceRates: [...recording.sentenceRates] };
  });
  assertExactKeys(value.rateDistribution, ['unit', 'sampleCount', 'min', 'p50', 'p90', 'max'], 'timingModel.rateDistribution');
  const sorted = [...rates].sort((a, b) => a - b);
  const expected = { unit: 'non-whitespace-characters-per-second', sampleCount: sorted.length, min: sorted[0], p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), max: sorted.at(-1) };
  if (Object.keys(expected).some((key) => typeof expected[key] === 'number' ? Math.abs(value.rateDistribution[key] - expected[key]) > 1e-9 : value.rateDistribution[key] !== expected[key])) fail('timingModel.rateDistribution is stale');
  const model = { schema: value.schema, ownerProfileId: value.ownerProfileId, settingsSha256: value.settingsSha256, recordings, rateDistribution: expected };
  if (value.sha256 !== sha256(Buffer.from(stableStringify(model), 'utf8'))) fail('timingModel.sha256 is stale');
  return { ...model, sha256: value.sha256 };
}

function validateTimingDraft(value, factSpine, timingModel) {
  assertExactKeys(value, ['schema', 'provisional', 'factSpineSha256', 'timingModelSha256', 'segments', 'sha256'], 'timingDraft');
  if (value.schema !== 'newsroom-fact-preserving-timing-draft-v1' || value.provisional !== true || value.factSpineSha256 !== factSpine.sha256 || value.timingModelSha256 !== timingModel.sha256 || !Array.isArray(value.segments) || value.segments.length !== factSpine.units.length) fail('timingDraft authority is invalid');
  let priorEnd = 0;
  const segments = value.segments.map((segment, index) => {
    assertExactKeys(segment, ['unitId', 'order', 'startSeconds', 'endSeconds', 'estimatedRate'], `timingDraft.segments[${index}]`);
    if (segment.unitId !== factSpine.units[index].unitId || segment.order !== index + 1 || !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds) || segment.startSeconds < priorEnd || segment.endSeconds <= segment.startSeconds || !Number.isFinite(segment.estimatedRate) || segment.estimatedRate <= 0) fail(`timingDraft.segments[${index}] is invalid`);
    priorEnd = segment.endSeconds;
    return { ...segment };
  });
  const draft = { schema: value.schema, provisional: true, factSpineSha256: factSpine.sha256, timingModelSha256: timingModel.sha256, segments };
  if (value.sha256 !== sha256(Buffer.from(stableStringify(draft), 'utf8'))) fail('timingDraft.sha256 is stale');
  return { ...draft, sha256: value.sha256 };
}

function frozenPromptContract(transportBatches) {
  const exact = { schema: 'newsroom-flow-prompt-freeze-v1', header: FLOW_PROMPT_HEADER, mannequinPreservation: FLOW_MANNEQUIN_PRESERVATION, referenceSuffixSyntax: '[참조 이미지: filename - Korean description]', batches: transportBatches.map(({ batchId, prompt, promptSha256 }) => ({ batchId, exactPrompt: prompt, promptSha256 })) };
  return { ...exact, sha256: sha256(Buffer.from(stableStringify(exact), 'utf8')) };
}

function validateTransportBatches(batches, shots) {
  if (!Array.isArray(batches) || batches.length < 1) fail('transportBatches must explicitly cover every shot in ordered three-shot groups');
  const authored = shots.map((shot) => shot.shotId);
  const flattened = [];
  const ids = new Set();
  const normalized = batches.map((batch, index) => {
    if (!isObject(batch) || !ID.test(String(batch.batchId || '')) || ids.has(batch.batchId)) fail(`transportBatches[${index}].batchId is invalid or duplicated`);
    ids.add(batch.batchId);
    if (!Array.isArray(batch.shotIds) || batch.shotIds.length !== 3) fail(`${batch.batchId} must contain exactly three shots for the standard Flow 10s transport`);
    for (const shotId of batch.shotIds) {
      if (!authored.includes(shotId) || flattened.includes(shotId)) fail(`${batch.batchId} contains duplicate or unknown shotId ${shotId}`);
      flattened.push(shotId);
    }
    if (batch.shotDurationsSeconds !== undefined && stableStringify(batch.shotDurationsSeconds) !== stableStringify([3, 3, 4])) fail(`${batch.batchId} must allocate 3/3/4 seconds`);
    return { batchId: batch.batchId, shotIds: [...batch.shotIds], shotDurationsSeconds: [3, 3, 4] };
  });
  if (stableStringify(flattened) !== stableStringify(authored)) fail('transportBatches must preserve authored shot order and cover every shot exactly once');
  return normalized;
}

const requiredBundleLayout = (shotCount, batchCount) => ({
  schema: 'newsroom-flow-handoff-bundle-layout-v1',
  requiredRootFiles: ['README.md', 'SHA256SUMS.json'],
  requiredDirectories: ['shot-images', 'flow-prompts-and-shot-plan', 'flow-prompts-and-shot-plan/flow-ready-batches', 'infinite-canvas', 'base-reference-assets', 'base-reference-assets/people', 'base-reference-assets/vehicles', 'base-reference-assets/props', 'base-reference-assets/backgrounds', 'base-reference-assets/generation-records', 'manifests-and-verification'],
  shotImagesExactPlanCount: shotCount,
  flowReadyBatchExactPlanCount: batchCount,
  combinedExtensions: ['.txt', '.json', '.md'],
  referenceAssetUsageProvenanceRequired: true,
  historicalSourcesPolicy: 'immutable-verified-copy-only',
});

async function assertPhysicalDirectory(root, relativePath, label) {
  const resolved = path.resolve(root, safeRelativePath(relativePath, label));
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) fail(`${label} escapes bundle root`);
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a physical directory`);
  if (await fs.realpath(resolved) !== resolved) fail(`${label} must not traverse symlinks`);
  return resolved;
}

async function listPhysicalFiles(root, relativePath = '') {
  const directory = relativePath ? await assertPhysicalDirectory(root, relativePath, relativePath) : path.resolve(root);
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail(`handoff bundle contains symlink ${entry.name}`);
    const child = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listPhysicalFiles(root, child));
    else if (entry.isFile()) files.push(child.replaceAll('\\', '/'));
    else fail(`handoff bundle contains non-file entry ${child}`);
  }
  return files;
}

async function readJsonPhysical(root, relativePath, label) {
  const file = await readPhysical(root, relativePath, label);
  try { return { file, value: JSON.parse((await fs.readFile(path.resolve(root, file.relativePath))).toString('utf8').replace(/^\uFEFF/u, '')) }; }
  catch (error) { fail(`${label} must be valid JSON: ${error.message}`); }
}

const evidence = (file) => ({ relativePath: file.relativePath, realpath: file.realpath, bytes: file.bytes, sha256: file.sha256 });

async function validateHandoffBundle({ packet, bundleRoot, manifestRelativePath }) {
  const root = path.resolve(bundleRoot);
  const rootStat = await fs.lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink() || await fs.realpath(root) !== root) fail('handoff bundle root must be a physical nonsymlink directory');
  const layout = requiredBundleLayout(packet.shots.length, packet.transportBatches.length);
  for (const directory of layout.requiredDirectories) await assertPhysicalDirectory(root, directory, `handoff.${directory}`);
  const readme = await readPhysical(root, 'README.md', 'handoff.README');
  const checksum = await readJsonPhysical(root, 'SHA256SUMS.json', 'handoff.SHA256SUMS');
  const manifestPath = safeRelativePath(manifestRelativePath, 'handoff.manifestRelativePath');
  if (!manifestPath.startsWith('manifests-and-verification/')) fail('handoff manifest must be under manifests-and-verification');
  const manifest = await readJsonPhysical(root, manifestPath, 'handoff.manifest');
  const value = manifest.value;
  assertExactKeys(value, ['schema', 'verifiedCopy', 'historicalSourcesImmutable', 'shotImages', 'combinedFiles', 'flowReadyBatches', 'infiniteCanvasFiles', 'baseReferenceManifest', 'referenceAssets', 'generationRecords', 'verificationFiles'], 'handoff manifest');
  if (value.schema !== 'newsroom-flow-handoff-bundle-manifest-v1' || value.verifiedCopy !== true || value.historicalSourcesImmutable !== true) fail('handoff manifest copy policy is invalid');

  if (!Array.isArray(value.shotImages) || value.shotImages.length !== packet.shots.length) fail('shot-images count must equal the plan shot count');
  const directShotFiles = (await fs.readdir(path.join(root, 'shot-images'), { withFileTypes: true })).filter((item) => item.isFile()).map((item) => `shot-images/${item.name}`).sort();
  const shotEvidence = [];
  for (const [index, item] of value.shotImages.entries()) {
    assertExactKeys(item, ['shotId', 'path'], `handoff.shotImages[${index}]`);
    const shot = packet.shots[index];
    if (item.shotId !== shot.shotId || path.posix.dirname(item.path) !== 'shot-images' || path.posix.basename(item.path) !== path.posix.basename(shot.situationFrame.imageRelativePath)) fail(`handoff shot image does not match authored shot ${shot.shotId}`);
    const file = await readPhysical(root, item.path, `handoff.shotImages[${index}]`);
    if (file.sha256 !== shot.situationFrame.sha256 || file.bytes !== shot.situationFrame.bytes) fail(`handoff shot image bytes differ for ${shot.shotId}`);
    shotEvidence.push({ shotId: shot.shotId, ...evidence(file) });
  }
  if (stableStringify(directShotFiles) !== stableStringify(shotEvidence.map((item) => item.relativePath).sort())) fail('shot-images must contain exactly the active plan images');

  assertExactKeys(value.combinedFiles, ['text', 'json', 'markdown'], 'handoff.combinedFiles');
  const combined = {};
  for (const [key, extension] of [['text', '.txt'], ['json', '.json'], ['markdown', '.md']]) {
    const relative = safeRelativePath(value.combinedFiles[key], `handoff.combinedFiles.${key}`);
    if (path.posix.dirname(relative) !== 'flow-prompts-and-shot-plan' || path.posix.extname(relative) !== extension) fail(`handoff combined ${key} path is invalid`);
    const file = await readPhysical(root, relative, `handoff.combinedFiles.${key}`);
    if (key === 'json') await readJsonPhysical(root, relative, `handoff.combinedFiles.${key}`);
    if (key === 'text') {
      const textValue = await fs.readFile(path.join(root, relative), 'utf8');
      for (const batch of packet.transportBatches) if (!textValue.includes(batch.prompt)) fail(`combined text omits exact prompt for ${batch.batchId}`);
    }
    combined[key] = evidence(file);
  }

  if (!Array.isArray(value.flowReadyBatches) || value.flowReadyBatches.length !== packet.transportBatches.length) fail('flow-ready batch count must equal the plan batch count');
  const batchEvidence = [];
  for (const [index, item] of value.flowReadyBatches.entries()) {
    assertExactKeys(item, ['batchId', 'path'], `handoff.flowReadyBatches[${index}]`);
    const batch = packet.transportBatches[index];
    const expectedPath = `flow-prompts-and-shot-plan/flow-ready-batches/B${index + 1}.txt`;
    if (item.batchId !== batch.batchId || item.path !== expectedPath) fail(`handoff batch order/path is invalid for ${batch.batchId}`);
    const file = await readPhysical(root, item.path, `handoff.flowReadyBatches[${index}]`);
    if ((await fs.readFile(path.join(root, item.path), 'utf8')) !== batch.prompt) fail(`handoff batch prompt bytes differ for ${batch.batchId}`);
    batchEvidence.push({ batchId: batch.batchId, ...evidence(file) });
  }
  const directBatchFiles = (await fs.readdir(path.join(root, 'flow-prompts-and-shot-plan', 'flow-ready-batches'), { withFileTypes: true })).filter((item) => item.isFile()).map((item) => `flow-prompts-and-shot-plan/flow-ready-batches/${item.name}`).sort();
  if (stableStringify(directBatchFiles) !== stableStringify(batchEvidence.map((item) => item.relativePath).sort())) fail('flow-ready-batches must contain exactly B1..Bn prompts');

  if (!Array.isArray(value.infiniteCanvasFiles) || value.infiniteCanvasFiles.length < 1) fail('at least one infinite-canvas file is required');
  const canvasFiles = [];
  for (const [index, relative] of value.infiniteCanvasFiles.entries()) {
    if (path.posix.dirname(relative) !== 'infinite-canvas') fail(`handoff.infiniteCanvasFiles[${index}] is outside infinite-canvas`);
    canvasFiles.push(evidence(await readPhysical(root, relative, `handoff.infiniteCanvasFiles[${index}]`)));
  }

  const baseManifestPath = safeRelativePath(value.baseReferenceManifest, 'handoff.baseReferenceManifest');
  if (path.posix.dirname(baseManifestPath) !== 'base-reference-assets' || path.posix.extname(baseManifestPath) !== '.json') fail('base reference manifest path is invalid');
  const baseManifest = await readJsonPhysical(root, baseManifestPath, 'handoff.baseReferenceManifest');
  const selectedTags = new Set(packet.shots.flatMap((shot) => shot.selectedRoleTags));
  const packetBaseRefs = packet.references.filter((ref) => ref.kind !== 'frame');
  if (!Array.isArray(value.referenceAssets) || value.referenceAssets.length < packetBaseRefs.length) fail('reference asset manifest must cover every base reference');
  const assetIds = new Set(); const roleTags = new Set(); const assetEvidence = [];
  for (const [index, item] of value.referenceAssets.entries()) {
    assertExactKeys(item, ['assetId', 'roleTag', 'kind', 'usage', 'provenance', 'path'], `handoff.referenceAssets[${index}]`);
    if (!ID.test(String(item.assetId)) || !ROLE_TAG.test(String(item.roleTag)) || item.kind === 'frame' || !['character', 'vehicle', 'background', 'prop'].includes(item.kind) || !['used', 'unused'].includes(item.usage) || assetIds.has(item.assetId) || roleTags.has(item.roleTag)) fail(`handoff.referenceAssets[${index}] identity is invalid`);
    assetIds.add(item.assetId); roleTags.add(item.roleTag);
    const category = { character: 'people', vehicle: 'vehicles', prop: 'props', background: 'backgrounds' }[item.kind];
    if (path.posix.dirname(item.path) !== `base-reference-assets/${category}`) fail(`handoff.referenceAssets[${index}] directory is invalid`);
    const provenance = boundedText(item.provenance, `handoff.referenceAssets[${index}].provenance`, 1000);
    const file = await readPhysical(root, item.path, `handoff.referenceAssets[${index}]`);
    const prior = packetBaseRefs.find((ref) => ref.assetId === item.assetId && ref.roleTag === item.roleTag && ref.kind === item.kind);
    if (prior && (file.sha256 !== prior.sha256 || file.bytes !== prior.bytes)) fail(`handoff reference copy differs for ${item.assetId}`);
    if (prior && item.usage !== (selectedTags.has(item.roleTag) ? 'used' : 'unused')) fail(`handoff reference usage is wrong for ${item.assetId}`);
    if (!prior && item.usage !== 'unused') fail(`unbound reference ${item.assetId} must be marked unused`);
    assetEvidence.push({ assetId: item.assetId, roleTag: item.roleTag, kind: item.kind, usage: item.usage, provenance, ...evidence(file) });
  }
  for (const ref of packetBaseRefs) if (!assetEvidence.some((item) => item.assetId === ref.assetId && item.roleTag === ref.roleTag)) fail(`handoff reference manifest omits ${ref.assetId}`);

  const readPathList = async (items, prefix, label) => {
    if (!Array.isArray(items) || items.length < 1) fail(`${label} requires at least one file`);
    const output = [];
    for (const [index, relative] of items.entries()) {
      if (!String(relative).startsWith(`${prefix}/`)) fail(`${label}[${index}] is outside ${prefix}`);
      output.push(evidence(await readPhysical(root, relative, `${label}[${index}]`)));
    }
    return output;
  };
  const generationRecords = await readPathList(value.generationRecords, 'base-reference-assets/generation-records', 'handoff.generationRecords');
  const verificationFiles = await readPathList(value.verificationFiles, 'manifests-and-verification', 'handoff.verificationFiles');
  if (!verificationFiles.some((item) => item.relativePath === manifestPath)) fail('verificationFiles must include the handoff manifest');

  if (!isObject(checksum.value) || !Array.isArray(checksum.value.files) || checksum.value.fileCount !== checksum.value.files.length) fail('SHA256SUMS.json shape is invalid');
  const actualFiles = (await listPhysicalFiles(root)).filter((relative) => relative !== 'SHA256SUMS.json').sort();
  const checksumPaths = [];
  for (const [index, item] of checksum.value.files.entries()) {
    if (!isObject(item) || typeof item.path !== 'string' || !Number.isInteger(item.bytes) || !SHA256.test(String(item.sha256 || ''))) fail(`SHA256SUMS.files[${index}] is invalid`);
    const file = await readPhysical(root, item.path, `SHA256SUMS.files[${index}]`);
    if (file.bytes !== item.bytes || file.sha256 !== item.sha256) fail(`SHA256SUMS drift for ${item.path}`);
    checksumPaths.push(file.relativePath);
  }
  if (stableStringify([...new Set(checksumPaths)].sort()) !== stableStringify(actualFiles)) fail('SHA256SUMS.json must cover every bundle file except itself exactly once');

  return {
    status: 'verified', schema: 'newsroom-flow-handoff-bundle-verification-v1', verifiedCopy: true, historicalSourcesImmutable: true,
    rootRealpath: root, manifest: evidence(manifest.file), shotCount: packet.shots.length, batchCount: packet.transportBatches.length,
    requiredLayout: layout, readme: evidence(readme), shotImages: shotEvidence, combinedFiles: combined, flowReadyBatches: batchEvidence,
    infiniteCanvasFiles: canvasFiles, baseReferenceManifest: evidence(baseManifest.file), referenceAssets: assetEvidence,
    generationRecords, verificationFiles, checksumManifest: evidence(checksum.file), checksummedFileCount: actualFiles.length,
  };
}

function sequenceSignature({ shots, exactScriptText, globalStyle, physicalReferences, factSpineSha256, timingModelSha256, timingDraftSha256 }) {
  return sha256(Buffer.from(stableStringify({
    script: exactScriptText,
    globalStyle,
    factSpineSha256,
    timingModelSha256,
    timingDraftSha256,
    references: physicalReferences.map((ref) => ({ ordinal: ref.ordinal, assetId: ref.assetId, roleTag: ref.roleTag, kind: ref.kind, description: ref.description, imageRelativePath: ref.file.relativePath, realpath: ref.file.realpath, bytes: ref.file.bytes, sha256: ref.file.sha256 })),
    shots: shots.map((shot) => ({ shotId: shot.shotId, narrationText: shot.narrationText, narrationStartSeconds: shot.narrationStartSeconds, narrationEndSeconds: shot.narrationEndSeconds, action: shot.action, startState: shot.startState, endState: shot.endState, cameraCard: shot.cameraCard, situationImageRoleTag: shot.situationImageRoleTag })),
  }), 'utf8'));
}

function resetForInvalidation(packet, reason, changedRoleTags = []) {
  const next = structuredClone(packet);
  next.status = 'test-only / semantic-design-review-required';
  next.review = { status: 'pending', requiredChecks: packet.review.requiredChecks };
  next.animatic = { status: 'pending', requiredBeforeFlow: true };
  next.handoffBundle = { status: 'pending', requiredLayout: requiredBundleLayout(next.shots.length, next.transportBatches.length) };
  next.postProduction = pendingPostProduction();
  next.submissionGate = closedSubmissionGate();
  next.importInvalidation = { invalidated: true, reason, changedRoleTags: [...changedRoleTags] };
  next.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(next, 'integrity') };
  return next;
}

function validateCompletedPostProduction(packet, value) {
  assertExactKeys(value, ['usableSourceWindows', 'pictureRough', 'reconciliation', 'finalScriptConform', 'finalOwnerNarration', 'audioConform', 'finalAVQA'], 'postProduction');
  const windows = value.usableSourceWindows;
  assertExactKeys(windows, ['schema', 'status', 'promptFreezeSha256', 'allProviderVideosDownloaded', 'allProviderBytesPreserved', 'windows', 'sha256'], 'usableSourceWindows');
  if (windows.schema !== 'newsroom-usable-source-windows-v1' || windows.status !== 'approved' || windows.promptFreezeSha256 !== packet.promptFreeze.sha256 || windows.allProviderVideosDownloaded !== true || windows.allProviderBytesPreserved !== true || !Array.isArray(windows.windows) || windows.windows.length !== packet.shots.length) fail('usable source windows require every provider video to be downloaded and preserved before QA');
  const seenShots = new Set();
  for (const [index, item] of windows.windows.entries()) {
    assertExactKeys(item, ['shotId', 'batchId', 'sourceSha256', 'inSeconds', 'outSeconds', 'semanticQAPass', 'continuous', 'noReversal'], `usableSourceWindows.windows[${index}]`);
    const batch = packet.transportBatches.find((candidate) => candidate.batchId === item.batchId && candidate.shotIds.includes(item.shotId));
    if (!batch || seenShots.has(item.shotId) || !SHA256.test(String(item.sourceSha256 || '')) || !Number.isFinite(item.inSeconds) || !Number.isFinite(item.outSeconds) || item.inSeconds < 0 || item.outSeconds <= item.inSeconds || item.semanticQAPass !== true || item.continuous !== true || item.noReversal !== true) fail(`usable source window is invalid for ${item.shotId}`);
    seenShots.add(item.shotId);
  }
  if (!SHA256.test(String(windows.sha256 || ''))) fail('usableSourceWindows.sha256 is required');

  const rough = value.pictureRough;
  assertExactKeys(rough, ['schema', 'status', 'sha256', 'durationSeconds', 'sourceWindowsSha256', 'sequenceSignature'], 'pictureRough');
  if (rough.schema !== 'newsroom-opencut-picture-rough-v1' || rough.status !== 'approved' || !SHA256.test(String(rough.sha256 || '')) || !Number.isFinite(rough.durationSeconds) || rough.durationSeconds <= 0 || rough.sourceWindowsSha256 !== windows.sha256 || rough.sequenceSignature !== packet.sequenceSignature) fail('approved OpenCut picture rough is stale or invalid');

  const reconciliation = value.reconciliation;
  assertExactKeys(reconciliation, ['schema', 'status', 'factSpineSha256', 'pictureRoughSha256', 'units', 'sha256'], 'reconciliation');
  if (reconciliation.schema !== 'newsroom-semantic-reconciliation-v1' || reconciliation.status !== 'approved' || reconciliation.factSpineSha256 !== packet.factSpine.sha256 || reconciliation.pictureRoughSha256 !== rough.sha256 || !Array.isArray(reconciliation.units) || reconciliation.units.length !== packet.factSpine.units.length || !SHA256.test(String(reconciliation.sha256 || ''))) fail('semantic reconciliation is stale or incomplete');
  reconciliation.units.forEach((item, index) => {
    assertExactKeys(item, ['unitId', 'order', 'disposition', 'note'], `reconciliation.units[${index}]`);
    if (item.unitId !== packet.factSpine.units[index].unitId || item.order !== index + 1 || !['reshoot', 'trim', 'visual-bridge', 'script-expression-conform'].includes(item.disposition)) fail(`reconciliation.units[${index}] is invalid`);
    boundedText(item.note, `reconciliation.units[${index}].note`, 1000);
  });

  const script = value.finalScriptConform;
  assertExactKeys(script, ['schema', 'status', 'exactText', 'sha256', 'factSpineSha256', 'factSpinePreserved', 'legalClaimsUnchanged', 'allowedChanges', 'units', 'reviewerId', 'reviewSha256'], 'finalScriptConform');
  if (script.schema !== 'newsroom-final-script-expression-conform-v1' || script.status !== 'approved' || script.factSpineSha256 !== packet.factSpine.sha256 || script.factSpinePreserved !== true || script.legalClaimsUnchanged !== true || stableStringify(script.allowedChanges) !== stableStringify(['connectives', 'duplication', 'expression']) || !SHA256.test(String(script.reviewSha256 || '')) || !Array.isArray(script.units) || script.units.length !== packet.factSpine.units.length) fail('final script conform may change only connectives, duplication, and expression');
  const finalText = boundedText(script.exactText, 'finalScriptConform.exactText', 30000, true);
  if (script.sha256 !== sha256(Buffer.from(finalText, 'utf8'))) fail('finalScriptConform.sha256 is stale');
  let finalCursor = -1;
  script.units.forEach((item, index) => {
    assertExactKeys(item, ['unitId', 'order', 'sourceExactText', 'finalExactText', 'claimIds'], `finalScriptConform.units[${index}]`);
    const authority = packet.factSpine.units[index];
    if (item.unitId !== authority.unitId || item.order !== index + 1 || item.sourceExactText !== authority.exactText || stableStringify(item.claimIds) !== stableStringify(authority.claimIds)) fail(`finalScriptConform.units[${index}] breaks fact-spine lineage`);
    const conformed = boundedText(item.finalExactText, `finalScriptConform.units[${index}].finalExactText`, 3000, true);
    const found = finalText.indexOf(conformed, finalCursor + 1);
    if (found < 0) fail(`finalScriptConform.units[${index}] does not occur in final script order`);
    finalCursor = found + conformed.length - 1;
  });
  boundedText(script.reviewerId, 'finalScriptConform.reviewerId', 120);

  const narration = value.finalOwnerNarration;
  assertExactKeys(narration, ['schema', 'status', 'ownerProfileId', 'settingsSha256', 'scriptSha256', 'audioSha256', 'durationSeconds', 'approvalSha256'], 'finalOwnerNarration');
  if (narration.schema !== 'newsroom-final-owner-narration-v1' || narration.status !== 'accepted-locked' || narration.ownerProfileId !== packet.timingModel.ownerProfileId || narration.settingsSha256 !== packet.timingModel.settingsSha256 || narration.scriptSha256 !== script.sha256 || !SHA256.test(String(narration.audioSha256 || '')) || !SHA256.test(String(narration.approvalSha256 || '')) || !Number.isFinite(narration.durationSeconds) || narration.durationSeconds <= 0) fail('final owner narration is not accepted and locked to the conformed script');

  const audio = value.audioConform;
  assertExactKeys(audio, ['schema', 'status', 'iteration', 'maxIterations', 'timeScale', 'inputNarrationSha256', 'pictureRoughSha256', 'outputAudioSha256', 'durationSeconds'], 'audioConform');
  if (audio.schema !== 'newsroom-one-bounded-audio-conform-v1' || audio.status !== 'approved' || audio.iteration !== 1 || audio.maxIterations !== 1 || !Number.isFinite(audio.timeScale) || audio.timeScale < 0.95 || audio.timeScale > 1.05 || audio.inputNarrationSha256 !== narration.audioSha256 || audio.pictureRoughSha256 !== rough.sha256 || !SHA256.test(String(audio.outputAudioSha256 || '')) || !Number.isFinite(audio.durationSeconds) || Math.abs(audio.durationSeconds - rough.durationSeconds) > 0.05) fail('audio conform must be the single bounded conform to the approved picture rough');

  const qa = value.finalAVQA;
  assertExactKeys(qa, ['schema', 'status', 'factSpineSha256', 'finalScriptSha256', 'finalAudioSha256', 'pictureRoughSha256', 'titleSha256', 'captionsSha256', 'bgmSha256', 'checks', 'reviewerId', 'qaSha256'], 'finalAVQA');
  const requiredChecks = ['factSpine', 'legalClaims', 'semanticCoverage', 'avSync', 'captions', 'title', 'bgm', 'providerAudioRemoved'];
  if (qa.schema !== 'newsroom-final-factual-av-qa-v1' || qa.status !== 'pass' || qa.factSpineSha256 !== packet.factSpine.sha256 || qa.finalScriptSha256 !== script.sha256 || qa.finalAudioSha256 !== audio.outputAudioSha256 || qa.pictureRoughSha256 !== rough.sha256 || ![qa.titleSha256, qa.captionsSha256, qa.bgmSha256, qa.qaSha256].every((item) => SHA256.test(String(item || ''))) || !isObject(qa.checks) || Object.keys(qa.checks).length !== requiredChecks.length || requiredChecks.some((key) => qa.checks[key] !== true)) fail('final factual AV QA is incomplete or stale');
  boundedText(qa.reviewerId, 'finalAVQA.reviewerId', 120);
  return structuredClone(value);
}

function assertPacketContract(packet) {
  if (packet?.schema !== FLOW_SITUATION_BOARD_SCHEMA || packet.integrity?.sha256 !== hashWithout(packet, 'integrity')) fail('situation board integrity is stale');
  if (stableStringify(packet.production) !== stableStringify(lockedProduction())) fail('situation board cannot authorize production');
  const factSpine = validateFactSpine(packet.factSpine, packet.script?.exactText);
  const timingModel = validateTimingModel(packet.timingModel);
  const timingDraft = validateTimingDraft(packet.timingDraft, factSpine, timingModel);
  if (stableStringify(factSpine) !== stableStringify(packet.factSpine) || stableStringify(timingModel) !== stableStringify(packet.timingModel) || stableStringify(timingDraft) !== stableStringify(packet.timingDraft)) fail('planning authority normalization drifted');
  if (!Array.isArray(packet.shots) || !Array.isArray(packet.transportBatches)) fail('situation board shots and transport batches are required');
  const expectedSequenceSignature = sequenceSignature({ shots: packet.shots, exactScriptText: packet.script.exactText, globalStyle: packet.globalStyle, physicalReferences: packet.references.map((ref) => ({ ...ref, file: { relativePath: ref.imageRelativePath, realpath: ref.realpath, bytes: ref.bytes, sha256: ref.sha256 } })), factSpineSha256: factSpine.sha256, timingModelSha256: timingModel.sha256, timingDraftSha256: timingDraft.sha256 });
  if (packet.sequenceSignature !== expectedSequenceSignature) fail('sequenceSignature is stale for the successor planning authorities');
  if (stableStringify(packet.nativeBindings) !== stableStringify({ multishot: 'ordered-reference-images-plus-shot-prompt-excluding-native-first-frame-claim', singleShotRecovery: 'new-reviewed-entry-frame-required-before-native-first-frame-i2v', logicalTagsAreReceiptOnly: true })) fail('native binding claims are invalid');
  if (stableStringify(packet.review?.requiredChecks) !== stableStringify(REVIEW_CHECKS)) fail('review checks are incomplete or reordered');
  const expectedLayout = requiredBundleLayout(packet.shots.length, packet.transportBatches.length);
  if (!isObject(packet.handoffBundle) || !['pending', 'verified'].includes(packet.handoffBundle.status) || stableStringify(packet.handoffBundle.requiredLayout) !== stableStringify(expectedLayout)) fail('handoff bundle contract is missing or stale');
  const bundleVerified = packet.handoffBundle.status === 'verified';
  if (packet.submissionGate?.handoffBundleVerified !== bundleVerified) fail('handoff bundle gate does not match verification status');
  if (packet.status === 'test-only / flow-submission-ready' && !bundleVerified) fail('Flow submission readiness requires a verified handoff bundle');
  if (bundleVerified && (packet.handoffBundle.shotCount !== packet.shots.length || packet.handoffBundle.batchCount !== packet.transportBatches.length || packet.handoffBundle.shotImages?.length !== packet.shots.length || packet.handoffBundle.flowReadyBatches?.length !== packet.transportBatches.length)) fail('verified handoff bundle counts are stale');
  if (packet.animatic?.status === 'approved' && packet.animatic.sequenceSignature !== packet.sequenceSignature) fail('approved animatic sequenceSignature is stale');
  if (!Array.isArray(packet.singleShotRecovery) || packet.singleShotRecovery.length !== packet.shots.length) fail('single-shot recovery declarations must cover every shot');
  for (const [index, shot] of packet.shots.entries()) {
    validateCameraCard(shot.cameraCard, `packet.shots[${index}].cameraCard`, shot.startState, shot.endState);
    if (shot.situationFrame?.sha256 !== packet.references.find((ref) => ref.roleTag === shot.situationImageRoleTag)?.sha256) fail(`${shot.shotId} entry-frame hash does not match its reference`);
  }
  for (const [index, recovery] of packet.singleShotRecovery.entries()) {
    if (recovery.shotId !== packet.shots[index].shotId || recovery.status !== 'blocked-new-entry-frame-and-review-required' || stableStringify(recovery.allowedTriggers) !== stableStringify(['high-error-cost', 'multishot-source-qa-failure']) || recovery.requiresNewEntryFrameVersion !== true || recovery.requiresNewHumanReview !== true || recovery.requiresCurrentSequenceAnimaticApproval !== true || recovery.nativeFirstFrameClaim !== false) fail(`single-shot recovery declaration is invalid for ${packet.shots[index].shotId}`);
  }
  validateTransportBatches(packet.transportBatches.map((batch) => ({ batchId: batch.batchId, shotIds: batch.shotIds })), packet.shots);
  const promptReferenceMap = new Map(packet.references.map((ref) => [ref.roleTag, { ...ref, file: { relativePath: ref.imageRelativePath, sha256: ref.sha256 } }]));
  for (const batch of packet.transportBatches) {
    if (batch.requestedDurationSeconds !== 10 || batch.requestTimingAuthority !== 'provider-source-request-intent-only' || batch.finalTimingAuthority !== 'final-owner-lock-after-picture-reconciliation' || batch.nativeFirstFrameLocksVerified !== false || stableStringify(batch.shotDurationsSeconds) !== stableStringify([3, 3, 4])) fail(`${batch.batchId} timing or binding claim is invalid`);
    const sequence = batch.shotIds.map((shotId) => packet.shots.find((shot) => shot.shotId === shotId));
    const expectedPrompt = compilePrompt({ sequence, globalStyle: packet.globalStyle, referenceMap: promptReferenceMap });
    if (batch.prompt !== expectedPrompt || batch.promptSha256 !== sha256(Buffer.from(expectedPrompt, 'utf8')) || batch.imageUploadOrder?.length !== batch.shotIds.length || batch.shots?.length !== batch.shotIds.length) fail(`${batch.batchId} prompt or ordered bindings are stale`);
    for (const [index, shotId] of batch.shotIds.entries()) {
      const shot = packet.shots.find((item) => item.shotId === shotId);
      const frame = shot?.situationFrame;
      const expectedUpload = { order: index + 1, shotId, roleTag: frame.roleTag, assetId: frame.assetId, imageRelativePath: frame.imageRelativePath, bytes: frame.bytes, sha256: frame.sha256 };
      if (stableStringify(batch.imageUploadOrder[index]) !== stableStringify(expectedUpload)) fail(`${batch.batchId} image upload order does not match ${shotId}`);
      if (batch.shots[index]?.order !== index + 1 || batch.shots[index]?.shotId !== shotId || stableStringify(batch.shots[index].cameraCard) !== stableStringify(shot.cameraCard) || stableStringify(batch.shots[index].entryFrame) !== stableStringify(frame)) fail(`${batch.batchId} shot binding does not match ${shotId}`);
    }
  }
  const expectedFreeze = frozenPromptContract(packet.transportBatches);
  if (stableStringify(packet.promptFreeze) !== stableStringify(expectedFreeze)) fail('frozen Flow prompt bytes or hashes changed');
  if (stableStringify(packet.pictureSourcePlan) !== stableStringify({ schema: 'newsroom-picture-source-coverage-plan-v1', plannedOnly: true, plannedSourceCoverageSeconds: 90, standardBatchCount: 9, standardShotSlotCount: 27, standardBatchDurationSeconds: 10, standardShotDurationsSeconds: [3, 3, 4], finalRuntimeAuthority: 'final-owner-narration-after-picture-rough', allProviderVideosDownloadedBeforeSourceQA: true, allProviderBytesPreservedBeforeSourceQA: true })) fail('picture source coverage plan is invalid');
  if (stableStringify(packet.firstLastFramePath) !== stableStringify({ schema: 'newsroom-first-last-frame-provider-path-v1', role: 'high-risk-authored-shot-or-recovery-only', minimumProviderSourceDurationSeconds: 4, finalTimingAuthority: 'downloaded-source-qa-and-picture-conform', automaticBaselineCredit: false })) fail('first-last-frame provider path contract is invalid');
  const pending = stableStringify(packet.postProduction) === stableStringify(pendingPostProduction());
  const complete = !pending;
  if (complete) validateCompletedPostProduction(packet, packet.postProduction);
  const expectedPostGates = complete;
  for (const key of ['sourceWindowsVerified', 'pictureRoughVerified', 'semanticReconciliationApproved', 'finalOwnerNarrationLocked', 'audioConformVerified', 'finalAVQAPassed', 'renderEligible']) if (packet.submissionGate?.[key] !== expectedPostGates) fail('post-production gates do not match successor phase evidence');
  if (packet.status === 'test-only / final-render-ready' && !complete) fail('final render readiness requires completed factual AV QA');
}

function validateReview(review, shotIds, label) {
  if (!isObject(review) || typeof review.reviewerId !== 'string' || !review.reviewerId.trim()) fail(`${label}.reviewerId is required`);
  if (!Array.isArray(review.shots) || review.shots.length !== shotIds.length) fail(`${label}.shots must cover every shot exactly once`);
  const seen = new Set();
  return review.shots.map((item, index) => {
    if (!isObject(item) || !shotIds.includes(item.shotId) || seen.has(item.shotId)) fail(`${label}.shots[${index}] has duplicate or unknown shotId`);
    seen.add(item.shotId);
    if (!['pass', 'revise', 'uncertain'].includes(item.status)) fail(`${label}.shots[${index}].status is invalid`);
    if (!isObject(item.checks) || REVIEW_CHECKS.some((key) => item.checks[key] !== true)) fail(`${label}.shots[${index}] must pass all situation checks`);
    return { shotId: item.shotId, status: item.status, checks: Object.fromEntries(REVIEW_CHECKS.map((key) => [key, true])), note: boundedText(item.note, `${label}.shots[${index}].note`, 500) };
  });
}

export async function compileFlowSituationBoard({ assetRoot, storyId, scriptText, factSpine, timingModel, timingDraft, globalStyle, references, shots, transportBatches, animatic = null }) {
  const root = path.resolve(assetRoot);
  const exactScriptText = boundedText(scriptText, 'scriptText', 30000, true);
  const normalizedFactSpine = validateFactSpine(factSpine, exactScriptText);
  const normalizedTimingModel = validateTimingModel(timingModel);
  const normalizedTimingDraft = validateTimingDraft(timingDraft, normalizedFactSpine, normalizedTimingModel);
  const normalizedRefs = validateReferences(references);
  const physical = [];
  for (const [index, ref] of normalizedRefs.entries()) physical.push({ ...ref, ordinal: index + 1, file: await readPhysical(root, ref.imageRelativePath, `references[${index}]`) });
  const refMap = new Map(physical.map((ref) => [ref.roleTag, ref]));
  if (!Array.isArray(shots) || shots.length < 1) fail('at least one shot is required');
  const shotIds = new Set();
  const normalizedShots = shots.map((shot, index) => {
    const normalized = validateShot(shot, index, refMap);
    if (shotIds.has(normalized.shotId)) fail(`duplicate shotId ${normalized.shotId}`);
    shotIds.add(normalized.shotId);
    return normalized;
  });
  let previousEnd = -Infinity;
  let previousExcerptEnd = -1;
  for (const [index, shot] of normalizedShots.entries()) {
    if (!exactScriptText.includes(shot.narrationText)) fail(`shots[${index}].narrationText must be an exact script excerpt`);
    if (shot.narrationStartSeconds < previousEnd) fail(`shots[${index}] narration timing overlaps the prior shot`);
    const excerptStart = exactScriptText.indexOf(shot.narrationText, previousExcerptEnd + 1);
    if (excerptStart < 0) fail(`shots[${index}].narrationText must follow the prior excerpt in script order`);
    previousExcerptEnd = excerptStart + shot.narrationText.length - 1;
    previousEnd = shot.narrationEndSeconds;
    const unitIndex = normalizedFactSpine.units.findIndex((unit) => unit.exactText.includes(shot.narrationText));
    if (unitIndex < 0) fail(`shots[${index}] must map to one fact-spine semantic unit`);
    const segment = normalizedTimingDraft.segments[unitIndex];
    if (shot.narrationStartSeconds < segment.startSeconds || shot.narrationEndSeconds > segment.endSeconds) fail(`shots[${index}] must be contained by its fact-preserving provisional timing segment`);
  }
  const normalizedStyle = boundedText(globalStyle, 'globalStyle', 1200);
  const normalizedBatches = validateTransportBatches(transportBatches, normalizedShots);
  const situationFrames = normalizedShots.map((shot) => {
    const ref = refMap.get(shot.situationImageRoleTag);
    return { shotId: shot.shotId, roleTag: ref.roleTag, assetId: ref.assetId, imageRelativePath: ref.file.relativePath, realpath: ref.file.realpath, bytes: ref.file.bytes, sha256: ref.file.sha256, binding: 'reviewed-entry-frame-reference' };
  });
  const transport = normalizedBatches.map((batch, batchIndex) => {
    const sequence = batch.shotIds.map((shotId) => normalizedShots.find((shot) => shot.shotId === shotId));
    const prompt = compilePrompt({ sequence, globalStyle: normalizedStyle, referenceMap: refMap });
    assertPromptTags(prompt, new Set(sequence.map((shot) => shot.situationImageRoleTag)), `transportBatches[${batchIndex}].prompt`);
    return {
      batchId: batch.batchId,
      order: batchIndex + 1,
      requestedDurationSeconds: 10,
      requestTimingAuthority: 'provider-source-request-intent-only',
      finalTimingAuthority: 'final-owner-lock-after-picture-reconciliation',
      nativeFirstFrameLocksVerified: false,
      shotIds: [...batch.shotIds],
      shotDurationsSeconds: [3, 3, 4],
      imageUploadOrder: sequence.map((shot, imageIndex) => {
        const frame = situationFrames.find((item) => item.shotId === shot.shotId);
        return { order: imageIndex + 1, shotId: shot.shotId, roleTag: frame.roleTag, assetId: frame.assetId, imageRelativePath: frame.imageRelativePath, bytes: frame.bytes, sha256: frame.sha256 };
      }),
      shots: sequence.map((shot, shotIndex) => ({ order: shotIndex + 1, shotId: shot.shotId, cameraCard: shot.cameraCard, entryFrame: situationFrames.find((item) => item.shotId === shot.shotId) })),
      prompt,
      promptSha256: sha256(Buffer.from(prompt, 'utf8')),
    };
  });
  const packet = {
    schema: FLOW_SITUATION_BOARD_SCHEMA,
    status: 'test-only / semantic-design-review-required',
    storyId: boundedText(storyId, 'storyId', 120),
    script: { exactText: exactScriptText, sha256: sha256(Buffer.from(exactScriptText, 'utf8')) },
    globalStyle: normalizedStyle,
    workflow: { stages: ['fact-spine', 'historical-owner-timing-model', 'provisional-fact-preserving-timing-draft', 'semantic-shot-camera-imagegen', 'reviewed-animatic', 'frozen-flow-transport-batch', 'source-qa-usable-windows', 'opencut-picture-rough', 'semantic-reconciliation', 'final-script-expression-conform', 'final-owner-narration-lock', 'one-bounded-audio-conform', 'captions-title-bgm', 'final-factual-av-qa'], originalScriptPolicy: 'fact-spine-immutable-expression-only-final-conform', situationImagePolicy: 'one-reviewed-entry-frame-plus-identical-camera-card-per-shot', multishotPolicy: { requestedDurationSeconds: 10, shotsPerBatch: 3, shotDurationsSeconds: [3, 3, 4], plannedBatchCount: 9, plannedShotSlotCount: 27, plannedSourceCoverageSeconds: 90, durationVerified: false, providerVideosDownloadedBeforeSourceQA: true } },
    factSpine: normalizedFactSpine,
    timingModel: normalizedTimingModel,
    timingDraft: normalizedTimingDraft,
    pictureSourcePlan: { schema: 'newsroom-picture-source-coverage-plan-v1', plannedOnly: true, plannedSourceCoverageSeconds: 90, standardBatchCount: 9, standardShotSlotCount: 27, standardBatchDurationSeconds: 10, standardShotDurationsSeconds: [3, 3, 4], finalRuntimeAuthority: 'final-owner-narration-after-picture-rough', allProviderVideosDownloadedBeforeSourceQA: true, allProviderBytesPreservedBeforeSourceQA: true },
    firstLastFramePath: { schema: 'newsroom-first-last-frame-provider-path-v1', role: 'high-risk-authored-shot-or-recovery-only', minimumProviderSourceDurationSeconds: 4, finalTimingAuthority: 'downloaded-source-qa-and-picture-conform', automaticBaselineCredit: false },
    references: physical.map((ref) => ({ assetId: ref.assetId, roleTag: ref.roleTag, kind: ref.kind, description: ref.description, ordinal: ref.ordinal, imageRelativePath: ref.file.relativePath, realpath: ref.file.realpath, bytes: ref.file.bytes, sha256: ref.file.sha256 })),
    shots: normalizedShots.map((shot) => ({ ...shot, situationFrame: situationFrames.find((frame) => frame.shotId === shot.shotId), flowReferenceBinding: { mode: 'ordered-reference-image-unverified-native-binding', roleTag: shot.situationImageRoleTag } })),
    sequenceSignature: sequenceSignature({ shots: normalizedShots, exactScriptText, globalStyle: normalizedStyle, physicalReferences: physical, factSpineSha256: normalizedFactSpine.sha256, timingModelSha256: normalizedTimingModel.sha256, timingDraftSha256: normalizedTimingDraft.sha256 }),
    nativeBindings: { multishot: 'ordered-reference-images-plus-shot-prompt-excluding-native-first-frame-claim', singleShotRecovery: 'new-reviewed-entry-frame-required-before-native-first-frame-i2v', logicalTagsAreReceiptOnly: true },
    transportBatches: transport,
    promptFreeze: frozenPromptContract(transport),
    singleShotRecovery: normalizedShots.map((shot) => ({ shotId: shot.shotId, status: 'blocked-new-entry-frame-and-review-required', allowedTriggers: ['high-error-cost', 'multishot-source-qa-failure'], requiresNewEntryFrameVersion: true, requiresNewHumanReview: true, requiresCurrentSequenceAnimaticApproval: true, nativeFirstFrameClaim: false })),
    handoffBundle: { status: 'pending', requiredLayout: requiredBundleLayout(normalizedShots.length, transport.length) },
    review: { status: 'pending', requiredChecks: REVIEW_CHECKS },
    // An imported animatic can only seed a pending review; it can never mark the packet approved.
    animatic: animatic ? { status: 'pending', requiredBeforeFlow: true } : { status: 'not-created', requiredBeforeFlow: true },
    postProduction: pendingPostProduction(),
    production: lockedProduction(),
    submissionGate: closedSubmissionGate(),
  };
  packet.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(packet, 'integrity') };
  return packet;
}

export function approveFlowSituationBoard({ packet, review, animatic }) {
  assertPacketContract(packet);
  if (review?.sequenceSignature !== packet.sequenceSignature) fail('review sequenceSignature is stale or missing');
  const shots = validateReview(review, packet.shots.map((shot) => shot.shotId), 'review');
  if (shots.some((shot) => shot.status !== 'pass')) fail('every shot situation review must pass before Flow submission');
  if (!isObject(animatic) || animatic.status !== 'approved' || animatic.sequenceSignature !== packet.sequenceSignature || typeof animatic.sha256 !== 'string' || !SHA256.test(animatic.sha256)) fail('approved current-sequence animatic hash is required before Flow submission');
  const approved = structuredClone(packet);
  const passSignature = sha256(Buffer.from(stableStringify({ reviewerId: review.reviewerId, sequenceSignature: packet.sequenceSignature, shots }), 'utf8'));
  approved.review = { status: 'approved', requiredChecks: REVIEW_CHECKS, reviewerId: review.reviewerId, currentPassId: passSignature.slice(0, 16), passSignature, shots };
  approved.animatic = { status: 'approved', sequenceSignature: packet.sequenceSignature, sha256: animatic.sha256 };
  approved.submissionGate = closedSubmissionGate({ review: true, animatic: true });
  approved.status = 'test-only / handoff-bundle-required';
  approved.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(approved, 'integrity') };
  return approved;
}

export async function revalidateFlowSituationBoardImport({ packet, assetRoot, references }) {
  assertPacketContract(packet);
  const normalized = validateReferences(references);
  const changed = [];
  const packetRefs = new Map(packet.references.map((ref) => [ref.roleTag, ref]));
  if (normalized.length !== packet.references.length) changed.push('REFERENCE_SET');
  for (const [index, ref] of normalized.entries()) {
    const current = await readPhysical(assetRoot, ref.imageRelativePath, `importReferences[${index}]`);
    const prior = packetRefs.get(ref.roleTag);
    if (!prior || prior.ordinal !== index + 1 || prior.assetId !== ref.assetId || prior.roleTag !== ref.roleTag || prior.kind !== ref.kind || prior.description !== ref.description || prior.imageRelativePath !== current.relativePath || prior.realpath !== current.realpath || prior.bytes !== current.bytes || prior.sha256 !== current.sha256) changed.push(ref.roleTag);
  }
  for (const prior of packet.references) if (!normalized.some((ref) => ref.roleTag === prior.roleTag)) changed.push(prior.roleTag);
  if (changed.length) return { valid: false, reason: 'reference-drift', changedRoleTags: changed, packet: resetForInvalidation(packet, 'reference-drift', changed) };
  const pending = structuredClone(packet);
  pending.status = 'test-only / semantic-design-review-required';
  pending.review = { status: 'pending', requiredChecks: packet.review.requiredChecks };
  pending.animatic = { status: 'pending', requiredBeforeFlow: true };
  pending.handoffBundle = { status: 'pending', requiredLayout: requiredBundleLayout(pending.shots.length, pending.transportBatches.length) };
  pending.postProduction = pendingPostProduction();
  pending.submissionGate = closedSubmissionGate();
  pending.importInvalidation = { invalidated: false, reason: 'import-review-required', changedRoleTags: [] };
  pending.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(pending, 'integrity') };
  return { valid: true, reason: 'import-review-required', changedRoleTags: [], packet: pending };
}

export async function regenerateFlowSituationShot({ packet, assetRoot, references, shotId, replacementFrame }) {
  assertPacketContract(packet);
  const index = packet.shots.findIndex((shot) => shot.shotId === shotId);
  if (index < 0) fail(`unknown shotId ${shotId}`);
  const oldFrameTag = packet.shots[index].situationImageRoleTag;
  const replacement = { ...replacementFrame, kind: 'frame' };
  const baseReferences = references.filter((ref) => ref.roleTag !== replacement.roleTag);
  const importCheck = await revalidateFlowSituationBoardImport({ packet, assetRoot, references: baseReferences });
  if (!importCheck.valid) fail('cannot regenerate one shot while another reference is stale');
  const oldFrameIsShared = packet.shots.some((shot) => shot.shotId !== shotId && shot.situationImageRoleTag === oldFrameTag);
  const nextReferences = [...references.filter((ref) => (oldFrameIsShared || ref.roleTag !== oldFrameTag) && ref.roleTag !== replacement.roleTag), replacement];
  const nextShots = packet.shots.map((shot) => shot.shotId === shotId
    ? { ...shot, selectedRoleTags: shot.selectedRoleTags.map((tag) => tag === oldFrameTag ? replacement.roleTag : tag), situationImageRoleTag: replacement.roleTag }
    : shot);
  const transportBatches = packet.transportBatches.map((batch) => ({ batchId: batch.batchId, shotIds: [...batch.shotIds] }));
  const rebuilt = await compileFlowSituationBoard({ assetRoot, storyId: packet.storyId, scriptText: packet.script.exactText, factSpine: packet.factSpine, timingModel: packet.timingModel, timingDraft: packet.timingDraft, globalStyle: packet.globalStyle, references: nextReferences, shots: nextShots, transportBatches });
  rebuilt.animatic = { status: 'pending', requiredBeforeFlow: true };
  rebuilt.postProduction = pendingPostProduction();
  rebuilt.submissionGate = closedSubmissionGate();
  rebuilt.revision = { supersedesIntegritySha256: packet.integrity.sha256, shotId, reason: 'situation-image-replacement' };
  rebuilt.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(rebuilt, 'integrity') };
  return rebuilt;
}

export async function verifyFlowHandoffBundle({ packet, bundleRoot, manifestRelativePath }) {
  assertPacketContract(packet);
  if (packet.review?.status !== 'approved' || packet.animatic?.status !== 'approved') fail('approved review and animatic are required before handoff bundle verification');
  const verified = await validateHandoffBundle({ packet, bundleRoot, manifestRelativePath });
  const next = structuredClone(packet);
  next.handoffBundle = verified;
  next.submissionGate = closedSubmissionGate({ review: true, animatic: true, bundle: true });
  next.status = 'test-only / flow-submission-ready';
  next.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(next, 'integrity') };
  return next;
}

export function admitFlowPostProduction({ packet, usableSourceWindows, pictureRough, reconciliation, finalScriptConform, finalOwnerNarration, audioConform, finalAVQA }) {
  assertPacketContract(packet);
  if (packet.status !== 'test-only / flow-submission-ready' || packet.handoffBundle?.status !== 'verified') fail('verified Flow handoff must precede source-window and conform admission');
  const postProduction = validateCompletedPostProduction(packet, { usableSourceWindows, pictureRough, reconciliation, finalScriptConform, finalOwnerNarration, audioConform, finalAVQA });
  const next = structuredClone(packet);
  next.postProduction = postProduction;
  next.submissionGate = { ...closedSubmissionGate({ review: true, animatic: true, bundle: true }), sourceWindowsVerified: true, pictureRoughVerified: true, semanticReconciliationApproved: true, finalOwnerNarrationLocked: true, audioConformVerified: true, finalAVQAPassed: true, renderEligible: true };
  next.status = 'test-only / final-render-ready';
  next.integrity = { verified: true, status: 'situation-board-integrity-only', sha256: hashWithout(next, 'integrity') };
  return next;
}

export const _test = { validateReferences, validateShot, validateCameraCard, validateTransportBatches, validateHandoffBundle, validateFactSpine, validateTimingModel, validateTimingDraft, validateCompletedPostProduction, frozenPromptContract, compilePrompt, validateReview, assertPacketContract, requiredBundleLayout, sequenceSignature, hashWithout };
