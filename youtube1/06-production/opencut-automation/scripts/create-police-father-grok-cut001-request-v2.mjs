import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const baseRoot = path.join(root, 'out', 'prototypes', `${projectId}-v32-grok-reference-assets-production-v1`);
const candidateRoot = path.join(root, 'out', 'prototypes', `${projectId}-v33-grok-cut001-reference-fixes-candidates`);
const successorRoot = path.join(root, 'out', 'prototypes', `${projectId}-v33-grok-cut001-reference-fixes-production-v1`);
const requestRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'cut-001', 'request-v2');
const workflowPath = path.join(root, 'production', 'newsroom', 'projects', `${projectId}.workflow.json`);
const narrationPath = path.join(root, 'production', 'newsroom', 'narration-approvals', `${projectId}.json`);
const baseAdmissionPath = path.join(baseRoot, 'production-admission-v1.json');
const candidatePath = path.join(candidateRoot, 'candidate-manifest-v1.json');
const candidateVerifierPath = path.join(candidateRoot, 'verifier-v1.json');
const successorPath = path.join(successorRoot, 'production-admission-v1.json');
const requestPath = path.join(requestRoot, 'grok-request-v2.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(p);
const readJson = p => JSON.parse(read(p).toString('utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const physical = p => { const s = fs.lstatSync(p); assert(s.isFile() && !s.isSymbolicLink(), `not physical: ${p}`); };
const writeImmutable = (file, value) => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(read(file).equals(bytes), `append-only drift: ${file}`);
  else { fs.writeFileSync(file, bytes, { flag: 'wx' }); fs.chmodSync(file, 0o444); }
  return { bytes: read(file), sha256: sha(read(file)) };
};
const copyImmutable = (source, target) => {
  physical(source); fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) assert(read(target).equals(read(source)), `copy drift: ${target}`);
  else { fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); fs.chmodSync(target, 0o444); }
  physical(target); return { bytes: read(target).length, sha256: sha(read(target)) };
};

const baseBytes = read(baseAdmissionPath); const base = JSON.parse(baseBytes.toString('utf8'));
const candidateBytes = read(candidatePath); const candidate = JSON.parse(candidateBytes.toString('utf8'));
const candidateVerifierBytes = read(candidateVerifierPath); const candidateVerifier = JSON.parse(candidateVerifierBytes.toString('utf8'));
const workflowBytes = read(workflowPath); const workflow = JSON.parse(workflowBytes.toString('utf8'));
const narrationBytes = read(narrationPath); const narration = JSON.parse(narrationBytes.toString('utf8'));
assert(base.production?.approved === true && base.production?.privateOnly === true && base.production?.public === false, 'base admission invalid');
assert(candidate.status === 'qa-passed-human-approval-pending' && candidateVerifier.verified === true && candidateVerifier.manifestSha256 === sha(candidateBytes), 'candidate QA invalid');
assert(candidate.humanReviewBoard?.sha256 === 'c5a5c2d814a5fa89d51e496f0f6f524514879ac4254d4e2aad1dcf4ed3c376a5', 'approved review board drift');
assert(workflow.productionApproval?.headline?.approved === true && narration.approved === true && narration.schema === 'approved-owner-narration-authority-v1', 'title/narration authority invalid');

const baseAssets = [...base.commonMasters, ...base.cutAssets];
const specs = [
  { assetId: 'character-teacher-v2', role: 'character', promptRole: 'teacher', source: 'base' },
  { assetId: 'environment-records-office-v1', role: 'environment', promptRole: 'records-office', source: 'base' },
  { assetId: 'prop-phone-intact-only-v1', role: 'prop', promptRole: 'intact-phone-only', source: 'candidate' },
  { assetId: 'scene-complaint-document', role: 'document', promptRole: 'blank-complaint-document', source: 'base' },
  { assetId: 'scene-thin-scan-marker-v1', role: 'marker', promptRole: 'thin-single-scan-marker', source: 'candidate' },
];
const assets = specs.map((spec, index) => {
  const sourceItem = spec.source === 'base' ? baseAssets.find(x => x.assetId === spec.assetId) : candidate.assets.find(x => x.assetId === spec.assetId);
  assert(sourceItem, `missing source asset: ${spec.assetId}`);
  const source = spec.source === 'base' ? path.join(baseRoot, sourceItem.file) : path.join(candidateRoot, sourceItem.alpha.file);
  const targetFile = `references/${String(index + 1).padStart(2, '0')}-${spec.assetId}.png`;
  const copied = copyImmutable(source, path.join(successorRoot, targetFile));
  const expectedSha = spec.source === 'base' ? sourceItem.sha256 : sourceItem.alpha.sha256;
  assert(copied.sha256 === expectedSha, `source hash drift: ${spec.assetId}`);
  return { order: index + 1, assetId: spec.assetId, role: spec.role, promptRole: spec.promptRole, file: targetFile, bytes: copied.bytes, sha256: copied.sha256, source: spec.source };
});

