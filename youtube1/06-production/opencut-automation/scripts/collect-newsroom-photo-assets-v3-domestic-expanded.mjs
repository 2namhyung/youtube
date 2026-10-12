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
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const strip = (value) => decode(value.replaceAll(/<[^>]+>/gu, ' ').replaceAll(/\s+/gu, ' ').trim());
const hamming = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) n += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/gu) || []).length; return n + Math.abs(a.length - b.length) * 4; };
const dims = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' })).streams?.[0];
const phash = (file) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']); const average = raw.reduce((sum, value) => sum + value, 0) / raw.length; let out = ''; for (let i = 0; i < raw.length; i += 4) { let nibble = 0; for (let j = 0; j < 4; j++) if (raw[i + j] >= average) nibble |= 1 << (3 - j); out += nibble.toString(16); } return out; };

const aliases = {
  'police-father:cut-004': ['디지털 포렌식', '포렌식', '사이버수사', '디지털 증거'],
  'police-father:cut-005': ['검찰청', '검찰 청사', '검찰'],
  'police-father:cut-006': ['대한민국 법원', '법원 청사', '법원'],
  'police-father:cut-007': ['경찰 장비', '경찰 제복', '경찰 무전기'],
  'police-father:cut-008': ['증거 보관', '증거물', '증거 봉투'],
  'police-father:cut-009': ['수사 서류', '수사 기록', '경찰 문서'],
  'police-father:cut-010': ['CCTV 관제센터', 'CCTV 관제', '통합관제센터'],
  'police-father:cut-011': ['치안센터', '파출소', '지구대'],
  'police-father:cut-012': ['대한민국 경찰차', '경찰차', '순찰차'],
  'police-father:cut-013': ['법원 복도', '법원 내부', '법정 복도'],
  'police-father:cut-014': ['공공기관 서류', '행정 문서', '문서 책상'],
  'police-father:cut-015': ['과학수사', '현장 감식', '과학수사 장비'],
  'police-father:cut-016': ['전라북도 경찰', '전북경찰청', '전주 경찰'],
  'jeju-school-intrusion:cut-004': ['제주 교육청', '제주특별자치도교육청', '제주시교육지원청'],
  'jeju-school-intrusion:cut-005': ['제주 법원', '제주지방법원', '법원 제주'],
  'jeju-school-intrusion:cut-006': ['제주 학교 정문', '제주 학교', '학교 정문'],
  'jeju-school-intrusion:cut-007': ['교실 출입문', '교실 문', '학교 출입문'],
  'jeju-school-intrusion:cut-008': ['학교 CCTV', '학교 폐쇄회로', '학교 보안'],
  'jeju-school-intrusion:cut-009': ['제주 경찰', '제주경찰청', '제주 경찰서'],
  'jeju-school-intrusion:cut-010': ['대한민국 학교 복도', '학교 복도', '교실 복도'],
  'jeju-school-intrusion:cut-011': ['교육청 건물', '교육지원청', '교육청 청사'],
  'jeju-school-intrusion:cut-012': ['법원 출입구', '법원 입구', '법원 청사'],
  'jeju-school-intrusion:cut-013': ['경찰 통제선', '통제선', '폴리스라인'],
  'jeju-school-intrusion:cut-014': ['학교 교무실', '교무실', '학교 사무실'],
  'jeju-school-intrusion:cut-015': ['제주 공공기관 복도', '제주 청사', '공공기관 복도']
};

