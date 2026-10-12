import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MODERN_MIN_YEAR} from './newsroom-real-media-temporal.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-modern-v1');
const base = 'https://gongu.copyright.or.kr';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value || '').replaceAll(/<[^>]+>/gu, ' ').replaceAll(/&amp;/gu, '&').replaceAll(/\s+/gu, ' ').trim();
const dims = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8'})).streams?.[0];
const phash = file => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((a, b) => a + b, 0) / raw.length;
  let out = '';
  for (let i = 0; i < raw.length; i += 4) { let n = 0; for (let j = 0; j < 4; j += 1) if (raw[i + j] >= average) n |= 1 << (3 - j); out += n.toString(16); }
  return out;
};
const candidates = [
  {wrtSn: '13271544', storyId: 'police-father', cutId: 'cut-002', expected: '국내 현대 사무실 맥락', rule: 'modern-laptop', visual: 'reject-recognizable-people'},
  {wrtSn: '13271539', storyId: 'police-father', cutId: 'cut-003', expected: '국내 현대 사무실 맥락', rule: 'modern-laptop', visual: 'reject-recognizable-people'},
  {wrtSn: '13271538', storyId: 'police-father', cutId: 'cut-004', expected: '국내 현대 사무실 맥락', rule: 'modern-laptop', visual: 'reject-recognizable-people'},
  {wrtSn: '13291751', storyId: 'nurse-pesticide-coffee', cutId: 'cut-001', expected: '국내 현대 커피 사물사진', rule: 'modern-generic', visual: 'approve-object-only'},
  {wrtSn: '13291752', storyId: 'nurse-pesticide-coffee', cutId: 'cut-002', expected: '국내 현대 커피 사물사진', rule: 'modern-generic', visual: 'approve-object-only'},
  {wrtSn: '13291756', storyId: 'nurse-pesticide-coffee', cutId: 'cut-003', expected: '국내 현대 커피 사물사진', rule: 'modern-generic', visual: 'approve-object-only'},
];
async function get(url) { const r = await fetch(url, {headers: {'User-Agent': 'OpenCut-GonguDomesticModernCollector/1.0 (rights audit)'}}); if (!r.ok) throw new Error(`${r.status} ${url}`); return Buffer.from(await r.arrayBuffer()); }

