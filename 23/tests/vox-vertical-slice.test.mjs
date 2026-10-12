import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {validateCanonicalVoxVerticalSlice, validateSliceAssetLineage, validateVoxVerticalSlice} from '../video/scripts/validate-episode-001-vox-vertical-slice.mjs';
import {validateVisualContractV3} from '../video/scripts/visual-contract-v3.mjs';

const loadLineageFixture = async () => {
  const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
  const bytes = async (file) => readFile(file);
  const contract = await read('video/contracts/episode-001-vox-vertical-slice-v1.json');
  return {
    lineage: structuredClone(contract.asset_lineage),
    schema: await read(contract.asset_lineage.schema.path),
    sourceReview: await read(contract.asset_lineage.source_review.path),
    spec: await read('video/episodes/episode-001/episode-spec.json'),
    hashes: {
      schema: createHash('sha256').update(await bytes(contract.asset_lineage.schema.path)).digest('hex'),
      sourceReview: createHash('sha256').update(await bytes(contract.asset_lineage.source_review.path)).digest('hex'),
    },
  };
};

test('SH003/SH016/SH024 vertical slice is canonical but cannot promote or register', async () => {
  const result = await validateCanonicalVoxVerticalSlice();
  assert.deepEqual(result.failures, []);
});

test('vertical slice fails closed if a blocked source is presented as ready', async () => {
  const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
  const contract = await read('video/contracts/episode-001-vox-vertical-slice-v1.json');
  const spec = await read('video/episodes/episode-001/episode-spec.json');
  const generated = await read('video/episodes/episode-001/generated/manifest-contracts.json');
  const grammar = await read('video/episodes/episode-001/reference-grammar-contract.json');
  const state = await read('video/episodes/episode-001/production-state.json');
  const catalog = await read('video/episodes/episode-001/generated/render-catalog.json');
  contract.cuts[2].render_ready = true;
  const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
  const failures = validateVoxVerticalSlice({contract, spec, generated, grammar, state, catalog, hashes: {
    spec: await sha(contract.source_spec.path), generated: await sha(contract.generated_manifest_contracts.path), grammar: await sha(contract.reference_grammar_contract.path),
  }}).join('\n');
  assert.match(failures, /source-blocked cut cannot select grammar or claim render readiness/u);
});

test('historical slice lineage keeps captured pages evidence-only but is rejected against the current spec', async () => {
  const fixture = await loadLineageFixture();
  const failures = validateSliceAssetLineage(fixture).join('\n');
  assert.match(failures, /asset lineage source-review hash drift/u);
  assert.match(failures, /does not match an exact episode-spec beat\/action target/u);
  assert.equal(fixture.lineage.source_candidates.length, 15);
  const source = fixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-195');
  const nativeTitle = fixture.lineage.planned_derivatives.find((derivative) => derivative.derivative_id === 'assembly-bill-card');
  assert.equal(source.candidate_kind, 'captured-page');
  assert.equal(source.preserved_copy.relationship, 'byte-identical-copy-of-registry-capture');
  assert.deepEqual(source.slice_source_surfaces, []);
  assert.equal(nativeTitle.source_status, 'registered-candidate');
  assert.equal(nativeTitle.materialized, false);
  assert.equal(nativeTitle.render_surface.kind, 'native-dom-vector');
  assert.equal(nativeTitle.render_surface.raster_beneath, false);
  assert.equal(nativeTitle.output_path, null);
});

test('slice asset lineage rejects source hash drift and premature recipe or output claims', async () => {
  const sourceFixture = await loadLineageFixture();
  sourceFixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-195').preserved_copy.sha256 = '0'.repeat(64);
  assert.match(validateSliceAssetLineage(sourceFixture).join('\n'), /byte-preserved copy path\/hash\/relationship mismatch|must be byte-identical/u);

  const recipeFixture = await loadLineageFixture();
  recipeFixture.lineage.planned_derivatives.find((derivative) => derivative.derivative_id === 'assembly-bill-card').recipe_sha256 = '0'.repeat(64);
  assert.match(validateSliceAssetLineage(recipeFixture).join('\n'), /unexecuted derivative must keep recipe\/output path\/hash null/u);

  const outputFixture = await loadLineageFixture();
  outputFixture.lineage.planned_derivatives.find((derivative) => derivative.derivative_id === 'assembly-bill-card').output_path = 'video/public/fake.png';
  assert.match(validateSliceAssetLineage(outputFixture).join('\n'), /unexecuted derivative must keep recipe\/output path\/hash null/u);
});

