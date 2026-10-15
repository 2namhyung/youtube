import type {AnalysisProposal,AnalysisRecord} from '../../../visualmaker/core/ai-analysis.ts';
import type {AIAnalysisAdoption,Beat,Candidate,CandidateMode,Plan,Requirement,Scene,SourceReviewDimension} from '../../../visualmaker/core/model.ts';
import {boundedAIJson} from './ai-analysis-client.ts';
import type {AIJob} from './ai-analysis-client.ts';
import {episodePlanHash} from './episode-client.ts';

type Scope={projectId:string;revision:number;scriptSha256:string;token:string};
export type AdoptionRow={record:AnalysisRecord;beat:Beat|null;scene:Scene|null;reason:string|null};
export type AdoptionRequest={projectId:string;baseRevision:number;jobId:string;expectedArtifactSha256:string;
  segmentIds:string[];confirmDirectionReset:true};
const HASH=/^[a-f0-9]{64}$/u,ADOPTION=/^adopt_[a-f0-9-]{36}$/u;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>object(value)&&
  Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** The UI uses the same deliberately narrow singleton mapping as the adoption service. */
export function analysisAdoptionRows(plan:Plan,proposal:AnalysisProposal):AdoptionRow[]{
  return proposal.records.map(record=>{
    const beats=plan.beats.filter(beat=>beat.segmentIds.length===1&&beat.segmentIds[0]===record.segmentId);
    if(beats.length!==1)return {record,beat:null,scene:null,reason:'연결된 전달 목표가 없거나 여러 구간이 합쳐져 있어 반영할 수 없습니다.'};
    const beat=beats[0],owners=plan.scenes.filter(scene=>scene.beatIds.includes(beat.id));
    if(owners.length!==1||owners[0].beatIds.length!==1)return {record,beat,scene:null,reason:'장면 연결이 여러 개이거나 병합되어 있어 반영할 수 없습니다.'};
    const scene=owners[0];
    return {record,beat,scene,reason:scene.locked?'잠긴 장면입니다. 반영하려면 먼저 잠금을 해제해야 합니다.':null};
  });
}

export async function newAIAdoptionRequest(plan:Plan,proposal:AnalysisProposal,job:AIJob,
  selectedIds:readonly string[],acknowledged:boolean):Promise<AdoptionRequest|null>{
  if(!acknowledged||job.status!=='succeeded'||job.stale||!job.artifact||!HASH.test(job.artifact.sha256)||
    proposal.requestId!==job.jobId||proposal.scope.projectId!==plan.id||proposal.scope.revision!==plan.revision||
    proposal.scope.scriptSha256!==plan.script.rawSha256||proposal.scope.snapshotSha256!==job.snapshotSha256||
    proposal.scope.snapshotSha256!==await episodePlanHash(plan)||selectedIds.length<1||selectedIds.length>40||
    new Set(selectedIds).size!==selectedIds.length)return null;
  const chosen=new Set(selectedIds),rows=analysisAdoptionRows(plan,proposal);
  if(rows.filter(row=>chosen.has(row.record.segmentId)).some(row=>row.reason)||
    rows.filter(row=>chosen.has(row.record.segmentId)).length!==chosen.size)return null;
  return {projectId:plan.id,baseRevision:plan.revision,jobId:job.jobId,expectedArtifactSha256:job.artifact.sha256,
    segmentIds:rows.filter(row=>chosen.has(row.record.segmentId)).map(row=>row.record.segmentId),confirmDirectionReset:true};
}

export function createImmediateGate(){
  let active:symbol|null=null;
  return {acquire(){if(active)return null;active=Symbol('studio mutation');return active;},
    release(ticket:symbol){if(active===ticket)active=null;},isActive(){return active!==null;}};
}

