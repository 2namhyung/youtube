import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {VISUAL_ROLES} from './newsroom-sequence-first-radio-edit.mjs';

const root = process.cwd();
const authorityRun = 'out/studies/three-story-authority-reapproval-v2/run-20260815T051236587Z-a2871f';
const v5Run = 'out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb';
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length) || `run-${new Date().toISOString().replace(/[-:.]/gu, '')}`;
const preserveV5 = process.argv.includes('--preserve-v5');
const outDir = path.join(root, preserveV5 ? 'out/studies/three-story-visual-assembly-v3' : 'out/studies/three-story-visual-assembly-v2', runId);
if (fs.existsSync(outDir)) throw new Error(`append-only-run-exists:${runId}`);
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = (relative) => sha256(fs.readFileSync(path.join(root, relative)));
const admission = readJson(`${v5Run}/admission.json`);
const planFiles = { 'police-father': 'police-father.semantic-cut-plan.json', 'jeju-school-intrusion': 'jeju-school-intrusion.semantic-cut-plan.json', 'nurse-pesticide-coffee': 'nurse-pesticide-coffee.semantic-cut-plan.json' };
const treatmentNames = ['full', 'crop', 'pan', 'zoom', 'annotation'];

const sourceAssets = admission.assets.map((asset) => ({
  assetId: asset.assetId, storyId: asset.storyId, sourceAssetId: asset.sourceAssetId,
  sourceSha256: asset.source?.sha256 || null, displaySha256: asset.display?.sha256 || null,
  rightsEvidence: asset.rightsEvidence || null, privacyReview: asset.visualReview || null,
  providerInputStatus: asset.providerInputStatus || 'denied', editScope: 'local-only',
}));
const sourceByStory = new Map();
for (const asset of sourceAssets) sourceByStory.set(asset.storyId, [...(sourceByStory.get(asset.storyId) || []), asset]);
const blocks = [];
const cuts = [];
const semanticUnits = [];
const storyAuthorities = [];
const stories = [];

function treatment(index) { return treatmentNames[index % treatmentNames.length]; }
function contiguousAssets(rows, assets) {
  if (preserveV5) {
    const assignments = new Map(rows.filter((row) => row.sourceClass !== 'grok-generated' && row.coverageEligible && row.assetId).map((row) => [row.cutId, row.assetId]));
    const byStory = new Map(assets.map((asset) => [asset.assetId, asset]));
    const fallback = assets.map((asset) => asset.assetId);
    const gaps = rows.filter((row) => row.sourceClass !== 'grok-generated' && !assignments.has(row.cutId));
    for (const row of gaps) {
      const previous = rows.slice(0, rows.indexOf(row)).reverse().find((item) => assignments.has(item.cutId));
      assignments.set(row.cutId, previous ? assignments.get(previous.cutId) : fallback[0]);
    }
    if (rows[0]?.storyId === 'jeju-school-intrusion') {
      for (const [index, row] of gaps.entries()) assignments.set(row.cutId, fallback[Math.floor(index / 3) % fallback.length]);
    }
    return assignments;
  }
  const photoRows = rows.filter((row) => row.sourceClass !== 'grok-generated');
  const assignments = new Map();
  if (!assets.length) return assignments;
  const runLength = Math.ceil(photoRows.length / assets.length);
  photoRows.forEach((row, index) => assignments.set(row.cutId, assets[Math.min(Math.floor(index / runLength), assets.length - 1)].assetId));
  return assignments;
}

