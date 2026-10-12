#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './production-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
const args = process.argv.slice(2);
const privateDirArg = args.includes('--private-handoff') ? args[args.indexOf('--private-handoff') + 1] : null;
const projectArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
const contractArg = args.includes('--contract') ? args[args.indexOf('--contract') + 1] : null;
if (!privateDirArg) {
  throw new Error('Usage: npm run render:promote-private -- --private-handoff out/.private/<project>/<version>.handoff [--project <project.json> --contract <contract.json>]');
}

const privateRoot = path.resolve(outDir, '.private');
const privateDir = path.resolve(privateDirArg);
const relativePrivateDir = path.relative(privateRoot, privateDir);
if (!relativePrivateDir || relativePrivateDir.startsWith('..') || path.isAbsolute(relativePrivateDir)) {
  throw new Error(`Private handoff must remain under ${privateRoot}`);
}

const handoffPath = path.join(privateDir, 'handoff.json');
if (!fs.existsSync(handoffPath)) throw new Error(`Private handoff is missing: ${handoffPath}`);
const handoff = JSON.parse(await fsp.readFile(handoffPath, 'utf8'));
const versionId = String(handoff.versionId || '');
if (!/^[A-Za-z0-9_-]+$/.test(versionId) || path.basename(privateDir) !== `${versionId}.handoff`) {
  throw new Error('Private handoff directory and versionId do not match');
}
if (!handoff.project || handoff.project.width !== 1080 || handoff.project.height !== 1920 || handoff.project.fps !== 30) {
  throw new Error('Private handoff project must be 1080x1920 at 30fps');
}
if (!Array.isArray(handoff.assets) || handoff.assets.length === 0 || !Array.isArray(handoff.tracks) || !Array.isArray(handoff.cues)) {
  throw new Error('Private handoff is missing editable assets, tracks, or cues');
}
const isJeju = handoff.sourceIntegrity?.slug === 'jeju-school-intrusion';
if (!isJeju && (!projectArg || !contractArg)) throw new Error('Generic promotion requires the exact --project and --contract pair');
if (Boolean(projectArg) !== Boolean(contractArg)) throw new Error('--project and --contract must be supplied together');
const actualProvider = handoff.narrationProvider?.actualProvider;
if (!['qwen3-tts', 'approved-locked'].includes(actualProvider) || handoff.narrationProvider?.fallbackUsed !== false) {
  throw new Error('Only verified Qwen3-TTS or approved-locked private renders without fallback can be promoted by this command');
}
if (handoff.narrationProvider?.speechAcceptance?.accepted !== true || handoff.narrationProvider?.speechAcceptance?.final?.accepted !== true) {
  throw new Error('Private narration did not pass final strict speech acceptance');
}

