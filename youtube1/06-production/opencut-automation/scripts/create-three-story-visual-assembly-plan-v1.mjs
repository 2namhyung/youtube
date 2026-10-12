import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {VISUAL_ROLES} from './newsroom-sequence-first-radio-edit.mjs';

const root = process.cwd();
const authorityRun = 'out/studies/three-story-authority-reapproval-v2/run-20260815T051236587Z-a2871f';
const v5Run = 'out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb';
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length) || `run-${new Date().toISOString().replace(/[-:.]/gu, '').replace('Z', 'Z')}`;
const outDir = path.join(root, 'out/studies/three-story-visual-assembly-v1', runId);
if (fs.existsSync(outDir)) throw new Error(`append-only-run-exists:${runId}`);

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = (relative) => sha256(fs.readFileSync(path.join(root, relative)));
const admission = readJson(`${v5Run}/admission.json`);
const planBySlug = new Map([
  ['police-father', 'police-father.semantic-cut-plan.json'],
  ['jeju-school-intrusion', 'jeju-school-intrusion.semantic-cut-plan.json'],
  ['nurse-pesticide-coffee', 'nurse-pesticide-coffee.semantic-cut-plan.json'],
]);

function treatmentFor(framing, index) {
  const value = String(framing || '').toLowerCase();
  if (value.includes('detail')) return 'crop';
  if (value.includes('pan')) return 'pan';
  if (value.includes('zoom')) return 'zoom';
  if (value.includes('annotation')) return 'annotation';
  return index % 2 ? 'crop' : 'full';
}

const sourceAssets = admission.assets.map((asset) => ({
  assetId: asset.assetId,
  sourceAssetId: asset.sourceAssetId,
  sourceSha256: asset.source?.sha256 || null,
  displaySha256: asset.display?.sha256 || null,
  rightsEvidence: asset.rightsEvidence || null,
  privacyReview: asset.visualReview || null,
  providerInputStatus: asset.providerInputStatus || 'denied',
  editScope: 'local-only',
}));
const blocks = [];
const allCuts = [];
const semanticUnits = [];
const storyAuthorities = [];
for (const [slug, planFile] of planBySlug) {
  const cutPlan = readJson(`${authorityRun}/${planFile}`);
  storyAuthorities.push({storyId: slug, semanticCutPlanSha256: cutPlan.approval?.sha256 || null, narrationAudioSha256: cutPlan.authorities?.narrationAudioSha256 || null, storylineSha256: cutPlan.authorities?.storylineSha256 || null, scriptSha256: cutPlan.authorities?.scriptSha256 || null});
  const rows = admission.matrix.filter((row) => row.storyId === slug).sort((a, b) => a.order - b.order);
  const spanToUnit = new Map();
  for (const cut of cutPlan.cuts) {
    const spanId = cut.spanBindings?.[0]?.spanId || `span-${cut.cutId}`;
    if (!spanToUnit.has(spanId)) {
      const unitId = `${slug}:unit-${String(spanToUnit.size + 1).padStart(3, '0')}`;
      spanToUnit.set(spanId, unitId);
      semanticUnits.push({unitId, storyId: slug, narrationSpanId: spanId, source: 'sealed-semantic-cut-plan-v2'});
    }
    allCuts.push({storyId: slug, cutId: cut.cutId, order: cut.order, durationSeconds: cut.durationIntent.authoredDurationSeconds, semanticUnitId: spanToUnit.get(spanId), narrationSpanId: spanId});
  }
  let cursor = 0;
  while (cursor < rows.length) {
    const first = rows[cursor];
    const assetId = first.assetId;
    const run = [first];
    while (cursor + run.length < rows.length) {
      const next = rows[cursor + run.length];
      if (next.assetId !== assetId || next.order !== run[run.length - 1].order + 1) break;
      run.push(next);
    }
    const sourceAssetIds = assetId ? [assetId] : [];
    const role = first.sourceClass === 'actual-case-evidence' ? VISUAL_ROLES.EVIDENCE : assetId ? VISUAL_ROLES.CONTEXT : (first.sourceClass === 'grok-generated' ? VISUAL_ROLES.EXPLANATION : VISUAL_ROLES.RHYTHM);
    const cutIds = run.map((row) => row.cutId);
    const treatments = Object.fromEntries(run.map((row, index) => [row.cutId, treatmentFor(row.authoredFramingId, index)]));
    blocks.push({
      blockId: `${slug}:visual-${String(blocks.length + 1).padStart(3, '0')}`,
      storyId: slug,
      visualRole: role,
      semanticUnitIds: [...new Set(run.map((row) => allCuts.find((cut) => cut.storyId === slug && cut.cutId === row.cutId)?.semanticUnitId).filter(Boolean))],
      cutIds,
      sourceAssetIds,
      status: assetId ? 'admitted' : 'blocked',
      disclosure: assetId && role === VISUAL_ROLES.CONTEXT ? '자료사진 · 사건과 무관' : null,
      claimBinding: role === VISUAL_ROLES.EVIDENCE ? 'actual-case-evidence' : 'generic-context-unrelated',
      continuityRationale: run.length > 1 ? (run[0].continuityRationale || 'same narration beat; distinct authored treatments') : null,
      treatments,
      providerInputStatus: 'denied',
      editScope: 'local-only',
      yppTransformation: assetId ? {substantialNarration: true, authoredMotion: true, annotation: true, staticSlideshow: false, minimalEdit: false} : null,
      blockers: run.filter((row) => row.blocker).map((row) => row.blocker),
    });
    cursor += run.length;
  }
}

