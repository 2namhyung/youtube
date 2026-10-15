import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,fstatSync,openSync,readSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {safeCanonicalFile} from './canonical-cut-render.ts';
import {streamedFileFingerprint} from './episode-provisional.ts';
import {StoreError} from './store.ts';
import type {AudioAssemblyReport} from './audio-assembly.ts';
import type {AudioAuthoritySnapshot,AudioAuthoritySnapshotFile} from '../renderer/audio-assembly-contract.ts';
import type {FinalizationSelection} from '../renderer/finalization-contract.ts';
import {parseFinalizationSelection,validateFinalizationApprovalMarker} from './finalization.ts';

export const POST_LOCK_SPEC='video/episodes/episode-001/episode-spec.json';
export const POST_LOCK_STATE='video/episodes/episode-001/production-state.json';
const HEX=/^[a-f0-9]{64}$/u;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const object=(value:unknown):value is Record<string,any>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,fields:readonly string[]):value is Record<string,any>=>object(value)&&Object.keys(value).sort().join('|')===[...fields].sort().join('|');
export function safeEpisodePath(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<300&&/^[A-Za-z0-9_./-]+$/u.test(value)&&!value.startsWith('/')&&!value.includes('//')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');}

export function readPostLockFile(root:string,relative:string,max=3_000_000):{bytes:Buffer;sha256:string}{
  if(!safeEpisodePath(relative))throw new StoreError('후속 제작 경로가 올바르지 않습니다.',409);
  const file=safeCanonicalFile(root,relative),fd=openSync(file,'r');
  try{const before=fstatSync(fd);if(!before.isFile()||before.size<1||before.size>max)throw new StoreError('후속 제작 파일 크기가 제한을 넘었습니다.',409);
    const bytes=Buffer.allocUnsafe(before.size);let used=0;while(used<before.size){const count=readSync(fd,bytes,used,before.size-used,used);if(!count)break;used+=count;}
    const after=fstatSync(fd);if(used!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)throw new StoreError('후속 제작 파일이 읽는 중 변경됐습니다.',409);
    return {bytes,sha256:sha(bytes)};
  }finally{closeSync(fd);}
}

// A lexical pass catches duplicate object keys that JSON.parse otherwise discards.
export function parsePostLockJson(bytes:Buffer,maxBytes=3_000_000):Record<string,any>{
  if(bytes.length<1||bytes.length>maxBytes)throw new StoreError('후속 제작 JSON 크기가 올바르지 않습니다.',409);
  let source:string;try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new StoreError('후속 제작 JSON UTF-8이 올바르지 않습니다.',409);}
  let offset=0;const fail=():never=>{throw new StoreError('후속 제작 JSON에 중복 키 또는 잘못된 값이 있습니다.',409);};
  const space=()=>{while(/[\x20\t\r\n]/u.test(source[offset]??'')&&offset<source.length)offset++;};
  const string=():string=>{if(source[offset]!=='"')fail();const start=offset++;for(;offset<source.length;offset++){if(source[offset]==='\\'){offset++;continue;}if(source[offset]==='"'){offset++;try{return JSON.parse(source.slice(start,offset)) as string;}catch{return fail();}}}return fail();};
  const value=(depth:number):void=>{if(depth>100)fail();space();const start=source[offset];
    if(start==='"'){string();return;}
    if(start==='{'){offset++;space();const seen=new Set<string>();if(source[offset]==='}'){offset++;return;}for(;;){space();const key=string();if(seen.has(key))fail();seen.add(key);space();if(source[offset++]!==':')fail();value(depth+1);space();const next=source[offset++];if(next==='}')return;if(next!==',')fail();}}
    if(start==='['){offset++;space();if(source[offset]===']'){offset++;return;}for(;;){value(depth+1);space();const next=source[offset++];if(next===']')return;if(next!==',')fail();}}
    const rest=source.slice(offset),number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(rest);
    if(number){if(!Number.isFinite(Number(number[0])))fail();offset+=number[0].length;return;}
    for(const literal of ['true','false','null'])if(rest.startsWith(literal)){offset+=literal.length;return;}
    fail();
  };
  value(0);space();if(offset!==source.length)fail();
  try{const parsed:unknown=JSON.parse(source);if(!object(parsed))return fail();return parsed;}catch{return fail();}
}
function decodeSnapshot(value:unknown,expectedPath:string):{bytes:Buffer;sha256:string}{
  if(!exact(value,['path','sha256','bytesBase64'])||value.path!==expectedPath||typeof value.sha256!=='string'||!HEX.test(value.sha256)||typeof value.bytesBase64!=='string'||value.bytesBase64.length>4_000_000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.bytesBase64))throw new StoreError('오디오 권한 스냅샷 형식이 올바르지 않습니다.',409);
  const bytes=Buffer.from(value.bytesBase64,'base64');if(bytes.length<1||bytes.length>3_000_000||bytes.toString('base64')!==value.bytesBase64||sha(bytes)!==value.sha256)throw new StoreError('오디오 권한 스냅샷 바이트가 다릅니다.',409);
  parsePostLockJson(bytes);return {bytes,sha256:value.sha256};
}
export function validateAudioAuthoritySnapshot(value:unknown,report:AudioAssemblyReport):{spec:{bytes:Buffer;sha256:string};state:{bytes:Buffer;sha256:string}}{
  if(!exact(value,['version','episodeSpec','productionState'])||value.version!==1)throw new StoreError('오디오 권한 스냅샷이 없습니다.',409);
  const spec=decodeSnapshot(value.episodeSpec,POST_LOCK_SPEC),state=decodeSnapshot(value.productionState,POST_LOCK_STATE);
  if(report.visual.fingerprints[POST_LOCK_SPEC]!==spec.sha256||report.fingerprints[POST_LOCK_STATE]!==state.sha256)throw new StoreError('오디오 스냅샷과 실제 제작 평가가 다릅니다.',409);
  return {spec,state};
}
export function captureAudioAuthoritySnapshot(root:string,report:AudioAssemblyReport):AudioAuthoritySnapshot{
  if(!report.renderEligible||!report.validators.some(gate=>gate.name==='validate-production-stage.mjs --lock audio-timed-assembly'&&gate.passed===true))throw new StoreError('오디오 조립 승인 게이트가 통과하지 않았습니다.',409);
  const spec=readPostLockFile(root,POST_LOCK_SPEC),state=readPostLockFile(root,POST_LOCK_STATE);
  if(report.visual.fingerprints[POST_LOCK_SPEC]!==spec.sha256||report.fingerprints[POST_LOCK_STATE]!==state.sha256)throw new StoreError('제작 평가 후 spec 또는 상태가 변경됐습니다.',409);
  const wrap=(file:string,value:{bytes:Buffer;sha256:string}):AudioAuthoritySnapshotFile=>({path:file,sha256:value.sha256,bytesBase64:value.bytes.toString('base64')});
  const snapshot:AudioAuthoritySnapshot={version:1,episodeSpec:wrap(POST_LOCK_SPEC,spec),productionState:wrap(POST_LOCK_STATE,state)};
  validateAudioAuthoritySnapshot(snapshot,report);return snapshot;
}
function structurallyEqual(left:unknown,right:unknown):boolean{
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>structurallyEqual(item,right[index]));
  if(object(left)||object(right))return object(left)&&object(right)&&Object.keys(left).sort().join('|')===Object.keys(right).sort().join('|')&&Object.keys(left).every(key=>structurallyEqual(left[key],right[key]));
  return Object.is(left,right);
}
export function validatePostLockTransition(snapshot:AudioAuthoritySnapshot,report:AudioAssemblyReport,currentSpecBytes:Buffer,currentStateBytes:Buffer,markerPath:string):{specSha256:string;stateSha256:string;preLockStateSha256:string}{
  const old=validateAudioAuthoritySnapshot(snapshot,report);
  if(sha(currentSpecBytes)!==old.spec.sha256)throw new StoreError('오디오 이후 에피소드 spec이 변경됐습니다.',409);
  const spec=parsePostLockJson(currentSpecBytes),before=parsePostLockJson(old.state.bytes),after=parsePostLockJson(currentStateBytes);
  if(!exact(spec.post_lock_output,['version','addendum_path'])||spec.post_lock_output.version!==1||!safeEpisodePath(spec.post_lock_output.addendum_path))throw new StoreError('고정된 최종화 addendum 위치가 없습니다.',409);
  if(!['final-voice-locked','audio-timed-assembly'].includes(before.stage)||!exact(before.picture_lock,['status','approved','final_qc_marker'])||before.picture_lock.approved!==false||after.stage!=='picture-locked'||!exact(after.picture_lock,['status','approved','final_qc_marker'])||after.picture_lock.status!=='locked'||after.picture_lock.approved!==true||after.picture_lock.final_qc_marker!==markerPath)throw new StoreError('picture lock 전환 상태가 올바르지 않습니다.',409);
  const reverted=structuredClone(after);reverted.stage=before.stage;reverted.picture_lock=structuredClone(before.picture_lock);
  if(!structurallyEqual(before,reverted))throw new StoreError('picture lock 외의 제작 상태가 변경됐습니다.',409);
  return {specSha256:old.spec.sha256,stateSha256:sha(currentStateBytes),preLockStateSha256:old.state.sha256};
}
export function readPostLockAddendum(root:string,spec:Record<string,any>,specSha256:string,preLockStateSha256:string,sourceContractSha256:string):{path:string;sha256:string;selection:FinalizationSelection}{
  const locator=spec.post_lock_output;if(!exact(locator,['version','addendum_path'])||locator.version!==1||!safeEpisodePath(locator.addendum_path)||!locator.addendum_path.startsWith('video/episodes/episode-001/'))throw new StoreError('에피소드 addendum 위치가 올바르지 않습니다.',409);
  const addendum=readPostLockFile(root,locator.addendum_path),value=parsePostLockJson(addendum.bytes);
  if(!exact(value,['schema_version','episode_id','authority','selection'])||value.schema_version!==1||value.episode_id!=='episode-001'||!exact(value.authority,['episode_spec_sha256','pre_lock_state_sha256','source_execution_contract_sha256'])||value.authority.episode_spec_sha256!==specSha256||value.authority.pre_lock_state_sha256!==preLockStateSha256||value.authority.source_execution_contract_sha256!==sourceContractSha256)throw new StoreError('최종화 addendum 권한 바이트가 다릅니다.',409);
  return {path:locator.addendum_path,sha256:addendum.sha256,selection:parseFinalizationSelection(value.selection)};
}
export function verifyPostLockMarkers(root:string,state:Record<string,any>,selection:FinalizationSelection,scriptSha256:string):{pictureSha256:string;captionSha256:string;captionContractSha256:string}{
  const markerPath=state.picture_lock?.final_qc_marker;if(!safeEpisodePath(markerPath))throw new StoreError('picture 승인 마커 경로가 없습니다.',409);
  const picture=readPostLockFile(root,markerPath),caption=readPostLockFile(root,selection.captions.approval_marker),captionContractSha256=sha(JSON.stringify({segments:selection.captions.segments}));
  if(picture.sha256!==selection.picture_marker_sha256||caption.sha256!==selection.captions.approval_marker_sha256)throw new StoreError('승인 마커 해시가 다릅니다.',409);
  const binding={jobId:selection.source.job_id,attempt:selection.source.attempt,artifactSha256:selection.source.artifact_sha256,receiptSha256:selection.source.receipt_sha256,scriptSha256,captionSha256:captionContractSha256,pictureSha256:picture.sha256};
  validateFinalizationApprovalMarker(parsePostLockJson(picture.bytes),'picture',binding);validateFinalizationApprovalMarker(parsePostLockJson(caption.bytes),'caption',binding);
  return {pictureSha256:picture.sha256,captionSha256:caption.sha256,captionContractSha256};
}
export function unchangedAudioFingerprints(root:string,report:AudioAssemblyReport):boolean{
  const seen=new Map<string,string>();
  for(const [relative,digest] of [...Object.entries(report.visual.fingerprints),...Object.entries(report.fingerprints)]){
    if(typeof digest!=='string'||!digest)return false;
    if(seen.has(relative)){if(seen.get(relative)!==digest)return false;continue;}seen.set(relative,digest);
    if(relative===POST_LOCK_STATE)continue;
    const media=relative.startsWith('video/public/')||relative.startsWith('video/qa/')||relative.startsWith('video/source-intake/episode-001/narration/final/');
    try{if(!digest||streamedFileFingerprint(safeCanonicalFile(root,relative),media?2_000_000_000:25_000_000).sha256!==digest)return false;}catch{return false;}
  }
  return true;
}
export async function currentPictureStage(root:string,signal?:AbortSignal):Promise<boolean>{
  return await new Promise(resolve=>{const child=spawn(process.execPath,[path.join(root,'video/scripts/validate-production-stage.mjs'),'--lock','picture-locked'],{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});let size=0,done=false;
    const finish=(passed:boolean)=>{if(done)return;done=true;clearTimeout(timer);resolve(passed);};const timer=setTimeout(()=>{child.kill();finish(false);},120_000);
    for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(false);}});
    child.once('error',()=>finish(false));child.once('close',code=>finish(code===0&&size<=1_000_000&&!signal?.aborted));
  });
}
