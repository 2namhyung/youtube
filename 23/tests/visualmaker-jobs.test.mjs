import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {artifactFile,cancelJob,claimJob,enqueueJob,executeClaim,getJob,listJobs,recoverJob,retryJob,runJob} from '../visualmaker/core/jobs.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'visualmaker-jobs-'));return insertProject(createPlan('작업 검사','첫 번째 자료를 확인합니다.\n\n두 자료를 비교합니다.'));}
function db(){return new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));}

test('revision snapshot, idempotency and collision are transactional',()=>{
  const plan=fixture();const first=enqueueJob(plan.id,1,'planning-package','same-request');
  assert.deepEqual(enqueueJob(plan.id,1,'planning-package','same-request'),first);
  assert.throws(()=>enqueueJob(plan.id,1,'render-preview','same-request'),e=>e.status===409);
  updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새로운 의도',role:'context'});
  assert.deepEqual(enqueueJob(plan.id,1,'planning-package','same-request'),first);
  assert.throws(()=>enqueueJob(plan.id,1,'render-preview','same-request'),e=>e.status===409);
  assert.throws(()=>enqueueJob(plan.id,1,'planning-package','later-request'),e=>e.status===409);
  assert.equal(listJobs(plan.id).length,1);
  const done=runJob(first.id);assert.equal(done.status,'succeeded');
  const exported=JSON.parse(artifactFile(first.id,'plan.json').bytes.toString('utf8'));
  assert.equal(exported.revision,1);assert.equal(exported.beats[0].intent,plan.beats[0].intent);
  assert.equal(exported.productionAuthority,false);assert.equal(done.productionAuthority,false);
  assert.equal(done.requestedRevision,1);assert.equal(done.artifacts.length,4);
  assert.equal(done.snapshotSha256,sha(JSON.stringify(plan)));
  const manifest=JSON.parse(artifactFile(first.id,'package.json').bytes.toString('utf8'));
  assert.equal(manifest.productionAuthority,false);
  const requirements=JSON.parse(artifactFile(first.id,'source-requirements.json').bytes.toString('utf8'));
  assert.equal(requirements.productionAuthority,false);
  assert.ok(requirements.requirements.every(r=>r.status==='unresolved'));
});

test('one claim wins; cancellation prevents publication; retry preserves snapshot',()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,1,'planning-package','cancel-case');
  const claim=claimJob(queued.id);assert.equal(claim.job.status,'running');
  assert.throws(()=>claimJob(queued.id),e=>e.status===409);
  cancelJob(queued.id);assert.throws(()=>executeClaim(queued.id,claim.token,claim.snapshot),e=>e.status===409);const after=getJob(queued.id);
  assert.equal(after.status,'cancelled');assert.equal(after.artifacts.length,0);
  assert.throws(()=>artifactFile(queued.id,'plan.json'),e=>e.status===409);
  const retry=retryJob(queued.id);assert.equal(retry.status,'queued');
  const done=runJob(queued.id);assert.equal(done.status,'succeeded');assert.equal(done.attempt,2);
  assert.deepEqual(done.attempts.map(a=>a.outcome),['cancelled','succeeded']);
  assert.equal(done.snapshotSha256,queued.snapshotSha256);
});

test('active lease cannot be recovered; an expired lease becomes retryable',()=>{
  const plan=fixture();const job=enqueueJob(plan.id,1,'planning-package','recovery-case');const claim=claimJob(job.id);
  assert.throws(()=>recoverJob(job.id),e=>e.status===409);
  const connection=db();connection.prepare('UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',job.id);connection.close();
  const recovered=recoverJob(job.id);assert.equal(recovered.status,'failed');assert.match(recovered.recoveryReason,/만료/);
  assert.throws(()=>executeClaim(job.id,claim.token,claim.snapshot),e=>e.status===409);
  assert.equal(retryJob(job.id).status,'queued');assert.equal(runJob(job.id).status,'succeeded');
});

test('artifact hashes and confined paths are checked on every download',()=>{
  const plan=fixture();const job=runJob(enqueueJob(plan.id,1,'planning-package','artifact-case').id);
  for(const artifact of job.artifacts){const received=artifactFile(job.id,artifact.name);assert.equal(received.bytes.length,artifact.bytes);assert.equal(sha(received.bytes),artifact.sha256);}
  const record=job.artifacts.find(a=>a.name==='plan.json');
  writeFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,record.path),'tampered');
  assert.throws(()=>artifactFile(job.id,'plan.json'),e=>e.status===409);
  const connection=db();connection.prepare("UPDATE visualmaker_job_artifacts SET path='../../raw/private' WHERE job_id=? AND name='plan.json'").run(job.id);connection.close();
  assert.throws(()=>artifactFile(job.id,'plan.json'),e=>e.status===404);
});

test('render mode is explicitly blocked and cannot be claimed or retried',()=>{
  const plan=fixture();const job=enqueueJob(plan.id,1,'render-preview','render-case');
  assert.equal(job.status,'blocked');assert.equal(job.productionAuthority,false);assert.match(job.blocker,/구현되지/);
  assert.throws(()=>claimJob(job.id),e=>e.status===409);
  assert.throws(()=>retryJob(job.id),e=>e.status===409);
  assert.equal(getJob(job.id).artifacts.length,0);
});
