import {createHash} from 'node:crypto';
import {StoreError} from '../../visualmaker/core/store.ts';
import type {RightsEvidence} from '../../visualmaker/core/automatic-rights.ts';

export type LiveProvider='wikimedia'|'nasa'|'loc';
export type LiveMediaType='image'|'video';
export type LiveVariant={kind:'original'|'published-asset'|'derivative-or-unknown';label:string};
export type LiveCandidate={providerId:string;itemUrl:string;title:string;creator:string;publisher:string;license:string;rightsStatus:string;mediaType:LiveMediaType;width:number|null;height:number|null;variant:LiveVariant;metadataSha256:string};
export type ProviderCandidate=LiveCandidate&{downloadUrl:string|null;rightsEvidence?:Pick<RightsEvidence,'licenseLabel'|'licenseUrl'|'licenseCode'|'creator'|'artistRaw'|'usageTerms'>};
export type FetchLike=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;
export type ProviderRequest={provider:LiveProvider;mediaType:LiveMediaType;query:string;page:number;signal?:AbortSignal;fetcher?:FetchLike};
const MAX_JSON=1_000_000,MAX_MEDIA=40_000_000,MAX_ROWS=12;
const hosts={wikimedia:['upload.wikimedia.org'],nasa:['images-assets.nasa.gov'],loc:['tile.loc.gov','cdn.loc.gov','www.loc.gov','loc.gov']} as const;
const clean=(value:unknown,max=500)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,max):'';
const obj=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const positive=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0?Number(value):null;
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function fixedHttpsUrl(value:unknown,allowed:readonly string[]):string|null{
  if(typeof value!=='string'||value.length>2048||/[\\\u0000-\u001f\u007f]/.test(value))return null;
  const rawPath=/^https:\/\/[^/?#]+(\/[^?#]*)?/i.exec(value)?.[1]??'';
  if(/%(?:2e|2f|5c|00)/i.test(rawPath))return null;
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!allowed.includes(url.hostname.toLowerCase())||!url.pathname.startsWith('/'))return null;return url.toString();}catch{return null;}
}
function nasaManifestAssetHref(value:unknown):{providerHref:string;downloadUrl:string}|null{
  if(typeof value!=='string'||!/^https?:\/\/images-assets\.nasa\.gov(?:\/|$)/i.test(value))return null;
  const downloadUrl=fixedHttpsUrl(value.replace(/^http:/i,'https:'),hosts.nasa);
  return downloadUrl?{providerHref:value,downloadUrl}:null;
}
function card(row:Omit<ProviderCandidate,'metadataSha256'>):ProviderCandidate{
  return {...row,metadataSha256:fingerprint({providerId:row.providerId,itemUrl:row.itemUrl,title:row.title,creator:row.creator,publisher:row.publisher,license:row.license,rightsStatus:row.rightsStatus,mediaType:row.mediaType,width:row.width,height:row.height,variant:row.variant,downloadUrl:row.downloadUrl,rightsEvidence:row.rightsEvidence??null})};
}
function commons(payload:unknown,mediaType:LiveMediaType):ProviderCandidate[]{
  const pages=obj(obj(payload).query).pages;const rows=Array.isArray(pages)?pages:Object.values(obj(pages));const result:ProviderCandidate[]=[];
  for(const raw of rows.slice(0,MAX_ROWS)){const page=obj(raw),info=obj(Array.isArray(page.imageinfo)?page.imageinfo[0]:null),mime=clean(info.mime,80).toLowerCase();
    if(!(mediaType==='image'?['image/jpeg','image/png','image/webp'].includes(mime):['video/mp4','video/webm'].includes(mime)))continue;
    const providerId=String(positive(page.pageid)??''),title=clean(page.title,300),downloadUrl=fixedHttpsUrl(info.url,hosts.wikimedia);
    const itemUrl=fixedHttpsUrl(`https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(' ','_'))}`,['commons.wikimedia.org']);
    if(!providerId||!title||!downloadUrl||!itemUrl)continue;
    const meta=obj(info.extmetadata),artistRaw=typeof obj(meta.Artist).value==='string'?obj(meta.Artist).value:'',creator=clean(artistRaw),license=clean(obj(meta.LicenseShortName).value),rightsStatus=clean(obj(meta.UsageTerms).value);
    const licenseUrl=typeof obj(meta.LicenseUrl).value==='string'?obj(meta.LicenseUrl).value:'';
    result.push(card({providerId,itemUrl,title,creator,publisher:'Wikimedia Commons',license,rightsStatus,mediaType,width:positive(info.width),height:positive(info.height),variant:{kind:'original',label:'Commons imageinfo.url 원본'},downloadUrl,
      rightsEvidence:{licenseLabel:typeof obj(meta.LicenseShortName).value==='string'?obj(meta.LicenseShortName).value:'',
        licenseUrl,licenseCode:typeof obj(meta.License).value==='string'?obj(meta.License).value:'',
        creator,artistRaw,usageTerms:typeof obj(meta.UsageTerms).value==='string'?obj(meta.UsageTerms).value:''}}));
  }return result;
}
function nasa(payload:unknown):ProviderCandidate[]{
  const rows=obj(obj(payload).collection).items;const result:ProviderCandidate[]=[];
  for(const raw of (Array.isArray(rows)?rows:[]).slice(0,MAX_ROWS)){const data=obj(Array.isArray(obj(raw).data)?obj(raw).data[0]:null);
    if(data.media_type!=='image')continue;const providerId=clean(data.nasa_id,200);if(!providerId||!/^[\w.-]{1,200}$/.test(providerId))continue;
    const itemUrl=fixedHttpsUrl(`https://images.nasa.gov/details/${encodeURIComponent(providerId)}`,['images.nasa.gov']);if(!itemUrl)continue;
    result.push(card({providerId,itemUrl,title:clean(data.title,300),creator:clean(data.photographer)||clean(data.creator),publisher:'NASA Image Library',license:'',rightsStatus:'항목별 NASA 사용 지침·제3자 권리 확인 필요',mediaType:'image',width:positive(data.width),height:positive(data.height),variant:{kind:'published-asset',label:'검색 미리보기 아님 · 선택 후 asset manifest 파일 등급 확인'},downloadUrl:null}));
  }return result;
}
function loc(payload:unknown):ProviderCandidate[]{
  const rows=obj(payload).results;const result:ProviderCandidate[]=[];
  for(const raw of (Array.isArray(rows)?rows:[]).slice(0,MAX_ROWS)){const item=obj(raw),providerPage=typeof item.id==='string'&&item.id.startsWith('http://www.loc.gov/')?item.id.replace(/^http:/,'https:'):item.id,itemUrl=fixedHttpsUrl(providerPage,['www.loc.gov','loc.gov']);if(!itemUrl)continue;
    const options=(Array.isArray(item.image_url)?item.image_url:[]).map((value:unknown)=>fixedHttpsUrl(value,hosts.loc)).filter((value:string|null):value is string=>!!value);
    const downloadUrl=options.at(-1)??null;if(!downloadUrl)continue;
    const creator=Array.isArray(item.contributor)?clean(item.contributor[0]):clean(item.contributor);
    result.push(card({providerId:itemUrl,itemUrl,title:clean(item.title,300),creator,publisher:'Library of Congress',license:clean(item.rights)||clean(item.rights_summary),rightsStatus:clean(item.rights_summary)||clean(item.rights),mediaType:'image',width:null,height:null,variant:{kind:'derivative-or-unknown',label:'LOC image_url 변형본·원본 여부 미확인'},downloadUrl}));
  }return result;
}
function sourceUrl(request:ProviderRequest):string{
  const {provider,query,page,mediaType}=request;
  if(provider==='wikimedia'){
    const url=new URL('https://commons.wikimedia.org/w/api.php');url.searchParams.set('action','query');url.searchParams.set('generator','search');url.searchParams.set('gsrsearch',`${query} filetype:${mediaType==='image'?'bitmap':'video'}`);url.searchParams.set('gsrnamespace','6');url.searchParams.set('gsroffset',String((page-1)*MAX_ROWS));url.searchParams.set('gsrlimit',String(MAX_ROWS));url.searchParams.set('prop','imageinfo');url.searchParams.set('iiprop','url|mime|size|dimensions|extmetadata');url.searchParams.set('format','json');url.searchParams.set('formatversion','2');return url.toString();
  }
  if(provider==='nasa'){const url=new URL('https://images-api.nasa.gov/search');url.searchParams.set('q',query);url.searchParams.set('media_type','image');url.searchParams.set('page_size',String(MAX_ROWS));url.searchParams.set('page',String(page));return url.toString();}
  const url=new URL('https://www.loc.gov/photos/');url.searchParams.set('q',query);url.searchParams.set('fo','json');url.searchParams.set('c',String(MAX_ROWS));url.searchParams.set('sp',String(page));return url.toString();
}
async function requestBytes(url:string,allowed:readonly string[],limit:number,contentTypes:readonly string[],fetcher:FetchLike,signal?:AbortSignal):Promise<{bytes:Buffer;mime:string}>{
  if(fixedHttpsUrl(url,allowed)!==url)throw new StoreError('제공처 주소가 허용 범위를 벗어났습니다.',409);
  const timeout=AbortSignal.timeout(12_000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const abortable=<T>(promise:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{
    if(combined.aborted){reject(new StoreError('제공처 응답 시간이 초과됐습니다.',502));return;}
    const abort=()=>reject(new StoreError('제공처 응답 시간이 초과됐습니다.',502));combined.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>combined.removeEventListener('abort',abort));
  });
  let response:Response;try{response=await abortable(fetcher(url,{redirect:'manual',signal:combined,headers:{'Accept':contentTypes.join(', '),'User-Agent':'VisualMaker local source review/1.0'}}));}catch{throw new StoreError('제공처 연결이 실패하거나 시간 제한을 넘었습니다.',502);}
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new StoreError('제공처 리디렉션은 허용하지 않습니다.',502);}
  if(!response.ok||response.url!==url){await response.body?.cancel();throw new StoreError('제공처 응답 주소 또는 상태가 올바르지 않습니다.',502);}
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!contentTypes.includes(mime)){await response.body?.cancel();throw new StoreError('제공처 파일 형식이 지원 범위를 벗어났습니다.',415);}
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){await response.body?.cancel();throw new StoreError('제공처 파일 크기가 제한을 넘었습니다.',413);}
  if(!response.body)throw new StoreError('제공처 응답 본문이 없습니다.',502);
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await abortable(reader.read());if(done)break;size+=value.byteLength;if(size>limit)throw new StoreError('제공처 파일 크기가 제한을 넘었습니다.',413);parts.push(value);}if(size<1)throw new StoreError('제공처 파일이 비어 있습니다.',502);return {bytes:Buffer.concat(parts,size),mime};}
  catch(error){if(error instanceof StoreError)throw error;throw new StoreError('제공처 파일 전송을 완료하지 못했습니다.',502);}
  finally{void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* outstanding aborted read */}}
}
export async function searchLiveProvider(request:ProviderRequest):Promise<ProviderCandidate[]>{
  if(request.provider==='nasa'&&request.mediaType!=='image'||request.provider==='loc'&&request.mediaType!=='image')throw new StoreError('제공처가 요청한 영상 유형을 지원하지 않습니다.',400);
  const url=sourceUrl(request),allowed=request.provider==='wikimedia'?['commons.wikimedia.org']:request.provider==='nasa'?['images-api.nasa.gov']:['www.loc.gov'];
  const {bytes}=await requestBytes(url,allowed,MAX_JSON,['application/json','application/vnd.api+json'],request.fetcher??fetch,request.signal);
  let payload:unknown;try{payload=JSON.parse(bytes.toString('utf8'));}catch{throw new StoreError('제공처 검색 응답을 읽을 수 없습니다.',502);}
  return request.provider==='wikimedia'?commons(payload,request.mediaType):request.provider==='nasa'?nasa(payload):loc(payload);
}
export async function acquireLiveProviderFile(request:ProviderRequest,candidate:ProviderCandidate):Promise<{bytes:Buffer;mime:string;variant:LiveVariant;downloadSha256:string;selectionSha256:string;assetManifestSha256:string|null;selectedAssetUrl:string;providerAssetHref:string}>{
  let url=candidate.downloadUrl,providerAssetHref=url,variant=candidate.variant,assetManifestSha256:string|null=null;
  if(request.provider==='nasa'){
    const manifestUrl=`https://images-api.nasa.gov/asset/${encodeURIComponent(candidate.providerId)}`;
    const {bytes}=await requestBytes(manifestUrl,['images-api.nasa.gov'],MAX_JSON,['application/json','application/vnd.api+json'],request.fetcher??fetch,request.signal);
    assetManifestSha256=createHash('sha256').update(bytes).digest('hex');
    let payload:unknown;try{payload=JSON.parse(bytes.toString('utf8'));}catch{throw new StoreError('NASA 파일 목록을 읽을 수 없습니다.',502);}
    const rows=obj(obj(payload).collection).items;
    const options=(Array.isArray(rows)?rows:[]).map((entry:unknown)=>nasaManifestAssetHref(obj(entry).href)).filter((value):value is {providerHref:string;downloadUrl:string}=>!!value&&/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(value.downloadUrl));
    const chosen=options.find(value=>/~orig\.(?:jpe?g|png|webp)(?:\?|$)/i.test(value.downloadUrl))??options[0]??null;
    url=chosen?.downloadUrl??null;providerAssetHref=chosen?.providerHref??null;
    const name=new URL(url||'https://images-assets.nasa.gov/').pathname.toLowerCase();
    const grade=/~orig\./.test(name)?'원본 표시(~orig)':/~medium\./.test(name)?'중간 크기(~medium)':/~small\./.test(name)?'축소본(~small)':/~thumb\./.test(name)?'썸네일(~thumb)':'등급 미상';
    variant={kind:'published-asset',label:`NASA asset manifest 게시 파일 · ${grade}`};
  }
  if(!url||!providerAssetHref)throw new StoreError('선택한 자료의 내려받을 파일이 없습니다.',409);
  const types=request.mediaType==='image'?['image/jpeg','image/png','image/webp']:['video/mp4','video/webm'];
  const {bytes,mime}=await requestBytes(url,hosts[request.provider],MAX_MEDIA,types,request.fetcher??fetch,request.signal);
  return {bytes,mime,variant,downloadSha256:createHash('sha256').update(bytes).digest('hex'),selectionSha256:fingerprint({provider:request.provider,providerId:candidate.providerId,metadataSha256:candidate.metadataSha256,assetManifestSha256,providerAssetHref,selectedUrl:url,variant}),assetManifestSha256,selectedAssetUrl:url,providerAssetHref};
}
