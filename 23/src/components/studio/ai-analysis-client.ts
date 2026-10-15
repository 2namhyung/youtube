import type {Plan} from '../../../visualmaker/core/model.ts';
import type {AnalysisProposal} from '../../../visualmaker/core/ai-analysis.ts';
import {episodePlanHash} from './episode-client.ts';

const HASH=/^[a-f0-9]{64}$/u,JOB=/^job_[a-f0-9-]{36}$/u;
const MODEL=/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/iu;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const hash=(value:unknown)=>typeof value==='string'&&HASH.test(value);
const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const date=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)&&!Number.isNaN(Date.parse(value));
const optionalDate=(value:unknown)=>value===null||date(value);
const model=(value:unknown)=>typeof value==='string'&&value.length<=160&&MODEL.test(value);
const statuses=['queued','running','succeeded','failed','cancelled','needs-review'];
const outcomes=['not-started','started','succeeded','needs-review','cancelled-before-call','failed-before-call'];
const LIMITS={maxScriptUnits:20000,minSegments:1,maxSegments:40,minOutputTokens:512,maxOutputTokens:8192,minTimeoutMs:10,maxTimeoutMs:120000};
export type AIJob={jobId:string;status:string;requestedRevision:number;snapshotSha256:string;scriptSha256:string;requestedModelId:string;requestContractSha256:string;enqueueRequestSha256:string;
  createdAt:string;updatedAt:string;startedAt:string|null;finishedAt:string|null;attempt:number;
  externalCall:{startedAt:string|null;outcome:string};error:string|null;artifact:null|{name:'ai-analysis-proposal.json';sha256:string};
  productionAuthority:false;requiresHumanReview:true;cost:'unknown';stale?:boolean};
export type AIReport={schemaVersion:'visualmaker-ai-analysis-readiness-v1';scope:{projectId:string;revision:number;scriptSha256:string;snapshotSha256:string};
  capability:{available:boolean;modelId:string|null;reason:string|null;providerVerified:false};limits:typeof LIMITS;jobs:AIJob[];
  productionAuthority:false;requiresHumanReview:true;cost:'unknown'};
export type AIEnqueueRequest={action:'enqueue';projectId:string;baseRevision:number;idempotencyKey:string;expectedModelId:string;
  externalTransmissionConsent:true;billingConsent:true;maxOutputTokens:number;timeoutMs:number};

function validJob(value:unknown,scope:AIReport['scope'],withStale:boolean):value is AIJob{
  if(!exact(value,['jobId','status','requestedRevision','snapshotSha256','scriptSha256','requestedModelId','requestContractSha256',
    'enqueueRequestSha256','createdAt','updatedAt','startedAt','finishedAt','attempt','externalCall','error','artifact','productionAuthority',
    'requiresHumanReview','cost',...withStale?['stale']:[]])||typeof value.jobId!=='string'||!JOB.test(value.jobId)||
    typeof value.status!=='string'||!statuses.includes(value.status)||
    !integer(value.requestedRevision,1,Number.MAX_SAFE_INTEGER)||!hash(value.snapshotSha256)||!hash(value.scriptSha256)||
    !model(value.requestedModelId)||!hash(value.requestContractSha256)||!hash(value.enqueueRequestSha256)||
    !date(value.createdAt)||!date(value.updatedAt)||
    !optionalDate(value.startedAt)||!optionalDate(value.finishedAt)||!integer(value.attempt,0,1)||
    !exact(value.externalCall,['startedAt','outcome'])||!optionalDate(value.externalCall.startedAt)||
    typeof value.externalCall.outcome!=='string'||!outcomes.includes(value.externalCall.outcome)||
    !(value.error===null||typeof value.error==='string'&&value.error.length<=500)||
    value.productionAuthority!==false||value.requiresHumanReview!==true||value.cost!=='unknown')return false;
  if(value.artifact!==null&&(!exact(value.artifact,['name','sha256'])||value.artifact.name!=='ai-analysis-proposal.json'||!hash(value.artifact.sha256)))return false;
  if((value.status==='succeeded')!==(value.artifact!==null))return false;
  const outcome=value.externalCall.outcome,callStarted=value.externalCall.startedAt!==null;
  if((value.status==='queued'&&(value.attempt!==0||outcome!=='not-started'||callStarted||value.startedAt!==null||value.finishedAt!==null))||
    (value.status==='running'&&(value.attempt!==1||!['not-started','started'].includes(outcome)||
      callStarted!==(outcome==='started')||value.startedAt===null||value.finishedAt!==null))||
    (value.status==='succeeded'&&(value.attempt!==1||outcome!=='succeeded'||!callStarted||value.startedAt===null||value.finishedAt===null))||
    (value.status==='needs-review'&&(value.attempt!==1||outcome!=='needs-review'||!callStarted||value.startedAt===null||value.finishedAt===null))||
    (value.status==='failed'&&(outcome!=='failed-before-call'||callStarted||value.finishedAt===null))||
    (value.status==='cancelled'&&(outcome!=='cancelled-before-call'||callStarted||value.finishedAt===null)))return false;
  if(withStale){const stale=value.requestedRevision!==scope.revision||value.snapshotSha256!==scope.snapshotSha256||value.scriptSha256!==scope.scriptSha256;
    if(value.stale!==stale)return false;
  }else if(value.requestedRevision!==scope.revision||value.snapshotSha256!==scope.snapshotSha256||value.scriptSha256!==scope.scriptSha256)return false;
  return true;
}

