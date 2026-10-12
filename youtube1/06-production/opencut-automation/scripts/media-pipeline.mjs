import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Load a YouTube API key without ever exposing the value to callers/logs. */
export function loadYouTubeApiKey({ env = process.env, filePath = env.YOUTUBE_API_KEY_FILE || path.join(WORKSPACE_ROOT, 'api.txt') } = {}) {
  const direct = String(env.YOUTUBE_API_KEY || '').trim();
  if (direct) return direct;
  const candidates = [filePath];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const match = raw.match(/(?:^|\n)\s*(?:YOUTUBE_API_KEY|youtube_api_key)\s*=\s*([^\s#]+)/i);
      const value = String(match?.[1] || raw.trim().split(/\s+/)[0] || '').trim();
      if (value) return value;
    } catch { /* optional key file */ }
  }
  return '';
}

const VIDEO_MIME = new Map([
  ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.webm', 'video/webm'], ['.mkv', 'video/x-matroska'],
]);

const OFFICIAL_SOURCE_HOSTS = new Set(['vod.kctvjeju.com']);
const SAFE_PROJECT_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.|0\.)/;
const PRIVATE_IPV6 = /^(?:::1|fc|fd|fe80:)/i;

function isPrivateAddress(address) {
  const normalized = String(address || '').toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  return PRIVATE_IPV4.test(normalized) || PRIVATE_IPV6.test(normalized);
}

function assertResolvedInside(root, target, message) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(message);
  return target;
}

export function assertSafeMediaProjectSlug(value) {
  const slug = String(value || '');
  if (!SAFE_PROJECT_SLUG.test(slug)) throw new Error('Invalid media project slug');
  return slug;
}

export async function validateOfficialSourceUrl(value, { fetchImpl = globalThis.fetch, allowedHosts = OFFICIAL_SOURCE_HOSTS, lookup = dns.lookup } = {}) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('Official source URL must be valid HTTPS'); }
  if (url.protocol !== 'https:') throw new Error('Official source URL must use HTTPS');
  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) throw new Error(`Official source host is not allowlisted: ${hostname}`);
  let addresses;
  try { addresses = (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address); } catch { throw new Error('Official source host could not be resolved'); }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('Official source resolves to a private or local address');
  const response = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-1023' }, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) throw new Error('Official source redirects are not permitted');
  if (!response.ok && response.status !== 206) throw new Error(`Official source preflight failed (${response.status})`);
  return { url, hostname, contentType: response.headers.get('content-type') || '', contentLength: Number(response.headers.get('content-length') || 0) || null };
}

export async function validatePlaylistReferences(preflight, { fetchImpl = globalThis.fetch, allowedHosts = OFFICIAL_SOURCE_HOSTS, lookup = dns.lookup } = {}) {
  if (!/mpegurl|m3u8/i.test(preflight.contentType) && !/\.m3u8(?:$|\?)/i.test(preflight.url.pathname)) return;
  const response = await fetchImpl(preflight.url, { redirect: 'manual' });
  if (!response.ok || response.status >= 300) throw new Error('Official HLS playlist preflight failed');
  const text = await response.text();
  const references = [];
  for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    if (!line.startsWith('#')) references.push(line);
    for (const match of line.matchAll(/\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/gi)) references.push(match[1] || match[2] || match[3]);
  }
  for (const value of references) {
    const reference = new URL(value, preflight.url);
    await validateOfficialSourceUrl(reference.toString(), { fetchImpl, allowedHosts, lookup });
  }
}

