import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {buildEpisodePlanOutputs, withDerivedProductionStateHashes} from '../video/scripts/episode-plan-generator-lib.mjs';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const validator = path.join(root, 'video', 'scripts', 'validate-episode-spec.mjs');
const canonical = {
  spec: path.join(episodeDir, 'episode-spec.json'),
  narration: path.join(episodeDir, 'narration-plan.json'),
  cutPlan: path.join(episodeDir, 'cut-plan.json'),
  design: path.join(episodeDir, 'cut-source-design.json'),
  contracts: path.join(episodeDir, 'generated', 'manifest-contracts.json'),
  acquisition: path.join(episodeDir, 'generated', 'acquisition-queue.json'),
  state: path.join(episodeDir, 'production-state.json'),
};

function validate(paths = canonical) {
  return spawnSync(process.execPath, [validator, '--spec', paths.spec, '--narration', paths.narration, '--cut-plan', paths.cutPlan, '--design', paths.design, '--contracts', paths.contracts, '--state', paths.state, ...(paths.intake ? ['--source-intake-root', paths.intake] : [])], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

async function fixture(mutateSpec = () => {}, mutateOutput = () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'episode-spec-'));
  const spec = JSON.parse(await readFile(canonical.spec, 'utf8'));
  mutateSpec(spec);
  const specText = `${JSON.stringify(spec, null, 2)}\n`;
  const specPath = path.join(dir, 'episode-spec.json');
  await writeFile(specPath, specText, 'utf8');
  const outputs = buildEpisodePlanOutputs(spec, Buffer.from(specText));
  for (const [name, contents] of outputs) {
    const changed = mutateOutput(name, contents) ?? contents;
    await mkdir(path.dirname(path.join(dir, name)), {recursive: true});
    await writeFile(path.join(dir, name), changed, 'utf8');
  }
  const canonicalState = JSON.parse(await readFile(canonical.state, 'utf8'));
  const state = withDerivedProductionStateHashes(canonicalState, Buffer.from(specText));
  const statePath = path.join(dir, 'production-state.json');
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return {
    dir,
    paths: {spec: specPath, narration: path.join(dir, 'narration-plan.json'), cutPlan: path.join(dir, 'cut-plan.json'), design: path.join(dir, 'cut-source-design.json'), contracts: path.join(dir, 'generated/manifest-contracts.json'), state: statePath},
  };
}

