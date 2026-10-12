import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

const DATA_GO_ORIGIN = 'https://www.data.go.kr';
const KOGL_ORIGIN = 'https://www.kogl.or.kr';
const DATASET = {
  publicDataPk: '15133902',
  publicDataDetailPk: 'uddi:3d1025f1-11e0-4061-8bd8-ca3fd95da874',
  fileDetailSn: '1',
  url: '/tcs/dss/selectFileDataDownload.do',
  datasetPage: 'https://www.data.go.kr/data/15133902/fileData.do',
};
const CATALOG_MAX_BYTES = 90 * 1024 * 1024;
const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 3;
const LICENSE = 'KOGL 유형 미확인 — 공개 전 상세 페이지 확인 필요';
const USER_AGENT = process.env.MEDIA_USER_AGENT_CONTACT
  ? `23jung-kogl-collector/1.0 (${process.env.MEDIA_USER_AGENT_CONTACT})`
  : '23jung-kogl-collector/1.0 (local development)';

type FetchLike = typeof fetch;
type MediaType = 'photo' | 'video';
type Row = Record<string, string>;
type Candidate = { id: string; url: string; itemUrl: string; title: string; originalFileName: string; extension: string; mediaType: MediaType; declaredBytes: number | null };

export type KoglMediaSyncResult = {
  provider: 'kogl'; runId: number; rowsSeen: number; rowsStaged: number; downloaded: number; deduped: number; failed: number;
  status: 'success' | 'partial' | 'failed'; errors: { id: string; code: string }[];
};

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' ? value as Record<string, unknown> : null; }
function text(value: unknown) { return typeof value === 'string' ? value.trim().slice(0, 2000) : ''; }
function safeBatch(value: number | undefined) { if (value === undefined) return DEFAULT_BATCH_SIZE; if (!Number.isSafeInteger(value) || value < 1) throw new Error('KOGL 배치는 1 이상의 정수여야 합니다.'); return Math.min(value, MAX_BATCH_SIZE); }
function safePage(value: number | undefined) { if (value === undefined) return 1; if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error('KOGL 페이지는 1–10000 사이의 정수여야 합니다.'); return value; }
function safeBytes(value: number | undefined) { if (value === undefined) return MEDIA_MAX_BYTES; if (!Number.isSafeInteger(value) || value < 1) throw new Error('KOGL 미디어 최대 크기가 올바르지 않습니다.'); return Math.min(value, MEDIA_MAX_BYTES); }
function safeQuery(value: string | undefined) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : ''; }
function normalizedSearchText(value: string) { return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim(); }
function safeHttpsUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value.trim()); if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) return null; return url.toString(); } catch { return null; }
}
function safeApiUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== DATA_GO_ORIGIN || !['/tcs/dss/selectFileDataDownload.do', '/cmm/cmm/fileDownload.do'].includes(url.pathname) || url.username || url.password) return null;
    if (url.pathname === '/cmm/cmm/fileDownload.do') {
      const allowed = new Set(['atchFileId', 'fileDetailSn', 'insertDataPrcus']);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)) || !/^[A-Za-z0-9_-]{1,160}$/.test(url.searchParams.get('atchFileId') ?? '') || !/^\d{1,12}$/.test(url.searchParams.get('fileDetailSn') ?? '') || (url.searchParams.has('insertDataPrcus') && url.searchParams.get('insertDataPrcus') !== 'N')) return null;
    }
    return url;
  } catch { return null; }
}
function headerKey(value: string) { return value.replace(/^\uFEFF/, '').replace(/[\s_\-]/g, '').toLowerCase(); }
function cell(row: Row, aliases: readonly string[]) { for (const alias of aliases) { const key = Object.keys(row).find((item) => headerKey(item) === headerKey(alias)); if (key) return text(row[key]); } return ''; }

