import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';
import {
  probeVideo,
  verifyFullVisualStoryline,
  verifyImagegenReferenceCatalog,
} from './newsroom-gemini-storyboard-pipeline.mjs';

export const SCHEMA = 'newsroom-imagegen-omni-i2v-v1';
export const REQUEST_SCHEMA = 'newsroom-omni-i2v-request-v1';
export const RECEIPT_SCHEMA = 'newsroom-omni-i2v-request-receipt-v1';
export const REVIEW_PREFLIGHT_SCHEMA = 'newsroom-imagegen-omni-i2v-review-preflight-v1';
export const REVIEW_SCHEMA = 'newsroom-imagegen-omni-i2v-frame-review-v1';
export const ANIMATIC_SCHEMA = 'newsroom-imagegen-omni-i2v-owner-voice-animatic-v1';
export const I2V_POLICY = Object.freeze({
  imageGenerator: 'imagegen',
  videoProvider: 'omni',
  assembly: 'independent-single-shot-i2v-ordered-by-sealed-cuts',
  multishot: { status: 'experimental-unavailable', reason: 'native multishot binding is not verified by this planner', fallback: 'independent-single-shot-i2v' },
});

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const URL_OR_PATH = /(?:[a-z][a-z0-9+.-]{1,31}:\/\/|(?:^|[\s"'(])[a-z]:[\\/]|(?:^|[\s"'(])(?:\\\\|\/)\S+|(?:^|[\s"'(])\.\.?[\\/])/iu;
const PERMISSION = new Set(['permitted', 'pending', 'denied', 'not-applicable']);
const LOCATION_KIND = new Set(['text-only', 'imagegen-generated', 'external-photo', 'external-photo-derived']);
const REVIEW_EVIDENCE_KIND = new Set(['review-frame', 'contact-sheet', 'annotated-frame']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashJson = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const round = (value) => Number(Number(value).toFixed(6));
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const lockedProduction = () => ({ provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false });

function assertSha(value, label) {
  if (!SHA256.test(String(value || ''))) fail(`${label} must be an exact SHA-256`);
  return value;
}

function assertId(value, label) {
  if (!ID.test(String(value || ''))) fail(`${label} is invalid`);
  return value;
}

function bounded(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || URL_OR_PATH.test(value)) fail(`${label} must be bounded path-free text`);
  return value.trim();
}

function optionalBounded(value, label, max = 2000) {
  if (value === undefined || value === null) return undefined;
  return bounded(value, label, max);
}

function assertExactKeys(value, keys, label) {
  if (!isObject(value) || stableStringify(Object.keys(value).sort()) !== stableStringify([...keys].sort())) fail(`${label} has missing or extra fields`);
}

function assertHttpUrl(value, label) {
  if (typeof value !== 'string' || value.length > 2048) fail(`${label} must be a bounded HTTP(S) URL`);
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${label} must be a bounded HTTP(S) URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) fail(`${label} must be a bounded HTTP(S) URL`);
  return parsed.href;
}

function assertIsoDateTime(value, label) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z)?$/u.test(value) || Number.isNaN(Date.parse(value))) fail(`${label} must be an ISO date or UTC timestamp`);
  return value;
}

function decodeImage(bytes, label) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mimeType: 'image/png' };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), mimeType: 'image/jpeg' };
      offset += 2 + length;
    }
  }
  fail(`${label} is not a decodable PNG or JPEG`);
}

function assertApproval(artifact, label, field = 'approval', statuses = ['admitted', 'sealed', 'compiled']) {
  const value = artifact?.[field];
  if (!isObject(value) || value.approved !== true || !statuses.includes(value.status) || !SHA256.test(String(value.sha256 || ''))) fail(`${label} approval is missing or stale`);
  const copy = structuredClone(artifact); delete copy[field];
  if (value.sha256 !== hashJson(copy)) fail(`${label} approval hash is stale`);
}

function assertLockedProduction(value, label = 'production') {
  if (stableStringify(value) !== stableStringify(lockedProduction())) fail(`${label} must keep provider/render/upload/publication/Stage 07 and continuation disabled`);
}

function resolveContained(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);
  const prefix = `${absoluteRoot}${path.sep}`;
  if (!resolved.startsWith(prefix)) fail(`${label} escapes its admitted root`);
  return { absoluteRoot, resolved };
}

async function physicalRecord(root, input, label, { requireImage = false } = {}) {
  if (!isObject(input) || typeof input.relativePath !== 'string' || !input.relativePath.trim()) fail(`${label} physical file is required`);
  const { resolved } = resolveContained(root, input.relativePath, label);
  let stat;
  try { stat = await fs.lstat(resolved); } catch { fail(`${label} physical file is missing`); }
  const realpath = await fs.realpath(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || realpath !== resolved) fail(`${label} must be a contained physical nonsymlink file`);
  const bytes = await fs.readFile(resolved);
  const digest = sha256(bytes);
  if (Number(input.bytes) !== bytes.length || input.sha256 !== digest) fail(`${label} bytes/hash drifted`);
  if (requireImage && !['image/png', 'image/jpeg'].includes(input.mimeType)) fail(`${label} must declare a PNG or JPEG`);
  return { relativePath: path.relative(path.resolve(root), resolved).replaceAll('\\', '/'), realpath, bytes: bytes.length, sha256: digest };
}

async function physicalJson(root, input, label) {
  const record = await physicalRecord(root, input, label);
  const { resolved } = resolveContained(root, input.relativePath, label);
  let value;
  try { value = JSON.parse(await fs.readFile(resolved, 'utf8')); } catch { fail(`${label} must contain valid JSON`); }
  return { record, value };
}

async function physicalVisualEvidence(root, input, label, allowedKinds = REVIEW_EVIDENCE_KIND) {
  const record = await physicalRecord(root, input, label, { requireImage: true });
  const { resolved } = resolveContained(root, input.relativePath, label);
  const decoded = decodeImage(await fs.readFile(resolved), label);
  if (decoded.mimeType !== input.mimeType || decoded.width !== Number(input.width) || decoded.height !== Number(input.height)) fail(`${label} declared dimensions/MIME do not match decoded bytes`);
  if (!allowedKinds.has(input.kind)) fail(`${label}.kind must identify the required visual evidence`);
  return { ...record, width: decoded.width, height: decoded.height, mimeType: decoded.mimeType, kind: input.kind };
}

function permission(value, label) {
  if (!PERMISSION.has(value)) fail(`${label} must be a separate permission status`);
  return value;
}

