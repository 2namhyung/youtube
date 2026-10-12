import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

import {validateReferenceCalibrationApprovalV02} from './validate-reference-calibration-approval-v02.mjs';

export const AUTHORITY_ROUTE = 'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline';
export const APPROVED_SAMPLE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const SOURCE_BLOCK_STATUS = 'blocked-pending-source-approval-and-materialization';
const SHA256 = /^[a-f0-9]{64}$/u;
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const same = (left, right) => isDeepStrictEqual(left, right);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (file) => sha256(await readFile(file));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };

export function validateReferenceTransferSelection(selection, approvedGrammarIds) {
  const failures = [];
  const label = `${selection?.shot_id ?? 'unknown-shot'}/${selection?.beat_id ?? 'unknown-beat'}`;
  for (const field of ['shot_id', 'beat_id', 'decision', 'rationale']) if (!nonblank(selection?.[field])) failures.push(`${label}: ${field} is required`);
  if (!['applicable', 'not-applicable'].includes(selection?.decision)) failures.push(`${label}: decision must be applicable or not-applicable`);
  for (const field of ['episode_source_ids', 'episode_input_bindings', 'grammar_bindings']) if (!Array.isArray(selection?.[field])) failures.push(`${label}: ${field} must be an array`);
  if (selection?.decision === 'not-applicable') {
    if ((selection.grammar_bindings ?? []).length !== 0) failures.push(`${label}: not-applicable requires empty grammar_bindings`);
    return failures;
  }
  if ((selection?.episode_source_ids ?? []).length === 0 || selection.episode_source_ids.some((value) => !nonblank(value))) failures.push(`${label}: applicable selection requires episode source IDs`);
  if ((selection?.episode_input_bindings ?? []).length === 0) failures.push(`${label}: applicable selection requires exact episode input bindings`);
  for (const input of selection?.episode_input_bindings ?? []) {
    if (!nonblank(input?.asset_id) || !nonblank(input?.path) || !SHA256.test(input?.sha256 ?? '')) failures.push(`${label}: every episode input binding requires asset_id, path, and SHA-256`);
  }
  if ((selection?.grammar_bindings ?? []).length === 0) failures.push(`${label}: applicable selection requires at least one grammar binding`);
  for (const binding of selection?.grammar_bindings ?? []) {
    if (!approvedGrammarIds.has(binding?.grammar_id)) failures.push(`${label}: grammar ${binding?.grammar_id ?? '<missing>'} is not in the approved allowlist`);
    if (!nonblank(binding?.target_id) || !nonblank(binding?.observable_state_delta)) failures.push(`${label}: grammar binding requires target_id and observable_state_delta`);
    if (!Array.isArray(binding?.source_sample_numbers) || binding.source_sample_numbers.length === 0 || binding.source_sample_numbers.some((number) => !APPROVED_SAMPLE_NUMBERS.includes(number))) failures.push(`${label}: grammar binding source samples must be a non-empty subset of 01-09`);
    const range = binding?.frame_range;
    if (!Number.isInteger(range?.start_frame) || !Number.isInteger(range?.end_frame) || range.end_frame <= range.start_frame) failures.push(`${label}: grammar binding requires a positive frame_range`);
    if (binding?.reading_hold_required === true) {
      const hold = binding?.reading_hold;
      if (!Number.isInteger(hold?.start_frame) || !Number.isInteger(hold?.end_frame) || hold.end_frame - hold.start_frame < 60) failures.push(`${label}: readable evidence requires a stable hold of at least 60 frames`);
    }
    if (binding?.implementation_status === 'implemented' && (!nonblank(binding?.runtime_operator_id) || !nonblank(binding?.runtime_evidence_path) || !SHA256.test(binding?.runtime_evidence_sha256 ?? ''))) failures.push(`${label}: implemented grammar requires runtime operator and executable evidence binding`);
  }
  return failures;
}

