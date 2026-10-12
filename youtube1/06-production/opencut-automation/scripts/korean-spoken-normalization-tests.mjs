import assert from 'node:assert/strict';
import { applyKoreanSpokenNormalization } from './korean-spoken-normalization.mjs';

const source = '항소심에선 징역 1년 6개월에 집행유예 3년으로 감형됐습니다.\n형량은 줄었습니다.';
const result = applyKoreanSpokenNormalization(source, ['legal-sentence-reduction-plain-v1']);
assert.equal(result.draft, '항소심에선 징역 1년 6개월에 집행유예 3년으로 형이 줄었습니다.\n형량은 줄었습니다.');
assert.equal(result.evidence.spokenOnlyOverride, false);
assert.equal(result.evidence.applications[0].source, '감형됐습니다');
assert.equal(result.evidence.applications[0].target, '형이 줄었습니다');
assert.notEqual(result.evidence.inputDraftSha256, result.evidence.outputDraftSha256);
assert.throws(() => applyKoreanSpokenNormalization('감형됐습니다.', ['legal-sentence-reduction-plain-v1']), /required legal context/);
assert.throws(() => applyKoreanSpokenNormalization(`${source}\n감형됐습니다.`, ['legal-sentence-reduction-plain-v1']), /exactly one source occurrence/);

const legalJargon = '검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.\n1심 징역 2년.\n항소심에선 징역 1년 6개월에 집행유예 3년으로 형이 줄었습니다.';
const plain = applyKoreanSpokenNormalization(legalJargon, [
  'legal-attempted-murder-plain-v1',
  'legal-special-injury-plain-v1',
  'legal-suspended-sentence-plain-v1',
]);
assert.equal(plain.draft, '검찰은 사람을 죽이려 한 행동을 주장했지만 법원이 인정한 건 위험한 물질로 동료를 다치게 한 책임이었습니다.\n1심 징역 2년.\n항소심에선 징역 1년 6개월이었고, 3년 동안 문제를 일으키지 않으면 바로 감옥에 가지 않는 판결로 형이 줄었습니다.');
assert.equal(plain.evidence.applications.length, 3);
assert.equal(plain.evidence.spokenOnlyOverride, false);
assert.throws(() => applyKoreanSpokenNormalization('살인미수입니다.', ['legal-attempted-murder-plain-v1']), /required legal context/);
console.log('korean-spoken-normalization tests passed');