test('canonical source-led episode spec binds all 36 meaning-led cuts while remaining blocked and unapproved', async () => {
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /36 cuts, 36 semantic planned beats.*17274 frames/);
  const spec = JSON.parse(await readFile(canonical.spec, 'utf8'));
  assert.equal(spec.cuts.length, 36);
  assert.equal(spec.cuts[35].visual_beats.length, 1);
  assert.ok(spec.cuts.every((cut) => cut.visual_beats.every((beat) => beat.stable_reading_hold.frames >= 60)));
  const routes = spec.cuts.reduce((counts, cut) => ({...counts, [cut.production_mode]: (counts[cut.production_mode] ?? 0) + 1}), {});
  assert.deepEqual(routes, {'omni': 9, 'remotion': 25, 'source-video': 2});
  assert.deepEqual(spec.intro_rules.fictional_case_notice.required_shot_ids, ['SH001', 'SH002', 'SH003']);
  assert.ok(spec.cuts.slice(0, 3).every((cut) => cut.text_surfaces.some((surface) =>
    surface.role === 'screen-chrome' && surface.literal_text === '가상 사례 · AI 재구성'
    && surface.channel_exception_id === 'source-rights-chrome' && surface.raster_beneath === false)));
  assert.ok(spec.cuts.every((cut) => cut.production_decision.human_review_status === 'pending' && cut.production_authority === false));
  assert.ok(spec.cuts.every((cut) => cut.visual_beats.every((beat) => beat.planned_operator === null
    && beat.action_intent.status === 'deferred-until-source-selection'
    && beat.preview_status === 'blocked-assets-pending')));
  assert.ok(spec.cuts.filter((cut) => ['source-video', 'source-photo', 'remotion'].includes(cut.production_mode))
    .every((cut) => cut.production_decision.asset_search_briefs.length > 0));
  const approved = spec.cuts.flatMap((cut) => cut.requirements.map((requirement) => ({shot_id: cut.shot_id, ...requirement}))).filter((requirement) => requirement.status === 'approved');
  assert.deepEqual(approved, []);
  const state = JSON.parse(await readFile(canonical.state, 'utf8'));
  assert.equal(state.stage, 'timing-draft');
  assert.equal(state.active_cut_root, null);
  assert.equal(state.cut_review.all_cuts_passed, false);
  assert.equal(state.omni_video_generation.status, 'blocked_until_all_cuts_passed');
  const contracts = JSON.parse(await readFile(canonical.contracts, 'utf8'));
  const acquisition = JSON.parse(await readFile(canonical.acquisition, 'utf8'));
  assert.ok(spec.cuts.filter((cut) => cut.production_mode === 'omni').every((cut) =>
    cut.source_ids.filter((id) => id.startsWith('FICTION-')).every((id) =>
      !cut.requirements.some((requirement) => requirement.source_id === id))));
  assert.ok(acquisition.requirements.every((requirement) => !String(requirement.source_id ?? '').startsWith('FICTION-')));
  const derivativeIds = [];
  for (const cut of spec.cuts) for (const requirement of cut.requirements.filter((item) => item.kind === 'transparent-derivative')) {
    derivativeIds.push(requirement.asset_id);
    const contract = contracts.cuts.find((item) => item.shot_id === cut.shot_id);
    const component = contract.visual_components.find((item) => item.asset_requirement_id === requirement.requirement_id);
    assert.equal(component.asset_id, requirement.asset_id);
    assert.notEqual(component.asset_id, requirement.requirement_id);
  }
  const queuedDerivativeIds = acquisition.requirements.filter((item) => item.requirement_kind === 'transparent-derivative').map((item) => item.asset_id);
  assert.deepEqual([...derivativeIds].sort(), [...queuedDerivativeIds].sort());
  assert.equal(new Set(derivativeIds).size, derivativeIds.length);
  const designedAssetIds = spec.cuts.flatMap((cut) => cut.requirements.filter((item) => item.kind === 'designed-asset').map((item) => item.asset_id));
  const queuedDesignedAssetIds = acquisition.requirements.filter((item) => item.requirement_kind === 'designed-asset').map((item) => item.asset_id);
  assert.deepEqual([...designedAssetIds].sort(), [...queuedDesignedAssetIds].sort());
  assert.equal(new Set(designedAssetIds).size, designedAssetIds.length);
});

test('drift validator rejects a hand-edited generated compatibility output', async () => {
  const sample = await fixture(undefined, (name, contents) => name === 'narration-plan.json' ? `${contents} ` : contents);
  try {
    const result = validate(sample.paths);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /narration-plan\.json: byte drift/);
  } finally { await rm(sample.dir, {recursive: true, force: true}); }
});

