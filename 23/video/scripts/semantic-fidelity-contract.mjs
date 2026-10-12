/**
 * Semantic contract for the ten v02 reference-calibration samples.
 *
 * Text remains an allowed presentation layer, but it is never evidence that
 * a missing or semantically different focal asset/action exists. This module
 * is intentionally pure so focused tests can exercise the gate without
 * rendering or mutating the candidate set.
 */

export const SEMANTIC_FIDELITY_VERSION = 1;

export const SAMPLE_SEMANTICS = Object.freeze({
  'sample-01-shared-background-accumulation': {
    required_visual_claim: '공통 배경 위에 서로 다른 실물 자산이 순차적으로 추가되어 하나의 사건 구성을 이룬다.',
    focal_asset_classes: ['building', 'photo', 'person', 'document', 'object', 'context'],
    required_focal_asset_count: 2,
    observable_operator: 'staggered-concrete-asset-entry',
  },
  'sample-02-numeric-step-progression': {
    required_visual_claim: '출처에 결속된 실제 수치 표면이 단계별 상태 변화로 바뀌며 숫자 비교 자체가 화면의 focal이다.',
    focal_asset_classes: ['data', 'number-surface', 'measurement', 'chart-surface'],
    required_focal_asset_count: 2,
    required_temporal_states: 2,
    observable_operator: 'source-bound-numeric-state-change',
  },
  'sample-03-chart-reveal': {
    required_visual_claim: '실제 데이터의 축·값·기하가 데이터 순서대로 드러나 최종 차트로 읽힌다.',
    focal_asset_classes: ['chart', 'chart-surface', 'data'],
    required_focal_asset_count: 1,
    observable_operator: 'chart-geometry-reveal',
  },
  'sample-04-map-route-reframe': {
    required_visual_claim: '출처가 있는 지도에서 지역으로 확대된 뒤 실제 경로와 지점이 누적된다.',
    focal_asset_classes: ['map', 'geography', 'route', 'marker'],
    required_focal_asset_count: 1,
    observable_operator: 'map-reframe-route-marker-entry',
  },
  'sample-05-object-preserving-layout-reframe': {
    required_visual_claim: '장면의 공간을 유지한 채 이름 있는 인물·문서·사진 자산이 추가되고 기존 focal이 재배치된다.',
    focal_asset_classes: ['person', 'document', 'photo', 'building', 'object', 'interior'],
    required_focal_asset_count: 2,
    observable_operator: 'object-preserving-layout-reframe',
  },
  'sample-06-directional-exit-hard-cut-pair': {
    required_visual_claim: '완결된 실물 장면 전체가 왼쪽으로 퇴장한 뒤 다음 완결 장면으로 하드컷된다.',
    focal_asset_classes: ['photo', 'building', 'person', 'document', 'object', 'context'],
    required_focal_asset_count: 2,
    observable_operator: 'scene-group-exit-left-hard-cut',
  },
  'sample-07-hook-reel-collage-montage': {
    required_visual_claim: '도입부에서 서로 다른 실물 뉴스·인물·사건 패널이 하나씩 교대하며 하나의 질문으로 수렴한다.',
    focal_asset_classes: ['photo', 'person', 'building', 'document', 'object', 'context'],
    required_focal_asset_count: 2,
    observable_operator: 'sequential-concrete-panel-replacement',
  },
  'sample-08-speaker-supporting-overlay-entry': {
    required_visual_claim: '실물 인물은 고정된 focal로 남고 출처가 있는 근거 자산이 별도로 등장한다.',
    focal_asset_classes: ['person', 'photo'],
    required_focal_asset_count: 1,
    observable_operator: 'fixed-speaker-supporting-evidence-entry',
  },
  'sample-09-device-light-focal-motion': {
    required_visual_claim: '실제 기기 또는 공식 서비스 화면의 상태가 중심에서 관찰 가능한 화면 변화로 전환된다.',
    focal_asset_classes: ['device', 'screen', 'service-screen'],
    required_focal_asset_count: 1,
    observable_operator: 'device-screen-state-change',
  },
  'sample-10-narrative-scale-translation': {
    required_visual_claim: '실물·사진·출처 수치가 같은 기준을 연결해 추상적인 규모를 구체적인 비교로 번역한다.',
    focal_asset_classes: ['object', 'photo', 'data', 'number-surface', 'measurement', 'context'],
    required_focal_asset_count: 1,
    observable_operator: 'concrete-scale-comparison-reveal',
  },
});

const nonTextWords = /rail|screen[-_ ]?chrome|caption|explanatory|text[-_ ]?only|label[-_ ]?only|placeholder|blank|waiting|대기|설명문|출처 레일/iu;
const nonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const evidenceValues = (value) => Object.entries(value && typeof value === 'object' ? value : {}).filter(([key]) => key !== 'text_only').map(([, item]) => String(item)).join(' ');

