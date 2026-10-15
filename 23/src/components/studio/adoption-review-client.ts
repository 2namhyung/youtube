import type {buildAdoptionReview} from '../../../visualmaker/core/adoption-review';

export type AdoptionReport = ReturnType<typeof buildAdoptionReview>;
export type ReviewViewState =
  | {status:'closed'; key:null; report:null; error:null}
  | {status:'loading'; key:string; report:null; error:null}
  | {status:'ready'; key:string; report:AdoptionReport; error:null}
  | {status:'error'; key:string; report:null; error:string};

const object = (value:unknown):value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value:unknown):value is string => typeof value === 'string';
const strings = (value:unknown):value is string[] => Array.isArray(value) && value.every(string);
const sha = (value:unknown):value is string => string(value) && /^[a-f0-9]{64}$/.test(value);
const safeText = (value:unknown):value is string|null => value === null || string(value);
const falseFlag = (value:Record<string,unknown>) => value.productionAuthority === false;
const oneOf = (value:unknown, choices:readonly string[]) => string(value) && choices.includes(value);
const candidateModes = ['source-photo','source-video','remotion','omni'] as const;
const specPath = 'video/episodes/episode-001/episode-spec.json';
const statePath = 'video/episodes/episode-001/production-state.json';

function validReview(value:unknown):boolean {
  return object(value) && falseFlag(value) && string(value.id) && string(value.requirementId) && string(value.assetId) &&
    sha(value.assetSha256) && sha(value.contextSha256) && ['source','rights','semantic'].includes(String(value.dimension)) &&
    ['pending','acceptable','rejected'].includes(String(value.decision)) && string(value.rationale) && string(value.recordedAt) && value.recordedBy === 'local-session';
}

function validRequirement(value:unknown):boolean {
  if (!object(value) || !falseFlag(value) || value.observationsOnly !== true || !string(value.requirementId) || !safeText(value.description)) return false;
  if (value.asset !== null && (!object(value.asset) || !string(value.asset.id) || !string(value.asset.path) ||
    !sha(value.asset.sha256) || !string(value.asset.sourceUrl) || !string(value.asset.creator) ||
    !string(value.asset.rightsNote) || !string(value.asset.semanticNote) || value.asset.status !== 'pending-review' ||
    typeof value.asset.evidenceOnly !== 'boolean')) return false;
  if (value.sourceReviewState === null) return true;
  const state = value.sourceReviewState;
  if (!object(state) || !falseFlag(state) || state.requirementId !== value.requirementId ||
    state.assetId !== (object(value.asset) ? value.asset.id : null) ||
    !sha(state.contextSha256) || !object(state.current) || !Array.isArray(state.history) || !state.history.every(validReview)) return false;
  const current=state.current;
  return ['source','rights','semantic'].every(dimension => current[dimension] === null ||
    (validReview(current[dimension]) && object(current[dimension]) && current[dimension].requirementId === value.requirementId &&
      current[dimension].assetId === state.assetId && current[dimension].contextSha256 === state.contextSha256 &&
      object(value.asset) && current[dimension].assetSha256 === value.asset.sha256));
}