// KOGL's full-text search can return weakly related heritage records.  Require
// the public item title itself to carry a cut-specific semantic anchor before
// downloading bytes. This is deliberately stricter than the search query.
const titleAnchors = {
  'police-father:cut-004': ['휴대전화', '휴대폰', '스마트폰', '사이버', '디지털'],
  'police-father:cut-005': ['검찰'],
  'police-father:cut-006': ['법원', '법정', '재판'],
  'police-father:cut-007': ['경찰', '제복', '무전'],
  'police-father:cut-008': ['증거', '압수', '봉투'],
  'police-father:cut-009': ['수사', '경찰', '문서', '기록'],
  'police-father:cut-010': ['CCTV', '관제', '폐쇄회로'],
  'police-father:cut-011': ['치안', '파출소', '지구대', '경찰'],
  'police-father:cut-012': ['경찰차', '순찰차'],
  'police-father:cut-013': ['법원', '법정', '재판'],
  'police-father:cut-014': ['문서', '서류', '행정'],
  'police-father:cut-015': ['과학수사', '감식'],
  'police-father:cut-016': ['경찰', '전주', '전북'],
  'jeju-school-intrusion:cut-004': ['교육청', '교육지원청'],
  'jeju-school-intrusion:cut-005': ['법원', '법정', '제주지방법원'],
  'jeju-school-intrusion:cut-006': ['학교', '초등학교'],
  'jeju-school-intrusion:cut-007': ['교실', '출입문', '학교'],
  'jeju-school-intrusion:cut-008': ['CCTV', '보안', '폐쇄회로'],
  'jeju-school-intrusion:cut-009': ['경찰', '제주'],
  'jeju-school-intrusion:cut-010': ['학교', '교실', '복도'],
  'jeju-school-intrusion:cut-011': ['교육청', '교육지원청'],
  'jeju-school-intrusion:cut-012': ['법원', '법정'],
  'jeju-school-intrusion:cut-013': ['경찰', '통제선', '폴리스라인'],
  'jeju-school-intrusion:cut-014': ['교무실', '학교', '사무실'],
  'jeju-school-intrusion:cut-015': ['제주', '청사', '공공기관']
};

function titleMatches(storySlug, cutId, title) {
  const anchors = titleAnchors[`${storySlug}:${cutId}`] || [];
  const normalized = String(title || '').normalize('NFKC').toLowerCase();
  return anchors.some((anchor) => normalized.includes(anchor.normalize('NFKC').toLowerCase()));
}

const searchCache = new Map();
async function fetchBounded(url, options = {}, timeoutMs = 20000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
async function latestRun(dir, requireFile) { const entries = (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name)); for (const entry of entries) { const candidate = path.join(dir, entry.name); try { await fs.access(path.join(candidate, requireFile)); return candidate; } catch {} } throw new Error(`no ${requireFile} run in ${dir}`); }

async function postSearch(query, page) {
  const cacheKey = `${query}:${page}`; if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
  const body = new URLSearchParams({ startCount: String((page - 1) * 50), listCount: '50', query, requery: '', rt: '', orgCd: '', startDate: '', endDate: '', atcTypeCode: '', division: 'img', sort: 'ddate', searchPageType: 'S', reSearch: '', currentPage: String(page), pageType: '' });
  const response = await fetchBounded('https://www.kogl.or.kr/search/ajaxRecommendSearchList.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.1 (rights audit)' }, body });
  if (!response.ok) throw new Error(`KOGL search ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); const html = bytes.toString('utf8');
  const cards = html.split('class="photo-list__item"').slice(1).map((block) => {
    const href = block.match(/href="([^"]*recommendIdx=(\d+)[^"]*division=img)"/u); const title = block.match(/title="([^"]+)"/u); const image = block.match(/background-image:\s*url\('([^']+)'\)/u); const type1 = /alt="제1유형 마크"/u.test(block);
    return href && title && image && type1 ? { recommendIdx: href[2], itemUrl: new URL(href[1], 'https://www.kogl.or.kr').href, title: decode(title[1]), mediaUrl: new URL(decode(image[1]), 'https://www.kogl.or.kr').href } : null;
  }).filter(Boolean);
  const result = { cards, responseSha256: sha(bytes) }; searchCache.set(cacheKey, result); await sleep(400); return result;
}

async function detail(candidate) {
  const response = await fetchBounded(candidate.itemUrl, { headers: { 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.1 (rights audit)' } }); if (!response.ok) throw new Error(`KOGL detail ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); const html = bytes.toString('utf8'); if (!/alt="공공누리인증서1유형"/u.test(html)) throw new Error('not-kogl-1');
  const pageText = strip(html); const institution = html.match(/(?:촬영기관|소장기관|제공기관)<\/b>[\s\S]{0,80}?:\s*(?:<[^>]+>)*\s*([^<\r\n]+)/u)?.[1] || pageText.match(/(?:촬영기관|소장기관|제공기관)\s*:\s*([^:]{2,60}?)(?=저작물|촬영|소장|제공|등록|$)/u)?.[1];
  const description = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/u)?.[1] || candidate.title; const mediaPath = html.match(/background-image:\s*url\('([^']*\/upload_recommend\/thumb_V\/[^']+)'\)/u)?.[1];
  return { institution: strip(institution || ''), description: strip(description), mediaUrl: mediaPath ? new URL(decode(mediaPath), 'https://www.kogl.or.kr').href : candidate.mediaUrl, detailSha256: sha(bytes) };
}