/** Exact browser projection of director.makeDraftScene for an adoption revision. Drift fails closed. */
function expectedDraft(scene:Scene,beat:Beat,meaning:string,revision:number):{candidates:Candidate[];requirements:Requirement[]}{
  const mode:CandidateMode=beat.role==='fiction'?'omni':beat.role==='comparison'?'remotion':
    beat.role==='process'?(/걷|달리|쓰|말하|움직|만들|방문|잡|확인|누르|열|엽|닫|이동|촬영|모으|수집|정리/iu.test(meaning)?
      'source-video':'remotion'):beat.role==='action'?'source-video':'source-photo';
  const queryKo=`${meaning.replace(/^\s*(?:\[?[^\]]+\]?\s*[:：-])\s*/u,'').trim()}${mode==='source-video'?' 실제 행동 장면':
    mode==='remotion'?' 조건 비교 자료':mode==='omni'?' 비인물 장면 참고':' 대상과 맥락'}`.slice(0,500);
  const suffix=`-r${revision}`,candidates:Candidate[]=[],requirements:Requirement[]=[];
  for(const number of [1,2]){
    const visual:Requirement={id:`${scene.id}-requirement-${number}-visual${suffix}`,
      description:mode==='source-video'?`내레이션의 실제 행동을 보여 주는 영상: ${meaning}`:
        mode==='omni'?`허구적 연속성을 위한 비인물 장면 재구성의 근거: ${meaning}`:
          `내레이션의 대상과 맥락을 보여 주는 이미지: ${meaning}`,
      mediaType:mode==='source-video'?'video':'image',acquisition:mode==='omni'?'generated-keyframe':'external',
      epistemicRole:mode==='omni'?'illustration':'context',queryKo,queryEn:'',
      sourceConstraint:mode==='omni'?'실명 인물이나 읽을 수 있는 문구를 포함하지 않는 비인물 재구성':
        mode==='source-video'?'설명한 행동·대상·장소가 실제로 확인되는 원본':'설명한 대상과 맥락이 확인되는 원본',assetId:null};
    const required=[visual];
    if(mode==='remotion')required.push({id:`${scene.id}-requirement-${number}-evidence${suffix}`,
      description:`내레이션의 정확한 조건·관계를 확인할 공식 자료: ${meaning}`,mediaType:'data',
      acquisition:'official',epistemicRole:'evidence',queryKo,queryEn:'',
      sourceConstraint:'수치·기간·법률 조건은 원문과 대조 가능한 공식 출처가 필요하며 화면 밖에서 확인함',assetId:null});
    requirements.push(...required);
    const labels=mode==='source-video'?['행동 원본','행동 맥락']:mode==='remotion'?['조건 도식','조건 흐름']:
      mode==='omni'?['연속성 장면','비인물 비유']:['대상 원본','맥락 원본'];
    candidates.push({id:`${scene.id}-candidate-${number}${suffix}`,label:labels[number-1],mode,
      reason:number===1?`핵심 의미를 ${mode==='remotion'?'정확한 관계와 조건':'관찰 가능한 화면'}으로 전달한다.`:
        `같은 의미를 ${mode==='remotion'?'다른 읽기 순서':'다른 시점'}로 보여 주어 비교할 수 있다.`,
      rejectedModes:mode==='omni'?['source-photo: 실명 인물·실제 사건의 대체가 될 수 없음',
        'source-video: 허구적 연속성을 보장하지 않음','remotion: 장면의 허구적 관계를 직접 보여주지 않음']:
        ['omni: 명시적 허구 연속성 표지가 없음'],
      startState:number===1?`화면에 ${meaning}의 대상이 나타나지 않은 상태`:
        `핵심 대상만 먼저 보이고 관계는 아직 닫힌 상태: ${meaning}`,
      change:mode==='remotion'?(number===1?'관련 조건과 관계를 순서대로 드러낸다.':'관계의 결과를 먼저 보여 준 뒤 근거 조건을 연결한다.'):
        mode==='source-video'?(number===1?'설명한 행동이 실제로 시작된다.':'행동의 결과와 주변 맥락을 이어 보여 준다.'):
          mode==='omni'?(number===1?'비인물 장면의 핵심 관계가 이어진다.':'비인물 장면의 원인과 결과를 순차적으로 연결한다.'):
            (number===1?'설명한 대상과 맥락을 함께 드러낸다.':'대상을 먼저 고정한 뒤 맥락을 덧붙인다.'),
      endState:number===1?'내레이션의 핵심 의미가 읽히고 다음 장면으로 넘길 수 있는 상태':
        '핵심 관계를 확인한 뒤 다음 설명으로 넘어갈 수 있는 상태',
      requirementIds:required.map(item=>item.id),layers:[{id:`${scene.id}-candidate-${number}-focal${suffix}`,
        role:'focal',description:visual.description,requirementId:visual.id}],
      effort:mode==='omni'||mode==='remotion'?'high':mode==='source-video'?'medium':'low',
      effortBasis:mode==='source-video'?'행동이 맞는 원본을 찾고 구간을 확인해야 함':
        mode==='remotion'?'공식 자료의 조건을 대조하고 설명 화면을 구성해야 함':
          mode==='omni'?'근거에 맞는 비인물 재구성과 의미 검토가 필요함':'대상을 확인할 원본과 이용 조건을 검토해야 함',
      reuseFromSceneId:null,reuseReason:'',provider:'local-rules',grammarStatus:'unverified'});
  }
  return {candidates,requirements};
}

