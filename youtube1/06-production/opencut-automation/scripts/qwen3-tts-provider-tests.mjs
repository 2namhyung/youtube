import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { QWEN3_TTS_MODEL, QWEN3_TTS_REVISION, QWEN3_TTS_17B_MODEL, QWEN3_TTS_17B_REVISION, QWEN3_TTS_DTYPE, QWEN3_TTS_STYLES, QWEN3_TTS_STYLE_MODES, alignQwenWordAnchorsToSource, applyQwenPcm16EdgeFade, buildQwenLocalizedPronunciationWindows, createQwenWorker, evaluateQwenCriticalPhraseConsensus, evaluateQwenLocalizedPronunciationQa, inspectQwenPcm16Wav, mapQwenCuesToSource, normalizeQwenQuestionMatchText, normalizeQwenSpokenText, planQwenNarrationSections, resolveQwenModelLock, resolveQwenOwnerQuestionSegments, runQwen3TtsProvider, segmentQwenNarrationText } from './qwen3-tts-provider.mjs';

const root = path.resolve('.');
const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'qwen3-tts-provider-'));
const referenceAudio = path.join(temp, 'reference.wav');
assert.deepEqual(resolveQwenModelLock({ modelId: QWEN3_TTS_17B_MODEL, modelRevision: QWEN3_TTS_17B_REVISION }), { modelId: QWEN3_TTS_17B_MODEL, modelRevision: QWEN3_TTS_17B_REVISION, modelSize: '1b7', attentionImplementation: 'sdpa' });
assert.throws(() => resolveQwenModelLock({ modelId: QWEN3_TTS_17B_MODEL, modelRevision: QWEN3_TTS_REVISION }), /revision mismatch/);
const scriptPath = path.join(temp, 'script.txt');
function testWav(seconds = 1) {
  const sampleRate = 24000; const sampleCount = sampleRate * seconds; const dataBytes = sampleCount * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0); output.writeUInt32LE(36 + dataBytes, 4); output.write('WAVE', 8);
  output.write('fmt ', 12); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < sampleCount; index += 1) output.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 120 * index / sampleRate) * 1200), 44 + index * 2);
  return output;
}
await fsp.writeFile(referenceAudio, 'reference');
const referenceAudioSha256 = crypto.createHash('sha256').update('reference').digest('hex');
const edgeFadeFixture = path.join(temp, 'edge-fade.wav');
await fsp.writeFile(edgeFadeFixture, testWav());
const beforeEdgeFade = await inspectQwenPcm16Wav(edgeFadeFixture);
const edgePreparation = await applyQwenPcm16EdgeFade(edgeFadeFixture, 0.005);
const afterEdgeFade = await inspectQwenPcm16Wav(edgeFadeFixture);
assert.equal(afterEdgeFade.durationSeconds, beforeEdgeFade.durationSeconds);
assert.equal(afterEdgeFade.endpointAmplitude, 0);
assert.deepEqual(edgePreparation, { method: 'linear-edge-fade', fadeSeconds: 0.005, addedPauseSeconds: 0, durationPreserved: true });
assert.deepEqual(
  alignQwenWordAnchorsToSource('항소심에선 형이 줄었습니다', [
    { text: '항소심에서는', start: 0, end: 0.8 },
    { text: '형이', start: 0.8, end: 1.1 },
    { text: '줄었습니다', start: 1.1, end: 1.8 },
  ], 100, 5).map(({ startChar, endChar }) => [startChar, endChar]),
  [[100, 105], [105, 107], [107, 112]],
);
const pronunciationSource = '휴대전화를 부쉈다고 내부망에 적었습니다';
const pronunciationAnchors = alignQwenWordAnchorsToSource(pronunciationSource, [
  { text: '휴대전화를', start: 0, end: 0.6 },
  { text: '부쉈다고', start: 0.6, end: 1.05 },
  { text: '내부망에', start: 1.05, end: 1.5 },
  { text: '적었습니다', start: 1.5, end: 2.1 },
]);
const pronunciationWindows = buildQwenLocalizedPronunciationWindows(pronunciationSource, pronunciationAnchors, ['부쉈다고'], 2.1);
assert.deepEqual(pronunciationWindows.map(({ phrase, start, end }) => ({ phrase, start, end })), [{ phrase: '부쉈다고', start: 0, end: 1.55 }]);
const pronunciationPayload = { schema: 'localized-korean-pronunciation-asr-v1', models: ['small', 'medium'], windows: pronunciationWindows.map((window) => ({ ...window, checks: [{ model: 'small', text: '휴대전화를 부쉈다고 내부망에' }, { model: 'medium', text: '휴대전화를 부쉈다고 내부망에' }] })) };
assert.equal(evaluateQwenLocalizedPronunciationQa(pronunciationPayload, pronunciationWindows).passes, true);
const mispronouncedPayload = structuredClone(pronunciationPayload); mispronouncedPayload.windows[0].checks[1].text = '휴대전화를 부수 있다고 내부망에';
assert.throws(() => evaluateQwenLocalizedPronunciationQa(mispronouncedPayload, pronunciationWindows), /부쉈다고\[medium\]/u);
const autoFixture = 'Why did this happen?\n\nThe ministry report confirmed the result.\n\nThe danger and crisis grew.\n\nThis problem exposed a failure.\n\nA plain middle paragraph.\n\nWe finish with the next step.';
const autoPlan = planQwenNarrationSections(autoFixture, { style: 'auto' });
const isolatedPlan = planQwenNarrationSections('검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.', { style: 'auto', criticalPhrases: ['살인미수', '특수상해'], criticalPhraseIsolation: true });
assert.equal(isolatedPlan.units.length, 2);
assert.equal(isolatedPlan.units.map(({ text }) => normalizeQwenSpokenText(text)).join(' '), '검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.');
assert.ok(isolatedPlan.units.every(({ text }) => ['살인미수', '특수상해'].filter((phrase) => text.includes(phrase)).length === 1));
const exactIsolatedPlan = planQwenNarrationSections('검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.', { style: 'auto', criticalPhrases: ['살인미수', '특수상해'], criticalPhraseIsolationTerms: ['살인미수', '특수상해'] });
assert.deepEqual(exactIsolatedPlan.units.map(({ text }) => text), ['검찰은', '살인미수', '를 주장했지만 법원이 인정한 건', '특수상해', '였습니다.']);
assert.throws(() => planQwenNarrationSections('살인미수입니다.', { style: 'auto', criticalPhrases: ['살인미수'], criticalPhraseIsolationTerms: ['특수상해'] }), /must be unique members/);
assert.deepEqual(autoPlan.sections.map(({ style }) => style), ['hook', 'news_exposition', 'tension', 'criticism', 'neutral', 'solution_closing']);
assert.deepEqual(planQwenNarrationSections(autoFixture, { style: 'auto' }), autoPlan, 'auto classification must be deterministic');
assert.ok(autoPlan.units.every((unit) => autoPlan.sections[unit.sectionIndex].style === unit.style), 'style must remain fixed within a section');
const overrideTextSha256 = crypto.createHash('sha256').update(autoPlan.sections[1].text, 'utf8').digest('hex');
const overriddenPlan = planQwenNarrationSections(autoFixture, { style: 'auto', stylePlan: [{ segmentIndex: 1, textSha256: overrideTextSha256, style: 'criticism' }] });
assert.equal(overriddenPlan.sections[1].style, 'criticism');
assert.equal(overriddenPlan.sections[1].classification.source, 'override');
assert.throws(() => planQwenNarrationSections(autoFixture, { style: 'auto', stylePlan: [{ segmentIndex: 1, textSha256: '0'.repeat(64), style: 'criticism' }] }), /textSha256 mismatch/);
assert.throws(() => planQwenNarrationSections(autoFixture, { style: 'auto', stylePlan: [{ segmentIndex: 99, textSha256: overrideTextSha256, style: 'criticism' }] }), /out of range/);
assert.throws(() => planQwenNarrationSections(autoFixture, { style: 'auto', stylePlan: [{ segmentIndex: 1, textSha256: overrideTextSha256, style: 'criticism' }, { segmentIndex: 1, textSha256: overrideTextSha256, style: 'hook' }] }), /duplicates/);
assert.throws(() => planQwenNarrationSections(autoFixture, { style: 'hook', stylePlan: [] }), /only valid/);
assert.equal(planQwenNarrationSections('Opening.\n\n[[tension]] A plain labeled section.\n\nClosing.', { style: 'auto' }).sections[1].style, 'tension');
assert.equal(planQwenNarrationSections('Opening.\n\nA problem needs a solution.\n\nClosing.', { style: 'auto' }).sections[1].style, 'solution_closing', 'fixed rule order must break keyword ties');
const questionFixture = 'Opening. 현실에도 진짜 필요한 거 아니에요?\n\n혐의는 건조물침입뿐입니다. 이게 말이 되나요?\n\n하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?';
const questionPlan = planQwenNarrationSections(questionFixture, {
  style: 'auto',
  questionSentences: ['현실에도 진짜 필요한 거 아니에요?', '이게 말이 되나요?', '하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?'],
});
assert.deepEqual(questionPlan.units.filter((unit) => unit.style === 'question').map((unit) => unit.text), [
  '현실에도 진짜 필요한 거 아니에요?',
  '이게 말이 되나요?',
  '하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?',
]);
assert.ok(questionPlan.units.filter((unit) => unit.style !== 'question').every((unit) => !unit.text.endsWith('?')), 'question split must not leave target questions in declarative units');
const segmentLimitFixture = `${'A'.repeat(60)}. ${'B'.repeat(60)}.`;
assert.equal(segmentQwenNarrationText(segmentLimitFixture).length, 2, 'default maxSegmentChars must retain the 120-character behavior');
assert.equal(segmentQwenNarrationText(segmentLimitFixture, 140).length, 1, 'larger maxSegmentChars must combine complete sentences');
assert.throws(() => segmentQwenNarrationText(segmentLimitFixture, 79), /maxSegmentChars/);
assert.throws(() => planQwenNarrationSections(segmentLimitFixture, { style: 'hook', maxSegmentChars: 221 }), /maxSegmentChars/);
assert.equal(normalizeQwenSpokenText('넷플릭스 시리즈 <참교육> 속 교권보호국.'), '넷플릭스 시리즈 참교육 속 교권보호국.');
assert.equal(normalizeQwenSpokenText('제목 <참교육>은 화면 자막에 남습니다.'), '제목 참교육은 화면 자막에 남습니다.');
assert.equal(normalizeQwenSpokenText('성적 목적이 아니라고 했습니다.'), '성적 목적이 아니라고 했습니다.');
assert.notEqual(normalizeQwenQuestionMatchText('이게 말이 되나요?'), normalizeQwenQuestionMatchText('이게 말이 되나요!'));
const criticalChecks = [{ model: 'small', missing: [] }, { model: 'medium', missing: ['살인미수'] }];
assert.equal(evaluateQwenCriticalPhraseConsensus(['살인미수'], criticalChecks, ['small', 'medium'], 'at-least-one-model')[0].passes, true);
assert.equal(evaluateQwenCriticalPhraseConsensus(['살인미수'], criticalChecks, ['small', 'medium'], 'all-models')[0].passes, false);
assert.throws(() => resolveQwenOwnerQuestionSegments({ source: 'third-party', ownerOnly: false, localOnly: true, sourceAudioSha256: 'a'.repeat(64), segments: [] }), /owner-only/);
assert.throws(() => resolveQwenOwnerQuestionSegments({ source: 'owner-recording', ownerOnly: true, localOnly: true, sourceAudioSha256: 'a'.repeat(64), segments: [{ text: '이게 말이 되나요!', assetStartSeconds: 0, assetEndSeconds: 1 }] }), /span contract/);
assert.throws(() => resolveQwenOwnerQuestionSegments({ source: 'owner-recording', ownerOnly: true, localOnly: true, sourceAudioSha256: 'a'.repeat(64), segments: [{ text: '이게 말이 되나요?', assetStartSeconds: 1, assetEndSeconds: 1 }] }), /span contract/);
assert.equal(resolveQwenOwnerQuestionSegments({ source: 'owner-recording', ownerOnly: true, localOnly: true, sourceAudioSha256: 'a'.repeat(64), segments: [{ text: '이게 말이 되나요?', assetStartSeconds: 0, assetEndSeconds: 1 }] }).length, 1);
await fsp.writeFile(scriptPath, '첫 번째 문장입니다.\n두 번째 문장입니다.\n');
assert.deepEqual(segmentQwenNarrationText('첫 문장.\n\n짧은 단락입니다.'), ['첫 문장. 짧은 단락입니다.']);
const startupFailureScript = path.join(temp, 'startup-failure.mjs');
await fsp.writeFile(startupFailureScript, "process.stdout.write(JSON.stringify({ready:false,error:'GPU unavailable'})+'\\n'); process.exit(1);", 'utf8');
const startupFailureWorker = createQwenWorker(process.execPath, [startupFailureScript], { cwd: temp, readyTimeoutMs: 2_000 });
await assert.rejects(startupFailureWorker.ready, /GPU unavailable/);
const earlyCloseScript = path.join(temp, 'early-close.mjs');
await fsp.writeFile(earlyCloseScript, 'process.exit(0);', 'utf8');
const earlyCloseWorker = createQwenWorker(process.execPath, [earlyCloseScript], { cwd: temp, readyTimeoutMs: 2_000 });
await assert.rejects(earlyCloseWorker.ready, /closed before ready/);
assert.throws(() => mapQwenCuesToSource([{ text: '가나다' }], [{ text: '라마바', start: 0, end: 1 }]), /exactly match/);
const anchored = mapQwenCuesToSource(
  [{ text: '가나다' }, { text: '라마바' }],
  [{ text: '가나다 라마바', start: 0, end: 2, anchors: [
    { startChar: 0, endChar: 3, start: 0, end: 0.4 },
    { startChar: 3, endChar: 6, start: 0.4, end: 2 },
  ] }],
);
assert.ok(anchored[0].end < 0.8, 'source cue boundary should follow ASR word anchor');
assert.equal(anchored[0].anchors.length, 1, 'source cue should retain overlapping global word anchors');
assert.equal(anchored[1].anchors.length, 1, 'second source cue should retain its overlapping anchor');
const multiSegmentAnchored = mapQwenCuesToSource(
  [{ text: 'abc' }, { text: 'def' }],
  [
    { text: 'abc', start: 0, end: 1, anchors: [{ startChar: 0, endChar: 3, start: 0, end: 1 }] },
    { text: 'def', start: 1, end: 2, anchors: [{ startChar: 3, endChar: 6, start: 1, end: 2 }] },
  ],
);
assert.ok(multiSegmentAnchored[1].start >= 0.99, 'second synthesis segment must retain its global word anchor');