export async function ingestOfficialSource({ sourceUrl, articleUrl, publisher, sourceId = 'official', allowedHosts = OFFICIAL_SOURCE_HOSTS, candidate, workspaceRoot, projectSlug, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', fetchImpl = globalThis.fetch, lookup = dns.lookup, timeoutMs = 120_000, maxBytes = 500 * 1024 * 1024, maxDurationSeconds = 10 * 60 } = {}) {
  const rightsReview = candidate?.rightsReview;
  if (rightsReview?.status !== 'completed' || !['usable', 'conditional'].includes(rightsReview.verdict)) throw new Error('Official source ingestion requires a completed usable or conditional rights review');
  if (!String(articleUrl || '').startsWith('https://')) throw new Error('Official article provenance URL is required');
  if (!String(rightsReview.attribution || candidate?.attribution || '').trim()) throw new Error('Attribution is required before official source ingestion');
  if (!String(publisher || '').trim()) throw new Error('Official source publisher is required');
  if (!(allowedHosts instanceof Set) || allowedHosts.size < 1) throw new Error('Official source host allowlist is required');
  const safeProjectSlug = assertSafeMediaProjectSlug(projectSlug);
  const preflight = await validateOfficialSourceUrl(sourceUrl, { fetchImpl, allowedHosts, lookup });
  await validatePlaylistReferences(preflight, { fetchImpl, allowedHosts, lookup });
  const root = path.resolve(workspaceRoot);
  await fsp.mkdir(root, { recursive: true });
  const realRoot = await fsp.realpath(root);
  const sourceDir = path.join(root, 'production', 'newsroom', 'projects', safeProjectSlug, 'sources');
  await fsp.mkdir(sourceDir, { recursive: true });
  const realSourceDir = assertResolvedInside(realRoot, await fsp.realpath(sourceDir), 'Official source directory escapes the authorized workspace');
  const neutralSourceId = String(sourceId || candidate?.videoId || 'official').replace(/[^a-z0-9_-]/gi, '') || 'official';
  const base = `source-${neutralSourceId}`;
  const outputPath = path.join(realSourceDir, `${base}.mp4`);
  const contactSheetPath = path.join(realSourceDir, `${base}-contact-sheet.jpg`);
  await runProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'https,tls,tcp,crypto', '-i', preflight.url.toString(), '-t', String(maxDurationSeconds), '-fs', String(maxBytes), '-c', 'copy', '-movflags', '+faststart', '-y', outputPath], { timeoutMs });
  const stat = await fsp.stat(outputPath);
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('Acquired official source exceeds size bounds');
  const duration = await probeDuration(outputPath, ffprobe, { timeoutMs });
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxDurationSeconds + 1) throw new Error('Acquired official source exceeds duration bounds');
  await runProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '0', '-i', outputPath, '-vf', 'fps=1/12,scale=320:-1,tile=5x4', '-frames:v', '1', '-q:v', '5', '-y', contactSheetPath], { timeoutMs });
  const checksum = crypto.createHash('sha256').update(await fsp.readFile(outputPath)).digest('hex');
  return {
    status: 'ready',
    sourcePath: path.relative(root, outputPath).replaceAll(path.sep, '/'),
    contactSheetPath: path.relative(root, contactSheetPath).replaceAll(path.sep, '/'),
    sourceUrl: preflight.url.toString(), articleUrl: String(articleUrl), publisher,
    candidateVideoId: String(candidate?.videoId || ''), rightsReview, attribution: String(rightsReview.attribution || candidate.attribution),
    durationSeconds: duration, sizeBytes: stat.size, sha256: checksum, acquiredAt: new Date().toISOString(),
  };
}

async function probeDuration(filePath, ffprobe, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('ffprobe timed out')); }, timeoutMs);
    child.stdout.on('data', (data) => { output += String(data); }); child.stderr.on('data', (data) => { error += String(data); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); }); child.on('close', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(`ffprobe exited ${code}: ${error.slice(-500)}`)); else resolve(Number.parseFloat(output.trim())); });
  });
}

export function parseYouTubeSearchResponse(payload, fetchedAt = new Date().toISOString()) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap((item) => {
    const videoId = String(item?.id?.videoId || '').trim();
    if (!videoId) return [];
    const snippet = item.snippet || {};
    return [{
      videoId,
      title: String(snippet.title || '').slice(0, 240),
      channelTitle: String(snippet.channelTitle || '').slice(0, 160),
      channelId: String(snippet.channelId || '').slice(0, 80),
      description: String(snippet.description || '').slice(0, 1_000),
      publishedAt: snippet.publishedAt || null,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      fetchedAt,
      license: 'creativeCommon',
      rightsReview: 'unverified',
      reviewStatus: 'pending',
      rightsWarning: 'Creative Commons 표시는 업로더의 선택이며 원저작권자를 YouTube가 보증하지 않습니다. 사용 전 권리 확인이 필요합니다.',
    }];
  });
}

