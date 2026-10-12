import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {planCsv, requirementsExport, validatePlan} from './director.ts';
import {dataRoot, openDb, StoreError, verifyAssets} from './store.ts';
import type {Plan} from './model.ts';

export const JOB_SCHEMA_VERSION = 'visualmaker-job-v1' as const;
export type JobKind = 'planning-package' | 'render-preview';
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked';
export type ArtifactName = 'plan.json' | 'scenes.csv' | 'source-requirements.json' | 'package.json';
export type JobArtifact = {name:ArtifactName; path:string; bytes:number; sha256:string; productionAuthority:false};
export type JobAttempt = {attempt:number; startedAt:string; endedAt:string|null; outcome:string|null; reason:string|null};
export type Job = {schemaVersion:typeof JOB_SCHEMA_VERSION; id:string; projectId:string; kind:JobKind; status:JobState; requestedRevision:number; snapshotSha256:string; productionAuthority:false; progress:number; attempt:number; createdAt:string; updatedAt:string; startedAt:string|null; finishedAt:string|null; error:string|null; blocker:string|null; recoveryReason:string|null; leaseExpiresAt:string|null; artifacts:JobArtifact[]; attempts:JobAttempt[]};

type Row = {id:string;project_id:string;kind:JobKind;status:JobState;requested_revision:number;snapshot_sha256:string;snapshot_json:string;request_sha256:string;idempotency_key:string;progress:number;attempt:number;created_at:string;updated_at:string;started_at:string|null;finished_at:string|null;error:string|null;blocker:string|null;recovery_reason:string|null;lease_token:string|null;lease_expires_at:string|null};
type Db = ReturnType<typeof openDb>;
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const bounded = (value:unknown) => String(value instanceof Error ? value.message : value).slice(0,1000);
const JOB_ID = /^job_[a-f0-9-]{36}$/;
const FILES:ArtifactName[]=['plan.json','scenes.csv','source-requirements.json','package.json'];
const BLOCKER='영상 렌더 어댑터는 아직 구현되지 않았습니다. 이 작업은 제작 미리보기 또는 컷 승인으로 사용할 수 없습니다.';

function dbOpen():Db {
  const db=openDb();
  db.exec(`CREATE TABLE IF NOT EXISTS visualmaker_jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
    requested_revision INTEGER NOT NULL, snapshot_sha256 TEXT NOT NULL, snapshot_json TEXT NOT NULL,
    request_sha256 TEXT NOT NULL, idempotency_key TEXT NOT NULL, progress INTEGER NOT NULL,
    attempt INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    started_at TEXT, finished_at TEXT, error TEXT, blocker TEXT, recovery_reason TEXT,
    lease_token TEXT, lease_expires_at TEXT,
    UNIQUE(project_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS visualmaker_job_attempts (
    job_id TEXT NOT NULL, attempt INTEGER NOT NULL, started_at TEXT NOT NULL,
    ended_at TEXT, outcome TEXT, reason TEXT, PRIMARY KEY(job_id,attempt));
    CREATE TABLE IF NOT EXISTS visualmaker_job_artifacts (
    job_id TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL,
    bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, production_authority INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(job_id,name));`);
  return db;
}

function transaction<T>(db:Db, fn:()=>T):T {
  db.exec('BEGIN IMMEDIATE');
  try {const result=fn();db.exec('COMMIT');return result;}
  catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}

function row(db:Db,id:string):Row {
  if(!JOB_ID.test(id))throw new StoreError('작업 ID가 올바르지 않습니다.');
  const result=db.prepare('SELECT * FROM visualmaker_jobs WHERE id=?').get(id) as Row|undefined;
  if(!result)throw new StoreError('작업을 찾을 수 없습니다.',404);
  return result;
}

function publicJob(db:Db,item:Row):Job {
  const artifacts=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(item.id) as Omit<JobArtifact,'productionAuthority'>[];
  const attempts=db.prepare('SELECT attempt,started_at AS startedAt,ended_at AS endedAt,outcome,reason FROM visualmaker_job_attempts WHERE job_id=? ORDER BY attempt').all(item.id) as JobAttempt[];
  return {schemaVersion:JOB_SCHEMA_VERSION,id:item.id,projectId:item.project_id,kind:item.kind,status:item.status,requestedRevision:item.requested_revision,snapshotSha256:item.snapshot_sha256,productionAuthority:false,progress:item.progress,attempt:item.attempt,createdAt:item.created_at,updatedAt:item.updated_at,startedAt:item.started_at,finishedAt:item.finished_at,error:item.error,blocker:item.blocker,recoveryReason:item.recovery_reason,leaseExpiresAt:item.lease_expires_at,artifacts:artifacts.map(a=>({...a,productionAuthority:false})),attempts};
}

