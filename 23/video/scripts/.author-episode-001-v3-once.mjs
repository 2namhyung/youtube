import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const scriptPath = path.join(root, 'wiki/syntheses/episode-001-script-refactor-v2.md');
const specPath = path.join(root, 'video/episodes/episode-001/episode-spec.json');
const page = fs.readFileSync(scriptPath, 'utf8');
const rows = JSON.parse(page.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? '[]');
if (rows.length !== 36 || rows.some((row, i) => row.shot_id !== `SH${String(i + 1).padStart(3, '0')}`)) throw new Error('expected 36 ordered editorial cuts');
const old = JSON.parse(fs.readFileSync(specPath, 'utf8'));
if (old.editorial_revision?.id === 'ep001-narrative-source-first-v3') throw new Error('This one-time editorial migration is historical; episode-spec.json is now the sole authority.');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const words = (value) => value.replace(/\s/gu, '').length;
const paragraph = rows.slice(0, 5).map((row) => row.draft_narration).join(' ');
const exactOpening = '중고 노트북을 샀는데 택배 상자에는 다른 물건이 들어 있었습니다. 경찰에 신고했고, 사건 기록은 검사에게 넘어갔습니다. 그런데 판매자의 다른 계좌와 택배 접수 장소의 CCTV는 확인되지 않았습니다. 이제 검사가 직접 확인할까요, 아니면 무엇이 빠졌는지 적어 경찰에 다시 확인을 요구할까요? 10월 2일 시행 예정인 개정에서 바뀌는 지점이 바로 이것입니다.';
if (paragraph !== exactOpening) throw new Error('user-favored opening changed');

