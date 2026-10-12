import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { openArchiveDb, GRAPH_SCHEMA_VERSION } = await import('../src/lib/db.ts');
const roster = await import('../src/lib/roster.ts');
const graph = await import('../src/lib/graph.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-phase1-'));
  const dbPath = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_DB_PATH = dbPath;
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return { folder, dbPath };
}
function cleanup(folder) { delete process.env.ARCHIVE_DB_PATH; delete process.env.ARCHIVE_RAW_ROOT; fs.rmSync(folder, { recursive: true, force: true }); }
function withArchiveDb(dbPath, check) {
  const db = openArchiveDb(dbPath);
  try { return check(db); }
  finally { db.close(); }
}

test('graph migration is idempotent, seeds sources, and preserves legacy storyboard', () => {
  const { folder, dbPath } = isolated();
  try {
    const legacy = withArchiveDb(dbPath, (db) => {
      const recordCount = Number(db.prepare('SELECT COUNT(*) count FROM records').get().count);
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION);
      assert.equal(db.prepare('SELECT COUNT(*) count FROM source_registry').get().count, 19);
      return recordCount;
    });
    withArchiveDb(dbPath, (db) => {
      assert.equal(db.prepare('SELECT COUNT(*) count FROM records').get().count, legacy);
      assert.equal(db.prepare('SELECT COUNT(*) count FROM source_registry').get().count, 19);
    });
  } finally { cleanup(folder); }
});

