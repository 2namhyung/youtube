import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileGeminiReferenceTaggedPrompt, recordGeminiReferenceTaggedPrompt, verifyGeminiReferenceTaggedPrompt } from './newsroom-gemini-reference-tags.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'newsroom-gemini-reference-tags-'));
await fs.mkdir(path.join(root, 'refs'));
const mother = Buffer.from('mother-reference');
const teen = Buffer.from('teen-reference');
await fs.writeFile(path.join(root, 'refs', 'mother.png'), mother);
await fs.writeFile(path.join(root, 'refs', 'teen.png'), teen);
const references = [
  { assetId: 'MOTHER-A', imageRelativePath: 'refs/mother.png', role: 'adult female driver' },
  { assetId: 'TEEN-A', imageRelativePath: 'refs/teen.png', role: 'middle-school daughter' },
];
const scenePrompt = 'Show the mother driving while the daughter recoils. Preserve both blank faces.';
const packet = await compileGeminiReferenceTaggedPrompt({ assetRoot: root, references, scenePrompt });

assert.equal(packet.schema, 'newsroom-gemini-reference-tag-packet-v1');
assert.equal(packet.prompt.text.startsWith('[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2]'), true);
assert.equal(packet.prompt.text.includes('<IMAGE_REF_0> is asset MOTHER-A; role: adult female driver.'), true);
assert.equal(packet.prompt.text.includes('<IMAGE_REF_1> is asset TEEN-A; role: middle-school daughter.'), true);
assert.equal(packet.prompt.bytes, Buffer.byteLength(packet.prompt.text, 'utf8'));
assert.equal(packet.prompt.sha256, crypto.createHash('sha256').update(Buffer.from(packet.prompt.text, 'utf8')).digest('hex'));
assert.equal(packet.references[0].sha256, crypto.createHash('sha256').update(mother).digest('hex'));
assert.equal(packet.references[1].sha256, crypto.createHash('sha256').update(teen).digest('hex'));
assert.equal(packet.provider.automaticSemanticPass, false);
assert.equal(packet.production.provider, false);
assert.equal(await verifyGeminiReferenceTaggedPrompt({ packet, assetRoot: root, references, scenePrompt }), true);

const submittedPrompt = `[#  References\n<IMAGE_REF_0> @ Image1   <IMAGE_REF_1>@Image2]\n\nScene prompt with <IMAGE_REF_0> and <IMAGE_REF_1>.`;
const recorded = await recordGeminiReferenceTaggedPrompt({ assetRoot: root, references, submittedPrompt });
assert.equal(recorded.status, 'recorded-experimental-reference-tags');
assert.equal(recorded.prompt.text, submittedPrompt);
assert.equal(recorded.prompt.bytes, Buffer.byteLength(submittedPrompt, 'utf8'));
assert.equal(recorded.prompt.sha256, crypto.createHash('sha256').update(Buffer.from(submittedPrompt, 'utf8')).digest('hex'));
assert.equal(await verifyGeminiReferenceTaggedPrompt({ packet: recorded, assetRoot: root, references, submittedPrompt }), true);

async function rejects(input, message) {
  await assert.rejects(() => compileGeminiReferenceTaggedPrompt({ assetRoot: root, ...input }), /CODEX_ADMIN_BLOCKED|invalid|duplicate|unknown|malformed|unterminated|OmniGen|safe contained|physical/i, message);
}

await rejects({ references: [{ ...references[0], assetId: 'MOTHER-A' }, { ...references[1], assetId: 'MOTHER-A' }], scenePrompt });
await rejects({ references: [{ ...references[0], imageRelativePath: 'refs/mother.png' }, { ...references[1], imageRelativePath: 'refs/mother.png' }], scenePrompt });
await rejects({ references: [{ ...references[0], imageRelativePath: 'refs/missing.png' }], scenePrompt });
await rejects({ references: [{ ...references[0], imageRelativePath: '../outside.png' }], scenePrompt });
await rejects({ references, scenePrompt: 'Use <IMAGE_REF_2> as the police officer.' });
await rejects({ references, scenePrompt: 'Use <IMAGE_REF_X> as the police officer.' });
await rejects({ references, scenePrompt: 'Use <IMAGE_REF_0 as the mother.' });
await rejects({ references, scenePrompt: 'Use <|image_1|> as the reference.' });
await rejects({ references: [{ ...references[0], role: '<IMAGE_REF_99> role' }], scenePrompt });

await fs.writeFile(path.join(root, 'refs', 'mother.png'), Buffer.from('changed-reference'));
await assert.rejects(() => verifyGeminiReferenceTaggedPrompt({ packet, assetRoot: root, references, scenePrompt }), /drifted|stale/i);
console.log('newsroom-gemini-reference-tags tests passed');
