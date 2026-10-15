import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {MockLanguageModelV4} from 'ai/test';
import sharp from 'sharp';
import {applyCommand,createPlan} from '../visualmaker/core/director.ts';
import {createTestAnalysisAdapter} from '../visualmaker/core/ai-analysis.ts';
import {enqueueAIAnalysis,executeAIAnalysisClaim,readAIProposal} from '../visualmaker/core/ai-analysis-job.ts';
import {claimJob} from '../visualmaker/core/jobs.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {POST as postAdoption} from '../src/app/api/studio/ai-analysis-adoption/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {currentAIProposal} from '../src/components/studio/ai-analysis-client.ts';
import {analysisAdoptionRows,createImmediateGate,currentAIAdoptionResponse,newAIAdoptionRequest,submitAIAdoption}
  from '../src/components/studio/ai-analysis-adoption-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const config={enabled:'1',cliPath:process.execPath,modelId:'codex/test-analyzer'};
const input=plan=>({projectId:plan.id,baseRevision:plan.revision,idempotencyKey:'ui-adoption-source',
  expectedModelId:'codex/test-analyzer',externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:2048,timeoutMs:1000});
const record=segment=>({segmentId:segment.id,mainMessage:`검토한 메시지 ${segment.text}`,uncertainty:'원문 사실 확인',
  visualMeaningBrief:'화면의 대상 확인',searchBriefKo:'한국어 원본 검색',searchBriefEn:'English original search'});
const reply=plan=>({content:[{type:'text',text:JSON.stringify({records:plan.script.segments.map(record)})}],
  finishReason:{unified:'stop',raw:undefined},usage:{inputTokens:{total:9,noCache:9,cacheRead:undefined,cacheWrite:undefined},
    outputTokens:{total:15,text:15,reasoning:undefined}},warnings:[]});
function fixture(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-ui-'));
  return insertProject(createPlan('UI 반영', '첫 문장입니다.\n\n두 번째 문장입니다.\n\n세 번째 문장입니다.'));}
async function success(plan){
  const queued=enqueueAIAnalysis(input(plan),config),claimed=claimJob(queued.jobId);let calls=0;
  const model=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{calls++;return reply(plan);}}),'codex/test-analyzer');
  const done=await executeAIAnalysisClaim(queued.jobId,claimed.token,claimed.snapshot,config,model);
  assert.equal(done.status,'succeeded');assert.equal(calls,1);
  const response=readAIProposal(plan.id,plan.revision,done.id);
  const proposal=await currentAIProposal(response,response.job,plan);
  assert.ok(proposal);
  return {job:response.job,proposal,calls};
}
function scope(plan,token='test-token'){return {projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,token};}
const serverFetch=async(_url,options)=>postAdoption(new Request('http://127.0.0.1:3000/api/studio/ai-analysis-adoption',{
  method:'POST',headers:{host:'127.0.0.1:3000','content-type':'application/json','x-visualmaker-token':studioToken()},body:options.body}));

test('real synthetic result: individual eligible rows, proposal-order subset, one verified saved Plan and receipt',async()=>{
  let plan=fixture();const last=plan.scenes[2];
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:last.id,candidateId:last.candidates[0].id});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:last.id,locked:true});
  const {job,proposal,calls}=await success(plan),rows=analysisAdoptionRows(plan,proposal);
  assert.deepEqual(rows.map(row=>!!row.reason),[false,false,true]);
  const segmentIds=plan.script.segments.map(segment=>segment.id);
  assert.equal(await newAIAdoptionRequest(plan,proposal,job,[segmentIds[0]],false),null);
  assert.equal(await newAIAdoptionRequest(plan,proposal,job,[segmentIds[0],segmentIds[2]],true),null);
  const request=await newAIAdoptionRequest(plan,proposal,job,[segmentIds[1],segmentIds[0]],true);
  assert.deepEqual(request?.segmentIds,segmentIds.slice(0,2));
  assert.deepEqual(Object.keys(request).sort(),['projectId','baseRevision','jobId','expectedArtifactSha256',
    'segmentIds','confirmDirectionReset'].sort());
  const value=await submitAIAdoption(request,studioToken(),new AbortController().signal,serverFetch);
  const saved=await currentAIAdoptionResponse(value,plan,job,proposal,request,scope(plan),scope(plan));
  assert.ok(saved);assert.equal(saved.plan.revision,plan.revision+1);
  assert.deepEqual(saved.adoption.records.map(item=>item.segmentId),segmentIds.slice(0,2));
  assert.deepEqual(saved.adoption.records[0].source,proposal.records[0].source);
  assert.equal(saved.adoption.records[0].beforeIntent,plan.beats[0].intent);
  assert.equal(saved.adoption.records[0].appliedIntent,proposal.records[0].mainMessage);
  assert.equal(saved.adoption.records[0].searchBriefEn,proposal.records[0].searchBriefEn);
  assert.equal(calls,1,'adoption did not start a second model call');
});

test('client rejects altered source, all original notes, provenance, scope and unauthorized Plan deltas',async()=>{
  const plan=fixture(),{job,proposal}=await success(plan);
  const request=await newAIAdoptionRequest(plan,proposal,job,[plan.script.segments[0].id],true);
  const response=await submitAIAdoption(request,studioToken(),new AbortController().signal,serverFetch);
  const valid=(value,current=scope(plan))=>currentAIAdoptionResponse(value,plan,job,proposal,request,scope(plan),current);
  assert.ok(await valid(response));
  for(const change of [
    data=>{data.adoption.records[0].mainMessage='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].uncertainty='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].visualMeaningBrief='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].searchBriefKo='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].searchBriefEn='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].source.text='위조';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.artifactSha256='f'.repeat(64);data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.scope.snapshotSha256='f'.repeat(64);data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.model.requestedModelId='other/model';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].beatId='beat-unknown';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].sceneId='scene-unknown';data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.records[0].source.start+=1;data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.adoption.productionAuthority=true;data.plan.aiAnalysisAdoption=clone(data.adoption);},
    data=>{data.plan.productionAuthority=true;},
    data=>{data.plan.script.rawText='변조';},
    data=>{data.plan.scenes[1].locked=true;},
    data=>{data.plan.assets.push({id:'injected'});},
    data=>{data.plan.beats[1].intent='비선택 변조';},
    data=>{data.plan.scenes[0].estimatedSeconds+=1;},
    data=>{data.plan.scenes[0].candidates[0].grammarStatus='approved';},
    data=>{data.plan.scenes[0].candidates[0].mode='omni';},
    data=>{data.plan.scenes[0].candidates[0].label='위조';},
    data=>{data.plan.scenes[0].candidates[0].reason='위조';},
    data=>{data.plan.scenes[0].candidates[0].rejectedModes=['위조'];},
    data=>{data.plan.scenes[0].candidates[0].startState='위조';},
    data=>{data.plan.scenes[0].candidates[0].change='위조';},
    data=>{data.plan.scenes[0].candidates[0].endState='위조';},
    data=>{data.plan.scenes[0].candidates[0].layers[0].description='위조';},
    data=>{data.plan.requirements[0].assetId='forged';},
    data=>{data.plan.requirements[0].description='위조';},
    data=>{data.plan.requirements[0].mediaType='video';},
    data=>{data.plan.requirements[0].acquisition='official';},
    data=>{data.plan.requirements[0].queryKo='위조';},
    data=>{data.plan.requirements[0]=null;},
  ]){const damaged=clone(response);change(damaged);assert.equal(await valid(damaged),null);}
  assert.equal(await valid(response,{...scope(plan),revision:plan.revision+1}),null);
  assert.equal(await valid(response,{...scope(plan),token:'changed'}),null);
  assert.equal(await valid(response,{...scope(plan),scriptSha256:sha('changed')}),null);
});

test('merged mapping is unavailable; immediate gate and uncertain transport prevent rapid duplicate submission',async()=>{
  let plan=fixture();plan=updateProject(plan.id,plan.revision,{type:'merge-next',sceneId:plan.scenes[0].id});
  const {job,proposal}=await success(plan),rows=analysisAdoptionRows(plan,proposal);
  assert.equal(rows[0].reason!==null,true);
  assert.equal(await newAIAdoptionRequest(plan,proposal,job,[plan.script.segments[0].id],true),null);
  const request=await newAIAdoptionRequest(plan,proposal,job,[plan.script.segments[2].id],true);
  assert.ok(request);
  const gate=createImmediateGate(),ticket=gate.acquire();assert.ok(ticket);assert.equal(gate.acquire(),null);
  gate.release(Symbol('wrong'));assert.equal(gate.isActive(),true);
  let attempts=0;
  const uncertain=async()=>{attempts++;throw new TypeError('connection lost after send');};
  await assert.rejects(submitAIAdoption(request,'token',new AbortController().signal,uncertain),/connection lost/);
  assert.equal(attempts,1);assert.equal(gate.acquire(),null,'uncertain result keeps the synchronous action boundary until caller releases');
  gate.release(ticket);assert.equal(gate.isActive(),false);assert.ok(gate.acquire());
});

test('browser draft projection matches real server candidates and requirements for all four production-mode families',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-ui-'));
  const plan=insertProject(createPlan('역할별 초안',
    '바닷가의 배경을 소개합니다.\n\n인물이 걷는 장면을 설명합니다.\n\n두 값의 차이를 비교합니다.\n\n가상 사례를 이야기합니다.'));
  assert.deepEqual(plan.beats.map(beat=>beat.role),['context','action','comparison','fiction']);
  const {job,proposal}=await success(plan),request=await newAIAdoptionRequest(plan,proposal,job,
    plan.script.segments.map(segment=>segment.id),true);
  const response=await submitAIAdoption(request,studioToken(),new AbortController().signal,serverFetch);
  const saved=await currentAIAdoptionResponse(response,plan,job,proposal,request,scope(plan),scope(plan));
  assert.ok(saved);assert.deepEqual(saved.plan.scenes.map(scene=>scene.candidates[0].mode),
    ['source-photo','source-video','remotion','omni']);
});

test('asset-bound shared requirement generates exact pending reviews even when its remaining owner is unselected',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-shared-'));process.env.VISUALMAKER_DATA_DIR=root;
  let plan=createPlan('공유 자료', '첫 대상의 맥락입니다.\n\n둘째 대상의 맥락입니다.');
  const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
  const digest=sha(bytes),asset={id:`asset_${randomUUID()}`,originalName:'synthetic.png',mediaType:'image',
    path:`assets/${digest}.png`,sha256:digest,mimeType:'image/png',width:2,height:2,durationSeconds:null,
    sourceUrl:'https://example.org/synthetic',creator:'Synthetic fixture',rightsNote:'Synthetic fixture',
    semanticNote:'Source review test only',status:'pending-review',evidenceOnly:false};
  mkdirSync(path.join(root,'assets'));mkdirSync(path.join(root,'receipts'));
  writeFileSync(path.join(root,asset.path),bytes);writeFileSync(path.join(root,'receipts',`${asset.id}.json`),JSON.stringify(asset));
  plan=applyCommand(plan,{type:'attach-asset',requirementId:plan.requirements[0].id,asset});
  plan=insertProject(plan);
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
  plan=updateProject(plan.id,plan.revision,{type:'reuse',sceneId:plan.scenes[1].id,fromSceneId:plan.scenes[0].id,
    reason:'같은 원본의 다른 장면을 검토합니다.'});
  const shared=plan.requirements[0].id;
  assert.ok(plan.scenes[1].candidates.some(candidate=>candidate.requirementIds.includes(shared)));
  const {job,proposal}=await success(plan),request=await newAIAdoptionRequest(plan,proposal,job,[plan.script.segments[0].id],true);
  const response=await submitAIAdoption(request,studioToken(),new AbortController().signal,serverFetch);
  const saved=await currentAIAdoptionResponse(response,plan,job,proposal,request,scope(plan),scope(plan));
  assert.ok(saved);assert.equal(saved.plan.sourceReviews.length,(plan.sourceReviews??[]).length+3);
  assert.deepEqual(saved.plan.sourceReviews.slice(-3).map(row=>row.requirementId),[shared,shared,shared]);
  const forged=clone(response);forged.plan.sourceReviews.at(-1).contextSha256='f'.repeat(64);
  assert.equal(await currentAIAdoptionResponse(forged,plan,job,proposal,request,scope(plan),scope(plan)),null);
});
