import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {applyReferenceCalibrationApproval, assertApprovalApplicationState} from '../video/scripts/apply-reference-calibration-approval-v01.mjs';
import {validateReferenceCalibrationApproval} from '../video/scripts/validate-reference-calibration-approval-v01.mjs';

const root = process.cwd();
const canonical = {
  approvalPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-calibration-approval.json',
  grammarApprovalPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-grammar-approval.json',
  grammarContractPath: 'video/episodes/episode-001/reference-grammar-contract.json',
  styleGatesPath: 'video/episodes/episode-001/reference-style-gates.json',
  statePath: 'video/episodes/episode-001/production-state.json',
};

async function altered(key, mutate) {
  const value = JSON.parse(await readFile(path.join(root, canonical[key]), 'utf8'));
  await mutate(value);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reference-calibration-approval-'));
  const file = path.join(dir, `${key}.json`);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return {dir, file};
}
const auditHistorical = (options = {}) => validateReferenceCalibrationApproval({auditHistorical: true, ...options});

test('superseded ten-sample v01 PASS cannot validate against the corrected v02 state', async () => {
  await assert.rejects(() => validateReferenceCalibrationApproval(), /historical-only and cannot validate current authority/u);
});

test('v01 apply and validate fail closed when the supersession marker is missing or corrupt', async () => {
  const marker = JSON.parse(await readFile(path.join(root, 'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json'), 'utf8'));
  const cases = [
    ['missing', null],
    ['invalid-json', '{not-json'],
    ['wrong-status', JSON.stringify({...marker, status: 'active'})],
    ['corrupt-authority', JSON.stringify({...marker, superseded_approval: {...marker.superseded_approval, authority: 'production'}})],
  ];
  for (const [name, contents] of cases) {
    const dir = await mkdtemp(path.join(os.tmpdir(), `reference-calibration-supersession-${name}-`));
    const file = path.join(dir, 'reference-calibration-supersession.json');
    try {
      if (contents !== null) await writeFile(file, contents);
      await assert.rejects(() => applyReferenceCalibrationApproval({supersessionPath: file}), /historical-only/u);
      await assert.rejects(() => auditHistorical({supersessionPath: file, verifyReviewPackage: false}), /historical-only/u);
    } finally { await rm(dir, {recursive: true, force: true}); }
  }
});

