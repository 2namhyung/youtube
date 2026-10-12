import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { getEp001KoreanMediaRoutes, registerManualKoreanMedia, runEp001KoreanRoute, validateManualKoreanMediaRegistration } = await import('../src/lib/ep001-korean-routes.ts');

test('EP001 Korean registry covers official, public, licensed, direct and fallback routes', () => {
  const routes = getEp001KoreanMediaRoutes();
  assert.ok(routes.length >= 19);
  for (const id of ['assembly-image-attachments', 'kogl-photo', 'kogl-video', 'digital-culture-metadata', 'national-archives-api', 'national-police-official', 'prosecution-official', 'moj-official', 'policy-briefing-official', 'ktv-official', 'e-briefing-official', 'yna-licensed', 'ytn-licensed', 'direct-shoot', 'paid-stock', 'wikimedia-korea-fallback', 'loc-korea-fallback', 'pexels-generic-last']) assert.ok(routes.some((route) => route.id === id), id);
  assert.equal(routes.find((route) => route.id === 'kogl-photo').defaultQuery, '국회');
  assert.equal(routes.find((route) => route.id === 'pexels-generic-last').priority, 4);
});

test('manual registration requires allowlisted source, local bytes, hash, MIME and rights evidence', () => {
  const intakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ep001-intake-'));
  const original = path.join(intakeRoot, 'original.jpg'); const bytes = Buffer.from('verified original bytes'); fs.writeFileSync(original, bytes);
  const valid = { routeId: 'national-police-official', sourceUrl: 'https://www.police.go.kr/example/attachment', creatorOrShooter: '경찰청', publisherOrOwner: '경찰청', retrievedAt: '2026-09-09T00:00:00.000Z', rightsStatus: 'pending-item-level-review', rightsEvidence: 'https://www.police.go.kr/example/rights', semanticRole: 'general-context-b-roll', specificEventEvidence: false, localOriginalPath: original, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), mimeType: 'image/jpeg', durationOrDimensions: '1920x1080', locationOrInstitutionMetadata: '대한민국 경찰청', editorialLimits: '특정 사건 증거로 표기하지 않음' };
  try {
    assert.equal(validateManualKoreanMediaRegistration(valid, { intakeRoot }).production_authority, false);
    const saved = registerManualKoreanMedia(valid, { intakeRoot, registrationRoot: path.join(intakeRoot, 'registrations'), registrationId: 'police-context-001' });
    assert.equal(saved.production_authority, false); assert.ok(fs.existsSync(saved.path));
    assert.throws(() => validateManualKoreanMediaRegistration({ ...valid, sourceUrl: 'https://evil.example/file.jpg' }, { intakeRoot }), /허용 호스트/);
    assert.throws(() => validateManualKoreanMediaRegistration({ ...valid, sha256: '0'.repeat(64) }, { intakeRoot }), /SHA-256/);
  } finally { fs.rmSync(intakeRoot, { recursive: true, force: true, maxRetries: 10 }); }
});

test('acquire accepts query, page, batch size and media type while retaining route defaults', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ep001-route-options-'));
  const previousDb = process.env.ARCHIVE_DB_PATH; const previousRaw = process.env.ARCHIVE_RAW_ROOT; const previousFetch = globalThis.fetch;
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite'); process.env.ARCHIVE_RAW_ROOT = path.join(folder, 'raw');
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.hostname === 'www.data.go.kr' && url.pathname.endsWith('selectFileDataDownload.do')) return Response.json({ atchFileId: 'ROUTE_FIXTURE', fileDetailSn: '1' });
    if (url.hostname === 'www.data.go.kr' && url.pathname.endsWith('fileDownload.do')) return new Response('filename,originalfilename,webfilepath,filesize,extension\nfirst.jpg,needle first,/upload_recommend/first.jpg,3,jpg\nsecond.jpg,needle second,/upload_recommend/second.jpg,3,jpg\nshort-clip.webm,short clip,/upload_recommend/short-clip.webm,3,webm\n', { headers: { 'content-type': 'text/csv' } });
    if (url.hostname === 'www.kogl.or.kr') return new Response(url.pathname.endsWith('.webm') ? 'video-bytes' : 'image-bytes', { headers: { 'content-type': url.pathname.endsWith('.webm') ? 'video/webm' : 'image/jpeg' } });
    if (url.hostname === 'commons.wikimedia.org') return Response.json({ query: { pages: [{ pageid: 919, title: 'File:short clip.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/s/9/short-clip.webm', mime: 'video/webm', size: 11, width: 640, height: 360, extmetadata: { Artist: { value: 'Creator' }, LicenseShortName: { value: 'CC BY 4.0' } } }] }] } });
    if (url.hostname === 'upload.wikimedia.org') return new Response('video-bytes', { headers: { 'content-type': 'video/webm' } });
    throw new Error(`unexpected URL ${url}`);
  };
  try {
    const photo = await runEp001KoreanRoute('kogl-photo', 'acquire', { query: 'needle', page: 2, batchSize: 1 });
    assert.equal(photo.result.downloaded, 1);
    assert.ok(calls.some(({ url }) => url.hostname === 'www.kogl.or.kr' && url.pathname.endsWith('/second.jpg')));
    const video = await runEp001KoreanRoute('wikimedia-korea-fallback', 'acquire', { query: 'short clip', page: 2, batchSize: 1, mediaType: 'video' });
    assert.equal(video.result.downloaded, 1);
    const commonsUrl = calls.find(({ url }) => url.hostname === 'commons.wikimedia.org').url;
    assert.equal(commonsUrl.searchParams.get('gsrsearch'), 'short clip filetype:video');
    assert.equal(commonsUrl.searchParams.get('gsroffset'), '1');
    assert.equal(commonsUrl.searchParams.get('gsrlimit'), '1');
    assert.equal(photo.production_authority, false); assert.equal(video.production_authority, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDb === undefined) delete process.env.ARCHIVE_DB_PATH; else process.env.ARCHIVE_DB_PATH = previousDb;
    if (previousRaw === undefined) delete process.env.ARCHIVE_RAW_ROOT; else process.env.ARCHIVE_RAW_ROOT = previousRaw;
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10 });
  }
});
