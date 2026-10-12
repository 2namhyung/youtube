import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { createDraftClaimWithEvidence } from './graph.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

export const NAM_INSUN_NAAS_CD = '04T3751T';
export const NAM_INSUN_PILOT_SLUG = 'pilot-nam-insun';

export type PilotManifestItem = {
  key: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: 'html' | 'xml' | 'pdf';
  publishedAt: string;
  requiredText?: string[];
};

export const NAM_INSUN_MANIFEST: PilotManifestItem[] = [
  { key: 'profile', title: '국회도서관 남인순 활동·약력', url: 'https://ampos.nanet.go.kr/activityCongressDetail.do?congress_no=G1899475', publisher: '국회도서관', sourceType: 'html', publishedAt: '', requiredText: ['남인순'] },
  { key: 'bill-2106793', title: '동물대체시험법 관련 의안 상세', url: 'https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/2106793/detailRP', publisher: '국가법령정보센터', sourceType: 'html', publishedAt: '2020', requiredText: ['제2106793호'] },
  { key: 'minutes-47812', title: '국회 회의록 2023-11-23 대목', url: 'https://record.assembly.go.kr/assembly/viewer/minutes/xml.do?id=47812&item=item86&type=view', publisher: '대한민국 국회 회의록', sourceType: 'html', publishedAt: '2023-11-23', requiredText: ['그래서 벌써 이 법안이 발의된 지가'] },
  { key: 'forum-2023', title: '국회도서관 정책포럼 자료', url: 'https://lnp.nanet.go.kr/policy/memberNaAssPolicy/detail.do?controlNo=PAMP10000000071616', publisher: '국회도서관', sourceType: 'html', publishedAt: '2023', requiredText: ['동물대체'] },
];

const ALLOWED_HOSTS = new Set(['ampos.nanet.go.kr', 'opinion.lawmaking.go.kr', 'record.assembly.go.kr', 'lnp.nanet.go.kr']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MIME_BY_TYPE: Record<PilotManifestItem['sourceType'], RegExp> = { html: /^text\/(html|xhtml)$/i, xml: /^(text\/xml|application\/xml)(?:;|$)/i, pdf: /^application\/pdf(?:;|$)/i };
const OFFICIAL_USER_AGENT = '2030-easy-politics-archive/1.0 (official-source retrieval)';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type PilotCollectOptions = { fetchImpl?: FetchLike; maxBytes?: number; rawRoot?: string; maxRedirects?: number; manifest?: PilotManifestItem[] };
export type PilotSourceResult = PilotManifestItem & { status: 'success' | 'failed'; finalUrl?: string; rawPath?: string; contentHash?: string; bytes?: number; mimeType?: string; evidenceId?: number; error?: { code: string; message: string } };
export type PilotCollectResult = { runId: number; status: 'success' | 'failed'; rowsSeen: number; rowsStaged: number; successes: PilotSourceResult[]; failures: PilotSourceResult[] };

class PilotFetchError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'PilotFetchError'; this.code = code; }
}

function officialUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new PilotFetchError('invalid_url', '공식 원문 URL 형식이 올바르지 않습니다.'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw new PilotFetchError('untrusted_host', '허용된 공식 호스트가 아닙니다.');
  return url;
}

function mimeFor(response: Response, item: PilotManifestItem) {
  const value = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!MIME_BY_TYPE[item.sourceType].test(value)) throw new PilotFetchError('invalid_mime', `허용되지 않은 콘텐츠 형식입니다: ${value || '없음'}`);
  return value;
}

function decodeOfficialText(bytes: Buffer, response: Response) {
  const charset = response.headers.get('content-type')?.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.toLowerCase();
  const encoding = charset === 'euc-kr' || charset === 'cp949' || charset === 'ks_c_5601-1987' ? 'euc-kr' : 'utf-8';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

function validateRequiredText(item: PilotManifestItem, bytes: Buffer, response: Response) {
  if (!item.requiredText?.length || item.sourceType === 'pdf') return;
  const text = decodeOfficialText(bytes, response);
  const missing = item.requiredText.find((marker) => !text.includes(marker));
  if (missing) throw new PilotFetchError('required_text_missing', `공식 원문 확인 문구가 없습니다: ${missing}`);
}

async function fetchOfficial(item: PilotManifestItem, fetchImpl: FetchLike, maxBytes: number, maxRedirects: number) {
  let current = officialUrl(item.url);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetchImpl(current, {
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        'user-agent': OFFICIAL_USER_AGENT,
        accept: item.sourceType === 'pdf' ? 'application/pdf' : 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8',
      },
    });
    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new PilotFetchError('redirect_missing', '리디렉션 위치가 없습니다.');
      if (redirects === maxRedirects) throw new PilotFetchError('too_many_redirects', '리디렉션 상한을 초과했습니다.');
      current = officialUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new PilotFetchError(`http_${response.status}`, `공식 원문 HTTP 오류: ${response.status}`);
    const mimeType = mimeFor(response, item);
    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) throw new PilotFetchError('oversize', '응답 크기가 상한을 초과했습니다.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new PilotFetchError('oversize', '응답 크기가 상한을 초과했습니다.');
    validateRequiredText(item, bytes, response);
    const responseUrl = response.url && response.url !== 'about:blank' ? officialUrl(response.url).toString() : current.toString();
    return { finalUrl: responseUrl, mimeType, bytes };
  }
  throw new PilotFetchError('too_many_redirects', '리디렉션 상한을 초과했습니다.');
}

