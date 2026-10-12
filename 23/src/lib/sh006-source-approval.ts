import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {openArchiveDb} from './db.ts';
import {
  SH006_DOCUMENT_DELETION_EXCERPT,
  SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256,
  SH006_DOCUMENT_OUTPUTS,
  SH006_DOCUMENT_RETAINED_EXCERPT,
  verifySh006DocumentFacsimile,
} from './sh006-document-derivation.ts';

export const SH006_SOURCE_ID = 'LAW-REVISION-21857';
export const SH006_MEDIA_ASSET_ID = 329;
export const SH006_REVIEW_QUEUE_ID = 1311;
export const SH006_OFFICIAL_URL = 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all';
export const SH006_SOURCE_SHA256 = '118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b';
export const SH006_LIMITED_LICENSE = '법률 원문·법률명·법률번호·일자 문서 내용에 한정(저작권법 제7조 제1호); 국가법령정보센터 로고·UI·아이콘 사용 제외';
export const SH006_ATTRIBUTION = '국가법령정보센터 형사소송법 일부개정법률(법률 제21857호) 원문';
export const SH006_SCOPED_AUTHORIZATION_ID = 'SH006-statutory-document-content-v04';
export const SH006_CROP_SHA256 = 'd135a00b8bc4a98b84f154bbfafd89c26e5680b9d3a5169cfd4de34fd0c7c434';
export const SH006_CONTACT_SHA256 = 'b9a8029c33ed4bca5c2207d4ff8848d637cc5285bf9d6dba19590d0b5ebf6743';

type ApprovalOptions = {
  dbPath?: string;
  approvalMarkerPath: string;
  mediaAssetId?: number;
  expectedReviewQueueId?: number | null;
  authenticationDerivativePath?: string;
  deletionDerivativePath?: string;
  retainedDerivativePath?: string;
};

const sha256 = (value: Buffer | Uint8Array) => crypto.createHash('sha256').update(value).digest('hex');

function assertApprovalMarker(file: string) {
  const absolute = path.resolve(file);
  const bytes = fs.readFileSync(absolute);
  const marker = JSON.parse(bytes.toString('utf8')) as Record<string, any>;
  const scope = marker.approval_scope;
  const outputs = marker.derivation?.outputs;
  if (marker.status !== 'approved-transcription-for-provisional-source-comparison'
    || marker.source?.reviewed_parent_source_sha256 !== SH006_SOURCE_SHA256
    || marker.source?.official_url !== SH006_OFFICIAL_URL
    || marker.approved_exact_text?.deletion !== SH006_DOCUMENT_DELETION_EXCERPT
    || marker.approved_exact_text?.retained !== SH006_DOCUMENT_RETAINED_EXCERPT
    || marker.derivation?.recipe_sha256 !== SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256
    || marker.derivation?.screenshot_pixels_used !== false
    || marker.derivation?.website_ui_excluded !== true
    || !Array.isArray(outputs)
    || outputs.length !== 3
    || Object.values(SH006_DOCUMENT_OUTPUTS).some((output) => !outputs.some((bound: Record<string, any>) => bound.output_id === output.output_id
      && bound.asset_id === output.asset_id
      && bound.file === output.destination_file
      && bound.width === output.width
      && bound.height === output.height
      && bound.sha256 === output.sha256))
    || scope?.source_text_transcription !== true
    || scope?.paired_editorial_comparison !== true
    || scope?.cut_user_pass !== false
    || scope?.production_cut_approved !== false
    || scope?.rights_approved !== false
    || scope?.omni_generation_approved !== false
    || scope?.stage_advance_approved !== false) {
    throw new Error('SH006 paired statutory text contract scope, exact text, or derivative bindings are invalid');
  }
  return {absolute, sha256: sha256(bytes), marker};
}

