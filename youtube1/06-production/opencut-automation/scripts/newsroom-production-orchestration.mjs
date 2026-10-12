import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEvidenceBundle, deriveEvidenceContext, hashText, stableStringify, verifyEvidenceBundle } from './evidence-bundle.mjs';
import { INFORMATION_DELTA_V14_CAPTION_PRESET } from './production-lib.mjs';
import { CODEX_QA_MODEL, CODEX_QA_PROMPT_VERSION, CODEX_QA_REASONING, runCodexMonitor, runCodexRepairAttempt } from './newsroom-codex-qa.mjs';
import { buildImagegenInvocation } from './production-adapters/imagegen-invocation.mjs';
import { buildFfprobeEnvironment, buildFfprobeInvocation } from './production-adapters/ffmpeg-invocation.mjs';
import { ACTIVE_CONTRACT_REVISION, AGENT_VIDEO_DESIGN_WORKFLOW_VERSION, agentVideoDesignWorkflowConfiguration, buildAgentVideoDesignInput, compileAgentVideoDesign, createAgentVideoDesignArtifact, hashSemanticCutPlanContent, hashStoryboardAdmissionContent, hashStorylineContent, MOTION_DOCUMENTARY_EVIDENCE_STATUSES, MOTION_DOCUMENTARY_SCENE_ROLES, MOTION_DOCUMENTARY_SOURCE_KINDS, normalizeAgentVideoDesignPlan, normalizePlannerCatalogs, PAPER_CUT_PROFILE_ID, SEMANTIC_CUT_PLAN_SCHEMA, STORYBOARD_ADMISSION_SCHEMA, STORYLINE_SCHEMA, verifyAgentVideoDesignArtifact } from './newsroom-video-design-planner.mjs';
import { loadVisualAuthority } from './editorial-cartoon-authority.mjs';
import { generateNewsroomNarration, verifyNewsroomNarrationManifest } from './newsroom-narration-stage.mjs';
import { admitApprovedNarrationAuthority, loadApprovedNarrationAuthority } from './newsroom-narration-approval.mjs';
import { buildAssemblyReady, buildEditorialMotionDocumentaryPlans, normalizeMediaAssemblyPolicy, verifyEditorialMotionDocumentaryPlans } from './editorial-motion-documentary-plans.mjs';

const AUTOMATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOBS_ROOT = path.join(AUTOMATION_ROOT, 'out', 'newsroom', 'jobs');
const SAFE_JOB = /^production-[a-f0-9]{40}$/u;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{5,80}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const STAGES = ['finalized', 'evidence_bundle', 'narration', 'video_design_agent_plan', 'video_design_planner', 'video_plan', 'codex_monitor', 'editorial_story_plan', 'visual_treatment', 'animatic_plan', 'assembly_ready', 'reference_assets', 'imagegen', 'keyframe_render', 'ffmpeg_private_render', 'qa', 'codex_final_audit'];
const SECTION_ORDER = ['hook', 'incident', 'timeline', 'frustrating', 'solution', 'legal', 'confirmation'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = (file) => { const digest = crypto.createHash('sha256'); const descriptor = fs.openSync(file, 'r'); const buffer = Buffer.allocUnsafe(8 * 1024 * 1024); try { let bytesRead = 0; do { bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (bytesRead) digest.update(buffer.subarray(0, bytesRead)); } while (bytesRead); } finally { fs.closeSync(descriptor); } return digest.digest('hex'); };
const hashJson = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/gu, ' ').trim();
const LEASE_MS = 30_000;
const WORKER_LEASE_MS = 30 * 60_000;
const activeWorkers = new Map();
const activeBundleSnapshots = new Set();
const BUNDLE_MARKER = '.newsroom-tool-bundle.json';
const SNAPSHOT_AGE_MS = 60 * 60_000;
const BUILTIN_IMAGEGEN_PROVIDER_ID = 'openai-imagegen-agent-bridge';
const BUILTIN_IMAGEGEN_PROVIDER_VERSION = '1.1.0';
const BUILTIN_IMAGEGEN_BRIDGE_PATH = path.join(AUTOMATION_ROOT, 'scripts', 'production-adapters', 'imagegen-agent-bridge.mjs');

function processStartIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'win32') {
      const executable = path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      return execFileSync(executable, ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`], { encoding: 'utf8', windowsHide: true, timeout: 5_000, env: buildFfprobeEnvironment() }).trim() || null;
    }
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').trim().split(/\s+/u)[21] || null;
  } catch { return null; }
}

async function readSnapshotClaim(root, token) {
  const claimPath = path.join(root, `.tool-bundle-claim-${token}.json`); const envelopePath = path.join(root, `.tool-bundle-claim-${token}.envelope.json`);
  try { const claim = JSON.parse(await fsp.readFile(claimPath, 'utf8')); if (claim.schema === 'newsroom-tool-bundle-claim-v1' && claim.token === token) return { claim, claimPath, envelopePath }; } catch { /* Recover only from the independently checksummed envelope. */ }
  try { const envelope = JSON.parse(await fsp.readFile(envelopePath, 'utf8')); if (envelope.schema === 'newsroom-tool-bundle-claim-envelope-v1' && envelope.token === token && hashJson(envelope.claim) === envelope.claimSha256 && envelope.claim?.schema === 'newsroom-tool-bundle-claim-v1' && envelope.claim.token === token) return { claim: envelope.claim, claimPath, envelopePath }; } catch { /* Unknown ownership fails closed. */ }
  return null;
}

function comparablePath(value) { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function pathIsWithin(root, target) { const base = comparablePath(root); const candidate = comparablePath(target); return candidate === base || candidate.startsWith(`${base}${path.sep}`); }
function pathOverlap(left, right) { return pathIsWithin(left, right) || pathIsWithin(right, left); }

function inspectProductionBundle(variableName, kind, environment = process.env) {
  const configured = String(environment[variableName] || '').trim();
  if (!path.isAbsolute(configured) || configured.includes('\0')) return { status: 'unconfigured', kind };
  try {
    const configuredRoot = path.resolve(configured); const rootInfo = fs.lstatSync(configuredRoot); const realRoot = fs.realpathSync.native(configuredRoot);
    const same = process.platform === 'win32' ? configuredRoot.toLowerCase() === realRoot.toLowerCase() : configuredRoot === realRoot;
    const forbidden = [AUTOMATION_ROOT, os.tmpdir(), environment.HOME, environment.USERPROFILE, process.env.HOME, process.env.USERPROFILE].filter((item) => typeof item === 'string' && path.isAbsolute(item));
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !same || path.parse(realRoot).root === realRoot || forbidden.some((root) => pathOverlap(root, realRoot))) return { status: 'invalid', kind, configuredRoot };
    const markerPath = path.join(realRoot, BUNDLE_MARKER); const markerInfo = fs.lstatSync(markerPath);
    if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.nlink !== 1) return { status: 'invalid', kind, configuredRoot };
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (marker.schema !== 'newsroom-tool-bundle-v1' || marker.kind !== kind || !marker.launch || typeof marker.launch !== 'object') return { status: 'invalid', kind, configuredRoot };
    const requiredLaunch = kind === 'ffmpeg' ? ['ffmpeg', 'ffprobe'] : kind === 'python' ? ['python'] : ['executable'];
    if (requiredLaunch.some((key) => typeof marker.launch[key] !== 'string' || path.isAbsolute(marker.launch[key]) || marker.launch[key].split(/[\\/]/u).includes('..'))) return { status: 'invalid', kind, configuredRoot };
    const files = [];
    const walk = (directory, relative = '') => {
      const directoryInfo = fs.lstatSync(directory); const directoryReal = fs.realpathSync.native(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || !pathIsWithin(realRoot, directoryReal)) throw new Error('unsafe bundle directory');
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name); const rel = path.posix.join(relative.replaceAll(path.sep, '/'), entry.name);
        const info = fs.lstatSync(file); if (info.isSymbolicLink()) throw new Error('bundle symlink');
        if (info.isDirectory()) walk(file, rel);
        else if (info.isFile()) { const bytes = fs.readFileSync(file); files.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length }); }
        else throw new Error('unsafe bundle entry');
      }
    };
    walk(realRoot);
    for (const key of requiredLaunch) if (!files.some((file) => file.path === String(marker.launch[key]).replaceAll('\\', '/'))) return { status: 'invalid', kind, configuredRoot };
    const fixedArgs = marker.fixedArgs ?? []; if (!Array.isArray(fixedArgs) || fixedArgs.some((item) => typeof item !== 'string' || item.length > 500 || item.includes('\0') || (path.isAbsolute(item) && !pathIsWithin(realRoot, item)))) return { status: 'invalid', kind, configuredRoot };
    const manifest = { schema: 'newsroom-tool-bundle-authority-v1', kind, configuredRoot, realRoot, launch: marker.launch, fixedArgs, files };
    return { status: 'ready', ...manifest, manifestSha256: hashJson(manifest) };
  } catch { return { status: 'invalid', kind, configuredRoot: path.resolve(configured) }; }
}

export const inspectFfmpegBundle = (environment = process.env) => inspectProductionBundle('NEWSROOM_FFMPEG_BUNDLE_ROOT', 'ffmpeg', environment);
export const inspectPythonBundle = (environment = process.env) => inspectProductionBundle('NEWSROOM_PYTHON_BUNDLE_ROOT', 'python', environment);
function assertBundleAuthority(kind, expected, environment = process.env) {
  if (!['ffmpeg', 'python'].includes(kind)) throw Object.assign(new Error(`Unsupported production bundle kind ${kind}`), { code: 'PROVIDER_BLOCKED' });
  const actual = kind === 'ffmpeg' ? inspectFfmpegBundle(environment) : inspectPythonBundle(environment);
  if (expected?.status !== 'ready' || actual.status !== 'ready' || stableStringify(actual) !== stableStringify(expected)) throw Object.assign(new Error(`${kind} bundle path/content identity differs from the finalized production authority`), { code: 'PROVIDER_BLOCKED' });
  return actual;
}

async function verifiedSnapshotJobRoot(jobRoot) {
  const resolved = path.resolve(jobRoot); const info = await fsp.lstat(resolved); const real = await fsp.realpath(resolved);
  const samePath = process.platform === 'win32' ? resolved.toLowerCase() === real.toLowerCase() : resolved === real;
  if (!info.isDirectory() || info.isSymbolicLink() || !samePath) throw Object.assign(new Error('Production tool snapshot job root must be a real nonsymlink directory'), { code: 'PROVIDER_BLOCKED' });
  return real;
}

async function verifiedAuthoritySnapshotBase(realJobRoot, explicitSnapshotBase = null) {
  if (explicitSnapshotBase !== null) {
    if (!path.isAbsolute(explicitSnapshotBase)) throw Object.assign(new Error('Explicit tool snapshot base must be absolute'), { code: 'PROVIDER_BLOCKED' });
    await fsp.mkdir(explicitSnapshotBase, { recursive: true, mode: 0o700 });
    return verifiedSnapshotJobRoot(explicitSnapshotBase);
  }
  if (process.platform !== 'win32') return realJobRoot;
  const programData = path.resolve(process.env.ProgramData || 'C:\\ProgramData');
  const realProgramData = await verifiedSnapshotJobRoot(programData);
  const candidate = path.join(realProgramData, 'NJB');
  await fsp.mkdir(candidate, { recursive: true, mode: 0o700 });
  const realCandidate = await verifiedSnapshotJobRoot(candidate);
  const sameParent = path.dirname(realCandidate).toLowerCase() === realProgramData.toLowerCase();
  if (!sameParent || path.basename(realCandidate).toLowerCase() !== 'njb') throw Object.assign(new Error('Windows tool snapshot base escaped its dedicated short ProgramData root'), { code: 'PROVIDER_BLOCKED' });
  return realCandidate;
}

async function inspectSnapshotTree(root, expectedFiles = null) {
  const files = [];
  const walk = async (directory, relative = '') => {
    const info = await fsp.lstat(directory); const real = await fsp.realpath(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (real !== root && !real.startsWith(`${root}${path.sep}`))) throw Object.assign(new Error('Unsafe bundle snapshot directory'), { code: 'PROVIDER_BLOCKED' });
    for (const entry of (await fsp.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name); const rel = path.posix.join(relative, entry.name); const item = await fsp.lstat(absolute);
      if (item.isSymbolicLink()) throw Object.assign(new Error('Bundle snapshot contains a link'), { code: 'PROVIDER_BLOCKED' });
      if (item.isDirectory()) await walk(absolute, rel);
      else if (item.isFile()) { const bytes = await fsp.readFile(absolute); files.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length }); }
      else throw Object.assign(new Error('Bundle snapshot contains an unsupported entry'), { code: 'PROVIDER_BLOCKED' });
    }
  };
  await walk(root);
  if (expectedFiles && stableStringify(files) !== stableStringify(expectedFiles)) throw Object.assign(new Error('Bundle snapshot manifest/content fence failed'), { code: 'PROVIDER_BLOCKED' });
  return files;
}

async function removeVerifiedSnapshotTree(root) {
  const remove = async (entry) => {
    const info = await fsp.lstat(entry);
    if (info.isSymbolicLink()) throw Object.assign(new Error('Refusing to clean linked bundle snapshot content'), { code: 'PROVIDER_BLOCKED' });
    if (info.isDirectory()) { for (const child of await fsp.readdir(entry)) await remove(path.join(entry, child)); await fsp.rmdir(entry); }
    else if (info.isFile()) await fsp.unlink(entry);
    else throw Object.assign(new Error('Refusing to clean unknown bundle snapshot content'), { code: 'PROVIDER_BLOCKED' });
  };
  await remove(root);
}

async function setSnapshotWritable(root, writable) {
  const visit = async (entry) => {
    const info = await fsp.lstat(entry); if (info.isSymbolicLink()) throw Object.assign(new Error('Refusing to change permissions on linked snapshot content'), { code: 'PROVIDER_BLOCKED' });
    if (info.isDirectory()) { if (writable) await fsp.chmod(entry, 0o700); for (const child of await fsp.readdir(entry)) await visit(path.join(entry, child)); if (!writable) await fsp.chmod(entry, 0o500); }
    else if (info.isFile()) await fsp.chmod(entry, writable ? 0o600 : 0o400);
    else throw Object.assign(new Error('Snapshot contains an unsealable entry'), { code: 'PROVIDER_BLOCKED' });
  };
  try { await visit(root); } catch (error) { throw Object.assign(new Error(`Tool bundle OS read-only seal ${writable ? 'release' : 'application'} failed`), { code: 'PROVIDER_BLOCKED', cause: error }); }
}

export async function scavengeAuthorityBundleSnapshots(jobRoot, now = Date.now()) {
  const realRoot = await verifiedSnapshotJobRoot(jobRoot); let removed = 0; const entries = await fsp.readdir(realRoot, { withFileTypes: true });
  const orphanTokens = new Set(entries.flatMap((entry) => { const match = /^\.tool-bundle-claim-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\.envelope)?\.json$/iu.exec(entry.name); return match && entry.isFile() && !entry.isSymbolicLink() ? [match[1]] : []; }));
  for (const token of orphanTokens) {
    const snapshotDir = path.join(realRoot, `.tool-bundle-${token}`); if (fs.existsSync(snapshotDir)) continue;
    const recovered = await readSnapshotClaim(realRoot, token); if (!recovered) continue;
    const infos = await Promise.all([recovered.claimPath, recovered.envelopePath].map((file) => fsp.lstat(file).catch(() => null))); if (infos.filter(Boolean).some((info) => now - info.mtimeMs < SNAPSHOT_AGE_MS)) continue;
    const claim = recovered.claim; if (!Number.isSafeInteger(claim.pid)) continue; if (isProcessAlive(claim.pid)) { const actual = processStartIdentity(claim.pid); if (!claim.processStartedAt || !actual || actual === claim.processStartedAt) continue; }
    for (const file of [recovered.claimPath, recovered.envelopePath]) await fsp.unlink(file).catch((error) => { if (error?.code !== 'ENOENT') throw error; }); removed += 1;
  }
  for (const entry of entries) {
    if (!/^\.tool-bundle-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const dir = path.join(realRoot, entry.name); const manifestPath = path.join(dir, 'snapshot.json'); const token = entry.name.slice('.tool-bundle-'.length); const claimPath = path.join(realRoot, `.tool-bundle-claim-${token}.json`);
    try {
      const dirInfo = await fsp.lstat(dir); if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) continue;
      if (activeBundleSnapshots.has(dir) || now - dirInfo.mtimeMs < SNAPSHOT_AGE_MS) continue;
      const recovered = await readSnapshotClaim(realRoot, token); if (!recovered) continue; const claim = recovered.claim;
      if (claim.schema !== 'newsroom-tool-bundle-claim-v1' || claim.token !== token || !Number.isSafeInteger(claim.pid)) continue;
      if (isProcessAlive(claim.pid)) { const actualStart = processStartIdentity(claim.pid); if (!claim.processStartedAt || !actualStart || actualStart === claim.processStartedAt) continue; }
      const manifestInfo = await fsp.lstat(manifestPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (!manifestInfo) { await inspectSnapshotTree(dir); await removeVerifiedSnapshotTree(dir); await fsp.unlink(recovered.claimPath).catch(() => {}); await fsp.unlink(recovered.envelopePath).catch(() => {}); removed += 1; continue; }
      if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1) continue;
      let manifest; try { manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')); } catch { await inspectSnapshotTree(dir); await removeVerifiedSnapshotTree(dir); await fsp.unlink(recovered.claimPath).catch(() => {}); await fsp.unlink(recovered.envelopePath).catch(() => {}); removed += 1; continue; } const createdAt = Date.parse(manifest.createdAt);
      if (manifest.schema !== 'newsroom-tool-bundle-snapshot-v1' || !['partial', 'ready'].includes(manifest.state) || manifest.directory !== entry.name || !Number.isFinite(createdAt) || now - createdAt < 60 * 60_000) continue;
      const realDir = await fsp.realpath(dir); if (path.dirname(realDir) !== realRoot) continue;
      const present = (await fsp.readdir(dir)).sort();
      if (manifest.state === 'ready') { if (stableStringify(present) !== stableStringify(['bundle', 'snapshot.json'])) continue; if (!Array.isArray(manifest.files)) continue; await inspectSnapshotTree(path.join(dir, 'bundle'), manifest.files); }
      else await inspectSnapshotTree(dir);
      await removeVerifiedSnapshotTree(dir); await fsp.unlink(recovered.claimPath).catch(() => {}); await fsp.unlink(recovered.envelopePath).catch(() => {}); removed += 1;
    } catch { /* Unknown, young, partial, linked, or concurrently changing entries fail closed and remain untouched. */ }
  }
  return removed;
}

export function buildPythonBundleEnvironment(bundleRoot) {
  const env = buildFfprobeEnvironment();
  return {
    ...env,
    PYTHONHOME: bundleRoot,
    PYTHONPATH: [path.join(bundleRoot, 'Lib'), path.join(bundleRoot, 'Lib', 'site-packages')].join(path.delimiter),
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
  };
}

function collectLocalEsmGraph(entryFile) {
  const pending = [path.resolve(entryFile)]; const seen = new Set(); const files = [];
  while (pending.length) {
    const file = pending.pop(); if (seen.has(file)) continue; seen.add(file);
    if (!pathIsWithin(AUTOMATION_ROOT, file)) throw new Error('Production execution import escapes the automation root');
    const source = fs.readFileSync(file, 'utf8');
    if (/\bimport\s*\(/u.test(source)) throw new Error(`Dynamic imports are forbidden in the production execution graph: ${path.relative(AUTOMATION_ROOT, file)}`);
    const imports = [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gu)].map((match) => match[1]);
    for (const specifier of imports) { const resolved = path.resolve(path.dirname(file), specifier); if (!fs.existsSync(resolved) || !fs.lstatSync(resolved).isFile()) throw new Error(`Unresolved local production import ${specifier}`); pending.push(resolved); }
    const bytes = fs.readFileSync(file); files.push({ path: path.relative(AUTOMATION_ROOT, file).replaceAll(path.sep, '/'), sha256: sha256(bytes), bytes: bytes.length });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function collectProductionExecutionSources() {
  const sources = new Map();
  for (const entry of ['newsroom-production-orchestration.mjs', 'newsroom-video-design-planner.mjs', 'newsroom-codex-qa.mjs', 'produce-short.mjs', 'create-editorial-cartoon-project.mjs', 'verify-editorial-cartoon-project.mjs']) {
    for (const file of collectLocalEsmGraph(path.join(AUTOMATION_ROOT, 'scripts', entry))) sources.set(file.path, file);
  }
  const graph = [...sources.values()];
  for (const name of ['transcribe-whisper.py', 'transcribe-whisper-windows.py', 'build-v3-font.py', 'analyze-libass-calibration.py']) {
    const source = path.join(AUTOMATION_ROOT, 'scripts', name); const bytes = fs.readFileSync(source); graph.push({ path: `scripts/${name}`, sha256: sha256(bytes), bytes: bytes.length });
  }
  for (const relative of ['production/templates/reference-v3.tokens.json', 'production/templates/paper-cut-grok-storyboard-v2.json', 'knowledge/wiki/concepts/caption-generation-rules.md']) {
    const source = path.join(AUTOMATION_ROOT, ...relative.split('/')); const bytes = fs.readFileSync(source); graph.push({ path: relative, sha256: sha256(bytes), bytes: bytes.length });
  }
  { const relative = 'scripts/windows-fileshare-read-holder.ps1'; const source = path.join(AUTOMATION_ROOT, ...relative.split('/')); const bytes = fs.readFileSync(source); graph.push({ path: relative, sha256: sha256(bytes), bytes: bytes.length }); }
  return graph.sort((a, b) => a.path.localeCompare(b.path));
}

async function ensureExecutionSourceSnapshot(jobRoot, expected) {
  if (!Array.isArray(expected) || stableStringify(collectProductionExecutionSources()) !== stableStringify(expected)) throw Object.assign(new Error('Production execution source authority changed'), { code: 'PROVIDER_BLOCKED' });
  const target = path.join(jobRoot, 'execution-source'); const manifestPath = path.join(target, 'manifest.json');
  const validate = async () => { for (const file of expected) { const absolute = contained(target, path.join(target, ...file.path.split('/')), 'execution source snapshot'); const bytes = await fsp.readFile(absolute); if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw Object.assign(new Error('Execution source snapshot changed'), { code: 'PROVIDER_BLOCKED' }); } return { root: target, files: expected.map((file) => path.join(target, ...file.path.split('/'))) }; };
  if (fs.existsSync(manifestPath)) return validate();
  const temporary = path.join(jobRoot, `.execution-source-${crypto.randomUUID()}`); await fsp.mkdir(temporary, { mode: 0o700 });
  try { for (const file of expected) { const destination = path.join(temporary, ...file.path.split('/')); await fsp.mkdir(path.dirname(destination), { recursive: true }); await fsp.copyFile(path.join(AUTOMATION_ROOT, ...file.path.split('/')), destination, fs.constants.COPYFILE_EXCL); await fsp.chmod(destination, 0o400); } await writeAtomic(path.join(temporary, 'manifest.json'), jsonText({ schema: 'newsroom-execution-source-snapshot-v1', files: expected })); await fsp.rename(temporary, target); } catch (error) { await removeVerifiedSnapshotTree(temporary).catch(() => {}); if (!fs.existsSync(manifestPath)) throw error; }
  return validate();
}

export async function withAuthorityBundleSnapshot({ jobRoot, kind, authority, environment = process.env, snapshotBase = null }, callback) {
  const expected = assertBundleAuthority(kind, authority, environment);
  const realJobRoot = await verifiedSnapshotJobRoot(jobRoot);
  const realSnapshotBase = await verifiedAuthoritySnapshotBase(realJobRoot, snapshotBase);
  await scavengeAuthorityBundleSnapshots(realSnapshotBase);
  const token = crypto.randomUUID(); const snapshotName = `.tool-snapshot-${token}`;
  const bundleSnapshotName = snapshotName.replace('.tool-snapshot-', '.tool-bundle-');
  const snapshotRoot = contained(realSnapshotBase, path.join(realSnapshotBase, bundleSnapshotName), 'tool bundle snapshot root');
  const claimPath = contained(realSnapshotBase, path.join(realSnapshotBase, `.tool-bundle-claim-${token}.json`), 'tool bundle claim');
  const claimEnvelopePath = contained(realSnapshotBase, path.join(realSnapshotBase, `.tool-bundle-claim-${token}.envelope.json`), 'tool bundle claim envelope');
  const processStartedAt = processStartIdentity(process.pid); if (!processStartedAt) throw Object.assign(new Error('Cannot establish tool snapshot owner process birth identity'), { code: 'PROVIDER_BLOCKED' });
  const jobRootSha256 = sha256(Buffer.from(realJobRoot, 'utf8'));
  const claim = { schema: 'newsroom-tool-bundle-claim-v1', token, pid: process.pid, processStartedAt, jobRootSha256, heartbeatAt: new Date().toISOString() }; await writeAtomic(claimEnvelopePath, jsonText({ schema: 'newsroom-tool-bundle-claim-envelope-v1', token, claim, claimSha256: hashJson(claim) })); await writeAtomic(claimPath, jsonText(claim));
  let claimHeartbeat = null;
  try {
    await fsp.mkdir(snapshotRoot, { recursive: false, mode: 0o700 });
    activeBundleSnapshots.add(snapshotRoot);
    claimHeartbeat = setInterval(() => { writeAtomic(claimPath, jsonText({ schema: 'newsroom-tool-bundle-claim-v1', token, pid: process.pid, processStartedAt, jobRootSha256, heartbeatAt: new Date().toISOString() })).catch(() => {}); }, 10_000); claimHeartbeat.unref?.();
    const manifestPath = path.join(snapshotRoot, 'snapshot.json');
    const rootInfo = await fsp.lstat(snapshotRoot); const realSnapshotRoot = await fsp.realpath(snapshotRoot);
    const expectedParent = process.platform === 'win32' ? realSnapshotBase.toLowerCase() : realSnapshotBase;
    const actualParent = process.platform === 'win32' ? path.dirname(realSnapshotRoot).toLowerCase() : path.dirname(realSnapshotRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || actualParent !== expectedParent) throw Object.assign(new Error('Production bundle snapshot directory publication failed its realpath fence'), { code: 'PROVIDER_BLOCKED' });
    await writeAtomic(manifestPath, jsonText({ schema: 'newsroom-tool-bundle-snapshot-v1', state: 'partial', directory: bundleSnapshotName, kind, authorityManifestSha256: expected.manifestSha256, createdAt: new Date().toISOString() }));
    const mirrorRoot = path.join(snapshotRoot, 'bundle'); await fsp.mkdir(mirrorRoot, { mode: 0o700 });
    for (const file of expected.files) {
      const source = contained(expected.realRoot, path.join(expected.realRoot, ...file.path.split('/')), 'bundle source');
      const target = contained(mirrorRoot, path.join(mirrorRoot, ...file.path.split('/')), 'bundle mirror');
      await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const sourceInfo = await fsp.lstat(source); const bytes = await fsp.readFile(source);
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw Object.assign(new Error(`${kind} bundle changed before snapshot publication`), { code: 'PROVIDER_BLOCKED' });
      try { await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL); } catch { throw Object.assign(new Error(`${kind} bundle could not be independently copied into its job mirror`), { code: 'PROVIDER_BLOCKED' }); }
    }
    await inspectSnapshotTree(mirrorRoot, expected.files);
    await writeAtomic(manifestPath, jsonText({ schema: 'newsroom-tool-bundle-snapshot-v1', state: 'ready', directory: bundleSnapshotName, kind, authorityManifestSha256: expected.manifestSha256, files: expected.files, launch: expected.launch, createdAt: new Date().toISOString() }));
    const launch = Object.fromEntries(Object.entries(expected.launch).map(([key, rel]) => [key, contained(mirrorRoot, path.join(mirrorRoot, ...String(rel).replaceAll('\\', '/').split('/')), `${kind} launch path`)]));
    const fence = () => {
      const root = fs.lstatSync(mirrorRoot); const real = fs.realpathSync.native(mirrorRoot);
      if (!root.isDirectory() || root.isSymbolicLink() || path.dirname(real) !== realSnapshotRoot) throw Object.assign(new Error(`${kind} bundle lost its snapshot root fence`), { code: 'PROVIDER_BLOCKED' });
      const actual = [];
      const walk = (directory, relative = '') => { for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const absolute = path.join(directory, entry.name); const rel = path.posix.join(relative, entry.name); const info = fs.lstatSync(absolute); if (info.isSymbolicLink()) throw Object.assign(new Error(`${kind} bundle snapshot contains a link`), { code: 'PROVIDER_BLOCKED' }); if (info.isDirectory()) walk(absolute, rel); else if (info.isFile()) { const bytes = fs.readFileSync(absolute); actual.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length }); } else throw Object.assign(new Error(`${kind} bundle snapshot contains an unsupported entry`), { code: 'PROVIDER_BLOCKED' }); } };
      walk(mirrorRoot); if (stableStringify(actual) !== stableStringify(expected.files)) throw Object.assign(new Error(`${kind} bundle lost its content fence`), { code: 'PROVIDER_BLOCKED' });
      return true;
    };
    await setSnapshotWritable(mirrorRoot, false);
    const fixedArgs = (expected.fixedArgs || []).map((argument) => path.isAbsolute(argument) ? contained(mirrorRoot, path.join(mirrorRoot, path.relative(expected.realRoot, argument)), `${kind} fixed argument`) : argument);
    fence(); return await callback({ root: mirrorRoot, launch, fixedArgs, files: expected.files, fence, manifestSha256: expected.manifestSha256 });
  } finally {
    if (claimHeartbeat) clearInterval(claimHeartbeat);
    try {
      const cleanupInfo = await fsp.lstat(snapshotRoot).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (cleanupInfo) {
        const cleanupReal = await fsp.realpath(snapshotRoot);
        const cleanupParent = process.platform === 'win32' ? path.dirname(cleanupReal).toLowerCase() : path.dirname(cleanupReal);
        const expectedCleanupParent = process.platform === 'win32' ? realSnapshotBase.toLowerCase() : realSnapshotBase;
        if (!cleanupInfo.isDirectory() || cleanupInfo.isSymbolicLink() || cleanupParent !== expectedCleanupParent || path.basename(cleanupReal) !== bundleSnapshotName) throw Object.assign(new Error('Refusing unsafe tool bundle snapshot cleanup target'), { code: 'PROVIDER_BLOCKED' });
        await setSnapshotWritable(snapshotRoot, true);
        await removeVerifiedSnapshotTree(snapshotRoot);
      }
    } finally { activeBundleSnapshots.delete(snapshotRoot); for (const file of [claimPath, claimEnvelopePath]) await fsp.unlink(file).catch((error) => { if (error?.code !== 'ENOENT') throw error; }); }
  }
}

function inspectOwnerVoiceProfile(environment = process.env) {
  const configured = String(environment.NEWSROOM_OWNER_VOICE_PROFILE_PATH || '').trim();
  const profilePath = configured ? path.resolve(configured) : path.resolve(AUTOMATION_ROOT, '..', '..', '03-script-voice', 'voice-clone', 'profiles', 'owner-voice-v1', 'prompt-bank', 'manifest.json');
  try {
    const info = fs.lstatSync(profilePath); if (!info.isFile() || info.isSymbolicLink()) throw new Error('owner voice profile must be a regular file');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (profile.profileId !== 'owner-voice-v1' || profile.status !== 'validation-passed' || profile.productionEligible !== true || profile.ownerVoice !== true || profile.modelRoute !== 'versioned-prompt-bank-profile-no-sft' || profile.model?.fallbackAllowed !== false || profile.model?.loraAllowed !== false || profile.model?.adapterAllowed !== false) throw new Error('owner voice profile is not production eligible');
    return { schema: 'newsroom-owner-voice-authority-v1', profileId: profile.profileId, profilePath, profileSha256: sha256(fs.readFileSync(profilePath)), modelId: profile.model.id, modelRevision: profile.model.revision, promptBank: profilePath };
  } catch (error) { throw Object.assign(new Error(`Owner voice authority is unavailable or invalid: ${error.message}`), { code: 'PROVIDER_BLOCKED' }); }
}

export function productionConfiguration(environment = process.env, { visualAuthorityId = PAPER_CUT_PROFILE_ID } = {}) {
  const ffmpegBundle = inspectFfmpegBundle(environment); const pythonBundle = inspectPythonBundle(environment);
  if ([ffmpegBundle, pythonBundle].some((bundle) => bundle.status !== 'ready')) {
    const status = `ffmpeg:${ffmpegBundle.status}, python:${pythonBundle.status}`;
    throw Object.assign(new Error(`Production tool bundles are not ready (${status}). Run npm run newsroom:verify-tool-bundles, then provision with npm run newsroom:provision-tool-bundles -- --ffmpeg-source-root <ffmpeg-source> --python-source-root <python-source> --target-base <dedicated-target-base>`), { code: 'PROVIDER_BLOCKED' });
  }
  const executionSources = collectProductionExecutionSources();
  const agentVideoDesignWorkflow = agentVideoDesignWorkflowConfiguration();
  const editorialCartoonAuthority = loadVisualAuthority(visualAuthorityId);
  const ownerVoiceProfile = inspectOwnerVoiceProfile(environment);
  const imagegenProvider = configuredImagegenProvider(environment);
  return {
    schema: 'newsroom-production-configuration-v2-two-stage',
    templateId: visualAuthorityId, styleId: 'layered-fibrous-paper-cutout-color-storyboard-v2',
    renderProfileId: 'vertical-1080x1920-24fps-grok-storyboard-v2', narrationProfileId: 'owner-voice-v1-qwen3-tts-v1', narrationMode: 'qwen3-tts-preplanned-locked', ownerVoiceProfile,
    imagegenProviderId: imagegenProvider.providerId,
    imagegenProviderVersion: imagegenProvider.providerVersion,
    imagegenProvider: imagegenProvider.identity,
    animationPolicy: { schema: 'newsroom-grok-storyboard-policy-v2', generator: 'grok', fps: 24, generativeVideoAllowed: true, providerInput: 'exactly-one-approved-color-storyboard', providerExecution: 'deferred-explicit-gate' },
    videoDesignPolicy: { schema: 'newsroom-video-design-policy-v4-two-stage', contractRevision: ACTIVE_CONTRACT_REVISION, cutDensityAuthority: visualAuthorityId },
    editorialCartoonAuthority,
    agentVideoDesignWorkflow,
    ffmpegBundle,
    pythonBundle,
    executionSources,
    codexQaModel: CODEX_QA_MODEL,
    codexQaReasoning: CODEX_QA_REASONING,
    codexQaPromptVersion: CODEX_QA_PROMPT_VERSION,
  };
}

function inspectProviderExecutable(prefix, environment = process.env) {
  const configured = String(environment[`${prefix}_EXECUTABLE`] || '');
  if (!path.isAbsolute(configured)) throw new Error(`${prefix}_EXECUTABLE must be absolute`);
  const info = fs.lstatSync(configured); const realPath = fs.realpathSync.native(configured);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${prefix}_EXECUTABLE must be a regular nonsymlink file`);
  let args = [];
  if (environment[`${prefix}_ARGS_JSON`]) {
    args = JSON.parse(environment[`${prefix}_ARGS_JSON`]);
    if (!Array.isArray(args) || args.some((item) => typeof item !== 'string' || item.length > 500 || item.includes('\0'))) throw new Error(`${prefix}_ARGS_JSON must be a JSON string array`);
  }
  const bytes = fs.readFileSync(realPath);
  const fixedArgFiles = args.flatMap((argument, index) => { if (!path.isAbsolute(argument) || !fs.existsSync(argument)) return []; const argumentInfo = fs.lstatSync(argument); if (!argumentInfo.isFile() || argumentInfo.isSymbolicLink()) throw new Error(`${prefix}_ARGS_JSON absolute file argument ${index} must be a regular nonsymlink file`); const argumentRealPath = fs.realpathSync.native(argument); const argumentBytes = fs.readFileSync(argumentRealPath); return [{ index, realPath: argumentRealPath, sha256: sha256(argumentBytes), bytes: argumentBytes.length }]; });
  return { executableRealPath: realPath, executableSha256: sha256(bytes), executableBytes: bytes.length, fixedArgs: args, fixedArgFiles };
}