test('stale user_version=2 databases are repaired before review queries run', async () => {
  const { folder, dbPath } = isolated();
  try {
    let db = openArchiveDb(dbPath);
    for (const [table, column] of [['politicians', 'naas_cd'], ['assembly_memberships', 'committee'], ['assembly_memberships', 'verified_at'], ['assembly_memberships', 'verification_expires_at'], ['evidence_sources', 'source_id'], ['evidence_sources', 'raw_path'], ['evidence_sources', 'page_index']]) {
      try { db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`); } catch { /* already absent or SQLite build without DROP COLUMN */ }
    }
    db.exec('PRAGMA user_version=2'); db.close();
    db = openArchiveDb(dbPath);
    const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
    assert.ok(columns('politicians').includes('naas_cd')); assert.ok(columns('assembly_memberships').includes('verification_expires_at')); assert.ok(columns('assembly_memberships').includes('verified_at')); assert.ok(columns('assembly_memberships').includes('committee')); assert.ok(columns('evidence_sources').includes('source_id')); assert.ok(columns('evidence_sources').includes('raw_path')); assert.ok(columns('evidence_sources').includes('page_index')); assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assembly_membership_snapshots'").get()); assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION); db.close();
    assert.deepEqual((await import('../src/lib/graph.ts')).getReviewQueue('pending'), []);
  } finally { cleanup(folder); }
});

test('user_version=3 with a partial graph schema is repaired on the next open', () => {
  const { folder, dbPath } = isolated();
  try {
    const partial = new DatabaseSync(dbPath);
    partial.exec(`
      CREATE TABLE assembly_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT, person_node_id INTEGER NOT NULL,
        assembly_term TEXT NOT NULL DEFAULT '22', chamber TEXT NOT NULL DEFAULT '국회',
        district TEXT NOT NULL DEFAULT '', party TEXT NOT NULL DEFAULT '', naas_cd TEXT,
        valid_from TEXT, valid_to TEXT, as_of TEXT,
        status TEXT NOT NULL DEFAULT 'staged', source_evidence_id INTEGER,
        UNIQUE(person_node_id, assembly_term)
      );
      CREATE TABLE evidence_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, node_id INTEGER NOT NULL UNIQUE,
        external_key TEXT UNIQUE, canonical_url TEXT, title TEXT NOT NULL,
        publisher TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'document',
        published_at TEXT, retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        content_hash TEXT, license TEXT NOT NULL DEFAULT '확인 필요', trust_tier INTEGER NOT NULL DEFAULT 3,
        properties_json TEXT NOT NULL DEFAULT '{}'
      );
      PRAGMA user_version = 3;
    `);
    partial.close();

    const db = openArchiveDb(dbPath);
    const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
    assert.ok(columns('politicians').includes('naas_cd'));
    assert.deepEqual(['committee', 'verified_at', 'verification_expires_at'].filter((column) => !columns('assembly_memberships').includes(column)), []);
    assert.deepEqual(['source_id', 'raw_path', 'page_index'].filter((column) => !columns('evidence_sources').includes(column)), []);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assembly_membership_snapshots'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_membership_verification'").get());
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION);
    db.close();
  } finally { cleanup(folder); }
});

test('failed v2 repair rolls back its columns and version stamp, then retries cleanly', () => {
  const { folder, dbPath } = isolated();
  try {
    let db = openArchiveDb(dbPath);
    db.exec(`
      DROP INDEX idx_membership_verification;
      ALTER TABLE evidence_sources DROP COLUMN page_index;
      CREATE TABLE idx_membership_verification (id INTEGER);
      PRAGMA user_version = 2;
    `);
    db.close();

    assert.throws(() => openArchiveDb(dbPath), /already a table named idx_membership_verification/);
    db = new DatabaseSync(dbPath);
    const columns = () => db.prepare('PRAGMA table_info(evidence_sources)').all().map((item) => item.name);
    assert.equal(columns().includes('page_index'), false);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    db.exec('DROP TABLE idx_membership_verification');
    db.close();

    db = openArchiveDb(dbPath);
    assert.equal(db.prepare('PRAGMA table_info(evidence_sources)').all().some((item) => item.name === 'page_index'), true);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION);
    db.close();
  } finally { cleanup(folder); }
});

test('official fields map, 22nd filter is explicit, and stageRosterRows is staged not incumbent', () => {
  const { folder, dbPath } = isolated();
  try {
    const fixture = { ALLNAMEMBER: [{ head: [{ list_total_count: '2' }] }, { row: [{ NAAS_CD: 'N-1', NAAS_NM: '홍길동', PLPT_NM: '무소속', ELECD_NM: '서울', ELECD_DIV_NM: '지역구', CMIT_NM: '기획재정위원회', BLNG_CMIT_NM: '예산결산특별위원회', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.com/p.jpg' }, { NAAS_CD: 'N-2', NAAS_NM: '이전', ELECD_NM: '전국', GTELT_ERACO: '제21대 국회의원' }] }] };
    const page = roster.parseAssemblyRosterPage(fixture, 2); assert.equal(page.totalCount, 2); assert.equal(page.rows.length, 2); assert.equal(page.isShortPage, false); assert.equal(page.rows[0].party, '무소속'); assert.equal(page.rows[0].district, '서울'); assert.equal(page.rows[0].electedDivision, '지역구');
    assert.equal(roster.stageRosterRows(page.rows), 1);
    const db = openArchiveDb(dbPath); const membership = db.prepare('SELECT * FROM assembly_memberships').get(); assert.equal(membership.status, 'staged'); assert.equal(membership.naas_cd, 'N-1'); assert.equal(db.prepare('SELECT COUNT(*) count FROM assembly_memberships WHERE naas_cd=?').get('N-2').count, 0); db.close();
  } finally { cleanup(folder); }
});

test('review approval grants short current TTL and claim edges preserve relation types', () => {
  const { folder, dbPath } = isolated();
  try {
    const row = roster.parseAssemblyRoster({ ALLNAMEMBER: [{ head: [] }, { row: [{ NAAS_CD: 'N-3', NAAS_NM: '검증 의원', ELECD_NM: '부산', GTELT_ERACO: '제22대 국회의원' }] }] })[0];
    roster.stageRosterRows([row]);
    let db = openArchiveDb(dbPath); const membership = db.prepare('SELECT id,person_node_id FROM assembly_memberships WHERE naas_cd=?').get('N-3'); const sourceId = db.prepare('SELECT id FROM source_registry WHERE slug=?').get('assembly-members').id; const evidenceNode = db.prepare('INSERT INTO graph_nodes (kind,label) VALUES (?,?)').run('evidence','roster provenance').lastInsertRowid; const evidenceId = db.prepare('INSERT INTO evidence_sources (node_id,title,publisher,source_type,content_hash,license,trust_tier,source_id,raw_path) VALUES (?,?,?,?,?,?,?,?,?)').run(evidenceNode,'roster provenance','국회','api','roster-hash','확인','1',sourceId,'raw.json').lastInsertRowid; db.prepare('UPDATE assembly_memberships SET source_evidence_id=? WHERE id=?').run(evidenceId,membership.id); const queue = db.prepare("SELECT id FROM review_queue WHERE entity_type='assembly_membership' AND entity_id=?").get(membership.id); db.close();
    assert.throws(() => graph.transitionReview(queue.id, 'approved', ''), /메모/); graph.transitionReview(queue.id, 'approved', '선관위 대조 완료');
    db = openArchiveDb(dbPath); const verified = db.prepare('SELECT status,verified_at,verification_expires_at FROM assembly_memberships WHERE id=?').get(membership.id); assert.equal(verified.status, 'verified_current'); assert.ok(verified.verification_expires_at); db.close();
    const base = `phase1-${Date.now()}`; db = openArchiveDb(dbPath); const discoveryId = db.prepare('SELECT id FROM source_registry WHERE slug=?').get('poliwiki').id; db.close();
    const claim = graph.createClaimWithEvidence({ statement: base, subjectLabel: '검증 의원', subjectExternalKey: 'NAAS_CD:N-3', evidence: [{ externalKey: `${base}:a`, canonicalUrl: `https://example.com/${base}`, title: '공식 회의록', contentHash: 'claim-hash-a', sourceId: discoveryId, supportType: 'supports' }, { externalKey: `${base}:b`, canonicalUrl: `https://example.com/${base}/b`, title: '반론 자료', supportType: 'contradicts' }, { externalKey: `${base}:c`, canonicalUrl: `https://example.com/${base}/c`, title: '맥락 자료', supportType: 'context' }] });
    const claimQueue = graph.getReviewQueue('pending').find((item) => item.entity_type === 'claim' && item.entity_id === claim.id); assert.ok(claimQueue); assert.throws(() => graph.transitionReview(claimQueue.id, 'approved', ''), /메모/); assert.throws(() => graph.transitionReview(claimQueue.id, 'approved', 'Poliwiki는 탐색용'), /원문 해시/); db = openArchiveDb(dbPath); db.prepare('UPDATE evidence_sources SET source_id=? WHERE external_key=?').run(sourceId, `${base}:a`); db.close(); graph.transitionReview(claimQueue.id, 'approved', '원문 대조 완료');
    db = openArchiveDb(dbPath); const edges = db.prepare("SELECT relation FROM graph_edges WHERE from_node_id=? AND relation IN ('SUPPORTS','CONTRADICTS','CONTEXT') ORDER BY relation").all(claim.node_id).map((item) => item.relation); assert.deepEqual(edges, ['CONTEXT', 'CONTRADICTS', 'SUPPORTS']); db.close();
    assert.equal(graph.getClaimPaths(10).length, 1);
    db = openArchiveDb(dbPath); db.prepare("UPDATE assembly_memberships SET verification_expires_at='2000-01-01 00:00:00' WHERE id=?").run(membership.id); db.close();
    assert.equal(graph.getClaimPaths(10).length, 0); assert.equal(graph.getReviewQueue('pending').some((item) => item.state === 'needs_reverification'), true);
    graph.transitionReview(queue.id, 'hold', '재확인 필요');
  } finally { cleanup(folder); }
});

