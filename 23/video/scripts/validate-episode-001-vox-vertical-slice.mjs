import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CONTRACT_PATH = 'video/contracts/episode-001-vox-vertical-slice-v1.json';
export const SLICE_SHOTS = ['SH003', 'SH016', 'SH024'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const nonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeRoot = (value) => typeof value === 'string' ? value.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '') : null;
const DERIVATIVE_ORIGINS = new Set(['source-derivative', 'deterministic-overlay']);
const DETERMINISTIC_CLASSES = new Set(['chart', 'path', 'effect', 'mask', 'text-surface', 'native-text-surface', 'deterministic-overlay']);
const FORBIDDEN_RASTER_TEXT_EXTENSIONS = /\.(?:png|jpe?g|webp)$/iu;

const actionsFor = (cut) => (cut?.visual_beats ?? []).flatMap((beat) => {
  const actions = beat.planned_operators ?? (beat.planned_operator ? [beat.planned_operator] : []);
  return actions.map((action) => ({...action, beat_id: beat.beat_id}));
});

export function validateSliceAssetLineage({lineage, schema, sourceReview, spec, hashes}) {
  const failures = [];
  const must = (value, message) => { if (!value) failures.push(message); };
  must(lineage?.version === 1, 'asset lineage version must be 1');
  must(schema?.$id === 'video/contracts/source-asset-lineage-v1.schema.json', 'asset lineage schema identity mismatch');
  must(lineage?.schema?.sha256 === hashes?.schema, 'asset lineage schema hash drift');
  must(lineage?.source_review?.sha256 === hashes?.sourceReview, 'asset lineage source-review hash drift');
  must(sourceReview?.production_authority === false && sourceReview?.status === 'pending-human-source-review', 'asset lineage may only consume the pending non-production source-review package');
  const textPolicy = lineage?.rendered_text_policy;
  must(textPolicy?.captured_page_pixels_are_evidence_only === true
    && textPolicy?.captured_page_pixels_forbidden_in_style_frames === true
    && textPolicy?.captured_page_pixels_forbidden_as_visual_or_motion_targets === true
    && textPolicy?.raster_text_composites_forbidden === true
    && textPolicy?.imagegen_summary_is_prompt_intent_not_pixel_text === true
    && textPolicy?.exact_source_text_requires_raster_free_native_surface === true
    && textPolicy?.asset_label_below_outside_only === true
    && textPolicy?.screen_chrome_separate_rail_only === true
    && textPolicy?.new_or_changed_official_page_requires_structured_recapture_provenance === true,
  'rendered-text capture policy is incomplete');

  const sliceCuts = (spec?.cuts ?? []).filter((cut) => SLICE_SHOTS.includes(cut.shot_id));
  const expectedRequirements = sliceCuts.flatMap((cut) => (cut.requirements ?? []).map((requirement) => `${cut.shot_id}|${requirement.requirement_id}`)).sort();
  const classifications = lineage?.requirement_classification ?? [];
  must(same(classifications.map((row) => `${row.shot_id}|${row.requirement_id}`).sort(), expectedRequirements), 'asset lineage must classify every slice requirement exactly once');

  const candidates = lineage?.source_candidates ?? [];
  const reviewCandidates = sourceReview?.candidates ?? [];
  must(same(candidates.map((candidate) => candidate.source_id).sort(), reviewCandidates.map((candidate) => candidate.source_id).sort()), 'source_candidates must exactly project all 15 source-review candidates');
  must(new Set(candidates.map((candidate) => candidate.source_id)).size === candidates.length, 'source candidate IDs must be unique');
  const candidateById = new Map(candidates.map((candidate) => [candidate.source_id, candidate]));
  for (const candidate of candidates) {
    const label = `source ${candidate?.source_id}`;
    const review = reviewCandidates.find((item) => item.source_id === candidate?.source_id);
    must(candidate?.candidate_kind === 'captured-page', `${label}: current source must be classified as a captured-page candidate, not an original document or asset`);
    must(Boolean(review), `${label}: source-review record is missing`);
    must(candidate?.registry_kind === review?.registry_kind, `${label}: registry kind drift`);
    must(candidate?.registry_capture?.path === review?.registry_capture?.workspace_relative_path
      && candidate?.registry_capture?.sha256 === review?.registry_capture?.sha256
      && candidate?.registry_capture?.capture_provenance === review?.registry_capture?.capture_provenance,
    `${label}: registry capture path/hash/provenance mismatch`);
    must(['documented', 'not-fully-documented'].includes(candidate?.registry_capture?.capture_method_status), `${label}: capture method status is missing`);
    must(candidate?.preserved_copy?.path === review?.registered_candidate_bytes?.workspace_relative_path
      && candidate?.preserved_copy?.sha256 === review?.registered_candidate_bytes?.sha256
      && candidate?.preserved_copy?.relationship === 'byte-identical-copy-of-registry-capture',
    `${label}: byte-preserved copy path/hash/relationship mismatch`);
    must(candidate?.registry_capture?.sha256 === candidate?.preserved_copy?.sha256, `${label}: registry capture and preserved copy must be byte-identical`);
    must(candidate?.review_state === 'pending' && candidate?.human_approval === false && candidate?.rights_approved === false && candidate?.materialized === false,
      `${label}: source candidate must remain unapproved, rights-unapproved and unmaterialized`);
    must(candidate?.asset_id === undefined && candidate?.recipe === undefined && candidate?.output_path === undefined, `${label}: source candidate cannot masquerade as a production asset or derivative`);
    must(Array.isArray(candidate?.slice_source_surfaces) && candidate.slice_source_surfaces.length === 0,
      `${label}: rendered-text capture pixels are evidence-only and cannot bind a slice source surface`);
    must(candidate?.production_visible_allowed !== true && candidate?.style_frame_pixel_input_allowed !== true && candidate?.motion_target_allowed !== true,
      `${label}: captured-page candidate cannot be production-visible, a style-frame pixel input, or a motion target`);
  }

  const imagegenCandidates = lineage?.imagegen_asset_candidates ?? [];
  const imagegenByKey = new Map(imagegenCandidates.map((item) => [`${item.shot_id}|${item.candidate_id}`, item]));
  must(new Set(imagegenByKey.keys()).size === imagegenCandidates.length, 'imagegen candidate IDs must be unique within each shot');
  for (const item of imagegenCandidates) {
    const label = `${item?.shot_id}/${item?.candidate_id}`;
    must(SLICE_SHOTS.includes(item?.shot_id) && nonBlank(item?.candidate_id) && nonBlank(item?.asset_class), `${label}: imagegen candidate identity/class is invalid`);
    must(item?.origin === 'imagegen-editorial-reconstruction' && item?.identity_scope === 'non-person-editorial-reconstruction'
      && item?.named_real_person === false && item?.evidence === false && item?.ai_disclosure === true,
    `${label}: imagegen is limited to disclosed non-person editorial reconstruction that is never evidence`);
    must(item?.asset_class !== 'person', `${label}: named or generic person assets cannot use this non-person imagegen route`);
    must(Array.isArray(item?.source_references) && item.source_references.length > 0, `${label}: exact source-reference hashes are required`);
    for (const reference of item?.source_references ?? []) {
      const source = candidateById.get(reference?.source_id);
      must(Boolean(source) && reference?.path === source?.registry_capture?.path && reference?.sha256 === source?.registry_capture?.sha256,
        `${label}: imagegen source-reference path/hash must bind an evidence-only candidate`);
    }
    const constraints = item?.content_constraints;
    must(['legible_text', 'names', 'dates', 'numbers', 'logos', 'ui', 'watermarks'].every((key) => constraints?.[key] === false),
      `${label}: imagegen output must forbid text, names, dates, numbers, logos, UI and watermarks`);
    must(nonBlank(item?.semantic_summary) && nonBlank(item?.visual_translation)
      && nonBlank(item?.prompt_contract?.prompt)
      && item.prompt_contract.prompt.includes(item.semantic_summary.slice(0, 8))
      && item?.prompt_contract?.summary_must_not_be_rendered_as_text === true
      && Array.isArray(item?.prompt_contract?.avoid) && item.prompt_contract.avoid.length > 0,
    `${label}: source-derived semantic summary, visual translation and exact prompt/avoid contract are required`);
    const avoid = (item?.prompt_contract?.avoid ?? []).join('|').toLowerCase();
    must(['text','names','dates','numbers','logos','ui','watermarks','webpage','screen capture'].every((term) => avoid.includes(term)),
      `${label}: prompt avoid list must exclude rendered text and captured-page pixels`);
    const cutout = item?.output_requirements?.independent_cutout_required;
    must(typeof cutout === 'boolean'
      && item?.output_requirements?.decoded_alpha_required === cutout
      && item?.output_requirements?.transparent_background_required === cutout,
    `${label}: alpha and transparent background are required iff an independent cutout treatment is selected`);
    must(item?.generation_status === 'not-generated' && item?.output_path === null && item?.output_sha256 === null
      && item?.human_review === false && item?.semantic_review === false && item?.decomposition_review === false && item?.production_visible === false,
    `${label}: ungenerated imagegen candidate must remain unreviewed, undecomposed and non-visible`);
    must(Array.isArray(item?.failed_generation_audits), `${label}: failed generation audit list must be explicit`);
    for (const attempt of item?.failed_generation_audits ?? []) {
      must(nonBlank(attempt?.attempt_id) && attempt?.status === 'rejected'
        && Array.isArray(attempt?.rejection_reasons) && attempt.rejection_reasons.length > 0 && attempt.rejection_reasons.every(nonBlank)
        && attempt?.registered === false && attempt?.production_visible === false && attempt?.motion_target_allowed === false,
      `${label}: failed imagegen attempts may be retained only as rejected, unregistered, non-visible audit evidence`);
    }
    must(Array.isArray(item?.blockers) && item.blockers.length > 0 && item.blockers.every(nonBlank), `${label}: pending imagegen candidate needs explicit blockers`);
    const binding = item?.motion_target_binding;
    must(binding && ['planned', 'not-motion-target'].includes(binding.status), `${label}: exact motion target disposition is required`);
    if (binding?.status === 'planned') {
      const cut = sliceCuts.find((cut) => cut.shot_id === item.shot_id);
      const action = actionsFor(cut).find((action) => action.beat_id === binding.beat_id && action.action_id === binding.action_id && action.target_component_id === binding.target_component_id);
      must(Boolean(action), `${label}: imagegen motion target does not match an exact episode-spec beat/action target`);
    } else must(binding?.independent_motion === false && nonBlank(binding?.reason), `${label}: non-motion imagegen target needs a rationale`);
  }

  const derivatives = lineage?.planned_derivatives ?? [];
  const derivativeKeys = derivatives.map((item) => `${item.shot_id}|${item.derivative_id}`);
  must(new Set(derivativeKeys).size === derivativeKeys.length, 'planned derivative IDs must be unique within each shot');
  const derivativeByKey = new Map(derivatives.map((item) => [`${item.shot_id}|${item.derivative_id}`, item]));
  for (const row of classifications) {
    must(['source-candidate-only', 'non-media-evidence', 'planned-derivatives', 'imagegen-asset-candidate'].includes(row?.classification), `${row?.shot_id}/${row?.requirement_id}: invalid requirement classification`);
    if (row?.classification === 'planned-derivatives') {
      must(Array.isArray(row.derivative_ids) && row.derivative_ids.length > 0, `${row.shot_id}/${row.requirement_id}: planned derivatives need derivative IDs`);
      for (const derivativeId of row.derivative_ids ?? []) {
        const derivative = derivativeByKey.get(`${row.shot_id}|${derivativeId}`);
        must(Boolean(derivative), `${row.shot_id}/${row.requirement_id}: derivative ${derivativeId} is missing`);
        must(derivative?.requirement_ids?.includes(row.requirement_id), `${row.shot_id}/${derivativeId}: requirement back-reference is missing`);
      }
    } else if (row?.classification === 'imagegen-asset-candidate') {
      must(Array.isArray(row.imagegen_candidate_ids) && row.imagegen_candidate_ids.length > 0, `${row.shot_id}/${row.requirement_id}: imagegen classification needs candidate IDs`);
      for (const candidateId of row.imagegen_candidate_ids ?? []) {
        const candidate = imagegenByKey.get(`${row.shot_id}|${candidateId}`);
        must(Boolean(candidate) && candidate.requirement_ids?.includes(row.requirement_id), `${row.shot_id}/${row.requirement_id}: imagegen candidate ${candidateId} or back-reference is missing`);
      }
      must(row.derivative_ids === undefined, `${row.shot_id}/${row.requirement_id}: imagegen requirement cannot claim derivative IDs`);
    } else must(row.derivative_ids === undefined && row.imagegen_candidate_ids === undefined, `${row.shot_id}/${row.requirement_id}: evidence-only requirement cannot claim visual outputs`);
  }

  for (const derivative of derivatives) {
    const label = `${derivative?.shot_id}/${derivative?.derivative_id}`;
    const cut = sliceCuts.find((item) => item.shot_id === derivative?.shot_id);
    must(Boolean(cut) && nonBlank(derivative?.derivative_id) && nonBlank(derivative?.asset_class), `${label}: planned derivative identity/class is invalid`);
    must(DERIVATIVE_ORIGINS.has(derivative?.origin), `${label}: origin must be source-derivative or deterministic-overlay`);
    must(Array.isArray(derivative?.requirement_ids), `${label}: requirement_ids must be explicit`);
    must(Array.isArray(derivative?.blockers) && derivative.blockers.length > 0 && derivative.blockers.every(nonBlank), `${label}: pending derivative must retain explicit blockers`);
    if (derivative?.source_id !== null) must(Boolean(candidateById.get(derivative.source_id)), `${label}: source candidate ${derivative?.source_id} is not registered in the current 15`);
    if (derivative?.source_id === null) must(derivative?.source_status === 'missing-source', `${label}: null source requires missing-source status`);
    else must(derivative?.source_status === 'registered-candidate', `${label}: registered source requires registered-candidate status`);
    must(nonBlank(derivative?.intended_operation), `${label}: intended operation is required`);
    must(derivative?.execution_status === 'not-executed' && derivative?.recipe === null && derivative?.recipe_sha256 === null
      && derivative?.output_path === null && derivative?.output_sha256 === null,
    `${label}: unexecuted derivative must keep recipe/output path/hash null`);
    must(derivative?.human_review === false && derivative?.rights_approved === false && derivative?.materialized === false, `${label}: derivative must remain unapproved and unmaterialized`);
    if (derivative?.origin === 'deterministic-overlay') {
      must(DETERMINISTIC_CLASSES.has(derivative.asset_class), `${label}: deterministic overlay class is not allowed`);
      must(derivative?.deterministic_overlay?.deterministic === true && derivative?.deterministic_overlay?.explanatory_overlay === true
        && derivative?.deterministic_overlay?.substitute_for_real_object === false, `${label}: deterministic overlay policy is incomplete`);
      if (['native-text-surface', 'text-surface'].includes(derivative?.asset_class) || derivative?.deterministic_overlay?.source_locked === true) {
        must(derivative?.render_surface?.kind === 'native-dom-vector' && derivative?.render_surface?.raster_beneath === false
          && derivative?.render_surface?.raster_composite === false,
        `${label}: exact/source text requires a raster-free native DOM/vector surface`);
        must(!FORBIDDEN_RASTER_TEXT_EXTENSIONS.test(derivative?.output_path ?? ''), `${label}: raster text composite output is permanently forbidden`);
      }
    } else {
      must(derivative?.deterministic_overlay === undefined, `${label}: source derivative cannot claim deterministic-overlay authority`);
      const source = candidateById.get(derivative?.source_id);
      must(!source || source?.candidate_kind !== 'captured-page', `${label}: rendered-text capture pixels cannot be cropped or derived into a production-visible asset`);
    }

    const binding = derivative?.motion_target_binding;
    must(binding && ['planned', 'not-motion-target'].includes(binding.status), `${label}: exact motion target disposition is required`);
    if (binding?.status === 'planned') {
      const action = actionsFor(cut).find((item) => item.beat_id === binding.beat_id && item.target_component_id === binding.target_component_id);
      must(Boolean(action), `${label}: motion target does not match an exact episode-spec beat/action target`);
      if (binding.action_id !== null) must(action?.action_id === binding.action_id, `${label}: motion action ID mismatch`);
      must(cut?.components?.some((component) => component.component_id === binding.target_component_id), `${label}: bound component is absent from episode spec`);
    } else must(binding?.independent_motion === false && nonBlank(binding?.reason), `${label}: non-motion target needs a nonblank rationale`);
  }

  must(['sh016-case-record-imagegen','sh016-evidence-handoff-imagegen','sh016-prosecutorial-review-imagegen']
    .every((id) => imagegenByKey.has(`SH016|${id}`)),
  'SH016 must translate the source meaning into three independent textless Imagegen targets');
  const sh024Anchor = derivativeByKey.get('SH024|one-month-timeline-anchor');
  const sh024Timeline = derivativeByKey.get('SH024|one-month-timeline');
  must(imagegenByKey.has('SH024|sh024-request-received-imagegen')
    && imagegenByKey.has('SH024|sh024-result-notification-imagegen')
    && sh024Anchor?.origin === 'deterministic-overlay'
    && sh024Anchor?.motion_target_binding?.target_component_id === 'one-month-timeline-anchor'
    && sh024Anchor?.motion_target_binding?.status === 'not-motion-target'
    && sh024Anchor?.motion_target_binding?.action_id === null
    && sh024Anchor?.motion_target_binding?.independent_motion === false
    && nonBlank(sh024Anchor?.motion_target_binding?.reason)
    && sh024Timeline?.origin === 'deterministic-overlay'
    && sh024Timeline?.motion_target_binding?.target_component_id === 'one-month-timeline-timeline'
    && sh024Timeline?.motion_target_binding?.action_id === 'sh024-one-month-timeline-reveal',
  'SH024 must keep capture pixels off-canvas and separate request/result Imagegen targets from deterministic time geometry');
  return failures;
}

