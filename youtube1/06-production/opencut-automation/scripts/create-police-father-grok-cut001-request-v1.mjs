import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const admissionRoot = path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1');
const outputRoot = path.join(root, 'out', 'newsroom', 'grok-sources', 'research-6b1a8af9b4143acb', 'cut-001', 'request-v1');
const admissionPath = path.join(admissionRoot, 'production-admission-v1.json');
const workflowPath = path.join(root, 'production', 'newsroom', 'projects', 'research-6b1a8af9b4143acb.workflow.json');
const narrationPath = path.join(root, 'production', 'newsroom', 'narration-approvals', 'research-6b1a8af9b4143acb.json');
const requestPath = path.join(outputRoot, 'grok-request-v1.json');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(p);
const readJson = p => JSON.parse(read(p).toString('utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const regularNoLink = p => {
  const stat = fs.lstatSync(p);
  assert(stat.isFile() && !stat.isSymbolicLink(), `not a physical file: ${p}`);
};

const admissionBytes = read(admissionPath);
const admission = JSON.parse(admissionBytes.toString('utf8'));
assert(admission.production?.approved === true && admission.production?.privateOnly === true && admission.production?.public === false, 'production admission is not private-approved');
const workflowBytes = read(workflowPath);
const workflow = JSON.parse(workflowBytes.toString('utf8'));
const narrationBytes = read(narrationPath);
const narration = JSON.parse(narrationBytes.toString('utf8'));
assert(workflow.productionApproval?.headline?.approved === true, 'headline is not approved');
assert(narration.approved === true && narration.schema === 'approved-owner-narration-authority-v1', 'owner narration is not approved');

const wanted = [
  ['character-teacher-v2', 'character', 'teacher'],
  ['environment-records-office-v1', 'environment', 'records-office'],
  ['prop-phone-state-pair-alpha-v2', 'prop', 'intact-phone-state'],
  ['scene-complaint-document', 'document', 'blank-complaint-document'],
  ['scene-marker-strip', 'marker', 'single-scan-marker'],
];
const all = [...admission.commonMasters, ...admission.cutAssets];
const refs = wanted.map(([assetId, role, promptRole], order) => {
  const asset = all.find(item => item.assetId === assetId);
  assert(asset, `missing admitted asset: ${assetId}`);
  const absolute = path.resolve(admissionRoot, asset.file);
  assert(absolute.startsWith(`${path.resolve(admissionRoot)}${path.sep}`), `escaped asset: ${assetId}`);
  regularNoLink(absolute);
  const bytes = read(absolute);
  assert(sha(bytes) === asset.sha256 && bytes.length === asset.bytes, `asset drift: ${assetId}`);
  return { order: order + 1, assetId, role, promptRole, file: asset.file.replaceAll('\\', '/'), bytes: bytes.length, sha256: asset.sha256 };
});
assert(refs.length >= 2 && refs.length <= 7, 'Grok reference count must be 2-7');

const prompt = `Create one premium square editorial paper-cut source video from the five uploaded reference images, preserving each exact paper character and object identity.\n\nREFERENCE ORDER AND ROLES\n1. Adult female teacher: the only person in the scene; blank unprinted face; preserve teal cardigan, black skirt and low ponytail.\n2. Anonymous records-office environment: use only as the restrained background setting; do not add signs, badges or readable labels.\n3. Intact/broken phone state reference: show only the intact phone in this cut; never show a breaking method or phone-screen content.\n4. Blank complaint document: the main information object.\n5. Burgundy marker strip: a single evidence scan accent, not text.\n\nLAYOUT AND ACTION\nUse a 1:1 square composition. Keep the teacher at the left-middle and the desk/document/phone as the dominant focal cluster across the center and right. The teacher calmly slides the blank complaint document beside the intact phone once. After the document settles, the burgundy marker performs one clean top-to-bottom scan over the document. A subtle 2 percent camera push ends on the phone and document together. Preserve clear foreground, midground and background paper layers. The only meaningful state change is complaint document placed beside intact phone, then one marker scan. No reversal, no loop, no repeated gesture.\n\nMOTION LANGUAGE\nTranslate the document-marker-scan mechanic into believable paper motion: short ease-out slide, single progressive scan, small endpoint emphasis, restrained settle. Keep motion legible and editorial, not playful.\n\nSTYLE LOCK\nPremium flat 2D editorial paper-cut collage, matte fibrous paper, visible torn edges, restrained beige, dark green, navy and burgundy, believable paper weight, square composition, blank unprinted face.\n\nPROHIBITIONS\nNo readable text, title, caption, date, logo, police insignia, exact workplace, new person, new prop, phone interface, filing clerk, detailed filing procedure, breaking action, concealment, photorealism, glossy 3D, morphing, reversal or loop. Produce a 1:1 480x480 six-second source clip; do not optimize for a forced four-second completion or frozen tail because post-production will select the best continuous semantic window.`;

const request = {
  schema: 'grok-multi-reference-cut-request-v1',
  projectId: 'research-6b1a8af9b4143acb',
  cutId: 'cut-001',
  classification: 'human-action',
  status: 'provider-ready-private-only',
  authority: {
    admissionManifestSha256: sha(admissionBytes),
    admissionBundleDigest: admission.immutableCopy?.bundleDigest,
    workflowSha256: sha(workflowBytes),
    narrationApprovalSha256: sha(narrationBytes),
    narrationAudioSha256: narration.audioSha256,
    ownerVoiceProfileSha256: narration.ownerVoiceProfileSha256,
    approvedHeadline: workflow.productionApproval.headline,
    userApproval: { approved: true, date: '2026-08-14', scope: 'exact 13-master and 51-asset review sheets; private Grok provider generation' },
  },
  sourceContract: { width: 480, height: 480, durationSeconds: 6, referenceCount: refs.length, selectedWindowDeferredToIndependentSemanticQa: true },
  orderedReferences: refs,
  requiredStateChange: 'teacher places blank complaint document beside intact phone; marker scans document once; phone and document settle together',
  prompt,
  postGeneration: { selectedInSeconds: null, selectedOutSeconds: null, semanticQa: 'pending', trimAt1x: true },
  permissions: { providerCall: true, render: false, upload: false, publication: false, stage07: false },
};
const serialized = `${JSON.stringify(request, null, 2)}\n`;
fs.mkdirSync(outputRoot, { recursive: true });
if (fs.existsSync(requestPath)) {
  assert(read(requestPath).equals(Buffer.from(serialized)), 'append-only request already exists with different bytes');
} else {
  fs.writeFileSync(requestPath, serialized, { flag: 'wx' });
  fs.chmodSync(requestPath, 0o444);
}
console.log(JSON.stringify({ requestPath, requestSha256: sha(read(requestPath)), referenceCount: refs.length, providerReady: true }, null, 2));
