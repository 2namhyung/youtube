import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const setRoot = path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v01');
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const wikiRoot = path.resolve(root, 'wiki');
const isResolvedWikiPath = (candidatePath) => {
  const resolved = path.resolve(root, candidatePath);
  return resolved === wikiRoot || resolved.startsWith(`${wikiRoot}${path.sep}`);
};
const overlapArea = (a, b) => Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
const rectangleDistanceForTest = (a, b) => Math.hypot(Math.max(b.left - (a.left + a.width), a.left - (b.left + b.width), 0), Math.max(b.top - (a.top + a.height), a.top - (b.top + b.height), 0));

test('ten reference-calibration samples remain pre-motion and ineligible for style PASS', async () => {
  const index = JSON.parse(await readFile(path.join(setRoot, 'sample-index.json'), 'utf8'));
  assert.equal(index.sample_count, 10);
  assert.equal(index.frame_count, 30);
  assert.equal(index.mobile_frame_count, 30);
  assert.equal(index.status, 'reference-calibration-incomplete');
  assert.equal(index.scope, 'non-production-reference-calibration-experiment');
  assert.equal(index.reference_calibration_contract_version, 1);
  assert.equal(index.eligible_for_user_style_frame_review, false);
  assert.equal(index.user_reference_calibration_pass, false);
  assert.equal(index.grammar_promoted, false);
  assert.equal(index.reference_calibration.contract_version, 1);
  assert.equal(index.reference_calibration.status, 'reference-calibration-incomplete');
  assert.equal(index.reference_calibration.reference_calibration_pass, false);
  assert.equal(index.reference_calibration.eligible_for_user_style_frame_review, false);
  assert.equal(index.reference_calibration.grammar_promoted, false);
  assert.deepEqual(index.reference_calibration.exact_reference_frame_bindings, []);
  assert.equal(index.reference_calibration.side_by_side, null);
  for (const item of index.reference_calibration.shared_locked_reference_bundle) {
    const file = path.join(root, item.path);
    if (isResolvedWikiPath(item.path)) assert.ok((await stat(file)).isFile(), 'historical v01 may link to a mutable wiki page but cannot treat its old hash as production authority');
    else assert.equal(await hash(file), item.sha256);
  }
  assert.equal(index.production_authority, false);
  assert.equal(index.production_visible, false);
  assert.equal(index.user_style_frame_pass, false);
  assert.equal(index.user_cut_pass, false);
  assert.equal(index.rights_approved, false);
  assert.equal(index.omni_video_approved, false);
  assert.equal(index.parity_approved, false);
  assert.equal(index.motion_artifacts_created, false);
  assert.equal(index.production_state_modified, false);
  assert.deepEqual(index.exact_reference_bindings, []);
  assert.equal(index.side_by_side, null);
  assert.ok(index.blocking_reasons.length > 0);
  assert.equal(index.review_board.title, 'REMOTION REFERENCE CALIBRATION · 10 INCOMPLETE EXPERIMENTS');
  assert.equal(index.review_board.status_label, 'NOT ELIGIBLE FOR STYLE PASS');
  assert.equal(index.next_gate, 'exact reference-bound side-by-side calibration with explicit human reference-calibration PASS');
  const board = path.join(root, index.review_board.path);
  assert.deepEqual(await sharp(board).metadata().then(({width, height}) => ({width, height})), {width: 1920, height: 1640});
  assert.equal(await hash(board), index.review_board.sha256);

  const grammar = new Set();
  for (const sample of index.samples) {
    assert.equal(sample.status, 'reference-calibration-incomplete');
    assert.equal(sample.scope, 'non-production-reference-calibration-experiment');
    assert.equal(sample.reference_calibration_contract_version, 1);
    assert.equal(sample.eligible_for_user_style_frame_review, false);
    assert.equal(sample.user_reference_calibration_pass, false);
    assert.equal(sample.grammar_promoted, false);
    const manifestPath = path.join(root, sample.manifest);
    assert.equal(await hash(manifestPath), sample.manifest_sha256);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    grammar.add(manifest.unverified_grammar_hypothesis);
    assert.equal(manifest.status, 'reference-calibration-incomplete');
    assert.equal(manifest.scope, 'non-production-reference-calibration-experiment');
    assert.equal(manifest.reference_calibration_contract_version, 1);
    assert.equal(manifest.eligible_for_user_style_frame_review, false);
    assert.equal(manifest.user_reference_calibration_pass, false);
    assert.equal(manifest.grammar_promoted, false);
    assert.deepEqual(manifest.reference_calibration.shared_locked_reference_bundle, index.reference_calibration.shared_locked_reference_bundle);
    assert.deepEqual(manifest.reference_calibration.exact_reference_frame_bindings, []);
    assert.equal(manifest.reference_calibration.side_by_side, null);
    assert.equal(manifest.reference_calibration.reference_calibration_pass, false);
    assert.ok(Array.isArray(manifest.reference_transfer.unverified_reference_hypotheses));
    assert.deepEqual(manifest.reference_transfer.exact_reference_bindings, []);
    assert.equal(manifest.reference_transfer.side_by_side_artifact, null);
    assert.equal(manifest.reference_transfer.reference_calibration_pass, false);
    assert.ok(manifest.reference_transfer.blocking_reasons.length > 0);
    assert.deepEqual(manifest.exact_reference_bindings, []);
    assert.equal(manifest.side_by_side, null);
    assert.ok(manifest.blocking_reasons.length > 0);
    assert.equal(manifest.asset_origin_policy.version, 1);
    assert.equal(manifest.typography_surface_contract_version, 2);
    assert.equal(manifest.layout_contract_version, 2);
    assert.equal(manifest.layout_contract.asset_label_clearance_px, 32);
    assert.equal(manifest.layout_contract.asset_label_max_clearance_px, 72);
    assert.equal(manifest.layout_contract.same_row_asset_gap_px, 64);
    assert.equal(manifest.layout_contract.connector_clearance_px, 24);
    assert.equal(manifest.frames.length, 3);
    assert.deepEqual(manifest.frames.map((frame) => frame.frame_id), ['opening', 'evidence-or-change', 'final-summary']);
    assert.equal(manifest.production_authority, false);
    assert.equal(manifest.production_visible, false);
    assert.equal(manifest.user_style_frame_pass, false);
    assert.equal(manifest.user_cut_pass, false);
    assert.equal(manifest.rights_approved, false);
    assert.equal(manifest.omni_video_approved, false);
    assert.equal(manifest.parity_approved, false);
    assert.equal(manifest.motion_artifact_created, false);
    assert.ok(manifest.assets.some((asset) => asset.asset_class !== 'background'));
    for (const asset of manifest.assets) {
      assert.ok(asset.asset_class);
      assert.ok(asset.origin);
      assert.ok(asset.source_kind);
      assert.ok(asset.source_id);
      assert.ok(asset.license);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    }
    for (const frame of manifest.frames) {
      assert.equal(frame.dominant_focal_count, 1);
      assert.ok(frame.dominant_focal_asset_id);
      assert.equal(frame.dominant_focal_contract.asset_id, frame.dominant_focal_asset_id);
      assert.equal(frame.dominant_focal_contract.actual_visual_input, true);
      assert.match(frame.dominant_focal_contract.sha256, /^[a-f0-9]{64}$/);
      assert.equal(frame.future_stable_reading_hold.frame_count, 60);
      assert.equal(frame.future_stable_reading_hold.duration_seconds, 2);
      assert.deepEqual(frame.layer_roles.background, ['background']);
      assert.ok(frame.inputs.some((input) => input.asset_id === frame.dominant_focal_asset_id));
      assert.equal(frame.geometry.assets.length, frame.inputs.length);
      assert.equal(frame.geometry.overlap_audit_matches_declared_pixels, true);
      assert.equal(frame.geometry.text_overlap_audit_matches_declared_pixels, true);
      assert.deepEqual(frame.geometry.intentional_overlaps, []);
      for (const geometryAsset of frame.geometry.assets) {
        assert.ok(geometryAsset.baseline_group || geometryAsset.alignment_exception);
        assert.ok(geometryAsset.bbox.width > 0 && geometryAsset.bbox.height > 0);
      }
      for (const gap of frame.geometry.same_row_gap_audit) assert.ok(gap.gap_px >= gap.required_min_px, `${manifest.candidate_id}/${frame.frame_id}/${gap.asset_ids.join(':')} gap ${gap.gap_px}`);
      for (const connector of frame.geometry.connectors) {
        assert.equal(connector.clearance_required_px, 24);
        assert.equal(connector.crosses_non_target_asset, false);
        if (connector.measured_non_target_clearance_px !== null) assert.ok(connector.measured_non_target_clearance_px >= 24, `${manifest.candidate_id}/${frame.frame_id}/${connector.id} clearance ${connector.measured_non_target_clearance_px}`);
      }
      assert.equal(frame.geometry.unintended_text_asset_overlap_count, 0);
      assert.equal(frame.geometry.text_asset_collision_audit_matches_declared_pixels, true);
      assert.equal(frame.rendered_text_inventory.length + frame.embedded_surface_text_inventory.length, frame.visible_text_count);
      const assetById = new Map(frame.geometry.assets.map((asset) => [asset.id, asset]));
      const registryById = new Map(manifest.assets.map((asset) => [asset.asset_id, asset]));
      for (const geometryAsset of frame.geometry.assets) {
        const registered = registryById.get(geometryAsset.id);
        assert.ok(registered, `${manifest.candidate_id}/${frame.frame_id}/${geometryAsset.id} must bind to the manifest asset registry`);
        assert.equal(geometryAsset.asset_class, registered.asset_class, `${manifest.candidate_id}/${frame.frame_id}/${geometryAsset.id} asset_class drift`);
      }
      for (const visibleText of frame.rendered_text_inventory) {
        assert.ok(visibleText.id);
        assert.ok(['asset-label', 'surface-content', 'screen-chrome'].includes(visibleText.semantic_role));
        assert.equal(visibleText.rotation_deg, 0);
        if (visibleText.semantic_role === 'asset-label') {
          assert.ok(visibleText.target_id && assetById.has(visibleText.target_id));
          assert.equal(visibleText.placement, 'below-target-lane');
          assert.ok(visibleText.clearance_from_target_px >= 32 && visibleText.clearance_from_target_px <= 72, `${manifest.candidate_id}/${frame.frame_id}/${visibleText.value} clearance ${visibleText.clearance_from_target_px}`);
          assert.ok(visibleText.target_center_error_px <= 16);
          assert.equal(overlapArea(visibleText.bbox, assetById.get(visibleText.target_id).bbox), 0);
        }
        if (visibleText.semantic_role === 'surface-content') {
          assert.equal(visibleText.placement, 'on-surface');
          assert.ok(visibleText.target_id && assetById.has(visibleText.target_id));
          assert.ok(['document', 'chart'].includes(registryById.get(visibleText.target_id)?.asset_class), `${manifest.candidate_id}/${frame.frame_id}/${visibleText.value} surface-content target must be document/chart`);
          assert.equal(visibleText.within_target_surface, true);
          assert.ok(visibleText.surface_angle_error_deg <= 2);
        }
      }
      for (const [index, visibleText] of frame.rendered_text_inventory.entries()) {
        for (const other of frame.rendered_text_inventory.slice(index + 1)) {
          assert.equal(overlapArea(visibleText.bbox, other.bbox), 0, `${manifest.candidate_id}/${frame.frame_id} text overlap: ${visibleText.value} <> ${other.value}`);
        }
      }
      for (const embeddedText of frame.embedded_surface_text_inventory) {
        assert.equal(embeddedText.semantic_role, 'surface-content');
        assert.equal(embeddedText.placement, 'on-surface');
        assert.ok(embeddedText.target_id && assetById.has(embeddedText.target_id));
        assert.ok(['document', 'chart'].includes(registryById.get(embeddedText.target_id)?.asset_class), `${manifest.candidate_id}/${frame.frame_id}/${embeddedText.text_id} surface-content target must be document/chart`);
        assert.equal(embeddedText.within_target_surface, true);
        assert.ok(embeddedText.bbox.width > 0 && embeddedText.bbox.height > 0);
        assert.ok(embeddedText.surface_angle_error_deg <= 2);
      }
      for (const audit of frame.geometry.text_asset_audit) {
        const textEntry = [...frame.rendered_text_inventory, ...frame.embedded_surface_text_inventory].find((entry) => (entry.id ?? entry.text_id) === audit.text_id);
        const assetEntry = assetById.get(audit.asset_id);
        assert.ok(textEntry && assetEntry);
        assert.equal(audit.overlap_area_px, overlapArea(textEntry.bbox, assetEntry.bbox));
        if (audit.overlap_area_px > 0) {
          assert.equal(audit.allowed_overlap, true);
          assert.equal(textEntry.semantic_role, 'surface-content');
          assert.equal(textEntry.target_id, assetEntry.id);
        }
      }
      const wide = path.join(root, frame.output);
      const mobile = path.join(root, frame.mobile);
      assert.deepEqual(await sharp(wide).metadata().then(({width, height}) => ({width, height})), {width: 1920, height: 1080});
      assert.deepEqual(await sharp(mobile).metadata().then(({width, height}) => ({width, height})), {width: 360, height: 203});
      assert.equal(await hash(wide), frame.output_sha256);
      assert.equal(await hash(mobile), frame.mobile_sha256);
      for (const input of frame.inputs) {
        assert.match(input.sha256, /^[a-f0-9]{64}$/);
        assert.equal(await hash(path.join(root, input.path)), input.sha256);
      }
    }
    const contact = path.join(root, manifest.contact.path);
    assert.deepEqual(await sharp(contact).metadata().then(({width, height}) => ({width, height})), {width: 1920, height: 520});
    assert.equal(await hash(contact), manifest.contact.sha256);
    assert.equal(manifest.contact.status_label, 'REFERENCE CALIBRATION INCOMPLETE');
    assert.equal(manifest.contact.eligibility_label, 'NOT ELIGIBLE FOR STYLE PASS');
  }
  assert.equal(grammar.size, 10);
});

