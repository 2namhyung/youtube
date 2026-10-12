import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import sharp from 'sharp';

const root = process.cwd();
const rel = (value) => value.replaceAll('\\', '/');
const abs = (value) => path.resolve(root, value);
const readJson = async (value) => JSON.parse(await readFile(abs(value), 'utf8'));
const shaBytes = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (value) => shaBytes(await readFile(abs(value)));
const writeJson = async (value, data) => writeFile(abs(value), `${JSON.stringify(data, null, 2)}\n`);
const execFileAsync = promisify(execFile);

export const REVIEW = Object.freeze({
  manifestPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/manifest.json',
  manifestSha256: '35c77a0e01abe29c2b880e2a0a126db234042fba7c10aee6489b7c4b3c868f9c',
  inputBundleSha256: 'bd6ac47d259153cbf07eb3c8dd10ae01c0ca0f146eae32696ca146f603fa8cf7',
  boardPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/review-board-1920x1080.png',
  boardSha256: '87c5f15a7d4a40b2b42105bea0af0b58e58617d241c5eba3613209e423a6c380',
  reelPath: 'video/qa/reference-study/motion-reverse-engineering-review-v01/review-reel-provisional.mp4',
  reelSha256: 'a7948e1afbd093ea1e88e04f4241852c63dba2b2bd8ebf81c988ab9509e5a434',
});

export const SUPERSESSION = Object.freeze({
  path: 'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json',
  status: 'superseded-by-user-correction',
});

export function assertV01SupersededMarker(marker) {
  const valid = marker?.schema_version === 1
    && marker.status === SUPERSESSION.status
    && marker.reviewer === 'user'
    && typeof marker.recorded_at === 'string' && marker.recorded_at.length > 0
    && marker.superseded_approval?.path === 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-calibration-approval.json'
    && /^[a-f0-9]{64}$/u.test(marker.superseded_approval?.sha256 ?? '')
    && marker.superseded_approval.authority === 'historical-only'
    && marker.superseded_grammar_approval?.path === 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-grammar-approval.json'
    && /^[a-f0-9]{64}$/u.test(marker.superseded_grammar_approval?.sha256 ?? '')
    && marker.superseded_grammar_approval.authority === 'historical-only'
    && marker.superseded_review?.path === REVIEW.manifestPath
    && marker.superseded_review.authority === 'historical-only'
    && /^[a-f0-9]{64}$/u.test(marker.superseded_review?.sha256 ?? '')
    && marker.corrected_review?.path === 'video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json'
    && marker.corrected_review.status === 'pending-human-corrected-reference-calibration-review'
    && marker.non_grants?.reference_calibration_pass === false
    && marker.non_grants?.grammar_promotion === false
    && marker.non_grants?.production_authority === false
    && marker.non_grants?.active_cut_root === null;
  if (!valid) throw new Error('the ten-sample v01 approval is historical-only; supersession marker is missing or invalid');
  return marker;
}

export const CATEGORY_ORDER = Object.freeze([
  'visual_object_role',
  'layout_relation',
  'depth_occlusion',
  'text_surface_role',
  'motion_operator',
  'transition_operator',
  'treatment',
]);

