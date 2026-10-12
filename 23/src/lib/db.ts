import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { calculateTopicScore, type PolicyStage, type TopicScore } from './policy.ts';

export type Politician = {
  id: number;
  name: string;
  role: string;
  color: string;
};

export type Source = {
  id: number;
  record_id: number;
  title: string;
  url: string;
  publisher: string;
  published_at: string;
  license: string;
  verification_status: string;
  note: string;
};

export type RecordCard = {
  id: number;
  politician_id: number;
  title: string;
  body: string;
  type: string;
  event_date: string;
  position_x: number;
  position_y: number;
  color: string;
  updated_at: string;
  sources: Source[];
};

export type Bookmark = {
  id: number;
  record_id: number;
  timestamp_seconds: number;
  label: string;
};

const dbFile = path.join(process.cwd(), 'data', 'archive.sqlite');

export const GRAPH_SCHEMA_VERSION = 10;

/** Open the archive and apply idempotent legacy + graph migrations. */
export function openArchiveDb(file = process.env.ARCHIVE_DB_PATH || dbFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    ensureLegacySchema(db);
    migrateGraphSchema(db);
    seedSourceRegistry(db);
    seedDemo(db);
    seedPolicyRadarDemo(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function ensureLegacySchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS politicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#e7d7bc',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      politician_id INTEGER NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '메모',
      event_date TEXT NOT NULL DEFAULT '',
      position_x REAL NOT NULL DEFAULT 80,
      position_y REAL NOT NULL DEFAULT 80,
      color TEXT NOT NULL DEFAULT '#fffaf2',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      license TEXT NOT NULL DEFAULT '확인 필요',
      verification_status TEXT NOT NULL DEFAULT '미확인',
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      timestamp_seconds INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT ''
    );
  `);
}

function migrateGraphSchema(db: DatabaseSync) {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  const needsGraphRebuild = current < 8;
  if (needsGraphRebuild) db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('person','party','committee','constituency','claim','evidence','event','topic','document','news','photo','video','media','bill','vote','meeting','election','membership','cultural_resource','speech','other')),
        external_key TEXT,
        label TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        valid_from TEXT, valid_to TEXT, as_of TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(kind, external_key)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind ON graph_nodes(kind);
      CREATE INDEX IF NOT EXISTS idx_graph_nodes_external_key ON graph_nodes(external_key);
      CREATE TABLE IF NOT EXISTS graph_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        to_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        valid_from TEXT, valid_to TEXT, as_of TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_node_id, to_node_id, relation)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_node_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_node_id);
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL UNIQUE REFERENCES graph_nodes(id) ON DELETE CASCADE,
        subject_node_id INTEGER REFERENCES graph_nodes(id) ON DELETE SET NULL,
        statement TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '기타',
        occurred_at TEXT, valid_from TEXT, valid_to TEXT, as_of TEXT,
        confidence INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
        review_state TEXT NOT NULL DEFAULT 'draft' CHECK (review_state IN ('draft','pending','approved','hold','rejected')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_claims_review_state ON claims(review_state);
      CREATE TABLE IF NOT EXISTS evidence_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL UNIQUE REFERENCES graph_nodes(id) ON DELETE CASCADE,
        external_key TEXT UNIQUE,
        canonical_url TEXT,
        title TEXT NOT NULL,
        publisher TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'document',
        published_at TEXT, retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        content_hash TEXT, license TEXT NOT NULL DEFAULT '확인 필요',
        trust_tier INTEGER NOT NULL DEFAULT 3 CHECK (trust_tier BETWEEN 1 AND 5),
        properties_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_canonical_url ON evidence_sources(canonical_url) WHERE canonical_url IS NOT NULL AND canonical_url <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_sources(content_hash) WHERE content_hash IS NOT NULL AND content_hash <> '';
      CREATE TABLE IF NOT EXISTS claim_evidence (
        claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        evidence_id INTEGER NOT NULL REFERENCES evidence_sources(id) ON DELETE CASCADE,
        locator TEXT NOT NULL DEFAULT '',
        support_type TEXT NOT NULL DEFAULT 'supports' CHECK (support_type IN ('supports','contradicts','context')),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (claim_id, evidence_id)
      );
      CREATE TABLE IF NOT EXISTS media_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id INTEGER NOT NULL UNIQUE REFERENCES graph_nodes(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK (media_type IN ('photo','video','audio','document')),
        path TEXT NOT NULL, original_url TEXT NOT NULL DEFAULT '',
        sha256 TEXT, mime_type TEXT NOT NULL DEFAULT '', bytes INTEGER,
        duration_seconds REAL, license TEXT NOT NULL DEFAULT '확인 필요',
        attribution TEXT NOT NULL DEFAULT '', properties_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(media_type, path)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_media_sha256 ON media_assets(sha256) WHERE sha256 IS NOT NULL AND sha256 <> '';
      CREATE TABLE IF NOT EXISTS source_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, base_url TEXT NOT NULL,
        trust_tier INTEGER NOT NULL DEFAULT 3 CHECK (trust_tier BETWEEN 1 AND 5),
        license_notes TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
        adapter TEXT, discovery_only INTEGER NOT NULL DEFAULT 0,
        last_run_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ingest_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES source_registry(id),
        mode TEXT NOT NULL CHECK (mode IN ('dry_run','sync')), status TEXT NOT NULL CHECK (status IN ('running','success','failed','blocked','partial')),
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, rows_seen INTEGER NOT NULL DEFAULT 0,
        rows_staged INTEGER NOT NULL DEFAULT 0, error TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS review_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','hold','rejected')),
        note TEXT NOT NULL DEFAULT '', reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity_type, entity_id)
      );
      CREATE INDEX IF NOT EXISTS idx_review_queue_state ON review_queue(state);
      INSERT OR IGNORE INTO review_queue (entity_type,entity_id,state,note)
        SELECT 'media_asset',id,'pending','영상 사용 전 항목별 권리·출처·시각 적합성 검토 필요' FROM media_assets;
      CREATE TRIGGER IF NOT EXISTS enqueue_media_asset_review
        AFTER INSERT ON media_assets
        BEGIN
          INSERT OR IGNORE INTO review_queue (entity_type,entity_id,state,note)
          VALUES ('media_asset',NEW.id,'pending','영상 사용 전 항목별 권리·출처·시각 적합성 검토 필요');
        END;
      CREATE TABLE IF NOT EXISTS record_claims (
        record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        PRIMARY KEY (record_id, claim_id)
      );
      CREATE TABLE IF NOT EXISTS politician_person_links (
        politician_id INTEGER PRIMARY KEY REFERENCES politicians(id) ON DELETE CASCADE,
        person_node_id INTEGER NOT NULL UNIQUE REFERENCES graph_nodes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS assembly_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_node_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        assembly_term TEXT NOT NULL DEFAULT '22', chamber TEXT NOT NULL DEFAULT '국회',
        district TEXT NOT NULL DEFAULT '', party TEXT NOT NULL DEFAULT '',
        naas_cd TEXT, valid_from TEXT, valid_to TEXT, as_of TEXT,
        status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','verified_current','historical','rejected','needs_reverification')),
        source_evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL,
        UNIQUE(person_node_id, assembly_term)
      );
      CREATE TABLE IF NOT EXISTS policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        current_stage TEXT NOT NULL CHECK (current_stage IN ('proposed','committee','plenary','promulgated','effective','amended','deferred','repealed')),
        impact_groups TEXT NOT NULL DEFAULT '',
        verification_state TEXT NOT NULL DEFAULT 'staged' CHECK (verification_state IN ('demo','staged','verified','needs_review')),
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
        bill_id TEXT,
        bill_no TEXT,
        proposer_names TEXT NOT NULL DEFAULT '',
        raw_fields_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_policies_stage ON policies(current_stage);
      CREATE TABLE IF NOT EXISTS policy_status_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('proposed','committee','plenary','promulgated','effective','amended','deferred','repealed')),
        event_date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL,
        source_url TEXT NOT NULL DEFAULT '',
        source_label TEXT NOT NULL DEFAULT '',
        raw_fields_json TEXT NOT NULL DEFAULT '{}',
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
        UNIQUE(policy_id, event_type, event_date)
      );
      CREATE INDEX IF NOT EXISTS idx_policy_status_events_policy ON policy_status_events(policy_id, event_date);
      CREATE TABLE IF NOT EXISTS complaint_clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        signal_strength INTEGER NOT NULL DEFAULT 0 CHECK (signal_strength BETWEEN 0 AND 100),
        verification_state TEXT NOT NULL DEFAULT 'staged' CHECK (verification_state IN ('demo','staged','verified','needs_review')),
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS complaint_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster_id INTEGER NOT NULL REFERENCES complaint_clusters(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK (source_type IN ('complaint','search','news','community','other')),
        keyword TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        count_or_note TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL,
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1))
      );
      CREATE INDEX IF NOT EXISTS idx_complaint_signals_cluster ON complaint_signals(cluster_id, observed_at);
      CREATE TABLE IF NOT EXISTS topic_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        complaint_cluster_id INTEGER REFERENCES complaint_clusters(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        editorial_summary TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
        eligible INTEGER NOT NULL DEFAULT 0 CHECK (eligible IN (0,1)),
        score_json TEXT NOT NULL DEFAULT '{}',
        verification_state TEXT NOT NULL DEFAULT 'staged' CHECK (verification_state IN ('demo','staged','verified','needs_review')),
        is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(policy_id, complaint_cluster_id)
      );
      CREATE INDEX IF NOT EXISTS idx_topic_candidates_queue ON topic_candidates(eligible DESC, score DESC);
      CREATE TABLE IF NOT EXISTS topic_candidate_evidence (
        candidate_id INTEGER NOT NULL REFERENCES topic_candidates(id) ON DELETE CASCADE,
        evidence_id INTEGER NOT NULL REFERENCES evidence_sources(id) ON DELETE CASCADE,
        relation TEXT NOT NULL CHECK (relation IN ('RELATED_TO','POSSIBLY_AFFECTED_BY','CONFIRMED_IMPACT')),
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(candidate_id, evidence_id, relation)
      );
      CREATE TABLE IF NOT EXISTS proposer_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        proposer_name TEXT NOT NULL,
        person_node_id INTEGER REFERENCES graph_nodes(id) ON DELETE SET NULL,
        resolution TEXT NOT NULL CHECK (resolution IN ('matched','needs_review','unmatched')),
        note TEXT NOT NULL DEFAULT '',
        UNIQUE(policy_id, proposer_name)
      );
      CREATE TABLE IF NOT EXISTS policy_complaint_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        complaint_cluster_id INTEGER NOT NULL REFERENCES complaint_clusters(id) ON DELETE CASCADE,
        relation TEXT NOT NULL CHECK (relation IN ('RELATED_TO','POSSIBLY_AFFECTED_BY')),
        matched_terms_json TEXT NOT NULL DEFAULT '[]',
        evidence_json TEXT NOT NULL DEFAULT '{}',
        review_state TEXT NOT NULL DEFAULT 'needs_review' CHECK (review_state IN ('needs_review','reviewed','rejected')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(policy_id, complaint_cluster_id)
      );
      CREATE INDEX IF NOT EXISTS idx_policy_complaint_matches_policy ON policy_complaint_matches(policy_id);
      CREATE INDEX IF NOT EXISTS idx_policy_complaint_matches_cluster ON policy_complaint_matches(complaint_cluster_id);
    `);
    repairGraphSchemaV3(db);
    repairPolicySchemaV5(db);
    if (current < 7) repairGraphSchemaV7(db);
    if (current < 8) repairGraphSchemaV8(db);
    if (current < 9) repairGraphSchemaV9(db);
    if (current < 10) repairGraphSchemaV10(db);
    if (current < GRAPH_SCHEMA_VERSION) {
      db.exec(`PRAGMA user_version = ${GRAPH_SCHEMA_VERSION}`);
    }
    db.exec('COMMIT');
    if (needsGraphRebuild) db.exec('PRAGMA foreign_keys = ON;');
  } catch (error) { rollback(db); if (needsGraphRebuild) db.exec('PRAGMA foreign_keys = ON;'); throw error; }
}

/** Rebuild graph_nodes once because SQLite cannot alter a CHECK constraint in place. */
function repairGraphSchemaV7(db: DatabaseSync) {
  db.exec('PRAGMA legacy_alter_table = ON;');
  try {
    db.exec('DROP INDEX IF EXISTS idx_graph_nodes_kind; DROP INDEX IF EXISTS idx_graph_nodes_external_key;');
    db.exec('ALTER TABLE graph_nodes RENAME TO graph_nodes_v6;');
    db.exec(`CREATE TABLE graph_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('person','party','committee','constituency','claim','evidence','event','topic','document','news','photo','video','bill','vote','meeting','election','membership','cultural_resource','other')),
      external_key TEXT, label TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}',
      valid_from TEXT, valid_to TEXT, as_of TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kind, external_key)
    );`);
    db.exec(`INSERT INTO graph_nodes (id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at)
      SELECT id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at FROM graph_nodes_v6;`);
    db.exec('CREATE INDEX idx_graph_nodes_kind ON graph_nodes(kind); CREATE INDEX idx_graph_nodes_external_key ON graph_nodes(external_key);');
    db.exec('DROP TABLE graph_nodes_v6;');
    db.exec("INSERT OR REPLACE INTO sqlite_sequence(name,seq) SELECT 'graph_nodes', COALESCE(MAX(id),0) FROM graph_nodes;");
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF;');
  }
}

/** Add speech nodes while preserving the v7 graph and all foreign-key rows. */
function repairGraphSchemaV8(db: DatabaseSync) {
  db.exec('PRAGMA legacy_alter_table = ON;');
  try {
    db.exec('DROP INDEX IF EXISTS idx_graph_nodes_kind; DROP INDEX IF EXISTS idx_graph_nodes_external_key;');
    db.exec('ALTER TABLE graph_nodes RENAME TO graph_nodes_v7;');
    db.exec(`CREATE TABLE graph_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('person','party','committee','constituency','claim','evidence','event','topic','document','news','photo','video','bill','vote','meeting','election','membership','cultural_resource','speech','other')),
      external_key TEXT, label TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}',
      valid_from TEXT, valid_to TEXT, as_of TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kind, external_key)
    );`);
    db.exec(`INSERT INTO graph_nodes (id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at)
      SELECT id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at FROM graph_nodes_v7;`);
    db.exec('CREATE INDEX idx_graph_nodes_kind ON graph_nodes(kind); CREATE INDEX idx_graph_nodes_external_key ON graph_nodes(external_key); DROP TABLE graph_nodes_v7;');
    db.exec("INSERT OR REPLACE INTO sqlite_sequence(name,seq) SELECT 'graph_nodes', COALESCE(MAX(id),0) FROM graph_nodes;");
  } finally { db.exec('PRAGMA legacy_alter_table = OFF;'); }
}

/** Add the generic media node kind used by source-intake registrations. */
function repairGraphSchemaV9(db: DatabaseSync) {
  db.exec('PRAGMA legacy_alter_table = ON;');
  try {
    db.exec('DROP INDEX IF EXISTS idx_graph_nodes_kind; DROP INDEX IF EXISTS idx_graph_nodes_external_key;');
    db.exec('ALTER TABLE graph_nodes RENAME TO graph_nodes_v8;');
    db.exec(`CREATE TABLE graph_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('person','party','committee','constituency','claim','evidence','event','topic','document','news','photo','video','media','bill','vote','meeting','election','membership','cultural_resource','speech','other')),
      external_key TEXT, label TEXT NOT NULL, properties_json TEXT NOT NULL DEFAULT '{}',
      valid_from TEXT, valid_to TEXT, as_of TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(kind, external_key)
    );`);
    db.exec(`INSERT INTO graph_nodes (id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at)
      SELECT id,kind,external_key,label,properties_json,valid_from,valid_to,as_of,created_at,updated_at FROM graph_nodes_v8;`);
    db.exec('CREATE INDEX idx_graph_nodes_kind ON graph_nodes(kind); CREATE INDEX idx_graph_nodes_external_key ON graph_nodes(external_key); DROP TABLE graph_nodes_v8;');
    db.exec("INSERT OR REPLACE INTO sqlite_sequence(name,seq) SELECT 'graph_nodes', COALESCE(MAX(id),0) FROM graph_nodes;");
  } finally { db.exec('PRAGMA legacy_alter_table = OFF;'); }
}

