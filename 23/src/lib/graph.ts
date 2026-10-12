import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { openArchiveDb } from './db.ts';

export type GraphNode = { id: number; kind: string; external_key: string | null; label: string; properties_json: string; valid_from: string | null; valid_to: string | null; as_of: string | null };
export type GraphEdge = { id: number; from_node_id: number; to_node_id: number; relation: string; properties_json: string; valid_from: string | null; valid_to: string | null; as_of: string | null };
export type Claim = { id: number; node_id: number; subject_node_id: number | null; statement: string; category: string; occurred_at: string | null; confidence: number; review_state: string };
export type Evidence = { id: number; node_id: number; external_key: string | null; canonical_url: string | null; title: string; publisher: string; source_type: string; published_at: string | null; license: string; trust_tier: number };
export type ClaimPath = Claim & { subject_label: string | null; evidence: (Evidence & { locator: string; support_type: string; note: string })[] };
export const VERIFICATION_TTL_HOURS = 72;

type Value = string | number | null;
const rows = <T>(db: DatabaseSync, sql: string, ...params: Value[]) => (db.prepare(sql).all(...params) as Record<string, unknown>[]).map((row) => ({ ...row })) as T[];

function node(db: DatabaseSync, kind: string, externalKey: string | null, label: string, properties: Record<string, unknown> = {}, temporal: { validFrom?: string | null; validTo?: string | null; asOf?: string | null } = {}) {
  const found = externalKey ? db.prepare('SELECT id FROM graph_nodes WHERE kind = ? AND external_key = ?').get(kind, externalKey) as { id: number } | undefined : undefined;
  if (found) return found.id;
  const result = db.prepare('INSERT INTO graph_nodes (kind, external_key, label, properties_json, valid_from, valid_to, as_of) VALUES (?, ?, ?, ?, ?, ?, ?)').run(kind, externalKey, label, JSON.stringify(properties), temporal.validFrom ?? null, temporal.validTo ?? null, temporal.asOf ?? null);
  return Number(result.lastInsertRowid);
}

export function getGraphOverview() {
  const db = openArchiveDb();
  try {
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return { nodes: count('graph_nodes'), edges: count('graph_edges'), claims: count('claims'), evidence: count('evidence_sources'), pendingReview: Number((db.prepare("SELECT COUNT(*) AS count FROM review_queue WHERE state = 'pending'").get() as { count: number }).count) };
  } finally { db.close(); }
}

export function getClaimPaths(limit = 50, options: { includeInternal?: boolean } = {}): ClaimPath[] {
  const db = openArchiveDb();
  try {
    const currentClause = options.includeInternal ? '' : "JOIN assembly_memberships m ON m.person_node_id=c.subject_node_id AND m.status='verified_current' AND m.verification_expires_at > CURRENT_TIMESTAMP WHERE c.review_state='approved'";
    const claims = rows<Claim & { subject_label: string | null }>(db, `SELECT c.id,c.node_id,c.subject_node_id,c.statement,c.category,c.occurred_at,c.confidence,c.review_state,s.label AS subject_label FROM claims c JOIN graph_nodes s ON s.id=c.subject_node_id ${currentClause ? currentClause : ''} ORDER BY c.id DESC LIMIT ?`, Math.max(1, Math.min(200, limit)));
    return claims.map((claim) => ({ ...claim, evidence: rows<Evidence & { locator: string; support_type: string; note: string }>(db, `SELECT e.id,e.node_id,e.external_key,e.canonical_url,e.title,e.publisher,e.source_type,e.published_at,e.license,e.trust_tier,ce.locator,ce.support_type,ce.note FROM claim_evidence ce JOIN evidence_sources e ON e.id=ce.evidence_id WHERE ce.claim_id=? ORDER BY e.id`, claim.id) }));
  } finally { db.close(); }
}