function validateLocationBrief(value, label) {
  if (!isObject(value)) fail(`${label} is required`);
  const scope = value.scope;
  if (!['country-city', 'generic'].includes(scope)) fail(`${label}.scope must be country-city or generic`);
  if (value.noInventedSiteEvidence !== true) fail(`${label} must explicitly reject invented site evidence`);
  return {
    scope,
    countryOrCity: bounded(value.countryOrCity, `${label}.countryOrCity`, 240),
    era: bounded(value.era, `${label}.era`, 240),
    anchors: {
      building: bounded(value.anchors?.building, `${label}.anchors.building`, 400),
      road: bounded(value.anchors?.road, `${label}.anchors.road`, 400),
      material: bounded(value.anchors?.material, `${label}.anchors.material`, 400),
      light: bounded(value.anchors?.light, `${label}.anchors.light`, 400),
    },
    evidence: optionalBounded(value.evidence, `${label}.evidence`, 800) || '',
    noInventedSiteEvidence: value.noInventedSiteEvidence === true,
  };
}

async function validateRightsEvidence(value, evidenceRoot, label) {
  if (!Array.isArray(value) || value.length < 1) fail(`${label} requires physical rights evidence`);
  const records = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item) || !isObject(item.file)) fail(`${label}[${index}] must contain rights metadata and a physical evidence file`);
    for (const field of ['rightsStatement', 'license', 'scope']) if (typeof item[field] !== 'string' || !item[field].trim()) fail(`${label}[${index}].${field} is required`);
    const file = await physicalRecord(evidenceRoot, item.file, `${label}[${index}].file`);
    records.push({ ...file, itemUrl: assertHttpUrl(item.itemUrl, `${label}[${index}].itemUrl`), originUrl: assertHttpUrl(item.originUrl, `${label}[${index}].originUrl`), rightsUrl: assertHttpUrl(item.rightsUrl, `${label}[${index}].rightsUrl`), rightsStatement: bounded(item.rightsStatement, `${label}[${index}].rightsStatement`, 2000), license: bounded(item.license, `${label}[${index}].license`, 240), retrievedAt: assertIsoDateTime(item.retrievedAt, `${label}[${index}].retrievedAt`), scope: bounded(item.scope, `${label}[${index}].scope`, 800), kind: bounded(item.kind || 'rights-evidence', `${label}[${index}].kind`, 120) });
  }
  return records;
}

async function validateGrounding(value, evidenceRoot, label) {
  if (!isObject(value) || !['source-backed-observation', 'direct-observation'].includes(value.method)) fail(`${label} requires source-backed or direct-observation grounding`);
  const method = value.method;
  const observerId = bounded(value.observerId, `${label}.observerId`, 160);
  const observedAt = assertIsoDateTime(value.observedAt, `${label}.observedAt`);
  const locationScope = bounded(value.locationScope, `${label}.locationScope`, 240);
  const observation = bounded(value.observation, `${label}.observation`, 2000);
  const sourceUrl = method === 'source-backed-observation' ? assertHttpUrl(value.sourceUrl, `${label}.sourceUrl`) : undefined;
  if (method === 'direct-observation' && value.sourceUrl !== undefined) fail(`${label}.sourceUrl is not valid for direct observation`);
  const evidenceFile = await physicalRecord(evidenceRoot, value.evidenceFile, `${label}.evidenceFile`);
  return { method, observerId, observedAt, locationScope, observation, ...(sourceUrl ? { sourceUrl } : {}), evidenceFile };
}

async function validateLocationSource(value, evidenceRoot, label, locationBrief) {
  if (!isObject(value) || !LOCATION_KIND.has(value.kind)) fail(`${label}.kind is invalid`);
  const sourceUseStatus = permission(value.sourceUseStatus, `${label}.sourceUseStatus`);
  const transformStatus = permission(value.transformStatus, `${label}.transformStatus`);
  const imagegenUploadStatus = permission(value.imagegenUploadStatus, `${label}.imagegenUploadStatus`);
  const sourceAssetId = value.sourceAssetId === undefined ? undefined : assertId(value.sourceAssetId, `${label}.sourceAssetId`);
  let sourceRecord;
  if ((value.kind === 'external-photo' || value.kind === 'external-photo-derived') && (!isObject(value.sourceRecord) || !isObject(value.sourceRecord.file))) fail(`${label} external source must preserve its original physical source record`);
  if ((value.kind === 'imagegen-generated') && (!sourceAssetId || value.sourceRecord)) fail(`${label} ImageGen-generated source must bind a catalog location master and cannot hide an external source`);
  if ((value.kind === 'external-photo' || value.kind === 'external-photo-derived')) {
    const source = value.sourceRecord;
    if (typeof source.sourceId !== 'string' || !source.sourceId.trim()) fail(`${label}.sourceRecord.sourceId is required`);
    for (const field of ['rightsStatement', 'license', 'scope']) if (typeof source[field] !== 'string' || !source[field].trim()) fail(`${label}.sourceRecord.${field} is required`);
    const file = await physicalRecord(evidenceRoot, source.file, `${label}.sourceRecord.file`);
    sourceRecord = { sourceId: source.sourceId.trim(), ...file, itemUrl: assertHttpUrl(source.itemUrl, `${label}.sourceRecord.itemUrl`), originUrl: assertHttpUrl(source.originUrl, `${label}.sourceRecord.originUrl`), rightsUrl: assertHttpUrl(source.rightsUrl, `${label}.sourceRecord.rightsUrl`), rightsStatement: bounded(source.rightsStatement, `${label}.sourceRecord.rightsStatement`, 2000), license: bounded(source.license, `${label}.sourceRecord.license`, 240), retrievedAt: assertIsoDateTime(source.retrievedAt, `${label}.sourceRecord.retrievedAt`), scope: bounded(source.scope, `${label}.sourceRecord.scope`, 800) };
  }
  let rightsEvidence = []; let grounding;
  if (value.kind === 'text-only') {
    if (sourceUseStatus !== 'not-applicable' || transformStatus !== 'not-applicable' || imagegenUploadStatus !== 'not-applicable' || value.omniInputStatus !== 'not-applicable') fail(`${label} text-only source must have not-applicable permissions`);
    if (sourceAssetId) fail(`${label} text-only source cannot bind an image asset`);
    if (locationBrief.scope === 'country-city') grounding = await validateGrounding(value.grounding, evidenceRoot, `${label}.grounding`);
    else if (value.grounding !== undefined) grounding = await validateGrounding(value.grounding, evidenceRoot, `${label}.grounding`);
  } else if (value.kind === 'imagegen-generated') {
    if (sourceUseStatus !== 'not-applicable' || transformStatus !== 'permitted' || imagegenUploadStatus !== 'permitted' || value.omniInputStatus !== 'permitted') fail(`${label} generated source permissions are invalid`);
  } else {
    if (sourceUseStatus !== 'permitted' || transformStatus !== 'permitted' || imagegenUploadStatus !== 'permitted' || value.omniInputStatus !== 'permitted') fail(`${label} external photo rights/upload permissions are unresolved`);
    rightsEvidence = await validateRightsEvidence(value.rightsEvidence, evidenceRoot, `${label}.rightsEvidence`);
  }
  return { kind: value.kind, ...(sourceAssetId ? { sourceAssetId } : {}), ...(sourceRecord ? { sourceRecord } : {}), ...(grounding ? { grounding } : {}), sourceUseStatus, transformStatus, imagegenUploadStatus, omniInputStatus: permission(value.omniInputStatus, `${label}.omniInputStatus`), rightsEvidence };
}

