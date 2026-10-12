import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputRoot = path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v02-design');
const primaryPath = path.join(root, 'video', 'qa', 'reference-study', 'vox-primary', 'motion-grammar-v01', 'motion-grammar-catalog.json');
const additionalPath = path.join(root, 'video', 'qa', 'reference-study', 'additional-sources', 'v02', 'additional-motion-grammar-catalog-v02.json');
const sampleIndexPath = path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v01', 'sample-index.json');

const primary = JSON.parse(await fs.readFile(primaryPath, 'utf8'));
const additional = JSON.parse(await fs.readFile(additionalPath, 'utf8'));
const sampleIndex = JSON.parse(await fs.readFile(sampleIndexPath, 'utf8'));
const primaryEntries = new Map(primary.entries.map((entry) => [entry.grammar_id, entry]));
const additionalEntries = new Map(additional.entries.map((entry) => [entry.grammar_id, entry]));
const additionalSources = new Map(additional.sources.map((source) => [source.source_video_id, source]));

const rootRelative = (value) => value.replaceAll('\\', '/');
const clone = (value) => JSON.parse(JSON.stringify(value));

function referenceBinding(grammarId) {
  const entry = primaryEntries.get(grammarId) ?? additionalEntries.get(grammarId);
  if (!entry) throw new Error(`Unknown reference grammar: ${grammarId}`);
  const source = primaryEntries.has(grammarId)
    ? {path: entry.source_video_path, sha256: entry.source_video_sha256}
    : (() => {
        const aggregateSource = additionalSources.get(entry.source_video_id);
        return {path: aggregateSource.acquired_source.path, sha256: aggregateSource.acquired_source.sha256};
      })();
  const frames = entry.frames ?? entry.evidence.frames;
  return {
    grammar_id: entry.grammar_id,
    source_video_id: entry.source_video_id ?? 'vox-primary-locked-reference',
    source_video: source,
    timecodes: clone(entry.timecodes),
    frame_evidence: Object.fromEntries(Object.entries(frames).map(([state, frame]) => [state, {
      path: rootRelative(frame.path),
      sha256: frame.sha256,
      width: frame.width,
      height: frame.height,
      ...(frame.source_time_seconds === undefined ? {} : {source_time_seconds: frame.source_time_seconds}),
      ...(frame.source_frame === undefined ? {} : {source_frame: frame.source_frame})
    }])),
    review_clip: entry.review_clip ?? entry.evidence.review_clip,
    observed_scope: entry.observed_scope ?? entry.target_role,
    allowed_transfer: clone(entry.allowed_transfer ?? []),
    excluded_elements: clone(entry.forbidden_extrapolations ?? [])
  };
}

const sharedContract = {
  typography_surface_contract_version: 2,
  layout_contract_version: 2,
  text_roles: ['asset-label', 'surface-content', 'screen-chrome'],
  asset_label: 'named target only, below/outside target, 0deg, 32–72px gap, target-center error <=16px',
  surface_content: 'only source/evidence text genuinely printed on a document, news surface, chart, or screen; rotation only when actually overlaid on that named PNG surface and within ±2deg of surface angle',
  screen_chrome: 'kicker, title, independent quote, date, and source rail remain level at 0deg and never overlap focal pixels',
  rotation_rule: 'Only text physically overlaid on a named PNG surface may inherit that surface angle; all detached explanatory text remains 0deg.'
};

const channelExceptions = {
  allowlist: ['beige-checker-background', 'source-rights-chrome', 'source-locked-legal-retype', 'short-asset-label-below-target'],
  applied_by_design: ['beige-checker-background', 'source-rights-chrome'],
  note: 'Channel exceptions are compliance layers, not focal or motion grammar. source-locked-legal-retype and short-asset-label-below-target are conditional.'
};

const commonFlags = {
  status: 'reference-calibration-provisional-design',
  scope: 'design-only-no-rendered-motion-or-style-frame-claim',
  eligible_for_user_style_frame_review: false,
  production_authority: false,
  production_visible: false,
  production_eligible: false,
  user_reference_calibration_pass: false,
  user_style_frame_pass: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  parity_approved: false,
  motion_artifacts_created: false,
  grammar_promoted: false
};

