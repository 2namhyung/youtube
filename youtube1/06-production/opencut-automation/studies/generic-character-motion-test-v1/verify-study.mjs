import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const asset = resolve(root, 'public/character.png');
const output = resolve(root, '../../out/studies/generic-character-motion-test-v1/motion-test.mp4');
const actionOutput = resolve(root, '../../out/studies/generic-character-motion-test-v1/character-action-test.mp4');
const actionAsset = resolve(root, 'public/phone-pickup-keyposes-alpha.png');
const articulatedOutput = resolve(root, '../../out/studies/generic-character-motion-test-v1/articulated-character-test.mp4');
const rigAtlas = resolve(root, '../../production/motion-assets/generic-character-poc-v1/rig-atlas-v1.png');
const rigAtlasAlpha = resolve(root, '../../production/motion-assets/generic-character-poc-v1/rig-atlas-v1-alpha-hard.png');
const drawnOutput = resolve(root, '../../out/studies/generic-character-motion-test-v1/drawn-character-action-test.mp4');
const drawnSource = resolve(root, '../../production/motion-assets/generic-character-poc-v1/phone-pickup-8-keyposes-v1.png');
const drawnAlpha = resolve(root, '../../production/motion-assets/generic-character-poc-v1/phone-pickup-8-keyposes-v1-alpha.png');
const drawnOutputV2 = resolve(root, '../../out/studies/generic-character-motion-test-v1/drawn-character-action-test-v2.mp4');
const continuousArmOutput = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-mesh-test.mp4');
const continuousArmBase = resolve(root, 'public/continuous-arm/character-base.png');
const continuousArmContact = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-mesh-contact-sheet.jpg');
const continuousArmJointContact = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-joint-contact-sheet.jpg');
const thicknessLockedOutput = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-thickness-locked-test.mp4');
const thicknessLockedContact = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-thickness-locked-contact-sheet.jpg');
const thicknessLockedJointContact = resolve(root, '../../out/studies/generic-character-motion-test-v1/continuous-arm-thickness-locked-joint-sheet.jpg');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const assetSha256 = sha256(asset);
if (assetSha256 !== '8be0b62640316bb0311d171bc1e5db599740092ae1daa73377b15b55395b1136') {
  throw new Error(`Character authority mismatch: ${assetSha256}`);
}
const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames,duration','-of','json',output], {encoding:'utf8'}));
const stream = probe.streams?.[0];
if (!stream || stream.width !== 1080 || stream.height !== 1920 || stream.r_frame_rate !== '24/1' || Number(stream.nb_frames) !== 72 || Math.abs(Number(stream.duration)-3) > 0.01) {
  throw new Error(`Unexpected output metadata: ${JSON.stringify(stream)}`);
}
const verifyThreeSecondVideo = (path) => {
  const result = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames,duration','-of','json',path], {encoding:'utf8'}));
  const video = result.streams?.[0];
  if (!video || video.width !== 1080 || video.height !== 1920 || video.r_frame_rate !== '24/1' || Number(video.nb_frames) !== 72 || Math.abs(Number(video.duration)-3) > 0.01) {
    throw new Error(`Unexpected study metadata for ${path}: ${JSON.stringify(video)}`);
  }
};
verifyThreeSecondVideo(actionOutput);
verifyThreeSecondVideo(articulatedOutput);
verifyThreeSecondVideo(drawnOutput);
verifyThreeSecondVideo(drawnOutputV2);
verifyThreeSecondVideo(continuousArmOutput);
verifyThreeSecondVideo(thicknessLockedOutput);
if (sha256(continuousArmBase) !== '545d7133362a79f784d56a9fabfb01908d2f32f6ce013d70ec353e39c885cc92') {
  throw new Error(`Continuous-arm base drift: ${sha256(continuousArmBase)}`);
}
const manifest = {
  schema: 'private-character-motion-study-v1',
  releaseStatus: 'private-no-upload',
  renderer: {name: 'remotion', version: '4.0.508'},
  composition: {id: 'GenericCharacterMotionTest', width:1080, height:1920, fps:24, frames:72, durationSeconds:3},
  character: {file:'public/character.png', sha256:assetSha256, authority:'PoC transparent derivative only'},
  output: {file:'motion-test.mp4', sha256:sha256(output), bytes:readFileSync(output).byteLength},
  verifiedScope: ['whole-character entrance','subtle transform breathing','code-native phone icon reveal','code-native relationship line draw'],
  unverifiedScope: ['facial expression swap','separated-joint animation','hidden-fill deformation','production admission'],
  actionStudy: {
    output: {file:'character-action-test.mp4', sha256:sha256(actionOutput), bytes:readFileSync(actionOutput).byteLength},
    keyposeAsset: {file:'public/phone-pickup-keyposes-alpha.png', sha256:sha256(actionAsset)},
    composition: {id:'CharacterPhonePickupTest', width:1080, height:1920, fps:24, frames:72, durationSeconds:3},
    verifiedScope: ['head and gaze change','torso bend','arm reach','phone grasp','phone lift'],
    limitation: 'pose-to-pose replacement with short dissolves; no articulated joint interpolation',
  },
  articulatedStudy: {
    output: {file:'articulated-character-test.mp4', sha256:sha256(articulatedOutput), bytes:readFileSync(articulatedOutput).byteLength},
    rigAtlas: {file:'rig-atlas-v1.png', sha256:sha256(rigAtlas)},
    alphaAtlas: {file:'rig-atlas-v1-alpha-hard.png', sha256:sha256(rigAtlasAlpha), extraction:'hard key #e8059a tolerance 48, edge-contract 1, despill'},
    composition: {id:'ArticulatedCharacterPhonePickup', width:1080, height:1920, fps:24, frames:72, durationSeconds:3},
    verifiedScope: ['continuous shoulder rotation','continuous elbow rotation','connected wrist hierarchy','torso bend','phone transfer and lift'],
    verdict: 'rejected-visual-proportion-failure',
    limitations: ['arms assembled at roughly double intended length','hands below knees','short torso','bulky cylindrical legs','robotic timing','imprecise hand-to-phone contact point','production admission prohibited'],
  },
  drawnLimitedAnimationStudy: {
    output: {file:'drawn-character-action-test.mp4', sha256:sha256(drawnOutput), bytes:readFileSync(drawnOutput).byteLength},
    source: {file:'phone-pickup-8-keyposes-v1.png', sha256:sha256(drawnSource)},
    alphaSource: {file:'phone-pickup-8-keyposes-v1-alpha.png', sha256:sha256(drawnAlpha)},
    cropManifest: {file:'public/keyposes-v2/manifest.json', sha256:sha256(resolve(root,'public/keyposes-v2/manifest.json'))},
    composition: {id:'DrawnCharacterPhonePickup', width:1080, height:1920, fps:24, frames:72, durationSeconds:3, uniqueDrawings:8, framesPerDrawing:9, averageUniqueDrawingsPerSecond:2.6667},
    verifiedScope: ['approximately 4.5-head proportion','relaxed fingertips end at mid-thigh','no arm extension during bend','eight readable action states','phone transfers from table to hand'],
    verdict: 'human-review-candidate-production-unapproved',
    limitations: ['pose-to-pose drawing replacement','two-frame dissolves','no authored hand-drawn in-between arcs','minor drawing-to-drawing identity variation'],
  },
  noFlickerStudy: {
    output: {file:'drawn-character-action-test-v2.mp4', sha256:sha256(drawnOutputV2), bytes:readFileSync(drawnOutputV2).byteLength},
    composition: {id:'DrawnCharacterPhonePickupNoFlicker', width:1080, height:1920, fps:24, frames:72, durationSeconds:3, uniqueDrawings:8, framesPerDrawing:9},
    corrections: ['all pose pixels remain opacity 1','no dissolve or double exposure','pelvis/weight-line anchor registered independently of silhouette width','final pose no longer receives whole-body scale correction'],
    verdict: 'human-review-candidate-production-unapproved',
    limitations: ['hard pose changes remain visible','only 2.6667 unique drawings per second','additional authored drawings required for smoother arcs','minor identity variation remains'],
  },
  continuousArmStudy: {
    output: {file:'continuous-arm-mesh-test.mp4', sha256:sha256(continuousArmOutput), bytes:readFileSync(continuousArmOutput).byteLength},
    base: {file:'public/continuous-arm/character-base.png', sha256:sha256(continuousArmBase), derivation:'approved alpha v4 with only the screen-right arm destructively masked in an isolated study copy'},
    contactSheets: [
      {file:'continuous-arm-mesh-contact-sheet.jpg', sha256:sha256(continuousArmContact)},
      {file:'continuous-arm-joint-contact-sheet.jpg', sha256:sha256(continuousArmJointContact)},
    ],
    composition: {id:'ContinuousArmMeshTest', width:1080, height:1920, fps:24, frames:72, durationSeconds:3},
    method: 'one continuously rebuilt variable-width sleeve strip along a quadratic centerline; shoulder root buried beneath the torso; no elbow circle, overlap seam, cross-joint line, dissolve, optical flow or ImageGen in-between',
    verifiedScope: ['continuous per-frame arm silhouette deformation','opaque character with no pose-swap flashing','elbow has no explicit hinge graphic','shoulder cap hidden beneath torso artwork','source character proportions outside the replaced arm remain unchanged'],
    verdict: 'rejected-variable-thickness-by-user-review',
    limitations: ['hidden shoulder half-width was enlarged to 105px and tapered too slowly','bent poses retained excess width through the visible upper arm','screen-right arm only','head, torso and legs remain static','hand is a local vector approximation rather than a separated source-art hand','arm arc is a visual spline rather than a fixed-length two-bone IK solve','not admitted to any case or production authority'],
  },
  thicknessLockedArmStudy: {
    output: {file:'continuous-arm-thickness-locked-test.mp4', sha256:sha256(thicknessLockedOutput), bytes:readFileSync(thicknessLockedOutput).byteLength},
    contactSheets: [
      {file:'continuous-arm-thickness-locked-contact-sheet.jpg', sha256:sha256(thicknessLockedContact)},
      {file:'continuous-arm-thickness-locked-joint-sheet.jpg', sha256:sha256(thicknessLockedJointContact)},
    ],
    composition: {id:'ContinuousArmMeshTest', width:1080, height:1920, fps:24, frames:72, durationSeconds:3},
    widthContract: {units:'source-image half-width pixels', hiddenRoot:{t:[0,0.14],from:100,to:64}, visibleUpperArm:{t:[0.14,0.55],from:64,to:52}, visibleForearm:{t:[0.55,1],from:52,to:39}, invariantAcrossFrames:true},
    corrections: ['oversized root taper ends before the arm becomes visible','upper-arm, elbow and wrist widths depend only on normalized sleeve position, never on animation frame','rejected predecessor retained byte-for-byte as history'],
    verdict: 'human-review-candidate-production-unapproved',
    limitations: ['screen-right arm only','body remains static','hand remains a vector approximation','fixed cross-section does not yet guarantee fixed anatomical bone length','production admission prohibited'],
  },
};
writeFileSync(resolve(root, '../../out/studies/generic-character-motion-test-v1/output-manifest.json'), `${JSON.stringify(manifest,null,2)}\n`);
console.log(`valid: ${stream.width}x${stream.height}, ${stream.r_frame_rate}fps, ${stream.nb_frames} frames, ${stream.duration}s, ${manifest.output.sha256}`);
