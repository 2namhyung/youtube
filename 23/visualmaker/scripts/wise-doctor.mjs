import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat, realpath} from 'node:fs/promises';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const checkoutRoot = path.resolve(scriptDirectory, '../..');
const defaultStudioRoot = path.resolve(checkoutRoot, '..', 'youtube1', 'production-studio');
const backendFiles = ['__init__.py', 'media.py', 'core.py', 'wise.py'];
const DEFAULT_TIMEOUT_MS = 800;

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function inspectPath(target, {kind = 'directory'} = {}) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const segments = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return {exists: false, safe: true};
      return {exists: false, safe: false};
    }
    if (info.isSymbolicLink()) return {exists: true, safe: false};
    if (samePath(current, absolute)) {
      if (kind === 'directory' && !info.isDirectory()) return {exists: true, safe: false};
      if (kind === 'file' && !info.isFile()) return {exists: true, safe: false};
    }
  }
  try {
    const resolved = await realpath(absolute);
    if (!samePath(resolved, absolute)) return {exists: true, safe: false};
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return {exists: false, safe: true};
    return {exists: false, safe: false};
  }
  return {exists: true, safe: true};
}

function endpointFrom(value) {
  if (typeof value !== 'string' || !value.trim()) return {error: 'wise-url-not-configured'};
  let url;
  try { url = new URL(value.trim()); } catch { return {error: 'invalid-wise-url'}; }
  if (!['http:', 'https:'].includes(url.protocol)) return {error: 'invalid-wise-url'};
  if (url.username || url.password || /[?#]/.test(value)) return {error: 'invalid-wise-url'};
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const loopback = host === 'localhost' || host === '::1' || host === '127.0.0.1';
  if (!loopback) return {error: 'wise-url-not-loopback'};
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return {error: 'invalid-wise-url'};
  // Never pass a hostname to the socket API: even "localhost" can be redirected by hosts/DNS.
  return {host: host === 'localhost' ? '127.0.0.1' : host, port};
}

export function probeLoopbackTcp(host, port, timeoutMs, createConnection = net.createConnection) {
  if (host !== '127.0.0.1' && host !== '::1') return Promise.resolve(false);
  const family = net.isIP(host);
  if (!family) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(reachable);
    };
    const socket = createConnection({host, port, family});
    // Socket inactivity timers need not fire while connect is still pending. This deadline
    // also destroys a stalled connection attempt, so the diagnostic cannot leave it behind.
    timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function boundedProbe(probe, host, port, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => probe(host, port, timeoutMs)).then(Boolean, () => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Read-only prerequisite check; importing this module never runs the CLI. */
export async function diagnoseWiseRuntime({
  env = process.env,
  cwd = process.cwd(),
  defaultStudioRootPath = defaultStudioRoot,
  probeTcp = probeLoopbackTcp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const issues = [];
  const add = (code, target) => issues.push({code, target});
  const resolveValue = (value, fallback) => path.resolve(cwd, value || fallback);
  const studioRoot = resolveValue(env.WISE_STUDIO_ROOT, defaultStudioRootPath);
  const studio = await inspectPath(studioRoot);
  if (!studio.safe) add('unsafe-path', 'wise-studio-root');
  else if (!studio.exists) add('missing-directory', 'wise-studio-root');

  const backendRoot = path.join(studioRoot, 'backend');
  const backend = await inspectPath(backendRoot);
  if (!backend.safe) add('unsafe-path', 'backend-directory');
  else if (!backend.exists) add('missing-directory', 'backend-directory');
  else {
    for (const name of backendFiles) {
      const module = await inspectPath(path.join(backendRoot, name), {kind: 'file'});
      if (!module.safe) add('unsafe-path', `backend/${name}`);
      else if (!module.exists) add('missing-file', `backend/${name}`);
    }
  }

  const dataRoot = resolveValue(env.STUDIO_DATA_DIR, path.join(studioRoot, 'data'));
  const data = await inspectPath(dataRoot);
  if (!data.safe) add('unsafe-path', 'studio-data-directory');
  else if (!data.exists) add('missing-directory', 'studio-data-directory');

  const sourcesRoot = path.join(dataRoot, 'sources');
  const sources = await inspectPath(sourcesRoot);
  if (!sources.safe) add('unsafe-path', 'sources-directory');
  else if (!sources.exists) add('missing-directory', 'sources-directory');

  const databasePath = resolveValue(env.STUDIO_DB_PATH, path.join(dataRoot, 'studio.sqlite3'));
  const database = await inspectPath(databasePath, {kind: 'file'});
  if (!database.safe) add('unsafe-path', 'studio-database');
  else if (!database.exists) add('missing-file', 'studio-database');

  const endpoint = endpointFrom(env.WISE_URL);
  let tcp = 'not-probed';
  if (endpoint.error) add(endpoint.error, 'wise-endpoint');
  else {
    const reachable = await boundedProbe(probeTcp, endpoint.host, endpoint.port,
      Math.max(50, Math.min(3000, Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS)));
    tcp = reachable ? 'tcp-reachable' : 'tcp-unreachable';
    if (!reachable) add('wise-tcp-unreachable', 'wise-endpoint');
  }

  const status = issues.length ? 'blocked' : 'prerequisites-present-unverified';
  return {
    schemaVersion: 'visualmaker-wise-doctor-v1',
    scope: 'existing-bridge-prerequisites-only',
    status,
    productionAuthority: false,
    semanticSearchVerified: false,
    wiseInstallationVerified: false,
    pythonRuntimeChecked: false,
    tcp,
    checked: {
      wiseStudioRoot: studio.exists && studio.safe,
      backendModules: backend.exists && backend.safe && backendFiles.every((name) =>
        !issues.some((issue) => issue.target === `backend/${name}`)),
      studioDataDirectory: data.exists && data.safe,
      sourcesDirectory: sources.exists && sources.safe,
      studioDatabase: database.exists && database.safe,
    },
    issues,
  };
}

async function main() {
  const report = await diagnoseWiseRuntime();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status === 'blocked') process.exitCode = 1;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  await main();
}
