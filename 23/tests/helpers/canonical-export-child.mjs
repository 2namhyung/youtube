// Executes only inside the explicit Temp mirror. No real approval or episode is edited.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {closeSync,copyFileSync,existsSync,fstatSync,mkdirSync,readFileSync,readdirSync,statfsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {runtimeSha256,reviewBundleSha256} from '../../video/scripts/visual-contract-v2.mjs';
import {sceneRuntimeSha256} from '../../video/scripts/render-authority-lib.mjs';
import {APPROVAL_RUNTIME_FILES,SCENE_RUNTIME_FILES,TRANSITION_RUNTIME_FILES} from '../../video/scripts/runtime-file-closure.mjs';

const root=process.cwd();assert.match(path.basename(root),/^vm-canonical-export-/u);
const input=JSON.parse(readFileSync('fixture-authoring-input.json','utf8'));
const episode='video/episodes/episode-001';
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const put=(relative,value)=>{const file=path.resolve(root,relative);assert.ok(file.startsWith(root+path.sep));mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,json(value));};
if(process.argv.includes('--prepare-browser'))assert.ok(process.argv.includes('--pipeline')&&process.argv.includes('--mix-v2'),'Browser preparation requires the normal v2 pipeline');
async function durableExport({jobs,plan,finalReport}){
  const {studioToken}=await import('../../visualmaker/core/http.ts');
  const {openDb}=await import('../../visualmaker/core/store.ts');
  const {GET:readinessGet}=await import('../../src/app/api/studio/finalization/route.ts');
  const {POST:jobsPost,GET:jobsGet}=await import('../../src/app/api/studio/jobs/route.ts');
  const {GET:mediaGet}=await import('../../src/app/api/studio/jobs/export-media/route.ts');
  const {videoStream}=await import('../../src/app/api/studio/jobs/episode-media/route.ts');
  const base='http://127.0.0.1:8138/api/studio',checks=[],lifecycle=[];
  const save=()=>put('durable-api-proof.json',{scope:'actual Request/Response handlers; no HTTP server or browser assertion',checks,lifecycle});
  const request=(route,init={})=>new Request(base+route,{...init,headers:{host:'127.0.0.1:8138','x-visualmaker-token':studioToken(),...(init.headers??{})}});
  const publicDto=value=>{const text=JSON.stringify(value);assert.equal(text.includes(root),false);assert.equal(text.includes(root.replaceAll('\\','\\\\')),false);assert.doesNotMatch(text,/"(?:leaseToken|lease_token|bytesBase64|snapshot_json|execution_contract_json|sourcePath)"/u);};
  const checkedJson=async(label,response,status)=>{const payload=await response.json();checks.push({label,status:response.status,payload});save();assert.equal(response.status,status,`${label}: ${JSON.stringify(payload)}`);publicDto(payload);return payload;};
  const command=(body)=>jobsPost(request('/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  const readinessRoute=`/finalization?projectId=${plan.id}&baseRevision=${plan.revision}`;
  const readiness=await checkedJson('ready',await readinessGet(request(readinessRoute)),200);
  assert.equal(readiness.readiness.renderEligible,true);assert.equal(readiness.readiness.binding,undefined);assert.equal(readiness.readiness.fingerprints,undefined);
  await checkedJson('readiness unauthorized',await readinessGet(request(readinessRoute,{headers:{'x-visualmaker-token':''}})),403);
  await checkedJson('readiness unknown query',await readinessGet(request(readinessRoute+'&sourcePath=private')),400);
  const body={action:'enqueue',projectId:plan.id,baseRevision:plan.revision,kind:'episode-finalization-export',idempotencyKey:'synthetic-finalization'};
  await checkedJson('enqueue caller options',await command({...body,sourcePath:'private'}),400);
  const enqueued=await checkedJson('enqueue',await command(body),201),id=enqueued.job.id;
  assert.equal(enqueued.job.status,'queued');assert.equal(enqueued.executionContract,undefined);assert.equal(enqueued.readiness.binding,undefined);
  put('finalization-job-queued.json',enqueued.job);
  const repeated=await checkedJson('idempotent enqueue',await command(body),201);assert.equal(repeated.job.id,id);
  const mediaRoute=(name='export.mp4',overrides={})=>'/jobs/export-media?'+new URLSearchParams({jobId:id,projectId:plan.id,baseRevision:String(plan.revision),attempt:'1',name,...overrides});
  await checkedJson('queued download',await mediaGet(request(mediaRoute())),409);
  // Genuine normal operations. The later labelled faults affect only this Temp
  // job's lease expiry or an owned SQLite trigger; no succeeded row is seeded.
  const cancelled=await checkedJson('cancel queued',await command({action:'cancel',jobId:id}),200);assert.equal(cancelled.job.status,'cancelled');
  assert.equal((await checkedJson('retry cancelled',await command({action:'retry',jobId:id}),200)).job.status,'queued');
  const held=jobs.claimJob(id);assert.equal(held.job.attempt,1);
  assert.throws(()=>jobs.renewClaim(id,randomUUID(),5),error=>error.status===409);
  await checkedJson('recover live lease',await command({action:'recover',jobId:id}),409);
  assert.equal((await checkedJson('cancel claimed before execution',await command({action:'cancel',jobId:id}),200)).job.status,'cancelled');
  await assert.rejects(jobs.executeFinalizationClaim(id,held.token,held.snapshot),error=>error.status===409);
  assert.equal((await checkedJson('retry cancelled attempt',await command({action:'retry',jobId:id}),200)).job.status,'queued');
  const expired=jobs.claimJob(id);assert.equal(expired.job.attempt,2);
  assert.equal(path.resolve(process.env.VISUALMAKER_DATA_DIR),path.join(root,'.fixture-data'));
  const expiryDb=openDb();try{
    assert.equal(expiryDb.prepare("UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=? AND status='running' AND attempt=? AND lease_token=?").run('2000-01-01T00:00:00.000Z',id,expired.job.attempt,expired.token).changes,1);
  }finally{expiryDb.close();}
  assert.throws(()=>jobs.renewClaim(id,expired.token,5),error=>error.status===409);
  const recovered=await checkedJson('recover synthetically expired real claim',await command({action:'recover',jobId:id}),200);
  assert.equal(recovered.job.status,'failed');assert.equal(recovered.job.leaseExpiresAt,null);assert.equal(recovered.job.attempts.at(-1).outcome,'failed');
  await assert.rejects(jobs.executeFinalizationClaim(id,expired.token,expired.snapshot),error=>error.status===409);
  lifecycle.push({phase:'synthetic-expiry-recovered',testOnlyFault:'only lease_expires_at of normally claimed Temp job changed',job:recovered.job});save();
  assert.equal((await checkedJson('retry recovered claim',await command({action:'retry',jobId:id}),200)).job.status,'queued');
  const rollback=jobs.claimJob(id);assert.equal(rollback.job.attempt,3);
  const trigger='fixture_reject_finalization_artifact';assert.match(id,/^job_[a-f0-9-]{36}$/u);
  const triggerDb=openDb();try{
    triggerDb.exec(`CREATE TRIGGER ${trigger} BEFORE INSERT ON visualmaker_job_artifacts WHEN NEW.job_id='${id}' BEGIN SELECT RAISE(ABORT,'synthetic-fixture-publication-rollback'); END`);
  }finally{triggerDb.close();}
  let rollbackError;
  try{await jobs.executeFinalizationClaim(id,rollback.token,rollback.snapshot);}catch(error){rollbackError=error;}
  finally{const db=openDb();try{db.exec(`DROP TRIGGER ${trigger}`);}finally{db.close();}}
  // Require the exact fault, not merely any failed render: an earlier real
  // product error must stop the fixture at that boundary.
  put('finalization-rollback-result.json',{testOnlyFault:'SQLite artifact INSERT abort after real FFmpeg and publication rename',error:String(rollbackError),job:jobs.getJob(id)});
  assert.match(String(rollbackError),/synthetic-fixture-publication-rollback/u);
  const rolledBack=jobs.getJob(id);assert.equal(rolledBack.status,'failed');assert.equal(rolledBack.artifacts.length,0);assert.equal(rolledBack.attempts.at(-1).outcome,'failed');
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',id,`attempt-${rollback.job.attempt}`)),false);
  const rowsDb=openDb();try{assert.equal(rowsDb.prepare('SELECT COUNT(*) AS count FROM visualmaker_job_artifacts WHERE job_id=?').get(id).count,0);}finally{rowsDb.close();}
  const staging=path.join(process.env.VISUALMAKER_DATA_DIR,'jobs','staging');
  const retainedRollbackStages=finalReport.binding.selection.version===2?readdirSync(staging):[];
  if(finalReport.binding.selection.version===2){
    assert.equal(retainedRollbackStages.length,1,'v2 failed publication retains exactly its private attempt');
    const retained=path.join(staging,retainedRollbackStages[0]);
    assert.deepEqual(readdirSync(retained),['work']);
    assert.deepEqual(readdirSync(path.join(retained,'work')).sort(),['contract.json','export.json','export.mp4','export.png','export.srt','export.vtt']);
    lifecycle.push({phase:'failed-v2-staging-retained',testOnlyFault:'the exact attempt-three SQLite rollback remains in private staging; no foreign files removed',staging:retainedRollbackStages[0]});save();
  }
  lifecycle.push({phase:'publication-rollback-proved',testOnlyFault:'owned Temp SQLite trigger removed before retry',job:rolledBack});save();
  assert.equal((await checkedJson('retry publication rollback',await command({action:'retry',jobId:id}),200)).job.status,'queued');
  await checkedJson('run caller options',await command({action:'run',jobId:id,output:'private'}),400);
  const started=await checkedJson('run via real dispatch worker',await command({action:'run',jobId:id}),202);
  lifecycle.push({phase:'worker-started',job:started.job});save();
  const deadline=Date.now()+180_000;let completed=jobs.getJob(id);
  while(['queued','running'].includes(completed.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));completed=jobs.getJob(id);}
  if(['queued','running'].includes(completed.status)){await command({action:'cancel',jobId:id});put('finalization-job-timeout.json',jobs.getJob(id));throw new Error('real finalization worker timed out; retained fixture, no cleanup');}
  put('finalization-job-terminal.json',completed);assert.equal(completed.status,'succeeded',JSON.stringify(completed));
  assert.equal(completed.attempt,4);assert.deepEqual(completed.attempts.map(attempt=>attempt.outcome),['cancelled','failed','failed','succeeded']);
  assert.equal(completed.leaseExpiresAt,null);assert.equal(completed.artifacts.length,5);
  const cleanupDeadline=Date.now()+10_000;
  while(JSON.stringify(readdirSync(staging).sort())!==JSON.stringify([...retainedRollbackStages].sort())&&Date.now()<cleanupDeadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(readdirSync(staging).sort(),[...retainedRollbackStages].sort(),'successful worker stage must settle; only deliberately failed v2 attempt may remain');
  lifecycle.push({phase:'succeeded-and-owned-staging-cleaned',job:completed,retainedFailedV2Attempts:retainedRollbackStages});save();
  const fetched=await checkedJson('jobs GET succeeded',await jobsGet(request(`/jobs?jobId=${id}`)),200);assert.equal(fetched.job.status,'succeeded');
  const verified=await jobs.finalizationArtifactFile(id,{projectId:plan.id,baseRevision:plan.revision,attempt:completed.attempt},'export.json');
  const receipt=verified.receipt;assert.equal(receipt.schemaVersion,finalReport.binding.selection.version===2?'visualmaker-finalization-job-receipt-v2':'visualmaker-finalization-job-receipt-v1');
  assert.equal(receipt.jobId,id);assert.equal(receipt.attempt,completed.attempt);assert.equal(receipt.projectId,plan.id);assert.equal(receipt.requestedRevision,plan.revision);
  assert.equal(receipt.executionContractSha256,completed.executionContractSha256);assert.equal(receipt.snapshotSha256,completed.snapshotSha256);
  assert.equal(receipt.source.jobId,finalReport.binding.selection.source.job_id);assert.equal(receipt.files.length,4);
  assert.equal(receipt.files.some(file=>file.name==='export.json'),false,'receipt binds four media files; DB binds receipt bytes');
  const stream=videoStream(verified.mp4.fd,verified.mp4.identity,0,verified.mp4.bytes-1);await stream.cancel();
  assert.throws(()=>fstatSync(verified.mp4.fd),error=>error.code==='EBADF');checks.push({label:'shared verified-FD stream cancel closes descriptor',passed:true});save();
  const finalWork=path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',id,`attempt-${completed.attempt}`);
  const files=['export.mp4','export.srt','export.vtt','export.png','export.json'].map(name=>{const artifact=completed.artifacts.find(file=>file.name===name);assert.ok(artifact);return {name,sha256:artifact.sha256,bytes:artifact.bytes};});
  const mediaTypes={'export.mp4':'video/mp4','export.srt':'application/x-subrip; charset=utf-8','export.vtt':'text/vtt; charset=utf-8','export.png':'image/png','export.json':'application/json; charset=utf-8'};
  const successfulMediaRoute=(name='export.mp4',extra={})=>mediaRoute(name,{attempt:String(completed.attempt),...extra});
  for(const file of files){
    const response=await mediaGet(request(successfulMediaRoute(file.name))),bytes=Buffer.from(await response.arrayBuffer());
    checks.push({label:`download ${file.name}`,status:response.status,bytes:bytes.length,sha256:sha(bytes),headers:Object.fromEntries(response.headers)});save();
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mediaTypes[file.name]);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-visualmaker-production-authority'),'false');
    assert.equal(response.headers.get('content-disposition'),`attachment; filename="${file.name}"`);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);
    assert.deepEqual(bytes,readFileSync(path.join(finalWork,file.name)));
  }
  const videoBytes=readFileSync(path.join(finalWork,'export.mp4'));
  const streamVerified=await jobs.finalizationArtifactFile(id,{projectId:plan.id,baseRevision:plan.revision,attempt:completed.attempt},'export.mp4');
  try{
    const changingStream=videoStream(streamVerified.mp4.fd,streamVerified.mp4.identity,0,streamVerified.mp4.bytes-1);
    // Change the already-open real fixture file before the first asynchronous
    // pull, exercising the shared stream's own error/close path without mocks.
    writeFileSync(path.join(finalWork,'export.mp4'),Buffer.concat([videoBytes,Buffer.from([0])]));
    await assert.rejects(new Response(changingStream).arrayBuffer(),error=>error.status===409);
    assert.throws(()=>fstatSync(streamVerified.mp4.fd),error=>error.code==='EBADF');
    checks.push({label:'shared verified-FD stream drift error closes descriptor',passed:true});save();
  }finally{writeFileSync(path.join(finalWork,'export.mp4'),videoBytes);try{closeSync(streamVerified.mp4.fd);}catch(error){if(error.code!=='EBADF')throw error;}}
  const ranged=await mediaGet(request(successfulMediaRoute(),{headers:{range:'bytes=0-63'}}));assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),`bytes 0-63/${videoBytes.length}`);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),videoBytes.subarray(0,64));checks.push({label:'MP4 range exact bytes',status:206});save();
  const invalidRange=await mediaGet(request(successfulMediaRoute(),{headers:{range:`bytes=${videoBytes.length}-`}}));assert.equal(invalidRange.status,416);assert.equal(invalidRange.headers.get('content-range'),`bytes */${videoBytes.length}`);await invalidRange.arrayBuffer();checks.push({label:'invalid range',status:416});save();
  for(const [label,route,headers,status] of [
    ['media unauthorized',successfulMediaRoute(),{'x-visualmaker-token':''},403],
    ['media foreign origin',successfulMediaRoute(),{origin:'https://example.invalid'},403],
    ['media foreign host',successfulMediaRoute(),{host:'example.invalid'},403],
    ['media unknown query',successfulMediaRoute()+'&path=private',{},400],
    ['media invalid name',successfulMediaRoute('../export.mp4'),{},400],
    ['media prior attempt',mediaRoute(),{},409],
    ['media wrong revision',successfulMediaRoute('export.mp4',{baseRevision:'2'}),{},409],
    ['media wrong project',successfulMediaRoute('export.mp4',{projectId:`plan-${randomUUID()}`}),{},409],
  ])await checkedJson(label,await mediaGet(request(route,{headers})),status);
  const artifactMutations=[];
  for(const file of files){const target=path.join(finalWork,file.name),original=readFileSync(target);try{
    writeFileSync(target,Buffer.concat([original,Buffer.from(' ')]));const response=await mediaGet(request(successfulMediaRoute(file.name)));await checkedJson(`tampered ${file.name}`,response,409);artifactMutations.push(file.name);
  }finally{writeFileSync(target,original);}}
  const stalePath=`${episode}/production-state.json`,stateBytes=readFileSync(stalePath),staleState=JSON.parse(stateBytes);staleState.final_voice.locked_at='2026-10-16T00:00:00Z';
  try{put(stalePath,staleState);const stale=await checkedJson('stale readiness',await readinessGet(request(readinessRoute)),200);assert.equal(stale.readiness.renderEligible,false);await checkedJson('stale media',await mediaGet(request(successfulMediaRoute())),409);}finally{writeFileSync(stalePath,stateBytes);}
  // A separate normally enqueued job exercises cancellation after the genuine
  // renderer child has created its first outputs, not merely after claim.
  const cancellationQueued=await checkedJson('enqueue child-cancellation job',await command({...body,idempotencyKey:'synthetic-finalization-child-cancel'}),201);
  const cancellationId=cancellationQueued.job.id;assert.notEqual(cancellationId,id);
  const beforeCancellationStages=readdirSync(staging).sort();
  await checkedJson('run child-cancellation job',await command({action:'run',jobId:cancellationId}),202);
  let childEvidence;const childDeadline=Date.now()+60_000;
  while(Date.now()<childDeadline&&jobs.getJob(cancellationId).status==='running'){
    for(const name of readdirSync(staging)){
      assert.match(name,/^[a-f0-9-]{36}$/u);const work=path.join(staging,name,'work');
      if(beforeCancellationStages.includes(name))continue;
      if(!existsSync(path.join(work,'export.srt'))||!existsSync(path.join(work,'export.vtt')))continue;
      const bytes=readFileSync(path.join(work,'contract.json'));
      if(sha(bytes)!==cancellationQueued.job.executionContractSha256)continue;
      childEvidence={observedAt:new Date().toISOString(),stage:name,work:path.relative(root,work),contractSha256:sha(bytes),srtSha256:sha(readFileSync(path.join(work,'export.srt'))),files:readdirSync(work),activeFfmpegObserved:false};break;
    }
    if(childEvidence)break;await new Promise(resolve=>setTimeout(resolve,25));
  }
  const cancellationResponse=await command({action:'cancel',jobId:cancellationId});
  const cancelledChild=await checkedJson('cancel after real child outputs started',cancellationResponse,200);
  const expectedAfter=finalReport.binding.selection.version===2?[...beforeCancellationStages,childEvidence?.stage].filter(Boolean).sort():[];
  const childCleanupDeadline=Date.now()+15_000;
  while(JSON.stringify(readdirSync(staging).sort())!==JSON.stringify(expectedAfter)&&Date.now()<childCleanupDeadline)await new Promise(resolve=>setTimeout(resolve,100));
  const cancellationProof={job:jobs.getJob(cancellationId),childEvidence:childEvidence??null,stagingAfter:readdirSync(staging)};
  put('finalization-child-cancellation.json',cancellationProof);
  assert.ok(childEvidence,'real child output phase was not observed; retain the actual terminal result');
  assert.equal(cancelledChild.job.status,'cancelled');assert.equal(cancellationProof.job.status,'cancelled');
  assert.equal(cancellationProof.job.attempt,1);assert.equal(cancellationProof.job.attempts[0].outcome,'cancelled');assert.equal(cancellationProof.job.artifacts.length,0);assert.equal(cancellationProof.job.leaseExpiresAt,null);
  assert.deepEqual(cancellationProof.stagingAfter.sort(),expectedAfter,'cancelled worker must settle, preserving only private failed v2 attempts');
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',cancellationId,'attempt-1')),false);
  await checkedJson('cancelled child has no download',await mediaGet(request(mediaRoute('export.mp4',{jobId:cancellationId}))),409);
  lifecycle.push({phase:'cancel-after-genuine-renderer-child-start',...cancellationProof});save();
  const gaps=['active FFmpeg process at cancellation not directly observed (genuine child-output phase cancellation proved)','route catch/finally FD closure instrumentation (shared stream cancel/error paths proved)'];
  put('durable-export-success.json',{test_only:true,job:completed,receipt,files,finalWork,checks,lifecycle,artifactMutations,cancellationProof,coverageGaps:gaps,httpServerTested:false,browserTested:false});
  return {job:completed,cancellationProof,finalWork,stages:['real jobs POST enqueue','real jobs POST run','dispatch worker','child FFmpeg','atomic publication','verified API downloads'],result:{files,measured:receipt.technical.measured,ffmpegVersion:receipt.technical.ffmpegVersion,productionAuthority:receipt.productionAuthority,reviewApproved:receipt.reviewApproved},checks,coverageGaps:gaps};
}
if(process.argv.includes('--evaluate')||process.argv.includes('--pipeline')){
  process.env.VISUALMAKER_DATA_DIR=path.resolve(root,'.fixture-data');
  const {importEpisode}=await import('../../visualmaker/core/episode.ts');
  const {insertProject}=await import('../../visualmaker/core/store.ts');
  const {evaluateAudioAssembly}=await import('../../visualmaker/core/audio-assembly.ts');
  const plan=insertProject(importEpisode());
  put('fixture-plan.json',plan);
  const report=await evaluateAudioAssembly(plan.id,plan.revision);
  put('audio-evaluation.json',report);
  if(process.argv.includes('--pipeline')){
    assert.equal(report.visual.renderEligible,true,JSON.stringify(report.visual.blockers));
    const jobs=await import('../../visualmaker/core/jobs.ts');
    const disk=statfsSync(root);put('fixture-disk.json',{freeBytes:disk.bavail*disk.bsize});
    const queued=await jobs.enqueueEpisodeJob(plan.id,plan.revision,'synthetic-provisional');
    put('provisional-job-queued.json',queued);assert.equal(queued.status,'queued');
    const claim=jobs.claimJob(queued.id);
    put('provisional-execution-contract.json',jobs.episodeJobContract(queued.id));
    let succeeded;
    try{succeeded=await jobs.executeEpisodeClaim(queued.id,claim.token,claim.snapshot);}
    catch(error){put('provisional-job-failure.json',{job:jobs.getJob(queued.id),error:String(error)});throw error;}
    put('provisional-job-succeeded.json',succeeded);assert.equal(succeeded.status,'succeeded');
    const verified=await jobs.episodeArtifactFile(queued.id,{projectId:plan.id,baseRevision:plan.revision,attempt:succeeded.attempt});
    try{put('verified-provisional-receipt.json',verified.receipt);}finally{closeSync(verified.mp4.fd);}
    const artifact=`.fixture-data/jobs/${queued.id}/attempt-${succeeded.attempt}/provisional-episode.mp4`;
    assert.equal(sha(readFileSync(artifact)),verified.receipt.output.sha256);
    const state=JSON.parse(readFileSync(`${episode}/production-state.json`,'utf8'));
    const visualMarker=`synthetic-test-only-not-human-review:${verified.receipt.output.sha256}`;
    state.provisional_video={status:'ready',artifact,artifact_sha256:verified.receipt.output.sha256,approval_marker:state.cut_review.approval_marker,test_only:true};
    state.visual_review={user_approved:true,all_cuts_passed:true,approval_marker:visualMarker,approved_artifact_sha256:verified.receipt.output.sha256,provisional_video_approval_marker:state.cut_review.approval_marker,test_only:true};
    state.final_script.user_visual_review_approval_marker=visualMarker;
    put(`${episode}/production-state.json`,state);
    const ready=await evaluateAudioAssembly(plan.id,plan.revision);
    put('audio-evaluation-after-provisional.json',ready);
    console.log(json({provisionalJobId:queued.id,attempt:succeeded.attempt,output:verified.receipt.output,renderEligible:ready.renderEligible,validators:ready.validators,blockers:ready.blockers}));
    assert.equal(ready.renderEligible,true,JSON.stringify(ready.blockers));
    const specBefore=readFileSync(`${episode}/episode-spec.json`),stateBefore=readFileSync(`${episode}/production-state.json`);
    const audioQueued=await jobs.enqueueAudioAssemblyJob(plan.id,plan.revision,'synthetic-audio');
    put('audio-job-queued.json',audioQueued);assert.equal(audioQueued.status,'queued');
    const audioClaim=jobs.claimJob(audioQueued.id),audioContract=jobs.audioAssemblyJobContract(audioQueued.id);
    put('audio-execution-contract.json',audioContract);
    let audioSucceeded;
    try{audioSucceeded=await jobs.executeAudioAssemblyClaim(audioQueued.id,audioClaim.token,audioClaim.snapshot);}
    catch(error){put('audio-job-failure.json',{job:jobs.getJob(audioQueued.id),error:String(error)});throw error;}
    put('audio-job-succeeded.json',audioSucceeded);assert.equal(audioSucceeded.status,'succeeded');
    const scope={projectId:plan.id,baseRevision:plan.revision,attempt:audioSucceeded.attempt};
    const audio=await jobs.audioAssemblyArtifactFile(audioQueued.id,scope);
    try{put('verified-audio-receipt.json',audio.receipt);}finally{closeSync(audio.mp4.fd);}
    assert.deepEqual(readFileSync(`${episode}/episode-spec.json`),specBefore);
    assert.deepEqual(readFileSync(`${episode}/production-state.json`),stateBefore);
    const spec=JSON.parse(specBefore),source={job_id:audioQueued.id,attempt:audioSucceeded.attempt,artifact_sha256:audio.receipt.output.sha256,receipt_sha256:sha(audio.receiptBytes)};
    const picturePath=`${episode}/synthetic-picture-approval.json`,captionPath=`${episode}/synthetic-caption-approval.json`;
    // Typed marker schemas intentionally forbid extra test flags; these paths and the
    // surrounding proof label them synthetic, never genuine user approval.
    const picture={schema_version:1,kind:'picture',episode_id:'episode-001',reviewer:'user',source,final_script_sha256:spec.script_lock.source_sha256};
    put(picturePath,picture);const pictureSha=sha(readFileSync(picturePath));
    const segments=[{cut_id:'SH001',start_frame:0,end_frame:input.voiceFrames,char_start:0,char_end:Array.from(input.narration).length,text:input.narration}];
    put(captionPath,{...picture,kind:'caption',caption_contract_sha256:sha(JSON.stringify({segments})),picture_marker_sha256:pictureSha});
    const selection={version:1,final_script:{path:spec.script_lock.source_path,sha256:spec.script_lock.source_sha256},source,picture_marker_sha256:pictureSha,captions:{segments,approval_marker:captionPath,approval_marker_sha256:sha(readFileSync(captionPath))},mix:{mode:'passthrough'},thumbnail:{frame:Math.floor(input.duration/2)}};
    if(process.argv.includes('--mix-v2')){
      const audioPath=path.join(process.env.VISUALMAKER_DATA_DIR,'jobs',audioQueued.id,`attempt-${audioSucceeded.attempt}`,'provisional-voiced-episode.mp4');
      const inspect=args=>{const result=spawnSync('ffprobe',['-v','error','-select_streams','a:0',...args,'-of','json',audioPath],{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:5_000_000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
      const frames=inspect(['-show_frames','-show_entries','frame=nb_samples']).frames,packets=inspect(['-show_packets','-show_entries','packet=pts,duration,side_data_list']).packets;
      const decoded=frames.reduce((sum,frame)=>sum+frame.nb_samples,0),skip=packets[0].side_data_list.find(item=>item.side_data_type==='Skip Samples').skip_samples;
      const presented=packets.reduce((sum,packet)=>sum+packet.duration,0)-skip-(packets.at(-1).side_data_list?.find(item=>item.side_data_type==='Skip Samples')?.discard_padding??0);
      assert.equal(presented,input.duration*1600);assert.ok(decoded>=presented&&decoded-presented<1024);
      const stems=[];
      for(const [index,kind,frequency,start,seconds,gain] of [[0,'music',220,48000,.6,-20],[1,'sfx',660,96000,.25,-24]]){
        const relative=`${episode}/synthetic-${kind}.wav`,absolute=path.join(root,relative);mkdirSync(path.dirname(absolute),{recursive:true});
        const generated=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000`,'-t',String(seconds),'-ac','2','-c:a','pcm_f32le',absolute],{encoding:'utf8',windowsHide:true,timeout:30_000});assert.equal(generated.status,0,generated.stderr);
        const evidencePath=`${episode}/synthetic-${kind}-rights.txt`;const evidence=`Synthetic test only: original ${kind} tone generated locally; designated YouTube publication permission for this isolated fixture.\n`;writeFileSync(path.join(root,evidencePath),evidence);
        stems.push({id:kind,kind,path:relative,sha256:sha(readFileSync(absolute)),bytes:readFileSync(absolute).length,decoded_samples:Math.round(seconds*48000),start_sample:start,gain_db:gain,source_url:`https://example.invalid/synthetic-${kind}`,creator:'Synthetic test generator',license:'Synthetic isolated technical permission',attribution:`Synthetic ${kind} tone`,rights_evidence_path:evidencePath,rights_evidence_sha256:sha(Buffer.from(evidence))});
      }
      const markerPath=`${episode}/synthetic-fixed-gain-mix-approval.json`,mix={mode:'fixed-gain-stems',sample_rate:48000,channels:2,duration_samples:presented,voice_decoded_samples:decoded,voice_tail_discard_samples:decoded-presented,stems,approval_marker:markerPath,approval_marker_sha256:'0'.repeat(64)};
      const {finalizationMixPayloadSha256}=await import('../../visualmaker/core/finalization-mix.ts');
      const marker={schema_version:1,kind:'fixed-gain-mix-input',episode_id:'episode-001',reviewer:'user',approved:true,source,final_script_sha256:spec.script_lock.source_sha256,picture_marker_sha256:pictureSha,caption_contract_sha256:sha(JSON.stringify({segments})),caption_marker_sha256:selection.captions.approval_marker_sha256,mix_payload_sha256:finalizationMixPayloadSha256(mix),decisions:stems.map(stem=>({id:stem.id,asset_sha256:stem.sha256,rights_evidence_sha256:stem.rights_evidence_sha256,decision:'permitted',allowed_use:'youtube-publication',attribution:stem.attribution,reason:'Synthetic fixture permits only this isolated technical export.'}))};
      put(markerPath,marker);mix.approval_marker_sha256=sha(readFileSync(markerPath));selection.version=2;selection.mix=mix;
      put('synthetic-mix-v2-authoring.json',{test_only:true,genuineHumanApproval:false,presented,decoded,tailDiscard:decoded-presented,stems});
    }
    put(spec.post_lock_output.addendum_path,{schema_version:1,episode_id:'episode-001',authority:{episode_spec_sha256:sha(specBefore),pre_lock_state_sha256:sha(stateBefore),source_execution_contract_sha256:sha(JSON.stringify(audioContract))},selection});
    const after=JSON.parse(stateBefore);after.stage='picture-locked';after.picture_lock={status:'locked',approved:true,final_qc_marker:picturePath};
    put(`${episode}/production-state.json`,after);
    assert.throws(()=>jobs.readVerifiedAudioAssemblyArtifact(audioQueued.id,scope));
    await assert.rejects(jobs.audioAssemblyArtifactFile(audioQueued.id,scope));
    const archived=await jobs.readAudioAssemblyForFinalization(audioQueued.id,scope);
    try{assert.equal(archived.mp4.sha256,source.artifact_sha256);put('verified-archival-authority.json',archived.authority);}finally{closeSync(archived.mp4.fd);}
    const {evaluateFinalization}=await import('../../visualmaker/core/finalization.ts');
    const finalReport=await evaluateFinalization(plan.id,plan.revision);put('finalization-evaluation.json',finalReport);
    assert.equal(finalReport.renderEligible,true,JSON.stringify(finalReport.blockers));
    if(process.argv.includes('--prepare-browser')){
      assert.equal(finalReport.binding?.selection.version,2);
      for(const forbidden of ['durable-api-proof.json','durable-export-success.json','canonical-export-success.json','finalization-job-queued.json','finalization-job-terminal.json'])assert.equal(existsSync(path.join(root,forbidden)),false,`Prepared fixture already executed finalization: ${forbidden}`);
      const {openDb}=await import('../../visualmaker/core/store.ts');
      const db=openDb();let database;
      try{
        const finalizationJobs=db.prepare("SELECT COUNT(*) AS count FROM visualmaker_jobs WHERE kind='episode-finalization-export'").get().count;
        const finalizationArtifacts=db.prepare("SELECT COUNT(*) AS count FROM visualmaker_job_artifacts WHERE name IN ('export.mp4','export.srt','export.vtt','export.png','export.json')").get().count;
        const audioRow=db.prepare('SELECT id,kind,status,project_id,requested_revision,snapshot_sha256,attempt FROM visualmaker_jobs WHERE id=?').get(audioQueued.id);
        const audioArtifacts=db.prepare('SELECT name,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(audioQueued.id);
        assert.equal(finalizationJobs,0,'Prepared fixture has a finalization job');assert.equal(finalizationArtifacts,0,'Prepared fixture has finalization artifacts');
        assert.equal(audioRow?.kind,'audio-timed-assembly');assert.equal(audioRow.status,'succeeded');assert.equal(audioRow.project_id,plan.id);assert.equal(audioRow.requested_revision,plan.revision);assert.equal(audioRow.snapshot_sha256,sha(JSON.stringify(plan)));assert.equal(audioRow.attempt,audioSucceeded.attempt);
        assert.deepEqual(audioArtifacts.map(item=>item.name),['provisional-voiced-episode.json','provisional-voiced-episode.mp4']);
        assert.equal(audioArtifacts[0].sha256,source.receipt_sha256);assert.equal(audioArtifacts[1].sha256,source.artifact_sha256);
        assert.equal(audioArtifacts[0].bytes,audio.receiptBytes.length);assert.equal(audioArtifacts[1].bytes,audio.receipt.output.bytes);
        assert.equal(audio.receipt.productionAuthority,false);assert.equal(audio.receipt.reviewApproved,false);
        database={finalizationJobs,finalizationArtifacts,audioJob:{id:audioRow.id,status:audioRow.status,kind:audioRow.kind,attempt:audioRow.attempt,snapshotSha256:audioRow.snapshot_sha256},audioArtifacts};
      }finally{db.close();}
      const prepared={schemaVersion:'visualmaker-synthetic-v2-browser-prepared-v1',test_only:true,genuineHumanApproval:false,finalizationExecuted:false,browserTested:false,projectId:plan.id,revision:plan.revision,planSnapshotSha256:sha(JSON.stringify(plan)),source,sourceJobId:audioQueued.id,sourceAttempt:audioSucceeded.attempt,audioExecutionContractSha256:sha(JSON.stringify(audioContract)),finalizationReportSha256:sha(JSON.stringify(finalReport)),selectionVersion:2,renderEligible:true,productionAuthority:false,reviewApproved:false,database};
      const preparedPath=path.join(root,'prepared-finalization-v2-browser.json');
      writeFileSync(preparedPath,json(prepared),{flag:'wx'});
      console.log(json({preparedBrowserV2:true,projectId:plan.id,revision:plan.revision,sourceJobId:audioQueued.id,finalizationJobs:database.finalizationJobs,finalizationArtifacts:database.finalizationArtifacts,finalizationExecuted:false,browserTested:false}));
      process.exit(0);
    }
    const durable=await durableExport({jobs,plan,finalReport}),{finalWork,stages,result}=durable;
    assert.deepEqual(result.files.map(file=>file.name),['export.mp4','export.srt','export.vtt','export.png','export.json']);
    for(const file of result.files){const bytes=readFileSync(path.join(finalWork,file.name));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);}
    assert.equal(result.productionAuthority,false);assert.equal(result.reviewApproved,false);
    assert.equal(result.measured.videoPacketSha256,result.measured.sourceVideoPacketSha256);
    if(selection.version===1)assert.equal(result.measured.audioPacketSha256,result.measured.sourceAudioPacketSha256);
    else{assert.notEqual(result.measured.audioPacketSha256,result.measured.sourceAudioPacketSha256);assert.equal(result.measured.videoPacketSha256,result.measured.sourceVideoPacketSha256);assert.equal(finalReport.binding.selection.mix.duration_samples,input.duration*1600);}
    assert.deepEqual(result.measured.frameSha256,result.measured.sourceFrameSha256);
    assert.equal(result.measured.thumbnailFrameSha256,result.measured.sourceThumbnailFrameSha256);
    assert.deepEqual(result.measured.subtitleText,[input.narration]);
    const negatives=[];
    const mutations=[
      [picturePath,bytes=>Buffer.concat([bytes,Buffer.from(' ')])],
      [spec.script_lock.source_path,bytes=>Buffer.concat([bytes,Buffer.from(' Changed fixture narration.')])],
      ['video/source-intake/episode-001/narration/final/SH001.wav',bytes=>{const changed=Buffer.from(bytes);changed[changed.length-1]^=1;return changed;}],
      [spec.post_lock_output.addendum_path,bytes=>{const value=JSON.parse(bytes);value.selection.source.artifact_sha256='0'.repeat(64);return Buffer.from(json(value));}],
      [`${episode}/production-state.json`,bytes=>{const value=JSON.parse(bytes);value.final_voice.locked_at='2026-10-15T00:00:00Z';return Buffer.from(json(value));}],
      [path.relative(root,finalReport.binding.sourcePath),bytes=>Buffer.concat([bytes,Buffer.from([0])])],
    ];
    for(const [relative,mutate] of mutations){
      const original=readFileSync(relative),changed=mutate(original);
      try{writeFileSync(relative,changed);const rejected=await evaluateFinalization(plan.id,plan.revision);assert.equal(rejected.renderEligible,false,relative);negatives.push({path:relative,rejected:true,blockers:rejected.blockers});}
      finally{writeFileSync(relative,original);}
    }
    assert.deepEqual(readFileSync(`${episode}/episode-spec.json`),specBefore);
    put('canonical-export-success.json',{test_only:true,genuineHumanApproval:false,provisionalJob:queued.id,audioJob:audioQueued.id,attempt:audioSucceeded.attempt,source,executionContractSha256:sha(JSON.stringify(audioContract)),finalizationJob:durable.job.id,finalizationAttempt:durable.job.attempt,cancelledChildJob:durable.cancellationProof.job.id,childStartCancellationProved:!!durable.cancellationProof.childEvidence,apiCheckCount:durable.checks.length,coverageGaps:durable.coverageGaps,httpServerTested:false,browserTested:false,finalWork,stages,result,negatives,oldStrictReadersRejectStateDrift:true,newArchivalReaderPassed:true,productionAuthority:false,reviewApproved:false});
    console.log(json({canonicalExportSucceeded:true,source,files:result.files,negativeCases:negatives.length,productionAuthority:false,reviewApproved:false}));
    process.exit(0);
  }
  console.log(json({renderEligible:report.renderEligible,validators:report.validators,visualValidators:report.visual.validators,blockers:report.blockers}));
  process.exit(report.renderEligible?0:1);
}
const contractsBytes=readFileSync(`${episode}/generated/manifest-contracts.json`),contract=JSON.parse(contractsBytes).cuts[0];
const cutPath=`${input.cutRoot}/cuts/SH001`;
mkdirSync('video/src/generated',{recursive:true});
for(const directory of ['assets','remotion','omni','source-photo','source-video','audio','preview'])mkdirSync(`${cutPath}/${directory}`,{recursive:true});
copyFileSync('video/public/assets/_cut-template/background.png',`${cutPath}/background.png`);
copyFileSync('video/source-intake/episode-001/narration/final/SH001.wav',`${cutPath}/audio/SH001.wav`);
const reviewArtifact=`${cutPath}/preview/provisional-review.png`;
copyFileSync(`${cutPath}/${input.source.file}`,reviewArtifact);
const stageRuntime=await runtimeSha256(root),catalogRuntime=await sceneRuntimeSha256();
const sourceId=contract.source_ids[0],assetId=contract.visual_components[0].asset_id;
const manifest={
  schema_version:3,presentation_contract_version:2,typography_surface_contract_version:2,layout_contract_version:2,
  source_spec_sha256:contract.source_spec_sha256,source_cut_sha256:contract.source_cut_sha256,manifest_contract_sha256:contract.manifest_contract_sha256,implementation_status:'implemented',
  episode_id:'episode-001',shot_id:'SH001',fps:30,duration_frames:input.duration,production_mode:'source-photo',background:'background.png',asset_directory:'assets',
  source_ids:[sourceId],source_materials:[{source_id:sourceId,original_url:input.source.original_url,rights_status:'CC0 synthetic fixture original',approval_status:'approved',test_only:true}],source_asset_materializations:[input.entry],
  asset_origin_policy:{version:1,person_imagegen_allowed:true,non_person_source_required:true},
  asset_provenance:[{asset_id:assetId,origin:'real-source',source_kind:'source-original',source_id:sourceId,source_path:input.source.file,original_url:input.source.original_url,license:'CC0',test_only:true,note:'Synthetic author-created source fixture; not acquired external evidence.'}],
  assets:[{asset_id:assetId,file:input.source.file,media_type:'image/png',asset_class:'object',role:'subject',source_id:sourceId,sha256:input.source.sha256}],
  animations:[],text_cues:[],effects:[],effects_required:false,treatments:[],
  visual_components:contract.visual_components.map(component=>({...component,layout:{left:160,top:90,width:1600,height:900},implementation_status:'implemented'})),
  visual_beats:contract.visual_beats,motion_actions:contract.planned_motion_actions.map(action=>({...action,implementation_status:'implemented'})),transition:contract.transition,
  review_profile:'source-photo-treatment',review_requirements:{generation_input_required:true,playable_cut_required:true,full_duration_preview_required:false,transition_pair_required:false,review_artifact:reviewArtifact,review_artifact_sha256:sha(readFileSync(reviewArtifact))},
  runtime_contract:{operator_registry:'video/src/vox/motion/operator-registry.ts',scene_renderer:'video/src/vox/scene/ManifestScene.tsx',runtime_sha256:stageRuntime},
  production_authoring_contract:{version:1,contract_path:'video/contracts/production-authoring-contract-v1.json',route:'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline',episode_spec_path:`${episode}/episode-spec.json`,episode_spec_sha256:contract.source_spec_sha256,generated_manifest_contracts_path:`${episode}/generated/manifest-contracts.json`,generated_manifest_contracts_sha256:sha(contractsBytes),render_catalog_path:`${episode}/generated/render-catalog.json`,cut_contract:{shot_id:'SH001',source_spec_sha256:contract.source_spec_sha256,source_cut_sha256:contract.source_cut_sha256,manifest_contract_sha256:contract.manifest_contract_sha256},visual_treatment:{surface:'Original synthetic photo source',palette:'Preserve original palette',typography:'No text surfaces',texture:'Untreated original pixels',prohibited_treatments:['unbound effects']},motion_contract:{target_asset_id:assetId,operator_id:'transform.tween@1',start_frame:1,end_frame:12,state_delta:'Photo scale settles from 1.08 to 1',reading_hold:contract.visual_beats[0].reading_hold},source_contract:{source_id:sourceId,source_kind:'source-original',locator:input.source.original_url,rights_status:'CC0 synthetic fixture original',materialization_status:'materialized',sha256:input.source.sha256},coverage_matrix:Object.fromEntries(['stage','focal','supporting','depth','entrance','internal-change','transition','hold','exclusions'].map(dimension=>[dimension,{status:['supporting','transition'].includes(dimension)?'not-applicable':'implemented',evidence:[`Synthetic single-source fixture contract: ${dimension}; inspect manifest and bound original.`]}])),production_authority:false},
  approvals:{generation_input:{status:'pending',user_pass:false,approval_marker:null,approved_bundle_sha256:null},playable_cut:{status:'pending',user_pass:false,approval_marker:null,approved_bundle_sha256:null}},
  mobile_review:{width:360,height:203,minimum_quote_font_px_at_1080p:72,maximum_quote_lines:2,requires_human_review:true},
  lifecycle:{background_only:{start_frame:0,end_frame:1,visible_asset_ids:[],visible_effect_ids:[]},reveal:{start_frame:1,end_frame:12},final_hold:{start_frame:input.duration-60,end_frame:input.duration},final_visible_asset_ids:[assetId],final_visible_effect_ids:[]},
  voiceover:{audio:'video/source-intake/episode-001/narration/final/SH001.wav',text:input.narration,status:'final-measured',start_frame:0,end_frame:input.voiceFrames,word_cues:[{word:input.narration,frame:0}]},
  final_qc:{status:'approved',marker:'synthetic-technical-final-qc-not-human-review'},review:{status:'pending',user_pass:false,approval_marker:null},
};
const bundle=await reviewBundleSha256({root,cutRoot:path.resolve(cutPath),manifest,reviewArtifact});
for(const approval of Object.values(manifest.approvals))Object.assign(approval,{status:'passed',user_pass:true,approval_marker:`synthetic-technical-only:${bundle}`,approved_bundle_sha256:bundle});
put(`${cutPath}/manifest.json`,manifest);
const untreated={mode:'untreated',operator_ids:[]};
const systemTreatment={mode:'protected-system-render-order',operator_ids:[],protection_mask:'system-render-order'};
put(`${cutPath}/asset-sheet.json`,{schema_version:1,contract_kind:'spatial-implementation-contract',shot_id:'SH001',layout_binding:'manifest-component-layout',canvas:{width:1920,height:1080},safe_areas:{essential:{left:80,top:64,right:80,bottom:64},overlay:{left:32,top:32,right:32,bottom:32}},background:{asset_binding:'manifest.background',layer_role:'background',depth:0,safe_area_policy:'edge-to-edge',treatment:untreated},layers:[{component_id:'photo',asset_id:assetId,layer_role:'subject',depth:1,anchor:'hero',safe_area_policy:'essential',occludes:[],occluded_by:[],treatment:untreated}],system_layers:[{system_id:'target-labels',depth:900,layer_role:'overlay',safe_area_policy:'overlay',treatment:systemTreatment},{system_id:'source-chrome',depth:901,layer_role:'overlay',safe_area_policy:'overlay',treatment:systemTreatment}],provenance:{status:'provisional-review-only',authoring:'synthetic technical fixture',basis:'Single source image with one semantic focal'}});
const state=JSON.parse(readFileSync(`${episode}/production-state.json`,'utf8'));
const aggregate=sha(`${path.basename(input.cutRoot)}/SH001|${bundle}`),marker=`synthetic-technical-only:${aggregate}`;
Object.assign(state,{render_authority:{status:'synthetic-technical-review',cut_root:input.cutRoot,catalog:`${episode}/generated/render-catalog.json`,present_shot_ids:['SH001'],production_authority:false},generation_input_review:{all_inputs_passed:true,approved_bundle_sha256:aggregate,approval_marker:marker},playable_cut_review:{all_playable_cuts_passed:true,approved_bundle_sha256:aggregate,approval_marker:marker},cut_review:{all_cuts_passed:true,approval_marker:marker},omni_video_generation:{status:'allowed',allowed_after_marker:marker},final_script:{status:'locked',locked_at:'2026-10-14T00:00:00Z',user_visual_review_approval_marker:'pending-provisional-fixture'},final_voice:{status:'locked',locked_at:'2026-10-14T00:00:00Z',all_cut_audio_measured:true}});
put(`${episode}/production-state.json`,state);
put('runtime-contract-boundary.json',{test_only:true,manifest_runtime_sha256:stageRuntime,production_stage_runtime_sha256:stageRuntime,render_authority_scene_runtime_sha256:catalogRuntime,manifest_path:`${cutPath}/manifest.json`,approval_runtime_files:APPROVAL_RUNTIME_FILES,scene_runtime_files:SCENE_RUNTIME_FILES,transition_runtime_files:TRANSITION_RUNTIME_FILES,untouched_validator_paths:['video/scripts/validate-production-stage.mjs','video/scripts/validate-render-authority.mjs']});
console.log(json({authored:'synthetic spec-bound source-photo manifest and asset-sheet; no real approval',stageRuntime,catalogRuntime,bundle}));