/** Small RFC 4180-compatible parser; quoted commas, quotes and newlines are retained. */
export function parseKoglCsv(input: string): Row[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char === '\r' && input[i + 1] === '\n') { /* CRLF: let the following LF terminate the row. */ }
    else field += char;
  }
  if (quoted) throw new Error('invalid_csv');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift()!.map((value) => value.trim());
  return rows.filter((values) => values.some((value) => value !== '')).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

/** Parse a large KOGL catalog while retaining only named columns. This avoids
 * holding every wide CSV cell twice when discovery needs only media metadata. */
export function parseKoglCsvSelected(input: string, wantedHeaders: readonly string[], keepRow: (row: Row) => boolean = () => true): Row[] {
  const rows: Row[] = []; let values: string[] = []; let field = ''; let quoted = false;
  let headers: string[] | null = null; let selected: {index: number; header: string}[] = [];
  const finishRow = () => {
    values.push(field); field = '';
    if (!headers) {
      headers = values.map((value) => value.trim());
      const wanted = new Set(wantedHeaders.map(headerKey));
      selected = headers.map((header, index) => ({index, header})).filter(({header}) => wanted.has(headerKey(header)));
    } else if (values.some((value) => value !== '')) {
      const projected = Object.fromEntries(selected.map(({index, header}) => [header, values[index] ?? '']));
      if (keepRow(projected)) rows.push(projected);
    }
    values = [];
  };
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { values.push(field); field = ''; }
    else if (char === '\n') finishRow();
    else if (char === '\r' && input[i + 1] === '\n') { /* handled by LF */ }
    else field += char;
  }
  if (quoted) throw new Error('invalid_csv');
  if (field.length || values.length) finishRow();
  return rows;
}

