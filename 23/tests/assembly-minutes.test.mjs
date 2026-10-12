import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { openArchiveDb, GRAPH_SCHEMA_VERSION } = await import('../src/lib/db.ts');
const { syncAssemblyMinutes } = await import('../src/lib/assembly-minutes.ts');

function isolated() { const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'assembly-minutes-')); process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite'); process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw'); return folder; }
function cleanup(folder) { delete process.env.ARCHIVE_DB_PATH; delete process.env.ARCHIVE_RAW_ROOT; delete process.env.ASSEMBLY_API_KEY; try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (error) { if (error?.code !== 'EPERM') throw error; } }
function jsonResponse(value) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
function htmlResponse(value, headers = { 'content-type': 'text/html' }) { return new Response(value, { headers }); }
const apiEnvelope = { nzbyfwhwaoanttzje: [{ head: [{ list_total_count: 1 }] }, { row: [{ CONF_ID: '47812', CONFER_NUM: '47812', TITLE: '본회의 회의록', DAE_NUM: '22', CONF_DATE: '2026-01-02', COMM_NAME: '본회의', DEPT_CD: 'A' }] }] };
const summaryHtml = '<html><body><a href="/assembly/viewer/minutes/xml.do?id=47812&item=item1&type=summary">item1</a><a href="/assembly/viewer/minutes/xml.do?id=47812&item=item2&type=summary">item2</a></body></html>';
const viewHtml = '<html><body><div class="spk_mem" data-mem_id="M-1" data-name="홍길동" data-pos="국회의원"><span class="spk_sub" id="speech-1">첫 &amp; 발언입니다.</span><span class="spk_sub" id="speech-2">두 번째 발언입니다.</span></div></body></html>';
const selectorSummaryHtml = '<html><body><a href="?item=item89">query fallback 89</a><li id="head_item1"><a class="move" data-target="#item1">actual item 1</a></li></body></html>';
const selectorViewHtml = '<html><body><div class="speakerMem" data-name="가짜 UI"><span>선택 UI 텍스트</span></div><div class="speaker spk_mem" data-mem_id="M-9" data-name="실제 발언자" data-pos="의원"><input class="speakerMem" data-name="가짜 UI"><div class="talk"><span class="spk_sub" id="spk_sub9-1">실제 발언 텍스트</span></div></div></body></html>';

test('missing assembly key is blocked without fetch', async () => { const folder = isolated(); let calls = 0; try { const result = await syncAssemblyMinutes({ delayMs: 0, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } }); assert.equal(result.status, 'blocked'); assert.equal(calls, 0); } finally { cleanup(folder); } });

test('collects summary items and speeches, stores raw/evidence/graph, and is idempotent', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    let calls = 0; const fetchImpl = async (input) => { const url = String(input); calls += 1; if (url.startsWith('https://open.assembly.go.kr/')) { assert.match(url, /DAE_NUM=22/); assert.match(url, /CONF_DATE=2026/); assert.match(url, /KEY=fixture-secret/); return jsonResponse(apiEnvelope); } if (url.includes('type=summary')) return htmlResponse(summaryHtml); return htmlResponse(url.includes('item2') ? viewHtml.replace('첫', '둘') : viewHtml); };
    let db = openArchiveDb(); db.prepare("INSERT INTO graph_nodes(kind,external_key,label) VALUES ('person','person:test','홍길동')").run(); db.close();
    const first = await syncAssemblyMinutes({ kind: 'plenary', year: 2026, meetingLimit: 1, itemLimit: 2, speechesLimit: 4, delayMs: 0, fetchImpl }); assert.equal(first.status, 'success'); assert.equal(first.speeches, 4); assert.equal(calls, 4);
    db = openArchiveDb(); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='meeting'").get().count, 1); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='speech'").get().count, 4); assert.equal(db.prepare("SELECT COUNT(*) count FROM evidence_sources WHERE source_type='html'").get().count, 2); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='POSSIBLY_SPOKEN_BY'").get().count, 4); const speech = db.prepare("SELECT properties_json FROM graph_nodes WHERE kind='speech' LIMIT 1").get(); assert.equal(JSON.parse(speech.properties_json).text, '첫 & 발언입니다.'); assert.doesNotMatch(JSON.stringify(speech), /fixture-secret/); db.close();
    const rawFiles = fs.readdirSync(path.join(folder, 'raw', 'assembly-minutes', String(first.runId))); assert.ok(rawFiles.includes('summary-api.json')); assert.ok(rawFiles.some((name) => name.endsWith('.html')));
    const second = await syncAssemblyMinutes({ kind: 'plenary', year: 2026, meetingLimit: 1, itemLimit: 1, speechesLimit: 4, delayMs: 0, fetchImpl }); assert.equal(second.status, 'success'); db = openArchiveDb(); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='speech'").get().count, 4); assert.equal(db.prepare("SELECT COUNT(*) count FROM evidence_sources WHERE source_type='html'").get().count, 2); db.close();
  } finally { cleanup(folder); }
});

