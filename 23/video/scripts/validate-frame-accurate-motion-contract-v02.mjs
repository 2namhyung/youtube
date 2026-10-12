import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';

const ROOT = process.cwd();
export const DEFAULT_ROOT = path.join(ROOT, 'video/qa/reference-study/frame-accurate-motion-contract-v02');
const ACTIVE_NUMBERS = [1,2,3,4,5,6,7,8,9];
const ACTIVE_IDS = [
  'sample-01-shared-background-accumulation','sample-02-numeric-step-progression','sample-03-chart-reveal',
  'sample-04-map-route-reframe','sample-05-object-preserving-layout-reframe','sample-06-directional-exit-hard-cut-pair',
  'sample-07-hook-reel-collage-montage','sample-08-speaker-supporting-overlay-entry-corrected','sample-09-device-light-focal-motion-corrected',
];
const DIMENSIONS = ['stage','focal','supporting','depth','entrance','internal_change','transition','hold','exclusions'];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const must = (condition, message, errors) => { if (!condition) errors.push(message); };
const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
const semanticDigest = (value) => sha(Buffer.from(JSON.stringify(canonicalize(value))));
const exactKeys = (value, expected, label, errors) => {
  const validObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  must(validObject, `${label}: must be an object`, errors);
  if (validObject) must(same(Object.keys(value).sort(), [...expected].sort()), `${label}: unexpected or missing keys`, errors);
};

const CONTRACT_FILE_SHA256 = {
  1:'161d8c9b31cd91dd004012a374ab057562d2de85c7918c48c80e8c95fa0639a8',
  2:'29b0478859bce1693fd197808ff01fedbcf3f5755acf5e2569fe692c31e24bb0',
  3:'2af5651a33bd4e73d12d094eeb7581e39f474c89e36b64357a51db70a7e8d086',
  4:'d21c9974c165534c2040cca009b0cdb55cbf4274b81f5cd54ccacdedde89574a',
  5:'6300136ecf45f85d2fee83479ac57238470d6853e0aae30eccf9e6ef09814b7c',
  6:'923a41f3ccedb9dd4e4a24a5b7245073d401b7c259a503d3afbd8b762eb073f7',
  7:'e16f48d6e3ddec9806a85c327315b0e878918523f375b4c5ff950e2ea08698b6',
  8:'a90ef3405fe4c8ce2498a6499bb5166c09e52b7ed09da28151af759c03619b40',
  9:'900870bbb02d49c85ff61fe92bcd192b197de18e6f1e1a07a419b172e153e7dc',
  10:'ba7cec5b31b996ced466e54cca2f5eefcd9e257d488088ed06a5828f2bda1d91',
};
const CONTRACT_SEMANTIC_SHA256 = {
  1:'56283e9b2abbca2d0b17c7b462f5c116a2e41f0b7096d61a4846bb2047491dba',
  2:'d7aeadcd2e8c55e6bc35bce7f70ecb3fa66c45af10bafde445a74334e4dcc9e6',
  3:'fb319661fbea930cf0f4323ba7286944bb470555dd86a1db70197b2e05ce78ea',
  4:'cf246812fda78704463d261e1ee54e785ca9deb0e7b30276b3edd1cb733d4dd3',
  5:'82f12fda9f23cc27ebaa8010d9fcc9f6336197de39e8ae32237860010c9cd79c',
  6:'b0945b4581e46960ae530963fdf6f1fd2277581b2d9f27fa87020efb1ad9a564',
  7:'49d2d222d3641399c60ae03bf2401383eff84c6f5f465b71460732f1c367f7ea',
  8:'982deab2dbb38393a71de77f117cdff7d9212e4978495a1df9caf6272130768e',
  9:'f1887cc0c83e0e0eee4a67d99ca9c7a6c5c3d6a4ad664436cb38e57656f06689',
  10:'7b78adb589f3e1784a91db5cc8d76b5d8d594182e812f19743ad2c8919fc9e92',
};
const MANIFEST_FILE_SHA256 = 'b97c9ca082b5209cab50b8b815d5cbc6b64b17dc3693be6ba37085c33d46433d';
const MANIFEST_SEMANTIC_SHA256 = 'f9f98c766420060f72f0db095c85783416ff71b2c0b486a73f339c16947cef40';

const ACTIVE_ROOT_KEYS = ['schema_version','contract_id','sample_number','sample_id','status','review_profile','transfer_classification','production_authority','production_eligible','eligible_for_user_style_frame_review','human_reference_calibration_pass','grammar_promoted','source_binding','evidence_binding','reference_readiness_matrix','component_contract','action_contract','visual_beat_contracts','operator_hypotheses','transferable_change_fully_mapped','source_video_pixels_are_transferable_remotion_motion','hidden_authoring_uncertainties','forbidden_substitutes','typography_surface_contract_version','allowed_text_roles','explanatory_text_may_replace_focal_asset'];
const EXCLUSION_ROOT_KEYS = ['schema_version','contract_id','sample_number','sample_id','status','review_profile','transfer_classification','source_binding','reference_readiness_matrix','component_contract','action_contract','operator_hypotheses','forbidden_substitutes','remotion_probe','active_grammar_bindings','active_binding_count','production_authority','production_eligible','eligible_for_user_style_frame_review','human_reference_calibration_pass','grammar_promoted'];
const MANIFEST_ROOT_KEYS = ['schema_version','package_id','status','purpose','active_motion_sample_numbers','excluded_sample_numbers','active_contract_count','exclusion_contract_count','contracts','exclusion_contract','upstream','global_fail_closed_rules','human_approval','grammar_promoted','production_authority','production_eligible','eligible_for_user_style_frame_review','active_cut_root'];

