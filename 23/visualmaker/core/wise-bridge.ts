import {createHash,randomBytes} from 'node:crypto';
import {lstatSync,realpathSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {runBoundedProcess} from './youtube-cli.ts';
import type {CliRunner} from './youtube-cli.ts';
import {getProject,StoreError} from './store.ts';
import {attachUpload,measureAssetBytes} from './upload.ts';
import {reviewStates} from './director.ts';
import type {Plan,Requirement} from './model.ts';

export const WISE_BRIDGE_SCHEMA='visualmaker-wise-bridge-v1' as const;
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const safe=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const meaningfulNote=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=4000&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const optional=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
type Scope={projectId:unknown;baseRevision:unknown;requirementId:unknown;scriptSha256:unknown};
type SearchInput=Scope&{query:unknown};
type Span={startSeconds:number;endSeconds:number};
type Card={sourceId:string;wiseMediaId:string;sha256:string;metadataSha256:string;kind:'image'|'video';title:string;creator:string;
  sourceUrl:string;license:string;licenseUrl:string;rightsEvidence:string;rightsConfirmed:boolean;durationSeconds:number|null;
  rawSpan:Span;selectedSpan:Span;selectionToken:string};
type ImportInput=Scope&{sourceId:unknown;wiseMediaId:unknown;sha256:unknown;metadataSha256:unknown;selectedSpan:unknown;
  selectionToken:unknown;semanticNote:unknown;evidenceOnly:unknown};
const state=globalThis as typeof globalThis & {visualmakerWiseSelections?:Map<string,{scope:string;query:string;card:Card;expires:number}>};
const selections=state.visualmakerWiseSelections??=new Map<string,{scope:string;query:string;card:Card;expires:number}>();
const ttl=5*60_000;
const offlineReasons=new Set(['invalid-request','unsafe-path','missing-directory','missing-backend','missing-database',
  'database-unavailable','catalog-too-large','wise-not-configured','wise-offline','source-unavailable','source-changed',
  'invalid-span','invalid-or-unavailable-source']);
const scopeKey=(scope:Scope)=>JSON.stringify([scope.projectId,scope.baseRevision,scope.requirementId,scope.scriptSha256]);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const publicScope=(plan:Plan,req:Requirement)=>({projectId:plan.id,revision:plan.revision,requirementId:req.id,scriptSha256:plan.script.rawSha256});
const checkedSpan=(v:unknown,duration:number|null,kind:'image'|'video',raw=false):v is Span=>record(v)&&exact(v,['startSeconds','endSeconds'])&&
  typeof v.startSeconds==='number'&&Number.isFinite(v.startSeconds)&&v.startSeconds>=0&&
  typeof v.endSeconds==='number'&&Number.isFinite(v.endSeconds)&&v.endSeconds>=v.startSeconds&&
  (kind==='image'?v.startSeconds===0&&v.endSeconds===0:
    duration!==null&&Number.isFinite(duration)&&duration>0&&v.endSeconds>v.startSeconds&&v.endSeconds<=10_000_000&&
    (raw||v.endSeconds<=duration&&v.startSeconds<duration));

export function validateWiseScope(input:Scope){
  if(!safe(input.projectId,200)||!safe(input.requirementId,200)||!Number.isSafeInteger(input.baseRevision)||Number(input.baseRevision)<1||!sha(input.scriptSha256))
    throw new StoreError('현재 프로젝트 범위가 올바르지 않습니다.');
  const plan=getProject(input.projectId),requirement=plan.requirements.find(row=>row.id===input.requirementId);
  if(plan.revision!==input.baseRevision||plan.script.rawSha256!==input.scriptSha256)throw new StoreError('프로젝트가 변경됐습니다. 다시 불러오세요.',409);
  if(!requirement)throw new StoreError('자료 요구를 찾을 수 없습니다.',404);
  if(!['image','video'].includes(requirement.mediaType)||!['external','official'].includes(requirement.acquisition)||requirement.assetId!==null)
    throw new StoreError('이 자료 요구에서 WISE 원본을 연결할 수 없습니다.',409);
  const owners=plan.scenes.filter(scene=>scene.candidates.some(candidate=>candidate.requirementIds.includes(requirement.id)));
  const selected=owners[0]?.candidates.find(candidate=>candidate.id===owners[0].selectedCandidateId);
  if(owners.length!==1||owners[0].locked||selected?.mode!==(requirement.mediaType==='video'?'source-video':'source-photo')||
    !selected.requirementIds.includes(requirement.id))throw new StoreError('선택한 미잠금 장면의 자료 요구만 검색할 수 있습니다.',409);
  return {plan,requirement};
}

function config(){
  let python=process.env.WISE_PYTHON||'';
  if(!python&&process.env.LOCALAPPDATA){
    const root=path.join(process.env.LOCALAPPDATA,'Programs','Python');
    try{for(const name of readdirSync(root).filter(value=>/^Python\d{2,3}$/.test(value)).sort().reverse()){
      const candidate=path.join(root,name,'python.exe');
      try{if(lstatSync(candidate).isFile()&&!lstatSync(candidate).isSymbolicLink()&&realpathSync(candidate).toLowerCase()===candidate.toLowerCase()){
        python=candidate;break;
      }}catch{/* Try next installed Python. */}
    }}catch{/* Missing Python installs are reported below. */}
  }
  if(!python)throw new StoreError('WISE 연결용 Python 실행환경을 사용할 수 없습니다.',503);
  const script=path.resolve('visualmaker/scripts/wise_bridge.py');
  for(const file of [python,script]){
    try{const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(file).toLowerCase()!==path.resolve(file).toLowerCase())throw Error();}
    catch{throw new StoreError('WISE 연결 실행환경을 사용할 수 없습니다.',503);}
  }
  const trustedEnv:Record<string,string>={};
  for(const key of ['WISE_STUDIO_ROOT','STUDIO_DATA_DIR','STUDIO_DB_PATH','WISE_URL','WISE_SEARCH_PATH','WISE_PROJECT_NAME','WISE_FEATURE_EXTRACTOR_ID'])
    if(process.env[key])trustedEnv[key]=process.env[key]!;
  return {python,script,trustedEnv};
}
async function call(action:'search'|'import',payload:Record<string,unknown>,runner?:CliRunner,signal?:AbortSignal){
  const input=Buffer.from(JSON.stringify(payload)).toString('base64');
  const {python,script,trustedEnv}=runner?{python:'',script:path.resolve('visualmaker/scripts/wise_bridge.py'),trustedEnv:{}}:config();
  const args=['-I','-B',script,action,input];
  let raw:Buffer;
  try{raw=await (runner??(request=>runBoundedProcess(python,request)))({args,maxBytes:action==='search'?200_000:54_000_000,
    timeoutMs:action==='search'?20_000:30_000,signal,trustedEnv});}
  catch(error){if(signal?.aborted)throw new StoreError('WISE 요청이 취소됐습니다.',409);
    if(error instanceof StoreError&&error.status===504)throw new StoreError('WISE 응답 시간이 초과됐습니다.',504);
    throw new StoreError('WISE 연결을 사용할 수 없습니다.',503);}
  let result:unknown;try{result=JSON.parse(raw.toString('utf8'));}catch{throw new StoreError('WISE 연결 응답을 읽을 수 없습니다.',502);}
  if(!record(result)||!['available','unavailable'].includes(String(result.status)))throw new StoreError('WISE 연결 응답이 올바르지 않습니다.',502);
  if(result.status==='unavailable')throw new StoreError(`WISE가 준비되지 않았습니다: ${typeof result.reason==='string'&&offlineReasons.has(result.reason)?result.reason:'연결 상태를 확인하세요.'}`,503);
  return result;
}
function checkedCard(raw:unknown,kind:'image'|'video'):Omit<Card,'rawSpan'|'selectedSpan'|'selectionToken'>|null{
  if(!record(raw)||!safe(raw.sourceId,200)||!safe(raw.wiseMediaId,220)||!sha(raw.sha256)||!sha(raw.metadataSha256)||raw.kind!==kind||
    !safe(raw.title,300)||!safe(raw.creator,500)||!safe(raw.sourceUrl,2048)||!safe(raw.license,200)||
    !optional(raw.licenseUrl,2048)||!optional(raw.rightsEvidence,2000)||typeof raw.rightsConfirmed!=='boolean'||
    !(kind==='image'?raw.durationSeconds===null:typeof raw.durationSeconds==='number'&&Number.isFinite(raw.durationSeconds)&&raw.durationSeconds>0))return null;
  try{for(const value of [raw.sourceUrl,...(raw.licenseUrl?[raw.licenseUrl]:[])]){
    const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  }}catch{return null;}
  return {sourceId:raw.sourceId,wiseMediaId:raw.wiseMediaId,sha256:raw.sha256,metadataSha256:raw.metadataSha256,
    kind,title:raw.title,creator:raw.creator,sourceUrl:raw.sourceUrl,license:raw.license,licenseUrl:raw.licenseUrl,
    rightsEvidence:raw.rightsEvidence,rightsConfirmed:raw.rightsConfirmed,durationSeconds:raw.durationSeconds as number|null};
}
const sweep=()=>{const now=Date.now();for(const [key,value] of selections)if(value.expires<now)selections.delete(key);
  while(selections.size>500)selections.delete(selections.keys().next().value!);};
