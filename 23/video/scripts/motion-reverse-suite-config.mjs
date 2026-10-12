export const SUITE_ROOT_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v01';
export const ENTRY_REL = 'video/src/motion-reverse-engineering-suite-v01-index.tsx';
export const RUNTIME_REL = 'video/src/motion-reverse-engineering-suite-v01.tsx';
export const MEASUREMENT_REL = 'video/scripts/motion-reverse-suite-measurements.mjs';
export const INHERITED_PILOT_MANIFEST_REL = 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json';
export const INHERITED_PILOT_MANIFEST_SHA256 = '793fe2a384fa4f5591672ae9a4fb34815eba0c5ee63f01a4422a9c2b0a0a7382';

const primary = {path: 'raw/inbox/vox-style-claude-remotion-reference.mp4', sha256: '0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9', width: 1920, height: 1080, fps: 30};

export const suiteSpecs = [
  {
    number: 1, id: 'sample-01-shared-background-accumulation', composition: 'MotionReverseSuite01-Provisional', source: primary, start: 157, end: 232, actionEnd: 75,
    events: [[157,'background-only'],[169,'building-entering'],[184,'building-settled'],[194,'left-person-entering'],[205,'left-person-settled'],[210,'right-person-entering'],[232,'accumulated-layout']], contact: [[157,0],[194,37],[232,75]],
    observed: ['building appears first', 'left and right people enter as independent later targets', 'prior targets remain visible', 'people render above and overlap the building roofline'],
    candidate: 'three independent translate/opacity targets with accumulated visibility and person-over-building z-order', alternatives: ['individual clip reveals may contribute to the flattened edge', 'exact easing is unavailable'], confidence: 0.88,
    forbidden: ['single flattened collage reveal','simultaneous museum row','building replacement by people'],
  },
  {
    number: 4, id: 'sample-04-map-route-reframe', composition: 'MotionReverseSuite04-Provisional', source: {path:'video/qa/reference-study/additional-sources/acquired/Y6mOBK5peDU.android.mp4',sha256:'c7fa0419e50301e432b148b67dfd3d5de4a64882b09242b168148e7f3aeaf1a1',width:640,height:360,fps:25}, start:190,end:450,actionEnd:239,
    events: [[190,'us-person-marker-only'],[205,'us-overlay-fade-complete'],[210,'us-overlay-absent'],[243,'continuous-pan-before'],[244,'continuous-pan-after'],[295,'israel-outline'],[345,'aircraft-iran-border'],[393,'pre-explosion'],[394,'explosion-brightness-flash'],[450,'iran-event-final']], contact:[[190,0],[210,18],[450,239]],
    observed: ['F190 begins with a person/United-States marker and no aircraft or Iran border; that local overlay fades out by about F205 and is absent at F210', 'F243→244 preserves registered map structure under a fast camera pan rather than cutting', 'aircraft, borders, flags, and markers have local lifecycles over the continuously reframed map', 'F393→394 preserves the map and aircraft while a localized explosion/brightness flash begins'],
    candidate: 'one continuous map/camera pan-and-zoom with independently timed geographic overlays and a localized explosion/brightness event', alternatives:['the final path may be a local clip reveal rather than literal SVG dash animation','the flattened source does not identify the exact camera interpolation or whether some map motion was pre-rendered'],confidence:0.92,
    forbidden:['single static all-in-one map','persist the opening person/US marker through source F210/probe F18 or later','future aircraft or Iran border visible in the opening US phase','hard reset at F243→244 or F393→394','global wipe called route draw','global flash replacing the localized explosion','arbitrary geography'],
  },
  {
    number:5,id:'sample-05-object-preserving-layout-reframe',composition:'MotionReverseSuite05-Provisional',source:primary,start:995,end:1021,actionEnd:26,
    events:[[995,'chart-map-side-by-side'],[1003,'map-moving-left'],[1011,'map-becoming-focal'],[1021,'chart-exited-map-centered']],contact:[[995,0],[1011,16],[1021,26]],
    observed:['chart exits left independently','the identical flag-map survives while translating into the focal center','object-only crop alignment shows little measurable scale change and the internal flag relation remains registered'],candidate:'independent chart translate-x plus preserved map-group translate-x using the same render target',alternatives:['minor perspective/scale contribution below the crop-alignment precision remains possible'],confidence:0.91,
    forbidden:['crossfade replacement of map','flattened before/after swap','static map with unrelated new evidence'],
  },
  {
    number:6,id:'sample-06-directional-exit-hard-cut-pair',composition:'MotionReverseSuite06-Provisional',source:primary,start:711,end:726,actionEnd:31,secondary:[[370,'hard-cut-before'],[371,'hard-cut-after']],
    events:[[711,'full-scene-before-exit'],[718,'scene-parent-exiting-left'],[726,'scene-cleared'],[370,'hard-cut-before'],[371,'hard-cut-after']],contact:[[711,0],[718,7],[371,31]],
    observed:['background, tanker, numeric group, subtitle, and screen chrome leave under one scene-parent left translation','no visible scene layer or label remains at the exit endpoint','separate source frames 370→371 prove an adjacent hard cut with zero blend frames'],candidate:'one exhaustive parent translate-x containing every visible scene layer, followed, in a separate demonstrated event, by adjacent-frame full-scene replacement',alternatives:['exact parent easing is unavailable'],confidence:0.97,
    forbidden:['move only focal object','leave chrome/background/label behind','leave any visible full-frame residue after exit','dissolve after partial exit','claim the hard-cut pair is chronologically adjacent to the exit event'],
  },
  {
    number:7,id:'sample-07-hook-reel-collage-montage',composition:'MotionReverseSuite07-Provisional',source:{path:'video/qa/reference-study/additional-sources/acquired/xOhh274Ayac.android.mp4',sha256:'538b936edd16f847c5b72d3f513b55efc7ede6e2351ba755642eedfd9daac88b',width:640,height:360,fps:25},start:0,end:300,actionEnd:239,
    events:[[0,'speaker-opening'],[40,'left-overlay'],[85,'bilateral-overlays'],[106,'speaker-final-before-cut'],[107,'gallery-hard-cut'],[160,'gallery-scroll'],[227,'gallery-final-before-cut'],[228,'title-hard-cut'],[260,'title-replacement'],[300,'title-final']],contact:[[0,0],[160,128],[300,239]],
    observed:['speaker-side overlays accumulate before an adjacent hard cut','gallery moves as one horizontal strip','second adjacent hard cut replaces gallery with kinetic-title scene','title content has discrete observed phrase states'],candidate:'segment-owned overlay entries → hard cut → gallery parent translate-x → hard cut → kinetic text state replacement/scale',alternatives:['blur contribution and exact card micro-easing are unavailable'],confidence:0.87,
    forbidden:['one static collage','crossfade at either hard-cut boundary','independent gallery cards drifting instead of one strip','using explanatory text to replace missing gallery motion'],
  },
  {
    number:8,id:'sample-08-speaker-supporting-overlay-entry',composition:'MotionReverseSuite08-Provisional',source:{path:'video/qa/reference-study/additional-sources/acquired/dBakc0BdHjY.android.mp4',sha256:'493e807a188437d6d163b2db42c12b5df7f70a8480a4c696b298f56d9f14200e',width:640,height:360,fps:24000/1001},start:0,end:288,actionEnd:239,
    events:[[0,'speaker-only'],[43,'handshake-entering'],[72,'handshake-settled'],[163,'left-tombstone-entering'],[211,'bilateral-overlays'],[245,'right-person-entering'],[288,'overlays-final']],contact:[[0,0],[163,136],[288,239]],
    observed:['presenter editorial bbox stays fixed while live footage moves internally','small overlays enter independently in bilateral face-safe zones','overlay entry does not move or resize presenter plate'],candidate:'stable presenter wrapper with separately classified source-video internal motion and independent target-local scale/opacity overlays',alternatives:['exact icon easing is unavailable'],confidence:0.9,
    forbidden:['move/crop presenter to simulate entry','single flattened speaker-plus-icons plate','cover presenter face','one large evidence document'],
  },
  {
    number:9,id:'sample-09-device-light-focal-motion',composition:'MotionReverseSuite09-Provisional',source:{path:'video/qa/reference-study/additional-sources/acquired/b7KlsXNQobs.android.mp4',sha256:'7ccb3068c49fca17348538fee5e9c59f5e4a1ff0114e01849f08d0765481cd8f',width:640,height:360,fps:30000/1001},start:60,end:155,actionEnd:95,secondary:[[156,'excluded-post-cut-money-montage']],
    events:[[60,'phone-present-initial-state'],[70,'value-9306-percent-2.3'],[80,'value-17216-percent-34'],[90,'value-22136-percent-55.6-icons-visible'],[120,'value-24751-percent-65.8-icons-visible'],[155,'device-segment-final']],contact:[[60,0],[120,60],[155,95]],
    observed:['the angled phone shell is already present at F60 and keeps a stable editorial wrapper through F155','source-bound value, percentage, and chart pixels progress continuously inside the named device surface: F70 $9,306/2.3%, F80 $17,216/34%, F90 $22,136/55.6%, and F120 $24,751/65.8%','both independent support icons are visible by F90 and remain visible at F120','F155→156 is an exact full-frame hard cut into a different money/clock montage and is excluded'],candidate:'stable angled device wrapper with framewise inside-surface value/percentage/chart progression and two independently entering support icons, ending at the measured adjacent hard cut',alternatives:['exact perspective/homography of the flattened phone is unavailable; measured F60→F120 angle change is negligible','local OCR is not used; values are source-locked manual transcriptions backed by exact evidence frames and decoded glyph-state changes'],confidence:0.96,
    manual_surface_content:['F70: $9,306 / 2.3%','F80: $17,216 / 34%','F90: $22,136 / 55.6%','F120: $24,751 / 65.8%'],
    forbidden:['claim hidden-to-visible phone entry inside F60–155','coarse single-step screen replacement','delay either support icon past F90','full-frame state replacement before the boundary','phone-as-photo-card','include source F156 or later money/clock montage as device state','animate after mapped F155 endpoint'],
  },
  {
    number:10,id:'sample-10-narrative-scale-translation',composition:'MotionReverseSuite10-Provisional',source:{path:'video/qa/reference-study/additional-sources/acquired/0Uxx-UrTVP0.android.mp4',sha256:'ed6839c20bfda2a52346e70bd9cbfa590299fb0a93df884698a6e65c91f5d647',width:640,height:360,fps:2997/100},start:956,end:1164,actionEnd:208,
    events:[[956,'comparison-stage-empty'],[971,'snack-entry'],[1019,'snack-value'],[1035,'snack-comparison-complete'],[1065,'phone-entry'],[1079,'phone-first-value'],[1139,'two-object-comparison'],[1155,'comparison-complete'],[1163,'pre-cut'],[1164,'currency-hard-cut']],contact:[[956,0],[1079,123],[1164,208]],
    observed:['snack/value group builds first in the left lane','phone/value group enters independently without moving or replacing snack','values remain bound below their objects','1163→1164 is an adjacent hard cut'],candidate:'two independent object/value groups with deterministic source-locked text, followed by adjacent hard cut',alternatives:['exact appearance easing is unavailable'],confidence:0.92,
    manual_surface_content:['snack: New Year ₩1,000 → year-end ₩27,000,000','phone first state at F1079: New Year ₩1,000,000 only','phone end state at F1155: year-end ₩27,000,000,000 (270억 원)'],
    forbidden:['abstract magnitude line without objects','unbound explanatory paragraph','replace snack when phone enters','invent continuous morph across hard cut','claim wider 20–80s montage is mapped'],
  },
];

export const sampleByNumber = new Map(suiteSpecs.map((spec) => [spec.number, spec]));

export function mapSourceFrame(spec, sourceFrame) {
  if (spec.number === 6) {
    if (sourceFrame >= 711) return sourceFrame - 711;
    return sourceFrame === 370 ? 30 : 31;
  }
  return Math.round((sourceFrame - spec.start) * spec.actionEnd / (spec.end - spec.start));
}
