import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {AudioAssemblyReport} from '../../../visualmaker/core/audio-assembly.ts';
import type {AudioAssemblyExecutionContract,AudioAssemblyReceipt} from '../../../visualmaker/renderer/audio-assembly-contract.ts';
import {episodePlanHash,episodeResponseScope} from './episode-client.ts';

const HASH=/^[a-f0-9]{64}$/;
async function sha(bytes:BufferSource):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export function audioResponseScope(response:Response,job:Job):boolean{return episodeResponseScope(response,job);}

export function currentAudioReport(value:unknown,plan:Plan):AudioAssemblyReport|null{
  if(!value||typeof value!=='object'||!('report' in value))return null;
  const report=(value as {report:AudioAssemblyReport}).report;
  if(!report||report.schemaVersion!=='visualmaker-audio-assembly-v1'||report.episodeId!=='episode-001'||
    report.scope?.projectId!==plan.id||report.scope.revision!==plan.revision||report.scope.scriptSha256!==plan.script.rawSha256||
    report.productionAuthority!==false||report.reviewApproved!==false||report.technicalAudioAligned!==false||
    !Array.isArray(report.blockers)||!report.blockers.every(item=>typeof item.code==='string'&&typeof item.detail==='string')||
    !Array.isArray(report.validators)||!Array.isArray(report.voices)||!report.voices.every(voice=>
      /^SH\d{3}$/u.test(voice.cutId)&&HASH.test(voice.sha256)&&Number.isSafeInteger(voice.voiceStartFrame)&&
      Number.isSafeInteger(voice.voiceStartSample)&&Number.isSafeInteger(voice.voiceSamples)&&voice.voiceSamples>0&&
      Number.isSafeInteger(voice.decodedSamples)&&voice.decodedSamples===voice.voiceSamples&&
      Number.isSafeInteger(voice.audibleSamples)&&voice.audibleSamples>0&&
      Number.isSafeInteger(voice.firstAudibleSample)&&voice.firstAudibleSample>=0&&
      Number.isSafeInteger(voice.lastAudibleSample)&&voice.lastAudibleSample<voice.decodedSamples)||
    (report.renderEligible&&(!report.composition||report.blockers.length!==0||report.voices.length<1))||
    (!report.renderEligible&&report.blockers.length===0))return null;
  return report;
}

export async function currentAudioEnqueue(value:unknown,plan:Plan):Promise<{job:Job;report:AudioAssemblyReport}|null>{
  if(!value||typeof value!=='object'||!('job' in value)||!('executionContract' in value))return null;
  const {job,executionContract:contract}=value as {job:Job;executionContract:AudioAssemblyExecutionContract};
  const report=currentAudioReport({report:contract?.report},plan);
  if(!job||!contract||!report||job.schemaVersion!=='visualmaker-job-v1'||!/^job_[a-f0-9-]{36}$/u.test(job.id)||
    job.kind!=='audio-timed-assembly'||!['blocked','queued'].includes(job.status)||job.projectId!==plan.id||
    job.requestedRevision!==plan.revision||job.sceneId!==null||job.attempt!==0||job.productionAuthority!==false||
    !HASH.test(job.snapshotSha256)||!HASH.test(job.executionContractSha256??'')||
    contract.schemaVersion!=='visualmaker-audio-assembly-execution-v1'||!HASH.test(contract.reportSha256)||
    (job.status==='blocked'&&report.renderEligible)||(job.status==='queued'&&!report.renderEligible)||
    report.scope.snapshotSha256!==job.snapshotSha256||
    job.snapshotSha256!==await episodePlanHash(plan)||
    contract.reportSha256!==await sha(new TextEncoder().encode(JSON.stringify(report)))||
    job.executionContractSha256!==await sha(new TextEncoder().encode(JSON.stringify(contract))))return null;
  return {job,report};
}

