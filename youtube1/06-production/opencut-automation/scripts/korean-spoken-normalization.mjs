import crypto from 'node:crypto';

export const KOREAN_SPOKEN_NORMALIZATION_SCHEMA = 'korean-spoken-normalization-v1';
export const KOREAN_SPOKEN_NORMALIZATION_RULES = Object.freeze({
  'legal-sentence-reduction-plain-v1': Object.freeze({
    source: '감형됐습니다',
    target: '형이 줄었습니다',
    requiredContext: '집행유예 3년으로',
    equivalence: 'plain-language restatement of a reduced appellate sentence; no charge, term, or suspension figure changes',
  }),
  'legal-attempted-murder-plain-v1': Object.freeze({
    source: '살인미수',
    target: '사람을 죽이려 한 행동',
    sourceSuffix: '를',
    targetSuffix: '을',
    requiredContext: '검찰은',
    equivalence: 'audience-friendly restatement of the prosecution theory; it remains explicitly attributed to the prosecution and does not state that the court accepted the charge',
  }),
  'legal-special-injury-plain-v1': Object.freeze({
    source: '특수상해',
    target: '위험한 물질로 동료를 다치게 한 책임',
    sourceSuffix: '였습니다.',
    targetSuffix: '이었습니다.',
    requiredContext: '법원이 인정한 건',
    equivalence: 'audience-friendly description of the court-recognized offense grounded in the pesticide injury facts; attribution and injury outcome are preserved',
  }),
  'legal-suspended-sentence-plain-v1': Object.freeze({
    source: '항소심에선 징역 1년 6개월에 집행유예 3년으로 형이 줄었습니다.',
    target: '항소심에선 징역 1년 6개월이었고, 3년 동안 문제를 일으키지 않으면 바로 감옥에 가지 않는 판결로 형이 줄었습니다.',
    requiredContext: '1심 징역 2년.',
    equivalence: 'audience-friendly explanation of the three-year suspended sentence; the first-instance term, appellate prison term, three-year period, and reduced-sentence relationship are preserved',
  }),
});

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

export function applyKoreanSpokenNormalization(draft, ruleIds) {
  if (typeof draft !== 'string' || !draft.trim()) throw new Error('Korean spoken normalization requires a non-empty authoritative draft');
  if (!Array.isArray(ruleIds) || !ruleIds.length || new Set(ruleIds).size !== ruleIds.length) throw new Error('Korean spoken normalization requires unique rule ids');
  let output = draft;
  const applications = [];
  for (const ruleId of ruleIds) {
    const rule = KOREAN_SPOKEN_NORMALIZATION_RULES[ruleId];
    if (!rule) throw new Error(`Unknown Korean spoken normalization rule: ${ruleId}`);
    const sourceCount = output.split(rule.source).length - 1;
    if (sourceCount !== 1) throw new Error(`${ruleId} requires exactly one source occurrence; found ${sourceCount}`);
    const sourceIndex = output.indexOf(rule.source);
    const contextIndex = output.lastIndexOf(rule.requiredContext, sourceIndex);
    if (contextIndex < 0 || sourceIndex - contextIndex > 64) throw new Error(`${ruleId} required legal context is absent`);
    const sourceSuffix = rule.sourceSuffix || '';
    const targetSuffix = rule.targetSuffix || '';
    if (sourceSuffix && output.slice(sourceIndex + rule.source.length, sourceIndex + rule.source.length + sourceSuffix.length) !== sourceSuffix) {
      throw new Error(`${ruleId} required grammatical suffix is absent`);
    }
    output = `${output.slice(0, sourceIndex)}${rule.target}${targetSuffix}${output.slice(sourceIndex + rule.source.length + sourceSuffix.length)}`;
    applications.push({ ruleId, source: rule.source, target: rule.target, sourceSuffix, targetSuffix, requiredContext: rule.requiredContext, equivalence: rule.equivalence, sourceIndex });
  }
  return {
    draft: output,
    evidence: {
      schema: KOREAN_SPOKEN_NORMALIZATION_SCHEMA,
      mode: 'authoritative-script-and-caption-rewrite',
      spokenOnlyOverride: false,
      inputDraftSha256: sha256Text(draft),
      outputDraftSha256: sha256Text(output),
      applications,
    },
  };
}
