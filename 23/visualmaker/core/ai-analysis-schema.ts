import type {openDb} from './store.ts';

type Db = ReturnType<typeof openDb>;

const UTC_MILLIS = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z';

/** The caller initializes visualmaker_jobs before opening this checkpoint schema. */
export function ensureAIAnalysisSchema(db:Db):void {
  db.exec('SAVEPOINT visualmaker_ai_analysis_schema');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS visualmaker_ai_analysis_attempts (
      job_id TEXT NOT NULL PRIMARY KEY REFERENCES visualmaker_jobs(id) ON DELETE RESTRICT,
      attempt INTEGER NOT NULL CHECK(attempt=1),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
      external_call_started_at TEXT CHECK(external_call_started_at IS NULL OR (length(external_call_started_at)=24 AND external_call_started_at GLOB '${UTC_MILLIS}')),
      response_sha256 TEXT CHECK(response_sha256 IS NULL OR (length(response_sha256)=64 AND response_sha256 NOT GLOB '*[^0-9a-f]*')),
      outcome TEXT NOT NULL CHECK(outcome IN ('not-started','started','succeeded','needs-review','cancelled-before-call','failed-before-call')),
      error_code TEXT CHECK(error_code IS NULL OR error_code IN ('configuration','scope','consent','timeout','network','provider','lease','cancelled','response','internal')),
      CHECK(
        (outcome='not-started' AND external_call_started_at IS NULL AND response_sha256 IS NULL AND error_code IS NULL)
        OR (outcome='started' AND external_call_started_at IS NOT NULL AND response_sha256 IS NULL AND error_code IS NULL)
        OR (outcome='succeeded' AND external_call_started_at IS NOT NULL AND response_sha256 IS NOT NULL AND error_code IS NULL)
        OR (outcome='needs-review' AND external_call_started_at IS NOT NULL)
        OR (outcome IN ('cancelled-before-call','failed-before-call') AND external_call_started_at IS NULL AND response_sha256 IS NULL)
      )
    );
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_insert_guard
      BEFORE INSERT ON visualmaker_ai_analysis_attempts
      BEGIN
        SELECT CASE WHEN NEW.outcome IS NOT 'not-started'
          THEN RAISE(ABORT,'AI checkpoint must begin before an external call') END;
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM visualmaker_ai_analysis_attempts WHERE job_id=NEW.job_id
        ) THEN RAISE(ABORT,'AI checkpoint cannot be replaced') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM visualmaker_jobs
          WHERE id=NEW.job_id AND kind='ai-script-analysis' AND request_sha256=NEW.request_sha256
        ) THEN RAISE(ABORT,'AI checkpoint job identity mismatch') END;
      END;
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_update_guard
      BEFORE UPDATE ON visualmaker_ai_analysis_attempts
      BEGIN
        SELECT CASE WHEN NEW.job_id IS NOT OLD.job_id OR NEW.attempt IS NOT OLD.attempt
          OR NEW.request_sha256 IS NOT OLD.request_sha256
          THEN RAISE(ABORT,'AI checkpoint identity is immutable') END;
        SELECT CASE WHEN OLD.external_call_started_at IS NOT NULL
          AND NEW.external_call_started_at IS NOT OLD.external_call_started_at
          THEN RAISE(ABORT,'AI external call checkpoint is immutable') END;
        SELECT CASE WHEN NOT (
          (OLD.outcome='not-started' AND NEW.outcome IN ('started','cancelled-before-call','failed-before-call'))
          OR (OLD.outcome='started' AND NEW.outcome IN ('succeeded','needs-review'))
        ) THEN RAISE(ABORT,'AI checkpoint transition is not allowed') END;
      END;
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_delete_guard
      BEFORE DELETE ON visualmaker_ai_analysis_attempts
      BEGIN
        SELECT RAISE(ABORT,'AI checkpoint cannot be deleted');
      END;
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_parent_insert_guard
      BEFORE INSERT ON visualmaker_jobs
      WHEN EXISTS (
        SELECT 1 FROM visualmaker_jobs AS existing
        JOIN visualmaker_ai_analysis_attempts AS checkpoint ON checkpoint.job_id=existing.id
        WHERE existing.id=NEW.id
          OR (existing.project_id=NEW.project_id AND existing.idempotency_key=NEW.idempotency_key)
      )
      BEGIN
        SELECT RAISE(ABORT,'AI checkpoint parent cannot be replaced');
      END;
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_parent_update_guard
      BEFORE UPDATE OF id,kind,request_sha256 ON visualmaker_jobs
      WHEN EXISTS (SELECT 1 FROM visualmaker_ai_analysis_attempts WHERE job_id=OLD.id)
        AND (NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.request_sha256 IS NOT OLD.request_sha256)
      BEGIN
        SELECT RAISE(ABORT,'AI checkpoint parent identity is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS visualmaker_ai_analysis_parent_delete_guard
      BEFORE DELETE ON visualmaker_jobs
      WHEN EXISTS (SELECT 1 FROM visualmaker_ai_analysis_attempts WHERE job_id=OLD.id)
      BEGIN
        SELECT RAISE(ABORT,'AI checkpoint parent cannot be deleted');
      END;`);
    db.exec('RELEASE SAVEPOINT visualmaker_ai_analysis_schema');
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT visualmaker_ai_analysis_schema');
    db.exec('RELEASE SAVEPOINT visualmaker_ai_analysis_schema');
    throw error;
  }
}
