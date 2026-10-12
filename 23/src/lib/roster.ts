import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openArchiveDb } from './db.ts';
import { finishIngestRun, startIngestRun } from './sources.ts';

export type AssemblyRosterRow = { naasCd: string; name: string; party: string; electedName: string; electedDivision: string; committee: string; belongingCommittee: string; district: string; picture: string; asOf: string; raw: Record<string, unknown> };
export type AssemblyRosterPage = { rows: AssemblyRosterRow[]; totalCount: number | null; isShortPage: boolean };
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const pick = (row: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) { const value = text(row[key]); if (value) return value; } return ''; };
function is22ndTermCandidate(row: Record<string, unknown>) { return /22\s*대|제\s*22/.test(pick(row, 'GTELT_ERACO')); }
function mapRow(row: Record<string, unknown>, asOf: string): AssemblyRosterRow | null {
  const naasCd = pick(row, 'NAAS_CD'); const name = pick(row, 'NAAS_NM'); if (!naasCd || !name) return null;
  return { naasCd, name, party: pick(row, 'PLPT_NM'), electedName: pick(row, 'ELECD_NM'), electedDivision: pick(row, 'ELECD_DIV_NM'), committee: pick(row, 'CMIT_NM'), belongingCommittee: pick(row, 'BLNG_CMIT_NM'), district: pick(row, 'ELECD_NM'), picture: pick(row, 'NAAS_PIC'), asOf, raw: { ...row } };
}

/** Parse only confirmed ALLNAMEMBER fields; success envelope remains fixture-gated. */
export function parseAssemblyRosterPage(payload: unknown, pageSize = 1000, asOf = new Date().toISOString()): AssemblyRosterPage {
  if (!payload || typeof payload !== 'object') throw new Error('국회 의원정보 응답 형식이 올바르지 않습니다.');
  const root = payload as Record<string, unknown>; const result = root.RESULT as Record<string, unknown> | undefined;
  if (result && text(result.CODE) && text(result.CODE) !== 'INFO-000') throw new Error(`국회 API 오류: ${text(result.MESSAGE) || text(result.CODE)}`);
  const sections = Array.isArray(root.ALLNAMEMBER) ? root.ALLNAMEMBER : [];
  const head = sections.length > 0 && sections[0] && typeof sections[0] === 'object' ? (sections[0] as Record<string, unknown>).head : undefined;
  const headRow = Array.isArray(head) && head[0] && typeof head[0] === 'object' ? head[0] as Record<string, unknown> : {};
  const countValue = pick(headRow, 'list_total_count'); const totalCount = countValue && Number.isFinite(Number(countValue)) ? Number(countValue) : null;
  const rawRows = sections.length > 1 && sections[1] && typeof sections[1] === 'object' ? (sections[1] as Record<string, unknown>).row : undefined;
  if (!Array.isArray(rawRows)) throw new Error('ALLNAMEMBER 성공 envelope 미확인: keyed fixture로 확인이 필요합니다.');
  const mapped = rawRows.flatMap((value) => value && typeof value === 'object' ? [mapRow(value as Record<string, unknown>, asOf)].filter((item): item is AssemblyRosterRow => Boolean(item)) : []);
  return { rows: [...new Map(mapped.map((row) => [row.naasCd, row])).values()], totalCount, isShortPage: rawRows.length < Math.max(1, Math.min(1000, pageSize)) };
}
export function parseAssemblyRoster(payload: unknown): AssemblyRosterRow[] { return parseAssemblyRosterPage(payload).rows; }
export function mapAssemblyRosterFixture(payload: unknown) { return parseAssemblyRoster(payload); }
export const mapRosterRows = mapAssemblyRosterFixture;
export type RosterSyncResult = { runId: number; rowsSeen: number; rowsStaged: number; pages: number; status: string; error?: string };

function persistRawPage(db: DatabaseSync, payload: unknown, pageIndex: number, runId: number, asOf: string) {
  const rawRoot = process.env.ARCHIVE_RAW_ROOT || path.join(process.cwd(), 'data', 'raw', 'assembly'); fs.mkdirSync(rawRoot, { recursive: true });
  const serialized = JSON.stringify(payload); const hash = crypto.createHash('sha256').update(serialized).digest('hex'); const rawPath = path.join(rawRoot, `run-${runId}-page-${String(pageIndex).padStart(4, '0')}.json`); fs.writeFileSync(rawPath, serialized, 'utf8');
  const source = db.prepare('SELECT id FROM source_registry WHERE slug=?').get('assembly-members') as { id: number };
  const node = db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run('evidence', `assembly:run:${runId}:page:${pageIndex}`, `국회 의원정보 원문 ${pageIndex}쪽`, JSON.stringify({ pageIndex, runId, sha256: hash }), asOf);
  const evidence = db.prepare('INSERT INTO evidence_sources (node_id,external_key,title,publisher,source_type,retrieved_at,content_hash,license,trust_tier,source_id,raw_path,page_index,properties_json) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?)').run(Number(node.lastInsertRowid), `assembly:run:${runId}:page:${pageIndex}`, `국회 의원정보 원문 ${pageIndex}쪽`, '대한민국 국회', 'api', hash, '공공데이터 이용조건 확인', 1, source.id, rawPath, pageIndex, JSON.stringify({ runId, pageIndex, sha256: hash }));
  return Number(evidence.lastInsertRowid);
}

