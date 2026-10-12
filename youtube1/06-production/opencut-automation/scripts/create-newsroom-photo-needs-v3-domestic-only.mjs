import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRealMediaNeedsContent } from './newsroom-real-media-admission.mjs';

const root = path.resolve(import.meta.dirname, '..');
const authority = path.join(root, 'out', 'studies', 'three-story-authority-reapproval-v2', 'run-20260815T051236587Z-a2871f');
const outRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v3-domestic-only');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const slugFiles = {
  'police-father': 'police-father.semantic-cut-plan.json',
  'jeju-school-intrusion': 'jeju-school-intrusion.semantic-cut-plan.json',
  'nurse-pesticide-coffee': 'nurse-pesticide-coffee.semantic-cut-plan.json'
};
const targets = { 'police-father': 16, 'jeju-school-intrusion': 15, 'nurse-pesticide-coffee': 15 };
const queries = {
  'police-father': ['전주 경찰서', '대한민국 경찰청', '경찰 수사', '디지털 포렌식', '대한민국 검찰청', '대한민국 법원', '경찰 장비', '증거 보관', '수사 서류', 'CCTV 관제센터', '치안센터', '대한민국 경찰차', '법원 복도', '공공기관 서류', '과학수사', '전라북도 경찰'],
  'jeju-school-intrusion': ['제주 학교 복도', '대한민국 빈 교실', '제주 경찰서', '제주 교육청', '제주 법원', '제주 학교 정문', '교실 출입문', '학교 CCTV', '제주 경찰', '대한민국 학교 복도', '교육청 건물', '법원 출입구', '경찰 통제선', '학교 교무실', '제주 공공기관 복도'],
  'nurse-pesticide-coffee': ['대한민국 커피잔', '대한민국 병원 복도', '대한민국 간호사실', '농약 용기', '병동 복도', '병원 빈 복도', '병원 접수대', '간호 스테이션', '실험실 용기', '의료 폐기물 용기', '커피 테이블', '의료 기록 책상', '대한민국 병원 외관', '병원 병동', '임상 검사 장비']
};

function needFor(slug, cut, index) {
  const real = index < targets[slug];
  const span = cut.spanBindings?.[0];
  return {
    storyId: slug,
    cutId: cut.cutId,
    order: cut.order,
    narrationAnchor: { spanId: span?.spanId || null, start: span?.start ?? null, end: span?.end ?? null, durationSeconds: cut.durationIntent?.authoredDurationSeconds },
    visualInformationNeed: real ? `sealed storyboard cut ${cut.cutId}의 국내 기관·국내 촬영 맥락 자료사진` : '민감하거나 사건 특정 재연이 필요한 생성 컷',
    searchQuery: real ? queries[slug][index] : null,
    sourceClass: real ? 'institutional-context' : 'grok-generated',
    usageMode: 'full-frame',
    requestedDisplayPixels: 972,
    domesticSourceRequired: real,
    originCountryRequired: real ? 'KR' : null,
    captureCountryRequired: real ? 'KR' : null,
    rightsPolicy: 'KOGL0/KOGL1, Korean-rightsholder CC0/Public Domain/CC BY, or written Korean rightsholder clearance only; foreign-hosted/foreign-captured assets denied; providerInputStatus=denied'
  };
}

export async function createNewsroomPhotoNeedsV3DomesticOnly() {
  const cases = [];
  for (const [slug, file] of Object.entries(slugFiles)) {
    const plan = JSON.parse(await fs.readFile(path.join(authority, file)));
    const cuts = plan.cuts.map((cut, index) => needFor(slug, cut, index));
    cases.push({ storyId: plan.caseId, slug, semanticCutPlanSha256: plan.approval.sha256, cutCount: cuts.length, cuts });
  }
  const artifact = {
    schema: 'newsroom-real-media-needs-v3-domestic-only',
    activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission',
    authorityRun: path.relative(root, authority).replaceAll('\\', '/'),
    generatedAt: new Date().toISOString(),
    supersedes: { schema: 'newsroom-real-media-needs-v2', reason: 'user-required domestic-origin and Korean-capture-only source policy' },
    policy: {
      searchAfterNeeds: true,
      domesticOnly: true,
      originCountry: 'KR',
      captureCountry: 'KR',
      allowedRights: ['kogl-0', 'kogl-1', 'korean-cc0', 'korean-public-domain', 'korean-cc-by', 'written-korean-rightsholder-clearance'],
      maxPrimaryReuse: 1,
      minimumUniquePrimaryRatio: 0.9,
      compositeAssignmentKey: 'storyId:cutId',
      noModuloAssignment: true,
      foreignAggregatorsAllowed: false
    },
    cases
  };
  artifact.approval = { approved: true, status: 'admitted', sha256: hashRealMediaNeedsContent(artifact) };
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = path.join(outRoot, runId);
  await fs.mkdir(outRoot, { recursive: true });
  await fs.mkdir(runDir, { recursive: false });
  await fs.writeFile(path.join(runDir, 'photo-needs.json'), json(artifact), { flag: 'wx' });
  await fs.writeFile(path.join(runDir, 'manifest.json'), json({ schema: 'newsroom-real-media-needs-v3-domestic-only-run', runId, photoNeeds: 'photo-needs.json', photoNeedsSha256: artifact.approval.sha256, realPhotoNeeds: 46, production: { provider: false, render: false, upload: false, publication: false, stage07: false } }), { flag: 'wx' });
  return { runDir, sha256: artifact.approval.sha256, realPhotoNeeds: 46 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createNewsroomPhotoNeedsV3DomesticOnly().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