async function validateReview(value, evidenceRoot, authorities, bindings, label) {
  const fields = ['schema', 'reviewerId', 'reviewedAt', 'decision', 'geometricRealism', 'oneActionSemantics', 'locationGrounding', 'actorsVehiclesSeats', 'screenDirectionAxis', 'noExtraText', 'adjacentContinuity', 'authorities', 'bindings', 'evidence', 'attestationFile'];
  assertExactKeys(value, fields, label);
  if (value.schema !== REVIEW_SCHEMA || value.decision !== 'pass' || value.geometricRealism !== 'pass' || value.oneActionSemantics !== 'pass' || value.locationGrounding !== 'pass' || value.actorsVehiclesSeats !== 'pass' || value.screenDirectionAxis !== 'pass' || value.noExtraText !== 'pass' || value.adjacentContinuity !== 'pass') fail(`${label} must contain a physical human attestation passing grounded geometry, actors/seats/direction, one-action, continuity, and no-extra-text review`);
  if (stableStringify(value.authorities) !== stableStringify(authorities)) fail(`${label} is stale for the current storyline, catalog, or entry authority`);
  if (stableStringify(value.bindings) !== stableStringify(bindings)) fail(`${label} is stale for the current frame, action, camera, or continuity`);
  const reviewerId = bounded(value.reviewerId, `${label}.reviewerId`, 160);
  const reviewedAt = assertIsoDateTime(value.reviewedAt, `${label}.reviewedAt`);
  if (!Array.isArray(value.evidence) || value.evidence.length < 1) fail(`${label}.evidence is required`);
  const evidence = [];
  for (const [index, item] of value.evidence.entries()) evidence.push(await physicalVisualEvidence(evidenceRoot, item, `${label}.evidence[${index}]`));
  const evidenceDescriptors = evidence.map(({ realpath, ...item }) => item);
  const attested = { schema: REVIEW_SCHEMA, reviewerId, reviewedAt, decision: 'pass', geometricRealism: 'pass', oneActionSemantics: 'pass', locationGrounding: 'pass', actorsVehiclesSeats: 'pass', screenDirectionAxis: 'pass', noExtraText: 'pass', adjacentContinuity: 'pass', authorities: structuredClone(authorities), bindings: structuredClone(bindings), evidence: evidenceDescriptors };
  const attestation = await physicalJson(evidenceRoot, value.attestationFile, `${label}.attestationFile`);
  if (stableStringify(attestation.value) !== stableStringify(attested)) fail(`${label}.attestationFile does not bind the exact authorities, dependencies, checks, and visual evidence`);
  return { ...attested, evidence, attestationFile: attestation.record };
}

function validateProfile(value) {
  if (!isObject(value)) fail('providerProfile is required; Omni support is not inferred');
  const surface = bounded(value.surface, 'providerProfile.surface', 160);
  const model = bounded(value.model, 'providerProfile.model', 160);
  const modelDisplayName = bounded(value.modelDisplayName || model, 'providerProfile.modelDisplayName', 160);
  const aspectRatio = bounded(value.aspectRatio, 'providerProfile.aspectRatio', 40);
  const resolution = bounded(value.resolution, 'providerProfile.resolution', 80);
  if (aspectRatio !== '9:16') fail('providerProfile.aspectRatio must be the sealed vertical format 9:16');
  if (!/omni/iu.test(model) || !/omni/iu.test(modelDisplayName)) fail('providerProfile model and display name must explicitly identify Omni');
  const durationSeconds = Number(value.durationSeconds);
  if (!(durationSeconds > 0 && durationSeconds <= 60)) fail('providerProfile.durationSeconds must be a positive observed-surface intent');
  return { surface, model, modelDisplayName, aspectRatio, durationSeconds: round(durationSeconds), resolution, durationPolicy: 'observed-surface-user-intent-only' };
}

async function assertImageAsset(catalog, assetRoot, assetId, label) {
  const asset = catalog.assets.find((candidate) => candidate.assetId === assetId);
  if (!asset) fail(`${label} references an unknown ImageGen asset`);
  const file = await physicalRecord(assetRoot, asset.file, `${label}.file`, { requireImage: true });
  if (file.sha256 !== asset.file.sha256 || file.bytes !== asset.file.bytes) fail(`${label} ImageGen file drifted`);
  return asset;
}

async function validateProvenance(value, catalog, assetRoot, label, frameAssetId, locationSource) {
  if (!isObject(value) || !Array.isArray(value.masterAssetIds) || value.masterAssetIds.length < 1) fail(`${label}.masterAssetIds must identify the selected ImageGen masters`);
  const allowedKeys = value.locationAssetId === undefined ? ['masterAssetIds'] : ['masterAssetIds', 'locationAssetId'];
  assertExactKeys(value, allowedKeys, label);
  const ids = new Set(); const selectedReferences = []; const allowedMasterRoles = new Set(['storyboard-reference', 'character-reference', 'location-reference', 'prop-reference', 'creature-reference', 'style-reference']);
  for (const [index, assetId] of value.masterAssetIds.entries()) {
    const id = assertId(assetId, `${label}.masterAssetIds[${index}]`);
    if (ids.has(id) || id === frameAssetId) fail(`${label} masters must be unique and cannot be the entry frame`);
    ids.add(id);
    const asset = await assertImageAsset(catalog, assetRoot, id, `${label}.masterAssetIds[${index}]`);
    if (!allowedMasterRoles.has(asset.role)) fail(`${label}.masterAssetIds[${index}] is not an allowed provenance master role`);
    selectedReferences.push({ assetId: asset.assetId, role: asset.role, fileSha256: asset.file.sha256, fileBytes: asset.file.bytes, generationPromptBytes: asset.generation.promptBytes, generationPromptSha256: asset.generation.promptSha256, uploadedSeparatelyToOmni: false });
  }
  const locationAssetId = value.locationAssetId === undefined ? undefined : assertId(value.locationAssetId, `${label}.locationAssetId`);
  if (locationAssetId && !ids.has(locationAssetId)) {
    const location = await assertImageAsset(catalog, assetRoot, locationAssetId, `${label}.locationAssetId`);
    if (location.role !== 'location-reference') fail(`${label}.locationAssetId must be a location-reference`);
    selectedReferences.push({ assetId: location.assetId, role: location.role, fileSha256: location.file.sha256, fileBytes: location.file.bytes, generationPromptBytes: location.generation.promptBytes, generationPromptSha256: location.generation.promptSha256, uploadedSeparatelyToOmni: false });
  }
  const sourceRecordSha256 = locationSource.sourceRecord?.sha256 || null;
  const generationInputBindingSha256 = hashJson({ frameAssetId, selectedReferences, sourceRecordSha256 });
  return { masterAssetIds: [...ids], ...(locationAssetId ? { locationAssetId } : {}), ...(sourceRecordSha256 ? { sourceRecordSha256 } : {}), selectedReferences, generationInputBindingSha256 };
}

