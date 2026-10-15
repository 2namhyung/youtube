import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,renameSync,writeFileSync,writeSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {MockLanguageModelV4} from 'ai/test';
import {createPlan} from '../visualmaker/core/director.ts';
import {createTestAnalysisAdapter} from '../visualmaker/core/ai-analysis.ts';
import {aiReport,cancelAIAnalysis,enqueueAIAnalysis,executeAIAnalysisClaim,readAIProposal,recoverAIAnalysis,scopedAIJob} from '../visualmaker/core/ai-analysis-job.ts';
import {claimJob,enqueueJob,getJob,retryJob} from '../visualmaker/core/jobs.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {GET as getAI,POST as postAI} from '../src/app/api/studio/ai-analysis/route.ts';
import {GET as getGeneric,POST as postGeneric} from '../src/app/api/studio/jobs/route.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const config={enabled:'1',cliPath:process.execPath,modelId:'codex/test-analyzer'};
const input=plan=>({projectId:plan.id,baseRevision:plan.revision,idempotencyKey:'ai-test',expectedModelId:'codex/test-analyzer',externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:2048,timeoutMs:1000});
const record=segment=>({segmentId:segment.id,mainMessage:'핵심',uncertainty:'확인 필요',visualMeaningBrief:'실제 문',searchBriefKo:'한국 문 영상',searchBriefEn:'Korean door footage'});
const reply=value=>({content:[{type:'text',text:JSON.stringify(value)}],finishReason:{unified:'stop',raw:undefined},usage:{inputTokens:{total:9,noCache:9,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:15,text:15,reasoning:undefined}},warnings:[]});
const model=(plan,onCall)=>createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async args=>{onCall?.(args);return reply({records:plan.script.segments.map(record)});}}),'codex/test-analyzer');
function fixture(script='첫 문장입니다.\n\n둘째 문장입니다.'){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-ai-job-'));
  return insertProject(createPlan('AI 작업',script));
}
function db(){return new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));}
function cp(id){const conn=db();try{return conn.prepare('SELECT * FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id);}finally{conn.close();}}
const req=(method,url,body)=>new Request(`http://127.0.0.1:3000${url}`,{method,headers:{host:'127.0.0.1:3000','x-visualmaker-token':studioToken(),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});

test('enqueue binds immutable snapshot, config, consent, idempotency and checkpoint in one transaction',()=>{
  const plan=fixture('😀 첫 문장입니다.\n\nNOTE: 제작 참고\n\n둘째 문장입니다.');
  const job=enqueueAIAnalysis(input(plan),config);
  assert.equal(job.status,'queued');assert.equal(job.externalCall.outcome,'not-started');assert.equal(job.externalCall.startedAt,null);
  assert.equal(job.snapshotSha256,sha(JSON.stringify(plan)));
  const expectedIdentity=sha(JSON.stringify(['visualmaker-ai-enqueue-identity-v1',plan.id,plan.revision,job.snapshotSha256,job.scriptSha256,'codex/test-analyzer',true,true,2048,1000,'ai-test']));
  assert.equal(job.enqueueRequestSha256,expectedIdentity);
  assert.equal(job.requestedModelId,'codex/test-analyzer');assert.equal(job.cost,'unknown');
  assert.deepEqual(enqueueAIAnalysis(input(plan),config),job);
  assert.deepEqual(enqueueAIAnalysis(input(plan),{enabled:undefined,apiKey:undefined,modelId:undefined}),job);
  const changedLimits=enqueueAIAnalysis({...input(plan),idempotencyKey:'different-limits',maxOutputTokens:4096},config);
  const changedKey=enqueueAIAnalysis({...input(plan),idempotencyKey:'different-key'},config);
  assert.notEqual(changedLimits.enqueueRequestSha256,job.enqueueRequestSha256);
  assert.notEqual(changedKey.enqueueRequestSha256,job.enqueueRequestSha256);
  assert.equal(aiReport(plan.id,plan.revision,config).jobs.find(row=>row.jobId===job.jobId).enqueueRequestSha256,expectedIdentity);
  assert.throws(()=>enqueueAIAnalysis({...input(plan),maxOutputTokens:4096},config),e=>e.status===409);
  const conn=db();try{const row=conn.prepare('SELECT snapshot_json,execution_contract_json,request_sha256 FROM visualmaker_jobs WHERE id=?').get(job.jobId);
    assert.equal(sha(row.snapshot_json),job.snapshotSha256);assert.equal(cp(job.jobId).request_sha256,row.request_sha256);
    assert.equal(JSON.parse(row.execution_contract_json).billingConsent,true);
    assert.equal(row.execution_contract_json.includes('synthetic-only'),false);
  }finally{conn.close();}
  assert.throws(()=>retryJob(job.jobId),e=>e.status===409);
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'변경',role:'context'});
  assert.deepEqual(enqueueAIAnalysis(input(plan),config),job);
});

test('readiness is configuration-only; strict requests and stale scope fail without a job',()=>{
  const plan=fixture();const absent={enabled:undefined,apiKey:undefined,modelId:undefined};
  const report=aiReport(plan.id,plan.revision,absent);assert.equal(report.capability.available,false);assert.equal(report.capability.providerVerified,false);
  assert.equal(report.scope.snapshotSha256,sha(JSON.stringify(plan)));
  assert.throws(()=>enqueueAIAnalysis(input(plan),absent),e=>e.status===409);
  for(const delta of [{billingConsent:false},{externalTransmissionConsent:false},{maxOutputTokens:511},{maxOutputTokens:8193},{timeoutMs:9},{timeoutMs:120001},{expectedModelId:'other/model'},{approval:true}])
    assert.throws(()=>enqueueAIAnalysis({...input(plan),...delta},config));
  const revised=updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'수정',role:'context'});
  assert.throws(()=>aiReport(plan.id,plan.revision,config),e=>e.status===409);
  assert.equal(aiReport(revised.id,revised.revision,config).scope.revision,2);
});

