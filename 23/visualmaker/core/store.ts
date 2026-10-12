import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {applyCommand, validatePlan} from './director.ts';
import type {Command, Plan} from './model.ts';

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function dataRoot() { return path.resolve(process.env.VISUALMAKER_DATA_DIR || 'data/visualmaker'); }

export function openDb() {
  mkdirSync(dataRoot(), {recursive: true});
  const db = new DatabaseSync(path.join(dataRoot(), 'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(project_id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(project_id, revision));`);
  return db;
}

export function assetFile(relativePath: string) {
  if (!/^assets\/[a-f0-9]{64}\.(png|jpg|webp|mp4|webm|json|txt)$/.test(relativePath)) throw new StoreError('허용되지 않은 자료 경로입니다.');
  const file = path.resolve(dataRoot(), relativePath);
  const actual = realpathSync(file);
  if (!actual.startsWith(realpathSync(dataRoot()) + path.sep)) throw new StoreError('자료 경로가 저장소를 벗어났습니다.');
  return actual;
}

export function verifyAssets(plan: Plan) {
  for (const asset of plan.assets) {
    try {
      const bytes = readFileSync(assetFile(asset.path));
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('hash');
      if (!/^asset_[a-f0-9-]{36}$/.test(asset.id)) throw new Error('receipt id');
      const receipt = JSON.parse(readFileSync(path.join(dataRoot(),'receipts',`${asset.id}.json`),'utf8'));
      if (Object.keys(asset).some(key=>JSON.stringify(asset[key as keyof typeof asset])!==JSON.stringify(receipt[key]))) throw new Error('verified metadata mismatch');
    } catch { throw new StoreError(`자료 또는 검증 기록이 없거나 변경되었습니다: ${asset.originalName}. 같은 자료 폴더를 복원한 뒤 다시 불러오세요.`); }
  }
}

export function listProjects() {
  const db = openDb();
  try { return db.prepare('SELECT id, title, revision, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC').all(); }
  finally { db.close(); }
}

export function getProject(id: string): Plan {
  const db = openDb();
  try {
    const row = db.prepare('SELECT document FROM projects WHERE id=?').get(id) as {document:string}|undefined;
    if (!row) throw new StoreError('프로젝트를 찾을 수 없습니다.', 404);
    const plan = validatePlan(JSON.parse(row.document));
    verifyAssets(plan);
    return plan;
  } finally { db.close(); }
}

export function insertProject(input: Plan, copy = false): Plan {
  const plan = validatePlan(structuredClone(input));
  verifyAssets(plan);
  if (copy) { plan.id = `project_${randomUUID()}`; plan.revision = 1; plan.updatedAt = new Date().toISOString(); }
  const db = openDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    if (db.prepare('SELECT id FROM projects WHERE id=?').get(plan.id)) throw new StoreError('이미 있는 프로젝트입니다. 새 사본으로 불러오세요.', 409);
    const doc = JSON.stringify(plan);
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(plan.id, plan.title, plan.revision, plan.updatedAt, doc);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(plan.id, plan.revision, doc);
    db.exec('COMMIT');
    return plan;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}

export function updateProject(id: string, baseRevision: number, command: Command): Plan {
  const db = openDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT revision, document FROM projects WHERE id=?').get(id) as {revision:number;document:string}|undefined;
    if (!row) throw new StoreError('프로젝트를 찾을 수 없습니다.', 404);
    if (row.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러온 뒤 다시 적용하세요.', 409);
    const next = applyCommand(validatePlan(JSON.parse(row.document)), command);
    if (command.type === 'attach-asset') verifyAssets(next);
    const doc = JSON.stringify(next);
    db.prepare('UPDATE projects SET title=?, revision=?, updated_at=?, document=? WHERE id=? AND revision=?').run(next.title, next.revision, next.updatedAt, doc, id, baseRevision);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id, next.revision, doc);
    db.exec('COMMIT');
    return next;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}
