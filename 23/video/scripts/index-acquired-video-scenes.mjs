import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'video', 'qa', 'source-review', 'episode-001-source-selection-v02', 'manifest.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'video', 'source-intake', 'episode-001', 'scene-index-v01', 'scene-index.json');
const DEFAULT_FRAMES_ROOT = path.join(ROOT, 'video', 'source-intake', 'episode-001', 'scene-index-v01', 'keyframes');
const DEFAULT_SCENE_SECONDS = 6;
const DEFAULT_FRAME_COUNT = 3;
const MIN_DURATION_SECONDS = 0.001;
const MIN_SCENE_WINDOW_SECONDS = 0.75;
const EPSILON = 0.0005;

const round = (value) => Number(value.toFixed(3));
const projectPath = (file, root = ROOT) => path.relative(root, file).replaceAll('\\', '/');
const absolutePath = (file, root = ROOT) => path.isAbsolute(file) ? file : path.resolve(root, file);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

export function parseArgs(argv = []) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_OUTPUT,
    framesRoot: DEFAULT_FRAMES_ROOT,
    sceneSeconds: DEFAULT_SCENE_SECONDS,
    frameCount: DEFAULT_FRAME_COUNT,
    check: false,
    extractFrames: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      index += 1;
      return argv[index];
    };
    if (arg === '--manifest' || arg === '-m') options.manifest = absolutePath(value());
    else if (arg === '--out' || arg === '-o') {
      const target = absolutePath(value());
      options.out = target.toLowerCase().endsWith('.json') ? target : path.join(target, 'scene-index.json');
    } else if (arg === '--frames-root') options.framesRoot = absolutePath(value());
    else if (arg === '--scene-seconds') options.sceneSeconds = Number(value());
    else if (arg === '--frame-count') options.frameCount = Number(value());
    else if (arg === '--check') options.check = true;
    else if (arg === '--no-frames') options.extractFrames = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!(options.sceneSeconds > 0)) throw new Error('--scene-seconds must be positive');
  if (!Number.isInteger(options.frameCount) || options.frameCount < 1) throw new Error('--frame-count must be a positive integer');
  return options;
}

function probeVideo(file) {
  try {
    const report = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate',
      '-of', 'json', file,
    ], {encoding: 'utf8'}));
    const duration = Number(report?.format?.duration);
    const stream = report?.streams?.find((item) => item.codec_type === 'video');
    if (!stream || !Number.isFinite(duration) || duration <= MIN_DURATION_SECONDS) return null;
    if (!(Number(stream.width) > 0) || !(Number(stream.height) > 0)) return null;
    return {
      durationSeconds: duration,
      stream: {
        index: Number.isInteger(stream.index) ? stream.index : 0,
        codec: stream.codec_name ?? null,
        width: Number(stream.width),
        height: Number(stream.height),
        frame_rate: stream.avg_frame_rate ?? null,
      },
    };
  } catch {
    return null;
  }
}

function decodeVideo(file, durationSeconds) {
  try {
    const sampleDuration = Math.max(0.05, Math.min(0.25, durationSeconds));
    execFileSync('ffmpeg', [
      '-v', 'error', '-i', file, '-map', '0:v:0', '-t', sampleDuration.toFixed(3), '-f', 'null', '-',
    ], {stdio: ['ignore', 'ignore', 'pipe']});
    return true;
  } catch {
    return false;
  }
}

function candidatePath(candidate, root) {
  return absolutePath(candidate.original_path ?? candidate.path ?? '', root);
}

