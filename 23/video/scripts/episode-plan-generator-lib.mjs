import {createHash} from 'node:crypto';

export const GENERATED_FILES = ['narration-plan.json', 'cut-plan.json', 'cut-source-design.json', 'generated/manifest-contracts.json'];

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function generatedMarker(specBytes) {
  return {
    do_not_edit: true,
    source: 'episode-spec.json',
    source_sha256: sha256(specBytes),
    generator: 'video/scripts/generate-episode-001-plans.mjs',
    marker_schema_version: 1,
  };
}

export function withDerivedProductionStateHashes(state, specBytes, spec = null) {
  const footageFirstRevision = spec?.editorial_revision?.id === 'ep001-live-action-footage-first-v1';
  const sourceFirstRevision = ['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec?.editorial_revision?.id);
  const editorialRevision = footageFirstRevision || sourceFirstRevision;
  const revisionId = spec?.editorial_revision?.id;
  const supersededRenderAuthorities = editorialRevision && state.render_authority?.cut_root
    ? [...(state.superseded_render_authorities ?? []), {
      ...state.render_authority,
      superseded_by: revisionId,
      production_authority: false,
    }]
    : state.superseded_render_authorities;
  const supersededEditorialState = editorialRevision && !state.superseded_editorial_state
    ? {
      superseded_by: revisionId,
      production_authority: false,
      style_calibration: state.style_calibration,
      reference_calibration: state.reference_calibration,
      style_frame_review: state.style_frame_review,
      reference_style_gates: state.reference_style_gates,
    }
    : state.superseded_editorial_state;
  return {
    ...state,
    ...(editorialRevision ? {
      render_authority: {
        status: 'blocked-superseded-by-editorial-revision',
        cut_root: null,
        catalog: null,
        catalog_sha256: null,
        manifest_set_sha256: null,
        production_authority: false,
        note: `The prior work root does not match ${revisionId}. It is historical review material only.`,
      },
      superseded_render_authorities: supersededRenderAuthorities,
      superseded_editorial_state: supersededEditorialState,
      style_calibration: {
        status: 'blocked-superseded-by-editorial-revision',
        authority: null,
        candidate_root: null,
        shot_ids: [],
        playable_shot_ids: [],
        keyframe_gallery_shot_ids: [],
        user_approved: false,
        approval_marker: null,
        note: `No style calibration candidate exists for ${revisionId}.`,
      },
      reference_calibration: {
        ...(state.superseded_editorial_state?.reference_calibration ?? state.reference_calibration),
        blockers: ['The approved-script source-first candidates still need human semantic, rights and materialization review.'],
        note: 'The previously approved grammar allowlist remains intact. The Hanbang analysis guides footage cadence but does not claim a new grammar PASS.',
      },
      style_frame_review: {
        status: 'not-started-pending-reference-and-source-gates',
        candidate_id: null,
        representative_beats: ['opening', 'evidence-or-change', 'final-summary'],
        manifest: null,
        manifest_sha256: null,
        user_approved: false,
        approval_marker: null,
        approval_marker_sha256: null,
        approved_inputs_sha256: null,
        production_asset_decomposition_status: 'blocked-pending-reference-and-source-review',
        blockers: [
          {scope:'episode-001', reason:'The source-first candidate plan still needs human semantic and rights review plus materialization.'},
          {scope:'episode-001', reason:'The new reference-calibration direction has not received human PASS.'},
        ],
        note: 'Blockers from the superseded visual plan do not apply to this revision.',
      },
      reference_style_gates: state.superseded_editorial_state?.reference_style_gates ?? state.reference_style_gates,
    } : {}),
      draft_inputs: {
      ...state.draft_inputs,
      episode_spec: 'video/episodes/episode-001/episode-spec.json',
      episode_spec_sha256: sha256(specBytes),
      narration_generated_source_sha256: sha256(specBytes),
    },
    ...(sourceFirstRevision ? {expected_cut_count: spec.cuts.length} : {}),
  };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function narrationOutput(spec, marker) {
  return {
    _generated: marker,
    ...spec.narration_contract,
    schema_version: 1,
    episode_id: spec.episode_id,
    title: spec.title,
    fps: spec.timing_authority.fps,
    draft_timing_assumption: {
      ...spec.narration_contract.draft_timing_assumption,
      compact_korean_chars_per_second: spec.timing_authority.compact_korean_chars_per_second,
    },
    runtime_target_seconds: {min: spec.timing_authority.target_seconds[0], max: spec.timing_authority.target_seconds[1]},
    cuts: spec.cuts.map((cut) => ({
      shot_id: cut.shot_id,
      production_mode: cut.production_mode,
      media_strategy: cut.media_strategy,
      draft_narration: cut.draft_narration,
      visual_purpose: cut.visual_purpose,
      visual_action: cut.visual_action,
      source_ids: cut.source_ids,
      estimated_voice_seconds: Array.isArray(cut.estimated_voice_seconds) ? cut.estimated_voice_seconds : [Number((cut.estimated_voice_seconds * 0.9).toFixed(3)), Number((cut.estimated_voice_seconds * 1.1).toFixed(3))],
      pre_roll_frames: cut.pre_roll_frames,
      post_hold_frames: cut.post_hold_frames,
      transition_overlap_frames: cut.transition_overlap_frames,
      duration_frames: null,
      master_occupancy_frames: null,
    })),
  };
}

function sourceDesignOutput(spec, marker) {
  return {
    _generated: marker,
    schema_version: 2,
    episode_id: spec.episode_id,
    status: 'generated-compatibility-output / edit-episode-spec-only',
    planned_cut_count: spec.cuts.length,
    narration_authority: './narration-plan.json',
    manual_authority: './episode-spec.json',
    timing_authority: {
      ...spec.timing_authority,
      rule: 'episode-spec.json의 임시 대본·사용자 실측 발화속도·pre/post/overlap만 provisional timing 권한이다.',
    },
    route_catalog: spec.route_catalog,
    global_derivative_policy: spec.global_derivative_policy,
    cuts: spec.cuts.map((cut) => ({
      shot_id: cut.shot_id,
      viewer_takeaway: cut.viewer_takeaway,
      usage_layer: cut.usage_layer,
      production_decision: cut.production_decision,
      production_mode: cut.production_mode,
      media_strategy: cut.media_strategy,
      acquisition: cut.acquisition,
      imagegen_assets: cut.imagegen_assets ?? [],
      designed_assets: cut.designed_assets,
      transparent_derivatives: cut.transparent_derivatives,
      evidence_originals: cut.evidence_originals,
      requirements: cut.requirements,
      presentation: cut.presentation,
      visual_beats: cut.visual_beats,
      document_contract: cut.document_contract,
      timing: cut.timing,
      transition: cut.transition,
      missing_inputs: cut.missing_inputs,
      fallback: cut.fallback,
    })),
  };
}

function compatibilityCard(cut, index, closing = false) {
  const assets = cut.requirements.map((requirement) => requirement.asset_id ?? requirement.source_id ?? requirement.requirement_id);
  const card = {
    shot_id: cut.shot_id,
    production_mode: cut.production_mode,
    production_decision: cut.production_decision,
    media_strategy: cut.media_strategy,
    narration_ref: `narration-plan.json#/cuts/${index}`,
    narration: cut.draft_narration,
    visual_purpose: cut.visual_purpose,
    background: cut.media_strategy.dominant_surface,
    assets: assets.length > 0 ? assets : [`${cut.shot_id}-blocked-input`],
    source_ids: cut.source_ids,
    source_status: cut.requirements.every((requirement) => requirement.status === 'approved') ? 'approved' : 'blocked; see episode-spec requirements',
    effects: [],
    visual_action: cut.visual_action,
    transition_out: cut.transition.intent,
  };
  if (closing) {
    card.transition_in = index > 0 ? `generated from ${cut.shot_id} presentation contract` : 'none';
    card.final_hold = `${cut.timing.reading_hold_frames} frame stable reading hold`;
  }
  return card;
}

function cutPlanOutput(spec, marker) {
  return {
    _generated: marker,
    schema_version: 3,
    episode_id: spec.episode_id,
    title: spec.title,
    status: 'generated-compatibility-output / edit-episode-spec-only',
    manual_authority: './episode-spec.json',
    cut_design: './cut-source-design.json',
    narration_plan: './narration-plan.json',
    production_state: './production-state.json',
    runtime: {
      target_seconds: spec.timing_authority.target_seconds,
      provisional_seconds: spec.timing_authority.provisional_master_seconds,
      provisional_frames: spec.timing_authority.provisional_master_frames,
      provisional_note: 'episode-spec timing authority에서 결정론적으로 생성됨; final 사용자 음성 전에는 확정하지 않는다.',
    },
    planned_cut_count: spec.cuts.length,
    detailed_intro_and_action_cut_count: 15,
    detailed_closing_cut_count: 8,
    background_contract: spec.background_contract,
    intro_rules: spec.intro_rules,
    intro_source_candidates: spec.intro_source_candidates,
    cuts: spec.cuts.slice(0, 15).map((cut, index) => compatibilityCard(cut, index)),
    closing_cuts: spec.cuts.slice(Math.max(0, spec.cuts.length - 8)).map((cut, offset) => compatibilityCard(cut, Math.max(0, spec.cuts.length - 8) + offset, true)),
    continuation: {
      shot_ids: `SH016–SH${String(spec.cuts.length).padStart(3, '0')}`,
      all_shot_ids: spec.cuts.slice(15).map((cut) => cut.shot_id),
      source_of_truth: 'episode-spec.json',
      rule: 'compatibility output only; source, narration, beats and transitions are generated from episode-spec.json',
      required_transition: '전환은 episode-spec의 cut별 intent를 따르며, pair artifact 검수 전에는 morph나 scene-to-scene 구현을 주장하지 않는다.',
    },
    production_gates: spec.production_gates,
  };
}

function sourceRequirementAssetId(cut, sourceId) {
  return cut.requirements.find((requirement) => requirement.source_id === sourceId && requirement.kind === 'source-original')?.asset_id
    ?? cut.requirements.find((requirement) => requirement.source_id === sourceId)?.asset_id
    ?? `${cut.shot_id}-${String(sourceId).toLowerCase()}`;
}

function visibilityTimeline(cut, componentId) {
  const timeline = cut.visual_beats.flatMap((beat) => (beat.component_visibility ?? [])
    .filter((timeline) => timeline.component_id === componentId)
    .flatMap((timeline) => timeline.states)
    .filter((state) => state.state !== 'hidden')
    .map((state) => ({state: state.state, start_frame: state.start_frame, end_frame: state.end_frame_exclusive})));
  return timeline.filter((state, index) => timeline.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(state)) === index)
    .sort((left, right) => left.start_frame - right.start_frame || left.end_frame - right.end_frame);
}

const plannedOperators = (beat) => {
  if (Array.isArray(beat.planned_operators)) return beat.planned_operators.filter(Boolean);
  return beat.planned_operator ? [beat.planned_operator] : [];
};

function documentEvidence(cut, componentId) {
  const contract = cut.document_contract;
  if (!contract) return undefined;
  const phaseEntry = Object.entries(contract.phases).find(([, phase]) => phase.component_id === componentId);
  if (!phaseEntry) return undefined;
  const [phase, phaseConfig] = phaseEntry;
  const phaseSourceId = phaseConfig.source_id ?? contract.source_id;
  const common = {
    evidence_id: `${cut.shot_id}-legal-evidence`,
    phase: phase === 'normalized-crop' ? 'crop' : phase === 'exact-retypeset-quote' ? 'quote' : 'overview',
    source_asset_id: sourceRequirementAssetId(cut, phaseSourceId),
    source_id: phaseSourceId,
    source_label: contract.source_label_ko ?? contract.source_id,
    verification_status: phase === 'exact-retypeset-quote'
      ? contract.exact_retypeset_quote.status
      : phase === 'normalized-crop' && contract.normalized_crop.status === 'verified'
        ? 'verified'
        : cut.requirements.some((requirement) => requirement.source_id === contract.source_id && requirement.materialization_scope === 'statutory-document-content')
          ? 'verified-scoped-derivative'
          : 'blocked-source-materialization',
  };
  if (phase === 'normalized-crop') return {...common, crop_normalized: contract.normalized_crop.region};
  if (phase === 'exact-retypeset-quote') return {
    ...common,
    exact_quote: contract.exact_retypeset_quote.text,
    quote_font_px: contract.exact_retypeset_quote.font_px_1080,
    max_lines: contract.exact_retypeset_quote.max_lines,
    source_locator: contract.exact_retypeset_quote.source_locator,
    reviewer: contract.exact_retypeset_quote.reviewer,
    review_sha256: contract.exact_retypeset_quote.review_sha256,
  };
  return common;
}

function manifestContractForCut(spec, cut, specHash) {
  const components = cut.components.map((component) => {
    const requirement = cut.requirements.find((item) => item.requirement_id === component.asset_requirement_id);
    return ({
    component_id: component.component_id,
    asset_id: requirement?.asset_id ?? (component.render_kind === 'asset' ? component.component_id : null),
    asset_requirement_id: component.asset_requirement_id,
    semantic_role: component.semantic_role,
    render_kind: component.render_kind,
    compositing: component.compositing,
    motion_expectation: component.motion_expectation,
    atomicity: component.atomicity,
    presentation_slot: component.presentation_slot,
    visibility_timeline: visibilityTimeline(cut, component.component_id),
    implementation_status: component.implementation_status,
    ...(documentEvidence(cut, component.component_id) ? {document_evidence: documentEvidence(cut, component.component_id)} : {}),
  });});
  const plannedMotionActions = cut.visual_beats.flatMap((beat) => plannedOperators(beat).map((action, index) => ({
    action_id: action.action_id ?? `${beat.beat_id}-planned-action-${index + 1}`,
    editorial_intent: action.observable_change,
    operator_id: action.operator_id,
    target_component_id: action.target_component_id,
    params: action.parameters,
    start_frame: action.start_frame,
    end_frame: action.end_frame_exclusive,
    required_capability: action.required_capability,
    action_semantic: action.action_semantic,
    implementation_status: action.status,
  })));
  const visualBeats = cut.visual_beats.map((beat) => ({
    beat_id: beat.beat_id,
    purpose: beat.purpose,
    message: beat.viewer_takeaway,
    start_frame: beat.narration_window.start_frame,
    end_frame: beat.narration_window.end_frame_exclusive,
    component_ids: beat.component_ids ?? [...new Set([
      beat.presentation.focal.component_id,
      ...beat.presentation.supporting.map((component) => component.component_id),
      ...plannedOperators(beat).map((action) => action.target_component_id),
    ])],
    required_capabilities: beat.required_capabilities ?? [...new Set(plannedOperators(beat).map((action) => action.required_capability))],
    focal_component_id: beat.presentation.focal.component_id,
    supporting_component_ids: beat.presentation.supporting.map((component) => component.component_id),
    hidden_component_ids: beat.presentation.hidden.map((component) => component.component_id),
    layout_template: beat.presentation.layout_template,
    narration_window: {start_frame: beat.narration_window.start_frame, end_frame: beat.narration_window.end_frame_exclusive},
    reading_hold: {start_frame: beat.stable_reading_hold.start_frame, end_frame: beat.stable_reading_hold.end_frame_exclusive, minimum_seconds: 2},
    document_phase: beat.document_phase,
    action_intent: beat.action_intent,
    preview_status: beat.document_phase === 'normalized-crop'
      ? (cut.document_contract.normalized_crop.status === 'verified' ? 'ready' : 'blocked-assets-pending')
      : beat.document_phase === 'exact-retypeset-quote'
        ? (cut.document_contract.exact_retypeset_quote.status === 'verified' ? 'ready' : 'blocked-transcription-pending')
        : beat.preview_status,
  }));
  const core = {
    shot_id: cut.shot_id,
    manifest_schema_version: 3,
    production_mode: cut.production_mode,
    production_decision: cut.production_decision,
    media_strategy: cut.media_strategy,
    duration_frames: cut.timing.provisional_duration_frames,
    source_ids: cut.source_ids,
    source_requirements: cut.requirements,
    designed_assets: cut.designed_assets,
    viewer_takeaway: cut.viewer_takeaway,
    visual_action: cut.visual_action,
    visual_components: components,
    visual_beats: visualBeats,
    planned_motion_actions: plannedMotionActions,
    document_contract: cut.document_contract,
    transition: cut.transition,
    implementation_status: 'planned-not-implemented',
  };
  return {
    source_spec_sha256: specHash,
    source_cut_sha256: sha256(Buffer.from(JSON.stringify(cut))),
    manifest_contract_sha256: sha256(Buffer.from(JSON.stringify(core))),
    ...core,
  };
}

function manifestContractsOutput(spec, marker) {
  return {
    _generated: marker,
    schema_version: 1,
    episode_id: spec.episode_id,
    source_spec_sha256: marker.source_sha256,
    manifest_schema_version: 3,
    status: 'planned-not-implemented',
    cuts: spec.cuts.map((cut) => manifestContractForCut(spec, cut, marker.source_sha256)),
  };
}

export function buildEpisodePlanOutputs(spec, specBytes) {
  const marker = generatedMarker(specBytes);
  return new Map([
    ['narration-plan.json', json(narrationOutput(spec, marker))],
    ['cut-plan.json', json(cutPlanOutput(spec, marker))],
    ['cut-source-design.json', json(sourceDesignOutput(spec, marker))],
    ['generated/manifest-contracts.json', json(manifestContractsOutput(spec, marker))],
  ]);
}
