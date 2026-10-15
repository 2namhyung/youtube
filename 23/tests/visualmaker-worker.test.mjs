import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject} from '../visualmaker/core/store.ts';
import {attachUpload} from '../visualmaker/core/upload.ts';
import {artifactFile,cancelJob,claimJob,enqueueJob,executeClaim,failUnclaimableJob,getJob,recoverJob,renewClaim,retryJob} from '../visualmaker/core/jobs.ts';
import {dispatchJob} from '../visualmaker/core/dispatch.ts';

const entry=path.resolve('visualmaker/worker.ts');
function fixture(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-worker-'));return insertProject(createPlan('작업 검사','첫 자료를 확인합니다.'));}
function worker(...args){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--experimental-strip-types',entry,...args],{cwd:process.cwd(),env:{...process.env,VISUALMAKER_DATA_DIR:process.env.VISUALMAKER_DATA_DIR},windowsHide:true});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});child.once('error',reject);child.once('exit',code=>resolve({code,stderr}));
});}
async function until(id,status){const deadline=Date.now()+10000;while(Date.now()<deadline){const job=getJob(id);if(job.status===status)return job;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail(`timed out waiting for ${status}: ${getJob(id).status}`);}
function db(){return new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));}

test('API dispatcher starts a real detached subprocess using the same data root',async()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,plan.revision,'planning-package','dispatch');
  await dispatchJob(queued.id);
  assert.notEqual(getJob(queued.id).status,'queued');
  const done=await until(queued.id,'succeeded');
  assert.equal(done.attempt,1);assert.equal(done.artifacts.length,4);assert.equal(done.productionAuthority,false);
  assert.equal(JSON.parse(artifactFile(done.id,'plan.json').bytes).productionAuthority,false);
  await assert.rejects(dispatchJob(done.id),error=>error.status===409);
});

test('spawned child bootstrap exit fails dispatch and leaves a bounded failed job',async()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,1,'planning-package','bootstrap-exit');
  const temporary=mkdtempSync(path.join(os.tmpdir(),'vm-broken-bootstrap-'));
  mkdirSync(path.join(temporary,'visualmaker'));
  writeFileSync(path.join(temporary,'visualmaker','worker.ts'),'process.exit(17);\n');
  const previous=process.cwd();
  try{
    process.chdir(temporary);
    await assert.rejects(dispatchJob(queued.id),error=>error.status===503&&/선점 전/.test(error.message));
  }finally{process.chdir(previous);}
  const failed=getJob(queued.id);
  assert.equal(failed.status,'failed');assert.equal(failed.attempt,0);assert.equal(failed.productionAuthority,false);
  assert.equal(failed.artifacts.length,0);assert.match(failed.error,/선점 전/);
});

test('claimed work survives a delayed IPC acknowledgement past startup timeout',async()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,1,'planning-package','delayed-ack');
  const temporary=mkdtempSync(path.join(os.tmpdir(),'vm-delayed-ack-'));
  mkdirSync(path.join(temporary,'visualmaker'));
  const jobsUrl=pathToFileURL(path.resolve('visualmaker/core/jobs.ts')).href;
  writeFileSync(path.join(temporary,'visualmaker','worker.ts'),`import {claimJob,executeClaim} from '${jobsUrl}';\nconst id=process.argv.at(-1); const claim=claimJob(id);\nsetTimeout(()=>{if(process.send&&process.connected)process.send({type:'claimed',jobId:id},()=>{});executeClaim(id,claim.token,claim.snapshot);},1400);\n`);
  const previous=process.cwd();
  try{
    process.chdir(temporary);
    await assert.rejects(dispatchJob(queued.id,700),error=>error.status===409);
  }finally{process.chdir(previous);}
  assert.equal(getJob(queued.id).status,'running');
  const done=await until(queued.id,'succeeded');assert.equal(done.attempt,1);assert.equal(done.artifacts.length,4);
});

