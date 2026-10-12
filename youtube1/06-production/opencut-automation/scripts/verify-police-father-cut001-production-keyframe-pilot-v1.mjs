import {createHash} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const manifestPath = path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v36-production-keyframes-v1', 'cut-001', 'production-keyframe-pilot-v1.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const failures = [];

async function verifyBoundFile(record, png = false) {
  const file = path.resolve(root, record.path);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) failures.push(`${record.id || record.path}:not-physical-file`);
  const bytes = await readFile(file);
  if (bytes.length !== record.bytes) failures.push(`${record.id || record.path}:byte-drift`);
  if (sha256(bytes) !== record.sha256) failures.push(`${record.id || record.path}:hash-drift`);
  if (png) {
    if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') failures.push(`${record.id}:not-png`);
    else if (bytes.readUInt32BE(16) !== record.width || bytes.readUInt32BE(20) !== record.height) failures.push(`${record.id}:dimension-drift`);
  }
}

const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
if (manifest.schema !== 'grok-production-keyframe-pilot-v1') failures.push('schema');
if (manifest.status !== 'private-preproduction-candidate-provider-blocked') failures.push('status');
if (manifest.sources.length !== 3) failures.push('source-count');
for (const source of manifest.sources) await verifyBoundFile(source, true);
await verifyBoundFile(manifest.keyframe, true);
await verifyBoundFile(manifest.imageGenPrompt);
await verifyBoundFile(manifest.grokAttempt.prompt);
if (manifest.keyframe.width !== 1254 || manifest.keyframe.height !== 1254) failures.push('keyframe-not-square-1254');
if (manifest.grokAttempt.inputCount !== 1 || manifest.grokAttempt.inputId !== manifest.keyframe.id) failures.push('not-single-keyframe-input');
if (manifest.grokAttempt.result !== 'usage-limit-reached-before-source-completion' || manifest.grokAttempt.sourceVideoCreated !== false) failures.push('provider-state');
if (manifest.gates.productionApproved || manifest.gates.providerRetryAllowed || manifest.gates.render || manifest.gates.upload || manifest.gates.publication || manifest.gates.stage07) failures.push('gate-open');

const report = {schema: 'grok-production-keyframe-pilot-verification-v1', verified: failures.length === 0, failures, manifestSha256: sha256(manifestBytes), keyframeSha256: manifest.keyframe.sha256};
process.stdout.write(`${JSON.stringify(report)}\n`);
if (failures.length) process.exitCode = 1;