function atomicRawWrite(root: string, runId: number, item: PilotManifestItem, bytes: Buffer, mimeType: string) {
  const folder = path.join(root, 'pilots', 'nam-insun-animal-alternatives', String(runId));
  fs.mkdirSync(folder, { recursive: true });
  const extension = mimeType.includes('pdf') ? '.pdf' : mimeType.includes('xml') ? '.xml' : '.html';
  const filename = `${item.key}${extension}`;
  const destination = path.join(folder, filename);
  const temporary = path.join(folder, `.tmp-${process.pid}-${crypto.randomUUID()}-${filename}`);
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  try { fs.renameSync(temporary, destination); } catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* noop */ } throw error; }
  return destination;
}

function evidenceFor(db: import('node:sqlite').DatabaseSync, sourceId: number, item: PilotManifestItem, rawPath: string, contentHash: string, retrievedAt: string, finalUrl: string) {
  const found = db.prepare('SELECT id,node_id FROM evidence_sources WHERE canonical_url=? OR content_hash=? LIMIT 1').get(item.url, contentHash) as { id: number; node_id: number } | undefined;
  if (found) {
    const hashConflict = db.prepare('SELECT id FROM evidence_sources WHERE content_hash=? AND id<>?').get(contentHash, found.id);
    if (!hashConflict) db.prepare('UPDATE evidence_sources SET canonical_url=?,title=?,publisher=?,source_type=?,retrieved_at=?,content_hash=?,raw_path=?,source_id=?,properties_json=? WHERE id=?').run(item.url, item.title, item.publisher, item.sourceType, retrievedAt, contentHash, rawPath, sourceId, JSON.stringify({ key: item.key, finalUrl, sha256: contentHash }), found.id);
    return found.id;
  }
  const evidenceNode = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run('evidence', `pilot:nam-insun:${item.key}`, item.title, JSON.stringify({ key: item.key, finalUrl, sha256: contentHash }), retrievedAt);
  return Number(db.prepare('INSERT INTO evidence_sources (node_id,external_key,canonical_url,title,publisher,source_type,retrieved_at,content_hash,license,trust_tier,source_id,raw_path,properties_json) VALUES (?,?,?,?,?,?,?,? ,?,?, ?,?,?)').run(Number(evidenceNode.lastInsertRowid), `pilot:nam-insun:${item.key}`, item.url, item.title, item.publisher, item.sourceType, retrievedAt, contentHash, '공식 원문 이용조건 확인', 1, sourceId, rawPath, JSON.stringify({ key: item.key, finalUrl, sha256: contentHash })).lastInsertRowid);
}

function persistEvidence(sourceId: number, item: PilotManifestItem, rawPath: string, contentHash: string, retrievedAt: string, finalUrl: string) {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE');
  try { const id = evidenceFor(db, sourceId, item, rawPath, contentHash, retrievedAt, finalUrl); db.exec('COMMIT'); return id; }
  catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; }
  finally { db.close(); }
}