export function validateReferenceTransferGateDocument({contract, state, spec, grammar, acquisition}) {
  const failures = [];
  const must = (condition, message) => { if (!condition) failures.push(message); };
  must(contract?.schema_version === 4 && contract?.contract_id === 'episode-001-reference-transfer-gates-v1', 'reference transfer gate identity/schema mismatch');
  must(contract?.episode_id === 'episode-001' && state?.episode_id === 'episode-001' && spec?.episode_id === 'episode-001', 'episode identity mismatch');
  must(contract?.authority_route === AUTHORITY_ROUTE, 'reference gate must preserve the sole production authority route');
  must(contract?.production_authority === false, 'reference gate cannot grant production authority');
  for (const forbidden of ['visual_families', 'all_family_style_pass_required_before_full_motion_expansion', 'sample_coverage']) must(!(forbidden in (contract ?? {})), `forced family/sample field is forbidden: ${forbidden}`);
  const calibration = contract?.reference_calibration;
  must(calibration?.status === 'reference-calibration-passed' && calibration?.user_reference_calibration_pass === true && calibration?.grammar_promoted === true, 'corrected reference calibration PASS must remain preserved');
  must(same(calibration?.approved_sample_numbers, APPROVED_SAMPLE_NUMBERS), 'approved reference samples must remain exactly 01-09');
  must(calibration?.excluded_sample?.sample_number === 10 && calibration?.excluded_sample?.review_profile === 'source-video-selection', 'sample10 must remain a source-video-selection exclusion');
  must(calibration?.next_gate === 'source-approval-and-materialization', 'source approval/materialization must be the next gate');
  const approvedEntries = Object.values(grammar?.categories ?? {}).flat();
  const approvedGrammarIds = new Set(approvedEntries.map((entry) => entry.grammar_id));
  must(grammar?.status === 'approved-human-grammar', 'grammar contract must retain human-approved status');
  must(approvedGrammarIds.size === approvedEntries.length && approvedGrammarIds.size > 0, 'approved grammar IDs must be unique and non-empty');
  must(same([...(grammar?.approved_subset ?? [])].sort(), [...approvedGrammarIds].sort()), 'grammar approved_subset must exactly match the allowlist');
  must((grammar?.unmapped_visual_grammar ?? []).length === 0 && (grammar?.novel_visual_grammar ?? []).length === 0, 'grammar contract must remain fail-closed');
  const allowlist = contract?.grammar_allowlist;
  must(allowlist?.selection_scope === 'per-cut-or-visual-beat', 'grammar selection must be per cut or visual beat');
  must(allowlist?.coverage_quota === null && allowlist?.all_samples_must_be_used === false && allowlist?.content_family_is_not_motion_authority === true, 'fixed sample/family coverage is forbidden');
  must(same(allowlist?.selection_record_contract?.allowed_decisions, ['applicable', 'not-applicable']), 'selection decisions must be applicable/not-applicable');
  const selections = allowlist?.current_selections ?? [];
  must(Array.isArray(selections), 'current_selections must be an array');
  for (const selection of selections) failures.push(...validateReferenceTransferSelection(selection, approvedGrammarIds));
  const expectedBeatKeys = new Set((spec?.cuts ?? []).flatMap((cut) => (cut.visual_beats ?? []).map((beat) => `${cut.shot_id}|${beat.beat_id}`)));
  const selectionKeys = selections.map((selection) => `${selection.shot_id}|${selection.beat_id}`);
  must(new Set(selectionKeys).size === selectionKeys.length, 'reference transfer selections must be unique per shot/beat');
  for (const key of selectionKeys) must(expectedBeatKeys.has(key), `reference transfer selection targets an unknown shot/beat: ${key}`);
  const counts = contract?.source_gate?.observed_counts;
  const queueCounts = acquisition?.summary?.by_status ?? {};
  must(counts?.total_requirements === acquisition?.summary?.total_requirements, 'source gate total requirement count drift');
  must(counts?.registered_candidates === acquisition?.summary?.registered_candidate_count, 'source gate registered candidate count drift');
  must(counts?.missing === queueCounts.missing && counts?.candidate_pending_review === queueCounts['candidate-pending-review'] && counts?.approved_ready === queueCounts['approved-ready'] && counts?.materialized === queueCounts.materialized && counts?.blocked_non_media_work === queueCounts['blocked-non-media-work'], 'source gate status counts drift');
  const computedSourcePass = counts?.missing === 0 && counts?.candidate_pending_review === 0 && counts?.approved_ready === 0 && counts?.materialized > 0 && counts?.blocked_non_media_work === 0;
  must(contract?.source_gate?.pass === computedSourcePass, 'source gate pass does not match acquisition readiness');
  if (!computedSourcePass) {
    must(contract?.status === SOURCE_BLOCK_STATUS, 'incomplete sources must be the current top-level blocker');
    must(selections.length === 0 && allowlist?.selection_status === 'not-started-pending-source-gate', 'grammar selections cannot be promoted before the source gate');
    must(state?.stage === 'timing-draft' && state?.active_cut_root === null, 'source-blocked episode must remain timing-draft with active_cut_root=null');
    must(contract?.style_direction_gate?.pass === false && contract?.style_direction_gate?.status === 'not-started-pending-source-gate', 'style direction must remain separate and blocked by sources');
    must(contract?.playable_motion_gate?.pass === false && contract?.playable_motion_gate?.status === 'blocked-pending-applicable-style-direction-pass', 'playable parity must remain separate and blocked before style direction PASS');
  } else {
    must(selectionKeys.length === expectedBeatKeys.size && selectionKeys.every((key) => expectedBeatKeys.has(key)), 'source-ready episode requires one explicit applicable/not-applicable decision for every visual beat');
  }
  must(contract?.transition_policy?.hard_cut_allowed_between_any_modes === true && contract?.transition_policy?.shared_element_optional === true, 'source-appropriate hard cuts must be allowed and shared-element must be optional');
  must((contract?.transition_policy?.hard_cut_requirements ?? []).some((value) => /zero blend/u.test(value)), 'hard-cut claims require adjacent zero-blend proof');
  must((contract?.playable_motion_gate?.required_evidence ?? []).some((value) => /60-frame/u.test(value)), 'playable motion gate must preserve the 60-frame hold');
  const historical = new Map((contract?.historical_candidates ?? []).map((entry) => [entry.candidate_id, entry]));
  for (let version = 4; version <= 10; version += 1) {
    const id = `reference-style-families-v${String(version).padStart(2, '0')}`;
    const entry = historical.get(id);
    must(entry?.status === 'historical-human-review-failed' && entry?.production_authority === false, `${id} must remain historical and non-production`);
  }
  const gateState = state?.reference_style_gates;
  must(gateState?.status === contract?.status, 'production state reference gate status drift');
  must(gateState?.candidate_index === null && gateState?.selected_transfer_count === selections.length, 'production state cannot retain a family candidate index or selection-count drift');
  must(gateState?.source_gate_status === contract?.source_gate?.status && gateState?.transfer_selection_status === allowlist?.selection_status, 'production state source/selection status drift');
  must(state?.reference_calibration?.next_gate === 'source-approval-and-materialization', 'production state calibration next gate drift');
  must(state?.style_frame_review?.candidate_id === null && state?.style_frame_review?.manifest === null && state?.style_frame_review?.user_approved === false, 'production state cannot retain v10 as current style review');
  return failures;
}