test('one claim and one SDK call publish a bound artifact; scoped read verifies exact bytes',async()=>{
  let plan=fixture();const scene=plan.scenes[0];
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:scene.id,candidateId:scene.candidates[0].id});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:scene.id,locked:true});
  const before=JSON.stringify(plan),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  assert.equal(claim.job.attempt,1);assert.throws(()=>claimJob(job.jobId),e=>e.status===409);
  let calls=0,checkpointAtCall;
  const adapter=model(plan,()=>{calls++;checkpointAtCall=cp(job.jobId);});
  const done=await executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,adapter);
  assert.equal(done.status,'succeeded');assert.equal(calls,1);
  assert.equal(checkpointAtCall.outcome,'started');assert.ok(checkpointAtCall.external_call_started_at);
  assert.equal(cp(job.jobId).outcome,'succeeded');assert.equal(done.artifacts.length,1);
  const {proposal}=readAIProposal(plan.id,plan.revision,job.jobId);
  assert.equal(JSON.stringify(getProject(plan.id)),before);assert.equal(getProject(plan.id).scenes[0].locked,true);
  assert.equal(proposal.model.adapter,'sdk-test');assert.equal(proposal.productionAuthority,false);
  assert.deepEqual(proposal.records.map(item=>item.segmentId),plan.script.segments.map(item=>item.id));
  assert.equal(aiReport(plan.id,plan.revision,config).jobs[0].artifact.sha256,done.artifacts[0].sha256);
  let response=await getAI(req('GET',`/api/studio/ai-analysis?projectId=${plan.id}&baseRevision=${plan.revision}&jobId=${job.jobId}&format=proposal`));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const scoped=await response.json();
  assert.equal(scoped.proposal.scope.snapshotSha256,job.snapshotSha256);
  assert.equal(scoped.job.enqueueRequestSha256,job.enqueueRequestSha256);
  assert.throws(()=>retryJob(job.jobId),e=>e.status===409);
  const artifact=path.join(process.env.VISUALMAKER_DATA_DIR,done.artifacts[0].path);
  writeFileSync(artifact,'tampered');assert.throws(()=>readAIProposal(plan.id,plan.revision,job.jobId),e=>e.status===409);
  response=await getAI(req('GET',`/api/studio/ai-analysis?projectId=${plan.id}&baseRevision=${plan.revision}&jobId=${job.jobId}&format=proposal`));assert.equal(response.status,409);
  writeFileSync(artifact,Buffer.alloc(250_001,65));assert.throws(()=>readAIProposal(plan.id,plan.revision,job.jobId),e=>e.status===409);
});

