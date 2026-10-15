import {guard,failure} from '../../../../../../visualmaker/core/http.ts';
import {canonicalArtifactFile} from '../../../../../../visualmaker/core/jobs.ts';
import {StoreError} from '../../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export function canonicalByteRange(range:string,size:number):{start:number;end:number}|null{
  const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return null;
  const start=Number(match[1]);const end=match[2]?Number(match[2]):Math.min(start+1024*1024-1,size-1);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size||end>=size||end-start+1>1024*1024)return null;
  return {start,end};
}

export async function GET(request:Request){
  try{
    guard(request);const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['jobId','projectId','sceneId','attempt'].includes(key)))throw new StoreError('컷 영상 요청 범위가 올바르지 않습니다.');
    const id=params.get('jobId')||'';const scope={projectId:params.get('projectId')||'',sceneId:params.get('sceneId')||'',attempt:Number(params.get('attempt'))};
    const {job,bytes}=await canonicalArtifactFile(id,'provisional-cut.mp4',scope);
    if(!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('시도 번호가 올바르지 않습니다.');
    const headers={'Content-Type':'video/mp4','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,'X-Visualmaker-Scene-Id':scope.sceneId,'X-Visualmaker-Attempt':String(job.attempt)};
    const range=request.headers.get('range');if(!range)return new Response(bytes,{headers});
    const parsed=canonicalByteRange(range,bytes.length);if(!parsed)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});
    const {start,end}=parsed;
    return new Response(bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});
  }catch(error){return failure(error);}
}
