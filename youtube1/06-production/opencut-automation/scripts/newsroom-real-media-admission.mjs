import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';

export const REAL_MEDIA_NEEDS_SCHEMA = 'newsroom-real-media-needs-v1';
export const REAL_MEDIA_ADMISSION_SCHEMA = 'newsroom-real-media-acquisition-admission-v1';
export const REAL_MEDIA_COVERAGE_SCHEMA = 'newsroom-real-media-duration-coverage-v1';
export const REAL_MEDIA_SOURCE_CLASSES = Object.freeze(['actual-case-evidence', 'institutional-context', 'generic-stock', 'grok-generated']);
export const REAL_MEDIA_SOURCE_USE_STATUSES = Object.freeze(['admitted', 'conditional', 'denied']);
export const REAL_MEDIA_PROVIDER_INPUT_STATUSES = Object.freeze(['admitted', 'conditional', 'denied']);

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const AUTO_LICENSES = new Set(['cc0', 'public-domain', 'cc-by', 'kogl-1', 'us-federal-public-domain']);
const CONDITIONAL_LICENSES = new Set(['cc-by-sa']);
const DENIED_LICENSES = new Set(['cc-by-nc', 'cc-by-nd', 'cc-by-nc-sa', 'cc-by-nc-nd', 'kogl-2', 'kogl-3', 'kogl-4', 'unknown', 'usage-conditions']);
const AGGREGATORS = new Set(['openverse', 'europeana', 'dpla']);
const DOMESTIC_PROVIDERS = new Set(['kogl-korea', 'korean-public-institution', 'korean-rightsholder-direct']);
const FLAG_KEYS = ['recognizablePerson', 'minor', 'sensitiveParty', 'privacyPublicity', 'trademarkLogo', 'artwork', 'property', 'geographicMismatch', 'casePartyImplication'];
const hashJson = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalHash = (value) => { const copy = structuredClone(value); delete copy.approval; return hashJson(copy); };

export function hashRealMediaNeedsContent(value) { return canonicalHash(value); }
export function hashRealMediaAdmissionContent(value) { return canonicalHash(value); }

function approved(value, label, hash) {
  if (!object(value) || value.approved !== true || value.status !== 'admitted' || value.sha256 !== hash || !SHA256.test(String(value.sha256 || ''))) fail(`${label} approval hash is stale`);
}

function exactFields(value, fields, label) {
  if (!object(value)) fail(`${label} must be an object`);
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  if (missing.length) fail(`${label} is missing ${missing.join(', ')}`);
}

function validateFlags(flags, label) {
  exactFields(flags, FLAG_KEYS, label);
  if (FLAG_KEYS.some((key) => typeof flags[key] !== 'boolean')) fail(`${label} flags must be independent booleans`);
  return structuredClone(flags);
}

function validateLicense(asset, label) {
  const classification = String(asset.license?.classification || '').toLowerCase();
  if (DENIED_LICENSES.has(classification) || /(?:-nc|-nd|noncommercial|no-derivatives)/u.test(classification)) {
    if (asset.sourceUseStatus !== 'denied') fail(`${label} NC/ND/unknown/usage-conditions license must be denied`);
    return 'denied';
  }
  if (CONDITIONAL_LICENSES.has(classification)) {
    if (asset.sourceUseStatus !== 'conditional' || asset.license?.shareAlikeReview?.approved !== true) fail(`${label} CC BY-SA requires approved share-alike review`);
    return 'conditional';
  }
  if (!AUTO_LICENSES.has(classification) && asset.license?.writtenClearance?.approved !== true) fail(`${label} license is not admitted or cleared`);
  if (asset.sourceUseStatus === 'denied') return 'denied';
  return asset.sourceUseStatus;
}

function validateProviderStatus(asset, label) {
  if (!REAL_MEDIA_PROVIDER_INPUT_STATUSES.includes(asset.providerInputStatus)) fail(`${label} providerInputStatus is invalid`);
  if (asset.providerInputStatus === 'admitted') {
    const gate = asset.providerInputGate;
    if (!object(gate) || gate.approved !== true || gate.aiProcessingRights !== true || gate.retentionRights !== true || gate.trainingRights !== true || !gate.termsVersion || !gate.settingsProofSha256 || !SHA256.test(gate.settingsProofSha256)) fail(`${label} provider input lacks explicit AI processing/retention/training rights and versioned settings proof`);
  }
}

