import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

export type KeylessVideoProvider = 'wikimedia' | 'nasa' | 'loc';

const DEFAULT_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 2;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const USER_AGENT = '23jung-media-collector/1.0 (local development)';
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-msvideo', 'video/x-matroska']);
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv'];

type ProviderConfig = { slug: string; defaultQuery: string; apiOrigin: string; searchPath: string; apiHosts: readonly string[]; itemHosts: readonly string[]; downloadHosts: readonly string[] };

const CONFIG: Record<KeylessVideoProvider, ProviderConfig> = {
  wikimedia: { slug: 'wikimedia-commons', defaultQuery: 'Seoul', apiOrigin: 'https://commons.wikimedia.org', searchPath: '/w/api.php', apiHosts: ['commons.wikimedia.org'], itemHosts: ['commons.wikimedia.org'], downloadHosts: ['upload.wikimedia.org'] },
  nasa: { slug: 'nasa-images', defaultQuery: 'Earth', apiOrigin: 'https://images-api.nasa.gov', searchPath: '/search', apiHosts: ['images-api.nasa.gov'], itemHosts: ['images.nasa.gov'], downloadHosts: ['images-assets.nasa.gov'] },
  loc: { slug: 'loc-media', defaultQuery: 'trailer', apiOrigin: 'https://www.loc.gov', searchPath: '/film-and-videos/', apiHosts: ['www.loc.gov'], itemHosts: ['www.loc.gov', 'loc.gov'], downloadHosts: ['tile.loc.gov', 'cdn.loc.gov', 'www.loc.gov', 'loc.gov'] },
};

const EXTENSIONS: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/ogg': '.ogv', 'video/x-msvideo': '.avi', 'video/x-matroska': '.mkv' };

type VideoCandidate = {
  provider: KeylessVideoProvider;
  id: string;
  itemUrl: string;
  title: string;
  creator: string;
  publisher: string;
  license: string;
  rightsStatus: string;
  downloadUrls: string[];
  providerMetadata: Record<string, unknown>;
};

