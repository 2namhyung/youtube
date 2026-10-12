import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const archive = await import('../src/lib/db.ts');

test('node sqlite supports the normalized archive shape', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-smoke-'));
  const db = new DatabaseSync(path.join(folder, 'test.sqlite'));
  db.exec('CREATE TABLE politicians (id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE records (id INTEGER PRIMARY KEY, politician_id INTEGER REFERENCES politicians(id), title TEXT); CREATE TABLE sources (id INTEGER PRIMARY KEY, record_id INTEGER REFERENCES records(id), title TEXT);');
  db.prepare('INSERT INTO politicians (id, name) VALUES (?, ?)').run(1, 'Demo');
  db.prepare('INSERT INTO records (id, politician_id, title) VALUES (?, ?, ?)').run(1, 1, 'Card');
  db.prepare('INSERT INTO sources (id, record_id, title) VALUES (?, ?, ?)').run(1, 1, 'Source');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sources WHERE record_id = ?').get(1).count, 1);
  db.close();
  fs.rmSync(folder, { recursive: true, force: true });
});

test('archive persistence module commits records, sources, positions, and rollback-safe updates', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-persistence-'));
  const previousDb = process.env.ARCHIVE_DB_PATH; const previousRaw = process.env.ARCHIVE_RAW_ROOT;
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite'); process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  try {
    const politicianId = archive.getPoliticians()[0].id;
    const title = `Persistence smoke ${Date.now()}`;
    const input = {
    politicianId,
    title,
    body: 'transaction body',
    type: '메모',
    eventDate: '2026. 08. 19.',
    color: '#fff8e9',
    sourceTitle: 'Smoke source',
    sourceUrl: 'https://example.com/source',
    publisher: 'Test publisher',
    publishedAt: '2026-08-19',
    license: '확인 필요',
    verificationStatus: '미확인',
    sourceNote: 'test note',
    positionX: 275,
    positionY: 315,
    };
    const created = archive.insertRecord(input);
    try {
    assert.equal(created.title, title);
    assert.equal(created.position_x, 275);
    assert.equal(created.position_y, 315);
    assert.equal(created.sources[0].url, input.sourceUrl);
    archive.updateRecord(created.id, { ...input, body: 'updated body', sourceTitle: 'Updated source' });
    archive.updateRecordPosition(created.id, 1499, -20);
    const saved = archive.getRecords(politicianId).find((record) => record.id === created.id);
    assert.equal(saved.body, 'updated body');
    assert.equal(saved.sources[0].title, 'Updated source');
    assert.equal(saved.position_x, 1380);
    assert.equal(saved.position_y, 0);
    } finally {
      archive.deleteRecord(created.id);
    }
    assert.equal(archive.getRecords(politicianId).some((record) => record.id === created.id), false);
  } finally {
    if (previousDb === undefined) delete process.env.ARCHIVE_DB_PATH; else process.env.ARCHIVE_DB_PATH = previousDb;
    if (previousRaw === undefined) delete process.env.ARCHIVE_RAW_ROOT; else process.env.ARCHIVE_RAW_ROOT = previousRaw;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
