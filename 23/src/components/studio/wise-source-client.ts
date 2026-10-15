import type {Plan,SourceReviewState} from '../../../visualmaker/core/model';

export type WiseScope={projectId:string;revision:number;requirementId:string;scriptSha256:string};
export type WiseSpan={startSeconds:number;endSeconds:number};
export type WiseCard={sourceId:string;wiseMediaId:string;sha256:string;metadataSha256:string;kind:'image'|'video';
  title:string;creator:string;sourceUrl:string;license:string;licenseUrl:string;rightsEvidence:string;rightsConfirmed:boolean;
  durationSeconds:number|null;rawSpan:WiseSpan;selectedSpan:WiseSpan;selectionToken:string};
export type WiseSearch={schemaVersion:'visualmaker-wise-bridge-v1';scope:WiseScope;query:string;status:'available';
  candidates:WiseCard[];counts:{hits:number;verified:number;unresolved:number};productionAuthority:false};
export type WiseImport={schemaVersion:'visualmaker-wise-bridge-v1';scope:WiseScope;assetId:string;inputSha256:string;
  metadataSha256:string;productionAuthority:false;plan:Plan;sourceReviewStates:SourceReviewState[]};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const safe=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=500;
const url=(v:unknown,allowEmpty=false)=>{if(allowEmpty&&v==='')return true;if(!safe(v,2048))return false;
  try{const parsed=new URL(v as string);return ['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password;}catch{return false;}};
export const sameWiseScope=(expected:WiseScope,actual:unknown):actual is WiseScope=>record(actual)&&
  exact(actual,['projectId','revision','requirementId','scriptSha256'])&&actual.projectId===expected.projectId&&
  actual.revision===expected.revision&&actual.requirementId===expected.requirementId&&actual.scriptSha256===expected.scriptSha256;
export const currentWiseRequest=(expected:WiseScope,current:WiseScope,started:number,epoch:number,aborted:boolean)=>
  !aborted&&started===epoch&&sameWiseScope(expected,current);
const span=(value:unknown,kind:'image'|'video',duration:number|null,raw:boolean):value is WiseSpan=>record(value)&&
  exact(value,['startSeconds','endSeconds'])&&typeof value.startSeconds==='number'&&Number.isFinite(value.startSeconds)&&value.startSeconds>=0&&
  typeof value.endSeconds==='number'&&Number.isFinite(value.endSeconds)&&value.endSeconds>=value.startSeconds&&
  (kind==='image'?value.startSeconds===0&&value.endSeconds===0:
    duration!==null&&duration>0&&value.endSeconds>value.startSeconds&&value.endSeconds<=10_000_000&&
    (raw||value.endSeconds<=duration&&value.startSeconds<duration));
const card=(value:unknown):value is WiseCard=>{
  if(!record(value)||!exact(value,['sourceId','wiseMediaId','sha256','metadataSha256','kind','title','creator','sourceUrl',
    'license','licenseUrl','rightsEvidence','rightsConfirmed','durationSeconds','rawSpan','selectedSpan','selectionToken'])||
    !safe(value.sourceId,200)||!safe(value.wiseMediaId,220)||!sha(value.sha256)||!sha(value.metadataSha256)||
    !['image','video'].includes(String(value.kind))||!safe(value.title,300)||!safe(value.creator,500)||!url(value.sourceUrl)||
    !safe(value.license,200)||!url(value.licenseUrl,true)||!optional(value.rightsEvidence,2000)||
    typeof value.rightsConfirmed!=='boolean'||!safe(value.selectionToken,100)||
    !(value.kind==='image'?value.durationSeconds===null:typeof value.durationSeconds==='number'&&
      Number.isFinite(value.durationSeconds)&&value.durationSeconds>0))return false;
  const kind=value.kind as 'image'|'video',duration=value.durationSeconds as number|null;
  return span(value.rawSpan,kind,duration,true)&&span(value.selectedSpan,kind,duration,false);
};
export function validWiseSearch(value:unknown,scope:WiseScope,query:string,kind:'image'|'video'):value is WiseSearch{
  if(!record(value)||!exact(value,['schemaVersion','scope','query','status','candidates','counts','productionAuthority'])||
    value.schemaVersion!=='visualmaker-wise-bridge-v1'||!sameWiseScope(scope,value.scope)||value.query!==query||
    value.status!=='available'||value.productionAuthority!==false||!Array.isArray(value.candidates)||value.candidates.length>5||
    !record(value.counts)||!exact(value.counts,['hits','verified','unresolved'])||
    !count(value.counts.hits)||!count(value.counts.verified)||!count(value.counts.unresolved)||
    value.counts.verified!==value.candidates.length||Number(value.counts.hits)<Number(value.counts.verified))return false;
  const seen=new Set<string>();return value.candidates.every(item=>{
    if(!card(item)||item.kind!==kind||seen.has(item.selectionToken))return false;
    seen.add(item.selectionToken);return true;
  });
}
export function validWiseImport(value:unknown,scope:WiseScope,selected:WiseCard):value is WiseImport{
  if(!record(value)||!exact(value,['schemaVersion','scope','assetId','inputSha256','metadataSha256','productionAuthority','plan','sourceReviewStates'])||
    value.schemaVersion!=='visualmaker-wise-bridge-v1'||value.productionAuthority!==false||
    !sameWiseScope({...scope,revision:scope.revision+1},value.scope)||!safe(value.assetId,200)||
    value.inputSha256!==selected.sha256||value.metadataSha256!==selected.metadataSha256||
    !record(value.plan)||!Array.isArray(value.sourceReviewStates))return false;
  const plan=value.plan as Plan;
  if(plan.productionAuthority!==false||plan.id!==scope.projectId||plan.revision!==scope.revision+1||
    plan.script?.rawSha256!==scope.scriptSha256||!Array.isArray(plan.requirements)||!Array.isArray(plan.assets)||
    !Array.isArray(plan.sourceReviews)||plan.requirements.find(item=>item.id===scope.requirementId)?.assetId!==value.assetId||
    !plan.assets.some(asset=>asset.id===value.assetId&&asset.sha256===selected.sha256&&asset.mediaType===selected.kind&&
      asset.sourceUrl===selected.sourceUrl&&asset.creator===selected.creator&&asset.status==='pending-review'))return false;
  const states=value.sourceReviewStates.filter(item=>record(item)&&item.requirementId===scope.requirementId);
  if(states.length!==1)return false;const state=states[0];
  if(state.productionAuthority!==false||state.assetId!==value.assetId||!sha(state.contextSha256)||!record(state.current)||
    !exact(state.current,['source','rights','semantic']))return false;
  return (['source','rights','semantic'] as const).every(dimension=>{
    const row=state.current[dimension];if(!record(row)||row.dimension!==dimension||row.requirementId!==scope.requirementId||
      row.assetId!==value.assetId||row.assetSha256!==selected.sha256||row.contextSha256!==state.contextSha256||
      row.productionAuthority!==false||row.decision!=='pending'||row.recordedBy!=='local-session')return false;
    const latest=[...plan.sourceReviews!].reverse().find(item=>item.requirementId===scope.requirementId&&
      item.assetId===value.assetId&&item.assetSha256===selected.sha256&&item.contextSha256===state.contextSha256&&item.dimension===dimension);
    return !!latest&&JSON.stringify(latest)===JSON.stringify(row);
  });
}