// These are editorial intentions, not selected media or production assertions.
const scenes = [
  ['omni','열어 본 택배 상자','노트북 대신 다른 물건이 보이는 상자 상태','가상 상자·노트북·잘못 온 물건','fictional'],
  ['omni','가상 신고와 기록 이동','가상 사건의 신고 후 기록 묶음이 넘겨지는 상태','가상 신고·사건 기록','fictional'],
  ['omni','사건 기록의 빠진 확인','다른 계좌와 CCTV 결과가 없는 기록의 상태','가상 결제 기록·CCTV 장치','fictional'],
  ['remotion','검사의 두 가지 확인 경로','직접 확인과 구체적 보완 요구의 경로를 대비한다','한국 경찰·검찰 기관 원본 사진','korea'],
  ['remotion','시행 예정일과 변화 지점','시행 예정일과 직접 확인·요구 경로의 관계를 보여준다','개정 법률 원문·실제 한국 기관 원본','korea'],
  ['omni','가상 사례임을 밝히는 사건 화면','가상 상자와 기록을 이어 보이되 사실 자료로 주장하지 않는다','가상 상자·기록','fictional'],
  ['remotion','보완 요구의 질문','빠진 항목 발견부터 요구와 결과 통보까지의 경로를 보여준다','한국 경찰·검찰 기관 및 기록 원본','korea'],
  ['source-video','빠진 자료를 다시 확인하는 행동','일반 기록을 읽고 누락된 항목을 대조한다','실제 문서 검토·두 기록 대조 영상','generic'],
  ['remotion','송치와 보완 요구의 다른 시점','경찰 신고·기록 송치·검사 검토의 순서를 분리한다','한국 경찰·검찰 기관 원본 사진','korea'],
  ['omni','가상 사건의 빈 기록','결제·메시지와 아직 없는 계좌·CCTV 확인을 대비한다','가상 거래 기록·CCTV 장치','fictional'],
  ['remotion','검토와 확인 수행의 역할','기록을 읽는 검사와 확인을 수행하는 수사기관을 분리한다','한국 경찰·검찰 기관 원본 사진','korea'],
  ['remotion','현행 제196조의 정확한 문구','현행 제196조의 명시적 수사 조항을 읽힌다','법률 원문·한국 검찰 기관 원본 사진','korea'],
  ['remotion','제196조 삭제 문구','개정문에서 제196조 삭제라는 상태 변화가 읽힌다','개정 법률 원문·한국 검찰 기관 원본 사진','korea'],
  ['remotion','새 제195조 제2항의 직무','삭제 조항 옆에 새 조항에서 남는 직무를 놓는다','개정 법률 원문·한국 검찰 기관 원본 사진','korea'],
  ['remotion','남는 검사의 구체적 직무','영장 청구·보완수사요구·재수사요구를 정확히 구분한다','개정 법률 원문·한국 기관 원본 사진','korea'],
  ['remotion','삭제와 존속의 대비','제196조 삭제와 제195조 제2항 존속을 한 화면에서 비교한다','개정 법률 원문·한국 기관 원본 사진','korea'],
  ['omni','가상 사건 기록의 누락 발견','가상 기록에서 다른 계좌와 특정 시간 CCTV가 없는 상태를 보여준다','가상 계좌 기록·CCTV 장치','fictional'],
  ['remotion','보완 요구로 가는 경로','빠진 대상·확인 이유를 적어 수사기관에 요구하는 흐름을 보여준다','한국 기관·문서 실물 원본 사진','korea'],
  ['source-video','문서를 읽고 확인 대상 적기','실제 서류에서 한 항목을 찾고 별도 메모를 작성하는 연속 동작','문서 검토·항목 표시·메모 작성 영상','generic'],
  ['remotion','구체적인 계좌·CCTV 요구','가상 사례의 두 확인 대상과 서류·증거 송부를 분리한다','계좌 서류·CCTV 장치·봉투 원본 사진','generic'],
  ['remotion','요구와 결과 관리','요구 내용·이행 여부·결과 통보의 관계를 보인다','기록 묶음·보관 트레이 원본 사진','generic'],
  ['remotion','한 달의 시작과 끝','요구 수령일과 이행·결과 통보의 기준을 연결한다','달력·요구서 실물 원본 사진','generic'],
  ['remotion','한 달이 뜻하지 않는 결과','보완 이행 기한과 사건 종결·피해 회복을 다른 축으로 분리한다','달력·사건 기록 실물 원본 사진','generic'],
  ['remotion','별도 기간·연장·기관 지정 조건','기간 예외와 수사기관 지정 조건을 구별한다','한국 기관·문서 원본 사진','korea'],
  ['remotion','불송치 뒤 이의신청의 출발점','불송치 통지 이후 이의 제기의 시작점을 보인다','통지서 봉투·한국 기관 원본 사진','korea'],
  ['remotion','재수사요구와 보완수사요구의 구분','서로 다른 절차의 출발점과 요구 대상을 비교한다','한국 경찰·검찰 기관 원본 사진','korea'],
  ['remotion','사실관계 확인과 증거 사용 제한','의견·자료 확인과 재판상 증거 사용 가능성을 분리한다','한국 법원·기관·문서 원본 사진','korea'],
  ['remotion','절차 이름과 결과의 다른 범위','이의신청·재수사·보완 요구를 하나의 절차로 합치지 않는다','통지서·기록·한국 기관 원본 사진','korea'],
  ['remotion','공포일과 시행 예정일','2026년 8월 4일 공포와 10월 2일 시행 예정일을 대조한다','법률 원문·달력 원본 사진','generic'],
  ['remotion','조항별 시행과 기존 사건 적용','시행 시점과 이미 맡은 사건의 적용례를 나눈다','법률 원문·사건 기록 원본 사진','generic'],
  ['remotion','조건부 90일 경과조치','공소시효 임박·불가피한 경우와 90일 한계를 묶는다','법률 원문·달력 원본 사진','generic'],
  ['remotion','시행 뒤 확인할 결과의 빈자리','시행일과 이후 자료의 미확정을 분리해 질문으로 남긴다','달력과 사건 기록 원본 사진','generic'],
  ['omni','처음 사례의 빠진 기록 재등장','가상 기록의 계좌·CCTV 누락을 처음 상자와 이어 보여준다','가상 상자·거래 기록','fictional'],
  ['remotion','구체적인 요구 경로의 회수','계좌·CCTV를 직접 수사하는 설명과 보완 요구 경로를 대비한다','한국 기관·계좌·CCTV 원본 사진','korea'],
  ['omni','가상 사례의 확인과 결과 통보','가상 확인 행동과 결과 회신을 이어 보여주되 미래 실제 성과로 주장하지 않는다','가상 거래 기록·CCTV 장치','fictional'],
  ['omni','상자로 돌아오는 최종 질문','다른 계좌와 택배 접수 장소 CCTV가 실제로 확인됐는지 묻는다','가상 택배 상자·거래 기록','fictional'],
];
if (scenes.length !== rows.length) throw new Error('scene definitions must cover every narration cut');