test('partial staged write failure removes only owned fragment and records needs-review',async()=>{
  const plan=fixture(),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  const done=await executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,model(plan),
    (point,fd)=>{if(point==='after-file-open'){writeSync(fd,Buffer.from('partial'));throw new Error('synthetic disk write failure');}});
  assert.equal(done.status,'needs-review');assert.equal(done.artifacts.length,0);
  assert.deepEqual(readdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',job.jobId)),[]);
  assert.equal(cp(job.jobId).outcome,'needs-review');
});

test('DB artifact insert failure rolls back renamed output',async()=>{
  const plan=fixture(),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  const conn=db();try{conn.exec(`CREATE TRIGGER fail_ai_artifact_${job.jobId.slice(4).replaceAll('-','')} BEFORE INSERT ON visualmaker_job_artifacts
    WHEN NEW.job_id='${job.jobId}' BEGIN SELECT RAISE(ABORT,'synthetic artifact insert failure'); END;`);}finally{conn.close();}
  const done=await executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,model(plan));
  assert.equal(done.status,'needs-review');assert.equal(done.artifacts.length,0);
  assert.deepEqual(readdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',job.jobId)),[]);
  assert.equal(cp(job.jobId).outcome,'needs-review');
});

test('rollback does not remove a foreign directory swapped into the attempt path',async()=>{
  const plan=fixture(),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  const parent=path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',job.jobId),target=path.join(parent,'attempt-1');
  const done=await executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,model(plan),point=>{
    if(point==='before-artifact-insert'){
      renameSync(target,path.join(parent,'owned-moved-aside'));
      mkdirSync(target);writeFileSync(path.join(target,'foreign.txt'),'belongs to another actor');
      throw new Error('synthetic foreign path swap');
    }
  });
  assert.equal(done.status,'needs-review');assert.equal(done.artifacts.length,0);
  assert.deepEqual(readdirSync(target),['foreign.txt']);
  assert.equal(cp(job.jobId).outcome,'needs-review');
});

test('queued cancel and pre-call config failure make no SDK request and never retry',async()=>{
  const plan=fixture();const queued=enqueueAIAnalysis(input(plan),config);
  const cancelled=cancelAIAnalysis(plan.id,1,queued.jobId);assert.equal(cancelled.status,'cancelled');assert.equal(cp(queued.jobId).outcome,'cancelled-before-call');
  assert.throws(()=>claimJob(queued.jobId),e=>e.status===409);assert.throws(()=>retryJob(queued.jobId),e=>e.status===409);
  const second=enqueueAIAnalysis({...input(plan),idempotencyKey:'other'},config),claim=claimJob(second.jobId);let calls=0;
  const done=await executeAIAnalysisClaim(second.jobId,claim.token,claim.snapshot,{...config,modelId:'other/model'},model(plan,()=>calls++));
  assert.equal(done.status,'failed');assert.equal(cp(second.jobId).outcome,'failed-before-call');assert.equal(calls,0);
});

test('in-flight cancel fences late success and leaves ambiguous external-call status',async()=>{
  const plan=fixture(),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  let release,entered;const called=new Promise(resolve=>entered=resolve);
  const adapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{entered();return new Promise(resolve=>release=()=>resolve(reply({records:plan.script.segments.map(record)})));}}),'codex/test-analyzer');
  const pending=executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,adapter);await called;
  const cancelled=cancelAIAnalysis(plan.id,1,job.jobId);assert.equal(cancelled.status,'needs-review');assert.equal(cp(job.jobId).outcome,'needs-review');
  release();await pending;assert.equal(getJob(job.jobId).status,'needs-review');assert.equal(getJob(job.jobId).artifacts.length,0);
  assert.throws(()=>retryJob(job.jobId),e=>e.status===409);
});

