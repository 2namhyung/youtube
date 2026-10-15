'use client';

import {useEffect,useState} from 'react';
import {currentCanonicalMedia} from './canonical-client';

export default function CanonicalPlayback({projectId,jobId,sceneId,attempt,token}:{projectId:string;jobId:string;sceneId:string;attempt:number;token:string}){
  const [url,setUrl]=useState<string|null>(null);const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let live=true;let objectUrl:string|null=null;setUrl(null);setError('');
    const scope={projectId,jobId,sceneId,attempt};
    void(async()=>{try{
      const response=await fetch(`/api/studio/cuts/media?${new URLSearchParams({projectId,jobId,sceneId,attempt:String(attempt)})}`,{headers:{'x-visualmaker-token':token},signal:controller.signal,cache:'no-store'});
      if(!currentCanonicalMedia(response,scope))throw new Error('stale-media');
      const blob=await response.blob();if(!live||controller.signal.aborted)return;
      objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
    }catch{if(live&&!controller.signal.aborted)setError('현재 컷 영상의 결속을 확인할 수 없습니다.');}})();
    return()=>{live=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[projectId,jobId,sceneId,attempt,token]);
  return <div className="vm-diagnostic-playback"><p>정식 카탈로그 기반 임시 컷 프리뷰 · 컷 PASS·스타일 승인·playable parity가 아닙니다.</p>{error?<p role="alert">{error}</p>:url?<video controls preload="metadata" src={url} aria-label="정식 컷 임시 미리보기"/>:<p role="status">검증된 컷 영상을 불러오는 중…</p>}</div>;
}
