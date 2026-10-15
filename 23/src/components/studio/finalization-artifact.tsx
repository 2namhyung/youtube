'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {FinalizationJobReceipt} from '../../../visualmaker/renderer/finalization-contract.ts';
import {currentFinalizationReceipt,fetchFinalizationSidecar,finalizationResponseScope} from './finalization-client.ts';
import type {FinalizationName} from './finalization-client.ts';
import {MAX_EPISODE_BROWSER_BYTES,streamEpisodeToPrivateFile} from './episode-opfs.ts';
import type {EpisodeStorage} from './episode-opfs.ts';

const LIMITS:Record<Exclude<FinalizationName,'export.mp4'>,number>={
  'export.srt':5_000_000,'export.vtt':5_000_000,'export.png':200_000_000,'export.json':5_000_000
};
const SIDE_FILES=['export.srt','export.vtt','export.png','export.json'] as const;

export default function FinalizationArtifact({plan,job,sourceJobs,token,isCurrent}:{plan:Plan;job:Job;sourceJobs:Job[];token:string;isCurrent:(job:Job)=>boolean}){
  const [receipt,setReceipt]=useState<FinalizationJobReceipt|null>(null);
  const [error,setError]=useState(''),[busyName,setBusyName]=useState<FinalizationName|null>(null),[videoUrl,setVideoUrl]=useState<string|null>(null);
  const saveRef=useRef<AbortController|null>(null),activeRef=useRef<{url:string;cleanup:()=>Promise<void>}|null>(null);
  const storage=typeof navigator==='undefined'?undefined:(navigator.storage as StorageManager&EpisodeStorage);
  const supported=!!storage&&typeof storage.getDirectory==='function'&&typeof storage.estimate==='function';
  const projectId=plan.id,revision=plan.revision,scriptSha256=plan.script.rawSha256,jobId=job.id,attempt=job.attempt;
  const query=new URLSearchParams({jobId,projectId,baseRevision:String(revision),attempt:String(attempt)});
  const endpoint=(name:FinalizationName)=>`/api/studio/jobs/export-media?${query}&name=${name}`;
  async function clearActive(){const active=activeRef.current;activeRef.current=null;
    if(active){URL.revokeObjectURL(active.url);await active.cleanup();}}
  useEffect(()=>{
    const controller=new AbortController();let live=true;setReceipt(null);setError('');setVideoUrl(null);
    void(async()=>{try{
      if(!isCurrent(job))throw new Error('현재 최종 내보내기 작업이 아닙니다.');
      const bytes=await fetchFinalizationSidecar({name:'export.json',job,token,signal:controller.signal});
      let sources=sourceJobs;
      const sourceId=(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as FinalizationJobReceipt)?.source?.jobId;
      if(typeof sourceId==='string'&&!sourceJobs.some(item=>item.id===sourceId)){
        const sourceResponse=await fetch(`/api/studio/jobs?${new URLSearchParams({jobId:sourceId})}`,
          {headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
        if(!sourceResponse.ok)throw new Error('원본 오디오 작업을 확인하지 못했습니다.');
        const sourceValue=await sourceResponse.json() as {job?:Job};
        if(!sourceValue.job||sourceValue.job.id!==sourceId)throw new Error('원본 오디오 작업 범위가 다릅니다.');
        sources=[sourceValue.job];
      }
      const parsed=await currentFinalizationReceipt(bytes,job,plan,sources);
      if(!parsed||!isCurrent(job))throw new Error('최종 내보내기 기록의 작업·원본·파일 결속이 다릅니다.');
      if(live&&!controller.signal.aborted)setReceipt(parsed);
    }catch(reason){if(live&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'최종 내보내기 결과를 확인하지 못했습니다.');controller.abort();}})();
    return()=>{live=false;controller.abort();saveRef.current?.abort();void clearActive().catch(()=>{});};
  // Polling creates equivalent job arrays. This effect is bound to immutable scope values only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,revision,scriptSha256,jobId,attempt,token,isCurrent]);

  async function saveVideo(){
    if(!receipt||!supported||!storage||busyName||saveRef.current||!isCurrent(job))return;
    const record=job.artifacts.find(item=>item.name==='export.mp4');
    if(!record||record.bytes>MAX_EPISODE_BROWSER_BYTES){setError('브라우저 임시 저장은 최대 2GB까지 지원합니다.');return;}
    const controller=new AbortController();saveRef.current=controller;setBusyName('export.mp4');setError('');setVideoUrl(null);
    try{
      await clearActive();if(controller.signal.aborted||!isCurrent(job))throw new Error('현재 작업이 변경됐습니다.');
      const response=await fetch(endpoint('export.mp4'),{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!finalizationResponseScope(response,job,'export.mp4')||response.headers.get('accept-ranges')!=='bytes'||
        Number(response.headers.get('content-length'))!==record.bytes)throw new Error('최종 영상의 범위와 크기가 다릅니다.');
      const saved=await streamEpisodeToPrivateFile({response,expectedBytes:record.bytes,storage,id:crypto.randomUUID(),
        signal:controller.signal,current:()=>isCurrent(job)});
      if(controller.signal.aborted||!isCurrent(job)){await saved.cleanup();throw new Error('현재 작업이 변경됐습니다.');}
      let url:string;try{url=URL.createObjectURL(saved.file);}catch(reason){await saved.cleanup();throw reason;}
      activeRef.current={url,cleanup:saved.cleanup};setVideoUrl(url);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'최종 영상을 저장하지 못했습니다.');controller.abort();}
    finally{if(saveRef.current===controller){saveRef.current=null;setBusyName(null);}}
  }

  async function saveSideFile(name:typeof SIDE_FILES[number]){
    if(!receipt||busyName||saveRef.current||!isCurrent(job))return;
    const record=job.artifacts.find(item=>item.name===name);if(!record)return;
    const controller=new AbortController();saveRef.current=controller;setBusyName(name);setError('');
    try{
      const bytes=await fetchFinalizationSidecar({name,job,token,signal:controller.signal});
      if(controller.signal.aborted||!isCurrent(job))return;
      const mime=name==='export.png'?'image/png':name==='export.json'?'application/json':name==='export.vtt'?'text/vtt':'application/x-subrip';
      const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:mime}));
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`visualmaker-episode-001-r${revision}-${name}`;anchor.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'최종 내보내기 파일을 받지 못했습니다.');controller.abort();}
    finally{if(saveRef.current===controller){saveRef.current=null;setBusyName(null);}}
  }
  const video=job.artifacts.find(item=>item.name==='export.mp4');
  const visibleSource=receipt?sourceJobs.find(item=>item.id===receipt.source.jobId):undefined;
  const sourceCurrent=!visibleSource||visibleSource.kind==='audio-timed-assembly'&&visibleSource.status==='succeeded'&&
    visibleSource.attempt===receipt?.source.attempt&&
    visibleSource.artifacts.find(item=>item.name==='provisional-voiced-episode.mp4')?.sha256===receipt?.source.artifactSha256&&
    visibleSource.artifacts.find(item=>item.name==='provisional-voiced-episode.json')?.sha256===receipt?.source.receiptSha256;
  const downloadable=isCurrent(job)&&sourceCurrent;
  const mixDescription=receipt?.schemaVersion==='visualmaker-finalization-job-receipt-v2'?
    '고정 게인 음악·효과음 믹스 · 기술 검증 기록':'원본 음성 통과 · 기술 검증 기록';
  return <div className="vm-diagnostic-playback" aria-label="최종 내보내기 기술 산출물">
    {error?<p role="alert">{error}</p>:null}
    {receipt?<><p>EP001 최종 내보내기 기술 산출물 · {String((receipt.technical.measured as Record<string,unknown>).frames)}프레임 · 자막 2종 · 썸네일</p>
      <p>{mixDescription}</p>
      <p>작업 시도 {job.attempt}회 · 기록과 다섯 파일의 SHA-256 결속 확인 · 제작 승인 전</p>
      {!sourceCurrent?<p role="alert">원본 오디오 작업이 변경됐습니다. 현재 산출물을 다시 확인하세요.</p>:null}
      {supported?<button type="button" disabled={!!busyName||!downloadable||!video||video.bytes>MAX_EPISODE_BROWSER_BYTES} onClick={()=>void saveVideo()}>{busyName==='export.mp4'?'브라우저 임시 파일에 저장 중…':'MP4 저장 후 재생'}</button>
        :<p role="status">큰 MP4를 저장하려면 브라우저 임시 파일 스트리밍(OPFS)이 필요합니다.</p>}
      {video&&video.bytes>MAX_EPISODE_BROWSER_BYTES?<p role="status">영상이 브라우저 임시 저장 한도 2GB를 넘습니다.</p>:null}
      {SIDE_FILES.map(name=><button key={name} type="button" disabled={!!busyName||!downloadable||!job.artifacts.some(item=>item.name===name&&item.bytes<=LIMITS[name])} onClick={()=>void saveSideFile(name)}>{busyName===name?'확인 중…':`${name} 받기`}</button>)}
      {videoUrl&&downloadable?<><video controls preload="metadata" src={videoUrl} aria-label="최종 내보내기 영상"/><a href={videoUrl} download={`visualmaker-episode-001-r${revision}-export.mp4`}>검증된 영상 파일 받기</a></>:null}
      <p className="vm-help">서버가 제공 직전 원본과 다섯 파일의 SHA-256을 확인합니다. 브라우저는 자막·이미지·기록의 해시를 다시 확인하고, MP4는 크기만 확인해 임시 파일로 저장합니다. 기술 기록에는 출처 확인용 상대 경로가 포함될 수 있습니다. 기술 산출물은 사용자 최종 영상 PASS가 아닙니다.</p>
    </>:error?null:<p role="status">최종 내보내기 기록 확인 중…</p>}
  </div>;
}
