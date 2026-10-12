import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('source-led editorial revision reaches stage validation without granting activation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ep001-progression-'));
  try {
    const state = JSON.parse(await readFile('video/episodes/episode-001/production-state.json', 'utf8'));
    state.stage = 'cut-previews-ready';
    state.active_cut_root = 'video/public/assets/episode-001-unmaterialized-v99';
    state.render_authority = {...state.render_authority, status: 'pending-user-review', cut_root: state.active_cut_root};
    const statePath = path.join(dir, 'state.json');
    await writeFile(statePath, JSON.stringify(state));
    const result = spawnSync(process.execPath, ['video/scripts/validate-episode-spec.mjs', '--state', statePath], {cwd: process.cwd(), encoding: 'utf8', windowsHide: true});
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, 'unmaterialized inputs must not pass');
    assert.match(output, /source-led progression requires stage\/asset\/user-approval validation/u);
    assert.doesNotMatch(output, /production state must remain timing-draft/u);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
