import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openArchiveDb } from './db.ts';
import { ensureAssemblyMediaSource, finishIngestRun, startIngestRun } from './sources.ts';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

type Candidate = {
  membershipId: number;
  personNodeId: number;
  naasCd: string;
  sourceEvidenceId: number | null;
  sourceRawPath: string | null;
  sourceContentHash: string | null;
  originalUrl: string;
};

export type AssemblyMediaSyncResult = {
  runId: number;
  rowsSeen: number;
  rowsStaged: number;
  downloaded: number;
  deduped: number;
  failed: number;
  status: 'success' | 'failed';
  errors: { membershipId: number; naasCd: string; code: string }[];
};

function safeBatchSize(value: number | undefined) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('사진 수집 배치는 1 이상의 정수여야 합니다.');
  return Math.min(value, 100);
}

function safeMaxBytes(value: number | undefined) {
  if (value === undefined) return DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('사진 최대 크기가 올바르지 않습니다.');
  return Math.min(value, 25 * 1024 * 1024);
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function rawPhotoUrl(rawJson: string) {
  try {
    const raw = JSON.parse(rawJson) as Record<string, unknown>;
    return safeUrl(raw.NAAS_PIC ?? raw.naas_pic ?? raw.picture);
  } catch { return null; }
}

function selectCandidates(batchSize: number): Candidate[] {
  const db = openArchiveDb();
  try {
    const storedUrls = new Set(
      (db.prepare("SELECT original_url FROM media_assets WHERE media_type='photo' AND original_url IS NOT NULL AND original_url<>''").all() as { original_url: string }[])
        .map((row) => row.original_url),
    );
    const rows = db.prepare(`SELECT m.id AS membership_id,m.person_node_id,m.naas_cd,
      s.source_evidence_id,e.raw_path AS source_raw_path,e.content_hash AS source_content_hash,s.raw_json
      FROM assembly_memberships m
      JOIN assembly_membership_snapshots s ON s.membership_id=m.id
      LEFT JOIN evidence_sources e ON e.id=s.source_evidence_id
      WHERE m.assembly_term='22' AND m.status='staged' AND m.naas_cd IS NOT NULL AND TRIM(m.naas_cd)<>''
      ORDER BY m.naas_cd ASC,m.id ASC,s.captured_at DESC,s.id DESC`).all() as {
        membership_id: number; person_node_id: number; naas_cd: string;
        source_evidence_id: number | null; source_raw_path: string | null;
        source_content_hash: string | null; raw_json: string;
      }[];
    const seen = new Set<number>();
    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (seen.has(row.membership_id)) continue;
      seen.add(row.membership_id);
      const originalUrl = rawPhotoUrl(row.raw_json);
      if (originalUrl && !storedUrls.has(originalUrl)) {
        // Reserve the URL during selection as well: duplicate staged rows in one
        // batch must not trigger two downloads or two media nodes.
        storedUrls.add(originalUrl);
        candidates.push({
        membershipId: row.membership_id,
        personNodeId: row.person_node_id,
        naasCd: row.naas_cd,
        sourceEvidenceId: row.source_evidence_id,
        sourceRawPath: row.source_raw_path,
        sourceContentHash: row.source_content_hash,
        originalUrl,
        });
      }
      if (candidates.length >= batchSize) break;
    }
    return candidates;
  } finally { db.close(); }
}

function safeFilePart(value: string) {
  const result = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
  return result || 'unknown';
}

function responseMime(response: Response) {
  const header = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return header.startsWith('image/') ? header : null;
}

function errorCode(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'download_failed';
}

function writeAtomically(directory: string, filename: string, bytes: Uint8Array) {
  fs.mkdirSync(directory, { recursive: true });
  const finalPath = path.join(directory, filename);
  const tempPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, bytes, { flag: 'wx' });
    fs.renameSync(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* best-effort temp cleanup */ }
    throw error;
  }
}

function mediaAlreadyStored(db: ReturnType<typeof openArchiveDb>, candidate: Candidate) {
  return db.prepare(`SELECT id,path FROM media_assets WHERE media_type='photo'
    AND original_url=? ORDER BY id LIMIT 1`).get(candidate.originalUrl) as { id: number; path: string } | undefined;
}

