import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { openArchiveDb } from './db.ts';

export type OfficialIntakeEntry = {
  source_id: string;
  title: string;
  relative_path: string;
  media_type: 'photo' | 'video';
  canonical_url: string;
  publisher: string;
  attribution: string;
  license: string;
  capture_locator: string;
  capture_provenance: string;
  recapture_provenance?: {
    version: 1;
    captured_at: string;
    capture_tool: string;
    exact_url: string;
    locator: string;
    viewport: {width: number; height: number; device_scale_factor: number};
    actual_mime: string;
    actual_extension: string;
    capture_sha256: string;
    source_candidate_status: 'unapproved-source-candidate';
    byte_preserved_copy: {
      relationship: 'byte-identical-copy-of-registry-capture';
      relative_path: string;
      sha256: string;
    };
  };
  published_at?: string;
  expected_duration_seconds?: number;
  duration_tolerance_seconds?: number;
  preserve_full_original?: true;
  timecode?: {
    start: string;
    end: string;
    start_seconds: number;
    end_seconds: number;
    speaker: string;
    context: string;
    locator: string;
    locator_basis: string;
  };
};

type Registry = { schema_version: number; episode_id: string; registry_status: string; rights_policy: string; entries: OfficialIntakeEntry[] };
type CandidateRow = { id: number; source_id: string; media_type: string; path: string; original_url: string; sha256: string | null; mime_type: string | null; bytes: number | null; duration_seconds: number | null; license: string; attribution: string; review_state: string | null; review_note: string | null; properties_json: string };
type Requirement = { requirement_id: string; kind: string; source_id?: string; asset_id?: string; status?: string; blocker?: string };
type ValidatedEntry = OfficialIntakeEntry & { source: string; bytes: number; sha256: string; mime_type: string; width: number; height: number; duration_seconds: number | null; video_codec: string | null; destination: string };
type HistoricalCandidate = { media_asset_id: number; source_id: string; state: string; reason: string };

const SOURCE_SLUG = 'episode-001-official-intake';
const NEWS_SOURCE_SLUG = 'episode-001-news-intake';
const DEFAULT_REGISTRY = path.join(process.cwd(), 'video', 'source-intake', 'episode-001', 'official', 'intake-registry.json');
const DEFAULT_NEWS_REGISTRY = path.join(process.cwd(), 'video', 'source-intake', 'episode-001', 'news', 'intake-registry.json');
const DEFAULT_DB = path.join(process.cwd(), 'data', 'archive.sqlite');
const DEFAULT_RAW = path.join(process.cwd(), 'data', 'raw');
const SAFE_SOURCE_ID = /^[A-Z0-9][A-Z0-9._-]{1,79}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const TIMECODE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u;
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {'.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg'};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.tif':'image/tiff','.tiff':'image/tiff'};
const LEGACY_OFFICIAL_PAGE_CAPTURE_SHA256: Readonly<Record<string, string>> = Object.freeze({
  'LAW-196': '1ae55a24ed10ce83d4880e037d536015362b4ede6abf20e1a4b2df66e5580c09',
  'LAW-1972': 'c8db6518ae84935615d9ecb9f66f6eb04b94245cdcb364be1aa92d7a7d98aa41',
  'LAW-REVISION-21857': '118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b',
  'BILL-2220257': 'b7a5c0d6a69fd684f2b33bc457eed4645d322531892d875cbaab5e10c31e04e9',
  'PET-2200332': 'd9eb0b6c707cf4a20dec9ec4526f017b883ecef2d910f96994750966a51cb663',
  'LAW-195': '3f22c590ba4ac852751ef34b8e6c7386d6619e47bbfe97d65c05db9eff11a1f6',
  'LAW-1973': '9e6934e61056921775e691bdfd2c3f230984012b93bf60067599e717309c905b',
  'LAW-24513': '6d05cba9f1a31eb7e3faa45f130bc54202383564f28af8ecd2e3a4a9311b8d9e',
  'LAW-TRANS': '16410073e82d08134fb8ceb28718590a1a7e511e0fccb89a1867d803db51a627',
  'LAW-TRANS-APPLICATION': '127240e95267325d803f1a468a034050cad2b39f5b7561ff2594198dd177be00',
  'LAW-2457': 'e249f60bcc607de7c792ef44084b3d79d1fa55f15360bcc6e6277c3813d1342a',
  'LAW-2458': 'ea106fccf0b2a1753c9cb176586b754729c45148fe489083e473173524075f05',
});

const hash = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonHash = (value: unknown) => hash(Buffer.from(JSON.stringify(value)));

function inside(root: string, candidate: string) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function realPathWithMissing(target: string) {
  const missing: string[] = [];
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const resolved = fs.realpathSync.native(current);
  return path.join(resolved, ...missing);
}

function assertRealContained(root: string, candidate: string, label: string) {
  if (!inside(root, candidate)) throw new Error(`${label} escapes root`);
  let rootReal;
  let candidateReal;
  try {
    rootReal = realPathWithMissing(root);
    candidateReal = realPathWithMissing(candidate);
  } catch { throw new Error(`${label} cannot be resolved safely`); }
  if (!inside(rootReal, candidateReal)) throw new Error(`${label} escapes root through a link`);
  return candidateReal;
}

