import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {openArchiveDb} from '../src/lib/db.ts';
import {
  deriveSh006DocumentFacsimiles,
  SH006_DOCUMENT_DELETION_EXCERPT,
  SH006_DOCUMENT_FACSIMILE_RECIPE,
  SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256,
  SH006_DOCUMENT_OUTPUTS,
  SH006_DOCUMENT_RETAINED_EXCERPT,
} from '../src/lib/sh006-document-derivation.ts';
import {approveSh006SourceComparison, SH006_OFFICIAL_URL, SH006_SOURCE_ID} from '../src/lib/sh006-source-approval.ts';

const root = process.cwd();
const marker = path.join(root, 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-paired-statutory-text-contract.json');
const source = path.join(root, 'data/raw/episode-media/episode-001/LAW-REVISION-21857/law-revision-21857-full.png');
const derivedRoot = path.join(root, 'video/qa/episode-001-work-v01/source-lock/SH006/derived');

function createApprovalFixture(prefix) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(temp, 'archive.sqlite');
  const sourceCopy = path.join(temp, 'law.png');
  fs.copyFileSync(source, sourceCopy);
  const derivativePaths = {};
  for (const [kind, output] of Object.entries(SH006_DOCUMENT_OUTPUTS)) {
    const copy = path.join(temp, `${kind}.png`);
    fs.copyFileSync(path.join(derivedRoot, output.file), copy);
    derivativePaths[kind] = copy;
  }
  const db = openArchiveDb(dbPath);
  const graph = db.prepare("INSERT INTO graph_nodes(kind,external_key,label,properties_json) VALUES ('media',?,?, '{}')").run(SH006_SOURCE_ID, 'SH006 source');
  const body = fs.readFileSync(sourceCopy);
  const media = db.prepare(`INSERT INTO media_assets(node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json)
    VALUES (?,'photo',?,?,?,'image/png',?,'pending','pending','{}')`).run(Number(graph.lastInsertRowid), sourceCopy, SH006_OFFICIAL_URL, crypto.createHash('sha256').update(body).digest('hex'), body.byteLength);
  const mediaId = Number(media.lastInsertRowid);
  const queueId = Number(db.prepare("SELECT id FROM review_queue WHERE entity_type='media_asset' AND entity_id=?").get(mediaId).id);
  db.prepare(`INSERT INTO source_registry(slug,name,base_url,trust_tier,license_notes,enabled,discovery_only)
    VALUES ('episode-001-official-intake','EP001 official intake','https://www.law.go.kr',1,'test fixture',1,0)`).run();
  db.close();
  return {temp, dbPath, mediaId, queueId, derivativePaths};
}

const approvalOptions = (fixture) => ({
  dbPath: fixture.dbPath,
  approvalMarkerPath: marker,
  mediaAssetId: fixture.mediaId,
  expectedReviewQueueId: fixture.queueId,
  authenticationDerivativePath: fixture.derivativePaths.authentication,
  deletionDerivativePath: fixture.derivativePaths.deletion,
  retainedDerivativePath: fixture.derivativePaths.retained,
});

test('SH006 paired marker binds exact statutory text and three deterministic outputs without granting stage gates', () => {
  const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
  assert.equal(value.status, 'approved-transcription-for-provisional-source-comparison');
  assert.equal(value.approved_exact_text.deletion, SH006_DOCUMENT_DELETION_EXCERPT);
  assert.equal(value.approved_exact_text.retained, SH006_DOCUMENT_RETAINED_EXCERPT);
  assert.equal(value.derivation.recipe_sha256, SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256);
  assert.deepEqual(value.derivation.outputs.map((item) => item.sha256), Object.values(SH006_DOCUMENT_OUTPUTS).map((item) => item.sha256));
  for (const key of ['cut_user_pass', 'production_cut_approved', 'rights_approved', 'omni_generation_approved', 'stage_advance_approved']) assert.equal(value.approval_scope[key], false);
});

