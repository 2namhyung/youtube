import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { runEpisodeMediaDiscovery, rankCandidatesForAcquisition } = await import('../video/scripts/search-episode-media.mjs');

function fixtureSpec(extra = []) {
  return { production_decision: { asset_search_briefs: [
    { brief_id: 'box-broll', subject: 'shipping box', action: 'packing a parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: ['택배 상자'], queries_en: ['shipping box'], provider_routes: ['commons-object', 'kogl-photo', 'kogl-video'], exclusions: ['readable text'] },
    ...extra,
  ] } };
}
function commonsPayload(mediaType, pageId = 101) {
  const mime = mediaType === 'photo' ? 'image/jpeg' : 'video/webm';
  const extension = mediaType === 'photo' ? 'jpg' : 'webm';
  return { query: { pages: [{ pageid: pageId, title: `File:shipping box on table.${extension}`, categories: [{ title: 'Category:Cardboard boxes' }], imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/box-${mediaType}.${extension}`, mime, size: 2048, width: 640, height: 480, extmetadata: { Artist: { value: 'Artist One' }, LicenseShortName: { value: 'CC BY 4.0' }, UsageTerms: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }, ImageDescription: { value: 'A shipping box on a table.' } } }] }] } };
}
function mockFetch(calls, options = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input)); calls.push({ url: url.toString(), init });
    if (url.hostname === 'commons.wikimedia.org') {
      const query = url.searchParams.get('gsrsearch') ?? '';
      if (query.includes('failure term')) return new Response('unavailable', { status: 503 });
      if (query.includes('empty term')) return Response.json({ query: { pages: [] } });
      const type = query.includes('filetype:video') ? 'video' : 'photo';
      return Response.json(commonsPayload(type, type === 'photo' ? 101 : 202));
    }
    if (url.hostname === 'www.data.go.kr' && url.pathname.endsWith('selectFileDataDownload.do')) return Response.json({ atchFileId: 'FIXTURE', fileDetailSn: '1' });
    if (url.hostname === 'www.data.go.kr' && url.pathname.endsWith('fileDownload.do')) return new Response(options.catalog ?? 'filename,originalfilename,webfilepath,filesize,extension,creator,license,rights\nshipping_box_photo.jpg,shipping box packing,/upload_recommend/shipping_box_photo.jpg,12,jpg,Public creator,KOGL-1,Creator provided\nshipping_box_video.webm,shipping box packing,/upload_recommend/shipping_box_video.webm,24,webm,Video creator,KOGL-2,Third party rights pending\n', { headers: { 'content-type': 'text/csv' } });
    if (url.hostname === 'upload.wikimedia.org' && options.assetBytes) return new Response(options.assetBytes, { headers: { 'content-type': options.assetMime ?? 'image/png' } });
    throw new Error(`unexpected request: ${url}`);
  };
}

test('plan mode reads distinct brief queries and provider/media routes without network access', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-plan-'));
  try {
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec: fixtureSpec(), outputRoot, generatedAt: '2026-09-13T00:00:00.000Z', fetchImpl: async () => { throw new Error('plan must not make network calls'); } });
    assert.equal(ledger.run_mode, 'plan-no-network');
    assert.ok(ledger.requested_queries.some((item) => item.requested_query === '택배 상자' && item.provider === 'commons' && item.media_type === 'photo'));
    assert.ok(ledger.requested_queries.some((item) => item.requested_query === 'shipping box' && item.provider === 'kogl' && item.media_type === 'video'));
    assert.equal(ledger.candidates.length, 0);
    assert.equal(ledger.production_decision.source_mode_preserved, true);
    assert.equal(ledger.production_decision.production_authority, false);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('provider-filtered runs still report declared provider routes not implemented by this discovery revision', async () => {
  const spec = fixtureSpec([{ brief_id: 'official-source', subject: 'official evidence', action: '', role: 'off-canvas-evidence', specificity: 'exact-source', queries_ko: [], queries_en: ['official source item'], provider_routes: ['official-law-evidence'], exclusions: [] }]);
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec, providers: ['commons'], writeLedger: false });
  assert.equal(ledger.searches.every((search) => search.provider === 'commons'), true);
  assert.ok(ledger.unsupported_routes.some((route) => route.route === 'official-law-evidence' && route.brief_id === 'official-source'));
});

test('per-cut briefs are sampled across the episode and the query offset advances the next bounded window', async () => {
  const cuts = Array.from({ length: 30 }, (_, index) => ({
    shot_id: `SH${String(index + 1).padStart(3, '0')}`, production_mode: index % 2 ? 'motion-graphics' : 'source-video',
    production_decision: { mode: index % 2 ? 'remotion' : 'source-video', asset_search_briefs: [{ brief_id: `brief-${index + 1}`, subject: `object topic ${index + 1}`, action: 'show one object', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: [`unique object ${index + 1}`], provider_routes: ['commons-object'], exclusions: [] }] },
  }));
  const spec = { cuts };
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-cursor-'));
  try {
  const first = await runEpisodeMediaDiscovery({ mode: 'plan', spec, outputRoot, maxQueries: 6, queryOffset: 0, generatedAt: '2026-09-13T00:00:03.000Z' });
  const second = await runEpisodeMediaDiscovery({ mode: 'plan', spec, outputRoot, maxQueries: 6, queryOffset: 6, generatedAt: '2026-09-13T00:00:04.000Z' });
  const firstCuts = new Set(first.ledger.searches.map((item) => item.cut_id));
  const secondCuts = new Set(second.ledger.searches.map((item) => item.cut_id));
  assert.equal(firstCuts.size, 6);
  assert.equal(secondCuts.size, 6);
  assert.equal([...firstCuts].some((cutId) => secondCuts.has(cutId)), false);
  assert.equal(first.ledger.query_limits.next_query_offset, 6);
  assert.equal(second.ledger.query_limits.next_query_offset, 12);
  assert.equal(first.ledger.searches.some((item) => item.executed_query !== null), false);
  assert.equal(second.ledger.searches.some((item) => item.production_mode === 'motion-graphics' && item.selected_mode === 'remotion'), true);
  assert.equal(first.ledger.source_binding.episode_spec_sha256, second.ledger.source_binding.episode_spec_sha256);
  const changedSpec = structuredClone(spec); changedSpec.cuts[0].production_decision.asset_search_briefs[0].queries_en[0] = 'changed query';
  await assert.rejects(() => runEpisodeMediaDiscovery({ mode: 'plan', spec: changedSpec, outputRoot, maxQueries: 6, queryOffset: 12, generatedAt: '2026-09-13T00:00:05.000Z' }), /cursor is unbound or stale/);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('cut filter runs only requested gap briefs and puts declared observed action queries into the plan', async () => {
  const makeCut = (shot_id, brief_id) => ({ shot_id, production_mode: 'source-video', production_decision: { mode: 'source-video', asset_search_briefs: [{
    brief_id, subject: 'record handling', action: 'review records', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: [],
    observed_gap_queries: ['hand removes hard drive from DVR close up'], provider_routes: ['commons-object'], exclusions: [],
  }] } });
  const spec = { cuts: [makeCut('SH012', 'SH012-case-record'), makeCut('SH020', 'SH020-case-record')] };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec, cutIds: ['SH012'], allQueryWindows: true, writeLedger: false });
  assert.deepEqual(ledger.source_binding.cut_filter, ['SH012']);
  assert.equal(ledger.searches.every((item) => item.cut_id === 'SH012'), true);
  assert.ok(ledger.searches.some((item) => item.query_strategy === 'observed-gap-action' && item.requested_query === 'hand removes hard drive from DVR close up'));
  assert.equal(ledger.searches.some((item) => item.cut_id === 'SH020'), false);
});

test('generic SH012 briefs use their own semantics and never inherit the old DVR action map', async () => {
  const spec = { cuts: [{ shot_id: 'SH012', production_mode: 'source-video', production_decision: { mode: 'source-video', asset_search_briefs: [{
    brief_id: 'SH012-generic-v3', subject: 'record handling', action: 'review records', role: 'full-frame', specificity: 'generic-object',
    queries_ko: [], queries_en: [], provider_routes: ['commons-object'], exclusions: [],
  }] } }] };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec, allQueryWindows: true, writeLedger: false });
  const queries = ledger.requested_queries.map((item) => item.requested_query);
  assert.ok(queries.includes('record handling review records'));
  assert.equal(queries.some((query) => query.includes('hand removes hard drive from DVR')), false);
  assert.equal(queries.some((query) => query.includes('security camera recorder')), false);
});

test('declared observed gaps and required evidence run before broad script queries', async () => {
  const spec = { cuts: [{ shot_id: 'GAP', production_mode: 'source-video', production_decision: { mode: 'source-video', asset_search_briefs: [{
    brief_id: 'gap-priority', subject: 'case file', action: 'review records', place_context: 'service desk', viewpoint: 'close view', role: 'full-frame', specificity: 'generic-object',
    observed_gap_queries: [{ query: 'hands compare missing account records', dimension: 'action' }, { query: 'case file close view', dimension: 'viewpoint' }],
    required_evidence: ['document review at desk'], queries_ko: [], queries_en: ['case file general'], provider_routes: ['commons-object'], exclusions: [],
  }] } }] };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec, allQueryWindows: true, writeLedger: false });
  const queries = ledger.requested_queries;
  assert.deepEqual(queries.slice(0, 2).map((item) => item.requested_query), ['hands compare missing account records', 'case file close view']);
  assert.equal(queries[0].query_strategy, 'observed-gap-action');
  assert.equal(queries[1].query_strategy, 'observed-gap-viewpoint');
  assert.equal(queries[2].requested_query, 'document review at desk');
  assert.equal(queries[2].query_strategy, 'required-evidence');
  assert.ok(queries.find((item) => item.requested_query === 'case file review records' && item.query_strategy === 'subject-action'));
  assert.ok(queries.find((item) => item.requested_query === 'case file close view' && item.query_strategy === 'observed-gap-viewpoint'));
});

test('cut production mode limits Commons and KOGL searches to relevant media and expands semantic search fields', async () => {
  const makeCut = (id, mode, brief) => ({ shot_id: id, production_mode: mode, production_decision: { mode, asset_search_briefs: [brief] } });
  const brief = (id, extra = {}) => ({ brief_id: id, subject: 'court exterior', action: 'visitors entering', place_context: 'Seoul', viewpoint: 'wide view', role: 'full-frame', specificity: 'generic-object', queries_ko: ['법원 외관'], queries_en: [], provider_routes: ['commons-object', 'kogl-photo', 'kogl-video'], exclusions: [], ...extra });
  const spec = { cuts: [
    makeCut('PHOTO', 'source-photo', brief('photo')),
    makeCut('VIDEO', 'source-video', brief('video')),
    makeCut('REMOTION', 'remotion', brief('remotion')),
    makeCut('OMNI', 'omni', brief('omni')),
  ] };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec, maxQueries: 24, writeLedger: false });
  const requested = ledger.requested_queries;
  assert.equal(requested.filter((item) => item.cut_id === 'PHOTO').every((item) => item.media_type === 'photo'), true);
  assert.equal(requested.filter((item) => item.cut_id === 'VIDEO').every((item) => item.media_type === 'video'), true);
  assert.equal(requested.filter((item) => item.cut_id === 'REMOTION').every((item) => item.media_type === 'photo'), true);
  assert.equal(requested.some((item) => item.cut_id === 'OMNI'), false);
  assert.ok(requested.some((item) => item.cut_id === 'PHOTO' && item.requested_query === 'court exterior visitors entering' && item.query_strategy === 'subject-action'));
  assert.ok(requested.some((item) => item.cut_id === 'PHOTO' && item.requested_query === 'court exterior Seoul' && item.query_strategy === 'subject-place'));
  assert.ok(requested.some((item) => item.cut_id === 'PHOTO' && item.requested_query === 'court exterior wide view' && item.query_strategy === 'subject-viewpoint'));
  assert.equal(requested.some((item) => item.cut_id === 'VIDEO' && item.provider_route === 'kogl-photo'), false);
  assert.equal(requested.some((item) => item.cut_id === 'PHOTO' && item.provider_route === 'kogl-video'), false);
});

test('explicit automatic traversal plans every bounded query window in one run', async () => {
  const cuts = Array.from({ length: 5 }, (_, index) => ({
    shot_id: `AUTO${index}`, production_mode: 'source-photo', production_decision: { mode: 'source-photo', asset_search_briefs: [{
      brief_id: `auto-${index}`, subject: `object ${index}`, action: `handling item ${index}`, role: 'full-frame', specificity: 'generic-object',
      queries_ko: [], queries_en: [`item ${index}`], provider_routes: ['commons-object'], exclusions: [],
    }] },
  }));
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec: { cuts }, allQueryWindows: true, maxQueries: 3, writeLedger: false });
  assert.ok(ledger.query_limits.selected_queries > ledger.query_limits.max_executed_queries);
  assert.equal(ledger.query_limits.query_windows_traversed, ledger.query_limits.total_query_windows);
  assert.equal(ledger.query_limits.remaining_queries, 0);
  assert.equal(ledger.query_limits.next_query_offset, ledger.query_limits.distinct_query_requests);
});

test('bounded downloads prioritize brief coverage, then semantic novelty with stable tie breaking', () => {
  const candidate = (id, title, briefs) => ({ candidate_id: id, title, description: '', categories: [], provenance_matches: briefs.map((brief_id) => ({ brief_id })) });
  const ranked = rankCandidatesForAcquisition([
    { candidate: candidate('b', 'shipping cardboard box', ['b1']) },
    { candidate: candidate('c', 'warehouse forklift loading dock', ['b1']) },
    { candidate: candidate('a', 'shipping cardboard box', ['b1', 'b2']) },
  ], 2);
  assert.deepEqual(ranked.map((item) => item.candidate.candidate_id), ['a', 'c']);
  assert.equal(ranked[0].newly_covered_brief_count, 2);
  assert.equal(ranked[1].semantic_novelty_score, 1);
});

test('execute passes each query and media type, records errors and empty results, and deduplicates without acquiring', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-execute-'));
  const extra = [
    { brief_id: 'empty', subject: 'shipping box', action: '', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['empty term'], provider_routes: ['commons-object'], exclusions: [] },
    { brief_id: 'failure', subject: 'shipping box', action: '', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['failure term'], provider_routes: ['commons-object'], exclusions: [] },
    { brief_id: 'mismatch', subject: 'shipping box', action: '', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['mismatch term'], provider_routes: ['commons-object'], exclusions: [] },
    { brief_id: 'shared', subject: 'shipping box', action: '', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box'], provider_routes: ['commons-object'], exclusions: [] },
  ];
  const calls = [];
  try {
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec: fixtureSpec(extra), outputRoot, generatedAt: '2026-09-13T00:00:01.000Z', commonsMinIntervalMs: 0, sleepImpl: async () => {}, fetchImpl: mockFetch(calls) });
    assert.ok(calls.some((call) => call.url.includes('gsrsearch=shipping+box+filetype%3Abitmap')));
    assert.ok(calls.some((call) => call.url.includes('gsrsearch=shipping+box+filetype%3Avideo')));
    assert.ok(calls.some((call) => call.url.includes('gsrsearch=empty+term')));
    assert.ok(calls.some((call) => call.url.includes('gsrsearch=failure+term')));
    assert.ok(calls.some((call) => call.url.includes('gsrsearch=mismatch+term')));
    assert.equal(ledger.searches.some((item) => item.status === 'empty'), true);
    assert.equal(ledger.searches.some((item) => item.status === 'filtered-query-mismatch' && item.query_mismatch_count === 1), true);
    assert.equal(ledger.searches.some((item) => item.status === 'error' && item.error === 'http_503'), true);
    const commonsPhoto = ledger.candidates.find((candidate) => candidate.provider === 'commons' && candidate.media_type === 'photo');
    assert.ok(commonsPhoto);
    assert.equal(commonsPhoto.creator_raw_label, 'Artist One');
    assert.equal(commonsPhoto.license_raw_label, 'CC BY 4.0');
    assert.ok(commonsPhoto.provenance_matches.length >= 2);
    assert.equal(ledger.candidates.length, 4, JSON.stringify({ candidates: ledger.candidates.map((candidate) => [candidate.provider, candidate.media_type, candidate.title]), searches: ledger.searches }));
    assert.equal(ledger.acquisition_summary.downloaded_candidates, 0);
    assert.equal(ledger.candidates.every((candidate) => candidate.asset_acquisition.status === 'metadata-only'), true);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('explicit Commons object download stores only a decodable pending-review original with hash', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#8b7355' } }).jpeg().toBuffer();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-download-'));
  const calls = [];
  try {
    const spec = { production_decision: { asset_search_briefs: [fixtureSpec().production_decision.asset_search_briefs[0]] } };
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, outputRoot, downloadCandidates: 1, commonsMinIntervalMs: 0, sleepImpl: async () => {}, generatedAt: '2026-09-13T00:00:02.000Z', fetchImpl: mockFetch(calls, { assetBytes: bytes, assetMime: 'image/jpeg' }) });
    const acquired = ledger.candidates.find((candidate) => candidate.asset_acquisition.status === 'downloaded-candidate-pending-human-review');
    assert.ok(acquired);
    assert.match(acquired.asset_acquisition.sha256, /^[a-f0-9]{64}$/);
    assert.equal(acquired.asset_acquisition.decoded, true);
    assert.equal(acquired.semantic_review, 'pending');
    assert.equal(ledger.acquisition_summary.production_eligible, false);
    const diskPath = path.join(outputRoot, 'originals', 'commons', `${acquired.candidate_id}.jpg`);
    assert.ok(fs.existsSync(diskPath));
    assert.ok(calls.some((call) => call.url.startsWith('https://upload.wikimedia.org/')));
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('object-purpose metadata about users does not count as a pictured identifiable person', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#8b7355' } }).jpeg().toBuffer();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-object-purpose-'));
  const calls = [];
  const base = mockFetch(calls, { assetBytes: bytes, assetMime: 'image/jpeg' });
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== 'commons.wikimedia.org') return base(input, init);
    const mediaType = url.searchParams.get('gsrsearch')?.includes('filetype:video') ? 'video' : 'photo';
    const page = commonsPayload(mediaType, mediaType === 'photo' ? 651 : 652).query.pages[0];
    page.title = `File:shipping box for assistive use.${mediaType === 'photo' ? 'jpg' : 'webm'}`;
    page.categories = [{ title: 'Category:Equipment for people with visual impairment' }, { title: 'Category:Cardboard boxes' }];
    page.imageinfo[0].extmetadata.ImageDescription = { value: 'A shipping box intended for low-vision accessibility equipment.' };
    return Response.json({ query: { pages: [page] } });
  };
  try {
    const spec = { production_decision: { asset_search_briefs: [fixtureSpec().production_decision.asset_search_briefs[0]] } };
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, providers: ['commons'], outputRoot, downloadCandidates: 1, commonsMinIntervalMs: 0, sleepImpl: async () => {}, generatedAt: '2026-09-13T00:00:06.000Z', fetchImpl });
    const candidate = ledger.candidates.find((item) => item.asset_acquisition.status === 'downloaded-candidate-pending-human-review');
    assert.ok(candidate);
    assert.equal(candidate.semantic_review, 'pending');
    assert.equal(candidate.rights_review, 'pending');
    assert.equal(ledger.acquisition_summary.production_eligible, false);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('SHA-256 duplicate downloads remain distinct metadata matches but store one original', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#8b7355' } }).jpeg().toBuffer();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-sha-dedup-'));
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input)); calls.push(url.toString());
    if (url.hostname === 'commons.wikimedia.org') {
      const search = url.searchParams.get('gsrsearch') ?? '';
      const mediaType = search.includes('filetype:video') ? 'video' : 'photo';
      const query = search.split(' filetype:')[0];
      const blocked = mediaType === 'video';
      return Response.json({ query: { pages: [{ pageid: query.includes('cardboard') ? 102 : 101, title: `File:${query}.${mediaType === 'photo' ? 'jpg' : 'webm'}`, categories: [{ title: blocked ? 'Category:People' : 'Category:Cardboard boxes' }], imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/${query.replaceAll(' ', '-')}.${mediaType === 'photo' ? 'jpg' : 'webm'}`, mime: mediaType === 'photo' ? 'image/jpeg' : 'video/webm', size: bytes.byteLength, width: 640, height: 480, extmetadata: { Artist: { value: 'Creator' }, LicenseShortName: { value: 'CC BY 4.0' }, ImageDescription: { value: 'Shipping box.' } } }] }] } });
    }
    if (url.hostname === 'upload.wikimedia.org') return new Response(bytes, { headers: { 'content-type': 'image/jpeg' } });
    throw new Error(`unexpected request ${url}`);
  };
  const spec = { production_decision: { asset_search_briefs: [{ brief_id: 'box', subject: 'shipping box', action: 'show a box', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box', 'cardboard box'], provider_routes: ['commons-object'], exclusions: [] }] } };
  try {
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, outputRoot, downloadCandidates: 2, commonsMinIntervalMs: 0, sleepImpl: async () => {}, generatedAt: '2026-09-13T00:00:05.000Z', fetchImpl });
    assert.equal(ledger.acquisition_summary.downloaded_candidates, 1);
    assert.equal(ledger.candidates.filter((candidate) => candidate.asset_acquisition.status === 'deduplicated-by-sha256').length, 1);
    assert.equal(fs.readdirSync(path.join(outputRoot, 'originals', 'commons')).length, 1);
    assert.equal(calls.filter((url) => url.startsWith('https://upload.wikimedia.org/')).length, 2);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('Commons rate limiting backs off once on HTTP 429 and records the retry', async () => {
  const calls = []; const slept = []; let first = true;
  const fetchImpl = async (input) => {
    const url = new URL(String(input)); calls.push(url.toString());
    if (first) { first = false; return new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }); }
    const type = url.searchParams.get('gsrsearch')?.includes('filetype:video') ? 'video' : 'photo';
    return Response.json(commonsPayload(type, type === 'photo' ? 401 : 402));
  };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec: fixtureSpec(), providers: ['commons'], writeLedger: false, commonsMinIntervalMs: 0, sleepImpl: async (ms) => { slept.push(ms); }, fetchImpl });
  assert.equal(calls.length, ledger.searches.length + 1);
  assert.equal(slept[0], 1000);
  assert.equal(ledger.searches.filter((search) => search.retry_count === 1).length, 1);
  assert.equal(ledger.searches.some((search) => search.status === 'error'), false);
});

