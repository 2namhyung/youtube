import type {Plan,SourceReviewState} from '../../../visualmaker/core/model';

export type LiveProvider='wikimedia'|'nasa'|'loc';
export type LiveMediaType='image'|'video';
export type LiveScope={projectId:string;revision:number;requirementId:string;scriptSha256:string};
export type LiveQuery={provider:LiveProvider;mediaType:LiveMediaType;query:string;page:number};
export type LiveVariant={kind:'original'|'published-asset'|'derivative-or-unknown';label:string};
export type LiveCandidate={providerId:string;itemUrl:string;title:string;creator:string;publisher:string;license:string;rightsStatus:string;
  mediaType:LiveMediaType;width:number|null;height:number|null;variant:LiveVariant;metadataSha256:string};
export type LiveSearch={schemaVersion:'visualmaker-live-source-v1';scope:LiveScope;provider:LiveProvider;mediaType:LiveMediaType;
  query:string;page:number;candidates:LiveCandidate[];productionAuthority:false};
export type LiveAcquire={schemaVersion:'visualmaker-live-source-v1';scope:LiveScope;assetId:string;inputSha256:string;
  metadataSha256:string;selectionSha256:string;variant:LiveVariant;productionAuthority:false;plan:Plan;sourceReviewStates:SourceReviewState[]};

const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const bounded=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max&&value.trim().length>0;
const plain=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max;
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const variant=(value:unknown):value is LiveVariant=>isRecord(value)&&exactKeys(value,['kind','label'])&&
  ['original','published-asset','derivative-or-unknown'].includes(String(value.kind))&&bounded(value.label,200);
