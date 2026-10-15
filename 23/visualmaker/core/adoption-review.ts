import {createHash} from 'node:crypto';
import type {Plan, Scene, Candidate, Requirement} from './model.ts';
import {reviewStates} from './source-review.ts';

export const EPISODE_SPEC_PATH = 'video/episodes/episode-001/episode-spec.json';
export const PRODUCTION_STATE_PATH = 'video/episodes/episode-001/production-state.json';

type CurrentCut = {shot_id:string;draft_narration:string;visual_purpose:string;production_mode:string;
  viewer_takeaway:string;production_decision:{observable_action:string}};
type CurrentSpec = {schema_version:1;episode_id:string;cuts:CurrentCut[]};
type CurrentState = {schema_version:2;episode_id:string;stage:string;expected_cut_count:number;active_cut_root:string|null;
  render_authority:{status:string;production_authority:boolean}};

const sha = (value: Buffer|string) => createHash('sha256').update(value).digest('hex');
const plain = (value: unknown): value is Record<string,unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parseTarget<T>(bytes: Buffer|null, path: string, valid: (value: unknown) => value is T) {
  const hash = bytes ? sha(bytes) : null;
  if (!bytes) return {binding:{path,sha256:null,status:'unavailable' as const,reason:'file-unavailable'},value:null};
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (valid(parsed)) return {binding:{path,sha256:hash,status:'available' as const,reason:null},value:parsed};
    return {binding:{path,sha256:hash,status:'invalid' as const,reason:'unsupported-or-invalid-target-contract'},value:null};
  } catch { return {binding:{path,sha256:hash,status:'invalid' as const,reason:'malformed-json'},value:null}; }
}

function validSpec(value: unknown): value is CurrentSpec {
  if (!plain(value) || value.schema_version !== 1 || value.episode_id !== 'episode-001' || !Array.isArray(value.cuts)) return false;
  const ids = new Set<string>();
  return value.cuts.length > 0 && value.cuts.every((item: unknown) => {
    if (!plain(item) || !nonempty(item.shot_id) || ids.has(item.shot_id) ||
      typeof item.draft_narration !== 'string' || !nonempty(item.visual_purpose) ||
      !nonempty(item.production_mode) || !nonempty(item.viewer_takeaway) ||
      !plain(item.production_decision) || !nonempty(item.production_decision.observable_action)) return false;
    ids.add(item.shot_id); return true;
  });
}

function validState(value: unknown): value is CurrentState {
  return plain(value) && value.schema_version === 2 && value.episode_id === 'episode-001' && nonempty(value.stage) &&
    Number.isInteger(value.expected_cut_count) && (value.expected_cut_count as number) >= 0 &&
    (value.active_cut_root === null || nonempty(value.active_cut_root)) &&
    plain(value.render_authority) && nonempty(value.render_authority.status) &&
    typeof value.render_authority.production_authority === 'boolean';
}

function sceneNarration(plan: Plan, scene: Scene): string {
  const seen = new Set<string>();
  return scene.beatIds.flatMap(beatId => plan.beats.find(beat => beat.id === beatId)?.segmentIds ?? [])
    .filter(segmentId => {if (seen.has(segmentId)) return false; seen.add(segmentId); return true;})
    .map(segmentId => plan.script.segments.find(segment => segment.id === segmentId))
    .filter(segment => segment?.kind === 'narration')
    .map(segment => segment!.text).join('\n');
}

function selectedRequirements(plan: Plan, candidate: Candidate|null) {
  if (!candidate) return [];
  const states = new Map(reviewStates(plan).map(state => [state.requirementId,state]));
  return candidate.requirementIds.map(id => {
    const requirement: Requirement|undefined = plan.requirements.find(item => item.id === id);
    const asset = plan.assets.find(item => item.id === requirement?.assetId);
    return {requirementId:id,description:requirement?.description ?? null,asset:asset ? {
      id:asset.id,path:asset.path,sha256:asset.sha256,sourceUrl:asset.sourceUrl,creator:asset.creator,
      rightsNote:asset.rightsNote,semanticNote:asset.semanticNote,status:asset.status,evidenceOnly:asset.evidenceOnly,
    } : null,sourceReviewState:states.get(id) ?? null,observationsOnly:true,productionAuthority:false};
  });
}