function safeKoglPath(value: string) {
  if (!value || !value.startsWith('/upload_recommend/') || value.includes('%') || value.includes('\\') || value.includes('?') || value.includes('#') || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith('//') || value.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  const url = safeHttpsUrl(`${KOGL_ORIGIN}${value}`, ['www.kogl.or.kr']);
  try { return url && decodeURIComponent(new URL(url).pathname) === value ? url : null; } catch { return null; }
}
function extension(value: string) { const match = value.toLowerCase().match(/\.?([a-z0-9]{2,5})$/); return match?.[1] ?? ''; }
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
export function candidateFromRow(row: Row, itemUrl = DATASET.datasetPage): Candidate | null {
  const relative = cell(row, ['웹파일경로', 'webfilepath', '파일경로', 'filepath']);
  const url = safeKoglPath(relative); if (!url) return null;
  const fileName = cell(row, ['파일명', 'filename']) || relative.split('/').pop() || 'kogl-media';
  const originalFileName = cell(row, ['원본파일명', 'originalfilename']) || fileName;
  const ext = extension(cell(row, ['파일확장자', '확장자', 'extension']) || fileName);
  const mediaType: MediaType | null = IMAGE_EXT.has(ext) ? 'photo' : VIDEO_EXT.has(ext) ? 'video' : null;
  if (!mediaType) return null;
  const declared = Number(cell(row, ['파일크기', 'filesize', '파일용량']).replace(/[^0-9]/g, ''));
  return { id: crypto.createHash('sha256').update(url).digest('hex').slice(0, 32), url, itemUrl, title: fileName, originalFileName, extension: ext, mediaType, declaredBytes: Number.isSafeInteger(declared) && declared > 0 ? declared : null };
}

/** Match against the dataset title/original filename only. This keeps a Korean editorial
 * query from silently falling back to the first unrelated item in the full KOGL CSV. */
export function matchesKoglQuery(candidate: Candidate, query: string) {
  const terms = normalizedSearchText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizedSearchText(`${candidate.title} ${candidate.originalFileName}`);
  return terms.every((term) => haystack.includes(term));
}

function responseUrlAllowed(response: Response, requested: string, hosts: readonly string[]) { if (!response.url || response.url === requested) return true; return Boolean(safeHttpsUrl(response.url, hosts)); }
function contentType(response: Response) { return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''; }
function isHtml(bytes: Uint8Array) { const sample = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase(); return sample.startsWith('<!doctype') || sample.startsWith('<html') || sample.startsWith('<head') || sample.startsWith('<body'); }
function writeAtomically(directory: string, filename: string, bytes: Uint8Array) { fs.mkdirSync(directory, { recursive: true }); const target = path.join(directory, filename); const temp = `${target}.tmp-${crypto.randomUUID()}`; try { fs.writeFileSync(temp, bytes, { flag: 'wx' }); fs.renameSync(temp, target); return target; } catch (error) { try { fs.unlinkSync(temp); } catch { /* noop */ } throw error; } }
function safePart(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'media'; }
function errorCode(error: unknown) { const value = error instanceof Error ? error.message : ''; return /^(api_http_\d+|http_\d+|invalid_[a-z_]+|html_rejected|oversize|redirect_not_allowed|download_failed)$/.test(value) ? value : 'download_failed'; }
function existing(db: ReturnType<typeof openArchiveDb>, candidate: Candidate, sha?: string) { const rows = db.prepare('SELECT id,original_url,sha256,properties_json FROM media_assets').all() as { id: number; original_url: string; sha256: string | null; properties_json: string }[]; return rows.find((row) => row.original_url === candidate.url || (sha && row.sha256 === sha) || (() => { try { const p = JSON.parse(row.properties_json) as { providerId?: string }; return p.providerId === candidate.id; } catch { return false; } })()); }
function persist(candidate: Candidate, finalPath: string, sha: string, mime: string, bytes: number, query: string, retrievedAt: string, catalogPath: string) {
  const db = openArchiveDb(); try { db.exec('BEGIN IMMEDIATE'); const duplicate = existing(db, candidate, sha); if (duplicate) { db.exec('ROLLBACK'); return true; }
    const properties = { provider: 'kogl', providerId: candidate.id, mediaType: candidate.mediaType, sourceUrl: candidate.url, itemUrl: candidate.itemUrl, title: candidate.title, originalFileName: candidate.originalFileName, extension: candidate.extension, declaredBytes: candidate.declaredBytes, creator: '한국문화정보원·KOGL 파일별 확인 필요', publisher: '한국문화정보원 / 공공누리(KOGL)', license: LICENSE, rightsStatus: '파일별 공공누리 유형·제3자 권리 검토 필요', query, retrievedAt, catalogPath, sourceCatalogUrl: candidate.itemUrl, semantics: 'discovery_candidate_staged_rights_review_required' };
    const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run(candidate.mediaType, `kogl:${candidate.id}`, candidate.title, JSON.stringify(properties), retrievedAt);
    db.prepare('INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(Number(node.lastInsertRowid), candidate.mediaType, finalPath, candidate.url, sha, mime, bytes, LICENSE, `${candidate.title} — 한국문화정보원 / KOGL; ${candidate.itemUrl}`, JSON.stringify(properties)); db.exec('COMMIT'); return false;
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

async function resolveCatalog(fetchImpl: FetchLike, config: typeof DATASET) {
  const endpoint = `${DATA_GO_ORIGIN}${config.url}`; if (!safeApiUrl(endpoint)) throw new Error('invalid_api_endpoint');
  const form = new URLSearchParams({ publicDataDetailPk: config.publicDataDetailPk, publicDataPk: config.publicDataPk, atchFileId: '', fileDetailSn: config.fileDetailSn, url: config.url });
  const response = await fetchImpl(endpoint, { method: 'POST', body: form.toString(), cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`api_http_${response.status}`); if (!responseUrlAllowed(response, endpoint, ['www.data.go.kr'])) throw new Error('redirect_not_allowed');
  let payload: Record<string, unknown>; try { payload = object(await response.json()) ?? {}; } catch { throw new Error('invalid_resolution'); }
  const nested = object(payload.fileDataRegistVO) ?? object(payload.dataSetFileDetailInfo) ?? {};
  const atchFileId = text(payload.atchFileId) || text(nested.atchFileId); const fileDetailSn = text(payload.fileDetailSn) || text(nested.fileDetailSn) || config.fileDetailSn;
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(atchFileId) || !/^\d{1,12}$/.test(fileDetailSn)) throw new Error('invalid_resolution');
  return { atchFileId, fileDetailSn };
}
async function downloadCatalog(fetchImpl: FetchLike, resolved: { atchFileId: string; fileDetailSn: string }) {
  const url = new URL(`${DATA_GO_ORIGIN}/cmm/cmm/fileDownload.do`); url.searchParams.set('atchFileId', resolved.atchFileId); url.searchParams.set('fileDetailSn', resolved.fileDetailSn); url.searchParams.set('insertDataPrcus', 'N');
  if (!safeApiUrl(url.toString())) throw new Error('invalid_api_endpoint');
  const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', headers: { Accept: 'text/csv,application/octet-stream;q=0.9,*/*;q=0.1', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`http_${response.status}`); if (!responseUrlAllowed(response, url.toString(), ['www.data.go.kr'])) throw new Error('redirect_not_allowed');
  const mime = contentType(response); if (mime === 'text/html' || mime === 'application/xhtml+xml') throw new Error('html_rejected');
  if (mime && !['text/csv', 'text/plain', 'application/csv', 'application/octet-stream', 'application/vnd.ms-excel'].includes(mime)) throw new Error('invalid_mime');
  const declared = Number(response.headers.get('content-length')); if (Number.isFinite(declared) && declared > CATALOG_MAX_BYTES) throw new Error('oversize'); const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > CATALOG_MAX_BYTES) throw new Error('oversize'); if (isHtml(body)) throw new Error('html_rejected');
  return body;
}

export async function syncKoglMedia(options: { batchSize?: number; maxBytes?: number; mediaType?: MediaType; query?: string; page?: number; fetchImpl?: FetchLike; dataset?: Partial<typeof DATASET> } = {}): Promise<KoglMediaSyncResult> {
  const batchSize = safeBatch(options.batchSize); const page = safePage(options.page); const maxBytes = safeBytes(options.maxBytes); const mediaType = options.mediaType ?? 'photo'; const query = safeQuery(options.query); const config = { ...DATASET, ...options.dataset }; const runId = startIngestRun('kogl-media', 'sync'); const errors: { id: string; code: string }[] = []; const fetchImpl = options.fetchImpl ?? globalThis.fetch; let catalog: Uint8Array;
  try { const resolved = await resolveCatalog(fetchImpl, config); catalog = await downloadCatalog(fetchImpl, resolved); } catch (error) { const code = errorCode(error); finishIngestRun(runId, 'failed', 0, 0, `KOGL 카탈로그 수집 실패: ${code}`, { provider: 'kogl', batchSize, maxBytes, errors: [{ code }], semantics: 'discovery_candidate_staged_rights_review_required' }); return { provider: 'kogl', runId, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 1, status: 'failed', errors: [{ id: '', code }] }; }
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw'); const runDirectory = path.join(rawRoot, 'kogl-media', String(runId)); const catalogPath = writeAtomically(runDirectory, 'catalog.csv', catalog); const catalogSha256 = crypto.createHash('sha256').update(catalog).digest('hex');
  let rows: Row[]; try { rows = parseKoglCsv(new TextDecoder('euc-kr').decode(catalog)); } catch { finishIngestRun(runId, 'failed', 0, 0, 'KOGL CSV 해석 실패: invalid_csv', { provider: 'kogl', catalogPath, catalogSha256 }); return { provider: 'kogl', runId, rowsSeen: 0, rowsStaged: 0, downloaded: 0, deduped: 0, failed: 1, status: 'failed', errors: [{ id: '', code: 'invalid_csv' }] }; }
  const maxAttempts = Math.min(Math.max(batchSize * 20, 20), 60);
  const parsedCandidates = rows.map((row) => candidateFromRow(row, config.datasetPage)).filter((candidate): candidate is Candidate => candidate !== null && candidate.mediaType === mediaType && matchesKoglQuery(candidate, query));
  const oversized = parsedCandidates.filter((candidate) => candidate.declaredBytes !== null && candidate.declaredBytes > maxBytes);
  const candidates = parsedCandidates.filter((candidate) => candidate.declaredBytes === null || candidate.declaredBytes <= maxBytes).sort((a, b) => {
    const videoOrder = Number(b.mediaType === 'video') - Number(a.mediaType === 'video'); if (videoOrder) return videoOrder;
    if (a.mediaType === 'video' && b.mediaType === 'video') return (a.declaredBytes ?? Number.MAX_SAFE_INTEGER) - (b.declaredBytes ?? Number.MAX_SAFE_INTEGER);
    return 0;
  }).slice((page - 1) * batchSize, page * batchSize);
  errors.push(...oversized.slice(0, maxAttempts).map((candidate) => ({ id: candidate.id, code: 'oversize' })));
  let downloaded = 0; let deduped = 0; let attempts = 0;
  for (const candidate of candidates) {
    if (downloaded + deduped >= batchSize || attempts >= maxAttempts) break;
    attempts += 1;
    const db = openArchiveDb(); try { if (existing(db, candidate)) { deduped += 1; continue; } } finally { db.close(); } let finalPath = '';
    try { if (candidate.declaredBytes && candidate.declaredBytes > maxBytes) throw new Error('oversize'); const response = await fetchImpl(candidate.url, { cache: 'no-store', redirect: 'error', headers: { Accept: `${candidate.mediaType}/*`, 'User-Agent': USER_AGENT } }); if (!response.ok) throw new Error(`http_${response.status}`); if (!responseUrlAllowed(response, candidate.url, ['www.kogl.or.kr']) || !safeHttpsUrl(response.url || candidate.url, ['www.kogl.or.kr'])) throw new Error('redirect_not_allowed'); const mime = contentType(response); if (candidate.mediaType === 'photo' ? !mime.startsWith('image/') : !mime.startsWith('video/')) throw new Error('invalid_mime'); const declared = Number(response.headers.get('content-length')); if (Number.isFinite(declared) && declared > maxBytes) throw new Error('oversize'); const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > maxBytes) throw new Error('oversize'); if (isHtml(body)) throw new Error('html_rejected'); const sha = crypto.createHash('sha256').update(body).digest('hex'); finalPath = writeAtomically(path.join(runDirectory, candidate.mediaType), `kogl-${safePart(candidate.id)}.${candidate.extension}`, body); if (persist(candidate, finalPath, sha, mime, body.byteLength, query || '제목·기관 미지정', new Date().toISOString(), catalogPath)) { fs.unlinkSync(finalPath); deduped += 1; } else downloaded += 1; } catch (error) { if (finalPath) try { fs.unlinkSync(finalPath); } catch { /* noop */ } errors.push({ id: candidate.id, code: errorCode(error) }); }
  }
  const status = errors.length ? downloaded > 0 || deduped > 0 ? 'partial' : 'failed' : 'success'; finishIngestRun(runId, status, rows.length, downloaded, errors.length ? `${errors.length}건의 KOGL 미디어 수집 실패` : null, { provider: 'kogl', batchSize, page, maxBytes, query, catalogPath, catalogSha256, downloaded, deduped, failed: errors.length, errors, semantics: 'discovery_candidate_staged_rights_review_required', license: LICENSE });
  return { provider: 'kogl', runId, rowsSeen: rows.length, rowsStaged: downloaded, downloaded, deduped, failed: errors.length, status, errors };
}
