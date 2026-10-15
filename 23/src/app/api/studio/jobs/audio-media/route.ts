import {closeSync} from 'node:fs';
import {guard,failure} from '../../../../../../visualmaker/core/http.ts';
import {audioAssemblyArtifactFile} from '../../../../../../visualmaker/core/jobs.ts';
import {StoreError} from '../../../../../../visualmaker/core/store.ts';
import {episodeByteRange,videoStream} from '../episode-media/route.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  let verifiedFd:number|undefined;try{
    guard(request);const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['jobId','projectId','baseRevision','attempt','name'].includes(key)))throw new StoreError('오디오 영상 요청 범위가 올바르지 않습니다.');
    const scope={projectId:params.get('projectId')||'',baseRevision:Number(params.get('baseRevision')),attempt:Number(params.get('attempt'))};
    if(!/^plan-[a-f0-9-]{36}$/u.test(scope.projectId)||!Number.isSafeInteger(scope.baseRevision)||scope.baseRevision<1||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('오디오 영상 요청 범위가 올바르지 않습니다.');
    const name=params.get('name')||'provisional-voiced-episode.mp4';
    if(name!=='provisional-voiced-episode.mp4'&&name!=='provisional-voiced-episode.json')throw new StoreError('오디오 영상 파일 이름이 올바르지 않습니다.');
    const {job,mp4,receiptBytes}=await audioAssemblyArtifactFile(params.get('jobId')||'',scope);verifiedFd=mp4.fd;
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,'X-Visualmaker-Attempt':String(job.attempt),'X-Visualmaker-Revision':String(job.requestedRevision),'X-Visualmaker-Production-Authority':'false'};
    if(name==='provisional-voiced-episode.json')return new Response(receiptBytes,{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="provisional-voiced-episode.json"'}});
    const videoHeaders={...headers,'Content-Type':'video/mp4','Accept-Ranges':'bytes'};
    const requested=request.headers.get('range');if(!requested){const body=videoStream(verifiedFd,mp4.identity,0,mp4.bytes-1);verifiedFd=undefined;return new Response(body,{headers:{...videoHeaders,'Content-Length':String(mp4.bytes)}});}
    const range=episodeByteRange(requested,mp4.bytes);if(!range)return new Response(null,{status:416,headers:{...videoHeaders,'Content-Range':`bytes */${mp4.bytes}`}});
    const body=videoStream(verifiedFd,mp4.identity,range.start,range.end);verifiedFd=undefined;
    return new Response(body,{status:206,headers:{...videoHeaders,'Content-Range':`bytes ${range.start}-${range.end}/${mp4.bytes}`,'Content-Length':String(range.end-range.start+1)}});
  }catch(error){return failure(error);}finally{if(verifiedFd!==undefined)closeSync(verifiedFd);}
}
