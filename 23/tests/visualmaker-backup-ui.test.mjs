import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject} from '../visualmaker/core/store.ts';
import {exportProjectBackup,restoreProjectBackup as coreRestore} from '../visualmaker/core/backup.ts';
import {downloadProjectBackup,restoreProjectBackup,sameBackupScope,validateRestoredBackup} from '../src/components/studio/backup-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const original=createPlan('UI 검증','하나의 장면을 설명합니다.');
function fixture(){const plan=structuredClone(original);plan.id='project_backup_copy';plan.revision=3;plan.sourceReviews=[];
  const summary={sourceProjectId:original.id,sourceRevision:3,assets:0,recordings:0,timingDrafts:0,
    clearedSourceReviews:0,clearedSourceReceiptExtensions:0,clearedAIAdoption:0,clearedEpisodeOrigin:0,
    clearedSceneOriginCutIds:0,clearedTimingAttestations:0,productionAuthority:false};return {plan,summary};}
const scope={projectId:original.id,revision:original.revision,scriptSha256:original.script.rawSha256,token:'test_token'};
const reply=(body,status=201,headers={'cache-control':'no-store','content-type':'application/json'})=>new Response(body,{status,headers});

test('empty restored Plan validates as a new draft copy',async()=>{const result=await validateRestoredBackup(fixture());
  assert.equal(result.plan.id,'project_backup_copy');assert.deepEqual(result.plan.sourceReviews,[]);
  assert.equal(result.summary.productionAuthority,false);});

test('client projection accepts the actual core restore response from an isolated store',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-backup-ui-'));
  const source=insertProject(createPlan('백업 UI 연결','실제 저장 응답을 확인합니다.'));
  const archive=exportProjectBackup(source.id,source.revision);
  const restored=await coreRestore(archive.bytes),checked=await validateRestoredBackup(restored);
  assert.equal(checked.plan.id,restored.plan.id);
  assert.equal(checked.summary.sourceProjectId,source.id);
});

test('populated restored Plan validates exact asset, timing, shared references and history',async()=>{
  const value=fixture(),p=value.plan,req=p.requirements.find(item=>item.mediaType==='image');
  const imageSha=sha('synthetic image'),takeSha=sha('synthetic audio');
  const asset={id:'asset_one',originalName:'synthetic.png',mediaType:'image',path:`assets/${imageSha}.png`,sha256:imageSha,
    mimeType:'image/png',width:12,height:9,durationSeconds:null,sourceUrl:'https://example.org',creator:'fixture',rightsNote:'fixture',
    semanticNote:'fixture',status:'pending-review',evidenceOnly:false};
  p.assets=[asset];req.assetId=asset.id;value.summary.assets=1;
  const take={id:'take_one',projectId:p.id,originalName:'fixture.wav',format:'wav',mimeType:'audio/wav',byteCount:128,
    sha256:takeSha,path:`narration/${takeSha}.wav`,durationSeconds:2,sampleRate:8000,channels:1,
    createdAt:p.createdAt,capturedRevision:1,scriptSha256:p.script.rawSha256,measurement:'ffprobe',alignmentStatus:'unavailable',productionAuthority:false};
  p.narrationTakes=[take];value.summary.recordings=1;
  const segment=p.script.segments.find(s=>s.kind==='narration');
  p.narrationTimings=[{id:'timing_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',projectId:p.id,capturedRevision:2,
    takeId:take.id,audioSha256:take.sha256,scriptSha256:p.script.rawSha256,createdAt:p.createdAt,
    method:'manual-timing-draft',reviewStatus:'draft',productionAuthority:false,
    segments:[{segmentId:segment.id,start:segment.start,end:segment.end,text:segment.text,startSeconds:0,endSeconds:1}]}];
  value.summary.timingDrafts=1;
  const result=await validateRestoredBackup(value);
  assert.equal(result.plan.requirements.find(item=>item.id===req.id).assetId,asset.id);
  assert.equal(result.plan.narrationTimings[0].takeId,take.id);
});

test('rejects nested authority and approval fields, malformed references, counts and script hashes',async()=>{
  for(const change of [v=>{v.plan.scenes[0].candidates[0].layers[0].approval='yes';},
    v=>{v.plan.scenes[0].candidates[0].requirementIds=['missing'];},v=>{v.summary.assets=1;},
    v=>{v.plan.script.rawSha256='0'.repeat(64);},v=>{v.plan.narrationTimings=[{productionAuthority:true}];},
    v=>{v.plan.origin={kind:'episode-spec'};},v=>{v.plan.aiAnalysisAdoption={productionAuthority:false};}]){
    const value=fixture();change(value);await assert.rejects(()=>validateRestoredBackup(value));
  }
});

test('requires the explicit empty source review list returned by copy restore',async()=>{
  for(const change of [v=>{delete v.plan.sourceReviews;},v=>{v.plan.sourceReviews=null;},
    v=>{v.plan.sourceReviews={};},v=>{v.plan.sourceReviews=[{id:'review_forged'}];}]){
    const value=fixture();change(value);await assert.rejects(()=>validateRestoredBackup(value));
  }
});

test('download checks headers, length, current scope and ZIP content before UI uses Blob',async()=>{
  const bytes=new Uint8Array([80,75,3,4]),headers={'content-type':'application/zip','cache-control':'no-store',
    'content-length':String(bytes.length),'content-disposition':'attachment; filename="safe.zip"'};
  const fetcher=async()=>new Response(bytes,{status:200,headers});
  const result=await downloadProjectBackup(scope,()=>scope,new AbortController().signal,fetcher);
  assert.equal(result.filename,'safe.zip');assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);
  assert.equal(await downloadProjectBackup(scope,()=>({...scope,revision:2}),new AbortController().signal,fetcher),null);
  for(const badHeaders of [{...headers,'content-length':'3'},{...headers,'content-type':'text/html'},
    {...headers,'content-disposition':'attachment; filename="../escape.zip"'},
    {...headers,'content-length':String(129*1024*1024)}]){
    await assert.rejects(()=>downloadProjectBackup(scope,()=>scope,new AbortController().signal,
      async()=>new Response(bytes,{status:200,headers:badHeaders})));
  }
  await assert.rejects(()=>downloadProjectBackup(scope,()=>scope,new AbortController().signal,
    async()=>new Response('error',{status:400})));
});

test('restore sends one guarded binary POST, validates saved response and reports uncertain failure',async()=>{
  const file=new File([new Uint8Array([80,75,3,4])],'fixture.zip',{type:'application/zip'}),requests=[];
  const fetcher=async(url,options)=>{requests.push({url,options});return reply(JSON.stringify(fixture()));};
  const result=await restoreProjectBackup(file,scope,()=>scope,new AbortController().signal,fetcher);
  assert.equal(result.plan.id,'project_backup_copy');assert.equal(requests.length,1);
  assert.equal(requests[0].options.headers['x-visualmaker-restore-copy'],'1');
  assert.equal(requests[0].options.headers['Content-Type'],'application/zip');
  assert.equal(requests[0].options.body,file);
  await assert.rejects(()=>restoreProjectBackup(new File(['x'],'bad.txt'),scope,()=>scope,new AbortController().signal,fetcher));
  assert.equal(requests.length,1);
  await assert.rejects(()=>restoreProjectBackup(file,scope,()=>scope,new AbortController().signal,
    async()=>reply('{',201)));
  assert.equal(await restoreProjectBackup(file,scope,()=>({...scope,projectId:'other'}),new AbortController().signal,fetcher),null);
  assert.equal(sameBackupScope(scope,{...scope,revision:2}),false);
});