function timecodeSeconds(value: string) {
  const match = TIMECODE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function validateTimecode(entry: OfficialIntakeEntry, durationSeconds?: number) {
  const item = entry.timecode;
  if (!item) throw new Error(`video timecode metadata is required: ${entry.source_id}`);
  const parsedStart = timecodeSeconds(item.start);
  const parsedEnd = timecodeSeconds(item.end);
  if (parsedStart === null || parsedEnd === null || Math.abs(parsedStart - item.start_seconds) > 0.0005 || Math.abs(parsedEnd - item.end_seconds) > 0.0005) throw new Error(`video timecode string/seconds mismatch: ${entry.source_id}`);
  if (!(item.start_seconds >= 0) || !(item.end_seconds > item.start_seconds)) throw new Error(`video timecode range is invalid: ${entry.source_id}`);
  if (durationSeconds !== undefined && item.end_seconds > durationSeconds + 0.001) throw new Error(`video timecode exceeds source duration: ${entry.source_id}`);
  for (const key of ['speaker', 'context', 'locator', 'locator_basis'] as const) if (!item[key]?.trim()) throw new Error(`video timecode ${key} is required: ${entry.source_id}`);
}

function probeVideo(file: string, sourceId: string) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  let report: {format?: {duration?: string}; streams?: Array<{codec_type?: string; codec_name?: string; width?: number; height?: number}>};
  try { report = JSON.parse(result.stdout || '{}') as typeof report; } catch { throw new Error(`official intake file is not a decodable video: ${sourceId}`); }
  const stream = report.streams?.find((item) => item.codec_type === 'video');
  const duration = Number(report.format?.duration);
  if (result.status !== 0 || !(duration > 0) || !stream?.codec_name || !stream.width || !stream.height) throw new Error(`official intake file is not a decodable video or has no positive-duration video stream: ${sourceId}`);
  return {duration_seconds: duration, video_codec: stream.codec_name, width: stream.width, height: stream.height};
}

function readRegistry(registryPath: string): Registry {
  const value = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Registry;
  if (value.schema_version !== 1 || value.episode_id !== 'episode-001' || !Array.isArray(value.entries)) throw new Error('official intake registry schema is invalid');
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (!SAFE_SOURCE_ID.test(entry.source_id) || ids.has(entry.source_id)) throw new Error(`invalid or duplicate source_id: ${entry.source_id}`);
    ids.add(entry.source_id);
    if (!['photo', 'video'].includes(entry.media_type) || !/^https?:\/\//u.test(entry.canonical_url)) throw new Error(`invalid official entry: ${entry.source_id}`);
    if (!entry.license.trim() || !entry.publisher.trim() || !entry.attribution.trim()) throw new Error(`incomplete rights metadata: ${entry.source_id}`);
    if (path.isAbsolute(entry.relative_path) || entry.relative_path.includes('..') || entry.relative_path.includes('\\')) throw new Error(`unsafe registry path: ${entry.source_id}`);
    if (entry.media_type === 'video') {
      if (entry.preserve_full_original !== true) throw new Error(`video entry must preserve the whole original: ${entry.source_id}`);
      validateTimecode(entry);
      if (entry.expected_duration_seconds !== undefined && !(entry.expected_duration_seconds > 0)) throw new Error(`video expected_duration_seconds is invalid: ${entry.source_id}`);
      if (entry.duration_tolerance_seconds !== undefined && !(entry.duration_tolerance_seconds >= 0)) throw new Error(`video duration_tolerance_seconds is invalid: ${entry.source_id}`);
    } else if (entry.timecode || entry.preserve_full_original || entry.expected_duration_seconds !== undefined) throw new Error(`photo entry cannot declare video metadata: ${entry.source_id}`);
  }
  return value;
}

async function validateEntry(entry: OfficialIntakeEntry, officialRoot: string) {
  const source = path.resolve(officialRoot, entry.relative_path);
  const resolvedSource = assertRealContained(officialRoot, source, `registry path for ${entry.source_id}`);
  if (!fs.statSync(resolvedSource).isFile()) throw new Error(`official intake file missing: ${entry.source_id}`);
  const bytes = fs.readFileSync(resolvedSource);
  if (entry.media_type === 'video') {
    const meta = probeVideo(resolvedSource, entry.source_id);
    validateTimecode(entry, meta.duration_seconds);
    if (entry.expected_duration_seconds !== undefined && Math.abs(meta.duration_seconds - entry.expected_duration_seconds) > (entry.duration_tolerance_seconds ?? 0.25)) throw new Error(`official intake video duration mismatch: ${entry.source_id}`);
    const mime = VIDEO_MIME_BY_EXTENSION[path.extname(resolvedSource).toLowerCase()];
    if (!mime) throw new Error(`official intake video extension is unsupported: ${entry.source_id}`);
    return {source: resolvedSource, bytes, sha256: hash(bytes), mime_type: mime, ...meta};
  }
  let meta;
  try { meta = await sharp(bytes).metadata(); } catch { throw new Error(`official intake file is not a decodable image: ${entry.source_id}`); }
  if (!meta.width || !meta.height || !meta.format || !['png', 'jpeg', 'jpg', 'webp', 'gif', 'avif', 'tiff'].includes(meta.format)) throw new Error(`official intake file is not a decodable image: ${entry.source_id}`);
  return {source: resolvedSource, bytes, sha256: hash(bytes), mime_type: meta.format === 'jpg' ? 'image/jpeg' : `image/${meta.format}`, width: meta.width, height: meta.height, duration_seconds: null, video_codec: null};
}