async function assertLocationRole(catalog, assetRoot, locationSource, label) {
  if (!locationSource.sourceAssetId) return;
  const asset = await assertImageAsset(catalog, assetRoot, locationSource.sourceAssetId, `${label}.sourceAssetId`);
  if (asset.role !== 'location-reference') fail(`${label}.sourceAssetId must bind a location-reference`);
}

function exactCamera(value, approved, label) {
  if (!isObject(value) || stableStringify(value) !== stableStringify(approved)) fail(`${label} cannot overwrite the approved fullVisualStoryline camera plan`);
  return structuredClone(approved);
}

function exactAction(value, approved, label) {
  assertExactKeys(value, ['subject', 'startState', 'action', 'endState', 'screenDirection'], label);
  for (const field of ['subject', 'startState', 'endState', 'screenDirection']) if (value[field] !== approved[field]) fail(`${label}.${field} cannot overwrite the approved fullVisualStoryline action`);
  if (value.action !== approved.action) fail(`${label}.action cannot overwrite the approved fullVisualStoryline action`);
  return {
    subject: approved.subject,
    startState: approved.startState,
    endState: approved.endState,
    screenDirection: approved.screenDirection,
    approvedAction: approved.action,
  };
}

function exactRequest(request) {
  const bytes = Buffer.from(stableStringify(request), 'utf8');
  return { requestBytes: bytes.length, requestSha256: sha256(bytes) };
}

function canonicalArtifact(value) {
  const copy = structuredClone(value); delete copy.approval; return hashJson(copy);
}

async function validateUpstream({ fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot }) {
  if (!isObject(entrySources)) fail('full entry source objects are required for current authority verification');
  verifyFullVisualStoryline({ artifact: fullVisualStoryline, storyline, semanticCutPlan, entryAuthority, entrySources });
  await verifyImagegenReferenceCatalog({ artifact: referenceCatalog, fullVisualStoryline, assetRoot });
  if (referenceCatalog.storyId !== fullVisualStoryline.storyId) fail('ImageGen reference catalog storyId is stale');
  assertLockedProduction(fullVisualStoryline.production, 'fullVisualStoryline.production');
  assertLockedProduction(referenceCatalog.production, 'referenceCatalog.production');
}

function validateRevision(value) {
  if (value === undefined || value === null) return null;
  const revision = { supersedesSha256: assertSha(value.supersedesSha256, 'revision.supersedesSha256'), reason: bounded(value.reason, 'revision.reason', 800), changedDependencies: Array.isArray(value.changedDependencies) ? value.changedDependencies.map((item, index) => bounded(item, `revision.changedDependencies[${index}]`, 200)) : [], dependencyReviewStatus: value.dependencyReviewStatus };
  if (revision.dependencyReviewStatus !== 'revalidated') fail('revision dependency review is stale; changed dependencies must be revalidated');
  return revision;
}

function rawAdapterRequest(profile, firstFrameImageMediaId, prompt) {
  return { prompt, firstFrameImageMediaId, modelDisplayName: profile.modelDisplayName, aspectRatio: profile.aspectRatio, durationSeconds: profile.durationSeconds, resolution: profile.resolution };
}

