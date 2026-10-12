#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
if (!args.includes('--confirm-public')) throw new Error('Exact release signing requires --confirm-public after explicit owner authorization.');
const versionId = value('--version');
const reviewer = value('--reviewer');
const rationale = value('--rationale');
if (!/^[A-Za-z0-9_-]+$/u.test(versionId || '')) throw new Error('--version is required.');
if (!reviewer?.trim() || !rationale?.trim() || rationale.trim().length < 30) throw new Error('--reviewer and a substantive --rationale are required.');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const registryRoot = path.join(workspace, '06-production', 'opencut-automation', 'out', 'registry', 'versions');
const registryPath = path.join(registryRoot, `${versionId}.json`);
const registryBytes = await readFile(registryPath);
const render = JSON.parse(registryBytes.toString('utf8').replace(/^\uFEFF/u, ''));
if (render.versionId !== versionId || render.handoffFile !== `${versionId}.handoff.json`) throw new Error('Exact registry/handoff version mismatch.');
const [videoBytes, thumbnailBytes, handoffBytes] = await Promise.all([
  readFile(path.resolve(render.path)),
  readFile(path.resolve(render.thumbnailPath)),
  readFile(path.join(registryRoot, render.handoffFile)),
]);
const binding = {
  schemaVersion: 2,
  versionId,
  renderRegistrySha256: sha256(registryBytes),
  renderSha256: sha256(videoBytes),
  thumbnailSha256: sha256(thumbnailBytes),
  handoffSha256: sha256(handoffBytes),
  scriptSha256: render.sourceIntegrity?.scriptSha256,
};
if (!/^[a-f0-9]{64}$/u.test(binding.scriptSha256 || '')) throw new Error('Registry lacks an exact script SHA-256.');
const approvedAt = new Date().toISOString();
const approval = {
  ...binding,
  reviewer: reviewer.trim(),
  approvedAt,
  approvalBasis: rationale.trim(),
};
const blockers = Array.isArray(render.releaseGate?.blockers) ? render.releaseGate.blockers : [];
const legalDecision = {
  ...binding,
  blockerIds: blockers.map((blocker) => blocker.id).sort(),
  reviewer: reviewer.trim(),
  approvedAt,
  rationale: rationale.trim(),
  scope: 'Exact bound release and requested public YouTube publication only; no other version, edit, deletion, or account action is authorized.',
};
const runs = path.join(workspace, '07-quality-assurance', 'runs');
const outputs = [
  [path.join(runs, `${versionId}.human-approval.json`), approval],
  [path.join(runs, `${versionId}.legal-decision.json`), legalDecision],
];
for (const [output, payload] of outputs) {
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
process.stdout.write(`${JSON.stringify({ signed: true, versionId, approval: outputs[0][0], legalDecision: outputs[1][0], binding }, null, 2)}\n`);
