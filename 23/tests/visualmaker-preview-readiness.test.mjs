import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlan,applyCommand,validatePlan} from '../visualmaker/core/director.ts';
import {buildPreviewReadiness,readPreviewPlan} from '../visualmaker/core/preview-readiness.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {guard,studioToken} from '../visualmaker/core/http.ts';

const hash=value=>createHash('sha256').update(value).digest('hex');
const temp=()=>process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-preview-readiness-'));
const selected=plan=>applyCommand(plan,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
const has=(scene,code)=>scene.blockers.some(blocker=>blocker.code===code);
function asset(mediaType='image',extra={}){const bytes=Buffer.from(randomUUID());const sha256=hash(bytes);return {id:`asset_${randomUUID()}`,originalName:'fixture',mediaType,path:`assets/${sha256}.${mediaType==='video'?'mp4':mediaType==='data'?'txt':'png'}`,sha256,mimeType:mediaType==='video'?'video/mp4':mediaType==='data'?'text/plain':'image/png',width:10,height:10,durationSeconds:mediaType==='video'?2:null,sourceUrl:'https://example.org',creator:'fixture',rightsNote:'test',semanticNote:'fixture',status:'pending-review',evidenceOnly:false,...extra};}

test('unselected scenes disclose direction blocker and never count alternatives as chosen',()=>{
  const plan=createPlan('unselected','첫 자료를 확인합니다.');const original=JSON.stringify(plan);
  const report=buildPreviewReadiness(plan,()=>null);const scene=report.scenes[0];
  assert.equal(JSON.stringify(plan),original);assert.equal(report.snapshotSha256,hash(original));
  assert.equal(scene.selectedCandidateId,null);assert.equal(scene.mode,null);assert.deepEqual(scene.requirements,[]);
  assert.ok(has(scene,'direction-not-selected'));assert.ok(has(scene,'renderer-not-implemented'));assert.ok(has(scene,'production-contract-not-bound'));
  assert.deepEqual([report.productionAuthority,report.renderEligible,report.previewExists,report.eligibleForCutReview],[false,false,false,false]);
  assert.equal(report.selectedAssignedOriginalSha256Count,0);assert.equal(report.verifiedLocalOriginalSha256Count,0);
  const chosen=selected(plan);const missing=buildPreviewReadiness(chosen,()=>null).scenes[0];
  assert.ok(has(missing,'requirement-unassigned'));assert.ok(has(missing,'source-observation-missing'));
});

test('only the selected candidate requirements are evaluated; accepted observations are current-hash bound',()=>{
  let plan=selected(createPlan('selected','사진의 대상과 맥락입니다.'));
  const scene=plan.scenes[0];const selectedReq=scene.candidates[0].requirementIds[0];const alternativeReq=scene.candidates[1].requirementIds[0];
  plan=applyCommand(plan,{type:'attach-asset',requirementId:selectedReq,asset:asset()});
  for(const dimension of ['source','rights','semantic'])plan=applyCommand(plan,{type:'review-source',requirementId:selectedReq,dimension,decision:'acceptable',rationale:'작업용 관찰'});
  let report=buildPreviewReadiness(plan,()=>null);let row=report.scenes[0];
  assert.deepEqual(row.requirements.map(item=>item.requirementId),[selectedReq]);
  assert.equal(row.selectedAssignedOriginalSha256Count,1);assert.equal(row.verifiedLocalOriginalSha256Count,1);
  assert.ok(!row.blockers.some(item=>item.requirementId===alternativeReq));
  assert.ok(!row.blockers.some(item=>item.code.includes('observation')));
  plan=applyCommand(plan,{type:'edit-candidate',sceneId:scene.id,candidateId:scene.candidates[0].id,changes:{reason:'설명 맥락 변경'}});
  report=buildPreviewReadiness(plan,()=>null);row=report.scenes[0];
  assert.ok(has(row,'source-observation-pending'));assert.ok(has(row,'rights-observation-pending'));assert.ok(has(row,'semantic-observation-pending'));
  assert.equal(row.requirements[0].observations.source,'pending');
});

test('visual evidence-only, wrong type, image/video dimensions and data evidence have distinct blockers',()=>{
  const photo=selected(createPlan('photo','사진의 맥락을 보여줍니다.'));
  const req=photo.requirements[0];const evidence=asset('image',{evidenceOnly:true,width:null,height:null});
  const synthetic={...photo,assets:[evidence],requirements:photo.requirements.map(item=>item.id===req.id?{...item,assetId:evidence.id}:item)};
  const scene=buildPreviewReadiness(synthetic,()=>null).scenes[0];
  assert.ok(has(scene,'evidence-only-visual'));assert.ok(has(scene,'invalid-image-dimensions'));
  const wrong={...evidence,mediaType:'video',width:10,height:10,durationSeconds:1};
  const wrongScene=buildPreviewReadiness({...synthetic,assets:[wrong]},()=>null).scenes[0];
  assert.ok(has(wrongScene,'media-type-mismatch'));
  let video=selected(createPlan('video','사람이 문을 열고 이동합니다.'));
  const videoReq=video.requirements.find(item=>item.id===video.scenes[0].candidates[0].requirementIds[0]);
  assert.equal(videoReq.mediaType,'video');
  const short=asset('video',{width:null,height:null,durationSeconds:0});
  video={...video,assets:[short],requirements:video.requirements.map(item=>item.id===videoReq.id?{...item,assetId:short.id}:item)};
  assert.ok(has(buildPreviewReadiness(video,()=>null).scenes[0],'invalid-video-dimensions'));
  assert.ok(has(buildPreviewReadiness(video,()=>null).scenes[0],'invalid-video-duration'));
  const offCanvas={...video,requirements:video.requirements.map(item=>item.id===videoReq.id?{...item,epistemicRole:'evidence'}:item)};
  assert.ok(!has(buildPreviewReadiness(offCanvas,()=>null).scenes[0],'invalid-video-dimensions'));
  let remotion=selected(createPlan('data','두 가지 조건을 비교합니다.'));
  const dataReq=remotion.requirements.find(item=>item.mediaType==='data');assert.ok(dataReq);
  const evidenceData=asset('data',{width:null,height:null,durationSeconds:null,evidenceOnly:true});
  remotion={...remotion,assets:[evidenceData],requirements:remotion.requirements.map(item=>item.id===dataReq.id?{...item,assetId:evidenceData.id}:item)};
  const dataRow=buildPreviewReadiness(remotion,()=>null).scenes[0].requirements.find(item=>item.requirementId===dataReq.id);
  assert.equal(dataRow.visibleInput,false);assert.equal(dataRow.localIntegrity,'verified');
  assert.ok(!buildPreviewReadiness(remotion,()=>null).scenes[0].blockers.some(item=>item.requirementId===dataReq.id&&['evidence-only-visual','invalid-image-dimensions','invalid-video-dimensions'].includes(item.code)));
  assert.ok(has(buildPreviewReadiness(remotion,()=>null).scenes[0],'grammar-unverified'));
});

test('missing and changed bytes and receipts produce safe blockers without leaking paths',()=>{
  const root=temp();mkdirSync(path.join(root,'assets'));mkdirSync(path.join(root,'receipts'));
  let plan=selected(createPlan('bytes','대상의 사진과 맥락입니다.'));
  const bytes=Buffer.from('synthetic picture fixture');const fixture=asset('image',{sha256:hash(bytes),path:`assets/${hash(bytes)}.png`});
  plan=applyCommand(plan,{type:'attach-asset',requirementId:plan.requirements[0].id,asset:fixture});
  let result=buildPreviewReadiness(plan);assert.ok(has(result.scenes[0],'asset-file-missing'));assert.equal(result.scenes[0].requirements[0].localIntegrity,'invalid');
  const location=path.join(root,fixture.path);writeFileSync(location,Buffer.from('changed'));
  result=buildPreviewReadiness(plan);assert.ok(has(result.scenes[0],'asset-hash-mismatch'));
  writeFileSync(location,bytes);result=buildPreviewReadiness(plan);assert.ok(has(result.scenes[0],'asset-receipt-invalid'));
  writeFileSync(path.join(root,'receipts',`${fixture.id}.json`),JSON.stringify(fixture));
  result=buildPreviewReadiness(plan);assert.equal(result.scenes[0].requirements[0].localIntegrity,'verified');
  assert.equal(result.verifiedLocalOriginalSha256Count,1);
  assert.ok(!JSON.stringify(result).includes(root));
});

test('shared source SHA is counted once and narration absence never blocks provisional design',()=>{
  let plan=createPlan('shared','첫 대상의 맥락입니다.\n\n둘째 대상의 맥락입니다.');
  const original=asset();const first=plan.scenes[0].candidates[0].requirementIds[0];const second=plan.scenes[1].candidates[0].requirementIds[0];
  plan=applyCommand(plan,{type:'attach-asset',requirementId:first,asset:original});
  plan=applyCommand(plan,{type:'assign-asset',requirementId:second,assetId:original.id});
  for(const scene of plan.scenes)plan=applyCommand(plan,{type:'select',sceneId:scene.id,candidateId:scene.candidates[0].id});
  const report=buildPreviewReadiness(plan,()=>null);
  assert.equal(report.selectedAssignedOriginalSha256Count,1);assert.equal(report.verifiedLocalOriginalSha256Count,1);
  assert.ok(report.scenes.every(scene=>scene.selectedAssignedOriginalSha256Count===1));
  assert.ok(!JSON.stringify(report).includes('narration-missing'));
  assert.ok(report.scenes.every(scene=>scene.timingStatus==='estimated'));
});

test('read-only current plan rejects stale revisions, and guard rejects missing token',()=>{
  temp();const plan=insertProject(createPlan('api','한 문장의 장면입니다.'));
  const before=readPreviewPlan(plan.id,plan.revision);assert.deepEqual(before,validatePlan(plan));
  assert.throws(()=>readPreviewPlan(plan.id,0),error=>error.status===409);
  updateProject(plan.id,plan.revision,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
  assert.throws(()=>readPreviewPlan(plan.id,plan.revision),error=>error.status===409);
  assert.throws(()=>readPreviewPlan(plan.id,1.5),error=>error.status===400);
  const url='http://127.0.0.1:8138/api/studio/preview-readiness?id='+encodeURIComponent(plan.id)+'&baseRevision=2';
  assert.throws(()=>guard(new Request(url,{headers:{host:'127.0.0.1:8138'}})),error=>error.status===403);
  assert.doesNotThrow(()=>guard(new Request(url,{headers:{host:'127.0.0.1:8138','x-visualmaker-token':studioToken()}})));
});
