'use client';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {currentWiseRequest,validWiseImport,validWiseSearch} from './wise-source-client';
import type {WiseCard,WiseImport,WiseScope,WiseSearch} from './wise-source-client';

type Props={scope:WiseScope;token:string;busy:boolean;eligible:boolean;focal:boolean;kind:'image'|'video';
  queryKo:string;queryEn:string;beginMutation:()=>null|(()=>void);onImported:(result:WiseImport,scope:WiseScope)=>void};
export default function WiseSource({scope,token,busy,eligible,focal,kind,queryKo,queryEn,beginMutation,onImported}:Props){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<WiseSearch|null>(null);
  const [selected,setSelected]=useState<WiseCard|null>(null),[note,setNote]=useState(''),[evidenceOnly,setEvidenceOnly]=useState(false);
  const [phase,setPhase]=useState<'idle'|'searching'|'importing'>('idle'),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),epoch=useRef(0),scopeRef=useRef(scope),phaseRef=useRef<'idle'|'searching'|'importing'>('idle');
  scopeRef.current=scope;
  const changePhase=(next:'idle'|'searching'|'importing')=>{phaseRef.current=next;setPhase(next);};
  const invalidate=()=>{epoch.current++;controller.current?.abort();controller.current=null;changePhase('idle');setResults(null);setSelected(null);setError('');};
  useEffect(()=>()=>{epoch.current++;controller.current?.abort();},[scope.projectId,scope.revision,scope.requirementId,scope.scriptSha256]);
  const current=(started:number,abort:AbortController,expected:WiseScope)=>
    currentWiseRequest(expected,scopeRef.current,started,epoch.current,abort.signal.aborted);
  const start=()=>{controller.current?.abort();const abort=new AbortController();controller.current=abort;return {abort,started:++epoch.current};};
  async function request(endpoint:string,body:object,abort:AbortController){
    const response=await fetch(endpoint,{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
      cache:'no-store',signal:abort.signal,body:JSON.stringify(body)});
    const data:unknown=await response.json();
    if(!response.ok)throw new Error(data&&typeof data==='object'&&'error'in data&&typeof data.error==='string'?data.error:'WISE 요청에 실패했습니다.');
    return data;
  }
  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const submitted=query.trim();
    if(!eligible||busy||phaseRef.current!=='idle'||submitted.length<2||submitted.length>120||submitted!==query||/[\r\n]/.test(query))return;
    invalidate();const expected={...scope},{abort,started}=start();changePhase('searching');
    try{const data=await request('/api/studio/wise-search',{projectId:expected.projectId,baseRevision:expected.revision,
      requirementId:expected.requirementId,scriptSha256:expected.scriptSha256,query:submitted},abort);
      if(!current(started,abort,expected))return;
      if(!validWiseSearch(data,expected,submitted,kind))throw new Error('WISE 결과가 현재 자료 요구와 맞지 않습니다.');
      setResults(data);
    }catch(cause){if(current(started,abort,expected))setError(cause instanceof Error?cause.message:'WISE 자료를 검색하지 못했습니다.');}
    finally{if(current(started,abort,expected)){controller.current=null;changePhase('idle');}}
  }
  async function importSource(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!eligible||busy||phaseRef.current!=='idle'||!selected||!results||!note.trim()||focal&&evidenceOnly)return;
    const expected={...scope},candidate=selected;
    if(!validWiseSearch(results,expected,results.query,kind)||!results.candidates.some(item=>item.selectionToken===candidate.selectionToken))return;
    const release=beginMutation();if(!release)return;
    const {abort,started}=start();changePhase('importing');setError('');
    try{const data=await request('/api/studio/wise-import',{projectId:expected.projectId,baseRevision:expected.revision,
      requirementId:expected.requirementId,scriptSha256:expected.scriptSha256,sourceId:candidate.sourceId,
      wiseMediaId:candidate.wiseMediaId,sha256:candidate.sha256,metadataSha256:candidate.metadataSha256,
      selectedSpan:candidate.selectedSpan,selectionToken:candidate.selectionToken,semanticNote:note,evidenceOnly},abort);
      if(!current(started,abort,expected))return;
      if(!validWiseImport(data,expected,candidate))throw new Error('WISE 등록 결과를 대조할 수 없습니다.');
      onImported(data,expected);
    }catch(cause){if(current(started,abort,expected)){setSelected(null);setResults(null);
      setError(`${cause instanceof Error?cause.message:'WISE 원본을 등록하지 못했습니다.'} 프로젝트를 다시 불러와 연결 상태를 확인하세요.`);}}
    finally{release();if(current(started,abort,expected)){controller.current=null;changePhase('idle');}}
  }
  if(!eligible)return null;
  return <section className="vm-live-source" aria-label={`자료 요구 ${scope.requirementId} · WISE 로컬 자료실 검색`}>
    <button type="button" aria-expanded={open} disabled={busy} onClick={()=>{invalidate();setOpen(!open);}}>WISE 로컬 자료실 검색·연결</button>
    {open?<div><p className="vm-help">기존 자료실에서 WISE가 색인한 원본의 의미·구간을 검색합니다. YouTube 공개 영상 검색과는 별개이며, 자료실과 WISE 서비스가 준비되어 있어야 합니다. 검색 결과는 제작 승인 자료가 아닙니다.</p>
      <div className="vm-search-brief"><small>장면 자료 검색 지시</small><p>{queryKo}</p><p lang="en">{queryEn}</p>
        <button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(queryKo.slice(0,120).trim());}}>한국어 검색어 채우기</button>
        <button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(queryEn.slice(0,120).trim());}}>영어 검색어 채우기</button></div>
      <form onSubmit={event=>void search(event)}><label>WISE 의미 검색어<input type="text" value={query} required minLength={2} maxLength={120}
        disabled={busy||phase!=='idle'} onChange={event=>{invalidate();setQuery(event.target.value);}}/></label>
        <button type="submit" disabled={busy||phase!=='idle'||query.trim().length<2||query.trim()!==query}>로컬 색인 검색</button></form>
      {phase==='searching'?<p role="status">WISE에서 자료를 찾고 원본 바이트를 확인하는 중…</p>:null}
      {results?<div className="vm-search-brief"><p>WISE 적중 {results.counts.hits} · 원본 검증 {results.counts.verified} · 미확인 {results.counts.unresolved}</p>
        {results.candidates.length===0?<p>검증된 후보가 없습니다. 검색어 또는 로컬 색인 상태를 확인하세요.</p>:null}
        {results.candidates.map(card=><div key={card.selectionToken}><strong>{card.title}</strong>
          <p>{card.creator} · {card.kind==='video'?`${card.selectedSpan.startSeconds.toFixed(1)}–${card.selectedSpan.endSeconds.toFixed(1)}초 / 원본 ${card.durationSeconds?.toFixed(1)}초`:'사진'}</p>
          <p>{card.license}{card.rightsConfirmed?' · 기존 자료실 사용 조건 확인 기록 있음':' · 기존 자료실 사용 조건 미확인'} · VisualMaker 검토 대기</p>
          {card.rightsEvidence?<p>{card.rightsEvidence}</p>:null}
          <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer">원본 출처 확인 ↗</a>
          {card.licenseUrl?<a href={card.licenseUrl} target="_blank" rel="noopener noreferrer">사용 조건 확인 ↗</a>:null}
          <button type="button" disabled={busy||phase!=='idle'} aria-pressed={selected?.selectionToken===card.selectionToken}
            onClick={()=>{setSelected(card);setError('');}}>이 원본 선택</button></div>)}</div>:null}
      {selected?<form onSubmit={event=>void importSource(event)}><p>선택한 원본: {selected.title}</p>
        <label>이 장면과 맞는 대상·행동·구간<textarea value={note} required maxLength={4000} rows={3}
          disabled={busy||phase!=='idle'} onChange={event=>setNote(event.target.value)}/></label>
        <label>용도<select value={String(evidenceOnly)} disabled={busy||phase!=='idle'} onChange={event=>setEvidenceOnly(event.target.value==='true')}>
          <option value="false">화면용 원본 후보</option><option value="true">화면 밖 근거 전용</option></select></label>
        {focal&&evidenceOnly?<p role="status">핵심 화면 요구에는 근거 전용 자료를 연결할 수 없습니다.</p>:null}
        <button type="submit" disabled={busy||phase!=='idle'||!note.trim()||focal&&evidenceOnly}>선택한 원본 연결</button></form>:null}
      {phase==='importing'?<p role="status">자료실 원본 바이트와 구간을 다시 확인하고 등록하는 중…</p>:null}
      {phase!=='idle'?<button type="button" onClick={()=>{invalidate();setError('요청을 취소했습니다.');}}>취소</button>:null}
      {error?<p role="alert">{error}</p>:null}
    </div>:null}
  </section>;
}
