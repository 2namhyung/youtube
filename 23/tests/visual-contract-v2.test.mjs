import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';

import {OPERATOR_CAPABILITIES, runtimeSha256, validateVisualContractV2} from '../video/scripts/visual-contract-v2.mjs';

const component = (overrides = {}) => ({component_id: 'subject', asset_id: 'subject-asset', semantic_role: 'primary', render_kind: 'asset', compositing: 'independent-layer', motion_expectation: 'independent', atomicity: 'single-editable-object', ...overrides});
const manifest = (overrides = {}) => ({
  schema_version: 2, episode_id: 'episode-001', shot_id: 'SH001', fps: 30, duration_frames: 120,
  production_mode: 'remotion', review_profile: 'remotion-motion',
  assets: [{asset_id: 'subject-asset', file: 'assets/subject.png'}],
  visual_components: [component()],
  visual_beats: [{beat_id: 'enter', purpose: 'show subject', start_frame: 10, end_frame: 70, component_ids: ['subject'], required_capabilities: ['layer-entry']}],
  motion_actions: [{action_id: 'enter', editorial_intent: 'enter', operator_id: 'transform.spring@1', target_component_id: 'subject', start_frame: 10, end_frame: 70, params: {from_x: -100, to_x: 0}}],
  runtime_contract: {operator_registry: 'video/src/vox/motion/operator-registry.ts', scene_renderer: 'video/src/vox/scene/ManifestScene.tsx', transition_renderer: null, runtime_sha256: null},
  review_requirements: {generation_input_required: true, playable_cut_required: true, full_duration_preview_required: true, transition_pair_required: false, review_artifact: null, review_artifact_sha256: null},
  approvals: {generation_input: {status: 'pending', user_pass: false}, playable_cut: {status: 'pending', user_pass: false}},
  transition: {type: 'hard-cut', next_shot_id: null, pair_renderer: null, pair_artifact: null, pair_artifact_sha256: null},
  ...overrides,
});

test('legacy aliases are not canonical operators and canonical capabilities are distinct', () => {
  for (const alias of ['slap', 'place', 'draw-path', 'highlight', 'camera']) assert.equal(Object.hasOwn(OPERATOR_CAPABILITIES, alias), false);
  assert.deepEqual(OPERATOR_CAPABILITIES['svg.stroke-draw@1'], ['relationship-path']);
  assert.deepEqual(OPERATOR_CAPABILITIES['document.highlight@1'], ['document-emphasis']);
});

test('no-op transforms and unsupported target kinds are rejected', () => {
  const noop = manifest({motion_actions: [{action_id: 'noop', editorial_intent: 'fake move', operator_id: 'camera.transform@1', target_component_id: 'subject', start_frame: 10, end_frame: 40, params: {from_x: 0, to_x: 0}}]});
  const failures = validateVisualContractV2(noop);
  assert.match(failures.join('\n'), /no-op/u);
  assert.match(failures.join('\n'), /does not support target/u);
});

test('independent motion rejects flattened multi-object components', () => {
  const flattened = manifest({visual_components: [component({compositing: 'procedural-layer', atomicity: 'procedural'})]});
  assert.match(validateVisualContractV2(flattened).join('\n'), /independent motion requires/u);
});

test('every beat capability needs a real canonical operator', () => {
  const missing = manifest({visual_beats: [{beat_id: 'route', purpose: 'draw route', start_frame: 10, end_frame: 70, component_ids: ['subject'], required_capabilities: ['relationship-path']}]});
  assert.match(validateVisualContractV2(missing).join('\n'), /capability relationship-path has no observable runtime operator/u);
});

test('runtime hash changes when an operator implementation changes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'visual-runtime-'));
  try {
    await mkdir(path.join(dir, 'runtime'), {recursive: true});
    const file = 'runtime/operator.ts';
    await writeFile(path.join(dir, file), 'export const operator = 1;');
    const before = await runtimeSha256(dir, [file]);
    await writeFile(path.join(dir, file), 'export const operator = 2;');
    const after = await runtimeSha256(dir, [file]);
    assert.notEqual(before, after);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('historical SH008 remains generation-input only and absent from current authority', async () => {
  const sh008 = JSON.parse(await readFile(path.resolve('video/public/assets/episode-001-v06/cuts/SH008/manifest.json'), 'utf8'));
  assert.equal(sh008.review_profile, 'omni-keyframe-input');
  assert.equal(sh008.motion_actions.length, 0);
  const catalog = JSON.parse(await readFile(path.resolve('video/episodes/episode-001/generated/render-catalog.json'), 'utf8'));
  assert.ok(!catalog.cuts.some((cut) => cut.shot_id === 'SH008'));
  const state = JSON.parse(await readFile(path.resolve('video/episodes/episode-001/production-state.json'), 'utf8'));
  assert.deepEqual(state.style_calibration.keyframe_gallery_shot_ids, []);
  assert.ok(!state.style_calibration.playable_shot_ids.includes('SH008'));
});

test('morph and scene-to-scene claims require adjacent-pair renderer and artifact at PASS', () => {
  const transition = {type: 'scene-to-scene', next_shot_id: 'SH002', pair_renderer: 'video/src/vox/scene/TransitionPair.tsx', pair_artifact: null, pair_artifact_sha256: null};
  const claimed = manifest({transition, review_requirements: {...manifest().review_requirements, transition_pair_required: true}});
  assert.equal(validateVisualContractV2(claimed, {requireTransitionArtifact: false}).some((item) => /pair artifact/u.test(item)), false);
  assert.match(validateVisualContractV2(claimed, {requireTransitionArtifact: true}).join('\n'), /pair artifact/u);
});
