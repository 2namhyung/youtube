import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const candidateRoot = path.join(root, 'video/qa/production-assets/episode-001/SH006-real-photo-v01');
const manifestPath = path.join(candidateRoot, 'manifest.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function readManifest() { return JSON.parse(await fs.readFile(manifestPath, 'utf8')); }

test('SH006 real-photo candidate is pending and non-generative', async () => {
  const manifest = await readManifest();
  assert.equal(manifest.status, 'pending-user-asset-review');
  assert.equal(manifest.production_authority, false);
  assert.equal(manifest.production_visible, false);
  assert.equal(manifest.generative_ai_used, false);
  assert.equal(manifest.user_cut_pass, false);
  assert.equal(manifest.rights_approved, false);
  assert.equal(manifest.omni_video_approved, false);
  assert.equal(manifest.assets.length, 4);
  assert.equal(manifest.source_exclusions.length, 2);
  assert.match(manifest.source_exclusions[0].reason, /AI GENERATIVE/);
  assert.match(manifest.source_exclusions[1].reason, /AI GENERATIVE/);
});

test('all real sources and derived PNG hashes are bound and decodable', async () => {
  const manifest = await readManifest();
  for (const asset of manifest.assets) {
    const source = await fs.readFile(path.join(root, asset.sourcePath));
    const output = await fs.readFile(path.join(root, asset.path));
    assert.equal(sha256(source), asset.sourceSha256, asset.id);
    assert.equal(sha256(output), asset.sha256, asset.id);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'png', asset.id);
    assert.equal(metadata.width, asset.dimensions.width, asset.id);
    assert.equal(metadata.height, asset.dimensions.height, asset.id);
    assert.ok(metadata.width >= 600 && metadata.height >= 500, asset.id);
  }
});

test('person candidate has actual alpha while photo cards remain honest opaque images', async () => {
  const manifest = await readManifest();
  const person = manifest.assets.find((asset) => asset.id === 'person-real-cutout');
  assert.ok(person);
  assert.ok(person.alpha.zero_pixels > 0);
  assert.ok(person.alpha.opaque_pixels > 0);
  assert.ok(person.alpha.partial_pixels > 0);
  assert.match(person.transformation, /deterministic/);
  assert.match(person.transformation, /protected binder polygon/);
  for (const asset of manifest.assets.filter((item) => item.assetKind === 'real-photo-card')) {
    assert.equal(asset.alpha.zero_pixels, 0, asset.id);
    assert.equal(asset.alpha.opaque_pixels, asset.dimensions.width * asset.dimensions.height, asset.id);
  }
});

test('contact sheets are exact required review dimensions and candidate has no imagegen files', async () => {
  const manifest = await readManifest();
  for (const output of [manifest.outputs.contact, manifest.outputs.mobile]) {
    const bytes = await fs.readFile(path.join(root, output.path));
    assert.equal(sha256(bytes), output.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.deepEqual({ width: metadata.width, height: metadata.height }, output.dimensions);
  }
  const files = await fs.readdir(candidateRoot, { recursive: true });
  assert.equal(files.some((file) => /imagegen|generated|omni.*\.mp4$/iu.test(file)), false);
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  assert.doesNotMatch(manifestText, /imagegen|generation_source_id|ai-self-generated/iu);
});

test('historical deterministic builder is not exposed as a current package command', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['video:qa:build-sh006-real-photo-assets'], undefined);
});