test('slice asset lineage rejects any rendered-text capture surface binding', async () => {
  const fixture = await loadLineageFixture();
  const source = fixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-1972');
  source.slice_source_surfaces.push({shot_id:'SH024',surface_id:'forbidden-capture-pixel-target'});
  const failures = validateSliceAssetLineage(fixture).join('\n');
  assert.match(failures, /evidence-only and cannot bind a slice source surface/u);
});

test('slice asset lineage rejects motion targets not present in the exact episode beat/action', async () => {
  const fixture = await loadLineageFixture();
  fixture.lineage.planned_derivatives.find((derivative) => derivative.derivative_id === 'assembly-speaker-photo-kim').motion_target_binding.target_component_id = 'flattened-screenshot-internal-person';
  assert.match(validateSliceAssetLineage(fixture).join('\n'), /motion target does not match an exact episode-spec beat\/action target/u);
});

test('slice asset lineage rejects captured pages relabeled as original documents, assets, or approvals', async () => {
  const kindFixture = await loadLineageFixture();
  kindFixture.lineage.source_candidates[0].candidate_kind = 'original-document';
  assert.match(validateSliceAssetLineage(kindFixture).join('\n'), /captured-page candidate/u);

  const assetFixture = await loadLineageFixture();
  assetFixture.lineage.source_candidates[0].asset_id = 'fake-production-asset';
  assert.match(validateSliceAssetLineage(assetFixture).join('\n'), /cannot masquerade as a production asset/u);

  const approvalFixture = await loadLineageFixture();
  approvalFixture.lineage.source_candidates[0].human_approval = true;
  approvalFixture.lineage.source_candidates[0].materialized = true;
  assert.match(validateSliceAssetLineage(approvalFixture).join('\n'), /must remain unapproved, rights-unapproved and unmaterialized/u);
});

test('SH016 and SH024 keep captures off-canvas and translate source meaning into independent text-free imagegen assets', async () => {
  const fixture = await loadLineageFixture();
  const law195 = fixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-195');
  const law1972 = fixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-1972');
  assert.deepEqual(law195.slice_source_surfaces, []);
  assert.deepEqual(law1972.slice_source_surfaces, []);
  assert.deepEqual(fixture.lineage.planned_derivatives.filter((item) => item.shot_id === 'SH016').map((item) => item.derivative_id), []);
  const ids = fixture.lineage.imagegen_asset_candidates.map((item) => item.candidate_id).sort();
  assert.deepEqual(ids, [
    'sh016-case-record-imagegen',
    'sh016-evidence-handoff-imagegen',
    'sh016-prosecutorial-review-imagegen',
    'sh024-request-received-imagegen',
    'sh024-result-notification-imagegen',
  ]);
  for (const item of fixture.lineage.imagegen_asset_candidates) {
    assert.equal(item.evidence, false);
    assert.equal(item.content_constraints.legible_text, false);
    assert.ok(item.semantic_summary.length > 0);
    assert.ok(item.visual_translation.length > 0);
    assert.equal(item.prompt_contract.summary_must_not_be_rendered_as_text, true);
  }
  const timeline = fixture.lineage.planned_derivatives.find((item) => item.derivative_id === 'one-month-timeline');
  const anchor = fixture.lineage.planned_derivatives.find((item) => item.derivative_id === 'one-month-timeline-anchor');
  assert.equal(anchor.origin, 'deterministic-overlay');
  assert.equal(anchor.motion_target_binding.target_component_id, 'one-month-timeline-anchor');
  assert.equal(anchor.motion_target_binding.status, 'not-motion-target');
  assert.equal(anchor.motion_target_binding.action_id, null);
  assert.equal(anchor.motion_target_binding.independent_motion, false);
  assert.equal(timeline.origin, 'deterministic-overlay');
  assert.equal(timeline.motion_target_binding.target_component_id, 'one-month-timeline-timeline');
  assert.equal(timeline.motion_target_binding.action_id, 'sh024-one-month-timeline-reveal');
});

