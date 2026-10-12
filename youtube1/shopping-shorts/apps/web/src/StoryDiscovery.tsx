import {useEffect, useState} from 'react';
import {ArrowUpRight, Download, LoaderCircle, RefreshCw, Search} from 'lucide-react';
import StoryIntake, {type ReadingCandidate, type NarrativeGroup, type QueryPlan} from './StoryIntake';
import './story.css';

type Api = (path:string, body?:unknown, method?:string)=>Promise<any>;
type Topic = {
 topic_id:string; topic:string; angle:string; why_now:string; status:string;
 gates:Record<string,string>; story:{content_kind:string;hook:string;setup:string;turn:string;payoff:string};
 bridges:{category:string;reason:string;placement:string}[];
 missing_evidence:string[]; sources:{id:string;url:string;title:string}[];
 activity_unknown:string[]; activity_excluded:string[];
 actor:string; model:string;
 planning_status:string;
 planning_brief:null|{working_title:string;audience:string;opening:string;beats:string[];ending:string;product_placement:string;avoid:string[];next_checks:string[]};
 measurements:{video_id:string;views:number|null;observed_at:string;delta:number|null;elapsed_minutes:number|null}[];
};
type Candidate = {video_id:string;title:string;url:string;channel_title:string;views:number|null;duration_seconds:number;activity_status:string;published_at:string};
type Dashboard = {topics:Topic[];candidates:Candidate[];candidates_total:number;sources_total:number;status_counts:Record<string,number>;generated_at:string;reading_queue:ReadingCandidate[];narrative_groups:NarrativeGroup[];intake_counts:Record<string,number>;next_query_plan:QueryPlan[];last_run:null|{searches_completed:number;videos_hydrated:number;stats_refreshed:number;stops:{stage:string;reason:string}[]}};
const labels:Record<string,string> = {
 ready_for_product_research:'상품 조사 가능',activity_unknown:'채널 활동 확인 대기',channel_inactive:'채널 활동 기준 미달',
 trend_unconfirmed:'관심 상승 확인 대기',story_not_primary:'이야기 중심 아님',no_natural_bridge:'상품 연결 부족',needs_observation:'본문 확인 필요',
 active:'90일 · 5개 이상',below_minimum:'활동 기준 미달',pass:'확인',unknown:'미확인',fail:'미달',
};
function download(value:unknown, name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function StoryDiscovery({api,project,onSelected}:{api:Api;project?:{id:string;revision:number};onSelected:()=>Promise<void>}){
 const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [credentials,setCredentials]=useState<{configured:number;cooldowns:Record<string,{retry_not_before:string}>}|null>(null);
 const [queries,setQueries]=useState(''),[input,setInput]=useState(''),[kind,setKind]=useState('evidence');
 const [filter,setFilter]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{let alive=true;api('/v1/story-discovery').then(d=>{if(alive)setData(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[api]);
 useEffect(()=>{let alive=true;api('/v1/story-discovery/credentials').then(d=>{if(alive)setCredentials(d);}).catch(()=>{if(alive)setCredentials(null);});return()=>{alive=false;};},[api]);
 const run=async(name:string, action:()=>Promise<void>)=>{setBusy(name);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const refresh=async()=>{const [d,c]=await Promise.all([api('/v1/story-discovery'),api('/v1/story-discovery/credentials')]);setData(d);setCredentials(c);};
 const collect=async(statsOnly=false)=>{
  await api('/v1/story-discovery/collect',{queries:statsOnly?[]:queries.split('\n').map(s=>s.trim()).filter(Boolean),search_budget:statsOnly?0:6,read_budget:statsOnly?0:100,stats_budget:20,window_days:7,max_candidates:150});
  await refresh();
 };
 const topics=data?.topics.filter(t=>!filter||t.status===filter)||[];
 const candidates=data?.candidates.filter(c=>`${c.title} ${c.channel_title}`.toLowerCase().includes(search.toLowerCase()))||[];
 return <div className="story-discovery">
  <div className="page-heading"><div><p className="eyebrow">01 / STORY DISCOVERY</p><h1>이야기가 먼저, 상품은 그다음.</h1><p>지금 관심이 커지는 이야기에서, 상품이 자연스럽게 등장할 자리를 찾습니다.</p></div><button className="button" disabled={!!busy} onClick={()=>void run('refresh',refresh)}><RefreshCw size={15}/>새로고침</button></div>
  {error&&<div className="notice" role="alert">{error}</div>}
  <div className="story-counts" aria-label="주제 발굴 현황"><div><strong>{data?.candidates_total??'—'}</strong><span>수집 영상 · 의미 검토 전 포함</span></div><div><strong>{data?.topics.length??'—'}</strong><span>근거를 연결한 주제</span></div><div><strong>{data?.status_counts.ready_for_product_research||0}</strong><span>다음 단계로 넘길 주제</span></div></div>
  <section className="panel story-planning"><div className="row-between"><div><p className="eyebrow">기획에 활용할 결과물</p><h2>이야기 기획안 {data?.topics.filter(t=>t.planning_brief).length||0}개</h2></div><a className="button" href="/v1/story-discovery/planning-report" download><Download size={15}/>기획안 내려받기</a></div><p>기획 후보 {data?.topics.filter(t=>t.planning_brief&&t.planning_status==='planning_candidate').length||0}개 · 현재 유행까지 확인 {data?.status_counts.ready_for_product_research||0}개. 이야기·상품 연결·90일 활동을 확인하면 기획에 활용할 수 있습니다. 관심 상승 확인과 제작 결정은 별도입니다.</p>
  <div className="story-topic-grid">{data?.topics.filter(t=>t.planning_brief).sort((a,b)=>Number(b.planning_status==='planning_candidate')-Number(a.planning_status==='planning_candidate')).map(t=>{const b=t.planning_brief!;return <article className="story-topic" key={t.topic_id}><span className={'pill '+(t.planning_status==='planning_candidate'?'green':'')}>{t.planning_status==='planning_candidate'?'기획 후보':'참고용 · 확인 대기'}</span><h3>{b.working_title}</h3><p className="muted">{b.audience}</p><p className="story-angle">{b.opening}</p><ol>{b.beats.map((s,i)=><li key={i}>{s}</li>)}</ol><p><strong>결말</strong> · {b.ending}</p><p><strong>상품을 놓을 자리</strong> · {b.product_placement}</p><details><summary>근거와 남은 확인</summary>{t.measurements.map(m=><p key={m.video_id}><a href={`https://www.youtube.com/watch?v=${m.video_id}`} target="_blank" rel="noreferrer">원 영상</a> · {m.views?.toLocaleString('ko-KR')??'미확인'}회{m.delta!==null&&m.elapsed_minutes!==null?` / ${Math.round(m.elapsed_minutes)}분 동안 ${m.delta>=0?'+':''}${m.delta.toLocaleString('ko-KR')}회`:''}<br/><small>{new Date(m.observed_at).toLocaleString('ko-KR')} 관측 · 이 값만으로 유행을 확정하지 않음</small></p>)}<ul>{[...b.avoid,...b.next_checks].map((s,i)=><li key={i}>{s}</li>)}</ul></details></article>})}</div></section>
  <section className="panel story-collect"><div><h2>이야기의 씨앗 수집</h2><p>관계·직장·일상·취미·문화·호기심에서 시작해, 실제 확인한 이야기의 후속 질문으로 넓혀 갑니다. 쇼핑 태그는 진입 조건이 아닙니다.</p><label>추가 탐색어 <span className="muted">선택 · 한 줄에 하나, 최대 12개</span><textarea rows={2} value={queries} onChange={e=>setQueries(e.target.value)} placeholder="예: 부부가 서로 다른 수면 습관을 조율하는 이야기"/></label></div><div className="story-collect-actions"><button className="button primary" disabled={!!busy} onClick={()=>void run('collect',()=>collect())}>{busy==='collect'?<LoaderCircle className="spin" size={16}/>:<Search size={16}/>}최근 7일 수집</button><button className="button" disabled={!!busy} onClick={()=>void run('stats',()=>collect(true))}>기존 영상 조회수 관측</button><button className="button" disabled={!!busy} onClick={()=>void run('packet',async()=>download(await api('/v1/story-discovery/packet'),'story-review-packet.json'))}><Download size={15}/>Luna 검토 자료 · 5개</button><small>현재 작업에서 Chrome으로 읽고 검토합니다.<br/>버튼이 모델을 자동 실행하지는 않습니다.</small></div></section>
  <p className="story-credentials">YouTube API 키 {credentials?.configured??'확인 중'}개 등록 · 인증 오류 시 예비 키 전환 · 할당량 소진 시 중단 기록</p>
  {Object.entries(credentials?.cooldowns||{}).map(([bucket,block])=><p className="story-credentials" key={bucket}>{({read:'상세 정보',search:'검색',stats:'조회수'} as Record<string,string>)[bucket]||bucket} 요청 대기: {new Date(block.retry_not_before).toLocaleString('ko-KR')} 이후 재시도 가능 · 일일 소진은 태평양 자정에 1분을 더하고, 요청 속도 제한은 응답의 재시도 간격을 따릅니다.</p>)}
  {data?.last_run&&<details className="story-run"><summary>최근 수집: 검색 {data.last_run.searches_completed}건 · 영상 {data.last_run.videos_hydrated}개 · 조회수 {data.last_run.stats_refreshed}개 관측{data.last_run.stops.length>0?' · 일부 요청 중단':''}</summary>{data.last_run.stops.map((s,i)=><p key={i}>{s.stage}: {s.reason}</p>)}</details>}
  {data&&<StoryIntake queue={data.reading_queue} groups={data.narrative_groups} counts={data.intake_counts} plan={data.next_query_plan}/>}
  <div className="story-section-title"><h2>트렌드 · 상품 연결 검토</h2><label>상태 필터<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">전체</option>{Object.entries(data?.status_counts||{}).map(([s,n])=><option value={s} key={s}>{labels[s]||s} ({n})</option>)}</select></label></div>
  {!data?<p role="status" className="empty-inline">발굴 자료를 불러오고 있습니다.</p>:!topics.length?<div className="panel empty-inline">검토한 주제가 없습니다. 실제 내용을 읽고 주장·근거·상품 연결을 등록하세요.</div>:<div className="story-topic-grid">{topics.map(t=><article className="panel story-topic" key={t.topic_id}>
   <div className="row-between"><span className={'pill '+(t.status==='ready_for_product_research'?'green':'')}>{labels[t.status]||t.status}</span><span className="small muted">{t.topic_id}</span></div><h3>{t.topic}</h3><p className="story-angle">{t.angle}</p>{t.story.content_kind==='fiction'&&<span className="pill">창작 이야기 · 실제 사건 아님</span>}
   <div className="story-gates">{[['story','이야기'],['trend','관심 상승'],['bridge','상품 연결']].map(([k,label])=><span key={k} className={t.gates[k]==='pass'?'passed':''}>{label} <strong>{labels[t.gates[k]]||t.gates[k]}</strong></span>)}</div>
   <p className="story-now">{t.why_now}</p><details><summary>이야기와 상품 연결 읽기</summary><dl>{[['hook','도입'],['setup','배경'],['turn','전환'],['payoff','결말']].map(([k,label])=><div key={k}><dt>{label}</dt><dd>{t.story[k as keyof typeof t.story]}</dd></div>)}</dl><h4>자연스럽게 연결할 상품군</h4>{t.bridges.length?t.bridges.map((b,i)=><p key={i}><strong>{b.category}</strong> · {b.reason}<br/><span className="muted">등장 위치: {b.placement}</span></p>):<p>억지 연결 없이 성립하는 상품군을 아직 찾지 못했습니다.</p>}<p className="helper">상품의 정확한 모델·판매처·주장은 2단계에서 확인합니다.</p></details>
   <div className="story-missing">{t.activity_unknown.length>0&&<p>최근 90일 업로드 5개 이상인지 확인하지 못한 채널 {t.activity_unknown.length}개</p>}{t.activity_excluded.length>0&&<p>활동 기준 미달 채널 {t.activity_excluded.length}개</p>}{t.missing_evidence.map((m,i)=><p key={i}>{m}</p>)}</div>
   <details><summary>확인한 출처 {t.sources.length}개</summary><ul className="story-sources">{t.sources.map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={12}/></a></li>)}</ul><p className="helper">검토: {t.actor} · {t.model}</p></details>
   <button className="button full" disabled={!!busy||!project||t.status!=='ready_for_product_research'} onClick={()=>void run('select',async()=>{if(!project)return;await api(`/v1/projects/${project.id}/story-opportunity`,{topic_id:t.topic_id,expected_revision:project.revision});await onSelected();})}>선택한 프로젝트의 상품 조사로 연결</button>
  </article>)}</div>}
  <details className="panel story-candidates"><summary>수집한 영상 {data?.candidates_total||0}개 살펴보기</summary><p>검색 결과에는 긴 영상·다른 언어·광고가 섞입니다. 길이와 제목만으로 썰 쇼츠로 확정하지 않습니다. 표는 최대 150개를 표시합니다.</p><label>제목·채널 검색<input value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="story-table-wrap"><table><thead><tr><th>영상 / 채널</th><th>게시일</th><th>길이</th><th>관측 조회수</th><th>채널 활동</th></tr></thead><tbody>{candidates.map(c=><tr key={c.video_id}><td><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a><small>{c.channel_title}</small></td><td>{new Date(c.published_at).toLocaleDateString('ko-KR')}</td><td>{c.duration_seconds?`${c.duration_seconds}초`:'미확인'}</td><td>{c.views?.toLocaleString('ko-KR')??'미제공'}</td><td>{labels[c.activity_status]||c.activity_status}</td></tr>)}</tbody></table></div></details>
  <details className="panel story-submit"><summary>근거 · 검토 결과 등록</summary><p>검토 자료의 스키마를 사용합니다. 실제 실행한 모델을 기록하고, 근거 등록으로 반환된 ID를 주제 검토에 연결하세요.</p><label>등록 종류<select value={kind} onChange={e=>setKind(e.target.value)}><option value="evidence">관측 근거</option><option value="intakes">이야기 첫 검토 · 상품 판단 전</option><option value="channel-observations">Chrome 채널 활동 근거</option><option value="intake-batches">이야기 첫 검토 묶음 · 최대 5개</option><option value="reviews">트렌드 · 상품 연결 검토</option></select></label><label>검토 JSON<textarea rows={8} value={input} onChange={e=>setInput(e.target.value)}/></label><button className="button" disabled={!!busy||!input.trim()} onClick={()=>void run('submit',async()=>{const result=await api(`/v1/story-discovery/${kind}`,JSON.parse(input));download(result,`${kind}-receipt.json`);setInput('');await refresh();})}>등록하고 결과 저장</button></details>
 </div>;
}
