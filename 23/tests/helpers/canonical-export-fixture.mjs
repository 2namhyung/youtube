import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const EPISODE='video/episodes/episode-001';
export const FIXTURE_CUT_ROOT='video/public/assets/episode-001-v99';
const SCRIPT=`${EPISODE}/synthetic-script.txt`;
const SOURCE=`${EPISODE}/synthetic-original.png`;
const MATRIX=`${EPISODE}/synthetic-source-matrix.json`;
const LEDGER=`${EPISODE}/synthetic-materialization.json`;
const NARRATION='원본 사진입니다.';
export const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');

function childEnvironment(){
  // No credentials, .env, provider configuration or real VisualMaker data are inherited.
  const env={};
  for(const name of ['Path','PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
  return env;
}

function contained(root,relative){
  assert.equal(path.isAbsolute(relative),false);
  const target=path.resolve(root,relative);
  assert.ok(target.startsWith(root+path.sep),'fixture writes must remain inside its exact Temp root');
  return target;
}

function copyScriptClosure(fixture,seeds){
  const queue=[...seeds],seen=new Set();
  while(queue.length){
    const relative=queue.shift();if(seen.has(relative))continue;seen.add(relative);
    const source=contained(REPO,relative),bytes=readFileSync(source),target=contained(fixture.root,relative);
    assert.ok(bytes.length<2_000_000,`unexpectedly large source ${relative}`);
    mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target);
    fixture.proof.unchangedCode.push({path:relative,sha256:hash(bytes)});
    if(!/\.[cm]?[jt]sx?$/u.test(relative))continue;
    const text=bytes.toString('utf8');
    for(const match of text.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.[^'"]+)['"]/gu)){
      const requested=path.resolve(path.dirname(source),match[1]);
      const candidates=/\.[cm]?[jt]sx?$/u.test(match[1])?[requested]:['.ts','.tsx','.mjs','.js','/index.ts','/index.tsx'].map(suffix=>requested+suffix);
      const resolved=candidates.find(file=>existsSync(file));if(!resolved)continue;
      const dependency=path.relative(REPO,resolved).replaceAll('\\','/');
      if(dependency.startsWith('video/src/generated/'))continue; // Real generator supplies this file later.
      assert.ok(!dependency.startsWith('../'));queue.push(dependency);
    }
  }
}

export function runFixtureGate(fixture,binary,args,{allowFailure=false}={}){
  const result=spawnSync(binary,args,{cwd:fixture.root,env:childEnvironment(),encoding:'utf8',windowsHide:true,shell:false,timeout:600_000,maxBuffer:4_000_000});
  const record={command:[binary,...args],cwd:fixture.root,status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',error:result.error?.message??null};
  fixture.proof.commands.push(record);fixture.saveProof();
  if(!allowFailure)assert.equal(result.status,0,`${args[0]} failed; evidence: ${fixture.proofPath}\n${record.stdout}\n${record.stderr}`);
  return record;
}

export function createCanonicalExportFixture(){
  const temporaryParent=realpathSync(os.tmpdir());
  const root=realpathSync(mkdtempSync(path.join(temporaryParent,'vm-canonical-export-')));
  assert.equal(path.dirname(root),temporaryParent);
  const fixture={root,proofPath:path.join(root,'technical-proof.json'),proof:{scope:'synthetic technical fixture; no genuine human approval or real episode output',achieved:[],unchangedCode:[],commands:[]}};
  fixture.put=(relative,bytes)=>{const target=contained(root,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes);return target;};
  fixture.putJson=(relative,value)=>fixture.put(relative,json(value));
  fixture.saveProof=()=>writeFileSync(fixture.proofPath,json(fixture.proof));
  fixture.cleanup=()=>{
    assert.equal(realpathSync(root),root);assert.equal(path.dirname(root),temporaryParent);assert.match(path.basename(root),/^vm-canonical-export-/u);
    // Remove the explicitly created dependency junction first; never recursively traverse its target.
    const dependencies=path.join(root,'node_modules');if(existsSync(dependencies)){assert.equal(lstatSync(dependencies).isSymbolicLink(),true);unlinkSync(dependencies);}
    rmSync(root,{recursive:true,force:true});
  };
  copyScriptClosure(fixture,[
    'video/scripts/generate-episode-001-plans.mjs',
    'video/scripts/validate-episode-spec.mjs',
    'video/scripts/validate-production-stage.mjs',
    'video/scripts/validate-narration-plan.mjs',
    'video/scripts/generate-render-catalog.mjs',
    'video/scripts/validate-render-authority.mjs',
    'video/scripts/validate-cut-assets.mjs',
    'video/scripts/validate-cut-visual-states.mjs',
    'video/src/production-index.tsx',
    'video/src/cut-manifest.ts','video/src/motion.tsx',
    'video/src/vox/scene/ManifestScene.tsx','video/src/vox/scene/PresentationScene.tsx',
    'video/src/vox/scene/presentation-runtime.ts','video/src/vox/scene/asset-sheet.ts',
    'video/src/vox/scene/model.ts','video/src/vox/scene/source-video.ts',
    'video/src/vox/motion/operator-registry.ts','video/src/vox/motion/presets.ts',
    'video/src/vox/collage/index.tsx','video/src/vox/charts/index.tsx','video/src/vox/charts/model.ts',
    'video/src/vox/scene/TransitionPair.tsx','video/src/vox/scene/EpisodeTimeline.tsx',
    'tests/helpers/canonical-export-child.mjs',
    'visualmaker/core/jobs.ts','visualmaker/renderer/episode-runner.ts',
    'visualmaker/renderer/audio-assembly-runner.ts',
    'visualmaker/worker.ts','visualmaker/renderer/finalization-runner.ts',
    'src/app/api/studio/finalization/route.ts','src/app/api/studio/jobs/route.ts',
    'src/app/api/studio/jobs/export-media/route.ts',
  ]);
  // Dependency access is explicit and read-only; no production input is linked.
  symlinkSync(realpathSync(path.join(REPO,'node_modules')),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  fixture.proof.dependencyAccess={path:'node_modules',target:realpathSync(path.join(REPO,'node_modules')),purpose:'read-only installed packages; no install'};
  for(const relative of ['package.json','video/src/index.tsx','video/src/episode-001-media.ts','video/contracts/asset-sheet.schema.json','video/contracts/production-authoring-contract-v1.json']){
    fixture.put(relative,readFileSync(path.join(REPO,relative)));
  }
  fixture.saveProof();return fixture;
}

export function prepareCanonicalExportInputs(fixture){
  const voiceFrames=Math.ceil(NARRATION.replace(/\s/gu,'').length/4.965*30),duration=voiceFrames+60;
  fixture.put(SCRIPT,Buffer.from(NARRATION+'\n'));
  const sourceFile=contained(fixture.root,SOURCE);mkdirSync(path.dirname(sourceFile),{recursive:true});
  runFixtureGate(fixture,'ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x325c85:s=640x360','-vf','drawbox=x=100:y=70:w=180:h=200:color=0xe4b564:t=fill','-frames:v','1','-update','1',sourceFile]);
  const template=contained(fixture.root,'video/public/assets/_cut-template/background.png');mkdirSync(path.dirname(template),{recursive:true});
  runFixtureGate(fixture,'ffmpeg',['-v','error','-f','lavfi','-i','color=c=0xe9e2d2:s=1920x1080','-frames:v','1','-update','1',template]);
  const sourceBytes=readFileSync(sourceFile),sourceSha=hash(sourceBytes);
  const audioFile=fixture.put('video/source-intake/episode-001/narration/final/SH001.wav',Buffer.alloc(0));
  runFixtureGate(fixture,'ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(voiceFrames/30),'-ac','2','-c:a','pcm_s16le',audioFile]);
  const localAsset='source-photo/synthetic-original.png',assetId='synthetic-photo',sourceId='SYNTHETIC-TECHNICAL-SOURCE';
  const source={file:localAsset,sha256:sourceSha,bytes:sourceBytes.length,mime_type:'image/png',original_url:'https://example.invalid/synthetic-technical-source',license:'CC0',attribution:'Synthetic fixture author. Generated test pixels, not an external photo or evidence.'};
  const entry={media_asset_id:1,source_id:sourceId,review_state:'approved',route:'source',source,derivatives:[],test_only:true};
  fixture.put(`${FIXTURE_CUT_ROOT}/cuts/SH001/${localAsset}`,sourceBytes);
  fixture.putJson(LEDGER,{test_only:true,notice:'Synthetic approval records test machinery only.',source_asset_materializations:[entry]});
  const requirement={requirement_id:'synthetic-photo-requirement',kind:'source-original',asset_id:assetId,source_id:sourceId,status:'approved',approved_media_asset_id:1,materialization_record_path:LEDGER,approved_source:{original_url:source.original_url,license:source.license,sha256:sourceSha},rights_lane:'green-item-license-verified',candidate_source_path:SOURCE,candidate_sha256:sourceSha,creator:source.attribution,license:source.license,item_url:source.original_url,production_use:'context-only; never evidence or a depiction of the hypothetical crime'};
  const purpose='원본 사진의 중심 사물을 보여준다';
  const beat={beat_id:'SH001-context',purpose,viewer_takeaway:NARRATION,narration_window:{start_frame:0,end_frame_exclusive:duration},presentation:{focal:{component_id:'photo'},supporting:[],hidden:[],layout_template:'experience-hero'},component_visibility:[{component_id:'photo',states:[{state:'entering',start_frame:1,end_frame_exclusive:12},{state:'focused',start_frame:12,end_frame_exclusive:duration}]}],stable_reading_hold:{start_frame:duration-60,end_frame_exclusive:duration,frames:60},planned_operators:[{action_id:'photo-reframe',operator_id:'transform.tween@1',target_component_id:'photo',parameters:{from_scale:1.08,to_scale:1},required_capability:'layer-transform',action_semantic:'compare-state',observable_change:`${purpose}: 사진의 확대 상태가 전체 사물 보기로 정착한다`,start_frame:1,end_frame_exclusive:12,status:'planned-not-implemented'}],preview_status:'ready'};
  const cut={shot_id:'SH001',production_mode:'source-photo',production_authority:false,draft_narration:NARRATION,visual_purpose:purpose,visual_action:purpose,viewer_takeaway:NARRATION,source_need_taxonomy:'document-workflow',source_ids:[sourceId],usage_layer:'real-context',estimated_voice_seconds:voiceFrames/30,pre_roll_frames:0,post_hold_frames:60,transition_overlap_frames:0,duration_frames:duration,master_occupancy_frames:duration,timing:{provisional_duration_frames:duration,master_occupancy_frames:duration,reading_hold_frames:60},media_strategy:{dominant_surface:'full-frame-real-source'},acquisition:{candidate_status:'source-selected-test-only'},candidate_selection:{status:'source-selected-test-only',candidate_ids:[sourceId],rights_approval:false,production_visible:false},production_decision:{version:1,mode:'source-photo',purpose:'real-context',reason:'정지 원본 사물의 형태를 보여주는 테스트',visible_subject:'synthetic test object',observable_action:'원본 사물로 화면이 정착한다',rejected_modes:{live_action:'Movement is unnecessary for this static subject.',motion_graphics:'An exact relationship diagram is unnecessary.',omni:'Fictional continuity is unnecessary.'},asset_search_briefs:[{brief_id:'synthetic-object',subject:'generic object',action:'static view',role:'full-frame',specificity:'generic-object',queries_ko:['사물 정면'],queries_en:['object front view'],provider_routes:['WIKIMEDIA-COMMONS'],exclusions:['readable text']}]},requirements:[requirement],components:[{component_id:'photo',asset_requirement_id:requirement.requirement_id,semantic_role:'primary',render_kind:'asset',compositing:'single-flattened-source-surface',motion_expectation:'transform',atomicity:'independent-asset',presentation_slot:'hero',implementation_status:'planned-not-implemented'}],visual_beats:[beat],presentation:{focal:'photo',supporting:[],hidden_until:[]},document_contract:null,designed_assets:[],transparent_derivatives:[],evidence_originals:[],imagegen_assets:[],missing_inputs:[],fallback:null,transition:{type:'cut',intent:'End after stable source viewing.',duration_frames:0,next_shot_id:null},typography_surface_contract_version:2,layout_contract_version:2,layout_contract:{version:2},text_surfaces:[],internal_presentation_segments:[{segment_index:0,kind:'photo-hold',start_frame:0,end_frame_exclusive:duration,output_frames:duration,source_id:sourceId,source_sha256:sourceSha,source_path:SOURCE,source_width:640,source_height:360,hold_frames:duration,hold_seconds:duration/30,treatment:'Source reframe followed by stable hold.',crop_normalized:{x:0,y:0,width:1,height:1}}]};
  const matrix={production_authority:false,user_source_pass:false,summary:{cuts_total:1},green_inventory:[{id:sourceId,path:SOURCE,sha256:sourceSha,width:640,height:360,media_type:'photo',license:'CC0',commercial_use_allowed:true,derivative_use_allowed:true,test_only:true}],cuts:[{cut_id:'SH001',narration:NARRATION,production_mode:'source-photo',source_need_taxonomy:cut.source_need_taxonomy}]};
  const matrixBytes=json(matrix);fixture.put(MATRIX,matrixBytes);
  const scriptSha=hash(readFileSync(contained(fixture.root,SCRIPT)));
  const spec={schema_version:1,authority:'sole-manually-edited-episode-authority',episode_id:'episode-001',title:'Synthetic canonical export technical fixture',status:'approved-script-narrative-source-first-plan',generated_compatibility_outputs:['./narration-plan.json','./cut-plan.json','./cut-source-design.json','./generated/manifest-contracts.json'],narration_contract:{schema_version:1,episode_id:'episode-001',fps:30,draft_timing_assumption:{compact_korean_chars_per_second:4.965},audio_policy:{scratch_dir:'video/source-intake/episode-001/narration/scratch',final_dir:'video/source-intake/episode-001/narration/final',supported_extensions:['.wav'],file_pattern:'SH###.<extension>'}},timing_authority:{fps:30,compact_korean_chars_per_second:4.965,provisional_master_frames:duration,provisional_master_seconds:duration/30,target_seconds:[duration/30,duration/30]},background_contract:{required_per_cut:'source-photo'},intro_rules:{},intro_source_candidates:[],route_catalog:{'IMAGEGEN-OMNI':'모든 계획 컷의 개별 사용자 PASS 뒤에만 생성'},global_derivative_policy:{source_copy:'byte-identical'},production_gates:['Synthetic technical fixture approvals only.'],editorial_revision:{id:'ep001-narrative-source-first-v3',status:'source-selected-editorial-plan',production_authority:false,cut_count:1,mode_counts:{'source-photo':1},approved_script_source:SCRIPT,source_review:MATRIX,source_review_sha256:hash(matrixBytes),source_review_status:'completed',source_selection_status:'completed',fictional_continuity:{cut_ids:[]}},editorial_visual_policy:{source_acquisition_matrix:MATRIX,source_acquisition_matrix_sha256:hash(matrixBytes),source_acquisition_matrix_status:'completed'},script_lock:{source_path:SCRIPT,source_sha256:scriptSha,narration_sha256:hash(NARRATION.replace(/\s/gu,'')),compact_character_count:NARRATION.replace(/\s/gu,'').length,status:'locked',reviewer:'user',test_only:true},production_routing_policy:{version:1,missing_source_changes_mode:false,source_diversity_unit:'original-sha256-and-semantic-subject'},post_lock_output:{version:1,addendum_path:`${EPISODE}/post-lock-addendum.json`},cuts:[cut]};
  spec.narration_contract.draft_compact_character_target={min:NARRATION.replace(/\s/gu,'').length,max:NARRATION.replace(/\s/gu,'').length};
  fixture.putJson(`${EPISODE}/episode-spec.json`,spec);
  fixture.putJson(`${EPISODE}/production-state.json`,{schema_version:1,episode_id:'episode-001',stage:'audio-timed-assembly',expected_cut_count:1,active_cut_root:FIXTURE_CUT_ROOT,production_authority:false,draft_inputs:{temporary_script_available:true,narration_plan:`${EPISODE}/narration-plan.json`},render_authority:{cut_root:null},picture_lock:{status:'pending',approved:false,final_qc_marker:null},cut_review:{all_cuts_passed:false,approval_marker:null},omni_video_generation:{status:'blocked_until_all_cuts_passed',allowed_after_marker:null},provisional_artifacts:{}});
  runFixtureGate(fixture,process.execPath,['video/scripts/generate-episode-001-plans.mjs']);
  fixture.putJson('fixture-authoring-input.json',{source,entry,voiceFrames,duration,cutRoot:FIXTURE_CUT_ROOT,narration:NARRATION});
  fixture.proof.achieved.push('Unchanged normal generator created all four canonical outputs from an explicit one-cut source-selected v3 spec.','Real PNG and audible stereo WAV created; explicit synthetic source/rights/materialization ledger is preserved in generated requirements.');
  fixture.proof.notYetAttempted=['active manifest implementation and cut review','normal audio enqueue/claim/execute','picture transition','finalization evaluator/FFmpeg export'];
  fixture.saveProof();return {spec,source,entry,voiceFrames,duration};
}