function validRow(value:unknown):boolean {
  if (!object(value) || !falseFlag(value) || !string(value.sceneId) || !Number.isInteger(value.proposedOrder) ||
    !strings(value.originCutIds) || !Array.isArray(value.originalOrder) ||
    !value.originalOrder.every((item:unknown) => item === null || (Number.isInteger(item) && Number(item) >= 1)) ||
    !oneOf(value.structuralReview,['unbound','merge-proposal','single-cut-comparison']) ||
    !oneOf(value.originBinding,['current','stale','unsupported']) || typeof value.lockedPlanningOnly !== 'boolean' ||
    !safeText(value.selectedCandidateId) || !['selected','unselected'].includes(String(value.direction)) ||
    !Array.isArray(value.selectedRequirements) ||
    !Array.isArray(value.alternatives) || !value.alternatives.every((item:unknown) => object(item) &&
      string(item.id) && string(item.label) && oneOf(item.mode,candidateModes) && string(item.reason)) ||
    !Array.isArray(value.before) || !value.before.every((item:unknown) => object(item) &&
      string(item.shotId) && string(item.narration) && string(item.purpose) && string(item.mode) &&
      string(item.observableAction) && string(item.takeaway))) return false;
  if (!object(value.after) || !string(value.after.narration) || !strings(value.after.purpose) || !strings(value.after.beatRoles) ||
    !(value.after.mode === null || oneOf(value.after.mode,candidateModes)) || !safeText(value.after.observableAction) ||
    !safeText(value.after.candidateEndState) || !safeText(value.after.startState)) return false;
  if (!object(value.comparisons)) return false;
  const comparisons=value.comparisons;
  if (!oneOf(comparisons.narration,['unbound','same','proposed-change']) ||
    !oneOf(comparisons.purpose,['unbound','same','proposed-change']) ||
    !oneOf(comparisons.mode,['unbound','same','proposed-change','direction-unselected']) ||
    !oneOf(comparisons.observableAction,['unbound','same','proposed-change','direction-unselected']) ||
    !oneOf(comparisons.takeaway,['unbound','not-compared-distinct-meaning','direction-unselected'])) return false;
  const selected=value.direction === 'selected';
  const after=value.after;
  if (selected ? (!string(value.selectedCandidateId) || !value.selectedCandidateId ||
    !oneOf(after.mode,candidateModes) || !string(after.startState) ||
    !string(after.observableAction) || !string(after.candidateEndState)) :
    (value.selectedCandidateId !== null || after.mode !== null || after.startState !== null ||
      after.observableAction !== null || after.candidateEndState !== null || value.selectedRequirements.length !== 0)) return false;
  if (value.alternatives.some((item:unknown) => object(item) && item.id === value.selectedCandidateId)) return false;
  return object(value.timing) && typeof value.timing.planningEstimatedSeconds === 'number' &&
    Number.isFinite(value.timing.planningEstimatedSeconds) && value.timing.productionTiming === 'not-compared-no-frame-conversion' &&
    Array.isArray(value.selectedRequirements) && value.selectedRequirements.every(validRequirement);
}

function validTarget(value:unknown):boolean {
  return object(value) && string(value.path) &&
    ((value.status === 'available' && sha(value.sha256) && value.reason === null) ||
      (value.status === 'invalid' && sha(value.sha256) && string(value.reason) && value.reason.length > 0) ||
      (value.status === 'unavailable' && value.sha256 === null && string(value.reason) && value.reason.length > 0));
}

