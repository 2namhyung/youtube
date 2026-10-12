import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const admissionRoot = path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1');
const requestPath = path.join(root, 'out', 'newsroom', 'grok-sources', 'research-6b1a8af9b4143acb', 'cut-001', 'request-v1', 'grok-request-v1.json');
const admissionPath = path.join(admissionRoot, 'production-admission-v1.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const requestBytes = fs.readFileSync(requestPath);
const request = JSON.parse(requestBytes.toString('utf8'));
const admissionBytes = fs.readFileSync(admissionPath);
const admission = JSON.parse(admissionBytes.toString('utf8'));
assert(request.schema === 'grok-multi-reference-cut-request-v1' && request.cutId === 'cut-001', 'wrong request identity');
assert(request.status === 'provider-ready-private-only', 'request is not provider ready');
assert(request.permissions?.providerCall === true && request.permissions?.render === false && request.permissions?.upload === false && request.permissions?.publication === false && request.permissions?.stage07 === false, 'permission boundary drift');
assert(request.authority?.admissionManifestSha256 === sha(admissionBytes), 'admission binding drift');
assert(admission.production?.approved === true && admission.production?.privateOnly === true && admission.production?.public === false, 'admission state drift');
assert(request.orderedReferences?.length === 5 && new Set(request.orderedReferences.map(x => x.assetId)).size === 5, 'ordered reference set invalid');
for (const [index, ref] of request.orderedReferences.entries()) {
  assert(ref.order === index + 1, `reference order invalid: ${ref.assetId}`);
  const file = path.resolve(admissionRoot, ref.file);
  assert(file.startsWith(`${path.resolve(admissionRoot)}${path.sep}`), `escaped reference: ${ref.assetId}`);
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `nonphysical reference: ${ref.assetId}`);
  const bytes = fs.readFileSync(file);
  assert(bytes.length === ref.bytes && sha(bytes) === ref.sha256, `reference drift: ${ref.assetId}`);
}
assert(request.sourceContract?.width === 480 && request.sourceContract?.height === 480 && request.sourceContract?.durationSeconds === 6, 'source contract drift');
assert(request.postGeneration?.semanticQa === 'pending' && request.postGeneration?.selectedInSeconds === null && request.postGeneration?.selectedOutSeconds === null, 'semantic QA must remain pending before generation');
for (const forbidden of ['finish by four seconds', 'hold until six seconds', 'play from zero']) assert(!request.prompt.toLowerCase().includes(forbidden), `stale forced-tail prompt: ${forbidden}`);
for (const required of ['document-marker-scan', 'top-to-bottom scan', 'No readable text', 'blank unprinted face', 'no repeated gesture']) assert(request.prompt.includes(required), `missing prompt requirement: ${required}`);
console.log(JSON.stringify({ schema: 'grok-multi-reference-cut-request-verifier-v1', verified: true, cutId: request.cutId, referenceCount: 5, requestSha256: sha(requestBytes), admissionManifestSha256: sha(admissionBytes), providerReady: true, semanticQa: 'pending' }, null, 2));
