import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyNewsroomNarrationManifest } from './newsroom-narration-stage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVISION_ROOT = path.join(ROOT, 'out', 'newsroom', 'narration-revisions');
const APPROVAL_ROOT = path.join(ROOT, 'production', 'newsroom', 'narration-approvals');
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const REQUIRED_FILES = ['manifest.json', 'handoff.json', 'narration-final.m4a', 'narration-final-inspection.wav', 'provider.acceptance.json'];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const artifactHash = (value) => sha256(Buffer.from(JSON.stringify(value), 'utf8'));
const pathWithin = (root, target) => { const base = path.resolve(root); const candidate = path.resolve(target); return candidate === base || candidate.startsWith(`${base}${path.sep}`); };

async function exactRegularFile(file, root) {
  const info = await fsp.lstat(file).catch(() => null); const real = info ? await fsp.realpath(file).catch(() => null) : null;
  if (!info?.isFile() || info.isSymbolicLink() || !real || !pathWithin(root, real)) throw new Error(`Narration approval source is missing, linked, or escaped: ${path.basename(file)}`);
  const bytes = await fsp.readFile(real);
  return { real, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

export async function verifyApprovedNarrationAuthority(authority, { slug, script = null, ownerVoiceProfile = null } = {}) {
  if (!authority || authority.schema !== 'approved-owner-narration-authority-v1' || authority.approved !== true || authority.slug !== slug || !SAFE_SLUG.test(String(slug || '')) || !SHA256.test(String(authority.artifactSha256 || ''))) throw new Error('Approved narration authority is malformed');
  const unsigned = { ...authority }; delete unsigned.artifactSha256;
  if (artifactHash(unsigned) !== authority.artifactSha256) throw new Error('Approved narration authority artifact hash changed');
  if (typeof authority.sourceRoot !== 'string' || path.isAbsolute(authority.sourceRoot) || authority.sourceRoot.split('/').includes('..')) throw new Error('Approved narration source root is invalid');
  const sourceRoot = path.resolve(ROOT, ...authority.sourceRoot.split('/')); const rootInfo = await fsp.lstat(sourceRoot).catch(() => null); const realRoot = rootInfo ? await fsp.realpath(sourceRoot).catch(() => null) : null;
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink() || path.resolve(realRoot || '') !== sourceRoot || !pathWithin(path.join(REVISION_ROOT, slug), sourceRoot)) throw new Error('Approved narration source root is missing, linked, or escaped');
  if (!Array.isArray(authority.files) || authority.files.length !== REQUIRED_FILES.length || JSON.stringify(authority.files.map((entry) => entry.name).sort()) !== JSON.stringify([...REQUIRED_FILES].sort())) throw new Error('Approved narration file set is incomplete');
  for (const entry of authority.files) {
    if (!REQUIRED_FILES.includes(entry.name) || !SHA256.test(String(entry.sha256 || '')) || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error('Approved narration file binding is malformed');
    const actual = await exactRegularFile(path.join(sourceRoot, entry.name), sourceRoot);
    if (actual.sha256 !== entry.sha256 || actual.byteLength !== entry.bytes) throw new Error(`Approved narration file changed: ${entry.name}`);
  }
  const manifest = JSON.parse(await fsp.readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
  if (manifest.authorityHash !== authority.sourceProductionAuthorityHash || manifest.scriptSha256 !== authority.scriptSha256 || manifest.ownerVoiceProfileSha256 !== authority.ownerVoiceProfileSha256 || manifest.audioSha256 !== authority.audioSha256 || manifest.handoffSha256 !== authority.handoffSha256 || manifest.providerAcceptanceSha256 !== authority.providerAcceptanceSha256 || manifest.status !== 'machine-accepted-locked') throw new Error('Approved narration manifest authority drifted');
  if (script && ownerVoiceProfile) verifyNewsroomNarrationManifest(manifest, { authorityHash: authority.sourceProductionAuthorityHash, script, ownerVoiceProfile, outputDir: sourceRoot });
  return { authority, sourceRoot, manifest };
}

export async function loadApprovedNarrationAuthority(slug) {
  if (!SAFE_SLUG.test(String(slug || ''))) throw new Error('Invalid narration approval slug');
  const file = path.join(APPROVAL_ROOT, `${slug}.json`); const info = await fsp.lstat(file).catch(() => null);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Narration approval artifact must be a regular nonsymlink file');
  const authority = JSON.parse(await fsp.readFile(file, 'utf8'));
  await verifyApprovedNarrationAuthority(authority, { slug });
  return authority;
}

export async function createApprovedNarrationAuthority({ slug, sourceDir, sourceJobDir }) {
  if (!SAFE_SLUG.test(String(slug || ''))) throw new Error('Invalid narration approval slug');
  const sourceRoot = path.resolve(sourceDir); const jobRoot = path.resolve(sourceJobDir);
  if (!pathWithin(path.join(REVISION_ROOT, slug), sourceRoot)) throw new Error('Narration revision is outside the slug revision root');
  const [request, script, manifest] = await Promise.all([
    fsp.readFile(path.join(jobRoot, 'request.json'), 'utf8').then((text) => JSON.parse(text)),
    fsp.readFile(path.join(jobRoot, 'authority', 'script.final.json'), 'utf8').then((text) => JSON.parse(text)),
    fsp.readFile(path.join(sourceRoot, 'manifest.json'), 'utf8').then((text) => JSON.parse(text)),
  ]);
  if (request.slug !== slug || request.authorityHash !== manifest.authorityHash) throw new Error('Narration revision does not match its source production job');
  verifyNewsroomNarrationManifest(manifest, { authorityHash: request.authorityHash, script, ownerVoiceProfile: request.productionConfig?.ownerVoiceProfile, outputDir: sourceRoot });
  const files = [];
  for (const name of REQUIRED_FILES) { const entry = await exactRegularFile(path.join(sourceRoot, name), sourceRoot); files.push({ name, sha256: entry.sha256, bytes: entry.byteLength }); }
  const unsigned = {
    schema: 'approved-owner-narration-authority-v1', approved: true, slug,
    sourceRoot: path.relative(ROOT, sourceRoot).replaceAll(path.sep, '/'), sourceProductionJobId: request.jobId, sourceProductionAuthorityHash: request.authorityHash,
    scriptSha256: manifest.scriptSha256, ownerVoiceProfileSha256: manifest.ownerVoiceProfileSha256,
    audioSha256: manifest.audioSha256, handoffSha256: manifest.handoffSha256, providerAcceptanceSha256: manifest.providerAcceptanceSha256,
    durationSeconds: manifest.durationSeconds, cueCount: manifest.cueCount, segmentReuse: manifest.segmentReuse, files,
  };
  const authority = { ...unsigned, artifactSha256: artifactHash(unsigned) };
  await fsp.mkdir(APPROVAL_ROOT, { recursive: true });
  const output = path.join(APPROVAL_ROOT, `${slug}.json`); const temporary = `${output}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  const existing = await fsp.readFile(output, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (existing !== null) {
    const current = JSON.parse(existing);
    await verifyApprovedNarrationAuthority(current, { slug });
    if (current.artifactSha256 !== authority.artifactSha256) throw new Error('A different approved narration authority already exists for this slug');
  } else {
    await fsp.writeFile(temporary, `${JSON.stringify(authority, null, 2)}\n`, { flag: 'wx' });
    await fsp.rename(temporary, output);
  }
  await verifyApprovedNarrationAuthority(authority, { slug, script, ownerVoiceProfile: request.productionConfig.ownerVoiceProfile });
  return { authority, output };
}

export async function admitApprovedNarrationAuthority(authority, { slug, script, ownerVoiceProfile, authorityHash, outputDir }) {
  if (!SHA256.test(String(authorityHash || ''))) throw new Error('Target production authority hash is invalid');
  const verified = await verifyApprovedNarrationAuthority(authority, { slug, script, ownerVoiceProfile });
  await fsp.mkdir(outputDir, { recursive: true });
  for (const entry of authority.files) {
    // completeCheckpoint owns manifest.json and publishes the returned object
    // atomically. Copying a readonly manifest first makes that atomic rename
    // fail on Windows, so only immutable payload/evidence files are admitted.
    if (entry.name === 'manifest.json' || entry.name === 'handoff.json') continue;
    const source = path.join(verified.sourceRoot, entry.name); const target = path.join(outputDir, entry.name); const bytes = await fsp.readFile(source);
    try { await fsp.writeFile(target, bytes, { flag: 'wx', mode: 0o400 }); }
    catch (error) { if (error?.code !== 'EEXIST' || sha256(await fsp.readFile(target)) !== entry.sha256) throw error; }
    await fsp.chmod(target, 0o400);
  }
  const sourceHandoff = JSON.parse(await fsp.readFile(path.join(verified.sourceRoot, 'handoff.json'), 'utf8'));
  const adoptedHandoff = {
    ...sourceHandoff,
    authorityHash,
    approvedNarrationAuthority: { artifactSha256: authority.artifactSha256, sourceProductionAuthorityHash: authority.sourceProductionAuthorityHash, sourceHandoffSha256: authority.handoffSha256 },
  };
  const handoffBytes = Buffer.from(`${JSON.stringify(adoptedHandoff, null, 2)}\n`, 'utf8');
  const handoffPath = path.join(outputDir, 'handoff.json');
  try { await fsp.writeFile(handoffPath, handoffBytes, { flag: 'wx', mode: 0o400 }); }
  catch (error) { if (error?.code !== 'EEXIST' || sha256(await fsp.readFile(handoffPath)) !== sha256(handoffBytes)) throw error; }
  await fsp.chmod(handoffPath, 0o400);
  const adoptedManifest = { ...verified.manifest, authorityHash, handoffSha256: sha256(handoffBytes), approvedNarrationAuthoritySha256: authority.artifactSha256 };
  verifyNewsroomNarrationManifest(verified.manifest, { authorityHash: authority.sourceProductionAuthorityHash, script, ownerVoiceProfile, outputDir: verified.sourceRoot });
  verifyNewsroomNarrationManifest(adoptedManifest, { authorityHash, script, ownerVoiceProfile, outputDir });
  return adoptedManifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  const result = await createApprovedNarrationAuthority({ slug: value('--slug'), sourceDir: value('--source-dir'), sourceJobDir: value('--source-job-dir') });
  process.stdout.write(`${JSON.stringify({ status: 'approved', path: result.output, artifactSha256: result.authority.artifactSha256, audioSha256: result.authority.audioSha256 })}\n`);
}
