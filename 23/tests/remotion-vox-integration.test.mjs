import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {normalizeChartRows} from '../video/src/vox/charts/model.ts';
import {assertLocalPublicPath, cutAssetPath, previewFrames as scenePreviewFrames, videoFreezeFrame} from '../video/src/vox/scene/model.ts';
import {frameProgress, resolveMotionState} from '../video/src/vox/motion/presets.ts';
import {loadProductionContext, manifestInputFingerprint, QA_ENTRY, REMOTION_CLI, remotionStillInvocation} from '../video/scripts/qa-runtime.mjs';
import {provisionalCutTiming} from '../video/scripts/narration-timing-lib.mjs';
import {previewFrames, validateManifestTimingAuthority, validateVisualStateManifest} from '../video/scripts/visual-state-lib.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const manifest = {
  schema_version: 1,
  episode_id: 'episode-test',
  shot_id: 'SH001',
  fps: 30,
  duration_frames: 120,
  production_mode: 'remotion',
  assets: [{asset_id: 'document', file: 'assets/document.png', role: 'document'}],
  effects: [{effect_id: 'grain', persists_to_final: true}],
  animations: [{animation_id: 'enter', target_id: 'document', type: 'slap', start_frame: 12, end_frame: 50}],
  lifecycle: {
    background_only: {start_frame: 0, end_frame: 12, visible_asset_ids: [], visible_effect_ids: []},
    reveal: {start_frame: 12, end_frame: 72},
    final_hold: {start_frame: 72, end_frame: 120},
    final_visible_asset_ids: ['document'],
    final_visible_effect_ids: ['grain'],
  },
  chart: null,
};

test('manifest adapter accepts only local public-relative inputs', () => {
  assert.equal(assertLocalPublicPath('assets/episode-001/cuts/SH001'), 'assets/episode-001/cuts/SH001');
  assert.equal(cutAssetPath('assets/episode-001/cuts/SH001', 'assets/document.png'), 'assets/episode-001/cuts/SH001/assets/document.png');
  for (const value of ['https://example.com/a.png', '//example.com/a.png', '../a.png', 'C:\\a.png', '']) {
    assert.throws(() => assertLocalPublicPath(value));
  }
});

test('chart normalization is deterministic and rejects non-finite values', () => {
  assert.deepEqual(normalizeChartRows([{stage: '발의', count: 1}, {stage: '공포', count: 4}]), [{label: '발의', value: 1}, {label: '공포', value: 4}]);
  assert.throws(() => normalizeChartRows([{label: 'bad', value: Number.NaN}]));
});

test('motion presets resolve from manifest frames without changing duration authority', () => {
  assert.equal(frameProgress(0, 10, 20), 0);
  assert.equal(frameProgress(15, 10, 20), 0.5);
  assert.equal(frameProgress(30, 10, 20), 1);
  const action = manifest.animations[0];
  const before = resolveMotionState({actions: [action], frame: 0, fps: 30, fallbackReveal: 0});
  const final = resolveMotionState({actions: [action], frame: 119, fps: 30, fallbackReveal: 1});
  assert.equal(before.opacity, 0);
  assert.equal(final.opacity, 1);
  assert.equal(final.scale, 1);
});

test('video CutAssets play normally before hold and freeze on the last reveal frame', () => {
  assert.equal(videoFreezeFrame({currentFrame: 30, finalHoldStart: 72}), undefined);
  assert.equal(videoFreezeFrame({currentFrame: 72, finalHoldStart: 72}), 71);
  assert.equal(videoFreezeFrame({currentFrame: 119, finalHoldStart: 72}), 71);
  assert.equal(videoFreezeFrame({currentFrame: 0, frameOverride: 41, finalHoldStart: 72}), 41);
  assert.equal(videoFreezeFrame({currentFrame: 0, frameOverride: 119, finalHoldStart: 72}), 71);
  assert.equal(videoFreezeFrame({currentFrame: 0, frameOverride: 0, finalHoldStart: 0}), 0);
});

test('visual QA samples exact background, reveal, and final-hold states', () => {
  assert.deepEqual(validateVisualStateManifest(manifest), []);
  assert.deepEqual(previewFrames(manifest), {background: 0, reveal: 41, final: 119});
  assert.deepEqual(scenePreviewFrames(manifest), {background: 0, reveal: 41, final: 119});
  const broken = structuredClone(manifest);
  broken.lifecycle.final_visible_asset_ids = [];
  assert.match(validateVisualStateManifest(broken).join('\n'), /every declared asset/);

  const movingInHold = structuredClone(manifest);
  movingInHold.animations[0] = {...movingInHold.animations[0], type: 'mask-reveal', end_frame: 90};
  assert.match(validateVisualStateManifest(movingInHold).join('\n'), /must end before final_hold/);

  const unsupportedCounterAction = structuredClone(manifest);
  unsupportedCounterAction.animations[0].type = 'counter';
  assert.match(validateVisualStateManifest(unsupportedCounterAction).join('\n'), /unsupported animation type counter/);
});

