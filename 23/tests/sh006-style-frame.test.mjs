import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {validatePersonOnlyImagegenPolicy} from '../video/scripts/asset-origin-policy.mjs';
import {validateStyleFrameGeometry} from '../video/scripts/style-frame-layout-contract.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v07/manifest.json');
const realSourceManifestPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v08/manifest.json');
const imagegenPersonManifestPath = path.join(root, 'video/qa/production-assets/episode-001/SH006-person-imagegen-v01/person-asset-manifest.json');
const v06ManifestPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v06/manifest.json');
const historicalManifestPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v03/manifest.json');
const historicalApprovalPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v03/style-frame-approval.json');
const rejectedManifestPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v04/manifest.json');
const currentFamilyIndexPath = path.join(root, 'video/qa/style-frames/episode-001/reference-style-families-v10/family-index.json');
const statePath = path.join(root, 'video/episodes/episode-001/production-state.json');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const pairKey = (a, b) => [a, b].sort().join('::');
const overlapRatio = (a, b) => {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? (width * height) / Math.min(a.width * a.height, b.width * b.height) : 0;
};

const assertAllAssetOverlapsDeclared = (frame) => {
  const declarations = new Map(frame.geometry.intentional_overlaps.map((item) => [pairKey(item.foreground_id, item.background_id), item]));
  const observed = new Set();
  for (let index = 0; index < frame.geometry.assets.length; index += 1) {
    for (let next = index + 1; next < frame.geometry.assets.length; next += 1) {
      const a = frame.geometry.assets[index];
      const b = frame.geometry.assets[next];
      const ratio = overlapRatio(a.bbox, b.bbox);
      if (ratio === 0) continue;
      const key = pairKey(a.id, b.id);
      const declaration = declarations.get(key);
      assert.ok(declaration, `${frame.frame_id}: overlap ${key} must be declared even when one asset is context`);
      assert.ok(declaration.purpose);
      assert.ok(ratio <= declaration.max_ratio);
      assert.ok(ratio <= 0.12);
      assert.ok(Math.abs(declaration.actual_ratio - Number(ratio.toFixed(6))) < 0.000001);
      observed.add(key);
    }
  }
  assert.deepEqual([...declarations.keys()].sort(), [...observed].sort(), `${frame.frame_id}: every declaration must describe a real overlap`);
};

