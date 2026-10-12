import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {validateAssetSheet} from '../video/scripts/asset-sheet-contract.mjs';
import {GRAIN_OVERLAY_LIMITS, grainOverlayDataUri} from '../video/src/vox/motion/operator-registry.ts';

const schema = JSON.parse(await readFile('video/contracts/asset-sheet.schema.json', 'utf8'));
const manifest = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json', 'utf8'));
const sheet = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json', 'utf8'));
const clone = (value) => structuredClone(value);

test('grain.overlay@1 is deterministic, seed-sensitive and bounded', () => {
  const input = {seed: 31003, tileSizePx: 72, dotSizePx: 0.8, color: '#43382f'};
  assert.equal(grainOverlayDataUri(input), grainOverlayDataUri(input));
  assert.notEqual(grainOverlayDataUri(input), grainOverlayDataUri({...input, seed: 31004}));
  assert.equal(GRAIN_OVERLAY_LIMITS.maximumOpacity, 0.045);
});

test('treatment contract rejects over-opacity and invalid protected masks', () => {
  const overOpacity = clone(manifest);
  overOpacity.treatments[0].params.opacity = 0.046;
  assert.match(validateAssetSheet({sheet, manifest: overOpacity, schema}).join('\n'), /exceeds deterministic safety bounds/u);

  const unprotected = clone(sheet);
  const kim = unprotected.layers.find((layer) => layer.component_id === 'kim-b02');
  delete kim.treatment.protection_mask;
  assert.match(validateAssetSheet({sheet: unprotected, manifest, schema}).join('\n'), /component-alpha-core/u);
});

test('manifest treatments can target only asset-sheet eligible layers', () => {
  const illegalTarget = clone(manifest);
  illegalTarget.treatments[1].target.component_id = 'kim-b02';
  assert.match(validateAssetSheet({sheet, manifest: illegalTarget, schema}).join('\n'), /not eligible/u);
});