export function enqueueJob(projectId:string,baseRevision:number,kind:JobKind,idempotencyKey:string):Job {
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId))throw new StoreError('프로젝트 ID가 올바르지 않습니다.');
  if(!Number.isSafeInteger(baseRevision)||baseRevision<1)throw new StoreError('리비전이 올바르지 않습니다.');
  if(kind!=='planning-package'&&kind!=='render-preview')throw new StoreError('지원하지 않는 작업 종류입니다.');
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))throw new StoreError('요청 키는 1–128자의 영문·숫자·_·-여야 합니다.');
  const db=dbOpen();
  try{return transaction(db,()=>{
    const project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!project)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    const requestSha=sha(JSON.stringify([projectId,baseRevision,kind]));
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(db,previous);}
    if(project.revision!==baseRevision)throw new StoreError('대본과 장면이 변경됐습니다. 최신 리비전을 불러오세요.',409);
    const plan=validatePlan(JSON.parse(project.document));
    if(plan.id!==projectId||plan.revision!==baseRevision||plan.productionAuthority!==false)throw new StoreError('저장된 계획 리비전이 올바르지 않습니다.',409);
    verifyAssets(plan);
    const snapshot=JSON.stringify(plan);
    const timestamp=now();const id=`job_${randomUUID()}`;const blocked=kind==='render-preview';
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,kind,blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,0,0,timestamp,timestamp,blocked?timestamp:null,blocked?BLOCKER:null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function listJobs(projectId:string):Job[] {
  const db=dbOpen();try{
    const rows=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 50').all(projectId) as Row[];
    return rows.map(item=>publicJob(db,item));
  }finally{db.close();}
}
export function getJob(id:string):Job {const db=dbOpen();try{return publicJob(db,row(db,id));}finally{db.close();}}

export function claimJob(id:string):{job:Job;token:string;snapshot:Plan} {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.status!=='queued'||item.kind!=='planning-package')throw new StoreError('실행할 수 있는 대기 작업이 아닙니다.',409);
    if(sha(item.snapshot_json)!==item.snapshot_sha256)throw new StoreError('작업 스냅샷이 변경됐습니다.',409);
    const snapshot=validatePlan(JSON.parse(item.snapshot_json));
    const timestamp=now();const lease=new Date(Date.now()+5*60_000).toISOString();const token=randomUUID();const attempt=item.attempt+1;
    const changed=db.prepare("UPDATE visualmaker_jobs SET status='running',attempt=?,progress=5,updated_at=?,started_at=?,finished_at=NULL,error=NULL,recovery_reason=NULL,lease_token=?,lease_expires_at=? WHERE id=? AND status='queued'").run(attempt,timestamp,timestamp,token,lease,id);
    if(changed.changes!==1)throw new StoreError('다른 실행자가 작업을 시작했습니다.',409);
    db.prepare('INSERT INTO visualmaker_job_attempts(job_id,attempt,started_at) VALUES(?,?,?)').run(id,attempt,timestamp);
    return {job:publicJob(db,row(db,id)),token,snapshot};
  });}finally{db.close();}
}

export function cancelJob(id:string):Job {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.status!=='queued'&&item.status!=='running')throw new StoreError('취소할 수 있는 작업이 아닙니다.',409);
    const timestamp=now();
    db.prepare("UPDATE visualmaker_jobs SET status='cancelled',updated_at=?,finished_at=?,error=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status IN ('queued','running')").run(timestamp,timestamp,id);
    if(item.status==='running')db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='cancelled' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function recoverJob(id:string):Job {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.status!=='running')throw new StoreError('복구할 실행 작업이 아닙니다.',409);
    if(!item.lease_expires_at||Date.parse(item.lease_expires_at)>Date.now())throw new StoreError('실행 중인 작업의 임대 시간이 남아 있습니다.',409);
    const timestamp=now();const reason='실행 임대가 만료돼 중단된 작업입니다. 재시도할 수 있습니다.';
    db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error=?,recovery_reason=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,reason,reason,id,item.lease_token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='failed',reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,reason,id,item.attempt);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function retryJob(id:string):Job {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.kind!=='planning-package'||(item.status!=='failed'&&item.status!=='cancelled'))throw new StoreError('재시도할 수 있는 종료 작업이 아닙니다.',409);
    const timestamp=now();
    db.prepare("UPDATE visualmaker_jobs SET status='queued',progress=0,updated_at=?,started_at=NULL,finished_at=NULL,error=NULL,blocker=NULL,recovery_reason=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status IN ('failed','cancelled')").run(timestamp,id);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

