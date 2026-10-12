import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateRadioEditPlan, authoredScreenTimeCoverage} from './newsroom-sequence-first-radio-edit.mjs';

const root = process.cwd();
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
if (!runId) throw new Error('run-id-required');
const runDir = path.join(root, 'out/studies/three-story-visual-assembly-v3', runId);
const planPath = path.join(runDir, 'visual-assembly-plan.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
const errors = validateRadioEditPlan({...plan, schema: 'newsroom-sequence-first-radio-edit-v1'});
const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
const planSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (manifest.planSha256 !== planSha256) errors.push('manifest-plan-sha256');
if (plan.schema !== 'newsroom-sequence-first-radio-edit-v3' || plan.visualBlocks.some((block) => block.cutIds.length > 2)) errors.push('phase-segmentation');
const admission = JSON.parse(fs.readFileSync(path.join(root, 'out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/admission.json'), 'utf8'));
for (const row of admission.matrix.filter((item) => item.coverageEligible && item.assetId)) {
  const block = plan.visualBlocks.find((candidate) => candidate.storyId === row.storyId && candidate.cutIds.includes(row.cutId));
  if (!block || !block.sourceAssetIds.includes(row.assetId)) errors.push(`original-admitted-replaced:${row.assignmentKey}`);
}
for (const story of plan.stories) {
  const metric = authoredScreenTimeCoverage(plan.cuts.filter((cut) => cut.storyId === story.storyId), plan.visualBlocks.filter((block) => block.storyId === story.storyId));
  if (Math.abs(metric.ratio - story.photoScreenTimeCoverage) > 1e-9 || story.photoScreenTimeCoverage < 0.8) errors.push(`photo-coverage:${story.storyId}`);
  if (story.evidenceCompleteness !== false || story.unresolvedEvidenceGaps < 1) errors.push(`evidence-completeness:${story.storyId}`);
}
if (plan.approval.approved || plan.approval.provider || plan.approval.render || plan.approval.upload || plan.approval.publication || plan.approval.stage07 || plan.approval.continuationAuthorized) errors.push('unauthorized-continuation');
const result = {schema: 'three-story-visual-assembly-v3-verifier', verified: errors.length === 0, runId, planSha256, stories: plan.stories.map(({storyId, photoScreenTimeCoverage, evidenceCompleteness, unresolvedEvidenceGaps}) => ({storyId, photoScreenTimeCoverage, evidenceCompleteness, unresolvedEvidenceGaps})), errors};
fs.writeFileSync(path.join(runDir, 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`);
if (errors.length) { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1; } else console.log(JSON.stringify(result, null, 2));

