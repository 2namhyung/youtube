import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

export const DIGITAL_CULTURE_ENDPOINT = 'https://apis.data.go.kr/B553457/share/rest/digitalculture';
const SOURCE_CATALOG_URL = 'https://www.data.go.kr/data/15139738/openapi.do';
const HOST = 'apis.data.go.kr';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BATCH = 100;
const RETRYABLE_CODES = new Set(['05', '22', '23']);
type FetchLike = typeof fetch;
type Item = Record<string, unknown>;

export type DigitalCultureResult = {
  runId: number; pageNo: number; numOfRows: number; rowsSeen: number; rowsStaged: number;
  status: 'success' | 'partial' | 'failed' | 'blocked'; error?: string;
};

function asObject(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' ? value as Record<string, unknown> : null; }
function stringValue(value: unknown, limit = 2000) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, limit) : ''; }
function integer(value: unknown) { const n = typeof value === 'number' ? value : Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
function boundedRows(value: number | undefined) { if (value === undefined) return 10; if (!Number.isSafeInteger(value) || value < 1) throw new Error('디지털문화 API 배치는 1 이상의 정수여야 합니다.'); return Math.min(value, MAX_BATCH); }
function boundedPage(value: number | undefined) { if (value === undefined) return 1; if (!Number.isSafeInteger(value) || value < 1) throw new Error('디지털문화 API 페이지가 올바르지 않습니다.'); return value; }
function apiUrl(pageNo: number, numOfRows: number, key: string) { const url = new URL(DIGITAL_CULTURE_ENDPOINT); url.searchParams.set('pageNo', String(pageNo)); url.searchParams.set('numOfRows', String(numOfRows)); url.searchParams.set('resultType', 'json'); url.searchParams.set('serviceKey', key); return url; }
function safeApiUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === HOST && url.pathname === '/B553457/share/rest/digitalculture' ? url : null; } catch { return null; } }
function responseMime(response: Response) { return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''; }
function isHtml(bytes: Uint8Array) { const sample = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase(); return sample.startsWith('<!doctype') || sample.startsWith('<html'); }
function errorCode(error: unknown) { const message = error instanceof Error ? error.message : ''; return /^(api_http_\d+|service_error_[\w-]+|service_timeout|rate_limited|invalid_json|invalid_mime|oversize|redirect_not_allowed|download_failed)$/.test(message) ? message : 'download_failed'; }

function envelope(payload: unknown) {
  const root = asObject(payload); const service = asObject(root?.OpenAPI_ServiceResponse); const serviceHeader = asObject(service?.cmmMsgHeader);
  if (serviceHeader) { const reason = stringValue(serviceHeader.returnReasonCode || serviceHeader.returnCode || serviceHeader.returnAuthMsg, 120) || 'unknown'; throw new Error(`service_error_${reason}`); }
  const response = asObject(root?.response); const source = response ?? root; const header = asObject(source?.header); const body = asObject(source?.body);
  if (!source || !header || !body) throw new Error('invalid_json');
  const resultCode = stringValue(header.resultCode || header.resultcode || header.result_code);
  if (resultCode && resultCode !== '00' && resultCode !== '0') throw new Error(`service_error_${resultCode}`);
  const items = asObject(body.items); const raw = items?.item; const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(asObject).filter((item): item is Item => Boolean(item));
}
function field(item: Item, names: readonly string[], limit = 2000) { for (const name of names) { const value = stringValue(item[name], limit); if (value) return value; } return ''; }
function categories(item: Item) { return ['dataTypeRootCtgryNm', 'dataTypeCtgryNm', 'clrcsLclsfNm', 'clrcsMclsfNm', 'clrcsSclsfNm', 'lclsfNm', 'mclsfNm', 'sclsfNm'].map((key) => field(item, [key], 200)).filter(Boolean); }
function normalizeItem(item: Item, retrievedAt: string) {
  const id = field(item, ['clrcsId', 'clrcsID', 'id'], 200); const name = field(item, ['clrcsNm', 'clrcsName', 'name'], 1000); if (!id || !name) return null;
  return { id, name, properties: { clrcsExplnCn: field(item, ['clrcsExplnCn', 'clrcsExpln', 'description'], 4000), thumbFileUrl: field(item, ['thumbFileUrl', 'thumbUrl'], 2000), instNm: field(item, ['instNm', 'institutionName'], 500), cpyrTypeNm: field(item, ['cpyrTypeNm', 'copyrightTypeName'], 500), categories: categories(item), dwnldCnt: integer(item.dwnldCnt ?? item.downloadCount), lastMdfcnDt: field(item, ['lastMdfcnDt', 'lastModifiedDate'], 100), retrievedAt, sourceCatalogUrl: SOURCE_CATALOG_URL, semantics: 'discovery_candidate_staged_rights_review_required' } };
}

