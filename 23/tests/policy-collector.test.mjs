import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { collectAssemblyBills, collectLawmakingPolicies, collectComplaintSignals, parseAssemblyBillPage, parseLawmakingXml, parseComplaintPayload } = await import('../src/lib/policy-collector.ts');
const { DatabaseSync } = await import('node:sqlite');
const { openArchiveDb } = await import('../src/lib/db.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-collector-'));
  const dbPath = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_DB_PATH = dbPath;
  return { folder, dbPath };
}
function fixtureFetch(body, init = {}) { return async () => new Response(body, { headers: { 'content-type': 'application/xml' }, ...init }); }
function envClear(...keys) { const previous = new Map(keys.map((key) => [key, process.env[key]])); keys.forEach((key) => delete process.env[key]); return () => keys.forEach((key) => previous.get(key) === undefined ? delete process.env[key] : process.env[key] = previous.get(key)); }
const policyXml = '<response><item><ogLmPpSeq>123</ogLmPpSeq><lsNm>가상 아닌 테스트 입법예고</lsNm><status>입법예고</status><modDt>2026. 08. 20.</modDt></item></response>';
const lawmakingApiList13Xml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <ApiList13Vo>
    <ogLmPpSeq>240001</ogLmPpSeq><lsNm>주택임대차보호법 시행령 일부개정령안</lsNm>
    <lsClsNm>대통령령</lsClsNm><asndOfiNm>법무부</asndOfiNm><pntcNo>제2026-101호</pntcNo>
    <pntcDt>2026-08-20</pntcDt><stYd>2026-08-20</stYd><edYd>2026-09-30</edYd>
    <announceType>입법예고</announceType><mappingLbicId>2000000123456</mappingLbicId>
  </ApiList13Vo>
  <ApiList13Vo>
    <ogLmPpSeq>240002</ogLmPpSeq><lsNm>전기통신사업법 일부개정법률안</lsNm>
    <lsClsNm>법률</lsClsNm><asndOfiNm>과학기술정보통신부</asndOfiNm>
    <pntcDt>2026-08-21</pntcDt><announceType>행정예고</announceType>
  </ApiList13Vo>
