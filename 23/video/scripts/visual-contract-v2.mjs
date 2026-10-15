import {createHash} from 'node:crypto';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {streamingSha256} from './streaming-sha256.mjs';
import {APPROVAL_RUNTIME_FILES} from './runtime-file-closure.mjs';

export const OPERATOR_CAPABILITIES = Object.freeze({
  'transform.spring@1': ['layer-entry', 'layer-transform'],
  'transform.tween@1': ['layer-transform'],
  'opacity.tween@1': ['opacity-change'],
  'mask.inset@1': ['mask-reveal'],
  'svg.stroke-draw@1': ['relationship-path'],
  'document.highlight@1': ['document-emphasis'],
  'chart.reveal@1': ['chart-reveal'],
  'camera.transform@1': ['camera-reframe'],
});

export const REVIEW_PROFILES = new Set([
  'omni-keyframe-input',
  'omni-generated-motion',
  'remotion-motion',
  'source-photo-treatment',
  'source-video-selection',
]);

const numeric = (value) => typeof value === 'number' && Number.isFinite(value);
const changed = (params, pairs) => pairs.some(([from, to, fromDefault, toDefault]) =>
  Number(params?.[from] ?? fromDefault) !== Number(params?.[to] ?? toDefault));

const noOp = (action) => {
  const p = action.params ?? {};
  if (['transform.spring@1', 'transform.tween@1', 'camera.transform@1'].includes(action.operator_id)) {
    return !changed(p, [
      ['from_x', 'to_x', 0, 0], ['from_y', 'to_y', 0, 0], ['from_scale', 'to_scale', 1, 1],
      ['from_rotate', 'to_rotate', 0, 0], ['from_opacity', 'to_opacity', 1, 1],
    ]);
  }
  if (action.operator_id === 'opacity.tween@1') return !changed(p, [['from_opacity', 'to_opacity', 0, 1]]);
  if (action.operator_id === 'mask.inset@1') return !changed(p, [['from_right_percent', 'to_right_percent', 100, 0]]);
  return !changed(p, [['from_progress', 'to_progress', 0, 1]]);
};

const targetSupports = (component, operatorId) => {
  if (operatorId === 'camera.transform@1') return component?.render_kind === 'camera';
  if (operatorId === 'svg.stroke-draw@1') return component?.render_kind === 'svg-path';
  if (operatorId === 'document.highlight@1') return component?.render_kind === 'document-highlight';
  if (operatorId === 'chart.reveal@1') return component?.render_kind === 'chart';
  return component?.render_kind === 'asset';
};