export function validateDomesticOriginEvidence(asset, label = 'realMediaAsset') {
  const domestic = asset.evidence?.domesticOrigin;
  exactFields(domestic, ['originCountry', 'captureCountry', 'rightsholderCountry', 'institution', 'verificationBasis', 'detailPageSha256'], `${label}.evidence.domesticOrigin`);
  if (domestic.originCountry !== 'KR' || domestic.captureCountry !== 'KR' || domestic.rightsholderCountry !== 'KR') fail(`${label} is not Korean-origin, Korean-captured, and Korean-rightsholder media`);
  if (!domestic.institution || !domestic.verificationBasis || !SHA256.test(String(domestic.detailPageSha256 || ''))) fail(`${label} domestic origin evidence is incomplete`);
  if (!DOMESTIC_PROVIDERS.has(String(asset.evidence?.provider || '').toLowerCase())) fail(`${label} provider is not an admitted Korean source route`);
  return structuredClone(domestic);
}

function validateAsset(asset, index, options = {}) {
  const label = `realMediaAdmission.assets[${index}]`;
  if (!object(asset) || !ID.test(String(asset.assetId || ''))) fail(`${label} assetId is invalid`);
  if (!REAL_MEDIA_SOURCE_USE_STATUSES.includes(asset.sourceUseStatus)) fail(`${label} sourceUseStatus is invalid`);
  validateProviderStatus(asset, label);
  exactFields(asset.evidence, ['itemUrl', 'originUrl', 'rightsUrl', 'exactRightsStatement', 'licenseUri', 'licenseVersion', 'provider', 'query', 'retrievedAt', 'responseSha256', 'sourceSha256'], `${label}.evidence`);
  for (const key of ['itemUrl', 'originUrl', 'rightsUrl']) { try { new URL(asset.evidence[key]); } catch { fail(`${label}.evidence.${key} is not an absolute URL`); } }
  for (const key of ['responseSha256', 'sourceSha256']) if (!SHA256.test(String(asset.evidence[key] || ''))) fail(`${label}.evidence.${key} is invalid`);
  if (!asset.evidence.exactRightsStatement || !asset.evidence.licenseUri || !asset.evidence.licenseVersion || !asset.evidence.provider || !asset.evidence.query || !Number.isFinite(Date.parse(asset.evidence.retrievedAt))) fail(`${label} rights evidence is incomplete`);
  const provider = String(asset.evidence.provider).toLowerCase();
  if (AGGREGATORS.has(provider) && new URL(asset.evidence.itemUrl).hostname === new URL(asset.evidence.originUrl).hostname) fail(`${label} aggregator is discovery-only and needs an origin item`);
  const flags = validateFlags(asset.flags, `${label}.flags`);
  if (asset.phash !== undefined && !/^[0-9a-f]{16,128}$/u.test(String(asset.phash))) fail(`${label} pHash is invalid`);
  validateLicense(asset, label);
  exactFields(asset.original, ['relativePath', 'realpath', 'bytes', 'sha256', 'width', 'height', 'preserved'], `${label}.original`);
  if (!asset.original.relativePath || !path.isAbsolute(asset.original.realpath) || !Number.isSafeInteger(asset.original.bytes) || asset.original.bytes <= 0 || !SHA256.test(String(asset.original.sha256 || '')) || !Number.isInteger(asset.original.width) || asset.original.width < 1 || !Number.isInteger(asset.original.height) || asset.original.height < 1 || asset.original.preserved !== true) fail(`${label} original file authority is incomplete`);
  exactFields(asset.derivative, ['relativePath', 'realpath', 'bytes', 'sha256', 'width', 'height', 'filter', 'generativeAltered'], `${label}.derivative`);
  if (!asset.derivative.relativePath || !path.isAbsolute(asset.derivative.realpath) || !Number.isSafeInteger(asset.derivative.bytes) || asset.derivative.bytes <= 0 || !SHA256.test(String(asset.derivative.sha256 || '')) || asset.derivative.filter !== 'lanczos' || typeof asset.derivative.generativeAltered !== 'boolean') fail(`${label} Lanczos derivative authority is incomplete`);
  if (!['element', 'full-frame'].includes(asset.usageMode) || !Number.isInteger(asset.requestedDisplayPixels) || asset.requestedDisplayPixels < 1) fail(`${label} usageMode/display pixels are invalid`);
  const sourceEdge = asset.usageMode === 'full-frame' ? Math.min(asset.original.width, asset.original.height) : Math.max(asset.original.width, asset.original.height);
  const factor = Number((asset.requestedDisplayPixels / sourceEdge).toFixed(6));
  if (!Number.isFinite(asset.upscaleFactor) || Math.abs(asset.upscaleFactor - factor) > 0.000001) fail(`${label} upscaleFactor is stale`);
  if (factor > 1.5 && factor <= 2 && asset.visualQa?.approved !== true) fail(`${label} >1.5x upscale requires human visual QA`);
  if (factor > 2 && (asset.visualQa?.approved !== true || asset.visualQa?.separateHighUpscaleReview !== true)) fail(`${label} >2x upscale requires separate human visual QA`);
  if (factor > 2 && (asset.detailClaims?.evidenceText === true || asset.detailClaims?.identity === true || asset.detailClaims?.trademark === true)) fail(`${label} >2x derivative cannot establish evidence text, identity, or trademark detail`);
  if ((asset.aiUpscaled === true || asset.derivative.generativeAltered === true) && asset.coverageEligible === true) fail(`${label} generative-altered assets cannot count as real-photo coverage`);
  if (flags.geographicMismatch && asset.coverageEligible === true) fail(`${label} geographic mismatch cannot count as current-case coverage`);
  if (flags.casePartyImplication && asset.usageLabel !== 'unrelated illustrative photo') fail(`${label} possible case-party implication requires an unrelated-photo label`);
  if (flags.trademarkLogo && asset.localTransform?.maskOrBlur !== true) fail(`${label} trademark/logo use requires local crop, mask, or blur`);
  if ((flags.recognizablePerson || flags.minor || flags.sensitiveParty || flags.privacyPublicity) && asset.humanRightsQa?.approved !== true && asset.sourceUseStatus !== 'denied') fail(`${label} depicted-person/privacy use requires case-specific human rights QA`);
  if (options.domesticOnly) validateDomesticOriginEvidence(asset, label);
  return { ...structuredClone(asset), flags, calculatedUpscaleFactor: factor };
}

