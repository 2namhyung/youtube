import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { openArchiveDb } = await import('../src/lib/db.ts');
const { syncLocMedia, syncNasaMedia, syncWikimediaMedia } = await import('../src/lib/keyless-media.ts');

function isolated() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'keyless-media-'));
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  return folder;
}

function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH;
  delete process.env.ARCHIVE_RAW_ROOT;
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function mediaResponse(body = 'fixture-image', mime = 'image/jpeg', status = 200, contentLength) {
  const headers = { 'content-type': mime };
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);
  return new Response(Buffer.from(body), { status, headers });
}

const wikimediaFixture = {
  query: { pages: [{ pageid: 101, title: 'File:Seoul street.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/1/10/Seoul.jpg', mime: 'image/jpeg', width: 1200, height: 800, extmetadata: { Artist: { value: '<a href="/wiki/User:Hong">홍길동</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, UsageTerms: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }] }] },
};

test('Wikimedia Commons stores staged provenance and is URL/hash idempotent', async () => {
  const folder = isolated();
  try {
    const calls = [];
    const fetchImpl = async (input, init) => {
      calls.push({ url: String(input), init });
      return String(input).startsWith('https://commons.wikimedia.org/w/api.php') ? jsonResponse(wikimediaFixture) : mediaResponse();
    };
    const first = await syncWikimediaMedia({ query: 'Seoul', batchSize: 1, fetchImpl });
    assert.equal(first.status, 'success'); assert.equal(first.downloaded, 1); assert.equal(first.rowsStaged, 1);
    let db = openArchiveDb();
    const media = db.prepare('SELECT * FROM media_assets').get();
    assert.equal(media.media_type, 'photo'); assert.equal(media.original_url, wikimediaFixture.query.pages[0].imageinfo[0].url); assert.match(media.attribution, /홍길동/);
    assert.ok(fs.existsSync(media.path));
    const properties = JSON.parse(media.properties_json);
    assert.equal(properties.provider, 'wikimedia'); assert.equal(properties.creator, '홍길동'); assert.equal(properties.license, 'CC BY-SA 4.0'); assert.equal(properties.rightsStatus, 'CC BY-SA 4.0');
    const run = db.prepare('SELECT metadata_json FROM ingest_runs WHERE id=?').get(first.runId);
    assert.equal(JSON.stringify(run).includes('secret'), false); db.close();
    const second = await syncWikimediaMedia({ query: 'Seoul', batchSize: 1, fetchImpl });
    assert.equal(second.status, 'success'); assert.equal(second.downloaded, 0); assert.equal(second.deduped, 1); assert.equal(calls.length, 3);
    db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 1); db.close();
  } finally { cleanup(folder); }
});

test('NASA and Library of Congress fixtures persist provider-specific rights metadata', async () => {
  const folder = isolated();
  try {
    const nasaFixture = { collection: { items: [{ data: [{ nasa_id: 'N-202', media_type: 'image', title: 'Earth from space', photographer: 'NASA/JPL', date_created: '2020-01-01', center: 'JPL' }], links: [{ rel: 'preview', href: 'https://images-assets.nasa.gov/image/N-202/N-202~orig.jpg' }] }] } };
    const locFixture = { results: [{ id: 'https://www.loc.gov/pictures/item/202/', title: 'Seoul archive photo', contributor: ['Library of Congress'], rights: 'No known restrictions on publication', image_url: ['https://tile.loc.gov/storage-services/service/pnp/test/202.jpg'] }] };
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.startsWith('https://images-api.nasa.gov/search')) return jsonResponse(nasaFixture);
      if (url.startsWith('https://www.loc.gov/photos/')) return jsonResponse(locFixture);
      return url.startsWith('https://tile.loc.gov/') ? mediaResponse('loc-image') : mediaResponse('nasa-image');
    };
    const nasa = await syncNasaMedia({ query: 'Earth', batchSize: 1, fetchImpl });
    const loc = await syncLocMedia({ query: 'Seoul', batchSize: 1, fetchImpl });
    assert.equal(nasa.downloaded, 1); assert.equal(loc.downloaded, 1);
    const db = openArchiveDb();
    const rows = db.prepare('SELECT media_type,properties_json,license FROM media_assets ORDER BY id').all();
    assert.equal(rows.length, 2); assert.equal(JSON.parse(rows[0].properties_json).thirdPartyRightsCheck, true); assert.match(rows[1].license, /No known restrictions/);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_nodes WHERE kind='photo'").get().count, 2); db.close();
  } finally { cleanup(folder); }
});

test('keyless adapters drop hostile item and download hosts before downloading', async () => {
  const folder = isolated();
  try {
    const hostile = { query: { pages: [{ pageid: 303, title: 'File:hostile.jpg', imageinfo: [{ url: 'https://evil.example/hostile.jpg', mime: 'image/jpeg' }] }] } };
    const result = await syncWikimediaMedia({ batchSize: 1, fetchImpl: async (input) => String(input).startsWith('https://commons.wikimedia.org/w/api.php') ? jsonResponse(hostile) : mediaResponse() });
    assert.equal(result.status, 'success'); assert.equal(result.rowsSeen, 0); assert.equal(result.downloaded, 0);
    const db = openArchiveDb(); assert.equal(db.prepare('SELECT COUNT(*) count FROM media_assets').get().count, 0); db.close();
  } finally { cleanup(folder); }
});

test('keyless adapters reject invalid MIME and declared or actual oversize bodies', async () => {
  const folder = isolated();
  try {
    const mimeFailure = await syncLocMedia({ batchSize: 1, maxBytes: 20, fetchImpl: async (input) => String(input).startsWith('https://www.loc.gov/photos/') ? jsonResponse({ results: [{ id: 'https://www.loc.gov/pictures/item/mime/', title: 'mime', image_url: ['https://tile.loc.gov/mime.jpg'] }] }) : mediaResponse('not-image', 'text/plain') });
    assert.equal(mimeFailure.status, 'failed'); assert.equal(mimeFailure.errors[0].code, 'invalid_mime');
    const oversize = await syncLocMedia({ batchSize: 1, maxBytes: 5, fetchImpl: async (input) => String(input).startsWith('https://www.loc.gov/photos/') ? jsonResponse({ results: [{ id: 'https://www.loc.gov/pictures/item/large/', title: 'large', image_url: ['https://tile.loc.gov/large.jpg'] }] }) : mediaResponse('123456789', 'image/jpeg', 200, 9) });
    assert.equal(oversize.status, 'failed'); assert.equal(oversize.errors[0].code, 'oversize');
  } finally { cleanup(folder); }
});