test('startup failure CAS preserves a competing worker claim',async()=>{
  const plan=fixture();const queued=enqueueJob(plan.id,1,'planning-package','competing-startup');
  const temporary=mkdtempSync(path.join(os.tmpdir(),'vm-competing-startup-'));
  mkdirSync(path.join(temporary,'visualmaker'));
  writeFileSync(path.join(temporary,'visualmaker','worker.ts'),'setTimeout(()=>process.exit(19),600);\n');
  const previous=process.cwd();let claim;
  try{
    process.chdir(temporary);
    const pending=dispatchJob(queued.id,2000);
    await new Promise(resolve=>setTimeout(resolve,150));
    claim=claimJob(queued.id);
    await assert.rejects(pending,error=>error.status===409);
  }finally{process.chdir(previous);}
  const race=failUnclaimableJob(queued.id,'late bootstrap failure');
  assert.equal(race.changed,false);assert.equal(race.job.status,'running');
  const done=executeClaim(queued.id,claim.token,claim.snapshot);
  assert.equal(done.status,'succeeded');assert.equal(done.attempt,1);
});

test('competing process drains claim once and a corrupt queued snapshot does not block following work',async()=>{
  const plan=fixture();const bad=enqueueJob(plan.id,1,'planning-package','bad');const good=enqueueJob(plan.id,1,'planning-package','good');
  const connection=db();connection.prepare('UPDATE visualmaker_jobs SET snapshot_json=? WHERE id=?').run('{bad',bad.id);connection.close();
  const exits=await Promise.all([worker('--drain'),worker('--drain')]);
  assert.ok(exits.every(result=>result.code===0),JSON.stringify(exits));
  assert.equal(getJob(bad.id).status,'failed');assert.equal(getJob(bad.id).attempt,0);
  const done=getJob(good.id);assert.equal(done.status,'succeeded');assert.equal(done.attempt,1);assert.equal(done.attempts.length,1);
});

test('expired and cancelled claims cannot renew or publish; retry keeps the snapshot',()=>{
  const plan=fixture();const job=enqueueJob(plan.id,1,'planning-package','lease');const claim=claimJob(job.id);
  assert.equal(renewClaim(job.id,claim.token,20).progress,20);
  const connection=db();connection.prepare('UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',job.id);connection.close();
  assert.throws(()=>renewClaim(job.id,claim.token,30),error=>error.status===409);
  assert.throws(()=>executeClaim(job.id,claim.token,claim.snapshot),error=>error.status===409);
  assert.equal(recoverJob(job.id).status,'failed');
  assert.equal(retryJob(job.id).snapshotSha256,job.snapshotSha256);
  const fresh=claimJob(job.id);
  cancelJob(job.id);
  assert.throws(()=>renewClaim(job.id,fresh.token,50),error=>error.status===409);
  assert.throws(()=>executeClaim(job.id,fresh.token,fresh.snapshot),error=>error.status===409);
  assert.equal(getJob(job.id).artifacts.length,0);
});

test('worker revalidates local source bytes after enqueue',async()=>{
  const plan=fixture();const requirement=plan.requirements.find(item=>item.mediaType==='image');assert.ok(requirement);
  const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#ffffff'}}).png().toBuffer();
  const saved=await attachUpload(plan.id,1,requirement.id,bytes,{originalName:'fixture.png',sourceUrl:'https://example.org/fixture',creator:'Test',rightsNote:'Test only',semanticNote:'Local test',evidenceOnly:'false'});
  const job=enqueueJob(saved.id,saved.revision,'planning-package','mutated-source');
  writeFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,saved.assets[0].path),'changed');
  const result=await worker('--job',job.id);assert.equal(result.code,1,result.stderr);
  const failed=getJob(job.id);assert.equal(failed.status,'failed');assert.equal(failed.artifacts.length,0);assert.match(failed.error,/자료 또는 검증 기록/);
});

test('blocked render cannot be dispatched to a worker',async()=>{
  const plan=fixture();const job=enqueueJob(plan.id,1,'render-preview','blocked');
  assert.equal(job.productionAuthority,false);await assert.rejects(dispatchJob(job.id),error=>error.status===409);
});