function configuredImagegenProvider(environment = process.env) {
  const providerId = String(environment.NEWSROOM_IMAGEGEN_PROVIDER_ID || 'imagegen-unconfigured');
  const configuredVersion = String(environment.NEWSROOM_IMAGEGEN_PROVIDER_VERSION || 'unconfigured');
  if (!environment.NEWSROOM_IMAGEGEN_EXECUTABLE) return { providerId, providerVersion: configuredVersion, identity: null };
  const identity = inspectProviderExecutable('NEWSROOM_IMAGEGEN', environment);
  if (providerId !== BUILTIN_IMAGEGEN_PROVIDER_ID) return { providerId, providerVersion: configuredVersion, identity };
  const bridgeRealPath = fs.realpathSync.native(BUILTIN_IMAGEGEN_BRIDGE_PATH); const bridgeBytes = fs.readFileSync(bridgeRealPath); const bridgeSha256 = sha256(bridgeBytes);
  const boundBridge = identity.fixedArgFiles.find((file) => comparablePath(file.realPath) === comparablePath(bridgeRealPath));
  if (!boundBridge || boundBridge.sha256 !== bridgeSha256 || boundBridge.bytes !== bridgeBytes.length) throw Object.assign(new Error('Built-in ImageGen bridge executable arguments do not bind the canonical v1.1 adapter'), { code: 'PROVIDER_BLOCKED' });
  return { providerId, providerVersion: BUILTIN_IMAGEGEN_PROVIDER_VERSION, identity };
}