test('spec validator rejects routing, deferred-action, approval and beat-integrity regressions', async (t) => {
  const cases = [
    ['operator cannot be claimed before source selection', (spec) => {
      const beat = spec.cuts[0].visual_beats[0];
      beat.planned_operator = {
        action_id: `${beat.beat_id}-premature`, status: 'planned-not-implemented', operator_id: 'transform.tween@1',
        required_capability: 'layer-transform', target_component_id: 'sh001-visual-main',
        action_semantic: 'move-subject', observable_change: `${beat.purpose}: move the selected real source after selection`,
        parameters: {from_x: 0, to_x: 1}, start_frame: beat.narration_window.start_frame, end_frame_exclusive: beat.stable_reading_hold.start_frame - 1,
      };
    }, /planned_operator must be null while the action is deferred/],
    ['deferred action needs an observable intent', (spec) => { spec.cuts[0].visual_beats[0].action_intent.observable_action = ''; }, /action_intent\.observable_action must be nonblank/],
    ['approval without provenance records', (spec) => { spec.cuts[1].requirements[0].status = 'approved'; }, /approved material needs integer media ID and safe ledger path/],
    ['route must match selected production mode', (spec) => { spec.cuts[0].production_decision.mode = 'remotion'; }, /mode must match production_mode/],
    ['source search must remain attached to a real or Remotion cut', (spec) => { spec.cuts.find((cut) => cut.production_mode === 'remotion').production_decision.asset_search_briefs = []; }, /source and Remotion routes require at least one asset search brief/],
    ['rejected alternatives need a reason', (spec) => { spec.cuts[0].production_decision.rejected_modes.omni = ''; }, /rejected_modes\.omni must be nonblank/],
    ['focal disappears during hold', (spec) => { const beat = spec.cuts[0].visual_beats[0]; beat.component_visibility.find((item) => item.component_id === beat.presentation.focal.component_id).states.at(-1).end_frame_exclusive = beat.stable_reading_hold.end_frame_exclusive - 1; }, /focal must remain focused throughout/],
    ['support hidden overlap', (spec) => { const beat = spec.cuts.find((cut) => cut.visual_beats[0].presentation.supporting.length > 0).visual_beats[0]; beat.presentation.hidden.push({component_id: beat.presentation.supporting[0].component_id, until_frame: beat.narration_window.end_frame_exclusive}); }, /mutually exclusive/],
    ['hidden boundary bypass', (spec) => { const beat = spec.cuts[0].visual_beats[0]; beat.presentation.hidden.push({component_id: 'unrendered-optional-layer', until_frame: beat.narration_window.start_frame}); }, /hidden\.until_frame must cover/],
    ['opening disclosure cannot disappear before cut review', (spec) => { spec.cuts[0].text_surfaces = []; }, /opening fictional-case\/AI-origin notice must be visible from frame 0/],
    ['Omni gate cannot use an old fixed cut count', (spec) => { spec.route_catalog['IMAGEGEN-OMNI'] = '48컷 PASS 뒤 Omni motion'; }, /Omni route catalog must require individual PASS/],
  ];
  for (const [name, mutate, expected] of cases) await t.test(name, async () => {
    const sample = await fixture(mutate);
    try {
      const result = validate(sample.paths);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    } finally { await rm(sample.dir, {recursive: true, force: true}); }
  });
});

test('generated route contract and derived state hashes follow the edited spec deterministically', async () => {
  const spec = JSON.parse(await readFile(canonical.spec, 'utf8'));
  const selected = spec.cuts[0];
  selected.production_decision.reason = `${selected.production_decision.reason} 변경된 편집 의도.`;
  selected.visual_beats[0].action_intent.observable_action = '출처 선택 뒤 확인할 실제 동작을 바꾼다.';
  const bytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`);
  const generated = JSON.parse(buildEpisodePlanOutputs(spec, bytes).get('generated/manifest-contracts.json'));
  const contract = generated.cuts.find((cut) => cut.shot_id === selected.shot_id);
  assert.equal(contract.production_decision.reason, selected.production_decision.reason);
  assert.equal(contract.visual_beats[0].action_intent.observable_action, selected.visual_beats[0].action_intent.observable_action);
  assert.deepEqual(contract.planned_motion_actions, []);
  const state = withDerivedProductionStateHashes({stage: 'timing-draft', cut_review: {all_cuts_passed: false}, draft_inputs: {narration_plan: 'keep-me'}}, bytes);
  assert.equal(state.stage, 'timing-draft');
  assert.equal(state.cut_review.all_cuts_passed, false);
  assert.equal(state.draft_inputs.narration_plan, 'keep-me');
  assert.equal(state.draft_inputs.episode_spec_sha256, generated.source_spec_sha256);
});

test('pre-PASS Omni intake rejects arbitrary filenames across supported video extensions', async (t) => {
  for (const extension of ['.mov', '.webm', '.mkv', '.m4v']) await t.test(extension, async () => {
    const sample = await fixture();
    try {
      sample.paths.intake = path.join(sample.dir, 'intake');
      await mkdir(sample.paths.intake, {recursive: true});
      await writeFile(path.join(sample.paths.intake, `anything-${Date.now()}${extension}`), 'not-even-a-valid-video');
      const result = validate(sample.paths);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /source-intake Omni: pre-PASS video forbidden/);
    } finally { await rm(sample.dir, {recursive: true, force: true}); }
  });
});
