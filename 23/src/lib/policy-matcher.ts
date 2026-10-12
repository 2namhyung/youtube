export type MatchRelation = 'RELATED_TO' | 'POSSIBLY_AFFECTED_BY';
export type MatchInput = { title: string; date?: string | null };
export type ComplaintMatchInput = { keyword: string; date?: string | null };
export type PolicyComplaintMatch = { relation: MatchRelation; matchedTerms: string[]; evidence: { kind: 'exact' | 'alias'; policyTerms: string[]; complaintTerms: string[]; windowDays: number }; reviewState: 'needs_review' };

const STOPWORDS = new Set(['정책', '법안', '관련', '변경', '제도', '대상', '지원', '의무', '확대', '개정', '추진', '마련']);
export const DEFAULT_LIVING_ALIASES: Record<string, string[]> = {
  월세: ['주거', '임대료', '월세지원'],
  교통비: ['교통', '대중교통', '버스', '지하철'],
  교통: ['교통비', '대중교통', '버스', '지하철'],
  대중교통: ['교통비', '교통', '버스', '지하철'],
  수수료: ['플랫폼', '배달', '중개수수료'],
  전세: ['주거', '임대차', '보증금'],
  육아: ['돌봄', '보육', '아이'],
  통신: ['휴대폰', '인터넷', '통신비'],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}
export function tokenize(value: string) {
  return [...new Set(normalize(value).split(' ').filter((term) => term.length >= 2 && !STOPWORDS.has(term)))];
}
function dateValue(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const date = new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function withinDays(left?: string | null, right?: string | null, windowDays = 90) {
  const a = dateValue(left); const b = dateValue(right);
  return Boolean(a && b && Math.abs(a.getTime() - b.getTime()) <= windowDays * 86_400_000);
}

/** Match only a strong exact token or an explicit 생활어 alias within a bounded time window. */
export function matchPolicyToComplaint(policy: MatchInput, complaint: ComplaintMatchInput, options: { windowDays?: number; aliases?: Record<string, string[]> } = {}): PolicyComplaintMatch | null {
  const windowDays = options.windowDays ?? 90;
  if (!withinDays(policy.date, complaint.date, windowDays)) return null;
  const policyTerms = tokenize(policy.title); const complaintTerms = tokenize(complaint.keyword);
  const exact = policyTerms.filter((term) => complaintTerms.includes(term));
  if (exact.length) return { relation: 'POSSIBLY_AFFECTED_BY', matchedTerms: exact, evidence: { kind: 'exact', policyTerms, complaintTerms, windowDays }, reviewState: 'needs_review' };
  const aliases = options.aliases ?? DEFAULT_LIVING_ALIASES;
  const aliasPairs: string[] = [];
  for (const policyTerm of policyTerms) for (const alias of aliases[policyTerm] ?? []) if (complaintTerms.includes(alias)) aliasPairs.push(`${policyTerm}→${alias}`);
  if (!aliasPairs.length) return null;
  return { relation: 'RELATED_TO', matchedTerms: aliasPairs, evidence: { kind: 'alias', policyTerms, complaintTerms, windowDays }, reviewState: 'needs_review' };
}
