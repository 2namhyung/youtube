import {readFile, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {buildEpisodePlanOutputs, GENERATED_FILES} from './episode-plan-generator-lib.mjs';
import {provisionalCutTiming} from './narration-timing-lib.mjs';
import {OPERATOR_CAPABILITIES} from './visual-contract-v2.mjs';
import {validateSourceFirstWindowContracts} from './source-first-window-contract.mjs';
import {auditEditorialRouting, validateDeferredBeatIntent} from './editorial-route-contract.mjs';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const failures = [];
const videos = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi', '.mpeg', '.mpg', '.ts', '.3gp', '.flv']);
const layouts = new Set(['experience-hero', 'document-focus', 'process-flow', 'before-after']);
const states = new Set(['hidden', 'entering', 'focused', 'supporting', 'exiting', 'final-summary']);
const materialKinds = new Set(['source-original', 'transparent-derivative', 'imagegen-asset']);
const legacyLegalShots = new Set(['SH006', 'SH020', 'SH021', 'SH025', 'SH032', 'SH037', 'SH043', 'SH047']);
const fictionalOmniShots = new Set(['SH004','SH005','SH006','SH007','SH014','SH015','SH019','SH028','SH029','SH041','SH042','SH044','SH046','SH048']);
const targetKinds = {'camera.transform@1':'camera','svg.stroke-draw@1':'svg-path','document.highlight@1':'document-highlight','chart.reveal@1':'chart','mask.inset@1':'asset','transform.spring@1':'asset','transform.tween@1':'asset','opacity.tween@1':'asset'};
const operatorSemantics = {'camera.transform@1':['reframe-source'],'svg.stroke-draw@1':['draw-relationship'],'document.highlight@1':['emphasize-document'],'chart.reveal@1':['reveal-data'],'mask.inset@1':['reveal-region'],'transform.spring@1':['enter-subject'],'transform.tween@1':['move-subject','compare-state'],'opacity.tween@1':['reveal-subject']};

function argPath(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  if (!process.argv[i + 1]) throw new Error(`${flag} requires a path`);
  return path.resolve(root, process.argv[i + 1]);
}
const specPath = argPath('--spec', path.join(episodeDir, 'episode-spec.json'));
const statePath = argPath('--state', path.join(episodeDir, 'production-state.json'));
const runtimePaths = [argPath('--runtime-index', path.join(root, 'video/src/index.tsx')), argPath('--runtime-media', path.join(root, 'video/src/episode-001-media.ts'))];
const publicRoot = argPath('--public-assets', path.join(root, 'video/public/assets'));
const intakeRoot = argPath('--source-intake-root', path.join(root, 'video/source-intake/episode-001/ai'));
const outputs = new Map([
  ['narration-plan.json', argPath('--narration', path.join(episodeDir, 'narration-plan.json'))],
  ['cut-plan.json', argPath('--cut-plan', path.join(episodeDir, 'cut-plan.json'))],
  ['cut-source-design.json', argPath('--design', path.join(episodeDir, 'cut-source-design.json'))],
  ['generated/manifest-contracts.json', argPath('--contracts', path.join(episodeDir, 'generated/manifest-contracts.json'))],
]);
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeRelative = (value) => typeof value === 'string' && value && !path.isAbsolute(value) && !value.split(/[\\/]/u).includes('..');
const noOp = (op, p = {}) => {
  if (['transform.spring@1','transform.tween@1','camera.transform@1'].includes(op)) return ['x','y','scale','rotate','opacity'].every((k) => Number(p[`from_${k}`] ?? (['scale','opacity'].includes(k) ? 1 : 0)) === Number(p[`to_${k}`] ?? (['scale','opacity'].includes(k) ? 1 : 0)));
  if (op === 'mask.inset@1') return Number(p.from_right_percent ?? 100) === Number(p.to_right_percent ?? 0);
  return Number(p.from_progress ?? 0) === Number(p.to_progress ?? 1);
};

const specBytes = await readFile(specPath);
const spec = JSON.parse(specBytes);
const state = JSON.parse(await readFile(statePath, 'utf8'));
const sourceSearchDraft = state.stage === 'timing-draft' && state.active_cut_root === null && state.render_authority?.status === 'blocked-superseded-by-editorial-revision';
const specHash = hash(specBytes);
const cuts = Array.isArray(spec.cuts) ? spec.cuts : [];
const footageFirstRevision = spec.editorial_revision?.id === 'ep001-live-action-footage-first-v1';
const sourceFirstRevision = ['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec.editorial_revision?.id);
const narrativeSourceFirstV3 = spec.editorial_revision?.id === 'ep001-narrative-source-first-v3';
const editorialRevision = footageFirstRevision || sourceFirstRevision;
const expectedCutCount = sourceFirstRevision ? spec.editorial_revision?.cut_count : 48;
const legalShots = editorialRevision
  ? new Set(cuts.filter((cut) => cut.document_contract !== null).map((cut) => cut.shot_id))
  : legacyLegalShots;
let candidateReview = null;
let candidateReviewHash = null;
if (footageFirstRevision) {
  try {
    const candidateReviewBytes = await readFile(path.resolve(root, spec.editorial_visual_policy?.candidate_review));
    candidateReview = JSON.parse(candidateReviewBytes);
    candidateReviewHash = hash(candidateReviewBytes);
  } catch (error) {
    failures.push(`footage candidate review is missing or invalid: ${error.message}`);
  }
}
if (spec.schema_version !== 1 || spec.authority !== 'sole-manually-edited-episode-authority') failures.push('spec must be schema v1 and sole manual authority');
if (cuts.length !== expectedCutCount) failures.push(`spec must contain exactly ${expectedCutCount} cuts for the declared revision`);
if (spec.timing_authority?.fps !== 30 || spec.timing_authority?.compact_korean_chars_per_second !== 4.965) failures.push('timing authority must remain 30fps / 4.965 chars/s');
if (JSON.stringify(spec.generated_compatibility_outputs) !== JSON.stringify(GENERATED_FILES.map((name) => `./${name}`))) failures.push('generated output list mismatch');

let masterFrames = 0;
for (const [index, cut] of cuts.entries()) {
  const label = `SH${String(index + 1).padStart(3, '0')}`;
  if (cut.shot_id !== label) failures.push(`${label}: ordered ID required`);
  const timing = provisionalCutTiming(cut, {fps: 30, draft_timing_assumption: {compact_korean_chars_per_second: 4.965}});
  if (cut.timing?.provisional_duration_frames !== timing.durationFrames || cut.timing?.master_occupancy_frames !== timing.masterOccupancyFrames) failures.push(`${label}: timing drift`);
  masterFrames += timing.masterOccupancyFrames;
  const requirements = cut.requirements ?? [];
  const requirementIds = new Set(requirements.map((r) => r.requirement_id));
  const materialAssetIds = requirements.filter((r) => materialKinds.has(r.kind)).map((r) => r.asset_id);
  if (!requirements.length) failures.push(`${label}: requirements missing`);
  for (const r of requirements) {
    if (materialKinds.has(r.kind) && (!r.asset_id || typeof r.asset_id !== 'string')) failures.push(`${label}/${r.requirement_id}: material requirement needs its actual asset_id`);
    if (r.status === 'approved' && materialKinds.has(r.kind) && !(Number.isSafeInteger(r.approved_media_asset_id) && safeRelative(r.materialization_record_path))) failures.push(`${label}/${r.requirement_id}: approved material needs integer media ID and safe ledger path`);
    if (r.status !== 'approved' && (r.status !== 'blocked' || !r.blocker)) failures.push(`${label}/${r.requirement_id}: unresolved requirement must be blocked`);
  }
  if (new Set(materialAssetIds).size !== materialAssetIds.length) failures.push(`${label}: material requirement asset_id values must be unique`);
  for (const id of cut.source_ids ?? []) {
    const fictionalDisclosure = narrativeSourceFirstV3 && cut.production_mode === 'omni' && id === `FICTION-${label}`;
    if (!fictionalDisclosure && !requirements.some((r) => r.source_id === id)) failures.push(`${label}: ${id} lacks requirement`);
  }
  for (const layer of cut.transparent_derivatives ?? []) if (!requirements.some((r) => r.kind === 'transparent-derivative' && r.asset_id === layer.asset_id)) failures.push(`${label}: ${layer.asset_id} lacks derivative requirement`);
  for (const layer of cut.designed_assets ?? []) {
    const isOfficialPhotoDerivative = layer.provenance?.type === 'official-source-derived';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(layer.asset_id ?? '') || !safeRelative(layer.file)) failures.push(`${label}: designed asset needs safe asset_id and relative file`);
    if ((!isOfficialPhotoDerivative && layer.provenance?.type !== 'self-created') || !layer.provenance?.basis?.trim() || !layer.provenance?.source_reference?.trim()) failures.push(`${label}/${layer.asset_id}: designed asset provenance must identify self-created or official-source-derived basis and reference`);
    if ((!isOfficialPhotoDerivative && (!['planned-not-created', 'created-provisional'].includes(layer.status) || layer.rights_status !== 'self-created')) || (isOfficialPhotoDerivative && (layer.status !== 'derived-candidate-blocked' || layer.rights_status !== 'rights-review-required'))) failures.push(`${label}/${layer.asset_id}: asset lifecycle/rights state is invalid`);
    if (!requirements.some((r) => (isOfficialPhotoDerivative ? r.kind === 'transparent-derivative' : r.kind === 'designed-asset') && r.asset_id === layer.asset_id)) failures.push(`${label}: ${layer.asset_id} lacks matching asset requirement`);
  }

  const components = cut.components ?? [];
  const componentMap = new Map();
  for (const component of components) {
    if (!component.component_id || componentMap.has(component.component_id)) failures.push(`${label}: unique component IDs required`);
    componentMap.set(component.component_id, component);
    if (component.implementation_status !== 'planned-not-implemented') failures.push(`${label}/${component.component_id}: must honestly remain planned-not-implemented`);
    if (component.asset_requirement_id && !requirementIds.has(component.asset_requirement_id)) failures.push(`${label}/${component.component_id}: unknown requirement`);
  }
  const derivativeRequirements = requirements.filter((requirement) => requirement.kind === 'transparent-derivative');
  for (const requirement of derivativeRequirements) {
    const consumers = components.filter((component) => component.asset_requirement_id === requirement.requirement_id);
    if (consumers.length !== 1) failures.push(`${label}/${requirement.requirement_id}: transparent derivative must bind exactly one presentation component`);
    else if (!(cut.visual_beats ?? []).some((beat) => beat.presentation?.focal?.component_id === consumers[0].component_id || (beat.presentation?.supporting ?? []).some((item) => item.component_id === consumers[0].component_id))) failures.push(`${label}/${requirement.requirement_id}: derivative component is not consumed by any presentation beat`);
  }
  for (const requirement of requirements.filter((item) => item.kind === 'imagegen-asset')) {
    const consumers = components.filter((component) => component.asset_requirement_id === requirement.requirement_id);
    if (consumers.length !== 1 || consumers[0]?.asset_origin !== 'imagegen-editorial-reconstruction' || consumers[0]?.text_logo_ui_forbidden !== true) failures.push(`${label}/${requirement.requirement_id}: imagegen asset must bind exactly one textless reconstruction component`);
  }
  for (const component of components.filter((item) => item.asset_requirement_id)) {
    const requirement = requirements.find((item) => item.requirement_id === component.asset_requirement_id);
    if (!requirement) failures.push(`${label}/${component.component_id}: component requirement binding is invalid`);
  }
  const beats = cut.visual_beats ?? [];
  if (beats.length < 1) failures.push(`${label}: needs a semantic beat`);
  let end = 0;
  for (const beat of beats) {
    const bl = `${label}/${beat.beat_id ?? '?'}`;
    const window = beat.narration_window;
    if (!Number.isInteger(window?.start_frame) || !Number.isInteger(window?.end_frame_exclusive) || window.start_frame !== end || window.end_frame_exclusive <= window.start_frame) failures.push(`${bl}: contiguous positive window required`);
    end = window?.end_frame_exclusive ?? end;
    const focal = beat.presentation?.focal?.component_id;
    if (!focal || !componentMap.has(focal) || !layouts.has(beat.presentation?.layout_template)) failures.push(`${bl}: valid unique focal/layout required`);
    const support = (beat.presentation?.supporting ?? []).map((x) => x.component_id), hidden = (beat.presentation?.hidden ?? []).map((x) => x.component_id);
    if (new Set(support).size !== support.length || new Set(hidden).size !== hidden.length || support.includes(focal) || hidden.includes(focal) || support.some((id) => hidden.includes(id))) failures.push(`${bl}: focal, supporting and hidden component sets must be unique and mutually exclusive`);
    for (const item of beat.presentation?.hidden ?? []) if (!Number.isInteger(item.until_frame) || item.until_frame < window.end_frame_exclusive) failures.push(`${bl}: hidden.until_frame must cover the entire beat window`);
    if (!(beat.component_visibility ?? []).some((x) => x.component_id === focal && x.states?.some((s) => ['focused','final-summary'].includes(s.state)))) failures.push(`${bl}: focal visibility state missing`);
    for (const timeline of beat.component_visibility ?? []) for (const state of timeline.states ?? []) if (!states.has(state.state) || !Number.isInteger(state.start_frame) || !Number.isInteger(state.end_frame_exclusive) || state.end_frame_exclusive <= state.start_frame) failures.push(`${bl}: invalid visibility timeline`);
    const hold = beat.stable_reading_hold;
    const actions = Array.isArray(beat.planned_operators) ? beat.planned_operators.filter(Boolean) : (beat.planned_operator ? [beat.planned_operator] : []);
    if (!actions.length || beat.action_intent?.status === 'deferred-until-source-selection') failures.push(...validateDeferredBeatIntent(cut, beat));
    for (const action of actions) {
      const target = componentMap.get(action?.target_component_id);
      if (action?.status !== 'planned-not-implemented') failures.push(`${bl}: planned operator must not claim implementation`);
      if (!Object.hasOwn(OPERATOR_CAPABILITIES, action?.operator_id)) failures.push(`${bl}: unsupported operator`);
      else if (!OPERATOR_CAPABILITIES[action.operator_id].includes(action.required_capability)) failures.push(`${bl}: capability mismatch`);
      if (!target) failures.push(`${bl}: missing target`);
      else if (target.render_kind !== targetKinds[action.operator_id]) failures.push(`${bl}: operator/target kind mismatch`);
      if (noOp(action?.operator_id, action?.parameters) || !action?.observable_change?.trim()) failures.push(`${bl}: observable non-no-op action required`);
      if (!operatorSemantics[action?.operator_id]?.includes(action?.action_semantic) || !(action?.observable_change ?? '').startsWith(`${beat.purpose}:`)) failures.push(`${bl}: action semantics disagree with visual purpose`);
      if (!Number.isInteger(action?.start_frame) || !Number.isInteger(action?.end_frame_exclusive) || action.start_frame < window.start_frame || action.end_frame_exclusive <= action.start_frame || action.end_frame_exclusive > hold.start_frame) failures.push(`${bl}: motion must end before reading hold`);
      const minimumMotionFrames = 6;
      if ((action?.end_frame_exclusive ?? 0) - (action?.start_frame ?? 0) < minimumMotionFrames) failures.push(`${bl}: observable motion is too short to review; minimum ${minimumMotionFrames} frames`);
    }
    if (!Number.isInteger(hold?.frames) || hold.frames < 60 || hold.end_frame_exclusive - hold.start_frame !== hold.frames || hold.start_frame < window.start_frame || hold.end_frame_exclusive > window.end_frame_exclusive) failures.push(`${bl}: >=60f hold required inside window`);
    const timelineMap = new Map((beat.component_visibility ?? []).map((timeline) => [timeline.component_id, timeline.states ?? []]));
    const covers = (id, allowed) => timelineMap.get(id)?.some((state) => allowed.includes(state.state) && state.start_frame <= hold.start_frame && state.end_frame_exclusive >= hold.end_frame_exclusive);
    if (!covers(focal, ['focused','final-summary'])) failures.push(`${bl}: focal must remain focused throughout the reading hold`);
    for (const id of support) if (!covers(id, ['supporting'])) failures.push(`${bl}: supporting component must remain supporting throughout the reading hold`);
    for (const item of beat.presentation?.hidden ?? []) if ((timelineMap.get(item.component_id) ?? []).some((state) => state.start_frame < item.until_frame && state.state !== 'hidden')) failures.push(`${bl}: hidden component becomes visible before its declared frame`);
  }
  if (end !== timing.durationFrames) failures.push(`${label}: beats do not cover duration`);
  // Semantic action and exact assets determine readiness; there is no focal/operator quota.

  if (legalShots.has(label)) {
    const contract = cut.document_contract, sequence = ['overview','normalized-crop','exact-retypeset-quote'];
    if (JSON.stringify(contract?.sequence) !== JSON.stringify(sequence)) failures.push(`${label}: legal phase sequence invalid`);
    const ids = sequence.map((phase) => contract?.phases?.[phase]?.component_id);
    const phaseBeats = sequence.map((phase) => beats.find((b) => b.beat_id === contract?.phases?.[phase]?.beat_id));
    if (new Set(ids).size !== 3 || phaseBeats.some((b, i) => !b || b.document_phase !== sequence[i] || b.presentation?.focal?.component_id !== ids[i])) failures.push(`${label}: each legal phase needs a distinct sequential focal`);
    const crop = contract?.normalized_crop;
    if (crop?.status === 'materialization_pending') {
      if (crop.region !== null || phaseBeats[1]?.preview_status !== 'blocked-assets-pending') failures.push(`${label}: pending crop must remain null and blocked`);
    } else if (crop?.status !== 'verified' || !crop.region || phaseBeats[1]?.preview_status !== 'ready') failures.push(`${label}: verified crop requires region and ready preview`);
    const quote = contract?.exact_retypeset_quote;
    if (quote?.font_px_1080 < 72 || quote?.max_lines > 2) failures.push(`${label}: quote must be >=72px and <=2 lines`);
    if (quote?.status === 'transcription_pending') {
      if (quote.text !== null || phaseBeats[2]?.preview_status !== 'blocked-transcription-pending') failures.push(`${label}: pending quote must be null and blocked`);
    } else if (quote?.status !== 'verified' || !quote.text?.trim() || !quote.source_locator?.trim() || !quote.reviewer?.trim() || !/^[a-f0-9]{64}$/iu.test(quote.review_sha256 ?? '') || phaseBeats[2]?.preview_status !== 'ready') failures.push(`${label}: verified quote lacks text/locator/reviewer/hash/ready preview`);
  } else if (cut.document_contract !== null) failures.push(`${label}: non-document cut claims legal contract`);

if (!editorialRevision && ['SH016', 'SH024'].includes(label)) {
    const textContract = cut.raster_free_text_contract;
    const textIds = textContract?.text_component_ids ?? [];
    if (typeof textContract?.required !== 'boolean' || textContract?.capture_pixels_allowed_on_canvas !== false
      || textContract?.native_dom_or_vector !== true || textContract?.raster_beneath !== false
      || textContract?.raster_composite !== false || !Array.isArray(textContract?.evidence_source_ids)
      || textContract.evidence_source_ids.length === 0 || (textContract.required === true && textIds.length === 0)) {
      failures.push(`${label}: rendered-text capture evidence requires a raster-free native text contract`);
    }
    for (const id of textIds) {
      const component = componentMap.get(id);
      if (!component || component.compositing !== 'raster-free-native-dom-vector'
        || component.raster_beneath !== false || component.raster_composite !== false) {
        failures.push(`${label}: ${id} must be a raster-free native DOM/vector component`);
      }
    }
    if ((cut.requirements ?? []).filter((item) => item.kind === 'source-original' && textContract?.evidence_source_ids?.includes(item.source_id))
      .some((item) => item.production_use !== 'evidence-provenance-only')) {
      failures.push(`${label}: captured-page source requirements must be evidence/provenance-only`);
    }
    if ((cut.components ?? []).some((component) => component.compositing === 'single-flattened-source-surface')) {
      failures.push(`${label}: rendered-text capture pixels cannot be a production-visible component`);
    }
    const imagegenComponents = (cut.components ?? []).filter((component) => component.asset_origin === 'imagegen-editorial-reconstruction');
    const expectedCount = label === 'SH016' ? 3 : 2;
    if (imagegenComponents.length !== expectedCount || imagegenComponents.some((component) => component.evidence !== false || component.text_logo_ui_forbidden !== true || component.render_kind !== 'asset' || component.compositing !== 'independent-layer')) {
      failures.push(`${label}: source meaning must map to ${expectedCount} independent textless Imagegen components`);
    }
  }
}

const declaredMasterSeconds = spec.timing_authority?.provisional_master_seconds;
if (spec.timing_authority?.provisional_master_frames !== masterFrames || declaredMasterSeconds !== masterFrames / 30) failures.push('timing authority must equal the deterministic sum of current cut provisional occupancies');
if (!editorialRevision) {
const [sh003, sh005, sh007, sh043, sh048] = [cuts[2],cuts[4],cuts[6],cuts[42],cuts[47]];
if (sh003?.production_mode !== 'remotion' || sh003?.source_video_evidence?.render_use !== 'metadata-only' || sh003?.source_video_evidence?.rights_status !== 'production-rights-blocked' || sh003?.source_video_evidence?.video_materialization !== 'forbidden') failures.push('SH003 must use Remotion with metadata-only, production-rights-blocked Assembly evidence');
if (sh003?.designed_assets?.length !== 5 || sh003?.requirements?.filter((item) => item.kind === 'designed-asset').length !== 3 || sh003?.transparent_derivatives?.length !== 2) failures.push('SH003 v07 requires the cumulative chamber, podium, two official profile-photo derivatives and Korean bill-title card set');
const sh003Transition = sh003?.transition;
if (sh003Transition?.type !== 'scene-to-scene' || sh003Transition?.operator_id !== 'scene.shared-element@1' || sh003Transition?.intent?.trim() === '' || sh003Transition?.start_frame !== 269 || sh003Transition?.duration_frames !== 30 || sh003Transition?.next_shot_id !== 'SH004' || 'pair_renderer' in sh003Transition || 'pair_artifact' in sh003Transition || 'pair_artifact_sha256' in sh003Transition || 'shared_element' in sh003Transition || sh003Transition?.continuity?.relation !== 'asset-morph' || JSON.stringify(sh003Transition?.continuity?.outgoing_component_ids) !== JSON.stringify(['bill-b03']) || JSON.stringify(sh003Transition?.continuity?.incoming_component_ids) !== JSON.stringify(['sh004-case-folder']) || JSON.stringify(sh003Transition?.continuity?.outgoing_asset_ids) !== JSON.stringify(['assembly-bill-card']) || JSON.stringify(sh003Transition?.continuity?.incoming_asset_ids) !== JSON.stringify(['sh004-case-folder']) || sh003Transition?.continuity?.layout_binding !== 'manifest-component-layout' || sh003Transition?.continuity?.camera_inheritance !== 'inherit-without-delta-claim' || sh003Transition?.continuity?.presentation_state_inheritance !== 'manifest-component-state' || 'outgoing_state' in sh003Transition.continuity || 'incoming_state' in sh003Transition.continuity || JSON.stringify(sh003Transition?.fallback) !== JSON.stringify({operator_id:'scene.crossfade@1',mode:'whole-scene',allowed_on:'invalid-mapping'})) failures.push('SH003→SH004 must keep only the canonical 30-frame scene transition intent; render evidence belongs in the authority review ledger');
const sh004Transition = cuts[3]?.transition;
if (sh004Transition?.type !== 'scene-to-scene' || sh004Transition?.operator_id !== 'scene.shared-element@1' || sh004Transition?.intent?.trim() === '' || sh004Transition?.start_frame !== 118 || sh004Transition?.duration_frames !== 30 || sh004Transition?.next_shot_id !== 'SH005' || 'pair_renderer' in sh004Transition || 'pair_artifact' in sh004Transition || 'pair_artifact_sha256' in sh004Transition || 'shared_element' in sh004Transition || sh004Transition?.continuity?.relation !== 'asset-morph' || JSON.stringify(sh004Transition?.continuity?.outgoing_component_ids) !== JSON.stringify(['sh004-case-folder']) || JSON.stringify(sh004Transition?.continuity?.incoming_component_ids) !== JSON.stringify(['sh005-case-folder']) || JSON.stringify(sh004Transition?.continuity?.outgoing_asset_ids) !== JSON.stringify(['sh004-case-folder']) || JSON.stringify(sh004Transition?.continuity?.incoming_asset_ids) !== JSON.stringify(['sh004-case-folder']) || sh004Transition?.continuity?.layout_binding !== 'manifest-component-layout' || sh004Transition?.continuity?.camera_inheritance !== 'inherit-without-delta-claim' || sh004Transition?.continuity?.presentation_state_inheritance !== 'manifest-component-state' || 'outgoing_state' in sh004Transition.continuity || 'incoming_state' in sh004Transition.continuity || JSON.stringify(sh004Transition?.fallback) !== JSON.stringify({operator_id:'scene.crossfade@1',mode:'whole-scene',allowed_on:'invalid-mapping'})) failures.push('SH004→SH005 must keep only the canonical 30-frame shared-element transition intent; render evidence belongs in the authority review ledger');
if (sh005?.presentation?.focal !== 'episode-promise-route-map' || sh005?.document_contract !== null) failures.push('SH005/SH006 authority conflict');
if (/parcel|box|택배|상자/i.test(JSON.stringify({presentation:sh007?.presentation, visual_action:sh007?.visual_action, transition:sh007?.transition})) || !/휴대전화/.test(sh007?.transition?.intent ?? '')) failures.push('SH007 pre-introduces parcel or misses phone continuity');
if (sh043?.transition?.type !== 'morph' || !/morph/i.test(sh043?.transition?.intent ?? '')) failures.push('SH043 transition type/intent mismatch');
if (sh048?.visual_beats?.length !== 4 || new Set(sh048.visual_beats.map((b) => b.presentation.focal.component_id)).size !== 4 || new Set(sh048.visual_beats.map((b) => (b.planned_operators ?? [b.planned_operator])[0].operator_id)).size !== 4) failures.push('SH048 requires four distinct case/request/procedure/metric beats');
} else if (footageFirstRevision) {
  const expectedScriptHash = 'cb7818354a74e9d9854528dc7ffdf204d4ee05f72458ecee02698987dfcebdd8';
  const expectedNarrationHash = '755fc7c746066bed53970de877fcacd66c92bacbbb94e9d67d80a0c4ca85f0fe';
  if (spec.status !== 'approved-script-footage-first-editorial-plan-blocked'
    || spec.editorial_revision?.production_authority !== false
    || spec.editorial_revision?.status !== 'candidate-plan-blocked') {
    failures.push('footage-first revision must remain a blocked, non-production editorial plan');
  }
  if (spec.script_lock?.source_sha256 !== expectedScriptHash
    || spec.script_lock?.narration_sha256 !== expectedNarrationHash
    || spec.script_lock?.compact_character_count !== 2761) {
    failures.push('footage-first revision must preserve the exact user-approved script lock');
  }
  const modeCounts = cuts.reduce((counts, cut) => {
    counts[cut.production_mode] = (counts[cut.production_mode] ?? 0) + 1;
    return counts;
  }, {});
  if ((modeCounts['source-video'] ?? 0) + (modeCounts['source-photo'] ?? 0) !== 27
    || (modeCounts.remotion ?? 0) !== 7 || (modeCounts.omni ?? 0) !== fictionalOmniShots.size) {
    failures.push('footage-first revision must use 27 real-media cuts, 7 justified Remotion cuts, and 14 fictional Omni keyframe-input cuts');
  }
  const candidateRecords = new Map((candidateReview?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  if (spec.editorial_visual_policy?.candidate_review_sha256 !== candidateReviewHash) failures.push('footage candidate review byte hash drift; rebuild the plan from the reviewed candidate file');
  for (const cut of cuts) {
    const label = cut.shot_id;
    const selection = cut.candidate_selection;
    if (cut.production_authority !== false || selection?.rights_approval !== false || selection?.production_visible !== false) failures.push(`${label}: candidate plan must remain non-production and unapproved`);
    if (cut.typography_surface_contract_version !== 2 || cut.layout_contract_version !== 2 || cut.layout_contract?.version !== 2) failures.push(`${label}: typography/layout v2 required`);
    if (/beige|empty board|빈 배경/iu.test(JSON.stringify({purpose:cut.visual_purpose, action:cut.visual_action, media:cut.media_strategy}))) failures.push(`${label}: stale empty/beige-board treatment forbidden`);
    if ((cut.source_ids ?? []).some((id) => /^FICTION-/u.test(id))) failures.push(`${label}: stale fiction source ID forbidden`);
    if (['source-video', 'source-photo'].includes(cut.production_mode)) {
      if (!Array.isArray(selection?.candidate_ids) || selection.candidate_ids.length === 0) {
        const gaps = (cut.requirements ?? []).filter((item) => item.source_id === `SOURCE-SEARCH-${label}`);
        if (gaps.length !== 1 || gaps[0].status !== 'blocked') failures.push(`${label}: unresolved footage search must be an explicit blocked gap`);
      } else {
        for (const id of selection.candidate_ids) {
          const requirement = (cut.requirements ?? []).find((item) => item.candidate_id === id);
          const record = candidateRecords.get(id);
          const expectedPath = record?.path ? path.relative(root, record.path).replaceAll('\\', '/') : null;
          const dispositionRejected = /^semantic-reject/u.test(record?.disposition ?? '') || record?.disposition === 'weak-context-only';
          if (!record) failures.push(`${label}: candidate ${id} is absent from the review file`);
          else if (dispositionRejected) failures.push(`${label}: candidate ${id} is rejected by review disposition ${record.disposition}`);
          if (!requirement || requirement.status !== 'blocked'
            || requirement.production_use !== 'context-only; never evidence or a depiction of the hypothetical crime'
            || requirement.candidate_sha256 !== record?.sha256
            || requirement.candidate_source_path !== expectedPath
            || requirement.candidate_review_sha256 !== candidateReviewHash
            || requirement.review_disposition !== record?.disposition
            || requirement.review_temporal_status !== record?.temporal_review_status) {
            failures.push(`${label}: candidate ${id} lacks a blocked byte-bound copy of its review record`);
          }
          const consumers = (cut.components ?? []).filter((component) => component.asset_requirement_id === requirement?.requirement_id);
          const used = consumers.some((component) => (cut.visual_beats ?? []).some((beat) =>
            beat.presentation?.focal?.component_id === component.component_id
            || (beat.presentation?.supporting ?? []).some((item) => item.component_id === component.component_id)));
          if (consumers.length < 1 || !used) failures.push(`${label}: selected candidate ${id} must bind at least one consumed component`);
          if (record?.media_type === 'video') {
            const rangeText = record.reason?.match(/(\d+)–(\d+)초/u) ?? record.temporal_review_status?.match(/(\d+)–(\d+)s/u);
            const expectedWindow = rangeText ? {start_seconds:Number(rangeText[1]),end_seconds:Number(rangeText[2])} : null;
            if (!expectedWindow || JSON.stringify(requirement?.reviewed_window_seconds) !== JSON.stringify(expectedWindow)
              || requirement?.reviewed_window_use_policy !== 'no looping, stretching, or frames outside this reviewed window; use another approved shot for remaining cut time') {
              failures.push(`${label}: video candidate ${id} must bind its reviewed temporal window and forbid loop/stretch/out-of-window use`);
            }
          }
        }
      }
      if (cut.media_strategy?.dominant_surface !== 'full-frame-real-source') failures.push(`${label}: real-media cut must declare a full-frame source surface`);
    } else if (cut.production_mode === 'remotion') {
      if (!cut.motion_graphics_justification?.trim() || cut.usage_layer !== 'necessary-explanation' || cut.media_strategy?.dominant_surface !== 'raster-free-native-procedure-surface') failures.push(`${label}: Remotion cut needs a specific raster-free explanation justification`);
      if (!(cut.requirements ?? []).some((item) => item.production_use === 'evidence-provenance-only; capture pixels forbidden on production canvas')) failures.push(`${label}: Remotion explanation must bind official evidence outside the production canvas`);
    } else if (cut.production_mode === 'omni') {
      const imagegenRequirements = (cut.requirements ?? []).filter((item) => item.kind === 'imagegen-asset');
      if (!fictionalOmniShots.has(label)) failures.push(`${label}: Omni is restricted to the exact fictional continuity allowlist`);
      if (cut.usage_layer !== 'fictional-editorial-reconstruction'
        || cut.media_strategy?.dominant_surface !== 'full-frame-fictional-keyframe-input'
        || cut.acquisition?.candidate_status !== 'planned-keyframe-input-blocked-all-cut-pass'
        || selection?.status !== 'not-applicable-fictional-omni-keyframes'
        || (selection?.candidate_ids ?? []).length !== 0
        || imagegenRequirements.length !== 2
        || (cut.imagegen_assets ?? []).length !== 2) failures.push(`${label}: fictional Omni cut needs two blocked, non-production keyframe-input plans`);
      for (const item of cut.imagegen_assets ?? []) {
        if (item.status !== 'planned-not-created' || item.origin !== 'imagegen-editorial-reconstruction'
          || item.identity_scope !== 'fictional-generic' || item.ai_disclosure !== true || item.evidence !== false
          || item.continuity_group !== 'ep001-fictional-purchase-delivery-report'
          || item.readable_text_names_dates_numbers_logos_ui_watermarks_forbidden !== true) failures.push(`${label}/${item.asset_id}: invalid fictional keyframe-input declaration`);
      }
    } else failures.push(`${label}: unsupported footage-first production mode`);
    for (const surface of cut.text_surfaces ?? []) {
      if (!['asset-label', 'surface-content', 'screen-chrome'].includes(surface.role) || surface.rotation_degrees !== 0 || surface.raster_beneath !== false || surface.raster_composite !== false) failures.push(`${label}/${surface.component_id}: invalid typography v2 text surface`);
      if (surface.role === 'asset-label' && (surface.placement !== 'dedicated-lane-below-named-target' || surface.asset_gap_px < 32 || surface.asset_gap_px > 72 || Math.abs(surface.target_centerline_offset_px) > 16)) failures.push(`${label}/${surface.component_id}: asset-label geometry invalid`);
    }
  }
} else {
  const scriptSourcePath = narrativeSourceFirstV3
    ? (spec.editorial_revision?.approved_script_source ?? spec.editorial_revision?.source_path ?? spec.script_lock?.source_path)
    : null;
  const expectedScriptHash = narrativeSourceFirstV3 && scriptSourcePath
    ? hash(await readFile(path.resolve(root, scriptSourcePath)))
    : 'cb7818354a74e9d9854528dc7ffdf204d4ee05f72458ecee02698987dfcebdd8';
  const expectedNarrationHash = narrativeSourceFirstV3
    ? hash(Buffer.from(cuts.map((cut) => cut.draft_narration).join(' ').replace(/\s/gu, ''), 'utf8'))
    : '0371e1395fcd1b152a2967bb00a8ea10b0bca9721fa563e23bd38172428c7964';
  const compactNarration = cuts.map((cut) => cut.draft_narration).join(' ').replace(/\s/gu, '');
  const allowedStatuses = narrativeSourceFirstV3
    ? ['candidate-script-source-first-plan-blocked', 'approved-script-narrative-source-first-plan-blocked', 'approved-script-narrative-source-first-plan']
    : ['approved-script-source-first-semantic-plan-blocked', 'approved-script-source-first-semantic-plan'];
  if (!allowedStatuses.includes(spec.status)
    || spec.editorial_revision?.production_authority !== false
    || !['candidate-plan-blocked', 'source-selected-editorial-plan'].includes(spec.editorial_revision?.status)) failures.push('source-first revision must be an editorial plan; stage and asset approvals are validated separately');
  if (spec.script_lock?.source_sha256 !== expectedScriptHash
    || spec.script_lock?.narration_sha256 !== expectedNarrationHash
    || spec.script_lock?.compact_character_count !== compactNarration.length
    || (!narrativeSourceFirstV3 && hash(Buffer.from(compactNarration, 'utf8')) !== expectedNarrationHash)) failures.push('source-first revision must preserve the exact user-approved narration bytes and order');
  const modeCounts = cuts.reduce((counts, cut) => ({...counts,[cut.production_mode]:(counts[cut.production_mode] ?? 0) + 1}), {});
  if (JSON.stringify(modeCounts) !== JSON.stringify(spec.editorial_revision?.mode_counts)) failures.push('source-first mode counts must match the editorial declaration');
  const omniAllowlist = new Set(spec.editorial_revision?.fictional_continuity?.cut_ids ?? []);
  let matrix = null;
  const matrixPending = narrativeSourceFirstV3
    && (spec.editorial_revision?.source_review_status === 'pending' || spec.editorial_revision?.source_selection_status === 'pending')
    && spec.editorial_visual_policy?.source_acquisition_matrix_status === 'pending'
    && !spec.editorial_revision?.source_review
    && !spec.editorial_revision?.source_review_sha256;
  try {
    if (matrixPending) throw new Error('pending');
    const matrixBytes = await readFile(path.resolve(root, spec.editorial_revision?.source_review));
    matrix = JSON.parse(matrixBytes);
    if (hash(matrixBytes) !== spec.editorial_revision?.source_review_sha256
      || hash(matrixBytes) !== spec.editorial_visual_policy?.source_acquisition_matrix_sha256
      || matrix.production_authority !== false || matrix.user_source_pass !== false
      || matrix.summary?.cuts_total !== cuts.length) failures.push('source-first acquisition matrix byte binding or candidate-only state is invalid');
  } catch (error) { if (!matrixPending) failures.push(`source-first acquisition matrix is missing or invalid: ${error.message}`); }
  const matrixCuts = new Map((matrix?.cuts ?? []).map((cut) => [cut.cut_id, cut]));
  if (!matrixPending) failures.push(...validateSourceFirstWindowContracts(spec,matrix));
  const probedPaths = new Set();
  for (const source of matrix?.green_inventory ?? []) {
    if (probedPaths.has(source.path)) continue;
    probedPaths.add(source.path);
    try {
      const filePath = path.resolve(root,source.path);
      const bytes = await readFile(filePath);
      if (hash(bytes) !== source.sha256) failures.push(`${source.id}: Green inventory local SHA-256 drift`);
      const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,width,height,avg_frame_rate,duration:format=duration','-of','json',filePath],{encoding:'utf8'}));
      const stream = probe.streams?.[0];
      const actualDuration = Number(stream?.duration ?? probe.format?.duration);
      if (stream?.codec_type !== 'video' || stream.width !== source.width || stream.height !== source.height) failures.push(`${source.id}: Green local media decode/dimensions mismatch`);
      if (source.media_type === 'video' && (!(actualDuration > 0) || Math.abs(actualDuration-source.duration_seconds)>0.1)) failures.push(`${source.id}: Green local video duration mismatch`);
    } catch (error) { failures.push(`${source.id}: Green local media probe failed (${error.message})`); }
  }
  for (const cut of cuts) {
    const label = cut.shot_id;
    const selection = cut.candidate_selection;
    const matrixCut = matrixCuts.get(label);
    if (!matrixPending && (!matrixCut || matrixCut.narration !== cut.draft_narration || matrixCut.production_mode !== cut.production_mode
      || matrixCut.source_need_taxonomy !== cut.source_need_taxonomy)) failures.push(`${label}: cut is not byte/semantic bound to the source matrix`);
    if (matrixPending && ['source-video','source-photo'].includes(cut.production_mode)
      && !(cut.requirements ?? []).some((item) => item.source_id === `SOURCE-SEARCH-${label}` && item.status === 'blocked')) failures.push(`${label}: pending acquisition requires an explicit blocked source gap`);
    if (!['exact-event','actual-speech','general-korean-context','document-workflow','legal-text','fictional-continuity'].includes(cut.source_need_taxonomy)) failures.push(`${label}: invalid source need taxonomy`);
    if (cut.production_authority !== false || selection?.rights_approval !== false || selection?.production_visible !== false) failures.push(`${label}: source-first candidate must remain unapproved and non-production`);
    if (cut.typography_surface_contract_version !== 2 || cut.layout_contract_version !== 2 || cut.layout_contract?.version !== 2) failures.push(`${label}: typography/layout v2 required`);
    if ((cut.timing?.provisional_duration_frames ?? 0) > 240 && !cut.long_cut_reason?.trim()) failures.push(`${label}: a longer cut needs a semantic pacing reason, not a segment quota`);
    for (const segment of cut.internal_presentation_segments ?? []) if (!Number.isInteger(segment.start_frame) || !Number.isInteger(segment.end_frame_exclusive) || segment.end_frame_exclusive <= segment.start_frame) failures.push(`${label}: source presentation segment must have a positive integer frame range`);
    if (narrativeSourceFirstV3) {
      if (!['source-video','source-photo','remotion','omni'].includes(cut.production_mode)) failures.push(`${label}: unsupported v3 production mode`);
      if (['source-video','source-photo'].includes(cut.production_mode)
        && !(cut.requirements ?? []).some((item) => item.source_id === `SOURCE-SEARCH-${label}` && item.status === 'blocked')) failures.push(`${label}: v3 real-media cut needs an explicit blocked source gap`);
    } else if (['source-video','source-photo'].includes(cut.production_mode)) {
      if (cut.media_strategy?.dominant_surface !== 'full-frame-real-source') failures.push(`${label}: real-media cut must use a full-frame real source`);
      for (const requirement of cut.requirements ?? []) {
        if (requirement.production_use === 'evidence-provenance-only; capture pixels forbidden on production canvas') continue;
        if (requirement.source_id === `SOURCE-SEARCH-${label}`) {
          if (requirement.status !== 'blocked' || requirement.blocker !== 'semantically_matching_self_service_source_not_found') failures.push(`${label}: honest gap is not fail-closed`);
        } else if (requirement.rights_lane === 'amber-direct-quotation-locator-only') {
          if (requirement.local_acquisition_authorization !== false || requirement.candidate_source_path || !requirement.exact_timecode
            || !requirement.commentary_binding?.trim() || !requirement.amount_necessity?.trim() || !requirement.market_substitution?.trim()
            || requirement.content_id_risk !== 'high' || requirement.production_use !== 'direct quotation candidate only; no local clip acquired') failures.push(`${label}/${requirement.requirement_id}: Amber locator must remain exact, commentary-bound and without local video`);
        } else if (requirement.rights_lane === 'green-item-license-verified') {
          if (!safeRelative(requirement.candidate_source_path) || !/^[a-f0-9]{64}$/u.test(requirement.candidate_sha256 ?? '')
            || !requirement.creator?.trim() || !requirement.license?.trim() || !requirement.item_url?.trim()
            || requirement.production_use !== 'context-only; never evidence or a depiction of the hypothetical crime') failures.push(`${label}/${requirement.requirement_id}: Green candidate lacks item-level path/hash/creator/license binding`);
          else {
            try { if (hash(await readFile(path.resolve(root, requirement.candidate_source_path))) !== requirement.candidate_sha256) failures.push(`${label}/${requirement.requirement_id}: Green local byte hash drift`); }
            catch (error) { failures.push(`${label}/${requirement.requirement_id}: Green local source missing (${error.message})`); }
          }
        } else failures.push(`${label}/${requirement.requirement_id}: real-media requirement needs Green, Amber, or explicit gap lane`);
      }
    } else if (cut.production_mode === 'remotion') {
      if (cut.source_need_taxonomy !== 'legal-text' || !cut.motion_graphics_justification?.trim()
        || cut.usage_layer !== 'necessary-explanation' || cut.media_strategy?.dominant_surface !== 'raster-free-native-procedure-surface'
        || !(cut.requirements ?? []).some((item) => item.production_use === 'evidence-provenance-only; capture pixels forbidden on production canvas')) failures.push(`${label}: Remotion must be justified by exact law/relationship/timing and official off-canvas evidence`);
    } else if (cut.production_mode === 'omni') {
      const imagegenRequirements = (cut.requirements ?? []).filter((item) => item.kind === 'imagegen-asset');
      if (!omniAllowlist.has(label) || cut.source_need_taxonomy !== 'fictional-continuity' || cut.usage_layer !== 'fictional-editorial-reconstruction'
        || cut.media_strategy?.dominant_surface !== 'full-frame-fictional-keyframe-input'
        || cut.acquisition?.candidate_status !== 'planned-keyframe-input-blocked-all-cut-pass'
        || selection?.status !== 'not-applicable-fictional-omni-keyframes' || imagegenRequirements.length !== 2 || (cut.imagegen_assets ?? []).length !== 2) failures.push(`${label}: Omni is restricted to two planned fictional continuity keyframes`);
      for (const item of cut.imagegen_assets ?? []) if (item.status !== 'planned-not-created' || item.origin !== 'imagegen-editorial-reconstruction'
        || item.identity_scope !== 'fictional-generic' || item.ai_disclosure !== true || item.evidence !== false
        || item.continuity_group !== 'ep001-fictional-purchase-delivery-report' || item.readable_text_names_dates_numbers_logos_ui_watermarks_forbidden !== true) failures.push(`${label}/${item.asset_id}: invalid Omni keyframe declaration`);
    } else failures.push(`${label}: unsupported source-first production mode`);
    for (const surface of cut.text_surfaces ?? []) {
      if (!['asset-label','surface-content','screen-chrome'].includes(surface.role) || surface.rotation_degrees !== 0 || surface.raster_beneath !== false || surface.raster_composite !== false) failures.push(`${label}/${surface.component_id}: invalid typography v2 surface`);
      if (surface.role === 'asset-label' && (surface.placement !== 'dedicated-lane-below-named-target' || surface.asset_gap_px < 32 || surface.asset_gap_px > 72 || Math.abs(surface.target_centerline_offset_px) > 16)) failures.push(`${label}/${surface.component_id}: asset-label geometry invalid`);
    }
    if (cut.source_need_taxonomy === 'legal-text' && ['source-video','source-photo'].includes(cut.production_mode)) {
      const textIds = cut.raster_free_text_contract?.text_component_ids ?? [];
      if (!textIds.length || !(cut.requirements ?? []).some((item)=>item.production_use==='evidence-provenance-only; capture pixels forbidden on production canvas')) failures.push(`${label}: source-backed legal text needs official evidence and a native text component`);
      for (const id of textIds) {
        const component = (cut.components ?? []).find((item)=>item.component_id===id);
        if (!component || component.compositing !== 'raster-free-native-dom-vector' || component.raster_beneath !== false || component.raster_composite !== false || component.text_surface_role !== 'surface-content') failures.push(`${label}/${id}: legal overlay must be a raster-free native surface-content component`);
      }
    }
  }
}

if (narrativeSourceFirstV3) {
  const notice = spec.intro_rules?.fictional_case_notice;
  const openingIds = ['SH001', 'SH002', 'SH003'];
  if (notice?.version !== 1 || JSON.stringify(notice.required_shot_ids) !== JSON.stringify(openingIds)
    || notice.literal_text !== '가상 사례 · AI 재구성'
    || notice.channel_exception_id !== 'source-rights-chrome' || notice.text_surface_role !== 'screen-chrome'
    || notice.placement !== 'separate-raster-free-rail-outside-image' || notice.first_visible_frame !== 0
    || notice.static_during_reading_hold !== true || notice.status !== 'required-before-user-cut-review') {
    failures.push('opening fictional-case/AI-origin notice contract must use the approved static raster-free screen-chrome rail');
  }
  if (!String(spec.route_catalog?.['IMAGEGEN-OMNI'] ?? '').includes('모든 계획 컷의 개별 사용자 PASS')
    || /\d+컷 PASS/u.test(spec.route_catalog['IMAGEGEN-OMNI'])) {
    failures.push('Omni route catalog must require individual PASS on every current planned cut without a stale numeric threshold');
  }
  for (const shotId of openingIds) {
    const cut = cuts.find((item) => item.shot_id === shotId);
    const id = `${shotId.toLowerCase()}-fiction-disclosure`;
    const surface = cut?.text_surfaces?.find((item) => item.component_id === id);
    const component = cut?.components?.find((item) => item.component_id === id);
    const beat = cut?.visual_beats?.[0];
    const visibility = beat?.component_visibility?.find((item) => item.component_id === id)?.states?.find((item) => item.state === 'supporting');
    if (cut?.production_mode !== 'omni' || !surface || !component || !beat
      || !cut.presentation?.supporting?.includes(id) || !beat.presentation?.supporting?.some((item) => item.component_id === id)
      || surface.literal_text !== notice?.literal_text || surface.role !== 'screen-chrome'
      || surface.channel_exception_id !== 'source-rights-chrome' || surface.placement !== 'separate-raster-free-rail-outside-image'
      || surface.raster_beneath !== false || surface.raster_composite !== false
      || component.literal_text !== notice?.literal_text || component.semantic_role !== 'compliance-origin-disclosure'
      || component.render_kind !== 'native-text-surface' || component.compositing !== 'raster-free-native-dom-vector'
      || component.text_surface_role !== 'screen-chrome' || component.channel_exception_id !== 'source-rights-chrome'
      || component.raster_beneath !== false || component.raster_composite !== false
      || !cut.raster_free_text_contract?.text_component_ids?.includes(id)
      || visibility?.start_frame !== 0 || visibility.end_frame_exclusive !== cut.duration_frames) {
      failures.push(`${shotId}: opening fictional-case/AI-origin notice must be visible from frame 0 in a separate native screen-chrome rail`);
    }
  }
}

if (sourceFirstRevision) failures.push(...auditEditorialRouting(spec).errors);

for (const [name, expected] of buildEpisodePlanOutputs(spec, specBytes)) {
  let actual = ''; try { actual = await readFile(outputs.get(name), 'utf8'); } catch (error) { failures.push(`${name}: missing (${error.message})`); continue; }
  if (actual !== expected) failures.push(`${name}: byte drift; regenerate`);
}
if (state.expected_cut_count !== expectedCutCount) failures.push('production state cut count differs from episode-spec');
if (!sourceFirstRevision || sourceSearchDraft) {
if (state.stage !== 'timing-draft' || state.expected_cut_count !== expectedCutCount || state.active_cut_root !== null) failures.push(`production state must remain timing-draft/${expectedCutCount}/active-null`);
if (editorialRevision && (state.render_authority?.status !== 'blocked-superseded-by-editorial-revision'
  || state.render_authority?.cut_root !== null || state.render_authority?.catalog !== null
  || state.render_authority?.production_authority !== false)) failures.push('footage-first revision must sever the stale render authority and catalog');
if (editorialRevision && (state.style_calibration?.candidate_root !== null
  || (state.style_calibration?.shot_ids ?? []).length !== 0
  || /SH003|SH006|SH008-SH014|omni-fiction/iu.test(JSON.stringify({
    style_calibration:state.style_calibration,
    reference_calibration:state.reference_calibration,
    style_frame_review:state.style_frame_review,
  })))) failures.push('footage-first revision must supersede prior style/reference/Omni state pointers');

if (state.cut_review?.all_cuts_passed !== false || state.style_calibration?.user_approved !== false || state.generation_input_review?.all_inputs_passed !== false || state.playable_cut_review?.all_playable_cuts_passed !== false || state.visual_review?.user_approved !== false || state.picture_lock?.approved !== false) failures.push('all PASS flags must remain false');
if (state.omni_video_generation?.status !== 'blocked_until_all_cuts_passed' || state.omni_video_generation?.allowed_after_marker !== null) failures.push('Omni must remain blocked until all cuts pass review');
} else {
  // A source-led plan can advance only through the existing stage validator; this editorial validator cannot mint approvals.
  if (spec.editorial_revision?.status !== 'source-selected-editorial-plan' || spec.status !== 'approved-script-source-first-semantic-plan') failures.push('source-led progression requires the source-selected editorial phase; a blocked plan cannot activate');
  try {
    execFileSync(process.execPath, [path.join(root, 'video/scripts/validate-production-stage.mjs'), '--state', statePath, '--assets-root', publicRoot], {cwd: root, encoding: 'utf8', windowsHide: true});
  } catch (error) { failures.push(`source-led progression requires stage/asset/user-approval validation: ${String(error.stdout || error.message).slice(0, 1200)}`); }
}

if (state.draft_inputs?.episode_spec !== 'video/episodes/episode-001/episode-spec.json' || state.draft_inputs?.episode_spec_sha256 !== specHash || state.draft_inputs?.narration_generated_source_sha256 !== specHash) failures.push('production state lacks sole spec/generated narration hash binding');

const scanVideos = async (dir, label) => {
  if (!(await exists(dir))) return;
  for (const entry of await readdir(dir, {recursive:true, withFileTypes:true})) if (entry.isFile() && videos.has(path.extname(entry.name).toLowerCase())) failures.push(`${label}: pre-PASS video forbidden (${entry.name})`);
};
if (state.cut_review?.all_cuts_passed !== true) {
await scanVideos(intakeRoot, 'source-intake Omni');
const runtimeText = (await Promise.all(runtimePaths.map((file) => readFile(file, 'utf8')))).join('\n').toLowerCase();
for (const extension of videos) if (runtimeText.includes(extension)) failures.push(`runtime pre-PASS video reference forbidden (${extension})`);
if (await exists(publicRoot)) for (const entry of await readdir(publicRoot, {recursive:true, withFileTypes:true})) {
  if (!entry.isFile()) continue;
  const full = path.join(entry.parentPath ?? entry.path, entry.name);
  if (videos.has(path.extname(entry.name).toLowerCase()) && /omni/i.test(full)) failures.push(`public Omni video forbidden (${path.relative(root, full)})`);
  if (entry.name === 'manifest.json' && /omni[\\/][^"']+\.(?:mp4|mov|webm|mkv|m4v|avi|mpeg|mpg|ts|3gp|flv)/iu.test(await readFile(full, 'utf8'))) failures.push(`${path.relative(root, full)}: pre-PASS Omni reference forbidden`);
}

}

if (failures.length) {
  console.error(`Episode spec validation failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else console.log(`Episode spec valid: ${cuts.length} cuts, ${cuts.reduce((n,c) => n + c.visual_beats.length, 0)} semantic planned beats, deterministic Manifest v3 contracts, ${masterFrames} frames.`);