export async function searchWiseSources(input:SearchInput,options:{runner?:CliRunner;signal?:AbortSignal}={}){
  if(!safe(input.query,120)||input.query.trim()!==input.query||input.query.length<2)throw new StoreError('검색어는 2–120자 한 줄로 입력하세요.');
  const initial=validateWiseScope(input),kind=initial.requirement.mediaType as 'image'|'video';
  const result=await call('search',{kind,query:input.query},options.runner,options.signal);
  const current=validateWiseScope(input);if(options.signal?.aborted)throw new StoreError('WISE 요청이 취소됐습니다.',409);
  const counts=result.counts;
  if(!Array.isArray(result.candidates)||result.candidates.length>5||!record(counts)||
    !['hits','verified','unresolved'].every(key=>Number.isSafeInteger(counts[key])&&Number(counts[key])>=0&&Number(counts[key])<=500))
    throw new StoreError('WISE 검색 결과가 올바르지 않습니다.',502);
  sweep();const candidates:Card[]=[];
  for(const row of result.candidates){
    const item=checkedCard(row,kind);
    if(!item||!record(row)||!checkedSpan(row.rawSpan,item.durationSeconds,kind,true)||!checkedSpan(row.selectedSpan,item.durationSeconds,kind))continue;
    const token=randomBytes(24).toString('hex');
    const card={...item,rawSpan:row.rawSpan,selectedSpan:row.selectedSpan,selectionToken:token};
    selections.set(token,{scope:scopeKey(input),query:input.query,card,expires:Date.now()+ttl});candidates.push(card);
  }
  return {schemaVersion:WISE_BRIDGE_SCHEMA,scope:publicScope(current.plan,current.requirement),query:input.query,status:'available' as const,
    candidates,counts:{hits:Number(counts.hits),verified:candidates.length,unresolved:Number(counts.unresolved)},
    productionAuthority:false as const};
}
export async function importWiseSource(input:ImportInput,options:{runner?:CliRunner;signal?:AbortSignal}={}){
  const initial=validateWiseScope(input),kind=initial.requirement.mediaType as 'image'|'video';
  if(!safe(input.sourceId,200)||!safe(input.wiseMediaId,220)||!sha(input.sha256)||!sha(input.metadataSha256)||
    !safe(input.selectionToken,100)||!meaningfulNote(input.semanticNote)||typeof input.evidenceOnly!=='boolean')
    throw new StoreError('WISE 자료 선택과 의미 대응을 확인하세요.');
  if(input.evidenceOnly&&initial.plan.scenes.some(scene=>scene.candidates.some(candidate=>candidate.layers.some(layer=>layer.role==='focal'&&layer.requirementId===initial.requirement.id))))
    throw new StoreError('핵심 화면 요구에는 근거 전용 자료를 연결할 수 없습니다.',409);
  sweep();const selection=selections.get(input.selectionToken);
  if(!selection||selection.scope!==scopeKey(input)||selection.expires<Date.now()||selection.card.sourceId!==input.sourceId||
    selection.card.wiseMediaId!==input.wiseMediaId||selection.card.sha256!==input.sha256||
    selection.card.metadataSha256!==input.metadataSha256||JSON.stringify(selection.card.selectedSpan)!==JSON.stringify(input.selectedSpan))
    throw new StoreError('WISE 검색 선택이 만료되거나 변경됐습니다. 다시 검색하세요.',409);
  const selected=selection.card;
  if(!checkedSpan(input.selectedSpan,selected.durationSeconds,kind))throw new StoreError('WISE 구간이 올바르지 않습니다.',409);
  const result=await call('import',{kind,sourceId:input.sourceId,wiseMediaId:input.wiseMediaId,sha256:input.sha256,
    metadataSha256:input.metadataSha256,selectedSpan:input.selectedSpan},options.runner,options.signal);
  if(!record(result.source)||!checkedCard(result.source,kind)||!safe(result.bytesBase64,53_333_336)||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.bytesBase64))
    throw new StoreError('WISE 원본 응답이 올바르지 않습니다.',502);
  const source=result.source as unknown as ReturnType<typeof checkedCard>;
  if(!source||Object.keys(source).some(key=>JSON.stringify(source[key as keyof typeof source])!==JSON.stringify(selected[key as keyof Card]))||
    JSON.stringify(result.selectedSpan)!==JSON.stringify(selected.selectedSpan))throw new StoreError('WISE 원본 정보가 변경됐습니다.',409);
  const bytes=Buffer.from(result.bytesBase64,'base64');
  if(!bytes.length||bytes.length>40_000_000||hash(bytes)!==selected.sha256)throw new StoreError('WISE 원본 바이트가 변경됐습니다.',409);
  const measured=await measureAssetBytes(bytes,kind);
  if(kind==='video'&&(measured.durationSeconds===null||selected.selectedSpan.endSeconds>measured.durationSeconds))
    throw new StoreError('WISE 구간이 원본 영상 길이를 벗어납니다.',409);
  if(options.signal?.aborted)throw new StoreError('WISE 요청이 취소됐습니다.',409);
  const current=validateWiseScope(input);
  if(current.plan.assets.some(asset=>asset.sha256===selected.sha256))throw new StoreError('같은 바이트의 자료가 이미 있습니다.',409);
  const receipt={wiseSourceProvenance:{version:1,sourceId:selected.sourceId,wiseMediaId:selected.wiseMediaId,sourceSha256:selected.sha256,
    metadataSha256:selected.metadataSha256,query:selection.query,rawSpan:selected.rawSpan,selectedSpan:selected.selectedSpan,
    originalDurationSeconds:selected.durationSeconds,rightsConfirmedInSourceLibrary:selected.rightsConfirmed,
    canonicalRights:{license:selected.license,licenseUrl:selected.licenseUrl,rightsEvidence:selected.rightsEvidence,
      creator:selected.creator,sourceUrl:selected.sourceUrl},
    importedAt:new Date().toISOString(),productionAuthority:false}};
  const fullRightsNote=`기존 자료실 표시: ${selected.license}. ${selected.licenseUrl} ${selected.rightsEvidence}. VisualMaker 권리 검토 대기.`;
  const rightsNote=fullRightsNote.length<=4000?fullRightsNote:
    `기존 자료실 표시: ${selected.license}. 전체 라이선스 URL과 권리 근거는 WISE 원본 수집 기록에 보존됨. VisualMaker 권리 검토 대기.`;
  const fields={originalName:`wise-${selected.sourceId}.${measured.ext}`,sourceUrl:selected.sourceUrl,creator:selected.creator,
    rightsNote,
    semanticNote:input.semanticNote.trim(),evidenceOnly:String(input.evidenceOnly)};
  const plan=await attachUpload(current.plan.id,current.plan.revision,current.requirement.id,bytes,fields,receipt,measured.mimeType,options.signal);
  selections.delete(input.selectionToken);
  const assetId=plan.requirements.find(row=>row.id===current.requirement.id)?.assetId;
  if(!assetId)throw new StoreError('등록된 WISE 원본을 확인할 수 없습니다.',409);
  return {schemaVersion:WISE_BRIDGE_SCHEMA,scope:publicScope(plan,current.requirement),assetId,inputSha256:selected.sha256,
    metadataSha256:selected.metadataSha256,productionAuthority:false as const,plan,sourceReviewStates:reviewStates(plan)};
}