test('rejects approval marker byte/hash drift', async () => {
  const item = await altered('approvalPath', (marker) => { marker.decision_source += ' drift'; });
  try { await assert.rejects(() => auditHistorical({approvalPath: item.file, verifyReviewPackage: false}), /approval marker|artifact binding drift|calibration marker hash drift/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects a non-user reviewer', async () => {
  const item = await altered('approvalPath', (marker) => { marker.reviewer = 'automation'; });
  try { await assert.rejects(() => auditHistorical({approvalPath: item.file, verifyReviewPackage: false}), /reviewer=user/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects missing or reordered sample decisions', async () => {
  for (const mode of ['missing', 'reordered']) {
    const item = await altered('approvalPath', (marker) => { if (mode === 'missing') marker.sample_decisions.pop(); else [marker.sample_decisions[0], marker.sample_decisions[1]] = [marker.sample_decisions[1], marker.sample_decisions[0]]; });
    try { await assert.rejects(() => auditHistorical({approvalPath: item.file, verifyReviewPackage: false}), /ordered 1\.\.10/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
  }
});

test('rejects a stale or rebound review input bundle', async () => {
  const item = await altered('approvalPath', (marker) => { marker.approved_inputs[0].sha256 = '0'.repeat(64); marker.approved_inputs_sha256 = '0'.repeat(64); });
  try { await assert.rejects(() => auditHistorical({approvalPath: item.file, verifyReviewPackage: false}), /input inventory is stale or incomplete/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects overpromotion or a new active grammar ID', async () => {
  const item = await altered('grammarContractPath', (grammar) => { grammar.categories.motion_operator.push({...grammar.categories.motion_operator[0], grammar_id: 'invented-motion'}); });
  try { await assert.rejects(() => auditHistorical({grammarContractPath: item.file, verifyReviewPackage: false}), /active IDs drift or overpromotion/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects approved_subset mismatch even when bindings remain intact', async () => {
  const item = await altered('approvalPath', (marker) => { marker.reference_grammar.approved_subset.pop(); });
  try { await assert.rejects(() => auditHistorical({approvalPath: item.file, verifyReviewPackage: false}), /approved_subset must exactly equal/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects accidental active-root, stage, cut, or Omni unlock', async () => {
  const item = await altered('statePath', (state) => { state.stage = 'cut-previews-ready'; state.active_cut_root = 'video/public/forged'; state.cut_review.all_cuts_passed = true; state.omni_video_generation.status = 'allowed'; });
  try { await assert.rejects(() => auditHistorical({statePath: item.file, verifyReviewPackage: false}), /timing-draft|cut PASS|Omni generation/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('superseded v01 approval application is a no-op on files and refuses reapplication', async () => {
  const before = await Promise.all(Object.values(canonical).map((file) => readFile(path.join(root, file))));
  await assert.rejects(() => applyReferenceCalibrationApproval(), /historical-only and cannot be reapplied/u);
  const after = await Promise.all(Object.values(canonical).map((file) => readFile(path.join(root, file))));
  assert.deepEqual(after, before);

  const gates = JSON.parse(await readFile(path.join(root, canonical.styleGatesPath), 'utf8'));
  const state = JSON.parse(await readFile(path.join(root, canonical.statePath), 'utf8'));
  assert.throws(() => assertApprovalApplicationState(gates, state), /only be applied from the incomplete timing-draft gate|refusing to reapply/u);
  gates.visual_families = [{family_id: 'forged-historical-family', user_approved: true}];
  assert.throws(() => assertApprovalApplicationState(gates, state), /only be applied from the incomplete timing-draft gate|refusing to reapply/u);
  gates.visual_families[0].user_approved = false;
  state.stage = 'cut-previews-ready';
  state.active_cut_root = 'video/public/episode-001-work-v99';
  assert.throws(() => assertApprovalApplicationState(gates, state), /only be applied from the incomplete timing-draft gate|refusing to reapply/u);
  await assert.rejects(() => applyReferenceCalibrationApproval({validateCurrentApproval: async () => { throw new Error('approval marker or state binding drift'); }}), /historical-only and cannot be reapplied/u);
});

test('approved no-op guard refuses every later review or lock trace before validation', async () => {
  const gates = JSON.parse(await readFile(path.join(root, canonical.styleGatesPath), 'utf8'));
  const baseState = JSON.parse(await readFile(path.join(root, canonical.statePath), 'utf8'));
  const mutations = [
    (state) => { state.generation_input_review.all_inputs_passed = true; },
    (state) => { state.playable_cut_review.approval_marker = 'forged-playable-pass.json'; },
    (state) => { state.final_script.status = 'locked'; },
    (state) => { state.picture_lock.status = 'locked'; state.picture_lock.approved = true; },
    (state) => { state.visual_review.status = 'passed'; },
    (state) => { state.visual_review.all_cuts_passed = true; },
    (state) => { state.visual_review.approval_marker = 'forged-visual-pass.json'; },
    (state) => { state.visual_review.approved_artifact_sha256 = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(baseState);
    mutate(state);
    assert.throws(() => assertApprovalApplicationState(gates, state), /only be applied from the incomplete timing-draft gate|refusing to reapply/u);
  }
});

test('initial application refuses pre-existing family approval traces', async () => {
  const gates = JSON.parse(await readFile(path.join(root, canonical.styleGatesPath), 'utf8'));
  const state = JSON.parse(await readFile(path.join(root, canonical.statePath), 'utf8'));
  gates.status = 'blocked-pending-reference-calibration';
  gates.reference_calibration.status = 'reference-calibration-incomplete';
  gates.visual_families = [{family_id: 'forged-historical-family', status: 'blocked-pending-reference-calibration'}];
  state.style_frame_review.status = 'blocked-pending-reference-calibration';
  state.reference_style_gates.status = 'blocked-pending-reference-calibration';
  Object.assign(state.reference_calibration, {status: 'reference-calibration-incomplete', eligible_for_user_style_frame_review: false, user_reference_calibration_pass: false, grammar_promoted: false, exact_bindings_complete: false, side_by_side_complete: false, approval_marker: null, approval_marker_sha256: null, approved_inputs_sha256: null});
  gates.visual_families[0].user_approved = true;
  gates.visual_families[0].approval_marker = 'forged-family-pass.json';
  assert.throws(() => assertApprovalApplicationState(gates, state), /only be applied from the incomplete timing-draft gate/u);
});

test('initial application refuses calibration and every later-stage approval trace', async () => {
  const baseGates = JSON.parse(await readFile(path.join(root, canonical.styleGatesPath), 'utf8'));
  const baseState = JSON.parse(await readFile(path.join(root, canonical.statePath), 'utf8'));
  baseGates.status = 'blocked-pending-reference-calibration';
  baseGates.reference_calibration.status = 'reference-calibration-incomplete';
  baseGates.visual_families = [{family_id: 'forged-historical-family', status: 'blocked-pending-reference-calibration'}];
  baseState.style_frame_review.status = 'blocked-pending-reference-calibration';
  baseState.reference_style_gates.status = 'blocked-pending-reference-calibration';
  Object.assign(baseState.reference_calibration, {status: 'reference-calibration-incomplete', eligible_for_user_style_frame_review: false, user_reference_calibration_pass: false, grammar_promoted: false, exact_bindings_complete: false, side_by_side_complete: false, approval_marker: null, approval_marker_sha256: null, approved_inputs_sha256: null});
  assert.throws(() => assertApprovalApplicationState(baseGates, baseState), /only be applied from the incomplete timing-draft gate/u);

  const mutations = [
    (state) => { state.reference_calibration.status = 'reference-calibration-passed'; },
    (state) => { state.reference_calibration.approval_marker = 'forged-calibration-pass.json'; },
    (state) => { state.generation_input_review.all_inputs_passed = true; },
    (state) => { state.playable_cut_review.approval_marker = 'forged-playable-pass.json'; },
    (state) => { state.final_script.status = 'locked'; },
    (state) => { state.picture_lock.status = 'locked'; state.picture_lock.approved = true; },
  ];
  for (const mutate of mutations) {
    const state = structuredClone(baseState);
    mutate(state);
    assert.throws(() => assertApprovalApplicationState(baseGates, state), /only be applied from the incomplete timing-draft gate/u);
  }
});

test('rejects production-state calibration marker binding drift', async () => {
  const item = await altered('statePath', (state) => { state.reference_calibration.approval_marker_sha256 = '0'.repeat(64); });
  try { await assert.rejects(() => auditHistorical({statePath: item.file, verifyReviewPackage: false}), /reference_calibration\.approval_marker_sha256 drift/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
});

test('rejects omission or divergence in the complete frozen hidden-authoring uncertainty array', async () => {
  for (const key of ['approvalPath', 'grammarApprovalPath', 'grammarContractPath']) {
    const item = await altered(key, (document) => { document.hidden_authoring_uncertainties.splice(1, 1); });
    try { await assert.rejects(() => auditHistorical({[key]: item.file, verifyReviewPackage: false}), /hidden-authoring uncertainties must equal the frozen complete array/u); } finally { await rm(item.dir, {recursive: true, force: true}); }
  }
});

test('historical audit reports missing or malformed family records as validation errors', async () => {
  for (const families of [undefined, null, {length: 6}]) {
    const item = await altered('styleGatesPath', (gates) => { gates.visual_families = families; });
    try {
      await assert.rejects(() => auditHistorical({styleGatesPath: item.file, verifyReviewPackage: false}), (error) => {
        assert.equal(error instanceof TypeError, false);
        assert.match(error.message, /six unapproved style families/u);
        return true;
      });
    } finally { await rm(item.dir, {recursive: true, force: true}); }
  }
});
