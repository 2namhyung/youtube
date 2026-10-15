import {closeSync,fstatSync,readSync} from 'node:fs';
import {guard,failure} from '../../../../../../visualmaker/core/http.ts';
import {episodeArtifactFile} from '../../../../../../visualmaker/core/jobs.ts';
import {StoreError} from '../../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export function episodeByteRange(range:string,size:number):{start:number;end:number}|null{
  const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return null;
  const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size||end>=size)return null;
  return {start,end};
}
export function videoStream(fd:number,identity:{size:number;mtimeMs:number;ino:number},start:number,end:number):ReadableStream<Uint8Array>{
  const assertIdentity=()=>{const current=fstatSync(fd);if(current.size!==identity.size||current.mtimeMs!==identity.mtimeMs||current.ino!==identity.ino)throw new StoreError('전체 영상 파일이 재생 중 변경됐습니다.',409);};
  assertIdentity();
  let position=start,closed=false;const close=()=>{if(!closed){closed=true;closeSync(fd);}};
  return new ReadableStream<Uint8Array>({pull(controller){
    try{assertIdentity();if(position>end){close();controller.close();return;}const count=Math.min(256*1024,end-position+1),chunk=Buffer.allocUnsafe(count);const used=readSync(fd,chunk,0,count,position);
      if(used!==count)throw new StoreError('전체 영상 파일이 재생 중 변경됐습니다.',409);position+=used;controller.enqueue(chunk);
      assertIdentity();if(position>end){close();controller.close();}
    }catch(error){close();controller.error(error);}
  },cancel(){close();}});
}
export async function GET(request:Request){
  let verifiedFd:number|undefined;try{
    guard(request);const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['jobId','projectId','baseRevision','attempt','name'].includes(key)))throw new StoreError('전체 영상 요청 범위가 올바르지 않습니다.');
    const scope={projectId:params.get('projectId')||'',baseRevision:Number(params.get('baseRevision')),attempt:Number(params.get('attempt'))};
    if(!/^plan-[a-f0-9-]{36}$/.test(scope.projectId)||!Number.isSafeInteger(scope.baseRevision)||scope.baseRevision<1||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('전체 영상 요청 범위가 올바르지 않습니다.');
    const name=params.get('name')||'provisional-episode.mp4';
    if(name!=='provisional-episode.mp4'&&name!=='provisional-episode.json')throw new StoreError('전체 영상 파일 이름이 올바르지 않습니다.');
    const {job,mp4,receiptBytes}=await episodeArtifactFile(params.get('jobId')||'',scope);verifiedFd=mp4.fd;
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,'X-Visualmaker-Attempt':String(job.attempt),'X-Visualmaker-Revision':String(job.requestedRevision)};
    if(name==='provisional-episode.json')return new Response(receiptBytes,{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="provisional-episode.json"'}});
    const videoHeaders={...headers,'Content-Type':'video/mp4','Accept-Ranges':'bytes'};
    const requested=request.headers.get('range');if(!requested){const body=videoStream(verifiedFd,mp4.identity,0,mp4.bytes-1);const response=new Response(body,{headers:{...videoHeaders,'Content-Length':String(mp4.bytes)}});verifiedFd=undefined;return response;}
    const range=episodeByteRange(requested,mp4.bytes);if(!range)return new Response(null,{status:416,headers:{...videoHeaders,'Content-Range':`bytes */${mp4.bytes}`}});
    const length=range.end-range.start+1;
    const body=videoStream(verifiedFd,mp4.identity,range.start,range.end);
    const response=new Response(body,{status:206,headers:{...videoHeaders,'Content-Range':`bytes ${range.start}-${range.end}/${mp4.bytes}`,'Content-Length':String(length)}});verifiedFd=undefined;return response;
  }catch(error){return failure(error);}finally{if(verifiedFd!==undefined)closeSync(verifiedFd);}
}
