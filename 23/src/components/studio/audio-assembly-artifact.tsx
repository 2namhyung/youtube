'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {AudioAssemblyReceipt} from '../../../visualmaker/renderer/audio-assembly-contract.ts';
import {audioResponseScope,currentAudioReceipt} from './audio-assembly-client.ts';
import {MAX_EPISODE_BROWSER_BYTES,streamEpisodeToPrivateFile} from './episode-opfs.ts';
import type {EpisodeStorage} from './episode-opfs';

const RECEIPT_LIMIT=2_000_000;
async function receiptBytes(response:Response,signal:AbortSignal):Promise<Uint8Array>{
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>RECEIPT_LIMIT)throw new Error('오디오 조립 기록이 크기 제한을 넘었습니다.');
  const reader=response.body?.getReader();if(!reader)throw new Error('오디오 조립 기록이 비어 있습니다.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>RECEIPT_LIMIT){await reader.cancel();throw new Error('오디오 조립 기록이 크기 제한을 넘었습니다.');}
    chunks.push(value);if(signal.aborted)throw new Error('요청이 취소됐습니다.');}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export default function AudioAssemblyArtifact({plan,job,token,isCurrent}:{plan:Plan;job:Job;token:string;isCurrent:(job:Job)=>boolean}){
  const [receipt,setReceipt]=useState<AudioAssemblyReceipt|null>(null),[record,setRecord]=useState<Uint8Array|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[videoUrl,setVideoUrl]=useState<string|null>(null);
  const saveRef=useRef<AbortController|null>(null),activeRef=useRef<{url:string;cleanup:()=>Promise<void>}|null>(null);
  const storage=typeof navigator==='undefined'?undefined:(navigator.storage as StorageManager&EpisodeStorage);
  const supported=!!storage&&typeof storage.getDirectory==='function'&&typeof storage.estimate==='function';
  const query=new URLSearchParams({jobId:job.id,projectId:job.projectId,baseRevision:String(job.requestedRevision),attempt:String(job.attempt)});
  async function clearActive(){const active=activeRef.current;activeRef.current=null;
    if(active){URL.revokeObjectURL(active.url);await active.cleanup();}}
  useEffect(()=>{
    const controller=new AbortController();let live=true;setReceipt(null);setRecord(null);setError('');setVideoUrl(null);
    void(async()=>{try{
      if(!isCurrent(job))throw new Error('현재 오디오 조립 작업이 아닙니다.');
      const response=await fetch(`/api/studio/jobs/audio-media?${query}&name=provisional-voiced-episode.json`,
        {headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!audioResponseScope(response,job)||response.headers.get('content-type')?.split(';')[0]!=='application/json'||
        response.headers.get('content-disposition')!=='attachment; filename="provisional-voiced-episode.json"')throw new Error('현재 작업의 녹음 조립 기록이 아닙니다.');
      const bytes=await receiptBytes(response,controller.signal),parsed=await currentAudioReceipt(bytes,job,plan);
      if(!parsed||!isCurrent(job))throw new Error('오디오 조립 기록과 현재 작업의 결속이 다릅니다.');
      if(live&&!controller.signal.aborted){setReceipt(parsed);setRecord(bytes);}
    }catch(reason){if(live&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'오디오 조립 기록을 확인하지 못했습니다.');}})();
    return()=>{live=false;controller.abort();saveRef.current?.abort();void clearActive().catch(()=>{});};
  // Polling replaces equivalent job objects; receipt retrieval is tied to immutable identity fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[plan.id,plan.revision,plan.script.rawSha256,job.id,job.attempt,job.status,token,isCurrent]);
  async function saveAndPlay(){
    if(!receipt||busy||saveRef.current||!supported||!storage||!isCurrent(job))return;
    if(receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES){setError('브라우저 임시 저장은 최대 2GB까지 지원합니다.');return;}
    const controller=new AbortController();saveRef.current=controller;setBusy(true);setError('');setVideoUrl(null);
    try{
      await clearActive();if(controller.signal.aborted||!isCurrent(job))throw new Error('현재 작업이 변경됐습니다.');
      const response=await fetch(`/api/studio/jobs/audio-media?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!audioResponseScope(response,job)||response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='video/mp4'||
        response.headers.get('accept-ranges')!=='bytes'||Number(response.headers.get('content-length'))!==receipt.output.bytes)
        throw new Error('현재 작업 영상의 범위와 크기가 다릅니다.');
      const saved=await streamEpisodeToPrivateFile({response,expectedBytes:receipt.output.bytes,storage,id:crypto.randomUUID(),
        signal:controller.signal,current:()=>isCurrent(job)});
      if(controller.signal.aborted||!isCurrent(job)){await saved.cleanup();throw new Error('현재 작업이 변경됐습니다.');}
      let url:string;try{url=URL.createObjectURL(saved.file);}catch(reason){await saved.cleanup();throw reason;}
      activeRef.current={url,cleanup:saved.cleanup};setVideoUrl(url);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'녹음 조립 영상을 저장하지 못했습니다.');}
    finally{if(saveRef.current===controller)saveRef.current=null;setBusy(false);}
  }
  function saveRecord(){if(!record||!isCurrent(job))return;
    const url=URL.createObjectURL(new Blob([record.slice().buffer],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`visualmaker-episode-001-r${job.requestedRevision}-audio-receipt.json`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="vm-diagnostic-playback" aria-label="최종 녹음 조립 임시 영상 결과">
    {error?<p role="alert">{error}</p>:null}
    {receipt?<><p>EP001 녹음 조립 임시 영상 · {receipt.composition.durationFrames}프레임 · {receipt.measured.durationSeconds.toFixed(2)}초 · 오디오 트랙 {receipt.measured.audioStreams}개</p>
      <p>기술 기록 SHA-256 확인 · 녹음 {receipt.voices.length}개 · 영상 SHA-256 {receipt.output.sha256.slice(0,16)}… · 사용자 전체 영상 검토 전</p>
      {supported?<button type="button" disabled={busy||!isCurrent(job)||receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES} onClick={()=>void saveAndPlay()}>{busy?'브라우저 임시 파일에 저장 중…':'녹음 조립 임시 영상 저장 후 재생'}</button>
        :<p role="status">이 브라우저는 큰 영상의 임시 파일 스트리밍을 지원하지 않습니다. OPFS 지원 브라우저에서 열어 주세요.</p>}
      {receipt.output.bytes>MAX_EPISODE_BROWSER_BYTES?<p role="status">영상이 브라우저 임시 저장 한도 2GB를 넘습니다.</p>:null}
      <button type="button" disabled={!record||!isCurrent(job)} onClick={saveRecord}>기술 기록 JSON 받기</button>
      {videoUrl?<><video controls preload="metadata" src={videoUrl} aria-label="최종 녹음을 붙인 임시 에피소드 영상"/><a href={videoUrl} download={`visualmaker-episode-001-r${job.requestedRevision}-provisional-voiced.mp4`}>임시 영상 다운로드</a></>:null}
      <p className="vm-help">서버가 제공 전 원본 영상 SHA-256과 기록을 검증합니다. 브라우저는 전달된 크기를 확인해 임시 파일로 저장합니다. 기술 검사는 자막·믹싱·최종 출력 승인과 별개입니다.</p>
    </>:error?null:<p role="status">녹음 조립 결과 기록 확인 중…</p>}
  </div>;
}
