import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {EpisodeReport} from '../../../visualmaker/core/episode-provisional.ts';
import type {EpisodeExecutionContract,EpisodeReceipt} from '../../../visualmaker/renderer/episode-contract.ts';

const HASH=/^[a-f0-9]{64}$/;
async function sha(bytes:BufferSource):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export async function episodePlanHash(plan:Plan):Promise<string>{return sha(new TextEncoder().encode(JSON.stringify(plan)));}

export async function currentEpisodeEnqueue(value:unknown,plan:Plan):Promise<{job:Job;report:EpisodeReport}|null>{
  if(!value||typeof value!=='object'||!('job' in value)||!('executionContract' in value))return null;
  const pair=value as {job:Job;executionContract:EpisodeExecutionContract};
  const {job,executionContract:contract}=pair,report=contract?.report;
  if(!job||!contract||!report||job.schemaVersion!=='visualmaker-job-v1'||!/^job_[a-f0-9-]{36}$/.test(job.id)||
    job.kind!=='episode-provisional-video'||!['blocked','queued'].includes(job.status)||
    job.projectId!==plan.id||job.requestedRevision!==plan.revision||job.sceneId!==null||job.attempt!==0||
    job.productionAuthority!==false||!HASH.test(job.snapshotSha256)||!HASH.test(job.executionContractSha256??'')||
    contract.schemaVersion!=='visualmaker-episode-execution-v1'||!HASH.test(contract.reportSha256)||
    report.schemaVersion!=='visualmaker-episode-provisional-v1'||report.episodeId!=='episode-001'||
    report.scope?.projectId!==plan.id||report.scope.revision!==plan.revision||
    report.scope.scriptSha256!==plan.script.rawSha256||report.scope.snapshotSha256!==job.snapshotSha256||
    report.productionAuthority!==false||report.reviewApproved!==false||report.audioSynchronized!==false||
    !Array.isArray(report.blockers)||!report.blockers.every(item=>typeof item.code==='string'&&typeof item.detail==='string')||
    !Array.isArray(report.validators)||!Array.isArray(report.cuts)||!Array.isArray(report.boundaries)||!Array.isArray(report.inputs)||
    (job.status==='blocked'&&(report.renderEligible!==false||report.blockers.length===0))||
    (job.status==='queued'&&(report.renderEligible!==true||report.blockers.length!==0||
      report.composition?.id!=='EP001-Episode-Provisional'||report.composition.width!==1920||report.composition.height!==1080||
      !Number.isSafeInteger(report.composition.durationFrames)||report.composition.durationFrames<1||report.cuts.length<1||
      report.validators.length!==4||report.validators.some(item=>item.passed!==true))))return null;
  const planHash=await episodePlanHash(plan);
  if(planHash!==job.snapshotSha256||await sha(new TextEncoder().encode(JSON.stringify(report)))!==contract.reportSha256||
    await sha(new TextEncoder().encode(JSON.stringify(contract)))!==job.executionContractSha256)return null;
  return {job,report};
}

export function episodeResponseScope(response:Response,job:Job):boolean{
  return response.ok&&response.headers.get('cache-control')==='no-store'&&
    response.headers.get('x-visualmaker-project-id')===job.projectId&&
    response.headers.get('x-visualmaker-job-id')===job.id&&
    response.headers.get('x-visualmaker-attempt')===String(job.attempt)&&
    response.headers.get('x-visualmaker-revision')===String(job.requestedRevision);
}

export async function currentEpisodeReceipt(bytes:Uint8Array,job:Job,plan:Plan):Promise<EpisodeReceipt|null>{
  if(bytes.byteLength<1||bytes.byteLength>2_000_000||job.schemaVersion!=='visualmaker-job-v1'||job.productionAuthority!==false||
    !/^job_[a-f0-9-]{36}$/.test(job.id)||job.kind!=='episode-provisional-video'||
    job.status!=='succeeded'||job.projectId!==plan.id||job.requestedRevision!==plan.revision||
    job.sceneId!==null||job.attempt<1||job.snapshotSha256!==await episodePlanHash(plan)||
    !HASH.test(job.executionContractSha256??''))return null;
  const artifact=job.artifacts.find(item=>item.name==='provisional-episode.json');
  const video=job.artifacts.find(item=>item.name==='provisional-episode.mp4');
  if(job.artifacts.length!==2||!artifact||!video||artifact.bytes!==bytes.byteLength||
    artifact.productionAuthority!==false||video.productionAuthority!==false||
    !HASH.test(artifact.sha256)||artifact.sha256!==await sha(bytes))return null;
  let receipt:EpisodeReceipt;try{receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as EpisodeReceipt;}catch{return null;}
  const {composition,measured,output}=receipt;
  if(receipt.schemaVersion!=='visualmaker-provisional-episode-receipt-v1'||receipt.artifactKind!=='episode-provisional-video'||
    receipt.episodeId!=='episode-001'||receipt.jobId!==job.id||receipt.projectId!==plan.id||
    receipt.requestedRevision!==plan.revision||receipt.attempt!==job.attempt||
    receipt.snapshotSha256!==job.snapshotSha256||receipt.executionContractSha256!==job.executionContractSha256||
    receipt.rendererVersion!=='4.0.516'||receipt.reviewProfile!=='remotion-motion'||
    receipt.productionAuthority!==false||receipt.reviewApproved!==false||receipt.audioSynchronized!==false||
    composition?.id!=='EP001-Episode-Provisional'||composition.width!==1920||composition.height!==1080||
    !Number.isSafeInteger(composition.fps)||composition.fps<1||!Number.isSafeInteger(composition.durationFrames)||composition.durationFrames<1||
    !Array.isArray(receipt.cuts)||receipt.cuts.length<1||!Array.isArray(receipt.boundaries)||!Array.isArray(receipt.inputs)||
    !receipt.authorityFingerprints||typeof receipt.authorityFingerprints!=='object'||
    output?.name!=='provisional-episode.mp4'||output.bytes!==video.bytes||output.sha256!==video.sha256||!HASH.test(output.sha256)||
    measured?.width!==composition.width||measured.height!==composition.height||measured.fps!==composition.fps||
    measured.frames!==composition.durationFrames||measured.codec!=='h264'||measured.audioStreams!==0||
    !Number.isFinite(measured.durationSeconds)||measured.durationSeconds<=0||
    Math.abs(measured.durationSeconds-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps)||
    !Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||measured.frameSha256.some(value=>!HASH.test(value)))return null;
  return receipt;
}

export function currentEpisodeJob(initial:{projectId:string;revision:number;scriptSha256:string},
  current:{projectId:string;revision:number;scriptSha256:string},job:Job,latest:Job|undefined):boolean{
  return initial.projectId===current.projectId&&initial.revision===current.revision&&initial.scriptSha256===current.scriptSha256&&
    job.projectId===current.projectId&&job.requestedRevision===current.revision&&
    latest?.id===job.id&&latest.kind==='episode-provisional-video'&&latest.status==='succeeded'&&
    latest.attempt===job.attempt&&latest.snapshotSha256===job.snapshotSha256&&
    latest.executionContractSha256===job.executionContractSha256;
}