const workerRequests = [];
const generatedTextByOutput = new Map();
const worker = {
  ready: Promise.resolve({ modelId: QWEN3_TTS_MODEL, modelRevision: QWEN3_TTS_REVISION, modelSize: '0b6', attentionImplementation: 'sdpa', dtype: QWEN3_TTS_DTYPE, device: 'cuda:0', modelType: 'base', promptCached: true, promptStyle: 'neutral', promptSha256: referenceAudioSha256, loraLoaded: false, adapterLoaded: false }),
  async request(payload) {
    workerRequests.push(payload);
    generatedTextByOutput.set(payload.output, payload.text);
    await fsp.writeFile(payload.output, testWav());
    return { ok: true, output: payload.output };
  },
  close() {},
};
const runRootCommand = async (command, argv) => {
  if (command === 'python') {
    const audioPath = argv[1];
    const text = '첫 번째 문장입니다. 두 번째 문장입니다.';
    const generatedText = generatedTextByOutput.get(audioPath) || text;
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: generatedText, words: [{ start: 0, end: 1, text: generatedText }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav(argv.filter((value) => value === '-i').length)); return ''; }
  throw new Error(`unexpected command ${command}`);
};

await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256: '0'.repeat(64), referenceTranscript: 'reference' },
  scriptPath,
  stem: path.join(temp, 'bad-reference'),
  root,
  base: temp,
  createWorker: async () => { throw new Error('worker must not start after reference hash mismatch'); },
  runRootCommand,
}), /reference SHA-256 mismatch/);

