import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import {APPROVED_SAMPLE_NUMBERS, validateCanonicalReferenceTransferGate, validateReferenceTransferGateDocument, validateReferenceTransferSelection} from '../video/scripts/reference-transfer-gate-contract.mjs';
import {deriveBlockedSourceGateSnapshot} from '../video/scripts/refresh-reference-transfer-source-gate.mjs';

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const files = {
  contract: 'video/episodes/episode-001/reference-style-gates.json',
  state: 'video/episodes/episode-001/production-state.json',
  spec: 'video/episodes/episode-001/episode-spec.json',
  grammar: 'video/episodes/episode-001/reference-grammar-contract.json',
  blueprint: 'video/episodes/episode-001/generated/reference-cut-blueprint.json',
};

test('canonical gate preserves calibration but makes source readiness current', async () => {
  const result = await validateCanonicalReferenceTransferGate({root});
  assert.deepEqual(result.failures, []);
  assert.equal(result.contract.source_gate.pass, false);
  assert.deepEqual(result.contract.reference_calibration.approved_sample_numbers, APPROVED_SAMPLE_NUMBERS);
  assert.equal(result.contract.reference_calibration.excluded_sample.review_profile, 'source-video-selection');
  assert.equal(result.state.active_cut_root, null);
  assert.equal(result.state.reference_style_gates.candidate_index, null);
});

test('source-gate refresh derives only a blocked snapshot and cannot promote source readiness', async () => {
  const [queueBytes, specBytes, officialRegistryBytes, newsRegistryBytes] = await Promise.all([
    readFile(path.join(root, 'video/episodes/episode-001/generated/acquisition-queue.json')),
    readFile(path.join(root, files.spec)),
    readFile(path.join(root, 'video/source-intake/episode-001/official/intake-registry.json')),
    readFile(path.join(root, 'video/source-intake/episode-001/news/intake-registry.json')),
  ]);
  const queue = JSON.parse(queueBytes.toString('utf8'));
  const snapshot = deriveBlockedSourceGateSnapshot({queue, queueBytes, specBytes, officialRegistryBytes, newsRegistryBytes});
  assert.equal(snapshot.pass, false);
  assert.equal(snapshot.observed_counts.materialized, 0);
  const promoted = structuredClone(queue);
  Object.assign(promoted.summary.by_status, {missing: 0, 'candidate-pending-review': 0, 'approved-ready': 0, materialized: 1, 'blocked-non-media-work': 0});
  assert.throws(() => deriveBlockedSourceGateSnapshot({queue: promoted, queueBytes: Buffer.from(JSON.stringify(promoted)), specBytes, officialRegistryBytes, newsRegistryBytes}), /explicit approval\/materialization workflow/u);
});

test('former v10 and all forced family routes are historical non-authority', async () => {
  const contract = await readJson(files.contract);
  assert.equal('visual_families' in contract, false);
  assert.equal(contract.grammar_allowlist.coverage_quota, null);
  assert.equal(contract.grammar_allowlist.all_samples_must_be_used, false);
  for (let version = 4; version <= 10; version += 1) {
    const id = `reference-style-families-v${String(version).padStart(2, '0')}`;
    const row = contract.historical_candidates.find((entry) => entry.candidate_id === id);
    assert.deepEqual({status: row.status, production_authority: row.production_authority}, {status: 'historical-human-review-failed', production_authority: false});
  }
});

test('generated blueprint defers grammar decisions until approved episode inputs exist', async () => {
  const blueprint = await readJson(files.blueprint);
  assert.equal(blueprint.schema_version, 2);
  const spec = await readJson(files.spec);
  assert.equal(blueprint.cut_count, spec.cuts.length);
  assert.equal(blueprint.coverage_quota, null);
  assert.equal(blueprint.all_samples_must_be_used, false);
  assert.ok(blueprint.cuts.every((cut) => cut.reference_transfer.status === 'pending-source-approval-and-materialization'));
  assert.ok(blueprint.cuts.every((cut) => !('reference_family_id' in cut)));
});

