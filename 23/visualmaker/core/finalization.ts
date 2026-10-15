import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,fstatSync,openSync,readSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {currentPlanForCanonical,safeCanonicalFile} from './canonical-cut-render.ts';
import {streamedFileFingerprint} from './episode-provisional.ts';
import {dataRoot,StoreError} from './store.ts';
import {assertPlainCaptionText,bindFinalizationMix,parseFinalizationMix} from './finalization-mix.ts';
import type {CaptionSegment,FinalizationBinding,FinalizationReport,FinalizationSelection} from '../renderer/finalization-contract.ts';

const SPEC='video/episodes/episode-001/episode-spec.json';
const STATE='video/episodes/episode-001/production-state.json';
const HEX=/^[a-f0-9]{64}$/u;
const JOB=/^job_[a-f0-9-]{36}$/u;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const record=(value:unknown):value is Record<string,any>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:unknown,required:string[])=>record(value)&&Object.keys(value).sort().join('|')===required.slice().sort().join('|');
const digest=(value:unknown):value is string=>typeof value==='string'&&HEX.test(value);
const safeText=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<100_000;
const safePath=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<300&&/^[A-Za-z0-9_./-]+$/u.test(value)&&!value.startsWith('/')&&!value.includes('//')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
const integer=(value:unknown)=>Number.isSafeInteger(value);

