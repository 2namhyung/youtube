import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, rmdirSync, statfsSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {planCsv, requirementsExport, validatePlan} from './director.ts';
import {dataRoot, openDb, StoreError, verifyAssets} from './store.ts';
import type {Plan} from './model.ts';
import {DIAGNOSTIC_FILES} from '../renderer/contract.ts';
import type {DiagnosticReceipt} from '../renderer/contract.ts';
import {authorityFingerprintsStillMatch,currentPlanForCanonical,evaluateCanonicalCut,safeCanonicalFile} from './canonical-cut-render.ts';
import type {CanonicalReport} from './canonical-cut-render.ts';
import type {CanonicalExecutionContract,CanonicalReceipt} from '../renderer/canonical-contract.ts';
import {copyEpisodeInputs,EPISODE_OUTPUT_LIMIT,episodeFingerprintsStillMatch,evaluateEpisodeProvisional,streamedFdFingerprint,streamedFileFingerprint,verifyEpisodeCopiedInputs} from './episode-provisional.ts';
import type {EpisodeReport} from './episode-provisional.ts';
import type {EpisodeExecutionContract,EpisodeReceipt} from '../renderer/episode-contract.ts';
import {audioAssemblyFingerprintsStillMatch,evaluateAudioAssembly} from './audio-assembly.ts';
import type {AudioAssemblyReport} from './audio-assembly.ts';
import type {AudioAssemblyExecutionContract,AudioAssemblyReceipt} from '../renderer/audio-assembly-contract.ts';
import {captureAudioAuthoritySnapshot,currentPictureStage,parsePostLockJson,POST_LOCK_SPEC,POST_LOCK_STATE,readPostLockAddendum,readPostLockFile,safeEpisodePath,unchangedAudioFingerprints,validateAudioAuthoritySnapshot,validatePostLockTransition,verifyPostLockMarkers} from './post-lock-transition.ts';
import {evaluateFinalization,finalizationFingerprintsStillMatch} from './finalization.ts';
import {validateFinalizationMixTechnical} from './finalization-mix.ts';
import {FINALIZATION_FILES} from '../renderer/finalization-contract.ts';
import type {FinalizationExecutionContract,FinalizationJobReceipt,FinalizationReport,FinalizationResult} from '../renderer/finalization-contract.ts';
import {ensureAIAnalysisSchema} from './ai-analysis-schema.ts';

export const JOB_SCHEMA_VERSION = 'visualmaker-job-v1' as const;
export type JobKind = 'planning-package' | 'render-preview' | 'renderer-diagnostic' | 'canonical-cut-preview' | 'episode-provisional-video' | 'audio-timed-assembly' | 'episode-finalization-export' | 'ai-script-analysis';
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked' | 'needs-review';
export type ArtifactName = 'plan.json' | 'scenes.csv' | 'source-requirements.json' | 'package.json' | 'diagnostic.mp4' | 'diagnostic.json' | 'provisional-cut.mp4' | 'provisional-cut.json' | 'provisional-episode.mp4' | 'provisional-episode.json' | 'provisional-voiced-episode.mp4' | 'provisional-voiced-episode.json' | 'ai-analysis-proposal.json' | typeof FINALIZATION_FILES[number];
export type JobArtifact = {name:ArtifactName; path:string; bytes:number; sha256:string; productionAuthority:false};
export type JobAttempt = {attempt:number; startedAt:string; endedAt:string|null; outcome:string|null; reason:string|null};
export type Job = {schemaVersion:typeof JOB_SCHEMA_VERSION; id:string; projectId:string; kind:JobKind; status:JobState; requestedRevision:number; snapshotSha256:string; sceneId:string|null; executionContractSha256:string|null; productionAuthority:false; progress:number; attempt:number; createdAt:string; updatedAt:string; startedAt:string|null; finishedAt:string|null; error:string|null; blocker:string|null; recoveryReason:string|null; leaseExpiresAt:string|null; artifacts:JobArtifact[]; attempts:JobAttempt[]};

type Row = {id:string;project_id:string;kind:JobKind;status:JobState;requested_revision:number;snapshot_sha256:string;snapshot_json:string;request_sha256:string;idempotency_key:string;scene_id:string|null;execution_contract_json:string|null;execution_contract_sha256:string|null;progress:number;attempt:number;created_at:string;updated_at:string;started_at:string|null;finished_at:string|null;error:string|null;blocker:string|null;recovery_reason:string|null;lease_token:string|null;lease_expires_at:string|null};
type Db = ReturnType<typeof openDb>;
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const bounded = (value:unknown) => String(value instanceof Error ? value.message : value).slice(0,1000);
const JOB_ID = /^job_[a-f0-9-]{36}$/;
const PLANNING_FILES:ArtifactName[]=['plan.json','scenes.csv','source-requirements.json','package.json'];
const CANONICAL_FILES:ArtifactName[]=['provisional-cut.mp4','provisional-cut.json'];
const EPISODE_FILES:ArtifactName[]=['provisional-episode.mp4','provisional-episode.json'];
const AUDIO_FILES:ArtifactName[]=['provisional-voiced-episode.mp4','provisional-voiced-episode.json'];
const FINAL_FILES:ArtifactName[]=[...FINALIZATION_FILES];
const FILES:ArtifactName[]=[...PLANNING_FILES,...DIAGNOSTIC_FILES,...CANONICAL_FILES,...EPISODE_FILES,...AUDIO_FILES,...FINAL_FILES];
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
  const columns=db.prepare('PRAGMA table_info(visualmaker_jobs)').all() as Array<{name:string}>;
  for(const [name,sql] of [['scene_id','TEXT'],['execution_contract_json','TEXT'],['execution_contract_sha256','TEXT']] as const)if(!columns.some(c=>c.name===name))db.exec(`ALTER TABLE visualmaker_jobs ADD COLUMN ${name} ${sql}`);
  ensureAIAnalysisSchema(db);
  return db;
}
export function initializeJobStorage():void{const db=dbOpen();db.close();}

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
  const privateFailure=item.kind==='episode-finalization-export';const ai=item.kind==='ai-script-analysis';
  return {schemaVersion:JOB_SCHEMA_VERSION,id:item.id,projectId:item.project_id,kind:item.kind,status:item.status,requestedRevision:item.requested_revision,snapshotSha256:item.snapshot_sha256,sceneId:item.scene_id,executionContractSha256:item.execution_contract_sha256,productionAuthority:false,progress:item.progress,attempt:item.attempt,createdAt:item.created_at,updatedAt:item.updated_at,startedAt:item.started_at,finishedAt:item.finished_at,error:ai&&item.error?'AI 분석 작업이 중단됐습니다. 상태를 확인하세요.':privateFailure&&item.error?'최종화 작업이 실패했습니다. 승인과 입력을 다시 확인하세요.':item.error,blocker:ai&&item.blocker?'AI 분석 입력을 확인하세요.':privateFailure&&item.blocker?'최종화 승인 또는 제작 입력이 준비되지 않았습니다.':item.blocker,recoveryReason:ai&&item.recovery_reason?'외부 호출 결과를 확인해야 합니다.':privateFailure&&item.recovery_reason?'최종화 작업이 중단됐습니다. 재시도할 수 있습니다.':item.recovery_reason,leaseExpiresAt:item.lease_expires_at,artifacts:artifacts.map(a=>({...a,productionAuthority:false})),attempts:ai?attempts.map(attempt=>({...attempt,reason:attempt.reason?'AI 분석 시도가 종료됐습니다.':null})):privateFailure?attempts.map(attempt=>({...attempt,reason:attempt.reason?'최종화 시도가 실패하거나 중단됐습니다.':null})):attempts};
}

