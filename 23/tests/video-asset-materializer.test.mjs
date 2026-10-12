import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';

const {openArchiveDb} = await import('../src/lib/db.ts');
const {getReviewQueue, transitionReview} = await import('../src/lib/graph.ts');
const {materializeMediaAsset, validateMaterializedSources} = await import('../src/lib/video-asset-materializer.ts');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function fixture({approved = true, outsideRaw = false, productionMode = 'remotion'} = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'video-materializer-'));
  const raw = path.join(folder, 'raw');
  const outside = path.join(folder, 'outside');
  const cut = path.join(folder, 'cut');
  fs.mkdirSync(raw, {recursive: true});
  fs.mkdirSync(outside, {recursive: true});
  fs.mkdirSync(path.join(cut, 'assets'), {recursive: true});
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT = raw;
  const source = path.join(outsideRaw ? outside : raw, 'source.jpg');
  await sharp({create: {width: 4, height: 4, channels: 3, background: {r: 220, g: 80, b: 20}}}).jpeg().toFile(source);
  const manifest = {
    schema_version: 1, episode_id: 'episode-test', shot_id: 'SH001', production_mode: productionMode,
    review_state: 'draft', source_ids: [], source_materials: [], assets: [], review: {user_pass: false},
  };
  fs.writeFileSync(path.join(cut, 'manifest.json'), JSON.stringify(manifest));
  const db = openArchiveDb();
  const node = db.prepare("INSERT INTO graph_nodes(kind,external_key,label,properties_json) VALUES ('photo',?,?, '{}')").run('fixture:photo:1', 'fixture');
  const media = db.prepare(`INSERT INTO media_assets
    (node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json)
    VALUES (?,?,?,?,?,?,?,?,?, '{}')`).run(Number(node.lastInsertRowid), 'photo', source, 'https://example.test/source.jpg', sha256(source), 'image/jpeg', fs.statSync(source).size, 'CC BY 4.0', 'Fixture photographer');
  if (approved) db.prepare("UPDATE review_queue SET state='approved',note='fixture rights review' WHERE entity_type='media_asset' AND entity_id=?").run(Number(media.lastInsertRowid));
  db.close();
  return {folder, raw, cut, source, mediaId: Number(media.lastInsertRowid)};
}