test('bounded download ledger explains why generic-object candidates were not acquired', async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-download-blockers-'));
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'commons.wikimedia.org') {
      const mediaType = url.searchParams.get('gsrsearch')?.includes('filetype:video') ? 'video' : 'photo';
      const candidate = commonsPayload(mediaType, mediaType === 'photo' ? 501 : 502).query.pages[0];
      candidate.categories = [{ title: 'Category:People' }];
      candidate.imageinfo[0].extmetadata.LicenseShortName = { value: 'CC BY 4.0' };
      return Response.json({ query: { pages: [candidate] } });
    }
    throw new Error(`unexpected request ${url}`);
  };
  try {
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec: fixtureSpec(), providers: ['commons'], outputRoot, downloadCandidates: 2, commonsMinIntervalMs: 0, sleepImpl: async () => {}, fetchImpl });
    assert.equal(ledger.acquisition_summary.downloaded_candidates, 0);
    assert.ok(ledger.candidate_download_checks.some((check) => check.status === 'rejected-precondition' && check.blockers.includes('person-category-present')));
    assert.ok(ledger.candidates.every((candidate) => candidate.asset_acquisition.local_path === null));
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('Pexels fallback route plans only the brief-selected media type and makes no network request', async () => {
  const makeCut = (id, mode, mediaType) => ({ shot_id: id, production_mode: mode, production_decision: { mode, asset_search_briefs: [{
    brief_id: `pexels-${id}`, subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object',
    queries_ko: ['택배 상자 포장'], queries_en: ['shipping box packing parcel'], provider_routes: ['pexels-generic-last'], media_type: mediaType, exclusions: [],
  }] } });
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'plan', spec: { cuts: [makeCut('PHOTO', 'source-photo', 'photo'), makeCut('VIDEO', 'source-video', 'video')] }, providers: ['pexels'], writeLedger: false, fetchImpl: async () => { throw new Error('plan must not make network calls'); } });
  assert.ok(ledger.requested_queries.some((item) => item.provider === 'pexels' && item.provider_route === 'pexels-generic-last' && item.cut_id === 'PHOTO' && item.media_type === 'photo'));
  assert.ok(ledger.requested_queries.some((item) => item.provider === 'pexels' && item.provider_route === 'pexels-generic-last' && item.cut_id === 'VIDEO' && item.media_type === 'video'));
  assert.equal(ledger.unsupported_routes.some((item) => item.route === 'pexels-generic-last'), false);
  assert.equal(ledger.candidates.length, 0);
  assert.equal(ledger.production_decision.production_authority, false);
});

