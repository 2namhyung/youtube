import Link from 'next/link';
import { runPolicyCollectionAction } from '@/app/actions';
import { getPolicyCandidates, getPolicyRadarSummary } from '@/lib/db';
import { POLICY_STAGE_LABELS } from '@/lib/policy';

export const dynamic = 'force-dynamic';

export default function IssuesPage() {
  const candidates = getPolicyCandidates();
  const summary = getPolicyRadarSummary();
  const eligible = candidates.filter((candidate) => candidate.eligible === 1).length;
  return <main className="data-page"><div className="data-page-inner">
    <div className="data-nav"><Link href="/">← 스토리보드</Link><Link href="/sources">수집원 상태 →</Link></div>
    <div className="issue-heading"><div><p className="eyebrow">POLICY RADAR · DEMO + STAGED</p><h1 className="data-title">정책 이슈 후보</h1><p className="data-lead">입법 상태를 먼저 찾고, 기사·검색·민원 신호를 엮어 영상 조사 후보를 만듭니다. 가상 데모와 공식 수집 staged 자료를 구분해 표시합니다.</p></div><div className="issue-heading-actions"><div className="issue-summary"><strong>{eligible}</strong><span>70점 이상<br />조사 후보</span></div><form action={runPolicyCollectionAction}><button className="primary-btn" type="submit">공식 정책 수집</button></form></div></div>
    <section className="data-panel"><div className="panel-heading"><div><h2>현재 움직이는 정책</h2><p>발의와 시행을 구분하고, 원인 관계는 확인 전까지 가능성으로만 기록합니다.</p></div><span className="status-pill discovery">DEMO · 교체 필요</span></div>
      <div className="issue-list">{candidates.map((candidate) => <article className="issue-card" key={candidate.id}>
        <div className="issue-card-top"><div><span className="issue-kicker">{candidate.is_demo ? '가상 데모' : '공식 수집 · 검토 대기'} · {candidate.score}점</span><h3>{candidate.title}</h3></div><span className={`status-pill ${candidate.eligible ? '' : 'warn'}`}>{candidate.eligible ? '조사 후보' : '보류'}</span></div>
        <p className="issue-summary">{candidate.editorial_summary}</p>
        <div className="issue-meta"><span><b>현재 단계</b>{POLICY_STAGE_LABELS[candidate.current_stage]}</span><span><b>영향 집단</b>{candidate.impact_groups}</span><span><b>검증 상태</b>{candidate.verification_state}</span><span><b>최근 상태일</b>{candidate.latest_status_date ?? '미확인'}</span></div>
        <div className="issue-grid"><div><h4>정책 상태 기록</h4>{candidate.status_events.map((event) => <div className="issue-line" key={event.id}><span className="status-pill">{POLICY_STAGE_LABELS[event.event_type]}</span><span>{event.event_date}</span><small>{event.note} · {event.source_label}{event.source_url ? <> · <a href={event.source_url} target="_blank" rel="noreferrer">원문</a></> : null}</small></div>)}</div><div><h4>민원·이슈 신호</h4>{candidate.signals.map((signal, index) => <div className="issue-line" key={`${signal.keyword}-${index}`}><span className="status-pill discovery">{signal.source_type}</span><span>{signal.keyword}</span><small>{signal.count_or_note}{signal.source_url ? <> · <a href={signal.source_url} target="_blank" rel="noreferrer">원문</a></> : null}</small></div>)}</div></div>
        <div className="score-bar"><span>생활 {candidate.score_json.생활영향}/25</span><span>이슈 {candidate.score_json.이슈화}/15</span><span>민원 {candidate.score_json.민원}/20</span><span>시행 {candidate.score_json.시행긴급성}/15</span><span>책임 {candidate.score_json.정치인책임}/15</span><span>자료 {candidate.score_json.자료확보}/10</span></div>
        <div className="issue-foot"><span>관계: <b>POLICY → POSSIBLY_AFFECTED_BY → COMPLAINT</b></span><span>{candidate.is_demo ? '출처: 가상 데모 · 실제 자료로 교체 필요' : '출처: 공식 원문 provenance 보존 · 검토 필요'}</span></div>
      </article>)}</div>
    </section>
    <section className="data-panel"><h2>매칭 현황</h2><div className="issue-meta"><span><b>실제 정책</b>{summary.realPolicies}건</span><span><b>매칭 없는 정책</b>{summary.unmatchedPolicies}건</span><span><b>실제 민원 클러스터</b>{summary.realComplaints}건</span><span><b>매칭 없는 민원</b>{summary.unmatchedComplaints}건</span><span><b>검토 대기 매칭</b>{summary.needsReviewMatches}건</span></div><p className="issue-summary">매칭이 없는 정책·민원도 버리지 않고 별도 조사 대상으로 남깁니다. 자동 연결은 점수 0·검토 대기이며, 확정 영향 관계를 만들지 않습니다.</p></section>
    <section className="data-panel issue-rules"><h2>후보 점수 규칙</h2><p>생활영향 25 · 이슈화 15 · 민원 20 · 시행긴급성 15 · 정치인 책임 15 · 자료 확보 10. 합계 70점 이상만 조사 후보로 올립니다. 실제 수집분은 공식 원문과 민원 원자료를 붙인 뒤 검증 상태를 바꿉니다.</p></section>
  </div></main>;
}
