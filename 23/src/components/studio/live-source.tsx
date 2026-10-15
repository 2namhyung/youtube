'use client';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {currentLiveRequest,liveAcquireBody,liveProviderSupports,validLiveAcquire,validLiveSearch} from './live-source-client';
import type {LiveAcquire,LiveCandidate,LiveMediaType,LiveProvider,LiveQuery,LiveScope,LiveSearch} from './live-source-client';
import {selectedBriefQuery} from './adopted-source-brief';
import type {AdoptedSourceBrief} from './adopted-source-brief';

type Props={scope:LiveScope;token:string;mediaType:LiveMediaType|'data';acquisition:string;locked:boolean;hasAsset:boolean;
  focal:boolean;busy:boolean;adoptedBrief:AdoptedSourceBrief|null;
  onAcquired:(result:LiveAcquire,scope:LiveScope)=>void;beginMutation:()=>null|(()=>void)};
const providers:{value:LiveProvider;label:string}[]=[{value:'wikimedia',label:'Wikimedia Commons'},
  {value:'nasa',label:'NASA Image Library'},{value:'loc',label:'Library of Congress'}];

export default function LiveSource({scope,token,mediaType,acquisition,locked,hasAsset,focal,busy,adoptedBrief,onAcquired,beginMutation}:Props){
  const [open,setOpen]=useState(false),[provider,setProvider]=useState<LiveProvider>('wikimedia');
  const [chosenType,setChosenType]=useState<LiveMediaType>(mediaType==='video'?'video':'image');
  const [query,setQuery]=useState(''),[page,setPage]=useState(1);
  const [list,setList]=useState<LiveSearch|null>(null),[selectedId,setSelectedId]=useState<string|null>(null);
  const [semanticNote,setSemanticNote]=useState(''),[evidenceOnly,setEvidenceOnly]=useState(false);
  const [error,setError]=useState(''),[phase,setPhase]=useState<'idle'|'searching'|'acquiring'>('idle');
  const requestRef=useRef<AbortController|null>(null),epochRef=useRef(0),scopeRef=useRef(scope);
  scopeRef.current=scope;
  const eligible=(mediaType==='image'||mediaType==='video')&&['external','official'].includes(acquisition)&&!locked&&!hasAsset;
  const typeMatches=chosenType===mediaType,providerSupports=liveProviderSupports(provider,chosenType);
  const queryLength=query.trim().length,queryValid=queryLength>=2&&queryLength<=120&&
    !/[\u0000-\u001f\u007f]/u.test(query);
  const chosen=list?.candidates.find(item=>item.providerId===selectedId)??null;
  function invalidate(){epochRef.current+=1;requestRef.current?.abort();requestRef.current=null;setPhase('idle');setList(null);setSelectedId(null);setError('');}
  useEffect(()=>()=>{epochRef.current+=1;requestRef.current?.abort();requestRef.current=null;},
    [scope.projectId,scope.revision,scope.requirementId,scope.scriptSha256,token]);
  async function request(path:string,init:RequestInit){const response=await fetch(path,{...init,cache:'no-store',headers:{'x-visualmaker-token':token,...init.headers}});
    const body:unknown=await response.json();if(!response.ok)throw new Error(isErrorBody(body)?body.error:'제공처 요청에 실패했습니다.');return body;}
  function start(){requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;const epoch=++epochRef.current;return {controller,epoch};}
  function current(epoch:number,controller:AbortController,expected:LiveScope){return currentLiveRequest(expected,scopeRef.current,epoch,epochRef.current,controller.signal.aborted);}
  async function search(event:FormEvent<HTMLFormElement>){event.preventDefault();invalidate();if(!eligible||!typeMatches||!providerSupports)return;
    const terms=query.trim();if(!queryValid||!Number.isSafeInteger(page)||page<1||page>20){setError('검색어는 줄바꿈·제어문자 없이 2–120자, 페이지는 1–20으로 입력하세요.');return;}
    const expected={...scope},criteria:LiveQuery={provider,mediaType:chosenType,query:terms,page};const {controller,epoch}=start();setPhase('searching');
    try{const params=new URLSearchParams({projectId:scope.projectId,baseRevision:String(scope.revision),requirementId:scope.requirementId,
      provider,query:terms,page:String(page),mediaType:chosenType});
      const body=await request(`/api/studio/source-search?${params}`,{signal:controller.signal});
      if(!current(epoch,controller,expected))return;
      if(!validLiveSearch(body,expected,criteria))throw new Error('현재 작업 범위와 일치하지 않는 탐색 응답입니다.');
      setList(body);
    }catch(cause){if(current(epoch,controller,expected))setError(cause instanceof Error?cause.message:'자료 탐색에 실패했습니다.');}
    finally{if(current(epoch,controller,expected)){requestRef.current=null;setPhase('idle');}}
  }
  async function acquire(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!chosen||!list||!eligible||!typeMatches||!providerSupports||busy||phase!=='idle'||
      !semanticNote.trim()||focal&&evidenceOnly)return;
    const expected={...scope},selection=chosen,criteria:LiveQuery={provider:list.provider,mediaType:list.mediaType,query:list.query,page:list.page};
    if(!validLiveSearch(list,expected,criteria)){invalidate();setError('검색 결과가 현재 작업과 달라 다시 탐색해야 합니다.');return;}
    const release=beginMutation();if(!release)return;
    const {controller,epoch}=start();setError('');setPhase('acquiring');
    try{const body=await request('/api/studio/source-acquire',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify(liveAcquireBody(expected,criteria,selection,semanticNote,evidenceOnly))});
      if(!current(epoch,controller,expected))return;
      if(!validLiveAcquire(body,expected,selection))throw new Error('수집 결과를 현재 작업과 대조할 수 없습니다. 페이지를 새로고침해 자료 연결 상태를 확인하세요. 다시 수집하지 마세요.');
      onAcquired(body,expected);
    }catch(cause){if(current(epoch,controller,expected)){setList(null);setSelectedId(null);setError(`${cause instanceof Error?cause.message:'선택한 자료를 수집하지 못했습니다.'} 현재 프로젝트 상태를 새로고침해 확인한 뒤 다시 진행하세요.`);}}
    finally{release();if(current(epoch,controller,expected)){requestRef.current=null;setPhase('idle');}}
  }
  const reason=hasAsset?'이미 자료가 연결되어 있습니다.':locked?'이 자료 요구를 사용하는 장면이 잠겨 있습니다.':
    mediaType==='data'?'근거 데이터는 이 탐색에서 지원하지 않습니다.':acquisition==='generated-keyframe'?'가상 키프레임은 외부 자료 탐색 대상이 아닙니다.':
    !eligible?'이 자료 요구의 수집 방식은 아직 연결되지 않았습니다.':'';
  return <section className="vm-live-source" aria-label={`자료 요구 ${scope.requirementId} · 제공처에서 자료 찾기`}>
    <button type="button" aria-expanded={open} disabled={!eligible||busy} onClick={()=>{if(open)invalidate();setOpen(!open);}}>제공처에서 자료 찾기</button>
    {reason?<p className="vm-help" role="status">{reason}</p>:null}
    {open?<div><p className="vm-help">명시적으로 입력한 검색어만 제공처에 보냅니다. 검색 결과의 사용 조건은 항목별로 확인해야 합니다.</p>
      {adoptedBrief?<div className="vm-search-brief"><small>기획에 반영한 AI 검색 제안 · 검증 전 · 직접 확인 후 사용</small>
        <p lang="ko">{adoptedBrief.ko}</p><button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(selectedBriefQuery(adoptedBrief,'ko'));}}>한국어 제안을 검색어에 넣기</button>
        <p lang="en">{adoptedBrief.en}</p><button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(selectedBriefQuery(adoptedBrief,'en'));}}>영어 제안을 검색어에 넣기</button>
        <p className="vm-help">제안을 넣어도 검색은 시작되지 않습니다. 검색어를 확인한 뒤 후보 찾기를 누르세요.</p></div>:null}
      <form onSubmit={event=>void search(event)}><label>자료 제공처<select value={provider} disabled={phase!=='idle'||busy} onChange={event=>{invalidate();setProvider(event.target.value as LiveProvider);}}>
        {providers.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>자료 유형<select value={chosenType} disabled={phase!=='idle'||busy} onChange={event=>{invalidate();setChosenType(event.target.value as LiveMediaType);}}>
          <option value="image">사진</option><option value="video">영상</option></select></label>
        <label>검색어<textarea value={query} onChange={event=>{invalidate();setQuery(event.target.value);}} rows={3} required/></label>
        {!queryValid&&query.length>0?<p role="status">검색어는 2–120자이고 줄바꿈·제어문자가 없어야 합니다. 현재 {queryLength}자입니다. 긴 AI 제안이나 여러 줄 제안은 직접 다듬어 주세요.</p>:null}
        <label>검색 페이지 (1–20)<input type="number" min={1} max={20} step={1} value={page} onChange={event=>{invalidate();setPage(Number(event.target.value));}} required/></label>
        {!typeMatches?<p role="status">이 요구는 {mediaType==='image'?'사진':'영상'} 자료만 받을 수 있습니다.</p>:null}
        {!providerSupports?<p role="status">이 제공처의 영상 탐색은 현재 지원하지 않습니다. Wikimedia Commons 영상을 선택할 수 있습니다.</p>:null}
        <div className="vm-live-actions"><button type="submit" disabled={busy||phase!=='idle'||!typeMatches||!providerSupports||!queryValid||page<1||page>20}>후보 찾기</button>
          {phase!=='idle'?<button type="button" onClick={()=>{invalidate();setError('요청을 취소했습니다.');}}>취소</button>:null}</div></form>
      {phase==='searching'?<p role="status">제공처 후보를 확인하는 중…</p>:null}
      {list&&phase!=='searching'?<><p role="status">{list.candidates.length?`${list.candidates.length}개 후보 · 메타데이터만 확인했습니다.`:'검색 결과가 없습니다. 검색어나 페이지를 조정하세요.'}</p>
        <div className="vm-live-results">{list.candidates.map(item=><article key={item.providerId}>
          <strong>{item.title||item.providerId}</strong><p>{item.publisher} · {item.mediaType==='image'?'사진':'영상'}{item.width&&item.height?` · ${item.width} × ${item.height}`:''}</p>
          <p>제작자: {item.creator||'미상'}</p><p>라이선스: {item.license||'미상'} · 권리 상태: {item.rightsStatus||'미상'}</p>
          <p>파일 등급: {item.variant.label}</p><a href={item.itemUrl} target="_blank" rel="noopener noreferrer">제공처 항목 확인 ↗</a>
          <button type="button" aria-label={`자료 요구 ${scope.requirementId} · ${item.title||'제목 없음'} · ${item.providerId} 후보 선택`} aria-pressed={selectedId===item.providerId} disabled={busy||phase!=='idle'} onClick={()=>{setSelectedId(item.providerId);setSemanticNote('');setEvidenceOnly(false);setError('');}}>이 후보 선택</button>
        </article>)}</div></>:null}
      {chosen&&phase!=='searching'?<form onSubmit={event=>void acquire(event)}><p className="vm-help">선택한 후보 한 파일만 수집합니다. 파일의 출처·권리·장면 의미는 수집 후 각각 검토 대기 상태입니다.</p>
        <label>대상·행동·구간 대응 메모<textarea value={semanticNote} onChange={event=>setSemanticNote(event.target.value)} required maxLength={4000} rows={3}/></label>
        <label>자료 용도<select value={String(evidenceOnly)} onChange={event=>setEvidenceOnly(event.target.value==='true')}>
          <option value="false">화면용 원본 후보 · 승인 전</option><option value="true">화면 밖 근거 확인 전용</option></select></label>
        {focal&&evidenceOnly?<p role="status">핵심 화면 요구에는 근거 전용 자료를 연결할 수 없습니다.</p>:null}
        <button type="submit" disabled={busy||phase!=='idle'||!semanticNote.trim()||focal&&evidenceOnly}>선택한 파일 수집 · 검토 대기</button>
        {phase==='acquiring'?<p role="status">선택한 파일을 검증하고 등록하는 중…</p>:null}</form>:null}
      {error?<p role="alert">{error}</p>:null}</div>:null}
  </section>;
}
function isErrorBody(value:unknown):value is {error:string}{return !!value&&typeof value==='object'&&'error'in value&&typeof value.error==='string'&&value.error.length<300;}
