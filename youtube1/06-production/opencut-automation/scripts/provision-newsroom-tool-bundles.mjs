import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectFfmpegBundle, inspectPythonBundle } from './newsroom-production-orchestration.mjs';

const AUTOMATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '.newsroom-tool-bundle.json';
const UUID = crypto.randomUUID();
const comparable = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const within = (root, target) => { const a = comparable(root); const b = comparable(target); return a === b || b.startsWith(`${a}${path.sep}`); };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function fail(message, code = 'PROVISION_BLOCKED') { throw Object.assign(new Error(message), { code }); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) fail('Arguments must use --name value');
    if (item === '--verify') { args.verify = true; continue; }
    const value = argv[++i]; if (!value || value.startsWith('--')) fail(`Missing value for ${item}`);
    args[item.slice(2)] = value;
  }
  return args;
}

async function realDirectory(value, label, { allowMissing = false } = {}) {
  if (!path.isAbsolute(value) || value.includes('\0')) fail(`${label} must be an absolute path`);
  const resolved = path.resolve(value);
  let info;
  try { info = await fsp.lstat(resolved); } catch (error) { if (allowMissing && error.code === 'ENOENT') return null; fail(`${label} is unavailable`); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real nonsymlink directory`);
  const real = await fsp.realpath(resolved);
  if (comparable(real) !== comparable(resolved)) fail(`${label} must not resolve through a link`);
  return real;
}

async function validateParents(directory, label) {
  const resolved = path.resolve(directory);
  if (path.parse(resolved).root === resolved) fail(`${label} must not be a filesystem root`);
  const forbidden = [AUTOMATION_ROOT, os.tmpdir(), process.env.HOME, process.env.USERPROFILE].filter((item) => item && path.isAbsolute(item));
  if (forbidden.some((item) => comparable(item) === comparable(resolved))) fail(`${label} is too broad or forbidden`);
  const missing = [];
  let cursor = resolved;
  while (true) {
    try {
      const info = await fsp.lstat(cursor);
      if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} has a linked or invalid parent`);
      const real = await fsp.realpath(cursor); if (comparable(real) !== comparable(cursor)) fail(`${label} has a linked parent`);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') fail(`${label} parent is unavailable`);
      missing.push(cursor); const next = path.dirname(cursor); if (next === cursor) fail(`${label} parent is unavailable`); cursor = next;
    }
  }
  for (const item of missing.reverse()) await fsp.mkdir(item);
  return await realDirectory(resolved, label);
}

async function listFiles(root) {
  const files = [];
  const walk = async (directory, relative = '') => {
    const info = await fsp.lstat(directory); const real = await fsp.realpath(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !within(root, real)) fail('Source contains an unsafe directory');
    const entries = (await fsp.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name); const rel = path.posix.join(relative, entry.name); const item = await fsp.lstat(absolute);
      if (item.isSymbolicLink()) fail('Source contains a symlink or junction');
      if (relative === '' && entry.name === MARKER) { if (!item.isFile()) fail('Source marker is not a regular file'); continue; }
      if (item.isDirectory()) await walk(absolute, rel);
      else if (item.isFile()) { if (item.nlink !== 1) fail('Source contains a hardlink'); files.push({ absolute, path: rel, bytes: item.size }); }
      else fail('Source contains a non-regular entry');
    }
  };
  await walk(root); if (!files.length) fail('Source bundle is empty');
  return files;
}

function launchConfig(kind, args) {
  if (kind === 'ffmpeg') return { ffmpeg: args['ffmpeg-launch'] || 'bin/ffmpeg.exe', ffprobe: args['ffprobe-launch'] || 'bin/ffprobe.exe' };
  return { python: args['python-launch'] || 'python.exe' };
}

function validateLaunches(files, launch, kind) {
  for (const value of Object.values(launch)) {
    if (!value || path.isAbsolute(value) || value.includes('\0') || value.split(/[\\/]/u).includes('..')) fail(`${kind} launch must be a safe relative path`);
    if (!files.some((file) => file.path === value.replaceAll('\\', '/'))) fail(`${kind} launch file is missing`);
  }
}