export function normalizeRealMediaRoute({ needs, admission, semanticCutPlan, cutDurations }) {
  if (!object(needs) || needs.schema !== REAL_MEDIA_NEEDS_SCHEMA || !Array.isArray(needs.cuts)) fail('Approved real-media needs artifact is required after sealed semantic cuts');
  const needsAuthorities = { semanticCutPlanSha256: semanticCutPlan?.approval?.sha256, storylineSha256: semanticCutPlan?.authorities?.storylineSha256 };
  if (stableStringify(needs.authorities) !== stableStringify(needsAuthorities)) fail('Real-media needs authority is stale');
  if (needs.cuts.length !== semanticCutPlan.cuts.length) fail('Real-media needs must classify every sealed cut');
  const normalizedNeedsCuts = needs.cuts.map((cut, index) => {
    const sealed = semanticCutPlan.cuts[index];
    if (!object(cut) || cut.cutId !== sealed.cutId || !REAL_MEDIA_SOURCE_CLASSES.includes(cut.sourceClass) || !['element', 'full-frame'].includes(cut.usageMode) || !Number.isInteger(cut.requestedDisplayPixels) || cut.requestedDisplayPixels < 1) fail(`realMediaNeeds.cuts[${index}] is invalid`);
    return structuredClone(cut);
  });
  approved(needs.approval, 'Real-media needs', hashRealMediaNeedsContent(needs));
  if (!object(admission) || admission.schema !== REAL_MEDIA_ADMISSION_SCHEMA || !Array.isArray(admission.assets) || !Array.isArray(admission.assignments)) fail('Approved real-media acquisition admission is required before boards');
  const admissionAuthorities = { semanticCutPlanSha256: semanticCutPlan.approval.sha256, realMediaNeedsSha256: needs.approval.sha256 };
  if (stableStringify(admission.authorities) !== stableStringify(admissionAuthorities)) fail('Real-media admission authority is stale');
  const domesticOnly = admission.sourcePolicy?.domesticOnly === true;
  const assets = admission.assets.map((asset, index) => validateAsset(asset, index, { domesticOnly })); const byId = new Map(); const phashes = new Map();
  for (const asset of assets) { if (byId.has(asset.assetId)) fail(`Duplicate real-media asset ID ${asset.assetId}`); if (asset.phash && phashes.has(asset.phash)) fail(`Perceptual duplicate pHash ${asset.phash}`); if (asset.phash) phashes.set(asset.phash, asset.assetId); byId.set(asset.assetId, asset); }
  const assignments = new Map(); const usage = new Map(); const storyId = admission.storyId || semanticCutPlan.caseId || 'story';
  for (const assignment of admission.assignments) {
    if (!object(assignment) || !ID.test(String(assignment.cutId || '')) || !ID.test(String(assignment.assetId || '')) || !byId.has(assignment.assetId)) fail('Real-media assignment is invalid or duplicated');
    const key = `${assignment.storyId || storyId}:${assignment.cutId}`;
    if (assignments.has(key)) fail('Real-media assignment is invalid or duplicated');
    assignments.set(key, assignment.assetId);
    usage.set(assignment.assetId, (usage.get(assignment.assetId) || 0) + 1);
  }
  const maxReuse = Number(admission.diversity?.maxPrimaryReuse ?? 1);
  if (!Number.isInteger(maxReuse) || maxReuse < 1) fail('maxPrimaryReuse must be a positive integer');
  for (const [assetId, count] of usage) if (count > maxReuse && !(admission.diversity?.reuseReasons?.[assetId])) fail(`primary asset ${assetId} exceeds max reuse without continuity reason`);
  if (!Array.isArray(cutDurations) || cutDurations.length !== normalizedNeedsCuts.length || cutDurations.some((value) => !(value > 0))) fail('Locked authored cut timing is required for real-media admission');
  let realDuration = 0; const totalDuration = cutDurations.reduce((sum, value) => sum + value, 0);
  const cuts = normalizedNeedsCuts.map((need, index) => {
    if (need.sourceClass === 'grok-generated') {
      if (assignments.has(`${storyId}:${need.cutId}`)) fail(`Generated cut ${need.cutId} cannot bind a real-media asset`);
      return { ...need, assetId: null, durationSeconds: cutDurations[index], coverageEligible: false };
    }
    const assetId = assignments.get(`${storyId}:${need.cutId}`) ?? assignments.get(need.cutId); const asset = byId.get(assetId);
    if (!asset || asset.sourceUseStatus === 'denied' || asset.coverageEligible !== true || asset.derivative.generativeAltered === true || asset.aiUpscaled === true || asset.flags.geographicMismatch) fail(`Real-media cut ${need.cutId} lacks a coverage-eligible admitted asset`);
    if (asset.usageMode !== need.usageMode || asset.requestedDisplayPixels !== need.requestedDisplayPixels) fail(`Real-media cut ${need.cutId} use mode/display authority drifted`);
    realDuration += cutDurations[index];
    return { ...need, assetId, durationSeconds: cutDurations[index], coverageEligible: true };
  });
  const fraction = Number((realDuration / totalDuration).toFixed(6));
  const assignedAssets = cuts.filter((cut) => cut.coverageEligible).map((cut) => cut.assetId);
  const uniqueRatio = assignedAssets.length ? new Set(assignedAssets).size / assignedAssets.length : 1;
  const minimumUniqueRatio = Number(admission.diversity?.minimumUniquePrimaryRatio ?? 0);
  if (minimumUniqueRatio > 0 && uniqueRatio < minimumUniqueRatio) fail(`unique-primary ratio ${uniqueRatio.toFixed(6)} is below ${minimumUniqueRatio}`);
  const coverage = { schema: REAL_MEDIA_COVERAGE_SCHEMA, realMediaDurationSeconds: Number(realDuration.toFixed(6)), totalActiveAuthoredDurationSeconds: Number(totalDuration.toFixed(6)), fraction, minimumFraction: 0.8, approved: fraction >= 0.8 };
  if (!object(admission.coverage) || stableStringify(admission.coverage) !== stableStringify(coverage) || coverage.approved !== true) fail(`Authoritative real-media duration coverage ${fraction} is below 0.80 or stale`);
  approved(admission.approval, 'Real-media admission', hashRealMediaAdmissionContent(admission));
  return { needs: { ...structuredClone(needs), cuts: normalizedNeedsCuts }, admission: structuredClone(admission), assets, cuts, coverage };
}

export async function verifyRealMediaFiles({ assets, projectRoot }) {
  const root = path.resolve(projectRoot); const rootPrefix = `${root}${path.sep}`;
  for (const asset of assets) for (const field of ['original', 'derivative']) {
    const record = asset[field]; const resolved = path.resolve(root, record.relativePath); const real = await fs.realpath(resolved); const stat = await fs.lstat(resolved);
    if (!resolved.startsWith(rootPrefix) || real !== resolved || real !== path.resolve(record.realpath) || !stat.isFile() || stat.isSymbolicLink()) fail(`${asset.assetId}.${field} is not a contained physical nonsymlink file`);
    const bytes = await fs.readFile(resolved); const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== record.bytes || sha256 !== record.sha256) fail(`${asset.assetId}.${field} bytes/hash drifted`);
  }
  return true;
}
