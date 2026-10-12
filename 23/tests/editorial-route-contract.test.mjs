import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {auditEditorialRouting, validateDeferredBeatIntent} from '../video/scripts/editorial-route-contract.mjs';

const policy = {
  version: 1,
  missing_source_changes_mode: false,
  source_diversity_unit: 'original-sha256-and-semantic-subject',
};

function brief() {
  return {
    brief_id: 'police-station-context',
    subject: 'Korean police station exterior',
    action: 'establish the institution handling the report',
    role: 'full-frame',
    specificity: 'korea-institution',
    queries_ko: ['대한민국 경찰서 외관 공식 사진'],
    queries_en: ['South Korea police station official exterior photo'],
    provider_routes: ['government media library', 'Wikimedia Commons'],
    exclusions: ['generic courthouse imagery'],
  };
}

function cut(overrides = {}) {
  const mode = overrides.production_mode ?? 'source-video';
  return {
    shot_id: 'SH001',
    production_mode: mode,
    internal_presentation_segments: [],
    production_decision: {
      version: 1,
      mode,
      purpose: mode.startsWith('source-') ? 'real-context' : mode === 'omni' ? 'fictional-action' : 'explanation',
      reason: 'Show the institution and action named by this narration beat.',
      visible_subject: 'Korean police officer reviewing a report',
      observable_action: 'The officer checks the submitted report.',
      rejected_modes: {
        live_action: 'No documented case footage directly supports this beat.',
        motion_graphics: 'A diagram would not establish the named real setting.',
        omni: 'The beat needs real institutional context, not an invented event.',
      },
      continuity_group: mode === 'omni' ? 'fictional-intake-sequence' : null,
      asset_search_briefs: mode === 'omni' ? [] : [{...brief(), brief_id: `${overrides.shot_id ?? 'SH001'}-police-station-context`}],
      reuse_reason: null,
    },
    ...overrides,
  };
}

function spec(cuts = [cut()], policyOverride = {}) {
  return {
    production_routing_policy: {...policy, ...policyOverride},
    cuts,
  };
}

test('a missing source cannot silently change the selected production mode', () => {
  const plannedCut = cut({production_mode: 'source-video'});
  plannedCut.production_decision.mode = 'remotion';
  const report = auditEditorialRouting(spec([plannedCut]));
  assert.ok(report.errors.some((error) => error.includes('mode must match production_mode')));
  assert.equal(report.cuts[0].mode, 'source-video');
  assert.equal(report.summary.production_approved, false);

  const policyReport = auditEditorialRouting(spec([cut()], {missing_source_changes_mode: true}));
  assert.ok(policyReport.errors.some((error) => error.includes('missing_source_changes_mode must be false')));
});

test('Omni cannot be routed as a factual evidence cut', () => {
  const omniCut = cut({production_mode: 'omni'});
  omniCut.production_decision.purpose = 'exact-evidence';
  const report = auditEditorialRouting(spec([omniCut]));
  assert.ok(report.errors.some((error) => error.includes('Omni requires fictional-action purpose')));
  assert.equal(report.cuts[0].mode, 'omni');
});

test('Remotion explanation cuts require concrete external acquisition briefs', () => {
  const remotionCut = cut({production_mode: 'remotion'});
  remotionCut.production_decision.asset_search_briefs = [];
  const report = auditEditorialRouting(spec([remotionCut]));
  assert.ok(report.errors.some((error) => error.includes('Remotion routes require at least one asset search brief')));
});

test('an exact-source brief can use one language without inventing a second-language query', () => {
  const exactSourceCut = cut({production_mode: 'source-photo'});
  exactSourceCut.production_decision.purpose = 'exact-evidence';
  exactSourceCut.production_decision.asset_search_briefs[0].specificity = 'exact-source';
  exactSourceCut.production_decision.asset_search_briefs[0].queries_en = [];
  const report = auditEditorialRouting(spec([exactSourceCut]));
  assert.deepEqual(report.errors, []);
});

test('source IDs sharing a hash aggregate to one original across adjacent photo crops', () => {
  const sourcedCut = cut();
  const base = {
    kind: 'photo-hold',
    output_frames: 30,
    source_sha256: 'a'.repeat(64),
    source_path: 'video/source-intake/police-room.jpg',
  };
  sourcedCut.internal_presentation_segments = [
    {...base, source_id: 'SOURCE-A', segment_index: 1, crop_normalized: {x: 0, y: 0, width: 1, height: 1}},
    {...base, source_id: 'SOURCE-B', segment_index: 2, output_frames: 60, crop_normalized: {x: 0.1, y: 0.1, width: 0.8, height: 0.8}},
    {...base, source_id: 'SOURCE-C', segment_index: 3, crop_normalized: {x: 0, y: 0, width: 1, height: 1}},
  ];

  const report = auditEditorialRouting(spec([sourcedCut]));
  assert.equal(report.source_usage.original_count, 1);
  assert.equal(report.source_usage.sources[0].source_ids.length, 3);
  assert.equal(report.source_usage.sources[0].output_frames, 120);
  assert.equal(report.source_usage.contiguous_source_runs.length, 1);
  assert.equal(report.source_usage.adjacent_same_original.length, 2);
  assert.equal(report.source_usage.repeated_photo_crops.length, 1);
  assert.ok(report.warnings.some((warning) => warning.code === 'repeated-photo-crop'));
});

