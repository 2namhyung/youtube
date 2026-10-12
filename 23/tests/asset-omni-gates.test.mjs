import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  approveV3Manifests,
  createEpisodeV3Fixture,
  episodeV3Args,
  markSourcePlanSelectedForFixture,
  sha256File,
  writeFixtureVideo,
} from './helpers/episode-v3-fixture.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const stageScript = path.join(root, 'video', 'scripts', 'validate-production-stage.mjs');
const templateBackground = path.join(root, 'video', 'public', 'assets', '_cut-template', 'background.png');
function run(script, args = []) { return spawnSync(process.execPath, [script, ...args], {cwd: root, encoding: 'utf8', windowsHide: true}); }
const fixture = async () => markSourcePlanSelectedForFixture(await createEpisodeV3Fixture('.asset-omni-gate-'));
const args = episodeV3Args;
async function saveState(data) { await writeFile(data.statePath, JSON.stringify(data.state)); }
async function saveManifests(data, mutate) {
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    mutate(manifest);
    await writeFile(file, JSON.stringify(manifest));
  }
}
async function manifestForMode(data, mode) {
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (manifest.production_mode === mode) return {file, manifest, cut: path.dirname(file)};
  }
  throw new Error(`fixture has no ${mode} contract`);
}

test('empty active visual assets fail and imagegen keyframes make Omni provisional cuts pass', async () => {
  const data = await fixture();
  try {
    const omni = await manifestForMode(data, 'omni');
    const missing = path.join(omni.cut, omni.manifest.omni.keyframes[0].file);
    const original = await readFile(missing);
    await rm(missing);
    let result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /real local image|imagegen PNG keyframe/u);

    await writeFile(missing, original);
    result = run(stageScript, args(data));
    assert.equal(result.status, 0, result.stdout);

    await copyFile(templateBackground, missing);
    result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /duplicates the fixed background hash/u);
    await writeFile(missing, original);
  } finally { await rm(data.dir, {recursive: true, force: true}); }
});

test('Omni output is blocked before cut PASS and allowed after every planned cut has an individual PASS record', async () => {
  const data = await fixture();
  try {
    const omni = await manifestForMode(data, 'omni');
    const output = path.join(omni.cut, 'omni', 'output.mp4');
    await writeFixtureVideo(output);
    let result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /blocked until all \d+ cuts|must not be referenced/u);

    data.state.stage = 'cut-review-approved';
    await saveManifests(data, (manifest) => {
      if (manifest.shot_id !== omni.manifest.shot_id) return;
      manifest.omni.video_status = 'generated';
      manifest.omni.output = 'omni/output.mp4';
      manifest.review_profile = 'omni-generated-motion';
      manifest.review_requirements.playable_cut_required = true;
    });
    await approveV3Manifests(data);
    assert.equal(data.state.expected_cut_count, data.contracts.cuts.length);
    assert.equal(data.manifestPaths.length, data.state.expected_cut_count);
    await saveState(data);
    result = run(stageScript, args(data));
    assert.equal(result.status, 0, result.stdout);
  } finally { await rm(data.dir, {recursive: true, force: true}); }
});

test('corrupt zero-byte effect media fails both production validators', async () => {
  const data = await fixture();
  try {
    const remotion = await manifestForMode(data, 'remotion');
    const first = remotion.file;
    const firstCut = remotion.cut;
    const manifest = remotion.manifest;
    manifest.effects_required = true;
    manifest.effects = [{effect_id: 'broken-effect', file: 'effects/broken.wav', kind: 'sfx', start_frame: 0, end_frame: 1}];
    await mkdir(path.join(firstCut, 'effects'), {recursive: true});
    await writeFile(path.join(firstCut, 'effects', 'broken.wav'), Buffer.alloc(0));
    await writeFile(first, JSON.stringify(manifest));

    let result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /ffprobe rejected the audio|positive duration and an audio stream/u);

    result = run(path.join(root, 'video', 'scripts', 'validate-cut-assets.mjs'), args(data));
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /ffprobe rejected the audio|positive duration and an audio stream/u);
  } finally { await rm(data.dir, {recursive: true, force: true}); }
});

test('cut review requires all individual PASS records and effects are opt-in', async () => {
  const data = await fixture();
  try {
    data.state.stage = 'cut-review-approved';
    data.state.cut_review = {status: 'approved', all_cuts_passed: true, approval_marker: 'cut-review-2', approved_inputs_sha256: null};
    data.state.omni_video_generation = {status: 'allowed', allowed_after_marker: 'cut-review-2'};
    await saveState(data);
    let result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /generation-input approval is required|playable-cut approval is required/u);

    await approveV3Manifests(data);
    await saveState(data);
    result = run(stageScript, args(data));
    assert.equal(result.status, 0, result.stdout);

    const remotion = await manifestForMode(data, 'remotion');
    const first = remotion.file;
    const firstCut = remotion.cut;
    const manifest = JSON.parse(await readFile(first, 'utf8'));
    manifest.effects_required = true;
    await mkdir(path.join(firstCut, 'effects'), {recursive: true});
    await writeFile(first, JSON.stringify(manifest));
    result = run(stageScript, args(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /effects_required=true requires/u);

    manifest.effects_required = false;
    await rm(path.join(firstCut, 'effects'), {recursive: true, force: true});
    await writeFile(first, JSON.stringify(manifest));
    result = run(stageScript, args(data));
    assert.equal(result.status, 0, result.stdout);
  } finally { await rm(data.dir, {recursive: true, force: true}); }
});
