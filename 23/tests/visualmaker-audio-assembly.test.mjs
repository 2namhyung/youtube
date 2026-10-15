import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {closeSync,copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {audioAssemblyFingerprintsStillMatch,bindUniqueFinalVoiceFile,evaluateAudioAssembly,narrationPlanPathFromState,placeVoices,probeDecodedVoice} from '../visualmaker/core/audio-assembly.ts';
import {runAudioAssemblyEngine} from '../visualmaker/renderer/audio-assembly-runner.ts';
import {streamedFileFingerprint} from '../visualmaker/core/episode-provisional.ts';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {dataRoot,insertProject,openDb,updateProject} from '../visualmaker/core/store.ts';
import {audioAssemblyArtifactFile,audioAssemblyJobContract,buildAudioAssemblyExecutionContract,cancelJob,claimJob,enqueueAudioAssemblyJob,getJob,publishAudioAssemblyResult,readVerifiedAudioAssemblyArtifact} from '../visualmaker/core/jobs.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {GET as readinessGet} from '../src/app/api/studio/audio-assembly/route.ts';
import {GET as mediaGet} from '../src/app/api/studio/jobs/audio-media/route.ts';
import {episodeByteRange,videoStream} from '../src/app/api/studio/jobs/episode-media/route.ts';
import {captureAudioAuthoritySnapshot,POST_LOCK_SPEC,POST_LOCK_STATE} from '../visualmaker/core/post-lock-transition.ts';
import {readAudioAssemblyForFinalization} from '../visualmaker/core/jobs.ts';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function ffmpeg(args){const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{cwd:projectRoot,windowsHide:true,timeout:30_000,encoding:'utf8'});assert.equal(result.status,0,result.stderr||String(result.error));}
const fp=file=>streamedFileFingerprint(file);
const digest=value=>createHash('sha256').update(value).digest('hex');
const baseUrl='http://127.0.0.1:8138',headers={'x-visualmaker-token':studioToken()};
function isolated(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-audio-assembly-data-'));return insertProject(importEpisode());}
function fixture(t){const cache=path.join(projectRoot,'visualmaker','.test-cache');mkdirSync(cache,{recursive:true});const work=realpathSync(mkdtempSync(path.join(cache,'vm-audio-assembly-')));
  t.after(()=>{if(work.startsWith(realpathSync(cache)+path.sep)&&path.basename(work).startsWith('vm-audio-assembly-'))rmSync(work,{recursive:true,force:true});});return work;}

test('state-selected narration plan is byte-bound, and unique manifest voice must match it',t=>{
  const work=fixture(t),relative=path.relative(projectRoot,work).replaceAll('\\','/'),alt=path.join(work,'alternative-plan.json'),manifest=path.join(work,'manifest.json'),voice=path.join(work,'SH001.wav');
  writeFileSync(alt,'{"pre_roll_frames":8}',{flag:'wx'});writeFileSync(manifest,'{}',{flag:'wx'});writeFileSync(voice,Buffer.from('WAV'),{flag:'wx'});
  const altRelative=`${relative}/alternative-plan.json`,manifestRelative=`${relative}/manifest.json`,voiceRelative=`${relative}/SH001.wav`;
  assert.equal(narrationPlanPathFromState(projectRoot,{draft_inputs:{narration_plan:altRelative}}),altRelative);
  assert.throws(()=>narrationPlanPathFromState(projectRoot,{draft_inputs:{narration_plan:'../../scratch.json'}}),error=>error.status===409);
  assert.deepEqual(bindUniqueFinalVoiceFile(projectRoot,relative,'SH001',manifestRelative,voiceRelative,['SH001.wav']),{path:voiceRelative,file:voice});
  assert.throws(()=>bindUniqueFinalVoiceFile(projectRoot,relative,'SH001',manifestRelative,voiceRelative,['SH001.wav','SH001.mp3']),/정확히 하나/);
  assert.throws(()=>bindUniqueFinalVoiceFile(projectRoot,relative,'SH001',manifestRelative,'scratch.wav',['SH001.wav']),/다릅니다/);
  const report={visual:{fingerprints:{}},fingerprints:{[altRelative]:fp(alt).sha256}};
  assert.equal(audioAssemblyFingerprintsStillMatch(report),true);
  writeFileSync(alt,'{"pre_roll_frames":9}');assert.equal(audioAssemblyFingerprintsStillMatch(report),false);
});

test('readiness decoding rejects silent final voice and uses actual decoded sample count',async t=>{
  const work=fixture(t),silent=path.join(work,'silent.wav'),speech=path.join(work,'speech.wav');
  ffmpeg(['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','0.5','-c:a','pcm_s16le',silent]);
  ffmpeg(['-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.5','-ac','2','-c:a','pcm_s16le',speech]);
  await assert.rejects(probeDecodedVoice(silent),/decoded-voice-invalid/);
  const decoded=await probeDecodedVoice(speech);assert.equal(decoded.decodedSamples,24000);assert.ok(decoded.firstAudibleSample>=0);assert.ok(decoded.lastAudibleSample<24000);
  const cut=[{cutId:'SH001',startFrame:0,durationFrames:12,mode:'remotion'}],plan=[{shot_id:'SH001',pre_roll_frames:2,post_hold_frames:4}];
  const measured=[{cutId:'SH001',path:'speech.wav',...fp(speech),durationSeconds:.5,sampleRate:48000,channels:2,...decoded}];
  assert.equal(placeVoices(cut,plan,measured,12)[0].voiceSamples,24000);
  assert.throws(()=>placeVoices(cut,plan,[{...measured[0],decodedSamples:12000,lastAudibleSample:11999}],12),/컨테이너 길이/);
});

test('current EP001 reports blockers and cannot claim or download an audio assembly job',async()=>{
  const plan=isolated(),report=await evaluateAudioAssembly(plan.id,1);
  assert.equal(report.renderEligible,false);assert.equal(report.technicalAudioAligned,false);assert.equal(report.productionAuthority,false);
  assert.ok(report.blockers.some(block=>block.code==='missing-active-cut-root'));
  const readiness=await readinessGet(new Request(`${baseUrl}/api/studio/audio-assembly?projectId=${plan.id}&baseRevision=1`,{headers}));
  assert.equal(readiness.status,200);assert.equal((await readiness.json()).report.renderEligible,false);
  const job=await enqueueAudioAssemblyJob(plan.id,1,'audio-blocked');
  assert.equal(job.status,'blocked');assert.equal(job.kind,'audio-timed-assembly');assert.equal(job.artifacts.length,0);
  assert.equal(audioAssemblyJobContract(job.id).report.renderEligible,false);
  assert.throws(()=>claimJob(job.id),error=>error.status===409);
  await assert.rejects(audioAssemblyArtifactFile(job.id,{projectId:plan.id,baseRevision:1,attempt:1}),error=>error.status===409);
  const query=new URLSearchParams({jobId:job.id,projectId:plan.id,baseRevision:'1',attempt:'1'});
  assert.equal((await mediaGet(new Request(`${baseUrl}/api/studio/jobs/audio-media?${query}`,{headers}))).status,409);
  assert.equal((await mediaGet(new Request(`${baseUrl}/api/studio/jobs/audio-media?${query}`))).status,403);
  query.set('name','../../raw/secret');assert.equal((await mediaGet(new Request(`${baseUrl}/api/studio/jobs/audio-media?${query}`,{headers}))).status,400);
  assert.equal(getJob(job.id).artifacts.length,0);
});

test('audio assembly enqueue is revision scoped and rejects client file or render options',async()=>{
  const plan=isolated(),job=await enqueueAudioAssemblyJob(plan.id,1,'same-key');
  assert.deepEqual(await enqueueAudioAssemblyJob(plan.id,1,'same-key'),job);
  updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'변경된 설명',role:'context'});
  await assert.rejects(enqueueAudioAssemblyJob(plan.id,1,'new-key'),error=>error.status===409);
  const body={action:'enqueue',kind:'audio-timed-assembly',projectId:plan.id,baseRevision:1,idempotencyKey:'bad-extra',audioPath:'scratch.mp3'};
  assert.equal((await jobsPost(new Request(`${baseUrl}/api/studio/jobs`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}))).status,400);
  assert.equal((await jobsPost(new Request(`${baseUrl}/api/studio/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))).status,403);
  assert.equal((await readinessGet(new Request(`${baseUrl}/api/studio/audio-assembly?projectId=${plan.id}&baseRevision=1`))).status,403);
});

test('sample placement respects catalog overlap, rejects speech collisions and overflow',()=>{
  const cuts=[{cutId:'SH001',startFrame:0,durationFrames:24,mode:'remotion'},{cutId:'SH002',startFrame:18,durationFrames:24,mode:'remotion'}];
  const plan=[{shot_id:'SH001',pre_roll_frames:2,post_hold_frames:16},{shot_id:'SH002',pre_roll_frames:8,post_hold_frames:10}];
  const measured=[{cutId:'SH001',path:'a.wav',sha256:'a'.repeat(64),bytes:100,durationSeconds:.5,sampleRate:48000,channels:2,decodedSamples:24000,audibleSamples:24000,firstAudibleSample:0,lastAudibleSample:23999},{cutId:'SH002',path:'b.wav',sha256:'b'.repeat(64),bytes:100,durationSeconds:.5,sampleRate:48000,channels:2,decodedSamples:24000,audibleSamples:24000,firstAudibleSample:0,lastAudibleSample:23999}];
  const placed=placeVoices(cuts,plan,measured,12);
  assert.deepEqual(placed.map(voice=>voice.voiceStartSample),[8000,104000]);
  assert.deepEqual(placed.map(voice=>voice.voiceSamples),[24000,24000]);
  assert.throws(()=>placeVoices(cuts,[{...plan[0],pre_roll_frames:16,post_hold_frames:2},{...plan[1],pre_roll_frames:0,post_hold_frames:18}],measured,12),/발화 중첩/);
  assert.throws(()=>placeVoices(cuts,[{...plan[0],post_hold_frames:15},plan[1]],measured,12),/확정 컷 시간/);
});

test('real Remotion visual and FFmpeg audio assembly preserves frames and measured sample starts', {timeout:300_000}, async t=>{
  const work=fixture(t),publicDir=path.join(work,'public');mkdirSync(publicDir);
  const entry=path.join(work,'synthetic-entry.tsx');
  writeFileSync(entry,`import React from 'react';
import {AbsoluteFill,Composition,interpolate,registerRoot,useCurrentFrame} from 'remotion';
const Episode=()=>{const frame=useCurrentFrame();return <AbsoluteFill style={{backgroundColor:frame<21?'#163a6b':'#74213a'}}><div style={{position:'absolute',left:interpolate(frame,[0,41],[20,400]),top:100,width:90,height:90,backgroundColor:'#fff'}} /></AbsoluteFill>;};
registerRoot(()=> <Composition id="EP001-Episode-Provisional" component={Episode} durationInFrames={42} fps={12} width={640} height={360}/>);
`,{flag:'wx'});
  const wavs=[];for(let i=0;i<2;i++){const wav=path.join(work,`voice${i}.wav`);ffmpeg(['-f','lavfi','-i',`sine=frequency=${i?880:440}:sample_rate=48000:duration=0.5`,'-ac','2','-c:a','pcm_s16le',wav]);wavs.push(wav);}
  const cuts=[{cutId:'SH001',startFrame:0,durationFrames:24,mode:'remotion'},{cutId:'SH002',startFrame:18,durationFrames:24,mode:'remotion'}];
  const plan=[{shot_id:'SH001',pre_roll_frames:2,post_hold_frames:16},{shot_id:'SH002',pre_roll_frames:8,post_hold_frames:10}];
  const measurements=await Promise.all(wavs.map(async(wav,i)=>({cutId:`SH00${i+1}`,path:path.relative(projectRoot,wav).replaceAll('\\','/'),...fp(wav),durationSeconds:.5,sampleRate:48000,channels:2,...await probeDecodedVoice(wav)})));
  const voices=placeVoices(cuts,plan,measurements,12);
  const report={renderEligible:true,composition:{id:'EP001-Episode-Provisional',width:640,height:360,fps:12,durationFrames:42},visual:{cuts},voices};
  const result=await runAudioAssemblyEngine({contract:{report},entry,publicDir,rootDir:projectRoot,work,signal:new AbortController().signal,onStage:()=>{}});
  assert.equal(result.measured.audioStreams,1);assert.equal(result.measured.decodedAudioNonzero,true);
  assert.deepEqual(result.measured.frameSha256,result.visual.frameSha256);
  assert.deepEqual(result.voices.map(voice=>voice.decodedSamples),[24000,24000]);
  assert.deepEqual(result.measured.voiceWindowActivity.map(window=>window.cutId),['SH001','SH002']);
  assert.ok(result.measured.voiceWindowActivity.every(window=>window.audibleSamples>1000));
  assert.match(result.measured.videoPacketSha256,/^[a-f0-9]{64}$/);
  const outputPcm=readFileSync(path.join(work,'output-audio.pcm'));
  const audibleAt=sample=>Math.abs(outputPcm.readFloatLE(sample*8))>0.0001||Math.abs(outputPcm.readFloatLE(sample*8+4))>0.0001;
  assert.equal(Array.from({length:10000},(_,index)=>audibleAt(50000+index)).some(Boolean),false);
  let secondOnset=-1;for(let sample=100000;sample<110000;sample++)if(audibleAt(sample)){secondOnset=sample;break;}
  assert.ok(Math.abs(secondOnset-104000)<2048,`second voice onset ${secondOnset}`);
  assert.ok(Math.abs(result.measured.firstAudibleSample-8000)<2048);
  assert.deepEqual(fp(path.join(work,'provisional-voiced-episode.mp4')),{sha256:result.output.sha256,bytes:result.output.bytes});
  assert.ok(statSync(path.join(work,'provisional-voiced-episode.mp4')).size>1000);
});

test('real audio result uses the durable publisher and verified byte reader; lease, drift and tampering fail closed', {timeout:300_000}, async t=>{
  const plan=isolated(),work=fixture(t),voiceFile=path.join(work,'SH001.wav'),authorityFile=path.join(work,'authority.json');
  ffmpeg(['-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.5','-ac','2','-c:a','pcm_s16le',voiceFile]);
  writeFileSync(authorityFile,'{"fixture":"technical only"}',{flag:'wx'});
  const relative=file=>path.relative(projectRoot,file).replaceAll('\\','/');
  const measurement={cutId:'SH001',path:relative(voiceFile),...fp(voiceFile),durationSeconds:.5,sampleRate:48000,channels:2,...await probeDecodedVoice(voiceFile)};
  const cuts=[{cutId:'SH001',startFrame:0,durationFrames:12,mode:'remotion'}];
  const voices=placeVoices(cuts,[{shot_id:'SH001',pre_roll_frames:2,post_hold_frames:4}],[measurement],12);
  const snapshot=JSON.stringify(plan),composition={id:'EP001-Episode-Provisional',width:320,height:180,fps:12,durationFrames:12};
  const visual={schemaVersion:'visualmaker-episode-provisional-v1',episodeId:'episode-001',scope:{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:digest(snapshot)},composition,cuts,boundaries:[],inputs:[],fingerprints:{[relative(authorityFile)]:fp(authorityFile).sha256},validators:[],blockers:[],renderEligible:true,productionAuthority:false,reviewApproved:false,audioSynchronized:false};
  const report={schemaVersion:'visualmaker-audio-assembly-v1',episodeId:'episode-001',scope:visual.scope,composition,visual,voices,fingerprints:{[relative(voiceFile)]:fp(voiceFile).sha256},validators:[],blockers:[],renderEligible:true,productionAuthority:false,reviewApproved:false,technicalAudioAligned:false};
  const contract=buildAudioAssemblyExecutionContract(report),entry=path.join(work,'synthetic-entry.tsx');
  writeFileSync(entry,`import React from 'react';import {AbsoluteFill,Composition,registerRoot,useCurrentFrame} from 'remotion';const Episode=()=> <AbsoluteFill style={{backgroundColor:useCurrentFrame()<6?'#183a61':'#7b2531'}}/>;registerRoot(()=> <Composition id="EP001-Episode-Provisional" component={Episode} durationInFrames={12} fps={12} width={320} height={180}/>);`,{flag:'wx'});
  const makeStage=()=>{const stage=path.join(dataRoot(),'jobs','staging',randomUUID()),renderWork=path.join(stage,'work'),artifacts=path.join(stage,'artifacts');mkdirSync(path.join(renderWork,'public'),{recursive:true});mkdirSync(artifacts);return {renderWork,artifacts};};
  const initial=makeStage();t.after(()=>{const root=path.join(dataRoot(),'jobs');if(existsSync(root))rmSync(root,{recursive:true,force:true});});
  const result=await runAudioAssemblyEngine({contract,entry,publicDir:path.join(initial.renderWork,'public'),rootDir:projectRoot,work:initial.renderWork,signal:new AbortController().signal,onStage:()=>{}});
  const realOutput=path.join(initial.renderWork,'provisional-voiced-episode.mp4');assert.equal(fp(realOutput).sha256,result.output.sha256);
  const seed=async key=>{const blocked=await enqueueAudioAssemblyJob(plan.id,1,key),db=openDb();try{db.prepare("UPDATE visualmaker_jobs SET status='queued',blocker=NULL,execution_contract_json=?,execution_contract_sha256=? WHERE id=?").run(JSON.stringify(contract),digest(JSON.stringify(contract)),blocked.id);}finally{db.close();}return claimJob(blocked.id);};
  const stageFromReal=()=>{const stage=makeStage();copyFileSync(realOutput,path.join(stage.renderWork,'provisional-voiced-episode.mp4'));return stage;};
  const publish=async(claim,stage,validateCurrent=async()=>{},check=()=>{})=>publishAudioAssemblyResult({id:claim.job.id,token:claim.token,work:stage.renderWork,artifacts:stage.artifacts,contract,result,validateCurrent,check,onPublished:()=>{}});
  const success=await seed('durable-success');const published=await publish(success,stageFromReal());
  assert.equal(getJob(success.job.id).status,'succeeded');assert.equal(getJob(success.job.id).artifacts.length,2);assert.ok(existsSync(published));
  const scope={projectId:plan.id,baseRevision:1,attempt:1};
  const verified=readVerifiedAudioAssemblyArtifact(success.job.id,scope);
  assert.equal(verified.receipt.technicalAudioAligned,true);assert.equal(verified.receipt.productionAuthority,false);
  const bytes=Buffer.from(await new Response(videoStream(verified.mp4.fd,verified.mp4.identity,0,verified.mp4.bytes-1)).arrayBuffer());
  assert.equal(digest(bytes),result.output.sha256);assert.equal(bytes.length,result.output.bytes);
  const ranged=readVerifiedAudioAssemblyArtifact(success.job.id,scope),range=episodeByteRange('bytes=100-109',ranged.mp4.bytes);
  assert.deepEqual(range,{start:100,end:109});
  const slice=Buffer.from(await new Response(videoStream(ranged.mp4.fd,ranged.mp4.identity,range.start,range.end)).arrayBuffer());
  assert.deepEqual(slice,bytes.subarray(100,110));
  assert.equal(digest(verified.receiptBytes),getJob(success.job.id).artifacts.find(item=>item.name.endsWith('.json')).sha256);
  await assert.rejects(readAudioAssemblyForFinalization(success.job.id,scope),error=>error.status===409&&/스냅샷/.test(error.message));
  const sourceSpec=JSON.parse(readFileSync(path.join(projectRoot,POST_LOCK_SPEC),'utf8'));
  const scriptSource=sourceSpec.editorial_revision?.approved_script_source??sourceSpec.editorial_revision?.source_path??sourceSpec.script_lock.source_path;
  const v2report={...report,visual:{...visual,fingerprints:{...visual.fingerprints,[POST_LOCK_SPEC]:fp(path.join(projectRoot,POST_LOCK_SPEC)).sha256}},fingerprints:{...report.fingerprints,[POST_LOCK_STATE]:fp(path.join(projectRoot,POST_LOCK_STATE)).sha256,[scriptSource]:fp(path.join(projectRoot,scriptSource)).sha256},validators:[{name:'validate-production-stage.mjs --lock audio-timed-assembly',passed:true}]};
  const v2contract={schemaVersion:'visualmaker-audio-assembly-execution-v2',report:v2report,reportSha256:digest(JSON.stringify(v2report)),createdAt:new Date().toISOString(),authoritySnapshot:captureAudioAuthoritySnapshot(projectRoot,v2report)};
  const v2blocked=await enqueueAudioAssemblyJob(plan.id,1,'durable-v2-snapshot');
  const v2db=openDb();try{v2db.prepare("UPDATE visualmaker_jobs SET status='queued',blocker=NULL,execution_contract_json=?,execution_contract_sha256=? WHERE id=?").run(JSON.stringify(v2contract),digest(JSON.stringify(v2contract)),v2blocked.id);}finally{v2db.close();}
  const v2claim=claimJob(v2blocked.id),v2stage=stageFromReal();
  await publishAudioAssemblyResult({id:v2claim.job.id,token:v2claim.token,work:v2stage.renderWork,artifacts:v2stage.artifacts,contract:v2contract,result,validateCurrent:async()=>{},check:()=>{},onPublished:()=>{}});
  assert.equal(getJob(v2claim.job.id).status,'succeeded');
  const v2verified=readVerifiedAudioAssemblyArtifact(v2claim.job.id,scope);closeSync(v2verified.mp4.fd);
  await assert.rejects(readAudioAssemblyForFinalization(v2claim.job.id,scope),error=>error.status===409&&/addendum/.test(error.message));
  assert.throws(()=>readVerifiedAudioAssemblyArtifact(success.job.id,{...scope,attempt:2}),error=>error.status===409);
  assert.throws(()=>readVerifiedAudioAssemblyArtifact(success.job.id,{...scope,projectId:'plan_'+randomUUID()}),error=>error.status===409);
  await assert.rejects(audioAssemblyArtifactFile(success.job.id,scope),error=>error.status===409);
  assert.equal((await mediaGet(new Request(`${baseUrl}/api/studio/jobs/audio-media?jobId=${success.job.id}&projectId=${plan.id}&baseRevision=1&attempt=1`,{headers}))).status,409);
  const cancelled=await seed('durable-cancel');cancelJob(cancelled.job.id);
  await assert.rejects(publish(cancelled,stageFromReal()),error=>error.status===409);assert.equal(getJob(cancelled.job.id).artifacts.length,0);
  const expired=await seed('durable-expired');const dbExpired=openDb();try{dbExpired.prepare('UPDATE visualmaker_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.job.id);}finally{dbExpired.close();}
  await assert.rejects(publish(expired,stageFromReal()),error=>error.status===409);assert.equal(getJob(expired.job.id).artifacts.length,0);
  const changedAudio=await seed('durable-audio-drift');const voiceOriginal=readFileSync(voiceFile);writeFileSync(voiceFile,Buffer.from('changed'));await assert.rejects(publish(changedAudio,stageFromReal()),error=>error.status===409);assert.equal(getJob(changedAudio.job.id).artifacts.length,0);writeFileSync(voiceFile,voiceOriginal);
  const changedAuthority=await seed('durable-authority-drift');writeFileSync(authorityFile,'{"fixture":"changed"}');await assert.rejects(publish(changedAuthority,stageFromReal()),error=>error.status===409);assert.equal(getJob(changedAuthority.job.id).artifacts.length,0);
  assert.equal((await mediaGet(new Request(`${baseUrl}/api/studio/jobs/audio-media?jobId=${success.job.id}&projectId=${plan.id}&baseRevision=1&attempt=1`,{headers}))).status,409);
  writeFileSync(authorityFile,'{"fixture":"technical only"}');
  const outputPath=path.join(published,'provisional-voiced-episode.mp4'),receiptPath=path.join(published,'provisional-voiced-episode.json');
  writeFileSync(outputPath,Buffer.from('tampered'));assert.throws(()=>readVerifiedAudioAssemblyArtifact(success.job.id,scope),error=>error.status===409);
  writeFileSync(outputPath,bytes);writeFileSync(receiptPath,Buffer.from('tampered'));assert.throws(()=>readVerifiedAudioAssemblyArtifact(success.job.id,scope),error=>error.status===409);
  const changedSnapshot=await seed('durable-snapshot-drift');updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새 설명',role:'context'});
  await assert.rejects(publish(changedSnapshot,stageFromReal()),error=>error.status===409);assert.equal(getJob(changedSnapshot.job.id).artifacts.length,0);
});