const pitchPhrase = '\uC131\uC801 \uBAA9\uC801';
const pitchCorrection = { id: 'seongjeok-final-syllable', phrase: pitchPhrase, word: '\uC131\uC801', activeFractionStart: 0.55, semitones: 3, crossfadeSeconds: 0.012 };
const pitchScriptPath = path.join(temp, 'pitch-script.txt');
await fsp.writeFile(pitchScriptPath, `A single phrase: ${pitchPhrase}.\n`, 'utf8');
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', pitchCorrections: [pitchCorrection, { ...pitchCorrection, id: 'duplicate' }] },
  scriptPath: pitchScriptPath, stem: path.join(temp, 'pitch-duplicate-config'), root, base: temp,
  createWorker: async () => { throw new Error('worker must not start for duplicate pitch config'); }, runRootCommand,
}), /invalid or duplicate correction/);
await fsp.writeFile(pitchScriptPath, `${pitchPhrase}. ${pitchPhrase}.\n`, 'utf8');
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', pitchCorrections: [pitchCorrection] },
  scriptPath: pitchScriptPath, stem: path.join(temp, 'pitch-repeated'), root, base: temp,
  createWorker: async () => { throw new Error('worker must not start for repeated pitch phrase'); }, runRootCommand,
}), /pitch correction phrase must occur exactly once/);