test('expired lease recovery distinguishes before and after call checkpoint',async()=>{
  const plan=fixture(),before=enqueueAIAnalysis(input(plan),config),first=claimJob(before.jobId);
  let conn=db();conn.prepare('UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',before.jobId);conn.close();
  assert.equal(recoverAIAnalysis(plan.id,1,before.jobId).status,'failed');assert.equal(cp(before.jobId).outcome,'failed-before-call');
  const after=enqueueAIAnalysis({...input(plan),idempotencyKey:'after'},config),claim=claimJob(after.jobId);
  let entered;const called=new Promise(resolve=>entered=resolve);
  const adapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{entered();return new Promise(()=>{});}}),'codex/test-analyzer');
  const pending=executeAIAnalysisClaim(after.jobId,claim.token,claim.snapshot,config,adapter);await called;
  conn=db();conn.prepare('UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',after.jobId);conn.close();
  assert.equal(recoverAIAnalysis(plan.id,1,after.jobId).status,'needs-review');assert.equal(cp(after.jobId).outcome,'needs-review');
  await pending;assert.equal(getJob(after.jobId).artifacts.length,0);
  assert.equal(first.job.attempt,1);
});

test('current script change during call blocks publication and old result access',async()=>{
  const plan=fixture(),job=enqueueAIAnalysis(input(plan),config),claim=claimJob(job.jobId);
  let release,entered;const called=new Promise(resolve=>entered=resolve);
  const adapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{entered();return new Promise(resolve=>release=()=>resolve(reply({records:plan.script.segments.map(record)})));}}),'codex/test-analyzer');
  const pending=executeAIAnalysisClaim(job.jobId,claim.token,claim.snapshot,config,adapter);await called;
  const revised=updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새 의미',role:'context'});
  assert.throws(()=>scopedAIJob('run',revised.id,revised.revision,job.jobId),e=>e.status===409);
  release();const done=await pending;assert.equal(done.status,'needs-review');assert.equal(done.artifacts.length,0);
  assert.throws(()=>readAIProposal(revised.id,revised.revision,job.jobId),e=>e.status===409);
});

test('provider failure and timeout after checkpoint are redacted needs-review without replay',async()=>{
  const plan=fixture();let calls=0;
  const failed=enqueueAIAnalysis(input(plan),config),first=claimJob(failed.jobId);
  const errorModel=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{calls++;throw new Error('SECRET_API_KEY private provider response');}}),'codex/test-analyzer');
  const failedJob=await executeAIAnalysisClaim(failed.jobId,first.token,first.snapshot,config,errorModel);
  assert.equal(failedJob.status,'needs-review');assert.equal(cp(failed.jobId).error_code,'provider');assert.equal(calls,1);
  assert.equal(JSON.stringify(aiReport(plan.id,1,config).jobs).includes('SECRET_API_KEY'),false);
  assert.throws(()=>retryJob(failed.jobId),e=>e.status===409);
  const timed=enqueueAIAnalysis({...input(plan),idempotencyKey:'timeout-case',timeoutMs:20},config),second=claimJob(timed.jobId);
  const hanging=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{calls++;return new Promise(()=>{});}}),'codex/test-analyzer');
  const started=Date.now(),timedJob=await executeAIAnalysisClaim(timed.jobId,second.token,second.snapshot,config,hanging);
  assert.equal(timedJob.status,'needs-review');assert.equal(cp(timed.jobId).error_code,'timeout');assert.ok(Date.now()-started<1000);
  assert.equal(calls,2);assert.equal(timedJob.artifacts.length,0);
});

test('cross-project analysis scope is unavailable and a stale job stays listed as stale',()=>{
  const first=fixture();const job=enqueueAIAnalysis(input(first),config);
  const other=insertProject(createPlan('다른 프로젝트','다른 대본입니다.'));
  assert.throws(()=>scopedAIJob('cancel',other.id,other.revision,job.jobId),e=>e.status===404);
  assert.throws(()=>readAIProposal(other.id,other.revision,job.jobId),e=>e.status===409);
  const revised=updateProject(first.id,1,{type:'edit-beat',beatId:first.beats[0].id,intent:'수정',role:'context'});
  const listed=aiReport(revised.id,revised.revision,config).jobs.find(item=>item.jobId===job.jobId);
  assert.equal(listed.stale,true);assert.equal(listed.requestedRevision,1);
  assert.equal(cancelAIAnalysis(revised.id,revised.revision,job.jobId).status,'cancelled');
});