const designs = [
  {
    number: '01', id: 'sample-01-shared-background-accumulation', name: 'shared-background accumulation',
    takeaway: '한 장면의 공통 배경 위에 사건을 설명하는 독립 실물 자산이 순차적으로 모인다.',
    focal: '첫 번째로 들어오는 공식 건물 또는 사건 사진 묶음',
    grammars: ['staggered-object-accumulation'],
    template: 'persistent-background-with-staggered-concrete-assets',
    supporting: ['earlier concrete assets remain visible', 'later asset enters on its own beat'],
    hidden: ['not-yet-entered assets are not rendered'],
    assetRequirements: ['real/official building or event photo with transparent derivative', 'real/official person or document cut-out as applicable', 'fixed beige-checker background'],
    geometry: {focal: {x: 960, y: 470, width: 900, height: 620}, supporting: 'left/right depth lanes; no equal-width grid', occlusion: 'later asset may overlap <=12% of smaller asset only when the observed collage relation requires it'},
    action: 'background holds; building enters; first person/document enters; final accumulated relation holds',
    excluded: ['generic cards', 'icons', 'decorative motifs', 'floating explanatory sentence over pixels', 'simultaneous equal-prominence grid']
  },
  {
    number: '02', id: 'sample-02-numeric-step-progression', name: 'numeric step progression',
    takeaway: '출처가 있는 하나의 수치가 맥락 자산을 유지한 채 단계적으로 바뀐다.',
    focal: 'source-locked numeric surface attached to one concrete context asset',
    grammars: ['numeric-step-progression'], template: 'stable-context-with-attached-numeric-surface',
    supporting: ['one real context photo/object', 'source rail below the target'], hidden: ['future values until their declared step'],
    assetRequirements: ['real/official source for every displayed value', 'one real/official context photo or object', 'deterministic source-locked number surface'],
    geometry: {focal: {x: 960, y: 500, width: 1050, height: 580}, supporting: 'numeric surface remains attached to focal context', occlusion: 'none over source pixels'},
    action: 'context enters; first sourced value; second sourced value; final sourced value holds',
    excluded: ['random counter', 'invented intermediate value', 'continuous interpolation claim', 'floating paragraph']
  },
  {
    number: '03', id: 'sample-03-chart-reveal', name: 'chart reveal',
    takeaway: '근거가 있는 차트가 데이터 순서대로 드러나고 마지막에 읽을 수 있는 상태로 멈춘다.',
    focal: 'source-backed chart surface and its line/bar geometry', grammars: ['chart-self-draw', 'bar-chart-showcase-reveal'],
    template: 'evidence-chart-build-to-reading-hold', supporting: ['source rail', 'only labels belonging to the chart surface'], hidden: ['future data marks until their sequence'],
    assetRequirements: ['official dataset or document source', 'deterministically typeset chart with source-locked axes/values', 'beige-checker background'],
    geometry: {focal: {x: 960, y: 510, width: 1320, height: 720}, supporting: 'source rail below chart', occlusion: 'no overlay on axes, labels, or values'},
    action: 'axes/first mark; successive data marks; complete chart; >=60-frame reading hold',
    excluded: ['decorative chart', 'invented data', 'generic card behind chart', 'unobserved glow/effect'],
    transitionEvidence: 'No transition grammar is claimed inside the beat; any adjacent transition requires its own exact pair evidence.'
  },
  {
    number: '04', id: 'sample-04-map-route-reframe', name: 'map route and reframe',
    takeaway: '넓은 지도에서 사건의 지역과 경로로 시선이 좁혀진다.',
    focal: 'official map or licensed geographic source with one route/marker', grammars: ['map-route-strike-assembly', 'object-preserving-layout-reframe'],
    template: 'map-context-to-regional-route-focus', supporting: ['one retained map object', 'single source rail'], hidden: ['unrelated regions and markers'],
    assetRequirements: ['official/licensed map or government geographic source', 'deterministic route/path overlay bound to source geometry', 'real event/location photo only if source-backed'],
    geometry: {focal: {x: 1000, y: 500, width: 1500, height: 780}, supporting: 'retained map remains visible during reframe', occlusion: 'route may overlay map only as explanatory source-bound path'},
    action: 'wide map; regional reframe; route/markers resolve; stable reading hold',
    excluded: ['invented geography', 'unbound icons', 'camera-transform claim without runtime evidence', 'decorative transition layer']
  },
  {
    number: '05', id: 'sample-05-object-preserving-layout-reframe', name: 'object-preserving layout reframe',
    takeaway: '이전 장면의 핵심 실물 하나가 남아 다음 설명의 중심으로 이동한다.',
    focal: 'one named document/photo/person PNG retained across the boundary', grammars: ['object-preserving-layout-reframe'],
    template: 'shared-object-anchored-adjacent-layouts', supporting: ['one outgoing supporting asset'], hidden: ['prior supporting asset after exit'],
    assetRequirements: ['real/official focal source asset with transparent derivative', 'real/official adjacent evidence asset', 'shared beige-checker background'],
    geometry: {focal: {x: 960, y: 510, width: 880, height: 680}, supporting: 'prior support exits left/right while focal converges center', occlusion: 'declared physical overlap only during handoff'},
    action: 'focal and support coexist; support exits while focal shifts; focal settles; stable hold',
    excluded: ['morphing identity', 'replacement asset disguised as continuity', 'decorative wipe', 'unobserved easing claim']
  },
  {
    number: '06', id: 'sample-06-directional-exit-hard-cut-pair', name: 'directional exit plus hard-cut pair',
    takeaway: '한 장면의 설명이 한 방향으로 정리된 뒤 다음 완결 장면으로 즉시 전환된다.',
    focal: 'outgoing grouped concrete scene', grammars: ['directional-scene-exit-left', 'hard-cut'],
    template: 'complete-scene-exit-to-complete-scene-cut', supporting: ['persistent background if adjacent scene supports it'], hidden: ['outgoing group after canvas clear'],
    assetRequirements: ['real/official concrete scene assets for both complete scenes', 'same channel background only if source relation supports it', 'source-rights chrome'],
    geometry: {focal: {x: 960, y: 500, width: 1250, height: 700}, supporting: 'grouped scene moves coherently left', occlusion: 'no arbitrary scatter during exit'},
    action: 'complete scene; leftward exit; clear canvas; hard-cut to complete next scene; >=60-frame hold',
    excluded: ['crossfade called hard-cut', 'glitch/flash', 'multi-direction scatter', 'morph claim'],
    transitionEvidence: 'Mandatory adjacent pair artifact: exact end frame of outgoing scene, first frame of next scene, and stable following frame; both direction-exit and hard-cut must be observed in the pair.'
  },
  {
    number: '07', id: 'sample-07-hook-reel-collage-montage', name: 'hook reel collage montage',
    takeaway: '짧은 시간에 서로 다른 실물 장면이 한 핵심 질문을 향해 빠르게 교대한다.',
    focal: 'one concrete reel panel at a time, never an equal grid', grammars: ['finished-reel-collage-motion', 'staggered-object-accumulation'],
    template: 'sequential-concrete-panels-with-single-focal', supporting: ['previous panel clears before next focal', 'small source-rights chrome'], hidden: ['all non-current panels'],
    assetRequirements: ['real/official photo/video stills for each panel', 'transparent cut-outs only where source permits', 'rights record per panel'],
    geometry: {focal: {x: 960, y: 520, width: 1180, height: 820}, supporting: 'single vertical or centered focal lane', occlusion: 'panel changes are sequential, not layered museum rows'},
    action: 'panel A; panel B; panel C; final panel holds for reading',
    excluded: ['tutorial/editor UI', 'reposted subtitles as grammar', 'generic icon montage', 'unobserved card carousel effect']
  },
  {
    number: '08', id: 'sample-08-speaker-supporting-overlay-entry', name: 'speaker with supporting overlay entry',
    takeaway: '말하는 인물은 기준점으로 남고, 필요한 근거 자산이 옆에서 들어와 설명을 구체화한다.',
    focal: 'real/official speaker or official profile PNG', grammars: ['speaker-overlay-asset-entry'],
    template: 'stable-speaker-with-concrete-side-evidence', supporting: ['one evidence photo/document/building overlay'], hidden: ['future support until its entry beat'],
    assetRequirements: ['official profile/photo or licensed video frame for named speaker', 'real/official supporting evidence asset', 'identity and rights record'],
    geometry: {focal: {x: 680, y: 560, width: 650, height: 800}, supporting: {x: 1370, y: 500, width: 650, height: 620}, occlusion: 'support never covers face or source text'},
    action: 'speaker stable; supporting asset enters; supporting asset changes/settles; reading hold',
    excluded: ['explanatory sentence over face/photo', 'generic avatar', 'icon-only support', 'equal prominence split-screen']
  },
  {
    number: '09', id: 'sample-09-device-light-focal-motion', name: 'device/light focal motion',
    takeaway: '하나의 실제 기기나 화면이 중심으로 움직이며 상태 변화가 읽힌다.',
    focal: 'real/official device or screen capture treated as one named focal', grammars: ['saas-device-light-motion'],
    template: 'single-device-focal-with-constrained-light-treatment', supporting: ['real environment or official screen context'], hidden: ['secondary device states'],
    assetRequirements: ['real/official device photo or screen capture', 'rights-cleared environment/source image', 'any light/refraction treatment must be explicitly observed and separately reviewed'],
    geometry: {focal: {x: 1050, y: 520, width: 1000, height: 720}, supporting: 'environment recedes behind device', occlusion: 'light treatment never obscures screen content'},
    action: 'device enters; device/screen state changes; light/refraction resolves; stable hold',
    excluded: ['invented glass effect', 'unobserved particles', 'decorative glow over evidence', 'text box replacing device']
  },
  {
    number: '10', id: 'sample-10-narrative-scale-translation', name: 'narrative scale translation',
    takeaway: '추상적인 규모를 실제 물건·사진·수치의 크기 관계로 바꿔 이해시킨다.',
    focal: 'one concrete prop, official photo, or source-backed number at a time', grammars: ['narrative-scale-translation'],
    template: 'concrete-prop-to-source-b-roll-scale-bridge', supporting: ['presenter only when the observed beat requires it', 'source-backed typography surface'], hidden: ['unrelated b-roll'],
    assetRequirements: ['real prop/photo/video or official source', 'source-locked number/date/text', 'rights and provenance for every B-roll frame'],
    geometry: {focal: {x: 960, y: 520, width: 1200, height: 760}, supporting: 'presenter/prop/B-roll alternate by beat, never a simultaneous equal grid', occlusion: 'source text remains unobscured'},
    action: 'concrete prop or number; scale expands through sourced visual; final relation holds',
    excluded: ['AI reconstruction presented as evidence', 'large type that obscures evidence', 'unbound B-roll', 'inference of exact edit cause from a still']
  }
];

