import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_REL = 'video/qa/reference-study/frame-accurate-motion-contract-v02';
const OUT = path.join(ROOT, OUT_REL);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifact = async (relativePath) => {
  const bytes = await readFile(path.join(ROOT, relativePath));
  return {path: relativePath, sha256: sha(bytes), bytes: bytes.length};
};
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));

const analyses = {
  1: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-01-shared-background-accumulation/analysis.json',
  2: 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-02-numeric-step-progression/analysis.json',
  3: 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-03-chart-reveal/analysis.json',
  4: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-04-map-route-reframe/analysis.json',
  5: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-05-object-preserving-layout-reframe/analysis.json',
  6: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-06-directional-exit-hard-cut-pair/analysis.json',
  7: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-07-hook-reel-collage-montage/analysis.json',
  8: 'video/qa/reference-study/motion-reverse-engineering-suite-v02/sample-08-speaker-supporting-overlay-entry-corrected/analysis.json',
  9: 'video/qa/reference-study/motion-reverse-engineering-suite-v02/sample-09-device-light-focal-motion-corrected/analysis.json',
};

const measuredAnalyses = {
  8: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-08-speaker-supporting-overlay-entry/analysis.json',
  9: 'video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-09-device-light-focal-motion/analysis.json',
};

const hypotheses = {
  2: 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-02-numeric-step-progression/operator-hypotheses.json',
  3: 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-03-chart-reveal/operator-hypotheses.json',
};