const row = (id, role, lifecycle, operator, independent = true) => ({id,role,lifecycle,operator,independently_addressable:independent});
const action = (id, targets, operator, start, end, evidence) => ({id,target_ids:targets,candidate_operator:operator,source_frame_range:{start,end},evidence_frames:evidence});
const CANONICAL = {
  1:{id:ACTIVE_IDS[0],source:['raw/inbox/vox-style-claude-remotion-reference.mp4','0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9',1920,1080,30,157,232],components:[row('shared-background','stage','stable','none'),row('building-context','focal','entering-then-stable','translate/opacity'),row('left-person','supporting','hidden-entering-stable','translate/opacity'),row('right-person','supporting','hidden-entering-stable','translate/opacity')],actions:[action('building-entry',['building-context'],'translate/opacity-or-target-local-clip',157,184,[157,169,184]),action('left-person-entry',['left-person'],'target-local-translate/opacity',184,205,[184,194,205]),action('right-person-entry',['right-person'],'target-local-translate/opacity',205,232,[205,210,232])],entrance:['building-entry','left-person-entry','right-person-entry']},
  2:{id:ACTIVE_IDS[1],source:['raw/inbox/vox-style-claude-remotion-reference.mp4','0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9',1920,1080,30,563,623],components:[row('tanker-context','supporting','slow-moving','translate'),row('ocean-source-video','supporting','source-video-internal-motion','non-remotion'),row('barrel-value-unit-group','focal','hidden-rising-settled','group-translate/opacity'),row('numeric-glyphs','surface-content','framewise-changing','deterministic-count-up')],actions:[action('tanker-slow-translate',['tanker-context'],'translate',563,623,[563,623]),action('numeric-group-rise-reveal',['barrel-value-unit-group'],'group-translate/opacity',571,593,[571,578,585,593]),action('group-local-count-up',['numeric-glyphs'],'deterministic-framewise-count-up',578,623,[578,585,593,600,608,615,623])],entrance:['numeric-group-rise-reveal']},
  3:{id:ACTIVE_IDS[2],source:['raw/inbox/vox-style-claude-remotion-reference.mp4','0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9',1920,1080,30,749,837],components:[row('chart-shell','stage','opacity-settling-then-stable','opacity'),row('axes-title-legend','supporting','settling-then-stable','opacity'),row('plot-series','focal','hidden-progressive','stroke-draw-or-plot-local-clip'),row('point-markers','supporting','milestone-visible','target-local-reveal')],actions:[action('shell-settle',['chart-shell','axes-title-legend'],'opacity-settle',749,763,[749,757,763]),action('series-progress',['plot-series'],'svg.stroke-draw-or-plot-local-clip',766,837,[766,772,787,793,802,817,837]),action('point-milestones',['point-markers'],'path-head-bound-point-reveal',766,837,[766,787,802,817,837])],entrance:['shell-settle']},
  4:{id:ACTIVE_IDS[3],source:['video/qa/reference-study/additional-sources/acquired/Y6mOBK5peDU.android.mp4','c7fa0419e50301e432b148b67dfd3d5de4a64882b09242b168148e7f3aeaf1a1',640,360,25,190,450],components:[row('map-camera','focal','continuously-moving','camera.transform'),row('location-overlays','supporting','entering-exiting','target-local-lifecycle'),row('aircraft','supporting','route-moving','translate-along-route'),row('localized-event','supporting','brief-local-change','localized-flash')],actions:[action('opening-overlay-exit',['location-overlays'],'target-local-opacity-out',190,210,[190,205,210]),action('continuous-map-reframe',['map-camera'],'camera.transform',190,450,[190,243,244,295,345,393,394,450]),action('geographic-overlay-lifecycle',['location-overlays','aircraft'],'location-registered-state/translation',210,393,[210,295,345,393]),action('localized-event-onset',['localized-event'],'localized-brightness/scale-event',393,394,[393,394])],entrance:['geographic-overlay-lifecycle']},
  5:{id:ACTIVE_IDS[4],source:['raw/inbox/vox-style-claude-remotion-reference.mp4','0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9',1920,1080,30,995,1021],components:[row('departing-chart','supporting','exiting','translate-x'),row('preserved-flag-map','focal','supporting-to-focused','translate-x')],actions:[action('chart-exit-left',['departing-chart'],'translate-x',995,1021,[995,1003,1011,1021]),action('map-preserving-reframe',['preserved-flag-map'],'same-target-translate-x',995,1021,[995,1003,1011,1021])],entrance:[]},
  6:{id:ACTIVE_IDS[5],source:['raw/inbox/vox-style-claude-remotion-reference.mp4','0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9',1920,1080,30,711,726],secondary:[{kind:'separate-hard-cut-pair',start_frame:370,end_frame:371}],components:[row('complete-scene-parent','focal','exiting','translate-x'),row('separate-hard-cut-pair','supporting','adjacent-boundary','hard-cut')],actions:[action('whole-scene-exit-left',['complete-scene-parent'],'parent-translate-x',711,726,[711,718,726]),action('separate-adjacent-hard-cut',['separate-hard-cut-pair'],'hard-cut-zero-blend',370,371,[370,371])],entrance:[]},
  7:{id:ACTIVE_IDS[6],source:['video/qa/reference-study/additional-sources/acquired/xOhh274Ayac.android.mp4','538b936edd16f847c5b72d3f513b55efc7ede6e2351ba755642eedfd9daac88b',640,360,25,0,300],components:[row('recorded-speaker-context','non-transferable-context','source-video-internal-motion','excluded-from-remotion',false),row('side-overlays','supporting','accumulating','target-local-entry'),row('gallery-strip','focal','moving','parent-translate-x'),row('kinetic-title','supporting','state-changing','content-replacement/scale')],actions:[action('side-overlay-accumulation',['side-overlays'],'independent-target-local-entry',0,106,[0,40,85,106]),action('cut-to-gallery',['gallery-strip'],'hard-cut-zero-blend',106,107,[106,107]),action('gallery-parent-scroll',['gallery-strip'],'parent-translate-x',107,227,[107,160,227]),action('cut-to-title',['kinetic-title'],'hard-cut-zero-blend',227,228,[227,228]),action('kinetic-title-states',['kinetic-title'],'content-replacement/scale',228,300,[228,260,300])],entrance:['side-overlay-accumulation']},
  8:{id:ACTIVE_IDS[7],source:['video/qa/reference-study/additional-sources/acquired/dBakc0BdHjY.android.mp4','493e807a188437d6d163b2db42c12b5df7f70a8480a4c696b298f56d9f14200e',640,360,23.976023976023978,0,211],components:[row('reserved-presenter-region','non-transferable-context','reserved-empty','no-rendered-person',false),row('right-handshake-overlay','focal','hidden-entering-stable','target-local-scale/opacity'),row('left-tombstone-overlay','supporting','hidden-entering-stable','target-local-scale/opacity')],actions:[action('handshake-entry',['right-handshake-overlay'],'target-local-scale/opacity',43,72,[43,72]),action('tombstone-entry',['left-tombstone-overlay'],'target-local-scale/opacity',163,211,[163,211])],entrance:['handshake-entry','tombstone-entry']},
  9:{id:ACTIVE_IDS[8],source:['video/qa/reference-study/additional-sources/acquired/b7KlsXNQobs.android.mp4','7ccb3068c49fca17348538fee5e9c59f5e4a1ff0114e01849f08d0765481cd8f',640,360,29.97002997002997,60,155],components:[row('reserved-presenter-context','non-transferable-context','reserved-empty','no-rendered-person',false),row('stable-phone-shell','supporting','stable','no-entry-claim'),row('phone-surface-state','focal','framewise-changing','inside-surface-content-state'),row('two-support-overlays','supporting','hidden-entering-stable','independent-target-entry')],actions:[action('surface-value-chart-progression',['phone-surface-state'],'framewise-inside-surface-state',60,120,[60,70,80,90,120]),action('support-overlay-entry',['two-support-overlays'],'independent-target-local-entry',60,90,[60,90])],entrance:['support-overlay-entry']},
};

