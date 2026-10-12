import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const candidateRoot = path.join(root, 'video/qa/production-assets/episode-001/SH006-editorial-v01');
const manifestPath = path.join(candidateRoot, 'asset-decomposition.json');
const approvalPath = path.join(root, 'video/qa/style-frames/episode-001/SH006-editorial-v03/style-frame-approval.json');

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('SH006 v03-derived assets remain decodable but are superseded production history', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
  assert.equal(manifest.status, 'superseded-asset-decomposition-history');
  assert.equal(manifest.review_scope, 'independent-production-assets-only');
  assert.equal(manifest.derived_from_style_approval.sha256, await sha256(approvalPath));
  assert.equal(manifest.derived_from_style_approval.approved_inputs_sha256, approval.approved_inputs_sha256);
  assert.equal(manifest.production_authority, false);
  assert.equal(manifest.superseded_by_style_candidate, 'SH006-editorial-v04');
  assert.equal(manifest.rebuild_blocked_until_current_style_pass, true);
  assert.equal(approval.approved_scope.independent_production_asset_decomposition, true);
  assert.equal(manifest.typography_surface_contract_version, 1);
  assert.equal(manifest.exact_legal_text_rendering, 'source-locked-remotion-text-only');
  assert.equal(manifest.independent_motion_assets, true);
  assert.equal(manifest.effects_required, false);
  assert.deepEqual(manifest.effects, []);
  assert.equal(manifest.user_cut_pass, false);
  assert.equal(manifest.rights_approved, false);
  assert.equal(manifest.omni_video_approved, false);
  assert.equal(manifest.production_visible, false);
  assert.equal(manifest.stage_advanced, false);
  assert.equal(manifest.asset_count, 13);
  assert.equal(new Set(manifest.assets.map(({id}) => id)).size, manifest.asset_count);
  assert.equal(manifest.assets.every(({independent_render_target}) => independent_render_target), true);
  assert.equal(manifest.assets.every(({text_baked_in}) => !text_baked_in), true);
  assert.equal(manifest.assets.some(({id}) => id === 'deletion-stroke'), true);
  assert.equal(manifest.assets.some(({id}) => id === 'request-route'), true);

  const assetRows = [];
  for (const asset of manifest.assets) {
    const absolute = path.join(root, asset.path);
    assert.equal(await sha256(absolute), asset.sha256);
    const metadata = await sharp(absolute).metadata();
    assert.deepEqual([metadata.width, metadata.height], [asset.dimensions.width, asset.dimensions.height]);
    if (asset.alpha_required && asset.path.endsWith('.png')) {
      assert.ok(asset.alpha.zero_pixels > 0, `${asset.id} must have genuine transparent pixels`);
      assert.ok(asset.alpha.partial_pixels + asset.alpha.opaque_pixels > 0, `${asset.id} must contain a visible object`);
    }
    assetRows.push(`${asset.id}|${asset.path}|${asset.sha256}`);
  }
  const bundle = createHash('sha256').update(assetRows.sort().join('\n')).digest('hex');
  assert.equal(bundle, manifest.asset_bundle_sha256);

  const contactPath = path.join(root, manifest.outputs.contact.path);
  const mobilePath = path.join(root, manifest.outputs.mobile.path);
  assert.equal(await sha256(contactPath), manifest.outputs.contact.sha256);
  assert.equal(await sha256(mobilePath), manifest.outputs.mobile.sha256);
  const contactMeta = await sharp(contactPath).metadata();
  const mobileMeta = await sharp(mobilePath).metadata();
  assert.deepEqual([contactMeta.width, contactMeta.height], [1920, 1080]);
  assert.deepEqual([mobileMeta.width, mobileMeta.height], [360, 203]);

  const assetEntries = await readdir(path.join(candidateRoot, 'assets'));
  assert.equal(assetEntries.length, manifest.asset_count);
  await assert.rejects(readdir(path.join(candidateRoot, 'effects')));
});
