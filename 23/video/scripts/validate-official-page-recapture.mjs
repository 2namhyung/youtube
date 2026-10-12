import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

export const RECAPTURE_ROOT = 'video/source-intake/episode-001/official/recapture-v03';
const SCHEMA_PATH = 'video/contracts/official-page-recapture-v1.schema.json';
const EXPECTED = [
  ['LAW-195-RECAPTURE-V01', 'LAW-195', '제195조제1항에 후단을 다음과 같이 신설한다.'],
  ['LAW-196-RECAPTURE-V01', 'LAW-196', '제196조를 삭제한다.'],
  ['LAW-1972-RECAPTURE-V01', 'LAW-1972', '제197조의2제4항(종전의 제2항)'],
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const safeBasename = (value) => typeof value === 'string' && path.basename(value) === value && value.endsWith('.png');

export async function validateOfficialPageRecapture({root=process.cwd(), packageRoot=RECAPTURE_ROOT, manifest:providedManifest} = {}) {
  const failures = [];
  const must = (value, message) => { if (!value) failures.push(message); };
  const registry = JSON.parse(fs.readFileSync(path.resolve(root, 'video/source-intake/episode-001/official/intake-registry.json'), 'utf8'));
  const base = path.resolve(root, packageRoot);
  const manifest = providedManifest ?? JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const schemaBytes = fs.readFileSync(path.resolve(root, SCHEMA_PATH));
  must(manifest?.schema_version === 1 && manifest?.schema?.path === SCHEMA_PATH && manifest?.schema?.sha256 === sha256(schemaBytes), 'recapture schema binding is missing or stale');
  must(manifest?.status === 'unregistered-source-candidate-evidence' && manifest?.production_authority === false, 'recapture evidence must remain non-production and unregistered');
  must(nonBlank(manifest?.capture_tool), 'capture_tool is required');
  must(manifest?.viewport?.width === 1440 && manifest?.viewport?.height === 1080 && manifest?.viewport?.device_scale_factor === 1, 'recapture viewport must be exact 1440x1080 at DPR 1');
  const captures = manifest?.captures ?? [];
  must(JSON.stringify(captures.map((item) => [item.source_id, item.replacement_for])) === JSON.stringify(EXPECTED.map(([sourceId, replacement]) => [sourceId, replacement])), 'representative recapture set/order must be exact');
  must(new Set(captures.map((item) => item.source_id)).size === captures.length, 'recapture source IDs must be unique');
  must(new Set(captures.map((item) => item.sha256)).size === captures.length, 'distinct locators produced duplicate screenshot bytes');
  for (const [sourceId, replacementFor, needle] of EXPECTED) {
    const item = captures.find((candidate) => candidate.source_id === sourceId);
    const old = registry.entries.find((candidate) => candidate.source_id === replacementFor);
    const label = `${sourceId}/${replacementFor}`;
    must(Boolean(item && old), `${label}: capture or legacy registry locator is missing`);
    if (!item || !old) continue;
    must(!registry.entries.some((candidate) => candidate.source_id === sourceId), `${label}: recapture evidence must not be registered automatically`);
    must(item.requested_url === old.canonical_url && item.exact_url === old.canonical_url && /^https:\/\//u.test(item.exact_url), `${label}: exact/requested URL must remain bound to the registry URL`);
    must(nonBlank(item.locator) && item.matched_text?.includes(needle) && item.locator_evidence?.matched_text === item.matched_text, `${label}: exact text locator evidence is missing`);
    must(item.locator_evidence?.selector === '#viewwrapCenter' && item.locator_evidence?.scroll_top >= 0, `${label}: scroll container locator evidence is invalid`);
    const target = item.locator_evidence?.target_rect;
    const container = item.locator_evidence?.container_rect;
    must(target?.height > 0 && container?.height > 0 && target.top >= container.top && target.top + target.height <= container.top + container.height, `${label}: located text was not visible inside the captured source surface`);
    must(nonBlank(item.captured_at) && Number.isFinite(Date.parse(item.captured_at)) && new Date(item.captured_at).toISOString() === item.captured_at, `${label}: captured_at must be an exact ISO instant`);
    must(item.actual_mime === 'image/png' && item.actual_extension === '.png' && safeBasename(item.file), `${label}: actual MIME/extension/file mismatch`);
    must(item.source_candidate_status === 'unapproved-source-candidate' && item.human_approval === false && item.rights_approved === false && item.materialized === false, `${label}: recapture must remain unapproved and unmaterialized`);
    must(item.byte_preserved_copy?.relationship === 'planned-byte-identical-copy-of-capture-on-registration'
      && item.byte_preserved_copy?.relative_path === `episode-media/episode-001/${sourceId}/${item.file}`
      && item.byte_preserved_copy?.sha256 === item.sha256
      && item.byte_preserved_copy?.status === 'not-created-pending-registration', `${label}: planned byte-preserved-copy binding is invalid`);
    const file = path.resolve(base, item.file);
    must(file.startsWith(base + path.sep) && fs.existsSync(file), `${label}: capture file is missing or unsafe`);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    must(bytes.byteLength === item.bytes && sha256(bytes) === item.sha256, `${label}: capture bytes/hash drift`);
    let metadata;
    try { metadata = await sharp(bytes).metadata(); } catch { metadata = null; }
    must(metadata?.format === 'png' && metadata?.width === 1440 && metadata?.height === 1080, `${label}: file must decode as exact 1440x1080 PNG`);
  }
  return {ok: failures.length === 0, failures};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateOfficialPageRecapture();
  if (!result.ok) { console.error(result.failures.join('\n')); process.exitCode = 1; }
  else console.log('Official-page recapture evidence is byte-bound, locator-visible, unregistered, unapproved, and non-production.');
}