test('final hold rejects video/loop effects and allows only stable persistent image effects', () => {
  const stable = structuredClone(manifest);
  stable.effects[0] = {...stable.effects[0], file: 'effects/grain.png', kind: 'texture', start_frame: 12, end_frame: 120, loop: false};
  assert.deepEqual(validateVisualStateManifest(stable), []);
  const video = structuredClone(stable);
  video.effects[0] = {...video.effects[0], file: 'effects/grain.webm', loop: true};
  assert.match(validateVisualStateManifest(video).join('\n'), /non-looping persistent static image effect/);
});

test('narration plan is the exact provisional and measured duration authority', () => {
  const plan = {fps: 30, draft_timing_assumption: {compact_korean_chars_per_second: 5}, cuts: [{shot_id: 'SH001', production_mode: 'remotion', draft_narration: '가나다라마바사아자차', pre_roll_frames: 3, post_hold_frames: 7, transition_overlap_frames: 2}]};
  const timing = provisionalCutTiming(plan.cuts[0], plan);
  assert.deepEqual(timing, {compactCharacters: 10, voiceFrames: 60, durationFrames: 70, masterOccupancyFrames: 68});
  const provisional = {...manifest, duration_frames: 70};
  assert.deepEqual(validateManifestTimingAuthority({manifests: [provisional], plan}), []);
  assert.match(validateManifestTimingAuthority({manifests: [{...provisional, duration_frames: 69}], plan}).join('\n'), /provisional duration drift/);
  const measuredReport = {cuts: [{shot_id: 'SH001', duration_frames: 77}]};
  assert.deepEqual(validateManifestTimingAuthority({manifests: [{...provisional, duration_frames: 77}], plan, measuredReport, finalVoice: true}), []);
  assert.match(validateManifestTimingAuthority({manifests: [provisional], plan, measuredReport, finalVoice: true}).join('\n'), /final duration drift/);
});

test('QA render uses local Remotion CLI through the current Node process', () => {
  const invocation = remotionStillInvocation({composition: 'ManifestCutProvisionalStill', output: 'probe.png', propsFile: '{}'});
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], REMOTION_CLI);
  assert.equal(invocation.args[2], QA_ENTRY);
  assert.equal(invocation.args.includes('pnpm.cmd'), false);
});

test('preview fingerprint covers background and every declared visual input', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), '23jung-fingerprint-'));
  try {
    await mkdir(path.join(temp, 'assets'));
    await writeFile(path.join(temp, 'background.png'), 'background-a');
    await writeFile(path.join(temp, 'assets', 'document.png'), 'asset-a');
    const source = {shot_id: 'SH001', assets: [{file: 'assets/document.png'}], omni: {keyframes: []}, effects: []};
    const first = await manifestInputFingerprint(temp, source);
    await writeFile(path.join(temp, 'background.png'), 'background-b');
    const second = await manifestInputFingerprint(temp, source);
    assert.notEqual(first, second);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});

test('main registry excludes QA Stills and dedicated QA registry owns them', async () => {
  const main = await readFile(path.join(root, 'video/src/index.tsx'), 'utf8');
  const qa = await readFile(path.join(root, 'video/src/qa-index.tsx'), 'utf8');
  assert.doesNotMatch(main, /ManifestCutContactSheetProvisional/);
  assert.match(qa, /ManifestCutContactSheetProvisional/);
});

test('QA context rejects an active root listed as rejected provisional material', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), '23jung-rejected-root-'));
  try {
    const statePath = path.join(temp, 'state.json');
    await writeFile(statePath, JSON.stringify({episode_id: 'episode-001', stage: 'cut-previews-ready', expected_cut_count: 48, active_cut_root: 'video/history/rejected-roots/episode-001', provisional_artifacts: {'video/history/rejected-roots/episode-001': 'historical-rejected-provisional-visual'}}));
    await assert.rejects(loadProductionContext(['--state', statePath]), /rejected\/provisional artifact/);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});

test('unified production QA preserves timing-draft and skips rendering without active cuts', () => {
  const result = spawnSync(process.execPath, ['video/scripts/production-qa.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /no active_cut_root; validators passed and no episode media was created/);
});
