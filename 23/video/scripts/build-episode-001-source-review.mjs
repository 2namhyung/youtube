import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

import {readCandidateRows} from '../../src/lib/episode-official-acquisition.ts';

export const ROOT = process.cwd();
const CURRENT_REVISION = JSON.parse(fs.readFileSync(path.join(ROOT, 'video', 'episodes', 'episode-001', 'episode-spec.json'), 'utf8')).editorial_revision?.id;
export const PACKAGE_ROOT = path.join(ROOT, 'video', 'qa', 'source-review', CURRENT_REVISION === 'ep001-narrative-source-first-v3' ? 'episode-001-narrative-source-v03' : 'episode-001-v01');

const SOURCE_FILES = {
  spec: 'video/episodes/episode-001/episode-spec.json',
  queue: 'video/episodes/episode-001/generated/acquisition-queue.json',
  production_state: 'video/episodes/episode-001/production-state.json',
  official_registry: 'video/source-intake/episode-001/official/intake-registry.json',
  news_registry: 'video/source-intake/episode-001/news/intake-registry.json',
  database: 'data/archive.sqlite',
};

const normalize = (value) => value.replaceAll('\\', '/');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shaBuffer = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => shaBuffer(fs.readFileSync(file));
const unique = (values) => [...new Set(values)].sort();
const byId = (a, b) => a.media_asset_id - b.media_asset_id;

function resolveInputs(root) {
  return Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, value]) => [key, path.join(root, ...value.split('/'))]));
}

function parseProperties(candidate) {
  try {
    const value = JSON.parse(candidate.properties_json);
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new Error(`candidate ${candidate.id} properties_json is invalid`);
  }
}