</response>`;

test('official XML fixture persists staged policy evidence idempotently', async () => {
  const { folder, dbPath } = isolated();
  try {
    const first = await collectLawmakingPolicies({ fixtureBody: policyXml, rawRoot: path.join(folder, 'raw') });
    const second = await collectLawmakingPolicies({ fixtureBody: policyXml, rawRoot: path.join(folder, 'raw') });
    assert.equal(first.status, 'success'); assert.equal(second.status, 'success');
    const db = openArchiveDb(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE is_demo=0").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policy_status_events WHERE is_demo=0").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM topic_candidates WHERE is_demo=0").get().count, 1);
    assert.equal(db.prepare("SELECT score,eligible,verification_state FROM topic_candidates WHERE is_demo=0").get().score, 0);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM evidence_sources WHERE source_id=(SELECT id FROM source_registry WHERE slug='lawmaking')").get().count, 1);
    db.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('missing credentials create a blocked run without attempting a request', async () => {
  const { folder, dbPath } = isolated(); const restore = envClear('LAWMAKING_OC', 'EPEOPLE_API_URL', 'DATA_GO_KR_SERVICE_KEY');
  try {
    const result = await collectLawmakingPolicies();
    assert.equal(result.status, 'blocked');
    const complaint = await collectComplaintSignals();
    assert.equal(complaint.status, 'blocked');
    const db = new DatabaseSync(dbPath); assert.equal(db.prepare("SELECT status FROM ingest_runs WHERE source_id=(SELECT id FROM source_registry WHERE slug='lawmaking') ORDER BY id DESC LIMIT 1").get().status, 'blocked'); db.close();
  } finally { restore(); fs.rmSync(folder, { recursive: true, force: true }); }
});

test('official lawmaking redirect to opinion subdomain is allowed', async () => {
  const { folder, dbPath } = isolated(); process.env.LAWMAKING_OC = 'fixture-oc';
  const hosts = [];
  try {
    const fetchImpl = async (input) => {
      const url = new URL(String(input)); hosts.push(url.hostname);
      if (hosts.length === 1) return new Response('', { status: 302, headers: { location: 'https://opinion.lawmaking.go.kr/rest/ogLmPpMod.xml' } });
      return new Response(policyXml, { status: 200, headers: { 'content-type': 'application/xml' } });
    };
    const result = await collectLawmakingPolicies({ fetchImpl, rawRoot: path.join(folder, 'raw') });
    assert.equal(result.status, 'success');
    assert.equal(result.rowsStaged, 1);
    assert.deepEqual(hosts, ['www.lawmaking.go.kr', 'opinion.lawmaking.go.kr']);
    const db = new DatabaseSync(dbPath);
    const evidence = db.prepare("SELECT canonical_url FROM evidence_sources WHERE source_id=(SELECT id FROM source_registry WHERE slug='lawmaking')").get();
    assert.match(evidence.canonical_url, /^https:\/\/opinion\.lawmaking\.go\.kr\//);
    assert.doesNotMatch(evidence.canonical_url, /fixture-oc/);
    db.close();
  } finally { delete process.env.LAWMAKING_OC; fs.rmSync(folder, { recursive: true, force: true }); }
});

test('redirect, oversize, and HTML error payloads are rejected and never staged', async () => {
  const cases = [
    { fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://evil.example/steal' } }) },
    { fetchImpl: fixtureFetch('x'.repeat(3 * 1024 * 1024 + 1)) },
    { fetchImpl: fixtureFetch('<html><body>gateway error</body></html>') },
  ];
  for (const item of cases) {
    const { folder, dbPath } = isolated(); process.env.LAWMAKING_OC = 'fixture-oc';
    try {
      const result = await collectLawmakingPolicies({ fetchImpl: item.fetchImpl, rawRoot: path.join(folder, 'raw') });
      assert.equal(result.status, 'failed');
      const db = new DatabaseSync(dbPath); assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE is_demo=0").get().count, 0); db.close();
    } finally { delete process.env.LAWMAKING_OC; fs.rmSync(folder, { recursive: true, force: true }); }
  }
});

test('HTTP 200 XML API error retMsg is treated as a failed collection', async () => {
  const { folder, dbPath } = isolated(); process.env.LAWMAKING_OC = 'fixture-oc';
  const body = '<response><retCode>401</retCode><retMsg>인증되지 않은 요청입니다.</retMsg></response>';
  try {
    const result = await collectLawmakingPolicies({ fetchImpl: fixtureFetch(body), rawRoot: path.join(folder, 'raw') });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /API 오류 코드: 401/);
    assert.doesNotMatch(result.error, /fixture-oc/);
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE is_demo=0").get().count, 0);
    db.close();
  } finally { delete process.env.LAWMAKING_OC; fs.rmSync(folder, { recursive: true, force: true }); }
});

test('partial complaint fixture keeps valid rows and redacts service keys', async () => {
  const { folder, dbPath } = isolated(); process.env.EPEOPLE_API_URL = 'https://apis.data.go.kr/1140100/minAnalsInfoView5/minRisingKeyword5'; process.env.DATA_GO_KR_SERVICE_KEY = 'super-secret-key';
  const fixture = JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [{ date: '2026082012', keyword: '실제 민원 후보', df: 9, rank: 1 }, { date: '2026082012', rank: 2 }] } } } });
  try {
    const result = await collectComplaintSignals({ fixtureBody: fixture, rawRoot: path.join(folder, 'raw') });
    assert.equal(result.status, 'partial'); assert.equal(result.rowsStaged, 1);
    const db = openArchiveDb(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM complaint_signals WHERE is_demo=0").get().count, 1);
    const run = db.prepare("SELECT error,metadata_json FROM ingest_runs WHERE source_id=(SELECT id FROM source_registry WHERE slug='epeople-complaints') ORDER BY id DESC LIMIT 1").get();
    assert.ok(!String(run.error).includes('super-secret-key')); assert.ok(!String(run.metadata_json).includes('super-secret-key'));
    db.close();
  } finally { delete process.env.EPEOPLE_API_URL; delete process.env.DATA_GO_KR_SERVICE_KEY; fs.rmSync(folder, { recursive: true, force: true }); }
});

test('complaint-policy links remain POSSIBLY_AFFECTED_BY and never confirmed', async () => {
  const { folder, dbPath } = isolated();
  try {
    await collectLawmakingPolicies({ fixtureBody: policyXml, rawRoot: path.join(folder, 'raw') });
    const fixture = JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [{ date: '2026082012', keyword: '정책 관련 민원', df: 11, rank: 1, policyExternalKey: 'lawmaking:123' }] } } } });
    await collectComplaintSignals({ fixtureBody: fixture, rawRoot: path.join(folder, 'raw') });
    const db = new DatabaseSync(dbPath);
    assert.ok(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='POSSIBLY_AFFECTED_BY'").get().count >= 1);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='CONFIRMED_IMPACT'").get().count, 0);
    db.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('fixture parsers preserve conservative stage semantics', () => {
  assert.equal(parseLawmakingXml('<root><item><lsNm>x</lsNm><status>입법예고</status></item></root>')[0].stage, 'proposed');
  assert.equal(parseLawmakingXml('<root><item><lsNm>x</lsNm><status>공포</status></item></root>')[0].stage, 'promulgated');
  assert.equal(parseLawmakingXml('<root><item><lsNm>x</lsNm><status>폐지</status></item></root>')[0].stage, 'repealed');
  assert.equal(parseComplaintPayload(JSON.stringify({ items: [{ keyword: 'x', df: 1 }] }))[0].keyword, 'x');
});

test('ApiList13Vo rows map official lawmaking fields and keep sibling rows', () => {
  const rows = parseLawmakingXml(lawmakingApiList13Xml);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.externalKey), ['240001', '240002']);
  assert.equal(rows[0].title, '주택임대차보호법 시행령 일부개정령안');
  assert.equal(rows[0].date, '2026-08-20');
  assert.match(rows[0].summary, /대통령령/);
  assert.match(rows[0].summary, /법무부/);
  assert.match(rows[0].summary, /입법예고/);
  assert.equal(rows[1].stage, 'proposed');
  const wrapped = parseLawmakingXml('<response><ApiList13Vo><ApiList13Vo><ogLmPpSeq>240003</ogLmPpSeq><lsNm>중첩 컨테이너 행</lsNm><pntcDt>2026-08-22</pntcDt></ApiList13Vo></ApiList13Vo></response>');
  assert.deepEqual(wrapped.map((row) => row.externalKey), ['240003']);
});

test('assembly bills fixture persists BILL_ID idempotently and never infers 시행', async () => {
  const { folder, dbPath } = isolated();
  const fixture = JSON.stringify({ RESULT: { CODE: 'INFO-000' }, TVBPMBILL11: [{ head: [{ list_total_count: '1' }] }, { row: [{ BILL_ID: 'B-1', BILL_NO: '220001', BILL_NAME: '청년 월세 지원법안', PROPOSER: '홍길동 의원 외 2인', PROPOSER_KIND: '의원', PROPOSE_DT: '2026-08-20', CURR_COMMITTEE: '기획재정위원회', COMMITTEE_DT: '2026-08-21', PROC_DT: '', PROC_RESULT_CD: '', RST_PROPOSER: '홍길동', LINK_URL: 'https://pal.assembly.go.kr/bill/B-1' }] }] });
  try {
    const first = await collectAssemblyBills({ fixtureBody: fixture, rawRoot: path.join(folder, 'raw') });
    const second = await collectAssemblyBills({ fixtureBody: fixture, rawRoot: path.join(folder, 'raw') });
    assert.equal(first.status, 'success'); assert.equal(second.status, 'success');
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE external_key='assembly-bill:B-1'").get().count, 1);
    assert.equal(db.prepare("SELECT current_stage,bill_id,bill_no,raw_fields_json FROM policies WHERE external_key='assembly-bill:B-1'").get().current_stage, 'committee');
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policy_status_events WHERE policy_id=(SELECT id FROM policies WHERE external_key='assembly-bill:B-1')").get().count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='CONFIRMED_IMPACT'").get().count, 0);
    db.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('assembly accepts its valid JSON envelope despite the official text/html header', async () => {
  const { folder, dbPath } = isolated();
  const restore = envClear('ASSEMBLY_API_KEY'); process.env.ASSEMBLY_API_KEY = 'fixture-key';
  const fixture = JSON.stringify({ RESULT: { CODE: 'INFO-000' }, TVBPMBILL11: [{ head: [{ list_total_count: '1' }] }, { row: [{ BILL_ID: 'B-HTML-HEADER', BILL_NO: '220003', BILL_NAME: '헤더 예외 검증 법안', PROPOSE_DT: '2026-08-20' }] }] });
  try {
    const fetchImpl = async () => new Response(fixture, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
    const result = await collectAssemblyBills({ fetchImpl, rawRoot: path.join(folder, 'raw') });
    assert.equal(result.status, 'success'); assert.equal(result.rowsStaged, 1);
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE external_key='assembly-bill:B-HTML-HEADER'").get().count, 1);
    db.close();
  } finally { restore(); fs.rmSync(folder, { recursive: true, force: true }); }
});

test('assembly still rejects a real HTML page with text/html header', async () => {
  const { folder, dbPath } = isolated();
  const restore = envClear('ASSEMBLY_API_KEY'); process.env.ASSEMBLY_API_KEY = 'fixture-key';
  try {
    const fetchImpl = async () => new Response('<html><body>gateway error</body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
    const result = await collectAssemblyBills({ fetchImpl, rawRoot: path.join(folder, 'raw') });
    assert.equal(result.status, 'failed'); assert.match(result.error, /허용되지 않은 응답 형식/);
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE is_demo=0").get().count, 0);
    db.close();
  } finally { restore(); fs.rmSync(folder, { recursive: true, force: true }); }
});

test('assembly bill proposer ambiguity is staged without PROPOSED_BY edge', async () => {
  const { folder, dbPath } = isolated();
  const fixture = JSON.stringify({ RESULT: { CODE: 'INFO-000' }, TVBPMBILL11: [{ head: [{ list_total_count: '1' }] }, { row: [{ BILL_ID: 'B-AMB', BILL_NO: '220002', BILL_NAME: '동명이인 법안', RST_PROPOSER: '동명이인', PROPOSE_DT: '2026-08-20', PROC_RESULT_CD: '' }] }] });
  try {
    const db = openArchiveDb(dbPath);
    for (const key of ['A', 'B']) {
      const node = Number(db.prepare("INSERT INTO graph_nodes (kind,external_key,label) VALUES ('person',?,?)").run(`person:${key}`, '동명이인').lastInsertRowid);
      db.prepare("INSERT INTO assembly_memberships (person_node_id,assembly_term,status,naas_cd) VALUES (?, '22', 'staged', ?)").run(node, `N-${key}`);
    }
    db.close();
    await collectAssemblyBills({ fixtureBody: fixture, rawRoot: path.join(folder, 'raw') });
    const checked = new DatabaseSync(dbPath);
    const match = checked.prepare("SELECT resolution FROM proposer_matches WHERE policy_id=(SELECT id FROM policies WHERE external_key='assembly-bill:B-AMB') AND proposer_name='동명이인'").get();
    assert.equal(match?.resolution, 'needs_review');
    assert.equal(checked.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='PROPOSED_BY'").get().count, 0); checked.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