const specs = {
  1: {
    id: 'sample-01-shared-background-accumulation',
    focal: 'building-context', supporting: ['left-person', 'right-person'],
    stage: 'one stable shared background; building first, then two independently timed people accumulate',
    depth: ['people remain above and overlap the building roofline'],
    components: [
      ['shared-background','stage','stable','none'], ['building-context','focal','entering-then-stable','translate/opacity'],
      ['left-person','supporting','hidden-entering-stable','translate/opacity'], ['right-person','supporting','hidden-entering-stable','translate/opacity'],
    ],
    actions: [
      ['building-entry',['building-context'],'translate/opacity-or-target-local-clip',[157,184],[157,169,184]],
      ['left-person-entry',['left-person'],'target-local-translate/opacity',[184,205],[184,194,205]],
      ['right-person-entry',['right-person'],'target-local-translate/opacity',[205,232],[205,210,232]],
    ],
    internal: ['none; prior settled targets remain byte-visible while the next target enters'],
    transition: ['no scene replacement inside the bound window'],
    exclusions: ['single flattened collage reveal','simultaneous museum row','building replacement by people'],
    entrance_ids: ['building-entry','left-person-entry','right-person-entry'],
  },
  2: {
    id: 'sample-02-numeric-step-progression',
    focal: 'barrel-value-unit-group', supporting: ['tanker-context','ocean-source-video'],
    stage: 'moving tanker and internally moving ocean remain contextual while one local numeric group appears above them',
    depth: ['ocean/source footage and tanker remain context; numeric group is the foreground focal'],
    components: [
      ['tanker-context','supporting','slow-moving','translate'], ['ocean-source-video','supporting','source-video-internal-motion','non-remotion'],
      ['barrel-value-unit-group','focal','hidden-rising-settled','group-translate/opacity'], ['numeric-glyphs','surface-content','framewise-changing','deterministic-count-up'],
    ],
    actions: [
      ['tanker-slow-translate',['tanker-context'],'translate',[563,623],[563,623]],
      ['numeric-group-rise-reveal',['barrel-value-unit-group'],'group-translate/opacity',[571,593],[571,578,585,593]],
      ['group-local-count-up',['numeric-glyphs'],'deterministic-framewise-count-up',[578,623],[578,585,593,600,608,615,623]],
    ],
    internal: ['$25 → $40 → $57 → $70 → $89 → $103 → $116 inside the moving group coordinates'],
    transition: ['no full-frame transition inside the bound window'],
    exclusions: ['geometrically fixed tanker','frozen ocean plate','pre-rendered number cards','full-frame reveal','digits moving independently of the group'],
    entrance_ids: ['numeric-group-rise-reveal'],
  },
  3: {
    id: 'sample-03-chart-reveal',
    focal: 'plot-series', supporting: ['chart-shell','axes-title-legend','point-markers'],
    stage: 'complete chart shell settles first; only plot data continues changing after shell settle',
    depth: ['series and points stay inside the plot surface above the fixed grid/axes'],
    components: [
      ['chart-shell','stage','opacity-settling-then-stable','opacity'], ['axes-title-legend','supporting','settling-then-stable','opacity'],
      ['plot-series','focal','hidden-progressive','stroke-draw-or-plot-local-clip'], ['point-markers','supporting','milestone-visible','target-local-reveal'],
    ],
    actions: [
      ['shell-settle',['chart-shell','axes-title-legend'],'opacity-settle',[749,763],[749,757,763]],
      ['series-progress',['plot-series'],'svg.stroke-draw-or-plot-local-clip',[766,837],[766,772,787,793,802,817,837]],
      ['point-milestones',['point-markers'],'path-head-bound-point-reveal',[766,837],[766,787,802,817,837]],
    ],
    internal: ['two series and their points accumulate left-to-right after shell settle'],
    transition: ['no whole-chart wipe; the plot-local implementation remains an unresolved alternative'],
    exclusions: ['whole-chart image wipe','shell/title/axes continuing to reveal throughout the plot-only phase','bar growth substituted for line progression'],
    entrance_ids: ['shell-settle'],
  },
  4: {
    id: 'sample-04-map-route-reframe',
    focal: 'map-camera', supporting: ['location-overlays','aircraft','localized-event'],
    stage: 'one geographic stage is continuously reframed while location-bound overlays have independent lifecycles',
    depth: ['markers, borders, aircraft, and the event flash remain registered above the map'],
    components: [
      ['map-camera','focal','continuously-moving','camera.transform'], ['location-overlays','supporting','entering-exiting','target-local-lifecycle'],
      ['aircraft','supporting','route-moving','translate-along-route'], ['localized-event','supporting','brief-local-change','localized-flash'],
    ],
    actions: [
      ['opening-overlay-exit',['location-overlays'],'target-local-opacity-out',[190,210],[190,205,210]],
      ['continuous-map-reframe',['map-camera'],'camera.transform',[190,450],[190,243,244,295,345,393,394,450]],
      ['geographic-overlay-lifecycle',['location-overlays','aircraft'],'location-registered-state/translation',[210,393],[210,295,345,393]],
      ['localized-event-onset',['localized-event'],'localized-brightness/scale-event',[393,394],[393,394]],
    ],
    internal: ['overlay identities and map registration change independently of the camera transform'],
    transition: ['F243→244 is continuous registered pan, not a hard cut; F393→394 is a local event, not a global reset'],
    exclusions: ['single static all-in-one map','hard reset at F243→244 or F393→394','global wipe called route draw','global flash','arbitrary geography'],
    entrance_ids: ['geographic-overlay-lifecycle'],
  },
  5: {
    id: 'sample-05-object-preserving-layout-reframe',
    focal: 'preserved-flag-map', supporting: ['departing-chart'],
    stage: 'side-by-side chart/map becomes a map-centered composition without changing map identity',
    depth: ['no material cross-overlap; emphasis changes by position rather than replacement'],
    components: [['departing-chart','supporting','exiting','translate-x'],['preserved-flag-map','focal','supporting-to-focused','translate-x']],
    actions: [
      ['chart-exit-left',['departing-chart'],'translate-x',[995,1021],[995,1003,1011,1021]],
      ['map-preserving-reframe',['preserved-flag-map'],'same-target-translate-x',[995,1021],[995,1003,1011,1021]],
    ],
    internal: ['map internal flag relation remains registered; measurable scale change is small'],
    transition: ['continuous layout reframe; no crossfade replacement'],
    exclusions: ['crossfade replacement of map','flattened before/after swap','static map with unrelated new evidence','invented large scale-up'],
    entrance_ids: [],
  },
  6: {
    id: 'sample-06-directional-exit-hard-cut-pair',
    focal: 'complete-scene-parent', supporting: ['separate-hard-cut-pair'],
    stage: 'all visible scene layers leave together under one parent transform',
    depth: ['internal scene depth is preserved during the parent exit'],
    components: [['complete-scene-parent','focal','exiting','translate-x'],['separate-hard-cut-pair','supporting','adjacent-boundary','hard-cut']],
    actions: [
      ['whole-scene-exit-left',['complete-scene-parent'],'parent-translate-x',[711,726],[711,718,726]],
      ['separate-adjacent-hard-cut',['separate-hard-cut-pair'],'hard-cut-zero-blend',[370,371],[370,371]],
    ],
    internal: ['background, tanker, number group, subtitles, and chrome retain their relative geometry while exiting'],
    transition: ['hard-cut proof is a separately cited earlier pair and is not chronologically adjacent to the exit'],
    exclusions: ['move only focal object','leave chrome/background/label behind','visible residue after exit','dissolve after partial exit','claim chronological adjacency between the two demonstrations'],
    secondary_windows: [{kind:'separate-hard-cut-pair',start_frame:370,end_frame:371}],
    entrance_ids: [],
  },
  7: {
    id: 'sample-07-hook-reel-collage-montage',
    focal: 'gallery-strip', supporting: ['side-overlays','kinetic-title','recorded-speaker-context'],
    stage: 'three distinct segments: speaker-side overlays, horizontal gallery, kinetic title',
    depth: ['side overlays occupy face-safe areas; recorded speaker pixels are source-video context and are not reconstructed'],
    components: [
      ['recorded-speaker-context','non-transferable-context','source-video-internal-motion','excluded-from-remotion'], ['side-overlays','supporting','accumulating','target-local-entry'],
      ['gallery-strip','focal','moving','parent-translate-x'], ['kinetic-title','supporting','state-changing','content-replacement/scale'],
    ],
    actions: [
      ['side-overlay-accumulation',['side-overlays'],'independent-target-local-entry',[0,106],[0,40,85,106]],
      ['cut-to-gallery',['gallery-strip'],'hard-cut-zero-blend',[106,107],[106,107]],
      ['gallery-parent-scroll',['gallery-strip'],'parent-translate-x',[107,227],[107,160,227]],
      ['cut-to-title',['kinetic-title'],'hard-cut-zero-blend',[227,228],[227,228]],
      ['kinetic-title-states',['kinetic-title'],'content-replacement/scale',[228,300],[228,260,300]],
    ],
    internal: ['gallery moves as one strip; title uses discrete observed phrase states'],
    transition: ['adjacent hard cuts at F106→107 and F227→228'],
    exclusions: ['recorded speaking-human reconstruction','one static collage','crossfade at either hard cut','independent gallery-card drift','explanatory text replacing gallery motion'],
    entrance_ids: ['side-overlay-accumulation'],
  },
  8: {
    id: 'sample-08-speaker-supporting-overlay-entry-corrected',
    focal: 'right-handshake-overlay', supporting: ['left-tombstone-overlay','reserved-presenter-region'],
    stage: 'center presenter region is reserved and empty in the Remotion probe; only non-person side overlays transfer',
    depth: ['overlays occupy bilateral face-safe zones without recreating or covering presenter pixels'],
    components: [
      ['reserved-presenter-region','non-transferable-context','reserved-empty','no-rendered-person'],
      ['right-handshake-overlay','focal','hidden-entering-stable','target-local-scale/opacity'],
      ['left-tombstone-overlay','supporting','hidden-entering-stable','target-local-scale/opacity'],
    ],
    actions: [
      ['handshake-entry',['right-handshake-overlay'],'target-local-scale/opacity',[43,72],[43,72]],
      ['tombstone-entry',['left-tombstone-overlay'],'target-local-scale/opacity',[163,211],[163,211]],
    ],
    internal: ['none; two non-person overlay targets keep independent lifecycles'],
    transition: ['analysis stops at F211 before the later person-shaped overlay event'],
    exclusions: ['recorded speaking-human pixels','graphic presenter/avatar/silhouette/person reconstruction','right-person-icon event after F211','source-footage internal motion as Remotion grammar','flattened speaker-plus-overlays plate'],
    entrance_ids: ['handshake-entry','tombstone-entry'],
    hypothesis: {
      observed_fact: 'within the corrected F0–211 scope, a non-person right handshake overlay and later non-person left tombstone overlay appear independently around a fixed presenter region',
      candidate_operator: 'two independent target-local scale/opacity entries while the presenter region remains reserved and empty in the Remotion realization',
      alternatives: ['exact icon easing and scale/opacity contribution are not recoverable from the flattened MP4'],
      confidence: 0.9,
      evidence_frames: [0,43,72,163,211],
      uncertainty: 'The source contains recorded speaking-human motion, but that pixel motion is explicitly excluded rather than reconstructed.',
      human_review_status: 'pending',
    },
  },
  9: {
    id: 'sample-09-device-light-focal-motion-corrected',
    focal: 'phone-surface-state', supporting: ['stable-phone-shell','two-support-overlays','reserved-presenter-context'],
    stage: 'angled phone wrapper is already present; only its surface values/chart and two non-person supports progress',
    depth: ['surface content stays clipped inside the stable device; recorded presenter pixels are not reconstructed'],
    components: [
      ['reserved-presenter-context','non-transferable-context','reserved-empty','no-rendered-person'], ['stable-phone-shell','supporting','stable','no-entry-claim'],
      ['phone-surface-state','focal','framewise-changing','inside-surface-content-state'], ['two-support-overlays','supporting','hidden-entering-stable','independent-target-entry'],
    ],
    actions: [
      ['surface-value-chart-progression',['phone-surface-state'],'framewise-inside-surface-state',[60,120],[60,70,80,90,120]],
      ['support-overlay-entry',['two-support-overlays'],'independent-target-local-entry',[60,90],[60,90]],
    ],
    internal: ['$0/0.0% → $9,306/2.3% → $17,216/34% → $22,136/55.6% → $24,751/65.8%, with chart progression'],
    transition: ['F155→156 is a hard cut to money/clock footage and is the excluded endpoint, not device grammar'],
    exclusions: ['recorded speaking-human pixels','graphic presenter/avatar/silhouette/person reconstruction','hidden-to-visible phone entry inside F60–155','coarse single-step screen replacement','source F156+ montage','phone-as-photo-card'],
    entrance_ids: ['support-overlay-entry'],
  },
};

