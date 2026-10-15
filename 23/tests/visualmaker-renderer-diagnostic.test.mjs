import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,truncateSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {artifactFile,claimJob,enqueueJob,executeDiagnosticClaim,getJob,retryJob,runJob} from '../visualmaker/core/jobs.ts';
import {GET as media} from '../src/app/api/studio/jobs/media/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-renderer-diagnostic-'));return insertProject(createPlan('진단','고정 진단 패턴입니다.'));}
function db(){return new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));}
const request=(id,token=studioToken(),range)=>new Request(`http://127.0.0.1:8138/api/studio/jobs/media?jobId=${id}`,{headers:{'x-visualmaker-token':token,...(range?{range}:{})}});

test('diagnostic kind is queued, snapshot-idempotent, and never makes render-preview runnable',()=>{
  const plan=fixture();const job=enqueueJob(plan.id,plan.revision,'renderer-diagnostic','diagnostic-one');
  assert.equal(job.status,'queued');assert.equal(job.productionAuthority,false);
  assert.deepEqual(enqueueJob(plan.id,plan.revision,'renderer-diagnostic','diagnostic-one'),job);
  assert.throws(()=>enqueueJob(plan.id,plan.revision,'planning-package','diagnostic-one'),e=>e.status===409);
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새 의미',role:'context'});
  assert.deepEqual(enqueueJob(plan.id,plan.revision,'renderer-diagnostic','diagnostic-one'),job);
  assert.throws(()=>enqueueJob(plan.id,plan.revision,'renderer-diagnostic','diagnostic-two'),e=>e.status===409);
  assert.throws(()=>runJob(job.id),e=>e.status===409);
  const blocked=enqueueJob(plan.id,plan.revision+1,'render-preview','still-blocked');
  assert.equal(blocked.status,'blocked');assert.throws(()=>claimJob(blocked.id),e=>e.status===409);
});

test('missing diagnostic runtime fails without publishing and retry preserves snapshot',async()=>{
  const plan=fixture();const job=enqueueJob(plan.id,1,'renderer-diagnostic','missing-browser');const claim=claimJob(job.id);
  const original=process.cwd();const empty=mkdtempSync(path.join(os.tmpdir(),'vm-renderer-no-browser-'));
  try{process.chdir(empty);await assert.rejects(executeDiagnosticClaim(job.id,claim.token,claim.snapshot));}finally{process.chdir(original);}
  const failed=getJob(job.id);assert.equal(failed.status,'failed');assert.equal(failed.artifacts.length,0);
  assert.equal(retryJob(job.id).snapshotSha256,job.snapshotSha256);
  assert.equal(getJob(job.id).status,'queued');
});

test('renderer refuses missing cached browser without downloading',async()=>{
  const {checkedBrowser}=await import('../visualmaker/renderer/runner.ts');
  const original=process.cwd();const empty=mkdtempSync(path.join(os.tmpdir(),'vm-browser-check-'));
  try{process.chdir(empty);assert.throws(()=>checkedBrowser(),/browser/);}finally{process.chdir(original);}
});

test('fixed cached browser resolves within the current node_modules install across a junction',async()=>{
  const {checkedBrowser}=await import('../visualmaker/renderer/runner.ts');
  const modules=realpathSync('node_modules');
  const expected=realpathSync(path.join(modules,'.remotion','chrome-headless-shell','win64','chrome-headless-shell-win64','chrome-headless-shell.exe'));
  assert.equal(checkedBrowser(),expected);
  assert.ok(expected.startsWith(realpathSync(path.join(modules,'.remotion'))+path.sep));
});

test('media requires token, completed diagnostic kind, and matching receipt/artifact bytes',async()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,1,'renderer-diagnostic','media');
  assert.equal((await media(request(queued.id,'0'.repeat(64)))).status,403);
  assert.equal((await media(request(queued.id))).status,409);
  const planJob=runJob(enqueueJob(plan.id,1,'planning-package','planning-media').id);
  assert.equal((await media(request(planJob.id))).status,409);
  const conn=db();const folder=path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',queued.id,'attempt-1');mkdirSync(folder,{recursive:true});
  const movie=Buffer.from('fake-video-for-boundary-test');
  const receipt={schemaVersion:'visualmaker-renderer-diagnostic-v1',artifactKind:'renderer-diagnostic',purpose:'engine-execution-check',reviewProfile:'remotion-motion',reviewScope:'engine-diagnostic-only',productionAuthority:false,cutPreview:false,eligibleForCutReview:false,grammarApproved:false,playableParity:false,sourceAssetIds:[],episodeIds:[],jobId:queued.id,projectId:plan.id,requestedRevision:1,snapshotSha256:queued.snapshotSha256,entrySha256:sha(readFileSync('visualmaker/renderer/diagnostic.tsx')),runnerSha256:sha(readFileSync('visualmaker/renderer/runner.ts')),contractSha256:sha(readFileSync('visualmaker/renderer/contract.ts')),output:{name:'diagnostic.mp4',bytes:movie.length,sha256:sha(movie)}};
  const json=Buffer.from(JSON.stringify(receipt));writeFileSync(path.join(folder,'diagnostic.mp4'),movie);writeFileSync(path.join(folder,'diagnostic.json'),json);
  conn.prepare("UPDATE visualmaker_jobs SET status='succeeded',attempt=1 WHERE id=?").run(queued.id);
  for(const [name,bytes] of [['diagnostic.mp4',movie],['diagnostic.json',json]])conn.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(queued.id,name,`jobs/${queued.id}/attempt-1/${name}`,bytes.length,sha(bytes));conn.close();
  assert.equal((await media(request(queued.id))).status,200);
  const partial=await media(request(queued.id,studioToken(),'bytes=0-3'));assert.equal(partial.status,206);assert.equal(await partial.text(),'fake');
  assert.equal((await media(request(queued.id,studioToken(),'bytes=0-9999999'))).status,416);
  assert.throws(()=>artifactFile(queued.id,'plan.json'),e=>e.status===404);
  truncateSync(path.join(folder,'diagnostic.mp4'),40_000_001);
  assert.equal((await media(request(queued.id))).status,409);
  writeFileSync(path.join(folder,'diagnostic.mp4'),movie);
  truncateSync(path.join(folder,'diagnostic.json'),100_001);
  assert.equal((await media(request(queued.id))).status,409);
  writeFileSync(path.join(folder,'diagnostic.json'),json);
  writeFileSync(path.join(folder,'diagnostic.mp4'),'tampered');
  assert.equal((await media(request(queued.id))).status,409);
  writeFileSync(path.join(folder,'diagnostic.mp4'),movie);
  const missing=path.join(folder,'diagnostic.json');
  const {unlinkSync}=await import('node:fs');unlinkSync(missing);
  const response=await media(request(queued.id));assert.equal(response.status,409);
  assert.doesNotMatch(JSON.stringify(await response.json()),/vm-renderer-diagnostic-|studio\.sqlite|[A-Z]:\\/i);
});