async function safeRemoveStaging(staging, parent) {
  try {
    const info = await fsp.lstat(staging); const real = await fsp.realpath(staging);
    if (!info.isDirectory() || info.isSymbolicLink() || comparable(path.dirname(real)) !== comparable(parent)) return;
    const walk = async (directory) => {
      for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name); const item = await fsp.lstat(target);
        if (item.isSymbolicLink()) return false;
        if (item.isDirectory() && !(await walk(target))) return false;
      }
      return true;
    };
    if (await walk(real)) await fsp.rm(real, { recursive: true, force: true });
  } catch { /* cleanup is best effort and never follows links */ }
}

async function provisionOne({ kind, sourceRoot, targetRoot, args }) {
  const source = await realDirectory(sourceRoot, `${kind} source`);
  const sourceForbidden = [os.tmpdir(), process.env.HOME, process.env.USERPROFILE, AUTOMATION_ROOT].filter((item) => item && path.isAbsolute(item));
  if (path.parse(source).root === source || sourceForbidden.some((item) => comparable(item) === comparable(source))) fail(`${kind} source is too broad or forbidden`);
  const parent = await validateParents(path.dirname(targetRoot), `${kind} target parent`);
  const target = path.resolve(targetRoot);
  if (path.parse(target).root === target || within(AUTOMATION_ROOT, target) || within(os.tmpdir(), target) || [process.env.HOME, process.env.USERPROFILE].filter(Boolean).some((root) => within(root, target))) fail(`${kind} target is forbidden`);
  const envName = kind === 'ffmpeg' ? 'NEWSROOM_FFMPEG_BUNDLE_ROOT' : 'NEWSROOM_PYTHON_BUNDLE_ROOT';
  try {
    const info = await fsp.lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory()) fail(`${kind} target already exists and is unsafe`);
    const existing = (kind === 'ffmpeg' ? inspectFfmpegBundle : inspectPythonBundle)({ [envName]: target });
    if (existing.status === 'ready') return { status: 'ready', root: target, reused: true };
    const entries = await fsp.readdir(target); if (entries.length) fail(`${kind} target already exists and is nonempty`);
    fail(`${kind} target already exists; refusing overwrite`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = path.join(parent, `.newsroom-provision-${kind}-${UUID}-${crypto.randomUUID()}`);
  let owned = false;
  try {
    await fsp.mkdir(staging); owned = true;
    const files = await listFiles(source); const launch = launchConfig(kind, args); validateLaunches(files, launch, kind);
    for (const file of files) {
      const destination = path.join(staging, ...file.path.split('/')); await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(file.absolute, destination, fs.constants.COPYFILE_EXCL);
    }
    const marker = path.join(staging, MARKER); const markerTemp = path.join(staging, `.${MARKER}.${crypto.randomUUID()}.tmp`);
    await fsp.writeFile(markerTemp, json({ schema: 'newsroom-tool-bundle-v1', kind, launch }), { flag: 'wx' });
    await fsp.rename(markerTemp, marker);
    await fsp.rename(staging, target); owned = false;
    const verified = (kind === 'ffmpeg' ? inspectFfmpegBundle : inspectPythonBundle)({ [envName]: target });
    if (verified.status !== 'ready') fail(`${kind} provisioned bundle failed authority verification`);
    return { status: 'ready', root: target, reused: false };
  } catch (error) { if (owned) await safeRemoveStaging(staging, parent); throw error; }
}

function safeOutput(environment = process.env) {
  const ffmpeg = inspectFfmpegBundle(environment); const python = inspectPythonBundle(environment);
  return { ffmpeg: { status: ffmpeg.status, root: ffmpeg.configuredRoot || null }, python: { status: python.status, root: python.configuredRoot || null } };
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const args = parseArgs(argv);
  if (args.verify) {
    const output = safeOutput(environment); process.stdout.write(json(output));
    if (output.ffmpeg.status !== 'ready' || output.python.status !== 'ready') process.exitCode = 1;
    return output;
  }
  if (!args['ffmpeg-source-root'] || !args['python-source-root'] || !args['target-base']) fail('Provisioning requires --ffmpeg-source-root, --python-source-root, and --target-base');
  const targetBase = path.resolve(args['target-base']); await validateParents(targetBase, 'target base');
  const results = {
    ffmpeg: await provisionOne({ kind: 'ffmpeg', sourceRoot: args['ffmpeg-source-root'], targetRoot: path.join(targetBase, 'ffmpeg'), args }),
    python: await provisionOne({ kind: 'python', sourceRoot: args['python-source-root'], targetRoot: path.join(targetBase, 'python'), args })
  };
  process.stdout.write(json(results)); return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