export function parseAdoptionHandoff(value:unknown, projectId:string, revision:number):AdoptionReport {
  if (!object(value) || value.schemaVersion !== 'visualmaker-editorial-handoff-v1' || value.status !== 'proposal-only' ||
    !falseFlag(value) || value.renderEligible !== false || value.appliesChanges !== false ||
    value.manualAdoptionRequired !== true || value.projectId !== projectId || value.revision !== revision ||
    !object(value.adoptionReview)) throw new Error('전달안 응답이 현재 프로젝트·리비전 또는 검토 규격과 맞지 않습니다.');
  const report = value.adoptionReview;
  if (!object(report.target) || !object(report.target.spec) || !object(report.target.state))
    throw new Error('제작 변경안의 대상 파일 정보가 불완전합니다.');
  const specTarget=report.target.spec;
  const stateTarget=report.target.state;
  if (report.schemaVersion !== 'visualmaker-adoption-review-v1' || report.status !== 'blocked-proposal' ||
    !falseFlag(report) || report.renderEligible !== false || report.appliesChanges !== false || report.manualAdoptionRequired !== true ||
    !object(report.plan) || report.plan.projectId !== projectId || report.plan.revision !== revision || !sha(report.plan.sha256) ||
    (report.plan.origin !== null && (!object(report.plan.origin) || report.plan.origin.kind !== 'episode-spec' ||
      !string(report.plan.origin.path) || !sha(report.plan.origin.sha256))) ||
    !validTarget(specTarget) || specTarget.path !== specPath ||
    !validTarget(stateTarget) || stateTarget.path !== statePath ||
    typeof report.originMatch !== 'boolean' ||
    (report.originMatch && (!object(report.plan.origin) || report.plan.origin.path !== specTarget.path ||
      report.plan.origin.sha256 !== specTarget.sha256 || specTarget.status !== 'available')) ||
    (stateTarget.status === 'available' ? report.currentState === null : report.currentState !== null) ||
    (specTarget.status === 'available' ? report.currentCutCount === null : report.currentCutCount !== null) ||
    (report.currentState !== null && (!object(report.currentState) || !string(report.currentState.stage) ||
      !Number.isInteger(report.currentState.expectedCutCount) || !safeText(report.currentState.activeCutRoot) ||
      !safeText(report.currentState.renderAuthorityStatus) ||
      (report.currentState.declaredProductionAuthority !== null && typeof report.currentState.declaredProductionAuthority !== 'boolean') ||
      !string(report.currentState.note))) ||
    (report.currentCutCount !== null && (!Number.isInteger(report.currentCutCount) || Number(report.currentCutCount) < 1)) ||
    !Array.isArray(report.scenes) || report.scenes.length === 0 || !report.scenes.every(validRow) || !strings(report.unmappedCurrentCuts) ||
    !Array.isArray(report.mappingConflicts) || !report.mappingConflicts.every((item:unknown) => object(item) &&
      string(item.kind) && string(item.sceneId) && safeText(item.cutId) && string(item.detail)) ||
    !strings(report.editorialBlockers) || !strings(report.productionBlockers) || report.productionBlockers.length === 0 ||
    !strings(report.manualSteps) ||
    report.rendererStatus !== 'not-implemented') throw new Error('제작 변경안 응답이 불완전하거나 예상한 규격이 아닙니다.');
  const bound=object(report.plan.origin) && report.plan.origin.path === specPath;
  const expectedBinding=bound ? (report.originMatch ? 'current' : 'stale') : 'unsupported';
  if (report.scenes.some((scene:unknown,index:number) => {
    if (!object(scene)) return true;
    const cutIds=scene.originCutIds as string[];
    const originalOrder=scene.originalOrder as Array<number|null>;
    const before=scene.before as Array<{shotId:string}>;
    const expectedStructure=!bound || cutIds.length===0 ? 'unbound' : cutIds.length>1 ? 'merge-proposal' : 'single-cut-comparison';
    const expectedBefore=cutIds.filter((_,i) => originalOrder[i] !== null);
    const actualBefore=before.map(item=>item.shotId);
    const comparisons=scene.comparisons as Record<string,string>;
    const unboundComparisons=['narration','purpose','mode','observableAction','takeaway'].every(key=>comparisons[key]==='unbound');
    const isUnselected=scene.direction === 'unselected';
    const selectedComparisons=isUnselected
      ? comparisons.mode === 'direction-unselected' && comparisons.observableAction === 'direction-unselected' && comparisons.takeaway === 'direction-unselected'
      : ['same','proposed-change'].includes(comparisons.mode) && ['same','proposed-change'].includes(comparisons.observableAction) && comparisons.takeaway === 'not-compared-distinct-meaning';
    return scene.proposedOrder !== index+1 || scene.originBinding !== expectedBinding ||
      scene.structuralReview !== expectedStructure || originalOrder.length !== cutIds.length ||
      actualBefore.length !== expectedBefore.length || actualBefore.some((id,i)=>id!==expectedBefore[i]) ||
      (!bound && originalOrder.some(order=>order!==null)) ||
      (bound ? !selectedComparisons : !unboundComparisons);
  })) throw new Error('제작 변경안의 장면 결속 상태가 원본과 맞지 않습니다.');
  return report as AdoptionReport;
}

export class AdoptionReviewController {
  private sequence = 0;
  private abort:AbortController|null = null;
  private readonly request:(projectId:string,signal:AbortSignal)=>Promise<unknown>;
  private listener:((state:ReviewViewState)=>void)|null;
  private state:ReviewViewState = {status:'closed',key:null,report:null,error:null};

  constructor(request:(projectId:string,signal:AbortSignal)=>Promise<unknown>, listener:(state:ReviewViewState)=>void) {
    this.request = request;
    this.listener = listener;
  }
  get snapshot(){return this.state;}
  subscribe(listener:(state:ReviewViewState)=>void){this.listener=listener;listener(this.state);}
  private emit(state:ReviewViewState){this.state=state;this.listener?.(state);}
  close(){this.sequence++;this.abort?.abort();this.abort=null;this.emit({status:'closed',key:null,report:null,error:null});}
  contextChanged(projectId:string,revision:number){
    if (this.state.key !== null && this.state.key !== `${projectId}:${revision}`) this.close();
  }
  dispose(){this.sequence++;this.abort?.abort();this.abort=null;this.listener=null;this.state={status:'closed',key:null,report:null,error:null};}
  async open(projectId:string,revision:number){
    this.sequence++;this.abort?.abort();
    const requestId=this.sequence;
    const key=`${projectId}:${revision}`;
    this.abort=new AbortController();
    this.emit({status:'loading',key,report:null,error:null});
    try {
      const payload=await this.request(projectId,this.abort.signal);
      const report=parseAdoptionHandoff(payload,projectId,revision);
      if (requestId===this.sequence) this.emit({status:'ready',key,report,error:null});
    } catch (error) {
      if (requestId===this.sequence) this.emit({status:'error',key,report:null,error:error instanceof Error?error.message:'제작 변경안을 읽지 못했습니다.'});
    }
  }
}
