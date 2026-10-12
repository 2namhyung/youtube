import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateQwenQuestionTail, extractQwenPcm16WavSegment, inspectQwenPcm16Wav } from './qwen3-tts-provider.mjs';

const root = path.resolve('.');
const bankPath = path.resolve(root, '../../03-script-voice/voice-clone/profiles/qwen-f4-reference-guide-v1/prompt-bank/manifest.json');
const validationPath = path.resolve(root, '../../03-script-voice/voice-clone/profiles/qwen-f4-reference-guide-v1/prompt-bank/validation/question-prompt.json');
const bank = JSON.parse(await fsp.readFile(bankPath, 'utf8'));
const validation = JSON.parse(await fsp.readFile(validationPath, 'utf8'));
const question = bank.styles?.question;
assert.equal(bank.status, 'validation-passed');
assert.equal(bank.productionEligible, true);
assert.equal(bank.model?.loraAllowed, false);
assert.equal(question?.role, 'question');
assert.equal(question?.source, 'owner-recording');
const audioPath = path.resolve(path.dirname(bankPath), question.audio);
const audioHash = crypto.createHash('sha256').update(await fsp.readFile(audioPath)).digest('hex');
assert.equal(audioHash, question.sha256.toLowerCase());
assert.equal(audioHash, validation.prompt.sha256);
const extractedPath = path.join(os.tmpdir(), `qwen-question-segment-${process.pid}.wav`);
await extractQwenPcm16WavSegment(audioPath, extractedPath, 2.16, 3.16);
const extractedSignal = await inspectQwenPcm16Wav(extractedPath);
assert.ok(Math.abs(extractedSignal.durationSeconds - 1) < 0.001, 'owner question span must extract the declared one-second asset segment');
await extractQwenPcm16WavSegment(audioPath, extractedPath, 2.16, 3.16, { guardSeconds: 0.02, fadeSeconds: 0.005 });
const guardedSignal = await inspectQwenPcm16Wav(extractedPath);
assert.ok(Math.abs(guardedSignal.durationSeconds - 1.04) < 1 / 24000, 'production owner question span must include 20 ms guards on both sides');
assert.equal(guardedSignal.endpointAmplitude, 0, 'production owner question span must start and end at digital silence');
assert.equal(guardedSignal.clippedSamples, 0, 'production owner question span must remain unclipped');
await fsp.rm(extractedPath, { force: true });
assert.equal(validation.asr.sixQuestionsExact, true);
assert.deepEqual(validation.asr.models, ['small', 'medium']);
assert.equal(validation.contour.questions.length, 3);
assert.deepEqual(question.segments.map((item) => [item.assetStartSeconds, item.assetEndSeconds]), [[0, 2.04], [2.16, 3.16], [3.28, 6.48]]);
for (const item of validation.contour.questions) {
  assert.ok(item.f0PreHz > 0 && item.f0TailHz > 0);
  assert.ok(item.deltaSemitones <= 0, `${item.text} contour must match the recorded falling ending`);
  assert.ok(item.tailDeltaDb <= 0, `${item.text} tail energy must not exceed preceding window`);
}
const sampleRate = 24000;
const synthetic = new Float32Array(sampleRate);
for (let index = 0; index < synthetic.length; index += 1) {
  const frequency = index < sampleRate * 0.7 ? 100 : 180;
  synthetic[index] = 0.2 * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
}
assert.equal(evaluateQwenQuestionTail(synthetic, sampleRate).passes, false, 'rising generated question tail must be rejected');
const mildlyRising = new Float32Array(sampleRate);
for (let index = 0; index < mildlyRising.length; index += 1) {
  const frequency = index < sampleRate * 0.7 ? 100 : 106;
  mildlyRising[index] = 0.12 * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
}
assert.equal(evaluateQwenQuestionTail(mildlyRising, sampleRate).passes, false, 'even a mildly rising generated question tail must be rejected');
console.log('qwen question prompt tests passed');
