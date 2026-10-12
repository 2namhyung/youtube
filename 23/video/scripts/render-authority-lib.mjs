import {createHash} from 'node:crypto';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';

import {loadCutAssetSheet} from './asset-sheet-contract.mjs';

export const ROOT = process.cwd();
export const sha256Bytes = (value) => createHash('sha256').update(value).digest('hex');
export const sha256File = async (file) => sha256Bytes(await readFile(file));
export const normalize = (value) => String(value).replaceAll('\\', '/');
export const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };

const sceneRuntimeFiles = [
  'video/src/cut-manifest.ts',
  'video/src/motion.tsx',
  'video/src/vox/scene/ManifestScene.tsx',
  'video/src/vox/scene/PresentationScene.tsx',
  'video/src/vox/scene/presentation-runtime.ts',
  'video/src/vox/scene/asset-sheet.ts',
  'video/src/vox/scene/model.ts',
  'video/src/vox/scene/source-video.ts',
  'video/src/vox/motion/operator-registry.ts',
  'video/src/vox/motion/presets.ts',
  'video/src/vox/collage/index.tsx',
  'video/src/vox/charts/index.tsx',
  'video/src/vox/charts/model.ts',
];

const transitionRuntimeFiles = [
  'video/src/vox/scene/TransitionPair.tsx',
  'video/src/vox/scene/EpisodeTimeline.tsx',
];

async function hashFileSet(files) {
  const rows = [];
  for (const relative of files) rows.push(`${relative}|${await sha256File(path.resolve(ROOT, relative))}`);
  return sha256Bytes(rows.sort().join('\n'));
}

export const sceneRuntimeSha256 = () => hashFileSet(sceneRuntimeFiles);
export const transitionRuntimeSha256 = () => hashFileSet(transitionRuntimeFiles);

export async function assetBundleSha256(cutRoot, manifest) {
  const inputs = [
    ['background', manifest.background],
    ...(manifest.assets ?? []).map((asset) => ['asset', asset.file]),
    ...(manifest.effects ?? []).map((effect) => ['effect', effect.file]),
    ...(manifest.omni?.keyframes ?? []).map((keyframe) => ['keyframe', keyframe.file]),
  ];
  const rows = [];
  for (const [kind, relative] of inputs) {
    const file = path.resolve(cutRoot, relative);
    const safe = path.relative(path.resolve(cutRoot), file);
    if (!safe || safe.startsWith('..') || path.isAbsolute(safe) || !(await exists(file))) throw new Error(`${manifest.shot_id}: missing or unsafe ${kind} ${relative}`);
    rows.push(`${kind}|${normalize(relative)}|${await sha256File(file)}`);
  }
  return sha256Bytes(rows.sort().join('\n'));
}

