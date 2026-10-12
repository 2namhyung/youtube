import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb, GRAPH_SCHEMA_VERSION, getPolicyCandidates, insertRecord, updateRecord, deleteRecord, getRecords } = await import('../src/lib/db.ts');
const { calculateTopicScore } = await import('../src/lib/policy.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-radar-'));
  return { folder, dbPath: path.join(folder, 'archive.sqlite') };
}

test('policy migration is atomic, idempotent, and seeds only fictional candidates', () => {
  const { folder, dbPath } = isolated();
  try {
    let db = openArchiveDb(dbPath);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, GRAPH_SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM policies').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM topic_candidates').get().count, 3);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policies WHERE is_demo=1 AND verification_state='demo'").get().count, 3);
    db.close();
    db = openArchiveDb(dbPath);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM policies').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM complaint_signals').get().count, 3);
    db.close();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('topic score clamps rubric inputs and uses the 70-point boundary', () => {
  assert.equal(calculateTopicScore({ 생활영향: 25, 이슈화: 15, 민원: 20, 시행긴급성: 15, 정치인책임: 15, 자료확보: 10 }).total, 100);
  assert.equal(calculateTopicScore({ 생활영향: 25, 이슈화: 15, 민원: 20, 시행긴급성: 10, 정치인책임: 0, 자료확보: 0 }).eligible, true);
  assert.equal(calculateTopicScore({ 생활영향: 25, 이슈화: 15, 민원: 19, 시행긴급성: 10, 정치인책임: 0, 자료확보: 0 }).eligible, false);
  const clamped = calculateTopicScore({ 생활영향: 100, 이슈화: -3, 민원: Number.NaN, 시행긴급성: 4.7, 정치인책임: 20, 자료확보: 8 });
  assert.deepEqual(clamped, { 생활영향: 25, 이슈화: 0, 민원: 0, 시행긴급성: 5, 정치인책임: 15, 자료확보: 8, total: 53, eligible: false });
});

test('seeded policy stages remain distinct from 시행 and confirmed impact is absent', () => {
  const { folder, dbPath } = isolated();
  const previousDb = process.env.ARCHIVE_DB_PATH;
  process.env.ARCHIVE_DB_PATH = dbPath;
  try {
    const db = openArchiveDb(dbPath);
    const stages = db.prepare('SELECT current_stage FROM policies ORDER BY id').all().map((row) => row.current_stage);
    assert.deepEqual(stages, ['proposed', 'committee', 'repealed']);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM policy_status_events WHERE event_type='effective'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='CONFIRMED_IMPACT'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='POSSIBLY_AFFECTED_BY'").get().count, 3);
    db.close();
    const candidates = getPolicyCandidates();
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0].score, 100);
    assert.equal(candidates[0].status_events[0].event_type, 'proposed');
  } finally {
    if (previousDb === undefined) delete process.env.ARCHIVE_DB_PATH; else process.env.ARCHIVE_DB_PATH = previousDb;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('updating one storyboard source preserves additional sources', () => {
  const { folder, dbPath } = isolated();
  const previousDb = process.env.ARCHIVE_DB_PATH;
  process.env.ARCHIVE_DB_PATH = dbPath;
  try {
    const lookup = openArchiveDb(dbPath); const id = lookup.prepare('SELECT id FROM politicians LIMIT 1').get().id; lookup.close();
    const input = { politicianId: Number(id), title: '멀티 출처 카드', body: '원문과 맥락', type: '메모', eventDate: '2026-08-20', color: '#fff8e9', sourceTitle: '원문', sourceUrl: 'https://example.com/primary', publisher: '공식', publishedAt: '2026-08-20', license: '확인', verificationStatus: '미확인', sourceNote: '' };
    const created = insertRecord(input);
    const db = openArchiveDb(dbPath);
    db.prepare('INSERT INTO sources (record_id,title,url,publisher) VALUES (?,?,?,?)').run(created.id, '맥락', 'https://example.com/context', '언론');
    db.close();
    updateRecord(created.id, { ...input, title: '멀티 출처 카드 수정', sourceTitle: '원문 수정' });
    const saved = getRecords(Number(id)).find((record) => record.id === created.id);
    assert.equal(saved.sources.length, 2);
    assert.equal(saved.sources[0].title, '원문 수정');
    assert.equal(saved.sources[1].title, '맥락');
    deleteRecord(created.id);
  } finally {
    if (previousDb === undefined) delete process.env.ARCHIVE_DB_PATH; else process.env.ARCHIVE_DB_PATH = previousDb;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