export function verifyYouTubeVideosResponse(candidates, payload, fetchedAt = new Date().toISOString()) {
  const byId = new Map((Array.isArray(payload?.items) ? payload.items : []).map((item) => [String(item?.id || ''), item]));
  return candidates.flatMap((candidate) => {
    const item = byId.get(candidate.videoId);
    if (!item) return [];
    const status = item.status || {};
    const details = item.contentDetails || {};
    const snippet = item.snippet || {};
    return [{
      ...candidate,
      title: String(snippet.title || candidate.title).slice(0, 240),
      channelTitle: String(snippet.channelTitle || candidate.channelTitle).slice(0, 160),
      duration: details.duration || null,
      durationSeconds: parseIsoDuration(details.duration),
      license: status.license || candidate.license,
      embeddable: status.embeddable === true,
      publicStatsViewable: status.publicStatsViewable !== false,
      licenseSnapshot: { license: status.license || null, embeddable: status.embeddable === true, fetchedAt },
      fetchedAt,
    }];
  });
}

export function parseIsoDuration(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value || ''));
  if (!match) return null;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}

export async function searchYouTubeCreativeCommons({ query, apiKey = loadYouTubeApiKey(), fetchImpl = globalThis.fetch, maxResults = 10 }) {
  if (!apiKey) return { status: 'unavailable', reason: 'YOUTUBE_API_KEY is not configured', candidates: [] };
  const q = String(query || '').trim();
  if (!q) throw new Error('YouTube search query is required');
  const base = 'https://www.googleapis.com/youtube/v3';
  const params = new URLSearchParams({ part: 'snippet', q, type: 'video', videoLicense: 'creativeCommon', videoEmbeddable: 'true', videoSyndicated: 'true', maxResults: String(Math.max(1, Math.min(50, maxResults))), key: apiKey });
  const searchResponse = await fetchImpl(`${base}/search?${params}`);
  if (!searchResponse.ok) throw new Error(`YouTube search failed (${searchResponse.status})`);
  const searchPayload = await searchResponse.json();
  const fetchedAt = new Date().toISOString();
  const initial = parseYouTubeSearchResponse(searchPayload, fetchedAt);
  if (!initial.length) return { status: 'ready', query: q, fetchedAt, candidates: [] };
  const details = new URLSearchParams({ part: 'snippet,contentDetails,status', id: initial.map((item) => item.videoId).join(','), key: apiKey });
  const detailsResponse = await fetchImpl(`${base}/videos?${details}`);
  if (!detailsResponse.ok) throw new Error(`YouTube video verification failed (${detailsResponse.status})`);
  const verified = verifyYouTubeVideosResponse(initial, await detailsResponse.json(), fetchedAt)
    .filter((item) => item.license === 'creativeCommon' && item.embeddable === true);
  return { status: 'ready', query: q, fetchedAt, candidates: verified };
}

/** Search YouTube for reporting/reference material without claiming reuse rights. */
export async function searchYouTubeTopicSources({ query, apiKey = loadYouTubeApiKey(), fetchImpl = globalThis.fetch, maxResults = 8 }) {
  if (!apiKey) return { status: 'unavailable', reason: 'YOUTUBE_API_KEY is not configured', candidates: [] };
  const q = String(query || '').trim();
  if (!q) throw new Error('YouTube topic search query is required');
  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    order: 'relevance',
    maxResults: String(Math.max(1, Math.min(25, maxResults))),
    key: apiKey,
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!response.ok) throw new Error(`YouTube topic search failed (${response.status})`);
  const payload = await response.json();
  const fetchedAt = new Date().toISOString();
  const candidates = (Array.isArray(payload?.items) ? payload.items : []).flatMap((item) => {
    const videoId = String(item?.id?.videoId || '').trim();
    const snippet = item?.snippet || {};
    if (!videoId) return [];
    const thumbnails = snippet.thumbnails || {};
    return [{
      title: String(snippet.title || '').slice(0, 240),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publisher: String(snippet.channelTitle || 'YouTube').slice(0, 160),
      channelTitle: String(snippet.channelTitle || 'YouTube').slice(0, 160),
      publishedAt: snippet.publishedAt || null,
      description: String(snippet.description || '').slice(0, 600),
      thumbnail: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
      mediaType: 'video',
      status: 'indexed',
      rightsStatus: 'reference-only',
      fetchedAt,
    }];
  });
  return { status: 'ready', query: q, fetchedAt, candidates };
}

