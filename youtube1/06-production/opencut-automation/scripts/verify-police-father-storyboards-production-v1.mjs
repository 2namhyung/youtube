import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectId = 'research-6b1a8af9b4143acb';
const outputRoot = path.join(root, 'out', 'prototypes', `${projectId}-v35-storyboards-production-v1`);
const approvalPath = path.join(outputRoot, 'storyboard-production-approval-v1.json');
const manifestPath = path.join(outputRoot, 'storyboard-production-manifest-v1.json');
const reportPath = path.join(outputRoot, 'storyboard-production-verification-v1.json');
const creatorPath = path.join(here, 'approve-police-father-storyboards-production-v1.mjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const stable = (value) => JSON.stringify(value, null, 2) + '\n';
const hashWithout = (value, key) => sha(Buffer.from(stable(Object.fromEntries(Object.entries(value).filter(([k]) => k !== key))), 'utf8'));
const contained = (file, label) => {
  const baseReal = fs.realpathSync(outputRoot);
  const real = fs.realpathSync(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (real !== baseReal && !real.startsWith(`${baseReal}${path.sep}`))) throw new Error(`${label} is not a physical contained file`);
  return real;
};
if (fs.existsSync(reportPath)) throw new Error(`append-only verification already exists: ${reportPath}`);
const approvalBytes = fs.readFileSync(contained(approvalPath, 'approval'));
const manifestBytes = fs.readFileSync(contained(manifestPath, 'manifest'));
const approval = JSON.parse(approvalBytes);
const manifest = JSON.parse(manifestBytes);
if (approval.schema !== 'newsroom-storyboard-production-approval-v1' || approval.humanApproval?.approved !== true || approval.cutCount !== 17 || approval.gates?.provider !== true || approval.gates?.upload !== false || approval.gates?.publication !== false || approval.gates?.stage07 !== false) throw new Error('approval authority is invalid');
if (approval.artifactSha256 !== hashWithout(approval, 'artifactSha256')) throw new Error('approval artifact hash drifted');
if (manifest.schema !== 'newsroom-storyboard-production-manifest-v1' || manifest.projectId !== projectId || manifest.production?.approved !== true || manifest.production?.privateOnly !== true || manifest.production?.public !== false || manifest.approval?.artifactSha256 !== approval.artifactSha256 || manifest.boards?.length !== 17) throw new Error('manifest authority is invalid');
if (manifest.artifactSha256 !== hashWithout(manifest, 'artifactSha256')) throw new Error('manifest artifact hash drifted');
if (manifest.creator?.scriptSha256 !== sha(fs.readFileSync(creatorPath))) throw new Error('creator implementation drifted');
const ids = new Set(); const hashes = new Set();
for (const board of manifest.boards) {
  if (ids.has(board.storyboardAssetId) || hashes.has(board.sha256) || board.role !== 'storyboard' || board.ordinal !== ids.size + 1) throw new Error(`board uniqueness/order drifted: ${board.cutId}`);
  ids.add(board.storyboardAssetId); hashes.add(board.sha256);
  const bytes = fs.readFileSync(contained(path.join(outputRoot, board.relativePath), board.cutId));
  if (bytes.length !== board.bytes || sha(bytes) !== board.sha256 || board.width !== 1254 || board.height !== 1254 || board.providerReferenceOrder?.[0] !== board.storyboardAssetId || board.providerReferenceOrder.length !== 1 + board.characterMasterIds.length || board.providerReferenceOrder.length < 1 || board.providerReferenceOrder.length > 4) throw new Error(`board integrity/reference drifted: ${board.cutId}`);
}
const report = {
  schema: 'newsroom-storyboard-production-verification-v1',
  projectId,
  verified: true,
  productionApproved: true,
  privateOnly: true,
  cutCount: manifest.boards.length,
  uniqueStoryboardHashes: hashes.size,
  approvalSha256: approval.artifactSha256,
  manifestSha256: manifest.artifactSha256,
  verifierSourceSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  gates: manifest.gates,
};
fs.writeFileSync(reportPath, stable(report), { flag: 'wx' });
console.log(JSON.stringify({ ...report, reportSha256: sha(fs.readFileSync(reportPath)), outputRoot }, null, 2));
