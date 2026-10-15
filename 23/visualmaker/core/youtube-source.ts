import {createHash} from 'node:crypto';
import {canonicalizeYouTubeUrl} from './reference-study.ts';
import {getProject,StoreError} from './store.ts';
import {measureAssetBytes,attachUpload} from './upload.ts';
import {reviewStates} from './director.ts';
import {applyAutomaticRights,issueYouTubeRightsPolicy} from './automatic-rights.ts';
import {runYouTubeCli,inspectArgs,downloadArgs} from './youtube-cli.ts';
import type {CliRunner} from './youtube-cli.ts';
import type {Plan,Requirement} from './model.ts';

export const YOUTUBE_SOURCE_SCHEMA='visualmaker-youtube-source-v1' as const;
export const YOUTUBE_CC_LABEL='Creative Commons Attribution license (reuse allowed)';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
type ScopeInput={projectId:unknown;baseRevision:unknown;requirementId:unknown;scriptSha256:unknown;url:unknown};
type AcquireInput=ScopeInput&{metadataSha256:unknown;semanticNote:unknown;evidenceOnly:unknown};
type Metadata={videoId:string;canonicalUrl:string;title:string;creator:string;channelId:string;durationSeconds:number;
  uploadDate:string|null;licenseLabel:string;formatId:string|null;formatBytes:number|null;width:number|null;height:number|null;
  rightsEligible:boolean;rightsReason:string;metadataSha256:string};
