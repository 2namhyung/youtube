import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDomesticOriginEvidence } from './newsroom-real-media-admission.mjs';

const root = path.resolve(import.meta.dirname, '..');
const acquisitionRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v3-domestic-only');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const latest = async () => path.join(acquisitionRoot, (await fs.readdir(acquisitionRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name))[0].name);
const dimensions = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' })).streams?.[0];

export async function verifyDomesticAcquisitionV3(manifestArg = process.argv[2]) {
  const runDir = manifestArg ? path.dirname(path.resolve(manifestArg)) : await latest(); const manifestPath = manifestArg ? path.resolve(manifestArg) : path.join(runDir, 'manifest.json');
  const manifestBytes = await fs.readFile(manifestPath); const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'newsroom-real-media-acquisition-v3-domestic-only'); assert.equal(manifest.policy.domesticOnly, true); assert.equal(manifest.policy.originCountry, 'KR'); assert.equal(manifest.policy.captureCountry, 'KR'); assert.equal(manifest.counts.requested, 46); assert.equal(manifest.counts.acquired + manifest.counts.remaining, 46);
  const keys = new Set(); const sourceHashes = new Set(); const phashes = new Set();
  for (const asset of manifest.assets) {
    const key = `${asset.storyId}:${asset.cutId}`; assert.ok(!keys.has(key), `duplicate cut ${key}`); keys.add(key);
    assert.equal(asset.license.classification, 'kogl-1'); assert.ok(['admitted', 'conditional'].includes(asset.sourceUseStatus)); assert.equal(asset.providerInputStatus, 'denied'); if (asset.sourceUseStatus === 'conditional') { assert.equal(asset.coverageEligible, false); assert.equal(asset.semanticReview?.approved, false); } else { assert.equal(asset.coverageEligible, true); assert.equal(asset.semanticReview?.approved, true); } validateDomesticOriginEvidence(asset, asset.assetId);
    assert.equal(new URL(asset.evidence.itemUrl).hostname, 'www.kogl.or.kr'); assert.equal(new URL(asset.evidence.originUrl).hostname, 'www.kogl.or.kr');
    const file = path.resolve(root, asset.original.relativePath); assert.ok(file.startsWith(`${root}${path.sep}`)); const stat = await fs.lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(await fs.realpath(file), file);
    const bytes = await fs.readFile(file); assert.equal(bytes.length, asset.original.bytes); assert.equal(sha(bytes), asset.original.sha256); assert.ok(!sourceHashes.has(asset.original.sha256)); sourceHashes.add(asset.original.sha256); assert.ok(!phashes.has(asset.phash)); phashes.add(asset.phash);
    const decoded = dimensions(file); assert.equal(decoded.width, asset.original.width); assert.equal(decoded.height, asset.original.height); assert.ok(Math.min(decoded.width, decoded.height) >= 480);
  }
  assert.equal(sourceHashes.size, manifest.assets.length); assert.ok(Object.values(manifest.production).every((value) => value === false));
  const report = { schema: 'newsroom-real-media-acquisition-v3-domestic-only-verifier', verifiedAt: new Date().toISOString(), manifestSha256: sha(manifestBytes), domesticAssetsVerified: manifest.assets.length, exactNeedCandidates: manifest.assets.filter((asset) => asset.sourceUseStatus === 'admitted').length, conditionalStoryContextCandidates: manifest.assets.filter((asset) => asset.sourceUseStatus === 'conditional').length, requested: 46, remaining: manifest.counts.remaining, complete: manifest.counts.remaining === 0 && manifest.assets.every((asset) => asset.coverageEligible), admissionAuthorized: false, production: manifest.production, verified: true };
  const reportPath = path.join(runDir, 'acquisition-verifier.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); return { runDir, reportPath, ...report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyDomesticAcquisitionV3().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
