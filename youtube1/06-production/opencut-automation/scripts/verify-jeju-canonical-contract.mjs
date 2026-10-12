#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const baselinePath = path.join(projectDir, 'canonical-baseline.json');
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = async (file) => digest(await fs.readFile(file));
const hashJson = (value) => digest(JSON.stringify(value));
const resolveRoot = (file) => path.isAbsolute(file) ? file : path.resolve(root, file);
const probe = (file) => {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `ffprobe failed for ${file}: ${result.stderr}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  assert.ok(stream, `ffprobe returned no video stream for ${file}`);
  return { width: stream.width, height: stream.height, fps: stream.r_frame_rate, frames: Number(stream.nb_read_frames) };
};
const equalFileHash = async (file, expected, label) => assert.equal(await hashFile(file), expected, `${label} hash`);
const args = process.argv.slice(2);
const versionIndex = args.indexOf('--version');
const exactVersion = versionIndex >= 0 ? args[versionIndex + 1] : null;
if (versionIndex >= 0 && !/^[A-Za-z0-9_-]+$/.test(exactVersion || '')) throw new Error('--version requires a safe exact version ID');

const baseline = await readJson(baselinePath);
assert.equal(baseline.schemaVersion, 2);
const selectedRegistryPath = exactVersion
  ? path.join(root, 'out', 'registry', 'versions', `${exactVersion}.json`)
  : path.join(root, 'out', 'latest-render.json');
const latest = await readJson(selectedRegistryPath);
if (exactVersion) assert.equal(latest.versionId, exactVersion, 'selected registry version mismatch');

// Explicit v17 editorial-cartoon release path. This exact opt-in variant
// never relaxes the canonical-baseline assertions below.
if (latest.versionId === 'msg5rl1z-45892-5gfps1') {
  const v17ProjectPath = path.join(projectDir, 'project-v17-editorial-cartoon.json');
  const v17ContractPath = path.join(projectDir, 'pipeline-contract-v17-editorial-cartoon.json');
  const expectedProjectSha256 = 'e538ffe95377a42b45780633bf3c1fd747cf581b092c914def4f4ed4a4de9dea';
  const expectedContractSha256 = '1e5774554d24455ef779a86977fa8e79f41e84dfd73a42307f168867f44e1eb5';
  const expectedVideoSha256 = 'ffe3e25e27e4728a4b8764f3cfa808a179340e0765ba59870c84f204117692c6';
  assert.equal(await hashFile(v17ProjectPath), expectedProjectSha256, 'v17 project hash');
  assert.equal(await hashFile(v17ContractPath), expectedContractSha256, 'v17 pipeline contract hash');
  assert.equal(latest.sourceIntegrity?.projectConfigSha256, expectedProjectSha256, 'v17 source project hash');
  assert.equal(await hashFile(latest.path), expectedVideoSha256, 'v17 video hash');
  assert.deepEqual({ ...latest.resolution, fps: latest.fps, frames: latest.frames, duration: latest.duration }, {
    width: 1080, height: 1920, fps: 30, frames: 1524, duration: 50.8,
  });
  const v17Check = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-v17-editorial-cartoon-contract.mjs')], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(v17Check.status, 0, `v17 contract failed: ${v17Check.stderr || v17Check.stdout}`);
  const v17Handoff = await readJson(path.join(root, 'out', 'registry', 'versions', `${latest.versionId}.handoff.json`));
  assert.equal(v17Handoff.versionId, latest.versionId);
  assert.equal(v17Handoff.project.width, 1080); assert.equal(v17Handoff.project.height, 1920); assert.equal(v17Handoff.project.fps, 30);
  assert.equal(v17Handoff.editableTrackContract?.captions?.cueCount, 36);
  assert.equal(v17Handoff.editableTrackContract?.narration?.asset, 'narration-retimed.m4a');
  assert.equal(v17Handoff.editableTrackContract?.bgm?.asset, 'background-music.m4a');
  const bgmTrack = v17Handoff.tracks.find((track) => track.type === 'audio' && track.src === 'background-music.m4a');
  assert.equal(bgmTrack?.audioStyle?.volumeDb, -16);
  assert.equal(bgmTrack?.audioStyle?.duckUnderNarration, true);
  process.stdout.write(`${JSON.stringify({ status: 'passed', contractId: 'jeju-school-intrusion-v17-editorial-cartoon', versionId: latest.versionId, output: { width: 1080, height: 1920, fps: 30, frames: 1524, duration: 50.8 }, visualOverrides: 21 }, null, 2)}\n`);
  process.exit(0);
}

// The original promotion contract remains the canonical-baseline path.  New
// versions must be explicitly registered below; an unregistered version fails
// closed instead of being treated as a baseline-compatible render.
if (latest.versionId === baseline.versionId) {
  assert.equal(baseline.contractId, 'jeju-school-intrusion-v10-source-grounded-hybrid-hq-7jq-layout');
  assert.deepEqual({ ...latest.resolution, fps: latest.fps, frames: latest.frames, duration: latest.duration }, baseline.output);
  await equalFileHash(latest.path, baseline.artifacts.videoSha256, 'canonical video');
  assert.equal(latest.sourceIntegrity?.projectConfigSha256, baseline.artifacts.projectConfigSha256);
  await equalFileHash(path.join(projectDir, baseline.motionEnhancement.manifest), baseline.motionEnhancement.manifestSha256, 'motion manifest');
  const handoffPath = path.join(root, 'out', 'registry', 'versions', `${latest.versionId}.handoff.json`);
  const handoff = await readJson(handoffPath);
  await equalFileHash(handoffPath, baseline.artifacts.handoffSha256, 'canonical handoff');
  assert.equal(handoff.project.id, baseline.projectId);
  assert.deepEqual(handoff.captionPreset, baseline.captionPreset);
  const canonicalProject = await readJson(path.join(projectDir, 'project.json'));
  const sceneTracks = handoff.tracks.filter((track) => track.type === 'video').sort((a, b) => a.start - b.start);
  assert.equal(sceneTracks.length, baseline.sceneCounts.total);
  assert.equal(canonicalProject.scenes.length, baseline.sceneCounts.total);
  const assetsByName = new Map(handoff.assets.map((asset) => [asset.name, asset]));
  let stillCount = 0;
  let motionCount = 0;
  for (let index = 0; index < baseline.scenes.length; index += 1) {
    const expectedScene = baseline.scenes[index];
    const sourceScene = canonicalProject.scenes[index];
    const track = sceneTracks[index];
    const asset = assetsByName.get(track.src);
    assert.equal(sourceScene.asset.replaceAll('\\', '/'), expectedScene.asset);
    assert.equal(sourceScene.label, baseline.disclosure.text);
    assert.equal(Math.round(track.start * baseline.output.fps), expectedScene.startFrame);
    assert.equal(Math.round(track.duration * baseline.output.fps), expectedScene.frameCount);
    assert.deepEqual(track.videoStyle, baseline.mediaRegion);
    await equalFileHash(path.resolve(projectDir, sourceScene.asset), expectedScene.sourceSha256, `canonical scene ${index} source`);
    await equalFileHash(path.resolve(root, asset.path), expectedScene.handoffSha256, `canonical scene ${index} handoff`);
    assert.equal(asset.mime, expectedScene.mime);
    const media = probe(path.resolve(projectDir, sourceScene.asset));
    assert.equal(media.width, expectedScene.sourceMedia.width);
    assert.equal(media.height, expectedScene.sourceMedia.height);
    if (expectedScene.mime === 'video/mp4') {
      motionCount += 1;
      assert.equal(media.fps, expectedScene.sourceMedia.fps);
      assert.equal(media.frames, expectedScene.sourceMedia.frames);
      assert.ok(media.frames / 16 >= track.duration);
    } else stillCount += 1;
  }
  assert.deepEqual({ total: sceneTracks.length, still: stillCount, motion: motionCount }, baseline.sceneCounts);
  const titleTracks = handoff.tracks.filter((track) => track.type === 'text' && baseline.title.some((title) => title.text === track.text));
  assert.deepEqual(titleTracks.map((track) => ({ text: track.text, textStyle: track.textStyle })), baseline.title);
  const disclosureTracks = handoff.tracks.filter((track) => track.type === 'text' && track.text === baseline.disclosure.text).sort((a, b) => a.start - b.start);
  assert.equal(disclosureTracks.length, baseline.disclosure.count);
  assert.ok(disclosureTracks.every((track) => JSON.stringify(track.textStyle) === JSON.stringify(baseline.disclosure.textStyle)));
  assert.deepEqual(disclosureTracks.map((track) => [Math.round(track.start * 30), Math.round(track.duration * 30)]), baseline.scenes.map((scene) => [scene.startFrame, scene.frameCount]));
  const cueTuples = handoff.cues.map(({ start, end, text }) => [start, end, text]);
  assert.equal(handoff.cues.length, baseline.cueCount);
  assert.equal(hashJson(handoff.cues.map((cue) => cue.text)), baseline.cueTextSha256);
  assert.equal(hashJson(cueTuples), baseline.cuesSha256);
  for (const expectedAudio of [baseline.audio, baseline.bgm]) {
    const asset = handoff.assets.find((entry) => entry.name === expectedAudio.name);
    assert.ok(asset);
    assert.equal(asset.mime, expectedAudio.mime);
    await equalFileHash(path.resolve(root, asset.path), expectedAudio.sha256, `${expectedAudio.name} asset`);
  }
  const bgmTrack = handoff.tracks.find((track) => track.type === 'audio' && track.src === baseline.bgm.name);
  assert.equal(bgmTrack.audioStyle.volumeDb, baseline.bgm.volumeDb);
  assert.equal(bgmTrack.audioStyle.duckUnderNarration, baseline.bgm.duckUnderNarration);
  const thumbnailAsset = handoff.assets.find((asset) => asset.name === 'thumbnail.png');
  assert.ok(thumbnailAsset);
  await equalFileHash(path.resolve(root, thumbnailAsset.path), baseline.thumbnail.sha256, 'thumbnail asset');
  process.stdout.write(`${JSON.stringify({ status: 'passed', contractId: baseline.contractId, versionId: baseline.versionId, sceneCounts: baseline.sceneCounts }, null, 2)}\n`);
  process.exit(0);
}

const variantPath = path.join(projectDir, 'release-variants', `${latest.versionId}.json`);
let variant;
try {
  variant = await readJson(variantPath);
} catch {
  throw new Error(`Unknown release version ${latest.versionId}; no registered exact variant contract`);
}
assert.equal(variant.versionId, latest.versionId);
assert.deepEqual(variant.parentBaseline, {
  path: 'canonical-baseline.json',
  sha256: await hashFile(baselinePath),
  contractId: baseline.contractId,
  versionId: baseline.versionId,
});
assert.equal(variant.contractId, baseline.contractId);

const expected = variant.artifacts;
if (!exactVersion) assert.equal(await hashFile(selectedRegistryPath), expected.latestRenderJsonSha256, 'latest-render JSON hash');
assert.equal(path.normalize(latest.path), path.normalize(resolveRoot(expected.videoPath)), 'latest video path');
assert.equal(path.normalize(latest.thumbnailPath), path.normalize(resolveRoot(expected.thumbnailPath)), 'latest thumbnail path');
await equalFileHash(resolveRoot(expected.videoPath), expected.videoSha256, 'variant video');
await equalFileHash(resolveRoot(expected.thumbnailPath), expected.thumbnailSha256, 'variant thumbnail');
assert.deepEqual({ ...latest.resolution, fps: latest.fps, frames: latest.frames, duration: latest.duration }, variant.output);
assert.deepEqual(variant.output, baseline.output);

const registryPath = resolveRoot(expected.registryJsonPath);
const registry = await readJson(registryPath);
assert.equal(await hashFile(registryPath), expected.registryJsonSha256, 'registry JSON hash');
assert.deepEqual(registry, latest);
const handoffPath = resolveRoot(expected.handoffJsonPath);
const handoff = await readJson(handoffPath);
await equalFileHash(handoffPath, expected.handoffSha256, 'variant handoff');
assert.equal(handoff.versionId, latest.versionId);
assert.equal(latest.handoffFile, path.basename(expected.handoffJsonPath));

const projectConfigPath = resolveRoot(expected.projectConfigPath);
const project = await readJson(projectConfigPath);
await equalFileHash(projectConfigPath, expected.projectConfigSha256, 'project config');
assert.equal(latest.sourceIntegrity?.projectConfigSha256, expected.projectConfigSha256);
for (const field of ['authority', 'slug', 'status', 'finalizedAt', 'scriptSha256', 'narrationConfigSha256', 'sourceCueCount']) {
  assert.equal(latest.sourceIntegrity?.[field], baseline.sourceIntegrity?.[field], `sourceIntegrity.${field}`);
  assert.equal(handoff.sourceIntegrity?.[field], baseline.sourceIntegrity?.[field], `handoff sourceIntegrity.${field}`);
}
assert.equal(latest.sourceIntegrity?.visualConfigSha256, expected.visualConfigSha256);
assert.equal(handoff.sourceIntegrity?.projectConfigSha256, expected.projectConfigSha256);
assert.equal(handoff.sourceIntegrity?.visualConfigSha256, expected.visualConfigSha256);
assert.equal(latest.sourceIntegrity?.scriptSha256, expected.scriptSha256);

const scriptJsonPath = resolveRoot(expected.scriptJsonPath);
await equalFileHash(scriptJsonPath, expected.scriptJsonSha256, 'handoff script JSON');
const scriptAsset = handoff.assets.find((asset) => asset.name === 'script.json');
assert.ok(scriptAsset, 'script.json handoff asset');
assert.equal(scriptAsset.mime, 'application/json');
await equalFileHash(resolveRoot(scriptAsset.path), expected.scriptJsonSha256, 'script.json asset');

assert.equal(handoff.project.id, baseline.projectId);
assert.deepEqual({ width: handoff.project.width, height: handoff.project.height, fps: handoff.project.fps }, {
  width: baseline.output.width, height: baseline.output.height, fps: baseline.output.fps,
});
assert.deepEqual(handoff.captionPreset, baseline.captionPreset);
assert.deepEqual(project.captionPreset, baseline.captionPreset);
assert.deepEqual(project.scenes.map(({ asset, captionAnchor, camera, intensity, zoom, label }) => ({ asset, captionAnchor, camera, intensity, zoom, label })), baseline.scenes.map(({ asset, captionAnchor, camera, intensity, zoom, label }) => ({ asset, captionAnchor, camera, intensity, zoom, label })));

const replacementEntries = [...variant.visualOverrides].sort((a, b) => a.index - b.index);
const replacementKeys = replacementEntries.map((entry) => String(entry.index));
assert.deepEqual(Object.keys(project.media?.sceneReplacements ?? {}).sort(), replacementKeys.slice().sort());
for (const entry of replacementEntries) {
  assert.equal(project.media.sceneReplacements[String(entry.index)], entry.sourcePath);
}
const replacementsByIndex = new Map(replacementEntries.map((entry) => [entry.index, entry]));

const sceneTracks = handoff.tracks.filter((track) => track.type === 'video').sort((a, b) => a.start - b.start);
assert.equal(sceneTracks.length, baseline.sceneCounts.total);
assert.equal(project.scenes.length, baseline.sceneCounts.total);
const assetsByName = new Map(handoff.assets.map((asset) => [asset.name, asset]));
let stillCount = 0;
let motionCount = 0;
for (let index = 0; index < baseline.scenes.length; index += 1) {
  const expectedScene = baseline.scenes[index];
  const sourceScene = project.scenes[index];
  const track = sceneTracks[index];
  const replacement = replacementsByIndex.get(index);
  const expectedAssetName = replacement ? replacement.handoffAssetName : path.posix.basename(expectedScene.asset);
  assert.equal(track.src, expectedAssetName, `scene ${index} asset order`);
  const asset = assetsByName.get(track.src);
  assert.ok(asset, `scene ${index} handoff asset`);
  assert.equal(sourceScene.asset.replaceAll('\\', '/'), expectedScene.asset);
  assert.equal(sourceScene.label, baseline.disclosure.text);
  assert.equal(Math.round(track.start * baseline.output.fps), expectedScene.startFrame);
  assert.equal(Math.round(track.duration * baseline.output.fps), expectedScene.frameCount);
  assert.deepEqual(track.videoStyle, baseline.mediaRegion);
  await equalFileHash(path.resolve(projectDir, sourceScene.asset), expectedScene.sourceSha256, `scene ${index} baseline source`);
  if (replacement) {
    assert.equal(expectedScene.mime, 'video/mp4', `scene ${index} replacement media type`);
    assert.equal(asset.path, replacement.handoffPath, `scene ${index} replacement handoff path`);
    await equalFileHash(path.resolve(projectDir, replacement.sourcePath), replacement.sourceSha256, `scene ${index} replacement source`);
    await equalFileHash(resolveRoot(replacement.handoffPath), replacement.handoffSha256, `scene ${index} replacement handoff`);
    assert.equal(asset.mime, 'video/mp4');
    assert.deepEqual(probe(path.resolve(projectDir, replacement.sourcePath)), replacement.probe);
    assert.deepEqual(probe(resolveRoot(replacement.handoffPath)), replacement.handoffProbe);
  } else {
    await equalFileHash(resolveRoot(asset.path), expectedScene.handoffSha256, `scene ${index} baseline handoff`);
    assert.equal(asset.mime, expectedScene.mime);
    const media = probe(path.resolve(projectDir, sourceScene.asset));
    assert.equal(media.width, expectedScene.sourceMedia.width);
    assert.equal(media.height, expectedScene.sourceMedia.height);
    if (expectedScene.mime === 'video/mp4') {
      motionCount += 1;
      assert.equal(media.fps, expectedScene.sourceMedia.fps);
      assert.equal(media.frames, expectedScene.sourceMedia.frames);
      assert.ok(media.frames / 16 >= track.duration);
    } else stillCount += 1;
    continue;
  }
  motionCount += 1;
}
assert.deepEqual({ total: sceneTracks.length, still: stillCount, motion: motionCount }, baseline.sceneCounts);

const titleTracks = handoff.tracks.filter((track) => track.type === 'text' && baseline.title.some((title) => title.text === track.text));
assert.deepEqual(titleTracks.map((track) => ({ text: track.text, textStyle: track.textStyle })), baseline.title);
const disclosureTracks = handoff.tracks.filter((track) => track.type === 'text' && track.text === baseline.disclosure.text).sort((a, b) => a.start - b.start);
assert.equal(disclosureTracks.length, baseline.disclosure.count);
assert.ok(disclosureTracks.every((track) => JSON.stringify(track.textStyle) === JSON.stringify(baseline.disclosure.textStyle)));
assert.deepEqual(disclosureTracks.map((track) => [Math.round(track.start * 30), Math.round(track.duration * 30)]), baseline.scenes.map((scene) => [scene.startFrame, scene.frameCount]));

const cueTuples = handoff.cues.map(({ start, end, text }) => [start, end, text]);
assert.equal(handoff.cues.length, baseline.cueCount);
assert.equal(hashJson(handoff.cues.map((cue) => cue.text)), baseline.cueTextSha256);
assert.equal(hashJson(cueTuples), baseline.cuesSha256);
assert.equal(hashJson(handoff.cues), variant.cuesSha256);
assert.equal(handoff.cues.length, variant.cueCount);

for (const expectedAudio of [baseline.audio, baseline.bgm]) {
  const asset = handoff.assets.find((entry) => entry.name === expectedAudio.name);
  assert.ok(asset);
  assert.equal(asset.mime, expectedAudio.mime);
  await equalFileHash(resolveRoot(asset.path), expectedAudio.sha256, `${expectedAudio.name} asset`);
}
const bgmTrack = handoff.tracks.find((track) => track.type === 'audio' && track.src === baseline.bgm.name);
assert.ok(bgmTrack);
assert.equal(bgmTrack.audioStyle.volumeDb, baseline.bgm.volumeDb);
assert.equal(bgmTrack.audioStyle.duckUnderNarration, baseline.bgm.duckUnderNarration);
assert.equal(latest.bgm?.volumeDb, baseline.bgm.volumeDb);
assert.equal(latest.bgm?.duckUnderNarration, baseline.bgm.duckUnderNarration);
assert.equal(latest.bgm?.durationSeconds, baseline.bgm.durationSeconds);
assert.deepEqual(handoff.thumbnailOverride, baseline.thumbnail);
assert.deepEqual(latest.thumbnailOverride, baseline.thumbnail);
const thumbnailAsset = handoff.assets.find((asset) => asset.name === 'thumbnail.png');
assert.ok(thumbnailAsset);
await equalFileHash(resolveRoot(thumbnailAsset.path), baseline.thumbnail.sha256, 'thumbnail handoff asset');

// Every non-video asset is immutable; only the five explicitly registered
// visual scene assets may differ from the parent handoff.
const parentHandoff = await readJson(path.join(root, 'out', 'registry', 'versions', `${baseline.versionId}.handoff.json`));
const parentImmutable = parentHandoff.assets.filter((asset) => asset.mime !== 'video/mp4').map(({ name, mime }) => ({ name, mime })).sort((a, b) => a.name.localeCompare(b.name));
const variantImmutable = handoff.assets.filter((asset) => asset.mime !== 'video/mp4').map(({ name, mime }) => ({ name, mime })).sort((a, b) => a.name.localeCompare(b.name));
assert.deepEqual(variantImmutable, parentImmutable);

process.stdout.write(`${JSON.stringify({ status: 'passed', contractId: baseline.contractId, versionId: latest.versionId, sceneCounts: baseline.sceneCounts, visualOverrides: replacementKeys.map(Number) }, null, 2)}\n`);
