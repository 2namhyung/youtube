import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { resolvePexelsApiKey, syncPexelsMedia } = await import('../src/lib/pexels-media.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pexels-media-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}

function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH;
  delete process.env.ARCHIVE_RAW_ROOT;
  delete process.env.PEXELS_API_KEY;
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function mediaResponse(body = 'fixture-image', mime = 'image/jpeg', status = 200) {
  return new Response(Buffer.from(body), { status, headers: { 'content-type': mime } });
}

const photoFixture = {
  photos: [{ id: 101, width: 1200, height: 800, url: 'https://www.pexels.com/photo/seoul-street-101/', photographer: '홍길동', photographer_url: 'https://www.pexels.com/@hong', src: { original: 'https://images.pexels.com/photos/101/pexels-photo-101.jpeg' }, alt: '서울 거리' }],
};

test('searches Pexels photos with a fixture key, stores provenance, and is URL/hash idempotent', async () => {
  const folder = isolated();
  try {
    const calls = [];
    const fetchImpl = async (input, init) => {
      calls.push({ url: String(input), init });
      return String(input).startsWith('https://api.pexels.com/') ? jsonResponse(photoFixture) : mediaResponse();
    };
    const first = await syncPexelsMedia({ apiKey: 'fixture-secret', query: '서울 일상', batchSize: 1, fetchImpl });
    assert.equal(first.status, 'success'); assert.equal(first.downloaded, 1); assert.equal(first.rowsStaged, 1);
    assert.equal(calls[0].init.headers.Authorization, 'fixture-secret');
    let db = openArchiveDb();
    const media = db.prepare('SELECT * FROM media_assets').get();
    assert.equal(media.media_type, 'photo'); assert.equal(media.original_url, photoFixture.photos[0].src.original); assert.equal(media.attribution, 'Photo by 홍길동 on Pexels');
    assert.ok(fs.existsSync(media.path));
    const properties = JSON.parse(media.properties_json);
    assert.equal(properties.query, '서울 일상'); assert.equal(properties.sourceUrl, photoFixture.photos[0].url); assert.equal(properties.creator, '홍길동');
    const run = db.prepare('SELECT metadata_json FROM ingest_runs WHERE id=?').get(first.runId);
    assert.equal(JSON.stringify(run).includes('fixture-secret'), false); assert.equal(db.prepare("SELECT slug FROM source_registry WHERE slug='pexels-media'").get().slug, 'pexels-media'); db.close();
    const second = await syncPexelsMedia({ apiKey: 'fixture-secret', query: '서울 일상', batchSize: 1, fetchImpl });
    assert.equal(second.status, 'success'); assert.equal(second.downloaded, 0); assert.equal(second.deduped, 1); assert.equal(calls.length, 3);
    db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 1); db.close();
  } finally { cleanup(folder); }
});

test('supports Pexels video fixtures and rejects non-allowlisted media URLs', async () => {
  const folder = isolated();
  try {
    const videoFixture = { videos: [{ id: 202, width: 3840, height: 2160, duration: 6, url: 'https://www.pexels.com/video/seoul-202/', user: { name: '김길동', url: 'https://www.pexels.com/@kim' }, video_files: [{ width: 3840, file_size: 60_000_000, link: 'https://videos.pexels.com/video-files/202/video-4k.mp4', file_type: 'video/mp4' }, { width: 1280, file_size: 2_000_000, link: 'https://videos.pexels.com/video-files/202/video-hd.mp4', file_type: 'video/mp4' }] }] };
    const fetchImpl = async (input) => String(input).startsWith('https://api.pexels.com/') ? jsonResponse(videoFixture) : mediaResponse('fixture-video', 'video/mp4');
    const result = await syncPexelsMedia({ mediaType: 'video', apiKey: 'fixture-secret', query: '서울 일상', batchSize: 1, fetchImpl });
    assert.equal(result.status, 'success'); assert.equal(result.downloaded, 1);
    let db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.equal(media.media_type, 'video'); assert.equal(media.duration_seconds, 6); assert.equal(media.original_url, videoFixture.videos[0].video_files[1].link); assert.match(media.attribution, /김길동/); db.close();
    const rejected = await syncPexelsMedia({ apiKey: 'fixture-secret', query: '서울 일상', batchSize: 1, fetchImpl: async (input) => String(input).startsWith('https://api.pexels.com/') ? jsonResponse({ photos: [{ id: 303, url: 'https://www.pexels.com/photo/303/', src: { original: 'https://evil.example/303.jpg' } }] }) : mediaResponse() });
    assert.equal(rejected.status, 'success'); assert.equal(rejected.rowsSeen, 0); assert.equal(rejected.downloaded, 0);
  } finally { cleanup(folder); }
});

test('uses pixel.txt only as a local fallback and blocks without a key', async () => {
  const folder = isolated();
  try {
    fs.writeFileSync(path.join(folder, 'pixel.txt'), 'local-fixture-key\n');
    assert.equal(resolvePexelsApiKey({ env: {}, cwd: folder }), 'local-fixture-key');
    assert.equal(resolvePexelsApiKey({ env: { PEXELS_API_KEY: 'env-fixture-key' }, cwd: folder }), 'env-fixture-key');
    fs.unlinkSync(path.join(folder, 'pixel.txt'));
    const previousCwd = process.cwd(); process.chdir(folder);
    const blocked = await syncPexelsMedia({ query: '서울 일상', fetchImpl: async () => { throw new Error('should-not-call'); } });
    process.chdir(previousCwd);
    assert.equal(blocked.status, 'blocked');
  } finally { cleanup(folder); }
});
