import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exactApprovalMatches, renderBindingSha256, sha256 } from '../opencut-classic/apps/web/src/newsroom/artifact-binding.ts';

const root = path.join(os.tmpdir(), `exact-artifact-binding-${process.pid}`);
const renderPath = path.join(root, 'render.mp4');
const thumbnailPath = path.join(root, 'thumbnail.png');
const handoffPath = path.join(root, 'handoff.json');
try {
  await mkdir(root, { recursive: true });
  await writeFile(renderPath, Buffer.from('render'));
  await writeFile(thumbnailPath, Buffer.from([1, 2, 3, 4]));
  await writeFile(handoffPath, Buffer.from('{"versionId":"v1"}\n'));
  const build = async () => {
    const binding = {
      versionId: 'v1', renderPath, thumbnailPath, handoffPath,
      renderSha256: sha256(await readFile(renderPath)),
      thumbnailSha256: sha256(await readFile(thumbnailPath)),
      handoffSha256: sha256(await readFile(handoffPath)),
    };
    return { ...binding, renderRegistrySha256: renderBindingSha256(binding), scriptSha256: sha256('final script') };
  };
  const initial = await build();
  const approval = { schemaVersion: 2, approved: true, approvedAt: new Date().toISOString(), reviewer: 'reviewer', ...initial };
  assert.equal(exactApprovalMatches({ approval, binding: initial }), true, 'exact render/thumbnail/handoff approval should pass');
  for (const key of ['renderSha256', 'thumbnailSha256', 'handoffSha256', 'renderRegistrySha256', 'scriptSha256']) {
    assert.equal(exactApprovalMatches({ approval: { ...approval, [key]: '0'.repeat(64) }, binding: initial }), false, `${key} mismatch must invalidate approval`);
  }
  const thumbnail = await readFile(thumbnailPath);
  thumbnail[0] ^= 1;
  await writeFile(thumbnailPath, thumbnail);
  const mutated = await build();
  assert.notEqual(mutated.thumbnailSha256, initial.thumbnailSha256);
  assert.notEqual(mutated.renderRegistrySha256, initial.renderRegistrySha256);
  assert.equal(exactApprovalMatches({ approval, binding: mutated }), false, 'one-byte thumbnail mutation must invalidate Stage 07/08 binding');
  console.log('exact artifact binding tests passed (pass, then one-byte thumbnail mutation fail)');
} finally {
  await rm(root, { recursive: true, force: true });
}