const MEDIA = {
  1:['7d1a83025934496c641d6b4ec331ec0be2ca7e7d54e84542824bb5846632ac50','41ee2b339858359c12e377e75ec1a2c56914eed7c8c651efaf6b158d9d7611ce','7b17a89a74da1b2c3bcbb67198ab49459b45bd059fc95975da47ef4c4a91c02c','be6761d24d91bd4b896fa922caeb998071aede0cffcd6b7f98828a65ff40e04a',75],
  2:['fd69b16e8d9a68b0823561dad490d2e2f5591fbbfd2e2acaff2c398a014c4800','643e28ecbf246945b5475a9eb06f216bba1e5fb82a32329771a2fee01b97ceec','aebe349b899b3b3b9227a5be8625491694057db067b0047868b96a6dfd9c886c','0d8f6999baa7549346e4fc24f94a4c1156e88ec406b97abca2a214263d91eb1f',60],
  3:['f89b6f9c2932f2c1fc4f474706a8ded6cc66772bddcb57b16e628f9f33a0809a','2b90f0f0d17f0c3344926ea932f526476c8b6ed305b739de30937c848d4a5136','cbd11ec00ac522518f64bfac7d90b010d96fcf155194e55c73e87502c8d444f4','191cdf8cf1c527684a8b85c9b4e5a7a66d08d7038001ee1701675a52d871b3e9',88],
  4:['b17ec637711aaea1f7973231f2a0775095a904f87a1ea5d98b3918ff7f57303b','55a50966151ef20a75940907a6c1278e0d7c5b13a2e69b8fb0d027ba92ba93ef','61979a3fb5ad5e37b43d7062b7be62ec361d6692b1cb0359402c49078e50eceb','8f806893701a60358dafbd4a4b9d225e21ea10532f550f9365c9d08e1ebdb1e9',239],
  5:['3fa1b4f8157ce72307a874ecd235c06c6ec06b516e95f29c99728b1f64097967','d422904ca727d43e0ff0aac1bcad8ddd1c7b68489e7458dc96f37f9b135a2db4','3521dc4676e8ee946503bc6b269f2b4c87a9a7ac739d269dd3781dc7dce32a4b','dfe3c581d87edd56fb5c8cacdf04c399b56a9d1ddb01f3c132b6e8b720e9243b',26],
  6:['3ba4ef2c9a6efcefc567dea8c66e7e3c17a096f394ba63d979b94834a484d055','35596443eb60f8320f2d790b931773748cb9851bd11d6b12e265b22999ea234f','c901ffe1ccc755eeca064f97c10d43cae2118acc941c2d3de931cf3cc3e35924','a42e4b85455081cc1a4d761d420b93447538f1ba3169627cdb2665525fc302c6',31],
  7:['ca02be78a50401cf1381b58b04a4ff78fe1b88a81581518d45813f49def7bf4d','e2275ed56fc6b6dbdfcb5e23b3d0d494b159da8a9b94b704d3052e47e7025a65','3fbb397b33c20c35355877165891330bd0afa5872979452585c3f533454691ca','9982aa3f68d08223478e60938c8c280440548fcea0c43c0f55cb1f5c78459c22',239],
  8:['5dce24ef43a9d579bf93c7e2ce0d134561498a93e500ccaf990b47b990850e66','13d726e1b92b14555e8f3f4f9258e60e1f1981503c7be8f438e4fc49003869e1','54e0027a02d61fee9fb98a6ec131740fd7189d095315d16bb37a6bfa11c48f70','230517dcf8168df1371ec8c8571f2e4320ca5a7df89a7c5037a1936386b451e5',180],
  9:['8692905bdab018fa74e70255c644a27cff052ed0959c2d3736b0a37c96f57d24','dc72f4e68e7d2c9825799898f3674ca09232b3719d805ad31211194ec904018b','1694af7b872267b9ba9e4c4a1502f6d88a8f07982920c3f5fb1b04edcdb81673','8d271392ebbde810ec0a21ee84278f20b6224a4e0bb5d555e7ea18988324bb55',60],
};

const evidencePaths = (number) => {
  const id = CANONICAL[number].id;
  const packageName = [2,3].includes(number) ? 'motion-reverse-engineering-pilot-v01' : number <= 7 ? 'motion-reverse-engineering-suite-v01' : 'motion-reverse-engineering-suite-v02';
  const base = `video/qa/reference-study/${packageName}/${id}`;
  const pad = String(number).padStart(2,'0');
  return {
    primary_analysis: `${base}/analysis.json`,
    probe: `${base}/sample-${pad}-remotion-probe-provisional.mp4`,
    side_by_side: `${base}/sample-${pad}-reference-vs-probe-provisional.mp4`,
    mobile_contact: `${base}/sample-${pad}-reference-vs-probe-contact-360x203.png`,
  };
};
const EXTRA_EVIDENCE = {
  2:{operator_hypotheses:['video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-02-numeric-step-progression/operator-hypotheses.json','5b6976897ca4e31643c002c1cb200850ffd2cb66951f7f5853f82c0fdece0b54']},
  3:{operator_hypotheses:['video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-03-chart-reveal/operator-hypotheses.json','3c70627afa7fc65f1b41254a01a9f7a0d422101e5a34ccdc8831495c892bf202']},
  8:{measured_analysis:['video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-08-speaker-supporting-overlay-entry/analysis.json','50b921e2e335345de25d0c63616106fe1ee396752b334a738480064336084722']},
  9:{measured_analysis:['video/qa/reference-study/motion-reverse-engineering-suite-v01/sample-09-device-light-focal-motion/analysis.json','bb2795786c5d406b96488c721482dd5b86f212c727cb04e3538884bba03c2ad0']},
};

