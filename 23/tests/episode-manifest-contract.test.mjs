import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {validateApprovedContractRequirements, validateManifestAgainstEpisodeContract} from '../video/scripts/episode-manifest-contract.mjs';

const contracts = JSON.parse(await readFile('video/episodes/episode-001/generated/manifest-contracts.json', 'utf8'));
const contract = contracts.cuts[0];
const archivedContracts = JSON.parse(await readFile('video/qa/pipeline-audit/2026-09-13/before/video/episodes/episode-001/generated/manifest-contracts.json', 'utf8'));
const implementedManifest = (source = contract) => ({
  schema_version: 3,
  source_spec_sha256: source.source_spec_sha256,
  source_cut_sha256: source.source_cut_sha256,
  manifest_contract_sha256: source.manifest_contract_sha256,
  implementation_status: 'implemented',
  shot_id: source.shot_id,
  production_mode: source.production_mode,
  duration_frames: source.duration_frames,
  source_ids: source.source_ids,
  transition: structuredClone(source.transition),
  visual_components: source.visual_components.map((item) => ({...item, implementation_status: 'implemented'})),
  visual_beats: structuredClone(source.visual_beats),
  motion_actions: source.planned_motion_actions.map((item) => ({...item, implementation_status: 'implemented'})),
});

test('Manifest v3 is byte-bound to the current generated cut contract', () => {
  const manifest = implementedManifest();
  assert.deepEqual(validateManifestAgainstEpisodeContract(manifest, contract), []);
  assert.deepEqual(contract.planned_motion_actions, []);
  assert.equal(contract.visual_beats[0].action_intent.status, 'deferred-until-source-selection');
  for (const [name, mutate, expected] of [
    ['spec hash', (value) => { value.source_spec_sha256 = '0'.repeat(64); }, /source_spec_sha256/u],
    ['cut hash', (value) => { value.source_cut_sha256 = '0'.repeat(64); }, /source_cut_sha256/u],
    ['contract hash', (value) => { value.manifest_contract_sha256 = '0'.repeat(64); }, /manifest_contract_sha256/u],
    ['mode', (value) => { value.production_mode = 'remotion'; }, /mode\/duration/u],
    ['focal', (value) => { value.visual_beats[0].focal_component_id = 'missing-focal'; }, /focal_component_id/u],
    ['component binding', (value) => { value.visual_components[0].asset_requirement_id = 'rebound-requirement'; }, /asset_requirement_id conflicts/u],
    ['unexpected motion action', (value) => { value.motion_actions.push({action_id: 'unplanned'}); }, /motion action set conflicts/u],
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.match(validateManifestAgainstEpisodeContract(changed, contract).join('\n'), expected, name);
  }
});

test('transition fields are bound to a current generated contract', () => {
  const transitionContract = contracts.cuts.find((item) => item.transition?.type);
  assert.ok(transitionContract, 'current plan should have a declared transition');
  const manifest = implementedManifest(transitionContract);
  const changedType = transitionContract.transition.type === 'morph' ? 'scene-to-scene' : 'morph';
  manifest.transition = {...manifest.transition, type: changedType};
  assert.match(validateManifestAgainstEpisodeContract(manifest, transitionContract).join('\n'), /transition type\/intent/u);
});

test('archived SH003 integrity checks use its frozen pre-reset contract fixture', async () => {
  const historical = archivedContracts.cuts.find((item) => item.shot_id === 'SH003');
  assert.ok(historical);
  const manifest = implementedManifest(historical);
  assert.deepEqual(validateManifestAgainstEpisodeContract(manifest, historical), []);
  const changed = structuredClone(manifest);
  changed.motion_actions[0].operator_id = 'opacity.tween@1';
  assert.match(validateManifestAgainstEpisodeContract(changed, historical).join('\n'), /operator_id conflicts/u);
  const state = JSON.parse(await readFile('video/episodes/episode-001/production-state.json', 'utf8'));
  assert.equal(state.active_cut_root, null, 'the historical probe must not select an active cut root');
});

test('approved source string cannot bypass a missing or mismatched materialization ledger', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'manifest-ledger-'));
  try {
    const cutRoot = path.join(root, 'cut');
    await writeFile(path.join(root, 'ledger.json'), JSON.stringify({source_asset_materializations: []}));
    await writeFile(path.join(root, 'manifest.json'), '{}');
    const source = structuredClone(contract);
    source.source_requirements = [{
      requirement_id: 'r1', kind: 'source-original', source_id: 'S1', status: 'approved', approved_media_asset_id: 7,
      materialization_record_path: 'ledger.json', approved_source: {original_url: 'https://example.test/a', license: 'KOGL-1', sha256: 'a'.repeat(64)},
    }];
    const failures = await validateApprovedContractRequirements({root, manifestPath: path.join(root, 'manifest.json'), manifest: {source_asset_materializations: []}, contract: source});
    assert.match(failures.join('\n'), /ledger entry was not found/u);
    assert.ok(!failures.join('\n').includes(cutRoot));
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('transparent derivative cannot pass on the preserved source original alone', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'derivative-ledger-'));
  try {
    const cut = path.join(root, 'cut');
    await mkdir(path.join(cut, 'source-photo'), {recursive: true});
    const sourceFile = path.join(cut, 'source-photo', 'source.png');
    await sharp({create: {width: 4, height: 4, channels: 4, background: {r: 20, g: 30, b: 40, alpha: 1}}}).png().toFile(sourceFile);
    const bytes = await readFile(sourceFile);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const entry = {media_asset_id: 7, source_id: 'S1', route: 'transparent-layers', usage: 'explanation', review_state: 'approved', source: {file: 'source-photo/source.png', original_url: 'https://example.test/a', license: 'KOGL-1', attribution: 'Office', mime_type: 'image/png', sha256, bytes: (await stat(sourceFile)).size}, derivatives: []};
    await writeFile(path.join(root, 'ledger.json'), JSON.stringify({source_asset_materializations: [entry]}));
    const requirement = {requirement_id: 'd1', kind: 'transparent-derivative', source_id: 'S1', asset_id: 'person-layer', status: 'approved', approved_media_asset_id: 7, materialization_record_path: 'ledger.json', approved_source: {original_url: entry.source.original_url, license: entry.source.license, sha256}, approved_derivative: {asset_id: 'person-layer'}};
    const failures = await validateApprovedContractRequirements({root, manifestPath: path.join(cut, 'manifest.json'), manifest: {source_asset_materializations: [entry], assets: []}, contract: {shot_id: 'SH001', source_requirements: [requirement]}});
    assert.match(failures.join('\n'), /exact ledger derivative entry/u);
  } finally { await rm(root, {recursive: true, force: true}); }
});