export async function validateCanonicalReferenceTransferGate(options = {}) {
  const root = options.root ?? process.cwd();
  const paths = {contract: options.contract ?? 'video/episodes/episode-001/reference-style-gates.json', state: options.state ?? 'video/episodes/episode-001/production-state.json', spec: options.spec ?? 'video/episodes/episode-001/episode-spec.json', grammar: options.grammar ?? 'video/episodes/episode-001/reference-grammar-contract.json'};
  const readJson = async (relative) => JSON.parse(await readFile(path.resolve(root, relative), 'utf8'));
  const [contract, state, spec, grammar] = await Promise.all(Object.values(paths).map(readJson));
  const failures = [];
  for (const record of [contract.reference_calibration?.candidate_set, contract.reference_calibration?.frame_accurate_contract, contract.grammar_allowlist?.contract, contract.source_gate?.queue, contract.historical_candidates?.find((entry) => entry.candidate_id === 'reference-style-families-v10')]) {
    if (!nonblank(record?.path) || !SHA256.test(record?.sha256 ?? '')) { failures.push('bound path/hash record is incomplete'); continue; }
    const file = path.resolve(root, record.path);
    if (!(await exists(file))) failures.push(`bound file is missing: ${record.path}`);
    else if (await sha256File(file) !== record.sha256) failures.push(`bound file hash drift: ${record.path}`);
  }
  const markerPath = contract.reference_calibration?.approval_marker;
  if (!nonblank(markerPath) || !SHA256.test(contract.reference_calibration?.approval_marker_sha256 ?? '')) failures.push('reference approval marker binding is incomplete');
  else if (await sha256File(path.resolve(root, markerPath)) !== contract.reference_calibration.approval_marker_sha256) failures.push('reference approval marker hash drift');
  try { await validateReferenceCalibrationApprovalV02({root, gatesPath: paths.contract, grammarPath: paths.grammar, requireMarker: true, verifyMedia: false}); } catch (error) { failures.push(error.message); }
  const acquisition = await readJson(contract.source_gate.queue.path);
  failures.push(...validateReferenceTransferGateDocument({contract, state, spec, grammar, acquisition}));
  if (state.reference_style_gates?.contract !== paths.contract || state.reference_style_gates?.contract_sha256 !== await sha256File(path.resolve(root, paths.contract))) failures.push('production state reference gate contract binding drift');
  if (state.reference_style_gates?.source_queue !== contract.source_gate.queue.path || state.reference_style_gates?.source_queue_sha256 !== contract.source_gate.queue.sha256) failures.push('production state source queue binding drift');
  return {ok: failures.length === 0, failures, contract, state};
}
