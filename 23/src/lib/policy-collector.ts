import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';
import { matchPolicyToComplaint, type PolicyComplaintMatch } from './policy-matcher.ts';

export const LAWMAKING_SOURCE_SLUG = 'lawmaking';
export const COMPLAINT_SOURCE_SLUG = 'epeople-complaints';
export const LAWMAKING_ENDPOINT = 'https://www.lawmaking.go.kr/rest/ogLmPpMod.xml';
export const COMPLAINT_ENDPOINT = 'https://apis.data.go.kr/1140100/minAnalsInfoView5/minRisingKeyword5';
export const ASSEMBLY_BILLS_ENDPOINT = 'https://open.assembly.go.kr/portal/openapi/TVBPMBILL11';
const LAWMAKING_HOSTS = new Set(['www.lawmaking.go.kr', 'lawmaking.go.kr', 'opinion.lawmaking.go.kr']);
const COMPLAINT_HOSTS = new Set(['apis.data.go.kr', 'data.go.kr', 'bigdata.epeople.go.kr']);
const ASSEMBLY_HOSTS = new Set(['open.assembly.go.kr']);
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type PolicyStage = 'proposed' | 'committee' | 'plenary' | 'promulgated' | 'effective' | 'amended' | 'deferred' | 'repealed';
export type PolicyRow = { externalKey: string; title: string; summary: string; status: string; stage: PolicyStage; date: string; sourceUrl: string; sourceLabel: string };
export type ComplaintRow = { externalKey: string; keyword: string; observedAt: string; countOrNote: string; sourceType: 'complaint'; sourceUrl: string; policyExternalKey?: string };
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type FetchOptions = { fetchImpl?: FetchImpl; timeoutMs?: number; maxBytes?: number };
type CollectorOptions = FetchOptions & { rawRoot?: string; now?: Date; year?: number; fixtureBody?: string };
export type AssemblyBillRow = { billId: string; billNo: string; title: string; proposer: string; proposerKind: string; proposeDate: string; currentCommittee: string; committeeDate: string; processDate: string; processResult: string; representativeProposer: string; linkUrl: string; stage: PolicyStage; raw: Record<string, unknown> };
export type AssemblyBillPage = { rows: AssemblyBillRow[]; totalCount: number | null; isShortPage: boolean; rejected: number };

function xmlUnescape(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function tagPattern(tag: string) { return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function tagValue(fragment: string, tags: string[]) {
  for (const tag of tags) {
    const match = fragment.match(new RegExp(`<${tagPattern(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagPattern(tag)}>`, 'i'));
    if (match?.[1]) return xmlUnescape(match[1]);
  }
  return '';
}

type XmlElement = { name: string; start: number; content: string; parentName?: string };

/**
 * 국민참여입법센터 XML은 일반적인 item/row뿐 아니라 ApiList13Vo를
 * 반복 행 이름으로 사용한다. 정규식만으로 같은 이름의 wrapper와 행을
 * 구분하기 어렵기 때문에, 작은 stack parser로 닫힌 요소의 내용을
 * 수집한다. XML은 이미 응답 크기 제한을 통과한 원문이며, 여기서는
 * 외부 엔티티를 해석하지 않는다.
 */
function xmlElements(xml: string, names: string[]): XmlElement[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const stack: Array<{ name: string; start: number; parentName?: string }> = [];
  const elements: XmlElement[] = [];
  const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([A-Za-z_:][\w:.-]*)(?:\s[^<>]*?)?\/?\s*>/g;
  for (const match of xml.matchAll(tokenPattern)) {
    const token = match[0]; const name = match[1];
    if (!name || token.startsWith('<!--') || token.startsWith('<![CDATA[') || /^<\?/.test(token) || /^<!DOCTYPE/i.test(token)) continue;
    const normalized = name.toLowerCase().split(':').at(-1) ?? name.toLowerCase();
    if (/^<\//.test(token)) {
      const index = [...stack].reverse().findIndex((entry) => (entry.name.toLowerCase().split(':').at(-1) ?? entry.name.toLowerCase()) === normalized);
      if (index < 0) continue;
      const stackIndex = stack.length - 1 - index;
      const entry = stack[stackIndex];
      if (wanted.has(normalized)) {
        elements.push({ name: entry.name, start: entry.start, content: xml.slice(entry.start, match.index), parentName: entry.parentName });
      }
      stack.splice(stackIndex, 1);
    } else if (!/\/\s*>$/.test(token)) {
      stack.push({ name, start: match.index + token.length, parentName: stack.at(-1)?.name });
    }
  }
  return elements;
}

function xmlItems(xml: string) {
  const candidates = xmlElements(xml, ['item', 'row', 'ApiList13Vo']);
  const rows = candidates.filter((element) => !/<(?:item|row|ApiList13Vo)(?:\s[^>]*)?>/i.test(element.content));
  return rows.length ? rows.map((element) => element.content) : candidates.map((element) => element.content);
}
function validXmlMarker(body: string) {
  if (!body.trim() || /<!doctype\s+html|<html(?:\s|>)/i.test(body)) throw new Error('공식 XML 대신 HTML 오류 페이지가 반환되었습니다.');
  if (!/<(?:\?xml|[a-zA-Z_:][\w:.-]*)(?:\s[^>]*)?>/i.test(body)) throw new Error('XML 응답 표식이 없습니다.');
}

function apiSuccessCode(value: string) {
  return !value || /^(?:0{1,4}|00|200|ok|success|normal(?:_code)?|info-000)$/i.test(value.trim());
}

function assertLawmakingApiSuccess(xml: string) {
  const code = tagValue(xml, ['retCode', 'resultCode', 'returnCode', 'errorCode']);
  const message = tagValue(xml, ['retMsg', 'resultMsg', 'returnMsg', 'errorMessage', 'message']);
  if (code && !apiSuccessCode(code)) throw new Error(`국민참여입법센터 API 오류 코드: ${code}`);
  if (message && /(?:^|\b)(?:400|401|403|404|500|502|503)(?:\b|$)|오류|에러|error|fail(?:ed|ure)?|unauthori[sz]ed|forbidden|invalid|권한|인증/i.test(message)) {
    throw new Error(`국민참여입법센터 API 오류: ${redactSensitiveUrl(message).slice(0, 200)}`);
  }
}

function isAssemblyJsonEnvelope(body: string) {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(payload?.TVBPMBILL11);
  } catch {
    return false;
  }
}

export function redactSensitiveUrl(input: string) {
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:serviceKey|apiKey|apikey|key|oc)$/i.test(key)) url.searchParams.set(key, 'REDACTED');
    }
    return url.toString();
  } catch { return input.replace(/((?:serviceKey|apiKey|apikey|key|oc)=)[^&\s]+/gi, '$1REDACTED'); }
}

