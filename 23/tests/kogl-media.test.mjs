import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { candidateFromRow, matchesKoglQuery, parseKoglCsv, parseKoglCsvSelected, syncKoglMedia } = await import('../src/lib/kogl-media.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kogl-media-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}
function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH; delete process.env.ARCHIVE_RAW_ROOT;
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (error) { if (error?.code !== 'EPERM') throw error; }
}
function jsonResponse(value) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
function csvResponse(body, mime = 'text/csv') { return new Response(body, { headers: { 'content-type': mime } }); }
function mediaResponse(body = Buffer.from([1, 2, 3]), mime = 'image/jpeg', contentLength) { const headers = { 'content-type': mime }; if (contentLength !== undefined) headers['content-length'] = String(contentLength); return new Response(body, { headers }); }
const dataset = { publicDataPk: 'fixture-pk', publicDataDetailPk: 'fixture-detail', fileDetailSn: '1', datasetPage: 'https://www.data.go.kr/data/fixture/fileData.do' };

test('parses quoted commas, escaped quotes, and newlines', () => {
  const rows = parseKoglCsv('filename,webfilepath,extension\n"Seoul, ""old""\nphoto","/upload_recommend/a.jpg",jpg\n');
  assert.equal(rows[0].filename, 'Seoul, "old"\nphoto');
  assert.equal(rows[0].webfilepath, '/upload_recommend/a.jpg');
});

test('projected parser retains requested columns from wide quoted rows', () => {
  const rows = parseKoglCsvSelected('filename,unused,webfilepath,description\n"case, file",drop,/upload_recommend/a.mp4,"line 1\nline 2"\n', ['filename', 'webfilepath']);
  assert.deepEqual(rows, [{ filename: 'case, file', webfilepath: '/upload_recommend/a.mp4' }]);
});

test('projected parser drops rows before retaining the large catalog', () => {
  const rows = parseKoglCsvSelected('filename,webfilepath\nkeep.mp4,/upload_recommend/keep.mp4\ndrop.mp4,/upload_recommend/drop.mp4\n', ['filename', 'webfilepath'], (row) => row.filename === 'keep.mp4');
  assert.deepEqual(rows, [{ filename: 'keep.mp4', webfilepath: '/upload_recommend/keep.mp4' }]);
});

test('allows raw Korean KOGL paths and rejects percent-encoded traversal', () => {
  const allowed = candidateFromRow({ filename: '영상', webfilepath: '/upload_recommend/특별테마전/영상.mp4', extension: 'mp4' });
  assert.ok(allowed); assert.equal(allowed.mediaType, 'video'); assert.match(allowed.url, /%ED%8A%B9/);
  assert.equal(candidateFromRow({ filename: 'bad', webfilepath: '/upload_recommend/%2e%2e/evil.mp4', extension: 'mp4' }), null);
});

test('filters KOGL candidates by every Korean title/original-filename term before acquisition', async () => {
  const folder = isolated();
  try {
    const relevant = candidateFromRow({ filename: '국회위원회.jpg', originalfilename: '국회 위원회 회의 사진', webfilepath: '/upload_recommend/assembly.jpg', extension: 'jpg' });
    assert.ok(relevant); assert.equal(matchesKoglQuery(relevant, '국회 위원회'), true); assert.equal(matchesKoglQuery(relevant, '경찰'), false);
    const csv = Buffer.from('filename,originalfilename,webfilepath,filesize,extension\nbulguksa.jpg,temple view,/upload_recommend/bulguksa.jpg,3,jpg\nassembly.jpg,assembly committee meeting,/upload_recommend/assembly.jpg,3,jpg\n', 'ascii');
    const calls = [];
    const fetchImpl = async (input) => { const url = String(input); calls.push(url); if (url.endsWith('/selectFileDataDownload.do')) return jsonResponse({ atchFileId: 'FILE_QUERY', fileDetailSn: '1' }); if (url.includes('/fileDownload.do')) return csvResponse(csv); assert.equal(url, 'https://www.kogl.or.kr/upload_recommend/assembly.jpg'); return mediaResponse(); };
    const result = await syncKoglMedia({ dataset, batchSize: 1, query: 'assembly committee', fetchImpl });
    assert.equal(result.downloaded, 1); assert.equal(calls.length, 3);
    const db = openArchiveDb(); const properties = JSON.parse(db.prepare('SELECT properties_json FROM media_assets').get().properties_json); assert.equal(properties.query, 'assembly committee'); db.close();
  } finally { cleanup(folder); }
});