test('does not link a speech when two people share the same label', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    let db = openArchiveDb();
    db.prepare("INSERT INTO graph_nodes(kind,external_key,label) VALUES ('person','person:one','홍길동'),('person','person:two','홍길동')").run();
    db.close();
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.startsWith('https://open.assembly.go.kr/')) return jsonResponse(apiEnvelope);
      if (url.includes('type=summary')) return htmlResponse(summaryHtml);
      return htmlResponse(viewHtml);
    };
    const result = await syncAssemblyMinutes({ kind: 'plenary', year: 2026, meetingLimit: 1, itemLimit: 1, speechesLimit: 1, delayMs: 0, fetchImpl });
    assert.equal(result.status, 'success');
    db = openArchiveDb();
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='POSSIBLY_SPOKEN_BY'").get().count, 0);
    db.close();
  } finally { cleanup(folder); }
});

test('uses selector item ids before query fallbacks and stores only exact spk_sub utterances', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    const fetched = [];
    const fetchImpl = async (input) => {
      const url = String(input); fetched.push(url);
      if (url.startsWith('https://open.assembly.go.kr/')) return jsonResponse(apiEnvelope);
      if (url.includes('type=summary')) return htmlResponse(selectorSummaryHtml);
      assert.match(url, /[?&]item=item1(?:&|$)/);
      assert.doesNotMatch(url, /item=item89/);
      return htmlResponse(selectorViewHtml);
    };
    const result = await syncAssemblyMinutes({ meetingLimit: 1, itemLimit: 1, speechesLimit: 5, delayMs: 0, fetchImpl });
    assert.equal(result.status, 'success');
    assert.equal(result.speeches, 1);
    const db = openArchiveDb();
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='speech'").get().count, 1);
    const speech = db.prepare("SELECT label,properties_json FROM graph_nodes WHERE kind='speech'").get();
    assert.equal(speech.label, '실제 발언자');
    assert.equal(JSON.parse(speech.properties_json).text, '실제 발언 텍스트');
    db.close();
    assert.ok(fetched.some((url) => url.includes('item=item1')));
    assert.ok(!fetched.some((url) => url.includes('item=item89')));
  } finally { cleanup(folder); }
});

test('accepts official HTML-labelled keyed JSON but rejects actual HTML', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.startsWith('https://open.assembly.go.kr/')) return new Response(JSON.stringify(apiEnvelope), { headers: { 'content-type': 'text/html;charset=UTF-8' } });
      if (url.includes('type=summary')) return htmlResponse(summaryHtml);
      return htmlResponse(viewHtml);
    };
    const accepted = await syncAssemblyMinutes({ meetingLimit: 1, itemLimit: 1, speechesLimit: 1, delayMs: 0, fetchImpl });
    assert.equal(accepted.status, 'success');
  } finally { cleanup(folder); }

  const rejectedFolder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    const rejected = await syncAssemblyMinutes({ meetingLimit: 1, delayMs: 0, fetchImpl: async (input) => String(input).startsWith('https://open.assembly.go.kr/') ? htmlResponse('<html><body>not JSON</body></html>') : htmlResponse(viewHtml) });
    assert.equal(rejected.status, 'failed');
    assert.equal(rejected.error, 'invalid_mime');
  } finally { cleanup(rejectedFolder); }
});

