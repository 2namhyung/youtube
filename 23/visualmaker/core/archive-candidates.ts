import {createHash} from 'node:crypto';
import {constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {Plan, Requirement} from './model.ts';
import {getProject, StoreError} from './store.ts';
import {attachUpload} from './upload.ts';

export const ARCHIVE_CANDIDATES_SCHEMA='visualmaker-archive-candidates-v1';
const SHA=/^[a-f0-9]{64}$/;
const LIMIT=20;
type MediaRow={id:number;media_type:string;path:string;sha256:string|null;mime_type:string;bytes:number|null;duration_seconds:number|null;
  license:string;attribution:string;properties_json:string;title:string};
type Meta={provider:string;providerId:string;query:string;itemUrl:string;creator:string;creatorField:'creator'|'publisher'|'';
  publisher:string;rightsStatus:string;retrievedAt:string};
export type ArchiveCandidate={archiveAssetId:number;title:string;provider:string;providerId:string;mediaType:'image'|'video'|null;
  sha256:string|null;bytes:number|null;mimeType:string;durationSeconds:number|null;itemUrl:string|null;creator:string;publisher:string;
  license:string;attribution:string;rightsStatus:string;retrievedAt:string;evidenceOnlyRequired:boolean;compatible:boolean;blockers:string[]};

function text(value:unknown,max=1000){return typeof value==='string'?value.trim().slice(0,max):'';}
function safeUrl(value:unknown){try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.toString():null;}catch{return null;}}
function metadata(row:MediaRow):Meta{
  let props:Record<string,unknown>={};
  try{const decoded=JSON.parse(row.properties_json);if(decoded&&typeof decoded==='object'&&!Array.isArray(decoded))props=decoded;}catch{/* malformed metadata is blocked */}
  const creator=text(props.creator,500);const publisher=text(props.publisher,500);
  return {provider:text(props.provider,200),providerId:text(props.providerId,200),query:text(props.query,500),
    itemUrl:safeUrl(props.itemUrl)||safeUrl(props.sourceUrl)||'',creator:creator||publisher,creatorField:creator?'creator':publisher?'publisher':'',
    publisher,rightsStatus:text(props.rightsStatus,500),retrievedAt:text(props.retrievedAt,100)};
}
function kind(row:MediaRow):'image'|'video'|null{return row.media_type==='photo'?'image':row.media_type==='video'?'video':null;}
function captureOnly(row:MediaRow){
  let props:Record<string,unknown>={};try{const value=JSON.parse(row.properties_json);if(value&&typeof value==='object'&&!Array.isArray(value))props=value;}catch{}
  const tags=[row.title,props.assetClass,props.sourceType,props.captureKind,props.kind].map(value=>text(value,500).toLowerCase());
  return row.media_type==='document'||props.evidenceOnly===true||tags.some(tag=>/screenshot|screen.?capture|webpage.?capture|스크린샷|화면.?캡처/.test(tag));
}
function fingerprint(row:MediaRow){return createHash('sha256').update(JSON.stringify({id:row.id,mediaType:row.media_type,path:row.path,
  sha256:row.sha256,mimeType:row.mime_type,bytes:row.bytes,duration:row.duration_seconds,license:row.license,
  attribution:row.attribution,title:row.title,properties:row.properties_json})).digest('hex');}
function focalRequirement(plan:Plan,requirementId:string){return plan.scenes.some(scene=>scene.candidates.some(option=>
  option.layers.some(layer=>layer.role==='focal'&&layer.requirementId===requirementId)));}