function assertHost(input: string, hosts: Set<string>) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname.toLowerCase())) throw new Error(`허용되지 않은 공식 수집원 호스트입니다: ${url.hostname}`);
  return url;
}

async function readBody(response: Response, maxBytes: number) {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`응답 크기가 제한(${maxBytes} bytes)을 초과했습니다.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error(`응답 크기가 제한(${maxBytes} bytes)을 초과했습니다.`); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function fetchOfficial(initialUrl: string, hosts: Set<string>, options: FetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  let current = assertHost(initialUrl, hosts);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`공식 수집원 응답 시간 초과(${timeoutMs}ms)`);
      throw new Error(`공식 수집원 요청 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('공식 수집원의 redirect 위치가 없습니다.');
      if (redirect === MAX_REDIRECTS) throw new Error('redirect 횟수 제한을 초과했습니다.');
      current = assertHost(new URL(location, current).toString(), hosts);
      continue;
    }
    const finalUrl = response.url || current.toString();
    assertHost(finalUrl, hosts);
    if (!response.ok) throw new Error(`공식 수집원 HTTP 오류(${response.status})`);
    const body = await readBody(response, maxBytes);
    const contentType = response.headers.get('content-type') ?? '';
    const supportedType = !contentType || /(?:xml|json|text\/plain)/i.test(contentType);
    const assemblyJsonWithWrongHeader = current.hostname === 'open.assembly.go.kr'
      && /^text\/html\b/i.test(contentType)
      && isAssemblyJsonEnvelope(body);
    if (!supportedType && !assemblyJsonWithWrongHeader) throw new Error(`허용되지 않은 응답 형식입니다: ${contentType}`);
    return { body, finalUrl, contentType };
  }
  throw new Error('공식 수집원 redirect를 확인하지 못했습니다.');
}

export function mapPolicyStage(status: string): PolicyStage {
  const value = status.trim().toLowerCase();
  if (/폐지|철회|종료/.test(value)) return 'repealed';
  if (/유예|연기|보류/.test(value)) return 'deferred';
  if (/시행|시행중|시행 중/.test(value)) return 'effective';
  if (/공포/.test(value)) return 'promulgated';
  if (/본회의|의결/.test(value)) return 'plenary';
  if (/상임위|위원회|법안심사/.test(value)) return 'committee';
  if (/개정|수정/.test(value)) return 'amended';
  return 'proposed';
}

export function parseLawmakingXml(xml: string, sourceUrl = LAWMAKING_ENDPOINT): PolicyRow[] {
  return parseLawmakingXmlDetailed(xml, sourceUrl).rows;
}
function parseLawmakingXmlDetailed(xml: string, sourceUrl = LAWMAKING_ENDPOINT) {
  validXmlMarker(xml);
  assertLawmakingApiSuccess(xml);
  const fragments = xmlItems(xml);
  const rows: PolicyRow[] = []; let rejected = 0;
  fragments.forEach((fragment, index) => {
    const externalKey = tagValue(fragment, ['ogLmPpSeq', 'ogLmPpModSeq', 'billId', 'id', 'pntcNo', 'mappingLbicId']) || `row-${index + 1}`;
    const title = tagValue(fragment, ['lsNm', '법령안명', 'billName', 'billNm', 'name', 'title']);
    const status = tagValue(fragment, ['status', '추진단계', 'progress', 'stage', 'pntcStatus', 'procStatus', 'diff']);
    const date = tagValue(fragment, ['modDt', '발의일', 'proposeDate', 'date', 'pntcDt', 'stYd', 'edYd']);
    if (!title) { rejected += 1; return; }
    const summary = [tagValue(fragment, ['lsClsNm']), tagValue(fragment, ['asndOfiNm']), tagValue(fragment, ['announceType']), status].filter(Boolean).join(' · ');
    rows.push({ externalKey, title, summary, status, stage: mapPolicyStage(status), date, sourceUrl, sourceLabel: '국민참여입법센터 공식 XML' });
  });
  return { rows, rejected, seen: fragments.length };
}

function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.part-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}
function sha256(content: string) { return crypto.createHash('sha256').update(content).digest('hex'); }

