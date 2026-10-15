'use client';

import {useEffect,useState} from 'react';
import {isCurrentDiagnosticResponse} from './diagnostic-client';

export default function DiagnosticPlayback({jobId,projectId,attempt,token}:{jobId:string;projectId:string;attempt:number;token:string}){
  const [url,setUrl]=useState<string|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let live=true;let objectUrl:string|null=null;
    setUrl(null);setError('');
    void (async()=>{
      try{
        const response=await fetch(`/api/studio/jobs/media?jobId=${encodeURIComponent(jobId)}`,{headers:{'x-visualmaker-token':token},signal:controller.signal,cache:'no-store'});
        if(!isCurrentDiagnosticResponse(response,{projectId,jobId,attempt}))throw new Error('검증된 현재 작업 영상 응답이 아닙니다.');
        const bytes=await response.blob();
        if(!live||controller.signal.aborted)return;
        objectUrl=URL.createObjectURL(bytes);setUrl(objectUrl);
      }catch{if(live&&!controller.signal.aborted)setError('진단 영상 재생 파일을 확인할 수 없습니다.');}
    })();
    return()=>{live=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[jobId,projectId,attempt,token]);
  return <div className="vm-diagnostic-playback"><p>렌더 엔진 점검 영상 · 컷 미리보기나 제작 승인이 아닙니다.</p>{error?<p role="alert">{error}</p>:url?<video controls preload="metadata" src={url} aria-label="렌더 엔진 진단 영상"/>:<p role="status">검증된 진단 영상을 불러오는 중…</p>}</div>;
}
