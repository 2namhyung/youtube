import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

export type KeylessProvider = 'wikimedia' | 'nasa' | 'loc';
export type KeylessMediaType = 'photo' | 'video';

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_MAX_BYTES = 50 * 1024 * 1024;
const USER_AGENT = process.env.MEDIA_USER_AGENT_CONTACT
  ? `23jung-media-collector/1.0 (${process.env.MEDIA_USER_AGENT_CONTACT})`
  : '23jung-media-collector/1.0 (local development)';

type ProviderConfig = {
  slug: string;
  defaultQuery: string;
  apiOrigin: string;
  apiPath: string;
  apiHosts: readonly string[];
  itemHosts: readonly string[];
  downloadHosts: readonly string[];
};

const CONFIG: Record<KeylessProvider, ProviderConfig> = {
  wikimedia: {
    slug: 'wikimedia-commons', defaultQuery: 'Seoul',
    apiOrigin: 'https://commons.wikimedia.org', apiPath: '/w/api.php',
    apiHosts: ['commons.wikimedia.org'], itemHosts: ['commons.wikimedia.org'],
    downloadHosts: ['upload.wikimedia.org', 'commons.wikimedia.org'],
  },
  nasa: {
    slug: 'nasa-images', defaultQuery: 'Earth',
    apiOrigin: 'https://images-api.nasa.gov', apiPath: '/search',
    apiHosts: ['images-api.nasa.gov'], itemHosts: ['images.nasa.gov'],
    downloadHosts: ['images-assets.nasa.gov', 'images.nasa.gov'],
  },
  loc: {
    slug: 'loc-media', defaultQuery: 'Seoul',
    apiOrigin: 'https://www.loc.gov', apiPath: '/photos/',
    apiHosts: ['www.loc.gov'], itemHosts: ['www.loc.gov', 'loc.gov'],
    downloadHosts: ['tile.loc.gov', 'cdn.loc.gov', 'www.loc.gov', 'loc.gov'],
  },
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/tiff': '.tif', 'image/avif': '.avif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};

type Candidate = {
  provider: KeylessProvider;
  id: string;
  mediaType: KeylessMediaType;
  originalUrl: string;
  itemUrl: string;
  title: string;
  creator: string;
  publisher: string;
  license: string;
  rightsStatus: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  providerMetadata: Record<string, unknown>;
};

export type KeylessMediaSyncResult = {
  provider: KeylessProvider;
  runId: number;
  query: string;
  rowsSeen: number;
  rowsStaged: number;
  downloaded: number;
  deduped: number;
  failed: number;
  status: 'success' | 'partial' | 'failed';
  errors: { id: string; code: string }[];
};

type FetchLike = typeof fetch;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function text(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim().slice(0, 2000);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ').trim().slice(0, 2000);
  return fallback;
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeQuery(provider: KeylessProvider, value: string | undefined) {
  const query = (value ?? CONFIG[provider].defaultQuery).trim();
  if (!query || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error(`${provider} 검색어가 올바르지 않습니다.`);
  return query;
}

function safeBatchSize(value: number | undefined) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('키 없는 미디어 수집 배치는 1 이상의 정수여야 합니다.');
  return Math.min(value, MAX_BATCH_SIZE);
}

function safePage(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error('키 없는 미디어 검색 페이지는 1–10000 사이의 정수여야 합니다.');
  return value;
}

function safeMaxBytes(value: number | undefined) {
  if (value === undefined) return DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('미디어 최대 크기가 올바르지 않습니다.');
  return Math.min(value, MAX_MAX_BYTES);
}

function safeHttpsUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch { return null; }
}

