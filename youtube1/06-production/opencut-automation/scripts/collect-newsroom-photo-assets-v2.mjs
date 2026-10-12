import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const needsRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v2');
const outRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v2');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hamming = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) n += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/g) || []).length; return n + Math.abs(a.length - b.length) * 4; };
const latest = async (dir) => { const ds = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name)); if (!ds.length) throw new Error(`no run in ${dir}`); return path.join(dir, ds[0].name); };
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchBounded(url, options = {}, timeoutMs = 20000) { for (let attempt = 0; attempt < 3; attempt++) { const wait = Math.max(0, 2000 - (Date.now() - lastRequestAt)); if (wait) await sleep(wait); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(url, { ...options, headers: { 'User-Agent': 'OpenCut-NewsroomPhotoCollector/2.0 (local audit)', ...(options.headers || {}) }, signal: controller.signal }); clearTimeout(timer); lastRequestAt = Date.now(); if (response.status === 429) { const retry = Number(response.headers.get('retry-after') || 0); await sleep(Math.min(120000, retry > 0 ? retry * 1000 : (30 * (2 ** attempt)) * 1000)); continue; } return response; } catch (error) { clearTimeout(timer); if (attempt === 2) throw error; await sleep((30 * (2 ** attempt)) * 1000); } } throw new Error('rate-limit retries exhausted'); }

async function phash(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  let sum = 0; for (const x of raw) sum += x; const avg = sum / raw.length; let out = ''; for (let i = 0; i < raw.length; i += 4) { let nibble = 0; for (let j = 0; j < 4; j++) if (raw[i + j] >= avg) nibble |= (1 << (3 - j)); out += nibble.toString(16); } return out;
}
function classify(meta) {
  const short = String(meta.extmetadata?.LicenseShortName?.value || '').toLowerCase();
  if (/cc0|creative commons zero/.test(short)) return 'cc0';
  if (/public domain|pd|government/.test(short)) return 'public-domain';
  if (/cc by-sa/.test(short)) return 'cc-by-sa';
  if (/cc by/.test(short)) return 'cc-by';
  if (/kogl/.test(short)) return /1/.test(short) ? 'kogl-1' : 'unknown';
  return 'unknown';
}
async function search(query, limit = 50) {
  const url = new URL('https://commons.wikimedia.org/w/api.php'); url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: String(limit), prop: 'imageinfo', iiprop: 'url|mime|size|dimensions|extmetadata', iiurlwidth: '1600', maxlag: '5', format: 'json', formatversion: '2', origin: '*' });
  const res = await fetchBounded(url); if (!res.ok) throw new Error(`Wikimedia API ${res.status}`); const bytes = Buffer.from(await res.arrayBuffer()); return { value: JSON.parse(bytes), bytes };
}

