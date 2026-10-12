import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const projectId = 'research-6b1a8af9b4143acb';
const sourceRoot = path.join(root, 'out', 'storyboards', projectId, 'storyline-v1', 'cut-boards-v2');
const outputRoot = path.join(root, 'out', 'prototypes', `${projectId}-v35-storyboards-production-v1`);
const boardsRoot = path.join(outputRoot, 'storyboards');
const approvalPath = path.join(outputRoot, 'storyboard-production-approval-v1.json');
const manifestPath = path.join(outputRoot, 'storyboard-production-manifest-v1.json');
const sourceManifestPath = path.join(sourceRoot, 'storyboard-bundle-manifest-v1.json');
const sourceVerificationPath = path.join(sourceRoot, 'storyboard-bundle-verification-v1.json');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const stable = (value) => JSON.stringify(value, null, 2) + '\n';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const realContained = (base, file, label) => {
  const baseReal = fs.realpathSync(base);
  const fileReal = fs.realpathSync(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (fileReal !== baseReal && !fileReal.startsWith(`${baseReal}${path.sep}`))) throw new Error(`${label} is not a physical contained file`);
  return fileReal;
};
const writeNew = (file, value) => {
  if (fs.existsSync(file)) throw new Error(`append-only output already exists: ${file}`);
  fs.writeFileSync(file, stable(value), { flag: 'wx' });
};

const sourceManifestBytes = fs.readFileSync(realContained(sourceRoot, sourceManifestPath, 'source manifest'));
const sourceVerificationBytes = fs.readFileSync(realContained(sourceRoot, sourceVerificationPath, 'source verification'));
const sourceManifest = JSON.parse(sourceManifestBytes);
const sourceVerification = JSON.parse(sourceVerificationBytes);
if (sourceManifest.schema !== 'newsroom-storyboard-bundle-v1' || sourceManifest.projectId !== projectId || sourceManifest.cutCount !== 17) throw new Error('source storyboard manifest is invalid');
if (sourceVerification.verified !== true || sourceVerification.manifestSha256 !== sha(sourceManifestBytes) || sourceVerification.cutCount !== 17 || sourceVerification.uniqueStoryboardHashes !== 17) throw new Error('source storyboard verification is invalid');

fs.mkdirSync(boardsRoot, { recursive: true });
const boards = sourceManifest.cuts.map((cut, index) => {
  const source = realContained(sourceRoot, path.join(sourceRoot, cut.relativePath), `source board ${cut.cutId}`);
  const bytes = fs.readFileSync(source);
  if (bytes.length !== cut.bytes || sha(bytes) !== cut.sha256) throw new Error(`source board drifted: ${cut.cutId}`);
  const name = `${cut.cutId}.png`;
  const target = path.join(boardsRoot, name);
  if (fs.existsSync(target)) throw new Error(`append-only board already exists: ${name}`);
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o444);
  const copied = fs.readFileSync(realContained(boardsRoot, target, `admitted board ${cut.cutId}`));
  if (copied.length !== bytes.length || sha(copied) !== sha(bytes)) throw new Error(`copy verification failed: ${cut.cutId}`);
  return {
    cutId: cut.cutId,
    storyboardAssetId: cut.storyboardAssetId,
    role: 'storyboard',
    relativePath: path.posix.join('storyboards', name),
    bytes: copied.length,
    sha256: sha(copied),
    width: cut.width,
    height: cut.height,
    characterMasterIds: cut.characterMasterIds,
    providerReferenceOrder: cut.providerReferenceOrder,
    ordinal: index + 1,
  };
});

const approval = {
  schema: 'newsroom-storyboard-production-approval-v1',
  approvalId: `${projectId}-storyboards-production-v1`,
  projectId,
  approvedAt: '2026-08-15T00:00:00+09:00',
  scope: 'exact ordered 17-board contact sheet and exact individual storyboard bytes; private Grok provider generation only',
  userApprovalEvidence: 'User reviewed the storyboard direction and then explicitly instructed: 다시 영상 제작해봐. 이번에는 스토리보드, 인물 png를 넣고, 프롬프트도 명확하게 입력해서 만들어봐',
  humanApproval: { approved: true, status: 'approved-private-production', public: false },
  source: {
    manifestSha256: sha(sourceManifestBytes),
    verificationSha256: sha(sourceVerificationBytes),
    contactSheetSha256: sourceManifest.contactSheet.sha256,
    designPlanSha256: sourceManifest.designPlan.sha256,
  },
  cutCount: boards.length,
  boardHashes: boards.map(({ cutId, storyboardAssetId, sha256, bytes }) => ({ cutId, storyboardAssetId, sha256, bytes })),
  gates: { provider: true, privateRender: true, upload: false, publication: false, stage07: false },
};
approval.artifactSha256 = sha(Buffer.from(stable(approval), 'utf8'));

const manifest = {
  schema: 'newsroom-storyboard-production-manifest-v1',
  projectId,
  status: 'production-approved-private-only',
  contractRevision: 'storyboard-first-character-masters-v1',
  production: { approved: true, privateOnly: true, public: false },
  approval: { relativePath: path.basename(approvalPath), artifactSha256: approval.artifactSha256 },
  source: approval.source,
  inputRule: sourceManifest.inputRule,
  boards,
  gates: approval.gates,
  creator: { scriptSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) },
};
manifest.artifactSha256 = sha(Buffer.from(stable(manifest), 'utf8'));

writeNew(approvalPath, approval);
writeNew(manifestPath, manifest);
console.log(JSON.stringify({ approved: true, cutCount: boards.length, approvalSha256: approval.artifactSha256, manifestSha256: manifest.artifactSha256, outputRoot }, null, 2));
