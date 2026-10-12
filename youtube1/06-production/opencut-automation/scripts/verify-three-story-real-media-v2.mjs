import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..'); const study = path.join(root, 'out', 'studies', 'three-story-real-media-acquisition-v2', 'collected'); const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export async function verifyThreeStoryRealMediaV2() {
  const runs = (await fs.readdir(study, { withFileTypes: true })).filter((item) => item.isDirectory() && item.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name)); assert.ok(runs.length, 'successor run missing'); const manifestPath = path.join(study, runs[0].name, 'manifest.json'); const bytes = await fs.readFile(manifestPath); const manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'three-story-real-media-acquisition-v2'); assert.equal(manifest.authoritativeCoverage.approved, false); assert.equal(manifest.policy.approvalRequiresLockedTimingAndSealedCutPlan, true); assert.equal(manifest.policy.providerInputIndependent, true); assert.equal(manifest.policy.productionContinuationAuthorized, false);
  assert.deepEqual(manifest.legacyProvisionalCoverage.values, { '01-police-father': '80%', '02-jeju-school-intrusion': '80%', '03-nurse-pesticide-coffee': '90%' }); assert.equal(manifest.legacyProvisionalCoverage.authority, false);
  const byTitle = new Map(manifest.entries.map((entry) => [entry.candidateTitle, entry]));
  assert.equal(byTitle.get('Coffeecup.jpg').sourceUseStatus, 'admitted'); assert.equal(byTitle.get('Coffeecup.jpg').usageMode, 'element');
  assert.equal(byTitle.get('Cellphone (Unsplash).jpg').sourceUseStatus, 'conditional'); assert.equal(byTitle.get('Cellphone (Unsplash).jpg').usageLabel, 'unrelated illustrative photo');
  assert.deepEqual(byTitle.get('Roundup Kanister B 2020 08.JPG').processing, ['local-crop', 'mask-or-blur']); assert.match(byTitle.get('Roundup Kanister B 2020 08.JPG').coverageEligibility, /conditional/u);
  assert.equal(byTitle.get("Women's Surgical Ward Nlm nlmuid-101435911.jpg").coverageEligibility, 'denied-current-case'); assert.ok(manifest.entries.every((entry) => entry.providerInputStatus === 'denied'));
  for (const entry of manifest.entries.filter((item) => item.original)) { const fileBytes = await fs.readFile(entry.original.realpath); assert.equal(fileBytes.length, entry.original.bytes); assert.equal(sha(fileBytes), entry.original.sha256); const stat = await fs.lstat(entry.original.realpath); assert.ok(stat.isFile() && !stat.isSymbolicLink()); }
  return { ok: true, manifestPath, manifestSha256: sha(bytes), entries: manifest.entries.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyThreeStoryRealMediaV2().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