export async function collectNamInsunPilot(options: PilotCollectOptions = {}): Promise<PilotCollectResult> {
  const manifest = options.manifest ?? NAM_INSUN_MANIFEST;
  const maxBytes = Math.max(1, Math.min(25 * 1024 * 1024, options.maxBytes ?? 8 * 1024 * 1024));
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = Math.max(0, Math.min(5, options.maxRedirects ?? 3));
  const rawRoot = options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? path.join(process.cwd(), 'data', 'raw');
  const runId = startIngestRun(NAM_INSUN_PILOT_SLUG, 'sync');
  const successes: PilotSourceResult[] = []; const failures: PilotSourceResult[] = [];
  for (const item of manifest) {
    try {
      const fetched = await fetchOfficial(item, fetchImpl, maxBytes, maxRedirects);
      const hash = crypto.createHash('sha256').update(fetched.bytes).digest('hex');
      const rawPath = atomicRawWrite(rawRoot, runId, item, fetched.bytes, fetched.mimeType);
      const evidenceId = persistEvidence((await sourceId()), item, rawPath, hash, new Date().toISOString(), fetched.finalUrl);
      successes.push({ ...item, status: 'success', finalUrl: fetched.finalUrl, rawPath, contentHash: hash, bytes: fetched.bytes.byteLength, mimeType: fetched.mimeType, evidenceId });
    } catch (error) {
      const code = error instanceof PilotFetchError ? error.code : 'fetch_failed';
      const message = error instanceof Error ? error.message : '공식 원문 수집 실패';
      failures.push({ ...item, status: 'failed', error: { code, message } });
    }
  }
  const status = failures.length ? 'failed' : 'success';
  finishIngestRun(runId, status, manifest.length, successes.length, failures.length ? `${failures.length}개 공식 원문 수집 실패` : null, { pilot: 'nam-insun-animal-alternatives', sources: [...successes, ...failures].map((item) => ({ key: item.key, url: item.url, status: item.status, evidenceId: item.evidenceId ?? null, bytes: item.bytes ?? null, contentHash: item.contentHash ?? null, error: item.error ?? null })) });
  return { runId, status, rowsSeen: manifest.length, rowsStaged: successes.length, successes, failures };
}

async function sourceId() {
  const db = openArchiveDb();
  try { const source = db.prepare('SELECT id FROM source_registry WHERE slug=?').get(NAM_INSUN_PILOT_SLUG) as { id: number } | undefined; if (!source) throw new Error('파일럿 수집원이 등록되지 않았습니다.'); return source.id; }
  finally { db.close(); }
}

const CARDS = [
  { title: '훅 — 동물을 대신하는 실험은 가능할까?', type: '훅', eventDate: '2020–2023', x: 80, y: 80, source: 'profile', body: '5–7분 파일럿 오프닝. “동물실험을 줄이자는 말은 실제 입법과 회의에서 어떻게 다뤄졌을까?”라는 질문으로 시작한다. 확인된 사실과 제작 가설을 분리한다.\n\n제작 가설: 남인순 의원의 2020년 동물대체시험법 관련 활동을 따라가면 정책이 법안·포럼·회의록으로 어떻게 이어지는지 보여줄 수 있다. 이 문장은 해석이며 원문 대조 전 확정하지 않는다.\n\n화면: 타임라인 2020→2023, 원문 URL 4개. B-roll은 국회 공개 이미지와 원문 화면 캡처만 사용하고, 재이용 조건을 확인한다.' },
  { title: '누구의 기록인가 — 남인순 프로필', type: '인물', eventDate: '프로필 기준일 확인 필요', x: 430, y: 80, source: 'profile', body: '국회도서관 공식 프로필의 활동·약력 페이지를 기준으로 인물 맥락을 소개한다. 현재 현직 여부는 별도 검토 큐에서 확인 중이며, 이 파일럿은 현직 확정이나 지지·평가를 의미하지 않는다.\n\n화면: 이미 수집된 국회 공식 인물사진을 원본 그대로 참조한다. 사진을 복사·재생성하지 말고, 국회 공개정보 이용조건과 영상 사용 범위를 확인한다.\n\n내레이션 40–50초: “오늘은 평가보다 기록의 연결을 봅니다.”' },
  { title: '2020 — 동물대체시험법 관련 의안', type: '법안', eventDate: '2020', x: 780, y: 80, source: 'bill-2106793', body: '국가법령정보센터의 공식 의안 상세 페이지를 출발점으로 2020년 제안 기록을 설명한다. 확인된 사실: 해당 공식 페이지가 존재한다.\n\n미확인 항목: 대체시험법의 정확한 의안번호·법안명·조문·처리 결과는 원문과 국회 의안 원자료를 다시 대조한 뒤에만 읽는다. 따라서 이 파일럿은 “통과” 또는 “실패”라고 단정하지 않는다.\n\n화면: 공식 페이지의 제목·일자·처리 단계만 필요한 범위에서 캡처하고, 조문 전체 재배포는 피한다. 내레이션 60초.' },
  { title: '2023 — 정책포럼에서 다시 보기', type: '포럼', eventDate: '2023', x: 80, y: 430, source: 'forum-2023', body: '국회도서관 공식 정책포럼 자료를 통해 2023년 논의가 어떤 문제 정의와 대안 언어를 사용했는지 확인한다. 법안의 처리 결과와 포럼의 정책 논의는 서로 다른 기록이므로 섞지 않는다.\n\n제작 가설: 포럼은 입법 전후의 정책 맥락을 설명하는 보조 근거가 될 수 있다. 원문에서 확인하기 전에는 인과관계로 말하지 않는다.\n\n화면: 포럼 표지·목차·발행 정보 중심. 이미지·도표는 이용조건을 확인하고 필요한 부분만 사용한다. 내레이션 50초.' },
  { title: '2023-11-23 — 회의록 한 대목', type: '회의록', eventDate: '2023-11-23', x: 430, y: 430, source: 'minutes-47812', body: '공식 회의록 HTML에서 2023-11-23 대목을 확인한다. 짧은 인용: “벌써 이 법안이 발의된 지가”. 방송에서는 반드시 앞뒤 문맥을 함께 보여 주고, 원문 확인 범위를 넘겨 의미를 확장하지 않는다.\n\n화면: 회의록 문서 식별자와 인용 전후 문맥. 회의록 원문을 길게 재현하지 말고 짧은 인용과 링크로 안내한다. 내레이션 60–75초.' },
  { title: '무엇을 알 수 있나 — 확인과 해석', type: '설명', eventDate: '검토 중', x: 780, y: 430, source: 'bill-2106793', body: '확인된 사실은 공식 원문 4곳과 각 수집 해시·수집일이 있다는 점이다. 제작 해석은 “법안·포럼·회의록을 연결해 정책 여정을 설명할 수 있다”는 수준으로 제한한다.\n\n미해결: 정확한 대체시험법 법안 번호·조문·처리 단계는 반드시 다시 확인한다. “법안이 실패했다/통과했다”는 표현은 현재 사용 금지다.\n\n화면: 사실/해석/미해결 3열. B-roll은 공식 문서와 직접 촬영한 설명 그래픽만 사용한다. 내레이션 60초.' },
  { title: '결론 — 다음 검증 질문', type: '결론', eventDate: '공개 전 검증 필요', x: 430, y: 780, source: 'minutes-47812', body: '마지막 질문: “2020년의 제안과 2023년 논의 사이에 실제 법안 처리·정책 변화의 연결고리는 무엇인가?” 다음 편 또는 공개 전 검증에서 의안 원문, 국회 처리 단계, 회의록 앞뒤 발언을 확인한다.\n\n클로징 35초: 아직 모르는 것을 남겨두는 것이 이 채널의 신뢰도다. 이 파일럿은 pending 초안이며 승인·게시 상태가 아니다.\n\n라이선스 경고: 사진·문서·영상·뉴스 클립은 출처별 이용조건과 인용 범위를 확인한 뒤 사용한다.' },
];

