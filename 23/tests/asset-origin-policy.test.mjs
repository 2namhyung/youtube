import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePersonOnlyImagegenPolicy} from '../video/scripts/asset-origin-policy.mjs';

const policy = {version: 1, person_imagegen_allowed: true, non_person_source_required: true};
const personImagegen = {
  asset_id: 'person', asset_class: 'person', origin: 'imagegen-person',
};
const provenance = [
  {asset_id: 'person', origin: 'imagegen-person', ai_disclosure: true, identity_scope: 'fictional-generic'},
  {asset_id: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKI-1', source_path: 'raw/building.jpg', license: 'CC BY 4.0'},
  {asset_id: 'arrow', origin: 'deterministic-editorial', deterministic: true, explanatory_overlay: true},
];

test('allows imagegen only for a disclosed person and real-source non-person assets', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [personImagegen, {asset_id: 'building', asset_class: 'building'}, {asset_id: 'arrow', asset_class: 'path'}],
    asset_provenance: provenance,
  };
  assert.deepEqual(validatePersonOnlyImagegenPolicy(manifest), []);
});

test('rejects imagegen non-person assets even if a source id is present', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'building', asset_class: 'building', origin: 'imagegen'}],
    asset_provenance: [{asset_id: 'building', origin: 'imagegen', source_id: 'WIKI-1', source_kind: 'official-photo', license: 'CC BY 4.0'}],
  };
  assert.match(validatePersonOnlyImagegenPolicy(manifest).join('\n'), /imagegen is permitted only for asset_class=person/u);
});

test('rejects generated named people and requires fictional-generic identity scope', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'official', asset_class: 'person', origin: 'imagegen-person'}],
    asset_provenance: [{asset_id: 'official', origin: 'imagegen-person', ai_disclosure: true, identity_scope: 'named-real-person'}],
  };
  assert.match(validatePersonOnlyImagegenPolicy(manifest).join('\n'), /identity_scope=fictional-generic/u);
});

test('rejects self-authored non-person imagery and missing semantic classification', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'document', asset_class: 'document'}, {asset_id: 'unknown'}],
    asset_provenance: [{asset_id: 'document', origin: 'self-authored', derivation: 'editorial-png'}],
  };
  const errors = validatePersonOnlyImagegenPolicy(manifest).join('\n');
  assert.match(errors, /non-person asset must bind a real\/official source/u);
  assert.match(errors, /explicit nonblank asset_class/u);
});

test('requires explicit asset_class instead of semantic_type fallback', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'building', semantic_type: 'building'}],
    asset_provenance: [{asset_id: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKI-1', source_path: 'raw/building.jpg', license: 'CC BY 4.0'}],
  };
  assert.match(validatePersonOnlyImagegenPolicy(manifest).join('\n'), /explicit nonblank asset_class.*semantic_type cannot substitute/u);
});

test('detects imagegen signals in filenames, source paths, and URLs', () => {
  const manifest = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'building', asset_class: 'building', file: 'assets/imagegen-building.png'}],
    asset_provenance: [{asset_id: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKI-1', source_path: 'raw/official-building.png', original_url: 'https://example.test/photos/imagegen-building', license: 'CC BY 4.0'}],
  };
  assert.match(validatePersonOnlyImagegenPolicy(manifest).join('\n'), /imagegen is permitted only for asset_class=person/u);
});

test('does not inspect separate Omni keyframes or historical manifests without opt-in', () => {
  assert.deepEqual(validatePersonOnlyImagegenPolicy({production_mode: 'omni', assets: [], omni: {keyframes: [{file: 'omni/start.png'}]}}), []);
  assert.deepEqual(validatePersonOnlyImagegenPolicy({assets: [{asset_id: 'legacy', origin: 'imagegen'}]}), []);
});

test('requires deterministic overlays to be explanatory and non-focal', () => {
  const base = {
    asset_origin_policy: policy,
    assets: [{asset_id: 'diagram', asset_class: 'path'}],
    asset_provenance: [{asset_id: 'diagram', origin: 'deterministic-editorial', deterministic: true}],
  };
  assert.match(validatePersonOnlyImagegenPolicy(base).join('\n'), /explanatory_overlay=true/u);
  const focal = structuredClone(base);
  focal.asset_provenance[0].explanatory_overlay = true;
  focal.assets[0].is_focal = true;
  assert.match(validatePersonOnlyImagegenPolicy(focal).join('\n'), /cannot be focal scene subjects/u);
});

test('requires the policy before activation or production review', () => {
  const errors = validatePersonOnlyImagegenPolicy({assets: []}, {label: 'active/SH001', requirePolicy: true});
  assert.match(errors.join('\n'), /asset_origin_policy version 1 is mandatory before activation\/production review/u);
});