test('mutable wiki hash exception rejects normalized paths that escape wiki root', async () => {
  for (const escaped of [
    'wiki/../raw/inbox/vox-style-claude-remotion-reference.mp4',
    'wiki/../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json',
  ]) {
    assert.equal(isResolvedWikiPath(escaped), false, escaped);
    assert.ok((await stat(path.resolve(root, escaped))).isFile(), escaped);
  }
});

test('P1 factual, quantitative, focal, and source bindings are exact', async () => {
  const index = JSON.parse(await readFile(path.join(setRoot, 'sample-index.json'), 'utf8'));
  const manifests = new Map();
  for (const sample of index.samples) manifests.set(sample.number, JSON.parse(await readFile(path.join(root, sample.manifest), 'utf8')));

  const billAssets = [...manifests.values()].flatMap((manifest) => manifest.assets).filter((asset) => asset.asset_id === 'billFull');
  assert.ok(billAssets.length > 0);
  for (const bill of billAssets) assert.equal(bill.original_url, 'https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_N2W6S0L7W2J9D1I8A1B1I5I1G6H8F5');

  const sample04 = manifests.get('04');
  assert.deepEqual(sample04.frames.map((frame) => frame.dominant_focal_asset_id), ['law1972', 'law1972', 'law1972']);
  assert.ok(sample04.frames.every((frame) => frame.dominant_focal_contract.asset_class === 'document'));
  assert.doesNotMatch(sample04.frames.map((frame) => frame.viewer_takeaway).join(' '), /결과 통지/);
  assert.match(sample04.frames[1].statutory_claim.exact_excerpt, /받은 날부터 1개월 이내.*이행/);
  assert.match(sample04.frames[2].statutory_claim.exact_excerpt, /따로 정한 경우.*그 기간 내.*상당한 이유.*1개월의 범위/);
  assert.match(sample04.frames[2].statutory_claim.prohibited_inference, /1회로 단정하지 않음/);
  for (const frame of sample04.frames) {
    const photos = frame.geometry.assets.filter((asset) => asset.id === 'legalSigning');
    for (const photo of photos) for (const visibleText of frame.geometry.texts) assert.equal(overlapArea(photo.bbox, visibleText.bbox), 0, `sample04 ${frame.frame_id} text/photo overlap: ${visibleText.value}`);
  }

  const sample05 = manifests.get('05');
  for (const frame of sample05.frames) {
    const timeline = frame.geometry.connectors.find((entry) => entry.connector_kind === 'timeline-lane');
    assert.ok(timeline, `sample05 ${frame.frame_id} missing timeline lane geometry`);
    assert.deepEqual(timeline.endpoint_asset_ids, []);
    assert.ok(timeline.measured_non_target_clearance_px >= 24, `sample05 ${frame.frame_id} timeline clearance ${timeline.measured_non_target_clearance_px}`);
    for (const textEntry of frame.rendered_text_inventory.filter((entry) => /^(7\/29|7\/31|8\/4|8\/11)/.test(entry.value))) {
      for (const assetEntry of frame.geometry.assets) assert.ok(rectangleDistanceForTest(textEntry.bbox, assetEntry.bbox) >= 24, `sample05 ${frame.frame_id} timeline text ${textEntry.value} too close to ${assetEntry.id}`);
    }
  }

  const sample09 = manifests.get('09');
  assert.deepEqual(sample09.frames.map((frame) => frame.dominant_focal_asset_id), ['petition', 'petition', 'petition']);
  assert.ok(sample09.frames.every((frame) => frame.dominant_focal_contract.asset_class === 'document'));
  for (const frame of sample09.frames.slice(1)) {
    assert.deepEqual(frame.quantitative_encoding, {source_value: 51018, unit_value: 1000, whole_units: 51, remainder_people: 18, rendered_whole_unit_marks: 51, rendered_remainder_label: frame.frame_id === 'evidence-or-change' ? '나머지 18명' : '18명', implication_ceiling: 51018});
  }
  assert.doesNotMatch(sample09.frames.map((frame) => frame.rendered_text_inventory.map((text) => text.value).join(' ')).join(' '), /60,?000|60 × 1,000/);

  const sample10 = manifests.get('10');
  const sourceLock = path.join(root, 'raw', 'sources', 'episode-001-sh003-assembly-vod-2026-08-26.md');
  const sourceLockSha = await hash(sourceLock);
  assert.deepEqual(sample10.frames.map((frame) => frame.dominant_focal_asset_id), ['kimQuote', 'parkQuote', 'billFull']);
  assert.equal(sample10.frames[0].dominant_focal_contract.asset_class, 'document');
  assert.equal(sample10.frames[0].dominant_focal_contract.deterministic_explanatory_overlay, false);
  assert.equal(sample10.evidence_bindings.length, 2);
  for (const binding of sample10.evidence_bindings) {
    assert.equal(binding.source_lock_sha256, sourceLockSha);
    assert.equal(await hash(path.join(root, binding.source_lock_path)), sourceLockSha);
    assert.ok(binding.exact_quote && binding.timecode);
    assert.match(binding.rendered_surface_sha256, /^[a-f0-9]{64}$/);
  }
  for (const quoteId of ['kimQuote', 'parkQuote']) {
    const asset = sample10.assets.find((entry) => entry.asset_id === quoteId);
    assert.equal(asset.asset_class, 'document');
    assert.equal(asset.origin, 'source-derived');
    assert.equal(asset.source_kind, 'official-caption-exact-retype');
    assert.equal(asset.derivation_is_deterministic, true);
    assert.match(asset.derivation_recipe, /Deterministic exact retype/);
    assert.equal(asset.deterministic, undefined);
    assert.equal(asset.explanatory_overlay, undefined);
    assert.equal(asset.focal_allowed, undefined);
  }
  for (const personId of ['kim', 'park']) {
    const asset = sample10.assets.find((entry) => entry.asset_id === personId);
    assert.equal(asset.origin, 'source-derived');
    assert.equal(asset.source_kind, 'official-profile-cutout');
    assert.match(asset.source_sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.derivation, /deterministic transparent cutout/);
    assert.equal(await hash(path.join(root, asset.source_path)), asset.source_sha256);
    assert.equal(asset.derivation_script, 'video/scripts/derive-official-profile-cutouts.mjs');
  }

  const upstreamExpected = new Map([
    ['dossier', {sample: '03', raw: 'data/raw/pexels-media/102/photo/pexels-4792288.jpg'}],
    ['person', {sample: '03', raw: 'data/raw/pexels-media/110/photo/pexels-7845378.jpg'}],
    ['police', {sample: '03', raw: 'data/raw/wikimedia/106/photo/wikimedia-3243833.jpg'}],
    ['legalSigning', {sample: '04', raw: 'data/raw/pexels-media/104/photo/pexels-8730374.jpg'}]
  ]);
  for (const [assetId, expected] of upstreamExpected) {
    const asset = manifests.get(expected.sample).assets.find((entry) => entry.asset_id === assetId);
    assert.equal(asset.transformation_chain_complete, true);
    assert.equal(asset.raw_source_path, expected.raw);
    assert.equal(await hash(path.join(root, asset.raw_source_path)), asset.raw_source_sha256);
    assert.equal(await hash(path.join(root, asset.derived_source_path)), asset.derived_source_sha256);
    assert.equal(await hash(path.join(root, asset.upstream_manifest_path)), asset.upstream_manifest_sha256);
    assert.ok(asset.raw_source_url && asset.raw_source_license && asset.raw_source_attribution);
    assert.ok(asset.deterministic_transformation && asset.identity_restriction && asset.semantic_use_restriction);
  }
  const sample06Police = manifests.get('06').assets.find((entry) => entry.asset_id === 'police');
  assert.equal(sample06Police.transformation_chain_complete, true);
  assert.equal(await hash(path.join(root, sample06Police.raw_source_path)), sample06Police.raw_source_sha256);
  assert.equal(await hash(path.join(root, sample06Police.derived_source_path)), sample06Police.derived_source_sha256);
  assert.equal(await hash(path.join(root, sample06Police.upstream_manifest_path)), sample06Police.upstream_manifest_sha256);
  assert.equal(sample06Police.raw_source_attribution, 'Korean National Police Agency Building02.jpg by Gohsuke Takama, CC BY 2.0, via Wikimedia Commons');
  assert.equal(sample06Police.deterministic_transformation, 'deterministic high-resolution crop and PNG transcode; opaque photo card retained because clean alpha isolation is not reliable');
  assert.equal(sample06Police.identity_restriction, 'building is an identifiable real institution; preserve attribution and context');
  assert.equal(sample06Police.semantic_use_restriction, 'actual Korean National Police Agency building context only; do not label as another institution');
});

