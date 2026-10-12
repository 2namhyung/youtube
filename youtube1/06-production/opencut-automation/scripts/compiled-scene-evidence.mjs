import { stableStringify } from './evidence-bundle.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const KEYS = new Set(['schema', 'scene', 'sourceBindings', 'captionAnchor', 'excerpt', 'claimIds', 'evidenceClass', 'qualificationIds', 'legalConstraintIds', 'mediaConstraints', 'supplementalVisualClaims']);
const BINDING_KEYS = new Set(['spanId', 'start', 'end']);
const fail = (message) => { throw new Error(`Compiled scene evidence: ${message}`); };
const unique = (values) => [...new Set(values)];

function expectedEvidenceClass(spans) {
  if (spans.some((span) => span.evidenceClass === 'contextual')) return 'contextual';
  if (spans.some((span) => span.evidenceClass === 'reported')) return 'reported';
  return 'direct';
}

function mergedMediaConstraints(spans) {
  const keys = [...new Set(spans.flatMap((span) => Object.keys(span.mediaConstraints || {})))].sort();
  return Object.fromEntries(keys.map((key) => {
    const values = spans.flatMap((span) => Array.isArray(span.mediaConstraints?.[key]) ? span.mediaConstraints[key] : []);
    return [key, unique(values)];
  }));
}

export function buildCompiledSceneEvidence(scene, authoritativeSpans, authoritativeClaims = []) {
  const spanById = new Map(authoritativeSpans.map((span) => [span.spanId, span]));
  const spans = scene.spanBindings.map((binding) => spanById.get(binding.spanId));
  const excerpt = scene.spanBindings.map((binding) => spanById.get(binding.spanId).excerpt.slice(binding.start, binding.end)).join(' ');
  const claimById = new Map(authoritativeClaims.map((claim) => [claim.claimId, claim]));
  const supplementalIds = [...(scene.supplementalVisualClaimIds || [])];
  const supplementalVisualClaims = supplementalIds.map((claimId) => {
    const claim = claimById.get(claimId);
    if (!claim) fail(`supplemental visual claim ${claimId} is unknown`);
    return {
      claimId,
      status: claim.status,
      qualificationIds: [...(claim.qualificationIds || [])],
      sourceIds: [...(claim.sourceIds || [])],
      sourceDisclosure: claim.sourceDisclosure,
    };
  });
  const result = {
    schema: 'compiled-scene-evidence-v1', scene: scene.scene, sourceBindings: structuredClone(scene.spanBindings), captionAnchor: excerpt, excerpt,
    claimIds: unique(spans.flatMap((span) => span.claimIds)), evidenceClass: expectedEvidenceClass(spans),
    qualificationIds: unique(spans.flatMap((span) => span.qualificationIds)), legalConstraintIds: unique(spans.flatMap((span) => span.legalConstraintIds)), mediaConstraints: mergedMediaConstraints(spans),
  };
  if (Object.prototype.hasOwnProperty.call(scene, 'supplementalVisualClaimIds')) result.supplementalVisualClaims = supplementalVisualClaims;
  return result;
}

export function verifyCompiledSceneEvidence(entries, evidenceBundle, { allowLegacyOneToOne = false } = {}) {
  if (!Array.isArray(entries) || !entries.length || !Array.isArray(evidenceBundle?.scriptSpans) || !evidenceBundle.scriptSpans.length) fail('non-empty entries and authoritative scriptSpans are required');
  if (allowLegacyOneToOne && entries.length === evidenceBundle.scriptSpans.length && entries.every((entry, index) => stableStringify(entry) === stableStringify(evidenceBundle.scriptSpans[index]))) return true;
  if (allowLegacyOneToOne && entries.some((entry) => entry?.schema !== 'compiled-scene-evidence-v1')) fail('scriptSpans must map one-to-one for legacy contract v2');
  const spans = evidenceBundle.scriptSpans; const spanById = new Map(spans.map((span, index) => [span.spanId, { ...span, ordinal: index + 1 }])); const coverage = new Map(spans.map((span) => [span.spanId, []])); let priorOrdinal = 0; let priorStart = -1;
  entries.forEach((entry, index) => {
    if (!isObject(entry) || Object.keys(entry).some((key) => !KEYS.has(key)) || entry.schema !== 'compiled-scene-evidence-v1' || entry.scene !== index + 1 || !Array.isArray(entry.sourceBindings) || !entry.sourceBindings.length) fail(`scene ${index + 1} schema/fields are invalid`);
    const boundSpans = [];
    for (const binding of entry.sourceBindings) {
      if (!isObject(binding) || Object.keys(binding).some((key) => !BINDING_KEYS.has(key))) fail(`scene ${index + 1} binding fields are invalid`);
      const span = spanById.get(binding.spanId); if (!span || !Number.isInteger(binding.start) || !Number.isInteger(binding.end) || binding.start < 0 || binding.end <= binding.start || binding.end > span.excerpt.length) fail(`scene ${index + 1} binding range is invalid`);
      if (span.ordinal < priorOrdinal || (span.ordinal === priorOrdinal && binding.start < priorStart)) fail('bindings are out of authoritative order'); priorOrdinal = span.ordinal; priorStart = binding.start; coverage.get(binding.spanId).push(binding); boundSpans.push(span);
    }
    if (Object.prototype.hasOwnProperty.call(entry, 'supplementalVisualClaims') && (!Array.isArray(entry.supplementalVisualClaims) || entry.supplementalVisualClaims.length > 1 || entry.supplementalVisualClaims.some((claim) => !isObject(claim)))) fail(`scene ${index + 1} supplemental visual evidence is invalid`);
    const expected = buildCompiledSceneEvidence({ scene: index + 1, spanBindings: entry.sourceBindings, ...(Object.prototype.hasOwnProperty.call(entry, 'supplementalVisualClaims') ? { supplementalVisualClaimIds: entry.supplementalVisualClaims.map((claim) => claim.claimId) } : {}) }, spans, evidenceBundle.claims || []);
    if (stableStringify(entry) !== stableStringify(expected)) fail(`scene ${index + 1} mapping/claims/legal constraints drifted`);
  });
  for (const span of spans) { const bindings = coverage.get(span.spanId).sort((a, b) => a.start - b.start); let cursor = 0; for (const binding of bindings) { if (binding.start !== cursor) fail(`${span.spanId} has a gap, overlap, or duplicate`); cursor = binding.end; } if (cursor !== span.excerpt.length) fail(`${span.spanId} is not covered exactly once`); }
  return true;
}
