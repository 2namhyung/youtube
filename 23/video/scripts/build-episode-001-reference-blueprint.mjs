import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const gatesPath = path.join(episodeDir, 'reference-style-gates.json');
const outputPath = path.join(episodeDir, 'generated', 'reference-cut-blueprint.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');

const specBytes = await readFile(specPath);
const gatesBytes = await readFile(gatesPath);
const spec = JSON.parse(specBytes.toString('utf8'));
const gates = JSON.parse(gatesBytes.toString('utf8'));
if (gates.schema_version !== 4 || gates.grammar_allowlist?.selection_scope !== 'per-cut-or-visual-beat') throw new Error('reference blueprint requires the canonical per-cut/beat transfer gate');

const sourceBlocked = gates.source_gate?.pass !== true;
const cuts = spec.cuts.map((cut) => ({
  shot_id: cut.shot_id,
  production_mode: cut.production_mode,
  viewer_takeaway: cut.viewer_takeaway,
  temporary_narration: cut.draft_narration,
  provisional_timing: cut.timing,
  visual_purpose: cut.visual_purpose,
  visual_action: cut.visual_action,
  reference_transfer: {
    status: sourceBlocked ? 'pending-source-approval-and-materialization' : 'decision-required',
    decision_authority: 'active-cut-manifest-bound-to-this-generated-cut-contract',
    allowed_decisions: ['applicable', 'not-applicable'],
    rationale: sourceBlocked
      ? 'Reference grammar selection is intentionally deferred until the episode source input and its semantic role are approved and materialized.'
      : 'Select only grammar that matches the approved episode source relationship; no sample or family coverage quota applies.',
    selected_grammar_ids: [],
    episode_input_bindings: [],
  },
  lifecycle: {
    opening: 'background-only before the first active interval',
    reveal: 'independent focal/support targets enter only in declared beat windows',
    ending: 'required components preserve hierarchy for at least 60 stable frames',
  },
  visual_beats: cut.visual_beats.map((beat) => ({
    beat_id: beat.beat_id,
    viewer_takeaway: beat.viewer_takeaway,
    narration_window: beat.narration_window,
    focal_component_id: beat.presentation.focal.component_id,
    focal_slot: beat.presentation.focal.slot,
    supporting_component_ids: beat.presentation.supporting.map((item) => item.component_id),
    hidden_components: beat.presentation.hidden,
    layout_template: beat.presentation.layout_template,
    planned_operator: beat.planned_operator,
    stable_reading_hold: beat.stable_reading_hold,
    reference_transfer_decision: sourceBlocked ? 'pending-source-approval-and-materialization' : 'applicable-or-not-applicable-required',
    preview_status: beat.preview_status,
  })),
  independent_asset_targets: cut.components.filter((component) => component.render_kind === 'asset').map((component) => ({
    component_id: component.component_id,
    asset_requirement_id: component.asset_requirement_id,
    semantic_role: component.semantic_role,
    presentation_slot: component.presentation_slot,
    implementation_status: component.implementation_status,
  })),
  source_ids: cut.source_ids,
  missing_inputs: cut.missing_inputs,
  transition: {
    ...cut.transition,
    hard_cut_allowed_between_any_modes: gates.transition_policy.hard_cut_allowed_between_any_modes,
    pair_artifact_required_before_claim: ['scene-to-scene', 'morph'].includes(cut.transition.type),
  },
  post_cut_audit: Object.fromEntries(gates.post_cut_prohibition_audit.map((rule) => [rule, 'pending-artifact'])),
  readiness: sourceBlocked ? 'blocked-pending-source-approval-and-materialization' : 'pending-explicit-reference-transfer-decisions',
}));

const blueprint = {
  _generated: {
    do_not_edit: true,
    generator: 'video/scripts/build-episode-001-reference-blueprint.mjs',
    source_episode_spec: relative(specPath),
    source_episode_spec_sha256: sha256(specBytes),
    source_reference_transfer_gates: relative(gatesPath),
    source_reference_transfer_gates_sha256: sha256(gatesBytes),
  },
  schema_version: 2,
  episode_id: spec.episode_id,
  status: sourceBlocked ? 'blocked-pending-source-approval-and-materialization' : 'pending-reference-transfer-decisions',
  cut_count: cuts.length,
  selection_scope: gates.grammar_allowlist.selection_scope,
  coverage_quota: null,
  all_samples_must_be_used: false,
  source_gate: gates.source_gate,
  grammar_allowlist: gates.grammar_allowlist.contract,
  style_direction_gate: gates.style_direction_gate,
  playable_motion_gate: gates.playable_motion_gate,
  transition_policy: gates.transition_policy,
  post_cut_prohibition_audit: gates.post_cut_prohibition_audit,
  cuts,
};

await mkdir(path.dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(blueprint, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({output: relative(outputPath), sha256: sha256(await readFile(outputPath)), cuts: cuts.length, status: blueprint.status}, null, 2));
