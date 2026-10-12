import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const script = path.join(root, 'video', 'scripts', 'validate-render-authority.mjs');
const statePath = path.join(root, 'video', 'episodes', 'episode-001', 'production-state.json');

test('superseded render authority stays blocked without advancing production state', async () => {
  const before = await readFile(statePath, 'utf8');
  const result = spawnSync(process.execPath, [script, '--allow-missing-review'], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'blocked/non-production');
  assert.equal(report.production_authority, false);
  assert.equal(report.rendered, false);
  assert.equal(report.cut_count, 36);
  assert.equal(report.active_cut_root, null);
  assert.equal(report.render_root, null);
  assert.equal(report.catalog, null);
  assert.equal(report.generated_catalog_status, 'blocked-source-search-no-render-authority');
  assert.deepEqual(report.failures, []);
  assert.equal(await readFile(statePath, 'utf8'), before);
});

test('current episode review and Omni gates remain closed pending selected sources', async () => {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.stage, 'timing-draft');
  assert.equal(state.active_cut_root, null);
  assert.equal(state.cut_review.all_cuts_passed, false);
  assert.equal(state.omni_video_generation.status, 'blocked_until_all_cuts_passed');
  assert.equal(state.render_authority.status, 'blocked-superseded-by-editorial-revision');
  assert.equal(state.render_authority.cut_root, null);
  assert.equal(state.render_authority.catalog, null);
  assert.equal(state.render_authority.production_authority, false);
  assert.equal(state.style_calibration.candidate_root, null);
  assert.equal(state.style_calibration.authority, null);
  assert.equal(state.style_calibration.user_approved, false);
});
