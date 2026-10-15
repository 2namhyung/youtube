import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {FinalizationJobReceipt} from '../../../visualmaker/renderer/finalization-contract.ts';
import {episodePlanHash} from './episode-client.ts';
import {validFinalizationMixV2} from './finalization-mix-client.ts';

const HASH=/^[a-f0-9]{64}$/u;
const JOB=/^job_[a-f0-9-]{36}$/u;
export const FINALIZATION_NAMES=['export.mp4','export.srt','export.vtt','export.png','export.json'] as const;
export type FinalizationName=typeof FINALIZATION_NAMES[number];
export type FinalizationSideName=Exclude<FinalizationName,'export.mp4'>;
const SIDE_LIMITS:Record<FinalizationSideName,number>={
  'export.srt':5_000_000,'export.vtt':5_000_000,'export.png':200_000_000,'export.json':5_000_000
};
export type PublicFinalizationReadiness={
  schemaVersion:'visualmaker-post-lock-output-v1';
  scope:{projectId:string;revision:number;scriptSha256:string;snapshotSha256:string};
  composition:{width:number;height:number;fps:number;durationFrames:number}|null;
  validators:Array<{name:string;passed:boolean}>;
  blockers:Array<{code:string;detail:string}>;
  renderEligible:boolean;productionAuthority:false;reviewApproved:false;
};

async function sha(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function currentFinalizationReadiness(value:unknown,plan:Plan):Promise<PublicFinalizationReadiness|null>{
  if(!value||typeof value!=='object'||Object.keys(value).join(',')!=='readiness')return null;
  const report=(value as {readiness:PublicFinalizationReadiness}).readiness;
  if(!report||Object.keys(report).sort().join(',')!==['schemaVersion','scope','composition','validators','blockers','renderEligible','productionAuthority','reviewApproved'].sort().join(',')||
    report.schemaVersion!=='visualmaker-post-lock-output-v1'||report.scope?.projectId!==plan.id||
    report.scope.revision!==plan.revision||report.scope.scriptSha256!==plan.script.rawSha256||
    report.scope.snapshotSha256!==await episodePlanHash(plan)||report.productionAuthority!==false||report.reviewApproved!==false||
    typeof report.renderEligible!=='boolean'||!Array.isArray(report.validators)||
    !report.validators.every(item=>typeof item?.name==='string'&&item.name.length>0&&typeof item.passed==='boolean')||
    !Array.isArray(report.blockers)||!report.blockers.every(item=>typeof item?.code==='string'&&item.code.length>0&&typeof item.detail==='string'&&item.detail.length>0)||
    (report.renderEligible&&(report.blockers.length!==0||!report.composition||report.validators.some(item=>!item.passed)))||
    (!report.renderEligible&&report.blockers.length===0))return null;
  if(report.composition&&(
    report.composition.width!==1920||report.composition.height!==1080||
    !Number.isSafeInteger(report.composition.fps)||report.composition.fps<1||
    !Number.isSafeInteger(report.composition.durationFrames)||report.composition.durationFrames<1))return null;
  return report;
}

function jobScope(job:Job,plan:Plan):boolean{return job.schemaVersion==='visualmaker-job-v1'&&JOB.test(job.id)&&
  job.kind==='episode-finalization-export'&&job.projectId===plan.id&&job.requestedRevision===plan.revision&&
  job.sceneId===null&&job.productionAuthority===false&&HASH.test(job.snapshotSha256)&&
  HASH.test(job.executionContractSha256??'');}

export async function currentFinalizationEnqueue(value:unknown,plan:Plan):Promise<{job:Job;readiness:PublicFinalizationReadiness}|null>{
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='job,readiness')return null;
  const pair=value as {job:Job;readiness:PublicFinalizationReadiness};
  const readiness=await currentFinalizationReadiness({readiness:pair.readiness},plan),job=pair.job;
  if(!readiness||!job||!jobScope(job,plan)||job.snapshotSha256!==readiness.scope.snapshotSha256||
    !['blocked','queued'].includes(job.status)||job.attempt!==0||job.artifacts?.length!==0||
    (job.status==='blocked'&&readiness.renderEligible)||(job.status==='queued'&&!readiness.renderEligible))return null;
  return {job,readiness};
}