export type ClaimInput = { statement: string; category?: string; subjectLabel?: string; subjectExternalKey?: string; occurredAt?: string; confidence?: number; evidence: { externalKey?: string; canonicalUrl?: string; title: string; publisher?: string; sourceType?: string; publishedAt?: string; contentHash?: string; license?: string; trustTier?: number; sourceId?: number; rawPath?: string; locator?: string; supportType?: 'supports' | 'contradicts' | 'context'; note?: string }[] };

export function createClaimWithEvidence(input: ClaimInput) {
    if (!input.statement.trim()) throw new Error('주장 내용을 입력해 주세요.');
    const validEvidence = input.evidence.filter((item) => item && item.title.trim() && (item.externalKey || item.canonicalUrl || item.contentHash));
    if (!validEvidence.length) throw new Error('주장에는 식별 가능한 출처가 하나 이상 필요합니다.');
  const db = openArchiveDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!input.subjectLabel || !input.subjectExternalKey) throw new Error('주장에는 검증할 Person의 NAAS_CD가 필요합니다.');
    const existingSubject = db.prepare("SELECT id FROM graph_nodes WHERE kind='person' AND external_key=?").get(input.subjectExternalKey) as { id: number } | undefined;
    if (!existingSubject) throw new Error('검증되지 않은 Person입니다. 현직 검토를 먼저 완료해 주세요.');
    const subject = existingSubject?.id ?? node(db, 'person', input.subjectExternalKey, input.subjectLabel);
    const current = db.prepare("SELECT id FROM assembly_memberships WHERE person_node_id=? AND status='verified_current' AND verification_expires_at > CURRENT_TIMESTAMP").get(subject);
    if (!current) throw new Error('현직 검증이 만료되었거나 승인되지 않은 Person입니다.');
    const claimNode = node(db, 'claim', null, input.statement, { category: input.category ?? '기타' }, { asOf: new Date().toISOString() });
    const claimId = Number(db.prepare(`INSERT INTO claims (node_id, subject_node_id, statement, category, occurred_at, as_of, confidence, review_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(claimNode, subject, input.statement.trim(), input.category ?? '기타', input.occurredAt ?? null, new Date().toISOString(), Math.max(0, Math.min(100, Math.round(input.confidence ?? 0))), 'pending').lastInsertRowid);
    if (subject) db.prepare('INSERT OR IGNORE INTO graph_edges (from_node_id,to_node_id,relation) VALUES (?,?,?)').run(subject, claimNode, 'SUBJECT_OF');
    for (const item of validEvidence) {
      const key = item.externalKey ?? item.canonicalUrl ?? item.contentHash ?? null;
      let evidenceId: number | undefined;
      if (key) {
        const found = db.prepare('SELECT id FROM evidence_sources WHERE external_key = ? OR canonical_url = ? OR content_hash = ? LIMIT 1').get(key, item.canonicalUrl ?? '', item.contentHash ?? '') as { id: number } | undefined;
        evidenceId = found?.id;
      }
      if (!evidenceId) {
        const evidenceNode = node(db, 'evidence', key, item.title, { sourceType: item.sourceType ?? 'document' });
        evidenceId = Number(db.prepare(`INSERT INTO evidence_sources (node_id,external_key,canonical_url,title,publisher,source_type,published_at,content_hash,license,trust_tier,source_id,raw_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(evidenceNode, item.externalKey ?? null, item.canonicalUrl ?? null, item.title.trim(), item.publisher ?? '', item.sourceType ?? 'document', item.publishedAt ?? null, item.contentHash ?? null, item.license ?? '확인 필요', Math.max(1, Math.min(5, Math.round(item.trustTier ?? 3))), item.sourceId ?? null, item.rawPath ?? null).lastInsertRowid);
      }
      db.prepare('INSERT OR IGNORE INTO claim_evidence (claim_id,evidence_id,locator,support_type,note) VALUES (?,?,?,?,?)').run(claimId, evidenceId, item.locator ?? '', item.supportType ?? 'supports', item.note ?? '');
      const evidenceNode = (db.prepare('SELECT node_id FROM evidence_sources WHERE id=?').get(evidenceId) as { node_id: number }).node_id;
      const relation = item.supportType === 'contradicts' ? 'CONTRADICTS' : item.supportType === 'context' ? 'CONTEXT' : 'SUPPORTS';
      db.prepare('INSERT OR IGNORE INTO graph_edges (from_node_id,to_node_id,relation) VALUES (?,?,?)').run(claimNode, evidenceNode, relation);
    }
    db.prepare("INSERT OR IGNORE INTO review_queue (entity_type,entity_id,state) VALUES ('claim',?,'pending')").run(claimId);
    db.exec('COMMIT');
    return getClaimPaths(1, { includeInternal: true }).find((item) => item.id === claimId) ?? null;
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; }
  finally { db.close(); }
}

