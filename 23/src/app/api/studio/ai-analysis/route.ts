import {guard,readJson} from '../../../../../visualmaker/core/http.ts';
import {aiReport,cancelAIAnalysis,enqueueAIAnalysis,readAIProposal,recoverAIAnalysis,scopedAIJob} from '../../../../../visualmaker/core/ai-analysis-job.ts';
import {dispatchJob} from '../../../../../visualmaker/core/dispatch.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const PROJECT=/^plan-[a-f0-9-]{36}$/u,JOB=/^job_[a-f0-9-]{36}$/u,REVISION=/^[1-9]\d*$/u;
const config=()=>({enabled:process.env.VISUALMAKER_AI_ENABLED,cliPath:process.env.VISUALMAKER_CODEX_CLI_PATH,modelId:process.env.VISUALMAKER_AI_MODEL});
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(error:unknown){const status=error instanceof StoreError&&[400,403,404,409,413,503].includes(error.status)?error.status:500;return reply({error:'AI 분석 요청을 완료하지 못했습니다. 입력과 작업 상태를 확인하세요.'},status);}
function exact(value:Record<string,unknown>,fields:string[]){if(Object.keys(value).sort().join('|')!==fields.sort().join('|'))throw new StoreError('AI 분석 요청 필드가 올바르지 않습니다.');}
function scope(projectId:unknown,revision:unknown){if(typeof projectId!=='string'||!PROJECT.test(projectId)||!Number.isSafeInteger(revision)||Number(revision)<1)throw new StoreError('프로젝트 범위가 올바르지 않습니다.');return {projectId,baseRevision:revision as number};}
function queryScope(query:URLSearchParams){const projectId=query.get('projectId'),revision=query.get('baseRevision');if(!PROJECT.test(projectId??'')||!REVISION.test(revision??'')||!Number.isSafeInteger(Number(revision)))throw new StoreError('프로젝트 범위가 올바르지 않습니다.');return {projectId:projectId!,baseRevision:Number(revision)};}
export async function GET(request:Request){try{
  guard(request);const query=new URL(request.url).searchParams,keys=[...query.keys()];
  if(new Set(keys).size!==keys.length||keys.some(key=>!['projectId','baseRevision','jobId','format'].includes(key)))throw new StoreError('AI 분석 조회 범위가 올바르지 않습니다.');
  const {projectId,baseRevision}=queryScope(query),jobId=query.get('jobId'),format=query.get('format');
  if(jobId!==null||format!==null){if(!jobId||!JOB.test(jobId)||format!=='proposal')throw new StoreError('AI 분석 결과 조회 범위가 올바르지 않습니다.');
    return reply(readAIProposal(projectId,baseRevision,jobId));}
  return reply({report:aiReport(projectId,baseRevision,config())});
}catch(error){return fail(error);}}

export async function POST(request:Request){try{
  guard(request);const query=new URL(request.url).searchParams;if([...query.keys()].length)throw new StoreError('AI 분석 명령에는 조회 옵션을 사용할 수 없습니다.');
  const body=await readJson(request,4096);if(typeof body.action!=='string')throw new StoreError('AI 분석 명령이 올바르지 않습니다.');
  if(body.action==='enqueue'){
    exact(body,['action','projectId','baseRevision','idempotencyKey','expectedModelId','externalTransmissionConsent','billingConsent','maxOutputTokens','timeoutMs']);
    const bound=scope(body.projectId,body.baseRevision);
    if(typeof body.idempotencyKey!=='string'||typeof body.expectedModelId!=='string'||body.externalTransmissionConsent!==true||body.billingConsent!==true||
      !Number.isSafeInteger(body.maxOutputTokens)||!Number.isSafeInteger(body.timeoutMs))throw new StoreError('AI 분석 요청 값이 올바르지 않습니다.');
    const job=enqueueAIAnalysis({...bound,idempotencyKey:body.idempotencyKey,expectedModelId:body.expectedModelId,externalTransmissionConsent:true,billingConsent:true,maxOutputTokens:body.maxOutputTokens as number,timeoutMs:body.timeoutMs as number},config());
    return reply({job},201);
  }
  if(!['run','cancel','recover'].includes(body.action))throw new StoreError('지원하지 않는 AI 분석 명령입니다.');
  exact(body,['action','projectId','baseRevision','jobId']);const bound=scope(body.projectId,body.baseRevision);
  if(typeof body.jobId!=='string'||!JOB.test(body.jobId))throw new StoreError('AI 분석 작업 ID가 올바르지 않습니다.');
  if(body.action==='run'){scopedAIJob('run',bound.projectId,bound.baseRevision,body.jobId);await dispatchJob(body.jobId);return reply({job:scopedAIJob('run',bound.projectId,bound.baseRevision,body.jobId)},202);}
  const job=body.action==='cancel'?cancelAIAnalysis(bound.projectId,bound.baseRevision,body.jobId):recoverAIAnalysis(bound.projectId,bound.baseRevision,body.jobId);
  return reply({job});
}catch(error){return fail(error);}}
