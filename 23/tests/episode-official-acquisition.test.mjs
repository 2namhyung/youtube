import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';

const {openArchiveDb} = await import('../src/lib/db.ts');
const {prepareOfficialAcquisition, prepareNewsAcquisition, prepareEpisodeAcquisition, buildAcquisitionQueueReport, readCandidateRows, validateRegisteredCandidates, validateNewsCandidates} = await import('../src/lib/episode-official-acquisition.ts');

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const structuredPageCapture = ({file, sourceId, url, relativePath, locator}) => ({
  version: 1,
  captured_at: '2026-09-06T10:04:09.078Z',
  capture_tool: '@remotion/renderer Chromium CDP Page.captureScreenshot',
  exact_url: url,
  locator,
  viewport: {width: 1440, height: 1080, device_scale_factor: 1},
  actual_mime: 'image/png',
  actual_extension: path.extname(relativePath),
  capture_sha256: sha(file),
  source_candidate_status: 'unapproved-source-candidate',
  byte_preserved_copy: {relationship: 'byte-identical-copy-of-registry-capture', relative_path: `episode-media/episode-001/${sourceId}/${path.basename(relativePath)}`, sha256: sha(file)},
});
async function fixture({unsafe = false} = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ep001-official-'));
  const official = path.join(folder, 'official'); const raw = path.join(folder, 'raw'); const dbPath = path.join(folder, 'archive.sqlite');
  fs.mkdirSync(official, {recursive: true}); fs.mkdirSync(raw, {recursive: true});
  await sharp({create: {width: 8, height: 6, channels: 3, background: {r: 220, g: 190, b: 160}}}).png().toFile(path.join(official, 'one.png'));
  const entry = {source_id: 'LAW-TEST', title: 'fixture', relative_path: unsafe ? '../one.png' : 'one.png', media_type: 'photo', canonical_url: 'https://example.test/law', publisher: '공식 발행처', attribution: '원문 캡처', license: '항목별 이용조건 검토 필요', capture_locator: 'fixture', capture_provenance: 'fixture'};
  entry.recapture_provenance = structuredPageCapture({file:path.join(official, 'one.png'), sourceId:entry.source_id, url:entry.canonical_url, relativePath:entry.relative_path, locator:entry.capture_locator});
  const registryPath = path.join(official, 'intake-registry.json'); fs.writeFileSync(registryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: '검토 필요', entries: [entry]}));
  openArchiveDb(dbPath).close();
  return {folder, official, raw, dbPath, registryPath, source: path.join(official, 'one.png')};
}
function cleanup(folder) { fs.rmSync(folder, {recursive: true, force: true}); }

function makeVideo(file, {audioOnly = false, duration = 2} = {}) {
  const args = audioOnly
    ? ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', String(duration), '-c:a', 'aac', '-vn', file]
    : ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30', '-t', String(duration), '-c:v', 'mpeg4', '-an', file];
  const result = spawnSync('ffmpeg', args, {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr);
}

async function videoFixture({audioOnly = false, invalid = false} = {}) {
  const f = await fixture();
  const source = path.join(f.official, 'statement.mp4');
  if (invalid) fs.writeFileSync(source, 'not a video'); else makeVideo(source, {audioOnly});
  const timecode = {start: '00:00:00.250', end: '00:00:01.250', start_seconds: 0.25, end_seconds: 1.25, speaker: '김승원', context: '제22대 국회 제437회 제3차 본회의', locator: 'official player 00:00:00.250–00:00:01.250', locator_basis: 'official player and minutes'};
  const entry = {source_id: 'ASSEMBLY-VIDEO-TEST', title: 'official video fixture', relative_path: 'statement.mp4', media_type: 'video', canonical_url: 'https://w3.assembly.go.kr/main/player.do?no=1', publisher: '대한민국 국회', attribution: '국회 영상회의록시스템', license: 'review-required', capture_locator: timecode.locator, capture_provenance: 'fixture', expected_duration_seconds: 2, duration_tolerance_seconds: 0.1, preserve_full_original: true, timecode};
  fs.writeFileSync(f.registryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: 'review', entries: [entry]}));
  f.source = source;
  return f;
}