export async function currentAudioReceipt(bytes:Uint8Array,job:Job,plan:Plan):Promise<AudioAssemblyReceipt|null>{
  if(bytes.byteLength<1||bytes.byteLength>2_000_000||job.schemaVersion!=='visualmaker-job-v1'||
    job.kind!=='audio-timed-assembly'||job.status!=='succeeded'||job.productionAuthority!==false||
    job.projectId!==plan.id||job.requestedRevision!==plan.revision||job.sceneId!==null||job.attempt<1||
    job.snapshotSha256!==await episodePlanHash(plan)||!HASH.test(job.executionContractSha256??''))return null;
  const video=job.artifacts.find(item=>item.name==='provisional-voiced-episode.mp4');
  const record=job.artifacts.find(item=>item.name==='provisional-voiced-episode.json');
  if(job.artifacts.length!==2||!video||!record||video.productionAuthority!==false||record.productionAuthority!==false||
    record.bytes!==bytes.byteLength||record.sha256!==await sha(bytes))return null;
  let receipt:AudioAssemblyReceipt;
  try{receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as AudioAssemblyReceipt;}catch{return null;}
  if(!receipt||typeof receipt!=='object')return null;
  const {composition,measured,output}=receipt;
  if(receipt.schemaVersion!=='visualmaker-audio-assembly-receipt-v1'||receipt.artifactKind!=='audio-timed-assembly'||
    receipt.episodeId!=='episode-001'||receipt.jobId!==job.id||receipt.attempt!==job.attempt||
    receipt.projectId!==plan.id||receipt.requestedRevision!==plan.revision||
    receipt.snapshotSha256!==job.snapshotSha256||receipt.executionContractSha256!==job.executionContractSha256||
    receipt.rendererVersion!=='4.0.516'||receipt.reviewProfile!=='remotion-motion'||
    receipt.productionAuthority!==false||receipt.reviewApproved!==false||receipt.technicalAudioAligned!==true||
    !receipt.ffmpegVersion?.startsWith('ffmpeg version ')||
    composition?.id!=='EP001-Episode-Provisional'||composition.width!==1920||composition.height!==1080||
    !Number.isSafeInteger(composition.fps)||composition.fps<1||!Number.isSafeInteger(composition.durationFrames)||composition.durationFrames<1||
    output?.name!=='provisional-voiced-episode.mp4'||output.bytes!==video.bytes||output.sha256!==video.sha256||!HASH.test(output.sha256)||
    measured?.width!==composition.width||measured.height!==composition.height||measured.fps!==composition.fps||
    measured.frames!==composition.durationFrames||measured.videoCodec!=='h264'||measured.audioCodec!=='aac'||
    measured.audioStreams!==1||measured.audioSampleRate!==48000||measured.audioChannels!==2||
    measured.decodedAudioNonzero!==true||!Number.isSafeInteger(measured.decodedAudioSamples)||measured.decodedAudioSamples<1||
    !Number.isFinite(measured.durationSeconds)||Math.abs(measured.durationSeconds-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps)||
    !Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||measured.frameSha256.some(item=>!HASH.test(item))||
    !HASH.test(measured.videoPacketSha256)||!Array.isArray(measured.voiceWindowActivity)||
    measured.voiceWindowActivity.length!==receipt.voices?.length||
    !Array.isArray(receipt.visual?.frameSha256)||JSON.stringify(receipt.visual.frameSha256)!==JSON.stringify(measured.frameSha256)||
    !Array.isArray(receipt.visualInputs)||!receipt.authorityFingerprints||!receipt.audioFingerprints||
    !Array.isArray(receipt.voices)||receipt.voices.length<1||!receipt.voices.every(voice=>
      /^SH\d{3}$/u.test(voice.cutId)&&HASH.test(voice.sha256)&&Number.isSafeInteger(voice.voiceStartSample)&&
      Number.isSafeInteger(voice.decodedSamples)&&voice.decodedSamples>0&&
      Number.isSafeInteger(voice.audibleSamples)&&voice.audibleSamples>0))return null;
  return receipt;
}

export function currentAudioJob(job:Job,current:{projectId:string;revision:number;scriptSha256:string},latest:Job|undefined):boolean{
  return job.kind==='audio-timed-assembly'&&job.status==='succeeded'&&job.projectId===current.projectId&&
    job.requestedRevision===current.revision&&latest?.id===job.id&&latest.attempt===job.attempt&&
    latest.snapshotSha256===job.snapshotSha256&&latest.executionContractSha256===job.executionContractSha256;
}