async function readJson(response: Response) {
  const declared = Number(response.headers.get('content-length')); if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('oversize');
  const body = new Uint8Array(await response.arrayBuffer()); if (body.byteLength > MAX_BYTES) throw new Error('oversize'); if (isHtml(body)) throw new Error('invalid_mime');
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new Error('invalid_json'); }
}
async function request(fetchImpl: FetchLike, pageNo: number, numOfRows: number, key: string) {
  const url = apiUrl(pageNo, numOfRows, key); if (!safeApiUrl(url.toString())) throw new Error('download_failed');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': '23jung-digital-culture/1.0 (local development)' } });
    if ((response.status === 429 || response.status === 503) && attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 250)); continue; }
    if (!response.ok) throw new Error(response.status === 429 ? 'rate_limited' : response.status === 503 ? 'service_timeout' : `api_http_${response.status}`);
    if (response.url && response.url !== url.toString() && !safeApiUrl(response.url)) throw new Error('redirect_not_allowed');
    const mime = responseMime(response); if (!['application/json', 'text/json', 'application/vnd.api+json'].includes(mime)) throw new Error('invalid_mime');
    try { return envelope(await readJson(response)); } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (attempt === 0 && message.startsWith('service_error_') && RETRYABLE_CODES.has(message.slice('service_error_'.length))) { await new Promise((resolve) => setTimeout(resolve, 250)); continue; }
      throw error;
    }
  }
  throw new Error('service_timeout');
}
function upsert(item: ReturnType<typeof normalizeItem>) {
  if (!item) return false; const db = openArchiveDb(); try { db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES ('cultural_resource',?,?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label,properties_json=excluded.properties_json,as_of=excluded.as_of,updated_at=CURRENT_TIMESTAMP`).run(`digital-culture:${item.id}`, item.name, JSON.stringify(item.properties), item.properties.retrievedAt); return true; } finally { db.close(); }
}

export async function syncDigitalCulture(options: { pageNo?: number; numOfRows?: number; fetchImpl?: FetchLike } = {}): Promise<DigitalCultureResult> {
  const pageNo = boundedPage(options.pageNo); const numOfRows = boundedRows(options.numOfRows); const runId = startIngestRun('digital-culture-api', 'sync'); const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!key) { const error = 'DATA_GO_KR_SERVICE_KEY 환경변수가 없어 디지털문화 API 호출을 시작하지 않았습니다.'; finishIngestRun(runId, 'blocked', 0, 0, error, { provider: 'digital-culture-api', pageNo, numOfRows, semantics: 'discovery_candidate_staged_rights_review_required' }); return { runId, pageNo, numOfRows, rowsSeen: 0, rowsStaged: 0, status: 'blocked', error }; }
  try { const items = await request(options.fetchImpl ?? globalThis.fetch, pageNo, numOfRows, key); let rowsStaged = 0; const retrievedAt = new Date().toISOString(); for (const item of items) if (upsert(normalizeItem(item, retrievedAt))) rowsStaged += 1; finishIngestRun(runId, 'success', items.length, rowsStaged, null, { provider: 'digital-culture-api', pageNo, numOfRows, semantics: 'discovery_candidate_staged_rights_review_required' }); return { runId, pageNo, numOfRows, rowsSeen: items.length, rowsStaged, status: 'success' }; }
  catch (error) { const code = errorCode(error); finishIngestRun(runId, 'failed', 0, 0, `디지털문화 API 수집 실패: ${code}`, { provider: 'digital-culture-api', pageNo, numOfRows, semantics: 'discovery_candidate_staged_rights_review_required', errorCode: code }); return { runId, pageNo, numOfRows, rowsSeen: 0, rowsStaged: 0, status: 'failed', error: code }; }
}