export async function currentAIReport(value:unknown,plan:Plan):Promise<AIReport|null>{
  if(!exact(value,['report'])||!exact(value.report,['schemaVersion','scope','capability','limits','jobs','productionAuthority','requiresHumanReview','cost']))return null;
  const report=value.report;
  const withinLimits=plan.script.rawText.length<=LIMITS.maxScriptUnits&&
    plan.script.segments.length>=LIMITS.minSegments&&plan.script.segments.length<=LIMITS.maxSegments;
  if(report.schemaVersion!=='visualmaker-ai-analysis-readiness-v1'||!exact(report.scope,['projectId','revision','scriptSha256','snapshotSha256'])||
    report.scope.projectId!==plan.id||report.scope.revision!==plan.revision||report.scope.scriptSha256!==plan.script.rawSha256||
    report.scope.snapshotSha256!==await episodePlanHash(plan)||!exact(report.capability,['available','modelId','reason','providerVerified'])||
    typeof report.capability.available!=='boolean'||!(report.capability.modelId===null||model(report.capability.modelId))||
    !(report.capability.reason===null||['configuration-required','input-limit'].includes(String(report.capability.reason)))||
    report.capability.providerVerified!==false||report.capability.available&&
      (report.capability.modelId===null||report.capability.reason!==null)||
    !report.capability.available&&report.capability.reason===null||
    !withinLimits&&(report.capability.available||report.capability.reason!=='input-limit')||
    withinLimits&&report.capability.reason==='input-limit'||
    !exact(report.limits,Object.keys(LIMITS))||Object.entries(LIMITS).some(([key,limit])=>(report.limits as Record<string,unknown>)[key]!==limit)||
    !Array.isArray(report.jobs)||report.jobs.length>50||report.jobs.some(job=>!validJob(job,report.scope as AIReport['scope'],true))||
    new Set(report.jobs.map(job=>job.jobId)).size!==report.jobs.length||report.productionAuthority!==false||
    report.requiresHumanReview!==true||report.cost!=='unknown')return null;
  return report as AIReport;
}

export async function currentAIJob(value:unknown,plan:Plan,expected?:{jobId?:string;modelId?:string}):Promise<AIJob|null>{
  if(!exact(value,['job']))return null;
  const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:await episodePlanHash(plan)};
  const job=value.job;
  return validJob(job,scope,false)&&(!expected?.jobId||job.jobId===expected.jobId)&&
    (!expected?.modelId||job.requestedModelId===expected.modelId)?job:null;
}

