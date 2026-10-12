throw new Error('Retired editorial rebuilder: edit episode-spec.json and run pnpm run video:generate-plans. Historical source retained for deletion review; no files were changed.');

import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const scriptPath = path.join(root, 'wiki', 'syntheses', 'episode-001-live-action-script-draft-v1.md');
const candidatePath = path.join(root, 'video', 'source-intake', 'episode-001', 'hanbang-live-action-v01', 'candidate-review.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const asProjectPath = (value) => path.relative(root, value).replaceAll('\\', '/');

function approvedNarration(markdown) {
  const section = markdown.match(/## 1\. 훅[^\n]*\n([\s\S]*?)(?=## 실사 중심 화면 수급 계획)/u)?.[1];
  if (!section) throw new Error('approved narration sections 1-8 not found');
  const normalized = section.split(/\r?\n/u).filter((line) => !/^##\s/u.test(line)).join(' ')
    .replace(/\*\*/gu, '').replace(/\s*\[근거[^\]]+\]/gu, '').replace(/\s+/gu, ' ').trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (sentences.length !== 79 || normalized.replace(/\s/gu, '').length !== 2761) throw new Error('approved narration changed');
  return {normalized, sentences};
}

// [mode, candidate IDs, visual treatment, official evidence sources, graphics justification].
// Candidate IDs are review-only bindings and never confer rights or production authority.
const rows = [
  ['source-video', [], '공식 취재 현장과 공공기관 업무 화면 후보를 빠르게 교차 편집해 논쟁의 현재성을 연다.'],
  ['source-video', [], '일상 공간에서 반복되는 뉴스 노출을 보여 줄 한국 맥락의 실사 후보를 찾는다.'],
  ['source-video', [403], '서류를 검토하는 손의 실제 영상을 유지하며 상반된 설명 때문에 생긴 혼동을 전달한다.'],
  ['omni', [], '동일한 가상 인물·노트북·생활 공간을 유지한 첫 키프레임으로 가상 사례 진입을 명시한다.'],
  ['omni', [], '같은 가상 인물이 중고 노트북 대금을 보내는 행동을 연속 키프레임으로 계획한다.'],
  ['omni', [], '같은 택배 상자를 열어 다른 물건을 발견하고 연락이 차단되는 가상 연속 장면을 계획한다.'],
  ['omni', [], '같은 가상 피해자가 상자·결제 기록·메시지를 챙겨 경찰에 신고하고 빠진 계좌·CCTV 항목을 확인하는 연속 장면을 계획한다.'],
  ['remotion', [], '직접 확인 경로와 구체적 보완수사요구 경로를 래스터 없는 두 경로로 비교한다.', ['LAW-196', 'LAW-1972'], '두 법적 경로의 관계를 정확히 비교해야 한다.'],
  ['source-video', [403], '실제 서류 검토 영상 위에서 보완수사와 송치의 정의를 짧은 native cue로 구분한다.'],
  ['source-photo', [357, 393], '한국 경찰청과 사건 서류의 실제 사진을 순차적으로 보여 주며 기관과 기록의 위치를 구분한다.'],
  ['remotion', [], '공식 원문은 화면 밖 근거로 결속하고 제196조 문구와 삭제 문장을 native vector text로 대조한다.', ['LAW-196', 'LAW-REVISION-21857'], '정확한 조문 전사와 삭제 관계가 필요하다.'],
  ['source-video', [403], '서류 검토 실사를 유지하면서 삭제 문장만으로 전체 역할 상실을 단정할 수 없다는 경계를 설명한다.'],
  ['remotion', [], '새 제195조 제2항의 남는 직무를 래스터 없는 native vector text와 단순 경로로 제시한다.', ['LAW-195', 'LAW-REVISION-21857'], '남는 법적 직무의 정확한 전사와 관계가 필요하다.'],
  ['omni', [], '앞선 가상 사건의 동일 인물·상자·기록을 유지하며 빠진 계좌·시간대 CCTV가 발견되는 키프레임을 계획한다.'],
  ['omni', [], '동일한 가상 사건에서 직접 수사가 아닌 요구 경로로 넘어가는 상태를 텍스트 없는 키프레임으로 계획한다.'],
  ['source-video', [403], '요구서 작성 맥락의 실제 손·서류 영상 위에 확인 대상·이유만 native cue로 올린다.', ['LAW-1972']],
  ['source-video', [403], '실제 서류 작성 영상을 유지하며 요구서가 구체적이어야 한다는 점을 강조한다.', ['LAW-1972']],
  ['source-video', [403], '서류를 작성하고 검토하는 실제 동작으로 이유와 내용의 구체성을 전달한다.', ['LAW-1972']],
  ['omni', [], '동일한 가상 사건의 다른 계좌·택배 접수 장소 CCTV·동봉 자료를 한 연속 장면의 독립 소품으로 계획한다.', ['LAW-1972']],
  ['source-video', [403], '문서 처리 실사 위에 요구와 결과가 기록으로 남는다는 추적 맥락을 보여 준다.', ['LAW-1972']],
  ['source-video', [403], '서류 검토 실사를 유지하고 한 달이라는 정확한 기준은 native text로만 제시한다.', ['LAW-1972']],
  ['source-video', [403], '계속되는 서류 처리 화면으로 한 달이 전체 사건 종결 기간이 아님을 설명한다.', ['LAW-1972']],
  ['source-video', [403], '요구서 처리 실사 위에 기본 기간·별도 기간·연장의 관계를 최소 native cue로 구분한다.', ['LAW-1972']],
  ['source-video', [403], '사건별 서류가 다른 실제 맥락을 보여 주며 모든 사건의 일괄 기한이라는 오해를 막는다.', ['LAW-1972']],
  ['source-video', [403], '보완이 어려운 사건 서류를 재검토하는 실제 손 동작으로 다음 경로의 필요성을 연다.'],
  ['source-photo', [357], '한국 경찰청 건물 실제 사진을 사용하고 상급 관서·다른 수사기관 지정 조건은 native cue로 설명한다.', ['LAW-1972']],
  ['source-video', [403], '서류가 자동 이동하는 연출 없이 조건 검토가 먼저라는 점을 실제 문서 화면으로 유지한다.', ['LAW-1972']],
  ['omni', [], '동일한 가상 사건의 계좌·CCTV 확인이 어려워진 상태를 연속 키프레임으로 되짚는다.'],
  ['omni', [], '같은 가상 사건을 실제 수행 가능한 다른 수사기관 경로로 넘기는 상태를 연속 키프레임으로 계획한다.'],
  ['remotion', [], '보완수사요구와 불송치 이의신청을 서로 다른 시작점의 래스터 없는 경로로 비교한다.', ['LAW-1972', 'LAW-2457'], '이름이 비슷한 두 절차의 출발점을 분리해야 한다.'],
  ['source-photo', [405, 406, 393], '휴대전화와 서류 사진을 일반적인 통지·이의 제기 맥락으로만 사용한다.', ['LAW-2457']],
  ['source-video', [403], '서류 검토 실사를 유지하며 재수사요구가 별도 절차라는 점을 native cue로 구분한다.', ['LAW-2458']],
  ['source-video', [403], '의견을 듣고 자료를 받는 일반적인 서류 업무를 실제 손 동작으로 보여 준다.', ['LAW-24513']],
  ['source-video', [403], '서류 검토 실사 위에서 사실 확인 자료와 재판 증거를 동일시하지 않도록 짧은 경계선을 표시한다.', ['LAW-24513']],
  ['source-video', [403], '같은 서류 화면을 유지하며 확인 권한과 증거 사용 권한의 차이를 설명한다.', ['LAW-24513']],
  ['source-video', [403], '공식 원문은 화면 밖 근거로 결속하고 시행일은 래스터 없는 native text로만 제시한다.', ['LAW-TRANS']],
  ['source-video', [403], '문서 처리 실사로 공포와 실제 절차 변경 사이의 시간차를 전달하고 달력 후보는 쓰지 않는다.', ['LAW-TRANS']],
  ['source-video', [403], '서류 묶음을 검토하는 실제 영상으로 조항별 시행일과 기존 사건 적용례를 따로 본다.', ['LAW-TRANS']],
  ['source-video', [403], '기존 사건 서류 실사 위에 제한 조건과 최대 90일을 native text로만 제시한다.', ['LAW-TRANS-APPLICATION']],
  ['source-video', [403], '문서 실사를 유지하며 모든 사건의 일반 연장이 아닌 조건부 경과조치임을 설명한다.', ['LAW-TRANS-APPLICATION']],
  ['omni', [], '동일한 가상 사건의 경찰 수사 기록이 검사에게 넘어가는 상태로 돌아오는 키프레임을 계획한다.'],
  ['omni', [], '같은 가상 사건에서 다른 계좌와 CCTV 확인이 빠진 상태를 연속 키프레임으로 다시 세운다.'],
  ['remotion', [], '직접 수사 경로는 닫고 빠진 항목과 이유를 특정한 보완수사요구 경로만 연결한다.', ['LAW-196', 'LAW-1972'], '개정 전후 법적 경로의 차이를 정확히 보여 줘야 한다.'],
  ['omni', [], '같은 가상 사건에서 수사기관이 계좌·CCTV·배송 기록을 다시 확인하고 결과를 보내는 연속 키프레임을 계획한다.', ['LAW-1972']],
  ['remotion', [], '래스터 없는 기간 계층에서 한 달 원칙 기준을 먼저 고정하고, 별도 기간과 법정 연장 가능성을 서로 다른 조건 분기로 연결한다.', ['LAW-1972'], '한 달 원칙, 검사가 정하는 별도 기간, 법률상 연장 가능성의 우선순위와 조건 관계는 실사만으로 정확히 구분할 수 없다.'],
  ['omni', [], '같은 가상 피해자가 결과를 확인하는 상태로 돌아와 실제 평가 질문으로 연결하는 키프레임을 계획한다.'],
  ['remotion', [], '삭제되는 제196조 직접 경로와 남는 보완수사·재수사 요구 직무를 래스터 없는 최종 비교로 고정한다.', ['LAW-196', 'LAW-195', 'LAW-1972'], '결론의 법적 범위와 반대 경로를 한 화면에서 정확히 구분해야 한다.'],
  ['omni', [], '처음의 동일 택배 상자와 가상 피해자로 돌아와 빠진 확인과 사건 진행 결과를 묻는 마지막 연속 키프레임을 계획한다.'],
];

const ranges = [
  [1,1],[2,2],[3,4],[5,6],[7,7],[8,10],[11,13],[14,15],[16,17],[18,19],[20,21],[22,22],
  [23,23],[24,25],[26,26],[27,27],[28,28],[29,29],[30,31],[32,33],[34,35],[36,37],[38,39],[40,40],
  [41,41],[42,42],[43,44],[45,46],[47,48],[49,49],[50,50],[51,52],[53,53],[54,54],[55,55],
  [56,56],[57,57],[58,58],[59,59],[60,61],[62,62],[63,63],[64,64],[65,65],[66,66],[67,68],[69,72],[73,79],
];

const oldSpec = JSON.parse(await readFile(specPath, 'utf8'));
const script = await readFile(scriptPath, 'utf8');
const candidateBytes = await readFile(candidatePath);
const candidateReview = JSON.parse(candidateBytes);
const candidateReviewHash = sha256(candidateBytes);
const candidateMap = new Map(candidateReview.candidates.map((candidate) => [candidate.id, candidate]));
const {normalized, sentences} = approvedNarration(script);
const scriptHash = sha256(Buffer.from(script, 'utf8'));
const narrationHash = sha256(Buffer.from(normalized.replace(/\s/gu, ''), 'utf8'));
if (scriptHash !== 'cb7818354a74e9d9854528dc7ffdf204d4ee05f72458ecee02698987dfcebdd8') throw new Error(`approved script full SHA changed: ${scriptHash}`);
if (narrationHash !== '755fc7c746066bed53970de877fcacd66c92bacbbb94e9d67d80a0c4ca85f0fe') throw new Error(`approved narration SHA changed: ${narrationHash}`);
if (rows.length !== 48 || ranges.length !== 48) throw new Error('48-cut editorial plan required');

const makeRequirement = (shotId, sourceId, index, extra = {}) => ({
  requirement_id: `${shotId}-${slug(sourceId)}-${index + 1}`,
  kind: 'source-original',
  source_id: sourceId,
  asset_id: `${shotId.toLowerCase()}-${slug(sourceId)}-${index + 1}`,
  approved_media_asset_id: null,
  materialization_record_id: null,
  materialization_record_path: null,
  status: 'blocked',
  blocker: 'candidate_review_rights_approval_and_materialization_pending',
  ...extra,
});

function makeCut(index) {
  const shotId = `SH${String(index + 1).padStart(3, '0')}`;
  const [mode, candidateIds, visualAction, officialIds = [], graphicsWhy = null] = rows[index];
  const [sentenceStart, sentenceEnd] = ranges[index];
  const narration = sentences.slice(sentenceStart - 1, sentenceEnd).join(' ');
  const selected = candidateIds.map((id) => {
    const candidate = candidateMap.get(id);
    if (!candidate) throw new Error(`${shotId}: unknown candidate ${id}`);
    return candidate;
  });
  const candidateRequirements = selected.map((candidate, candidateIndex) => {
    const rangeText = candidate.reason?.match(/(\d+)–(\d+)초/u) ?? candidate.temporal_review_status?.match(/(\d+)–(\d+)s/u);
    const reviewedWindow = candidate.media_type === 'video' && rangeText
      ? {start_seconds:Number(rangeText[1]),end_seconds:Number(rangeText[2])}
      : null;
    return makeRequirement(shotId, `HANBANG-CANDIDATE-${candidate.id}`, candidateIndex, {
    candidate_id: candidate.id,
    candidate_review_path: 'video/source-intake/episode-001/hanbang-live-action-v01/candidate-review.json',
    candidate_review_sha256: candidateReviewHash,
    candidate_source_path: asProjectPath(candidate.path),
    candidate_sha256: candidate.sha256,
    media_type: candidate.media_type,
    review_disposition: candidate.disposition,
    review_temporal_status: candidate.temporal_review_status,
    reviewed_window_seconds: reviewedWindow,
    reviewed_window_use_policy: reviewedWindow ? 'no looping, stretching, or frames outside this reviewed window; use another approved shot for remaining cut time' : 'still candidate; duration does not apply',
    production_use: 'context-only; never evidence or a depiction of the hypothetical crime',
    });
  });
  const isOmni = mode === 'omni';
  const omniRequirements = isOmni ? [0, 1].map((keyframeIndex) => makeRequirement(shotId, `IMAGEGEN-OMNI-${shotId}-KF0${keyframeIndex + 1}`, keyframeIndex, {
    kind: 'imagegen-asset',
    production_use: 'fictional continuity keyframe input only; evidence=false; no Omni video before all-cut PASS',
    blocker: 'continuity_locked_imagegen_png_and_human_keyframe_review_pending',
  })) : [];
  const gapRequirements = selected.length || mode === 'remotion' || isOmni ? [] : [makeRequirement(shotId, `SOURCE-SEARCH-${shotId}`, 0, {
    production_use: 'source-search placeholder only; no visual file selected',
    blocker: 'semantically_matching_source_candidate_not_yet_selected',
  })];
  const officialRequirements = officialIds.map((sourceId, officialIndex) => makeRequirement(shotId, sourceId, candidateRequirements.length + officialIndex, {
    production_use: 'evidence-provenance-only; capture pixels forbidden on production canvas',
    blocker: 'official_source_lock_transcription_review_and_materialization_pending',
  }));
  const requirements = [...candidateRequirements, ...omniRequirements, ...gapRequirements, ...officialRequirements];
  const visualRequirement = candidateRequirements[0] ?? omniRequirements[0] ?? gapRequirements[0] ?? null;
  const detailRequirement = candidateRequirements[1] ?? omniRequirements[1] ?? visualRequirement;
  const prefix = shotId.toLowerCase();
  const mainId = `${prefix}-source-main`;
  const detailId = `${prefix}-source-detail`;
  const labelId = `${prefix}-source-label`;
  const pathId = `${prefix}-procedure-path`;
  const textId = `${prefix}-native-text`;
  const isGraphics = mode === 'remotion';
  const componentA = isGraphics ? pathId : mainId;
  const componentB = isGraphics ? textId : detailId;
  const components = isGraphics ? [
    {component_id:pathId, asset_requirement_id:null, semantic_role:'primary', render_kind:'svg-path', compositing:'procedural-layer', motion_expectation:'procedural', atomicity:'single-editable-object', presentation_slot:'hero', implementation_status:'planned-not-implemented'},
    {component_id:textId, asset_requirement_id:null, semantic_role:'primary', render_kind:'document-highlight', compositing:'raster-free-native-dom-vector', raster_beneath:false, raster_composite:false, text_surface_role:'surface-content', motion_expectation:'procedural', atomicity:'single-editable-object', presentation_slot:'detail', implementation_status:'planned-not-implemented'},
    {component_id:labelId, asset_requirement_id:null, semantic_role:'supporting', render_kind:'svg-path', compositing:'raster-free-native-dom-vector', raster_beneath:false, raster_composite:false, text_surface_role:'asset-label', motion_expectation:'static', atomicity:'single-editable-object', presentation_slot:'source-label-lane', implementation_status:'planned-not-implemented'},
  ] : [
    {component_id:mainId, asset_requirement_id:visualRequirement.requirement_id, semantic_role:'primary', render_kind:'asset', compositing:isOmni?'single-imagegen-keyframe-input':'single-flattened-source-surface', motion_expectation:isOmni?'keyframe-state-only':mode === 'source-video' ? 'source-internal-motion' : 'subtle-reframe', atomicity:'single-editable-object', presentation_slot:'full-frame', implementation_status:'planned-not-implemented',...(isOmni?{asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}: {})},
    {component_id:detailId, asset_requirement_id:detailRequirement.requirement_id, semantic_role:'primary', render_kind:'asset', compositing:isOmni?'single-imagegen-keyframe-input':'source-bound-detail-window', motion_expectation:isOmni?'keyframe-state-only':'subtle-reframe', atomicity:'single-editable-object', presentation_slot:'full-frame-detail', implementation_status:'planned-not-implemented',...(isOmni?{asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}: {})},
    {component_id:labelId, asset_requirement_id:null, semantic_role:'supporting', render_kind:'svg-path', compositing:'raster-free-native-dom-vector', raster_beneath:false, raster_composite:false, text_surface_role:'asset-label', motion_expectation:'static', atomicity:'single-editable-object', presentation_slot:'source-label-lane', implementation_status:'planned-not-implemented'},
    ...candidateRequirements.slice(2).map((requirement, extraIndex) => ({component_id:`${prefix}-source-support-${extraIndex + 1}`,asset_requirement_id:requirement.requirement_id,semantic_role:'supporting',render_kind:'asset',compositing:'single-flattened-source-surface',motion_expectation:requirement.media_type === 'video'?'source-internal-motion':'static',atomicity:'single-editable-object',presentation_slot:`support-shot-${extraIndex + 1}`,implementation_status:'planned-not-implemented'})),
  ];
  const extraComponentIds = components.filter((component) => component.presentation_slot?.startsWith('support-shot-')).map((component) => component.component_id);
  const compact = narration.replace(/\s/gu, '').length;
  const voiceFrames = Math.ceil((compact / 4.965) * 30);
  const duration = Math.max(144, voiceFrames);
  const split = Math.max(72, Math.floor(duration / 2));
  const windows = [[0, split], [split, duration]];
  const purposeA = isGraphics ? 'draw-relationship' : isOmni ? 'establish-fictional-continuity' : 'establish-source-context';
  const purposeB = isGraphics ? 'emphasize-verified-meaning' : isOmni ? 'advance-fictional-continuity' : 'reframe-source-detail';
  const beatMessages = [
    `대사의 전제가 되는 ${isGraphics ? '법적 관계' : isOmni ? '명시된 가상 사건 연속성' : '실사 맥락'}를 먼저 확인한다.`,
    narration,
  ];
  const beats = windows.map(([start, end], beatIndex) => {
    const focal = beatIndex === 0 ? componentA : componentB;
    const supporting = beatIndex === 0 ? componentB : componentA;
    const purpose = beatIndex === 0 ? purposeA : purposeB;
    const actionStart = start;
    const actionEnd = Math.min(end - 60, start + 18);
    const operator = isGraphics
      ? (beatIndex === 0
        ? {operator_id:'svg.stroke-draw@1', required_capability:'relationship-path', action_semantic:'draw-relationship', parameters:{from_progress:0,to_progress:1}}
        : {operator_id:'document.highlight@1', required_capability:'document-emphasis', action_semantic:'emphasize-document', parameters:{from_progress:0,to_progress:1}})
      : (beatIndex === 0
        ? {operator_id:'transform.tween@1', required_capability:'layer-transform', action_semantic:'move-subject', parameters:{from_scale:1.02,to_scale:1,from_x:12,to_x:0}}
        : {operator_id:'mask.inset@1', required_capability:'mask-reveal', action_semantic:'reveal-region', parameters:{from_right_percent:18,to_right_percent:0}});
    return {
      beat_id:`${shotId}-B0${beatIndex + 1}`,
      viewer_takeaway:beatMessages[beatIndex],
      purpose,
      narration_window:{start_frame:start,end_frame_exclusive:end},
      presentation:{layout_template:isGraphics?'process-flow':'experience-hero',focal:{component_id:focal,slot:beatIndex?'detail':'hero'},supporting:[{component_id:supporting},{component_id:labelId},...extraComponentIds.map((component_id) => ({component_id}))],hidden:[]},
      component_visibility:[
        {component_id:focal,states:[{state:beatIndex?'final-summary':'focused',start_frame:start,end_frame_exclusive:end}]},
        {component_id:supporting,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]},
        {component_id:labelId,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]},
        ...extraComponentIds.map((component_id) => ({component_id,states:[{state:'supporting',start_frame:start,end_frame_exclusive:end}]})),
      ],
      planned_operator:{status:'planned-not-implemented',...operator,target_component_id:focal,start_frame:actionStart,end_frame_exclusive:actionEnd,observable_change:`${purpose}: ${beatMessages[beatIndex]}`},
      stable_reading_hold:{start_frame:end - 60,end_frame_exclusive:end,frames:60},
      document_phase:null,
      preview_status:'blocked-assets-pending',
    };
  });
  const sourceIds = requirements.map((requirement) => requirement.source_id);
  return {
    shot_id:shotId,
    production_mode:mode,
    draft_narration:narration,
    visual_purpose:`${narration}의 의미를 ${isGraphics ? '필요한 법적 관계 설명' : isOmni ? '명시된 가상 사건의 연속 키프레임' : '실사 맥락'}으로 전달한다.`,
    visual_action:visualAction,
    source_ids:sourceIds,
    estimated_voice_seconds:[Math.round((compact / 4.965) * 9) / 10, Math.round((compact / 4.965) * 11) / 10],
    pre_roll_frames:0,
    post_hold_frames:duration - voiceFrames,
    transition_overlap_frames:0,
    duration_frames:null,
    master_occupancy_frames:null,
    viewer_takeaway:narration,
    usage_layer:isGraphics?'necessary-explanation':isOmni?'fictional-editorial-reconstruction':'contextual-real-media',
    acquisition:{priority:mode === 'source-photo' ? ['SOURCE-PHOTO-FIRST','SOURCE-VIDEO-SECOND'] : mode === 'remotion' ? ['SOURCE-SEARCH-COMPLETED','JUSTIFIED-REMOTION'] : isOmni ? ['IMAGEGEN-OMNI'] : ['SOURCE-VIDEO-FIRST','SOURCE-PHOTO-SECOND'],candidate_status:selected.length?'selected-candidates-blocked-pending-human-rights-review':mode === 'remotion'?'not-applicable-justified-remotion':isOmni?'planned-keyframe-input-blocked-all-cut-pass':'search-gap-blocked',preserve_full_original:!isOmni},
    candidate_selection:{status:selected.length?'candidate-shortlist-not-approved':mode === 'remotion'?'not-applicable-justified-remotion':isOmni?'not-applicable-fictional-omni-keyframes':'search-required',review_path:'video/source-intake/episode-001/hanbang-live-action-v01/candidate-review.json',review_sha256:candidateReviewHash,candidate_ids:candidateIds,reviewed_windows:candidateRequirements.filter((requirement) => requirement.media_type === 'video').map((requirement) => ({candidate_id:requirement.candidate_id,window_seconds:requirement.reviewed_window_seconds,use_policy:requirement.reviewed_window_use_policy})),rights_approval:false,production_visible:false,semantic_limits:visualAction},
    motion_graphics_justification:graphicsWhy,
    imagegen_assets:omniRequirements.map((requirement, keyframeIndex) => ({asset_id:requirement.asset_id,requirement_id:requirement.requirement_id,status:'planned-not-created',origin:'imagegen-editorial-reconstruction',identity_scope:'fictional-generic',ai_disclosure:true,evidence:false,keyframe_index:keyframeIndex + 1,continuity_group:'ep001-fictional-purchase-delivery-report',semantic_summary:narration,visual_translation:visualAction,prompt_status:'pending-exact-continuity-design-and-human-review',readable_text_names_dates_numbers_logos_ui_watermarks_forbidden:true})),
    designed_assets:[],
    transparent_derivatives:[],
    evidence_originals:officialIds,
    requirements,
    presentation:{focal:componentA,supporting:[componentB,labelId,...extraComponentIds],hidden_until:[],layout_template:isGraphics?'process-flow':'experience-hero'},
    visual_beats:beats,
    document_contract:null,
    raster_free_text_contract:{required:true,capture_pixels_allowed_on_canvas:false,native_dom_or_vector:true,raster_beneath:false,raster_composite:false,evidence_source_ids:officialIds,text_component_ids:isGraphics?[textId]:[]},
    typography_surface_contract_version:2,
    layout_contract_version:2,
    text_surfaces:[{component_id:labelId,role:'asset-label',rotation_degrees:0,placement:'dedicated-lane-below-named-target',asset_gap_px:48,target_centerline_offset_px:0,raster_beneath:false,raster_composite:false},...(isGraphics?[{component_id:textId,role:'surface-content',rotation_degrees:0,placement:'raster-free-native-vector-surface',raster_beneath:false,raster_composite:false,transcription_status:'pending-human-source-lock'}]:[])],
    layout_contract:{version:2,row_asset_min_gap_px:64,row_gap_variance_max_px:64,baseline_group:'primary-source-row',unintended_overlap_allowed:false},
    timing:{provisional_duration_frames:duration,master_occupancy_frames:duration,reading_hold_frames:60},
    transition:{type:'hard-cut',intent:index === 47?'end on the unresolved outcome question':'reference-derived hard cut to the next approved-script thought',next_shot_id:index === 47?null:`SH${String(index + 2).padStart(3,'0')}`,implementation_status:'planned-not-implemented'},
    missing_inputs:isOmni?['continuity-locked Imagegen PNG keyframes','human semantic/visual/decomposition review','full-cut preview and user cut PASS','episode-level all-cut PASS before any Omni video generation']:['human semantic approval of selected candidate or a semantically matching replacement','item-level rights approval','approved media_asset and materialization record','full-cut preview and user cut PASS'],
    fallback:isOmni?{allowed:'revised continuity-locked fictional keyframe input after human review',forbidden:'generic real footage presented as the fictional event, unrelated media, evidentiary claim, webpage pixels, or any pre-all-cut-PASS Omni video'}:{allowed:'another human-reviewed real video/photo candidate with the same semantic role',forbidden:'unrelated media, evidentiary claim, webpage pixels, generic beige board, or unreviewed AI reconstruction'},
    components,
    media_strategy:{priority:mode === 'source-photo'?['source-photo','source-video','remotion']:mode === 'remotion'?['source-video','source-photo','remotion']:isOmni?['omni-keyframe-input']:['source-video','source-photo','remotion'],dominant_surface:isGraphics?'raster-free-native-procedure-surface':isOmni?'full-frame-fictional-keyframe-input':'full-frame-real-source',overlay_policy:'short source label and necessary native explanation only',source_search_status:selected.length?'candidate-shortlist-pending-human-review':isOmni?'not-applicable-fictional-reconstruction':'search-required-and-blocked',fallback_rule:isGraphics?'graphics justified only by the declared legal relationship':isOmni?'remain blocked until continuity keyframes are generated and reviewed; Omni video waits for all-cut PASS':'remain blocked until fitting real media is approved',evidence_substitution_forbidden:true},
    production_authority:false,
  };
}