function persistEvidence(db: ReturnType<typeof openArchiveDb>, sourceId: number, externalKey: string, title: string, url: string, body: string, rawPath: string, retrievedAt: string) {
  const hash = sha256(body);
  db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES ('document',?,?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label,properties_json=excluded.properties_json,as_of=excluded.as_of`).run(`raw:${externalKey}:${hash}`, title, JSON.stringify({ source: externalKey, sha256: hash }), retrievedAt);
  const nodeId = Number((db.prepare("SELECT id FROM graph_nodes WHERE kind='document' AND external_key=?").get(`raw:${externalKey}:${hash}`) as { id: number }).id);
  db.prepare(`INSERT INTO evidence_sources (node_id,external_key,canonical_url,title,publisher,source_type,retrieved_at,content_hash,license,trust_tier,source_id,raw_path,properties_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET retrieved_at=excluded.retrieved_at,content_hash=excluded.content_hash,raw_path=excluded.raw_path,canonical_url=excluded.canonical_url`).run(nodeId, `raw:${externalKey}:${hash}`, url, title, externalKey, 'api', retrievedAt, hash, '공식 원문 이용조건 확인', 1, sourceId, rawPath, JSON.stringify({ fetched_at: retrievedAt, sha256: hash }));
  return Number((db.prepare('SELECT id FROM evidence_sources WHERE external_key=?').get(`raw:${externalKey}:${hash}`) as { id: number }).id);
}

function persistPolicyRows(rows: PolicyRow[], sourceId: number, rawPath: string, body: string, finalUrl: string, retrievedAt: string) {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE'); let staged = 0;
  try {
    const evidenceId = persistEvidence(db, sourceId, `lawmaking:${retrievedAt.slice(0, 10)}`, '국민참여입법센터 정부입법현황 원문', finalUrl, body, rawPath, retrievedAt);
    for (const row of rows) {
      const externalKey = `lawmaking:${row.externalKey}`;
      db.prepare(`INSERT INTO policies (external_key,external_source_key,title,summary,current_stage,impact_groups,verification_state,is_demo,source_evidence_id)
        VALUES (?,?,?,?,?,'미분류','staged',0,?) ON CONFLICT(external_key) DO UPDATE SET external_source_key=excluded.external_source_key,title=excluded.title,summary=excluded.summary,current_stage=excluded.current_stage,verification_state='staged',is_demo=0,source_evidence_id=excluded.source_evidence_id,updated_at=CURRENT_TIMESTAMP`).run(externalKey, row.externalKey, row.title, row.summary, row.stage, evidenceId);
      const policyId = Number((db.prepare('SELECT id FROM policies WHERE external_key=?').get(externalKey) as { id: number }).id);
      db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json) VALUES ('topic',?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label`).run(externalKey, row.title, JSON.stringify({ domain: 'policy-radar', policyId }));
      db.prepare(`INSERT INTO policy_status_events (policy_id,event_type,event_date,note,external_source_key,source_url,source_label,is_demo)
        VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(policy_id,event_type,event_date) DO UPDATE SET note=excluded.note,external_source_key=excluded.external_source_key,source_url=excluded.source_url,source_label=excluded.source_label,is_demo=0`).run(policyId, row.stage, row.date || retrievedAt.slice(0, 10), `공식 원문에 표시된 상태: ${row.status || '상태 미확인'} · 시행 여부 별도 확인`, row.externalKey, row.sourceUrl, row.sourceLabel);
      const candidateKey = `policy-candidate:${externalKey}`;
      db.prepare(`INSERT INTO topic_candidates (external_key,policy_id,complaint_cluster_id,title,editorial_summary,score,eligible,score_json,verification_state,is_demo)
        VALUES (?,? ,NULL,?,? ,0,0,?,'staged',0) ON CONFLICT(external_key) DO UPDATE SET title=excluded.title,editorial_summary=excluded.editorial_summary,score=0,eligible=0,score_json=excluded.score_json,verification_state='staged',is_demo=0,updated_at=CURRENT_TIMESTAMP`).run(candidateKey, policyId, row.title, '정책 원문 수집 완료. 실제 민원과 연결하고 검토한 뒤 점수를 부여합니다.', JSON.stringify({ 생활영향: 0, 이슈화: 0, 민원: 0, 시행긴급성: 0, 정치인책임: 0, 자료확보: 0, total: 0, eligible: false }));
      staged += 1;
    }
    db.exec('COMMIT'); return { staged, evidenceId };
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

export async function collectLawmakingPolicies(options: CollectorOptions = {}) {
  const now = options.now ?? new Date(); const year = options.year ?? now.getFullYear();
  const oc = process.env.LAWMAKING_OC;
  if (!oc && !options.fixtureBody) { const runId = startIngestRun(LAWMAKING_SOURCE_SLUG, 'sync', 'blocked', 'LAWMAKING_OC 환경변수가 없어 공식 정책 수집을 시작하지 않았습니다.'); return { runId, status: 'blocked' as const, rowsStaged: 0 }; }
  const runId = startIngestRun(LAWMAKING_SOURCE_SLUG, 'sync');
  try {
    const url = new URL(options.fixtureBody ? LAWMAKING_ENDPOINT : LAWMAKING_ENDPOINT);
    if (!options.fixtureBody) { url.searchParams.set('OC', oc!); url.searchParams.set('stYdFmt', `${year}. 1. 1.`); url.searchParams.set('edYdFmt', `${year}. 12. 31.`); }
    const fetched = options.fixtureBody ? { body: options.fixtureBody, finalUrl: url.toString(), contentType: 'application/xml' } : await fetchOfficial(url.toString(), LAWMAKING_HOSTS, options);
    const parsed = parseLawmakingXmlDetailed(fetched.body, redactSensitiveUrl(fetched.finalUrl));
    const rows = parsed.rows.filter((row) => !row.date || row.date.includes(String(year)));
    if (!rows.length) { finishIngestRun(runId, 'partial', parsed.seen, 0, '올해 범위에서 해석 가능한 정책 행이 없습니다.', { year, rejected: parsed.rejected, fetched_at: now.toISOString(), final_url: redactSensitiveUrl(fetched.finalUrl) }); return { runId, status: 'partial' as const, rowsStaged: 0 }; }
    const retrievedAt = now.toISOString(); const rawRoot = options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? path.join(process.cwd(), 'data', 'raw'); const rawPath = path.join(rawRoot, 'policies', 'lawmaking', String(runId), 'response.xml'); atomicWrite(rawPath, fetched.body);
    const source = (() => { const db = openArchiveDb(); try { return Number((db.prepare('SELECT id FROM source_registry WHERE slug=?').get(LAWMAKING_SOURCE_SLUG) as { id: number }).id); } finally { db.close(); } })();
    const result = persistPolicyRows(rows, source, rawPath, fetched.body, redactSensitiveUrl(fetched.finalUrl), retrievedAt);
    const status = parsed.rejected || rows.length < parsed.rows.length ? 'partial' : 'success'; finishIngestRun(runId, status, parsed.seen, result.staged, status === 'partial' ? '일부 정책 행은 형식 또는 올해 범위가 아니어서 제외했습니다.' : null, { year, rejected: parsed.rejected, fetched_at: retrievedAt, final_url: redactSensitiveUrl(fetched.finalUrl), sha256: sha256(fetched.body), raw_path: rawPath });
    return { runId, status, rowsStaged: result.staged };
  } catch (error) { const message = redactSensitiveUrl(error instanceof Error ? error.message : '정책 원문 수집 실패'); finishIngestRun(runId, 'failed', 0, 0, message, { fetched_at: now.toISOString() }); return { runId, status: 'failed' as const, rowsStaged: 0, error: message }; }
}

function jsonRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const preferred = (((record.response as Record<string, unknown> | undefined)?.body as Record<string, unknown> | undefined)?.items as Record<string, unknown> | undefined)?.item;
  if (Array.isArray(preferred)) return preferred.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  for (const value of Object.values(record)) { const found = jsonRows(value); if (found.length) return found; }
  return [];
}
function textField(row: Record<string, unknown>, names: string[]) {
  for (const name of names) { const value = row[name]; if (value !== undefined && value !== null && String(value).trim()) return String(value).trim(); }
  return '';
}
function parseComplaintObject(row: Record<string, unknown>, sourceUrl: string, index: number): ComplaintRow | null {
  const keyword = textField(row, ['keyword', 'Keyword', '민원키워드', 'name', 'title']);
  if (!keyword) return null;
  const date = textField(row, ['date', 'analysisTime', 'observedAt']) || new Date().toISOString().slice(0, 10);
  const externalKey = textField(row, ['id', 'externalKey']) || `${date}:${keyword}:${textField(row, ['rank']) || index + 1}`;
  const count = textField(row, ['df', 'count', 'prevDf', 'prevRatio', 'value']) || '공식 민원 급증 신호';
  return { externalKey: `epeople:${externalKey}`, keyword, observedAt: date, countOrNote: count, sourceType: 'complaint', sourceUrl, policyExternalKey: textField(row, ['policyExternalKey', 'policy_key']) || undefined };
}

