import {ArrowUpRight} from 'lucide-react';

export type ReadingCandidate = {
 video_id:string;title:string;url:string;channel_title:string;domain_hint:string;
 flags:string[];views:number|null;duration_seconds:number;intake_status:string;activity_status:string;
};
export type NarrativeGroup = {
 event_key:string;trend_status:string;members:{intake_id:string;video_id:string;domain:string;
 content_kind:string;summary:string;hook:string;change:string;payoff:string;actor:string;model:string}[];
};
export type QueryPlan = {query:string;origin:string;lane?:string;topic_id:string|null};
const domains:Record<string,string>={relationships:'관계',work:'직장',daily_life:'일상',hobbies:'취미',culture:'문화',curiosity:'호기심'};
const flags:Record<string,string>={language_check:'언어 확인 필요',long_reference:'긴 참고 영상',duration_unknown:'길이 미확인',commercial_title:'판매 표현 확인'};
const kinds:Record<string,string>={fiction:'창작 이야기',personal_story:'개인 사연',reported_event:'보도된 사건',explanation:'사실·현상 설명'};

export default function StoryIntake({queue,groups,counts,plan}:{queue:ReadingCandidate[];groups:NarrativeGroup[];counts:Record<string,number>;plan:QueryPlan[]}){
 return <section className="story-intake" aria-label="상품을 고려하기 전 이야기 검토">
  <div className="story-section-title"><div><p className="eyebrow">READ → UNDERSTAND → CONNECT</p><h2>먼저, 볼 만한 이야기인가요?</h2></div><span className="small muted">이야기 후보 {counts.candidate||0} · 내용 확인 대기 {counts.needs_content||0} · 제외 {counts.reject||0}</span></div>
  <p className="story-intake-intro">관계·직장·일상·취미·문화·호기심을 고르게 읽습니다. 첫 검토는 도입, 변화, 결말과 사실·창작 여부만 기록합니다.</p>
  {groups.length>0&&<div className="story-narratives">{groups.map(group=><article className="panel story-narrative" key={group.event_key}>
   <div className="row-between"><span className="pill green">이야기 구조 확인</span><span className="small muted">관심 상승 · 상품 연결은 별도 검토</span></div>
   {group.members.map(member=><div key={member.intake_id}>
    <h3>{member.summary}</h3><div className="story-intake-tags"><span>{domains[member.domain]}</span><span>{kinds[member.content_kind]||member.content_kind}</span></div>
    <dl><div><dt>도입</dt><dd>{member.hook}</dd></div><div><dt>변화</dt><dd>{member.change}</dd></div><div><dt>결말</dt><dd>{member.payoff}</dd></div></dl>
    <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(member.video_id)}`} target="_blank" rel="noreferrer">원본 확인 <ArrowUpRight size={12}/></a><p className="helper">검토: {member.actor} · {member.model}</p>
   </div>)}
  </article>)}</div>}
  <details className="panel story-reading" open><summary>다음에 읽을 영상 {queue.length}개</summary><p>분야와 제목 단서는 읽기 순서를 위한 임시 분류입니다. 조회수가 높아도 썰이나 유행으로 확정하지 않습니다.</p>
   <div className="story-reading-grid">{queue.map((row,i)=><article key={row.video_id}>
    <div className="row-between"><span className="story-reading-number">{String(i+1).padStart(2,'0')}</span><span className="small muted">{domains[row.domain_hint]} · 임시</span></div>
    <a href={row.url} target="_blank" rel="noreferrer">{row.title}<ArrowUpRight size={13}/></a><small>{row.channel_title} · {row.duration_seconds?`${row.duration_seconds}초`:'길이 미확인'} · 조회 {row.views?.toLocaleString('ko-KR')??'미확인'}</small>
    <div className="story-intake-tags">{row.flags.map(f=><span key={f}>{flags[f]||f}</span>)}{row.intake_status==='needs_content'&&<span>본문 추가 확인</span>}{row.activity_status==='activity_unknown'&&<span>채널 활동 미확인</span>}</div>
   </article>)}</div>{!queue.length&&<p>검토할 새 영상이 없습니다. 수집을 실행하면 이곳에 표시됩니다.</p>}
  </details>
  <details className="panel story-next-queries"><summary>다음 수집에 사용할 탐색어</summary><p>폭넓은 탐색 2건마다 확인한 이야기의 후속 질문 1건을 배치합니다.</p><ol>{plan.map(p=><li key={p.query}><span>{p.query}</span><small>{p.origin==='bootstrap'?`${domains[p.lane||'']||'새 분야'} 탐색`:'관측 이야기 확장'}</small></li>)}</ol></details>
 </section>;
}