function candidate(row:MediaRow,requirement:Requirement,focal:boolean):ArchiveCandidate{
  const meta=metadata(row);const mediaType=kind(row);const blockers:string[]=[];
  if(!mediaType||mediaType!==requirement.mediaType)blockers.push('자료 유형이 요구와 다릅니다.');
  if(requirement.acquisition==='generated-keyframe')blockers.push('수집 원본은 Omni 생성 키프레임이 아닙니다.');
  if(focal&&captureOnly(row))blockers.push('화면 캡처·문서는 핵심 화면 원본으로 연결할 수 없습니다.');
  if(!SHA.test(row.sha256||''))blockers.push('원본 해시가 없습니다.');
  if(!Number.isSafeInteger(row.bytes)||!row.bytes||row.bytes>40_000_000)blockers.push('파일 크기가 없거나 40MB를 넘습니다.');
  if(!((mediaType==='image'&&['image/png','image/jpeg','image/webp'].includes(row.mime_type))||
    (mediaType==='video'&&['video/mp4','video/webm'].includes(row.mime_type))))blockers.push('지원하지 않는 MIME 형식입니다.');
  if(!meta.itemUrl||!meta.creator||!meta.provider||!meta.providerId||!row.license?.trim()||row.license.trim()==='확인 필요')
    blockers.push('원문 URL·제작자/기관·제공처·사용 조건 메타데이터가 불완전합니다.');
  return {archiveAssetId:row.id,title:text(row.title,500),provider:meta.provider,providerId:meta.providerId,mediaType,
    sha256:SHA.test(row.sha256||'')?row.sha256:null,bytes:row.bytes,mimeType:text(row.mime_type,100),durationSeconds:row.duration_seconds,
    itemUrl:meta.itemUrl||null,creator:meta.creator,publisher:meta.publisher,license:text(row.license,1000),
    attribution:text(row.attribution,1000),rightsStatus:meta.rightsStatus,retrievedAt:meta.retrievedAt,
    evidenceOnlyRequired:captureOnly(row),compatible:blockers.length===0,blockers};
}
function dbPath(){return path.resolve(process.env.ARCHIVE_DB_PATH||'data/archive.sqlite');}
function withArchive<T>(run:(db:DatabaseSync)=>T):T|null{
  const file=dbPath();if(!existsSync(file))return null;
  let db:DatabaseSync;
  try{if(!statSync(file).isFile())throw new Error('file');db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON');
    for(const [table,columns] of [['media_assets',['id','node_id','media_type','path','sha256','mime_type','bytes','duration_seconds','license','attribution','properties_json']],
      ['graph_nodes',['id','label']]] as const){
      const found=new Set((db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(item=>item.name));
      if(columns.some(name=>!found.has(name)))throw new Error('schema');
    }
  }catch{try{db!.close();}catch{}throw new StoreError('수집 보관함 형식이 호환되지 않습니다.',409);}
  try{return run(db);}catch(error){if(error instanceof StoreError)throw error;throw new StoreError('수집 보관함을 읽지 못했습니다.',409);}finally{db.close();}
}
function scope(id:unknown,baseRevision:unknown,requirementId:unknown){
  if(typeof id!=='string'||typeof requirementId!=='string'||!Number.isSafeInteger(Number(baseRevision)))throw new StoreError('프로젝트·리비전·자료 요구를 확인하세요.');
  const plan=getProject(id);if(plan.revision!==Number(baseRevision))throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.',409);
  const requirement=plan.requirements.find(row=>row.id===requirementId);if(!requirement)throw new StoreError('자료 요구를 찾을 수 없습니다.',404);
  return {plan,requirement};
}
function scoped(plan:Plan,requirement:Requirement){return {projectId:plan.id,revision:plan.revision,requirementId:requirement.id,scriptSha256:plan.script.rawSha256};}
const COLUMNS=`m.id,m.media_type,m.path,m.sha256,m.mime_type,m.bytes,m.duration_seconds,m.license,m.attribution,m.properties_json,g.label AS title`;
const FROM=' FROM media_assets m JOIN graph_nodes g ON g.id=m.node_id';
function escapeLike(q:string){return q.replace(/[\\%_]/g,'\\$&');}

export function listArchiveCandidates(input:{id:unknown;baseRevision:unknown;requirementId:unknown;q?:unknown;cursor?:unknown}){
  const {plan,requirement}=scope(input.id,input.baseRevision,input.requirementId);
  const q=input.q===undefined?'':text(input.q,201);if(typeof input.q!=='undefined'&&(typeof input.q!=='string'||input.q.length>200))throw new StoreError('검색어는 200자 이하여야 합니다.');
  const cursor=input.cursor===undefined||input.cursor===''?0:Number(input.cursor);
  if(!Number.isSafeInteger(cursor)||cursor<0)throw new StoreError('목록 위치가 올바르지 않습니다.');
  const result=withArchive(db=>{
    const searchable=`CASE WHEN json_valid(m.properties_json) THEN m.properties_json ELSE '{}' END`;
    const rows=db.prepare(`SELECT ${COLUMNS}${FROM} WHERE m.id>? AND (?='' OR g.label LIKE ? ESCAPE '\\' OR
      json_extract(${searchable},'$.provider') LIKE ? ESCAPE '\\' OR json_extract(${searchable},'$.query') LIKE ? ESCAPE '\\') ORDER BY m.id LIMIT ?`)
      .all(cursor,q,`%${escapeLike(q)}%`,`%${escapeLike(q)}%`,`%${escapeLike(q)}%`,LIMIT+1) as MediaRow[];
    const page=rows.slice(0,LIMIT);
    return {candidates:page.map(row=>candidate(row,requirement,focalRequirement(plan,requirement.id))),nextCursor:rows.length>LIMIT?String(page.at(-1)!.id):null};
  });
  return {schemaVersion:ARCHIVE_CANDIDATES_SCHEMA,scope:scoped(plan,requirement),productionAuthority:false as const,
    availability:result?'available' as const:'unavailable' as const,candidates:result?.candidates??[],nextCursor:result?.nextCursor??null};
}

/** Read at most the declared size plus one sentinel byte, including if the file grows after fstat. */
export function readArchiveBytesBounded(fd:number,recordedSize:number):Buffer{
  if(!Number.isSafeInteger(recordedSize)||recordedSize<1||recordedSize>40_000_000)
    throw new StoreError('수집 파일 크기가 허용 범위를 벗어났습니다.',409);
  const buffer=Buffer.allocUnsafe(recordedSize+1);
  let total=0;
  while(total<buffer.length){
    const count=readSync(fd,buffer,total,buffer.length-total,null);
    if(count===0)break;
    total+=count;
  }
  if(total!==recordedSize||fstatSync(fd).size!==recordedSize)
    throw new StoreError('수집 파일 크기가 읽는 동안 변경되었습니다.',409);
  return buffer.subarray(0,total);
}

function safeArchiveBytes(row:MediaRow):Buffer{
  const configured=path.resolve(process.env.ARCHIVE_RAW_ROOT||'data/raw');
  let root:string;
  try{root=realpathSync(configured);}catch{throw new StoreError('수집 원본 저장소를 찾을 수 없습니다.',409);}
  const target=path.isAbsolute(row.path)?path.resolve(row.path):path.resolve(root,row.path);
  const relative=path.relative(root,target);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new StoreError('수집 원본 경로가 허용 범위를 벗어났습니다.',409);
  let current=root;
  for(const part of relative.split(path.sep)){
    current=path.join(current,part);
    try{if(lstatSync(current).isSymbolicLink()||realpathSync(current)!==current)throw new Error('reparse');}
    catch{throw new StoreError('수집 원본 경로가 안전하지 않습니다.',409);}
  }
  let fd:number|null=null;
  try{
    fd=openSync(target,constants.O_RDONLY | (constants.O_NOFOLLOW||0));
    const stat=fstatSync(fd);if(!stat.isFile()||!Number.isSafeInteger(row.bytes)||stat.size!==row.bytes||stat.size>40_000_000)
      throw new StoreError('수집 파일의 크기 또는 유형이 기록과 다릅니다.',409);
    if(realpathSync(target)!==target)throw new StoreError('수집 원본 경로가 변경되었습니다.',409);
    const bytes=readArchiveBytesBounded(fd,row.bytes);
    if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)
      throw new StoreError('수집 파일 바이트가 보관함 기록과 다릅니다.',409);
    return bytes;
  }catch(error){if(error instanceof StoreError)throw error;throw new StoreError('수집 원본 파일을 읽을 수 없습니다.',409);}
  finally{if(fd!==null)closeSync(fd);}
}