export type KeylessVideoSyncResult = {
  provider: KeylessVideoProvider;
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

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' ? value as Record<string, unknown> : null; }
function text(value: unknown, fallback = '') { if (typeof value === 'string') return value.trim().slice(0, 2000); if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ').trim().slice(0, 2000); return fallback; }
function safeHttpsUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value.trim()); if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) return null; return url.toString(); } catch { return null; }
}
function safeNasaAssetUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'http:' && url.hostname.toLowerCase() === 'images-assets.nasa.gov') url.protocol = 'https:';
    return safeHttpsUrl(url.toString(), CONFIG.nasa.downloadHosts);
  } catch { return null; }
}
function safeQuery(provider: KeylessVideoProvider, value: string | undefined) {
  const query = (value ?? CONFIG[provider].defaultQuery).trim();
  if (!query || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error(`${provider} 영상 검색어가 올바르지 않습니다.`);
  return query;
}
function safeBatchSize(value: number | undefined) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('영상 수집 배치는 1 이상의 정수여야 합니다.');
  return Math.min(value, MAX_BATCH_SIZE);
}
function safeMaxBytes(value: number | undefined) {
  if (value === undefined) return DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('영상 최대 크기가 올바르지 않습니다.');
  return Math.min(value, DEFAULT_MAX_BYTES);
}
function safeApiUrl(provider: KeylessVideoProvider, value: string, kind: 'search' | 'asset' | 'item') {
  const config = CONFIG[provider];
  try {
    const url = new URL(value);
    const allowedHosts = kind === 'item' ? config.itemHosts : config.apiHosts;
    if (!allowedHosts.includes(url.hostname.toLowerCase()) || url.protocol !== 'https:' || url.username || url.password) return null;
    if (kind === 'search' && (url.origin !== config.apiOrigin || url.pathname !== config.searchPath)) return null;
    if (kind === 'asset' && (provider !== 'nasa' || url.origin !== config.apiOrigin || !/^\/asset\/[A-Za-z0-9._~-]+$/.test(url.pathname))) return null;
    if (kind === 'item') {
      if (provider !== 'loc' || !/^\/(?:item|pictures\/item|resource|film-and-videos|collections)\/[A-Za-z0-9._~%/-]+\/?$/.test(url.pathname)) return null;
      for (const key of url.searchParams.keys()) if (key !== 'fo' && key !== 'at') return null;
      if (url.searchParams.has('fo') && url.searchParams.get('fo') !== 'json') return null;
      if (url.searchParams.has('at') && url.searchParams.get('at') !== 'resources') return null;
    }
    return url;
  } catch { return null; }
}
function apiUrl(provider: KeylessVideoProvider, query: string, batchSize: number) {
  const config = CONFIG[provider]; const url = new URL(`${config.apiOrigin}${config.searchPath}`);
  if (provider === 'wikimedia') {
    url.searchParams.set('action', 'query'); url.searchParams.set('generator', 'search'); url.searchParams.set('gsrsearch', `${query} filetype:video`); url.searchParams.set('gsrnamespace', '6'); url.searchParams.set('gsrlimit', String(batchSize)); url.searchParams.set('prop', 'imageinfo'); url.searchParams.set('iiprop', 'url|mime|size|extmetadata'); url.searchParams.set('format', 'json'); url.searchParams.set('formatversion', '2');
  } else if (provider === 'nasa') {
    url.searchParams.set('q', query); url.searchParams.set('media_type', 'video'); url.searchParams.set('page_size', String(batchSize));
  } else { url.searchParams.set('q', query); url.searchParams.set('fo', 'json'); url.searchParams.set('c', String(Math.min(batchSize * 5, 10))); }
  return url;
}
function videoExtension(value: string) { try { return VIDEO_EXTENSIONS.some((ext) => new URL(value).pathname.toLowerCase().endsWith(ext)); } catch { return false; } }
function videoRank(value: string) {
  const lower = value.toLowerCase(); const resolution = lower.match(/(?:^|[^0-9])(2160|1440|1080|720|480)(?:p|[^0-9]|$)/)?.[1];
  const score = resolution === '1080' ? 500 : resolution === '720' ? 450 : resolution === '480' ? 400 : resolution === '1440' ? 300 : resolution === '2160' ? 100 : 250;
  return score - (lower.includes('preview') || lower.includes('thumb') ? 1000 : 0);
}
function looksLikeNasaVideoAsset(value: string) {
  if (videoExtension(value)) return true;
  try { const pathname = new URL(value).pathname.toLowerCase(); return pathname.includes('/video/') && !pathname.endsWith('.json') && !pathname.endsWith('.vtt') && !pathname.endsWith('.srt'); } catch { return false; }
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
function itemPage(title: string) { return safeHttpsUrl(`https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/^File:/i, 'File:').replaceAll(' ', '_'))}`, CONFIG.wikimedia.itemHosts); }

function parseWikimedia(payload: unknown, batchSize: number, maxBytes: number): VideoCandidate[] {
  const root = object(payload); const query = object(root?.query); const pages = Array.isArray(query?.pages) ? query.pages : Object.values(object(query?.pages) ?? {}); const result: VideoCandidate[] = [];
  for (const raw of pages) {
    const page = object(raw); const info = object(Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null); const mime = text(info?.mime).toLowerCase(); const id = typeof page?.pageid === 'number' ? String(page.pageid) : text(page?.pageid); const title = text(page?.title); const url = safeHttpsUrl(info?.url, CONFIG.wikimedia.downloadHosts); const itemUrl = itemPage(title); const size = typeof info?.size === 'number' ? info.size : 0;
    if (!id || !title || !mime.startsWith('video/') || !url || !itemUrl || (size > 0 && size > maxBytes)) continue;
    const meta = object(info?.extmetadata);
    result.push({ provider: 'wikimedia', id, itemUrl, title, creator: extValue(meta?.Artist) || 'Wikimedia Commons 제작자 미상', publisher: 'Wikimedia Commons', license: extValue(meta?.LicenseShortName) || '파일별 라이선스 확인 필요', rightsStatus: extValue(meta?.UsageTerms) || '파일별 이용조건 확인 필요', downloadUrls: [url], providerMetadata: { pageId: id, mime, licenseUrl: extValue(meta?.LicenseUrl), credit: extValue(meta?.Credit), originalSize: size || null } });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseNasaSearch(payload: unknown, batchSize: number): VideoCandidate[] {
  const root = object(payload); const collection = object(root?.collection); const rows = Array.isArray(collection?.items) ? collection.items : []; const result: VideoCandidate[] = [];
  for (const raw of rows) {
    const item = object(raw); const data = object(Array.isArray(item?.data) ? item.data[0] : null); const id = text(data?.nasa_id); const mediaType = text(data?.media_type).toLowerCase(); const itemUrl = id ? safeHttpsUrl(`https://images.nasa.gov/details/${encodeURIComponent(id)}`, CONFIG.nasa.itemHosts) : null;
    if (!id || mediaType !== 'video' || !itemUrl) continue;
    result.push({ provider: 'nasa', id, itemUrl, title: text(data?.title) || `NASA ${id}`, creator: text(data?.photographer) || text(data?.creator) || 'NASA 제작자 미상', publisher: 'NASA', license: 'NASA 미디어 사용 지침 및 항목별 권리 확인 필요', rightsStatus: 'NASA 자료라도 제3자 저작권·초상·상표 권리 확인 필요', downloadUrls: [], providerMetadata: { nasaId: id, mediaType, dateCreated: text(data?.date_created), center: text(data?.center), description: text(data?.description), thirdPartyRightsCheck: true } });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseNasaAsset(payload: unknown, candidate: VideoCandidate) {
  const root = object(payload); const collection = object(root?.collection); const items = Array.isArray(collection?.items) ? collection.items : []; const urls = items.map(object).map((item) => safeNasaAssetUrl(item?.href)).filter((value): value is string => Boolean(value)).filter(looksLikeNasaVideoAsset).sort((a, b) => videoRank(b) - videoRank(a));
  return { ...candidate, downloadUrls: [...new Set(urls)] };
}

type LocVideoLink = { url: string; size: number | null };

function collectLocVideoUrls(value: unknown, keyHint = '', found: LocVideoLink[] = [], videoContext = false, inheritedSize: number | null = null) {
  const key = keyHint.toLowerCase();
  if (typeof value === 'string') {
    const allowed = safeHttpsUrl(value, CONFIG.loc.downloadHosts);
    if (allowed && !/\.m3u8(?:$|\?)/i.test(allowed) && (videoExtension(allowed) || videoContext || /video|stream|download/.test(key)) && !/image|thumb|poster|cover|preview|iiif/.test(key)) found.push({ url: allowed, size: inheritedSize });
    return found;
  }
  if (Array.isArray(value)) { for (const item of value) collectLocVideoUrls(item, keyHint, found, videoContext, inheritedSize); return found; }
  const item = object(value); if (!item) return found;
  const objectVideo = videoContext || /video|stream|download/.test(key) || Object.entries(item).some(([name, child]) => /mime|type|format/i.test(name) && typeof child === 'string' && child.toLowerCase().startsWith('video/'));
  const localSize = typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : inheritedSize;
  for (const [keyName, child] of Object.entries(item)) {
    const nextKey = keyHint ? `${keyHint}.${keyName}` : keyName;
    collectLocVideoUrls(child, nextKey, found, objectVideo, localSize);
  }
  return found;
}

function parseLocSearch(payload: unknown, batchSize: number): VideoCandidate[] {
  const root = object(payload); const rows = Array.isArray(root?.results) ? root.results : []; const result: VideoCandidate[] = [];
  for (const raw of rows) {
    const item = object(raw); const id = text(item?.id); const itemUrl = safeHttpsUrl(id.startsWith('http:') ? id.replace(/^http:/, 'https:') : id, CONFIG.loc.itemHosts); if (!id || !itemUrl) continue;
    const format = `${text(item?.format)} ${text(item?.original_format)} ${text(item?.online_format)}`.toLowerCase(); if (format && !format.includes('video') && !format.includes('film')) continue;
    result.push({ provider: 'loc', id, itemUrl, title: text(item?.title) || 'Library of Congress 영상', creator: text(item?.contributor) || text(item?.created_published) || '제작자 미상', publisher: 'Library of Congress', license: text(item?.rights) || text(item?.rights_summary) || '항목별 Rights and Access 확인 필요', rightsStatus: text(item?.rights) || text(item?.rights_summary) || '항목별 저작권 상태 확인 필요', downloadUrls: [], providerMetadata: { locId: id, date: text(item?.date), format, downloadRestricted: item?.download_restricted ?? null, rightsRestricted: item?.rights_restricted ?? null, resourceLookupRequired: true } });
    if (result.length >= batchSize) break;
  }
  return result;
}

function parseLocItem(payload: unknown, candidate: VideoCandidate, maxBytes: number) {
  const root = object(payload); const links = collectLocVideoUrls(payload); const byUrl = new Map<string, LocVideoLink>();
  for (const link of links) { const existing = byUrl.get(link.url); if (!existing || (existing.size === null && link.size !== null)) byUrl.set(link.url, link); }
  const ordered = [...byUrl.values()].sort((a, b) => videoRank(b.url) - videoRank(a.url));
  const usable = ordered.filter((link) => link.size === null || link.size <= maxBytes);
  const knownOversize = usable.length === 0 && ordered.some((link) => link.size !== null && link.size > maxBytes);
  return { ...candidate, downloadUrls: usable.map((link) => link.url), providerMetadata: { ...candidate.providerMetadata, downloadRestricted: root?.download_restricted ?? candidate.providerMetadata.downloadRestricted ?? null, rightsRestricted: root?.rights_restricted ?? candidate.providerMetadata.rightsRestricted ?? null, knownOversizeVideo: knownOversize } };
}

function responseUrlAllowed(response: Response, hosts: readonly string[], requestedUrl: string) { const actual = response.url; return !actual || actual === requestedUrl || Boolean(safeHttpsUrl(actual, hosts)); }
function responseMime(response: Response) { const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''; return VIDEO_MIMES.has(mime) || mime.startsWith('video/') ? mime : null; }
function errorCode(error: unknown) { if (!(error instanceof Error)) return 'download_failed'; const match = /^(api_http_\d+|http_\d+|invalid_[a-z_]+|oversize|redirect_not_allowed|no_allowed_video_resource|restricted_video_resource|download_failed)$/.exec(error.message); return match?.[1] ?? 'download_failed'; }
function resolveUserAgent(value?: string) { const explicit = value?.trim() || process.env.MEDIA_USER_AGENT?.trim(); if (explicit) return explicit.slice(0, 300); const contact = process.env.MEDIA_USER_AGENT_CONTACT?.trim(); return `${USER_AGENT}${contact ? `; contact ${contact}` : ''}`.slice(0, 300); }
function safeFilePart(value: string) { const result = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80); return result || 'unknown'; }
function writeAtomically(directory: string, filename: string, bytes: Uint8Array) { fs.mkdirSync(directory, { recursive: true }); const finalPath = path.join(directory, filename); const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`; try { fs.writeFileSync(tempPath, bytes, { flag: 'wx' }); fs.renameSync(tempPath, finalPath); return finalPath; } catch (error) { try { fs.unlinkSync(tempPath); } catch { /* best effort */ } throw error; } }

function existingMedia(db: ReturnType<typeof openArchiveDb>, candidate: VideoCandidate, sha256?: string) {
  const rows = db.prepare("SELECT id,path,original_url,sha256,properties_json FROM media_assets WHERE media_type='video'").all() as { id: number; path: string; original_url: string; sha256: string | null; properties_json: string }[];
  return rows.find((row) => { if (row.original_url === candidate.downloadUrls[0] || (sha256 && row.sha256 === sha256)) return true; try { const properties = JSON.parse(row.properties_json) as { itemUrl?: string; provider?: string; providerId?: string }; return properties.itemUrl === candidate.itemUrl || (properties.provider === candidate.provider && properties.providerId === candidate.id); } catch { return false; } });
}
function persistMedia(candidate: VideoCandidate, originalUrl: string, finalPath: string, sha256: string, mimeType: string, bytes: number, query: string, retrievedAt: string) {
  const db = openArchiveDb(); try { db.exec('BEGIN IMMEDIATE'); const duplicate = existingMedia(db, { ...candidate, downloadUrls: [originalUrl] }, sha256); if (duplicate) { db.exec('ROLLBACK'); return { duplicate: true, id: duplicate.id }; }
    const properties = { provider: candidate.provider, providerId: candidate.id, mediaType: 'video', query, sourceUrl: candidate.itemUrl, itemUrl: candidate.itemUrl, creator: candidate.creator, publisher: candidate.publisher, title: candidate.title, license: candidate.license, rightsStatus: candidate.rightsStatus, retrievedAt, originalUrl, ...candidate.providerMetadata };
    const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run('video', `${candidate.provider}:${candidate.id}`, candidate.title, JSON.stringify(properties), retrievedAt);
    const media = db.prepare('INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(Number(node.lastInsertRowid), 'video', finalPath, originalUrl, sha256, mimeType, bytes, candidate.license, `${candidate.title} — ${candidate.creator}; ${candidate.publisher}; ${candidate.itemUrl}`, JSON.stringify(properties)); db.exec('COMMIT'); return { duplicate: false, id: Number(media.lastInsertRowid) };
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

async function jsonFetch(fetchImpl: FetchLike, url: URL, hosts: readonly string[], kind: 'search' | 'asset' | 'item', userAgent: string) {
  if (!safeApiUrl(kind === 'asset' ? 'nasa' : kind === 'search' ? (url.hostname === 'commons.wikimedia.org' ? 'wikimedia' : url.pathname === '/film-and-videos/' ? 'loc' : 'nasa') : 'loc', url.toString(), kind)) throw new Error('invalid_api_endpoint');
  const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': userAgent } }); if (!response.ok) throw new Error(`api_http_${response.status}`); if (!responseUrlAllowed(response, hosts, url.toString())) throw new Error('redirect_not_allowed');
  try { return await response.json(); } catch { throw new Error('invalid_api_response'); }
}

export async function syncKeylessVideo(provider: KeylessVideoProvider, options: { query?: string; batchSize?: number; maxBytes?: number; fetchImpl?: FetchLike; userAgent?: string } = {}): Promise<KeylessVideoSyncResult> {
  if (!CONFIG[provider]) throw new Error('키 없는 영상 수집원이 올바르지 않습니다.'); const query = safeQuery(provider, options.query); const batchSize = safeBatchSize(options.batchSize); const maxBytes = safeMaxBytes(options.maxBytes); const runId = startIngestRun(CONFIG[provider].slug, 'sync'); const errors: KeylessVideoSyncResult['errors'] = []; const fetchImpl = options.fetchImpl ?? globalThis.fetch; const userAgent = resolveUserAgent(options.userAgent);
  const endpoint = apiUrl(provider, query, batchSize); let candidates: VideoCandidate[];
  try { const payload = await jsonFetch(fetchImpl, endpoint, CONFIG[provider].apiHosts, 'search', userAgent); candidates = provider === 'wikimedia' ? parseWikimedia(payload, batchSize, maxBytes) : provider === 'nasa' ? parseNasaSearch(payload, batchSize) : parseLocSearch(payload, Math.min(batchSize * 5, 10)); }
  catch (error) { const code = errorCode(error); finishIngestRun(runId, 'failed', 0, 0, `${provider} 영상 검색에 실패했습니다.`, { provider, query, batchSize, maxBytes, failed: 1, errors: [{ code }] }); return { provider, runId, query, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 1, status: 'failed', errors: [{ id: '', code }] }; }
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw'); const runDirectory = path.join(rawRoot, provider, String(runId), 'video'); let downloaded = 0; let deduped = 0;
  for (const originalCandidate of candidates) {
    if (downloaded + deduped >= batchSize) break;
    let candidate = originalCandidate;
    try {
      if (provider === 'nasa') { const assetUrl = new URL(`${CONFIG.nasa.apiOrigin}/asset/${encodeURIComponent(candidate.id)}`); const payload = await jsonFetch(fetchImpl, assetUrl, CONFIG.nasa.apiHosts, 'asset', userAgent); candidate = parseNasaAsset(payload, candidate); }
      else if (provider === 'loc') { const itemUrl = new URL(candidate.itemUrl); itemUrl.searchParams.set('fo', 'json'); itemUrl.searchParams.set('at', 'resources'); const payload = await jsonFetch(fetchImpl, itemUrl, CONFIG.loc.itemHosts, 'item', userAgent); candidate = parseLocItem(payload, candidate, maxBytes); if (candidate.providerMetadata.downloadRestricted === true || candidate.providerMetadata.rightsRestricted === true) { errors.push({ id: candidate.id, code: 'restricted_video_resource' }); continue; } }
      if (!candidate.downloadUrls.length) { errors.push({ id: candidate.id, code: candidate.providerMetadata.knownOversizeVideo === true ? 'oversize' : 'no_allowed_video_resource' }); continue; }
      const before = openArchiveDb(); try { if (existingMedia(before, candidate)) { deduped += 1; continue; } } finally { before.close(); }
      let saved = false; let lastDownloadError: string | null = null;
      for (const downloadUrl of candidate.downloadUrls) {
        let finalPath: string | null = null;
        try {
          if (!safeHttpsUrl(downloadUrl, CONFIG[provider].downloadHosts)) throw new Error('redirect_not_allowed');
          const response = await fetchImpl(downloadUrl, { cache: 'no-store', redirect: 'error', headers: { 'User-Agent': userAgent } }); if (!response.ok) throw new Error(`http_${response.status}`); if (!responseUrlAllowed(response, CONFIG[provider].downloadHosts, downloadUrl)) throw new Error('redirect_not_allowed'); const mimeType = responseMime(response); if (!mimeType) throw new Error('invalid_mime'); const declaredBytes = Number(response.headers.get('content-length')); if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error('oversize'); const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > maxBytes) throw new Error('oversize'); const sha256 = crypto.createHash('sha256').update(body).digest('hex'); finalPath = writeAtomically(runDirectory, `${provider}-${safeFilePart(candidate.id)}${EXTENSIONS[mimeType] ?? '.bin'}`, body); const persisted = persistMedia(candidate, downloadUrl, finalPath, sha256, mimeType, body.byteLength, query, new Date().toISOString()); if (persisted.duplicate) { try { fs.unlinkSync(finalPath); } catch { /* best effort */ } deduped += 1; } else downloaded += 1; saved = true; break;
        } catch (error) { if (finalPath) try { fs.unlinkSync(finalPath); } catch { /* best effort */ } const code = errorCode(error); lastDownloadError = code; if (code === 'oversize' || code === 'invalid_mime') continue; errors.push({ id: candidate.id, code }); break; }
      }
      if (!saved && !errors.some((item) => item.id === candidate.id)) errors.push({ id: candidate.id, code: lastDownloadError ?? 'no_allowed_video_resource' });
    } catch (error) { errors.push({ id: candidate.id, code: errorCode(error) }); }
  }
  const status = errors.length === 0 ? 'success' : downloaded > 0 ? 'partial' : 'failed'; finishIngestRun(runId, status, candidates.length, downloaded, errors.length ? `${errors.length}건의 ${provider} 영상 수집에 실패했습니다.` : null, { provider, query, batchSize, maxBytes, downloaded, deduped, failed: errors.length, errors, semantics: 'discovery_candidate_staged_rights_review_required' }); return { provider, runId, query, rowsSeen: candidates.length, rowsStaged: downloaded, downloaded, deduped, failed: errors.length, status, errors };
}

export const syncWikimediaVideo = (options: Parameters<typeof syncKeylessVideo>[1] = {}) => syncKeylessVideo('wikimedia', options);
export const syncNasaVideo = (options: Parameters<typeof syncKeylessVideo>[1] = {}) => syncKeylessVideo('nasa', options);
export const syncLocVideo = (options: Parameters<typeof syncKeylessVideo>[1] = {}) => syncKeylessVideo('loc', options);
