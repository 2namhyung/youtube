import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {existsSync} from 'node:fs';
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import {deriveSh006ViewerAssets, SH006_VIEWER_ASSETS, SH006_VIEWER_TEXT} from '../src/lib/sh006-viewer-assets.ts';
import {buildAuthorityCatalog} from '../video/scripts/render-authority-lib.mjs';
import {validateManifestAgainstEpisodeContract, validateApprovedContractRequirements} from '../video/scripts/episode-manifest-contract.mjs';
import {validateVisualContractV3} from '../video/scripts/visual-contract-v3.mjs';

const root = process.cwd();
const cutRoot = path.resolve(root, 'video/public/assets/episode-001-work-v01/cuts/SH006');
const manifestPath = path.join(cutRoot, 'manifest.json');
const markerPath = path.resolve(root, 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-viewer-first-text-contract.json');
const expectedMarkerSha = '9988051e6ddab7399117695b24b626768a3209baaf680dce1321bb01654972c3';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const load = async () => JSON.parse(await readFile(manifestPath, 'utf8'));

test('SH006 viewer-first text marker binds current, deleted and retained clauses without opening stage gates', async () => {
  const bytes = await readFile(markerPath);
  const marker = JSON.parse(bytes);
  assert.equal(hash(bytes), expectedMarkerSha);
  assert.equal(marker.sources.article_196_before_effective_date.exact_paragraph_1, SH006_VIEWER_TEXT.currentArticleQuote.replace('\n', ' '));
  assert.equal(marker.sources.law_21857_amendment.exact_deletion, SH006_VIEWER_TEXT.deletionQuote);
  assert.equal(marker.sources.law_21857_amendment.screen_excerpt, SH006_VIEWER_TEXT.retainedQuote);
  assert.equal(marker.editorial_contract.viewer_visible_production_jargon_allowed, false);
  for (const key of ['cut_user_pass', 'production_cut_approved', 'rights_approved', 'omni_generation_approved', 'stage_advance_approved']) assert.equal(marker.approval_scope[key], false);
});

test('historical SH006 preserves reading holds but cannot satisfy the current editorial contract', async () => {
  const [manifest, contracts] = await Promise.all([load(), readFile(path.resolve(root, 'video/episodes/episode-001/generated/manifest-contracts.json'), 'utf8').then(JSON.parse)]);
  const contract = contracts.cuts.find((item) => item.shot_id === 'SH006');
  assert.ok(validateManifestAgainstEpisodeContract(manifest, contract).some((message) => message.includes('source_spec_sha256 does not match')));
  const pendingInputs = await validateApprovedContractRequirements({root, manifestPath, manifest, contract});
  assert.ok(pendingInputs.length > 0, 'historical inputs cannot be approved against the current cut contract');
  assert.deepEqual(validateVisualContractV3(manifest, {requireEvidenceVerification: true}), []);
  assert.equal(manifest.production_mode, 'remotion');
  assert.equal(manifest.review_profile, 'remotion-motion');
  assert.equal(manifest.duration_frames, 812);
  assert.deepEqual(manifest.visual_beats.map((beat) => [beat.start_frame, beat.end_frame, beat.reading_hold.start_frame, beat.reading_hold.end_frame]), [
    [0, 165, 105, 165], [165, 345, 285, 345], [345, 465, 405, 465], [465, 615, 555, 615], [615, 812, 752, 812],
  ]);
  assert.deepEqual(manifest.visual_beats.map((beat) => beat.purpose), ['article-role-explainer', 'current-article-exact-text', 'article-196-deletion', 'retained-request-duty', 'viewer-summary-process']);
  assert.equal(manifest.voiceover.text.startsWith('개정법이 시행되기 전 형사소송법 제196조는'), true);
  assert.equal([...manifest.voiceover.text.replace(/\s/gu, '')].length, 115);
  assert.equal(manifest.review.user_pass, false);
  assert.equal(manifest.approvals.playable_cut.user_pass, false);
  assert.equal(manifest.approvals.generation_input.user_pass, false);
  assert.equal(manifest.omni, undefined);
});

test('SH006 production-visible PNGs are independent, decodable, hash-bound and deterministic', async () => {
  const manifest = await load();
  const expectedFiles = Object.values(SH006_VIEWER_ASSETS).map((asset) => asset.file).sort();
  assert.deepEqual((await readdir(path.join(cutRoot, 'assets'))).sort(), expectedFiles);
  assert.equal(manifest.assets.length, expectedFiles.length);
  assert.ok(manifest.assets.every((asset) => asset.file.startsWith('assets/') && asset.media_type === 'image/png'));
  const regenerated = await deriveSh006ViewerAssets();
  for (const asset of manifest.assets) {
    const file = path.join(cutRoot, asset.file);
    const bytes = await readFile(file);
    const dimensions = await sharp(bytes).metadata();
    const key = Object.entries(SH006_VIEWER_ASSETS).find(([, spec]) => spec.file === path.basename(asset.file))[0];
    assert.equal(hash(bytes), asset.sha256);
    assert.ok(bytes.equals(regenerated[key]));
    assert.deepEqual([dimensions.width, dimensions.height], [SH006_VIEWER_ASSETS[key].width, SH006_VIEWER_ASSETS[key].height]);
    assert.equal(dimensions.hasAlpha, true);
    assert.ok((await stat(file)).size > 0);
  }
  assert.deepEqual(new Set(manifest.lifecycle.final_visible_asset_ids), new Set(manifest.assets.map((asset) => asset.asset_id)));
});

test('SH006 uses distinct observable actions and exact two-line law cards without viewer-facing production jargon', async () => {
  const manifest = await load();
  const operatorIds = new Set(manifest.motion_actions.map((action) => action.operator_id));
  for (const operatorId of ['transform.spring@1', 'transform.tween@1', 'mask.inset@1', 'svg.stroke-draw@1']) {
    assert.ok(operatorIds.has(operatorId), `missing observable operator ${operatorId}`);
  }
  for (const id of ['sh006-prosecutor', 'sh006-person', 'sh006-facts-folder', 'sh006-evidence-magnifier', 'sh006-current-article-196', 'sh006-article-196-deletion', 'sh006-article-195-retained', 'sh006-request-sheet', 'sh006-police-building']) {
    const component = manifest.visual_components.find((item) => item.component_id === id);
    assert.equal(component.compositing, 'independent-layer');
    assert.ok(component.asset_id);
  }
  const current = manifest.visual_components.find((component) => component.component_id === 'sh006-current-article-196').document_evidence;
  const retained = manifest.visual_components.find((component) => component.component_id === 'sh006-article-195-retained').document_evidence;
  assert.equal(current.source_id, 'LAW-196');
  assert.equal(retained.exact_quote, SH006_VIEWER_TEXT.retainedQuote);
  assert.equal(retained.quote_font_px, 82);
  assert.equal(retained.max_lines, 2);
  const visibleText = [manifest.visual_subject, manifest.source_line, ...manifest.text_cues.map((cue) => cue.text)].join('\n');
  assert.doesNotMatch(visibleText, /공식 원문 기반 재조판|화면 캡처 아님|provisional|source-photo|제작본/u);
  assert.doesNotMatch(JSON.stringify(manifest), /모든 보완수사.{0,8}폐지/u);
});

test('SH006 keeps prior source-photo files as non-production provenance only', async () => {
  const manifest = await load();
  assert.ok((await readdir(path.join(cutRoot, 'source-photo'))).length >= 3);
  assert.ok(manifest.source_photo_inputs.every((input) => input.production_visible === false));
  assert.ok(manifest.presentation_derivatives.every((input) => input.production_visible === true && input.file.startsWith('assets/')));
  assert.equal(manifest.effects_required, false);
  assert.deepEqual(manifest.effects, []);
});

test('historical SH006 review does not enter current source-search render authority', async () => {
  const ledgerPath = path.resolve(root, 'video/qa/episode-001-work-v01/review-ledger.json');
  if (existsSync(ledgerPath)) {
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    const artifacts = ledger.artifacts.filter((artifact) => artifact.composition_id === 'EP001-Cut-SH006-Provisional' || /SH006/u.test(path.basename(artifact.path)));
    assert.ok(artifacts.length >= 5);
    assert.ok(artifacts.every((artifact) => artifact.review_profile === 'remotion-motion'));
  }
  const catalog = await buildAuthorityCatalog();
  assert.deepEqual(catalog.cuts, []);
  assert.equal(catalog.production_authority, false);
  assert.equal(catalog.total_frames, 0);
  assert.deepEqual(catalog.compositions, []);
  const state = JSON.parse(await readFile(path.resolve(root, 'video/episodes/episode-001/production-state.json'), 'utf8'));
  assert.equal(state.stage, 'timing-draft');
  assert.equal(state.active_cut_root, null);
  assert.equal(state.cut_review.all_cuts_passed, false);
});
