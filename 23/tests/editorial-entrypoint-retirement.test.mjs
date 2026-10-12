import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('historical editorial rebuilders stop before reading or writing an episode', async () => {
  const workspace = process.cwd();
  const isolated = await mkdtemp(path.join(tmpdir(), '23jung-retired-editorial-'));
  try {
    for (const file of ['rebuild-episode-001-source-first-plan-v2.mjs', 'rebuild-episode-001-footage-plan.mjs', 'apply-episode-001-script-lock.mjs']) {
      const result = spawnSync(process.execPath, [path.join(workspace, 'video/scripts', file)], {cwd: isolated, encoding: 'utf8', windowsHide: true});
      assert.notEqual(result.status, 0, file);
      assert.match(result.stderr, /Retired editorial rebuilder/, file);
      assert.deepEqual(await readdir(isolated), [], file);
    }
  } finally {
    await rm(isolated, {recursive: true, force: true});
  }
});