const framePlan = (index, transitionEvidence) => {
  const actionStart = 15 + index * 2;
  const actionMid = 55 + index * 2;
  const actionEnd = 105 + index * 2;
  return {
    fps: 30,
    total_frames: 300,
    states: [
      {name: 'hidden', start: 0, end: actionStart - 1},
      {name: 'entering', start: actionStart, end: actionMid - 1},
      {name: 'focused', start: actionMid, end: actionEnd},
      {name: 'stable-reading-hold', start: actionEnd + 1, end: 239, frames: 239 - actionEnd, motion: 'none'},
      {name: 'exiting-or-final-summary', start: 240, end: 299}
    ],
    action: {start: actionStart, mid: actionMid, end: actionEnd, target: 'dominant_focal_asset_id', observable_delta_required: true},
    reading_hold: {start: actionEnd + 1, midpoint: 180, end: 239, minimum_frames: 60, camera_motion: 'none', document_motion: 'none', overlap_with_action: false},
    transition_evidence: transitionEvidence ?? 'No transition is declared by this design. If an adjacent transition is later proposed, it requires exact reference frame/timecode evidence and a pair artifact.'
  };
};

const outputDesigns = designs.map((design, index) => ({
  ...commonFlags,
  sample_number: design.number,
  sample_id: design.id,
  name: design.name,
  viewer_takeaway: design.takeaway,
  dominant_focal: design.focal,
  supporting_states: design.supporting,
  hidden_states: design.hidden,
  semantic_layout: {
    template: design.template,
    geometry: design.geometry,
    depth_order: ['background', 'midground-support', 'foreground-dominant-focal'],
    intentional_occlusion: design.geometry.occlusion,
    one_dominant_focal_required: true,
    no_museum_grid: true
  },
  frame_plan: framePlan(index, design.transitionEvidence),
  reference_bindings: design.grammars.map(referenceBinding),
  allowed_transfer: design.grammars.flatMap((grammarId) => referenceBinding(grammarId).allowed_transfer),
  explicitly_excluded: [...design.excluded, ...design.grammars.flatMap((grammarId) => referenceBinding(grammarId).excluded_elements)],
  real_official_asset_requirements: design.assetRequirements,
  asset_origin_policy: {version: 1, persons: 'real/official source for named people; imagegen only for fictional generic persons after separate approval', non_persons: 'real/official source with source kind, source id, URL/preserved file, license, and SHA-256 before review', current_design_assets: 'requirements only; no placeholders or production assets supplied'},
  typography_surface_contract: clone(sharedContract),
  layout_contract: {version: 2, required_invariants: ['asset labels below/outside target', 'same-row independent assets >=64px apart', 'baseline group or declared alignment exception', 'no unintended overlap', '360x203 core focal remains legible']},
  channel_exceptions: clone(channelExceptions),
  beige_checker_background: {exception_id: 'beige-checker-background', required: true, role: 'compliance-background', focal: false},
  source_rights_chrome: {exception_id: 'source-rights-chrome', required: true, role: 'screen-chrome', rotation_degrees: 0, focal: false},
  text_and_rotation_rules: 'PNG-surface text only may rotate with that named surface; detached labels, kicker, title, dates, independent quotes, and source chrome are 0deg.',
  review_profile: 'remotion-motion',
  review_requirements: ['style frame first: opening/evidence-or-change/final-summary', '360x203 review', 'exact input hashes', 'playable Remotion parity only after human reference-calibration PASS'],
  production_and_promotion: {active_cut_root: null, production_asset_promotion: false, grammar_contract_update: false, omni_unlock: false, user_style_frame_review_eligible: false}
}));

