#!/usr/bin/env node
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSrt, writeAtomic } from "./production-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootReal = await fsp.realpath(root);
function contained(target) {
  const resolved = path.resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Path escapes automation root");
  return resolved;
}
async function containedReal(target, expected) {
  const lexical = contained(target);
  const real = await fsp.realpath(lexical);
  if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) throw new Error("Path escapes automation root");
  const info = await fsp.lstat(real);
  if (expected === "file" && !info.isFile()) throw new Error("Expected a regular file");
  if (expected === "directory" && !info.isDirectory()) throw new Error("Expected a directory");
  return real;
}
const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const versionId = value("--version"); const projectArg = value("--project"); const assetsArg = value("--assets"); const srtArg = value("--srt"); const sceneFramesArg = value("--scene-frames"); const extractStills = args.includes("--extract-stills");
if (!versionId || !/^[A-Za-z0-9_-]+$/.test(versionId) || !projectArg || !assetsArg || !srtArg) throw new Error("Usage: node scripts/backfill-render-handoff.mjs --version <id> --project <manifest.json> --assets <asset-dir> --srt <captions.srt>");
const versionPath = path.join(root, "out", "registry", "versions", `${versionId}.json`);
const metadata = JSON.parse(await fsp.readFile(versionPath, "utf8"));
if (metadata.versionId !== versionId || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/.test(metadata.fileName) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(metadata.thumbnailFileName)) throw new Error("Registry version is invalid");
const projectPath = await containedReal(path.resolve(root, projectArg), "file");
const assetsRoot = await containedReal(path.resolve(root, assetsArg), "directory");
const srtPath = await containedReal(path.resolve(root, srtArg), "file");
const project = JSON.parse(await fsp.readFile(projectPath, "utf8"));
const manifestTracks = Array.isArray(project.tracks) ? project.tracks : [];
const files = await fsp.readdir(assetsRoot, { withFileTypes: true });
const assetNames = new Set(manifestTracks.filter((track) => ["video", "image", "audio"].includes(track.type)).map((track) => path.basename(String(track.src || ""))));
const assets = [];
const mimeByExtension = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".mp3", "audio/mpeg"], [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"]]);
for (const entry of files) {
  if (!entry.isFile() || !assetNames.has(entry.name)) continue;
  const ext = path.extname(entry.name).toLowerCase();
  const mime = mimeByExtension.get(ext);
  if (!mime) throw new Error(`Unsupported handoff asset: ${entry.name}`);
  assets.push({ name: entry.name, path: path.relative(root, path.join(assetsRoot, entry.name)).replaceAll(path.sep, "/"), mime });
}
if (!assets.length || assets.length !== assetNames.size) throw new Error("A manifest asset is missing from the supplied asset directory");
const tracks = manifestTracks
  .filter((track) => ["video", "image", "audio", "text"].includes(track.type))
  .map((track) => ({ ...track, type: track.type === "image" ? "video" : track.type, ...(track.src ? { src: path.basename(String(track.src)) } : {}) }));
if (sceneFramesArg) {
  const sceneFrames = sceneFramesArg.split(",").map(Number);
  const videoTracks = tracks.filter((track) => track.type === "video");
  if (sceneFrames.length !== videoTracks.length || sceneFrames.some((frames) => !Number.isInteger(frames) || frames <= 0) || sceneFrames.reduce((sum, frames) => sum + frames, 0) !== metadata.frames) {
    throw new Error("Scene frame allocation must contain one positive integer per video track and sum to registry frames");
  }
  let frame = 0;
  for (let index = 0; index < videoTracks.length; index += 1) {
    videoTracks[index].start = frame / metadata.fps;
    videoTracks[index].duration = sceneFrames[index] / metadata.fps;
    frame += sceneFrames[index];
  }
  for (const track of tracks) {
    if (track.type === "text") track.duration = metadata.frames / metadata.fps;
  }
}
if (extractStills) {
  const stillRoot = contained(path.join(root, "out", "registry", "handoffs", versionId));
  await fsp.mkdir(stillRoot, { recursive: true });
  const videoTracks = tracks.filter((track) => track.type === "video");
  const stillAssets = [];
  for (let index = 0; index < videoTracks.length; index += 1) {
    const track = videoTracks[index];
    const source = assets.find((asset) => asset.name === track.src);
    if (!source || source.mime !== "video/mp4") throw new Error(`Video source is unavailable for scene ${index + 1}`);
    const stillName = `scene-${String(index + 1).padStart(2, "0")}-at-0_500.png`;
    const stillPath = path.join(stillRoot, stillName);
    await extractStill({ source: path.resolve(root, source.path), destination: stillPath });
    stillAssets.push({ name: stillName, path: path.relative(root, stillPath).replaceAll(path.sep, "/"), mime: "image/png" });
    track.src = stillName;
  }
  const nonSceneAssets = assets.filter((asset) => !videoTracks.some((track, index) => asset.name === manifestTracks.filter((item) => item.type === "video")[index]?.src));
  assets.splice(0, assets.length, ...nonSceneAssets, ...stillAssets);
}
const cues = parseSrt(await fsp.readFile(srtPath, "utf8")).map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
if (!cues.length) throw new Error("Caption source contains no cues");
assets.push({ name: metadata.thumbnailFileName, path: path.relative(root, path.join(root, "out", metadata.thumbnailFileName)).replaceAll(path.sep, "/"), mime: "image/png" });
const handoffFile = `${versionId}.handoff.json`;
const handoff = { versionId, project: project.project, assets, tracks: [{ type: "asset", src: metadata.thumbnailFileName, start: 0, duration: Number(metadata.duration) }, ...tracks], cues, fallback: { video: metadata.fileName, thumbnail: metadata.thumbnailFileName } };
await writeAtomic(path.join(root, "out", "registry", "versions", handoffFile), `${JSON.stringify(handoff, null, 2)}\n`);
await writeAtomic(versionPath, `${JSON.stringify({ ...metadata, handoffFile }, null, 2)}\n`);
console.log(JSON.stringify({ versionId, handoffFile, assets: assets.length, cues: cues.length }));

function run(command, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.trim()}`)));
  });
}

async function extractStill({ source, destination }) {
  const temporary = `${destination}.${process.pid}.tmp.png`;
  await fsp.rm(temporary, { force: true });
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.500", "-i", source, "-frames:v", "1", "-c:v", "png", temporary]);
  const probe = JSON.parse(await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", temporary]));
  const stream = probe.streams?.[0];
  if (stream?.codec_name !== "png" || Number(stream.width) !== 1080 || Number(stream.height) !== 1920) {
    await fsp.rm(temporary, { force: true });
    throw new Error(`Extracted still validation failed for ${path.basename(source)}`);
  }
  const bytes = await fsp.readFile(temporary);
  try {
    const existing = await fsp.readFile(destination);
    if (!existing.equals(bytes)) throw new Error(`Immutable still already exists with different bytes: ${path.basename(destination)}`);
    await fsp.rm(temporary, { force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await fsp.rename(temporary, destination);
    else throw error;
  }
}