function failClaim(id:string,token:string,error:unknown):void {
  const db=dbOpen();try{transaction(db,()=>{
    const item=row(db,id);if(item.status!=='running'||item.lease_token!==token)return;
    const timestamp=now();const reason=bounded(error);
    db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,reason,id,token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='failed',reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,reason,id,item.attempt);
  });}finally{db.close();}
}

function artifactRoot():string {const root=path.join(dataRoot(),'jobs');mkdirSync(root,{recursive:true});return root;}
export function artifactFile(id:string,name:ArtifactName):{artifact:JobArtifact;bytes:Buffer} {
  if(!JOB_ID.test(id)||!FILES.includes(name))throw new StoreError('아티팩트 경로가 올바르지 않습니다.');
  const db=dbOpen();try{
    const item=row(db,id);
    if(item.status!=='succeeded')throw new StoreError('완료된 작업의 파일만 받을 수 있습니다.',409);
    const record=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? AND name=?').get(id,name) as Omit<JobArtifact,'productionAuthority'>|undefined;
    if(!record||!new RegExp(`^jobs/${id}/attempt-[1-9][0-9]*/${name.replace('.','\\.')}$`).test(record.path))throw new StoreError('파일 기록이 올바르지 않습니다.',404);
    const root=realpathSync(dataRoot());const absolute=realpathSync(path.resolve(root,record.path));
    if(!absolute.startsWith(root+path.sep))throw new StoreError('파일 경로가 작업 저장소를 벗어났습니다.',403);
    const bytes=readFileSync(absolute);
    if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw new StoreError('완료 파일의 해시가 변경됐습니다.',409);
    return {artifact:{...record,productionAuthority:false},bytes};
  }finally{db.close();}
}

export function executeClaim(id:string,token:string,snapshot:Plan):Job {
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.status!=='running'||item.lease_token!==token)throw new StoreError('실행 임대가 유효하지 않습니다.',409);
    if(sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('스냅샷 해시가 맞지 않습니다.',409);
  }finally{dbCheck.close();}
  const root=artifactRoot();const staging=path.join(root,'staging',randomUUID());const final=path.join(root,id,`attempt-${item.attempt}`);
  let published=false;
  try{
    mkdirSync(staging,{recursive:true});
    const plan=validatePlan(snapshot);
    const req={...requirementsExport(plan),productionAuthority:false as const};
    const files:{name:ArtifactName;bytes:Buffer}[]=[
      {name:'plan.json',bytes:Buffer.from(JSON.stringify(plan,null,2)+'\n')},
      {name:'scenes.csv',bytes:Buffer.from('\uFEFF'+planCsv(plan))},
      {name:'source-requirements.json',bytes:Buffer.from(JSON.stringify(req,null,2)+'\n')},
    ];
    const manifest={schemaVersion:'visualmaker-planning-package-v1',jobSchemaVersion:JOB_SCHEMA_VERSION,projectId:item.project_id,revision:item.requested_revision,snapshotSha256:item.snapshot_sha256,productionAuthority:false,artifacts:files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:sha(file.bytes)}))};
    files.push({name:'package.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
    for(const file of files)writeFileSync(path.join(staging,file.name),file.bytes,{flag:'wx'});
    const db=dbOpen();try{transaction(db,()=>{
      const current=row(db,id);
      if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt)throw new StoreError('작업이 취소되거나 실행 권한이 만료됐습니다.',409);
      mkdirSync(path.dirname(final),{recursive:true});renameSync(staging,final);published=true;
      for(const file of files)db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,file.name,`jobs/${id}/attempt-${item.attempt}/${file.name}`,file.bytes.length,sha(file.bytes));
      const timestamp=now();
      const changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      if(changed.changes!==1)throw new StoreError('작업이 취소됐습니다.',409);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    });}finally{db.close();}
  }catch(error){if(published)rmSync(final,{recursive:true,force:true});failClaim(id,token,error);if(!(error instanceof StoreError&&error.status===409))throw error;
  }finally{rmSync(staging,{recursive:true,force:true});}
  return getJob(id);
}

export function runJob(id:string):Job {const claim=claimJob(id);return executeClaim(id,claim.token,claim.snapshot);}
