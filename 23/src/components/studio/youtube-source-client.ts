import type {Plan,SourceReviewState} from '../../../visualmaker/core/model';

export type YouTubeScope={projectId:string;revision:number;requirementId:string;scriptSha256:string};
export type YouTubeInspect={schemaVersion:'visualmaker-youtube-source-v1';scope:YouTubeScope;videoId:string;canonicalUrl:string;
  title:string;creator:string;channelId:string;durationSeconds:number;uploadDate:string|null;licenseLabel:string;metadataSha256:string;
  width:number|null;height:number|null;rightsEligible:boolean;rightsReason:string;productionAuthority:false};
export type YouTubeAcquire={schemaVersion:'visualmaker-youtube-source-v1';scope:YouTubeScope;assetId:string;inputSha256:string;
  metadataSha256:string;productionAuthority:false;plan:Plan;sourceReviewStates:SourceReviewState[]};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const sameYouTubeScope=(expected:YouTubeScope,actual:unknown):actual is YouTubeScope=>record(actual)&&
  exact(actual,['projectId','revision','requirementId','scriptSha256'])&&actual.projectId===expected.projectId&&
  actual.revision===expected.revision&&actual.requirementId===expected.requirementId&&actual.scriptSha256===expected.scriptSha256;
export const currentYouTubeRequest=(expected:YouTubeScope,current:YouTubeScope,started:number,epoch:number,aborted:boolean)=>
  !aborted&&started===epoch&&sameYouTubeScope(expected,current);
export function validYouTubeInspect(value:unknown,scope:YouTubeScope):value is YouTubeInspect{
  if(!record(value)||!exact(value,['schemaVersion','scope','videoId','canonicalUrl','title','creator','channelId',
    'durationSeconds','uploadDate','licenseLabel','metadataSha256','width','height','rightsEligible','rightsReason','productionAuthority'])||
    value.schemaVersion!=='visualmaker-youtube-source-v1'||!sameYouTubeScope(scope,value.scope)||value.productionAuthority!==false||
    typeof value.rightsEligible!=='boolean'||!text(value.videoId,11)||!text(value.title,300)||!text(value.creator,500)||
    !text(value.channelId,200)||!text(value.rightsReason,500)||!sha(value.metadataSha256)||
    typeof value.licenseLabel!=='string'||value.licenseLabel.length>500||/[\u0000-\u001f\u007f]/.test(value.licenseLabel)||
    typeof value.durationSeconds!=='number'||value.durationSeconds<=0||value.durationSeconds>600||
    !(value.width===null||Number.isInteger(value.width)&&Number(value.width)>0&&Number(value.width)<=1280)||
    !(value.height===null||Number.isInteger(value.height)&&Number(value.height)>0&&Number(value.height)<=720)||
    !(value.uploadDate===null||typeof value.uploadDate==='string'&&/^\d{8}$/.test(value.uploadDate)))return false;
  if(value.rightsEligible&&(value.licenseLabel!=='Creative Commons Attribution license (reuse allowed)'||value.width===null||value.height===null))return false;
  return /^[A-Za-z0-9_-]{11}$/.test(value.videoId as string)&&value.canonicalUrl===`https://www.youtube.com/watch?v=${value.videoId}`;
}
export function validYouTubeAcquire(value:unknown,scope:YouTubeScope,selected:YouTubeInspect):value is YouTubeAcquire{
  if(!record(value)||!exact(value,['schemaVersion','scope','assetId','inputSha256','metadataSha256','productionAuthority','plan','sourceReviewStates'])||
    value.schemaVersion!=='visualmaker-youtube-source-v1'||value.productionAuthority!==false||
    !sameYouTubeScope({...scope,revision:scope.revision+1},value.scope)||!text(value.assetId,200)||!sha(value.inputSha256)||
    value.metadataSha256!==selected.metadataSha256||!record(value.plan)||!Array.isArray(value.sourceReviewStates))return false;
  const plan=value.plan as Plan;
  if(plan.productionAuthority!==false||plan.id!==scope.projectId||plan.revision!==scope.revision+1||
    plan.script?.rawSha256!==scope.scriptSha256||!Array.isArray(plan.requirements)||!Array.isArray(plan.assets)||
    !Array.isArray(plan.sourceReviews)||plan.requirements.find(item=>item.id===scope.requirementId)?.assetId!==value.assetId||
    !plan.assets.some(asset=>asset.id===value.assetId&&asset.sha256===value.inputSha256&&asset.mediaType==='video'&&
      asset.mimeType==='video/mp4'&&asset.sourceUrl===selected.canonicalUrl&&asset.creator===selected.creator&&asset.status==='pending-review'))return false;
  const states=value.sourceReviewStates.filter(item=>record(item)&&item.requirementId===scope.requirementId);
  if(states.length!==1)return false;
  const state=states[0];
  if(state.productionAuthority!==false||state.assetId!==value.assetId||!sha(state.contextSha256)||!record(state.current)||
    !exact(state.current,['source','rights','semantic']))return false;
  return (['source','rights','semantic'] as const).every(dimension=>{
    const row=state.current[dimension];if(!record(row)||row.dimension!==dimension||row.requirementId!==scope.requirementId||
      row.assetId!==value.assetId||row.assetSha256!==value.inputSha256||row.contextSha256!==state.contextSha256||
      row.productionAuthority!==false||!(dimension==='rights'&&row.decision==='acceptable'&&row.recordedBy==='provider-license-policy'||
        row.decision==='pending'&&row.recordedBy==='local-session'))return false;
    if(dimension==='rights'&&(!(row.rationale as string).includes(selected.metadataSha256)||
      !(row.rationale as string).includes('YouTube CC BY (version unspecified)')))return false;
    const latest=[...plan.sourceReviews!].reverse().find(item=>item.requirementId===scope.requirementId&&
      item.assetId===value.assetId&&item.assetSha256===value.inputSha256&&item.contextSha256===state.contextSha256&&item.dimension===dimension);
    return !!latest&&JSON.stringify(latest)===JSON.stringify(row);
  });
}