test('Pexels API candidates retain creator, item, license and media provenance for photos and videos', async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    assert.equal(url.hostname, 'api.pexels.com');
    assert.equal(init.headers.Authorization, 'fixture-pexels-key');
    if (url.pathname === '/v1/search') return Response.json({ photos: [
      { id: 701, width: 1600, height: 900, url: 'https://www.pexels.com/photo/shipping-box-701/', photographer: 'Photo Maker', photographer_url: 'https://www.pexels.com/@photo-maker', src: { original: 'https://images.pexels.com/photos/701/box.jpeg', large2x: 'https://images.pexels.com/photos/701/box-large.jpeg' }, alt: 'A cardboard shipping box on a table.' },
      { id: 799, width: 1600, height: 900, url: 'https://www.pexels.com/photo/shipping-box-799/', photographer: 'Bad URL', src: { original: 'https://evil.example/box.jpeg' }, alt: 'A cardboard shipping box on a table.' },
    ] });
    if (url.pathname === '/v1/videos/search') return Response.json({ videos: [{ id: 702, width: 1920, height: 1080, duration: 8, url: 'https://www.pexels.com/video/packing-box-702/', user: { name: 'Video Maker', url: 'https://www.pexels.com/@video-maker' }, video_files: [{ width: 3840, file_size: 60_000_000, link: 'https://videos.pexels.com/video-files/702/4k.mp4', file_type: 'video/mp4' }, { width: 1280, file_size: 2_000_000, link: 'https://videos.pexels.com/video-files/702/hd.mp4', file_type: 'video/mp4' }] }] });
    throw new Error(`unexpected request: ${url}`);
  };
  const spec = { production_decision: { asset_search_briefs: [
    { brief_id: 'pex-photo', subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box packing parcel'], provider_routes: ['pexels-generic-last'], media_type: 'photo', exclusions: [] },
    { brief_id: 'pex-video', subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box packing parcel'], provider_routes: ['pexels-generic-last'], media_type: 'video', exclusions: [] },
  ] } };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, providers: ['pexels'], pexelsApiKey: 'fixture-pexels-key', maxQueries: 24, maxResults: 2, writeLedger: false, fetchImpl });
  assert.equal(calls.length, ledger.searches.length);
  assert.ok(calls.some(({ url }) => url.pathname === '/v1/search' && url.searchParams.get('locale') === 'ko-KR'));
  assert.ok(calls.some(({ url }) => url.pathname === '/v1/videos/search'));
  assert.equal(ledger.candidates.length, 2);
  const photo = ledger.candidates.find((item) => item.media_type === 'photo');
  const video = ledger.candidates.find((item) => item.media_type === 'video');
  assert.equal(photo.creator, 'Photo Maker'); assert.equal(photo.license_raw_label, 'Pexels License'); assert.equal(photo.rights_review, 'pending');
  assert.equal(video.creator, 'Video Maker'); assert.equal(video.duration_seconds, 8); assert.equal(video.bytes, 2_000_000); assert.equal(video.original_url, 'https://videos.pexels.com/video-files/702/hd.mp4');
  assert.equal(ledger.candidates.some((item) => item.original_host === 'evil.example'), false);
  assert.equal(ledger.acquisition_summary.production_eligible, false);
  assert.equal(ledger.production_decision.production_authority, false);
  assert.equal(JSON.stringify(ledger).includes('fixture-pexels-key'), false);
});