const result = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: '참조 문장', seed: 20260730, maxAttempts: 2, finalTempo: 1.05 },
  scriptPath,
  stem: path.join(temp, 'narration'),
  root,
  base: temp,
  sourceCues: [{ text: '첫 번째 문장입니다.' }, { text: '두 번째 문장입니다.' }],
  createWorker: async () => worker,
  runRootCommand,
});
assert.equal(result.provenance.actualProvider, 'qwen3-tts');
assert.equal(result.provenance.fallbackUsed, false);
assert.equal(result.provenance.modelId, QWEN3_TTS_MODEL);
assert.equal(result.provenance.modelRevision, QWEN3_TTS_REVISION);
assert.equal(result.provenance.promptStyle, 'neutral');
assert.equal(result.provenance.loraLoaded, false);
assert.equal(result.provenance.adapterLoaded, false);
assert.deepEqual(result.provenance.seeds, [20260730]);
assert.equal(result.acceptance.final.failClosedVerification, true);
assert.equal(result.acceptance.final.synthesizedSegmentsDualAsr, true);
assert.equal(result.acceptance.final.ownerSegmentsPinnedAsset, true);
assert.equal(result.acceptance.evidence.verification.synthesizedSegments.dualAsrRequired, true);
assert.equal(result.acceptance.evidence.verification.ownerSegments.dualAsrRequired, false);
assert.equal(result.acceptance.final.maxCharacterErrorRate, 0.08);
assert.equal(result.acceptance.evidence.modelId, QWEN3_TTS_MODEL);
assert.equal(result.acceptance.evidence.modelRevision, QWEN3_TTS_REVISION);
assert.equal(result.acceptance.evidence.dtype, QWEN3_TTS_DTYPE);
assert.equal(result.acceptance.evidence.referenceAudioSha256, referenceAudioSha256);
assert.equal(result.acceptance.evidence.expectedReferenceAudioSha256, referenceAudioSha256);
assert.deepEqual(result.acceptance.evidence.asr.models, ['small', 'medium']);
assert.equal(result.provenance.finalTempo, 1.05);
assert.equal(result.cues.length, 2);
assert.equal(workerRequests.length, 1);
assert.deepEqual(workerRequests.map((request) => request.seed), [20260730]);
assert.deepEqual(workerRequests.map((request) => request.style), ['neutral']);

// A hash-bound prior segment is re-QA'd and reused without another synthesis call.
const reuseRoot = await fsp.mkdtemp(path.join(root, '.qwen-segment-reuse-test-'));
const reuseAudio = path.join(reuseRoot, 'segment.wav');
await fsp.writeFile(reuseAudio, testWav());
const priorSegment = result.acceptance.attempts[0].segments[0];
const requestsBeforeReuse = workerRequests.length;
const reuseResult = await runQwen3TtsProvider({
  narration: {
    mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: '참조 문장', seed: 20260730, maxAttempts: 2,
    reuseSegments: [{
      segmentIndex: 1,
      sourceTextSha256: crypto.createHash('sha256').update(Buffer.from(priorSegment.sourceText, 'utf8')).digest('hex'),
      style: priorSegment.style,
      promptSha256: priorSegment.promptSha256,
      promptBankManifestSha256: null,
      modelId: QWEN3_TTS_MODEL,
      modelRevision: QWEN3_TTS_REVISION,
      seed: priorSegment.seed,
      audioPath: path.relative(root, reuseAudio).replaceAll(path.sep, '/'),
      audioSha256: crypto.createHash('sha256').update(testWav()).digest('hex'),
    }],
  },
  scriptPath, stem: path.join(temp, 'narration-reuse'), root, base: temp,
  createWorker: async () => worker, runRootCommand,
});
assert.equal(workerRequests.length, requestsBeforeReuse, 'a reused segment that passes current QA must not be synthesized again');
assert.equal(reuseResult.acceptance.final.reusedSegmentCount, 1);
assert.deepEqual(reuseResult.acceptance.evidence.segmentReuse, { schema: 'qwen-segment-reuse-summary-v1', requested: 1, reused: 1, regenerated: 0 });
assert.equal(reuseResult.acceptance.attempts[0].segments[0].generationMode, 'qwen-revalidated-segment');

