import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const acquisitionRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v1');
const outRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-visual-review-v1');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

const decisions = {
  'gongu-kr-001': ['rejected', '식별 가능한 남성 2명이 휴대전화를 보는 연출 사진으로 사건 관계자 오인 위험'],
  'gongu-kr-002': ['rejected', '식별 가능한 사무직 인물 2명이 있는 연출 사진으로 수사 당사자 오인 위험'],
  'gongu-kr-003': ['rejected', '책 클로즈업은 공공기관 기록·문서 컷에 의미가 부족함'],
  'gongu-kr-004': ['approved', '한국 학교 교실 벽면과 교육 게시물이 보이는 비식별 맥락 사진'],
  'gongu-kr-005': ['approved', '한국 학교 책상과 가방이 보이는 비식별 맥락 사진'],
  'gongu-kr-006': ['approved', '한국 학교 교실 내부가 명확한 비식별 맥락 사진'],
  'gongu-kr-007': ['rejected', '책상 위 책으로 교실 출입·문 장면을 충족하지 못함'],
  'gongu-kr-008': ['rejected', '식별 가능한 사무직 인물이 있어 의료기록 관계자 오인 위험'],
  'gongu-kr-009': ['approved', '대한민국 도로에서 경찰차가 보이는 실제 환경 사진; 사건 차량 아님 표기 필요'],
  'gongu-kr-010': ['rejected', '건물 외관에서 CCTV 장비가 명확히 식별되지 않음'],
  'gongu-kr-011': ['rejected', '도심 건물 사진으로 CCTV·증거보존 의미가 확인되지 않음'],
  'gongu-kr-012': ['rejected', '건물 사진으로 학교 CCTV 의미가 확인되지 않음'],
  'gongu-kr-013': ['approved', '대한민국 학교의 빈 복도가 명확함'],
  'gongu-kr-014': ['approved', '대한민국 학교 복도·로비가 명확하고 식별 인물이 없음'],
  'gongu-kr-015': ['approved', '대한민국 학교의 빈 복도와 신발장이 명확함'],
  'gongu-kr-016': ['conditional', '대한민국 학교 복도이나 멀리 식별 가능성이 있는 인물 1명; 크롭 또는 블러 필요'],
  'gongu-kr-017': ['approved', '국내 촬영 커피 제조 클로즈업; 손만 보이며 사건 음료 아님 표기 필요'],
  'gongu-kr-018': ['approved', '국내 촬영 커피머신과 잔; 사건 음료 아님 표기 필요'],
  'gongu-kr-019': ['approved', '국내 촬영 커피잔 2개; 사건 음료 아님 표기 필요'],
  'gongu-kr-020': ['rejected', '환자의 신체와 의료행위가 노출된 민감 의료 사진'],
  'gongu-kr-021': ['rejected', '식별 가능한 의료진·환자 상담 사진으로 사건 당사자 오인 위험'],
};

async function latestManifest() {
  const dirs = (await fs.readdir(acquisitionRoot, {withFileTypes: true})).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  for (const dir of dirs) { const file = path.join(acquisitionRoot, dir.name, 'manifest.json'); try { await fs.access(file); return file; } catch {} }
  throw new Error('no complete acquisition');
}

const manifestPath = await latestManifest();
const manifestBytes = await fs.readFile(manifestPath); const manifest = JSON.parse(manifestBytes);
if (manifest.assets.length !== Object.keys(decisions).length) throw new Error('review decision count mismatch');
const reviews = manifest.assets.map((asset) => {
  const decision = decisions[asset.assetId]; if (!decision) throw new Error(`missing decision ${asset.assetId}`);
  return {assetId: asset.assetId, storyId: asset.storyId, cutId: asset.cutId, title: asset.title, decision: decision[0], reason: decision[1], sourceSha256: asset.original.sha256, itemUrl: asset.evidence.itemUrl};
});
const contactSheet = path.join(path.dirname(manifestPath), 'contact-sheet.jpg'); const contactBytes = await fs.readFile(contactSheet);
const review = {schema: 'gongu-domestic-photo-visual-review-v1', generatedAt: new Date().toISOString(), acquisition: {manifestRelativePath: path.relative(root, manifestPath).replaceAll('\\', '/'), manifestSha256: sha(manifestBytes), contactSheetRelativePath: path.relative(root, contactSheet).replaceAll('\\', '/'), contactSheetSha256: sha(contactBytes)}, reviews, counts: {reviewed: reviews.length, approved: reviews.filter((entry) => entry.decision === 'approved').length, conditional: reviews.filter((entry) => entry.decision === 'conditional').length, rejected: reviews.filter((entry) => entry.decision === 'rejected').length}, production: {provider: false, render: false, upload: false, publication: false, stage07: false}};
const runDir = path.join(outRoot, `run-${new Date().toISOString().replaceAll(/[-:.]/gu, '')}-${crypto.randomBytes(3).toString('hex')}`); await fs.mkdir(runDir, {recursive: true});
const reviewPath = path.join(runDir, 'visual-review.json'); await fs.writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, {flag: 'wx'});
const manifestOut = {schema: 'gongu-domestic-photo-visual-review-manifest-v1', reviewRelativePath: path.relative(root, reviewPath).replaceAll('\\', '/'), reviewSha256: sha(await fs.readFile(reviewPath)), production: review.production};
await fs.writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifestOut, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({runDir, counts: review.counts}, null, 2));
