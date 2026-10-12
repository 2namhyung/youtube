'use client';

import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type {Plan, Scene, Candidate, Requirement, Command, Beat, Asset} from '../../../visualmaker/core/model';
import type {Job, JobKind, ArtifactName} from '../../../visualmaker/core/jobs';

type ProjectSummary={id:string;title:string;revision:number;updatedAt:string};
type Diff={changedSceneIds:string[];risks:string[];before:string;after:string};
const modeLabels:Record<Candidate['mode'],string>={'source-photo':'실사 사진','source-video':'실사 영상',remotion:'모션그래픽',omni:'가상 사건'};
const roleLabels:Record<Beat['role'],string>={context:'맥락',action:'실제 행동',comparison:'비교·관계',process:'과정',evidence:'근거',fiction:'가상 사례'};
const sample='여러 자료를 모으는 것만으로는 설명이 완성되지 않습니다. 무엇을 비교할지 먼저 정해야 합니다.\n\n첫 번째 자료와 두 번째 자료의 차이를 나란히 확인합니다.\n\n마지막에는 같은 자료로 돌아와, 처음 질문에 답합니다.';

function sceneText(plan:Plan,scene:Scene){return scene.beatIds.flatMap(id=>plan.beats.find(b=>b.id===id)?.segmentIds||[]).map(id=>plan.script.segments.find(s=>s.id===id)?.text||'').join('\n');}
function chosen(scene:Scene){return scene.candidates.find(c=>c.id===scene.selectedCandidateId);}
function saveFile(name:string,body:string,type='application/json'){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export default function Studio({token}:{token:string}){
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [selected,setSelected]=useState('');
  const [inspector,setInspector]=useState<'direction'|'sources'>('direction');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [filter,setFilter]=useState<'all'|'unselected'|'missing'>('all');
  const [creating,setCreating]=useState(false);
  const [scriptDraft,setScriptDraft]=useState<string|null>(null);
  const [diff,setDiff]=useState<Diff|null>(null);
  const [jobs,setJobs]=useState<Job[]>([]);
  const importRef=useRef<HTMLInputElement>(null);
  const active=plan?.scenes.find(s=>s.id===selected)||plan?.scenes[0];

  async function api(url='/api/studio',options:RequestInit={}){
    const response=await fetch(url,{...options,headers:{'x-visualmaker-token':token,...options.headers},cache:'no-store'});
    if(!response.ok){let message='요청을 처리하지 못했습니다.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
    return response;
  }
  async function refreshList(){const data=await(await api()).json();setProjects(data.projects);return data.projects as ProjectSummary[];}
  async function refreshJobs(id:string){const data=await(await api(`/api/studio/jobs?projectId=${encodeURIComponent(id)}`)).json();setJobs(data.jobs);}
  function accept(next:Plan){if(next.id!==plan?.id)window.scrollTo({top:0});setPlan(next);setSelected(id=>next.scenes.some(s=>s.id===id)?id:next.scenes[0]?.id||'');setCreating(false);}
  async function work(task:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function load(id:string){await work(async()=>{accept((await(await api(`/api/studio?id=${encodeURIComponent(id)}`)).json()).plan);});}
  async function post(body:object){const result=await(await api('/api/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();accept(result.plan);await refreshList();setNotice('이 PC에 저장했습니다.');}
  async function command(cmd:Command){if(!plan)return;await work(async()=>{const result=await(await api('/api/studio',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:plan.id,baseRevision:plan.revision,command:cmd})})).json();accept(result.plan);await refreshList();setNotice('변경 내용을 저장했습니다.');});}

  useEffect(()=>{if(!plan?.id){setJobs([]);return;}const id=plan.id;let live=true;
    const poll=async()=>{try{const response=await api(`/api/studio/jobs?projectId=${encodeURIComponent(id)}`);const data=await response.json();if(live)setJobs(data.jobs);}catch(e){if(live)setError(e instanceof Error?e.message:String(e));}};
    void poll();const timer=setInterval(()=>void poll(),3000);return()=>{live=false;clearInterval(timer);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[plan?.id,token]);

  async function enqueue(kind:JobKind){if(!plan)return;await work(async()=>{const body={action:'enqueue',projectId:plan.id,baseRevision:plan.revision,kind,idempotencyKey:crypto.randomUUID()};
    const response=await api('/api/studio/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();await refreshJobs(plan.id);
    setNotice(data.job.status==='blocked'?'렌더 미리보기는 아직 연결되지 않았습니다. 차단 사유를 확인하세요.':'현재 리비전의 작업을 대기열에 저장했습니다.');});}
  async function jobAction(job:Job,action:'run'|'cancel'|'retry'|'recover'){if(!plan)return;await work(async()=>{await api('/api/studio/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,jobId:job.id})});await refreshJobs(plan.id);setNotice('작업 상태를 갱신했습니다.');});}
  async function download(job:Job,name:ArtifactName){await work(async()=>{const response=await api(`/api/studio/jobs/download?${new URLSearchParams({jobId:job.id,name})}`);const bytes=await response.blob();const url=URL.createObjectURL(bytes);const a=document.createElement('a');a.href=url;a.download=`visualmaker-r${job.requestedRevision}-${name}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('검증된 작업 파일을 받았습니다.');});}

  useEffect(()=>{let live=true;(async()=>{try{const items=await refreshList();if(items[0]){const data=await(await api(`/api/studio?id=${encodeURIComponent(items[0].id)}`)).json();if(live)accept(data.plan);}else if(live)setCreating(true);}catch(e){if(live)setError(e instanceof Error?e.message:String(e));}})();return()=>{live=false;}; // token changes only on server restart
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token]);

  async function exportPlan(format:string){if(!plan)return;await work(async()=>{const response=await api(`/api/studio?id=${encodeURIComponent(plan.id)}&format=${format}`);const text=await response.text();const body=format==='json'?JSON.stringify(JSON.parse(text).plan,null,2):format==='csv'?text:JSON.stringify(JSON.parse(text),null,2);saveFile(`visualmaker-r${plan.revision}-${format}.${format==='csv'?'csv':'json'}`,body,format==='csv'?'text/csv;charset=utf-8':'application/json');setNotice('파일을 내보냈습니다.');});}
  const visible=plan?.scenes.filter(s=>filter==='all'||(filter==='unselected'?!s.selectedCandidateId:chosen(s)?.requirementIds.some(id=>!plan.requirements.find(r=>r.id===id)?.assetId)??true))||[];
  const selectedCount=plan?.scenes.filter(s=>s.selectedCandidateId).length||0;
  const lockedCount=plan?.scenes.filter(s=>s.locked).length||0;

  return <main className="vm-app">
    <header className="vm-header"><Link className="vm-brand" href="/studio"><span className="vm-mark">V<span>m</span></span><div>VisualMaker<small>장면 설계 작업대</small></div></Link>
      <div className="vm-project"><span className="vm-eyebrow">WORKSPACE / LOCAL</span><select aria-label="프로젝트 선택" disabled={busy} value={plan?.id||''} onChange={e=>void load(e.target.value)}><option value="" disabled>프로젝트 선택</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      <div className="vm-header-actions"><Link href="/sources">자료 아카이브 ↗</Link><button disabled={busy} onClick={()=>{setCreating(true);setError('');}}>＋ 새 프로젝트</button><button disabled={busy} onClick={()=>importRef.current?.click()}>불러오기</button><button className="vm-primary" disabled={busy||!plan} onClick={()=>void exportPlan('json')}>장면표 저장 ↗</button></div>
      <input ref={importRef} hidden type="file" accept="application/json,.json" aria-label="장면표 JSON 불러오기" onChange={e=>{const file=e.target.files?.[0];if(file)void work(async()=>{if(file.size>3_000_000)throw new Error('JSON은 3MB 이하여야 합니다.');await post({operation:'import',plan:JSON.parse(await file.text())});});e.target.value='';}}/>
    </header>
    <div className="vm-statusbar"><div><span className="vm-dot"/> {busy?'저장 중…':plan?`로컬 저장 · 리비전 ${plan.revision}`:'새 작업을 시작하세요'}<span className="vm-status-divider">/</span><span>장면 설계 → 자료 검토 → 제작</span></div><span>방향 선택 {selectedCount} · 잠금 {lockedCount} · 제작 승인 전</span></div>
    {error?<div className="vm-alert" role="alert">{error}<button onClick={()=>plan&&void load(plan.id)}>최신 내용 불러오기</button></div>:null}
    {notice?<div className="vm-notice" role="status">{notice}</div>:null}

    {creating?<section className="vm-onboarding"><div className="vm-intro"><span className="vm-eyebrow">FROM SCRIPT TO SCENE</span><h1>무슨 말을 할지,<br/>무엇을 보여줄지.</h1><p>대본과 화면을 한 작업대에서 다듬으세요.<br/>전달할 의미를 정하고, 표현을 비교하고,<br/>필요한 자료까지 장면에 연결합니다.</p><div className="vm-intro-rule"><b>01</b> 대본을 의미 단위로 나눕니다.<br/><b>02</b> 두 표현을 비교하고 직접 수정합니다.<br/><b>03</b> 선택한 방향과 자료 요구를 저장합니다.</div><button disabled={busy} onClick={()=>void work(()=>post({operation:'episode'}))}>현재 EP001 36컷 가져오기 →</button><small>현재 명세를 읽어 작업용 사본을 만듭니다.</small></div>
      <form className="vm-create-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void work(()=>post({operation:'create',title:f.get('title'),text:f.get('text')}));}}><div className="vm-section-heading"><h2>새 영상의 대본</h2><span>STEP 01</span></div><label>프로젝트 이름<input name="title" required maxLength={200} defaultValue="첫 번째 장면 설계"/></label><label>내레이션<textarea name="text" required maxLength={30000} defaultValue={sample} rows={12}/></label><p className="vm-help">빈 줄로 의미 단위를 구분하세요. [메모]로 시작한 줄과 단독 URL은 발화에서 분리합니다. 초벌 구분은 직접 합칠 수 있습니다.</p><div className="vm-form-actions">{plan?<button type="button" disabled={busy} onClick={()=>setCreating(false)}>돌아가기</button>:null}<button className="vm-primary" disabled={busy}>장면 설계 시작 →</button></div><p className="vm-help">현재 제안기는 로컬 규칙 기반 초안입니다. AI·외부 검색을 실행하거나 자료를 확보했다고 표시하지 않습니다.</p></form></section>
    :plan&&active?<>
      <div className="vm-workspace">
        <aside className="vm-script-pane"><div className="vm-pane-heading"><div><span className="vm-eyebrow">01 / SCRIPT</span><h2>대본</h2></div><button disabled={busy} onClick={()=>{setScriptDraft(plan.script.rawText);setDiff(null);}}>수정</button></div><div className="vm-script-meta"><span>{plan.script.segments.filter(s=>s.kind==='narration').length} 발화 구간</span><span>원문 보존</span></div><div className="vm-script-list">{plan.script.segments.map((segment,index)=>{const scene=plan.scenes.find(s=>s.beatIds.some(id=>plan.beats.find(b=>b.id===id)?.segmentIds.includes(segment.id)));return <button key={segment.id} className={`vm-script-segment ${scene?.id===active.id?'is-active':''}`} disabled={!scene} onClick={()=>scene&&setSelected(scene.id)}><span>{String(index+1).padStart(2,'0')}{segment.kind!=='narration'?` · ${segment.kind==='note'?'메모':'참고'}`:''}</span><p>{segment.text}</p></button>;})}</div><div className="vm-script-footer">변경 이력 {plan.script.history.length}개<br/><span>선택한 문장과 장면이 함께 움직입니다.</span></div></aside>
        <section className="vm-storyboard"><div className="vm-pane-heading"><div><span className="vm-eyebrow">02 / STORYBOARD</span><h2>장면표 <em>{plan.scenes.length}</em></h2></div><select aria-label="장면 필터" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">전체 장면</option><option value="unselected">방향 미선택</option><option value="missing">자료 미확보</option></select></div><p className="vm-board-note">먼저 전달할 의미를 고르세요. 시간은 공백 제외 4.965자/초 기준 가안입니다.</p>
          <div className="vm-scene-list">{visible.map(scene=>{const candidate=chosen(scene);const index=plan.scenes.indexOf(scene);const beat=plan.beats.find(b=>b.id===scene.beatIds[0]);const reqs=candidate?.requirementIds.map(id=>plan.requirements.find(r=>r.id===id)!).filter(Boolean)||[];return <article key={scene.id} className={`vm-scene ${scene.id===active.id?'is-active':''}`}><button className="vm-scene-select" onClick={()=>setSelected(scene.id)} aria-label={`장면 ${index+1} 선택`}><div className="vm-scene-top"><span className="vm-scene-number">SCENE {String(index+1).padStart(2,'0')}</span><div>{scene.locked?<span className="vm-badge locked">잠금</span>:null}<span className="vm-time">약 {scene.estimatedSeconds.toFixed(1)}초</span></div></div><h3>{beat?.intent}</h3><p className="vm-narration">“{sceneText(plan,scene)}”</p><div className={`vm-direction-summary ${candidate?'selected':''}`}><span className="vm-route-symbol">{candidate?.mode==='remotion'?'↗':candidate?.mode==='omni'?'◇':'▧'}</span><div><small>{candidate?modeLabels[candidate.mode]:'표현 방향을 선택하세요'}</small><strong>{candidate?.label||'대안 두 개를 비교할 수 있습니다'}</strong></div><span>→</span></div><div className="vm-scene-bottom"><span>{roleLabels[beat?.role||'context']}</span><span>{candidate?`자료 ${reqs.filter(r=>r.assetId).length}/${reqs.length} 등록 · 검토 전`:'방향 미선택'}</span></div></button></article>;})}{visible.length===0?<div className="vm-empty">이 조건에 해당하는 장면이 없습니다.</div>:null}</div>
        </section>
        <aside className="vm-inspector"><div className="vm-pane-heading"><div><span className="vm-eyebrow">03 / VISUAL DIRECTOR</span><h2>어떻게 보여줄까요?</h2></div></div><div className="vm-tabs"><button className={inspector==='direction'?'active':''} onClick={()=>setInspector('direction')}>표현 대안</button><button className={inspector==='sources'?'active':''} onClick={()=>setInspector('sources')}>필요한 자료</button></div>
          <div className="vm-inspector-scroll">{inspector==='direction'?<><BeatEditor key={`beat-${active.id}-${plan.revision}`} plan={plan} scene={active} busy={busy} command={command}/><p className="vm-help">{active.candidates[0]?.provider==='episode-import'?'현재 명세 + 순차 설명 대안':'로컬 규칙 초안'} · 화면 구성 방향이며 렌더 결과가 아닙니다.</p>{active.candidates.map((candidate,index)=><CandidateEditor key={`${candidate.id}-${plan.revision}`} candidate={candidate} index={index} scene={active} busy={busy} command={command}/>)}<div className="vm-tools"><button disabled={busy||active.locked} onClick={()=>void command({type:'regenerate',sceneId:active.id,simplify:true})}>제작 부담 줄이기</button><button disabled={busy||active.locked} onClick={()=>void command({type:'regenerate',sceneId:active.id})}>이 장면 다시 제안</button><button disabled={busy||active.locked||plan.scenes.indexOf(active)===plan.scenes.length-1} onClick={()=>void command({type:'merge-next',sceneId:active.id})}>다음 장면과 합치기</button></div><ReuseForm key={`reuse-${active.id}-${plan.revision}`} scene={active} plan={plan} busy={busy} command={command}/></>:<Sources token={token} key={`${active.id}-${plan.revision}`} scene={active} plan={plan} busy={busy} upload={async(form)=>{form.set('id',plan.id);form.set('baseRevision',String(plan.revision));await work(async()=>{const result=await(await api('/api/studio/upload',{method:'POST',body:form})).json();accept(result.plan);await refreshList();setNotice('파일을 검증해 등록했습니다. 의미·권리 검토는 대기 상태입니다.');});}}/>}</div>
          <div className="vm-inspector-footer"><span>장면 방향만 잠급니다.<small>자료·스타일·컷 PASS와 별개입니다.</small></span><button className="vm-primary" disabled={busy||(!active.locked&&!active.selectedCandidateId)} onClick={()=>void command({type:'lock',sceneId:active.id,locked:!active.locked})}>{active.locked?'잠금 해제':'방향 잠금'}</button></div>
        </aside>
      </div><section className="vm-jobs" aria-label="제작 작업"><div className="vm-jobs-heading"><div><span className="vm-eyebrow">04 / EXECUTION</span><h2>작업과 내보내기</h2><p>계획 패키지는 요청 중 짧게 실행되는 검토용 제안입니다. 별도 백그라운드 worker와 컷 렌더는 아직 연결되지 않았습니다.</p></div><div><button disabled={busy} onClick={()=>void enqueue('planning-package')}>현재 리비전 패키지 만들기</button><button disabled={busy} onClick={()=>void enqueue('render-preview')}>렌더 상태 확인</button></div></div>{jobs.length===0?<p className="vm-help">아직 저장된 작업이 없습니다.</p>:<div className="vm-job-list">{jobs.map(job=><article className="vm-job" key={job.id}><div><strong>{job.kind==='planning-package'?'계획 패키지':'렌더 미리보기'} · {job.status}</strong><span>리비전 {job.requestedRevision} · {job.progress}% · 시도 {job.attempt}회</span>{job.requestedRevision!==plan.revision?<span className="vm-job-stale">현재 리비전 {plan.revision}과 다릅니다</span>:null}<small>스냅샷 SHA-256 {job.snapshotSha256.slice(0,16)}…</small>{job.blocker?<p role="status">{job.blocker}</p>:null}{job.error?<p role="alert">{job.error}</p>:null}{job.recoveryReason?<p>{job.recoveryReason}</p>:null}</div><div className="vm-job-actions">{job.status==='queued'?<button disabled={busy} onClick={()=>void jobAction(job,'run')}>실행</button>:null}{job.status==='queued'||job.status==='running'?<button disabled={busy} onClick={()=>void jobAction(job,'cancel')}>취소</button>:null}{job.status==='running'?<button disabled={busy||!job.leaseExpiresAt||Date.parse(job.leaseExpiresAt)>Date.now()} onClick={()=>void jobAction(job,'recover')}>중단 복구</button>:null}{(job.status==='failed'||job.status==='cancelled')&&job.kind==='planning-package'?<button disabled={busy} onClick={()=>void jobAction(job,'retry')}>재시도</button>:null}{job.status==='succeeded'?job.artifacts.map(artifact=><button key={artifact.name} disabled={busy} onClick={()=>void download(job,artifact.name)}>{artifact.name} 받기</button>):null}</div></article>)}</div>}</section><footer className="vm-footer"><span>PLAN ONLY <b>·</b> 자료 등록과 제작 승인을 구분합니다.</span><div><button disabled={busy} onClick={()=>void exportPlan('csv')}>장면표 CSV</button><button disabled={busy} onClick={()=>void exportPlan('requirements')}>자료 요구 목록</button><button disabled={busy} onClick={()=>void exportPlan('handoff')}>파이프라인 전달안</button></div></footer>
    </>:<div className="vm-empty">프로젝트를 불러오는 중입니다…</div>}

    {scriptDraft!==null&&plan?<div className="vm-modal-shade"><section className="vm-modal" role="dialog" aria-modal="true" aria-labelledby="script-edit-title"><div className="vm-section-heading"><h2 id="script-edit-title">대본 변경 검토</h2><button disabled={busy} onClick={()=>{setScriptDraft(null);setDiff(null);}}>닫기</button></div><p>원문은 이력에 남습니다. 바뀐 장면은 방향 선택을 다시 검토합니다.</p><label>수정할 대본<textarea rows={12} value={scriptDraft} maxLength={30000} onChange={e=>{setScriptDraft(e.target.value);setDiff(null);}}/></label>{diff?<div className="vm-diff"><b>영향받는 장면 {diff.changedSceneIds.length}개</b><p>{diff.risks.length?diff.risks.join(' · '):'자동 검사가 의미 보존을 승인하지 않습니다. 문구를 직접 대조하세요.'}</p><div><pre>{diff.before}</pre><pre>{diff.after}</pre></div></div>:null}<div className="vm-form-actions"><button disabled={busy} onClick={()=>void work(async()=>{const result=await(await api('/api/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'diff',id:plan.id,text:scriptDraft})})).json();setDiff(result);})}>변경 영향 확인</button><button className="vm-primary" disabled={busy||!diff} onClick={()=>void work(async()=>{const result=await(await api('/api/studio',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:plan.id,baseRevision:plan.revision,command:{type:'revise-script',text:scriptDraft}})})).json();accept(result.plan);await refreshList();setScriptDraft(null);setDiff(null);setNotice('새 대본 리비전을 저장했습니다.');})}>검토한 수정 채택</button></div></section></div>:null}
  </main>;
}

function BeatEditor({plan,scene,busy,command}:{plan:Plan;scene:Scene;busy:boolean;command:(cmd:Command)=>Promise<void>}){
  const beat=plan.beats.find(b=>b.id===scene.beatIds[0])!;
  return <details className="vm-edit-detail"><summary>이 장면의 전달 목표 수정</summary><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void command({type:'edit-beat',beatId:beat.id,intent:String(f.get('intent')),role:f.get('role') as Beat['role']});}}><label>시청자에게 남길 한 문장<textarea name="intent" rows={3} defaultValue={beat.intent} required/></label><label>설명의 역할<select name="role" defaultValue={beat.role}>{Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button disabled={busy||scene.locked}>목표 저장</button></form></details>;
}

function CandidateEditor({candidate,index,scene,busy,command}:{candidate:Candidate;index:number;scene:Scene;busy:boolean;command:(cmd:Command)=>Promise<void>}){
  const isSelected=scene.selectedCandidateId===candidate.id;
  return <section className={`vm-candidate ${isSelected?'is-selected':''}`}><div className="vm-candidate-head"><span className="vm-option">{String.fromCharCode(65+index)}</span><span className={`vm-mode ${candidate.mode}`}>{modeLabels[candidate.mode]}</span><span className="vm-effort">{candidate.effort==='low'?'가벼운 구성':candidate.effort==='high'?'제작 작업 많음':'보통 구성'}</span></div><h3>{candidate.label}</h3><p>{candidate.reason}</p><ol className="vm-state-flow"><li><span>시작</span>{candidate.startState}</li><li><span>변화</span>{candidate.change}</li><li><span>도착</span>{candidate.endState}</li></ol><div className="vm-layer-list">{candidate.layers.map(layer=><div key={layer.id}><i className={layer.role}/><span>{layer.role==='focal'?'핵심':layer.role==='chrome'?'고지':'보조'}</span>{layer.description}</div>)}</div><p className="vm-effort-note">{candidate.effortBasis}</p><button className={isSelected?'vm-selected-button':'vm-select-button'} disabled={busy||scene.locked||isSelected} onClick={()=>void command({type:'select',sceneId:scene.id,candidateId:candidate.id})}>{isSelected?'✓ 선택한 방향':'이 표현 선택'}</button><details className="vm-edit-detail"><summary>직접 수정 · 선택 이유</summary><p className="vm-help">{candidate.rejectedModes.join(' / ')}</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const changes=Object.fromEntries(['label','reason','startState','change','endState'].map(key=>[key,String(f.get(key))]));void command({type:'edit-candidate',sceneId:scene.id,candidateId:candidate.id,changes});}}>{([['label','표현 이름'],['reason','이유'],['startState','시작'],['change','화면에서 달라질 내용'],['endState','마지막 상태']] as const).map(([field,label])=><label key={field}>{label}<textarea name={field} rows={2} defaultValue={candidate[field]} required maxLength={4000}/></label>)}<button disabled={busy||scene.locked}>표현 저장</button></form></details></section>;
}

function ReuseForm({plan,scene,busy,command}:{plan:Plan;scene:Scene;busy:boolean;command:(cmd:Command)=>Promise<void>}){
  const options=plan.scenes.filter(s=>s.id!==scene.id&&chosen(s));
  return <details className="vm-edit-detail"><summary>같은 자료·화면 재사용</summary><p className="vm-help">의미에 맞는 재사용 이유를 남깁니다. 같은 자료를 새 원본으로 세지 않습니다.</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void command({type:'reuse',sceneId:scene.id,fromSceneId:String(f.get('from')),reason:String(f.get('reason'))});}}><label>재사용할 장면<select name="from" required><option value="">장면 선택</option>{options.map(s=><option key={s.id} value={s.id}>{plan.scenes.indexOf(s)+1} · {chosen(s)?.label}</option>)}</select></label><label>의미상 재사용 이유<textarea name="reason" required rows={2}/></label><button disabled={busy||scene.locked||!options.length}>재사용 대안 만들기</button></form></details>;
}

function Sources({plan,scene,busy,upload,token}:{token:string;plan:Plan;scene:Scene;busy:boolean;upload:(form:FormData)=>Promise<void>}){
  const candidate=chosen(scene);
  const ids=[...new Set((candidate?[candidate]:scene.candidates).flatMap(c=>c.requirementIds))];
  return <><p className="vm-help">{candidate?'선택한 표현에 필요한 자료입니다.':'아직 방향을 고르지 않아 모든 대안의 자료 요구를 표시합니다.'} 검색어와 실제 원본은 다른 상태입니다.</p>{ids.map(id=>{const req=plan.requirements.find(r=>r.id===id)!;const asset=plan.assets.find(a=>a.id===req.assetId);return <section className="vm-source" key={id}><div className="vm-source-head"><span className="vm-mode">{req.mediaType==='image'?'사진':req.mediaType==='video'?'영상':'근거 데이터'}</span><span className="vm-badge">{asset?'등록 · 검토 전':'미확보'}</span></div><h3>{req.description}</h3><p>{req.sourceConstraint}</p><div className="vm-search-brief"><small>검색 지시 · {req.acquisition==='official'?'공식 원본':req.acquisition==='generated-keyframe'?'가상 PNG 키프레임':'외부 원본'}</small><p>{req.queryKo||'외부 검색 대상이 아닙니다.'}</p><p lang="en">{req.queryEn}</p></div>{req.queryKo?<a className="vm-search-link" href={`https://www.google.com/search?${new URLSearchParams({q:req.queryKo})}`} target="_blank" rel="noreferrer">검색어로 직접 찾기 ↗</a>:null}{asset?<div className="vm-asset"><b>{asset.originalName}</b><AssetPreview asset={asset} projectId={plan.id} token={token}/><span>{asset.width&&asset.height?`${asset.width} × ${asset.height}`:asset.mediaType}{asset.durationSeconds?` · ${asset.durationSeconds.toFixed(1)}초`:''}</span><a href={asset.sourceUrl} target="_blank" rel="noreferrer">원문 출처 ↗</a><p>{asset.semanticNote}</p><small>{asset.evidenceOnly?'화면 밖 근거 확인 전용':'화면용 원본 후보 · 승인 전'}<br/>원본 SHA-256 {asset.sha256.slice(0,16)}…</small></div>:null}<UploadForm requirement={req} locked={scene.locked} busy={busy} upload={upload}/></section>;})}</>;
}

function UploadForm({requirement,locked,busy,upload}:{requirement:Requirement;locked:boolean;busy:boolean;upload:(form:FormData)=>Promise<void>}){
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);form.set('requirementId',requirement.id);await upload(form);}
  return <details className="vm-edit-detail"><summary>원본 파일·출처 등록</summary><form onSubmit={e=>void submit(e)}><label>파일 (최대 40MB)<input name="file" type="file" required accept={requirement.mediaType==='image'?'.png,.jpg,.jpeg,.webp':requirement.mediaType==='video'?'.mp4,.webm':'.txt,.json'}/></label><label>원문 URL<input name="sourceUrl" type="url" required placeholder="https://…"/></label><label>제작자·기관<input name="creator" required/></label><label>사용 조건 · 확인 근거<textarea name="rightsNote" rows={2} required placeholder="항목별 이용 조건과 아직 확인할 내용"/></label><label>대상·행동·구간 대응<textarea name="semanticNote" rows={2} required placeholder="이 자료가 무엇을 보여주고, 무엇은 보여주지 않는지"/></label><label>자료 용도<select name="evidenceOnly" defaultValue="true"><option value="true">화면 밖 근거 확인 전용 (캡처 포함)</option>{requirement.mediaType!=='data'?<option value="false">원본 사진·영상 / 가상 키프레임 후보</option>:null}</select></label><p className="vm-help">캡처 화면은 근거 확인 전용입니다. 등록만으로 의미·권리·제작 승인이 되지 않습니다.</p><button disabled={busy||locked}>검증 후 등록</button></form></details>;
}

function AssetPreview({asset,projectId,token}:{asset:Asset;projectId:string;token:string}){
  const [preview,setPreview]=useState<{url:string;text:string}|null>(null);
  const [failure,setFailure]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let blobUrl='';
    (async()=>{try{
      const response=await fetch(`/api/studio/media?${new URLSearchParams({id:projectId,assetId:asset.id})}`,{headers:{'x-visualmaker-token':token},signal:controller.signal});
      if(!response.ok){const body=await response.json();throw new Error(body.error||'자료를 읽지 못했습니다.');}
      if(asset.mediaType==='data'){const text=await response.text();if(!controller.signal.aborted)setPreview({url:'',text:text.slice(0,6000)});}
      else{const blob=await response.blob();if(!controller.signal.aborted){blobUrl=URL.createObjectURL(blob);setPreview({url:blobUrl,text:''});}}
    }catch(e){if(!controller.signal.aborted)setFailure(e instanceof Error?e.message:String(e));}})();
    return()=>{controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
  },[asset.id,asset.mediaType,projectId,token]);
  if(failure)return <p role="alert">{failure}</p>;
  if(!preview)return <p>등록 원본 확인 중…</p>;
  return <div className="vm-media-preview"><small>자료 검토용 · 제작 프레임 아님</small>{asset.mediaType==='image'?<Image unoptimized src={preview.url} alt={asset.semanticNote} width={asset.width||640} height={asset.height||360}/>:asset.mediaType==='video'?<video controls src={preview.url} preload="metadata"/>:<pre>{preview.text}</pre>}</div>;
}
