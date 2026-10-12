import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const cutRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'cut-001');
const priorRequestPath = path.join(cutRoot, 'request-v2', 'grok-request-v2.json');
const priorSourcePath = path.join(cutRoot, 'provider-web-v3', 'cut-001-grok-provider-source-v3.mp4');
const requestPath = path.join(cutRoot, 'request-v3', 'grok-request-v3.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const priorBytes = read(priorRequestPath);
const prior = JSON.parse(priorBytes.toString('utf8'));
const priorSourceBytes = read(priorSourcePath);
assert(prior.schema === 'grok-multi-reference-cut-request-v2', 'prior request schema drift');
assert(prior.orderedReferences.length === 5, 'reference count drift');

const correction = `\n\nRETRY CORRECTION — ABSOLUTE OBJECT COUNT AND PLACEMENT\nThe output must contain exactly ONE phone-shaped object in the entire frame at every moment. Place that sole phone only at the far right of the document. The lower foreground desk area must stay completely empty: no phone, device, tablet, dark rectangle, duplicate prop or phone-like shadow there. Do not create any object from memory beyond the five references. Count before rendering: one teacher, one document, one intact phone, one thin scan marker, one records-office background. If a second phone-like rectangle would appear, omit it. The burgundy marker is a narrow overlay sweep on the document, never a separate card.`;

const request = {
  ...prior,
  schema: 'grok-multi-reference-cut-request-v3',
  status: 'provider-ready-private-only-retry-after-semantic-failure',
  retryOf: {
    requestSha256: sha(priorBytes),
    providerSourceSha256: sha(priorSourceBytes),
    failure: 'duplicate-phone: decoded frames contain two phone-shaped objects; exactly-one-phone invariant failed',
  },
  prompt: `${prior.prompt}${correction}`,
  postGeneration: { selectedInSeconds: null, selectedOutSeconds: null, semanticQa: 'pending', trimAt1x: true },
};

const bytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
fs.mkdirSync(path.dirname(requestPath), { recursive: true });
if (fs.existsSync(requestPath)) assert(read(requestPath).equals(bytes), `append-only drift: ${requestPath}`);
else { fs.writeFileSync(requestPath, bytes, { flag: 'wx' }); fs.chmodSync(requestPath, 0o444); }
console.log(JSON.stringify({ requestPath, requestSha256: sha(read(requestPath)), referenceCount: request.orderedReferences.length }, null, 2));
