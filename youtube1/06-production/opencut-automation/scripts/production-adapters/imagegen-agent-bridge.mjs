import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const READY_SCHEMA = 'newsroom-imagegen-agent-bridge-ready-v1';
const REQUEST_SCHEMA = 'newsroom-imagegen-agent-bridge-request-v1';
const PROVIDER_VERSION = '1.1.0';
const NORMALIZATION_SCHEMA = 'newsroom-imagegen-normalization-v1';
const NORMALIZATION_FILTER = 'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1';
const SAFE_IMAGE = /^scene-\d{3}\.png$/u;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) { throw new Error(message); }
function argsOf(argv) {
  const result = { stage: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--stage') result.stage = true;
    else if (token.startsWith('--') && token.includes('=')) {
      const split = token.indexOf('='); result[token.slice(2, split)] = token.slice(split + 1);
    } else if (token.startsWith('--')) result[token.slice(2)] = argv[++index];
  }
  return result;
}
function contained(root, target) {
  const base = path.resolve(root); const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) fail('Bridge path escapes its authority root');
  return resolved;
}
async function readJson(file) { return JSON.parse(await fsp.readFile(file, 'utf8')); }
async function writeExclusive(file, value) {
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
async function writeOrVerify(file, value) {
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  try { await fsp.writeFile(file, expected, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) { if (error?.code !== 'EEXIST' || await fsp.readFile(file, 'utf8') !== expected) throw error; }
}
function expectedImages(request) {
  if (request?.schema !== 'newsroom-imagegen-request-v1' || !Array.isArray(request.scenes) || request.scenes.length < 1) fail('Invalid ImageGen bridge request');
  return request.scenes.map((scene) => {
    const name = path.basename(String(scene.output || ''));
    if (!SAFE_IMAGE.test(name)) fail('ImageGen bridge output name is invalid');
    return name;
  });
}
function referenceBindings(request) {
  const references = request?.references?.references;
  if (!Array.isArray(references)) fail('ImageGen bridge reference authority is invalid');
  return references.map((reference) => ({ id: reference.id, role: reference.role, sha256: reference.admittedAsset?.sha256 || null, bytes: reference.admittedAsset?.bytes ?? null }));
}
function inspectPng(bytes, name, { production = false } = {}) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') fail(`${name} is not a PNG`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (production && (width !== 1080 || height !== 1920)) fail(`${name} must be exactly 1080x1920`);
  if (!production && (width < 512 || height < 896 || height <= width || Math.abs(width / height - 9 / 16) > 0.02)) fail(`${name} must be a production-capable near-9:16 portrait ImageGen source`);
  return { width, height, bytes: bytes.length, sha256: hash(bytes) };
}
function runTransform(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ImageGen normalization failed (${code}): ${stderr}`)));
  });
}

async function stage({ bridgeRoot, requestHash, sourceDir, ffmpeg }) {
  if (!/^[a-f0-9]{64}$/u.test(String(requestHash || ''))) fail('Stage request hash is invalid');
  if (!path.isAbsolute(String(ffmpeg || ''))) fail('Stage requires an absolute --ffmpeg executable');
  const ffmpegInfo = await fsp.lstat(ffmpeg); if (!ffmpegInfo.isFile() || ffmpegInfo.isSymbolicLink()) fail('Stage FFmpeg executable is unsafe');
  const ffmpegSha256 = hash(await fsp.readFile(ffmpeg));
  const inbox = contained(bridgeRoot, path.join(bridgeRoot, requestHash));
  const envelope = await readJson(path.join(inbox, 'generation-request.json'));
  if (envelope.schema !== REQUEST_SCHEMA || envelope.requestHash !== requestHash) fail('Stage request authority mismatch');
  const request = envelope.request; const names = expectedImages(request); const stagedRoot = contained(inbox, path.join(inbox, 'assets'));
  const sourceRoot = contained(inbox, path.join(inbox, 'sources'));
  await Promise.all([fsp.mkdir(stagedRoot, { recursive: true }), fsp.mkdir(sourceRoot, { recursive: true })]);
  const assets = [];
  for (const name of names) {
    const source = contained(sourceDir, path.join(sourceDir, name)); const info = await fsp.lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) fail(`${name} staging source is not a regular file`);
    const bytes = await fsp.readFile(source); const sourceInspection = inspectPng(bytes, name);
    const preservedSource = contained(sourceRoot, path.join(sourceRoot, name));
    await fsp.writeFile(preservedSource, bytes, { flag: 'wx' });
    const target = contained(stagedRoot, path.join(stagedRoot, name));
    await runTransform(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-i', preservedSource, '-vf', NORMALIZATION_FILTER, '-frames:v', '1', '-c:v', 'png', target]);
    const outputBytes = await fsp.readFile(target); const outputInspection = inspectPng(outputBytes, name, { production: true });
    assets.push({
      path: name,
      sha256: outputInspection.sha256,
      bytes: outputInspection.bytes,
      productionAsset: true,
      fallbackUsed: false,
      generator: 'openai-imagegen-built-in',
      source: { path: name, ...sourceInspection, generator: 'openai-imagegen-built-in' },
      normalization: { schema: NORMALIZATION_SCHEMA, sourceSha256: sourceInspection.sha256, outputSha256: outputInspection.sha256, outputWidth: 1080, outputHeight: 1920, filter: NORMALIZATION_FILTER, ffmpegExecutableSha256: ffmpegSha256 }
    });
  }
  await writeExclusive(path.join(inbox, 'ready.json'), { schema: READY_SCHEMA, requestHash, assets });
  process.stdout.write(`${JSON.stringify({ status: 'ready', requestHash, assets: assets.length })}\n`);
}

async function provide({ bridgeRoot, requestPath, outputDir }) {
  const requestBytes = await fsp.readFile(requestPath); const requestHash = hash(requestBytes); const request = JSON.parse(requestBytes.toString('utf8'));
  const names = expectedImages(request); const inbox = contained(bridgeRoot, path.join(bridgeRoot, requestHash)); await fsp.mkdir(inbox, { recursive: true });
  await writeOrVerify(path.join(inbox, 'generation-request.json'), { schema: REQUEST_SCHEMA, requestHash, request });
  const deadline = Date.now() + 30 * 60_000; let ready;
  while (Date.now() < deadline) {
    try { ready = await readJson(path.join(inbox, 'ready.json')); break; }
    catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await sleep(1_000);
  }
  if (!ready || ready.schema !== READY_SCHEMA || ready.requestHash !== requestHash || !Array.isArray(ready.assets)) fail('ImageGen bridge timed out or received invalid readiness authority');
  const declared = new Map(ready.assets.map((asset) => [asset.path, asset])); const attested = []; const sourceAssets = []; const normalizations = [];
  for (const name of names) {
    const declaration = declared.get(name); if (!declaration || declaration.productionAsset !== true || declaration.fallbackUsed !== false || declaration.generator !== 'openai-imagegen-built-in') fail(`${name} has no admitted built-in ImageGen declaration`);
    const preservedSource = contained(inbox, path.join(inbox, 'sources', name)); const sourceInfo = await fsp.lstat(preservedSource);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) fail(`${name} preserved ImageGen source is unsafe`);
    const sourceBytes = await fsp.readFile(preservedSource); const sourceInspection = inspectPng(sourceBytes, name);
    if (sourceInspection.sha256 !== declaration.source?.sha256 || sourceInspection.bytes !== declaration.source?.bytes || sourceInspection.width !== declaration.source?.width || sourceInspection.height !== declaration.source?.height || declaration.source?.generator !== 'openai-imagegen-built-in') fail(`${name} preserved ImageGen source authority drifted`);
    const source = contained(inbox, path.join(inbox, 'assets', name)); const info = await fsp.lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) fail(`${name} bridge asset is unsafe`);
    const bytes = await fsp.readFile(source); inspectPng(bytes, name, { production: true });
    if (bytes.length !== declaration.bytes || hash(bytes) !== declaration.sha256) fail(`${name} bridge asset authority drifted`);
    await fsp.writeFile(contained(outputDir, path.join(outputDir, name)), bytes, { flag: 'wx' });
    attested.push({ path: name, sha256: declaration.sha256, bytes: declaration.bytes, productionAsset: true, fallbackUsed: false });
    sourceAssets.push(declaration.source); normalizations.push({ path: name, ...declaration.normalization });
  }
  if (declared.size !== names.length) fail('ImageGen bridge readiness contains unexpected assets');
  const attestation = { schema: 'newsroom-imagegen-provider-attestation-v1', providerId: 'openai-imagegen-agent-bridge', providerVersion: PROVIDER_VERSION, authorityHash: request.authorityHash, requestHash, productionAsset: true, fallbackUsed: false, references: referenceBindings(request), sourceAssets, normalizations, assets: attested };
  await writeExclusive(path.join(outputDir, 'provider-attestation.json'), attestation);
}

const options = argsOf(process.argv.slice(2));
if (!path.isAbsolute(String(options['bridge-root'] || ''))) fail('--bridge-root must be absolute');
if (options.stage) await stage({ bridgeRoot: options['bridge-root'], requestHash: options['request-hash'], sourceDir: options['source-dir'], ffmpeg: options.ffmpeg });
else {
  if (!path.isAbsolute(String(options.request || '')) || !path.isAbsolute(String(options['output-dir'] || ''))) fail('Provider request/output paths must be absolute');
  await provide({ bridgeRoot: options['bridge-root'], requestPath: options.request, outputDir: options['output-dir'] });
}
