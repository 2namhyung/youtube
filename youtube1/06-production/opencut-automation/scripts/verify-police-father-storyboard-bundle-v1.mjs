import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const projectId = 'research-6b1a8af9b4143acb';
const root = path.join(repo, 'out', 'storyboards', projectId, 'storyline-v1', 'cut-boards-v2');
const manifestPath = path.join(root, 'storyboard-bundle-manifest-v1.json');
const verificationPath = path.join(root, 'storyboard-bundle-verification-v1.json');
const creatorPath = path.join(here, 'create-police-father-storyboard-bundle-v1.mjs');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = message => { throw new Error(message); };

if (!fs.existsSync(manifestPath)) fail('manifest missing');
if (fs.existsSync(verificationPath)) fail('append-only verification already exists');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (m.schema !== 'newsroom-storyboard-bundle-v1' || m.projectId !== projectId) fail('identity drift');
if (m.status !== 'private-preproduction-primary-agent-qa-pass-human-approval-pending') fail('unexpected approval state');
if (m.cutCount !== 17 || m.cuts?.length !== 17) fail('cut count drift');
if (m.creator?.scriptSha256 !== sha256(creatorPath)) fail('creator drift');
if (Object.values(m.gates ?? {}).some(Boolean)) fail('unsafe gate');
const hashes = new Set();
for (let i = 0; i < m.cuts.length; i += 1) {
  const c = m.cuts[i];
  const expected = `cut-${String(i + 1).padStart(3, '0')}`;
  if (c.cutId !== expected || c.relativePath !== `${expected}.png`) fail(`sequence drift: ${expected}`);
  if (c.storyboardAssetId !== `storyboard-${expected}-rough-v2`) fail(`asset id drift: ${expected}`);
  const file = path.join(root, c.relativePath);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`not physical: ${expected}`);
  if (fs.realpathSync(file) !== path.join(fs.realpathSync(root), c.relativePath)) fail(`containment drift: ${expected}`);
  if (stat.size !== c.bytes || sha256(file) !== c.sha256) fail(`byte drift: ${expected}`);
  if (c.width !== 1254 || c.height !== 1254) fail(`dimension drift: ${expected}`);
  if (hashes.has(c.sha256)) fail(`duplicate: ${expected}`);
  hashes.add(c.sha256);
  if (c.providerReferenceOrder?.[0] !== c.storyboardAssetId) fail(`storyboard not first: ${expected}`);
  if (JSON.stringify(c.providerReferenceOrder.slice(1)) !== JSON.stringify(c.characterMasterIds)) fail(`character order drift: ${expected}`);
  if (c.characterMasterIds.length > 3 || c.providerReferenceOrder.length < 1 || c.providerReferenceOrder.length > 4) fail(`reference count: ${expected}`);
}
const sheet = path.join(root, m.contactSheet.relativePath);
if (fs.statSync(sheet).size !== m.contactSheet.bytes || sha256(sheet) !== m.contactSheet.sha256) fail('contact sheet drift');
const plan = path.join(repo, 'production', 'newsroom', 'projects', `${projectId}.storyboard-guided-video-design-v1.md`);
if (fs.statSync(plan).size !== m.designPlan.bytes || sha256(plan) !== m.designPlan.sha256) fail('plan drift');

const report = {
  schema: 'newsroom-storyboard-bundle-verification-v1',
  projectId,
  verified: true,
  cutCount: 17,
  uniqueStoryboardHashes: hashes.size,
  humanApprovalPending: true,
  providerBlocked: true,
  manifestSha256: sha256(manifestPath),
  verifier: { scriptSha256: sha256(fileURLToPath(import.meta.url)) },
};
fs.writeFileSync(verificationPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ verificationPath, verificationSha256: sha256(verificationPath), ...report }));
