import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const script = path.join(root, 'video', 'scripts', 'validate-narration-plan.mjs');

function run(args = []) {
  return spawnSync(process.execPath, [script, ...args], {cwd: root, encoding: 'utf8', windowsHide: true});
}

test('narration plan validates without recordings in non-strict mode', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  const spec = JSON.parse(readFileSync(path.join(root, 'video', 'episodes', 'episode-001', 'episode-spec.json'), 'utf8'));
  assert.equal(report.total_cut_count, spec.cuts.length);
  assert.equal(report.measured_cut_count, 0);
  assert.equal(report.measured_master_frames, null);
  assert.equal(report.draft_compact_character_count, spec.script_lock.compact_character_count);
  assert.equal(report.draft_speech_seconds > 420, true);
  assert.equal(report.provisional_master_seconds >= 480, true);
  assert.equal(report.provisional_master_seconds <= 600, true);
  assert.equal(report.cuts.length, spec.cuts.length);
});

test('strict narration validation fails when final recordings are missing', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), '23jung-narration-'));
  try {
    const result = run(['--strict', '--audio-dir', temp]);
    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.measured_cut_count, 0);
    const spec = JSON.parse(await readFile(path.join(root, 'video', 'episodes', 'episode-001', 'episode-spec.json'), 'utf8'));
    assert.equal(report.failures.length, spec.cuts.length);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});

test('narration and the intentionally partial detailed plan stay bound to the 64-cut draft', async () => {
  const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
  const specBytes = await readFile(path.join(episodeDir, 'episode-spec.json'));
  const spec = JSON.parse(specBytes);
  const narrationPlan = JSON.parse(await readFile(path.join(episodeDir, 'narration-plan.json'), 'utf8'));
  const cutPlan = JSON.parse(await readFile(path.join(episodeDir, 'cut-plan.json'), 'utf8'));

  assert.equal(narrationPlan.cuts.length, cutPlan.planned_cut_count);
  assert.equal(cutPlan.cuts.length, cutPlan.detailed_intro_and_action_cut_count);
  assert.equal(cutPlan.closing_cuts.length, cutPlan.detailed_closing_cut_count);
  assert.equal(cutPlan.planned_cut_count, spec.cuts.length);
  assert.equal(cutPlan.detailed_intro_and_action_cut_count, 15);
  assert.equal(cutPlan.detailed_closing_cut_count, 8);
  const sourceHash = createHash('sha256').update(specBytes).digest('hex');
  assert.equal(narrationPlan._generated.source_sha256, sourceHash);
  assert.equal(cutPlan._generated.source_sha256, sourceHash);
  const narrationById = new Map(narrationPlan.cuts.map((cut) => [cut.shot_id, cut]));
  const specById = new Map(spec.cuts.map((cut) => [cut.shot_id, cut]));
  const detailed = [...cutPlan.cuts, ...cutPlan.closing_cuts];
  assert.equal(new Set(detailed.map((cut) => cut.shot_id)).size, detailed.length);
  assert.ok(detailed.length < spec.cuts.length, 'the compatibility cut plan is not the complete episode cut inventory');

  for (const cut of detailed) {
    const narrationCut = narrationById.get(cut.shot_id);
    const specCut = specById.get(cut.shot_id);
    assert.ok(narrationCut, `${cut.shot_id} must exist in narration plan`);
    assert.ok(specCut, `${cut.shot_id} must exist in episode-spec`);
    assert.equal(cut.shot_id, narrationCut.shot_id);
    assert.equal(cut.production_mode, narrationCut.production_mode, `${cut.shot_id} production mode`);
    assert.equal(cut.narration, narrationCut.draft_narration, `${cut.shot_id} narration`);
    assert.equal(cut.visual_purpose, specCut.visual_purpose, `${cut.shot_id} visual purpose projection`);
    assert.deepEqual(cut.production_decision, specCut.production_decision, `${cut.shot_id} route decision projection`);
  }

  assert.equal(cutPlan.intro_rules.omni_allowed, spec.cuts.slice(0, 7).some((cut) => cut.production_mode === 'omni' && cut.production_decision.purpose === 'fictional-action'));
  const validation = run();
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  const report = JSON.parse(validation.stdout);
  assert.equal(cutPlan.runtime.provisional_frames, report.provisional_master_frames);
  assert.equal(Number(cutPlan.runtime.provisional_seconds.toFixed(3)), report.provisional_master_seconds);
});
