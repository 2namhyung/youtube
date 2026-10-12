import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySmokeAuthority } from './deterministic-motion-engine-adapters.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'out', 'private-tests', 'nonhuman-motion-engine-smoke-v1');
const rehash = (creator) => { delete creator.creatorSha256; creator.creatorSha256 = createHash('sha256').update(JSON.stringify(creator)).digest('hex'); };
const rejectMutation = (mutate, pattern) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-authority-negative-'));
  try {
    fs.cpSync(source, target, { recursive: true });
    const file = path.join(target, 'creator.json');
    const creator = JSON.parse(fs.readFileSync(file, 'utf8'));
    mutate(creator); rehash(creator); fs.writeFileSync(file, `${JSON.stringify(creator, null, 2)}\n`);
    assert.throws(() => verifySmokeAuthority(target), pattern);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
};

const verified = verifySmokeAuthority(source);
assert.equal(verified.verified, true);
assert.equal(verified.engineCount, 7);
rejectMutation((creator) => { creator.engines[1].dependencies[0].relativePath = 'missing/package.json'; }, /ENOENT|missing/u);
rejectMutation((creator) => { creator.engines[1].dependencies[0].relativePath = 'https://example.invalid/runtime.js'; }, /remote dependency forbidden/u);
rejectMutation((creator) => { creator.engines[1].dependencies[0].sha256 = '0'.repeat(64); }, /dependency drift/u);
rejectMutation((creator) => { creator.engines[0].smoke.probe.nb_read_frames = '47'; }, /frame contract drift/u);
console.log('deterministic motion engine adapter tests passed');
