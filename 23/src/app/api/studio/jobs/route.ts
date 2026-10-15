import {guard, readJson, failure} from '../../../../../visualmaker/core/http.ts';
import {audioAssemblyJobContract,cancelJob, canonicalJobContract, episodeJobContract, enqueueJob, enqueueCanonicalJob, enqueueEpisodeJob, enqueueAudioAssemblyJob, enqueueFinalizationJob, getJob, listJobs, recoverJob, retryJob} from '../../../../../visualmaker/core/jobs.ts';
import {evaluateFinalization} from '../../../../../visualmaker/core/finalization.ts';
import {dispatchJob} from '../../../../../visualmaker/core/dispatch.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    const id=query.get('jobId');
    if(id){const job=getJob(id);if(job.kind==='ai-script-analysis')throw new StoreError('AI 분석 작업은 전용 화면에서 확인하세요.',404);return Response.json({job});}
    const projectId=query.get('projectId');
    if(!projectId)throw new StoreError('프로젝트 ID가 필요합니다.');
    return Response.json({jobs:listJobs(projectId).filter(job=>job.kind!=='ai-script-analysis')});
  }catch(error){return failure(error);}
}

export async function POST(request:Request){
  let finalizationCommand=false;
  try{
    guard(request);const body=await readJson(request,4096);
    if(body.kind==='ai-script-analysis')throw new StoreError('AI 분석은 전용 요청 경로를 사용하세요.',400);
    if(body.action==='enqueue'){
      if(body.kind==='canonical-cut-preview'){
        if(Object.keys(body).some(key=>!['action','projectId','baseRevision','sceneId','kind','idempotencyKey'].includes(key)))throw new StoreError('정식 컷 렌더는 사용자 지정 렌더 옵션을 받지 않습니다.');
        const job=await enqueueCanonicalJob(String(body.projectId||''),Number(body.baseRevision),String(body.sceneId||''),String(body.idempotencyKey||''));
        return Response.json({job,executionContract:canonicalJobContract(job.id)},{status:job.status==='blocked'?200:201,headers:{'Cache-Control':'no-store'}});
      }
      if(body.kind==='episode-provisional-video'){
        if(Object.keys(body).some(key=>!['action','projectId','baseRevision','kind','idempotencyKey'].includes(key)))throw new StoreError('전체 임시 영상 렌더는 사용자 지정 렌더 옵션을 받지 않습니다.');
        const job=await enqueueEpisodeJob(String(body.projectId||''),Number(body.baseRevision),String(body.idempotencyKey||''));
        return Response.json({job,executionContract:episodeJobContract(job.id)},{status:job.status==='blocked'?200:201,headers:{'Cache-Control':'no-store'}});
      }
      if(body.kind==='audio-timed-assembly'){
        if(Object.keys(body).some(key=>!['action','projectId','baseRevision','kind','idempotencyKey'].includes(key)))throw new StoreError('오디오 조립은 사용자 지정 파일·렌더 옵션을 받지 않습니다.');
        const job=await enqueueAudioAssemblyJob(String(body.projectId||''),Number(body.baseRevision),String(body.idempotencyKey||''));
        return Response.json({job,executionContract:audioAssemblyJobContract(job.id)},{status:job.status==='blocked'?200:201,headers:{'Cache-Control':'no-store'}});
      }
      if(body.kind==='episode-finalization-export'){
        if(Object.keys(body).some(key=>!['action','projectId','baseRevision','kind','idempotencyKey'].includes(key)))throw new StoreError('최종화는 사용자 지정 파일·승인·렌더 옵션을 받지 않습니다.');
        try{const job=await enqueueFinalizationJob(String(body.projectId||''),Number(body.baseRevision),String(body.idempotencyKey||''));
          const report=await evaluateFinalization(job.projectId,job.requestedRevision);
          const readiness={schemaVersion:report.schemaVersion,scope:report.scope,composition:report.composition,validators:report.validators,blockers:report.blockers.map(blocker=>({code:blocker.code,detail:'제작 입력 또는 승인을 확인하세요.'})),renderEligible:report.renderEligible,productionAuthority:false,reviewApproved:false};
          return Response.json({job,readiness},{status:job.status==='blocked'?200:201,headers:{'Cache-Control':'no-store'}});
        }catch(error){throw new StoreError('최종화 요청을 완료하지 못했습니다.',error instanceof StoreError?error.status:409);}
      }
      if(body.kind==='renderer-diagnostic'&&Object.keys(body).some(key=>!['action','projectId','baseRevision','kind','idempotencyKey'].includes(key)))throw new StoreError('렌더 진단은 사용자 지정 옵션을 받지 않습니다.');
      const job=enqueueJob(String(body.projectId||''),Number(body.baseRevision),body.kind as 'planning-package'|'render-preview'|'renderer-diagnostic',String(body.idempotencyKey||''));
      return Response.json({job},{status:job.status==='blocked'?200:201});
    }
    const id=String(body.jobId||'');
    if(id&&['run','cancel','retry','recover'].includes(String(body.action))&&getJob(id).kind==='ai-script-analysis')throw new StoreError('AI 분석 작업은 전용 요청 경로를 사용하세요.',404);
    if(['run','cancel','retry','recover'].includes(String(body.action))){
      finalizationCommand=getJob(id).kind==='episode-finalization-export';
      if(finalizationCommand&&Object.keys(body).some(key=>!['action','jobId'].includes(key)))throw new StoreError('최종화 작업 명령은 추가 옵션을 받지 않습니다.');
    }
    if(body.action==='run'){
      await dispatchJob(id);
      return Response.json({job:getJob(id)},{status:202});
    }
    const job=body.action==='cancel'?cancelJob(id):body.action==='retry'?retryJob(id):body.action==='recover'?recoverJob(id):null;
    if(!job)throw new StoreError('지원하지 않는 작업 요청입니다.');
    return Response.json({job});
  }catch(error){return failure(finalizationCommand?new StoreError('최종화 작업 명령을 완료하지 못했습니다.',error instanceof StoreError?error.status:409):error);}
}
