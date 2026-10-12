import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {temporalErrors, MODERN_MIN_YEAR} from './newsroom-real-media-temporal.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const physical = async file => { const st = await fs.lstat(file); const real = await fs.realpath(file); if (!st.isFile() || st.isSymbolicLink() || real !== path.resolve(file)) throw new Error(`unsafe-file:${file}`); return {bytes: st.size, sha256: sha(await fs.readFile(file))}; };

export async function verify(runDir) {
  const manifestPath = path.join(runDir, 'manifest.json'); const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 'gongu-domestic-photo-modern-v1') throw new Error('schema');
  if (manifest.policy.modernMinYear !== MODERN_MIN_YEAR) throw new Error('modern-min-year');
  if (manifest.policy.domesticOnly !== true || manifest.policy.providerInputDefault !== 'denied') throw new Error('policy');
  if (manifest.production.provider || manifest.production.render || manifest.production.upload || manifest.production.publication || manifest.production.stage07) throw new Error('production-side-effect');
  if (manifest.counts.acquired < 6) throw new Error(`acquired<6:${manifest.counts.acquired}`);
  if (!Array.isArray(manifest.temporalNeeds) || manifest.temporalNeeds.length !== manifest.assets.length) throw new Error('temporal-needs-count');
  const seenSha = new Set(); const seenPHash = new Set(); const keys = new Set();
  for (const asset of manifest.assets) {
    const key = `${asset.storyId}:${asset.cutId}`; if (keys.has(key)) throw new Error(`duplicate-assignment:${key}`); keys.add(key);
    if (asset.providerInputStatus !== 'denied' || asset.coverageEligible !== false) throw new Error(`eligibility:${asset.assetId}`);
    if (asset.license?.code !== 'CC-BY-4.0') throw new Error(`license:${asset.assetId}`);
    if (!asset.evidence?.itemUrl || !asset.evidence?.downloadUrl || !asset.evidence?.itemPageSha256 || !asset.evidence?.sourceSha256) throw new Error(`evidence:${asset.assetId}`);
    const temporal = temporalErrors(asset, {temporalRule: asset.temporalRule}); if (temporal.length) throw new Error(`temporal:${asset.assetId}:${temporal.join(',')}`);
    const need = manifest.temporalNeeds.find(x => x.storyId === asset.storyId && x.cutId === asset.cutId); if (!need || temporalErrors(need, {temporalRule: need.temporalRule}).filter(x => !['unknown-date-cannot-be-approved'].includes(x)).length) throw new Error(`temporal-need:${key}`);
    const original = path.resolve(root, asset.original.relativePath); const rights = path.resolve(root, asset.evidence.rightsRelativePath); const ob = await physical(original); const rb = await physical(rights);
    if (ob.sha256 !== asset.original.sha256 || ob.sha256 !== asset.evidence.sourceSha256 || ob.bytes !== asset.original.bytes) throw new Error(`original-binding:${asset.assetId}`);
    if (sha(await fs.readFile(rights)) !== asset.evidence.itemPageSha256 || rb.bytes !== asset.evidence.itemPageBytes) throw new Error(`rights-binding:${asset.assetId}`);
    const html = await fs.readFile(rights, 'utf8'); if (!html.includes('CC BY') || !html.includes('창작년도')) throw new Error(`rights-text:${asset.assetId}`);
    if (seenSha.has(ob.sha256) || seenPHash.has(asset.phash)) throw new Error(`duplicate-media:${asset.assetId}`); seenSha.add(ob.sha256); seenPHash.add(asset.phash);
  }
  const review = JSON.parse(await fs.readFile(path.join(runDir, 'visual-review.json'), 'utf8')); if (review.assets.length !== manifest.assets.length) throw new Error('review-count');
  const byId = new Map(review.assets.map(x => [x.assetId, x])); for (const a of manifest.assets) { const r = byId.get(a.assetId); if (!r || r.decision !== a.sourceUseStatus) throw new Error(`review-binding:${a.assetId}`); }
  const counts = {approved: review.assets.filter(x => x.decision === 'approved').length, conditional: review.assets.filter(x => x.decision === 'conditional').length, rejected: review.assets.filter(x => x.decision === 'rejected').length};
  if (JSON.stringify(counts) !== JSON.stringify(review.counts)) throw new Error('review-counts');
  const contactMeta = JSON.parse(await fs.readFile(path.join(runDir, 'contact-sheet.json'), 'utf8')); const contact = await physical(path.join(runDir, contactMeta.file)); if (contact.sha256 !== contactMeta.sha256 || contact.bytes !== contactMeta.bytes) throw new Error('contact-sheet-binding');
  return {ok: true, runDir, manifestSha256: sha(await fs.readFile(manifestPath)), contactSheetSha256: contact.sha256, counts: {...manifest.counts, visualApproved: counts.approved, visualRejected: counts.rejected}};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2]; if (!run) throw new Error('usage: node verify-gongu-domestic-photo-modern-v1.mjs <runDir>');
  verify(path.resolve(run)).then(x => process.stdout.write(`${JSON.stringify(x, null, 2)}\n`)).catch(e => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });
}
