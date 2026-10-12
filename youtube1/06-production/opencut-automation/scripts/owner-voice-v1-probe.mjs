import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const root = path.resolve('.');
const workspaceRoot = path.resolve(root, '..', '..');
const out = path.join(workspaceRoot, '03-script-voice', 'runs', 'owner-voice-v1-20260808', 'held-out');
const bankPath = path.join(workspaceRoot, '03-script-voice', 'voice-clone', 'profiles', 'owner-voice-v1', 'prompt-bank', 'manifest.json');
const bank = JSON.parse(await fsp.readFile(bankPath, 'utf8'));
const prompt = bank.styles.legal_explanation;
const referenceAudio = path.resolve(path.dirname(bankPath), prompt.audio);
const text = '사람이 먹으면 안 되는 살충제잖아요. 검찰은 사람을 죽이려 한 행동을 주장했지만 법원이 인정한 건 위험한 물질로 동료를 다치게 한 책임이었습니다. 1심 징역 2년. 항소심에선 징역 1년 6개월이었고, 3년 동안 문제를 일으키지 않으면 바로 감옥에 가지 않는 판결로 형이 줄었습니다.';
await fsp.mkdir(out, { recursive: true });
const scriptPath = path.join(out, 'nurse-plain-legal-paragraph.txt');
await fsp.writeFile(scriptPath, text, 'utf8');

const runRootCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr || stdout}`)));
});

const narration = {
  mode: 'qwen3-tts',
  style: 'neutral',
  referenceAudio,
  referenceTranscript: prompt.transcript,
  referenceAudioSha256: prompt.sha256,
  device: 'cuda',
  seed: 20260808,
  maxAttempts: 4,
  temperature: 0.55,
  finalTempo: 1,
  maxSegmentChars: 220,
  criticalPhrases: ['사람을 죽이려 한 행동', '위험한 물질로 동료를 다치게 한 책임', '징역 1년 6개월', '3년 동안', '형이 줄었습니다'],
  criticalPhraseModels: ['small', 'medium'],
  criticalPhraseIsolation: false,
  criticalPhraseIsolationTerms: [],
  pronunciationHints: [],
  removeSilence: false,
  sentencePauseSeconds: 0,
  semanticPauseSeconds: 0,
  joinSafetySeconds: 0.005,
};

try {
  const result = await runQwen3TtsProvider({
    narration,
    scriptPath,
    stem: path.join(out, 'nurse-plain-legal-paragraph'),
    root,
    base: out,
    runRootCommand,
  });
  console.log(JSON.stringify({
    accepted: true,
    audioPath: result.audioPath,
    acceptancePath: path.join(out, 'nurse-plain-legal-paragraph.acceptance.json'),
    audioSha256: result.acceptance.evidence.finalAudioSha256,
    runtime: result.acceptance.evidence.runtime,
    attempts: result.acceptance.attemptCount,
    units: result.acceptance.final.segmentCount,
  }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