function validateOfficialPageCaptureProvenance(entry: ValidatedEntry) {
  if (entry.media_type !== 'photo') return;
  const provenance = entry.recapture_provenance;
  const isExactLegacyCapture = !provenance && LEGACY_OFFICIAL_PAGE_CAPTURE_SHA256[entry.source_id] === entry.sha256;
  if (isExactLegacyCapture) return;
  if (!provenance) throw new Error(`new or changed official-page capture requires structured recapture provenance: ${entry.source_id}`);
  const fail = (reason: string): never => { throw new Error(`invalid structured recapture provenance for ${entry.source_id}: ${reason}`); };
  if (provenance.version !== 1) fail('version');
  if (!provenance.captured_at || !Number.isFinite(Date.parse(provenance.captured_at)) || new Date(provenance.captured_at).toISOString() !== provenance.captured_at) fail('captured_at');
  if (!provenance.capture_tool?.trim()) fail('capture_tool');
  if (provenance.exact_url !== entry.canonical_url || !/^https:\/\//u.test(provenance.exact_url)) fail('exact_url');
  if (provenance.locator !== entry.capture_locator || !provenance.locator?.trim()) fail('locator');
  if (!Number.isInteger(provenance.viewport?.width) || provenance.viewport.width <= 0 || !Number.isInteger(provenance.viewport?.height) || provenance.viewport.height <= 0 || !(provenance.viewport?.device_scale_factor > 0)) fail('viewport');
  const extension = path.extname(entry.relative_path).toLowerCase();
  if (provenance.actual_extension !== extension || IMAGE_MIME_BY_EXTENSION[extension] !== entry.mime_type || provenance.actual_mime !== entry.mime_type) fail('actual MIME/extension consistency');
  if (!SHA256.test(provenance.capture_sha256) || provenance.capture_sha256 !== entry.sha256) fail('capture_sha256');
  if (provenance.source_candidate_status !== 'unapproved-source-candidate') fail('source_candidate_status');
  const copy = provenance.byte_preserved_copy;
  const expectedCopyPath = `episode-media/episode-001/${entry.source_id}/${path.basename(entry.relative_path)}`;
  if (copy?.relationship !== 'byte-identical-copy-of-registry-capture' || copy?.relative_path !== expectedCopyPath || copy?.sha256 !== entry.sha256) fail('byte-preserved-copy binding');
}

function expectedProperties(entry: ValidatedEntry, registryPath: string) {
  return {episode_id: 'episode-001', source_id: entry.source_id, title: entry.title, publisher: entry.publisher, ...(entry.published_at ? {published_at: entry.published_at} : {}), capture_locator: entry.capture_locator, capture_provenance: entry.capture_provenance, ...(entry.recapture_provenance ? {structured_recapture_provenance: entry.recapture_provenance} : {}), registry_path: path.relative(process.cwd(), registryPath).replaceAll('\\', '/'), source_sha256: entry.sha256, source_bytes: entry.bytes, source_dimensions: {width: entry.width, height: entry.height}, ...(entry.media_type === 'video' ? {source_duration_seconds: entry.duration_seconds, video_codec: entry.video_codec, source_timecode: entry.timecode, whole_original_preserved: true} : {}), rights_status: '항목별 이용조건 검토 필요'};
}

async function validateExistingCandidate(existing: CandidateRow, entry: ValidatedEntry, rawRoot: string, registryPath: string) {
  if (existing.original_url !== entry.canonical_url || existing.license !== entry.license || existing.attribution !== entry.attribution) throw new Error(`existing candidate metadata drift for ${entry.source_id}`);
  let properties: Record<string, unknown>;
  try { properties = JSON.parse(existing.properties_json) as Record<string, unknown>; } catch { throw new Error(`existing candidate properties are invalid for ${entry.source_id}`); }
  for (const [key, expected] of Object.entries(expectedProperties(entry, registryPath))) {
    const actual = properties[key];
    const matches = typeof expected === 'object' && expected !== null
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
    if (!matches) throw new Error(`existing candidate metadata drift for ${entry.source_id}: ${key}`);
  }
  if (!existing.sha256 || existing.sha256 !== entry.sha256) throw new Error(`existing candidate hash mismatch for ${entry.source_id}: registered ${existing.sha256 ?? 'missing'}, intake ${entry.sha256}`);
  if (existing.bytes === null || existing.bytes <= 0 || existing.bytes !== entry.bytes) throw new Error(`existing candidate byte count mismatch for ${entry.source_id}`);
  if (existing.media_type !== entry.media_type) throw new Error(`existing candidate media type mismatch for ${entry.source_id}`);
  if (entry.media_type === 'video' && (existing.duration_seconds === null || Math.abs(existing.duration_seconds - entry.duration_seconds!) > 0.001)) throw new Error(`existing candidate duration mismatch for ${entry.source_id}`);
  if (!existing.path || !inside(rawRoot, existing.path)) throw new Error(`existing candidate path is outside effective raw root for ${entry.source_id}`);
  const candidatePath = assertRealContained(rawRoot, existing.path, `existing candidate path for ${entry.source_id}`);
  let stat;
  try { stat = fs.statSync(candidatePath); } catch { throw new Error(`existing candidate file is missing for ${entry.source_id}`); }
  if (!stat.isFile()) throw new Error(`existing candidate path is not a file for ${entry.source_id}`);
  if (stat.size !== entry.bytes) throw new Error(`existing candidate file byte count mismatch for ${entry.source_id}`);
  const bytes = fs.readFileSync(candidatePath);
  if (hash(bytes) !== entry.sha256) throw new Error(`existing candidate file hash mismatch for ${entry.source_id}`);
  let mime: string;
  if (entry.media_type === 'video') {
    const meta = probeVideo(candidatePath, entry.source_id);
    validateTimecode(entry, meta.duration_seconds);
    if (Math.abs(meta.duration_seconds - entry.duration_seconds!) > 0.001 || meta.video_codec !== entry.video_codec || meta.width !== entry.width || meta.height !== entry.height) throw new Error(`existing candidate video metadata mismatch for ${entry.source_id}`);
    mime = VIDEO_MIME_BY_EXTENSION[path.extname(candidatePath).toLowerCase()];
  } else {
    let meta;
    try { meta = await sharp(bytes).metadata(); } catch { throw new Error(`existing candidate file is not a decodable image: ${entry.source_id}`); }
    if (!meta.width || !meta.height || !meta.format) throw new Error(`existing candidate file is not a decodable image: ${entry.source_id}`);
    mime = meta.format === 'jpg' ? 'image/jpeg' : `image/${meta.format}`;
  }
  if (typeof existing.mime_type !== 'string' || !existing.mime_type.trim() || existing.mime_type !== mime) throw new Error(`existing candidate MIME mismatch for ${entry.source_id}`);
}

function readExisting(db: DatabaseSync, sourceId: string): CandidateRow | undefined {
  return db.prepare(`SELECT m.id,g.external_key AS source_id,m.media_type,m.path,m.original_url,m.sha256,m.mime_type,m.bytes,m.duration_seconds,m.license,m.attribution,q.state AS review_state,q.note AS review_note,m.properties_json
    FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id LEFT JOIN review_queue q ON q.entity_type='media_asset' AND q.entity_id=m.id
    WHERE g.kind='media' AND g.external_key=?`).get(sourceId) as CandidateRow | undefined;
}

function readCandidates(db: DatabaseSync): CandidateRow[] {
  return db.prepare(`SELECT m.id,g.external_key AS source_id,m.media_type,m.path,m.original_url,m.sha256,m.mime_type,m.bytes,m.duration_seconds,m.license,m.attribution,q.state AS review_state,q.note AS review_note,m.properties_json
    FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id LEFT JOIN review_queue q ON q.entity_type='media_asset' AND q.entity_id=m.id WHERE g.kind='media'`).all() as CandidateRow[];
}

type IntakeConfig = {sourceSlug: string; sourceName: string; baseUrl: string; adapter: string; label: string};
const OFFICIAL_CONFIG: IntakeConfig = {sourceSlug: SOURCE_SLUG, sourceName: 'EP001 공식 자료 intake registry', baseUrl: 'https://www.law.go.kr', adapter: 'episode-official-intake', label: 'official'};
const NEWS_CONFIG: IntakeConfig = {sourceSlug: NEWS_SOURCE_SLUG, sourceName: 'EP001 뉴스 기사 화면 intake registry', baseUrl: 'https://www.yna.co.kr', adapter: 'episode-news-intake', label: 'news'};

function ensureSource(db: DatabaseSync, config: IntakeConfig) {
  db.prepare(`INSERT INTO source_registry (slug,name,base_url,trust_tier,license_notes,enabled,adapter,discovery_only) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,trust_tier=excluded.trust_tier,license_notes=excluded.license_notes,adapter=excluded.adapter,discovery_only=excluded.discovery_only`).run(
    config.sourceSlug, config.sourceName, config.baseUrl, 1, '후보 등록 전용; 항목별 이용조건·출처·재이용 범위 검토 필요', 1, config.adapter, 0,
  );
}

function rawDestination(rawRoot: string, entry: OfficialIntakeEntry) {
  const destination = path.resolve(rawRoot, 'episode-media', 'episode-001', entry.source_id, path.basename(entry.relative_path));
  assertRealContained(rawRoot, destination, `raw destination for ${entry.source_id}`);
  return destination;
}

function trackNewDirectories(directory: string, createdDirectories: string[]) {
  const missing = [] as string[];
  let current = path.resolve(directory);
  while (!fs.existsSync(current)) {
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const item of missing.reverse()) {
    fs.mkdirSync(item);
    createdDirectories.push(item);
  }
}

function cleanCreatedFiles(createdFiles: string[], createdDirectories: string[]) {
  for (const file of [...createdFiles].reverse()) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* noop */ }
  }
  for (const directory of [...createdDirectories].sort((a, b) => b.length - a.length)) {
    try { if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); } catch { /* noop */ }
  }
}