export function currentAIActionJob(value:unknown,prior:AIJob,plan:Plan,action:'run'|'cancel'|'recover'):AIJob|null{
  if(!exact(value,['job']))return null;
  const scope={projectId:plan.id,revision:prior.requestedRevision,scriptSha256:prior.scriptSha256,snapshotSha256:prior.snapshotSha256};
  const job=value.job;
  if(!validJob(job,scope,false)||job.jobId!==prior.jobId||job.requestContractSha256!==prior.requestContractSha256||
    job.enqueueRequestSha256!==prior.enqueueRequestSha256||job.requestedModelId!==prior.requestedModelId||
    job.attempt<prior.attempt||Date.parse(job.updatedAt)<Date.parse(prior.updatedAt))return null;
  if(action==='run')return prior.status==='queued'&&!prior.stale&&job.status!=='queued'?job:null;
  if(action==='cancel')return ['queued','running'].includes(prior.status)&&
    (job.status==='cancelled'&&job.externalCall.outcome==='cancelled-before-call'||
      job.status==='needs-review'&&job.externalCall.outcome==='needs-review')?job:null;
  return prior.status==='running'&&
    (job.status==='failed'&&job.externalCall.outcome==='failed-before-call'||
      job.status==='needs-review'&&job.externalCall.outcome==='needs-review')?job:null;
}