export function enqueueJob(projectId:string,baseRevision:number,kind:JobKind,idempotencyKey:string):Job {
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId))throw new StoreError('프로젝트 ID가 올바르지 않습니다.');
  if(!Number.isSafeInteger(baseRevision)||baseRevision<1)throw new StoreError('리비전이 올바르지 않습니다.');
  if(kind!=='planning-package'&&kind!=='render-preview'&&kind!=='renderer-diagnostic')throw new StoreError('지원하지 않는 작업 종류입니다.');
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
    if(kind==='planning-package')verifyAssets(plan);
    const snapshot=JSON.stringify(plan);
    const timestamp=now();const id=`job_${randomUUID()}`;const blocked=kind==='render-preview';
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,kind,blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,0,0,timestamp,timestamp,blocked?timestamp:null,blocked?BLOCKER:null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export async function enqueueCanonicalJob(projectId:string,baseRevision:number,sceneId:string,idempotencyKey:string):Promise<Job>{
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1||!/^scene[-_][A-Za-z0-9_-]{1,100}$/.test(sceneId)||!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))throw new StoreError('컷 렌더 요청 범위가 올바르지 않습니다.');
  const requestSha=sha(JSON.stringify([projectId,baseRevision,'canonical-cut-preview',sceneId]));
  // Replay does not adopt later Plan edits or authority inputs.
  const priorDb=dbOpen();try{
    const previous=priorDb.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(priorDb,previous);}
  }finally{priorDb.close();}
  const plan=currentPlanForCanonical(projectId,baseRevision);
  const report=await evaluateCanonicalCut(plan,sceneId);
  const contract=buildCanonicalExecutionContract(report);
  const contractJson=JSON.stringify(contract);const snapshot=JSON.stringify(plan);
  const db=dbOpen();try{return transaction(db,()=>{
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(db,previous);}
    const current=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!current)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(current.revision!==baseRevision||sha(JSON.stringify(validatePlan(JSON.parse(current.document))))!==sha(snapshot))throw new StoreError('대본과 장면이 변경됐습니다. 최신 리비전을 불러오세요.',409);
    if(!authorityFingerprintsStillMatch(report))throw new StoreError('렌더 계약 평가 중 제작 입력이 변경됐습니다. 다시 확인하세요.',409);
    const timestamp=now();const id=`job_${randomUUID()}`;const blocked=!report.renderEligible;
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,scene_id,execution_contract_json,execution_contract_sha256,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,'canonical-cut-preview',blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,sceneId,contractJson,sha(contractJson),0,0,timestamp,timestamp,blocked?timestamp:null,blocked?report.blockers.map(b=>b.detail).join(' ').slice(0,1000):null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export async function enqueueEpisodeJob(projectId:string,baseRevision:number,idempotencyKey:string):Promise<Job>{
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1||!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))throw new StoreError('전체 에피소드 렌더 요청 범위가 올바르지 않습니다.');
  const requestSha=sha(JSON.stringify([projectId,baseRevision,'episode-provisional-video']));
  const priorDb=dbOpen();try{const previous=priorDb.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(priorDb,previous);}
  }finally{priorDb.close();}
  const plan=currentPlanForCanonical(projectId,baseRevision),report=await evaluateEpisodeProvisional(plan);
  const contract=buildEpisodeExecutionContract(report),contractJson=JSON.stringify(contract),snapshot=JSON.stringify(plan);
  const db=dbOpen();try{return transaction(db,()=>{
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(db,previous);}
    const current=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!current)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(current.revision!==baseRevision||sha(JSON.stringify(validatePlan(JSON.parse(current.document))))!==sha(snapshot))throw new StoreError('계획이 평가 중 변경됐습니다. 다시 시도하세요.',409);
    if(!episodeFingerprintsStillMatch(report))throw new StoreError('전체 영상 렌더 계약 평가 중 제작 입력이 변경됐습니다.',409);
    const timestamp=now(),id=`job_${randomUUID()}`,blocked=!report.renderEligible;
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,execution_contract_json,execution_contract_sha256,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,'episode-provisional-video',blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,contractJson,sha(contractJson),0,0,timestamp,timestamp,blocked?timestamp:null,blocked?report.blockers.map(b=>b.detail).join(' ').slice(0,1000):null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function buildEpisodeExecutionContract(report:EpisodeReport,createdAt=now()):EpisodeExecutionContract{
  return {schemaVersion:'visualmaker-episode-execution-v1',report:JSON.parse(JSON.stringify(report)) as EpisodeReport,reportSha256:sha(JSON.stringify(report)),createdAt};
}
export function episodeJobContract(id:string):EpisodeExecutionContract{
  const db=dbOpen();try{const item=row(db,id);
    if(item.kind!=='episode-provisional-video'||!item.execution_contract_json||!item.execution_contract_sha256||sha(item.execution_contract_json)!==item.execution_contract_sha256)throw new StoreError('전체 에피소드 실행 계약이 없거나 변경됐습니다.',409);
    const contract=JSON.parse(item.execution_contract_json) as EpisodeExecutionContract;
    if(contract.schemaVersion!=='visualmaker-episode-execution-v1'||contract.reportSha256!==sha(JSON.stringify(contract.report))||contract.report.scope.projectId!==item.project_id||contract.report.scope.revision!==item.requested_revision||contract.report.scope.snapshotSha256!==item.snapshot_sha256)throw new StoreError('전체 에피소드 계약 범위가 작업과 다릅니다.',409);
    return contract;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('전체 에피소드 실행 계약을 읽을 수 없습니다.',409);}finally{db.close();}
}

export function buildAudioAssemblyExecutionContract(report:AudioAssemblyReport,createdAt=now()):AudioAssemblyExecutionContract{
  return {schemaVersion:'visualmaker-audio-assembly-execution-v1',report:JSON.parse(JSON.stringify(report)) as AudioAssemblyReport,reportSha256:sha(JSON.stringify(report)),createdAt};
}
function buildCapturedAudioAssemblyContract(report:AudioAssemblyReport,createdAt=now()):AudioAssemblyExecutionContract{
  const authoritySnapshot=captureAudioAuthoritySnapshot(realpathSync(process.cwd()),report);
  const contract:AudioAssemblyExecutionContract={schemaVersion:'visualmaker-audio-assembly-execution-v2',report:JSON.parse(JSON.stringify(report)) as AudioAssemblyReport,reportSha256:sha(JSON.stringify(report)),createdAt,authoritySnapshot};
  if(Buffer.byteLength(JSON.stringify(contract))>5_000_000)throw new StoreError('오디오 권한 스냅샷을 포함한 계약 크기가 제한을 넘었습니다.',409);
  return contract;
}
export function audioAssemblyJobContract(id:string):AudioAssemblyExecutionContract{
  const db=dbOpen();try{const item=row(db,id);
    if(item.kind!=='audio-timed-assembly'||!item.execution_contract_json||!item.execution_contract_sha256||sha(item.execution_contract_json)!==item.execution_contract_sha256)throw new StoreError('오디오 조립 계약이 없거나 변경됐습니다.',409);
    const contract=parsePostLockJson(Buffer.from(item.execution_contract_json),5_000_000) as AudioAssemblyExecutionContract;
    if(!['visualmaker-audio-assembly-execution-v1','visualmaker-audio-assembly-execution-v2'].includes(contract.schemaVersion)||contract.reportSha256!==sha(JSON.stringify(contract.report))||contract.report.scope.projectId!==item.project_id||contract.report.scope.revision!==item.requested_revision||contract.report.scope.snapshotSha256!==item.snapshot_sha256)throw new StoreError('오디오 조립 계약 범위가 작업과 다릅니다.',409);
    if(contract.schemaVersion==='visualmaker-audio-assembly-execution-v2')validateAudioAuthoritySnapshot(contract.authoritySnapshot,contract.report);
    return contract;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('오디오 조립 계약을 읽을 수 없습니다.',409);}finally{db.close();}
}
export async function enqueueAudioAssemblyJob(projectId:string,baseRevision:number,idempotencyKey:string):Promise<Job>{
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1||!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))throw new StoreError('오디오 조립 요청 범위가 올바르지 않습니다.');
  const requestSha=sha(JSON.stringify([projectId,baseRevision,'audio-timed-assembly']));
  const priorDb=dbOpen();try{const previous=priorDb.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(priorDb,previous);}
  }finally{priorDb.close();}
  const plan=currentPlanForCanonical(projectId,baseRevision),report=await evaluateAudioAssembly(projectId,baseRevision);
  const contract=report.renderEligible?buildCapturedAudioAssemblyContract(report):buildAudioAssemblyExecutionContract(report),contractJson=JSON.stringify(contract),snapshot=JSON.stringify(plan);
  const db=dbOpen();try{return transaction(db,()=>{
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(db,previous);}
    const current=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!current)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(current.revision!==baseRevision||sha(JSON.stringify(validatePlan(JSON.parse(current.document))))!==sha(snapshot))throw new StoreError('계획이 평가 중 변경됐습니다.',409);
    if(!audioAssemblyFingerprintsStillMatch(report))throw new StoreError('오디오 조립 입력이 평가 중 변경됐습니다.',409);
    const timestamp=now(),id=`job_${randomUUID()}`,blocked=!report.renderEligible;
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,execution_contract_json,execution_contract_sha256,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,'audio-timed-assembly',blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,contractJson,sha(contractJson),0,0,timestamp,timestamp,blocked?timestamp:null,blocked?report.blockers.map(b=>b.detail).join(' ').slice(0,1000):null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function buildFinalizationExecutionContract(report:FinalizationReport):FinalizationExecutionContract{
  const contract:FinalizationExecutionContract={schemaVersion:report.binding?.selection.version===2?'visualmaker-finalization-execution-v2':'visualmaker-finalization-execution-v1',report:JSON.parse(JSON.stringify(report)) as FinalizationReport,reportSha256:sha(JSON.stringify(report))};
  if(Buffer.byteLength(JSON.stringify(contract))>5_000_000)throw new StoreError('최종화 계약 크기가 제한을 넘었습니다.',409);
  return contract;
}
export function finalizationJobContract(id:string):FinalizationExecutionContract{
  const db=dbOpen();try{const item=row(db,id);
    if(item.kind!=='episode-finalization-export'||!item.execution_contract_json||!item.execution_contract_sha256||sha(item.execution_contract_json)!==item.execution_contract_sha256)throw new StoreError('최종화 실행 계약이 없거나 변경됐습니다.',409);
    const contract=parsePostLockJson(Buffer.from(item.execution_contract_json),5_000_000) as FinalizationExecutionContract;
    if(!['visualmaker-finalization-execution-v1','visualmaker-finalization-execution-v2'].includes(contract.schemaVersion)||contract.schemaVersion!==(contract.report.binding?.selection.version===2?'visualmaker-finalization-execution-v2':'visualmaker-finalization-execution-v1')||contract.reportSha256!==sha(JSON.stringify(contract.report))||contract.report.scope.projectId!==item.project_id||contract.report.scope.revision!==item.requested_revision||contract.report.scope.snapshotSha256!==item.snapshot_sha256||contract.report.productionAuthority!==false||contract.report.reviewApproved!==false)throw new StoreError('최종화 계약 범위가 작업과 다릅니다.',409);
    return contract;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('최종화 실행 계약을 읽을 수 없습니다.',409);}finally{db.close();}
}
export async function enqueueFinalizationJob(projectId:string,baseRevision:number,idempotencyKey:string):Promise<Job>{
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1||!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))throw new StoreError('최종화 요청 범위가 올바르지 않습니다.');
  const requestSha=sha(JSON.stringify([projectId,baseRevision,'episode-finalization-export']));
  const priorDb=dbOpen();try{const previous=priorDb.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(priorDb,previous);}
  }finally{priorDb.close();}
  const plan=currentPlanForCanonical(projectId,baseRevision),report=await evaluateFinalization(projectId,baseRevision);
  if(report.renderEligible){const fresh=await evaluateFinalization(projectId,baseRevision);if(JSON.stringify(fresh)!==JSON.stringify(report)||!finalizationFingerprintsStillMatch(report))throw new StoreError('최종화 입력이 평가 중 변경됐습니다.',409);}
  const contract=buildFinalizationExecutionContract(report),contractJson=JSON.stringify(contract),snapshot=JSON.stringify(plan);
  const db=dbOpen();try{return transaction(db,()=>{
    const previous=db.prepare('SELECT * FROM visualmaker_jobs WHERE project_id=? AND idempotency_key=?').get(projectId,idempotencyKey) as Row|undefined;
    if(previous){if(previous.request_sha256!==requestSha)throw new StoreError('같은 요청 키가 다른 작업에 사용됐습니다.',409);return publicJob(db,previous);}
    const current=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!current||current.revision!==baseRevision||sha(current.document)!==sha(snapshot)||report.scope.snapshotSha256!==sha(snapshot))throw new StoreError('계획이 평가 중 변경됐습니다.',409);
    if(report.renderEligible&&!finalizationFingerprintsStillMatch(report))throw new StoreError('최종화 입력이 평가 중 변경됐습니다.',409);
    const timestamp=now(),id=`job_${randomUUID()}`,blocked=!report.renderEligible;
    db.prepare(`INSERT INTO visualmaker_jobs (id,project_id,kind,status,requested_revision,snapshot_sha256,snapshot_json,request_sha256,idempotency_key,execution_contract_json,execution_contract_sha256,progress,attempt,created_at,updated_at,finished_at,blocker)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,projectId,'episode-finalization-export',blocked?'blocked':'queued',baseRevision,sha(snapshot),snapshot,requestSha,idempotencyKey,contractJson,sha(contractJson),0,0,timestamp,timestamp,blocked?timestamp:null,blocked?'최종화 승인 또는 제작 입력이 준비되지 않았습니다.':null);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function buildCanonicalExecutionContract(report:CanonicalReport,createdAt=now()):CanonicalExecutionContract{
  return {schemaVersion:'visualmaker-canonical-execution-v1',report:JSON.parse(JSON.stringify(report)) as CanonicalReport,reportSha256:sha(JSON.stringify(report)),createdAt};
}

export function canonicalJobContract(id:string):CanonicalExecutionContract{
  const db=dbOpen();try{const item=row(db,id);
    if(item.kind!=='canonical-cut-preview'||!item.execution_contract_json||!item.execution_contract_sha256||sha(item.execution_contract_json)!==item.execution_contract_sha256)throw new StoreError('컷 실행 계약이 없거나 변경됐습니다.',409);
    const contract=JSON.parse(item.execution_contract_json) as CanonicalExecutionContract;
    if(contract.schemaVersion!=='visualmaker-canonical-execution-v1'||contract.reportSha256!==sha(JSON.stringify(contract.report))||contract.report.scope.projectId!==item.project_id||contract.report.scope.revision!==item.requested_revision||contract.report.scope.sceneId!==item.scene_id||contract.report.snapshotSha256!==item.snapshot_sha256)throw new StoreError('컷 실행 계약 범위가 작업과 다릅니다.',409);
    return contract;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('컷 실행 계약을 안전하게 읽을 수 없습니다.',409);}finally{db.close();}
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
    if(item.status!=='queued'||!['planning-package','renderer-diagnostic','canonical-cut-preview','episode-provisional-video','audio-timed-assembly','episode-finalization-export','ai-script-analysis'].includes(item.kind))throw new StoreError('실행할 수 있는 대기 작업이 아닙니다.',409);
    if(item.kind==='ai-script-analysis'){
      const checkpoint=db.prepare('SELECT attempt,outcome,request_sha256 FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id) as {attempt:number;outcome:string;request_sha256:string}|undefined;
      if(item.attempt!==0||!checkpoint||checkpoint.attempt!==1||checkpoint.outcome!=='not-started'||checkpoint.request_sha256!==item.request_sha256||!item.execution_contract_json||sha(item.execution_contract_json)!==item.execution_contract_sha256)throw new StoreError('AI 분석 대기 계약이 손상됐습니다.',422);
    }
    if(sha(item.snapshot_json)!==item.snapshot_sha256)throw new StoreError('작업 스냅샷이 변경됐습니다.',422);
    let snapshot:Plan;
    try{snapshot=validatePlan(JSON.parse(item.snapshot_json));}
    catch{throw new StoreError('작업 스냅샷을 읽거나 검증할 수 없습니다.',422);}
    const timestamp=now();const lease=new Date(Date.now()+5*60_000).toISOString();const token=randomUUID();const attempt=item.attempt+1;
    const changed=db.prepare("UPDATE visualmaker_jobs SET status='running',attempt=?,progress=5,updated_at=?,started_at=?,finished_at=NULL,error=NULL,recovery_reason=NULL,lease_token=?,lease_expires_at=? WHERE id=? AND status='queued'").run(attempt,timestamp,timestamp,token,lease,id);
    if(changed.changes!==1)throw new StoreError('다른 실행자가 작업을 시작했습니다.',409);
    db.prepare('INSERT INTO visualmaker_job_attempts(job_id,attempt,started_at) VALUES(?,?,?)').run(id,attempt,timestamp);
    return {job:publicJob(db,row(db,id)),token,snapshot};
  });}finally{db.close();}
}

export function nextQueuedJobId():string|null {
  const db=dbOpen();try{
    const item=db.prepare("SELECT id FROM visualmaker_jobs WHERE status='queued' AND kind IN ('planning-package','renderer-diagnostic','canonical-cut-preview','episode-provisional-video','audio-timed-assembly','episode-finalization-export','ai-script-analysis') ORDER BY created_at,id LIMIT 1").get() as {id:string}|undefined;
    return item?.id??null;
  }finally{db.close();}
}

export function failUnclaimableJob(id:string,error:unknown):{job:Job;changed:boolean} {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.status!=='queued')return {job:publicJob(db,item),changed:false};
    const timestamp=now();const reason=item.kind==='ai-script-analysis'?'AI 분석 작업을 시작할 수 없습니다.':bounded(error);
    if(item.kind==='ai-script-analysis'){
      const checkpoint=db.prepare('SELECT outcome FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id) as {outcome:string}|undefined;
      const ambiguous=checkpoint?.outcome==='started'||checkpoint?.outcome==='succeeded'||checkpoint?.outcome==='needs-review';
      if(checkpoint?.outcome==='not-started')db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='failed-before-call',error_code='internal' WHERE job_id=? AND outcome='not-started'").run(id);
      else if(checkpoint?.outcome==='started')db.prepare("UPDATE visualmaker_ai_analysis_attempts SET outcome='needs-review',error_code='internal' WHERE job_id=? AND outcome='started'").run(id);
      const changed=db.prepare("UPDATE visualmaker_jobs SET status=?,updated_at=?,finished_at=?,error=? WHERE id=? AND status='queued'").run(ambiguous?'needs-review':'failed',timestamp,timestamp,ambiguous?'외부 AI 호출 결과를 확인해야 합니다.':reason,id).changes===1;
      return {job:publicJob(db,row(db,id)),changed};
    }
    const changed=db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error=? WHERE id=? AND status='queued'").run(timestamp,timestamp,reason,id).changes===1;
    return {job:publicJob(db,row(db,id)),changed};
  });}finally{db.close();}
}

export function renewClaim(id:string,token:string,progress:number):Job {
  if(!Number.isInteger(progress)||progress<5||progress>99)throw new StoreError('진행률이 올바르지 않습니다.');
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);const timestamp=now();
    if(item.status!=='running'||item.lease_token!==token||!item.lease_expires_at||item.lease_expires_at<=timestamp)throw new StoreError('실행 임대가 유효하지 않습니다.',409);
    const lease=new Date(Date.now()+5*60_000).toISOString();
    const result=db.prepare("UPDATE visualmaker_jobs SET progress=?,updated_at=?,lease_expires_at=? WHERE id=? AND status='running' AND lease_token=? AND lease_expires_at>?").run(progress,timestamp,lease,id,token,timestamp);
    if(result.changes!==1)throw new StoreError('실행 임대가 유효하지 않습니다.',409);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function cancelJob(id:string):Job {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(item.status!=='queued'&&item.status!=='running')throw new StoreError('취소할 수 있는 작업이 아닙니다.',409);
    const timestamp=now();
    if(item.kind==='ai-script-analysis'){
      const checkpoint=db.prepare('SELECT outcome FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id) as {outcome:string}|undefined;
      if(!checkpoint||!['not-started','started'].includes(checkpoint.outcome))throw new StoreError('AI 분석 호출 상태를 확인할 수 없습니다.',409);
      const afterCall=checkpoint.outcome==='started';
      db.prepare('UPDATE visualmaker_ai_analysis_attempts SET outcome=?,error_code=? WHERE job_id=? AND outcome=?').run(afterCall?'needs-review':'cancelled-before-call','cancelled',id,checkpoint.outcome);
      db.prepare("UPDATE visualmaker_jobs SET status=?,updated_at=?,finished_at=?,error=?,recovery_reason=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status IN ('queued','running')").run(afterCall?'needs-review':'cancelled',timestamp,timestamp,afterCall?'외부 호출 결과를 확인해야 합니다.':null,afterCall?'외부 호출 결과를 확인해야 합니다.':null,id);
      if(item.status==='running')db.prepare('UPDATE visualmaker_job_attempts SET ended_at=?,outcome=?,reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL').run(timestamp,afterCall?'needs-review':'cancelled',afterCall?'외부 호출 결과를 확인해야 합니다.':null,id,item.attempt);
      return publicJob(db,row(db,id));
    }
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
    if(item.kind==='ai-script-analysis'){
      const checkpoint=db.prepare('SELECT outcome FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(id) as {outcome:string}|undefined;
      if(!checkpoint||!['not-started','started'].includes(checkpoint.outcome))throw new StoreError('AI 분석 호출 상태를 확인할 수 없습니다.',409);
      const afterCall=checkpoint.outcome==='started',timestamp=now();
      db.prepare('UPDATE visualmaker_ai_analysis_attempts SET outcome=?,error_code=? WHERE job_id=? AND outcome=?').run(afterCall?'needs-review':'failed-before-call','lease',id,checkpoint.outcome);
      const reason=afterCall?'외부 호출 결과를 확인해야 합니다.':'외부 호출 전에 실행 임대가 만료됐습니다.';
      db.prepare("UPDATE visualmaker_jobs SET status=?,updated_at=?,finished_at=?,error=?,recovery_reason=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(afterCall?'needs-review':'failed',timestamp,timestamp,reason,reason,id,item.lease_token);
      db.prepare('UPDATE visualmaker_job_attempts SET ended_at=?,outcome=?,reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL').run(timestamp,afterCall?'needs-review':'failed',reason,id,item.attempt);
      return publicJob(db,row(db,id));
    }
    const timestamp=now();const reason='실행 임대가 만료돼 중단된 작업입니다. 재시도할 수 있습니다.';
    db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error=?,recovery_reason=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,reason,reason,id,item.lease_token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='failed',reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,reason,id,item.attempt);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

export function retryJob(id:string):Job {
  const db=dbOpen();try{return transaction(db,()=>{
    const item=row(db,id);
    if(!['planning-package','renderer-diagnostic','canonical-cut-preview','episode-provisional-video','audio-timed-assembly','episode-finalization-export'].includes(item.kind)||(item.status!=='failed'&&item.status!=='cancelled'))throw new StoreError('재시도할 수 있는 종료 작업이 아닙니다.',409);
    const timestamp=now();
    db.prepare("UPDATE visualmaker_jobs SET status='queued',progress=0,updated_at=?,started_at=NULL,finished_at=NULL,error=NULL,blocker=NULL,recovery_reason=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status IN ('failed','cancelled')").run(timestamp,id);
    return publicJob(db,row(db,id));
  });}finally{db.close();}
}

function failClaim(id:string,token:string,error:unknown):void {
  const db=dbOpen();try{transaction(db,()=>{
    const item=row(db,id);if(item.status!=='running'||item.lease_token!==token||!item.lease_expires_at||item.lease_expires_at<=now())return;
    const timestamp=now();const reason=bounded(error);
    db.prepare("UPDATE visualmaker_jobs SET status='failed',updated_at=?,finished_at=?,error=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,reason,id,token);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='failed',reason=? WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,reason,id,item.attempt);
  });}finally{db.close();}
}

function artifactRoot():string {const root=path.join(dataRoot(),'jobs');mkdirSync(root,{recursive:true});return root;}
function boundedDiagnosticRead(file:string,name:ArtifactName,recordedBytes:number):Buffer {
  const limit=name==='diagnostic.mp4'?40_000_000:100_000;
  if(!Number.isSafeInteger(recordedBytes)||recordedBytes<1||recordedBytes>limit)throw new StoreError('진단 파일 크기가 허용 범위를 벗어났습니다.',409);
  const fd=openSync(file,'r');
  try{
    const size=fstatSync(fd).size;
    if(size!==recordedBytes||size>limit)throw new StoreError('진단 파일 크기가 기록과 다릅니다.',409);
    const buffer=Buffer.allocUnsafe(size+1);let used=0;
    while(used<buffer.length){const count=readSync(fd,buffer,used,buffer.length-used,null);if(count===0)break;used+=count;}
    if(used!==size||fstatSync(fd).size!==size)throw new StoreError('진단 파일이 읽는 중 변경됐습니다.',409);
    return buffer.subarray(0,used);
  }finally{closeSync(fd);}
}
export function artifactFile(id:string,name:ArtifactName):{artifact:JobArtifact;bytes:Buffer} {
  if(!JOB_ID.test(id)||!FILES.includes(name))throw new StoreError('아티팩트 경로가 올바르지 않습니다.');
  const db=dbOpen();try{
    const item=row(db,id);
    if(item.status!=='succeeded')throw new StoreError('완료된 작업의 파일만 받을 수 있습니다.',409);
    if(!(item.kind==='planning-package'?PLANNING_FILES: item.kind==='renderer-diagnostic'?[...DIAGNOSTIC_FILES] as ArtifactName[]:[]).includes(name))throw new StoreError('이 작업 종류의 파일이 아닙니다.',404);
    const record=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? AND name=?').get(id,name) as Omit<JobArtifact,'productionAuthority'>|undefined;
    if(!record||!new RegExp(`^jobs/${id}/attempt-[1-9][0-9]*/${name.replace('.','\\.')}$`).test(record.path))throw new StoreError('파일 기록이 올바르지 않습니다.',404);
    const root=realpathSync(dataRoot());const absolute=realpathSync(path.resolve(root,record.path));
    if(!absolute.startsWith(root+path.sep))throw new StoreError('파일 경로가 작업 저장소를 벗어났습니다.',403);
    const bytes=item.kind==='renderer-diagnostic'?boundedDiagnosticRead(absolute,name,record.bytes):readFileSync(absolute);
    if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw new StoreError('완료 파일의 해시가 변경됐습니다.',409);
    if(item.kind==='renderer-diagnostic'){
      const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
      if(records.length!==2||records.map(r=>r.name).join(',')!==[...DIAGNOSTIC_FILES].sort().join(','))throw new StoreError('진단 파일 목록이 변경됐습니다.',409);
      const pair=records.map(r=>{
        if(r.path!==`jobs/${id}/attempt-${item.attempt}/${r.name}`)throw new StoreError('진단 파일 경로가 변경됐습니다.',409);
        const p=realpathSync(path.resolve(root,r.path));if(!p.startsWith(root+path.sep))throw new StoreError('진단 파일이 저장소를 벗어났습니다.',403);
        const b=r.name===name?bytes:boundedDiagnosticRead(p,r.name,r.bytes);if(b.length!==r.bytes||sha(b)!==r.sha256)throw new StoreError('진단 파일 해시가 변경됐습니다.',409);
        return {name:r.name,bytes:b};
      });
      let receipt:DiagnosticReceipt;
      try{receipt=JSON.parse(pair.find(r=>r.name==='diagnostic.json')!.bytes.toString('utf8')) as DiagnosticReceipt;}catch{throw new StoreError('진단 기록을 읽을 수 없습니다.',409);}
      const mp4=pair.find(r=>r.name==='diagnostic.mp4')!;
      if(receipt.schemaVersion!=='visualmaker-renderer-diagnostic-v1'||receipt.artifactKind!=='renderer-diagnostic'||receipt.purpose!=='engine-execution-check'||receipt.reviewProfile!=='remotion-motion'||receipt.reviewScope!=='engine-diagnostic-only'||receipt.productionAuthority!==false||receipt.cutPreview!==false||receipt.eligibleForCutReview!==false||receipt.grammarApproved!==false||receipt.playableParity!==false||!Array.isArray(receipt.sourceAssetIds)||receipt.sourceAssetIds.length!==0||!Array.isArray(receipt.episodeIds)||receipt.episodeIds.length!==0||receipt.jobId!==id||receipt.projectId!==item.project_id||receipt.requestedRevision!==item.requested_revision||receipt.snapshotSha256!==item.snapshot_sha256||receipt.output?.name!=='diagnostic.mp4'||receipt.output.sha256!==sha(mp4.bytes)||receipt.output.bytes!==mp4.bytes.length)throw new StoreError('진단 기록이 작업 또는 영상과 다릅니다.',409);
      const projectRoot=realpathSync(process.cwd());
      const entry=realpathSync(path.join(projectRoot,'visualmaker','renderer','diagnostic.tsx'));
      const runner=realpathSync(path.join(projectRoot,'visualmaker','renderer','runner.ts'));
      const contract=realpathSync(path.join(projectRoot,'visualmaker','renderer','contract.ts'));
      if(!entry.startsWith(projectRoot+path.sep)||!runner.startsWith(projectRoot+path.sep)||!contract.startsWith(projectRoot+path.sep)||receipt.entrySha256!==sha(readFileSync(entry))||receipt.runnerSha256!==sha(readFileSync(runner))||receipt.contractSha256!==sha(readFileSync(contract)))throw new StoreError('진단 runtime이 실행 당시와 달라졌습니다.',409);
    }
    return {artifact:{...record,productionAuthority:false},bytes};
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('완료 파일을 안전하게 확인할 수 없습니다.',409);}finally{db.close();}
}

export async function canonicalArtifactFile(id:string,name:'provisional-cut.mp4'|'provisional-cut.json',scope:{projectId:string;sceneId:string;attempt:number}):Promise<{job:Job;artifact:JobArtifact;bytes:Buffer}>{
  const db=dbOpen();try{
    const item=row(db,id);
    if(item.kind!=='canonical-cut-preview'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.scene_id!==scope.sceneId||item.attempt!==scope.attempt)throw new StoreError('현재 컷 작업 범위 또는 완료 상태가 일치하지 않습니다.',409);
    const contract=canonicalJobContract(id);await revalidateCanonical(id,validatePlan(JSON.parse(item.snapshot_json)),contract);
    const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
    if(records.length!==2||records.map(r=>r.name).join(',')!==[...CANONICAL_FILES].sort().join(','))throw new StoreError('컷 결과 목록이 변경됐습니다.',409);
    const root=realpathSync(dataRoot());const files=records.map(record=>{
      if(record.path!==`jobs/${id}/attempt-${item.attempt}/${record.name}`)throw new StoreError('컷 결과 경로가 변경됐습니다.',409);
      const absolute=realpathSync(path.resolve(root,record.path));if(!absolute.startsWith(root+path.sep))throw new StoreError('컷 결과가 저장소 밖을 가리킵니다.',403);
      const bytes=boundedCanonicalRead(absolute,record.bytes,record.name==='provisional-cut.mp4'?400_000_000:1_000_000);
      if(sha(bytes)!==record.sha256)throw new StoreError('컷 결과 해시가 변경됐습니다.',409);
      return {record,bytes};
    });
    const receiptFile=files.find(f=>f.record.name==='provisional-cut.json')!;const mp4=files.find(f=>f.record.name==='provisional-cut.mp4')!;
    let receipt:CanonicalReceipt;try{receipt=JSON.parse(receiptFile.bytes.toString('utf8')) as CanonicalReceipt;}catch{throw new StoreError('컷 결과 기록을 읽을 수 없습니다.',409);}
    const composition=contract.report.composition;const measured=receipt.measured;
    if(receipt.schemaVersion!=='visualmaker-canonical-cut-receipt-v1'||receipt.artifactKind!=='canonical-cut-preview'||receipt.episodeId!=='episode-001'||receipt.jobId!==id||receipt.attempt!==item.attempt||receipt.projectId!==item.project_id||receipt.requestedRevision!==item.requested_revision||receipt.sceneId!==item.scene_id||receipt.cutId!==contract.report.scope.cutId||receipt.snapshotSha256!==item.snapshot_sha256||receipt.executionContractSha256!==item.execution_contract_sha256||JSON.stringify(receipt.composition)!==JSON.stringify(composition)||JSON.stringify(receipt.inputs)!==JSON.stringify(contract.report.inputs)||JSON.stringify(receipt.authorityFingerprints)!==JSON.stringify(contract.report.fingerprints)||JSON.stringify(receipt.dependencyCutIds)!==JSON.stringify(contract.report.dependencyCutIds)||JSON.stringify(receipt.boundaryIds)!==JSON.stringify(contract.report.boundaryIds)||receipt.rendererVersion!=='4.0.516'||receipt.reviewProfile!==canonicalProfile(composition?.mode??'')||receipt.productionAuthority!==false||receipt.cutPass!==false||receipt.stylePass!==false||receipt.playableParity!==false||receipt.output.name!=='provisional-cut.mp4'||receipt.output.bytes!==mp4.bytes.length||receipt.output.sha256!==sha(mp4.bytes)||!composition||measured?.width!==composition.width||measured.height!==composition.height||measured.fps!==composition.fps||measured.frames!==composition.durationFrames||measured.codec!=='h264'||measured.audioStreams!==0||!Number.isFinite(measured.durationSeconds)||Math.abs(measured.durationSeconds-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps)||!Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||measured.frameSha256.some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw new StoreError('컷 결과 기록이 실행 계약 또는 영상과 다릅니다.',409);
    const selected=files.find(f=>f.record.name===name)!;
    return {job:publicJob(db,item),artifact:{...selected.record,productionAuthority:false},bytes:selected.bytes};
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('컷 결과를 안전하게 확인할 수 없습니다.',409);}finally{db.close();}
}

export async function episodeArtifactFile(id:string,scope:{projectId:string;baseRevision:number;attempt:number}):Promise<{job:Job;receipt:EpisodeReceipt;mp4:{fd:number;bytes:number;sha256:string;identity:{size:number;mtimeMs:number;ino:number}};receiptBytes:Buffer}>{
  const db=dbOpen();let verifiedFd:number|undefined;try{
    const item=row(db,id);
    if(item.kind!=='episode-provisional-video'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.attempt!==scope.attempt||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('전체 영상 작업 범위 또는 완료 상태가 일치하지 않습니다.',409);
    const contract=episodeJobContract(id);await revalidateEpisode(id,validatePlan(JSON.parse(item.snapshot_json)),contract);
    const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
    if(records.length!==2||records.map(r=>r.name).join(',')!==[...EPISODE_FILES].sort().join(','))throw new StoreError('전체 영상 결과 목록이 변경됐습니다.',409);
    const root=realpathSync(dataRoot());for(const record of records){if(record.path!==`jobs/${id}/attempt-${item.attempt}/${record.name}`)throw new StoreError('전체 영상 결과 경로가 변경됐습니다.',409);}
    const rec=records.find(r=>r.name==='provisional-episode.json')!,video=records.find(r=>r.name==='provisional-episode.mp4')!;
    const recPath=path.resolve(root,rec.path),videoPath=path.resolve(root,video.path);
    if(!recPath.startsWith(root+path.sep)||!videoPath.startsWith(root+path.sep)||realpathSync(recPath)!==recPath||realpathSync(videoPath)!==videoPath)throw new StoreError('전체 영상 결과가 저장소 밖을 가리킵니다.',403);
    const receiptBytes=boundedCanonicalRead(recPath,rec.bytes,2_000_000);if(sha(receiptBytes)!==rec.sha256)throw new StoreError('전체 영상 결과 기록이 변경됐습니다.',409);
    verifiedFd=openSync(videoPath,'r');const current=streamedFdFingerprint(verifiedFd,EPISODE_OUTPUT_LIMIT);if(current.bytes!==video.bytes||current.sha256!==video.sha256)throw new StoreError('전체 영상 파일이 변경됐습니다.',409);
    let receipt:EpisodeReceipt;try{receipt=JSON.parse(receiptBytes.toString('utf8')) as EpisodeReceipt;}catch{throw new StoreError('전체 영상 결과 기록을 읽을 수 없습니다.',409);}
    const expected=contract.report.composition,measured=receipt.measured;
    if(receipt.schemaVersion!=='visualmaker-provisional-episode-receipt-v1'||receipt.artifactKind!=='episode-provisional-video'||receipt.episodeId!=='episode-001'||receipt.jobId!==id||receipt.attempt!==item.attempt||receipt.projectId!==item.project_id||receipt.requestedRevision!==item.requested_revision||receipt.snapshotSha256!==item.snapshot_sha256||receipt.executionContractSha256!==item.execution_contract_sha256||JSON.stringify(receipt.composition)!==JSON.stringify(expected)||JSON.stringify(receipt.cuts)!==JSON.stringify(contract.report.cuts)||JSON.stringify(receipt.boundaries)!==JSON.stringify(contract.report.boundaries)||JSON.stringify(receipt.inputs)!==JSON.stringify(contract.report.inputs)||JSON.stringify(receipt.authorityFingerprints)!==JSON.stringify(contract.report.fingerprints)||receipt.rendererVersion!=='4.0.516'||receipt.reviewProfile!=='remotion-motion'||receipt.productionAuthority!==false||receipt.reviewApproved!==false||receipt.audioSynchronized!==false||receipt.output?.name!=='provisional-episode.mp4'||receipt.output.bytes!==video.bytes||receipt.output.sha256!==video.sha256||!expected||measured?.width!==expected.width||measured.height!==expected.height||measured.fps!==expected.fps||measured.frames!==expected.durationFrames||measured.codec!=='h264'||measured.audioStreams!==0||!Number.isFinite(measured.durationSeconds)||Math.abs(measured.durationSeconds-expected.durationFrames/expected.fps)>Math.max(.12,2/expected.fps)||!Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||measured.frameSha256.some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw new StoreError('전체 영상 결과가 실행 계약과 다릅니다.',409);
    const result={job:publicJob(db,item),receipt,mp4:{fd:verifiedFd,bytes:video.bytes,sha256:video.sha256,identity:current.identity},receiptBytes};verifiedFd=undefined;return result;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('전체 영상을 안전하게 확인할 수 없습니다.',409);}finally{if(verifiedFd!==undefined)closeSync(verifiedFd);db.close();}
}

export async function audioAssemblyArtifactFile(id:string,scope:{projectId:string;baseRevision:number;attempt:number}):Promise<{job:Job;receipt:AudioAssemblyReceipt;mp4:{fd:number;bytes:number;sha256:string;identity:{size:number;mtimeMs:number;ino:number}};receiptBytes:Buffer}>{
  const db=dbOpen();try{
    const item=row(db,id);
    if(item.kind!=='audio-timed-assembly'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.attempt!==scope.attempt||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('오디오 조립 작업 범위 또는 완료 상태가 일치하지 않습니다.',409);
    const contract=audioAssemblyJobContract(id);await revalidateAudioAssembly(id,validatePlan(JSON.parse(item.snapshot_json)),contract);
  }finally{db.close();}
  return readVerifiedAudioAssemblyArtifact(id,scope);
}

// Private byte reader. Both public entrypoints must apply their mandatory authority gate.
function readAudioAssemblyBytes(id:string,scope:{projectId:string;baseRevision:number;attempt:number}):{job:Job;receipt:AudioAssemblyReceipt;mp4:{fd:number;bytes:number;sha256:string;identity:{size:number;mtimeMs:number;ino:number}};receiptBytes:Buffer}{
  const db=dbOpen();let verifiedFd:number|undefined;try{
    const item=row(db,id);
    if(item.kind!=='audio-timed-assembly'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.attempt!==scope.attempt||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('오디오 조립 작업 범위 또는 완료 상태가 일치하지 않습니다.',409);
    const contract=audioAssemblyJobContract(id);
    const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
    if(records.length!==2||records.map(record=>record.name).join(',')!==[...AUDIO_FILES].sort().join(','))throw new StoreError('오디오 조립 결과 목록이 변경됐습니다.',409);
    const root=realpathSync(dataRoot());for(const record of records)if(record.path!==`jobs/${id}/attempt-${item.attempt}/${record.name}`)throw new StoreError('오디오 조립 결과 경로가 변경됐습니다.',409);
    const rec=records.find(record=>record.name==='provisional-voiced-episode.json')!,video=records.find(record=>record.name==='provisional-voiced-episode.mp4')!;
    const recPath=path.resolve(root,rec.path),videoPath=path.resolve(root,video.path);
    if(!recPath.startsWith(root+path.sep)||!videoPath.startsWith(root+path.sep)||realpathSync(recPath)!==recPath||realpathSync(videoPath)!==videoPath)throw new StoreError('오디오 조립 결과가 저장소 밖을 가리킵니다.',403);
    const receiptBytes=boundedCanonicalRead(recPath,rec.bytes,3_000_000);if(sha(receiptBytes)!==rec.sha256)throw new StoreError('오디오 조립 기록이 변경됐습니다.',409);
    verifiedFd=openSync(videoPath,'r');const current=streamedFdFingerprint(verifiedFd,EPISODE_OUTPUT_LIMIT);if(current.bytes!==video.bytes||current.sha256!==video.sha256)throw new StoreError('오디오 조립 영상이 변경됐습니다.',409);
    let receipt:AudioAssemblyReceipt;try{receipt=JSON.parse(receiptBytes.toString('utf8')) as AudioAssemblyReceipt;}catch{throw new StoreError('오디오 조립 기록을 읽을 수 없습니다.',409);}
    const expected=contract.report.composition,measured=receipt.measured;
    if(!Array.isArray(receipt.voices)||!Array.isArray(measured?.voiceWindowActivity)||measured.voiceWindowActivity.length!==contract.report.voices.length||measured.voiceWindowActivity.some((window,index)=>window.cutId!==contract.report.voices[index].cutId||!Number.isSafeInteger(window.startSample)||!Number.isSafeInteger(window.endSample)||window.endSample<=window.startSample||!Number.isSafeInteger(window.audibleSamples)||window.audibleSamples<1||window.audibleSamples>window.endSample-window.startSample))throw new StoreError('오디오 조립의 실제 컷별 발화 측정 기록이 올바르지 않습니다.',409);
    if(receipt.schemaVersion!=='visualmaker-audio-assembly-receipt-v1'||receipt.artifactKind!=='audio-timed-assembly'||receipt.episodeId!=='episode-001'||receipt.jobId!==id||receipt.attempt!==item.attempt||receipt.projectId!==item.project_id||receipt.requestedRevision!==item.requested_revision||receipt.snapshotSha256!==item.snapshot_sha256||receipt.executionContractSha256!==item.execution_contract_sha256||JSON.stringify(receipt.composition)!==JSON.stringify(expected)||JSON.stringify(receipt.visualInputs)!==JSON.stringify(contract.report.visual.inputs)||JSON.stringify(receipt.authorityFingerprints)!==JSON.stringify(contract.report.visual.fingerprints)||JSON.stringify(receipt.audioFingerprints)!==JSON.stringify(contract.report.fingerprints)||receipt.voices.length!==contract.report.voices.length||receipt.voices.some((voice,index)=>JSON.stringify(Object.fromEntries(Object.keys(contract.report.voices[index]).map(key=>[key,(voice as unknown as Record<string,unknown>)[key]])))!==JSON.stringify(contract.report.voices[index]))||receipt.rendererVersion!=='4.0.516'||!receipt.ffmpegVersion.startsWith('ffmpeg version ')||receipt.reviewProfile!=='remotion-motion'||receipt.productionAuthority!==false||receipt.reviewApproved!==false||receipt.technicalAudioAligned!==true||receipt.output?.name!=='provisional-voiced-episode.mp4'||receipt.output.bytes!==video.bytes||receipt.output.sha256!==video.sha256||!expected||measured?.width!==expected.width||measured.height!==expected.height||measured.fps!==expected.fps||measured.frames!==expected.durationFrames||measured.videoCodec!=='h264'||measured.audioCodec!=='aac'||measured.audioStreams!==1||measured.audioSampleRate!==48000||measured.audioChannels!==2||measured.decodedAudioNonzero!==true||!Number.isSafeInteger(measured.decodedAudioSamples)||measured.decodedAudioSamples<1||!Number.isSafeInteger(measured.firstAudibleSample)||measured.firstAudibleSample<0||!/^[a-f0-9]{64}$/u.test(measured.videoPacketSha256)||!Number.isFinite(measured.durationSeconds)||Math.abs(measured.durationSeconds-expected.durationFrames/expected.fps)>Math.max(.12,2/expected.fps)||!Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||JSON.stringify(measured.frameSha256)!==JSON.stringify(receipt.visual.frameSha256))throw new StoreError('오디오 조립 기록이 실행 계약 또는 영상과 다릅니다.',409);
    const project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(item.project_id) as {revision:number;document:string}|undefined;
    if(!project||project.revision!==item.requested_revision||sha(project.document)!==item.snapshot_sha256)throw new StoreError('오디오 조립 원본 또는 승인이 변경됐습니다.',409);
    const result={job:publicJob(db,item),receipt,mp4:{fd:verifiedFd,bytes:video.bytes,sha256:video.sha256,identity:current.identity},receiptBytes};verifiedFd=undefined;return result;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('오디오 조립 결과를 안전하게 확인할 수 없습니다.',409);}finally{if(verifiedFd!==undefined)closeSync(verifiedFd);db.close();}
}
export function readVerifiedAudioAssemblyArtifact(id:string,scope:{projectId:string;baseRevision:number;attempt:number}):{job:Job;receipt:AudioAssemblyReceipt;mp4:{fd:number;bytes:number;sha256:string;identity:{size:number;mtimeMs:number;ino:number}};receiptBytes:Buffer}{
  const contract=audioAssemblyJobContract(id);
  if(!audioAssemblyFingerprintsStillMatch(contract.report))throw new StoreError('오디오 조립 원본 또는 승인이 변경됐습니다.',409);
  const result=readAudioAssemblyBytes(id,scope);
  if(!audioAssemblyFingerprintsStillMatch(contract.report)){closeSync(result.mp4.fd);throw new StoreError('오디오 조립 원본 또는 승인이 변경됐습니다.',409);}
  return result;
}
export async function readAudioAssemblyForFinalization(id:string,scope:{projectId:string;baseRevision:number;attempt:number},signal?:AbortSignal):Promise<ReturnType<typeof readAudioAssemblyBytes>&{addendum:ReturnType<typeof readPostLockAddendum>;authority:{specSha256:string;stateSha256:string;preLockStateSha256:string;scriptSha256:string;pictureSha256:string;captionSha256:string;captionContractSha256:string}}>{
  if(!JOB_ID.test(id)||!Number.isSafeInteger(scope.attempt)||scope.attempt<1||signal?.aborted)throw new StoreError('최종화 오디오 작업 식별자 또는 시도가 올바르지 않습니다.',409);
  const db=dbOpen();let contract:AudioAssemblyExecutionContract,contractSha:string;
  try{
    const item=row(db,id);
    if(item.kind!=='audio-timed-assembly'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.attempt!==scope.attempt||!item.finished_at||item.lease_token!==null||item.lease_expires_at!==null||!item.execution_contract_sha256||sha(item.snapshot_json)!==item.snapshot_sha256)throw new StoreError('최종화에 사용할 성공한 오디오 시도가 없습니다.',409);
    const attempt=db.prepare('SELECT ended_at,outcome FROM visualmaker_job_attempts WHERE job_id=? AND attempt=?').get(id,scope.attempt) as {ended_at:string|null;outcome:string|null}|undefined;
    if(!attempt?.ended_at||attempt.outcome!=='succeeded')throw new StoreError('오디오 시도 완료 기록이 없습니다.',409);
    contract=audioAssemblyJobContract(id);contractSha=item.execution_contract_sha256;
    if(contract.schemaVersion!=='visualmaker-audio-assembly-execution-v2'||!contract.report.renderEligible||!contract.report.validators.some(gate=>gate.name==='validate-production-stage.mjs --lock audio-timed-assembly'&&gate.passed===true))throw new StoreError('이전 오디오 작업에는 후속 승인 스냅샷이 없습니다.',409);
  }finally{db.close();}
  const root=realpathSync(process.cwd());
  const check=async()=>{
    if(signal?.aborted)throw new StoreError('최종화 오디오 확인이 취소됐습니다.',409);
    const specFile=readPostLockFile(root,POST_LOCK_SPEC),stateFile=readPostLockFile(root,POST_LOCK_STATE),spec=parsePostLockJson(specFile.bytes),state=parsePostLockJson(stateFile.bytes);
    const addendum=readPostLockAddendum(root,spec,specFile.sha256,contract.authoritySnapshot.productionState.sha256,contractSha);
    const selection=addendum.selection;
    if(selection.source.job_id!==id||selection.source.attempt!==scope.attempt)throw new StoreError('최종화 addendum이 다른 오디오 작업을 가리킵니다.',409);
    const transition=validatePostLockTransition(contract.authoritySnapshot,contract.report,specFile.bytes,stateFile.bytes,state.picture_lock?.final_qc_marker);
    const scriptPath=spec.editorial_revision?.approved_script_source??spec.editorial_revision?.source_path??spec.script_lock?.source_path;
    if(state.final_script?.status!=='locked'||spec.script_lock?.status!=='locked'||spec.script_lock?.reviewer!=='user'||!safeEpisodePath(scriptPath)||selection.final_script.path!==scriptPath||selection.final_script.sha256!==spec.script_lock.source_sha256)throw new StoreError('최종 대본 잠금이나 출처가 변경됐습니다.',409);
    const script=readPostLockFile(root,scriptPath,5_000_000);if(script.sha256!==selection.final_script.sha256||contract.report.fingerprints[scriptPath]!==script.sha256)throw new StoreError('오디오 제작 당시 대본 출처가 변경됐습니다.',409);
    const markers=verifyPostLockMarkers(root,state,selection,script.sha256);
    if(!unchangedAudioFingerprints(root,contract.report)||!await currentPictureStage(root,signal))throw new StoreError('후속 제작 게이트 또는 오디오 원본 권한이 변경됐습니다.',409);
    return {addendum,authority:{...transition,scriptSha256:script.sha256,...markers}};
  };
  const first=await check();let result:ReturnType<typeof readAudioAssemblyBytes>|undefined;
  try{
    result=readAudioAssemblyBytes(id,scope);
    if(result.mp4.sha256!==first.addendum.selection.source.artifact_sha256||sha(result.receiptBytes)!==first.addendum.selection.source.receipt_sha256||result.receipt.executionContractSha256!==contractSha)throw new StoreError('후속 제작 소스 영상 또는 기록 해시가 다릅니다.',409);
    const second=await check();
    if(JSON.stringify(first)!==JSON.stringify(second))throw new StoreError('후속 제작 승인이 읽는 중 변경됐습니다.',409);
    const receiptPath=path.join(dataRoot(),'jobs',id,`attempt-${scope.attempt}`,'provisional-voiced-episode.json');
    if(realpathSync(receiptPath)!==path.resolve(receiptPath)||sha(boundedCanonicalRead(receiptPath,result.receiptBytes.length,3_000_000))!==sha(result.receiptBytes))throw new StoreError('후속 영상 영수증이 읽는 중 변경됐습니다.',409);
    const fresh=streamedFdFingerprint(result.mp4.fd,EPISODE_OUTPUT_LIMIT);
    if(fresh.sha256!==result.mp4.sha256||fresh.bytes!==result.mp4.bytes||fresh.identity.ino!==result.mp4.identity.ino||fresh.identity.mtimeMs!==result.mp4.identity.mtimeMs)throw new StoreError('후속 영상이 읽는 중 변경됐습니다.',409);
    const finalDb=dbOpen();try{const item=row(finalDb,id),attempt=finalDb.prepare('SELECT ended_at,outcome FROM visualmaker_job_attempts WHERE job_id=? AND attempt=?').get(id,scope.attempt) as {ended_at:string|null;outcome:string|null}|undefined;
      const project=finalDb.prepare('SELECT revision,document FROM projects WHERE id=?').get(scope.projectId) as {revision:number;document:string}|undefined;
      if(item.kind!=='audio-timed-assembly'||item.status!=='succeeded'||item.attempt!==scope.attempt||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.execution_contract_sha256!==contractSha||item.lease_token!==null||item.lease_expires_at!==null||!item.finished_at||!attempt?.ended_at||attempt.outcome!=='succeeded'||sha(item.snapshot_json)!==item.snapshot_sha256||!project||project.revision!==scope.baseRevision||sha(project.document)!==item.snapshot_sha256)throw new StoreError('후속 오디오 작업 완료 상태가 변경됐습니다.',409);
    }finally{finalDb.close();}
    return {...result,addendum:first.addendum,authority:first.authority};
  }catch(error){if(result)closeSync(result.mp4.fd);throw error;}
}

export function executeClaim(id:string,token:string,snapshot:Plan):Job {
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='planning-package'||item.status!=='running'||item.lease_token!==token)throw new StoreError('실행 임대가 유효하지 않습니다.',409);
    if(sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('스냅샷 해시가 맞지 않습니다.',409);
  }finally{dbCheck.close();}
  const root=artifactRoot();const staging=path.join(root,'staging',randomUUID());const final=path.join(root,id,`attempt-${item.attempt}`);
  let published=false;
  try{
    renewClaim(id,token,10);
    mkdirSync(staging,{recursive:true});
    const plan=validatePlan(snapshot);
    verifyAssets(plan);
    const req={...requirementsExport(plan),productionAuthority:false as const};
    const files:{name:ArtifactName;bytes:Buffer}[]=[
      {name:'plan.json',bytes:Buffer.from(JSON.stringify(plan,null,2)+'\n')},
      {name:'scenes.csv',bytes:Buffer.from('\uFEFF'+planCsv(plan))},
      {name:'source-requirements.json',bytes:Buffer.from(JSON.stringify(req,null,2)+'\n')},
    ];
    const manifest={schemaVersion:'visualmaker-planning-package-v1',jobSchemaVersion:JOB_SCHEMA_VERSION,projectId:item.project_id,revision:item.requested_revision,snapshotSha256:item.snapshot_sha256,productionAuthority:false,artifacts:files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:sha(file.bytes)}))};
    files.push({name:'package.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
    for(const file of files)writeFileSync(path.join(staging,file.name),file.bytes,{flag:'wx'});
    renewClaim(id,token,90);
    const db=dbOpen();try{transaction(db,()=>{
      const current=row(db,id);
      if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('작업이 취소되거나 실행 권한이 만료됐습니다.',409);
      verifyAssets(plan);
      mkdirSync(path.dirname(final),{recursive:true});renameSync(staging,final);published=true;
      for(const file of files)db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,file.name,`jobs/${id}/attempt-${item.attempt}/${file.name}`,file.bytes.length,sha(file.bytes));
      const timestamp=now();
      const changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      if(changed.changes!==1)throw new StoreError('작업이 취소됐습니다.',409);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    });}finally{db.close();}
  }catch(error){if(published)rmSync(final,{recursive:true,force:true});failClaim(id,token,error);throw error;
  }finally{rmSync(staging,{recursive:true,force:true});}
  return getJob(id);
}

export function runJob(id:string):Job {if(getJob(id).kind!=='planning-package')throw new StoreError('이 작업은 별도 renderer worker로 실행해야 합니다.',409);const claim=claimJob(id);return executeClaim(id,claim.token,claim.snapshot);}

export async function executeDiagnosticClaim(id:string,token:string,snapshot:Plan):Promise<Job>{
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='renderer-diagnostic'||item.status!=='running'||item.lease_token!==token||sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('진단 작업 임대 또는 스냅샷이 유효하지 않습니다.',409);}finally{dbCheck.close();}
  let staging:string|undefined;let final:string|undefined;let published=false;
  try{
    const root=artifactRoot();const realRoot=realpathSync(root);
    if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep))throw new StoreError('진단 저장 경로가 올바르지 않습니다.',403);
    const stagingParent=path.join(realRoot,'staging');mkdirSync(stagingParent,{recursive:true});
    if(realpathSync(stagingParent)!==stagingParent)throw new StoreError('진단 임시 저장 경로가 올바르지 않습니다.',403);
    staging=path.join(stagingParent,randomUUID());mkdirSync(staging);
    if(realpathSync(staging)!==staging)throw new StoreError('진단 시도 경로가 올바르지 않습니다.',403);
    const work=path.join(staging,'work');const artifacts=path.join(staging,'artifacts');mkdirSync(work);mkdirSync(artifacts);
    const finalParent=path.join(realRoot,id);mkdirSync(finalParent,{recursive:true});
    if(realpathSync(finalParent)!==finalParent)throw new StoreError('진단 최종 경로가 올바르지 않습니다.',403);
    const finalPath=path.join(finalParent,`attempt-${item.attempt}`);final=finalPath;
    const receipt=await runDiagnosticChild({work,id,projectId:item.project_id,revision:item.requested_revision,snapshotSha256:item.snapshot_sha256,token});
    const mp4=readFileSync(path.join(work,'diagnostic.mp4'));
    if(mp4.length!==receipt.output.bytes||sha(mp4)!==receipt.output.sha256)throw new StoreError('진단 영상이 검증 후 변경됐습니다.',409);
    const files:{name:ArtifactName;bytes:Buffer}[]=[{name:'diagnostic.mp4',bytes:mp4},{name:'diagnostic.json',bytes:Buffer.from(JSON.stringify(receipt,null,2)+'\n')}];
    for(const file of files)writeFileSync(path.join(artifacts,file.name),file.bytes,{flag:'wx'});
    renewClaim(id,token,95);
    const db=dbOpen();try{transaction(db,()=>{
      const current=row(db,id);
      if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('진단 작업 실행 권한이 만료됐습니다.',409);
      if(realpathSync(artifacts)!==artifacts||realpathSync(finalParent)!==finalParent)throw new StoreError('진단 게시 경로가 변경됐습니다.',403);
      renameSync(artifacts,finalPath);published=true;
      for(const file of files)db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,file.name,`jobs/${id}/attempt-${item.attempt}/${file.name}`,file.bytes.length,sha(file.bytes));
      const timestamp=now();const changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      if(changed.changes!==1)throw new StoreError('진단 작업이 취소됐습니다.',409);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    });}finally{db.close();}
  }catch(error){try{if(published&&final&&realpathSync(final)===final)rmSync(final,{recursive:true,force:true});}catch{}failClaim(id,token,error instanceof StoreError?error:new Error('렌더 엔진 진단에 실패했습니다. 로컬 브라우저·FFmpeg·Remotion 설치 상태를 확인하세요.'));throw error;
  }finally{try{if(staging&&realpathSync(staging)===staging)rmSync(staging,{recursive:true,force:true});}catch{}}
  return getJob(id);
}

async function runDiagnosticChild(input:{work:string;id:string;projectId:string;revision:number;snapshotSha256:string;token:string}):Promise<DiagnosticReceipt>{
  const projectRoot=realpathSync(process.cwd());
  const runnerPath=realpathSync(path.join(projectRoot,'visualmaker','renderer','runner.ts'));
  if(!runnerPath.startsWith(projectRoot+path.sep))throw new StoreError('진단 실행 파일 경로가 올바르지 않습니다.',403);
  return await new Promise((resolve,reject)=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};
    for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[name])env[name]=process.env[name];
    const child=spawn(process.execPath,['--experimental-strip-types',runnerPath,'--diagnostic-child',input.work,input.id,input.projectId,String(input.revision),input.snapshotSha256],{cwd:projectRoot,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
    let done=false;let receipt:DiagnosticReceipt|null=null;let stopReason:Error|null=null;let killTimer:ReturnType<typeof setTimeout>|null=null;let stage='resolve';let failureCode='stage-failed';const started=Date.now();
    function terminate(){
      if(!child.pid)return;
      if(process.platform==='win32'){
        const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});
        killer.on('error',()=>child.kill());
      }else {try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}
    }
    function requestStop(reason:Error){if(stopReason)return;stopReason=reason;clearInterval(timer);if(child.connected)child.send({type:'cancel'});killTimer=setTimeout(terminate,1000);}
    function finish(error?:Error){if(done)return;done=true;clearInterval(timer);if(killTimer)clearTimeout(killTimer);child.removeAllListeners();if(child.connected)child.disconnect();if(error)reject(error);else if(receipt)resolve(receipt);else reject(new StoreError(`렌더 엔진 진단 실패: ${stage} / ${failureCode}`,503));}
    const timer=setInterval(()=>{
      if(Date.now()-started>=119_000){requestStop(new Error('렌더 엔진 진단의 120초 제한 시간이 지났습니다.'));return;}
      try{renewClaim(input.id,input.token,45);}catch{requestStop(new Error('렌더 엔진 진단이 취소되거나 실행 임대가 만료됐습니다.'));}
    },1000);
    child.on('message',message=>{
      if(!message||typeof message!=='object'||!('type' in message))return;
      if(message.type==='diagnostic-stage'&&'stage' in message&&typeof message.stage==='string'&&['resolve','bundle','open','select','render','probe','decode','publish'].includes(message.stage))stage=message.stage;
      if(message.type==='diagnostic-error'&&'stage' in message&&'code' in message){
        if(typeof message.stage==='string'&&['resolve','bundle','open','select','render','probe','decode','publish'].includes(message.stage))stage=message.stage;
        if(typeof message.code==='string'&&['browser-unavailable','probe-failed','decode-failed','cancelled-or-timeout','bundle-failed','stage-failed'].includes(message.code))failureCode=message.code;
      }
      if(message.type==='diagnostic-result'&&'receipt' in message)receipt=message.receipt as DiagnosticReceipt;
    });
    child.once('error',()=>finish(new Error('렌더 엔진 진단 자식 프로세스를 시작하지 못했습니다.')));
    child.once('exit',code=>finish(stopReason??(code===0&&receipt?undefined:new StoreError(`렌더 엔진 진단 실패: ${stage} / ${failureCode}`,503))));
  });
}

function canonicalEqual(a:CanonicalReport,b:CanonicalReport):boolean{return JSON.stringify(a)===JSON.stringify(b);}
export function assertCanonicalDeadline(deadline:number,timestamp=Date.now()):void{
  if(!Number.isSafeInteger(deadline)||timestamp>=deadline)throw new StoreError('정식 컷 작업의 전체 제한 시간이 지났습니다.',409);
}

async function revalidateCanonical(id:string,snapshot:Plan,contract:CanonicalExecutionContract,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw new StoreError('컷 작업이 중단됐습니다.',409);
  const current=currentPlanForCanonical(snapshot.id,snapshot.revision);
  if(sha(JSON.stringify(current))!==sha(JSON.stringify(snapshot)))throw new StoreError('대기 중 계획이 변경됐습니다. 새 컷 작업을 요청하세요.',409);
  const report=await evaluateCanonicalCut(current,contract.report.scope.sceneId,signal);
  if(!report.renderEligible||!canonicalEqual(report,contract.report)||!authorityFingerprintsStillMatch(contract.report))throw new StoreError('대기 중 정식 컷 입력 또는 승인이 변경됐습니다. 새 작업을 요청하세요.',409);
  const db=dbOpen();try{const item=row(db,id);if(item.execution_contract_sha256!==sha(item.execution_contract_json??'')||item.execution_contract_json!==JSON.stringify(contract))throw new StoreError('작업 실행 계약이 변경됐습니다.',409);}finally{db.close();}
}

export function copyCanonicalInputs(work:string,report:CanonicalReport):void{
  const root=realpathSync(process.cwd());const publicDir=path.join(work,'public');mkdirSync(publicDir);
  if(realpathSync(publicDir)!==publicDir)throw new StoreError('컷 입력 저장 경로가 올바르지 않습니다.',403);
  const filesystem=statfsSync(work);const free=filesystem.bavail*filesystem.bsize;
  const aggregate=report.inputs.reduce((n,input)=>n+input.bytes,0);
  if(aggregate<1||aggregate>1_000_000_000||free<aggregate*2+500_000_000)throw new StoreError('컷 렌더 저장 공간이 부족합니다. 원본을 유지하고 공간을 확보하세요.',507);
  const copied=new Set<string>();
  for(const input of report.inputs){
    if(copied.has(input.path))continue;copied.add(input.path);
    if(!input.path.startsWith('video/public/'))throw new StoreError('컷 입력이 public 밖을 가리킵니다.',403);
    const source=safeCanonicalFile(root,input.path);
    const relative=input.path.slice('video/public/'.length);if(!relative||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw new StoreError('컷 입력 상대 경로가 올바르지 않습니다.',403);
    const destination=path.resolve(publicDir,relative);if(!destination.startsWith(publicDir+path.sep))throw new StoreError('컷 복사 경로가 올바르지 않습니다.',403);
    const bytes=boundedCanonicalRead(source,input.bytes,250_000_000);
    if(sha(bytes)!==input.sha256)throw new StoreError('컷 원본 해시가 변경됐습니다.',409);
    mkdirSync(path.dirname(destination),{recursive:true});if(realpathSync(path.dirname(destination))!==path.dirname(destination))throw new StoreError('컷 복사 대상에 링크가 있습니다.',403);copyFileSync(source,destination,constants.COPYFILE_EXCL);
    const copiedBytes=boundedCanonicalRead(destination,input.bytes,250_000_000);
    if(sha(copiedBytes)!==input.sha256)throw new StoreError('컷 복사본 해시가 다릅니다.',409);
  }
}

export function verifyCanonicalCopiedInputs(work:string,report:CanonicalReport):void{
  const root=realpathSync(process.cwd());const publicDir=realpathSync(path.join(work,'public'));
  if(publicDir!==path.join(work,'public'))throw new StoreError('컷 복사본 경로가 변경됐습니다.',409);
  for(const input of report.inputs){
    const source=safeCanonicalFile(root,input.path);const relative=input.path.slice('video/public/'.length);
    const copy=realpathSync(path.resolve(publicDir,relative));if(!copy.startsWith(publicDir+path.sep)||copy!==path.resolve(publicDir,relative))throw new StoreError('컷 복사본이 다른 위치를 가리킵니다.',409);
    for(const file of [source,copy]){const bytes=boundedCanonicalRead(file,input.bytes,250_000_000);if(sha(bytes)!==input.sha256)throw new StoreError('렌더 입력 원본 또는 복사본이 변경됐습니다.',409);}
  }
}

function canonicalProfile(mode:string):CanonicalReceipt['reviewProfile']{
  if(mode==='source-photo')return 'source-photo-treatment';
  if(mode==='source-video')return 'source-video-selection';
  if(mode==='omni')return 'omni-keyframe-input';
  return 'remotion-motion';
}

export async function executeCanonicalClaim(id:string,token:string,snapshot:Plan):Promise<Job>{
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='canonical-cut-preview'||item.status!=='running'||item.lease_token!==token||sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('컷 작업 임대 또는 스냅샷이 유효하지 않습니다.',409);}finally{dbCheck.close();}
  let staging:string|undefined;let final:string|undefined;let published=false;
  const deadline=Date.now()+600_000;const controller=new AbortController();let heartbeatError:Error|null=null;
  const heartbeat=setInterval(()=>{if(controller.signal.aborted)return;try{assertCanonicalDeadline(deadline);renewClaim(id,token,45);}catch(error){heartbeatError=error instanceof Error?error:new Error('컷 실행 임대가 유효하지 않습니다.');controller.abort();}},1000);
  const check=()=>{if(controller.signal.aborted)throw heartbeatError??new StoreError('컷 작업이 취소됐습니다.',409);assertCanonicalDeadline(deadline);renewClaim(id,token,45);};
  try{
    const contract=canonicalJobContract(id);if(!contract.report.renderEligible||!contract.report.composition||!contract.report.scope.cutId)throw new StoreError('실행 가능한 정식 컷 계약이 아닙니다.',409);
    await revalidateCanonical(id,snapshot,contract,controller.signal);check();
    renewClaim(id,token,15);
    const root=artifactRoot();const realRoot=realpathSync(root);
    if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep))throw new StoreError('컷 작업 저장 경로가 올바르지 않습니다.',403);
    const parent=path.join(realRoot,'staging');mkdirSync(parent,{recursive:true});if(realpathSync(parent)!==parent)throw new StoreError('컷 임시 경로가 올바르지 않습니다.',403);
    staging=path.join(parent,randomUUID());mkdirSync(staging);if(realpathSync(staging)!==staging)throw new StoreError('컷 시도 경로가 올바르지 않습니다.',403);
    const work=path.join(staging,'work');const artifacts=path.join(staging,'artifacts');mkdirSync(work);mkdirSync(artifacts);
    copyCanonicalInputs(work,contract.report);check();
    const contractBytes=Buffer.from(JSON.stringify(contract));writeFileSync(path.join(work,'contract.json'),contractBytes,{flag:'wx'});
    renewClaim(id,token,30);
    const result=await runCanonicalChild({work,id,token,contractSha256:sha(contractBytes),deadline,signal:controller.signal});check();
    await revalidateCanonical(id,snapshot,contract,controller.signal);check();
    verifyCanonicalCopiedInputs(work,contract.report);check();
    const output=boundedCanonicalRead(path.join(work,'provisional-cut.mp4'),result.output.bytes,400_000_000);
    if(sha(output)!==result.output.sha256)throw new StoreError('정식 컷 영상이 검증 후 변경됐습니다.',409);
    const receipt:CanonicalReceipt={schemaVersion:'visualmaker-canonical-cut-receipt-v1',artifactKind:'canonical-cut-preview',episodeId:'episode-001',jobId:id,attempt:item.attempt,projectId:item.project_id,requestedRevision:item.requested_revision,sceneId:contract.report.scope.sceneId,cutId:contract.report.scope.cutId,snapshotSha256:item.snapshot_sha256,executionContractSha256:item.execution_contract_sha256!,composition:contract.report.composition,dependencyCutIds:contract.report.dependencyCutIds,boundaryIds:contract.report.boundaryIds,inputs:contract.report.inputs,authorityFingerprints:contract.report.fingerprints,rendererVersion:'4.0.516',reviewProfile:canonicalProfile(contract.report.composition.mode),productionAuthority:false,cutPass:false,stylePass:false,playableParity:false,output:result.output,measured:result.measured};
    const files:{name:ArtifactName;bytes:Buffer}[]=[{name:'provisional-cut.mp4',bytes:output},{name:'provisional-cut.json',bytes:Buffer.from(JSON.stringify(receipt,null,2)+'\n')}];
    for(const file of files)writeFileSync(path.join(artifacts,file.name),file.bytes,{flag:'wx'});
    const finalParent=path.join(realRoot,id);mkdirSync(finalParent,{recursive:true});if(realpathSync(finalParent)!==finalParent)throw new StoreError('컷 결과 경로가 올바르지 않습니다.',403);
    final=path.join(finalParent,`attempt-${item.attempt}`);
    renewClaim(id,token,95);
    await revalidateCanonical(id,snapshot,contract,controller.signal);check();
    verifyCanonicalCopiedInputs(work,contract.report);check();
    const db=dbOpen();try{transaction(db,()=>{
      const current=row(db,id);if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('컷 작업이 취소되거나 실행 권한이 만료됐습니다.',409);
      if(!authorityFingerprintsStillMatch(contract.report)||realpathSync(artifacts)!==artifacts||realpathSync(finalParent)!==finalParent)throw new StoreError('컷 입력 또는 결과 경로가 변경됐습니다.',409);
      renameSync(artifacts,final!);published=true;
      for(const file of files)db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,file.name,`jobs/${id}/attempt-${item.attempt}/${file.name}`,file.bytes.length,sha(file.bytes));
      const timestamp=now();const changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      if(changed.changes!==1)throw new StoreError('컷 작업이 취소됐습니다.',409);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    });}finally{db.close();}
  }catch(error){try{if(published&&final&&realpathSync(final)===final)rmSync(final,{recursive:true,force:true});}catch{}failClaim(id,token,error instanceof StoreError?error:new Error('정식 컷 렌더가 실패했습니다. 입력과 로컬 렌더 환경을 확인하세요.'));throw error;
  }finally{clearInterval(heartbeat);controller.abort();try{if(staging&&realpathSync(staging)===staging)rmSync(staging,{recursive:true,force:true});}catch{}}
  return getJob(id);
}

export function boundedCanonicalRead(file:string,recordedBytes:number,limit:number):Buffer{
  if(!Number.isSafeInteger(recordedBytes)||recordedBytes<1||recordedBytes>limit)throw new StoreError('컷 파일 크기가 허용 범위를 벗어났습니다.',409);
  const fd=openSync(file,'r');try{const size=fstatSync(fd).size;if(size!==recordedBytes||size>limit)throw new StoreError('컷 파일 크기가 기록과 다릅니다.',409);
    const bytes=Buffer.allocUnsafe(size+1);let used=0;while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
    if(used!==size||fstatSync(fd).size!==size)throw new StoreError('컷 파일이 읽는 중 변경됐습니다.',409);return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}

async function runCanonicalChild(input:{work:string;id:string;token:string;contractSha256:string;deadline:number;signal:AbortSignal}):Promise<Pick<CanonicalReceipt,'output'|'measured'>>{
  const root=realpathSync(process.cwd());const runner=realpathSync(path.join(root,'visualmaker','renderer','canonical-runner.ts'));
  if(!runner.startsWith(root+path.sep))throw new StoreError('컷 렌더 실행 파일 경로가 올바르지 않습니다.',403);
  return await new Promise((resolve,reject)=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};
    for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[name])env[name]=process.env[name];
    const child=spawn(process.execPath,['--experimental-strip-types',runner,'--canonical-child',input.work,input.contractSha256],{cwd:root,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
    let done=false;let result:Pick<CanonicalReceipt,'output'|'measured'>|null=null;let stopReason:Error|null=null;let stage='resolve';let code='stage-failed';let killTimer:ReturnType<typeof setTimeout>|null=null;const started=Date.now();
    function kill(){if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}}
    function stop(error:Error){if(stopReason)return;stopReason=error;clearInterval(timer);if(child.connected)child.send({type:'cancel'});killTimer=setTimeout(kill,1200);}
    function finish(error?:Error){if(done)return;done=true;clearInterval(timer);input.signal.removeEventListener('abort',onAbort);if(killTimer)clearTimeout(killTimer);child.removeAllListeners();if(child.connected)child.disconnect();if(error)reject(error);else if(result)resolve(result);else reject(new StoreError(`정식 컷 렌더 실패: ${stage} / ${code}`,503));}
    const onAbort=()=>stop(new Error('정식 컷 렌더가 취소됐습니다.'));input.signal.addEventListener('abort',onAbort,{once:true});
    const timer=setInterval(()=>{if(Date.now()>=input.deadline){stop(new Error('정식 컷 작업의 10분 제한 시간이 지났습니다.'));return;}try{renewClaim(input.id,input.token,45);}catch{stop(new Error('정식 컷 렌더가 취소되거나 임대가 만료됐습니다.'));}},1000);
    child.on('message',message=>{if(!message||typeof message!=='object'||!('type' in message))return;
      if(message.type==='canonical-stage'&&'stage' in message&&typeof message.stage==='string'&&['resolve','bundle','open','select','render','probe','decode','publish'].includes(message.stage))stage=message.stage;
      if(message.type==='canonical-error'&&'code' in message&&typeof message.code==='string'&&['browser-unavailable','bundle-failed','probe-failed','decode-failed','cancelled','stage-failed'].includes(message.code))code=message.code;
      if(message.type==='canonical-result'&&'result' in message)result=message.result as Pick<CanonicalReceipt,'output'|'measured'>;
    });
    child.once('error',()=>finish(new StoreError('정식 컷 렌더 프로세스를 시작하지 못했습니다.',503)));
    child.once('exit',status=>finish(stopReason??(status===0&&result?undefined:new StoreError(`정식 컷 렌더 실패: ${stage} / ${code}`,503))));
  });
}

async function revalidateEpisode(id:string,snapshot:Plan,contract:EpisodeExecutionContract,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw new StoreError('전체 에피소드 렌더가 중단됐습니다.',409);
  const current=currentPlanForCanonical(snapshot.id,snapshot.revision);
  if(sha(JSON.stringify(current))!==sha(JSON.stringify(snapshot)))throw new StoreError('계획이 변경됐습니다. 새 전체 영상 작업을 요청하세요.',409);
  const fresh=await evaluateEpisodeProvisional(current,signal);
  if(!fresh.renderEligible||JSON.stringify(fresh)!==JSON.stringify(contract.report)||!episodeFingerprintsStillMatch(contract.report))throw new StoreError('전체 영상의 입력 또는 승인이 변경됐습니다.',409);
  const db=dbOpen();try{const item=row(db,id);if(item.execution_contract_sha256!==sha(item.execution_contract_json??'')||item.execution_contract_json!==JSON.stringify(contract))throw new StoreError('전체 영상 실행 계약이 변경됐습니다.',409);}finally{db.close();}
}

export async function executeEpisodeClaim(id:string,token:string,snapshot:Plan):Promise<Job>{
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='episode-provisional-video'||item.status!=='running'||item.lease_token!==token||sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('전체 영상 작업 임대 또는 스냅샷이 올바르지 않습니다.',409);}finally{dbCheck.close();}
  const deadline=Date.now()+3_600_000,controller=new AbortController();let heartbeatError:Error|null=null,staging:string|undefined,final:string|undefined,published=false;
  const heartbeat=setInterval(()=>{if(controller.signal.aborted)return;try{if(Date.now()>=deadline)throw new StoreError('전체 영상 작업의 60분 제한 시간이 지났습니다.',409);renewClaim(id,token,45);}catch(error){heartbeatError=error instanceof Error?error:new Error('전체 영상 실행 임대가 유효하지 않습니다.');controller.abort();}},1000);
  const check=()=>{if(controller.signal.aborted)throw heartbeatError??new StoreError('전체 영상 작업이 취소됐습니다.',409);if(Date.now()>=deadline)throw new StoreError('전체 영상 작업의 60분 제한 시간이 지났습니다.',409);renewClaim(id,token,45);};
  try{
    const contract=episodeJobContract(id);if(!contract.report.renderEligible||!contract.report.composition)throw new StoreError('실행 가능한 전체 영상 계약이 아닙니다.',409);
    await revalidateEpisode(id,snapshot,contract,controller.signal);check();
    const root=artifactRoot(),realRoot=realpathSync(root);if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep))throw new StoreError('전체 영상 작업 저장 경로가 올바르지 않습니다.',403);
    const parent=path.join(realRoot,'staging');mkdirSync(parent,{recursive:true});if(realpathSync(parent)!==parent)throw new StoreError('전체 영상 임시 경로가 올바르지 않습니다.',403);
    staging=path.join(parent,randomUUID());mkdirSync(staging);if(realpathSync(staging)!==staging)throw new StoreError('전체 영상 시도 경로가 올바르지 않습니다.',403);
    const work=path.join(staging,'work'),artifacts=path.join(staging,'artifacts');mkdirSync(work);mkdirSync(artifacts);
    copyEpisodeInputs(work,contract.report);check();
    const contractBytes=Buffer.from(JSON.stringify(contract));if(contractBytes.length>5_000_000)throw new StoreError('전체 영상 계약 크기가 제한을 넘었습니다.',409);writeFileSync(path.join(work,'contract.json'),contractBytes,{flag:'wx'});
    const result=await runEpisodeChild({work,id,token,contractSha256:sha(contractBytes),deadline,signal:controller.signal});check();
    await revalidateEpisode(id,snapshot,contract,controller.signal);check();verifyEpisodeCopiedInputs(work,contract.report);check();
    const mp4=path.join(work,'provisional-episode.mp4'),output=streamedFileFingerprint(mp4,EPISODE_OUTPUT_LIMIT);if(output.bytes!==result.output.bytes||output.sha256!==result.output.sha256)throw new StoreError('전체 영상이 측정 후 변경됐습니다.',409);
    const receipt:EpisodeReceipt={schemaVersion:'visualmaker-provisional-episode-receipt-v1',artifactKind:'episode-provisional-video',episodeId:'episode-001',jobId:id,attempt:item.attempt,projectId:item.project_id,requestedRevision:item.requested_revision,snapshotSha256:item.snapshot_sha256,executionContractSha256:item.execution_contract_sha256!,composition:contract.report.composition,cuts:contract.report.cuts,boundaries:contract.report.boundaries,inputs:contract.report.inputs,authorityFingerprints:contract.report.fingerprints,rendererVersion:'4.0.516',reviewProfile:'remotion-motion',productionAuthority:false,reviewApproved:false,audioSynchronized:false,output:result.output,measured:result.measured};
    const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');if(receiptBytes.length>2_000_000)throw new StoreError('전체 영상 결과 기록 크기가 제한을 넘었습니다.',409);
    copyFileSync(mp4,path.join(artifacts,'provisional-episode.mp4'),constants.COPYFILE_EXCL);
    const copied=streamedFileFingerprint(path.join(artifacts,'provisional-episode.mp4'),EPISODE_OUTPUT_LIMIT);if(copied.sha256!==output.sha256||copied.bytes!==output.bytes)throw new StoreError('전체 영상 게시 복사본이 다릅니다.',409);
    writeFileSync(path.join(artifacts,'provisional-episode.json'),receiptBytes,{flag:'wx'});
    const finalParent=path.join(realRoot,id);mkdirSync(finalParent,{recursive:true});if(realpathSync(finalParent)!==finalParent)throw new StoreError('전체 영상 결과 경로가 올바르지 않습니다.',403);
    final=path.join(finalParent,`attempt-${item.attempt}`);
    await revalidateEpisode(id,snapshot,contract,controller.signal);check();verifyEpisodeCopiedInputs(work,contract.report);check();
    const db=dbOpen();try{transaction(db,()=>{
      const current=row(db,id);if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('전체 영상 작업 임대가 만료되거나 취소됐습니다.',409);
      if(!episodeFingerprintsStillMatch(contract.report)||realpathSync(artifacts)!==artifacts||realpathSync(finalParent)!==finalParent)throw new StoreError('전체 영상 입력 또는 게시 경로가 변경됐습니다.',409);
      renameSync(artifacts,final!);published=true;
      for(const record of [{name:'provisional-episode.mp4' as const,bytes:output.bytes,sha256:output.sha256},{name:'provisional-episode.json' as const,bytes:receiptBytes.length,sha256:sha(receiptBytes)}])db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,record.name,`jobs/${id}/attempt-${item.attempt}/${record.name}`,record.bytes,record.sha256);
      const timestamp=now(),changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
      if(changed.changes!==1)throw new StoreError('전체 영상 작업이 취소됐습니다.',409);
      db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
    });}finally{db.close();}
  }catch(error){try{if(published&&final&&realpathSync(final)===final)rmSync(final,{recursive:true,force:true});}catch{}failClaim(id,token,error instanceof StoreError?error:new Error('전체 임시 영상 렌더가 실패했습니다. 로컬 렌더 환경과 실제 승인 입력을 확인하세요.'));throw error;
  }finally{clearInterval(heartbeat);controller.abort();try{if(staging&&realpathSync(staging)===staging)rmSync(staging,{recursive:true,force:true});}catch{}}
  return getJob(id);
}

async function runEpisodeChild(input:{work:string;id:string;token:string;contractSha256:string;deadline:number;signal:AbortSignal}):Promise<Pick<EpisodeReceipt,'output'|'measured'>>{
  const root=realpathSync(process.cwd()),runner=realpathSync(path.join(root,'visualmaker','renderer','episode-runner.ts'));
  if(!runner.startsWith(root+path.sep))throw new StoreError('전체 영상 렌더 실행 경로가 올바르지 않습니다.',403);
  return await new Promise((resolve,reject)=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(process.execPath,['--experimental-strip-types',runner,'--episode-child',input.work,input.contractSha256],{cwd:root,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
    let done=false,result:Pick<EpisodeReceipt,'output'|'measured'>|null=null,stopReason:Error|null=null,stage='resolve',code='stage-failed',killTimer:ReturnType<typeof setTimeout>|null=null;
    function kill(){if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}}
    function stop(reason:Error){if(stopReason)return;stopReason=reason;clearInterval(timer);if(child.connected)child.send({type:'cancel'});killTimer=setTimeout(kill,1200);}
    function finish(error?:Error){if(done)return;done=true;clearInterval(timer);input.signal.removeEventListener('abort',onAbort);if(killTimer)clearTimeout(killTimer);child.removeAllListeners();if(child.connected)child.disconnect();if(error)reject(error);else if(result)resolve(result);else reject(new StoreError(`전체 영상 렌더 실패: ${stage} / ${code}`,503));}
    const onAbort=()=>stop(new Error('전체 영상 렌더가 취소됐습니다.'));input.signal.addEventListener('abort',onAbort,{once:true});
    const timer=setInterval(()=>{if(Date.now()>=input.deadline){stop(new Error('전체 영상 렌더의 60분 제한 시간이 지났습니다.'));return;}try{renewClaim(input.id,input.token,45);}catch{stop(new Error('전체 영상 작업 임대가 만료되거나 취소됐습니다.'));}},1000);
    child.on('message',message=>{if(!message||typeof message!=='object'||!('type' in message))return;
      if(message.type==='episode-stage'&&'stage' in message&&typeof message.stage==='string'&&['resolve','bundle','open','select','render','probe','decode','publish'].includes(message.stage))stage=message.stage;
      if(message.type==='episode-error'&&'code' in message&&typeof message.code==='string'&&['browser-unavailable','bundle-failed','probe-failed','decode-failed','cancelled','stage-failed'].includes(message.code))code=message.code;
      if(message.type==='episode-result'&&'result' in message)result=message.result as Pick<EpisodeReceipt,'output'|'measured'>;
    });
    child.once('error',()=>finish(new StoreError('전체 영상 렌더 프로세스를 시작하지 못했습니다.',503)));
    child.once('exit',status=>finish(stopReason??(status===0&&result?undefined:new StoreError(`전체 영상 렌더 실패: ${stage} / ${code}`,503))));
  });
}

async function revalidateAudioAssembly(id:string,snapshot:Plan,contract:AudioAssemblyExecutionContract,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw new StoreError('오디오 조립이 중단됐습니다.',409);
  const current=currentPlanForCanonical(snapshot.id,snapshot.revision);
  if(sha(JSON.stringify(current))!==sha(JSON.stringify(snapshot)))throw new StoreError('계획이 변경됐습니다. 새 오디오 조립 작업을 요청하세요.',409);
  const fresh=await evaluateAudioAssembly(current.id,current.revision,signal);
  if(!fresh.renderEligible||JSON.stringify(fresh)!==JSON.stringify(contract.report)||!audioAssemblyFingerprintsStillMatch(contract.report))throw new StoreError('오디오 조립의 입력 또는 승인이 변경됐습니다.',409);
  const db=dbOpen();try{const item=row(db,id);if(item.execution_contract_sha256!==sha(item.execution_contract_json??'')||item.execution_contract_json!==JSON.stringify(contract))throw new StoreError('오디오 조립 실행 계약이 변경됐습니다.',409);}finally{db.close();}
}
async function runAudioAssemblyChild(input:{work:string;id:string;token:string;contractSha256:string;deadline:number;signal:AbortSignal}):Promise<import('../renderer/audio-assembly-contract.ts').AudioAssemblyResult>{
  const root=realpathSync(process.cwd()),runner=realpathSync(path.join(root,'visualmaker','renderer','audio-assembly-runner.ts'));
  if(!runner.startsWith(root+path.sep))throw new StoreError('오디오 조립 실행 경로가 올바르지 않습니다.',403);
  return await new Promise((resolve,reject)=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(process.execPath,['--experimental-strip-types',runner,'--audio-child',input.work,input.contractSha256],{cwd:root,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
    let done=false,result:import('../renderer/audio-assembly-contract.ts').AudioAssemblyResult|null=null,stopReason:Error|null=null,stage='resolve',killTimer:ReturnType<typeof setTimeout>|null=null;
    function kill(){if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}}
    function stop(reason:Error){if(stopReason)return;stopReason=reason;clearInterval(timer);if(child.connected)child.send({type:'cancel'});killTimer=setTimeout(kill,1200);}
    function finish(error?:Error){if(done)return;done=true;clearInterval(timer);input.signal.removeEventListener('abort',onAbort);if(killTimer)clearTimeout(killTimer);child.removeAllListeners();if(child.connected)child.disconnect();if(error)reject(error);else if(result)resolve(result);else reject(new StoreError(`오디오 조립 실패: ${stage}`,503));}
    const onAbort=()=>stop(new Error('오디오 조립이 취소됐습니다.'));input.signal.addEventListener('abort',onAbort,{once:true});
    const timer=setInterval(()=>{if(Date.now()>=input.deadline){stop(new Error('오디오 조립 제한 시간이 지났습니다.'));return;}try{renewClaim(input.id,input.token,45);}catch{stop(new Error('오디오 조립 임대가 만료되거나 취소됐습니다.'));}},1000);
    child.on('message',message=>{if(!message||typeof message!=='object'||!('type' in message))return;
      if(message.type==='audio-stage'&&'stage' in message&&typeof message.stage==='string')stage=message.stage.slice(0,80);
      if(message.type==='audio-result'&&'result' in message)result=message.result as import('../renderer/audio-assembly-contract.ts').AudioAssemblyResult;
    });
    child.once('error',()=>finish(new StoreError('오디오 조립 프로세스를 시작하지 못했습니다.',503)));
    child.once('exit',status=>finish(stopReason??(status===0&&result?undefined:new StoreError(`오디오 조립 실패: ${stage}`,503))));
  });
}
export async function publishAudioAssemblyResult(input:{
  id:string;token:string;work:string;artifacts:string;contract:AudioAssemblyExecutionContract;
  result:import('../renderer/audio-assembly-contract.ts').AudioAssemblyResult;
  validateCurrent:()=>Promise<void>;check:()=>void;onPublished:(path:string)=>void;
}):Promise<string>{
  const {id,token,work,artifacts,contract,result,validateCurrent,check,onPublished}=input;
  const root=artifactRoot(),realRoot=realpathSync(root),stagingRoot=path.join(realRoot,'staging');
  if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep)||!work.startsWith(stagingRoot+path.sep)||realpathSync(work)!==work||path.dirname(work)!==path.dirname(artifacts)||realpathSync(artifacts)!==artifacts)throw new StoreError('오디오 게시 경로가 올바르지 않습니다.',403);
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='audio-timed-assembly'||item.status!=='running'||item.lease_token!==token||item.execution_contract_json!==JSON.stringify(contract)||item.execution_contract_sha256!==sha(JSON.stringify(contract))||!contract.report.renderEligible||!contract.report.composition)throw new StoreError('오디오 게시 계약 또는 임대가 올바르지 않습니다.',409);}finally{dbCheck.close();}
  const mp4=path.join(work,'provisional-voiced-episode.mp4'),output=streamedFileFingerprint(mp4,EPISODE_OUTPUT_LIMIT);
  if(output.bytes!==result.output.bytes||output.sha256!==result.output.sha256)throw new StoreError('음성 영상이 측정 후 변경됐습니다.',409);
  const receipt:AudioAssemblyReceipt={schemaVersion:'visualmaker-audio-assembly-receipt-v1',artifactKind:'audio-timed-assembly',episodeId:'episode-001',jobId:id,attempt:item.attempt,projectId:item.project_id,requestedRevision:item.requested_revision,snapshotSha256:item.snapshot_sha256,executionContractSha256:item.execution_contract_sha256!,composition:contract.report.composition,visualInputs:contract.report.visual.inputs,authorityFingerprints:contract.report.visual.fingerprints,audioFingerprints:contract.report.fingerprints,voices:result.voices,rendererVersion:'4.0.516',ffmpegVersion:result.ffmpegVersion,reviewProfile:'remotion-motion',productionAuthority:false,reviewApproved:false,technicalAudioAligned:true,output:result.output,visual:result.visual,measured:result.measured};
  const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');if(receiptBytes.length>3_000_000)throw new StoreError('오디오 조립 결과 기록 크기가 제한을 넘었습니다.',409);
  copyFileSync(mp4,path.join(artifacts,'provisional-voiced-episode.mp4'),constants.COPYFILE_EXCL);
  const copied=streamedFileFingerprint(path.join(artifacts,'provisional-voiced-episode.mp4'),EPISODE_OUTPUT_LIMIT);if(copied.sha256!==output.sha256||copied.bytes!==output.bytes)throw new StoreError('음성 영상 게시 복사본이 다릅니다.',409);
  writeFileSync(path.join(artifacts,'provisional-voiced-episode.json'),receiptBytes,{flag:'wx'});
  const finalParent=path.join(realRoot,id);mkdirSync(finalParent,{recursive:true});if(realpathSync(finalParent)!==finalParent)throw new StoreError('오디오 결과 경로가 올바르지 않습니다.',403);
  const final=path.join(finalParent,`attempt-${item.attempt}`);
  await validateCurrent();check();verifyEpisodeCopiedInputs(work,contract.report.visual);check();
  const db=dbOpen();try{transaction(db,()=>{
    const current=row(db,id);if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('오디오 조립 임대가 만료되거나 취소됐습니다.',409);
    const project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(current.project_id) as {revision:number;document:string}|undefined;
    if(!project||project.revision!==current.requested_revision||sha(project.document)!==current.snapshot_sha256)throw new StoreError('오디오 조립 계획 스냅샷이 변경됐습니다.',409);
    if(!audioAssemblyFingerprintsStillMatch(contract.report)||realpathSync(artifacts)!==artifacts||realpathSync(finalParent)!==finalParent)throw new StoreError('오디오 입력 또는 게시 경로가 변경됐습니다.',409);
    renameSync(artifacts,final);onPublished(final);
    for(const record of [{name:'provisional-voiced-episode.mp4' as const,bytes:output.bytes,sha256:output.sha256},{name:'provisional-voiced-episode.json' as const,bytes:receiptBytes.length,sha256:sha(receiptBytes)}])db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,record.name,`jobs/${id}/attempt-${item.attempt}/${record.name}`,record.bytes,record.sha256);
    const timestamp=now(),changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
    if(changed.changes!==1)throw new StoreError('오디오 조립이 취소됐습니다.',409);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
  });}finally{db.close();}
  return final;
}
export async function executeAudioAssemblyClaim(id:string,token:string,snapshot:Plan):Promise<Job>{
  const dbCheck=dbOpen();let item:Row;
  try{item=row(dbCheck,id);if(item.kind!=='audio-timed-assembly'||item.status!=='running'||item.lease_token!==token||sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('오디오 조립 임대 또는 스냅샷이 올바르지 않습니다.',409);}finally{dbCheck.close();}
  const deadline=Date.now()+3_600_000,controller=new AbortController();let heartbeatError:Error|null=null,staging:string|undefined,final:string|undefined,published=false;
  const heartbeat=setInterval(()=>{if(controller.signal.aborted)return;try{if(Date.now()>=deadline)throw new StoreError('오디오 조립의 60분 제한 시간이 지났습니다.',409);renewClaim(id,token,45);}catch(error){heartbeatError=error instanceof Error?error:new Error('오디오 조립 임대가 유효하지 않습니다.');controller.abort();}},1000);
  const check=()=>{if(controller.signal.aborted)throw heartbeatError??new StoreError('오디오 조립이 취소됐습니다.',409);if(Date.now()>=deadline)throw new StoreError('오디오 조립의 60분 제한 시간이 지났습니다.',409);renewClaim(id,token,45);};
  try{
    const contract=audioAssemblyJobContract(id);if(!contract.report.renderEligible||!contract.report.composition)throw new StoreError('실행 가능한 오디오 조립 계약이 아닙니다.',409);
    await revalidateAudioAssembly(id,snapshot,contract,controller.signal);check();
    const root=artifactRoot(),realRoot=realpathSync(root);if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep))throw new StoreError('오디오 작업 저장 경로가 올바르지 않습니다.',403);
    const parent=path.join(realRoot,'staging');mkdirSync(parent,{recursive:true});if(realpathSync(parent)!==parent)throw new StoreError('오디오 임시 경로가 올바르지 않습니다.',403);
    staging=path.join(parent,randomUUID());mkdirSync(staging);if(realpathSync(staging)!==staging)throw new StoreError('오디오 시도 경로가 올바르지 않습니다.',403);
    const work=path.join(staging,'work'),artifacts=path.join(staging,'artifacts');mkdirSync(work);mkdirSync(artifacts);
    copyEpisodeInputs(work,contract.report.visual);check();
    const contractBytes=Buffer.from(JSON.stringify(contract));if(contractBytes.length>5_000_000)throw new StoreError('오디오 조립 계약 크기가 제한을 넘었습니다.',409);writeFileSync(path.join(work,'contract.json'),contractBytes,{flag:'wx'});
    const result=await runAudioAssemblyChild({work,id,token,contractSha256:sha(contractBytes),deadline,signal:controller.signal});check();
    await revalidateAudioAssembly(id,snapshot,contract,controller.signal);check();verifyEpisodeCopiedInputs(work,contract.report.visual);check();
    final=await publishAudioAssemblyResult({id,token,work,artifacts,contract,result,
      validateCurrent:()=>revalidateAudioAssembly(id,snapshot,contract,controller.signal),check,
      onPublished:path=>{published=true;final=path;}});
  }catch(error){try{if(published&&final&&realpathSync(final)===final)rmSync(final,{recursive:true,force:true});}catch{}failClaim(id,token,error instanceof StoreError?error:new Error('오디오 조립이 실패했습니다. 최종 녹음과 제작 입력을 확인하세요.'));throw error;
  }finally{clearInterval(heartbeat);controller.abort();try{if(staging&&realpathSync(staging)===staging)rmSync(staging,{recursive:true,force:true});}catch{}}
  return getJob(id);
}

async function revalidateFinalization(id:string,snapshot:Plan,contract:FinalizationExecutionContract,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw new StoreError('최종화가 중단됐습니다.',409);
  const current=currentPlanForCanonical(snapshot.id,snapshot.revision);
  if(sha(JSON.stringify(current))!==sha(JSON.stringify(snapshot)))throw new StoreError('계획이 변경됐습니다. 새 최종화 작업을 요청하세요.',409);
  const fresh=await evaluateFinalization(current.id,current.revision,signal);
  if(!fresh.renderEligible||JSON.stringify(fresh)!==JSON.stringify(contract.report)||!finalizationFingerprintsStillMatch(contract.report))throw new StoreError('최종화 입력 또는 승인이 변경됐습니다.',409);
  const db=dbOpen();try{const item=row(db,id);if(item.kind!=='episode-finalization-export'||item.execution_contract_sha256!==sha(item.execution_contract_json??'')||item.execution_contract_json!==JSON.stringify(contract)||item.snapshot_sha256!==sha(item.snapshot_json))throw new StoreError('최종화 실행 계약이 변경됐습니다.',409);}finally{db.close();}
}
async function runFinalizationChild(input:{work:string;id:string;token:string;contractSha256:string;deadline:number;signal:AbortSignal}):Promise<FinalizationResult>{
  const root=realpathSync(process.cwd()),runner=realpathSync(path.join(root,'visualmaker','renderer','finalization-runner.ts'));
  if(!runner.startsWith(root+path.sep))throw new StoreError('최종화 실행 경로가 올바르지 않습니다.',403);
  return await new Promise((resolve,reject)=>{
    const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(process.execPath,['--experimental-strip-types',runner,'--finalization-child',input.work,input.contractSha256],{cwd:root,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
    let done=false,result:FinalizationResult|null=null,stopReason:Error|null=null,stage='resolve',killTimer:ReturnType<typeof setTimeout>|null=null;
    function kill(){if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}}
    function stop(reason:Error){if(stopReason)return;stopReason=reason;clearInterval(timer);if(child.connected)child.send({type:'cancel'});killTimer=setTimeout(kill,1200);}
    function finish(error?:Error){if(done)return;done=true;clearInterval(timer);input.signal.removeEventListener('abort',onAbort);if(killTimer)clearTimeout(killTimer);child.removeAllListeners();if(child.connected)child.disconnect();if(error)reject(error);else if(result)resolve(result);else reject(new StoreError(`최종화 실패: ${stage}`,503));}
    const onAbort=()=>stop(new Error('최종화가 취소됐습니다.'));input.signal.addEventListener('abort',onAbort,{once:true});
    const timer=setInterval(()=>{if(Date.now()>=input.deadline){stop(new Error('최종화 제한 시간이 지났습니다.'));return;}try{renewClaim(input.id,input.token,45);}catch{stop(new Error('최종화 임대가 만료되거나 취소됐습니다.'));}},1000);
    child.on('message',message=>{if(!message||typeof message!=='object'||!('type' in message))return;
      if(message.type==='finalization-stage'&&'stage' in message&&typeof message.stage==='string'&&['resolve','mix-decode','mix-pcm','mix-encode','subtitle-mux','thumbnail','verify','publish'].includes(message.stage))stage=message.stage;
      if(message.type==='finalization-result'&&'result' in message)result=message.result as FinalizationResult;
    });
    child.once('error',()=>finish(new StoreError('최종화 프로세스를 시작하지 못했습니다.',503)));
    child.once('exit',status=>finish(stopReason??(status===0&&result?undefined:new StoreError(`최종화 실패: ${stage}`,503))));
  });
}
function finalizationSourceDbMatches(db:Db,report:FinalizationReport):boolean{
  const binding=report.binding;if(!binding)return false;
  const source=db.prepare('SELECT * FROM visualmaker_jobs WHERE id=?').get(binding.selection.source.job_id) as Row|undefined;
  if(!source||source.kind!=='audio-timed-assembly'||source.status!=='succeeded'||source.attempt!==binding.selection.source.attempt||source.project_id!==report.scope.projectId||source.requested_revision!==report.scope.revision||source.snapshot_sha256!==report.scope.snapshotSha256||source.execution_contract_sha256!==binding.receipt.executionContractSha256||!source.finished_at||source.lease_token!==null||source.lease_expires_at!==null)return false;
  const attempt=db.prepare('SELECT ended_at,outcome FROM visualmaker_job_attempts WHERE job_id=? AND attempt=?').get(source.id,source.attempt) as {ended_at:string|null;outcome:string|null}|undefined;
  if(!attempt?.ended_at||attempt.outcome!=='succeeded')return false;
  const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(source.id) as Omit<JobArtifact,'productionAuthority'>[];
  if(records.length!==2||records.map(record=>record.name).join(',')!==[...AUDIO_FILES].sort().join(','))return false;
  const video=records.find(record=>record.name==='provisional-voiced-episode.mp4'),receipt=records.find(record=>record.name==='provisional-voiced-episode.json');
  return Boolean(video&&receipt&&video.path===`jobs/${source.id}/attempt-${source.attempt}/provisional-voiced-episode.mp4`&&receipt.path===`jobs/${source.id}/attempt-${source.attempt}/provisional-voiced-episode.json`&&video.sha256===binding.sourceSha256&&video.bytes===binding.sourceBytes&&receipt.sha256===binding.receiptSha256&&receipt.bytes>0&&receipt.bytes<=3_000_000);
}
async function publishFinalizationResult(input:{id:string;token:string;work:string;artifacts:string;contract:FinalizationExecutionContract;result:FinalizationResult;validateCurrent:()=>Promise<void>;check:()=>void;onPublished:(path:string)=>void}):Promise<string>{
  const {id,token,work,artifacts,contract,result,validateCurrent,check,onPublished}=input,binding=contract.report.binding;
  if(!binding||!contract.report.renderEligible||!contract.report.composition||result.productionAuthority!==false||result.reviewApproved!==false)throw new StoreError('최종화 발행 계약이 올바르지 않습니다.',409);
  const root=artifactRoot(),realRoot=realpathSync(root),stagingRoot=path.join(realRoot,'staging');
  if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep)||!work.startsWith(stagingRoot+path.sep)||realpathSync(work)!==work||path.dirname(work)!==path.dirname(artifacts)||realpathSync(artifacts)!==artifacts)throw new StoreError('최종화 게시 경로가 올바르지 않습니다.',403);
  const dbCheck=dbOpen();let item:Row;try{item=row(dbCheck,id);if(item.kind!=='episode-finalization-export'||item.status!=='running'||item.lease_token!==token||item.execution_contract_json!==JSON.stringify(contract)||item.execution_contract_sha256!==sha(JSON.stringify(contract)))throw new StoreError('최종화 게시 계약 또는 임대가 올바르지 않습니다.',409);}finally{dbCheck.close();}
  if(readdirSync(work).sort().join(',')!==['contract.json',...FINAL_FILES].sort().join(','))throw new StoreError('최종화 출력 파일 목록이 올바르지 않습니다.',409);
  const names=['export.mp4','export.srt','export.vtt','export.png'] as const;
  if(result.files.length!==5||result.files.map(file=>file.name).sort().join(',')!==[...FINAL_FILES].sort().join(','))throw new StoreError('최종화 측정 파일 목록이 올바르지 않습니다.',409);
  const measured=names.map(name=>{const file=path.join(work,name),fingerprint=streamedFileFingerprint(file,name==='export.mp4'?EPISODE_OUTPUT_LIMIT:name==='export.png'?200_000_000:5_000_000),claimed=result.files.find(record=>record.name===name);if(realpathSync(file)!==file||!claimed||claimed.sha256!==fingerprint.sha256||claimed.bytes!==fingerprint.bytes)throw new StoreError('최종화 파일이 측정 후 변경됐습니다.',409);return {name,...fingerprint};});
  const technicalPath=path.join(work,'export.json'),technicalFingerprint=streamedFileFingerprint(technicalPath,5_000_000),claimedTechnical=result.files.find(file=>file.name==='export.json');
  if(realpathSync(technicalPath)!==technicalPath||!claimedTechnical||claimedTechnical.sha256!==technicalFingerprint.sha256||claimedTechnical.bytes!==technicalFingerprint.bytes)throw new StoreError('최종화 기술 기록이 변경됐습니다.',409);
  const technical=parsePostLockJson(boundedCanonicalRead(technicalPath,technicalFingerprint.bytes,5_000_000),5_000_000) as Record<string,unknown>;
  const expectedSource={jobId:binding.selection.source.job_id,attempt:binding.selection.source.attempt,artifactSha256:binding.sourceSha256,receiptSha256:binding.receiptSha256};
  const expectedAuthority={episodeSpecSha256:binding.specSha256,preLockStateSha256:binding.preLockStateSha256,productionStateSha256:binding.stateSha256,addendumPath:binding.addendumPath,addendumSha256:binding.addendumSha256,finalScriptSha256:binding.scriptSha256,pictureMarkerSha256:binding.pictureMarkerSha256,captionMarkerSha256:binding.captionMarkerSha256,captionContractSha256:binding.captionContractSha256};
  if(technical.schemaVersion!==(binding.selection.version===2?'visualmaker-finalization-receipt-v2':'visualmaker-finalization-receipt-v1')||technical.episodeId!=='episode-001'||JSON.stringify(technical.source)!==JSON.stringify(expectedSource)||JSON.stringify(technical.authority)!==JSON.stringify(expectedAuthority)||binding.selection.version===1&&JSON.stringify(technical.mix)!==JSON.stringify({mode:'passthrough'})||JSON.stringify(technical.thumbnail)!==JSON.stringify(binding.selection.thumbnail)||JSON.stringify(technical.files)!==JSON.stringify(measured)||JSON.stringify(technical.measured)!==JSON.stringify(result.measured)||technical.ffmpegVersion!==result.ffmpegVersion||technical.productionAuthority!==false||technical.reviewApproved!==false)throw new StoreError('최종화 기술 기록이 입력 또는 측정 결과와 다릅니다.',409);
  if(binding.selection.version===2){validateFinalizationMixTechnical(technical.mix,binding,result.measured,result.mixMeasured);if(!result.mixMeasured)throw new StoreError('v2 믹스 실행 측정이 없습니다.',409);}
  for(const record of measured){copyFileSync(path.join(work,record.name),path.join(artifacts,record.name),constants.COPYFILE_EXCL);const copied=streamedFileFingerprint(path.join(artifacts,record.name),record.name==='export.mp4'?EPISODE_OUTPUT_LIMIT:record.name==='export.png'?200_000_000:5_000_000);if(copied.sha256!==record.sha256||copied.bytes!==record.bytes)throw new StoreError('최종화 게시 복사본이 다릅니다.',409);}
  const receipt:FinalizationJobReceipt={schemaVersion:binding.selection.version===2?'visualmaker-finalization-job-receipt-v2':'visualmaker-finalization-job-receipt-v1',artifactKind:'episode-finalization-export',episodeId:'episode-001',jobId:id,attempt:item.attempt,projectId:item.project_id,requestedRevision:item.requested_revision,snapshotSha256:item.snapshot_sha256,executionContractSha256:item.execution_contract_sha256!,source:expectedSource,...binding.selection.version===2?{mixApproval:{payloadSha256:binding.mixPayloadSha256!,markerSha256:binding.mixApprovalMarkerSha256!,rightsEvidence:binding.mixRightsEvidence!}}:{},technical,files:measured,productionAuthority:false,reviewApproved:false};
  const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');if(receiptBytes.length>5_000_000)throw new StoreError('최종화 기록 크기가 제한을 넘었습니다.',409);
  writeFileSync(path.join(artifacts,'export.json'),receiptBytes,{flag:'wx'});
  const finalParent=path.join(realRoot,id);mkdirSync(finalParent,{recursive:true});if(realpathSync(finalParent)!==finalParent)throw new StoreError('최종화 결과 경로가 올바르지 않습니다.',403);
  const final=path.join(finalParent,`attempt-${item.attempt}`);
  await validateCurrent();check();
  const db=dbOpen();try{transaction(db,()=>{
    const current=row(db,id);if(current.status!=='running'||current.lease_token!==token||current.attempt!==item.attempt||!current.lease_expires_at||current.lease_expires_at<=now())throw new StoreError('최종화 임대가 만료되거나 취소됐습니다.',409);
    const project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(current.project_id) as {revision:number;document:string}|undefined;
    if(!project||project.revision!==current.requested_revision||sha(project.document)!==current.snapshot_sha256||!finalizationFingerprintsStillMatch(contract.report)||realpathSync(artifacts)!==artifacts||realpathSync(finalParent)!==finalParent)throw new StoreError('최종화 계획 또는 입력이 변경됐습니다.',409);
    if(!finalizationSourceDbMatches(db,contract.report))throw new StoreError('원본 오디오 작업이 변경됐습니다.',409);
    renameSync(artifacts,final);onPublished(final);
    for(const record of [...measured,{name:'export.json' as const,bytes:receiptBytes.length,sha256:sha(receiptBytes)}])db.prepare('INSERT INTO visualmaker_job_artifacts(job_id,name,path,bytes,sha256) VALUES(?,?,?,?,?)').run(id,record.name,`jobs/${id}/attempt-${item.attempt}/${record.name}`,record.bytes,record.sha256);
    const timestamp=now(),changed=db.prepare("UPDATE visualmaker_jobs SET status='succeeded',progress=100,updated_at=?,finished_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").run(timestamp,timestamp,id,token);
    if(changed.changes!==1)throw new StoreError('최종화가 취소됐습니다.',409);
    db.prepare("UPDATE visualmaker_job_attempts SET ended_at=?,outcome='succeeded' WHERE job_id=? AND attempt=? AND outcome IS NULL").run(timestamp,id,item.attempt);
  });}finally{db.close();}
  return final;
}
export async function executeFinalizationClaim(id:string,token:string,snapshot:Plan):Promise<Job>{
  const dbCheck=dbOpen();let item:Row;try{item=row(dbCheck,id);if(item.kind!=='episode-finalization-export'||item.status!=='running'||item.lease_token!==token||sha(JSON.stringify(snapshot))!==item.snapshot_sha256)throw new StoreError('최종화 임대 또는 스냅샷이 올바르지 않습니다.',409);}finally{dbCheck.close();}
  const deadline=Date.now()+3_600_000,controller=new AbortController();let heartbeatError:Error|null=null,staging:string|undefined,stagingIdentity:string|undefined,final:string|undefined,published=false,finalizationV2=false,completed=false;
  const heartbeat=setInterval(()=>{if(controller.signal.aborted)return;try{if(Date.now()>=deadline)throw new StoreError('최종화 제한 시간이 지났습니다.',409);renewClaim(id,token,45);}catch(error){heartbeatError=error instanceof Error?error:new Error('최종화 임대가 유효하지 않습니다.');controller.abort();}},1000);
  const check=()=>{if(controller.signal.aborted)throw heartbeatError??new StoreError('최종화가 취소됐습니다.',409);if(Date.now()>=deadline)throw new StoreError('최종화 제한 시간이 지났습니다.',409);renewClaim(id,token,45);};
  try{
    const contract=finalizationJobContract(id);if(!contract.report.renderEligible||!contract.report.composition||!contract.report.binding)throw new StoreError('실행 가능한 최종화 계약이 아닙니다.',409);
    finalizationV2=contract.report.binding.selection.version===2;
    await revalidateFinalization(id,snapshot,contract,controller.signal);check();
    const root=artifactRoot(),realRoot=realpathSync(root);if(realRoot!==root||!realRoot.startsWith(realpathSync(dataRoot())+path.sep))throw new StoreError('최종화 저장 경로가 올바르지 않습니다.',403);
    const parent=path.join(realRoot,'staging');mkdirSync(parent,{recursive:true});if(realpathSync(parent)!==parent)throw new StoreError('최종화 임시 경로가 올바르지 않습니다.',403);
    if(finalizationV2)assertFinalizationV2StagingCapacity(parent,contract.report.binding.sourceBytes);
    staging=path.join(parent,randomUUID());mkdirSync(staging);if(realpathSync(staging)!==staging)throw new StoreError('최종화 시도 경로가 올바르지 않습니다.',403);
    const stageStat=lstatSync(staging,{bigint:true});if(!stageStat.isDirectory()||stageStat.isSymbolicLink()||stageStat.ino===0n)throw new StoreError('최종화 시도 소유권이 올바르지 않습니다.',403);stagingIdentity=`${stageStat.dev}:${stageStat.ino}`;
    if(finalizationV2&&finalizationStagingUuidCount(parent)>4){const current=lstatSync(staging,{bigint:true});if(current.isDirectory()&&!current.isSymbolicLink()&&`${current.dev}:${current.ino}`===stagingIdentity&&readdirSync(staging).length===0&&realpathSync(staging)===staging){rmdirSync(staging);staging=undefined;stagingIdentity=undefined;}throw new StoreError('v2 믹스 보존 시도 수가 한도를 넘었습니다. staging을 검토하세요.',507);}
    const work=path.join(staging,'work'),artifacts=path.join(staging,'artifacts');mkdirSync(work);mkdirSync(artifacts);
    const contractBytes=Buffer.from(JSON.stringify(contract));if(contractBytes.length>5_000_000)throw new StoreError('최종화 계약 크기가 제한을 넘었습니다.',409);writeFileSync(path.join(work,'contract.json'),contractBytes,{flag:'wx'});
    const result=await runFinalizationChild({work,id,token,contractSha256:sha(contractBytes),deadline,signal:controller.signal});check();
    await revalidateFinalization(id,snapshot,contract,controller.signal);check();
    final=await publishFinalizationResult({id,token,work,artifacts,contract,result,validateCurrent:()=>revalidateFinalization(id,snapshot,contract,controller.signal),check,onPublished:path=>{published=true;final=path;}});completed=true;
  }catch(error){try{if(published&&final&&realpathSync(final)===final)rmSync(final,{recursive:true,force:true});}catch{}failClaim(id,token,error instanceof StoreError?error:new Error('최종화가 실패했습니다. 입력 또는 승인을 다시 확인하세요.'));throw error;
  }finally{clearInterval(heartbeat);controller.abort();cleanupFinalizationStagingAttempt(staging,stagingIdentity,finalizationV2,completed);}
  return getJob(id);
}
function finalizationStagingUuidCount(parent:string):number{return readdirSync(parent,{withFileTypes:true}).filter(entry=>/^[a-f0-9-]{36}$/iu.test(entry.name)&&(entry.isDirectory()||entry.isSymbolicLink())).length;}
export function assertFinalizationV2StagingCapacity(parent:string,sourceBytes:number):void{
  if(realpathSync(parent)!==parent||parent!==realpathSync(path.join(dataRoot(),'jobs','staging'))||!Number.isSafeInteger(sourceBytes)||sourceBytes<1)throw new StoreError('v2 믹스 저장소 경로가 올바르지 않습니다.',403);
  if(finalizationStagingUuidCount(parent)>=4)throw new StoreError('v2 믹스 보존 시도 수가 한도를 넘었습니다. staging을 검토하세요.',507);
  const fs=statfsSync(parent),free=fs.bavail*fs.bsize,minimum=sourceBytes*2+1_500_000_000;
  if(!Number.isSafeInteger(free)||free<minimum)throw new StoreError('v2 믹스 저장 공간이 부족합니다. 보존된 실패 시도를 검토하고 공간을 확보하세요.',507);
}
export function cleanupFinalizationStagingAttempt(staging:string|undefined,expectedIdentity:string|undefined,v2:boolean,completed:boolean):'removed'|'retained'|'absent'{
  if(!staging)return 'absent';
  try{const parent=realpathSync(path.join(dataRoot(),'jobs','staging')),stat=lstatSync(staging,{bigint:true});if(path.dirname(staging)!==parent||!/^[a-f0-9-]{36}$/iu.test(path.basename(staging))||realpathSync(staging)!==staging||!stat.isDirectory()||stat.isSymbolicLink()||stat.ino===0n||`${stat.dev}:${stat.ino}`!==expectedIdentity)return 'retained';}catch{return 'retained';}
  // A killed v2 child may leave files whose inode ownership the parent never observed.
  // Preserve that private attempt for diagnosis instead of recursively deleting uncertain files.
  if(v2&&!completed)return 'retained';
  if(v2){try{
    if(realpathSync(staging)!==staging||readdirSync(staging).join(',')!=='work')return 'retained';
    const work=path.join(staging,'work');if(realpathSync(work)!==work||readdirSync(work).sort().join(',')!==['contract.json',...FINAL_FILES].sort().join(','))return 'retained';
    for(const name of ['contract.json',...FINAL_FILES]){const file=path.join(work,name),stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||realpathSync(file)!==file)return 'retained';}
  }catch{return 'retained';}}
  try{if(realpathSync(staging)===staging){rmSync(staging,{recursive:true,force:true});return 'removed';}}catch{}
  return 'retained';
}
export async function finalizationArtifactFile(id:string,scope:{projectId:string;baseRevision:number;attempt:number},name:typeof FINALIZATION_FILES[number]):Promise<{job:Job;receipt:FinalizationJobReceipt;mp4:{fd:number;bytes:number;identity:{size:number;mtimeMs:number;ino:number}};selectedBytes:Buffer|null}>{
  if(!FINAL_FILES.includes(name)||!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('최종화 파일 요청이 올바르지 않습니다.',409);
  const db=dbOpen();let fd:number|undefined;try{
    const item=row(db,id);if(item.kind!=='episode-finalization-export'||item.status!=='succeeded'||item.project_id!==scope.projectId||item.requested_revision!==scope.baseRevision||item.attempt!==scope.attempt||!item.finished_at||item.lease_token!==null||item.lease_expires_at!==null)throw new StoreError('완료된 최종화 작업 범위가 일치하지 않습니다.',409);
    const attempt=db.prepare('SELECT ended_at,outcome FROM visualmaker_job_attempts WHERE job_id=? AND attempt=?').get(id,scope.attempt) as {ended_at:string|null;outcome:string|null}|undefined;
    if(!attempt?.ended_at||attempt.outcome!=='succeeded')throw new StoreError('완료된 최종화 시도 기록이 없습니다.',409);
    const contract=finalizationJobContract(id);await revalidateFinalization(id,validatePlan(JSON.parse(item.snapshot_json)),contract);
    const records=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
    if(records.length!==5||records.map(record=>record.name).join(',')!==[...FINAL_FILES].sort().join(','))throw new StoreError('최종화 결과 목록이 변경됐습니다.',409);
    const root=realpathSync(dataRoot()),bytesByName=new Map<string,Buffer>();let video:{bytes:number;sha256:string;identity:{size:number;mtimeMs:number;ino:number}}|undefined;
    for(const record of records){
      if(record.path!==`jobs/${id}/attempt-${item.attempt}/${record.name}`)throw new StoreError('최종화 결과 경로가 변경됐습니다.',409);
      const absolute=path.resolve(root,record.path);if(!absolute.startsWith(root+path.sep)||realpathSync(absolute)!==absolute)throw new StoreError('최종화 파일이 저장소 밖을 가리킵니다.',403);
      if(record.name==='export.mp4'){fd=openSync(absolute,'r');const measured=streamedFdFingerprint(fd,EPISODE_OUTPUT_LIMIT);if(measured.bytes!==record.bytes||measured.sha256!==record.sha256)throw new StoreError('최종화 영상이 변경됐습니다.',409);video=measured;}
      else{const limit=record.name==='export.png'?200_000_000:5_000_000;const bytes=boundedCanonicalRead(absolute,record.bytes,limit);if(sha(bytes)!==record.sha256)throw new StoreError('최종화 부속 파일이 변경됐습니다.',409);bytesByName.set(record.name,bytes);}
    }
    const receipt=parsePostLockJson(bytesByName.get('export.json')!,5_000_000) as FinalizationJobReceipt,binding=contract.report.binding;
    const expectedSource=binding&&{jobId:binding.selection.source.job_id,attempt:binding.selection.source.attempt,artifactSha256:binding.sourceSha256,receiptSha256:binding.receiptSha256};
    if(!binding||!video||receipt.schemaVersion!==(binding.selection.version===2?'visualmaker-finalization-job-receipt-v2':'visualmaker-finalization-job-receipt-v1')||receipt.artifactKind!=='episode-finalization-export'||receipt.episodeId!=='episode-001'||receipt.jobId!==id||receipt.attempt!==item.attempt||receipt.projectId!==item.project_id||receipt.requestedRevision!==item.requested_revision||receipt.snapshotSha256!==item.snapshot_sha256||receipt.executionContractSha256!==item.execution_contract_sha256||JSON.stringify(receipt.source)!==JSON.stringify(expectedSource)||receipt.productionAuthority!==false||receipt.reviewApproved!==false||!Array.isArray(receipt.files)||JSON.stringify(receipt.files)!==JSON.stringify(['export.mp4','export.srt','export.vtt','export.png'].map(fileName=>{const record=records.find(record=>record.name===fileName)!;return {name:fileName,sha256:record.sha256,bytes:record.bytes};}))||!receipt.technical||receipt.technical.schemaVersion!==(binding.selection.version===2?'visualmaker-finalization-receipt-v2':'visualmaker-finalization-receipt-v1')||JSON.stringify(receipt.technical.files)!==JSON.stringify(receipt.files)||JSON.stringify(receipt.technical.source)!==JSON.stringify(receipt.source)||receipt.technical.productionAuthority!==false||receipt.technical.reviewApproved!==false)throw new StoreError('최종화 영수증이 작업 또는 파일과 다릅니다.',409);
    if(binding.selection.version===2){const approval=receipt.mixApproval;if(!approval||approval.payloadSha256!==binding.mixPayloadSha256||approval.markerSha256!==binding.mixApprovalMarkerSha256||JSON.stringify(approval.rightsEvidence)!==JSON.stringify(binding.mixRightsEvidence))throw new StoreError('v2 승인 입력 영수증이 다릅니다.',409);validateFinalizationMixTechnical(receipt.technical.mix,binding,receipt.technical.measured as FinalizationResult['measured']);}
    else if(receipt.mixApproval!==undefined||JSON.stringify(receipt.technical.mix)!==JSON.stringify({mode:'passthrough'}))throw new StoreError('v1 영수증 믹스 의미가 변경됐습니다.',409);
    await revalidateFinalization(id,validatePlan(JSON.parse(item.snapshot_json)),contract);
    const current=row(db,id),project=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(scope.projectId) as {revision:number;document:string}|undefined;
    const finalRecords=db.prepare('SELECT name,path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(id) as Omit<JobArtifact,'productionAuthority'>[];
    const videoAgain=streamedFdFingerprint(fd!,EPISODE_OUTPUT_LIMIT);
    if(current.status!=='succeeded'||current.attempt!==item.attempt||current.execution_contract_sha256!==item.execution_contract_sha256||!project||project.revision!==scope.baseRevision||sha(project.document)!==item.snapshot_sha256||!finalizationSourceDbMatches(db,contract.report)||JSON.stringify(finalRecords)!==JSON.stringify(records)||videoAgain.sha256!==video.sha256||videoAgain.bytes!==video.bytes||videoAgain.identity.ino!==video.identity.ino||videoAgain.identity.mtimeMs!==video.identity.mtimeMs)throw new StoreError('최종화 다운로드 중 작업 또는 원본이 변경됐습니다.',409);
    for(const record of records)if(record.name!=='export.mp4'){
      const file=path.resolve(root,record.path),fingerprint=streamedFileFingerprint(file,record.name==='export.png'?200_000_000:5_000_000);
      if(realpathSync(file)!==file||fingerprint.sha256!==record.sha256||fingerprint.bytes!==record.bytes)throw new StoreError('최종화 부속 파일이 다운로드 중 변경됐습니다.',409);
    }
    const selectedBytes=name==='export.mp4'?null:bytesByName.get(name)!;
    const result={job:publicJob(db,current),receipt,mp4:{fd:fd!,bytes:video.bytes,identity:video.identity},selectedBytes};fd=undefined;return result;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('최종화 결과를 안전하게 확인할 수 없습니다.',409);}finally{if(fd!==undefined)closeSync(fd);db.close();}
}
