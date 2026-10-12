import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const versionId = 'msg5rl1z-45892-5gfps1';
const temp = await mkdtemp(path.join(os.tmpdir(), 'stage07-binding-'));
const reportPath = path.join(temp, 'report.json');
const approvalPath = path.join(temp, 'approval.json');
const legalPath = path.join(root, '07-quality-assurance', 'runs', 'legal-release-decision.json');
const original = JSON.parse(await readFile(path.join(root, '07-quality-assurance', 'runs', 'human-approval.json'), 'utf8'));
const jejuCheck = (selectedVersion) => spawnSync(process.execPath, [path.join(root, '07-quality-assurance', 'check-jeju-release.mjs'), '--version', selectedVersion], { cwd: root, encoding: 'utf8', windowsHide: true });
const visualCheck = (selectedVersion) => spawnSync(process.execPath, [path.join(root, '06-production', 'opencut-automation', 'scripts', 'verify-jeju-canonical-contract.mjs'), '--version', selectedVersion], { cwd: root, encoding: 'utf8', windowsHide: true });
const audit = () => {
  const result = spawnSync(process.execPath, [path.join(root, '07-quality-assurance', 'run-stage07-audit.mjs'), '--version', versionId, '--report', reportPath, '--approval', approvalPath, '--legal-decision', legalPath], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
try {
  const exactV17 = jejuCheck(versionId);
  assert.equal(exactV17.status, 0, exactV17.stderr);
  assert.equal(JSON.parse(exactV17.stdout).visualContract.versionId, versionId);
  const exactV17Visual = visualCheck(versionId);
  assert.equal(exactV17Visual.status, 0, exactV17Visual.stderr);
  assert.equal(JSON.parse(exactV17Visual.stdout).versionId, versionId);
  const older = jejuCheck('msg05psn-38728-1ze90o');
  assert.notEqual(older.status, 0, 'older v14 registry must not pass the selected v17 contract');
  const olderVisual = visualCheck('msg05psn-38728-1ze90o');
  assert.notEqual(olderVisual.status, 0, 'visual verification must reject an unregistered older release contract');
  await writeFile(approvalPath, `${JSON.stringify(original, null, 2)}\n`, 'utf8');
  assert.equal(audit().status, 'approved');
  await writeFile(approvalPath, `${JSON.stringify({ ...original, thumbnailSha256: '0'.repeat(64) }, null, 2)}\n`, 'utf8');
  const stale = audit();
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.checks.find((check) => check.id === 'human-playback-approval')?.status, 'pending');
  console.log('Stage07 exact binding tests passed (canonical approval pass, thumbnail hash mismatch blocked)');
} finally { await rm(temp, { recursive: true, force: true }); }
