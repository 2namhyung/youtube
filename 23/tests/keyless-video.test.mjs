import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { syncLocVideo, syncNasaVideo, syncWikimediaVideo } = await import('../src/lib/keyless-video.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'keyless-video-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}
function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH; delete process.env.ARCHIVE_RAW_ROOT;
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) { if (error?.code !== 'EPERM') throw error; }
}
function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function mediaResponse(body = 'fixture-video', mime = 'video/mp4', status = 200, contentLength) { const headers = { 'content-type': mime }; if (contentLength !== undefined) headers['content-length'] = String(contentLength); return new Response(Buffer.from(body), { status, headers }); }

test('NASA performs asset lookup, chooses a bounded 1080p video, rejects preview JPG, and is idempotent', async () => {
  const folder = isolated();
  try {
    const calls = [];
    const search = { collection: { items: [{ data: [{ nasa_id: 'N-VIDEO-1', media_type: 'video', title: 'NASA test video', photographer: 'NASA' }] }] } };
    const asset = { collection: { items: [{ href: 'http://images-assets.nasa.gov/video/N-VIDEO-1/N-VIDEO-1~thumb.jpg' }, { href: 'http://images-assets.nasa.gov/video/N-VIDEO-1/N-VIDEO-1~2160.mp4' }, { href: 'http://images-assets.nasa.gov/video/N-VIDEO-1/N-VIDEO-1~1080.mp4' }] } };
    const fetchImpl = async (input, init) => {
      const url = String(input); calls.push({ url, init });
      if (url.startsWith('https://images-api.nasa.gov/search')) return jsonResponse(search);
      if (url.startsWith('https://images-api.nasa.gov/asset/')) return jsonResponse(asset);
      assert.ok(url.endsWith('~1080.mp4'), `preview or non-preferred file downloaded: ${url}`); return mediaResponse();
    };
    const first = await syncNasaVideo({ query: 'Earth', batchSize: 1, fetchImpl });
    assert.equal(first.status, 'success'); assert.equal(first.downloaded, 1); assert.equal(calls.length, 3);
    let db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.equal(media.media_type, 'video'); assert.ok(media.original_url.endsWith('~1080.mp4')); assert.ok(fs.existsSync(media.path)); assert.equal(JSON.parse(media.properties_json).thirdPartyRightsCheck, true); db.close();
    const second = await syncNasaVideo({ query: 'Earth', batchSize: 1, fetchImpl });
    assert.equal(second.downloaded, 0); assert.equal(second.deduped, 1); db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 1); db.close();
  } finally { cleanup(folder); }
});

test('Wikimedia video search stores original upload video and preserves creator/license metadata', async () => {
  const folder = isolated();
  try {
    const fixture = { query: { pages: [{ pageid: 301, title: 'File:hostile.webm', imageinfo: [{ url: 'https://evil.example/hostile.webm', mime: 'video/webm' }] }, { pageid: 302, title: 'File:Commons video.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Video.webm', mime: 'video/webm', size: 1234, extmetadata: { Artist: { value: '<a href="/wiki/User:Video">영상 제작자</a>' }, LicenseShortName: { value: 'CC BY 4.0' }, UsageTerms: { value: 'CC BY 4.0' }, Credit: { value: '<span>Commons credit</span>' } } }] }] } };
    const fetchImpl = async (input) => String(input).startsWith('https://commons.wikimedia.org/w/api.php') ? jsonResponse(fixture) : mediaResponse('commons-video', 'video/webm');
    const result = await syncWikimediaVideo({ query: 'Seoul', batchSize: 2, fetchImpl });
    assert.equal(result.status, 'success'); assert.equal(result.downloaded, 1); assert.equal(result.rowsSeen, 1);
    const db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.equal(media.mime_type, 'video/webm'); assert.equal(media.original_url, fixture.query.pages[1].imageinfo[0].url); assert.match(media.attribution, /영상 제작자/); assert.doesNotMatch(media.attribution, /<a|<span/); assert.equal(JSON.parse(media.properties_json).creator, '영상 제작자'); assert.equal(JSON.parse(media.properties_json).license, 'CC BY 4.0'); db.close();
  } finally { cleanup(folder); }
});