const successor = {
  schema: 'grok-cut001-reference-fixes-production-admission-v1', status: 'production-approved-private-only', projectId, cutId: 'cut-001',
  sources: { baseAdmissionSha256: sha(baseBytes), candidateManifestSha256: sha(candidateBytes), candidateVerifierSha256: sha(candidateVerifierBytes), reviewBoardSha256: candidate.humanReviewBoard.sha256 },
  humanApproval: { approved: true, date: '2026-08-14', scope: 'exact v33 cut-001 review board and its intact-phone-only and thin-scan-marker bytes', evidence: 'user explicitly said 승인할게 다시 진행해' },
  supersedesForCut001Only: candidate.supersedesForCut001Only,
  assets,
  production: { approved: true, privateOnly: true, public: false },
  permissions: { providerCall: true, render: false, upload: false, publication: false, stage07: false },
};
const successorWritten = writeImmutable(successorPath, successor);

const prompt = `Create one premium square editorial paper-cut source video from the five uploaded reference images, preserving each exact paper character and object identity.

REFERENCE ORDER AND ROLES
1. Adult female teacher: the only person; blank unprinted face; preserve teal cardigan, black skirt and low ponytail.
2. Anonymous records-office environment: restrained background only; no signs, badges or readable labels.
3. Single intact phone: show this exact unbroken phone only; never add cracks, a second phone, a broken state or screen content.
4. Blank complaint document: the main information object.
5. Thin burgundy scan marker: preserve it as a narrow scan strip; never enlarge it into a card, panel, banner or document.

LAYOUT AND ACTION
Use a 1:1 square composition. Keep the teacher at left-middle and the desk, blank complaint document and intact phone as the dominant center-right cluster. The teacher calmly slides the blank complaint document beside the intact phone once. After the document settles, the thin burgundy marker performs one clean top-to-bottom scan over the document. End with phone and document settled together and a subtle 2 percent camera push. One meaningful state change only. No reversal, loop or repeated gesture.

MOTION LANGUAGE
Use document-marker-scan: short ease-out document slide, one progressive narrow scan, small endpoint emphasis and restrained settle. Keep the motion legible and editorial.

STYLE LOCK
Premium flat 2D editorial paper-cut collage, matte fibrous paper, visible torn edges, restrained beige, dark green, navy and burgundy, believable paper weight, blank unprinted face.

PROHIBITIONS
No readable text, title, caption, date, logo, police insignia, exact workplace, new person, new prop, second phone, broken phone, cracks, phone interface, filing clerk, detailed filing procedure, breaking action, concealment, photorealism, glossy 3D, morphing, reversal or loop. Produce a square approximately six-second provider source; do not force a four-second completion, frozen tail or playback from zero. Post-production preserves the exact source, performs semantic QA, then normalizes and selects the best continuous window.`;

const request = {
  schema: 'grok-multi-reference-cut-request-v2', projectId, cutId: 'cut-001', classification: 'human-action', status: 'provider-ready-private-only',
  authority: { successorAdmissionSha256: successorWritten.sha256, baseAdmissionSha256: sha(baseBytes), workflowSha256: sha(workflowBytes), narrationApprovalSha256: sha(narrationBytes), narrationAudioSha256: narration.audioSha256, ownerVoiceProfileSha256: narration.ownerVoiceProfileSha256, approvedHeadline: workflow.productionApproval.headline, userApproval: successor.humanApproval },
  sourceContract: { aspectRatio: '1:1', durationSeconds: 6, sourceAcceptance: { requireSquare: true, minimumEdge: 480, durationToleranceSeconds: 0.1 }, normalization: { preserveSourceBytes: true, width: 480, height: 480, fps: 24, scaleFilter: 'lanczos', audioPolicy: 'discard-before-final-mux' }, referenceCount: assets.length, selectedWindowDeferredToIndependentSemanticQa: true },
  orderedReferences: assets,
  requiredStateChange: 'teacher places blank complaint document beside one intact phone; thin marker scans document once; phone and document settle together',
  prompt,
  postGeneration: { selectedInSeconds: null, selectedOutSeconds: null, semanticQa: 'pending', trimAt1x: true },
  permissions: { providerCall: true, render: false, upload: false, publication: false, stage07: false },
};
const requestWritten = writeImmutable(requestPath, request);
console.log(JSON.stringify({ successorPath, successorSha256: successorWritten.sha256, requestPath, requestSha256: requestWritten.sha256, referenceCount: assets.length, providerReady: true }, null, 2));
