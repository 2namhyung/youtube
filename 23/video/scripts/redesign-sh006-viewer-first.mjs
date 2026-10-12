import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const specPath = path.resolve(root, 'video/episodes/episode-001/episode-spec.json');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const index = spec.cuts.findIndex((cut) => cut.shot_id === 'SH006');
if (index < 0) throw new Error('SH006 is missing');
const previous = spec.cuts[index];
if (!['source-photo', 'remotion'].includes(previous.production_mode)) throw new Error('SH006 has an unknown production mode; refusing an ambiguous rewrite');

const marker = 'video/qa/episode-001-work-v01/source-lock/SH006/SH006-viewer-first-text-contract.json';
const markerSha = '9988051e6ddab7399117695b24b626768a3209baaf680dce1321bb01654972c3';
const duration = 812;

const designed = (assetId, file, subjectKind, basis, sourceReference = null) => ({
  asset_id: assetId,
  file: `assets/${file}`,
  subject_kind: subjectKind,
  provenance: {type: 'self-created', basis, source_reference: sourceReference ?? `SELF-CREATED:src/lib/sh006-viewer-assets.ts#${assetId}`},
  rights_status: 'self-created',
  status: 'created-provisional',
  use: sourceReference ? 'source-backed explanatory retypeset' : 'explanation-only editorial cutout',
});
const requirement = (id, assetId, file, basis) => ({
  requirement_id: id,
  kind: 'designed-asset',
  source_id: null,
  approved_media_asset_id: null,
  materialization_record_id: null,
  status: 'blocked',
  blocker: 'human_visual_review_pending',
  asset_id: assetId,
  provenance: {type: 'self-created', basis},
  file: `assets/${file}`,
});
const component = (id, requirementId, role, renderKind, motion, slot) => ({
  component_id: id,
  asset_requirement_id: requirementId,
  semantic_role: role,
  render_kind: renderKind,
  compositing: renderKind === 'asset' ? 'independent-layer' : 'procedural-layer',
  motion_expectation: motion,
  atomicity: renderKind === 'asset' ? 'single-editable-object' : 'procedural',
  presentation_slot: slot,
  implementation_status: 'planned-not-implemented',
});
const state = (name, start, end) => ({state: name, start_frame: start, end_frame_exclusive: end});
const visibility = (componentId, states) => ({component_id: componentId, states});
const op = (operatorId, target, capability, semantic, parameters, start, end, observable) => ({
  status: 'planned-not-implemented',
  operator_id: operatorId,
  target_component_id: target,
  required_capability: capability,
  action_semantic: semantic,
  parameters,
  start_frame: start,
  end_frame_exclusive: end,
  observable_change: observable,
  semantic_terms: [],
});
const presentation = (layout, focal, supporting, hidden) => ({
  layout_template: layout,
  focal: {component_id: focal},
  supporting: supporting.map((component_id) => ({component_id})),
  hidden: hidden.map((component_id) => ({component_id, until_frame: duration})),
});
const beat = ({id, purpose, message, start, end, focal, supporting = [], hidden = [], layout, visibility: timelines, operators, holdStart, phase = null}) => ({
  beat_id: id,
  viewer_takeaway: message,
  purpose,
  narration_window: {start_frame: start, end_frame_exclusive: end},
  presentation: presentation(layout, focal, supporting, hidden),
  component_visibility: timelines,
  planned_operators: operators.map((operator) => ({...operator, observable_change: `${purpose}: ${operator.observable_change}`})),
  stable_reading_hold: {start_frame: holdStart, end_frame_exclusive: end, frames: end - holdStart},
  document_phase: phase,
  preview_status: 'ready',
});