/** Return video candidates from the review manifest, deduplicated by file bytes. */
export function collectVideoCandidates(manifest, {root = ROOT, probe = probeVideo, decode = decodeVideo} = {}) {
  const rows = Array.isArray(manifest?.candidates) ? manifest.candidates : [];
  const byHash = new Map();
  const skipped = [];
  for (const candidate of rows) {
    if (candidate?.media_type !== 'video') continue;
    const file = candidatePath(candidate, root);
    if (!fs.existsSync(file)) {
      skipped.push({candidate_id: candidate.candidate_id ?? null, source_path: projectPath(file, root), reason: 'missing-local-original'});
      continue;
    }
    const metadata = probe(file);
    if (!metadata || !decode(file, metadata.durationSeconds)) {
      skipped.push({candidate_id: candidate.candidate_id ?? null, source_path: projectPath(file, root), reason: 'positive-duration-decode-failed'});
      continue;
    }
    const digest = sha256(file);
    const summary = {
      candidate_id: candidate.candidate_id ?? null,
      title: candidate.title ?? null,
      provider: candidate.provider ?? null,
      subject_family: candidate.subject_family ?? null,
      source_url: candidate.source_url ?? null,
      original_url: candidate.original_url ?? null,
      license: candidate.license ?? null,
      license_url: candidate.license_url ?? null,
      original_path: projectPath(file, root),
    };
    const existing = byHash.get(digest);
    if (existing) {
      existing.candidates.push(summary);
      continue;
    }
    byHash.set(digest, {file, sha256: digest, metadata, candidates: [summary]});
  }
  return {videos: [...byHash.values()].sort((a, b) => a.file.localeCompare(b.file)), skipped};
}

export function makeNonOverlappingWindows(durationSeconds, sceneSeconds = DEFAULT_SCENE_SECONDS) {
  if (!(durationSeconds > MIN_DURATION_SECONDS) || !(sceneSeconds > 0)) return [];
  const windows = [];
  for (let start = 0; start < durationSeconds - EPSILON;) {
    const remaining = durationSeconds - start;
    if (windows.length && remaining < MIN_SCENE_WINDOW_SECONDS) {
      windows[windows.length - 1].end_seconds = round(durationSeconds);
      break;
    }
    const end = Math.min(durationSeconds, start + sceneSeconds);
    if (end - start <= EPSILON) break;
    windows.push({start_seconds: round(start), end_seconds: round(end), overlap_seconds: 0});
    start += sceneSeconds;
  }
  if (windows.length) {
    windows[0].start_seconds = 0;
    windows[windows.length - 1].end_seconds = round(durationSeconds);
  }
  return windows;
}

function frameTimes(window, count) {
  if (count === 1) return [window.start_seconds + (window.end_seconds - window.start_seconds) / 2];
  return Array.from({length: count}, (_, index) => {
    const fraction = (index + 1) / (count + 1);
    return window.start_seconds + (window.end_seconds - window.start_seconds) * fraction;
  });
}

function pendingPerception() {
  return {
    status: 'pending-human-observation',
    observed_subject: null,
    observed_action: null,
    observed_place: null,
    observed_viewpoint: null,
    pending_fields: ['subject', 'action', 'place', 'viewpoint'],
    gap_review: {
      status: 'pending-human-gap-review',
      missing_fields: ['subject', 'action', 'place', 'viewpoint'],
      reason: 'The indexer records frames and timing; it does not infer semantic fit.',
    },
    semantic_approval: false,
    rights_approval: false,
  };
}

function extractFrame(file, target, timeSeconds, minimumTimeSeconds = 0) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const actualTime = Math.max(minimumTimeSeconds, timeSeconds - attempt * 0.5);
    try {
      execFileSync('ffmpeg', [
        '-loglevel', 'error', '-y', '-ss', actualTime.toFixed(3), '-i', file,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-pix_fmt', 'yuvj420p', target,
      ], {stdio: ['ignore', 'ignore', 'pipe']});
      if (fs.existsSync(target) && fs.statSync(target).size > 0) return actualTime;
    } catch {
      // Some containers report an audio duration longer than their final video frame.
    }
  }
  throw new Error(`ffmpeg produced no frame: ${target}`);
}

