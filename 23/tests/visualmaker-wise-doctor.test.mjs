import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {lstat, mkdtemp, mkdir, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {diagnoseWiseRuntime, probeLoopbackTcp} from '../visualmaker/scripts/wise-doctor.mjs';

const modules = ['__init__.py', 'media.py', 'core.py', 'wise.py'];
let root;

async function makeTree(base) {
  const studio = path.join(base, 'studio');
  const backend = path.join(studio, 'backend');
  const data = path.join(studio, 'custom-data');
  await mkdir(backend, {recursive: true});
  await mkdir(path.join(data, 'sources'), {recursive: true});
  for (const name of modules) await writeFile(path.join(backend, name), `# ${name}\n`);
  await writeFile(path.join(data, 'catalog.sqlite3'), 'synthetic placeholder bytes');
  return {studio, backend, data};
}

async function treeSnapshot(dir) {
  const entries = [];
  async function walk(current) {
    for (const name of (await readdir(current)).sort()) {
      const target = path.join(current, name);
      const stat = await lstat(target);
      entries.push([path.relative(dir, target), stat.size, stat.mtimeMs]);
      if (stat.isDirectory()) await walk(target);
    }
  }
  await walk(dir);
  return entries;
}

test.beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'wise-doctor-')); });
test.afterEach(async () => { await rm(root, {recursive: true, force: true}); });

test('aggregates missing prerequisites and reports no production authority', async () => {
  let probes = 0;
  const report = await diagnoseWiseRuntime({cwd: root, env: {WISE_STUDIO_ROOT: 'absent'}, probeTcp: async () => { probes++; }});
  assert.equal(report.status, 'blocked');
  assert.equal(report.productionAuthority, false);
  assert.equal(report.semanticSearchVerified, false);
  assert.equal(report.tcp, 'not-probed');
  assert.ok(report.issues.some(({target}) => target === 'wise-studio-root'));
  assert.ok(report.issues.some(({target}) => target === 'studio-database'));
  assert.equal(probes, 0);
});

test('accepts explicit roots and database outside the data directory, but calls readiness unverified', async () => {
  const paths = await makeTree(root);
  const externalDb = path.join(root, 'alternate.sqlite3');
  await writeFile(externalDb, 'synthetic bytes');
  const before = await treeSnapshot(root);
  const observed = [];
  const report = await diagnoseWiseRuntime({
    cwd: root,
    env: {
      WISE_STUDIO_ROOT: paths.studio,
      STUDIO_DATA_DIR: paths.data,
      STUDIO_DB_PATH: externalDb,
      WISE_URL: 'http://localhost:9670/visualmaker',
      WISE_SEARCH_PATH: 'ignored-but-trusted-config-name',
    },
    probeTcp: async (host, port, timeoutMs) => { observed.push([host, port, timeoutMs]); return true; },
  });
  assert.equal(report.status, 'prerequisites-present-unverified');
  assert.equal(report.tcp, 'tcp-reachable');
  assert.equal(report.semanticSearchVerified, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.issues.length, 0);
  assert.deepEqual(observed, [['127.0.0.1', 9670, 800]]);
  assert.ok(report.checked.backendModules);
  assert.deepEqual(await treeSnapshot(root), before);
});

test('resolves default data and database locations under the configured studio root', async () => {
  const studio = path.join(root, 'youtube1', 'production-studio');
  const backend = path.join(studio, 'backend');
  const data = path.join(studio, 'data');
  await mkdir(backend, {recursive: true});
  await mkdir(path.join(data, 'sources'), {recursive: true});
  for (const name of modules) await writeFile(path.join(backend, name), `# ${name}\n`);
  await writeFile(path.join(data, 'studio.sqlite3'), 'synthetic placeholder bytes');
  const report = await diagnoseWiseRuntime({
    cwd: root,
    defaultStudioRootPath: studio,
    env: {WISE_URL: 'http://127.0.0.1:9670'},
    probeTcp: async () => true,
  });
  assert.equal(report.status, 'prerequisites-present-unverified');
  assert.equal(report.scope, 'existing-bridge-prerequisites-only');
  assert.equal(report.pythonRuntimeChecked, false);
  assert.equal(report.wiseInstallationVerified, false);
});