const normalizeHypotheses = (analysis, external) => {
  const raw = external?.hypotheses ?? analysis.operator_hypotheses?.hypotheses ?? analysis.operator_hypotheses ?? [];
  return raw.map((row) => ({
    observed_fact: row.observed_fact,
    candidate_operator: row.candidate_operator ?? row.candidate,
    alternatives: Array.isArray(row.alternative_operator) ? row.alternative_operator : Array.isArray(row.alternative) ? row.alternative : [row.alternative_operator].filter(Boolean),
    confidence: row.confidence,
    evidence_frames: row.evidence_frames,
    uncertainty: row.error,
    human_review_status: 'pending',
  }));
};

const suiteManifest = await readJson('video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json');
await rm(OUT, {recursive: true, force: true});
await mkdir(OUT, {recursive: true});

const contracts = [];
for (const number of Object.keys(specs).map(Number)) {
  const spec = specs[number];
  const analysis = await readJson(analyses[number]);
  const measured = measuredAnalyses[number] ? await readJson(measuredAnalyses[number]) : analysis;
  const externalHypotheses = hypotheses[number] ? await readJson(hypotheses[number]) : null;
  const source = measured.source_binding;
  const sourcePath = source.path ?? source.local_path;
  const declaredWindow = analysis.source_binding?.window ?? source.window;
  const activeWindow = {
    ...declaredWindow,
    start_seconds: declaredWindow.start_seconds ?? declaredWindow.start_frame / source.fps,
    end_seconds: declaredWindow.end_seconds ?? declaredWindow.end_frame / source.fps,
  };
  const suiteRow = suiteManifest.samples.find((row) => row.sample_number === number);
  const componentContract = spec.components.map(([id, role, lifecycle, operator]) => ({id, role, lifecycle, operator, independently_addressable: role !== 'non-transferable-context'}));
  const actionContract = spec.actions.map(([id, targetIds, candidateOperator, sourceFrames, evidenceFrames]) => ({
    id, target_ids: targetIds, candidate_operator: candidateOperator,
    source_frame_range: {start: sourceFrames[0], end: sourceFrames[1]}, evidence_frames: evidenceFrames,
    observable_only: true, hidden_authoring_claim: false,
  }));
  const visualBeatContracts = actionContract.map((action) => ({
    beat_id: `beat-${action.id}`,
    viewer_takeaway: `${action.candidate_operator} is visible only on its declared target and source-frame range`,
    action_ids: [action.id],
    focal_component_id: action.target_ids[0],
    supporting_component_ids: action.target_ids.slice(1),
    narration_window: {...action.source_frame_range},
    stable_reading_hold: {belongs_to_probe_not_source: true, minimum_frames: 60},
  }));
  const contract = {
    schema_version: 2,
    contract_id: `${spec.id}-frame-accurate-v02`,
    sample_number: number,
    sample_id: spec.id,
    status: 'reanalysis-contract-complete-pending-human-reference-review',
    review_profile: 'remotion-motion',
    transfer_classification: 'active-motion-candidate',
    production_authority: false,
    production_eligible: false,
    eligible_for_user_style_frame_review: false,
    human_reference_calibration_pass: false,
    grammar_promoted: false,
    source_binding: {path: sourcePath, sha256: source.sha256, width: source.width, height: source.height, fps: source.fps, window: activeWindow, secondary_windows: spec.secondary_windows ?? []},
    evidence_binding: {
      primary_analysis: await artifact(analyses[number]),
      measured_analysis: measuredAnalyses[number] ? await artifact(measuredAnalyses[number]) : null,
      operator_hypotheses: hypotheses[number] ? await artifact(hypotheses[number]) : null,
      probe: suiteRow.probe,
      side_by_side: suiteRow.side_by_side,
      mobile_contact: suiteRow.mobile_contact,
      upstream_active_grammar_approval: false,
    },
    reference_readiness_matrix: {
      stage: spec.stage,
      focal: {exactly_one: true, component_id: spec.focal},
      supporting: spec.supporting,
      depth: spec.depth,
      entrance: {observed: spec.entrance_ids.length > 0, action_ids: spec.entrance_ids, note: spec.entrance_ids.length > 0 ? 'only these action IDs are entrance events' : 'no entrance event is observed in the bound window'},
      internal_change: spec.internal,
      transition: spec.transition,
      hold: {source_hold_is_not_inferred: true, probe_requirement: {fps: 30, duration_in_frames: 300, minimum_stable_frames: 60}},
      exclusions: spec.exclusions,
    },
    component_contract: componentContract,
    action_contract: actionContract,
    visual_beat_contracts: visualBeatContracts,
    operator_hypotheses: spec.hypothesis ? [spec.hypothesis] : normalizeHypotheses(measured, externalHypotheses),
    transferable_change_fully_mapped: true,
    source_video_pixels_are_transferable_remotion_motion: false,
    hidden_authoring_uncertainties: [...new Set([...(measured.uncertainties ?? []), ...normalizeHypotheses(measured, externalHypotheses).flatMap((row) => row.alternatives ?? [])])],
    forbidden_substitutes: spec.exclusions,
    typography_surface_contract_version: 2,
    allowed_text_roles: ['asset-label','surface-content','screen-chrome'],
    explanatory_text_may_replace_focal_asset: false,
  };
  const dir = path.join(OUT, spec.id);
  await mkdir(dir, {recursive: true});
  const file = path.join(dir, 'contract.json');
  await writeFile(file, `${JSON.stringify(contract, null, 2)}\n`);
  contracts.push({sample_number: number, sample_id: spec.id, path: `${OUT_REL}/${spec.id}/contract.json`, sha256: sha(await readFile(file)), status: contract.status});
}

