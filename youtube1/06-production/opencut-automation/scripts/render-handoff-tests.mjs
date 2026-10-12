import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tokens = JSON.parse(await fsp.readFile(path.join(root, "production", "templates", "reference-v3.tokens.json"), "utf8"));
const latest = JSON.parse(await fsp.readFile(path.join(root, "out", "latest-render.json"), "utf8"));
const versionId = latest.versionId;
const isJejuCanonical = latest.sourceIntegrity?.slug === "jeju-school-intrusion" || latest.sourceIntegrity?.authority === "production/newsroom/projects/jeju-school-intrusion.json";
if (!isJejuCanonical && latest.sourceIntegrity?.contractAuthority) {
  const genericVersionPath = path.join(root, "out", "registry", "versions", `${versionId}.json`);
  const genericMetadata = JSON.parse(await fsp.readFile(genericVersionPath, "utf8"));
  const genericHandoff = JSON.parse(await fsp.readFile(path.join(path.dirname(genericVersionPath), genericMetadata.handoffFile), "utf8"));
  assert.equal(genericMetadata.versionId, versionId);
  assert.equal(genericHandoff.versionId, versionId);
  assert.deepEqual(genericMetadata.resolution, { width: 1080, height: 1920 });
  assert.equal(genericMetadata.fps, 30);
  for (const key of ["scriptSha256", "projectConfigSha256", "contractSha256", "narrationConfigSha256"]) assert.equal(genericHandoff.sourceIntegrity?.[key], genericMetadata.sourceIntegrity?.[key]);
  assert.ok(genericHandoff.tracks.some((track) => track.type === "video"));
  assert.ok(genericHandoff.cues.length > 0);
  for (const key of ["script", "narration", "visuals", "captions"]) assert.equal(genericHandoff.editableTrackContract?.[key]?.status, "ready");
  console.log(`render handoff tests passed (generic exact version ${versionId}, ${genericHandoff.tracks.filter((track) => track.type === "video").length} scene tracks, ${genericHandoff.cues.length} editable cues)`);
  process.exit(0);
}
const baselineProjectDir = isJejuCanonical ? "jeju-school-intrusion-short-v1" : "school-case-production";
const baseline = JSON.parse(await fsp.readFile(path.join(root, "production", "projects", baselineProjectDir, "canonical-baseline.json"), "utf8"));
const versionPath = path.join(root, "out", "registry", "versions", `${versionId}.json`);
const metadata = JSON.parse(await fsp.readFile(versionPath, "utf8"));
assert.equal(metadata.versionId, versionId);
assert.equal(metadata.handoffFile, `${versionId}.handoff.json`);

const snapshotPath = path.join(path.dirname(versionPath), metadata.handoffFile);
const snapshot = JSON.parse(await fsp.readFile(snapshotPath, "utf8"));