test('SH024 rejects stroke-draw grammar claims and animation on its static anchor', async () => {
  const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
  const contract = await read('video/contracts/episode-001-vox-vertical-slice-v1.json');
  const spec = await read('video/episodes/episode-001/episode-spec.json');
  const generated = await read('video/episodes/episode-001/generated/manifest-contracts.json');
  const grammar = await read('video/episodes/episode-001/reference-grammar-contract.json');
  const state = await read('video/episodes/episode-001/production-state.json');
  const catalog = await read('video/episodes/episode-001/generated/render-catalog.json');
  const sourceReview = await read('video/qa/source-review/episode-001-v01/manifest.json');
  const lineageSchema = await read('video/contracts/source-asset-lineage-v1.schema.json');
  const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
  const hashes = {spec:await sha(contract.source_spec.path), generated:await sha(contract.generated_manifest_contracts.path), grammar:await sha(contract.reference_grammar_contract.path), sourceReview:await sha(contract.asset_lineage.source_review.path), schema:await sha(contract.asset_lineage.schema.path)};

  contract.cuts.find((cut) => cut.shot_id === 'SH024').reference_motion_plan.static_non_reference_support.animated = true;
  assert.match(validateVoxVerticalSlice({contract, spec, generated, grammar, state, catalog, sourceReview, lineageSchema, hashes}).join('\n'), /static non-reference deterministic support/u);

  const strokeFixture = await read('video/contracts/episode-001-vox-vertical-slice-v1.json');
  strokeFixture.cuts.find((cut) => cut.shot_id === 'SH024').reference_motion_plan.conditional_applicable_binding.runtime_operator_id = 'svg.stroke-draw@1';
  assert.match(validateVoxVerticalSlice({contract:strokeFixture, spec, generated, grammar, state, catalog, sourceReview, lineageSchema, hashes}).join('\n'), /cannot claim SVG stroke draw|only conditionally map/u);
});

test('SH024 rejects any return to a capture-pixel source surface', async () => {
  const fixture = await loadLineageFixture();
  const source = fixture.lineage.source_candidates.find((candidate) => candidate.source_id === 'LAW-1972');
  source.slice_source_surfaces.push({shot_id:'SH024',surface_id:'sh024-law-source-surface',motion_target:true});
  assert.match(validateSliceAssetLineage(fixture).join('\n'), /evidence-only and cannot bind/u);
});

test('lineage rejects raster text composites and unsafe imagegen candidates', async () => {
  const raster = await loadLineageFixture();
  const quote = raster.lineage.planned_derivatives.find((item) => item.derivative_id === 'assembly-bill-card');
  quote.execution_status = 'executed'; quote.recipe = {type:'retype-on-png'}; quote.recipe_sha256 = '1'.repeat(64);
  quote.output_path = 'video/public/quote.png'; quote.output_sha256 = '2'.repeat(64); quote.materialized = true;
  assert.match(validateSliceAssetLineage(raster).join('\n'), /raster text composite output is permanently forbidden/u);

  const unsafe = await loadLineageFixture();
  unsafe.lineage.imagegen_asset_candidates[0].content_constraints.legible_text = true;
  unsafe.lineage.imagegen_asset_candidates[0].asset_class = 'person';
  assert.match(validateSliceAssetLineage(unsafe).join('\n'), /must forbid text|cannot use this non-person imagegen route/u);

  const fakeReference = await loadLineageFixture();
  fakeReference.lineage.imagegen_asset_candidates[0].source_references[0].sha256 = '0'.repeat(64);
  assert.match(validateSliceAssetLineage(fakeReference).join('\n'), /source-reference path\/hash/u);

  const inconsistentAlpha = await loadLineageFixture();
  inconsistentAlpha.lineage.imagegen_asset_candidates[0].output_requirements.independent_cutout_required = true;
  assert.match(validateSliceAssetLineage(inconsistentAlpha).join('\n'), /required iff an independent cutout treatment/u);

  const pixelText = await loadLineageFixture();
  pixelText.lineage.imagegen_asset_candidates[0].prompt_contract.summary_must_not_be_rendered_as_text = false;
  assert.match(validateSliceAssetLineage(pixelText).join('\n'), /semantic summary, visual translation and exact prompt/u);

  const rejectedAudit = await loadLineageFixture();
  rejectedAudit.lineage.imagegen_asset_candidates[0].failed_generation_audits.push({attempt_id:'rgb-no-alpha-v01',status:'rejected',decoded_has_alpha:false,rejection_reasons:['decoded PNG is RGB with no alpha channel'],registered:false,production_visible:false,motion_target_allowed:false});
  assert.doesNotMatch(validateSliceAssetLineage(rejectedAudit).join('\n'), /failed imagegen attempts/u);
});