const failedReuseRequests = [];
const failedReuseWorker = {
  ...worker,
  async request(payload) { failedReuseRequests.push(payload); generatedTextByOutput.set(payload.output, payload.text); await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
};
const failedReuseRunRootCommand = async (command, argv) => {
  if (command === 'python') {
    const audioPath = argv[1]; const recognized = audioPath === reuseAudio ? 'incorrect transcript' : generatedTextByOutput.get(audioPath);
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: recognized, words: [{ start: 0, end: 1, text: recognized }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav(argv.filter((value) => value === '-i').length)); return ''; }
  throw new Error(`unexpected command ${command}`);
};
const failedReuseResult = await runQwen3TtsProvider({
  narration: {
    mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: '참조 문장', seed: 20260730, maxAttempts: 2,
    reuseSegments: [{ segmentIndex: 1, sourceTextSha256: crypto.createHash('sha256').update(Buffer.from(priorSegment.sourceText, 'utf8')).digest('hex'), style: priorSegment.style, promptSha256: priorSegment.promptSha256, promptBankManifestSha256: null, modelId: QWEN3_TTS_MODEL, modelRevision: QWEN3_TTS_REVISION, seed: priorSegment.seed, audioPath: path.relative(root, reuseAudio).replaceAll(path.sep, '/'), audioSha256: crypto.createHash('sha256').update(testWav()).digest('hex') }],
  },
  scriptPath, stem: path.join(temp, 'narration-failed-reuse'), root, base: temp,
  createWorker: async () => failedReuseWorker, runRootCommand: failedReuseRunRootCommand,
});
assert.equal(failedReuseRequests.length, 1, 'only the segment that fails revalidation should be synthesized');
assert.equal(failedReuseRequests[0].seed, 20260731, 'failed cached audio must advance to a new deterministic seed');
assert.deepEqual(failedReuseResult.acceptance.evidence.segmentReuse, { schema: 'qwen-segment-reuse-summary-v1', requested: 1, reused: 0, regenerated: 1 });
assert.equal(failedReuseResult.acceptance.attempts[0].accepted, false);
assert.equal(failedReuseResult.acceptance.attempts[1].segments[0].generationMode, 'qwen-resynthesis');
await fsp.rm(reuseRoot, { recursive: true, force: true });

const prosodyProfilePath = path.join(temp, 'prosody-profile.json');
const prosodyStyles = Object.fromEntries(['hook', 'news_exposition', 'tension', 'criticism', 'solution_closing'].map((style) => [style, { weights: {}, features: {} }]));
await fsp.writeFile(prosodyProfilePath, JSON.stringify({
  schemaVersion: 1, id: 'test-male-prosody-v1', identityExcluded: true, activeReferenceSex: 'male',
  source: { thirdPartyAudio: true, forbiddenUse: 'speaker identity cloning or use as Qwen voice-clone prompt' },
  featureContract: { absolutePitchExcludedFromScoring: true }, styles: prosodyStyles,
}), 'utf8');
const prosodyProfileSha256 = crypto.createHash('sha256').update(await fsp.readFile(prosodyProfilePath)).digest('hex');
const prosodyRequests = [];
const prosodyWorker = {
  ...worker,
  async request(payload) { prosodyRequests.push(payload); generatedTextByOutput.set(payload.output, payload.text); await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
};
const prosodyRunRootCommand = async (command, argv) => {
  if (command === 'python' && path.basename(argv[0]) === 'score-prosody-candidate.py') {
    const output = argv[argv.indexOf('--output') + 1];
    const audio = argv[argv.indexOf('--audio') + 1];
    const style = argv[argv.indexOf('--style') + 1];
    const score = audio.includes('-2') ? 0.25 : 1.5;
    await fsp.writeFile(output, JSON.stringify({ profileId: 'test-male-prosody-v1', profileSha256: prosodyProfileSha256, style, thirdPartyWaveformUsedForGeneration: false, scoring: { score } }));
    return '';
  }
  return runRootCommand(command, argv);
};
const prosodyResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: '참조 문장', seed: 20260730, maxAttempts: 2, prosodyProfile: 'prosody-profile.json', prosodyCandidates: 2 },
  scriptPath, stem: path.join(temp, 'prosody-narration'), root, base: temp,
  createWorker: async () => prosodyWorker, runRootCommand: prosodyRunRootCommand,
});
assert.equal(prosodyRequests.length, 2, 'prosody selection must generate the configured candidate count');
assert.equal(prosodyResult.acceptance.evidence.prosodyProfile.thirdPartyWaveformUsedForGeneration, false);
assert.equal(prosodyResult.acceptance.evidence.prosodyProfile.sha256, prosodyProfileSha256);
const prosodyEvidence = prosodyResult.acceptance.attempts.flatMap((attempt) => attempt.segments);
assert.equal(prosodyEvidence.filter((item) => item.eligible).length, 2);
assert.equal(prosodyEvidence.filter((item) => item.selected).length, 1);
assert.equal(prosodyEvidence.find((item) => item.selected).prosody.scoring.score, 0.25);
assert.ok(prosodyEvidence.every((item) => item.promptSha256 === referenceAudioSha256), 'only the owner prompt may drive generation');