function videoMetadata(file) {
  const result = spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration:format=duration','-of','json',file],{encoding:'utf8',windowsHide:true});
  if (result.status !== 0) return null;
  const parsed = JSON.parse(result.stdout);
  return {stream:parsed.streams?.[0] ?? null,duration:Number(parsed.format?.duration ?? parsed.streams?.[0]?.duration ?? 0)};
}
function decodeVideo(file) {
  return spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-map','0:v:0','-f','null','-'],{windowsHide:true,stdio:'ignore'}).status === 0;
}
function fpsNumber(value) {
  const [a,b='1'] = String(value).split('/').map(Number);
  return a / b;
}
function selectedRawFrames(file, frames) {
  const select = frames.map((frame) => `eq(n\\,${frame})`).join('+');
  const result = spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-vf',`select='${select}',format=rgb24`,'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:null,windowsHide:true,maxBuffer:24*1024*1024});
  return result.status === 0 ? result.stdout : null;
}
function meanAbs(a,b) { let sum=0; for(let index=0;index<a.length;index+=1) sum+=Math.abs(a[index]-b[index]); return sum/a.length; }

export async function validateProbeMedia(file, holdStart) {
  const errors = [];
  const probeMeta = videoMetadata(file);
  must(probeMeta?.stream?.width === 1920 && probeMeta?.stream?.height === 1080 && Math.abs(fpsNumber(probeMeta?.stream?.avg_frame_rate)-30) < 1e-6 && Number(probeMeta?.stream?.nb_frames) === 300 && probeMeta.duration > 0, 'probe must decode as 1920x1080 30fps 300f', errors);
  must(decodeVideo(file), 'probe full decode failed', errors);
  const holdMid = Math.floor((holdStart+299)/2), raw = selectedRawFrames(file,[0,holdStart,holdMid,299]);
  if (!raw || raw.length !== 1920*1080*3*4) errors.push('probe verification frame decode failed');
  else {
    const size=1920*1080*3, frames=[0,1,2,3].map((index)=>raw.subarray(index*size,(index+1)*size));
    must(meanAbs(frames[0],frames[1]) > 0.5, 'static/replaced probe has no observable pre-hold change', errors);
    must(meanAbs(frames[1],frames[2]) < 0.5 && meanAbs(frames[2],frames[3]) < 0.5, 'declared reading hold is not stable', errors);
  }
  return errors;
}

function validateReadinessSchema(matrix, label, errors, exclusion = false) {
  exactKeys(matrix, DIMENSIONS, label, errors);
  exactKeys(matrix?.focal, ['exactly_one','component_id'], `${label}/focal`, errors);
  exactKeys(matrix?.entrance, ['observed','action_ids','note'], `${label}/entrance`, errors);
  exactKeys(matrix?.hold, exclusion ? ['not_applicable_to_remotion_probe'] : ['source_hold_is_not_inferred','probe_requirement'], `${label}/hold`, errors);
  if (!exclusion) exactKeys(matrix?.hold?.probe_requirement, ['fps','duration_in_frames','minimum_stable_frames'], `${label}/hold/probe_requirement`, errors);
}

function validateActiveSchema(contract, prefix, errors) {
  exactKeys(contract, ACTIVE_ROOT_KEYS, `${prefix}/root`, errors);
  exactKeys(contract?.source_binding, ['path','sha256','width','height','fps','window','secondary_windows'], `${prefix}/source_binding`, errors);
  exactKeys(contract?.source_binding?.window, ['start_frame','end_frame','start_seconds','end_seconds'], `${prefix}/source_binding/window`, errors);
  for (const [index, item] of (contract?.source_binding?.secondary_windows ?? []).entries()) exactKeys(item, ['kind','start_frame','end_frame'], `${prefix}/source_binding/secondary_windows/${index}`, errors);
  exactKeys(contract?.evidence_binding, ['primary_analysis','measured_analysis','operator_hypotheses','probe','side_by_side','mobile_contact','upstream_active_grammar_approval'], `${prefix}/evidence_binding`, errors);
  for (const name of ['primary_analysis','measured_analysis','operator_hypotheses']) {
    if (contract?.evidence_binding?.[name] !== null) exactKeys(contract?.evidence_binding?.[name], ['path','sha256','bytes'], `${prefix}/evidence_binding/${name}`, errors);
  }
  exactKeys(contract?.evidence_binding?.probe, ['kind','path','sha256','bytes','composition_id','width','height','fps','duration_in_frames','action_end_frame','hold'], `${prefix}/evidence_binding/probe`, errors);
  exactKeys(contract?.evidence_binding?.probe?.hold, ['start_frame','minimum_frames','checked_frames'], `${prefix}/evidence_binding/probe/hold`, errors);
  exactKeys(contract?.evidence_binding?.side_by_side, ['kind','path','sha256','bytes'], `${prefix}/evidence_binding/side_by_side`, errors);
  exactKeys(contract?.evidence_binding?.mobile_contact, ['kind','path','sha256','bytes','width','height'], `${prefix}/evidence_binding/mobile_contact`, errors);
  validateReadinessSchema(contract?.reference_readiness_matrix, `${prefix}/reference_readiness_matrix`, errors);
  for (const [index, item] of (contract?.component_contract ?? []).entries()) exactKeys(item, ['id','role','lifecycle','operator','independently_addressable'], `${prefix}/component_contract/${index}`, errors);
  for (const [index, item] of (contract?.action_contract ?? []).entries()) {
    exactKeys(item, ['id','target_ids','candidate_operator','source_frame_range','evidence_frames','observable_only','hidden_authoring_claim'], `${prefix}/action_contract/${index}`, errors);
    exactKeys(item?.source_frame_range, ['start','end'], `${prefix}/action_contract/${index}/source_frame_range`, errors);
  }
  for (const [index, item] of (contract?.visual_beat_contracts ?? []).entries()) {
    exactKeys(item, ['beat_id','viewer_takeaway','action_ids','focal_component_id','supporting_component_ids','narration_window','stable_reading_hold'], `${prefix}/visual_beat_contracts/${index}`, errors);
    exactKeys(item?.narration_window, ['start','end'], `${prefix}/visual_beat_contracts/${index}/narration_window`, errors);
    exactKeys(item?.stable_reading_hold, ['belongs_to_probe_not_source','minimum_frames'], `${prefix}/visual_beat_contracts/${index}/stable_reading_hold`, errors);
  }
  for (const [index, item] of (contract?.operator_hypotheses ?? []).entries()) exactKeys(item, ['observed_fact','candidate_operator','alternatives','confidence','evidence_frames','uncertainty','human_review_status'], `${prefix}/operator_hypotheses/${index}`, errors);
}