export function currentFinalizationJob(job:Job,current:{projectId:string;revision:number;scriptSha256:string},latest:Job|undefined):boolean{
  return job.kind==='episode-finalization-export'&&job.status==='succeeded'&&job.productionAuthority===false&&
    job.projectId===current.projectId&&job.requestedRevision===current.revision&&
    latest?.id===job.id&&latest.attempt===job.attempt&&latest.status===job.status&&
    latest.snapshotSha256===job.snapshotSha256&&latest.executionContractSha256===job.executionContractSha256;
}

export function finalizationResponseScope(response:Response,job:Job,name:FinalizationName):boolean{
  return response.status===200&&response.headers.get('cache-control')==='no-store'&&
    response.headers.get('x-content-type-options')==='nosniff'&&
    response.headers.get('x-visualmaker-production-authority')==='false'&&
    response.headers.get('x-visualmaker-project-id')===job.projectId&&
    response.headers.get('x-visualmaker-job-id')===job.id&&
    response.headers.get('x-visualmaker-attempt')===String(job.attempt)&&
    response.headers.get('x-visualmaker-revision')===String(job.requestedRevision)&&
    response.headers.get('content-disposition')===`attachment; filename="${name}"`&&
    response.headers.get('content-type')?.split(';')[0]===({
      'export.mp4':'video/mp4','export.srt':'application/x-subrip','export.vtt':'text/vtt',
      'export.png':'image/png','export.json':'application/json'
    } as Record<FinalizationName,string>)[name];
}

