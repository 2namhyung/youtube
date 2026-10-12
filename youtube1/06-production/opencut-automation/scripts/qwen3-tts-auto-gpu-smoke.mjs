import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '..', '..');
const runDir = path.join(workspace, '03-script-voice', 'runs', 'qwen-auto-style-20260730');
const scriptPath = path.join(runDir, 'mixed-style-script.txt');
const script = [
  '\uc65c \uc774\ub7f0 \uc77c\uc774 \uacc4\uc18d \ubc18\ubcf5\ub420\uae4c\uc694?',
  '\uad50\uc721\ubd80 \ubc1c\ud45c\uc5d0 \ub530\ub974\uba74 \uc870\uc0ac \uacb0\uacfc\uac00 \ud655\uc778\ub410\uc2b5\ub2c8\ub2e4.',
  '\ud53c\ud574\uc640 \uac08\ub4f1\uc774 \ucee4\uc9c0\uba70 \ubd88\uc548\uacfc \uc704\uae30\uac00 \uc774\uc5b4\uc84c\uc2b5\ub2c8\ub2e4.',
  '\ubb38\uc81c\uc640 \uc2e4\ud328\uc5d0 \ucc45\uc784\uc774 \ubd80\uc871\ud588\ub2e4\ub294 \ube44\ud310\ub3c4 \ub098\uc635\ub2c8\ub2e4.',
  '\ud574\ubc95\uc740 \uc9c0\uc6d0\uacfc \uac1c\uc120\uc744 \ud568\uaed8 \ucd94\uc9c4\ud558\ub294 \uac83\uc785\ub2c8\ub2e4.',
].join('\n\n');
await fsp.mkdir(runDir, { recursive: true });
await fsp.writeFile(scriptPath, `${script}\n`, 'utf8');

const run = (command, argv, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(command, argv, { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(capture ? stdout : '') : reject(new Error(`${command} failed (${code}): ${stderr.slice(-4000)}`)));
});

const result = await runQwen3TtsProvider({
  narration: { mode: 'qwen3-tts', style: 'auto', device: 'cuda', seed: 20260730, maxAttempts: 1, temperature: 0.7, finalTempo: 1 },
  scriptPath,
  stem: path.join(runDir, 'mixed-style'),
  root,
  base: workspace,
  runRootCommand: run,
});
await fsp.writeFile(path.join(runDir, 'mixed-style-result.json'), `${JSON.stringify({
  audioPath: result.audioPath,
  srtPath: result.srtPath,
  acceptance: result.acceptance,
  provenance: result.provenance,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  accepted: result.acceptance.final.accepted,
  audioPath: result.audioPath,
  styles: result.acceptance.evidence.sectionPlan.map(({ style }) => style),
  peakGpuTempC: result.provenance.peakGpuTempC,
}));