export async function loadAuthorityState() {
  const statePath = path.resolve(ROOT, 'video/episodes/episode-001/production-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const authority = state.render_authority;
  if (authority?.cut_root === null) {
    const specBytes = await readFile(path.resolve(ROOT, 'video/episodes/episode-001/episode-spec.json'));
    const spec = JSON.parse(specBytes.toString('utf8'));
    if (spec.production_routing_policy?.version !== 1 || !['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec.editorial_revision?.id)
      || state.stage !== 'timing-draft' || state.active_cut_root !== null
      || state.expected_cut_count !== spec.cuts?.length || state.draft_inputs?.episode_spec_sha256 !== sha256Bytes(specBytes)
      || authority.status !== 'blocked-superseded-by-editorial-revision' || authority.catalog !== null
      || authority.catalog_sha256 !== null || authority.production_authority !== false
      || state.cut_review?.all_cuts_passed !== false || state.visual_review?.user_approved !== false
      || state.omni_video_generation?.status !== 'blocked_until_all_cuts_passed'
      || state.omni_video_generation?.allowed_after_marker !== null
      || !spec.cuts.every((cut) => cut.production_authority === false)) {
      throw new Error('null render root requires an exact, unapproved source-search draft; it cannot grant render authority');
    }
    return {state, authority, statePath, cutRoot: null, specSha: sha256Bytes(specBytes)};
  }
  if (!authority || typeof authority.cut_root !== 'string') throw new Error('production-state.render_authority.cut_root is required');
  const cutRoot = path.resolve(ROOT, authority.cut_root);
  const publicAssets = path.resolve(ROOT, 'video/public/assets');
  const relative = path.relative(publicAssets, cutRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('render authority root must be inside video/public/assets');
  return {state, authority, statePath, cutRoot};
}

export async function buildAuthorityCatalog() {
  const {state, authority, cutRoot, specSha} = await loadAuthorityState();
  if (cutRoot === null) return {
    _generated: {do_not_edit: true, source: 'production-state.render_authority', source_spec_sha256: specSha, generator: 'video/scripts/generate-render-catalog.mjs'},
    schema_version: 2, status: 'blocked-source-search-no-render-authority', production_authority: false,
    episode_id: state.episode_id, authority_root: null, fps: 30, width: 1920, height: 1080,
    scene_runtime_sha256: await sceneRuntimeSha256(), transition_runtime_sha256: await transitionRuntimeSha256(),
    manifest_set_sha256: sha256Bytes(''), asset_sheet_set_sha256: sha256Bytes(''), treatment_contract_set_sha256: sha256Bytes(''), render_input_set_sha256: sha256Bytes(''),
    asset_sheet_schema: {path: 'video/contracts/asset-sheet.schema.json', sha256: await sha256File(path.resolve(ROOT, 'video/contracts/asset-sheet.schema.json'))},
    total_frames: 0, cuts: [], boundaries: [], compositions: [],
  };
  const declared = [...(authority.present_shot_ids ?? [])].sort();
  const physical = (await readdir(path.join(cutRoot, 'cuts'), {withFileTypes: true}))
    .filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (declared.join('|') !== physical.join('|')) throw new Error(`render authority present_shot_ids mismatch: declared ${declared.join(',')} physical ${physical.join(',')}`);
  if (declared.length === 0) throw new Error('render authority requires at least one present cut');

  const sceneSha = await sceneRuntimeSha256();
  const transitionSha = await transitionRuntimeSha256();
  const cuts = [];
  for (const shotId of declared) {
    const root = path.join(cutRoot, 'cuts', shotId);
    const manifestPath = path.join(root, 'manifest.json');
    const bytes = await readFile(manifestPath);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.shot_id !== shotId || manifest.episode_id !== state.episode_id) throw new Error(`${shotId}: manifest identity mismatch`);
    const assetSheet = await loadCutAssetSheet({cutRoot: root, manifest});
    cuts.push({
      shot_id: shotId,
      manifest_path: normalize(path.relative(ROOT, manifestPath)),
      manifest_sha256: sha256Bytes(bytes),
      asset_bundle_sha256: await assetBundleSha256(root, manifest),
      asset_sheet_path: assetSheet.path,
      asset_sheet_sha256: assetSheet.sha256,
      asset_sheet_schema_sha256: assetSheet.schema_sha256,
      asset_sheet: assetSheet.sheet,
      cut_base_path: normalize(path.relative(path.resolve(ROOT, 'video/public'), root)),
      duration_frames: manifest.duration_frames,
      start_frame: 0,
      manifest,
    });
  }

  const boundaries = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const outgoing = cuts[index];
    const incoming = cuts[index + 1];
    const transition = outgoing.manifest.transition;
    const isBridge = ['scene-to-scene', 'morph'].includes(transition?.type)
      && transition.next_shot_id === incoming.shot_id
      && Number.isInteger(transition.duration_frames)
      && transition.duration_frames > 0;
    incoming.start_frame = outgoing.start_frame + outgoing.duration_frames - (isBridge ? transition.duration_frames : 0);
    if (!isBridge) continue;
    const contract = {
      type: transition.type,
      operator_id: transition.operator_id,
      duration_frames: transition.duration_frames,
      continuity: transition.continuity ?? null,
      fallback: transition.fallback ?? null,
      shared_element: transition.shared_element ?? null,
    };
    boundaries.push({
      boundary_id: `${outgoing.shot_id}__${incoming.shot_id}`,
      outgoing_shot_id: outgoing.shot_id,
      incoming_shot_id: incoming.shot_id,
      start_frame: incoming.start_frame,
      duration_frames: transition.duration_frames,
      transition: contract,
      transition_contract_sha256: sha256Bytes(JSON.stringify(transition)),
    });
  }

  const totalFrames = Math.max(...cuts.map((cut) => cut.start_frame + cut.duration_frames));
  const compositions = [
    {composition_id: 'EP001-Episode-Provisional', kind: 'episode', window_start_frame: 0, duration_frames: totalFrames},
    ...cuts.map((cut) => ({composition_id: `EP001-Cut-${cut.shot_id}-Provisional`, kind: 'cut', shot_id: cut.shot_id, window_start_frame: cut.start_frame, duration_frames: cut.duration_frames})),
    ...boundaries.map((boundary) => ({composition_id: `EP001-Boundary-${boundary.outgoing_shot_id}-${boundary.incoming_shot_id}-Provisional`, kind: 'boundary', boundary_id: boundary.boundary_id, window_start_frame: boundary.start_frame, duration_frames: boundary.duration_frames})),
  ];
  const manifestSetSha = sha256Bytes(cuts.map((cut) => `${cut.shot_id}|${cut.manifest_sha256}|${cut.asset_bundle_sha256}`).sort().join('\n'));
  const assetSheetSetSha = sha256Bytes(cuts.map((cut) => `${cut.shot_id}|${cut.asset_sheet_path}|${cut.asset_sheet_sha256}`).sort().join('\n'));
  const treatmentContractSetSha = sha256Bytes(cuts.map((cut) => `${cut.shot_id}|${JSON.stringify({
    treatments: cut.manifest.treatments ?? [],
    background: cut.asset_sheet.background.treatment,
    layers: cut.asset_sheet.layers.map((layer) => ({component_id: layer.component_id, treatment: layer.treatment})),
    system_layers: cut.asset_sheet.system_layers.map((layer) => ({system_id: layer.system_id, treatment: layer.treatment})),
  })}`).sort().join('\n'));
  const schemaHashes = [...new Set(cuts.map((cut) => cut.asset_sheet_schema_sha256))];
  if (schemaHashes.length !== 1) throw new Error('asset sheet schema hash differs between cuts');
  const assetSheetSchema = {path: 'video/contracts/asset-sheet.schema.json', sha256: schemaHashes[0]};
  return {
    _generated: {do_not_edit: true, source: 'production-state.render_authority', generator: 'video/scripts/generate-render-catalog.mjs'},
    schema_version: 2,
    episode_id: state.episode_id,
    authority_root: normalize(authority.cut_root),
    fps: 30,
    width: 1920,
    height: 1080,
    scene_runtime_sha256: sceneSha,
    transition_runtime_sha256: transitionSha,
    manifest_set_sha256: manifestSetSha,
    asset_sheet_schema: assetSheetSchema,
    asset_sheet_set_sha256: assetSheetSetSha,
    treatment_contract_set_sha256: treatmentContractSetSha,
    render_input_set_sha256: sha256Bytes(`${manifestSetSha}|${assetSheetSetSha}|${treatmentContractSetSha}`),
    total_frames: totalFrames,
    cuts,
    boundaries,
    compositions,
  };
}

export function renderCatalogTypeScript(catalog) {
  return `import type {AnyCutManifest, CutManifest, SharedElementFallback, SharedElementTransition} from '../cut-manifest';\nimport type {CutAssetSheet} from '../vox/scene/asset-sheet';\n\ntype TimelineTransitionContract = {\n  type: 'scene-to-scene' | 'morph';\n  operator_id: 'scene.crossfade@1' | 'scene.scale-crossfade@1' | 'scene.shared-element@1';\n  duration_frames: number;\n  continuity: CutManifest['transition']['continuity'];\n  fallback?: SharedElementFallback | null;\n  shared_element?: SharedElementTransition | null;\n};\n\nexport type RenderAuthorityCatalog = {\n  episode_id: string; fps: number; width: number; height: number; total_frames: number;\n  authority_root: string | null; status?: string; production_authority?: boolean; scene_runtime_sha256: string; transition_runtime_sha256: string; manifest_set_sha256: string; asset_sheet_set_sha256: string; render_input_set_sha256: string;\n  asset_sheet_schema: {path: string; sha256: string};\n  cuts: Array<{shot_id: string; manifest_path: string; manifest_sha256: string; asset_bundle_sha256: string; asset_sheet_path: string; asset_sheet_sha256: string; asset_sheet: CutAssetSheet; manifest: AnyCutManifest; cut_base_path: string; start_frame: number; duration_frames: number}>;\n  boundaries: Array<{boundary_id: string; outgoing_shot_id: string; incoming_shot_id: string; start_frame: number; duration_frames: number; transition_contract_sha256: string; transition: TimelineTransitionContract}>;\n  compositions: Array<{composition_id: string; kind: string; shot_id?: string; boundary_id?: string; window_start_frame: number; duration_frames: number}>;\n};\n\nexport const renderAuthorityCatalog = ${JSON.stringify(catalog, null, 2)} as unknown as RenderAuthorityCatalog;\n`;
}
