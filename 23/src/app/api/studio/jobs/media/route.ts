import {guard,failure} from '../../../../../../visualmaker/core/http.ts';
import {artifactFile,getJob} from '../../../../../../visualmaker/core/jobs.ts';
import {StoreError} from '../../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const id=new URL(request.url).searchParams.get('jobId')||'';
    const job=getJob(id);
    if(job.kind!=='renderer-diagnostic'||job.status!=='succeeded')throw new StoreError('완료된 렌더 엔진 진단 영상만 재생할 수 있습니다.',409);
    const {bytes}=artifactFile(id,'diagnostic.mp4');
    if(bytes.length>40_000_000)throw new StoreError('진단 영상 크기가 허용 범위를 넘었습니다.',409);
    const headers={'Content-Type':'video/mp4','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,'X-Visualmaker-Attempt':String(job.attempt)};
    const range=request.headers.get('range');
    if(!range)return new Response(bytes,{headers});
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(!match)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});
    const start=Number(match[1]);const end=match[2]?Number(match[2]):Math.min(start+1024*1024-1,bytes.length-1);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=bytes.length||end>=bytes.length||end-start+1>1024*1024)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});
    return new Response(bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});
  }catch(error){return failure(error);}
}
