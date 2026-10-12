import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

const DEFAULT_QUERY = '서울 일상';
const DEFAULT_BATCH_SIZE = 3;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_SIZE = 20;
const MAX_BYTES = 100 * 1024 * 1024;
const API_ORIGIN = 'https://api.pexels.com';
const PEXELS_LICENSE = 'Pexels License 확인 필요; 제작자·Pexels 출처와 콘텐츠별 권리 보존';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export type PexelsMediaType = 'photo' | 'video';

type Candidate = {
  id: number;
  mediaType: PexelsMediaType;
  originalUrl: string;
  sourceUrl: string;
  creator: string;
  creatorUrl: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  alt: string;
};

export type PexelsMediaSyncResult = {
  runId: number;
  mediaType: PexelsMediaType;
  query: string;
  rowsSeen: number;
  rowsStaged: number;
  downloaded: number;
  deduped: number;
  failed: number;
  status: 'success' | 'partial' | 'failed' | 'blocked';
  errors: { id: number; mediaType: PexelsMediaType; code: string }[];
};

type FetchLike = typeof fetch;

function safeQuery(value: string | undefined) {
  const query = (value ?? DEFAULT_QUERY).trim();
  if (!query || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error('Pexels 검색어가 올바르지 않습니다.');
  return query;
}

function safeBatchSize(value: number | undefined) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Pexels 수집 배치는 1 이상의 정수여야 합니다.');
  return Math.min(value, MAX_BATCH_SIZE);
}

function safeMaxBytes(value: number | undefined) {
  if (value === undefined) return DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Pexels 미디어 최대 크기가 올바르지 않습니다.');
  return Math.min(value, MAX_BYTES);
}

function safePage(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Pexels 페이지가 올바르지 않습니다.');
  return Math.min(value, 1000);
}

function safeHttpsUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch { return null; }
}

function pexelsApiUrl(mediaType: PexelsMediaType, query: string, page: number, perPage: number) {
  const url = new URL(`${API_ORIGIN}/v1/${mediaType === 'photo' ? 'search' : 'videos/search'}`);
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('locale', 'ko-KR');
  url.searchParams.set('orientation', 'landscape');
  return url;
}

function safeApiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== API_ORIGIN || !['/v1/search', '/v1/videos/search'].includes(url.pathname) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

/** Reads the environment first. pixel.txt is only a local backwards-compatible fallback. */
export function resolvePexelsApiKey(options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) {
  const environmentKey = options.env?.PEXELS_API_KEY ?? process.env.PEXELS_API_KEY;
  if (environmentKey?.trim()) return environmentKey.trim();
  try {
    const fallback = fs.readFileSync(path.join(options.cwd ?? process.cwd(), 'pixel.txt'), 'utf8').trim();
    return fallback || null;
  } catch { return null; }
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function parsePhoto(row: unknown): Candidate | null {
  const item = jsonObject(row);
  const src = jsonObject(item?.src);
  const id = positiveInteger(item?.id);
  const originalUrl = safeHttpsUrl(src?.original, ['images.pexels.com']);
  const sourceUrl = safeHttpsUrl(item?.url, ['www.pexels.com', 'pexels.com']);
  if (!id || !originalUrl || !sourceUrl) return null;
  const creatorUrl = safeHttpsUrl(item?.photographer_url, ['www.pexels.com', 'pexels.com']);
  return { id, mediaType: 'photo', originalUrl, sourceUrl, creator: text(item?.photographer) || 'Pexels 제작자 미상', creatorUrl: creatorUrl ?? '', width: positiveInteger(item?.width), height: positiveInteger(item?.height), durationSeconds: null, alt: text(item?.alt) };
}

function parseVideo(row: unknown, maxBytes: number): Candidate | null {
  const item = jsonObject(row);
  const files = Array.isArray(item?.video_files) ? item.video_files : [];
  const file = files
    .map(jsonObject)
    .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate))
    .filter((candidate) => !positiveInteger(candidate.file_size) || (positiveInteger(candidate.file_size) ?? 0) <= maxBytes)
    .sort((a, b) => {
      const aWidth = positiveInteger(a.width) ?? 0;
      const bWidth = positiveInteger(b.width) ?? 0;
      const aPreferred = aWidth >= 1280 && aWidth <= 1920 ? 1 : 0;
      const bPreferred = bWidth >= 1280 && bWidth <= 1920 ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      return bWidth - aWidth;
    })[0];
  const id = positiveInteger(item?.id);
  const originalUrl = safeHttpsUrl(file?.link, ['videos.pexels.com']);
  const sourceUrl = safeHttpsUrl(item?.url, ['www.pexels.com', 'pexels.com']);
  if (!id || !file || !originalUrl || !sourceUrl) return null;
  const user = jsonObject(item?.user);
  const duration = typeof item?.duration === 'number' && Number.isFinite(item.duration) && item.duration >= 0 ? item.duration : null;
  return { id, mediaType: 'video', originalUrl, sourceUrl, creator: text(user?.name) || 'Pexels 제작자 미상', creatorUrl: safeHttpsUrl(user?.url, ['www.pexels.com', 'pexels.com']) ?? '', width: positiveInteger(item?.width), height: positiveInteger(item?.height), durationSeconds: duration, alt: '' };
}

