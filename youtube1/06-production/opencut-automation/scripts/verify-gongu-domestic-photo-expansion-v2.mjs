import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
async function newestRun() {
  const base = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v2');
  const dirs = (await fs.readdir(base, {withFileTypes: true})).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  for (const dir of dirs) { const candidate = path.join(base, dir.name, 'manifest.json'); try { await fs.access(candidate); return candidate; } catch {} }
  throw new Error('no complete Gongu v2 run');
}
export async function verify(manifestArg) {
  const manifestPath = manifestArg ? path.resolve(manifestArg) : await newestRun();
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 'gongu-domestic-photo-expansion-v2') throw new Error('schema mismatch');
  if (manifest.policy.domesticOnly !== true || manifest.policy.admission !== false) throw new Error('policy mismatch');
  if (Object.values(manifest.production).some(Boolean)) throw new Error('production authority unexpectedly enabled');
  const composites = new Set(); const sourceSha = new Set(); const phashes = new Set();
  for (const asset of manifest.assets) {
    const key = `${asset.storyId}:${asset.cutId}`; if (composites.has(key)) throw new Error(`duplicate composite ${key}`); composites.add(key);
    if (asset.license.code !== 'CC-BY-4.0' || asset.providerInputStatus !== 'denied' || asset.coverageEligible !== false) throw new Error(`gate mismatch ${asset.assetId}`);
    if (asset.semanticReview.approved || asset.semanticReview.status !== 'pending-human-visual-qa') throw new Error(`review state mismatch ${asset.assetId}`);
    const original = path.resolve(root, asset.original.relativePath); const rights = path.resolve(root, asset.evidence.rightsRelativePath);
    for (const file of [original, rights]) { const real = await fs.realpath(file); const stat = await fs.lstat(file); if (real !== file || !real.startsWith(`${root}${path.sep}`) || !stat.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe physical file ${file}`); }
    const bytes = await fs.readFile(original); const page = await fs.readFile(rights);
    if (sha(bytes) !== asset.original.sha256 || bytes.length !== asset.original.bytes || sha(page) !== asset.evidence.itemPageSha256 || page.length !== asset.evidence.itemPageBytes) throw new Error(`hash mismatch ${asset.assetId}`);
    if (!page.toString('utf8').includes('CC BY') || !page.toString('utf8').includes('공유저작물 다운로드')) throw new Error(`rights evidence incomplete ${asset.assetId}`);
    if (sourceSha.has(asset.original.sha256) || phashes.has(asset.phash)) throw new Error(`duplicate image ${asset.assetId}`);
    sourceSha.add(asset.original.sha256); phashes.add(asset.phash);
  }
  if (manifest.counts.acquired !== manifest.assets.length || manifest.counts.rejected !== manifest.rejected.length || manifest.counts.uniquePrimary !== sourceSha.size) throw new Error('count mismatch');
  const manifestBytes = await fs.readFile(manifestPath);
  const runDir = path.dirname(manifestPath);
  const visualPath = path.join(runDir, 'visual-review.json');
  const visualReview = JSON.parse(await fs.readFile(visualPath, 'utf8'));
  if (!['gongu-domestic-photo-visual-review-v2', 'gongu-domestic-photo-visual-review-v3'].includes(visualReview.schema)) throw new Error('visual-review schema mismatch');
  const manifestHash = sha(manifestBytes);
  if (visualReview.manifestSha256 !== manifestHash || visualReview.acquisitionManifest !== 'manifest.json') throw new Error('visual-review manifest binding mismatch');
  const contactPath = path.resolve(runDir, visualReview.contactSheet);
  const contactStat = await fs.lstat(contactPath);
  const contactReal = await fs.realpath(contactPath);
  if (contactReal !== contactPath || !contactStat.isFile() || contactStat.isSymbolicLink()) throw new Error('unsafe contact sheet');
  const contactHash = sha(await fs.readFile(contactPath));
  if (visualReview.contactSheetSha256 !== contactHash) throw new Error('visual-review contact-sheet hash mismatch');
  if (!Array.isArray(visualReview.reviews) || visualReview.reviews.length !== manifest.assets.length) throw new Error('visual-review count mismatch');
  const assetKeys = new Set(manifest.assets.map((asset) => `${asset.assetId}|${asset.storyId}|${asset.cutId}`));
  const reviewKeys = new Set();
  for (const review of visualReview.reviews) {
    const key = `${review.assetId}|${review.storyId}|${review.cutId}`;
    if (reviewKeys.has(key) || !assetKeys.has(key) || !['approved', 'conditional', 'rejected'].includes(review.decision)) throw new Error(`visual-review binding mismatch ${key}`);
    reviewKeys.add(key);
  }
  const expectedCounts = {reviewed: visualReview.reviews.length, approved: visualReview.reviews.filter((review) => review.decision === 'approved').length, conditional: visualReview.reviews.filter((review) => review.decision === 'conditional').length, rejected: visualReview.reviews.filter((review) => review.decision === 'rejected').length};
  if (JSON.stringify(visualReview.counts) !== JSON.stringify(expectedCounts)) throw new Error('visual-review decision counts mismatch');
  const result = {ok: true, manifestPath, manifestSha256: manifestHash, visualReviewPath: visualPath, visualReviewSha256: sha(await fs.readFile(visualPath)), contactSheetPath: contactPath, contactSheetSha256: contactHash, assets: manifest.assets.length, rejected: manifest.rejected.length, visualReviewCounts: expectedCounts, providerInputDenied: manifest.assets.every((asset) => asset.providerInputStatus === 'denied')};
  await fs.writeFile(path.join(path.dirname(manifestPath), 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
await verify(process.argv[2]);
