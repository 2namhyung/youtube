import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const acq = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v2');
const candidatePath = path.join(root, 'out', 'studies', 'newsroom-real-media-curated-candidates-v1', 'run-20260815T064913Z-curated26', 'candidates.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hamming = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) n += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/g) || []).length; return n + Math.abs(a.length - b.length) * 4; };
const phash = (file) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']); let s = 0; for (const x of raw) s += x; const a = s / raw.length; let out = ''; for (let i = 0; i < raw.length; i += 4) { let n = 0; for (let j = 0; j < 4; j++) if (raw[i + j] >= a) n |= 1 << (3 - j); out += n.toString(16); } return out; };
const storyAlias = { 'police-father': 'research-6b1a8af9b4143acb', 'nurse-pesticide-coffee': 'research-657380fce7eaccc9' };
const files = [path.join(acq, 'run-20260815T065408Z-curated-b779b7', 'checkpoint.json'), path.join(acq, 'run-20260815T070949Z-curated-4c9c09', 'checkpoint.json')];
const candidate = JSON.parse(await fs.readFile(candidatePath));
const records = new Map((candidate.records || []).map((r) => [`${storyAlias[r.storyId] || r.storyId}:${r.cutId}`, r]));
const merged = new Map(); const rejects = [];
for (const file of files) {
  const cp = JSON.parse(await fs.readFile(file));
  for (const asset of cp.assets || []) {
    const canonicalStoryId = storyAlias[asset.storyId] || asset.storyId;
    const key = `${canonicalStoryId}:${asset.cutId}`; const existing = merged.get(key); if (existing) { if (existing.original.sha256 !== asset.original.sha256) rejects.push({ key, reason: 'composite-sha-conflict' }); continue; }
    const real = path.resolve(root, asset.original.relativePath); try { const bytes = await fs.readFile(real); const digest = sha(bytes); if (digest !== asset.original.sha256) throw new Error('source-sha-mismatch'); const hash = phash(real); merged.set(key, { ...asset, storyId: canonicalStoryId, phash: hash, original: { ...asset.original, realpath: real, bytes: bytes.length, sha256: digest, preserved: true } }); } catch (e) { rejects.push({ key, reason: e.message }); }
  }
}
const seenSha = new Map(); const seenHash = []; for (const [key, asset] of merged) { const prior = seenSha.get(asset.original.sha256); if (prior) { rejects.push({ key, reason: 'duplicate-source-sha', of: prior }); merged.delete(key); continue; } const near = seenHash.find((x) => hamming(x.phash, asset.phash) <= 8); if (near) { rejects.push({ key, reason: 'perceptual-near-duplicate', of: near.key }); merged.delete(key); continue; } seenSha.set(asset.original.sha256, key); seenHash.push({ key, phash: asset.phash }); if (!asset.assetId.startsWith('legacy-') && !asset.assetId.startsWith('commons-')) { const rec = records.get(key); if (!rec) rejects.push({ key, reason: 'missing-candidate-authority' }); else if (!String(asset.candidateTitle || '').toLowerCase().includes(String(rec.title || '').toLowerCase().slice(0, 20))) rejects.push({ key, reason: 'candidate-title-mismatch' }); } }
const assets = [...merged.values()]; const expected = 46; const remaining = [...records.keys()].filter((k) => !merged.has(k)); const runDir = path.join(acq, `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-merged-34`); await fs.mkdir(runDir, { recursive: false });
const inputHashes = []; for (const file of files) inputHashes.push({ path: file, sha256: sha(await fs.readFile(file)) });
const manifest = { schema: 'newsroom-real-media-acquisition-v2-merged-checkpoint', generatedAt: new Date().toISOString(), inputs: inputHashes, candidateAuthority: { path: candidatePath, contentSha256: candidate.approval?.contentSha256 || null }, assets, counts: { expected, uniquePrimary: new Set(assets.map((a) => a.original.sha256)).size, merged: assets.length, rejected: rejects.length, remaining: expected - assets.length }, remainingCompositeKeys: remaining, policy: { maxPrimaryReuse: 1, perceptualHammingThreshold: 8, providerInputDefault: 'denied', admission: false, incomplete: true }, rejects, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); await fs.writeFile(path.join(runDir, 'merge-manifest.json'), manifestBytes, { flag: 'wx' }); const verifier = { schema: 'newsroom-real-media-acquisition-v2-merged-checkpoint-verifier', verifiedAt: new Date().toISOString(), manifestSha256: sha(manifestBytes), rehashedUniquePrimary: new Set(assets.map((a) => a.original.sha256)).size, physicalFilesVerified: assets.length, expected: 46, complete: assets.length === expected && rejects.length === 0, remainingCompositeKeys: remaining, verified: rejects.length === 0 }; await fs.writeFile(path.join(runDir, 'merge-verifier.json'), `${JSON.stringify(verifier, null, 2)}\n`, { flag: 'wx' }); await fs.writeFile(path.join(runDir, 'checkpoint.json'), `${JSON.stringify({ schema: 'newsroom-real-media-acquisition-v2-checkpoint', manifest: 'merge-manifest.json', verifier: 'merge-verifier.json', assets, remainingCompositeKeys: remaining }, null, 2)}\n`, { flag: 'wx' }); process.stdout.write(`${JSON.stringify({ runDir, assets: assets.length, remaining: remaining.length, rejects: rejects.length, manifestSha256: sha(manifestBytes) }, null, 2)}\n`);
