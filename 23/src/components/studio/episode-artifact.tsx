'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {EpisodeReceipt} from '../../../visualmaker/renderer/episode-contract.ts';
import {currentEpisodeReceipt,episodeResponseScope} from './episode-client';
import {MAX_EPISODE_BROWSER_BYTES,streamEpisodeToPrivateFile} from './episode-opfs';
import type {EpisodeStorage} from './episode-opfs';

const RECEIPT_LIMIT=2_000_000;
async function boundedBytes(response:Response,signal:AbortSignal):Promise<Uint8Array>{
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>RECEIPT_LIMIT)throw new Error('전체 영상 기록이 크기 제한을 넘었습니다.');
  const reader=response.body?.getReader();if(!reader)throw new Error('전체 영상 기록이 비어 있습니다.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>RECEIPT_LIMIT){await reader.cancel();throw new Error('전체 영상 기록이 크기 제한을 넘었습니다.');}
    chunks.push(value);if(signal.aborted)throw new Error('요청이 취소됐습니다.');}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export default function EpisodeArtifact({plan,job,token,isCurrent}:{plan:Plan;job:Job;token:string;isCurrent:(job:Job)=>boolean}){
  const [receipt,setReceipt]=useState<EpisodeReceipt|null>(null),[receiptBytes,setReceiptBytes]=useState<Uint8Array|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [videoUrl,setVideoUrl]=useState<string|null>(null);
  const receiptControllerRef=useRef<AbortController|null>(null),saveControllerRef=useRef<AbortController|null>(null);
  const activeRef=useRef<{url:string;cleanup:()=>Promise<void>}|null>(null);
  const storage=typeof navigator==='undefined'?undefined:(navigator.storage as StorageManager&EpisodeStorage);
  const supported=!!storage&&typeof storage.getDirectory==='function'&&typeof storage.estimate==='function';
  const query=new URLSearchParams({jobId:job.id,projectId:job.projectId,baseRevision:String(job.requestedRevision),attempt:String(job.attempt)});
  async function clearActive(){const active=activeRef.current;activeRef.current=null;
    if(active){URL.revokeObjectURL(active.url);await active.cleanup();}}
  useEffect(()=>{
    const controller=new AbortController();let live=true;receiptControllerRef.current=controller;
    setReceipt(null);setReceiptBytes(null);setError('');setVideoUrl(null);
    void(async()=>{try{
      if(!isCurrent(job))throw new Error('현재 에피소드 작업이 아닙니다.');
      const response=await fetch(`/api/studio/jobs/episode-media?${query}&name=provisional-episode.json`,
        {headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!episodeResponseScope(response,job)||response.headers.get('content-type')?.split(';')[0]!=='application/json'||
        response.headers.get('content-disposition')!=='attachment; filename="provisional-episode.json"')throw new Error('현재 작업의 기록 응답이 아닙니다.');
      const bytes=await boundedBytes(response,controller.signal),next=await currentEpisodeReceipt(bytes,job,plan);
      if(!next||!isCurrent(job))throw new Error('현재 작업과 영상 기록의 SHA-256 결속이 다릅니다.');
      if(live&&!controller.signal.aborted){setReceipt(next);setReceiptBytes(bytes);}
    }catch(reason){if(live&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'전체 영상 기록을 확인하지 못했습니다.');}})();
    return()=>{live=false;controller.abort();saveControllerRef.current?.abort();void clearActive().catch(()=>{});};
  // The job list is polled every three seconds. Replacing an equivalent Job object must not restart a download or video.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[plan.id,plan.revision,plan.script.rawSha256,job.id,job.attempt,job.status,token,isCurrent]);

  async function saveAndPlay(){if(!receipt||busy||saveControllerRef.current||!supported||!storage||!isCurrent(job))return;
    if(receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES){setError('브라우저 임시 저장은 최대 2GB까지 지원합니다.');return;}
    const controller=new AbortController();saveControllerRef.current=controller;setBusy(true);setError('');setVideoUrl(null);
    try{
      await clearActive();
      if(controller.signal.aborted||!isCurrent(job))throw new Error('현재 작업이 변경됐습니다.');
      const response=await fetch(`/api/studio/jobs/episode-media?${query}`,
        {headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!episodeResponseScope(response,job)||response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='video/mp4'||
        response.headers.get('accept-ranges')!=='bytes'||Number(response.headers.get('content-length'))!==receipt.output.bytes)
        throw new Error('현재 작업의 영상 범위와 크기가 다릅니다.');
      const saved=await streamEpisodeToPrivateFile({response,expectedBytes:receipt.output.bytes,storage,id:crypto.randomUUID(),
        signal:controller.signal,current:()=>isCurrent(job)});
      if(controller.signal.aborted||!isCurrent(job)){await saved.cleanup();throw new Error('현재 작업이 변경됐습니다.');}
      let url:string;try{url=URL.createObjectURL(saved.file);}catch(reason){await saved.cleanup();throw reason;}
      activeRef.current={url,cleanup:saved.cleanup};setVideoUrl(url);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'영상 저장을 완료하지 못했습니다.');}
    finally{if(saveControllerRef.current===controller)saveControllerRef.current=null;setBusy(false);}
  }
  function saveReceipt(){if(!receiptBytes||!isCurrent(job))return;
    const url=URL.createObjectURL(new Blob([receiptBytes.slice().buffer],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`visualmaker-episode-001-r${job.requestedRevision}-receipt.json`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="vm-diagnostic-playback" aria-label="전체 임시 영상 결과">
    {error?<p role="alert">{error}</p>:null}
    {receipt?<><p>EP001 전체 임시 영상 · {receipt.composition.durationFrames}프레임 · {receipt.measured.durationSeconds.toFixed(2)}초 · 오디오 트랙 {receipt.measured.audioStreams}개</p>
      <p>기술 기록 SHA-256 결속 확인 · 영상 SHA-256 {receipt.output.sha256.slice(0,16)}… · 사용자 전체 영상 검토 전</p>
      {supported?<button type="button" disabled={busy||!isCurrent(job)||receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES} onClick={()=>void saveAndPlay()}>{busy?'브라우저 임시 파일에 저장 중…':'임시 저장 후 재생'}</button>
        :<p role="status">이 브라우저는 큰 영상의 임시 파일 스트리밍을 지원하지 않습니다. OPFS를 지원하는 브라우저에서 작업 화면을 열어 주세요.</p>}
      {receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES?<p role="status">영상이 브라우저 임시 저장 한도 2GB를 넘습니다.</p>:null}
      <button type="button" disabled={!receiptBytes||!isCurrent(job)} onClick={saveReceipt}>기술 기록 JSON 받기</button>
      {videoUrl?<><video controls preload="metadata" src={videoUrl} aria-label="전체 에피소드 임시 영상"/><a href={videoUrl} download={`visualmaker-episode-001-r${job.requestedRevision}-provisional.mp4`}>영상 다운로드</a></>:null}
      <p className="vm-help">브라우저 전용 임시 공간에 새 파일을 저장해 재생합니다. 서버는 제공 전 MP4 SHA-256을 검증하고, 이 화면은 정확한 전달 바이트 수를 확인합니다. 저장된 파일의 SHA-256을 브라우저에서 다시 계산하지는 않습니다. 녹음·자막은 포함되지 않습니다.</p>
    </>:error?null:<p role="status">전체 영상 결과 기록 확인 중…</p>}
  </div>;
}
