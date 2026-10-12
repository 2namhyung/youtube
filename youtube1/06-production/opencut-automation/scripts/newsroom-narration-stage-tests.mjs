import assert from 'node:assert/strict';

import { deriveNewsroomPronunciationTerms, summarizeNewsroomPronunciationQa, validateNewsroomPauseEdits, validateNewsroomSegmentReuse } from './newsroom-narration-stage.mjs';

const terms = deriveNewsroomPronunciationTerms([
  '휴대전화를 부쉈다고 내부망에 적었습니다.',
  '직계혈족은 친족 간 처벌특례규정 때문에 처벌할 수 없습니다.',
]);
assert.ok(terms.includes('부쉈다고'));
assert.ok(terms.includes('직계혈족은'));
assert.ok(terms.includes('처벌특례규정'));

const cues = [{ start: 0, end: 2, text: '첫 문장. 둘째 문장.' }, { start: 2, end: 4, text: '마지막 질문?' }];
const pauseQa = validateNewsroomPauseEdits(cues, [
  { start: 0.8, end: 0.8, outputPauseSeconds: 0.45, sentenceBoundary: true, boundaryCueIndex: 0, boundaryCharOffset: 5 },
  { start: 2, end: 2, outputPauseSeconds: 0.45, sentenceBoundary: true, boundaryCueIndex: 0, boundaryCharOffset: 12 },
]);
assert.equal(pauseQa.passes, true);
assert.throws(() => validateNewsroomPauseEdits(cues, [
  { start: 1.9, end: 1.9, outputPauseSeconds: 0.45, sentenceBoundary: true, boundaryCueIndex: 0, boundaryCharOffset: 5 },
  { start: 2, end: 2, outputPauseSeconds: 0.45, sentenceBoundary: true, boundaryCueIndex: 0, boundaryCharOffset: 12 },
]), /duplicate or collapsed/u);

const acceptedWindows = terms.map((phrase, index) => ({ phrase, passes: true, checks: [{ model: 'small', passes: true }, { model: 'medium', passes: true }], id: `term-${index + 1}` }));
const acceptance = { evidence: { segmentReuse: { schema: 'qwen-segment-reuse-summary-v1', requested: 1, reused: 1, regenerated: 0 } }, attempts: [{ segmentIndex: 1, segments: [{ accepted: true, selected: true, generationMode: 'qwen-revalidated-segment', localizedPronunciationQa: { windows: acceptedWindows } }] }] };
assert.equal(summarizeNewsroomPronunciationQa(acceptance, terms).passes, true);
assert.equal(validateNewsroomSegmentReuse(acceptance).reused, 1);
const failedAcceptance = structuredClone(acceptance); failedAcceptance.attempts[0].segments[0].localizedPronunciationQa.windows[0].checks[1].passes = false;
assert.throws(() => summarizeNewsroomPronunciationQa(failedAcceptance, terms), /missing localized pronunciation admission/u);
const staleReuse = structuredClone(acceptance); staleReuse.evidence.segmentReuse.reused = 0;
assert.throws(() => validateNewsroomSegmentReuse(staleReuse), /reuse evidence/u);

console.log('Newsroom narration localized pronunciation and pause QA tests passed');
