import type {Plan} from '../../../visualmaker/core/model';

export const MAX_BACKUP_BYTES=128*1024*1024;
export type BackupScope={projectId:string;revision:number;scriptSha256:string;token:string};
export type BackupSummary={sourceProjectId:string;sourceRevision:number;assets:number;recordings:number;timingDrafts:number;
  clearedSourceReviews:number;clearedSourceReceiptExtensions:number;clearedAIAdoption:number;clearedEpisodeOrigin:number;
  clearedSceneOriginCutIds:number;clearedTimingAttestations:number;productionAuthority:false};
export type RestoredBackup={plan:Plan;summary:BackupSummary};

const HASH=/^[a-f0-9]{64}$/u,ID=/^[a-zA-Z0-9_-]{1,200}$/u;
const bad=()=>{throw new Error('백업 응답을 검증하지 못했습니다. 프로젝트 목록을 새로고침해 사본을 확인하세요.');};
function row(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return bad();
  const source=value as Record<string,unknown>,allowed=new Set([...required,...optional]);
  if(required.some(key=>!Object.hasOwn(source,key))||Object.keys(source).some(key=>!allowed.has(key)))return bad();
  return source;
}
function list(value:unknown,limit=20_000):unknown[]{if(!Array.isArray(value)||value.length>limit)return bad();return value;}
function str(value:unknown,max=30_000,empty=false):string{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim()))return bad();return value;}
function id(value:unknown):string{const valueText=str(value,200);if(!ID.test(valueText))return bad();return valueText;}
function sha(value:unknown):string{if(typeof value!=='string'||!HASH.test(value))return bad();return value;}
function integer(value:unknown,min=0,max=1_000_000_000):number{if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)return bad();return Number(value);}
function number(value:unknown,min=0,max=1_000_000_000):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return bad();return value;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')return bad();return value;}
function one<T extends string>(value:unknown,choices:readonly T[]):T{if(typeof value!=='string'||!choices.includes(value as T))return bad();return value as T;}
function nullable<T>(value:unknown,parse:(v:unknown)=>T):T|null{return value===null?null:parse(value);}
function unique(values:readonly string[]):void{if(new Set(values).size!==values.length)bad();}
function date(value:unknown):string{const text=str(value,100);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(text)||Number.isNaN(Date.parse(text)))return bad();return text;}
function forbidAuthority(value:unknown,depth=0):void{
  if(depth>16)return bad();
  if(Array.isArray(value)){for(const item of value)forbidAuthority(item,depth+1);return;}
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    if(/^(?:approval|approved|productionReady|sourceReady|renderAuthority|readyFor|published|finalized)$/iu.test(key)||
      (key==='productionAuthority'&&item!==false))bad();
    forbidAuthority(item,depth+1);
  }
}
function segment(value:unknown,points:string[]){const v=row(value,['id','start','end','text','kind']);
  const start=integer(v.start,0,points.length),end=integer(v.end,1,points.length),text=str(v.text);
  if(end<=start||points.slice(start,end).join('')!==text)return bad();
  return {id:id(v.id),start,end,text,kind:one(v.kind,['narration','note','reference'] as const)};
}
function candidate(value:unknown){const v=row(value,['id','label','mode','reason','rejectedModes','startState','change','endState','requirementIds','layers','effort','effortBasis','reuseFromSceneId','reuseReason','provider','grammarStatus']);
  const layers=list(v.layers,1000).map(item=>{const l=row(item,['id','role','description','requirementId']);return {
    id:id(l.id),role:one(l.role,['focal','supporting','chrome'] as const),description:str(l.description),
    requirementId:nullable(l.requirementId,id)};});
  const requirementIds=list(v.requirementIds,1000).map(id);unique(requirementIds);unique(layers.map(l=>l.id));
  if(layers.filter(l=>l.role==='focal').length!==1||layers.some(l=>l.requirementId!==null&&!requirementIds.includes(l.requirementId)))return bad();
  const mode=one(v.mode,['source-photo','source-video','remotion','omni'] as const);
  const rejectedModes=list(v.rejectedModes,16).map(item=>str(item,200));if(rejectedModes.includes(mode))return bad();
  return {id:id(v.id),label:str(v.label,500),mode,reason:str(v.reason),rejectedModes,startState:str(v.startState),
    change:str(v.change),endState:str(v.endState),requirementIds,layers,effort:one(v.effort,['low','medium','high'] as const),
    effortBasis:str(v.effortBasis),reuseFromSceneId:nullable(v.reuseFromSceneId,id),reuseReason:str(v.reuseReason,30_000,true),
    provider:one(v.provider,['local-rules','episode-import','user'] as const),grammarStatus:one(v.grammarStatus,['unverified'] as const)};
}
function projectPlan(value:unknown):Plan{
  const v=row(value,['schemaVersion','id','title','revision','createdAt','updatedAt','productionAuthority','script','beats','scenes','requirements','assets','decisions','sourceReviews'],['narrationTakes','narrationTimings']);
  if(v.schemaVersion!=='visualmaker-plan-v1'||v.productionAuthority!==false)return bad();
  const scriptRow=row(v.script,['id','rawText','rawSha256','segments','history']);
  const rawText=str(scriptRow.rawText,100_000),points=Array.from(rawText);
  const segments=list(scriptRow.segments).map(item=>segment(item,points));unique(segments.map(s=>s.id));
  let previousStart=-1;const covered=new Set<number>();
  for(const item of segments){if(item.start<=previousStart)return bad();previousStart=item.start;
    for(let at=item.start;at<item.end;at++)if(/\S/u.test(points[at])){if(covered.has(at))return bad();covered.add(at);}}
  for(let at=0;at<points.length;at++)if(/\S/u.test(points[at])&&!covered.has(at))return bad();
  const history=list(scriptRow.history).map(item=>{const h=row(item,['id','rawText','rawSha256']);return {id:id(h.id),rawText:str(h.rawText,100_000),rawSha256:sha(h.rawSha256)};});unique(history.map(h=>h.id));
  const script={id:id(scriptRow.id),rawText,rawSha256:sha(scriptRow.rawSha256),segments,history};
  const beats=list(v.beats).map(item=>{const b=row(item,['id','segmentIds','intent','role','claimReview']);return {
    id:id(b.id),segmentIds:list(b.segmentIds).map(id),intent:str(b.intent),role:one(b.role,['context','action','comparison','process','evidence','fiction'] as const),
    claimReview:one(b.claimReview,['pending','not-applicable'] as const)};});unique(beats.map(b=>b.id));
  const requirements=list(v.requirements).map(item=>{const r=row(item,['id','description','mediaType','acquisition','epistemicRole','queryKo','queryEn','sourceConstraint','assetId']);return {
    id:id(r.id),description:str(r.description),mediaType:one(r.mediaType,['image','video','data'] as const),
    acquisition:one(r.acquisition,['external','official','generated-keyframe'] as const),
    epistemicRole:one(r.epistemicRole,['evidence','context','illustration'] as const),queryKo:str(r.queryKo,500,true),
    queryEn:str(r.queryEn,500,true),sourceConstraint:str(r.sourceConstraint,2000),assetId:nullable(r.assetId,id)};});unique(requirements.map(r=>r.id));
  const assets=list(v.assets).map(item=>{const a=row(item,['id','originalName','mediaType','path','sha256','mimeType','width','height','durationSeconds','sourceUrl','creator','rightsNote','semanticNote','status','evidenceOnly']);return {
    id:id(a.id),originalName:str(a.originalName,500),mediaType:one(a.mediaType,['image','video','data'] as const),
    path:str(a.path,200),sha256:sha(a.sha256),mimeType:str(a.mimeType,200),width:nullable(a.width,x=>integer(x,1,100000)),
    height:nullable(a.height,x=>integer(x,1,100000)),durationSeconds:nullable(a.durationSeconds,x=>number(x,0.001)),
    sourceUrl:str(a.sourceUrl,4000,true),creator:str(a.creator,500,true),rightsNote:str(a.rightsNote,10000,true),
    semanticNote:str(a.semanticNote,10000,true),status:one(a.status,['pending-review'] as const),evidenceOnly:bool(a.evidenceOnly)};});unique(assets.map(a=>a.id));unique(assets.map(a=>a.path));
  unique(assets.map(a=>a.sha256));
  for(const asset of assets){const match=/^assets\/([a-f0-9]{64})\.(png|jpg|webp|mp4|webm|json|txt)$/u.exec(asset.path);
    if(!match||match[1]!==asset.sha256||
      {png:'image/png',jpg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',json:'application/json',txt:'text/plain'}[match[2] as 'png']!==asset.mimeType||
      ({png:'image',jpg:'image',webp:'image',mp4:'video',webm:'video',json:'data',txt:'data'} as Record<string,string>)[match[2]]!==asset.mediaType)return bad();}
  const scenes=list(v.scenes).map(item=>{const s=row(item,['id','beatIds','candidates','selectedCandidateId','locked','estimatedSeconds','timingStatus','reviewStatus']);
    const candidates=list(s.candidates,1000).map(candidate);if(!candidates.length)return bad();
    const selectedCandidateId=nullable(s.selectedCandidateId,id),reviewStatus=one(s.reviewStatus,['draft','direction-selected'] as const);
    if((selectedCandidateId===null)!==(reviewStatus==='draft')||selectedCandidateId!==null&&!candidates.some(c=>c.id===selectedCandidateId))return bad();
    return {id:id(s.id),beatIds:list(s.beatIds).map(id),candidates,selectedCandidateId,locked:bool(s.locked),
      estimatedSeconds:number(s.estimatedSeconds,0.01),timingStatus:one(s.timingStatus,['estimated'] as const),reviewStatus};});unique(scenes.map(s=>s.id));
  const decisions=list(v.decisions).map(item=>{const d=row(item,['id','kind','value','rationale']);return {id:id(d.id),kind:str(d.kind,200),value:str(d.value),rationale:str(d.rationale)};});unique(decisions.map(d=>d.id));
  const planId=id(v.id),revision=integer(v.revision,1);
  const narrationTakes=v.narrationTakes===undefined?[]:list(v.narrationTakes).map(item=>{const t=row(item,['id','projectId','originalName','format','mimeType','byteCount','sha256','path','durationSeconds','sampleRate','channels','createdAt','capturedRevision','scriptSha256','measurement','alignmentStatus','productionAuthority']);
    const format=one(t.format,['wav','mp3','m4a'] as const),mimeType=one(t.mimeType,['audio/wav','audio/mpeg','audio/mp4'] as const),digest=sha(t.sha256);
    if(t.productionAuthority!==false||t.measurement!=='ffprobe'||t.alignmentStatus!=='unavailable'||t.projectId!==planId||
      mimeType!=={wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4'}[format]||t.path!==`narration/${digest}.${format}`)return bad();
    const capturedRevision=integer(t.capturedRevision,1,revision);
    return {id:id(t.id),projectId:planId,originalName:str(t.originalName,500),format,mimeType,byteCount:integer(t.byteCount,1,40_000_000),
      sha256:digest,path:str(t.path,200),durationSeconds:number(t.durationSeconds,0.001),
      sampleRate:nullable(t.sampleRate,x=>integer(x,1,1_000_000)),channels:nullable(t.channels,x=>integer(x,1,100)),
      createdAt:date(t.createdAt),capturedRevision,scriptSha256:sha(t.scriptSha256),measurement:'ffprobe' as const,
      alignmentStatus:'unavailable' as const,productionAuthority:false as const};});unique(narrationTakes.map(t=>t.id));
  const narrationTimings=v.narrationTimings===undefined?[]:list(v.narrationTimings).map(item=>{const t=row(item,['id','projectId','capturedRevision','takeId','audioSha256','scriptSha256','createdAt','method','reviewStatus','productionAuthority','segments']);
    if(t.productionAuthority!==false||t.projectId!==planId||t.method!=='manual-timing-draft'||t.reviewStatus!=='draft')return bad();
    const timingSegments=list(t.segments).map(item=>{const s=row(item,['segmentId','start','end','text','startSeconds','endSeconds']);return {
      segmentId:id(s.segmentId),start:integer(s.start),end:integer(s.end,1),text:str(s.text),startSeconds:number(s.startSeconds),endSeconds:number(s.endSeconds,0.001)};});
    unique(timingSegments.map(s=>s.segmentId));
    return {id:id(t.id),projectId:planId,capturedRevision:integer(t.capturedRevision,1,revision),takeId:id(t.takeId),
      audioSha256:sha(t.audioSha256),scriptSha256:sha(t.scriptSha256),createdAt:date(t.createdAt),
      method:'manual-timing-draft' as const,reviewStatus:'draft' as const,productionAuthority:false as const,segments:timingSegments};});unique(narrationTimings.map(t=>t.id));
  if(list(v.sourceReviews).length!==0)return bad();
  const segmentSet=new Set(segments.map(s=>s.id)),beatSet=new Set(beats.map(b=>b.id)),sceneSet=new Set(scenes.map(s=>s.id));
  const requirementSet=new Set(requirements.map(r=>r.id)),assetById=new Map(assets.map(a=>[a.id,a])),takeById=new Map(narrationTakes.map(t=>[t.id,t]));
  const beatRefs=beats.flatMap(b=>b.segmentIds),sceneRefs=scenes.flatMap(s=>s.beatIds);
  if(beats.some(b=>!b.segmentIds.length)||beatRefs.some(ref=>!segmentSet.has(ref))||new Set(beatRefs).size!==beatRefs.length||
    scenes.some(s=>!s.beatIds.length)||sceneRefs.some(ref=>!beatSet.has(ref))||new Set(sceneRefs).size!==sceneRefs.length||sceneRefs.length!==beats.length)return bad();
  const candidates=scenes.flatMap(s=>s.candidates),layers=candidates.flatMap(c=>c.layers);unique(candidates.map(c=>c.id));unique(layers.map(l=>l.id));
  if(candidates.some(c=>c.requirementIds.some(ref=>!requirementSet.has(ref))||c.layers.some(l=>l.requirementId!==null&&!requirementSet.has(l.requirementId))||
    c.reuseFromSceneId!==null&&!sceneSet.has(c.reuseFromSceneId))||requirements.some(r=>r.assetId!==null&&
    (!assetById.has(r.assetId)||assetById.get(r.assetId)?.mediaType!==r.mediaType)))return bad();
  const focalRequirements=new Set(candidates.flatMap(c=>c.layers.filter(l=>l.role==='focal'&&l.requirementId!==null).map(l=>l.requirementId)));
  if(requirements.some(r=>r.assetId!==null&&focalRequirements.has(r.id)&&assetById.get(r.assetId)?.evidenceOnly))return bad();
  const scripts=new Map([[script.rawSha256,script.rawText],...history.map(h=>[h.rawSha256,h.rawText] as const)]);
  if(narrationTakes.some(t=>!scripts.has(t.scriptSha256)))return bad();
  if(narrationTimings.some(t=>{const take=takeById.get(t.takeId),source=scripts.get(t.scriptSha256);
    if(!take||!source||take.sha256!==t.audioSha256||take.scriptSha256!==t.scriptSha256||t.capturedRevision<=take.capturedRevision||!t.segments.length)return true;
    const sourcePoints=Array.from(source);let previousOffset=-1,previousSeconds=0;
    for(const s of t.segments){if(s.start<=previousOffset||s.end<=s.start||s.end>sourcePoints.length||sourcePoints.slice(s.start,s.end).join('')!==s.text||
      s.startSeconds<previousSeconds||s.endSeconds<=s.startSeconds||s.endSeconds>take.durationSeconds)return true;
      previousOffset=s.start;previousSeconds=s.endSeconds;}
    return false;
  }))return bad();
  return {schemaVersion:'visualmaker-plan-v1',id:planId,title:str(v.title,200),revision,createdAt:date(v.createdAt),
    updatedAt:date(v.updatedAt),productionAuthority:false,script,beats,scenes,requirements,assets,sourceReviews:[],
    narrationTakes,narrationTimings,decisions};
}
async function hashText(value:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function validateRestoredBackup(value:unknown):Promise<RestoredBackup>{
  forbidAuthority(value);
  const v=row(value,['plan','summary']),s=row(v.summary,['sourceProjectId','sourceRevision','assets','recordings','timingDrafts',
    'clearedSourceReviews','clearedSourceReceiptExtensions','clearedAIAdoption','clearedEpisodeOrigin','clearedSceneOriginCutIds',
    'clearedTimingAttestations','productionAuthority']);
  if(s.productionAuthority!==false)return bad();
  const summary:BackupSummary={sourceProjectId:id(s.sourceProjectId),sourceRevision:integer(s.sourceRevision,1),
    assets:integer(s.assets,0,512),recordings:integer(s.recordings,0,512),timingDrafts:integer(s.timingDrafts,0,512),
    clearedSourceReviews:integer(s.clearedSourceReviews,0),clearedSourceReceiptExtensions:integer(s.clearedSourceReceiptExtensions,0),
    clearedAIAdoption:integer(s.clearedAIAdoption,0,1),clearedEpisodeOrigin:integer(s.clearedEpisodeOrigin,0,1),
    clearedSceneOriginCutIds:integer(s.clearedSceneOriginCutIds,0),clearedTimingAttestations:integer(s.clearedTimingAttestations,0),
    productionAuthority:false};
  const plan=projectPlan(v.plan);
  if(plan.id===summary.sourceProjectId||plan.revision!==summary.sourceRevision||plan.assets.length!==summary.assets||
    (plan.narrationTakes??[]).length!==summary.recordings||(plan.narrationTimings??[]).length!==summary.timingDrafts||
    await hashText(plan.script.rawText)!==plan.script.rawSha256)return bad();
  for(const entry of plan.script.history)if(await hashText(entry.rawText)!==entry.rawSha256)return bad();
  return {plan,summary};
}

export function sameBackupScope(a:BackupScope,b:BackupScope):boolean{return a.projectId===b.projectId&&a.revision===b.revision&&a.scriptSha256===b.scriptSha256&&a.token===b.token;}
function safeFilename(value:string|null):string{
  const match=/^attachment; filename="?([a-zA-Z0-9._-]+\.zip)"?$/iu.exec(value??'');
  if(!match||match[1].length>180||match[1].startsWith('.'))return bad();return match[1];
}
export async function downloadProjectBackup(scope:BackupScope,current:()=>BackupScope,signal:AbortSignal,
  fetcher:typeof fetch=fetch):Promise<{blob:Blob;filename:string}|null>{
  const response=await fetcher(`/api/studio/backup?${new URLSearchParams({projectId:scope.projectId,baseRevision:String(scope.revision)})}`,
    {headers:{'x-visualmaker-token':scope.token},cache:'no-store',signal});
  if(response.status===409)throw new Error('프로젝트 리비전이 바뀌었습니다. 최신 내용을 불러오세요.');
  if(response.status!==200)throw new Error('프로젝트 ZIP을 받지 못했습니다.');
  if(!/\bno-store\b/iu.test(response.headers.get('cache-control')??'')||
    response.headers.get('content-type')?.toLowerCase()!=='application/zip')return bad();
  const expected=Number(response.headers.get('content-length'));
  if(!Number.isSafeInteger(expected)||expected<1||expected>MAX_BACKUP_BYTES)return bad();
  const filename=safeFilename(response.headers.get('content-disposition'));
  const reader=response.body?.getReader();if(!reader)return bad();
  const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
  try{for(;;){if(signal.aborted||!sameBackupScope(scope,current())){await reader.cancel();return null;}
    const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>expected||size>MAX_BACKUP_BYTES){await reader.cancel();return bad();}chunks.push(new Uint8Array(value));}
    if(size!==expected)return bad();
    if(signal.aborted||!sameBackupScope(scope,current()))return null;
    return {blob:new Blob(chunks,{type:'application/zip'}),filename};
  }finally{reader.releaseLock();}
}
export async function restoreProjectBackup(file:File,scope:BackupScope,current:()=>BackupScope,signal:AbortSignal,
  fetcher:typeof fetch=fetch):Promise<RestoredBackup|null>{
  if(!/^.+\.zip$/iu.test(file.name)||file.size<1||file.size>MAX_BACKUP_BYTES)throw new Error('128 MiB 이하의 ZIP 파일 하나를 선택하세요.');
  if(signal.aborted||!sameBackupScope(scope,current()))return null;
  const response=await fetcher('/api/studio/backup',{method:'POST',headers:{'x-visualmaker-token':scope.token,
    'Content-Type':'application/zip','x-visualmaker-restore-copy':'1'},body:file,cache:'no-store',signal});
  if(response.status===413)throw new Error('ZIP 크기 제한을 넘었습니다.');
  if(response.status===409)throw new Error('백업 입력이 바뀌었거나 충돌했습니다. 프로젝트 목록을 새로고침해 확인하세요.');
  if(response.status!==201)throw new Error('ZIP을 복원하지 못했습니다. 프로젝트 목록을 새로고침해 사본이 있는지 확인하세요.');
  if(!/\bno-store\b/iu.test(response.headers.get('cache-control')??'')||
    !response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return bad();
  const lengthHeader=response.headers.get('content-length');if(lengthHeader!==null&&(!/^\d+$/u.test(lengthHeader)||Number(lengthHeader)>4_000_000))return bad();
  const reader=response.body?.getReader();if(!reader)return bad();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>4_000_000){await reader.cancel();return bad();}chunks.push(value);}}
  finally{reader.releaseLock();}
  if(signal.aborted||!sameBackupScope(scope,current()))return null;
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return bad();}
  return validateRestoredBackup(value);
}
