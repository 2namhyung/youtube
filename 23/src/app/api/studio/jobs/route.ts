import {guard, readJson, failure} from '../../../../../visualmaker/core/http';
import {cancelJob, enqueueJob, getJob, listJobs, recoverJob, retryJob, runJob} from '../../../../../visualmaker/core/jobs';
import {StoreError} from '../../../../../visualmaker/core/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    const id=query.get('jobId');
    if(id)return Response.json({job:getJob(id)});
    const projectId=query.get('projectId');
    if(!projectId)throw new StoreError('프로젝트 ID가 필요합니다.');
    return Response.json({jobs:listJobs(projectId)});
  }catch(error){return failure(error);}
}

export async function POST(request:Request){
  try{
    guard(request);const body=await readJson(request,4096);
    if(body.action==='enqueue'){
      const job=enqueueJob(String(body.projectId||''),Number(body.baseRevision),body.kind as 'planning-package'|'render-preview',String(body.idempotencyKey||''));
      return Response.json({job},{status:job.status==='blocked'?200:201});
    }
    const id=String(body.jobId||'');
    const job=body.action==='run'?runJob(id):body.action==='cancel'?cancelJob(id):body.action==='retry'?retryJob(id):body.action==='recover'?recoverJob(id):null;
    if(!job)throw new StoreError('지원하지 않는 작업 요청입니다.');
    return Response.json({job});
  }catch(error){return failure(error);}
}
