import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v1');
const base = 'https://gongu.copyright.or.kr';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const dims = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8'})).streams?.[0];
const phash = (file) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  let out = '';
  for (let i = 0; i < raw.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) if (raw[i + j] >= average) nibble |= 1 << (3 - j);
    out += nibble.toString(16);
  }
  return out;
};
const clean = (value) => String(value || '').replaceAll(/<[^>]+>/gu, ' ').replaceAll('&amp;', '&').replaceAll(/\s+/gu, ' ').trim();

// Each record is a discovery candidate for one sealed semantic cut. Collection
// does not admit it: visual QA and domestic-capture review remain separate.
const candidates = [
  {wrtSn: '13271544', storyId: 'police-father', cutId: 'cut-004', expected: '휴대전화 또는 사무실 통신 장면'},
  {wrtSn: '13271539', storyId: 'police-father', cutId: 'cut-009', expected: '수사·행정 서류를 대체할 사무실 문서 장면'},
  {wrtSn: '13220682', storyId: 'police-father', cutId: 'cut-014', expected: '공공기관 기록·문서 맥락'},
  {wrtSn: '13220118', storyId: 'jeju-school-intrusion', cutId: 'cut-001', expected: '국내 학교 교실 또는 복도 맥락'},
  {wrtSn: '13220120', storyId: 'jeju-school-intrusion', cutId: 'cut-002', expected: '국내 학교 책상'},
  {wrtSn: '13220110', storyId: 'jeju-school-intrusion', cutId: 'cut-004', expected: '국내 학교 내부'},
  {wrtSn: '13220112', storyId: 'jeju-school-intrusion', cutId: 'cut-007', expected: '국내 교실 출입·내부 맥락'},
  {wrtSn: '13383043', storyId: 'nurse-pesticide-coffee', cutId: 'cut-001', expected: '국내 촬영 커피'},
  {wrtSn: '13382895', storyId: 'nurse-pesticide-coffee', cutId: 'cut-011', expected: '국내 촬영 커피잔'},
  {wrtSn: '13382448', storyId: 'nurse-pesticide-coffee', cutId: 'cut-010', expected: '국내 촬영 음료 용기'},
  {wrtSn: '13297580', storyId: 'nurse-pesticide-coffee', cutId: 'cut-005', expected: '국내 국립의료원 병원 맥락'},
  {wrtSn: '13271538', storyId: 'nurse-pesticide-coffee', cutId: 'cut-012', expected: '의료 기록을 대체할 사무실 기록 장면'},
  {wrtSn: '11076094', storyId: 'police-father', cutId: 'cut-012', expected: '대한민국 도로의 실제 경찰차'},
  {wrtSn: '13002537', storyId: 'police-father', cutId: 'cut-010', expected: '국내 무인 CCTV·관제 맥락'},
  {wrtSn: '13003115', storyId: 'police-father', cutId: 'cut-008', expected: '국내 CCTV·증거 보존 맥락'},
  {wrtSn: '13003111', storyId: 'jeju-school-intrusion', cutId: 'cut-008', expected: '국내 무인 CCTV 맥락'},
  {wrtSn: '13050380', storyId: 'jeju-school-intrusion', cutId: 'cut-006', expected: '대한민국 학교 복도'},
  {wrtSn: '13005347', storyId: 'jeju-school-intrusion', cutId: 'cut-010', expected: '대한민국 학교 복도·교실'},
  {wrtSn: '13005958', storyId: 'jeju-school-intrusion', cutId: 'cut-014', expected: '대한민국 학교 복도·신발장'},
  {wrtSn: '13005346', storyId: 'jeju-school-intrusion', cutId: 'cut-015', expected: '대한민국 학교 복도·보관함'},
  {wrtSn: '13291751', storyId: 'nurse-pesticide-coffee', cutId: 'cut-001', expected: '국내 촬영 커피'},
  {wrtSn: '13291752', storyId: 'nurse-pesticide-coffee', cutId: 'cut-011', expected: '국내 촬영 커피잔'},
  {wrtSn: '13291756', storyId: 'nurse-pesticide-coffee', cutId: 'cut-010', expected: '국내 촬영 음료 용기'},
  {wrtSn: '13007212', storyId: 'nurse-pesticide-coffee', cutId: 'cut-005', expected: '국내 병원 진료실 맥락'},
  {wrtSn: '13007211', storyId: 'nurse-pesticide-coffee', cutId: 'cut-006', expected: '국내 병원 내부 맥락'},
];