const dimension=(value:unknown)=>value===null||Number.isSafeInteger(value)&&Number(value)>0;
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const itemUrl=(value:unknown,provider:LiveProvider)=>{
  if(!bounded(value,2048))return false;
  try{const url=new URL(value as string);const hosts=provider==='wikimedia'?['commons.wikimedia.org']:provider==='nasa'?['images.nasa.gov']:['www.loc.gov','loc.gov'];
    return url.protocol==='https:'&&hosts.includes(url.hostname.toLowerCase())&&!url.port&&!url.username&&!url.password&&!url.hash;
  }catch{return false;}
};
export const liveProviderSupports=(provider:LiveProvider,mediaType:LiveMediaType)=>mediaType==='image'||provider==='wikimedia';
export function liveAcquireBody(scope:LiveScope,query:LiveQuery,selected:LiveCandidate,semanticNote:string,evidenceOnly:boolean){
  return {projectId:scope.projectId,baseRevision:scope.revision,requirementId:scope.requirementId,
    provider:query.provider,query:query.query,page:query.page,mediaType:query.mediaType,providerId:selected.providerId,
    metadataSha256:selected.metadataSha256,semanticNote:semanticNote.trim(),evidenceOnly};
}
export function sameLiveScope(expected:LiveScope,actual:unknown):actual is LiveScope{
  return isRecord(actual)&&exactKeys(actual,['projectId','revision','requirementId','scriptSha256'])&&
    actual.projectId===expected.projectId&&actual.revision===expected.revision&&
    actual.requirementId===expected.requirementId&&actual.scriptSha256===expected.scriptSha256;
}
export function currentLiveRequest(expected:LiveScope,current:LiveScope,startedEpoch:number,currentEpoch:number,aborted:boolean){
  return !aborted&&startedEpoch===currentEpoch&&sameLiveScope(expected,current);
}
export function validLiveCandidate(value:unknown,provider:LiveProvider,mediaType:LiveMediaType):value is LiveCandidate{
  return isRecord(value)&&exactKeys(value,['providerId','itemUrl','title','creator','publisher','license','rightsStatus','mediaType','width','height','variant','metadataSha256'])&&bounded(value.providerId,2048)&&
    itemUrl(value.itemUrl,provider)&&plain(value.title,300)&&plain(value.creator,500)&&plain(value.publisher,500)&&
    plain(value.license,500)&&plain(value.rightsStatus,500)&&value.mediaType===mediaType&&dimension(value.width)&&
    dimension(value.height)&&variant(value.variant)&&sha(value.metadataSha256)&&
    (provider!=='wikimedia'||(value.variant as LiveVariant).kind==='original')&&
    (provider!=='loc'||(value.variant as LiveVariant).kind==='derivative-or-unknown')&&
    (provider!=='nasa'||(value.variant as LiveVariant).kind==='published-asset');
}
export function validLiveSearch(value:unknown,scope:LiveScope,request:LiveQuery):value is LiveSearch{
  if(!isRecord(value)||!exactKeys(value,['schemaVersion','scope','provider','mediaType','query','page','candidates','productionAuthority'])||
    value.schemaVersion!=='visualmaker-live-source-v1'||value.productionAuthority!==false||
    !sameLiveScope(scope,value.scope)||value.provider!==request.provider||value.mediaType!==request.mediaType||
    value.query!==request.query.trim()||value.page!==request.page||!Array.isArray(value.candidates)||value.candidates.length>12)return false;
  const ids=new Set<string>();return value.candidates.every((item:unknown)=>{
    if(!validLiveCandidate(item,request.provider,request.mediaType)||ids.has(item.providerId))return false;
    ids.add(item.providerId);return true;
  });
}
export function validLiveAcquire(value:unknown,scope:LiveScope,selected:LiveCandidate):value is LiveAcquire{
  if(!isRecord(value)||!exactKeys(value,['schemaVersion','scope','assetId','inputSha256','metadataSha256','selectionSha256','variant','productionAuthority','plan','sourceReviewStates'])||
    value.schemaVersion!=='visualmaker-live-source-v1'||value.productionAuthority!==false||
    !sameLiveScope({...scope,revision:scope.revision+1},value.scope)||!bounded(value.assetId,200)||!sha(value.inputSha256)||
    value.metadataSha256!==selected.metadataSha256||!sha(value.selectionSha256)||!variant(value.variant)||
    !isRecord(value.plan)||!Array.isArray(value.sourceReviewStates))return false;
  const plan=value.plan as Plan;
  if(plan.productionAuthority!==false||plan.id!==scope.projectId||plan.revision!==scope.revision+1||
    plan.script?.rawSha256!==scope.scriptSha256||!Array.isArray(plan.requirements)||!Array.isArray(plan.assets)||
    plan.requirements.find(item=>item.id===scope.requirementId)?.assetId!==value.assetId||
    !plan.assets.some(asset=>asset.id===value.assetId&&asset.sha256===value.inputSha256&&asset.status==='pending-review'&&asset.mediaType===selected.mediaType))return false;
  const states=value.sourceReviewStates.filter(item=>isRecord(item)&&item.requirementId===scope.requirementId);
  if(states.length!==1||!Array.isArray(plan.sourceReviews))return false;
  const state=states[0];
  if(state.productionAuthority!==false||state.assetId!==value.assetId||!sha(state.contextSha256)||!isRecord(state.current)||
    !exactKeys(state.current,['source','rights','semantic']))return false;
  return (['source','rights','semantic'] as const).every(dimension=>{
    const row=state.current[dimension];
    if(!isRecord(row)||row.productionAuthority!==false||row.decision!=='pending'||row.dimension!==dimension||
      row.requirementId!==scope.requirementId||row.assetId!==value.assetId||row.assetSha256!==value.inputSha256||
      row.contextSha256!==state.contextSha256||!bounded(row.id,200)||!bounded(row.rationale,4000)||
      row.recordedBy!=='local-session')return false;
    const latest=[...plan.sourceReviews!].reverse().find(item=>item.requirementId===scope.requirementId&&item.assetId===value.assetId&&
      item.assetSha256===value.inputSha256&&item.contextSha256===state.contextSha256&&item.dimension===dimension);
    return !!latest&&latest.id===row.id&&latest.decision==='pending'&&latest.productionAuthority===false;
  });
}