export function validateSceneIndex(index, {root = ROOT, verifyBytes = true} = {}) {
  const errors = [];
  if (index?.production_authority !== false) errors.push('production_authority must be false');
  if (index?.semantic_approval !== false || index?.rights_approval !== false) errors.push('research index approvals must remain false');
  const manifestPath = index?.input_manifest?.path;
  if (verifyBytes && manifestPath && fs.existsSync(absolutePath(manifestPath, root)) && sha256(absolutePath(manifestPath, root)) !== index.input_manifest.sha256) errors.push(`input manifest hash changed: ${manifestPath}`);
  const sources = Array.isArray(index?.sources) ? index.sources : [];
  const seen = new Set();
  for (const source of sources) {
    if (seen.has(source.source_sha256)) errors.push(`duplicate source hash: ${source.source_sha256}`);
    seen.add(source.source_sha256);
    const file = absolutePath(source.source_path, root);
    if (!fs.existsSync(file)) errors.push(`missing source: ${source.source_path}`);
    else if (verifyBytes && sha256(file) !== source.source_sha256) errors.push(`source hash changed: ${source.source_path}`);
    if (!(Number(source.duration_seconds) > MIN_DURATION_SECONDS)) errors.push(`non-positive duration: ${source.source_path}`);
    const scenes = Array.isArray(source.scenes) ? source.scenes : (Array.isArray(source.chunks) ? source.chunks : []);
    let previousEnd = 0;
    for (const scene of scenes) {
      const start = Number(scene.start_seconds); const end = Number(scene.end_seconds);
      if (!(start >= 0 && end > start && end <= source.duration_seconds + EPSILON)) errors.push(`invalid scene window: ${source.source_path}`);
      if (Math.abs(start - previousEnd) > EPSILON) errors.push(`scene windows have a gap/overlap: ${source.source_path}`);
      previousEnd = end;
      if (scene.overlap_seconds !== 0) errors.push(`scene overlap is nonzero: ${scene.scene_id}`);
      const perception = scene.perception;
      if (!perception || perception.status !== 'pending-human-observation') errors.push(`scene perception is not pending: ${scene.scene_id}`);
      if (perception?.semantic_approval !== false || perception?.rights_approval !== false) errors.push(`scene approval is not false: ${scene.scene_id}`);
      for (const frame of (scene.representative_frames ?? scene.keyframes ?? [])) {
        if (!(Number(frame.time_seconds) >= start - EPSILON && Number(frame.time_seconds) <= end + EPSILON)) errors.push(`representative frame outside scene window: ${frame.path}`);
        const frameFile = absolutePath(frame.path, root);
        if (!fs.existsSync(frameFile)) errors.push(`missing representative frame: ${frame.path}`);
        else if (verifyBytes && sha256(frameFile) !== frame.sha256) errors.push(`frame hash changed: ${frame.path}`);
      }
    }
    if (scenes.length && Math.abs(previousEnd - source.duration_seconds) > EPSILON) errors.push(`scene windows do not cover duration: ${source.source_path}`);
  }
  return {ok: errors.length === 0, errors, sources: sources.length, scenes: sources.reduce((sum, source) => sum + (source.scenes ?? source.chunks ?? []).length, 0)};
}

