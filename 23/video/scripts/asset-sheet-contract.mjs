import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const normalize = (value) => String(value).replaceAll('\\', '/');
const sha256File = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

export const ASSET_SHEET_SCHEMA_PATH = 'video/contracts/asset-sheet.schema.json';

const overlaps = (a, b) => a.left < b.left + b.width
  && a.left + a.width > b.left
  && a.top < b.top + b.height
  && a.top + a.height > b.top;

const unique = (values) => new Set(values).size === values.length;

export function validateAssetSheet({sheet, manifest, schema}) {
  const failures = [];
  const fail = (message) => failures.push(`${manifest.shot_id}/asset-sheet: ${message}`);
  if (schema?.$id !== 'https://local.23jung/video/contracts/asset-sheet.schema.json') fail('schema identity is invalid');
  if (sheet?.schema_version !== 1 || sheet?.contract_kind !== 'spatial-implementation-contract') fail('schema_version/contract_kind must identify v1 spatial contract');
  if (sheet?.shot_id !== manifest.shot_id) fail('shot_id does not match manifest');
  if (sheet?.layout_binding !== 'manifest-component-layout') fail('layout_binding must defer geometry to manifest-component-layout');
  if (sheet?.canvas?.width !== 1920 || sheet?.canvas?.height !== 1080) fail('canvas must be 1920x1080');

  const safeAreas = sheet?.safe_areas;
  for (const name of ['essential', 'overlay']) {
    const area = safeAreas?.[name];
    if (!area || ['left', 'top', 'right', 'bottom'].some((key) => !Number.isFinite(area[key]) || area[key] < 0)) fail(`${name} safe area requires non-negative numeric insets`);
  }
  if (sheet?.background?.asset_binding !== 'manifest.background' || sheet?.background?.layer_role !== 'background' || sheet?.background?.depth !== 0 || sheet?.background?.safe_area_policy !== 'edge-to-edge') fail('background must be manifest-bound edge-to-edge depth 0');

  const validateTreatmentPolicy = (policy, label, allowedModes) => {
    if (!policy || !allowedModes.includes(policy.mode)) { fail(`${label}: invalid treatment mode`); return; }
    if (!Array.isArray(policy.operator_ids) || policy.operator_ids.some((id) => id !== 'grain.overlay@1') || !unique(policy.operator_ids)) fail(`${label}: treatment operator_ids must be a unique grain.overlay@1 array`);
    if (policy.mode === 'eligible' && !policy.operator_ids.includes('grain.overlay@1')) fail(`${label}: eligible treatment must declare grain.overlay@1`);
    if (policy.mode === 'protected-alpha-core' && policy.protection_mask !== 'component-alpha-core') fail(`${label}: protected component must use component-alpha-core`);
    if (policy.mode === 'protected-system-render-order' && policy.protection_mask !== 'system-render-order') fail(`${label}: protected system layer must use system-render-order`);
  };
  validateTreatmentPolicy(sheet?.background?.treatment, 'background', ['eligible', 'untreated']);

  const components = new Map((manifest.visual_components ?? []).filter((component) => component.render_kind !== 'camera').map((component) => [component.component_id, component]));
  const assets = new Map((manifest.assets ?? []).map((asset) => [asset.asset_id, asset]));
  const layers = Array.isArray(sheet?.layers) ? sheet.layers : [];
  const layerMap = new Map();
  const depths = [];
  for (const layer of layers) {
    if (!layer?.component_id || layerMap.has(layer.component_id)) { fail(`duplicate/missing component layer ${String(layer?.component_id)}`); continue; }
    layerMap.set(layer.component_id, layer);
    const component = components.get(layer.component_id);
    if (!component) fail(`unknown component_id ${layer.component_id}`);
    if (layer.asset_id !== (component?.asset_id ?? null)) fail(`${layer.component_id}: asset_id does not match manifest binding`);
    if (layer.asset_id !== null && !assets.has(layer.asset_id)) fail(`${layer.component_id}: unknown asset_id ${layer.asset_id}`);
    if (!['structure', 'midground', 'subject', 'foreground', 'overlay'].includes(layer.layer_role)) fail(`${layer.component_id}: invalid layer_role`);
    if (!Number.isInteger(layer.depth) || layer.depth <= 0 || layer.depth >= 900) fail(`${layer.component_id}: depth must be a unique integer from 1 to 899`);
    depths.push(layer.depth);
    if (typeof layer.anchor !== 'string' || !layer.anchor) fail(`${layer.component_id}: semantic anchor is required`);
    if (!['essential', 'overlay', 'edge-to-edge'].includes(layer.safe_area_policy)) fail(`${layer.component_id}: invalid safe_area_policy`);
    if (!Array.isArray(layer.occludes) || !Array.isArray(layer.occluded_by) || !unique(layer.occludes ?? []) || !unique(layer.occluded_by ?? [])) fail(`${layer.component_id}: directed occlusion arrays must be unique arrays`);
    validateTreatmentPolicy(layer.treatment, layer.component_id, ['eligible', 'untreated', 'protected-alpha-core']);
    if (layer.occludes?.includes(layer.component_id) || layer.occluded_by?.includes(layer.component_id)) fail(`${layer.component_id}: self occlusion is forbidden`);
    const rect = component?.layout;
    if (layer.safe_area_policy === 'essential' && rect && safeAreas?.essential) {
      const area = safeAreas.essential;
      if (rect.left < area.left || rect.top < area.top || rect.left + rect.width > 1920 - area.right || rect.top + rect.height > 1080 - area.bottom) fail(`${layer.component_id}: manifest layout escapes essential safe area`);
    }
  }
  for (const componentId of components.keys()) if (!layerMap.has(componentId)) fail(`missing component layer ${componentId}`);
  for (const layerId of layerMap.keys()) if (!components.has(layerId)) fail(`layer is not consumed by manifest component ${layerId}`);
  if (!unique(depths)) fail('component depths must be unique; deterministic order cannot rely on array position');

  const assetConsumers = new Map();
  for (const component of components.values()) if (component.asset_id) assetConsumers.set(component.asset_id, (assetConsumers.get(component.asset_id) ?? 0) + 1);
  for (const assetId of assets.keys()) if (!assetConsumers.has(assetId)) fail(`manifest asset has no visual component binding: ${assetId}`);

  for (const cue of manifest.text_cues ?? []) {
    const targetBound = Boolean(cue.target_component_id || cue.target_asset_id);
    if (!cue.target_component_id) {
      if (manifest.typography_surface_contract_version === 1) {
        if (targetBound) {
          if (cue.transform_binding === 'inherit-target-surface') fail(`${cue.cue_id}: surface-rotated cue requires an explicit named PNG target`);
          else fail(`${cue.cue_id}: target-bound cue requires target_component_id for deterministic binding`);
        } else {
          if (cue.transform_binding !== 'screen-space-level') fail(`${cue.cue_id}: screen-space cue must remain screen-space-level`);
          if (cue.surface_anchor !== 'screen-space') fail(`${cue.cue_id}: screen-space cue surface anchor must be screen-space`);
          if (cue.surface_rotation_deg !== 0) fail(`${cue.cue_id}: screen-space cue must remain at 0 degrees`);
        }
      }
      continue;
    }
    const target = components.get(cue.target_component_id);
    const rect = target?.layout;
    if (!target || !rect) { fail(`${cue.cue_id}: target label lacks a manifest component layout`); continue; }
    if (manifest.typography_surface_contract_version === 1) {
      const targetAsset = target.asset_id ? assets.get(target.asset_id) : undefined;
      if (cue.transform_binding === 'inherit-target-surface') {
        if (target.render_kind !== 'asset' || targetAsset?.media_type !== 'image/png') fail(`${cue.cue_id}: surface-rotated cue requires an explicit named PNG target`);
        if (cue.placement !== 'on-surface') fail(`${cue.cue_id}: surface-rotated cue must use on-surface placement`);
        if (cue.surface_anchor !== 'on-surface') fail(`${cue.cue_id}: surface-rotated cue surface anchor must be on-surface`);
        if (!Number.isFinite(cue.surface_rotation_deg) || Math.abs(cue.surface_rotation_deg) > 30) fail(`${cue.cue_id}: target PNG surface rotation must be finite within ±30 degrees`);
      } else if (targetBound) {
        if (cue.transform_binding !== 'target-position-level') fail(`${cue.cue_id}: detached target label must use target-position-level`);
        if (cue.placement !== 'below-center') fail(`${cue.cue_id}: detached target label must use below-center placement`);
        if (cue.surface_anchor !== 'target-below-center') fail(`${cue.cue_id}: detached target label surface anchor must be target-below-center`);
        if (cue.surface_rotation_deg !== 0) fail(`${cue.cue_id}: detached target label must remain at 0 degrees`);
      }
    } else if (cue.placement !== 'below-center') {
      fail(`${cue.cue_id}: target label must remain below-center`);
    }
    const area = safeAreas?.essential;
    if (area) {
      const width = cue.max_width_px ?? rect.width;
      const fontSize = cue.font_size_px ?? (cue.kind === 'number' ? 48 : 54);
      const height = (cue.max_lines ?? 1) * fontSize * 1.2;
      const left = rect.left + rect.width / 2 - width / 2;
      const top = cue.placement === 'on-surface' ? rect.top + rect.height / 2 - height / 2 : rect.top + rect.height + 24;
      if (left < area.left || left + width > 1920 - area.right || top < area.top || top + height > 1080 - area.bottom) fail(`${cue.cue_id}: below-center label escapes essential safe area`);
    }
  }

  for (const layer of layers) {
    for (const lowerId of layer.occludes ?? []) {
      const lower = layerMap.get(lowerId);
      if (!lower) { fail(`${layer.component_id}: occludes unknown component ${lowerId}`); continue; }
      if (!(layer.depth > lower.depth)) fail(`${layer.component_id}: occludes ${lowerId} without greater depth`);
      if (!lower.occluded_by?.includes(layer.component_id)) fail(`${layer.component_id} -> ${lowerId}: reverse occluded_by declaration missing`);
      const upperRect = components.get(layer.component_id)?.layout;
      const lowerRect = components.get(lowerId)?.layout;
      if (upperRect && lowerRect && !overlaps(upperRect, lowerRect)) fail(`${layer.component_id} -> ${lowerId}: declared occlusion has no manifest layout overlap`);
    }
    for (const upperId of layer.occluded_by ?? []) {
      const upper = layerMap.get(upperId);
      if (!upper) { fail(`${layer.component_id}: occluded_by unknown component ${upperId}`); continue; }
      if (!upper.occludes?.includes(layer.component_id)) fail(`${layer.component_id} <- ${upperId}: reverse occludes declaration missing`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) { fail(`occlusion graph contains a cycle at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const lower of layerMap.get(id)?.occludes ?? []) if (layerMap.has(lower)) visit(lower);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of layerMap.keys()) visit(id);

  const systemLayers = Array.isArray(sheet?.system_layers) ? sheet.system_layers : [];
  const systemIds = systemLayers.map((layer) => layer.system_id);
  if (!unique(systemIds) || !systemIds.includes('target-labels') || !systemIds.includes('source-chrome')) fail('system_layers must uniquely include target-labels and source-chrome');
  const systemDepths = systemLayers.map((layer) => layer.depth);
  if (!unique(systemDepths) || systemLayers.some((layer) => !Number.isInteger(layer.depth) || layer.depth < 900 || layer.layer_role !== 'overlay' || layer.safe_area_policy !== 'overlay')) fail('system overlay depths must be unique integers >= 900');
  if (systemLayers.some((layer) => layer.depth <= Math.max(0, ...depths))) fail('system overlay depths must remain above content layers');
  for (const layer of systemLayers) validateTreatmentPolicy(layer.treatment, layer.system_id, ['protected-system-render-order']);

  const treatments = Array.isArray(manifest.treatments) ? manifest.treatments : [];
  const declaredTargets = new Set();
  for (const treatment of treatments) {
    if (treatment.operator_id !== 'grain.overlay@1' || treatment.implementation_status !== 'implemented') fail(`${treatment.treatment_id}: treatment operator/status is invalid`);
    if (!Number.isInteger(treatment.start_frame) || !Number.isInteger(treatment.end_frame) || treatment.start_frame < 0 || treatment.end_frame > manifest.duration_frames || treatment.start_frame >= treatment.end_frame) fail(`${treatment.treatment_id}: treatment frame range is invalid`);
    if (!Number.isInteger(treatment.params?.seed) || !Number.isFinite(treatment.params?.opacity) || treatment.params.opacity < 0 || treatment.params.opacity > 0.045) fail(`${treatment.treatment_id}: grain seed/opacity exceeds deterministic safety bounds`);
    const key = treatment.target?.kind === 'background' ? 'background' : treatment.target?.kind === 'component' ? treatment.target.component_id : null;
    if (!key || declaredTargets.has(key)) { fail(`${treatment.treatment_id}: duplicate or invalid treatment target`); continue; }
    declaredTargets.add(key);
    const policy = key === 'background' ? sheet.background.treatment : layerMap.get(key)?.treatment;
    if (policy?.mode !== 'eligible' || !policy.operator_ids.includes(treatment.operator_id)) fail(`${treatment.treatment_id}: manifest target is not eligible in asset sheet`);
  }
  const eligibleTargets = [sheet?.background?.treatment?.mode === 'eligible' ? 'background' : null, ...layers.filter((layer) => layer.treatment?.mode === 'eligible').map((layer) => layer.component_id)].filter(Boolean);
  for (const target of eligibleTargets) if (!declaredTargets.has(target)) fail(`${target}: eligible asset-sheet target has no manifest treatment`);
  if (sheet?.provenance?.status !== 'provisional-review-only' || !sheet?.provenance?.authoring || !sheet?.provenance?.basis) fail('provenance must identify provisional authoring and basis');
  return failures;
}

export async function loadCutAssetSheet({cutRoot, manifest}) {
  const schemaPath = path.resolve(ROOT, ASSET_SHEET_SCHEMA_PATH);
  const sheetPath = path.join(cutRoot, 'asset-sheet.json');
  const [schemaBytes, sheetBytes] = await Promise.all([readFile(schemaPath), readFile(sheetPath)]);
  const schema = JSON.parse(schemaBytes.toString('utf8'));
  const sheet = JSON.parse(sheetBytes.toString('utf8'));
  const failures = validateAssetSheet({sheet, manifest, schema});
  if (failures.length) throw new Error(failures.join('\n'));
  return {
    sheet,
    path: normalize(path.relative(ROOT, sheetPath)),
    sha256: await sha256File(sheetPath),
    schema_path: ASSET_SHEET_SCHEMA_PATH,
    schema_sha256: await sha256File(schemaPath),
  };
}
