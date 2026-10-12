import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sourceRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-v1');
const masterRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-paper-master-candidates');
const targetRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1');
const sourceManifestPath = join(sourceRoot, 'asset-manifest-v1.json');
const sourceVerifierPath = join(sourceRoot, 'verifier-v1.json');
const reviewBoardPath = join(masterRoot, 'human-review-board-v1', 'v32-master-review-board.png');
const contactSheetPath = join(sourceRoot, 'contact-sheet-51-alpha.png');
const targetManifestPath = join(targetRoot, 'production-admission-v1.json');

const expected = Object.freeze({
  sourceManifestSha256: '7007423afe93767118e5f122d5a77fb767b3675c6378689997bff720efe4927c',
  sourceVerifierSha256: '132789ce683c2c61bdde33e6623fa17d6bfe5c158e6bf734378c1458975aa6f0',
  reviewBoardSha256: 'e1352092b15f71ce6f358a6e241b4e92f00dbb5895da2ae526efe44f6bb7baf1',
  contactSheetSha256: 'f5ea9e9ea7dc4eb5ec1a0a90eb4ebc2eee047a63eea5489af414a56fdd3a30bc',
});

const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => sha256(readFileSync(path));
const physicalFile = path => {
  if (!existsSync(path)) throw new Error(`missing file: ${path}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not a physical file: ${path}`);
  return stat;
};
const assertContained = (parent, child) => {
  const parentReal = realpathSync(parent);
  const childReal = realpathSync(child);
  const offset = relative(parentReal, childReal);
  if (offset === '' || offset === '..' || offset.startsWith(`..${sep}`) || resolve(parentReal, offset) !== childReal) {
    throw new Error(`path escapes authority root: ${child}`);
  }
};
const requireHash = (path, digest, label) => {
  physicalFile(path);
  const actual = fileHash(path);
  if (actual !== digest) throw new Error(`${label} hash drift: ${actual}`);
};
const copyImmutable = (sourcePath, relativeTarget, expectedSha256) => {
  physicalFile(sourcePath);
  const sourceSha256 = fileHash(sourcePath);
  if (sourceSha256 !== expectedSha256) throw new Error(`source hash drift: ${sourcePath}`);
  const targetPath = join(targetRoot, relativeTarget);
  mkdirSync(dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) {
    physicalFile(targetPath);
    if (fileHash(targetPath) !== expectedSha256) throw new Error(`append-only target conflict: ${targetPath}`);
  } else {
    copyFileSync(sourcePath, targetPath);
  }
  chmodSync(targetPath, 0o444);
  physicalFile(targetPath);
  assertContained(targetRoot, targetPath);
  if (fileHash(targetPath) !== expectedSha256) throw new Error(`copy verification failed: ${targetPath}`);
  return {
    file: relativeTarget.replaceAll('\\', '/'),
    bytes: statSync(targetPath).size,
    sha256: expectedSha256,
  };
};

for (const [path, digest, label] of [
  [sourceManifestPath, expected.sourceManifestSha256, 'source manifest'],
  [sourceVerifierPath, expected.sourceVerifierSha256, 'source verifier'],
  [reviewBoardPath, expected.reviewBoardSha256, 'human review board'],
  [contactSheetPath, expected.contactSheetSha256, 'human contact sheet'],
]) requireHash(path, digest, label);

const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
const sourceVerifier = JSON.parse(readFileSync(sourceVerifierPath, 'utf8'));
if (sourceManifest.schema !== 'grok-multi-reference-scene-assets-v1' || sourceManifest.production?.approved !== false) {
  throw new Error('unexpected source manifest authority state');
}
if (sourceVerifier.schema !== 'grok-multi-reference-scene-assets-verifier-v1' || sourceVerifier.verified !== true || sourceVerifier.productionApproved !== false) {
  throw new Error('source verifier did not prove the pending-approval bundle');
}
if (sourceVerifier.manifestSha256 !== expected.sourceManifestSha256 || sourceVerifier.commonMasterCount !== 13 || sourceVerifier.assetCount !== 51) {
  throw new Error('source verifier counts or manifest binding mismatch');
}
if (sourceManifest.commonMasterQa?.reviewBoardSha256 !== expected.reviewBoardSha256 || sourceManifest.contactSheet?.sha256 !== expected.contactSheetSha256) {
  throw new Error('source manifest review artifact binding mismatch');
}

