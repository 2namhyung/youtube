import {StoreError} from './store.ts';
import {inspectYouTubeSource,validateYouTubeScope,YOUTUBE_CC_LABEL} from './youtube-source.ts';
import {runYouTubeCli,searchArgs} from './youtube-cli.ts';
import type {CliRunner} from './youtube-cli.ts';

export const YOUTUBE_DISCOVERY_SCHEMA='visualmaker-youtube-discovery-v1' as const;
type Input={projectId:unknown;baseRevision:unknown;requirementId:unknown;scriptSha256:unknown;query:unknown};
const validQuery=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>=2&&
  value.trim().length<=120&&!/[\u0000-\u001f\u007f]/.test(value)&&value.trim()===value;
const videoId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{11}$/.test(value);
const cancelled=(signal:AbortSignal)=>{if(signal.aborted)throw new StoreError('요청이 취소됐습니다.',409);};

function parseSearch(raw:Buffer){
  if(raw.length>1_000_000)throw new StoreError('YouTube 검색 결과가 너무 큽니다.',413);
  let value:unknown;
  try{value=JSON.parse(raw.toString('utf8'));}catch{throw new StoreError('YouTube 검색 결과를 읽을 수 없습니다.',502);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new StoreError('YouTube 검색 결과가 올바르지 않습니다.',502);
  const result=value as Record<string,unknown>;
  if(result._type!=='playlist'||!Array.isArray(result.entries)||result.entries.length>5)
    throw new StoreError('YouTube 검색 결과가 올바르지 않습니다.',502);
  const ids:string[]=[],seen=new Set<string>();
  for(const entry of result.entries){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new StoreError('YouTube 검색 영상 ID가 올바르지 않습니다.',502);
    const row=entry as Record<string,unknown>;
    if(!videoId(row.id))throw new StoreError('YouTube 검색 영상 ID가 올바르지 않습니다.',502);
    if(!seen.has(row.id)){ids.push(row.id);seen.add(row.id);}
  }
  return ids;
}

export async function searchYouTubeSources(input:Input,options:{runner?:CliRunner;signal?:AbortSignal;deadlineMs?:number}={}){
  if(!validQuery(input.query))throw new StoreError('검색어는 2–120자 한 줄로 입력하세요.');
  const initial=validateYouTubeScope(input),query=input.query;
  const controller=new AbortController();
  const abort=()=>controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  let timedOut=false;
  const deadlineMs=options.deadlineMs===undefined?59_000:Math.min(59_000,Math.max(1,options.deadlineMs));
  const timer=setTimeout(()=>{timedOut=true;abort();},deadlineMs);
  const runner=options.runner??runYouTubeCli;
  let attempted=0,verified=0,excluded=0,failed=0;
  const candidates:Awaited<ReturnType<typeof inspectYouTubeSource>>[]=[];
  const revalidate=()=>{cancelled(controller.signal);return validateYouTubeScope(input);};
  try{
    revalidate();
    const ids=parseSearch(await runner({args:searchArgs(query),maxBytes:1_000_000,timeoutMs:15_000,signal:controller.signal}));
    revalidate();
    for(const id of ids){
      revalidate();attempted++;
      try{
        const card=await inspectYouTubeSource({...input,url:`https://www.youtube.com/watch?v=${id}`},{runner,signal:controller.signal});
        revalidate();
        if(card.licenseLabel===YOUTUBE_CC_LABEL){verified++;candidates.push(card);}else excluded++;
      }catch(error){
        revalidate();
        if(error instanceof StoreError&&error.status===503)throw error;
        failed++;
      }
    }
    const current=revalidate();
    if(failed>0&&verified===0&&excluded===0)throw new StoreError('YouTube 검색 후보를 확인하지 못했습니다. CLI 상태를 확인하세요.',502);
    return {schemaVersion:YOUTUBE_DISCOVERY_SCHEMA,scope:{projectId:current.plan.id,revision:current.plan.revision,
      requirementId:current.requirement.id,scriptSha256:current.plan.script.rawSha256},query,candidates,
      counts:{attempted,verified,excluded,failed},partial:failed>0,productionAuthority:false as const};
  }catch(error){if(timedOut)throw new StoreError('YouTube 검색 시간이 초과됐습니다.',504);throw error;}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.abort();}
}
