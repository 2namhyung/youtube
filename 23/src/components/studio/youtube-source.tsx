'use client';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {currentYouTubeRequest,validYouTubeAcquire,validYouTubeInspect} from './youtube-source-client';
import type {YouTubeAcquire,YouTubeInspect,YouTubeScope} from './youtube-source-client';
import {validYouTubeDiscovery} from './youtube-discovery-client';
import type {YouTubeDiscovery} from './youtube-discovery-client';

type Props={scope:YouTubeScope;token:string;busy:boolean;eligible:boolean;focal:boolean;
  queryKo:string;queryEn:string;
  beginMutation:()=>null|(()=>void);onAcquired:(result:YouTubeAcquire,scope:YouTubeScope)=>void};
export default function YouTubeSource({scope,token,busy,eligible,focal,queryKo,queryEn,beginMutation,onAcquired}:Props){
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[checked,setChecked]=useState<YouTubeInspect|null>(null);
  const [query,setQuery]=useState(''),[discovery,setDiscovery]=useState<YouTubeDiscovery|null>(null);
  const [note,setNote]=useState(''),[evidenceOnly,setEvidenceOnly]=useState(false),[error,setError]=useState('');
  const [phase,setPhase]=useState<'idle'|'searching'|'inspecting'|'acquiring'>('idle');
  const controller=useRef<AbortController|null>(null),epoch=useRef(0),scopeRef=useRef(scope);
  const phaseRef=useRef<'idle'|'searching'|'inspecting'|'acquiring'>('idle');
  scopeRef.current=scope;
  const changePhase=(next:'idle'|'searching'|'inspecting'|'acquiring')=>{phaseRef.current=next;setPhase(next);};
  const invalidate=()=>{epoch.current++;controller.current?.abort();controller.current=null;changePhase('idle');setChecked(null);setDiscovery(null);setError('');};
  useEffect(()=>()=>{epoch.current++;controller.current?.abort();},[scope.projectId,scope.revision,scope.requirementId,scope.scriptSha256]);
  const current=(started:number,abort:AbortController,expected:YouTubeScope)=>
    currentYouTubeRequest(expected,scopeRef.current,started,epoch.current,abort.signal.aborted);
  const start=()=>{controller.current?.abort();const abort=new AbortController();controller.current=abort;return {abort,started:++epoch.current};};
  async function request(endpoint:string,body:object,abort:AbortController){
    const response=await fetch(endpoint,{method:'POST',headers:{'x-visualmaker-token':token,'Content-Type':'application/json'},
      cache:'no-store',signal:abort.signal,body:JSON.stringify(body)});
    const data:unknown=await response.json();if(!response.ok)throw new Error(data&&typeof data==='object'&&'error'in data&&typeof data.error==='string'?data.error:'YouTube 요청에 실패했습니다.');
    return data;
  }
  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!eligible||busy||phaseRef.current!=='idle'||query.trim().length<2)return;
    invalidate();const expected={...scope},submitted=query.trim(),{abort,started}=start();changePhase('searching');
    try{const data=await request('/api/studio/youtube-search',{projectId:expected.projectId,baseRevision:expected.revision,
      requirementId:expected.requirementId,scriptSha256:expected.scriptSha256,query:submitted},abort);
      if(!current(started,abort,expected))return;
      if(!validYouTubeDiscovery(data,expected,submitted))throw new Error('검색 결과가 현재 작업과 맞지 않습니다.');
      setDiscovery(data);
    }catch(cause){if(current(started,abort,expected))setError(cause instanceof Error?cause.message:'영상을 검색하지 못했습니다.');}
    finally{if(current(started,abort,expected)){controller.current=null;changePhase('idle');}}
  }
  async function inspect(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!eligible||busy||phaseRef.current!=='idle'||!url.trim())return;
    invalidate();const expected={...scope},submitted=url.trim(),{abort,started}=start();changePhase('inspecting');
    try{const data=await request('/api/studio/youtube-inspect',{projectId:expected.projectId,baseRevision:expected.revision,
      requirementId:expected.requirementId,scriptSha256:expected.scriptSha256,url:submitted},abort);
      if(!current(started,abort,expected))return;
      if(!validYouTubeInspect(data,expected))throw new Error('영상 확인 결과가 현재 작업과 맞지 않습니다.');
      setChecked(data);
    }catch(cause){if(current(started,abort,expected))setError(cause instanceof Error?cause.message:'영상 정보를 확인하지 못했습니다.');}
    finally{if(current(started,abort,expected)){controller.current=null;changePhase('idle');}}
  }
  async function acquire(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!checked||!checked.rightsEligible||!eligible||busy||phaseRef.current!=='idle'||!note.trim()||focal&&evidenceOnly)return;
    const expected={...scope},selected=checked;if(!validYouTubeInspect(selected,expected))return;
    const release=beginMutation();if(!release)return;
    const {abort,started}=start();changePhase('acquiring');setError('');
    try{const data=await request('/api/studio/youtube-acquire',{projectId:expected.projectId,baseRevision:expected.revision,
      requirementId:expected.requirementId,scriptSha256:expected.scriptSha256,url:selected.canonicalUrl,
      metadataSha256:selected.metadataSha256,semanticNote:note,evidenceOnly},abort);
      if(!current(started,abort,expected))return;
      if(!validYouTubeAcquire(data,expected,selected))throw new Error('수집 결과를 대조할 수 없습니다. 프로젝트를 새로고침해 상태를 확인하세요.');
      onAcquired(data,expected);
    }catch(cause){if(current(started,abort,expected)){setChecked(null);setError(`${cause instanceof Error?cause.message:'영상을 수집하지 못했습니다.'} 프로젝트를 새로고침해 연결 상태를 확인하세요.`);}}
    finally{release();if(current(started,abort,expected)){controller.current=null;changePhase('idle');}}
  }
  if(!eligible)return null;
  return <section className="vm-live-source" aria-label={`자료 요구 ${scope.requirementId} · YouTube 영상 연결`}>
    <button type="button" aria-expanded={open} disabled={busy} onClick={()=>{invalidate();setOpen(!open);}}>YouTube CC BY 영상 찾기·연결</button>
    {open?<div><p className="vm-help">검색 상위 최대 5개에서 CC BY 표시를 확인합니다. 결과가 없으면 검색어를 변경하세요. 공개 영상 10분 이내를 확인하며, 720p·40MB 이하 MP4만 수집합니다.</p>
      <div className="vm-search-brief"><small>장면 자료 검색 지시</small><p>{queryKo}</p><p lang="en">{queryEn}</p>
        <button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(queryKo);}}>한국어 검색어 채우기</button>
        <button type="button" disabled={busy||phase!=='idle'} onClick={()=>{invalidate();setQuery(queryEn);}}>영어 검색어 채우기</button></div>
      <form onSubmit={event=>void search(event)}><label>YouTube 검색어<input type="text" value={query} required minLength={2} maxLength={120}
        disabled={busy||phase!=='idle'} onChange={event=>{invalidate();setQuery(event.target.value);}}/></label>
        <button type="submit" disabled={busy||phase!=='idle'||query.trim().length<2}>CC BY 후보 찾기</button></form>
      {phase==='searching'?<p role="status">상위 영상을 확인하고 CC BY 표시를 검사하는 중…</p>:null}
      {discovery?<div className="vm-search-brief"><p>확인 {discovery.counts.attempted} · CC BY {discovery.counts.verified} · 제외 {discovery.counts.excluded} · 확인 실패 {discovery.counts.failed}</p>
        {discovery.partial?<p>일부 영상의 확인에 실패했습니다. 검색 결과는 부분 결과입니다.</p>:null}
        {discovery.candidates.length===0?<p>확인된 CC BY 영상이 없습니다. 검색어를 변경해 다시 찾으세요.</p>:null}
        {discovery.candidates.map(card=><div key={card.videoId}><strong>{card.title}</strong><p>{card.creator} · {card.durationSeconds.toFixed(1)}초 · {card.rightsEligible?'수집 형식 확인':'수집 형식 없음'}</p>
          <button type="button" disabled={busy||phase!=='idle'} onClick={()=>{setChecked(card);setUrl(card.canonicalUrl);setError('');}}>이 후보 선택</button></div>)}</div>:null}
      <form onSubmit={event=>void inspect(event)}><label>YouTube 영상 URL<input type="url" value={url} required maxLength={2048}
        disabled={busy||phase!=='idle'} onChange={event=>{invalidate();setUrl(event.target.value);}}/></label>
        <button type="submit" disabled={busy||phase!=='idle'||!url.trim()}>영상 정보 확인</button></form>
      {phase==='inspecting'?<p role="status">영상의 공개 상태와 사용 조건을 확인하는 중…</p>:null}
      {checked?<><div className="vm-search-brief"><strong>{checked.title}</strong><p>{checked.creator} · {checked.durationSeconds.toFixed(1)}초{checked.width&&checked.height?` · ${checked.width} × ${checked.height}`:''}</p>
        <p>{checked.licenseLabel} · 버전 미표기</p><p>{checked.rightsReason}</p>
        <a href={checked.canonicalUrl} target="_blank" rel="noopener noreferrer">원본 영상 확인 ↗</a></div>
        {checked.rightsEligible?<form onSubmit={event=>void acquire(event)}><label>장면과 맞는 대상·행동·구간<textarea value={note} required maxLength={4000} rows={3}
          disabled={busy||phase!=='idle'} onChange={event=>setNote(event.target.value)}/></label>
          <label>용도<select value={String(evidenceOnly)} disabled={busy||phase!=='idle'} onChange={event=>setEvidenceOnly(event.target.value==='true')}>
            <option value="false">화면용 원본 후보</option><option value="true">화면 밖 근거 전용</option></select></label>
          {focal&&evidenceOnly?<p role="status">핵심 화면 요구에는 근거 전용 자료를 연결할 수 없습니다.</p>:null}
          <button type="submit" disabled={busy||phase!=='idle'||!note.trim()||focal&&evidenceOnly}>이 영상 수집</button></form>:null}</>:null}
      {phase==='acquiring'?<p role="status">영상 바이트를 검증하고 등록하는 중…</p>:null}
      {phase!=='idle'?<button type="button" onClick={()=>{invalidate();setError('요청을 취소했습니다.');}}>취소</button>:null}
      {error?<p role="alert">{error}</p>:null}
    </div>:null}
  </section>;
}
