import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const root = path.resolve('.');
const base = path.resolve(root, 'production/projects');
const bank = path.resolve(root, '../../03-script-voice/voice-clone/profiles/qwen-f4-reference-guide-v1/prompt-bank/manifest.json');
const out = path.resolve(root, 'out/.private/qwen-question-probes');
await fsp.mkdir(out, { recursive: true });
const runRootCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr || stdout}`)));
});
const samples = [
  { id: 'question-only-01', text: '현실에도 진짜 필요한 거 아니에요?', questionSentences: ['현실에도 진짜 필요한 거 아니에요?'], criticalPhrases: ['필요한'] },
  { id: 'question-only-02', text: '이게 말이 되나요?', questionSentences: ['이게 말이 되나요?'], criticalPhrases: ['말이'] },
  { id: 'question-only-03', text: '하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?', questionSentences: ['하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?'], criticalPhrases: ['피해자 보호'] },
  { id: 'mixed-hook-baseline', text: '넷플릭스 시리즈 <참교육> 속 교권보호국. 현실에도 진짜 필요한 거 아니에요?', questionSentences: [], criticalPhrases: ['교권보호국'] },
  { id: 'mixed-hook-question-guide', text: '넷플릭스 시리즈 <참교육> 속 교권보호국. 현실에도 진짜 필요한 거 아니에요?', questionSentences: [], stylePlan: [{ segmentIndex: 0, style: 'question' }], criticalPhrases: ['교권보호국'] },
  { id: 'spoken-hook-declarative', text: '넷플릭스 시리즈 참교육에 나오는 교권보호국.', questionSentences: [], stylePlan: [{ segmentIndex: 0, style: 'hook' }], criticalPhrases: ['교권보호국'] },
];
const results = [];
for (const sample of samples.slice(5)) {
  const scriptPath = path.join(out, `${sample.id}.txt`);
  await fsp.writeFile(scriptPath, sample.text, 'utf8');
  const stem = path.join(out, sample.id);
  try {
    const result = await runQwen3TtsProvider({
      narration: { mode: 'qwen3-tts', style: 'auto', promptBank: bank, questionSentences: sample.questionSentences, criticalPhrases: sample.criticalPhrases, criticalPhraseModels: ['medium'], ...(sample.stylePlan ? { stylePlan: sample.stylePlan.map((item) => ({ ...item, textSha256: crypto.createHash('sha256').update(sample.text, 'utf8').digest('hex') })) } : {}), device: 'cuda', seed: 20260830, maxAttempts: 5, temperature: 0.55, finalTempo: 1 },
      scriptPath, stem, root, base, promptBankPath: bank, runRootCommand,
    });
    results.push({ id: sample.id, accepted: result.acceptance?.accepted === true, segmentCount: result.acceptance?.final?.segmentCount, cues: result.cues?.map(({ text, style }) => ({ text, style })) });
  } catch (error) {
    results.push({ id: sample.id, accepted: false, error: error.message });
  }
}
await fsp.writeFile(path.join(out, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results, null, 2));