async function reviewContext(plan:Plan,requirement:Requirement):Promise<string>{
  const sharing=plan.scenes.filter(scene=>scene.candidates.some(candidate=>candidate.requirementIds.includes(requirement.id)));
  const meaning=sharing.map(scene=>({sceneId:scene.id,
    narration:scene.beatIds.flatMap(beatId=>plan.beats.find(beat=>beat.id===beatId)?.segmentIds??[])
      .map(segmentId=>plan.script.segments.find(segment=>segment.id===segmentId)?.text??''),
    beats:scene.beatIds.map(beatId=>{const beat=plan.beats.find(item=>item.id===beatId);
      return beat?{id:beat.id,intent:beat.intent,role:beat.role}:null;}),
    selectedCandidateId:scene.selectedCandidateId,
    candidates:scene.candidates.filter(candidate=>candidate.requirementIds.includes(requirement.id)).map(candidate=>({
      id:candidate.id,mode:candidate.mode,label:candidate.label,reason:candidate.reason,
      startState:candidate.startState,change:candidate.change,endState:candidate.endState,
      layers:candidate.layers.filter(layer=>layer.requirementId===requirement.id).map(layer=>({
        role:layer.role,description:layer.description}))}))}));
  const value={requirement:{id:requirement.id,description:requirement.description,mediaType:requirement.mediaType,
    acquisition:requirement.acquisition,epistemicRole:requirement.epistemicRole,sourceConstraint:requirement.sourceConstraint},meaning};
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function submitAIAdoption(request:AdoptionRequest,token:string,signal:AbortSignal,
  fetcher:typeof fetch=fetch):Promise<unknown>{
  const response=await fetcher('/api/studio/ai-analysis-adoption',{method:'POST',headers:{'x-visualmaker-token':token,
    'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store',signal});
  const value=await boundedAIJson(response,16_000_000,signal);
  if(!response.ok)throw new Error(response.status===409?'계획 리비전이나 AI 제안이 바뀌었습니다.':
    response.status===423?'선택한 장면이 잠겨 있습니다.':'선택한 AI 제안을 저장하지 못했습니다.');
  if(response.status!==200)throw new Error('AI 제안 반영 응답이 올바르지 않습니다.');
  return value;
}

/** Verify the exact reviewed data and the allowed Plan delta before parent state changes. */
export async function currentAIAdoptionResponse(value:unknown,prior:Plan,job:AIJob,proposal:AnalysisProposal,
  request:AdoptionRequest,started:Scope,current:Scope):Promise<{plan:Plan;adoption:AIAnalysisAdoption}|null>{
  if(!same(started,current)||started.projectId!==prior.id||started.revision!==prior.revision||
    started.scriptSha256!==prior.script.rawSha256||!exact(value,['plan','adoption'])||
    !object(value.plan)||!object(value.adoption)||request.projectId!==prior.id||request.baseRevision!==prior.revision||
    request.jobId!==job.jobId||request.expectedArtifactSha256!==job.artifact?.sha256||request.confirmDirectionReset!==true||
    proposal.scope.snapshotSha256!==await episodePlanHash(prior))return null;
  const payload=value as {plan:Plan;adoption:AIAnalysisAdoption};
  const next=payload.plan,receipt=payload.adoption;
  if(!exact(receipt,['schemaVersion','id','createdAt','jobId','artifactSha256','scope','model','beforeRevision','afterRevision',
    'scriptSha256','productionAuthority','requiresHumanReview','records'])||
    receipt.schemaVersion!=='visualmaker-ai-analysis-adoption-v1'||!ADOPTION.test(receipt.id)||
    typeof receipt.createdAt!=='string'||Number.isNaN(Date.parse(receipt.createdAt))||
    receipt.jobId!==job.jobId||receipt.artifactSha256!==request.expectedArtifactSha256||
    !same(receipt.scope,proposal.scope)||!same(receipt.model,proposal.model)||
    receipt.beforeRevision!==prior.revision||receipt.afterRevision!==prior.revision+1||
    receipt.scriptSha256!==prior.script.rawSha256||receipt.productionAuthority!==false||
    receipt.requiresHumanReview!==true||!Array.isArray(receipt.records)||
    receipt.records.length!==request.segmentIds.length||
    new TextEncoder().encode(JSON.stringify(receipt)).byteLength>200_000||
    !same(next.aiAnalysisAdoption,receipt))return null;
  const rows=analysisAdoptionRows(prior,proposal),selected=request.segmentIds.map(id=>rows.find(row=>row.record.segmentId===id));
  if(selected.some(row=>!row||row.reason||!row.beat||!row.scene)||
    !same(rows.filter(row=>request.segmentIds.includes(row.record.segmentId)).map(row=>row.record.segmentId),request.segmentIds))return null;
  for(let i=0;i<selected.length;i++){
    const row=selected[i]!,record=receipt.records[i];
    if(!exact(record,['segmentId','beatId','sceneId','source','mainMessage','uncertainty','visualMeaningBrief',
      'searchBriefKo','searchBriefEn','beforeIntent','appliedIntent'])||
      record.segmentId!==row.record.segmentId||record.beatId!==row.beat?.id||record.sceneId!==row.scene?.id||
      !same(record.source,row.record.source)||record.mainMessage!==row.record.mainMessage||
      record.uncertainty!==row.record.uncertainty||record.visualMeaningBrief!==row.record.visualMeaningBrief||
      record.searchBriefKo!==row.record.searchBriefKo||record.searchBriefEn!==row.record.searchBriefEn||
      record.beforeIntent!==row.beat?.intent||record.appliedIntent!==row.record.mainMessage)return null;
  }
  const oldKeys=Object.keys(prior).filter(key=>key!=='aiAnalysisAdoption');
  if(!exact(next,[...oldKeys,'aiAnalysisAdoption'])||next.id!==prior.id||next.revision!==prior.revision+1||
    next.productionAuthority!==false||next.schemaVersion!==prior.schemaVersion||
    typeof next.updatedAt!=='string'||Number.isNaN(Date.parse(next.updatedAt))||
    ['title','createdAt','script','assets','narrationTakes','narrationTimings','decisions','origin'].some(key=>
      !same((next as unknown as Record<string,unknown>)[key],(prior as unknown as Record<string,unknown>)[key]))||
    !Array.isArray(next.beats)||next.beats.length!==prior.beats.length||
    !Array.isArray(next.scenes)||next.scenes.length!==prior.scenes.length||
    !Array.isArray(next.requirements)||!Array.isArray(next.sourceReviews??[]))return null;
  const applied=new Map(selected.map(row=>[row!.beat!.id,row!.record.mainMessage]));
  for(let i=0;i<prior.beats.length;i++){
    const before=prior.beats[i],after=next.beats[i],message=applied.get(before.id);
    const expected=message===undefined?before:{...before,intent:message,
      claimReview:before.role==='evidence'||before.role==='comparison'?'pending':before.claimReview};
    if(!same(after,expected))return null;
  }
  const selectedSceneIds=new Set(selected.map(row=>row!.scene!.id));
  const expectedRequirements=new Map<string,Requirement>();
  for(let i=0;i<prior.scenes.length;i++){
    const before=prior.scenes[i],after=next.scenes[i];
    if(!selectedSceneIds.has(before.id)){if(!same(after,before))return null;continue;}
    const row=selected.find(item=>item!.scene!.id===before.id)!;
    if(row.record.mainMessage===row.beat!.intent){if(!same(after,before))return null;continue;}
    const draft=expectedDraft(before,row.beat!,row.record.mainMessage,prior.revision+1);
    draft.requirements.forEach(item=>expectedRequirements.set(item.id,item));
    if(!exact(after,Object.keys(before))||
      ['id','beatIds','originCutIds','locked','estimatedSeconds','timingStatus'].some(key=>
        !same((after as unknown as Record<string,unknown>)[key],(before as unknown as Record<string,unknown>)[key]))||
      after.selectedCandidateId!==null||after.reviewStatus!=='draft'||!same(after.candidates,draft.candidates))return null;
  }
  const oldRequirements=new Map(prior.requirements.map(item=>[item.id,item]));
  if(next.scenes.some(scene=>!object(scene)||!Array.isArray(scene.candidates)||scene.candidates.some(candidate=>
    !object(candidate)||!Array.isArray(candidate.requirementIds)))||next.requirements.some(item=>!object(item)))return null;
  const references=new Set(next.scenes.flatMap(scene=>scene.candidates.flatMap(candidate=>candidate.requirementIds)));
  if(new Set(next.requirements.map(item=>item.id)).size!==next.requirements.length||
    next.requirements.some(item=>!references.has(item.id)||
      (oldRequirements.has(item.id)?!same(item,oldRequirements.get(item.id)):
        !same(item,expectedRequirements.get(item.id))))||
    prior.requirements.some(item=>references.has(item.id)!==next.requirements.some(nextItem=>nextItem.id===item.id)))return null;
  const oldReviews=prior.sourceReviews??[],newReviews=next.sourceReviews??[];
  if(newReviews.length<oldReviews.length||!same(newReviews.slice(0,oldReviews.length),oldReviews))return null;
  const expectedReviews:Array<{requirementId:string;assetId:string;assetSha256:string;contextSha256:string;
    dimension:SourceReviewDimension;rationale:string}>=[];
  for(const requirement of next.requirements){
    if(!requirement.assetId)continue;
    const asset=next.assets.find(item=>item.id===requirement.assetId);if(!asset)return null;
    const previous=prior.requirements.find(item=>item.id===requirement.id);
    const currentContext=await reviewContext(next,requirement);
    if(previous?.assetId===requirement.assetId&&await reviewContext(prior,previous)===currentContext)continue;
    for(const dimension of ['source','rights','semantic'] as const)expectedReviews.push({requirementId:requirement.id,
      assetId:asset.id,assetSha256:asset.sha256,contextSha256:currentContext,dimension,
      rationale:previous?.assetId!==requirement.assetId?'자료 배정이 변경되어 다시 검토해야 합니다.':
        '장면 또는 자료 요구의 의미가 변경되어 다시 검토해야 합니다.'});
  }
  const appended=newReviews.slice(oldReviews.length);
  if(appended.length!==expectedReviews.length)return null;
  const allIds=new Set(oldReviews.map(review=>review.id));
  for(let i=0;i<appended.length;i++){
    const review=appended[i],expected=expectedReviews[i];
    if(!exact(review,['id','requirementId','assetId','assetSha256','contextSha256','dimension','decision',
      'rationale','recordedAt','recordedBy','productionAuthority'])||
      typeof review.id!=='string'||!/^review_[a-f0-9-]{36}$/u.test(review.id)||allIds.has(review.id)||
      typeof review.recordedAt!=='string'||Number.isNaN(Date.parse(review.recordedAt))||
      review.productionAuthority!==false||review.decision!=='pending'||review.recordedBy!=='local-session'||
      ['requirementId','assetId','assetSha256','contextSha256','dimension','rationale'].some(key=>
        (review as unknown as Record<string,unknown>)[key]!==expected[key as keyof typeof expected]))return null;
    allIds.add(review.id);
  }
  return {plan:next,adoption:receipt};
}
