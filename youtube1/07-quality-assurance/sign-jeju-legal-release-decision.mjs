#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOf = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
if (!args.includes('--confirm')) throw new Error('Signing requires --confirm');
const reviewer = valueOf('--reviewer');
const rationale = valueOf('--rationale');
const versionId = valueOf('--version');
if (!reviewer?.trim() || !rationale?.trim() || rationale.trim().length < 20) throw new Error('Signing requires --reviewer and a substantive --rationale');
if (!/^[A-Za-z0-9_-]+$/.test(versionId || '')) throw new Error('Signing requires --version <exact-version-id>');

const registryRoot = path.join(workspace, '06-production', 'opencut-automation', 'out', 'registry', 'versions');
const registryPath = path.join(registryRoot, `${versionId}.json`);
const registryBytes = await readFile(registryPath);
const render = JSON.parse(registryBytes.toString('utf8'));
if (render.versionId !== versionId) throw new Error('Selected registry version mismatch');
const blockers = Array.isArray(render.releaseGate?.blockers) ? render.releaseGate.blockers : [];
if (blockers.length === 0) throw new Error('There are no release blockers requiring an explicit legal decision');
if (render.handoffFile !== `${versionId}.handoff.json`) throw new Error('Selected registry handoff filename/version mismatch');
const handoffPath = path.join(registryRoot, render.handoffFile);
const [videoBytes, thumbnailBytes, handoffBytes] = await Promise.all([readFile(path.resolve(render.path)), readFile(path.resolve(render.thumbnailPath)), readFile(handoffPath)]);
const decision = {
  schemaVersion: 2,
  versionId: render.versionId,
  renderRegistrySha256: crypto.createHash('sha256').update(registryBytes).digest('hex'),
  renderSha256: crypto.createHash('sha256').update(videoBytes).digest('hex'),
  thumbnailSha256: crypto.createHash('sha256').update(thumbnailBytes).digest('hex'),
  handoffSha256: crypto.createHash('sha256').update(handoffBytes).digest('hex'),
  scriptSha256: render.sourceIntegrity?.scriptSha256,
  blockerIds: blockers.map((blocker) => blocker.id).sort(),
  reviewer: reviewer.trim(),
  approvedAt: new Date().toISOString(),
  rationale: rationale.trim(),
  scope: 'Exact private release only; does not remove the underlying editorial warning or authorize other versions.',
};
if (!/^[a-f0-9]{64}$/i.test(decision.scriptSha256 ?? '')) throw new Error('Latest render lacks a bound script SHA-256');
const output = path.join(workspace, '07-quality-assurance', 'runs', 'legal-release-decision.json');
const temporary = `${output}.${process.pid}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true }).catch(() => undefined);
}
process.stdout.write(`${JSON.stringify({ signed: true, output, versionId: decision.versionId, blockerIds: decision.blockerIds }, null, 2)}\n`);
