import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';

const [episodeId, shotId] = process.argv.slice(2);
if (episodeId !== 'episode-001' || !/^SH\d{3}$/u.test(shotId ?? '')) {
  throw new Error('Usage: pnpm video:new-cut -- episode-001 SH008');
}

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', episodeId);
const specPath = path.join(episodeDir, 'episode-spec.json');
const contractsPath = path.join(episodeDir, 'generated', 'manifest-contracts.json');
let specBytes, contractsBytes;
try {
  [specBytes, contractsBytes] = await Promise.all([readFile(specPath), readFile(contractsPath)]);
} catch {
  throw new Error('Cannot create a cut without the canonical episode-001 episode-spec.json and generated/manifest-contracts.json. Run the episode plan generator first.');
}
const spec = JSON.parse(specBytes.toString('utf8'));
const contracts = JSON.parse(contractsBytes.toString('utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const specSha256 = sha256(specBytes);
if (spec.episode_id !== episodeId || spec.authority !== 'sole-manually-edited-episode-authority') throw new Error('episode-001 episode-spec.json is not the sole canonical episode authority');
if (contracts.episode_id !== episodeId || contracts._generated?.source_sha256 !== specSha256) throw new Error('generated manifest contracts are missing or stale; regenerate from episode-spec.json before creating a cut');
const cutContract = (contracts.cuts ?? []).find((cut) => cut.shot_id === shotId);
if (!cutContract) throw new Error(`${shotId} is not declared by episode-001/generated/manifest-contracts.json; edit episode-spec.json and regenerate instead`);

const firstBeat = cutContract.visual_beats?.[0];
const focal = cutContract.visual_components?.find((component) => component.component_id === firstBeat?.focal_component_id);
const firstAction = cutContract.planned_motion_actions?.[0];
const sourceRequirement = (cutContract.source_requirements ?? []).find((requirement) => requirement.kind === 'source-original') ?? cutContract.source_requirements?.[0];
const coverage = {
  stage: {status: 'planned', evidence: ['episode-spec.json#/background_contract']},
  focal: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/visual_beats`, `focal=${firstBeat?.focal_component_id ?? 'unassigned'}`]},
  supporting: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/visual_beats/supporting_component_ids`]},
  depth: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/visual_components/compositing`]},
  entrance: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/planned_motion_actions`, `operator=${firstAction?.operator_id ?? 'none-planned'}`]},
  'internal-change': {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/visual_action`]},
  transition: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/transition`]},
  hold: {status: 'planned', evidence: [`generated/manifest-contracts.json#/cuts/${shotId}/visual_beats/reading_hold`]},
  exclusions: {status: 'planned', evidence: ['production-authoring-contract-v1.json#/coverage_matrix/dimension_contract/exclusions', 'no-unobserved-grammar']},
};
const productionAuthoringContract = {
  version: 1,
  contract_path: 'video/contracts/production-authoring-contract-v1.json',
  route: 'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline',
  episode_spec_path: 'video/episodes/episode-001/episode-spec.json',
  episode_spec_sha256: specSha256,
  generated_manifest_contracts_path: 'video/episodes/episode-001/generated/manifest-contracts.json',
  generated_manifest_contracts_sha256: sha256(contractsBytes),
  render_catalog_path: 'video/episodes/episode-001/generated/render-catalog.json',
  cut_contract: {shot_id: shotId, source_spec_sha256: cutContract.source_spec_sha256, source_cut_sha256: cutContract.source_cut_sha256, manifest_contract_sha256: cutContract.manifest_contract_sha256},
  visual_treatment: {surface: 'episode-spec.background_contract', palette: 'reference-derived; catalog-backed runtime', typography: 'typography_surface_contract_version=2', texture: 'catalog-backed background treatment only', prohibited_treatments: ['unobserved explanatory cards', 'text over photo/person/building pixels']},
  motion_contract: {target_asset_id: focal?.asset_id ?? focal?.component_id ?? 'unassigned-focal', operator_id: firstAction?.operator_id ?? 'none-planned', start_frame: firstAction?.start_frame ?? firstBeat?.start_frame ?? 0, end_frame: firstAction?.end_frame ?? firstBeat?.reading_hold?.start_frame ?? cutContract.duration_frames, state_delta: firstAction?.action_semantic ?? cutContract.visual_action, reading_hold: firstBeat?.reading_hold ?? {start_frame: 0, end_frame: cutContract.duration_frames, minimum_seconds: 2}},
  source_contract: {source_id: sourceRequirement?.source_id ?? 'none-declared', source_kind: sourceRequirement?.kind ?? 'episode-spec requirement', locator: `episode-spec.json#/cuts/${shotId}/source_ids`, rights_status: sourceRequirement?.status === 'approved' ? 'approved-by-source-requirement' : 'pending-source-materialization', materialization_status: sourceRequirement?.approved_source?.sha256 ? 'materialized' : 'pending', sha256: sourceRequirement?.approved_source?.sha256 ?? null},
  coverage_matrix: coverage,
  production_authority: false,
};
const manifest = {
  schema_version: 3, episode_id: episodeId, shot_id: shotId, fps: 30, duration_frames: cutContract.duration_frames, claim_id: null, visual_subject: cutContract.viewer_takeaway,
  background: 'background.png', asset_directory: 'assets', production_mode: cutContract.production_mode, effects_required: false,
  omni: {keyframes: [], video_status: 'blocked_until_all_cuts_passed', output: null}, voiceover: {audio: null, text: null, status: 'draft', start_frame: 0, end_frame: null, word_cues: []},
  assets: [], animations: [], lifecycle: null, text_cues: [], chart: null, effects: [], transition: structuredClone(cutContract.transition), source_ids: structuredClone(cutContract.source_ids), source_materials: [], source_requirements: structuredClone(cutContract.source_requirements ?? []),
  missing_sources: (cutContract.source_requirements ?? []).filter((requirement) => requirement.status !== 'approved').map((requirement) => requirement.source_id ?? requirement.requirement_id), ai_disclosure: null,
  review_profile: cutContract.production_mode === 'remotion' ? 'remotion-motion' : cutContract.production_mode === 'omni' ? 'omni-keyframe-input' : cutContract.production_mode === 'source-video' ? 'source-video-selection' : 'source-photo-treatment',
  visual_components: structuredClone(cutContract.visual_components ?? []), visual_beats: structuredClone(cutContract.visual_beats ?? []), motion_actions: structuredClone(cutContract.planned_motion_actions ?? []),
  runtime_contract: {operator_registry: 'video/src/vox/motion/operator-registry.ts', scene_renderer: 'video/src/vox/scene/ManifestScene.tsx', transition_renderer: 'video/src/vox/scene/TransitionPair.tsx', runtime_sha256: null},
  review_requirements: {generation_input_required: true, playable_cut_required: true, full_duration_preview_required: true, transition_pair_required: ['morph', 'scene-to-scene'].includes(cutContract.transition?.type), review_artifact: null, review_artifact_sha256: null},
  approvals: {generation_input: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null}, playable_cut: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null}},
  source_spec_sha256: cutContract.source_spec_sha256, source_cut_sha256: cutContract.source_cut_sha256, manifest_contract_sha256: cutContract.manifest_contract_sha256, implementation_status: 'planned-not-implemented', presentation_contract_version: 2, typography_surface_contract_version: 2,
  production_authoring_contract: productionAuthoringContract, mobile_review: {width: 360, height: 203, minimum_quote_font_px_at_1080p: 72, maximum_quote_lines: 2, requires_human_review: true},
};

const templateRoot = path.join(root, 'video', 'public', 'assets', '_cut-template');
const cutsRoot = path.join(root, 'video', 'public', 'assets', episodeId, 'cuts');
const targetRoot = path.join(cutsRoot, shotId);
// Effects are opt-in; an empty effects directory is deliberately not created.
const requiredDirectories = ['assets', 'remotion', 'omni', 'source-photo', 'source-video', 'audio', 'preview'];
await mkdir(cutsRoot, {recursive: true});
await mkdir(targetRoot, {recursive: false});
await Promise.all(requiredDirectories.map((directory) => mkdir(path.join(targetRoot, directory))));
await copyFile(path.join(templateRoot, 'background.png'), path.join(targetRoot, 'background.png'), fsConstants.COPYFILE_EXCL);
await writeFile(path.join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
console.log(`Created spec-bound v3 scaffold ${path.relative(root, targetRoot)}`);