export async function boundedFinalizationBytes(response:Response,expectedBytes:number,limit:number,signal:AbortSignal):Promise<Uint8Array>{
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>limit){await response.body?.cancel().catch(()=>{});throw new Error('최종화 파일 크기가 허용 범위를 넘었습니다.');}
  const length=response.headers.get('content-length');
  if(length!==null&&Number(length)!==expectedBytes){await response.body?.cancel().catch(()=>{});throw new Error('최종화 파일 전달 크기가 기록과 다릅니다.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('최종화 파일 내용이 비어 있습니다.');
  const bytes=new Uint8Array(expectedBytes);let offset=0;
  try{for(;;){if(signal.aborted)throw new Error('요청이 취소됐습니다.');const {done,value}=await reader.read();if(done)break;
    if(offset+value.byteLength>expectedBytes)throw new Error('최종화 파일이 기록보다 큽니다.');
    bytes.set(value,offset);offset+=value.byteLength;}
    if(offset!==expectedBytes||signal.aborted)throw new Error('최종화 파일이 완전히 전달되지 않았습니다.');
    return bytes;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}

export async function finalizationFileMatches(bytes:Uint8Array,record:{bytes:number;sha256:string}):Promise<boolean>{
  return bytes.byteLength===record.bytes&&HASH.test(record.sha256)&&await sha(bytes)===record.sha256;
}

/** Every click opens the protected endpoint again so current authority and artifacts are revalidated. */
export async function fetchFinalizationSidecar(input:{name:FinalizationSideName;job:Job;token:string;signal:AbortSignal;fetcher?:typeof fetch}):Promise<Uint8Array>{
  const {name,job,token,signal,fetcher=fetch}=input;
  if(!Object.hasOwn(SIDE_LIMITS,name)||!Array.isArray(job.artifacts))throw new Error('최종 내보내기 파일 이름 또는 작업이 올바르지 않습니다.');
  const record=job.artifacts.find(item=>item.name===name);
  if(!record)throw new Error('최종 내보내기 파일 기록이 없습니다.');
  const query=new URLSearchParams({jobId:job.id,projectId:job.projectId,baseRevision:String(job.requestedRevision),attempt:String(job.attempt),name});
  const response=await fetcher(`/api/studio/jobs/export-media?${query}`,{headers:{'x-visualmaker-token':token},cache:'no-store',signal});
  if(!finalizationResponseScope(response,job,name)){await response.body?.cancel().catch(()=>{});throw new Error('현재 작업의 최종 내보내기 파일 응답이 아닙니다.');}
  const bytes=await boundedFinalizationBytes(response,record.bytes,SIDE_LIMITS[name],signal);
  if(!await finalizationFileMatches(bytes,record))throw new Error('최종 내보내기 파일의 SHA-256이 기록과 다릅니다.');
  return bytes;
}

export async function currentFinalizationReceipt(bytes:Uint8Array,job:Job,plan:Plan,sourceJobs:Job[]):Promise<FinalizationJobReceipt|null>{
  if(bytes.byteLength<1||bytes.byteLength>5_000_000||!jobScope(job,plan)||job.status!=='succeeded'||
    !Number.isSafeInteger(job.attempt)||job.attempt<1||job.snapshotSha256!==await episodePlanHash(plan)||
    !Array.isArray(job.artifacts)||job.artifacts.length!==5||job.artifacts.some(item=>!item||item.productionAuthority!==false||!HASH.test(item.sha256)||
      !Number.isSafeInteger(item.bytes)||item.bytes<1)||
    new Set(job.artifacts.map(item=>item.name)).size!==5||FINALIZATION_NAMES.some(name=>!job.artifacts.some(item=>item.name===name)))return null;
  const record=job.artifacts.find(item=>item.name==='export.json')!;
  if(!await finalizationFileMatches(bytes,record))return null;
  let receipt:FinalizationJobReceipt;
  try{receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as FinalizationJobReceipt;}catch{return null;}
  if(!receipt||!['visualmaker-finalization-job-receipt-v1','visualmaker-finalization-job-receipt-v2'].includes(receipt.schemaVersion)||
    receipt.artifactKind!=='episode-finalization-export'||receipt.episodeId!=='episode-001'||
    receipt.jobId!==job.id||receipt.attempt!==job.attempt||receipt.projectId!==plan.id||
    receipt.requestedRevision!==plan.revision||receipt.snapshotSha256!==job.snapshotSha256||
    receipt.executionContractSha256!==job.executionContractSha256||
    receipt.productionAuthority!==false||receipt.reviewApproved!==false||
    !Array.isArray(receipt.files)||receipt.files.length!==4||
    receipt.files.some((file,index)=>!file||file.name!==FINALIZATION_NAMES[index]||
      file.sha256!==job.artifacts.find(item=>item.name===file.name)?.sha256||
      file.bytes!==job.artifacts.find(item=>item.name===file.name)?.bytes))return null;
  const source=receipt.source;
  if(!source||!JOB.test(source.jobId)||!Number.isSafeInteger(source.attempt)||source.attempt<1||
    !HASH.test(source.artifactSha256)||!HASH.test(source.receiptSha256))return null;
  const audio=sourceJobs.find(item=>item.id===source.jobId);
  if(!audio||audio.kind!=='audio-timed-assembly'||audio.status!=='succeeded'||audio.productionAuthority!==false||
    audio.projectId!==job.projectId||audio.requestedRevision!==job.requestedRevision||audio.attempt!==source.attempt||
    !Array.isArray(audio.artifacts)||audio.artifacts.length!==2||
    audio.artifacts.find(item=>item.name==='provisional-voiced-episode.mp4')?.sha256!==source.artifactSha256||
    audio.artifacts.find(item=>item.name==='provisional-voiced-episode.json')?.sha256!==source.receiptSha256)return null;
  const technical=receipt.technical as Record<string,unknown>|null;
  if(!technical||technical.schemaVersion!==(receipt.schemaVersion==='visualmaker-finalization-job-receipt-v2'?
    'visualmaker-finalization-receipt-v2':'visualmaker-finalization-receipt-v1')||
    technical.episodeId!=='episode-001'||technical.productionAuthority!==false||technical.reviewApproved!==false||
    JSON.stringify(technical.source)!==JSON.stringify(source)||JSON.stringify(technical.files)!==JSON.stringify(receipt.files)||
    !technical.mix||receipt.schemaVersion==='visualmaker-finalization-job-receipt-v1'&&
      (receipt.mixApproval!==undefined||JSON.stringify(technical.mix)!==JSON.stringify({mode:'passthrough'}))||
    !technical.measured||typeof technical.ffmpegVersion!=='string'||!technical.ffmpegVersion.startsWith('ffmpeg version '))return null;
  const measured=technical.measured as Record<string,unknown>;
  if(measured.width!==1920||measured.height!==1080||!Number.isSafeInteger(measured.fps)||
    !Number.isSafeInteger(measured.frames)||Number(measured.frames)<1||
    !Number.isFinite(measured.durationSeconds)||Number(measured.durationSeconds)<=0||
    !Number.isSafeInteger(measured.subtitleCount)||Number(measured.subtitleCount)<1||
    !HASH.test(String(measured.videoPacketSha256??''))||!HASH.test(String(measured.audioPacketSha256??''))||
    receipt.schemaVersion==='visualmaker-finalization-job-receipt-v2'&&!validFinalizationMixV2(receipt))return null;
  return receipt;
}
