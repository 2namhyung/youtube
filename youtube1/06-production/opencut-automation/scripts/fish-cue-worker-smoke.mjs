import path from 'node:path';
import { alignSourceCuesToWordTranscript, createJsonLineWorker, FISH_PROMPT_TEXT } from './fish-speech-lora-provider.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(root, '..', '..');
const fishRoot = path.resolve(workspaceRoot, '..', '..', '..', 'tools', 'fish-speech');
const voiceCloneRoot = path.join(workspaceRoot, '03-script-voice', 'voice-clone');
const scratchRoot = path.join(workspaceRoot, '07-quality-assurance', 'tmp');
const worker = createJsonLineWorker(path.join(fishRoot, 'venv', 'Scripts', 'python.exe'), [
  path.join(root, 'scripts', 'fish-cue-worker.py'),
  '--fish-root', fishRoot,
  '--checkpoint-path', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5-F-r8-step100-20260726'),
  '--vq-checkpoint', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5', 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth'),
  '--reference-audio', path.join(voiceCloneRoot, 'samples', 'F-final.wav'),
  '--prompt-tokens-output', path.join(scratchRoot, 'persistent-smoke-prompt.npy'),
  '--prompt-text', FISH_PROMPT_TEXT,
  '--device', 'cuda',
], { cwd: fishRoot });
const whisper = createJsonLineWorker('python', [path.join(root, 'scripts', 'whisper-cue-worker.py')], { cwd: root });
try {
  let accepted;
  for (let attempt = 0; attempt < 3 && !accepted; attempt += 1) {
    const result = await worker.request({ text: '다행히. 첫 사건 후 학교가 설치한 씨씨티비에', seed: 20280726 + attempt * 101, output: path.join(scratchRoot, `persistent-smoke-${attempt + 1}.wav`) });
    const transcript = await whisper.request({ audio: result.output });
    try {
      const alignment = alignSourceCuesToWordTranscript([{ number: 20, text: '다행히.' }, { number: 21, text: '첫 사건 후 학교가 설치한 씨씨티비에' }], transcript.transcript);
      accepted = { attempt: attempt + 1, generated: result, acceptance: alignment.report };
    } catch (error) {
      console.error(`attempt ${attempt + 1} rejected: ${error.message}`);
    }
  }
  if (!accepted) throw new Error('persistent smoke exhausted three seeds');
  console.log(JSON.stringify(accepted));
} finally {
  worker.close(); whisper.close();
}