test('reference-calibration experiment root contains no motion or Omni video files', async () => {
  const pending = [setRoot];
  const forbidden = [];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, {withFileTypes: true})) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (/\.(mp4|webm|mov|mkv|avi)$/i.test(entry.name)) forbidden.push(file);
    }
  }
  assert.deepEqual(forbidden, []);
  assert.ok((await stat(path.join(setRoot, 'sample-index.json'))).size > 0);
});

test('calibration candidates keep declared text hypothesis and externalize QA chrome', async () => {
  const index = JSON.parse(await readFile(path.join(setRoot, 'sample-index.json'), 'utf8'));
  const forbidden = /REMOTION GRAMMAR|REFERENCE CALIBRATION INCOMPLETE|NOT ELIGIBLE FOR STYLE PASS|PENDING USER STYLE-FRAME REVIEW|opening|evidence-or-change|final-summary|source review|권리 검토|실사 영상 프레임|freeze\s*→\s*crop\s*→\s*focus|실제 움직임은 원본 영상이 담당/;
  const allowedStructuredValues = new Set(['1개월', '이행', '별도 기간', '상당한 이유', '1개월 범위', '7/29 제안', '7/31 의결', '8/4 공포', '7/29', '7/31', '8/4', '8/11', '51 × 1,000명', '+ 나머지 18명', '51,018명', '51 × 1,000명 + 18명']);
  for (const sample of index.samples) {
    const manifest = JSON.parse(await readFile(path.join(root, sample.manifest), 'utf8'));
    assert.equal(manifest.qa_metadata.externalized_from_production_frames, true);
    assert.ok(manifest.qa_metadata.allowed_locations.includes('per-sample contact.png'));
    assert.ok(manifest.qa_metadata.allowed_locations.includes('remotion-motion-grammar-v01-review-board.png'));
    for (const frame of manifest.frames) {
      assert.ok(frame.production_overlay_svg_source !== undefined);
      assert.doesNotMatch(frame.production_overlay_svg_source, forbidden, `${sample.number}/${frame.frame_id} leaked QA/editorial chrome`);
      assert.ok(frame.deliberate_text_group_count <= 2, `${sample.number}/${frame.frame_id} has more than two deliberate text groups`);
      assert.deepEqual(frame.deliberate_text_groups, [...new Set(frame.rendered_text_inventory.map((entry) => entry.text_group_id))]);
      for (const entry of frame.rendered_text_inventory) {
        assert.ok(['asset-label', 'surface-content', 'screen-chrome'].includes(entry.semantic_role));
        if (entry.semantic_role === 'screen-chrome') assert.ok(allowedStructuredValues.has(entry.value), `${sample.number}/${frame.frame_id} has prose screen text: ${entry.value}`);
        if (entry.semantic_role === 'asset-label') {
          assert.ok(entry.value.length <= 8, `${sample.number}/${frame.frame_id} has a sentence-like asset label: ${entry.value}`);
          assert.ok(entry.contrast_ratio >= 4.5, `${sample.number}/${frame.frame_id} asset label contrast is too low`);
        }
      }
      for (const entry of frame.embedded_surface_text_inventory) assert.equal(entry.semantic_role, 'surface-content');
  }
  assert.ok(manifest.qa_metadata.strings.some((value) => value.includes('REMOTION GRAMMAR')));
  }
});

