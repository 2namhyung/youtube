import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v2');
const base = 'https://gongu.copyright.or.kr';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const dims = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8'})).streams?.[0];
const phash = (file) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  let out = '';
  for (let i = 0; i < raw.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j += 1) if (raw[i + j] >= average) nibble |= 1 << (3 - j);
    out += nibble.toString(16);
  }
  return out;
};
const clean = (value) => String(value || '').replaceAll(/<[^>]+>/gu, ' ').replaceAll('&amp;', '&').replaceAll(/\s+/gu, ' ').trim();

// These records were discovered from the official Gongu item pages. They are
// generic Korean photographic contexts, not incident evidence. Each record is
// bound to one sealed storyId:cutId and never reused in this run.
const candidates = [
  {wrtSn: '13220151', storyId: 'police-father', cutId: 'cut-003', expected: '국내 촬영 카메라 소품 — 감시·기록 장치의 일반 자료사진', query: '공유마당 카메라 사진'},
  {wrtSn: '13219670', storyId: 'police-father', cutId: 'cut-006', expected: '국내 촬영 카메라 소품 — 수사 기록 장치의 일반 자료사진', query: '공유마당 카메라 사진'},
  {wrtSn: '13219784', storyId: 'jeju-school-intrusion', cutId: 'cut-008', expected: '국내 촬영 카메라 소품 — CCTV 장치 개념 자료사진', query: '공유마당 카메라 사진'},
  {wrtSn: '13211860', storyId: 'police-father', cutId: 'cut-009', expected: '국내 촬영 책상·문서 — 기록 검토 개념 자료사진', query: '공유마당 책상 문서 사진'},
  {wrtSn: '9046403', storyId: 'nurse-pesticide-coffee', cutId: 'cut-006', expected: '국내 촬영 노트북·책상 — 디지털 기록 검토 개념 자료사진', query: '공유마당 노트북 책상 사진'},
  {wrtSn: '9046593', storyId: 'nurse-pesticide-coffee', cutId: 'cut-007', expected: '국내 촬영 책·문헌 — 기록 자료 일반 사진', query: '공유마당 책 문헌 사진'},
];

async function get(url) {
  const response = await fetch(url, {headers: {'User-Agent': 'OpenCut-GonguDomesticCollector/2.0 (rights audit)'}});
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function collect() {
  const stamp = new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z');
  const runDir = path.join(outRoot, `run-${stamp}-${crypto.randomBytes(3).toString('hex')}`);
  await fs.mkdir(path.join(runDir, 'originals'), {recursive: true});
  await fs.mkdir(path.join(runDir, 'rights'), {recursive: true});
  const assets = [];
  const rejected = [];
  const usedSha = new Set();
  const usedPHash = new Set();

  for (const candidate of candidates) {
    const itemUrl = `${base}/gongu/wrt/wrt/view.do?menuNo=200018&wrtSn=${candidate.wrtSn}`;
    try {
      const pageBytes = await get(itemUrl);
      const html = pageBytes.toString('utf8');
      if (!html.includes('CC BY') || !html.includes('공유저작물 다운로드')) throw new Error('rights-metadata-not-cc-by');
      const title = clean(html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/u)?.[1]) || clean(html.match(/<title>([^<]+)/u)?.[1]);
      const creator = clean(html.match(/<meta[^>]+name="author"[^>]+content="([^"]+)"/u)?.[1]) || (html.includes('한국저작권위원회') ? '한국저작권위원회' : null);
      if (!title || !creator) throw new Error('missing-item-identity');
      const sourceUrl = `${base}/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=${candidate.wrtSn}&fileSn=1`;
      const imageBytes = await get(sourceUrl);
      const digest = sha(imageBytes);
      if (usedSha.has(digest)) throw new Error('exact-duplicate');
      const assetId = `gongu-v2-${String(assets.length + 1).padStart(3, '0')}`;
      const original = path.join(runDir, 'originals', `${assetId}.jpg`);
      const rights = path.join(runDir, 'rights', `${assetId}.html`);
      await fs.writeFile(original, imageBytes, {flag: 'wx'});
      await fs.writeFile(rights, pageBytes, {flag: 'wx'});
      const decoded = dims(original);
      if (!decoded || Math.min(decoded.width, decoded.height) < 480) throw new Error('below-480-or-undecodable');
      const perceptualHash = phash(original);
      if (usedPHash.has(perceptualHash)) throw new Error('perceptual-duplicate');
      usedSha.add(digest); usedPHash.add(perceptualHash);
      assets.push({
        schema: 'gongu-domestic-photo-candidate-v2', assetId, storyId: candidate.storyId, cutId: candidate.cutId,
        expectedSemanticContribution: candidate.expected, candidateTitle: title, creator,
        sourceClass: 'institutional-context', sourceUseStatus: 'conditional', providerInputStatus: 'denied', coverageEligible: false,
        semanticReview: {status: 'pending-human-visual-qa', approved: false},
        license: {code: 'CC-BY-4.0', statement: '공유마당 item page displays CC BY; item-level rights require attribution', url: 'https://creativecommons.org/licenses/by/4.0/deed.ko'},
        evidence: {itemUrl, originUrl: itemUrl, downloadUrl: sourceUrl, rightsUrl: 'https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200093', exactRightsStatement: 'CC BY', licenseVersion: 'CC BY 4.0', provider: 'gongu-madang', query: candidate.query, retrievedAt: new Date().toISOString(), itemPageSha256: sha(pageBytes), itemPageBytes: pageBytes.length, sourceSha256: digest, rightsRelativePath: path.relative(root, rights).replaceAll('\\', '/'), domesticOrigin: {originCountry: 'KR', captureCountry: 'KR', rightsholderCountry: 'KR', institution: '한국저작권위원회 공유마당', verificationBasis: 'Korean Gongu item page identifies Korean provider/rightsholder and Korean capture metadata; visual capture review pending'}},
        flags: {recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: false, geographicMismatch: false, casePartyImplication: false},
        usageLabel: '국내 자료사진·실제 사건과 무관', usageMode: 'full-frame', requestedDisplayPixels: 972,
        original: {relativePath: path.relative(root, original).replaceAll('\\', '/'), realpath: path.resolve(original), bytes: imageBytes.length, sha256: digest, width: decoded.width, height: decoded.height, preserved: true},
        phash: perceptualHash,
      });
    } catch (error) {
      rejected.push({...candidate, reason: error.message});
    }
  }
  const manifest = {schema: 'gongu-domestic-photo-expansion-v2', generatedAt: new Date().toISOString(), source: {provider: '한국저작권위원회 공유마당', policyUrl: 'https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200093'}, policy: {domesticOnly: true, allowedLicense: ['CC-BY-4.0'], maxPrimaryReuse: 1, providerInputDefault: 'denied', admission: false}, assets, rejected, counts: {requested: candidates.length, acquired: assets.length, rejected: rejected.length, uniquePrimary: usedSha.size}, production: {provider: false, render: false, upload: false, publication: false, stage07: false}};
  await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({runDir, counts: manifest.counts}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await collect();