export async function collect() {
  const stamp = new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z');
  const runDir = path.join(outRoot, `run-${stamp}-${crypto.randomBytes(3).toString('hex')}`);
  await fs.mkdir(path.join(runDir, 'originals'), {recursive: true}); await fs.mkdir(path.join(runDir, 'rights'), {recursive: true});
  const assets = []; const rejected = []; const hashes = new Set(); const phashes = new Set();
  for (const c of candidates) {
    const itemUrl = `${base}/gongu/wrt/wrt/view.do?menuNo=200018&wrtSn=${c.wrtSn}`;
    const downloadUrl = `${base}/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=${c.wrtSn}&fileSn=1`;
    try {
      const page = await get(itemUrl); const html = page.toString('utf8');
      if (!html.includes('CC BY') || !html.includes('창작년도')) throw new Error('missing-item-level-cc-by-or-date');
      const date = html.match(/창작년도<\/dt>\s*<dd>\s*([^<]+)/u)?.[1]?.trim() || null;
      const year = date ? Number.parseInt(date.slice(0, 4), 10) : null;
      if (year == null || year < MODERN_MIN_YEAR) throw new Error('not-2020s-capture');
      const title = clean(html.match(/property="og:title"[^>]+content="([^"]+)/u)?.[1]) || `Gongu ${c.wrtSn}`;
      const image = await get(downloadUrl); const digest = sha(image); if (hashes.has(digest)) throw new Error('exact-duplicate');
      const id = `gongu-modern-${String(assets.length + 1).padStart(3, '0')}`; const original = path.join(runDir, 'originals', `${id}.jpg`); const rights = path.join(runDir, 'rights', `${id}.html`);
      await fs.writeFile(original, image, {flag: 'wx'}); await fs.writeFile(rights, page, {flag: 'wx'});
      const d = dims(original); if (!d || Math.min(d.width, d.height) < 480) throw new Error('below-480-or-undecodable');
      const ph = phash(original); if (phashes.has(ph)) throw new Error('perceptual-duplicate'); hashes.add(digest); phashes.add(ph);
      const rejectedByVisual = c.visual.startsWith('reject');
      assets.push({schema: 'gongu-domestic-photo-modern-candidate-v1', assetId: id, storyId: c.storyId, cutId: c.cutId, expectedSemanticContribution: c.expected, title, creator: '한국저작권위원회', sourceClass: 'institutional-context', sourceUseStatus: rejectedByVisual ? 'rejected' : 'approved', providerInputStatus: 'denied', coverageEligible: false, temporalRule: c.rule, captureDate: date, captureYear: year, temporalEra: 'modern-2020s', technologyGeneration: c.rule === 'modern-laptop' ? 'modern-office' : 'smartphone-era', anachronismFlags: {opticalDiscDrive: false, featurePhone: false, opticalDiscDriveVisible: false, featurePhoneVisible: false, crtDisplay: false, datedMedia: false, unknownCaptureDate: false}, license: {code: 'CC-BY-4.0', statement: 'Official Gongu item page displays CC BY.', url: 'https://creativecommons.org/licenses/by/4.0/deed.ko'}, evidence: {itemUrl, downloadUrl, itemPageSha256: sha(page), itemPageBytes: page.length, sourceSha256: digest, rightsRelativePath: path.relative(root, rights).replaceAll('\\', '/')}, original: {relativePath: path.relative(root, original).replaceAll('\\', '/'), realpath: path.resolve(original), sha256: digest, bytes: image.length, width: d.width, height: d.height, preserved: true}, phash: ph});
    } catch (error) { rejected.push({...c, reason: error.message}); }
  }
  const manifest = {schema: 'gongu-domestic-photo-modern-v1', generatedAt: new Date().toISOString(), source: {provider: '한국저작권위원회 공유마당', policyUrl: 'https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200093'}, policy: {domesticOnly: true, allowedLicense: ['CC-BY-4.0'], modernMinYear: MODERN_MIN_YEAR, maxPrimaryReuse: 1, providerInputDefault: 'denied', admission: false}, temporalNeeds: assets.map(a => ({storyId: a.storyId, cutId: a.cutId, temporalRule: a.temporalRule, captureDate: a.captureDate, captureYear: a.captureYear, temporalEra: a.temporalEra, technologyGeneration: a.technologyGeneration, anachronismFlags: a.anachronismFlags})), assets, rejected, counts: {requested: candidates.length, acquired: assets.length, approved: assets.filter(a => a.sourceUseStatus === 'approved').length, rejectedVisual: assets.filter(a => a.sourceUseStatus === 'rejected').length, failed: rejected.length}, production: {provider: false, render: false, upload: false, publication: false, stage07: false}};
  await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
  const review = {schema: 'gongu-domestic-photo-modern-visual-review-v1', runDir: path.relative(root, runDir).replaceAll('\\', '/'), reviewedAt: new Date().toISOString(), assets: assets.map(a => ({assetId: a.assetId, storyId: a.storyId, cutId: a.cutId, decision: a.sourceUseStatus, reason: a.sourceUseStatus === 'approved' ? 'object-only; no identifiable people, logos, or incident implication' : 'recognizable people; fail closed'})), counts: {approved: assets.filter(a => a.sourceUseStatus === 'approved').length, conditional: 0, rejected: assets.filter(a => a.sourceUseStatus === 'rejected').length}};
  await fs.writeFile(path.join(runDir, 'visual-review.json'), `${JSON.stringify(review, null, 2)}\n`, {flag: 'wx'});
  const inputs = assets.map(a => path.join(root, a.original.relativePath));
  if (inputs.length) {
    const args = ['-y', '-v', 'error'];
    for (const file of inputs) args.push('-loop', '1', '-i', file);
    const filters = inputs.map((_, i) => `[${i}:v]scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
    filters.push('[v0][v1][v2]hstack=inputs=3[top]');
    filters.push('[v3][v4][v5]hstack=inputs=3[bottom]');
    filters.push('[top][bottom]vstack=inputs=2');
    args.push('-filter_complex', filters.join(';'), '-frames:v', '1', path.join(runDir, 'contact-sheet.jpg'));
    execFileSync('ffmpeg', args, {stdio: 'ignore'});
    const contactPath = path.join(runDir, 'contact-sheet.jpg');
    await fs.writeFile(path.join(runDir, 'contact-sheet.json'), `${JSON.stringify({schema: 'gongu-domestic-photo-modern-contact-sheet-v1', file: 'contact-sheet.jpg', sha256: sha(await fs.readFile(contactPath)), bytes: (await fs.stat(contactPath)).size, visualQa: 'primary-agent-contact-sheet-inspection'}, null, 2)}\n`, {flag: 'wx'});
  }
  console.log(JSON.stringify({runDir, counts: manifest.counts}, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await collect();
