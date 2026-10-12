import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { openArchiveDb, GRAPH_SCHEMA_VERSION } = await import('../src/lib/db.ts');
const { syncDigitalCulture } = await import('../src/lib/digital-culture.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'digital-culture-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite'); process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}
function cleanup(folder) { delete process.env.ARCHIVE_DB_PATH; delete process.env.ARCHIVE_RAW_ROOT; delete process.env.DATA_GO_KR_SERVICE_KEY; try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (error) { if (error?.code !== 'EPERM') throw error; } }
function jsonResponse(value, headers = { 'content-type': 'application/json' }) { return new Response(JSON.stringify(value), { headers }); }
function item(id = 'dc-1') { return { clrcsId: id, clrcsNm: `문화자원 ${id}`, clrcsExplnCn: '설명', thumbFileUrl: 'https://evil.example/thumb.jpg', instNm: '기관', cpyrTypeNm: '확인 필요', dataTypeRootCtgryNm: '문화유산', dataTypeCtgryNm: '유물', clrcsLclsfNm: '역사', clrcsMclsfNm: '유물', dwnldCnt: '12', lastMdfcnDt: '2026-01-01' }; }

test('missing service key is blocked without making a request', async () => {
  const folder = isolated(); let calls = 0;
  try { const result = await syncDigitalCulture({ fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } }); assert.equal(result.status, 'blocked'); assert.equal(calls, 0); } finally { cleanup(folder); }
});

test('accepts both response envelope styles and upserts without storing the API key', async () => {
  const folder = isolated(); process.env.DATA_GO_KR_SERVICE_KEY = 'fixture-secret';
  try {
    let calls = 0; const fetchImpl = async (input) => { const url = String(input); assert.match(url, /serviceKey=fixture-secret/); calls += 1; const payload = calls === 1 ? { header: { resultCode: '00' }, body: { items: { item: [item('dc-1'), item('dc-2')] } } } : { response: { header: { resultCode: '00' }, body: { items: { item: item('dc-1') } } } }; return jsonResponse(payload); };
    const first = await syncDigitalCulture({ numOfRows: 10, fetchImpl }); assert.equal(first.status, 'success'); assert.equal(first.rowsSeen, 2); assert.equal(first.rowsStaged, 2);
    const second = await syncDigitalCulture({ numOfRows: 10, fetchImpl }); assert.equal(second.status, 'success'); assert.equal(second.rowsSeen, 1); assert.equal(second.rowsStaged, 1); assert.equal(calls, 2);
    const db = openArchiveDb(); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='cultural_resource'").get().count, 2); const row = db.prepare("SELECT * FROM graph_nodes WHERE external_key='digital-culture:dc-1'").get(); const properties = JSON.parse(row.properties_json); assert.equal(properties.thumbFileUrl, 'https://evil.example/thumb.jpg'); assert.deepEqual(properties.categories.slice(0, 2), ['문화유산', '유물']); assert.equal(properties.sourceCatalogUrl, 'https://www.data.go.kr/data/15139738/openapi.do'); assert.doesNotMatch(row.properties_json, /fixture-secret/); db.close();
  } finally { cleanup(folder); }
});

test('retries a 503 once, then returns a truthful bounded failure', async () => {
  const folder = isolated(); process.env.DATA_GO_KR_SERVICE_KEY = 'fixture-secret';
  try { let calls = 0; const result = await syncDigitalCulture({ fetchImpl: async () => { calls += 1; return new Response('temporarily unavailable', { status: 503, headers: { 'content-type': 'application/json' } }); } }); assert.equal(result.status, 'failed'); assert.equal(result.error, 'service_timeout'); assert.equal(calls, 2); } finally { cleanup(folder); }
});

test('rejects hostile redirect, non-JSON MIME, and oversized bodies', async () => {
  const folder = isolated(); process.env.DATA_GO_KR_SERVICE_KEY = 'fixture-secret';
  try {
    const redirect = await syncDigitalCulture({ fetchImpl: async () => { const response = jsonResponse({ header: { resultCode: '00' }, body: { items: { item: [] } } }); Object.defineProperty(response, 'url', { value: 'https://evil.example/redirect' }); return response; } }); assert.equal(redirect.error, 'redirect_not_allowed');
    const mime = await syncDigitalCulture({ fetchImpl: async () => jsonResponse('<html>bad</html>', { 'content-type': 'text/html' }) }); assert.equal(mime.error, 'invalid_mime');
    const oversize = await syncDigitalCulture({ fetchImpl: async () => new Response('x', { headers: { 'content-type': 'application/json', 'content-length': String(6 * 1024 * 1024) } }) }); assert.equal(oversize.error, 'oversize');
  } finally { cleanup(folder); }
});

test('upgrades a v6 graph CHECK atomically while preserving nodes and edges', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'digital-culture-v6-')); const dbPath = path.join(folder, 'archive.sqlite');
  try {
    const old = new DatabaseSync(dbPath); old.exec("PRAGMA foreign_keys=ON; CREATE TABLE graph_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('person','other')), external_key TEXT, label TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}', valid_from TEXT, valid_to TEXT, as_of TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(kind,external_key)); CREATE INDEX idx_graph_nodes_kind ON graph_nodes(kind); CREATE INDEX idx_graph_nodes_external_key ON graph_nodes(external_key); CREATE TABLE graph_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, from_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, to_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, relation TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}', valid_from TEXT, valid_to TEXT, as_of TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(from_node_id,to_node_id,relation)); INSERT INTO graph_nodes(kind,external_key,label) VALUES ('person','old:1','기존 노드'),('other','old:2','연결 노드'); INSERT INTO graph_edges(from_node_id,to_node_id,relation) VALUES (1,2,'RELATED'); PRAGMA user_version=6;"); old.close();
    let db = openArchiveDb(dbPath); assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION); assert.equal(db.prepare('SELECT label FROM graph_nodes WHERE id=1').get().label, '기존 노드'); assert.equal(db.prepare('SELECT relation FROM graph_edges').get().relation, 'RELATED'); db.prepare("INSERT INTO graph_nodes(kind,external_key,label) VALUES ('cultural_resource','digital-culture:test','문화자원')").run(); db.close();
    db = openArchiveDb(dbPath); assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='cultural_resource'").get().count, 1); assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='RELATED'").get().count, 1); assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='graph_nodes_v6'").get(), undefined); db.close();
  } finally { try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (error) { if (error?.code !== 'EPERM') throw error; } }
});
