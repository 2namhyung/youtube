import type {Asset, SourceReviewDimension, SourceReviewState} from './model.ts';

const dimensions: SourceReviewDimension[] = ['source', 'rights', 'semantic'];

/** Planning observation only; this label never expresses production readiness. */
export function reviewBadge(asset: Asset | null | undefined, state: SourceReviewState | undefined): string {
  if (!asset) return state?.history.length ? '미확보 · 과거 검토 이력 있음' : '미확보';
  const current = state?.current;
  if (current && dimensions.some(dimension => current[dimension]?.decision === 'rejected')) return '반려 기록 있음';
  if (current && dimensions.every(dimension => current[dimension]?.decision === 'acceptable')) return '3개 관찰 기록됨 · 제작 승인 전';
  const staleAssessment = dimensions.some(dimension =>
    current?.[dimension]?.decision !== 'acceptable' &&
    state?.history.some(item => item.dimension === dimension && (item.decision === 'acceptable' || item.decision === 'rejected')));
  if (staleAssessment) return '등록 · 재검토 대기';
  if (current && dimensions.some(dimension => current[dimension]?.decision === 'acceptable')) return '등록 · 검토 진행 중';
  return '등록 · 검토 대기';
}
