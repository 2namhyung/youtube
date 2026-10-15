'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {AudioAssemblyReport} from '../../../visualmaker/core/audio-assembly.ts';
import {currentAudioEnqueue,currentAudioReport} from './audio-assembly-client.ts';
import {episodePlanHash} from './episode-client.ts';

export default function AudioAssemblyPanel({plan,token,busy,jobs,onQueued}:{plan:Plan;token:string;busy:boolean;jobs:Job[];onQueued:()=>Promise<void>}){
  const [report,setReport]=useState<AudioAssemblyReport|null>(null),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[posting,setPosting]=useState(false),[refresh,setRefresh]=useState(0);
  const [accepted,setAccepted]=useState<Job|null>(null);
  const controllerRef=useRef<AbortController|null>(null),postControllerRef=useRef<AbortController|null>(null),requestKeyRef=useRef<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();controllerRef.current=controller;setLoading(true);setReport(null);setError('');
    void(async()=>{try{
      const query=new URLSearchParams({projectId:plan.id,baseRevision:String(plan.revision)});
      const response=await fetch(`/api/studio/audio-assembly?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      if(!response.ok){const value=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(value?.error??'녹음 조립 준비 상태를 읽지 못했습니다.');}
      if(response.headers.get('cache-control')!=='no-store'||response.headers.get('x-visualmaker-schema')!=='visualmaker-audio-assembly-v1'||
        response.headers.get('x-visualmaker-production-authority')!=='false')throw new Error('제작 준비 응답의 범위가 올바르지 않습니다.');
      const value=currentAudioReport(await response.json(),plan);
      if(!value||value.scope.snapshotSha256!==await episodePlanHash(plan))throw new Error('현재 프로젝트와 결속되지 않은 제작 준비 응답입니다.');
      if(!controller.signal.aborted)setReport(value);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'녹음 조립 준비 상태를 읽지 못했습니다.');}
    finally{if(!controller.signal.aborted)setLoading(false);}})();
    return()=>{controller.abort();postControllerRef.current?.abort();if(controllerRef.current===controller)controllerRef.current=null;};
  },[plan,token,refresh]);
  const current=jobs.filter(job=>job.kind==='audio-timed-assembly'&&job.projectId===plan.id&&job.requestedRevision===plan.revision);
  const latest=accepted?(current.find(job=>job.id===accepted.id)??accepted):current[0];
  async function enqueue(){
    if(!report?.renderEligible||busy||posting||loading||latest?.status==='queued'||latest?.status==='running')return;
    const controller=new AbortController();postControllerRef.current=controller;setPosting(true);setError('');setNotice('');
    const requestKey=requestKeyRef.current??crypto.randomUUID();requestKeyRef.current=requestKey;
    try{
      const response=await fetch('/api/studio/jobs',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'enqueue',kind:'audio-timed-assembly',projectId:plan.id,baseRevision:plan.revision,idempotencyKey:requestKey}),
        cache:'no-store',signal:controller.signal});
      if(!response.ok){const value=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(value?.error??'녹음 조립 작업을 만들지 못했습니다.');}
      const accepted=await currentAudioEnqueue(await response.json(),plan);
      if(!accepted||response.status!==(accepted.job.status==='blocked'?200:201))throw new Error('현재 프로젝트와 결속되지 않은 작업 응답입니다.');
      if(controller.signal.aborted)return;
      requestKeyRef.current=null;setAccepted(accepted.job);
      if(accepted.job.status==='blocked'){setReport(accepted.report);setNotice('제작 조건이 변경되어 작업이 차단됐습니다.');}
      try{await onQueued();}catch{setNotice('작업은 저장됐지만 목록 갱신에 실패했습니다. 화면을 새로고침해 상태를 확인하세요.');}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'녹음 조립 요청에 실패했습니다.');}
    finally{if(postControllerRef.current===controller){postControllerRef.current=null;setPosting(false);}}
  }
  return <section className="vm-readiness" aria-label="최종 녹음 시간에 맞춘 임시 영상 조립">
    <div className="vm-section-heading"><h2>최종 녹음 시간에 맞춘 영상 조립</h2><span>제작 게이트 확인</span></div>
    <p className="vm-help">확정된 컷 시간과 실제 측정한 최종 녹음을 결속해 임시 영상의 오디오 트랙을 만듭니다. 컷 QC와 최종 녹음 승인이 필요합니다. 자막·음악·최종 출력은 이후 단계이며 기술 검사만으로 제작 승인이 되지 않습니다.</p>
    {loading?<p role="status">현재 제작 명세와 최종 녹음 확인 중…</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {report&&!report.renderEligible?<><p role="status">오디오 조립 조건 미충족 · {report.blockers.length}건</p>
      <ul>{report.blockers.map((item,index)=><li key={`${item.code}:${index}`}>{item.detail}</li>)}</ul></>:null}
    {report?.renderEligible?<><p role="status">측정 녹음 {report.voices.length}개 · {report.composition?.durationFrames}프레임에 배치할 수 있습니다.</p>
      <details><summary>컷별 녹음 위치와 입력 확인</summary><ol>{report.voices.map(voice=><li key={voice.cutId}>
        <strong>{voice.cutId}</strong> · 시작 {voice.voiceStartFrame}프레임 · 앞 여유 {voice.preRollFrames}프레임 · 녹음 {voice.durationSeconds.toFixed(2)}초 · 뒤 여유 {voice.postHoldFrames}프레임 · 원본 SHA-256 {voice.sha256.slice(0,16)}…
      </li>)}</ol></details></>:null}
    {latest?.status==='queued'||latest?.status==='running'?<p role="status">오디오 조립 작업 {latest.status==='queued'?'실행 대기':'실행 중'} · 아래 작업 목록에서 제어할 수 있습니다.</p>:null}
    <div className="vm-tools"><button type="button" disabled={loading||posting} onClick={()=>setRefresh(value=>value+1)}>제작 조건 다시 확인</button>
      <button type="button" disabled={!report?.renderEligible||busy||loading||posting||latest?.status==='queued'||latest?.status==='running'} onClick={()=>void enqueue()}>{posting?'작업 확인 중…':'녹음 조립 작업 만들기'}</button></div>
  </section>;
}
