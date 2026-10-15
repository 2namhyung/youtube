import {createHash,randomUUID} from 'node:crypto';
import {closeSync,constants,existsSync,fstatSync,lstatSync,mkdirSync,openSync,readFileSync,readSync,realpathSync,renameSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {analyzePlan,AnalysisError,createCodexAnalysisAdapter,type AnalysisAdapter,type AnalysisProposal} from './ai-analysis.ts';
import {resolveCodexCli} from './ai-codex-cli.ts';
import {validatePlan} from './director.ts';
import {cancelJob,getJob,initializeJobStorage,recoverJob,type Job} from './jobs.ts';
import type {Plan} from './model.ts';
import {dataRoot,getProject,openDb,StoreError} from './store.ts';

export const AI_JOB_SCHEMA='visualmaker-ai-analysis-job-v1' as const;
export const AI_PROPOSAL_NAME='ai-analysis-proposal.json' as const;
export const AI_LIMITS=Object.freeze({maxScriptUnits:20_000,minSegments:1,maxSegments:40,minOutputTokens:512,maxOutputTokens:8192,minTimeoutMs:10,maxTimeoutMs:120_000});
export type AIConfig={enabled:string|undefined;cliPath?:string|undefined;modelId?:string|undefined;apiKey?:string|undefined};
export type AIEnqueue={projectId:string;baseRevision:number;idempotencyKey:string;expectedModelId:string;externalTransmissionConsent:true;billingConsent:true;maxOutputTokens:number;timeoutMs:number};
type AIContract={schemaVersion:typeof AI_JOB_SCHEMA;jobId:string;projectId:string;revision:number;scriptSha256:string;snapshotSha256:string;requestSha256:string;requestedModelId:string;externalTransmissionConsent:true;billingConsent:true;maxOutputTokens:number;timeoutMs:number;createdAt:string};
type Checkpoint={job_id:string;attempt:number;request_sha256:string;external_call_started_at:string|null;response_sha256:string|null;outcome:'not-started'|'started'|'succeeded'|'needs-review'|'cancelled-before-call'|'failed-before-call';error_code:string|null};
type JobRow={id:string;project_id:string;kind:string;status:string;requested_revision:number;snapshot_sha256:string;snapshot_json:string;request_sha256:string;idempotency_key:string;execution_contract_json:string|null;execution_contract_sha256:string|null;attempt:number;lease_token:string|null;lease_expires_at:string|null;created_at:string;updated_at:string;started_at:string|null;finished_at:string|null;error:string|null};
type Db=ReturnType<typeof openDb>;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
const JOB=/^job_[a-f0-9-]{36}$/u,PROJECT=/^plan-[a-f0-9-]{36}$/u,KEY=/^[A-Za-z0-9_-]{1,128}$/u,HASH=/^[a-f0-9]{64}$/u;
const MODEL=/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/iu;

function fail(message='AI 분석 요청이 올바르지 않습니다.',status=400):never{throw new StoreError(message,status);}
function transaction<T>(db:Db,work:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}
function jobRow(db:Db,id:string):JobRow{if(!JOB.test(id))fail();const row=db.prepare('SELECT * FROM visualmaker_jobs WHERE id=?').get(id) as JobRow|undefined;if(!row||row.kind!=='ai-script-analysis')fail('AI 분석 작업을 찾을 수 없습니다.',404);return row;}
function checkpoint(db:Db,id:string):Checkpoint{const value=db.prepare('SELECT * FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id) as Checkpoint|undefined;if(!value)fail('AI 분석 호출 기록을 확인할 수 없습니다.',409);return value;}
function isModel(value:unknown):value is string{return typeof value==='string'&&value.length<=160&&MODEL.test(value);}
function configuredModel(config:AIConfig):string|null{return config.modelId===undefined||config.modelId===''?'codex/default':isModel(config.modelId)&&config.modelId.startsWith('codex/')?config.modelId:null;}
function configReady(config:AIConfig):boolean{return config.enabled==='1'&&configuredModel(config)!==null&&resolveCodexCli(config.cliPath)!==null;}
export function aiConfiguration(config:AIConfig){return {available:configReady(config),modelId:configuredModel(config),reason:configReady(config)?null:'configuration-required' as string|null,providerVerified:false as const};}
function requireConfig(config:AIConfig,expectedModelId:string):void{if(!configReady(config)||configuredModel(config)!==expectedModelId)fail('AI 분석 설정이 현재 요청과 다릅니다.',409);}
function requireScope(plan:Plan,projectId:string,revision:number){if(!PROJECT.test(projectId)||!Number.isSafeInteger(revision)||revision<1)fail();if(plan.id!==projectId||plan.revision!==revision)fail('프로젝트 리비전이 변경됐습니다.',409);}
function limits(plan:Plan,tokens:number,timeoutMs:number):void{
  if(plan.script.rawText.length>AI_LIMITS.maxScriptUnits||plan.script.segments.length<1||plan.script.segments.length>AI_LIMITS.maxSegments||
    !Number.isSafeInteger(tokens)||tokens<AI_LIMITS.minOutputTokens||tokens>AI_LIMITS.maxOutputTokens||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<AI_LIMITS.minTimeoutMs||timeoutMs>AI_LIMITS.maxTimeoutMs)fail('AI 분석 입력 한도를 확인하세요.',400);
}
function contractOf(row:JobRow):AIContract{
  if(!row.execution_contract_json||!row.execution_contract_sha256||sha(row.execution_contract_json)!==row.execution_contract_sha256)fail('AI 분석 계약이 변경됐습니다.',409);
  let c:AIContract;try{c=JSON.parse(row.execution_contract_json) as AIContract;}catch{fail('AI 분석 계약을 읽을 수 없습니다.',409);}
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join('|')!==['schemaVersion','jobId','projectId','revision','scriptSha256','snapshotSha256','requestSha256','requestedModelId','externalTransmissionConsent','billingConsent','maxOutputTokens','timeoutMs','createdAt'].sort().join('|')||
    c.schemaVersion!==AI_JOB_SCHEMA||c.jobId!==row.id||c.projectId!==row.project_id||c.revision!==row.requested_revision||c.snapshotSha256!==row.snapshot_sha256||c.requestSha256!==row.request_sha256||
    !HASH.test(c.scriptSha256)||!isModel(c.requestedModelId)||c.externalTransmissionConsent!==true||c.billingConsent!==true||!Number.isSafeInteger(c.maxOutputTokens)||!Number.isSafeInteger(c.timeoutMs))fail('AI 분석 계약이 올바르지 않습니다.',409);
  return c;
}
function safeJob(db:Db,row:JobRow){const c=contractOf(row),cp=checkpoint(db,row.id);
  const enqueueRequestSha256=sha(JSON.stringify(['visualmaker-ai-enqueue-identity-v1',row.project_id,row.requested_revision,c.snapshotSha256,c.scriptSha256,c.requestedModelId,true,true,c.maxOutputTokens,c.timeoutMs,row.idempotency_key]));
  return {jobId:row.id,status:row.status,requestedRevision:row.requested_revision,snapshotSha256:row.snapshot_sha256,scriptSha256:c.scriptSha256,requestedModelId:c.requestedModelId,requestContractSha256:row.execution_contract_sha256,enqueueRequestSha256,createdAt:row.created_at,updatedAt:row.updated_at,startedAt:row.started_at,finishedAt:row.finished_at,attempt:row.attempt,externalCall:{startedAt:cp.external_call_started_at,outcome:cp.outcome},error:row.error?'AI 분석 작업을 확인하세요.':null,artifact:row.status==='succeeded'?{name:AI_PROPOSAL_NAME,sha256:cp.response_sha256}:null,productionAuthority:false as const,requiresHumanReview:true as const,cost:'unknown' as const};}

export function aiReport(projectId:string,baseRevision:number,config:AIConfig){
  const plan=getProject(projectId);requireScope(plan,projectId,baseRevision);initializeJobStorage();
  const db=openDb();try{const rows=db.prepare("SELECT * FROM visualmaker_jobs WHERE project_id=? AND kind='ai-script-analysis' ORDER BY created_at DESC,id DESC LIMIT 50").all(projectId) as JobRow[];
    const configured=aiConfiguration(config),withinLimits=plan.script.rawText.length<=AI_LIMITS.maxScriptUnits&&plan.script.segments.length>=AI_LIMITS.minSegments&&plan.script.segments.length<=AI_LIMITS.maxSegments;
    return {schemaVersion:'visualmaker-ai-analysis-readiness-v1' as const,scope:{projectId,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:sha(JSON.stringify(plan))},
      capability:{...configured,available:configured.available&&withinLimits,reason:withinLimits?configured.reason:'input-limit'},limits:AI_LIMITS,jobs:rows.map(row=>({...safeJob(db,row),stale:row.requested_revision!==plan.revision||row.snapshot_sha256!==sha(JSON.stringify(plan))})),
      productionAuthority:false as const,requiresHumanReview:true as const,cost:'unknown' as const};
  }finally{db.close();}
}
export function enqueueAIAnalysis(input:AIEnqueue,config:AIConfig){
  if(!input||typeof input!=='object'||Object.keys(input).sort().join('|')!==['projectId','baseRevision','idempotencyKey','expectedModelId','externalTransmissionConsent','billingConsent','maxOutputTokens','timeoutMs'].sort().join('|')||
    !PROJECT.test(input.projectId)||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<1||!KEY.test(input.idempotencyKey)||!isModel(input.expectedModelId)||
    input.externalTransmissionConsent!==true||input.billingConsent!==true)fail();
  initializeJobStorage();
  const priorDb=openDb();try{const prior=priorDb.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(input.projectId,input.idempotencyKey) as JobRow|undefined;
    if(prior){if(prior.kind!=='ai-script-analysis')fail('같은 요청 키가 다른 계약에 사용됐습니다.',409);
      const old=contractOf(prior),requested=sha(JSON.stringify([AI_JOB_SCHEMA,input.projectId,input.baseRevision,old.snapshotSha256,old.scriptSha256,input.expectedModelId,true,true,input.maxOutputTokens,input.timeoutMs]));
      if(prior.request_sha256!==requested)fail('같은 요청 키가 다른 계약에 사용됐습니다.',409);
      return safeJob(priorDb,prior);
    }
  }finally{priorDb.close();}
  requireConfig(config,input.expectedModelId);
  const plan=getProject(input.projectId);requireScope(plan,input.projectId,input.baseRevision);limits(plan,input.maxOutputTokens,input.timeoutMs);
  const snapshot=JSON.stringify(plan),snapshotSha256=sha(snapshot);
  const requestSha=sha(JSON.stringify([AI_JOB_SCHEMA,input.projectId,input.baseRevision,snapshotSha256,plan.script.rawSha256,input.expectedModelId,true,true,input.maxOutputTokens,input.timeoutMs]));
  const db=openDb();try{return transaction(db,()=>{
    const current=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(input.projectId) as {revision:number;document:string}|undefined;
    if(!current||current.revision!==input.baseRevision||sha(current.document)!==snapshotSha256)fail('프로젝트가 변경됐습니다.',409);
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(input.projectId,input.idempotencyKey) as JobRow|undefined;
    if(previous){if(previous.kind!=='ai-script-analysis'||previous.request_sha256!==requestSha)fail('같은 요청 키가 다른 계약에 사용됐습니다.',409);return safeJob(db,previous);}
    const id=`job_${randomUUID()}`,timestamp=now();const contract:AIContract={schemaVersion:AI_JOB_SCHEMA,jobId:id,projectId:input.projectId,revision:input.baseRevision,scriptSha256:plan.script.rawSha256,
      snapshotSha256,requestSha256:requestSha,requestedModelId:input.expectedModelId,externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs,createdAt:timestamp};
    const contractJson=JSON.stringify(contract);
    db.prepare(`INSERT INTO visualmaker_jobs(id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,execution_contract_json,execution_contract_sha256,progress,attempt,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.projectId,'ai-script-analysis','queued',input.baseRevision,snapshotSha256,snapshot,requestSha,input.idempotencyKey,contractJson,sha(contractJson),0,0,timestamp,timestamp);
    db.prepare("INSERT INTO visualmaker_ai_analysis_attempts(job_id,attempt,request_sha256,outcome) VALUES(?,1,?,'not-started')").run(id,requestSha);
    return safeJob(db,jobRow(db,id));
  });}finally{db.close();}
}

export function scopedAIJob(action:'run'|'cancel'|'recover',projectId:string,baseRevision:number,id:string){
  const plan=getProject(projectId);requireScope(plan,projectId,baseRevision);initializeJobStorage();
  const db=openDb();try{const row=jobRow(db,id);if(row.project_id!==projectId)fail('AI 분석 작업 범위가 다릅니다.',404);
    if(action==='run'&&(row.requested_revision!==baseRevision||row.snapshot_sha256!==sha(JSON.stringify(plan))))fail('AI 분석 작업에 사용한 대본이 변경됐습니다.',409);
    return safeJob(db,row);
  }finally{db.close();}
}
export function cancelAIAnalysis(projectId:string,baseRevision:number,id:string){scopedAIJob('cancel',projectId,baseRevision,id);cancelJob(id);return scopedAIJob('cancel',projectId,baseRevision,id);}
export function recoverAIAnalysis(projectId:string,baseRevision:number,id:string){scopedAIJob('recover',projectId,baseRevision,id);recoverJob(id);return scopedAIJob('recover',projectId,baseRevision,id);}

function preCallFailure(id:string,token:string,code:'configuration'|'scope'|'consent'|'internal'){
  const db=openDb();try{transaction(db,()=>{const row=jobRow(db,id),cp=checkpoint(db,id);if(row.status!=='running'||row.lease_token!==token||cp.outcome!=='not-started')return;
    const timestamp=now();db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='failed-before-call',error_code=? WHERE job_id=? AND outcome='not-started'").run(code,id);
    db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error='AI 분석 호출 전 입력을 확인할 수 없습니다.',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='failed',reason='AI 분석 호출 전 입력을 확인할 수 없습니다.' WHERE job_id=? AND attempt=1 AND outcome IS NULL").run(timestamp,id);
  });}finally{db.close();}
}
function beginCall(id:string,token:string,snapshot:Plan,config:AIConfig):AIContract{
  const db=openDb();try{return transaction(db,()=>{const row=jobRow(db,id),c=contractOf(row),cp=checkpoint(db,id),project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(row.project_id) as {revision:number;document:string}|undefined;
    if(row.status!=='running'||row.attempt!==1||row.lease_token!==token||!row.lease_expires_at||row.lease_expires_at<=now()||cp.outcome!=='not-started'||cp.request_sha256!==row.request_sha256||
      !project||project.revision!==row.requested_revision||sha(project.document)!==row.snapshot_sha256||sha(JSON.stringify(snapshot))!==row.snapshot_sha256||
      c.scriptSha256!==snapshot.script.rawSha256||!c.externalTransmissionConsent||!c.billingConsent)fail('AI 분석 입력 또는 임대가 변경됐습니다.',409);
    requireConfig(config,c.requestedModelId);limits(snapshot,c.maxOutputTokens,c.timeoutMs);
    const timestamp=now();const changed=db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at=? WHERE job_id=? AND outcome='not-started'").run(timestamp,id);
    if(changed.changes!==1)fail('AI 분석 호출 기록이 변경됐습니다.',409);
    return c;
  });}finally{db.close();}
}
function afterCallFailure(id:string,token:string,code:'timeout'|'network'|'provider'|'lease'|'cancelled'|'response'|'internal'){
  const db=openDb();try{transaction(db,()=>{const row=jobRow(db,id),cp=checkpoint(db,id);if(row.status!=='running'||row.lease_token!==token||cp.outcome!=='started')return;
    const timestamp=now();db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='needs-review',error_code=? WHERE job_id=? AND outcome='started'").run(code,id);
    db.prepare("UPDATE visualmaker_jobs SET status='needs-review',updated_at=?,finished_at=?,error='외부 AI 호출 결과를 확인해야 합니다.',recovery_reason='외부 AI 호출 결과를 확인해야 합니다.',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='needs-review',reason='외부 AI 호출 결과를 확인해야 합니다.' WHERE job_id=? AND attempt=1 AND outcome IS NULL").run(timestamp,id);
  });}finally{db.close();}
}
function proposalBytes(proposal:AnalysisProposal,c:AIContract):Buffer{
  if(proposal.schemaVersion!=='visualmaker-ai-analysis-v1'||proposal.requestId!==c.jobId||proposal.scope.projectId!==c.projectId||proposal.scope.revision!==c.revision||proposal.scope.scriptSha256!==c.scriptSha256||proposal.scope.snapshotSha256!==c.snapshotSha256||proposal.model.requestedModelId!==c.requestedModelId||proposal.productionAuthority!==false||proposal.requiresHumanReview!==true||proposal.cost!=='unknown')fail('AI 분석 결과 범위가 다릅니다.',409);
  const bytes=Buffer.from(JSON.stringify(proposal));if(bytes.length>200_000)fail('AI 분석 응답이 너무 큽니다.',413);return bytes;
}
type FileIdentity={dev:number;ino:number};
function matchesIdentity(file:string,identity:FileIdentity,isDirectory:boolean):boolean{
  try{const stat=lstatSync(file);return stat.dev===identity.dev&&stat.ino===identity.ino&&(isDirectory?stat.isDirectory():stat.isFile());}catch{return false;}
}
function cleanOwnedDirectory(directory:string,parent:string,parentIdentity:FileIdentity,dirIdentity:FileIdentity|undefined,fileIdentity:FileIdentity|undefined):void{
  if(!dirIdentity||!matchesIdentity(parent,parentIdentity,true)||!matchesIdentity(directory,dirIdentity,true))return;
  const file=path.join(directory,AI_PROPOSAL_NAME);
  if(fileIdentity&&matchesIdentity(file,fileIdentity,false))try{unlinkSync(file);}catch{}
  if(matchesIdentity(directory,dirIdentity,true))try{rmdirSync(directory);}catch{}
}
function publish(id:string,token:string,c:AIContract,proposal:AnalysisProposal,testFault?:(point:'after-file-open'|'before-artifact-insert',fd?:number)=>void):void{
  const bytes=proposalBytes(proposal,c),root=path.resolve(dataRoot(),'jobs');mkdirSync(root,{recursive:true});const rootReal=realpathSync(root);
  if(rootReal!==root)fail('AI 분석 결과 저장 경로를 확인할 수 없습니다.',409);
  const parent=path.join(root,id),attemptDir=path.join(parent,'attempt-1');mkdirSync(parent,{recursive:true});if(realpathSync(parent)!==parent||existsSync(attemptDir))fail('AI 분석 결과 저장 경로가 중복됐습니다.',409);
  const parentIdentity=lstatSync(parent),staging=path.join(parent,`pending-${randomUUID()}`),staged=path.join(staging,AI_PROPOSAL_NAME);
  let renamed=false,committed=false,stageIdentity:FileIdentity|undefined,fileIdentity:FileIdentity|undefined,fd:number|undefined;
  try{
    mkdirSync(staging);stageIdentity=lstatSync(staging);
    fd=openSync(staged,'wx');fileIdentity=fstatSync(fd);
    testFault?.('after-file-open',fd);
    writeFileSync(fd,bytes);closeSync(fd);fd=undefined;
    const db=openDb();try{transaction(db,()=>{const row=jobRow(db,id),cp=checkpoint(db,id),project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(c.projectId) as {revision:number;document:string}|undefined;
      if(row.status!=='running'||row.attempt!==1||row.lease_token!==token||!row.lease_expires_at||row.lease_expires_at<=now()||cp.outcome!=='started'||
        row.execution_contract_sha256!==sha(JSON.stringify(c))||!project||project.revision!==c.revision||sha(project.document)!==c.snapshotSha256||
        realpathSync(staging)!==staging||sha(readFileSync(staged))!==sha(bytes))fail('AI 분석 게시 권한이 만료됐습니다.',409);
      renameSync(staging,attemptDir);renamed=true;
      testFault?.('before-artifact-insert');
      db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,AI_PROPOSAL_NAME,`jobs/${id}/attempt-1/${AI_PROPOSAL_NAME}`,bytes.length,sha(bytes));
      db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='succeeded',response_sha256=? WHERE job_id=? AND outcome='started'").run(sha(bytes),id);
      const timestamp=now();db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=1 AND outcome IS NULL").run(timestamp,id);
    });committed=true;}finally{db.close();}
  }finally{
    if(fd!==undefined)try{closeSync(fd);}catch{}
    if(renamed&&!committed)cleanOwnedDirectory(attemptDir,parent,parentIdentity,stageIdentity,fileIdentity);
    else cleanOwnedDirectory(staging,parent,parentIdentity,stageIdentity,fileIdentity);
  }
}

/** Programmatic test adapter is never selected by HTTP, CLI or environment. */
export async function executeAIAnalysisClaim(id:string,token:string,snapshot:Plan,config:AIConfig,testAdapter?:AnalysisAdapter,testFault?:(point:'after-file-open'|'before-artifact-insert',fd?:number)=>void):Promise<Job>{
  let started=false;const controller=new AbortController();let interval:ReturnType<typeof setInterval>|undefined;
  try{
    const initial=getJob(id);if(initial.kind!=='ai-script-analysis'||initial.status!=='running'||initial.attempt!==1)fail('AI 분석 임대를 확인할 수 없습니다.',409);
    const db=openDb();let c:AIContract;try{c=contractOf(jobRow(db,id));}finally{db.close();}
    const adapter=testAdapter??createCodexAnalysisAdapter(resolveCodexCli(config.cliPath)??'',configuredModel(config)??'');
    if(testAdapter&&(testAdapter.kind!=='sdk-test'||testAdapter.modelId!==c.requestedModelId))fail('AI 분석 테스트 모델이 요청과 다릅니다.',409);
    c=beginCall(id,token,snapshot,config);started=true;
    interval=setInterval(()=>{try{const job=getJob(id);if(job.status!=='running'||job.attempt!==1)controller.abort();}catch{controller.abort();}},100);
    interval.unref?.();
    const proposal=await analyzePlan({plan:snapshot,projectId:c.projectId,revision:c.revision,scriptSha256:c.scriptSha256,snapshotSha256:c.snapshotSha256,requestId:c.jobId,
      expectedModelId:c.requestedModelId,externalTransmissionConsent:true,maxOutputTokens:c.maxOutputTokens,timeoutMs:c.timeoutMs,abortSignal:controller.signal},adapter);
    if(controller.signal.aborted)throw new AnalysisError('cancelled');publish(id,token,c,proposal,testFault);
  }catch(error){
    if(started)afterCallFailure(id,token,error instanceof AnalysisError?error.code==='timeout'?'timeout':error.code==='cancelled'?'cancelled':error.code==='invalid-output'?'response':'provider':'internal');
    else preCallFailure(id,token,'configuration');
  }finally{if(interval)clearInterval(interval);}
  return getJob(id);
}

export function readAIProposalWithDb(db:Db,plan:Plan,projectId:string,baseRevision:number,id:string):{job:ReturnType<typeof safeJob>;proposal:AnalysisProposal}{
  requireScope(plan,projectId,baseRevision);
  try{const row=jobRow(db,id),c=contractOf(row),cp=checkpoint(db,id);
    if(row.project_id!==projectId||row.requested_revision!==baseRevision||row.snapshot_sha256!==sha(JSON.stringify(plan))||row.status!=='succeeded'||cp.outcome!=='succeeded'||!cp.response_sha256)fail('현재 대본의 AI 분석 결과가 아닙니다.',409);
    const record=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=?').all(id) as Array<{name:string;path:string;bytes:number;sha256:string}>;
    if(record.length!==1||record[0].name!==AI_PROPOSAL_NAME||record[0].path!==`jobs/${id}/attempt-1/${AI_PROPOSAL_NAME}`||record[0].sha256!==cp.response_sha256||record[0].bytes<1||record[0].bytes>200_000)fail('AI 분석 결과 파일 기록이 올바르지 않습니다.',409);
    const root=realpathSync(dataRoot()),file=path.resolve(root,record[0].path);if(!file.startsWith(root+path.sep)||!lstatSync(file).isFile()||realpathSync(file)!==file)fail('AI 분석 결과 파일을 확인할 수 없습니다.',409);
    let fd:number|undefined,bytes:Buffer;
    try{fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const stat=fstatSync(fd),named=lstatSync(file);
      if(!stat.isFile()||stat.dev!==named.dev||stat.ino!==named.ino||stat.size!==record[0].bytes||stat.size>200_000||stat.size<1||realpathSync(file)!==file)fail('AI 분석 결과 파일이 변경됐습니다.',409);
      bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,offset);if(count<1)fail('AI 분석 결과 파일이 변경됐습니다.',409);offset+=count;}
      if(fstatSync(fd).size!==stat.size||sha(bytes)!==record[0].sha256)fail('AI 분석 결과 파일이 변경됐습니다.',409);
    }finally{if(fd!==undefined)closeSync(fd);}
    let proposal:AnalysisProposal;try{proposal=JSON.parse(bytes.toString('utf8')) as AnalysisProposal;}catch{fail('AI 분석 결과를 읽을 수 없습니다.',409);}
    const expectedKeys=['schemaVersion','requestId','scope','model','usage','cost','productionAuthority','requiresHumanReview','records'];
    if(!proposal||typeof proposal!=='object'||Object.keys(proposal).sort().join('|')!==expectedKeys.sort().join('|')||!proposal.scope||Object.keys(proposal.scope).sort().join('|')!==['projectId','revision','scriptSha256','snapshotSha256'].sort().join('|')||
      !proposal.model||Object.keys(proposal.model).sort().join('|')!==['adapter','requestedModelId','responseModelId'].sort().join('|')||
      !proposal.usage||Object.keys(proposal.usage).sort().join('|')!==['inputTokens','outputTokens'].sort().join('|')||
      proposal.schemaVersion!=='visualmaker-ai-analysis-v1'||proposal.requestId!==id||proposal.scope.projectId!==projectId||proposal.scope.revision!==baseRevision||proposal.scope.scriptSha256!==c.scriptSha256||proposal.scope.snapshotSha256!==c.snapshotSha256||
      !['gateway-api-key','sdk-test','codex-cli'].includes(proposal.model.adapter)||proposal.model.requestedModelId!==c.requestedModelId||
      !(proposal.model.responseModelId===null||isModel(proposal.model.responseModelId))||
      ![proposal.usage.inputTokens,proposal.usage.outputTokens].every(value=>value===null||Number.isSafeInteger(value)&&value>=0)||
      proposal.cost!=='unknown'||proposal.productionAuthority!==false||proposal.requiresHumanReview!==true||
      !Array.isArray(proposal.records)||proposal.records.length!==plan.script.segments.length)fail('AI 분석 결과 계약이 올바르지 않습니다.',409);
    for(let i=0;i<proposal.records.length;i++){
      const record=proposal.records[i],source=plan.script.segments[i];
      if(!record||typeof record!=='object'||Object.keys(record).sort().join('|')!==['segmentId','mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn','source'].sort().join('|')||
        record.segmentId!==source.id||!record.source||Object.keys(record.source).sort().join('|')!==['start','end','text','kind'].sort().join('|')||
        record.source.start!==source.start||record.source.end!==source.end||record.source.text!==source.text||record.source.kind!==source.kind||
        ['mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn'].some(key=>typeof record[key as keyof typeof record]!=='string'||String(record[key as keyof typeof record]).length<1||String(record[key as keyof typeof record]).length>600||String(record[key as keyof typeof record]).trim()!==record[key as keyof typeof record]))fail('AI 분석 구간 결과가 올바르지 않습니다.',409);
    }
    return {job:safeJob(db,row),proposal};
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('AI 분석 결과를 확인할 수 없습니다.',409);}
}
export function readAIProposal(projectId:string,baseRevision:number,id:string):{job:ReturnType<typeof safeJob>;proposal:AnalysisProposal}{
  const plan=getProject(projectId);initializeJobStorage();const db=openDb();try{return readAIProposalWithDb(db,plan,projectId,baseRevision,id);}finally{db.close();}
}