assert.deepEqual(QWEN3_TTS_STYLES, ['neutral', 'hook', 'news_exposition', 'tension', 'criticism', 'solution_closing', 'question', 'legal_explanation', 'viewer_question', 'closing']);
assert.deepEqual(QWEN3_TTS_STYLE_MODES, [...QWEN3_TTS_STYLES, 'auto']);
const roleAudio = path.join(temp, 'hook.wav');
await fsp.writeFile(roleAudio, 'owner-hook');
const roleSha256 = crypto.createHash('sha256').update('owner-hook').digest('hex');
const promptBankPath = path.join(temp, 'prompt-bank.json');
await fsp.writeFile(promptBankPath, JSON.stringify({
  status: 'validation-passed', productionEligible: true, ownerVoice: true,
  model: { id: QWEN3_TTS_MODEL, revision: QWEN3_TTS_REVISION, precision: 'bf16', language: 'Korean', loraAllowed: false, adapterAllowed: false, fallbackAllowed: false },
  styles: { hook: { role: 'hook', audio: 'hook.wav', sha256: roleSha256, transcript: '소유자 훅 문장' } },
}), 'utf8');
const roleRequests = [];
let roleWorkerArgs = [];
const roleWorker = {
  ready: Promise.resolve({ modelId: QWEN3_TTS_MODEL, modelRevision: QWEN3_TTS_REVISION, modelSize: '0b6', attentionImplementation: 'sdpa', dtype: QWEN3_TTS_DTYPE, device: 'cuda:0', modelType: 'base', promptCached: true, promptStyle: 'hook', promptSha256: roleSha256, loraLoaded: false, adapterLoaded: false }),
  async request(payload) { roleRequests.push(payload); generatedTextByOutput.set(payload.output, payload.text); await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
  close() {},
};
const roleResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'hook', seed: 20260730, maxAttempts: 1 },
  scriptPath, stem: path.join(temp, 'role-narration'), root, base: temp,
  promptBankPath,
  createWorker: async (_command, argv) => { roleWorkerArgs = argv; return roleWorker; },
  runRootCommand,
});
assert.equal(roleResult.provenance.promptStyle, 'hook');
assert.equal(roleResult.provenance.referenceAudioSha256, roleSha256);
assert.equal(roleResult.provenance.referenceTranscript, '소유자 훅 문장');
assert.equal(roleRequests[0].style, 'hook');
assert.equal(roleWorkerArgs[roleWorkerArgs.indexOf('--prompt-style') + 1], 'hook');
assert.equal(roleWorkerArgs[roleWorkerArgs.indexOf('--reference-sha256') + 1], roleSha256);
assert.ok(!roleWorkerArgs.some((value) => /lora|adapter/i.test(value)));
const expandedBank = JSON.parse(await fsp.readFile(promptBankPath, 'utf8'));
expandedBank.styles = Object.fromEntries(QWEN3_TTS_STYLES.map((style) => [style, {
  role: style === 'neutral' ? 'canonical-neutral' : style.replaceAll('_', '-'), audio: 'hook.wav', sha256: roleSha256, transcript: expandedBank.styles.hook.transcript,
}]));
await fsp.writeFile(promptBankPath, JSON.stringify(expandedBank), 'utf8');
const promptBankSha256 = crypto.createHash('sha256').update(await fsp.readFile(promptBankPath)).digest('hex');
const autoScriptPath = path.join(temp, 'auto-script.txt');
await fsp.writeFile(autoScriptPath, autoFixture, 'utf8');
const autoStyles = autoPlan.sections.map(({ style }) => style);
const usedAutoStyles = [...new Set(autoStyles)];
const autoPromptHashes = Object.fromEntries(usedAutoStyles.map((style) => [style, roleSha256]));
const autoRequests = [];
let autoWorkerArgs = [];
const autoWorker = {
  ready: Promise.resolve({ modelId: QWEN3_TTS_MODEL, modelRevision: QWEN3_TTS_REVISION, modelSize: '0b6', attentionImplementation: 'sdpa', dtype: QWEN3_TTS_DTYPE, device: 'cuda:0', modelType: 'base', promptCached: true, promptStyle: 'auto', promptStyles: usedAutoStyles, promptHashes: autoPromptHashes, promptBankSha256, loraLoaded: false, adapterLoaded: false }),
  async request(payload) { autoRequests.push(payload); generatedTextByOutput.set(payload.output, payload.text); await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
  close() {},
};
const autoResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'auto', seed: 20260730, maxAttempts: 1 },
  scriptPath: autoScriptPath, stem: path.join(temp, 'auto-narration'), root, base: temp,
  promptBankPath,
  createWorker: async (_command, argv) => { autoWorkerArgs = argv; return autoWorker; },
  runRootCommand,
});
assert.deepEqual(autoRequests.map(({ style }) => style), autoStyles);
assert.deepEqual(autoResult.acceptance.evidence.sectionPlan.map(({ style }) => style), autoStyles);
assert.equal(autoResult.acceptance.evidence.globalWordAnchors.length, autoRequests.length);
assert.ok(autoResult.acceptance.evidence.globalWordAnchors.every((anchor, index, anchors) => index === 0 || anchor.start >= anchors[index - 1].start));
assert.equal(autoWorkerArgs[autoWorkerArgs.indexOf('--prompt-style') + 1], 'auto');
assert.equal(autoWorkerArgs[autoWorkerArgs.indexOf('--prompt-bank-sha256') + 1], promptBankSha256);
assert.deepEqual(autoWorkerArgs[autoWorkerArgs.indexOf('--prompt-styles') + 1].split(','), usedAutoStyles);
assert.ok(!autoWorkerArgs.some((value) => /lora|adapter/i.test(value)));
let mismatchedWorkerClosed = false;
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'auto', maxAttempts: 1 }, scriptPath: autoScriptPath,
  stem: path.join(temp, 'auto-worker-hash-mismatch'), root, base: temp, promptBankPath, runRootCommand,
  createWorker: async () => ({ ...autoWorker, ready: Promise.resolve({ ...await autoWorker.ready, promptHashes: { ...autoPromptHashes, hook: '0'.repeat(64) } }), close() { mismatchedWorkerClosed = true; } }),
}), /locked Base\/BF16\/GPU\/prompt\/no-LoRA gate/);
assert.equal(mismatchedWorkerClosed, true);
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'hook', referenceTranscript: 'mismatch' },
  scriptPath, stem: path.join(temp, 'style-mismatch'), root, base: temp,
  promptBankPath, createWorker: async () => { throw new Error('worker must not start'); }, runRootCommand,
}), /prompt style mismatch/);
await fsp.writeFile(roleAudio, 'tampered');
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'hook' },
  scriptPath, stem: path.join(temp, 'hash-mismatch'), root, base: temp,
  promptBankPath, createWorker: async () => { throw new Error('worker must not start'); }, runRootCommand,
}), /reference SHA-256 mismatch/);

