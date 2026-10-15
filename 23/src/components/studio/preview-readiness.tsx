'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model';
import {PreviewReadinessController} from './preview-readiness-client';
import type {PreviewViewState} from './preview-readiness-client';

const empty:PreviewViewState={status:'idle',key:null,report:null,error:null};
const modeLabel:Record<string,string>={'source-photo':'실사 사진','source-video':'실사 영상',remotion:'설명 그래픽',omni:'허구 연속성'};
const observationLabel:Record<string,string>={acceptable:'관찰: 적합',pending:'관찰: 대기',rejected:'관찰: 부적합',missing:'기록 없음'};

export default function PreviewReadiness({plan,token,busy}:{plan:Plan;token:string;busy:boolean}){
  const [view,setView]=useState<PreviewViewState>(empty);
  const controllerRef=useRef<PreviewReadinessController|null>(null);
  if(!controllerRef.current)controllerRef.current=new PreviewReadinessController(async(current,signal)=>{
    const query=new URLSearchParams({id:current.id,baseRevision:String(current.revision)});
    const response=await fetch(`/api/studio/preview-readiness?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal});
    if(!response.ok){let message='미리보기 준비 상태를 읽지 못했습니다.';try{const payload:unknown=await response.json();if(payload&&typeof payload==='object'&&'error' in payload&&typeof payload.error==='string')message=payload.error;}catch{}throw new Error(message);}
    return response.json();
  },setView);
  const controller=controllerRef.current;
  useEffect(()=>{controller.subscribe(setView);controller.contextChanged(plan);return()=>controller.dispose();},[controller,plan.id,plan.revision,plan.script.rawSha256]);
  const key=`${plan.id}:${plan.revision}:${plan.script.rawSha256}`;
  const current=view.key===key?view:empty;
  return <section className="vm-readiness" aria-label="미리보기 준비 상태" aria-busy={current.status==='loading'}>
    <div className="vm-readiness-heading"><div><span className="vm-eyebrow">04 / PREVIEW READINESS</span><h2>미리보기 준비 상태</h2><p>장면별 자료와 관찰 기록을 확인합니다. 컷 영상과 제작 승인은 아직 없습니다.</p></div>
      <button disabled={busy||current.status==='loading'} onClick={()=>void controller.open(plan)}>미리보기 준비 상태 확인</button></div>
    {current.status==='idle'?<p className="vm-help">현재 리비전의 상태를 아직 확인하지 않았습니다.</p>:null}
    {current.status==='loading'?<p role="status">현재 장면을 확인하는 중…</p>:null}
    {current.status==='error'?<p role="alert">{current.error}</p>:null}
    {current.status==='ready'?<div className="vm-readiness-report">
      <p className="vm-readiness-warning">작업용 관찰 결과 · 제작 권한 없음 · 재생 가능한 미리보기 없음 · 컷 검토 전</p>
      <p>프로젝트 리비전 {current.report.revision} · 선택 방향에 배정된 고유 원본 {current.report.selectedAssignedOriginalSha256Count}개 · 로컬 바이트 검증된 고유 원본 {current.report.verifiedLocalOriginalSha256Count}개</p>
      <p className="vm-help">원본 수는 선택한 자료의 SHA-256으로 계산합니다. 로컬 검증은 이 조회 순간의 파일 상태이며 출처·권리·의미 승인과 다릅니다.</p>
      <ol className="vm-readiness-scenes">{current.report.scenes.map((scene,index)=><li key={scene.sceneId}><details><summary><b>{index+1}. {scene.sceneId}</b> · {scene.mode?modeLabel[scene.mode]:'방향 미선택'} · 차단 항목 {scene.blockers.length}개</summary>
        <p>계획상 추정 {scene.estimatedSeconds.toFixed(1)}초 · 실측 컷 타이밍 아님{scene.originCutIds.length?` · 원본 컷 ${scene.originCutIds.join(', ')}`:''}</p>
        {scene.requirements.length?<ul>{scene.requirements.map(requirement=><li key={requirement.requirementId}><strong>{requirement.description}</strong><span> · {requirement.mediaType} · {requirement.assetId?'자료 배정':'미배정'} · {requirement.localIntegrity==='verified'?'로컬 바이트 확인':requirement.localIntegrity==='invalid'?'로컬 원본 확인 필요':'로컬 원본 없음'}</span>
          {requirement.assetId?<small>출처 {observationLabel[requirement.observations.source]} · 사용 조건 {observationLabel[requirement.observations.rights]} · 의미 {observationLabel[requirement.observations.semantic]}</small>:null}</li>)}</ul>:<p>선택 방향의 자료 요구 없음</p>}
        <h3>다음에 해결할 내용</h3><ul>{scene.blockers.map((item,blockerIndex)=><li key={`${item.code}:${item.requirementId??''}:${blockerIndex}`}>{item.requirementId?`${item.requirementId} · `:''}{item.message}</li>)}</ul>
      </details></li>)}</ol>
    </div>:null}
  </section>;
}
