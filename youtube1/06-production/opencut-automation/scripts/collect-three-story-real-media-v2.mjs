import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const legacyRoot = path.join(root, 'out', 'studies', 'three-story-real-media-acquisition-v1', 'collected');
const studyRoot = path.join(root, 'out', 'studies', 'three-story-real-media-acquisition-v2');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

async function physical(file) {
  const realpath = await fs.realpath(file); const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || realpath !== path.resolve(file)) throw new Error(`unsafe legacy evidence file: ${file}`);
  const bytes = await fs.readFile(file); return { realpath, bytes: bytes.length, sha256: sha(bytes) };
}

async function latestLegacyManifest() {
  const entries = (await fs.readdir(legacyRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  if (!entries.length) throw new Error('no legacy collected run exists');
  const file = path.join(legacyRoot, entries[0].name, 'manifest.json'); return { file, runDir: path.dirname(file), value: JSON.parse(await fs.readFile(file, 'utf8')) };
}

const dispositions = new Map([
  ['Coffeecup.jpg', { sourceUseStatus: 'admitted', usageMode: 'element', processing: ['lanczos-resize', 'crop'], coverageEligibility: 'requires-sealed-cut-assignment', reason: 'sub-480 is not an automatic rejection; preserve original and use only as an element' }],
  ['Cellphone (Unsplash).jpg', { sourceUseStatus: 'conditional', usageMode: 'element', processing: ['crop'], coverageEligibility: 'conditional-after-person-rights-qa', usageLabel: 'unrelated illustrative photo', reason: 'a visible hand is not a blanket rejection; do not imply the depicted person is a case party' }],
  ['Roundup Kanister B 2020 08.JPG', { sourceUseStatus: 'conditional', usageMode: 'element', processing: ['local-crop', 'mask-or-blur'], coverageEligibility: 'conditional-after-trademark-qa', usageLabel: 'unrelated illustrative photo', reason: 'local crop/mask/blur only; generative replacement would not count as a real photo' }],
  ["Women's Surgical Ward Nlm nlmuid-101435911.jpg", { sourceUseStatus: 'denied', usageMode: 'full-frame', processing: [], coverageEligibility: 'denied-current-case', reason: 'historic foreign ward has temporal and geographic mismatch and cannot evidence the current Korean case' }],
]);

export async function collectThreeStoryRealMediaV2() {
  const legacy = await latestLegacyManifest(); const legacyManifestBytes = await fs.readFile(legacy.file);
  const collectedRoot = path.join(studyRoot, 'collected'); await fs.mkdir(collectedRoot, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); const runDir = path.join(collectedRoot, `run-${stamp}-${crypto.randomBytes(3).toString('hex')}`); await fs.mkdir(runDir, { recursive: false });
  const entries = [];
  for (const old of [...legacy.value.actual, ...legacy.value.conditional]) {
    const disposition = dispositions.get(old.candidateTitle) || { sourceUseStatus: old.status === 'conditional' ? 'conditional' : 'admitted', usageMode: 'full-frame', processing: [], coverageEligibility: 'requires-sealed-cut-assignment', reason: 'legacy discovery retained; item rights and case binding still require admission' };
    const relative = old.files?.original || old.files?.conditionalOriginal; const original = relative ? await physical(path.join(legacy.runDir, relative)) : null; const response = old.files?.apiMetadata ? await physical(path.join(legacy.runDir, old.files.apiMetadata)) : null;
    entries.push({ assetId: old.assetId, candidateTitle: old.candidateTitle, storyBindings: old.storyBindings, sourceUseStatus: disposition.sourceUseStatus, providerInputStatus: 'denied', usageMode: disposition.usageMode, processing: disposition.processing, coverageEligibility: disposition.coverageEligibility, usageLabel: disposition.usageLabel || old.usageLabel || 'source photo', reason: disposition.reason, evidence: { provider: 'Wikimedia Commons', itemUrl: old.source?.descriptionUrl || old.metadata?.apiUrl || null, originUrl: old.source?.descriptionUrl || null, rightsUrl: old.license?.licenseUrl || old.metadata?.extmetadata?.LicenseUrl?.value || null, exactRightsStatement: old.license?.licenseShortName || old.metadata?.extmetadata?.LicenseShortName?.value || old.license?.classification || null, licenseUri: old.license?.licenseUrl || old.metadata?.extmetadata?.LicenseUrl?.value || null, licenseVersion: old.metadata?.extmetadata?.LicenseShortName?.value || old.license?.classification || null, query: old.candidateTitle, retrievedAt: legacy.value.generatedAt, responseSha256: response?.sha256 || null, sourceSha256: original?.sha256 || null }, original, flags: { recognizablePerson: old.candidateTitle === 'Cellphone (Unsplash).jpg' || old.candidateTitle === "Women's Surgical Ward Nlm nlmuid-101435911.jpg", minor: false, sensitiveParty: false, privacyPublicity: old.candidateTitle === 'Cellphone (Unsplash).jpg', trademarkLogo: old.candidateTitle === 'Roundup Kanister B 2020 08.JPG', artwork: false, property: false, geographicMismatch: old.candidateTitle === "Women's Surgical Ward Nlm nlmuid-101435911.jpg", casePartyImplication: old.candidateTitle === 'Cellphone (Unsplash).jpg' } });
  }
  const manifest = { schema: 'three-story-real-media-acquisition-v2', generatedAt: new Date().toISOString(), predecessor: { schema: legacy.value.schema, manifestRealpath: legacy.file, bytes: legacyManifestBytes.length, sha256: sha(legacyManifestBytes) }, policy: { authoritativeCoverage: 'sum admitted real-media cut authored durations / total active authored duration >= 0.80', approvalRequiresLockedTimingAndSealedCutPlan: true, providerInputIndependent: true, providerInputDefault: 'denied', productionContinuationAuthorized: false }, legacyProvisionalCoverage: { authority: false, basis: 'beat-count-only', values: { '01-police-father': '80%', '02-jeju-school-intrusion': '80%', '03-nurse-pesticide-coffee': '90%' } }, authoritativeCoverage: { approved: false, reason: 'no locked narration timing or sealed semantic cut plan was supplied to this acquisition study' }, entries, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  const manifestPath = path.join(runDir, 'manifest.json'); await fs.writeFile(manifestPath, json(manifest), { flag: 'wx' });
  return { manifestPath, manifestSha256: sha(await fs.readFile(manifestPath)), entries: entries.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collectThreeStoryRealMediaV2().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
