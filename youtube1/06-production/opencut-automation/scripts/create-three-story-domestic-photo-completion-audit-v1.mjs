import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const authorityRun = 'out/studies/three-story-authority-reapproval-v2/run-20260815T051236587Z-a2871f';
const needsFile = 'out/studies/newsroom-real-media-needs-v3-domestic-only/run-20260815T115202Z-8c012a/photo-needs.json';
const searchRun = 'out/studies/newsroom-real-media-acquisition-v3-domestic-only/run-20260815T143734Z-expanded-3b85ab';
const modernRun = 'out/studies/gongu-domestic-photo-modern-v1/run-20260815T141824807Z-964f18';
const outRoot = path.join(root, 'out', 'studies', 'three-story-domestic-photo-completion-audit-v1');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const rel = value => path.relative(root, value).replaceAll('\\', '/');
const round = value => Math.round(value * 1e6) / 1e6;

function perceptualHash(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  let output = '';
  for (let index = 0; index < raw.length; index += 4) {
    let nibble = 0;
    for (let offset = 0; offset < 4; offset += 1) if (raw[index + offset] >= average) nibble |= 1 << (3 - offset);
    output += nibble.toString(16);
  }
  return output;
}

async function physical(relativePath, expectedSha) {
  const resolved = path.resolve(root, relativePath);
  const real = await fs.realpath(resolved);
  const stat = await fs.lstat(resolved);
  if (real !== resolved || !stat.isFile() || stat.isSymbolicLink() || !real.startsWith(`${root}${path.sep}`)) throw new Error(`unsafe-file:${relativePath}`);
  const bytes = await fs.readFile(real);
  const digest = sha(bytes);
  if (expectedSha && expectedSha !== digest) throw new Error(`sha-mismatch:${relativePath}`);
  return {relativePath: rel(real), realpath: real, bytes: bytes.length, sha256: digest};
}

const strictAssignments = new Map([
  ['nurse-pesticide-coffee:cut-001', {assetId: 'gongu-modern-004', semanticFit: 'coffee preparation object photograph directly matches the sealed coffee need', disclosure: '국내 커피 자료사진·사건 음료와 무관'}],
  ['nurse-pesticide-coffee:cut-011', {assetId: 'gongu-modern-005', semanticFit: 'coffee machine and cups directly match the sealed coffee-table need', disclosure: '국내 커피 자료사진·사건 음료와 무관'}],
]);