const all = [
  'sh006-prosecutor', 'sh006-person', 'sh006-facts-folder', 'sh006-evidence-magnifier',
  'sh006-investigation-route', 'sh006-current-article-196', 'sh006-article-196-deletion',
  'sh006-delete-mark', 'sh006-article-195-retained', 'sh006-request-sheet',
  'sh006-police-building', 'sh006-request-route',
];
const onlyHidden = (...visible) => all.filter((id) => !visible.includes(id));

const sh006 = {
  shot_id: 'SH006',
  production_mode: 'remotion',
  draft_narration: '개정법이 시행되기 전 형사소송법 제196조는 검사가 범인과 범죄사실, 증거를 수사한다고 정합니다. 개정법은 이 조문 전체를 삭제합니다. 하지만 검사가 경찰에 보완수사나 재수사를 요구하는 직무까지 없어지는 것은 아닙니다. 그 직무는 새 제195조에 따로 남습니다.',
  visual_purpose: '제196조가 무엇을 정하던 조문인지 먼저 행동 도식으로 이해시킨 뒤, 삭제되는 조문과 새 제195조제2항에 남는 요구 직무를 공식 문구로 대조한다.',
  visual_action: '검사에서 범인·범죄사실·증거로 이어지는 수사 도식을 먼저 조립하고 시행 전 제196조 문장을 크게 읽는다. 이어 개정문의 삭제 문장이 기존 조문 위에 표시되고, 새 제195조제2항의 보완수사요구·재수사요구 문구를 읽은 뒤 검사→요구서→경찰 경로가 남는 최종 보드로 끝난다.',
  source_ids: ['LAW-196', 'LAW-REVISION-21857'],
  estimated_voice_seconds: [22.8, 23.7],
  pre_roll_frames: 15,
  post_hold_frames: 102,
  transition_overlap_frames: 30,
  duration_frames: null,
  master_occupancy_frames: null,
  viewer_takeaway: '제196조의 검사 수사 조항은 삭제되지만 보완수사요구와 재수사요구 직무는 새 제195조제2항에 남는다.',
  usage_layer: 'explanation',
  acquisition: {
    priority: ['LOCAL-OFFICIAL-LAW:LAW-196', 'LOCAL-OFFICIAL-LAW:LAW-REVISION-21857'],
    candidate_status: 'source-text-locked-provisional-visualization',
    preserve_full_original: true,
  },
  designed_assets: [
    designed('sh006-prosecutor', 'sh006-prosecutor.png', 'person', '검사 역할을 나타내는 비실존 설명용 인물 컷아웃'),
    designed('sh006-person', 'sh006-person.png', 'person', '형사소송법 제196조 문구의 범인을 나타내는 비실존 설명용 인물 컷아웃'),
    designed('sh006-facts-folder', 'sh006-facts-folder.png', 'object', '범죄사실을 나타내는 설명용 사건 폴더'),
    designed('sh006-evidence-magnifier', 'sh006-evidence-magnifier.png', 'object', '증거 확인을 나타내는 설명용 사진·돋보기'),
    designed('sh006-current-article-196', 'sh006-current-article-196.png', 'object', '시행 전 제196조제1항 정확 문구의 UI 없는 재조판', 'LAW-196'),
    designed('sh006-article-196-deletion', 'sh006-article-196-deletion-viewer.png', 'object', '법률 제21857호의 제196조 삭제 정확 문구 재조판', 'LAW-REVISION-21857'),
    designed('sh006-delete-mark', 'sh006-delete-mark.png', 'object', '조문 전체 삭제를 설명하는 붉은 교차선'),
    designed('sh006-article-195-retained', 'sh006-article-195-retained-viewer.png', 'object', '새 제195조제2항 중 존속 직무 정확 문구 재조판', 'LAW-REVISION-21857'),
    designed('sh006-request-sheet', 'sh006-request-sheet.png', 'object', '보완수사·재수사 요구서를 나타내는 설명용 문서'),
    designed('sh006-police-building', 'sh006-police-building.png', 'building', '요구를 받는 경찰 수사기관을 나타내는 설명용 건물'),
  ],
  transparent_derivatives: [],
  evidence_originals: ['LAW-196', 'LAW-REVISION-21857'],
  requirements: [
    {requirement_id: 'SH006-current-article-196-text', kind: 'exact-transcription', source_id: 'LAW-196', approved_media_asset_id: null, materialization_record_id: null, status: 'approved', approval_marker_path: marker, approval_marker_sha256: markerSha},
    {requirement_id: 'SH006-amendment-text', kind: 'exact-transcription', source_id: 'LAW-REVISION-21857', approved_media_asset_id: null, materialization_record_id: null, status: 'approved', approval_marker_path: marker, approval_marker_sha256: markerSha},
    requirement('SH006-prosecutor-asset', 'sh006-prosecutor', 'sh006-prosecutor.png', '설명용 검사 역할 컷아웃'),
    requirement('SH006-person-asset', 'sh006-person', 'sh006-person.png', '설명용 범인 역할 컷아웃'),
    requirement('SH006-facts-asset', 'sh006-facts-folder', 'sh006-facts-folder.png', '설명용 범죄사실 폴더'),
    requirement('SH006-evidence-asset', 'sh006-evidence-magnifier', 'sh006-evidence-magnifier.png', '설명용 증거 사진·돋보기'),
    requirement('SH006-current-article-asset', 'sh006-current-article-196', 'sh006-current-article-196.png', '시행 전 제196조 정확 문구 재조판'),
    requirement('SH006-deletion-asset', 'sh006-article-196-deletion', 'sh006-article-196-deletion-viewer.png', '제196조 삭제 정확 문구 재조판'),
    requirement('SH006-delete-mark-asset', 'sh006-delete-mark', 'sh006-delete-mark.png', '삭제 교차선'),
    requirement('SH006-retained-asset', 'sh006-article-195-retained', 'sh006-article-195-retained-viewer.png', '새 제195조제2항 정확 문구 재조판'),
    requirement('SH006-request-sheet-asset', 'sh006-request-sheet', 'sh006-request-sheet.png', '설명용 요구서'),
    requirement('SH006-police-building-asset', 'sh006-police-building', 'sh006-police-building.png', '설명용 경찰 건물'),
  ],
  presentation: {
    focal: 'what-article-196-does-before-what-changes',
    supporting: ['exact-current-article', 'exact-amendment-text', 'remaining-request-route'],
    hidden_until: ['current-article', 'deletion-text', 'retained-request-duty', 'final-process-summary'],
    layout_template: 'process-flow',
  },
  visual_beats: [
    beat({
      id: 'SH006-B01', purpose: 'article-role-explainer', start: 0, end: 165, holdStart: 105,
      message: '제196조는 검사가 범인·범죄사실·증거를 수사한다고 정한 조문이다.',
      focal: 'sh006-prosecutor', supporting: ['sh006-person', 'sh006-facts-folder', 'sh006-evidence-magnifier', 'sh006-investigation-route'],
      hidden: onlyHidden('sh006-prosecutor', 'sh006-person', 'sh006-facts-folder', 'sh006-evidence-magnifier', 'sh006-investigation-route'), layout: 'process-flow',
      visibility: [
        visibility('sh006-prosecutor', [state('entering', 15, 35), state('focused', 35, 165)]),
        visibility('sh006-person', [state('entering', 35, 55), state('supporting', 55, 165)]),
        visibility('sh006-facts-folder', [state('entering', 50, 70), state('supporting', 70, 165)]),
        visibility('sh006-evidence-magnifier', [state('entering', 65, 85), state('supporting', 85, 165)]),
        visibility('sh006-investigation-route', [state('entering', 80, 105), state('supporting', 105, 165)]),
      ],
      operators: [
        op('transform.spring@1', 'sh006-prosecutor', 'layer-entry', 'enter-subject', {from_x: -130, to_x: 0, from_scale: .86, to_scale: 1, damping: 18, stiffness: 110, mass: .75}, 15, 35, '검사 역할 PNG가 왼쪽에서 안착한다.'),
        op('transform.spring@1', 'sh006-person', 'layer-entry', 'enter-subject', {from_y: 80, to_y: 0, from_scale: .72, to_scale: 1, damping: 18, stiffness: 110, mass: .75}, 35, 55, '범인 역할 PNG가 독립적으로 안착한다.'),
        op('transform.spring@1', 'sh006-facts-folder', 'layer-entry', 'enter-subject', {from_y: 80, to_y: 0, from_scale: .72, to_scale: 1, damping: 18, stiffness: 110, mass: .75}, 50, 70, '범죄사실 폴더 PNG가 독립적으로 안착한다.'),
        op('transform.spring@1', 'sh006-evidence-magnifier', 'layer-entry', 'enter-subject', {from_y: 80, to_y: 0, from_scale: .72, to_scale: 1, damping: 18, stiffness: 110, mass: .75}, 65, 85, '증거 PNG가 독립적으로 안착한다.'),
        op('svg.stroke-draw@1', 'sh006-investigation-route', 'relationship-path', 'draw-relationship', {from_progress: 0, to_progress: 1}, 80, 105, '검사에서 세 수사 대상으로 향하는 경로가 그려진다.'),
      ],
    }),
    beat({
      id: 'SH006-B02', purpose: 'current-article-exact-text', start: 165, end: 345, holdStart: 285,
      message: '시행 전 제196조제1항은 검사가 범인·범죄사실·증거를 수사한다고 명시한다.',
      focal: 'sh006-current-article-196', hidden: onlyHidden('sh006-current-article-196'), layout: 'document-focus',
      visibility: [visibility('sh006-current-article-196', [state('entering', 165, 190), state('focused', 190, 345)])],
      operators: [op('mask.inset@1', 'sh006-current-article-196', 'mask-reveal', 'reveal-region', {from_right_percent: 100, to_right_percent: 0}, 165, 190, '시행 전 제196조의 정확한 문장이 왼쪽에서 드러난다.')],
      phase: 'overview',
    }),
    beat({
      id: 'SH006-B03', purpose: 'article-196-deletion', start: 345, end: 465, holdStart: 405,
      message: '법률 제21857호 개정문은 제196조 전체를 삭제한다.',
      focal: 'sh006-article-196-deletion', supporting: ['sh006-current-article-196', 'sh006-delete-mark'],
      hidden: onlyHidden('sh006-current-article-196', 'sh006-article-196-deletion', 'sh006-delete-mark'), layout: 'before-after',
      visibility: [
        visibility('sh006-current-article-196', [state('supporting', 345, 465)]),
        visibility('sh006-article-196-deletion', [state('entering', 345, 375), state('focused', 375, 465)]),
        visibility('sh006-delete-mark', [state('entering', 375, 405), state('supporting', 405, 465)]),
      ],
      operators: [
        op('transform.tween@1', 'sh006-current-article-196', 'layer-transform', 'compare-state', {from_x: 0, to_x: -430, from_scale: 1, to_scale: .52}, 345, 375, '시행 전 제196조 카드가 왼쪽 비교 위치로 이동한다.'),
        op('transform.spring@1', 'sh006-article-196-deletion', 'layer-entry', 'enter-subject', {from_x: 600, to_x: 430, from_scale: .34, to_scale: .52, damping: 20, stiffness: 115, mass: .8}, 345, 375, '삭제 개정문이 오른쪽 비교 위치에 안착한다.'),
        op('transform.tween@1', 'sh006-delete-mark', 'layer-transform', 'compare-state', {from_x: 0, to_x: -430, from_scale: 1, to_scale: .52}, 375, 405, '붉은 삭제 표시가 시행 전 조문 위로 이동한다.'),
        op('mask.inset@1', 'sh006-delete-mark', 'mask-reveal', 'reveal-region', {from_right_percent: 100, to_right_percent: 0}, 375, 405, '붉은 삭제 표시가 행동으로 그어진다.'),
      ],
      phase: 'normalized-crop',
    }),
    beat({
      id: 'SH006-B04', purpose: 'retained-request-duty', start: 465, end: 615, holdStart: 555,
      message: '새 제195조제2항에는 보완수사요구와 재수사요구 직무가 남는다.',
      focal: 'sh006-article-195-retained', hidden: onlyHidden('sh006-article-195-retained'), layout: 'document-focus',
      visibility: [visibility('sh006-article-195-retained', [state('entering', 465, 495), state('focused', 495, 615)])],
      operators: [op('mask.inset@1', 'sh006-article-195-retained', 'mask-reveal', 'reveal-region', {from_right_percent: 100, to_right_percent: 0}, 465, 495, '새 제195조제2항의 보완수사요구·재수사요구 문구가 드러난다.')],
      phase: 'exact-retypeset-quote',
    }),
    beat({
      id: 'SH006-B05', purpose: 'viewer-summary-process', start: 615, end: 812, holdStart: 752,
      message: '검사의 직접수사 조항은 삭제되지만 경찰에 보완수사·재수사를 요구하는 직무는 남는다.',
      focal: 'sh006-request-sheet',
      supporting: all.filter((id) => id !== 'sh006-request-sheet'), hidden: [], layout: 'process-flow',
      visibility: [
        visibility('sh006-prosecutor', [state('supporting', 615, 812)]),
        visibility('sh006-person', [state('supporting', 615, 812)]),
        visibility('sh006-facts-folder', [state('supporting', 615, 812)]),
        visibility('sh006-evidence-magnifier', [state('supporting', 615, 812)]),
        visibility('sh006-investigation-route', [state('supporting', 615, 812)]),
        visibility('sh006-current-article-196', [state('supporting', 615, 812)]),
        visibility('sh006-article-196-deletion', [state('supporting', 615, 812)]),
        visibility('sh006-delete-mark', [state('supporting', 615, 812)]),
        visibility('sh006-article-195-retained', [state('supporting', 615, 812)]),
        visibility('sh006-request-sheet', [state('entering', 615, 645), state('focused', 645, 812)]),
        visibility('sh006-police-building', [state('entering', 630, 660), state('supporting', 660, 812)]),
        visibility('sh006-request-route', [state('entering', 660, 690), state('supporting', 690, 812)]),
      ],
      operators: [
        op('transform.tween@1', 'sh006-prosecutor', 'layer-transform', 'move-subject', {from_x: 0, to_x: 530, from_y: 0, to_y: 50, from_scale: 1, to_scale: .46}, 615, 645, '검사 역할 PNG가 남는 요구 경로의 왼쪽에 이동한다.'),
        op('transform.tween@1', 'sh006-person', 'layer-transform', 'move-subject', {from_x: 0, to_x: -500, from_y: 0, to_y: 260, from_scale: 1, to_scale: .28}, 615, 645, '범인 역할 PNG가 삭제 영역 아래에 축소 정렬된다.'),
        op('transform.tween@1', 'sh006-facts-folder', 'layer-transform', 'move-subject', {from_x: 0, to_x: -710, from_y: 0, to_y: 255, from_scale: 1, to_scale: .28}, 615, 645, '범죄사실 폴더가 삭제 영역 아래에 축소 정렬된다.'),
        op('transform.tween@1', 'sh006-evidence-magnifier', 'layer-transform', 'move-subject', {from_x: 0, to_x: -930, from_y: 0, to_y: 285, from_scale: 1, to_scale: .28}, 615, 645, '증거 PNG가 삭제 영역 아래에 축소 정렬된다.'),
        op('transform.tween@1', 'sh006-current-article-196', 'layer-transform', 'move-subject', {from_x: 0, to_x: -185, from_y: 0, to_y: -280, from_scale: 1, to_scale: .73}, 615, 645, '시행 전 제196조 카드가 좌측 삭제 영역 위에 정렬된다.'),
        op('transform.tween@1', 'sh006-delete-mark', 'layer-transform', 'move-subject', {from_x: 0, to_x: -240, from_y: 0, to_y: -300, from_scale: 1, to_scale: .73}, 615, 645, '붉은 삭제 표시가 축소된 시행 전 조문에 다시 맞춰진다.'),
        op('transform.tween@1', 'sh006-article-196-deletion', 'layer-transform', 'move-subject', {from_x: 0, to_x: -958, from_y: 0, to_y: 128, from_scale: 1, to_scale: .85}, 615, 645, '삭제 개정문이 좌측 조문 아래의 결론 카드로 이동한다.'),
        op('transform.tween@1', 'sh006-article-195-retained', 'layer-transform', 'move-subject', {from_x: 0, to_x: 315, from_y: 0, to_y: -300, from_scale: 1, to_scale: .42}, 615, 645, '존속 문구가 우측 요구 경로 위의 근거 위치로 이동한다.'),
        op('transform.spring@1', 'sh006-request-sheet', 'layer-entry', 'enter-subject', {from_y: 90, to_y: 0, from_scale: .78, to_scale: 1, damping: 19, stiffness: 112, mass: .78}, 615, 645, '요구서 PNG가 최종 보드 중앙에 안착한다.'),
        op('transform.spring@1', 'sh006-police-building', 'layer-entry', 'enter-subject', {from_x: 180, to_x: 0, from_scale: .82, to_scale: 1, damping: 19, stiffness: 112, mass: .78}, 630, 660, '경찰 건물 PNG가 오른쪽에서 안착한다.'),
        op('svg.stroke-draw@1', 'sh006-request-route', 'relationship-path', 'draw-relationship', {from_progress: 0, to_progress: 1}, 660, 690, '검사에서 요구서를 거쳐 경찰로 이어지는 경로가 그려진다.'),
      ],
    }),
  ],
  document_contract: {
    required: true,
    source_id: 'LAW-REVISION-21857',
    source_label_ko: '형사소송법 제196조 · 법률 제21857호 개정문',
    sequence: ['overview', 'normalized-crop', 'exact-retypeset-quote'],
    phases: {
      overview: {component_id: 'sh006-current-article-196', beat_id: 'SH006-B02', source_id: 'LAW-196'},
      'normalized-crop': {component_id: 'sh006-article-196-deletion', beat_id: 'SH006-B03', source_id: 'LAW-REVISION-21857'},
      'exact-retypeset-quote': {component_id: 'sh006-article-195-retained', beat_id: 'SH006-B04', source_id: 'LAW-REVISION-21857'},
    },
    normalized_crop: {region: {x: 0, y: 0, width: 1, height: 1}, status: 'verified', review_marker_path: marker, review_sha256: markerSha},
    exact_retypeset_quote: {
      text: '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.',
      status: 'verified', font_px_1080: 82, max_lines: 2,
      source_locator: '법률 제21857호 개정문 신설 제195조제2항의 연속 문구',
      reviewer: 'source-verified-viewer-first-2026-08-29', review_sha256: markerSha, review_marker_path: marker,
    },
    paired_statutory_change: {
      current_text: '검사는 범죄의 혐의가 있다고 사료하는 때에는 범인, 범죄사실과 증거를 수사한다.',
      deletion_text: '제196조를 삭제한다.',
      retained_text: '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.',
      takeaway: '제196조의 검사 수사 조항 삭제 / 보완수사요구·재수사요구 직무 존속',
      guardrail: '모든 검사 직무 또는 모든 보완수사가 폐지된다고 표현하지 않는다.',
    },
    reading_hold_beat_id: 'SH006-B04',
    camera_and_document_motion_must_end_before_hold: true,
  },
  timing: {provisional_duration_frames: duration, master_occupancy_frames: duration - 30, reading_hold_frames: 60},
  transition: {
    type: 'scene-to-scene',
    operator_id: 'scene.crossfade@1',
    intent: 'SH006의 최종 요구 경로 보드가 사라지며 SH007의 가상 사건 도입 화면이 같은 중심선에서 이어진다.',
    start_frame: duration - 30,
    duration_frames: 30,
    next_shot_id: 'SH007',
    continuity: {
      relation: 'spatial-state',
      outgoing_asset_ids: [],
      incoming_asset_ids: [],
      outgoing_state: {focal_component: 'sh006-request-sheet', alignment: 'center'},
      incoming_state: {focal_component: 'phone', alignment: 'center'},
    },
    fallback: null,
  },
  missing_inputs: ['SH006 자체 제작 PNG 10종의 사람 시각 검수'],
  fallback: {allowed: '없음', forbidden: '제196조의 의미 설명 없이 법 조문 번호나 제작 메타데이터만 보여주기'},
  components: [
    component('sh006-prosecutor', 'SH006-prosecutor-asset', 'primary', 'asset', 'independent', 'actor-left'),
    component('sh006-person', 'SH006-person-asset', 'supporting', 'asset', 'independent', 'support'),
    component('sh006-facts-folder', 'SH006-facts-asset', 'supporting', 'asset', 'independent', 'support'),
    component('sh006-evidence-magnifier', 'SH006-evidence-asset', 'supporting', 'asset', 'independent', 'support'),
    component('sh006-investigation-route', null, 'relationship', 'svg-path', 'procedural', 'route-primary'),
    component('sh006-current-article-196', 'SH006-current-article-asset', 'evidence', 'asset', 'independent', 'overview'),
    component('sh006-article-196-deletion', 'SH006-deletion-asset', 'evidence', 'asset', 'independent', 'crop'),
    component('sh006-delete-mark', 'SH006-delete-mark-asset', 'emphasis', 'asset', 'independent', 'quote'),
    component('sh006-article-195-retained', 'SH006-retained-asset', 'evidence', 'asset', 'independent', 'quote'),
    component('sh006-request-sheet', 'SH006-request-sheet-asset', 'primary', 'asset', 'independent', 'request'),
    component('sh006-police-building', 'SH006-police-building-asset', 'supporting', 'asset', 'independent', 'actor-right'),
    component('sh006-request-route', null, 'relationship', 'svg-path', 'procedural', 'route-return'),
  ],
};

spec.cuts[index] = sh006;
const sh005 = spec.cuts[index - 1];
sh005.transition_overlap_frames = 30;
sh005.timing.master_occupancy_frames = sh005.timing.provisional_duration_frames - 30;
sh005.transition = {
  type: 'scene-to-scene',
  operator_id: 'scene.crossfade@1',
  intent: 'SH005 절차 지도가 사라지며 SH006의 검사와 수사 대상 도식이 같은 화면 중심선에서 이어진다.',
  start_frame: sh005.timing.master_occupancy_frames,
  duration_frames: 30,
  next_shot_id: 'SH006',
  continuity: {
    relation: 'spatial-state',
    outgoing_asset_ids: [],
    incoming_asset_ids: [],
    outgoing_state: {focal_component: 'episode-promise-route-map-subject', alignment: 'center'},
    incoming_state: {focal_component: 'sh006-prosecutor', alignment: 'center-left'},
  },
  fallback: null,
};
spec.timing_authority.provisional_master_frames = 15746;
spec.timing_authority.provisional_master_seconds = 15746 / 30;
await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ok: true, shot_id: 'SH006', production_mode: sh006.production_mode, duration_frames: duration, provisional_master_frames: spec.timing_authority.provisional_master_frames}, null, 2));
