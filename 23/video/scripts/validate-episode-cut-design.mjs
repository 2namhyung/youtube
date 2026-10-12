import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {provisionalCutTiming} from './narration-timing-lib.mjs';
import {validateDeferredBeatIntent} from './editorial-route-contract.mjs';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');

function argPath(flag, fallback) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value) throw new Error(`${flag} requires a path`);
  return path.resolve(root, value);
}

const cutPlanPath = argPath('--cut-plan', path.join(episodeDir, 'cut-plan.json'));
const narrationPath = argPath('--narration', path.join(episodeDir, 'narration-plan.json'));
const specPath = argPath('--spec', path.join(episodeDir, 'episode-spec.json'));
const failures = [];

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const cutPlan = await readJson(cutPlanPath);
const narration = await readJson(narrationPath);
const specBytes = await readFile(specPath);
const spec = JSON.parse(specBytes.toString('utf8'));
const specSha256 = createHash('sha256').update(specBytes).digest('hex');
const cutPlanDir = path.dirname(cutPlanPath);
const explicitDesign = process.argv.indexOf('--design');
const designPath = explicitDesign >= 0
  ? argPath('--design', '')
  : path.resolve(cutPlanDir, cutPlan.cut_design ?? '');

if (!cutPlan.cut_design && explicitDesign < 0) failures.push('cut-plan.cut_design pointer is required');
if (explicitDesign < 0 && !designPath.startsWith(`${cutPlanDir}${path.sep}`)) failures.push('cut-plan.cut_design must remain inside the episode directory');

let design;
try { design = await readJson(designPath); } catch (error) { failures.push(`cannot read cut design: ${error.message}`); design = {}; }