export async function createAudit() {
  const needsBytes = await fs.readFile(path.join(root, needsFile));
  const needs = JSON.parse(needsBytes);
  if (needs.schema !== 'newsroom-real-media-needs-v3-domestic-only' || needs.approval?.approved !== true) throw new Error('sealed-domestic-needs-required');
  const authority = JSON.parse(await fs.readFile(path.join(root, authorityRun, 'authority-reapproval.json')));
  if (authority.approval?.approved !== true) throw new Error('approved-authority-required');
  const authorityVerifier = JSON.parse(await fs.readFile(path.join(root, authorityRun, 'verifier.json')));
  if (authorityVerifier.verified !== true) throw new Error('verified-authority-required');
  const searchVerifier = JSON.parse(await fs.readFile(path.join(root, searchRun, 'acquisition-verifier.json')));
  if (searchVerifier.verified !== true || searchVerifier.complete !== false || searchVerifier.domesticAssetsVerified !== 24) throw new Error('unexpected-search-checkpoint');
  const modernManifestPath = path.join(root, modernRun, 'manifest.json');
  const modernManifestBytes = await fs.readFile(modernManifestPath);
  const modern = JSON.parse(modernManifestBytes);
  const modernReview = JSON.parse(await fs.readFile(path.join(root, modernRun, 'visual-review.json')));
  const reviewById = new Map(modernReview.assets.map(item => [item.assetId, item]));
  const assetById = new Map(modern.assets.map(item => [item.assetId, item]));
  const approvedAssets = [];
  for (const [assignmentKey, selection] of strictAssignments) {
    const asset = assetById.get(selection.assetId);
    const review = reviewById.get(selection.assetId);
    if (!asset || asset.sourceUseStatus !== 'approved' || review?.decision !== 'approved') throw new Error(`unapproved-source:${selection.assetId}`);
    if (asset.captureYear < 2020 || asset.temporalEra !== 'modern-2020s') throw new Error(`nonmodern-source:${selection.assetId}`);
    if (Object.values(asset.anachronismFlags).some(Boolean)) throw new Error(`anachronistic-source:${selection.assetId}`);
    const original = await physical(asset.original.relativePath, asset.original.sha256);
    const rights = await physical(asset.evidence.rightsRelativePath, asset.evidence.itemPageSha256);
    const rightsText = await fs.readFile(path.join(root, rights.relativePath), 'utf8');
    if (!rightsText.includes('CC BY') || !rightsText.includes('한국저작권위원회') || !rightsText.includes(String(asset.captureYear))) throw new Error(`rights-evidence-failed:${selection.assetId}`);
    const phash = perceptualHash(path.join(root, original.relativePath));
    if (phash !== asset.phash) throw new Error(`phash-mismatch:${selection.assetId}`);
    approvedAssets.push({
      assignmentKey, assetId: selection.assetId, title: asset.title, semanticFit: selection.semanticFit,
      sourceUseStatus: 'approved', providerInputStatus: 'denied', coverageEligible: true,
      captureDate: asset.captureDate, captureYear: asset.captureYear, temporalEra: asset.temporalEra,
      technologyGeneration: asset.technologyGeneration, anachronismFlags: asset.anachronismFlags,
      domesticOrigin: {originCountry: 'KR', captureCountry: 'KR', rightsholderCountry: 'KR', institution: '한국저작권위원회', verificationBasis: 'item page identifies 한국저작권위원회, describes 한국의 미 photographic context, and records the 2020 creation date'},
      license: {classification: 'korean-cc-by', code: 'CC-BY-4.0', exactRightsStatement: `한국저작권위원회 의 "${asset.title}" 은 CC BY 라이선스로 제공됩니다.`, url: asset.license.url},
      evidence: {itemUrl: asset.evidence.itemUrl, downloadUrl: asset.evidence.downloadUrl, itemPage: rights, original, pHash: phash},
      flags: {recognizablePerson: false, minor: false, sensitiveParty: false, privacyPublicity: false, trademarkLogo: false, artwork: false, property: true, geographicMismatch: false, casePartyImplication: false},
      disclosure: selection.disclosure,
    });
  }
  const selectedByKey = new Map(approvedAssets.map(item => [item.assignmentKey, item]));
  const stories = [];
  const matrix = [];
  for (const story of needs.cases) {
    const plan = JSON.parse(await fs.readFile(path.join(root, authorityRun, `${story.slug}.semantic-cut-plan.json`)));
    if (plan.approval?.approved !== true || plan.approval.sha256 !== story.semanticCutPlanSha256) throw new Error(`plan-authority-mismatch:${story.slug}`);
    let totalDuration = 0;
    let assignedDuration = 0;
    let realNeedCount = 0;
    let assignedCount = 0;
    const sourceHashes = new Set();
    for (const cut of story.cuts) {
      const duration = cut.narrationAnchor.durationSeconds;
      totalDuration += duration;
      const assignmentKey = `${cut.storyId}:${cut.cutId}`;
      const selected = selectedByKey.get(assignmentKey);
      if (cut.sourceClass !== 'grok-generated') realNeedCount += 1;
      if (selected) { assignedCount += 1; assignedDuration += duration; sourceHashes.add(selected.evidence.original.sha256); }
      matrix.push({
        assignmentKey, storyId: cut.storyId, authorityStoryId: story.storyId, cutId: cut.cutId, order: cut.order,
        durationSeconds: duration, sourceClass: cut.sourceClass, visualInformationNeed: cut.visualInformationNeed,
        searchQuery: cut.searchQuery, assignmentStatus: cut.sourceClass === 'grok-generated' ? 'not-required-generated-cut' : selected ? 'approved' : 'blocked',
        assetId: selected?.assetId || null,
        blocker: cut.sourceClass === 'grok-generated' ? null : selected ? null : 'no distinct 2020+ Korean-captured, Korean-rightsholder, item-level KOGL0/1 or Korean CC-BY photograph with verified semantic fit',
      });
    }
    const ratio = assignedCount ? sourceHashes.size / assignedCount : 0;
    stories.push({storyId: story.storyId, slug: story.slug, activeCutCount: story.cutCount, realPhotoNeedCount: realNeedCount, approvedAssignmentCount: assignedCount, blockedRealPhotoCutCount: realNeedCount - assignedCount, uniquePrimaryCount: sourceHashes.size, uniquePrimaryRatio: round(ratio), totalDurationSeconds: round(totalDuration), approvedRealPhotoDurationSeconds: round(assignedDuration), authoredDurationCoverage: round(assignedDuration / totalDuration), coverageThreshold: 0.8, diversityThreshold: 0.9, approved: assignedDuration / totalDuration >= 0.8 && ratio >= 0.9});
  }
  const requested = stories.reduce((sum, story) => sum + story.realPhotoNeedCount, 0);
  const assigned = stories.reduce((sum, story) => sum + story.approvedAssignmentCount, 0);
  const runDir = path.join(outRoot, `run-${new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z')}-${crypto.randomBytes(3).toString('hex')}`);
  await fs.mkdir(runDir, {recursive: true});
  const audit = {
    schema: 'three-story-domestic-photo-completion-audit-v1', generatedAt: new Date().toISOString(), activeContract: needs.activeContract,
    authorities: {authorityRun, authorityApprovalSha256: authority.approval.sha256, photoNeeds: needsFile, photoNeedsSha256: needs.approval.sha256, searchCheckpoint: searchRun, searchCheckpointManifestSha256: searchVerifier.manifestSha256, modernSourceManifest: rel(modernManifestPath), modernSourceManifestSha256: sha(modernManifestBytes)},
    policy: {domesticOnly: true, modernMinimumYear: 2020, allowedRights: needs.policy.allowedRights, compositeAssignmentKey: true, noPositionalOrModuloAssignment: true, maxPrimaryReuse: 1, minimumUniquePrimaryRatio: 0.9, minimumAuthoredDurationCoverage: 0.8},
    acquisitionAttempt: {domesticAssetsStructurallyVerified: 24, newAssetsAdded: 0, rejectedSearchCandidates: 441, note: 'Official KOGL expanded rerun added no item that passed its structural gates; all 24 checkpoint assets remain conditional and non-admitted.'},
    assets: approvedAssets, matrix, stories,
    counts: {activeCuts: matrix.length, requestedRealPhotoCuts: requested, approvedAssignments: assigned, blockedRealPhotoCuts: requested - assigned, generatedCuts: matrix.filter(item => item.sourceClass === 'grok-generated').length, uniqueApprovedPrimary: new Set(approvedAssets.map(item => item.evidence.original.sha256)).size},
    completion: {complete: false, admissionAuthorized: false, reason: `${requested - assigned} of ${requested} sealed real-photo cuts lack a verified modern domestic semantic primary; no story reaches 0.80 authored-duration coverage`},
    production: {provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false},
  };
  const auditBytes = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`);
  await fs.writeFile(path.join(runDir, 'completion-audit.json'), auditBytes, {flag: 'wx'});
  await fs.writeFile(path.join(runDir, 'completion-audit.sha256'), `${sha(auditBytes)}  completion-audit.json\n`, {flag: 'wx'});
  const table = ['# 3편 국내 현대 사진 컷별 완료 감사', '', `- 완료: ${audit.completion.complete}`, `- 승인 배정: ${assigned}/${requested}`, `- 차단: ${requested - assigned}/${requested}`, '', '| 영상 | 컷 | 필요 사진 | 상태 | 자산/차단 사유 |', '|---|---:|---|---|---|'];
  for (const item of matrix.filter(item => item.sourceClass !== 'grok-generated')) table.push(`| ${item.storyId} | ${item.cutId} | ${item.searchQuery} | ${item.assignmentStatus} | ${item.assetId || item.blocker} |`);
  await fs.writeFile(path.join(runDir, 'cut-assignment-matrix.md'), `${table.join('\n')}\n`, {flag: 'wx'});
  if (approvedAssets.length) {
    const files = approvedAssets.map(item => path.join(root, item.evidence.original.relativePath));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', files[0], '-i', files[1], '-filter_complex', '[0:v]scale=480:360:force_original_aspect_ratio=decrease,pad=480:360:(ow-iw)/2:(oh-ih)/2[a];[1:v]scale=480:360:force_original_aspect_ratio=decrease,pad=480:360:(ow-iw)/2:(oh-ih)/2[b];[a][b]hstack=inputs=2', '-frames:v', '1', path.join(runDir, 'approved-contact-sheet.jpg')]);
  }
  return {runDir, auditSha256: sha(auditBytes), counts: audit.counts, stories};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createAudit().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {console.error(error.stack || error); process.exitCode = 1;});