export async function approveSh006SourceComparison(options: ApprovalOptions) {
  const mediaAssetId = options.mediaAssetId ?? SH006_MEDIA_ASSET_ID;
  const marker = assertApprovalMarker(options.approvalMarkerPath);
  const db = openArchiveDb(options.dbPath);
  try {
    const media = db.prepare(`SELECT m.id,m.node_id,m.path,m.original_url,m.sha256,m.bytes,g.external_key,q.id AS review_id,q.state AS review_state
      FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id
      JOIN review_queue q ON q.entity_type='media_asset' AND q.entity_id=m.id WHERE m.id=?`).get(mediaAssetId) as {
        id: number; node_id: number; path: string; original_url: string; sha256: string | null; bytes: number | null;
        external_key: string | null; review_id: number; review_state: string;
      } | undefined;
    if (!media || media.external_key !== SH006_SOURCE_ID || media.original_url !== SH006_OFFICIAL_URL || media.sha256 !== SH006_SOURCE_SHA256) {
      throw new Error('SH006 media asset identity, URL, or SHA-256 does not match the reviewed source');
    }
    if (options.expectedReviewQueueId != null && media.review_id !== options.expectedReviewQueueId) throw new Error('SH006 review queue identity mismatch');
    const sourceBytes = fs.readFileSync(media.path);
    if (sourceBytes.byteLength !== media.bytes || sha256(sourceBytes) !== media.sha256) throw new Error('SH006 media asset bytes differ from the reviewed source');

    // Historical screenshot/crop artifacts remain provenance-only. The current cut uses only
    // deterministic source-backed retypeset PNGs and contains no screenshot pixels.
    const authenticationPath = path.resolve(options.authenticationDerivativePath ?? `video/qa/episode-001-work-v01/source-lock/SH006/derived/${SH006_DOCUMENT_OUTPUTS.authentication.file}`);
    const deletionPath = path.resolve(options.deletionDerivativePath ?? `video/qa/episode-001-work-v01/source-lock/SH006/derived/${SH006_DOCUMENT_OUTPUTS.deletion.file}`);
    const retainedPath = path.resolve(options.retainedDerivativePath ?? `video/qa/episode-001-work-v01/source-lock/SH006/derived/${SH006_DOCUMENT_OUTPUTS.retained.file}`);
    const [authentication, deletion, retained] = await Promise.all([
      verifySh006DocumentFacsimile(authenticationPath, 'authentication'),
      verifySh006DocumentFacsimile(deletionPath, 'deletion'),
      verifySh006DocumentFacsimile(retainedPath, 'retained'),
    ]);

    // The deterministic derivative must be proven before any approval/audit rows are mutated.
    db.exec('BEGIN IMMEDIATE');

    const registry = db.prepare("SELECT id FROM source_registry WHERE slug='episode-001-official-intake'").get() as {id: number} | undefined;
    if (!registry) throw new Error('EP001 official intake source registry is missing');
    const evidenceKey = `evidence:${SH006_SOURCE_ID}:official-amendment`;
    db.prepare(`INSERT INTO graph_nodes(kind,external_key,label,properties_json,as_of)
      VALUES ('evidence',?,?,?,'2026-08-29')
      ON CONFLICT(kind,external_key) DO UPDATE SET label=excluded.label,properties_json=excluded.properties_json,as_of=excluded.as_of,updated_at=CURRENT_TIMESTAMP`)
      .run(evidenceKey, '형사소송법 일부개정법률 공식 개정문', JSON.stringify({source_id: SH006_SOURCE_ID, approval_marker: path.relative(process.cwd(), marker.absolute).replaceAll('\\', '/'), approval_marker_sha256: marker.sha256, document_facsimile_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256, scope: 'statutory-document-content-only'}));
    const evidenceNode = db.prepare("SELECT id FROM graph_nodes WHERE kind='evidence' AND external_key=?").get(evidenceKey) as {id: number};
    const evidenceProperties = JSON.stringify({
      source_id: SH006_SOURCE_ID,
      approval_marker: path.relative(process.cwd(), marker.absolute).replaceAll('\\', '/'),
      approval_marker_sha256: marker.sha256,
      reviewed_source_sha256: SH006_SOURCE_SHA256,
      document_facsimile_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256,
      scope: 'official-source-comparison-and-statutory-document-content-only',
      website_ui_rights_approved: false,
      cut_user_pass: false,
    });
    const existingEvidence = db.prepare('SELECT id FROM evidence_sources WHERE canonical_url=? OR external_key=? OR content_hash=? LIMIT 1')
      .get(SH006_OFFICIAL_URL, evidenceKey, SH006_SOURCE_SHA256) as {id: number} | undefined;
    if (existingEvidence) {
      db.prepare(`UPDATE evidence_sources SET node_id=?,external_key=?,canonical_url=?,title=?,publisher=?,source_type='document',retrieved_at='2026-08-29',
        content_hash=?,license=?,trust_tier=1,source_id=?,raw_path=?,properties_json=? WHERE id=?`)
        .run(evidenceNode.id, evidenceKey, SH006_OFFICIAL_URL, '형사소송법 일부개정법률(법률 제21857호)', '국가법령정보센터', SH006_SOURCE_SHA256, SH006_LIMITED_LICENSE, registry.id, media.path, evidenceProperties, existingEvidence.id);
    } else {
      db.prepare(`INSERT INTO evidence_sources(node_id,external_key,canonical_url,title,publisher,source_type,retrieved_at,content_hash,license,trust_tier,source_id,raw_path,properties_json)
        VALUES (?,?,?,?,?,'document','2026-08-29',?,?,1,?,?,?)`)
        .run(evidenceNode.id, evidenceKey, SH006_OFFICIAL_URL, '형사소송법 일부개정법률(법률 제21857호)', '국가법령정보센터', SH006_SOURCE_SHA256, SH006_LIMITED_LICENSE, registry.id, media.path, evidenceProperties);
    }
    const evidence = db.prepare('SELECT id,node_id FROM evidence_sources WHERE canonical_url=?').get(SH006_OFFICIAL_URL) as {id: number; node_id: number};
    db.prepare(`INSERT INTO graph_edges(from_node_id,to_node_id,relation,properties_json,as_of)
      VALUES (?,?,'DOCUMENTED_BY',?,'2026-08-29')
      ON CONFLICT(from_node_id,to_node_id,relation) DO UPDATE SET properties_json=excluded.properties_json,as_of=excluded.as_of`)
      .run(media.node_id, evidence.node_id, JSON.stringify({approval_marker_sha256: marker.sha256, document_facsimile_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256, usage_scope: 'statutory-document-content-only', website_ui_rights_approved: false}));

    const existingProperties = db.prepare('SELECT properties_json FROM media_assets WHERE id=?').get(media.id) as {properties_json: string};
    const properties = JSON.parse(existingProperties.properties_json || '{}');
    const scopedMaterialization = {
      schema_version: 1,
      state: 'approved',
      authorization_id: SH006_SCOPED_AUTHORIZATION_ID,
      route: 'scoped-document-derivatives',
      parent_source_sha256: SH006_SOURCE_SHA256,
      approval_marker_path: path.relative(process.cwd(), marker.absolute).replaceAll('\\', '/'),
      approval_marker_sha256: marker.sha256,
      exact_deletion_text: SH006_DOCUMENT_DELETION_EXCERPT,
      exact_retained_text: SH006_DOCUMENT_RETAINED_EXCERPT,
      whole_screenshot_materialization_allowed: false,
      outputs: [
        {...authentication, output_id: SH006_DOCUMENT_OUTPUTS.authentication.output_id, destination_file: SH006_DOCUMENT_OUTPUTS.authentication.destination_file, asset_id: SH006_DOCUMENT_OUTPUTS.authentication.asset_id, role: 'document', z_index: 30,
          mime_type: 'image/png', allowed_usage: 'documentary-evidence', derivation_kind: 'source-backed-retypeset-facsimile', source_crop_applied: true, screenshot_pixels_used: false, website_ui_excluded: true},
        {...deletion, output_id: SH006_DOCUMENT_OUTPUTS.deletion.output_id, destination_file: SH006_DOCUMENT_OUTPUTS.deletion.destination_file, asset_id: SH006_DOCUMENT_OUTPUTS.deletion.asset_id, role: 'document', z_index: 20,
          mime_type: 'image/png', allowed_usage: 'documentary-evidence', derivation_kind: 'source-backed-retypeset-facsimile', source_crop_applied: true, screenshot_pixels_used: false, website_ui_excluded: true},
        {...retained, output_id: SH006_DOCUMENT_OUTPUTS.retained.output_id, destination_file: SH006_DOCUMENT_OUTPUTS.retained.destination_file, asset_id: SH006_DOCUMENT_OUTPUTS.retained.asset_id, role: 'document', z_index: 20,
          mime_type: 'image/png', allowed_usage: 'documentary-evidence', derivation_kind: 'source-backed-retypeset-facsimile', source_crop_applied: true, screenshot_pixels_used: false, website_ui_excluded: true},
      ],
    };
    db.prepare('UPDATE media_assets SET license=?,attribution=?,properties_json=? WHERE id=?').run(SH006_LIMITED_LICENSE, SH006_ATTRIBUTION, JSON.stringify({...properties,
      review_semantics: 'paired-statutory-text-source-comparison-only',
      superseded_derivatives: [
        {output_id: 'document-overview', sha256: '21bec8582b1e56a4a2a80029b7ba905a4c9fa77f66b0b7a6c1c4b2c7e7e38c20', reason: 'user-rejected-low-resolution-raster-upscale'},
        {output_id: 'approved-header-crop', sha256: SH006_CROP_SHA256, reason: 'user-rejected-low-resolution-raster-upscale'},
        {output_id: 'document-overview-hires-v04', sha256: 'a654e38afb57bf1001ab697eb12b27c1ffcee096393d53f1db28372cfc299943', reason: 'superseded-title-only-candidate'},
        {output_id: 'document-focus-hires-v04', sha256: '72edc08790cfe461c216928968ee8e6f39aaf5597bdd481b8cb22aa2620e3cf2', reason: 'superseded-title-only-candidate'},
        {output_id: 'article-196-deletion-v03', sha256: '237514c5b1ab5f205b8686bd8f1f5f6b43554bed5de4358db48fe75fb773cc4a', reason: 'rejected-provenance-underline-collision'},
        {output_id: 'article-195-retained-v03', sha256: '0e7a583e5bae20cddbf6a0312574c1ee78efa3ee61bf231e0ad883a4cb650291', reason: 'rejected-provenance-clipping-and-header-badge-clipping'},
      ],
      approval_marker: path.relative(process.cwd(), marker.absolute).replaceAll('\\', '/'),
      approval_marker_sha256: marker.sha256,
      statutory_document_content_approved: false,
      scoped_materialization: scopedMaterialization,
      website_ui_rights_approved: false,
      rights_approved: false,
      cut_user_pass: false,
      production_cut_approved: false,
      omni_video_approved: false,
    }), media.id);
    const note = `Full screenshot rights remain unapproved and generic materialization is pending. Separate scoped authorization ${SH006_SCOPED_AUTHORIZATION_ID} permits only the exact hash-bound statutory-document outputs; law.go logo/UI/icons and whole-screenshot reuse are excluded. This is not cut PASS, production approval, Omni approval, or episode stage advancement.`;
    db.prepare("UPDATE review_queue SET state='pending',note=?,reviewed_at=NULL WHERE id=?").run(note, media.review_id);
    db.exec('COMMIT');
    return {media_asset_id: media.id, review_queue_id: media.review_id, evidence_source_id: evidence.id, evidence_node_id: evidence.node_id, approval_marker_sha256: marker.sha256, document_facsimile_recipe_sha256: SH006_DOCUMENT_FACSIMILE_RECIPE_SHA256, review_state: 'pending', scoped_authorization_id: SH006_SCOPED_AUTHORIZATION_ID, scoped_authorization_state: 'approved', rights_approved: false, cut_user_pass: false};
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  } finally {
    db.close();
  }
}
