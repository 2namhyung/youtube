import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readdir, rm, writeFile, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
  approveV3Manifests,
  approvedInputsHash,
  createEpisodeV3Fixture,
  episodeV3Args,
  markSourcePlanSelectedForFixture,
  sha256File,
  silentWav,
  updateActiveManifests,
  writeFixturePng as writePng,
  writeFixtureVideo as writeOmniVideo,
  writeProvisionalArtifact,
} from './helpers/episode-v3-fixture.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const stageScript = path.join(root, 'video', 'scripts', 'validate-production-stage.mjs');
const cutScript = path.join(root, 'video', 'scripts', 'validate-cut-assets.mjs');

function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {cwd: root, encoding: 'utf8', windowsHide: true});
}
const fixture = createEpisodeV3Fixture;
const stateArgs = episodeV3Args;

function silentWavForSeconds(seconds) {
  const sampleRate = 8000;
  const channels = 1;
  const bits = 16;
  const sampleCount = Math.round(sampleRate * seconds);
  const dataSize = sampleCount * channels * (bits / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32); buffer.writeUInt16LE(bits, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test('timing-draft has zero active cuts and all historical/rejected roots are reported', async () => {
  const productionState = JSON.parse(await readFile(path.join(root, 'video', 'episodes', 'episode-001', 'production-state.json'), 'utf8'));
  const historicalStatuses = new Set(['rejected-provisional-visual', 'historical-rejected-provisional-visual', 'historical-rejected-style-calibration', 'historical-viewer-quality-failure']);
  const styleCalibrationStatuses = new Set(['style-calibration-only', 'style-calibration-candidate']);
  let expectedRejectedCuts = 0;
  let expectedStyleCalibrationCuts = 0;
  for (const [relativeRoot, status] of Object.entries(productionState.provisional_artifacts)) {
    if (!historicalStatuses.has(status) && !styleCalibrationStatuses.has(status)) continue;
    const entries = await readdir(path.join(root, relativeRoot, 'cuts'), {withFileTypes: true}).catch(() => []);
    const count = entries.filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name)).length;
    if (historicalStatuses.has(status)) expectedRejectedCuts += count;
    else expectedStyleCalibrationCuts += count;
  }
  assert.ok(expectedRejectedCuts > 0, 'state-declared historical roots must contain cut folders');
  const result = run(stageScript);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.current_stage, 'timing-draft');
  assert.equal(report.active_cut_count, 0);
  assert.equal(report.active_manifest_count, 0);
  assert.equal(report.rejected_cut_count, expectedRejectedCuts);
  assert.equal(report.style_calibration_cut_count, expectedStyleCalibrationCuts);
  assert.deepEqual([...(productionState.style_calibration.shot_ids ?? [])].sort(), [...(productionState.render_authority.present_shot_ids ?? [])].sort());
  assert.match(report.warnings.join('\n'), /video\/history\/rejected-roots\/episode-001 is rejected\/historical/u);
  assert.match(report.warnings.join('\n'), /episode-001-v03 is rejected/u);

  const cuts = run(cutScript);
  assert.equal(cuts.status, 0, cuts.stderr || cuts.stdout);
  assert.match(cuts.stdout, /Validated planning stage/u);
  assert.match(cuts.stdout, new RegExp(`rejected ${expectedRejectedCuts} provisional/historical cut folders`, 'u'));
  const requireCuts = run(cutScript, ['--require-cuts']);
  assert.notEqual(requireCuts.status, 0);
  assert.match(requireCuts.stderr, /requires production state's active_cut_root/u);
});

test('final script cannot lock without visual approval', () => {
  const result = run(stageScript, ['--lock', 'final-script']);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /visual_review\.user_approved/u);
});

test('provisional render requires a safe marker and pre-picture-lock name', () => {
  const bad = run(stageScript, ['--render-output', 'exports/episode-001-master-animatic.mp4']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /cannot contain master\/final\/picturelocked/u);
  const good = run(stageScript, ['--render-output', 'exports/episode-001-provisional.mp4']);
  assert.equal(good.status, 0, good.stderr || good.stdout);
});

