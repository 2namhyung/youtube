import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const validator = path.join(root, 'video', 'scripts', 'validate-episode-cut-design.mjs');
const canonical = {
  cutPlan: path.join(episodeDir, 'cut-plan.json'),
  narration: path.join(episodeDir, 'narration-plan.json'),
  design: path.join(episodeDir, 'cut-source-design.json'),
};

function validate(paths = canonical) {
  return spawnSync(process.execPath, [validator, '--cut-plan', paths.cutPlan, '--narration', paths.narration, '--design', paths.design], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('canonical EP001 design binds all 36 source-led cuts and leaves actions blocked pending sources', async () => {
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /36 source-led cuts, 17274 provisional frames, 575\.8s; blocked\/non-production, no render approval/);
  const specBytes = await readFile(path.join(episodeDir, 'episode-spec.json'));
  const spec = JSON.parse(specBytes);
  const design = JSON.parse(await readFile(canonical.design, 'utf8'));
  assert.equal(design.cuts.length, 36);
  assert.equal(design._generated.source_sha256, createHash('sha256').update(specBytes).digest('hex'));
  assert.deepEqual(design.cuts.map((cut) => cut.shot_id), spec.cuts.map((cut) => cut.shot_id));
  assert.deepEqual(design.cuts.map((cut) => cut.production_mode), spec.cuts.map((cut) => cut.production_mode));
  assert.ok(design.cuts.every((cut, index) => JSON.stringify(cut.production_decision) === JSON.stringify(spec.cuts[index].production_decision)));
  assert.ok(design.cuts.every((cut) => cut.visual_beats.every((beat) => beat.action_intent?.status === 'deferred-until-source-selection'
    && beat.preview_status === 'blocked-assets-pending')));
  assert.deepEqual(design.cuts.reduce((counts, cut) => ({...counts, [cut.production_mode]: (counts[cut.production_mode] ?? 0) + 1}), {}),
    {'omni': 9, 'remotion': 25, 'source-video': 2});
});

test('validator rejects timing drift, route drift and premature deferred-action claims', async (t) => {
  const base = JSON.parse(await readFile(canonical.design, 'utf8'));

  async function rejectMutation(name, mutate, expected) {
    await t.test(name, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'episode-cut-design-'));
      try {
        const file = path.join(dir, 'design.json');
        const changed = structuredClone(base);
        mutate(changed);
        await writeFile(file, JSON.stringify(changed), 'utf8');
        const result = validate({...canonical, design: file});
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, expected);
      } finally {
        await rm(dir, {recursive: true, force: true});
      }
    });
  }

  await rejectMutation('timing drift', (design) => { design.cuts[0].timing.provisional_duration_frames += 1; }, /provisional duration differs/);
  await rejectMutation('stale route projection', (design) => { design.cuts[0].production_decision.reason += ' 바뀐 문장'; }, /generated production_decision must exactly project episode-spec routing/);
  await rejectMutation('deferred action must retain its source-bound intent', (design) => { design.cuts[0].visual_beats[0].action_intent.observable_action = ''; }, /action_intent\.observable_action must be nonblank/);
  await rejectMutation('cut mode must stay bound to episode spec', (design) => { design.cuts[0].production_mode = 'remotion'; }, /production_mode must match episode-spec and narration-plan/);
  await rejectMutation('unknown transition declaration', (design) => { design.cuts[0].transition.type = 'invented'; }, /valid transition type and intent are required/);
});
