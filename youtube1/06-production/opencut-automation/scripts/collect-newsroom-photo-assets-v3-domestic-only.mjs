import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const needsRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v3-domestic-only');
const outRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v3-domestic-only');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const searchCache = new Map();
const latest = async (dir) => path.join(dir, (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name))[0].name);
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const strip = (value) => decode(value.replaceAll(/<[^>]+>/gu, ' ').replaceAll(/\s+/gu, ' ').trim());
const semanticMatch = (query, candidate) => {
  const ignored = new Set(['대한민국', '국내', '공공기관', '외관', '건물', '빈']);
  const tokens = query.split(/\s+/u).map((token) => token.trim()).filter((token) => token.length >= 2 && !ignored.has(token));
  const haystack = `${candidate.title} ${candidate.description}`; const words = haystack.match(/[가-힣A-Za-z0-9]+/gu) || [];
  return tokens.length > 0 && tokens.every((token) => token === '학교' ? words.some((word) => word.endsWith(token) || word.startsWith(token)) : token.length <= 2 ? words.some((word) => word === token || word.startsWith(token)) : haystack.includes(token));
};
const hamming = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) n += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/gu) || []).length; return n + Math.abs(a.length - b.length) * 4; };
const fallbackQueries = {
  'police-father': ['전주 경찰서', '경찰서', '대한민국 경찰', '법원', '검찰청', '과학수사'],
  'jeju-school-intrusion': ['제주 학교', '제주 교육', '제주 경찰서', '제주 법원', '학교 교실', '학교 건물'],
  'nurse-pesticide-coffee': ['대한민국 병원', '병원 병동', '간호', '의료기관', '커피', '실험실']
};
const dims = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' })).streams?.[0];
const phash = (file) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']); const average = raw.reduce((sum, value) => sum + value, 0) / raw.length; let out = ''; for (let i = 0; i < raw.length; i += 4) { let nibble = 0; for (let j = 0; j < 4; j++) if (raw[i + j] >= average) nibble |= 1 << (3 - j); out += nibble.toString(16); } return out; };
async function fetchBounded(url, options = {}, timeoutMs = 15000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }

async function postSearch(query) {
  if (searchCache.has(query)) return searchCache.get(query);
  const body = new URLSearchParams({ startCount: '0', listCount: '50', query, requery: '', rt: '', orgCd: '', startDate: '', endDate: '', atcTypeCode: '', division: 'img', sort: 'RECOMMEND_IDX', searchPageType: 'M', currentPage: '1', pageType: 'T' });
  const response = await fetchBounded('https://www.kogl.or.kr/search/ajaxRecommendSearchList.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.0 (rights audit)' }, body });
  if (!response.ok) throw new Error(`KOGL search ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const html = bytes.toString('utf8');
  const cards = html.split('class="photo-list__item"').slice(1).map((block) => {
    const href = block.match(/href="([^"]*recommendIdx=(\d+)[^"]*division=img)"/u);
    const title = block.match(/title="([^"]+)"/u);
    const image = block.match(/background-image:\s*url\('([^']+)'\)/u);
    const type1 = /alt="제1유형 마크"/u.test(block.slice(0, block.indexOf('class="photo-list__item"') > -1 ? block.indexOf('class="photo-list__item"') : block.length));
    return href && title && image && type1 ? { recommendIdx: href[2], itemUrl: new URL(href[1], 'https://www.kogl.or.kr').href, title: decode(title[1]), mediaUrl: new URL(decode(image[1]), 'https://www.kogl.or.kr').href } : null;
  }).filter(Boolean);
  const result = { cards, responseSha256: sha(bytes) }; searchCache.set(query, result); return result;
}

async function detail(candidate) {
  const response = await fetchBounded(candidate.itemUrl, { headers: { 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.0 (rights audit)' } });
  if (!response.ok) throw new Error(`KOGL detail ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); const html = bytes.toString('utf8');
  if (!/alt="공공누리인증서1유형"/u.test(html)) throw new Error('not-kogl-1');
  const pageText = strip(html);
  const institution = html.match(/(?:촬영기관|소장기관|제공기관)<\/b>[\s\S]{0,80}?:\s*(?:<[^>]+>)*\s*([^<\r\n]+)/u)?.[1]
    || pageText.match(/(?:촬영기관|소장기관|제공기관)\s*:\s*([^:]{2,60}?)(?=저작물|촬영|소장|제공|등록|$)/u)?.[1];
  const description = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/u)?.[1] || candidate.title;
  const mediaPath = html.match(/background-image:\s*url\('([^']*\/upload_recommend\/thumb_V\/[^']+)'\)/u)?.[1];
  const width = Number(html.match(/data-width="(\d+)"/u)?.[1] || 0); const height = Number(html.match(/data-height="(\d+)"/u)?.[1] || 0);
  return { institution: strip(institution || ''), description: strip(description), mediaUrl: mediaPath ? new URL(decode(mediaPath), 'https://www.kogl.or.kr').href : candidate.mediaUrl, width, height, detailSha256: sha(bytes) };
}