const usageLayers = new Set(['documentary-evidence', 'context', 'explanation', 'reconstruction']);
const modes = new Set(['source-photo', 'source-video', 'remotion', 'omni']);
const layouts = new Set(['experience-hero', 'document-focus', 'process-flow', 'before-after']);
const transitions = new Set(['match', 'scene-to-scene', 'morph', 'hold']);
const subjectKinds = new Set(['person', 'building', 'interior', 'object']);
const routeCatalog = design.route_catalog ?? {};
const cuts = Array.isArray(design.cuts) ? design.cuts : [];
const narrationCuts = Array.isArray(narration.cuts) ? narration.cuts : [];
const specCuts = Array.isArray(spec.cuts) ? spec.cuts : [];
const expectedCutCount = specCuts.length;
const sourceLedRevision = ['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec.editorial_revision?.id)
  && spec.production_routing_policy?.version === 1;
const narrativeSourceFirstV3 = spec.editorial_revision?.id === 'ep001-narrative-source-first-v3';
const sourceLedBlockedPlan = sourceLedRevision
  && spec.editorial_revision?.status === 'candidate-plan-blocked'
  && specCuts.length > 0
  && specCuts.every((cut) => cut.production_authority === false
    && cut.production_decision?.human_review_status === 'pending'
    && cut.production_decision?.search_completion_status === 'pending-action-view-specific-source-selection')
  && cuts.every((cut) => (cut.visual_beats ?? []).every((beat) => beat.preview_status === 'blocked-assets-pending'
    && beat.action_intent?.status === 'deferred-until-source-selection'));

if (design.schema_version !== 2) failures.push('generated design.schema_version must be 2');
if (design?._generated?.do_not_edit !== true || design?.manual_authority !== './episode-spec.json') failures.push('design must be a generated compatibility output from episode-spec.json');
if (design.episode_id !== cutPlan.episode_id || design.episode_id !== narration.episode_id) failures.push('episode_id must agree across plan, design and narration');
if (expectedCutCount === 0) failures.push('episode spec must declare at least one cut');
if (spec.editorial_revision?.cut_count !== undefined && spec.editorial_revision.cut_count !== expectedCutCount) failures.push('editorial revision cut_count must match episode-spec cuts');
if (design.planned_cut_count !== expectedCutCount || cuts.length !== expectedCutCount || narrationCuts.length !== expectedCutCount || cutPlan.planned_cut_count !== expectedCutCount) failures.push(`plan, design and narration must each project the ${expectedCutCount} cuts declared by episode-spec`);
if (sourceLedRevision && !narrativeSourceFirstV3) {
  for (const [name, generated] of [['cut-plan', cutPlan], ['narration-plan', narration], ['cut-source-design', design]]) {
    if (generated._generated?.do_not_edit !== true || generated._generated?.source !== 'episode-spec.json'
      || generated._generated?.source_sha256 !== specSha256) failures.push(`${name} generated marker must bind the current episode-spec bytes`);
  }
}
if (!design.global_derivative_policy?.evidence_rule) failures.push('global_derivative_policy.evidence_rule is required');

const ids = new Set();
let masterFrames = 0;
for (let index = 0; index < cuts.length; index += 1) {
  const cut = cuts[index];
  const narrationCut = narrationCuts[index];
  const expectedId = specCuts[index]?.shot_id ?? `cut-${index + 1}`;
  const label = `${expectedId}`;
  const specCut = specCuts[index];
  if (cut?.shot_id !== expectedId || narrationCut?.shot_id !== expectedId) failures.push(`${label}: generated cut and narration IDs must match episode-spec order`);
  if (specCut?.production_mode !== cut?.production_mode || specCut?.production_mode !== narrationCut?.production_mode) failures.push(`${label}: production_mode must match episode-spec and narration-plan`);
  if (sourceLedRevision) {
    if (!specCut?.production_decision || JSON.stringify(cut?.production_decision) !== JSON.stringify(specCut.production_decision)) failures.push(`${label}: generated production_decision must exactly project episode-spec routing`);
    if (specCut?.production_authority !== false) failures.push(`${label}: source-led episode-spec cut must remain non-production`);
    for (const [beatIndex, beat] of (cut?.visual_beats ?? []).entries()) {
      const hasAction = Array.isArray(beat?.planned_operators) ? beat.planned_operators.length > 0 : beat?.planned_operator != null;
      if (!hasAction && sourceLedBlockedPlan) {
        for (const message of validateDeferredBeatIntent(specCut, beat)) failures.push(`${label}/beat-${beatIndex + 1}: ${message}`);
      } else if (!hasAction && (!beat?.action_intent || beat.action_intent.status === 'deferred-until-source-selection'
        || typeof beat.action_intent.observable_action !== 'string' || beat.action_intent.observable_action.trim() === '')) {
        failures.push(`${label}/beat-${beatIndex + 1}: active source-led beat needs a selected observable action or a valid blocked-source-search deferral`);
      }
    }
  }
  if (ids.has(cut?.shot_id)) failures.push(`${label}: duplicate shot_id`);
  ids.add(cut?.shot_id);
  if (typeof cut?.viewer_takeaway !== 'string' || cut.viewer_takeaway.trim() === '') failures.push(`${label}: viewer_takeaway is required`);
  if (sourceLedRevision) {
    if (typeof cut?.usage_layer !== 'string' || cut.usage_layer.trim() === '') failures.push(`${label}: usage_layer is required`);
    if (!modes.has(cut?.production_mode)) failures.push(`${label}: invalid production_mode`);
  } else {
    if (!usageLayers.has(cut?.usage_layer)) failures.push(`${label}: invalid usage_layer`);
    if (!modes.has(cut?.production_mode) || cut?.production_mode !== narrationCut?.production_mode) failures.push(`${label}: production_mode must match narration-plan`);
    if (cut?.production_mode === 'omni' && cut?.usage_layer !== 'reconstruction') failures.push(`${label}: Omni is allowed only for reconstruction`);
    if (cut?.usage_layer === 'reconstruction' && cut?.production_mode !== 'omni') failures.push(`${label}: reconstruction must remain an Omni keyframe cut`);
    if (index < 7 && cut?.production_mode === 'omni') failures.push(`${label}: hook cuts cannot default to generated media`);
  }

  if (!sourceLedRevision) {
    const acquisition = cut?.acquisition;
    if (!Array.isArray(acquisition?.priority) || acquisition.priority.length === 0) failures.push(`${label}: acquisition.priority is required`);
    if (typeof acquisition?.candidate_status !== 'string' || acquisition.candidate_status.trim() === '') failures.push(`${label}: acquisition.candidate_status is required`);
    if (acquisition?.preserve_full_original !== true) failures.push(`${label}: full original source preservation is mandatory`);
    for (const candidate of acquisition?.priority ?? []) {
      const route = typeof candidate === 'string' ? candidate.split(':', 1)[0] : '';
      if (!Object.hasOwn(routeCatalog, route)) failures.push(`${label}: unknown acquisition route ${route || '(empty)'}`);
    }

    const sourceIds = new Set(narrationCut?.source_ids ?? []);
    const evidenceOriginals = new Set(cut?.evidence_originals ?? []);
    if (evidenceOriginals.size === 0) failures.push(`${label}: evidence_originals is required`);
    for (const sourceId of sourceIds) if (!evidenceOriginals.has(sourceId)) failures.push(`${label}: narration source_id ${sourceId} is not preserved in evidence_originals`);

    const derivativeIds = new Set();
    for (const derivative of cut?.transparent_derivatives ?? []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(derivative?.asset_id ?? '') || derivative.asset_id.includes('..')) failures.push(`${label}: derivative asset_id must be a safe kebab-case ID`);
      if (derivativeIds.has(derivative?.asset_id)) failures.push(`${label}: derivative asset IDs must be independent and unique`);
      derivativeIds.add(derivative?.asset_id);
      if (!subjectKinds.has(derivative?.subject_kind)) failures.push(`${label}: invalid derivative subject_kind`);
      if (!Object.hasOwn(routeCatalog, derivative?.source_route)) failures.push(`${label}: derivative source_route is not catalogued`);
      if (cut?.usage_layer !== 'reconstruction' && derivative?.source_route === 'IMAGEGEN-OMNI') failures.push(`${label}: real/context cutouts cannot be generated substitutes`);
      if (String(derivative?.use ?? '').includes('documentary-evidence')) failures.push(`${label}: a transparent derivative cannot be the documentary evidence original`);
      if (typeof derivative?.segmentation !== 'string' || derivative.segmentation.trim() === '' || /automatic-quality-guaranteed/i.test(derivative.segmentation)) failures.push(`${label}: honest segmentation requirement is required`);
    }

    const presentation = cut?.presentation;
    if (typeof presentation?.focal !== 'string' || presentation.focal.trim() === '') failures.push(`${label}: exactly one focal component is required`);
    if (!Array.isArray(presentation?.supporting) || !Array.isArray(presentation?.hidden_until)) failures.push(`${label}: supporting and hidden_until arrays are required`);
    if (!layouts.has(presentation?.layout_template)) failures.push(`${label}: invalid Manifest v3 layout_template`);
  }

  const expectedTiming = narrationCut ? provisionalCutTiming(narrationCut, narration) : {durationFrames: 0, masterOccupancyFrames: 0};
  if (cut?.timing?.provisional_duration_frames !== expectedTiming.durationFrames) failures.push(`${label}: provisional duration differs from temporary narration authority`);
  if (cut?.timing?.master_occupancy_frames !== expectedTiming.masterOccupancyFrames) failures.push(`${label}: master occupancy differs from temporary narration authority`);
  if (!Number.isInteger(cut?.timing?.reading_hold_frames) || cut.timing.reading_hold_frames < narration.fps * 2 || cut.timing.reading_hold_frames > expectedTiming.durationFrames) failures.push(`${label}: reading hold must be at least 2 seconds and fit inside the cut`);
  masterFrames += cut?.timing?.master_occupancy_frames ?? 0;

  const transitionTypes = sourceLedRevision ? new Set([...transitions, 'hard-cut']) : transitions;
  if (!transitionTypes.has(cut?.transition?.type) || typeof cut?.transition?.intent !== 'string' || cut.transition.intent.trim() === '') failures.push(`${label}: valid transition type and intent are required`);
  const next = cuts[index + 1];
  if (!sourceLedRevision && next?.production_mode === 'remotion' && cut?.production_mode === 'remotion' && !['scene-to-scene', 'morph'].includes(cut?.transition?.type)) failures.push(`${label}: adjacent Remotion cuts require scene-to-scene or morph intent`);
  if (!sourceLedRevision && index === cuts.length - 1 && cut?.transition?.type !== 'hold') failures.push(`${label}: final cut must end in a hold`);
  if (!Array.isArray(cut?.missing_inputs)) failures.push(`${label}: missing_inputs must be explicit`);
  if (typeof cut?.fallback?.allowed !== 'string' || typeof cut?.fallback?.forbidden !== 'string' || cut.fallback.forbidden.trim() === '') failures.push(`${label}: allowed and forbidden fallback rules are required`);
}