function safeApiUrl(provider: KeylessProvider, value: string) {
  const config = CONFIG[provider];
  try {
    const url = new URL(value);
    if (url.origin !== config.apiOrigin || url.pathname !== config.apiPath || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

function apiUrl(provider: KeylessProvider, query: string, batchSize: number, page: number, mediaType: KeylessMediaType) {
  const config = CONFIG[provider];
  const url = new URL(`${config.apiOrigin}${config.apiPath}`);
  if (provider === 'wikimedia') {
    url.searchParams.set('action', 'query'); url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', `${query} filetype:${mediaType === 'photo' ? 'bitmap' : 'video'}`); url.searchParams.set('gsrnamespace', '6');
    if (page > 1) url.searchParams.set('gsroffset', String((page - 1) * batchSize));
    url.searchParams.set('gsrlimit', String(batchSize)); url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size|dimensions|extmetadata');
    url.searchParams.set('iiurlwidth', '1600'); url.searchParams.set('format', 'json'); url.searchParams.set('formatversion', '2');
  } else if (provider === 'nasa') {
    url.searchParams.set('q', query); url.searchParams.set('media_type', 'image'); url.searchParams.set('page_size', String(batchSize)); url.searchParams.set('page', String(page));
  } else {
    url.searchParams.set('q', query); url.searchParams.set('fo', 'json'); url.searchParams.set('c', String(batchSize)); url.searchParams.set('sp', String(page));
  }
  return url;
}

function extValue(value: unknown) {
  const item = object(value);
  return text(item?.value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/(?:&#39;|&apos;)/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWikimedia(payload: unknown, batchSize: number, requestedType: KeylessMediaType): Candidate[] {
  const root = object(payload); const query = object(root?.query);
  const rawPages = Array.isArray(query?.pages) ? query.pages : Object.values(object(query?.pages) ?? {});
  const result: Candidate[] = [];
  for (const raw of rawPages) {
    const page = object(raw); const info = object(Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null);
    const mime = text(info?.mime).toLowerCase();
    const mediaType: KeylessMediaType | null = mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : null;
    const id = positiveInteger(page?.pageid); const title = text(page?.title);
    const originalUrl = safeHttpsUrl(info?.thumburl ?? info?.url, CONFIG.wikimedia.downloadHosts);
    const itemUrl = safeHttpsUrl(`https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/^File:/i, 'File:').replaceAll(' ', '_'))}`, CONFIG.wikimedia.itemHosts);
    if (!id || mediaType !== requestedType || !originalUrl || !itemUrl || !title) continue;
    const meta = object(info?.extmetadata);
    result.push({ provider: 'wikimedia', id: String(id), mediaType, originalUrl, itemUrl, title,
      creator: extValue(meta?.Artist) || 'Wikimedia Commons 제작자 미상', publisher: 'Wikimedia Commons',
      license: extValue(meta?.LicenseShortName) || '파일별 라이선스 확인 필요',
      rightsStatus: extValue(meta?.UsageTerms) || '파일별 이용조건 확인 필요', width: positiveInteger(info?.width), height: positiveInteger(info?.height), durationSeconds: null,
      providerMetadata: { pageId: id, mime, licenseUrl: extValue(meta?.LicenseUrl), credit: extValue(meta?.Credit), description: extValue(meta?.ImageDescription) }, });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseNasa(payload: unknown, batchSize: number): Candidate[] {
  const root = object(payload); const collection = object(root?.collection);
  const rows = Array.isArray(collection?.items) ? collection.items : [];
  const result: Candidate[] = [];
  for (const raw of rows) {
    const item = object(raw); const data = object(Array.isArray(item?.data) ? item.data[0] : null);
    const links = Array.isArray(item?.links) ? item.links : [];
    const link = links.map(object).find((candidate) => {
      const rel = text(candidate?.rel).toLowerCase(); const href = safeHttpsUrl(candidate?.href, CONFIG.nasa.downloadHosts);
      return Boolean(href && (rel === 'preview' || rel === 'alternate' || /\.(?:jpe?g|png|gif|webp|mp4|webm)(?:$|\?)/i.test(href)));
    });
    const id = text(data?.nasa_id); const mediaValue = text(data?.media_type).toLowerCase();
    const mediaType: KeylessMediaType | null = mediaValue === 'image' ? 'photo' : null;
    const originalUrl = safeHttpsUrl(link?.href, CONFIG.nasa.downloadHosts);
    const itemUrl = id ? safeHttpsUrl(`https://images.nasa.gov/details/${encodeURIComponent(id)}`, CONFIG.nasa.itemHosts) : null;
    if (!id || !mediaType || !originalUrl || !itemUrl) continue;
    result.push({ provider: 'nasa', id, mediaType, originalUrl, itemUrl, title: text(data?.title) || `NASA ${id}`,
      creator: text(data?.photographer) || text(data?.creator) || 'NASA 제작자 미상', publisher: 'NASA',
      license: 'NASA 미디어 사용 지침 및 항목별 권리 확인 필요',
      rightsStatus: 'NASA 자료라도 제3자 저작권·초상·상표 권리 확인 필요', width: positiveInteger(data?.width), height: positiveInteger(data?.height), durationSeconds: null,
      providerMetadata: { nasaId: id, mediaType, dateCreated: text(data?.date_created), center: text(data?.center), keywords: data?.keywords, description: text(data?.description), thirdPartyRightsCheck: true }, });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseLoc(payload: unknown, batchSize: number): Candidate[] {
  const root = object(payload); const rows = Array.isArray(root?.results) ? root.results : [];
  const result: Candidate[] = [];
  for (const raw of rows) {
    const item = object(raw); const imageUrls = Array.isArray(item?.image_url) ? item.image_url : [];
    const originalUrl = imageUrls.map((value) => safeHttpsUrl(value, CONFIG.loc.downloadHosts)).find(Boolean) ?? null;
    const rawId = text(item?.id); const itemUrl = safeHttpsUrl(rawId.startsWith('http:') ? rawId.replace(/^http:/, 'https:') : rawId, CONFIG.loc.itemHosts);
    const id = text(item?.id) || text(item?.url);
    if (!id || !originalUrl || !itemUrl) continue;
    const rights = text(item?.rights) || text(item?.rights_summary) || text(item?.license);
    result.push({ provider: 'loc', id, mediaType: 'photo', originalUrl, itemUrl, title: text(item?.title) || 'Library of Congress 자료',
      creator: text(item?.contributor) || text(item?.created_published) || '제작자 미상', publisher: 'Library of Congress',
      license: rights || '항목별 Rights and Access 확인 필요', rightsStatus: rights || '항목별 저작권 상태 확인 필요', width: null, height: null, durationSeconds: null,
      providerMetadata: { locId: id, date: text(item?.date), createdPublished: text(item?.created_published), rights, subjects: item?.subject, description: text(item?.description) }, });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseCandidates(provider: KeylessProvider, payload: unknown, batchSize: number, mediaType: KeylessMediaType) {
  if (provider === 'wikimedia') return parseWikimedia(payload, batchSize, mediaType);
  if (provider === 'nasa') return parseNasa(payload, batchSize);
  return parseLoc(payload, batchSize);
}

function safeFilePart(value: string) {
  const result = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
  return result || 'unknown';
}

function responseMime(response: Response, mediaType: KeylessMediaType) {
  const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (mediaType === 'photo' ? mime.startsWith('image/') : mime.startsWith('video/')) ? mime : null;
}

function responseUrlAllowed(response: Response, hosts: readonly string[], requestedUrl: string) {
  const actual = response.url;
  if (!actual || actual === requestedUrl) return true;
  return Boolean(safeHttpsUrl(actual, hosts));
}

function errorCode(error: unknown) {
  if (!(error instanceof Error)) return 'download_failed';
  const match = /^(api_http_\d+|http_\d+|invalid_[a-z_]+|oversize|redirect_not_allowed|download_failed)$/.exec(error.message);
  return match?.[1] ?? 'download_failed';
}

function writeAtomically(directory: string, filename: string, bytes: Uint8Array) {
  fs.mkdirSync(directory, { recursive: true }); const finalPath = path.join(directory, filename); const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  try { fs.writeFileSync(tempPath, bytes, { flag: 'wx' }); fs.renameSync(tempPath, finalPath); return finalPath; }
  catch (error) { try { fs.unlinkSync(tempPath); } catch { /* best effort */ } throw error; }
}

function existingMedia(db: ReturnType<typeof openArchiveDb>, candidate: Candidate, sha256?: string) {
  const rows = db.prepare('SELECT id,path,original_url,sha256,properties_json FROM media_assets').all() as { id: number; path: string; original_url: string; sha256: string | null; properties_json: string }[];
  return rows.find((row) => {
    if (row.original_url === candidate.originalUrl || (sha256 && row.sha256 === sha256)) return true;
    try { const properties = JSON.parse(row.properties_json) as { itemUrl?: string; provider?: string; providerId?: string }; return properties.itemUrl === candidate.itemUrl || (properties.provider === candidate.provider && properties.providerId === candidate.id); }
    catch { return false; }
  });
}

function persistMedia(candidate: Candidate, finalPath: string, sha256: string, mimeType: string, bytes: number, query: string, retrievedAt: string) {
  const db = openArchiveDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const duplicate = existingMedia(db, candidate, sha256);
    if (duplicate) { db.exec('ROLLBACK'); return { duplicate: true, id: duplicate.id }; }
    const properties = { provider: candidate.provider, providerId: candidate.id, mediaType: candidate.mediaType, query, sourceUrl: candidate.itemUrl, itemUrl: candidate.itemUrl, creator: candidate.creator, publisher: candidate.publisher, title: candidate.title, license: candidate.license, rightsStatus: candidate.rightsStatus, retrievedAt, originalUrl: candidate.originalUrl, ...candidate.providerMetadata };
    const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run(candidate.mediaType, `${candidate.provider}:${candidate.id}`, candidate.title, JSON.stringify(properties), retrievedAt);
    const media = db.prepare('INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(Number(node.lastInsertRowid), candidate.mediaType, finalPath, candidate.originalUrl, sha256, mimeType, bytes, candidate.durationSeconds, candidate.license, `${candidate.title} — ${candidate.creator}; ${candidate.publisher}; ${candidate.itemUrl}`, JSON.stringify(properties));
    db.exec('COMMIT'); return { duplicate: false, id: Number(media.lastInsertRowid) };
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; }
  finally { db.close(); }
}

async function searchCandidates(provider: KeylessProvider, fetchImpl: FetchLike, query: string, batchSize: number, page: number, mediaType: KeylessMediaType) {
  const endpoint = apiUrl(provider, query, batchSize, page, mediaType);
  if (!safeApiUrl(provider, endpoint.toString())) throw new Error('invalid_api_endpoint');
  const response = await fetchImpl(endpoint, { cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`api_http_${response.status}`);
  if (!responseUrlAllowed(response, CONFIG[provider].apiHosts, endpoint.toString())) throw new Error('redirect_not_allowed');
  try { return parseCandidates(provider, await response.json(), batchSize, mediaType); } catch { throw new Error('invalid_api_response'); }
}

export async function syncKeylessMedia(provider: KeylessProvider, options: { query?: string; batchSize?: number; maxBytes?: number; page?: number; mediaType?: KeylessMediaType; fetchImpl?: FetchLike } = {}): Promise<KeylessMediaSyncResult> {
  if (!CONFIG[provider]) throw new Error('키 없는 미디어 수집원이 올바르지 않습니다.');
  const query = safeQuery(provider, options.query); const batchSize = safeBatchSize(options.batchSize); const maxBytes = safeMaxBytes(options.maxBytes); const page = safePage(options.page); const mediaType = options.mediaType ?? 'photo';
  if (mediaType !== 'photo' && mediaType !== 'video') throw new Error('키 없는 미디어 유형은 photo 또는 video여야 합니다.');
  if (provider !== 'wikimedia' && mediaType === 'video') throw new Error(`${provider} route는 photo만 지원합니다.`);
  const runId = startIngestRun(CONFIG[provider].slug, 'sync'); const errors: KeylessMediaSyncResult['errors'] = []; const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let candidates: Candidate[] = [];
  try { candidates = await searchCandidates(provider, fetchImpl, query, batchSize, page, mediaType); }
  catch (error) { const code = errorCode(error); finishIngestRun(runId, 'failed', 0, 0, `${provider} 검색에 실패했습니다.`, { provider, query, page, mediaType, batchSize, maxBytes, failed: 1, errors: [{ code }] }); return { provider, runId, query, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 1, status: 'failed', errors: [{ id: '', code }] }; }
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw'); const runDirectory = path.join(rawRoot, provider, String(runId)); let downloaded = 0; let deduped = 0;
  for (const candidate of candidates) {
    const before = openArchiveDb();
    try { if (existingMedia(before, candidate)) { deduped += 1; continue; } } finally { before.close(); }
    let finalPath: string | null = null;
    try {
      const response = await fetchImpl(candidate.originalUrl, { cache: 'no-store', redirect: 'error', headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) throw new Error(`http_${response.status}`);
      if (!responseUrlAllowed(response, CONFIG[provider].downloadHosts, candidate.originalUrl)) throw new Error('redirect_not_allowed');
      const mimeType = responseMime(response, candidate.mediaType); if (!mimeType) throw new Error('invalid_mime');
      const declaredBytes = Number(response.headers.get('content-length')); if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error('oversize');
      const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > maxBytes) throw new Error('oversize');
      const sha256 = crypto.createHash('sha256').update(body).digest('hex'); const filename = `${provider}-${safeFilePart(candidate.id)}${EXTENSIONS[mimeType] ?? '.bin'}`;
      finalPath = writeAtomically(path.join(runDirectory, candidate.mediaType), filename, body);
      const persisted = persistMedia(candidate, finalPath, sha256, mimeType, body.byteLength, query, new Date().toISOString());
      if (persisted.duplicate) { try { fs.unlinkSync(finalPath); } catch { /* best effort */ } deduped += 1; } else downloaded += 1;
    } catch (error) { if (finalPath) try { fs.unlinkSync(finalPath); } catch { /* best effort */ } errors.push({ id: candidate.id, code: errorCode(error) }); }
  }
  const status = errors.length === 0 ? 'success' : downloaded > 0 ? 'partial' : 'failed';
  finishIngestRun(runId, status, candidates.length, downloaded, errors.length ? `${errors.length}건의 ${provider} 미디어 수집에 실패했습니다.` : null, { provider, query, page, mediaType, batchSize, maxBytes, downloaded, deduped, failed: errors.length, errors, semantics: 'discovery_candidate_staged_rights_review_required' });
  return { provider, runId, query, rowsSeen: candidates.length, rowsStaged: downloaded, downloaded, deduped, failed: errors.length, status, errors };
}

export const syncWikimediaMedia = (options: Parameters<typeof syncKeylessMedia>[1] = {}) => syncKeylessMedia('wikimedia', options);
export const syncNasaMedia = (options: Parameters<typeof syncKeylessMedia>[1] = {}) => syncKeylessMedia('nasa', options);
export const syncLocMedia = (options: Parameters<typeof syncKeylessMedia>[1] = {}) => syncKeylessMedia('loc', options);
