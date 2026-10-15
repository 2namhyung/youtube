import {createHash} from 'node:crypto';
import {getProject,StoreError} from './store.ts';
import {attachUpload} from './upload.ts';
import {reviewStates} from './director.ts';
import type {Plan,Requirement} from './model.ts';
import {acquireLiveProviderFile,searchLiveProvider} from '../../src/lib/live-source-providers.ts';
import type {FetchLike,LiveMediaType,LiveProvider,ProviderCandidate} from '../../src/lib/live-source-providers.ts';
import {applyAutomaticRights,issueRightsPolicy} from './automatic-rights.ts';

export const LIVE_SOURCE_SCHEMA='visualmaker-live-source-v1' as const;
type SearchInput={projectId:unknown;baseRevision:unknown;requirementId:unknown;provider:unknown;query:unknown;page:unknown;mediaType:unknown};
type AcquireInput=SearchInput&{providerId:unknown;metadataSha256:unknown;semanticNote:unknown;evidenceOnly:unknown};
const allowedProviders=['wikimedia','nasa','loc'];
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
function scoped(plan:Plan,requirement:Requirement){return {projectId:plan.id,revision:plan.revision,requirementId:requirement.id,scriptSha256:plan.script.rawSha256};}
function owningLocked(plan:Plan,requirementId:string){return plan.scenes.some(scene=>scene.locked&&scene.candidates.some(candidate=>candidate.requirementIds.includes(requirementId)));}
function focal(plan:Plan,requirementId:string){return plan.scenes.some(scene=>scene.candidates.some(candidate=>candidate.layers.some(layer=>layer.role==='focal'&&layer.requirementId===requirementId)));}
function validate(input:SearchInput){
  if(typeof input.projectId!=='string'||!input.projectId.trim()||input.projectId.length>200||/[\u0000-\u001f\u007f]/.test(input.projectId)||!Number.isSafeInteger(input.baseRevision)||Number(input.baseRevision)<1||typeof input.requirementId!=='string'||!input.requirementId.trim()||input.requirementId.length>200||/[\u0000-\u001f\u007f]/.test(input.requirementId))throw new StoreError('자료 탐색 범위가 올바르지 않습니다.');
  if(typeof input.provider!=='string'||!allowedProviders.includes(input.provider)||typeof input.mediaType!=='string'||!['image','video'].includes(input.mediaType))throw new StoreError('지원하지 않는 자료 제공처 또는 유형입니다.');
  if(typeof input.query!=='string'||input.query.trim().length<2||input.query.length>120||/[\u0000-\u001f\u007f]/.test(input.query))throw new StoreError('검색어는 2–120자여야 합니다.');
  if(!Number.isSafeInteger(input.page)||Number(input.page)<1||Number(input.page)>20)throw new StoreError('검색 페이지는 1–20이어야 합니다.');
  const provider=input.provider as LiveProvider,mediaType=input.mediaType as LiveMediaType;
  if((provider==='nasa'||provider==='loc')&&mediaType==='video')throw new StoreError('해당 제공처는 이 연결에서 영상 탐색을 지원하지 않습니다.');
  const plan=getProject(input.projectId),requirement=plan.requirements.find(row=>row.id===input.requirementId);
  if(plan.revision!==input.baseRevision)throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.',409);
  if(!requirement)throw new StoreError('자료 요구를 찾을 수 없습니다.',404);
  if(requirement.mediaType!==mediaType||!['external','official'].includes(requirement.acquisition))throw new StoreError('자료 유형 또는 수집 방식이 제공처 탐색과 맞지 않습니다.',409);
  if(requirement.assetId!==null)throw new StoreError('이미 자료가 연결된 요구입니다.',409);
  if(owningLocked(plan,requirement.id))throw new StoreError('잠긴 장면의 자료는 변경할 수 없습니다.',423);
  return {plan,requirement,provider,mediaType,query:input.query.trim(),page:input.page as number};
}
function publicCandidate(candidate:ProviderCandidate){const {downloadUrl:unused,rightsEvidence:privateEvidence,...card}=candidate;void unused;void privateEvidence;return card;}
export async function searchLiveSources(input:SearchInput,options:{fetcher?:FetchLike;signal?:AbortSignal}={}){
  const scope=validate(input);
  const candidates=(await searchLiveProvider({...scope,fetcher:options.fetcher,signal:options.signal})).map(publicCandidate);
  // A concurrent edit invalidates the page even though search itself makes no writes.
  const current=validate(input);
  return {schemaVersion:LIVE_SOURCE_SCHEMA,scope:scoped(current.plan,current.requirement),provider:scope.provider,mediaType:scope.mediaType,query:scope.query,page:scope.page,candidates,productionAuthority:false as const};
}
export async function acquireLiveSource(input:AcquireInput,options:{fetcher?:FetchLike;signal?:AbortSignal}={}){
  const scope=validate(input);
  if(typeof input.providerId!=='string'||!input.providerId||input.providerId.length>2048||typeof input.metadataSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.metadataSha256))throw new StoreError('선택한 자료 식별자와 검색 지문이 올바르지 않습니다.');
  if(typeof input.semanticNote!=='string'||!input.semanticNote.trim()||input.semanticNote.length>4000)throw new StoreError('자료의 의미 대응 메모를 입력하세요.');
  if(typeof input.evidenceOnly!=='boolean')throw new StoreError('자료 용도를 명시하세요.');
  if(input.evidenceOnly&&focal(scope.plan,scope.requirement.id))throw new StoreError('근거 전용 자료는 핵심 화면에 연결할 수 없습니다.',409);
  const candidates=await searchLiveProvider({...scope,fetcher:options.fetcher,signal:options.signal});
  const candidate=candidates.find(item=>item.providerId===input.providerId);
  if(!candidate||candidate.metadataSha256!==input.metadataSha256||candidate.mediaType!==scope.mediaType)throw new StoreError('검색 후보가 변경되었습니다. 다시 검색하세요.',409);
  validate(input);
  const file=await acquireLiveProviderFile({...scope,fetcher:options.fetcher,signal:options.signal},candidate);
  if(options.signal?.aborted)throw new StoreError('자료 수집이 취소됐습니다.',409);
  const current=validate(input);
  if(current.plan.assets.some(asset=>asset.sha256===file.downloadSha256))throw new StoreError('같은 바이트의 자료가 이미 있습니다. 명시적 재사용 흐름을 이용하세요.',409);
  const extension=file.mime==='image/jpeg'?'jpg':file.mime.split('/')[1];
  const fields={originalName:`${scope.provider}-${sha(Buffer.from(candidate.providerId)).slice(0,12)}.${extension}`,sourceUrl:candidate.itemUrl,
    creator:candidate.creator||`제작자 미상 (제공처: ${candidate.publisher})`,rightsNote:`제공처 표기: ${candidate.license||'미상'}. 권리 상태: ${candidate.rightsStatus||'미상'}. 실제 사용 전 원문·제3자 권리 확인 필요.`,
    semanticNote:input.semanticNote.trim(),evidenceOnly:String(input.evidenceOnly)};
  const provenance={version:1,provider:scope.provider,providerId:candidate.providerId,itemUrl:candidate.itemUrl,query:scope.query,page:scope.page,
    metadataSha256:candidate.metadataSha256,retrievedAt:new Date().toISOString(),variant:file.variant,providerAssetHref:file.providerAssetHref,selectedAssetUrl:file.selectedAssetUrl,selectionSha256:file.selectionSha256,assetManifestSha256:file.assetManifestSha256,downloadSha256:file.downloadSha256,productionAuthority:false};
  const policy=scope.provider==='wikimedia'&&candidate.rightsEvidence?issueRightsPolicy({provider:'wikimedia',providerId:candidate.providerId,itemUrl:candidate.itemUrl,
    metadataSha256:candidate.metadataSha256,...candidate.rightsEvidence,retrievedAt:provenance.retrievedAt,
    selectionSha256:file.selectionSha256,downloadSha256:file.downloadSha256}):null;
  const receipt=policy?{liveSourceProvenance:provenance,automaticRightsPolicy:{version:1,license:policy.license,evidence:policy.evidence,
    assetSha256:file.downloadSha256,productionAuthority:false}}:{liveSourceProvenance:provenance};
  const plan=await attachUpload(current.plan.id,current.plan.revision,current.requirement.id,file.bytes,fields,receipt,file.mime,options.signal,
    policy?(next,requirement,asset)=>{applyAutomaticRights(next,requirement,asset,policy);}:undefined);
  const assetId=plan.requirements.find(row=>row.id===current.requirement.id)?.assetId;
  if(!assetId)throw new StoreError('등록된 자료를 확인할 수 없습니다.',409);
  return {schemaVersion:LIVE_SOURCE_SCHEMA,scope:scoped(plan,current.requirement),assetId,inputSha256:file.downloadSha256,metadataSha256:candidate.metadataSha256,selectionSha256:file.selectionSha256,variant:file.variant,productionAuthority:false as const,plan,sourceReviewStates:reviewStates(plan)};
}