const safe=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
function videoUrl(input:unknown){
  if(!safe(input,2048))throw new StoreError('YouTube 영상 URL을 입력하세요.');
  const parsed=canonicalizeYouTubeUrl(input);
  if(!parsed.ok)throw new StoreError('단일 YouTube 영상 주소가 필요합니다.');
  const url=new URL(input as string),host=url.hostname.toLowerCase();
  const keys=[...url.searchParams.keys()];
  if(url.hash||keys.some(key=>key!=='v')||(!url.pathname.startsWith('/watch')&&keys.length)||
    (url.pathname==='/watch'&&(keys.length!==1||url.searchParams.get('v')!==parsed.videoId)))
    throw new StoreError('재생목록·추가 매개변수 없이 단일 영상 주소를 입력하세요.');
  if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))
    throw new StoreError('지원하지 않는 YouTube 주소입니다.');
  return parsed;
}
export function validateYouTubeScope(input:Omit<ScopeInput,'url'>){
  if(!safe(input.projectId,200)||!safe(input.requirementId,200)||!Number.isSafeInteger(input.baseRevision)||Number(input.baseRevision)<1||
    typeof input.scriptSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.scriptSha256))throw new StoreError('현재 프로젝트 범위가 올바르지 않습니다.');
  const plan=getProject(input.projectId as string);
  if(plan.revision!==input.baseRevision||plan.script.rawSha256!==input.scriptSha256)throw new StoreError('프로젝트가 변경됐습니다. 다시 불러오세요.',409);
  const requirement=plan.requirements.find(row=>row.id===input.requirementId);
  if(!requirement)throw new StoreError('자료 요구를 찾을 수 없습니다.',404);
  if(requirement.mediaType!=='video'||!['external','official'].includes(requirement.acquisition)||requirement.assetId!==null)
    throw new StoreError('선택한 영상 자료 요구를 사용할 수 없습니다.',409);
  const owners=plan.scenes.filter(scene=>scene.candidates.some(candidate=>candidate.requirementIds.includes(requirement.id)));
  if(owners.length!==1||owners[0].locked||owners[0].candidates.find(candidate=>candidate.id===owners[0].selectedCandidateId)?.mode!=='source-video'||
    !owners[0].candidates.find(candidate=>candidate.id===owners[0].selectedCandidateId)?.requirementIds.includes(requirement.id))
    throw new StoreError('선택한 미잠금 영상 장면의 단독 자료 요구만 연결할 수 있습니다.',409);
  return {plan,requirement};
}
function validate(input:ScopeInput){const video=videoUrl(input.url);return {...validateYouTubeScope(input),video};}
function normalized(raw:Buffer,video:{videoId:string;canonicalUrl:string}):Metadata{
  if(raw.length>2_000_000)throw new StoreError('YouTube 메타데이터가 너무 큽니다.',413);
  let obj:Record<string,unknown>;try{const parsed=JSON.parse(raw.toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();obj=parsed;}catch{throw new StoreError('YouTube 메타데이터를 읽을 수 없습니다.',502);}
  const page=canonicalizeYouTubeUrl(obj.webpage_url);
  if(obj.id!==video.videoId||obj.extractor_key!=='Youtube'||!page.ok||page.canonicalUrl!==video.canonicalUrl||
    ![undefined,'video'].includes(obj._type as string|undefined)||obj.availability!=='public'||obj.live_status!=='not_live'||
    obj.is_live===true||obj.was_live===true||obj.is_playlist===true)
    throw new StoreError('공개된 단일 YouTube 영상으로 확인되지 않았습니다.',409);
  if(!safe(obj.title,300)||!safe(obj.channel,500)||!safe(obj.channel_id,200)||
    typeof obj.duration!=='number'||!Number.isFinite(obj.duration)||obj.duration<=0||obj.duration>600)
    throw new StoreError('영상 제작자 또는 길이 정보가 조건에 맞지 않습니다.',409);
  const formats=Array.isArray(obj.formats)?obj.formats:[];
  const available=formats.filter((item):item is Record<string,unknown>=>!!item&&typeof item==='object'&&!Array.isArray(item)).filter(item=>
    safe(item.format_id,100)&&/^[A-Za-z0-9_-]+$/.test(item.format_id as string)&&item.ext==='mp4'&&item.protocol==='https'&&
    typeof item.vcodec==='string'&&item.vcodec!=='none'&&typeof item.acodec==='string'&&item.acodec!=='none'&&
    Number.isSafeInteger(item.width)&&Number(item.width)>0&&Number(item.width)<=1280&&Number.isSafeInteger(item.height)&&Number(item.height)>0&&Number(item.height)<=720&&
    Number.isSafeInteger(item.filesize)&&Number(item.filesize)>0&&Number(item.filesize)<=40_000_000);
  available.sort((a,b)=>Number(b.height)-Number(a.height)||Number(b.width)-Number(a.width));
  const format=available[0];
  const licenseLabel=typeof obj.license==='string'&&obj.license.length<=500&&!/[\u0000-\u001f\u007f]/.test(obj.license)?obj.license:'미상';
  const rightsEligible=licenseLabel===YOUTUBE_CC_LABEL&&!!format;
  const rightsReason=licenseLabel!==YOUTUBE_CC_LABEL?'YouTube CC BY 재사용 표시가 확인되지 않아 이 경로에서 수집할 수 없습니다.':
    !format?'40MB·720p 이하의 단일 MP4 영상 파일을 찾을 수 없습니다.':
      'YouTube 메타데이터의 정확한 CC BY 재사용 표시를 확인했습니다. 게시 크레딧과 제3자 권리는 별도 확인이 필요합니다.';
  const uploadDate=typeof obj.upload_date==='string'&&/^\d{8}$/.test(obj.upload_date)?obj.upload_date:null;
  const relevant={videoId:video.videoId,canonicalUrl:video.canonicalUrl,title:obj.title as string,creator:obj.channel as string,
    channelId:obj.channel_id as string,durationSeconds:obj.duration as number,uploadDate,licenseLabel,
    formatId:format?.format_id as string|undefined??null,formatBytes:format?.filesize as number|undefined??null,
    width:format?.width as number|undefined??null,height:format?.height as number|undefined??null,rightsEligible,rightsReason};
  return {...relevant,metadataSha256:hash(JSON.stringify(relevant))};
}
async function readMetadata(video:{videoId:string;canonicalUrl:string},runner:CliRunner,signal?:AbortSignal){
  return normalized(await runner({args:inspectArgs(video.canonicalUrl),maxBytes:2_000_000,timeoutMs:25_000,signal}),video);
}
const publicScope=(plan:Plan,requirement:Requirement)=>({projectId:plan.id,revision:plan.revision,requirementId:requirement.id,scriptSha256:plan.script.rawSha256});
export async function inspectYouTubeSource(input:ScopeInput,options:{runner?:CliRunner;signal?:AbortSignal}={}){
  const initial=validate(input),meta=await readMetadata(initial.video,options.runner??runYouTubeCli,options.signal);
  const current=validate(input);if(options.signal?.aborted)throw new StoreError('요청이 취소됐습니다.',409);
  const {formatId:unused,formatBytes:unused2,...card}=meta;void unused;void unused2;
  return {schemaVersion:YOUTUBE_SOURCE_SCHEMA,scope:publicScope(current.plan,current.requirement),...card,productionAuthority:false as const};
}
export async function acquireYouTubeSource(input:AcquireInput,options:{runner?:CliRunner;signal?:AbortSignal}={}){
  const initial=validate(input);
  if(typeof input.metadataSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.metadataSha256)||!safe(input.semanticNote,4000)||
    typeof input.evidenceOnly!=='boolean')throw new StoreError('수집 지문·의미 대응·용도를 확인하세요.');
  if(input.evidenceOnly&&initial.plan.scenes.some(scene=>scene.candidates.some(candidate=>candidate.layers.some(layer=>layer.role==='focal'&&layer.requirementId===initial.requirement.id))))
    throw new StoreError('핵심 화면 요구에는 근거 전용 자료를 연결할 수 없습니다.',409);
  const runner=options.runner??runYouTubeCli,meta=await readMetadata(initial.video,runner,options.signal);
  if(meta.metadataSha256!==input.metadataSha256)throw new StoreError('영상 정보가 달라졌습니다. 다시 확인하세요.',409);
  if(!meta.rightsEligible||!meta.formatId||!meta.formatBytes)throw new StoreError('YouTube CC BY 영상과 지원 MP4가 확인되지 않았습니다.',409);
  validate(input);
  const bytes=await runner({args:downloadArgs(meta.canonicalUrl,meta.formatId),maxBytes:40_000_000,timeoutMs:120_000,signal:options.signal});
  const measured=await measureAssetBytes(bytes,'video');
  if(measured.ext!=='mp4'||measured.width===null||measured.height===null||measured.durationSeconds===null||
    measured.width>1280||measured.height>720||measured.durationSeconds>600)throw new StoreError('수집한 MP4의 길이 또는 해상도가 제한을 넘습니다.',409);
  const after=await readMetadata(initial.video,runner,options.signal);
  if(after.metadataSha256!==meta.metadataSha256)throw new StoreError('다운로드 전후 영상 정보가 달라졌습니다.',409);
  if(options.signal?.aborted)throw new StoreError('요청이 취소됐습니다.',409);
  const current=validate(input),downloadSha256=hash(bytes);
  if(current.plan.assets.some(asset=>asset.sha256===downloadSha256))throw new StoreError('같은 바이트의 자료가 이미 있습니다.',409);
  const retrievedAt=new Date().toISOString();
  const policy=issueYouTubeRightsPolicy({provider:'youtube',providerId:meta.videoId,itemUrl:meta.canonicalUrl,
    metadataSha256:meta.metadataSha256,selectionSha256:hash(`${meta.formatId}:${meta.formatBytes}`),downloadSha256,
    licenseLabel:meta.licenseLabel,creator:meta.creator,channelId:meta.channelId,retrievedAt});
  if(!policy)throw new StoreError('YouTube 사용 조건을 확인할 수 없습니다.',409);
  const receipt={youTubeSourceProvenance:{version:1,videoId:meta.videoId,canonicalUrl:meta.canonicalUrl,title:meta.title,
    creator:meta.creator,channelId:meta.channelId,uploadDate:meta.uploadDate,durationSeconds:meta.durationSeconds,
    width:measured.width,height:measured.height,licenseLabel:meta.licenseLabel,metadataSha256:meta.metadataSha256,
    formatId:meta.formatId,selectionSha256:policy.evidence.selectionSha256,downloadSha256,retrievedAt,productionAuthority:false},
    automaticRightsPolicy:{version:1,license:policy.license,evidence:policy.evidence,assetSha256:downloadSha256,productionAuthority:false}};
  const fields={originalName:`youtube-${meta.videoId}.mp4`,sourceUrl:meta.canonicalUrl,creator:meta.creator,
    rightsNote:`YouTube 제공처 표시: ${meta.licenseLabel}. 제작자 ${meta.creator}. 원본 ${meta.canonicalUrl}. 게시 크레딧과 제3자 권리는 별도 확인.`,
    semanticNote:(input.semanticNote as string).trim(),evidenceOnly:String(input.evidenceOnly)};
  const plan=await attachUpload(current.plan.id,current.plan.revision,current.requirement.id,bytes,fields,receipt,'video/mp4',options.signal,
    (next,requirement,asset)=>{if(!applyAutomaticRights(next,requirement,asset,policy))throw new StoreError('권리 관찰 기록을 연결할 수 없습니다.',409);});
  const assetId=plan.requirements.find(row=>row.id===current.requirement.id)?.assetId;
  if(!assetId)throw new StoreError('등록된 영상을 확인할 수 없습니다.',409);
  return {schemaVersion:YOUTUBE_SOURCE_SCHEMA,scope:publicScope(plan,current.requirement),assetId,inputSha256:downloadSha256,
    metadataSha256:meta.metadataSha256,productionAuthority:false as const,plan,sourceReviewStates:reviewStates(plan)};
}
