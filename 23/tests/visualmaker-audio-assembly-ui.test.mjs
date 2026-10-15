import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject} from '../visualmaker/core/store.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {GET as readinessGet} from '../src/app/api/studio/audio-assembly/route.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {audioResponseScope,currentAudioEnqueue,currentAudioJob,currentAudioReceipt,currentAudioReport} from '../src/components/studio/audio-assembly-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const baseUrl='http://127.0.0.1:8138';

test('real blocked readiness and enqueue responses retain current plan scope and false authority',async t=>{
  const data=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-audio-ui-')));
  process.env.VISUALMAKER_DATA_DIR=data;
  t.after(()=>{if(data.startsWith(realpathSync(os.tmpdir())+path.sep)&&path.basename(data).startsWith('vm-audio-ui-'))rmSync(data,{recursive:true,force:true});});
  const plan=insertProject(importEpisode()),headers={'x-visualmaker-token':studioToken()};
  const query=new URLSearchParams({projectId:plan.id,baseRevision:String(plan.revision)});
  const readiness=await readinessGet(new Request(`${baseUrl}/api/studio/audio-assembly?${query}`,{headers}));
  assert.equal(readiness.status,200);
  assert.equal(readiness.headers.get('x-visualmaker-schema'),'visualmaker-audio-assembly-v1');
  assert.equal(readiness.headers.get('x-visualmaker-production-authority'),'false');
  const actual=currentAudioReport(await readiness.json(),plan);
  assert.ok(actual);assert.equal(actual.renderEligible,false);assert.ok(actual.blockers.length>0);
  assert.equal(actual.technicalAudioAligned,false);
  assert.equal(currentAudioReport({report:{...actual,scope:{...actual.scope,revision:plan.revision+1}}},plan),null);
  assert.equal(currentAudioReport({report:{...actual,productionAuthority:true}},plan),null);
  assert.equal(currentAudioReport({report:{...actual,blockers:[]}},plan),null);
  const body={action:'enqueue',kind:'audio-timed-assembly',projectId:plan.id,baseRevision:plan.revision,idempotencyKey:'audio-ui-contract'};
  const response=await jobsPost(new Request(`${baseUrl}/api/studio/jobs`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal(response.status,200);
  const actualPair=await response.json(),accepted=await currentAudioEnqueue(actualPair,plan);
  assert.ok(accepted);assert.equal(accepted.job.status,'blocked');
  assert.equal(await currentAudioEnqueue({...actualPair,job:{...actualPair.job,requestedRevision:plan.revision+1}},plan),null);
  assert.equal(await currentAudioEnqueue({...actualPair,executionContract:{...actualPair.executionContract,report:{...actualPair.executionContract.report,blockers:[]}}},plan),null);
});

test('voiced result requires exact receipt hash, attempt, stream measurements and false approvals',async()=>{
  const plan=importEpisode(),snapshotSha256=sha(JSON.stringify(plan)),contractSha256='a'.repeat(64);
  const voice={cutId:'SH001',path:'video/source-intake/episode-001/narration/final/SH001.wav',sha256:'b'.repeat(64),bytes:10000,
    durationSeconds:1,sampleRate:48000,channels:2,decodedSamples:48000,audibleSamples:40000,firstAudibleSample:0,lastAudibleSample:47999,
    startFrame:0,preRollFrames:2,postHoldFrames:28,voiceStartFrame:2,voiceStartSample:3200,voiceSamples:48000,cutEndFrame:60};
  const composition={id:'EP001-Episode-Provisional',width:1920,height:1080,fps:30,durationFrames:90};
  const output={name:'provisional-voiced-episode.mp4',bytes:5000,sha256:'c'.repeat(64)};
  const receipt={schemaVersion:'visualmaker-audio-assembly-receipt-v1',artifactKind:'audio-timed-assembly',episodeId:'episode-001',
    jobId:'job_00000000-0000-0000-0000-000000000001',attempt:1,projectId:plan.id,requestedRevision:plan.revision,
    snapshotSha256,executionContractSha256:contractSha256,composition,visualInputs:[],authorityFingerprints:{},audioFingerprints:{},
    voices:[{...voice,decodedSamples:48000,firstAudibleSample:3200,lastAudibleSample:51199}],rendererVersion:'4.0.516',
    ffmpegVersion:'ffmpeg version 7.1',reviewProfile:'remotion-motion',productionAuthority:false,reviewApproved:false,technicalAudioAligned:true,
    output,visual:{width:1920,height:1080,fps:30,frames:90,durationSeconds:3,codec:'h264',audioStreams:0,frameSha256:['d'.repeat(64),'e'.repeat(64),'f'.repeat(64)]},
    measured:{width:1920,height:1080,fps:30,frames:90,durationSeconds:3,videoCodec:'h264',audioCodec:'aac',audioStreams:1,
      audioSampleRate:48000,audioChannels:2,decodedAudioSamples:144000,decodedAudioNonzero:true,firstAudibleSample:3200,
      voiceWindowActivity:[{cutId:'SH001',startSample:3200,endSample:51200,audibleSamples:40000}],videoPacketSha256:'1'.repeat(64),
      frameSha256:['d'.repeat(64),'e'.repeat(64),'f'.repeat(64)]}};
  const bytes=new TextEncoder().encode(JSON.stringify(receipt));
  const job={schemaVersion:'visualmaker-job-v1',id:receipt.jobId,projectId:plan.id,kind:'audio-timed-assembly',status:'succeeded',
    requestedRevision:plan.revision,snapshotSha256,sceneId:null,executionContractSha256:contractSha256,
    productionAuthority:false,attempt:1,artifacts:[
      {...output,productionAuthority:false},
      {name:'provisional-voiced-episode.json',bytes:bytes.length,sha256:sha(bytes),productionAuthority:false}]};
  assert.ok(await currentAudioReceipt(bytes,job,plan));
  assert.equal(await currentAudioReceipt(bytes,{...job,attempt:2},plan),null);
  assert.equal(await currentAudioReceipt(bytes,{...job,artifacts:[job.artifacts[0],{...job.artifacts[1],sha256:'2'.repeat(64)}]},plan),null);
  const altered=new TextEncoder().encode(JSON.stringify({...receipt,reviewApproved:true}));
  assert.equal(await currentAudioReceipt(altered,{...job,artifacts:[job.artifacts[0],{...job.artifacts[1],bytes:altered.length,sha256:sha(altered)}]},plan),null);
  const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256};
  assert.equal(currentAudioJob(job,scope,job),true);
  assert.equal(currentAudioJob(job,{...scope,revision:scope.revision+1},job),false);
  assert.equal(currentAudioJob(job,scope,{...job,attempt:2}),false);
  const headers={'Cache-Control':'no-store','X-Visualmaker-Project-Id':plan.id,'X-Visualmaker-Job-Id':job.id,
    'X-Visualmaker-Attempt':'1','X-Visualmaker-Revision':String(plan.revision)};
  assert.equal(audioResponseScope(new Response(null,{headers}),job),true);
  assert.equal(audioResponseScope(new Response(null,{headers:{...headers,'X-Visualmaker-Attempt':'2'}}),job),false);
});
