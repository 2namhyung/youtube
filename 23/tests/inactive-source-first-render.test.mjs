import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {validateCanonicalVoxVerticalSlice, validateHistoricalVoxVerticalSlice} from '../video/scripts/validate-episode-001-vox-vertical-slice.mjs';

const root = process.cwd();
const statePath = path.join(root, 'video/episodes/episode-001/production-state.json');
const readJson = async (file) => JSON.parse(await readFile(path.resolve(root, file), 'utf8'));

async function runValidator(script, state, extraArgs = [], episodeSpec = null) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'source-first-validator-'));
  const tempState = path.join(dir, 'production-state.json');
  try {
    await writeFile(tempState, JSON.stringify(state));
    const specArgs = [];
    if (episodeSpec) {
      const tempSpec = path.join(dir, 'episode-spec.json');
      await writeFile(tempSpec, JSON.stringify(episodeSpec));
      specArgs.push('--spec', tempSpec);
    }
    const result = spawnSync(process.execPath, [path.resolve(root, script), '--state', tempState, ...specArgs, ...extraArgs], {
      cwd: root, encoding: 'utf8', windowsHide: true,
    });
    return {status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`};
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

test('source-first 36-cut draft passes render and stage integrity without active authority', async () => {
  const render = spawnSync(process.execPath, [path.resolve(root, 'video/scripts/validate-render-authority.mjs')], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(render.status, 0, render.stdout + render.stderr);
  assert.equal(JSON.parse(render.stdout).status, 'blocked/non-production');

  const stage = spawnSync(process.execPath, [path.resolve(root, 'video/scripts/validate-production-stage.mjs')], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(stage.status, 0, stage.stdout + stage.stderr);
  const report = JSON.parse(stage.stdout);
  assert.equal(report.current_stage, 'timing-draft');
  assert.equal(report.expected_cut_count, 36);
  assert.equal(report.status, 'blocked/non-production');
  assert.equal(report.active_cut_root, null);
  assert.equal(report.active_manifest_count, 0);
});

test('source-first render/stage validators reject a root, PASS, wrong count, or promotion request', async () => {
  const baseline = await readJson('video/episodes/episode-001/production-state.json');
  const mutations = [
    ['active root', (state) => { state.active_cut_root = 'video/public/assets/episode-001-work-v01'; }],
    ['cut PASS', (state) => { state.cut_review = {...state.cut_review, all_cuts_passed: true, approval_marker: 'test-pass', approved_inputs_sha256: 'a'.repeat(64)}; }],
    ['wrong cut count', (state) => { state.expected_cut_count = 35; }],
  ];
  for (const [label, mutate] of mutations) {
    const state = structuredClone(baseline);
    mutate(state);
    const render = await runValidator('video/scripts/validate-render-authority.mjs', state);
    assert.notEqual(render.status, 0, `render validator accepted ${label}`);
    const stage = await runValidator('video/scripts/validate-production-stage.mjs', state);
    assert.notEqual(stage.status, 0, `stage validator accepted ${label}`);
  }
  const promotion = await runValidator('video/scripts/validate-production-stage.mjs', baseline, ['--lock', 'cut-previews-ready']);
  assert.notEqual(promotion.status, 0, 'stage validator accepted a source-first promotion request');
});

test('progressed source-first state enters ordinary root and catalog gates instead of a revision-wide block', async () => {
  const progressed = await readJson('video/episodes/episode-001/production-state.json');
  const progressedSpec = await readJson('video/episodes/episode-001/episode-spec.json');
  progressedSpec.status = 'approved-script-source-first-semantic-plan';
  progressedSpec.editorial_revision.status = 'source-selected-editorial-plan';
  const activeRoot = 'video/public/assets/episode-001-work-v01';
  progressed.stage = 'cut-previews-ready';
  progressed.active_cut_root = activeRoot;
  progressed.render_authority = {
    ...progressed.render_authority,
    status: 'active-source-first-candidate', cut_root: activeRoot,
    catalog: 'video/episodes/episode-001/generated/render-catalog.json',
    catalog_sha256: 'a'.repeat(64), manifest_set_sha256: 'b'.repeat(64),
    production_authority: false,
  };

  const stage = await runValidator('video/scripts/validate-production-stage.mjs', progressed, [], progressedSpec);
  assert.notEqual(stage.status, 0);
  assert.match(stage.output, /active_cut_root must contain exactly 36 physical cuts/u);
  assert.doesNotMatch(stage.output, /source-search revision is blocked at timing-draft/u);

  const render = await runValidator('video/scripts/validate-render-authority.mjs', progressed, [], progressedSpec);
  assert.notEqual(render.status, 0);
  assert.match(render.output, /active source-first catalog must contain the exact episode-spec cuts/u);
  assert.doesNotMatch(render.output, /source-search revision is blocked at timing-draft/u);
});

test('old Vox slice stays historical across current route activation and cannot claim or register itself', async () => {
  const result = await validateCanonicalVoxVerticalSlice();
  assert.deepEqual(result.failures, []);
  assert.equal(result.status, 'historical/non-production');

  const [contract, spec, generated, state, catalog, specBytes, generatedBytes] = await Promise.all([
    readJson('video/contracts/episode-001-vox-vertical-slice-v1.json'),
    readJson('video/episodes/episode-001/episode-spec.json'),
    readJson('video/episodes/episode-001/generated/manifest-contracts.json'),
    readJson(statePath),
    readJson('video/episodes/episode-001/generated/render-catalog.json'),
    readFile(path.resolve(root, 'video/episodes/episode-001/episode-spec.json')),
    readFile(path.resolve(root, 'video/episodes/episode-001/generated/manifest-contracts.json')),
  ]);
  const hashes = {
    spec: createHash('sha256').update(specBytes).digest('hex'),
    generated: createHash('sha256').update(generatedBytes).digest('hex'),
  };
  const claimingContract = structuredClone(contract);
  claimingContract.pass_claimed = true;
  assert.match(validateHistoricalVoxVerticalSlice({contract: claimingContract, spec, generated, state, catalog, hashes}).join('\n'), /cannot claim human approval or PASS/u);

  const activeRoot = 'video/public/assets/source-first-fixture-v01';
  const activeState = structuredClone(state);
  activeState.stage = 'cut-previews-ready';
  activeState.active_cut_root = activeRoot;
  activeState.render_authority = {...activeState.render_authority, status: 'active-source-first-candidate', cut_root: activeRoot, catalog: 'video/episodes/episode-001/generated/render-catalog.json', catalog_sha256: 'a'.repeat(64), manifest_set_sha256: 'b'.repeat(64)};
  const activeCatalog = {...catalog, status: 'active-source-first-candidate', authority_root: activeRoot, cuts: spec.cuts.map(({shot_id}) => ({shot_id})), compositions: []};
  assert.deepEqual(validateHistoricalVoxVerticalSlice({contract, spec, generated, state: activeState, catalog: activeCatalog, hashes}), []);

  const populatedCatalog = {...activeCatalog, compositions: [{composition_id: contract.runtime_window.composition_id}]};
  assert.match(validateHistoricalVoxVerticalSlice({contract, spec, generated, state: activeState, catalog: populatedCatalog, hashes}).join('\n'), /historical slice composition must not be registered/u);
});
