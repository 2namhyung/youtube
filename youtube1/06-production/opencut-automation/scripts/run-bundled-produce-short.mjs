#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPythonBundleEnvironment, productionConfiguration, withAuthorityBundleSnapshot } from './newsroom-production-orchestration.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runRoot = path.join(root, 'out', `.manual-tool-run-${crypto.randomUUID()}`);
const passthrough = process.argv.slice(2);
const contractCheck = passthrough.includes('--bundle-contract-check');
const args = passthrough.filter((item) => item !== '--bundle-contract-check');
const configuration = productionConfiguration();

function run(command, argv, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { ...options, shell: false, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Bundled produce-short exited ${code}`)));
  });
}

await fsp.mkdir(runRoot, { recursive: false, mode: 0o700 });
try {
  await withAuthorityBundleSnapshot({ jobRoot: runRoot, kind: 'ffmpeg', authority: configuration.ffmpegBundle }, (ffmpeg) => withAuthorityBundleSnapshot({ jobRoot: runRoot, kind: 'python', authority: configuration.pythonBundle }, async (python) => {
    const manifestPath = path.join(runRoot, 'tool-bundle-invocation.json');
    const manifestBytes = Buffer.from(`${JSON.stringify({ schema: 'newsroom-tool-bundle-invocation-v1', bundles: [{ kind: 'ffmpeg', root: ffmpeg.root, launch: ffmpeg.launch, files: ffmpeg.files, authorityManifestSha256: ffmpeg.manifestSha256 }, { kind: 'python', root: python.root, launch: { python: python.launch.python }, files: python.files, authorityManifestSha256: python.manifestSha256 }] }, null, 2)}\n`, 'utf8');
    await fsp.writeFile(manifestPath, manifestBytes, { flag: 'wx', mode: 0o600 });
    const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
    ffmpeg.fence(); python.fence();
    if (contractCheck) { process.stdout.write(`${JSON.stringify({ status: 'ready', ffmpegBundle: ffmpeg.manifestSha256, pythonBundle: python.manifestSha256 })}\n`); return; }
    await run(process.execPath, [path.join(root, 'scripts', 'produce-short.mjs'), '--workspace-root', root, ...args, '--ffmpeg-executable', ffmpeg.launch.ffmpeg, '--ffprobe-executable', ffmpeg.launch.ffprobe, '--python-executable', python.launch.python, '--tool-bundle-manifest', manifestPath, '--tool-bundle-manifest-sha256', manifestSha256], { cwd: root, env: buildPythonBundleEnvironment(python.root) });
  }));
} finally {
  const resolved = path.resolve(runRoot); const parent = path.resolve(root, 'out');
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('.manual-tool-run-')) throw new Error('Refusing unsafe bundled runner cleanup');
  const info = await fsp.lstat(resolved).catch(() => null); if (info?.isDirectory() && !info.isSymbolicLink()) await fsp.rm(resolved, { recursive: true, force: true });
}
