import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { admitDefaultCommonMasterManifest, createCommonMasterManifest, verifyCommonMasterManifest, DEFAULT_COMMON_MASTER_MANIFEST_ID } from './newsroom-common-master-assets.mjs';

const root = path.resolve('out/prototypes', DEFAULT_COMMON_MASTER_MANIFEST_ID);
const assets = [
  ['master-character-investigator-v1', 'character', 'alpha/character-investigator-v1.png'],
  ['master-character-police-father-v1', 'character', 'alpha/character-police-father-v1.png'],
  ['master-character-son-v1', 'character', 'alpha/character-son-v1.png'],
  ['master-character-teacher-v1', 'character', 'alpha/character-teacher-v1.png'],
  ['master-environment-classroom-v1', 'environment', 'opaque/environment-classroom-v1.png'],
  ['master-environment-home-v1', 'environment', 'opaque/environment-home-v1.png'],
  ['master-environment-records-office-v1', 'environment', 'opaque/environment-records-office-v1.png'],
  ['master-prop-phone-state-pair-v1', 'prop', 'alpha/object-phone-state-pair-v1.png'],
  ['master-prop-evidence-pack-v1', 'prop', 'alpha/object-evidence-pack-v1.png'],
].map(([masterAssetId, role, relativePath]) => ({ masterAssetId, role, relativePath, prompt: `flat ${role} paper master`, spec: `${role} alpha cutout` }));

const manifest = await createCommonMasterManifest({ root, manifestId: DEFAULT_COMMON_MASTER_MANIFEST_ID, assets });
assert.equal(manifest.assets.length, 9);
assert.equal(manifest.humanReview, 'accepted-for-private-prototype');
assert.deepEqual(await verifyCommonMasterManifest(manifest, { root }), manifest.assets.map(({ sourceSha256, relativePath, ...asset }) => ({ ...asset, approval: { ...asset.approval, sha256: sourceSha256 } })));
assert.equal((await admitDefaultCommonMasterManifest({ root: path.resolve('.') })).length, 9);

const approved = structuredClone(manifest);
approved.humanReview = 'human-approved-production';
approved.production = { approved: true, public: false };
approved.productionApproval = { schema: 'newsroom-common-master-production-approval-v1', artifactSha256: 'a'.repeat(64) };
await assert.rejects(() => verifyCommonMasterManifest(approved, { root }), /production\/public admission is invalid/u);
assert.equal((await verifyCommonMasterManifest(approved, { root, allowProductionApproved: true })).length, 9);

const badRole = structuredClone(manifest); badRole.assets[0].role = 'logo';
await assert.rejects(() => verifyCommonMasterManifest(badRole, { root }), /admission is invalid/u);
const badHash = structuredClone(manifest); badHash.assets[0].approval.sha256 = '0'.repeat(64);
await assert.rejects(() => verifyCommonMasterManifest(badHash, { root }), /admission is invalid/u);
const badAuthority = structuredClone(manifest); badAuthority.visualAuthoritySha256 = '0'.repeat(64);
await assert.rejects(() => verifyCommonMasterManifest(badAuthority, { root }), /authority hash drifted/u);

const symlink = path.join(root, 'alpha', 'master-symlink-test.png');
try {
  await fs.symlink(path.join(root, 'alpha', 'character-investigator-v1.png'), symlink);
  const badLink = structuredClone(manifest); badLink.assets[0].relativePath = 'alpha/master-symlink-test.png';
  await assert.rejects(() => verifyCommonMasterManifest(badLink, { root }), /physical nonsymlink/u);
} catch (error) {
  if (!['EPERM', 'EEXIST'].includes(error?.code)) throw error;
} finally { await fs.rm(symlink, { force: true }); }

console.log('newsroom-common-master-assets-tests passed');