const expectedMasterFrames = design?.timing_authority?.provisional_master_frames;
if (masterFrames !== expectedMasterFrames) failures.push(`master frame sum ${masterFrames} does not match timing authority ${expectedMasterFrames}`);
const seconds = masterFrames / narration.fps;
if (seconds < narration.runtime_target_seconds.min || seconds > narration.runtime_target_seconds.max) failures.push(`provisional runtime ${seconds}s is outside 8-10 minute target`);
if (design?.timing_authority?.compact_korean_chars_per_second !== narration?.draft_timing_assumption?.compact_korean_chars_per_second) failures.push('speaking-rate authority must match narration-plan exactly');
if (design?.timing_authority?.provisional_master_seconds !== seconds) failures.push('design provisional_master_seconds must equal frame sum / fps');

if (failures.length) {
  console.error(`Episode cut design validation failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(sourceLedRevision
    ? `Episode cut design integrity valid: ${cuts.length} source-led cuts, ${masterFrames} provisional frames, ${seconds.toFixed(1)}s${sourceLedBlockedPlan ? '; blocked/non-production, no render approval.' : '; route remains subject to stage and human-review gates.'}`
    : `Episode cut design valid: ${cuts.length} cuts, ${masterFrames} frames, ${seconds.toFixed(1)}s, source/presentation contract preserved.`);
}