export async function prepareImagegenOmniI2vReview({ draft, fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot, evidenceRoot }) {
  await validateUpstream({ fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot });
  if (!isObject(draft) || draft.schema !== SCHEMA || draft.storyId !== fullVisualStoryline.storyId || !Array.isArray(draft.sequences)) fail('I2V draft must bind the exact story and contain sequences');
  if (draft.production !== undefined) assertLockedProduction(draft.production, 'draft.production');
  const profile = validateProfile(draft.providerProfile);
  const revision = validateRevision(draft.revision);
  const cutById = new Map(fullVisualStoryline.cuts.map((cut) => [cut.cutId, cut]));
  const sequenceById = new Map(fullVisualStoryline.sequences.map((sequence) => [sequence.sequenceId, sequence]));
  const catalogAssetIds = new Set(referenceCatalog.assets.map((asset) => asset.assetId));
  const reviewAuthorities = { fullVisualStorylineSha256: fullVisualStoryline.approval.sha256, referenceCatalogSha256: referenceCatalog.approval.sha256, entryAuthoritySha256: entryAuthority.approval.sha256 };
  const usedFrames = new Set(); const usedFrameHashes = new Set(); const usedFramePaths = new Set(); const usedCuts = []; const sequences = []; let previousGlobal = null;
  for (const [sequenceIndex, sequenceDraft] of draft.sequences.entries()) {
    const sequenceId = assertId(sequenceDraft?.sequenceId, `sequences[${sequenceIndex}].sequenceId`);
    const approvedSequence = sequenceById.get(sequenceId); if (!approvedSequence) fail(`${sequenceId} is not an approved sequence`);
    const locationBrief = validateLocationBrief(sequenceDraft.locationBrief, `${sequenceId}.locationBrief`);
    const locationSource = await validateLocationSource(sequenceDraft.locationSource, evidenceRoot, `${sequenceId}.locationSource`, locationBrief);
    await assertLocationRole(referenceCatalog, assetRoot, locationSource, `${sequenceId}.locationSource`);
    if (!Array.isArray(sequenceDraft.cuts) || stableStringify(sequenceDraft.cuts.map((cut) => cut.cutId)) !== stableStringify(approvedSequence.cutIds)) fail(`${sequenceId} must cover its sealed cuts in order`);
    const cuts = [];
    for (const [cutIndex, cutDraft] of sequenceDraft.cuts.entries()) {
      const cut = cutById.get(cutDraft?.cutId); if (!cut || cut.sequenceId !== sequenceId) fail(`${sequenceId}.cuts[${cutIndex}] does not bind its sealed cut`);
      const frameAssetId = assertId(cutDraft.entryFrameAssetId, `${cut.cutId}.entryFrameAssetId`);
      if (usedFrames.has(frameAssetId)) fail(`${frameAssetId} entry frame is reused across cuts`);
      usedFrames.add(frameAssetId);
      const frameAsset = await assertImageAsset(referenceCatalog, assetRoot, frameAssetId, `${cut.cutId}.entryFrameAssetId`);
      if (frameAsset.role !== 'entry-frame-reference') fail(`${cut.cutId} must bind exactly one entry-frame-reference`);
      if (frameAsset.file.width < 480 || frameAsset.file.height < 480 || Math.abs((frameAsset.file.width / frameAsset.file.height) - (9 / 16)) > 0.03) fail(`${cut.cutId} entry frame must be a portrait ImageGen frame with minimum 480px edge`);
      if (usedFrameHashes.has(frameAsset.file.sha256) || usedFramePaths.has(frameAsset.file.realpath)) fail(`${cut.cutId} entry frame bytes/path must be unique`);
      usedFrameHashes.add(frameAsset.file.sha256); usedFramePaths.add(frameAsset.file.realpath);
      const provenance = await validateProvenance(cutDraft.inputProvenance, referenceCatalog, assetRoot, `${cut.cutId}.inputProvenance`, frameAssetId, locationSource);
      if (locationSource.sourceAssetId && !catalogAssetIds.has(locationSource.sourceAssetId)) fail(`${sequenceId}.locationSource.sourceAssetId is not in the ImageGen catalog`);
      if (locationSource.kind === 'external-photo' || locationSource.kind === 'external-photo-derived') {
        if (!locationSource.sourceAssetId || !locationSource.sourceRecord) fail(`${sequenceId} external photo source must bind its generated location asset and original source record`);
        if (!provenance.masterAssetIds.includes(locationSource.sourceAssetId) && provenance.locationAssetId !== locationSource.sourceAssetId) fail(`${cut.cutId} external location source is not in selected provenance`);
      }
      const action = exactAction(cutDraft.action, cut.actionPlan, `${cut.cutId}.action`);
      const camera = exactCamera(cutDraft.camera, cut.cameraPlan, `${cut.cutId}.camera`);
      const continuity = isObject(cutDraft.continuity) ? cutDraft.continuity : {};
      if (continuity.entryStateId !== cut.entryStateId || continuity.exitStateId !== cut.exitStateId || continuity.screenDirection !== cut.actionPlan.screenDirection) fail(`${cut.cutId} continuity cannot overwrite approved states/direction`);
      const axis = bounded(continuity.axis, `${cut.cutId}.continuity.axis`, 160);
      const locationKey = bounded(continuity.locationKey, `${cut.cutId}.continuity.locationKey`, 160);
      const transition = cut.transition;
      if (!previousGlobal && transition === 'continue') fail(`${cut.cutId} cannot continue without a prior cut`);
      let normalizedReset = null;
      if (previousGlobal) {
        const previous = previousGlobal;
        if (transition === 'continue' && (continuity.entryStateId !== previous.continuity.exitStateId || continuity.axis !== previous.continuity.axis || continuity.locationKey !== previous.continuity.locationKey || continuity.screenDirection !== previous.continuity.screenDirection)) fail(`${cut.cutId} continue transition does not preserve prior exit, direction, axis and location`);
        if (transition !== 'continue') {
          if (!isObject(cutDraft.reset) || !bounded(cutDraft.reset.reason, `${cut.cutId}.reset.reason`, 500) || !Array.isArray(cutDraft.reset.evidence) || cutDraft.reset.evidence.length < 1) fail(`${cut.cutId} reset requires reason and physical evidence`);
          const resetEvidence = []; for (const [index, evidence] of cutDraft.reset.evidence.entries()) resetEvidence.push({ ...(await physicalRecord(evidenceRoot, evidence, `${cut.cutId}.reset.evidence[${index}]`)), kind: bounded(evidence.kind || 'continuity-reset', `${cut.cutId}.reset.evidence[${index}].kind`, 120) });
          normalizedReset = { reason: cutDraft.reset.reason.trim(), evidence: resetEvidence };
        }
      }
      const resetSha256 = hashJson(normalizedReset);
      const frame = { assetId: frameAsset.assetId, role: frameAsset.role, file: structuredClone(frameAsset.file), generation: structuredClone(frameAsset.generation), uploadedSeparatelyToOmni: false };
      const motionPrompt = [
        'OMNI IMAGE-TO-VIDEO REQUEST',
        'Use exactly the attached native first frame as the opening composition. Generate one continuous shot with no internal cuts, no morphing and no extra reference images.',
        `APPROVED ACTION: ${action.approvedAction}`,
        `APPROVED SUBJECT: ${action.subject}.`,
        `START: ${action.startState}`, `END: ${action.endState}`,
        `CAMERA: ${camera.framing}; ${camera.angle}; ${camera.movement}; ${camera.composition}.`,
        `SCREEN DIRECTION: ${action.screenDirection}. Preserve the fixed axis and location: ${axis}; ${locationKey}.`,
        'Keep one readable physical action only. Do not invent dialogue, subtitles, logos, or a second action.',
      ].join('\n');
      const promptBytes = Buffer.byteLength(motionPrompt, 'utf8');
      const firstFrameImageMediaId = bounded(cutDraft.firstFrameImageMediaId, `${cut.cutId}.firstFrameImageMediaId`, 240);
      const prompt = { text: motionPrompt, bytes: promptBytes, sha256: sha256(Buffer.from(motionPrompt, 'utf8')) };
      const rawRequest = rawAdapterRequest(profile, firstFrameImageMediaId, motionPrompt);
      const rawRequestHash = exactRequest(rawRequest);
      const reviewBindings = { cutId: cut.cutId, entryFrameAssetId: frameAsset.assetId, entryFrameSha256: frameAsset.file.sha256, firstFrameImageMediaId, actionSha256: hashJson(action), cameraSha256: hashJson(camera), continuitySha256: hashJson({ entryStateId: cut.entryStateId, exitStateId: cut.exitStateId, screenDirection: cut.actionPlan.screenDirection, axis, locationKey }), inputProvenanceSha256: hashJson(provenance), locationBriefSha256: hashJson(locationBrief), locationSourceSha256: hashJson(locationSource), resetSha256, revisionSha256: hashJson(revision), promptSha256: prompt.sha256, rawRequestSha256: rawRequestHash.requestSha256, ...reviewAuthorities };
      cuts.push({ cutId: cut.cutId, order: cut.order, authoredDurationSeconds: cut.authoredDurationSeconds, transition, entryStateId: cut.entryStateId, exitStateId: cut.exitStateId, continuity: { entryStateId: cut.entryStateId, exitStateId: cut.exitStateId, screenDirection: cut.actionPlan.screenDirection, axis, locationKey }, entryFrame: frame, firstFrameImageMediaId, inputProvenance: provenance, action, camera, reset: normalizedReset, prompt, rawRequest, rawRequestBytes: rawRequestHash.requestBytes, rawRequestSha256: rawRequestHash.requestSha256, reviewBindings });
      previousGlobal = cuts.at(-1);
      if (profile.durationSeconds < cut.authoredDurationSeconds) fail(`${cut.cutId} provider duration intent must cover its authored cut duration`);
      usedCuts.push(cut.cutId);
    }
    sequences.push({ sequenceId, order: sequenceIndex + 1, cutIds: [...approvedSequence.cutIds], locationBrief, locationSource, cuts });
  }
  if (stableStringify(usedCuts) !== stableStringify(fullVisualStoryline.cuts.map((cut) => cut.cutId))) fail('I2V plan must cover every sealed cut exactly once and in order');
  const animaticDependencies = {
    authorities: { fullVisualStorylineSha256: fullVisualStoryline.approval.sha256, semanticCutPlanSha256: fullVisualStoryline.authorities.semanticCutPlanSha256, entryAuthoritySha256: entryAuthority.approval.sha256, referenceCatalogSha256: referenceCatalog.approval.sha256 },
    revisionSha256: hashJson(revision),
    sequences: sequences.map((sequence) => ({ sequenceId: sequence.sequenceId, locationBriefSha256: hashJson(sequence.locationBrief), locationSourceSha256: hashJson(sequence.locationSource), cuts: sequence.cuts.map((cut) => ({ cutId: cut.cutId, authoredDurationSeconds: cut.authoredDurationSeconds, entryFrameSha256: cut.entryFrame.file.sha256, inputProvenanceSha256: hashJson(cut.inputProvenance), actionSha256: hashJson(cut.action), cameraSha256: hashJson(cut.camera), continuitySha256: hashJson(cut.continuity), resetSha256: hashJson(cut.reset), promptSha256: cut.prompt.sha256 })) })),
  };
  const authoredDurationSeconds = round(sequences.flatMap((sequence) => sequence.cuts).reduce((sum, cut) => sum + cut.authoredDurationSeconds, 0));
  return {
    schema: REVIEW_PREFLIGHT_SCHEMA, status: 'pending-human-review', storyId: fullVisualStoryline.storyId,
    authorities: { fullVisualStorylineSha256: fullVisualStoryline.approval.sha256, semanticCutPlanSha256: fullVisualStoryline.authorities.semanticCutPlanSha256, entryAuthoritySha256: entryAuthority.approval.sha256, referenceCatalogSha256: referenceCatalog.approval.sha256 },
    providerProfile: profile, sequences, revision,
    animaticBinding: { ownerNarration: { audioSha256: assertSha(entryAuthority.ownerNarrationApproval.audioSha256, 'owner narration audio'), timingSha256: assertSha(entryAuthority.ownerNarrationApproval.timingSha256, 'owner narration timing') }, orderedCuts: sequences.flatMap((sequence) => sequence.cuts.map((cut) => ({ cutId: cut.cutId, entryFrameAssetId: cut.entryFrame.assetId, entryFrameSha256: cut.entryFrame.file.sha256 }))), authoredDurationSeconds, planningDependencySha256: hashJson(animaticDependencies) },
    production: lockedProduction(),
  };
}

