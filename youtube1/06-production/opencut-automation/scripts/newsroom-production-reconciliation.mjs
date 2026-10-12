import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[a-f0-9]{64}$/u;
const JOB = /^production-[a-f0-9]{40}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/u;
const stable = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashPayload = (value) => digest(Buffer.from(stable(value), 'utf8'));
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function jobPointer(record) {
  const jobId = record?.productionOrchestration?.jobId || record?.stages?.['04']?.orchestrationJobId;
  if (!JOB.test(String(jobId || ''))) throw new Error('Production pointer is absent or invalid');
  const authorityHash = record?.productionOrchestration?.authorityHash;
  return { jobId, authorityHash: SHA.test(String(authorityHash || '')) ? authorityHash : null };
}

async function regularBytes(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${file} must be a regular nonsymlink file`);
  const bytes = await fs.readFile(file);
  return { bytes, sha256: digest(bytes), length: bytes.length };
}

export async function verifyProductionReconciliation(artifact, { root = ROOT } = {}) {
  if (!isObject(artifact) || artifact.schema !== 'newsroom-production-reconciliation-v1' || artifact.creator !== 'newsroom-production-reconciliation-creator-v1' || artifact.verifier !== 'newsroom-production-reconciliation-verifier-v1' || !SLUG.test(String(artifact.slug || '')) || !SHA.test(String(artifact.artifactSha256 || ''))) throw new Error('Production reconciliation schema is invalid');
  const unsigned = { ...artifact }; delete unsigned.artifactSha256;
  if (hashPayload(unsigned) !== artifact.artifactSha256) throw new Error('Production reconciliation artifact hash is invalid');
  const workflowPath = path.join(root, 'production', 'newsroom', 'projects', `${artifact.slug}.workflow.json`);
  const registryPath = path.join(root, 'out', 'newsroom', 'project-registry.json');
  const [workflow, registry] = await Promise.all([regularBytes(workflowPath), regularBytes(registryPath)]);
  if (workflow.sha256 !== artifact.workflow.sha256 || workflow.length !== artifact.workflow.bytes || registry.sha256 !== artifact.registry.sha256 || registry.length !== artifact.registry.bytes) throw new Error('Production reconciliation source files changed');
  const workflowJson = JSON.parse(workflow.bytes); const registryJson = JSON.parse(registry.bytes);
  const registryRecord = registryJson.projects?.find((item) => item.slug === artifact.slug);
  const workflowPointer = jobPointer(workflowJson); const registryPointer = jobPointer(registryRecord);
  if (workflowPointer.jobId !== artifact.workflow.jobId || registryPointer.jobId !== artifact.registry.jobId || workflowPointer.jobId === registryPointer.jobId) throw new Error('Production reconciliation pointers changed');
  for (const observation of artifact.missingJobs || []) {
    if (!JOB.test(String(observation.jobId || '')) || observation.observedState !== 'missing-directory') throw new Error('Missing-job observation is invalid');
    try { await fs.lstat(path.join(root, 'out', 'newsroom', 'jobs', observation.jobId)); throw new Error(`Reconciled job ${observation.jobId} now exists`); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const intent = artifact.successorIntent; const headline = intent?.headline;
  if (intent?.preserveExistingJobs !== true || intent?.createSeparateImmutableJob !== true || headline?.approved !== true || !/[\uAC00-\uD7A3]/u.test(String(headline.line1 || '')) || !/[\uAC00-\uD7A3]/u.test(String(headline.line2 || '')) || intent?.ownerVoiceAuthority?.approved !== true || intent?.ownerVoiceAuthority?.profileId !== 'owner-voice-v1' || !SHA.test(String(intent?.ownerVoiceAuthority?.profileSha256 || '')) || !['paper-cut-i2v-v1', 'paper-cut-keyframe-v1', 'paper-cut-grok-storyboard-v2'].includes(intent?.visualAuthorityId)) throw new Error('Successor preservation intent is invalid');
  return artifact;
}

export async function createProductionReconciliation({ slug, headline, ownerVoiceAuthority, visualAuthorityId, supersedesArtifactSha256 = null, root = ROOT, now = new Date().toISOString() }) {
  if (!SLUG.test(String(slug || ''))) throw new Error('Invalid reconciliation slug');
  if (headline?.approved !== true || !headline.line1?.trim() || !headline.line2?.trim() || !/[\uAC00-\uD7A3]/u.test(headline.line1) || !/[\uAC00-\uD7A3]/u.test(headline.line2)) throw new Error('Explicit approved Korean headline is required');
  if (ownerVoiceAuthority?.approved !== true || ownerVoiceAuthority.profileId !== 'owner-voice-v1' || !SHA.test(String(ownerVoiceAuthority.profileSha256 || ''))) throw new Error('Explicit owner voice authority is required');
  if (visualAuthorityId !== 'paper-cut-grok-storyboard-v2') throw new Error('Explicit active Grok color-storyboard visual authority is required');
  const workflowPath = path.join(root, 'production', 'newsroom', 'projects', `${slug}.workflow.json`); const registryPath = path.join(root, 'out', 'newsroom', 'project-registry.json');
  const [workflow, registry] = await Promise.all([regularBytes(workflowPath), regularBytes(registryPath)]);
  const workflowJson = JSON.parse(workflow.bytes); const registryJson = JSON.parse(registry.bytes); const registryRecord = registryJson.projects?.find((item) => item.slug === slug);
  const workflowPointer = jobPointer(workflowJson); const registryPointer = jobPointer(registryRecord);
  if (workflowPointer.jobId === registryPointer.jobId) throw new Error('Reconciliation requires two distinct stale pointers');
  const missingJobs = [];
  for (const jobId of [workflowPointer.jobId, registryPointer.jobId]) {
    try { await fs.lstat(path.join(root, 'out', 'newsroom', 'jobs', jobId)); throw new Error(`Refusing reconciliation because ${jobId} exists`); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    missingJobs.push({ jobId, observedState: 'missing-directory', observedAt: now });
  }
  const payload = {
    schema: 'newsroom-production-reconciliation-v1', slug, createdAt: now,
    creator: 'newsroom-production-reconciliation-creator-v1', verifier: 'newsroom-production-reconciliation-verifier-v1',
    workflow: { path: path.relative(root, workflowPath).replaceAll('\\', '/'), sha256: workflow.sha256, bytes: workflow.length, ...workflowPointer },
    registry: { path: path.relative(root, registryPath).replaceAll('\\', '/'), sha256: registry.sha256, bytes: registry.length, ...registryPointer },
    missingJobs,
    successorIntent: { preserveExistingJobs: true, createSeparateImmutableJob: true, ...(SHA.test(String(supersedesArtifactSha256 || '')) ? { supersedesArtifactSha256 } : {}), selectedDraftId: workflowJson.draft?.selectedDraftId || null, sectionsSha256: hashPayload(workflowJson.draft?.sections || {}), headline: { approved: true, line1: headline.line1.normalize('NFC').trim(), line2: headline.line2.normalize('NFC').trim() }, ownerVoiceAuthority, visualAuthorityId },
  };
  const artifact = { ...payload, artifactSha256: hashPayload(payload) };
  const directory = path.join(root, 'production', 'newsroom', 'reconciliations', slug); const file = path.join(directory, `reconciliation-${artifact.artifactSha256.slice(0, 24)}.json`);
  await fs.mkdir(directory, { recursive: true });
  try { const handle = await fs.open(file, 'wx', 0o444); try { await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); } } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  await verifyProductionReconciliation(JSON.parse(await fs.readFile(file, 'utf8')), { root });
  return { artifact, file };
}

export async function ensureProductionReconciliation(input) {
  const root = input.root || ROOT; const slug = input.slug;
  const workflow = JSON.parse(await fs.readFile(path.join(root, 'production', 'newsroom', 'projects', `${slug}.workflow.json`), 'utf8'));
  const registry = JSON.parse(await fs.readFile(path.join(root, 'out', 'newsroom', 'project-registry.json'), 'utf8'));
  const registryRecord = registry.projects?.find((item) => item.slug === slug);
  let left; let right;
  try { left = jobPointer(workflow); } catch { return { artifact: null, file: null, required: false }; }
  try { right = jobPointer(registryRecord); } catch { return { artifact: null, file: null, required: false }; }
  if (left.jobId === right.jobId) return { artifact: null, file: null, required: false };
  const valid = await findValidProductionReconciliation(slug, { root });
  if (valid) return { artifact: valid, file: null, required: true };
  return { ...(await createProductionReconciliation(input)), required: true };
}

export async function findValidProductionReconciliation(slug, { root = ROOT } = {}) {
  const directory = path.join(root, 'production', 'newsroom', 'reconciliations', slug);
  for (const name of (await fs.readdir(directory).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error))).sort().reverse()) {
    if (!/^reconciliation-[a-f0-9]{24}\.json$/u.test(name)) continue;
    try { return await verifyProductionReconciliation(JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')), { root }); } catch { /* Try older append-only evidence. */ }
  }
  return null;
}