export function parseComplaintPayload(payload: string | unknown, sourceUrl = COMPLAINT_ENDPOINT): ComplaintRow[] {
  return parseComplaintPayloadDetailed(payload, sourceUrl).rows;
}
function parseComplaintPayloadDetailed(payload: string | unknown, sourceUrl: string) {
  let value: unknown = payload;
  let fragments: (Record<string, unknown> | string)[];
  if (typeof payload === 'string') {
    if (/^\s*</.test(payload)) {
      validXmlMarker(payload);
      fragments = xmlItems(payload);
    } else {
      try { value = JSON.parse(payload); } catch { throw new Error('민원 응답이 JSON/XML 형식이 아닙니다.'); }
      fragments = jsonRows(value);
      const header = (value as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
      const resultCode = ((header?.header as Record<string, unknown> | undefined)?.resultCode ?? '') as string;
      if (resultCode && !['00', '0', 'NORMAL_CODE'].includes(String(resultCode))) throw new Error(`민원 API 오류 코드: ${String(resultCode)}`);
    }
  } else fragments = jsonRows(value);
  const rows: ComplaintRow[] = []; let rejected = 0;
  fragments.forEach((fragment, index) => {
    const row = typeof fragment === 'string' ? parseComplaintObject({ keyword: tagValue(fragment, ['keyword', '민원키워드', 'name']), date: tagValue(fragment, ['date', 'analysisTime']), df: tagValue(fragment, ['df', 'count']), rank: tagValue(fragment, ['rank']) }, sourceUrl, index) : parseComplaintObject(fragment, sourceUrl, index);
    if (row) rows.push(row); else rejected += 1;
  });
  return { rows, rejected, seen: fragments.length };
}

export function buildComplaintUrl(endpoint: string, serviceKey: string, now = new Date()) {
  const url = assertHost(endpoint, COMPLAINT_HOSTS);
  url.searchParams.set('serviceKey', serviceKey);
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 10);
  url.searchParams.set('analysisTime', stamp);
  url.searchParams.set('maxResult', '20'); url.searchParams.set('target', 'pttn,dfpt,saeol'); url.searchParams.set('dataType', 'json');
  return url.toString();
}