const legalIds = new Set(['LAW-195','LAW-196','LAW-1972','LAW-1973','LAW-2457','LAW-2458','LAW-24513','LAW-TRANS','LAW-TRANS-APPLICATION','BILL-2220257']);
const exclusions = ['웹페이지·뉴스·법률 캡처 픽셀은 근거 확인 전용', '권리 미확인 원본 또는 다른 사건을 해당 사건 증거로 제시하지 않음', '같은 원본의 크롭·인접 구간을 새 원본으로 계산하지 않음'];
const group = 'ep001-fictional-purchase-delivery-report';
const counts = {};
const cuts = rows.map((row, index) => {
  const [mode, subject, action, searchSubject, specificityHint] = scenes[index];
  counts[mode] = (counts[mode] ?? 0) + 1;
  const id = row.shot_id;
  const sid = id.toLowerCase();
  const compact = words(row.draft_narration);
  const voiceFrames = Math.ceil((compact / 4.965) * 30);
  const duration = voiceFrames + 60;
  const sourceIds = [...new Set(row.source_ids.filter((sourceId) => legalIds.has(sourceId)))];
  if (sourceIds.length === 0) sourceIds.push(mode === 'omni' ? `FICTION-${id}` : `SOURCE-SEARCH-${id}`);
  const sourceReq = `${sid}-visual-source`;
  const visualReq = {requirement_id:sourceReq, kind:'source-original', source_id:`SOURCE-SEARCH-${id}`, asset_id:`${sid}-visual-input`, status:'blocked', blocker:'subject-action-viewpoint-and-item-rights-pending-human-review', production_use:mode==='remotion'?'independent-real-layer-pending-review':'context-only; never evidence or depiction of a real hypothetical crime'};
  const requirements = [];
  if (mode==='source-video' || mode==='source-photo' || mode==='remotion') requirements.push(visualReq);
  for (const sourceId of sourceIds.filter((id) => !id.startsWith('FICTION-'))) requirements.push({requirement_id:`${sid}-${sourceId.toLowerCase()}-evidence`,kind:'source-original',source_id:sourceId,asset_id:`${sid}-${sourceId.toLowerCase()}-evidence`,status:'blocked',blocker:'exact-source-and-transcription-review-pending',production_use:'evidence-provenance-only; capture pixels forbidden on production canvas'});
  const imagegenAssets = mode==='omni' ? [1,2].map((number)=>({asset_id:`${sid}-keyframe-${number}`,status:'planned-not-created',origin:'imagegen-editorial-reconstruction',identity_scope:'fictional-generic',ai_disclosure:true,evidence:false,continuity_group:group,readable_text_names_dates_numbers_logos_ui_watermarks_forbidden:true})) : [];
  if (mode==='omni') for (const asset of imagegenAssets) requirements.push({requirement_id:`${asset.asset_id}-requirement`,kind:'imagegen-asset',asset_id:asset.asset_id,status:'blocked',blocker:'all-cut-pass-and-keyframe-semantic-review-pending',production_use:'fictional-keyframe-input-only; no Omni video'});
  const focalId=`${sid}-focal`;
  const layerId=`${sid}-independent-layer`;
  const secondaryId=`${sid}-second-keyframe`;
  const focal = mode==='remotion'
    ? {component_id:focalId,semantic_role:'dominant-explanation',render_kind:'native-text-surface',compositing:'raster-free-native-dom-vector',raster_beneath:false,raster_composite:false,text_surface_role:'surface-content',implementation_status:'planned-not-implemented',motion_expectation:'deferred-until-source-selection',atomicity:'independent',presentation_slot:'focal'}
    : {component_id:focalId,semantic_role:'dominant-visual',render_kind:'asset',asset_requirement_id:mode==='omni'?`${sid}-keyframe-1-requirement`:sourceReq,compositing:'independent-layer',implementation_status:'planned-not-implemented',motion_expectation:'deferred-until-source-selection',atomicity:'independent',presentation_slot:'focal',...(mode==='omni'?{asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}: {})};
  const components=[focal];
  const supporting=[]; const hidden=[];
  if (mode==='remotion') {components.push({component_id:layerId,semantic_role:'source-derived-support',render_kind:'asset',asset_requirement_id:sourceReq,compositing:'independent-layer',implementation_status:'planned-not-implemented',motion_expectation:'deferred-until-source-selection',atomicity:'independent',presentation_slot:'supporting'}); supporting.push({component_id:layerId});}
  if (mode==='omni') {components.push({component_id:secondaryId,semantic_role:'continuity-next-state',render_kind:'asset',asset_requirement_id:`${sid}-keyframe-2-requirement`,compositing:'independent-layer',implementation_status:'planned-not-implemented',motion_expectation:'deferred-until-source-selection',atomicity:'independent',presentation_slot:'hidden',asset_origin:'imagegen-editorial-reconstruction',text_logo_ui_forbidden:true}); hidden.push({component_id:secondaryId,until_frame:duration});}
  const visibility=[{component_id:focalId,states:[{state:index===35?'final-summary':'focused',start_frame:0,end_frame_exclusive:duration}]}];
  if (mode==='remotion') visibility.push({component_id:layerId,states:[{state:'supporting',start_frame:0,end_frame_exclusive:duration}]});
  if (mode==='omni') visibility.push({component_id:secondaryId,states:[{state:'hidden',start_frame:0,end_frame_exclusive:duration}]});
  const beat={beat_id:`${id}-B01`,purpose:subject,viewer_takeaway:row.draft_narration,narration_window:{start_frame:0,end_frame_exclusive:duration},presentation:{focal:{component_id:focalId},supporting,hidden,layout_template:mode==='omni'?'experience-hero':mode==='source-video'||mode==='source-photo'?'document-focus':index===3||index===15||index===25?'before-after':'process-flow'},component_visibility:visibility,stable_reading_hold:{start_frame:duration-60,end_frame_exclusive:duration,frames:60},planned_operator:null,action_intent:{kind:mode==='omni'?'keyframe-state':mode==='remotion'?'source-derived-motion':'source-selection',status:'deferred-until-source-selection',observable_action:action},preview_status:'blocked-assets-pending'};
  const specificity=specificityHint==='korea'?'korea-institution':specificityHint==='exact'?'exact-source':'generic-object';
  const queryKo=searchSubject.replace(/·/gu,' ').replace(/ 원본(?: 사진| 영상)?/gu,'').trim();
  const brief={brief_id:`${id}-visual`,subject:searchSubject,action,role:mode==='remotion'?'independent-layer':'full-frame',specificity,queries_ko:[queryKo],queries_en:specificityHint==='korea'?['South Korea police prosecution official building photo','Korean government records source photo']:specificityHint==='exact'?['official post implementation case processing statistics']:['document review hands close up','case file folder evidence review','calendar and document source photo'],provider_routes:specificityHint==='korea'?['korean-official-open-item','kogl-photo','commons-object']:specificityHint==='exact'?['korean-official-open-item']:['commons-object','kogl-photo','kogl-video','pexels-generic-last'],media_types:[mode==='source-video'?'video':'photo'],exclusions,subject_family:specificityHint==='korea'?'korean-institution':specificityHint==='fictional'?'fictional-object':'generic-evidence-object',place_context:specificityHint==='korea'?'대한민국 해당 기관의 정확한 metadata':null,viewpoint:'대상과 행동이 실제로 식별되는 장면 또는 독립 asset 원본',required_evidence:[{subject:searchSubject,action,dimension:'subject-action-viewpoint'}]};
  const briefs=mode==='omni'?[]:[brief];
  if (mode==='remotion' && sourceIds.length) briefs.push({brief_id:`${id}-law-evidence`,subject:'개정 법률 정확 원문',action:'대본 사실·문구를 화면 밖 원본에서 확인한다',role:'off-canvas-evidence',specificity:'exact-source',queries_ko:['국가법령정보센터 형사소송법 법률 제21857호'],queries_en:[],provider_routes:['korean-official-open-item'],exclusions:['캡처 픽셀의 생산 화면 사용'],subject_family:'statutory-source',media_types:['photo']});
  const purpose=mode==='omni'?'fictional-action':mode==='remotion'?'explanation':'real-context';
  const mediaSurface=mode==='omni'?'full-frame-fictional-keyframe-input':mode==='remotion'?'raster-free-native-procedure-surface':'full-frame-real-source';
  const cut={shot_id:id,production_mode:mode,draft_narration:row.draft_narration,visual_purpose:`${subject}: ${action}`,visual_action:action,source_need_taxonomy:mode==='omni'?'fictional-continuity':mode==='remotion'?'legal-text':specificityHint==='exact'?'general-korean-context':'document-workflow',semantic_sentence_numbers:[index+1],internal_presentation_segments:[],long_cut_reason:duration>240?`한 컷의 ${subject}를 읽고 판단하는 의미상 연속 구간`:null,source_ids:sourceIds,estimated_voice_seconds:compact/4.965,pre_roll_frames:0,post_hold_frames:60,transition_overlap_frames:0,duration_frames:duration,master_occupancy_frames:duration,viewer_takeaway:row.draft_narration,usage_layer:mode==='omni'?'fictional-editorial-reconstruction':mode==='remotion'?'necessary-explanation':'contextual-real-media',acquisition:{candidate_status:mode==='omni'?'planned-keyframe-input-blocked-all-cut-pass':'source-discovery-and-human-review-pending',priority:mode==='omni'?['IMAGEGEN-OMNI:fictional-keyframe-input']:specificityHint==='korea'?['LOCAL-OFFICIAL-LAW:exact-claim','KOGL-OFFICIAL:real-source']:['COMMONS-OBJECT:generic-object','PEXELS-GENERIC:generic-action'],preserve_full_original:true},candidate_selection:{status:mode==='omni'?'not-applicable-fictional-omni-keyframes':'pending-human-source-review',candidate_ids:[],rights_approval:false,production_visible:false},motion_graphics_justification:mode==='remotion'?`정확한 법률 문구·조건·시간·기관 관계로 ${subject}를 설명한다.`:null,imagegen_assets:imagegenAssets,designed_assets:[],transparent_derivatives:[],evidence_originals:sourceIds.filter((id) => !id.startsWith('FICTION-')),requirements,presentation:{focal:focalId,supporting:supporting.map(x=>x.component_id),hidden_until:hidden.map(x=>x.component_id),layout_template:beat.presentation.layout_template},visual_beats:[beat],document_contract:null,raster_free_text_contract:mode==='remotion'?{required:true,native_dom_or_vector:true,raster_beneath:false,raster_composite:false,capture_pixels_allowed_on_canvas:false,text_component_ids:[focalId],evidence_source_ids:sourceIds}:null,typography_surface_contract_version:2,layout_contract_version:2,text_surfaces:mode==='remotion'?[{component_id:focalId,role:'surface-content',rotation_degrees:0,raster_beneath:false,raster_composite:false,status:'pending-exact-source-review'}]:[],layout_contract:{version:2,status:'candidate-blocked-until-source-ready'},timing:{provisional_duration_frames:duration,master_occupancy_frames:duration,reading_hold_frames:60},transition:{type:index===35?'hold':'hard-cut',intent:index===35?'hold the final question for reading':'cut when the narration meaning changes',next_shot_id:index===35?null:rows[index+1].shot_id,implementation_status:'planned-not-implemented'},missing_inputs:[mode==='omni'?'text-free fictional keyframe inputs pending review':'actual source/action/viewpoint and rights pending review','source-ready style frame, playable cut preview, and user cut PASS'],fallback:{allowed:'같은 의미의 적합 원본을 더 검색하고 미확보 상태를 유지한다.',forbidden:'unrelated footage, webpage pixels, generic graphic, unreviewed AI reconstruction'},components,media_strategy:{dominant_surface:mediaSurface,source_contract:{status:'pending-item-level-source-review',specificity},visual_treatment:{status:'pending-source-ready-style-frame-review'},motion_contract:{status:'blocked-action-intent-only'}},production_authority:false,production_decision:{version:1,mode,purpose,reason:`${subject}는 대본 의미로 선택한 ${mode} 제작 방식이다. 자료 미확보가 선택 이유가 아니다.`,visible_subject:subject,observable_action:action,rejected_modes:{live_action:mode==='source-video'||mode==='source-photo'?'선택됨: 의미에 맞는 실제 원본을 찾는다.':'정확한 관계·조건 또는 가상 연속성을 실제 사건 화면으로 가장하지 않는다.',motion_graphics:mode==='remotion'?'선택됨: 출처 원본과 별도 텍스트 표면을 결합한다.':'한 화면의 실제 행동 또는 명시적 가상 사건을 임의 그래픽으로 대체하지 않는다.',omni:mode==='omni'?'선택됨: 가상 사건의 연속 keyframe만 계획한다.':'법률·실제 기관·업무 행동을 생성 장면으로 증거화하지 않는다.'},continuity_group:mode==='omni'?group:null,asset_search_briefs:briefs,reuse_reason:null,existing_selection_status:'all-prior-selections-superseded-pending-new-review',human_review_status:'pending',search_completion_status:'pending-action-view-specific-source-selection'}};
  return cut;
});

