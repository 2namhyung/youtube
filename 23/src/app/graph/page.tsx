import Link from 'next/link';
import { getClaimPaths, getGraphOverview } from '@/lib/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function GraphPage() {
  const overview = getGraphOverview();
  const paths = getClaimPaths(6);
  return <main className="data-page"><div className="data-page-inner"><div className="data-nav"><Link href="/">← 스토리보드</Link><Link href="/graph/explorer">전체 주장 탐색 →</Link></div><h1 className="data-title">정치 기록 그래프</h1><p className="data-lead">현직 국회의원과 주장, 공식 근거를 연결해 영상 소재의 출처 경로를 확인합니다.</p><div className="metric-grid"><div className="metric-card"><small>GRAPH NODES</small><strong>{overview.nodes}</strong></div><div className="metric-card"><small>GRAPH EDGES</small><strong>{overview.edges}</strong></div><div className="metric-card"><small>CLAIMS</small><strong>{overview.claims}</strong></div><div className="metric-card"><small>EVIDENCE</small><strong>{overview.evidence}</strong></div><div className="metric-card"><small>검토 대기</small><strong>{overview.pendingReview}</strong></div></div><section className="data-panel"><h2>승인된 주장 → 근거 경로</h2>{paths.length ? <div className="path-list">{paths.map((path) => <article className="path-card" key={path.id}><strong>{path.statement}</strong><small>{path.category} · 신뢰도 {path.confidence}점 · 승인됨</small><div className="evidence-chips">{path.evidence.length ? path.evidence.map((evidence) => <span className="evidence-chip" key={evidence.id}>↳ {evidence.support_type.toUpperCase()} · {evidence.title}{evidence.locator ? ` · ${evidence.locator}` : ''}</span>) : <span className="evidence-chip">근거 연결 대기</span>}</div></article>)}</div> : <p>현재 검증이 만료되지 않은 현직 의원의 승인 주장이 없습니다.</p>}</section><section className="data-panel"><h2>운영 원칙</h2><p>국회·선관위 등 1차 자료를 우선하며, Poliwiki는 발견과 누락 점검용으로만 표시합니다. 로스터 API로 들어온 행은 현직으로 확정하지 않고 검토 큐에 staged 상태로 보관합니다.</p></section></div></main>;
}