async function seedPrevious(seedDir, runDir, assets, usedItems, usedSha, hashes) {
  const bytes = await fs.readFile(path.join(seedDir, 'manifest.json')); const seed = JSON.parse(bytes); if (seed.schema !== 'newsroom-real-media-acquisition-v3-domestic-only') throw new Error('invalid domestic predecessor');
  for (const asset of seed.assets) {
    const source = path.resolve(root, asset.original.relativePath); const real = await fs.realpath(source); if (!real.startsWith(`${root}${path.sep}`) || real !== source) throw new Error(`unsafe predecessor path ${asset.assetId}`); const stat = await fs.lstat(source); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe predecessor file ${asset.assetId}`);
    const fileBytes = await fs.readFile(source); if (sha(fileBytes) !== asset.original.sha256 || fileBytes.length !== asset.original.bytes) throw new Error(`predecessor hash mismatch ${asset.assetId}`);
    const file = path.join(runDir, 'originals', `${asset.assetId}.jpg`); await fs.copyFile(source, file, fs.constants.COPYFILE_EXCL); const copied = { ...asset, original: { ...asset.original, relativePath: path.relative(root, file).replaceAll('\\', '/'), realpath: path.resolve(file) } }; assets.push(copied);
    const idx = new URL(asset.evidence.itemUrl).searchParams.get('recommendIdx'); if (idx) usedItems.add(idx); usedSha.add(asset.original.sha256); hashes.push({ assetId: asset.assetId, phash: asset.phash });
    await fs.writeFile(path.join(runDir, 'metadata', `${asset.assetId}.json`), `${JSON.stringify({ seededFrom: path.relative(root, seedDir).replaceAll('\\', '/'), itemUrl: asset.evidence.itemUrl, sourceSha256: asset.original.sha256 }, null, 2)}\n`, { flag: 'wx' });
  }
  return { seed, seedManifestSha256: sha(bytes) };
}

export async function collectDomesticExpanded() {
  const needsDir = await latestRun(needsRoot, 'photo-needs.json'); const needsBytes = await fs.readFile(path.join(needsDir, 'photo-needs.json')); const needs = JSON.parse(needsBytes); if (needs.policy?.domesticOnly !== true) throw new Error('domestic-only needs authority required');
  const seedDir = process.env.NEWSROOM_DOMESTIC_SEED_MANIFEST ? path.dirname(path.resolve(process.env.NEWSROOM_DOMESTIC_SEED_MANIFEST)) : await latestRun(outRoot, 'manifest.json');
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-expanded-${crypto.randomBytes(3).toString('hex')}`; const runDir = path.join(outRoot, runId); await fs.mkdir(path.join(runDir, 'originals'), { recursive: true }); await fs.mkdir(path.join(runDir, 'metadata'), { recursive: true });
  const assets = []; const rejected = []; const usedItems = new Set(); const usedSha = new Set(); const hashes = []; const seeded = await seedPrevious(seedDir, runDir, assets, usedItems, usedSha, hashes); const fulfilled = new Set(assets.map((asset) => `${asset.storyId}:${asset.cutId}`));
  for (const story of needs.cases) for (const need of story.cuts.filter((cut) => cut.sourceClass !== 'grok-generated')) {
    if (fulfilled.has(`${story.storyId}:${need.cutId}`)) continue; const storySlug = story.slug || need.storyId; const queries = [...new Set(aliases[`${storySlug}:${need.cutId}`] || [need.searchQuery])]; let found = false;
    for (const query of queries) { for (let page = 1; page <= 3 && !found; page++) {
      let results; try { results = await postSearch(query, page); } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, query, page, reason: error.message }); continue; }
      for (const candidate of results.cards) {
        if (!titleMatches(storySlug, need.cutId, candidate.title)) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, candidateTitle: candidate.title, reason: 'semantic-title-anchor-mismatch' }); continue; }
        if (usedItems.has(candidate.recommendIdx)) continue; let info; try { info = await detail(candidate); } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: error.message }); continue; } if (!info.institution) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'domestic-institution-unverified' }); continue; }
        let response; try { response = await fetchBounded(info.mediaUrl, { headers: { 'User-Agent': 'OpenCut-DomesticPhotoCollector/3.1 (rights audit)', Referer: candidate.itemUrl } }); } catch (error) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `download:${error.name}` }); continue; } if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) { rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `download-${response.status}` }); continue; }
        const fileBytes = Buffer.from(await response.arrayBuffer()); const digest = sha(fileBytes); if (usedSha.has(digest)) continue; const assetId = `kogl-kr-${String(assets.length + 1).padStart(3, '0')}`; const file = path.join(runDir, 'originals', `${assetId}.jpg`); await fs.writeFile(file, fileBytes, { flag: 'wx' }); let decoded; let hash; try { decoded = dims(file); hash = phash(file); } catch { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'decode-failed' }); continue; } if (!decoded || Math.min(decoded.width, decoded.height) < 480) { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: 'below-480' }); continue; } const near = hashes.find((entry) => hamming(entry.phash, hash) <= 8); if (near) { await fs.unlink(file); rejected.push({ storyId: story.storyId, cutId: need.cutId, itemUrl: candidate.itemUrl, reason: `perceptual-near-duplicate:${near.assetId}` }); continue; }
        const retrievedAt = new Date().toISOString(); const metadata = { candidate, info, query, page, sealedNeedQuery: need.searchQuery, retrievedAt, responseSha256: results.responseSha256 }; await fs.writeFile(path.join(runDir, 'metadata', `${assetId}.json`), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
        assets.push({ assetId, storyId: story.storyId, cutId: need.cutId, candidateTitle: candidate.title, sourceUseStatus: 'conditional', providerInputStatus: 'denied', coverageEligible: false, semanticReview: { approved: false, status: 'expanded-query-needs-human-cut-review' }, phash: hash, evidence: { itemUrl: candidate.itemUrl, originUrl: candidate.itemUrl, rightsUrl: 'https://www.kogl.or.kr/info/license.do', exactRightsStatement: '공공누리 제1유형: 출처표시, 상업적 이용 및 변경 가능', licenseUri: 'https://www.kogl.or.kr/info/license.do', licenseVersion: 'KOGL Type 1 captured 2026-08-15', provider: 'kogl-korea', query, sealedNeedQuery: need.searchQuery, retrievedAt, responseSha256: results.responseSha256, sourceSha256: digest, domesticOrigin: { originCountry: 'KR', captureCountry: 'KR', rightsholderCountry: 'KR', institution: info.institution, verificationBasis: 'KOGL item detail identifies a Korean public institution and Korean photographic context; semantic fit pending human review', detailPageSha256: info.detailSha256 } }, license: { classification: 'kogl-1' }, flags: { recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: true, geographicMismatch: false, casePartyImplication: false }, usageLabel: '국내 기관 자료사진·사건 현장과 무관', usageMode: need.usageMode, requestedDisplayPixels: need.requestedDisplayPixels, original: { relativePath: path.relative(root, file).replaceAll('\\', '/'), realpath: path.resolve(file), bytes: fileBytes.length, sha256: digest, width: decoded.width, height: decoded.height, preserved: true }, derivative: null });
        usedItems.add(candidate.recommendIdx); usedSha.add(digest); hashes.push({ assetId, phash: hash }); found = true; break;
      }
    } if (found) break; }
    if (!found) rejected.push({ storyId: story.storyId, cutId: need.cutId, queries, reason: 'no-unique-domestic-kogl1-photo' });
  }
  const manifest = { schema: 'newsroom-real-media-acquisition-v3-domestic-only', generatedAt: new Date().toISOString(), predecessor: { photoNeedsRun: path.relative(root, needsDir).replaceAll('\\', '/'), photoNeedsSha256: needs.approval.sha256, acquisitionRun: path.relative(root, seedDir).replaceAll('\\', '/'), acquisitionManifestSha256: seeded.seedManifestSha256, mergeMode: 'physical-copy-hash-verified' }, policy: { domesticOnly: true, originCountry: 'KR', captureCountry: 'KR', source: 'KOGL official search and item pages; expanded aliases and pagination', allowedLicense: ['kogl-1'], maxPrimaryReuse: 1, perceptualHammingThreshold: 8, providerInputDefault: 'denied', admission: false }, assets, rejected, counts: { requested: 46, acquired: assets.length, remaining: 46 - assets.length, uniquePrimary: usedSha.size }, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }); return { runDir, seeded: seeded.seed.assets.length, acquired: assets.length, added: assets.length - seeded.seed.assets.length, remaining: 46 - assets.length, rejected: rejected.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collectDomesticExpanded().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