function contained(root, target, label = 'path') {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${label} escapes its workspace`);
  return resolved;
}

function jobDir(jobId) {
  if (!SAFE_JOB.test(jobId)) throw new Error('Invalid production orchestration job id');
  return contained(JOBS_ROOT, path.join(JOBS_ROOT, jobId), 'job path');
}

async function writeAtomic(file, bytes) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  const handle = await fsp.open(temporary, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await fsp.rename(temporary, file);
  try { const directory = await fsp.open(path.dirname(file), 'r'); try { await directory.sync(); } finally { await directory.close(); } } catch (error) { if (process.platform !== 'win32') throw error; }
}

async function writeExclusiveReadonlyVerified(file, bytes) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const expectedSha256 = sha256(bytes); const handle = await fsp.open(file, 'wx', 0o400);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fsp.chmod(file, 0o400);
  const verify = await fsp.open(file, 'r');
  try { const stat = await verify.stat(); const actual = Buffer.alloc(stat.size); await verify.read(actual, 0, stat.size, 0); if (stat.size !== bytes.length || sha256(actual) !== expectedSha256) throw Object.assign(new Error('Readonly semantic frame copy changed during creation'), { code: 'PROVIDER_BLOCKED' }); }
  finally { await verify.close(); }
  return { path: file, sha256: expectedSha256, bytes: bytes.length };
}

async function readJson(file) {
  return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/u, ''));
}

function finalDraft(sections) {
  if (!isObject(sections)) throw new Error('Final draft sections are required');
  return SECTION_ORDER.map((key) => {
    const value = typeof sections[key] === 'string' ? sections[key].replace(/\r\n/gu, '\n').trim() : '';
    if (!value) throw new Error(`Final draft section ${key} is empty`);
    return value;
  }).join('\n');
}

function inspectReferenceAssetAuthority(slug, referenceCatalog) {
  if (!SAFE_SLUG.test(String(slug || ''))) throw new Error('Invalid newsroom project slug');
  const root = path.join(AUTOMATION_ROOT, 'production', 'newsroom', 'reference-assets', slug);
  return referenceCatalog.filter((reference) => reference.assetId).map((reference) => {
    const source = contained(root, path.join(root, reference.assetId), `reference asset ${reference.id}`);
    const info = fs.lstatSync(source); const real = fs.realpathSync.native(source);
    if (!info.isFile() || info.isSymbolicLink() || path.dirname(real) !== path.resolve(root)) throw new Error(`Reference asset ${reference.id} must be a contained regular file`);
    const bytes = fs.readFileSync(real);
    return { id: reference.id, assetId: reference.assetId, sha256: sha256(bytes), bytes: bytes.length };
  });
}

async function verifyAdmittedReferenceManifest(manifest, { request, jobRoot, evidenceBundleSha256, referenceCatalogSha256 }) {
  if (!isObject(manifest) || manifest.schema !== 'editorial-reference-assets-v1' || manifest.evidenceBundleSha256 !== evidenceBundleSha256 || manifest.referenceCatalogSha256 !== referenceCatalogSha256 || !Array.isArray(manifest.references)) throw Object.assign(new Error('Reference asset manifest authority is invalid'), { code: 'PROVIDER_BLOCKED' });
  if (manifest.references.length !== request.referenceCatalog.length) throw Object.assign(new Error('Reference asset manifest catalog cardinality drifted'), { code: 'PROVIDER_BLOCKED' });
  const authorityById = new Map((request.referenceAssetAuthority || []).map((entry) => [entry.id, entry]));
  const referenceRoot = path.join(jobRoot, 'project', 'reference-assets');
  const referenceRootInfo = await fsp.lstat(referenceRoot).catch(() => null);
  const realReferenceRoot = await fsp.realpath(referenceRoot).catch(() => null);
  if (authorityById.size && (!referenceRootInfo?.isDirectory() || referenceRootInfo.isSymbolicLink() || path.resolve(realReferenceRoot || '') !== path.resolve(referenceRoot))) throw Object.assign(new Error('Reference asset root is not an exact contained regular directory'), { code: 'PROVIDER_BLOCKED' });
  for (const [index, expectedReference] of request.referenceCatalog.entries()) {
    const actual = manifest.references[index]; const authority = authorityById.get(expectedReference.id);
    const expectedMetadata = { ...expectedReference, verifiedMetadata: true };
    if (!isObject(actual) || stableStringify(Object.fromEntries(Object.entries(actual).filter(([key]) => key !== 'admittedAsset'))) !== stableStringify(expectedMetadata)) throw Object.assign(new Error(`Reference ${expectedReference.id} metadata drifted`), { code: 'PROVIDER_BLOCKED' });
    if (!authority) { if (actual.admittedAsset !== undefined) throw Object.assign(new Error(`Reference ${expectedReference.id} has an unauthorized admitted asset`), { code: 'PROVIDER_BLOCKED' }); continue; }
    const expectedPath = path.join(referenceRoot, authority.assetId); const admitted = actual.admittedAsset;
    if (!realReferenceRoot || !isObject(admitted) || admitted.path !== expectedPath || admitted.sha256 !== authority.sha256 || admitted.bytes !== authority.bytes) throw Object.assign(new Error(`Reference ${expectedReference.id} admitted authority drifted`), { code: 'PROVIDER_BLOCKED' });
    const info = await fsp.lstat(expectedPath).catch(() => null); const real = info ? await fsp.realpath(expectedPath).catch(() => null) : null;
    if (!info?.isFile() || info.isSymbolicLink() || path.dirname(real || '') !== realReferenceRoot) throw Object.assign(new Error(`Reference ${expectedReference.id} admitted path is not a contained regular file`), { code: 'PROVIDER_BLOCKED' });
    const bytes = await fsp.readFile(expectedPath); if (bytes.length !== authority.bytes || sha256(bytes) !== authority.sha256) throw Object.assign(new Error(`Reference ${expectedReference.id} admitted bytes drifted`), { code: 'PROVIDER_BLOCKED' });
  }
  return manifest;
}

function selectedReferenceProjection(manifest, selectedIds, referenceManifestSha256) {
  const ids = [...new Set(selectedIds)]; const byId = new Map(manifest.references.map((reference) => [reference.id, reference]));
  const references = ids.map((id) => { const reference = byId.get(id); if (!reference) throw Object.assign(new Error(`Selected reference ${id} is absent from the admitted manifest`), { code: 'PROVIDER_BLOCKED' }); return structuredClone(reference); });
  return { schema: 'editorial-selected-reference-assets-v1', referenceManifestSha256, selectedReferenceIds: ids, references };
}

function referenceAttestationBindings(selection) {
  return selection.references.map((reference) => ({ id: reference.id, role: reference.role, sha256: reference.admittedAsset?.sha256 || null, bytes: reference.admittedAsset?.bytes ?? null }));
}

function admittedReferenceLockEntries(selection) {
  return selection.references.filter((reference) => reference.admittedAsset).map((reference) => ({ path: reference.admittedAsset.path, sha256: reference.admittedAsset.sha256, bytes: reference.admittedAsset.bytes }));
}

function admittedArtifact(artifact, schema, hashContent, label) {
  if (!isObject(artifact) || artifact.schema !== schema || artifact.approval?.approved !== true || artifact.approval?.status !== 'admitted' || artifact.approval?.sha256 !== hashContent(artifact)) throw Object.assign(new Error(`${label} canonical approval is missing or stale`), { code: 'PROVIDER_BLOCKED' });
  return structuredClone(artifact);
}

export function normalizeTwoStageVideoAuthorities({ storyline, semanticCutPlan, storyboardAdmission, agentVideoDesignPlan, researchSnapshotSha256, scriptSha256, commonMasterAssets, visualAuthoritySha256 }) {
  const normalizedStoryline = admittedArtifact(storyline, STORYLINE_SCHEMA, hashStorylineContent, 'Storyline');
  const exactStorylineAuthorities = { newsSha256: researchSnapshotSha256, scriptSha256, narrationAudioSha256: normalizedStoryline.authorities?.narrationAudioSha256, narrationTimingSha256: normalizedStoryline.authorities?.narrationTimingSha256 };
  if (!SHA256.test(String(exactStorylineAuthorities.narrationAudioSha256 || '')) || !SHA256.test(String(exactStorylineAuthorities.narrationTimingSha256 || '')) || stableStringify(normalizedStoryline.authorities) !== stableStringify(exactStorylineAuthorities)) throw Object.assign(new Error('Storyline does not bind exact news, script, narration audio and timing authorities'), { code: 'PROVIDER_BLOCKED' });
  const normalizedCutPlan = admittedArtifact(semanticCutPlan, SEMANTIC_CUT_PLAN_SCHEMA, hashSemanticCutPlanContent, 'Semantic cut plan');
  const expectedCutAuthorities = { storylineSha256: normalizedStoryline.approval.sha256, newsSha256: researchSnapshotSha256, scriptSha256, narrationAudioSha256: normalizedStoryline.authorities.narrationAudioSha256, narrationTimingSha256: normalizedStoryline.authorities.narrationTimingSha256 };
  if (stableStringify(normalizedCutPlan.authorities) !== stableStringify(expectedCutAuthorities) || !Array.isArray(normalizedCutPlan.cuts) || !normalizedCutPlan.cuts.length || normalizedCutPlan.cuts.some((cut, index) => cut?.cutId !== `cut-${String(index + 1).padStart(3, '0')}` || !Array.isArray(cut.spanBindings) || !isObject(cut.durationIntent))) throw Object.assign(new Error('Semantic cut plan is stale or malformed'), { code: 'PROVIDER_BLOCKED' });
  const normalizedAdmission = admittedArtifact(storyboardAdmission, STORYBOARD_ADMISSION_SCHEMA, hashStoryboardAdmissionContent, 'Storyboard admission');
  const expectedAdmissionAuthorities = { semanticCutPlanSha256: normalizedCutPlan.approval.sha256, storylineSha256: normalizedStoryline.approval.sha256, visualAuthoritySha256 };
  if (stableStringify(normalizedAdmission.authorities) !== stableStringify(expectedAdmissionAuthorities) || !Array.isArray(normalizedAdmission.boards) || normalizedAdmission.boards.length !== normalizedCutPlan.cuts.length) throw Object.assign(new Error('Storyboard admission is stale or incomplete'), { code: 'PROVIDER_BLOCKED' });
  const masters = new Map((commonMasterAssets || []).map((asset) => [asset.masterAssetId, asset])); const boardIds = new Set();
  normalizedAdmission.boards.forEach((board, index) => {
    const characters = board?.provenance?.characterMasters; const rough = board?.provenance?.roughStoryboard;
    if (board?.cutId !== normalizedCutPlan.cuts[index].cutId || board.role !== 'color-storyboard' || board.generationMode !== 'approved-color-storyboard' || !board.storyboardAssetId || boardIds.has(board.storyboardAssetId) || board.approval?.approved !== true || board.approval?.status !== 'admitted' || !SHA256.test(String(board.approval?.sha256 || '')) || !Number.isSafeInteger(board.approval?.bytes) || board.approval.bytes <= 0 || rough?.role !== 'rough-storyboard' || !rough.assetId || !SHA256.test(String(rough.sha256 || '')) || !Number.isSafeInteger(rough.bytes) || rough.bytes <= 0 || !Array.isArray(characters) || characters.length > 3 || new Set(characters.map((item) => item.assetId)).size !== characters.length) throw Object.assign(new Error(`Storyboard admission board ${index + 1} is invalid`), { code: 'PROVIDER_BLOCKED' });
    boardIds.add(board.storyboardAssetId);
    for (const character of characters) { const master = masters.get(character.assetId); if (character.role !== 'character' || !master || master.role !== 'character' || master.approval?.approved !== true || master.approval?.status !== 'admitted' || master.approval.sha256 !== character.sha256 || master.approval.bytes !== character.bytes) throw Object.assign(new Error(`Storyboard admission board ${index + 1} character provenance is stale`), { code: 'PROVIDER_BLOCKED' }); }
  });
  const normalizedDesign = normalizeAgentVideoDesignPlan(agentVideoDesignPlan);
  const projection = normalizedDesign.cuts.map((cut) => ({ cutId: cut.cutId, spanBindings: cut.spanBindings, durationIntent: cut.durationIntent }));
  if (stableStringify(projection) !== stableStringify(normalizedCutPlan.cuts)) throw Object.assign(new Error('Grok-ready design changed the sealed semantic cut plan'), { code: 'PROVIDER_BLOCKED' });
  return { storyline: normalizedStoryline, semanticCutPlan: normalizedCutPlan, storyboardAdmission: normalizedAdmission, agentVideoDesignPlan: normalizedDesign };
}

export function productionAuthorityHash({ slug, title, selectedDraftId = null, sections, researchSnapshot, legalReport, referenceCatalog = [], sceneRecipes = [], commonMasterAssets = [], storyline, semanticCutPlan, storyboardAdmission, agentVideoDesignPlan = undefined, headline, ownerVoiceAuthority, approvedNarrationAuthority = null, visualAuthorityId = PAPER_CUT_PROFILE_ID, productionConfig = productionConfiguration(process.env, { visualAuthorityId }), mediaAssemblyPolicy = undefined }) {
  if (!SAFE_SLUG.test(String(slug || ''))) throw new Error('Invalid newsroom project slug');
  const catalogs = normalizePlannerCatalogs(referenceCatalog, sceneRecipes);
  const twoStage = normalizeTwoStageVideoAuthorities({ storyline, semanticCutPlan, storyboardAdmission, agentVideoDesignPlan, researchSnapshotSha256: hashJson(researchSnapshot), scriptSha256: hashText(finalDraft(sections)), commonMasterAssets, visualAuthoritySha256: productionConfig.editorialCartoonAuthority.templateSha256 });
  return hashJson({
    schema: 'newsroom-production-authority-v2-two-stage',
    slug, title: String(title || ''), selectedDraftId, headline: normalizeApprovedHeadline(headline), ownerVoiceAuthority: normalizeApprovedOwnerVoice(ownerVoiceAuthority, productionConfig), approvedNarrationAuthority: normalizeApprovedNarrationAuthority(approvedNarrationAuthority, { slug, sections, productionConfig }), visualAuthorityId,
    finalDraft: finalDraft(sections),
    researchSnapshotSha256: hashJson(researchSnapshot),
    legalReportSha256: hashJson(legalReport),
    policySha256: hashJson(legalReport?.scriptPolicy || {}),
    referenceCatalog: catalogs,
    commonMasterAssets,
    storyline: twoStage.storyline,
    semanticCutPlan: twoStage.semanticCutPlan,
    storyboardAdmission: twoStage.storyboardAdmission,
    ...(productionConfig.agentVideoDesignWorkflow ? { agentVideoDesignPlan: twoStage.agentVideoDesignPlan } : {}),
    referenceAssetAuthority: inspectReferenceAssetAuthority(slug, catalogs.referenceCatalog),
    productionConfig,
    mediaAssemblyPolicy: normalizeMediaAssemblyPolicy(mediaAssemblyPolicy),
  });
}

export function normalizeApprovedHeadline(headline) {
  if (!isObject(headline) || headline.approved !== true || typeof headline.line1 !== 'string' || typeof headline.line2 !== 'string' || !headline.line1.trim() || !headline.line2.trim()) throw Object.assign(new Error('Approved two-line short headline input is required'), { code: 'PROVIDER_BLOCKED' });
  const unknown = Object.keys(headline).filter((key) => !['schema', 'approved', 'line1', 'line2', 'line1FontSize', 'line2FontSize', 'safeWidth'].includes(key)); if (unknown.length) throw Object.assign(new Error(`Headline contains unknown fields: ${unknown.join(', ')}`), { code: 'PROVIDER_BLOCKED' });
  if ((headline.schema !== undefined && headline.schema !== 'approved-two-line-headline-v1') || (headline.line1FontSize !== undefined && headline.line1FontSize !== 120) || (headline.line2FontSize !== undefined && headline.line2FontSize !== 143) || (headline.safeWidth !== undefined && headline.safeWidth !== 920)) throw Object.assign(new Error('Approved headline canonical geometry drifted'), { code: 'PROVIDER_BLOCKED' });
  const line1 = headline.line1.normalize('NFC').trim(); const line2 = headline.line2.normalize('NFC').trim();
  const widthAt = (text, size) => [...text].reduce((sum, character) => sum + (/[\s]/u.test(character) ? 0.35 : /[\u0000-\u007f]/u.test(character) ? (/[A-Za-z0-9]/u.test(character) ? 0.62 : 0.48) : 1), 0) * size;
  if (line1.length > 80 || line2.length > 80 || widthAt(line1, 120) > 920 || widthAt(line2, 143) > 920) throw Object.assign(new Error('Approved headline must fit the canonical 920px text width at exact 120px/143px sizes'), { code: 'PROVIDER_BLOCKED' });
  return { schema: 'approved-two-line-headline-v1', approved: true, line1, line2, line1FontSize: 120, line2FontSize: 143, safeWidth: 920 };
}

export function normalizeApprovedOwnerVoice(authority, productionConfig) {
  if (!isObject(authority) || authority.approved !== true || authority.profileId !== 'owner-voice-v1' || !SHA256.test(String(authority.profileSha256 || ''))) throw Object.assign(new Error('Explicit owner-voice-v1 approval is required'), { code: 'PROVIDER_BLOCKED' });
  const unknown = Object.keys(authority).filter((key) => !['schema', 'approved', 'profileId', 'profileSha256'].includes(key)); if (unknown.length) throw Object.assign(new Error(`Owner voice authority contains unknown fields: ${unknown.join(', ')}`), { code: 'PROVIDER_BLOCKED' });
  if (authority.schema !== undefined && authority.schema !== 'approved-owner-voice-authority-v1') throw Object.assign(new Error('Owner voice approval schema drifted'), { code: 'PROVIDER_BLOCKED' });
  if (productionConfig.ownerVoiceProfile.profileId !== authority.profileId || productionConfig.ownerVoiceProfile.profileSha256 !== authority.profileSha256) throw Object.assign(new Error('Approved owner voice authority does not match the active validated profile'), { code: 'PROVIDER_BLOCKED' });
  return { schema: 'approved-owner-voice-authority-v1', approved: true, profileId: authority.profileId, profileSha256: authority.profileSha256 };
}

export function normalizeApprovedNarrationAuthority(authority, { slug, sections, productionConfig }) {
  if (authority === null || authority === undefined) return null;
  const scriptSha256 = hashText(finalDraft(sections));
  if (!isObject(authority) || authority.schema !== 'approved-owner-narration-authority-v1' || authority.approved !== true || authority.slug !== slug || !SHA256.test(String(authority.artifactSha256 || '')) || authority.scriptSha256 !== scriptSha256 || authority.ownerVoiceProfileSha256 !== productionConfig.ownerVoiceProfile.profileSha256 || !SHA256.test(String(authority.audioSha256 || '')) || !SHA256.test(String(authority.handoffSha256 || '')) || !SHA256.test(String(authority.providerAcceptanceSha256 || '')) || !SHA256.test(String(authority.sourceProductionAuthorityHash || ''))) throw Object.assign(new Error('Approved narration authority does not match the finalized script and owner voice'), { code: 'PROVIDER_BLOCKED' });
  return structuredClone(authority);
}

export async function enqueueProductionOrchestration(input) {
  const visualAuthorityId = String(input.visualAuthorityId || PAPER_CUT_PROFILE_ID);
  if (visualAuthorityId !== PAPER_CUT_PROFILE_ID) throw Object.assign(new Error(`Only ${PAPER_CUT_PROFILE_ID} may start a new production job; paper-cut-keyframe-v1 is historical deterministic evidence only`), { code: 'PROVIDER_BLOCKED' });
  const productionConfig = productionConfiguration(process.env, { visualAuthorityId });
  const mediaAssemblyPolicy = normalizeMediaAssemblyPolicy(input.mediaAssemblyPolicy);
  const headline = normalizeApprovedHeadline(input.headline);
  const ownerVoiceAuthority = normalizeApprovedOwnerVoice(input.ownerVoiceAuthority, productionConfig);
  const approvedNarrationAuthority = normalizeApprovedNarrationAuthority(input.approvedNarrationAuthority ?? await loadApprovedNarrationAuthority(input.slug), { slug: input.slug, sections: input.sections, productionConfig });
  const plannerCatalogs = normalizePlannerCatalogs(input.referenceCatalog, input.sceneRecipes);
  const referenceAssetAuthority = inspectReferenceAssetAuthority(input.slug, plannerCatalogs.referenceCatalog);
  if (!Array.isArray(input.commonMasterAssets) || input.commonMasterAssets.length > 48 || input.commonMasterAssets.some((asset) => asset?.role !== 'character' || asset.approval?.approved !== true || asset.approval?.status !== 'admitted' || !SHA256.test(String(asset.approval?.sha256 || '')) || !Number.isSafeInteger(asset.approval?.bytes) || asset.approval.bytes <= 0)) throw Object.assign(new Error('Only approved recurring character masters may enter the production authority catalog'), { code: 'PROVIDER_BLOCKED' });
  if (input.storyboardAssets !== undefined) throw Object.assign(new Error('Legacy top-level storyboardAssets is retired; use hash-bound storyboardAdmission after semanticCutPlan'), { code: 'PROVIDER_BLOCKED' });
  const twoStage = normalizeTwoStageVideoAuthorities({ storyline: input.storyline, semanticCutPlan: input.semanticCutPlan, storyboardAdmission: input.storyboardAdmission, agentVideoDesignPlan: input.agentVideoDesignPlan, researchSnapshotSha256: hashJson(input.researchSnapshot), scriptSha256: hashText(finalDraft(input.sections)), commonMasterAssets: input.commonMasterAssets, visualAuthoritySha256: productionConfig.editorialCartoonAuthority.templateSha256 });
  const authorityHash = productionAuthorityHash({ ...input, ...twoStage, approvedNarrationAuthority, visualAuthorityId, ...plannerCatalogs, productionConfig, mediaAssemblyPolicy });
  const jobId = `production-${authorityHash.slice(0, 40)}`;
  const dir = jobDir(jobId);
  const statusPath = path.join(dir, 'status.json');
  const requestPath = path.join(dir, 'request.json');
  try {
    const [status, request] = await Promise.all([readJson(statusPath), readJson(requestPath)]);
    if (status.authorityHash !== authorityHash || request.authorityHash !== authorityHash || request.jobId !== jobId) throw new Error('Existing production job authority hash mismatch');
    return { jobId, authorityHash, state: status.state, stage: status.stage, shouldLaunch: status.state === 'queued' ? status.launchCommitted !== true : !['running', 'completed'].includes(status.state), approvedNarrationAuthority };
  } catch (error) {
    if (!(error && error.code === 'ENOENT') && !(error instanceof SyntaxError)) throw error;
  }
  await fsp.mkdir(dir, { recursive: true });
  const initializationLock = path.join(dir, 'initialize.lock');
  let initializer = null;
  for (let attempt = 0; attempt < 3 && !initializer; attempt += 1) {
    try {
      initializer = await fsp.open(initializationLock, 'wx');
      await initializer.writeFile(jsonText({ pid: process.pid, authorityHash, expiresAt: new Date(Date.now() + LEASE_MS).toISOString() }));
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      for (let wait = 0; wait < 20; wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        try {
          const [status, request] = await Promise.all([readJson(statusPath), readJson(requestPath)]);
          if (status.authorityHash !== authorityHash || request.authorityHash !== authorityHash || request.jobId !== jobId) throw new Error('Concurrent production initialization authority mismatch');
          return { jobId, authorityHash, state: status.state, stage: status.stage, shouldLaunch: status.state === 'queued' && status.launchCommitted !== true, approvedNarrationAuthority };
        } catch (readError) { if (readError?.code !== 'ENOENT' && !(readError instanceof SyntaxError)) throw readError; }
      }
      await removeStaleLease(initializationLock, authorityHash);
    }
  }
  if (!initializer) throw new Error('Production job initialization is already in progress');
  try {
  const dossier = isObject(input.researchSnapshot?.eventDossier) ? input.researchSnapshot.eventDossier : null;
  if (!dossier) throw new Error('Current research snapshot has no event dossier');
  const createdAt = new Date().toISOString();
  const authorityDir = path.join(dir, 'authority');
  const script = { schemaVersion: 1, slug: input.slug, status: 'final', finalizedAt: createdAt, draft: finalDraft(input.sections), sections: input.sections };
  await fsp.mkdir(authorityDir, { recursive: true });
  await Promise.all([
    writeAtomic(path.join(authorityDir, 'research.json'), jsonText(input.researchSnapshot)),
    writeAtomic(path.join(authorityDir, 'event-dossier.json'), jsonText(dossier)),
    writeAtomic(path.join(authorityDir, 'legal-report.json'), jsonText(input.legalReport)),
    writeAtomic(path.join(authorityDir, 'script.final.json'), jsonText(script)),
  ]);
  const request = {
    schema: 'newsroom-production-request-v2-two-stage', jobId, authorityHash, slug: input.slug,
    title: `${headline.line1} ${headline.line2}`, storyTitle: String(input.title || ''), headline, ownerVoiceAuthority, approvedNarrationAuthority, visualAuthorityId, mediaAssemblyPolicy, selectedDraftId: typeof input.selectedDraftId === 'string' ? input.selectedDraftId : null, createdAt, productionConfig, ...plannerCatalogs, researchSnapshotSha256: hashJson(input.researchSnapshot), commonMasterAssets: structuredClone(input.commonMasterAssets), storyline: twoStage.storyline, semanticCutPlan: twoStage.semanticCutPlan, storyboardAdmission: twoStage.storyboardAdmission, agentVideoDesignPlan: twoStage.agentVideoDesignPlan, referenceAssetAuthority,
    authorityRoot: 'authority',
  };
  const status = {
    schema: 'newsroom-production-status-v1', jobId, authorityHash, slug: input.slug,
    state: 'queued', stage: 'finalized', progress: 2, createdAt, updatedAt: createdAt, launchCommitted: false,
    privateOnly: true, uploadBlocked: true, registryMutationBlocked: true,
    checkpoints: {
      finalized: { state: 'completed', inputSha256: authorityHash, outputSha256: hashJson(script), startedAt: createdAt, completedAt: createdAt, resumable: true },
    },
  };
  // Request is the authority record. Publish it durably before making the job
  // visible through status.json; waiters validate both files.
  await writeAtomic(requestPath, jsonText(request));
  await writeAtomic(statusPath, jsonText(status));
    return { jobId, authorityHash, state: 'queued', stage: 'finalized', shouldLaunch: true, approvedNarrationAuthority };
  } finally {
    await initializer.close().catch(() => {});
    await fsp.rm(initializationLock, { force: true }).catch(() => {});
  }
}

function sanitizeError(error) {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replaceAll(AUTOMATION_ROOT, '<workspace>').replace(/[A-Za-z]:\\[^\r\n"']+/gu, '<local-path>');
  message = message.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/giu, '$1=<redacted>');
  return message.slice(0, 1200);
}

async function patchStatus(jobId, patch) {
  const file = path.join(jobDir(jobId), 'status.json');
  const current = await readJson(file);
  const next = { ...current, ...patch, jobId, updatedAt: new Date().toISOString() };
  await writeAtomic(file, jsonText(next));
  return next;
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

async function removeStaleLease(file, authorityHash) {
  let lease = null;
  try { lease = await readJson(file); } catch {}
  const active = lease?.authorityHash === authorityHash && Date.parse(String(lease.expiresAt || '')) > Date.now() && isProcessAlive(Number(lease.pid));
  if (active) return false;
  await fsp.rm(file, { force: true });
  return true;
}

export async function claimProductionLaunch(jobId, authorityHash, { now = Date.now(), leaseMs = LEASE_MS, pid = process.pid } = {}) {
  if (!SHA256.test(authorityHash || '')) throw new Error('Invalid production authority hash');
  const dir = jobDir(jobId); const statusPath = path.join(dir, 'status.json');
  const status = await readJson(statusPath);
  if (status.authorityHash !== authorityHash) throw new Error('Production launch authority mismatch');
  if (status.state === 'completed') return { claimed: false, reason: status.state };
  // A POST resume is an explicit administrator/user action. It may re-check a
  // previously terminal prerequisite after that prerequisite has been fixed;
  // authority and workflow binding are still verified before this function.
  if (!['queued', 'blocked', 'failed', 'running'].includes(status.state)) return { claimed: false, reason: String(status.state || 'invalid-state') };
  if (status.state === 'running') {
    const worker = isObject(status.worker) ? status.worker : {};
    // A live worker PID owns the job even if a long provider/render call crosses
    // a prior timestamp. Periodic heartbeat renewal keeps its lease observable;
    // PID liveness prevents duplicate production during a slow child process.
    if (isProcessAlive(Number(worker.pid))) return { claimed: false, reason: 'running' };
  }
  const leasePath = path.join(dir, 'resume-lease.json');
  const lease = { schema: 'newsroom-production-launch-lease-v1', jobId, authorityHash, pid, claimedAt: new Date(now).toISOString(), expiresAt: new Date(now + leaseMs).toISOString(), leaseId: crypto.randomUUID() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fsp.open(leasePath, 'wx');
      try { await handle.writeFile(jsonText(lease)); } finally { await handle.close(); }
      await patchStatus(jobId, { launchCommitted: true, launchLease: { leaseId: lease.leaseId, claimedAt: lease.claimedAt, expiresAt: lease.expiresAt } });
      return { claimed: true, leaseId: lease.leaseId, expiresAt: lease.expiresAt };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (!(await removeStaleLease(leasePath, authorityHash))) return { claimed: false, reason: 'active-lease' };
    }
  }
  return { claimed: false, reason: 'lease-contention' };
}

export async function releaseProductionLaunch(jobId, leaseId) {
  const file = path.join(jobDir(jobId), 'resume-lease.json');
  try {
    const lease = await readJson(file);
    if (lease.leaseId === leaseId) await fsp.rm(file, { force: true });
  } catch {}
}

async function acquireOrchestrationLock(dir, authorityHash) {
  const lockPath = path.join(dir, 'orchestration.lock');
  const workerId = crypto.randomUUID();
  const lockRecord = { schema: 'newsroom-production-worker-lock-v1', workerId, pid: process.pid, authorityHash, acquiredAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), expiresAt: new Date(Date.now() + WORKER_LEASE_MS).toISOString() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fsp.open(lockPath, 'wx');
      try { await handle.writeFile(jsonText(lockRecord)); } finally { await handle.close(); }
      return { lockPath, workerId };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (!(await removeStaleLease(lockPath, authorityHash))) return null;
    }
  }
  return null;
}

async function heartbeatWorker(jobId) {
  const worker = activeWorkers.get(jobId);
  if (!worker) return;
  const currentLock = await readJson(worker.lockPath);
  if (currentLock.workerId !== worker.workerId || currentLock.authorityHash !== worker.authorityHash) throw Object.assign(new Error('Production worker lease was superseded'), { code: 'WORKER_LEASE_LOST' });
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + WORKER_LEASE_MS).toISOString();
  const record = { schema: 'newsroom-production-worker-lock-v1', workerId: worker.workerId, pid: process.pid, authorityHash: worker.authorityHash, acquiredAt: worker.acquiredAt, heartbeatAt: now, expiresAt: leaseExpiresAt };
  await writeAtomic(worker.lockPath, jsonText(record));
  await patchStatus(jobId, { worker: { pid: process.pid, heartbeatAt: now, leaseExpiresAt } });
}

function splitSentences(draft) {
  const sentences = [];
  for (const line of draft.split('\n')) {
    const matches = line.match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
    for (const match of matches) {
      const sentence = match.trim();
      if (sentence) sentences.push(sentence);
    }
  }
  if (!sentences.length) throw new Error('Final script has no mappable sentences');
  if (new Set(sentences).size !== sentences.length) throw new Error('Final script contains duplicate sentences; exact evidence anchors are ambiguous');
  return sentences;
}

function tokens(value) {
  const koreanParticle = /(?:이라면|라면|에서는|에게서|으로|까지|부터|처럼|보다|마다|조차|마저|밖에|뿐|에서|에게|한테|에는|의|은|는|이|가|을|를|에|도|만|와|과|로)$/u;
  return new Set(normalize(value).split(' ').map((item) => {
    let token = item;
    for (let pass = 0; pass < 2; pass += 1) token = token.replace(koreanParticle, '');
    return token;
  }).filter((item) => item.length >= 2));
}

export function evidenceLexicalScore(sentence, claim) {
  const left = normalize(sentence);
  const right = normalize(claim.summary);
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 1;
  const a = tokens(left); const b = tokens(right);
  const common = [...a].filter((item) => b.has(item));
  const jaccard = common.length / Math.max(1, new Set([...a, ...b]).size);
  const longAnchor = [...a].filter((item) => item.length >= 4 && right.includes(item)).length;
  const compact = (value) => normalize(value).replaceAll(' ', '');
  const grams = (value) => {
    const body = compact(value); const out = new Set();
    for (let index = 0; index <= body.length - 3; index += 1) out.add(body.slice(index, index + 3));
    return out;
  };
  const ga = grams(left); const gb = grams(right);
  const gramCommon = [...ga].filter((item) => gb.has(item)).length;
  const dice = (2 * gramCommon) / Math.max(1, ga.size + gb.size);
  const compactLeft = compact(left); const compactRight = compact(right);
  const prior = new Array(compactRight.length + 1).fill(0); let longestPhrase = 0;
  for (let leftIndex = 1; leftIndex <= compactLeft.length; leftIndex += 1) {
    let diagonal = 0;
    for (let rightIndex = 1; rightIndex <= compactRight.length; rightIndex += 1) {
      const saved = prior[rightIndex];
      prior[rightIndex] = compactLeft[leftIndex - 1] === compactRight[rightIndex - 1] ? diagonal + 1 : 0;
      longestPhrase = Math.max(longestPhrase, prior[rightIndex]);
      diagonal = saved;
    }
  }
  const phraseBoost = longestPhrase >= 4 ? Math.min(0.3, (longestPhrase - 3) * 0.06) : 0;
  return Math.max(jaccard + Math.min(0.4, longAnchor * 0.1), dice) + phraseBoost;
}

function editorialQuestionEvidence(sentence, claims) {
  if (!/[?？]$/u.test(sentence)) return null;
  // A closing question may be an editorial inference, but its factual premise
  // still has to map uniquely to an allowed claim. Prefer the premise before
  // the first comma so the generic trust/responsibility question does not
  // dilute the concrete event anchor.
  const premise = sentence.split(/[,，]/u)[0].trim();
  const ranked = claims.map((claim) => ({ claim, score: evidenceLexicalScore(premise, claim) }))
    .sort((a, b) => b.score - a.score || a.claim.claimId.localeCompare(b.claim.claimId));
  const best = ranked[0]; const second = ranked[1];
  if (!best || best.score < 0.12) return null;
  if (second && best.score - second.score < 0.02 && best.score < 0.75) throw new Error('Editorial question has an ambiguous evidence premise');
  return { ...best, evidenceClass: 'inference' };
}

function ruleApplies(rule, claimIds, sentence) {
  if (rule.global) return true;
  if (rule.claimIds.some((id) => claimIds.includes(id))) return true;
  const normalizedSentence = normalize(sentence);
  return rule.triggers.some((trigger) => normalizedSentence.includes(normalize(trigger)));
}

// A contextual bridge is admissible only when it explicitly describes a delayed
// discovery/confirmation and the immediately following direct claim independently
// carries the same temporal/review anchor.  This is deliberately narrow: generic
// discourse bridges must remain ambiguous rather than inheriting nearby claims.
const DELAYED_BRIDGE_TRIGGERS = [
  { id: 'ko-immediate-discovery-negated', pattern: /(?:곧바로|즉시).{0,24}(?:드러나|확인|밝혀).{0,24}(?:아니|않)/u },
  { id: 'ko-late-discovery', pattern: /뒤늦게.{0,24}(?:드러나|확인|밝혀|발견)?/u },
  { id: 'en-immediate-discovery-negated', pattern: /\bnot\s+immediately\b.{0,60}(?:reveal|discover|confirm|find|surface)/iu },
  { id: 'en-late-discovery', pattern: /\b(?:later|eventually)\b.{0,60}(?:reveal|discover|confirm|find|surface)/iu },
  { id: 'en-not-until-discovery', pattern: /\bnot\s+until\b.{0,60}(?:reveal|discover|confirm|find|surface)/iu },
];
const DELAYED_DISCOVERY_ANCHORS = [
  { id: 'ko-late-anchor', pattern: /뒤늦/u },
  { id: 'ko-review-anchor', pattern: /전수\s*조사/u },
  { id: 'ko-only-then-anchor', pattern: /에서야\s*(?:드러|확인|밝혀)/u },
  { id: 'ko-review-discovery-anchor', pattern: /(?:조사|수사|검토).{0,24}(?:드러|확인|밝혀|발견)/u },
  { id: 'en-later-anchor', pattern: /\b(?:later|eventually)\b.{0,40}(?:discover|reveal|confirm|find|surface)/iu },
  { id: 'en-not-until-anchor', pattern: /\bnot\s+until\b.{0,40}(?:discover|reveal|confirm|find|surface)/iu },
  { id: 'en-review-anchor', pattern: /\b(?:review|investigation|inquiry)\b.{0,40}(?:discover|reveal|confirm|find|surface)/iu },
];

function bridgeNeutrality(sentence) {
  if (/[0-9]|["'“”‘’「」『』]/u.test(sentence)) return false;
  // Strip only discourse/pronoun and delayed-discovery morphology. Any residue
  // (for example a new named person/place) makes the bridge ineligible.
  const residue = normalize(sentence)
    .replace(/\b(?:but|however|yet|the|this|that|it|was|were|is|are|not|until|immediately|later|eventually|revealed|discovered|confirmed|found|surfaced|only|after|then)\b/giu, '')
    .replace(/(?:그런데|하지만|그러나|다만|이|그|저|일은|일이|일|것은|것이|것|사실은|사실|상황은|상황이|상황|내용은|내용이|내용|곧바로|즉시|뒤늦게|나중에|드러난|드러나지|드러나|확인된|확인되지|확인|밝혀진|밝혀지지|밝혀|발견된|발견|아니었습니다|아니었다|않았습니다|않았다|않고|않|게|에서야|에서|후|뒤|곧|때|다음에|then|only|after)/gu, '')
    .replace(/\s+/gu, '');
  return residue.length === 0;
}

function delayedBridgeResolution(sentence, nextSentence, nextClaim) {
  const trigger = DELAYED_BRIDGE_TRIGGERS.find((item) => item.pattern.test(sentence));
  if (!trigger || !bridgeNeutrality(sentence)) return null;
  const nextText = `${nextSentence} ${nextClaim?.summary || ''}`;
  const anchor = DELAYED_DISCOVERY_ANCHORS.find((item) => item.pattern.test(nextText));
  if (!anchor) return null;
  return { triggerId: trigger.id, matchedSemanticTrigger: trigger.pattern.source, anchorId: anchor.id, matchedAnchor: anchor.pattern.source };
}

export function buildAutomaticScriptSpans({ script, legalReport, eventDossier }) {
  const draft = typeof script === 'string' ? script : String(script?.draft || '');
  const { claims, legal } = deriveEvidenceContext({ legalReport, eventDossier });
  if (!claims.length) throw new Error('Evidence bundle has no verified claims');
  const knownClaimIds = new Set(claims.map((claim) => claim.claimId));
  const allowedClaimIds = new Set(legal.allowedClaims.filter((item) => knownClaimIds.has(item)));
  if (allowedClaimIds.size === 0) throw new Error('legal.allowedClaims must explicitly authorize at least one known claim');
  for (const prohibited of [...legal.prohibitedPhrases, ...legal.prohibitedClaims.filter((item) => !knownClaimIds.has(item))]) {
    if (normalize(draft).includes(normalize(prohibited))) throw new Error(`Final script contains prohibited text: ${prohibited}`);
  }
  const prohibitedClaimIds = new Set(legal.prohibitedClaims.filter((item) => knownClaimIds.has(item)));
  const sentences = splitSentences(draft);
  const rankedBySentence = sentences.map((sentence) => claims.map((claim) => ({ claim, score: evidenceLexicalScore(sentence, claim) })).sort((a, b) => b.score - a.score || a.claim.claimId.localeCompare(b.claim.claimId)));
  const factualSignal = /\d|법원|검찰|피고인|피해자|[A-Z]씨|징역|집행유예|판결|선고|항소|혐의|재판|범행|증상|주장/iu;
  const directMappings = rankedBySentence.map((ranked, index) => {
    const questionMapping = editorialQuestionEvidence(sentences[index], claims);
    if (questionMapping) return questionMapping;
    const best = ranked[0];
    if (best && best.score >= 0.12 && !(ranked[1] && Math.abs(best.score - ranked[1].score) < 0.02 && best.score < 0.75)) return best;
    if (factualSignal.test(sentences[index])) {
      if (best?.score >= 0.12) throw new Error(`Sentence ${index + 1} has an ambiguous evidence mapping`);
      throw new Error(`Sentence ${index + 1} has no unambiguous evidence mapping`);
    }
    return null;
  });
  return sentences.map((sentence, index) => {
    let best = directMappings[index];
    let contextual = false;
    let contextualEvidence = null;
    if (!best) {
      const next = directMappings[index + 1];
      const forward = next ? delayedBridgeResolution(sentence, sentences[index + 1], next.claim) : null;
      if (forward) {
        best = next;
        contextual = true;
        contextualEvidence = { mode: 'contextual-forward-qualified', ...forward, previousContextClaimId: directMappings[index - 1]?.claim?.claimId || null };
      }
    }
    if (!best) {
      contextual = true;
      for (let distance = 1; distance < sentences.length; distance += 1) {
        const before = directMappings[index - distance]; const after = directMappings[index + distance];
        if (before && after && before.claim.claimId !== after.claim.claimId) throw new Error(`Sentence ${index + 1} has ambiguous contextual evidence`);
        best = before || after;
        if (best) break;
      }
      if (!best) throw new Error(`Sentence ${index + 1} has no contextual evidence anchor`);
    }
    const claimIds = [best.claim.claimId];
    if (claimIds.some((id) => !allowedClaimIds.has(id))) throw new Error(`Sentence ${index + 1} maps outside legal allowedClaims`);
    if (claimIds.some((id) => prohibitedClaimIds.has(id))) throw new Error(`Sentence ${index + 1} maps to a prohibited claim`);
    const qualificationIds = legal.requiredQualifications.filter((rule) => ruleApplies(rule, claimIds, sentence)).map((rule) => {
      if (!normalize(sentence).includes(normalize(rule.text))) throw new Error(`Sentence ${index + 1} is missing required qualification ${rule.id}`);
      return rule.id;
    }).sort();
    const identityRestrictionIds = legal.identityRestrictions.filter((rule) => ruleApplies(rule, claimIds, sentence)).map((rule) => rule.id).sort();
    const footageRestrictionIds = legal.footageRestrictions.filter((rule) => ruleApplies(rule, claimIds, sentence)).map((rule) => rule.id).sort();
    return {
      spanId: `span-${String(index + 1).padStart(3, '0')}`, scene: index + 1,
      captionAnchor: sentence, excerpt: sentence, claimIds,
      evidenceClass: contextualEvidence ? 'contextual' : (contextual ? 'contextual' : (best.evidenceClass || (['confirmed', 'verified', 'authoritative'].includes(String(best.claim.status).toLocaleLowerCase()) ? 'direct' : 'reported'))),
      ...(contextualEvidence ? { contextualEvidence } : {}),
      qualificationIds,
      legalConstraintIds: [...identityRestrictionIds, ...footageRestrictionIds].sort(),
      mediaDecision: null,
      mediaConstraints: { identityRestrictionIds, footageRestrictionIds },
    };
  });
}

export function buildVideoDesign({ plannerOutput, plannerInput, plannerProvenance, request, script, bundleFileSha }) {
  void plannerOutput; void plannerInput; void plannerProvenance; void request; void script; void bundleFileSha;
  throw Object.assign(new Error('Legacy buildVideoDesign entrypoint is retired; use the two-stage primary-agent artifact compiler'), { code: 'CODEX_ADMIN_BLOCKED' });
}

export function buildPlan({ request, script, bundleFileSha, videoDesign, videoDesignSerializedSha256 = null }) {
  const storyboardCatalogIds = new Set((Array.isArray(videoDesign?.storyboardAssets) ? videoDesign.storyboardAssets : []).map((asset) => asset?.storyboardAssetId));
  if (videoDesign?.schema !== 'video-design-v7-two-stage-color-storyboard' || videoDesign.contractRevision !== ACTIVE_CONTRACT_REVISION || videoDesign.visualAuthorityId !== PAPER_CUT_PROFILE_ID || !videoDesign.authorship || videoDesign.storyline?.schema !== STORYLINE_SCHEMA || videoDesign.semanticCutPlan?.schema !== SEMANTIC_CUT_PLAN_SCHEMA || videoDesign.storyboardAdmission?.schema !== STORYBOARD_ADMISSION_SCHEMA || !Array.isArray(videoDesign.scenes) || !Array.isArray(videoDesign.storyboardAssets) || videoDesign.storyboardAssets.length !== videoDesign.scenes.length || storyboardCatalogIds.size !== videoDesign.storyboardAssets.length || !videoDesign.storyboardAssets.length || videoDesign.storyboardAssets.some((asset) => asset.role !== 'color-storyboard' || asset.generationMode !== 'approved-color-storyboard' || !asset.provenance?.roughStoryboard || asset.provenance.roughStoryboard.output !== `assets/roughs/${asset.provenance.roughStoryboard.assetId}.png` || !Array.isArray(asset.provenance?.characterMasters) || asset.provenance.characterMasters.length > 3 || new Set(asset.provenance.characterMasters.map((item) => item.assetId)).size !== asset.provenance.characterMasters.length || !asset.storyboardAssetId || !SHA256.test(String(asset.approval?.sha256 || '')) || asset.approval?.approved !== true || asset.approval?.status !== 'admitted' || !Number.isSafeInteger(asset.approval?.bytes) || asset.approval.bytes <= 0 || asset.output !== `assets/storyboards/${asset.storyboardAssetId}.png` || asset.outputSha256 !== asset.approval.sha256)) throw Object.assign(new Error('migration-required: editorial plan has no verified two-stage color-storyboard Grok authority'), { code: 'CODEX_ADMIN_BLOCKED' });
  const scenes = videoDesign.scenes; const videoDesignSha256 = videoDesignSerializedSha256 || sha256(Buffer.from(jsonText(videoDesign), 'utf8'));
  if (!SHA256.test(String(videoDesignSha256)) || videoDesignSha256 !== sha256(Buffer.from(jsonText(videoDesign), 'utf8'))) throw new Error('Serialized video-design artifact hash mismatch');
  const designInputSha256 = videoDesign.authorship?.inputSha256 || videoDesign.planner?.inputSha256; const designPlanSha256 = videoDesign.authorship?.planSha256 || videoDesign.planner?.outputSha256;
  return {
    schema: 'editorial-video-plan-v2', generationPolicy: 'plan-and-verify-before-generation', authorityHash: request.authorityHash,
    scriptSha256: hashText(script.draft), evidenceBundleSha256: bundleFileSha,
    globalVisualContinuity: { style: request.productionConfig.editorialCartoonAuthority.style.description, styleAuthoritySha256: request.productionConfig.editorialCartoonAuthority.templateSha256, aspectRatio: '1:1-source-in-9:16-canvas', camera: 'grok-multi-reference-semantic-trim', identityContinuity: 'script-derived recurring roles, wardrobe, story props and locations with blank unprinted paper facial areas', firstGeneratedFrameIsStyleSeed: false, disclosure: 'AI reconstruction based on verified reporting' },
    videoDesign, videoDesignSha256, designInputSha256, designPlanSha256,
    animationPolicy: 'grok-storyboard-first-semantic-qa-trim-v1', transitionPolicy: 'compiled-enum-only-v1', scenes,
    assetPlan: { schema: 'editorial-asset-plan-v5-grok-storyboard-first', generationPolicy: 'plan-required-before-generation', scriptSha256: hashText(script.draft), evidenceBundleSha256: bundleFileSha, videoDesignSha256, storyboardAssets: structuredClone(videoDesign.storyboardAssets), scenes: scenes.map((scene) => ({ scene: scene.scene, durationSeconds: scene.durationSeconds, durationIntent: structuredClone(scene.durationIntent || null), classification: scene.grokSceneClass, colorStoryboardReference: structuredClone(scene.grokI2v?.referenceImages?.[0] || null), animation: structuredClone(scene.animation), shotDesign: structuredClone(scene.shotDesign), evidenceBasis: scene.excerpt, claimIds: scene.claimIds, evidenceClass: scene.evidenceClass, referenceRoles: scene.referenceRoles, sceneEvidence: structuredClone(scene.sceneEvidence) })) },
  };
}

export function verifyEditorialVideoPlan(plan, { authorityHash, script, bundle, bundleFileSha }) {
  if (plan?.schema !== 'editorial-video-plan-v2' || plan.generationPolicy !== 'plan-and-verify-before-generation') throw new Error('Editorial video plan schema is invalid');
  if (plan.authorityHash !== authorityHash || plan.scriptSha256 !== hashText(script.draft) || plan.evidenceBundleSha256 !== bundleFileSha) throw new Error('Editorial video plan authority is stale');
  if (!Array.isArray(plan.scenes) || plan.scenes.length !== plan.videoDesign?.totalCuts || plan.videoDesignSha256 !== sha256(Buffer.from(jsonText(plan.videoDesign), 'utf8')) || !SHA256.test(String(plan.designInputSha256 || '')) || !SHA256.test(String(plan.designPlanSha256 || ''))) throw new Error('Editorial video plan design authorship authority mismatch');
  if (!SHA256.test(String(plan.videoDesign?.narrationAuthority?.audioSha256 || '')) || !SHA256.test(String(plan.videoDesign?.narrationAuthority?.timingSha256 || '')) || !(plan.videoDesign?.narrationAuthority?.durationSeconds > 0)) throw new Error('Editorial video plan is not bound to final narration timing');
  if (stableStringify(plan.scenes) !== stableStringify(plan.videoDesign.scenes)) throw new Error('Editorial video plan top-level scenes drifted from the hash-bound video design');
  if (plan.animationPolicy !== 'grok-storyboard-first-semantic-qa-trim-v1') throw new Error('Editorial video plan animation policy drifted');
  const storyboardCatalog = new Map((plan.videoDesign.storyboardAssets || []).map((asset) => [asset.storyboardAssetId, asset])); const storyboardIds = new Set();
  plan.scenes.forEach((scene, index) => {
    if (scene.scene !== index + 1 || scene.cutId !== plan.videoDesign.semanticCutPlan.cuts[index]?.cutId || stableStringify(scene.spanBindings) !== stableStringify(plan.videoDesign.semanticCutPlan.cuts[index]?.spanBindings) || stableStringify(scene.durationIntent) !== stableStringify(plan.videoDesign.semanticCutPlan.cuts[index]?.durationIntent) || !Array.isArray(scene.spanBindings) || scene.claimIds.some((id) => !bundle.claims.some((claim) => claim.claimId === id))) throw new Error(`Editorial video plan scene ${index + 1} evidence/cut-plan mapping mismatch`);
    if (!MOTION_DOCUMENTARY_SCENE_ROLES.includes(scene.sceneRole) || !MOTION_DOCUMENTARY_SOURCE_KINDS.includes(scene.sourceKind) || !MOTION_DOCUMENTARY_EVIDENCE_STATUSES.includes(scene.evidenceStatus) || !scene.narrationDelta || !scene.visualInformationAdded || !scene.privacy || !scene.stateChange || scene.stateChange.startState === scene.stateChange.endState || scene.disclosure?.required !== true || !(scene.narrationTiming?.endSeconds > scene.narrationTiming?.startSeconds)) throw new Error(`Editorial video plan scene ${index + 1} motion-documentary contract mismatch`);
    const transitionFrames = { 'hard-cut': 0, 'dip-to-black': 6, 'slide-left': 8 }; const refs = scene.grokI2v?.referenceImages; const storyboard = refs?.[0]; const storyboardMeta = storyboardCatalog.get(storyboard?.assetId); const provenanceCount = storyboardMeta?.provenance?.characterMasters?.length; const clip = scene.grokI2v?.clipSelection; if (transitionFrames[scene.ffmpegBoundary?.transition] !== scene.ffmpegBoundary?.durationFrames || scene.renderMode !== 'image_to_video_animation' || scene.motionGraphics !== null || !scene.grokI2v || scene.grokI2v.inputMode !== 'approved-color-storyboard-only-v1' || !Array.isArray(refs) || refs.length !== 1 || storyboard?.role !== 'color-storyboard' || storyboard?.generationMode !== 'approved-color-storyboard' || !storyboardMeta || storyboardMeta.approval?.approved !== true || storyboardMeta.approval?.status !== 'admitted' || storyboardMeta.output !== `assets/storyboards/${storyboard.assetId}.png` || storyboardIds.has(storyboard.assetId) || scene.grokI2v.durationSeconds !== 6 || scene.grokI2v.sourceAcceptance?.requireSquare !== true || scene.grokI2v.sourceAcceptance?.minimumEdge !== 480 || scene.grokI2v.sourceAcceptance?.durationToleranceSeconds !== 0.1 || scene.grokI2v.normalization?.preserveSourceBytes !== true || scene.grokI2v.normalization?.width !== 480 || scene.grokI2v.normalization?.height !== 480 || scene.grokI2v.normalization?.fps !== 24 || scene.grokI2v.normalization?.scaleFilter !== 'lanczos' || clip?.mode !== 'semantic-qa-selected-window-v2-authored-duration-bound' || clip?.authoredDurationSeconds !== scene.durationSeconds || clip?.durationToleranceSeconds !== 0.05 || Math.abs(clip.minimumSeconds - (scene.durationSeconds - 0.05)) > 1e-6 || Math.abs(clip.maximumSeconds - (scene.durationSeconds + 0.05)) > 1e-6 || !scene.imageGen || scene.imageGen.referencePack?.[0]?.role !== 'color-storyboard' || scene.imageGen.referencePack?.length !== 1 || (scene.grokSceneClass === 'human-action' ? !(provenanceCount > 0) : provenanceCount !== 0) || scene.imageGen?.sceneDirectionSpec?.references?.length || scene.imageGen?.sceneDirectionSpec?.reference_ids?.length || !scene.animation || !scene.shotDesign || !Number.isFinite(scene.durationSeconds)) throw new Error(`Editorial video plan scene ${index + 1} violates color-storyboard-only Grok contract`); storyboardIds.add(storyboard.assetId);
  });
  if (storyboardIds.size !== plan.videoDesign.storyboardAssets.length || plan.videoDesign.storyboardAssets.some((asset) => !storyboardIds.has(asset.storyboardAssetId))) throw new Error('Editorial video plan storyboard catalog is not assigned uniquely to every cut');
  const timeline = plan.scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0); const narrationDuration = Number(plan.videoDesign.narrationAuthority.durationSeconds); if (timeline < narrationDuration || timeline - narrationDuration >= 1.001) throw new Error('Paper keyframe timeline does not tightly cover the locked narration');
  return true;
}

export function verifyCompletedCheckpointBinding({ stage, prior, inputSha256, outputExists, outputSha256 }) {
  if (prior?.state !== 'completed') return false;
  if (prior.inputSha256 !== inputSha256) throw Object.assign(new Error(`${stage} completed checkpoint input authority mismatch`), { code: 'PROVIDER_BLOCKED' });
  if (!outputExists || outputSha256 !== prior.outputSha256) throw Object.assign(new Error(`${stage} completed checkpoint artifact hash mismatch`), { code: 'PROVIDER_BLOCKED' });
  return true;
}

export function buildDeferredTerminalCheckpointInputs({ authorityHash, scriptSha256, evidenceBundleSha256, videoDesignSha256, narrationAuthority, storyPlanSha256, visualTreatmentSha256, animaticPlanSha256, mediaAssemblyPolicy }) {
  for (const [value, label] of [[authorityHash, 'authority'], [scriptSha256, 'script'], [evidenceBundleSha256, 'evidence bundle'], [videoDesignSha256, 'video design'], [storyPlanSha256, 'story plan'], [visualTreatmentSha256, 'visual treatment'], [animaticPlanSha256, 'animatic plan'], [narrationAuthority?.audioSha256, 'narration audio'], [narrationAuthority?.timingSha256, 'narration timing']]) if (!SHA256.test(String(value || ''))) throw new Error(`Deferred terminal ${label} hash is invalid`);
  return {
    editorial_story_plan: hashJson({ authorityHash, script: scriptSha256, evidence: evidenceBundleSha256, videoDesign: videoDesignSha256, narrationAudio: narrationAuthority.audioSha256, narrationTiming: narrationAuthority.timingSha256 }),
    visual_treatment: hashJson({ authorityHash, storyPlan: storyPlanSha256, videoDesign: videoDesignSha256 }),
    animatic_plan: hashJson({ authorityHash, storyPlan: storyPlanSha256, visualTreatment: visualTreatmentSha256, narrationAudio: narrationAuthority.audioSha256, narrationTiming: narrationAuthority.timingSha256 }),
    assembly_ready: hashJson({ authorityHash, storyPlan: storyPlanSha256, visualTreatment: visualTreatmentSha256, animaticPlan: animaticPlanSha256, mediaAssemblyPolicy }),
  };
}

export function verifyDeferredTerminalCheckpointInputs(checkpoints, expectedInputs) {
  for (const [stage, expected] of Object.entries(expectedInputs)) if (checkpoints?.[stage]?.state !== 'completed' || checkpoints[stage].inputSha256 !== expected) throw Object.assign(new Error(`Completed ${stage} checkpoint input authority is stale or tampered`), { code: 'PROVIDER_BLOCKED' });
  return true;
}

async function completeCheckpoint(jobId, stage, inputSha256, outputFile, work) {
  await heartbeatWorker(jobId);
  const status = await readJson(path.join(jobDir(jobId), 'status.json'));
  const prior = status.checkpoints?.[stage];
  if (prior?.state === 'completed') {
    verifyCompletedCheckpointBinding({ stage, prior, inputSha256, outputExists: Boolean(outputFile && fs.existsSync(outputFile)), outputSha256: outputFile && fs.existsSync(outputFile) ? hashFile(outputFile) : null });
    return readJson(outputFile);
  }
  const startedAt = new Date().toISOString();
  const stageIndex = Math.max(0, STAGES.indexOf(stage));
  await patchStatus(jobId, { state: 'running', stage, progress: Math.min(96, 5 + stageIndex * 8), error: undefined, retryAfter: undefined, checkpoints: { ...(status.checkpoints || {}), [stage]: { state: 'running', inputSha256, startedAt, resumable: true } } });
  const value = await work();
  if (outputFile) await writeAtomic(outputFile, jsonText(value));
  const outputSha256 = outputFile ? hashFile(outputFile) : hashJson(value);
  const latest = await readJson(path.join(jobDir(jobId), 'status.json'));
  await patchStatus(jobId, { checkpoints: { ...(latest.checkpoints || {}), [stage]: { state: 'completed', inputSha256, outputSha256, startedAt, completedAt: new Date().toISOString(), resumable: true } } });
  await heartbeatWorker(jobId);
  return value;
}

async function completeImmutablePlanCheckpoint(jobId, stage, inputSha256, outputFile, value) {
  const status = await readJson(path.join(jobDir(jobId), 'status.json'));
  const prior = status.checkpoints?.[stage];
  if (prior?.state === 'completed') {
    if (prior.inputSha256 !== inputSha256) throw Object.assign(new Error(`${stage} immutable checkpoint input authority mismatch`), { code: 'PROVIDER_BLOCKED' });
    if (!fs.existsSync(outputFile) || hashFile(outputFile) !== prior.outputSha256) throw Object.assign(new Error(`${stage} immutable artifact hash mismatch`), { code: 'PROVIDER_BLOCKED' });
  }
  return completeCheckpoint(jobId, stage, inputSha256, outputFile, async () => value);
}

async function completeSceneCheckpoint(jobId, phase, sceneNumber, inputSha256, outputFile, work) {
  const key = `${phase}_scene_${String(sceneNumber).padStart(3, '0')}`;
  await heartbeatWorker(jobId);
  const status = await readJson(path.join(jobDir(jobId), 'status.json')); const prior = status.checkpoints?.[key];
  if (prior?.state === 'completed' && prior.inputSha256 === inputSha256 && fs.existsSync(outputFile) && hashFile(outputFile) === prior.outputSha256) return readJson(outputFile);
  const startedAt = new Date().toISOString(); const phaseIndex = Math.max(0, STAGES.indexOf(phase));
  await patchStatus(jobId, { state: 'running', stage: phase, progress: Math.min(96, 5 + phaseIndex * 8), error: undefined, retryAfter: undefined, activeScene: sceneNumber, checkpoints: { ...(status.checkpoints || {}), [key]: { state: 'running', inputSha256, startedAt, resumable: true } } });
  const value = await work(); await writeAtomic(outputFile, jsonText(value)); const outputSha256 = hashFile(outputFile);
  const latest = await readJson(path.join(jobDir(jobId), 'status.json'));
  await patchStatus(jobId, { activeScene: undefined, checkpoints: { ...(latest.checkpoints || {}), [key]: { state: 'completed', inputSha256, outputSha256, startedAt, completedAt: new Date().toISOString(), resumable: true } } });
  await heartbeatWorker(jobId); return value;
}

export function assertProductionProviderProvenance(providerId, providerVersion, label = 'provider') {
  if (!providerId || !providerVersion) throw new Error(`${label} ID and version are required for production provenance`);
  if (/fallback|diagnostic|placeholder|card/iu.test(`${providerId} ${providerVersion}`)) throw new Error(`${label} diagnostic/fallback providers are not admitted for production`);
  return true;
}

export function buildProviderEnvironment(kind, environment = process.env) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'PYTHONIOENCODING'];
  return Object.fromEntries([...allowed.flatMap((key) => environment[key] ? [[key, environment[key]]] : []), ['NEWSROOM_PROVIDER_KIND', kind]]);
}

export async function runWithWindowsReadLocks(command, args, options) {
  if (process.platform !== 'win32') throw Object.assign(new Error('Strict bundle read locking is currently available only on Windows'), { code: 'PROVIDER_BLOCKED' });
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'; const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); const holder = path.join(AUTOMATION_ROOT, 'scripts', 'windows-fileshare-read-holder.ps1');
  if (!options.callback && command !== process.execPath && !options.lockedFiles.includes(command)) throw Object.assign(new Error('Locked spawn command is outside the Node/tool-bundle allowlist'), { code: 'PROVIDER_BLOCKED' });
  for (const file of [powershell, holder, ...options.lockedFiles]) { const info = fs.lstatSync(file); if (!info.isFile() || info.isSymbolicLink()) throw Object.assign(new Error('Strict bundle lock input is not a regular file'), { code: 'PROVIDER_BLOCKED' }); }
  options.spawnFence?.();
  const requestPath = path.join(options.requestRoot, `.locked-spawn-${crypto.randomUUID()}.json`); const resultPath = `${requestPath}.result`; const readyPath = `${requestPath}.ready`; const releasePath = `${requestPath}.release`;
  const actualEntries = options.lockedFiles.map((file) => ({ path: file, sha256: hashFile(file), bytes: fs.statSync(file).size }));
  const lockEntries = options.expectedLockEntries || actualEntries;
  if (stableStringify(lockEntries) !== stableStringify(actualEntries)) throw Object.assign(new Error('Strict lock inputs differ from their manifest/contract hashes'), { code: 'PROVIDER_BLOCKED' });
  const parentStartIdentity = options.callback ? processStartIdentity(process.pid) : null;
  if (options.callback && !parentStartIdentity) throw Object.assign(new Error('Cannot establish strict outer lock parent process birth identity'), { code: 'PROVIDER_BLOCKED' });
  const parentAuthority = options.callback ? { schema: 'newsroom-windows-lock-parent-authority-v1', parentPid: process.pid, processStartedAt: parentStartIdentity } : undefined;
  await writeAtomic(requestPath, jsonText({ schema: 'newsroom-windows-locked-spawn-v2', command, args, cwd: options.cwd, lockEntries, requestPath, resultPath, readyPath, releasePath, holdOnly: Boolean(options.callback), parentAuthority, binaryStdout: Boolean(options.binaryStdout), maxStdoutBytes: options.maxStdoutBytes }));
  try {
    if (options.callback) {
      const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', holder, '-Request', requestPath], { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let holderError = ''; let holderOutput = ''; let signalReady; const ready = new Promise((resolve) => { signalReady = resolve; }); child.stdout.on('data', (chunk) => { holderOutput += String(chunk); if (holderOutput.includes('NEWSROOM_OUTER_LOCK_READY')) signalReady(); }); child.stderr.on('data', (chunk) => { holderError += String(chunk); });
      const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => resolve(code)); });
      const startup = await Promise.race([ready.then(() => 'ready'), closed.then(() => 'closed'), new Promise((resolve) => setTimeout(() => resolve('timeout'), 30_000))]);
      if (startup !== 'ready') { if (child.exitCode === null) child.kill(); await closed.catch(() => {}); throw new Error(`Strict outer lock holder failed before ready: ${holderError.slice(-1200)}`); }
      let callbackResult; let callbackError;
      try { callbackResult = await options.callback(); } catch (error) { callbackError = error; }
      await writeAtomic(releasePath, 'release\n'); const code = await closed; if (code !== 0 && !callbackError) callbackError = new Error(`Strict outer lock holder exited ${code}: ${holderError.slice(-1200)}`);
      if (callbackError) throw callbackError;
      options.spawnFence?.();
      return callbackResult;
    }
    const holderResult = await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', holder, '-Request', requestPath], { cwd: options.cwd, env: options.env, heartbeatJobId: options.heartbeatJobId });
    options.spawnFence?.();
    const result = await readJson(resultPath); if (result.code !== 0) throw new Error(`Locked process exited ${result.code}: ${String(result.stderr || '').slice(-1200)}`); return options.binaryStdout ? { stdout: Buffer.from(String(result.stdoutBase64 || ''), 'base64'), stderr: String(result.stderr || ''), holder: holderResult } : { stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), holder: holderResult };
  } finally { for (const file of [requestPath, resultPath, readyPath, releasePath]) await fsp.unlink(file).catch((error) => { if (error?.code !== 'ENOENT') throw error; }); }
}

function run(command, args, { cwd = AUTOMATION_ROOT, env = process.env, heartbeatJobId = null, heartbeatIntervalMs = 10_000, spawnFence = null, lockedFiles = null, requestRoot = cwd } = {}) {
  if (lockedFiles) return runWithWindowsReadLocks(command, args, { cwd, env, heartbeatJobId, spawnFence, lockedFiles, requestRoot });
  return new Promise((resolve, reject) => {
    try { spawnFence?.(); } catch (error) { reject(error); return; }
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    let heartbeatError = null; let heartbeatBusy = false; let heartbeatPending = Promise.resolve(); let settled = false;
    const heartbeatTimer = heartbeatJobId ? setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      heartbeatPending = heartbeatWorker(heartbeatJobId).catch((error) => { heartbeatError = error; child.kill(); }).finally(() => { heartbeatBusy = false; });
    }, heartbeatIntervalMs) : null;
    heartbeatTimer?.unref?.();
    const integrityTimer = spawnFence ? setInterval(() => { try { spawnFence(); } catch (error) { heartbeatError = error; child.kill(); } }, 100) : null; integrityTimer?.unref?.();
    child.on('spawn', () => { try { spawnFence?.(); } catch (error) { heartbeatError = error; child.kill(); } });
    child.stdout.on('data', (chunk) => { stdout += String(chunk); if (stdout.length > 1_000_000) stdout = stdout.slice(-1_000_000); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); });
    child.on('error', (error) => { if (heartbeatTimer) clearInterval(heartbeatTimer); if (integrityTimer) clearInterval(integrityTimer); if (!settled) { settled = true; reject(heartbeatError || error); } });
    child.on('close', async (code) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (integrityTimer) clearInterval(integrityTimer);
      await heartbeatPending;
      if (settled) return;
      settled = true;
      try { spawnFence?.(); } catch (error) { heartbeatError = error; }
      if (heartbeatError) reject(heartbeatError);
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Process exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function lastJson(stdout) {
  const starts = [...String(stdout).matchAll(/\{/gu)].map((match) => match.index).reverse();
  for (const start of starts) { try { return JSON.parse(stdout.slice(start)); } catch {} }
  throw new Error('Production command completed without metadata JSON');
}

export function inspectPngBytes(bytes, label = 'PNG') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${label} is not a decodable PNG`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width !== 1080 || height !== 1920) throw new Error(`${label} must be a 1080x1920 production image`);
  const embeddedText = bytes.toString('latin1').toLowerCase();
  if (/fallback[-_ ]?card|diagnostic[-_ ]?card|opencut\s*\/\s*local newsroom/u.test(embeddedText)) throw new Error(`${label} has forbidden diagnostic/fallback-card provenance`);
  return { width, height, bytes: bytes.length, sha256: sha256(bytes) };
}