export async function collectNewsroomPhotoAssetsV2() {
  const needsDir = await latest(needsRoot); const needs = JSON.parse(await fs.readFile(path.join(needsDir, 'photo-needs.json')));
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomBytes(3).toString('hex')}`; const runDir = path.join(outRoot, runId); await fs.mkdir(path.join(runDir, 'originals'), { recursive: true }); await fs.mkdir(path.join(runDir, 'metadata'), { recursive: true });
  const assets = []; const seenSha = new Set(); const seenHash = []; const rejected = []; let nextAssetNumber = 1; const seededByStory = new Map();
  const seedManifestPath = process.env.NEWSROOM_PHOTO_SEED_MANIFEST;
  if (seedManifestPath) { const seed = JSON.parse(await fs.readFile(seedManifestPath)); for (const item of seed.assets || []) { assets.push(item); seenSha.add(item.original.sha256); if (item.phash) seenHash.push({ assetId: item.assetId, phash: item.phash }); const n = Number(String(item.assetId).match(/(\d+)$/)?.[1] || 0); nextAssetNumber = Math.max(nextAssetNumber, n + 1); seededByStory.set(item.storyId, (seededByStory.get(item.storyId) || 0) + 1); } }
  for (const story of needs.cases) {
    const wanted = story.cuts.filter((c) => c.sourceClass !== 'grok-generated'); const selected = []; const seedCount = seededByStory.get(story.storyId) || 0;
    const queries = [...new Set(wanted.map((c) => c.searchQuery).filter(Boolean))];
    for (const query of queries) {
      let result; try { result = await search(query, 50); } catch (error) { rejected.push({ query, reason: `api-error:${error.message}` }); continue; }
      for (const page of result.value.query?.pages || []) {
        if (selected.length + seedCount >= wanted.length) break; const info = page.imageinfo?.[0]; if (!info?.url || !/^image\//u.test(info.mime || '')) continue;
        const rights = classify(info); if (!['cc0', 'public-domain', 'cc-by', 'kogl-1', 'cc-by-sa'].includes(rights)) { rejected.push({ title: page.title, reason: `license:${rights}` }); continue; }
        let bytes; try { const res = await fetchBounded(info.url); if (!res.ok) throw new Error(String(res.status)); const len = Number(res.headers.get('content-length') || 0); if (len > 25_000_000) throw new Error('max-bytes'); bytes = Buffer.from(await res.arrayBuffer()); if (bytes.length > 25_000_000) throw new Error('max-bytes'); } catch (error) { rejected.push({ title: page.title, reason: `download:${error.message}` }); continue; }
        const sourceSha = sha(bytes); if (seenSha.has(sourceSha)) { rejected.push({ title: page.title, reason: 'duplicate-source-sha' }); continue; }
        const assetId = `commons-${String(nextAssetNumber++).padStart(3, '0')}`; const ext = (info.mime || '').includes('png') ? 'png' : 'jpg'; const file = path.join(runDir, 'originals', `${assetId}.${ext}`); await fs.writeFile(file, bytes, { flag: 'wx' });
        let hash; try { hash = await phash(file); } catch { await fs.unlink(file); rejected.push({ title: page.title, reason: 'decode-failed' }); continue; }
        const near = seenHash.find((x) => hamming(x.phash, hash) <= 8); if (near) { await fs.unlink(file); rejected.push({ title: page.title, reason: 'perceptual-near-duplicate', of: near.assetId }); continue; }
        seenSha.add(sourceSha); seenHash.push({ assetId, phash: hash }); selected.push({ assetId, page, info, rights, file, sourceSha, phash: hash, responseSha: sha(result.bytes) });
      }
    }
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i]; const metaPath = path.join(runDir, 'metadata', `${item.assetId}.json`); await fs.writeFile(metaPath, JSON.stringify({ title: item.page.title, query: wanted[i]?.searchQuery, api: item.page, retrievedAt: new Date().toISOString() }, null, 2)); const need = wanted[i]; assets.push({ assetId: item.assetId, storyId: story.storyId, cutId: need.cutId, candidateTitle: item.page.title, sourceUseStatus: item.rights === 'cc-by-sa' ? 'conditional' : 'admitted', providerInputStatus: 'denied', coverageEligible: item.rights !== 'cc-by-sa', phash: item.phash, evidence: { itemUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.page.title).replaceAll('%3A', ':')}`, originUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.page.title).replaceAll('%3A', ':')}`, rightsUrl: item.info.extmetadata?.LicenseUrl?.value || 'https://creativecommons.org/share-your-work/cclicenses/', exactRightsStatement: item.info.extmetadata?.LicenseShortName?.value || item.rights, licenseUri: item.info.extmetadata?.LicenseUrl?.value || 'https://creativecommons.org/share-your-work/cclicenses/', licenseVersion: item.info.extmetadata?.LicenseShortName?.value || item.rights, provider: 'wikimedia-commons', query: need.searchQuery, retrievedAt: new Date().toISOString(), responseSha256: item.responseSha, sourceSha256: item.sourceSha }, license: { classification: item.rights, ...(item.rights === 'cc-by-sa' ? { shareAlikeReview: { approved: false } } : {}) }, flags: { recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: false, geographicMismatch: false, casePartyImplication: false }, usageLabel: 'unrelated illustrative photo', usageMode: need.usageMode, requestedDisplayPixels: need.requestedDisplayPixels, original: { relativePath: path.relative(root, item.file).replaceAll('\\', '/'), realpath: path.resolve(item.file), bytes: (await fs.stat(item.file)).size, sha256: item.sourceSha, width: item.info.width || item.info.thumbwidth, height: item.info.height || item.info.thumbheight, preserved: true }, derivative: null });
    }
  }
  const manifest = { schema: 'newsroom-real-media-acquisition-v2', generatedAt: new Date().toISOString(), predecessor: { photoNeedsRun: needsDir, photoNeedsSha256: needs.approval.sha256 }, policy: { source: 'Wikimedia Commons API/pages', maxPrimaryReuse: 1, perceptualHammingThreshold: 8, providerInputDefault: 'denied' }, assets, rejected, counts: { requested: needs.cases.reduce((n, c) => n + c.cuts.filter((x) => x.sourceClass !== 'grok-generated').length, 0), acquired: assets.length, uniquePrimary: new Set(assets.map((a) => a.original.sha256)).size }, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }); return { runDir, acquired: assets.length, requested: manifest.counts.requested, rejected: rejected.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collectNewsroomPhotoAssetsV2().then((r) => process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)).catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });
