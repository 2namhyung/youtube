import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureAIAnalysisSchema} from '../visualmaker/core/ai-analysis-schema.ts';

const REQUEST='a'.repeat(64);
const RESPONSE='b'.repeat(64);
const STARTED='2026-10-14T10:11:12.123Z';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE visualmaker_jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, kind TEXT NOT NULL, request_sha256 TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(project_id,idempotency_key))');
  db.prepare('INSERT INTO visualmaker_jobs VALUES (?,?,?,?,?,?)').run('job_one','project_one','key_one','ai-script-analysis',REQUEST,'queued');
  db.prepare('INSERT INTO visualmaker_jobs VALUES (?,?,?,?,?,?)').run('job_other','project_one','key_other','planning-package',REQUEST,'queued');
  ensureAIAnalysisSchema(db);
  return db;
}

function insert(db,jobId='job_one',request=REQUEST,attempt=1){
  db.prepare("INSERT INTO visualmaker_ai_analysis_attempts (job_id,attempt,request_sha256,outcome) VALUES (?,?,?,'not-started')")
    .run(jobId,attempt,request);
}

test('schema creation is idempotent and stores only bounded checkpoint metadata',()=>{
  const db=fixture();
  try {
    ensureAIAnalysisSchema(db);
    const columns=db.prepare('PRAGMA table_info(visualmaker_ai_analysis_attempts)').all().map(row=>row.name);
    assert.deepEqual(columns,['job_id','attempt','request_sha256','external_call_started_at','response_sha256','outcome','error_code']);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'visualmaker_ai_analysis_%_guard'").get().n,6);
    insert(db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM visualmaker_ai_analysis_attempts').get().n,1);
    assert.throws(()=>insert(db));
  } finally {db.close();}
});

test('failed schema installation rolls back every partial object',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    assert.throws(()=>ensureAIAnalysisSchema(db));
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'visualmaker_ai_analysis_%'").get().n,0);
  } finally {db.close();}
});