function applyPolicyComplaintMatches(db: ReturnType<typeof openArchiveDb>) {
  const policies = db.prepare(`SELECT p.id,p.external_key,p.title,(SELECT event_date FROM policy_status_events e WHERE e.policy_id=p.id ORDER BY e.event_date DESC,e.id DESC LIMIT 1) AS policy_date
    FROM policies p WHERE p.is_demo=0`).all() as { id: number; external_key: string; title: string; policy_date: string | null }[];
  const signals = db.prepare(`SELECT s.id,s.cluster_id,s.keyword,s.observed_at,s.source_url,s.source_evidence_id,s.policy_external_key
    FROM complaint_signals s JOIN complaint_clusters c ON c.id=s.cluster_id WHERE s.is_demo=0 AND c.is_demo=0`).all() as { id: number; cluster_id: number; keyword: string; observed_at: string; source_url: string; source_evidence_id: number | null; policy_external_key: string | null }[];
  for (const signal of signals) for (const policy of policies) {
    const explicit = signal.policy_external_key && (signal.policy_external_key === policy.external_key || signal.policy_external_key === policy.external_key.replace(/^assembly-bill:/, '') || signal.policy_external_key === policy.external_key.replace(/^lawmaking:/, ''));
    const matched = explicit ? { relation: 'POSSIBLY_AFFECTED_BY' as const, matchedTerms: ['explicit-policy-key'], evidence: { kind: 'exact' as const, policyTerms: [policy.title], complaintTerms: [signal.keyword], windowDays: 90 }, reviewState: 'needs_review' as const } : matchPolicyToComplaint({ title: policy.title, date: policy.policy_date }, { keyword: signal.keyword, date: signal.observed_at });
    if (!matched) continue;
    const evidence = { signalId: signal.id, sourceEvidenceId: signal.source_evidence_id, sourceUrl: signal.source_url, reason: matched.evidence };
    db.prepare(`INSERT INTO policy_complaint_matches (policy_id,complaint_cluster_id,relation,matched_terms_json,evidence_json,review_state)
      VALUES (?,?,?,?,?,'needs_review') ON CONFLICT(policy_id,complaint_cluster_id) DO UPDATE SET relation=excluded.relation,matched_terms_json=excluded.matched_terms_json,evidence_json=excluded.evidence_json,review_state='needs_review'`).run(policy.id, signal.cluster_id, matched.relation, JSON.stringify(matched.matchedTerms), JSON.stringify(evidence));
    const policyNode = db.prepare("SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?").get(policy.external_key) as { id: number } | undefined;
    const clusterExternalKey = (db.prepare('SELECT external_key FROM complaint_clusters WHERE id=?').get(signal.cluster_id) as { external_key: string }).external_key;
    const clusterKey = `complaint-cluster:${clusterExternalKey}`;
    const clusterNode = db.prepare("SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?").get(`complaint:${clusterKey}`) as { id: number } | undefined;
    if (policyNode && clusterNode) db.prepare(`INSERT INTO graph_edges (from_node_id,to_node_id,relation,properties_json) VALUES (?,?,?,?) ON CONFLICT(from_node_id,to_node_id,relation) DO UPDATE SET properties_json=excluded.properties_json`).run(policyNode.id, clusterNode.id, matched.relation, JSON.stringify({ matchedTerms: matched.matchedTerms, reviewState: 'needs_review', confirmed: false }));
    db.prepare(`INSERT INTO topic_candidates (external_key,policy_id,complaint_cluster_id,title,editorial_summary,score,eligible,score_json,verification_state,is_demo)
      VALUES (?,?,?,?,?,0,0,?,'needs_review',0) ON CONFLICT(external_key) DO UPDATE SET complaint_cluster_id=excluded.complaint_cluster_id,editorial_summary=excluded.editorial_summary,score=0,eligible=0,score_json=excluded.score_json,verification_state='needs_review',is_demo=0,updated_at=CURRENT_TIMESTAMP`).run(`policy-candidate:${policy.external_key}:cluster:${signal.cluster_id}`, policy.id, signal.cluster_id, policy.title, `민원 신호와 ${matched.evidence.kind === 'exact' ? '정확 토큰' : '생활어 alias'}로 연결됨. 원인·영향은 검토 전입니다.`, JSON.stringify({ 생활영향: 0, 이슈화: 0, 민원: 0, 시행긴급성: 0, 정치인책임: 0, 자료확보: 0, total: 0, eligible: false }));
  }
}

function persistComplaintRows(rows: ComplaintRow[], sourceId: number, rawPath: string, body: string, finalUrl: string, retrievedAt: string) {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE'); let staged = 0;
  try {
    const evidenceId = persistEvidence(db, sourceId, `epeople:${retrievedAt.slice(0, 13)}`, '국민권익위 민원 급증 원문', finalUrl, body, rawPath, retrievedAt);
    for (const row of rows) {
      const clusterKey = `complaint-cluster:${row.externalKey}`;
      db.prepare(`INSERT INTO complaint_clusters (external_key,label,description,signal_strength,verification_state,is_demo)
        VALUES (?,?,?,0,'staged',0) ON CONFLICT(external_key) DO UPDATE SET label=excluded.label,description=excluded.description,verification_state='staged',is_demo=0`).run(clusterKey, row.keyword, '공식 민원 급증 신호. 정책 영향은 별도 검증이 필요합니다.');
      const clusterId = Number((db.prepare('SELECT id FROM complaint_clusters WHERE external_key=?').get(clusterKey) as { id: number }).id);
      db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json) VALUES ('topic',?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label`).run(`complaint:${clusterKey}`, row.keyword, JSON.stringify({ domain: 'complaint-signal', clusterId }));
      db.prepare(`INSERT INTO complaint_signals (cluster_id,source_type,keyword,observed_at,count_or_note,source_url,source_evidence_id,external_source_key,policy_external_key,is_demo)
        VALUES (?, 'complaint', ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(external_source_key) DO UPDATE SET keyword=excluded.keyword,observed_at=excluded.observed_at,count_or_note=excluded.count_or_note,source_url=excluded.source_url,source_evidence_id=excluded.source_evidence_id,policy_external_key=excluded.policy_external_key,is_demo=0`).run(clusterId, row.keyword, row.observedAt, row.countOrNote, row.sourceUrl, evidenceId, row.externalKey, row.policyExternalKey ?? null);
      if (row.policyExternalKey) {
        const policy = db.prepare('SELECT id,external_key,title FROM policies WHERE external_key=? OR external_source_key=?').get(row.policyExternalKey, row.policyExternalKey) as { id: number; external_key: string; title: string } | undefined;
        if (policy) {
          db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json) VALUES ('topic',?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label`).run(`complaint:${clusterKey}`, row.keyword, JSON.stringify({ domain: 'complaint-signal' }));
          const complaintNode = Number((db.prepare("SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?").get(`complaint:${clusterKey}`) as { id: number }).id);
          const policyNode = db.prepare("SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?").get(policy.external_key) as { id: number } | undefined;
          if (policyNode) db.prepare(`INSERT INTO graph_edges (from_node_id,to_node_id,relation,properties_json) VALUES (?,?, 'POSSIBLY_AFFECTED_BY', ?) ON CONFLICT(from_node_id,to_node_id,relation) DO UPDATE SET properties_json=excluded.properties_json`).run(policyNode.id, complaintNode, JSON.stringify({ evidenceId, confirmed: false }));
          const candidateKey = `policy-candidate:${policy.external_key}:${clusterKey}`;
          db.prepare(`INSERT INTO topic_candidates (external_key,policy_id,complaint_cluster_id,title,editorial_summary,score,eligible,score_json,verification_state,is_demo)
            VALUES (?,?,?,?,?,0,0,?,'needs_review',0) ON CONFLICT(external_key) DO UPDATE SET complaint_cluster_id=excluded.complaint_cluster_id,editorial_summary=excluded.editorial_summary,score=0,eligible=0,verification_state='needs_review',is_demo=0,updated_at=CURRENT_TIMESTAMP`).run(candidateKey, policy.id, clusterId, policy.title, '정책 원문과 민원 신호가 연결되었습니다. 원인·영향은 검토 전입니다.', JSON.stringify({ 생활영향: 0, 이슈화: 0, 민원: 0, 시행긴급성: 0, 정치인책임: 0, 자료확보: 0, total: 0, eligible: false }));
        }
      }
      staged += 1;
    }
    applyPolicyComplaintMatches(db);
    db.exec('COMMIT'); return { staged, evidenceId };
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

