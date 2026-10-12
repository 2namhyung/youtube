import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const root = path.resolve('.');
const workspaceRoot = path.resolve(root, '..', '..');
const out = path.join(workspaceRoot, '03-script-voice', 'runs', 'qwen-17b-ab-20260807');
const bank = path.join(workspaceRoot, '03-script-voice', 'releases', 'qwen-f4-owner-1.7b-base-v1', 'prompt-bank', 'manifest.json');
const modelLocalPath = 'C:/Users/User/tools/qwen3-tts-pilot/models/Qwen3-TTS-12Hz-1.7B-Base-fd4b25438912';
const mode = process.argv[2] || 'terms';
const hardTerms = ['살인미수', '특수상해', '집행유예 3년', '감형됐습니다.'];
const legalParagraph = '검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.\n1심 징역 2년.\n항소심에선 징역 1년 6개월에 집행유예 3년으로 감형됐습니다.';
const text = mode === 'terms' ? hardTerms.join('\n\n') : legalParagraph;
if (!['terms', 'paragraph'].includes(mode)) throw new Error('Usage: node scripts/qwen17b-ab-probe.mjs [terms|paragraph]');
await fsp.mkdir(out, { recursive: true });
const scriptPath = path.join(out, `17b-${mode}.txt`);
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
  style: 'auto',
  stylePlan: text.split(/\n\s*\n+/u).filter(Boolean).map((section, segmentIndex) => ({ segmentIndex, textSha256: crypto.createHash('sha256').update(section.replace(/\s+/gu, ' ').trim(), 'utf8').digest('hex'), style: 'criticism' })),
  promptBank: bank,
  modelId: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base',
  modelRevision: 'fd4b254389122332181a7c3db7f27e918eec64e3',
  modelLocalPath,
  attentionImplementation: 'sdpa',
  device: 'cuda',
  seed: 20260807,
  maxAttempts: 12,
  temperature: 0.55,
  finalTempo: 1,
  criticalPhrases: hardTerms,
  criticalPhraseModels: ['small', 'medium'],
  ...(mode === 'terms' ? { criticalPhraseIsolationTerms: hardTerms } : {}),
  pronunciationHints: [
    { source: '살인미수', spoken: '살인 미수' },
    { source: '특수상해', spoken: '특수 상해' },
    { source: '감형됐습니다.', spoken: '감형 됐습니다.' },
  ],
};
try {
  const result = await runQwen3TtsProvider({ narration, scriptPath, stem: path.join(out, `17b-${mode}`), root, base: out, promptBankPath: bank, runRootCommand });
  console.log(JSON.stringify({ mode, accepted: true, audioPath: result.audioPath, acceptancePath: path.join(out, `17b-${mode}.acceptance.json`), runtime: result.acceptance.evidence.runtime, segments: result.acceptance.evidence.segmentAttempts.length }, null, 2));
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
