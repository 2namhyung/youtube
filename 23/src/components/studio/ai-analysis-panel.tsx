'use client';

import {useEffect,useRef,useState} from 'react';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {AnalysisProposal} from '../../../visualmaker/core/ai-analysis.ts';
import {acceptAIReport,boundedAIJson,currentAIActionJob,currentAIEnqueueJob,currentAIProposal,currentAIReport,retainedAIEnqueueRequest,withAIJobAcknowledgement} from './ai-analysis-client.ts';
import type {AIEnqueueRequest,AIJob,AIReport} from './ai-analysis-client.ts';
import {analysisAdoptionRows,currentAIAdoptionResponse,newAIAdoptionRequest,submitAIAdoption} from './ai-analysis-adoption-client.ts';

const REPORT_LIMIT=500_000,PROPOSAL_LIMIT=250_000,COMMAND_LIMIT=16_000;
const statusText:Record<string,string>={queued:'실행 대기',running:'실행 중',succeeded:'결과 저장',failed:'호출 전 실패',cancelled:'취소',
  'needs-review':'호출 결과 확인 필요'};

type StudioScope={projectId:string;revision:number;scriptSha256:string;token:string};
export default function AIAnalysisPanel({plan,token,busy,beginAdoption,currentScope,onAdopted}:{plan:Plan;token:string;busy:boolean;
  beginAdoption:()=>null|(()=>void);currentScope:()=>StudioScope;onAdopted:(plan:Plan)=>void}){
  const [report,setReport]=useState<AIReport|null>(null),[proposal,setProposal]=useState<AnalysisProposal|null>(null);
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[refresh,setRefresh]=useState(0);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null);
  const [transmission,setTransmission]=useState(false),[billing,setBilling]=useState(false);
  const maxOutputTokens=2048;
  const [timeoutMs,setTimeoutMs]=useState(60000);
  const [pending,setPending]=useState<AIEnqueueRequest|null>(null),[accepted,setAccepted]=useState<AIJob|null>(null);
  const [selectedSegments,setSelectedSegments]=useState<string[]>([]),[confirmReset,setConfirmReset]=useState(false);
  const actionRef=useRef<AbortController|null>(null),planRef=useRef(plan),reportEpochRef=useRef(0),acceptedRef=useRef<AIJob|null>(null);
  planRef.current=plan;
  const projectId=plan.id,revision=plan.revision,scriptSha256=plan.script.rawSha256;
  const scopeQuery=new URLSearchParams({projectId,baseRevision:String(revision)});
  const jobs=report?.jobs??[];
  const polling=jobs.some(job=>job.status==='queued'||job.status==='running');
  const selected=jobs.find(job=>job.jobId===selectedId)??(accepted?.jobId===selectedId?accepted:null);
  const adoptionRows=proposal?analysisAdoptionRows(plan,proposal):[];

  async function receive(response:Response,max:number,signal:AbortSignal):Promise<unknown>{
    const value=await boundedAIJson(response,max,signal);
    if(!response.ok)throw new Error('AI 분석 요청을 처리하지 못했습니다. 작업 상태를 다시 확인하세요.');
    return value;
  }
  async function readReport(signal:AbortSignal):Promise<{value:AIReport|null;ticket:number}>{
    const ticket=++reportEpochRef.current;
    try{const response=await fetch(`/api/studio/ai-analysis?${scopeQuery}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal});
      const parsed=await currentAIReport(await receive(response,REPORT_LIMIT,signal),planRef.current);
      if(!parsed)throw new Error('현재 대본의 AI 분석 상태가 아닙니다.');
      return {value:ticket===reportEpochRef.current?parsed:null,ticket};
    }catch(reason){if(ticket!==reportEpochRef.current)return {value:null,ticket};throw reason;}
  }
  function acceptRead(result:{value:AIReport|null;ticket:number}){
    if(result.value)setReport(current=>acceptAIReport(current,result.value!,result.ticket,reportEpochRef.current,acceptedRef.current));
  }
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setProposal(null);setSelectedSegments([]);setConfirmReset(false);setError('');
    void readReport(controller.signal).then(value=>{if(!controller.signal.aborted)acceptRead(value);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'AI 분석 상태를 읽지 못했습니다.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>{controller.abort();actionRef.current?.abort();};
  // The parent keys this component by project, revision, script hash and token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,revision,scriptSha256,token,refresh]);
  useEffect(()=>{
    if(!polling)return;
    const controller=new AbortController();let inFlight=false;
    const timer=setInterval(()=>{if(inFlight||controller.signal.aborted||actionRef.current)return;inFlight=true;
      void readReport(controller.signal).then(value=>{if(!controller.signal.aborted)acceptRead(value);})
        .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'AI 작업 상태를 읽지 못했습니다.');})
        .finally(()=>{inFlight=false;});},3000);
    return()=>{controller.abort();clearInterval(timer);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[polling,projectId,revision,scriptSha256,token]);

  async function enqueue(){
    if(working||actionRef.current||busy||loading||!pending&&(!report?.capability.available||!report.capability.modelId||!transmission||!billing))return;
    const request=retainedAIEnqueueRequest(pending,{plan,modelId:report?.capability.modelId??pending?.expectedModelId??'',
      maxOutputTokens,timeoutMs,idempotencyKey:pending?.idempotencyKey??crypto.randomUUID()});
    if(!request){setError('AI 분석 요청 한도를 확인하세요.');return;}
    setPending(request);setWorking(true);setError('');setNotice('');const controller=new AbortController();actionRef.current=controller;
    try{
      const response=await fetch('/api/studio/ai-analysis',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
        body:JSON.stringify(request),cache:'no-store',signal:controller.signal});
      const saved=await currentAIEnqueueJob(await receive(response,COMMAND_LIMIT,controller.signal),planRef.current,request);
      if(response.status!==201||!saved||controller.signal.aborted)throw new Error('AI 분석 요청 결과를 현재 대본과 결속하지 못했습니다.');
      ++reportEpochRef.current;acceptedRef.current=saved;setAccepted(saved);setSelectedId(saved.jobId);
      setReport(current=>withAIJobAcknowledgement(current,saved));setPending(null);setTransmission(false);setBilling(false);
      setNotice(saved.status==='queued'?'AI 분석 요청을 저장했습니다. 실행 버튼을 눌러 별도로 시작하세요.':'저장된 요청 상태를 확인했습니다. 자동 재실행하지 않습니다.');
      try{acceptRead(await readReport(controller.signal));}catch{if(!controller.signal.aborted)setNotice('요청은 저장됐지만 목록 갱신에 실패했습니다. 상태 다시 확인을 누르세요.');}
    }catch(reason){if(!controller.signal.aborted)setError(`${reason instanceof Error?reason.message:'AI 분석 요청을 확인하지 못했습니다.'} 동일한 요청 키와 설정으로 다시 확인할 수 있습니다.`);}
    finally{if(actionRef.current===controller){actionRef.current=null;setWorking(false);}}
  }
  async function act(job:AIJob,action:'run'|'cancel'|'recover'){
    if(working||actionRef.current||busy||!report?.jobs.some(item=>item.jobId===job.jobId)||action==='run'&&(!report.capability.available||job.stale||job.status!=='queued')||
      action==='cancel'&&!['queued','running'].includes(job.status)||action==='recover'&&job.status!=='running')return;
    ++reportEpochRef.current;setWorking(true);setError('');setNotice('');const controller=new AbortController();actionRef.current=controller;
    try{
      const response=await fetch('/api/studio/ai-analysis',{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
        body:JSON.stringify({action,projectId,baseRevision:revision,jobId:job.jobId}),cache:'no-store',signal:controller.signal});
      const saved=currentAIActionJob(await receive(response,COMMAND_LIMIT,controller.signal),job,planRef.current,action);
      if(response.status!==(action==='run'?202:200)||!saved||controller.signal.aborted)throw new Error('다른 AI 분석 작업의 응답입니다.');
      const acknowledged={...saved,stale:job.stale};acceptedRef.current=acknowledged;setAccepted(acknowledged);
      setReport(current=>withAIJobAcknowledgement(current,acknowledged));
      setNotice(action==='run'?'AI 분석 실행을 요청했습니다. 상태를 확인하세요.':action==='cancel'?
        '취소 상태를 확인했습니다. 이미 시작된 외부 처리와 비용은 계속될 수 있습니다.':'중단 복구 상태를 확인했습니다.');
      try{acceptRead(await readReport(controller.signal));}catch{if(!controller.signal.aborted)setNotice('작업 상태는 저장됐지만 목록 갱신에 실패했습니다. 상태 다시 확인을 누르세요.');}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'AI 작업 명령에 실패했습니다.');}
    finally{if(actionRef.current===controller){actionRef.current=null;setWorking(false);}}
  }
  async function inspect(job:AIJob){
    if(working||actionRef.current||busy||job.stale||job.status!=='succeeded')return;
    setWorking(true);setError('');setProposal(null);setSelectedSegments([]);setConfirmReset(false);setSelectedId(job.jobId);const controller=new AbortController();actionRef.current=controller;
    try{
      const query=new URLSearchParams({projectId,baseRevision:String(revision),jobId:job.jobId,format:'proposal'});
      const response=await fetch(`/api/studio/ai-analysis?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      const value=await currentAIProposal(await receive(response,PROPOSAL_LIMIT,controller.signal),job,planRef.current);
      if(!value||controller.signal.aborted)throw new Error('현재 대본과 결속된 AI 제안이 아닙니다.');
      setProposal(value);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'AI 제안을 확인하지 못했습니다.');}
    finally{if(actionRef.current===controller){actionRef.current=null;setWorking(false);}}
  }
  async function adopt(){
    if(working||actionRef.current||busy||loading||!proposal||!selected||!selected.artifact||
      selected.status!=='succeeded'||selected.stale||selectedSegments.length<1||!confirmReset)return;
    const release=beginAdoption();if(!release)return;
    const controller=new AbortController();actionRef.current=controller;setWorking(true);setError('');setNotice('');
    const started:StudioScope={projectId,revision,scriptSha256,token};
    try{
      const request=await newAIAdoptionRequest(plan,proposal,selected,selectedSegments,confirmReset);
      if(!request||controller.signal.aborted||JSON.stringify(started)!==JSON.stringify(currentScope()))
        throw new Error('현재 계획의 선택과 제안 결속을 다시 확인하세요.');
      const value=await submitAIAdoption(request,token,controller.signal);
      const saved=await currentAIAdoptionResponse(value,plan,selected,proposal,request,started,currentScope());
      if(!saved||controller.signal.aborted)throw new Error('저장 응답을 검토한 제안과 결속하지 못했습니다.');
      onAdopted(saved.plan);
    }catch(reason){if(!controller.signal.aborted)setError(`${reason instanceof Error?reason.message:'AI 제안 반영 결과를 확인하지 못했습니다.'} 자동으로 다시 보내지 않습니다. 현재 프로젝트를 다시 불러와 저장 이력을 확인하세요.`);}
    finally{if(actionRef.current===controller){actionRef.current=null;setWorking(false);}release();}
  }
  const canCreate=(!!pending||!!report?.capability.available&&!!report.capability.modelId)&&!busy&&!working&&!loading;
  return <section className="vm-readiness" aria-label="AI 대본 분석 검토">
    <div className="vm-section-heading"><h2>AI 대본 분석</h2><span>명시적 요청 · 검토용 제안</span></div>
    <p className="vm-help">로컬 규칙 기반 장면 제안과 별도입니다. 설정된 모델에 대본이 전송될 수 있고 비용은 알 수 없습니다. 준비 표시는 설정과 입력 조건만 확인하며 모델 응답은 검증하지 않습니다. 결과는 제작 승인이나 자동 채택이 아닙니다.</p>
    {loading?<p role="status">AI 분석 상태 확인 중…</p>:null}
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {report?<><p role="status">모델 {report.capability.modelId??'설정 없음'} · {report.capability.available?'설정·입력 준비':'사용 불가'} · 외부 모델 검증 전 · 비용 미확정</p>
      {!report.capability.available?<p>{report.capability.reason==='input-limit'?'대본 길이 또는 구간 수가 제한을 넘었습니다.':'AI 모델 설정이 필요합니다.'}</p>:null}
      <p className="vm-help">입력 한도: 대본 {report.limits.maxScriptUnits}자, 구간 {report.limits.minSegments}–{report.limits.maxSegments}개. 제한 시간 {report.limits.minTimeoutMs}–{report.limits.maxTimeoutMs}ms. 내부 요청 기록에는 출력 토큰 값 2048을 사용하지만 Codex CLI의 실제 출력량이나 과금 상한으로 강제되지는 않습니다.</p>
      <div className="vm-tools">
        <label>제한 시간(ms)<input type="number" min={10} max={120000} step={1} value={timeoutMs} disabled={!!pending||working} onChange={event=>setTimeoutMs(Number(event.target.value))}/></label></div>
      <label><input type="checkbox" checked={transmission} disabled={!!pending||working} onChange={event=>setTransmission(event.target.checked)}/> 대본의 외부 전송에 동의합니다.</label>
      <label><input type="checkbox" checked={billing} disabled={!!pending||working} onChange={event=>setBilling(event.target.checked)}/> 비용 발생 가능성을 확인하고 동의합니다.</label>
      {pending?<p role="status">요청 결과가 불명확합니다. 같은 키와 설정으로만 다시 확인합니다. 새 유료 요청은 만들지 않습니다.</p>:null}
      <div className="vm-tools"><button type="button" disabled={working||busy} onClick={()=>setRefresh(value=>value+1)}>상태 다시 확인</button>
        <button type="button" disabled={!canCreate||!pending&&(!transmission||!billing||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<512||maxOutputTokens>8192||!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>120000)} onClick={()=>void enqueue()}>{pending?'같은 요청 확인':'AI 분석 요청 만들기'}</button></div>
      {jobs.length?<ul>{jobs.map(job=><li key={job.jobId}><span>{statusText[job.status]} · {job.requestedModelId} · 리비전 {job.requestedRevision}{job.stale?' · 이전 대본':''}</span>
        {job.status==='queued'&&!job.stale?<button type="button" aria-label={`${job.jobId} 리비전 ${job.requestedRevision} AI 분석 실행`} disabled={busy||working||!report.capability.available} onClick={()=>void act(job,'run')}>AI 분석 실행</button>:null}
        {['queued','running'].includes(job.status)?<button type="button" aria-label={`${job.jobId} 리비전 ${job.requestedRevision} AI 분석 취소`} disabled={busy||working} onClick={()=>void act(job,'cancel')}>취소</button>:null}
        {job.status==='running'?<button type="button" aria-label={`${job.jobId} 리비전 ${job.requestedRevision} AI 분석 중단 복구 확인`} disabled={busy||working} onClick={()=>void act(job,'recover')}>중단 복구 확인</button>:null}
        {job.status==='succeeded'&&!job.stale?<button type="button" aria-label={`${job.jobId} 리비전 ${job.requestedRevision} AI 제안 검토`} disabled={busy||working} onClick={()=>void inspect(job)}>제안 검토</button>:null}
        {job.status==='needs-review'?<p role="status">외부 처리와 청구 여부를 확인한 뒤 새 요청이 필요하면 별도로 동의하세요.</p>:null}</li>)}</ul>:<p>AI 분석 작업이 없습니다.</p>}
    </>:null}
    {proposal&&selected?.jobId===proposal.requestId&&!selected.stale?<div aria-label="AI 구간별 제안"><h3>구간별 제안 · 사용자 검토 전</h3>
      {proposal.model.adapter==='sdk-test'?<p role="status">합성 테스트 응답입니다. 실제 AI 품질 근거가 아닙니다.</p>:null}
      {adoptionRows.map((row,index)=><article key={row.record.segmentId}><h4>원문 {index+1} · {row.record.segmentId}</h4>
        <label><input type="checkbox" checked={selectedSegments.includes(row.record.segmentId)}
          disabled={busy||working||loading||!!row.reason} onChange={event=>setSelectedSegments(current=>event.target.checked?
            [...current,row.record.segmentId]:current.filter(id=>id!==row.record.segmentId))}/>
          이 구간의 핵심 메시지를 계획에 반영</label>
        {row.reason?<p role="status">반영 불가: {row.reason}</p>:null}
        <p>구간 유형: {row.record.source.kind} · 원문 위치 {row.record.source.start}–{row.record.source.end}</p>
        <blockquote>{row.record.source.text}</blockquote>
        <p>현재 전달 목표: {row.beat?.intent??'연결된 목표 없음'}</p><p>제안 핵심 메시지: {row.record.mainMessage}</p>
        <p>불확실성: {row.record.uncertainty}</p><p>화면 의미: {row.record.visualMeaningBrief}</p>
        <p>한국어 검색 제안: {row.record.searchBriefKo}</p><p>영어 검색 제안: {row.record.searchBriefEn}</p></article>)}
      <p className="vm-help">반영하려는 구간을 모두 고른 뒤 한 번에 저장하세요. 저장하면 계획 리비전이 바뀌어 이 작업의 나머지 제안은 그대로 다시 반영할 수 없습니다.</p>
      <label><input type="checkbox" checked={confirmReset} disabled={busy||working||loading}
        onChange={event=>setConfirmReset(event.target.checked)}/>
        선택한 메시지가 바뀌면 해당 장면의 초안 표현 대안과 자료 요구를 다시 만들고, 선택한 표현 방향을 해제하는 것을 확인했습니다.</label>
      <div className="vm-tools"><button type="button" className="vm-primary" disabled={busy||working||loading||!selected.artifact||
        selectedSegments.length===0||!confirmReset||selectedSegments.some(id=>adoptionRows.find(row=>row.record.segmentId===id)?.reason)}
        onClick={()=>void adopt()}>선택한 {selectedSegments.length}개 구간을 계획에 반영</button></div>
      <p className="vm-help">AI 제안은 사실·자료·권리·화면 문법이나 제작 PASS를 인증하지 않습니다.</p></div>:null}
    {plan.aiAnalysisAdoption?<section aria-label="AI 분석 반영 이력"><h3>AI 분석 반영 이력 · 계획 기록</h3>
      <p>작업 {plan.aiAnalysisAdoption.jobId} · 계획 리비전 {plan.aiAnalysisAdoption.beforeRevision} → {plan.aiAnalysisAdoption.afterRevision} · {plan.aiAnalysisAdoption.createdAt}</p>
      <p>제안 모델: {plan.aiAnalysisAdoption.model.requestedModelId} · 결과 파일 SHA-256 {plan.aiAnalysisAdoption.artifactSha256}</p>
      {plan.aiAnalysisAdoption.model.adapter==='sdk-test'?<p role="status">합성 테스트 모델 결과입니다. 실제 모델 품질 근거가 아닙니다.</p>:null}
      {plan.revision!==plan.aiAnalysisAdoption.afterRevision||plan.script.rawSha256!==plan.aiAnalysisAdoption.scriptSha256?
        <p role="status">이 기록은 이전 계획·대본의 반영 이력이며 현재 내용에 대한 승인으로 볼 수 없습니다.</p>:null}
      <ol>{plan.aiAnalysisAdoption.records.map(record=><li key={record.segmentId}><p>원문: {record.source.text}</p>
        <p>이전 전달 목표: {record.beforeIntent}</p><p>반영한 핵심 메시지: {record.appliedIntent}</p>
        <p>불확실성: {record.uncertainty}</p><p>화면 의미: {record.visualMeaningBrief}</p>
        <p>한국어 검색 제안: {record.searchBriefKo}</p><p>영어 검색 제안: {record.searchBriefEn}</p></li>)}</ol>
      <p className="vm-help">사용자가 계획에 반영한 내용입니다. 사실·자료·권리·화면 문법·제작 승인을 뜻하지 않습니다.</p></section>:null}
  </section>;
}