export async function collectComplaintSignals(options: CollectorOptions = {}) {
  const now = options.now ?? new Date(); const endpoint = process.env.EPEOPLE_API_URL || COMPLAINT_ENDPOINT; const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!options.fixtureBody && !key) { const runId = startIngestRun(COMPLAINT_SOURCE_SLUG, 'sync', 'blocked', 'DATA_GO_KR_SERVICE_KEY 환경변수가 없어 민원 API 호출을 시작하지 않았습니다.'); return { runId, status: 'blocked' as const, rowsStaged: 0 }; }
  const runId = startIngestRun(COMPLAINT_SOURCE_SLUG, 'sync');
  try {
    const requestUrl = options.fixtureBody ? endpoint : buildComplaintUrl(endpoint, key!, now);
    const fetched = options.fixtureBody ? { body: options.fixtureBody, finalUrl: redactSensitiveUrl(endpoint), contentType: 'application/json' } : await fetchOfficial(requestUrl, COMPLAINT_HOSTS, options);
    const parsed = parseComplaintPayloadDetailed(fetched.body, redactSensitiveUrl(fetched.finalUrl));
    if (!parsed.rows.length) { finishIngestRun(runId, 'partial', parsed.seen, 0, '해석 가능한 민원 신호가 없습니다.', { rejected: parsed.rejected, fetched_at: now.toISOString(), final_url: redactSensitiveUrl(fetched.finalUrl) }); return { runId, status: 'partial' as const, rowsStaged: 0 }; }
    const retrievedAt = now.toISOString(); const rawRoot = options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? path.join(process.cwd(), 'data', 'raw'); const rawPath = path.join(rawRoot, 'complaints', 'epeople', String(runId), 'response.json'); atomicWrite(rawPath, fetched.body);
    const source = (() => { const db = openArchiveDb(); try { return Number((db.prepare('SELECT id FROM source_registry WHERE slug=?').get(COMPLAINT_SOURCE_SLUG) as { id: number }).id); } finally { db.close(); } })();
    const result = persistComplaintRows(parsed.rows, source, rawPath, fetched.body, redactSensitiveUrl(fetched.finalUrl), retrievedAt);
    const status = parsed.rejected ? 'partial' : 'success'; finishIngestRun(runId, status, parsed.seen, result.staged, parsed.rejected ? `${parsed.rejected}개 행은 키워드가 없어 제외했습니다.` : null, { rejected: parsed.rejected, fetched_at: retrievedAt, final_url: redactSensitiveUrl(fetched.finalUrl), sha256: sha256(fetched.body), raw_path: rawPath });
    return { runId, status, rowsStaged: result.staged };
  } catch (error) { const message = redactSensitiveUrl(error instanceof Error ? error.message : '민원 신호 수집 실패'); finishIngestRun(runId, 'failed', 0, 0, message, { fetched_at: now.toISOString() }); return { runId, status: 'failed' as const, rowsStaged: 0, error: message }; }
}

function jsonText(row: Record<string, unknown>, ...keys: string[]) { return textField(row, keys); }
function assemblyStage(row: { committeeDate: string; processDate: string; processResult: string }) {
  const result = row.processResult;
  if (/폐기|철회|부결|반려|대안반영/.test(result)) return 'repealed' as const;
  if (row.processDate) return 'plenary' as const;
  if (row.committeeDate) return 'committee' as const;
  return 'proposed' as const;
}