export function validateSemanticFidelity(sampleId, manifest, runtimeSource = '') {
  const failures = [];
  const expected = SAMPLE_SEMANTICS[sampleId];
  if (!expected) return [`${sampleId}: unknown canonical semantic sample`];
  const contract = manifest?.semantic_fidelity;
  const fail = (message) => failures.push(`${sampleId}: ${message}`);

  if (!contract || typeof contract !== 'object') {
    fail('semantic_fidelity contract is required');
    return failures;
  }
  if (contract.version !== SEMANTIC_FIDELITY_VERSION) fail(`semantic_fidelity.version must be ${SEMANTIC_FIDELITY_VERSION}`);
  if (contract.required_visual_claim !== expected.required_visual_claim) fail('required_visual_claim does not match canonical sample semantics');
  if (contract.text_is_supplemental !== true) fail('text_is_supplemental must be true');
  if (contract.no_semantic_substitution !== true) fail('no_semantic_substitution must be true');
  if (!Array.isArray(contract.text_roles_used) || contract.text_roles_used.some((role) => !['asset-label', 'surface-content', 'screen-chrome'].includes(role))) fail('text_roles_used must use only the three allowed text roles');
  if (!Array.isArray(contract.focal_asset_ids) || contract.focal_asset_ids.length < expected.required_focal_asset_count) fail(`focal_asset_ids requires at least ${expected.required_focal_asset_count} non-background focal asset(s)`);
  if (!Array.isArray(contract.focal_asset_classes) || contract.focal_asset_classes.length === 0) fail('focal_asset_classes is required');
  else if (contract.focal_asset_classes.some((assetClass) => !expected.focal_asset_classes.includes(assetClass))) fail('focal_asset_classes contains a semantically mismatched class');
  if (!nonBlank(contract.observable_non_text_delta?.operator) || contract.observable_non_text_delta.operator !== expected.observable_operator) fail('observable_non_text_delta.operator does not match the required observable action');
  if (!nonBlank(contract.observable_non_text_delta?.target)) fail('observable_non_text_delta.target is required');
  if (contract.observable_non_text_delta?.text_only === true || nonTextWords.test(evidenceValues(contract.observable_non_text_delta))) fail('Rail/chrome/explanatory text cannot be semantic proof');
  if (!Array.isArray(contract.focal_source_bindings) || contract.focal_source_bindings.length !== (contract.focal_asset_ids?.length ?? 0)) fail('every focal asset must have an explicit source binding');

  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const byId = new Map(assets.map((asset) => [asset.asset_id, asset]));
  const focalIds = Array.isArray(contract.focal_asset_ids) ? contract.focal_asset_ids : [];
  if (focalIds.length === 0) fail('blank or blocked candidate cannot be semantically reviewed');
  if (new Set(focalIds).size !== focalIds.length) fail('focal_asset_ids must be unique');
  for (const id of focalIds) {
    const asset = byId.get(id);
    if (!asset) { fail(`focal asset ${id} is missing`); continue; }
    if (asset.asset_class === 'background' || !expected.focal_asset_classes.includes(asset.asset_class)) fail(`focal asset ${id} has semantically wrong asset_class=${asset.asset_class ?? 'blank'}`);
    if (asset.blank === true || nonTextWords.test(`${asset.asset_id} ${asset.file ?? ''} ${asset.path ?? ''}`)) fail(`focal asset ${id} is blank/placeholder or not a real focal input`);
    if (!nonBlank(asset.source_id) || (!nonBlank(asset.source_path) && !nonBlank(asset.source_url))) fail(`focal asset ${id} lacks a source binding`);
  }
  const bindings = Array.isArray(contract.focal_source_bindings) ? contract.focal_source_bindings : [];
  for (const binding of bindings) {
    const asset = byId.get(binding?.asset_id);
    if (!asset || binding.source_id !== asset.source_id || binding.source_kind !== asset.source_kind || binding.source_path_or_url !== (asset.source_path || asset.source_url)) fail(`focal source binding mismatch for ${binding?.asset_id ?? 'blank'}`);
  }
  if (expected.required_temporal_states && (!Array.isArray(manifest?.asset_bindings) || manifest.asset_bindings.filter((binding) => binding.role === 'temporal-dominant-focal').length < expected.required_temporal_states)) fail(`numeric progression requires ${expected.required_temporal_states} source-bound temporal focal states`);
  if (runtimeSource) {
    const runtimeMentionsRail = /<Rail\b|function\s+Rail\b|screen[-_ ]?chrome/iu.test(runtimeSource);
    const runtimeFocalFound = focalIds.some((id) => {
      const asset = byId.get(id);
      const fileName = nonBlank(asset?.path) ? asset.path.split(/[\\/]/u).pop() : '';
      return nonBlank(id) && (runtimeSource.includes(id) || (fileName && runtimeSource.includes(fileName)));
    });
    if (!runtimeFocalFound) fail('runtime does not bind a declared focal asset; Rail/chrome cannot stand in for it');
    if (runtimeMentionsRail && (contract.runtime_proof?.source === 'rail' || contract.runtime_proof?.source === 'screen-chrome' || contract.runtime_proof?.text_only === true)) fail('v2 Rail/screen-chrome is being used as semantic proof');
    if (!nonBlank(contract.runtime_proof?.target_id) || !nonBlank(contract.runtime_proof?.operator_id)) fail('runtime_proof must identify a real focal target and observable operator');
    if (nonTextWords.test(evidenceValues(contract.runtime_proof))) fail('runtime_proof contains text-only semantic evidence');
  }
  if (manifest?.status?.startsWith('blocked') || manifest?.reason || manifest?.outputs == null) fail('blocked/missing-input candidate cannot pass semantic fidelity');
  return failures;
}
