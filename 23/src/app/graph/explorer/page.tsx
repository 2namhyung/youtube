import Link from 'next/link';
import { getClaimPaths } from '@/lib/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function GraphExplorerPage() {
  const paths = getClaimPaths(200);
  return <main className="data-page"><div className="data-page-inner"><div className="data-nav"><Link href="/graph">← 그래프 개요</Link><Link href="/review">검토 큐 →</Link></div><h1 className="data-title">주장 탐색</h1><p className="data-lead">검증이 만료되지 않은 현직 의원의 승인 주장과 실제 근거 관계만 표시합니다.</p><section className="data-panel"><div className="path-list">{paths.length ? paths.map((path) => <article className="path-card" key={path.id}><strong>{path.statement}</strong><small>{path.subject_label ? `${path.subject_label} · ` : ''}{path.occurred_at ?? '날짜 미확인'} · 승인됨 · 신뢰도 {path.confidence}</small>{path.evidence.map((evidence) => <div className="evidence-chips" key={evidence.id}><span className="evidence-chip">{evidence.support_type.toUpperCase()}</span><span className="evidence-chip">{evidence.title} · {evidence.publisher || '발행처 미입력'}{evidence.locator ? ` · ${evidence.locator}` : ''}</span></div>)}</article>) : <p>현재 검증이 만료되지 않은 현직 의원의 승인 주장이 없습니다.</p>}</div></section></div></main>;
}
