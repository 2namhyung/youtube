import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function newestRun() {
  const base = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v1');
  const dirs = (await fs.readdir(base, {withFileTypes: true})).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  for (const dir of dirs) {
    const candidate = path.join(base, dir.name, 'manifest.json');
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error('no complete Gongu domestic run');
}

export async function verify(manifestArg) {
  const manifestPath = manifestArg ? path.resolve(manifestArg) : await newestRun();
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 'gongu-domestic-photo-expansion-v1') throw new Error('schema mismatch');
  if (manifest.policy.domesticOnly !== true || manifest.policy.admission !== false) throw new Error('policy mismatch');
  if (Object.values(manifest.production).some(Boolean)) throw new Error('production authority unexpectedly enabled');
  const composite = new Set(); const sourceSha = new Set(); const phashes = new Set();
  for (const asset of manifest.assets) {
    const key = `${asset.storyId}:${asset.cutId}`;
    if (composite.has(key)) throw new Error(`duplicate composite assignment ${key}`); composite.add(key);
    if (asset.license.code !== 'CC-BY-4.0' || !asset.license.url.startsWith('https://creativecommons.org/licenses/by/4.0/')) throw new Error(`license mismatch ${asset.assetId}`);
    if (asset.sourceUseStatus !== 'conditional' || asset.providerInputStatus !== 'denied') throw new Error(`gate mismatch ${asset.assetId}`);
    if (asset.visualQa.reviewed || asset.visualQa.semanticPass) throw new Error(`unreviewed asset falsely passed ${asset.assetId}`);
    const original = path.resolve(root, asset.original.relativePath); const rights = path.resolve(root, asset.evidence.rightsRelativePath);
    for (const file of [original, rights]) {
      const real = await fs.realpath(file); const stat = await fs.lstat(file);
      if (real !== file || !real.startsWith(`${root}${path.sep}`) || !stat.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe physical file ${file}`);
    }
    const bytes = await fs.readFile(original); const page = await fs.readFile(rights);
    if (sha(bytes) !== asset.original.sha256 || bytes.length !== asset.original.bytes) throw new Error(`original mismatch ${asset.assetId}`);
    if (sha(page) !== asset.evidence.itemPageSha256 || page.length !== asset.evidence.itemPageBytes) throw new Error(`rights mismatch ${asset.assetId}`);
    if (!page.toString('utf8').includes('CC BY') || !page.toString('utf8').includes(asset.creator)) throw new Error(`rights evidence incomplete ${asset.assetId}`);
    if (sourceSha.has(asset.original.sha256) || phashes.has(asset.phash)) throw new Error(`duplicate image ${asset.assetId}`);
    sourceSha.add(asset.original.sha256); phashes.add(asset.phash);
  }
  if (manifest.counts.acquired !== manifest.assets.length || manifest.counts.rejected !== manifest.rejected.length || manifest.counts.uniquePrimary !== sourceSha.size) throw new Error('count mismatch');
  const result = {ok: true, manifestPath, manifestSha256: sha(await fs.readFile(manifestPath)), assets: manifest.assets.length, rejected: manifest.rejected.length, visuallyApproved: 0};
  await fs.writeFile(path.join(path.dirname(manifestPath), 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

await verify(process.argv[2]);