const sample10Source = suiteManifest.excluded_observations[0].source;
const exclusion = {
  schema_version: 2,
  contract_id: 'sample-10-source-video-selection-exclusion-frame-accurate-v02',
  sample_number: 10,
  sample_id: 'sample-10-source-video-selection-exclusion',
  status: 'audited-source-video-selection-excluded-from-remotion',
  review_profile: 'source-video-selection',
  transfer_classification: 'excluded-non-motion-sample',
  source_binding: {...sample10Source, width: 640, height: 360, fps: 29.97, audited_window: {start_seconds: 20, end_seconds: 80, start_frame: 599, end_frame: 2398}},
  reference_readiness_matrix: {
    stage: 'source video playback/selection only', focal: {exactly_one: true, component_id: 'selected-source-video'},
    supporting: [], depth: ['native source-video depth only; no composited Remotion depth claim'],
    entrance: {observed:false,action_ids:[],note:'no Remotion entrance is claimed'}, internal_change: ['native source-video frame progression only'], transition: ['source edit boundaries belong to source-video selection'],
    hold: {not_applicable_to_remotion_probe: true}, exclusions: ['all Remotion operator claims','all grammar bindings','all generated presenter/object reconstruction'],
  },
  component_contract: [{id:'selected-source-video',role:'focal',lifecycle:'native-playback',operator:'source-video-selection',independently_addressable:false}],
  action_contract: [], operator_hypotheses: [], forbidden_substitutes: ['Remotion recreation','motion-grammar promotion','Omni reconstruction'],
  remotion_probe: null, active_grammar_bindings: [], active_binding_count: 0,
  production_authority: false, production_eligible: false, eligible_for_user_style_frame_review: false,
  human_reference_calibration_pass: false, grammar_promoted: false,
};
const exclusionDir = path.join(OUT, exclusion.sample_id);
await mkdir(exclusionDir, {recursive: true});
const exclusionFile = path.join(exclusionDir, 'contract.json');
await writeFile(exclusionFile, `${JSON.stringify(exclusion, null, 2)}\n`);

