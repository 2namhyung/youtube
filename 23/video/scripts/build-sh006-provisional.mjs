import crypto from 'node:crypto';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {SH006_VIEWER_ASSET_RECIPE_SHA256, SH006_VIEWER_ASSETS, SH006_VIEWER_TEXT, writeSh006ViewerAssets} from '../../src/lib/sh006-viewer-assets.ts';
import {sceneRuntimeSha256} from './render-authority-lib.mjs';

const ROOT = process.cwd();
const cutRoot = path.resolve(ROOT, 'video/public/assets/episode-001-work-v01/cuts/SH006');
const oldMarkerPath = path.resolve(ROOT, 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-paired-statutory-text-contract.json');
const viewerMarkerPath = path.resolve(ROOT, 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-viewer-first-text-contract.json');
const contractsPath = path.resolve(ROOT, 'video/episodes/episode-001/generated/manifest-contracts.json');
const backgroundTemplate = path.resolve(ROOT, 'video/public/assets/_cut-template/background.png');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha256 = async (file) => sha256(await readFile(file));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const expectedMarkers = {
  old: '83b97dda5ac240346d30f2df2460fb12c831572ec21bfbbe5d0bd1df5b0fc000',
  viewer: '9988051e6ddab7399117695b24b626768a3209baaf680dce1321bb01654972c3',
};
if (await fileSha256(oldMarkerPath) !== expectedMarkers.old) throw new Error('SH006 prior amendment marker drift');
if (await fileSha256(viewerMarkerPath) !== expectedMarkers.viewer) throw new Error('SH006 viewer-first text marker drift');
const viewerMarker = JSON.parse(await readFile(viewerMarkerPath, 'utf8'));
if (viewerMarker.sources.article_196_before_effective_date.exact_paragraph_1 !== SH006_VIEWER_TEXT.currentArticleQuote.replace('\n', ' ')
  || viewerMarker.sources.law_21857_amendment.exact_deletion !== SH006_VIEWER_TEXT.deletionQuote
  || viewerMarker.sources.law_21857_amendment.screen_excerpt !== SH006_VIEWER_TEXT.retainedQuote
  || viewerMarker.editorial_contract.viewer_visible_production_jargon_allowed !== false
  || viewerMarker.approval_scope.cut_user_pass !== false
  || viewerMarker.approval_scope.rights_approved !== false
  || viewerMarker.approval_scope.omni_generation_approved !== false) throw new Error('SH006 viewer-first exact-text or stage-gate contract is invalid');

const contracts = JSON.parse(await readFile(contractsPath, 'utf8'));
const contract = contracts.cuts.find((item) => item.shot_id === 'SH006');
if (!contract || contract.duration_frames !== 812 || contract.production_mode !== 'remotion' || contract.visual_beats?.length !== 5) throw new Error('SH006 generated viewer-first contract is missing or stale');

let previous = {};
try { previous = JSON.parse(await readFile(path.join(cutRoot, 'manifest.json'), 'utf8')); } catch { /* first materialization */ }
for (const folder of ['', 'assets', 'source-photo', 'preview']) await mkdir(path.join(cutRoot, folder), {recursive: true});
await cp(backgroundTemplate, path.join(cutRoot, 'background.png'));
const generatedAssets = await writeSh006ViewerAssets(path.join(cutRoot, 'assets'));
const generatedByKey = new Map(generatedAssets.map((record) => [record.key, record]));
const runtimeSha = await sceneRuntimeSha256();

const assetDefinitions = [
  ['prosecutor', 'sh006-prosecutor', 'character', 310],
  ['person', 'sh006-person', 'character', 315],
  ['facts', 'sh006-facts-folder', 'foreground', 320],
  ['evidence', 'sh006-evidence-magnifier', 'foreground', 325],
  ['currentArticle', 'sh006-current-article-196', 'document', 210],
  ['deletion', 'sh006-article-196-deletion', 'document', 230],
  ['deleteMark', 'sh006-delete-mark', 'accent', 350],
  ['retained', 'sh006-article-195-retained', 'document', 240],
  ['request', 'sh006-request-sheet', 'foreground', 340],
  ['police', 'sh006-police-building', 'architecture', 300],
];
const assets = assetDefinitions.map(([key, assetId, role, zIndex]) => {
  const generated = generatedByKey.get(key);
  const spec = SH006_VIEWER_ASSETS[key];
  return {asset_id: assetId, file: `assets/${spec.file}`, media_type: 'image/png', role, z_index: zIndex, source_id: spec.source_id, sha256: generated.sha256, ...(spec.source_id ? {source_crop_applied: true} : {})};
});
const layouts = {
  'sh006-prosecutor': {left: 80, top: 270, width: 370, height: 512},
  'sh006-person': {left: 500, top: 350, width: 250, height: 310},
  'sh006-facts-folder': {left: 800, top: 390, width: 310, height: 210},
  'sh006-evidence-magnifier': {left: 1160, top: 350, width: 290, height: 234},
  'sh006-investigation-route': {left: 260, top: 315, width: 1260, height: 420},
  'sh006-current-article-196': {left: 210, top: 180, width: 1500, height: 675},
  'sh006-article-196-deletion': {left: 210, top: 230, width: 1500, height: 580},
  'sh006-delete-mark': {left: 360, top: 260, width: 1200, height: 520},
  'sh006-article-195-retained': {left: 210, top: 180, width: 1500, height: 675},
  'sh006-request-sheet': {left: 1050, top: 465, width: 230, height: 264},
  'sh006-police-building': {left: 1460, top: 455, width: 260, height: 244},
  'sh006-request-route': {left: 60, top: 50, width: 1800, height: 890},
};
const svgPaths = {
  'sh006-investigation-route': 'M 300 650 C 650 360 1020 350 1640 590',
  'sh006-request-route': 'M 850 610 C 970 610 1040 610 1165 610 C 1320 610 1430 610 1590 610',
};
const visualComponents = contract.visual_components.map((component) => ({...component, layout: layouts[component.component_id], ...(svgPaths[component.component_id] ? {svg_path: svgPaths[component.component_id]} : {}), implementation_status: 'implemented'}));
const sourceMaterializations = Array.isArray(previous.source_asset_materializations) ? previous.source_asset_materializations : [];
const priorSourceInputs = Array.isArray(previous.source_photo_inputs) ? previous.source_photo_inputs.map((item) => ({...item, production_visible: false, status: 'provenance-only-superseded-visual'})) : [];

const manifest = {
  schema_version: 3,
  presentation_contract_version: 2,
  typography_surface_contract_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_version: 'v05-viewer-first-article-role-remotion',
  fps: 30,
  duration_frames: 812,
  claim_id: 'LAW-196__LAW-REVISION-21857',
  visual_subject: '제196조가 정한 수사 대상을 먼저 설명하고 삭제 조문과 남는 보완수사·재수사 요구 직무를 정확한 공식 문구로 연결하는 시청자 중심 Remotion 컷',
  background: 'background.png',
  asset_directory: 'assets',
  production_mode: 'remotion',
  review_profile: 'remotion-motion',
  effects_required: false,
  missing_sources: [], missing_assets: [], provisional_placeholder: false,
  source_materials: [
    {source_id: 'LAW-196', original_url: viewerMarker.sources.article_196_before_effective_date.official_url, rights_status: 'statutory text only; website UI/logo excluded', approval_status: 'pending'},
    {source_id: 'LAW-REVISION-21857', original_url: viewerMarker.sources.law_21857_amendment.official_url, rights_status: 'statutory text only; website UI/logo excluded', approval_status: 'pending'},
  ],
  voiceover: {audio: null, text: '개정법이 시행되기 전 형사소송법 제196조는 검사가 범인과 범죄사실, 증거를 수사한다고 정합니다. 개정법은 이 조문 전체를 삭제합니다. 하지만 검사가 경찰에 보완수사나 재수사를 요구하는 직무까지 없어지는 것은 아닙니다. 그 직무는 새 제195조에 따로 남습니다.', status: 'draft', start_frame: 0, end_frame: null, word_cues: []},
  assets,
  asset_provenance: generatedAssets.map((record) => ({
    asset_id: assetDefinitions.find(([key]) => key === record.key)[1],
    derivation: record.source_id ? 'source-backed-ui-free-retypeset' : 'self-authored-transparent-editorial-png',
    source_path: record.source_id ? path.relative(ROOT, viewerMarkerPath).replaceAll('\\', '/') : null,
    generated_at: '2026-08-29',
    note: record.source_id ? `Exact statutory text from ${record.source_id}; no website screenshot pixels or production jargon.` : 'Self-authored explanatory asset; no real-person likeness or documentary-evidence claim.',
    sha256: record.sha256, derivation_recipe_sha256: SH006_VIEWER_ASSET_RECIPE_SHA256,
  })),
  visual_components: visualComponents,
  visual_beats: contract.visual_beats,
  motion_actions: contract.planned_motion_actions.map((action) => ({...action, implementation_status: 'implemented'})),
  animations: [],
  lifecycle: {
    background_only: {start_frame: 0, end_frame: 15, visible_asset_ids: [], visible_effect_ids: []},
    reveal: {start_frame: 15, end_frame: 752},
    final_hold: {start_frame: 752, end_frame: 812},
    final_visible_asset_ids: assets.map((asset) => asset.asset_id), final_visible_effect_ids: [],
  },
  text_cues: [
    {cue_id: 'SH006-B01-prosecutor', kind: 'keyword', text: '검사', target_component_id: 'sh006-prosecutor', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 35, end_frame: 165, font_size_px: 58, max_width_px: 280, max_lines: 1},
    {cue_id: 'SH006-B01-person', kind: 'keyword', text: '범인', target_component_id: 'sh006-person', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 55, end_frame: 165, font_size_px: 54, max_width_px: 220, max_lines: 1},
    {cue_id: 'SH006-B01-facts', kind: 'keyword', text: '범죄사실', target_component_id: 'sh006-facts-folder', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 70, end_frame: 165, font_size_px: 54, max_width_px: 300, max_lines: 1},
    {cue_id: 'SH006-B01-evidence', kind: 'keyword', text: '증거', target_component_id: 'sh006-evidence-magnifier', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 85, end_frame: 165, font_size_px: 54, max_width_px: 250, max_lines: 1},
    {cue_id: 'SH006-B03-delete', kind: 'keyword', text: '조문 전체 삭제', target_component_id: 'sh006-article-196-deletion', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 405, end_frame: 465, font_size_px: 62, max_width_px: 560, max_lines: 1},
    {cue_id: 'SH006-B05-request', kind: 'keyword', text: '보완수사·재수사 요구', target_component_id: 'sh006-request-sheet', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 645, end_frame: 812, font_size_px: 54, max_width_px: 470, max_lines: 1},
    {cue_id: 'SH006-B05-police', kind: 'keyword', text: '경찰', target_component_id: 'sh006-police-building', placement: 'below-center', transform_binding: 'target-position-level', surface_anchor: 'target-below-center', surface_rotation_deg: 0, start_frame: 660, end_frame: 812, font_size_px: 54, max_width_px: 260, max_lines: 1},
  ],
  chart: null, effects: [], transition: contract.transition,
  source_ids: contract.source_ids,
  source_line: '형사소송법 제196조 · 법률 제21857호 개정문',
  supporting_opacity: .72, ai_disclosure: null,
  source_spec_sha256: contract.source_spec_sha256, source_cut_sha256: contract.source_cut_sha256, manifest_contract_sha256: contract.manifest_contract_sha256,
  implementation_status: 'implemented',
  runtime_contract: {operator_registry: 'video/src/vox/motion/operator-registry.ts', scene_renderer: 'video/src/vox/scene/ManifestScene.tsx', transition_renderer: null, runtime_sha256: runtimeSha},
  review_requirements: {generation_input_required: false, playable_cut_required: true, full_duration_preview_required: true, transition_pair_required: true, review_artifact: 'video/qa/episode-001-work-v01/rendered/EP001-Cut-SH006-Provisional.mp4', review_artifact_sha256: null},
  approvals: {generation_input: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null}, playable_cut: {status: 'pending', user_pass: false, approval_marker: null, approved_bundle_sha256: null}},
  mobile_review: {width: 360, height: 203, minimum_quote_font_px_at_1080p: 72, maximum_quote_lines: 2, requires_human_review: true},
  final_qc: {status: 'pending', marker: null}, review_state: 'draft',
  review: {status: 'pending', user_pass: false, approval_marker: null, notes: 'Viewer-first Remotion candidate for human visual/readability review only. No cut PASS, rights approval, Omni approval, or stage advancement.'},
  source_text_contract: {marker: path.relative(ROOT, viewerMarkerPath).replaceAll('\\', '/'), marker_sha256: expectedMarkers.viewer, source_text_verified: true, cut_pass: false},
  exact_text_provenance: {current_article_url: viewerMarker.sources.article_196_before_effective_date.official_url, amendment_url: viewerMarker.sources.law_21857_amendment.official_url, exact_text: SH006_VIEWER_TEXT, viewer_visible_production_jargon_allowed: false, screenshot_pixels_used: false, derivation_recipe_sha256: SH006_VIEWER_ASSET_RECIPE_SHA256},
  source_asset_materializations: sourceMaterializations,
  source_photo_inputs: priorSourceInputs,
  presentation_derivatives: generatedAssets.map((record) => ({kind: record.source_id ? 'source-backed-viewer-card' : 'self-authored-editorial-cutout', file: `assets/${record.file}`, sha256: record.sha256, width: record.width, height: record.height, derivation_recipe_sha256: record.derivation_recipe_sha256, source_id: record.source_id, website_ui_excluded: true, screenshot_pixels_used: false, production_visible: true})),
  superseded_review_artifacts: [
    ...(Array.isArray(previous.superseded_review_artifacts) ? previous.superseded_review_artifacts : []),
    {kind: 'v04-paired-statutory-change-source-photo-cut', sha256: previous.review_requirements?.review_artifact_sha256 ?? null, status: 'superseded-human-editorial-rejection-missing-article-role-explanation-and-viewer-facing-production-jargon'},
  ],
};
await writeJson(path.join(cutRoot, 'manifest.json'), manifest);

// The sole episode spec hash is embedded in every implemented manifest.  Keep
// the neighboring implemented cuts on the same generated contract, and apply
// the newly designed SH005 -> SH006 scene-to-scene boundary at its owner cut.
for (const shotId of ['SH003', 'SH004', 'SH005']) {
  const siblingContract = contracts.cuts.find((item) => item.shot_id === shotId);
  const siblingPath = path.resolve(ROOT, `video/public/assets/episode-001-work-v01/cuts/${shotId}/manifest.json`);
  const sibling = JSON.parse(await readFile(siblingPath, 'utf8'));
  sibling.source_spec_sha256 = siblingContract.source_spec_sha256;
  sibling.source_cut_sha256 = siblingContract.source_cut_sha256;
  sibling.manifest_contract_sha256 = siblingContract.manifest_contract_sha256;
  if (shotId === 'SH005') sibling.transition = siblingContract.transition;
  await writeJson(siblingPath, sibling);
}

const depth = {'sh006-investigation-route': 100, 'sh006-request-route': 110, 'sh006-current-article-196': 200, 'sh006-article-196-deletion': 220, 'sh006-article-195-retained': 230, 'sh006-prosecutor': 300, 'sh006-person': 310, 'sh006-facts-folder': 320, 'sh006-evidence-magnifier': 330, 'sh006-police-building': 340, 'sh006-request-sheet': 350, 'sh006-delete-mark': 360};
const assetSheet = {
  schema_version: 1, contract_kind: 'spatial-implementation-contract', shot_id: 'SH006', layout_binding: 'manifest-component-layout', canvas: {width: 1920, height: 1080},
  safe_areas: {essential: {left: 60, top: 50, right: 60, bottom: 140}, overlay: {left: 48, top: 36, right: 48, bottom: 34}},
  background: {asset_binding: 'manifest.background', layer_role: 'background', depth: 0, anchor: 'canvas-fill', safe_area_policy: 'edge-to-edge', treatment: {mode: 'untreated', operator_ids: []}},
  layers: visualComponents.map((component) => ({
    component_id: component.component_id, asset_id: component.asset_id,
    layer_role: component.render_kind === 'svg-path' ? 'midground' : component.component_id === 'sh006-delete-mark' ? 'foreground' : 'subject',
    depth: depth[component.component_id], anchor: `viewer-first-${component.component_id}`, safe_area_policy: 'essential',
    occludes: component.component_id === 'sh006-delete-mark' ? ['sh006-current-article-196'] : [],
    occluded_by: component.component_id === 'sh006-current-article-196' ? ['sh006-delete-mark'] : [],
    treatment: {mode: 'untreated', operator_ids: []},
  })),
  system_layers: [
    {system_id: 'target-labels', layer_role: 'overlay', depth: 900, anchor: 'target-below-center', safe_area_policy: 'overlay', treatment: {mode: 'protected-system-render-order', operator_ids: [], protection_mask: 'system-render-order'}},
    {system_id: 'source-chrome', layer_role: 'overlay', depth: 1000, anchor: 'canvas-bottom-left', safe_area_policy: 'overlay', treatment: {mode: 'protected-system-render-order', operator_ids: [], protection_mask: 'system-render-order'}},
  ],
  provenance: {authoring: 'cut-local', basis: 'Viewer-first semantic layout with independent transparent PNGs and exact source-text cards; prior v04 source-photo assets are provenance-only', status: 'provisional-review-only'},
};
await writeJson(path.join(cutRoot, 'asset-sheet.json'), assetSheet);
console.log(JSON.stringify({ok: true, candidate_version: manifest.candidate_version, duration_frames: manifest.duration_frames, assets: generatedAssets.map(({key, sha256, width, height}) => ({key, sha256, width, height})), viewer_text_contract_sha256: expectedMarkers.viewer, asset_recipe_sha256: SH006_VIEWER_ASSET_RECIPE_SHA256, runtime_sha256: runtimeSha}, null, 2));
