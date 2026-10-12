#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const sourceRoot = path.join(projectRoot, 'assets', 'video', 'v8-source-grounded-hybrid');
const outputRoot = path.join(projectRoot, 'assets', 'video', 'v9-source-grounded-hybrid-hq');
const names = ['01-classroom-window.mp4', '02-school-exterior.mp4', '03-tumbler-rim.mp4', '04-cctv-monitor.mp4', '05-locked-door.mp4'];
const hashFile = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const probe = (file) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  return JSON.parse(result.stdout).streams?.[0];
};

const assets = [];
for (const name of names) {
  const source = path.join(sourceRoot, name);
  const output = path.join(outputRoot, name);
  const before = probe(source);
  const after = probe(output);
  assets.push({
    name,
    source: path.relative(projectRoot, source).replaceAll(path.sep, '/'),
    sourceSha256: await hashFile(source),
    sourceMedia: { width: before.width, height: before.height, fps: before.r_frame_rate, frames: Number(before.nb_read_frames) },
    output: path.relative(projectRoot, output).replaceAll(path.sep, '/'),
    outputSha256: await hashFile(output),
    outputMedia: { width: after.width, height: after.height, fps: after.r_frame_rate, frames: Number(after.nb_read_frames) },
  });
}
const toolRoot = 'C:/Users/User/tools/realesrgan-ncnn-vulkan-20211212-windows';
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: 'Restore source-grounded environmental motion clips before the fixed 1080x1920 Shorts composition.',
  engine: {
    name: 'Real-ESRGAN ncnn Vulkan',
    release: 'v0.2.3.0 / realesrgan-ncnn-vulkan-20211212-windows',
    repository: 'https://github.com/xinntao/Real-ESRGAN',
    model: 'realesrgan-x4plus',
    scale: 2,
    executableSha256: await hashFile(path.join(toolRoot, 'realesrgan-ncnn-vulkan.exe')),
    modelParamSha256: await hashFile(path.join(toolRoot, 'models', 'realesrgan-x4plus.param')),
    modelWeightsSha256: await hashFile(path.join(toolRoot, 'models', 'realesrgan-x4plus.bin')),
  },
  temporalPolicy: {
    fps: 16,
    interpolation: 'FFmpeg minterpolate only where the scene slot exceeds the original 25-frame clip',
    noTailFreeze: true,
  },
  assets,
};
await fs.writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ written: true, assetCount: assets.length, outputRoot }, null, 2)}\n`);