export function validateVisualContractV2(manifest, {requireTransitionArtifact = false} = {}) {
  const failures = [];
  if (manifest?.schema_version !== 2) return ['schema_version must be 2'];
  if (!REVIEW_PROFILES.has(manifest.review_profile)) failures.push(`unsupported review_profile ${String(manifest.review_profile)}`);
  if (manifest.production_mode === 'omni' && !['omni-keyframe-input', 'omni-generated-motion'].includes(manifest.review_profile)) failures.push('Omni cuts require an Omni review_profile');
  if (manifest.production_mode === 'remotion' && manifest.review_profile !== 'remotion-motion') failures.push('Remotion cuts require review_profile=remotion-motion');
  if (manifest.review_profile === 'omni-keyframe-input' && manifest.review_requirements?.playable_cut_required !== false) failures.push('omni-keyframe-input cannot require playable-cut review');
  if (manifest.review_profile === 'remotion-motion' && manifest.review_requirements?.full_duration_preview_required !== true) failures.push('remotion-motion requires a full-duration preview');

  const components = Array.isArray(manifest.visual_components) ? manifest.visual_components : [];
  const componentMap = new Map();
  for (const component of components) {
    if (!component?.component_id || componentMap.has(component.component_id)) failures.push('visual_components require unique component_id values');
    else componentMap.set(component.component_id, component);
    if (component?.motion_expectation === 'independent' && (component.compositing !== 'independent-layer' || component.atomicity !== 'single-editable-object')) failures.push(`${component.component_id}: independent motion requires an independent single-object layer`);
    if (component?.render_kind === 'asset' && !component.asset_id) failures.push(`${component.component_id}: asset component requires asset_id`);
    if (component?.render_kind !== 'asset' && component.asset_id !== null) failures.push(`${component.component_id}: procedural component must not claim an asset_id`);
  }
  const assetIds = new Set((manifest.assets ?? []).map((asset) => asset?.asset_id));
  for (const component of components) if (component.asset_id && !assetIds.has(component.asset_id)) failures.push(`${component.component_id}: unknown asset_id ${component.asset_id}`);

  const actions = Array.isArray(manifest.motion_actions) ? manifest.motion_actions : [];
  const actionIds = new Set();
  for (const action of actions) {
    if (!action?.action_id || actionIds.has(action.action_id)) failures.push('motion_actions require unique action_id values');
    actionIds.add(action?.action_id);
    if (!Object.hasOwn(OPERATOR_CAPABILITIES, action?.operator_id)) {
      failures.push(`${action?.action_id ?? 'action'}: unsupported canonical operator ${String(action?.operator_id)}`);
      continue;
    }
    if (!Number.isInteger(action.start_frame) || !Number.isInteger(action.end_frame) || action.start_frame < 0 || action.end_frame <= action.start_frame || action.end_frame > manifest.duration_frames) failures.push(`${action.action_id}: invalid frame range`);
    const component = componentMap.get(action.target_component_id);
    if (!component) failures.push(`${action.action_id}: unknown target_component_id ${String(action.target_component_id)}`);
    else if (!targetSupports(component, action.operator_id)) failures.push(`${action.action_id}: ${action.operator_id} does not support target render_kind=${component.render_kind}`);
    if (noOp(action)) failures.push(`${action.action_id}: no-op operator parameters are forbidden`);
    if (Object.values(action.params ?? {}).some((value) => typeof value === 'number' && !numeric(value))) failures.push(`${action.action_id}: params contain a non-finite number`);
  }

  const beats = Array.isArray(manifest.visual_beats) ? manifest.visual_beats : [];
  for (const beat of beats) {
    if (!beat?.beat_id || !beat?.purpose || !Array.isArray(beat.component_ids) || beat.component_ids.length === 0) failures.push('each visual beat requires id, purpose and components');
    for (const componentId of beat.component_ids ?? []) if (!componentMap.has(componentId)) failures.push(`${beat.beat_id}: unknown component ${componentId}`);
    const beatActions = actions.filter((action) => beat.component_ids?.includes(action.target_component_id) && action.start_frame < beat.end_frame && action.end_frame > beat.start_frame);
    for (const capability of beat.required_capabilities ?? []) {
      if (!beatActions.some((action) => OPERATOR_CAPABILITIES[action.operator_id]?.includes(capability))) failures.push(`${beat.beat_id}: capability ${capability} has no observable runtime operator`);
    }
  }

  if (manifest.runtime_contract?.operator_registry !== 'video/src/vox/motion/operator-registry.ts' || manifest.runtime_contract?.scene_renderer !== 'video/src/vox/scene/ManifestScene.tsx') failures.push('runtime_contract must name the canonical operator registry and scene renderer');
  const transitionClaim = ['morph', 'scene-to-scene'].includes(manifest.transition?.type);
  if (transitionClaim) {
    const authorityTransition = ['scene.crossfade@1', 'scene.scale-crossfade@1'].includes(manifest.transition?.operator_id);
    if (!authorityTransition && manifest.transition?.pair_renderer !== 'video/src/vox/scene/TransitionPair.tsx') failures.push('morph/scene-to-scene requires a canonical transition operator or the historical adjacent-pair renderer');
    if (authorityTransition && (Object.hasOwn(manifest.transition, 'pair_renderer') || Object.hasOwn(manifest.transition, 'pair_artifact') || Object.hasOwn(manifest.transition, 'pair_artifact_sha256'))) failures.push('authority transition keeps render evidence out of manifest; use review-ledger.json');
    if (!manifest.transition?.next_shot_id) failures.push('morph/scene-to-scene requires an adjacent next_shot_id');
    if (manifest.review_requirements?.transition_pair_required !== true) failures.push('morph/scene-to-scene requires transition_pair_required=true');
    if (requireTransitionArtifact && !authorityTransition && (!manifest.transition?.pair_artifact || !/^[a-f0-9]{64}$/iu.test(manifest.transition?.pair_artifact_sha256 ?? ''))) failures.push('historical transition claim requires a rendered adjacent-pair artifact and SHA-256');
  }
  return failures;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };

export async function runtimeSha256(root, files = APPROVAL_RUNTIME_FILES) {
  const rows = [];
  for (const relative of files) {
    const file = path.resolve(root, relative);
    if (!(await exists(file))) throw new Error(`missing runtime file ${relative}`);
    rows.push(`${relative}|${await streamingSha256(file)}`);
  }
  return sha256(Buffer.from(rows.sort().join('\n')));
}

export async function reviewBundleSha256({root, cutRoot, manifest, reviewArtifact}) {
  const rows = [];
  const manifestCopy = structuredClone(manifest);
  if (manifestCopy.runtime_contract) manifestCopy.runtime_contract.runtime_sha256 = null;
  if (manifestCopy.review_requirements) manifestCopy.review_requirements.review_artifact_sha256 = null;
  if (manifestCopy.approvals) {
    for (const approval of Object.values(manifestCopy.approvals)) {
      approval.approval_marker = null;
      approval.approved_bundle_sha256 = null;
      approval.status = 'pending';
      approval.user_pass = false;
    }
  }
  rows.push(`manifest|${sha256(Buffer.from(JSON.stringify(manifestCopy)))}`);
  for (const [kind, entries] of [['asset', manifest.assets ?? []], ['keyframe', manifest.omni?.keyframes ?? []], ['effect', manifest.effects ?? []]]) {
    for (const entry of entries) {
      const file = path.resolve(cutRoot, entry.file);
      if (!(await exists(file)) || !file.startsWith(`${path.resolve(cutRoot)}${path.sep}`)) throw new Error(`missing or unsafe ${kind} ${entry.file}`);
      rows.push(`${kind}|${entry.file.replaceAll('\\', '/')}|${await streamingSha256(file)}`);
    }
  }
  rows.push(`runtime|${await runtimeSha256(root)}`);
  if (reviewArtifact) {
    const file = path.resolve(root, reviewArtifact);
    if (!(await exists(file))) throw new Error(`missing review artifact ${reviewArtifact}`);
    rows.push(`review-artifact|${reviewArtifact.replaceAll('\\', '/')}|${await streamingSha256(file)}`);
  }
  return sha256(Buffer.from(rows.sort().join('\n')));
}