const rejectingWorker = {
  ready: worker.ready,
  async request(payload) { await fsp.writeFile(payload.output, 'wav'); },
  close() {},
};
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: '참조 문장', maxAttempts: 1 },
  scriptPath,
  stem: path.join(temp, 'reject'),
  root,
  base: temp,
  createWorker: async () => rejectingWorker,
  runRootCommand: async (command, argv) => command === 'python' ? fsp.writeFile(argv[2], JSON.stringify({ segments: [{ text: '틀린 음성', words: [{ start: 0, end: 1, text: '틀린' }] }] })) : JSON.stringify({ format: { duration: 1 } }),
}), /strict candidate gate rejected/);

// Segment-level retry: accepted units are retained while only a failed unit
// receives another deterministic generation attempt.
const retryScriptPath = path.join(temp, 'segment-retry-script.txt');
const retryTexts = [
  'The first segment is accepted once and must never be regenerated later.',
  'The second segment fails its first ASR check and succeeds on retry.',
  'The third segment is accepted after the earlier retry has completed.',
];
await fsp.writeFile(retryScriptPath, retryTexts.join('\n\n'), 'utf8');
const retryRequests = [];
const retryOutcomes = new Map();
const retryWorker = {
  ready: worker.ready,
  async request(payload) {
    const seen = retryRequests.filter((item) => item.text === payload.text).length;
    retryRequests.push(payload);
    await fsp.writeFile(payload.output, testWav());
    retryOutcomes.set(payload.output, payload.text.includes('second segment') && seen === 0 ? 'incorrect transcript' : payload.text);
    return { ok: true, output: payload.output };
  },
  close() {},
};
const retryRunRootCommand = async (command, argv) => {
  if (command === 'python') {
    const audioPath = argv[1];
    const recognized = retryOutcomes.get(audioPath);
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: recognized, words: [{ start: 0, end: 1, text: recognized }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav(argv.filter((value) => value === '-i').length)); return ''; }
  throw new Error(`unexpected command ${command}`);
};
const retryResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', seed: 9000, maxAttempts: 2 },
  scriptPath: retryScriptPath, stem: path.join(temp, 'segment-retry'), root, base: temp,
  createWorker: async () => retryWorker, runRootCommand: retryRunRootCommand,
});
assert.equal(retryRequests.filter((item) => item.text === retryTexts[0]).length, 1, 'accepted first segment must not be regenerated');
assert.equal(retryRequests.filter((item) => item.text === retryTexts[1]).length, 2, 'failed second segment must be retried');
assert.equal(retryRequests.filter((item) => item.text === retryTexts[2]).length, 1, 'later segment should run once after retry');
assert.equal(retryResult.cues.length, 3);
assert.equal(retryResult.acceptance.attempts.filter((item) => item.segmentIndex === 2).length, 2);
assert.equal(retryResult.acceptance.attempts.filter((item) => item.accepted === false).length, 1);
assert.deepEqual(retryResult.acceptance.evidence.segmentAttempts.map((item) => item.attempts.length), [1, 2, 1]);

// Exhausting one segment must fail closed, even when preceding units pass.
const exhaustedScriptPath = path.join(temp, 'segment-exhausted-script.txt');
const exhaustedText = 'This segment never passes the dual ASR gate and must fail closed.';
await fsp.writeFile(exhaustedScriptPath, exhaustedText, 'utf8');
const exhaustedRequests = [];
const exhaustedWorker = {
  ready: worker.ready,
  async request(payload) { exhaustedRequests.push(payload); await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
  close() {},
};
const exhaustedRunRootCommand = async (command, argv) => {
  if (command === 'python') {
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: 'always wrong', words: [{ start: 0, end: 1, text: 'always wrong' }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav()); return ''; }
  throw new Error(`unexpected command ${command}`);
};
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', seed: 9100, maxAttempts: 2 },
  scriptPath: exhaustedScriptPath, stem: path.join(temp, 'segment-exhausted'), root, base: temp,
  createWorker: async () => exhaustedWorker, runRootCommand: exhaustedRunRootCommand,
}), /strict candidate gate rejected segment 1 after 2/);
assert.equal(exhaustedRequests.length, 2, 'exhausted segment must use exactly maxAttempts');
const exhaustedAcceptance = JSON.parse(await fsp.readFile(path.join(temp, 'segment-exhausted.acceptance.json'), 'utf8'));
assert.equal(exhaustedAcceptance.accepted, false);
assert.equal(exhaustedAcceptance.attempts.length, 2);
assert.ok(exhaustedAcceptance.attempts.every((item) => item.segmentIndex === 1 && item.accepted === false));

