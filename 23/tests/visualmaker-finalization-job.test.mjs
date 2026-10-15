import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {buildFinalizationExecutionContract,cancelJob,claimJob,enqueueFinalizationJob,finalizationArtifactFile,getJob,recoverJob,retryJob} from '../visualmaker/core/jobs.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {GET as readinessGet} from '../src/app/api/studio/finalization/route.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {GET as mediaGet} from '../src/app/api/studio/jobs/export-media/route.ts';

const previous=process.env.VISUALMAKER_DATA_DIR;
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'vm-finalization-job-'));process.env.VISUALMAKER_DATA_DIR=root;t.after(()=>{if(previous===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=previous;rmSync(root,{recursive:true,force:true});});return insertProject(createPlan('최종화 테스트','현재 대본은 승인 전입니다.'));}
function request(url,init={}){return new Request(url,{...init,headers:{'host':'127.0.0.1:8138','x-visualmaker-token':studioToken(),...(init.headers||{})}});}

test('blocked canonical finalization queues no runnable or downloadable artifact and idempotency is scoped',async t=>{
  const plan=fixture(t),first=await enqueueFinalizationJob(plan.id,plan.revision,'finalization-one');
  assert.equal(first.kind,'episode-finalization-export');assert.equal(first.status,'blocked');assert.equal(first.productionAuthority,false);assert.deepEqual(first.artifacts,[]);
  assert.deepEqual(await enqueueFinalizationJob(plan.id,plan.revision,'finalization-one'),first);
  const second=await enqueueFinalizationJob(plan.id,plan.revision,'another-key');assert.equal(second.status,'blocked');assert.notEqual(second.id,first.id);
  assert.throws(()=>claimJob(first.id),error=>error.status===409);
  assert.throws(()=>retryJob(first.id),error=>error.status===409);
  assert.throws(()=>cancelJob(first.id),error=>error.status===409);
  assert.throws(()=>recoverJob(first.id),error=>error.status===409);
  await assert.rejects(finalizationArtifactFile(first.id,{projectId:plan.id,baseRevision:plan.revision,attempt:1},'export.mp4'),error=>error.status===409);
  assert.equal(getJob(first.id).status,'blocked');
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'변경된 영상 의도',role:'context'});
  assert.deepEqual(await enqueueFinalizationJob(plan.id,plan.revision,'finalization-one'),first);
});

test('guarded readiness and enqueue expose only public DTO, reject caller options and unauthorized media',async t=>{
  const plan=fixture(t),base=`http://127.0.0.1:8138/api/studio`;
  const noAuth=await readinessGet(new Request(`${base}/finalization?projectId=${plan.id}&baseRevision=1`,{headers:{host:'127.0.0.1:8138'}}));assert.equal(noAuth.status,403);
  const response=await readinessGet(request(`${base}/finalization?projectId=${plan.id}&baseRevision=1`));assert.equal(response.status,200);
  const value=await response.json();assert.equal(value.readiness.renderEligible,false);assert.equal(value.readiness.productionAuthority,false);assert.equal(value.readiness.binding,undefined);assert.equal(value.readiness.fingerprints,undefined);assert.doesNotMatch(JSON.stringify(value),/[A-Z]:\\Users\\/u);
  const extras=await jobsPost(request(`${base}/jobs`,{method:'POST',body:JSON.stringify({action:'enqueue',projectId:plan.id,baseRevision:1,kind:'episode-finalization-export',idempotencyKey:'f-one',sourcePath:'C:\\private'}),headers:{'content-type':'application/json'}}));assert.equal(extras.status,400);
  const created=await jobsPost(request(`${base}/jobs`,{method:'POST',body:JSON.stringify({action:'enqueue',projectId:plan.id,baseRevision:1,kind:'episode-finalization-export',idempotencyKey:'f-one'}),headers:{'content-type':'application/json'}}));assert.equal(created.status,200);const payload=await created.json();assert.equal(payload.job.status,'blocked');assert.equal(payload.executionContract,undefined);assert.equal(payload.readiness.binding,undefined);
  const commandWithOptions=await jobsPost(request(`${base}/jobs`,{method:'POST',body:JSON.stringify({action:'run',jobId:payload.job.id,sourcePath:'C:\\private'}),headers:{'content-type':'application/json'}}));assert.equal(commandWithOptions.status,400);
  const commandError=await jobsPost(request(`${base}/jobs`,{method:'POST',body:JSON.stringify({action:'run',jobId:payload.job.id}),headers:{'content-type':'application/json'}}));assert.equal(commandError.status,409);
  const errorBody=await commandError.json();assert.equal(errorBody.error,'최종화 작업 명령을 완료하지 못했습니다.');assert.doesNotMatch(JSON.stringify(errorBody),/[A-Z]:\\|\/Users\/|\\Users\\/u);
  const media=await mediaGet(request(`${base}/jobs/export-media?jobId=${payload.job.id}&projectId=${plan.id}&baseRevision=1&attempt=1&name=export.mp4`));assert.equal(media.status,409);
  const invalid=await mediaGet(request(`${base}/jobs/export-media?jobId=${payload.job.id}&projectId=${plan.id}&baseRevision=1&attempt=1&name=../export.mp4`));assert.equal(invalid.status,400);
});

test('immutable execution contract hashes the complete report and rejects oversize',()=>{
  const report={schemaVersion:'visualmaker-post-lock-output-v1',scope:{projectId:'plan-00000000-0000-0000-0000-000000000000',revision:1,snapshotSha256:'a'.repeat(64)},productionAuthority:false,reviewApproved:false,renderEligible:false,blockers:[]};
  const contract=buildFinalizationExecutionContract(report);assert.equal(contract.schemaVersion,'visualmaker-finalization-execution-v1');assert.notEqual(contract.reportSha256,'a'.repeat(64));
  assert.throws(()=>buildFinalizationExecutionContract({...report,padding:'x'.repeat(5_000_000)}),error=>error.status===409);
});