export function validateContractObject(contract) {
  const errors = [];
  const prefix = contract.sample_id ?? 'unknown';
  const canonical = CANONICAL[contract.sample_number];
  must(Boolean(canonical), `${prefix}: sample_number must be one of 1-9`, errors);
  if (!canonical) return errors;
  validateActiveSchema(contract, prefix, errors);
  must(semanticDigest(contract) === CONTRACT_SEMANTIC_SHA256[contract.sample_number], `${prefix}: validator-owned canonical semantic digest mismatch`, errors);
  must(contract.sample_id === canonical.id && contract.contract_id === `${canonical.id}-frame-accurate-v02`, `${prefix}: immutable sample identity mismatch`, errors);
  must(contract.schema_version === 2, `${prefix}: schema version must be 2`, errors);
  must(contract.status === 'reanalysis-contract-complete-pending-human-reference-review', `${prefix}: unsafe status`, errors);
  must(contract.review_profile === 'remotion-motion' && contract.transfer_classification === 'active-motion-candidate', `${prefix}: active classification mismatch`, errors);
  must(contract.production_authority === false && contract.production_eligible === false && contract.eligible_for_user_style_frame_review === false && contract.human_reference_calibration_pass === false && contract.grammar_promoted === false, `${prefix}: approval/authority flags must stay false`, errors);
  const [sourcePath,sourceSha,width,height,fps,start,end] = canonical.source;
  must(contract.source_binding?.path === sourcePath && contract.source_binding?.sha256 === sourceSha && contract.source_binding?.width === width && contract.source_binding?.height === height && contract.source_binding?.fps === fps, `${prefix}: canonical source identity/spec mismatch`, errors);
  must(contract.source_binding?.window?.start_frame === start && contract.source_binding?.window?.end_frame === end, `${prefix}: canonical source window mismatch`, errors);
  must(Math.abs(contract.source_binding?.window?.start_seconds-start/fps) < 1e-6 && Math.abs(contract.source_binding?.window?.end_seconds-end/fps) < 1e-6, `${prefix}: canonical source time/frame mapping mismatch`, errors);
  must(same(contract.source_binding?.secondary_windows ?? [], canonical.secondary ?? []), `${prefix}: canonical secondary windows mismatch`, errors);
  must(contract.typography_surface_contract_version === 2 && same(contract.allowed_text_roles, ['asset-label','surface-content','screen-chrome']) && contract.explanatory_text_may_replace_focal_asset === false, `${prefix}: typography/text substitution contract incomplete`, errors);
  const matrix = contract.reference_readiness_matrix ?? {};
  must(DIMENSIONS.every((key) => Object.hasOwn(matrix, key)), `${prefix}: nine-dimension readiness matrix incomplete`, errors);
  must(typeof matrix.stage === 'string' && matrix.stage.trim().length > 0, `${prefix}: stage must be a nonempty string`, errors);
  must(matrix.focal?.exactly_one === true && typeof matrix.focal?.component_id === 'string', `${prefix}: exactly one focal component required`, errors);
  must(Array.isArray(matrix.supporting) && matrix.supporting.every((value) => typeof value === 'string' && value.length > 0), `${prefix}: supporting must be a string array`, errors);
  must(Array.isArray(matrix.depth) && matrix.depth.length > 0 && matrix.depth.every((value) => typeof value === 'string' && value.length > 0), `${prefix}: depth must be a nonempty string array`, errors);
  must(typeof matrix.entrance === 'object' && matrix.entrance !== null && matrix.entrance.observed === (canonical.entrance.length > 0) && same(matrix.entrance.action_ids, canonical.entrance) && typeof matrix.entrance.note === 'string' && matrix.entrance.note.length > 0, `${prefix}: entrance must be a nonempty declaration containing only canonical entrance action IDs`, errors);
  must(Array.isArray(matrix.entrance?.action_ids) && matrix.entrance.action_ids.every((id) => !/(?:exit|progress|reframe|scroll|cut)/u.test(id)), `${prefix}: exit/progress/reframe/scroll/cut cannot be classified as entrance`, errors);
  must(Array.isArray(matrix.internal_change) && matrix.internal_change.length > 0 && matrix.internal_change.every((value) => typeof value === 'string' && value.length > 0), `${prefix}: internal_change must be a nonempty string array`, errors);
  must(Array.isArray(matrix.transition) && matrix.transition.length > 0 && matrix.transition.every((value) => typeof value === 'string' && value.length > 0), `${prefix}: transition must be a nonempty string array`, errors);
  must(matrix.hold?.source_hold_is_not_inferred === true && matrix.hold?.probe_requirement?.fps === 30 && matrix.hold?.probe_requirement?.duration_in_frames === 300 && matrix.hold?.probe_requirement?.minimum_stable_frames >= 60, `${prefix}: 300f/30fps/60f hold contract missing`, errors);
  must(Array.isArray(matrix.exclusions) && matrix.exclusions.length > 0 && matrix.exclusions.every((value) => typeof value === 'string' && value.length > 0), `${prefix}: exclusions must be a nonempty string array`, errors);
  const components = contract.component_contract ?? [];
  const componentIds = new Set(components.map((row) => row.id));
  must(components.length > 0 && componentIds.size === components.length, `${prefix}: component IDs missing/duplicate`, errors);
  must(same(components, canonical.components), `${prefix}: canonical component semantics mismatch`, errors);
  must(componentIds.has(matrix.focal?.component_id), `${prefix}: focal component is not independently declared`, errors);
  must(matrix.supporting.every((id) => componentIds.has(id) && id !== matrix.focal.component_id), `${prefix}: supporting IDs must be declared and distinct from focal`, errors);
  must(components.filter((row) => row.role === 'focal').length === 1, `${prefix}: exactly one focal role required`, errors);
  const actions = contract.action_contract ?? [];
  must(actions.length > 0, `${prefix}: action contract empty`, errors);
  const actionProjection = actions.map((item) => ({id:item.id,target_ids:item.target_ids,candidate_operator:item.candidate_operator,source_frame_range:item.source_frame_range,evidence_frames:item.evidence_frames}));
  must(same(actionProjection, canonical.actions), `${prefix}: canonical action/operator/evidence semantics mismatch`, errors);
  for (const action of actions) {
    must(action.id && action.candidate_operator && action.observable_only === true && action.hidden_authoring_claim === false, `${prefix}/${action.id}: observable operator contract incomplete`, errors);
    must(action.source_frame_range?.end >= action.source_frame_range?.start, `${prefix}/${action.id}: invalid frame range`, errors);
    must(Array.isArray(action.evidence_frames) && action.evidence_frames.length >= 2 && action.evidence_frames.every((frame) => frame >= action.source_frame_range.start && frame <= action.source_frame_range.end), `${prefix}/${action.id}: evidence frames outside action range`, errors);
    must(action.target_ids?.length > 0 && action.target_ids.every((id) => componentIds.has(id)), `${prefix}/${action.id}: target not declared as component`, errors);
    const windows = [contract.source_binding?.window, ...(contract.source_binding?.secondary_windows ?? [])];
    must(windows.some((window) => action.source_frame_range.start >= window.start_frame && action.source_frame_range.end <= window.end_frame), `${prefix}/${action.id}: action falls outside declared source windows`, errors);
  }
  const beats = contract.visual_beat_contracts ?? [];
  must(beats.length === actions.length, `${prefix}: every action must have one visual-beat contract`, errors);
  const beatActionIds = beats.flatMap((beat) => beat.action_ids ?? []);
  must(same([...beatActionIds].sort(), actions.map((action) => action.id).sort()), `${prefix}: visual-beat/action mapping must be exact and unique`, errors);
  for (const beat of beats) {
    must(beat.viewer_takeaway && beat.action_ids?.length === 1 && componentIds.has(beat.focal_component_id), `${prefix}/${beat.beat_id}: beat needs one declared focal and one action`, errors);
    must(beat.stable_reading_hold?.belongs_to_probe_not_source === true && beat.stable_reading_hold?.minimum_frames >= 60, `${prefix}/${beat.beat_id}: beat hold contract incomplete`, errors);
  }
  const hypotheses = contract.operator_hypotheses ?? [];
  must(hypotheses.length > 0, `${prefix}: operator hypothesis missing`, errors);
  for (const row of hypotheses) {
    must(row.observed_fact && row.candidate_operator && Array.isArray(row.alternatives) && row.alternatives.length > 0, `${prefix}: observed/candidate/alternative separation incomplete`, errors);
    must(Number.isFinite(row.confidence) && row.confidence > 0 && row.confidence <= 1 && row.uncertainty && row.human_review_status === 'pending', `${prefix}: confidence/uncertainty/human status incomplete`, errors);
  }
  must(contract.transferable_change_fully_mapped === true && contract.source_video_pixels_are_transferable_remotion_motion === false, `${prefix}: transferable/source-video scope dishonest`, errors);
  must(contract.evidence_binding?.primary_analysis?.path && contract.evidence_binding?.probe?.path && contract.evidence_binding?.side_by_side?.path && contract.evidence_binding?.mobile_contact?.path && contract.evidence_binding?.upstream_active_grammar_approval === false, `${prefix}: evidence bundle incomplete`, errors);
  const expectedPaths = evidencePaths(contract.sample_number), media = MEDIA[contract.sample_number];
  const expectedHashes = {primary_analysis:media[0],probe:media[1],side_by_side:media[2],mobile_contact:media[3]};
  for (const name of Object.keys(expectedPaths)) must(contract.evidence_binding?.[name]?.path === expectedPaths[name] && contract.evidence_binding?.[name]?.sha256 === expectedHashes[name], `${prefix}/${name}: canonical evidence path/hash mismatch`, errors);
  const expectedExtra = EXTRA_EVIDENCE[contract.sample_number] ?? {};
  for (const name of ['measured_analysis','operator_hypotheses']) {
    const expected = expectedExtra[name] ?? null, actual = contract.evidence_binding?.[name] ?? null;
    must(expected ? actual?.path === expected[0] && actual?.sha256 === expected[1] : actual === null, `${prefix}/${name}: canonical optional evidence mismatch`, errors);
  }
  must(contract.evidence_binding?.probe?.action_end_frame === media[4] && contract.evidence_binding?.probe?.hold?.start_frame === media[4] && contract.evidence_binding?.probe?.hold?.minimum_frames >= 60, `${prefix}: canonical evidence hold mismatch`, errors);

  const text = JSON.stringify(contract).toLowerCase();
  if (contract.sample_number === 2) {
    for (const token of ['tanker-slow-translate','numeric-group-rise-reveal','group-local-count-up']) must(actions.some((row) => row.id === token), `${prefix}: missing ${token}`, errors);
    must(text.includes('ocean-source-video') && text.includes('$25') && text.includes('$116'), `${prefix}: measured context/value progression missing`, errors);
    must(contract.forbidden_substitutes.includes('geometrically fixed tanker') && contract.forbidden_substitutes.includes('pre-rendered number cards'), `${prefix}: known numeric substitutes not forbidden`, errors);
  }
  if (contract.sample_number === 3) {
    must(actions.some((row) => row.id === 'shell-settle') && actions.some((row) => row.id === 'series-progress' && row.candidate_operator === 'svg.stroke-draw-or-plot-local-clip'), `${prefix}: shell/plot phase split missing`, errors);
    must(contract.forbidden_substitutes.includes('whole-chart image wipe'), `${prefix}: whole-chart wipe not forbidden`, errors);
  }
  if (contract.sample_number === 4) {
    must(actions.some((row) => row.id === 'continuous-map-reframe' && row.evidence_frames.includes(243) && row.evidence_frames.includes(244)), `${prefix}: continuous pan boundary missing`, errors);
    must(actions.some((row) => row.id === 'localized-event-onset' && same(row.evidence_frames,[393,394])), `${prefix}: localized event boundary missing`, errors);
  }
  if (contract.sample_number === 6) {
    must(actions.some((row) => row.id === 'whole-scene-exit-left') && actions.some((row) => row.id === 'separate-adjacent-hard-cut' && same(row.evidence_frames,[370,371])), `${prefix}: exit/separate-hard-cut proof incomplete`, errors);
  }
  if (contract.sample_number === 7) {
    must(components.some((row) => row.id === 'recorded-speaker-context' && row.role === 'non-transferable-context' && row.operator === 'excluded-from-remotion'), `${prefix}: recorded speaker must be non-transferable context`, errors);
    must(actions.filter((row) => /cut-/u.test(row.id)).length === 2, `${prefix}: two hard-cut segment boundaries required`, errors);
  }
  if (contract.sample_number === 8) {
    must(contract.sample_id.endsWith('-corrected'), `${prefix}: corrected ID required`, errors);
    must(components.some((row) => row.id === 'reserved-presenter-region' && row.role === 'non-transferable-context' && row.operator === 'no-rendered-person'), `${prefix}: presenter region must be reserved/not rendered`, errors);
    must(!actions.some((row) => row.target_ids.some((id) => /presenter|person|speaker|avatar|silhouette|figure/u.test(id))), `${prefix}: person target leaked into corrected action scope`, errors);
    must(actions.every((row) => row.source_frame_range.end <= 211 && row.evidence_frames.every((frame) => frame <= 211)) && Math.max(...actions.flatMap((row) => row.evidence_frames)) === 211, `${prefix}: corrected scope must end at F211 with no late action/evidence`, errors);
  }
  if (contract.sample_number === 9) {
    must(contract.sample_id.endsWith('-corrected'), `${prefix}: corrected ID required`, errors);
    must(components.some((row) => row.id === 'stable-phone-shell' && row.operator === 'no-entry-claim'), `${prefix}: phone must already be present/stable`, errors);
    must(actions.some((row) => row.id === 'surface-value-chart-progression' && row.candidate_operator === 'framewise-inside-surface-state'), `${prefix}: inside-surface progression missing`, errors);
    must(!actions.some((row) => /phone.*entry|device.*entry/u.test(row.id) || row.target_ids.some((id) => /presenter|person|speaker|avatar|silhouette|figure/u.test(id))), `${prefix}: false device/person entry claim`, errors);
    must(actions.every((row) => row.source_frame_range.end < 156 && row.evidence_frames.every((frame) => frame < 156)), `${prefix}: post-F155 action/evidence is forbidden`, errors);
    must(contract.forbidden_substitutes.includes('source F156+ montage'), `${prefix}: post-cut montage exclusion missing`, errors);
  }
  return errors;
}

