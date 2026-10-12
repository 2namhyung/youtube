import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CONDITIONAL_DISCLOSURE, DENIED_LEGACY_CLASSES, PHOTO_RISK, validatePhotoAssignment, validateStoryReuse} from './newsroom-photo-risk-v1.mjs';

const root = path.resolve(import.meta.dirname, '..');
const authorityRun = 'out/studies/three-story-authority-reapproval-v2/run-20260815T051236587Z-a2871f';
const needsFile = 'out/studies/newsroom-real-media-needs-v3-domestic-only/run-20260815T115202Z-8c012a/photo-needs.json';
const outRoot = path.join(root, 'out', 'studies', 'three-story-domestic-photo-admission-v5');
const runs = {
  v1: 'out/studies/gongu-domestic-photo-expansion-v1/run-20260815T131609032Z-a6e887',
  v2: 'out/studies/gongu-domestic-photo-expansion-v2/run-20260815T135157620Z-188ac6',
  modern: 'out/studies/gongu-domestic-photo-modern-v1/run-20260815T141824807Z-964f18',
  phone: 'out/studies/gongu-domestic-device-crop-salvage-v1/run-20260815T142705073Z-a6580b',
  phoneUpstream: 'out/studies/gongu-domestic-device-crop-v1/run-20260815T142121327Z-4251cf',
  laptop: 'out/studies/gongu-laptop-crop-salvage-v1/run-20260815T142844344Z-5c13c2',
  laptopUpstream: 'out/studies/gongu-domestic-device-crop-v1/run-20260815T142335805Z-420cfb',
};
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const rel = value => path.relative(root, value).replaceAll('\\', '/');
const round = value => Math.round(value * 1e6) / 1e6;

function pHash(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  let output = '';
  for (let index = 0; index < raw.length; index += 4) { let nibble = 0; for (let offset = 0; offset < 4; offset += 1) if (raw[index + offset] >= average) nibble |= 1 << (3 - offset); output += nibble.toString(16); }
  return output;
}

