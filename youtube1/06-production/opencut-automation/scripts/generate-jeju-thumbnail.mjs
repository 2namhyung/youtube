#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1', 'project.json');
const project = JSON.parse(await fsp.readFile(projectPath, 'utf8'));
const tokens = JSON.parse(await fsp.readFile(path.join(root, 'production', 'templates', 'reference-v3.tokens.json'), 'utf8'));
const projectDir = path.dirname(projectPath);
const sourcePath = path.resolve(projectDir, project.scenes[0].asset);
const visualRun = path.resolve(root, '..', '..', '04-visual-assets', 'runs', 'jeju-school-intrusion-thumbnail-20260803');
const outputPath = path.join(visualRun, 'jeju-school-intrusion-thumbnail-layout-v3-caption-free.png');
const workDir = path.join(root, 'out', '.runs', `jeju-thumbnail-${Date.now().toString(36)}`);
await fsp.mkdir(workDir, { recursive: true });
await fsp.mkdir(visualRun, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
}
function filterPath(filePath) { return filePath.replaceAll('\\', '/').replaceAll(':', '\\:'); }

const fontPath = path.join(workDir, 'NotoSansKR-Black.ttf');
const title1Path = path.join(workDir, 'title-line1.txt');
const title2Path = path.join(workDir, 'title-line2.txt');
const disclosurePath = path.join(workDir, 'disclosure.txt');
await run('python', [path.join(root, 'scripts', 'build-v3-font.py'), 'C:/Windows/Fonts/NotoSansKR-VF.ttf', fontPath, '900']);
await fsp.writeFile(title1Path, project.title.line1, 'utf8');
await fsp.writeFile(title2Path, project.title.line2, 'utf8');
await fsp.writeFile(disclosurePath, '사건 내용 기반 AI 재구성', 'utf8');

// Use the same token-owned media framing and title layer as produce-short.mjs.
// Only the subtitle filter is intentionally omitted.
const { canvas, bands } = tokens.primitive;
const media = tokens.component.media;
const title = tokens.component.title;
const filter = [
  `scale=${media.width}:${media.height}:force_original_aspect_ratio=increase`,
  `crop=${media.width}:${media.height}`,
  'scale=ceil(iw*1.04/2)*2:ceil(ih*1.04/2)*2',
  `crop=${media.width}:${media.height}:(in_w-out_w)*0.5:(in_h-out_h)*0.45`,
  'setsar=1',
  `pad=${canvas.width}:${canvas.height}:${media.x}:${media.y}:color=${tokens.semantic.background}`,
  `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(disclosurePath)}':expansion=none:fontcolor=white@0.74:fontsize=24:x=w-text_w-72:y=${media.y + media.height - 42}`,
  `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(title1Path)}':expansion=none:fontcolor=${tokens.semantic.titleAccent}:fontsize=${title.line1Size}:x=${canvas.width / 2}-text_w/2:y=${title.line1Y}`,
  `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(title2Path)}':expansion=none:fontcolor=${tokens.semantic.titleSecondary}:fontsize=${title.line2Size}:x=${canvas.width / 2}-text_w/2:y=${title.line2Y}`,
].join(',');
const temporary = path.join(workDir, 'thumbnail.png');
await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-vf', filter, '-frames:v', '1', temporary]);
const probe = JSON.parse(await new Promise((resolve, reject) => {
  const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', temporary], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; }); child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(err)));
}));
const stream = probe.streams?.[0];
if (stream?.codec_name !== 'png' || Number(stream.width) !== canvas.width || Number(stream.height) !== canvas.height) throw new Error(`Generated thumbnail must match the canvas: ${JSON.stringify(stream)}`);
await fsp.copyFile(temporary, outputPath);
const sha256 = crypto.createHash('sha256').update(await fsp.readFile(outputPath)).digest('hex');
console.log(JSON.stringify({ output: outputPath, sha256, width: canvas.width, height: canvas.height, source: sourcePath, composition: 'reference-v3-token-framing-title-only-caption-free', bands }, null, 2));