/** Repair foreign-key targets left with the historical graph_nodes_v8 name by legacy migrations. */
function repairGraphSchemaV10(db: DatabaseSync) {
  const stale = (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND sql LIKE '%graph_nodes_v8%'").get() as {count: number}).count;
  if (!stale) return;
  db.exec('PRAGMA legacy_alter_table = OFF;');
  db.exec('ALTER TABLE graph_nodes RENAME TO graph_nodes_tmp; ALTER TABLE graph_nodes_tmp RENAME TO graph_nodes_v8; ALTER TABLE graph_nodes_v8 RENAME TO graph_nodes;');
}

function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((item) => item.name === column);
}

/** Repair required v3 objects inside the caller's migration transaction. */
function repairGraphSchemaV3(db: DatabaseSync) {
  const additions: [string, string][] = [
    ['politicians', 'naas_cd TEXT'],
    ['assembly_memberships', "committee TEXT NOT NULL DEFAULT ''"],
    ['assembly_memberships', 'verified_at TEXT'],
    ['assembly_memberships', 'verification_expires_at TEXT'],
    ['evidence_sources', 'source_id INTEGER REFERENCES source_registry(id) ON DELETE SET NULL'],
    ['evidence_sources', 'raw_path TEXT'],
    ['evidence_sources', 'page_index INTEGER'],
  ];
  for (const [table, definition] of additions) {
    const column = definition.split(' ')[0];
    if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS assembly_membership_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, membership_id INTEGER NOT NULL REFERENCES assembly_memberships(id) ON DELETE CASCADE,
    assembly_term TEXT NOT NULL, party TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '', committee TEXT NOT NULL DEFAULT '',
    naas_cd TEXT, captured_at TEXT NOT NULL, source_evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL,
    raw_json TEXT NOT NULL DEFAULT '{}', UNIQUE(membership_id, captured_at)
  );`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_membership_verification ON assembly_memberships(status, verification_expires_at)');
}

/** Add policy provenance and the partial ingest state without weakening v3 repairs. */
function repairPolicySchemaV5(db: DatabaseSync) {
  const additions: [string, string][] = [
    ['policies', 'source_evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL'],
    ['policies', 'external_source_key TEXT'],
    ['policy_status_events', 'external_source_key TEXT'],
    ['complaint_signals', 'source_evidence_id INTEGER REFERENCES evidence_sources(id) ON DELETE SET NULL'],
    ['complaint_signals', 'external_source_key TEXT'],
    ['topic_candidates', 'external_key TEXT'],
    ['complaint_signals', 'policy_external_key TEXT'],
  ];
  for (const [table, definition] of additions) {
    const column = definition.split(' ')[0];
    if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
  db.exec(`DROP INDEX IF EXISTS idx_policy_source_key;
    DROP INDEX IF EXISTS idx_policy_status_source_key;
    DROP INDEX IF EXISTS idx_complaint_signal_source_key;
    DROP INDEX IF EXISTS idx_topic_candidate_external_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_source_key ON policies(external_source_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_status_source_key ON policy_status_events(policy_id, external_source_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_complaint_signal_source_key ON complaint_signals(external_source_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidate_external_key ON topic_candidates(external_key);`);
  const ingestSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ingest_runs'").get() as { sql: string | null } | undefined)?.sql ?? '';
  if (!ingestSql.includes("'partial'")) {
    db.exec(`CREATE TABLE ingest_runs_v5 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES source_registry(id),
      mode TEXT NOT NULL CHECK (mode IN ('dry_run','sync')), status TEXT NOT NULL CHECK (status IN ('running','success','failed','blocked','partial')),
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, rows_seen INTEGER NOT NULL DEFAULT 0,
      rows_staged INTEGER NOT NULL DEFAULT 0, error TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO ingest_runs_v5 (id,source_id,mode,status,started_at,finished_at,rows_seen,rows_staged,error,metadata_json)
      SELECT id,source_id,mode,status,started_at,finished_at,rows_seen,rows_staged,error,metadata_json FROM ingest_runs;
    DROP TABLE ingest_runs;
    ALTER TABLE ingest_runs_v5 RENAME TO ingest_runs;`);
  }
  const v6Additions: [string, string][] = [
    ['policies', 'bill_id TEXT'],
    ['policies', 'bill_no TEXT'],
    ['policies', "proposer_names TEXT NOT NULL DEFAULT ''"],
    ['policies', "raw_fields_json TEXT NOT NULL DEFAULT '{}'"],
    ['policy_status_events', "raw_fields_json TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [table, definition] of v6Additions) {
    const column = definition.split(' ')[0];
    if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function seedSourceRegistry(db: DatabaseSync) {
  const sources = [
    ['assembly-members', '국회 의원정보 통합 API', 'https://open.assembly.go.kr/portal/openapi/ALLNAMEMBER', 1, '공공데이터 이용조건 확인; 원문·수집일 보존', 1, 'assembly-roster', 0],
    ['nec', '중앙선거관리위원회', 'https://www.nec.go.kr', 1, '공공데이터 이용조건 및 선거자료별 저작권 확인', 1, 'nec', 0],
    ['assembly-minutes', '국회 회의록', 'https://record.assembly.go.kr', 1, '공식 회의록; 인용 범위와 원문 링크 보존', 1, 'assembly-minutes', 0],
    ['assembly-bills', '국회 의안정보', 'https://pal.assembly.go.kr', 1, '공식 의안 자료; 이용조건 확인', 1, 'assembly-bills', 0],
    ['assembly-webcast', '국회 의사중계/NATV', 'https://assembly.webcast.go.kr', 2, '영상별 이용허락과 인용 범위 확인', 1, 'assembly-media', 0],
    ['peti', '공직윤리시스템', 'https://www.peti.go.kr', 1, '공개 공시 목적·재이용 조건 확인', 1, 'peti', 0],
    ['bigkinds', 'BIGKinds 뉴스 검색', 'https://www.bigkinds.or.kr', 3, '기사 메타데이터·최소 인용만 보관', 1, 'bigkinds', 0],
    ['poliwiki', 'Poliwiki (탐색 전용)', 'https://poliwiki.kr', 4, '발견·대조용. 사실 확정은 공식 원문으로 역추적', 1, 'poliwiki', 1],
    ['pilot-nam-insun', '남인순 동물대체시험법 파일럿 공식 원문', 'https://ampos.nanet.go.kr', 1, '공식 원문만 승인 근거로 사용; 원문·수집일·해시 보존', 1, 'nam-insun-pilot', 0],
    ['lawmaking', '국민참여입법센터 입법예고 수정현황', 'https://www.lawmaking.go.kr/rest/ogLmPpMod.xml', 1, '정부 공식 XML 원문·수집일·해시 보존; 출처표시 후 사용; 실제 시행 여부는 별도 확인', 1, 'lawmaking-policy', 0],
    ['epeople-complaints', '국민권익위 민원빅데이터', 'https://bigdata.epeople.go.kr', 1, '공공데이터포털 제2유형(출처표시·상업적 이용금지) 적용 가능성 확인; 내부 후보 발견용. 수익화 영상 재사용 전 별도 이용조건 확인', 1, 'epeople-complaints', 1],
    ['assembly-bills-live', '국회 최근 의안정보 TVBPMBILL11', 'https://open.assembly.go.kr/portal/openapi/TVBPMBILL11', 1, '국회 공식 API 이용조건에 따른 출처표시; 원문·수집일·해시 보존', 1, 'assembly-bills-live', 0],
    ['pexels-media', 'Pexels 사진·영상 API', 'https://api.pexels.com/v1/search', 3, 'Pexels 이용약관·콘텐츠별 권리와 인물·상표·음원 권리 확인; 제작자와 Pexels 출처 보존', 1, 'pexels-media', 0],
    ['wikimedia-commons', 'Wikimedia Commons', 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia', 2, '사진·영상 파일별 라이선스·저작자·원문 페이지를 확인하고 라이선스 조건에 맞게 표시; 후보 staged 후 검토', 1, 'keyless-wikimedia', 1],
    ['nasa-images', 'NASA Images and Media', 'https://www.nasa.gov/nasa-brand-center/images-and-media/', 2, '사진·영상별 사용 지침·식별자·인물·제3자 권리를 확인; NASA 보증·추천으로 오인 금지; 후보 staged 후 검토', 1, 'keyless-nasa', 1],
    ['loc-media', 'Library of Congress Free to Use', 'https://www.loc.gov/free-to-use/', 2, '사진·영상 항목별 Rights and Access·저작권 상태·공개 제한을 확인한 뒤 사용; 후보 staged 후 검토', 1, 'keyless-loc', 1],
    ['kogl-media', '공공누리(KOGL)', 'https://www.kogl.or.kr/info/introduce.do', 1, '자료별 공공누리 유형·출처표시·변경·상업적 이용 조건을 확인; 제3자 자료 제외', 1, 'kogl-media', 1],
    ['national-archives-media', '국가기록원 문화영화·사진', 'https://theme.archives.go.kr/next/movie/archiveStat.do', 1, '공공누리·기록물별 이용 조건과 초상·제3자 권리를 확인; DATA_GO_KR_SERVICE_KEY 준비', 1, 'national-archives-media', 1],
    ['digital-culture-api', '디지털문화자원 메타데이터 API', 'https://apis.data.go.kr/B553457/share/rest/digitalculture', 1, '메타데이터 발견 전용; 썸네일·저작권·공공누리 유형은 항목별 확인 후 사용', 1, 'digital-culture-api', 1],
  ] as const;
  const insert = db.prepare(`INSERT INTO source_registry (slug,name,base_url,trust_tier,license_notes,enabled,adapter,discovery_only) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, trust_tier=excluded.trust_tier, license_notes=excluded.license_notes, adapter=excluded.adapter, discovery_only=excluded.discovery_only`);
  for (const source of sources) insert.run(...source);
}

function openDb() { return openArchiveDb(); }

function seedDemo(db: DatabaseSync) {
  const count = Number((db.prepare('SELECT COUNT(*) AS count FROM politicians').get() as { count: number }).count);
  if (count > 0) return;
  const politician = db.prepare('INSERT INTO politicians (name, role, color) VALUES (?, ?, ?)').run('데모 인물 A', '샘플 아카이브 · 실제 인물 아님', '#d8e8e4');
  const politicianId = Number(politician.lastInsertRowid);
  const record = db.prepare(`INSERT INTO records (politician_id, title, body, type, event_date, position_x, position_y, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(politicianId, '샘플 카드 — 출처를 붙여 기록하세요', '이 카드는 화면 구성을 보여주기 위한 데모 데이터입니다. 실제 정치인이나 사건에 대한 주장이 아닙니다.', '데모 메모', '2025. 01. 01.', 80, 80, '#fff8e9');
  db.prepare(`INSERT INTO sources (record_id, title, url, publisher, published_at, license, verification_status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(Number(record.lastInsertRowid), '데모 출처 — 교체 필요', 'https://example.com/demo-source', '샘플 발행처', '2025. 01. 01.', '사용 전 라이선스 확인', '데모', '영상 제작 전 실제 출처와 이용 조건을 확인하세요.');
}

export type PolicyStatusEvent = {
  id: number;
  policy_id: number;
  event_type: PolicyStage;
  event_date: string;
  note: string;
  source_url: string;
  source_label: string;
  is_demo: number;
};

export type PolicyCandidate = {
  id: number;
  policy_id: number;
  complaint_cluster_id: number | null;
  title: string;
  editorial_summary: string;
  score: number;
  eligible: number;
  score_json: TopicScore;
  verification_state: string;
  is_demo: number;
  policy_title: string;
  policy_summary: string;
  current_stage: PolicyStage;
  impact_groups: string;
  latest_status_date: string | null;
  cluster_label: string | null;
  complaint_description: string | null;
  signal_strength: number | null;
  signals: { source_type: string; keyword: string; observed_at: string; count_or_note: string; source_url: string }[];
  status_events: PolicyStatusEvent[];
};

function policyNode(db: DatabaseSync, externalKey: string, label: string) {
  db.prepare(`INSERT INTO graph_nodes (kind, external_key, label, properties_json)
    VALUES ('topic', ?, ?, ?)
    ON CONFLICT(kind, external_key) DO UPDATE SET label=excluded.label`).run(externalKey, label, JSON.stringify({ domain: 'policy-radar' }));
  return Number((db.prepare(`SELECT id FROM graph_nodes WHERE kind='topic' AND external_key=?`).get(externalKey) as { id: number }).id);
}

/** Seed fictional records only; no row here is evidence of a real policy or complaint. */
export function seedPolicyRadarDemo(db: DatabaseSync) {
  const demos = [
    {
      key: 'demo-policy-youth-housing-2026',
      title: '청년 월세지원 대상 변경안 (가상 데모)',
      summary: '정책 단계와 실제 민원을 연결하는 화면 예시입니다. 실제 법안이 아닙니다.',
      stage: 'proposed' as const,
      impact: '청년·저소득 임차인',
      eventDate: '2026-08-18',
      eventNote: '가상의 발의 단계. 시행이 확정된 것으로 해석하지 않습니다.',
      clusterKey: 'demo-complaint-rent-2026',
      cluster: '신청 조건이 갑자기 달라졌다는 문의 (가상)',
      clusterDescription: '실제 민원 통계가 아닌 UI용 가상 신호 묶음입니다.',
      signalStrength: 84,
      signal: ['complaint', '신청 조건 변경 문의', '가상 민원 신호 84건'],
      score: { 생활영향: 25, 이슈화: 15, 민원: 20, 시행긴급성: 15, 정치인책임: 15, 자료확보: 10 },
    },
    {
      key: 'demo-policy-transit-2026',
      title: '청년 교통비 지원 조정안 (가상 데모)',
      summary: '상임위 심사와 검색·민원 신호를 연결하는 예시입니다.',
      stage: 'committee' as const,
      impact: '청년·대중교통 이용자',
      eventDate: '2026-08-12',
      eventNote: '가상의 상임위 심사 단계. 본회의 의결·시행과 다릅니다.',
      clusterKey: 'demo-complaint-transit-2026',
      cluster: '교통비 지원 대상 검색 증가 (가상)',
      clusterDescription: '검색량을 흉내 낸 가상 신호이며 실제 검색 통계가 아닙니다.',
      signalStrength: 61,
      signal: ['search', '교통비 지원 대상', '가상 검색 신호 +61%'],
      score: { 생활영향: 20, 이슈화: 15, 민원: 10, 시행긴급성: 10, 정치인책임: 10, 자료확보: 8 },
    },
    {
      key: 'demo-policy-platform-2026',
      title: '플랫폼 수수료 표시 의무안 (가상 데모)',
      summary: '폐지 상태와 낮은 후보 점수가 조사 보류로 이어지는 예시입니다.',
      stage: 'repealed' as const,
      impact: '소상공인·플랫폼 이용자',
      eventDate: '2026-07-29',
      eventNote: '가상의 폐지 상태. 실제 입법 사실이 아닙니다.',
      clusterKey: 'demo-complaint-platform-2026',
      cluster: '수수료 표시 관련 제보 (가상)',
      clusterDescription: '제보를 표현한 가상 데이터입니다.',
      signalStrength: 22,
      signal: ['community', '수수료가 왜 다른가요?', '가상 제보 3건'],
      score: { 생활영향: 15, 이슈화: 10, 민원: 0, 시행긴급성: 5, 정치인책임: 5, 자료확보: 5 },
    },
  ];
  begin(db);
  try {
    for (const demo of demos) {
      db.prepare(`INSERT INTO policies (external_key,title,summary,current_stage,impact_groups,verification_state,is_demo)
        VALUES (?,?,?,?,?,'demo',1)
        ON CONFLICT(external_key) DO UPDATE SET title=excluded.title, summary=excluded.summary, current_stage=excluded.current_stage, impact_groups=excluded.impact_groups, verification_state='demo', is_demo=1, updated_at=CURRENT_TIMESTAMP`)
        .run(demo.key, demo.title, demo.summary, demo.stage, demo.impact);
      const policyId = Number((db.prepare('SELECT id FROM policies WHERE external_key=?').get(demo.key) as { id: number }).id);
      db.prepare(`INSERT INTO policy_status_events (policy_id,event_type,event_date,note,source_label,is_demo)
        VALUES (?,?,?,?,?,1) ON CONFLICT(policy_id,event_type,event_date) DO UPDATE SET note=excluded.note, source_label=excluded.source_label, is_demo=1`)
        .run(policyId, demo.stage, demo.eventDate, demo.eventNote, '가상 데모 — 실제 출처로 교체 필요');
      db.prepare(`INSERT INTO complaint_clusters (external_key,label,description,signal_strength,verification_state,is_demo)
        VALUES (?,?,?,?,'demo',1)
        ON CONFLICT(external_key) DO UPDATE SET label=excluded.label, description=excluded.description, signal_strength=excluded.signal_strength, verification_state='demo', is_demo=1`)
        .run(demo.clusterKey, demo.cluster, demo.clusterDescription, demo.signalStrength);
      const clusterId = Number((db.prepare('SELECT id FROM complaint_clusters WHERE external_key=?').get(demo.clusterKey) as { id: number }).id);
      db.prepare(`DELETE FROM complaint_signals WHERE cluster_id=?`).run(clusterId);
      db.prepare(`INSERT INTO complaint_signals (cluster_id,source_type,keyword,observed_at,count_or_note,is_demo)
        VALUES (?,?,?,?,?,1)`).run(clusterId, demo.signal[0], demo.signal[1], demo.eventDate, demo.signal[2]);
      const score = calculateTopicScore(demo.score);
      db.prepare(`INSERT INTO topic_candidates (policy_id,complaint_cluster_id,title,editorial_summary,score,eligible,score_json,verification_state,is_demo)
        VALUES (?,?,?,?,?,?,?,'demo',1)
        ON CONFLICT(policy_id,complaint_cluster_id) DO UPDATE SET title=excluded.title, editorial_summary=excluded.editorial_summary, score=excluded.score, eligible=excluded.eligible, score_json=excluded.score_json, verification_state='demo', is_demo=1, updated_at=CURRENT_TIMESTAMP`)
        .run(policyId, clusterId, demo.title, demo.summary, score.total, score.eligible ? 1 : 0, JSON.stringify(score));
      const candidateId = Number((db.prepare('SELECT id FROM topic_candidates WHERE policy_id=? AND complaint_cluster_id=?').get(policyId, clusterId) as { id: number }).id);
      const policyNodeId = policyNode(db, demo.key, demo.title);
      const complaintNodeId = policyNode(db, demo.clusterKey, demo.cluster);
      db.prepare(`INSERT INTO graph_edges (from_node_id,to_node_id,relation,properties_json)
        VALUES (?,?,?,?) ON CONFLICT(from_node_id,to_node_id,relation) DO UPDATE SET properties_json=excluded.properties_json`)
        .run(policyNodeId, complaintNodeId, 'POSSIBLY_AFFECTED_BY', JSON.stringify({ candidateId, demo: true }));
    }
    db.exec('COMMIT');
  } catch (error) { rollback(db); throw error; }
}

export function getPolicyCandidates(): PolicyCandidate[] {
  const db = openDb();
  try {
    const candidates = rows<Omit<PolicyCandidate, 'score_json' | 'signals' | 'status_events'> & { score_json: string }>(db, `SELECT tc.id,tc.policy_id,tc.complaint_cluster_id,tc.title,tc.editorial_summary,tc.score,tc.eligible,tc.score_json,tc.verification_state,tc.is_demo,
      p.title AS policy_title,p.summary AS policy_summary,p.current_stage,p.impact_groups,
      (SELECT MAX(event_date) FROM policy_status_events pse WHERE pse.policy_id=p.id) AS latest_status_date,
      cc.label AS cluster_label,cc.description AS complaint_description,cc.signal_strength
      FROM topic_candidates tc JOIN policies p ON p.id=tc.policy_id LEFT JOIN complaint_clusters cc ON cc.id=tc.complaint_cluster_id
      ORDER BY tc.eligible DESC,tc.score DESC,tc.id`);
    return candidates.map((candidate) => ({
      ...candidate,
      score_json: JSON.parse(candidate.score_json) as TopicScore,
      signals: rows<PolicyCandidate['signals'][number]>(db, 'SELECT source_type,keyword,observed_at,count_or_note,source_url FROM complaint_signals WHERE cluster_id=? ORDER BY id', candidate.complaint_cluster_id ?? 0),
      status_events: rows<PolicyStatusEvent>(db, 'SELECT id,policy_id,event_type,event_date,note,source_url,source_label,is_demo FROM policy_status_events WHERE policy_id=? ORDER BY event_date,id', candidate.policy_id),
    }));
  } finally { db.close(); }
}

export function getPolicyRadarSummary() {
  const db = openDb();
  try {
    const count = (sql: string) => Number((db.prepare(sql).get() as { count: number }).count);
    return {
      realPolicies: count('SELECT COUNT(*) AS count FROM policies WHERE is_demo=0'),
      unmatchedPolicies: count("SELECT COUNT(*) AS count FROM policies p WHERE p.is_demo=0 AND NOT EXISTS (SELECT 1 FROM policy_complaint_matches m WHERE m.policy_id=p.id)"),
      realComplaints: count('SELECT COUNT(*) AS count FROM complaint_clusters WHERE is_demo=0'),
      unmatchedComplaints: count("SELECT COUNT(*) AS count FROM complaint_clusters c WHERE c.is_demo=0 AND NOT EXISTS (SELECT 1 FROM policy_complaint_matches m WHERE m.complaint_cluster_id=c.id)"),
      needsReviewMatches: count("SELECT COUNT(*) AS count FROM policy_complaint_matches WHERE review_state='needs_review'"),
    };
  } finally { db.close(); }
}

type SqlValue = string | number | bigint | null | Uint8Array;

function rows<T>(db: DatabaseSync, sql: string, ...params: SqlValue[]) {
  const result = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return result.map((row) => ({ ...row })) as T[];
}

export function getPoliticians(): Politician[] {
  const db = openDb();
  try { return rows<Politician>(db, 'SELECT id, name, role, color FROM politicians ORDER BY id'); }
  finally { db.close(); }
}

export function getRecords(politicianId?: number): RecordCard[] {
  const db = openDb();
  try {
    const records = politicianId
      ? rows<Omit<RecordCard, 'sources'>>(db, 'SELECT id, politician_id, title, body, type, event_date, position_x, position_y, color, updated_at FROM records WHERE politician_id = ? ORDER BY id', politicianId)
      : rows<Omit<RecordCard, 'sources'>>(db, 'SELECT id, politician_id, title, body, type, event_date, position_x, position_y, color, updated_at FROM records ORDER BY id');
    return records.map((record) => ({ ...record, sources: rows<Source>(db, 'SELECT id, record_id, title, url, publisher, published_at, license, verification_status, note FROM sources WHERE record_id = ? ORDER BY id', record.id) }));
  } finally { db.close(); }
}

export function getBookmarks(recordId?: number): Bookmark[] {
  const db = openDb();
  try { return recordId ? rows<Bookmark>(db, 'SELECT id, record_id, timestamp_seconds, label FROM bookmarks WHERE record_id = ? ORDER BY timestamp_seconds', recordId) : rows<Bookmark>(db, 'SELECT id, record_id, timestamp_seconds, label FROM bookmarks ORDER BY timestamp_seconds'); }
  finally { db.close(); }
}

export type RecordInput = {
  politicianId: number;
  title: string;
  body: string;
  type: string;
  eventDate: string;
  color: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher: string;
  publishedAt: string;
  license: string;
  verificationStatus: string;
  sourceNote: string;
  positionX?: number;
  positionY?: number;
};

function assertId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label}가 올바르지 않습니다.`);
  return value;
}

function position(value: number | undefined, fallback: number, maximum: number) {
  const next = value ?? fallback;
  if (!Number.isFinite(next)) throw new Error('카드 위치가 올바르지 않습니다.');
  return Math.min(maximum, Math.max(0, Math.round(next)));
}

function getRecord(db: DatabaseSync, id: number): RecordCard {
  const record = rows<Omit<RecordCard, 'sources'>>(db, 'SELECT id, politician_id, title, body, type, event_date, position_x, position_y, color, updated_at FROM records WHERE id = ?', id)[0];
  if (!record) throw new Error('카드를 찾을 수 없습니다.');
  return { ...record, sources: rows<Source>(db, 'SELECT id, record_id, title, url, publisher, published_at, license, verification_status, note FROM sources WHERE record_id = ? ORDER BY id', id) };
}

function begin(db: DatabaseSync) { db.exec('BEGIN IMMEDIATE'); }
function rollback(db: DatabaseSync) { try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ } }

export function insertRecord(input: RecordInput) {
  const db = openDb();
  const politicianId = assertId(input.politicianId, '인물 ID');
  const x = position(input.positionX, 80, 1380);
  const y = position(input.positionY, 80, 740);
  try {
    begin(db);
    const result = db.prepare(`INSERT INTO records (politician_id, title, body, type, event_date, position_x, position_y, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(politicianId, input.title.trim(), input.body.trim(), input.type, input.eventDate, x, y, input.color);
    const id = Number(result.lastInsertRowid);
    if (input.sourceTitle.trim() || input.sourceUrl.trim()) insertSource(db, id, input);
    const record = getRecord(db, id);
    db.exec('COMMIT');
    return record;
  } catch (error) { rollback(db); throw error; }
  finally { db.close(); }
}

export function updateRecord(id: number, input: RecordInput) {
  const db = openDb();
  assertId(id, '카드 ID');
  const politicianId = assertId(input.politicianId, '인물 ID');
  try {
    begin(db);
    const result = db.prepare(`UPDATE records SET politician_id = ?, title = ?, body = ?, type = ?, event_date = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(politicianId, input.title.trim(), input.body.trim(), input.type, input.eventDate, input.color, id);
    if (Number(result.changes) !== 1) throw new Error('카드를 찾을 수 없습니다.');
    // Keep additional source rows intact. The editor currently edits the first
    // source; deleting the whole set here used to silently destroy citations
    // added by collectors or future multi-source editors.
    const source = db.prepare('SELECT id FROM sources WHERE record_id = ? ORDER BY id LIMIT 1').get(id) as { id: number } | undefined;
    if (input.sourceTitle.trim() || input.sourceUrl.trim()) {
      if (source) {
        db.prepare(`UPDATE sources SET title=?,url=?,publisher=?,published_at=?,license=?,verification_status=?,note=? WHERE id=?`)
          .run(input.sourceTitle.trim() || '출처 제목 미입력', input.sourceUrl.trim(), input.publisher.trim(), input.publishedAt.trim(), input.license.trim() || '확인 필요', input.verificationStatus, input.sourceNote.trim(), source.id);
      } else insertSource(db, id, input);
    }
    db.exec('COMMIT');
  } catch (error) { rollback(db); throw error; }
  finally { db.close(); }
}

function insertSource(db: DatabaseSync, recordId: number, input: RecordInput) {
  db.prepare(`INSERT INTO sources (record_id, title, url, publisher, published_at, license, verification_status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(recordId, input.sourceTitle.trim() || '출처 제목 미입력', input.sourceUrl.trim(), input.publisher.trim(), input.publishedAt.trim(), input.license.trim() || '확인 필요', input.verificationStatus, input.sourceNote.trim());
}

export function deleteRecord(id: number) {
  const db = openDb();
  assertId(id, '카드 ID');
  try { db.prepare('DELETE FROM records WHERE id = ?').run(id); }
  finally { db.close(); }
}

export function updateRecordPosition(id: number, x: number, y: number) {
  const db = openDb();
  assertId(id, '카드 ID');
  const safeX = position(x, 80, 1380);
  const safeY = position(y, 80, 740);
  try {
    const result = db.prepare('UPDATE records SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(safeX, safeY, id);
    if (Number(result.changes) !== 1) throw new Error('카드를 찾을 수 없습니다.');
  }
  finally { db.close(); }
}
