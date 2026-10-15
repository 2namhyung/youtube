import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createPlan} from '../visualmaker/core/director.ts';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {authorityFingerprintsStillMatch,currentPlanForCanonical,evaluateCanonicalCut,resolveCanonicalWindow,safeCanonicalFile,validationSourceFingerprints} from '../visualmaker/core/canonical-cut-render.ts';
import {assertCanonicalDeadline,boundedCanonicalRead,buildCanonicalExecutionContract,cancelJob,canonicalArtifactFile,claimJob,copyCanonicalInputs,enqueueCanonicalJob,getJob,recoverJob,renewClaim,retryJob,verifyCanonicalCopiedInputs} from '../visualmaker/core/jobs.ts';
import {GET as contractGet} from '../src/app/api/studio/cut-render-contract/route.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {canonicalByteRange,GET as mediaGet} from '../src/app/api/studio/cuts/media/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {currentCanonicalEnqueue,currentCanonicalMedia,currentCanonicalReport,currentStudioDownload} from '../src/components/studio/canonical-client.ts';

function isolated(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-canonical-'));return insertProject(importEpisode());}
const url='http://127.0.0.1:8138';
const headers={'x-visualmaker-token':studioToken()};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('current episode is an explicit blocked canonical report, never a fake preview',async()=>{
  const plan=isolated();const report=await evaluateCanonicalCut(plan,plan.scenes[0].id);
  assert.equal(report.schemaVersion,'visualmaker-canonical-cut-render-v1');assert.equal(report.scope.cutId,'SH001');
  assert.equal(report.renderEligible,false);assert.deepEqual([report.productionAuthority,report.cutPass,report.stylePass,report.playableParity],[false,false,false,false]);
  assert.ok(report.blockers.some(b=>b.code==='missing-active-cut-root'));assert.equal(report.composition,null);assert.equal(report.inputs.length,0);
  const response=await contractGet(new Request(`${url}/api/studio/cut-render-contract?id=${plan.id}&baseRevision=1&sceneId=${plan.scenes[0].id}`,{headers}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).report.renderEligible,false);
  const queued=await enqueueCanonicalJob(plan.id,1,plan.scenes[0].id,'blocked-current');assert.equal(queued.status,'blocked');assert.equal(queued.sceneId,plan.scenes[0].id);assert.ok(queued.executionContractSha256);
  assert.equal(queued.artifacts.length,0);assert.throws(()=>claimJob(queued.id),e=>e.status===409);assert.throws(()=>retryJob(queued.id),e=>e.status===409);
});

test('scope validation and replay preserve the exact old contract after a later edit',async()=>{
  const plan=isolated();const scene=plan.scenes[0].id;const other=plan.scenes[1].id;
  const initial=await enqueueCanonicalJob(plan.id,1,scene,'same-request');
  updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새 의미',role:'context'});
  assert.deepEqual(await enqueueCanonicalJob(plan.id,1,scene,'same-request'),initial);
  await assert.rejects(enqueueCanonicalJob(plan.id,1,other,'same-request'),e=>e.status===409);
  await assert.rejects(enqueueCanonicalJob(plan.id,1,scene,'new-request'),e=>e.status===409);
  assert.throws(()=>currentPlanForCanonical(plan.id,1),e=>e.status===409);
  const stale=await contractGet(new Request(`${url}/api/studio/cut-render-contract?id=${plan.id}&baseRevision=1&sceneId=${scene}`,{headers}));assert.equal(stale.status,409);
});

test('HTTP refuses unauthenticated, freeform and malformed canonical requests',async()=>{
  const plan=isolated();const scene=plan.scenes[0].id;
  assert.equal((await contractGet(new Request(`${url}/api/studio/cut-render-contract?id=${plan.id}&baseRevision=1&sceneId=${scene}`))).status,403);
  assert.equal((await contractGet(new Request(`${url}/api/studio/cut-render-contract?id=${plan.id}&baseRevision=1&sceneId=${scene}&entry=evil`,{headers}))).status,400);
  assert.equal((await contractGet(new Request(`${url}/api/studio/cut-render-contract?id=${plan.id}&baseRevision=1&sceneId=scene_nonexistent`,{headers}))).status,404);
  const body={action:'enqueue',kind:'canonical-cut-preview',projectId:plan.id,baseRevision:1,sceneId:scene,idempotencyKey:'hostile',entry:'video/src/fake.tsx'};
  const rejected=await jobsPost(new Request(`${url}/api/studio/jobs`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}));assert.equal(rejected.status,400);
  const freeform=insertProject(createPlan('ordinary','A normal plan.'));
  const blocked=await enqueueCanonicalJob(freeform.id,1,freeform.scenes[0].id,'freeform');assert.equal(blocked.status,'blocked');
  assert.ok(blocked.blocker?.includes('episode-spec'));
});

