'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import {currentEpisodeEnqueue} from './episode-client';

export default function EpisodePanel({plan,token,busy,jobs,onQueued}:{plan:Plan;token:string;busy:boolean;jobs:Job[];onQueued:()=>Promise<void>}){
  const [posting,setPosting]=useState(false),[error,setError]=useState('');
  const [refreshWarning,setRefreshWarning]=useState(''),[accepted,setAccepted]=useState<Job|null>(null);
  const [blockers,setBlockers]=useState<string[]>([]);
  const controllerRef=useRef<AbortController|null>(null);
  const requestKeyRef=useRef<string|null>(null);
  useEffect(()=>()=>controllerRef.current?.abort(),[plan.id,plan.revision,plan.script.rawSha256,token]);
  const current=jobs.filter(job=>job.kind==='episode-provisional-video'&&job.projectId===plan.id&&job.requestedRevision===plan.revision);
  const latest=accepted?(current.find(job=>job.id===accepted.id)??accepted):current[0];
  const acceptedPending=accepted?.status==='queued'&&!current.some(job=>job.id===accepted.id&&
    !['queued','running'].includes(job.status));
  async function enqueue(){if(busy||posting||acceptedPending)return;const controller=new AbortController();controllerRef.current=controller;setPosting(true);setError('');setRefreshWarning('');setBlockers([]);
    const requestKey=requestKeyRef.current??crypto.randomUUID();requestKeyRef.current=requestKey;
    try{const response=await fetch('/api/studio/jobs',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
      body:JSON.stringify({action:'enqueue',kind:'episode-provisional-video',projectId:plan.id,baseRevision:plan.revision,idempotencyKey:requestKey}),
      cache:'no-store',signal:controller.signal});
      if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(body?.error??'전체 임시 영상 작업을 만들지 못했습니다.');}
      const value=await response.json(),accepted=await currentEpisodeEnqueue(value,plan);
      if(!accepted||response.status!==(accepted.job.status==='blocked'?200:201))throw new Error('현재 에피소드와 결속되지 않은 작업 응답입니다.');
      if(controller.signal.aborted)return;
      requestKeyRef.current=null;setAccepted(accepted.job);
      if(!controller.signal.aborted&&accepted.job.status==='blocked')setBlockers(accepted.report.blockers.map(item=>item.detail));
      try{await onQueued();}catch{if(!controller.signal.aborted)setRefreshWarning('작업은 저장됐지만 목록 갱신에 실패했습니다. 작업 화면을 새로고침해 상태를 확인하세요.');}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'전체 임시 영상 요청에 실패했습니다.');}
    finally{if(controllerRef.current===controller){controllerRef.current=null;setPosting(false);}}
  }
  return <section className="vm-readiness" aria-label="전체 에피소드 임시 영상">
    <div className="vm-section-heading"><h2>전체 에피소드 임시 영상</h2><span>현재 제작 명세</span></div>
    <p className="vm-help">현재 episode-spec의 컷과 전환을 EpisodeTimeline으로 렌더합니다. 모든 컷 입력과 필수 검토가 준비되어야 실행됩니다. 무음 영상이며 전체 영상 검토·녹음 정렬·최종 승인은 별도 단계입니다.</p>
    {latest?.status==='blocked'?<p role="status">현재 전체 영상 작업 차단: {latest.blocker||'제작 조건을 다시 확인하세요.'}</p>:null}
    {blockers.length?<ul>{blockers.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}
    {latest?.status==='queued'||latest?.status==='running'?<p role="status">전체 영상 작업 {latest.status==='queued'?'실행 대기':'렌더 중'} · 작업 목록에서 제어할 수 있습니다.</p>:null}
    {refreshWarning&&!current.some(job=>job.id===accepted?.id)?<p role="status">{refreshWarning}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <button type="button" disabled={busy||posting||acceptedPending||latest?.status==='queued'||latest?.status==='running'} onClick={()=>void enqueue()}>
      {posting?'제작 조건 확인 중…':'전체 임시 영상 작업 만들기'}
    </button>
  </section>;
}
