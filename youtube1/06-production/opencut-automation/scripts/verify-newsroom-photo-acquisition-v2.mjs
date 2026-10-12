import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const acquisitionRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v2');
const needsRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v2');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const latest = async (dir) => path.join(dir, (await fs.readdir(dir, {withFileTypes: true})).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name))[0].name);
const hamming = (a, b) => { let count = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) count += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/g) || []).length; return count + Math.abs(a.length - b.length) * 4; };
const dimensions = (file) => { const value = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8'})); return value.streams?.[0]; };

export async function verifyNewsroomPhotoAcquisitionV2(manifestArg = process.argv[2]) {
  const runDir = manifestArg ? path.dirname(path.resolve(manifestArg)) : await latest(acquisitionRoot);
  const manifestPath = manifestArg ? path.resolve(manifestArg) : path.join(runDir, 'manifest.json');
  const manifestBytes = await fs.readFile(manifestPath); const manifest = JSON.parse(manifestBytes);
  const needsDir = await latest(needsRoot); const needsBytes = await fs.readFile(path.join(needsDir, 'photo-needs.json')); const needs = JSON.parse(needsBytes);
  assert.equal(manifest.schema, 'newsroom-real-media-acquisition-v2'); assert.equal(manifest.counts.requested, 46); assert.equal(manifest.assets.length, 46); assert.equal(manifest.rejected.length, 0);
  const wanted = new Set(needs.cases.flatMap((story) => story.cuts.filter((cut) => cut.sourceClass !== 'grok-generated').map((cut) => `${story.storyId}:${cut.cutId}`)));
  const keys = new Set(); const shas = new Set(); const hashes = [];
  for (const asset of manifest.assets) {
    const key = `${asset.storyId}:${asset.cutId}`; assert.ok(wanted.has(key), `unknown cut ${key}`); assert.ok(!keys.has(key), `duplicate cut ${key}`); keys.add(key);
    assert.equal(asset.providerInputStatus, 'denied'); assert.ok(['admitted', 'conditional'].includes(asset.sourceUseStatus)); assert.ok(['cc0', 'public-domain', 'cc-by', 'cc-by-sa'].includes(asset.license.classification));
    if (asset.license.classification === 'cc-by-sa') { assert.equal(asset.sourceUseStatus, 'conditional'); assert.equal(asset.coverageEligible, false); }
    const file = path.resolve(root, asset.original.relativePath); const real = await fs.realpath(file); const stat = await fs.lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(real, file); assert.ok(file.startsWith(`${root}${path.sep}`));
    const bytes = await fs.readFile(file); assert.equal(bytes.length, asset.original.bytes); assert.equal(sha(bytes), asset.original.sha256); assert.ok(!shas.has(asset.original.sha256), `duplicate SHA ${asset.assetId}`); shas.add(asset.original.sha256);
    const decoded = dimensions(file); assert.ok(decoded?.width >= 480 && decoded?.height >= 480, `undersized ${asset.assetId}`); assert.equal(decoded.width, asset.original.width); assert.equal(decoded.height, asset.original.height);
    for (const prior of hashes) assert.ok(hamming(prior.phash, asset.phash) > manifest.policy.perceptualHammingThreshold, `pHash near duplicate ${prior.assetId}/${asset.assetId}`); hashes.push({assetId: asset.assetId, phash: asset.phash});
  }
  assert.deepEqual([...keys].sort(), [...wanted].sort()); assert.equal(shas.size, 46); assert.ok(Object.values(manifest.production).every((value) => value === false));
  const report = {schema: 'newsroom-real-media-acquisition-v2-verifier', verifiedAt: new Date().toISOString(), manifestSha256: sha(manifestBytes), photoNeedsSha256: sha(needsBytes), physicalFilesVerified: 46, uniqueCompositeKeys: 46, uniquePrimarySha256: 46, perceptualThreshold: manifest.policy.perceptualHammingThreshold, counts: {admitted: manifest.assets.filter((asset) => asset.sourceUseStatus === 'admitted').length, conditional: manifest.assets.filter((asset) => asset.sourceUseStatus === 'conditional').length}, production: manifest.production, verified: true};
  const reportPath = path.join(runDir, 'acquisition-verifier.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'}); return {runDir, reportPath, ...report};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyNewsroomPhotoAcquisitionV2().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
