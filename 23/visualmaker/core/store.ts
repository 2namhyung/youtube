import {DatabaseSync} from 'node:sqlite';
import {closeSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {applyCommand, validatePlan} from './director.ts';
import {createManualTimingDraft} from './narration-timing.ts';
import type {Asset, Command, NarrationTake, NarrationTiming, Plan,Requirement} from './model.ts';

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function dataRoot() { return path.resolve(process.env.VISUALMAKER_DATA_DIR || 'data/visualmaker'); }

export function narrationDirectory(name: 'narration' | 'narration-receipts' | 'staging') {
  mkdirSync(dataRoot(), {recursive:true});
  const root = realpathSync(dataRoot());
  mkdirSync(path.join(root, name), {recursive:true});
  const actual = realpathSync(path.join(root, name));
  if (actual !== path.join(root, name)) throw new StoreError('녹음 저장 경로가 지정된 폴더를 벗어났습니다.');
  return actual;
}

export function openDb() {
  mkdirSync(dataRoot(), {recursive: true});
  const db = new DatabaseSync(path.join(dataRoot(), 'studio.sqlite'));
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
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

export function narrationFile(take: NarrationTake) {
  if (take.path !== `narration/${take.sha256}.${take.format}` || !/^[a-f0-9]{64}$/.test(take.sha256)) throw new StoreError('허용되지 않은 녹음 경로입니다.');
  const root = realpathSync(dataRoot());
  const actual = realpathSync(path.resolve(root, take.path));
  if (!actual.startsWith(root + path.sep)) throw new StoreError('녹음 경로가 저장소를 벗어났습니다.');
  return actual;
}

export function verifyNarrationTakes(plan: Plan) {
  for (const take of plan.narrationTakes ?? []) {
    try {
      const bytes = readFileSync(narrationFile(take));
      if (bytes.length !== take.byteCount || createHash('sha256').update(bytes).digest('hex') !== take.sha256) throw new Error('hash');
      if (!/^take_[a-f0-9-]{36}$/.test(take.id)) throw new Error('receipt id');
      const receipt = JSON.parse(readFileSync(path.join(narrationDirectory('narration-receipts'), `${take.id}.json`), 'utf8'));
      if (receipt.version !== 1 || JSON.stringify(receipt.take) !== JSON.stringify(take) ||
          receipt.takeSha256 !== createHash('sha256').update(JSON.stringify(take)).digest('hex')) throw new Error('receipt');
    } catch { throw new StoreError(`녹음 파일 또는 검증 기록이 없거나 변경되었습니다: ${take.originalName}. 저장 폴더를 복원하세요.`); }
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
    verifyNarrationTakes(plan);
    return plan;
  } finally { db.close(); }
}

export function insertProject(input: Plan, copy = false): Plan {
  const plan = validatePlan(structuredClone(input));
  if (copy) { plan.narrationTakes = []; plan.narrationTimings = []; delete plan.aiAnalysisAdoption; }
  verifyAssets(plan);
  verifyNarrationTakes(plan);
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
    const current = validatePlan(JSON.parse(row.document));
    verifyNarrationTakes(current);
    if (command.type === 'assign-asset' || command.type === 'detach-asset' || command.type === 'review-source') verifyAssets(current);
    const next = applyCommand(current, command);
    verifyNarrationTakes(next);
    if (command.type === 'attach-asset' || command.type === 'assign-asset' || command.type === 'review-source') verifyAssets(next);
    const doc = JSON.stringify(next);
    db.prepare('UPDATE projects SET title=?, revision=?, updated_at=?, document=? WHERE id=? AND revision=?').run(next.title, next.revision, next.updatedAt, doc, id, baseRevision);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id, next.revision, doc);
    db.exec('COMMIT');
    return next;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}

/** Bind an already decoded original and its receipt to a Plan in one transaction. */
export function attachAssetBytes(id: string, baseRevision: number, requirementId: string, asset: Asset, bytes: Buffer,
  receiptExtension: Record<string, unknown> = {},signal?:AbortSignal,
  afterAttach?: (plan:Plan,requirement:Requirement,asset:Asset)=>void): Plan {
  const db = openDb();
  let ownedAsset: string | null = null;
  let ownedReceipt: string | null = null;
  try {
    if(signal?.aborted)throw new StoreError('자료 수집이 취소됐습니다.',409);
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT revision, document FROM projects WHERE id=?').get(id) as {revision:number;document:string}|undefined;
    if (!row) throw new StoreError('프로젝트를 찾을 수 없습니다.', 404);
    if (row.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.', 409);
    const current = validatePlan(JSON.parse(row.document));
    verifyAssets(current);
    verifyNarrationTakes(current);
    if (!/^assets\/[a-f0-9]{64}\.(png|jpg|webp|mp4|webm|json|txt)$/.test(asset.path) ||
      asset.path !== `assets/${asset.sha256}.${asset.path.split('.').at(-1)}` ||
      createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new StoreError('자료 바이트가 검증 기록과 다릅니다.', 409);
    const next = applyCommand(current, {type:'attach-asset',requirementId,asset});
    const attachedRequirement=next.requirements.find(item=>item.id===requirementId);
    if(!attachedRequirement)throw new StoreError('자료 요구를 찾을 수 없습니다.',409);
    afterAttach?.(next,attachedRequirement,asset);
    validatePlan(next);
    const root = realpathSync(dataRoot());
    for (const name of ['assets','receipts']) {
      mkdirSync(path.join(root,name),{recursive:true});
      if (realpathSync(path.join(root,name)) !== path.join(root,name)) throw new StoreError('자료 저장 경로가 올바르지 않습니다.',409);
    }
    const file = path.join(root,asset.path);
    let fd: number | null = null;
    try { fd=openSync(file,'wx'); ownedAsset=file; writeFileSync(fd,bytes); }
    catch (error) {
      if (!(error && typeof error==='object' && 'code' in error && error.code==='EEXIST')) throw error;
      const existing=readFileSync(assetFile(asset.path));
      if (!existing.equals(bytes)) throw new StoreError('동일 해시의 기존 자료가 변경되었습니다.',409);
    } finally { if (fd!==null) closeSync(fd); }
    const receiptPath=path.join(root,'receipts',`${asset.id}.json`);
    const receiptFd=openSync(receiptPath,'wx'); ownedReceipt=receiptPath;
    try { writeFileSync(receiptFd,JSON.stringify({...receiptExtension,...asset})); }
    finally { closeSync(receiptFd); }
    verifyAssets(next);
    const document=JSON.stringify(next);
    const updated=db.prepare('UPDATE projects SET title=?,revision=?,updated_at=?,document=? WHERE id=? AND revision=?')
      .run(next.title,next.revision,next.updatedAt,document,id,baseRevision);
    if(updated.changes!==1) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.',409);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id,next.revision,document);
    if(signal?.aborted)throw new StoreError('자료 수집이 취소됐습니다.',409);
    db.exec('COMMIT');
    return next;
  } catch(error) {
    let rolledBack=!db.isTransaction;
    if(db.isTransaction){try{db.exec('ROLLBACK');rolledBack=true;}catch{/* Unknown commit outcome: preserve files. */}}
    if(rolledBack){
      if(ownedReceipt)try{unlinkSync(ownedReceipt);}catch{/* preserve error */}
      if(ownedAsset)try{unlinkSync(ownedAsset);}catch{/* preserve error */}
    }
    throw error;
  } finally { db.close(); }
}

export function attachNarrationTake(id: string, baseRevision: number, scriptSha256: string, take: NarrationTake, bytes: Buffer): Plan {
  const db = openDb();
  let ownedRecording: string | null = null;
  let ownedReceipt: string | null = null;
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT revision, document FROM projects WHERE id=?').get(id) as {revision:number;document:string}|undefined;
    if (!row) throw new StoreError('프로젝트를 찾을 수 없습니다.', 404);
    if (row.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러온 뒤 녹음을 다시 등록하세요.', 409);
    const current = validatePlan(JSON.parse(row.document));
    verifyNarrationTakes(current);
    if (current.script.rawSha256 !== scriptSha256 || take.scriptSha256 !== scriptSha256 || take.projectId !== id || take.capturedRevision !== baseRevision)
      throw new StoreError('대본이 변경되었습니다. 최신 대본을 확인한 뒤 다시 등록하세요.', 409);
    if ((current.narrationTakes ?? []).some(item => item.id === take.id)) throw new StoreError('녹음 ID가 중복됩니다.', 409);
    if (bytes.length !== take.byteCount || createHash('sha256').update(bytes).digest('hex') !== take.sha256)
      throw new StoreError('녹음 바이트와 측정 기록이 일치하지 않습니다.');
    const next = validatePlan({...current, narrationTakes:[...(current.narrationTakes ?? []), take], revision:current.revision + 1, updatedAt:new Date().toISOString()});
    const recordingRoot = narrationDirectory('narration');
    const receiptRoot = narrationDirectory('narration-receipts');
    const file = path.join(recordingRoot, `${take.sha256}.${take.format}`);
    let recordingFd: number | null = null;
    try {
      recordingFd = openSync(file, 'wx');
      ownedRecording = file;
      writeFileSync(recordingFd, bytes);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
      const existing = readFileSync(narrationFile(take));
      if (existing.length !== bytes.length || !existing.equals(bytes))
        throw new StoreError('같은 해시의 녹음 파일이 변경되었습니다. 저장 폴더를 확인하세요.');
    } finally { if (recordingFd !== null) closeSync(recordingFd); }
    const receipt = {version:1, take, takeSha256:createHash('sha256').update(JSON.stringify(take)).digest('hex')};
    const receiptPath = path.join(receiptRoot, `${take.id}.json`);
    const receiptFd = openSync(receiptPath, 'wx');
    ownedReceipt = receiptPath;
    try { writeFileSync(receiptFd, JSON.stringify(receipt)); }
    finally { closeSync(receiptFd); }
    verifyNarrationTakes(next);
    const doc = JSON.stringify(next);
    const updated = db.prepare('UPDATE projects SET revision=?, updated_at=?, document=? WHERE id=? AND revision=?').run(next.revision, next.updatedAt, doc, id, baseRevision);
    if (updated.changes !== 1) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.', 409);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id, next.revision, doc);
    db.exec('COMMIT');
    return next;
  } catch (error) {
    let rolledBack = !db.isTransaction;
    if (db.isTransaction) {
      try { db.exec('ROLLBACK'); rolledBack = true; } catch { /* Preserve files when rollback outcome is unknown. */ }
    }
    if (rolledBack) {
      // Only unlink files created by this transaction. A repeated content hash may belong to another take.
      if (ownedReceipt) { try { unlinkSync(ownedReceipt); } catch { /* Preserve original failure. */ } }
      if (ownedRecording) { try { unlinkSync(ownedRecording); } catch { /* Preserve original failure. */ } }
    }
    throw error;
  }
  finally { db.close(); }
}

export function saveNarrationTiming(id: string, baseRevision: number, takeId: string, scriptSha256: string,
  audioSha256: string, segments: unknown, manualReviewConfirmed: boolean): {plan: Plan; timing: NarrationTiming} {
  const db = openDb();
  try {
    db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT revision, document FROM projects WHERE id=?').get(id) as {revision:number;document:string}|undefined;
    if (!row) throw new StoreError('프로젝트를 찾을 수 없습니다.', 404);
    if (row.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 시간을 다시 확인하세요.', 409);
    const current = validatePlan(JSON.parse(row.document));
    verifyAssets(current);
    verifyNarrationTakes(current);
    const take = (current.narrationTakes ?? []).find(item => item.id === takeId);
    if (!take) throw new StoreError('녹음을 찾을 수 없습니다.', 404);
    if (current.script.rawSha256 !== scriptSha256 || take.scriptSha256 !== scriptSha256 || take.sha256 !== audioSha256)
      throw new StoreError('대본 또는 녹음이 변경되었습니다. 다시 읽어 확인하세요.', 409);
    const timing = createManualTimingDraft(current, take, segments, manualReviewConfirmed);
    const next = validatePlan({...current, revision:current.revision + 1, updatedAt:new Date().toISOString(),
      narrationTimings:[...(current.narrationTimings ?? []), timing]});
    const doc = JSON.stringify(next);
    const updated = db.prepare('UPDATE projects SET revision=?, updated_at=?, document=? WHERE id=? AND revision=?').run(next.revision, next.updatedAt, doc, id, baseRevision);
    if (updated.changes !== 1) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.', 409);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(id, next.revision, doc);
    db.exec('COMMIT');
    return {plan:next, timing};
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}
