import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlan, validatePlan} from './director.ts';
import type {Plan, Candidate, Requirement} from './model.ts';
import {buildAdoptionReview, EPISODE_SPEC_PATH, PRODUCTION_STATE_PATH} from './adoption-review.ts';

const SPEC = EPISODE_SPEC_PATH;
type Brief = {brief_id:string;subject:string;action:string;role:string;specificity:string;queries_ko?:string[];queries_en?:string[];media_types?:string[];exclusions?:string[];viewpoint?:string;place_context?:string};
type Cut = {shot_id:string;draft_narration:string;production_mode:Candidate['mode'];estimated_voice_seconds:number;visual_purpose:string;viewer_takeaway:string;production_decision:{reason:string;observable_action:string;visible_subject:string;rejected_modes:Record<string,string>;asset_search_briefs:Brief[];reuse_reason:string|null}};

export function importEpisode(): Plan {
  const bytes = readFileSync(SPEC);
  const spec = JSON.parse(bytes.toString('utf8')) as {title:string;cuts:Cut[]};
  const plan = createPlan(`EP001 · ${spec.title}`, spec.cuts.map(c=>c.draft_narration).join('\n\n'));
  if (plan.scenes.length !== spec.cuts.length) throw new Error('대본 구간과 현재 컷 수가 다릅니다. 자동 배정하지 않습니다.');
  plan.requirements = [];
  plan.origin = {kind:'episode-spec',path:SPEC,sha256:createHash('sha256').update(bytes).digest('hex')};
  spec.cuts.forEach((cut,index) => {
    const scene = plan.scenes[index];
    scene.originCutIds = [cut.shot_id];
    const beat = plan.beats.find(b=>b.id===scene.beatIds[0])!;
    const d = cut.production_decision;
    beat.intent = cut.visual_purpose;
    beat.role = cut.production_mode === 'omni' ? 'fiction' : cut.production_mode === 'remotion' ? 'comparison' : 'action';
    beat.claimReview = 'pending';
    const requirements: Requirement[] = d.asset_search_briefs.map(brief=>({
      id:`req_${cut.shot_id}_${brief.brief_id}`, description:[brief.subject,brief.action,brief.viewpoint].filter(Boolean).join(' · '),
      mediaType:brief.role === 'off-canvas-evidence' ? 'data' : brief.media_types?.includes('video') && cut.production_mode === 'source-video' ? 'video' : 'image',
      acquisition:brief.specificity === 'generic-object' ? 'external' : 'official',
      epistemicRole:brief.role === 'off-canvas-evidence' ? 'evidence' : 'context',
      queryKo:(brief.queries_ko || []).join(' / '),queryEn:(brief.queries_en || []).join(' / '),
      sourceConstraint:[brief.place_context,...(brief.exclusions || [])].filter(Boolean).join(' · ') || '원본·대상·행동·권리 검토 필요', assetId:null,
    }));
    if (cut.production_mode === 'omni') requirements.push({id:`req_${cut.shot_id}_keyframe`,description:`가상 사례 PNG 키프레임: ${d.visible_subject}`,mediaType:'image',acquisition:'generated-keyframe',epistemicRole:'illustration',queryKo:'',queryEn:'',sourceConstraint:'가상 연속성·텍스트 없는 키프레임·별도 AI 고지. 현재 모든 컷 PASS 전 Omni 영상 금지.',assetId:null});
    const focal = requirements.find(r=>r.epistemicRole!=='evidence');
    if (!focal) throw new Error(`${cut.shot_id} 화면용 자료 요구가 없습니다.`);
    plan.requirements.push(...requirements);
    scene.candidates = [0,1].map(variant=>({
      id:`candidate_${cut.shot_id}_${variant}`,label:`${cut.shot_id} · ${variant ? '같은 의미, 핵심부터 순차 설명' : '현재 명세의 표현'}`,
      mode:cut.production_mode,reason:variant ? `${d.reason} 핵심 대상부터 보여주고 보조 설명을 순서대로 연결하는 검토용 대안.` : d.reason,
      rejectedModes:Object.entries(d.rejected_modes).map(([mode,reason])=>`${mode}: ${reason}`),
      startState:variant ? `${d.visible_subject} 중 핵심 대상을 먼저 보여준다.` : d.visible_subject,
      change:d.observable_action,
      endState:`${cut.viewer_takeaway} — 핵심 상태를 읽는 시간을 확보한다.`,
      requirementIds:requirements.map(r=>r.id),
      layers:[{id:`layer_${cut.shot_id}_${variant}_focal`,role:'focal',description:d.visible_subject,requirementId:focal.id},
        ...(cut.production_mode==='omni' ? [{id:`layer_${cut.shot_id}_${variant}_chrome`,role:'chrome' as const,description:'래스터 밖 가상 사례 · AI 재구성 고지',requirementId:null}] : [])],
      effort:variant?'low':'medium',effortBasis:'필요한 원본 수는 유지하고 한 화면에서 동시에 처리하는 요소를 줄이는 방향. 구현 시간은 미측정.',
      reuseFromSceneId:null,reuseReason:'',provider:'episode-import',grammarStatus:'unverified',
    }));
    scene.estimatedSeconds = cut.estimated_voice_seconds;
    scene.selectedCandidateId = null;
  });
  return validatePlan(plan);
}

export function handoff(plan: Plan) {
  const bound = plan.origin?.kind === 'episode-spec' && plan.origin.path === SPEC;
  const readOptional = (path: string) => { try { return readFileSync(path); } catch { return null; } };
  const specBytes = readOptional(SPEC);
  const stateBytes = readOptional(PRODUCTION_STATE_PATH);
  const adoptionReview = buildAdoptionReview(plan,specBytes,stateBytes);
  const currentHash = adoptionReview.target.spec.sha256;
  return {
    schemaVersion:'visualmaker-editorial-handoff-v1',status:'proposal-only',productionAuthority:false,renderEligible:false,appliesChanges:false,
    projectId:plan.id,revision:plan.revision,origin:plan.origin || null,
    originUnchanged:bound ? (currentHash !== null && plan.origin?.sha256 === currentHash) : null,
    target:bound ? SPEC : null,manualAdoptionRequired:true,
    nextAction:bound ? '사용자가 장면 방향을 검토한 뒤 episode-spec.json에 의미·대본·자료 요구를 반영하고 정식 생성기를 실행한다. 이 파일은 active-cut-manifest가 아니다.' : '먼저 대상 에피소드를 정하고 장면별 매핑을 검토한다. 이 계획은 기존 EP001을 수정할 권한이 없다.',
    script:plan.script,scenes:plan.scenes,beats:plan.beats,requirements:plan.requirements,assets:plan.assets,
    sourceReviews:plan.sourceReviews ?? [],
    adoptionReview,
    blockers:['source/rights review','reference grammar applicability','style-frame review','all-cut review'],
  };
}