export function parseAssemblyBillPage(payload: unknown, pageSize = 100): AssemblyBillPage {
  if (!payload || typeof payload !== 'object') throw new Error('국회 의안정보 응답 형식이 올바르지 않습니다.');
  const root = payload as Record<string, unknown>;
  const result = root.RESULT as Record<string, unknown> | undefined;
  if (result && textField(result, ['CODE']) && textField(result, ['CODE']) !== 'INFO-000') throw new Error(`국회 의안 API 오류: ${textField(result, ['MESSAGE', 'CODE'])}`);
  const sections = root.TVBPMBILL11;
  if (!Array.isArray(sections) || sections.length < 2) throw new Error('TVBPMBILL11 성공 envelope 미확인: keyed fixture가 필요합니다.');
  const head = sections[0] && typeof sections[0] === 'object' ? (sections[0] as Record<string, unknown>).head : undefined;
  const headRow = Array.isArray(head) && head[0] && typeof head[0] === 'object' ? head[0] as Record<string, unknown> : {};
  const totalValue = jsonText(headRow, 'list_total_count'); const totalCount = totalValue && Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;
  const rawRows = sections[1] && typeof sections[1] === 'object' ? (sections[1] as Record<string, unknown>).row : undefined;
  if (!Array.isArray(rawRows)) throw new Error('TVBPMBILL11 row envelope가 없습니다.');
  const rows: AssemblyBillRow[] = []; let rejected = 0;
  for (const value of rawRows) {
    if (!value || typeof value !== 'object') { rejected += 1; continue; }
    const raw = value as Record<string, unknown>;
    const billId = jsonText(raw, 'BILL_ID'); const billNo = jsonText(raw, 'BILL_NO'); const title = jsonText(raw, 'BILL_NAME');
    if ((!billId && !billNo) || !title) { rejected += 1; continue; }
    const row = { billId, billNo, title, proposer: jsonText(raw, 'PROPOSER'), proposerKind: jsonText(raw, 'PROPOSER_KIND'), proposeDate: jsonText(raw, 'PROPOSE_DT'), currentCommittee: jsonText(raw, 'CURR_COMMITTEE'), committeeDate: jsonText(raw, 'COMMITTEE_DT'), processDate: jsonText(raw, 'PROC_DT'), processResult: jsonText(raw, 'PROC_RESULT_CD'), representativeProposer: jsonText(raw, 'RST_PROPOSER'), linkUrl: jsonText(raw, 'LINK_URL'), raw };
    rows.push({ ...row, stage: assemblyStage(row) });
  }
  return { rows, totalCount, isShortPage: rawRows.length < Math.max(1, Math.min(100, pageSize)), rejected };
}
export function parseAssemblyBills(payload: unknown): AssemblyBillRow[] { return parseAssemblyBillPage(payload).rows; }