export async function importArchiveCandidate(input:Record<string,unknown>){
  const keys=Object.keys(input).sort();const expected=['archiveAssetId','baseRevision','evidenceOnly','expectedSha256','id','requirementId','semanticNote'].sort();
  if(keys.some(key=>!expected.includes(key))||['id','baseRevision','requirementId','archiveAssetId','expectedSha256','semanticNote'].some(key=>!(key in input)))
    throw new StoreError('허용된 가져오기 필드만 입력하세요.');
  const {plan,requirement}=scope(input.id,input.baseRevision,input.requirementId);
  if(!Number.isSafeInteger(input.archiveAssetId)||Number(input.archiveAssetId)<=0||typeof input.expectedSha256!=='string'||!SHA.test(input.expectedSha256))
    throw new StoreError('수집 항목과 해시를 확인하세요.');
  if(typeof input.semanticNote!=='string'||!input.semanticNote.trim()||input.semanticNote.length>4000)
    throw new StoreError('대상·행동·구간과 연결되는 의미 메모를 입력하세요.');
  if(input.evidenceOnly!==undefined&&typeof input.evidenceOnly!=='boolean')throw new StoreError('자료 용도를 확인하세요.');
  if(requirement.assetId!==null)throw new StoreError('이미 자료가 연결된 요구입니다.',409);
  if(plan.scenes.some(scene=>scene.locked&&scene.candidates.some(option=>option.requirementIds.includes(requirement.id))))
    throw new StoreError('잠긴 장면의 자료는 변경할 수 없습니다.',423);
  const row=withArchive(db=>db.prepare(`SELECT ${COLUMNS}${FROM} WHERE m.id=?`).get(Number(input.archiveAssetId)) as MediaRow|undefined);
  if(!row)throw new StoreError('수집 항목을 찾을 수 없습니다.',404);
  const item=candidate(row,requirement,focalRequirement(plan,requirement.id));if(!item.compatible)throw new StoreError(item.blockers.join(' '),409);
  if(item.sha256!==input.expectedSha256)throw new StoreError('수집 항목이 변경되었습니다. 목록을 새로고침하세요.',409);
  const bytes=safeArchiveBytes(row);
  const meta=metadata(row);
  const evidenceOnly=input.evidenceOnly!==false;
  if(item.evidenceOnlyRequired&&!evidenceOnly)throw new StoreError('화면 캡처·문서 자료는 근거 확인 전용입니다.',409);
  const fields={originalName:`archive-${row.id}.${row.mime_type.split('/').at(-1)==='jpeg'?'jpg':row.mime_type.split('/').at(-1)}`,
    sourceUrl:meta.itemUrl,creator:meta.creator,rightsNote:`보관함 라이선스: ${row.license}. 출처 표기: ${row.attribution||'미기록'}. 권리 상태: ${meta.rightsStatus||'미확인'}. 실제 사용 전 원문·권리 확인 필요.`,
    semanticNote:input.semanticNote.trim(),evidenceOnly:String(evidenceOnly)};
  const provenance={version:1,archiveAssetId:row.id,provider:meta.provider,providerId:meta.providerId,creatorField:meta.creatorField,
    originalSha256:row.sha256,metadataSha256:fingerprint(row),productionAuthority:false};
  const next=await attachUpload(plan.id,plan.revision,requirement.id,bytes,fields,{archiveProvenance:provenance},row.mime_type);
  const asset=next.assets.find(asset=>asset.sha256===row.sha256&&next.requirements.find(r=>r.id===requirement.id)?.assetId===asset.id);
  if(!asset)throw new StoreError('등록 자료를 확인하지 못했습니다.',409);
  return {scope:scoped(next,requirement),archiveAssetId:row.id,inputSha256:row.sha256,assetId:asset.id,
    metadataSha256:provenance.metadataSha256,productionAuthority:false as const,plan:next};
}