test('reports partial missing modules, sources, and database independently', async () => {
  const studio = path.join(root, 'studio');
  await mkdir(path.join(studio, 'backend'), {recursive: true});
  await writeFile(path.join(studio, 'backend', '__init__.py'), '# synthetic');
  await mkdir(path.join(studio, 'data'));
  const report = await diagnoseWiseRuntime({
    cwd: root,
    env: {WISE_STUDIO_ROOT: studio, WISE_URL: 'http://127.0.0.1:9670'},
    probeTcp: async () => false,
  });
  const targets = report.issues.map(({target}) => target);
  assert.ok(targets.includes('backend/media.py'));
  assert.ok(targets.includes('sources-directory'));
  assert.ok(targets.includes('studio-database'));
  assert.ok(targets.includes('wise-endpoint'));
});

test('rejects unsafe destinations before probing and never serializes config values or paths', async () => {
  let probes = 0;
  const suspicious = path.join(root, 'private-location');
  for (const url of [
    'http://user:secret@localhost:9670',
    'http://localhost:9670?',
    'http://localhost:9670#fragment',
    'file://localhost/tmp',
    'http://example.com:9670',
    'http://localhost:99999',
  ]) {
    const report = await diagnoseWiseRuntime({
      cwd: root,
      env: {WISE_STUDIO_ROOT: suspicious, WISE_URL: url},
      probeTcp: async () => { probes++; return true; },
    });
    assert.notEqual(report.status, 'prerequisites-present-unverified');
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(suspicious), false);
    assert.equal(serialized.includes('secret'), false);
  }
  assert.equal(probes, 0);
});

test('rejects symlinked path ancestry', async (t) => {
  const actual = await makeTree(root);
  const alias = path.join(root, 'linked-studio');
  try { await symlink(actual.studio, alias, 'junction'); }
  catch { t.skip('This host does not permit creating a directory link in the temporary test folder.'); return; }
  const report = await diagnoseWiseRuntime({
    cwd: root,
    env: {WISE_STUDIO_ROOT: alias, STUDIO_DATA_DIR: actual.data, STUDIO_DB_PATH: path.join(actual.data, 'catalog.sqlite3')},
    probeTcp: async () => false,
  });
  assert.ok(report.issues.some(({code, target}) => code === 'unsafe-path' && target === 'wise-studio-root'));
});

test('bounds an injected TCP probe and classifies a responsive endpoint as unverified only', async () => {
  const paths = await makeTree(root);
  const start = Date.now();
  const observed = [];
  const report = await diagnoseWiseRuntime({
    cwd: root,
    timeoutMs: 50,
    env: {WISE_STUDIO_ROOT: paths.studio, STUDIO_DATA_DIR: paths.data,
      STUDIO_DB_PATH: path.join(paths.data, 'catalog.sqlite3'), WISE_URL: 'https://[::1]:9670'},
    probeTcp: (host) => { observed.push(host); return new Promise(() => {}); },
  });
  assert.equal(report.tcp, 'tcp-unreachable');
  assert.equal(report.status, 'blocked');
  assert.equal(report.semanticSearchVerified, false);
  assert.deepEqual(observed, ['::1']);
  assert.ok(Date.now() - start < 1000);
});

test('destroys a stalled numeric TCP connection at its hard deadline', async () => {
  const socket = new EventEmitter();
  let destroyed = false;
  let options;
  socket.destroy = () => { destroyed = true; };
  const reachable = await probeLoopbackTcp('127.0.0.1', 9670, 50, (value) => {
    options = value;
    return socket;
  });
  assert.equal(reachable, false);
  assert.deepEqual(options, {host: '127.0.0.1', port: 9670, family: 4});
  assert.equal(destroyed, true);
});

test('refuses direct TCP probes for numeric nonloopback addresses', async () => {
  let calls = 0;
  const reachable = await probeLoopbackTcp('8.8.8.8', 9670, 50, () => { calls++; });
  assert.equal(reachable, false);
  assert.equal(calls, 0);
});