type ValidatedIntake = {registryPath: string; registry: Registry; registrySha256: string; config: IntakeConfig; validated: ValidatedEntry[]};

async function prevalidateIntake(registryPath: string, rawRoot: string, config: IntakeConfig): Promise<ValidatedIntake> {
  const registry = readRegistry(registryPath);
  const intakeRoot = path.dirname(registryPath);
  const validated = [] as ValidatedEntry[];
  for (const entry of registry.entries) {
    const file = await validateEntry(entry, intakeRoot);
    const validatedEntry = {...entry, ...file, bytes: file.bytes.byteLength, destination: rawDestination(rawRoot, entry)} as ValidatedEntry;
    if (config.label === 'official') validateOfficialPageCaptureProvenance(validatedEntry);
    validated.push(validatedEntry);
  }
  return {registryPath, registry, registrySha256: hash(fs.readFileSync(registryPath)), config, validated};
}

function assertUniqueRegistrySourceIds(intakes: ValidatedIntake[]) {
  const owner = new Map<string, string>();
  for (const intake of intakes) for (const entry of intake.validated) {
    const previous = owner.get(entry.source_id);
    if (previous) throw new Error(`duplicate source_id across intake registries: ${entry.source_id} (${previous}, ${intake.config.label})`);
    owner.set(entry.source_id, intake.config.label);
  }
}

