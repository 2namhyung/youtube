import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {reviewBundleSha256, runtimeSha256} from '../../video/scripts/visual-contract-v2.mjs';

export const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const templateBackground = path.join(repoRoot, 'video/public/assets/_cut-template/background.png');
const pngFixtures = new Map();
let videoFixture;

export function writeFixturePng(file, color = 'red') {
  if (!pngFixtures.has(color)) {
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=64x64`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], {encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true});
    assert.equal(result.status, 0, result.stderr?.toString() || 'ffmpeg failed to create fixture PNG');
    pngFixtures.set(color, result.stdout);
  }
  writeFileSync(file, pngFixtures.get(color));
}

export async function writeFixtureVideo(file) {
  if (!videoFixture) {
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=10', '-t', '0.2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], {encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true});
    assert.equal(result.status, 0, result.stderr?.toString() || 'ffmpeg failed to create fixture video');
    videoFixture = result.stdout;
  }
  await writeFile(file, videoFixture);
}

export async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function createEpisodeV3Fixture(prefix = '.stage-gate-') {
  const dir = await mkdtemp(path.join(repoRoot, 'video', prefix));
  const assets = path.join(dir, 'assets');
  // Match the production scanners' versioned-root grammar while remaining
  // isolated inside the temporary fixture directory.
  const activeRoot = path.join(assets, 'episode-001-v99');
  await mkdir(path.join(assets, '_cut-template'), {recursive: true});
  await copyFile(templateBackground, path.join(assets, '_cut-template', 'background.png'));
  await mkdir(path.join(activeRoot, 'cuts'), {recursive: true});
  const generated = JSON.parse(await readFile(path.join(repoRoot, 'video/episodes/episode-001/generated/manifest-contracts.json'), 'utf8'));
  const fixtureContracts = structuredClone(generated);
  const sourceSpecPath = path.join(repoRoot, 'video/episodes/episode-001/episode-spec.json');
  const sourceSpec = JSON.parse(await readFile(sourceSpecPath, 'utf8'));
  const sourceRequirementsByShot = new Map(generated.cuts.map((contract) => [contract.shot_id, contract.source_requirements ?? []]));
  const templateHash = await sha256File(path.join(assets, '_cut-template', 'background.png'));
  for (const [index, contract] of fixtureContracts.cuts.entries()) {
    // Stage-gate fixtures test lifecycle behavior, not acquisition ledgers.
    contract.source_requirements = [];
    for (const component of contract.visual_components) {
      if (component.visibility_timeline?.[0]?.start_frame === 0) component.visibility_timeline[0].start_frame = 1;
    }
    const authorityTransition = ['scene.crossfade@1', 'scene.scale-crossfade@1'].includes(contract.transition?.operator_id);
    if (['morph', 'scene-to-scene'].includes(contract.transition?.type) && !authorityTransition) {
      contract.transition = {
        ...contract.transition,
        pair_renderer: 'video/src/vox/scene/TransitionPair.tsx',
        next_shot_id: fixtureContracts.cuts[index + 1]?.shot_id ?? null,
        pair_artifact: 'background.png',
        pair_artifact_sha256: templateHash,
      };
    }
  }
  const contractsPath = path.join(dir, 'manifest-contracts.json');
  await writeFile(contractsPath, JSON.stringify(fixtureContracts));
  const episodeSpecSha256 = await sha256File(sourceSpecPath);
  const manifestContractsSha256 = await sha256File(contractsPath);
  const currentRuntimeHash = await runtimeSha256(repoRoot);
  const manifestPaths = [];
  for (const contract of fixtureContracts.cuts) {
    const shot = contract.shot_id;
    const cut = path.join(activeRoot, 'cuts', shot);
    const mode = contract.production_mode;
    const mediaDirectory = mode === 'omni' ? 'omni' : mode === 'source-photo' ? 'source-photo' : mode === 'source-video' ? 'source-video' : 'assets';
    await mkdir(path.join(cut, mediaDirectory), {recursive: true});
    await mkdir(path.join(cut, 'preview'), {recursive: true});
    await copyFile(templateBackground, path.join(cut, 'background.png'));
    const mediaFile = `${mediaDirectory}/${shot}-${mode === 'source-video' ? 'source.mp4' : mode === 'omni' ? 'imagegen.png' : 'asset.png'}`;
    if (mode !== 'source-video') writeFixturePng(path.join(cut, mediaFile), mode === 'omni' ? 'red' : 'blue');
    const mediaHash = mode === 'source-video' ? null : await sha256File(path.join(cut, mediaFile));
    const assetIds = [...new Set(contract.visual_components.map((component) => component.asset_id).filter(Boolean))];
    let assetsForManifest;
    if (mode === 'source-video') {
      await mkdir(path.join(cut, 'assets'), {recursive: true});
      const primaryVideoIds = new Set(contract.visual_components.filter((component) => (component.semantic_role === 'primary' || component.presentation_slot === 'focal') && component.asset_id).map((component) => component.asset_id));
      const requirements = new Map(sourceRequirementsByShot.get(shot).map((item) => [item.asset_id, item]));
      assetsForManifest = [];
      for (const assetId of assetIds) {
        if (primaryVideoIds.has(assetId)) {
          const file = `source-video/${assetId}.mp4`;
          await writeFixtureVideo(path.join(cut, file));
          assetsForManifest.push({
            asset_id: assetId,
            file,
            media_type: 'video/mp4',
            role: 'evidence',
            z_index: 10,
            source_id: requirements.get(assetId)?.source_id ?? `FIXTURE-${assetId}`,
            sha256: await sha256File(path.join(cut, file)),
            source_duration_seconds: 0.2,
            source_timecode: {
              start: '00:00:00.000', end: '00:00:00.100', start_seconds: 0, end_seconds: 0.1,
              speaker: assetId.includes('park') ? '박형수 fixture' : '김승원 fixture',
              context: 'fixture plenary statement', locator: `${assetId} 00:00:00.000–00:00:00.100`, locator_basis: 'generated fixture video',
            },
          });
        } else {
          const file = `assets/${assetId}.png`;
          writeFixturePng(path.join(cut, file), 'blue');
          assetsForManifest.push({asset_id: assetId, file, media_type: 'image/png', role: 'fixture', z_index: 10, source_id: null, sha256: await sha256File(path.join(cut, file))});
        }
      }
    } else {
      assetsForManifest = assetIds.map((assetId) => ({asset_id: assetId, file: mediaFile, media_type: 'image/png', role: 'fixture', z_index: 10, sha256: mediaHash}));
    }
    const reviewArtifactFile = path.join(cut, 'preview', 'review.png');
    const reviewArtifact = path.relative(repoRoot, reviewArtifactFile).replaceAll('\\', '/');
    writeFixturePng(reviewArtifactFile, 'green');
    const manifestPath = path.join(cut, 'manifest.json');
    const firstBeat = contract.visual_beats?.[0];
    const firstAction = contract.planned_motion_actions?.[0];
    const focal = contract.visual_components.find((component) => component.component_id === firstBeat?.focal_component_id);
    const coverageEvidence = (dimension) => ({status: 'implemented', evidence: [`fixture:${shot}:${dimension}`]});
    await writeFile(manifestPath, JSON.stringify({
      schema_version: 3,
      presentation_contract_version: 1,
      source_spec_sha256: contract.source_spec_sha256,
      source_cut_sha256: contract.source_cut_sha256,
      manifest_contract_sha256: contract.manifest_contract_sha256,
      implementation_status: 'implemented',
      episode_id: 'episode-001',
      shot_id: shot,
      fps: 30,
      duration_frames: contract.duration_frames,
      production_mode: mode,
      background: 'background.png',
      source_ids: contract.source_ids,
      source_materials: [],
      assets: assetsForManifest,
      effects: [],
      effects_required: false,
      visual_components: contract.visual_components.map((component) => ({...component, implementation_status: 'implemented'})),
      visual_beats: contract.visual_beats,
      motion_actions: contract.planned_motion_actions.map((action) => ({...action, implementation_status: 'implemented'})),
      transition: contract.transition,
      review_profile: mode === 'remotion' ? 'remotion-motion' : mode === 'omni' ? 'omni-keyframe-input' : mode === 'source-video' ? 'source-video-selection' : 'source-photo-treatment',
      review_requirements: {
        generation_input_required: true,
        playable_cut_required: mode !== 'omni',
        full_duration_preview_required: mode === 'remotion',
        transition_pair_required: ['morph', 'scene-to-scene'].includes(contract.transition?.type),
        review_artifact: reviewArtifact,
        review_artifact_sha256: null,
      },
      runtime_contract: {
        operator_registry: 'video/src/vox/motion/operator-registry.ts',
        scene_renderer: 'video/src/vox/scene/ManifestScene.tsx',
        transition_renderer: 'video/src/vox/scene/TransitionPair.tsx',
        runtime_sha256: currentRuntimeHash,
      },
      production_authoring_contract: {
        version: 1,
        contract_path: 'video/contracts/production-authoring-contract-v1.json',
        route: 'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline',
        episode_spec_path: 'video/episodes/episode-001/episode-spec.json',
        episode_spec_sha256: episodeSpecSha256,
        generated_manifest_contracts_path: 'video/episodes/episode-001/generated/manifest-contracts.json',
        generated_manifest_contracts_sha256: manifestContractsSha256,
        render_catalog_path: 'video/episodes/episode-001/generated/render-catalog.json',
        cut_contract: {
          shot_id: shot,
          source_spec_sha256: contract.source_spec_sha256,
          source_cut_sha256: contract.source_cut_sha256,
          manifest_contract_sha256: contract.manifest_contract_sha256,
        },
        visual_treatment: {
          surface: 'fixture-background', palette: 'fixture-palette', typography: 'fixture-typography',
          texture: 'fixture-texture', prohibited_treatments: ['unbound-grammar'],
        },
        motion_contract: {
          target_asset_id: focal?.asset_id ?? focal?.component_id ?? 'fixture-focal',
          operator_id: firstAction?.operator_id ?? 'none-planned',
          start_frame: firstAction?.start_frame ?? firstBeat?.start_frame ?? 0,
          end_frame: firstAction?.end_frame ?? firstBeat?.reading_hold?.start_frame ?? contract.duration_frames,
          state_delta: firstAction?.action_semantic ?? 'fixture-state-delta',
          reading_hold: firstBeat?.reading_hold ?? {start_frame: Math.max(0, contract.duration_frames - 60), end_frame: contract.duration_frames},
        },
        source_contract: {
          source_id: contract.source_ids?.[0] ?? 'fixture-source', source_kind: 'fixture',
          locator: `fixture:${shot}`, rights_status: 'fixture-only', materialization_status: 'materialized', sha256: mediaHash ?? templateHash,
        },
        coverage_matrix: Object.fromEntries(['stage', 'focal', 'supporting', 'depth', 'entrance', 'internal-change', 'transition', 'hold', 'exclusions'].map((dimension) => [dimension, coverageEvidence(dimension)])),
        production_authority: false,
      },
      approvals: {
        generation_input: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null},
        playable_cut: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null},
      },
      mobile_review: {width: 360, height: 203, minimum_quote_font_px_at_1080p: 72, maximum_quote_lines: 2, requires_human_review: true},
      omni: mode === 'omni' ? {keyframes: [{file: mediaFile, keyframe_id: `${shot}-imagegen`, sha256: mediaHash}], video_status: 'blocked_until_all_cuts_passed', output: null} : undefined,
      review: {status: 'pending', user_pass: false, approval_marker: null},
    }));
    manifestPaths.push(manifestPath);
  }
  const statePath = path.join(dir, 'production-state.json');
  const audioDir = path.join(dir, 'audio');
  await mkdir(audioDir, {recursive: true});
  const fixtureSpecPath = path.join(dir, 'episode-spec.json');
  await copyFile(sourceSpecPath, fixtureSpecPath);
  const state = {
    schema_version: 1,
    episode_id: 'episode-001',
    stage: 'cut-previews-ready',
    expected_cut_count: fixtureContracts.cuts.length,
    active_cut_root: path.relative(repoRoot, activeRoot).replaceAll('\\', '/'),
    draft_inputs: {temporary_script_available: true},
    cut_review: {status: 'pending', all_cuts_passed: false, approval_marker: null},
    omni_video_generation: {status: 'blocked_until_all_cuts_passed', allowed_after_marker: null},
    provisional_video: {status: 'blocked', artifact: null, approval_marker: null},
    visual_review: {user_approved: false, all_cuts_passed: false, approval_marker: null, provisional_video_approval_marker: null},
    final_script: {status: 'unlocked', user_visual_review_approval_marker: null, locked_at: null},
    final_voice: {status: 'unlocked', all_cut_audio_measured: false, locked_at: null},
    picture_lock: {approved: false, final_qc_marker: null},
    provisional_artifacts: {},
  };
  await writeFile(statePath, JSON.stringify(state));
  return {dir, assets, activeRoot, statePath, audioDir, state, specPath: fixtureSpecPath, contractsPath, contracts: fixtureContracts, manifestPaths};
}

export function episodeV3Args(data) {
  return ['--state', data.statePath, '--spec', data.specPath, '--assets-root', data.assets, '--audio-dir', data.audioDir, '--contracts', data.contractsPath];
}

export async function markSourcePlanSelectedForFixture(data) {
  // Simulate the selected-plan phase in a temp copy for lifecycle tests. This
  // creates no live source/user approval and does not promote live authority.
  const spec = JSON.parse(await readFile(data.specPath, 'utf8'));
  spec.status = 'approved-script-source-first-semantic-plan';
  spec.editorial_revision.status = 'source-selected-editorial-plan';
  await writeFile(data.specPath, JSON.stringify(spec));
  const specSha256 = await sha256File(data.specPath);
  data.contracts._generated.source_sha256 = specSha256;
  data.contracts.source_spec_sha256 = specSha256;
  for (const contract of data.contracts.cuts) contract.source_spec_sha256 = specSha256;
  await writeFile(data.contractsPath, JSON.stringify(data.contracts));
  const contractsSha256 = await sha256File(data.contractsPath);
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.source_spec_sha256 = specSha256;
    manifest.production_authoring_contract.episode_spec_sha256 = specSha256;
    manifest.production_authoring_contract.generated_manifest_contracts_sha256 = contractsSha256;
    manifest.production_authoring_contract.cut_contract.source_spec_sha256 = specSha256;
    await writeFile(file, JSON.stringify(manifest));
  }
  data.state.draft_inputs.episode_spec = path.relative(repoRoot, data.specPath).replaceAll('\\', '/');
  await writeFile(data.statePath, JSON.stringify(data.state));
  return data;
}

export async function updateActiveManifests(data, update) {
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    // Negative fixtures may intentionally remove identity/schema fields. Use
    // the immutable cut-folder identity for callback bookkeeping without
    // repairing the manifest; the production validator must see the omission.
    const folderShotId = path.basename(path.dirname(file));
    const shotId = typeof manifest.shot_id === 'string' ? manifest.shot_id : folderShotId;
    const match = /^SH(\d{3})$/u.exec(shotId);
    update(manifest, match ? Number.parseInt(match[1], 10) : null, shotId);
    await writeFile(file, JSON.stringify(manifest));
  }
}

export async function writeProvisionalArtifact(data) {
  const artifact = path.join(data.dir, 'exports', 'episode-001-provisional.mp4');
  await mkdir(path.dirname(artifact), {recursive: true});
  await writeFixtureVideo(artifact);
  return path.relative(repoRoot, artifact).replaceAll('\\', '/');
}

export async function approvedInputsHash(data) {
  const rows = [];
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const cut = path.dirname(file);
    const label = `${path.basename(data.activeRoot)}/${manifest.shot_id}`;
    for (const asset of manifest.assets ?? []) rows.push(`${label}|asset|${asset.file}|${await sha256File(path.join(cut, asset.file))}`);
    for (const keyframe of manifest.omni?.keyframes ?? []) rows.push(`${label}|keyframe|${keyframe.file}|${await sha256File(path.join(cut, keyframe.file))}`);
    for (const effect of manifest.effects ?? []) rows.push(`${label}|effect|${effect.file}|${await sha256File(path.join(cut, effect.file))}`);
  }
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex');
}

export async function approveV3Manifests(data) {
  const generationRows = [];
  const playableRows = [];
  for (const file of data.manifestPaths) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.review = {status: 'passed', user_pass: true, approval_marker: null};
    const bundle = await reviewBundleSha256({root: repoRoot, cutRoot: path.dirname(file), manifest, reviewArtifact: manifest.review_requirements.review_artifact});
    manifest.approvals.generation_input = {status: 'passed', user_pass: true, approval_marker: `generation-${bundle}`, approved_bundle_sha256: bundle};
    generationRows.push(`${path.basename(data.activeRoot)}/${manifest.shot_id}|${bundle}`);
    if (manifest.review_profile !== 'omni-keyframe-input') {
      manifest.approvals.playable_cut = {status: 'passed', user_pass: true, approval_marker: `playable-${bundle}`, approved_bundle_sha256: bundle};
      playableRows.push(`${path.basename(data.activeRoot)}/${manifest.shot_id}|${bundle}`);
    }
    await writeFile(file, JSON.stringify(manifest));
  }
  const generationHash = createHash('sha256').update(generationRows.sort().join('\n')).digest('hex');
  const playableHash = createHash('sha256').update(playableRows.sort().join('\n')).digest('hex');
  const marker = `cut-review-${generationHash}-${playableHash}`;
  data.state.generation_input_review = {status: 'approved', all_inputs_passed: true, approval_marker: `generation-${generationHash}`, approved_bundle_sha256: generationHash};
  data.state.playable_cut_review = {status: 'approved', all_playable_cuts_passed: true, approval_marker: `playable-${playableHash}`, approved_bundle_sha256: playableHash};
  data.state.cut_review = {status: 'approved', all_cuts_passed: true, approval_marker: marker, approved_inputs_sha256: null};
  data.state.omni_video_generation = {status: 'allowed', allowed_after_marker: marker};
  return marker;
}

export function silentWav(seconds = 10) {
  const sampleRate = 8000;
  const channels = 1;
  const bits = 16;
  const dataSize = sampleRate * channels * (bits / 8) * seconds;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32); buffer.writeUInt16LE(bits, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