export async function aiEnqueueRequestSha256(request:AIEnqueueRequest,plan:Plan):Promise<string>{
  const snapshotSha256=await episodePlanHash(plan);
  const bytes=new TextEncoder().encode(JSON.stringify(['visualmaker-ai-enqueue-identity-v1',request.projectId,request.baseRevision,
    snapshotSha256,plan.script.rawSha256,request.expectedModelId,true,true,request.maxOutputTokens,request.timeoutMs,request.idempotencyKey]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function currentAIEnqueueJob(value:unknown,plan:Plan,request:AIEnqueueRequest):Promise<AIJob|null>{
  if(request.projectId!==plan.id||request.baseRevision!==plan.revision)return null;
  const job=await currentAIJob(value,plan,{modelId:request.expectedModelId});
  return job&&job.enqueueRequestSha256===await aiEnqueueRequestSha256(request,plan)?job:null;
}

export function withAIJobAcknowledgement(report:AIReport|null,job:AIJob|null):AIReport|null{
  if(!report||!job)return report;
  const jobs=report.jobs.filter(item=>item.jobId!==job.jobId);
  return {...report,jobs:[{...job,stale:job.stale??false},...jobs].slice(0,50)};
}

export function acceptAIReport(current:AIReport|null,incoming:AIReport,ticket:number,latestTicket:number,ack:AIJob|null):AIReport|null{
  if(ticket!==latestTicket)return current;
  const jobs=incoming.jobs.map(job=>{
    const previous=current?.jobs.find(item=>item.jobId===job.jobId);
    return previous&&(Date.parse(job.updatedAt)<Date.parse(previous.updatedAt)||
      job.updatedAt===previous.updatedAt&&job.status!==previous.status)?previous:job;
  });
  const merged={...incoming,jobs};
  if(!ack)return merged;
  const candidate=merged.jobs.find(job=>job.jobId===ack.jobId);
  return !candidate||Date.parse(candidate.updatedAt)<=Date.parse(ack.updatedAt)&&candidate.status!==ack.status?
    withAIJobAcknowledgement(merged,ack):merged;
}

export async function currentAIProposal(value:unknown,job:AIJob,plan:Plan):Promise<AnalysisProposal|null>{
  if(!exact(value,['job','proposal'])||!job.artifact||job.status!=='succeeded'||job.stale)return null;
  const returned=await currentAIJob({job:value.job},plan,{jobId:job.jobId,modelId:job.requestedModelId});
  if(!returned||returned.status!=='succeeded'||returned.artifact?.sha256!==job.artifact.sha256||
    returned.requestContractSha256!==job.requestContractSha256||returned.attempt!==job.attempt)return null;
  const proposal=value.proposal;
  if(!exact(proposal,['schemaVersion','requestId','scope','model','usage','cost','productionAuthority','requiresHumanReview','records'])||
    proposal.schemaVersion!=='visualmaker-ai-analysis-v1'||proposal.requestId!==job.jobId||
    !exact(proposal.scope,['projectId','revision','scriptSha256','snapshotSha256'])||
    proposal.scope.projectId!==plan.id||proposal.scope.revision!==plan.revision||
    proposal.scope.scriptSha256!==plan.script.rawSha256||proposal.scope.snapshotSha256!==job.snapshotSha256||
    !exact(proposal.model,['adapter','requestedModelId','responseModelId'])||
    !['gateway-api-key','sdk-test','codex-cli'].includes(String(proposal.model.adapter))||proposal.model.requestedModelId!==job.requestedModelId||
    !(proposal.model.responseModelId===null||model(proposal.model.responseModelId))||
    !exact(proposal.usage,['inputTokens','outputTokens'])||
    [proposal.usage.inputTokens,proposal.usage.outputTokens].some(item=>item!==null&&!integer(item,0,Number.MAX_SAFE_INTEGER))||
    proposal.cost!=='unknown'||proposal.productionAuthority!==false||proposal.requiresHumanReview!==true||
    !Array.isArray(proposal.records)||proposal.records.length!==plan.script.segments.length)return null;
  for(let i=0;i<proposal.records.length;i++){
    const record=proposal.records[i],segment=plan.script.segments[i];
    if(!exact(record,['segmentId','mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn','source'])||
      record.segmentId!==segment.id||!exact(record.source,['start','end','text','kind'])||
      record.source.start!==segment.start||record.source.end!==segment.end||record.source.text!==segment.text||record.source.kind!==segment.kind||
      ['mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn'].some(key=>
        typeof record[key]!=='string'||record[key].length<1||record[key].length>600||record[key].trim()!==record[key]))return null;
  }
  const bytes=new TextEncoder().encode(JSON.stringify(proposal));if(bytes.byteLength<1||bytes.byteLength>200000)return null;
  const digest=await crypto.subtle.digest('SHA-256',bytes);const sha=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return sha===job.artifact.sha256?proposal as AnalysisProposal:null;
}

export function newAIEnqueueRequest(input:{plan:Plan;modelId:string;maxOutputTokens:number;timeoutMs:number;idempotencyKey:string}):AIEnqueueRequest|null{
  const {plan,modelId,maxOutputTokens,timeoutMs,idempotencyKey}=input;
  if(!model(modelId)||!integer(maxOutputTokens,512,8192)||!integer(timeoutMs,10,120000)||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(idempotencyKey))return null;
  return {action:'enqueue',projectId:plan.id,baseRevision:plan.revision,idempotencyKey,expectedModelId:modelId,
    externalTransmissionConsent:true,billingConsent:true,maxOutputTokens,timeoutMs};
}

export function retainedAIEnqueueRequest(pending:AIEnqueueRequest|null,input:Parameters<typeof newAIEnqueueRequest>[0]):AIEnqueueRequest|null{
  return pending??newAIEnqueueRequest(input);
}

export async function boundedAIJson(response:Response,maxBytes:number,signal:AbortSignal):Promise<unknown>{
  if(response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error('AI 응답 범위가 올바르지 않습니다.');
  const length=response.headers.get('content-length');if(length!==null&&(!integer(Number(length),1,maxBytes)))throw new Error('AI 응답 크기가 허용 범위를 넘었습니다.');
  const reader=response.body?.getReader();if(!reader)throw new Error('AI 응답 내용이 없습니다.');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){if(signal.aborted)throw new Error('요청이 취소됐습니다.');const {value,done}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>maxBytes)throw new Error('AI 응답 크기가 허용 범위를 넘었습니다.');chunks.push(value);}
    if(signal.aborted||size<1)throw new Error('AI 응답이 완전히 전달되지 않았습니다.');
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
  }finally{if(signal.aborted||size>maxBytes)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
