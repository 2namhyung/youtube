import {validateVisualContractV2} from './visual-contract-v2.mjs';
import {validateManifestAuthoringDeclaration} from './production-authoring-contract.mjs';

export const LAYOUT_TEMPLATES = new Set(['experience-hero', 'document-focus', 'process-flow', 'before-after']);
export const PRESENTATION_STATES = new Set(['entering', 'focused', 'supporting', 'exiting', 'final-summary']);
export const REFERENCE_GRAMMAR_RUNTIME_BINDINGS = Object.freeze({
  'independent-target-translate': ['transform.spring@1', 'transform.tween@1'],
  'staggered-object-accumulation': ['transform.spring@1', 'transform.tween@1', 'opacity.tween@1'],
  'plot-local-progressive-reveal': ['chart.reveal@1'],
  'source-surface-state-progression': ['mask.inset@1', 'document.highlight@1'],
});

const integerRange = (range, duration) => Number.isInteger(range?.start_frame)
  && Number.isInteger(range?.end_frame)
  && range.start_frame >= 0
  && range.end_frame > range.start_frame
  && range.end_frame <= duration;

const overlaps = (a, b) => a.start_frame < b.end_frame && a.end_frame > b.start_frame;
const pathIsAbsolute = (value) => /^(?:[a-z]:[\\/]|[\\/]{2}|\/)/iu.test(value);
const normalizedCrop = (crop) => crop
  && ['x', 'y', 'width', 'height'].every((key) => typeof crop[key] === 'number' && Number.isFinite(crop[key]))
  && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0
  && crop.x + crop.width <= 1 && crop.y + crop.height <= 1;

export function resolvePresentationState(component, frame) {
  const interval = (component?.visibility_timeline ?? []).find((item) => frame >= item.start_frame && frame < item.end_frame);
  return interval?.state ?? 'hidden';
}

