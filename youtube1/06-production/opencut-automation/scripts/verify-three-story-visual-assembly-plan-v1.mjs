import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateRadioEditPlan} from './newsroom-sequence-first-radio-edit.mjs';

const root = process.cwd();
const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
if (!runId) throw new Error('run-id-required');
const runDir = path.join(root, 'out/studies/three-story-visual-assembly-v1', runId);
const planPath = path.join(runDir, 'visual-assembly-plan.json');
const manifestPath = path.join(runDir, 'manifest.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = validateRadioEditPlan(plan);
const canonical = `${JSON.stringify(plan, null, 2)}\n`;
const planSha256 = crypto.createHash('sha256').update(canonical).digest('hex');
if (manifest.planSha256 !== planSha256) errors.push('manifest-plan-sha256');
if (plan.sequenceAuthority.authorityRun !== 'out/studies/three-story-authority-reapproval-v2/run-20260815T051236587Z-a2871f') errors.push('authority-run');
if (plan.authorities.v5AdmissionRelative !== 'out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/admission.json') errors.push('v5-run');
if (plan.approval.approved || plan.approval.provider || plan.approval.render || plan.approval.upload || plan.approval.publication || plan.approval.stage07 || plan.approval.continuationAuthorized) errors.push('unauthorized-continuation');
if (!plan.evidenceGaps.length || plan.stories.some((story) => story.remainingEvidenceGaps < 0)) errors.push('evidence-gap-accounting');
const result = {schema: 'three-story-visual-assembly-v1-verifier', verified: errors.length === 0, runId, planSha256, errors};
fs.writeFileSync(path.join(runDir, 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`);
if (errors.length) { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1; } else console.log(JSON.stringify(result, null, 2));