test('a structurally valid routing audit never grants production approval', () => {
  const report = auditEditorialRouting(spec());
  assert.deepEqual(report.errors, []);
  assert.equal(report.summary.production_approved, false);
  assert.equal(report.summary.quality_approved, false);
  assert.equal(report.summary.authority, 'integrity-only');
  assert.equal('production_approved' in report.cuts[0], false);
});

test('unhashed source IDs do not inflate original diversity', () => {
  const report = auditEditorialRouting(spec([cut({internal_presentation_segments: [{source_id: 'REMOTE-ONLY', kind: 'photo-hold', output_frames: 30}]})]));
  assert.equal(report.source_usage.original_count, 0);
  assert.ok(report.warnings.some((warning) => warning.code === 'unverified-original-hash'));
});

test('brief identities cannot collide across cuts in the shared acquisition ledger', () => {
  const first = cut({shot_id: 'SH001'});
  const second = cut({shot_id: 'SH002'});
  second.production_decision.asset_search_briefs[0].brief_id = first.production_decision.asset_search_briefs[0].brief_id;
  assert.ok(auditEditorialRouting(spec([first, second])).errors.some((message) => message.includes('globally unique')));
});

test('a motivated conclusion reprise does not excuse earlier unmotivated crop repetition', () => {
  const segment = {source_id: 'SOURCE-A', source_sha256: 'a'.repeat(64), kind: 'photo-hold', output_frames: 30, crop_normalized: {x: 0, y: 0, width: 1, height: 1}};
  const cuts = ['SH001', 'SH002', 'SH003'].map((shot_id) => cut({shot_id, internal_presentation_segments: [segment]}));
  cuts[2].production_decision.reuse_reason = 'Return to the opening image to summarize the conclusion.';
  const report = auditEditorialRouting(spec(cuts));
  const repeat = report.source_usage.repeated_photo_crops[0];
  assert.equal(repeat.classification, 'review-reuse-reason');
  assert.deepEqual(repeat.occurrences.map((item) => item.classification), ['first-use', 'review-reuse-reason', 'motivated-reprise']);
});

test('deferred beats require an explicit blocked, unapproved state and a mode-matched intent', () => {
  const deferredCut = {
    shot_id: 'SH009',
    production_mode: 'source-video',
    production_authority: false,
    production_decision: {human_review_status: 'pending'},
  };
  const beat = {
    beat_id: 'SH009-B01',
    planned_operator: null,
    preview_status: 'blocked-assets-pending',
    action_intent: {
      kind: 'source-selection',
      status: 'deferred-until-source-selection',
      observable_action: 'Follow a verified source subject through the beat.',
    },
  };
  assert.deepEqual(validateDeferredBeatIntent(deferredCut, beat), []);

  assert.ok(validateDeferredBeatIntent(deferredCut, {...beat, action_intent: undefined}).some((error) => error.includes('action_intent must declare')));
  const readyCut = {...deferredCut, production_authority: true, production_decision: {human_review_status: 'passed'}};
  const readyBeat = {...beat, planned_operator: {operator_id: 'transform.tween@1'}, preview_status: 'ready'};
  const readyErrors = validateDeferredBeatIntent(readyCut, readyBeat);
  assert.ok(readyErrors.some((error) => error.includes('human_review_status must remain pending')));
  assert.ok(readyErrors.some((error) => error.includes('production_authority must remain false')));
  assert.ok(readyErrors.some((error) => error.includes('preview_status must remain blocked-assets-pending')));
  assert.ok(readyErrors.some((error) => error.includes('planned_operator must be null')));
  assert.ok(validateDeferredBeatIntent(deferredCut, {...beat, action_intent: {...beat.action_intent, kind: 'keyframe-state'}}).some((error) => error.includes('must be source-selection')));
});

test('CLI emits a compact report and --check exits nonzero when integrity errors exist', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), '23jung-editorial-route-'));
  try {
    const specPath = path.join(temp, 'invalid-spec.json');
    const scriptPath = path.resolve('video/scripts/validate-editorial-routing.mjs');
    await writeFile(specPath, '{}', 'utf8');

    const reportRun = spawnSync(process.execPath, [scriptPath, '--spec', specPath], {cwd: process.cwd(), encoding: 'utf8', windowsHide: true});
    assert.equal(reportRun.status, 0, reportRun.stderr);
    assert.ok(JSON.parse(reportRun.stdout).errors.length > 0);

    const checkRun = spawnSync(process.execPath, [scriptPath, '--spec', specPath, '--check'], {cwd: process.cwd(), encoding: 'utf8', windowsHide: true});
    assert.equal(checkRun.status, 1);
    assert.ok(JSON.parse(checkRun.stdout).errors.length > 0);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});
