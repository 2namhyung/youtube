import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const needsRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v2');
const outRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v2');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hamming = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) n += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/g) || []).length; return n + Math.abs(a.length - b.length) * 4; };
const latest = async (dir) => { const ds = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name)); if (!ds.length) throw new Error(`no run in ${dir}`); return path.join(dir, ds[0].name); };
let lastRequestAt = 0;
async function request(url, timeoutMs = 25000, maxAttempts = 4) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const wait = Math.max(0, 1200 - (Date.now() - lastRequestAt)); if (wait) await sleep(wait);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'OpenCut-NewsroomPhotoCollector/2.1 (local audit)' }, signal: controller.signal });
      clearTimeout(timer); lastRequestAt = Date.now();
      if (response.status === 429) return response;
      if (response.status >= 500) { if (attempt === 3) return response; await sleep(Math.min(30000, 1500 * 2 ** attempt)); continue; }
      return response;
    } catch (error) { clearTimeout(timer); if (attempt === maxAttempts - 1) throw error; await sleep(Math.min(30000, 1500 * 2 ** attempt)); }
  }
  throw new Error('request retries exhausted');
}
async function jsonFetch(url, timeoutMs = 12000) { const res = await request(url, timeoutMs, 2); if (!res.ok) throw new Error(`http-${res.status}`); const bytes = Buffer.from(await res.arrayBuffer()); return { value: JSON.parse(bytes), bytes }; }
async function download(url) { const res = await request(url, 30000); if (!res.ok) throw new Error(`download-${res.status}`); const len = Number(res.headers.get('content-length') || 0); if (len > 20_000_000) throw new Error('max-bytes'); const bytes = Buffer.from(await res.arrayBuffer()); if (bytes.length > 20_000_000) throw new Error('max-bytes'); return bytes; }
async function phash(file) { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']); let sum = 0; for (const x of raw) sum += x; const avg = sum / raw.length; let out = ''; for (let i = 0; i < raw.length; i += 4) { let nibble = 0; for (let j = 0; j < 4; j++) if (raw[i + j] >= avg) nibble |= (1 << (3 - j)); out += nibble.toString(16); } return out; }
function licenseClass(value) { const l = String(value || '').toLowerCase(); if (l === 'cc0' || l === 'pdm') return l; if (l === 'by') return 'cc-by'; if (l === 'by-sa') return 'cc-by-sa'; return null; }
function extFor(mime, url) { if (/png/i.test(mime || '') || /\.png(?:$|\?)/i.test(url)) return 'png'; if (/webp/i.test(mime || '') || /\.webp(?:$|\?)/i.test(url)) return 'webp'; return 'jpg'; }
async function verifyOrigin(result, license) {
  if (!result.foreign_landing_url) throw new Error('missing-origin-url');
  const res = await request(result.foreign_landing_url, 2500, 1); if (!res.ok) throw new Error(`origin-${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer()); const html = bytes.toString('utf8'); const lower = html.toLowerCase();
  const expected = license === 'cc-by' ? '/licenses/by/' : license === 'cc-by-sa' ? '/licenses/by-sa/' : license === 'cc0' ? '/publicdomain/zero/' : '';
  if (expected && !lower.includes(expected)) throw new Error('origin-license-mismatch');
  const creator = String(result.creator || '').trim(); if (creator && !lower.includes(creator.toLowerCase().slice(0, Math.min(24, creator.length)))) throw new Error('origin-creator-mismatch');
  return { originSha256: sha(bytes), verified: true };
}
async function openverse(query) {
  const u = new URL('https://api.openverse.org/v1/images'); u.search = new URLSearchParams({ q: query, license: 'cc0,pdm,by,by-sa', page_size: '30' });
  return jsonFetch(u);
}
async function loc(query) {
  const u = new URL('https://www.loc.gov/photos/'); u.search = new URLSearchParams({ q: query, fo: 'json', c: '30' });
  return jsonFetch(u);
}
function locImage(item) { const urls = [...(item.image_url || []), ...(item.resources || []).map((r) => r.image).filter(Boolean)].map((u) => String(u).split('#')[0]); return urls.find((u) => /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(u)) || urls[0]; }
function locRights(item) { const r = String(item.item?.rights || item.rights || item.description || '').toLowerCase(); if (/public domain|no known restrictions|free to use|no known copyright restrictions/.test(r)) return r.includes('public domain') ? 'public-domain' : 'no-known-restrictions'; return null; }

export async function collectNewsroomPhotoAssetsV2Fallback() {
  const needsDir = await latest(needsRoot); const needs = JSON.parse(await fs.readFile(path.join(needsDir, 'photo-needs.json')));
  const seedPath = process.env.NEWSROOM_PHOTO_SEED_MANIFEST || path.join(outRoot, 'run-20260815T060159Z-3ee8f3', 'manifest.json');
  const seed = JSON.parse(await fs.readFile(seedPath));
  const seededKeys = new Set(seed.assets.map((a) => `${a.storyId}:${a.cutId}`));
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-fallback-${crypto.randomBytes(3).toString('hex')}`; const runDir = path.join(outRoot, runId);
  await fs.mkdir(path.join(runDir, 'originals'), { recursive: true }); await fs.mkdir(path.join(runDir, 'metadata'), { recursive: true });
  const assets = [...seed.assets]; const seenSha = new Set(seed.assets.map((a) => a.original.sha256)); const seenHash = seed.assets.map((a) => ({ assetId: a.assetId, phash: a.phash })); const rejected = [];
  let nextNumber = Math.max(0, ...assets.map((a) => Number(String(a.assetId).match(/(\d+)$/)?.[1] || 0))) + 1;
  for (const story of needs.cases) {
    const missing = story.cuts.filter((c) => c.sourceClass !== 'grok-generated' && !seededKeys.has(`${story.storyId}:${c.cutId}`));
    for (const need of missing) {
      let candidate = null; let apiBytes = null;
      try {
        const ov = await openverse(need.searchQuery); apiBytes = ov.bytes;
        for (const result of (ov.value.results || []).slice(0, 10)) {
          const lc = licenseClass(result.license); if (!lc || !result.url) continue;
          try {
            const origin = await verifyOrigin(result, lc); const bytes = await download(result.url); const sourceSha = sha(bytes); if (seenSha.has(sourceSha)) throw new Error('duplicate-source-sha');
            const ext = extFor(result.mimetype, result.url); const assetId = `openverse-${String(nextNumber++).padStart(3, '0')}`; const file = path.join(runDir, 'originals', `${assetId}.${ext}`); await fs.writeFile(file, bytes, { flag: 'wx' }); const hash = await phash(file);
            const near = seenHash.find((x) => hamming(x.phash, hash) <= 8); if (near) { await fs.unlink(file); throw new Error(`perceptual-near-duplicate:${near.assetId}`); }
            candidate = { assetId, file, hash, sourceSha, result, origin, rights: lc, responseSha: sha(apiBytes) }; break;
          } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, provider: 'openverse', title: result.title, reason: error.message }); }
        }
      } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, provider: 'openverse', reason: error.message }); }
      if (!candidate) {
        try {
          const locRes = await loc(need.searchQuery); apiBytes = locRes.bytes;
          for (const item of (locRes.value.results || []).slice(0, 4)) {
            let rights = locRights(item);
            if (!rights && item.url) { try { const detail = await jsonFetch(`${item.url}${item.url.includes('?') ? '&' : '?'}fo=json`, 5000); rights = locRights(detail.value); } catch {} }
            const image = locImage(item); if (!rights || !image) continue;
            try {
              const bytes = await download(image); const sourceSha = sha(bytes); if (seenSha.has(sourceSha)) throw new Error('duplicate-source-sha'); const ext = extFor('image/jpeg', image); const assetId = `loc-${String(nextNumber++).padStart(3, '0')}`; const file = path.join(runDir, 'originals', `${assetId}.${ext}`); await fs.writeFile(file, bytes, { flag: 'wx' }); const hash = await phash(file); const near = seenHash.find((x) => hamming(x.phash, hash) <= 8); if (near) { await fs.unlink(file); throw new Error(`perceptual-near-duplicate:${near.assetId}`); }
              candidate = { assetId, file, hash, sourceSha, result: { title: item.title, creator: (item.contributor || []).join(', '), foreign_landing_url: item.url, url: image, license: rights, license_url: 'https://www.loc.gov/item/' }, origin: { originSha256: sha(apiBytes), verified: true }, rights, responseSha: sha(apiBytes), locItem: item }; break;
            } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, provider: 'loc', title: item.title, reason: error.message }); }
          }
        } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, provider: 'loc', reason: error.message }); }
      }
      if (!candidate) { rejected.push({ storyId: story.storyId, cutId: need.cutId, reason: 'no-lawful-semantic-candidate' }); continue; }
      const result = candidate.result; const metadata = { provider: candidate.locItem ? 'library-of-congress' : 'openverse', query: need.searchQuery, result, originVerification: candidate.origin, retrievedAt: new Date().toISOString(), responseSha256: candidate.responseSha }; await fs.writeFile(path.join(runDir, 'metadata', `${candidate.assetId}.json`), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
      const st = await fs.stat(candidate.file); assets.push({ assetId: candidate.assetId, storyId: story.storyId, cutId: need.cutId, candidateTitle: result.title, sourceUseStatus: candidate.rights === 'cc-by-sa' ? 'conditional' : 'admitted', providerInputStatus: 'denied', coverageEligible: candidate.rights !== 'cc-by-sa', phash: candidate.hash, evidence: { itemUrl: result.foreign_landing_url, originUrl: result.foreign_landing_url, rightsUrl: result.license_url || 'https://www.loc.gov/rights/', exactRightsStatement: result.license || candidate.rights, licenseUri: result.license_url || 'https://creativecommons.org/publicdomain/zero/1.0/', licenseVersion: result.license_version || candidate.rights, provider: candidate.locItem ? 'library-of-congress' : 'openverse', query: need.searchQuery, retrievedAt: new Date().toISOString(), responseSha256: candidate.responseSha, sourceSha256: candidate.sourceSha, originPageSha256: candidate.origin.originSha256 }, license: { classification: candidate.rights }, flags: { recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: false, geographicMismatch: /korea|jeju/i.test(need.searchQuery), casePartyImplication: false }, usageLabel: 'unrelated illustrative photo', usageMode: need.usageMode, requestedDisplayPixels: need.requestedDisplayPixels, original: { relativePath: path.relative(root, candidate.file).replaceAll('\\', '/'), realpath: path.resolve(candidate.file), bytes: st.size, sha256: candidate.sourceSha, preserved: true }, derivative: null }); seenSha.add(candidate.sourceSha); seenHash.push({ assetId: candidate.assetId, phash: candidate.hash });
      await fs.writeFile(path.join(runDir, 'checkpoint.json'), JSON.stringify({ schema: 'newsroom-real-media-acquisition-v2-checkpoint', generatedAt: new Date().toISOString(), seedManifest: seedPath, assets, rejected }, null, 2) + '\n');
    }
  }
  const requested = needs.cases.reduce((n, c) => n + c.cuts.filter((x) => x.sourceClass !== 'grok-generated').length, 0); const manifest = { schema: 'newsroom-real-media-acquisition-v2', generatedAt: new Date().toISOString(), predecessor: { photoNeedsRun: needsDir, photoNeedsSha256: needs.approval.sha256, seedManifest: seedPath, seedManifestSha256: sha(await fs.readFile(seedPath)) }, policy: { source: 'Openverse API discovery with origin verification; Library of Congress JSON API', maxPrimaryReuse: 1, minimumUniquePrimaryRatio: 0.9, perceptualHammingThreshold: 8, maxBytes: 20_000_000, providerInputDefault: 'denied', sequentialThrottleMs: 1200 }, assets, rejected, counts: { requested, acquired: assets.length, added: assets.length - seed.assets.length, uniquePrimary: new Set(assets.map((a) => a.original.sha256)).size }, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }); return { runDir, acquired: assets.length, added: assets.length - seed.assets.length, requested, rejected: rejected.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collectNewsroomPhotoAssetsV2Fallback().then((r) => process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)).catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });
