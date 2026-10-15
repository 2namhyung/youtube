import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MockLanguageModelV4} from 'ai/test';
import {createPlan,prepareImportedCopy,validatePlan} from '../visualmaker/core/director.ts';
import {createTestAnalysisAdapter} from '../visualmaker/core/ai-analysis.ts';
import {enqueueAIAnalysis,executeAIAnalysisClaim,readAIProposal} from '../visualmaker/core/ai-analysis-job.ts';
import {adoptAIAnalysis} from '../visualmaker/core/ai-analysis-adoption.ts';
import {claimJob,getJob} from '../visualmaker/core/jobs.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {POST as postAdoption} from '../src/app/api/studio/ai-analysis-adoption/route.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const config={enabled:'1',cliPath:process.execPath,modelId:'codex/test-analyzer'};
const script='첫 번째 설명입니다.\n\n두 번째 설명입니다.\n\n세 번째 설명입니다.';
const input=plan=>({projectId:plan.id,baseRevision:plan.revision,idempotencyKey:'adoption-source',expectedModelId:'codex/test-analyzer',externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:2048,timeoutMs:1000});
const record=segment=>({segmentId:segment.id,mainMessage:`핵심 ${segment.text}`,uncertainty:'검증 필요',visualMeaningBrief:'원본 장면 검토',searchBriefKo:'한국어 검색',searchBriefEn:'English search'});
const reply=plan=>({content:[{type:'text',text:JSON.stringify({records:plan.script.segments.map(record)})}],finishReason:{unified:'stop',raw:undefined},usage:{inputTokens:{total:9,noCache:9,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:15,text:15,reasoning:undefined}},warnings:[]});
const request=(plan,job,segmentIds)=>({projectId:plan.id,baseRevision:plan.revision,jobId:job.id,expectedArtifactSha256:job.artifacts[0].sha256,segmentIds,confirmDirectionReset:true});
const http=body=>new Request('http://127.0.0.1:3000/api/studio/ai-analysis-adoption',{method:'POST',headers:{host:'127.0.0.1:3000','content-type':'application/json','x-visualmaker-token':studioToken()},body:JSON.stringify(body)});
const db=()=>new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));
function fixture(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-'));return insertProject(createPlan('채택 테스트',script));}
async function success(plan){
  const job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);let calls=0;
  const adapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{calls++;return reply(plan);}}),'codex/test-analyzer');
  const done=await executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,adapter);
  assert.equal(done.status,'succeeded');assert.equal(calls,1);
  return {job:done,calls};
}

test('authenticated subset adoption persists exact five fields and one immutable planning revision',async()=>{
  let plan=fixture();const last=plan.scenes[2];
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:last.id,candidateId:last.candidates[0].id});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:last.id,locked:true});
  const before=structuredClone(plan),{job}=await success(plan);
  const selected=[plan.script.segments[0].id,plan.script.segments[1].id];
  const response=await postAdoption(http(request(plan,job,selected)));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const {plan:next,adoption}=await response.json();
  assert.equal(next.revision,plan.revision+1);assert.deepEqual(next.aiAnalysisAdoption,adoption);
  assert.deepEqual(getProject(plan.id),next);
  assert.equal(adoption.productionAuthority,false);assert.equal(adoption.requiresHumanReview,true);
  assert.equal(adoption.jobId,job.id);assert.equal(adoption.artifactSha256,job.artifacts[0].sha256);
  assert.equal(adoption.scope.snapshotSha256,sha(JSON.stringify(plan)));
  assert.deepEqual(adoption.records.map(item=>item.segmentId),selected);
  for(let i=0;i<2;i++){
    const item=adoption.records[i],segment=plan.script.segments[i];
    assert.deepEqual(item.source,{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind});
    assert.deepEqual([item.mainMessage,item.uncertainty,item.visualMeaningBrief,item.searchBriefKo,item.searchBriefEn],
      [record(segment).mainMessage,'검증 필요','원본 장면 검토','한국어 검색','English search']);
    assert.equal(item.beforeIntent,before.beats[i].intent);assert.equal(item.appliedIntent,item.mainMessage);
    assert.equal(next.beats[i].intent,item.mainMessage);assert.equal(next.beats[i].role,before.beats[i].role);
    assert.equal(next.scenes[i].selectedCandidateId,null);assert.equal(next.scenes[i].reviewStatus,'draft');
    assert.equal(next.scenes[i].estimatedSeconds,before.scenes[i].estimatedSeconds);
  }
  assert.deepEqual(next.scenes[2],before.scenes[2]);assert.deepEqual(next.script,before.script);assert.deepEqual(next.assets,before.assets);
  const conn=db();try{assert.equal(conn.prepare('SELECT COUNT(*) AS n FROM revisions WHERE project_id=?').get(plan.id).n,plan.revision+1);
    assert.equal(conn.prepare("SELECT COUNT(*) AS n FROM visualmaker_jobs WHERE kind='ai-script-analysis'").get().n,1);
    assert.equal(conn.prepare('SELECT COUNT(*) AS n FROM visualmaker_ai_analysis_attempts').get().n,1);
  }finally{conn.close();}
  assert.throws(()=>adoptAIAnalysis(request(plan,job,selected)),error=>error.status===409);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(next))).aiAnalysisAdoption,adoption);
  for(const mutate of [
    receipt=>{receipt.records[0].uncertainty='';},
    receipt=>{receipt.records[0].source.text='변조';},
    receipt=>{receipt.scope.scriptSha256='0'.repeat(64);},
    receipt=>{receipt.records[0].productionAuthority=true;},
  ]){const damaged=structuredClone(next);mutate(damaged.aiAnalysisAdoption);assert.throws(()=>validatePlan(damaged));}
  assert.equal(prepareImportedCopy(next).aiAnalysisAdoption,undefined);
  assert.equal(insertProject(next,true).aiAnalysisAdoption,undefined);
});

test('merged beat mapping is unavailable and foreign successful job cannot be adopted',async()=>{
  let plan=fixture();
  plan=updateProject(plan.id,plan.revision,{type:'merge-next',sceneId:plan.scenes[0].id});
  const {job}=await success(plan),base=JSON.stringify(plan);
  assert.equal((await postAdoption(http(request(plan,job,[plan.script.segments[0].id])))).status,409);
  assert.equal(JSON.stringify(getProject(plan.id)),base);
  const foreign=insertProject(createPlan('다른 프로젝트',script));
  const response=await postAdoption(http({...request(foreign,job,[foreign.script.segments[0].id]),expectedArtifactSha256:job.artifacts[0].sha256}));
  assert.equal(response.status,409);
  assert.equal(JSON.stringify(getProject(foreign.id)),JSON.stringify(foreign));
});

test('selection, lock, scope, hash and request failures roll back the whole batch',async()=>{
  let plan=fixture();const locked=plan.scenes[1];
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:locked.id,candidateId:locked.candidates[0].id});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:locked.id,locked:true});
  const {job}=await success(plan),base=JSON.stringify(getProject(plan.id));
  const ids=plan.script.segments.map(item=>item.id);
  const invalid=[
    [request(plan,job,[ids[0],ids[1]]),423],
    [request(plan,job,['missing']),409],
    [request(plan,job,[ids[0],ids[0]]),400],
    [request(plan,job,[ids[2],ids[0]]),409],
    [{...request(plan,job,[ids[0]]),expectedArtifactSha256:'0'.repeat(64)},409],
    [{...request(plan,job,[ids[0]]),confirmDirectionReset:false},400],
    [{...request(plan,job,[ids[0]]),productionAuthority:true},400],
    [{...request(plan,job,[ids[0]]),projectId:`plan-${'0'.repeat(36)}`},404],
  ];
  for(const [body,status] of invalid){const response=await postAdoption(http(body));assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(getProject(plan.id)),base);}
  const conn=db();try{assert.equal(conn.prepare('SELECT COUNT(*) AS n FROM revisions WHERE project_id=?').get(plan.id).n,plan.revision);}finally{conn.close();}
});

test('tampered artifact, stale snapshot and malformed receipt are rejected',async()=>{
  let plan=fixture();const {job}=await success(plan),body=request(plan,job,[plan.script.segments[0].id]);
  const current=structuredClone(plan),receipt={schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:'adopt_00000000-0000-0000-0000-000000000000',createdAt:new Date().toISOString(),jobId:job.id,artifactSha256:job.artifacts[0].sha256,
    scope:{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:sha(JSON.stringify(plan))},model:{adapter:'sdk-test',requestedModelId:'codex/test-analyzer',responseModelId:null},
    beforeRevision:plan.revision,afterRevision:plan.revision+1,scriptSha256:plan.script.rawSha256,productionAuthority:true,requiresHumanReview:true,records:[]};
  assert.throws(()=>validatePlan({...current,revision:plan.revision+1,aiAnalysisAdoption:receipt}));
  const artifact=path.join(process.env.VISUALMAKER_DATA_DIR,job.artifacts[0].path);
  const original=readFileSync(artifact);writeFileSync(artifact,'tampered');
  assert.equal((await postAdoption(http(body))).status,409);
  writeFileSync(artifact,original);
  plan=updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'사람이 수정',role:plan.beats[0].role});
  assert.equal((await postAdoption(http(body))).status,409);
});

test('manual beat and script revision retain historical adoption without a new provider call',async()=>{
  let plan=fixture();const {job,calls}=await success(plan);
  const {plan:adopted}=adoptAIAnalysis(request(plan,job,[plan.script.segments[0].id]));
  const manual=updateProject(adopted.id,adopted.revision,{type:'edit-beat',beatId:adopted.beats[0].id,intent:'직접 수정',role:adopted.beats[0].role});
  assert.deepEqual(manual.aiAnalysisAdoption,adopted.aiAnalysisAdoption);
  const revised=updateProject(manual.id,manual.revision,{type:'revise-script',text:'수정된 첫 문장입니다.\n\n두 번째 설명입니다.\n\n세 번째 설명입니다.'});
  assert.deepEqual(revised.aiAnalysisAdoption,adopted.aiAnalysisAdoption);
  assert.equal(revised.script.history.some(item=>item.rawSha256===adopted.script.rawSha256),true);
  const reverted=updateProject(revised.id,revised.revision,{type:'revise-script',text:script});
  assert.equal(reverted.script.rawSha256,adopted.script.rawSha256);
  assert.deepEqual(reverted.aiAnalysisAdoption,adopted.aiAnalysisAdoption);
  assert.equal(calls,1);
});