test('parent identity, attempt, hashes, timestamps and safe codes are constrained',()=>{
  const db=fixture();
  try {
    assert.throws(()=>insert(db,'job_missing'));
    assert.throws(()=>insert(db,'job_other'));
    assert.throws(()=>insert(db,'job_one',RESPONSE));
    assert.throws(()=>insert(db,'job_one',REQUEST,0));
    assert.throws(()=>insert(db,'job_one',REQUEST.toUpperCase()));
    assert.throws(()=>db.prepare("INSERT INTO visualmaker_ai_analysis_attempts (job_id,attempt,request_sha256,outcome,external_call_started_at) VALUES ('job_one',1,?,'started',?)").run(REQUEST,STARTED));
    insert(db);
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at='invalid' WHERE job_id='job_one'").run());
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='succeeded',external_call_started_at=? WHERE job_id='job_one'").run(STARTED));
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='failed-before-call',error_code='secret-token' WHERE job_id='job_one'").run());
    assert.equal(db.prepare('SELECT outcome FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get('job_one').outcome,'not-started');
  } finally {db.close();}
});

test('before-call cancellation is terminal; started call may succeed or need review',()=>{
  const db=fixture();
  try {
    insert(db);
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='cancelled-before-call',error_code='cancelled' WHERE job_id='job_one'").run();
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at=? WHERE job_id='job_one'").run(STARTED));

    db.prepare('INSERT INTO visualmaker_jobs VALUES (?,?,?,?,?,?)').run('job_success','project_one','key_success','ai-script-analysis',REQUEST,'running');
    insert(db,'job_success');
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at=? WHERE job_id='job_success'").run(STARTED);
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='not-started',external_call_started_at=NULL WHERE job_id='job_success'").run());
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET external_call_started_at=? WHERE job_id='job_success'").run('2026-10-14T10:11:13.123Z'));
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='succeeded' WHERE job_id='job_success'").run());
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='succeeded',response_sha256=? WHERE job_id='job_success'").run(RESPONSE);
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='needs-review' WHERE job_id='job_success'").run());

    db.prepare('INSERT INTO visualmaker_jobs VALUES (?,?,?,?,?,?)').run('job_review','project_one','key_review','ai-script-analysis',REQUEST,'running');
    insert(db,'job_review');
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at=? WHERE job_id='job_review'").run(STARTED);
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='needs-review',response_sha256=?,error_code='lease' WHERE job_id='job_review'").run(RESPONSE);
    assert.throws(()=>db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='succeeded' WHERE job_id='job_review'").run());
    assert.equal(db.prepare('SELECT response_sha256 FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get('job_review').response_sha256,RESPONSE);
  } finally {db.close();}
});

test('request binding and checkpoint survive attempted edits and transaction rollback',()=>{
  const db=fixture();
  try {
    db.exec('BEGIN IMMEDIATE');
    insert(db);
    assert.throws(()=>db.prepare('UPDATE visualmaker_ai_analysis_attempts SET request_sha256=? WHERE job_id=?').run(RESPONSE,'job_one'));
    db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT count(*) AS n FROM visualmaker_ai_analysis_attempts').get().n,0);

    insert(db);
    assert.throws(()=>db.prepare("UPDATE visualmaker_jobs SET request_sha256=? WHERE id='job_one'").run(RESPONSE));
    assert.throws(()=>db.prepare("UPDATE visualmaker_jobs SET kind='planning-package' WHERE id='job_one'").run());
    assert.throws(()=>db.prepare("DELETE FROM visualmaker_jobs WHERE id='job_one'").run());
    assert.throws(()=>db.prepare("DELETE FROM visualmaker_ai_analysis_attempts WHERE job_id='job_one'").run());
    assert.equal(db.prepare('SELECT request_sha256 FROM visualmaker_jobs WHERE id=?').get('job_one').request_sha256,REQUEST);
  } finally {db.close();}
});

test('REPLACE cannot reset a started or terminal checkpoint or replace its parent',()=>{
  const db=fixture();
  try {
    assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0);
    insert(db);
    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='started',external_call_started_at=? WHERE job_id='job_one'").run(STARTED);
    const replaceCheckpoint=()=>db.prepare("INSERT OR REPLACE INTO visualmaker_ai_analysis_attempts (job_id,attempt,request_sha256,outcome) VALUES ('job_one',1,?,'not-started')").run(REQUEST);
    const replaceParentById=()=>db.prepare("INSERT OR REPLACE INTO visualmaker_jobs VALUES ('job_one','project_one','key_one','ai-script-analysis',?,'queued')").run(REQUEST);
    const replaceParentByUniqueKey=()=>db.prepare("INSERT OR REPLACE INTO visualmaker_jobs VALUES ('job_replacement','project_one','key_one','ai-script-analysis',?,'queued')").run(REQUEST);
    assert.throws(replaceCheckpoint);
    assert.throws(replaceParentById);
    assert.throws(replaceParentByUniqueKey);
    const startedRow=db.prepare('SELECT outcome,external_call_started_at AS started FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get('job_one');
    assert.equal(startedRow.outcome,'started');
    assert.equal(startedRow.started,STARTED);

    db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='needs-review',error_code='network' WHERE job_id='job_one'").run();
    assert.throws(replaceCheckpoint);
    assert.throws(replaceParentById);
    assert.throws(replaceParentByUniqueKey);
    assert.equal(db.prepare('SELECT outcome FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get('job_one').outcome,'needs-review');
    assert.equal(db.prepare('SELECT id FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get('project_one','key_one').id,'job_one');

    db.prepare("INSERT OR REPLACE INTO visualmaker_jobs VALUES ('job_other','project_one','key_other','planning-package',?,'queued')").run(REQUEST);
    assert.equal(db.prepare('SELECT id FROM visualmaker_jobs WHERE id=?').get('job_other').id,'job_other');
  } finally {db.close();}
});