export function assertAuthorizedLocalMedia(sourcePath, workspaceRoot, { rightsAttested = false, maxBytes = 500 * 1024 * 1024 } = {}) {
  if (rightsAttested !== true) throw new Error('Affirmative rights attestation is required before clipping media');
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const resolved = fs.realpathSync(path.resolve(sourcePath));
  assertResolvedInside(root, resolved, 'Source media must be inside the authorized workspace');
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('Source media file is missing or too large');
  const mime = VIDEO_MIME.get(path.extname(resolved).toLowerCase());
  if (!mime) throw new Error('Source media must be MP4, MOV, WebM or MKV');
  return { path: resolved, mime, size: stat.size };
}

export async function extractAuthorizedClip({ sourcePath, outputPath, workspaceRoot, rightsAttested, startSeconds, endSeconds, ffmpeg = 'ffmpeg' }) {
  const source = assertAuthorizedLocalMedia(sourcePath, workspaceRoot, { rightsAttested });
  const start = Number(startSeconds); const end = Number(endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 60 * 5) throw new Error('Clip timing must be 0 <= start < end and no longer than 5 minutes');
  const destination = path.resolve(outputPath);
  const root = await fsp.realpath(path.resolve(workspaceRoot));
  assertResolvedInside(root, destination, 'Clip output must be inside the authorized workspace');
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const realParent = await fsp.realpath(path.dirname(destination));
  assertResolvedInside(root, realParent, 'Clip output parent must be inside the authorized workspace');
  try { if ((await fsp.lstat(destination)).isSymbolicLink()) throw new Error('Clip output must not be a symbolic link'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await runProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-i', source.path, '-t', (end - start).toFixed(3), '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', destination]);
  assertResolvedInside(root, await fsp.realpath(destination), 'Clip output escaped the authorized workspace');
  const stat = await fsp.stat(destination);
  return { outputPath: destination, mime: 'video/mp4', size: stat.size, startSeconds: start, endSeconds: end, sourcePath: source.path, rightsAttested: true, extractedAt: new Date().toISOString() };
}

export async function generateBgm({ provider = 'stable-audio-3', prompt, durationSeconds, outputPath, seed, cwd, env = process.env }) {
  const selected = provider === 'ace-step-1.5' ? 'ACE_STEP_COMMAND' : provider === 'stable-audio-3' ? 'STABLE_AUDIO_3_COMMAND' : null;
  if (provider === 'local-file') return { status: 'ready', outputPath };
  const command = selected && env[selected];
  if (!command) return { status: 'unavailable', provider, reason: `${selected} is not configured. Set it to a local provider command.` };
  if (!outputPath) throw new Error('BGM outputPath is required');
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess(command, ['--prompt', String(prompt || 'instrumental investigative news background music, no vocals'), '--duration', String(Math.max(1, Number(durationSeconds) || 60)), '--seed', String(seed ?? 0), '--output', outputPath], { cwd });
  return { status: 'ready', provider, outputPath, prompt, seed: seed ?? null, generatedAt: new Date().toISOString() };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = options.timeoutMs ? setTimeout(() => { child.kill(); reject(new Error(`${command} timed out`)); }, options.timeoutMs) : null;
    child.stderr.on('data', (data) => { stderr += String(data); });
    child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-800)}`)); });
  });
}