test('SH006 v07 remains a non-production pending historical candidate under layout/editorial contracts', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(manifest.candidate_id, 'SH006-editorial-v07');
  assert.equal(manifest.supersedes_for_style_review, 'SH006-editorial-v06');
  assert.equal(manifest.status, 'pending-user-style-frame-review');
  assert.equal(manifest.production_visible, false);
  assert.equal(manifest.user_style_frame_pass, false);
  assert.equal(manifest.user_cut_pass, false);
  assert.equal(manifest.rights_approved, false);
  assert.equal(manifest.omni_video_approved, false);
  assert.equal(manifest.stage_advanced, false);
  assert.equal(manifest.typography_surface_contract_version, 2);
  assert.ok(manifest.reference_transfer.reference_frames.length > 0);
  assert.ok(manifest.reference_transfer.observed_grammar.length > 0);
  assert.ok(manifest.reference_transfer.excluded_elements.length > 0);
  assert.equal(manifest.editorial_contract_version, 3);
  assert.equal(manifest.reference_parity.static_to_playable_parity.pass, false);
  assert.equal(manifest.reference_parity.motion_proof.static_png_is_not_motion_proof, true);
  assert.equal(manifest.layout_contract_version, 2);
  assert.equal(manifest.layout_contract.asset_label_clearance_px, 32);
  assert.equal(manifest.layout_contract.asset_label_max_clearance_px, 72);
  assert.equal(manifest.layout_contract.same_row_asset_gap_px, 64);
  assert.equal(manifest.layout_contract.surface_rotation_match_tolerance_deg, 0.05);
  assert.deepEqual(manifest.frames.map((frame) => frame.beat_id), ['B01', 'B03', 'B05']);

  for (const frame of manifest.frames) {
    assert.deepEqual(validateStyleFrameGeometry(frame), []);
    assertAllAssetOverlapsDeclared(frame);
    assert.equal(frame.editorial_contract_version, 3);
    assert.ok(frame.dominant_focal_asset_id);
    assert.ok(frame.viewer_takeaway);
    assert.ok(frame.stable_reading_hold_seconds >= 2);
    assert.deepEqual(frame.required_review_dimensions, {wide: '1920x1080', mobile: '360x203'});
    for (const cue of frame.geometry.texts) {
      assert.ok(Array.isArray(cue.lines) && cue.lines.length > 0);
      assert.ok(['left', 'center', 'right'].includes(cue.text_align));
    }
    for (const cue of frame.geometry.texts.filter((item) => item.semantic_role === 'asset-label')) {
      assert.equal(cue.rotation_deg, 0);
      assert.ok(cue.target_id);
      assert.ok(cue.font_size_px >= 44);
    }
    for (const cue of frame.geometry.texts.filter((item) => item.semantic_role === 'surface-content')) {
      const target = frame.geometry.assets.find((asset) => asset.id === cue.target_id);
      assert.ok(target);
      assert.equal(cue.placement, 'on-surface');
      assert.ok(Math.abs(cue.rotation_deg) <= 2);
      assert.equal(cue.rotation_deg, target.surface_rotation_deg);
    }
    const output = path.join(root, frame.output);
    const mobile = path.join(root, frame.mobile);
    assert.equal(await sha256(output), frame.output_sha256);
    assert.equal(await sha256(mobile), frame.mobile_sha256);
    const outputMeta = await sharp(output).metadata();
    const mobileMeta = await sharp(mobile).metadata();
    assert.deepEqual([outputMeta.width, outputMeta.height], [1920, 1080]);
    assert.deepEqual([mobileMeta.width, mobileMeta.height], [360, 203]);
  }

  const b01 = manifest.frames.find((frame) => frame.beat_id === 'B01');
  assert.deepEqual(b01.geometry.intentional_overlaps.map((item) => pairKey(item.foreground_id, item.background_id)), [pairKey('prosecutor-role', 'evidence-dossier')]);
  const b03 = manifest.frames.find((frame) => frame.beat_id === 'B03');
  assert.equal(b03.geometry.assets.find((asset) => asset.id === 'deletion-event').surface_rotation_deg, 2);
  assert.equal(b03.geometry.texts.find((cue) => cue.id === 'amendment-copy').rotation_deg, 2);
  assert.deepEqual(b03.geometry.intentional_overlaps.map((item) => pairKey(item.foreground_id, item.background_id)), [pairKey('old-clause-paper', 'deletion-event')]);
  const b05 = manifest.frames.find((frame) => frame.beat_id === 'B05');
  assert.equal(b05.dominant_focal_asset_id, 'request-sheet');
  assert.equal(b05.layout_template, 'foreground-request-bridge-to-anchored-agency');
  assert.deepEqual(b05.layer_roles.foreground, ['request-sheet']);
  assert.ok(overlapRatio(b05.geometry.assets.find((asset) => asset.id === 'request-sheet').bbox, b05.geometry.assets.find((asset) => asset.id === 'prosecutor').bbox) > 0);
  assert.ok(overlapRatio(b05.geometry.assets.find((asset) => asset.id === 'request-sheet').bbox, b05.geometry.assets.find((asset) => asset.id === 'investigation-agency').bbox) > 0);
  assert.deepEqual(b05.geometry.connectors.map((item) => item.endpoint_asset_ids), [['prosecutor', 'request-sheet'], ['request-sheet', 'investigation-agency']]);

  assert.equal(await sha256(path.join(root, manifest.contact.path)), manifest.contact.sha256);
  assert.notEqual(state.style_frame_review.candidate_id, manifest.candidate_id);
  assert.equal(state.style_frame_review.candidate_id, null);
  assert.equal(state.style_frame_review.manifest_sha256, null);
  assert.equal(state.provisional_artifacts['video/qa/style-frames/episode-001/reference-style-families-v10'], 'historical-human-review-failed');
  assert.equal(state.style_frame_review.user_approved, false);
  assert.equal(state.stage, 'timing-draft');
  assert.equal(state.cut_review.all_cuts_passed, false);
  assert.equal(state.omni_video_generation.status, 'blocked_until_all_cuts_passed');
});