async function get(url) {
  const response = await fetch(url, {headers: {'User-Agent': 'OpenCut-GonguDomesticCollector/1.0 (rights audit)'}});
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
      const title = clean(html.match(/<meta property="title" content="([^"]+)"/u)?.[1]);
      const creator = clean(html.match(/<meta property="creator" content="([^"]+)"/u)?.[1]);
      const resolution = html.match(/이미지저작물 해상도<\/dt>\s*<dd>\s*(\d+)\s*\*\s*(\d+)/u);
      const license = html.match(/<span class="fc_orange">[^<]+<\/span>의\s*"[^"]+"\s*은\s*<span class="fc_orange">([^<]+)<\/span>/u)?.[1]?.trim();
      const licenseUrl = html.match(/<a href=['"](https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.ko)['"]/u)?.[1];
      if (license !== 'CC BY' || !licenseUrl || !creator || !title) throw new Error('rights-metadata-not-cc-by');
      const sourceUrl = `${base}/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=${candidate.wrtSn}&fileSn=1`;
      const imageBytes = await get(sourceUrl);
      const digest = sha(imageBytes);
      if (usedSha.has(digest)) throw new Error('exact-duplicate');
      const assetId = `gongu-kr-${String(assets.length + 1).padStart(3, '0')}`;
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
        schema: 'gongu-domestic-photo-candidate-v1', assetId, storyId: candidate.storyId, cutId: candidate.cutId,
        expectedSemanticContribution: candidate.expected, title, creator,
        sourceClass: 'institutional-context', sourceUseStatus: 'conditional', providerInputStatus: 'denied',
        domesticOriginStatus: creator === '한국저작권위원회' ? 'confirmed-korean-rightsholder-capture-review-required' : 'korean-platform-capture-review-required',
        license: {code: 'CC-BY-4.0', statement: `${creator}의 "${title}"은 CC BY 라이선스로 제공됩니다.`, url: licenseUrl, attribution: `${title} / ${creator} / 공유마당 / CC BY 4.0`},
        evidence: {itemUrl, downloadUrl: sourceUrl, itemPageSha256: sha(pageBytes), itemPageBytes: pageBytes.length, rightsRelativePath: path.relative(root, rights).replaceAll('\\', '/')},
        original: {relativePath: path.relative(root, original).replaceAll('\\', '/'), sha256: digest, bytes: imageBytes.length, width: decoded.width, height: decoded.height, declaredWidth: Number(resolution?.[1] || 0), declaredHeight: Number(resolution?.[2] || 0)},
        phash: perceptualHash, visualQa: {reviewed: false, semanticPass: false, casePartyImplication: false},
      });
    } catch (error) {
      rejected.push({...candidate, reason: error.message});
    }
  }
  const manifest = {
    schema: 'gongu-domestic-photo-expansion-v1', generatedAt: new Date().toISOString(), source: {provider: '한국저작권위원회 공유마당', policyUrl: 'https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200093'},
    policy: {domesticOnly: true, allowedLicense: ['CC-BY-4.0'], maxPrimaryReuse: 1, providerInputDefault: 'denied', admission: false},
    assets, rejected, counts: {requested: candidates.length, acquired: assets.length, rejected: rejected.length, uniquePrimary: usedSha.size},
    production: {provider: false, render: false, upload: false, publication: false, stage07: false},
  };
  await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({runDir, counts: manifest.counts}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await collect();
