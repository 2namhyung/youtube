import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {acceptAIReport,aiEnqueueRequestSha256,boundedAIJson,currentAIActionJob,currentAIEnqueueJob,currentAIJob,currentAIProposal,currentAIReport,
  newAIEnqueueRequest,retainedAIEnqueueRequest,withAIJobAcknowledgement} from '../src/components/studio/ai-analysis-client.ts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const id='job_00000000-0000-0000-0000-000000000001';
const now='2026-10-14T00:00:00.000Z';
const plan=importEpisode();
const snapshotSha256=sha(JSON.stringify(plan));
const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256};
const modelId='openai/gpt-test';
const enqueueRequestSha256=sha(JSON.stringify(['visualmaker-ai-enqueue-identity-v1',plan.id,plan.revision,snapshotSha256,
  plan.script.rawSha256,modelId,true,true,2048,60000,'fixed-key']));
const job={jobId:id,status:'succeeded',requestedRevision:plan.revision,snapshotSha256,scriptSha256:plan.script.rawSha256,
  requestedModelId:modelId,requestContractSha256:'1'.repeat(64),enqueueRequestSha256,
  createdAt:now,updatedAt:now,startedAt:now,finishedAt:now,
  attempt:1,externalCall:{startedAt:now,outcome:'succeeded'},error:null,
  artifact:{name:'ai-analysis-proposal.json',sha256:'2'.repeat(64)},productionAuthority:false,requiresHumanReview:true,cost:'unknown'};
const proposal={schemaVersion:'visualmaker-ai-analysis-v1',requestId:id,scope,
  model:{adapter:'sdk-test',requestedModelId:modelId,responseModelId:modelId},usage:{inputTokens:100,outputTokens:200},
  cost:'unknown',productionAuthority:false,requiresHumanReview:true,
  records:plan.script.segments.map(segment=>({segmentId:segment.id,mainMessage:'핵심 메시지',uncertainty:'검토 필요',
    visualMeaningBrief:'비교할 의미',searchBriefKo:'한국어 자료 찾기',searchBriefEn:'English source search',
    source:{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind}}))};
job.artifact.sha256=sha(JSON.stringify(proposal));
const limits={maxScriptUnits:20000,minSegments:1,maxSegments:40,minOutputTokens:512,maxOutputTokens:8192,minTimeoutMs:10,maxTimeoutMs:120000};
const report={schemaVersion:'visualmaker-ai-analysis-readiness-v1',scope,
  capability:{available:false,modelId:null,reason:'configuration-required',providerVerified:false},limits,
  jobs:[{...job,stale:false}],productionAuthority:false,requiresHumanReview:true,cost:'unknown'};
const clone=value=>structuredClone(value);

test('AI report accepts configured and unavailable statuses, and rejects private or drifted scope',async()=>{
  assert.ok(await currentAIReport({report},plan));
  const configured=clone(report);configured.capability={available:true,modelId,reason:null,providerVerified:false};
  assert.ok(await currentAIReport({report:configured},plan));
  for(const changed of [
    {...report,scope:{...scope,snapshotSha256:'f'.repeat(64)}},
    {...report,capability:{...report.capability,providerVerified:true}},
    {...report,limits:{...limits,maxOutputTokens:9999}},
    {...report,jobs:[{...report.jobs[0],stale:true}]},
    {...report,jobs:[{...report.jobs[0],secret:'private'}]},
    {...report,productionAuthority:true},
    {...report,jobs:[...report.jobs,report.jobs[0]]}
  ])assert.equal(await currentAIReport({report:changed},plan),null);
  assert.equal(await currentAIReport({report:{...report,privateKey:'never'}},plan),null);
  const stale=clone(report);stale.jobs[0].requestedRevision+=1;stale.jobs[0].stale=true;
  assert.ok(await currentAIReport({report:stale},plan));
});

test('AI job and compact proposal bind exact model, plan segments and artifact hash',async()=>{
  assert.ok(await currentAIJob({job},plan));
  assert.ok(await currentAIProposal({job,proposal},job,plan),'synthetic proposal remains inspectable without configured provider');
  const mutate=change=>{const value={job:clone(job),proposal:clone(proposal)};change(value);return value;};
  for(const changed of [
    mutate(v=>{v.proposal.scope.revision+=1;}),
    mutate(v=>{v.proposal.requestId='job_00000000-0000-0000-0000-000000000002';}),
    mutate(v=>{v.proposal.model.requestedModelId='other/model';}),
    mutate(v=>{v.proposal.model.adapter='unknown';}),
    mutate(v=>{v.proposal.records[0].source.text='changed';}),
    mutate(v=>{v.proposal.records[0].segmentId='other';}),
    mutate(v=>{v.proposal.records[0].mainMessage=' '.repeat(601);}),
    mutate(v=>{v.proposal.records[0].unsafe='<img>'; }),
    mutate(v=>{v.proposal.records.reverse();}),
    mutate(v=>{v.proposal.productionAuthority=true;}),
    mutate(v=>{v.job.requestContractSha256='f'.repeat(64);}),
    mutate(v=>{v.job.artifact.sha256='f'.repeat(64);}),
    mutate(v=>{v.job.status='queued';}),
  ])assert.equal(await currentAIProposal(changed,job,plan),null);
  assert.equal(await currentAIJob({job:{...job,snapshotSha256:'f'.repeat(64)}},plan),null);
  assert.equal(await currentAIJob({job:{...job,extra:1}},plan),null);
  const stale={...job,requestedRevision:plan.revision+1,snapshotSha256:'f'.repeat(64)};
  assert.equal(await currentAIJob({job:stale},plan),null);
  const staleQueued={...stale,status:'queued',attempt:0,startedAt:null,finishedAt:null,
    externalCall:{startedAt:null,outcome:'not-started'},artifact:null};
  assert.ok(currentAIActionJob({job:{...staleQueued,status:'cancelled',finishedAt:now,
    externalCall:{startedAt:null,outcome:'cancelled-before-call'}}},staleQueued,plan,'cancel'),
    'stale owned job can receive a terminal cancel acknowledgement');
});

