'use client';

import {useEffect, useRef, useState} from 'react';
import {AdoptionReviewController} from './adoption-review-client';
import type {AdoptionReport, ReviewViewState} from './adoption-review-client';

const empty:ReviewViewState={status:'closed',key:null,report:null,error:null};
const show = (value:string|number|null|undefined) => value === null || value === undefined ? '없음' : String(value);
const label = (value:string) => ({available:'읽음',invalid:'규격 오류',unavailable:'읽을 수 없음',
  selected:'방향 선택',unselected:'방향 미선택',current:'원본 일치',stale:'원본 변경',unsupported:'원본 미결속',
  'merge-proposal':'장면 합치기 제안','single-cut-comparison':'원본 한 컷 비교',unbound:'원본 컷 미결속',
  same:'같음','proposed-change':'변경 제안','direction-unselected':'방향 미선택',
  'not-compared-distinct-meaning':'서로 다른 의미이므로 직접 비교하지 않음',
  acceptable:'관찰: 적합',pending:'관찰: 대기',rejected:'관찰: 부적합',
  source:'출처',rights:'사용 조건',semantic:'의미 대응'} as Record<string,string>)[value] ?? value;

function HashLine({name,path,sha256,status,reason}:{name:string;path:string;sha256:string|null;status:string;reason:string|null}){
  return <div className="vm-adoption-hash"><strong>{name} · {label(status)}</strong><span>{path}</span><code>{sha256 ?? 'SHA-256 없음'}</code>{reason?<small>{reason}</small>:null}</div>;
}

function Requirements({items}:{items:AdoptionReport['scenes'][number]['selectedRequirements']}){
  return items.length ? <ul className="vm-adoption-requirements">{items.map((item,index)=><li key={`${item.requirementId}-${index}`}>
    <strong>{item.requirementId}</strong><p>{show(item.description)}</p>
    {item.asset?<div className="vm-adoption-asset"><span>자료 {item.asset.id} · {item.asset.status}{item.asset.evidenceOnly?' · 증거 전용':''}</span>
      <code>SHA-256 {item.asset.sha256}</code><small>{item.asset.path}</small>
      <dl><dt>출처 URL</dt><dd>{item.asset.sourceUrl}</dd><dt>제작자</dt><dd>{item.asset.creator}</dd>
        <dt>사용 조건 기록</dt><dd>{item.asset.rightsNote}</dd><dt>의미 기록</dt><dd>{item.asset.semanticNote}</dd></dl></div>:<p>연결된 자료 없음</p>}
    {item.sourceReviewState?<div><p>현재 작업용 관찰 · 제작 자료 승인 아님</p>
      <ul>{(['source','rights','semantic'] as const).map(dimension=>{const current=item.sourceReviewState?.current[dimension];return <li key={dimension}><b>{label(dimension)}</b> · {current?label(current.decision):'기록 없음'}{current?<><span> · {current.rationale}</span><small> · {current.recordedAt}</small></>:null}</li>;})}</ul>
      {item.sourceReviewState.history.length?<details><summary>이전 관찰 {item.sourceReviewState.history.length}건</summary><ol>{item.sourceReviewState.history.map(entry=><li key={entry.id}>{label(entry.dimension)} · {label(entry.decision)} · {entry.rationale} · {entry.recordedAt} · 자료 SHA-256 {entry.assetSha256}</li>)}</ol></details>:null}</div>:null}
  </li>)}</ul> : <p>선택한 방향의 자료 요구 없음</p>;
}