async function validateAnimatic(value, evidenceRoot, preflight) {
  assertExactKeys(value, ['file', 'manifestFile'], 'animatic');
  if (value.file?.mimeType !== 'video/mp4') fail('animatic.file must declare video/mp4');
  const file = { ...(await physicalRecord(evidenceRoot, value.file, 'animatic.file')), mimeType: 'video/mp4' };
  const animaticBytes = await fs.readFile(file.realpath);
  if (animaticBytes.length < 12 || animaticBytes.subarray(4, 8).toString('ascii') !== 'ftyp') fail('animatic.file must have an MP4 container signature');
  let media;
  try { media = await probeVideo(file.realpath); } catch { fail('animatic.file must be a decodable video'); }
  if (!(media.width > 0 && media.height > 0 && media.durationSeconds > 0) || media.audioPresent !== true) fail('owner-voice animatic must decode as video with its review audio present');
  const manifestPhysical = await physicalJson(evidenceRoot, value.manifestFile, 'animatic.manifestFile');
  const manifest = manifestPhysical.value;
  assertExactKeys(manifest, ['schema', 'storyId', 'status', 'reviewerId', 'reviewedAt', 'decision', 'ownerNarration', 'orderedCuts', 'authoredDurationSeconds', 'planningDependencySha256', 'animaticFile'], 'animatic manifest');
  if (manifest.schema !== ANIMATIC_SCHEMA || manifest.storyId !== preflight.storyId || manifest.status !== 'human-approved' || manifest.decision !== 'pass') fail('owner-voice animatic must have an exact human pass for this story');
  const reviewerId = bounded(manifest.reviewerId, 'animatic manifest reviewerId', 160);
  const reviewedAt = assertIsoDateTime(manifest.reviewedAt, 'animatic manifest reviewedAt');
  if (stableStringify(manifest.ownerNarration) !== stableStringify(preflight.animaticBinding.ownerNarration) || stableStringify(manifest.orderedCuts) !== stableStringify(preflight.animaticBinding.orderedCuts)) fail('animatic manifest is stale for owner narration timing or ordered entry frames');
  if (manifest.authoredDurationSeconds !== preflight.animaticBinding.authoredDurationSeconds || manifest.planningDependencySha256 !== preflight.animaticBinding.planningDependencySha256) fail('animatic manifest is stale for authored timing or visual planning dependencies');
  if (Math.abs(media.durationSeconds - preflight.animaticBinding.authoredDurationSeconds) > 0.05) fail('owner-voice animatic decoded duration does not match the locked authored cut span');
  const fileDescriptor = { relativePath: file.relativePath, bytes: file.bytes, sha256: file.sha256, mimeType: file.mimeType };
  if (stableStringify(manifest.animaticFile) !== stableStringify(fileDescriptor)) fail('animatic manifest does not bind the physical animatic bytes');
  return { schema: ANIMATIC_SCHEMA, status: 'human-approved', reviewerId, reviewedAt, decision: 'pass', ownerNarration: structuredClone(manifest.ownerNarration), orderedCuts: structuredClone(manifest.orderedCuts), authoredDurationSeconds: manifest.authoredDurationSeconds, planningDependencySha256: manifest.planningDependencySha256, file: { ...file, media }, manifestFile: manifestPhysical.record };
}