test('pending or wrong-scope media never exposes an artifact',async()=>{
  const plan=isolated();const scene=plan.scenes[0].id;const job=await enqueueCanonicalJob(plan.id,1,scene,'media-blocked');
  await assert.rejects(canonicalArtifactFile(job.id,'provisional-cut.mp4',{projectId:plan.id,sceneId:scene,attempt:0}),e=>e.status===409);
  const query=new URLSearchParams({jobId:job.id,projectId:plan.id,sceneId:scene,attempt:'1'});
  assert.equal((await mediaGet(new Request(`${url}/api/studio/cuts/media?${query}`,{headers}))).status,409);
  assert.equal((await mediaGet(new Request(`${url}/api/studio/cuts/media?${query}`))).status,403);
  assert.equal(getJob(job.id).artifacts.length,0);
});

test('semantic beat, segment assignment, and candidate edits cannot inherit canonical eligibility',async()=>{
  isolated();const source=importEpisode();const sceneId=source.scenes[0].id;
  const edit=(mutate)=>{const plan=structuredClone(source);mutate(plan);return plan;};
  for(const plan of [
    edit(p=>{p.beats[0].role='comparison';}),
    edit(p=>{p.beats[0].segmentIds=[p.beats[1].segmentIds[0]];}),
    edit(p=>{p.scenes[0].candidates[0].change='채택되지 않은 다른 화면';}),
    edit(p=>{p.scenes[0].selectedCandidateId=p.scenes[0].candidates[1].id;})
  ]){
    const report=await evaluateCanonicalCut(plan,sceneId);
    assert.ok(report.blockers.some(b=>b.code==='unadopted-editorial-change'));
    assert.equal(report.renderEligible,false);
  }
});

test('internal source symlink is rejected even when it resolves inside the allowed root',t=>{
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-canonical-link-')));
  mkdirSync(path.join(root,'inputs'));writeFileSync(path.join(root,'inputs','real.bin'),'source');
  let relative='inputs/alias.bin';
  try{symlinkSync(path.join(root,'inputs','real.bin'),path.join(root,'inputs','alias.bin'),'file');}
  catch{try{mkdirSync(path.join(root,'inputs','actual'));writeFileSync(path.join(root,'inputs','actual','real.bin'),'source');symlinkSync(path.join(root,'inputs','actual'),path.join(root,'inputs','alias-dir'),'junction');relative='inputs/alias-dir/real.bin';}
    catch{t.skip('local filesystem does not permit a symlink or junction fixture');return;}}
  assert.throws(()=>safeCanonicalFile(root,relative),e=>e.status===409);
  assert.equal(safeCanonicalFile(root,'inputs/real.bin'),path.join(root,'inputs','real.bin'));
});

test('client report and media checks reject late cross-scene or cross-attempt responses',async()=>{
  const plan=isolated();const scene=plan.scenes[0].id;const report=await evaluateCanonicalCut(plan,scene);
  assert.ok(await currentCanonicalReport(report,plan,scene));
  assert.equal(await currentCanonicalReport(report,plan,plan.scenes[1].id),null);
  assert.equal(await currentCanonicalReport({...report,productionAuthority:true},plan,scene),null);
  const response=new Response(new Uint8Array([1]),{headers:{'content-type':'video/mp4','x-visualmaker-project-id':plan.id,'x-visualmaker-job-id':'job_one','x-visualmaker-scene-id':scene,'x-visualmaker-attempt':'2'}});
  assert.equal(currentCanonicalMedia(response,{projectId:plan.id,jobId:'job_one',sceneId:scene,attempt:2}),true);
  assert.equal(currentCanonicalMedia(response,{projectId:plan.id,jobId:'job_one',sceneId:scene,attempt:1}),false);
  assert.equal(currentCanonicalMedia(response,{projectId:plan.id,jobId:'job_one',sceneId:plan.scenes[1].id,attempt:2}),false);
});