mkdirSync(targetRoot, { recursive: true });
const commonMasters = sourceManifest.commonMasterQa.assets.map(entry => {
  const sourcePath = join(masterRoot, entry.grokSquare.file);
  const copy = copyImmutable(sourcePath, join('common-masters', basename(entry.grokSquare.file)), entry.grokSquare.sha256);
  return {
    assetId: basename(entry.file, '.png'),
    role: entry.file.startsWith('character-') ? 'character' : entry.file.startsWith('environment-') ? 'environment' : 'prop',
    sourceFile: entry.grokSquare.file,
    sourceSha256: entry.grokSquare.sha256,
    ...copy,
  };
});
const cutAssets = sourceManifest.assets.map(entry => {
  const sourcePath = join(sourceRoot, entry.alpha.file);
  const copy = copyImmutable(sourcePath, join('cut-assets', `${entry.assetId}.png`), entry.alpha.sha256);
  return {
    assetId: entry.assetId,
    role: entry.role,
    sourceFile: entry.alpha.file,
    sourceSha256: entry.alpha.sha256,
    ...copy,
  };
});
if (commonMasters.length !== 13 || new Set(commonMasters.map(entry => entry.assetId)).size !== 13) throw new Error('expected 13 unique common masters');
if (cutAssets.length !== 51 || new Set(cutAssets.map(entry => entry.assetId)).size !== 51) throw new Error('expected 51 unique cut assets');

const bundleDigest = sha256([...commonMasters, ...cutAssets]
  .map(entry => `${entry.file}|${entry.bytes}|${entry.sha256}`)
  .sort()
  .join('\n'));
const manifest = {
  schema: 'grok-multi-reference-production-admission-v1',
  status: 'production-approved-private-only',
  projectId: 'research-6b1a8af9b4143acb',
  production: { approved: true, public: false, privateOnly: true },
  humanApproval: {
    approved: true,
    approvalDate: '2026-08-14',
    approvalEvidence: 'explicit-user-continuation-after-exact-two-sheet-review',
    reviewBoardSha256: expected.reviewBoardSha256,
    contactSheetSha256: expected.contactSheetSha256,
    scope: 'exact 13 common Grok-square masters and exact 51 cut-specific PNGs only',
    excludes: ['provider output', 'render', 'upload', 'publication', 'Stage 07'],
  },
  sourceAuthority: {
    manifestFile: 'asset-manifest-v1.json',
    manifestSha256: expected.sourceManifestSha256,
    verifierFile: 'verifier-v1.json',
    verifierSha256: expected.sourceVerifierSha256,
    promptPackSha256: sourceManifest.promptPackSha256,
  },
  immutableCopy: { commonMasterCount: commonMasters.length, cutAssetCount: cutAssets.length, bundleDigest },
  commonMasters,
  cutAssets,
};
const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (existsSync(targetManifestPath)) {
  physicalFile(targetManifestPath);
  if (!readFileSync(targetManifestPath, 'utf8').includes('"schema": "grok-multi-reference-production-admission-v1"')) {
    throw new Error(`append-only target conflict: ${targetManifestPath}`);
  }
  chmodSync(targetManifestPath, 0o666);
  if (readFileSync(targetManifestPath, 'utf8') !== encoded) throw new Error(`append-only manifest drift: ${targetManifestPath}`);
} else {
  writeFileSync(targetManifestPath, encoded, { flag: 'wx' });
}
chmodSync(targetManifestPath, 0o444);

console.log(JSON.stringify({
  admitted: true,
  productionApproved: true,
  public: false,
  privateOnly: true,
  commonMasterCount: commonMasters.length,
  cutAssetCount: cutAssets.length,
  bundleDigest,
  manifestSha256: fileHash(targetManifestPath),
  targetRoot,
}, null, 2));