test('selection records fail closed on unknown grammar, sample10, missing input hash, and short hold', async () => {
  const grammar = await readJson(files.grammar);
  const approved = new Set(Object.values(grammar.categories).flat().map((entry) => entry.grammar_id));
  const base = {
    shot_id: 'SH001', beat_id: 'SH001-B01', decision: 'applicable', rationale: 'The approved news object enters independently.',
    episode_source_ids: ['NEWS-YNA-20260729'],
    episode_input_bindings: [{asset_id: 'news', path: 'video/public/assets/example.png', sha256: 'a'.repeat(64)}],
    grammar_bindings: [{grammar_id: 'staggered-object-accumulation', target_id: 'news', observable_state_delta: 'off-canvas to settled', source_sample_numbers: [1], frame_range: {start_frame: 0, end_frame: 20}, reading_hold_required: true, reading_hold: {start_frame: 20, end_frame: 80}, implementation_status: 'planned'}],
  };
  assert.deepEqual(validateReferenceTransferSelection(base, approved), []);
  const unknown = structuredClone(base); unknown.grammar_bindings[0].grammar_id = 'chart-self-draw';
  assert.match(validateReferenceTransferSelection(unknown, approved).join('\n'), /not in the approved allowlist/u);
  const excluded = structuredClone(base); excluded.grammar_bindings[0].source_sample_numbers = [10];
  assert.match(validateReferenceTransferSelection(excluded, approved).join('\n'), /subset of 01-09/u);
  const unhashed = structuredClone(base); unhashed.episode_input_bindings[0].sha256 = null;
  assert.match(validateReferenceTransferSelection(unhashed, approved).join('\n'), /path, and SHA-256/u);
  const short = structuredClone(base); short.grammar_bindings[0].reading_hold.end_frame = 79;
  assert.match(validateReferenceTransferSelection(short, approved).join('\n'), /at least 60 frames/u);
  const notApplicable = {...base, decision: 'not-applicable', rationale: 'This beat is unaltered source video.', grammar_bindings: []};
  assert.deepEqual(validateReferenceTransferSelection(notApplicable, approved), []);
});

test('forced family fields and premature promotion are rejected', async () => {
  const [contract, state, spec, grammar] = await Promise.all([readJson(files.contract), readJson(files.state), readJson(files.spec), readJson(files.grammar)]);
  const acquisition = await readJson(contract.source_gate.queue.path);
  const forced = structuredClone(contract); forced.visual_families = [];
  assert.match(validateReferenceTransferGateDocument({contract: forced, state, spec, grammar, acquisition}).join('\n'), /forced family\/sample field/u);
  const promoted = structuredClone(state); promoted.active_cut_root = 'video/public/assets/episode-001-work-v01';
  assert.match(validateReferenceTransferGateDocument({contract, state: promoted, spec, grammar, acquisition}).join('\n'), /active_cut_root=null/u);
});

test('canonical package check excludes historical v10 validator', async () => {
  const pkg = await readJson('package.json');
  assert.match(pkg.scripts.check, /video:validate-reference-style-gates/u);
  assert.doesNotMatch(pkg.scripts.check, /validate-reference-style-v10|validate-historical-reference-style-v10/u);
  assert.doesNotMatch(pkg.scripts.check, /validate-reference-correction-v02/u);
  assert.equal(pkg.scripts['video:qa:validate-reference-correction-v02'], undefined);
  assert.equal(pkg.scripts['video:qa:validate-historical-reference-correction-v02'], 'node video/scripts/validate-reference-correction-v02.mjs');
  assert.equal(pkg.scripts['video:qa:validate-reference-style-v10'], undefined);
  assert.equal(pkg.scripts['video:qa:validate-historical-reference-style-v10'], 'node video/scripts/validate-grammar-bound-style-families-v10.mjs');
});

test('CLI rejects unsupported options before validation', () => {
  const result = spawnSync(process.execPath, ['video/scripts/validate-reference-style-gates.mjs', '--unsafe', 'x'], {cwd: root, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /unsupported or incomplete CLI option/u);
});