test('SH006 v08 binds real/official or source-derived assets and remains pending', async () => {
  const manifest = JSON.parse(await readFile(realSourceManifestPath, 'utf8'));
  assert.equal(manifest.candidate_id, 'SH006-editorial-v08');
  assert.equal(manifest.status, 'pending-user-style-frame-review');
  assert.equal(manifest.production_visible, false);
  assert.equal(manifest.user_style_frame_pass, false);
  assert.equal(manifest.user_cut_pass, false);
  assert.equal(manifest.rights_approved, false);
  assert.equal(manifest.omni_video_approved, false);
  assert.deepEqual(validatePersonOnlyImagegenPolicy(manifest, {requirePolicy: true}), []);
  assert.equal(manifest.assets.length, manifest.asset_provenance.length);
  assert.ok(manifest.assets.every((asset) => asset.sha256 && asset.source_id && asset.source_path && asset.license));
  assert.ok(manifest.assets.filter((asset) => asset.asset_class !== 'person').every((asset) => !/imagegen|generated|omni/iu.test(JSON.stringify(asset))));
  assert.ok(manifest.asset_provenance.filter((entry) => entry.asset_id !== 'person-imagegen-fictional').every((entry) => entry.origin === 'real-source' || entry.origin === 'official-source' || entry.origin === 'source-derived' || entry.origin === 'deterministic-editorial'));
  const generatedPerson = manifest.asset_provenance.find((entry) => entry.asset_id === 'person-imagegen-fictional');
  assert.deepEqual({origin: generatedPerson.origin, identity_scope: generatedPerson.identity_scope, ai_disclosure: generatedPerson.ai_disclosure}, {origin: 'imagegen-person', identity_scope: 'fictional-generic', ai_disclosure: true});
  for (const frame of manifest.frames) {
    assert.deepEqual(validateStyleFrameGeometry(frame), []);
    assert.ok(frame.geometry.texts.every((cue) => ['asset-label', 'screen-chrome'].includes(cue.semantic_role) && cue.rotation_deg === 0));
    assert.equal(await sha256(path.join(root, frame.output)), frame.output_sha256);
    assert.equal(await sha256(path.join(root, frame.mobile)), frame.mobile_sha256);
    const outputMeta = await sharp(path.join(root, frame.output)).metadata();
    assert.deepEqual([outputMeta.width, outputMeta.height], [1920, 1080]);
    const mobileMeta = await sharp(path.join(root, frame.mobile)).metadata();
    assert.deepEqual([mobileMeta.width, mobileMeta.height], [360, 203]);
  }
  const legalAssets = manifest.assets.filter((asset) => asset.asset_class === 'document');
  assert.equal(legalAssets.length, 3);
  assert.equal(legalAssets.find((asset) => asset.asset_id === 'currentArticle').exact_quote, '검사는 범죄의 혐의가 있다고 사료하는 때에는 범인, 범죄사실과 증거를 수사한다.');
  assert.equal(legalAssets.find((asset) => asset.asset_id === 'deletionArticle').exact_quote, '제196조를 삭제한다.');
  assert.equal(legalAssets.find((asset) => asset.asset_id === 'retainedArticle').exact_quote, '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.');
  assert.ok(legalAssets.every((asset) => asset.display_quote.split('\n').length <= 2));
  for (const asset of legalAssets) {
    assert.equal(asset.origin, 'source-derived');
    assert.deepEqual(asset.evidence_view_sequence, ['overview', 'normalized-crop', 'exact-retype']);
    assert.ok(asset.source_lock_path && asset.source_lock_sha256 && asset.exact_quote && asset.derivation_script && asset.recipe_sha256);
    assert.ok(asset.derivation_recipe && asset.derivation_version && asset.evidence_view_steps);
    for (const step of ['overview', 'normalized-crop', 'exact-retype']) {
      assert.ok(asset.evidence_view_steps[step]?.path && asset.evidence_view_steps[step]?.sha256);
      assert.equal(await sha256(path.join(root, asset.evidence_view_steps[step].path)), asset.evidence_view_steps[step].sha256);
    }
    assert.equal(asset.derivation_recipe.source_lock_path, asset.source_lock_path);
    assert.equal(asset.derivation_recipe.source_lock_sha256, asset.source_lock_sha256);
    assert.equal(asset.derivation_recipe.evidence_view_steps['exact-retype'].sha256, asset.evidence_view_steps['exact-retype'].sha256);
    assert.equal(asset.recipe_sha256, createHash('sha256').update(JSON.stringify(asset.derivation_recipe)).digest('hex'));
    assert.equal(asset.effective_font_px_1080, Number((asset.source_render_font_px * asset.displayed_width_px / asset.source_dimensions.width).toFixed(2)));
    assert.ok(asset.effective_font_px_1080 >= 72);
    assert.equal(await sha256(path.join(root, asset.source_lock_path)), asset.source_lock_sha256);
    const sourceMeta = await sharp(path.join(root, asset.file)).metadata();
    assert.deepEqual([sourceMeta.width, sourceMeta.height], [asset.source_dimensions.width, asset.source_dimensions.height]);
  }
  const b03 = manifest.frames.find((frame) => frame.beat_id === 'B03');
  assert.equal(b03.viewer_text_min_px_1080, 84);
  assert.deepEqual(b03.geometry.assets.map((asset) => asset.id), ['current-article-196', 'deletion-article-196']);
  assert.equal(b03.geometry.assets.find((asset) => asset.id === 'current-article-196').bbox.width, 1200);
  assert.equal(b03.geometry.assets.find((asset) => asset.id === 'deletion-article-196').bbox.width, 504);
  const b05 = manifest.frames.find((frame) => frame.beat_id === 'B05');
  assert.equal(b05.viewer_text_min_px_1080, 84);
  assert.equal(b05.geometry.texts.find((cue) => cue.id === 'building-label').lines[0].text, '경찰청');
  assert.deepEqual(b05.geometry.assets.map((asset) => asset.id), ['person-imagegen-fictional', 'retained-article-195', 'police-building']);
  assert.deepEqual(b05.assets.map((asset) => asset.id), ['route-path', 'person-imagegen-fictional', 'retained-article-195', 'police-building']);
  assert.equal(b05.geometry.assets.find((asset) => asset.id === 'retained-article-195').bbox.width, 1200);
  assert.ok(b05.geometry.assets.find((asset) => asset.id === 'person-imagegen-fictional').bbox.left < b05.geometry.assets.find((asset) => asset.id === 'retained-article-195').bbox.left);
  assert.ok(b05.geometry.assets.find((asset) => asset.id === 'retained-article-195').bbox.left < b05.geometry.assets.find((asset) => asset.id === 'police-building').bbox.left);
  assert.deepEqual(b05.geometry.connectors.map((item) => ({ids: item.endpoint_asset_ids, direction: item.direction, arrowhead: item.arrowhead, clearance: item.clearance_px})), [
    {ids: ['person-imagegen-fictional', 'retained-article-195'], direction: 'up-right', arrowhead: 'at-end', clearance: 24},
    {ids: ['retained-article-195', 'police-building'], direction: 'right', arrowhead: 'at-end', clearance: 24},
  ]);
  assert.deepEqual(manifest.connector_specs, b05.geometry.connectors);
  const routeAsset = manifest.assets.find((asset) => asset.asset_id === 'route-path');
  const routeFile = path.join(root, routeAsset.file);
  const routeSvg = await readFile(routeFile, 'utf8');
  assert.equal(await sha256(routeFile), routeAsset.sha256);
  assert.equal(b05.inputs.find((input) => input.asset_id === 'route-path').sha256, routeAsset.sha256);
  const parsePathPoints = (d) => {
    const points = [...d.matchAll(/[ML](-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gu)].map((match) => ({x: Number(match[1]), y: Number(match[2])}));
    const terminal = d.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/u);
    if (terminal) points.push({x: Number(terminal[1]), y: Number(terminal[2])});
    return points;
  };
  for (const connector of b05.geometry.connectors) {
    assert.match(routeSvg, new RegExp(`id="${connector.id}"`, 'u'));
    assert.match(routeSvg, new RegExp(`id="arrow-${connector.id}"`, 'u'));
    const routePathMatch = routeSvg.match(new RegExp(`<path id="path-${connector.id}" d="([^"]+)"`, 'u'));
    const arrowPathMatch = routeSvg.match(new RegExp(`<path id="arrow-${connector.id}" d="([^"]+)"`, 'u'));
    assert.ok(routePathMatch && arrowPathMatch);
    const routePoints = parsePathPoints(routePathMatch[1]);
    const arrowPoints = parsePathPoints(arrowPathMatch[1]);
    assert.deepEqual(routePoints[0], connector.start_point);
    assert.deepEqual(routePoints.at(-1), connector.end_point);
    assert.deepEqual(arrowPoints[1], connector.end_point);
    const [fromId, toId] = connector.endpoint_asset_ids;
    const from = b05.geometry.assets.find((asset) => asset.id === fromId).bbox;
    const to = b05.geometry.assets.find((asset) => asset.id === toId).bbox;
    assert.equal(connector.start_point.x, from.left + from.width);
    assert.ok(connector.start_point.y >= from.top && connector.start_point.y <= from.top + from.height);
    assert.equal(connector.end_point.x, to.left);
    assert.ok(connector.end_point.y >= to.top && connector.end_point.y <= to.top + to.height);
  }
  assert.equal(manifest.assets.find((asset) => asset.asset_id === 'route-path').origin, 'deterministic-editorial');
  assert.equal(manifest.assets.find((asset) => asset.asset_id === 'route-path').asset_class, 'path');
  assert.equal(manifest.supersession_is_historical_only, true);
  assert.equal(manifest.production_authority, false);
  assert.equal(manifest.reference_parity.static_to_playable_parity.pass, false);
  assert.equal(manifest.contact.dimensions.width, 1920);
  assert.equal(await sha256(path.join(root, manifest.contact.path)), manifest.contact.sha256);
});