/**
 * Create a source-backed draft claim for a staged Person.  This is deliberately
 * separate from createClaimWithEvidence: publication still requires a reviewed
 * current membership, while a pilot may collect historical evidence first.
 */
export function createDraftClaimWithEvidence(input: ClaimInput) {
  if (!input.statement.trim()) throw new Error('주장 내용을 입력해 주세요.');
  if (!input.subjectExternalKey || !input.subjectLabel) throw new Error('초안 주장에는 Person의 NAAS_CD가 필요합니다.');
  const validEvidence = input.evidence.filter((item) => item && item.title.trim() && (item.externalKey || item.canonicalUrl || item.contentHash));
  if (!validEvidence.length) throw new Error('주장에는 식별 가능한 출처가 하나 이상 필요합니다.');
  const db = openArchiveDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const subject = db.prepare("SELECT id FROM graph_nodes WHERE kind='person' AND (external_key=? OR external_key=?)").get(`NAAS_CD:${input.subjectExternalKey}`, input.subjectExternalKey) as { id: number } | undefined;
    if (!subject) throw new Error('초안 주장 대상 Person을 찾을 수 없습니다.');
    const statementKey = `draft:${input.subjectExternalKey}:${crypto.createHash('sha256').update(input.statement.trim()).digest('hex')}`;
    const claimNode = node(db, 'claim', statementKey, input.statement.trim(), { category: input.category ?? '기타', draft: true }, { asOf: new Date().toISOString() });
    const existing = db.prepare('SELECT id FROM claims WHERE node_id=?').get(claimNode) as { id: number } | undefined;
    const claimId = existing?.id ?? Number(db.prepare(`INSERT INTO claims (node_id, subject_node_id, statement, category, occurred_at, as_of, confidence, review_state) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(claimNode, subject.id, input.statement.trim(), input.category ?? '기타', input.occurredAt ?? null, new Date().toISOString(), Math.max(0, Math.min(100, Math.round(input.confidence ?? 0)))).lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO graph_edges (from_node_id,to_node_id,relation) VALUES (?,?,?)').run(subject.id, claimNode, 'SUBJECT_OF');
    for (const item of validEvidence) {
      const found = db.prepare('SELECT id,node_id FROM evidence_sources WHERE external_key=? OR canonical_url=? OR content_hash=? LIMIT 1').get(item.externalKey ?? '', item.canonicalUrl ?? '', item.contentHash ?? '') as { id: number; node_id: number } | undefined;
      if (!found) throw new Error(`수집된 원문 출처를 찾을 수 없습니다: ${item.title}`);
      db.prepare('INSERT OR IGNORE INTO claim_evidence (claim_id,evidence_id,locator,support_type,note) VALUES (?,?,?,?,?)').run(claimId, found.id, item.locator ?? '', item.supportType ?? 'supports', item.note ?? '');
      const relation = item.supportType === 'contradicts' ? 'CONTRADICTS' : item.supportType === 'context' ? 'CONTEXT' : 'SUPPORTS';
      db.prepare('INSERT OR IGNORE INTO graph_edges (from_node_id,to_node_id,relation) VALUES (?,?,?)').run(claimNode, found.node_id, relation);
    }
    db.prepare("INSERT OR IGNORE INTO review_queue (entity_type,entity_id,state,note) VALUES ('claim',?,'pending','파일럿 초안. 공식 원문 대조 후 검토')").run(claimId);
    db.exec('COMMIT');
    return claimId;
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; }
  finally { db.close(); }
}

export function getReviewQueue(state?: string) {
  const db = openArchiveDb();
  try {
    const base = "SELECT q.id,q.entity_type,q.entity_id,CASE WHEN q.entity_type='assembly_membership' AND m.verification_expires_at IS NOT NULL AND m.verification_expires_at <= CURRENT_TIMESTAMP THEN 'needs_reverification' ELSE q.state END AS state,q.note,q.reviewed_at,q.created_at,p.label AS person_name,m.naas_cd,m.party,m.district,m.assembly_term,COALESCE(me.title,ce.title) AS evidence_title,COALESCE(me.content_hash,ce.content_hash) AS evidence_hash,COALESCE(me.retrieved_at,ce.retrieved_at) AS evidence_retrieved_at,COALESCE(me.canonical_url,ce.canonical_url) AS evidence_url,COALESCE(me.raw_path,ce.raw_path) AS evidence_raw_path,COALESCE(ms.name,cs.name) AS evidence_source_name,mg.label AS media_title,ma.media_type,ma.path AS media_path,ma.original_url AS media_url,ma.sha256 AS media_hash,ma.license AS media_license,ma.attribution AS media_attribution FROM review_queue q LEFT JOIN assembly_memberships m ON q.entity_type='assembly_membership' AND m.id=q.entity_id LEFT JOIN graph_nodes p ON p.id=m.person_node_id LEFT JOIN evidence_sources me ON me.id=m.source_evidence_id LEFT JOIN source_registry ms ON ms.id=me.source_id LEFT JOIN (SELECT ce.claim_id,MIN(ce.evidence_id) AS evidence_id FROM claim_evidence ce GROUP BY ce.claim_id) first_ce ON q.entity_type='claim' AND first_ce.claim_id=q.entity_id LEFT JOIN evidence_sources ce ON ce.id=first_ce.evidence_id LEFT JOIN source_registry cs ON cs.id=ce.source_id LEFT JOIN media_assets ma ON q.entity_type='media_asset' AND ma.id=q.entity_id LEFT JOIN graph_nodes mg ON mg.id=ma.node_id";
    const sql = state === 'pending'
      ? `${base} WHERE q.state=? OR (q.entity_type='assembly_membership' AND m.verification_expires_at IS NOT NULL AND m.verification_expires_at <= CURRENT_TIMESTAMP) ORDER BY q.id DESC`
      : `${base}${state ? ' WHERE q.state=?' : ''} ORDER BY q.id DESC`;
    return rows<{ id: number; entity_type: string; entity_id: number; state: string; note: string; reviewed_at: string | null; created_at: string; person_name: string | null; naas_cd: string | null; party: string | null; district: string | null; assembly_term: string | null; evidence_title: string | null; evidence_hash: string | null; evidence_retrieved_at: string | null; evidence_url: string | null; evidence_raw_path: string | null; evidence_source_name: string | null; media_title: string | null; media_type: string | null; media_path: string | null; media_url: string | null; media_hash: string | null; media_license: string | null; media_attribution: string | null }>(db, sql, ...(state === 'pending' || state ? [state] : []));
  }
  finally { db.close(); }
}

export function transitionReview(id: number, state: 'approved' | 'hold' | 'rejected', note = '') {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('검토 항목 ID가 올바르지 않습니다.');
  const db = openArchiveDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE review_queue SET state=?, note=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(state, note.trim(), id);
    if (Number(result.changes) !== 1) throw new Error('검토 항목을 찾을 수 없습니다.');
    const item = db.prepare('SELECT entity_type,entity_id FROM review_queue WHERE id=?').get(id) as { entity_type: string; entity_id: number };
    if (item.entity_type === 'claim') {
      if (state === 'approved' && !note.trim()) throw new Error('주장 승인에는 검토자 메모가 필요합니다.');
      if (state === 'approved') {
        const evidence = db.prepare("SELECT 1 FROM claim_evidence ce JOIN evidence_sources e ON e.id=ce.evidence_id JOIN source_registry sr ON sr.id=e.source_id WHERE ce.claim_id=? AND sr.discovery_only=0 AND e.content_hash IS NOT NULL AND e.content_hash<>'' AND e.retrieved_at IS NOT NULL AND ((e.canonical_url IS NOT NULL AND e.canonical_url<>'') OR (e.raw_path IS NOT NULL AND e.raw_path<>'')) LIMIT 1").get(item.entity_id);
        if (!evidence) throw new Error('주장 승인에는 원문 해시·수집일·등록 수집원이 있는 출처가 필요합니다.');
      }
      db.prepare('UPDATE claims SET review_state=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(state, item.entity_id);
    }
    if (item.entity_type === 'assembly_membership') {
      if (state === 'approved' && !note.trim()) throw new Error('현직 승인에는 검토자 메모가 필요합니다.');
      if (state === 'approved') {
        const provenance = db.prepare("SELECT 1 FROM assembly_memberships m JOIN evidence_sources e ON e.id=m.source_evidence_id JOIN source_registry sr ON sr.id=e.source_id WHERE m.id=? AND sr.discovery_only=0 AND e.content_hash IS NOT NULL AND e.content_hash<>'' AND e.retrieved_at IS NOT NULL AND ((e.raw_path IS NOT NULL AND e.raw_path<>'') OR (e.canonical_url IS NOT NULL AND e.canonical_url<>'')) LIMIT 1").get(item.entity_id);
        if (!provenance) throw new Error('현직 승인에는 국회 원문 provenance(수집원·해시·수집일)가 필요합니다.');
        db.prepare("UPDATE assembly_memberships SET status='verified_current',verified_at=CURRENT_TIMESTAMP,verification_expires_at=datetime('now', ?) WHERE id=?").run(`+${VERIFICATION_TTL_HOURS} hours`, item.entity_id);
      }
      else if (state === 'rejected') db.prepare("UPDATE assembly_memberships SET status='rejected',verified_at=NULL,verification_expires_at=NULL WHERE id=?").run(item.entity_id);
      else db.prepare("UPDATE assembly_memberships SET status='staged',verified_at=NULL,verification_expires_at=NULL WHERE id=?").run(item.entity_id);
    }
    if (item.entity_type === 'media_asset' && state === 'approved') {
      if (!note.trim()) throw new Error('미디어 승인에는 권리·출처·사용 범위 검토 메모가 필요합니다.');
      const media = db.prepare('SELECT path,original_url,sha256,bytes,license,attribution FROM media_assets WHERE id=?').get(item.entity_id) as {path: string; original_url: string; sha256: string | null; bytes: number | null; license: string; attribution: string} | undefined;
      if (!media || !media.original_url.trim() || !media.license.trim() || !media.attribution.trim() || !/^[a-f0-9]{64}$/u.test(media.sha256 ?? '')) throw new Error('미디어 승인에는 URL·라이선스·크레딧·SHA-256이 필요합니다.');
      let body: Buffer;
      try { body = fs.readFileSync(media.path); } catch { throw new Error('미디어 원본 파일을 읽을 수 없습니다.'); }
      if (body.byteLength !== media.bytes || crypto.createHash('sha256').update(body).digest('hex') !== media.sha256) throw new Error('미디어 원본의 크기 또는 SHA-256이 DB와 다릅니다.');
    }
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; }
  finally { db.close(); }
}
