import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {buildEpisodePlanOutputs, withDerivedProductionStateHashes} from './episode-plan-generator-lib.mjs';
import {isBlockedFootageFirstDraft} from './production-authoring-contract.mjs';

const root = process.cwd();
const specPath = path.join(root, 'video', 'episodes', 'episode-001', 'episode-spec.json');
const statePath = path.join(root, 'video', 'episodes', 'episode-001', 'production-state.json');
const baseSpec = JSON.parse(await readFile(specPath, 'utf8'));
const baseState = JSON.parse(await readFile(statePath, 'utf8'));
const clone = (value) => structuredClone(value);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const temp = await mkdtemp(path.join(os.tmpdir(), 'ep001-footage-plan-'));

async function validateCase(name, mutate, expectedFailure = null) {
  const spec = clone(baseSpec);
  mutate?.(spec);
  const bytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`);
  const dir = path.join(temp, name);
  await mkdir(path.join(dir, 'generated'), {recursive:true});
  const outputs = buildEpisodePlanOutputs(spec, bytes);
  for (const [filename, contents] of outputs) await writeFile(path.join(dir, filename), contents, 'utf8');
  const state = withDerivedProductionStateHashes(clone(baseState), bytes, spec);
  state.draft_inputs.episode_spec_sha256 = hash(bytes);
  state.draft_inputs.narration_generated_source_sha256 = hash(bytes);
  await writeFile(path.join(dir, 'episode-spec.json'), bytes);
  await writeFile(path.join(dir, 'production-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  const args = [
    'video/scripts/validate-episode-spec.mjs',
    '--spec', path.join(dir, 'episode-spec.json'),
    '--state', path.join(dir, 'production-state.json'),
    '--narration', path.join(dir, 'narration-plan.json'),
    '--cut-plan', path.join(dir, 'cut-plan.json'),
    '--design', path.join(dir, 'cut-source-design.json'),
    '--contracts', path.join(dir, 'generated', 'manifest-contracts.json'),
  ];
  const result = spawnSync(process.execPath, args, {cwd:root, encoding:'utf8'});
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectedFailure === null) assert.equal(result.status, 0, `${name} should pass:\n${output}`);
  else {
    assert.notEqual(result.status, 0, `${name} should fail`);
    assert.match(output, expectedFailure, `${name} failed for the wrong reason:\n${output}`);
  }
}

try {
  await validateCase('baseline', null);
  await validateCase('script-drift', (spec) => { spec.script_lock.narration_sha256 = '0'.repeat(64); }, /preserve the exact user-approved script lock/u);
  await validateCase('orphan-candidate', (spec) => {
    const cut = spec.cuts.find((item) => item.shot_id === 'SH007');
    const requirement = cut.requirements.find((item) => item.candidate_id === 391);
    cut.components = cut.components.filter((component) => component.asset_requirement_id !== requirement.requirement_id);
    for (const beat of cut.visual_beats) {
      beat.presentation.supporting = beat.presentation.supporting.filter((item) => item.component_id !== 'sh007-source-support-2');
      beat.component_visibility = beat.component_visibility.filter((item) => item.component_id !== 'sh007-source-support-2');
    }
  }, /selected candidate 391 must bind at least one consumed component/u);
  await validateCase('window-drift', (spec) => {
    const requirement = spec.cuts.find((item) => item.shot_id === 'SH006').requirements.find((item) => item.candidate_id === 399);
    requirement.reviewed_window_seconds.end_seconds = 3;
  }, /video candidate 399 must bind its reviewed temporal window/u);
  await validateCase('review-hash-drift', (spec) => { spec.editorial_visual_policy.candidate_review_sha256 = 'f'.repeat(64); }, /candidate review byte hash drift/u);

  assert.equal(isBlockedFootageFirstDraft(baseSpec, baseState), true);
  const promoted = clone(baseState);
  promoted.active_cut_root = 'video/public/assets/fake';
  assert.equal(isBlockedFootageFirstDraft(baseSpec, promoted), false);
  const catalogAttached = clone(baseState);
  catalogAttached.render_authority.catalog = 'video/episodes/episode-001/generated/render-catalog.json';
  assert.equal(isBlockedFootageFirstDraft(baseSpec, catalogAttached), false);
  const authorityGranted = clone(baseState);
  authorityGranted.render_authority.production_authority = true;
  assert.equal(isBlockedFootageFirstDraft(baseSpec, authorityGranted), false);
  console.log('Footage-first editorial validation tests passed: baseline plus script, candidate-consumption, temporal-window, review-hash and no-active-authority negative cases.');
} finally {
  await rm(temp, {recursive:true, force:true});
}
