import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(automationRoot, '..', '..');
const modelId = 'Qwen/Qwen3-TTS-12Hz-1.7B-Base';
const revision = 'fd4b254389122332181a7c3db7f27e918eec64e3';
const modelRoot = path.resolve(process.argv[2] || 'C:/Users/User/tools/qwen3-tts-pilot/models/Qwen3-TTS-12Hz-1.7B-Base-fd4b25438912');
const releaseRoot = path.join(workspaceRoot, '03-script-voice', 'releases', 'qwen-f4-owner-1.7b-base-v1');
const sourceRoot = path.join(workspaceRoot, '03-script-voice', 'releases', 'qwen-f4-owner-base-v1', 'prompt-bank');
const bankRoot = path.join(releaseRoot, 'prompt-bank');
const sha256 = async (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const writeJson = async (file, value) => {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const walk = async (root, current = root) => (await Promise.all((await fsp.readdir(current, { withFileTypes: true }))
  .filter((entry) => entry.name !== '.cache')
  .map(async (entry) => entry.isDirectory() ? walk(root, path.join(current, entry.name)) : path.join(current, entry.name)))).flat();

const sourceBankPath = path.join(sourceRoot, 'manifest.json');
const sourceBank = JSON.parse(await fsp.readFile(sourceBankPath, 'utf8'));
if (sourceBank.profileId !== 'qwen-f4-owner-base-v1' || sourceBank.ownerVoice !== true || sourceBank.validation?.status !== 'passed') throw new Error('Locked portable F4 source prompt bank is not eligible');
const modelConfig = JSON.parse(await fsp.readFile(path.join(modelRoot, 'config.json'), 'utf8'));
if (modelConfig.tts_model_type !== 'base' || modelConfig.tts_model_size !== '1b7') throw new Error('Downloaded checkpoint is not Qwen3-TTS 1.7B Base');

const copiedAssets = new Map();
const styles = {};
for (const [style, entry] of Object.entries(sourceBank.styles)) {
  const relative = String(entry.audio).replaceAll('\\', '/');
  const source = path.resolve(sourceRoot, relative);
  const destination = path.resolve(bankRoot, relative);
  if (!copiedAssets.has(relative)) {
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(source, destination);
    copiedAssets.set(relative, await sha256(destination));
  }
  if (copiedAssets.get(relative) !== String(entry.sha256).toLowerCase()) throw new Error(`Portable F4 prompt hash mismatch for ${style}`);
  styles[style] = { ...entry, audio: relative, sha256: copiedAssets.get(relative) };
}

const modelFiles = [];
for (const file of (await walk(modelRoot)).sort()) modelFiles.push({
  path: path.relative(modelRoot, file).replaceAll(path.sep, '/'),
  bytes: (await fsp.stat(file)).size,
  sha256: await sha256(file),
});
const modelLock = {
  schemaVersion: 1,
  modelId,
  revision,
  license: 'Apache-2.0',
  officialRepository: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base',
  officialCodeRepository: 'https://github.com/QwenLM/Qwen3-TTS',
  localRoot: modelRoot.replaceAll(path.sep, '/'),
  files: modelFiles,
};
await writeJson(path.join(releaseRoot, 'model-lock.json'), modelLock);

const bank = {
  ...sourceBank,
  profileId: 'qwen-f4-owner-1.7b-base-v1',
  model: {
    id: modelId,
    revision,
    precision: 'bf16',
    language: 'Korean',
    loraAllowed: false,
    adapterAllowed: false,
    fallbackAllowed: false,
  },
  sourceAudit: {
    ...sourceBank.sourceAudit,
    lineageProfileId: sourceBank.profileId,
    promptAssetsReusedByteForByte: true,
    modelUpgradeExperiment: '0.6B Base to 1.7B Base; voice reference identity is unchanged',
  },
  validation: {
    ...sourceBank.validation,
    modelAcceptance: 'pending-hard-term-legal-paragraph-and-full-narration-gates',
  },
};
const bankPath = path.join(bankRoot, 'manifest.json');
await writeJson(bankPath, bank);
const bankSha256 = await sha256(bankPath);
const manifest = {
  schemaVersion: 1,
  contract: 'canonical-owner-voice-profile-v1',
  profileId: bank.profileId,
  status: 'experimental',
  ownerVoice: true,
  engine: bank.model,
  modelLock: { manifest: 'model-lock.json', manifestSha256: await sha256(path.join(releaseRoot, 'model-lock.json')) },
  promptBank: { manifest: 'prompt-bank/manifest.json', manifestSha256: bankSha256, styles: Object.keys(styles) },
  gates: bank.validation,
  policy: { localPrivateUseOnly: true, redistributePromptAudio: false, noLora: true, noAdapter: true, noFallback: true },
};
await writeJson(path.join(releaseRoot, 'manifest.json'), manifest);

const releaseFiles = ['manifest.json', 'model-lock.json', 'prompt-bank/manifest.json', ...[...copiedAssets.keys()].map((file) => `prompt-bank/${file}`)];
const checksums = [];
for (const relative of releaseFiles) checksums.push(`${await sha256(path.join(releaseRoot, relative))}  ${relative}`);
await fsp.writeFile(path.join(releaseRoot, 'CHECKSUMS.sha256'), `${checksums.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ releaseRoot, modelId, revision, modelFileCount: modelFiles.length, modelBytes: modelFiles.reduce((sum, item) => sum + item.bytes, 0), modelLockSha256: manifest.modelLock.manifestSha256, promptBankSha256: bankSha256 }, null, 2));
