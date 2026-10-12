import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE_SEMANTICS, SEMANTIC_FIDELITY_VERSION, validateSemanticFidelity} from '../video/scripts/semantic-fidelity-contract.mjs';

const contractFor = (sampleId, overrides = {}) => ({
  version: SEMANTIC_FIDELITY_VERSION,
  required_visual_claim: SAMPLE_SEMANTICS[sampleId].required_visual_claim,
  focal_asset_ids: ['focal-a', 'focal-b'],
  focal_asset_classes: SAMPLE_SEMANTICS[sampleId].focal_asset_classes.slice(0, 2),
  focal_source_bindings: [
    {asset_id: 'focal-a', source_id: 'SRC-A', source_kind: 'official-source', source_path_or_url: 'raw/a.png'},
    {asset_id: 'focal-b', source_id: 'SRC-B', source_kind: 'official-source', source_path_or_url: 'raw/b.png'},
  ],
  observable_non_text_delta: {operator: SAMPLE_SEMANTICS[sampleId].observable_operator, target: 'focal-target', text_only: false},
  text_roles_used: ['asset-label', 'surface-content', 'screen-chrome'],
  text_is_supplemental: true,
  no_semantic_substitution: true,
  runtime_proof: {target_id: 'focal-target', operator_id: SAMPLE_SEMANTICS[sampleId].observable_operator},
  ...overrides,
});

const asset = (assetId, assetClass) => ({
  asset_id: assetId,
  asset_class: assetClass,
  source_id: assetId === 'focal-a' ? 'SRC-A' : 'SRC-B',
  source_kind: 'official-source',
  source_path: assetId === 'focal-a' ? 'raw/a.png' : 'raw/b.png',
  path: `video/public/${assetId}.png`,
});

test('sample 02 rejects law-document assets as proof of numeric progression', () => {
  const manifest = {
    status: 'pending-human-reference-calibration-review',
    semantic_fidelity: contractFor('sample-02-numeric-step-progression', {focal_asset_classes: ['document']}),
    assets: [asset('focal-a', 'document'), asset('focal-b', 'document')],
    asset_bindings: [
      {asset_id: 'focal-a', role: 'temporal-dominant-focal'},
      {asset_id: 'focal-b', role: 'temporal-dominant-focal'},
    ],
    outputs: {},
  };
  const failures = validateSemanticFidelity('sample-02-numeric-step-progression', manifest, '<Rail>source rail</Rail> focal-a.png focal-b.png');
  assert.match(failures.join('\n'), /semantically wrong asset_class=document/u);
});

test('blank or blocked samples fail even when supplemental text is declared correctly', () => {
  const manifest = {
    status: 'blocked-missing-real-input',
    reason: 'missing real input',
    semantic_fidelity: contractFor('sample-01-shared-background-accumulation', {focal_asset_ids: [], focal_source_bindings: []}),
    assets: [],
    outputs: null,
  };
  const failures = validateSemanticFidelity('sample-01-shared-background-accumulation', manifest, '<Rail>자료 입력 대기</Rail>');
  assert.match(failures.join('\n'), /blank or blocked candidate cannot be semantically reviewed/u);
  assert.match(failures.join('\n'), /focal_asset_ids requires at least 2/u);
});

test('Rail or screen chrome cannot be declared as the observable semantic proof', () => {
  const manifest = {
    status: 'pending-human-reference-calibration-review',
    semantic_fidelity: contractFor('sample-01-shared-background-accumulation', {runtime_proof: {target_id: 'focal-target', operator_id: 'screen-chrome-only', source: 'screen-chrome', text_only: true}}),
    assets: [asset('focal-a', 'building'), asset('focal-b', 'photo')],
    outputs: {},
  };
  const failures = validateSemanticFidelity('sample-01-shared-background-accumulation', manifest, '<Rail>semantic proof</Rail> focal-a.png focal-b.png');
  assert.match(failures.join('\n'), /Rail\/screen-chrome is being used as semantic proof|text-only semantic evidence/u);
});