export function validateExclusionObject(contract) {
  const errors = [];
  exactKeys(contract, EXCLUSION_ROOT_KEYS, 'sample10/root', errors);
  exactKeys(contract?.source_binding, ['path','sha256','width','height','fps','audited_window'], 'sample10/source_binding', errors);
  exactKeys(contract?.source_binding?.audited_window, ['start_seconds','end_seconds','start_frame','end_frame'], 'sample10/source_binding/audited_window', errors);
  validateReadinessSchema(contract?.reference_readiness_matrix, 'sample10/reference_readiness_matrix', errors, true);
  for (const [index, item] of (contract?.component_contract ?? []).entries()) exactKeys(item, ['id','role','lifecycle','operator','independently_addressable'], `sample10/component_contract/${index}`, errors);
  must(semanticDigest(contract) === CONTRACT_SEMANTIC_SHA256[10], 'sample10: validator-owned canonical semantic digest mismatch', errors);
  must(contract.schema_version === 2 && contract.sample_number === 10 && contract.sample_id === 'sample-10-source-video-selection-exclusion' && contract.contract_id === 'sample-10-source-video-selection-exclusion-frame-accurate-v02' && contract.review_profile === 'source-video-selection' && contract.transfer_classification === 'excluded-non-motion-sample', 'sample10: exclusion identity/classification mismatch', errors);
  must(contract.status === 'audited-source-video-selection-excluded-from-remotion', 'sample10: exclusion status mismatch', errors);
  must(contract.remotion_probe === null && same(contract.active_grammar_bindings, []) && contract.active_binding_count === 0 && same(contract.action_contract, []) && same(contract.operator_hypotheses, []), 'sample10: Remotion action/probe/grammar must be empty', errors);
  must(contract.component_contract?.length === 1 && contract.component_contract[0].operator === 'source-video-selection', 'sample10: source-video-selection component missing', errors);
  must(contract.source_binding?.path === 'video/qa/reference-study/additional-sources/acquired/0Uxx-UrTVP0.android.mp4' && contract.source_binding?.sha256 === 'ed6839c20bfda2a52346e70bd9cbfa590299fb0a93df884698a6e65c91f5d647' && same(contract.source_binding?.audited_window,{start_seconds:20,end_seconds:80,start_frame:599,end_frame:2398}), 'sample10: canonical source/window mismatch', errors);
  const matrix=contract.reference_readiness_matrix ?? {};
  must(DIMENSIONS.every((key) => Object.hasOwn(matrix, key)), 'sample10: audited nine-dimension matrix incomplete', errors);
  must(typeof matrix.stage === 'string' && matrix.stage.length > 0 && matrix.focal?.component_id === 'selected-source-video' && same(matrix.supporting,[]) && Array.isArray(matrix.depth) && matrix.depth.length > 0 && matrix.entrance?.observed === false && same(matrix.entrance?.action_ids,[]) && typeof matrix.entrance?.note === 'string' && matrix.entrance.note.length > 0 && Array.isArray(matrix.internal_change) && matrix.internal_change.length > 0 && Array.isArray(matrix.transition) && matrix.transition.length > 0 && matrix.hold?.not_applicable_to_remotion_probe === true && Array.isArray(matrix.exclusions) && matrix.exclusions.length > 0, 'sample10: readiness dimension types/semantics invalid', errors);
  must(contract.production_authority === false && contract.production_eligible === false && contract.eligible_for_user_style_frame_review === false && contract.human_reference_calibration_pass === false && contract.grammar_promoted === false, 'sample10: authority flags must stay false', errors);
  return errors;
}

