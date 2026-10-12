import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import sharp from 'sharp';
import {validateReview} from './validate-motion-reverse-engineering-review-v01.mjs';
import {assertV01SupersededMarker, CATEGORY_ORDER, GRAMMAR_SPECS, HIDDEN_AUTHORING_UNCERTAINTIES, PENDING_AUTHORING_IDS, REVIEW, SAMPLE_GRAMMAR, SUPERSESSION} from './apply-reference-calibration-approval-v01.mjs';

const canonicalRoot = process.cwd();
const canonical = Object.freeze({
  approvalPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-calibration-approval.json',
  grammarApprovalPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-grammar-approval.json',
  grammarContractPath: 'video/episodes/episode-001/reference-grammar-contract.json',
  grammarBindingPath: 'video/episodes/episode-001/reference-grammar-binding.json',
  styleGatesPath: 'video/episodes/episode-001/reference-style-gates.json',
  statePath: 'video/episodes/episode-001/production-state.json',
  blueprintPath: 'video/episodes/episode-001/generated/reference-cut-blueprint.json',
  reviewManifestPath: REVIEW.manifestPath,
  supersessionPath: SUPERSESSION.path,
});

const shaBytes = (value) => createHash('sha256').update(value).digest('hex');
const sortInputs = (inputs) => [...inputs].sort((a, b) => `${a.kind}|${a.path}|${a.sha256}`.localeCompare(`${b.kind}|${b.path}|${b.sha256}`));
const inputBundle = (inputs) => shaBytes(Buffer.from(sortInputs(inputs).map((item) => `${item.kind}|${item.path}|${item.sha256}`).join('\n')));
const grammarEvidenceHash = (categories) => shaBytes(Buffer.from(CATEGORY_ORDER.flatMap((category) => (categories[category] ?? []).map((entry) => [
  category,
  entry.grammar_id,
  entry.source_video_path,
  entry.source_video_sha256,
  entry.timecode_range?.start_frame,
  entry.timecode_range?.end_frame,
  entry.reference_still?.path,
  entry.reference_still?.sha256,
  entry.reference_still?.source_frame,
  entry.approved_review_binding?.analysis_path,
  entry.approved_review_binding?.analysis_sha256,
].join('|'))).join('\n')));
const fileExists = async (value) => { try { return (await stat(value)).isFile(); } catch { return false; } };

