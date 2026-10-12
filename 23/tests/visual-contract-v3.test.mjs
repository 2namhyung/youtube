import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {resolvePresentationState, validateVisualContractV3} from '../video/scripts/visual-contract-v3.mjs';

const readManifest = async (shot) => JSON.parse(await readFile(path.resolve(`video/public/assets/episode-001-v06/cuts/${shot}/manifest.json`), 'utf8'));
const readHistoricalWorkManifest = async (shot) => JSON.parse(await readFile(path.resolve(`video/public/assets/episode-001-work-v01/cuts/${shot}/manifest.json`), 'utf8'));

test('historical v06 fixtures satisfy the message-first presentation contract', async () => {
  for (const shot of ['SH002', 'SH005', 'SH047']) {
    const manifest = await readManifest(shot);
    assert.equal(manifest.schema_version, 3);
    assert.deepEqual(validateVisualContractV3(manifest), [], `${shot} must satisfy v3`);
    for (const beat of manifest.visual_beats) {
      assert.ok(beat.message);
      assert.ok(beat.focal_component_id);
      assert.ok(beat.reading_hold.end_frame - beat.reading_hold.start_frame >= 60);
    }
  }
});

test('historical v06 components are hidden before their first explicit interval', async () => {
  const manifest = await readManifest('SH047');
  const request = manifest.visual_components.find((component) => component.component_id === 'request-form');
  assert.equal(resolvePresentationState(request, 0), 'hidden');
  assert.equal(resolvePresentationState(request, 389), 'hidden');
  assert.equal(resolvePresentationState(request, 390), 'entering');
});

test('historical v06 document evidence uses overview, normalized crop and large exact quote phases', async () => {
  const manifest = await readManifest('SH005');
  const phases = manifest.visual_components.filter((component) => component.document_evidence?.evidence_id === 'LAW-1972-VIEW').map((component) => component.document_evidence.phase);
  assert.ok(phases.includes('overview'));
  assert.ok(phases.includes('crop'));
  assert.ok(phases.includes('quote'));
  const quote = manifest.visual_components.find((component) => component.document_evidence?.phase === 'quote').document_evidence;
  assert.ok(quote.quote_font_px >= 72);
  assert.ok(quote.max_lines <= 2);
});

test('historical v06 mobile and reading-hold gates reject unreadable screenshot-only explanations', async () => {
  const manifest = await readManifest('SH005');
  const broken = structuredClone(manifest);
  broken.visual_components = broken.visual_components.filter((component) => !component.document_evidence);
  broken.mobile_review.minimum_quote_font_px_at_1080p = 24;
  const failures = validateVisualContractV3(broken).join('\n');
  assert.match(failures, /full-screenshot-only/u);
  assert.match(failures, /at least 72px/u);
});

test('v05/v06 and superseded calibration files remain historical with no current render authority', async () => {
  const state = JSON.parse(await readFile(path.resolve('video/episodes/episode-001/production-state.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.resolve('video/episodes/episode-001/generated/render-catalog.json'), 'utf8'));
  assert.equal(state.active_cut_root, null);
  assert.equal(state.render_authority.production_authority, false);
  assert.equal(state.render_authority.cut_root, null);
  assert.equal(state.style_calibration.candidate_root, null);
  assert.equal(state.style_calibration.authority, null);
  assert.equal(state.provisional_artifacts['video/public/assets/episode-001-v05'], 'historical-viewer-quality-failure');
  assert.deepEqual(state.style_calibration.keyframe_gallery_shot_ids, []);
  assert.deepEqual(state.style_calibration.playable_shot_ids, []);
  assert.equal(catalog.production_authority, false);
  assert.equal(catalog.authority_root, null);
  assert.deepEqual(catalog.compositions, []);
  const sh008 = await readManifest('SH008');
  assert.equal(sh008.review_profile, 'omni-keyframe-input');
  assert.equal(sh008.motion_actions.length, 0);
});

test('historical SH006 typography contract rejects unbound target labels and tilted screen-space copy', async () => {
  const manifest = await readHistoricalWorkManifest('SH006');
  manifest.typography_surface_contract_version = 1;
  manifest.text_cues = manifest.text_cues.map((cue, index) => ({
    ...cue,
    transform_binding: index === 0 ? 'inherit-target-surface' : 'target-position-level',
    surface_anchor: index === 0 ? 'on-surface' : 'target-below-center',
    placement: index === 0 ? 'on-surface' : 'below-center',
    surface_rotation_deg: index === 0 ? -4 : 0,
  }));
  assert.deepEqual(validateVisualContractV3(manifest).filter((failure) => /surface|inherit-target|target-position/u.test(failure)), []);

  const missingBinding = structuredClone(manifest);
  delete missingBinding.text_cues[0].transform_binding;
  assert.match(validateVisualContractV3(missingBinding).join('\n'), /target-position-level/u);

  const screenSpace = structuredClone(await readManifest('SH002'));
  screenSpace.typography_surface_contract_version = 1;
  screenSpace.text_cues = screenSpace.text_cues.map(({target_asset_id: _targetAssetId, target_component_id: _targetComponentId, ...cue}) => ({...cue, transform_binding: 'screen-space-level', surface_anchor: 'screen-space', surface_rotation_deg: 1}));
  assert.match(validateVisualContractV3(screenSpace).join('\n'), /screen-space cue must remain at 0 degrees/u);
});

test('historical SH003 typography contract only permits rotation for an on-surface named PNG', async () => {
  const manifest = await readHistoricalWorkManifest('SH003');
  manifest.typography_surface_contract_version = 1;
  manifest.text_cues = manifest.text_cues.map((cue, index) => ({
    ...cue,
    transform_binding: index === 0 ? 'inherit-target-surface' : 'target-position-level',
    surface_anchor: index === 0 ? 'on-surface' : 'target-below-center',
    placement: index === 0 ? 'on-surface' : 'below-center',
    surface_rotation_deg: index === 0 ? 4 : 0,
  }));
  assert.deepEqual(validateVisualContractV3(manifest).filter((failure) => /surface|rotation|target-position/u.test(failure)), []);

  const detachedRotation = structuredClone(manifest);
  detachedRotation.text_cues[1].surface_rotation_deg = -4;
  assert.match(validateVisualContractV3(detachedRotation).join('\n'), /detached target label must remain at 0 degrees/u);

  const nonPngSurface = structuredClone(manifest);
  nonPngSurface.text_cues[2].transform_binding = 'inherit-target-surface';
  nonPngSurface.text_cues[2].surface_anchor = 'on-surface';
  nonPngSurface.text_cues[2].placement = 'on-surface';
  assert.match(validateVisualContractV3(nonPngSurface).join('\n'), /explicit named PNG target_component_id/u);
});