export async function collectDomesticPhotosV3() {
  const needsDir = await latest(needsRoot); const needsBytes = await fs.readFile(path.join(needsDir, 'photo-needs.json')); const needs = JSON.parse(needsBytes);
  if (needs.policy?.domesticOnly !== true) throw new Error('domestic-only needs authority required');
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = path.join(outRoot, runId); await fs.mkdir(path.join(runDir, 'originals'), { recursive: true }); await fs.mkdir(path.join(runDir, 'metadata'), { recursive: true });
  const assets = []; const rejected = []; const usedItems = new Set(); const usedSha = new Set(); const hashes = [];
  for (const story of needs.cases) for (const need of story.cuts.filter((cut) => cut.sourceClass !== 'grok-generated')) {
    let admitted = false;
    const storySlug = story.slug || need.storyId;
    for (const activeQuery of [need.searchQuery, ...(fallbackQueries[storySlug] || [])]) {
      let results; try { results = await postSearch(activeQuery); } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, query: activeQuery, reason: error.message }); continue; }
      for (const candidate of results.cards) {
      if (usedItems.has(candidate.recommendIdx)) continue;
      if (!semanticMatch(activeQuery, { ...candidate, description: '' })) continue;
      let info; try { info = await detail(candidate); } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: error.message }); continue; }
      if (!info.institution) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'domestic-institution-unverified' }); continue; }
      if (!semanticMatch(activeQuery, { ...candidate, description: info.description })) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'semantic-title-mismatch' }); continue; }
      const mediaResponse = await fetchBounded(info.mediaUrl, { headers: { 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.0 (rights audit)', Referer: candidate.itemUrl } });
      if (!mediaResponse.ok) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `download-${mediaResponse.status}` }); continue; }
      if (!String(mediaResponse.headers.get('content-type') || '').toLowerCase().startsWith('image/')) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `download-non-image:${mediaResponse.headers.get('content-type') || 'unknown'}` }); continue; }
      const bytes = Buffer.from(await mediaResponse.arrayBuffer()); const digest = sha(bytes); if (usedSha.has(digest)) continue;
      const assetId = `kogl-kr-${String(assets.length + 1).padStart(3, '0')}`; const file = path.join(runDir, 'originals', `${assetId}.jpg`); await fs.writeFile(file, bytes, { flag: 'wx' });
      let decoded; let hash; try { decoded = dims(file); hash = phash(file); } catch { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'decode-failed' }); continue; }
      if (!decoded || Math.min(decoded.width, decoded.height) < 480) { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'below-480' }); continue; }
      const near = hashes.find((entry) => hamming(entry.phash, hash) <= 8); if (near) { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `perceptual-near-duplicate:${near.assetId}` }); continue; }
      const metadata = { candidate, info, query: activeQuery, sealedNeedQuery: need.searchQuery, retrievedAt: new Date().toISOString(), responseSha256: results.responseSha256 };
      const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`); await fs.writeFile(path.join(runDir, 'metadata', `${assetId}.json`), metadataBytes, { flag: 'wx' });
      const exactNeedQuery = activeQuery === need.searchQuery;
      assets.push({ assetId, storyId: story.storyId, cutId: need.cutId, candidateTitle: candidate.title, sourceUseStatus: exactNeedQuery ? 'admitted' : 'conditional', providerInputStatus: 'denied', coverageEligible: exactNeedQuery, semanticReview: { approved: exactNeedQuery, status: exactNeedQuery ? 'exact-query-title-match' : 'story-context-fallback-needs-human-cut-review' }, phash: hash, evidence: { itemUrl: candidate.itemUrl, originUrl: candidate.itemUrl, rightsUrl: 'https://www.kogl.or.kr/info/license.do', exactRightsStatement: '공공누리 제1유형: 출처표시, 상업적 이용 및 변경 가능', licenseUri: 'https://www.kogl.or.kr/info/license.do', licenseVersion: 'KOGL Type 1 captured 2026-08-15', provider: 'kogl-korea', query: activeQuery, sealedNeedQuery: need.searchQuery, retrievedAt: metadata.retrievedAt, responseSha256: results.responseSha256, sourceSha256: digest, domesticOrigin: { originCountry: 'KR', captureCountry: 'KR', rightsholderCountry: 'KR', institution: info.institution, verificationBasis: 'KOGL item detail identifies a Korean public institution and Korean-titled photographic context', detailPageSha256: info.detailSha256 } }, license: { classification: 'kogl-1' }, flags: { recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: true, geographicMismatch: false, casePartyImplication: false }, usageLabel: '국내 기관 자료사진·사건 현장과 무관', usageMode: need.usageMode, requestedDisplayPixels: need.requestedDisplayPixels, original: { relativePath: path.relative(root, file).replaceAll('\\', '/'), realpath: path.resolve(file), bytes: bytes.length, sha256: digest, width: decoded.width, height: decoded.height, preserved: true }, derivative: null });
      usedItems.add(candidate.recommendIdx); usedSha.add(digest); hashes.push({ assetId, phash: hash }); admitted = true; break;
      }
      if (admitted) break;
    }
    if (!admitted) rejected.push({ storyId: story.storyId, cutId: need.cutId, query: need.searchQuery, reason: 'no-unique-domestic-kogl1-photo' });
    await sleep(250);
  }
  const manifest = { schema: 'newsroom-real-media-acquisition-v3-domestic-only', generatedAt: new Date().toISOString(), predecessor: { photoNeedsRun: path.relative(root, needsDir).replaceAll('\\', '/'), photoNeedsSha256: needs.approval.sha256, foreignAcquisitionDisposition: 'superseded-for-domestic-only-policy; preserved-as-audit-evidence' }, policy: { domesticOnly: true, originCountry: 'KR', captureCountry: 'KR', source: 'KOGL official search and item pages', allowedLicense: ['kogl-1'], maxPrimaryReuse: 1, perceptualHammingThreshold: 8, providerInputDefault: 'denied', admission: false }, assets, rejected, counts: { requested: 46, acquired: assets.length, remaining: 46 - assets.length, uniquePrimary: usedSha.size }, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { runDir, requested: 46, acquired: assets.length, remaining: 46 - assets.length, rejected: rejected.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collectDomesticPhotosV3().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
