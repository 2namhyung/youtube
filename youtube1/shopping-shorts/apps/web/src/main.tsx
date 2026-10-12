import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight, Check, ChevronRight, Circle, CircleAlert, Clapperboard, Copy, Download, FileCheck2, Film, FolderOpen, Layers3, LoaderCircle, Plus, Search, Settings2, Sparkles, Upload, X} from 'lucide-react';
import './style.css';
import StoryDiscovery from './StoryDiscovery';

type RecordItem = {id:string;kind:string;data:any;hash:string};
type Project = {id:string;name:string;revision:number;state:any;created_at:string};
type Job = {id:string;stage:string;state:string;revision:number;input:any;output:any;error:any;created_at:string};
type Context = {project:Project;records:Record<string,any>};
type Capability = {name:string;status:string;scope:string;evidence:string;checked_at:string};
const stages = [
 {id:'discovery',n:'01',name:'주제 발굴',desc:'이야기 · 관심 상승 · 상품 연결',key:'story_topic_id'},
 {id:'product',n:'02',name:'상품 확인',desc:'모델 · 옵션 · 주장 근거',key:'product_id'},
 {id:'queries',n:'03',name:'소스 탐색',desc:'4개 언어로 검색 범위 확장',key:'queries_id'},
 {id:'ingest',n:'04',name:'미디어 라이브러리',desc:'원본 등록 · 샷 분할 · 관측',key:'asset_ids'},
 {id:'script',n:'05',name:'대본',desc:'보유 샷으로 표현하는 이야기',key:'script_id'},
 {id:'timeline',n:'06',name:'샷 배치',desc:'초안 → 음성 실측 → 시간 확정',key:'timeline_id'},
 {id:'voice',n:'07',name:'음성',desc:'발음 확인 · 실제 길이 측정',key:'voice_id'},
 {id:'render',n:'08',name:'렌더 · 검수',desc:'9:16 영상과 출처 묶음',key:'render_id'},
];
let sessionToken = '';
const hostedFrontend = !['127.0.0.1','localhost'].includes(window.location.hostname);
async function responseData(response:Response) {
 const contentType=response.headers.get('content-type')||'';
 if(!contentType.includes('application/json')) {
  if(hostedFrontend&&response.status===404) throw new Error('Vercel 프론트 연결 완료 · 제작 기능은 로컬 백엔드를 실행한 뒤 사용할 수 있습니다.');
  throw new Error(`API 응답을 읽을 수 없습니다. (HTTP ${response.status})`);
 }
 return response.json();
}
async function api(path:string, body?:unknown, method='POST') {
 const response = await fetch(path,{method:body === undefined?'GET':method,headers:body === undefined?{}:{'Content-Type':'application/json','X-Studio-Token':sessionToken,'Idempotency-Key':crypto.randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});
 const data = await responseData(response);
 if(!response.ok) throw new Error(data.message||data.code||JSON.stringify(data.detail));
 return data;
}
async function upload(file:File) {
 const form = new FormData(); form.append('file',file);
 const response=await fetch('/v1/uploads',{method:'POST',headers:{'X-Studio-Token':sessionToken,'Idempotency-Key':crypto.randomUUID()},body:form});
 const data=await responseData(response); if(!response.ok) throw new Error(data.message||data.code); return data;
}
const json = (v:unknown) => JSON.stringify(v,null,2);
const time = (v:string) => new Date(v).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
function schemaValue(schema:any,root:any):any {
 if(schema.$ref) return schemaValue(root.$defs[schema.$ref.split('/').pop()],root);
 if(schema.default!==undefined) return schema.default;
 if(schema.const!==undefined) return schema.const;
 if(schema.enum) return schema.enum[0];
 if(schema.anyOf) return schemaValue(schema.anyOf.find((x:any)=>x.type!=='null')||schema.anyOf[0],root);
 if(schema.type==='object') return Object.fromEntries(Object.entries(schema.properties||{}).map(([k,s])=>[k,schemaValue(s,root)]));
 if(schema.type==='array') return Array.from({length:schema.minItems||0},()=>schemaValue(schema.items,root));
 if(schema.type==='boolean') return false;
 if(schema.type==='integer'||schema.type==='number') return schema.minimum??(schema.exclusiveMinimum===0?1:0);
 return '';
}

function App(){
 const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState(''),[context,setContext]=useState<Context|null>(null);
 const [jobs,setJobs]=useState<Job[]>([]),[caps,setCaps]=useState<Capability[]>([]),[stage,setStage]=useState('product'),[view,setView]=useState('discovery');
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[synthetic,setSynthetic]=useState(false);
 const [packet,setPacket]=useState<any>(null),[answer,setAnswer]=useState(''),[activeJob,setActiveJob]=useState('');
 const [uploaded,setUploaded]=useState<RecordItem|null>(null),[receiptUrl,setReceiptUrl]=useState(''),[receiptNote,setReceiptNote]=useState('');
 const [search,setSearch]=useState(''),[results,setResults]=useState<any>(null);
 const [youtubeQuery,setYoutubeQuery]=useState('쇼핑 추천 #shorts'),[youtubeCandidate,setYoutubeCandidate]=useState(''),[youtubeAge,setYoutubeAge]=useState(72);
 const [preview,setPreview]=useState<{url:string;start:number;title:string}|null>(null);
 const [directInput,setDirectInput]=useState<{stage:string;text:string}|null>(null);
 const refresh=async(id=selected)=>{
   const ps=await api('/v1/projects'); setProjects(ps);
   if(id){const [c,j]=await Promise.all([api(`/v1/projects/${id}`),api(`/v1/jobs?project_id=${id}`)]);setContext(c);setJobs(j);}
 };
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setNotice('');try{await fn();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void act(async()=>{const s=await api('/v1/session');sessionToken=s.token; const [ps,c]=await Promise.all([api('/v1/projects'),api('/v1/capabilities')]);setProjects(ps);setCaps(c.capabilities);if(ps.length)setSelected(ps[0].id);});},[]);
 useEffect(()=>{if(selected)void refresh(selected).catch(e=>setNotice(e.message));setPacket(null);setActiveJob('');},[selected]);
 useEffect(()=>{if(!selected)return;const timer=setInterval(()=>void refresh(selected).catch(()=>{}),2500);return()=>clearInterval(timer);},[selected]);
 const project=context?.project,records=context?.records||{},current=stages.find(s=>s.id===stage)!;
 const pending=jobs.find(j=>['QUEUED','RUNNING','WAITING_INPUT'].includes(j.state));
 const complete=stages.filter(s=>project?.state[s.key]&&(s.key!=='asset_ids'||project.state[s.key].length)).length;
 const shots:RecordItem[]=records.shots||[],receipts:RecordItem[]=records.receipts||[];
 const start=async(which=stage,payload:any={})=>{if(!project)return;await api(`/v1/projects/${project.id}/stages/${which}`,{expected_revision:project.revision,payload});await refresh();};
 const openJob=async(job:Job)=>{const p=await api(`/v1/jobs/${job.id}/packet`);setPacket(p);setActiveJob(job.id);const value=schemaValue(p.result_schema,p.result_schema);if(value.attestation)value.attestation={actor:'현재 작업 운영자',model:'gpt-5.6-luna',surface:'chrome-use',receipt_ids:receipts.length?[receipts[0].id]:[''],notes:''};if(job.stage==='queries')value.queries={ko:[''],en:[''],zh:[''],ja:['']};setAnswer(json(value));};
 const direct=async(which:string)=>{const schemas=await api('/v1/contracts');const value=schemaValue(schemas[which],schemas[which]);if(which==='timeline'){value.lock=true;value.layouts={};value.sfx=[];}if(which==='review')value.subject_id=project?.state.render_id||project?.state.script_id||'';setDirectInput({stage:which,text:json(value)});};
 const collectYoutube=async()=>{if(!project)return;await api(`/v1/projects/${project.id}/youtube-discovery`,{expected_revision:project.revision,query:youtubeQuery,candidate_id:youtubeCandidate.trim()||null,age_hours:youtubeAge,region_code:'KR',max_results:50});await refresh();};
 const copy=async(text:string)=>{await navigator.clipboard.writeText(text);setNotice('클립보드에 복사했습니다.');};
 const downloadJson=(value:unknown,filename:string)=>{const url=URL.createObjectURL(new Blob([json(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);};
 const status=(j:Job)=>({WAITING_INPUT:'입력 대기',RUNNING:'처리 중',QUEUED:'실행 대기',SUCCEEDED:'완료',FAILED:'확인 필요',CANCELLED:'취소됨',RETRYABLE_FAILURE:'복구 필요'}[j.state]||j.state);
 return <div className="app-shell">
  <aside className="sidebar">
   <a className="brand" href="/" aria-label="Luna Studio 홈"><span className="brand-mark"><Layers3 size={24}/></span><span>LUNA<span className="brand-sub">SHORTS STUDIO</span></span></a>
   <div className="workspace-label">WORKSPACE <span>{hostedFrontend?'VERCEL FRONTEND':'LOCAL'}</span></div>
   <nav aria-label="주 메뉴">
    <button className={view==='discovery'?'nav active':'nav'} onClick={()=>setView('discovery')}><Search size={18}/>주제 발굴</button>
    <button className={view==='studio'?'nav active':'nav'} onClick={()=>setView('studio')}><Clapperboard size={18}/>제작 스튜디오 <ChevronRight size={15}/></button>
    <button className={view==='library'?'nav active':'nav'} onClick={()=>setView('library')}><FolderOpen size={18}/>미디어 라이브러리 <span>{shots.length}</span></button>
    <button className={view==='tasks'?'nav active':'nav'} onClick={()=>setView('tasks')}><Sparkles size={18}/>Luna 작업함 <span>{jobs.filter(j=>j.state==='WAITING_INPUT').length}</span></button>
    <button className={view==='settings'?'nav active':'nav'} onClick={()=>setView('settings')}><Settings2 size={18}/>연결 상태</button>
   </nav>
   <div className="project-heading">PROJECTS<button aria-label="새 프로젝트" onClick={()=>setCreating(true)}><Plus size={17}/></button></div>
   <div className="project-list">{projects.map(p=><button className={p.id===selected?'project-link selected':'project-link'} key={p.id} onClick={()=>{setSelected(p.id);setView('studio');}}><span className="project-dot"/><span>{p.name}<small>{p.state.mode==='synthetic-test'?'합성 테스트':'쇼핑 쇼츠'} · {time(p.created_at)}</small></span></button>)}{!projects.length&&<p className="muted small">첫 프로젝트를 만들어 보세요.</p>}</div>
   <div className="side-bottom"><div className="live-dot"/>Luna + Browser Use<span>{hostedFrontend?'프론트 연결됨':'기본 제작 경로'}</span><p>{hostedFrontend?'제작 엔진은 로컬에서 실행합니다.':'JEV 없이, 근거부터 완성본까지.'}</p></div>
  </aside>
  <div className="main-shell">
   <header className="topbar"><div><span className="muted">워크스페이스</span><ChevronRight size={14}/><strong>{view==='settings'?'연결 상태':project?.name||'새로운 이야기'}</strong>{project?.state.mode==='synthetic-test'&&<span className="test-tag">TEST</span>}</div><button className="button subtle" onClick={()=>setCreating(true)}><Plus size={16}/>새 프로젝트</button></header>
   <main>
   {notice&&<div className="notice" role="status"><CircleAlert size={17}/><span>{notice}</span><button aria-label="알림 닫기" onClick={()=>setNotice('')}><X size={16}/></button></div>}
   {view==='discovery'?<StoryDiscovery api={api} project={project} onSelected={async()=>{await refresh();setStage('product');setView('studio');}}/>:
   view==='settings'?<><div className="page-heading"><div><p className="eyebrow">CONNECTIONS</p><h1>실제로 가능한 일.</h1><p>연결 상태와 검증 범위를 구분합니다. API 키는 기본 경로의 필수 조건이 아닙니다.</p></div></div><div className="cap-grid">{caps.map(c=><section className="panel capability" key={c.name}><div className="row-between"><h3>{c.name}</h3><span className={'pill '+(c.status==='READY'?'green':'')}>{c.status}</span></div><p>{c.scope}</p><small>{c.evidence}</small><footer>확인 {time(c.checked_at)}</footer></section>)}</div></>:
   !project?<div className="welcome"><div className="welcome-symbol"><Clapperboard size={52}/></div><p className="eyebrow">FROM EVIDENCE TO STORY</p><h1>흥미로운 이야기에서,<br/>자연스러운 쇼핑으로.</h1><p>자료를 확인하고, 장면을 골라, 쇼핑 쇼츠를 완성하세요.<br/>Luna와 브라우저로 시작하는 로컬 제작 스튜디오.</p><button className="button primary large" onClick={()=>setCreating(true)}><Plus size={18}/>첫 프로젝트 만들기</button><div className="welcome-spec">8 STAGES <span>·</span> 1080 × 1920 <span>·</span> NO JEV REQUIRED</div></div>:
   <>
    <div className="page-heading"><div><p className="eyebrow">{view==='library'?'MEDIA LIBRARY':view==='tasks'?'LUNA WORKBENCH':'SHOPPING SHORTS / PRODUCTION'}</p><h1>{view==='library'?'이야기를 만드는 장면.':view==='tasks'?'관측하고, 확인하고, 이어가기.':project.name}</h1><p>{view==='library'?'원본의 출처와 실제 프레임을 함께 확인합니다.':view==='tasks'?'현재 Codex 작업에서 Chrome Use · Computer Use로 처리하는 단계입니다.':'작은 발견에서 완성된 한 편까지. 근거를 따라 차근차근.'}</p></div><div className="progress-counter"><strong>{String(complete).padStart(2,'0')}</strong><span>/ 08<small>단계 기록</small></span></div></div>
    {view==='studio'&&<>
     <div className="stage-rail" aria-label="제작 단계">{stages.map(s=>{const done=project.state[s.key]&&(s.key!=='asset_ids'||project.state[s.key].length);return <button key={s.id} className={'stage-stop '+(stage===s.id?'chosen ':'')+(done?'done':'')} onClick={()=>{setStage(s.id);setPacket(null);if(s.id==='discovery')setView('discovery');}}><span className="stage-number">{done?<Check size={14}/>:s.n}</span><span>{s.name}</span></button>;})}</div>
     <div className="studio-grid"><section className="panel stage-panel"><div className="row-between"><span className="eyebrow">STAGE {current.n}</span><span className="pill">{stage==='render'||stage==='timeline'?'로컬 엔진':'LUNA WORKFLOW'}</span></div><h2>{current.name}</h2><p className="muted">{current.desc}</p>
      <div className="stage-note"><span className="note-icon"><Sparkles size={21}/></span><div><strong>{stage==='render'?'검증된 타임라인으로 렌더합니다.':stage==='timeline'?'음성 길이가 편집의 기준입니다.':'Luna가 현재 작업에서 이어갑니다.'}</strong><p>{stage==='render'?'완성 프리뷰를 다시 검수한 뒤 MP4·자막·출처 묶음을 내보냅니다.':stage==='timeline'?'먼저 초안 배치, 음성 등록 후 실측 시간 확정을 실행하세요. 부족한 컷은 정확한 사유로 표시됩니다.':'단계를 시작하면 입력 계약과 관측할 자료를 준비합니다. 페이지 확인·근거 등록·결과 제출은 같은 Codex 작업에서 진행합니다.'}</p></div></div>
      {stage==='discovery'&&<><button className="button primary" onClick={()=>setView('discovery')}>이야기 주제 발굴 열기</button><details className="artifact-detail"><summary>이전 상품 중심 수집기</summary><div className="youtube-form"><label>검색어<input value={youtubeQuery} maxLength={200} onChange={e=>setYoutubeQuery(e.target.value)} placeholder="예: 주방 정리 추천 #shorts"/></label><label>후보 영상 ID <span>선택</span><input value={youtubeCandidate} maxLength={100} onChange={e=>setYoutubeCandidate(e.target.value)} placeholder="비우면 목표 시점에 가장 가까운 영상"/></label><label>관측 시점<select value={youtubeAge} onChange={e=>setYoutubeAge(Number(e.target.value))}><option value={24}>24시간</option><option value={72}>72시간</option><option value={168}>168시간</option></select></label><button disabled={busy||!!pending||!youtubeQuery.trim()} className="button primary" onClick={()=>void act(collectYoutube)}>{busy?<LoaderCircle className="spin" size={17}/>:<Search size={17}/>} YouTube API 수집</button><p>공개 조회수와 게시 시각을 공식 API에서 보존합니다. 첫 실행은 관측 기록을 만들며, 과거 값을 현재 누적값으로 대신하지 않습니다.</p></div></details></>}
      <div className="actions">{stage!=='discovery'&&<button disabled={busy||!!pending} className="button primary" onClick={()=>void act(()=>start(stage,stage==='timeline'?{lock:false,layouts:{}}:{}))}>{busy?<LoaderCircle className="spin" size={17}/>:stage==='render'?<Film size={17}/>:<Sparkles size={17}/>} {stage==='render'?'프리뷰 렌더':stage==='timeline'?'초안 배치':'단계 시작'}<ArrowUpRight size={16}/></button>}{stage==='timeline'&&<button className="button" disabled={busy||!!pending} onClick={()=>void act(()=>start('timeline',{lock:true,layouts:{}}))}><FileCheck2 size={16}/>음성 시간 확정</button>}{(stage==='script'||stage==='render')&&<button className="button" disabled={busy||!!pending} onClick={()=>void act(()=>start('review'))}>검수 작업 만들기</button>}{stage==='ingest'&&<button className="button" disabled={busy||!!pending} onClick={()=>void act(()=>start('observe'))}>샷 관측 작업</button>}</div>
      {pending&&<div className="pending-strip"><LoaderCircle className={pending.state==='WAITING_INPUT'?'':'spin'} size={17}/><div><strong>{status(pending)} · {stages.find(s=>s.id===pending.stage)?.name||pending.stage}</strong><span>{pending.error.message||'파일과 계약을 처리하고 있습니다.'}</span></div><button className="link" onClick={()=>{setView('tasks');if(pending.state==='WAITING_INPUT')void act(()=>openJob(pending));}}>열기 <ChevronRight size={14}/></button></div>}
      {records[current.key]&&<details className="artifact-detail"><summary><FileCheck2 size={16}/>저장된 단계 결과</summary><pre>{json(records[current.key].data)}</pre></details>}
      {stage==='ingest'&&<p className="helper">영상은 아래 자료 등록에서 업로드한 뒤 파일 ID와 이용·취득 근거를 Luna 작업에 연결하세요.</p>}
      {stage==='voice'&&<p className="helper">각 문장(beat)별 승인 음성을 업로드합니다. 외부 TTS 키 없이 실제 음성을 48kHz로 측정·연결할 수 있습니다.</p>}
      {stage==='voice'&&<><button className="button small-button" disabled={busy||!!pending} onClick={()=>void act(()=>start('sound'))}>효과음 카탈로그 등록</button>{(records.sounds||[]).map((r:RecordItem)=><div className="sound-row" key={r.id}><span>{r.data.name}</span><audio controls preload="none" src={`/v1/files/${r.data.blob_id}`}/><button className="button small-button" onClick={()=>void act(()=>copy(r.id))}>ID 복사</button></div>)}</>}
      {stage!=='render'&&stage!=='discovery'&&<button className="link advanced-input" disabled={busy||!!pending} onClick={()=>void act(()=>direct(stage))}>구조화 입력 직접 작성 <ChevronRight size={14}/></button>}
      {stage==='queries'&&records.queries_id&&<div className="query-links">{Object.entries(records.queries_id.data.queries).map(([locale,queries])=><div key={locale}><strong>{locale.toUpperCase()}</strong>{(queries as string[]).map(q=><a key={q} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">{q}<ArrowUpRight size={13}/></a>)}</div>)}</div>}
     </section><section className="panel preview-panel"><div className="row-between"><span className="eyebrow">OUTPUT PREVIEW</span><span className="tiny">9:16 / 30 FPS</span></div>{records.render_id?<video aria-label="렌더 프리뷰" controls preload="metadata" src={`/v1/files/${records.render_id.data.video_blob_id}`}/>:<div className="portrait-placeholder"><div className="frame-corner tl"/><div className="frame-corner br"/><span className="preview-orbit"><Clapperboard size={35}/></span><strong>다음 이야기가<br/>시작될 자리.</strong><p>샷과 음성이 준비되면<br/>여기에 프리뷰가 나타납니다.</p><span className="frame-spec">1080 × 1920</span></div>}{records.export_id?<a className="button primary full" href={`/v1/files/${records.export_id.data.blob_id}?download=true`}><Download size={16}/>검수된 파일 묶음</a>:<div className="preview-footer"><Circle size={8}/> {records.render_id?'완성본 의미 검수 대기':'렌더 준비 중'}</div>}</section></div>
    </>}
    {(view==='studio'||view==='library')&&<section className="panel evidence-panel"><div className="section-heading"><div><h3>자료와 근거</h3><p>파일은 로컬에 보관하고, 근거와 미디어를 구분해서 연결합니다.</p></div><label className="button upload-button"><Upload size={16}/>파일 등록<input type="file" aria-label="파일 업로드" onChange={e=>{const f=e.target.files?.[0];if(f)void act(async()=>{setUploaded(await upload(f));});e.target.value='';}}/></label></div>{uploaded&&<div className="upload-result"><div><Check size={16}/><strong>{uploaded.data.name}</strong><code>{uploaded.id}</code><button title="파일 ID 복사" onClick={()=>void act(()=>copy(uploaded.id))}><Copy size={15}/></button></div><p className="helper">미디어는 이 파일 ID를 단계 입력에 사용합니다. 페이지 캡처·권리 문서라면 아래에서 근거로 등록하세요.</p><div className="receipt-form"><label>원문 URL 또는 자료 출처<input placeholder="https://… 또는 보유 원본의 출처" value={receiptUrl} onChange={e=>setReceiptUrl(e.target.value)}/></label><label>실제 관측·확인 내용<input placeholder="선택 옵션, 권리 문구, 청취 확인 등" value={receiptNote} onChange={e=>setReceiptNote(e.target.value)}/></label><button className="button" disabled={!receiptUrl||!receiptNote||busy} onClick={()=>void act(async()=>{const r=await api(`/v1/projects/${selected}/receipts`,{blob_id:uploaded.id,url:receiptUrl,observed_at:new Date().toISOString(),surface:project.state.mode==='synthetic-test'?'fixture':'manual',note:receiptNote});setNotice(`근거 등록: ${r.id}`);setUploaded(null);setReceiptNote('');await refresh();})}>근거 등록</button></div></div>}{receipts.length?<div className="receipt-list">{receipts.map(r=><div key={r.id}><FileCheck2 size={18}/><span><strong>{r.data.note}</strong><small>{r.data.surface} · {time(r.data.observed_at)}</small></span><button className="button small-button" onClick={()=>void act(()=>copy(r.id))}><Copy size={13}/>ID 복사</button></div>)}</div>:<div className="empty-inline"><FileCheck2 size={23}/><span>아직 등록된 근거가 없습니다. 상품 페이지 캡처나 원본 이용 근거부터 추가하세요.</span></div>}</section>}
    {view==='library'&&<><div className="search-row"><Search size={18}/><input aria-label="관측 샷 검색" placeholder="관측한 동작으로 검색하세요. 예: 상자를 접는 손" value={search} onChange={e=>setSearch(e.target.value)}/><button className="button primary" onClick={()=>void act(async()=>setResults(await api('/v1/shots/search',{project_id:selected,query:search,usage_role:'EXACT_PRODUCT',round:0}))) }>제품 샷 검색</button></div>{results&&<div className="search-result">{results.candidates.length?`조건을 통과한 후보 ${results.candidates.length}개`:'일치하는 검증 샷이 없습니다. 샷 관측 또는 추가 소스가 필요합니다.'}<code>{results.candidates.map((c:any)=>c.shot_id).join(' · ')}</code></div>}<div className="shot-grid">{shots.map(shot=>{const asset=(project.state.asset_ids||[]).includes(shot.data.asset_id);return <article className="panel shot-card" key={shot.id}><div className="contact-strip">{shot.data.frames.map((f:any)=><figure key={f.blob_id}><img src={`/v1/files/${f.blob_id}`} alt={`${shot.id} 프레임 ${f.frame}`}/><figcaption>{(f.frame/30).toFixed(2)}s · {f.frame}f</figcaption><button aria-label={`프레임 ${f.frame} ID 복사`} onClick={()=>void act(()=>copy(f.blob_id))}><Copy size={12}/></button></figure>)}</div><div className="shot-body"><div className="row-between"><strong>{((shot.data.end_frame-shot.data.start_frame)/30).toFixed(1)}초</strong><span className="pill">{asset?'등록 원본':'확인 필요'}</span></div><code>{shot.id}</code><div className="actions"><button className="button small-button" onClick={()=>void act(async()=>{const a=await api(`/v1/assets/${shot.data.asset_id}`);setPreview({url:`/v1/files/${a.data.proxy_blob_id}`,start:shot.data.start_frame/30,title:shot.id});})}>영상 보기</button><button className="button small-button" onClick={()=>void act(()=>copy(shot.id))}><Copy size={13}/>샷 ID</button><button className="button small-button" disabled={!!pending} onClick={()=>void act(async()=>{await start('observe');setView('tasks');})}>관측</button></div></div></article>;})}</div>{!shots.length&&<div className="panel empty-inline"><Film size={30}/>미디어 등록 단계를 완료하면 샷과 프레임이 여기에 나타납니다.</div>}</>}
    {(view==='tasks'||view==='studio')&&<section className="panel jobs-panel"><div className="section-heading"><div><h3>Luna 작업함</h3><p>대기 중인 입력과 실행 이력을 확인하세요.</p></div><span className="pill">{jobs.length} JOBS</span></div>{!jobs.length?<div className="empty-inline"><Sparkles size={22}/>단계를 시작하면 첫 작업이 생성됩니다.</div>:jobs.map(j=><div className={'job-row '+(activeJob===j.id?'job-selected':'')} key={j.id}><span className={'job-icon '+j.state.toLowerCase()}>{j.state==='SUCCEEDED'?<Check size={18}/>:j.state==='FAILED'?<CircleAlert size={18}/>:<Circle size={15}/>}</span><div className="job-info"><strong>{stages.find(s=>s.id===j.stage)?.name||({observe:'샷 관측',review:'의미 검수'}[j.stage]||j.stage)}<span>{status(j)}</span></strong><small>{j.error.message||`${time(j.created_at)} · revision ${j.revision}`}</small></div>{j.state==='WAITING_INPUT'&&<button className="button small-button" onClick={()=>void act(()=>openJob(j))}>작업 열기 <ArrowUpRight size={14}/></button>}{['QUEUED','RUNNING','WAITING_INPUT','RETRYABLE_FAILURE'].includes(j.state)&&<button className="icon-button" aria-label="작업 취소" onClick={()=>void act(async()=>{await api(`/v1/jobs/${j.id}/cancel`,{});setPacket(null);await refresh();})}><X size={17}/></button>}</div>)}</section>}
    {packet&&<section className="panel operator-panel"><div className="section-heading"><div><p className="eyebrow">CURRENT-TASK OPERATOR BRIDGE</p><h3>현재 Luna 작업에서 처리하기</h3></div><div className="actions"><button className="button small-button" onClick={()=>void act(()=>copy(json(packet)))}><Copy size={14}/>작업 패킷 복사</button><button className="button small-button" onClick={()=>downloadJson(packet,'luna-task.json')}><Download size={14}/>JSON</button></div></div><p className="operator-instruction">{packet.instructions}</p><ol className="operator-steps"><li>현재 Codex 작업에서 패킷의 자료·프레임을 확인합니다.</li><li>Chrome Use / Computer Use로 관측하고 자료와 근거를 등록합니다.</li><li>관측 결과를 아래 형식에 맞춰 제출합니다. 서버가 참조와 버전을 검사합니다.</li></ol><label className="json-label">결과 JSON<textarea spellCheck={false} aria-label="Luna 결과 JSON" value={answer} onChange={e=>setAnswer(e.target.value)}/></label><div className="row-between"><span className="helper">실제 사용 모델과 관측 근거를 기록하세요. 이 앱은 모델을 별도로 실행하지 않습니다.</span><button className="button primary" disabled={busy} onClick={()=>void act(async()=>{await api(`/v1/jobs/${activeJob}/inputs`,{binding:packet.binding,result:JSON.parse(answer)});setPacket(null);await refresh();})}>검증 후 이어가기 <ChevronRight size={16}/></button></div><details><summary>전체 패킷과 JSON Schema</summary><pre>{json(packet)}</pre></details></section>}
   </>}
   <footer className="main-footer"><span>LUNA STUDIO <i> / </i> local production workspace</span><span>원본 보존 · 근거 연결 · 명시적 검수</span></footer>
   </main>
  </div>
  {creating&&<div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();void act(async()=>{const p=await api('/v1/projects',{name,desired_seconds:35,mode:synthetic?'synthetic-test':'production'});setSelected(p.id);setCreating(false);setName('');setView('studio');await refresh(p.id);});}}><button className="modal-close" type="button" aria-label="닫기" onClick={()=>setCreating(false)}><X size={20}/></button><p className="eyebrow">NEW STORY</p><h2>어떤 상품을 소개할까요?</h2><p className="muted">상품 하나, 프로젝트 하나로 시작하세요.</p><label>프로젝트 이름<input autoFocus required maxLength={120} placeholder="예: 접이식 수납함, 공간을 되찾는 이야기" value={name} onChange={e=>setName(e.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>합성 자료로 기능 테스트하기 <span>게시용 아님</span></label><button className="button primary full" disabled={busy||!name.trim()}><Plus size={17}/>프로젝트 만들기</button></form></div>}
  {preview&&<div className="modal-backdrop"><div className="modal video-modal"><button className="modal-close" aria-label="미리보기 닫기" onClick={()=>setPreview(null)}><X size={20}/></button><h3>원본 샷 확인</h3><code>{preview.title}</code><video controls autoPlay src={preview.url} onLoadedMetadata={e=>{e.currentTarget.currentTime=preview.start;}}/><p className="helper">전체 프록시 시간축입니다. 샷 시작 시각 {(preview.start).toFixed(2)}초부터 재생합니다.</p></div></div>}
  {directInput&&<div className="modal-backdrop"><div className="modal video-modal"><button className="modal-close" aria-label="구조화 입력 닫기" onClick={()=>setDirectInput(null)}><X size={20}/></button><p className="eyebrow">STRUCTURED INPUT</p><h3>{stages.find(s=>s.id===directInput.stage)?.name||directInput.stage} 입력</h3><p className="helper">등록된 ID만 사용하세요. 배치의 layouts는 beat ID별 fit/crop, sfx는 sound ID·beat ID·sample offset·gain/fade를 받습니다.</p><textarea className="direct-json" aria-label="단계 입력 JSON" spellCheck={false} value={directInput.text} onChange={e=>setDirectInput({...directInput,text:e.target.value})}/><button className="button primary full" disabled={busy} onClick={()=>void act(async()=>{await start(directInput.stage,JSON.parse(directInput.text));setDirectInput(null);})}>입력 검증 후 실행</button></div></div>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