test('accepts INFO-000 and rejects ERROR result codes', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    const fetchWith = (payload) => async (input) => {
      const url = String(input);
      if (url.startsWith('https://open.assembly.go.kr/')) return jsonResponse(payload);
      if (url.includes('type=summary')) return htmlResponse(summaryHtml);
      return htmlResponse(viewHtml);
    };
    const accepted = await syncAssemblyMinutes({ meetingLimit: 1, itemLimit: 1, speechesLimit: 1, delayMs: 0, fetchImpl: fetchWith({ ...apiEnvelope, RESULT: { CODE: 'INFO-000' } }) });
    assert.equal(accepted.status, 'success');
    const rejected = await syncAssemblyMinutes({ meetingLimit: 1, delayMs: 0, fetchImpl: fetchWith({ ...apiEnvelope, RESULT: { CODE: 'ERROR-290' } }) });
    assert.equal(rejected.status, 'failed');
    assert.equal(rejected.error, 'api_result_ERROR-290');
  } finally { cleanup(folder); }
});

test('bounds items and speeches and rejects missing markers, hostile redirect, MIME, and oversize', async () => {
  const folder = isolated(); process.env.ASSEMBLY_API_KEY = 'fixture-secret';
  try {
    const many = '<html>' + Array.from({ length: 20 }, (_, i) => `<a href="?item=item${i + 1}">x</a>`).join('') + '</html>';
    const bounded = await syncAssemblyMinutes({ itemLimit: 10, speechesLimit: 1, delayMs: 0, fetchImpl: async (input) => { const url = String(input); if (url.startsWith('https://open.assembly.go.kr/')) return jsonResponse(apiEnvelope); if (url.includes('type=summary')) return htmlResponse(many); return htmlResponse(viewHtml); } }); assert.equal(bounded.speeches, 1); assert.equal(bounded.status, 'success');
    const missing = await syncAssemblyMinutes({ delayMs: 0, fetchImpl: async (input) => String(input).startsWith('https://open.assembly.go.kr/') ? jsonResponse(apiEnvelope) : htmlResponse('<html><body>no speaker</body></html>') }); assert.equal(missing.status, 'failed'); assert.equal(missing.error, '1건 처리 실패');
    const mime = await syncAssemblyMinutes({ delayMs: 0, fetchImpl: async (input) => String(input).startsWith('https://open.assembly.go.kr/') ? jsonResponse(apiEnvelope) : htmlResponse('bad', { 'content-type': 'application/json' }) }); assert.equal(mime.status, 'failed');
    const hostile = await syncAssemblyMinutes({ delayMs: 0, fetchImpl: async (input) => { const url = String(input); const response = url.startsWith('https://open.assembly.go.kr/') ? jsonResponse(apiEnvelope) : htmlResponse(summaryHtml); Object.defineProperty(response, 'url', { value: 'https://evil.example/redirect' }); return response; } }); assert.equal(hostile.status, 'failed');
    const oversize = await syncAssemblyMinutes({ delayMs: 0, fetchImpl: async (input) => { const url = String(input); if (url.startsWith('https://open.assembly.go.kr/')) return jsonResponse(apiEnvelope); return new Response('x', { headers: { 'content-type': 'text/html', 'content-length': String(9 * 1024 * 1024) } }); } }); assert.equal(oversize.status, 'failed');
  } finally { cleanup(folder); }
});

test('upgrades v7 graph CHECK to speech kind while preserving existing edge data', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'assembly-minutes-v7-')); const dbPath = path.join(folder, 'archive.sqlite');
  try {
    const old = new DatabaseSync(dbPath); old.exec("PRAGMA foreign_keys=ON; CREATE TABLE graph_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('person','cultural_resource','other')), external_key TEXT, label TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}', valid_from TEXT, valid_to TEXT, as_of TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(kind,external_key)); CREATE INDEX idx_graph_nodes_kind ON graph_nodes(kind); CREATE INDEX idx_graph_nodes_external_key ON graph_nodes(external_key); CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, from_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, to_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, relation TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}', valid_from TEXT, valid_to TEXT, as_of TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(from_node_id,to_node_id,relation)); INSERT INTO graph_nodes(kind,external_key,label) VALUES ('person','old','기존'); INSERT INTO graph_edges(from_node_id,to_node_id,relation) VALUES (1,1,'SELF'); PRAGMA user_version=7;"); old.close();
    let db = openArchiveDb(dbPath); assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION); db.prepare("INSERT INTO graph_nodes(kind,external_key,label) VALUES ('speech','speech:test','발언')").run(); assert.equal(db.prepare("SELECT relation FROM graph_edges WHERE relation='SELF'").get().relation, 'SELF'); db.close(); db = openArchiveDb(dbPath); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='speech'").get().count, 1); db.close();
  } finally { try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (error) { if (error?.code !== 'EPERM') throw error; } }
});