test('SH006 source-backed retypeset PNGs are byte-stable, exact-text-bound and UI-free', async () => {
  const first = await deriveSh006DocumentFacsimiles();
  const second = await deriveSh006DocumentFacsimiles();
  for (const [kind, output] of Object.entries(SH006_DOCUMENT_OUTPUTS)) {
    assert.ok(first[kind].equals(second[kind]));
    assert.equal(crypto.createHash('sha256').update(first[kind]).digest('hex'), output.sha256);
  }
  assert.equal(SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256, '63f8e8115189052c03518ca5645e40756ccae7611b1e7739f15965f43b070ec6');
  assert.equal(SH006_DOCUMENT_FACSIMILE_RECIPE.exact_text.deletion_excerpt, SH006_DOCUMENT_DELETION_EXCERPT);
  assert.equal(SH006_DOCUMENT_FACSIMILE_RECIPE.exact_text.retained_excerpt, SH006_DOCUMENT_RETAINED_EXCERPT);
  assert.equal(SH006_DOCUMENT_FACSIMILE_RECIPE.screenshot_pixels_used, false);
  assert.equal(SH006_DOCUMENT_FACSIMILE_RECIPE.website_ui_excluded, true);
  const safe = SH006_DOCUMENT_FACSIMILE_RECIPE.safe_card_layout_contract;
  assert.ok(safe.underline_y < safe.provenance_baseline_y - safe.provenance_font_px);
  assert.ok(safe.provenance_baseline_y + 24 < safe.card_bottom_y);
  assert.ok(safe.retained_badge.x >= 0 && safe.retained_badge.x + safe.retained_badge.width <= safe.canvas.width);
  assert.equal(safe.retained_badge.text_anchor_x, safe.retained_badge.x + safe.retained_badge.width / 2);
});

test('SH006 graph authorization is idempotent and exposes only the three paired source-photo derivatives', async () => {
  const fixture = createApprovalFixture('sh006-paired-approval-');
  const first = await approveSh006SourceComparison(approvalOptions(fixture));
  const second = await approveSh006SourceComparison(approvalOptions(fixture));
  assert.equal(first.evidence_source_id, second.evidence_source_id);
  const db = openArchiveDb(fixture.dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM evidence_sources WHERE canonical_url=?").get(SH006_OFFICIAL_URL).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM graph_edges WHERE relation='DOCUMENTED_BY'").get().count, 1);
  const review = db.prepare('SELECT state,note FROM review_queue WHERE id=?').get(fixture.queueId);
  assert.equal(review.state, 'pending');
  assert.match(review.note, /not cut PASS/u);
  const properties = JSON.parse(db.prepare('SELECT properties_json FROM media_assets WHERE id=?').get(fixture.mediaId).properties_json);
  assert.equal(properties.rights_approved, false);
  assert.equal(properties.cut_user_pass, false);
  assert.equal(properties.scoped_materialization.authorization_id, 'SH006-statutory-document-content-v04');
  assert.equal(properties.scoped_materialization.exact_deletion_text, SH006_DOCUMENT_DELETION_EXCERPT);
  assert.equal(properties.scoped_materialization.exact_retained_text, SH006_DOCUMENT_RETAINED_EXCERPT);
  assert.deepEqual(properties.scoped_materialization.outputs.map((output) => output.output_id), Object.values(SH006_DOCUMENT_OUTPUTS).map((output) => output.output_id));
  assert.ok(properties.scoped_materialization.outputs.every((output) => output.destination_file.startsWith('source-photo/') && output.derivation_recipe_sha256 === SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256 && output.source_crop_applied === true && output.screenshot_pixels_used === false));
  assert.ok(properties.superseded_derivatives.some((item) => item.reason === 'superseded-title-only-candidate'));
  db.close();
  fs.rmSync(fixture.temp, {recursive: true, force: true});
});

for (const kind of ['authentication', 'deletion', 'retained']) test(`SH006 approval rejects tampered ${kind} output before any DB mutation`, async () => {
  const fixture = createApprovalFixture(`sh006-${kind}-tamper-`);
  const tampered = fs.readFileSync(fixture.derivativePaths[kind]);
  tampered[tampered.length - 1] ^= 0xff;
  fs.writeFileSync(fixture.derivativePaths[kind], tampered);
  await assert.rejects(approveSh006SourceComparison(approvalOptions(fixture)), new RegExp(`deterministic ${kind} facsimile mismatch`, 'u'));
  const db = openArchiveDb(fixture.dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM evidence_sources').get().count, 0);
  assert.equal(JSON.parse(db.prepare('SELECT properties_json FROM media_assets WHERE id=?').get(fixture.mediaId).properties_json).scoped_materialization, undefined);
  db.close();
  fs.rmSync(fixture.temp, {recursive: true, force: true});
});
