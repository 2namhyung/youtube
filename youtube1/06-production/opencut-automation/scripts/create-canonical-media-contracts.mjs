import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(automationRoot, '..', '..');
const sha256 = async (file) => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = async (file, value) => {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, stableJson(value), 'utf8');
};

const sourceProfile = path.join(workspaceRoot, '03-script-voice', 'voice-clone', 'profiles', 'qwen-f4-reference-guide-v1-retake5');
const sourceBank = JSON.parse(await fsp.readFile(path.join(sourceProfile, 'prompt-bank', 'manifest.json'), 'utf8'));
const ownerRecording5 = path.join(os.homedir(), 'Documents', '소리 녹음', '녹음 (5).m4a');
if (!fs.existsSync(ownerRecording5)) throw new Error('Owner recording 5 provenance source is missing; refusing to create an unbound profile');
const ownerRecording5Sha256 = await sha256(ownerRecording5);
const releaseRoot = path.join(workspaceRoot, '03-script-voice', 'releases', 'qwen-f4-owner-base-v1');
const bankRoot = path.join(releaseRoot, 'prompt-bank');
const assetRoot = path.join(bankRoot, 'assets');
await fsp.mkdir(assetRoot, { recursive: true });

const assetMap = new Map();
for (const [style, entry] of Object.entries(sourceBank.styles)) {
  const source = path.resolve(path.join(sourceProfile, 'prompt-bank'), entry.audio);
  const name = style === 'question' ? 'question.wav' : 'reference-guide.wav';
  const destination = path.join(assetRoot, name);
  if (!assetMap.has(name)) {
    await fsp.copyFile(source, destination);
    assetMap.set(name, await sha256(destination));
  }
  if (assetMap.get(name) !== String(entry.sha256).toLowerCase()) throw new Error(`Source prompt hash mismatch for ${style}`);
}

const portableBank = {
  schemaVersion: 1,
  profileId: 'qwen-f4-owner-base-v1',
  status: 'validation-passed',
  productionEligible: true,
  ownerVoice: true,
  portability: { versioned: true, selfContainedPromptAssets: true, externalRuntimeAssetsRequired: false },
  model: {
    id: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
    revision: '5d83992436eae1d760afd27aff78a71d676296fc',
    precision: 'bf16', language: 'Korean', loraAllowed: false, adapterAllowed: false, fallbackAllowed: false,
  },
  sourceAudit: {
    lineageProfileId: sourceBank.profileId,
    finalPromptSpeaker: 'F4 owner voice',
    derivation: 'owner timbre reference with a declarative prosody carrier; prompt WAVs are final owner-voice assets',
    thirdPartyProsodyCarrierUsedDuringDerivation: true,
    thirdPartySpeakerIdentityRetained: false,
    carrierIncluded: false,
    carrierSha256: sourceBank.sourceAudit.carrierSha256,
    targetSpeakerReferenceIncluded: false,
    targetSpeakerReferenceSha256: sourceBank.sourceAudit.targetSpeakerReferenceSha256,
    sourceRecordingProvenance: {
      ownerAuthorizedForThisTask: true,
      originalFilename: '녹음 (5).m4a',
      sourceUntouched: true,
      included: false,
      sha256: ownerRecording5Sha256,
      usage: 'timbre-reference supplement already present in the selected current profile; not transcript training data',
    },
  },
  defaultStyle: 'hook',
  styles: Object.fromEntries(Object.entries(sourceBank.styles).map(([style, entry]) => [style, {
    ...entry,
    audio: `assets/${style === 'question' ? 'question.wav' : 'reference-guide.wav'}`,
    sha256: assetMap.get(style === 'question' ? 'question.wav' : 'reference-guide.wav'),
  }])),
  validation: {
    status: 'passed',
    scope: 'every generated segment',
    dualAsrModels: ['small', 'medium'],
    maxCharacterErrorRate: 0.08,
    maxFinalTempo: 1.08,
    deterministicSeedRequired: true,
    signalGatesRequired: true,
    baseOnly: true, loraLoaded: false, adapterLoaded: false, fallbackUsed: false,
    ownerPlayback: 'pending-for-profile-character; does not waive per-generation dual-ASR and signal gates',
  },
};
const bankPath = path.join(bankRoot, 'manifest.json');
await writeJson(bankPath, portableBank);
const bankSha256 = await sha256(bankPath);
const releaseManifest = {
  schemaVersion: 1,
  contract: 'canonical-owner-voice-profile-v1',
  profileId: portableBank.profileId,
  ownerVoice: true,
  engine: portableBank.model,
  promptBank: { manifest: 'prompt-bank/manifest.json', manifestSha256: bankSha256, styles: Object.keys(portableBank.styles) },
  gates: portableBank.validation,
  policy: { localPrivateUseOnly: true, redistributePromptAudio: false, noLora: true, noAdapter: true, noFallback: true },
};
await writeJson(path.join(releaseRoot, 'manifest.json'), releaseManifest);
const releaseFiles = [
  'manifest.json', 'prompt-bank/manifest.json', 'prompt-bank/assets/reference-guide.wav', 'prompt-bank/assets/question.wav',
];
const checksums = [];
for (const relative of releaseFiles) checksums.push(`${await sha256(path.join(releaseRoot, relative))}  ${relative.replaceAll('\\', '/')}`);
await fsp.writeFile(path.join(releaseRoot, 'CHECKSUMS.sha256'), `${checksums.join('\n')}\n`, 'utf8');

const bgmEngineRoot = path.join(workspaceRoot, '05-bgm-generation', 'engines', 'ace-step-1.5-official-local-v1');
const bgmEngine = {
  schemaVersion: 1,
  engineId: 'ace-step-1.5-official-local-v1',
  provider: 'ACE-Step 1.5 official local inference',
  installedVersion: '1.5.0',
  officialRepository: 'https://github.com/ace-step/ACE-Step-1.5',
  officialRepositoryCommit: '6d467e4b5081ccb0abf1ec1bf4fdf9051a2d34b0',
  models: { dit: 'acestep-v15-turbo', lm: 'acestep-5Hz-lm-0.6B' },
  runtime: { backend: 'PyTorch', device: 'CUDA', quantization: 'int8_weight_only', offloadToCpu: true, offloadDitToCpu: true },
  rights: { license: 'MIT (ACE-Step code and official model repository metadata)', thirdPartySamplesAllowed: false },
  output: { sampleRate: 48000, channels: 2, codec: 'pcm_s24le', targetLufs: -24.0 },
  mixDefaults: { volumeDb: -16, duckUnderNarration: true, fadeSeconds: 1.2 },
  eventBinding: { promptRequired: true, seedRequired: true, eventSlugRequired: true, crossEventAudioReuseForbidden: true },
};
await writeJson(path.join(bgmEngineRoot, 'manifest.json'), bgmEngine);

console.log(JSON.stringify({
  voiceRelease: path.relative(workspaceRoot, releaseRoot).replaceAll(path.sep, '/'),
  voiceManifestSha256: await sha256(path.join(releaseRoot, 'manifest.json')),
  promptBankSha256: bankSha256,
  bgmEngine: path.relative(workspaceRoot, bgmEngineRoot).replaceAll(path.sep, '/'),
}, null, 2));
