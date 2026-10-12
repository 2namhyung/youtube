#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './production-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const projectPath = path.join(projectDir, 'project.json');
const baselinePath = path.join(projectDir, 'canonical-baseline.json');
const latestPath = path.join(root, 'out', 'latest-render.json');
const args = process.argv.slice(2);
if (!args.includes('--confirm')) throw new Error('Canonical promotion requires --confirm');

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = async (file) => digest(await fs.readFile(file));
const hashJson = (value) => digest(JSON.stringify(value));
const probe = (file) => {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file,
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `ffprobe failed for ${file}: ${result.stderr}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  assert.ok(stream, `video stream missing: ${file}`);
  return stream;
};

const project = await readJson(projectPath);
const latest = await readJson(latestPath);
assert.equal(latest.sourceIntegrity?.slug, 'jeju-school-intrusion');
assert.deepEqual(latest.resolution, { width: 1080, height: 1920 });
assert.equal(latest.fps, 30);
assert.equal(latest.frames, 1524);
assert.equal(latest.duration, 50.8);

const handoffPath = path.join(root, 'out', 'registry', 'versions', `${latest.versionId}.handoff.json`);
const handoff = await readJson(handoffPath);
assert.deepEqual(handoff.project, {
  id: '0986312f-e8a4-4354-8725-9134e71e247c',
  name: '제주 초등학교 교실 침입 사건',
  width: 1080,
  height: 1920,
  fps: 30,
});
assert.equal(project.scenes.length, 21);

const expectedCaptionPreset = {
  id: 'reference-v3-semantic-2line', fontFamily: 'Noto Sans KR', fontWeight: 800,
  fontSize: 88, scaleX: 94, safeWidth: 920, maxLines: 2, lineHeight: 1.08,
  x: 540, y: 1400, color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 5,
  background: 'none',
};
assert.deepEqual(project.captionPreset, expectedCaptionPreset);
assert.deepEqual(handoff.captionPreset, expectedCaptionPreset);

const sceneTracks = handoff.tracks.filter((track) => track.type === 'video').sort((a, b) => a.start - b.start);
assert.equal(sceneTracks.length, 21);
const assetsByName = new Map(handoff.assets.map((asset) => [asset.name, asset]));
const expectedVideoStyle = { fit: 'cover', xPx: 0, yPx: 474, widthPx: 1080, heightPx: 972 };
const scenes = [];
let stillCount = 0;
let motionCount = 0;

for (let index = 0; index < project.scenes.length; index += 1) {
  const sourceScene = project.scenes[index];
  const track = sceneTracks[index];
  const handoffAsset = assetsByName.get(track.src);
  assert.ok(handoffAsset, `handoff asset missing for scene ${index + 1}`);
  assert.deepEqual(track.videoStyle, expectedVideoStyle);
  assert.equal(sourceScene.label, '사건 내용 기반 AI 재구성');
  const sourcePath = path.resolve(projectDir, sourceScene.asset);
  const handoffAssetPath = path.resolve(root, handoffAsset.path);
  const sourceSha256 = await hashFile(sourcePath);
  const handoffSha256 = await hashFile(handoffAssetPath);
  const isMotion = path.extname(sourcePath).toLowerCase() === '.mp4';
  let sourceMedia;
  if (isMotion) {
    motionCount += 1;
    const media = probe(sourcePath);
    assert.ok(media.width >= 960 && media.height >= 1664, `motion scene ${index + 1} source is below HQ floor`);
    assert.equal(media.r_frame_rate, '16/1');
    assert.ok(Number(media.nb_read_frames) / 16 >= track.duration, `motion scene ${index + 1} ends before its timeline slot`);
    sourceMedia = { width: media.width, height: media.height, fps: media.r_frame_rate, frames: Number(media.nb_read_frames) };
  } else {
    stillCount += 1;
    const media = probe(sourcePath);
    assert.ok(media.width >= 941 && media.height >= 1672, `still scene ${index + 1} source is below image floor`);
    sourceMedia = { width: media.width, height: media.height };
  }
  scenes.push({
    index: index + 1,
    asset: sourceScene.asset.replaceAll('\\', '/'),
    mime: handoffAsset.mime,
    sourceSha256,
    handoffSha256,
    startFrame: Math.round(track.start * 30),
    frameCount: Math.round(track.duration * 30),
    camera: sourceScene.camera,
    intensity: sourceScene.intensity,
    zoom: sourceScene.zoom,
    captionAnchor: sourceScene.captionAnchor,
    label: sourceScene.label,
    sourceMedia,
  });
}
assert.equal(stillCount, 16);
assert.equal(motionCount, 5);
assert.equal(scenes.reduce((sum, scene) => sum + scene.frameCount, 0), 1524);

const titleTracks = handoff.tracks.filter((track) => track.type === 'text' && ['제주 초등학교', '교실 침입 사건'].includes(track.text));
assert.equal(titleTracks.length, 2);
const disclosureTracks = handoff.tracks.filter((track) => track.type === 'text' && track.text === '사건 내용 기반 AI 재구성').sort((a, b) => a.start - b.start);
assert.equal(disclosureTracks.length, 21);
assert.deepEqual(disclosureTracks.map((track) => [Math.round(track.start * 30), Math.round(track.duration * 30)]), scenes.map((scene) => [scene.startFrame, scene.frameCount]));
for (const track of disclosureTracks) {
  assert.deepEqual(track.textStyle, {
    fontFamily: 'Noto Sans KR', fontWeight: 'bold', fontSizePx: 24, color: '#FFFFFF',
    textAlign: 'right', centerXPx: 810, topPx: 1464, lineHeight: 1, background: false,
  });
}

const narrationAsset = handoff.assets.find((asset) => asset.name === 'narration-retimed.m4a');
const bgmAsset = handoff.assets.find((asset) => asset.name === 'background-music.m4a');
const thumbnailAsset = handoff.assets.find((asset) => asset.name === 'thumbnail.png');
assert.ok(narrationAsset && bgmAsset && thumbnailAsset);
const bgmTrack = handoff.tracks.find((track) => track.type === 'audio' && track.src === bgmAsset.name);
assert.equal(bgmTrack?.audioStyle?.volumeDb, -16);
assert.equal(bgmTrack?.audioStyle?.duckUnderNarration, true);

const cueTuples = handoff.cues.map(({ start, end, text }) => [start, end, text]);
assert.equal(cueTuples.length, 36);
const baseline = {
  schemaVersion: 2,
  contractId: 'jeju-school-intrusion-v10-source-grounded-hybrid-hq-7jq-layout',
  promotedAt: new Date().toISOString(),
  versionId: latest.versionId,
  projectId: handoff.project.id,
  output: { width: 1080, height: 1920, fps: 30, frames: 1524, duration: 50.8 },
  mediaRegion: expectedVideoStyle,
  sceneCounts: { total: 21, still: 16, motion: 5 },
  captionPreset: expectedCaptionPreset,
  cueCount: 36,
  cueTextSha256: hashJson(handoff.cues.map((cue) => cue.text)),
  cuesSha256: hashJson(cueTuples),
  title: titleTracks.map((track) => ({ text: track.text, textStyle: track.textStyle })),
  disclosure: {
    text: '사건 내용 기반 AI 재구성', count: 21,
    textStyle: disclosureTracks[0].textStyle,
  },
  scenes,
  audio: { name: narrationAsset.name, mime: narrationAsset.mime, sha256: await hashFile(path.resolve(root, narrationAsset.path)) },
  bgm: {
    name: bgmAsset.name, mime: bgmAsset.mime,
    sourceSha256: project.bgm.sha256,
    sha256: await hashFile(path.resolve(root, bgmAsset.path)),
    volumeDb: -16, duckUnderNarration: true, fadeSeconds: project.bgm.fadeSeconds,
    durationSeconds: 50.8,
  },
  thumbnail: { ...project.thumbnail, sha256: await hashFile(path.resolve(root, thumbnailAsset.path)) },
  artifacts: {
    videoSha256: await hashFile(latest.path),
    handoffSha256: await hashFile(handoffPath),
    projectConfigSha256: latest.sourceIntegrity.projectConfigSha256,
  },
  motionEnhancement: {
    engine: 'Real-ESRGAN ncnn Vulkan',
    release: 'v0.2.3.0 / realesrgan-ncnn-vulkan-20211212-windows',
    model: 'realesrgan-x4plus',
    scale: 2,
    executableSha256: await hashFile('C:/Users/User/tools/realesrgan-ncnn-vulkan-20211212-windows/realesrgan-ncnn-vulkan.exe'),
    modelParamSha256: await hashFile('C:/Users/User/tools/realesrgan-ncnn-vulkan-20211212-windows/models/realesrgan-x4plus.param'),
    modelWeightsSha256: await hashFile('C:/Users/User/tools/realesrgan-ncnn-vulkan-20211212-windows/models/realesrgan-x4plus.bin'),
    manifest: 'assets/video/v9-source-grounded-hybrid-hq/manifest.json',
    manifestSha256: await hashFile(path.join(projectDir, 'assets/video/v9-source-grounded-hybrid-hq/manifest.json')),
  },
  sourceIntegrity: handoff.sourceIntegrity,
};
assert.equal(baseline.audio.sha256, project.narration.audioSha256);
assert.equal(baseline.thumbnail.sha256, project.thumbnail.sha256);
await writeAtomic(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ promoted: true, versionId: latest.versionId, baselinePath, sceneCounts: baseline.sceneCounts }, null, 2)}\n`);
