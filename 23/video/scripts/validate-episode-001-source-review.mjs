import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

import {buildSourceReviewPackage, PACKAGE_ROOT, ROOT} from './build-episode-001-source-review.mjs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shaFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function validateManifestObject(actual, expected) {
  const errors = [];
  if (actual?.schema_version !== 1) errors.push('manifest schema_version must be 1');
  if (actual?.package_id !== 'episode-001-source-review-v01' || actual?.episode_id !== 'episode-001') errors.push('manifest package/episode identity mismatch');
  if (actual?.production_authority !== false) errors.push('source-review package must keep production_authority=false');
  const capturePolicy = actual?.rendered_text_capture_policy;
  if (capturePolicy?.evidence_provenance_only !== true || capturePolicy?.style_frame_pixel_input_allowed !== false
    || capturePolicy?.production_visible_allowed !== false || capturePolicy?.focal_or_supporting_visual_allowed !== false
    || capturePolicy?.motion_target_allowed !== false || capturePolicy?.approval_cannot_restore_pixel_eligibility !== true) {
    errors.push('rendered-text capture candidates must remain permanently evidence-only and pixel-ineligible');
  }
  for (const key of ['human_approval', 'source_approval', 'rights_approval', 'materialized']) {
    if (actual?.review_scope?.[key] !== false) errors.push(`review_scope.${key} must be false`);
  }
  if (actual?.review_scope?.approval_marker !== null || !Array.isArray(actual?.review_scope?.decisions) || actual.review_scope.decisions.length !== 0) errors.push('source-review package cannot contain an approval marker or decisions');
  if (!Array.isArray(actual?.candidates) || actual.candidates.length !== 15) errors.push('manifest must contain all 15 registered candidates');
  for (const candidate of actual?.candidates ?? []) {
    if (!Number.isInteger(candidate.media_asset_id) || !candidate.source_id || !candidate.source_url || !candidate.provider || !candidate.license) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} has incomplete identity/source metadata`);
    if (!/^[a-f0-9]{64}$/u.test(candidate.registered_candidate_bytes?.sha256 ?? '') || !(candidate.registered_candidate_bytes?.bytes > 0)) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} has invalid byte binding`);
    if (candidate.registered_candidate_bytes?.decode?.decoded !== true || !(candidate.registered_candidate_bytes?.decode?.width > 0) || !(candidate.registered_candidate_bytes?.decode?.height > 0)) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} lacks positive image decode evidence`);
    if (candidate.rights?.rights_approved !== false || candidate.rights?.human_decision !== null) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} improperly claims a rights decision`);
    if (candidate.candidate_review?.human_approval !== false || candidate.candidate_review?.suitability_status !== 'pending-human-review') errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} improperly claims suitability approval`);
    if (candidate.production_materialization?.materialized !== false || candidate.production_materialization?.materialization_record_id !== null || candidate.production_materialization?.output_paths?.length !== 0) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} improperly claims production materialization`);
    if (!Array.isArray(candidate.requirement_bindings) || !Array.isArray(candidate.requirement_ids) || !Array.isArray(candidate.cut_ids)) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} has malformed requirement mappings`);
    for (const binding of candidate.requirement_bindings ?? []) if (binding.source_id !== candidate.source_id || !binding.requirement_id || !binding.cut_id) errors.push(`candidate ${candidate.media_asset_id ?? 'unknown'} has an invalid exact requirement binding`);
  }
  const contactIds = (actual?.contact_sheets ?? []).flatMap((sheet) => sheet.candidate_ids ?? []);
  const candidateIds = (actual?.candidates ?? []).map((candidate) => candidate.media_asset_id);
  if (JSON.stringify([...contactIds].sort((a, b) => a - b)) !== JSON.stringify([...candidateIds].sort((a, b) => a - b))) errors.push('contact sheets must cover every candidate exactly once');
  if ((actual?.contact_sheets ?? []).some((sheet) => sheet.contains_placeholders !== false)) errors.push('contact sheets must declare contains_placeholders=false');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('manifest differs from deterministic reconstruction of spec/queue/registries/database/local bytes');
  return errors;
}

export async function validateSourceReviewPackage({root = ROOT, packageRoot = PACKAGE_ROOT} = {}) {
  const errors = [];
  let expectedPackage;
  try {
    expectedPackage = await buildSourceReviewPackage({root});
  } catch (error) {
    return [`cannot reconstruct expected source-review package: ${error instanceof Error ? error.message : String(error)}`];
  }
  const manifestPath = path.join(packageRoot, 'manifest.json');
  const readmePath = path.join(packageRoot, 'README.md');
  if (!fs.existsSync(manifestPath)) errors.push('missing source-review manifest.json');
  if (!fs.existsSync(readmePath)) errors.push('missing source-review README.md');
  if (errors.length) return errors;
  let actual;
  try { actual = readJson(manifestPath); } catch (error) { return [`manifest JSON is invalid: ${error instanceof Error ? error.message : String(error)}`]; }
  errors.push(...validateManifestObject(actual, expectedPackage.manifest));
  if (fs.readFileSync(readmePath, 'utf8') !== expectedPackage.readme) errors.push('README differs from deterministic reconstruction');
  const expectedNames = ['README.md', 'manifest.json', ...expectedPackage.contactArtifacts.map((artifact) => artifact.file)].sort();
  const actualNames = fs.readdirSync(packageRoot, {withFileTypes: true}).map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) errors.push(`package file inventory mismatch: ${actualNames.join(', ')}`);
  for (const sheet of expectedPackage.manifest.contact_sheets) {
    const file = path.join(packageRoot, sheet.path);
    if (!fs.existsSync(file)) { errors.push(`missing contact sheet: ${sheet.path}`); continue; }
    if (shaFile(file) !== sheet.sha256) errors.push(`contact sheet hash mismatch: ${sheet.path}`);
    try {
      const metadata = await sharp(file, {failOn: 'error'}).metadata();
      if (metadata.width !== sheet.width || metadata.height !== sheet.height) errors.push(`contact sheet dimensions mismatch: ${sheet.path}`);
    } catch (error) {
      errors.push(`contact sheet is not decodable: ${sheet.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const errors = await validateSourceReviewPackage({packageRoot: PACKAGE_ROOT});
  if (errors.length) {
    console.error(`EP001 source-review package invalid (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('EP001 source-review package valid: 15 pending candidates, exact queue/spec bindings, real contact sheets, no approval or materialization claims.');
  }
}
