import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { parseAssemblyRoster, stageRosterRows } = await import('../src/lib/roster.ts');
const { syncAssemblyMemberPhotos } = await import('../src/lib/assembly-media.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'assembly-media-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}

function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH;
  delete process.env.ARCHIVE_RAW_ROOT;
  fs.rmSync(folder, { recursive: true, force: true });
}

function stageRows(rows) {
  stageRosterRows(parseAssemblyRoster({ ALLNAMEMBER: [{ head: [] }, { row: rows }] }));
}

function imageResponse(body = 'jpeg', status = 200, mime = 'image/jpeg') {
  return new Response(Buffer.from(body), { status, headers: { 'content-type': mime } });
}

test('downloads deterministic staged photos, records provenance, and is URL-idempotent', async () => {
  const folder = isolated();
  try {
    stageRows([
      { NAAS_CD: 'N-1', NAAS_NM: '홍길동', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.test/n-1.jpg' },
      { NAAS_CD: 'N-2', NAAS_NM: '김길동', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.test/n-2.jpg' },
    ]);
    let calls = 0;
    const fetchedUrls = [];
    const fetchImpl = async (input) => { calls += 1; fetchedUrls.push(String(input)); return imageResponse(String(input)); };
    const first = await syncAssemblyMemberPhotos({ batchSize: 1, fetchImpl });
    assert.equal(first.status, 'success'); assert.equal(first.rowsSeen, 1); assert.equal(first.rowsStaged, 1); assert.equal(first.downloaded, 1);
    let db = openArchiveDb();
    const media = db.prepare('SELECT * FROM media_assets').get();
    assert.equal(media.media_type, 'photo'); assert.equal(media.original_url, 'https://example.test/n-1.jpg'); assert.ok(fs.existsSync(media.path));
    assert.equal(db.prepare("SELECT relation FROM graph_edges WHERE from_node_id=?").get(media.node_id).relation, 'PHOTO_OF');
    assert.equal(db.prepare("SELECT slug FROM source_registry WHERE slug='assembly-media'").get().slug, 'assembly-media');
    const run = db.prepare('SELECT status,rows_seen,rows_staged,metadata_json FROM ingest_runs WHERE id=?').get(first.runId);
    assert.equal(run.status, 'success'); assert.equal(run.rows_seen, 1); assert.equal(JSON.parse(run.metadata_json).downloaded, 1); db.close();
    const second = await syncAssemblyMemberPhotos({ batchSize: 1, fetchImpl });
    assert.equal(second.rowsSeen, 1); assert.equal(second.rowsStaged, 1); assert.equal(second.deduped, 0); assert.equal(calls, 2);
    assert.deepEqual(fetchedUrls, ['https://example.test/n-1.jpg', 'https://example.test/n-2.jpg']);
    db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 2); db.close();
    const completed = await syncAssemblyMemberPhotos({ batchSize: 10, fetchImpl });
    assert.equal(completed.status, 'success'); assert.equal(completed.rowsSeen, 0); assert.equal(completed.rowsStaged, 0); assert.equal(completed.deduped, 0); assert.equal(calls, 2);
    db = openArchiveDb(); const completedRun = db.prepare('SELECT rows_seen,rows_staged,metadata_json FROM ingest_runs WHERE id=?').get(completed.runId); assert.equal(completedRun.rows_seen, 0); assert.equal(completedRun.rows_staged, 0); assert.equal(JSON.parse(completedRun.metadata_json).deduped, 0); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 2); db.close();
  } finally { cleanup(folder); }
});

test('rejects non-image and oversized responses without leaving files', async () => {
  const folder = isolated();
  try {
    stageRows([{ NAAS_CD: 'N-2', NAAS_NM: '이미지 아님', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.test/n-2' }]);
    const result = await syncAssemblyMemberPhotos({ maxBytes: 4, fetchImpl: async () => imageResponse('too-large', 200, 'text/plain') });
    assert.equal(result.status, 'failed'); assert.equal(result.failed, 1); assert.equal(result.errors[0].code, 'invalid_mime');
    const files = fs.existsSync(path.join(folder, 'raw')) ? fs.readdirSync(path.join(folder, 'raw'), { recursive: true }) : [];
    assert.equal(files.some((item) => String(item).includes('.tmp-')), false);
    const db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 0); db.close();
  } finally { cleanup(folder); }
});

test('keeps successful items and records bounded failure metadata on partial failure', async () => {
  const folder = isolated();
  try {
    stageRows([
      { NAAS_CD: 'N-3', NAAS_NM: '실패', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.test/n-3' },
      { NAAS_CD: 'N-4', NAAS_NM: '성공', GTELT_ERACO: '제22대 국회의원', NAAS_PIC: 'https://example.test/n-4' },
    ]);
    const result = await syncAssemblyMemberPhotos({ fetchImpl: async (input) => String(input).endsWith('n-3') ? imageResponse('', 503) : imageResponse('ok') });
    assert.equal(result.status, 'failed'); assert.equal(result.rowsSeen, 2); assert.equal(result.downloaded, 1); assert.equal(result.failed, 1); assert.equal(result.errors[0].code, 'http_503');
    const db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 1); const metadata = JSON.parse(db.prepare('SELECT metadata_json FROM ingest_runs WHERE id=?').get(result.runId).metadata_json); assert.equal(metadata.errors.length, 1); assert.equal(metadata.errors[0].naasCd, 'N-3'); db.close();
  } finally { cleanup(folder); }
});