export function validateVisualContractV3(manifest, options = {}) {
  const failures = [];
  const requireEvidenceVerification = options.requireEvidenceVerification === true;
  if (manifest?.schema_version !== 3) return ['schema_version must be 3'];
  const v2Compatible = {...manifest, schema_version: 2};
  for (const failure of validateVisualContractV2(v2Compatible, options)) failures.push(failure);
  if (![1, 2].includes(manifest.presentation_contract_version)) failures.push('presentation_contract_version must be 1 or 2');
  if (manifest.mobile_review?.width !== 360 || manifest.mobile_review?.height !== 203) failures.push('mobile review must expose a 360x203 artifact');
  if (manifest.mobile_review?.requires_human_review !== true) failures.push('machine QA cannot replace human semantic/artistic review');
  if ((manifest.mobile_review?.minimum_quote_font_px_at_1080p ?? 0) < 72) failures.push('mobile review quote minimum must be at least 72px at 1080p');
  if (manifest.mobile_review?.maximum_quote_lines !== 2) failures.push('mobile review quote line limit must be 2');
  if (manifest.typography_surface_contract_version !== undefined && ![1, 2].includes(manifest.typography_surface_contract_version)) failures.push('typography surface contract version must be 1 or 2');
  failures.push(...validateManifestAuthoringDeclaration(manifest, options));

  const components = new Map((manifest.visual_components ?? []).map((component) => [component.component_id, component]));
  const transfer = manifest.reference_grammar_transfer;
  if (transfer !== undefined) {
    if (transfer?.version !== 1) failures.push('reference_grammar_transfer.version must be 1');
    if (transfer?.contract_path !== 'video/episodes/episode-001/reference-grammar-contract.json') failures.push('reference_grammar_transfer must bind the canonical grammar contract');
    if (!/^[a-f0-9]{64}$/iu.test(transfer?.contract_sha256 ?? '')) failures.push('reference_grammar_transfer.contract_sha256 must be a SHA-256');
    if (options.referenceGrammarContractSha256 && transfer?.contract_sha256 !== options.referenceGrammarContractSha256) failures.push('reference_grammar_transfer contract SHA does not match the local grammar contract');
    if (transfer?.production_authority !== false) failures.push('reference_grammar_transfer cannot grant production authority');
    if (!Array.isArray(transfer?.unmapped_visual_grammar) || transfer.unmapped_visual_grammar.length !== 0) failures.push('reference_grammar_transfer.unmapped_visual_grammar must be empty');
    if (!Array.isArray(transfer?.novel_visual_grammar) || transfer.novel_visual_grammar.length !== 0) failures.push('reference_grammar_transfer.novel_visual_grammar must be empty');
    const approvedMotion = new Set((options.referenceGrammarContract?.categories?.motion_operator ?? []).map((entry) => entry.grammar_id));
    const actions = new Map((manifest.motion_actions ?? []).map((action) => [action.action_id, action]));
    const beatsById = new Map((manifest.visual_beats ?? []).map((beat) => [beat.beat_id, beat]));
    const bindingKeys = new Set();
    for (const binding of transfer?.bindings ?? []) {
      const key = `${binding.beat_id}|${binding.grammar_id}|${binding.action_id}`;
      if (bindingKeys.has(key)) failures.push(`${key}: duplicate reference grammar runtime binding`);
      bindingKeys.add(key);
      if (binding.category !== 'motion_operator') failures.push(`${key}: runtime transfer binding category must be motion_operator`);
      if (options.referenceGrammarContract && !approvedMotion.has(binding.grammar_id)) failures.push(`${key}: grammar_id is not in the approved motion allowlist`);
      const allowed = REFERENCE_GRAMMAR_RUNTIME_BINDINGS[binding.grammar_id];
      if (!allowed?.includes(binding.runtime_operator_id)) failures.push(`${key}: grammar has no validated mapping to ${String(binding.runtime_operator_id)}`);
      const action = actions.get(binding.action_id);
      if (!action || action.operator_id !== binding.runtime_operator_id || action.target_component_id !== binding.target_component_id) failures.push(`${key}: runtime action/operator/target binding does not match the manifest`);
      const beat = beatsById.get(binding.beat_id);
      if (!beat || !beat.component_ids?.includes(binding.target_component_id)) failures.push(`${key}: transfer target must belong to the declared visual beat`);
      if (!Array.isArray(binding.episode_source_ids) || binding.episode_source_ids.length === 0 || binding.episode_source_ids.some((sourceId) => typeof sourceId !== 'string' || !sourceId.trim())) failures.push(`${key}: episode_source_ids must identify at least one exact episode source`);
      if (!Array.isArray(binding.episode_input_bindings) || binding.episode_input_bindings.length === 0) failures.push(`${key}: episode_input_bindings must contain an exact local input path and SHA-256`);
      for (const input of binding.episode_input_bindings ?? []) {
        if (input?.target_component_id !== binding.target_component_id) failures.push(`${key}: episode input target does not match the runtime target`);
        if (typeof input?.input_path !== 'string' || !input.input_path.trim() || pathIsAbsolute(input.input_path)) failures.push(`${key}: episode input path must be a nonblank workspace-relative path`);
        if (!/^[a-f0-9]{64}$/iu.test(input?.input_sha256 ?? '')) failures.push(`${key}: episode input SHA-256 is required`);
      }
      if (!action || binding.action_frame_range?.start_frame !== action.start_frame || binding.action_frame_range?.end_frame !== action.end_frame) failures.push(`${key}: action_frame_range must match the bound runtime action`);
      if (!beat || binding.reading_hold?.start_frame !== beat.reading_hold?.start_frame || binding.reading_hold?.end_frame !== beat.reading_hold?.end_frame || binding.reading_hold?.minimum_frames !== 60 || (binding.reading_hold.end_frame - binding.reading_hold.start_frame) < 60) failures.push(`${key}: reading_hold must match the beat and contain at least 60 frames`);
      if (!binding.observable_delta?.trim()) failures.push(`${key}: observable_delta is required`);
      if (!['blocked-source-materialization', 'pending-playable-parity', 'passed-playable-parity'].includes(binding.status)) failures.push(`${key}: invalid transfer status`);
      if (binding.status === 'passed-playable-parity' && options.allowPassedPlayableParity !== true) failures.push(`${key}: playable parity PASS requires the parity-proof validator`);
    }
    if (!Array.isArray(transfer?.bindings) || transfer.bindings.length === 0) failures.push('reference_grammar_transfer.bindings must not be empty');
  }
  if (manifest.presentation_contract_version === 2) {
    const visibleThrough = (component, start, end) => {
      let cursor = start;
      for (const interval of (component?.visibility_timeline ?? []).filter((item) => item.state !== 'hidden').sort((a, b) => a.start_frame - b.start_frame)) {
        if (interval.end_frame <= cursor || interval.start_frame > cursor) continue;
        cursor = Math.max(cursor, interval.end_frame);
        if (cursor >= end) return true;
      }
      return cursor >= end;
    };
    for (const cue of manifest.text_cues ?? []) {
      if (!cue.target_component_id) failures.push(`${cue.cue_id}: presentation contract v2 explanatory cue requires target_component_id`);
      const target = cue.target_component_id ? components.get(cue.target_component_id) : undefined;
      if (cue.target_component_id && !target) failures.push(`${cue.cue_id}: target_component_id does not identify a presentation component`);
      const onSurfaceCue = cue.placement === 'on-surface' && cue.transform_binding === 'inherit-target-surface';
      if (cue.placement !== 'below-center' && !onSurfaceCue) failures.push(`${cue.cue_id}: presentation contract v2 explanatory cue placement must be below-center unless it is an explicit PNG surface overlay`);
      if (target && !visibleThrough(target, cue.start_frame, cue.end_frame)) failures.push(`${cue.cue_id}: target component must remain visible for the full cue lifetime`);
    }
  }
  if (manifest.typography_surface_contract_version === 1) {
    const assets = new Map((manifest.assets ?? []).map((asset) => [asset.asset_id, asset]));
    for (const cue of manifest.text_cues ?? []) {
      const targetBound = Boolean(cue.target_component_id || cue.target_asset_id);
      if (targetBound) {
        const target = cue.target_component_id ? components.get(cue.target_component_id) : undefined;
        const targetAsset = target?.asset_id ? assets.get(target.asset_id) : undefined;
        if (cue.transform_binding === 'inherit-target-surface') {
          if (!target || target.render_kind !== 'asset' || targetAsset?.media_type !== 'image/png') failures.push(`${cue.cue_id}: surface-rotated cue requires an explicit named PNG target_component_id`);
          if (cue.placement !== 'on-surface') failures.push(`${cue.cue_id}: surface-rotated cue must use on-surface placement`);
          if (cue.surface_anchor !== 'on-surface') failures.push(`${cue.cue_id}: surface-rotated cue surface_anchor must be on-surface`);
          if (!Number.isFinite(cue.surface_rotation_deg) || Math.abs(cue.surface_rotation_deg) > 30) failures.push(`${cue.cue_id}: target PNG surface rotation must be finite within ±30 degrees`);
        } else {
          if (cue.transform_binding !== 'target-position-level') failures.push(`${cue.cue_id}: detached target label must use target-position-level`);
          if (cue.placement !== 'below-center') failures.push(`${cue.cue_id}: detached target label must use below-center placement`);
          if (cue.surface_anchor !== 'target-below-center') failures.push(`${cue.cue_id}: detached target label surface_anchor must be target-below-center`);
          if (cue.surface_rotation_deg !== 0) failures.push(`${cue.cue_id}: detached target label must remain at 0 degrees`);
        }
      } else {
        if (cue.transform_binding !== 'screen-space-level') failures.push(`${cue.cue_id}: screen-space cue must remain screen-space-level`);
        if (cue.surface_anchor !== 'screen-space') failures.push(`${cue.cue_id}: screen-space cue surface_anchor must be screen-space`);
        if (cue.surface_rotation_deg !== 0) failures.push(`${cue.cue_id}: screen-space cue must remain at 0 degrees`);
      }
    }
  }
  for (const component of components.values()) {
    if (!component.presentation_slot) failures.push(`${component.component_id}: presentation_slot is required`);
    const timeline = component.visibility_timeline ?? [];
    let previousEnd = -1;
    for (const interval of timeline) {
      if (!integerRange(interval, manifest.duration_frames)) failures.push(`${component.component_id}: invalid visibility interval`);
      if (!PRESENTATION_STATES.has(interval.state)) failures.push(`${component.component_id}: invalid presentation state ${String(interval.state)}`);
      if (interval.start_frame < previousEnd) failures.push(`${component.component_id}: visibility intervals must not overlap`);
      previousEnd = interval.end_frame;
    }
    if (timeline.length && timeline[0].start_frame === 0 && manifest.review_profile === 'remotion-motion') failures.push(`${component.component_id}: playable components must be hidden before their first entry frame`);
  }

  const beats = manifest.visual_beats ?? [];
  let previousBeatEnd = -1;
  for (const beat of beats) {
    if (!beat.message?.trim()) failures.push(`${beat.beat_id}: viewer message is required`);
    if (!LAYOUT_TEMPLATES.has(beat.layout_template)) failures.push(`${beat.beat_id}: unsupported layout template ${String(beat.layout_template)}`);
    if (!components.has(beat.focal_component_id)) failures.push(`${beat.beat_id}: unknown focal component ${String(beat.focal_component_id)}`);
    const supportIds = beat.supporting_component_ids ?? [], hiddenIds = beat.hidden_component_ids ?? [];
    if (new Set(supportIds).size !== supportIds.length || new Set(hiddenIds).size !== hiddenIds.length || supportIds.includes(beat.focal_component_id) || hiddenIds.includes(beat.focal_component_id) || supportIds.some((id) => hiddenIds.includes(id))) failures.push(`${beat.beat_id}: focal, supporting and hidden component sets must be unique and mutually exclusive`);
    if (beat.start_frame < previousBeatEnd) failures.push(`${beat.beat_id}: beats must not overlap; only one focal target is allowed at a time`);
    previousBeatEnd = beat.end_frame;
    if (!integerRange(beat.narration_window, manifest.duration_frames) || beat.narration_window.start_frame < beat.start_frame || beat.narration_window.end_frame > beat.end_frame) failures.push(`${beat.beat_id}: narration_window must be inside the beat`);
    if (!integerRange(beat.reading_hold, manifest.duration_frames) || beat.reading_hold.start_frame < beat.start_frame || beat.reading_hold.end_frame > beat.end_frame) failures.push(`${beat.beat_id}: reading_hold must be inside the beat`);
    const holdFrames = (beat.reading_hold?.end_frame ?? 0) - (beat.reading_hold?.start_frame ?? 0);
    if ((beat.reading_hold?.minimum_seconds ?? 0) < 2 || holdFrames < manifest.fps * 2) failures.push(`${beat.beat_id}: stable reading hold must be at least 2 seconds`);
    for (const id of [...(beat.supporting_component_ids ?? []), ...(beat.hidden_component_ids ?? [])]) if (!components.has(id)) failures.push(`${beat.beat_id}: unknown presentation component ${id}`);
    const holdsState = (id, allowed) => (components.get(id)?.visibility_timeline ?? []).some((interval) => allowed.includes(interval.state) && interval.start_frame <= beat.reading_hold.start_frame && interval.end_frame >= beat.reading_hold.end_frame);
    if (requireEvidenceVerification && !holdsState(beat.focal_component_id, ['focused', 'final-summary'])) failures.push(`${beat.beat_id}: focal component must remain focused throughout reading hold`);
    if (requireEvidenceVerification) for (const id of beat.supporting_component_ids ?? []) if (!holdsState(id, ['supporting'])) failures.push(`${beat.beat_id}: supporting component must remain supporting throughout reading hold`);
    if (requireEvidenceVerification) for (const id of beat.hidden_component_ids ?? []) if ((components.get(id)?.visibility_timeline ?? []).some((interval) => interval.start_frame < beat.end_frame && interval.end_frame > beat.start_frame)) failures.push(`${beat.beat_id}: hidden component has a visible interval inside the beat`);
    if (requireEvidenceVerification && manifest.review_profile === 'source-photo-treatment' && beat.preview_status === 'ready') {
      for (const id of [beat.focal_component_id, ...(beat.supporting_component_ids ?? [])]) {
        const component = components.get(id);
        if (component?.implementation_status !== 'implemented') failures.push(`${beat.beat_id}: ready source-photo component ${id} must be implemented`);
        if (component?.render_kind === 'asset' && !(manifest.assets ?? []).some((asset) => asset.asset_id === component.asset_id)) failures.push(`${beat.beat_id}: ready source-photo asset component ${id} has no observable render target`);
        if (component?.render_kind === 'svg-path' && !component.svg_path) failures.push(`${beat.beat_id}: ready source-photo SVG component ${id} has no observable path`);
      }
    }
    const forbiddenTargets = new Set([
      ...[...components.values()].filter((component) => component.render_kind === 'camera').map((component) => component.component_id),
      ...[...components.values()].filter((component) => component.document_evidence).map((component) => component.component_id),
    ]);
    for (const action of manifest.motion_actions ?? []) {
      if (forbiddenTargets.has(action.target_component_id) && overlaps(action, beat.reading_hold)) failures.push(`${beat.beat_id}: camera/document motion may not overlap the reading hold`);
    }
  }
  if (requireEvidenceVerification) for (const action of manifest.motion_actions ?? []) if (action.end_frame - action.start_frame < 6) failures.push(`${action.action_id}: observable motion must last at least 6 frames`);
  if (requireEvidenceVerification) for (const component of components.values()) {
    if (component.render_kind === 'chart' && component.implementation_status === 'implemented') {
      if (!manifest.chart) failures.push(`${component.component_id}: implemented chart component requires manifest.chart data`);
      if (!(manifest.motion_actions ?? []).some((action) => action.target_component_id === component.component_id && action.operator_id === 'chart.reveal@1' && action.implementation_status === 'implemented')) failures.push(`${component.component_id}: implemented chart component requires an implemented chart.reveal@1 action`);
    }
  }

  const evidenceGroups = new Map();
  for (const component of components.values()) {
    const evidence = component.document_evidence;
    if (!evidence) continue;
    const group = evidenceGroups.get(evidence.evidence_id) ?? [];
    group.push({component, evidence});
    evidenceGroups.set(evidence.evidence_id, group);
    if (!evidence.source_id || !evidence.source_label || !evidence.source_asset_id) failures.push(`${component.component_id}: document evidence requires source id, label and immutable source asset`);
    const phaseName = evidence.phase === 'crop' ? 'normalized-crop' : evidence.phase === 'quote' ? 'exact-retypeset-quote' : evidence.phase;
    const phaseBeat = beats.find((beat) => beat.document_phase === phaseName && beat.focal_component_id === component.component_id);
    if (requireEvidenceVerification && !phaseBeat) failures.push(`${component.component_id}: document phase requires a matching focal beat`);
    if (evidence.phase === 'crop' && !normalizedCrop(evidence.crop_normalized)) {
      if (requireEvidenceVerification && (evidence.verification_status !== 'blocked-source-materialization' || phaseBeat?.preview_status !== 'blocked-assets-pending')) failures.push(`${component.component_id}: crop phase requires a normalized crop region or an explicitly blocked source-materialization preview`);
    } else if (evidence.phase === 'crop' && requireEvidenceVerification && (evidence.verification_status !== 'verified' || phaseBeat?.preview_status !== 'ready')) {
      failures.push(`${component.component_id}: verified crop requires normalized region and ready preview`);
    }
    if (evidence.phase === 'quote') {
      if ((evidence.quote_font_px ?? 0) < 72) failures.push(`${component.component_id}: quote must be at least 72px at 1080p`);
      if ((evidence.max_lines ?? 99) > 2) failures.push(`${component.component_id}: quote must use at most two lines`);
      if (!requireEvidenceVerification) {
        if (!evidence.exact_quote?.trim()) failures.push(`${component.component_id}: quote text is required`);
      } else if (evidence.verification_status === 'transcription_pending') {
        if (evidence.exact_quote !== null || phaseBeat?.preview_status !== 'blocked-transcription-pending') failures.push(`${component.component_id}: pending quote must stay null and block its preview`);
      } else if (evidence.verification_status === 'verified') {
        if (!evidence.exact_quote?.trim() || !evidence.source_locator?.trim() || !evidence.reviewer?.trim() || !/^[a-f0-9]{64}$/iu.test(evidence.review_sha256 ?? '') || phaseBeat?.preview_status !== 'ready') failures.push(`${component.component_id}: verified quote requires text, source locator, reviewer, review SHA-256 and ready preview`);
      } else failures.push(`${component.component_id}: quote verification_status must be transcription_pending or verified`);
    }
  }
  for (const [evidenceId, group] of evidenceGroups) {
    const phases = new Set(group.map(({evidence}) => evidence.phase));
    for (const phase of ['overview', 'crop', 'quote']) if (!phases.has(phase)) failures.push(`${evidenceId}: legal evidence needs overview -> crop -> retyped quote treatment`);
    const ordered = ['overview', 'crop', 'quote'].map((phase) => {
      const item = group.find(({evidence}) => evidence.phase === phase);
      const expectedPhase = phase === 'crop' ? 'normalized-crop' : phase === 'quote' ? 'exact-retypeset-quote' : phase;
      return beats.findIndex((beat) => beat.document_phase === expectedPhase && beat.focal_component_id === item?.component.component_id);
    });
    if (requireEvidenceVerification && (ordered.some((index) => index < 0) || !(ordered[0] < ordered[1] && ordered[1] < ordered[2]))) failures.push(`${evidenceId}: overview, crop and exact quote must be sequential focal beats`);
  }
  const hasLegalSource = (manifest.assets ?? []).some((asset) => asset.role === 'document' || asset.role === 'evidence');
  if (hasLegalSource && manifest.review_profile === 'remotion-motion' && evidenceGroups.size === 0) failures.push('full-screenshot-only legal explanation is forbidden');
  return failures;
}