async function commitValidatedIntakes(intakes: ValidatedIntake[], dbPath: string, rawRoot: string) {
  assertUniqueRegistrySourceIds(intakes);
  const results = new Map<string, {run_id: number; created_media_ids: number[]; deduped: number[]}>();
  const createdFiles: string[] = [];
  const createdDirectories: string[] = [];
  const db = openArchiveDb(dbPath);
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const intake of intakes) {
      ensureSource(db, intake.config);
      const source = db.prepare('SELECT id FROM source_registry WHERE slug=?').get(intake.config.sourceSlug) as {id: number};
      const run = db.prepare("INSERT INTO ingest_runs (source_id,mode,status) VALUES (?,?, 'running')").run(source.id, 'sync');
      const runId = Number(run.lastInsertRowid);
      db.prepare('UPDATE source_registry SET last_run_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(runId, source.id);
      results.set(intake.config.label, {run_id: runId, created_media_ids: [], deduped: []});
    }

    const seenHashes = new Map<string, string>();
    const preflight = new Map<string, CandidateRow | undefined>();
    for (const intake of intakes) {
      for (const entry of intake.validated) {
        const existing = readExisting(db, entry.source_id);
        if (existing) await validateExistingCandidate(existing, entry, rawRoot, intake.registryPath);
        const previousSource = seenHashes.get(entry.sha256);
        if (previousSource && previousSource !== entry.source_id) throw new Error(`SHA-256 already belongs to another source_id: ${entry.source_id} vs ${previousSource}`);
        seenHashes.set(entry.sha256, entry.source_id);
        if (fs.existsSync(entry.destination)) {
          let stat;
          try { stat = fs.statSync(entry.destination); } catch { throw new Error(`raw destination cannot be inspected for ${entry.source_id}`); }
          if (!stat.isFile()) throw new Error(`raw destination is not a file for ${entry.source_id}`);
          const destinationBytes = fs.readFileSync(entry.destination);
          if (destinationBytes.byteLength !== entry.bytes || hash(destinationBytes) !== entry.sha256) throw new Error(`raw destination hash collision for ${entry.source_id}`);
          if (entry.media_type === 'video') {
            const meta = probeVideo(entry.destination, entry.source_id);
            if (Math.abs(meta.duration_seconds - entry.duration_seconds!) > 0.001 || meta.video_codec !== entry.video_codec || meta.width !== entry.width || meta.height !== entry.height) throw new Error(`raw destination video metadata mismatch for ${entry.source_id}`);
          } else try {
            const meta = await sharp(destinationBytes).metadata();
            if (!meta.width || !meta.height || !meta.format) throw new Error('invalid image');
          } catch { throw new Error(`raw destination is not a decodable image for ${entry.source_id}`); }
        }
        preflight.set(entry.source_id, existing);
      }
    }

    for (const intake of intakes) {
      const result = results.get(intake.config.label)!;
      for (const entry of intake.validated) {
        const existing = preflight.get(entry.source_id);
        if (existing) {
          result.deduped.push(existing.id);
          continue;
        }
        const sameHash = db.prepare('SELECT m.id,g.external_key AS source_id FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id WHERE m.sha256=?').get(entry.sha256) as {id: number; source_id: string} | undefined;
        if (sameHash && sameHash.source_id !== entry.source_id) throw new Error(`SHA-256 already belongs to another source_id: ${entry.source_id} vs ${sameHash.source_id}`);
        const destination = entry.destination;
        if (!fs.existsSync(destination)) {
          trackNewDirectories(path.dirname(destination), createdDirectories);
          createdFiles.push(destination);
          fs.copyFileSync(entry.source, destination);
        }
        const properties = {...expectedProperties(entry, intake.registryPath), retrieved_at: new Date().toISOString(), review_semantics: 'candidate-pending-review'};
        const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,CURRENT_TIMESTAMP)').run('media', entry.source_id, entry.title, JSON.stringify(properties));
        const media = db.prepare(`INSERT INTO media_assets (node_id,media_type,path,original_url,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(Number(node.lastInsertRowid), entry.media_type, destination, entry.canonical_url, entry.sha256, entry.mime_type, entry.bytes, entry.duration_seconds, entry.license, entry.attribution, JSON.stringify(properties));
        const mediaId = Number(media.lastInsertRowid);
        db.prepare("UPDATE review_queue SET note=? WHERE entity_type='media_asset' AND entity_id=?").run('후보 등록 완료. 영상 사용 전 원문 출처·권리·시각 적합성·정규화 crop을 사람이 검토하고 승인해야 함.', mediaId);
        result.created_media_ids.push(mediaId);
      }
      db.prepare('UPDATE ingest_runs SET status=?,finished_at=CURRENT_TIMESTAMP,rows_seen=?,rows_staged=?,error=?,metadata_json=? WHERE id=?').run(
        'success', intake.validated.length, result.created_media_ids.length, null,
        JSON.stringify({episode_id: 'episode-001', source_slug: intake.config.sourceSlug, registry_sha256: intake.registrySha256, created_media_ids: result.created_media_ids, deduped_media_ids: result.deduped, semantics: 'candidate-pending-review'}), result.run_id,
      );
    }
    db.exec('COMMIT');
    return results;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    cleanCreatedFiles(createdFiles, createdDirectories);
    throw error;
  } finally {
    db.close();
  }
}

function resultForIntake(intake: ValidatedIntake, dryRun: boolean, committed?: {run_id: number; created_media_ids: number[]; deduped: number[]}) {
  return {dry_run: dryRun, ...(committed ? {run_id: committed.run_id} : {}), registry_sha256: intake.registrySha256, entries: intake.validated.map(({bytes, ...entry}) => ({...entry, bytes, ...(dryRun ? {action: 'would-register'} : {})})), created_media_ids: committed?.created_media_ids ?? [], deduped: committed?.deduped ?? [], errors: []};
}

async function prepareIntakeAcquisition(options: { dryRun?: boolean; registryPath: string; dbPath?: string; rawRoot?: string; config: IntakeConfig }) {
  const dryRun = options.dryRun === true;
  const dbPath = path.resolve(options.dbPath ?? process.env.ARCHIVE_DB_PATH ?? DEFAULT_DB);
  const rawRoot = path.resolve(options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? DEFAULT_RAW);
  const intake = await prevalidateIntake(options.registryPath, rawRoot, options.config);
  if (dryRun) return resultForIntake(intake, true);
  const committed = await commitValidatedIntakes([intake], dbPath, rawRoot);
  return resultForIntake(intake, false, committed.get(intake.config.label));
}

export async function prepareOfficialAcquisition(options: { dryRun?: boolean; registryPath?: string; dbPath?: string; rawRoot?: string } = {}) {
  return prepareIntakeAcquisition({dryRun: options.dryRun, registryPath: options.registryPath ?? DEFAULT_REGISTRY, dbPath: options.dbPath, rawRoot: options.rawRoot, config: OFFICIAL_CONFIG});
}

export async function prepareNewsAcquisition(options: { dryRun?: boolean; registryPath?: string; dbPath?: string; rawRoot?: string } = {}) {
  return prepareIntakeAcquisition({dryRun: options.dryRun, registryPath: options.registryPath ?? DEFAULT_NEWS_REGISTRY, dbPath: options.dbPath, rawRoot: options.rawRoot, config: NEWS_CONFIG});
}

export async function prepareEpisodeAcquisition(options: {dryRun?: boolean; officialRegistryPath?: string; newsRegistryPath?: string; dbPath?: string; rawRoot?: string} = {}) {
  const dryRun = options.dryRun === true;
  const dbPath = path.resolve(options.dbPath ?? process.env.ARCHIVE_DB_PATH ?? DEFAULT_DB);
  const rawRoot = path.resolve(options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? DEFAULT_RAW);
  const official = await prevalidateIntake(options.officialRegistryPath ?? DEFAULT_REGISTRY, rawRoot, OFFICIAL_CONFIG);
  const news = await prevalidateIntake(options.newsRegistryPath ?? DEFAULT_NEWS_REGISTRY, rawRoot, NEWS_CONFIG);
  assertUniqueRegistrySourceIds([official, news]);
  if (dryRun) return {official: resultForIntake(official, true), news: resultForIntake(news, true)};
  const committed = await commitValidatedIntakes([official, news], dbPath, rawRoot);
  return {official: resultForIntake(official, false, committed.get(OFFICIAL_CONFIG.label)), news: resultForIntake(news, false, committed.get(NEWS_CONFIG.label))};
}

function isNonProductionHistorical(candidate: CandidateRow) {
  const note = candidate.review_note ?? '';
  return candidate.review_state === 'rejected' || /supersed|historical|반려|폐기/u.test(note);
}

function candidateQueueStatus(candidate: CandidateRow) {
  if (isNonProductionHistorical(candidate)) return 'candidate-rejected-historical';
  if (candidate.review_state === 'approved') return 'approved-ready';
  if (candidate.review_state === 'pending') return 'candidate-pending-review';
  if (candidate.review_state === 'hold') return 'candidate-on-hold';
  if (candidate.review_state === null || candidate.review_state.trim() === '') return 'candidate-missing-review-state';
  return 'candidate-unsupported-review-state';
}

function requirementRows(spec: {cuts?: {shot_id: string; requirements?: Requirement[]}[]}, candidates: CandidateRow[]) {
  const bySource = new Map(candidates.map((candidate) => [candidate.source_id, candidate]));
  const rows = [] as Record<string, unknown>[];
  for (const cut of spec.cuts ?? []) for (const requirement of cut.requirements ?? []) {
    const candidate = requirement.source_id ? bySource.get(requirement.source_id) : undefined;
    const historical = candidate && isNonProductionHistorical(candidate);
    const nonMediaWork = requirement.kind === 'transparent-derivative' || requirement.kind === 'designed-asset';
    const status = candidate ? candidateQueueStatus(candidate) : nonMediaWork ? 'blocked-non-media-work' : 'missing';
    const candidateSnapshot = candidate ? {media_asset_id: candidate.id, state: candidate.review_state, path: candidate.path, source_url: candidate.original_url, license: candidate.license, attribution: candidate.attribution, sha256: candidate.sha256, bytes: candidate.bytes} : null;
    rows.push({cut_id: cut.shot_id, requirement_id: requirement.requirement_id, requirement_kind: requirement.kind, source_id: requirement.source_id ?? null, asset_id: requirement.asset_id ?? null, requirement_status: requirement.status ?? null, dependency: requirement.blocker ?? 'none', candidate: historical ? null : candidateSnapshot, historical_candidate: historical ? candidateSnapshot : null, status});
  }
  return rows;
}

function readCandidateProperties(candidate: CandidateRow) {
  try {
    const properties = JSON.parse(candidate.properties_json) as Record<string, unknown>;
    return properties && typeof properties === 'object' ? properties : {};
  } catch {
    return {};
  }
}

/**
 * Keep rejected/superseded EP001 media visible for audit, while preventing it
 * from being treated as an active source candidate. The episode/source fields
 * are deliberately required so unrelated rejected media in the archive is not
 * swept into this report.
 */
function historicalCandidates(spec: {episode_id: string}, candidates: CandidateRow[], activeSourceIds?: string[]) {
  if (!activeSourceIds) return [] as HistoricalCandidate[];
  return candidates
    .filter((candidate) => {
      const properties = readCandidateProperties(candidate);
      if (properties.episode_id !== spec.episode_id || properties.source_id !== candidate.source_id) return false;
      return isNonProductionHistorical(candidate);
    })
    .map((candidate) => ({
      media_asset_id: candidate.id,
      source_id: candidate.source_id,
      state: candidate.review_state ?? 'pending',
      reason: candidate.review_note?.trim() || '검토 상태가 비생산 역사 후보로 분류됨',
    }))
    .sort((a, b) => a.media_asset_id - b.media_asset_id);
}

type RegistrySourceGroups = string[] | {official: string[]; news?: string[]};

export function buildAcquisitionQueueReport(spec: {episode_id: string; cuts?: {shot_id: string; requirements?: Requirement[]}[]}, candidates: CandidateRow[], registrySha256: string | Record<string, string>, specSha256: string, registrySources?: RegistrySourceGroups) {
  const officialSourceIds = Array.isArray(registrySources) ? registrySources : registrySources?.official;
  const newsSourceIds = Array.isArray(registrySources) ? [] : registrySources?.news ?? [];
  const allSourceIds = registrySources ? [...new Set([...(officialSourceIds ?? []), ...newsSourceIds])] : undefined;
  const registryCandidates = allSourceIds ? candidates.filter((candidate) => allSourceIds.includes(candidate.source_id)) : candidates;
  const activeCandidates = registryCandidates.filter((candidate) => !isNonProductionHistorical(candidate));
  const nonProductionHistoricalCandidates = historicalCandidates(spec, candidates, allSourceIds);
  const requirements = requirementRows(spec, registryCandidates);
  const count = (key: string, value: string) => requirements.filter((item) => item[key] === value).length;
  const bySource = new Map<string, number>();
  for (const item of requirements) if (typeof item.source_id === 'string') bySource.set(item.source_id, (bySource.get(item.source_id) ?? 0) + 1);
  const linkedSourceIds = new Set(requirements.filter((item) => item.candidate && typeof item.source_id === 'string').map((item) => item.source_id as string));
  const summaryFor = (sourceIds: string[]) => {
    const sourceSet = new Set(sourceIds);
    const groupedCandidates = activeCandidates.filter((candidate) => sourceSet.has(candidate.source_id));
    const groupedRequirements = requirements.filter((item) => typeof item.source_id === 'string' && sourceSet.has(item.source_id) && item.candidate !== null);
    return {registered_candidates: groupedCandidates.length, linked_source_ids: new Set(groupedRequirements.map((item) => item.source_id as string)).size, requirement_links: groupedRequirements.length};
  };
  const aggregateSummary = {registered_candidates: activeCandidates.length, linked_source_ids: linkedSourceIds.size, requirement_links: requirements.filter((item) => item.candidate !== null).length};
  const statuses = ['missing', 'candidate-pending-review', 'candidate-on-hold', 'candidate-missing-review-state', 'candidate-rejected-historical', 'candidate-unsupported-review-state', 'approved-ready', 'materialized', 'blocked-non-media-work'];
  return {_generated: {do_not_edit: true, source: 'episode-spec.json + official/intake-registry.json + news/intake-registry.json + archive.sqlite', generated_at: new Date().toISOString(), spec_sha256: specSha256, registry_sha256: registrySha256, registry_source_ids: [...(allSourceIds ?? activeCandidates.map((candidate) => candidate.source_id))].sort(), generator: 'src/lib/episode-official-acquisition.ts'}, schema_version: 1, episode_id: spec.episode_id, status: 'candidate-registration-only', requirements, non_production_historical_candidates: nonProductionHistoricalCandidates, summary: {total_requirements: requirements.length, by_kind: Object.fromEntries([...new Set(requirements.map((item) => String(item.requirement_kind)))].map((kind) => [kind, requirements.filter((item) => item.requirement_kind === kind).length])), by_status: Object.fromEntries(statuses.map((status) => [status, count('status', status)])), source_reuse: Object.fromEntries([...bySource.entries()].sort()), registered_candidate_count: activeCandidates.length, official_candidate_summary: summaryFor(officialSourceIds ?? activeCandidates.map((candidate) => candidate.source_id)), ...(newsSourceIds.length ? {news_candidate_summary: summaryFor(newsSourceIds)} : {}), candidate_summary: aggregateSummary, non_production_historical_candidate_count: nonProductionHistoricalCandidates.length, note: '이 보고서는 후보 등록과 검토 큐 상태만 반영하며 episode-spec requirement status를 변경하지 않는다. hold·누락 검토 상태는 pending-ready가 아니며 비생산 역사 후보는 감사 추적용으로만 표시하고 active candidate로 세지 않는다.'}};
}

export function comparableAcquisitionQueueReport(report: unknown) {
  const copy = JSON.parse(JSON.stringify(report)) as {_generated?: {generated_at?: string}};
  if (copy._generated) delete copy._generated.generated_at;
  return copy;
}

export function acquisitionQueueReportHash(report: unknown) {
  return jsonHash(comparableAcquisitionQueueReport(report));
}

export function readCandidateRows(dbPath = process.env.ARCHIVE_DB_PATH ?? DEFAULT_DB) {
  if (!fs.existsSync(dbPath)) return [] as CandidateRow[];
  const db = new DatabaseSync(dbPath, {readOnly: true});
  try { return readCandidates(db); } finally { db.close(); }
}

async function validateIntakeCandidates(options: { registryPath: string; dbPath?: string; rawRoot?: string; config: IntakeConfig }) {
  const registryPath = options.registryPath;
  const dbPath = path.resolve(options.dbPath ?? process.env.ARCHIVE_DB_PATH ?? DEFAULT_DB);
  const rawRoot = path.resolve(options.rawRoot ?? process.env.ARCHIVE_RAW_ROOT ?? DEFAULT_RAW);
  const registry = readRegistry(registryPath);
  const candidates = readCandidateRows(dbPath);
  const candidateIds: number[] = [];
  for (const entry of registry.entries) {
    const file = await validateEntry(entry, path.dirname(registryPath));
    const validated = {...entry, ...file, bytes: file.bytes.byteLength, destination: rawDestination(rawRoot, entry)} as ValidatedEntry;
    if (options.config.label === 'official') validateOfficialPageCaptureProvenance(validated);
    const existing = candidates.find((candidate) => candidate.source_id === entry.source_id);
    if (!existing) throw new Error(`registered candidate is missing from archive: ${entry.source_id}`);
    await validateExistingCandidate(existing, validated, rawRoot, registryPath);
    candidateIds.push(existing.id);
  }
  return {registry_sha256: hash(fs.readFileSync(registryPath)), candidate_ids: candidateIds, candidate_count: candidateIds.length};
}

export async function validateRegisteredCandidates(options: { registryPath?: string; dbPath?: string; rawRoot?: string } = {}) {
  return validateIntakeCandidates({registryPath: options.registryPath ?? DEFAULT_REGISTRY, dbPath: options.dbPath, rawRoot: options.rawRoot, config: OFFICIAL_CONFIG});
}

export async function validateNewsCandidates(options: { registryPath?: string; dbPath?: string; rawRoot?: string } = {}) {
  return validateIntakeCandidates({registryPath: options.registryPath ?? DEFAULT_NEWS_REGISTRY, dbPath: options.dbPath, rawRoot: options.rawRoot, config: NEWS_CONFIG});
}

export { DEFAULT_REGISTRY, DEFAULT_NEWS_REGISTRY, SOURCE_SLUG, NEWS_SOURCE_SLUG };
