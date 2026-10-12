import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '..', '..');
const runDir = path.join(workspace, '03-script-voice', 'runs', 'qwen-canonical-20260730');
const scriptPath = path.join(runDir, 'smoke-script.txt');
await fsp.mkdir(runDir, { recursive: true });

const run = (command, argv, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(command, argv, { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(capture ? stdout : '') : reject(new Error(`${command} failed (${code}): ${stderr.slice(-2000)}`)));
});

const result = await runQwen3TtsProvider({
  narration: {
    mode: 'qwen3-tts',
    referenceAudio: path.join(workspace, '03-script-voice', 'voice-clone', 'pilots', 'model-ab-20260729', 'f4_ref_gyogwon.wav'),
    referenceAudioSha256: '31b3fdee6e1417daee8dd863f479b01408a840cc21762c2927e2a3c97b4a4646',
    referenceTranscript: '교권보호국은 교권을 보호하는 가상의 기관입니다. 현실의 교권 보호 제도는 제대로 작동하고 있을까요? 교권과 권한은 서로 다른 의미를 가집니다.',
    device: 'cuda', seed: 20260730, maxAttempts: 1, temperature: 0.7, finalTempo: 1,
  },
  scriptPath,
  stem: path.join(runDir, 'smoke'),
  root,
  base: workspace,
  runRootCommand: run,
});
await fsp.writeFile(path.join(runDir, 'smoke-result.json'), `${JSON.stringify({
  audioPath: result.audioPath,
  srtPath: result.srtPath,
  acceptance: result.acceptance,
  provenance: result.provenance,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ accepted: result.acceptance.final.accepted, audioPath: result.audioPath, peakGpuTempC: result.provenance.peakGpuTempC }));
