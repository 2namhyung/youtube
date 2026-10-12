import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashRealMediaAdmissionContent, hashRealMediaNeedsContent, normalizeRealMediaRoute, verifyRealMediaFiles } from './newsroom-real-media-admission.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const approval = (artifact, hasher) => { artifact.approval = { approved: true, status: 'admitted', sha256: hasher(artifact) }; return artifact; };
const semanticCutPlan = { schema: 'newsroom-semantic-cut-plan-v2', authorities: { storylineSha256: 'a'.repeat(64) }, approval: { approved: true, status: 'admitted', sha256: 'b'.repeat(64) }, cuts: Array.from({ length: 5 }, (_, i) => ({ cutId: `cut-00${i + 1}`, spanBindings: [], durationIntent: {} })) };
const needs = approval({ schema: 'newsroom-real-media-needs-v1', authorities: { semanticCutPlanSha256: 'b'.repeat(64), storylineSha256: 'a'.repeat(64) }, cuts: Array.from({ length: 5 }, (_, i) => ({ cutId: `cut-00${i + 1}`, sourceClass: i < 4 ? ['actual-case-evidence', 'institutional-context', 'generic-stock', 'generic-stock'][i] : 'grok-generated', usageMode: i === 0 ? 'element' : 'full-frame', requestedDisplayPixels: i === 0 ? 480 : 720 })) }, hashRealMediaNeedsContent);
const flags = { recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: false, geographicMismatch: false, casePartyImplication: false };
const asset = (index) => ({
  assetId: `photo-${index}`, sourceUseStatus: 'admitted', providerInputStatus: 'denied', providerInputGate: null, coverageEligible: true,
  evidence: { itemUrl: `https://commons.wikimedia.org/wiki/File:Photo-${index}.jpg`, originUrl: `https://commons.wikimedia.org/wiki/File:Photo-${index}.jpg`, rightsUrl: 'https://creativecommons.org/licenses/by/4.0/', exactRightsStatement: 'CC BY 4.0', licenseUri: 'https://creativecommons.org/licenses/by/4.0/', licenseVersion: '4.0', provider: 'wikimedia-commons', query: `Photo ${index}`, retrievedAt: '2026-08-15T00:00:00.000Z', responseSha256: String(index).repeat(64), sourceSha256: String(index + 1).repeat(64) },
  license: { classification: 'cc-by' }, flags: { ...flags }, usageLabel: 'source photo', usageMode: index === 1 ? 'element' : 'full-frame', requestedDisplayPixels: index === 1 ? 480 : 720, upscaleFactor: index === 1 ? 1.2 : 0.72,
  original: { relativePath: `originals/photo-${index}.jpg`, realpath: `C:\\study\\originals\\photo-${index}.jpg`, bytes: 10, sha256: String(index + 1).repeat(64), width: index === 1 ? 400 : 1000, height: index === 1 ? 300 : 1000, preserved: true },
  derivative: { relativePath: `derivatives/photo-${index}.png`, realpath: `C:\\study\\derivatives\\photo-${index}.png`, bytes: 12, sha256: String(index + 2).repeat(64), width: 720, height: 720, filter: 'lanczos', generativeAltered: false },
  aiUpscaled: false, visualQa: { approved: false, separateHighUpscaleReview: false }, humanRightsQa: { approved: false }, detailClaims: { evidenceText: false, identity: false, trademark: false }, localTransform: { maskOrBlur: false },
});
const admissionFor = (assets = [asset(1), asset(2), asset(3), asset(4)]) => {
  const value = { schema: 'newsroom-real-media-acquisition-admission-v1', authorities: { semanticCutPlanSha256: 'b'.repeat(64), realMediaNeedsSha256: needs.approval.sha256 }, assets, assignments: assets.map((item, i) => ({ cutId: `cut-00${i + 1}`, assetId: item.assetId })), coverage: { schema: 'newsroom-real-media-duration-coverage-v1', realMediaDurationSeconds: 8, totalActiveAuthoredDurationSeconds: 10, fraction: 0.8, minimumFraction: 0.8, approved: true } };
  return approval(value, hashRealMediaAdmissionContent);
};
const route = (admission = admissionFor(), needsValue = needs, durations = [2, 2, 2, 2, 2]) => normalizeRealMediaRoute({ needs: needsValue, admission, semanticCutPlan, cutDurations: durations });

assert.equal(route().coverage.fraction, 0.8, 'positive duration coverage');
assert.equal(route().assets[0].original.width, 400, 'sub-480 original is preserved and usable as an element');

const injectedCoverage = admissionFor(); injectedCoverage.coverage.fraction = 0.9; injectedCoverage.approval.sha256 = hashRealMediaAdmissionContent(injectedCoverage);
assert.throws(() => route(injectedCoverage), /coverage .* stale/u, 'injected coverage cannot replace duration recomputation');

const highUpscale = admissionFor(); highUpscale.assets[0].requestedDisplayPixels = 1000; highUpscale.assets[0].upscaleFactor = 2.5; highUpscale.assignments[0].assetId = highUpscale.assets[0].assetId; highUpscale.approval.sha256 = hashRealMediaAdmissionContent(highUpscale);
assert.throws(() => route(highUpscale), /separate human visual QA/u, '>2x without QA fails');

