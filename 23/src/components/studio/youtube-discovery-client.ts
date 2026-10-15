import {sameYouTubeScope,validYouTubeInspect} from './youtube-source-client.ts';
import type {YouTubeInspect,YouTubeScope} from './youtube-source-client';

export type YouTubeDiscovery={schemaVersion:'visualmaker-youtube-discovery-v1';scope:YouTubeScope;query:string;
  candidates:YouTubeInspect[];counts:{attempted:number;verified:number;excluded:number;failed:number};
  partial:boolean;productionAuthority:false};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const count=(value:unknown):value is number=>Number.isSafeInteger(value)&&typeof value==='number'&&value>=0&&value<=5;
export function validYouTubeDiscovery(value:unknown,scope:YouTubeScope,query:string):value is YouTubeDiscovery{
  if(!record(value)||!exact(value,['schemaVersion','scope','query','candidates','counts','partial','productionAuthority'])||
    value.schemaVersion!=='visualmaker-youtube-discovery-v1'||!sameYouTubeScope(scope,value.scope)||
    value.query!==query||value.productionAuthority!==false||typeof value.partial!=='boolean'||
    !Array.isArray(value.candidates)||value.candidates.length>5||!record(value.counts)||
    !exact(value.counts,['attempted','verified','excluded','failed']))return false;
  const {attempted,verified,excluded,failed}=value.counts;
  if(!count(attempted)||!count(verified)||!count(excluded)||!count(failed)||
    attempted!==verified+excluded+failed||verified!==value.candidates.length||attempted>5||value.partial!==(failed>0))return false;
  const ids=new Set<string>();
  for(const candidate of value.candidates){
    if(!validYouTubeInspect(candidate,scope)||candidate.licenseLabel!=='Creative Commons Attribution license (reuse allowed)'||
      ids.has(candidate.videoId))return false;
    ids.add(candidate.videoId);
  }
  return true;
}