export async function compileImagegenOmniI2v(inputs) {
  const preflight = await prepareImagegenOmniI2vReview(inputs);
  const { draft, evidenceRoot } = inputs;
  const animatic = await validateAnimatic(draft.animatic, evidenceRoot, preflight);
  const requests = [];
  const sequences = [];
  for (const sequence of preflight.sequences) {
    const draftSequence = draft.sequences.find((candidate) => candidate.sequenceId === sequence.sequenceId);
    const cuts = [];
    for (const cut of sequence.cuts) {
      const draftCut = draftSequence.cuts.find((candidate) => candidate.cutId === cut.cutId);
      const review = await validateReview(draftCut.review, evidenceRoot, { fullVisualStorylineSha256: preflight.authorities.fullVisualStorylineSha256, referenceCatalogSha256: preflight.authorities.referenceCatalogSha256, entryAuthoritySha256: preflight.authorities.entryAuthoritySha256 }, cut.reviewBindings, `${cut.cutId}.review`);
      const requestAuthority = { ...preflight.authorities, animaticSha256: animatic.file.sha256, animaticManifestSha256: animatic.manifestFile.sha256, reviewAttestationSha256: review.attestationFile.sha256, reviewBindingsSha256: hashJson(cut.reviewBindings) };
      const request = { schema: REQUEST_SCHEMA, cutId: cut.cutId, mode: 'single-shot-i2v', adapterSurface: preflight.providerProfile.surface, modelIntent: preflight.providerProfile.model, requestAuthority, firstFrameAsset: { assetId: cut.entryFrame.assetId, bytes: cut.entryFrame.file.bytes, sha256: cut.entryFrame.file.sha256 }, prompt: cut.prompt, rawRequest: cut.rawRequest, rawRequestBytes: cut.rawRequestBytes, rawRequestSha256: cut.rawRequestSha256, forbiddenInputs: { referenceImages: false, r2v: false, t2v: false, multishot: false } };
      requests.push(request);
      const { reviewBindings, prompt, rawRequest, rawRequestBytes, rawRequestSha256, ...planCut } = cut;
      cuts.push({ ...planCut, reviewBindings, review, requestSha256: hashJson(request) });
    }
    sequences.push({ ...sequence, cuts });
  }
  const artifact = {
    schema: SCHEMA, storyId: preflight.storyId,
    authorities: { ...preflight.authorities, animaticSha256: animatic.file.sha256, animaticManifestSha256: animatic.manifestFile.sha256 },
    policy: structuredClone(I2V_POLICY), providerProfile: preflight.providerProfile,
    sequences, requests, animatic, revision: preflight.revision,
    status: 'planning-validated', creator: { tool: SCHEMA, mode: 'planning-only' }, verifier: { status: 'planning-validated', visualTruthProvenByDeterministicChecks: false, providerExecution: false, semanticQa: false }, production: lockedProduction(),
  };
  artifact.approval = { approved: true, status: 'planning-validated', sha256: canonicalArtifact(artifact) };
  return artifact;
}

export async function verifyImagegenOmniI2v({ artifact, draft, fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot, evidenceRoot }) {
  assertApproval(artifact, 'ImageGen→Omni I2V plan', 'approval', ['planning-validated']);
  assertLockedProduction(artifact.production); if (artifact.status !== 'planning-validated') fail('I2V artifact status is not planning-validated');
  const recreated = await compileImagegenOmniI2v({ draft, fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot, evidenceRoot });
  if (stableStringify(recreated) !== stableStringify(artifact)) fail('ImageGen→Omni I2V plan is stale or non-canonical');
  return true;
}

