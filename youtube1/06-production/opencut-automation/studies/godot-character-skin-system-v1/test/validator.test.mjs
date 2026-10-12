import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../validate-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'sample-manifest.json');
const load = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectFail = (mutate, message) => { const m = load(); mutate(m); assert.throws(() => validateManifest(m, manifestPath), new RegExp(message)); };

test('synthetic metadata-only skin pack passes strict validation', () => {
  const result = validateManifest(load(), manifestPath);
  assert.equal(result.ok, true); assert.equal(result.slots, 16); assert.ok(result.uniquePhysicalPaths > 1);
});

test('rejects missing semantic slot', () => expectFail((m) => { m.slots = m.slots.filter((s) => s.id !== 'hand_l'); }, 'missing required slot hand_l'));
test('rejects duplicate slot IDs and z order', () => expectFail((m) => { m.slots[1].id = m.slots[0].id; }, 'duplicate slot id'));
test('rejects duplicate z order independently', () => expectFail((m) => { m.slots[1].z = m.slots[0].z; }, 'duplicate slot z'));
test('rejects flat single-raster pack', () => expectFail((m) => { const first = m.slots[0].attachments[0]; for (const s of m.slots) for (const a of s.attachments) { a.path = first.path; a.bytes = first.bytes; a.sha256 = first.sha256; a.dimensions = first.dimensions; a.alphaBounds = first.alphaBounds; } }, 'flat single-raster'));
test('rejects absent hidden fill for articulating clothing', () => expectFail((m) => { m.slots.find((s) => s.id === 'torso').attachments = m.slots.find((s) => s.id === 'torso').attachments.filter((a) => a.role !== 'hidden-fill'); }, 'lacks hidden-fill'));
test('rejects articulating slot without explicit hidden-fill declaration', () => expectFail((m) => { m.slots.find((s) => s.id === 'torso').requiresHiddenFill = false; }, 'lacks hidden-fill'));
test('rejects incompatible geometry group', () => expectFail((m) => { m.slots.find((s) => s.id === 'hand_l').attachments[0].geometryGroup = 'core-v1'; }, 'incompatible geometry group'));
test('rejects path escape, hash and dimensions', () => {
  expectFail((m) => { m.slots[0].attachments[0].path = '../outside.png'; }, 'path escape');
  expectFail((m) => { m.slots[0].attachments[0].sha256 = '0'.repeat(64); }, 'SHA-256 mismatch');
  expectFail((m) => { m.slots[0].attachments[0].dimensions.width = 99; }, 'dimension mismatch');
});

test('rejects physical symlink when the platform permits symlinks', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-slot-')); const source = path.join(root, 'fixtures/skin-pack-a/head-visible.png'); const link = path.join(temp, 'link.png');
  try { fs.symlinkSync(source, link, 'file'); } catch { t.skip('symlink creation unavailable'); return; }
  const m = load(); m.slots[0].attachments[0].path = path.relative(root, link); assert.throws(() => validateManifest(m, manifestPath), /symlink|outside manifest root/);
});