export async function runProductionOrchestration(jobId, { narrationAdapter = generateNewsroomNarration } = {}) {
  const dir = jobDir(jobId);
  await fsp.mkdir(dir, { recursive: true });
  let request;
  try { request = await readJson(path.join(dir, 'request.json')); }
  catch (error) {
    const retryAfter = new Date(Date.now() + 30_000).toISOString();
    await patchStatus(jobId, { state: 'blocked', stage: 'finalized', retryable: true, retryAfter, error: `Production request is unavailable or incomplete: ${sanitizeError(error)}`, worker: undefined }).catch(() => {});
    return { jobId, state: 'blocked', stage: 'finalized', error: sanitizeError(error) };
  }
  const initialStatus = await readJson(path.join(dir, 'status.json'));
  if (initialStatus.state === 'completed') {
    if (initialStatus.authorityHash !== request.authorityHash) throw new Error('Completed production status authority mismatch');
    if (initialStatus.stage === 'assembly_ready') {
      const terminalArtifacts = [
        ['editorial_story_plan', 'editorial-story-plan.json'],
        ['visual_treatment', 'visual-treatment-plan.json'],
        ['animatic_plan', 'animatic-plan.json'],
        ['assembly_ready', 'assembly-ready.json'],
      ];
      for (const [stage, name] of terminalArtifacts) {
        const checkpoint = initialStatus.checkpoints?.[stage]; const file = path.join(dir, name);
        if (checkpoint?.state !== 'completed' || !fs.existsSync(file) || hashFile(file) !== checkpoint.outputSha256) throw Object.assign(new Error(`Completed ${stage} artifact is missing or changed`), { code: 'PROVIDER_BLOCKED' });
      }
      const [story, visual, animatic, assembly] = await Promise.all(['editorial-story-plan.json', 'visual-treatment-plan.json', 'animatic-plan.json', 'assembly-ready.json'].map((name) => readJson(path.join(dir, name))));
      if (assembly?.schema !== 'assembly-ready-v5-color-storyboard' || assembly.authorityHash !== request.authorityHash || stableStringify(assembly.mediaAssemblyPolicy) !== stableStringify(request.mediaAssemblyPolicy) || assembly.status !== 'deferred' || assembly.continuationAuthorized !== false || assembly.providerCallsBeforeCheckpoint?.storyboardInputs !== false) throw Object.assign(new Error('Completed color-storyboard assembly-ready authority is stale or tampered'), { code: 'PROVIDER_BLOCKED' });
      const expectedArtifactHashes = { story: hashFile(path.join(dir, 'editorial-story-plan.json')), visual: hashFile(path.join(dir, 'visual-treatment-plan.json')), animatic: hashFile(path.join(dir, 'animatic-plan.json')) };
      if (Object.entries(expectedArtifactHashes).some(([key, value]) => assembly.artifacts?.[key]?.sha256 !== value)) throw Object.assign(new Error('Completed assembly-ready artifact binding is stale or tampered'), { code: 'PROVIDER_BLOCKED' });
      const authorityDir = contained(dir, path.join(dir, request.authorityRoot), 'authority root');
      const scriptAuthorityPath = path.join(authorityDir, 'script.final.json'); const evidenceAuthorityPath = path.join(authorityDir, 'evidence-bundle.json'); const videoDesignAuthorityPath = path.join(dir, 'video-design.json');
      if (![scriptAuthorityPath, evidenceAuthorityPath, videoDesignAuthorityPath].every((file) => fs.existsSync(file))) throw Object.assign(new Error('Completed assembly-ready upstream authority is missing'), { code: 'PROVIDER_BLOCKED' });
      const videoDesignSha256 = hashFile(videoDesignAuthorityPath);
      if (story.sourceVideoDesignSha256 !== videoDesignSha256 || visual.sourceVideoDesignSha256 !== videoDesignSha256 || animatic.storyPlanSha256 !== expectedArtifactHashes.story || animatic.visualTreatmentSha256 !== expectedArtifactHashes.visual) throw Object.assign(new Error('Completed assembly-ready upstream artifact binding is stale or tampered'), { code: 'PROVIDER_BLOCKED' });
      const expectedCheckpointInputs = buildDeferredTerminalCheckpointInputs({ authorityHash: request.authorityHash, scriptSha256: hashFile(scriptAuthorityPath), evidenceBundleSha256: hashFile(evidenceAuthorityPath), videoDesignSha256, narrationAuthority: story.narrationAuthority, storyPlanSha256: expectedArtifactHashes.story, visualTreatmentSha256: expectedArtifactHashes.visual, animaticPlanSha256: expectedArtifactHashes.animatic, mediaAssemblyPolicy: request.mediaAssemblyPolicy });
      verifyDeferredTerminalCheckpointInputs(initialStatus.checkpoints, expectedCheckpointInputs);
      return { jobId, state: 'completed', stage: 'assembly_ready', deferred: true, reused: true, assembly, artifacts: assembly.artifacts };
    }
    return { jobId, state: 'completed', stage: initialStatus.stage, deferred: initialStatus.deferred === true, reused: true };
  }
  const acquired = await acquireOrchestrationLock(dir, request.authorityHash);
  if (!acquired) return { jobId, reused: true };
  const acquiredAt = new Date().toISOString();
  activeWorkers.set(jobId, { authorityHash: request.authorityHash, lockPath: acquired.lockPath, workerId: acquired.workerId, acquiredAt });
  try {
    if (request.jobId !== jobId || !SHA256.test(request.authorityHash || '')) throw new Error('Production request identity is invalid');
    await patchStatus(jobId, { state: 'running', retryable: false, retryAfter: undefined });
    await heartbeatWorker(jobId);
    await fsp.rm(path.join(dir, 'resume-lease.json'), { force: true });
    const authorityDir = contained(dir, path.join(dir, request.authorityRoot), 'authority root');
    const researchPath = path.join(authorityDir, 'research.json');
    const dossierPath = path.join(authorityDir, 'event-dossier.json');
    const legalPath = path.join(authorityDir, 'legal-report.json');
    const scriptPath = path.join(authorityDir, 'script.final.json');
    const [research, dossier, legal, script] = await Promise.all([readJson(researchPath), readJson(dossierPath), readJson(legalPath), readJson(scriptPath)]);
    const recomputed = productionAuthorityHash({ slug: request.slug, title: request.storyTitle, selectedDraftId: request.selectedDraftId, sections: script.sections, researchSnapshot: research, legalReport: legal, referenceCatalog: request.referenceCatalog, sceneRecipes: request.sceneRecipes, commonMasterAssets: request.commonMasterAssets, storyline: request.storyline, semanticCutPlan: request.semanticCutPlan, storyboardAdmission: request.storyboardAdmission, agentVideoDesignPlan: request.agentVideoDesignPlan, headline: request.headline, ownerVoiceAuthority: request.ownerVoiceAuthority, approvedNarrationAuthority: request.approvedNarrationAuthority, visualAuthorityId: request.visualAuthorityId, productionConfig: request.productionConfig, mediaAssemblyPolicy: request.mediaAssemblyPolicy });
    if (recomputed !== request.authorityHash) throw new Error('Production request authority is stale or tampered');
    const currentOwnerVoice = inspectOwnerVoiceProfile();
    if (stableStringify(request.productionConfig?.ownerVoiceProfile) !== stableStringify(currentOwnerVoice) || request.productionConfig?.narrationMode !== 'qwen3-tts-preplanned-locked' || request.productionConfig?.narrationProfileId !== 'owner-voice-v1-qwen3-tts-v1') throw Object.assign(new Error('Owner voice production authority changed or is not the approved preplanned owner-voice-v1 Qwen profile'), { code: 'PROVIDER_BLOCKED' });
    if (stableStringify(request.referenceAssetAuthority || []) !== stableStringify(inspectReferenceAssetAuthority(request.slug, request.referenceCatalog))) throw new Error('Reference asset authority is stale or tampered');

    const evidencePath = path.join(authorityDir, 'evidence-bundle.json');
    const evidenceInput = hashJson({ authorityHash: request.authorityHash, research: hashFile(researchPath), dossier: hashFile(dossierPath), legal: hashFile(legalPath), script: hashFile(scriptPath) });
    const bundle = await completeCheckpoint(jobId, 'evidence_bundle', evidenceInput, evidencePath, async () => {
      const scriptSpans = buildAutomaticScriptSpans({ script, legalReport: legal, eventDossier: dossier });
      return buildEvidenceBundle({ researchSnapshot: researchPath, eventDossier: dossierPath, legalReport: legalPath, script: scriptPath, scriptSpans, rootDir: dir, generatedAt: request.createdAt });
    });
    verifyEvidenceBundle(bundle, { rootDir: dir, script });
    const bundleFileSha = hashFile(evidencePath);

    const narrationDir = path.join(dir, 'project', 'narration');
    const narrationPath = path.join(narrationDir, 'manifest.json');
    const ffmpegAuthority = assertBundleAuthority('ffmpeg', request.productionConfig?.ffmpegBundle);
    const narrationManifest = await completeCheckpoint(jobId, 'narration', hashJson({ authorityHash: request.authorityHash, approvedNarrationArtifactSha256: request.approvedNarrationAuthority?.artifactSha256 || null, scriptSha256: hashText(script.draft), ownerVoiceProfile: request.productionConfig.ownerVoiceProfile, pausePolicy: 'korean-sentence-pause-v2:0.45:max0.5:exact-boundary', pronunciationQa: 'localized-korean-pronunciation-asr-v1:small+medium:all-models', segmentRetry: 'qwen-segment-reuse-v1:hash-bound:re-QA-before-reuse:failed-only-resynthesis' }), narrationPath, async () => {
      await fsp.mkdir(narrationDir, { recursive: true });
      if (request.approvedNarrationAuthority) {
        return admitApprovedNarrationAuthority(request.approvedNarrationAuthority, {
          slug: request.slug, script, ownerVoiceProfile: request.productionConfig.ownerVoiceProfile, authorityHash: request.authorityHash, outputDir: narrationDir,
        });
      }
      return narrationAdapter({
        script, authorityHash: request.authorityHash, ownerVoiceProfile: request.productionConfig.ownerVoiceProfile, outputDir: narrationDir,
        ffmpegExecutable: path.join(ffmpegAuthority.realRoot, ...String(ffmpegAuthority.launch.ffmpeg).split('/')),
        ffprobeExecutable: path.join(ffmpegAuthority.realRoot, ...String(ffmpegAuthority.launch.ffprobe).split('/')),
        runCommand: (command, args) => run(command, args, { cwd: AUTOMATION_ROOT, env: buildProviderEnvironment('narration'), heartbeatJobId: jobId, requestRoot: dir }),
        heartbeat: () => heartbeatWorker(jobId),
      });
    });
    verifyNewsroomNarrationManifest(narrationManifest, { authorityHash: request.authorityHash, script, ownerVoiceProfile: request.productionConfig.ownerVoiceProfile, outputDir: narrationDir });

    if (!request.productionConfig?.agentVideoDesignWorkflow || request.productionConfig.agentVideoDesignWorkflow.workflowVersion !== AGENT_VIDEO_DESIGN_WORKFLOW_VERSION) throw Object.assign(new Error('Legacy external planner configuration is historical and cannot continue'), { code: 'CODEX_ADMIN_BLOCKED' });
    const agentInputResult = buildAgentVideoDesignInput({ request, script, bundle, bundleFileSha, narrationManifest, referenceCatalog: request.referenceCatalog, sceneRecipes: request.sceneRecipes });
    const designAuthorshipArtifactPath = path.join(dir, 'primary-agent-video-design.json');
    const agentArtifact = await completeCheckpoint(jobId, 'video_design_agent_plan', hashJson({ authorityHash: request.authorityHash, inputSha256: agentInputResult.inputSha256, workflow: request.productionConfig.agentVideoDesignWorkflow, storylineSha256: request.storyline.approval.sha256, semanticCutPlanSha256: request.semanticCutPlan.approval.sha256, storyboardAdmissionSha256: request.storyboardAdmission.approval.sha256, authoredPlanSha256: hashJson(request.agentVideoDesignPlan) }), designAuthorshipArtifactPath, async () => createAgentVideoDesignArtifact({ authoringInput: agentInputResult.input, inputSha256: agentInputResult.inputSha256, authoredPlan: request.agentVideoDesignPlan }));
    verifyAgentVideoDesignArtifact(agentArtifact, { authoringInput: agentInputResult.input, inputSha256: agentInputResult.inputSha256 });
    const videoDesign = compileAgentVideoDesign({ artifact: agentArtifact, authoringInput: agentInputResult.input, request, script, bundleFileSha });
    const videoDesignPath = path.join(dir, 'video-design.json');
    const compiledVideoDesignBytes = Buffer.from(jsonText(videoDesign), 'utf8');
    const compiledVideoDesignSha256 = sha256(compiledVideoDesignBytes);
    if (fs.existsSync(videoDesignPath)) {
      if (hashFile(videoDesignPath) !== compiledVideoDesignSha256) throw Object.assign(new Error('Serialized video-design artifact is immutable and does not match the compiler output'), { code: 'PROVIDER_BLOCKED' });
    } else await writeAtomic(videoDesignPath, compiledVideoDesignBytes);
    const serializedVideoDesignSha256 = hashFile(videoDesignPath);
    const planPath = path.join(dir, 'editorial-video-plan.json');
    const plan = await completeCheckpoint(jobId, 'video_plan', hashJson({ authorityHash: request.authorityHash, bundleFileSha, designAuthorshipArtifactSha256: hashFile(designAuthorshipArtifactPath), compiledVideoDesignSha256: serializedVideoDesignSha256 }), planPath, async () => buildPlan({ request, script, bundleFileSha, videoDesign, videoDesignSerializedSha256: serializedVideoDesignSha256 }));
    verifyEditorialVideoPlan(plan, { authorityHash: request.authorityHash, script, bundle, bundleFileSha });
    if (hashFile(videoDesignPath) !== plan.videoDesignSha256) throw Object.assign(new Error('Editorial plan is not bound to the exact serialized video-design artifact'), { code: 'PROVIDER_BLOCKED' });
    await patchStatus(jobId, { videoDesign: { schema: 'newsroom-video-design-status-v1', status: 'compiled-awaiting-monitor', sha256: plan.videoDesignSha256, designInputSha256: plan.designInputSha256, designPlanSha256: plan.designPlanSha256, authorship: plan.videoDesign.authorship ? 'primary-agent' : 'legacy-planner-checkpoint', cutCount: plan.videoDesign.totalCuts, keyframeCount: plan.scenes.length, animationMode: plan.animationPolicy } });
    const codexMonitorPath = path.join(dir, 'codex', 'monitor', 'result.json'); const codexMonitorInput = hashJson({ authorityHash: request.authorityHash, videoDesignSha256: plan.videoDesignSha256, keyframeSceneCount: plan.scenes.length, model: CODEX_QA_MODEL, reasoning: CODEX_QA_REASONING, promptVersion: CODEX_QA_PROMPT_VERSION }); const codexMonitor = await completeCheckpoint(jobId, 'codex_monitor', codexMonitorInput, codexMonitorPath, async () => runCodexMonitor({ authorityHash: request.authorityHash, request, jobDir: dir, phase: 'design', observation: { videoDesignSha256: plan.videoDesignSha256, keyframeSceneCount: plan.scenes.length }, heartbeat: async () => heartbeatWorker(jobId) })); const statusBeforeMonitorPatch = await readJson(path.join(dir, 'status.json')).catch(() => ({})); const existingCodexQa = isObject(statusBeforeMonitorPatch.codexQa) ? statusBeforeMonitorPatch.codexQa : {}; await patchStatus(jobId, { codexQa: { ...existingCodexQa, monitor: { state: 'completed', monitorOnly: true, canonicalQaRequired: true, model: codexMonitor.model, reasoning: codexMonitor.reasoning, verdict: codexMonitor.result.verdict, summary: codexMonitor.result.summary, completedAt: codexMonitor.completedAt, videoDesignSha256: plan.videoDesignSha256 }, repairAttempts: Number(existingCodexQa.repairAttempts || 0) } }); if (codexMonitor.result.verdict === 'blocked') throw Object.assign(new Error('Codex design audit flagged a concrete risk; private administrator review is required.'), { code: 'CODEX_ADMIN_BLOCKED' });

    const statusAfterMonitor = await readJson(path.join(dir, 'status.json')); await patchStatus(jobId, { videoDesign: { ...statusAfterMonitor.videoDesign, status: 'compiled-monitored' } });
    // Motion-documentary design is a deterministic, provider-free successor to
    // the legacy paper-cut media assembly. These artifacts are immutable and
    // remain the authority for any later media insertion job.
    const motionPlans = buildEditorialMotionDocumentaryPlans({ authorityHash: request.authorityHash, script, bundleFileSha, videoDesign: plan.videoDesign, videoDesignSerializedSha256: plan.videoDesignSha256, narrationManifest });
    const storyPlanPath = path.join(dir, 'editorial-story-plan.json');
    const visualTreatmentPath = path.join(dir, 'visual-treatment-plan.json');
    const animaticPlanPath = path.join(dir, 'animatic-plan.json');
    const storyPlan = await completeImmutablePlanCheckpoint(jobId, 'editorial_story_plan', hashJson({ authorityHash: request.authorityHash, script: hashFile(scriptPath), evidence: bundleFileSha, videoDesign: plan.videoDesignSha256, narrationAudio: motionPlans.story.narrationAuthority.audioSha256, narrationTiming: motionPlans.story.narrationAuthority.timingSha256 }), storyPlanPath, motionPlans.story);
    const storyPlanSha256 = hashFile(storyPlanPath);
    const visualTreatment = await completeImmutablePlanCheckpoint(jobId, 'visual_treatment', hashJson({ authorityHash: request.authorityHash, storyPlan: storyPlanSha256, videoDesign: plan.videoDesignSha256 }), visualTreatmentPath, motionPlans.visual);
    const visualTreatmentSha256 = hashFile(visualTreatmentPath);
    const animaticPlan = await completeImmutablePlanCheckpoint(jobId, 'animatic_plan', hashJson({ authorityHash: request.authorityHash, storyPlan: storyPlanSha256, visualTreatment: visualTreatmentSha256, narrationAudio: motionPlans.animatic.narrationAuthority.audioSha256, narrationTiming: motionPlans.animatic.narrationAuthority.timingSha256 }), animaticPlanPath, motionPlans.animatic);
    const animaticPlanSha256 = hashFile(animaticPlanPath);
    verifyEditorialMotionDocumentaryPlans({ story: storyPlan, visual: visualTreatment, animatic: animaticPlan, authorityHash: request.authorityHash, script, bundleFileSha, narrationManifest, videoDesign: plan.videoDesign, videoDesignSerializedSha256: plan.videoDesignSha256 });
    const assemblyReadyPath = path.join(dir, 'assembly-ready.json');
    const assemblyReady = buildAssemblyReady({ authorityHash: request.authorityHash, artifacts: { storySha256: storyPlanSha256, visualTreatmentSha256, animaticPlanSha256 }, paths: { story: 'editorial-story-plan.json', visual: 'visual-treatment-plan.json', animatic: 'animatic-plan.json' }, mediaAssemblyPolicy: request.mediaAssemblyPolicy });
    const assembly = await completeImmutablePlanCheckpoint(jobId, 'assembly_ready', hashJson({ authorityHash: request.authorityHash, storyPlan: storyPlanSha256, visualTreatment: visualTreatmentSha256, animaticPlan: animaticPlanSha256, mediaAssemblyPolicy: request.mediaAssemblyPolicy }), assemblyReadyPath, assemblyReady);
    await patchStatus(jobId, { state: 'completed', stage: 'assembly_ready', progress: 100, deferred: true, assembly: { status: assembly.status, mediaAssemblyPolicy: assembly.mediaAssemblyPolicy, continuationAuthorized: false, artifacts: assembly.artifacts, providerCallsBeforeCheckpoint: assembly.providerCallsBeforeCheckpoint } });
    return { jobId, state: 'completed', stage: 'assembly_ready', deferred: true, assembly, artifacts: assembly.artifacts };

  } catch (error) {
    if (error?.code === 'WORKER_LEASE_LOST') return { jobId, reused: true, reason: 'worker-lease-superseded' };
    const currentStatus = await readJson(path.join(dir, 'status.json')).catch(() => ({}));
    const priorAttempts = Number(currentStatus.codexQa?.repairAttempts || 0);
    let repair = { status: 'not-eligible', reason: 'not-code-defect' };
    try {
      repair = await runCodexRepairAttempt({ authorityHash: request.authorityHash, stage: String(currentStatus.stage || 'failed'), error, attempts: priorAttempts, automationRoot: AUTOMATION_ROOT, jobDir: dir, heartbeat: async () => heartbeatWorker(jobId) });
    } catch (repairError) {
      repair = { status: 'admin_review_required', reason: 'codex-private-proposal-failed', terminal: true, retryable: false, attempt: Math.min(2, priorAttempts + 1), adminPrerequisite: sanitizeError(repairError) };
    }
    const plannerInvalid = error?.code === 'VIDEO_DESIGN_INVALID';
    const codexAdminPrerequisite = error?.code === 'CODEX_ADMIN_BLOCKED' || plannerInvalid;
    const adminReview = repair.status === 'admin_review_required' || repair.terminal === true || codexAdminPrerequisite;
    const blocked = error?.code === 'PROVIDER_BLOCKED' || codexAdminPrerequisite || repair.status === 'blocked' || adminReview;
    const retryable = blocked && !adminReview;
    const plannerBlocked = codexAdminPrerequisite && (currentStatus.stage === 'video_design_planner' || plannerInvalid);
    const failedStage = String(currentStatus.stage || 'failed');
    const checkpoints = isObject(currentStatus.checkpoints) ? { ...currentStatus.checkpoints } : {};
    if (isObject(checkpoints[failedStage]) && checkpoints[failedStage].state === 'running') {
      checkpoints[failedStage] = { ...checkpoints[failedStage], state: 'failed', failedAt: new Date().toISOString(), error: sanitizeError(error), resumable: retryable };
    }
    await patchStatus(jobId, { state: blocked ? 'blocked' : 'failed', stage: blocked ? failedStage : 'failed', progress: blocked ? Number(currentStatus.progress || 2) : 100, retryable, ...(retryable ? { retryAfter: new Date(Date.now() + 30_000).toISOString() } : { retryAfter: undefined }), error: plannerBlocked ? `LLM video-design planner is unavailable or invalid: ${sanitizeError(error)}` : codexAdminPrerequisite ? 'Codex QA administrator prerequisite is unavailable; verify the executable, authentication, and elevated Windows sandbox.' : adminReview ? 'Codex produced a private, isolated diagnostic proposal. Automatic source promotion is disabled; administrator review is required.' : sanitizeError(error), checkpoints, codexQa: { ...(isObject(currentStatus.codexQa) ? currentStatus.codexQa : {}), repairAttempts: Math.max(priorAttempts, Number(repair.attempt || 0)), repair: repair.status === 'not-eligible' ? undefined : repair }, worker: undefined }).catch(() => {});
    return { jobId, state: blocked ? 'blocked' : 'failed', error: sanitizeError(error) };
  } finally {
    const worker = activeWorkers.get(jobId);
    activeWorkers.delete(jobId);
    try {
      const currentLock = await readJson(acquired.lockPath);
      if (currentLock.workerId === worker?.workerId) await fsp.rm(acquired.lockPath, { force: true });
    } catch {}
  }
}
