import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { stageRosterRows } = await import('../src/lib/roster.ts');
const { buildNamInsunPilot, collectNamInsunPilot, NAM_INSUN_MANIFEST } = await import('../src/lib/pilot.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nam-insun-pilot-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  stageRosterRows([{ naasCd: '04T3751T', name: '남인순', party: '테스트정당', electedName: '송파구병', electedDivision: '', committee: '', belongingCommittee: '', district: '송파구병', picture: '', asOf: new Date().toISOString(), raw: { NAAS_CD: '04T3751T', NAAS_NM: '남인순', GTELT_ERACO: '제22대 국회의원' } }]);
  return folder;
}

function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH;
  delete process.env.ARCHIVE_RAW_ROOT;
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (error) { if (error?.code !== 'EPERM') throw error; }
}

function fixtureFetch(failing = new Set()) {
  return async (input, init = {}) => {
    const url = String(input);
    const item = NAM_INSUN_MANIFEST.find((candidate) => url.startsWith(candidate.url));
    if (item && failing.has(item.key)) return new Response('failure', { status: 503, headers: { 'content-type': 'text/html' } });
    const marker = item?.requiredText?.[0] ?? item?.key ?? 'fixture';
    return new Response(`<html><title>${item?.key ?? 'fixture'}</title><body>${marker}</body></html>`, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
  };
}

test('collects four official sources with atomic raw files and provenance', async () => {
  const folder = isolated();
  try {
    const seenInit = [];
    const result = await collectNamInsunPilot({ fetchImpl: async (input, init) => { seenInit.push(init); return fixtureFetch()(input, init); } });
    assert.equal(result.status, 'success'); assert.equal(result.rowsSeen, 4); assert.equal(result.rowsStaged, 4); assert.equal(result.failures.length, 0);
    assert.equal(seenInit.every((init) => init.headers['user-agent'] && init.headers.accept && init.redirect === 'manual'), true);
    for (const item of result.successes) { assert.ok(item.contentHash); assert.ok(item.rawPath); assert.equal(fs.existsSync(item.rawPath), true); assert.equal(path.basename(item.rawPath).startsWith('.tmp-'), false); }
    const db = openArchiveDb();
    assert.equal(db.prepare('SELECT COUNT(*) count FROM evidence_sources WHERE source_id=(SELECT id FROM source_registry WHERE slug=?)').get('pilot-nam-insun').count, 4);
    const run = db.prepare('SELECT status,rows_seen,rows_staged,metadata_json FROM ingest_runs ORDER BY id DESC LIMIT 1').get();
    assert.equal(run.status, 'success'); assert.equal(run.rows_seen, 4); assert.equal(run.rows_staged, 4); assert.equal(JSON.parse(run.metadata_json).sources.length, 4); db.close();
  } finally { cleanup(folder); }
});

test('rejects untrusted redirect, MIME, and oversized response', async () => {
  const folder = isolated();
  try {
    const manifest = [{ key: 'bad', title: 'bad', url: 'https://ampos.nanet.go.kr/bad', publisher: '공식', sourceType: 'html', publishedAt: '' }];
    const redirect = await collectNamInsunPilot({ manifest, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/bad' } }) });
    assert.equal(redirect.failures[0].error.code, 'untrusted_host');
    const mime = await collectNamInsunPilot({ manifest, fetchImpl: async () => new Response('pdf', { status: 200, headers: { 'content-type': 'application/pdf' } }) });
    assert.equal(mime.failures[0].error.code, 'invalid_mime');
    const oversize = await collectNamInsunPilot({ manifest, maxBytes: 2, fetchImpl: async () => new Response('large', { status: 200, headers: { 'content-type': 'text/html' } }) });
    assert.equal(oversize.failures[0].error.code, 'oversize');
    const rawRoot = path.join(folder, 'raw');
    assert.equal(fs.existsSync(rawRoot) ? fs.readdirSync(rawRoot, { recursive: true }).some((item) => String(item).includes('.tmp-')) : false, false);
  } finally { cleanup(folder); }
});

test('rejects a 200 HTML error page when its official marker is missing', async () => {
  const folder = isolated();
  try {
    const item = NAM_INSUN_MANIFEST.find((candidate) => candidate.key === 'minutes-47812');
    const result = await collectNamInsunPilot({ manifest: [item], fetchImpl: async () => new Response('<html>로그인 오류</html>', { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }) });
    assert.equal(result.status, 'failed'); assert.equal(result.failures[0].error.code, 'required_text_missing');
    const db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM evidence_sources').get().count, 0); db.close();
  } finally { cleanup(folder); }
});

test('records partial failures truthfully', async () => {
  const folder = isolated();
  try {
    const result = await collectNamInsunPilot({ fetchImpl: fixtureFetch(new Set(['minutes-47812'])) });
    assert.equal(result.status, 'failed'); assert.equal(result.rowsSeen, 4); assert.equal(result.rowsStaged, 3); assert.equal(result.successes.length, 3); assert.equal(result.failures[0].key, 'minutes-47812');
    const db = openArchiveDb(); const run = db.prepare('SELECT status,rows_staged FROM ingest_runs ORDER BY id DESC LIMIT 1').get(); assert.equal(run.status, 'failed'); assert.equal(run.rows_staged, 3); db.close();
  } finally { cleanup(folder); }
});

test('builds seven idempotent storyboard cards and pending claims without changing membership', async () => {
  const folder = isolated();
  try {
    const partial = await collectNamInsunPilot({ fetchImpl: fixtureFetch(new Set(['minutes-47812'])) });
    assert.equal(partial.rowsStaged, 3);
    const first = await buildNamInsunPilot({ fetchImpl: fixtureFetch() });
    assert.equal(first.cardCount, 7); assert.equal(first.claimIds.length, 5); assert.equal(first.politicianId > 0, true);
    const second = await buildNamInsunPilot({ fetchImpl: fixtureFetch() });
    assert.equal(second.cardCount, 7);
    const db = openArchiveDb();
    assert.equal(db.prepare('SELECT COUNT(*) count FROM evidence_sources WHERE source_id=(SELECT id FROM source_registry WHERE slug=?)').get('pilot-nam-insun').count, 4);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM records WHERE politician_id=?').get(first.politicianId).count, 7);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM claims c JOIN graph_nodes p ON p.id=c.subject_node_id WHERE p.external_key='NAAS_CD:04T3751T'").get().count, 5);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM review_queue WHERE entity_type='claim' AND state='pending'").get().count, 5);
    assert.equal(db.prepare("SELECT status FROM assembly_memberships WHERE naas_cd='04T3751T'").get().status, 'staged');
    assert.equal(db.prepare('SELECT COUNT(*) count FROM sources WHERE record_id IN (SELECT id FROM records WHERE politician_id=?)').get(first.politicianId).count, 7);
    db.close();
  } finally { cleanup(folder); }
});