function stageRosterRowsInDb(db: DatabaseSync, rows: AssemblyRosterRow[], asOf: string, sourceEvidenceId: number | null) {
  let staged = 0;
  for (const row of [...new Map(rows.filter((item) => is22ndTermCandidate(item.raw)).map((item) => [item.naasCd, item])).values()]) {
    const key = `NAAS_CD:${row.naasCd}`; const existing = db.prepare("SELECT id FROM graph_nodes WHERE kind='person' AND external_key=?").get(key) as { id: number } | undefined;
    const personId = existing?.id ?? Number(db.prepare('INSERT INTO graph_nodes (kind,external_key,label,properties_json,as_of) VALUES (?,?,?,?,?)').run('person', key, row.name, JSON.stringify(row.raw), asOf).lastInsertRowid);
    db.prepare('UPDATE graph_nodes SET label=?,properties_json=?,as_of=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.name, JSON.stringify(row.raw), asOf, personId);
    const politician = db.prepare('SELECT id FROM politicians WHERE naas_cd=? ORDER BY id LIMIT 1').get(row.naasCd) as { id: number } | undefined;
    if (politician) db.prepare('INSERT OR IGNORE INTO politician_person_links (politician_id,person_node_id) VALUES (?,?)').run(politician.id, personId);
    const term = '22';
    db.prepare("INSERT INTO assembly_memberships (person_node_id,assembly_term,district,party,committee,naas_cd,as_of,status,source_evidence_id) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(person_node_id,assembly_term) DO UPDATE SET district=excluded.district,party=excluded.party,committee=excluded.committee,naas_cd=excluded.naas_cd,as_of=excluded.as_of,source_evidence_id=excluded.source_evidence_id,status=CASE WHEN assembly_memberships.status='verified_current' THEN assembly_memberships.status ELSE 'staged' END").run(personId, term, row.district, row.party, `${row.committee}${row.belongingCommittee ? ` · ${row.belongingCommittee}` : ''}`, row.naasCd, asOf, 'staged', sourceEvidenceId);
    const membership = db.prepare('SELECT id FROM assembly_memberships WHERE person_node_id=? AND assembly_term=?').get(personId, term) as { id: number };
    db.prepare('INSERT INTO assembly_membership_snapshots (membership_id,assembly_term,party,district,committee,naas_cd,captured_at,source_evidence_id,raw_json) VALUES (?,?,?,?,?,?,?,?,?)').run(membership.id, term, row.party, row.district, row.committee, row.naasCd, asOf, sourceEvidenceId, JSON.stringify(row.raw));
    db.prepare("INSERT OR IGNORE INTO review_queue (entity_type,entity_id,state,note) VALUES ('assembly_membership',?,'pending','22대 후보. 현직 여부를 선관위·국회 기준으로 사람 검토')").run(membership.id); staged += 1;
  }
  return staged;
}
export function stageRosterRows(rows: AssemblyRosterRow[], asOf = new Date().toISOString()): number {
  const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE');
  try { const count = stageRosterRowsInDb(db, rows, asOf, null); db.exec('COMMIT'); return count; } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
}

export async function syncAssemblyRoster(options: { pIndex?: number; pSize?: number; maxPages?: number } = {}): Promise<RosterSyncResult> {
  const runId = startIngestRun('assembly-members', 'sync'); const key = process.env.ASSEMBLY_API_KEY;
  if (!key) { const error = 'ASSEMBLY_API_KEY가 없어 동기화를 중단했습니다.'; finishIngestRun(runId, 'blocked', 0, 0, error); return { runId, rowsSeen: 0, rowsStaged: 0, pages: 0, status: 'blocked', error }; }
  const pSize = Math.max(1, Math.min(1000, options.pSize ?? 1000)); const maxPages = Math.max(1, Math.min(500, options.maxPages ?? 100)); let rowsSeen = 0; let rowsStaged = 0; let pageIndex = Math.max(1, options.pIndex ?? 1); let pages = 0; let complete = false;
  try {
    while (pages < maxPages) {
      const asOf = new Date().toISOString(); const url = new URL('https://open.assembly.go.kr/portal/openapi/ALLNAMEMBER'); url.searchParams.set('KEY', key); url.searchParams.set('Type', 'json'); url.searchParams.set('pIndex', String(pageIndex)); url.searchParams.set('pSize', String(pSize));
      const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`국회 API HTTP ${response.status}`); const payload = await response.json(); const page = parseAssemblyRosterPage(payload, pSize, asOf);
      const db = openArchiveDb(); db.exec('BEGIN IMMEDIATE'); try { const evidenceId = persistRawPage(db, payload, pageIndex, runId, asOf); rowsSeen += page.rows.length; rowsStaged += stageRosterRowsInDb(db, page.rows, asOf, evidenceId); db.exec('COMMIT'); } catch (error) { try { db.exec('ROLLBACK'); } catch { /* noop */ } throw error; } finally { db.close(); }
      pages += 1; if (page.isShortPage || (page.totalCount !== null && pageIndex * pSize >= page.totalCount)) { complete = true; break; } pageIndex += 1;
    }
    if (!complete) throw new Error(`페이지 안전 상한(${maxPages})에 도달해 동기화를 중단했습니다.`);
    finishIngestRun(runId, 'success', rowsSeen, rowsStaged); return { runId, rowsSeen, rowsStaged, pages, status: 'success' };
  } catch (error) { const message = error instanceof Error ? error.message : '국회 API 처리 실패'; finishIngestRun(runId, 'failed', rowsSeen, rowsStaged, message); return { runId, rowsSeen, rowsStaged, pages, status: 'failed', error: message }; }
}
export function dryRunAssemblyRoster(payload: unknown): { rowsSeen: number; rows: AssemblyRosterRow[]; fingerprint: string } { const rows = parseAssemblyRoster(payload); return { rowsSeen: rows.length, rows, fingerprint: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') }; }