export function validateVoxVerticalSlice({contract, spec, generated, grammar, state, catalog, sourceReview, lineageSchema, hashes}) {
  const failures = [];
  const must = (value, message) => { if (!value) failures.push(message); };
  must(contract?.schema_version === 1 && contract?.contract_id === 'episode-001-vox-vertical-slice-v1', 'vertical-slice contract identity/schema mismatch');
  must(contract?.production_authority === false && contract?.may_set_active_cut_root === false && contract?.may_register_composition === false, 'vertical slice must be explicitly non-promoting');
  must(contract?.status === 'blocked-pending-source-approval-and-materialization', 'vertical slice must remain source-gate blocked');
  must(state?.active_cut_root === null, 'vertical slice cannot coexist with an active cut root');
  must(contract?.runtime_window?.renderer === 'video/src/vox/scene/EpisodeTimeline.tsx', 'vertical slice must use EpisodeTimeline');
  must(contract?.runtime_window?.entrypoint === 'video/src/production-index.tsx' && contract?.runtime_window?.catalog === 'video/episodes/episode-001/generated/render-catalog.json', 'vertical slice must stay on the canonical runtime route');
  must(contract?.runtime_window?.registration_status === 'blocked', 'unready vertical-slice window must not be registered');
  must(!catalog?.compositions?.some((item) => item.composition_id === contract?.runtime_window?.composition_id), 'blocked vertical-slice composition must be absent from the render catalog');
  must(contract?.source_spec?.sha256 === hashes.spec && generated?.source_spec_sha256 === hashes.spec, 'vertical slice is not bound to the current episode spec');
  must(contract?.generated_manifest_contracts?.sha256 === hashes.generated, 'vertical slice is not bound to generated manifest contracts');
  must(contract?.reference_grammar_contract?.sha256 === hashes.grammar && grammar?.status === 'approved-human-grammar', 'vertical slice is not bound to the approved grammar contract');
  must(same(contract?.cuts?.map((cut) => cut.shot_id), SLICE_SHOTS), 'vertical slice must contain exactly SH003, SH016 and SH024 in order');
  for (const selected of contract?.cuts ?? []) {
    const sourceCut = spec?.cuts?.find((cut) => cut.shot_id === selected.shot_id);
    const generatedCut = generated?.cuts?.find((cut) => cut.shot_id === selected.shot_id);
    must(Boolean(sourceCut && generatedCut), `${selected.shot_id}: spec/generated contract is missing`);
    must(selected.render_ready === false && selected.transfer_selection_status === 'not-started-pending-source-gate', `${selected.shot_id}: source-blocked cut cannot select grammar or claim render readiness`);
    const requirements = sourceCut?.requirements ?? [];
    must(requirements.length > 0 && requirements.every((item) => item.status === 'blocked' && nonBlank(item.blocker)), `${selected.shot_id}: missing sources must remain explicitly blocked`);
  }
  const sh024Plan = contract?.cuts?.find((cut) => cut.shot_id === 'SH024')?.reference_motion_plan;
  const sh024Spec = spec?.cuts?.find((cut) => cut.shot_id === 'SH024');
  const sh024Actions = actionsFor(sh024Spec);
  const approvedMotionIds = new Set((grammar?.categories?.motion_operator ?? []).map((entry) => entry.grammar_id));
  must(!JSON.stringify({plan: sh024Plan, cut: sh024Spec}).includes('svg.stroke-draw@1'), 'SH024 cannot claim SVG stroke draw as reference-derived or planned motion');
  must(sh024Plan?.selection_status === 'not-selected-pending-source-gate'
    && sh024Plan?.static_non_reference_support?.target_component_id === 'one-month-timeline-anchor'
    && sh024Plan?.static_non_reference_support?.animated === false
    && same(sh024Plan?.static_non_reference_support?.grammar_bindings, []),
  'SH024 one-month anchor must remain static non-reference deterministic support');
  const conditional = sh024Plan?.conditional_applicable_binding;
  must(conditional?.grammar_id === 'plot-local-progressive-reveal'
    && approvedMotionIds.has(conditional?.grammar_id)
    && conditional?.runtime_operator_id === 'chart.reveal@1'
    && conditional?.target_component_id === 'one-month-timeline-timeline'
    && conditional?.parity_claimed === false
    && nonBlank(conditional?.applicability_condition)
    && sh024Actions.some((action) => action.beat_id === conditional.beat_id && action.operator_id === conditional.runtime_operator_id && action.target_component_id === conditional.target_component_id),
  'SH024 may only conditionally map the approved plot-local progressive reveal to its exact chart target');
  must(Array.isArray(contract?.unmapped_visual_grammar) && contract.unmapped_visual_grammar.length === 0 && Array.isArray(contract?.novel_visual_grammar) && contract.novel_visual_grammar.length === 0, 'vertical slice cannot introduce unmapped or novel grammar');
  must(contract?.human_approval === false && contract?.pass_claimed === false, 'vertical slice cannot claim human approval or PASS');
  failures.push(...validateSliceAssetLineage({lineage: contract?.asset_lineage, schema: lineageSchema, sourceReview, spec, hashes}));
  return failures;
}