async function videoFixture({approved = true, invalidTimecode = false} = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'video-materializer-video-'));
  const raw = path.join(folder, 'raw'); const cut = path.join(folder, 'cut');
  fs.mkdirSync(raw, {recursive: true}); fs.mkdirSync(cut, {recursive: true});
  process.env.ARCHIVE_DB_PATH = path.join(folder, 'archive.sqlite'); process.env.ARCHIVE_RAW_ROOT = raw;
  const source = path.join(raw, 'source.mp4');
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30', '-t', '2', '-c:v', 'mpeg4', '-an', source], {encoding: 'utf8', windowsHide: true});
  assert.equal(ffmpeg.status, 0, ffmpeg.stderr);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', source], {encoding: 'utf8', windowsHide: true});
  const duration = Number(probe.stdout.trim());
  const timecode = {start: '00:00:00.250', end: invalidTimecode ? '00:00:03.000' : '00:00:01.250', start_seconds: 0.25, end_seconds: invalidTimecode ? 3 : 1.25, speaker: '박형수', context: '본회의 발언', locator: 'official player timecode', locator_basis: 'official player and minutes'};
  const properties = {source_duration_seconds: duration, video_codec: 'mpeg4', source_dimensions: {width: 160, height: 90}, source_timecode: timecode, whole_original_preserved: true};
  fs.writeFileSync(path.join(cut, 'manifest.json'), JSON.stringify({schema_version: 1, episode_id: 'episode-test', shot_id: 'SH003', production_mode: 'source-video', review_state: 'draft', source_ids: [], source_materials: [], assets: [], review: {user_pass: false}}));
  const db = openArchiveDb();
  const node = db.prepare("INSERT INTO graph_nodes(kind,external_key,label,properties_json) VALUES ('media',?,?,?)").run('assembly:video:1', 'fixture video', JSON.stringify(properties));
  const media = db.prepare(`INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(Number(node.lastInsertRowid), 'video', source, 'https://w3.assembly.go.kr/main/player.do?no=1', sha256(source), 'video/mp4', fs.statSync(source).size, duration, 'review-required', '국회 영상회의록시스템', JSON.stringify(properties));
  if (approved) db.prepare("UPDATE review_queue SET state='approved',note='rights/source fixture review' WHERE entity_type='media_asset' AND entity_id=?").run(Number(media.lastInsertRowid));
  db.close();
  return {folder, raw, cut, source, mediaId: Number(media.lastInsertRowid), timecode, duration};
}

function cleanup(folder) {
  delete process.env.ARCHIVE_DB_PATH;
  delete process.env.ARCHIVE_RAW_ROOT;
  fs.rmSync(folder, {recursive: true, force: true});
}

function layerRequest(f, overrides = {}) {
  return {
    media_asset_id: f.mediaId,
    cut_dir: f.cut,
    route: 'transparent-layers',
    usage: 'explanation',
    layers: [{
      asset_id: 'person-layer', layer_name: 'person', subject_kind: 'person', role: 'character', z_index: 40,
      input: {type: 'alpha-mask', path: path.join(f.folder, 'mask.png'), method: 'manual-mask', note: 'Human-reviewed silhouette mask'},
    }],
    ...overrides,
  };
}

test('dry-run validates an approved candidate without writing cut files', async () => {
  const f = await fixture({productionMode: 'source-photo'});
  try {
    const before = fs.readFileSync(path.join(f.cut, 'manifest.json'), 'utf8');
    const result = await materializeMediaAsset({media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'documentary-evidence', source_asset: {asset_id: 'official-photo', role: 'evidence', z_index: 30}}, {dryRun: true});
    assert.equal(result.dry_run, true);
    assert.equal(fs.existsSync(path.join(f.cut, result.source_file)), false);
    assert.equal(fs.readFileSync(path.join(f.cut, 'manifest.json'), 'utf8'), before);
  } finally { cleanup(f.folder); }
});

test('source route preserves exact bytes, provenance, license and source id', async () => {
  const f = await fixture({productionMode: 'source-photo'});
  try {
    const result = await materializeMediaAsset({media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'documentary-evidence', source_asset: {asset_id: 'official-photo', role: 'evidence', z_index: 30}});
    const local = path.join(f.cut, result.source_file);
    assert.equal(sha256(local), sha256(f.source));
    const manifest = JSON.parse(fs.readFileSync(path.join(f.cut, 'manifest.json'), 'utf8'));
    const materialized = manifest.source_asset_materializations[0];
    assert.equal(materialized.source.original_url, 'https://example.test/source.jpg');
    assert.equal(materialized.source.license, 'CC BY 4.0');
    assert.equal(materialized.source.attribution, 'Fixture photographer');
    assert.equal(materialized.source_id, 'fixture:photo:1');
    assert.equal(materialized.source.sha256, sha256(f.source));
    assert.deepEqual(await validateMaterializedSources(manifest, f.cut), []);
    manifest.assets = [];
    assert.match((await validateMaterializedSources(manifest, f.cut)).join('\n'), /not bound to a manifest asset/u);
  } finally { cleanup(f.folder); }
});

test('source-video materialization preserves whole original, ffprobe metadata, and exact timecode on source and CutAsset', async () => {
  const f = await videoFixture();
  try {
    const result = await materializeMediaAsset({media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'documentary-evidence', source_asset: {asset_id: 'statement-video', role: 'evidence', z_index: 30}});
    assert.equal(sha256(path.join(f.cut, result.source_file)), sha256(f.source));
    const manifest = JSON.parse(fs.readFileSync(path.join(f.cut, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.assets[0].source_timecode, f.timecode);
    assert.equal(manifest.assets[0].source_duration_seconds, f.duration);
    assert.deepEqual(manifest.source_asset_materializations[0].source.timecode, f.timecode);
    assert.deepEqual(await validateMaterializedSources(manifest, f.cut), []);
  } finally { cleanup(f.folder); }
});

test('source-video materialization rejects an out-of-bounds registered timecode', async () => {
  const f = await videoFixture({invalidTimecode: true});
  try {
    await assert.rejects(() => materializeMediaAsset({media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'context', source_asset: {asset_id: 'statement-video', role: 'plate', z_index: 10}}), /out-of-bounds source timecode/u);
  } finally { cleanup(f.folder); }
});

test('mask route creates independently named transparent PNG layers and keeps the full original', async () => {
  const f = await fixture();
  try {
    const mask = Buffer.from([
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ]);
    await sharp(mask, {raw: {width: 4, height: 4, channels: 1}}).png().toFile(path.join(f.folder, 'mask.png'));
    const request = layerRequest(f);
    request.layers.push({
      asset_id: 'building-layer', layer_name: 'building', subject_kind: 'building', role: 'architecture', z_index: 20,
      input: {type: 'transparent-png', path: path.join(f.folder, 'building.png'), method: 'external-segmentation', provider: 'human-reviewed fixture', note: 'External result manually inspected'},
    });
    await sharp({create: {width: 4, height: 4, channels: 4, background: {r: 20, g: 80, b: 220, alpha: 0}}})
      .composite([{input: {create: {width: 2, height: 4, channels: 4, background: {r: 20, g: 80, b: 220, alpha: 1}}}, left: 2, top: 0}])
      .png().toFile(path.join(f.folder, 'building.png'));
    const result = await materializeMediaAsset(request);
    assert.equal(fs.existsSync(path.join(f.cut, result.source_file)), true);
    assert.deepEqual(result.derivative_files, ['assets/person-layer.png', 'assets/building-layer.png']);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.cut, 'manifest.json'), 'utf8'));
    assert.equal(manifest.source_asset_materializations[0].state, 'asset-ready-presentation-pending');
    assert.deepEqual(manifest.source_asset_materializations[0].derivatives.map((item) => item.subject_kind), ['person', 'building']);
    assert.ok(manifest.source_asset_materializations[0].derivatives.every((item) => item.alpha.transparent_pixels > 0 && item.alpha.visible_pixels > 0));
    assert.deepEqual(await validateMaterializedSources(manifest, f.cut), []);
  } finally { cleanup(f.folder); }
});

test('rejects unapproved and missing media assets', async () => {
  const f = await fixture({approved: false, productionMode: 'source-photo'});
  try {
    const request = {media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'context', source_asset: {asset_id: 'photo', role: 'plate', z_index: 10}};
    await assert.rejects(() => materializeMediaAsset(request), /not approved/u);
    await assert.rejects(() => materializeMediaAsset({...request, media_asset_id: 99999}), /does not exist/u);
  } finally { cleanup(f.folder); }
});

test('new media is review-queued and approval requires a rights/source note', async () => {
  const f = await fixture({approved: false, productionMode: 'source-photo'});
  try {
    const item = getReviewQueue('pending').find((row) => row.entity_type === 'media_asset' && row.entity_id === f.mediaId);
    assert.ok(item);
    assert.equal(item.media_url, 'https://example.test/source.jpg');
    assert.equal(item.media_license, 'CC BY 4.0');
    await assert.rejects(async () => transitionReview(item.id, 'approved', ''), /검토 메모/u);
    transitionReview(item.id, 'approved', 'CC BY 크레딧과 설명용 분리 사용 범위 확인');
    const db = openArchiveDb();
    assert.equal(db.prepare('SELECT state FROM review_queue WHERE id=?').get(item.id).state, 'approved');
    db.close();
  } finally { cleanup(f.folder); }
});

test('rejects graph paths outside the immutable raw root and hostile output ids', async () => {
  const outside = await fixture({outsideRaw: true, productionMode: 'source-photo'});
  try {
    await assert.rejects(() => materializeMediaAsset({media_asset_id: outside.mediaId, cut_dir: outside.cut, route: 'source', usage: 'context', source_asset: {asset_id: 'photo', role: 'plate', z_index: 10}}), /outside ARCHIVE_RAW_ROOT/u);
  } finally { cleanup(outside.folder); }
  const f = await fixture({productionMode: 'source-photo'});
  try {
    await assert.rejects(() => materializeMediaAsset({media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'context', source_asset: {asset_id: '../escape', role: 'plate', z_index: 10}}), /source_asset\.asset_id/u);
    assert.equal(fs.existsSync(path.join(f.folder, 'escape.png')), false);
  } finally { cleanup(f.folder); }
});

test('rejects cut-local write and validation paths that escape through a directory link', async (t) => {
  const f = await fixture({productionMode: 'source-photo'});
  const outside = path.join(f.folder, 'junction-outside');
  fs.mkdirSync(outside);
  const linked = path.join(f.cut, 'source-photo');
  try {
    try { fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') { t.skip('directory link privilege unavailable'); return; }
      throw error;
    }
    const request = {media_asset_id: f.mediaId, cut_dir: f.cut, route: 'source', usage: 'context', source_asset: {asset_id: 'photo', role: 'plate', z_index: 10}};
    await assert.rejects(() => materializeMediaAsset(request), /escapes cut_dir through a link/u);
    assert.deepEqual(fs.readdirSync(outside), []);

    const escapedFile = path.join(outside, 'escaped.jpg');
    fs.copyFileSync(f.source, escapedFile);
    const manifest = {assets: [{asset_id: 'photo', file: 'source-photo/escaped.jpg', source_id: 'fixture:photo:1', sha256: sha256(escapedFile)}], source_asset_materializations: [{source_id: 'fixture:photo:1', route: 'source', usage: 'context', source: {file: 'source-photo/escaped.jpg', sha256: sha256(escapedFile), bytes: fs.statSync(escapedFile).size, media_type: 'photo'}, derivatives: []}]};
    assert.match((await validateMaterializedSources(manifest, f.cut)).join('\n'), /link-escaped source file/u);
  } finally { cleanup(f.folder); }
});

test('rejects hash drift, opaque cutouts, and cutouts presented as documentary evidence', async () => {
  const drift = await fixture({productionMode: 'source-photo'});
  try {
    fs.appendFileSync(drift.source, 'tamper');
    await assert.rejects(() => materializeMediaAsset({media_asset_id: drift.mediaId, cut_dir: drift.cut, route: 'source', usage: 'context', source_asset: {asset_id: 'photo', role: 'plate', z_index: 10}}), /SHA-256/u);
  } finally { cleanup(drift.folder); }
  const f = await fixture();
  try {
    await sharp(Buffer.alloc(16, 255), {raw: {width: 4, height: 4, channels: 1}}).png().toFile(path.join(f.folder, 'mask.png'));
    await assert.rejects(() => materializeMediaAsset(layerRequest(f, {usage: 'documentary-evidence'})), /cannot replace documentary evidence/u);
    await assert.rejects(() => materializeMediaAsset(layerRequest(f)), /both transparent and visible pixels/u);
    assert.equal(fs.existsSync(path.join(f.cut, 'assets', 'person-layer.png')), false);
    assert.deepEqual(fs.existsSync(path.join(f.cut, 'source-photo')) ? fs.readdirSync(path.join(f.cut, 'source-photo')) : [], []);
  } finally { cleanup(f.folder); }
});