let promotedMedia = handoff.media;
let promotedBgm = handoff.bgm;
if ((!promotedMedia || !promotedBgm) && projectArg) {
  const projectPath = path.resolve(projectArg);
  const projectSource = await fsp.readFile(projectPath, 'utf8');
  const projectHash = crypto.createHash('sha256').update(projectSource.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  if (projectHash !== handoff.sourceIntegrity?.projectConfigSha256) {
    throw new Error('Promotion project does not match the private handoff project configuration hash');
  }
  const project = JSON.parse(projectSource);
  if (!promotedMedia) promotedMedia = project.media;
  if (!promotedBgm && project.bgm) throw new Error('Private handoff is missing rendered BGM provenance; rerender before promotion');
}
if (projectArg && contractArg) {
  const projectPath = path.resolve(projectArg);
  const contractPath = path.resolve(contractArg);
  const [projectSource, contractBytes] = await Promise.all([fsp.readFile(projectPath, 'utf8'), fsp.readFile(contractPath)]);
  const projectHash = crypto.createHash('sha256').update(projectSource.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  const contractHash = crypto.createHash('sha256').update(contractBytes).digest('hex');
  const projectAuthority = path.relative(root, projectPath).replaceAll(path.sep, '/');
  const contractAuthority = path.relative(root, contractPath).replaceAll(path.sep, '/');
  if (projectHash !== handoff.sourceIntegrity?.projectConfigSha256 || contractHash !== handoff.sourceIntegrity?.contractSha256 || projectAuthority !== handoff.sourceIntegrity?.projectAuthority || contractAuthority !== handoff.sourceIntegrity?.contractAuthority) {
    throw new Error('Promotion project/contract does not match private handoff sourceIntegrity');
  }
}
if (handoff.editableTrackContract?.bgm?.required === true && handoff.editableTrackContract.bgm.status !== 'ready') {
  throw new Error('Required BGM is not ready in the private editable handoff');
}
if (handoff.editableTrackContract?.bgm?.status === 'ready' && (!promotedBgm || promotedBgm.status !== 'ready' || typeof promotedBgm.provenance !== 'string' || !promotedBgm.provenance.trim() || promotedBgm.duckUnderNarration !== true)) {
  throw new Error('Promoted BGM must preserve ready status, provenance and narration ducking');
}

const fallbackVideo = String(handoff.fallback?.video || '');
const fallbackThumbnail = String(handoff.fallback?.thumbnail || '');
if (path.basename(fallbackVideo) !== fallbackVideo || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(fallbackVideo)) {
  throw new Error('Private fallback video filename is invalid');
}
if (path.basename(fallbackThumbnail) !== fallbackThumbnail || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(fallbackThumbnail)) {
  throw new Error('Private fallback thumbnail filename is invalid');
}
const privateProjectDir = path.dirname(privateDir);
const sourceVideo = path.join(privateProjectDir, fallbackVideo);
const sourceThumbnail = path.join(privateProjectDir, fallbackThumbnail);
if (!fs.existsSync(sourceVideo) || !fs.existsSync(sourceThumbnail)) {
  throw new Error('Private fallback video or thumbnail is missing');
}

const versionDir = path.join(outDir, 'registry', 'versions');
const handoffRoot = path.join(outDir, 'registry', 'handoffs', versionId);
const versionMetadataPath = path.join(versionDir, `${versionId}.json`);
const versionHandoffPath = path.join(versionDir, `${versionId}.handoff.json`);
const outputVideo = path.join(outDir, fallbackVideo);
const outputThumbnail = path.join(outDir, fallbackThumbnail);
for (const destination of [handoffRoot, versionMetadataPath, versionHandoffPath, outputVideo, outputThumbnail]) {
  if (fs.existsSync(destination)) throw new Error(`Promotion target already exists: ${destination}`);
}

const safeSourceAsset = (asset) => {
  const name = String(asset?.name || '');
  if (!name || path.basename(name) !== name) throw new Error(`Unsafe handoff asset name: ${name}`);
  const source = path.resolve(root, String(asset?.path || ''));
  const relative = path.relative(privateDir, source);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.basename(source) !== name) {
    throw new Error(`Handoff asset escaped its private directory: ${name}`);
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Handoff asset is missing: ${name}`);
  return { ...asset, name, source };
};
const sourceAssets = handoff.assets.map(safeSourceAsset);
if (new Set(sourceAssets.map((asset) => asset.name)).size !== sourceAssets.length) {
  throw new Error('Private handoff contains duplicate asset names');
}

const runJson = (command, commandArgs) => new Promise((resolve, reject) => {
  const child = spawn(command, commandArgs, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    try { resolve(JSON.parse(stdout)); } catch (error) { reject(new Error(`${command} returned invalid JSON: ${error.message}`)); }
  });
});
const sha256 = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(filePath);
  for await (const chunk of input) hash.update(chunk);
  return hash.digest('hex');
};

if (actualProvider === 'approved-locked') {
  const approvedAudioSha256 = String(handoff.narrationProvider?.approvedAudioSha256 || '');
  if (!/^[0-9a-fA-F]{64}$/.test(approvedAudioSha256)) {
    throw new Error('Approved-locked narration approvedAudioSha256 must be a 64-hex hash');
  }
  const narrationAssetName = String(handoff.editableTrackContract?.narration?.asset || '');
  const narrationAsset = sourceAssets.find((asset) => asset.name === narrationAssetName);
  if (!narrationAsset) {
    throw new Error(`Approved-locked narration asset is missing from handoff assets: ${narrationAssetName}`);
  }
  const narrationAssetSha256 = await sha256(narrationAsset.source);
  if (approvedAudioSha256.toLowerCase() !== narrationAssetSha256) {
    throw new Error(`Approved-locked narration asset checksum mismatch: ${narrationAssetName}`);
  }
}

const probe = await runJson('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', sourceVideo,
]);
const stream = probe.streams?.[0];
const duration = Number(stream?.duration || 0);
const frames = Number(stream?.nb_read_frames || 0);
if (stream?.width !== 1080 || stream?.height !== 1920 || stream?.r_frame_rate !== '30/1' || !(duration > 0) || !Number.isInteger(frames) || frames < 1) {
  throw new Error(`Private fallback video failed validation: ${JSON.stringify(stream)}`);
}

await fsp.mkdir(versionDir, { recursive: true });
const temporaryHandoffRoot = `${handoffRoot}.tmp-${process.pid}`;
await fsp.mkdir(temporaryHandoffRoot, { recursive: false });
let promotionCommitted = false;
try {
  const promotedAssets = [];
  for (const asset of sourceAssets) {
    const destination = path.join(temporaryHandoffRoot, asset.name);
    await fsp.copyFile(asset.source, destination, fs.constants.COPYFILE_EXCL);
    if (await sha256(asset.source) !== await sha256(destination)) throw new Error(`Asset checksum mismatch after copy: ${asset.name}`);
    promotedAssets.push({
      name: asset.name,
      path: path.relative(root, path.join(handoffRoot, asset.name)).replaceAll(path.sep, '/'),
      mime: asset.mime,
    });
  }
  await fsp.rename(temporaryHandoffRoot, handoffRoot);
  await fsp.copyFile(sourceVideo, outputVideo, fs.constants.COPYFILE_EXCL);
  await fsp.copyFile(sourceThumbnail, outputThumbnail, fs.constants.COPYFILE_EXCL);
  if (await sha256(sourceVideo) !== await sha256(outputVideo) || await sha256(sourceThumbnail) !== await sha256(outputThumbnail)) {
    throw new Error('Fallback media checksum mismatch after copy');
  }

  const promotedHandoff = { ...handoff, ...(promotedMedia ? { media: promotedMedia } : {}), assets: promotedAssets };
  const handoffFile = `${versionId}.handoff.json`;
  const metadata = {
    versionId,
    path: outputVideo,
    thumbnailPath: outputThumbnail,
    fileName: fallbackVideo,
    thumbnailFileName: fallbackThumbnail,
    thumbnail: fallbackThumbnail,
    videoUrl: `/api/renders/final?versionId=${versionId}`,
    thumbnailUrl: `/api/renders/final/thumbnail?versionId=${versionId}`,
    title: String(handoff.project.name || ''),
    duration,
    frames,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    videoEncoding: { codec: 'libx264', preset: 'medium', crf: 17, pixelFormat: 'yuv420p' },
    template: 'reference-v3',
    templateId: 'reference-v3',
    timestamp: new Date().toISOString(),
    handoffFile,
    ...(handoff.sourceIntegrity ? { sourceIntegrity: handoff.sourceIntegrity } : {}),
    ...(promotedBgm ? { bgm: promotedBgm } : {}),
    ...(handoff.thumbnailOverride ? { thumbnailOverride: handoff.thumbnailOverride } : {}),
    ...(handoff.narrationProvider ? { narrationProvider: handoff.narrationProvider } : {}),
    ...(promotedMedia ? { media: promotedMedia } : {}),
    ...(handoff.releaseGate ? {
      publishable: handoff.publishable,
      releaseStatus: handoff.releaseStatus,
      releaseGate: handoff.releaseGate,
    } : {}),
  };
  await writeAtomic(versionHandoffPath, `${JSON.stringify(promotedHandoff, null, 2)}\n`);
  await writeAtomic(versionMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const latestPath = path.join(outDir, 'latest-render.json');
  let previousVersionId = null;
  if (fs.existsSync(latestPath)) {
    try { previousVersionId = JSON.parse(await fsp.readFile(latestPath, 'utf8')).versionId || null; } catch { /* replace invalid pointer */ }
  }
  await writeAtomic(latestPath, `${JSON.stringify(metadata, null, 2)}\n`);
  promotionCommitted = true;
  console.log(JSON.stringify({ promoted: true, versionId, previousVersionId, metadataPath: versionMetadataPath, handoffPath: versionHandoffPath, videoPath: outputVideo, thumbnailPath: outputThumbnail }, null, 2));
} catch (error) {
  await fsp.rm(temporaryHandoffRoot, { recursive: true, force: true });
  if (!promotionCommitted) {
    await Promise.all([
      fsp.rm(handoffRoot, { recursive: true, force: true }),
      fsp.rm(versionMetadataPath, { force: true }),
      fsp.rm(versionHandoffPath, { force: true }),
      fsp.rm(outputVideo, { force: true }),
      fsp.rm(outputThumbnail, { force: true }),
    ]);
  }
  throw error;
}