const manifest = {
  schema_version: 2,
  package_id: 'frame-accurate-motion-contract-v02-corrected-01-10',
  status: 'contracts-complete-pending-human-reference-review',
  purpose: 'single fail-closed reanalysis contract for samples 01-10; 01-09 active candidates and sample10 audited source-video exclusion',
  active_motion_sample_numbers: [1,2,3,4,5,6,7,8,9],
  excluded_sample_numbers: [10],
  active_contract_count: 9,
  exclusion_contract_count: 1,
  contracts,
  exclusion_contract: {sample_number: 10, sample_id: exclusion.sample_id, path: `${OUT_REL}/${exclusion.sample_id}/contract.json`, sha256: sha(await readFile(exclusionFile)), status: exclusion.status},
  upstream: {
    corrected_suite: await artifact('video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json'),
  },
  global_fail_closed_rules: [
    'Exactly samples 01-09 are active Remotion motion candidates; sample10 is source-video-selection only.',
    'Every active contract must contain all nine reference-readiness dimensions and at least one evidence-bound operator hypothesis.',
    'Observed pixels, candidate operators, alternatives, uncertainties, and forbidden substitutes remain separate.',
    'Recorded speaking-human pixels and their graphic/avatar/silhouette reconstruction are not transferable motion grammar.',
    'Sample02 must preserve tanker translation, ocean source motion, group rise, and group-local framewise count-up.',
    'Sample03 must separate shell settle from plot-only series/point progression.',
    'No contract, probe, or automated validator grants human PASS, grammar promotion, style-review eligibility, or production authority.',
  ],
  human_approval: {status:'pending', reviewer:null, marker:null},
  grammar_promoted: false,
  production_authority: false,
  production_eligible: false,
  eligible_for_user_style_frame_review: false,
  active_cut_root: null,
};
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(OUT, 'README.md'), '# Frame-accurate motion contract v02\n\nSamples 01–09 are evidence-bound Remotion motion candidates pending human reference review. Sample 10 is retained only as an audited `source-video-selection` exclusion. This package grants no PASS, grammar promotion, style-review eligibility, production authority, or active cut root.\n');
process.stdout.write(`built ${OUT_REL}: 9 active contracts + 1 source-video exclusion\n`);
