/*
 * Candidate/active-manifest policy for imagegen use.
 *
 * This deliberately inspects only independent compositing assets. Omni
 * keyframes are a separate production route and are validated by the Omni
 * gate; they are not reclassified as independent assets here.
 */

const IMAGEGEN_SIGNAL = /imagegen|ai[-_ ]?(?:generated|gen)|generative[-_ ]?ai|generated[-_ ]?(?:image|visual|asset)|omni/iu;
const REAL_SOURCE_ORIGINS = new Set(['real-source', 'official-source', 'source-derived', 'source-backed']);
const DETERMINISTIC_CLASSES = new Set(['deterministic-overlay', 'chart', 'path', 'effect', 'mask', 'text-surface']);
const NON_PERSON_CLASSES = new Set(['building', 'interior', 'object', 'document', 'photo', 'background', 'context', 'prop', 'architecture', ...DETERMINISTIC_CLASSES]);
const SOURCE_KINDS = new Set(['real-photo', 'official-photo', 'official-document', 'official-video', 'source-photo', 'source-video', 'source-original']);

const nonBlank = (value) => typeof value === 'string' && value.trim() !== '';

function textOf(...values) {
  return values.filter((value) => value !== undefined && value !== null).map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
}

function hasImagegenSignal(asset, provenance) {
  return IMAGEGEN_SIGNAL.test(textOf(
    asset?.file,
    asset?.origin,
    asset?.source_route,
    asset?.source_reference,
    asset?.source_path,
    asset?.original_url,
    asset?.derivation,
    provenance?.origin,
    provenance?.type,
    provenance?.derivation,
    provenance?.source_route,
    provenance?.source_reference,
    provenance?.source_path,
    provenance?.source_file,
    provenance?.original_url,
  ));
}

function hasRealSource(asset, provenance) {
  const origin = provenance?.origin ?? asset?.origin;
  const sourceKind = provenance?.source_kind ?? asset?.source_kind;
  const sourceId = provenance?.source_id ?? asset?.source_id;
  const sourcePath = provenance?.source_path ?? provenance?.source_file ?? asset?.source_path;
  const originalUrl = provenance?.original_url ?? asset?.original_url;
  const license = provenance?.license ?? asset?.license;
  return REAL_SOURCE_ORIGINS.has(origin)
    && SOURCE_KINDS.has(sourceKind)
    && nonBlank(sourceId)
    && (nonBlank(sourcePath) || nonBlank(originalUrl))
    && nonBlank(license);
}

/**
 * Validate asset_origin_policy on a Manifest v3 candidate. Historical
 * manifests without the policy remain valid by default and are not silently
 * reclassified. Active candidates pass requirePolicy=true so the policy
 * cannot be bypassed by omission.
 */
export function validatePersonOnlyImagegenPolicy(manifest, {label = manifest?.shot_id ?? 'cut', requirePolicy = false} = {}) {
  const failures = [];
  const policy = manifest?.asset_origin_policy;
  if (policy === undefined) {
    if (requirePolicy) failures.push(`${label}: asset_origin_policy version 1 is mandatory before activation/production review`);
    return failures;
  }
  if (!policy || typeof policy !== 'object' || policy.version !== 1) {
    failures.push(`${label}: asset_origin_policy.version=1 is required when the policy is declared`);
    return failures;
  }
  if (policy.person_imagegen_allowed !== true || policy.non_person_source_required !== true) {
    failures.push(`${label}: asset_origin_policy must enable person_imagegen_allowed and non_person_source_required`);
  }
  if (!Array.isArray(manifest?.assets)) {
    failures.push(`${label}: asset_origin_policy requires an assets array`);
    return failures;
  }
  if (!Array.isArray(manifest?.asset_provenance)) {
    failures.push(`${label}: asset_origin_policy requires an asset_provenance array`);
    return failures;
  }

  const assets = new Set();
  for (const [index, asset] of manifest.assets.entries()) {
    const assetLabel = `${label}: assets[${index}]`;
    const assetId = asset?.asset_id;
    if (!nonBlank(assetId)) {
      failures.push(`${assetLabel}: asset_id is required by asset_origin_policy`);
      continue;
    }
    if (assets.has(assetId)) continue;
    assets.add(assetId);
    const assetClass = asset?.asset_class;
    if (!nonBlank(assetClass)) {
      failures.push(`${assetLabel} (${assetId}): an explicit nonblank asset_class is required; semantic_type cannot substitute for it`);
      continue;
    }
    if (!['person', ...NON_PERSON_CLASSES].includes(assetClass)) {
      failures.push(`${assetLabel} (${assetId}): asset_class must classify the asset as person, a sourced non-person class, or a deterministic overlay`);
      continue;
    }
    const provenance = manifest.asset_provenance.find((entry) => entry?.asset_id === assetId);
    if (!provenance) {
      failures.push(`${assetLabel} (${assetId}): matching asset_provenance entry is required`);
      continue;
    }
    const imagegen = hasImagegenSignal(asset, provenance);
    if (assetClass === 'person') {
      if (imagegen) {
        if (provenance.origin !== 'imagegen-person' || provenance.ai_disclosure !== true || provenance.identity_scope !== 'fictional-generic') {
          failures.push(`${assetLabel} (${assetId}): person imagegen must declare origin=imagegen-person, ai_disclosure=true and identity_scope=fictional-generic`);
        }
      } else if (!hasRealSource(asset, provenance)) {
        failures.push(`${assetLabel} (${assetId}): a non-imagegen person must bind a real/official source with source_kind, source_id, URL/file and license`);
      }
      continue;
    }
    if (imagegen) {
      failures.push(`${assetLabel} (${assetId}): imagegen is permitted only for asset_class=person; use real/official source material for non-person assets`);
      continue;
    }
    if (DETERMINISTIC_CLASSES.has(assetClass)) {
      if (provenance.origin !== 'deterministic-editorial' || provenance.deterministic !== true || provenance.explanatory_overlay !== true) {
        failures.push(`${assetLabel} (${assetId}): deterministic overlays must declare origin=deterministic-editorial, deterministic=true and explanatory_overlay=true`);
      }
      const linkedComponents = (manifest.visual_components ?? []).filter((component) => component?.asset_id === assetId);
      if (asset?.is_focal === true || asset?.scene_subject === true || asset?.presentation_role === 'focal' || asset?.substitute_for
        || linkedComponents.some((component) => component?.is_focal === true || component?.semantic_role === 'primary' || component?.focal === true)) {
        failures.push(`${assetLabel} (${assetId}): deterministic overlays cannot be focal scene subjects or substitutes for paper/building/object assets`);
      }
    } else if (!hasRealSource(asset, provenance)) {
      failures.push(`${assetLabel} (${assetId}): non-person asset must bind a real/official source with source_kind, source_id, URL/file and license`);
    }
  }
  return failures;
}

export const personOnlyImagegenPolicy = Object.freeze({
  version: 1,
  person_imagegen_allowed: true,
  non_person_source_required: true,
  deterministic_overlay_classes: [...DETERMINISTIC_CLASSES],
  omni_keyframes_are_separate_route: true,
});