test('SH006 imagegen person preparation keeps only the disclosed generic derivative', async () => {
  const manifest = JSON.parse(await readFile(imagegenPersonManifestPath, 'utf8'));
  assert.deepEqual(manifest.policy, {asset_class: 'person', origin: 'imagegen-person', identity_scope: 'fictional-generic', ai_disclosure: true});
  assert.equal(manifest.prompt.provider, 'built-in image_gen');
  assert.match(manifest.prompt.final_prompt, /fictional generic Korean male legal professional, dark suit, burgundy tie, navy folder, transparent, no real person\/official likeness; built-in image_gen, generated 2026-08-30\./u);
  assert.equal(manifest.candidates.v02.decision, 'rejected');
  assert.ok(manifest.derived.sha256);
  assert.ok(manifest.derived.alpha_stats.opaque_pixels > 100000);
  assert.ok(manifest.derived.alpha_stats.transparent_pixels > 100000);
  assert.equal(manifest.derived.alpha_stats.partial_pixels, 0);
  assert.equal(manifest.production_authority, false);
  assert.equal(manifest.rights_approved, false);
});

test('layout contract rejects surface-angle mismatch, non-target overlap, and screen-chrome overlap', () => {
  const base = {
    frame_id: 'contract-regression',
    layout_contract_version: 2,
    geometry: {
      assets: [
        {id: 'paper', bbox: {left: 100, top: 100, width: 400, height: 300}, surface_rotation_deg: 1.5},
        {id: 'other', bbox: {left: 520, top: 100, width: 300, height: 300}},
      ],
      texts: [],
      connectors: [],
    },
  };

  const mismatch = structuredClone(base);
  mismatch.geometry.texts = [{id: 'copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'paper', bbox: {left: 150, top: 150, width: 200, height: 100}, rotation_deg: 0, font_size_px: 72, kind: 'quote', text_align: 'left', lines: [{text: '조문', font_size_px: 72}]}];
  assert.ok(validateStyleFrameGeometry(mismatch).some((failure) => /rotation does not match/u.test(failure)));

  const nonTarget = structuredClone(base);
  nonTarget.geometry.texts = [{id: 'copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'paper', bbox: {left: 450, top: 150, width: 150, height: 100}, rotation_deg: 1.5, font_size_px: 72, kind: 'quote', text_align: 'left', lines: [{text: '조문', font_size_px: 72}]}];
  const nonTargetFailures = validateStyleFrameGeometry(nonTarget);
  assert.ok(nonTargetFailures.some((failure) => /overlaps non-target asset other/u.test(failure)));

  const chrome = structuredClone(base);
  chrome.geometry.texts = [{id: 'headline', semantic_role: 'screen-chrome', bbox: {left: 120, top: 120, width: 240, height: 80}, rotation_deg: 0, font_size_px: 58, text_align: 'left', lines: [{text: '제목', font_size_px: 58}]}];
  assert.ok(validateStyleFrameGeometry(chrome).some((failure) => /screen chrome overlaps paper/u.test(failure)));

  const detached = structuredClone(base);
  detached.geometry.texts = [{id: 'copy', semantic_role: 'surface-content', target_id: 'paper', bbox: {left: 150, top: 150, width: 200, height: 100}, rotation_deg: 1.5, font_size_px: 72, kind: 'quote', text_align: 'left', lines: [{text: '조문', font_size_px: 72}]}];
  assert.ok(validateStyleFrameGeometry(detached).some((failure) => /placement must be on-surface/u.test(failure)));

  const tooNarrow = structuredClone(base);
  tooNarrow.geometry.texts = [{id: 'label', semantic_role: 'asset-label', target_id: 'paper', bbox: {left: 275, top: 432, width: 50, height: 64}, rotation_deg: 0, font_size_px: 44, text_align: 'center', lines: [{text: '너무 긴은 설명 라벨', font_size_px: 44}]}];
  assert.ok(validateStyleFrameGeometry(tooNarrow).some((failure) => /narrower than conservative rendered ink/u.test(failure)));

  const unsafeLabel = structuredClone(base);
  unsafeLabel.geometry.texts = [{id: 'label', semantic_role: 'asset-label', target_id: 'paper', bbox: {left: 60, top: 432, width: 480, height: 64}, rotation_deg: 0, font_size_px: 44, text_align: 'center', lines: [{text: '직접 수사 근거 삭제', font_size_px: 44}]}];
  assert.ok(validateStyleFrameGeometry(unsafeLabel).some((failure) => /escapes the horizontal safe area/u.test(failure)));
});

test('SH006 v03 approval and rejected v04 remain non-production history', async () => {
  const historicalManifest = JSON.parse(await readFile(historicalManifestPath, 'utf8'));
  const historicalApproval = JSON.parse(await readFile(historicalApprovalPath, 'utf8'));
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.superseded_style_frame_review.candidate_id, historicalManifest.candidate_id);
  assert.equal(state.superseded_style_frame_review.manifest_sha256, await sha256(historicalManifestPath));
  assert.equal(state.superseded_style_frame_review.approval_marker_sha256, await sha256(historicalApprovalPath));
  assert.equal(state.superseded_style_frame_review.production_authority, false);
  const rejected = state.rejected_style_frame_reviews.find((record) => record.candidate_id === 'SH006-editorial-v04');
  assert.ok(rejected);
  assert.equal(rejected.manifest_sha256, await sha256(rejectedManifestPath));
  assert.equal(rejected.production_authority, false);
  assert.match(rejected.reason, /arbitrary coordinates/u);
});

test('SH006 v06 remains superseded pending history and has no production authority', async () => {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const v06 = state.superseded_pending_style_frame_reviews.find((record) => record.candidate_id === 'SH006-editorial-v06');
  assert.ok(v06);
  assert.equal(v06.manifest, 'video/qa/style-frames/episode-001/SH006-editorial-v06/manifest.json');
  assert.equal(v06.manifest_sha256, await sha256(v06ManifestPath));
  assert.equal(v06.production_authority, false);
  assert.equal(v06.historical_status, 'superseded-by-v07-quality-revision');
});

test('SH006 v07 builder encodes the object-led reference boundary', async () => {
  const script = await readFile(path.join(root, 'video/scripts/build-sh006-editorial-style-frames-v07.mjs'), 'utf8');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(script, /dominant-person-with-dossier-collage/u);
  assert.match(script, /near-fullscreen-paper-with-pasted-correction/u);
  assert.match(script, /printTreatment/u);
  assert.match(script, /dedicated zero-degree lane/u);
  assert.match(script, /no-asset-label-on-or-over-any-asset/u);
  assert.match(script, /no-arbitrary-asset-coordinates-without-geometry-record/u);
  assert.match(script, /function bindAndValidateRenderedSurfaceText\(spec\)/u);
  assert.match(script, /bindAndValidateRenderedSurfaceText\(spec\);/u);
  assert.match(script, /surfaceTextGroup\(\{targetId: 'deletion-event', rotationDeg: 2,/u);
  assert.match(script, /function bindAndValidateAllAssetOverlaps\(spec\)/u);
  assert.match(script, /including context assets/u);
  assert.doesNotMatch(script, /official original retypeset/u);
  assert.equal(pkg.scripts['video:qa:build-sh006-style-v07'], undefined);
  assert.equal(pkg.scripts['video:build-sh006-style-v06'], undefined);
});