function isHistorical(candidate) {
  return candidate.review_state === 'rejected' || /supersed|historical|반려|폐기/u.test(candidate.review_note ?? '');
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function findCandidateCollisions(candidates) {
  const findings = [];
  const fields = {
    source_id: (candidate) => candidate.source_id,
    local_path: (candidate) => candidate.local_path ?? candidate.registered_candidate_bytes?.local_path,
    sha256: (candidate) => candidate.sha256 ?? candidate.registered_candidate_bytes?.sha256,
  };
  for (const [field, getValue] of Object.entries(fields)) {
    const groups = new Map();
    for (const candidate of candidates) {
      const value = getValue(candidate);
      if (!value) continue;
      const ids = groups.get(value) ?? [];
      ids.push(candidate.media_asset_id);
      groups.set(value, ids);
    }
    for (const [value, ids] of groups) {
      if (ids.length > 1) findings.push({collision_key: field, value, media_asset_ids: ids.sort((a, b) => a - b)});
    }
  }
  return findings.sort((a, b) => `${a.collision_key}|${a.value}`.localeCompare(`${b.collision_key}|${b.value}`));
}

async function inspectImage(file, candidateId) {
  let metadata;
  try {
    metadata = await sharp(file, {failOn: 'error'}).metadata();
  } catch (error) {
    throw new Error(`candidate ${candidateId} is not a decodable image: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error(`candidate ${candidateId} has incomplete image metadata`);
  return {kind: 'image', decoded: true, format: metadata.format, width: metadata.width, height: metadata.height, duration_seconds: null};
}

function registryInventory(inputs) {
  const records = [];
  for (const [registryKind, inputKey] of [['official', 'official_registry'], ['news', 'news_registry']]) {
    const registryPath = inputs[inputKey];
    const registry = readJson(registryPath);
    if (registry.schema_version !== 1 || registry.episode_id !== 'episode-001' || registry.registry_status !== 'candidate-only' || !Array.isArray(registry.entries)) {
      throw new Error(`${registryKind} registry schema/status is invalid`);
    }
    for (const entry of registry.entries) {
      records.push({registry_kind: registryKind, registry_path: normalize(path.relative(ROOT, registryPath)), registry_rights_policy: registry.rights_policy, entry});
    }
  }
  const duplicateSourceIds = unique(records.map((record) => record.entry.source_id).filter((sourceId, index, all) => all.indexOf(sourceId) !== index));
  if (duplicateSourceIds.length) throw new Error(`duplicate registry source IDs: ${duplicateSourceIds.join(', ')}`);
  return records.sort((a, b) => a.entry.source_id.localeCompare(b.entry.source_id));
}

function exactRequirementBindings(queue, candidate) {
  return queue.requirements
    .filter((requirement) => requirement.candidate?.media_asset_id === candidate.id)
    .map((requirement) => ({
      requirement_id: requirement.requirement_id,
      cut_id: requirement.cut_id,
      source_id: requirement.source_id,
      requirement_kind: requirement.requirement_kind,
      asset_id: requirement.asset_id,
      requirement_status: requirement.requirement_status,
      queue_status: requirement.status,
      dependency: requirement.dependency,
    }))
    .sort((a, b) => `${a.cut_id}|${a.requirement_id}`.localeCompare(`${b.cut_id}|${b.requirement_id}`));
}

function blockersFor(candidate, record, bindings) {
  const blockers = [
    `candidate review state is ${candidate.review_state ?? 'missing'}, not approved`,
    'source/licence/rights decision has not been made by the user',
    'production materialization record does not exist',
    'visual locator, factual scope, crop readability, and intended cut use require human review',
  ];
  if (record.registry_kind === 'news') blockers.push('news screenshot redistribution/commercial-use conditions require separate review');
  if (bindings.length === 0) blockers.push('registered candidate has no requirement in the current episode spec');
  return blockers;
}

async function buildCandidate(record, candidate, queue, root) {
  const properties = parseProperties(candidate);
  if (candidate.media_type !== 'photo') throw new Error(`source-review v01 expects the current 15 candidates to be photos; candidate ${candidate.id} is ${candidate.media_type}`);
  const localPath = path.resolve(candidate.path);
  if (!fs.existsSync(localPath)) throw new Error(`candidate ${candidate.id} local file is missing: ${localPath}`);
  const actualSha = shaFile(localPath);
  const actualBytes = fs.statSync(localPath).size;
  if (actualSha !== candidate.sha256 || actualBytes !== candidate.bytes) throw new Error(`candidate ${candidate.id} DB hash/byte metadata drift`);
  const registryFile = path.resolve(path.dirname(path.join(root, ...record.registry_path.split('/'))), record.entry.relative_path);
  if (!fs.existsSync(registryFile)) throw new Error(`candidate ${candidate.id} registry capture is missing: ${registryFile}`);
  if (shaFile(registryFile) !== actualSha) throw new Error(`candidate ${candidate.id} registry capture and registered bytes differ`);
  const decode = await inspectImage(localPath, candidate.id);
  const bindings = exactRequirementBindings(queue, candidate);
  if (bindings.some((binding) => binding.source_id !== candidate.source_id)) throw new Error(`candidate ${candidate.id} has a cross-source requirement binding`);
  const blockers = blockersFor(candidate, record, bindings);
  return {
    media_asset_id: candidate.id,
    source_id: candidate.source_id,
    title: record.entry.title,
    registry_kind: record.registry_kind,
    provider: record.entry.publisher,
    source_url: record.entry.canonical_url,
    attribution: record.entry.attribution,
    license: record.entry.license,
    rights: {
      registry_policy: record.registry_rights_policy,
      declared_state: properties.rights_status ?? '항목별 이용조건 검토 필요',
      rights_approved: false,
      human_decision: null,
    },
    registered_candidate_bytes: {
      local_path: localPath,
      workspace_relative_path: normalize(path.relative(root, localPath)),
      sha256: actualSha,
      bytes: actualBytes,
      media_type: candidate.media_type,
      mime_type: candidate.mime_type,
      decode,
    },
    registry_capture: {
      local_path: registryFile,
      workspace_relative_path: normalize(path.relative(root, registryFile)),
      sha256: actualSha,
      capture_locator: record.entry.capture_locator,
      capture_provenance: record.entry.capture_provenance,
      published_at: record.entry.published_at ?? null,
      ...(record.entry.recapture_provenance ? {structured_recapture_provenance: record.entry.recapture_provenance} : {}),
    },
    requirement_ids: bindings.map((binding) => binding.requirement_id),
    cut_ids: unique(bindings.map((binding) => binding.cut_id)),
    requirement_bindings: bindings,
    candidate_review: {
      state: candidate.review_state,
      note: candidate.review_note,
      human_approval: false,
      suitability_status: 'pending-human-review',
      suitability_observations: {
        decodable_local_visual: true,
        exact_registry_byte_match: true,
        linked_requirement_count: bindings.length,
        linked_cut_count: unique(bindings.map((binding) => binding.cut_id)).length,
      },
      blockers,
    },
    production_materialization: {
      materialized: false,
      materialization_record_id: null,
      output_paths: [],
      note: 'Registered archive candidate bytes are review inputs only; they are not production materialization.',
    },
  };
}

function uncoveredRequirements(queue) {
  return queue.requirements
    .filter((requirement) => requirement.candidate === null)
    .map((requirement) => ({
      requirement_id: requirement.requirement_id,
      cut_id: requirement.cut_id,
      source_id: requirement.source_id,
      requirement_kind: requirement.requirement_kind,
      asset_id: requirement.asset_id,
      requirement_status: requirement.requirement_status,
      queue_status: requirement.status,
      dependency: requirement.dependency,
      coverage_reason: requirement.status === 'blocked-non-media-work' ? 'requires independent derivative/designed-asset work, not a registered source candidate' : 'no active registered candidate is linked',
    }))
    .sort((a, b) => `${a.cut_id}|${a.requirement_id}`.localeCompare(`${b.cut_id}|${b.requirement_id}`));
}

async function renderContactSheet(candidates, pageNumber) {
  const columns = 3;
  const margin = 30;
  const gap = 20;
  const cellWidth = 606;
  const cellHeight = 500;
  const rows = Math.ceil(candidates.length / columns);
  const width = 1920;
  const height = margin * 2 + rows * cellHeight + (rows - 1) * gap;
  const composites = [];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + col * (cellWidth + gap);
    const top = margin + row * (cellHeight + gap);
    const visual = await sharp(candidate.registered_candidate_bytes.local_path)
      .rotate()
      .resize({width: cellWidth - 24, height: 382, fit: 'contain', background: '#ffffff'})
      .png()
      .toBuffer();
    const cuts = candidate.cut_ids.length
      ? `cuts ${candidate.cut_ids.length}: ${candidate.cut_ids.slice(0, 5).join(', ')}${candidate.cut_ids.length > 5 ? ', …' : ''}`
      : 'NO CURRENT CUT BINDING';
    const label = Buffer.from(`<svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="${cellWidth - 2}" height="${cellHeight - 2}" rx="10" fill="#f4efe5" stroke="#2b2925" stroke-width="2"/>
      <text x="16" y="420" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#181715">${xml(candidate.source_id)}</text>
      <text x="16" y="452" font-family="Arial, sans-serif" font-size="20" fill="#3c3933">media ${candidate.media_asset_id} · ${candidate.registered_candidate_bytes.decode.width}×${candidate.registered_candidate_bytes.decode.height}</text>
      <text x="16" y="481" font-family="Arial, sans-serif" font-size="17" fill="#5b554b">${xml(cuts)}</text>
    </svg>`);
    composites.push({input: label, left, top});
    composites.push({input: visual, left: left + 12, top: top + 12});
  }
  const buffer = await sharp({create: {width, height, channels: 4, background: {r: 218, g: 207, b: 190, alpha: 1}}})
    .composite(composites)
    .png({compressionLevel: 9, adaptiveFiltering: false})
    .toBuffer();
  return {file: `contact-sheet-${String(pageNumber).padStart(2, '0')}.png`, buffer, width, height, candidate_ids: candidates.map((candidate) => candidate.media_asset_id)};
}

function makeReadme(manifest) {
  const rows = manifest.candidates.map((candidate) => `| ${candidate.media_asset_id} | ${candidate.source_id} | ${candidate.cut_ids.join(', ') || '현재 spec 연결 없음'} | ${candidate.requirement_ids.length} | pending |`).join('\n');
  return `# EP001 source evidence review package v01

This is a read-only review surface for 15 captured-page evidence candidates. Because their pixels contain rendered text, they are permanently ineligible as style-frame inputs, production-visible assets, focal/supporting visuals, or motion targets. The package does not approve rights, source identity, production materialization, any cut, Omni generation, or a production stage.

## Human review action

Open the three contact sheets and exact candidate bytes only to verify source identity, locator, transcription and provenance. A human decision cannot make capture pixels production-eligible. Exact factual text must be separately verified and rendered on a raster-free native DOM/vector surface; UI/logo pixels stay excluded.

| media asset | source | exact cut bindings | requirements | state |
|---:|---|---|---:|---|
${rows}

Uncovered requirements: ${manifest.summary.uncovered_requirement_count} (${manifest.summary.missing_media_requirement_count} without an active candidate; ${manifest.summary.blocked_non_media_work_count} independent derivative/designed-asset tasks). Candidate collisions: ${manifest.candidate_collisions.length}. Reuse records: ${manifest.candidate_reuse.length}.
`;
}

export async function buildSourceReviewPackage({root = ROOT} = {}) {
  const inputs = resolveInputs(root);
  for (const [name, file] of Object.entries(inputs)) if (!fs.existsSync(file)) throw new Error(`missing ${name}: ${file}`);
  const spec = readJson(inputs.spec);
  const queue = readJson(inputs.queue);
  const productionState = readJson(inputs.production_state);
  if (spec.episode_id !== 'episode-001' || queue.episode_id !== 'episode-001' || productionState.episode_id !== 'episode-001') throw new Error('EP001 input identity mismatch');
  if (queue._generated?.spec_sha256 !== shaFile(inputs.spec)) throw new Error('acquisition queue is not bound to the current episode spec bytes');
  const inventory = registryInventory(inputs);
  const rows = readCandidateRows(inputs.database);
  const candidates = [];
  for (const record of inventory) {
    const matches = rows.filter((row) => row.source_id === record.entry.source_id && !isHistorical(row));
    if (matches.length !== 1) throw new Error(`registry source ${record.entry.source_id} must have exactly one active candidate; found ${matches.length}`);
    candidates.push(await buildCandidate(record, matches[0], queue, root));
  }
  candidates.sort(byId);
  if (candidates.length !== 15 || queue.summary?.registered_candidate_count !== 15) throw new Error(`expected the current 15-candidate inventory; built ${candidates.length}`);
  const linkedRequirementCount = candidates.reduce((sum, candidate) => sum + candidate.requirement_ids.length, 0);
  if (linkedRequirementCount !== queue.summary?.candidate_summary?.requirement_links) throw new Error('candidate-to-requirement link count differs from acquisition queue summary');
  const candidateCollisions = findCandidateCollisions(candidates);
  const candidateReuse = candidates
    .filter((candidate) => candidate.requirement_ids.length > 1 || candidate.cut_ids.length > 1)
    .map((candidate) => ({media_asset_id: candidate.media_asset_id, source_id: candidate.source_id, requirement_count: candidate.requirement_ids.length, cut_ids: candidate.cut_ids}));
  const uncovered = uncoveredRequirements(queue);
  const contactSheets = [];
  const contactArtifacts = [];
  for (let offset = 0, page = 1; offset < candidates.length; offset += 6, page++) {
    const artifact = await renderContactSheet(candidates.slice(offset, offset + 6), page);
    contactArtifacts.push(artifact);
    contactSheets.push({path: artifact.file, sha256: shaBuffer(artifact.buffer), width: artifact.width, height: artifact.height, candidate_ids: artifact.candidate_ids, contains_placeholders: false});
  }
  const missingMedia = uncovered.filter((requirement) => requirement.queue_status === 'missing');
  const blockedNonMedia = uncovered.filter((requirement) => requirement.queue_status === 'blocked-non-media-work');
  const manifest = {
    schema_version: 1,
    package_id: 'episode-001-source-review-v01',
    episode_id: 'episode-001',
    status: candidateCollisions.length ? 'blocked-candidate-collision' : 'pending-human-source-review',
    generated: true,
    production_authority: false,
    rendered_text_capture_policy: {
      evidence_provenance_only: true,
      style_frame_pixel_input_allowed: false,
      production_visible_allowed: false,
      focal_or_supporting_visual_allowed: false,
      motion_target_allowed: false,
      approval_cannot_restore_pixel_eligibility: true,
    },
    review_scope: {
      human_approval: false,
      source_approval: false,
      rights_approval: false,
      materialized: false,
      approval_marker: null,
      decisions: [],
      note: 'Integrity/decode checks are not human source, suitability, rights, or materialization approval.',
    },
    immutable_input_bindings: {
      episode_spec: {path: SOURCE_FILES.spec, sha256: shaFile(inputs.spec)},
      acquisition_queue: {path: SOURCE_FILES.queue, sha256: shaFile(inputs.queue)},
      official_registry: {path: SOURCE_FILES.official_registry, sha256: shaFile(inputs.official_registry)},
      news_registry: {path: SOURCE_FILES.news_registry, sha256: shaFile(inputs.news_registry)},
      candidate_database_snapshot: {path: SOURCE_FILES.database, sha256: shaFile(inputs.database)},
      production_state_observed_only: {
        path: SOURCE_FILES.production_state,
        sha256: shaFile(inputs.production_state),
        stage: productionState.stage,
        observed_active_root: productionState.active_cut_root,
      },
    },
    summary: {
      registered_candidate_count: candidates.length,
      linked_source_id_count: candidates.filter((candidate) => candidate.requirement_ids.length > 0).length,
      linked_requirement_count: linkedRequirementCount,
      unlinked_registered_candidate_count: candidates.filter((candidate) => candidate.requirement_ids.length === 0).length,
      uncovered_requirement_count: uncovered.length,
      missing_media_requirement_count: missingMedia.length,
      blocked_non_media_work_count: blockedNonMedia.length,
      candidate_collision_count: candidateCollisions.length,
      candidate_reuse_count: candidateReuse.length,
      contact_sheet_count: contactSheets.length,
    },
    candidates,
    candidate_collisions: candidateCollisions,
    candidate_reuse: candidateReuse,
    uncovered_requirements: uncovered,
    contact_sheets: contactSheets,
    next_human_action: 'Use candidate pixels only to verify identity, locator, transcription and provenance; never approve them for visual production use. Build raster-free native text and separate approved assets afterward.',
  };
  return {manifest, contactArtifacts, readme: makeReadme(manifest)};
}

export async function writeSourceReviewPackage({root = ROOT, packageRoot = PACKAGE_ROOT} = {}) {
  const result = await buildSourceReviewPackage({root});
  fs.mkdirSync(packageRoot, {recursive: true});
  fs.writeFileSync(path.join(packageRoot, 'manifest.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(packageRoot, 'README.md'), result.readme);
  for (const artifact of result.contactArtifacts) {
    const file = path.join(packageRoot, artifact.file);
    if (!fs.existsSync(file) || shaFile(file) !== shaBuffer(artifact.buffer)) fs.writeFileSync(file, artifact.buffer);
  }
  return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = await writeSourceReviewPackage();
  console.log(JSON.stringify({status: result.manifest.status, candidates: result.manifest.summary.registered_candidate_count, linked_requirements: result.manifest.summary.linked_requirement_count, uncovered_requirements: result.manifest.summary.uncovered_requirement_count, contact_sheets: result.manifest.contact_sheets.map((sheet) => sheet.path), human_approval: false, materialized: false}));
}
