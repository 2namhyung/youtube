import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const successorRoot = path.join(root, 'out', 'prototypes', `${projectId}-v33-grok-cut001-reference-fixes-production-v1`);
const successorPath = path.join(successorRoot, 'production-admission-v1.json');
const requestPath = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'cut-001', 'request-v2', 'grok-request-v2.json');
const workflowPath = path.join(root, 'production', 'newsroom', 'projects', `${projectId}.workflow.json`);
const narrationPath = path.join(root, 'production', 'newsroom', 'narration-approvals', `${projectId}.json`);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = p => fs.readFileSync(p);
const successorBytes = read(successorPath); const successor = JSON.parse(successorBytes.toString('utf8'));
const requestBytes = read(requestPath); const request = JSON.parse(requestBytes.toString('utf8'));
const workflowBytes = read(workflowPath); const workflow = JSON.parse(workflowBytes.toString('utf8'));
const narrationBytes = read(narrationPath); const narration = JSON.parse(narrationBytes.toString('utf8'));
assert(successor.schema === 'grok-cut001-reference-fixes-production-admission-v1' && successor.production?.approved === true && successor.production?.privateOnly === true && successor.production?.public === false, 'successor admission invalid');
assert(successor.humanApproval?.approved === true && successor.sources?.reviewBoardSha256 === 'c5a5c2d814a5fa89d51e496f0f6f524514879ac4254d4e2aad1dcf4ed3c376a5', 'human approval binding invalid');
assert(request.schema === 'grok-multi-reference-cut-request-v2' && request.status === 'provider-ready-private-only' && request.authority?.successorAdmissionSha256 === sha(successorBytes), 'request authority invalid');
assert(request.authority.workflowSha256 === sha(workflowBytes) && request.authority.narrationApprovalSha256 === sha(narrationBytes) && workflow.productionApproval?.headline?.approved === true && narration.approved === true, 'title/narration authority drift');
assert(request.permissions?.providerCall === true && request.permissions?.render === false && request.permissions?.upload === false && request.permissions?.publication === false && request.permissions?.stage07 === false, 'permission boundary drift');
assert(request.orderedReferences?.length === 5 && new Set(request.orderedReferences.map(x => x.assetId)).size === 5, 'ordered references invalid');
assert(!request.orderedReferences.some(x => ['prop-phone-state-pair-alpha-v2', 'scene-marker-strip'].includes(x.assetId)), 'superseded references leaked');
for (const [index, item] of request.orderedReferences.entries()) {
  assert(item.order === index + 1, `order drift: ${item.assetId}`);
  const file = path.resolve(successorRoot, item.file); assert(file.startsWith(`${path.resolve(successorRoot)}${path.sep}`), `escaped asset: ${item.assetId}`);
  const stat = fs.lstatSync(file); assert(stat.isFile() && !stat.isSymbolicLink(), `not physical: ${item.assetId}`);
  const bytes = read(file); assert(bytes.length === item.bytes && sha(bytes) === item.sha256, `asset drift: ${item.assetId}`);
}
const source = request.sourceContract;
assert(source?.aspectRatio === '1:1' && source.durationSeconds === 6 && source.sourceAcceptance?.requireSquare === true && source.sourceAcceptance?.minimumEdge === 480 && source.sourceAcceptance?.durationToleranceSeconds === 0.1, 'provider source acceptance drift');
assert(source.normalization?.preserveSourceBytes === true && source.normalization?.width === 480 && source.normalization?.height === 480 && source.normalization?.fps === 24 && source.normalization?.scaleFilter === 'lanczos' && source.normalization?.audioPolicy === 'discard-before-final-mux', 'normalization drift');
for (const required of ['Single intact phone', 'thin burgundy marker', 'never enlarge it into a card', 'document-marker-scan', 'No readable text']) assert(request.prompt.includes(required), `prompt missing: ${required}`);
assert(request.postGeneration?.semanticQa === 'pending' && request.postGeneration?.selectedInSeconds === null && request.postGeneration?.selectedOutSeconds === null, 'semantic QA must be pending');
console.log(JSON.stringify({ schema: 'grok-multi-reference-cut-request-v2-verifier', verified: true, requestSha256: sha(requestBytes), successorAdmissionSha256: sha(successorBytes), referenceCount: 5, providerReady: true, semanticQa: 'pending' }, null, 2));
