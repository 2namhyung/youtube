import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCanonicalBgmEngine, verifyCanonicalVoiceRelease } from './canonical-media-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(root, '..', '..');
const voice = verifyCanonicalVoiceRelease(path.join(workspace, '03-script-voice', 'releases', 'qwen-f4-owner-base-v1', 'manifest.json'));
const bgm = verifyCanonicalBgmEngine(path.join(workspace, '05-bgm-generation', 'engines', 'ace-step-1.5-official-local-v1', 'manifest.json'));
assert.equal(voice.bank.profileId, 'qwen-f4-owner-base-v1');
assert.deepEqual(Object.keys(voice.bank.styles), ['hook', 'news_exposition', 'tension', 'criticism', 'solution_closing', 'question']);
assert.equal(bgm.engine.models.lm, 'acestep-5Hz-lm-0.6B');
const original = fs.readFileSync(voice.bankPath);
assert.match(voice.bankSha256, /^[0-9a-f]{64}$/);
assert.ok(original.length > 0);
console.log(JSON.stringify({ status: 'pass', voiceProfile: voice.bank.profileId, voiceManifestSha256: voice.manifestSha256, promptBankSha256: voice.bankSha256, bgmEngine: bgm.engine.engineId, bgmEngineManifestSha256: bgm.manifestSha256 }, null, 2));
