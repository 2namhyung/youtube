import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CANONICAL_QWEN_MODEL = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base';
export const CANONICAL_QWEN_REVISION = '5d83992436eae1d760afd27aff78a71d676296fc';
export const CANONICAL_ACE_COMMIT = '6d467e4b5081ccb0abf1ec1bf4fdf9051a2d34b0';
export const CANONICAL_ACE_ENGINE = 'ace-step-1.5-official-local-v1';
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
const resolveContained = (base, relative, label) => {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error(`${label} must be a non-empty relative path`);
  const root = path.resolve(base);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes its versioned root`);
  return target;
};

export function verifyCanonicalVoiceRelease(manifestPath) {
  const resolved = path.resolve(manifestPath);
  const release = read(resolved);
  if (release.contract !== 'canonical-owner-voice-profile-v1' || release.ownerVoice !== true) throw new Error('Canonical voice release must be an owner profile');
  const engine = release.engine || {};
  if (engine.id !== CANONICAL_QWEN_MODEL || engine.revision !== CANONICAL_QWEN_REVISION || engine.precision !== 'bf16') throw new Error('Canonical voice engine lock mismatch');
  if (engine.loraAllowed !== false || engine.adapterAllowed !== false || engine.fallbackAllowed !== false) throw new Error('Canonical voice must be Base-only with no fallback');
  const root = path.dirname(resolved);
  const bankPath = resolveContained(root, release.promptBank?.manifest, 'promptBank.manifest');
  if (!fs.existsSync(bankPath) || digest(bankPath) !== release.promptBank?.manifestSha256) throw new Error('Canonical prompt bank hash mismatch');
  const bank = read(bankPath);
  if (bank.profileId !== release.profileId || bank.status !== 'validation-passed' || bank.productionEligible !== true || bank.ownerVoice !== true) throw new Error('Canonical prompt bank is not production eligible');
  const gates = bank.validation || {};
  if (JSON.stringify(gates.dualAsrModels) !== JSON.stringify(['small', 'medium']) || gates.maxCharacterErrorRate !== 0.08 || gates.maxFinalTempo !== 1.08 || gates.deterministicSeedRequired !== true || gates.baseOnly !== true || gates.loraLoaded !== false || gates.adapterLoaded !== false || gates.fallbackUsed !== false) throw new Error('Canonical voice verification gates drifted');
  for (const [style, entry] of Object.entries(bank.styles || {})) {
    const audio = resolveContained(path.dirname(bankPath), entry.audio, `styles.${style}.audio`);
    if (!fs.existsSync(audio) || digest(audio) !== String(entry.sha256).toLowerCase()) throw new Error(`Canonical voice asset hash mismatch: ${style}`);
  }
  return { release, bank, manifestPath: resolved, bankPath, manifestSha256: digest(resolved), bankSha256: digest(bankPath) };
}

export function verifyCanonicalBgmEngine(manifestPath) {
  const resolved = path.resolve(manifestPath);
  const engine = read(resolved);
  if (engine.engineId !== CANONICAL_ACE_ENGINE || engine.installedVersion !== '1.5.0' || engine.officialRepositoryCommit !== CANONICAL_ACE_COMMIT) throw new Error('Canonical ACE-Step engine identity mismatch');
  if (engine.models?.dit !== 'acestep-v15-turbo' || engine.models?.lm !== 'acestep-5Hz-lm-0.6B') throw new Error('Canonical ACE-Step model lock mismatch');
  if (engine.output?.sampleRate !== 48000 || engine.output?.channels !== 2 || engine.output?.codec !== 'pcm_s24le' || engine.output?.targetLufs !== -24) throw new Error('Canonical ACE-Step output contract drifted');
  if (engine.mixDefaults?.volumeDb !== -16 || engine.mixDefaults?.duckUnderNarration !== true || engine.mixDefaults?.fadeSeconds !== 1.2) throw new Error('Canonical BGM mix defaults drifted');
  if (engine.eventBinding?.crossEventAudioReuseForbidden !== true) throw new Error('Canonical BGM must forbid cross-event audio reuse');
  return { engine, manifestPath: resolved, manifestSha256: digest(resolved) };
}

export function verifyEventBgm(projectBgm, baseDir, expectedSlug) {
  if (projectBgm?.provider !== 'ace-step-1.5') return null;
  for (const field of ['audio', 'provenance', 'engineContract', 'prompt', 'model', 'version', 'license', 'sha256']) if (typeof projectBgm[field] !== 'string' || !projectBgm[field]) throw new Error(`ACE-Step BGM requires ${field}`);
  if (!Number.isInteger(projectBgm.seed)) throw new Error('ACE-Step BGM requires a deterministic integer seed');
  const engine = verifyCanonicalBgmEngine(path.resolve(baseDir, projectBgm.engineContract)).engine;
  const audioPath = path.resolve(baseDir, projectBgm.audio);
  const provenancePath = path.resolve(baseDir, projectBgm.provenance);
  if (!fs.existsSync(audioPath) || digest(audioPath) !== projectBgm.sha256) throw new Error('ACE-Step event audio hash mismatch');
  const manifest = read(provenancePath);
  if (manifest.engineContract !== engine.engineId || manifest.event?.slug !== expectedSlug) throw new Error('ACE-Step BGM is not bound to this event slug');
  if (manifest.officialRepositoryCommit !== engine.officialRepositoryCommit || manifest.model?.dit !== engine.models.dit || manifest.model?.lm !== engine.models.lm) throw new Error('ACE-Step event engine provenance mismatch');
  if (manifest.generation?.prompt !== projectBgm.prompt || manifest.generation?.seed !== projectBgm.seed || manifest.rights?.eventSpecific !== true || manifest.rights?.thirdPartySamples !== false) throw new Error('ACE-Step event prompt, seed or rights provenance mismatch');
  if (manifest.sha256 !== projectBgm.sha256 || manifest.postProcess?.sampleRate !== 48000 || manifest.postProcess?.channels !== 2 || manifest.postProcess?.format !== 'WAV PCM 24-bit' || Math.abs(Number(manifest.postProcess?.measuredLufs) + 24) > 0.2) throw new Error('ACE-Step event output contract mismatch');
  if (projectBgm.volumeDb !== -16 || projectBgm.duckUnderNarration !== true || projectBgm.fadeSeconds !== 1.2) throw new Error('ACE-Step mix override must be explicit; this project uses canonical defaults');
  return { engine, manifest, audioPath, provenancePath };
}