async function verifyArtifact(record, label, root, errors) {
  const file = path.resolve(root, record?.path ?? '');
  must(record?.path && await exists(file), `${label}: artifact missing`, errors);
  if (record?.path && await exists(file)) must(await shaFile(file) === record.sha256, `${label}: artifact hash drift`, errors);
}

export function validateManifestRecord(record) {
  const errors=[];
  exactKeys(record, ['sample_number','sample_id','path','sha256','status'], `${record?.sample_id ?? 'manifest-record'}/manifest-record`, errors);
  const canonical=CANONICAL[record?.sample_number];
  const expectedPath=canonical ? `video/qa/reference-study/frame-accurate-motion-contract-v02/${canonical.id}/contract.json` : null;
  must(record?.sample_number >= 1 && record?.sample_number <= 9 && record?.sample_id === canonical?.id && record?.path === expectedPath, `${record?.sample_id}: manifest record violates canonical number/id/path allowlist`, errors);
  return errors;
}

export function validateManifestObject(manifest) {
  const errors=[];
  exactKeys(manifest, MANIFEST_ROOT_KEYS, 'manifest/root', errors);
  must(semanticDigest(manifest) === MANIFEST_SEMANTIC_SHA256, 'manifest: validator-owned canonical semantic digest mismatch', errors);
  for (const record of manifest?.contracts ?? []) errors.push(...validateManifestRecord(record));
  exactKeys(manifest?.exclusion_contract, ['sample_number','sample_id','path','sha256','status'], 'manifest/exclusion_contract', errors);
  exactKeys(manifest?.upstream, ['corrected_suite'], 'manifest/upstream', errors);
  for (const [name, record] of Object.entries(manifest?.upstream ?? {})) exactKeys(record, ['path','sha256','bytes'], `manifest/upstream/${name}`, errors);
  exactKeys(manifest?.human_approval, ['status','reviewer','marker'], 'manifest/human_approval', errors);
  return errors;
}