test('V3 grammar transfer binds an approved grammar to the exact runtime action and target', async () => {
  const manifest = await (async () => JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json', 'utf8')))();
  const grammarBytes = await readFile('video/episodes/episode-001/reference-grammar-contract.json');
  const grammar = JSON.parse(grammarBytes);
  const action = manifest.motion_actions.find((item) => item.operator_id === 'transform.spring@1');
  const beat = manifest.visual_beats.find((item) => item.component_ids.includes(action.target_component_id));
  const component = manifest.visual_components.find((item) => item.component_id === action.target_component_id);
  const asset = manifest.assets.find((item) => item.asset_id === component.asset_id);
  manifest.reference_grammar_transfer = {
    version: 1,
    contract_path: 'video/episodes/episode-001/reference-grammar-contract.json',
    contract_sha256: createHash('sha256').update(grammarBytes).digest('hex'),
    bindings: [{
      category: 'motion_operator', grammar_id: 'independent-target-translate', beat_id: beat.beat_id,
      target_component_id: action.target_component_id, action_id: action.action_id, runtime_operator_id: action.operator_id,
      episode_source_ids: ['TEST-SOURCE-SH003'],
      episode_input_bindings: [{target_component_id: action.target_component_id, input_path: `video/public/assets/episode-001-work-v01/cuts/SH003/${asset.file}`, input_sha256: asset.sha256}],
      action_frame_range: {start_frame: action.start_frame, end_frame: action.end_frame},
      reading_hold: {start_frame: beat.reading_hold.start_frame, end_frame: beat.reading_hold.end_frame, minimum_frames: 60},
      observable_delta: 'target translates into its reviewed resting position', status: 'blocked-source-materialization',
    }],
    unmapped_visual_grammar: [], novel_visual_grammar: [], production_authority: false,
  };
  const options = {referenceGrammarContract: grammar, referenceGrammarContractSha256: manifest.reference_grammar_transfer.contract_sha256};
  assert.deepEqual(validateVisualContractV3(manifest, options).filter((failure) => /reference_grammar_transfer|runtime transfer|grammar_id/u.test(failure)), []);
  manifest.reference_grammar_transfer.bindings[0].runtime_operator_id = 'chart.reveal@1';
  assert.match(validateVisualContractV3(manifest, options).join('\n'), /no validated mapping|does not match/u);
});

test('V3 grammar transfer fails closed without exact input hashes, action frames, and 60-frame hold', async () => {
  const manifest = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json', 'utf8'));
  const grammarBytes = await readFile('video/episodes/episode-001/reference-grammar-contract.json');
  const grammar = JSON.parse(grammarBytes);
  const action = manifest.motion_actions.find((item) => item.operator_id === 'transform.spring@1');
  const beat = manifest.visual_beats.find((item) => item.component_ids.includes(action.target_component_id));
  manifest.reference_grammar_transfer = {
    version: 1,
    contract_path: 'video/episodes/episode-001/reference-grammar-contract.json',
    contract_sha256: createHash('sha256').update(grammarBytes).digest('hex'),
    bindings: [{category: 'motion_operator', grammar_id: 'independent-target-translate', beat_id: beat.beat_id, target_component_id: action.target_component_id, action_id: action.action_id, runtime_operator_id: action.operator_id, episode_source_ids: [], episode_input_bindings: [], action_frame_range: {start_frame: 0, end_frame: 1}, reading_hold: {start_frame: 0, end_frame: 1, minimum_frames: 60}, observable_delta: 'translate', status: 'blocked-source-materialization'}],
    unmapped_visual_grammar: [], novel_visual_grammar: [], production_authority: false,
  };
  const failures = validateVisualContractV3(manifest, {referenceGrammarContract: grammar, referenceGrammarContractSha256: manifest.reference_grammar_transfer.contract_sha256}).join('\n');
  assert.match(failures, /episode_source_ids/u);
  assert.match(failures, /episode_input_bindings/u);
  assert.match(failures, /action_frame_range/u);
  assert.match(failures, /reading_hold/u);
});

test('current SH031 transition-clause route binds a generic document/calendar layer and exact law evidence without assuming a chart', async () => {
  const spec = JSON.parse(await readFile('video/episodes/episode-001/episode-spec.json', 'utf8'));
  const cut = spec.cuts.find((item) => item.shot_id === 'SH031');
  assert.equal(cut.production_decision.purpose, 'explanation');
  assert.equal(cut.production_decision.mode, 'remotion');
  assert.ok(cut.production_decision.asset_search_briefs.some((brief) => brief.subject_family === 'generic-evidence-object' && brief.role === 'independent-layer' && brief.place_context === null));
  assert.ok(cut.production_decision.asset_search_briefs.some((brief) => brief.specificity === 'exact-source' && brief.role === 'off-canvas-evidence'));
  assert.ok(cut.visual_beats.every((beat) => beat.planned_operator === null && beat.preview_status === 'blocked-assets-pending'));
});