export function buildAdoptionReview(plan: Plan, specBytes: Buffer|null, stateBytes: Buffer|null) {
  const specTarget = parseTarget(specBytes,EPISODE_SPEC_PATH,validSpec);
  const stateTarget = parseTarget(stateBytes,PRODUCTION_STATE_PATH,validState);
  const spec = specTarget.value;
  const state = stateTarget.value;
  const bound = plan.origin?.kind === 'episode-spec' && plan.origin.path === EPISODE_SPEC_PATH;
  const originMatch = bound && spec ? plan.origin!.sha256 === specTarget.binding.sha256 : false;
  const cutById = new Map((spec?.cuts ?? []).map((cut,index) => [cut.shot_id,{cut,index}]));
  const used = new Map<string,string[]>();
  const conflicts: Array<{kind:string;sceneId:string;cutId:string|null;detail:string}> = [];
  const rows = plan.scenes.map((scene,proposedIndex) => {
    const originCutIds = scene.originCutIds ?? [];
    const seenHere = new Set<string>();
    for (const cutId of originCutIds) {
      if (!bound) continue;
      if (seenHere.has(cutId)) conflicts.push({kind:'duplicate-in-scene',sceneId:scene.id,cutId,detail:'한 장면에서 같은 컷 ID가 반복됨'});
      seenHere.add(cutId);
      if (!cutById.has(cutId)) conflicts.push({kind:'unknown-cut',sceneId:scene.id,cutId,detail:'현재 명세에 컷 ID가 없음'});
      const scenes = used.get(cutId) ?? []; scenes.push(scene.id); used.set(cutId,scenes);
    }
    const originalCuts = bound ? originCutIds.flatMap(id => cutById.get(id)?.cut ?? []) : [];
    const selected = scene.candidates.find(candidate => candidate.id === scene.selectedCandidateId) ?? null;
    const beats = scene.beatIds.map(id => plan.beats.find(beat => beat.id === id)).filter(beat => beat !== undefined);
    const before = originalCuts.map(cut => ({shotId:cut.shot_id,narration:cut.draft_narration,purpose:cut.visual_purpose,
      mode:cut.production_mode,observableAction:cut.production_decision.observable_action,takeaway:cut.viewer_takeaway}));
    const after = {narration:sceneNarration(plan,scene),purpose:beats.map(beat => beat.intent),beatRoles:beats.map(beat => beat.role),
      mode:selected?.mode ?? null,observableAction:selected?.change ?? null,
      candidateEndState:selected?.endState ?? null,startState:selected?.startState ?? null};
    const structuralReview = !bound || originCutIds.length === 0 ? 'unbound' : originCutIds.length > 1 ? 'merge-proposal' : 'single-cut-comparison';
    return {sceneId:scene.id,proposedOrder:proposedIndex+1,originCutIds,
      originalOrder:originCutIds.map(id => bound && cutById.has(id) ? cutById.get(id)!.index+1 : null),structuralReview,
      originBinding:bound ? (originMatch ? 'current' : 'stale') : 'unsupported',
      lockedPlanningOnly:scene.locked,selectedCandidateId:selected?.id ?? null,
      direction:selected ? 'selected' : 'unselected',
      alternatives:scene.candidates.filter(candidate => candidate.id !== selected?.id).map(candidate => ({
        id:candidate.id,label:candidate.label,mode:candidate.mode,reason:candidate.reason,
      })),before,after,
      comparisons:{narration:!bound ? 'unbound' : before.map(item => item.narration).join('\n') === after.narration ? 'same' : 'proposed-change',
        purpose:!bound ? 'unbound' : before.map(item => item.purpose).join('\n') === after.purpose.join('\n') ? 'same' : 'proposed-change',
        mode:!bound ? 'unbound' : selected ? (before.length===1 && before[0].mode===selected.mode ? 'same' : 'proposed-change') : 'direction-unselected',
        observableAction:!bound ? 'unbound' : selected ? (before.length===1 && before[0].observableAction===selected.change ? 'same' : 'proposed-change') : 'direction-unselected',
        takeaway:!bound ? 'unbound' : selected ? 'not-compared-distinct-meaning' : 'direction-unselected'},
      timing:{planningEstimatedSeconds:scene.estimatedSeconds,productionTiming:'not-compared-no-frame-conversion'},
      selectedRequirements:selectedRequirements(plan,selected),productionAuthority:false};
  });
  for (const [cutId,scenes] of used) if (scenes.length > 1) conflicts.push({kind:'cut-used-by-multiple-scenes',sceneId:scenes.join(','),cutId,detail:'같은 현재 컷을 여러 계획 장면이 사용함'});
  const mappedInOrder = rows.flatMap(row => row.originalOrder.filter((order):order is number => order !== null));
  if (mappedInOrder.some((order,index) => index > 0 && order < mappedInOrder[index-1]))
    conflicts.push({kind:'reordered-cuts',sceneId:'',cutId:null,detail:'원래 컷 순서와 계획 장면 순서가 다름. 수동 구조 검토 필요'});
  const unmappedCurrentCuts = (spec?.cuts ?? []).filter(cut => !used.has(cut.shot_id)).map(cut => cut.shot_id);
  const editorialBlockers = [
    ...(!bound ? ['계획이 고정 EP001 명세에 결속되지 않음'] : []),
    ...(bound && !originMatch ? ['가져온 명세 SHA-256이 현재 바이트와 다름'] : []),
    ...(rows.some(row => row.direction === 'unselected') ? ['선택되지 않은 장면 방향 존재'] : []),
    ...(rows.some(row => row.structuralReview !== 'single-cut-comparison') ? ['합치기 또는 매핑 없는 장면은 수동 구조 검토 필요'] : []),
    ...(unmappedCurrentCuts.length ? ['현재 명세에서 매핑되지 않은 컷 존재: 삭제 제안이 아님'] : []),
    ...(conflicts.length ? ['컷 매핑 충돌 또는 순서 변경 존재'] : []),
  ];
  const productionBlockers = [
    ...(spec ? [] : ['현재 EP001 명세를 읽거나 해석할 수 없음']),
    ...(state ? [] : ['현재 EP001 제작 상태를 읽거나 해석할 수 없음']),
    '계획 관찰은 자료·권리·문법·스타일·컷 승인 아님',
    '정식 제작 규격 생성·검증 및 각 단계의 별도 사람 검토 필요',
  ];
  return {schemaVersion:'visualmaker-adoption-review-v1',status:'blocked-proposal',productionAuthority:false,
    manualAdoptionRequired:true,renderEligible:false,appliesChanges:false,
    target:{spec:specTarget.binding,state:stateTarget.binding},originMatch,
    plan:{projectId:plan.id,revision:plan.revision,sha256:sha(JSON.stringify(plan)),origin:plan.origin ?? null},
    currentState:state ? {stage:state.stage,expectedCutCount:state.expected_cut_count,
      activeCutRoot:state.active_cut_root,renderAuthorityStatus:state.render_authority?.status ?? null,
      declaredProductionAuthority:state.render_authority?.production_authority ?? null,
      note:'현재 state 파일의 선언 요약이며 validator PASS가 아님'} : null,
    currentCutCount:spec?.cuts.length ?? null,scenes:rows,unmappedCurrentCuts,mappingConflicts:conflicts,
    editorialBlockers,productionBlockers,
    manualSteps:['사용자가 장면별 editorial diff와 구조 변경을 검토',
      '사람이 단일 권위 episode-spec.json을 직접 수정',
      '정식 생성기와 단계 validator 실행',
      '자료 승인·materialization·reference/grammar·style frame·playable parity·모든 컷 PASS를 각각 검토'],
    rendererStatus:'not-implemented',
  };
}