test('drain terminalizes a corrupt queued AI contract and still completes the next ordinary job',async()=>{
  const plan=fixture(),bad=enqueueAIAnalysis(input(plan),config),good=enqueueJob(plan.id,plan.revision,'planning-package','normal-after-ai');
  const conn=db();conn.prepare('UPDATE visualmaker_jobs SET execution_contract_sha256=? WHERE id=?').run('0'.repeat(64),bad.jobId);conn.close();
  const env={...process.env,VISUALMAKER_DATA_DIR:process.env.VISUALMAKER_DATA_DIR};
  delete env.VISUALMAKER_AI_ENABLED;delete env.VISUALMAKER_CODEX_CLI_PATH;delete env.VISUALMAKER_AI_MODEL;
  const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--experimental-strip-types','visualmaker/worker.ts','--drain'],{cwd:process.cwd(),env,stdio:['ignore','ignore','pipe'],windowsHide:true});
    let stderr='';const deadline=setTimeout(()=>{child.kill();reject(new Error('worker drain did not terminate'));},10_000);
    child.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,1000);});child.once('error',error=>{clearTimeout(deadline);reject(error);});child.once('exit',code=>{clearTimeout(deadline);resolve({code,stderr});});});
  assert.equal(exit.code,0,exit.stderr);
  assert.equal(getJob(bad.jobId).status,'failed');assert.equal(cp(bad.jobId).outcome,'failed-before-call');assert.equal(getJob(bad.jobId).attempt,0);
  assert.equal(getJob(good.id).status,'succeeded');
});

test('dedicated authenticated HTTP enforces exact fields and generic commands cannot reach AI job',async()=>{
  const plan=fixture();const query=`?projectId=${plan.id}&baseRevision=1`;
  let response=await getAI(req('GET',`/api/studio/ai-analysis${query}`));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).report.capability.available,false);
  response=await getAI(req('GET',`/api/studio/ai-analysis${query}&baseRevision=1`));assert.equal(response.status,400);
  response=await postAI(req('POST','/api/studio/ai-analysis',{action:'enqueue',...input(plan)}));assert.notEqual(response.status,201);
  const keys=['VISUALMAKER_AI_ENABLED','VISUALMAKER_CODEX_CLI_PATH','VISUALMAKER_AI_MODEL'];const previous=keys.map(key=>process.env[key]);
  try{process.env.VISUALMAKER_AI_ENABLED='1';process.env.VISUALMAKER_CODEX_CLI_PATH=process.execPath;process.env.VISUALMAKER_AI_MODEL='codex/test-analyzer';
    response=await postAI(req('POST','/api/studio/ai-analysis',{action:'enqueue',...input(plan)}));assert.equal(response.status,201);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const posted=await response.json();assert.equal(posted.job.requestedModelId,'codex/test-analyzer');assert.equal(JSON.stringify(posted).includes('synthetic-only'),false);
    assert.equal(posted.job.enqueueRequestSha256,sha(JSON.stringify(['visualmaker-ai-enqueue-identity-v1',plan.id,plan.revision,posted.job.snapshotSha256,posted.job.scriptSha256,'codex/test-analyzer',true,true,2048,1000,'ai-test'])));
    response=await getAI(req('GET',`/api/studio/ai-analysis${query}`));assert.equal(response.status,200);
    assert.equal((await response.json()).report.jobs[0].enqueueRequestSha256,posted.job.enqueueRequestSha256);
    response=await postAI(req('POST','/api/studio/ai-analysis',{action:'enqueue',...input(plan),providerOptions:{}}));assert.equal(response.status,400);
    response=await postAI(req('POST','/api/studio/ai-analysis',{action:'enqueue',...input(plan),billingConsent:'true'}));assert.equal(response.status,400);
  }finally{keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});}
  response=await getAI(new Request(`http://127.0.0.1:3000/api/studio/ai-analysis${query}`,{headers:{host:'127.0.0.1:3000'}}));assert.equal(response.status,403);
  const job=enqueueAIAnalysis(input(plan),config);
  response=await postGeneric(req('POST','/api/studio/jobs',{action:'cancel',jobId:job.jobId}));assert.equal(response.status,404);
  response=await getGeneric(req('GET',`/api/studio/jobs?projectId=${plan.id}`));assert.deepEqual((await response.json()).jobs,[]);
  response=await getAI(req('GET',`/api/studio/ai-analysis${query}&jobId=${job.jobId}&format=proposal`));assert.equal(response.status,409);
});