export async function validateReferenceCalibrationApproval(options = {}) {
  const root = options.root ?? canonicalRoot;
  const files = Object.fromEntries(Object.entries(canonical).map(([key, value]) => [key, path.resolve(root, options[key] ?? value)]));
  if (options.auditHistorical !== true) throw new Error('the ten-sample v01 approval is historical-only and cannot validate current authority; use auditHistorical: true for a QA-only historical audit');
  try {
    const supersession = JSON.parse(await readFile(files.supersessionPath, 'utf8'));
    assertV01SupersededMarker(supersession);
  } catch (error) {
    if (error?.message?.includes('historical-only')) throw error;
    throw new Error('the ten-sample v01 approval is historical-only; supersession marker is missing or invalid');
  }
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  const readJson = async (file, label) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { errors.push(`${label}: invalid or missing JSON`); return null; } };
  const shaFile = async (file) => shaBytes(await readFile(file));
  const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
  const checkRecord = async (record, label) => {
    must(record && typeof record.path === 'string' && /^[a-f0-9]{64}$/u.test(record.sha256 ?? ''), `${label}: path and SHA-256 are required`);
    if (!record?.path) return;
    const file = path.resolve(root, record.path);
    must(await fileExists(file), `${label}: file missing`);
    if (await fileExists(file)) must(await shaFile(file) === record.sha256, `${label}: hash drift`);
  };

  const [approval, grammarApproval, grammar, binding, gates, state, blueprint, review] = await Promise.all([
    readJson(files.approvalPath, 'calibration approval marker'),
    readJson(files.grammarApprovalPath, 'grammar approval marker'),
    readJson(files.grammarContractPath, 'grammar contract'),
    readJson(files.grammarBindingPath, 'grammar binding'),
    readJson(files.styleGatesPath, 'reference style gates'),
    readJson(files.statePath, 'production state'),
    readJson(files.blueprintPath, 'reference cut blueprint'),
    readJson(files.reviewManifestPath, 'review manifest'),
  ]);
  if ([approval, grammarApproval, grammar, binding, gates, state, blueprint, review].some((value) => !value)) throw new Error(`reference calibration approval invalid:\n- ${errors.join('\n- ')}`);

  must(await shaFile(files.reviewManifestPath) === REVIEW.manifestSha256, 'review manifest hash drift');
  must(review.artifact_bundle_sha256 === REVIEW.inputBundleSha256 && inputBundle(review.inputs ?? []) === REVIEW.inputBundleSha256, 'review input bundle drift');
  must(review.board?.path === REVIEW.boardPath && review.board?.sha256 === REVIEW.boardSha256, 'review board binding drift');
  must(review.reel?.path === REVIEW.reelPath && review.reel?.sha256 === REVIEW.reelSha256, 'review reel binding drift');
  for (const record of [{path: REVIEW.boardPath, sha256: REVIEW.boardSha256}, {path: REVIEW.reelPath, sha256: REVIEW.reelSha256}]) await checkRecord(record, record.path);
  if (options.verifyReviewPackage !== false) {
    try { await validateReview(); } catch (error) { errors.push(`review package validator: ${error.message}`); }
  }

  const approvalSha = await shaFile(files.approvalPath);
  const grammarApprovalSha = await shaFile(files.grammarApprovalPath);
  must(approval.status === 'approved-reference-calibration' && approval.reviewer === 'user' && approval.approved_at === '2026-09-02', 'approval marker requires reviewer=user and the recorded approval date');
  must(isDeepStrictEqual(approval.reviewed_package, {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256, package_id: review.package_id, input_bundle_sha256: REVIEW.inputBundleSha256}), 'approval marker reviewed_package drift');
  must(approval.approved_inputs_sha256 === REVIEW.inputBundleSha256 && inputBundle(approval.approved_inputs ?? []) === REVIEW.inputBundleSha256 && isDeepStrictEqual(sortInputs(approval.approved_inputs ?? []), sortInputs(review.inputs ?? [])), 'approval marker input inventory is stale or incomplete');
  must(isDeepStrictEqual(approval.reviewed_artifacts, [{kind: 'review-board', path: REVIEW.boardPath, sha256: REVIEW.boardSha256}, {kind: 'review-reel', path: REVIEW.reelPath, sha256: REVIEW.reelSha256}]), 'approval marker board/reel artifact drift');
  const expectedDecisions = (review.samples ?? []).map((sample, index) => ({sample_number: index + 1, sample_id: sample.sample_id, decision: 'PASS', side_by_side_path: sample.side_by_side_path, side_by_side_sha256: review.inputs.find((item) => item.path === sample.side_by_side_path)?.sha256, contact_path: sample.contact_path, contact_sha256: review.inputs.find((item) => item.path === sample.contact_path)?.sha256}));
  must(expectedDecisions.length === 10 && isDeepStrictEqual(approval.sample_decisions, expectedDecisions), 'sample decisions must be ordered 1..10 with exact PASS artifact bindings');

  const specById = new Map(GRAMMAR_SPECS.map((spec) => [spec.grammar_id, spec]));
  const expectedBindings = [];
  for (let number = 1; number <= 10; number += 1) {
    const sample = review.samples[number - 1];
    must(sample?.sample_number === number, `review sample ${number}: order drift`);
    for (const grammarId of SAMPLE_GRAMMAR[number]) {
      const spec = specById.get(grammarId);
      expectedBindings.push({sample_number: number, sample_id: sample.sample_id, category: spec.category, grammar_id: grammarId, target_type: spec.category === 'motion_operator' ? 'action' : spec.category === 'transition_operator' ? 'transition' : 'component', target_id: `${sample.sample_id}/${grammarId}`, analysis_path: sample.analysis_path, evidence_frames: sample.exact_events.map((event) => ({source_frame: event.source_frame, probe_frame: event.probe_frame, label: event.label}))});
    }
  }
  const expectedSubset = [...new Set(expectedBindings.map((item) => item.grammar_id))].sort();
  must(isDeepStrictEqual(approval.reference_grammar?.categories, CATEGORY_ORDER), 'approval marker must declare exactly seven ordered grammar categories');
  must(isDeepStrictEqual(approval.reference_grammar?.bindings, expectedBindings), 'approval marker grammar bindings drift or contain overpromotion');
  must(isDeepStrictEqual(approval.reference_grammar?.approved_subset, expectedSubset), 'approval marker approved_subset must exactly equal unique binding IDs');
  must(isDeepStrictEqual(approval.reference_grammar?.unmapped_visual_grammar, []) && isDeepStrictEqual(approval.reference_grammar?.novel_visual_grammar, []), 'approval marker cannot contain unmapped or novel grammar');
  must(isDeepStrictEqual(approval.hidden_authoring_uncertainties, HIDDEN_AUTHORING_UNCERTAINTIES), 'approval marker hidden-authoring uncertainties must equal the frozen complete array');
  must(isDeepStrictEqual(approval.non_grants, {style_frame_pass: false, cut_pass: false, rights_approval: false, omni_video_generation: false, production_authority: false, active_cut_root: null, stage_advance: false}), 'approval scope must not unlock downstream production gates');

  must(grammar.status === 'approved-human-grammar' && grammar.reference_grammar_contract_version === 1, 'grammar contract must be approved-human-grammar v1');
  must(isDeepStrictEqual(Object.keys(grammar.categories ?? {}), CATEGORY_ORDER), 'grammar contract must contain exactly seven ordered categories');
  for (const category of CATEGORY_ORDER) {
    const expectedIds = GRAMMAR_SPECS.filter((spec) => spec.category === category).map((spec) => spec.grammar_id);
    const actualIds = (grammar.categories?.[category] ?? []).map((entry) => entry.grammar_id);
    must(isDeepStrictEqual(actualIds, expectedIds), `grammar category ${category}: active IDs drift or overpromotion`);
    for (const entry of grammar.categories?.[category] ?? []) {
      const spec = specById.get(entry.grammar_id);
      if (!spec) { errors.push(`${entry.grammar_id}: active grammar is not in the approved review binding allowlist`); continue; }
      const sample = review.samples[spec.sample - 1];
      must(entry.approved_review_binding?.sample_number === spec.sample && entry.approved_review_binding?.sample_id === sample.sample_id, `${entry.grammar_id}: approved sample binding drift`);
      must(entry.timecode_range?.start_frame === spec.start && entry.timecode_range?.end_frame === spec.end, `${entry.grammar_id}: evidence frame range drift`);
      must(entry.reference_still?.source_frame === spec.end && sample.evidence_paths.includes(entry.reference_still?.path), `${entry.grammar_id}: representative evidence still is not in the approved review inventory`);
      await checkRecord(entry.reference_still, `${entry.grammar_id} reference still`);
      await checkRecord({path: entry.source_video_path, sha256: entry.source_video_sha256}, `${entry.grammar_id} source video`);
      await checkRecord({path: entry.approved_review_binding?.analysis_path, sha256: entry.approved_review_binding?.analysis_sha256}, `${entry.grammar_id} analysis`);
      await checkRecord(entry.approved_review_binding?.start_evidence, `${entry.grammar_id} start evidence`);
      await checkRecord(entry.approved_review_binding?.end_evidence, `${entry.grammar_id} end evidence`);
      if (entry.reference_still?.path && await fileExists(path.resolve(root, entry.reference_still.path))) {
        const metadata = await sharp(path.resolve(root, entry.reference_still.path)).metadata();
        must(metadata.width === entry.reference_still.width && metadata.height === entry.reference_still.height, `${entry.grammar_id}: evidence dimensions drift`);
      }
      must(isDeepStrictEqual(entry.human_approval, {status: 'approved', approved: true, marker: {path: rel(files.grammarApprovalPath), sha256: grammarApprovalSha}}), `${entry.grammar_id}: human approval marker drift`);
    }
  }
  must(isDeepStrictEqual(grammar.bindings, expectedBindings), 'grammar contract bindings drift or contain new grammar');
  must(isDeepStrictEqual(grammar.approved_subset, expectedSubset), 'grammar contract approved_subset must exactly equal unique bindings');
  must(isDeepStrictEqual(grammar.unmapped_visual_grammar, []) && isDeepStrictEqual(grammar.novel_visual_grammar, []), 'grammar contract cannot contain unmapped or novel grammar');
  must(isDeepStrictEqual(grammar.hidden_authoring_uncertainties, HIDDEN_AUTHORING_UNCERTAINTIES), 'grammar contract hidden-authoring uncertainties must equal the frozen complete array');
  must(isDeepStrictEqual((grammar.pending_evidence_entries ?? []).map((entry) => entry.grammar_id), PENDING_AUTHORING_IDS), 'pending hidden-authoring evidence IDs cannot be dropped, reordered, or promoted');
  const activeIds = new Set(expectedSubset);
  const allIds = new Set();
  for (const entry of grammar.pending_evidence_entries ?? []) {
    must(CATEGORY_ORDER.includes(entry.category) && entry.status === 'pending_evidence' && typeof entry.reason === 'string' && entry.reason.trim() && Array.isArray(entry.required_evidence) && entry.required_evidence.length > 0 && new Set(entry.required_evidence).size === entry.required_evidence.length, `${entry.grammar_id}: invalid pending evidence record`);
    must(!activeIds.has(entry.grammar_id) && !allIds.has(entry.grammar_id), `${entry.grammar_id}: pending/active grammar ID collision`);
    allIds.add(entry.grammar_id);
  }
  must(isDeepStrictEqual(grammar.approval_marker, {path: rel(files.grammarApprovalPath), sha256: grammarApprovalSha}), 'grammar contract approval marker hash drift');
  must(isDeepStrictEqual(grammar.calibration_approval_marker, {path: rel(files.approvalPath), sha256: approvalSha}), 'grammar contract calibration marker hash drift');

  must(grammarApproval.status === 'approved-human-grammar' && grammarApproval.reviewer === 'user' && grammarApproval.approved_at === '2026-09-02', 'grammar approval marker status/reviewer/date mismatch');
  must(isDeepStrictEqual(grammarApproval.calibration_approval, {path: rel(files.approvalPath), sha256: approvalSha}), 'grammar approval is not bound to the calibration marker');
  must(isDeepStrictEqual(grammarApproval.approved_grammar_ids, GRAMMAR_SPECS.map((spec) => spec.grammar_id)), 'grammar approval marker active ID order drift');
  must(isDeepStrictEqual(grammarApproval.approved_subset, expectedSubset), 'grammar approval marker approved_subset mismatch');
  must(grammarApproval.evidence_bundle_sha256 === grammarEvidenceHash(grammar.categories), 'grammar approval evidence bundle drift');
  must(isDeepStrictEqual(grammarApproval.unmapped_visual_grammar, []) && isDeepStrictEqual(grammarApproval.novel_visual_grammar, []), 'grammar approval cannot approve unmapped or novel grammar');
  must(isDeepStrictEqual(grammarApproval.hidden_authoring_uncertainties, HIDDEN_AUTHORING_UNCERTAINTIES), 'grammar approval hidden-authoring uncertainties must equal the frozen complete array');

  const grammarContractRecord = {path: rel(files.grammarContractPath), sha256: await shaFile(files.grammarContractPath)};
  must(isDeepStrictEqual(binding, {schema_version: 1, grammar_contract: grammarContractRecord, status: 'approved-human-grammar', approval_marker: {path: rel(files.grammarApprovalPath), sha256: grammarApprovalSha}}), 'reference grammar binding drift');
  must(gates.status === 'pending-user-style-frame-review', 'reference style gate must enter pending user style-frame review');
  const calibration = gates.reference_calibration;
  must(calibration?.status === 'reference-calibration-passed' && calibration.approval_route === 'motion-reverse-engineering-review-v01' && calibration.eligible_for_user_style_frame_review === true && calibration.user_reference_calibration_pass === true && calibration.grammar_promoted === true && calibration.exact_bindings_complete === true && calibration.side_by_side_complete === true, 'reference calibration passed flags are incomplete');
  must(isDeepStrictEqual(calibration?.candidate_set, {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256}) && calibration.approval_marker === rel(files.approvalPath) && calibration.approval_marker_sha256 === approvalSha && calibration.approved_inputs_sha256 === REVIEW.inputBundleSha256, 'reference calibration artifact binding drift');
  must(isDeepStrictEqual(gates.reference_grammar_contract, grammarContractRecord), 'style gates grammar contract binding drift');
  for (const [index, record] of (calibration.shared_locked_reference_bundle ?? []).entries()) await checkRecord(record, `shared locked reference bundle ${index + 1}`);
  const historicalFamilies = Array.isArray(gates.visual_families) ? gates.visual_families : [];
  must(historicalFamilies.length === 6 && historicalFamilies.every((family) => family?.status === 'pending-user-style-frame-review' && family.user_approved === false && family.approval_marker === null && family.approved_inputs_sha256 === null), 'reference PASS must only expose six unapproved style families');
  must(gates.static_to_playable_parity?.status === 'blocked-pre-style-pass' && gates.static_to_playable_parity?.pass === false && gates.motion_proof?.status === 'not-applicable-before-style-pass' && gates.motion_proof?.pass === false, 'reference PASS must not unlock playable parity or motion proof');

  for (const field of ['contract_version', 'status', 'approval_route', 'candidate_set', 'shared_locked_reference_bundle', 'eligible_for_user_style_frame_review', 'user_reference_calibration_pass', 'grammar_promoted', 'exact_bindings_complete', 'side_by_side_complete', 'approval_marker', 'approval_marker_sha256', 'approved_inputs_sha256']) must(isDeepStrictEqual(state.reference_calibration?.[field], calibration?.[field]), `production state reference_calibration.${field} drift`);
  const familyIds = historicalFamilies.map((family) => family?.family_id);
  must(state.stage === 'timing-draft' && state.active_cut_root === null, 'reference PASS must retain timing-draft with active_cut_root=null');
  must(state.style_frame_review?.status === 'pending-user-style-frame-review' && state.style_frame_review?.user_approved === false && state.style_frame_review?.approval_marker === null && state.style_frame_review?.approved_inputs_sha256 === null, 'style-frame review must be eligible but not approved');
  must(state.reference_style_gates?.status === 'pending-6-family-user-review' && isDeepStrictEqual(state.reference_style_gates?.approved_family_ids, []) && isDeepStrictEqual(state.reference_style_gates?.pending_family_ids, familyIds), 'production state must await all six family style reviews');
  must(state.reference_style_gates?.contract_sha256 === await shaFile(files.styleGatesPath), 'production state style-gates hash drift');
  must(state.reference_style_gates?.cut_blueprint_sha256 === await shaFile(files.blueprintPath), 'production state blueprint hash drift');
  must(state.cut_review?.all_cuts_passed === false && state.cut_review?.approval_marker === null, 'reference PASS must not grant cut PASS');
  must(state.omni_video_generation?.status === 'blocked_until_all_cuts_passed' && state.omni_video_generation?.allowed_after_marker === null, 'reference PASS must not unlock Omni generation');
  must(state.visual_review?.user_approved === false && state.final_script?.status !== 'locked' && state.picture_lock?.status !== 'locked', 'reference PASS must not unlock downstream review or picture lock');
  must(blueprint.status === 'reference-bound-cut-blueprint-pending-6-family-style-pass' && blueprint.readiness === 'pending-family-style-review', 'reference blueprint must move only to pending family style review');
  must(blueprint._generated?.source_style_gates_sha256 === await shaFile(files.styleGatesPath), 'reference blueprint style-gates hash drift');
  must(blueprint.cuts?.length === 48 && blueprint.cuts.every((cut) => cut.reference_family_status === 'pending-user-style-frame-review' && cut.readiness === 'pending-family-style-review' && cut.full_motion_expansion_allowed === false), 'all blueprint cuts must remain motion-blocked pending style review');

  if (errors.length) throw new Error(`reference calibration approval invalid:\n- ${errors.join('\n- ')}`);
  return {samples: 10, grammar_entries: GRAMMAR_SPECS.length, grammar_bindings: expectedBindings.length, approval_marker_sha256: approvalSha, grammar_approval_marker_sha256: grammarApprovalSha, grammar_contract_sha256: grammarContractRecord.sha256, approved_inputs_sha256: REVIEW.inputBundleSha256};
}

if (process.argv[1]?.endsWith('validate-reference-calibration-approval-v01.mjs')) {
  try {
    const result = await validateReferenceCalibrationApproval({auditHistorical: process.argv.includes('--audit-historical')});
    process.stdout.write(`reference calibration approval valid: ${result.samples} samples, ${result.grammar_entries} grammar entries, ${result.grammar_bindings} bindings\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