function insertHistoricalCandidate(dbPath, {id = 'LAW-SUPERSEDED', episodeId = 'episode-001', state = 'rejected', note = 'superseded by the active intake source'} = {}) {
  const db = openArchiveDb(dbPath);
  try {
    const properties = JSON.stringify({episode_id: episodeId, source_id: id, title: 'historical candidate'});
    const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json) VALUES (?,?,?,?)').run('media', id, 'historical candidate', properties);
    const media = db.prepare(`INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(Number(node.lastInsertRowid), 'photo', path.join(path.dirname(dbPath), `${id}.png`), 'https://example.test/historical', null, 'image/png', 1, 'review required', 'fixture', properties);
    db.prepare("UPDATE review_queue SET state=?,note=? WHERE entity_type='media_asset' AND entity_id=?").run(state, note, Number(media.lastInsertRowid));
    return Number(media.lastInsertRowid);
  } finally { db.close(); }
}

async function newsFixture() {
  const f = await fixture();
  const source = path.join(f.official, 'news.png');
  await sharp({create: {width: 11, height: 7, channels: 3, background: {r: 32, g: 90, b: 180}}}).jpeg().toFile(source);
  const entry = {source_id: 'NEWS-TEST', title: '뉴스 기사 제목', relative_path: 'news.png', media_type: 'photo', canonical_url: 'https://news.example.test/article', publisher: '뉴스 발행처', published_at: '2026-08-04T13:16:00+09:00', attribution: '기사 화면 캡처', license: 'editorial-use-review-required', capture_locator: '제목 영역', capture_provenance: 'fixture'};
  f.registryPath = path.join(f.official, 'news-intake-registry.json');
  fs.writeFileSync(f.registryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: '검토 필요', entries: [entry]}));
  f.source = source;
  return f;
}

test('dry-run validates without mutating DB or raw output', async () => {
  const f = await fixture();
  try {
    const beforeDb = sha(f.dbPath); const result = await prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.equal(result.dry_run, true); assert.equal(fs.existsSync(path.join(f.raw, 'episode-media')), false); assert.equal(sha(f.dbPath), beforeDb);
  } finally { cleanup(f.folder); }
});

test('new official-page captures fail closed without exact structured provenance', async () => {
  const f = await fixture();
  try {
    const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8'));
    delete registry.entries[0].recapture_provenance;
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({dryRun:true, registryPath:f.registryPath, dbPath:f.dbPath, rawRoot:f.raw}), /requires structured recapture provenance/u);
    registry.entries[0].recapture_provenance = structuredPageCapture({file:f.source, sourceId:'LAW-TEST', url:'https://example.test/law', relativePath:'one.png', locator:'fixture'});
    registry.entries[0].recapture_provenance.actual_mime = 'image/jpeg';
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({dryRun:true, registryPath:f.registryPath, dbPath:f.dbPath, rawRoot:f.raw}), /MIME\/extension/u);
    registry.entries[0].recapture_provenance.actual_mime = 'image/png';
    registry.entries[0].recapture_provenance.byte_preserved_copy.sha256 = '0'.repeat(64);
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({dryRun:true, registryPath:f.registryPath, dbPath:f.dbPath, rawRoot:f.raw}), /byte-preserved-copy/u);
  } finally { cleanup(f.folder); }
});

test('normal import is pending and idempotent', async () => {
  const f = await fixture();
  try {
    const first = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const second = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.equal(first.created_media_ids.length, 1); assert.deepEqual(second.deduped, first.created_media_ids);
    const rows = readCandidateRows(f.dbPath); assert.equal(rows.length, 1); assert.equal(rows[0].review_state, 'pending'); assert.equal(sha(rows[0].path), sha(f.source));
    const db = openArchiveDb(f.dbPath); try { assert.equal(db.prepare("SELECT kind FROM graph_nodes WHERE external_key='LAW-TEST'").get().kind, 'media'); } finally { db.close(); }
  } finally { cleanup(f.folder); }
});

test('official video intake ffprobes whole original, preserves exact timecode metadata, stays pending, and is idempotent', async () => {
  const f = await videoFixture();
  try {
    const dry = await prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.equal(dry.entries[0].mime_type, 'video/mp4');
    assert.equal(dry.entries[0].video_codec, 'mpeg4');
    assert.deepEqual([dry.entries[0].width, dry.entries[0].height], [160, 90]);
    assert.ok(Math.abs(dry.entries[0].duration_seconds - 2) < 0.1);
    const first = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const second = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.deepEqual(second.deduped, first.created_media_ids);
    const row = readCandidateRows(f.dbPath)[0];
    const properties = JSON.parse(row.properties_json);
    assert.equal(row.media_type, 'video');
    assert.equal(row.review_state, 'pending');
    assert.equal(properties.whole_original_preserved, true);
    assert.deepEqual(properties.source_timecode, JSON.parse(fs.readFileSync(f.registryPath, 'utf8')).entries[0].timecode);
    assert.equal(sha(row.path), sha(f.source));
  } finally { cleanup(f.folder); }
});

test('official video intake rejects invalid/no-video media, duration drift, and out-of-bounds timecodes', async () => {
  for (const setup of [
    {options: {invalid: true}, pattern: /decodable video/u},
    {options: {audioOnly: true}, pattern: /no positive-duration video stream/u},
    {mutate: (entry) => { entry.expected_duration_seconds = 8; }, pattern: /duration mismatch/u},
    {mutate: (entry) => { entry.timecode.end = '00:00:03.000'; entry.timecode.end_seconds = 3; }, pattern: /exceeds source duration/u},
  ]) {
    const f = await videoFixture(setup.options);
    try {
      if (setup.mutate) { const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8')); setup.mutate(registry.entries[0]); fs.writeFileSync(f.registryPath, JSON.stringify(registry)); }
      await assert.rejects(() => prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), setup.pattern);
      assert.equal(readCandidateRows(f.dbPath).length, 0);
    } finally { cleanup(f.folder); }
  }
});

test('dedupe validates the existing raw file before returning an id', async () => {
  const f = await fixture();
  try {
    const first = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const candidatePath = readCandidateRows(f.dbPath)[0].path;
    fs.writeFileSync(candidatePath, 'tampered');
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /existing candidate (file )?(byte count|hash) mismatch/u);
    fs.rmSync(candidatePath);
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /existing candidate file is missing/u);
    assert.deepEqual(readCandidateRows(f.dbPath).map((row) => row.id), first.created_media_ids);
  } finally { cleanup(f.folder); }
});

test('effective raw root uses ARCHIVE_RAW_ROOT in dry-run and write paths', async () => {
  const f = await fixture();
  const previous = process.env.ARCHIVE_RAW_ROOT;
  try {
    process.env.ARCHIVE_RAW_ROOT = f.raw;
    const dry = await prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath});
    assert.equal(dry.entries[0].destination.startsWith(path.resolve(f.raw)), true);
    const result = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath});
    assert.equal(readCandidateRows(f.dbPath)[0].path.startsWith(path.resolve(f.raw)), true);
    assert.equal(result.created_media_ids.length, 1);
  } finally {
    if (previous === undefined) delete process.env.ARCHIVE_RAW_ROOT; else process.env.ARCHIVE_RAW_ROOT = previous;
    cleanup(f.folder);
  }
});

test('dedupe rejects registry-to-DB metadata drift', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const db = openArchiveDb(f.dbPath);
    try { db.prepare('UPDATE media_assets SET license=? WHERE original_url=?').run('wrong-license', 'https://example.test/law'); } finally { db.close(); }
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /existing candidate metadata drift/u);
  } finally { cleanup(f.folder); }
});

test('validator rechecks registered candidate file integrity', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const result = await validateRegisteredCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.deepEqual(result.candidate_ids.length, 1);
    fs.writeFileSync(readCandidateRows(f.dbPath)[0].path, 'tampered');
    await assert.rejects(() => validateRegisteredCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /existing candidate (file )?(byte count|hash) mismatch/u);
  } finally { cleanup(f.folder); }
});

test('registered-candidate validation rejects null/non-positive bytes and empty MIME metadata', async () => {
  for (const mutation of [
    ['UPDATE media_assets SET bytes=NULL', /byte count mismatch/u],
    ['UPDATE media_assets SET bytes=0', /byte count mismatch/u],
    ["UPDATE media_assets SET mime_type=''", /MIME mismatch/u],
  ]) {
    const f = await fixture();
    try {
      await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
      const db = openArchiveDb(f.dbPath); try { db.exec(mutation[0]); } finally { db.close(); }
      await assert.rejects(() => validateRegisteredCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), mutation[1]);
    } finally { cleanup(f.folder); }
  }
});

test('symlinked official intake or raw candidate cannot escape its root', async (t) => {
  const f = await fixture();
  const outside = path.join(f.folder, 'outside.png');
  fs.copyFileSync(f.source, outside);
  const linkedOfficial = path.join(f.official, 'linked.png');
  try {
    try { fs.symlinkSync(outside, linkedOfficial, 'file'); } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') { t.skip('symlink privilege unavailable'); return; }
      throw error;
    }
    const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8'));
    registry.entries[0].relative_path = 'linked.png';
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /escapes root through a link/u);
  } finally { cleanup(f.folder); }
});

test('symlinked raw destination is rejected during candidate validation', async (t) => {
  const f = await fixture();
  const outside = path.join(f.folder, 'outside.png');
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const candidatePath = readCandidateRows(f.dbPath)[0].path;
    fs.copyFileSync(candidatePath, outside);
    fs.rmSync(candidatePath);
    try { fs.symlinkSync(outside, candidatePath, 'file'); } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') { t.skip('symlink privilege unavailable'); return; }
      throw error;
    }
    await assert.rejects(() => validateRegisteredCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /escapes root through a link/u);
  } finally { cleanup(f.folder); }
});

test('preflight rejects a later collision without leaving an earlier raw file', async () => {
  const f = await fixture();
  try {
    const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8'));
    const other = {...registry.entries[0], source_id: 'LAW-OTHER', recapture_provenance: structuredPageCapture({file:f.source, sourceId:'LAW-OTHER', url:registry.entries[0].canonical_url, relativePath:registry.entries[0].relative_path, locator:registry.entries[0].capture_locator})};
    registry.entries.push(other);
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /SHA-256 already belongs/u);
    assert.equal(fs.existsSync(path.join(f.raw, 'episode-media')), false);
    assert.equal(readCandidateRows(f.dbPath).length, 0);
  } finally { cleanup(f.folder); }
});

test('queue maps reuse and non-media work without changing requirement status', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements: [{requirement_id: 'r1', kind: 'source-original', source_id: 'LAW-TEST', status: 'blocked'}, {requirement_id: 'r2', kind: 'transparent-derivative', asset_id: 'layer'}]}]}, readCandidateRows(f.dbPath), 'registry', 'spec');
    assert.equal(report.requirements[0].status, 'candidate-pending-review'); assert.equal(report.requirements[1].status, 'blocked-non-media-work'); assert.equal(report.requirements[0].requirement_status, 'blocked');
  } finally { cleanup(f.folder); }
});

test('queue reports pending, approved, hold, rejected, and missing review states distinctly', () => {
  const base = {path: 'C:/raw/source.png', original_url: 'https://example.test/source', sha256: 'a'.repeat(64), mime_type: 'image/png', bytes: 10, license: 'review', attribution: 'fixture', review_note: null};
  const candidates = [
    {id: 1, source_id: 'SRC-PENDING', review_state: 'pending'},
    {id: 2, source_id: 'SRC-APPROVED', review_state: 'approved'},
    {id: 3, source_id: 'SRC-HOLD', review_state: 'hold'},
    {id: 4, source_id: 'SRC-REJECTED', review_state: 'rejected', review_note: 'rejected by reviewer'},
    {id: 5, source_id: 'SRC-NO-STATE', review_state: null},
  ].map((candidate) => ({...base, ...candidate, properties_json: JSON.stringify({episode_id: 'episode-001', source_id: candidate.source_id})}));
  const requirements = candidates.map((candidate, index) => ({requirement_id: `r${index + 1}`, kind: 'source-original', source_id: candidate.source_id}));
  const ids = candidates.map((candidate) => candidate.source_id);
  const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements}]}, candidates, 'registry', 'spec', ids);
  assert.deepEqual(report.requirements.map((item) => item.status), ['candidate-pending-review', 'approved-ready', 'candidate-on-hold', 'candidate-rejected-historical', 'candidate-missing-review-state']);
  assert.equal(report.requirements[3].candidate, null);
  assert.equal(report.requirements[3].historical_candidate.media_asset_id, 4);
  assert.equal(report.summary.registered_candidate_count, 4);
  assert.equal(report.summary.non_production_historical_candidate_count, 1);
});

test('queue summary separates registered candidates, linked source IDs, and requirement links', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements: [
      {requirement_id: 'r1', kind: 'source-original', source_id: 'LAW-TEST'},
      {requirement_id: 'r2', kind: 'source-original', source_id: 'LAW-TEST'},
      {requirement_id: 'r3', kind: 'source-original', source_id: 'OTHER'},
    ]}]}, readCandidateRows(f.dbPath), 'registry', 'spec', ['LAW-TEST', 'OTHER']);
    assert.deepEqual(report.summary.official_candidate_summary, {registered_candidates: 1, linked_source_ids: 1, requirement_links: 2});
  } finally { cleanup(f.folder); }
});

test('queue summary separates official, news, and aggregate registry groups', () => {
  const base = {path: 'C:/raw/source.png', original_url: 'https://example.test/source', sha256: 'b'.repeat(64), mime_type: 'image/png', bytes: 10, license: 'review', attribution: 'fixture', review_state: 'pending', review_note: null};
  const candidates = [
    {...base, id: 1, source_id: 'LAW-ONE', properties_json: JSON.stringify({episode_id: 'episode-001', source_id: 'LAW-ONE'})},
    {...base, id: 2, source_id: 'LAW-TWO', properties_json: JSON.stringify({episode_id: 'episode-001', source_id: 'LAW-TWO'})},
    {...base, id: 3, source_id: 'NEWS-ONE', properties_json: JSON.stringify({episode_id: 'episode-001', source_id: 'NEWS-ONE'})},
  ];
  const requirements = [
    {requirement_id: 'r1', kind: 'source-original', source_id: 'LAW-ONE'},
    {requirement_id: 'r2', kind: 'source-original', source_id: 'LAW-ONE'},
    {requirement_id: 'r3', kind: 'source-original', source_id: 'NEWS-ONE'},
  ];
  const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements}]}, candidates, {official: 'law', news: 'news'}, 'spec', {official: ['LAW-ONE', 'LAW-TWO'], news: ['NEWS-ONE']});
  assert.deepEqual(report.summary.official_candidate_summary, {registered_candidates: 2, linked_source_ids: 1, requirement_links: 2});
  assert.deepEqual(report.summary.news_candidate_summary, {registered_candidates: 1, linked_source_ids: 1, requirement_links: 1});
  assert.deepEqual(report.summary.candidate_summary, {registered_candidates: 3, linked_source_ids: 2, requirement_links: 3});
});

test('queue excludes superseded EP001 media from active counts and reports it as non-production history', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const historicalId = insertHistoricalCandidate(f.dbPath);
    const unrelatedId = insertHistoricalCandidate(f.dbPath, {id: 'OTHER-SUPERSEDED', episodeId: 'episode-other'});
    const requirements = [{requirement_id: 'r1', kind: 'source-original', source_id: 'LAW-TEST'}, {requirement_id: 'r2', kind: 'source-original', source_id: 'LAW-SUPERSEDED'}];
    const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements}]}, readCandidateRows(f.dbPath), 'registry', 'spec', ['LAW-TEST']);
    assert.equal(report.summary.registered_candidate_count, 1);
    assert.equal(report.summary.candidate_summary.registered_candidates, 1);
    assert.equal(report.requirements[0].candidate.media_asset_id < historicalId, true);
    assert.equal(report.requirements[1].candidate, null);
    assert.deepEqual(report.non_production_historical_candidates, [{media_asset_id: historicalId, source_id: 'LAW-SUPERSEDED', state: 'rejected', reason: 'superseded by the active intake source'}]);
    assert.equal(report.summary.non_production_historical_candidate_count, 1);
    assert.equal(report.non_production_historical_candidates.some((candidate) => candidate.media_asset_id === unrelatedId), false);
  } finally { cleanup(f.folder); }
});

test('registered-candidate validation tolerates an EP001 historical candidate outside the active registry', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    insertHistoricalCandidate(f.dbPath);
    const result = await validateRegisteredCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.deepEqual(result.candidate_count, 1);
  } finally { cleanup(f.folder); }
});

test('hostile registry traversal is rejected', async () => {
  const f = await fixture({unsafe: true});
  try { await assert.rejects(() => prepareOfficialAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /unsafe registry path/u); }
  finally { cleanup(f.folder); }
});

test('non-image and source hash collision fail without approval or replacement', async () => {
  const f = await fixture();
  try {
    const first = await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    fs.writeFileSync(f.source, 'not an image');
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /decodable image/u);
    assert.equal(readCandidateRows(f.dbPath)[0].id, first.created_media_ids[0]);
  } finally { cleanup(f.folder); }
});

test('different source id with identical bytes is a truthful collision', async () => {
  const f = await fixture();
  try {
    await prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8'));
    registry.entries.push({...registry.entries[0], source_id: 'LAW-OTHER', recapture_provenance: structuredPageCapture({file:f.source, sourceId:'LAW-OTHER', url:registry.entries[0].canonical_url, relativePath:registry.entries[0].relative_path, locator:registry.entries[0].capture_locator})});
    fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareOfficialAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /SHA-256 already belongs/u);
    assert.equal(readCandidateRows(f.dbPath).length, 1);
  } finally { cleanup(f.folder); }
});

test('news intake is separate, JPEG-decoded, pending, and idempotent', async () => {
  const f = await newsFixture();
  try {
    const dry = await prepareNewsAcquisition({dryRun: true, registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.equal(dry.entries[0].mime_type, 'image/jpeg');
    assert.equal(readCandidateRows(f.dbPath).length, 0);
    const first = await prepareNewsAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const second = await prepareNewsAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    assert.equal(first.created_media_ids.length, 1);
    assert.deepEqual(second.deduped, first.created_media_ids);
    const row = readCandidateRows(f.dbPath)[0];
    assert.equal(row.source_id, 'NEWS-TEST'); assert.equal(row.mime_type, 'image/jpeg'); assert.equal(row.review_state, 'pending');
    assert.equal(JSON.parse(row.properties_json).published_at, '2026-08-04T13:16:00+09:00');
    const db = openArchiveDb(f.dbPath); try { assert.equal(db.prepare("SELECT slug FROM source_registry WHERE slug='episode-001-news-intake'").get().slug, 'episode-001-news-intake'); } finally { db.close(); }
    await validateNewsCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    fs.writeFileSync(row.path, 'tampered');
    await assert.rejects(() => validateNewsCandidates({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /byte count|hash mismatch/u);
  } finally { cleanup(f.folder); }
});

test('combined official+news prepare prevalidates both before DB/raw mutation', async () => {
  const f = await fixture();
  const newsDir = path.join(f.folder, 'news'); fs.mkdirSync(newsDir);
  const newsRegistryPath = path.join(newsDir, 'intake-registry.json');
  fs.writeFileSync(path.join(newsDir, 'broken.png'), 'not an image');
  const newsEntry = {source_id: 'NEWS-BROKEN', title: 'broken', relative_path: 'broken.png', media_type: 'photo', canonical_url: 'https://news.example.test/broken', publisher: '뉴스', attribution: 'fixture', license: 'review required', capture_locator: 'title', capture_provenance: 'fixture'};
  fs.writeFileSync(newsRegistryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: 'review', entries: [newsEntry]}));
  try {
    const snapshot = () => { const check = openArchiveDb(f.dbPath); try { return JSON.stringify({media: check.prepare('SELECT id,node_id,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json FROM media_assets ORDER BY id').all(), nodes: check.prepare("SELECT id,kind,external_key,label,properties_json FROM graph_nodes WHERE kind='media' ORDER BY id").all(), runs: check.prepare('SELECT id,source_id,mode,status,rows_seen,rows_staged,error,metadata_json FROM ingest_runs ORDER BY id').all(), sources: check.prepare("SELECT id,slug,last_run_id FROM source_registry WHERE slug LIKE 'episode-001-%-intake' ORDER BY id").all()}); } finally { check.close(); } };
    const beforeDb = snapshot();
    await assert.rejects(() => prepareEpisodeAcquisition({officialRegistryPath: f.registryPath, newsRegistryPath, dbPath: f.dbPath, rawRoot: f.raw}), /decodable image/u);
    assert.equal(snapshot(), beforeDb);
    assert.equal(fs.existsSync(path.join(f.raw, 'episode-media')), false);
    assert.equal(readCandidateRows(f.dbPath).length, 0);
  } finally { cleanup(f.folder); }
});

test('combined prepare rolls back official work when an existing news candidate fails DB drift validation', async () => {
  const f = await fixture();
  const newsDir = path.join(f.folder, 'news'); fs.mkdirSync(newsDir);
  const newsRegistryPath = path.join(newsDir, 'intake-registry.json');
  await sharp({create: {width: 9, height: 7, channels: 3, background: {r: 30, g: 80, b: 160}}}).jpeg().toFile(path.join(newsDir, 'news.jpg'));
  const newsEntry = {source_id: 'NEWS-DRIFT', title: 'news', relative_path: 'news.jpg', media_type: 'photo', canonical_url: 'https://news.example.test/drift', publisher: '뉴스', attribution: 'fixture', license: 'review required', capture_locator: 'title', capture_provenance: 'fixture'};
  fs.writeFileSync(newsRegistryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: 'review', entries: [newsEntry]}));
  try {
    await prepareNewsAcquisition({registryPath: newsRegistryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const db = openArchiveDb(f.dbPath); try { db.prepare("UPDATE media_assets SET attribution='drifted' WHERE original_url=?").run(newsEntry.canonical_url); } finally { db.close(); }
    const snapshot = () => { const check = openArchiveDb(f.dbPath); try { return JSON.stringify({media: check.prepare('SELECT id,node_id,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json FROM media_assets ORDER BY id').all(), nodes: check.prepare("SELECT id,kind,external_key,label,properties_json FROM graph_nodes WHERE kind='media' ORDER BY id").all(), runs: check.prepare('SELECT id,source_id,mode,status,rows_seen,rows_staged,error,metadata_json FROM ingest_runs ORDER BY id').all(), sources: check.prepare("SELECT id,slug,last_run_id FROM source_registry WHERE slug LIKE 'episode-001-%-intake' ORDER BY id").all()}); } finally { check.close(); } };
    const beforeDb = snapshot();
    const beforeRaw = fs.readdirSync(path.join(f.raw, 'episode-media', 'episode-001')).sort();
    await assert.rejects(() => prepareEpisodeAcquisition({officialRegistryPath: f.registryPath, newsRegistryPath, dbPath: f.dbPath, rawRoot: f.raw}), /metadata drift/u);
    assert.equal(snapshot(), beforeDb);
    assert.deepEqual(fs.readdirSync(path.join(f.raw, 'episode-media', 'episode-001')).sort(), beforeRaw);
    assert.equal(readCandidateRows(f.dbPath).some((row) => row.source_id === 'LAW-TEST'), false);
  } finally { cleanup(f.folder); }
});

test('combined prepare rejects duplicate source IDs across registries before mutation', async () => {
  const f = await fixture();
  const newsDir = path.join(f.folder, 'news'); fs.mkdirSync(newsDir);
  const newsRegistryPath = path.join(newsDir, 'intake-registry.json');
  fs.copyFileSync(f.source, path.join(newsDir, 'same.png'));
  const officialEntry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8')).entries[0];
  fs.writeFileSync(newsRegistryPath, JSON.stringify({schema_version: 1, episode_id: 'episode-001', registry_status: 'candidate-only', rights_policy: 'review', entries: [{...officialEntry, relative_path: 'same.png'}]}));
  try {
    const beforeDb = sha(f.dbPath);
    await assert.rejects(() => prepareEpisodeAcquisition({officialRegistryPath: f.registryPath, newsRegistryPath, dbPath: f.dbPath, rawRoot: f.raw}), /duplicate source_id across intake registries/u);
    assert.equal(sha(f.dbPath), beforeDb);
    assert.equal(fs.existsSync(path.join(f.raw, 'episode-media')), false);
  } finally { cleanup(f.folder); }
});

test('news metadata drift is rejected and queue binds both registry hashes and source union', async () => {
  const f = await newsFixture();
  try {
    await prepareNewsAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw});
    const registry = JSON.parse(fs.readFileSync(f.registryPath, 'utf8')); registry.entries[0].capture_locator = 'changed'; fs.writeFileSync(f.registryPath, JSON.stringify(registry));
    await assert.rejects(() => prepareNewsAcquisition({registryPath: f.registryPath, dbPath: f.dbPath, rawRoot: f.raw}), /metadata drift/u);
    const report = buildAcquisitionQueueReport({episode_id: 'episode-001', cuts: [{shot_id: 'SH001', requirements: [{requirement_id: 'r1', kind: 'source-original', source_id: 'NEWS-TEST'}]}]}, readCandidateRows(f.dbPath), {official: 'law-hash', news: 'news-hash'}, 'spec-hash', ['LAW-TEST', 'NEWS-TEST']);
    assert.deepEqual(report._generated.registry_sha256, {official: 'law-hash', news: 'news-hash'});
    assert.deepEqual(report._generated.registry_source_ids, ['LAW-TEST', 'NEWS-TEST']);
    assert.equal(report.summary.candidate_summary.requirement_links, 1);
  } finally { cleanup(f.folder); }
});