function Report({report}:{report:AdoptionReport}){
  return <div className="vm-adoption-report">
    <p className="vm-adoption-warning">제작 반영 전 제안입니다. 이 검토는 승인이나 렌더 가능 판정이 아닙니다.</p>
    <div className="vm-adoption-summary"><div><b>프로젝트</b><span>{report.plan.projectId} · 리비전 {report.plan.revision}</span>
      <code>계획 SHA-256 {report.plan.sha256}</code></div><div><b>원본 결속</b><span>{report.originMatch?'현재 명세와 일치':'변경 또는 미결속'}</span>
      <span>현재 컷 {report.currentCutCount ?? '확인 불가'}개 · 제안 장면 {report.scenes.length}개</span></div></div>
    <div className="vm-adoption-hashes"><HashLine name="episode-spec" {...report.target.spec}/><HashLine name="production-state" {...report.target.state}/></div>
    <div className="vm-adoption-state"><strong>제작 상태 파일의 선언값 · 검증기 PASS 아님</strong>{report.currentState?<p>단계 {report.currentState.stage} · 예상 컷 {report.currentState.expectedCutCount}개 · active root {show(report.currentState.activeCutRoot)} · 렌더 권위 상태 {show(report.currentState.renderAuthorityStatus)} · 선언된 권위 {String(report.currentState.declaredProductionAuthority)}</p>:<p>제작 상태를 읽을 수 없습니다.</p>}</div>
    <div className="vm-adoption-blockers"><section><h4>편집 검토 항목</h4>{report.editorialBlockers.length?<ul>{report.editorialBlockers.map((item,index)=><li key={index}>{item}</li>)}</ul>:<p>표시된 편집 차단 항목 없음 · 승인 판정 아님</p>}</section>
      <section><h4>제작 차단 항목</h4><ul>{report.productionBlockers.map((item,index)=><li key={index}>{item}</li>)}</ul></section></div>
    <details><summary>컷 매핑 문제 {report.mappingConflicts.length}건 · 원본 컷 미매핑 {report.unmappedCurrentCuts.length}건</summary>
      {report.mappingConflicts.length?<ul>{report.mappingConflicts.map((item,index)=><li key={index}>{item.kind} · {item.sceneId} · {show(item.cutId)} · {item.detail}</li>)}</ul>:<p>매핑 충돌 기록 없음</p>}
      {report.unmappedCurrentCuts.length?<p>미매핑 원본 컷: {report.unmappedCurrentCuts.join(', ')}</p>:null}</details>
    <h4>장면별 변경 비교 · 순서대로</h4>
    <ol className="vm-adoption-scenes">{report.scenes.map(row=><li key={row.sceneId}><details><summary><b>{row.proposedOrder}. {row.sceneId}</b> · {label(row.structuralReview)} · {label(row.direction)} · {label(row.originBinding)}{row.lockedPlanningOnly?' · 계획 잠금':''}</summary>
      <p>원본 컷 ID {row.originCutIds.length?row.originCutIds.join(', '):'없음'} · 원본 순서 {row.originalOrder.map(show).join(', ')||'없음'}</p>
      <p>선택 방향 ID {show(row.selectedCandidateId)}</p>
      {row.alternatives.length?<details><summary>선택하지 않은 표현 대안 {row.alternatives.length}개</summary><ul>{row.alternatives.map(candidate=><li key={candidate.id}>{candidate.id} · {candidate.label} · {candidate.mode} · {candidate.reason}</li>)}</ul></details>:null}
      <div className="vm-adoption-compare"><section><h5>현재 제작 명세</h5>{row.before.length?row.before.map(before=><div key={before.shotId}><b>{before.shotId}</b><p>내레이션: {before.narration}</p><p>화면 목적: {before.purpose}</p><p>제작 방식: {before.mode}</p><p>보이는 행동: {before.observableAction}</p><p>원본 시청자 이해: {before.takeaway}</p></div>):<p>비교할 원본 컷 없음</p>}</section>
        <section><h5>장면 설계의 제안</h5><p>내레이션: {row.after.narration}</p><p>화면 목적: {row.after.purpose.join(' / ')}</p><p>역할: {row.after.beatRoles.join(', ')}</p><p>제작 방식: {show(row.after.mode)}</p><p>시작 상태: {show(row.after.startState)}</p><p>보이는 행동: {show(row.after.observableAction)}</p><p>제안의 끝 상태: {show(row.after.candidateEndState)}</p></section></div>
      <p>비교: 대본 {label(row.comparisons.narration)} · 목적 {label(row.comparisons.purpose)} · 방식 {label(row.comparisons.mode)} · 행동 {label(row.comparisons.observableAction)} · 원본 이해와 제안 끝 상태 {label(row.comparisons.takeaway)}</p>
      <p>계획상 추정 {row.timing.planningEstimatedSeconds}초 · 제작 타이밍과 프레임 변환은 검토하지 않음</p>
      <h5>선택 방향의 자료 요구와 관찰</h5><Requirements items={row.selectedRequirements}/>
    </details></li>)}</ol>
    <details><summary>제작 반영에 필요한 수동 단계</summary><ol>{report.manualSteps.map((step,index)=><li key={index}>{step}</li>)}</ol></details>
    <p>렌더 연결 상태: {report.rendererStatus}</p>
  </div>;
}

export default function AdoptionReview({projectId,revision,token}:{projectId:string;revision:number;token:string}){
  const [view,setView]=useState<ReviewViewState>(empty);
  const controllerRef=useRef<AdoptionReviewController|null>(null);
  if (!controllerRef.current) controllerRef.current=new AdoptionReviewController(async(id,signal)=>{
    const response=await fetch(`/api/studio?id=${encodeURIComponent(id)}&format=handoff`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal});
    if (!response.ok){let message='제작 변경안을 읽지 못했습니다.';try{const payload:unknown=await response.json();if(payload && typeof payload==='object' && 'error' in payload && typeof payload.error==='string') message=payload.error;}catch{}throw new Error(message);}
    return response.json();
  },setView);
  const controller=controllerRef.current;
  const key=`${projectId}:${revision}`;
  useEffect(()=>{controller.subscribe(setView);controller.contextChanged(projectId,revision);return()=>controller.dispose();},[controller,projectId,revision]);
  const current=view.key===key ? view : empty;
  return <section className="vm-adoption" aria-label="제작 변경안 검토" aria-busy={current.status==='loading'}>
    <div className="vm-adoption-heading"><div><h2>제작 변경안 검토</h2><p>현재 원본 명세와 장면 설계의 차이를 읽기 전용으로 대조합니다.</p></div><div>
      {current.status==='closed'?<button onClick={()=>void controller.open(projectId,revision)}>제작 변경안 검토</button>:<><button disabled={current.status==='loading'} onClick={()=>void controller.open(projectId,revision)}>다시 읽기</button><button onClick={()=>controller.close()}>닫기</button></>}</div></div>
    {current.status==='loading'?<p role="status">현재 프로젝트와 제작 명세를 읽는 중…</p>:null}
    {current.status==='error'?<div role="alert"><p>{current.error}</p><button onClick={()=>void controller.open(projectId,revision)}>재시도</button></div>:null}
    {current.status==='ready'?<Report report={current.report}/>:null}
  </section>;
}