for (const [storyId, planFile] of Object.entries(planFiles)) {
  const cutPlan = readJson(`${authorityRun}/${planFile}`);
  const rows = admission.matrix.filter((row) => row.storyId === storyId).sort((a, b) => a.order - b.order);
  const cutToPhase = new Map(cutPlan.cuts.map((cut) => [cut.cutId, cut.spanBindings?.[0]?.spanId || cut.cutId]));
  storyAuthorities.push({storyId, semanticCutPlanSha256: cutPlan.approval?.sha256 || null, narrationAudioSha256: cutPlan.authorities?.narrationAudioSha256 || null, storylineSha256: cutPlan.authorities?.storylineSha256 || null});
  const spanToUnit = new Map();
  for (const cut of cutPlan.cuts) {
    const spanId = cut.spanBindings?.[0]?.spanId || `span-${cut.cutId}`;
    if (!spanToUnit.has(spanId)) { const unitId = `${storyId}:unit-${String(spanToUnit.size + 1).padStart(3, '0')}`; spanToUnit.set(spanId, unitId); semanticUnits.push({unitId, storyId, narrationSpanId: spanId, source: 'sealed-semantic-cut-plan-v2'}); }
    cuts.push({storyId, cutId: cut.cutId, order: cut.order, durationSeconds: cut.durationIntent.authoredDurationSeconds, semanticUnitId: spanToUnit.get(spanId), narrationSpanId: spanId});
  }
  const assets = sourceByStory.get(storyId) || [];
  const assigned = contiguousAssets(rows, assets);
  const photoRows = rows.filter((row) => row.sourceClass !== 'grok-generated');
  const gapRows = photoRows.filter((row) => row.blocker);
  const totalSeconds = cuts.filter((cut) => cut.storyId === storyId).reduce((sum, cut) => sum + cut.durationSeconds, 0);
  let blockIndex = 0;
  const lastTreatmentByAsset = new Map();
  // Segment by semantic phase and at most two cuts per block; asset regions stay contiguous.
  for (let index = 0; index < rows.length;) {
    const row = rows[index];
    const assetId = row.sourceClass === 'grok-generated' ? null : assigned.get(row.cutId);
    const phase = cutToPhase.get(row.cutId) || row.cutId;
    const run = [row];
    while (index + run.length < rows.length && run.length < 2) {
      const next = rows[index + run.length];
      const nextAsset = next.sourceClass === 'grok-generated' ? null : assigned.get(next.cutId);
      if (nextAsset !== assetId || (cutToPhase.get(next.cutId) || next.cutId) !== phase) break;
      run.push(next);
    }
    const cutIds = run.map((item) => item.cutId);
    const semanticUnitIds = [...new Set(run.map((item) => cuts.find((cut) => cut.storyId === storyId && cut.cutId === item.cutId)?.semanticUnitId))];
    const isGenerated = run[0].sourceClass === 'grok-generated';
    const unresolved = run.some((item) => item.blocker);
    const role = run[0].sourceClass === 'actual-case-evidence' ? VISUAL_ROLES.EVIDENCE : isGenerated ? VISUAL_ROLES.EXPLANATION : VISUAL_ROLES.CONTEXT;
    const authoredTreatments = {};
    for (const [offset, item] of run.entries()) {
      const key = assetId || `${storyId}:generated`;
      let candidate = treatment(index + offset);
      if (preserveV5 && candidate === lastTreatmentByAsset.get(key)) candidate = treatment(index + offset + 1);
      authoredTreatments[item.cutId] = candidate;
      lastTreatmentByAsset.set(key, candidate);
    }
    blocks.push({
      blockId: `${storyId}:phase-${String(++blockIndex).padStart(3, '0')}`,
      storyId, phaseId: phase, visualRole: role, semanticUnitIds, cutIds,
      sourceAssetIds: assetId ? [assetId] : [], status: isGenerated ? 'planned-generated' : 'admitted',
      disclosure: !isGenerated && role === VISUAL_ROLES.CONTEXT ? '자료사진 · 사건과 무관' : null,
      claimBinding: role === VISUAL_ROLES.EVIDENCE ? 'actual-case-evidence' : 'generic-context-unrelated',
      evidenceOverlayRequirement: unresolved ? {required: true, status: 'unresolved', reason: 'exact evidence source remains unadmitted; background photo is illustrative only', gapId: `${storyId}:${cutIds[0]}`} : null,
      allowNoncontiguousReuse: preserveV5,
      continuityRationale: run.length > 1 ? 'same contiguous semantic phase; distinct authored treatments' : (!isGenerated ? 'single admitted treatment in semantic phase' : null),
      treatments: authoredTreatments,
      providerInputStatus: 'denied', editScope: 'local-only',
      yppTransformation: {substantialNarration: true, authoredMotion: true, annotation: true, staticSlideshow: false, minimalEdit: false},
      blockers: unresolved ? run.filter((item) => item.blocker).map((item) => item.blocker) : [],
    });
    index += run.length;
  }
  const coveredSeconds = cuts.filter((cut) => cut.storyId === storyId && blocks.some((block) => block.storyId === storyId && block.sourceAssetIds.length && block.cutIds.includes(cut.cutId))).reduce((sum, cut) => sum + cut.durationSeconds, 0);
  stories.push({storyId, totalDurationSeconds: totalSeconds, photoScreenTimeSeconds: coveredSeconds, photoScreenTimeCoverage: totalSeconds ? coveredSeconds / totalSeconds : 0, evidenceCompleteness: false, unresolvedEvidenceGaps: gapRows.length, approved: false});
}

const aggregate = (key) => sha256(Buffer.from(storyAuthorities.map((item) => `${item.storyId}:${item[key]}`).join('|')));
const plan = {
  schema: preserveV5 ? 'newsroom-sequence-first-radio-edit-v3' : 'newsroom-sequence-first-radio-edit-v2', successorOf: [preserveV5 ? 'newsroom-sequence-first-radio-edit-v2' : 'newsroom-sequence-first-radio-edit-v1', 'three-story-domestic-photo-admission-v5'], createdAt: new Date().toISOString(),
  sequenceAuthority: {source: 'locked-owner-narration', authorityRun, authorityApprovalSha256: fileSha(`${authorityRun}/authority-reapproval.json`), narrationAudioSha256: aggregate('narrationAudioSha256'), semanticCutPlanSha256: aggregate('semanticCutPlanSha256'), storyAuthorities},
  policy: {visualRoles: Object.values(VISUAL_ROLES), photoCoverageMetric: 'authored-screen-time', evidenceCompletenessSeparate: true, noFixedPhotoPerCut: true, noUniquePrimaryRatioGate: true, providerInput: 'denied', editScope: 'local-only', yppTransformationRequired: true},
  semanticUnits, visualBlocks: blocks, sourceAssets, cuts, stories,
  evidenceGaps: stories.map((story) => ({storyId: story.storyId, unresolvedEvidenceGaps: story.unresolvedEvidenceGaps, evidenceCompleteness: false, reason: 'v5 exact-evidence asset remains unadmitted; illustrative backgrounds do not close the claim'})),
  authorities: {v5AdmissionRelative: `${v5Run}/admission.json`, v5AdmissionSha256: fileSha(`${v5Run}/admission.json`), v5AdmissionWithContactSheetsSha256: '83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1'},
  approval: {approved: false, evidenceCompleteness: false, provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false},
};
fs.mkdirSync(outDir, {recursive: true});
const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'visual-assembly-plan.json'), planBytes);
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({schema: preserveV5 ? 'three-story-visual-assembly-v3-manifest' : 'three-story-visual-assembly-v2-manifest', runId, planRelative: 'visual-assembly-plan.json', planSha256: sha256(planBytes), authorityRun, v5Run}, null, 2)}\n`);
console.log(JSON.stringify({runId, outDir, stories, blockCount: blocks.length, assetCount: sourceAssets.length, cutCount: cuts.length}, null, 2));