const bundle = [...sampleIndex.reference_calibration.shared_locked_reference_bundle];
const output = {
  schema_version: 1,
  candidate_set_id: 'remotion-motion-grammar-v02-design',
  status: 'reference-calibration-provisional-design',
  scope: 'non-production-design-only-derived-from-primary-and-additional-v02-observation',
  reference_calibration_contract_version: 1,
  eligible_for_user_style_frame_review: false,
  production_authority: false,
  production_visible: false,
  production_state_modified: false,
  motion_artifacts_created: false,
  sample_count: outputDesigns.length,
  locked_reference_bundle: bundle,
  reference_sources: [
    {catalog: rootRelative(path.relative(root, primaryPath)), status: primary.status, production_eligible: primary.production_eligible},
    {catalog: rootRelative(path.relative(root, additionalPath)), status: additional.status, production_eligible: additional.production_eligible}
  ],
  designs: outputDesigns,
  excluded_from_package: ['unobserved cards/icons/effects/transitions', 'tutorial/browser/editor/workflow frames from additional v01', 'any asset placeholder or generated output', 'any claim of human reference-calibration PASS']
};

const overview = ['# Remotion motion grammar v02 design package', '', '- Status: **reference-calibration-provisional-design**', '- Scope: ten inactive design-only sample cuts derived from exact pending evidence in the primary locked reference catalog and additional v02 catalog.', '- This package contains no rendered motion, style-frame output, production asset, user PASS, rights approval, or grammar promotion.', '- The old v01 sample index remains historical/incomplete and is not replaced.', '', '| # | Design | Observed grammar evidence | Timing skeleton | Production |', '|---:|---|---|---|---|', ...outputDesigns.map((d) => '| '+d.sample_number+' | '+d.name+' | '+d.reference_bindings.map((r) => r.grammar_id).join(', ')+' | 30fps; action '+d.frame_plan.action.start+'/'+d.frame_plan.action.mid+'/'+d.frame_plan.action.end+'; hold '+d.frame_plan.reading_hold.minimum_frames+'+ frames | blocked |'), '', '## Locked operating rules', '', '1. Each design has exactly one dominant focal component. Supporting and hidden states are explicit; arbitrary coordinates do not become layout authority.', '2. The action must be observable at start/mid/end and must end before the stable reading hold. Reading holds have no camera or document motion.', '3. Exact source video, SHA-256, timecode, frame paths, frame hashes, and grammar IDs are copied from the catalogs into manifest.json.', '4. Text follows typography/layout contract v2: only text physically overlaid on a named PNG surface may rotate; detached labels and source chrome remain level at 0 degrees.', '5. Real/official source assets are requirements, not placeholders. No missing media may be used to obtain review PASS.', '6. Directional exit, hard-cut, morph, or scene-to-scene claims require exact adjacent pair evidence; this package does not claim those proofs.', '', '## Review boundary', '', 'The review board and every style frame must be created only after reference-calibration has an exact human side-by-side PASS. Until then, eligible_for_user_style_frame_review=false, production_visible=false, and active_cut_root=null.', ''].join('\n');

await fs.mkdir(outputRoot, {recursive: true});
await fs.writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
await fs.writeFile(path.join(outputRoot, 'overview.md'), overview);
console.log(JSON.stringify({manifest: rootRelative(path.relative(root, path.join(outputRoot, 'manifest.json'))), overview: rootRelative(path.relative(root, path.join(outputRoot, 'overview.md'))), sample_count: outputDesigns.length}));