const stories = admission.stories.map((story) => ({
  storyId: story.slug,
  activeCutCount: story.activeCutCount,
  authoredScreenTimeCoverage: story.authoredDurationCoverage,
  coveredSeconds: story.admittedRealPhotoDurationSeconds,
  remainingEvidenceGaps: story.remainingRealPhotoCuts,
  blockedCuts: story.blockedRealPhotoCuts,
  approved: false,
}));
const aggregateNarrationSha256 = sha256(Buffer.from(storyAuthorities.map((item) => `${item.storyId}:${item.narrationAudioSha256}`).join('|')));
const aggregateCutPlanSha256 = sha256(Buffer.from(storyAuthorities.map((item) => `${item.storyId}:${item.semanticCutPlanSha256}`).join('|')));
const plan = {
  schema: 'newsroom-sequence-first-radio-edit-v1',
  successorOf: ['newsroom-photo-risk-v1', 'three-story-domestic-photo-admission-v5'],
  createdAt: new Date().toISOString(),
  sequenceAuthority: {
    source: 'locked-owner-narration',
    authorityRun,
    authorityApprovalSha256: fileSha(`${authorityRun}/authority-reapproval.json`),
    narrationAudioSha256: aggregateNarrationSha256,
    semanticCutPlanSha256: aggregateCutPlanSha256,
    storyAuthorities,
  },
  policy: {visualRoles: Object.values(VISUAL_ROLES), noFixedPhotoPerCut: true, noUniquePrimaryRatioGate: true, providerInput: 'denied', editScope: 'local-only', yppTransformationRequired: true},
  semanticUnits,
  visualBlocks: blocks,
  sourceAssets,
  cuts: allCuts,
  stories,
  evidenceGaps: stories.filter((story) => story.remainingEvidenceGaps > 0).map((story) => ({storyId: story.storyId, remainingRealPhotoCuts: story.remainingEvidenceGaps, reason: 'v5 rights/privacy/claim-fit evidence not admitted'})),
  authorities: {v5AdmissionRelative: `${v5Run}/admission.json`, v5AdmissionSha256: fileSha(`${v5Run}/admission.json`), v5AdmissionWithContactSheetsSha256: '83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1'},
  approval: {approved: false, provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false},
};
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'visual-assembly-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({schema: 'three-story-visual-assembly-v1-manifest', runId, planRelative: 'visual-assembly-plan.json', planSha256: sha256(Buffer.from(JSON.stringify(plan, null, 2) + '\n')), authorityRun, v5Run}, null, 2)}\n`);
console.log(JSON.stringify({runId, outDir, stories: stories.map(({storyId, authoredScreenTimeCoverage, remainingEvidenceGaps}) => ({storyId, authoredScreenTimeCoverage, remainingEvidenceGaps})), blockCount: blocks.length, cutCount: allCuts.length}, null, 2));
