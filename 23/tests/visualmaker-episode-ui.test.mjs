import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {currentEpisodeEnqueue,currentEpisodeJob,currentEpisodeReceipt,episodeResponseScope} from '../src/components/studio/episode-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const plan=importEpisode(),snapshotSha256=sha(JSON.stringify(plan));
  const report={schemaVersion:'visualmaker-episode-provisional-v1',episodeId:'episode-001',
    scope:{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256},
    composition:null,cuts:[],boundaries:[],inputs:[],fingerprints:{},validators:[],
    blockers:[{code:'missing-active-cut-root',detail:'현재 활성 컷 루트가 없습니다.'}],renderEligible:false,
    productionAuthority:false,reviewApproved:false,audioSynchronized:false};
  const contract={schemaVersion:'visualmaker-episode-execution-v1',report,reportSha256:sha(JSON.stringify(report)),createdAt:'2026-10-14T00:00:00.000Z'};
  const job={schemaVersion:'visualmaker-job-v1',id:'job_00000000-0000-0000-0000-000000000001',projectId:plan.id,kind:'episode-provisional-video',
    status:'blocked',requestedRevision:plan.revision,snapshotSha256,sceneId:null,executionContractSha256:sha(JSON.stringify(contract)),
    productionAuthority:false,progress:0,attempt:0,createdAt:'2026-10-14T00:00:00.000Z',updatedAt:'2026-10-14T00:00:00.000Z',
    startedAt:null,finishedAt:null,error:null,blocker:report.blockers[0].detail,recoveryReason:null,leaseExpiresAt:null,artifacts:[],attempts:[]};
  return {plan,report,contract,job};
}

test('blocked enqueue stays bound to exact plan, report, contract, and blocked state',async()=>{
  const {plan,report,contract,job}=fixture();
  assert.ok(await currentEpisodeEnqueue({job,executionContract:contract},plan));
  assert.equal(await currentEpisodeEnqueue({job:{...job,projectId:'plan_other'},executionContract:contract},plan),null);
  assert.equal(await currentEpisodeEnqueue({job:{...job,status:'queued'},executionContract:contract},plan),null);
  assert.equal(await currentEpisodeEnqueue({job,executionContract:{...contract,report:{...report,productionAuthority:true}}},plan),null);
  assert.equal(await currentEpisodeEnqueue({job,executionContract:{...contract,report:{...report,blockers:[]}}},plan),null);
  assert.equal(await currentEpisodeEnqueue({job,executionContract:{...contract,createdAt:'changed'}},plan),null);
});

test('successful result receipt requires exact attempt, SHA metadata, measurements, and false approvals',async()=>{
  const {plan,job}=fixture();
  const composition={id:'EP001-Episode-Provisional',width:1920,height:1080,fps:30,durationFrames:90};
  const output={name:'provisional-episode.mp4',bytes:1024,sha256:'a'.repeat(64)};
  const receipt={schemaVersion:'visualmaker-provisional-episode-receipt-v1',artifactKind:'episode-provisional-video',
    episodeId:'episode-001',jobId:job.id,attempt:1,projectId:plan.id,requestedRevision:plan.revision,
    snapshotSha256:job.snapshotSha256,executionContractSha256:job.executionContractSha256,
    composition,cuts:[{cutId:'SH001',startFrame:0,durationFrames:90,mode:'remotion'}],boundaries:[],inputs:[],authorityFingerprints:{},
    rendererVersion:'4.0.516',reviewProfile:'remotion-motion',productionAuthority:false,reviewApproved:false,audioSynchronized:false,
    output,measured:{width:1920,height:1080,fps:30,frames:90,durationSeconds:3,codec:'h264',audioStreams:0,frameSha256:['b'.repeat(64),'c'.repeat(64),'d'.repeat(64)]}};
  const bytes=new TextEncoder().encode(JSON.stringify(receipt));
  const completed={...job,status:'succeeded',attempt:1,artifacts:[
    {name:'provisional-episode.mp4',bytes:output.bytes,sha256:output.sha256,productionAuthority:false},
    {name:'provisional-episode.json',bytes:bytes.length,sha256:sha(bytes),productionAuthority:false}]};
  assert.ok(await currentEpisodeReceipt(bytes,completed,plan));
  assert.equal(await currentEpisodeReceipt(bytes,{...completed,productionAuthority:true},plan),null);
  assert.equal(await currentEpisodeReceipt(bytes,{...completed,attempt:2},plan),null);
  assert.equal(await currentEpisodeReceipt(bytes,{...completed,artifacts:[...completed.artifacts.slice(0,1),{...completed.artifacts[1],sha256:'f'.repeat(64)}]},plan),null);
  const forged=new TextEncoder().encode(JSON.stringify({...receipt,reviewApproved:true}));
  assert.equal(await currentEpisodeReceipt(forged,{...completed,artifacts:[completed.artifacts[0],{...completed.artifacts[1],bytes:forged.length,sha256:sha(forged)}]},plan),null);
  const initial={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256};
  assert.equal(currentEpisodeJob(initial,initial,completed,completed),true);
  assert.equal(currentEpisodeJob(initial,{...initial,revision:initial.revision+1},completed,completed),false);
  assert.equal(currentEpisodeJob(initial,initial,completed,{...completed,attempt:2}),false);
});

test('media headers must match project, job, revision and attempt',()=>{
  const {job}=fixture();const completed={...job,status:'succeeded',attempt:1};
  const headers={'Cache-Control':'no-store','X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,
    'X-Visualmaker-Revision':String(job.requestedRevision),'X-Visualmaker-Attempt':'1'};
  assert.equal(episodeResponseScope(new Response(null,{headers}),completed),true);
  assert.equal(episodeResponseScope(new Response(null,{headers:{...headers,'X-Visualmaker-Attempt':'2'}}),completed),false);
  assert.equal(episodeResponseScope(new Response(null,{status:409,headers}),completed),false);
});