function parseCandidates(payload: unknown, mediaType: PexelsMediaType, batchSize: number, maxBytes: number) {
  const root = jsonObject(payload);
  const rows: unknown[] = Array.isArray(root?.[mediaType === 'photo' ? 'photos' : 'videos']) ? root[mediaType === 'photo' ? 'photos' : 'videos'] as unknown[] : [];
  const result: Candidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const candidate = mediaType === 'photo' ? parsePhoto(row) : parseVideo(row, maxBytes);
    if (!candidate || seen.has(candidate.originalUrl)) continue;
    seen.add(candidate.originalUrl);
    result.push(candidate);
    if (result.length >= batchSize) break;
  }
  return result;
}

function safeFilePart(value: string) {
  const result = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
  return result || 'unknown';
}

function responseMime(response: Response, mediaType: PexelsMediaType) {
  const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'photo' ? mime.startsWith('image/') : mime.startsWith('video/')) return mime;
  return null;
}

function responseUrlAllowed(response: Response, mediaType: PexelsMediaType, requestedUrl: string) {
  const actual = response.url;
  if (!actual || actual === requestedUrl) return true;
  return Boolean(safeHttpsUrl(actual, mediaType === 'photo' ? ['images.pexels.com'] : ['videos.pexels.com']));
}

function errorCode(error: unknown) {
  if (!(error instanceof Error)) return 'download_failed';
  const match = /^(api_http_\d+|http_\d+|invalid_[a-z_]+|oversize|redirect_not_allowed|download_failed)$/.exec(error.message);
  return match?.[1] ?? 'download_failed';
}

function writeAtomically(directory: string, filename: string, bytes: Uint8Array) {
  fs.mkdirSync(directory, { recursive: true });
  const finalPath = path.join(directory, filename);
  const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, bytes, { flag: 'wx' });
    fs.renameSync(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* best-effort */ }
    throw error;
  }
}

function existingMedia(db: ReturnType<typeof openArchiveDb>, candidate: Candidate, sha256?: string) {
  const rows = db.prepare("SELECT id,path,original_url,sha256,properties_json FROM media_assets WHERE media_type=?").all(candidate.mediaType) as { id: number; path: string; original_url: string; sha256: string | null; properties_json: string }[];
  return rows.find((row) => {
    if (row.original_url === candidate.originalUrl || (sha256 && row.sha256 === sha256)) return true;
    try {
      const properties = JSON.parse(row.properties_json) as { sourceUrl?: string; pexelsId?: number };
      return properties.sourceUrl === candidate.sourceUrl || properties.pexelsId === candidate.id;
    } catch { return false; }
  });
}

function persistMedia(candidate: Candidate, finalPath: string, sha256: string, mimeType: string, bytes: number, query: string, retrievedAt: string) {
  const db = openArchiveDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const duplicate = existingMedia(db, candidate, sha256);
    if (duplicate) { db.exec('ROLLBACK'); return { duplicate: true, id: duplicate.id }; }
    const properties = { provider: 'pexels', pexelsId: candidate.id, mediaType: candidate.mediaType, query, sourceUrl: candidate.sourceUrl, creator: candidate.creator, creatorUrl: candidate.creatorUrl, alt: candidate.alt, width: candidate.width, height: candidate.height, durationSeconds: candidate.durationSeconds, retrievedAt, originalUrl: candidate.originalUrl };
    const node = db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)`).run(candidate.mediaType, `pexels:${candidate.mediaType}:${candidate.id}`, `Pexels ${candidate.mediaType === 'photo' ? '사진' : '영상'} ${candidate.id}`, JSON.stringify(properties), retrievedAt);
    const media = db.prepare(`INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(Number(node.lastInsertRowid), candidate.mediaType, finalPath, candidate.originalUrl, sha256, mimeType, bytes, candidate.durationSeconds, PEXELS_LICENSE, `${candidate.mediaType === 'photo' ? 'Photo' : 'Video'} by ${candidate.creator} on Pexels`, JSON.stringify(properties));
    db.exec('COMMIT');
    return { duplicate: false, id: Number(media.lastInsertRowid) };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    throw error;
  } finally { db.close(); }
}

