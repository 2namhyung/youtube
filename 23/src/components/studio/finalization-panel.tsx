'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import {currentFinalizationEnqueue,currentFinalizationReadiness} from './finalization-client.ts';
import type {PublicFinalizationReadiness} from './finalization-client.ts';

export default function FinalizationPanel({plan,token,busy,jobs,onQueued}:{plan:Plan;token:string;busy:boolean;jobs:Job[];onQueued:()=>Promise<void>}){
  const [readiness,setReadiness]=useState<PublicFinalizationReadiness|null>(null);
  const [loading,setLoading]=useState(true),[posting,setPosting]=useState(false),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[accepted,setAccepted]=useState<Job|null>(null);
  const postRef=useRef<AbortController|null>(null),requestKeyRef=useRef<string|null>(null);
  const projectId=plan.id,revision=plan.revision,scriptSha256=plan.script.rawSha256;
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setReadiness(null);setError('');
    void(async()=>{try{
      const query=new URLSearchParams({projectId,baseRevision:String(revision)});
      const response=await fetch(`/api/studio/finalization?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('최종 내보내기 조건을 확인하지 못했습니다.');
      if(response.headers.get('cache-control')!=='no-store')throw new Error('최종 내보내기 응답의 범위가 올바르지 않습니다.');
      const value=await currentFinalizationReadiness(await response.json(),plan);
      if(!value)throw new Error('현재 프로젝트와 결속되지 않은 최종 내보내기 응답입니다.');
      if(!controller.signal.aborted)setReadiness(value);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'최종 내보내기 조건을 확인하지 못했습니다.');}
    finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>{controller.abort();postRef.current?.abort();};
  // The keyed mount changes with project, revision, script hash and token. Refresh changes only the request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,revision,scriptSha256,token,refresh]);
  const current=jobs.filter(job=>job.kind==='episode-finalization-export'&&job.projectId===projectId&&job.requestedRevision===revision);
  const latest=accepted?(current.find(job=>job.id===accepted.id)??accepted):current[0];
  async function enqueue(){
    if(!readiness?.renderEligible||busy||loading||posting||latest?.status==='queued'||latest?.status==='running')return;
    const controller=new AbortController();postRef.current=controller;setPosting(true);setError('');setNotice('');
    const key=requestKeyRef.current??crypto.randomUUID();requestKeyRef.current=key;
    try{
      const response=await fetch('/api/studio/jobs',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'enqueue',kind:'episode-finalization-export',projectId,baseRevision:revision,idempotencyKey:key}),
        cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('최종 내보내기 작업을 만들지 못했습니다. 제작 입력과 승인을 다시 확인하세요.');
      if(response.headers.get('cache-control')!=='no-store')throw new Error('최종 내보내기 작업 응답의 범위가 올바르지 않습니다.');
      const pair=await currentFinalizationEnqueue(await response.json(),plan);
      if(!pair||response.status!==(pair.job.status==='blocked'?200:201))throw new Error('현재 프로젝트와 결속되지 않은 최종 내보내기 작업입니다.');
      if(controller.signal.aborted)return;
      requestKeyRef.current=null;setAccepted(pair.job);setReadiness(pair.readiness);
      if(pair.job.status==='blocked')setNotice('제작 조건이 변경되어 작업이 차단됐습니다.');
      try{await onQueued();}catch{if(!controller.signal.aborted)setNotice('작업은 저장됐지만 목록 갱신에 실패했습니다. 화면을 새로고침해 상태를 확인하세요.');}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'최종 내보내기 요청에 실패했습니다.');}
    finally{if(postRef.current===controller){postRef.current=null;setPosting(false);}}
  }
  return <section className="vm-readiness" aria-label="최종 내보내기 준비">
    <div className="vm-section-heading"><h2>최종 영상 내보내기</h2><span>제작 게이트 확인</span></div>
    <p className="vm-help">현재 명세, 최종 녹음 영상, 대본·자막 승인과 컷 검토를 확인해 MP4·SRT·VTT·썸네일·기술 기록을 만듭니다. 입력에 따라 원본 음성을 통과시키거나 승인 입력에 결속된 고정 게인 음악·효과음을 믹스합니다. 준비 상태에는 믹스 방식이 표시되지 않습니다. 이 화면의 결과는 기술 산출물이며 사용자 제작 승인이나 최종 영상 PASS를 뜻하지 않습니다.</p>
    {loading?<p role="status">현재 제작 입력과 승인 상태 확인 중…</p>:null}
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {readiness&&!readiness.renderEligible?<><p role="status">최종 내보내기 조건 미충족 · {readiness.blockers.length}건</p>
      <ul>{readiness.blockers.map((item,index)=><li key={`${item.code}:${index}`}>{item.code} · {item.detail}</li>)}</ul></>:null}
    {readiness?.renderEligible?<p role="status">제작 조건 충족 · {readiness.composition?.durationFrames}프레임을 내보낼 수 있습니다.</p>:null}
    {latest?.status==='queued'||latest?.status==='running'?<p role="status">최종 내보내기 작업 {latest.status==='queued'?'실행 대기':'실행 중'} · 아래 작업 목록에서 실행·취소·복구할 수 있습니다.</p>:null}
    <div className="vm-tools"><button type="button" disabled={loading||posting} onClick={()=>setRefresh(value=>value+1)}>제작 조건 다시 확인</button>
      <button type="button" disabled={!readiness?.renderEligible||busy||loading||posting||latest?.status==='queued'||latest?.status==='running'} onClick={()=>void enqueue()}>{posting?'작업 확인 중…':'최종 내보내기 작업 만들기'}</button></div>
  </section>;
}