export async function verifyOmniI2vRequest({ artifact, capture, draft, fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot, evidenceRoot, receiptRoot }) {
  await verifyImagegenOmniI2v({ artifact, draft, fullVisualStoryline, referenceCatalog, storyline, semanticCutPlan, entryAuthority, entrySources, assetRoot, evidenceRoot });
  if (!isObject(capture) || capture.schema !== RECEIPT_SCHEMA || capture.status !== 'human-attested') fail('a human-attested Omni request receipt is required');
  assertExactKeys(capture, ['schema', 'status', 'operatorId', 'capturedAt', 'phase', 'requests'], 'request capture');
  const operatorId = bounded(capture.operatorId, 'request capture operatorId', 160);
  const capturedAt = assertIsoDateTime(capture.capturedAt, 'request capture capturedAt');
  if (!['pre-submission-observed', 'submitted'].includes(capture.phase)) fail('request capture phase must distinguish pre-submission observation from submitted record');
  const actual = Array.isArray(capture.requests) ? capture.requests : [];
  if (actual.length !== artifact.requests.length) fail('captured request count does not match the sealed plan');
  const expectedOrder = artifact.requests.map((request) => request.cutId);
  const actualOrder = actual.map((request) => request?.cutId);
  if (stableStringify(actualOrder) !== stableStringify(expectedOrder) || new Set(actualOrder).size !== actualOrder.length) fail('captured requests must cover each sealed cut exactly once and in order');
  const captureIds = actual.map((request) => assertId(request?.captureId, 'captured request captureId'));
  if (new Set(captureIds).size !== captureIds.length) fail('captured request capture IDs must be unique');
  const byCut = new Map(artifact.requests.map((request) => [request.cutId, request]));
  for (const [index, observed] of actual.entries()) {
    assertExactKeys(observed, ['captureId', 'cutId', 'capturedRequest', 'rawPayloadFile', 'promptReceiptFile', 'physicalReceipt'], `captured request ${index}`);
    const expected = byCut.get(observed?.cutId); if (!expected) fail(`captured request ${index} binds an unknown cut`);
    if (!isObject(observed.capturedRequest)) fail(`${observed.cutId} capturedRequest raw inspector payload is required`);
    const captured = observed.capturedRequest;
    const allowedCapturedKeys = ['prompt', 'firstFrameImageMediaId', 'modelDisplayName', 'aspectRatio', 'durationSeconds', 'resolution'];
    if (stableStringify(Object.keys(captured).sort()) !== stableStringify([...allowedCapturedKeys].sort())) fail(`${observed.cutId} captured raw payload has missing or extra transport fields`);
    if (stableStringify(captured) !== stableStringify(expected.rawRequest)) fail(`${observed.cutId} captured raw adapter payload does not exactly match the single compiled request`);
    if (typeof captured.prompt !== 'string' || captured.prompt !== expected.prompt.text || Buffer.byteLength(captured.prompt, 'utf8') !== expected.prompt.bytes || sha256(Buffer.from(captured.prompt, 'utf8')) !== expected.prompt.sha256) fail(`${observed.cutId} exact submitted prompt bytes/SHA do not match the sealed request`);
    if (expected.mode !== 'single-shot-i2v' || expected.forbiddenInputs.r2v !== false || expected.forbiddenInputs.referenceImages !== false) fail(`${observed.cutId} is not a native single-shot I2V plan`);
    if (!isObject(observed.rawPayloadFile)) fail(`${observed.cutId} physical raw payload bytes are required`);
    const rawFile = await physicalJson(receiptRoot, observed.rawPayloadFile, `${observed.cutId}.rawPayloadFile`);
    if (stableStringify(rawFile.value) !== stableStringify(expected.rawRequest)) fail(`${observed.cutId} physical raw payload JSON does not equal the compiled request`);
    const promptFile = await physicalRecord(receiptRoot, observed.promptReceiptFile, `${observed.cutId}.promptReceiptFile`);
    const promptResolved = resolveContained(receiptRoot, observed.promptReceiptFile.relativePath, `${observed.cutId}.promptReceiptFile`).resolved;
    const promptBytes = await fs.readFile(promptResolved);
    if (promptFile.bytes !== expected.prompt.bytes || promptFile.sha256 !== expected.prompt.sha256 || !promptBytes.equals(Buffer.from(expected.prompt.text, 'utf8'))) fail(`${observed.cutId} physical prompt receipt is not the exact submitted UTF-8 prompt`);
    const receipt = observed.physicalReceipt; if (!isObject(receipt)) fail(`${observed.cutId} physical UI receipt is required`);
    assertExactKeys(receipt, ['firstFrameImageMediaId', 'firstFrameAsset', 'file', 'receiptSha256'], `${observed.cutId}.physicalReceipt`);
    const receiptFile = await physicalVisualEvidence(receiptRoot, receipt.file, `${observed.cutId}.physicalReceipt.file`, new Set(['ui-request-screenshot']));
    if (receipt.receiptSha256 !== hashJson({ captureId: observed.captureId, cutId: observed.cutId, operatorId, capturedAt, phase: capture.phase, firstFrameImageMediaId: receipt.firstFrameImageMediaId, firstFrameAsset: receipt.firstFrameAsset, file: receiptFile })) fail(`${observed.cutId} physical receipt hash is stale`);
    if (receipt.firstFrameImageMediaId !== expected.rawRequest.firstFrameImageMediaId || stableStringify(receipt.firstFrameAsset) !== stableStringify(expected.firstFrameAsset)) fail(`${observed.cutId} physical receipt does not bind the actual media ID and ImageGen frame`);
    const asset = await assertImageAsset({ assets: artifact.sequences.flatMap((sequence) => sequence.cuts.map((cut) => cut.entryFrame)) }, assetRoot, expected.firstFrameAsset.assetId, `${observed.cutId}.firstFrameAsset`);
    if (asset.file.sha256 !== expected.firstFrameAsset.sha256 || asset.file.bytes !== expected.firstFrameAsset.bytes) fail(`${observed.cutId} actual first-frame image drifted`);
  }
  return true;
}

export function createDraftTemplate() {
  return {
    schema: SCHEMA, storyId: 'replace-with-approved-story-id', providerProfile: { surface: 'omni-ui-adapter', model: 'record-observed-model', modelDisplayName: 'record-observed-model-display-name', aspectRatio: '9:16', durationSeconds: 6, resolution: 'record-observed-resolution' },
    sequences: [{ sequenceId: 'replace-sequence-01', locationBrief: { scope: 'country-city', countryOrCity: 'replace-with-country-city', era: 'replace-with-era', anchors: { building: 'replace-with-ordinary-building-anchor', road: 'replace-with-road-anchor', material: 'replace-with-material-anchor', light: 'replace-with-light-anchor' }, evidence: 'replace-with-grounded-brief-evidence', noInventedSiteEvidence: true }, locationSource: { kind: 'text-only', sourceUseStatus: 'not-applicable', transformStatus: 'not-applicable', imagegenUploadStatus: 'not-applicable', omniInputStatus: 'not-applicable', rightsEvidence: [], grounding: { method: 'source-backed-observation', observerId: 'replace-observer', observedAt: 'replace-with-iso-date', locationScope: 'replace-location-scope', observation: 'replace-observation', sourceUrl: 'https://replace.example/source', evidenceFile: { relativePath: 'replace-grounding-evidence.txt', bytes: 1, sha256: 'replace' } } }, cuts: [{ cutId: 'replace-cut-001', entryFrameAssetId: 'replace-entry-frame-asset', firstFrameImageMediaId: 'replace-adapter-receipt-media-id', inputProvenance: { masterAssetIds: ['replace-character-master'], locationAssetId: 'replace-location-master' }, action: { subject: 'replace-approved-subject', action: 'replace-approved-action', startState: 'replace-approved-start-state', endState: 'replace-approved-end-state', screenDirection: 'replace-approved-screen-direction' }, camera: { framing: 'replace-approved-framing', angle: 'replace-approved-angle', movement: 'replace-approved-movement', composition: 'replace-approved-composition' }, continuity: { entryStateId: 'replace-entry-state', exitStateId: 'replace-exit-state', screenDirection: 'replace-approved-screen-direction', axis: 'replace-axis', locationKey: 'replace-location-key' }, review: { schema: REVIEW_SCHEMA, reviewerId: 'replace-independent-reviewer', reviewedAt: 'replace-with-iso-timestamp', decision: 'pending', geometricRealism: 'pending', oneActionSemantics: 'pending', locationGrounding: 'pending', actorsVehiclesSeats: 'pending', screenDirectionAxis: 'pending', noExtraText: 'pending', adjacentContinuity: 'pending', authorities: {}, bindings: {}, evidence: [], attestationFile: { relativePath: 'replace-review-attestation.json', bytes: 1, sha256: 'replace' } } }] }],
    animatic: { file: { relativePath: 'replace-owner-voice-animatic.mp4', bytes: 1, sha256: 'replace', mimeType: 'video/mp4' }, manifestFile: { relativePath: 'replace-owner-voice-animatic-manifest.json', bytes: 1, sha256: 'replace' } },
    revision: null, blockers: ['run prepare-review to derive hashes, obtain physical human review attestations and an owner-voice animatic pass, then compile'], production: lockedProduction(),
  };
}