test('S08 remains pixel-only and S10 uses unique, exact, mobile-readable quote surfaces', async () => {
  const index = JSON.parse(await readFile(path.join(setRoot, 'sample-index.json'), 'utf8'));
  const manifests = new Map();
  for (const sample of index.samples) manifests.set(sample.number, JSON.parse(await readFile(path.join(root, sample.manifest), 'utf8')));
  const sample08 = manifests.get('08');
  assert.ok(sample08.frames.every((frame) => frame.rendered_text_inventory.length === 0), 'S08 must have no external production label');
  assert.ok(sample08.frames.every((frame) => frame.embedded_surface_text_inventory.length === 0), 'S08 must have no embedded production text');

  const sample10 = manifests.get('10');
  const personLabels = sample10.frames.flatMap((frame) => frame.rendered_text_inventory.filter((entry) => entry.semantic_role === 'asset-label' && ['kim', 'park'].includes(entry.target_id)));
  assert.deepEqual(personLabels, [], 'S10 person names must not be duplicated beneath portraits when quote cards already identify the speaker');
  assert.deepEqual(sample10.frames[0].embedded_surface_text_inventory.filter((entry) => entry.text_id === 'kimQuote-speaker').map((entry) => entry.exact_text ?? '김승원 의원'), ['김승원 의원']);
  assert.deepEqual(sample10.frames[1].embedded_surface_text_inventory.filter((entry) => entry.text_id === 'parkQuote-speaker').map((entry) => entry.exact_text ?? '박형수 의원'), ['박형수 의원']);
  for (const assetId of ['kimQuote', 'parkQuote']) {
    const asset = sample10.assets.find((entry) => entry.asset_id === assetId);
    assert.ok(asset.full_quote && asset.display_excerpt);
    assert.equal(asset.full_quote, asset.exact_quote);
    assert.equal(asset.full_quote.includes(asset.display_excerpt), true);
    assert.ok(['탄탄한 보완제도를 마련했습니다.', '인권보호를 위한 검찰의 책무였습니다.'].includes(asset.display_excerpt), `${assetId} display excerpt is not an approved complete exact excerpt`);
    assert.ok(asset.display_excerpt_lines.length <= 2);
    assert.equal(asset.display_excerpt_is_exact_substring, true);
    const frame = sample10.frames.find((entry) => entry.dominant_focal_asset_id === assetId);
    const quoteSurface = frame.embedded_surface_text_inventory.find((entry) => entry.text_id === `${assetId}-quote`);
    assert.ok(quoteSurface);
    assert.equal(quoteSurface.exact_text, asset.display_excerpt);
    assert.ok(quoteSurface.effective_font_px_1080 >= 72, `${assetId} effective quote font is below 72px`);
    assert.equal(quoteSurface.line_count, asset.display_excerpt_lines.length);
    assert.equal(frame.mobile_readability.status, 'pending-human-review');
    assert.equal(frame.mobile_readability.quote.display_excerpt, asset.display_excerpt);
    assert.equal(frame.mobile_readability.quote.exact_substring, true);
    assert.ok(frame.mobile_readability.quote.effective_font_px_1080 >= 72);
    assert.equal(frame.mobile_readability.quote.line_count <= 2, true);
  }
});
