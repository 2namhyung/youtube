import type {Plan} from '../../../visualmaker/core/model';
import type {PreviewReadinessReport} from '../../../visualmaker/core/preview-readiness';

export type PreviewViewState=
  | {status:'idle';key:null;report:null;error:null}
  | {status:'loading';key:string;report:null;error:null}
  | {status:'ready';key:string;report:PreviewReadinessReport;error:null}
  | {status:'error';key:string;report:null;error:string};

const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const falseFlags=(value:Record<string,unknown>)=>value.productionAuthority===false&&value.renderEligible===false&&value.previewExists===false&&value.eligibleForCutReview===false;
const codes=new Set(['direction-not-selected','requirement-unassigned','evidence-only-visual','media-type-mismatch','invalid-image-dimensions',
  'invalid-video-dimensions','invalid-video-duration','asset-file-missing','asset-path-invalid','asset-too-large','asset-hash-mismatch',
  'asset-receipt-invalid','source-observation-missing','source-observation-pending','source-observation-rejected',
  'rights-observation-missing','rights-observation-pending','rights-observation-rejected',
  'semantic-observation-missing','semantic-observation-pending','semantic-observation-rejected',
  'grammar-unverified','renderer-not-implemented','production-contract-not-bound']);
const decisions=new Set(['missing','pending','acceptable','rejected']);
const modes=new Set(['source-photo','source-video','remotion','omni']);
const keyFor=(plan:Plan)=>`${plan.id}:${plan.revision}:${plan.script.rawSha256}`;

