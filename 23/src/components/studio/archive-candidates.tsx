'use client';
import {useEffect,useRef,useState} from 'react';
import type {ArchiveCandidate,ArchiveList,ArchiveScope} from './archive-client';
import {validArchiveList} from './archive-client';

type ImportBody={id:string;baseRevision:number;requirementId:string;archiveAssetId:number;expectedSha256:string;semanticNote:string;evidenceOnly:boolean};
export default function ArchiveCandidates({scope,token,busy,locked,hasAsset,focal,importCandidate}:{scope:ArchiveScope;token:string;busy:boolean;
  locked:boolean;hasAsset:boolean;focal:boolean;importCandidate:(body:ImportBody,signal:AbortSignal)=>Promise<void>}){
  const [open,setOpen]=useState(false);const [draft,setDraft]=useState('');const [query,setQuery]=useState('');
  const [list,setList]=useState<ArchiveList|null>(null);const [items,setItems]=useState<ArchiveCandidate[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);const [selected,setSelected]=useState<number|null>(null);
  const [semanticNote,setSemanticNote]=useState('');const [evidenceOnly,setEvidenceOnly]=useState(true);const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);const [loadingMore,setLoadingMore]=useState(false);
  const controllers=useRef(new Set<AbortController>());
  useEffect(()=>()=>{for(const controller of controllers.current)controller.abort();},[scope.projectId,scope.revision,scope.requirementId,scope.scriptSha256,query]);
  useEffect(()=>{if(!open)return;const controller=new AbortController();let live=true;
    const params=new URLSearchParams({id:scope.projectId,baseRevision:String(scope.revision),requirementId:scope.requirementId,q:query});
    (async()=>{setLoading(true);setList(null);setItems([]);setCursor(null);setSelected(null);setError('');
      try{const response=await fetch(`/api/studio/archive-candidates?${params}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
        const body=await response.json();if(!response.ok)throw new Error(body.error||'보관함을 읽지 못했습니다.');
        if(!validArchiveList(body,scope))throw new Error('다른 작업의 자료 목록 응답입니다.');
        if(live){setList(body);setItems(body.candidates);setCursor(body.nextCursor);}
      }catch(e){if(live&&!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));}
      finally{if(live)setLoading(false);}})();
    return()=>{live=false;controller.abort();};
  },[open,query,scope.projectId,scope.revision,scope.requirementId,scope.scriptSha256,token]);
  const [importController,setImportController]=useState<AbortController|null>(null);
  async function more(){if(!cursor||loadingMore)return;const controller=new AbortController();controllers.current.add(controller);setLoadingMore(true);
    try{const params=new URLSearchParams({id:scope.projectId,baseRevision:String(scope.revision),requirementId:scope.requirementId,q:query,cursor});
      const response=await fetch(`/api/studio/archive-candidates?${params}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal:controller.signal});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'다음 목록을 읽지 못했습니다.');
      if(!validArchiveList(body,scope))throw new Error('다른 작업의 자료 목록 응답입니다.');
      if(controller.signal.aborted)return;
      setItems(previous=>[...previous,...body.candidates]);setCursor(body.nextCursor);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{controllers.current.delete(controller);setLoadingMore(false);}}
  const chosen=items.find(item=>item.archiveAssetId===selected);
  async function submit(){if(!chosen?.sha256||busy||locked||hasAsset)return;const controller=new AbortController();controllers.current.add(controller);setImportController(controller);setError('');
    try{await importCandidate({id:scope.projectId,baseRevision:scope.revision,requirementId:scope.requirementId,
      archiveAssetId:chosen.archiveAssetId,expectedSha256:chosen.sha256,semanticNote,evidenceOnly:chosen.evidenceOnlyRequired||evidenceOnly},controller.signal);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{controllers.current.delete(controller);setImportController(null);}}
  return <section className="vm-archive"><button type="button" disabled={busy||locked||hasAsset} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>수집된 자료 찾기</button>
    {open?<div><p className="vm-help">보관함의 제목·제공처·수집 검색어만 찾습니다. 검색 결과는 의미 적합성이나 권리 승인이 아닙니다.</p>
      <form onSubmit={e=>{e.preventDefault();setQuery(draft);}}><label>보관함 검색어<input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={200}/></label><button type="submit" disabled={loading||busy}>찾기</button></form>
      {loading?<p role="status">보관함 확인 중…</p>:list?.availability==='unavailable'?<p role="status">로컬 수집 보관함이 없습니다. 직접 원본 등록은 계속 사용할 수 있습니다.</p>:
        items.length===0?<p role="status">일치하는 수집 자료가 없습니다.</p>:<div className="vm-archive-results">{items.map(item=><article key={item.archiveAssetId}>
          <strong>{item.title||`수집 항목 ${item.archiveAssetId}`}</strong><p>{item.provider} · {item.mediaType==='image'?'사진':item.mediaType==='video'?'영상':'지원하지 않는 유형'} · {item.bytes?.toLocaleString()??'크기 미기록'} bytes</p>
          <p>제작자·기관: {item.creator||'미기록'} {item.publisher&&item.publisher!==item.creator?`/ ${item.publisher}`:''}</p>
          <p>라이선스: {item.license||'미기록'} · 권리 상태: {item.rightsStatus||'미확인'}</p><p>출처 표기: {item.attribution||'미기록'}</p>
          {item.itemUrl?<a href={item.itemUrl} target="_blank" rel="noreferrer">원문 항목 열기 ↗</a>:null}
          {item.blockers.length?<p role="status">연결 불가: {item.blockers.join(' ')}</p>:<p>연결 가능 · 출처/권리/의미 검토 대기</p>}
          <button type="button" disabled={busy||locked||hasAsset||!item.compatible} aria-pressed={selected===item.archiveAssetId} onClick={()=>setSelected(item.archiveAssetId)}>이 자료 선택</button>
        </article>)}</div>}
      {cursor?<button type="button" disabled={loadingMore||busy} onClick={()=>void more()}>다음 수집 자료</button>:null}
      {chosen?.compatible?<form onSubmit={e=>{e.preventDefault();void submit();}}><label>대상·행동·구간 대응과 사용 목적<textarea required maxLength={4000} rows={3} value={semanticNote} onChange={e=>setSemanticNote(e.target.value)}/></label>
        <label>자료 용도<select value={String(chosen.evidenceOnlyRequired||evidenceOnly)} onChange={e=>setEvidenceOnly(e.target.value==='true')}><option value="true">화면 밖 근거 확인 전용</option>{!chosen.evidenceOnlyRequired?<option value="false">화면용 원본 후보 · 승인 전</option>:null}</select></label>
        {focal&&(chosen.evidenceOnlyRequired||evidenceOnly)?<p className="vm-help">핵심 화면 요구에는 근거 확인 전용 자료를 연결할 수 없습니다. 실제 화면 원본으로 검토할 때만 용도를 변경하세요.</p>:null}
        <button disabled={busy||locked||hasAsset||!!importController||!semanticNote.trim()||(focal&&(chosen.evidenceOnlyRequired||evidenceOnly))}>선택한 수집 원본 연결</button></form>:null}
      {error?<p role="alert">{error}</p>:null}</div>:null}</section>;
}
