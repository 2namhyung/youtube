import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {MockLanguageModelV4} from 'ai/test';
import {createPlan,validatePlan} from '../../visualmaker/core/director.ts';
import {createTestAnalysisAdapter} from '../../visualmaker/core/ai-analysis.ts';
import {aiReport,cancelAIAnalysis,enqueueAIAnalysis,executeAIAnalysisClaim,readAIProposal} from '../../visualmaker/core/ai-analysis-job.ts';
import {claimJob,getJob} from '../../visualmaker/core/jobs.ts';
import {getProject,insertProject,updateProject} from '../../visualmaker/core/store.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const marker='visualmaker-ai-browser-owned-v1';
export const proofName='ai-browser-proof.json';
export function checkedRoot(root){
  const resolved=path.resolve(root);
  assert.equal(path.dirname(resolved),realpathSync(os.tmpdir()));
  assert.match(path.basename(resolved),/^vm-ai-browser-[A-Za-z0-9]+$/u);
  assert.equal(lstatSync(resolved).isSymbolicLink(),false);
  assert.equal(realpathSync(resolved),resolved);
  const markerPath=path.join(resolved,'fixture-marker.json');
  const markerStat=lstatSync(markerPath);
  assert.equal(markerStat.isFile(),true);
  assert.equal(markerStat.isSymbolicLink(),false);
  assert.equal(realpathSync(markerPath),markerPath);
  assert.equal(JSON.parse(readFileSync(markerPath,'utf8')).marker,marker);
  return resolved;
}
export function checkedPath(root,relative){
  const base=checkedRoot(root),target=path.resolve(base,relative);
  assert.ok(target.startsWith(base+path.sep));
  let current=base;
  for(const part of path.relative(base,target).split(path.sep)){
    current=path.join(current,part);
    let stat;try{stat=lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}
    assert.equal(stat.isSymbolicLink(),false);
    assert.equal(realpathSync(current),current);
  }
  return target;
}
const config={enabled:'1',cliPath:process.execPath,modelId:'codex/test-analyzer'};
const request=(plan,key)=>({projectId:plan.id,baseRevision:plan.revision,idempotencyKey:key,expectedModelId:'codex/test-analyzer',externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:2048,timeoutMs:1000});
const modelReply=plan=>({content:[{type:'text',text:JSON.stringify({records:plan.script.segments.map((segment,index)=>({segmentId:segment.id,mainMessage:`핵심 문장 ${index+1}`,uncertainty:`확인할 점 ${index+1}`,visualMeaningBrief:`문장 ${index+1}의 의미를 보여주는 화면`,searchBriefKo:`한국어 원본 영상 검색 ${index+1}`,searchBriefEn:`original footage search ${index+1}`}))})}],finishReason:{unified:'stop',raw:undefined},usage:{inputTokens:{total:9,noCache:9,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:15,text:15,reasoning:undefined}},warnings:[]});
const summary=(db,job)=>{
  const current=getJob(job.jobId),cp=db.prepare('SELECT attempt,outcome,external_call_started_at,response_sha256 FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(job.jobId);
  return {jobId:job.jobId,status:current.status,attempt:current.attempt,checkpointAttempt:cp.attempt,requestedRevision:current.requestedRevision,
    snapshotSha256:current.snapshotSha256,outcome:cp.outcome,externalCallStartedAt:cp.external_call_started_at,responseSha256:cp.response_sha256};
};

const adoptionScript='첫 번째 장면은 현장의 넓은 맥락을 보여줍니다.\n\n두 번째 장면은 중요한 행동을 설명합니다.\n\n세 번째 장면은 선택한 방향으로 검토합니다.\n\n네 번째 장면은 하나의 흐름을 시작합니다.\n\n다섯 번째 장면은 앞선 흐름을 이어서 마무리합니다.';
function validateOptions(options){
  assert.ok(options&&typeof options==='object'&&!Array.isArray(options),'Expected an options object');
  assert.deepEqual(Object.keys(options).sort(),['variant'],'Unexpected preparation option');
  assert.ok(options.variant==='default'||options.variant==='adoption','Unknown AI browser fixture variant');
  return options.variant;
}
function sceneForBeat(plan,beatId){
  const owners=plan.scenes.filter(scene=>scene.beatIds.includes(beatId));
  assert.equal(owners.length,1,`Expected exactly one scene for beat ${beatId}`);
  return owners[0];
}
export function deriveAdoptionMapping(plan){
  assert.equal(plan.script.segments.length,5);
  const entries=plan.script.segments.map(segment=>{
    const beats=plan.beats.filter(beat=>beat.segmentIds.length===1&&beat.segmentIds[0]===segment.id);
    assert.equal(beats.length,1,`Expected singleton beat for ${segment.id}`);
    const beat=beats[0],scene=sceneForBeat(plan,beat.id);
    return {segmentId:segment.id,beatId:beat.id,sceneId:scene.id,sceneBeatIds:[...scene.beatIds],locked:scene.locked,
      selectedCandidateId:scene.selectedCandidateId,reviewStatus:scene.reviewStatus,candidateIds:scene.candidates.map(candidate=>candidate.id)};
  });
  const eligible=entries.slice(0,2);
  const locked=entries[2];
  const merged=entries.slice(3);
  assert.ok(eligible.every(item=>item.sceneBeatIds.length===1&&!item.locked));
  assert.equal(locked.sceneBeatIds.length,1);assert.equal(locked.locked,true);
  assert.ok(locked.selectedCandidateId);assert.ok(locked.candidateIds.includes(locked.selectedCandidateId));
  assert.equal(locked.reviewStatus,'direction-selected');
  assert.equal(merged[0].sceneId,merged[1].sceneId);assert.equal(merged[0].sceneBeatIds.length,2);
  return {eligible:eligible.map(({segmentId,beatId,sceneId})=>({segmentId,beatId,sceneId})),
    locked:{segmentId:locked.segmentId,beatId:locked.beatId,sceneId:locked.sceneId,selectedCandidateId:locked.selectedCandidateId,
      candidateIds:locked.candidateIds,reviewStatus:locked.reviewStatus},
    merged:{sceneId:merged[0].sceneId,segments:merged.map(({segmentId,beatId})=>({segmentId,beatId}))}};
}

export async function prepareAIAnalysisBrowser(options={variant:'default'}){
  const variant=validateOptions(options);
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-ai-browser-')));
  writeFileSync(path.join(root,'fixture-marker.json'),JSON.stringify({marker,test_only:true}),{flag:'wx'});
  const dataRoot=checkedPath(root,'.fixture-data');mkdirSync(dataRoot);
  process.env.VISUALMAKER_DATA_DIR=dataRoot;
  for(const name of ['VISUALMAKER_AI_ENABLED','VISUALMAKER_CODEX_CLI_PATH','VISUALMAKER_AI_MODEL'])delete process.env[name];
  let plan=insertProject(createPlan('AI 브라우저 검증',variant==='adoption'?adoptionScript:'첫 번째 문장입니다.\n\n두 번째 문장입니다.'));
  if(variant==='adoption'){
    assert.equal(plan.script.segments.length,5);
    const eligibleSceneIds=plan.scenes.slice(0,2).map(scene=>scene.id);
    const lockedSceneId=plan.scenes[2].id,mergedSceneId=plan.scenes[3].id;
    const selectedCandidateId=plan.scenes[2].candidates[0]?.id;
    assert.ok(selectedCandidateId);
    plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:lockedSceneId,candidateId:selectedCandidateId});
    plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:lockedSceneId,locked:true});
    plan=updateProject(plan.id,plan.revision,{type:'merge-next',sceneId:mergedSceneId});
    assert.deepEqual(plan.scenes.filter(scene=>eligibleSceneIds.includes(scene.id)).map(scene=>[scene.beatIds.length,scene.locked]),[[1,false],[1,false]]);
    const beforeQueueMapping=deriveAdoptionMapping(plan);
    assert.equal(beforeQueueMapping.locked.sceneId,lockedSceneId);
    assert.equal(beforeQueueMapping.merged.sceneId,mergedSceneId);
  }
  const original=enqueueAIAnalysis(request(plan,'stale-queued'),config);
  plan=updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'화면 의미 검토',role:'context'});
  const planBytes=JSON.stringify(plan),planHash=sha(planBytes);
  const success=enqueueAIAnalysis(request(plan,'synthetic-success'),config),claimed=claimJob(success.jobId);
  let mockCalls=0;
  const testAdapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{mockCalls++;return modelReply(plan);}}),'codex/test-analyzer');
  const succeeded=await executeAIAnalysisClaim(success.jobId,claimed.token,claimed.snapshot,config,testAdapter);
  assert.equal(succeeded.status,'succeeded');assert.equal(mockCalls,1);
  const failure=enqueueAIAnalysis(request(plan,'synthetic-needs-review'),config),failureClaim=claimJob(failure.jobId);
  const failingAdapter=createTestAnalysisAdapter(new MockLanguageModelV4({doGenerate:async()=>{mockCalls++;throw new Error('synthetic failure; must be redacted');}}),'codex/test-analyzer');
  const needsReview=await executeAIAnalysisClaim(failure.jobId,failureClaim.token,failureClaim.snapshot,config,failingAdapter);
  assert.equal(needsReview.status,'needs-review');assert.equal(mockCalls,2);
  const queued=enqueueAIAnalysis(request(plan,'current-queued'),config);
  const toCancel=enqueueAIAnalysis(request(plan,'cancelled-before-call'),config);
  assert.equal(cancelAIAnalysis(plan.id,plan.revision,toCancel.jobId).status,'cancelled');
  assert.equal(JSON.stringify(getProject(plan.id)),planBytes);
  const report=aiReport(plan.id,plan.revision,{enabled:undefined,apiKey:undefined,modelId:undefined});
  assert.equal(report.capability.available,false);assert.equal(report.capability.providerVerified,false);
  const proposal=readAIProposal(plan.id,plan.revision,success.jobId);
  assert.equal(proposal.proposal.model.adapter,'sdk-test');
  const validatedPlan=validatePlan(getProject(plan.id));
  const mapping=variant==='adoption'?deriveAdoptionMapping(validatedPlan):null;
  if(variant==='adoption'){
    assert.equal(proposal.proposal.records.length,validatedPlan.script.segments.length);
    assert.deepEqual(proposal.proposal.records.map(record=>record.segmentId),validatedPlan.script.segments.map(segment=>segment.id));
    for(const [index,record] of proposal.proposal.records.entries()){
      const segment=validatedPlan.script.segments[index];
      assert.equal(record.source.start,segment.start);assert.equal(record.source.end,segment.end);
      assert.equal(record.source.text,segment.text);assert.equal(record.source.kind,segment.kind);
      for(const field of ['mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn'])assert.ok(record[field].trim().length>0,`Missing proposal field ${field}`);
    }
  }
  const artifact=getJob(success.jobId).artifacts[0];assert.ok(artifact);
  const artifactPath=checkedPath(root,`.fixture-data/${artifact.path.replaceAll('\\','/')}`);
  const artifactBytes=readFileSync(artifactPath);
  assert.equal(sha(artifactBytes),artifact.sha256);
  assert.equal(sha(Buffer.from(JSON.stringify(proposal.proposal))),artifact.sha256);
  const db=new DatabaseSync(checkedPath(root,'.fixture-data/studio.sqlite'),{readOnly:true});
  let jobs,baselineHistoryCount;try{
    jobs={staleQueued:summary(db,original),succeeded:summary(db,success),needsReview:summary(db,failure),currentQueued:summary(db,queued),cancelled:summary(db,toCancel)};
    baselineHistoryCount=db.prepare('SELECT COUNT(*) AS count FROM revisions WHERE project_id=?').get(plan.id).count;
  }finally{db.close();}
  assert.deepEqual(Object.values(jobs).map(item=>[item.status,item.outcome]),[['queued','not-started'],['succeeded','succeeded'],['needs-review','needs-review'],['queued','not-started'],['cancelled','cancelled-before-call']]);
  assert.equal(report.jobs.length,5);
  assert.equal(report.jobs.find(item=>item.jobId===original.jobId).stale,true);
  const proof={schemaVersion:'visualmaker-ai-browser-proof-v1',marker,test_only:true,productionAuthority:false,liveProviderCalls:0,humanApproval:false,mockCalls,variant,
    root,dataRoot,projectId:plan.id,revision:plan.revision,initialPlanBytes:Buffer.byteLength(planBytes),initialPlanSha256:planHash,baselineHistoryCount,
    scriptSha256:plan.script.rawSha256,snapshotSha256:planHash,planSha256:planHash,adoptionMapping:mapping,
    jobs,proposal:{path:path.relative(root,artifactPath).replaceAll('\\','/'),bytes:artifactBytes.length,sha256:artifact.sha256,compactJsonSha256:sha(Buffer.from(JSON.stringify(proposal.proposal)))}};
  writeFileSync(checkedPath(root,proofName),JSON.stringify(proof,null,2),{flag:'wx'});
  return {root,proof};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  assert.ok(args.length===0||(args.length===2&&args[0]==='--variant'&&['default','adoption'].includes(args[1])),'Expected no arguments or --variant default|adoption');
  const {root}=await prepareAIAnalysisBrowser({variant:args.length?args[1]:'default'});
  process.stdout.write(JSON.stringify({prepared:true,root,proofPath:checkedPath(root,proofName)})+'\n');
}
