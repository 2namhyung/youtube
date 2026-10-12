import { openArchiveDb } from './db.ts';

export type SourceRegistryItem = { id: number; slug: string; name: string; base_url: string; trust_tier: number; license_notes: string; enabled: number; adapter: string | null; discovery_only: number; last_run_id: number | null };
export type IngestRun = { id: number; source_id: number; mode: string; status: string; started_at: string; finished_at: string | null; rows_seen: number; rows_staged: number; error: string | null };

export function ensureAssemblyMediaSource() {
  const db = openArchiveDb();
  try {
    db.prepare(`INSERT INTO source_registry
      (slug,name,base_url,trust_tier,license_notes,enabled,adapter,discovery_only)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,
      trust_tier=excluded.trust_tier,license_notes=excluded.license_notes,
      adapter=excluded.adapter,discovery_only=excluded.discovery_only`).run(
      'assembly-media', '국회 의원 사진자료', 'https://open.assembly.go.kr/portal/openapi/ALLNAMEMBER', 1,
      '국회 공개정보 이용조건과 사진별 재이용 조건 확인; 원본 URL·수집일 보존', 1, 'assembly-member-photos', 0,
    );
  } finally { db.close(); }
}

export function getSourceRegistry(): (SourceRegistryItem & { last_run: IngestRun | null })[] {
  ensureAssemblyMediaSource();
  const db = openArchiveDb();
  try {
    const sources = db.prepare('SELECT id,slug,name,base_url,trust_tier,license_notes,enabled,adapter,discovery_only,last_run_id FROM source_registry ORDER BY trust_tier, id').all() as SourceRegistryItem[];
    return sources.map((source) => ({ ...source, last_run: source.last_run_id ? db.prepare('SELECT id,source_id,mode,status,started_at,finished_at,rows_seen,rows_staged,error FROM ingest_runs WHERE id=?').get(source.last_run_id) as IngestRun | null : null }));
  } finally { db.close(); }
}

export function startIngestRun(slug: string, mode: 'dry_run' | 'sync', status: 'running' | 'blocked' = 'running', error: string | null = null) {
  const db = openArchiveDb();
  try {
    const source = db.prepare('SELECT id FROM source_registry WHERE slug=?').get(slug) as { id: number } | undefined;
    if (!source) throw new Error('등록되지 않은 수집원입니다.');
    const run = db.prepare('INSERT INTO ingest_runs (source_id,mode,status,error,finished_at) VALUES (?,?,?,?,CASE WHEN ? <> \'running\' THEN CURRENT_TIMESTAMP ELSE NULL END)').run(source.id, mode, status, error, status);
    const runId = Number(run.lastInsertRowid);
    db.prepare('UPDATE source_registry SET last_run_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(runId, source.id);
    return runId;
  } finally { db.close(); }
}

export function finishIngestRun(runId: number, status: 'success' | 'failed' | 'blocked' | 'partial', rowsSeen = 0, rowsStaged = 0, error: string | null = null, metadata: Record<string, unknown> = {}) {
  const db = openArchiveDb();
  try { db.prepare('UPDATE ingest_runs SET status=?,finished_at=CURRENT_TIMESTAMP,rows_seen=?,rows_staged=?,error=?,metadata_json=? WHERE id=?').run(status, rowsSeen, rowsStaged, error, JSON.stringify(metadata), runId); }
  finally { db.close(); }
}