const CLAIMS = [
  { statement: '국회도서관 공식 프로필은 남인순 의원의 활동·약력 기록을 제공한다.', category: '프로필', occurredAt: '', source: 'profile', note: '프로필 사실 확인용. 현직 여부 판정 근거로 사용하지 않음.' },
  { statement: '국가법령정보센터 공식 페이지는 2020년 동물대체시험법 관련 의안 기록을 제공한다.', category: '법안', occurredAt: '2020', source: 'bill-2106793', note: '정확한 의안번호·조문·처리 결과는 원문 재확인 전 미확정.' },
  { statement: '국회도서관 공식 정책포럼 자료는 2023년 동물대체시험법 논의의 정책 맥락을 제공한다.', category: '정책포럼', occurredAt: '2023', source: 'forum-2023', note: '포럼은 법안 처리 결과와 동일한 근거가 아님.' },
  { statement: '국회 공식 회의록에는 2023-11-23 관련 회의 대목이 기록되어 있다.', category: '회의록', occurredAt: '2023-11-23', source: 'minutes-47812', note: '짧은 인용은 원문 앞뒤 문맥 확인 후 확정.' },
  { statement: '현재 확보한 원문만으로는 동물대체시험법 관련 법안의 정확한 조문과 처리 결과를 단정할 수 없다.', category: '검증', occurredAt: '2020–2023', source: 'bill-2106793', note: '공개 전 추가 검증 질문으로 유지.' },
];

export type PilotBuildResult = PilotCollectResult & { politicianId: number | null; recordIds: number[]; claimIds: number[]; cardCount: number };

