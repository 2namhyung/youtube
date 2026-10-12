#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const configPath = path.resolve(option('--config') || '');
const verifyOnly = args.includes('--verify');
if (!option('--config')) throw new Error('Usage: node scripts/generate-editorial-thumbnail.mjs --config <thumbnail.config.json>');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = async (file, label) => {
  try { return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/u, '')); }
  catch (error) { throw new Error(`Invalid UTF-8 JSON in ${label}: ${error.message}`); }
};
const safeRelative = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) throw new Error(`${label} must be a relative path`);
  return value;
};
const assertInsideAutomation = (target, label) => {
  const relative = path.relative(automationRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the automation workspace`);
};
const run = (command, commandArgs) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, { cwd: automationRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr}`)));
});
const filterPath = (file) => file.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
const atomicWrite = async (target, bytes) => {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, bytes);
  await fsp.rename(temporary, target);
};

const config = await readJson(configPath, 'thumbnail config');
const configDir = path.dirname(configPath);
if (config.schema !== 'editorial-thumbnail-source-v1') throw new Error('thumbnail config schema must be editorial-thumbnail-source-v1');
if (config.layoutId !== 'reference-v3-caption-free-headline-v1') throw new Error('unsupported thumbnail layoutId');
if (config.spokenCaptions !== false) throw new Error('spokenCaptions must be false');
for (const [key, value] of [['headline.line1', config.headline?.line1], ['headline.line2', config.headline?.line2], ['aiDisclosure.text', config.aiDisclosure?.text]]) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`);
}
if (config.headline?.required !== true || config.aiDisclosure?.required !== true) throw new Error('headline and AI disclosure must be required');
for (const record of [config.source, config.tokens]) {
  if (!record || !/^[a-f0-9]{64}$/u.test(record.sha256 || '')) throw new Error('source and tokens require SHA-256');
}
const sourceRelative = safeRelative(config.source.image, 'source.image');
const tokensRelative = safeRelative(config.tokens.path, 'tokens.path');
const outputRelative = safeRelative(config.output.image, 'output.image');
const manifestRelative = safeRelative(config.output.manifest, 'output.manifest');
const sourcePath = path.resolve(configDir, sourceRelative);
const tokensPath = path.resolve(configDir, tokensRelative);
const outputPath = path.resolve(configDir, outputRelative);
const manifestPath = path.resolve(configDir, manifestRelative);
for (const [label, target] of [['source.image', sourcePath], ['tokens.path', tokensPath], ['output.image', outputPath], ['output.manifest', manifestPath]]) assertInsideAutomation(target, label);
for (const [label, file, expected] of [['source', sourcePath, config.source.sha256], ['tokens', tokensPath, config.tokens.sha256]]) {
  const actual = sha256(await fsp.readFile(file));
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch`);
}

const tokens = await readJson(tokensPath, 'thumbnail tokens');
const { canvas, bands } = tokens.primitive || {};
const media = tokens.component?.media;
const title = tokens.component?.title;
if (canvas?.width !== 1080 || canvas?.height !== 1920 || !media || !title || bands?.top + bands?.middle + bands?.bottom !== 1920) throw new Error('reference-v3 token geometry is invalid');

const workDir = path.join(automationRoot, 'out', '.runs', `editorial-thumbnail-${process.pid}-${Date.now().toString(36)}`);
await fsp.mkdir(workDir, { recursive: true });
try {
  const fontPath = path.join(workDir, 'NotoSansKR-Black.ttf');
  const line1Path = path.join(workDir, 'headline-line1.txt');
  const line2Path = path.join(workDir, 'headline-line2.txt');
  const disclosurePath = path.join(workDir, 'ai-disclosure.txt');
  const candidatePath = path.join(workDir, 'thumbnail.png');
  await run('python', [path.join(automationRoot, 'scripts', 'build-v3-font.py'), 'C:/Windows/Fonts/NotoSansKR-VF.ttf', fontPath, '900']);
  await Promise.all([
    fsp.writeFile(line1Path, config.headline.line1, 'utf8'),
    fsp.writeFile(line2Path, config.headline.line2, 'utf8'),
    fsp.writeFile(disclosurePath, config.aiDisclosure.text, 'utf8'),
  ]);
  const filter = [
    `scale=${media.width}:${media.height}:force_original_aspect_ratio=increase`,
    `crop=${media.width}:${media.height}`,
    'scale=ceil(iw*1.04/2)*2:ceil(ih*1.04/2)*2',
    `crop=${media.width}:${media.height}:(in_w-out_w)*0.5:(in_h-out_h)*0.45`,
    'setsar=1',
    `pad=${canvas.width}:${canvas.height}:${media.x}:${media.y}:color=${tokens.semantic.background}`,
    `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(disclosurePath)}':expansion=none:fontcolor=white@0.74:fontsize=24:x=w-text_w-72:y=${media.y + media.height - 42}`,
    `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(line1Path)}':expansion=none:fontcolor=${tokens.semantic.titleAccent}:fontsize=${title.line1Size}:x=${canvas.width / 2}-text_w/2:y=${title.line1Y}`,
    `drawtext=fontfile='${filterPath(fontPath)}':textfile='${filterPath(line2Path)}':expansion=none:fontcolor=${tokens.semantic.titleSecondary}:fontsize=${title.line2Size}:x=${canvas.width / 2}-text_w/2:y=${title.line2Y}`,
  ].join(',');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-vf', filter, '-frames:v', '1', candidatePath]);
  const candidate = await fsp.readFile(candidatePath);
  if (candidate.length < 24 || candidate.readUInt32BE(16) !== 1080 || candidate.readUInt32BE(20) !== 1920) throw new Error('generated thumbnail must be a 1080x1920 PNG');

  const scriptPath = fileURLToPath(import.meta.url);
  const manifest = {
    schema: 'editorial-thumbnail-contract-v1',
    layoutId: config.layoutId,
    canvas: { width: 1080, height: 1920 },
    spokenCaptions: false,
    headline: { required: true, line1: config.headline.line1, line2: config.headline.line2 },
    aiDisclosure: { required: true, text: config.aiDisclosure.text },
    source: { image: sourceRelative, sha256: config.source.sha256, role: config.source.role },
    tokens: { path: tokensRelative, sha256: config.tokens.sha256 },
    renderer: { id: 'deterministic-editorial-thumbnail', version: 1, script: path.relative(configDir, scriptPath).replaceAll(path.sep, '/'), sha256: sha256(await fsp.readFile(scriptPath)), config: path.basename(configPath), configSha256: sha256(await fsp.readFile(configPath)) },
    output: { image: outputRelative, sha256: sha256(candidate), bytes: candidate.length, width: 1080, height: 1920 },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (verifyOnly) {
    const currentOutput = await fsp.readFile(outputPath);
    const currentManifest = await fsp.readFile(manifestPath);
    if (!currentOutput.equals(candidate) || !currentManifest.equals(manifestBytes)) throw new Error('thumbnail output/manifest is not reproducible from the locked creator input');
  } else {
    await atomicWrite(outputPath, candidate);
    await atomicWrite(manifestPath, manifestBytes);
  }
  process.stdout.write(`${JSON.stringify({ status: verifyOnly ? 'verified' : 'generated', thumbnail: outputPath, manifest: manifestPath, sha256: manifest.output.sha256, bytes: manifest.output.bytes }, null, 2)}\n`);
} finally {
  await fsp.rm(workDir, { recursive: true, force: true });
}