test('unverified subjects cannot create published claims', () => {
  const { folder } = isolated();
  try { assert.throws(() => graph.createClaimWithEvidence({ statement: '차단되어야 함', subjectLabel: '미검증', subjectExternalKey: 'NAAS_CD:UNKNOWN', evidence: [{ title: '자료', canonicalUrl: 'https://example.com/unverified' }] }), /검증되지 않은 Person/); }
  finally { cleanup(folder); }
});

test('fixture-driven sync paginates, stores raw provenance/hash, and stops on short page', async () => {
  const { folder, dbPath } = isolated(); const previousKey = process.env.ASSEMBLY_API_KEY; process.env.ASSEMBLY_API_KEY = 'fixture-key'; const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const page = new URL(input).searchParams.get('pIndex');
      const row = { NAAS_CD: `P-${page}`, NAAS_NM: `페이지 ${page}`, ELECD_NM: '서울', GTELT_ERACO: '제22대 국회의원' };
      return new Response(JSON.stringify({ ALLNAMEMBER: [{ head: [{ list_total_count: '2' }] }, { row: page === '1' ? [row] : [] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await roster.syncAssemblyRoster({ pSize: 1, maxPages: 5 }); assert.equal(result.status, 'success'); assert.equal(result.pages, 2); assert.equal(result.rowsStaged, 1);
    const db = openArchiveDb(dbPath); const evidence = db.prepare('SELECT raw_path,page_index,content_hash,source_id FROM evidence_sources WHERE source_type=?').get('api'); assert.equal(evidence.page_index, 1); assert.ok(evidence.content_hash); assert.ok(evidence.source_id); assert.equal(fs.existsSync(evidence.raw_path), true); db.close();
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.ASSEMBLY_API_KEY; else process.env.ASSEMBLY_API_KEY = previousKey; cleanup(folder); }
});
