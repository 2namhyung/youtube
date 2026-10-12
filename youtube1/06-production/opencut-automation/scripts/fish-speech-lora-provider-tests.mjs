import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFishSpeechLoraProvider, alignSourceCuesToTranscript, alignSourceCuesToWordTranscript, synthesisTextForCue, synthesisTextForCueGroup, applyPronunciationOverrides, fishCacheFingerprint, hasExactUntimedTranscript, FISH_PROMPT_TEXT } from './fish-speech-lora-provider.mjs';

const root = path.resolve('.');
const base = path.join(root, 'production', 'projects', 'school-case-production');
const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'fish-speech-lora-provider-'));
const stem = path.join(temp, 'narration');
const scriptPath = path.join(temp, 'fish-script.txt');
await fsp.writeFile(scriptPath, '첫 번째 문장입니다.\n두 번째 문장입니다.\n세 번째 문장입니다.', 'utf8');
const narration = {
  mode: 'fish-speech-lora',
  referenceAudio: '../../../../../03-script-voice/voice-clone/samples/F3-prosody-prompt.wav',
  referenceTranscript: FISH_PROMPT_TEXT,
  device: 'cuda',
};
assert.equal(applyPronunciationOverrides('교권보호국.', { 교권보호국: '교권 보호국' }), '교권 보호국.');
assert.equal(applyPronunciationOverrides('교권보호국', { 교권보호국: '교꿘 보호국' }), '교꿘 보호국');
const cacheCue = [{ number: 1, text: '동일한 최종 대본' }];
const cacheHash = (override = {}) => fishCacheFingerprint({ cueGroup: cacheCue, mergedSha: 'merged', referenceSha: 'reference', narration: { ...narration, cueIsolated: true, ...override } });
assert.notEqual(cacheHash({ seed: 1 }), cacheHash({ seed: 2 }), 'seed change must invalidate Fish artifact cache');
assert.notEqual(cacheHash({ maxAttempts: 3 }), cacheHash({ maxAttempts: 6 }), 'acceptance policy change must invalidate Fish artifact cache');
assert.equal(hasExactUntimedTranscript('재물', { segments: [{ start: 0, end: 0.4, text: '재물', words: [] }] }), true);
assert.equal(hasExactUntimedTranscript('재물', { segments: [{ start: 0, end: 0.4, text: '제물', words: [] }] }), false);
const calls = [];
try {
  const result = await runFishSpeechLoraProvider({
    narration,
    scriptPath,
    stem,
    root,
    base,
    runFishCommand: async (command, argv) => {
      calls.push({ command, argv });
      if (argv.includes('--prompt-tokens')) {
        const outDir = argv[argv.indexOf('--output-dir') + 1];
        await fsp.mkdir(outDir, { recursive: true });
        await fsp.writeFile(path.join(outDir, 'codes_0.npy'), 'codes');
      } else if (argv.includes('--checkpoint-path') && argv.includes('-i')) {
        const input = argv[argv.indexOf('-i') + 1];
        const output = argv[argv.indexOf('-o') + 1];
        if (input.endsWith('F3-prosody-prompt.wav')) await fsp.writeFile(output.replace(/\.wav$/, '.npy'), 'prompt');
        else await fsp.writeFile(output, 'audio');
      }
    },
    runRootCommand: async (command, argv) => {
      if (command === 'ffmpeg') { await fsp.writeFile(argv.at(-1), 'audio'); return; }
      await fsp.writeFile(argv.at(-1), JSON.stringify({ segments: [{ start: 0, end: 3, text: '첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.', words: [
        { start: 0, end: 1, text: '첫 번째 문장입니다.' }, { start: 1, end: 2, text: '두 번째 문장입니다.' }, { start: 2, end: 3, text: '세 번째 문장입니다.' },
      ] }] }));
    },
  });
  assert.equal(calls.filter((call) => call.argv.includes('--prompt-tokens')).length, 1);
  assert.equal(result.provenance.modelId, 'fish-speech-1.5-F3-prosody-r8-step160-20260727');
  assert.equal(result.provenance.referenceTranscript, FISH_PROMPT_TEXT);
  assert.equal(result.acceptance.accepted, true);
  assert.equal(result.cues.length, 3);
  assert.match(result.provenance.promptTokensSha256, /^[0-9a-f]{64}$/);
  const aligned = alignSourceCuesToTranscript([{ start: 0, end: 1, text: '가' }, { start: 1, end: 2, text: '나다' }], [{ start: 0.2, end: 1.2, text: '가나다' }]);
  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].text, '가');
  const { parseSrt } = await import('./production-lib.mjs');
  const sourceCues = parseSrt(await fsp.readFile(path.join(root, 'examples', 'school-case-assets', 'preview_subtitles.srt'), 'utf8'));
  const fullAligned = alignSourceCuesToTranscript(sourceCues, [{ start: 0, end: 130, text: 'full script' }]);
  assert.equal(fullAligned.length, 48);
  assert.equal(fullAligned.at(-1).text, sourceCues.at(-1).text);
  assert.ok(Math.min(...fullAligned.map((cue) => cue.end - cue.start)) >= 0.6);
  assert.ok(fullAligned.at(-1).end >= 129);
  const critical = alignSourceCuesToWordTranscript(
    [{ number: 19, text: '교사용 의자에 소변을 봤습니다.' }, { number: 20, text: '다행히.' }],
    { segments: [{ start: 0, end: 2, text: '교사용 의자에 소변을 봤습니다. 다행히.', words: [
      { start: 0, end: 1.2, text: '교사용 의자에 소변을 봤습니다.' }, { start: 1.3, end: 2, text: '다행히.' },
    ] }] },
  );
  assert.equal(critical.report.accepted, true);
  assert.equal(critical.cues[1].start, 1.3);
  assert.throws(() => alignSourceCuesToWordTranscript(
    [{ number: 19, text: '교사용 의자에 소변을 봤습니다.' }, { number: 20, text: '다행히.' }],
    { segments: [{ start: 0, end: 1, text: '교사용 의자에 소변을 받습니다.', words: [{ start: 0, end: 1, text: '교사용 의자에 소변을 받습니다.' }] }] },
  ), /cue 19 critical token|cue 20/);

  const overrideStem = path.join(temp, 'cue-1-override');
  const overrideScriptPath = path.join(temp, 'cue-1-script.txt');
  await fsp.writeFile(overrideScriptPath, '교권보호국.', 'utf8');
  const synthesisRequests = [];
  const overrideResult = await runFishSpeechLoraProvider({
    narration: { ...narration, cueIsolated: true },
    scriptPath: overrideScriptPath,
    stem: overrideStem,
    root,
    base,
    runFishCommand: async () => {},
    runRootCommand: async (_command, argv) => { await fsp.writeFile(argv.at(-1), 'audio'); },
    createCueWorkers: async ({ promptTokens }) => {
      await fsp.writeFile(promptTokens, 'prompt');
      return {
        fish: {
          ready: Promise.resolve(),
          async request(payload) {
            synthesisRequests.push(payload.text);
            await fsp.writeFile(payload.output, 'audio');
            return { duration: 1, output: payload.output };
          },
          close() {},
        },
        whisper: {
          ready: Promise.resolve(),
          async request() {
            return { transcript: { segments: [{ start: 0, end: 0.8, text: '교권보호국', words: [{ start: 0, end: 0.8, text: '교권보호국' }] }] } };
          },
          close() {},
        },
      };
    },
  });
  assert.deepEqual(synthesisRequests, ['교권, 보호국.']);
  assert.equal(overrideResult.cues[0].text, '교권보호국.');
  assert.equal(overrideResult.acceptance.final.accepted, true);
  const trimStem = path.join(temp, 'cue-leading-trim');
  const trimCommands = [];
  const trimResult = await runFishSpeechLoraProvider({
    narration: { ...narration, cueIsolated: true },
    scriptPath: overrideScriptPath,
    stem: trimStem,
    root,
    base,
    runFishCommand: async () => {},
    runRootCommand: async (_command, argv) => { trimCommands.push(argv); await fsp.writeFile(argv.at(-1), 'audio'); },
    createCueWorkers: async ({ promptTokens }) => {
      await fsp.writeFile(promptTokens, 'prompt');
      return {
        fish: {
          ready: Promise.resolve(),
          async request(payload) { await fsp.writeFile(payload.output, 'audio'); return { duration: 2, output: payload.output }; },
          close() {},
        },
        whisper: {
          ready: Promise.resolve(),
          async request({ audio }) {
            const trimmed = audio.endsWith('-lead-trimmed.wav') || audio === `${trimStem}.wav`;
            const start = trimmed ? 0.1 : 0.85;
            return { transcript: { segments: [{ start, end: start + 0.8, text: '교권보호국', words: [{ start, end: start + 0.8, text: '교권보호국' }] }] } };
          },
          close() {},
        },
      };
    },
  });
  assert.ok(trimCommands.some((argv) => argv.includes('atrim=start=0.750000,asetpts=PTS-STARTPTS')));
  assert.equal(trimResult.acceptance.perCue[0].leadingTrimSeconds, 0.75);
  assert.equal(trimResult.acceptance.perCue[0].onsetError, 0.1);
  assert.equal(trimResult.cues[0].text, '교권보호국.');
  assert.equal(trimResult.cues[0].end - trimResult.cues[0].start, 1.25);
  const cue15 = { number: 15, text: '병가를 냈고.' };
  const cue14 = { number: 14, text: '교사는 큰 충격을 받아' };
  assert.equal(synthesisTextForCueGroup([cue14, cue15]), '교사는 큰 충격을 받아. 병가를 냈고.');
  assert.equal(synthesisTextForCueGroup([
    { number: 9, text: '다음 날 출근한 여교사가' },
    { number: 10, text: '매일 쓰던 텀블러에서' },
  ]), '다음 날 출근한 여교사가, 매일 쓰던 텀블러에서');
  assert.equal(cue15.text, '병가를 냈고.');
  const cue24 = { number: 24, text: '피의자로 특정했고요.' };
  assert.equal(synthesisTextForCue(cue24), '피-의-자로 특정했고요.');
  assert.equal(cue24.text, '피의자로 특정했고요.');
  assert.throws(() => alignSourceCuesToWordTranscript(
    [cue24],
    { segments: [{ start: 0, end: 1, text: '피해자로 특정했고요', words: [{ start: 0, end: 0.4, text: '피해자로' }, { start: 0.4, end: 1, text: '특정했고요' }] }] },
  ), /cue 24 critical token/);
  const finalCueSix = alignSourceCuesToWordTranscript(
    [{ number: 6, text: '한 달 뒤.' }],
    { segments: [{ start: 0, end: 1, text: '한 달 뒤', words: [{ start: 0, end: 0.3, text: '한' }, { start: 0.3, end: 0.6, text: '달' }, { start: 0.6, end: 1, text: '뒤' }] }] },
  );
  assert.equal(finalCueSix.report.accepted, true, 'final cue 6 must not inherit old-script 4월 validation');
  assert.throws(() => alignSourceCuesToWordTranscript(
    [{ number: 99, text: '피의자로 특정했고요.' }],
    { segments: [{ start: 0, end: 1, text: '학생으로 특정했고요', words: [{ start: 0, end: 0.4, text: '학생으로' }, { start: 0.4, end: 1, text: '특정했고요' }] }] },
  ), /critical token is not exact: 피의자로/);
  const combinedCue15 = alignSourceCuesToWordTranscript(
    [cue15],
    { segments: [{ start: 0, end: 1.28, text: '병가를 냈고', words: [{ start: 0, end: 0.6, text: '병가를' }, { start: 0.68, end: 1.28, text: '냈고' }] }] },
  );
  assert.equal(combinedCue15.report.accepted, true);
  assert.equal(combinedCue15.cues[0].text, '병가를 냈고.');
  const fusedPair = alignSourceCuesToWordTranscript(
    [cue14, cue15],
    { segments: [{ start: 0, end: 2.4, text: '교사는 큰 충격을 받아병가를 냈고', words: [
      { start: 0, end: 0.4, text: '교사는' }, { start: 0.4, end: 0.7, text: '큰' }, { start: 0.7, end: 1.2, text: '충격을' },
      { start: 1.2, end: 1.9, text: '받아병가를' }, { start: 1.9, end: 2.4, text: '냈고' },
    ] }] },
  );
  assert.ok(fusedPair.cues[0].evidence.spokenEnd > fusedPair.cues[1].evidence.firstWordStart);
  assert.throws(() => synthesisTextForCueGroup([cue14, { number: 15, text: '병과를 냈고.' }]), /exact normalized source sequence/);
  for (const rejectedText of ['병과를 냈고', '병가를 내고']) {
    assert.throws(() => alignSourceCuesToWordTranscript(
      [cue15],
      { segments: [{ start: 0, end: 1, text: rejectedText, words: [{ start: 0, end: 1, text: rejectedText }] }] },
    ), /cue 15/);
  }
  const fragmentStem = path.join(temp, 'cue-15-fragment-provider');
  const fragmentScriptPath = path.join(temp, 'cue-15-fragment-script.txt');
  const firstFifteenCues = sourceCues.slice(0, 15);
  await fsp.writeFile(fragmentScriptPath, firstFifteenCues.map((cue) => cue.text).join('\n'), 'utf8');
  const audioText = new Map();
  const fragmentSynthesisRequests = [];
  const transcriptFor = (texts) => ({ segments: [{
    start: 0,
    end: texts.length,
    text: texts.join(' '),
    words: texts.map((text, index) => ({ start: index, end: index + 0.8, text })),
  }] });
  const fragmentResult = await runFishSpeechLoraProvider({
    narration: { ...narration, cueIsolated: true },
    scriptPath: fragmentScriptPath,
    stem: fragmentStem,
    root,
    base,
    runFishCommand: async () => {},
    runRootCommand: async (_command, argv) => { await fsp.writeFile(argv.at(-1), 'audio'); },
    createCueWorkers: async ({ promptTokens }) => {
      await fsp.writeFile(promptTokens, 'prompt');
      return {
        fish: {
          ready: Promise.resolve(),
          async request(payload) {
            fragmentSynthesisRequests.push(payload.text);
            audioText.set(payload.output, payload.text);
            await fsp.writeFile(payload.output, 'audio');
            return { duration: ['교사는 큰 충격을 받아. 병가를 냈고.', '다음 날 출근한 여교사가, 매일 쓰던 텀블러에서'].includes(payload.text) ? 2.4 : 1, output: payload.output };
          },
          close() {},
        },
        whisper: {
          ready: Promise.resolve(),
          async request({ audio }) {
            if (audio === `${fragmentStem}.wav`) return { transcript: transcriptFor(firstFifteenCues.map((cue) => cue.text)) };
            if (audioText.get(audio) === '매일 쓰던 텀블러에서') return { transcript: transcriptFor(['매일']) };
            if (audioText.get(audio) === '다음 날 출근한 여교사가, 매일 쓰던 텀블러에서') return { transcript: { segments: [{ start: 0, end: 2.4, text: '다음 날 출근한 여교사가 매일 쓰던 텀블러에서', words: [
              { start: 0, end: 0.25, text: '다음' }, { start: 0.25, end: 0.45, text: '날' }, { start: 0.45, end: 0.8, text: '출근한' }, { start: 0.8, end: 1.2, text: '여교사가' },
              { start: 1.28, end: 1.6, text: '매일' }, { start: 1.6, end: 1.85, text: '쓰던' }, { start: 1.85, end: 2.4, text: '텀블러에서' },
            ] }] } };
            if (audioText.get(audio) === '교사는 큰 충격을 받아. 병가를 냈고.') return { transcript: { segments: [{ start: 0, end: 2.4, text: '교사는 큰 충격을 받아 병가를 냈고', words: [
              { start: 0, end: 0.3, text: '교사는' }, { start: 0.3, end: 0.6, text: '큰' }, { start: 0.6, end: 1.1, text: '충격을' },
              { start: 1.1, end: 1.6, text: '받아' }, { start: 1.68, end: 2.05, text: '병가를' }, { start: 2.05, end: 2.4, text: '냈고' },
            ] }] } };
            return { transcript: transcriptFor([audioText.get(audio)]) };
          },
          close() {},
        },
      };
    },
  });
  assert.equal(fragmentSynthesisRequests.at(-1), '교사는 큰 충격을 받아. 병가를 냈고.');
  assert.equal(fragmentSynthesisRequests.filter((text) => text === '매일 쓰던 텀블러에서').length, 3);
  assert.ok(fragmentSynthesisRequests.includes('다음 날 출근한 여교사가, 매일 쓰던 텀블러에서'));
  assert.equal(fragmentResult.acceptance.perCue[8].groupedArtifact, true);
  assert.equal(fragmentResult.acceptance.perCue[9].groupedArtifact, true);
  assert.equal(fragmentResult.cues[13].text, '교사는 큰 충격을 받아');
  assert.ok(Math.abs((fragmentResult.cues[13].end - fragmentResult.cues[13].start) - 1.6) < 1e-9);
  assert.equal(fragmentResult.cues[14].text, '병가를 냈고.');
  assert.ok(Math.abs((fragmentResult.cues[14].start - fragmentResult.cues[13].start) - 1.68) < 1e-9);
  assert.equal(fragmentResult.acceptance.perCue[13].groupedArtifact, true);
  assert.equal(fragmentResult.acceptance.perCue[14].groupedArtifact, true);
  console.log('fish-speech-lora provider tests passed');
} finally {
  await fsp.rm(temp, { recursive: true, force: true });
}
