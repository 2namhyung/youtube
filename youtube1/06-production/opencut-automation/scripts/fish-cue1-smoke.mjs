import path from 'node:path';
import { alignSourceCuesToWordTranscript, createJsonLineWorker, FISH_PROMPT_TEXT } from './fish-speech-lora-provider.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(root, '..', '..');
const fishRoot = path.resolve(workspaceRoot, '..', '..', '..', 'tools', 'fish-speech');
const voiceCloneRoot = path.join(workspaceRoot, '03-script-voice', 'voice-clone');
const scratchRoot = path.join(workspaceRoot, '07-quality-assurance', 'tmp');
const synthesisText = process.argv[2] || '교권, 보호국.';
const cueNumber = Number(process.argv[3] || 1);
const authoritativeText = process.argv[4] || '교권보호국.';
const outputTag = `cue${cueNumber}-${synthesisText.includes(',') ? 'comma' : 'space'}`;
const worker = createJsonLineWorker(path.join(fishRoot, 'venv', 'Scripts', 'python.exe'), [
  path.join(root, 'scripts', 'fish-cue-worker.py'),
  '--fish-root', fishRoot,
  '--checkpoint-path', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5-F-r8-step100-20260726'),
  '--vq-checkpoint', path.join(fishRoot, 'checkpoints', 'fish-speech-1.5', 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth'),
  '--reference-audio', path.join(voiceCloneRoot, 'samples', 'F-final.wav'),
  '--prompt-tokens-output', path.join(scratchRoot, `cue1-smoke-${outputTag}-prompt.npy`),
  '--prompt-text', FISH_PROMPT_TEXT,
  '--device', 'cuda',
], { cwd: fishRoot });
const whisper = createJsonLineWorker('python', [path.join(root, 'scripts', 'whisper-cue-worker.py')], { cwd: root });

try {
  let accepted;
  const attempts = [];
  for (let attempt = 0; attempt < 3 && !accepted; attempt += 1) {
    const seed = 20260726 + cueNumber * 1000 + attempt * 101;
    const result = await worker.request({ text: synthesisText, seed, output: path.join(scratchRoot, `cue1-smoke-${outputTag}-attempt-${attempt + 1}.wav`) });
    const transcript = await whisper.request({ audio: result.output });
    try {
      const alignment = alignSourceCuesToWordTranscript([{ number: cueNumber, text: authoritativeText }], transcript.transcript);
      accepted = { attempt: attempt + 1, seed, synthesisText, authoritativeText: alignment.cues[0].text, generated: result, acceptance: alignment.report };
      attempts.push({ attempt: attempt + 1, seed, accepted: true, transcript: alignment.report.transcript, coverage: alignment.report.overallCoverage });
    } catch (error) {
      attempts.push({ attempt: attempt + 1, seed, accepted: false, error: error.message });
    }
  }
  if (!accepted) throw new Error(`cue ${cueNumber} smoke exhausted three seeds: ${JSON.stringify(attempts)}`);
  console.log(JSON.stringify({ accepted, attempts }));
} finally {
  worker.close();
  whisper.close();
}