function persistMedia(candidate: Candidate, finalPath: string, sha256: string, mimeType: string, bytes: number) {
  const db = openArchiveDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const duplicate = db.prepare(`SELECT id,path FROM media_assets WHERE media_type='photo'
      AND (original_url=? OR sha256=? OR path=?) ORDER BY id LIMIT 1`).get(candidate.originalUrl, sha256, finalPath) as { id: number; path: string } | undefined;
    if (duplicate) { db.exec('ROLLBACK'); return { duplicate: true, id: duplicate.id }; }
    const properties = {
      membershipId: candidate.membershipId,
      personNodeId: candidate.personNodeId,
      naasCd: candidate.naasCd,
      assemblyTerm: '22',
      sourceEvidenceId: candidate.sourceEvidenceId,
      sourceRawPath: candidate.sourceRawPath,
      sourceContentHash: candidate.sourceContentHash,
      originalUrl: candidate.originalUrl,
    };
    const node = db.prepare(`INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of)
      VALUES ('photo',?,?,?,CURRENT_TIMESTAMP)`).run(`assembly:photo:${sha256}`, `국회 의원 사진 ${candidate.naasCd}`, JSON.stringify(properties));
    const nodeId = Number(node.lastInsertRowid);
    const media = db.prepare(`INSERT INTO media_assets
      (node_id,media_type,path,original_url,sha256,mime_type,bytes,license,attribution,properties_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(nodeId, 'photo', finalPath, candidate.originalUrl, sha256, mimeType, bytes,
      '국회 공개정보 이용조건 확인', '대한민국 국회', JSON.stringify(properties));
    db.prepare(`INSERT OR IGNORE INTO graph_edges
      (from_node_id,to_node_id,relation,properties_json) VALUES (?,?,?,?)`).run(nodeId, candidate.personNodeId, 'PHOTO_OF', JSON.stringify({ sourceEvidenceId: candidate.sourceEvidenceId }));
    db.exec('COMMIT');
    return { duplicate: false, id: Number(media.lastInsertRowid) };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    throw error;
  } finally { db.close(); }
}

export async function syncAssemblyMemberPhotos(options: {
  batchSize?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<AssemblyMediaSyncResult> {
  const batchSize = safeBatchSize(options.batchSize);
  const maxBytes = safeMaxBytes(options.maxBytes);
  ensureAssemblyMediaSource();
  const runId = startIngestRun('assembly-media', 'sync');
  const errors: AssemblyMediaSyncResult['errors'] = [];
  let downloaded = 0;
  let deduped = 0;
  const candidates = selectCandidates(batchSize);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw');
  const runDirectory = path.join(rawRoot, 'assembly-media', String(runId));
  for (const candidate of candidates) {
    const db = openArchiveDb();
    try {
      if (mediaAlreadyStored(db, candidate)) { deduped += 1; continue; }
    } finally { db.close(); }
    let finalPath: string | null = null;
    try {
      const response = await fetchImpl(candidate.originalUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const mimeType = responseMime(response);
      if (!mimeType) throw new Error('invalid_mime');
      const declaredBytes = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error('oversize');
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maxBytes) throw new Error('oversize');
      const sha256 = crypto.createHash('sha256').update(body).digest('hex');
      const filename = `naas-${safeFilePart(candidate.naasCd)}-m-${candidate.membershipId}${IMAGE_EXTENSIONS[mimeType] ?? '.img'}`;
      finalPath = writeAtomically(runDirectory, filename, body);
      const persisted = persistMedia(candidate, finalPath, sha256, mimeType, body.byteLength);
      if (persisted.duplicate) {
        try { fs.unlinkSync(finalPath); } catch { /* best-effort duplicate cleanup */ }
        deduped += 1;
      } else downloaded += 1;
    } catch (error) {
      if (finalPath) try { fs.unlinkSync(finalPath); } catch { /* best-effort failed-item cleanup */ }
      errors.push({ membershipId: candidate.membershipId, naasCd: candidate.naasCd, code: errorCode(error) });
    }
  }
  const status = errors.length ? 'failed' : 'success';
  const errorSummary = errors.length ? `${errors.length}건의 사진 수집에 실패했습니다.` : null;
  finishIngestRun(runId, status, candidates.length, downloaded, errorSummary, { batchSize, maxBytes, downloaded, deduped, failed: errors.length, errors });
  return { runId, rowsSeen: candidates.length, rowsStaged: downloaded, downloaded, deduped, failed: errors.length, status, errors };
}