test('Pexels rate limiting uses exponential backoff when Retry-After is absent', async () => {
  let calls = 0; const slept = [];
  const spec = { production_decision: { asset_search_briefs: [{ brief_id: 'pex-retry', subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box'], provider_routes: ['pexels-generic-last'], media_type: 'photo', exclusions: [] }] } };
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response('rate limited', { status: 429 });
    return Response.json({ photos: [] });
  };
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, providers: ['pexels'], pexelsApiKey: 'fixture-pexels-key', writeLedger: false, pexelsMinIntervalMs: 0, sleepImpl: async (ms) => { slept.push(ms); }, fetchImpl });
  assert.equal(calls, ledger.searches.length + 1);
  assert.deepEqual(slept, [1000]);
  assert.equal(ledger.searches.filter((search) => search.retry_count === 1).length, 1);
  assert.equal(ledger.searches.some((search) => search.status === 'error'), false);
});

test('Pexels execute is blocked without a key and does not call the network', async () => {
  const spec = { production_decision: { asset_search_briefs: [{ brief_id: 'pex-no-key', subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box'], provider_routes: ['pexels-generic-last'], media_type: 'photo', exclusions: [] }] } };
  let calls = 0;
  const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, providers: ['pexels'], pexelsApiKey: null, writeLedger: false, fetchImpl: async () => { calls += 1; throw new Error('must not call without a key'); } });
  assert.equal(calls, 0);
  assert.ok(ledger.searches.every((item) => item.status === 'blocked' && item.error === 'pexels_api_key_missing'));
  assert.equal(ledger.candidates.length, 0);
});

test('Pexels bounded acquisition downloads only a decodable generic-object candidate for human review', async () => {
  const sharp = (await import('sharp')).default;
  const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#8b7355' } }).jpeg().toBuffer();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-media-pexels-download-'));
  const spec = { production_decision: { asset_search_briefs: [{ brief_id: 'pex-box', subject: 'shipping box', action: 'packing parcel', role: 'full-frame', specificity: 'generic-object', queries_ko: [], queries_en: ['shipping box packing parcel'], provider_routes: ['pexels-generic-last'], media_type: 'photo', exclusions: [] }] } };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.pexels.com') {
      assert.equal(init.headers.Authorization, 'fixture-pexels-key');
      return Response.json({ photos: [{ id: 703, width: 1200, height: 800, url: 'https://www.pexels.com/photo/shipping-box-703/', photographer: 'Box Maker', src: { original: 'https://images.pexels.com/photos/703/box.jpeg' }, alt: 'A cardboard shipping box on a table.' }] });
    }
    if (url.hostname === 'images.pexels.com') return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
    throw new Error(`unexpected request: ${url}`);
  };
  try {
    const { ledger } = await runEpisodeMediaDiscovery({ mode: 'execute', spec, providers: ['pexels'], pexelsApiKey: 'fixture-pexels-key', outputRoot, downloadCandidates: 1, writeLedger: false, fetchImpl });
    const candidate = ledger.candidates.find((item) => item.asset_acquisition.status === 'downloaded-candidate-pending-human-review');
    assert.ok(candidate);
    assert.equal(candidate.asset_acquisition.decoded, true);
    assert.equal(candidate.asset_acquisition.production_authority, false);
    assert.match(candidate.asset_acquisition.sha256, /^[a-f0-9]{64}$/);
    assert.ok(fs.existsSync(path.join(outputRoot, 'originals', 'pexels', `${candidate.candidate_id}.jpg`)));
    assert.equal(candidate.rights_review, 'pending');
    assert.equal(ledger.acquisition_summary.production_eligible, false);
  } finally { fs.rmSync(outputRoot, { recursive: true, force: true }); }
});

test('Korean official route becomes an allowlisted manual item plan without scraping or approval', async () => {
  const spec={cuts:[{shot_id:'SH-POLICE',production_mode:'source-video',production_decision:{mode:'source-video',asset_search_briefs:[{
    brief_id:'police-intake',subject:'경찰서 민원실',action:'수사관이 사건기록을 접수',place_context:'대한민국 경찰서',viewpoint:'실내 와이드',role:'full-frame',specificity:'korea-institution',queries_ko:['경찰서 사건기록 접수'],queries_en:[],provider_routes:['korean-official-open-item'],exclusions:[],
  }]}}]};
  let calls=0;
  const {ledger}=await runEpisodeMediaDiscovery({mode:'execute',spec,providers:['korean-official'],writeLedger:false,fetchImpl:async()=>{calls+=1;throw new Error('official manual plan must not scrape');}});
  assert.equal(calls,0);
  assert.equal(ledger.unsupported_routes.some((item)=>item.route==='korean-official-open-item'),false);
  assert.ok(ledger.official_route_plans.length>0);
  assert.ok(ledger.official_route_plans.every((plan)=>plan.route_id==='national-police-official'));
  assert.ok(ledger.official_route_plans.every((plan)=>plan.production_authority===false));
  assert.ok(ledger.searches.every((search)=>search.status==='manual-official-item-discovery-required'));
  assert.equal(ledger.candidates.length,0);
});
