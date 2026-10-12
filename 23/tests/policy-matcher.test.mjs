import test from 'node:test';
import assert from 'node:assert/strict';
const { matchPolicyToComplaint, tokenize } = await import('../src/lib/policy-matcher.ts');

test('matcher uses exact living token within date window', () => {
  const result = matchPolicyToComplaint({ title: '청년 월세 지원 법안', date: '2026.08.01' }, { keyword: '월세 부담', date: '2026-08-20' });
  assert.equal(result.relation, 'POSSIBLY_AFFECTED_BY'); assert.deepEqual(result.matchedTerms, ['월세']); assert.equal(result.reviewState, 'needs_review');
});

test('matcher supports explicit 생활어 aliases but rejects generic false positives', () => {
  const alias = matchPolicyToComplaint({ title: '대중교통 요금 조정안', date: '2026.08.01' }, { keyword: '교통비 부담', date: '2026.08.20' });
  assert.equal(alias.relation, 'RELATED_TO'); assert.ok(alias.matchedTerms.some((term) => term.includes('교통')));
  assert.equal(matchPolicyToComplaint({ title: '청년 지원 정책', date: '2026.08.01' }, { keyword: '지원 대상 문의', date: '2026.08.20' }), null);
});

test('matcher enforces bounded date window and normalized tokens', () => {
  assert.equal(matchPolicyToComplaint({ title: '플랫폼 수수료 표시', date: '2026.01.01' }, { keyword: '플랫폼 수수료', date: '2026.08.20' }), null);
  assert.deepEqual(tokenize('청년·월세 지원!'), ['청년', '월세']);
});
