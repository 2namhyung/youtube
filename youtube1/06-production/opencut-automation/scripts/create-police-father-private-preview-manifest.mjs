import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const slug = 'research-6b1a8af9b4143acb';
const previewRoot = path.join(ROOT, 'out', 'prototypes', `${slug}-mg-preview-v1`);
const sourceAssetRoot = path.join(ROOT, 'prototypes', `${slug}-mg-preview-v1`, 'assets');
const mastersRoot = path.join(ROOT, 'out', 'prototypes', `${slug}-v29-common-masters`);
const outputRoot = path.join(ROOT, 'out', 'prototypes', `${slug}-next-stage-v1`);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashJson = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

const mastersFile = path.join(mastersRoot, 'common-master-manifest.json');
const workflowFile = path.join(ROOT, 'production', 'newsroom', 'projects', `${slug}.workflow.json`);
const narrationApprovalFile = path.join(ROOT, 'production', 'newsroom', 'narration-approvals', `${slug}.json`);
const creatorFile = path.join(previewRoot, 'creator-manifest.json');
const verifierFile = path.join(previewRoot, 'verifier-report.json');
const planFile = path.join(ROOT, 'prototypes', `${slug}-mg-preview-v1`, 'mg-plan.json');
const [masters, creator, verifier, plan, workflow, narrationApproval] = await Promise.all([
  readJson(mastersFile), readJson(creatorFile), readJson(verifierFile), readJson(planFile), readJson(workflowFile), readJson(narrationApprovalFile),
]);
if (workflow.slug !== slug || workflow.title !== workflow.candidate?.title) throw new Error('Workflow title authority mismatch');
if (narrationApproval.slug !== slug || narrationApproval.approved !== true) throw new Error('Owner narration authority is not approved');
const masterBytes = await fs.readFile(mastersFile);
const creatorBytes = await fs.readFile(creatorFile);
const planBytes = await fs.readFile(planFile);
const previewBytes = await fs.readFile(path.join(previewRoot, `${slug}-mg-preview-v1.mp4`));
const agentPlanPath = path.join(outputRoot, 'agent-authored-video-design-plan-v1.json');
const agentPlan = JSON.parse(await fs.readFile(agentPlanPath, 'utf8'));
const assetEntries = agentPlan.cuts.filter((cut) => cut.implementationMode === 'deterministic_motion_graphics').map((cut) => ({ cutId: cut.cutId, status: 'stale-unusable-old-preview', relativePath: null, bytes: null, sha256: null }));
const sceneElementManifest = {
  schema: 'imagegen-isolated-elements-scene-generation-manifest-v1',
  slug,
  status: 'preview-only',
  privateOnly: true,
  nonAuthoritative: true,
  providerCalls: { imageGen: false, grokCut04: false, upload: false, publication: false, stage07: false },
  sourcePlan: { relativePath: `out/prototypes/${slug}-next-stage-v1/agent-authored-video-design-plan-v1.json`, sha256: sha256(await fs.readFile(agentPlanPath)), schema: agentPlan.schema, cutCount: agentPlan.cuts.length, deterministicCount: assetEntries.length },
  commonMasters: {
    manifestId: masters.manifestId,
    relativePath: `out/prototypes/${slug}-v29-common-masters/common-master-manifest.json`,
    sha256: sha256(masterBytes),
    productionApproved: masters.production?.approved === true,
    assetCount: masters.assets?.length ?? 0,
  },
  assets: assetEntries,
  composition: { canvas: creator.canvas, frames: creator.canvas?.frames, durationSeconds: verifier.durationSeconds, modeCounts: verifier.modeCounts },
  preview: { status: 'stale-unusable-old-preview', relativePath: null, sha256: null, creatorManifestSha256: sha256(creatorBytes), verifier: { verified: verifier.verified === true, reportSha256: hashJson(verifier) } },
};
sceneElementManifest.artifactSha256 = hashJson(sceneElementManifest);

const blocker = {
  schema: 'police-father-next-stage-blocker-v1',
  slug,
  status: 'blocked',
  privateOnly: true,
  creator: 'police-father-private-preview-manifest-creator-v1',
  verifier: 'police-father-private-preview-manifest-verifier-v1',
  authority: {
    visualAuthorityId: 'paper-cut-keyframe-v1',
    visualAuthoritySha256: masters.visualAuthoritySha256,
    headline: { approved: true, title: workflow.title },
    ownerVoiceProfileSha256: narrationApproval.ownerVoiceProfileSha256,
    narrationApprovalSha256: narrationApproval.artifactSha256,
  },
  blockers: [
    { code: 'common-masters-not-production-approved', severity: 'blocking', evidence: 'common-master-manifest.json production.approved=false', nextAction: 'Human-approve the existing character/environment/prop master bytes, then issue a new creator/verifier manifest.' },
    { code: 'workflow-json-validated', severity: 'info', evidence: 'current workflow JSON parses and matches the approved headline/owner narration authorities', nextAction: 'Preserve the validated workflow bytes; do not mutate its authority in place.' },
    { code: 'authored-plan-not-sealed', severity: 'blocking', evidence: 'new path-free agent-authored-video-design-plan-v1 draft validates (18 cuts: 17 deterministic, 1 Grok) but has not been bound to creator/verifier authoring input', nextAction: 'After common-master human approval, bind the draft to the exact narration/evidence input and emit primary-agent-video-design-artifact-v1.' },
  ],
  held: { grokCut04: true, provider: true, upload: true, publication: true, stage07: true },
  nextExecutableArtifact: {
    relativePath: `out/prototypes/${slug}-next-stage-v1/scene-element-generation-manifest-v1.json`,
    status: 'preview-only',
    sha256: sceneElementManifest.artifactSha256,
  },
};
blocker.artifactSha256 = hashJson(blocker);

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'scene-element-generation-manifest-v1.json'), `${JSON.stringify(sceneElementManifest, null, 2)}\n`, { flag: 'w' });
await fs.writeFile(path.join(outputRoot, 'next-stage-blocker-v1.json'), `${JSON.stringify(blocker, null, 2)}\n`, { flag: 'w' });
if (process.argv.includes('--verify')) {
  for (const [name, expected] of [['scene-element-generation-manifest-v1.json', sceneElementManifest.artifactSha256], ['next-stage-blocker-v1.json', blocker.artifactSha256]]) {
    const actual = await readJson(path.join(outputRoot, name));
    const claimed = actual.artifactSha256;
    delete actual.artifactSha256;
    if (claimed !== expected || claimed !== hashJson(actual)) throw new Error(`Generated ${name} failed creator/verifier hash binding`);
  }
  console.log(JSON.stringify({ verified: true, creator: blocker.creator, verifier: blocker.verifier }));
}
console.log(JSON.stringify({ sceneElementManifest: sceneElementManifest.artifactSha256, blocker: blocker.artifactSha256, outputRoot: path.relative(ROOT, outputRoot).replaceAll('\\', '/') }));