// The approved v17 release is an explicit immutable variant. Keep the
// canonical-baseline assertions below unchanged and dispatch this exact
// version through its own contract plus handoff checks.
const v17ProjectSha256 = "e538ffe95377a42b45780633bf3c1fd747cf581b092c914def4f4ed4a4de9dea";
const v17ContractSha256 = "1e5774554d24455ef779a86977fa8e79f41e84dfd73a42307f168867f44e1eb5";
const v17VideoSha256 = "ffe3e25e27e4728a4b8764f3cfa808a179340e0765ba59870c84f204117692c6";
if (versionId === "msg5rl1z-45892-5gfps1" && latest.sourceIntegrity?.projectConfigSha256 === v17ProjectSha256) {
  const v17ProjectPath = path.join(root, "production", "projects", "jeju-school-intrusion-short-v1", "project-v17-editorial-cartoon.json");
  const v17ContractPath = path.join(root, "production", "projects", "jeju-school-intrusion-short-v1", "pipeline-contract-v17-editorial-cartoon.json");
  const v17Project = JSON.parse(await fsp.readFile(v17ProjectPath, "utf8"));
  assert.equal(crypto.createHash("sha256").update(await fsp.readFile(v17ProjectPath)).digest("hex"), v17ProjectSha256);
  assert.equal(crypto.createHash("sha256").update(await fsp.readFile(v17ContractPath)).digest("hex"), v17ContractSha256);
  assert.equal(crypto.createHash("sha256").update(await fsp.readFile(metadata.path)).digest("hex"), v17VideoSha256);
  assert.deepEqual({ ...latest.resolution, fps: latest.fps, frames: latest.frames, duration: latest.duration }, { width: 1080, height: 1920, fps: 30, frames: 1524, duration: 50.8 });
  const contractCheck = spawnSync(process.execPath, [path.join(root, "scripts", "verify-v17-editorial-cartoon-contract.mjs")], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(contractCheck.status, 0, `v17 contract failed: ${contractCheck.stderr || contractCheck.stdout}`);
  assert.equal(snapshot.versionId, versionId);
  assert.deepEqual(snapshot.captionPreset, v17Project.captionPreset);
  assert.equal(snapshot.tracks.filter((track) => track.type === "video").length, 21);
  assert.equal(snapshot.cues.length, 36);
  assert.equal(snapshot.editableTrackContract?.narration?.asset, "narration-retimed.m4a");
  assert.equal(snapshot.editableTrackContract?.bgm?.asset, "background-music.m4a");
  const visualAssets = snapshot.assets.filter((asset) => asset.mime === "image/png" || asset.mime === "video/mp4");
  assert.equal(visualAssets.filter((asset) => asset.name !== "thumbnail.png").length, 21);
  const bgmTrack = snapshot.tracks.find((track) => track.type === "audio" && track.src === "background-music.m4a");
  assert.equal(bgmTrack?.audioStyle?.volumeDb, -16);
  assert.equal(bgmTrack?.audioStyle?.duckUnderNarration, true);
  const titleTracks = snapshot.tracks.filter((track) => track.type === "text" && track.start === 0 && track.duration === 50.8);
  assert.equal(titleTracks.length, 2);
  const disclosureTracks = snapshot.tracks.filter((track) => track.type === "text" && track.text === "사건 내용 기반 AI 재구성");
  assert.equal(disclosureTracks.length, 21);
  console.log(`render handoff tests passed (v17 variant, 21 scene tracks, 21 visual assets, 1524 aligned frames, 36 editable cues)`);
  process.exit(0);
}
if (isJejuCanonical) assert.equal(versionId, baseline.versionId);
if (!isJejuCanonical) {
  assert.equal(versionId, baseline.versionId);
  assert.equal(latest.frames, baseline.frames);
  assert.equal(latest.duration, baseline.duration);
}
if (isJejuCanonical) {
  assert.deepEqual(metadata.thumbnailOverride, baseline.thumbnail);
  assert.deepEqual(snapshot.thumbnailOverride, baseline.thumbnail);
  const expectedThumbnailSha = baseline.thumbnail.sha256;
  const registryThumbnail = await fsp.readFile(metadata.thumbnailPath);
  const handoffThumbnailAsset = snapshot.assets.find((asset) => asset.name === "thumbnail.png");
  assert.equal(handoffThumbnailAsset?.mime, "image/png");
  const handoffThumbnail = await fsp.readFile(path.resolve(root, handoffThumbnailAsset.path));
  assert.equal(crypto.createHash("sha256").update(registryThumbnail).digest("hex"), expectedThumbnailSha);
  assert.equal(crypto.createHash("sha256").update(handoffThumbnail).digest("hex"), expectedThumbnailSha);
  assert.deepEqual(handoffThumbnail, registryThumbnail);
}
assert.deepEqual(snapshot.captionPreset, {
  id: "reference-v3-semantic-2line", fontFamily: "Noto Sans KR", fontWeight: 800,
  fontSize: 88, scaleX: 94, safeWidth: 920, maxLines: 2, lineHeight: 1.08,
  x: 540, y: 1400, color: "#FFFFFF", outlineColor: "#000000", outlineWidth: 5,
  background: "none",
});
assert.equal(snapshot.versionId, versionId);
if (baseline.speechAcceptanceRequired) assert.equal(snapshot.project.id, baseline.projectId);
const baselineScenes = isJejuCanonical ? baseline.scenes : baseline.images;
assert.equal(snapshot.tracks.filter((track) => track.type === "video").length, baselineScenes.length);
const expectedAudioTrackCount = snapshot.editableTrackContract?.bgm?.status === "ready" ? 2 : 1;
assert.equal(snapshot.tracks.filter((track) => track.type === "audio").length, expectedAudioTrackCount);
assert.equal(snapshot.tracks.filter((track) => track.type === "asset").length, 1);
const sceneTracks = snapshot.tracks.filter((track) => track.type === "video").sort((a, b) => a.start - b.start);
const sceneAssets = sceneTracks.map((track) => snapshot.assets.find((asset) => asset.name === track.src));
const canonicalMedia = baselineScenes.map((asset) => typeof asset === "string"
  ? { file: asset, mime: "image/png", path: `assets/images/${asset}` }
  : isJejuCanonical
    ? { file: path.basename(asset.asset), mime: asset.mime, path: asset.asset, sha256: asset.sourceSha256, handoffSha256: asset.handoffSha256, startFrame: asset.startFrame, frameCount: asset.frameCount }
    : { file: asset.file, mime: asset.mime || "image/png", path: asset.path || `assets/images/${asset.file}`, sha256: asset.sha256, handoffSha256: asset.handoffSha256 });
const canonicalImageNames = canonicalMedia.map((asset) => asset.file);
assert.deepEqual(sceneAssets.map((asset) => asset?.name), canonicalImageNames);
assert.deepEqual(sceneAssets.map((asset) => asset?.mime), canonicalMedia.map((asset) => asset.mime));
for (const mime of new Set(canonicalMedia.map((asset) => asset.mime))) {
  const expectedCount = canonicalMedia.filter((asset) => asset.mime === mime).length;
  assert.equal(sceneAssets.filter((asset) => asset?.mime === mime).length, expectedCount);
}
let expectedStartFrame = 0;
for (let index = 0; index < sceneTracks.length; index += 1) {
  const expected = baselineScenes[index];
  if (isJejuCanonical) {
    assert.equal(Math.round(sceneTracks[index].start * metadata.fps), expected.startFrame);
    assert.equal(Math.round(sceneTracks[index].duration * metadata.fps), expected.frameCount);
    assert.equal(sceneTracks[index].loop, false);
    assert.deepEqual(sceneTracks[index].videoStyle, baseline.mediaRegion);
    const handoffBytes = await fsp.readFile(path.resolve(root, sceneAssets[index].path));
    const canonicalPath = path.join(root, "production", "projects", baselineProjectDir, canonicalMedia[index].path);
    const canonicalBytes = await fsp.readFile(canonicalPath);
    const sourceDigest = crypto.createHash("sha256").update(canonicalBytes).digest("hex");
    const handoffDigest = crypto.createHash("sha256").update(handoffBytes).digest("hex");
    if (canonicalMedia[index].sha256) assert.equal(sourceDigest, canonicalMedia[index].sha256);
    assert.equal(handoffDigest, canonicalMedia[index].handoffSha256);
    expectedStartFrame += Math.round(sceneTracks[index].duration * metadata.fps);
    continue;
  }
  assert.equal(Math.abs(sceneTracks[index].start * metadata.fps - expected.startFrame) < 1e-9, true);
  assert.equal(Math.abs(sceneTracks[index].duration * metadata.fps - expected.frameCount) < 1e-9, true);
  assert.equal(sceneTracks[index].sourceStart, undefined);
  assert.equal(sceneTracks[index].loop, false);
  assert.deepEqual(sceneTracks[index].videoStyle, {
    fit: tokens.component.media.fit,
    xPx: tokens.component.media.x,
    yPx: tokens.component.media.y,
    widthPx: tokens.component.media.width,
    heightPx: tokens.component.media.height,
    ...(expected.zoom ? { zoom: expected.zoom } : {}),
    ...(expected.label ? { label: expected.label } : {}),
  });
  const handoffBytes = await fsp.readFile(path.resolve(root, sceneAssets[index].path));
  const canonicalBytes = await fsp.readFile(path.join(root, "production", "projects", baselineProjectDir, "assets", "images", expected.file));
  assert.equal(crypto.createHash("sha256").update(handoffBytes).digest("hex"), expected.sha256);
  assert.equal(crypto.createHash("sha256").update(canonicalBytes).digest("hex"), expected.sha256);
  expectedStartFrame += expected.frameCount;
}
assert.equal(expectedStartFrame, metadata.frames);
assert.equal(Math.abs(sceneTracks.at(-1).start + sceneTracks.at(-1).duration - metadata.frames / metadata.fps) < 1e-9, true);

assert.equal(snapshot.cues.length > 0, true);
assert.equal(snapshot.cues.every((cue) => Number.isFinite(cue.start) && cue.end > cue.start && typeof cue.text === "string" && cue.text.length > 0), true);
assert.equal(snapshot.cues.every((cue) => cue.end - cue.start >= 0.599999), true);
assert.equal(snapshot.cues.every((cue) => cue.text.split(/\r?\n/).length <= 2), true);
const cueTuples = snapshot.cues.map((cue) => [cue.start, cue.end, cue.text]);
const hashJson = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
assert.equal(snapshot.cues.length, baseline.cueCount);
if (baseline.cueTextSha256) {
  assert.equal(hashJson(snapshot.cues.map((cue) => cue.text)), baseline.cueTextSha256);
  assert.equal(hashJson(cueTuples), baseline.cuesSha256);
}
if (baseline.speechAcceptanceRequired) {
  const speechAcceptance = metadata.narrationProvider?.speechAcceptance;
  assert.equal(metadata.narrationProvider?.requestedProvider, "fish-speech-lora");
  assert.equal(metadata.narrationProvider?.actualProvider, "fish-speech-lora");
  assert.equal(metadata.narrationProvider?.fallbackUsed, false);
  assert.equal(speechAcceptance?.accepted, true);
  assert.equal(speechAcceptance?.sourceCueCount, 48);
  assert.equal(speechAcceptance?.final?.cueCount, 48);
  assert.deepEqual(speechAcceptance?.final?.errors, []);
  assert.equal(speechAcceptance?.maxCaptionOnsetError <= 0.5, true);
  assert.equal(speechAcceptance?.maxCaptionOnsetError <= 0.8, true);
  const normalizedTranscript = String(speechAcceptance?.final?.transcript || "").normalize("NFKC").replace(/cctv/gi, "씨씨티비").replace(/[^\p{L}\p{N}]+/gu, "");
  for (const token of ["4월", "감식", "봤습니다", "다행히", "피의자", "손괴", "정말필요하지않을까요"]) assert.equal(normalizedTranscript.includes(token), true, `accepted transcript is missing ${token}`);
  assert.equal(normalizedTranscript.split("피의자").length - 1 >= 3, true, "accepted transcript must contain all three 피의자 facts");
}
const titleTracks = snapshot.tracks.filter((track) => track.type === "text" && ["제주 초등학교", "교실 침입 사건"].includes(track.text));
assert.equal(titleTracks.length, 2);
assert.deepEqual(titleTracks.map((track) => track.text), ["제주 초등학교", "교실 침입 사건"]);
assert.deepEqual(titleTracks.map((track) => track.textStyle), [
  { fontFamily: "Noto Sans KR", fontWeight: "bold", fontSizePx: tokens.component.title.line1Size, color: tokens.semantic.titleAccent, textAlign: "center", centerXPx: 540, topPx: tokens.component.title.line1Y, lineHeight: 1, background: false },
  { fontFamily: "Noto Sans KR", fontWeight: "bold", fontSizePx: tokens.component.title.line2Size, color: tokens.semantic.titleSecondary, textAlign: "center", centerXPx: 540, topPx: tokens.component.title.line2Y, lineHeight: 1, background: false },
]);
if (isJejuCanonical) {
  const disclosureTracks = snapshot.tracks.filter((track) => track.type === "text" && track.text === baseline.disclosure.text);
  assert.equal(disclosureTracks.length, baseline.disclosure.count);
  assert.equal(disclosureTracks.every((track) => track.textStyle?.topPx >= tokens.component.media.y + tokens.component.media.height), true);
  assert.equal(disclosureTracks.every((track) => track.textStyle?.background === false), true);
}
const audioAsset = snapshot.assets.find((asset) => asset.name === baseline.audio.name);
assert.equal(audioAsset?.mime, baseline.audio.mime);
assert.equal(crypto.createHash("sha256").update(await fsp.readFile(path.resolve(root, audioAsset.path))).digest("hex"), baseline.audio.sha256);
if (isJejuCanonical) {
  const bgmAsset = snapshot.assets.find((asset) => asset.name === baseline.bgm.name);
  const bgmTrack = snapshot.tracks.find((track) => track.src === baseline.bgm.name);
  assert.equal(bgmAsset?.mime, baseline.bgm.mime);
  assert.equal(crypto.createHash("sha256").update(await fsp.readFile(path.resolve(root, bgmAsset.path))).digest("hex"), baseline.bgm.sha256);
  assert.equal(bgmTrack?.audioStyle?.volumeDb, baseline.bgm.volumeDb);
  assert.equal(bgmTrack?.audioStyle?.duckUnderNarration, baseline.bgm.duckUnderNarration);
  if (bgmTrack?.audioStyle?.fadeSeconds !== undefined) assert.equal(bgmTrack.audioStyle.fadeSeconds, baseline.bgm.fadeSeconds);
}
assert.deepEqual(tokens.primitive.canvas, { width: 1080, height: 1920, fps: 30 });
assert.deepEqual(tokens.primitive.bands, { top: 474, middle: 972, bottom: 474 });
assert.deepEqual(tokens.component.sequence, { sceneCount: 12, frameAllocation: "balanced", imageFirst: true });
assert.deepEqual(tokens.component.narration, { speechTempo: 1.0106, terminalPauseSeconds: 0.62, semanticPauseSeconds: 0.3, joinSafetySeconds: 0.005, removeSilence: true });
assert.deepEqual(tokens.component.caption, { x: 540, y: 1400, fontSize: 88, outlineWidth: 5, shadow: 0, background: "none", maxCharsPerLine: 16, maxLines: 2, lineHeight: 1.08, targetDuration: 2.4, minDuration: 1.4, maxDuration: 3.6 });
assert.equal(tokens.semantic.safeWidth, 920);
assert.equal(tokens.semantic.captionScaleX, 94);

const rootReal = await fsp.realpath(root);
for (const asset of snapshot.assets) {
	assert.equal(path.isAbsolute(asset.path), false);
	assert.equal(asset.path.split(/[\\/]/).some((part) => part === ".."), false);
	const assetReal = await fsp.realpath(path.resolve(root, asset.path));
	assert.equal(assetReal.startsWith(`${rootReal}${path.sep}`), true);
	assert.equal((await fsp.lstat(assetReal)).isFile(), true);
}

console.log(`render handoff tests passed (${baselineScenes.length} canonical scene tracks, ${new Set(canonicalImageNames).size} media assets, ${metadata.frames} aligned frames, ${snapshot.cues.length} editable cues)`);