test('UTF-8 receipt byte overflow rejects a Korean batch without any revision write',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-'));
  const longScript=Array.from({length:40},(_,index)=>`${index+1}번째 ${'가'.repeat(290)}`).join('\n\n');
  const plan=insertProject(createPlan('다국어 크기 경계',longScript));
  assert.equal(plan.script.segments.length,40);
  const queued=enqueueAIAnalysis(input(plan),config),claim=claimJob(queued.jobId);
  let calls=0;
  const huge=plan.script.segments.map(segment=>({segmentId:segment.id,mainMessage:'한'.repeat(600),uncertainty:'확인',visualMeaningBrief:'원본',searchBriefKo:'검색',searchBriefEn:'search'}));
  const adapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{calls++;return {...reply(plan),content:[{type:'text',text:JSON.stringify({records:huge})}]};}}),'codex/test-analyzer');
  const done=await executeAIAnalysisClaim(queued.jobId,claim.token,claim.snapshot,config,adapter);
  assert.equal(done.status,'succeeded');assert.equal(calls,1);
  assert.ok(done.artifacts[0].bytes<200_000);
  const proposal=readAIProposal(plan.id,plan.revision,done.id).proposal;
  const wouldBeReceipt={schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:'adopt_00000000-0000-0000-0000-000000000000',createdAt:new Date().toISOString(),jobId:done.id,
    artifactSha256:done.artifacts[0].sha256,scope:proposal.scope,model:proposal.model,beforeRevision:plan.revision,afterRevision:plan.revision+1,
    scriptSha256:plan.script.rawSha256,productionAuthority:false,requiresHumanReview:true,
    records:proposal.records.map((record,index)=>({...record,beatId:plan.beats[index].id,sceneId:plan.scenes[index].id,
      beforeIntent:plan.beats[index].intent,appliedIntent:record.mainMessage}))};
  assert.ok(JSON.stringify(wouldBeReceipt).length<200_000);
  assert.ok(Buffer.byteLength(JSON.stringify(wouldBeReceipt),'utf8')>200_000);
  assert.throws(()=>validatePlan({...plan,revision:plan.revision+1,aiAnalysisAdoption:wouldBeReceipt}));
  const body=request(plan,done,plan.script.segments.map(segment=>segment.id));
  const before=JSON.stringify(getProject(plan.id));
  const response=await postAdoption(http(body));
  assert.equal(response.status,413);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(JSON.stringify(getProject(plan.id)),before);
  const conn=db();try{assert.equal(conn.prepare('SELECT COUNT(*) AS n FROM revisions WHERE project_id=?').get(plan.id).n,1);}finally{conn.close();}
});

test('wrong local token and foreign origin return guarded 403 with no-store',async()=>{
  const plan=fixture(),body={projectId:plan.id,baseRevision:plan.revision,jobId:'job_00000000-0000-0000-0000-000000000000',expectedArtifactSha256:'0'.repeat(64),segmentIds:['segment-1'],confirmDirectionReset:true};
  for(const headers of [
    {host:'127.0.0.1:3000','content-type':'application/json','x-visualmaker-token':'0'.repeat(64)},
    {host:'127.0.0.1:3000','content-type':'application/json','x-visualmaker-token':studioToken(),origin:'http://foreign.test'},
  ]){
    const response=await postAdoption(new Request('http://127.0.0.1:3000/api/studio/ai-analysis-adoption',{method:'POST',headers,body:JSON.stringify(body)}));
    assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('HTTP accepts a valid 40-by-200 ID selection and bounds oversized JSON bytes',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-adoption-'));
  const draft=createPlan('긴 구간 ID',Array.from({length:40},(_,index)=>`문장 ${index+1}`).join('\n\n'));
  assert.equal(draft.script.segments.length,40);
  draft.script.segments.forEach((segment,index)=>{
    const id=`segment-${index}-${'x'.repeat(200-`segment-${index}-`.length)}`;
    draft.beats[index].segmentIds=[id];segment.id=id;
    assert.equal(id.length,200);
  });
  const plan=insertProject(validatePlan(draft)),{job}=await success(plan);
  const body=request(plan,job,plan.script.segments.map(segment=>segment.id));
  assert.ok(Buffer.byteLength(JSON.stringify(body),'utf8')>4096);
  const accepted=await postAdoption(http(body));
  assert.equal(accepted.status,200);assert.equal(accepted.headers.get('cache-control'),'no-store');
  assert.equal((await accepted.json()).adoption.records.length,40);
  const oversized=await postAdoption(http({...body,padding:'x'.repeat(66_000)}));
  assert.equal(oversized.status,413);assert.equal(oversized.headers.get('cache-control'),'no-store');
});
