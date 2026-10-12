#!/usr/bin/env node
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { alignSourceCuesToWordTranscript, runFishSpeechLoraProvider } from '../06-production/opencut-automation/scripts/fish-speech-lora-provider.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = path.join(workspace, '06-production', 'opencut-automation');
const projectDir = path.join(production, 'production', 'projects', 'school-case-production');
const project = JSON.parse(await fsp.readFile(path.join(projectDir, 'project.json'), 'utf8'));
const useF2 = process.argv.includes('--f2');
const modelProfile = useF2 ? {
  mergedModel: 'fish-speech-1.5-F2-r8-step120-20260727',
  mergedModelSha256: '8d0358b8bcc408c43c749c82f5cc4cc0831b3fa62a70bd4ef0e088f79dddb5f2',
  loraCheckpoint: 'F2_lora_20260727_r8/checkpoints/step_000000120.ckpt',
  loraSha256: '4408cec7570b136877dbe4170aadd6a2b349d14cb67db8a813b7c93ffd06c57b',
  modelRevision: 'F2 user-voice LoRA r8 alpha16 step120',
  modelFallbackFrom: 'fish-speech-1.5-F3-prosody-r8-step160-20260727',
  modelFallbackReason: 'F3 failed the exact-token pronunciation gate for 교권보호국',
} : {};
const scriptPath = path.join(production, 'production', 'newsroom', 'projects', 'jeju-school-intrusion.json');
const scriptBytes = await fsp.readFile(scriptPath);
const scriptSha256 = crypto.createHash('sha256').update(scriptBytes).digest('hex');
const authoritative = JSON.parse(scriptBytes.toString('utf8'));
const sourceCues = authoritative.draft.trim().split(/\n+/).map((text, index) => ({ number: index + 1, text: text.replace(/\s+/g, ' ').trim() }));
const openingCues = sourceCues.slice(0, 5);
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const runDir = path.join(workspace, '03-script-voice', 'runs', `${useF2 ? 'jeju-f2-model-probe' : 'jeju-pronunciation-probe'}-${runId}`);
const fishRoot = path.resolve(workspace, '..', '..', '..', 'tools', 'fish-speech');
await fsp.mkdir(runDir, { recursive: true });

function run(command, argv, { cwd = production } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('close', (code) => code ? reject(new Error(`${command} failed (${code})`)) : resolve());
  });
}

async function reportAttempts(stem) {
  const reports = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const wordsPath = `${stem}-chunk-01-attempt-${attempt}.words.json`;
    try {
      const transcript = JSON.parse(await fsp.readFile(wordsPath, 'utf8'));
      reports.push({ attempt, ...alignSourceCuesToWordTranscript(openingCues, transcript, { requireAcceptance: false }).report });
    } catch (error) {
      if (error?.code !== 'ENOENT') reports.push({ attempt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return reports;
}

const variants = useF2 ? [
  { id: 'f2-canonical', spoken: '교권보호국', overrides: {} },
] : [
  { id: 'gyogwon-tense', spoken: '교꿘 보호국' },
  { id: 'gyogwon-tense-separated', spoken: '교꿘 보호 국' },
];
const summary = { profile: useF2 ? 'F2' : 'F3-phonetic', modelProfile, scriptSha256, canonicalToken: '교권보호국', openingCueNumbers: openingCues.map((cue) => cue.number), maxSeedsPerVariant: 2, variants: [], selected: null };
const normalizeExactToken = (value) => String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

for (const variant of variants) {
  const variantDir = path.join(runDir, variant.id);
  const probeScript = path.join(variantDir, 'authoritative-opening.txt');
  const stem = path.join(variantDir, 'narration');
  await fsp.mkdir(variantDir, { recursive: true });
  await fsp.writeFile(probeScript, `${openingCues.map((cue) => cue.text).join('\n')}\n`, 'utf8');
  const narration = {
    ...project.narration,
    ...modelProfile,
    speechTempo: 1,
    maxAttempts: 2,
    cueIsolated: false,
    pronunciationOverrides: variant.overrides || { 교권보호국: variant.spoken },
  };
  try {
    const result = await runFishSpeechLoraProvider({
      narration,
      scriptPath: probeScript,
      stem,
      root: production,
      base: projectDir,
      runFishCommand: (command, argv) => run(command, argv, { cwd: fishRoot }),
      runRootCommand: (command, argv) => run(command, argv, { cwd: production }),
    });
    const exactCanonicalTokenAccepted = normalizeExactToken(result.acceptance.final?.transcript).includes(normalizeExactToken(summary.canonicalToken));
    const record = { id: variant.id, spoken: variant.spoken, accepted: result.acceptance.accepted === true && result.acceptance.final?.accepted === true && exactCanonicalTokenAccepted, exactCanonicalTokenAccepted, acceptance: result.acceptance, provenance: result.provenance };
    summary.variants.push(record);
    if (record.accepted) { summary.selected = variant; break; }
  } catch (error) {
    summary.variants.push({ id: variant.id, spoken: variant.spoken, accepted: false, error: error instanceof Error ? error.message : String(error), attempts: await reportAttempts(stem) });
  }
}

summary.completedAt = new Date().toISOString();
await fsp.writeFile(path.join(runDir, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ runDir, ...summary }, null, 2));
process.exitCode = summary.selected ? 0 : 1;
