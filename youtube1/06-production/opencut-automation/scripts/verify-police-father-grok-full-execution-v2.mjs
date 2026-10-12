import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const file = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'execution-v2-character-pack-autonomous', 'execution-manifest-v2.json');
const bytes = fs.readFileSync(file); const manifest = JSON.parse(bytes);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const assert = (value, message) => { if (!value) throw new Error(message); };
assert(manifest.schema === 'grok-character-pack-autonomous-full-execution-v2' && manifest.contractRevision === 'evidence-motion-documentary-v9-grok-character-pack-autonomous-scenes', 'schema/contract drift');
assert(manifest.requestCount === 18 && manifest.requests.length === 18 && manifest.humanActionCount === 14 && manifest.informationMotionCount === 4, 'cut counts drifted');
assert(manifest.permissions.providerCall && manifest.permissions.privateRender && !manifest.permissions.upload && !manifest.permissions.publication && !manifest.permissions.stage07, 'permission boundary drifted');
let cursor = 0;
for (const [index, request] of manifest.requests.entries()) {
  assert(request.order === index + 1 && request.cutId === `cut-${String(index + 1).padStart(3, '0')}`, `order drift ${index + 1}`);
  assert(request.slot.startSeconds === cursor && request.slot.endSeconds > cursor, `slot gap ${request.cutId}`); cursor = request.slot.endSeconds;
  assert(Array.isArray(request.characterReferences) && request.referenceCount === request.characterReferences.length, `reference count drift ${request.cutId}`);
  assert(request.classification === 'information-motion' ? request.referenceCount === 0 : request.referenceCount >= 1 && request.referenceCount <= 3, `reference cardinality ${request.cutId}`);
  assert(new Set(request.characterReferences.map((ref) => ref.assetId)).size === request.referenceCount, `duplicate character ${request.cutId}`);
  for (const ref of request.characterReferences) {
    assert(ref.role === 'character' && /^[a-f0-9]{64}$/u.test(ref.sha256), `reference metadata ${request.cutId}`);
    const resolved = path.resolve(root, ref.file); const stat = fs.lstatSync(resolved); const physical = fs.realpathSync.native(resolved);
    assert(stat.isFile() && !stat.isSymbolicLink() && physical === resolved && physical.startsWith(path.resolve(root, 'out', 'prototypes') + path.sep), `unsafe reference ${request.cutId}`);
    const refBytes = fs.readFileSync(resolved); assert(refBytes.length === ref.bytes && sha(refBytes) === ref.sha256, `reference bytes drift ${request.cutId}`);
  }
  assert(typeof request.prompt === 'string' && request.prompt.length > 100 && !/(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/])/u.test(request.prompt), `unsafe prompt ${request.cutId}`);
  assert(!request.permissions.upload && !request.permissions.publication && !request.permissions.stage07, `cut permissions drift ${request.cutId}`);
}
assert(Math.abs(cursor - 55.016) < 0.0001, 'timeline duration drift');
const expectedMulti = { 'cut-004': 2, 'cut-012': 3, 'cut-014': 2, 'cut-016': 2, 'cut-018': 2 };
for (const [cutId, count] of Object.entries(expectedMulti)) assert(manifest.requests.find((item) => item.cutId === cutId)?.referenceCount === count, `multi-character pack drift ${cutId}`);
console.log(JSON.stringify({ verified: true, file, sha256: sha(bytes), requestCount: 18, finalDurationSeconds: cursor }, null, 2));