test('resolves data.go.kr POST, decodes catalog, stores media and deduplicates by URL/SHA', async () => {
  const folder = isolated();
  try {
    const calls = [];
    // Catalogs are CP949; the bytes for "테스트" are included explicitly.
    const csv = Buffer.concat([Buffer.from('filename,originalfilename,filepath,webfilepath,filesize,extension\n"Seoul, photo","', 'ascii'), Buffer.from([0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae]), Buffer.from('",/unused,/upload_recommend/seoul.jpg,3,jpg\n', 'ascii')]);
    const fetchImpl = async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url.endsWith('/selectFileDataDownload.do')) {
        assert.equal(init.method, 'POST');
        const form = new URLSearchParams(init.body);
        assert.equal(form.get('publicDataPk'), 'fixture-pk'); assert.equal(form.get('publicDataDetailPk'), 'fixture-detail'); assert.equal(form.get('fileDetailSn'), '1');
        assert.doesNotMatch(init.body, /secret|apiKey|serviceKey/i);
        return jsonResponse({ status: true, atchFileId: 'FILE_FIXTURE', fileDetailSn: '1' });
      }
      if (url.includes('/fileDownload.do')) return csvResponse(csv);
      assert.equal(url, 'https://www.kogl.or.kr/upload_recommend/seoul.jpg');
      return mediaResponse();
    };
    const first = await syncKoglMedia({ dataset, batchSize: 1, fetchImpl });
    assert.equal(first.status, 'success'); assert.equal(first.downloaded, 1); assert.equal(calls.length, 3);
    let db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.equal(media.media_type, 'photo'); assert.equal(media.license, 'KOGL 유형 미확인 — 공개 전 상세 페이지 확인 필요'); assert.ok(fs.existsSync(media.path)); assert.match(media.attribution, /한국문화정보원/); const properties = JSON.parse(media.properties_json); assert.equal(properties.originalFileName, '테스트'); assert.equal(properties.sourceCatalogUrl, dataset.datasetPage); assert.equal(properties.sourceUrl, media.original_url); assert.equal(properties.semantics, 'discovery_candidate_staged_rights_review_required'); db.close();
    const second = await syncKoglMedia({ dataset, batchSize: 1, fetchImpl });
    assert.equal(second.downloaded, 0); assert.equal(second.deduped, 1);
    db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 1); db.close();
  } finally { cleanup(folder); }
});

test('skips declared oversize first candidate and falls back within bounded attempts', async () => {
  const folder = isolated();
  try {
    const csv = Buffer.from('filename,webfilepath,filesize,extension\nlarge,/upload_recommend/large.jpg,99,jpg\nsmall,/upload_recommend/small.jpg,3,jpg\n', 'ascii');
    const fetchImpl = async (input) => { const url = String(input); if (url.endsWith('/selectFileDataDownload.do')) return jsonResponse({ atchFileId: 'FILE_FALLBACK', fileDetailSn: '1' }); if (url.includes('/fileDownload.do')) return csvResponse(csv); assert.equal(url, 'https://www.kogl.or.kr/upload_recommend/small.jpg'); return mediaResponse(); };
    const result = await syncKoglMedia({ dataset, batchSize: 1, maxBytes: 5, fetchImpl });
    assert.equal(result.downloaded, 1); assert.equal(result.failed, 1); assert.equal(result.errors[0].code, 'oversize'); assert.equal(result.status, 'partial');
    const db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.match(media.original_url, /small\.jpg$/); db.close();
  } finally { cleanup(folder); }
});

test('supports a separate bounded video fallback route', async () => {
  const folder = isolated();
  try {
    const csv = Buffer.from('filename,webfilepath,filesize,extension\nlarge,/upload_recommend/large.mp4,99,mp4\nsmall,/upload_recommend/특별테마전/small.mp4,3,mp4\n', 'utf8');
    const fetchImpl = async (input) => { const url = String(input); if (url.endsWith('/selectFileDataDownload.do')) return jsonResponse({ atchFileId: 'FILE_VIDEO', fileDetailSn: '1' }); if (url.includes('/fileDownload.do')) return csvResponse(csv); assert.match(url, /small\.mp4$/); return mediaResponse(Buffer.from('video'), 'video/mp4'); };
    const result = await syncKoglMedia({ dataset, batchSize: 1, maxBytes: 5, mediaType: 'video', fetchImpl });
    assert.equal(result.downloaded, 1); assert.equal(result.failed, 1); const db = openArchiveDb(); assert.equal(db.prepare("SELECT media_type FROM media_assets").get().media_type, 'video'); db.close();
  } finally { cleanup(folder); }
});

test('rejects hostile paths, HTML/MIME, and declared oversize without storing them', async () => {
  const folder = isolated();
  try {
    const hostileCsv = Buffer.from('filename,webfilepath,filesize,extension\nbad,https://evil.example/x.jpg,3,jpg\n');
    const hostile = await syncKoglMedia({ dataset, fetchImpl: async (input) => String(input).endsWith('/selectFileDataDownload.do') ? jsonResponse({ atchFileId: 'FILE_BAD', fileDetailSn: '1' }) : String(input).includes('/fileDownload.do') ? csvResponse(hostileCsv) : assert.fail(`hostile path was fetched: ${input}`) });
    assert.equal(hostile.status, 'success'); assert.equal(hostile.rowsStaged, 0);
    const htmlCsv = Buffer.from('filename,webfilepath,filesize,extension\nbad,/upload_recommend/bad.jpg,3,jpg\n');
    const html = await syncKoglMedia({ dataset, fetchImpl: async (input) => { const url = String(input); if (url.endsWith('/selectFileDataDownload.do')) return jsonResponse({ atchFileId: 'FILE_HTML', fileDetailSn: '1' }); if (url.includes('/fileDownload.do')) return csvResponse(htmlCsv); return mediaResponse('<html>not media</html>', 'image/jpeg'); } });
    assert.equal(html.status, 'failed'); assert.equal(html.errors[0].code, 'html_rejected');
    const oversize = await syncKoglMedia({ dataset, maxBytes: 5, fetchImpl: async (input) => { const url = String(input); if (url.endsWith('/selectFileDataDownload.do')) return jsonResponse({ atchFileId: 'FILE_BIG', fileDetailSn: '1' }); if (url.includes('/fileDownload.do')) return csvResponse(htmlCsv); return mediaResponse(Buffer.from('123456'), 'image/jpeg', 6); } });
    assert.equal(oversize.status, 'failed'); assert.equal(oversize.errors[0].code, 'oversize');
  } finally { cleanup(folder); }
});