export const GRAMMAR_SPECS = Object.freeze([
  {category: 'visual_object_role', grammar_id: 'persistent-editorial-background', sample: 1, start: 157, end: 232, fact: 'A stable editorial background persists while independently timed concrete objects accumulate above it.'},
  {category: 'visual_object_role', grammar_id: 'dominant-concrete-focal', sample: 1, start: 169, end: 184, fact: 'One concrete source-derived object carries the dominant emphasis for its visual beat.'},
  {category: 'visual_object_role', grammar_id: 'supporting-source-object', sample: 1, start: 194, end: 232, fact: 'Independent source-derived objects support the focal object without replacing it with explanatory cards.'},
  {category: 'layout_relation', grammar_id: 'layered-collage', sample: 1, start: 157, end: 232, fact: 'The composition is assembled from independently legible layers with persistent accumulated visibility.'},
  {category: 'depth_occlusion', grammar_id: 'background-midground-foreground', sample: 1, start: 169, end: 232, fact: 'Objects occupy declared depth roles and later foreground people visibly occlude the building roofline.'},
  {category: 'text_surface_role', grammar_id: 'source-surface-text', sample: 9, start: 70, end: 120, fact: 'Changing values, percentages, and chart marks remain bound to the named device surface; they are not detached explanatory copy.'},
  {category: 'motion_operator', grammar_id: 'independent-target-translate', sample: 5, start: 995, end: 1021, fact: 'Independently rendered targets translate while retained targets preserve identity and internal registration.'},
  {category: 'motion_operator', grammar_id: 'staggered-object-accumulation', sample: 1, start: 157, end: 232, fact: 'Concrete objects enter on separate schedules and remain visible after entry.'},
  {category: 'motion_operator', grammar_id: 'numeric-group-rise-fade-count-up', sample: 2, start: 563, end: 623, fact: 'The complete icon/value/unit group rises and fades as its source-bound number progresses framewise.'},
  {category: 'motion_operator', grammar_id: 'plot-local-progressive-reveal', sample: 3, start: 766, end: 837, fact: 'After the chart shell settles, visible change remains confined to the plot region and progresses across the series.'},
  {category: 'motion_operator', grammar_id: 'map-reframe-local-overlay-lifecycle', sample: 4, start: 190, end: 450, fact: 'Registered geography is reframed while markers, borders, vehicles, paths, and the localized event keep independent lifecycles.'},
  {category: 'motion_operator', grammar_id: 'source-surface-state-progression', sample: 9, start: 60, end: 155, fact: 'A stable device wrapper contains framewise value, percentage, and chart-state progression plus independent support-icon entry.'},
  {category: 'motion_operator', grammar_id: 'discrete-title-state-progression', sample: 7, start: 228, end: 300, fact: 'The title segment advances through source-observed phrase states after its hard-cut boundary.'},
  {category: 'transition_operator', grammar_id: 'object-preserving-layout-reframe', sample: 5, start: 995, end: 1021, fact: 'One source object preserves identity while another exits and the retained object recenters as focal.'},
  {category: 'transition_operator', grammar_id: 'directional-scene-exit-left', sample: 6, start: 711, end: 726, fact: 'Every visible scene layer, including background and screen chrome, exits together under one left-moving parent.'},
  {category: 'transition_operator', grammar_id: 'hard-cut', sample: 6, start: 370, end: 371, fact: 'Adjacent source frames prove an unblended full-scene replacement with no intermediate blend frame.'},
]);

export const SAMPLE_GRAMMAR = Object.freeze({
  1: ['persistent-editorial-background', 'dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'background-midground-foreground', 'independent-target-translate', 'staggered-object-accumulation'],
  2: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'source-surface-text', 'independent-target-translate', 'numeric-group-rise-fade-count-up'],
  3: ['dominant-concrete-focal', 'source-surface-text', 'plot-local-progressive-reveal'],
  4: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'map-reframe-local-overlay-lifecycle'],
  5: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'independent-target-translate', 'object-preserving-layout-reframe'],
  6: ['layered-collage', 'directional-scene-exit-left', 'hard-cut'],
  7: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'independent-target-translate', 'staggered-object-accumulation', 'discrete-title-state-progression', 'hard-cut'],
  8: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'staggered-object-accumulation'],
  9: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'source-surface-text', 'source-surface-state-progression', 'staggered-object-accumulation'],
  10: ['dominant-concrete-focal', 'supporting-source-object', 'layered-collage', 'staggered-object-accumulation', 'hard-cut'],
});

export const PENDING_AUTHORING_IDS = Object.freeze([
  'chart-self-draw',
  'camera-reframe',
  'svg-path-stroke-draw',
  'homography-perspective-animation',
  'source-footage-internal-motion',
  'paper-print-texture',
  'micro-easing-profile',
]);

export const HIDDEN_AUTHORING_UNCERTAINTIES = Object.freeze([
  'Flattened MP4s do not expose original layers, masks, keyframes, or exact easing.',
  'Sample 03 proves a plot-local progressive reveal but cannot distinguish stroke drawing from a tight plot-local clip.',
  'Sample 04 does not expose exact camera interpolation or whether some map motion was pre-rendered; the path may be a clip reveal rather than an SVG stroke draw.',
  'Sample 09 does not expose the original phone homography or perspective animation.',
  'Source-footage internal motion is contextual evidence and is not promoted as a transferable Remotion operator.',
]);

