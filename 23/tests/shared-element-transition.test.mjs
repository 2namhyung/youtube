import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {sharedElementTrajectory, validateSharedElementTransition} from '../video/scripts/shared-element-contract.mjs';

const historicalCatalog = JSON.parse(await readFile('video/qa/pipeline-audit/2026-09-13/before/video/episodes/episode-001/generated/render-catalog.json.txt', 'utf8'));
const currentCatalog = JSON.parse(await readFile('video/episodes/episode-001/generated/render-catalog.json', 'utf8'));
const boundary = historicalCatalog.boundaries.find((candidate) => candidate.boundary_id === 'SH003__SH004');
const outgoingManifest = historicalCatalog.cuts.find((candidate) => candidate.shot_id === boundary.outgoing_shot_id).manifest;
const incomingManifest = historicalCatalog.cuts.find((candidate) => candidate.shot_id === boundary.incoming_shot_id).manifest;
const validate = (transition) => validateSharedElementTransition({boundaryId: boundary.boundary_id, transition, outgoingManifest, incomingManifest});

test('historical SH003 to SH004 fixture validates a bound shared-element operator and trajectory', () => {
  assert.deepEqual(validate(boundary.transition), []);
  const first = sharedElementTrajectory(boundary.transition, boundary.duration_frames);
  const second = sharedElementTrajectory(boundary.transition, boundary.duration_frames);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0].rect, boundary.transition.shared_element.outgoing.rect);
  assert.deepEqual(first.at(-1).rect, boundary.transition.shared_element.incoming.rect);
  assert.notDeepEqual(first[0].rect, first.at(-1).rect);
  assert.equal(first[0].asset_blend.outgoing_opacity, 1);
  assert.equal(first.at(-1).asset_blend.incoming_opacity, 1);
});

test('historical shared-element boundaries have deterministic non-zero trajectories', () => {
  for (const historical of historicalCatalog.boundaries.filter((candidate) => candidate.transition.operator_id === 'scene.shared-element@1')) {
    const outgoing = historicalCatalog.cuts.find((candidate) => candidate.shot_id === historical.outgoing_shot_id).manifest;
    const incoming = historicalCatalog.cuts.find((candidate) => candidate.shot_id === historical.incoming_shot_id).manifest;
    assert.deepEqual(validateSharedElementTransition({boundaryId: historical.boundary_id, transition: historical.transition, outgoingManifest: outgoing, incomingManifest: incoming}), []);
    const samples = sharedElementTrajectory(historical.transition, historical.duration_frames);
    assert.notDeepEqual(samples[0].rect, samples.at(-1).rect, historical.boundary_id);
    assert.deepEqual(samples, sharedElementTrajectory(historical.transition, historical.duration_frames), historical.boundary_id);
  }
});

test('historical scene-to-scene crossfade validates without pretending to be a morph', () => {
  const historical = historicalCatalog.boundaries.find((candidate) => candidate.boundary_id === 'SH005__SH006');
  const outgoing = historicalCatalog.cuts.find((candidate) => candidate.shot_id === historical.outgoing_shot_id).manifest;
  const incoming = historicalCatalog.cuts.find((candidate) => candidate.shot_id === historical.incoming_shot_id).manifest;
  assert.equal(historical.transition.operator_id, 'scene.crossfade@1');
  assert.deepEqual(validateSharedElementTransition({boundaryId: historical.boundary_id, transition: historical.transition, outgoingManifest: outgoing, incomingManifest: incoming}), []);
  assert.equal(historical.transition.shared_element, null);
});

test('the current blocked catalog grants no boundary authority', () => {
  assert.equal(currentCatalog.status, 'blocked-source-search-no-render-authority');
  assert.equal(currentCatalog.production_authority, false);
  assert.equal(currentCatalog.authority_root, null);
  assert.deepEqual(currentCatalog.boundaries, []);
  assert.deepEqual(currentCatalog.compositions, []);
});

test('shared-element contract rejects invalid IDs, missing mapping, zero delta, and broad fallback', () => {
  const invalidId = structuredClone(boundary.transition);
  invalidId.shared_element.outgoing.component_id = 'missing-component';
  assert.match(validate(invalidId).join('\n'), /component ID/u);

  const noMapping = structuredClone(boundary.transition);
  delete noMapping.shared_element;
  assert.match(validate(noMapping).join('\n'), /mapping is required/u);

  const zeroDelta = structuredClone(boundary.transition);
  zeroDelta.shared_element.incoming = structuredClone(zeroDelta.shared_element.outgoing);
  zeroDelta.shared_element.incoming.component_id = 'sh004-case-folder';
  assert.match(validate(zeroDelta).join('\n'), /zero observable delta/u);

  const invalidFallback = structuredClone(boundary.transition);
  invalidFallback.fallback.allowed_on = 'always';
  assert.match(validate(invalidFallback).join('\n'), /fallback/u);
});