const cuts = rows.map((_, index) => makeCut(index));
const totalFrames = cuts.reduce((sum, cut) => sum + cut.timing.master_occupancy_frames, 0);
const spec = {
  ...oldSpec,
  status:'approved-script-footage-first-editorial-plan-blocked',
  narration_contract:{...oldSpec.narration_contract,status:'user-approved-editorial-script-provisional-timing',runtime_note:'사용자 승인 대본 sections 1–8을 고정한 footage-first provisional timing. 최종 녹음 뒤 실제 길이를 다시 측정한다.',draft_compact_character_target:{min:2761,max:2761}},
  timing_authority:{...oldSpec.timing_authority,provisional_master_frames:totalFrames,provisional_master_seconds:totalFrames / 30,target_seconds:[480,600]},
  background_contract:{required_per_cut:'approved full-frame source-video/source-photo, continuity-locked fictional Omni keyframe input, or a specifically justified raster-free explanation cut',visual:'real video/photo fills actual context; explicitly fictional continuity uses reviewed text-free keyframe inputs; only short source labels and necessary native explanation are layered',rule:'실사 후보나 가상 연속 키프레임의 권리·의미 검토가 끝나지 않으면 컷을 blocked로 유지한다. 베이지 빈 보드는 사용하지 않는다.'},
  intro_rules:{...oldSpec.intro_rules,omni_allowed:true,text_rule:'실제 맥락은 실사를 우선하고, 명시된 가상 사건은 연속성이 잠긴 Omni keyframe-input으로 계획한다.'},
  production_gates:[
    'candidate selection is review-only until human semantic review, item-level rights approval and materialization are complete',
    'source-video/source-photo must fill the frame; webpage or captured-page pixels are evidence/provenance-only',
    'every cut remains production_authority=false and active_cut_root remains null until the normal review gates pass',
    'fictional continuity cuts may plan imagegen PNG keyframes only; no Omni video may be created until the episode-level marker confirms every cut passed',
  ],
  cuts,
  script_lock:{schema_version:1,status:'user-approved-editorial-script',reviewer:'user',approved_at:'2026-09-09',source_path:'wiki/syntheses/episode-001-live-action-script-draft-v1.md',source_sha256:scriptHash,narration_scope:'sections-1-through-8-only',narration_normalization:'sections 1-8; headings, markdown emphasis, and [근거 ...] markers removed; all whitespace removed; UTF-8 text encoded as-is',narration_sha256:narrationHash,compact_character_count:2761,final_recording_status:'pending',visual_review_status:'pending',production_stage_remains:'timing-draft',note:'Editorial script approval only; no source, cut, motion, generation, or production PASS.'},
  editorial_revision:{schema_version:1,id:'ep001-live-action-footage-first-v1',status:'candidate-plan-blocked',supersedes_visual_plan:'pre-2026-09-09-motion-led-cut-design',superseded_plan_production_authority:false,approved_script_source:'wiki/syntheses/episode-001-live-action-script-draft-v1.md',cut_count:48,source_review:'video/source-intake/episode-001/full-script-usable-v01/coverage-matrix.json',reference_analysis:'video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md',fictional_continuity_correction:{status:'planned-keyframe-input-only',cut_ids:['SH004','SH005','SH006','SH007','SH014','SH015','SH019','SH028','SH029','SH041','SH042','SH044','SH046','SH048'],omni_video_generation:'blocked-until-all-cuts-user-pass'},production_authority:false},
  editorial_visual_policy:{reference_video:'https://www.youtube.com/watch?v=5o8DvcFB65g',reference_analysis:'video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md',candidate_inventory:'video/source-intake/episode-001/hanbang-live-action-v01/candidate-inventory.json',candidate_review:'video/source-intake/episode-001/hanbang-live-action-v01/candidate-review.json',candidate_review_sha256:candidateReviewHash,candidate_inventory_status:'acquired-candidates-pending-human-semantic-rights-review-and-materialization',order:['source-video','source-photo','remotion','omni'],default_surface:'real-photo-or-real-video-fills-most-of-frame; fictional continuity uses reviewed text-free imagegen keyframe inputs',motion_graphics_rule:'only the six cuts whose legal relationship cannot be carried by footage alone',omni_rule:'14 explicitly fictional continuity cuts use omni-keyframe-input; generated Omni video is forbidden until all 48 cuts receive user PASS',source_gap_rule:'missing or rejected source or keyframe keeps cut blocked',mode_transition_status:'coherent candidate-only plan; no active cut or production authority'},
};

await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
const counts = cuts.reduce((result, cut) => ({...result, [cut.production_mode]:(result[cut.production_mode] ?? 0) + 1}), {});
console.log(JSON.stringify({spec:asProjectPath(specPath),script_sha256:scriptHash,narration_sha256:narrationHash,cut_count:cuts.length,provisional_master_frames:totalFrames,provisional_master_seconds:totalFrames / 30,modes:counts},null,2));