const approvalPath = 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-calibration-approval.json';
const grammarApprovalPath = 'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-grammar-approval.json';
const grammarContractPath = 'video/episodes/episode-001/reference-grammar-contract.json';
const grammarBindingPath = 'video/episodes/episode-001/reference-grammar-binding.json';
const styleGatesPath = 'video/episodes/episode-001/reference-style-gates.json';
const statePath = 'video/episodes/episode-001/production-state.json';
const blueprintPath = 'video/episodes/episode-001/generated/reference-cut-blueprint.json';

const normalizedInputBundle = (inputs) => shaBytes(Buffer.from(inputs.map((item) => `${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')));
const grammarEvidenceHash = (entries) => shaBytes(Buffer.from(entries.map(({category, entry}) => [
  category,
  entry.grammar_id,
  entry.source_video_path,
  entry.source_video_sha256,
  entry.timecode_range.start_frame,
  entry.timecode_range.end_frame,
  entry.reference_still.path,
  entry.reference_still.sha256,
  entry.reference_still.source_frame,
  entry.approved_review_binding.analysis_path,
  entry.approved_review_binding.analysis_sha256,
].join('|')).join('\n')));

const timecode = (frame, fps) => {
  const total = frame / fps;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
};

const evidencePath = (sample, frame) => {
  const token = String(frame).padStart(6, '0');
  const found = sample.evidence_paths.find((value) => /(?:source|reference)-frame-/u.test(value) && value.includes(token));
  if (!found) throw new Error(`sample ${sample.sample_number}: evidence frame ${frame} is missing`);
  return found;
};

export function assertApprovalApplicationState(gates, state) {
  const calibrationPassed = gates.reference_calibration?.status === 'reference-calibration-passed';
  const familiesUnapproved =
    gates.visual_families?.length === 6 &&
    gates.visual_families.every((family) => family.user_approved === false && family.approval_marker === null && family.approval_marker_sha256 === null && family.approved_inputs_sha256 === null);
  const laterStagesLocked =
    state.generation_input_review?.status === 'pending' &&
    state.generation_input_review?.all_inputs_passed === false &&
    state.generation_input_review?.approval_marker === null &&
    state.generation_input_review?.approved_bundle_sha256 === null &&
    state.playable_cut_review?.status === 'pending' &&
    state.playable_cut_review?.all_playable_cuts_passed === false &&
    state.playable_cut_review?.approval_marker === null &&
    state.playable_cut_review?.approved_bundle_sha256 === null &&
    state.final_script?.status === 'unlocked' &&
    state.final_script?.user_visual_review_approval_marker === null &&
    state.final_script?.locked_at === null &&
    state.picture_lock?.status === 'unlocked' &&
    state.picture_lock?.final_qc_marker === null &&
    state.picture_lock?.approved === false;
  const commonDownstreamLocked =
    familiesUnapproved &&
    laterStagesLocked &&
    gates.static_to_playable_parity?.status === 'blocked-pre-style-pass' &&
    gates.static_to_playable_parity?.pass === false &&
    gates.motion_proof?.status === 'not-applicable-before-style-pass' &&
    gates.motion_proof?.pass === false &&
    state.stage === 'timing-draft' &&
    state.active_cut_root === null &&
    state.style_frame_review?.user_approved === false &&
    state.style_frame_review?.approval_marker === null &&
    state.style_frame_review?.approval_marker_sha256 === null &&
    state.style_frame_review?.approved_inputs_sha256 === null &&
    state.reference_style_gates?.approved_family_ids?.length === 0 &&
    state.cut_review?.all_cuts_passed === false &&
    state.cut_review?.approval_marker === null &&
    state.omni_video_generation?.status === 'blocked_until_all_cuts_passed' &&
    state.omni_video_generation?.allowed_after_marker === null &&
    state.visual_review?.status === 'pending' &&
    state.visual_review?.user_approved === false &&
    state.visual_review?.all_cuts_passed === false &&
    state.visual_review?.approval_marker === null &&
    state.visual_review?.provisional_video_approval_marker === null &&
    state.visual_review?.approved_artifact_sha256 === null;
  const approvedButLocked =
    gates.status === 'pending-user-style-frame-review' &&
    gates.reference_calibration?.approval_route === 'motion-reverse-engineering-review-v01' &&
    gates.visual_families?.every((family) => family.status === 'pending-user-style-frame-review' && family.user_approved === false && family.approval_marker === null && family.approved_inputs_sha256 === null) &&
    state.style_frame_review?.status === 'pending-user-style-frame-review' &&
    commonDownstreamLocked;
  if (calibrationPassed) {
    if (!approvedButLocked) throw new Error('refusing to reapply reference calibration approval after a downstream gate or production state has progressed');
    return 'already-applied';
  }
  const initialGate = gates.status === 'blocked-pending-reference-calibration' && gates.reference_calibration?.status === 'reference-calibration-incomplete' && gates.visual_families?.every((family) => family.status === 'blocked-pending-reference-calibration');
  const initialCalibrationLocked =
    state.reference_calibration?.status === 'reference-calibration-incomplete' &&
    state.reference_calibration?.eligible_for_user_style_frame_review === false &&
    state.reference_calibration?.user_reference_calibration_pass === false &&
    state.reference_calibration?.grammar_promoted === false &&
    state.reference_calibration?.exact_bindings_complete === false &&
    state.reference_calibration?.side_by_side_complete === false &&
    state.reference_calibration?.approval_marker === null &&
    state.reference_calibration?.approval_marker_sha256 === null &&
    state.reference_calibration?.approved_inputs_sha256 === null;
  const initialState = state.style_frame_review?.status === 'blocked-pending-reference-calibration' && state.reference_style_gates?.status === 'blocked-pending-reference-calibration' && initialCalibrationLocked && laterStagesLocked && commonDownstreamLocked;
  if (!initialGate || !initialState) throw new Error('reference calibration approval can only be applied from the incomplete timing-draft gate');
  return 'apply';
}

export async function applyReferenceCalibrationApproval(options = {}) {
  let supersession;
  try {
    supersession = await readJson(options.supersessionPath ?? SUPERSESSION.path);
    assertV01SupersededMarker(supersession);
  } catch (error) {
    if (error?.message?.includes('historical-only')) throw error;
    throw new Error('the ten-sample v01 approval is historical-only; supersession marker is missing or invalid');
  }
  if (supersession.status === SUPERSESSION.status) throw new Error('the ten-sample v01 approval is historical-only and cannot be reapplied after the user correction');
  for (const [value, expected] of [[REVIEW.manifestPath, REVIEW.manifestSha256], [REVIEW.boardPath, REVIEW.boardSha256], [REVIEW.reelPath, REVIEW.reelSha256]]) {
    const actual = await shaFile(value);
    if (actual !== expected) throw new Error(`${value}: expected ${expected}, got ${actual}`);
  }
  const review = await readJson(REVIEW.manifestPath);
  if (review.artifact_bundle_sha256 !== REVIEW.inputBundleSha256 || normalizedInputBundle(review.inputs) !== REVIEW.inputBundleSha256) throw new Error('review input bundle drift');
  const gates = await readJson(styleGatesPath);
  const state = await readJson(statePath);
  const applicationState = assertApprovalApplicationState(gates, state);
  if (applicationState === 'already-applied') {
    const validateCurrentApproval = options.validateCurrentApproval ?? (() => execFileAsync(process.execPath, [abs('video/scripts/validate-reference-calibration-approval-v01.mjs')], {cwd: root}));
    await validateCurrentApproval();
    return {
      status: applicationState,
      approval_marker_sha256: await shaFile(approvalPath),
      grammar_approval_marker_sha256: await shaFile(grammarApprovalPath),
      grammar_contract_sha256: await shaFile(grammarContractPath),
      style_gates_sha256: await shaFile(styleGatesPath),
      blueprint_sha256: await shaFile(blueprintPath),
      approved_inputs_sha256: REVIEW.inputBundleSha256,
      grammar_count: GRAMMAR_SPECS.length,
      binding_count: Object.values(SAMPLE_GRAMMAR).flat().length,
    };
  }
  const samples = new Map(review.samples.map((sample) => [sample.sample_number, sample]));
  if (samples.size !== 10) throw new Error('exactly ten ordered review samples are required');
  const specsById = new Map(GRAMMAR_SPECS.map((spec) => [spec.grammar_id, spec]));
  const bindings = [];
  for (let sampleNumber = 1; sampleNumber <= 10; sampleNumber += 1) {
    const sample = samples.get(sampleNumber);
    if (!sample || sample.sample_number !== sampleNumber) throw new Error(`sample ${sampleNumber}: order drift`);
    for (const grammarId of SAMPLE_GRAMMAR[sampleNumber]) {
      const spec = specsById.get(grammarId);
      bindings.push({sample_number: sampleNumber, sample_id: sample.sample_id, category: spec.category, grammar_id: grammarId, target_type: ['motion_operator'].includes(spec.category) ? 'action' : spec.category === 'transition_operator' ? 'transition' : 'component', target_id: `${sample.sample_id}/${grammarId}`, analysis_path: sample.analysis_path, evidence_frames: sample.exact_events.map((event) => ({source_frame: event.source_frame, probe_frame: event.probe_frame, label: event.label}))});
    }
  }
  const approvedSubset = [...new Set(bindings.map((binding) => binding.grammar_id))].sort();
  const approval = {
    schema_version: 1,
    status: 'approved-reference-calibration',
    reviewer: 'user',
    approved_at: '2026-09-02',
    decision_source: 'User reviewed the final ten-sample review package and explicitly replied PASS in the current task.',
    reviewed_package: {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256, package_id: review.package_id, input_bundle_sha256: REVIEW.inputBundleSha256},
    reviewed_artifacts: [
      {kind: 'review-board', path: REVIEW.boardPath, sha256: REVIEW.boardSha256},
      {kind: 'review-reel', path: REVIEW.reelPath, sha256: REVIEW.reelSha256},
    ],
    approved_inputs: review.inputs,
    approved_inputs_sha256: REVIEW.inputBundleSha256,
    sample_decisions: review.samples.map((sample) => ({sample_number: sample.sample_number, sample_id: sample.sample_id, decision: 'PASS', side_by_side_path: sample.side_by_side_path, side_by_side_sha256: review.inputs.find((item) => item.path === sample.side_by_side_path)?.sha256, contact_path: sample.contact_path, contact_sha256: review.inputs.find((item) => item.path === sample.contact_path)?.sha256})),
    reference_grammar: {categories: CATEGORY_ORDER, bindings, approved_subset: approvedSubset, unmapped_visual_grammar: [], novel_visual_grammar: []},
    channel_exception_bindings: [
      {sample_number: 10, exception_id: 'short-asset-label-below-target', target_id: 'sample-10/object-value-labels'},
      {sample_number: 0, exception_id: 'source-rights-chrome', target_id: 'review-package/source-chrome'},
    ],
    hidden_authoring_uncertainties: HIDDEN_AUTHORING_UNCERTAINTIES,
    non_grants: {style_frame_pass: false, cut_pass: false, rights_approval: false, omni_video_generation: false, production_authority: false, active_cut_root: null, stage_advance: false},
  };
  await writeJson(approvalPath, approval);
  const approvalRecord = {path: approvalPath, sha256: await shaFile(approvalPath)};

  const categories = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, []]));
  const activeEntries = [];
  for (const spec of GRAMMAR_SPECS) {
    const sample = samples.get(spec.sample);
    const analysis = await readJson(sample.analysis_path);
    const source = analysis.source_binding;
    const sourcePath = source.path ?? source.local_path;
    const sourceSha = source.sha256;
    const fps = source.fps;
    const startPath = evidencePath(sample, spec.start);
    const endPath = evidencePath(sample, spec.end);
    const endMeta = await sharp(abs(endPath)).metadata();
    const entry = {
      grammar_id: spec.grammar_id,
      source_video_path: sourcePath,
      source_video_sha256: sourceSha,
      timecode_range: {start_frame: spec.start, end_frame: spec.end, start: timecode(spec.start, fps), end: timecode(spec.end, fps), source_fps: fps},
      reference_still: {path: endPath, sha256: await shaFile(endPath), width: endMeta.width, height: endMeta.height, source_frame: spec.end, extracted_at_timecode: timecode(spec.end, fps)},
      observed_fact: spec.fact,
      source_analysis: 'wiki/syntheses/motion-reverse-engineering-suite-v0.1.md#exact-windows-and-transferable-contracts',
      approved_review_binding: {sample_number: spec.sample, sample_id: sample.sample_id, analysis_path: sample.analysis_path, analysis_sha256: await shaFile(sample.analysis_path), start_evidence: {path: startPath, sha256: await shaFile(startPath)}, end_evidence: {path: endPath, sha256: await shaFile(endPath)}, review_manifest: {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256}},
      human_approval: null,
    };
    categories[spec.category].push(entry);
    activeEntries.push({category: spec.category, entry});
  }
  const evidenceBundleSha = grammarEvidenceHash(activeEntries);
  const grammarApproval = {
    schema_version: 1,
    status: 'approved-human-grammar',
    reviewer: 'user',
    approved_at: '2026-09-02',
    calibration_approval: approvalRecord,
    approved_grammar_ids: GRAMMAR_SPECS.map((spec) => spec.grammar_id),
    approved_subset: approvedSubset,
    evidence_bundle_sha256: evidenceBundleSha,
    unmapped_visual_grammar: [],
    novel_visual_grammar: [],
    hidden_authoring_uncertainties: approval.hidden_authoring_uncertainties,
  };
  await writeJson(grammarApprovalPath, grammarApproval);
  const grammarApprovalRecord = {path: grammarApprovalPath, sha256: await shaFile(grammarApprovalPath)};
  for (const entries of Object.values(categories)) for (const entry of entries) entry.human_approval = {status: 'approved', approved: true, marker: grammarApprovalRecord};

  const pending = [
    ['motion_operator', 'chart-self-draw', 'The approved evidence proves plot-local progressive reveal, but not whether the hidden authoring used strokeDashoffset rather than a clip.', ['authoring project or layer export', 'operator-isolated runtime proof']],
    ['motion_operator', 'camera-reframe', 'The approved map and layout evidence cannot uniquely distinguish a camera transform from coordinated target transforms or pre-rendered motion.', ['authoring transform track', 'camera-versus-target isolation proof']],
    ['motion_operator', 'svg-path-stroke-draw', 'The approved map path may be a local clip reveal; literal SVG stroke drawing is not proven.', ['path layer export', 'strokeDashoffset runtime proof']],
    ['motion_operator', 'homography-perspective-animation', 'The flattened phone pixels do not expose an animated homography and measured angle change is negligible.', ['corner-track homography evidence', 'perspective runtime proof']],
    ['motion_operator', 'source-footage-internal-motion', 'Motion inside embedded footage is contextual source motion, not a transferable Remotion operator.', ['separable authored overlay proof', 'transfer prototype']],
    ['treatment', 'paper-print-texture', 'The appearance may be baked into source pixels and no treatment-isolated before/after evidence exists.', ['treatment-isolated source evidence', 'before-and-after runtime proof']],
    ['motion_operator', 'micro-easing-profile', 'Exact easing curves cannot be recovered from the flattened MP4 with sufficient confidence.', ['authoring keyframe graph', 'operator-specific curve export']],
  ].map(([category, grammar_id, reason, required_evidence]) => ({category, grammar_id, status: 'pending_evidence', reason, required_evidence}));
  const grammarContract = {
    reference_grammar_contract_version: 1,
    status: 'approved-human-grammar',
    approval_marker: grammarApprovalRecord,
    calibration_approval_marker: approvalRecord,
    purpose: 'Human-approved, source-bound visual grammar allowlist extracted from the ten-sample reverse-engineering review. It governs observable roles and operators, not subject matter, hidden authoring guesses, or pixel copying.',
    source: {path: 'raw/inbox/vox-style-claude-remotion-reference.mp4', source_kind: 'primary-locked-reference-video', sha256: '0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9'},
    approved_review_package: {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256, approved_inputs_sha256: REVIEW.inputBundleSha256, board: {path: REVIEW.boardPath, sha256: REVIEW.boardSha256}, reel: {path: REVIEW.reelPath, sha256: REVIEW.reelSha256}},
    categories,
    bindings,
    approved_subset: approvedSubset,
    unmapped_visual_grammar: [],
    novel_visual_grammar: [],
    pending_evidence_entries: pending,
    hidden_authoring_uncertainties: approval.hidden_authoring_uncertainties,
    channel_exceptions: [
      {exception_id: 'beige-checker-background', purpose: 'house-background', target_type: 'component'},
      {exception_id: 'source-rights-chrome', purpose: 'source-attribution', target_type: 'component'},
      {exception_id: 'source-locked-legal-retype', purpose: 'readability-compliance', target_type: 'component'},
      {exception_id: 'short-asset-label-below-target', purpose: 'asset-identification', target_type: 'component'},
    ],
    exception_constraints: {may_be_focal: false, may_define_motion: false, may_define_transition: false, may_be_decorative_motif: false},
  };
  await writeJson(grammarContractPath, grammarContract);
  const grammarContractRecord = {path: grammarContractPath, sha256: await shaFile(grammarContractPath)};
  await writeJson(grammarBindingPath, {schema_version: 1, grammar_contract: grammarContractRecord, status: grammarContract.status, approval_marker: grammarApprovalRecord});

  gates.status = 'pending-user-style-frame-review';
  gates.reference_grammar_contract = grammarContractRecord;
  gates.reference_calibration = {
    ...gates.reference_calibration,
    status: 'reference-calibration-passed',
    approval_route: 'motion-reverse-engineering-review-v01',
    candidate_set: {path: REVIEW.manifestPath, sha256: REVIEW.manifestSha256},
    eligible_for_user_style_frame_review: true,
    user_reference_calibration_pass: true,
    grammar_promoted: true,
    exact_bindings_complete: true,
    side_by_side_complete: true,
    approval_marker: approvalPath,
    approval_marker_sha256: approvalRecord.sha256,
    approved_inputs_sha256: REVIEW.inputBundleSha256,
    blockers: [],
    next_gate: 'user-style-frame-review',
  };
  for (const item of gates.reference_calibration.shared_locked_reference_bundle) item.sha256 = await shaFile(item.path);
  for (const family of gates.visual_families) {
    family.status = 'pending-user-style-frame-review';
    family.user_approved = false;
    family.approval_marker = null;
    family.approval_marker_sha256 = null;
    family.approved_inputs_sha256 = null;
  }
  await writeJson(styleGatesPath, gates);
  const gatesSha = await shaFile(styleGatesPath);

  const blueprint = await readJson(blueprintPath);
  blueprint._generated.source_style_gates_sha256 = gatesSha;
  blueprint.status = 'reference-bound-cut-blueprint-pending-6-family-style-pass';
  blueprint.readiness = 'pending-family-style-review';
  for (const cut of blueprint.cuts) {
    cut.reference_family_status = 'pending-user-style-frame-review';
    cut.readiness = 'pending-family-style-review';
    cut.full_motion_expansion_allowed = false;
  }
  await writeJson(blueprintPath, blueprint);
  const blueprintSha = await shaFile(blueprintPath);

  state.stage = 'timing-draft';
  state.active_cut_root = null;
  state.reference_calibration = {...gates.reference_calibration, note: 'The exact ten-sample review package received explicit user PASS on 2026-09-02. Its manifest, input bundle, board, reel, sample order, and promoted observable grammar are hash-bound. The next gate is user style-frame review; no style-frame, cut, rights, Omni, production, or stage approval is granted.'};
  state.style_frame_review = {...state.style_frame_review, status: 'pending-user-style-frame-review', user_approved: false, approval_marker: null, approval_marker_sha256: null, approved_inputs_sha256: null, production_asset_decomposition_status: 'blocked-pending-current-style-frame-pass', note: 'Reference calibration passed. The current representative style frames are now eligible for user review but remain unapproved and non-production.'};
  state.reference_style_gates = {...state.reference_style_gates, status: 'pending-6-family-user-review', contract_sha256: gatesSha, cut_blueprint_sha256: blueprintSha, approved_family_ids: [], pending_family_ids: gates.visual_families.map((family) => family.family_id), note: 'Reference calibration passed, but all six visual-family style directions still require explicit user PASS. Active-root promotion, full motion expansion, cut PASS, rights approval, Omni generation, and stage advance remain blocked.'};
  await writeJson(statePath, state);

  return {approval_marker_sha256: approvalRecord.sha256, grammar_approval_marker_sha256: grammarApprovalRecord.sha256, grammar_contract_sha256: grammarContractRecord.sha256, style_gates_sha256: gatesSha, blueprint_sha256: blueprintSha, approved_inputs_sha256: REVIEW.inputBundleSha256, grammar_count: GRAMMAR_SPECS.length, binding_count: bindings.length};
}

if (process.argv[1]?.endsWith('apply-reference-calibration-approval-v01.mjs')) {
  const result = await applyReferenceCalibrationApproval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