// Critical phrases must be present in both independent ASR transcripts.
const criticalScriptPath = path.join(temp, 'critical-phrase-script.txt');
const criticalText = 'This report explains a key detail while giving the audience enough context to understand the situation clearly and accurately today.';
await fsp.writeFile(criticalScriptPath, criticalText, 'utf8');
const criticalWorker = {
  ready: worker.ready,
  async request(payload) { await fsp.writeFile(payload.output, testWav()); return { ok: true, output: payload.output }; },
  close() {},
};
const criticalRunRootCommand = async (command, argv) => {
  if (command === 'python') {
    if (String(argv[0]).endsWith('transcribe-whisper-windows.py')) {
      const windows = JSON.parse(await fsp.readFile(argv[2], 'utf8'));
      await fsp.writeFile(argv[3], JSON.stringify({ schema: 'localized-korean-pronunciation-asr-v1', models: ['small', 'medium'], windows: windows.map((window) => ({ ...window, checks: [{ model: 'small', text: criticalText }, { model: 'medium', text: criticalText }] })) }));
      return '';
    }
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: criticalText, words: [{ start: 0, end: 1, text: criticalText }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav()); return ''; }
  throw new Error(`unexpected command ${command}`);
};
const criticalResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', criticalPhrases: ['key'], maxAttempts: 1 },
  scriptPath: criticalScriptPath, stem: path.join(temp, 'critical-pass'), root, base: temp,
  createWorker: async () => criticalWorker, runRootCommand: criticalRunRootCommand,
});
assert.deepEqual(criticalResult.acceptance.attempts[0].segments[0].criticalPhraseChecks.map(({ missing }) => missing), [[], []]);
assert.deepEqual(criticalResult.acceptance.evidence.asr.criticalPhraseModels, ['small', 'medium']);
const mediumOnlyRunRootCommand = async (command, argv) => {
  if (command === 'python') {
    if (String(argv[0]).endsWith('transcribe-whisper-windows.py')) {
      const windows = JSON.parse(await fsp.readFile(argv[2], 'utf8'));
      await fsp.writeFile(argv[3], JSON.stringify({ schema: 'localized-korean-pronunciation-asr-v1', models: ['small', 'medium'], windows: windows.map((window) => ({ ...window, checks: [{ model: 'small', text: criticalText.replace('key ', '') }, { model: 'medium', text: criticalText }] })) }));
      return '';
    }
    const model = argv[argv.indexOf('--model') + 1];
    const text = model === 'small' ? criticalText.replace('key ', '') : criticalText;
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text, words: [{ start: 0, end: 1, text }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav()); return ''; }
  throw new Error(`unexpected command ${command}`);
};
const mediumOnlyResult = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', criticalPhrases: ['key'], criticalPhraseModels: ['medium'], maxAttempts: 1 },
  scriptPath: criticalScriptPath, stem: path.join(temp, 'critical-medium-only'), root, base: temp,
  createWorker: async () => criticalWorker, runRootCommand: mediumOnlyRunRootCommand,
});
assert.deepEqual(mediumOnlyResult.acceptance.attempts[0].segments[0].criticalPhraseChecks.map(({ model }) => model), ['medium']);
assert.deepEqual(mediumOnlyResult.provenance.asrValidation.criticalPhraseModels, ['medium']);
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', criticalPhrases: ['key'], criticalPhraseModels: ['small', 'small'] },
  scriptPath: criticalScriptPath, stem: path.join(temp, 'critical-duplicate-models'), root, base: temp,
  createWorker: async () => { throw new Error('worker must not start'); }, runRootCommand: criticalRunRootCommand,
}), /criticalPhraseModels/);
const criticalRejectCommand = async (command, argv) => {
  if (command === 'python') {
    const wrongText = 'This report explains a detail while giving the audience enough context to understand the situation clearly and accurately today.';
    await fsp.writeFile(argv[2], JSON.stringify({ segments: [{ start: 0, end: 1, text: wrongText, words: [{ start: 0, end: 1, text: wrongText }] }] }));
    return '';
  }
  if (command === 'ffprobe') return JSON.stringify({ format: { duration: 1 } });
  if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), testWav()); return ''; }
  throw new Error(`unexpected command ${command}`);
};
await assert.rejects(() => runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', referenceAudio: 'reference.wav', referenceAudioSha256, referenceTranscript: 'reference', criticalPhrases: ['key'], maxAttempts: 1 },
  scriptPath: criticalScriptPath, stem: path.join(temp, 'critical-fail'), root, base: temp,
  createWorker: async () => criticalWorker, runRootCommand: criticalRejectCommand,
}), /strict candidate gate rejected.*critical phrase gate mismatch/);

console.log('qwen3-tts provider tests passed');
