import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {closeSync, fstatSync, openSync, readFileSync, readSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {validatePlan} from './director.ts';
import {reviewStates, REVIEW_DIMENSIONS} from './source-review.ts';
import {assetFile, dataRoot, StoreError} from './store.ts';
import type {Asset, CandidateMode, Plan, Requirement, SourceReviewDecision, SourceReviewDimension} from './model.ts';

export const PREVIEW_READINESS_SCHEMA='visualmaker-preview-readiness-v1' as const;
export type BlockerCode='direction-not-selected'|'requirement-unassigned'|'evidence-only-visual'|'media-type-mismatch'|
  'invalid-image-dimensions'|'invalid-video-dimensions'|'invalid-video-duration'|'asset-file-missing'|
  'asset-path-invalid'|'asset-too-large'|'asset-hash-mismatch'|'asset-receipt-invalid'|
  'source-observation-missing'|'source-observation-pending'|'source-observation-rejected'|
  'rights-observation-missing'|'rights-observation-pending'|'rights-observation-rejected'|
  'semantic-observation-missing'|'semantic-observation-pending'|'semantic-observation-rejected'|
  'grammar-unverified'|'renderer-not-implemented'|'production-contract-not-bound';
export type PreviewBlocker={code:BlockerCode;message:string;requirementId?:string};
export type PreviewRequirement={requirementId:string;description:string;mediaType:Requirement['mediaType'];epistemicRole:Requirement['epistemicRole'];
  visibleInput:boolean;assetId:string|null;assetSha256:string|null;localIntegrity:'unassigned'|'verified'|'invalid';
  observations:Record<SourceReviewDimension,SourceReviewDecision|'missing'>;productionAuthority:false};
export type PreviewScene={sceneId:string;originCutIds:string[];selectedCandidateId:string|null;mode:CandidateMode|null;
  estimatedSeconds:number;timingStatus:'estimated';requirements:PreviewRequirement[];blockers:PreviewBlocker[];
  selectedAssignedOriginalSha256Count:number;verifiedLocalOriginalSha256Count:number;productionAuthority:false;
  renderEligible:false;previewExists:false;eligibleForCutReview:false};
export type PreviewReadinessReport={schemaVersion:typeof PREVIEW_READINESS_SCHEMA;projectId:string;revision:number;scriptSha256:string;snapshotSha256:string;
  productionAuthority:false;renderEligible:false;previewExists:false;eligibleForCutReview:false;
  renderer:{status:'not-implemented'};selectedAssignedOriginalSha256Count:number;verifiedLocalOriginalSha256Count:number;scenes:PreviewScene[]};

const MAX_ASSET_BYTES=40*1024*1024;
const HASH_BUFFER=Buffer.allocUnsafe(64*1024);
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const messages:Record<BlockerCode,string>={
  'direction-not-selected':'표현 방향을 선택하세요.',
  'requirement-unassigned':'필요한 원본 자료를 배정하세요.',
  'evidence-only-visual':'화면 밖 근거 전용 자료는 보이는 화면 입력으로 사용할 수 없습니다.',
  'media-type-mismatch':'자료의 매체 종류가 요구와 다릅니다.',
  'invalid-image-dimensions':'이미지의 유효한 가로·세로 크기가 필요합니다.',
  'invalid-video-dimensions':'영상의 유효한 가로·세로 크기가 필요합니다.',
  'invalid-video-duration':'영상의 측정된 양수 재생 시간이 필요합니다.',
  'asset-file-missing':'등록된 로컬 원본 파일을 찾을 수 없습니다.',
  'asset-path-invalid':'등록된 로컬 원본 경로가 허용 범위를 벗어났습니다.',
  'asset-too-large':'원본 파일이 검사 가능한 크기를 넘었습니다.',
  'asset-hash-mismatch':'로컬 원본 바이트가 등록된 SHA-256과 다릅니다.',
  'asset-receipt-invalid':'원본 검증 기록이 없거나 현재 자료와 다릅니다.',
  'source-observation-missing':'출처 관찰 기록이 없습니다.', 'source-observation-pending':'출처 관찰이 대기 중입니다.', 'source-observation-rejected':'출처 관찰이 부적합으로 기록됐습니다.',
  'rights-observation-missing':'사용 조건 관찰 기록이 없습니다.', 'rights-observation-pending':'사용 조건 관찰이 대기 중입니다.', 'rights-observation-rejected':'사용 조건 관찰이 부적합으로 기록됐습니다.',
  'semantic-observation-missing':'의미 대응 관찰 기록이 없습니다.', 'semantic-observation-pending':'의미 대응 관찰이 대기 중입니다.', 'semantic-observation-rejected':'의미 대응 관찰이 부적합으로 기록됐습니다.',
  'grammar-unverified':'선택한 방향의 화면 문법과 실제 동작이 검증되지 않았습니다.',
  'renderer-not-implemented':'컷을 재생할 렌더러가 구현되지 않았습니다.',
  'production-contract-not-bound':'제작 명세와 활성 컷 계약에 결속되지 않았습니다.',
};
const blocker=(code:BlockerCode,requirementId?:string):PreviewBlocker=>({code,message:messages[code],...(requirementId?{requirementId}:{})});

/** Read only: unlike getProject(), this deliberately does not fail the entire report on a damaged optional asset/take. */
export function readPreviewPlan(id:string,baseRevision:number):Plan {
  if(!id || !/^plan-[a-f0-9-]{36}$/.test(id))throw new StoreError('프로젝트 ID가 올바르지 않습니다.');
  if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new StoreError('리비전은 0 이상의 정수여야 합니다.');
  let db:DatabaseSync;
  try{db=new DatabaseSync(path.join(dataRoot(),'studio.sqlite'),{readOnly:true});}
  catch{throw new StoreError('작업 저장소를 읽을 수 없습니다.',503);}
  try{
    const row=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(id) as {revision:number;document:string}|undefined;
    if(!row)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(row.revision!==baseRevision)throw new StoreError('최신 프로젝트 리비전을 불러온 뒤 다시 확인하세요.',409);
    let document:unknown;
    try{document=JSON.parse(row.document);}catch{throw new StoreError('저장된 계획 문서를 읽을 수 없습니다.',409);}
    const plan=validatePlan(document);
    if(plan.id!==id||plan.revision!==row.revision||plan.productionAuthority!==false)throw new StoreError('저장된 프로젝트의 결속이 올바르지 않습니다.',409);
    return plan;
  }finally{db.close();}
}

function localIntegrity(asset:Asset):BlockerCode|null {
  let file:string;
  try{file=assetFile(asset.path);}
  catch(error){return error && typeof error==='object' && 'code' in error && error.code==='ENOENT'?'asset-file-missing':'asset-path-invalid';}
  let fd:number|undefined;
  try{
    fd=openSync(file,'r');
    const stats=fstatSync(fd);
    if(!stats.isFile())return 'asset-path-invalid';
    if(stats.size>MAX_ASSET_BYTES)return 'asset-too-large';
    const hash=createHash('sha256');let total=0;
    for(;;){const count=readSync(fd,HASH_BUFFER,0,HASH_BUFFER.length,null);if(count===0)break;total+=count;
      if(total>MAX_ASSET_BYTES)return 'asset-too-large';hash.update(HASH_BUFFER.subarray(0,count));}
    if(hash.digest('hex')!==asset.sha256)return 'asset-hash-mismatch';
  }catch{return 'asset-file-missing';}
  finally{if(fd!==undefined)closeSync(fd);}
  if(!/^asset_[a-f0-9-]{36}$/.test(asset.id))return 'asset-receipt-invalid';
  try{
    const root=realpathSync(dataRoot());
    const receiptPath=realpathSync(path.join(root,'receipts',`${asset.id}.json`));
    if(!receiptPath.startsWith(root+path.sep))return 'asset-receipt-invalid';
    if(statSync(receiptPath).size>100_000)return 'asset-receipt-invalid';
    const receipt=JSON.parse(readFileSync(receiptPath,'utf8')) as Record<string,unknown>;
    if(Object.keys(asset).some(key=>JSON.stringify(asset[key as keyof Asset])!==JSON.stringify(receipt[key])))return 'asset-receipt-invalid';
  }catch{return 'asset-receipt-invalid';}
  return null;
}

export function buildPreviewReadiness(input:Plan,verifyAsset:(asset:Asset)=>BlockerCode|null=localIntegrity):PreviewReadinessReport {
  const plan=input;
  const states=new Map(reviewStates(plan).map(state=>[state.requirementId,state]));
  const requirements=new Map(plan.requirements.map(req=>[req.id,req]));
  const assets=new Map(plan.assets.map(asset=>[asset.id,asset]));
  const allAssigned=new Set<string>();const allVerified=new Set<string>();
  const scenes:PreviewScene[]=plan.scenes.map(scene=>{
    const selected=scene.candidates.find(candidate=>candidate.id===scene.selectedCandidateId);
    const blockers:PreviewBlocker[]=[];
    const assigned=new Set<string>();const verified=new Set<string>();
    if(!selected)blockers.push(blocker('direction-not-selected'));
    const rows:PreviewRequirement[]=(selected?.requirementIds??[]).map(requirementId=>{
      const requirement=requirements.get(requirementId);
      if(!requirement)throw new StoreError('선택한 방향의 자료 요구가 올바르지 않습니다.',409);
      const asset=requirement.assetId?assets.get(requirement.assetId):undefined;
      const visibleInput=requirement.mediaType!=='data'&&requirement.epistemicRole!=='evidence';
      const state=states.get(requirement.id);
      const observations=Object.fromEntries(REVIEW_DIMENSIONS.map(dimension=>[dimension,state?.current[dimension]?.decision??'missing'])) as PreviewRequirement['observations'];
      let integrity:PreviewRequirement['localIntegrity']='unassigned';
      if(!asset)blockers.push(blocker('requirement-unassigned',requirement.id));
      else{
        assigned.add(asset.sha256);allAssigned.add(asset.sha256);
        if(asset.mediaType!==requirement.mediaType)blockers.push(blocker('media-type-mismatch',requirement.id));
        if(visibleInput&&asset.evidenceOnly)blockers.push(blocker('evidence-only-visual',requirement.id));
        if(requirement.mediaType==='image'&&visibleInput&&(!Number.isFinite(asset.width)||Number(asset.width)<=0||!Number.isFinite(asset.height)||Number(asset.height)<=0))blockers.push(blocker('invalid-image-dimensions',requirement.id));
        if(requirement.mediaType==='video'){
          if(visibleInput&&(!Number.isFinite(asset.width)||Number(asset.width)<=0||!Number.isFinite(asset.height)||Number(asset.height)<=0))blockers.push(blocker('invalid-video-dimensions',requirement.id));
          if(!Number.isFinite(asset.durationSeconds)||Number(asset.durationSeconds)<=0)blockers.push(blocker('invalid-video-duration',requirement.id));
        }
        const failure=verifyAsset(asset);
        if(failure){integrity='invalid';blockers.push(blocker(failure,requirement.id));}
        else{integrity='verified';verified.add(asset.sha256);allVerified.add(asset.sha256);}
      }
      for(const dimension of REVIEW_DIMENSIONS){const decision=observations[dimension];if(decision!=='acceptable')blockers.push(blocker(`${dimension}-observation-${decision}` as BlockerCode,requirement.id));}
      return {requirementId:requirement.id,description:requirement.description,mediaType:requirement.mediaType,epistemicRole:requirement.epistemicRole,
        visibleInput,assetId:asset?.id??null,assetSha256:asset?.sha256??null,localIntegrity:integrity,observations,productionAuthority:false};
    });
    if(selected&&(selected.mode==='remotion'||selected.mode==='omni')&&selected.grammarStatus==='unverified')blockers.push(blocker('grammar-unverified'));
    blockers.push(blocker('renderer-not-implemented'),blocker('production-contract-not-bound'));
    return {sceneId:scene.id,originCutIds:[...(scene.originCutIds??[])],selectedCandidateId:selected?.id??null,mode:selected?.mode??null,
      estimatedSeconds:scene.estimatedSeconds,timingStatus:'estimated',requirements:rows,blockers,
      selectedAssignedOriginalSha256Count:assigned.size,verifiedLocalOriginalSha256Count:verified.size,
      productionAuthority:false,renderEligible:false,previewExists:false,eligibleForCutReview:false};
  });
  return {schemaVersion:PREVIEW_READINESS_SCHEMA,projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,
    snapshotSha256:sha(JSON.stringify(plan)),productionAuthority:false,renderEligible:false,previewExists:false,eligibleForCutReview:false,
    renderer:{status:'not-implemented'},selectedAssignedOriginalSha256Count:allAssigned.size,verifiedLocalOriginalSha256Count:allVerified.size,scenes};
}