test('main runtime registry excludes all legacy rejected provisional compositions', async () => {
  const source = await readFile(path.join(root, 'video', 'src', 'index.tsx'), 'utf8');
  const ids = [...source.matchAll(/<Composition\s+id="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(ids.length, 0);
  assert.ok(!ids.includes('SupplementaryInvestigationEpisode001'));
  assert.ok(!ids.some((id) => /LegacyRejected|V03Rejected|RejectedProvisional/u.test(id)));
});

test('legal stage progression enforces cut PASS, Omni generation, full-video approval, and the spec cut set', async () => {
  const data = await markSourcePlanSelectedForFixture(await fixture());
  const plannedShotIds = data.contracts.cuts.map((cut) => cut.shot_id);
  try {
    let result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    // Per-cut PASS is a separate gate.  It unlocks Omni generation, but does
    // not yet approve the full provisional video.
    data.state.stage = 'cut-review-approved';
    let cutReviewMarker = await approveV3Manifests(data);
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    // Only now may the Omni clip be generated, and a provisional video may be
    // assembled.  It is still not eligible for final script lock.
    for (const shot of plannedShotIds) {
      const manifest = JSON.parse(await readFile(path.join(data.activeRoot, 'cuts', shot, 'manifest.json'), 'utf8'));
      if (manifest.production_mode === 'omni') await writeOmniVideo(path.join(data.activeRoot, 'cuts', shot, 'omni', 'output.mp4'));
    }
    const provisionalArtifact = await writeProvisionalArtifact(data);
    await updateActiveManifests(data, (manifest) => {
      if (manifest.production_mode === 'omni') {
        manifest.omni.video_status = 'generated';
        manifest.omni.output = 'omni/output.mp4';
        manifest.review_profile = 'omni-generated-motion';
        manifest.review_requirements.playable_cut_required = true;
      }
    });
    cutReviewMarker = await approveV3Manifests(data);
    data.state.stage = 'provisional-video-ready';
    const artifactHash = await sha256File(path.resolve(root, provisionalArtifact));
    data.state.provisional_video = {status: 'ready', artifact: provisionalArtifact, artifact_sha256: artifactHash, approval_marker: cutReviewMarker};
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    // Full provisional-video approval is distinct from the individual
    // cut approvals and is required before the final script can lock.
    data.state.stage = 'visual-review-approved';
    data.state.visual_review = {
      user_approved: true,
      all_cuts_passed: true,
      approval_marker: `visual-review-2026-08-25-${artifactHash}`,
      provisional_video_approval_marker: cutReviewMarker,
      approved_artifact_sha256: artifactHash,
    };
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    data.state.stage = 'script-locked';
    data.state.final_script = {status: 'locked', user_visual_review_approval_marker: `visual-review-2026-08-25-${artifactHash}`, locked_at: '2026-08-25T00:00:00Z'};
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    await updateActiveManifests(data, (manifest, index) => {
      manifest.animations = [];
      manifest.text_cues = [];
      manifest.effects = [];
      manifest.voiceover = {status: 'final-measured', audio: `audio/${String(index).padStart(3, '0')}.wav`, word_cues: []};
      manifest.lifecycle = {};
      manifest.source_materials = manifest.source_ids.map((sourceId) => ({source_id: sourceId, original_url: 'https://example.test/source', rights_status: 'approved', approval_status: 'approved'}));
      manifest.final_qc = {status: 'approved', marker: `qc-${index}`};
      if (manifest.production_mode === 'omni') manifest.ai_disclosure = {tool: 'fixture-imagegen', generated_at: '2026-08-25T00:00:00Z', label: 'AI-generated fictional cut', prompt: 'fixture prompt'};
    });
    const narrationPlan = JSON.parse(await readFile(path.join(root, 'video', 'episodes', 'episode-001', 'narration-plan.json'), 'utf8'));
    for (const [index, shot] of plannedShotIds.entries()) {
      const contract = data.contracts.cuts[index];
      const planCut = narrationPlan.cuts[index];
      const voiceFrames = contract.duration_frames - planCut.pre_roll_frames - planCut.post_hold_frames;
      await writeFile(path.join(data.audioDir, `${shot}.wav`), silentWavForSeconds(voiceFrames / 30));
    }
    cutReviewMarker = await approveV3Manifests(data);
    data.state.provisional_video.approval_marker = cutReviewMarker;
    data.state.visual_review.provisional_video_approval_marker = cutReviewMarker;
    data.state.stage = 'final-voice-locked';
    data.state.final_voice = {status: 'locked', all_cut_audio_measured: true, locked_at: '2026-08-25T00:00:00Z'};
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    data.state.stage = 'audio-timed-assembly';
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.equal(result.status, 0, result.stderr || result.stdout);

    data.state.stage = 'picture-locked';
    data.state.picture_lock.final_qc_marker = 'episode-qc-2026-08-25';
    data.state.picture_lock.approved = true;
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, [...stateArgs(data), '--render-output', 'exports/episode-001-final.mp4']);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    await rm(path.join(data.activeRoot, 'cuts', plannedShotIds.at(-1)), {recursive: true, force: true});
    data.state.stage = 'cut-previews-ready';
    await writeFile(data.statePath, JSON.stringify(data.state));
    result = run(stageScript, stateArgs(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, new RegExp(`exactly ${data.state.expected_cut_count} physical cuts`, 'u'));
  } finally {
    await rm(data.dir, {recursive: true, force: true});
  }
});

test('final-voice rejects empty manifests/audio despite boolean lock flags', async () => {
  const data = await fixture();
  try {
    data.state.stage = 'final-voice-locked';
    const artifact = await writeProvisionalArtifact(data);
    const artifactHash = await sha256File(path.resolve(root, artifact));
    const inputHash = await approvedInputsHash(data);
    const cutMarker = `cut-review-${inputHash}`;
    data.state.cut_review = {status: 'approved', all_cuts_passed: true, approval_marker: cutMarker, approved_inputs_sha256: inputHash};
    data.state.omni_video_generation = {status: 'allowed', allowed_after_marker: cutMarker};
    data.state.provisional_video = {status: 'ready', artifact, artifact_sha256: artifactHash, approval_marker: cutMarker};
    await updateActiveManifests(data, (manifest) => { manifest.review = {status: 'passed', user_pass: true, approval_marker: cutMarker}; });
    data.state.visual_review = {user_approved: true, all_cuts_passed: true, approval_marker: `visual-review-${artifactHash}`, provisional_video_approval_marker: cutMarker, approved_artifact_sha256: artifactHash};
    data.state.final_script = {status: 'locked', user_visual_review_approval_marker: `visual-review-${artifactHash}`, locked_at: 'now'};
    data.state.final_voice = {status: 'locked', all_cut_audio_measured: true, locked_at: 'now'};
    await writeFile(data.statePath, JSON.stringify(data.state));
    const result = run(stageScript, stateArgs(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /final-voice lock requires|strict narration measurement/u);
    assert.match(result.stdout, /strict narration measurement/u);
  } finally {
    await rm(data.dir, {recursive: true, force: true});
  }
});

test('strict assembly rejects missing sources and provisional placeholders', async () => {
  const data = await fixture();
  try {
    for (const [index, shot] of data.contracts.cuts.map((cut) => cut.shot_id).entries()) {
      const cut = path.join(data.activeRoot, 'cuts', shot);
      await writeFile(path.join(data.audioDir, `${shot}.wav`), silentWav());
      await mkdir(path.join(cut, 'assets'), {recursive: true});
      const assetFile = path.join(cut, 'assets', `SH${String(index).padStart(3, '0')}-asset.png`);
      writePng(assetFile, index % 2 === 0 ? 'blue' : 'red');
      const assetHash = await sha256File(assetFile);
      await writeFile(path.join(cut, 'manifest.json'), JSON.stringify({
        production_mode: 'remotion',
        voiceover: {status: 'final-measured', audio: 'audio/final.wav'},
        lifecycle: {}, transition: {},
        source_materials: [{source_id: `SRC-${index}`, original_url: 'https://example.test/source', rights_status: 'approved', approval_status: 'approved'}],
        assets: [{asset_id: `SH${String(index).padStart(3, '0')}-asset`, file: `assets/SH${String(index).padStart(3, '0')}-asset.png`, media_type: 'image/png', sha256: assetHash}], missing_sources: ['SRC-MISSING'], provisional_placeholder: true,
        final_qc: {status: 'approved', marker: `qc-${index}`},
      }));
    }
    data.state.stage = 'audio-timed-assembly';
    const artifact = await writeProvisionalArtifact(data);
    const artifactHash = await sha256File(path.resolve(root, artifact));
    const inputHash = await approvedInputsHash(data);
    const cutMarker = `cut-review-${inputHash}`;
    data.state.cut_review = {status: 'approved', all_cuts_passed: true, approval_marker: cutMarker, approved_inputs_sha256: inputHash};
    data.state.omni_video_generation = {status: 'allowed', allowed_after_marker: cutMarker};
    data.state.provisional_video = {status: 'ready', artifact, artifact_sha256: artifactHash, approval_marker: cutMarker};
    await updateActiveManifests(data, (manifest) => { manifest.review = {status: 'passed', user_pass: true, approval_marker: cutMarker}; });
    data.state.visual_review = {user_approved: true, all_cuts_passed: true, approval_marker: `visual-review-${artifactHash}`, provisional_video_approval_marker: cutMarker, approved_artifact_sha256: artifactHash};
    data.state.final_script = {status: 'locked', user_visual_review_approval_marker: `visual-review-${artifactHash}`, locked_at: 'now'};
    data.state.final_voice = {status: 'locked', all_cut_audio_measured: true, locked_at: 'now'};
    await writeFile(data.statePath, JSON.stringify(data.state));
    const result = run(stageScript, stateArgs(data));
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /strict assembly forbids missing planned sources/u);
    assert.match(result.stdout, /strict assembly forbids provisional placeholders/u);
  } finally {
    await rm(data.dir, {recursive: true, force: true});
  }
});

test('future versioned root is scanned normally, not auto-rejected', async () => {
  const dir = await mkdtemp(path.join(root, 'video', '.cut-discovery-'));
  try {
    const assets = path.join(dir, 'assets');
    const activeRoot = path.join(assets, 'episode-001-v04');
    await mkdir(path.join(activeRoot, 'cuts', 'SH001'), {recursive: true});
    await mkdir(path.join(assets, '_cut-template'), {recursive: true});
    await copyFile(path.join(root, 'video', 'public', 'assets', '_cut-template', 'background.png'), path.join(assets, '_cut-template', 'background.png'));
    const statePath = path.join(dir, 'production-state.json');
    await writeFile(statePath, JSON.stringify({expected_cut_count: 48, active_cut_root: path.relative(root, activeRoot).replaceAll('\\', '/'), provisional_artifacts: {}}));
    const result = run(cutScript, ['--assets-root', assets, '--state', statePath, '--require-cuts']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /episode-001-v04\/SH001/u);
    assert.doesNotMatch(result.stdout, /rejected 1 provisional/u);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