function proposerNames(row: AssemblyBillRow) {
  const source = row.representativeProposer || row.proposer;
  return [...new Set(source.split(/[,，、;；]|\s+외\s+\d+명?/).map((name) => name.replace(/\s*(의원|국회의원)\s*$/g, '').trim()).filter((name) => name.length >= 2 && !/^\d+$/.test(name)))];
}
function normalizedPersonName(value: string) { return value.replace(/\s+/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase(); }
function linkProposers(db: ReturnType<typeof openArchiveDb>, policyId: number, policyNodeId: number, names: string[]) {
  for (const proposerName of names) {
    const target = normalizedPersonName(proposerName);
    const people = (db.prepare(`SELECT p.id,p.label,m.status FROM graph_nodes p JOIN assembly_memberships m ON m.person_node_id=p.id WHERE m.assembly_term='22' AND m.status IN ('staged','verified_current')`).all() as { id: number; label: string; status: string }[]).filter((person) => normalizedPersonName(person.label) === target);
    const resolution = people.length === 1 ? 'matched' : people.length > 1 ? 'needs_review' : 'unmatched';
    const note = people.length === 1 ? '22대 공식 의원 노드와 이름이 유일하게 일치했지만 현직 승인은 별도 검토가 필요합니다.' : people.length > 1 ? '동명이인 후보가 여러 명이라 자동 관계를 만들지 않았습니다.' : '22대 공식 의원 노드와 이름이 일치하지 않습니다.';
    db.prepare(`INSERT INTO proposer_matches (policy_id,proposer_name,person_node_id,resolution,note) VALUES (?,?,?,?,?) ON CONFLICT(policy_id,proposer_name) DO UPDATE SET person_node_id=excluded.person_node_id,resolution=excluded.resolution,note=excluded.note`).run(policyId, proposerName, people.length === 1 ? people[0].id : null, resolution, note);
    if (people.length === 1) db.prepare(`INSERT INTO graph_edges (from_node_id,to_node_id,relation,properties_json) VALUES (?,?, 'PROPOSED_BY', ?) ON CONFLICT(from_node_id,to_node_id,relation) DO UPDATE SET properties_json=excluded.properties_json`).run(people[0].id, policyNodeId, JSON.stringify({ resolution: 'name_exact', membershipStatus: people[0].status, needsReview: true }));
  }
}

function persistAssemblyBillRows(rows: AssemblyBillRow[], sourceId: number, rawPath: string, body: string, finalUrl: string, retrievedAt: string) {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE'); let staged = 0;
  try {
    const evidenceId = persistEvidence(db, sourceId, `assembly-bills:${retrievedAt.slice(0, 13)}`, '국회 TVBPMBILL11 의안정보 원문', finalUrl, body, rawPath, retrievedAt);
    for (const row of rows) {
      const billKey = row.billId || row.billNo; const externalKey = `assembly-bill:${billKey}`; const names = proposerNames(row);
      db.prepare(`INSERT INTO policies (external_key,external_source_key,title,summary,current_stage,impact_groups,verification_state,is_demo,bill_id,bill_no,proposer_names,raw_fields_json,source_evidence_id)
        VALUES (?,?,?,?,?,'미분류','staged',0,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET external_source_key=excluded.external_source_key,title=excluded.title,summary=excluded.summary,current_stage=excluded.current_stage,is_demo=0,bill_id=excluded.bill_id,bill_no=excluded.bill_no,proposer_names=excluded.proposer_names,raw_fields_json=excluded.raw_fields_json,source_evidence_id=excluded.source_evidence_id,updated_at=CURRENT_TIMESTAMP`).run(externalKey, billKey, row.title, `${row.proposerKind}${row.currentCommittee ? ` · ${row.currentCommittee}` : ''}`.trim(), row.stage, row.billId || null, row.billNo || null, names.join(', '), JSON.stringify(row.raw), evidenceId);
      const policy = db.prepare('SELECT id FROM policies WHERE external_key=?').get(externalKey) as { id: number };
      db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json) VALUES ('topic',?,?,?) ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label,properties_json=excluded.properties_json`).run(externalKey, row.title, JSON.stringify({ domain: 'assembly-bill', billId: row.billId, billNo: row.billNo }));
      const policyNode = Number((db.prepare("SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?").get(externalKey) as { id: number }).id);
      const events = [[ 'proposed', row.proposeDate ], ['committee', row.committeeDate], ['plenary', row.processDate]].filter(([, date]) => Boolean(date)) as [string, string][];
      if (!events.some(([stage]) => stage === row.stage)) events.push([row.stage, row.proposeDate || retrievedAt.slice(0, 10)]);
      for (const [stage, date] of events) db.prepare(`INSERT INTO policy_status_events (policy_id,event_type,event_date,note,external_source_key,source_url,source_label,raw_fields_json,is_demo)
        VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT(policy_id,event_type,event_date) DO UPDATE SET note=excluded.note,external_source_key=excluded.external_source_key,source_url=excluded.source_url,source_label=excluded.source_label,raw_fields_json=excluded.raw_fields_json,is_demo=0`).run(policy.id, stage, date, `국회 원문 상태값: ${row.processResult || '없음'} · 시행·공포 여부는 이 자료에서 추정하지 않음`, `${row.billId || row.billNo}:${stage}`, row.linkUrl, '대한민국 국회 TVBPMBILL11', JSON.stringify({ PROC_RESULT_CD: row.processResult, raw: row.raw }));
      db.prepare(`INSERT INTO topic_candidates (external_key,policy_id,complaint_cluster_id,title,editorial_summary,score,eligible,score_json,verification_state,is_demo)
        VALUES (?,? ,NULL,?,? ,0,0,?,'needs_review',0) ON CONFLICT(external_key) DO UPDATE SET title=excluded.title,editorial_summary=excluded.editorial_summary,score=0,eligible=0,score_json=excluded.score_json,verification_state='needs_review',is_demo=0,updated_at=CURRENT_TIMESTAMP`).run(`policy-candidate:${externalKey}`, policy.id, row.title, '국회 의안 원문 수집 완료. 민원 신호와 대표발의자 연결을 검토해야 합니다.', JSON.stringify({ 생활영향: 0, 이슈화: 0, 민원: 0, 시행긴급성: 0, 정치인책임: 0, 자료확보: 0, total: 0, eligible: false }));
      linkProposers(db, policy.id, policyNode, names); staged += 1;
    }
    db.exec('COMMIT'); return { staged, evidenceId };
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

export async function collectAssemblyBills(options: CollectorOptions & { pSize?: number } = {}) {
  const now = options.now ?? new Date(); const key = process.env.ASSEMBLY_API_KEY;
  if (!key && !options.fixtureBody) { const runId = startIngestRun('assembly-bills-live', 'sync', 'blocked', 'ASSEMBLY_API_KEY 환경변수가 없어 최근 의안 수집을 시작하지 않았습니다.'); return { runId, status: 'blocked' as const, rowsStaged: 0 }; }
  const runId = startIngestRun('assembly-bills-live', 'sync');
  try {
    const url = new URL(ASSEMBLY_BILLS_ENDPOINT); const pSize = Math.max(1, Math.min(100, options.pSize ?? 100));
    if (!options.fixtureBody) { url.searchParams.set('KEY', key!); url.searchParams.set('Type', 'json'); url.searchParams.set('pIndex', '1'); url.searchParams.set('pSize', String(pSize)); url.searchParams.set('AGE', '22'); }
    const fetched = options.fixtureBody ? { body: options.fixtureBody, finalUrl: url.toString(), contentType: 'application/json' } : await fetchOfficial(url.toString(), ASSEMBLY_HOSTS, options);
    let payload: unknown; try { payload = JSON.parse(fetched.body); } catch { throw new Error('국회 의안 API 응답이 JSON 형식이 아닙니다.'); }
    const parsed = parseAssemblyBillPage(payload, pSize);
    if (!parsed.rows.length) { finishIngestRun(runId, 'partial', parsed.rejected, 0, '해석 가능한 국회 의안이 없습니다.', { bounded_first_page: true, rejected: parsed.rejected, fetched_at: now.toISOString() }); return { runId, status: 'partial' as const, rowsStaged: 0 }; }
    const retrievedAt = now.toISOString(); const rawRoot = options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? path.join(process.cwd(), 'data', 'raw'); const rawPath = path.join(rawRoot, 'policies', 'assembly-bills', String(runId), 'page-1.json'); atomicWrite(rawPath, fetched.body);
    const db = openArchiveDb(); let sourceId: number; try { sourceId = Number((db.prepare('SELECT id FROM source_registry WHERE slug=?').get('assembly-bills-live') as { id: number }).id); } finally { db.close(); }
    const result = persistAssemblyBillRows(parsed.rows, sourceId, rawPath, fetched.body, redactSensitiveUrl(fetched.finalUrl), retrievedAt);
    const status = parsed.rejected ? 'partial' : 'success'; finishIngestRun(runId, status, parsed.rows.length + parsed.rejected, result.staged, parsed.rejected ? '일부 의안 행을 해석하지 못했습니다.' : null, { bounded_first_page: true, rejected: parsed.rejected, fetched_at: retrievedAt, final_url: redactSensitiveUrl(fetched.finalUrl), sha256: sha256(fetched.body), raw_path: rawPath });
    return { runId, status, rowsStaged: result.staged };
  } catch (error) { const message = redactSensitiveUrl(error instanceof Error ? error.message : '국회 의안 수집 실패'); finishIngestRun(runId, 'failed', 0, 0, message, { fetched_at: now.toISOString() }); return { runId, status: 'failed' as const, rowsStaged: 0, error: message }; }
}