test('enqueue contract and bounded JSON reader retain safe request limits',async()=>{
  const input={plan,modelId,maxOutputTokens:2048,timeoutMs:60000,idempotencyKey:'fixed-key'};
  const request=newAIEnqueueRequest(input);assert.ok(request);
  assert.equal(await aiEnqueueRequestSha256(request,plan),enqueueRequestSha256);
  assert.ok(await currentAIEnqueueJob({job},plan,request));
  assert.strictEqual(retainedAIEnqueueRequest(request,{...input,modelId:'other/model',maxOutputTokens:8192,
    timeoutMs:120000,idempotencyKey:'different-key'}),request,'ambiguous request preserves the complete contract and key');
  assert.deepEqual(Object.keys(request).sort(),['action','projectId','baseRevision','idempotencyKey','expectedModelId',
    'externalTransmissionConsent','billingConsent','maxOutputTokens','timeoutMs'].sort());
  assert.equal(newAIEnqueueRequest({...input,maxOutputTokens:8193}),null);
  assert.equal(newAIEnqueueRequest({...input,timeoutMs:0}),null);
  assert.equal(newAIEnqueueRequest({...input,modelId:'bad'}),null);
  for(const changed of [
    {...request,idempotencyKey:'different-key'},
    {...request,expectedModelId:'other/model'},
    {...request,maxOutputTokens:4096},
    {...request,timeoutMs:120000}
  ])assert.equal(await currentAIEnqueueJob({job},plan,changed),null,
    'same model or snapshot alone cannot reconcile a different consented request');
  const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
  const controller=new AbortController();
  assert.deepEqual(await boundedAIJson(new Response(JSON.stringify({job}),{headers}),16000,controller.signal),{job});
  await assert.rejects(boundedAIJson(new Response(JSON.stringify({job}),{headers}),8,controller.signal));
  await assert.rejects(boundedAIJson(new Response(JSON.stringify({job}),{headers:{'Content-Type':'application/json'}}),16000,controller.signal));
  controller.abort();await assert.rejects(boundedAIJson(new Response(JSON.stringify({job}),{headers}),16000,controller.signal));
});

test('AI action acknowledgements require terminal checkpoint states and report reads preserve newer actions',()=>{
  const queued={...job,status:'queued',attempt:0,startedAt:null,finishedAt:null,artifact:null,
    externalCall:{startedAt:null,outcome:'not-started'}};
  const running={...queued,status:'running',attempt:1,startedAt:now,updatedAt:'2026-10-14T00:00:01.000Z',
    externalCall:{startedAt:now,outcome:'started'}};
  const cancelled={...queued,status:'cancelled',finishedAt:'2026-10-14T00:00:02.000Z',updatedAt:'2026-10-14T00:00:02.000Z',
    externalCall:{startedAt:null,outcome:'cancelled-before-call'}};
  const needsReview={...running,status:'needs-review',finishedAt:'2026-10-14T00:00:02.000Z',updatedAt:'2026-10-14T00:00:02.000Z',
    externalCall:{startedAt:now,outcome:'needs-review'}};
  const failed={...queued,status:'failed',attempt:1,startedAt:now,finishedAt:'2026-10-14T00:00:02.000Z',
    updatedAt:'2026-10-14T00:00:02.000Z',externalCall:{startedAt:null,outcome:'failed-before-call'}};
  assert.ok(currentAIActionJob({job:running},queued,plan,'run'));
  assert.equal(currentAIActionJob({job:queued},queued,plan,'run'),null,'unchanged queued does not confirm worker start');
  assert.ok(currentAIActionJob({job:cancelled},queued,plan,'cancel'));
  assert.ok(currentAIActionJob({job:needsReview},running,plan,'cancel'));
  assert.ok(currentAIActionJob({job:failed},running,plan,'recover'));
  assert.ok(currentAIActionJob({job:needsReview},running,plan,'recover'));
  assert.equal(currentAIActionJob({job:running},running,plan,'cancel'),null);
  assert.equal(currentAIActionJob({job:running},running,plan,'recover'),null);
  assert.equal(currentAIActionJob({job:cancelled},running,plan,'recover'),null);
  assert.equal(currentAIActionJob({job:{...cancelled,externalCall:{startedAt:null,outcome:'not-started'}}},queued,plan,'cancel'),null);
  assert.equal(currentAIActionJob({job:{...cancelled,enqueueRequestSha256:'f'.repeat(64)}},queued,plan,'cancel'),null);
  const old={...report,jobs:[{...queued,stale:false}]};
  const acknowledged=withAIJobAcknowledgement(old,cancelled);
  assert.equal(acknowledged.jobs[0].status,'cancelled');
  assert.equal(acceptAIReport(acknowledged,old,4,5,cancelled),acknowledged,'obsolete in-flight read is ignored');
  assert.equal(acceptAIReport(acknowledged,old,5,5,cancelled).jobs[0].status,'cancelled',
    'an older queued row cannot overwrite a terminal action acknowledgement');
  const advanced={...report,jobs:[{...needsReview,stale:false}]};
  advanced.jobs[0].updatedAt='2026-10-14T00:00:03.000Z';
  assert.equal(acceptAIReport(acknowledged,advanced,6,6,cancelled).jobs[0].status,'needs-review');
});
