import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {validateAssetSheet} from '../video/scripts/asset-sheet-contract.mjs';
import {buildAuthorityCatalog} from '../video/scripts/render-authority-lib.mjs';

const schema = JSON.parse(await readFile('video/contracts/asset-sheet.schema.json', 'utf8'));
const manifest = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json', 'utf8'));
const sheet = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json', 'utf8'));
const validate = (candidate) => validateAssetSheet({sheet: candidate, manifest, schema});

test('historical asset sheet remains validated without entering the current blocked catalog', async () => {
  assert.deepEqual(validate(sheet), []);
  assert.equal(sheet.layout_binding, 'manifest-component-layout');
  assert.equal(sheet.layers.length, manifest.visual_components.filter((component) => component.render_kind !== 'camera').length);
  const catalog = await buildAuthorityCatalog();
  const state = JSON.parse(await readFile('video/episodes/episode-001/production-state.json', 'utf8'));
  assert.equal(catalog.schema_version, 2);
  assert.deepEqual(catalog.cuts, []);
  assert.equal(state.render_authority.cut_root, null);
  assert.equal(catalog.production_authority, false);
});

test('asset-sheet validator rejects missing coverage, unknown assets, duplicate depth, cycles and non-overlap', () => {
  const missing = structuredClone(sheet);
  missing.layers.pop();
  assert.match(validate(missing).join('\n'), /missing component layer/u);

  const unknownAsset = structuredClone(sheet);
  unknownAsset.layers[0].asset_id = 'unknown';
  assert.match(validate(unknownAsset).join('\n'), /asset_id does not match|unknown asset_id/u);

  const duplicateDepth = structuredClone(sheet);
  duplicateDepth.layers[1].depth = duplicateDepth.layers[0].depth;
  assert.match(validate(duplicateDepth).join('\n'), /depths must be unique/u);

  const cycle = structuredClone(sheet);
  cycle.layers[0].occludes.push('podium-b01');
  assert.match(validate(cycle).join('\n'), /without greater depth|cycle/u);

  const nonOverlap = structuredClone(sheet);
  nonOverlap.layers.find((layer) => layer.component_id === 'kim-b02').occludes.push('podium-b01');
  nonOverlap.layers.find((layer) => layer.component_id === 'podium-b01').occluded_by.push('kim-b02');
  assert.match(validate(nonOverlap).join('\n'), /no manifest layout overlap/u);
});

test('asset-sheet validator rejects safe-area escape and byte drift changes the cut hash', async () => {
  const unsafeManifest = structuredClone(manifest);
  unsafeManifest.visual_components[0].layout.left = -1;
  assert.match(validateAssetSheet({sheet, manifest: unsafeManifest, schema}).join('\n'), /escapes essential safe area/u);

  const unsafeCueManifest = structuredClone(manifest);
  unsafeCueManifest.text_cues[0].max_width_px = 1900;
  assert.match(validateAssetSheet({sheet, manifest: unsafeCueManifest, schema}).join('\n'), /label escapes essential safe area/u);

  const original = await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json');
  const drifted = Buffer.concat([original, Buffer.from(' ')]);
  assert.notEqual(createHash('sha256').update(drifted).digest('hex'), createHash('sha256').update(original).digest('hex'));
});

test('runtime consumes depth without using beat focal state as z-order authority', async () => {
  const [presentation, timeline, pair, studio] = await Promise.all([
    readFile('video/src/vox/scene/PresentationScene.tsx', 'utf8'),
    readFile('video/src/vox/scene/EpisodeTimeline.tsx', 'utf8'),
    readFile('video/src/vox/scene/TransitionPair.tsx', 'utf8'),
    readFile('video/src/production-index.tsx', 'utf8'),
  ]);
  assert.match(presentation, /componentDepth\(assetSheet/u);
  assert.doesNotMatch(presentation, /zIndex:\s*focal\s*\?/u);
  assert.match(timeline, /assetSheet=\{cut\.assetSheet\}/u);
  assert.match(pair, /componentDepth\(outgoingAssetSheet/u);
  assert.doesNotMatch(studio, /id=.*depth-occlusion/iu);
});

test('asset-sheet contract validates explicit target-surface typography binding', () => {
  const bound = structuredClone(manifest);
  bound.typography_surface_contract_version = 1;
  bound.text_cues = bound.text_cues.map((cue, index) => ({...cue, transform_binding: index === 0 ? 'inherit-target-surface' : 'target-position-level', surface_anchor: index === 0 ? 'on-surface' : 'target-below-center', placement: index === 0 ? 'on-surface' : 'below-center', surface_rotation_deg: index === 0 ? 0 : 0}));
  assert.deepEqual(validateAssetSheet({sheet, manifest: bound, schema}), []);

  bound.text_cues[0].surface_rotation_deg = 45;
  assert.match(validateAssetSheet({sheet, manifest: bound, schema}).join('\n'), /target PNG surface rotation must be finite within/u);
});