const aiUpscaled = admissionFor(); aiUpscaled.assets[0].aiUpscaled = true; aiUpscaled.approval.sha256 = hashRealMediaAdmissionContent(aiUpscaled);
assert.throws(() => route(aiUpscaled), /generative-altered assets cannot count/u, 'AI-upscaled asset cannot be injected into coverage');

const visibleHuman = admissionFor(); visibleHuman.assets[0].flags.recognizablePerson = true; visibleHuman.assets[0].humanRightsQa.approved = true; visibleHuman.approval.sha256 = hashRealMediaAdmissionContent(visibleHuman);
assert.doesNotThrow(() => route(visibleHuman), 'recognizable humans are not blanket rejected');

const geo = admissionFor(); geo.assets[0].flags.geographicMismatch = true; geo.approval.sha256 = hashRealMediaAdmissionContent(geo);
assert.throws(() => route(geo), /geographic mismatch/u);

const origin = admissionFor(); delete origin.assets[0].evidence.originUrl; origin.approval.sha256 = hashRealMediaAdmissionContent(origin);
assert.throws(() => route(origin), /missing originUrl/u);

const conflated = admissionFor(); delete conflated.assets[0].providerInputStatus; conflated.approval.sha256 = hashRealMediaAdmissionContent(conflated);
assert.throws(() => route(conflated), /providerInputStatus/u);

for (const classification of ['cc-by-nc', 'cc-by-nd']) {
  const denied = admissionFor(); denied.assets[0].license.classification = classification; denied.approval.sha256 = hashRealMediaAdmissionContent(denied);
  assert.throws(() => route(denied), /must be denied/u);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-media-hash-test-')); const originalDir = path.join(root, 'originals'); const derivativeDir = path.join(root, 'derivatives'); await fs.mkdir(originalDir); await fs.mkdir(derivativeDir);
const originalPath = path.join(originalDir, 'photo-1.jpg'); const derivativePath = path.join(derivativeDir, 'photo-1.png'); await fs.writeFile(originalPath, 'original'); await fs.writeFile(derivativePath, 'derivative');
const fileAsset = asset(1); fileAsset.original = { ...fileAsset.original, realpath: originalPath, bytes: 8, sha256: sha('original') }; fileAsset.derivative = { ...fileAsset.derivative, realpath: derivativePath, bytes: 10, sha256: sha('derivative') };
assert.equal(await verifyRealMediaFiles({ assets: [fileAsset], projectRoot: root }), true);
await fs.writeFile(originalPath, 'drifted');
await assert.rejects(() => verifyRealMediaFiles({ assets: [fileAsset], projectRoot: root }), /bytes\/hash drifted/u);

const reused = admissionFor(); reused.assignments[1].assetId = reused.assignments[0].assetId; reused.approval.sha256 = hashRealMediaAdmissionContent(reused); assert.throws(() => route(reused), /exceeds max reuse/u, 'primary reuse is bounded');
const perceptual = admissionFor(); perceptual.assets[0].phash = '0123456789abcdef'; perceptual.assets[1].phash = perceptual.assets[0].phash; perceptual.approval.sha256 = hashRealMediaAdmissionContent(perceptual); assert.throws(() => route(perceptual), /Perceptual duplicate pHash/u, 'pHash duplicate rejected');
const composite = admissionFor(); composite.assignments = composite.assignments.map((a) => ({ ...a, storyId: 'story-a' })); composite.assignments.push({ storyId: 'story-b', cutId: composite.assignments[0].cutId, assetId: composite.assets[0].assetId }); composite.approval.sha256 = hashRealMediaAdmissionContent(composite); assert.throws(() => route(composite), /exceeds max reuse/u, 'composite key still enforces reuse');
const foreignUnderDomesticPolicy = admissionFor(); foreignUnderDomesticPolicy.sourcePolicy = { domesticOnly: true, originCountry: 'KR', captureCountry: 'KR' }; foreignUnderDomesticPolicy.approval.sha256 = hashRealMediaAdmissionContent(foreignUnderDomesticPolicy); assert.throws(() => route(foreignUnderDomesticPolicy), /domesticOrigin/u, 'foreign/unknown-origin assets fail the domestic-only route');
const domestic = admissionFor(); domestic.sourcePolicy = { domesticOnly: true, originCountry: 'KR', captureCountry: 'KR' }; for (const item of domestic.assets) { item.evidence.provider = 'kogl-korea'; item.evidence.domesticOrigin = { originCountry: 'KR', captureCountry: 'KR', rightsholderCountry: 'KR', institution: '대한민국 공공기관', verificationBasis: 'item-level KOGL detail', detailPageSha256: 'f'.repeat(64) }; } domestic.approval.sha256 = hashRealMediaAdmissionContent(domestic); assert.doesNotThrow(() => route(domestic), 'item-level Korean origin/capture/rightsholder evidence passes the domestic gate');
const foreignCapture = structuredClone(domestic); foreignCapture.assets[0].evidence.domesticOrigin.captureCountry = 'US'; foreignCapture.approval.sha256 = hashRealMediaAdmissionContent(foreignCapture); assert.throws(() => route(foreignCapture), /not Korean-origin/u, 'Korean host cannot launder a foreign-captured photo');
assert.match(JSON.stringify(needs), /cut-001/u, 'sealed cut beat binding remains present');

process.stdout.write('newsroom-real-media-admission-tests passed\n');
