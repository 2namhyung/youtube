#!/usr/bin/env node
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateProject, writeAtomic } from "./production-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const projectArg = args[args.indexOf("--project") + 1];
const sourceVersionArg = args.includes("--source-version") ? args[args.indexOf("--source-version") + 1] : undefined;
if (!projectArg) {
  throw new Error("Usage: node scripts/refresh-image-handoff.mjs --project production/projects/<id>/project.json [--source-version <id>]");
}

const projectPath = path.resolve(root, projectArg);
const projectBase = path.dirname(projectPath);
const project = validateProject(JSON.parse(await fsp.readFile(projectPath, "utf8")), projectBase);
if (!project.scenes?.length) throw new Error("Image handoff refresh requires explicit project scenes");
if (!project.scriptSource) throw new Error("Image handoff refresh requires an authoritative scriptSource");
const scriptState = JSON.parse(await fsp.readFile(path.resolve(projectBase, project.scriptSource), "utf8"));
if (scriptState?.status !== "final" || !scriptState.finalizedAt || typeof scriptState.draft !== "string" || !scriptState.draft.trim()) throw new Error("Image handoff refresh requires a finalized authoritative script");
const hashText = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const scriptSha256 = hashText(scriptState.draft.replace(/\r\n/g, "\n").trim());
const visualConfigSha256 = hashText(JSON.stringify({ title: project.title, assets: project.assets, scenes: project.scenes, captionPreset: project.captionPreset, media: project.media }));

const sceneFiles = project.scenes.map((scene) => path.resolve(projectBase, scene.asset));
for (const sceneFile of sceneFiles) {
  if (path.extname(sceneFile).toLowerCase() !== ".png") throw new Error(`Image handoff scene must be PNG: ${sceneFile}`);
  const info = await fsp.stat(sceneFile);
  if (!info.isFile()) throw new Error(`Image handoff scene is unavailable: ${sceneFile}`);
}
if (new Set(sceneFiles.map((file) => path.basename(file))).size !== sceneFiles.length) {
  throw new Error("Image handoff scene filenames must be unique");
}

const outDir = path.join(root, "out");
const latest = JSON.parse(await fsp.readFile(path.join(outDir, "latest-render.json"), "utf8"));
const sourceVersionId = String(sourceVersionArg || latest.versionId || "");
if (!/^[A-Za-z0-9_-]+$/.test(sourceVersionId)) throw new Error("Latest render version is invalid");
const versionsDir = path.join(outDir, "registry", "versions");
const sourceMetadata = JSON.parse(await fsp.readFile(path.join(versionsDir, `${sourceVersionId}.json`), "utf8"));
const sourceSnapshot = JSON.parse(await fsp.readFile(path.join(versionsDir, `${sourceVersionId}.handoff.json`), "utf8"));
if (sourceMetadata.sourceIntegrity?.scriptSha256 !== scriptSha256 || sourceMetadata.sourceIntegrity?.visualConfigSha256 !== visualConfigSha256) {
  throw new Error("Visual reuse rejected: authoritative script or visual configuration hash mismatch");
}
const sourceSceneTracks = sourceSnapshot.tracks.filter((track) => track.type === "video");
if (sourceSceneTracks.length !== sceneFiles.length) {
  throw new Error(`Expected ${sceneFiles.length} source scene tracks, received ${sourceSceneTracks.length}`);
}

const versionId = `${Date.now().toString(36)}-${process.pid}-images`;
const handoffRoot = path.join(outDir, "registry", "handoffs", versionId);
await fsp.mkdir(handoffRoot, { recursive: false });

const relativeAsset = (filePath) => path.relative(root, filePath).replaceAll(path.sep, "/");
const assets = [];
for (const sceneFile of sceneFiles) {
  const name = path.basename(sceneFile);
  const destination = path.join(handoffRoot, name);
  await fsp.copyFile(sceneFile, destination);
  assets.push({ name, path: relativeAsset(destination), mime: "image/png" });
}

const sourceAssets = new Map(sourceSnapshot.assets.map((asset) => [asset.name, asset]));
for (const name of ["narration-retimed.m4a", "thumbnail.png"]) {
  const sourceAsset = sourceAssets.get(name);
  if (!sourceAsset) throw new Error(`Source handoff asset is unavailable: ${name}`);
  const sourcePath = path.resolve(root, sourceAsset.path);
  const destination = path.join(handoffRoot, name);
  await fsp.copyFile(sourcePath, destination);
  assets.push({ name, path: relativeAsset(destination), mime: sourceAsset.mime });
}

let imageTrackIndex = 0;
const tracks = sourceSnapshot.tracks.map((track) => {
  if (track.type !== "video") return track;
  const src = path.basename(sceneFiles[imageTrackIndex]);
  imageTrackIndex += 1;
  const imageTrack = { ...track };
  delete imageTrack.sourceStart;
  return { ...imageTrack, src, loop: false };
});
const snapshot = {
  ...sourceSnapshot,
  versionId,
  assets,
  tracks,
};

const metadata = {
  versionId,
  path: sourceMetadata.path,
  thumbnailPath: sourceMetadata.thumbnailPath,
  fileName: sourceMetadata.fileName,
  thumbnailFileName: sourceMetadata.thumbnailFileName,
  thumbnail: sourceMetadata.thumbnail,
  handoffFile: `${versionId}.handoff.json`,
  videoUrl: `/api/renders/final?versionId=${versionId}`,
  thumbnailUrl: `/api/renders/final/thumbnail?versionId=${versionId}`,
  title: sourceMetadata.title,
  duration: sourceMetadata.duration,
  frames: sourceMetadata.frames,
  fps: sourceMetadata.fps,
  resolution: sourceMetadata.resolution,
  template: sourceMetadata.template,
  templateId: sourceMetadata.templateId,
  timestamp: new Date().toISOString(),
};

await writeAtomic(path.join(versionsDir, `${versionId}.handoff.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
await writeAtomic(path.join(versionsDir, `${versionId}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
await writeAtomic(path.join(outDir, "latest-render.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ versionId, sourceVersionId, scenes: sceneFiles.length, frames: metadata.frames, cues: snapshot.cues.length }, null, 2));