export function validateHistoricalVoxVerticalSlice({contract, spec, generated, state, catalog, hashes}) {
  const failures = [];
  const must = (value, message) => { if (!value) failures.push(message); };
  const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  must(contract?.schema_version === 1 && contract?.contract_id === 'episode-001-vox-vertical-slice-v1', 'historical vertical-slice contract identity/schema mismatch');
  must(contract?.production_authority === false && contract?.may_set_active_cut_root === false && contract?.may_register_composition === false, 'historical vertical slice must remain explicitly non-promoting');
  must(contract?.status === 'blocked-pending-source-approval-and-materialization', 'historical vertical slice must remain blocked');
  must(isSha256(contract?.source_spec?.sha256) && contract.source_spec.sha256 !== hashes?.spec, 'historical vertical slice must remain byte-bound to a superseded episode spec');
  must(isSha256(contract?.generated_manifest_contracts?.sha256) && contract.generated_manifest_contracts.sha256 !== hashes?.generated, 'historical vertical slice must remain byte-bound to superseded generated contracts');
  must(contract?.human_approval === false && contract?.pass_claimed === false, 'historical vertical slice cannot claim human approval or PASS');
  must(contract?.runtime_window?.registration_status === 'blocked' && nonBlank(contract?.runtime_window?.composition_id), 'historical runtime window must remain blocked and unregistered');
  must(['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec?.editorial_revision?.id) && spec?.production_routing_policy?.version === 1, 'historical slice classification requires the current source-first revision');
  must(nonBlank(state?.stage), 'historical slice classification requires a known current production stage');
  const authority = state?.render_authority ?? {};
  const catalogCuts = Array.isArray(catalog?.cuts) ? catalog.cuts : [];
  if (catalogCuts.length === 0) {
    must(state?.stage === 'timing-draft' && state?.active_cut_root === null
      && authority.status === 'blocked-superseded-by-editorial-revision'
      && authority.cut_root === null && authority.catalog === null && authority.catalog_sha256 === null
      && authority.manifest_set_sha256 === null && authority.production_authority === false,
    'an empty current catalog is valid only for the exact inactive blocked draft');
    must(catalog?.status === 'blocked-source-search-no-render-authority' && catalog?.production_authority === false
      && catalog?.authority_root === null && Array.isArray(catalog?.compositions) && catalog.compositions.length === 0,
    'inactive current catalog must remain empty and blocked');
    must(catalog?._generated?.source_spec_sha256 === hashes?.spec, 'empty blocked catalog must bind current episode-spec bytes');
  } else {
    const expectedIds = (spec?.cuts ?? []).map((cut) => cut.shot_id);
    must(state?.stage !== 'timing-draft' && nonBlank(state?.active_cut_root)
      && authority.status !== 'blocked-superseded-by-editorial-revision'
      && normalizeRoot(authority.cut_root) === normalizeRoot(state.active_cut_root), 'current active root must agree with render authority');
    must(nonBlank(authority.catalog) && /^[a-f0-9]{64}$/u.test(authority.catalog_sha256 ?? '')
      && /^[a-f0-9]{64}$/u.test(authority.manifest_set_sha256 ?? ''), 'current active catalog must retain root/catalog/hash bindings');
    must(catalog?.authority_root === normalizeRoot(state.active_cut_root)
      && JSON.stringify(catalogCuts.map((cut) => cut.shot_id)) === JSON.stringify(expectedIds),
    'current active catalog must match every current episode-spec cut in order');
  }
  must(catalog?._generated?.do_not_edit === true, 'current render catalog must retain its generated marker');
  must(!catalog?.compositions?.some((item) => item.composition_id === contract?.runtime_window?.composition_id), 'historical slice composition must not be registered');
  must(Array.isArray(contract?.cuts) && contract.cuts.length > 0
    && contract.cuts.every((cut) => cut.render_ready === false && cut.transfer_selection_status === 'not-started-pending-source-gate'),
  'historical slice cuts must remain unready and source-gate blocked');
  return failures;
}

export async function validateCanonicalVoxVerticalSlice(root = process.cwd(), {auditHistorical = false} = {}) {
  if (!auditHistorical) {
    const read = async (relative) => readFile(path.resolve(root, relative));
    const json = async (relative) => JSON.parse(await read(relative));
    const [contract, spec, generated, state, catalog, specBytes, generatedBytes] = await Promise.all([
      json(CONTRACT_PATH), json('video/episodes/episode-001/episode-spec.json'), json('video/episodes/episode-001/generated/manifest-contracts.json'),
      json('video/episodes/episode-001/production-state.json'), json('video/episodes/episode-001/generated/render-catalog.json'),
      read('video/episodes/episode-001/episode-spec.json'), read('video/episodes/episode-001/generated/manifest-contracts.json'),
    ]);
    const failures = validateHistoricalVoxVerticalSlice({contract, spec, generated, state, catalog, hashes: {
      spec: sha256(specBytes), generated: sha256(generatedBytes),
    }});
    return {ok: failures.length === 0, status: 'historical/non-production', production_authority: false, failures};
  }
  const read = async (relative) => readFile(path.resolve(root, relative));
  const json = async (relative) => JSON.parse(await read(relative));
  const [contract, spec, generated, grammar, state, catalog, sourceReview, lineageSchema, specBytes, generatedBytes, grammarBytes, sourceReviewBytes, lineageSchemaBytes] = await Promise.all([
    json(CONTRACT_PATH), json('video/episodes/episode-001/episode-spec.json'), json('video/episodes/episode-001/generated/manifest-contracts.json'),
    json('video/episodes/episode-001/reference-grammar-contract.json'), json('video/episodes/episode-001/production-state.json'), json('video/episodes/episode-001/generated/render-catalog.json'),
    json('video/qa/source-review/episode-001-v01/manifest.json'), json('video/contracts/source-asset-lineage-v1.schema.json'),
    read('video/episodes/episode-001/episode-spec.json'), read('video/episodes/episode-001/generated/manifest-contracts.json'), read('video/episodes/episode-001/reference-grammar-contract.json'),
    read('video/qa/source-review/episode-001-v01/manifest.json'), read('video/contracts/source-asset-lineage-v1.schema.json'),
  ]);
  const failures = validateVoxVerticalSlice({contract, spec, generated, grammar, state, catalog, sourceReview, lineageSchema, hashes: {
    spec: sha256(specBytes), generated: sha256(generatedBytes), grammar: sha256(grammarBytes), sourceReview: sha256(sourceReviewBytes), schema: sha256(lineageSchemaBytes),
  }});
  return {ok: failures.length === 0, status: 'historical/full-audit', production_authority: false, failures};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateCanonicalVoxVerticalSlice(process.cwd(), {auditHistorical: process.argv.includes('--audit-historical')});
  if (!result.ok) { console.error(result.failures.join('\n')); process.exitCode = 1; }
  else if (result.status === 'historical/non-production') console.log('Episode 001 Vox vertical slice is historical/non-production; current source-first render route remains blocked.');
  else console.log('Historical Episode 001 Vox vertical slice audit passed with captured-page sources separated from unexecuted derivatives.');
}