test('client accepts only the exact immutable enqueue contract and false authority',async()=>{
  const plan=isolated();const scene=plan.scenes[0].id;const base=await evaluateCanonicalCut(plan,scene);
  const report={...base,renderEligible:true,blockers:[],validators:['one','two','three','four'].map(name=>({name,passed:true})),composition:{id:'EP001-Cut-SH001-Provisional',width:1920,height:1080,fps:30,durationFrames:120,mode:'source-photo'}};
  const contract=buildCanonicalExecutionContract(report,'2026-10-13T00:00:00.000Z');
  const job={kind:'canonical-cut-preview',status:'queued',projectId:plan.id,requestedRevision:1,sceneId:scene,snapshotSha256:report.snapshotSha256,productionAuthority:false,executionContractSha256:sha(JSON.stringify(contract))};
  assert.deepEqual(await currentCanonicalEnqueue({job,executionContract:contract},report,plan,scene),job);
  assert.equal(await currentCanonicalEnqueue({job:{...job,snapshotSha256:'0'.repeat(64)},executionContract:contract},report,plan,scene),null);
  assert.equal(await currentCanonicalEnqueue({job:{...job,productionAuthority:true},executionContract:contract},report,plan,scene),null);
  assert.equal(await currentCanonicalEnqueue({job,executionContract:{...contract,createdAt:'changed'}},report,plan,scene),null);
  assert.equal(await currentCanonicalEnqueue({job,executionContract:contract},{...report,scope:{...report.scope,sceneId:plan.scenes[1].id}},plan,scene),null);
});

test('synthetic catalog resolves full selected cut and only intersecting boundary dependencies',()=>{
  const cuts=['SH000','SH001','SH002','SH003'].map(id=>({shot_id:id,manifest:{production_mode:'source-photo'}}));
  const boundaries=[{boundary_id:'before',outgoing_shot_id:'SH000',incoming_shot_id:'SH001',start_frame:95,duration_frames:10},{boundary_id:'after',outgoing_shot_id:'SH001',incoming_shot_id:'SH002',start_frame:155,duration_frames:10},{boundary_id:'outside',outgoing_shot_id:'SH002',incoming_shot_id:'SH003',start_frame:205,duration_frames:10}];
  const catalog={cuts,boundaries,compositions:[{kind:'cut',shot_id:'SH001',composition_id:'EP001-Cut-SH001-Provisional',window_start_frame:100,duration_frames:60}],width:1920,height:1080,fps:30};
  const window=resolveCanonicalWindow(catalog,'SH001');
  assert.equal(window.composition.durationFrames,60);assert.deepEqual(window.boundaryIds,['after','before']);
  assert.deepEqual(window.dependencies,[{cutId:'SH000',boundaryIds:['before']},{cutId:'SH001',boundaryIds:['after','before']},{cutId:'SH002',boundaryIds:['after']}]);
  const execution=buildCanonicalExecutionContract({composition:window.composition,dependencyCutIds:window.dependencies.map(item=>item.cutId),boundaryIds:window.boundaryIds,inputs:[],renderEligible:true,productionAuthority:false,cutPass:false,stylePass:false,playableParity:false},'2026-10-13T00:00:00.000Z');
  assert.equal(execution.reportSha256,sha(JSON.stringify(execution.report)));
  assert.deepEqual(execution.report.dependencyCutIds,['SH000','SH001','SH002']);
  assert.equal(resolveCanonicalWindow(catalog,'SH003'),null);
});

test('synthetic selected input closure copies exact bytes and detects source or attempt tamper',()=>{
  const original=process.cwd();const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-canonical-copy-')));
  const relative='video/public/assets/active/cuts/SH001/source.png';const source=path.join(root,...relative.split('/'));mkdirSync(path.dirname(source),{recursive:true});writeFileSync(source,'synthetic-visual-byte-input');
  const work=path.join(root,'attempt','work');mkdirSync(work,{recursive:true});
  const bytes=readFileSync(source);const report=buildCanonicalExecutionContract({inputs:[{path:relative,bytes:bytes.length,sha256:sha(bytes),cutId:'SH001',boundaryIds:[]}],renderEligible:true},'2026-10-13T00:00:00.000Z').report;
  try{process.chdir(root);copyCanonicalInputs(work,report);verifyCanonicalCopiedInputs(work,report);
    const copied=path.join(work,'public','assets','active','cuts','SH001','source.png');assert.equal(sha(readFileSync(copied)),sha(bytes));
    writeFileSync(copied,'tamper');assert.throws(()=>verifyCanonicalCopiedInputs(work,report),e=>e.status===409);
    writeFileSync(copied,bytes);writeFileSync(source,'tamper');assert.throws(()=>verifyCanonicalCopiedInputs(work,report),e=>e.status===409);
  }finally{process.chdir(original);}
});