function readBounded(root:string,relative:string,max=3_000_000):{bytes:Buffer;sha256:string}{
  if(!safePath(relative))throw new StoreError('최종화 계약 경로가 올바르지 않습니다.',409);
  const file=safeCanonicalFile(root,relative),fd=openSync(file,'r');
  try{
    const initial=fstatSync(fd);if(!initial.isFile()||initial.size<1||initial.size>max)throw new StoreError('최종화 계약 파일 크기가 올바르지 않습니다.',409);
    const bytes=Buffer.allocUnsafe(initial.size);let used=0;
    while(used<initial.size){const count=readSync(fd,bytes,used,initial.size-used,used);if(!count)break;used+=count;}
    const after=fstatSync(fd);if(used!==initial.size||after.size!==initial.size||after.mtimeMs!==initial.mtimeMs||after.ino!==initial.ino)throw new StoreError('최종화 계약 파일이 확인 중 변경됐습니다.',409);
    return {bytes,sha256:sha(bytes)};
  }finally{closeSync(fd);}
}
function json(bytes:Buffer):Record<string,any>{
  try{const value:unknown=JSON.parse(bytes.toString('utf8'));if(record(value))return value;}catch{}
  throw new StoreError('최종화 JSON 계약을 읽을 수 없습니다.',409);
}
export function parseFinalizationSelection(value:unknown):FinalizationSelection{
  if(!record(value))throw new StoreError('최종화 선택이 없습니다.',409);
  if(!keys(value,['version','final_script','source','picture_marker_sha256','captions','mix','thumbnail'])||(value.version!==1&&value.version!==2)||!keys(value.final_script,['path','sha256'])||!safePath(value.final_script.path)||!digest(value.final_script.sha256)||!keys(value.source,['job_id','attempt','artifact_sha256','receipt_sha256'])||!JOB.test(value.source.job_id)||!integer(value.source.attempt)||value.source.attempt<1||!digest(value.source.artifact_sha256)||!digest(value.source.receipt_sha256)||!digest(value.picture_marker_sha256)||!keys(value.captions,['segments','approval_marker','approval_marker_sha256'])||!Array.isArray(value.captions.segments)||!value.captions.segments.length||value.captions.segments.length>5000||!safePath(value.captions.approval_marker)||!digest(value.captions.approval_marker_sha256)||!keys(value.thumbnail,['frame'])||!integer(value.thumbnail.frame)||value.thumbnail.frame<0)throw new StoreError('최종화 선택이 누락되거나 지원하지 않는 믹스 정책입니다.',409);
  if(value.version===1){if(!keys(value.mix,['mode'])||value.mix.mode!=='passthrough')throw new StoreError('지원하지 않는 믹스 정책입니다.',409);}else parseFinalizationMix(value.mix);
  for(const segment of value.captions.segments)if(!keys(segment,['cut_id','start_frame','end_frame','char_start','char_end','text'])||!/^SH\d{3}$/u.test(segment.cut_id)||!integer(segment.start_frame)||!integer(segment.end_frame)||!integer(segment.char_start)||!integer(segment.char_end)||!safeText(segment.text)||/^\p{White_Space}|\p{White_Space}$/u.test(segment.text)||/[\r\n\u0000-\u001f]/u.test(segment.text))throw new StoreError('자막 구간 계약이 올바르지 않습니다.',409);
  if(value.version===2)assertPlainCaptionText(value.captions.segments as CaptionSegment[]);
  return value as FinalizationSelection;
}
export function validateCaptionCoverage(segments:CaptionSegment[],cuts:Array<{cutId:string;startFrame:number;endFrame:number;text:string}>,durationFrames:number):void{
  if(!integer(durationFrames)||durationFrames<1||!cuts.length||!segments.length)throw new StoreError('확정 자막의 컷 범위가 없습니다.',409);
  let index=0,previousEnd=-1;
  const whitespace=(point:string)=>/^\p{White_Space}$/u.test(point);
  for(const cut of cuts){
    const points=Array.from(cut.text);let cursor=0,count=0;
    while(index<segments.length&&segments[index].cut_id===cut.cutId){
      const segment=segments[index++];count++;
      if(segment.char_start<cursor||count===1&&segment.char_start!==0||segment.char_end<=segment.char_start||segment.char_end>points.length||!points.slice(cursor,segment.char_start).every(whitespace)||segment.text!==points.slice(segment.char_start,segment.char_end).join('')||whitespace(points[segment.char_start])||whitespace(points[segment.char_end-1])||segment.start_frame<cut.startFrame||segment.end_frame>cut.endFrame||segment.end_frame>durationFrames||segment.start_frame<0||segment.end_frame<=segment.start_frame||segment.start_frame<previousEnd)throw new StoreError(`${cut.cutId}: 자막 시간 또는 확정 대본의 연속 구간이 다릅니다.`,409);
      cursor=segment.char_end;previousEnd=segment.end_frame;
    }
    if(!count||cursor!==points.length)throw new StoreError(`${cut.cutId}: 확정 대본 일부에 자막이 없습니다.`,409);
  }
  if(index!==segments.length)throw new StoreError('확정 컷 밖에 자막이 있습니다.',409);
}
export function validateFinalizationApprovalMarker(value:Record<string,any>,kind:'picture'|'caption',binding:{jobId:string;attempt:number;artifactSha256:string;receiptSha256:string;scriptSha256:string;captionSha256?:string;pictureSha256?:string}):void{
  const common=['schema_version','kind','episode_id','reviewer','source','final_script_sha256'];
  if(!keys(value,kind==='picture'?common:[...common,'caption_contract_sha256','picture_marker_sha256'])||value.schema_version!==1||value.kind!==kind||value.episode_id!=='episode-001'||value.reviewer!=='user'||value.final_script_sha256!==binding.scriptSha256||!keys(value.source,['job_id','attempt','artifact_sha256','receipt_sha256'])||value.source.job_id!==binding.jobId||value.source.attempt!==binding.attempt||value.source.artifact_sha256!==binding.artifactSha256||value.source.receipt_sha256!==binding.receiptSha256||kind==='caption'&&(value.caption_contract_sha256!==binding.captionSha256||value.picture_marker_sha256!==binding.pictureSha256))throw new StoreError(`${kind} 사용자 승인 마커가 입력 해시와 다릅니다.`,409);
}
async function pictureStage(root:string,signal?:AbortSignal):Promise<boolean>{
  return await new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(root,'video/scripts/validate-production-stage.mjs'),'--lock','picture-locked'],{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let done=false,size=0;const finish=(passed:boolean)=>{if(done)return;done=true;clearTimeout(timer);resolve(passed);};
    const timer=setTimeout(()=>{child.kill();finish(false);},120_000);
    for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(false);}});
    child.once('error',()=>finish(false));child.once('close',code=>finish(code===0&&size<=1_000_000&&!signal?.aborted));
  });
}
export async function evaluateFinalization(projectId:string,baseRevision:number,signal?:AbortSignal):Promise<FinalizationReport>{
  const root=realpathSync(process.cwd()),plan=currentPlanForCanonical(projectId,baseRevision);
  const report:FinalizationReport={schemaVersion:'visualmaker-post-lock-output-v1',episodeId:'episode-001',scope:{projectId,revision:baseRevision,scriptSha256:plan.script.rawSha256,snapshotSha256:sha(JSON.stringify(plan))},composition:null,binding:null,fingerprints:{},validators:[],blockers:[],renderEligible:false,productionAuthority:false,reviewApproved:false};
  const block=(code:string,detail:string)=>report.blockers.push({code,detail});
  let spec:Record<string,any>,state:Record<string,any>,selection:FinalizationSelection,specSha:string,stateSha:string,addendumPath:string,addendumSha:string;
  try{
    const transition=await import('./post-lock-transition.ts');
    const s=readBounded(root,SPEC,25_000_000),t=readBounded(root,STATE,25_000_000);spec=transition.parsePostLockJson(s.bytes);state=transition.parsePostLockJson(t.bytes);specSha=s.sha256;stateSha=t.sha256;
    report.fingerprints[SPEC]=specSha;report.fingerprints[STATE]=stateSha;
    if(spec.episode_id!=='episode-001'||state.episode_id!=='episode-001')throw new StoreError('에피소드 식별자가 다릅니다.',409);
    if(!keys(spec.post_lock_output,['version','addendum_path'])||spec.post_lock_output.version!==1||!safePath(spec.post_lock_output.addendum_path)||!spec.post_lock_output.addendum_path.startsWith('video/episodes/episode-001/'))throw new StoreError('고정된 후속 제작 addendum 위치가 없습니다.',409);
    addendumPath=spec.post_lock_output.addendum_path;
    const hint=readBounded(root,addendumPath);addendumSha=hint.sha256;selection=parseFinalizationSelection(transition.parsePostLockJson(hint.bytes).selection);
    report.fingerprints[addendumPath]=addendumSha;
  }catch(error){block('post-lock-contract-missing',error instanceof Error?error.message:'최종화 계약이 없습니다.');return report;}
  const stage=await pictureStage(root,signal);report.validators.push({name:'validate-production-stage.mjs --lock picture-locked',passed:stage});
  if(!stage){block('picture-stage-blocked','현재 에피소드가 picture-locked 제작 게이트를 통과하지 못했습니다.');return report;}
  try{
    if(state.picture_lock?.status!=='locked'||state.picture_lock?.approved!==true||!safePath(state.picture_lock?.final_qc_marker))throw new StoreError('picture lock 상태와 승인 마커가 없습니다.',409);
    if(state.final_script?.status!=='locked'||spec.script_lock?.reviewer!=='user'||spec.script_lock?.status!=='locked')throw new StoreError('최종 대본의 사용자 잠금이 없습니다.',409);
    const canonicalScript=spec.editorial_revision?.approved_script_source??spec.editorial_revision?.source_path??spec.script_lock?.source_path;
    if(!safePath(canonicalScript)||selection.final_script.path!==canonicalScript||selection.final_script.sha256!==spec.script_lock.source_sha256)throw new StoreError('최종 대본 출처가 단일 편집 권한과 다릅니다.',409);
    const script=readBounded(root,canonicalScript,5_000_000);if(script.sha256!==selection.final_script.sha256)throw new StoreError('최종 대본 바이트가 변경됐습니다.',409);
    report.fingerprints[canonicalScript]=script.sha256;
    const cuts=spec.cuts;
    if(!Array.isArray(cuts)||!cuts.length||cuts.some((cut:any)=>!/^SH\d{3}$/u.test(cut?.shot_id)||!safeText(cut?.draft_narration)))throw new StoreError('에피소드 확정 대본 컷이 없습니다.',409);
    const narration=cuts.map((cut:any)=>cut.draft_narration.replace(/\s/gu,'')).join('');
    if(sha(narration)!==spec.script_lock.narration_sha256)throw new StoreError('최종 대본과 컷별 대사가 다릅니다.',409);
    const source=await import('./jobs.ts').then(module=>module.readAudioAssemblyForFinalization(selection.source.job_id,{projectId,baseRevision,attempt:selection.source.attempt},signal));
    let receipt=source.receipt,receiptSha:string,sourceSha:string,sourceBytes:number;
    try{receiptSha=sha(source.receiptBytes);sourceSha=source.mp4.sha256;sourceBytes=source.mp4.bytes;}finally{closeSync(source.mp4.fd);}
    if(source.addendum.path!==addendumPath||source.addendum.sha256!==addendumSha||JSON.stringify(source.addendum.selection)!==JSON.stringify(selection)||source.authority.specSha256!==specSha||source.authority.stateSha256!==stateSha||source.authority.scriptSha256!==script.sha256)throw new StoreError('후속 제작 addendum 또는 승인 권한이 다릅니다.',409);
    if(receiptSha!==selection.source.receipt_sha256||sourceSha!==selection.source.artifact_sha256||receipt.projectId!==projectId||receipt.requestedRevision!==baseRevision||receipt.snapshotSha256!==report.scope.snapshotSha256||receipt.output.sha256!==sourceSha||receipt.output.bytes!==sourceBytes||receipt.productionAuthority!==false||receipt.reviewApproved!==false||receipt.technicalAudioAligned!==true)throw new StoreError('성공한 오디오 작업과 영상/영수증이 다릅니다.',409);
    const sourcePath=path.join(dataRoot(),'jobs',selection.source.job_id,`attempt-${selection.source.attempt}`,'provisional-voiced-episode.mp4');
    if(!path.isAbsolute(sourcePath)||realpathSync(sourcePath)!==path.resolve(sourcePath))throw new StoreError('오디오 작업 영상 경로가 올바르지 않습니다.',409);
    const fps=receipt.composition.fps,durationFrames=receipt.composition.durationFrames;
    if(!integer(fps)||fps<1||!integer(durationFrames)||durationFrames<1||selection.thumbnail.frame>=durationFrames||!Array.isArray(receipt.voices)||receipt.voices.length!==cuts.length)throw new StoreError('오디오 영상 길이와 컷 계약이 다릅니다.',409);
    const captionCuts=cuts.map((cut:any,index:number)=>{const voice=receipt.voices[index];if(voice.cutId!==cut.shot_id||!integer(voice.startFrame)||!integer(voice.cutEndFrame)||voice.cutEndFrame<=voice.startFrame)throw new StoreError('대본과 영상 컷 순서가 다릅니다.',409);return {cutId:cut.shot_id,startFrame:voice.startFrame,endFrame:voice.cutEndFrame,text:cut.draft_narration};});
    validateCaptionCoverage(selection.captions.segments,captionCuts,durationFrames);
    const captionContractSha256=sha(JSON.stringify({segments:selection.captions.segments}));
    const picture=readBounded(root,state.picture_lock.final_qc_marker),caption=readBounded(root,selection.captions.approval_marker);
    if(picture.sha256!==selection.picture_marker_sha256||caption.sha256!==selection.captions.approval_marker_sha256)throw new StoreError('사용자 검수 마커 바이트가 변경됐습니다.',409);
    report.fingerprints[state.picture_lock.final_qc_marker]=picture.sha256;report.fingerprints[selection.captions.approval_marker]=caption.sha256;
    const markerBinding={jobId:selection.source.job_id,attempt:selection.source.attempt,artifactSha256:sourceSha,receiptSha256:receiptSha,scriptSha256:script.sha256,captionSha256:captionContractSha256,pictureSha256:picture.sha256};
    validateFinalizationApprovalMarker(json(picture.bytes),'picture',markerBinding);validateFinalizationApprovalMarker(json(caption.bytes),'caption',markerBinding);
    const binding:FinalizationBinding={sourcePath,sourceSha256:sourceSha,sourceBytes,receiptSha256:receiptSha,receipt,addendumPath,addendumSha256:addendumSha,preLockStateSha256:source.authority.preLockStateSha256,specSha256:specSha,stateSha256:stateSha,scriptSha256:script.sha256,pictureMarkerSha256:picture.sha256,captionMarkerSha256:caption.sha256,captionContractSha256,selection};
    if(selection.version===2){const authorityPaths=[SPEC,STATE,addendumPath,canonicalScript,state.picture_lock.final_qc_marker,selection.captions.approval_marker];const mix=bindFinalizationMix(root,selection,captionContractSha256,caption.sha256,authorityPaths);for(const [name,value] of Object.entries(mix.fingerprints))report.fingerprints[name]=value;binding.mixPayloadSha256=mix.payloadSha256;binding.mixApprovalMarkerSha256=mix.markerSha256;binding.mixRightsEvidence=mix.rightsEvidence;binding.mixAuthorityPaths=authorityPaths;}
    report.binding=binding;report.composition={width:receipt.composition.width,height:receipt.composition.height,fps,durationFrames};
    const finalPlan=currentPlanForCanonical(projectId,baseRevision);
    if(sha(JSON.stringify(finalPlan))!==report.scope.snapshotSha256||streamedFileFingerprint(sourcePath,4_000_000_000).sha256!==sourceSha||readBounded(root,SPEC,25_000_000).sha256!==specSha||readBounded(root,STATE,25_000_000).sha256!==stateSha)throw new StoreError('최종화 입력이 확인 중 변경됐습니다.',409);
    report.renderEligible=true;
  }catch(error){block('post-lock-input-blocked',error instanceof Error?error.message:'최종화 입력이 올바르지 않습니다.');}
  return report;
}