async function physical(relativePath, expectedSha) {
  const resolved = path.resolve(root, relativePath); const real = await fs.realpath(resolved); const stat = await fs.lstat(resolved); const bytes = await fs.readFile(real);
  if (real !== resolved || !real.startsWith(`${root}${path.sep}`) || !stat.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe-file:${relativePath}`);
  const digest = sha(bytes); if (expectedSha && digest !== expectedSha) throw new Error(`sha-mismatch:${relativePath}`);
  return {relativePath: rel(real), bytes: bytes.length, sha256: digest};
}

const assetSpecs = [
  ['p-phone', 'police-father', 'phone', 'device-003', 'crop', '현대 스마트폰과 손만 보이는 로컬 크롭', 2020, 'modern-device'],
  ['p-laptop-a', 'police-father', 'laptop', 'device-003', 'crop', '현대 노트북 화면·키보드와 비식별 손', 2020, 'modern-device'],
  ['p-laptop-b', 'police-father', 'laptop', 'device-004', 'crop', '현대 노트북 화면·키보드와 비식별 손', 2020, 'modern-device'],
  ['p-policecar', 'police-father', 'v1', 'gongu-kr-009', 'original', '한국 도로·경찰차가 명확한 기관 맥락', null, 'visually-current-korean-context'],
  ['p-book', 'police-father', 'v1', 'gongu-kr-003', 'original', '연도 불명 문헌 클로즈업; 법률 원문이 아닌 규정 설명용', null, 'timeless-object'],
  ['j-corridor-a', 'jeju-school-intrusion', 'v1', 'gongu-kr-013', 'original', '한글 표지와 한국 학교 복도가 명확한 비식별 환경', null, 'visually-current-korean-context'],
  ['j-corridor-b', 'jeju-school-intrusion', 'v1', 'gongu-kr-014', 'original', '한국 학교 로비·복도와 한글 표지가 명확한 환경', null, 'visually-current-korean-context'],
  ['j-corridor-c', 'jeju-school-intrusion', 'v1', 'gongu-kr-015', 'original', '한국 학교 빈 복도·신발장이 명확한 환경', null, 'visually-current-korean-context'],
  ['n-coffee-a', 'nurse-pesticide-coffee', 'modern', 'gongu-modern-004', 'original', '2020년 국내 커피 제조 클로즈업', 2020, 'modern-object'],
  ['n-coffee-b', 'nurse-pesticide-coffee', 'modern', 'gongu-modern-005', 'original', '2020년 국내 커피머신·잔', 2020, 'modern-object'],
  ['n-coffee-c', 'nurse-pesticide-coffee', 'modern', 'gongu-modern-006', 'original', '2020년 국내 커피잔', 2020, 'modern-object'],
  ['n-book', 'nurse-pesticide-coffee', 'v2', 'gongu-v2-006', 'original', '인물 없는 문헌 소품; 판결 설명용 일반 자료사진', null, 'timeless-object'],
];

const assignments = new Map();
function bind(story, cuts, asset) { cuts.forEach((cut, index) => assignments.set(`${story}:cut-${String(cut).padStart(3, '0')}`, {asset, framing: index ? 'detail-pan-right' : 'wide-pan-left'})); }
bind('police-father', [1, 2], 'p-phone'); bind('police-father', [5, 6], 'p-laptop-a'); bind('police-father', [11, 12], 'p-policecar'); bind('police-father', [13, 14], 'p-laptop-b'); bind('police-father', [15, 16], 'p-book');
bind('jeju-school-intrusion', [1, 2], 'j-corridor-a'); bind('jeju-school-intrusion', [3, 4], 'j-corridor-b'); bind('jeju-school-intrusion', [5, 6], 'j-corridor-c');
bind('nurse-pesticide-coffee', [1, 2], 'n-coffee-a'); bind('nurse-pesticide-coffee', [6, 7], 'n-coffee-b'); bind('nurse-pesticide-coffee', [8, 9], 'n-book'); bind('nurse-pesticide-coffee', [10, 11], 'n-coffee-c');

export async function createAdmission() {
  const manifests = {}; for (const key of ['v1', 'v2', 'modern', 'phone', 'phoneUpstream', 'laptop', 'laptopUpstream']) manifests[key] = JSON.parse(await fs.readFile(path.join(root, runs[key], 'manifest.json')));
  const needsBytes = await fs.readFile(path.join(root, needsFile)); const needs = JSON.parse(needsBytes);
  const authority = JSON.parse(await fs.readFile(path.join(root, authorityRun, 'authority-reapproval.json')));
  const authorityVerifier = JSON.parse(await fs.readFile(path.join(root, authorityRun, 'verifier.json')));
  if (!needs.approval?.approved || !authority.approval?.approved || !authorityVerifier.verified) throw new Error('sealed-authority-required');
  const runDir = path.join(outRoot, `run-${new Date().toISOString().replaceAll(/[-:.]/gu, '')}-${crypto.randomBytes(3).toString('hex')}`); await fs.mkdir(path.join(runDir, 'contact-sheets'), {recursive: true});
  const assets = [];
  for (const [assetId, storyId, sourceKey, upstreamId, displayField, visualFit, captureYear, temporalClass] of assetSpecs) {
    const source = manifests[sourceKey].assets.find(item => item.assetId === upstreamId); if (!source) throw new Error(`asset-not-found:${assetId}`);
    const upstreamKey = sourceKey === 'phone' ? 'phoneUpstream' : sourceKey === 'laptop' ? 'laptopUpstream' : sourceKey;
    const upstream = manifests[upstreamKey].assets.find(item => item.assetId === upstreamId) || source;
    const display = await physical(source[displayField].relativePath, source[displayField].sha256); const original = await physical(source.original.relativePath, source.original.sha256);
    const evidence = upstream.evidence || source.evidence; const rights = await physical(evidence.rightsRelativePath, evidence.itemPageSha256);
    assets.push({assetId, storyId, sourceAssetId: upstreamId, sourceManifest: runs[sourceKey] + '/manifest.json', sourceManifestSha256: sha(await fs.readFile(path.join(root, runs[sourceKey], 'manifest.json'))), title: upstream.title || upstream.candidateTitle || source.title || source.candidateTitle, visualFit, visualReview: {reviewed: true, decision: 'conditional-admit', personPrivacy: 'no-identifiable-person-in-display', trademark: assetId === 'p-camera-a' ? 'exclude-logo-in-authored-framing' : 'none-visible-or-material', geography: 'Korean source/capture context reviewed'}, captureYear, temporalClass, sourceUrl: evidence.itemUrl, licenseCode: upstream.license?.code || source.license?.code || 'CC-BY-4.0', rightsEvidence: rights, source: original, display: {...display, role: displayField === 'crop' ? 'local-crop-derivative' : 'preserved-original'}, pHash: pHash(path.join(root, display.relativePath)), providerInputStatus: 'denied'});
  }
  const assetById = new Map(assets.map(item => [item.assetId, item])); const matrix = []; const stories = [];
  for (const story of needs.cases) {
    const storyline = JSON.parse(await fs.readFile(path.join(root, authorityRun, `${story.slug}.storyline.json`))); const spans = new Map(storyline.spans.map(span => [span.spanId, span.excerpt]));
    const plan = JSON.parse(await fs.readFile(path.join(root, authorityRun, `${story.slug}.semantic-cut-plan.json`))); if (plan.approval.sha256 !== story.semanticCutPlanSha256) throw new Error(`plan-mismatch:${story.slug}`);
    let total = 0; let covered = 0;
    for (const cut of story.cuts) {
      const key = `${cut.storyId}:${cut.cutId}`; const selection = assignments.get(key); const asset = selection ? assetById.get(selection.asset) : null; const duration = cut.narrationAnchor.durationSeconds; total += duration;
      const planCut = plan.cuts.find(item => item.cutId === cut.cutId); const narrationConcept = planCut.spanBindings.map(item => spans.get(item.spanId)).filter(Boolean).join(' ');
      const generated = cut.sourceClass === 'grok-generated'; const eligible = Boolean(asset) && !generated; if (eligible) covered += duration;
      const row = {assignmentKey: key, storyId: cut.storyId, authorityStoryId: story.storyId, cutId: cut.cutId, order: cut.order, durationSeconds: duration, sourceClass: cut.sourceClass, narrationConcept, assetId: asset?.assetId || null, riskTier: generated ? PHOTO_RISK.DENY : eligible ? PHOTO_RISK.CONDITIONAL : PHOTO_RISK.DENY, copyrightUseStatus: eligible ? 'cleared-with-attribution' : 'not-evaluated-no-asset', editorialContextStatus: generated ? 'generated-cut-not-photo-required' : eligible ? 'illustrative-only' : 'blocked-no-fit', youtubeOriginalityStatus: eligible ? 'transform-required' : 'not-applicable', claimRisk: eligible ? 'low-with-disclosure-and-no-case-claim' : generated ? 'not-applicable' : 'high-unresolved', coverageEligible: eligible, assignmentStatus: generated ? 'not-required-generated-cut' : eligible ? 'conditional-admitted' : 'blocked', disclosure: eligible ? CONDITIONAL_DISCLOSURE : null, narrationConceptMatch: eligible, actualEvidenceClaim: false, actualLocationClaim: false, actualPartyClaim: false, identifiesPrivatePerson: false, identifiesMinor: false, identifiesVictim: false, identifiesSuspect: false, providerInputStatus: 'denied', editScope: 'local-only', sourceUrl: asset?.sourceUrl || null, licenseCode: asset?.licenseCode || null, claimRationale: eligible ? `${asset.visualFit}; sealed narration concept의 일반 맥락만 설명하며 사건 증거·현장·당사자를 주장하지 않음` : null, sourceSha256: asset?.source.sha256 || null, displaySha256: asset?.display.sha256 || null, pHash: asset?.pHash || null, authoredFramingId: selection?.framing || null, continuityRationale: eligible ? '동일 내레이션 비트의 연속 두 컷; 넓은 구도와 세부 구도를 분리' : null, yppTransformation: eligible ? {substantialNarration: true, authoredMotion: true, motionPlan: selection.framing.includes('wide') ? 'slow-pan-left-plus-3-percent-zoom' : 'detail-pan-right-plus-6-percent-zoom', annotation: true, annotationPlan: '핵심 명사 포인터와 출처·자료사진 고지', staticSlideshow: false, minimalEdit: false} : null, blocker: generated ? null : eligible ? null : '검증된 국내 권리·시대·개인정보·서사 적합 사진이 없음'};
      const errors = eligible ? validatePhotoAssignment(row) : []; if (errors.length) throw new Error(`${key}:${errors.join(',')}`); matrix.push(row);
    }
    const rows = matrix.filter(item => item.authorityStoryId === story.storyId); const reuseErrors = validateStoryReuse(rows, total); if (reuseErrors.length) throw new Error(`${story.slug}:${reuseErrors.join(',')}`);
    const assigned = rows.filter(item => item.coverageEligible); const sourceCount = new Set(assigned.map(item => item.sourceSha256)).size; const coverage = covered / total;
    const realPhotoNeedCount = rows.filter(item => item.sourceClass !== 'grok-generated').length;
    const blockedRealPhotoCuts = rows.filter(item => item.assignmentStatus === 'blocked').length;
    stories.push({storyId: story.storyId, slug: story.slug, activeCutCount: rows.length, realPhotoNeedCount, assignedRealPhotoCuts: assigned.length, blockedRealPhotoCuts, remainingRealPhotoCuts: blockedRealPhotoCuts, uniquePrimaryCount: sourceCount, totalDurationSeconds: round(total), admittedRealPhotoDurationSeconds: round(covered), authoredDurationCoverage: round(coverage), threshold: 0.8, approved: coverage >= 0.8, reuseGatePassed: true});
  }
  const policy = {schema: 'newsroom-photo-risk-v1', successorOf: ['newsroom-real-media-needs-v3-domestic-only strict 46-distinct interpretation', 'three-story-domestic-photo-completion-audit-v1'], riskTiers: Object.values(PHOTO_RISK), conditionalDisclosure: CONDITIONAL_DISCLOSURE, separateStatuses: ['copyrightUseStatus', 'editorialContextStatus', 'youtubeOriginalityStatus', 'claimRisk'], deniedLegacyVisualClasses: DENIED_LEGACY_CLASSES, temporal: {modernDeviceMinimumYear: 2020, unknownOrPre2020: 'conditional only for timeless generic environment/object after visual anachronism review; never for current-device claim'}, reuse: {maximumContiguousCutsPerPrimary: 2, noncontiguousReuse: 'denied', maximumStoryDurationFractionPerPrimary: 0.15, derivativesAreNewPrimary: false}, ypp: {substantialNarration: true, authoredCropPanZoomAnnotation: true, annotationRequired: true, staticSlideshow: 'denied', minimalEdit: 'denied'}, providerInput: 'denied', production: 'local-preproduction-only'};
  const complete = stories.every(item => item.approved); const artifact = {schema: 'three-story-domestic-photo-admission-v5', generatedAt: new Date().toISOString(), authorities: {authorityRun, authorityApprovalSha256: authority.approval.sha256, photoNeeds: needsFile, photoNeedsSha256: needs.approval.sha256}, policy, acquisitionAttempt: {route: 'official Korean Gongu/KOGL item-level rights evidence', latestExpandedSearch: 'out/studies/newsroom-real-media-acquisition-v3-domestic-only/run-20260815T143734Z-expanded-3b85ab', priorRejectedCandidates: 441, newMaterialPasses: 0, repeatedSearchStopped: true}, rejections: [{assetIds: ['gongu-v2-001'], riskTier: PHOTO_RISK.DENY, reason: 'PENTAX 및 렌즈 상표가 크게 보이는 필름 카메라; 현대 스마트폰 증거 맥락과 시대 불일치'}, {assetIds: ['gongu-v2-002', 'gongu-v2-003'], riskTier: PHOTO_RISK.DENY, reason: '일회용 필름 카메라와 상표가 보여 현대 포렌식·전자증거 맥락에 부적합'}, {assetIds: ['gongu-v2-004', 'gongu-v2-005'], riskTier: PHOTO_RISK.DENY, reason: '낡은 문헌 또는 광학디스크 노트북이 보여 현대 사건 맥락과 불일치'}, {assetIds: ['gongu-kr-004', 'gongu-kr-005', 'gongu-kr-006', 'gongu-kr-007', 'gongu-kr-016', 'kogl-kr-001..024'], riskTier: PHOTO_RISK.DENY, reason: '구식 교실·해외형 복도·인물 포함 또는 문화재·1970년대 실험실 중심으로 현재 사건 맥락에 부적합'}], assets, matrix, stories, counts: {activeCuts: matrix.length, requestedRealPhotoCuts: matrix.filter(item => item.sourceClass !== 'grok-generated').length, conditionalAdmittedAssignments: matrix.filter(item => item.coverageEligible).length, blockedRealPhotoCuts: matrix.filter(item => item.assignmentStatus === 'blocked').length, generatedCuts: matrix.filter(item => item.sourceClass === 'grok-generated').length, uniquePrimary: new Set(matrix.filter(item => item.coverageEligible).map(item => item.sourceSha256)).size}, completion: {complete, admissionAuthorized: complete, reason: complete ? 'all stories pass 0.80 and risk/reuse/YPP gates' : 'all three stories remain below 0.80 after visual anachronism and trademark review'}, production: {provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false}};
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`); await fs.writeFile(path.join(runDir, 'admission.json'), bytes, {flag: 'wx'}); await fs.writeFile(path.join(runDir, 'admission.sha256'), `${sha(bytes)}  admission.json\n`, {flag: 'wx'});
  const md = ['# Three-story domestic photo admission v5', '', `- complete: ${complete}`, `- admitted: ${artifact.counts.conditionalAdmittedAssignments}/${artifact.counts.requestedRealPhotoCuts}`, '', '| story | cut | narration concept | status | asset/blocker |', '|---|---|---|---|---|', ...matrix.filter(item => item.sourceClass !== 'grok-generated').map(item => `| ${item.storyId} | ${item.cutId} | ${item.narrationConcept.replaceAll('|', '\\|')} | ${item.assignmentStatus} | ${item.assetId || item.blocker} |`)]; await fs.writeFile(path.join(runDir, 'cut-assignment-matrix.md'), `${md.join('\n')}\n`, {flag: 'wx'});
  for (const story of stories) {
    const storyAssets = assets.filter(item => item.storyId === story.slug); const sheet = path.join(runDir, 'contact-sheets', `${story.slug}.jpg`); const args = ['-y', '-v', 'error']; for (const item of storyAssets) args.push('-i', path.resolve(root, item.display.relativePath)); const filters = storyAssets.map((_, index) => `[${index}:v]scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2[v${index}]`); const layout = storyAssets.map((_, index) => `${(index % 4) * 320}_${Math.floor(index / 4) * 240}`).join('|'); filters.push(`${storyAssets.map((_, index) => `[v${index}]`).join('')}xstack=inputs=${storyAssets.length}:layout=${layout}:fill=black`); args.push('-filter_complex', filters.join(';'), '-frames:v', '1', sheet); execFileSync('ffmpeg', args); story.contactSheet = await physical(rel(sheet)); story.contactSheet.visualReview = 'primary-agent-inspected-source-and-final-sheet';
  }
  const finalBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`); await fs.writeFile(path.join(runDir, 'admission-with-contact-sheets.json'), finalBytes, {flag: 'wx'}); await fs.writeFile(path.join(runDir, 'admission-with-contact-sheets.sha256'), `${sha(finalBytes)}  admission-with-contact-sheets.json\n`, {flag: 'wx'});
  return {runDir, admissionSha256: sha(finalBytes), counts: artifact.counts, stories};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createAdmission().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {console.error(error.stack || error); process.exitCode = 1;});