test('LOC video route performs item/resource lookup and never downloads a preview JPG', async () => {
  const folder = isolated();
  try {
    const search = { results: [{ id: 'https://www.loc.gov/item/video-401/', title: 'LOC video', contributor: 'Library of Congress', format: ['Video'], rights: 'Rights and Access 확인 필요' }] };
    const item = { id: 'https://www.loc.gov/item/video-401/', download_restricted: false, rights_restricted: false, resources: [{ files: [{ url: 'https://tile.loc.gov/storage-services/video-401-preview.jpg', mimetype: 'image/jpeg' }, { video_stream: 'https://tile.loc.gov/storage-services/video-401-720.mp4', mimetype: 'video/mp4' }] }] };
    const calls = [];
    const fetchImpl = async (input, init) => { const url = String(input); calls.push({ url, init }); if (url.startsWith('https://www.loc.gov/film-and-videos/')) return jsonResponse(search); if (url.startsWith('https://www.loc.gov/item/video-401/')) { assert.equal(new URL(url).searchParams.get('at'), 'resources'); return jsonResponse(item); } assert.ok(url.endsWith('720.mp4'), `preview URL selected: ${url}`); return mediaResponse('loc-video', 'video/mp4'); };
    const result = await syncLocVideo({ query: 'Seoul', batchSize: 1, fetchImpl });
    assert.equal(result.status, 'success'); assert.equal(result.downloaded, 1); assert.equal(calls.length, 3);
    const db = openArchiveDb(); const media = db.prepare('SELECT * FROM media_assets').get(); assert.equal(media.media_type, 'video'); assert.ok(media.original_url.endsWith('720.mp4')); assert.equal(JSON.parse(media.properties_json).downloadRestricted, false); db.close();
  } finally { cleanup(folder); }
});

test('video routes reject hostile downloads, non-video MIME, and oversize bodies with bounded reasons', async () => {
  const folder = isolated();
  try {
    const hostile = await syncNasaVideo({ batchSize: 1, fetchImpl: async (input) => String(input).startsWith('https://images-api.nasa.gov/search') ? jsonResponse({ collection: { items: [{ data: [{ nasa_id: 'N-404', media_type: 'video' }] }] } }) : jsonResponse({ collection: { items: [{ href: 'https://evil.example/video.mp4' }] } }) });
    assert.equal(hostile.status, 'failed'); assert.equal(hostile.errors[0].code, 'no_allowed_video_resource');
    const mime = await syncWikimediaVideo({ batchSize: 1, fetchImpl: async (input) => String(input).startsWith('https://commons.wikimedia.org/w/api.php') ? jsonResponse({ query: { pages: [{ pageid: 405, title: 'File:bad.mp4', imageinfo: [{ url: 'https://upload.wikimedia.org/bad.mp4', mime: 'video/mp4' }] }] } }) : mediaResponse('not-video', 'image/jpeg') });
    assert.equal(mime.status, 'failed'); assert.equal(mime.errors[0].code, 'invalid_mime');
    const oversize = await syncLocVideo({ batchSize: 1, maxBytes: 5, fetchImpl: async (input) => { const url = String(input); if (url.startsWith('https://www.loc.gov/film-and-videos/')) return jsonResponse({ results: [{ id: 'https://www.loc.gov/item/large/', title: 'large', format: ['Video'] }] }); if (url.startsWith('https://www.loc.gov/item/large/')) return jsonResponse({ resources: [{ video: 'https://tile.loc.gov/large.mp4' }] }); return mediaResponse('123456789', 'video/mp4', 200, 9); } });
    assert.equal(oversize.status, 'failed'); assert.equal(oversize.errors[0].code, 'oversize');
  } finally { cleanup(folder); }
});