export function buildSceneIndex({manifestPath = DEFAULT_MANIFEST, outputPath = DEFAULT_OUTPUT, framesRoot = DEFAULT_FRAMES_ROOT, sceneSeconds = DEFAULT_SCENE_SECONDS, frameCount = DEFAULT_FRAME_COUNT, extractFrames = true, root = ROOT, probe = probeVideo, decode = decodeVideo, extractFrameFn = extractFrame} = {}) {
  const resolvedManifestPath = typeof manifestPath === 'string' ? absolutePath(manifestPath, root) : null;
  const manifest = resolvedManifestPath ? readJson(resolvedManifestPath) : manifestPath;
  const videosResult = collectVideoCandidates(manifest, {root, probe, decode});
  const sources = videosResult.videos.map((video) => {
    const sourceKey = video.sha256.slice(0, 16);
    const windows = makeNonOverlappingWindows(video.metadata.durationSeconds, sceneSeconds);
    const scenes = windows.map((window, sceneIndex) => {
      const sceneId = `${video.sha256.slice(0, 12)}-${String(sceneIndex + 1).padStart(3, '0')}`;
      const representativeFrames = frameTimes(window, frameCount).map((time, frameIndex) => {
        const target = path.join(framesRoot, sourceKey, `scene-${String(sceneIndex + 1).padStart(3, '0')}-frame-${String(frameIndex + 1).padStart(2, '0')}.jpg`);
        const extractedTime = extractFrames ? extractFrameFn(video.file, target, time, window.start_seconds) : null;
        return {
          frame_id: `${sceneId}-frame-${String(frameIndex + 1).padStart(2, '0')}`,
          time_seconds: round(Number.isFinite(extractedTime) ? extractedTime : time),
          path: projectPath(target, root),
          sha256: extractFrames ? sha256(target) : null,
        };
      });
      return {
        scene_id: sceneId,
        start_seconds: window.start_seconds,
        end_seconds: window.end_seconds,
        overlap_seconds: 0,
        representative_frames: representativeFrames,
        keyframes: representativeFrames,
        perception: pendingPerception(),
        decision: 'review',
      };
    });
    return {
      source_path: projectPath(video.file, root),
      source_sha256: video.sha256,
      candidate_ids: video.candidates.map((candidate) => candidate.candidate_id).filter(Boolean),
      candidate_titles: video.candidates.map((candidate) => candidate.title).filter(Boolean),
      subject_families: [...new Set(video.candidates.map((candidate) => candidate.subject_family).filter(Boolean))],
      source_urls: video.candidates.map((candidate) => candidate.source_url).filter(Boolean),
      original_urls: video.candidates.map((candidate) => candidate.original_url).filter(Boolean),
      rights: {
        status: 'pending-human-rights-review',
        licenses: [...new Set(video.candidates.map((candidate) => candidate.license).filter(Boolean))],
        license_urls: [...new Set(video.candidates.map((candidate) => candidate.license_url).filter(Boolean))],
        approval: false,
      },
      duration_seconds: round(video.metadata.durationSeconds),
      stream: video.metadata.stream,
      decode: {status: 'passed-positive-duration-decode', verified: true},
      scenes,
      chunks: scenes,
    };
  });
  const index = {
    schema_version: 2,
    artifact_kind: 'research-video-scene-index',
    generated_at: new Date().toISOString(),
    status: 'research-index-pending-perception-and-human-review',
    production_authority: false,
    semantic_approval: false,
    rights_approval: false,
    input_manifest: {
      path: resolvedManifestPath ? projectPath(resolvedManifestPath, root) : null,
      sha256: resolvedManifestPath ? sha256(resolvedManifestPath) : null,
    },
    coverage: {
      manifest_video_candidates: manifest.candidates?.filter((candidate) => candidate?.media_type === 'video').length ?? 0,
      indexed_unique_local_videos: sources.length,
      skipped_video_candidates: videosResult.skipped.length,
      sha256_deduplicated: true,
    },
    scene_contract: {
      window_seconds: sceneSeconds,
      overlap_seconds: 0,
      boundary: '[start,end)',
      representative_frames_per_scene: frameCount,
    },
    skipped: videosResult.skipped,
    sources,
    limits: [
      'Research index only; it does not grant source, rights, semantic, cut, or production approval.',
      'Subject, action, place, and viewpoint remain pending human observation.',
      'Scene windows are contiguous and non-overlapping source-time windows for review, not a final edit decision.',
    ],
  };
  if (outputPath) atomicJson(outputPath, index);
  return index;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node index-acquired-video-scenes.mjs [--manifest FILE] [--out FILE|DIR] [--frames-root DIR] [--check] [--no-frames]');
    return 0;
  }
  if (options.check) {
    const index = readJson(options.out);
    const result = validateSceneIndex(index, {root: ROOT, verifyBytes: options.extractFrames});
    console.log(JSON.stringify({index: projectPath(options.out), ...result, production_authority: index.production_authority}, null, 2));
    if (!result.ok) process.exitCode = 1;
    return result.ok ? 0 : 1;
  }
  const index = buildSceneIndex({...options, manifestPath: options.manifest, outputPath: options.out});
  const result = validateSceneIndex(index, {root: ROOT, verifyBytes: options.extractFrames});
  console.log(JSON.stringify({index: projectPath(options.out), sources: index.sources.length, scenes: index.sources.reduce((sum, source) => sum + source.scenes.length, 0), skipped: index.skipped.length, ...result, production_authority: false}, null, 2));
  if (!result.ok) process.exitCode = 1;
  return result.ok ? 0 : 1;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entry === path.resolve(fileURLToPath(import.meta.url))) main();