async function planHash(plan:Plan){
  const bytes=new TextEncoder().encode(JSON.stringify(plan));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function parsePreviewReadiness(value:unknown,plan:Plan):Promise<PreviewReadinessReport>{
  const reject=():never=>{throw new Error('준비 상태 응답이 현재 프로젝트·대본 또는 검토 규격과 맞지 않습니다.');};
  if(!object(value))throw new Error('준비 상태 응답이 현재 프로젝트·대본 또는 검토 규격과 맞지 않습니다.');
  if(value.schemaVersion!=='visualmaker-preview-readiness-v1'||value.projectId!==plan.id||
    value.revision!==plan.revision||value.scriptSha256!==plan.script.rawSha256||!hash(value.snapshotSha256)||!falseFlags(value)||
    !object(value.renderer)||value.renderer.status!=='not-implemented'||!Array.isArray(value.scenes)||value.scenes.length!==plan.scenes.length||
    !Number.isSafeInteger(value.selectedAssignedOriginalSha256Count)||!Number.isSafeInteger(value.verifiedLocalOriginalSha256Count))reject();
  if(value.snapshotSha256!==await planHash(plan))reject();
  const assigned=new Set<string>();const verified=new Set<string>();
  if(!Array.isArray(value.scenes))throw new Error('준비 상태 장면 목록이 올바르지 않습니다.');
  for(const [index,row] of value.scenes.entries()){
    const scene=plan.scenes[index];const selected=scene.candidates.find(candidate=>candidate.id===scene.selectedCandidateId);
    if(!object(row)||!falseFlags(row)||row.sceneId!==scene.id||row.selectedCandidateId!==(selected?.id??null)||
      row.mode!==(selected?.mode??null)||row.estimatedSeconds!==scene.estimatedSeconds||row.timingStatus!=='estimated'||
      !Array.isArray(row.originCutIds)||JSON.stringify(row.originCutIds)!==JSON.stringify(scene.originCutIds??[])||
      !Array.isArray(row.requirements)||row.requirements.length!==(selected?.requirementIds.length??0)||!Array.isArray(row.blockers)||
      !Number.isSafeInteger(row.selectedAssignedOriginalSha256Count)||!Number.isSafeInteger(row.verifiedLocalOriginalSha256Count))reject();
    const sceneAssigned=new Set<string>();const sceneVerified=new Set<string>();
    for(const [reqIndex,reqRow] of row.requirements.entries()){
      const req=plan.requirements.find(item=>item.id===selected?.requirementIds[reqIndex]);
      const asset=plan.assets.find(item=>item.id===req?.assetId);
      if(!req||!object(reqRow)||reqRow.productionAuthority!==false||reqRow.requirementId!==req.id||reqRow.description!==req.description||
        reqRow.mediaType!==req.mediaType||reqRow.epistemicRole!==req.epistemicRole||reqRow.visibleInput!==(req.mediaType!=='data'&&req.epistemicRole!=='evidence')||
        reqRow.assetId!==(asset?.id??null)||reqRow.assetSha256!==(asset?.sha256??null)||
        !['unassigned','verified','invalid'].includes(String(reqRow.localIntegrity))||!object(reqRow.observations)||
        !['source','rights','semantic'].every(dimension=>decisions.has(String((reqRow.observations as Record<string,unknown>)[dimension]))))reject();
      if(asset){if(reqRow.localIntegrity==='unassigned')reject();sceneAssigned.add(asset.sha256);assigned.add(asset.sha256);if(reqRow.localIntegrity==='verified'){sceneVerified.add(asset.sha256);verified.add(asset.sha256);}}
      else if(reqRow.localIntegrity!=='unassigned')reject();
    }
    if(row.selectedAssignedOriginalSha256Count!==sceneAssigned.size||row.verifiedLocalOriginalSha256Count!==sceneVerified.size)reject();
    if(row.blockers.some((entry:unknown)=>!object(entry)||!codes.has(String(entry.code))||typeof entry.message!=='string'||!entry.message||
      (entry.requirementId!==undefined && (!selected||!selected.requirementIds.includes(String(entry.requirementId))))))reject();
    const rowCodes=new Set(row.blockers.map((entry:{code:string})=>entry.code));
    if(!rowCodes.has('renderer-not-implemented')||!rowCodes.has('production-contract-not-bound')||(!selected&&!rowCodes.has('direction-not-selected'))||
      (!selected&&(row.requirements.length>0||row.mode!==null))||(selected&&!modes.has(String(row.mode))))reject();
  }
  if(value.selectedAssignedOriginalSha256Count!==assigned.size||value.verifiedLocalOriginalSha256Count!==verified.size)reject();
  return value as PreviewReadinessReport;
}

export class PreviewReadinessController{
  private sequence=0;
  private abort:AbortController|null=null;
  private state:PreviewViewState={status:'idle',key:null,report:null,error:null};
  private listener:((view:PreviewViewState)=>void)|null;
  private readonly request:(plan:Plan,signal:AbortSignal)=>Promise<unknown>;
  constructor(request:(plan:Plan,signal:AbortSignal)=>Promise<unknown>,listener:(view:PreviewViewState)=>void){this.request=request;this.listener=listener;}
  get snapshot(){return this.state;}
  subscribe(listener:(view:PreviewViewState)=>void){this.listener=listener;listener(this.state);}
  private emit(state:PreviewViewState){this.state=state;this.listener?.(state);}
  contextChanged(plan:Plan){if(this.state.key!==null&&this.state.key!==keyFor(plan))this.close();}
  close(){this.sequence++;this.abort?.abort();this.abort=null;this.emit({status:'idle',key:null,report:null,error:null});}
  dispose(){this.close();this.listener=null;}
  async open(plan:Plan){
    this.sequence++;this.abort?.abort();const requestId=this.sequence;
    const key=keyFor(plan);const controller=new AbortController();this.abort=controller;
    this.emit({status:'loading',key,report:null,error:null});
    try{const payload=await this.request(plan,controller.signal);const report=await parsePreviewReadiness(payload,plan);
      if(requestId===this.sequence&&!controller.signal.aborted)this.emit({status:'ready',key,report,error:null});
    }catch(error){if(requestId===this.sequence&&!controller.signal.aborted)this.emit({status:'error',key,report:null,error:error instanceof Error?error.message:'준비 상태를 읽지 못했습니다.'});}
  }
}