export function finalizationFingerprintsStillMatch(report:FinalizationReport):boolean{
  const binding=report.binding;if(!report.renderEligible||!binding||!report.composition)return false;
  try{
    const root=realpathSync(process.cwd());
    const plan=currentPlanForCanonical(report.scope.projectId,report.scope.revision);
    if(sha(JSON.stringify(plan))!==report.scope.snapshotSha256)return false;
    if(streamedFileFingerprint(binding.sourcePath,4_000_000_000).sha256!==binding.sourceSha256)return false;
    if(streamedFileFingerprint(path.join(path.dirname(binding.sourcePath),'provisional-voiced-episode.json'),5_000_000).sha256!==binding.receiptSha256)return false;
    if(binding.selection.version===2){if(!binding.mixAuthorityPaths?.length)return false;const mix=bindFinalizationMix(root,binding.selection,binding.captionContractSha256,binding.captionMarkerSha256,binding.mixAuthorityPaths);if(mix.payloadSha256!==binding.mixPayloadSha256||mix.markerSha256!==binding.mixApprovalMarkerSha256||JSON.stringify(mix.rightsEvidence)!==JSON.stringify(binding.mixRightsEvidence))return false;}
    for(const [relative,digest] of Object.entries(report.fingerprints))if(!digest||streamedFileFingerprint(safeCanonicalFile(root,relative),binding.selection.version===2&&binding.selection.mix.stems.some(stem=>stem.path===relative)?100_000_000:25_000_000).sha256!==digest)return false;
    return true;
  }catch{return false;}
}