export async function validatePackage({packageRoot = DEFAULT_ROOT, root = ROOT, verifyMedia = true} = {}) {
  const errors = [];
  const manifestFile = path.join(packageRoot, 'manifest.json');
  must(await exists(manifestFile), 'manifest missing', errors);
  if (!(await exists(manifestFile))) return errors;
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  errors.push(...validateManifestObject(manifest));
  must(await shaFile(manifestFile) === MANIFEST_FILE_SHA256, 'manifest: validator-owned file hash drift', errors);
  must(manifest.schema_version === 2 && manifest.package_id === 'frame-accurate-motion-contract-v02-corrected-01-10' && manifest.status === 'contracts-complete-pending-human-reference-review', 'manifest identity/status mismatch', errors);
  must(same(manifest.active_motion_sample_numbers, ACTIVE_NUMBERS) && same(manifest.excluded_sample_numbers,[10]) && manifest.active_contract_count === 9 && manifest.exclusion_contract_count === 1, 'manifest active/excluded set mismatch', errors);
  must(manifest.contracts?.length === 9 && same(manifest.contracts.map((row) => row.sample_id), ACTIVE_IDS), 'manifest active contract order/IDs mismatch', errors);
  must(manifest.human_approval?.status === 'pending' && manifest.grammar_promoted === false && manifest.production_authority === false && manifest.production_eligible === false && manifest.eligible_for_user_style_frame_review === false && manifest.active_cut_root === null, 'manifest grants unsafe authority', errors);
  for (const record of manifest.contracts ?? []) {
    const canonical = CANONICAL[record.sample_number];
    errors.push(...validateManifestRecord(record));
    const file = path.resolve(root, record.path);
    must(await exists(file), `${record.sample_id}: contract file missing`, errors);
    if (!(await exists(file))) continue;
    must(await shaFile(file) === record.sha256, `${record.sample_id}: contract hash drift`, errors);
    must(await shaFile(file) === CONTRACT_FILE_SHA256[record.sample_number], `${record.sample_id}: validator-owned contract file hash drift`, errors);
    const contract = JSON.parse(await readFile(file, 'utf8'));
    errors.push(...validateContractObject(contract));
    must(contract.sample_id === record.sample_id && contract.sample_number === record.sample_number, `${record.sample_id}: manifest/contract identity mismatch`, errors);
    must(await shaFile(path.resolve(root, contract.source_binding.path)) === contract.source_binding.sha256, `${record.sample_id}: source hash drift`, errors);
    const expectedPaths = evidencePaths(record.sample_number), media = MEDIA[record.sample_number];
    const expectedHashes = {primary_analysis:media[0],probe:media[1],side_by_side:media[2],mobile_contact:media[3]};
    for (const name of Object.keys(expectedPaths)) {
      const artifactRecord = contract.evidence_binding?.[name];
      must(artifactRecord?.path === expectedPaths[name] && artifactRecord?.sha256 === expectedHashes[name], `${record.sample_id}/${name}: canonical path/hash binding mismatch`, errors);
      if (artifactRecord) await verifyArtifact(artifactRecord, `${record.sample_id}/${name}`, root, errors);
    }
    const extra = EXTRA_EVIDENCE[record.sample_number] ?? {};
    for (const name of ['measured_analysis','operator_hypotheses']) {
      const expected = extra[name] ?? null, artifactRecord = contract.evidence_binding?.[name] ?? null;
      must(expected ? artifactRecord?.path === expected[0] && artifactRecord?.sha256 === expected[1] : artifactRecord === null, `${record.sample_id}/${name}: canonical optional evidence binding mismatch`, errors);
      if (expected && artifactRecord) await verifyArtifact(artifactRecord, `${record.sample_id}/${name}`, root, errors);
    }
    must(contract.evidence_binding?.probe?.action_end_frame === media[4] && contract.evidence_binding?.probe?.hold?.start_frame === media[4] && contract.evidence_binding?.probe?.hold?.minimum_frames >= 60, `${record.sample_id}: canonical probe hold declaration mismatch`, errors);
    if (verifyMedia) {
      const probeFile = path.resolve(root, expectedPaths.probe), sideFile = path.resolve(root, expectedPaths.side_by_side), contactFile = path.resolve(root, expectedPaths.mobile_contact);
      errors.push(...(await validateProbeMedia(probeFile,media[4])).map((message)=>`${record.sample_id}: ${message}`));
      const sideMeta = videoMetadata(sideFile);
      must(sideMeta?.stream?.width > 0 && sideMeta?.stream?.height > 0 && sideMeta.duration > 0 && Number(sideMeta?.stream?.nb_frames) > 0 && decodeVideo(sideFile), `${record.sample_id}: side-by-side must be a positive decodable video`, errors);
      try { const contact = await sharp(contactFile).metadata(); must(contact.width === 360 && contact.height === 203, `${record.sample_id}: contact must decode as 360x203`, errors); } catch { errors.push(`${record.sample_id}: contact image decode failed`); }
    }
  }
  const exclusionRecord = manifest.exclusion_contract;
  const exclusionFile = path.resolve(root, exclusionRecord?.path ?? '');
  must(exclusionRecord?.sample_number === 10 && exclusionRecord?.sample_id === 'sample-10-source-video-selection-exclusion' && exclusionRecord?.path === 'video/qa/reference-study/frame-accurate-motion-contract-v02/sample-10-source-video-selection-exclusion/contract.json' && await exists(exclusionFile), 'sample10 exclusion contract canonical identity/path missing', errors);
  if (await exists(exclusionFile)) {
    must(await shaFile(exclusionFile) === exclusionRecord.sha256, 'sample10 exclusion contract hash drift', errors);
    must(await shaFile(exclusionFile) === CONTRACT_FILE_SHA256[10], 'sample10: validator-owned contract file hash drift', errors);
    const exclusion = JSON.parse(await readFile(exclusionFile, 'utf8'));
    errors.push(...validateExclusionObject(exclusion));
    must(await shaFile(path.resolve(root, exclusion.source_binding.path)) === exclusion.source_binding.sha256, 'sample10 source hash drift', errors);
  }
  must(manifest.upstream?.corrected_suite?.path === 'video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json' && manifest.upstream?.corrected_suite?.sha256 === '4313dba7948ac01da29d1c569c072f9466393ec91f11454f0e6f98ea253d1bb6', 'upstream corrected suite canonical binding mismatch', errors);
  for (const [name, upstreamRecord] of Object.entries(manifest.upstream ?? {})) await verifyArtifact(upstreamRecord, `upstream/${name}`, root, errors);
  return errors;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const errors = await validatePackage({packageRoot: process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT});
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  process.stdout.write('frame-accurate-motion-contract-v02 valid: samples 01-09 active/pending, sample10 source-video exclusion, nine dimensions and hashes closed\n');
}