const narration=cuts.map(c=>c.draft_narration).join(' ');
const compact=narration.replace(/\s/gu,'');
const totalFrames=cuts.reduce((sum,cut)=>sum+cut.master_occupancy_frames,0);
old.cuts=cuts;
old.status='candidate-script-source-first-plan-blocked';
old.narration_contract.status='editorial-refactor-pending-user-review-provisional-timing';
old.narration_contract.runtime_note='36 semantic cuts from the new narrative candidate; provisional until the user reviews the complete script and final audio is measured.';
old.narration_contract.draft_compact_character_target={min:compact.length,max:compact.length};
old.narration_contract.cut_count_target={min:cuts.length,max:cuts.length};
old.narration_contract.runtime_target_seconds={min:480,max:600};
old.timing_authority.provisional_master_frames=totalFrames;
old.timing_authority.provisional_master_seconds=totalFrames/30;
old.timing_authority.target_seconds=[480,600];
old.intro_rules.hook_order=rows.slice(0,5).map(r=>r.draft_narration);
old.intro_rules.host_intro_modes=['omni','remotion'];
old.intro_source_candidates=[];
old.script_lock={schema_version:1,status:'editorial-refactor-pending-user-review',reviewer:null,approved_at:null,source_path:'wiki/syntheses/episode-001-script-refactor-v2.md',source_sha256:sha(Buffer.from(page,'utf8')),narration_scope:'SH001-through-SH036',narration_normalization:'draft_narration values in SH order; all whitespace removed; UTF-8',narration_sha256:sha(Buffer.from(compact,'utf8')),compact_character_count:compact.length,final_recording_status:'pending',visual_review_status:'pending',production_stage_remains:'timing-draft',note:'The user endorsed the exact opening and requested a full refactor; the complete revised narration is a pending review candidate.'};
old.editorial_revision={schema_version:1,id:'ep001-narrative-source-first-v3',status:'candidate-plan-blocked',supersedes_visual_plan:'ep001-source-first-semantic-v2',superseded_plan_production_authority:false,source_path:'wiki/syntheses/episode-001-script-refactor-v2.md',source_review_status:'pending',source_selection_status:'pending',cut_count:cuts.length,mode_counts:counts,fictional_continuity:{status:'planned-keyframe-input-only',cut_ids:cuts.filter(c=>c.production_mode==='omni').map(c=>c.shot_id),omni_video_generation:'blocked-until-all-cuts-user-pass'},production_authority:false,routing_review:'2026-09-16-full-narration-and-visual-source-refactor'};
old.editorial_visual_policy={...old.editorial_visual_policy,source_acquisition_matrix:null,source_acquisition_matrix_sha256:null,source_acquisition_matrix_status:'pending',candidate_inventory_status:'prior-review-superseded; new scene-first source selection pending',mode_transition_status:'new narrative candidate; no active cut or production authority'};
old.production_gates=['new full script awaits user review; the favored opening alone is not a full-script PASS','all media requires scene/timecode and item-level source/rights/semantic review','source-photo/source-video actual context only; captured webpage/legal pixels remain off-canvas evidence','Omni keyframes only until every cut receives user cut PASS'];
old.production_routing_policy={...old.production_routing_policy,version:1,missing_source_changes_mode:false,source_diversity_unit:'original-sha256-and-semantic-subject'};
fs.writeFileSync(specPath,`${JSON.stringify(old,null,2)}\n`,'utf8');
process.stdout.write(JSON.stringify({cuts:cuts.length,mode_counts:counts,compact_chars:compact.length,frames:totalFrames,seconds:totalFrames/30,opening_exact:true,production_authority:false})+'\n');