async function searchCandidates(fetchImpl: FetchLike, apiKey: string, mediaType: PexelsMediaType, query: string, page: number, batchSize: number, maxBytes: number) {
  const endpoint = pexelsApiUrl(mediaType, query, page, batchSize);
  if (!safeApiUrl(endpoint.toString())) throw new Error('invalid_api_endpoint');
  const response = await fetchImpl(endpoint, { cache: 'no-store', redirect: 'error', headers: { Authorization: apiKey, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`api_http_${response.status}`);
  if (!responseUrlAllowed(response, mediaType, endpoint.toString())) throw new Error('redirect_not_allowed');
  try { return parseCandidates(await response.json(), mediaType, batchSize, maxBytes); } catch { throw new Error('invalid_api_response'); }
}

export async function syncPexelsMedia(options: { mediaType?: PexelsMediaType; query?: string; batchSize?: number; maxBytes?: number; page?: number; apiKey?: string; fetchImpl?: FetchLike } = {}): Promise<PexelsMediaSyncResult> {
  const mediaType = options.mediaType ?? 'photo';
  if (mediaType !== 'photo' && mediaType !== 'video') throw new Error('Pexels 미디어 유형이 올바르지 않습니다.');
  const query = safeQuery(options.query);
  const batchSize = safeBatchSize(options.batchSize);
  const maxBytes = safeMaxBytes(options.maxBytes);
  const page = safePage(options.page);
  const runId = startIngestRun('pexels-media', 'sync');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const errors: PexelsMediaSyncResult['errors'] = [];
  const apiKey = options.apiKey?.trim() || resolvePexelsApiKey();
  if (!apiKey) {
    finishIngestRun(runId, 'blocked', 0, 0, 'PEXELS_API_KEY가 없어 Pexels 수집을 차단했습니다.', { mediaType, query, batchSize, maxBytes, reason: 'missing_api_key' });
    return { runId, mediaType, query, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 0, status: 'blocked', errors };
  }
  let candidates: Candidate[] = [];
  try { candidates = await searchCandidates(fetchImpl, apiKey, mediaType, query, page, batchSize, maxBytes); }
  catch (error) {
    const code = errorCode(error);
    finishIngestRun(runId, 'failed', 0, 0, 'Pexels 검색에 실패했습니다.', { mediaType, query, batchSize, maxBytes, failed: 1, errors: [{ code }] });
    return { runId, mediaType, query, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 1, status: 'failed', errors: [{ id: 0, mediaType, code }] };
  }
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw');
  const runDirectory = path.join(rawRoot, 'pexels-media', String(runId), mediaType);
  let downloaded = 0;
  let deduped = 0;
  for (const candidate of candidates) {
    const before = openArchiveDb();
    try { if (existingMedia(before, candidate)) { deduped += 1; continue; } } finally { before.close(); }
    let finalPath: string | null = null;
    try {
      const response = await fetchImpl(candidate.originalUrl, { cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error(`http_${response.status}`);
      if (!responseUrlAllowed(response, mediaType, candidate.originalUrl)) throw new Error('redirect_not_allowed');
      const mimeType = responseMime(response, mediaType);
      if (!mimeType) throw new Error('invalid_mime');
      const declaredBytes = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error('oversize');
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maxBytes) throw new Error('oversize');
      const sha256 = crypto.createHash('sha256').update(body).digest('hex');
      finalPath = writeAtomically(runDirectory, `pexels-${safeFilePart(String(candidate.id))}${EXTENSIONS[mimeType] ?? '.bin'}`, body);
      const persisted = persistMedia(candidate, finalPath, sha256, mimeType, body.byteLength, query, new Date().toISOString());
      if (persisted.duplicate) { try { fs.unlinkSync(finalPath); } catch { /* best-effort */ } deduped += 1; }
      else downloaded += 1;
    } catch (error) {
      if (finalPath) try { fs.unlinkSync(finalPath); } catch { /* best-effort */ }
      errors.push({ id: candidate.id, mediaType, code: errorCode(error) });
    }
  }
  const status = errors.length === 0 ? 'success' : downloaded > 0 ? 'partial' : 'failed';
  finishIngestRun(runId, status, candidates.length, downloaded, errors.length ? `${errors.length}건의 Pexels 미디어 수집에 실패했습니다.` : null, { mediaType, query, page, batchSize, maxBytes, downloaded, deduped, failed: errors.length, errors });
  return { runId, mediaType, query, rowsSeen: candidates.length, rowsStaged: downloaded, downloaded, deduped, failed: errors.length, status, errors };
}
