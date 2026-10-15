import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject} from '../visualmaker/core/store.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {GET as readinessGet} from '../src/app/api/studio/finalization/route.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {boundedFinalizationBytes,currentFinalizationEnqueue,currentFinalizationJob,currentFinalizationReadiness,
  currentFinalizationReceipt,fetchFinalizationSidecar,finalizationFileMatches,finalizationResponseScope} from '../src/components/studio/finalization-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const id='job_00000000-0000-0000-0000-000000000001';
const audioId='job_00000000-0000-0000-0000-000000000002';

test('real finalization readiness and blocked enqueue use public DTO without private binding',async t=>{
  const data=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-final-ui-')));
  process.env.VISUALMAKER_DATA_DIR=data;
  t.after(()=>{if(data.startsWith(realpathSync(os.tmpdir())+path.sep)&&path.basename(data).startsWith('vm-final-ui-'))rmSync(data,{recursive:true,force:true});});
  const plan=insertProject(importEpisode()),headers={'x-visualmaker-token':studioToken()};
  const query=new URLSearchParams({projectId:plan.id,baseRevision:String(plan.revision)});
  const response=await readinessGet(new Request(`http://127.0.0.1:8138/api/studio/finalization?${query}`,{headers}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const raw=await response.json();
  assert.deepEqual(Object.keys(raw),['readiness']);
  assert.equal('binding' in raw.readiness,false);assert.equal('fingerprints' in raw.readiness,false);
  const readiness=await currentFinalizationReadiness(raw,plan);
  assert.ok(readiness);assert.equal(readiness.renderEligible,false);assert.ok(readiness.blockers.length>0);
  assert.equal(await currentFinalizationReadiness({readiness:{...readiness,scope:{...readiness.scope,revision:plan.revision+1}}},plan),null);
  assert.equal(await currentFinalizationReadiness({readiness:{...readiness,scope:{...readiness.scope,snapshotSha256:'a'.repeat(64)}}},plan),null);
  assert.equal(await currentFinalizationReadiness({readiness:{...readiness,reviewApproved:true}},plan),null);
  assert.equal(await currentFinalizationReadiness({readiness:{...readiness,binding:{sourcePath:'private'}}},plan),null);
  assert.equal(await currentFinalizationReadiness({readiness:{...readiness,blockers:[]}},plan),null);
  const eligible={...readiness,renderEligible:true,blockers:[],composition:{width:1920,height:1080,fps:30,durationFrames:90},validators:[{name:'gate',passed:true}]};
  assert.ok(await currentFinalizationReadiness({readiness:eligible},plan));
  assert.equal(await currentFinalizationReadiness({readiness:{...eligible,validators:[{name:'gate',passed:false}]}},plan),null);
  const body={action:'enqueue',kind:'episode-finalization-export',projectId:plan.id,baseRevision:plan.revision,idempotencyKey:'final-ui-contract'};
  const queued=await jobsPost(new Request('http://127.0.0.1:8138/api/studio/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal(queued.status,200);assert.equal(queued.headers.get('cache-control'),'no-store');
  const result=await queued.json(),pair=await currentFinalizationEnqueue(result,plan);
  assert.ok(pair);assert.equal(pair.job.status,'blocked');
  assert.equal('executionContract' in result,false);assert.equal('binding' in result.readiness,false);
  assert.equal(await currentFinalizationEnqueue({...result,executionContract:{}},plan),null);
  assert.equal(await currentFinalizationEnqueue({...result,job:{...result.job,attempt:1}},plan),null);
  assert.equal(await currentFinalizationEnqueue({...result,readiness:eligible},plan),null);
});

test('finalization receipt binds exact job attempt, source audio, four media hashes and fifth receipt hash',async()=>{
  const plan=importEpisode(),snapshotSha256=sha(JSON.stringify(plan)),contractSha256='1'.repeat(64);
  const source={jobId:audioId,attempt:2,artifactSha256:'2'.repeat(64),receiptSha256:'3'.repeat(64)};
  const sourceJob={id:audioId,kind:'audio-timed-assembly',status:'succeeded',productionAuthority:false,
    projectId:plan.id,requestedRevision:plan.revision,attempt:2,artifacts:[
      {name:'provisional-voiced-episode.mp4',sha256:source.artifactSha256},
      {name:'provisional-voiced-episode.json',sha256:source.receiptSha256}]};
  const media=['export.mp4','export.srt','export.vtt','export.png'].map((name,index)=>({name,sha256:String(index+4).repeat(64),bytes:index===0?10000:100+index,productionAuthority:false}));
  const files=media.map(({name,sha256,bytes})=>({name,sha256,bytes}));
  const technical={schemaVersion:'visualmaker-finalization-receipt-v1',episodeId:'episode-001',source,
    files,mix:{mode:'passthrough'},ffmpegVersion:'ffmpeg version 7.1',productionAuthority:false,reviewApproved:false,
    measured:{width:1920,height:1080,fps:30,frames:90,durationSeconds:3,subtitleCount:1,
      videoPacketSha256:'8'.repeat(64),audioPacketSha256:'9'.repeat(64)}};
  const receipt={schemaVersion:'visualmaker-finalization-job-receipt-v1',artifactKind:'episode-finalization-export',
    episodeId:'episode-001',jobId:id,attempt:4,projectId:plan.id,requestedRevision:plan.revision,
    snapshotSha256,executionContractSha256:contractSha256,source,technical,files,productionAuthority:false,reviewApproved:false};
  const make=(value=receipt)=>{const bytes=new TextEncoder().encode(JSON.stringify(value));
    const job={schemaVersion:'visualmaker-job-v1',id,kind:'episode-finalization-export',status:'succeeded',projectId:plan.id,
      requestedRevision:plan.revision,snapshotSha256,executionContractSha256:contractSha256,sceneId:null,attempt:4,
      productionAuthority:false,artifacts:[...media,{name:'export.json',sha256:sha(bytes),bytes:bytes.length,productionAuthority:false}]};
    return {bytes,job};};
  const {bytes,job}=make();assert.ok(await currentFinalizationReceipt(bytes,job,plan,[sourceJob]));
  assert.equal(await currentFinalizationReceipt(bytes,{...job,attempt:5},plan,[sourceJob]),null);
  assert.equal(await currentFinalizationReceipt(bytes,{...job,artifacts:[{...media[0],sha256:'f'.repeat(64)},...job.artifacts.slice(1)]},plan,[sourceJob]),null);
  assert.equal(await currentFinalizationReceipt(bytes,job,plan,[{...sourceJob,attempt:3}]),null);
  assert.equal(await currentFinalizationReceipt(bytes,job,plan,[{...sourceJob,artifacts:[{...sourceJob.artifacts[0],sha256:'f'.repeat(64)},sourceJob.artifacts[1]]}]),null);
  assert.equal(await currentFinalizationReceipt(bytes,job,plan,[]),null);
  for(const altered of [{...receipt,reviewApproved:true},{...receipt,source:{...source,attempt:3}},
    {...receipt,files:[{...files[0],sha256:'e'.repeat(64)},...files.slice(1)]},
    {...receipt,technical:{...technical,files:[{...files[0],bytes:10001},...files.slice(1)]}}]){
    const pair=make(altered);assert.equal(await currentFinalizationReceipt(pair.bytes,pair.job,plan,[sourceJob]),null);
  }
  assert.equal(currentFinalizationJob(job,{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256},job),true);
  assert.equal(currentFinalizationJob(job,{projectId:plan.id,revision:plan.revision+1,scriptSha256:plan.script.rawSha256},job),false);
  assert.equal(currentFinalizationJob(job,{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256},{...job,attempt:5}),false);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Visualmaker-Production-Authority':'false',
    'X-Visualmaker-Project-Id':plan.id,'X-Visualmaker-Job-Id':id,'X-Visualmaker-Attempt':'4',
    'X-Visualmaker-Revision':String(plan.revision),'Content-Disposition':'attachment; filename="export.json"',
    'Content-Type':'application/json; charset=utf-8'};
  assert.equal(finalizationResponseScope(new Response(null,{headers}),job,'export.json'),true);
  assert.equal(finalizationResponseScope(new Response(null,{headers:{...headers,'X-Visualmaker-Attempt':'3'}}),job,'export.json'),false);
  assert.equal(finalizationResponseScope(new Response(null,{headers:{...headers,'X-Visualmaker-Production-Authority':'true'}}),job,'export.json'),false);
  assert.equal(finalizationResponseScope(new Response(null,{headers:{...headers,'Content-Type':'video/mp4'}}),job,'export.json'),false);
  assert.equal(await finalizationFileMatches(bytes,job.artifacts[4]),true);
  assert.equal(await finalizationFileMatches(new Uint8Array([1,2,3]),job.artifacts[4]),false);
  const controller=new AbortController();let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.ok(String(url).startsWith('/api/studio/jobs/export-media?'));
    assert.equal(String(url).includes('secret-token'),false);assert.equal(options.headers['x-visualmaker-token'],'secret-token');
    return calls===1?new Response(bytes,{headers}):new Response(null,{status:409});};
  assert.deepEqual(await fetchFinalizationSidecar({name:'export.json',job,token:'secret-token',signal:controller.signal,fetcher}),bytes);
  await assert.rejects(fetchFinalizationSidecar({name:'export.json',job,token:'secret-token',signal:controller.signal,fetcher}));
  assert.equal(calls,2,'a second click must use a fresh protected request');
});

test('v2 finalization receipt checks fixed gain evidence, AAC presentation, source and video bindings',async()=>{
  const plan=importEpisode(),snapshotSha256=sha(JSON.stringify(plan)),executionContractSha256='1'.repeat(64);
  const source={jobId:audioId,attempt:2,artifactSha256:'2'.repeat(64),receiptSha256:'3'.repeat(64)};
  const sourceJob={id:audioId,kind:'audio-timed-assembly',status:'succeeded',productionAuthority:false,
    projectId:plan.id,requestedRevision:plan.revision,attempt:2,artifacts:[
      {name:'provisional-voiced-episode.mp4',sha256:source.artifactSha256},
      {name:'provisional-voiced-episode.json',sha256:source.receiptSha256}]};
  const media=['export.mp4','export.srt','export.vtt','export.png'].map((name,index)=>
    ({name,sha256:String(index+4).repeat(64),bytes:index===0?10000:100+index,productionAuthority:false}));
  const files=media.map(({name,sha256,bytes})=>({name,sha256,bytes}));
  const rightsEvidence=[{id:'music_01',path:'video/episodes/episode-001/rights/music-license.txt',sha256:'a'.repeat(64)}];
  const presentation={decodedSamples:144704,presentedSamples:144000,sampleRate:48000,channels:2,packetCount:142,
    firstPacketPts:-1024,primingSkipSamples:1024,lastPacketDuration:320,containerDiscardPadding:0};
  const encoded={...presentation,sha256:'b'.repeat(64),bytes:8192,packetSha256:'c'.repeat(64),
    decodedPcmSha256:'d'.repeat(64),peak:0.4,rms:0.11,clippingCount:0};
  const measured={width:1920,height:1080,fps:30,frames:90,durationSeconds:3,
    videoPacketSha256:'e'.repeat(64),sourceVideoPacketSha256:'e'.repeat(64),
    frameSha256:['f'.repeat(64),'0'.repeat(64),'1'.repeat(64)],
    sourceFrameSha256:['f'.repeat(64),'0'.repeat(64),'1'.repeat(64)],
    thumbnailFrameSha256:'2'.repeat(64),sourceThumbnailFrameSha256:'2'.repeat(64),
    audioPacketSha256:encoded.packetSha256,sourceAudioPacketSha256:'3'.repeat(64),
    subtitleCount:1,subtitleText:['sample'],subtitleTimes:[{startMs:0,endMs:3000}]};
  const mixApproval={payloadSha256:'4'.repeat(64),markerSha256:'5'.repeat(64),rightsEvidence};
  const technical={schemaVersion:'visualmaker-finalization-receipt-v2',episodeId:'episode-001',source,
    authority:{episodeSpecSha256:'6'.repeat(64),preLockStateSha256:'7'.repeat(64),productionStateSha256:'8'.repeat(64),
      addendumPath:'video/episodes/episode-001/final-script-addendum.json',addendumSha256:'9'.repeat(64),
      finalScriptSha256:'a'.repeat(64),pictureMarkerSha256:'b'.repeat(64),captionMarkerSha256:'c'.repeat(64),
      captionContractSha256:'d'.repeat(64)},
    mix:{mode:'fixed-gain-stems',payloadSha256:mixApproval.payloadSha256,approvalMarkerSha256:mixApproval.markerSha256,
      rightsEvidence,measurements:{sourceVoice:{...presentation,sha256:'e'.repeat(64),tailDiscardSamples:704},
        mixer:{contractSha256:'f'.repeat(64),receiptSha256:'0'.repeat(64),outputSha256:'1'.repeat(64),
          sampleCount:144000,peak:0.3,rms:0.1,clippingCount:0},encoded,
        outputAudio:{...presentation,packetSha256:encoded.packetSha256,decodedPcmSha256:encoded.decodedPcmSha256},
        sourceVideoPacketSha256:measured.sourceVideoPacketSha256},
      contentWindows:[{start:0,end:4800,referenceRms:0.1,decodedRms:0.09,errorRms:0.01,correlation:0.95}]},
    thumbnail:{frame:0},measured,files,ffmpegVersion:'ffmpeg version 7.1',productionAuthority:false,reviewApproved:false};
  const receipt={schemaVersion:'visualmaker-finalization-job-receipt-v2',artifactKind:'episode-finalization-export',
    episodeId:'episode-001',jobId:id,attempt:4,projectId:plan.id,requestedRevision:plan.revision,
    snapshotSha256,executionContractSha256,source,mixApproval,technical,files,productionAuthority:false,reviewApproved:false};
  const check=async value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));
    const job={schemaVersion:'visualmaker-job-v1',id,kind:'episode-finalization-export',status:'succeeded',projectId:plan.id,
      requestedRevision:plan.revision,snapshotSha256,executionContractSha256,sceneId:null,attempt:4,
      productionAuthority:false,artifacts:[...media,{name:'export.json',sha256:sha(bytes),bytes:bytes.length,productionAuthority:false}]};
    return currentFinalizationReceipt(bytes,job,plan,[sourceJob]);};
  assert.ok(await check(receipt));
  const mutate=(change)=>{const value=structuredClone(receipt);change(value);return value;};
  assert.ok(await check(mutate(v=>{const second={id:'sfx_02',path:'video/episodes/episode-001/rights/sfx-license.txt',
    sha256:v.mixApproval.rightsEvidence[0].sha256};v.mixApproval.rightsEvidence.push(second);})),
  'independent evidence files can have identical bytes');
  assert.ok(await check(mutate(v=>{v.technical.measured.durationSeconds=3.11;})),
    'container duration can differ within the engine tolerance');
  const nearLimit=mutate(v=>{const duration=28_798_400,decoded=duration+704;
    v.technical.measured.frames=17_999;v.technical.measured.durationSeconds=600.066667;
    const m=v.technical.mix.measurements;
    m.sourceVoice.presentedSamples=duration;m.sourceVoice.decodedSamples=decoded;
    m.mixer.sampleCount=duration;
    m.encoded.presentedSamples=duration;m.encoded.decodedSamples=decoded;
    m.outputAudio.presentedSamples=duration;m.outputAudio.decodedSamples=decoded;
  });
  assert.ok(await check(nearLimit),'near 600 seconds of PCM may have a later container end');
  assert.equal(await check(mutate(v=>{v.technical.measured.durationSeconds=3.121;})),null);
  nearLimit.technical.measured.durationSeconds=600.13;
  assert.equal(await check(nearLimit),null,'container end beyond the engine tolerance is rejected');
  for(const changed of [
    mutate(v=>{v.schemaVersion='visualmaker-finalization-job-receipt-v3';}),
    mutate(v=>{v.technical.schemaVersion='visualmaker-finalization-receipt-v1';}),
    mutate(v=>{v.technical.mix.mode='passthrough';}),
    mutate(v=>{v.mixApproval.payloadSha256='f'.repeat(64);}),
    mutate(v=>{v.mixApproval.markerSha256='f'.repeat(64);}),
    mutate(v=>{v.mixApproval.rightsEvidence=structuredClone(v.mixApproval.rightsEvidence);v.mixApproval.rightsEvidence[0].id='different';}),
    mutate(v=>{v.mixApproval.rightsEvidence=[...v.mixApproval.rightsEvidence,v.mixApproval.rightsEvidence[0]];
      v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.mixApproval.rightsEvidence[0].path='C:/private/rights.txt';v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.mixApproval.rightsEvidence[0].path='video/episodes/episode-001/../rights.txt';v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.mixApproval.rightsEvidence[0].path='\\\\server\\rights.txt';v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.mixApproval.rightsEvidence[0].extra='private';v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.mixApproval.rightsEvidence[0].sha256='bad';v.technical.mix.rightsEvidence=v.mixApproval.rightsEvidence;}),
    mutate(v=>{v.technical.mix.measurements.sourceVoice.tailDiscardSamples=703;}),
    mutate(v=>{v.technical.mix.measurements.mixer.clippingCount=1;}),
    mutate(v=>{v.technical.mix.measurements.encoded.presentedSamples=143999;}),
    mutate(v=>{v.technical.mix.measurements.outputAudio.packetSha256='f'.repeat(64);}),
    mutate(v=>{v.technical.mix.measurements.outputAudio.decodedPcmSha256='f'.repeat(64);}),
    mutate(v=>{v.technical.measured.videoPacketSha256='f'.repeat(64);}),
    mutate(v=>{v.files[0].extra='unrecognized';v.technical.files=v.files;}),
    mutate(v=>{v.technical.mix.contentWindows=[{start:0,end:100,referenceRms:1,decodedRms:1,errorRms:0,correlation:1}];}),
    mutate(v=>{v.source.attempt=3;v.technical.source=v.source;}),
    mutate(v=>{v.productionAuthority=true;}),
    mutate(v=>{v.technical.reviewApproved=true;})
  ])assert.equal(await check(changed),null);
});

test('bounded sidecar reader rejects oversized and interrupted content',async()=>{
  const controller=new AbortController(),data=new Uint8Array([1,2,3]);
  assert.deepEqual(await boundedFinalizationBytes(new Response(data),3,5,controller.signal),data);
  await assert.rejects(boundedFinalizationBytes(new Response(data),2,5,controller.signal));
  await assert.rejects(boundedFinalizationBytes(new Response(data),3,2,controller.signal));
  controller.abort();await assert.rejects(boundedFinalizationBytes(new Response(data),3,5,controller.signal));
});