function upsertPilotProjection(db: import('node:sqlite').DatabaseSync, personNodeId: number) {
  const existing = db.prepare('SELECT id FROM politicians WHERE naas_cd=? ORDER BY id LIMIT 1').get(NAM_INSUN_NAAS_CD) as { id: number } | undefined;
  const politicianId = existing?.id ?? Number(db.prepare('INSERT INTO politicians (name,role,color,naas_cd) VALUES (?,?,?,?)').run('남인순', '제22대 국회의원 · 파일럿 검토 중', '#d8e8e4', NAM_INSUN_NAAS_CD).lastInsertRowid);
  db.prepare('UPDATE politicians SET name=?,role=?,naas_cd=? WHERE id=?').run('남인순', '제22대 국회의원 · 파일럿 검토 중', NAM_INSUN_NAAS_CD, politicianId);
  db.prepare('INSERT OR IGNORE INTO politician_person_links (politician_id,person_node_id) VALUES (?,?)').run(politicianId, personNodeId);
  return politicianId;
}

function buildCards(politicianId: number, evidenceByKey: Map<string, { title: string; url: string; publisher: string; publishedAt: string; evidenceId: number }>, claimIds: number[]) {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE'); const recordIds: number[] = [];
  try {
    for (const card of CARDS) {
      const source = evidenceByKey.get(card.source); if (!source) continue;
      const current = db.prepare('SELECT id FROM records WHERE politician_id=? AND title=? LIMIT 1').get(politicianId, card.title) as { id: number } | undefined;
      const recordId = current?.id ?? Number(db.prepare('INSERT INTO records (politician_id,title,body,type,event_date,position_x,position_y,color) VALUES (?,?,?,?,?,?,?,?)').run(politicianId, card.title, card.body, card.type, card.eventDate, card.x, card.y, '#fffaf2').lastInsertRowid);
      db.prepare('UPDATE records SET body=?,type=?,event_date=?,position_x=?,position_y=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(card.body, card.type, card.eventDate, card.x, card.y, recordId);
      const sourceExists = db.prepare('SELECT id FROM sources WHERE record_id=? AND url=? LIMIT 1').get(recordId, source.url) as { id: number } | undefined;
      if (!sourceExists) db.prepare('INSERT INTO sources (record_id,title,url,publisher,published_at,license,verification_status,note) VALUES (?,?,?,?,?,?,?,?)').run(recordId, source.title, source.url, source.publisher, source.publishedAt, '공식 원문 이용조건 확인', '초안·미검토', `evidence_id=${source.evidenceId}; 파일럿 원문 수집 완료`);
      const claimId = claimIds[CLAIMS.findIndex((item) => item.source === card.source)];
      if (claimId) db.prepare('INSERT OR IGNORE INTO record_claims (record_id,claim_id) VALUES (?,?)').run(recordId, claimId);
      recordIds.push(recordId);
    }
    db.exec('COMMIT'); return recordIds;
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

export async function buildNamInsunPilot(options: PilotCollectOptions = {}): Promise<PilotBuildResult> {
  const collected = await collectNamInsunPilot(options);
  const db = openArchiveDb();
  let personNodeId: number | null = null; let politicianId: number | null = null;
  try {
    const person = db.prepare("SELECT id FROM graph_nodes WHERE kind='person' AND external_key=?").get(`NAAS_CD:${NAM_INSUN_NAAS_CD}`) as { id: number } | undefined;
    if (!person) throw new Error('남인순 Person 노드가 없습니다. 먼저 국회 의원정보 동기화를 실행해 주세요.');
    personNodeId = person.id;
    db.exec('BEGIN IMMEDIATE'); politicianId = upsertPilotProjection(db, personNodeId); db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
  const evidenceByKey = new Map(collected.successes.filter((item) => item.evidenceId && item.finalUrl && item.rawPath && item.contentHash).map((item) => [item.key, { title: item.title, url: item.url, publisher: item.publisher, publishedAt: item.publishedAt, evidenceId: item.evidenceId as number }]));
  const claimIds: number[] = [];
  for (const claim of CLAIMS) {
    const source = collected.successes.find((item) => item.key === claim.source); if (!source?.evidenceId) continue;
    claimIds.push(createDraftClaimWithEvidence({ statement: claim.statement, category: claim.category, subjectLabel: '남인순', subjectExternalKey: NAM_INSUN_NAAS_CD, occurredAt: claim.occurredAt, confidence: 0, evidence: [{ canonicalUrl: source.url, title: source.title, publisher: source.publisher, sourceType: source.sourceType, publishedAt: source.publishedAt, contentHash: source.contentHash, rawPath: source.rawPath, trustTier: 1, locator: '파일럿 manifest 원문', note: claim.note }] }));
  }
  const recordIds = politicianId ? buildCards(politicianId, evidenceByKey, claimIds) : [];
  return { ...collected, politicianId, recordIds, claimIds, cardCount: recordIds.length };
}