test('validator import closure fingerprints nested helper and refuses changed bytes',()=>{
  const original=process.cwd();const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-canonical-closure-')));const folder=path.join(root,'video','scripts');mkdirSync(folder,{recursive:true});
  writeFileSync(path.join(folder,'root.mjs'),"import './helper.mjs';\n");writeFileSync(path.join(folder,'helper.mjs'),"import './nested.mjs';\n");writeFileSync(path.join(folder,'nested.mjs'),'export const value = 1;\n');
  const fingerprints=validationSourceFingerprints(root,['video/scripts/root.mjs']);assert.equal(Object.keys(fingerprints).length,3);
  try{process.chdir(root);assert.equal(authorityFingerprintsStillMatch({fingerprints}),true);writeFileSync(path.join(folder,'nested.mjs'),'export const value = 2;\n');assert.equal(authorityFingerprintsStillMatch({fingerprints}),false);}finally{process.chdir(original);}
});

test('canonical kind cancellation, lease fencing and overall deadline never publish',async()=>{
  const plan=isolated();const job=await enqueueCanonicalJob(plan.id,1,plan.scenes[0].id,'lease-fixture');
  const db=new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));db.prepare("UPDATE visualmaker_jobs SET status='queued',blocker=NULL WHERE id=?").run(job.id);db.close();
  const claim=claimJob(job.id);assert.equal(claim.job.kind,'canonical-cut-preview');
  cancelJob(job.id);assert.throws(()=>renewClaim(job.id,claim.token,45),e=>e.status===409);
  assert.equal(getJob(job.id).artifacts.length,0);assert.equal(retryJob(job.id).status,'queued');
  assert.throws(()=>assertCanonicalDeadline(100,100),e=>e.status===409);assert.doesNotThrow(()=>assertCanonicalDeadline(101,100));
  const second=claimJob(job.id);const conn=new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));conn.prepare("UPDATE visualmaker_jobs SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(job.id);conn.close();
  assert.equal(recoverJob(job.id).status,'failed');assert.equal(getJob(job.id).artifacts.length,0);
  assert.throws(()=>renewClaim(job.id,second.token,45),e=>e.status===409);
});

test('scoped download rejects project, revision, scene and attempt changes after the blob arrives',()=>{
  const scope={projectId:'plan-a',revision:4,sceneId:'scene-1'};
  const job={projectId:'plan-a',requestedRevision:4,sceneId:'scene-1',attempt:2,status:'succeeded'};
  assert.equal(currentStudioDownload(scope,scope,job,job),true);
  assert.equal(currentStudioDownload(scope,{...scope,projectId:'plan-b'},job,job),false);
  assert.equal(currentStudioDownload(scope,{...scope,revision:5},job,job),false);
  assert.equal(currentStudioDownload(scope,{...scope,sceneId:'scene-2'},job,job),false);
  assert.equal(currentStudioDownload(scope,scope,job,{...job,attempt:3}),false);
});

test('media range and file size checks are bounded before allocation',()=>{
  assert.deepEqual(canonicalByteRange('bytes=0-3',100),{start:0,end:3});
  assert.deepEqual(canonicalByteRange('bytes=99-',100),{start:99,end:99});
  assert.equal(canonicalByteRange('bytes=0-1048576',2_000_000),null);
  assert.equal(canonicalByteRange('bytes=10-9',100),null);
  assert.equal(canonicalByteRange('bytes=0-1,3-4',100),null);
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-canonical-size-')));const file=path.join(root,'movie.mp4');writeFileSync(file,'synthetic');
  assert.throws(()=>boundedCanonicalRead(file,400_000_001,400_000_000),e=>e.status===409);
  assert.throws(()=>boundedCanonicalRead(file,4,400_000_000),e=>e.status===409);
  assert.equal(boundedCanonicalRead(file,9,400_000_000).toString(),'synthetic');
});
