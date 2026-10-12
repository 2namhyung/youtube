import path from 'node:path';
import { alignSourceCuesToWordTranscript, createJsonLineWorker, FISH_PROMPT_TEXT } from './fish-speech-lora-provider.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(root, '..', '..');
const fishRoot = path.resolve(workspaceRoot, '..', '..', '..', 'tools', 'fish-speech');
const voiceCloneRoot = path.join(workspaceRoot, '03-script-voice', 'voice-clone');
const scratchRoot = path.join(workspaceRoot, '07-quality-assurance', 'tmp');
const synthesisText = '교사는 큰 충격을 받아. 병가를 냈고.';
const sourceCues = [{ number: 14, text: '교사는 큰 충격을 받아' }, { number: 15, text: '병가를 냈고.' }];
const worker = createJsonLineWorker(path.join(fishRoot, 'venv', 'Scripts', 'python.exe'), [
  path.join(root, 'scripts', 'fish-cue-worker.py'),
  '--fish-root', fishRoot,
  '--checkpoint-path', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5-F-r8-step100-20260726'),
  '--vq-checkpoint', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5', 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth'),
  '--reference-audio', path.join(voiceCloneRoot, 'samples', 'F-final.wav'),
  '--prompt-tokens-output', path.join(scratchRoot, 'cue14-15-smoke-prompt.npy'),
  '--prompt-text', FISH_PROMPT_TEXT,
  '--device', 'cuda',
], { cwd: fishRoot });
const whisper = createJsonLineWorker('python', [path.join(root, 'scripts', 'whisper-cue-worker.py')], { cwd: root });

try {
  let accepted;
  const attempts = [];
  for (let attempt = 0; attempt < 3 && !accepted; attempt += 1) {
    const seed = 20260726 + 14000 + attempt * 101;
    const output = path.join(scratchRoot, `cue14-15-smoke-attempt-${attempt + 1}.wav`);
    const generated = await worker.request({ text: synthesisText, seed, output });
    const transcript = await whisper.request({ audio: output });
    try {
      const alignment = alignSourceCuesToWordTranscript(sourceCues, transcript.transcript);
      const cue14 = { start: 0, end: alignment.cues[0].evidence.spokenEnd, text: sourceCues[0].text };
      const cue15 = { start: alignment.cues[1].evidence.firstWordStart, end: Number(generated.duration), text: sourceCues[1].text };
      if (cue14.end - cue15.start > 0.1) throw new Error('cue 14-15 ASR word timestamps do not expose a separable 받아/병가를 boundary within 0.1s tolerance');
      if (cue14.end - cue14.start < 0.6) throw new Error('cue 14 duration is below 0.6s');
      const tailPaddingSeconds = Math.max(0, 0.6 - (cue15.end - cue15.start));
      cue15.end += tailPaddingSeconds;
      accepted = { attempt: attempt + 1, seed, synthesisText, generated, boundaries: [cue14, cue15], tailPaddingSeconds, acceptance: alignment.report };
      attempts.push({ attempt: attempt + 1, seed, accepted: true, transcript: alignment.report.transcript, coverage: alignment.report.overallCoverage });
    } catch (error) {
      attempts.push({ attempt: attempt + 1, seed, accepted: false, error: error.message });
    }
  }
  if (!accepted) throw new Error(`cue 14-15 smoke exhausted three seeds: ${JSON.stringify(attempts)}`);
  console.log(JSON.stringify({ accepted, attempts }));
} finally {
  worker.close();
  whisper.close();
}
