import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const cutRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'cut-001');
const admissionRoot = path.join(root, 'out', 'prototypes', `${projectId}-v33-grok-cut001-reference-fixes-production-v1`);
const admissionPath = path.join(admissionRoot, 'production-admission-v1.json');
const requestPath = path.join(cutRoot, 'request-v4-character-only', 'grok-request-v4-character-only.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const admissionBytes = read(admissionPath);
const admission = JSON.parse(admissionBytes.toString('utf8'));
assert(admission.production?.approved === true && admission.production?.privateOnly === true, 'character admission is not private-production approved');
const teacher = admission.assets.find(asset => asset.assetId === 'character-teacher-v2');
assert(teacher?.role === 'character', 'approved teacher master is missing');
const teacherPath = path.join(admissionRoot, teacher.file);
const teacherBytes = read(teacherPath);
assert(teacherBytes.length === teacher.bytes && sha(teacherBytes) === teacher.sha256, 'teacher master bytes drifted');

const priorSources = [
  ['provider-web-v3', 'cut-001-grok-provider-source-v3.mp4', 'duplicate phone'],
  ['provider-web-v4', 'cut-001-grok-provider-source-v4.mp4', 'oversized document and phone; scan marker became a card'],
  ['provider-web-v5', 'cut-001-grok-provider-source-v5.mp4', 'single phone but oversized document dominated the composition'],
].map(([dir, file, failure]) => {
  const source = path.join(cutRoot, dir, file);
  return { providerSourceSha256: sha(read(source)), failure };
});

const prompt = `Use the uploaded image only to preserve the adult female teacher's paper-cut identity: blank face, teal cardigan, black skirt, and low ponytail. Do not preserve or reproduce the tan folder she is holding.

Create an anonymous records office and desk autonomously in the same premium flat 2D matte fibrous paper-cut style. Medium-wide locked square composition. Put the teacher in the left third at about 45 percent of frame height. On the desk at center-right, generate exactly one normal-sized blank complaint sheet lying flat at about 25 percent of frame width, and exactly one small intact smartphone immediately to its right at about 10 percent of frame width. Keep the lower foreground empty.

One short natural action: the teacher uses one hand to slide the blank complaint sheet a short distance toward the phone, then releases it. After the sheet settles, a thin burgundy light line, not a physical object, scans once from top to bottom across the document. Add a subtle two-percent camera push toward the document and phone.

One teacher, one sheet, one phone. No held folder, second document, second phone, tablet, extra dark rectangle, readable text, logo, badge, clerk, new person, oversized or floating object, red card or panel, phone UI, cracks, breaking, concealment, morphing, reversal, repeat, glossy 3D, or photorealism.`;

const request = {
  schema: 'grok-character-reference-cut-request-v1',
  status: 'provider-ready-private-only',
  projectId,
  cutId: 'cut-001',
  grokSceneClass: 'human-action',
  contractRevision: 'evidence-motion-documentary-v8-grok-character-reference-autonomous-scenes',
  inputMode: 'character-reference-or-text-only-v1',
  characterReference: {
    order: 1,
    assetId: teacher.assetId,
    role: 'character',
    identityScope: 'blank face, teal cardigan, black skirt, low ponytail only; exclude held folder and source pose',
    file: teacher.file,
    bytes: teacher.bytes,
    sha256: teacher.sha256,
  },
  forbiddenReferenceRoles: ['environment', 'prop', 'document', 'diagram-element', 'relationship-line', 'marker', 'texture'],
  autonomousSceneElements: ['anonymous records office', 'desk', 'one blank complaint sheet', 'one intact smartphone', 'thin burgundy light scan'],
  prompt,
  requiredStateChange: 'teacher slides one blank complaint sheet toward one intact phone; sheet settles; thin burgundy light scans once',
  sourceContract: { aspectRatio: '1:1', minimumEdge: 480, durationSeconds: 6, durationToleranceSeconds: 0.1 },
  semanticQaContract: { selectedWindowSeconds: { minimum: 2, maximum: 4 }, playbackRate: 1, requireNoReversal: true, requireExactlyOneTeacher: true, requireExactlyOneSheet: true, requireExactlyOnePhone: true },
  authority: { characterAdmissionSha256: sha(admissionBytes), characterMasterSha256: teacher.sha256 },
  retryHistory: priorSources,
  permissions: { providerCall: true, normalizationAfterSemanticPass: true, finalRender: false, upload: false, publication: false, stage07: false },
  postGeneration: { sourceSha256: null, selectedInSeconds: null, selectedOutSeconds: null, semanticQa: 'pending', trimAt1x: true },
};

const bytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
fs.mkdirSync(path.dirname(requestPath), { recursive: true });
if (fs.existsSync(requestPath)) assert(read(requestPath).equals(bytes), `append-only drift: ${requestPath}`);
else { fs.writeFileSync(requestPath, bytes, { flag: 'wx' }); fs.chmodSync(requestPath, 0o444); }
console.log(JSON.stringify({ requestPath, requestSha256: sha(read(requestPath)), characterReferenceCount: 1 }, null, 2));
