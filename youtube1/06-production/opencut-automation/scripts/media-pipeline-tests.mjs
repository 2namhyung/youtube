import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseIsoDuration, parseYouTubeSearchResponse, verifyYouTubeVideosResponse, assertAuthorizedLocalMedia, assertSafeMediaProjectSlug, extractAuthorizedClip, generateBgm, ingestOfficialSource, loadYouTubeApiKey, validateOfficialSourceUrl, validatePlaylistReferences } from './media-pipeline.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'media-pipeline-'));
const outsideFile = path.join(path.dirname(temp), `${path.basename(temp)}-outside.mp4`);
try {
  const keyFile = path.join(temp, 'api.txt'); fs.writeFileSync(keyFile, 'YOUTUBE_API_KEY=dummy-fixture-key\n', 'utf8');
  assert.equal(loadYouTubeApiKey({ env: {}, filePath: keyFile }), 'dummy-fixture-key');
  assert.equal(parseIsoDuration('PT1M12.5S'), 72.5);
  const candidates = parseYouTubeSearchResponse({ items: [{ id: { videoId: 'abc' }, snippet: { title: 'CC clip', channelTitle: 'channel', thumbnails: { default: { url: 'https://img.test/a.jpg' } } } }] });
  const verified = verifyYouTubeVideosResponse(candidates, { items: [{ id: 'abc', snippet: { title: 'CC clip' }, contentDetails: { duration: 'PT12S' }, status: { license: 'creativeCommon', embeddable: true } }] });
  assert.equal(verified[0].durationSeconds, 12); assert.equal(verified[0].licenseSnapshot.license, 'creativeCommon');
  const source = path.join(temp, 'source.mp4'); fs.writeFileSync(source, Buffer.alloc(10));
  assert.throws(() => assertAuthorizedLocalMedia(source, temp, { rightsAttested: false }), /attestation/);
  assert.equal(assertAuthorizedLocalMedia(source, temp, { rightsAttested: true }).mime, 'video/mp4');
  assert.equal(assertSafeMediaProjectSlug('electric-bus-fares'), 'electric-bus-fares');
  assert.throws(() => assertSafeMediaProjectSlug('../../escape'), /slug/);
  await assert.rejects(() => ingestOfficialSource({ sourceUrl: 'https://media.example/source.m3u8', articleUrl: 'https://media.example/article', publisher: 'fixture', allowedHosts: new Set(['media.example']), projectSlug: '../../escape', workspaceRoot: temp, candidate: { rightsReview: { status: 'completed', verdict: 'usable', attribution: 'fixture' } } }), /slug/);
  fs.writeFileSync(outsideFile, Buffer.alloc(10));
  assert.rejects(() => import('./media-pipeline.mjs').then(({ assertAuthorizedLocalMedia: check }) => check(outsideFile, temp, { rightsAttested: true })), /workspace/);
  const workspace = path.join(temp, 'workspace'); const outside = path.join(temp, 'outside');
  fs.mkdirSync(workspace); fs.mkdirSync(outside); fs.writeFileSync(path.join(workspace, 'inside.mp4'), Buffer.alloc(10)); fs.writeFileSync(path.join(outside, 'linked.mp4'), Buffer.alloc(10));
  const linked = path.join(workspace, 'linked'); fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertAuthorizedLocalMedia(path.join(linked, 'linked.mp4'), workspace, { rightsAttested: true }), /workspace/);
  await assert.rejects(() => extractAuthorizedClip({ sourcePath: path.join(workspace, 'inside.mp4'), outputPath: path.join(linked, 'out.mp4'), workspaceRoot: workspace, rightsAttested: true, startSeconds: 0, endSeconds: 1, ffmpeg: 'unused' }), /output parent/);
  const unavailable = await generateBgm({ provider: 'stable-audio-3', outputPath: path.join(temp, 'bgm.wav'), env: {} });
  assert.equal(unavailable.status, 'unavailable');
  await assert.rejects(() => validateOfficialSourceUrl('http://vod.kctvjeju.com/a'), /HTTPS/);
  await assert.rejects(() => validateOfficialSourceUrl('https://example.com/a'), /allowlisted/);
  await assert.rejects(() => validateOfficialSourceUrl('https://vod.kctvjeju.com/a', { fetchImpl: async () => ({ ok: false, status: 302, headers: new Headers(), text: async () => '' }) }), /redirects/);
  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
  await assert.rejects(() => validatePlaylistReferences({ contentType: 'application/vnd.apple.mpegurl', url: new URL('https://media.example/master.m3u8') }, {
    allowedHosts: new Set(['media.example']), lookup: publicLookup,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://evil.example/key"\nsegment.ts\n' }),
  }), /allowlisted/);
  console.log('media pipeline tests passed');
} finally { fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(outsideFile, { force: true }); }
