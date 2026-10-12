import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sourceRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-v1');
const masterRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-paper-master-candidates');
const targetRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1');
const manifestPath = join(targetRoot, 'production-admission-v1.json');
const reportPath = join(targetRoot, 'verifier-v1.json');
const sourceManifestPath = join(sourceRoot, 'asset-manifest-v1.json');
const sourceVerifierPath = join(sourceRoot, 'verifier-v1.json');
const reviewBoardPath = join(masterRoot, 'human-review-board-v1', 'v32-master-review-board.png');
const contactSheetPath = join(sourceRoot, 'contact-sheet-51-alpha.png');
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
const assertContained = path => {
  const offset = relative(realpathSync(targetRoot), realpathSync(path));
  if (offset === '' || offset === '..' || offset.startsWith(`..${sep}`) || resolve(realpathSync(targetRoot), offset) !== realpathSync(path)) {
    throw new Error(`copy escapes admitted root: ${path}`);
  }
};
const requireExact = (path, digest, label) => {
  physicalFile(path);
  if (fileHash(path) !== digest) throw new Error(`${label} hash drift`);
};

requireExact(sourceManifestPath, expected.sourceManifestSha256, 'source manifest');
requireExact(sourceVerifierPath, expected.sourceVerifierSha256, 'source verifier');
requireExact(reviewBoardPath, expected.reviewBoardSha256, 'review board');
requireExact(contactSheetPath, expected.contactSheetSha256, 'contact sheet');
physicalFile(manifestPath);
assertContained(manifestPath);

const source = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
const sourceVerifier = JSON.parse(readFileSync(sourceVerifierPath, 'utf8'));
const admitted = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (sourceVerifier.verified !== true || sourceVerifier.manifestSha256 !== expected.sourceManifestSha256 || sourceVerifier.productionApproved !== false) throw new Error('source verifier authority mismatch');
if (admitted.schema !== 'grok-multi-reference-production-admission-v1' || admitted.status !== 'production-approved-private-only') throw new Error('admission schema/status mismatch');
if (JSON.stringify(admitted.production) !== JSON.stringify({approved: true, public: false, privateOnly: true})) throw new Error('unsafe production flags');
if (admitted.humanApproval?.approved !== true || admitted.humanApproval.reviewBoardSha256 !== expected.reviewBoardSha256 || admitted.humanApproval.contactSheetSha256 !== expected.contactSheetSha256) throw new Error('human approval binding mismatch');
if (admitted.sourceAuthority?.manifestSha256 !== expected.sourceManifestSha256 || admitted.sourceAuthority?.verifierSha256 !== expected.sourceVerifierSha256 || admitted.sourceAuthority?.promptPackSha256 !== source.promptPackSha256) throw new Error('source authority binding mismatch');
if (admitted.commonMasters?.length !== 13 || admitted.cutAssets?.length !== 51) throw new Error('admitted asset count mismatch');

const expectedMasters = new Map(source.commonMasterQa.assets.map(entry => [entry.file.replace(/\.png$/u, ''), entry.grokSquare]));
const expectedCuts = new Map(source.assets.map(entry => [entry.assetId, entry.alpha]));
const seenIds = new Set();
const copies = [];
for (const entry of [...admitted.commonMasters, ...admitted.cutAssets]) {
  if (seenIds.has(entry.assetId)) throw new Error(`duplicate admitted asset ID: ${entry.assetId}`);
  seenIds.add(entry.assetId);
  const authority = expectedMasters.get(entry.assetId) ?? expectedCuts.get(entry.assetId);
  if (!authority) throw new Error(`unknown admitted asset ID: ${entry.assetId}`);
  if (entry.sourceSha256 !== authority.sha256 || entry.sha256 !== authority.sha256) throw new Error(`authority hash mismatch: ${entry.assetId}`);
  const path = join(targetRoot, entry.file);
  const stat = physicalFile(path);
  assertContained(path);
  if (stat.size !== entry.bytes || fileHash(path) !== authority.sha256) throw new Error(`admitted copy drift: ${entry.assetId}`);
  if ((stat.mode & 0o222) !== 0) throw new Error(`admitted copy is writable: ${entry.assetId}`);
  copies.push({file: entry.file, bytes: stat.size, sha256: authority.sha256});
}
if (seenIds.size !== 64 || [...expectedMasters.keys()].some(id => !seenIds.has(id)) || [...expectedCuts.keys()].some(id => !seenIds.has(id))) throw new Error('incomplete admitted authority set');
const actualFiles = readdirSync(targetRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => relative(targetRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .sort();
const allowedFiles = new Set(['production-admission-v1.json', 'verifier-v1.json', ...copies.map(entry => entry.file)]);
for (const file of actualFiles) if (!allowedFiles.has(file)) throw new Error(`unexpected file in admitted root: ${file}`);

const bundleDigest = sha256(copies.map(entry => `${entry.file}|${entry.bytes}|${entry.sha256}`).sort().join('\n'));
if (admitted.immutableCopy?.commonMasterCount !== 13 || admitted.immutableCopy?.cutAssetCount !== 51 || admitted.immutableCopy?.bundleDigest !== bundleDigest) throw new Error('immutable-copy digest mismatch');
const report = {
  schema: 'grok-multi-reference-production-admission-verifier-v1',
  verified: true,
  productionApproved: true,
  public: false,
  privateOnly: true,
  commonMasterCount: 13,
  cutAssetCount: 51,
  copiedAssetCount: 64,
  sourceManifestSha256: expected.sourceManifestSha256,
  sourceVerifierSha256: expected.sourceVerifierSha256,
  reviewBoardSha256: expected.reviewBoardSha256,
  contactSheetSha256: expected.contactSheetSha256,
  admissionManifestSha256: fileHash(manifestPath),
  bundleDigest,
  verifierSourceSha256: fileHash(fileURLToPath(import.meta.url)),
};
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (existsSync(reportPath)) {
  physicalFile(reportPath);
  chmodSync(reportPath, 0o666);
}
writeFileSync(reportPath, encoded);
chmodSync(reportPath, 0o444);
console.log(JSON.stringify(report, null, 2));
