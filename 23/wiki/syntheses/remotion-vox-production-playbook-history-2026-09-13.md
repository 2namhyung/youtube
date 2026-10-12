# 제작 playbook 역사 기록 — 2026-09-13 정리 이전

> **현재 제작 지침이 아니다.** 아래는 이전 playbook 원문 보존본이다. 48컷/고정 family/과거 source·style·render root·PASS 상태는 이 기록에서 현재 권한을 얻지 않는다. 운영은 [현재 정본](remotion-vox-production-playbook-v0.1.md), [episode-spec](../../video/episodes/episode-001/episode-spec.json), [production state](../../video/episodes/episode-001/production-state.json)를 따른다. 기존 근거 링크와 실패 원인을 보존하기 위해 이력으로 분리했다.

---

# Remotion Vox production playbook v0.1

- Status: implementation-ready synthesis
- Updated: 2026-08-29
- Primary sources: [[../sources/vox-style-claude-remotion-reference]], [[../sources/mo-sidd-remotion-production-series]]

## 채널이 만들 영상

### 2026-09-09 EP001 사용자 지정 우선순위

사용자는 [실사 중심 대본](episode-001-live-action-script-draft-v1.md)의 낭독 문구를 고정하고 [한방이슈 레퍼런스 분석](../../video/qa/reference-study/hanbang-5o8DvcFB65g-v01/analysis.md)을 참고한 제작을 지시했다. EP001은 대사별로 적합한 실제 영상 → 실제 사진을 먼저 검색·수급한다. 추상적 법률 설명이라는 이유만으로 컷 전체를 모션그래픽에 배정하지 않는다. 실사 위 음성으로 전달 가능한 내용은 실사로 구성하고, 정확한 조문·비교·관계가 필요한 부분만 승인된 설명 표면을 사용한다. 모션그래픽·Omni에는 실사로 충족되지 않는 의미·행동과 선택 이유를 명시한다.

명시적 가상 사례도 적합한 실사 자료로 먼저 설명할 수 있다. 같은 인물·동작의 연속성이 필수인데 실제 소스로 충족되지 않을 때 Omni를 검토한다. 실제 사건·실명 인물을 AI로 재현하거나 맥락용 영상에 특정 사건의 증거 역할을 부여하지 않는다. 한 문장을 여러 source-video selection으로 나눌 수 있고, 빈 배경으로 시작하거나 모든 소품을 마지막에 나열하는 기존 형식을 실사 컷에 강제하지 않는다. 레퍼런스의 실사 비중은 관찰값이며 의무 비율이 아니다.

이번 사용자 승인은 대본 고정을 먼저 허용한다. 아래의 과거 '전체 provisional 이후 최종 대본 확정' 순서는 승인된 문구를 다시 쓰거나 재승인을 요구하는 근거가 아니다. 자산·새 reference 문법·style frame·컷·Omni 생성·최종 녹음·picture lock의 별도 승인 범위는 유지한다. 이후 항목과 충돌하면 이 EP001 지시를 우선한다.

> 운영 정본 역할: 이 문서는 제작 단계·manifest·검수 게이트의 유일한 운영 정본이다. 시각 취향은 [[video-style-bible-v0.2]], EP001의 구체 실행 상태는 [[supplementary-investigation-first-video-v0.1]]가 담당한다.

`2030 쉬운정치`의 기본 영상은 정치인을 먼저 평가하는 영상이 아니다. 정치에 관심이 없던 20~30대가 `어제까지 괜찮던 일상이 왜 오늘 불편해졌지?`라고 느끼는 순간에서 시작해, 그 원인이 되는 현행 제도·입법안·개정안·폐지안으로 이동하고, 공식 원문과 실제 민원·회의록·공개 발언을 통해 `무엇이 바뀌며 누가 어떤 역할을 했는가`를 설명하는 8~10분짜리 근거 중심 영상이다. 첫 본편은 보완수사 제도를 이 구조로 설명한다. 구체적인 48컷 설계와 검증 상태는 [[supplementary-investigation-first-video-v0.1]]에 있다.

```text
갑작스러운 생활 불편
  → 지금 논의되는 법·정책
  → 공식 원문
  → 실제 민원·청원·회의 기록
  → 이해관계자와 국회의원의 과거·현재 발언
  → 제도가 바꾸는 실제 절차
  → 확인된 사실 / 주장 / 아직 모르는 결과를 분리한 결론
```

영상의 화면은 다음 네 계층을 섞는다.

1. **증거 화면:** 법률·의안·회의록·기관 발표·원본 발언 영상.
2. **맥락 화면:** 공식 사진·공개 영상·생활 B-roll·건물·장소·사물.
3. **설명 화면:** PNG 컷아웃, 지도, 차트, 문서 강조, 경로 애니메이션.
4. **재구성 화면:** 실제 자료로 오인될 수 없는 명시적 가상 사례나 추상적 장면에 한한 AI 재구성.

이 구분은 `evidence → context → explanation → reconstruction`의 네 계층과 공식 자료 우선 검색 순서를 따른다. Source: [[../concepts/media-acquisition-pipeline]], [[media-source-strategy-v0.1]].

주제는 현재 발의·심사·의결·공포·시행 중인 법률·정책 변화여야 한다. 단순한 정치인 평가, 과거 발언 모음, 당파 논평은 이 기본형의 주제가 아니다. 정치인의 발언·행동은 해당 변화의 결정 경로와 책임 소재를 설명하는 데 필요한 경우에만 연결한다.

영상이 되려면 다음 네 조건을 모두 통과해야 한다.

| 게이트 | 통과 기준 |
|---|---|
| 갑작스러운 생활 마찰 | 돈·시간·이동·안전·직장·주거·교육·신고·서비스 이용처럼 일상 사례로 시작할 수 있음 |
| 현재성 | 공식 자료로 발의·심사·의결·공포·시행 또는 개정·폐지 상태를 확인할 수 있음 |
| 결정 경로 | 누가 제안했고, 어느 기관·위원회·표결·행정 절차를 거치는지 추적 가능 |
| 근거와 화면성 | 공식 원문·회의록·기관 자료와 실제 민원·청원이 있고, 사진·영상·문서·PNG·차트로 보여줄 수 있음 |

생활 마찰만 있고 현재 법·정책과 결정 경로가 확인되지 않으면 보류한다. 기사 언급만 있고 공식 원문이나 화면화할 근거가 없으면 보류한다. 반대로 법안이 있어도 생활 영향과 이해 가능한 화면이 없으면 2030 쉬운정치의 본편으로 만들지 않는다.

## 파이프라인 한눈에 보기

```text
[1. 현재 문제 수집]
  입법·개정·폐지·발의·시행 + 기사화 + 실제 민원·청원
          ↓
[2. 영상 적합성 게이트]
  갑작스러운 생활 마찰 × 결정 경로 × 공식 근거 × 화면화 가능성
          ↓
[3. 근거 잠금]
  법안·조문·회의록·기관 자료·민원·발언의 상태와 출처 ID 확정
          ↓
[4. 스토리라인 스파인]
  PPT처럼 소재의 순서, 질문, 전환, 컷별 시청자 이해 목표만 작성
          ↓
[5. 임시 대본·provisional 타이밍]
  컷별 임시 문장 × 사용자 실측 발화속도로 예상 발화·hold 계산
          ↓
[6. 컷 카드·제작 모드 라우팅]
  한 컷의 목적·소재·매체·자산·모션·provisional 프레임·다음 전환
  실제 자료 / 가상 Omni / 설명 Remotion 중 하나 결정
          ↓
[7. 실제 자산 수급·컷 프리뷰 제작]
  실제 사진·영상·PNG·문서·차트 배치 + Omni 컷은 imagegen 키프레임만 생성
  빈 asset 금지; effect는 필요 여부와 실제 파일을 명시
          ↓
[8. 48컷 개별 검수]
  사용자가 모든 컷을 보고 컷별 PASS/반려; 48/48 PASS 전 Omni MP4 금지
          ↓
[9. Omni 영상 생성·전체 provisional 조립]
  PASS된 imagegen 키프레임만 Gemini/Omni 영상화 → 전체 컷 조립
          ↓
[10. 전체 provisional 영상 검수]
  사용자가 완성 흐름·행동·자료·가독성·컷 길이를 다시 승인 또는 반려
          ↓
[11. 최종 대본·사용자 녹음]
  승인된 화면과 잠긴 근거에 맞춰 대본 확정 → 사용자 final VO
          ↓
[12. 음성 재타이밍·picture lock]
  ffprobe 실측 → 컷·모션 재조정 → 사실·권리·AI 표시·최종 렌더 QC
```

이 채널의 기획 원본은 **PPT처럼 구성한 스토리라인 덱**이다. 덱에는 어떤 소재를 어떤 순서로 보여줄지, 각 컷이 시청자에게 무엇을 이해시키는지, 어떤 자료를 쓸지 기록한다. 자료와 스토리라인이 잠기면 컷별 임시 대본과 사용자가 제공한 실측 발화속도로 provisional 프레임을 계산한다. 먼저 실제 사진·영상·Remotion 자산과 Omni용 imagegen 키프레임만으로 48개 컷 프리뷰를 만들고, 사용자가 모든 컷을 개별 PASS한 뒤에만 Omni MP4를 생성한다. 그 결과를 조립한 전체 provisional 영상을 다시 사용자가 승인한 뒤 최종 대본을 확정·녹음한다. 측정된 final 음성은 이미 승인된 화면의 reveal·hold·전환을 재타이밍하는 최종 시간축이다. scratch 녹음은 선택 사항이며 제작 선행 조건이 아니다. 음성은 잠긴 근거와 스토리라인 밖의 사실·주장을 추가할 수 없다. Source: [asset workflow](../sources/mo-sidd-remotion-production-series.md#repeated-production-method), [Vox scene contract](../sources/vox-style-claude-remotion-reference.md#observed-production-grammar).

기계 상태는 다음 순서로만 승격한다.

```text
timing-draft
→ cut-previews-ready          # 48컷 실제 자산·Omni imagegen 키프레임, Omni MP4 없음
→ cut-review-approved        # 사용자 48/48 개별 PASS, Omni 생성 허용
→ provisional-video-ready    # PASS된 Omni MP4를 포함한 전체 시안 준비
→ visual-review-approved     # 사용자가 전체 시안 승인
→ script-locked
→ final-voice-locked
→ audio-timed-assembly
→ picture-locked
```

### 비활성 캘리브레이션 기준선 수용

사용자가 비활성 style-calibration 후보의 시각 방향을 수용한 경우에는 별도의 `visual_baseline_acceptance` 기록을 남길 수 있다. 이 기록은 사용자가 실제로 검토한 review bundle, manifest, runtime, animatic, mobile still, contact sheet의 SHA-256을 정확히 결속해야 하며, 예시는 [SH003 v08 acceptance metadata](../../video/qa/style-calibration/episode-001-sh003-assembly-set-v08/assembly-set-manifest-metadata-v08.json)와 [SH003 v08 manifest](../../video/public/assets/style-calibration/episode-001-sh003-assembly-set-v08/cuts/SH003/manifest.json)에 있다. 이는 시각 방향을 기준선으로 수용하고 후속 설계를 허용하는 기록일 뿐, `review.user_pass`, `playable_cut`, episode cut-review marker, 권리 승인, production stage, active cut root 또는 Omni 생성 권한을 설정하지 않는다. [episode production state](../../video/episodes/episode-001/production-state.json)는 그대로 유지한다.

결속된 파일 하나라도 교체·수정되어 SHA-256이 달라지면 기준선 수용은 즉시 무효화된다. 이 기준선을 실제 제작으로 승격하려면 active manifest와 materialized asset ledger, 파일별 권리·출처 확인, 해당 모드의 runtime 검증, 인접 컷 transition pair 및 전체 검수 산출물을 다시 확인해야 한다. 이전 기준선을 재사용할 때도 파일·manifest·runtime의 동일성을 fresh 또는 carried-forward identity check로 증명해야 하며, 단순히 같은 버전명이나 과거 수용 문장만으로 승격할 수 없다. Source: [SH003 v08 acceptance metadata](../../video/qa/style-calibration/episode-001-sh003-assembly-set-v08/assembly-set-manifest-metadata-v08.json), [SH003 v08 manifest](../../video/public/assets/style-calibration/episode-001-sh003-assembly-set-v08/cuts/SH003/manifest.json), [episode production state](../../video/episodes/episode-001/production-state.json).

## 1. 이슈 후보 수집과 주제 승인

매일 수집하는 후보는 `현재 발의·심사·의결·공포·시행·개정·폐지` 상태의 정책과 법안이다. 동시에 뉴스의 반복 쟁점, 국민신문고·지자체·기관 민원에서 드러난 불편, 국회 청원·회의록의 문제 제기를 모아 `생활 마찰 후보`로 만든다. 민원과 법안의 연결은 자동으로 확정하지 않고 `candidate → reviewed → source-locked` 상태로 승격한다. 정책·민원 연결의 보수적 상태 규칙과 국회 의안 저장은 기존 수집 구현과 테스트를 따른다. Source: [policy collector](../../src/lib/policy-collector.ts), [collector tests](../../tests/policy-collector.test.mjs), [Assembly minutes route](../sources/assembly-minutes.md).

주제 점수는 다음 네 질문으로 판단한다.

| 질문 | 통과 기준 |
|---|---|
| 지금 바뀌고 있는가? | 발의·심사·의결·공포·시행 중 하나를 공식 자료로 확인 |
| 일상 언어로 시작할 수 있는가? | 돈·시간·이동·안전·직장·주거·교육·신고 등 구체적 불편으로 번역 가능 |
| 실제 반응이 있는가? | 민원·청원·회의 발언·기관 설명 중 하나 이상 존재 |
| 8~10분 안에 설명 가능한가? | 핵심 인과 경로가 충분한 짧은 컷으로 전개되며 확인 불가능한 추측에 의존하지 않음 |

기사는 주제를 발견하고 쟁점을 비교하는 데 사용한다. 최종 사실 문장은 기사만으로 잠그지 않고 법률·의안·회의록·기관 원문으로 다시 확인한다.

## 2. 근거 잠금과 스토리라인 스파인

대본은 자료와 스토리라인 뒤에 두 단계로 작성한다. 먼저 영상이 확인하려는 질문과 근거의 상태를 잠근 뒤 이를 PPT식 스토리라인으로 배열하고, 컷 길이 계산용 보수적인 **임시 대본**을 붙인다. 임시 대본과 사용자의 실측 발화속도로 컷 프리뷰를 만들고 48/48 개별 PASS를 받은 뒤 Omni 영상을 생성·조립한다. 사용자가 전체 provisional 영상까지 승인하면 최종 대본을 작성한다. 근거 표는 발화 문장을 저장하는 곳이 아니라 화면과 설명이 의존하는 사실·자료의 원장이다.

| 필드 | 의미 |
|---|---|
| `claim_id` | 영상에서 확인할 사실·관계·상태의 영구 ID |
| `claim_summary` | 한 문장으로 요약한 확인 대상; 최종 대사가 아님 |
| `evidence_state` | `confirmed / institution-reported / political-claim / inference / reconstruction / unknown` |
| `source_ids` | 법률·의안·회의록·민원·사진·영상의 출처 ID |
| `context_before_after` | 발언·인용·수치의 앞뒤 문맥 |
| `visual_proof` | 화면에 실제로 보여줄 문서·사진·영상·차트·PNG |
| `legal_review_note` | 명예훼손·선거법·저작권 검토 메모 |

스토리라인 스파인은 `생활의 질문 → 지금 바뀌는 것 → 결정 경로 → 실제 자료 → 제도가 바꾸는 절차 → 확인된 범위와 남은 불확실성`의 순서로 쓴다. 각 단계에는 `왜 지금 이 화면을 보여주는가`와 `다음 컷에서 무엇이 달라지는가`를 적고, 자료가 잠긴 뒤에는 한 컷당 한두 문장의 임시 타이밍 대본을 붙인다. 이 문장과 실측 발화속도로 만든 컷 프리뷰와 전체 provisional 영상은 최종 대본의 시각적 초안이다. 컷별 PASS와 전체 영상 승인은 별도 기록이며, 둘 다 끝난 뒤 문장·사실·컷 순서를 잠근다. 음성이 근거 잠금과 스토리라인에 없는 주장을 추가하지 않는 원칙은 유지한다.

PPT 덱의 한 페이지 또는 한 보드는 하나의 컷 카드에 대응한다. 덱에는 썸네일, 화면 요소의 위치·크기, 출처 ID, 예상 프레임 범위, 매체 선택과 임시 대본을 기록한다. Remotion은 먼저 발화속도 기반 provisional 프레임으로 카드를 구현하고, 최종 녹음 뒤에는 측정된 final VO의 단어·문장 시점에 맞춰 같은 카드의 프레임을 재조정한다. Source: [Vox scene grammar](../sources/vox-style-claude-remotion-reference.md#observed-production-grammar), [MoSidd frame workflow](../sources/mo-sidd-remotion-production-series.md#4-tune-in-frames-and-props).

## 3. 컷 카드와 컷 계약

한 컷은 PPT 덱의 한 카드이며, 하나의 시청자 이해 목표와 하나의 주인공 오브젝트를 가진다. 카드와 근거가 먼저지만, 음성 없는 무음 컷을 완성한 뒤 대본을 붙이지 않는다. 아래 카드와 컷별 timing script가 함께 계획 원본이다.

| 필드 | 컷 카드에 적을 내용 |
|---|---|
| `cut_id` | `EP001-SH001` 형식 |
| `purpose` | 이 컷의 역할과 시청자에게 남겨야 할 한 가지 takeaway |
| `subject_material` | 인물·문서·숫자·사물·절차·관계 중 화면의 주제 |
| `production_mode` | `source-photo / source-video / omni / remotion` 중 하나 |
| `required_sources` | 사실 근거, 원본 URL, 회의·문서 위치, 권리 상태 |
| `required_assets` | 배경·PNG·실제 사진/영상·Omni 입력/출력·차트 데이터·효과 파일 |
| `visual_action` | 등장, 이동, 확대, 마스크, 차트 공개, 강조, 카메라 경로 |
| `duration_frames` | 임시 대본×실측 발화속도로 계산한 provisional 30fps 컷 길이와 `background_only/reveal/final_hold` 범위; final VO 측정 뒤 확정 |
| `final_composition` | 마지막 프레임에 보여야 하는 모든 asset/effect와 위치·크기 |
| `next_transition` | 다음 컷으로 넘어가는 의미와 방식: hard/match/mask/whip 등 |
| `ai_disclosure` | Omni·생성 이미지가 있으면 `AI 재구성·가상 사례`와 도구·생성일 |

카드 작성 순서는 `purpose → subject_material → required_sources → production_mode → required_assets → visual_action → duration_frames → final_composition → next_transition`이다. 먼저 보여줄 소재와 이해 목표를 결정한 뒤 적합한 매체를 배치한다. 배경·중경·전경이 모두 격하게 움직이지 않고 주인공 오브젝트 하나만 적극적으로 움직이는 원칙은 유지한다. 3계층 자산과 장면별 제어의 근거는 [layered editorial assets](../sources/vox-style-claude-remotion-reference.md#observed-production-grammar)와 [MoSidd asset sheet](../sources/mo-sidd-remotion-production-series.md#2-build-a-master-asset-sheet-before-animation)에 있다.

EP001부터 [episode-spec.json](../../video/episodes/episode-001/episode-spec.json)만 machine-readable 수동 편집 권한이다. `narration-plan / cut-plan / cut-source-design / generated manifest-contracts`는 [generator](../../video/scripts/generate-episode-001-plans.mjs)가 만드는 호환 출력이며 동일한 spec SHA-256과 generated marker가 없거나 byte drift가 생기면 [spec validator](../../video/scripts/validate-episode-spec.mjs)가 실패한다. spec은 `viewer_takeaway`, `usage_layer`, 임시 대본·source ID·mode, 수급 route, 원본 보존, 독립 derivative·사람 검수 segmentation, requirement blocker, visual beat, transition과 fallback을 한 컷 안에 둔다. 새 변경은 spec만 수정한 뒤 `pnpm run video:generate-plans`를 실행한다. 새 active cut은 CutManifest v3이어야 하며 `source_spec_sha256`, `source_cut_sha256`, `manifest_contract_sha256`이 generated contract와 일치해야 한다. planned operator를 runtime 구현으로 바꾸거나 source requirement를 approved로 바꿀 때도 실제 operator target/capability와 approved media_asset materialization ledger가 없으면 active validation을 통과하지 못한다.

`production-state.json`의 stage·PASS·active root는 상태 권한으로 보존하지만 `draft_inputs.episode_spec_sha256`과 `narration_generated_source_sha256`은 수동 편집 필드가 아니다. `pnpm run video:generate-plans` 한 번이 네 compatibility output과 이 두 derived hash를 함께 갱신한다. transparent derivative requirement는 정확히 하나의 presentation component에 결속되어야 하며, 승인 시 source original뿐 아니라 ledger의 정확한 derivative asset ID·로컬 경로·SHA-256·실제 alpha 통계·derivation input provenance까지 일치해야 한다. `asset_requirement_id`는 계획/승인 requirement를 추적하는 키이고, `asset_id`는 materializer와 Manifest v3가 실제 파일을 식별하는 별도 키다. 둘을 같은 값으로 대체하지 않는다.

각 beat는 narration window, 정확히 하나의 focal과 slot, supporting/hidden, component visibility states, observable runtime motion, 60프레임 이상 stable reading hold를 선언한다. 과거 법률 컷의 overview·normalized crop·raster quote 경로는 현재 production에 사용할 수 없다. 법률 capture/crop은 화면 밖 evidence로만 결속하고, 사람이 원문을 대조한 정확한 문구는 `transcription_pending`을 해제한 뒤 raster-free native DOM/vector surface에 1080p 72px 이상·2줄 이하로 조판한다. document motion과 reading hold는 겹치지 않으며 approved input이 없으면 계속 blocked다.

## 4. 사진·문서·영상 수급 루트

| 필요 자산 | 1차 루트 | 2차 루트 | 현재 상태 | 사용 규칙 |
|---|---|---|---|---|
| 법률·개정 원문 | 국가법령정보센터·국민참여입법센터 | 소관 부처 원문 | 수집·수동 검토 병행 | 조문 번호·기준일·전후 문맥 표시 |
| 의안·발의·심사 | 열린국회정보·국회 의안정보 | 국회 회의록 | 구현됨 | 법안 상태를 시행 사실로 추정하지 않음 |
| 국회 발언 | 열린국회 회의 메타데이터 + 회의록 뷰어 발언 HTML | 공식 VOD 수동 확보 | 회의록 구현, VOD 자동 수집 미구현 | 발언자·회의명·날짜·앞뒤 문맥 검수 |
| 국회의원 사진 | 국회 공식 공개 사진 후보 | Wikimedia Commons | 후보 수집 구현 | 인물 동일성과 파일별 사용 조건 검토 |
| 정부·공공 사진·영상 | KOGL CSV, 공공데이터 디지털문화 | KTV·국가기록원 | KOGL 구현, 디지털문화 재시도 필요, 국가기록원 승인 필요 | 공공누리 유형을 파일별 확인 |
| 생활 B-roll | Pexels 사진·영상 | 직접 촬영·Wikimedia Commons | 구현됨 | 증거가 아니라 상황 설명용으로만 사용 |
| 역사·장소·인물 | Wikimedia Commons | Library of Congress | 구현됨 | 제작자·라이선스·원본 URL 보존 |
| 우주·미국 공공자료 | NASA·Library of Congress | Wikimedia Commons | 구현됨 | 주제에 맞을 때만 사용 |
| 뉴스 스크랩 | 원 기사 URL·스크린샷·수동 클립 | 동일 사건의 공식 원문 | 수동 | 기사 자체를 논할 때 필요한 부분만 사용 |
| 없는 장면·추상 과정 | imagegen 스틸 → Google 이미지→영상 | Remotion 정지 이미지 모션 | 수동 제작 | 실제 증거로 사용하지 않고 행동 플레이트 바깥에 `AI 재구성` 고지 |

Pexels, Wikimedia Commons, NASA, Library of Congress, KOGL의 사진·원본 영상 어댑터는 로컬 미디어 저장소와 출처 메타데이터에 연결되어 있다. 후보는 자동 승인되지 않고 권리 검토 상태로 남는다. Source: [[../sources/reusable-media-libraries]], [still implementation](../../raw/sources/keyless-media-implementation-2026-08-22.md), [video implementation](../../raw/sources/keyless-video-implementation-2026-08-22.md), [KOGL verification](../../raw/sources/kogl-and-loc-live-verification-2026-08-23.md).

수집 호출의 구현 위치는 `src/app/actions.ts`이며 Pexels 사진·영상, Wikimedia/NASA/LOC 사진·영상, KOGL 사진·영상, 디지털문화, 국회 사진·회의록·의안을 각각 별도 action으로 실행한다. Source: [actions implementation](../../src/app/actions.ts), [collector modules](../../src/lib/).

## 5. 컷 소재에 따른 제작 모드 결정

제작 도구보다 먼저 컷의 소재가 `실제`인지 `가상`인지 `설명`인지 분류한다. 아래 결정 순서는 23jung의 내부 편집 규칙이다.

```text
1. 실제 인물·실제 사건·실제 행동·실제 발언인가?
   ├─ 적합한 실제 사진·영상이 있다
   │    → 실제 사진·영상 사용
   └─ 적합한 실제 자료가 없다
        → Omni로 실제 장면을 재현하지 않음
        → 공식 문서·지도·타임라인·실루엣·PNG를 Remotion으로 설명

2. 처음부터 가상이라고 밝히는 사건·사례·소재인가?
   └─ 예 → imagegen 키프레임 → 48컷 사용자 PASS → Gemini Omni/Veo AI 영상
             + 행동 플레이트 바깥 AI 재구성 고지

3. 그 밖의 문서·숫자·절차·관계·비교 설명인가?
   └─ Remotion 모션그래픽

4. 모든 경로의 최종 조립·출처·자막·음향
   └─ Remotion
```

| 소재의 성격 | 주 제작 모드 | 사용 예 | 금지·주의 |
|---|---|---|---|
| 실제 인물 | `source-photo` 또는 `source-video` | 국회의원 공식 사진, 인터뷰, 본회의 발언 | 닮은 AI 인물로 대체하지 않음 |
| 실제 사건·현장·행동 | `source-video` 우선, 없으면 `source-photo` | 시위, 회의, 발표, 정책 시행 현장 | 실제 자료가 없다는 이유로 Omni 재현 금지 |
| 실제 발언 | 원본 영상 또는 공식 회의록 + Remotion | 발언 클립, 회의록 문장 강조 | 음성·입 모양·표정을 AI로 만들지 않음 |
| 명시적인 가상 사건·가상 생활 사례 | `omni` | 가상의 송금 피해, 가상의 신고 상황, 추상적 미래 장면 | 먼저 imagegen 키프레임만 검수. 전체 컷 PASS 전 MP4 생성 금지. 이후 행동 플레이트 바깥의 `AI 재구성 · 가상 사례` 고지와 프롬프트 보존 필수 |
| 공식 문서·숫자·날짜 | `remotion` | 조문, 의안 타임라인, 청원 수, 비교 차트 | 생성 이미지에 문장·숫자를 맡기지 않음 |
| 제도·절차·인과관계 | `remotion` | 검사→요구서→수사기관 경로 | 실제 현장처럼 오인될 AI 재현을 사용하지 않음 |
| 일반적 분위기·장소 | 적합한 실제 B-roll이 있으면 `source-video`, 아니면 `remotion` | 출근길, 주거지, 휴대전화 사용 | 특정 실제 사건의 현장인 것처럼 연결하지 않음 |

`plate`는 화면 합성 방식이고 `production_mode`는 소재의 사실성에 따른 편집 결정이다. 실제 사진을 Remotion으로 확대·이동해도 주 제작 모드는 `source-photo`이며, Omni MP4를 Remotion에서 순서·trim·전환으로 조립해도 주 제작 모드는 `omni`다. 한 컷의 `manifest.json`에는 주 제작 모드 하나를 기록하고, 함께 사용한 자료는 `assets` 배열에 출처와 레이어 순서대로 기록한다.

수집 DB의 `media_assets`는 production asset이 아니다. EP001 현재 15개는 모두 웹페이지 captured-page 후보이며 `data/raw` 파일도 registry 캡처의 byte-identical 보존 사본이지 법령·법안·기사의 원본 문서 파일이 아니다. URL·capture provenance·license·attribution·hash·허용 사용 범위를 사람이 확인해 승인한 항목만 materializer가 읽는다. 승인된 capture surface를 컷의 `source-photo/`에 byte-identical하게 복사하는 것과 crop·cutout·retype을 파생하는 것은 별도 작업이다. 파생물마다 별도 asset ID, source path/hash, 실행된 recipe/hash, output path/hash와 사람 검수가 있어야 하며, 실행 전에는 이 값들을 미리 확정하지 않는다. 하나의 납작한 screenshot 내부 대상을 이름만 달리해 여러 독립 render target으로 가장할 수 없다. Source: [DB queue](../../src/lib/db.ts), [review workflow](../../src/lib/graph.ts), [media materializer](../../src/lib/video-asset-materializer.ts), [source review](../../video/qa/source-review/episode-001-v01/manifest.json), [manifest schema](../../video/src/cut-manifest.ts).

파생 route는 사람이 확인한 동일 크기 alpha mask 또는 provider·note가 있는 외부 transparent PNG만 받는다. 자동 품질 승인을 주장하지 않으며 원본·분리 입력·파생 SHA-256, alpha/decode 상태, URL, license, attribution, graph source ID를 기록한다. 파생 완료 상태 `asset-ready-presentation-pending`은 컷 완료가 아니다. 다음 단계에서 `focal/support/hidden → semantic layout → component states → runtime motion → 360×203 QA`에 결속해야 한다. Cutout을 `documentary-evidence`로 지정하거나 승인되지 않은 DB 후보, raw root 밖의 파일, hash drift, 불투명/완전 투명 PNG를 가져오는 작업은 실패한다. Source: [CLI request example](../../video/materialize-media.request.example.json), [cut validator](../../video/scripts/validate-cut-assets.mjs), [tests](../../tests/video-asset-materializer.test.mjs).

설명용 자산도 source와 asset을 같은 것으로 취급하지 않는다. source는 사실·관계·맥락을 잠그는 근거이고, asset은 그 근거에서 뽑은 `semantic_summary`를 `visual_translation`으로 바꿔 화면에서 움직일 수 있게 만든 표현물이다. 웹페이지·문서 캡처와 crop은 evidence/provenance-only이며 production pixel이 될 수 없다. Imagegen을 쓰는 경우 요약은 **이미지에 표시할 문장**이 아니라 프롬프트의 제작 의도다. 프롬프트는 요약을 사건기록·증거 인계·검토 도구·요구 접수·결과 통지 같은 구체적인 글자 없는 사물이나 장면으로 번역해야 한다. 빈 종이·빈 카드처럼 의미가 없는 대체물, 캡처 재사용, Imagegen PNG 옆이나 위에 설명문을 타이핑해 의미를 보충하는 우회는 금지한다. Source: [source/asset lineage contract](../../video/contracts/source-asset-lineage-v1.schema.json), [EP001 vertical slice](../../video/contracts/episode-001-vox-vertical-slice-v1.json), [locked Vox grammar](../sources/vox-style-claude-remotion-reference.md#observed-production-grammar).

### 신규 후보의 imagegen 사용 범위(Manifest `asset_origin_policy` v1)

독립 합성 자산에는 실제·공식 source-derived 자산과 source-derived Imagegen editorial reconstruction을 모두 허용하되 역할을 혼동하지 않는다. 후자는 `source_ids/path/SHA-256 → semantic_summary → visual_translation → exact prompt/avoid list → output`을 결속하고 `origin=imagegen-editorial-reconstruction`, `evidence=false`, `ai_disclosure=true`를 선언한다. 결과 픽셀에는 읽을 수 있는 텍스트·인명·날짜·숫자·로고·UI·워터마크가 없어야 한다. 실명 정치인·공무원·피해자·목격자 등 식별 가능한 실존 인물은 계속 실제/공식 source만 사용한다. 사실·법률 문구는 허용된 `asset-label`·`surface-content`·`screen-chrome` 역할에서만 다루며 Imagegen PNG에 합성하지 않는다. 서로 다르게 움직일 문서·증거·경로·소품은 처음부터 별도 asset과 render target으로 만든다. 투명 alpha는 선택한 표현이 독립 cutout일 때만 필수이고 불투명 plate에는 일괄 강제하지 않는다. 자동 검사는 선언과 바이트 결속만 확인하므로 사람의 의미 대응·픽셀·권리·분해 검수가 필수다. Source: [source/asset lineage schema](../../video/contracts/source-asset-lineage-v1.schema.json), [vertical-slice validator](../../video/scripts/validate-episode-001-vox-vertical-slice.mjs).

국회 본회의장처럼 반복 사용해야 하는 공간은 `designed-asset` route로 별도 관리하되, 직접 제작 방식은 역사 자료로만 유지한다. 신규 production PNG는 승인된 국회 공식 사진 또는 권리가 기록된 실사 자료에서 독립 레이어로 파생해야 하며, 원본 URL·license·source ID·파생 mask와 SHA-256을 결속한다. `provenance.type=self-created`인 챔버·건물·실내 PNG는 새 후보의 promotion authority가 될 수 없다. SH003 v08은 이 2.5D 챔버와 독립 PNG를 구현한 비활성 시각 레이아웃 기준선이며, 비인물 자산을 실사·공식 source로 교체하기 전에는 승격하지 않는다. 후면 벽·배석·의장석·연단·책상·마이크·발언자 토큰·개념 오브젝트는 이 source-derived 독립 레이어 원칙으로 관리한다. 공식 국회 VOD는 발언자·시간코드·자막을 확인하는 metadata-only evidence로만 남긴다. 실제 VOD 프레임·음성·영상은 materialize하지 않는다. SH003→SH004 특수 pair와 standalone 구현은 역사 자료로만 보존하며, 현재 렌더 권한은 [단일 EpisodeTimeline 절](#2026-08-27-단일-렌더-권한)의 catalog-derived window다. Source: [SH003 v08 manifest](../../video/public/assets/style-calibration/episode-001-sh003-assembly-set-v08/cuts/SH003/manifest.json), [SH003 v08 metadata](../../video/qa/style-calibration/episode-001-sh003-assembly-set-v08/assembly-set-manifest-metadata-v08.json), [SH003 국회 VOD 원본 확인](../../raw/sources/episode-001-sh003-assembly-vod-2026-08-26.md), [episode spec](../../video/episodes/episode-001/episode-spec.json), [episode spec validator](../../video/scripts/validate-episode-spec.mjs).

SH004 v01은 같은 Manifest v3/presentation v2 계약으로 사건파일에서 두 중립 경로를 보여준 **역사적** 148프레임 캘리브레이션 후보다. 현재 단계의 SH004 검수는 standalone 산출물과 별도 pair를 비교하는 작업이 아니라, [현재 render catalog](../../video/episodes/episode-001/generated/render-catalog.json)가 선언한 `EP001-Cut-SH004-Provisional` window와 `EP001-Boundary-SH003-SH004-Provisional` window를 같은 EpisodeTimeline에서 검수하는 작업이다. Source: [historical SH004 manifest](../../video/public/assets/style-calibration/episode-001-sh004-two-route-v01/cuts/SH004/manifest.json), [historical SH004 metadata](../../video/qa/style-calibration/episode-001-sh004-two-route-v01/assembly-set-manifest-metadata-v01.json), [current production state](../../video/episodes/episode-001/production-state.json).

모든 컷은 먼저 고정 체크 `background.png`를 렌더한다. 실제 사진·영상과 Omni 영상은 배경을 대체하는 파일이 아니라 그 위에 올라가는 plate다. 실제 자료에는 필요한 공식 문서·숫자·출처를 Remotion으로 합성할 수 있지만, AI 행동 플레이트에는 설명 요소를 얹지 않는다. AI 고지는 인접 전환·크레딧·게시 설명 중 승인된 위치에 둔다. 고정 배경과 제작 모드 분리는 23jung의 내부 제작 결정이다.

## 6. imagegen → Google Omni/Gemini → Remotion 경로

사용자가 `Google Omni`라고 부른 제작 경로는 Google의 현재 공식 명칭인 **Gemini Omni**와 Gemini 앱의 영상 생성 기능을 가리키는 것으로 기록한다. Google은 Gemini Omni가 이미지·텍스트·영상·오디오 참조를 다룬다고 설명하고, Gemini 앱 도움말은 이미지나 영상을 업로드해 영상을 생성하는 절차를 안내한다. Veo도 이미지→영상과 참조 이미지 기반 생성을 공식 지원한다. Source: [Gemini Omni](https://deepmind.google/models/gemini-omni/), [Gemini Apps video help](https://support.google.com/gemini/answer/16126339), [Veo](https://deepmind.google/technologies/veo/). Verified: 2026-08-24.

이 저장소에서는 아직 Google 생성 API나 브라우저 자동화가 구현되어 있지 않다. 따라서 현재 운영 상태는 **로그인된 Gemini/Flow에서 사람이 생성하고 결과를 다시 프로젝트에 넣는 수동 단계**다. 이 상태를 `자동 수급 루트 확보`로 표시하지 않는다. Source: [current video workflow note](../../video/README.md), repository audit 2026-08-24.

수동 생성 절차는 **키프레임 검수 단계**와 **승인 후 영상 생성 단계**로 분리한다.

1. 장면의 첫 프레임을 imagegen으로 16:9 또는 필요한 컷아웃 RGBA PNG로 만든다.
2. 사람·건물·소품이 따로 움직여야 하면 한 장에 합치지 말고 각각 투명 PNG로 분리한다.
3. 시작·끝 모양이 중요한 행동은 end frame도 만들고, `omni/`에는 이 imagegen PNG와 프롬프트·연속성 기록만 둔다. 이 단계에서는 `output.mp4`를 만들거나 가져오거나 manifest에 참조하지 않는다.
4. Remotion 컷과 실제 사진·영상 컷을 실제 로컬 자산으로 구현한 뒤, Omni 키프레임을 포함한 SH001~SH048 전체 contact sheet를 사용자가 컷별로 검수한다.
5. 모든 컷의 manifest가 `review.user_pass: true`이고 에피소드의 48/48 PASS marker가 기록된 경우에만 Omni 영상 생성을 허용한다.
6. PASS된 명시적 가상 사건·생활 사례 키프레임 중 자연스러운 카메라나 환경 움직임이 필요한 컷만 Gemini Omni 또는 Veo에 넣는다.
7. 프롬프트에는 `카메라`, `주체의 작은 움직임`, `변하지 않아야 할 요소`, `길이`, `금지 요소`를 구분해 기록한다.
8. 생성 결과 MP4와 입력 PNG, 최종 프롬프트, 생성일, 사용 계정/도구명, PASS marker를 같은 asset record에 저장한다.
9. 생성 MP4는 증거가 아닌 `reconstruction` 또는 `context` 비디오 플레이트로만 사용한다.
10. Remotion에서는 생성 영상을 순서·trim·전환으로만 조립한다. 설명 자막·공식 문서·숫자·화살표를 행동 플레이트 위에 합성하지 않고, AI 고지는 플레이트 바깥의 승인된 위치에 둔다.
11. 인물 얼굴·손·건물 형태가 컷 중간에 변형되면 폐기하거나 짧게 잘라 사용한다.

실존 인물·실제 사건·실제 발언은 Omni 입력 소재로 사용해 재현하지 않는다. 적합한 실제 사진·영상이 없으면 그 부재를 숨기지 않고, 확인된 문서·지도·타임라인·절차 그래픽을 Remotion으로 제작한다. Omni는 `실제로 있었던 장면처럼 보이는 대체 증거`가 아니라 처음부터 가상임을 밝힌 설명 장면에만 사용한다. 이 제한은 23jung의 내부 편집 규칙이다.

AI 생성 결과는 사실을 입증하지 않는다. 실제처럼 보일 수 있는 가상 재구성에는 행동 플레이트 바깥에 `AI 재구성 · 설명용 가상 사례`를 고지하고, 원본 프롬프트와 날짜를 보존한다. Source: [[../sources/ai-visual-production-tools]].

### 행동 중심 AI 영상 계약

AI 가상 사례는 설명문을 얹은 한 장짜리 영상이 아니라 **행동이 하나씩 완결되는 여러 짧은 클립**으로 제작한다. Google은 짧은 영상 하나에 서로 다른 사건을 연쇄시키지 말고 한 프롬프트를 한 장면에 집중하도록 권장하며, image-to-video에서는 입력 이미지에 이미 있는 인물·공간·스타일을 반복 설명하지 않고 카메라·주체·환경의 움직임에 집중하라고 안내한다. Source: [Google video best practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice), [[../sources/action-driven-ai-video-generation]].

- `한 프롬프트 = 한 행동 비트`다. 하나의 이야기에는 여러 AI 행동 클립이 들어갈 수 있다.
- 모든 행동 클립은 imagegen 키프레임 PASS가 선행 조건이다. 다른 컷 하나라도 반려·미검수이면 에피소드의 Omni MP4 생성은 계속 차단한다.
- AI 행동 플레이트 위에는 설명 자막, keyword box, 화살표, callout, 문장형 부연설명을 올리지 않는다.
- 행동의 문법은 `목표 → 실행 → 보이는 결과 → 반응 → 실패한 회복 시도`다. 소리를 끄고 봐도 사건이 읽혀야 한다.
- 휴대전화 화면은 상품 사진·통화 아이콘·실패 상태처럼 기호로만 이해되어야 한다. 생성된 문자나 숫자를 사실 또는 서사의 핵심으로 사용하지 않는다.
- imagegen 전에 인물·의상·휴대전화·상자·공간·조명의 continuity pack을 잠근다. 이후 행동 프레임은 이 참조를 편집·재사용해 만든다. OpenAI는 다중 참조 이미지와 multi-turn image editing을 지원한다. Source: [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation).
- 각 행동 클립에 최소 start frame 하나를 둔다. 잘못된 물건 공개·차단 상태처럼 마지막 모양이 중요한 행동은 end frame도 별도로 만든다. Google Flow는 start/end frame 사이의 행동을 지정하고 생성 영상의 프레임을 다음 generation의 참조로 저장할 수 있다. Source: [Google Flow create video](https://support.google.com/flow/answer/16353334), [Flow scene editing](https://support.google.com/labs/answer/16935718).
- motion prompt는 `주체 행동`, `카메라`, `환경 움직임`, `끝 자세`만 지시한다. 이미지에 이미 있는 외모·가구·광원을 다시 서술하지 않는다.
- negative prompt에는 설명문이 아니라 배제할 대상을 나열한다: `captions, subtitles, readable text, logos, watermarks, identity change, wardrobe change, new objects, malformed hands, unintended cut`.
- AI임을 알리는 투명성 정보는 asset record에 항상 보존한다. 시청자 고지는 행동을 설명하는 레이어로 쓰지 않고, 행동 플레이트 바깥의 전환·크레딧·게시 설명 중 승인된 위치에 둔다.
- Remotion은 행동을 대신 설명하지 않고 승인된 클립의 정확한 순서·trim·match cut·morph·sound를 조립한다. `TransitionSeries`는 전환 길이만큼 인접 클립이 겹쳐 총 길이가 줄어드므로 마스터 프레임을 다시 계산한다. Source: [Remotion TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries).

행동 클립마다 `story_state_before`, `story_state_after`, start/end frame, 참조 이미지, motion/negative prompt, tool/model/date, 승인한 첫·중간·마지막 프레임과 QC 결과를 저장한다. 세부 연구와 SH001 예시는 [[../sources/action-driven-ai-video-generation]]을 따른다.

## 7. 자산 저장과 출처 기록

### 컷 폴더 의무 규칙

영상 하나를 만들 때 컷마다 독립 폴더를 만든다. `background.png`는 선택 사항이 아니며 모든 `SH###` 폴더에 실제 파일로 존재해야 한다. 공용 파일을 직접 참조하는 대신 동일 파일을 각 컷에 복사하여 컷 폴더만으로 장면을 재현하고 자동 검증할 수 있게 한다.

고정 배경 규격:

- 1920×1080 PNG, 불투명 RGB
- 따뜻한 흰색 바탕과 저대비 베이지 정사각 체크
- 텍스트·로고·그라데이션·비네트·사물 없음
- 기준 파일: [shared background](../../video/public/assets/shared/paper-beige-check.png)
- 컷 템플릿: [cut template](../../video/public/assets/_cut-template/)

실제 폴더 구조:

```text
video/public/assets/episode-001/
  cuts/
   SH001/
    background.png   # 필수 고정 파일; 가장 아래에서 항상 렌더
    manifest.json
    asset-sheet.json       # Remotion/source 컷의 구현 공간 계약
     assets/          # Remotion 컷의 실제 로컬 인물·건물·문서·소품 PNG/SVG
    remotion/        # Remotion 코드·보조 데이터/SVG
     omni/            # PASS 전 imagegen PNG·프롬프트만; 48/48 PASS 뒤 출력 MP4
    source-photo/    # 실제·공식 사진과 출처 메타데이터
    source-video/    # 실제·공식 영상과 인·아웃 타임코드
     effects/         # effects_required=true일 때만 만들고 실제 효과 파일 저장
    audio/           # 해당 컷의 VO·Foley
    preview/         # 컷 검수 스틸·저해상도 프리뷰
```

새 컷은 다음 명령으로 만든다. 기존 폴더는 덮어쓰지 않는다. 이 명령은 `episode-001`과 spec에 존재하는 `SH###`만 허용하고, 현재 `episode-spec.json`과 여기서 생성된 `generated/manifest-contracts.json`의 byte hash가 일치하지 않으면 폴더를 만들기 전에 실패한다. 생성 결과는 과거 v1 template 복사가 아니라 해당 cut contract에 결속된 Manifest v3 scaffold다.

```powershell
pnpm video:new-cut -- episode-001 SH008
pnpm video:validate-production-authoring-contract
pnpm video:validate-cuts
pnpm video:validate-production-stage
```

컷 검증기는 active root의 모든 컷에서 `background.png`가 템플릿과 같은 파일인지, 1920×1080 PNG인지, mode별 실제 로컬 시각 입력이 최소 하나 있는지 검사하고 반려된 root는 별도 보고한다. 빈 디렉터리, README, JSON, `.gitkeep`, placeholder는 시각 자산으로 세지 않는다. 확장자만 이미지·영상인 파일도 인정하지 않으며 PNG signature·크기, SVG markup, 영상의 positive-duration video stream을 검사한다. `remotion`은 `assets/`의 PNG·SVG 등, `source-photo`는 `source-photo/` 또는 `assets/`의 이미지, `source-video`는 `source-video/` 또는 `assets/`의 영상, `omni`는 PASS 전 `omni/`의 imagegen PNG 키프레임이 필요하다. PASS 전에 검수할 모든 시각 입력은 manifest `assets`에 등록하고, PASS 뒤 생성되는 Omni 결과물은 `omni.output`에 별도로 기록한다. `effects_required: true`이면 manifest record와 실제 효과 파일, 출처·권리·checksum이 모두 필요하고, `false`이면 효과 파일과 빈 `effects/` 폴더를 만들지 않는다. Remotion manifest는 시작 배경 전용 구간, asset/effect 등장 구간, 마지막 프레임까지 유지되는 final hold와 최종 표시 목록을 선언해야 하며, 실제 로컬 파일과 애니메이션 target도 검증한다. 제작 단계·컷별 PASS·Omni 생성 허용·전체 영상 승인·최종 대본·녹음·picture lock은 [production state](../../video/episodes/episode-001/production-state.json)와 [stage validator](../../video/scripts/validate-production-stage.mjs)가 강제한다. Source: [scaffold](../../video/scripts/new-cut.mjs), [validator](../../video/scripts/validate-cut-assets.mjs).

`source-video`는 전체 원본 파일을 그대로 보존하고 SHA-256·bytes·ffprobe duration·codec·width·height를 후보 등록 시 검증한다. 화면에 쓸 발언 구간은 원본을 별도 clip으로 잘라 저장하지 않고 `start/end` 문자열과 초, 발언자, 문맥, 공식 locator, locator 근거로 기록한다. 이 값은 DB → materialization ledger → CutAsset까지 유지되어야 하며, Remotion의 `@remotion/media`에는 30fps 반올림값을 `trimBefore/trimAfter`로 전달한다. 컷 중간에 나타나는 영상은 component의 첫 활성 프레임을 `Sequence`의 로컬 0으로 삼아 원본 구간 시작을 건너뛰지 않는다. 경로 검증은 문자열 prefix가 아니라 실제 경로를 따라가 junction/symlink 이탈을 거부한다. 정확한 원본과 타임코드가 확인돼도 이용조건이 미승인이면 metadata-only evidence일 뿐이며 local asset 등록·materialize·cut PASS를 허용하지 않는다. Source: [intake](../../src/lib/episode-official-acquisition.ts), [materializer](../../src/lib/video-asset-materializer.ts), [runtime](../../video/src/vox/scene/source-video.ts), [contract validator](../../video/scripts/source-video-contract.mjs), [SH003 official VOD capture](../../raw/sources/episode-001-sh003-assembly-vod-2026-08-26.md).

활성 컷 폴더의 통과 기준:

- `background.png + manifest.json`만 있는 컷은 미제작 상태이며 PASS 대상이 아니다.
- 컷의 mode별 실제 입력 파일이 하나도 없거나 manifest `assets`가 비어 있으면 실패한다.
- Omni 컷은 `start.png`를 포함한 imagegen PNG 키프레임을 먼저 저장한다. 48컷 PASS marker 전에는 파일명과 확장자를 불문하고 Omni 동영상이 존재·참조되거나 `video_status`가 생성 완료로 기록되면 실패한다.
- 컷 PASS는 사용자가 본 실제 asset, Omni 키프레임과 선언된 effect 각각의 SHA-256에 결속한다. SH001~SH048의 `컷 ID + 종류 + 경로 + 실제 SHA-256`을 정렬해 계산한 집계값을 `cut_review.approved_inputs_sha256`과 approval marker에 함께 기록한다. PASS 뒤 파일 내용이 바뀌면 집계값이 달라져 해당 승인이 무효가 되고 다시 검수하기 전에는 Omni 생성을 허용하지 않는다. 고정 `background.png`의 복제본은 컷 고유 asset이나 키프레임으로 인정하지 않는다.
- 빈 `effects/` 디렉터리는 완료 증거가 아니다. 효과가 필요 없으면 `effects_required: false`, 필요하면 `true`와 실제 파일·출처·checksum을 기록한다.

### Cut-local asset sheet: spatial contract (2026-08-29)

`asset-sheet.json`은 컷 폴더 안에서만 유효한 **구현 공간 계약**이다. editorial intent는 `episode-spec.json`에, 실제 component layout의 1차 권한은 cut manifest에 남긴다. asset sheet는 그 두 내용을 복제하거나 새 좌표를 발명하지 않으며 `layout_binding: manifest-component-layout`으로 manifest component와 결속한다. 따라서 배치·깊이·가림을 확인할 때는 `episode-spec → manifest component layout → cut-local asset sheet → runtime` 순서를 따른다. Source: [asset-sheet schema](../../video/contracts/asset-sheet.schema.json), [asset-sheet contract](../../video/scripts/asset-sheet-contract.mjs).

각 layer에는 `component_id`, `asset_id`, `layer_role`, 서로 비교 가능한 deterministic `depth`, 의미 있는 `anchor`, `safe_area_policy`, 그리고 방향성 있는 `occludes`/`occluded_by`를 기록한다. 배경은 `manifest.background`에 결속한 depth 0의 canvas layer이고, target label·source chrome 같은 시스템 overlay는 실제 시각 asset과 구분한다. 안전영역은 essential/overlay를 분리해 문서·인물·법안명이 화면 밖으로 밀리지 않도록 한다. Source: [SH003 asset sheet](../../video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json), [SH004 asset sheet](../../video/public/assets/episode-001-work-v01/cuts/SH004/asset-sheet.json).

검수기는 모든 manifest component가 sheet에 결속되는지, asset ID와 component ID가 유효한지, depth가 중복되지 않는지, self-reference·cycle·양방향 모순이 없는지, 실제 layout overlap에만 가림 관계가 선언됐는지, safe area를 지키는지를 확인한다. 화면에 겹치지 않는 두 요소를 장식적으로 `occludes`로 연결하지 않는다. 실패한 sheet는 Remotion playable-cut 검수에 들어갈 수 없다. Source: [asset-sheet validator](../../video/scripts/validate-asset-sheets.mjs), [contract library](../../video/scripts/asset-sheet-contract.mjs).

Runtime은 sheet의 depth로 z-order를 결정한다. focal 변경은 scale·opacity·emphasis만 바꾸며 깊이의 권한을 가져가지 않는다. label과 source chrome은 overlay system layer로 렌더하고, shared-element 전환은 outgoing/incoming의 의미와 깊이 관계를 보존한다. 디버그 depth map·contact는 이 계약에서 파생된 QA 산출물이지 새로운 visual authority가 아니다. Source: [PresentationScene](../../video/src/vox/scene/PresentationScene.tsx), [asset-sheet runtime adapter](../../video/src/vox/scene/asset-sheet.ts), [depth QA outputs](../../video/qa/episode-001-work-v01/depth/).

EP001 현재 후보의 핵심 z-order는 SH003에서 `rear wall 100 → podium 200 → Kim 300 / Park 310 → bill 400`, SH004에서 `direct/request route 200/210 → case folder 300`, 그리고 label 900·source chrome 1000이다. 이 값은 임의 배치 예시가 아니라 현재 두 cut-local sheet의 구현 계약이며, 실제 overlap이 있는 관계만 가림으로 기록한다. Source: [SH003 sheet](../../video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json), [SH004 sheet](../../video/public/assets/episode-001-work-v01/cuts/SH004/asset-sheet.json).

생성 catalog와 TypeScript authority binding, production state, review ledger는 sheet schema·각 sheet 경로와 hash·sheet set·render input set을 함께 결속한다. sheet, manifest, runtime 또는 검수 artifact가 바뀌면 기존 review는 무효가 되며, 새 sheet를 만든 뒤 catalog와 검수 ledger를 다시 생성한다. Source: [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [generated authority binding](../../video/src/generated/render-authority-catalog.ts), [production state](../../video/episodes/episode-001/production-state.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

검수 순서는 `pnpm video:generate-render-catalog → pnpm video:validate-asset-sheets → pnpm video:validate-render-authority → pnpm video:render-review`다. 확인할 산출물은 컷별 depth map·final reading frame, episode depth/occlusion contact, mobile preview, 전체 contact sheet, 그리고 timeline/window identity다. machine QA 통과는 사용자의 의미·미감·가독성 PASS가 아니며, 현재 asset-sheet 후보도 사용자 PASS 전에는 `pending`이다. Source: [asset-sheet validator](../../video/scripts/validate-asset-sheets.mjs), [render review](../../video/scripts/render-review.mjs), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

최소 asset record:

```json
{
  "asset_id": "EP001-SH004-A03",
  "role": "evidence",
  "media_type": "image/png",
  "source_url": "https://...",
  "publisher_or_creator": "...",
  "license_or_review_state": "rights-review-required",
  "local_path": "...",
  "sha256": "...",
  "claim_ids": ["CL04"],
  "shot_id": "EP001-SH004",
  "in_out": null,
  "ai": null
}
```

AI 자산의 `ai`에는 모델/제품명, 입력 이미지 ID, 프롬프트, 생성일, 공개 라벨을 추가한다. 공통 필드는 [[../concepts/media-acquisition-pipeline]]의 asset record를 따른다.

## 8. Remotion 제작과 조립

Remotion은 영상 생성 모델이 아니라 최종 편집·합성 엔진이다. 실제 MP4, 공식 문서, 사진, 컷아웃 PNG, 차트 데이터를 동일한 타임라인에 올리고 정확한 프레임에 출처와 강조를 배치한다. 모든 Remotion 컷은 `background.png`만 보이는 빈 시작 상태에서 출발해 `assets/`의 PNG 또는 필요한 `effects/`를 애니메이션으로 등장시키고, final hold에서는 필요한 구성요소가 모두 보이는 상태를 유지한다. provisional composition은 이름에 그 상태를 드러내며, picture lock 전에는 master composition을 등록하지 않는다. 반려된 이전 구현은 `RejectedProvisional` review target으로만 식별한다. 재사용 모션 계약은 [motion components](../../video/src/motion.tsx)에 둔다.

### GitHub 저장소 적용 결정

검토한 여섯 저장소 중 어느 것도 새 제작 베이스로 사용하지 않는다. 현재 manifest·출처·SHA-256·컷별 PASS·전체 provisional 영상 승인 게이트를 유지하면서, 검증된 로컬 입력만 읽는 `video/src/vox/` adapter 계층으로 필요한 패턴을 옮긴다. 상세 비교와 기준 커밋·라이선스는 [[../sources/remotion-repository-patterns]]에 기록한다.

| 모듈 | 참고 패턴 | 23jung 적용 경계 |
|---|---|---|
| `collage/` | `hassancs91`의 camera board·depth layer·cutout·archival photo | MIT 고지 후 선택 이식, 고정 베이지 체크 배경과 기존 생명주기 유지 |
| `charts/` | `AleBrito`의 data interpolation·path reveal·shared timing math | 값·단위·source ID 필수, manifest/사용자 음성 프레임이 duration 권위 |
| `motion/` | `Cele-san`의 paper slap·highlight·halftone·restrained drift | HyperFrames는 추가하지 않고 Remotion에서 결정적으로 재구현 |
| `qa/` | `Cliff007007`의 preflight·contact sheet·change-region·continuity 검사 | 아이디어만 적용하며 사용자 PASS를 자동 검사로 대체하지 않음 |
| `maps/` | Mapbox 예제의 route progress·camera interpolation | 렌더 중 토큰·원격 타일을 금지하고 로컬 GeoJSON/SVG로 구현 |
| Omni 보조 | `Anil-matcha`의 style bake-off·keyframe→clip 분리 | 48/48 PASS 뒤 영상 생성이라는 기존 게이트 뒤에서만 사용 |

외부 저장소 코드를 가져올 때는 `video/THIRD_PARTY_NOTICES.md`에 저장소 URL, 기준 커밋, 라이선스, 가져온 범위와 수정 내역을 기록한다. 표준 라이선스가 확인되지 않은 저장소의 코드는 복사하지 않는다. Remotion 렌더 과정에서는 네트워크 요청, 생성 API, TTS, asset 다운로드를 실행하지 않는다.

2026-08-25 현재 P0–P3는 [video/src/vox](../../video/src/vox/index.ts)에 구현되어 있다. 일반 영상 registry와 QA Still registry는 [index.tsx](../../video/src/index.tsx), [qa-index.tsx](../../video/src/qa-index.tsx)로 분리한다. 지원하는 QA 렌더 진입점은 `pnpm video:production-qa` 하나이며, cut-assets·production-stage·visual-state 게이트를 모두 통과한 active root만 contact sheet와 휴대전화 프리뷰를 만들 수 있다. Source: [production QA](../../video/scripts/production-qa.mjs), [QA runtime](../../video/scripts/qa-runtime.mjs), [third-party notices](../../video/THIRD_PARTY_NOTICES.md).

provisional 컷의 `duration_frames`는 임시 대본 compact 글자 수와 사용자 실측 속도, pre/post-roll에서 계산한 값과 정확히 일치해야 한다. final-voice 단계 이후에는 strict `ffprobe` 결과가 권위가 된다. 모든 non-hold 시각 모션은 `final_hold.start_frame` 전에 끝나야 하고, final hold 안에서 text/effect가 새로 시작하거나 종료되면 실패한다. 영상 CutAsset은 final hold 직전 프레임에서 `Freeze`해 마지막 구성을 고정한다. Source: [narration timing](../../video/scripts/narration-timing-lib.mjs), [visual-state validator](../../video/scripts/visual-state-lib.mjs), [manifest scene](../../video/src/vox/scene/ManifestScene.tsx).

### 세 레퍼런스에서 채택한 구조

| 레퍼런스 | 관찰된 제작 문법 | 23jung 적용 |
|---|---|---|
| [Vox-style motion graphics](https://www.youtube.com/watch?v=7wuYBfE131U) | 레퍼런스에서 관찰된 음성 문장별 장면, 공통 배경, 독립 PNG 레이어, `spring` 등장, 독립 scene 조립 | 음성 선행이 아니라 컷 카드 기준의 한 주장·한 주인공 오브젝트, PNG stagger, 선택적 word cue 프레임 |
| [Map explainer 03:14 이후](https://www.youtube.com/watch?v=Y6mOBK5peDU&t=194s) | 지도 카메라의 end state를 다음 scene이 상속하고, 전투기 PNG와 검은 배경 폭발 영상을 합성 | 공간·절차가 이어질 때만 continuity, 별도 VFX 파일과 `screen` blend |
| [Animated charts](https://www.youtube.com/watch?v=dv3ADYu74DE) | 막대·점·선·숫자를 데이터로 만들고 종이 질감과 약한 boil을 더함 | 차트 값·단위·출처를 manifest 입력으로 유지하고 질감은 별도 파일로 합성 |

근거는 각각 [Vox transcript 01:30–04:03, 06:30–07:31, 10:06–10:49](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [map transcript 03:14–07:30](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt), [chart transcript 00:51–02:19, 03:56–04:48](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt)다. 로컬에는 메타데이터·자동자막·썸네일만 있고 세 YouTube 원본 MP4는 없으므로 실제 픽셀 변화와 정확한 원본 컷 프레임은 아직 측정하지 않았다.

### 프레임 계약

모든 컷은 30fps의 **컷 로컬 프레임**으로 작성한다. `0`은 컷의 첫 프레임이고 마지막 렌더 프레임은 `duration_frames - 1`이다. 종료 경계만 `duration_frames`를 사용할 수 있다. provisional 단계에서는 임시 대본의 공백 제거 글자 수를 사용자 실측 발화속도로 나누어 예상 음성 길이를 구하고 pre-roll·post-hold·transition overlap을 반영한다. final VO가 들어오면 `ffprobe` 실측 초에 30을 곱해 프레임을 다시 계산한다. final VO 전의 duration은 잠기지 않으며 본편 8–10분(480–600초) 목표를 계획 검증기로 확인한다.

```text
word_frame = round((단어 시작 시각 - 선택적 음성 시작 시각) × 30)
master_start_frame = 앞 컷들의 master_occupancy_frames 합
master_word_frame = master_start_frame + word_frame
```

한 animation은 `target_id + type + start_frame + end_frame + from + to + easing`으로 정의한다. `spring-enter`는 PNG·마커·숫자의 등장에, easing interpolation은 카메라·위치·크기·불투명도·카운터·차트 공개에 쓴다. 모든 PNG를 동시에 움직이지 않고 `plate → 구조물/문서 → 인물 → 마커/단어` 순으로 6~15프레임 간격을 두는 것을 시작값으로 삼는다. 음성이 있다면 단어 cue를 후반 미세 조정에 사용하되, 음성이 없어도 컷 카드의 시각적 순서와 읽기 정지로 완결되어야 한다. Source: [Vox stagger and spring, 06:30–07:31](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [map easing, 03:54–05:10](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt).

정식 타입 계약은 [cut-manifest.ts](../../video/src/cut-manifest.ts), 생성 기본값은 [template manifest](../../video/public/assets/_cut-template/manifest.json)에 둔다. 각 manifest는 다음 영역을 정의하며, `audio`는 선택 사항이다.

현재 코드의 `CutManifest`와 템플릿에는 기존 포맷 호환을 위한 `voiceover` 필드가 남아 있다. 에피소드 계획은 [episode-spec.json](../../video/episodes/episode-001/episode-spec.json)에 컷별 보수적 임시 대본, source ID, 사용자 실측 발화속도에서 계산한 예상 발화 범위, pre-roll·post-hold·transition overlap을 기록한다. generated `narration-plan.json`은 소비자 호환용이다. final 음성이 들어오기 전에는 duration과 master 길이를 잠그지 않는다.

| 영역 | 필수 내용 |
|---|---|
| `storyline` | 컷 카드의 목적·소재·시청자 takeaway·최종 화면 |
| `audio` | 선택적 scratch 또는 final 사용자 VO 파일, ffprobe 길이, 컷 로컬 시작·종료 프레임과 필요할 때 강조 단어별 `word_cues`; 합성 음성 금지 |
| `assets` | PNG·실제 사진·실제 영상의 파일, 레이어, z-index, source ID |
| `animations` | 대상, 동작 종류, 시작·종료 프레임, 시작·끝 상태, easing |
| `text_cues` | 단어·숫자·짧은 인용 조각과 노출 프레임 |
| `chart` | 차트 종류, 원 데이터, 단위, source ID, 공개 프레임 |
| `effects` | 필요한 경우에만 별도 효과 파일, 프레임 범위, blend, opacity/gain, source ID, checksum, 권리 상태 |
| `transition` | 다음 컷 ID, `morph / scene-to-scene` 여부, 길이, 이어받을 asset·카메라·공간 상태 |
| `effects_required` | 효과 필요 여부. `true`면 실제 파일·record 필수, `false`면 빈 폴더로 완료를 가장하지 않음 |
| `review` | 컷별 `pending / pass / rejected`, `user_pass`, 검수 시각·메모·marker |
| `omni` | imagegen keyframe 상태, 영상 생성 차단/허용 상태, 승인 marker, `output.mp4` 참조 |

### Remotion 컷 생명주기 계약

Remotion 컷의 모든 manifest는 다음 순서를 프레임 범위로 명시한다.

```text
0 ───── background_only ───── reveal(asset/effect animation) ───── final_hold ─── duration
      background만 표시          PNG·효과가 등장                    모든 필수 구성요소 표시
```

`lifecycle.background_only`는 반드시 0프레임에서 시작하고 표시 asset/effect 목록이 비어 있어야 한다. `lifecycle.reveal`은 실제 asset 또는 effect를 대상으로 하는 animation과 겹쳐야 한다. `lifecycle.final_hold.end_frame`은 컷의 `duration_frames`와 같아야 하며, `final_visible_asset_ids`에는 모든 asset이, `final_visible_effect_ids`에는 최종까지 유지되는 effect가 들어가야 한다. 따라서 시작은 빈 배경, 중간은 애니메이션, 마지막은 전체 구성요소가 보이는 화면으로 고정된다. 이 계약은 [manifest type](../../video/src/cut-manifest.ts)과 [cut validator](../../video/scripts/validate-cut-assets.mjs)가 함께 강제한다.

개별 컷의 `background_only`는 컷 폴더를 단독 재생하거나 수정할 때도 유지되는 시작 계약이다. 다만 마스터 조립에서 인접한 두 컷이 모두 `production_mode: remotion`이면, outgoing 컷의 마지막 상태를 transition bridge로 유지하면서 incoming 컷의 background-only 구간 위에 겹쳐 놓을 수 있다. 즉 incoming 컷 자체가 시작부터 asset을 표시하는 것으로 바뀌는 것이 아니며, bridge가 두 컷 사이의 자연스러운 연결을 담당한다.

### Remotion 인접 컷 연결 계약

인접 컷이 모두 Remotion일 때만 전환 제약을 적용한다. `morph`·`scene-to-scene`이라는 이름이나 whole-scene opacity cross-dissolve만으로는 연결 증거가 아니다. 전환은 `scene.shared-element@1` semantic mapping을 가져야 하며, mapping은 outgoing/incoming의 **component ID와 asset ID를 모두** 지정하고 최소 30프레임의 의도 구간(`intent_frames`)과 상태·레이아웃 상속을 선언한다. resolved rect·camera·blend·trajectory는 스토리라인의 추상 설명이 아니라 supplied manifest, runtime, review ledger가 소유하는 해석 결과다.

검수기는 invalid ID, 한쪽이라도 없는 mapping, 시작·끝이 같은 zero-delta, 누락된 resolved endpoint, fallback 사용을 차단한다. 전환 이름이 있어도 mapping이 해결되지 않으면 전환 PASS가 아니라 실패다. `TransitionPair`는 두 supplied manifest에서 base shared components를 제외하고, 공유 요소 하나의 endpoint interpolation 및 cross-dissolve overlay만 렌더한다. cut-specific path, text, SVG, `staticFile`, 좌표 또는 새 layout을 전환 renderer에 넣지 않는다. 카메라 상태가 양쪽 동일하면 camera move를 주장하지 않고 `inherit-without-delta-claim`으로 기록한다.

필수 증거는 start/mid/end trajectory JSON, 그 세 상태를 담은 contact sheet, boundary artifact, 같은 global frame을 비교한 timeline↔window pixel identity, 그리고 catalog·manifest·runtime·artifact SHA다. `morph`와 `scene-to-scene`은 인접 두 컷을 함께 렌더한 pair/boundary artifact가 있을 때만 주장한다. Remotion이 아닌 컷이 양 끝에 있는 경계에는 이 제한을 적용하지 않는다. Source: [MoSidd continuity](../sources/mo-sidd-remotion-production-series.md#6-create-continuity-without-a-giant-scene), [Vox transition grammar](../sources/vox-style-claude-remotion-reference.md#observed-production-grammar), [TransitionPair](../../video/src/vox/scene/TransitionPair.tsx), [render review](../../video/scripts/render-review.mjs), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

### PNG 우선 화면과 단어 텍스트

Remotion 컷의 주된 설명 수단은 텍스트 상자가 아니라 PNG·실제 미디어·문서·차트의 변화다.

- 인물·건축물·사물·문서는 가능한 한 독립 PNG로 분리한다.
- 한 컷의 주인공 PNG는 하나다. 다른 PNG는 공간·깊이·인과관계를 보조한다.
- `text_cues`는 `keyword / number / quote-fragment`만 허용하며 한 cue는 공백 기준 최대 5단어다.
- 인물·문서·건물·사물 PNG를 설명하는 cue는 대상 component ID에 결속하고 `below-center`로 배치한다. 라벨은 대상의 하단 중앙선을 상속하고 대상과 함께 위치가 유지되어야 하며, 대상보다 위·화면 모서리·임의 좌표에 독립적으로 떠 있으면 반려한다. 이름·법안명은 PNG 하단과 출처 footer 사이의 1080p 안전영역에 완전히 들어와야 한다.
- 문단 카드, 설명문 박스, 전체 화면 제목은 기본 장면으로 쓰지 않는다. 긴 문장은 내레이션과 자막 트랙에 남긴다.
- 출처 footer, 조문 번호, 축·단위는 대상 설명 라벨이 아니라 검증 정보이므로 단어 cue와 `below-center` 제한의 예외다. 단, background-only 구간에는 출처 footer도 표시하지 않고 reveal 이후 하단 안전영역에서 설명 라벨과 겹치지 않게 유지한다. AI 고지는 행동 플레이트에 겹치지 않는 별도 위치에서 유지한다.
- 같은 공간·인물·사물이 다음 visual beat에도 남아야 한다면 새 component를 다시 등장시키지 않는다. 하나의 component가 동일 layout으로 다음 상태까지 지속되고, 새 정보만 추가 진입해야 한다. 누적 설명에서 배경이나 기존 인물을 숨겼다가 동일 asset으로 재등장시키는 구성은 continuity 실패다.
- 차트는 PNG로 굽거나 생성 이미지에 맡기지 않는다. 데이터에서 막대·점·선·숫자를 만들고, 아이콘·질감·인물은 PNG로 합성한다.

영상용 텍스트 배치는 `맥락 kicker → 핵심 인용/대조 → 대상 밖 전용 라벨 레인 → 공통 출처 레일`의 네 층으로 고정한다. 한 프레임에서 같은 내용을 headline·인용 카드·하단 요약으로 반복하지 않고, 핵심 문장은 최대 2줄·긴 문장은 좌측 정렬을 기본으로 한다. 새 후보는 `typography_surface_contract_version=2`, `layout_contract_version=2`를 사용한다. 텍스트는 `asset-label / surface-content / screen-chrome` 중 하나다. `asset-label`은 target ID에 결속하고 0°로 유지하며 target의 완전한 아래쪽에서 모든 asset과 32–72px 떨어진 별도 레인에 둔다. target 중심선 오차는 ±16px 이하다. 같은 행의 독립 asset은 64px 이상, 인접 간격 편차는 64px 이하이며 모든 row asset은 기준선 group 또는 명시적 정렬 예외를 갖는다. 같은 역할의 하단 기준선은 ±24px, 인물 눈높이는 ±20px, connector는 비대상 asset·label에서 24px 이상 떨어져야 한다. 의도하지 않은 겹침은 금지하고 선언한 collage 겹침도 작은 asset 면적의 12%를 넘지 않는다. `surface-content`만 이름이 지정된 PNG 위에 실제로 겹치고 target에 결속될 때 회전할 수 있으며 각도는 ±2° 이내다. kicker·제목·독립 인용·날짜·출처는 `screen-chrome` 0°다. SH006 B03의 법률 문구는 surface-content, B01의 범인·범죄사실·증거와 B05의 인물·요구서·기관명은 외부 asset-label 예시다. 기존 v1/v04는 거부된 역사 후보이며 production authority가 아니다. Source: [layout contract](../../video/scripts/style-frame-layout-contract.mjs), [SH006 v05 builder](../../video/scripts/build-sh006-editorial-style-frames-v05.mjs), [v05 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v05/manifest.json), [family v02 index](../../video/qa/style-frames/episode-001/reference-style-families-v02/family-index.json), [reference gate validator](../../video/scripts/validate-reference-style-gates.mjs).

### 별도 이펙트 파일 계약

의미를 설명하는 이동·확대·차트 공개는 Remotion 코드로 계산하고, 표면감과 충격을 주는 효과는 별도 파일로 확보한다.

```text
effects/
  paper-grain-loop-v1.webm
  ink-wipe-matte-v1.webm
  impact-flash-screen-v1.mp4
  marker-whoosh-v1.wav
```

- 알파 채널이 있으면 alpha WebM 또는 ProRes 4444 MOV를 사용한다.
- 검은 배경의 빛·폭발 효과는 `screen` 또는 `lighten`으로 합성하고 검은 사각형 잔존 여부를 확인한다. Source: [map VFX, 06:15–06:51](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt).
- 질감은 seamless PNG 또는 loopable video, SFX는 48kHz WAV를 우선한다.
- 효과 파일도 URL·제작자·취득일·라이선스·checksum을 저장한다. 수급 루트와 파일 역할은 [[../sources/reusable-media-libraries#separate-effect-file-route]], 실제 항목 후보와 합성·안전 규칙은 [[../sources/effect-file-catalog]]를 따른다.
- grain·boil·distress는 얼굴·법률 문장·날짜·차트 축·출처 위에서 약하게 하거나 mask로 제거한다. 과도한 boil이 buzz가 된다는 근거는 [chart transcript 04:05–04:48](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt)에 있다.
- 효과는 주장이나 사건의 증거가 아니며, 장면의 의미를 바꾸는 폭발·연기·군중 효과를 실제 사건 영상 위에 추가하지 않는다.

각 컷은 독립 컴포넌트로 만들고 다음 순서로 검수한다.

1. 내레이션만 재생하고 시작·강조·종료 프레임을 기록한다.
2. 배경을 배치하고 느린 카메라 이동만 확인한다.
3. 중경의 주인공 오브젝트를 `spring` 또는 easing으로 등장시킨다.
4. 전경은 가림·깊이·강조가 필요할 때만 추가한다.
5. 문서·숫자·출처가 나타난 뒤 최소 60프레임의 완전한 읽기 정지를 둔다.
6. 장면 스틸을 초반·중간·후반에서 각각 렌더해 크롭·레이어 경계·자막 충돌을 확인한다.
7. 컷이 승인된 뒤에만 마스터 `<Sequence>`에 넣는다.
8. 마지막에 음악·Foley·whoosh·공통 색보정·질감을 추가한다.

## 9. 공개 전 게이트

| 게이트 | 통과 조건 |
|---|---|
| 사실 | 모든 단정 문장에 source ID가 있고 원문과 일치 |
| 문맥 | 발언 영상·회의록의 앞뒤 문맥과 발언자 동일성 확인 |
| 상태 | 발의·심사·의결·공포·시행을 서로 바꾸어 쓰지 않음 |
| 미디어 | 파일별 출처·제작자·권리 상태·사용 컷 기록 |
| AI | 생성 장면이 증거로 쓰이지 않고 필요한 컷에 공개 라벨 표시 |
| 화면 | 휴대전화에서 날짜·숫자·출처·조문을 읽을 수 있음 |
| 음향 | 내레이션이 음악보다 명확하며 중요한 모션이 해당 단어에 맞음 |
| 렌더 | 1920×1080, 30fps 완성본과 대표 프레임 확인 |

최종 프로젝트 진단은 저장소의 고정 명령 `pnpm run check`로 한 번 실행하고, 영상은 별도의 Remotion render와 `ffprobe`로 길이·해상도·프레임레이트를 확인한다. 렌더 명령 예시는 [video README](../../video/README.md)에 유지한다.

## Architecture

```text
video/
  src/
    compositions/
      MainVideo.tsx
    scenes/
      Scene01/
        Scene01.tsx
        spec.ts
      Scene02/
      Scene03/
    components/
      PaperBackground.tsx
      Cutout.tsx
      EvidenceDocument.tsx
      SourceLabel.tsx
      AnimatedChart.tsx
      MapCamera.tsx
      FilmTreatment.tsx
    motion/
      springEnter.ts
      easeMove.ts
      selectivePosterize.ts
      restrainedBoil.ts
      screenVfx.ts
    data/
      claims.ts
      sources.ts
      sceneManifest.ts
    assets/
      official/
      news/
      generated/
      texture/
      audio/
```

Independent scene components, a master sequence, and prop-driven controls follow the repeated channel method. Source: [MoSidd series synthesis](../sources/mo-sidd-remotion-production-series.md#repeated-production-method).

## Scene specification

```ts
type SceneSpec = {
  id: string;
  purpose: string;
  takeaway: string;
  productionMode: 'source-photo' | 'source-video' | 'omni' | 'remotion';
  durationFrames: number;
  background: AssetRef;
  midground: AssetRef[];
  foreground: AssetRef[];
  actions: AnimationAction[];
  transition: TransitionSpec;
  sourceIds: string[];
  audioCues?: AudioCue[];
  verificationState: 'confirmed' | 'reported' | 'inference' | 'reconstruction';
  aiDisclosure?: string;
};
```

The PPT-like storyline, timing script, source requirements and visual beats live together in [episode-spec.json](../../video/episodes/episode-001/episode-spec.json), the sole EP001 editorial authority. Generated compatibility plans feed legacy consumers; manifests are frame-accurate implementations and cannot override the spec. The concrete runtime schema is [CutManifest](../../video/src/cut-manifest.ts), and prompts do not silently invent missing fields. Rendering has a second, separate authority boundary: the episode spec feeds the versioned work-root manifests, the generated catalog, and finally one `EpisodeTimeline`; no standalone cut or pair renderer may become an alternative visual source.

## Production passes

Before populating all 48 cuts, a **timing-draft style calibration** may use a small, declared representative set: one person/source collage, one official-document composition, one action-only Omni keyframe, and one process comparison. The candidate root remains inactive, carries no cut PASS or episode approval marker, and cannot unlock Omni video. The dedicated `pnpm video:qa:style-calibration` command accepts only the shot IDs declared in `production-state.style_calibration`, rejects production/rejected-root substitution, forbids video files and video references in the Omni sample, and renders three-state contact sheets under a separate QA path. Source: [style calibration command](../../video/scripts/style-calibration-qa.mjs), [episode production state](../../video/episodes/episode-001/production-state.json), [v04 manifests](../../video/public/assets/episode-001-v04/cuts/).

The first calibrated set for episode 001 is SH002, SH005, SH008 and SH047. SH002 tests a generated person cut-out against an official source plate; SH005 tests case-file and official-law-document readability; SH008 stores only a fictional payment-action imagegen keyframe with no parcel and no generated video; SH047 tests a two-route process chart with generic generated cut-outs and two official-law source plates. Every cut retains the physical beige-check `background.png`, starts background-only, reveals assets frame by frame, and ends with every declared visual component held on screen. All four reviews remain pending until the user explicitly accepts or rejects the rendered contact sheets. Source: [v04 cut root](../../video/public/assets/episode-001-v04/cuts/), [calibration QA output](../../video/qa/style-calibration/episode-001-v04/).

## Viewer-first presentation contract (Manifest v3)

v05는 독립 asset과 runtime operator를 증명했지만 작은 법률 전체 캡처와 평평한 final composition 때문에 시청자 가독성 검수에서 실패했다. [v05 marker](../../video/public/assets/episode-001-v05/historical-status.json)는 이를 역사 자료로 동결하며 PASS를 승계하지 않는다.

v06은 `시청자에게 남길 한 문장 -> focal/support/hidden visual beat -> overview/crop/retyped quote 근거 view -> semantic layout -> component state -> motion -> desktop/mobile 검수` 순서를 사용한다. Manifest v3의 각 beat는 하나의 focal component, narration window와 최소 2초 reading hold를 갖고 component는 첫 상태 구간 전까지 숨겨진다. 구현: [manifest types](../../video/src/cut-manifest.ts), [v3 validator](../../video/scripts/visual-contract-v3.mjs), [presentation renderer](../../video/src/vox/scene/PresentationScene.tsx).

SH003 v08부터 `presentation_contract_version: 2`를 사용한다. v2에서 모든 설명 cue는 `target_component_id`와 `placement=below-center`를 가져야 하고 cue가 보이는 동안 대상 component도 visible이어야 한다. renderer는 cue를 대상 rect 하단 중앙에 결속하며 background-only 구간에는 cue·출처·beat 설명을 표시하지 않는다. 본회의장·김승원처럼 다음 beat에서도 유지되는 요소는 동일 component·layout으로 지속하고 박형수·법안처럼 새 정보만 추가한다. Source: [v08 manifest](../../video/public/assets/style-calibration/episode-001-sh003-assembly-set-v08/cuts/SH003/manifest.json), [manifest types](../../video/src/cut-manifest.ts), [v3 validator](../../video/scripts/visual-contract-v3.mjs), [renderer](../../video/src/vox/scene/PresentationScene.tsx).

역사적 v06은 법률 overview/crop을 읽기 화면에 사용했지만 현재 경로에서는 폐기한다. capture와 crop은 전사·출처 인증용 off-canvas evidence일 뿐이다. 시청자가 읽는 문구는 래스터 배경이 없는 native DOM/vector surface에 1080p 72px 이상·최대 2줄로 조판하며 reading hold 중 document motion을 금지한다. [SH005 v06](../../video/public/assets/episode-001-v06/cuts/SH005/manifest.json)과 [SH047 v06](../../video/public/assets/episode-001-v06/cuts/SH047/manifest.json)은 역사 기록이다.

v06은 비활성 `timing-draft`다. SH002·SH005·SH047만 Remotion playback 후보이며 SH008은 계속 `omni-keyframe-input` 갤러리다. 자동 QA는 구조와 가독성 proxy만 확인하고 의미 전달·미감·인용문 전사 정확성을 승인하지 않는다. Source: [production state](../../video/episodes/episode-001/production-state.json), [style QA](../../video/scripts/style-calibration-qa.mjs).

For motion review, use the catalog-only [production registry](../../video/src/production-index.tsx) through `pnpm video:qa:style-calibration-studio`. The command is a review launcher, while the entrypoint is unambiguously the sole production runtime consumer of the generated catalog. It must not contain hard-coded shot IDs, legacy manifest paths, or a specialized pair entry. Each episode, cut, and boundary composition is a window of the same `EpisodeTimeline`; mobile/contact outputs are derived review artifacts, not new render authorities. The retired `style-calibration-index.tsx` registers no root. Source: [Studio launcher](../../video/scripts/style-calibration-studio.mjs), [generated render catalog](../../video/src/generated/render-authority-catalog.ts), [render-authority validator](../../video/scripts/validate-render-authority.mjs).

1. **Issue/evidence lock:** verify the current policy change, actual complaint, decision path and source IDs.
2. **Storyline deck:** arrange the question, reveal, evidence, process and conclusion as PPT-like cards.
3. **Temporary timing script:** define a cautious draft line per cut; calculate provisional speech frames from the user's measured speaking rate.
4. **Production routing and asset sheet:** choose actual photo/video, Omni, or Remotion; collect and label source media, cut-outs, documents, charts, conditional effects, and disclosed reconstructions.
5. **Source-ready representative style-frame gate:** after source approval/materialization, compose opening, evidence/change, and final-summary 1920×1080 stills plus 360×203 reductions only for materially distinct episode treatments or a rejected direction. Record exact inputs, prompts, deterministic typography source, outputs and SHA-256. There is no fixed family/sample quota. User style-frame PASS approves visual direction only.
6. **Independent production-asset decomposition:** after style-frame PASS, split every moving person, document, path, prop and effect into independent assets/render targets. A flat style-frame plate cannot become the production cut. Source provenance, rights state and AI disclosure remain mandatory.
7. **Populated cut previews:** implement Remotion and source-media cuts with real local inputs. For Omni cuts, create imagegen start/end PNG keyframes only; an Omni MP4 is forbidden here.
8. **Per-cut user review:** present the SH001–SH048 contact sheet and previews. Record PASS or rejection in every manifest; one pending/rejected cut keeps episode-level PASS false.
9. **Omni generation approval:** only after 48/48 cut PASS and a matching episode marker, generate the approved Omni clips from their passed keyframes.
10. **Full provisional assembly:** sequence all source, Remotion, and Omni cuts with declared transitions and render a decodable positive-duration output whose name contains `provisional` or `animatic`, never `master` or `final`.
11. **User full-video review:** approve or reject the flow, actions, evidence, readability, cut order, and approximate rhythm while viewing the assembled provisional video. Store the reviewed artifact SHA-256 with the approval marker so later replacement at the same path invalidates approval.
12. **Script/fact lock:** only after full-video approval, lock the final narration text and source claims; do not add a new claim during recording.
13. **Final VO:** the user records final cut-local files; `ffprobe` measures WAV, MP3, M4A, or WEBM durations at 30fps.
14. **Audio retiming:** adjust reveal, emphasis, reading holds, transition overlaps, and cut duration against measured final VO without changing approved claims or substituting sources.
15. **Semantic transition pass:** choose the boundary that fits the adjacent claims. `shared-element`/`scene-to-scene` needs explicit component+asset mapping and pair evidence; a hard cut is allowed between Remotion cuts when the spec declares its semantic intent and the submitted adjacent frames prove zero blend.
16. **Audio-timed assembly:** sequence completed scenes against final VO with transitions, source labels, and shared treatment.
17. **Picture lock and QC:** review the complete video against research, storyline, style-frame record, cut PASS record, approved full-video review, final script, and audio; verify dates, axes, units, source labels, licenses, AI disclosure, and phone readability.
18. **Thumbnail and publish QC:** derive the thumbnail from the finished video's core visual and claim, then run final source, rights, caption, audio, render, and thumbnail checks before publishing.

This order is derived from the MoSidd voice-line, asset-sheet, isolated-scene, and master-assembly workflow. Source: [MoSidd series](../sources/mo-sidd-remotion-production-series.md#repeated-production-method).

## Motion rules for 23jung

- Use `spring` for the arrival of a cut-out, marker, or numeric emphasis—not for continuous camera travel.
- Use eased interpolation for pans, zooms, scale, opacity, counters, and chart reveals; avoid default linear motion unless mechanical movement is the meaning.
- Keep a stable reading hold of at least 60 frames at 30fps after a document clause or exact quote appears, and verify the 360×203 artifact.
- Apply posterization only to decorative/collage elements. Never reduce the temporal clarity of official video or evidence text.
- Keep boil subtle and deterministic. Do not let source documents, faces, or labels shimmer.
- Use screen/lighten blending only for light-on-black effects whose origin and editorial meaning are clear.
- Use film grain, scan lines, vignette, and grunge as a restrained program-wide finishing layer; mask or weaken it over evidence.
- Select transitions per adjacent semantic relationship, not by production-mode quota. When `scene.shared-element@1` is selected, require at least 30 intent frames, valid component/asset IDs, non-zero resolved delta, start/mid/end trajectory evidence, and the generic supplied-manifest `TransitionPair`. When a hard cut is selected—including `remotion → remotion`—bind the semantic cut intent and, if called reference-derived, the approved `hard-cut` grammar; prove adjacent zero-blend replacement. Do not claim camera motion when endpoints are equal.
- Scratch VO is optional; if supplied, it is a user recording used only as an additional provisional timing check. Do not generate synthetic narration. The required provisional timing input is the temporary script plus the user's measured speaking rate; after final VO, measured timing controls reveal, emphasis, and holds.

Channel evidence for these methods: [motion vocabulary](../sources/mo-sidd-remotion-production-series.md#5-use-a-small-motion-vocabulary), [continuity](../sources/mo-sidd-remotion-production-series.md#6-create-continuity-without-a-giant-scene), [shared treatment](../sources/mo-sidd-remotion-production-series.md#8-add-a-shared-treatment-and-sound-last).

## Asset-approval and picture-lock gate

There is no standalone pilot composition. The first episode advances only when each production stage passes its gate:

1. **Source approval:** law, bill, petition, official screenshots/crops, real photos/video and any effect files have a source ID, original URL, rights state and checksum. Blocked items remain cards in the deck; they are not replaced with invented evidence.
2. **Mode approval:** every card has one primary production mode. Remotion is the final assembly layer, not a second primary mode for a source-photo or source-video card.
3. **Populated cut-folder approval:** each planned card receives one cut folder with the fixed `background.png`, manifest, and at least one real mode-specific visual input. Empty directories and placeholders do not pass. Effects follow the explicit `effects_required` contract.
4. **Omni keyframe gate:** Omni cuts contain approved imagegen PNG keyframes and prompt/continuity records only. Before episode-level 48/48 PASS, `output.mp4`, MP4 references, and generated-video completion claims are forbidden.
5. **Per-cut review gate:** the user reviews every cut. `cut-review-approved` requires SH001–SH048 manifests to carry individual PASS and an episode marker recording 48/48 PASS.
6. **Omni generation gate:** the PASS marker unlocks Gemini/Omni generation. Only the passed keyframes may become MP4; real events or rejected/pending keyframes remain blocked.
7. **Full provisional video gate:** generated Omni clips, Remotion cuts, and actual media are assembled and rendered only as a decodable `provisional` or `animatic` artifact.
8. **Full-video review gate:** the user must review the assembled provisional video before the final script is locked. The review record stores the artifact SHA-256 and later stages reverify it. Cut PASS alone or a different file at the same path is insufficient; a rejected or hash-mismatched review keeps final script and final recording blocked.
9. **Final voice gate:** after full-video approval and script/fact lock, the user records final VO. Missing or unreadable audio blocks audio-timed production; the non-strict plan check may still pass for planning.
10. **Audio-timed visual pass:** each cut satisfies background-only → reveal → final-hold and is retimed to measured final VO. Every boundary follows its declared semantic transition; shared-element is optional and hard cuts remain valid between Remotion cuts when their contract and zero-blend proof are present.
11. **Picture lock:** render the complete video with final VO, compare it with the research pack, PPT deck, cut PASS records, and approved full-video review, and lock order, claims, source labels, AI disclosures, and timecodes. Captions, mix, and thumbnail follow this lock.

## Non-goals

- One-prompt publishing without editorial review.
- A single giant component for the whole episode.
- Generated charts or maps that cannot expose their input data.
- Texture or motion that obscures documents and sources.
- AI imagery used as authentic evidence.
- Three.js, glassmorphism, or elaborate 3D before the core editorial system is stable.
## 2026-08-25 Visual Contract v2 개정

이 절은 이 문서의 앞선 schema v1·단일 컷 PASS·전환 metadata 설명보다 우선한다. v1은 반려·역사 root를 읽기 위한 호환 형식일 뿐이며, 새 활성 후보는 [Manifest v2 타입](../../video/src/cut-manifest.ts)과 [v2 validator](../../video/scripts/visual-contract-v2.mjs)를 사용한다.

```text
근거 잠금 → 스토리라인 → 임시 대본·실측 발화속도
→ visual contract(components/beats/operators)
→ generation-input 검수
→ Remotion·source playable-cut 검수
→ 모든 사전 생성 검수 결속
→ Omni 생성
→ Omni generated-motion playable-cut 검수
→ 전체 provisional 조립·검수
→ 최종 대본·녹음 → 실측 재타이밍 → picture lock
```

### Manifest v2 계약

- `review_profile`은 검수 대상이 `omni-keyframe-input / omni-generated-motion / remotion-motion / source-photo-treatment / source-video-selection` 중 무엇인지 고정한다.
- `visual_components`는 asset과 render target을 연결한다. 독립적으로 움직일 인물·문서·소품은 각각 `independent-layer + single-editable-object`여야 한다.
- `visual_beats`는 컷의 설명 목적과 필요한 observable capability를 프레임 범위에 결속한다.
- `motion_actions`는 편집 의도와 실제 `operator_id`를 분리한다. canonical operator는 `transform.spring@1`, `transform.tween@1`, `opacity.tween@1`, `mask.inset@1`, `svg.stroke-draw@1`, `document.highlight@1`, `chart.reveal@1`, `camera.transform@1`뿐이다. `slap`, `place`, `draw-path` 같은 별칭은 기법 수로 세지 않는다. 실제 동작은 [operator registry](../../video/src/vox/motion/operator-registry.ts), 화면 결과는 [scene renderer](../../video/src/vox/scene/ManifestScene.tsx)가 만든다.
- 시작값과 끝값이 같은 action, target 종류가 맞지 않는 operator, beat capability를 실제로 제공하지 않는 action은 실패한다.
- `runtime_contract`는 operator registry·scene renderer·transition renderer를 가리키며, 승인 시 현재 runtime SHA-256과 일치해야 한다.
- `review_requirements`와 `approvals`는 generation input과 playable cut을 분리한다. Omni 키프레임 PASS는 영상 움직임 PASS가 아니다.

### 승인 결속과 전환 증거

승인 bundle은 canonicalized manifest, 실제 asset/keyframe/effect, operator·scene·transition runtime, 사용자가 본 exact review artifact의 SHA-256을 함께 계산한다. 어느 하나라도 바뀌면 기존 PASS는 무효다. 에피소드 상태도 generation-input 집계와 playable-cut 집계를 별도로 저장한 뒤 두 값을 결합해야 Omni 생성을 열 수 있다. 구현: [stage validator](../../video/scripts/validate-production-stage.mjs), [review bundle implementation](../../video/scripts/visual-contract-v2.mjs), [production state](../../video/episodes/episode-001/production-state.json).

`morph`와 `scene-to-scene`은 metadata 이름만으로 주장하지 않는다. 현재 전환은 [EpisodeTimeline](../../video/src/vox/scene/EpisodeTimeline.tsx)이 catalog의 boundary window에서 인접 manifest를 [TransitionPair](../../video/src/vox/scene/TransitionPair.tsx)에 전달해 렌더해야 하며, mapping은 `scene.shared-element@1`의 component+asset ID, 30-frame intent, layout/state inheritance를 가져야 한다. resolved rect·camera·blend·trajectory는 manifest/runtime/review ledger의 결과이고, 전환 renderer는 base shared components를 제외한 두 supplied manifest와 공유 요소 overlay만 소비한다. cut-specific 자산·텍스트·SVG·`staticFile`·좌표·layout을 전환 renderer가 다시 그릴 수 없다. invalid ID·missing mapping·zero delta·fallback은 전환 검수를 차단한다. camera endpoint가 동일하면 `inherit-without-delta-claim`으로 기록한다. boundary artifact, start/mid/end trajectory JSON/contact, timeline↔window pixel identity와 runtime/catalog/manifest/artifact hash가 있어야 한다. boundary artifact와 standalone cut window는 모두 같은 timeline의 결과여야 한다. 기존 특수 pair 산출물은 [historical invalid ledger](../../video/qa/history/invalid-duplicate-renderers/episode-001-sh003-sh004-v08-v01.json)의 `invalid-duplicate-renderer` 기록으로만 보존하고 현재 authority·PASS·Studio에서 제외한다.

스타일 캘리브레이션에서도 프로필을 섞지 않는다. Remotion Studio에는 `remotion-motion`만 노출하고, `omni-keyframe-input`은 별도 정지 갤러리에서 검수한다. 구현: [calibration QA](../../video/scripts/style-calibration-qa.mjs), [catalog builder](../../video/scripts/build-style-calibration-catalog.mjs).

## 2026-09-02 단일 production authoring 계약

[production authoring contract v1](../../video/contracts/production-authoring-contract-v1.json)은 제작 저작과 렌더의 유일한 직선 경로를 `episode-spec.json → generated/manifest-contracts.json → active cut manifests → generated/render-catalog.json → EpisodeTimeline`으로 고정한다. 수동 editorial 권한은 episode spec 하나뿐이다. Active cut manifest는 generated cut contract에 byte-bound된 유일한 구현 레이어로서 asset과 runtime realization만 더할 수 있고, 독립적인 storyline·timing·grammar 권한을 갖지 않는다. `new-cut`도 이 경로 밖에서 manifest를 만들지 않고 현재 spec byte hash와 generated cut contract를 확인한 뒤 이 구현 레이어의 Manifest v3 scaffold만 생성한다. standalone·QA·역설계·캘리브레이션 entrypoint는 증거와 역사 산출물을 만들 수 있지만 `active_cut_root`, current catalog 또는 production PASS의 입력이 될 수 없다. Source: [contract](../../video/contracts/production-authoring-contract-v1.json), [validator](../../video/scripts/production-authoring-contract.mjs), [scaffold](../../video/scripts/new-cut.mjs), [production-stage validator](../../video/scripts/validate-production-stage.mjs).

새 active candidate는 하나의 `production_authoring_contract.version=1` 선언 안에서 `visual_treatment`, `motion_contract`, `source_contract`를 분리한다. 외형 계약에는 surface/palette/typography/texture/prohibition만, 모션 계약에는 target/operator/frame range/state delta/reading hold만 둔다. 출처 계약은 source/locator/rights와 `materialization_status`를 분리하고, 실제 byte가 materialized일 때만 SHA-256을 요구하며 pending/blocked 상태에서는 `sha256=null`이어야 한다. 정지 imagegen·Omni keyframe 지시에는 camera/fade/spring 같은 모션 지시를 섞지 않으며, 모션 계약은 source나 rights를 발명하지 않는다. 이 분리는 Calliope의 image/video style field 분리에서 운영 아이디어만 채택한 것이고, 프롬프트나 외부 서비스가 production authority가 되는 것은 아니다. Source: [[../sources/calliope-vox-template-workflow]], [local contract](../../video/contracts/production-authoring-contract-v1.json).

레퍼런스 충분성은 이미지 개수로 판단하지 않는다. 모든 컷은 `stage / focal / supporting / depth / entrance / internal-change / transition / hold / exclusions` 9개 차원의 status와 evidence를 가져야 한다. `not-applicable`은 근거와 함께 허용하지만 차원 자체의 누락은 실패한다. 새 active root에서는 declaration 누락, spec/generated-contract hash drift, cut-contract hash 불일치 또는 일부 coverage 누락을 `validate-cut-assets`와 `validate-production-stage`가 fail-closed한다. 기존 역사·draft manifest는 non-production인 동안만 선언 없이 보존할 수 있다. Source: [contract validator](../../video/scripts/production-authoring-contract.mjs), [cut validator](../../video/scripts/validate-cut-assets.mjs), [stage validator](../../video/scripts/validate-production-stage.mjs).

부분 교체는 별도 우회 경로가 아니다. 문제 컷의 asset/runtime를 교체하면 그 컷의 input hash와 PASS를 무효화하고, 동일 canonical route에서 해당 컷과 인접 transition을 다시 생성·검수한 뒤 episode bundle을 재계산한다. Calliope 자체, 고정 6-reference 규칙, 보편적 70% hero/1–3초 cut/2% drift, prompt-only motion proof, 자동 narration/caption/SFX는 채택하지 않는다. Source: [[../sources/calliope-vox-template-workflow]], [review hash rules](#asset-approval-and-picture-lock-gate).

정정된 v02 레퍼런스 경로가 활성인 동안 v01 catalog·승인 package·테스트 fixture는 역사 증거일 뿐 현재 권한을 다시 얻을 수 없다. v01 승인 적용기는 supersession marker의 누락·손상·오상태까지 포함해 항상 fail-closed하며, v01 validator의 기본 모드도 유효한 marker가 있더라도 current authority 검증을 거부한다. 과거 승인 내부 무결성은 production형 apply/validate 명령이 아니라 `video:qa:audit-reference-calibration-v01`의 명시적 historical audit에서만 검사한다. v01 catalog의 source/frame/clip/board/approval 변조 검사는 corrected v02와 분리된 [QA 전용 catalog validator](../../video/scripts/validate-motion-grammar-catalog-v01.mjs)에서 계속 실행하며, production reference-style validator에는 catalog-only flag나 조기 성공 경로를 두지 않는다. 역사 package가 링크한 `wiki/` 문서는 이후 사실 정정으로 바뀔 수 있으므로 정규화한 실제 경로가 wiki root 안에 있을 때만 존재와 추적 가능성을 확인하고, 그 문서의 과거 SHA-256을 production approval·PASS·byte authority로 사용하지 않는다. `wiki/../raw`나 `wiki/../video/qa` 같은 탈출 경로는 예외가 아니며 `raw/` 원본과 동결된 QA media/evidence는 계속 exact byte hash로 검증한다. Source: [v01 approval validator](../../video/scripts/validate-reference-calibration-approval-v01.mjs), [current reference-style validator](../../video/scripts/validate-reference-style-gates.mjs), [historical approval regression](../../tests/reference-calibration-approval-v01.test.mjs), [historical package regression](../../tests/remotion-motion-grammar-style-samples-v01.test.mjs), [catalog authority regression](../../tests/motion-grammar-catalog.test.mjs).

## 2026-08-27 단일 렌더 권한 정정

EP001의 렌더 권한은 다음 한 줄로 고정한다.

```text
episode-spec
  → episode-001-work-v01/cuts/*/manifest.json
  → generated/render-catalog.json
  → EpisodeTimeline
  → EP001-Episode / Cut / Boundary / Mobile / Contact derived outputs
```

현재 작업 root는 [production state](../../video/episodes/episode-001/production-state.json)의 `render_authority`가 가리키며, 현재 catalog는 [generated render catalog](../../video/episodes/episode-001/generated/render-catalog.json)로만 생성한다. 아래 SH006 source-photo provisional implementation이 추가되기 전의 이 문단은 **역사적 3-cut/590-frame 스냅샷으로 superseded**됐다. 현재 물리 컷·프레임·composition ID는 아래 최신 SH006 subsection을 따른다. Standalone cut previews와 boundaries는 서로 다른 창(window)일 뿐 별도 creative implementation이 아니다. 따라서 cut을 두 번 설계하거나, pair에 전용 자산·문구·좌표를 다시 쓰거나, TransitionPair를 current catalog authority로 취급하는 것은 금지한다.

전환 renderer의 역할은 두 supplied `ManifestScene` 상태를 연결하는 것뿐이다. 자산·텍스트·SVG·`staticFile`·레이아웃을 직접 선언하거나 다시 그릴 수 없고, 시청자에게 노출되는 composition은 [catalog-only production registry](../../video/src/production-index.tsx)가 생성한 `EpisodeTimeline` 하나에서 파생되어야 한다. [render-authority validator](../../video/scripts/validate-render-authority.mjs)는 catalog·manifest set·scene/transition runtime SHA를 확인하고, registry의 수동 shot authority와 TransitionPair의 cut-specific 토큰을 차단한다.

현재 고정 composition ID는 다음 여섯 개다.

| derived window | composition ID |
|---|---|
| 전체 episode | `EP001-Episode-Provisional` |
| SH003 cut window | `EP001-Cut-SH003-Provisional` |
| SH004 cut window | `EP001-Cut-SH004-Provisional` |
| SH005 cut window | `EP001-Cut-SH005-Provisional` |
| SH003→SH004 boundary window | `EP001-Boundary-SH003-SH004-Provisional` |
| SH004→SH005 boundary window | `EP001-Boundary-SH004-SH005-Provisional` |

검수는 `pnpm video:generate-render-catalog` → `pnpm video:validate-render-authority` → `pnpm video:render-review` 순서로 한다. [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json)는 각 산출물에 catalog·manifest set·runtime·파일 SHA를 결속하고, timeline frame과 cut/boundary window frame의 pixel SHA-256 identity를 기록한다. manifest·asset·runtime·transition·검수 영상이 바뀌면 기존 검수는 무효다. 360×203과 contact sheet도 이 ledger에 기록된 동일 window의 파생 출력이어야 한다.

렌더 구현은 authority가 아니라 실행 메커니즘이다. Chrome endpoint timeout이 발생하면 endpoint 연결 문제와 scene/render 오류를 별도로 기록하고, [render-review](../../video/scripts/render-review.mjs)의 선언된 `@remotion/bundler`·`@remotion/renderer` API로 bundle 하나와 browser 하나를 재사용한다. `selectComposition`·`renderMedia`·still 렌더가 같은 bundle/browser를 공유해도 authority는 계속 catalog → EpisodeTimeline이며, 별도 renderer나 CLI endpoint가 새 결과의 권한을 얻지 않는다.

이 정정 시점의 상태는 `timing-draft`, `active_cut_root=null`, partial root `3/48`, user/cut PASS false, rights pending, Omni blocked다. [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json)는 현재 [episode spec](../../video/episodes/episode-001/episode-spec.json) hash로 재생성된 상태이며, 현재 summary는 requirement 169개·활성 후보 15개·연결 source ID 13개·요구사항 링크 94개·missing 19개·blocked-non-media-work 56개·approved/materialized 0개·역사 후보 1개다. 후보 수급·권리 승인을 production PASS로 오인하지 않는다. 역사적 특수 pair와 standalone 산출물은 삭제하지 않고 [invalid duplicate-renderer ledger](../../video/qa/history/invalid-duplicate-renderers/episode-001-sh003-sh004-v08-v01.json)에서 `invalid-duplicate-renderer`로 격리한다. 이번 SH005·SH006 작업에서 canonical `pnpm run check`는 정확히 한 번 실행됐고 stale hardcoded 2-cut expectations 두 건으로 `200 pass / 2 skipped / 2 fail`에서 중단되어 build에 도달하지 못했다. typecheck/validators는 통과했으며, semantic test 수정 뒤 focused typecheck/tests `16/16`, implementation suite `25/25`, render-authority/production-stage/render-review는 통과했지만 canonical은 재실행하지 않았다. Source: [production state](../../video/episodes/episode-001/production-state.json), [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

### 2026-08-28 shared-element evidence gate

SH003→SH004는 다음 semantic mapping이 실제로 해결될 때만 `scene.shared-element@1`로 기록한다.

```text
outgoing: bill-b03 / assembly-bill-card
incoming: sh004-case-folder / sh004-case-folder
intent: 30 frames
inheritance: layout + presentation state; camera = inherit-without-delta-claim
renderer: supplied manifests → base exclusion → one overlay interpolation/cross-dissolve
```

이 선언은 설계 입력이고, resolved rect·trajectory·blend는 [render catalog](../../video/episodes/episode-001/generated/render-catalog.json)와 [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json)가 보존하는 검수 결과다. start/mid/end trajectory는 [trajectory JSON](../../video/qa/episode-001-work-v01/trajectory/SH003__SH004-shared-element-trajectory.json)과 [trajectory contact](../../video/qa/episode-001-work-v01/trajectory/SH003__SH004-shared-element-contact.png)에서 확인하고, boundary [artifact](../../video/qa/episode-001-work-v01/rendered/EP001-Boundary-SH003-SH004-Provisional.mp4)와 identity samples를 함께 검토한다. 하나라도 invalid ID, missing mapping, zero delta, fallback, hash 불일치이면 PASS가 아니라 재검수 대기다.

## 2026-08-29 선택적 treatment 학습과 구현 게이트

레퍼런스에서 학습할 treatment는 전체 장면의 장식 필터가 아니라 목적이 있는 레이어 단위 처리다. 차트의 paper/grain, collage의 일부 요소에 대한 2-frame posterize, chart/character의 restrained boil, reel의 texture sandwich를 참고하되, 현재 captured source에는 정확한 helper 구현이나 보편적인 수치 표준이 없다. Source: [MoSidd treatment study](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt), [collage transcript](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt), [reel transcript](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).

따라서 treatment는 다음 소유권으로 분리한다.

- `episode-spec/manifest`: beat의 treatment 의도, target component/role, frame window, 파라미터와 제외 대상.
- `asset-sheet`: background/midground/foreground와 protected zone, treatment가 건드릴 수 없는 읽기·얼굴·출처 영역.
- `effects catalog`: 외부 효과 파일만 기록하며, 실제 파일·출처·권리·기술검사·SHA-256이 없으면 후보일 뿐이다.
- `runtime/operator registry`: 실제 화면 변화를 구현하고 operator evidence를 제공할 때만 `implemented`로 승격한다. 계획 이름만으로 animation 또는 treatment를 주장하지 않는다.
- `review ledger`: no-treatment/treatment A/B의 동일 frame/window, 1080p·360×203 출력, 보호 영역 difference mask, runtime·manifest·asset-sheet·artifact 해시를 결속한다.

계획 operator는 최대 다섯 개로 제한한다: `paper.background@1`, `grain.overlay@1`, `tone.selective@1`, `highlight.sweep@1`, `boil.seeded@1`. 이 중 `grain.overlay@1`만 EP001 SH003에서 deterministic static procedural SVG-tile operator로 구현된 후보이며, 나머지는 `planned / not implemented / not PASS`다. 최소 기법 개수는 강제하지 않으며, 각 visual beat의 설명 관계에 필요한 observable action만 선택한다. 제안 bounds는 프로젝트의 editorial inference다: grain opacity 0.02–0.035(최대 0.045), halftone 5–8px·opacity 0.02–0.05(최대 0.06), highlight 12–20f·opacity 0.25–0.42·beat당 1회, boil은 2f마다 갱신하고 ±1px·±0.15°·±0.003 scale 이내다. reading hold에는 camera/document motion과 treatment motion을 겹치지 않는다. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [operator registry](../../video/src/vox/motion/operator-registry.ts).

EP001의 첫 treatment 후보는 SH003 architecture/background와 SH004 decorative route/folder 영역의 저강도 static grain뿐이다. 실제 구현은 SH003에만 적용했고 SH004는 untreated로 남겼다. SH003의 두 action은 background 0–299프레임과 `rear-wall-b01` 15–299프레임이며, 둘 다 현재 opacity `0.035`, fixed seed `31003`/`31031`을 사용한다. 공식 얼굴, 법률·회의록 정확 인용문, 날짜·숫자·축, source/provenance/AI 라벨, official video frame과 reading hold는 protected target으로 두고, tone/highlight/boil 및 외부 effect 파일은 beat 필요성과 A/B 검수 전까지 보류한다. 외부 effect catalog는 downloaded 0·approved 0이다. 이전 opacity 0.028 candidate는 superseded다. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [SH004 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH004/manifest.json), [effect catalog](../sources/effect-file-catalog.md), [style bible treatment contract](video-style-bible-v0.2.md#선택적-treatment-계약-2026-08-29).

### 2026-08-29 SH003 grain.overlay 구현·검수 후보 (superseded authority snapshot)

이 subsection의 authority/hash·산출물 요약은 SH005 편입 전의 역사적 스냅샷이다. 현재 authority, 물리 컷 수, composition ID, production-state 및 산출물 hash는 아래 `SH005·SH006 implementation boundary and regression gate` subsection을 우선한다.

`grain.overlay@1`은 외부 effect file이 아니라 고정 seed를 사용하는 정적 SVG tile runtime이다. 매니페스트는 `effects_required=false`, `effects=[]`를 유지하며 effects folder도 만들지 않는다. Kim/Park/bill은 alpha-core, labels/source chrome은 render-order로 보호한다. [PresentationScene](../../video/src/vox/scene/PresentationScene.tsx)와 [operator registry](../../video/src/vox/motion/operator-registry.ts)가 실제 operator를 제공하고, manifest·asset-sheet·treatment contract·runtime·render input은 현재 authority hash에 결속된다. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [SH003 asset sheet](../../video/public/assets/episode-001-work-v01/cuts/SH003/asset-sheet.json), [production state](../../video/episodes/episode-001/production-state.json).

현재 0.035 candidate의 동일 frame/window A/B 자동 QA에서 1920×1080 normal output은 28,925/2,073,600 changed, max delta 6, 360×203 mobile은 6,043/73,080 changed, max delta 1, protected alpha-core는 0/361,694 changed였다. protected-isolation before/after PNG files는 각각 SHA-256 `e667f8a598ba999284ac7700b30f6d0a170550c5f3194087400f211fb6b08526`으로 byte-identical이며, ledger raw RGBA pixel identity는 `ca0f1f3b8ca70f47739be389be8e25dbdd1728482ba7277bc5a4f2f96fe1aca5`다. A/B contact SHA는 `75e426f007ff310d78b4a640063faa7b2af28b22b21633de4fa8548488f2706b`, review ledger SHA는 `b5babbcb85bcc752af3dc11487c9df6d7a14eb552c1d48c1aacb7866a96cfd63`다. 이는 automatic QA를 통과한 implemented candidate이며 user visual-quality PASS·production PASS·final은 아니다. Source: [selective treatment QA](../../video/qa/episode-001-work-v01/review-ledger.json#selective_treatment_qa), [A/B contact](../../video/qa/episode-001-work-v01/treatment/SH003-treatment-ab-contact.png).

현재 authority hash는 catalog `9e281f4a0d3afb0a71bb987ba5da75238baadf53f5cbcd358ba3c6320236156f`, production-state file `dd761eadc71fd51a9f64c0d7600e139c8b74043b7bfd2c063b2609f0cbf00dac`, manifest set `94fc86e6c660bc145b3ba7a21fd1a220c0af860d25962f7dbfc5a7b118b73613`, treatment contract set `8389c76af7bbedb6d3ea065e6f845b82619b3d53a16da438313ab2f4d63eb714`, render input `bf8ea9750f743eeb4a248095fc0ba45d6a4266600d2d780cec5e72ca219921d5`다. Asset-sheet/runtime hash는 이전 후보와 동일하다. Provisional artifacts are episode `4be7df8e57d8fde227208158c5010997bdd746d23ea7a6fb0dbbb04ae51cef4c`, SH003 `eba98769ac491aaa2250771cb84729ae3e4ee9dfeec4ddbcd2d11044460a4667`, SH004 `cc454eaf9c49339d09d91f9498780b33dd8ca0c635c980511bd12512c4711e7a`, boundary `ae8756f37126cd5f98e7a97963ad03e3ca3e144bf3829bab28747f90d051a4ec`. The state remains `timing-draft`, active root null, 4 derived composition IDs, user/cut PASS false, rights pending, and Omni blocked. Source: [production state](../../video/episodes/episode-001/production-state.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

### 2026-08-29 SH005·SH006 implementation boundary and regression gate

SH005는 기술/ provisional candidate다. self-authored route-map SVG SHA는 `de530ba021c5714970eb2ce8ec4bc738f6194738d0461d417f5ee5a4450c7459`, byte-identical copied case-folder SHA는 `26858b7950a3268e107e38587842a71513cc67769fbfff97d61d1a04a129c0ca`다. `svg.stroke-draw@1`은 101–122프레임과 122–143프레임에 두 경로를 순차적으로 그리고, B01/B02 reading hold는 각각 41–101/143–203프레임이다. LAW-196/1972 evidence claim review가 blocked이므로 formal cut PASS가 아니다. Source: [SH005 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH005/manifest.json), [SH005 asset sheet](../../video/public/assets/episode-001-work-v01/cuts/SH005/asset-sheet.json).

SH004→SH005 `scene.shared-element@1`는 30프레임이며 사건파일 mapping을 `(580,130,760,520)`에서 `(120,380,360,246)`으로 non-zero 이동시킨다. [Trajectory](../../video/qa/episode-001-work-v01/trajectory/SH004__SH005-shared-element-trajectory.json), [boundary artifact](../../video/qa/episode-001-work-v01/rendered/EP001-Boundary-SH004-SH005-Provisional.mp4), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json)가 이를 결속한다. SH006은 current root/catalog에 없고 LAW-REVISION-21857 후보·정확 transcription/crop·reviewer/right approval은 blocked다. `camera.transform@1`, `mask.inset@1`, `document.highlight@1`은 action-gated generic adapter로 구현·테스트됐지만 SH006 materialization이나 `highlight.sweep@1` treatment 구현을 뜻하지 않는다. Source: [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [operator registry](../../video/src/vox/motion/operator-registry.ts), [episode spec](../../video/episodes/episode-001/episode-spec.json).

첫 adapter가 neutral transform/clipPath를 무조건 내보내 Chromium AA baseline을 바꿔 A/B changed count를 124,425로 만든 회귀는 action-gated CSS와 non-leakage regression test로 수정됐다. 수정 후 SH003 0.035 candidate는 desktop 28,925/2,073,600 changed (max 6), mobile 6,043/73,080 (max 1), protected 0/361,694로 복원됐다. **다음 canonical 기록은 SH005 편입 전의 역사적·superseded 스냅샷**이다. 당시 canonical check는 정확히 한 번 실행되어 stale 2-cut expectations 두 건에서 `200 pass / 2 skipped / 2 fail`로 중단됐으며 build에 도달하지 못했다. focused typecheck/tests 16/16, implementation suite 25/25, render-authority/production-stage/render-review는 통과했고 canonical은 재실행하지 않았다. 현재 검증 권한은 아래 `2026-08-29 SH006 source-photo provisional implementation` subsection으로 이동했다. SH006 초기 구현 후 canonical `pnpm run check`는 정확히 한 번 `210 pass / 4 fail / 2 skip`에서 중단되어 build에 도달하지 못했으며, findings 수정 뒤 canonical은 재실행하지 않았다. Source: [PresentationScene](../../video/src/vox/scene/PresentationScene.tsx), [operator registry](../../video/src/vox/motion/operator-registry.ts), [SH003 treatment QA ledger](../../video/qa/episode-001-work-v01/review-ledger.json), [SH006 source approval](../../src/lib/sh006-source-approval.ts).

### 2026-08-29 SH006 official source-lock QA bundle (superseded status)

SH006 source-lock은 이후 구현 전의 **역사적 source-comparison QA artifact**다. 별도 [source-comparison approval marker](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-source-comparison-approval.json)가 원본·crop·contact 비교만 승인했으며, 아래 최신 provisional implementation subsection이 현재 상태를 정의한다. 이 marker 자체는 immutable source-lock artifact를 바꾸지 않고, cut/PASS/production/rights approval을 기록하지 않는다. 생성기는 [build-sh006-source-lock.mjs](../../video/scripts/build-sh006-source-lock.mjs), 집중 검사는 [sh006-source-lock.test.mjs](../../tests/sh006-source-lock.test.mjs)다.

원본 후보는 국가법령정보센터 [형사소송법 일부개정법률](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all) 화면이며, 제목·번호·일자는 `형사소송법 일부개정법률`, `법률 제21857호`, `2026. 8. 4. 공포`, `2026. 10. 2. 주된 시행`으로 metadata에 분리해 기록했다. 원본 파일은 확장자 `.png`지만 실제 MIME은 JPEG이고 1280×720, SHA-256 `118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b`다. crop은 blue header/logo와 gray UI/control을 제외한 `(left 320, top 65, width 640, height 88)` 픽셀(정규화 `0.25, 0.0902777778, 0.5, 0.1222222222`)이며 결과 PNG는 1600×220, SHA-256 `d135a00b8bc4a98b84f154bbfafd89c26e5680b9d3a5169cfd4de34fd0c7c434`다. contact는 1920×1080 PNG, SHA-256 `b9a8029c33ed4bca5c2207d4ff8848d637cc5285bf9d6dba19590d0b5ebf6743`다.

정확 전사 후보는 날짜를 섞지 않고 두 줄 그대로 `⊙법률 제21857호` / `형사소송법 일부개정법률`이며 76px로 제시했다. 법률 원문에 관한 권리 경계는 국가법령정보센터의 [저작권 및 공공데이터 이용정책](https://www.law.go.kr/lawPetitionForm.do?menuId=13&subMenuId=79)과 [저작권법 제7조 제1호](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769)에 근거해 법률 텍스트와 사이트 UI를 분리한다. 제7조 제1호의 법률 원문 제외 범위가 사이트 로고·아이콘·UI까지 자동 승인하는 것은 아니므로, site UI는 별도 검토 대상이고 DB asset approval은 `pending`, `rights_approved=false`로 유지한다.

이 source-lock 단계의 canonical check 기록은 이후 구현 전의 역사 기록이며 현재 검증 수치가 아니다. SH006 source-lock 집중 검사는 4/4 통과했다. Source: [source-lock JSON](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-source-lock.json), [focused test](../../tests/sh006-source-lock.test.mjs).

### 2026-08-29 SH006 source-photo provisional implementation (superseded by hi-res facsimile)

사용자의 `다음 진행해`는 별도 marker에 의해 공식 원본·정규화 crop·contact 비교 승인으로만 해석한다. 이는 SH006 cut PASS나 법률 원문 외 국가법령정보센터 UI·로고·아이콘의 이용 승인, Omni 승인, episode stage advance가 아니다. 전체 스크린샷 media asset 329와 review queue 1311은 `reviewed_at=null`인 pending 상태를 유지한다. evidence source는 node 2411이며 `DOCUMENTED_BY` edge 1469가 이를 연결한다. 승인 범위는 `SH006-statutory-document-content-v01` scoped derivative뿐이고 generic/full screenshot 요청은 거절되며 law.go UI/logo는 제외된다. Source: [approval marker](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-source-comparison-approval.json), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [SH006 source approval](../../src/lib/sh006-source-approval.ts), [official intake registry](../../video/source-intake/episode-001/official/intake-registry.json).

결정론적 파생은 raw SHA `118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b`·1280×720을 입력으로 하고 recipe SHA `08006efbfcc717af6e3a1b88721aa07ed4cf9b87df00cdaf01082aabd6e12b9a`에 결속한다. sanitized overview는 1600×800 PNG, SHA `21bec8582b1e56a4a2a80029b7ba905a4c9fa77f66b0b7a6c1c4b2c7e7e38c20`이며, approval 단계에서 mutation 전에 실제 바이트를 재계산하고 tamper를 거부한다. 법률 원문은 [저작권법 제7조 제1호](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769)의 범위로 검토하되, site UI/logo/icon은 별도 권리 영역이고 `rights_approved=false`를 유지한다. Source: [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [source approval](../../src/lib/sh006-source-approval.ts), [materializer](../../src/lib/video-asset-materializer.ts), [derivation helper](../../src/lib/sh006-document-derivation.ts), [approval marker](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-source-comparison-approval.json).

SH006 source-photo provisional은 현재 sole EpisodeTimeline catalog에 편입된 4번째 물리 컷이다. SH003–SH006은 총 788프레임이며 catalog에는 episode·4 cut windows·기존 2 boundaries의 7 composition ID가 있다. remotion→source-photo 경계에는 SH005→SH006 morph/shared-element 주장을 만들지 않는다. SH006은 198프레임(30fps), 66프레임짜리 3 beat로 구성된다: F0은 background-only, B01은 clean overview reveal과 60프레임 hold, B02는 승인 title/date crop과 60프레임 hold, B03는 정확한 2줄 76px quote와 60프레임 hold다. production frame에서는 site UI를 제외하고, 한국어 label과 observable ready components를 사용한다. stage는 `timing-draft`, `active_cut_root=null`, user/cut PASS false, Omni blocked를 유지한다. Source: [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [production state](../../video/episodes/episode-001/production-state.json).

SH006 provisional 산출물은 [MP4](../../video/qa/episode-001-work-v01/rendered/EP001-Cut-SH006-Provisional.mp4) SHA `1f14de861f93b03c4e81514ab0f73c24e9e648e4f9bfa68a72ef84272c1bbb65`, [full contact](../../video/qa/episode-001-work-v01/rendered/SH006-full-cut-contact.png) SHA `cc80c81d53a7ec17331febbf329050f1be08d3d8cbda2d697d1be444176c9045`, [mobile reading contact](../../video/qa/episode-001-work-v01/rendered/SH006-mobile-reading-contact.png) SHA `d8a3c063015bed76b597de2cda11b3b83a2a30681049f3e2db9e39b81a4182be`, background-only F0 SHA `e7c4e0673c676189d14f7b3721aa67dceba589def87d9fcd454e66ff8f728e69`다. review ledger SHA는 `af84c975f8577614b0baf02c4376e7266b04ff96ca893ee0a1467dfc4ec2908f`, catalog SHA는 `1195000e31c13bf0e535574da6ab0492e380a3ac1cae6354adab00baf44e4fe4`다. 사람의 시각 품질·가독성 검수는 여전히 pending이며 cut PASS가 아니다. Source: [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json), [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json).

구현 후 canonical `pnpm run check`는 정확히 한 번 실행됐으나 `210 pass / 4 fail / 2 skip`에서 중단되어 build에 도달하지 못했다. 발견사항은 수정됐지만 canonical은 재실행하지 않았다. 현재 targeted episode tests는 26/26, SH006/materializer는 21/21, final derivation은 9/9, broader focused implementation은 51/51이며 typecheck/validators와 Next production build는 통과했다. independent review는 severity finding 없음이고 human visual quality/readability는 pending이다. Source: [production state](../../video/episodes/episode-001/production-state.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json), [SH006 source approval](../../src/lib/sh006-source-approval.ts).

### 2026-08-29 SH006 source-photo high-resolution facsimile (superseded by paired statutory change)

사용자는 앞선 1280×720 JPEG 캡처를 확대해 만든 SH006 후보의 문자 가독성이 부족하다고 판단했다. 따라서 그 raster overview와 header crop은 삭제하지 않고 `source-lock/derived/superseded`로 이동한 역사 입력으로 기록하며, 현재 후보는 공식 원문을 대조한 뒤 UI·로고·아이콘 없이 재조판한 source-backed facsimile를 사용한다. 이 품질 거부와 교체 상태는 [SH006 manifest의 superseded 목록](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json#L466)과 현재 `v02-hires-facsimile` 계약에 결속된다.

새 source-photo 입력은 컷 폴더 안의 실제 디코드 가능한 파일이어야 하며, `source-photo/sh006-document-overview-hires.png`(2400×1350, SHA-256 `a654e38afb57bf1001ab697eb12b27c1ffcee096393d53f1db28372cfc299943`)와 `source-photo/sh006-document-focus-hires.png`(2400×720, SHA-256 `72edc08790cfe461c216928968ee8e6f39aaf5597bdd481b8cb22aa2620e3cf2`)를 물리 입력으로 보존한다. 두 파일은 [SH006 manifest의 presentation derivatives](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json#L478)와 컷별 `source_photo_inputs`에 등록돼 있으며, 출력 확장자만으로 유효성을 주장하지 않고 decode·크기·SHA-256을 검증한다.

파생은 국가법령정보센터 [형사소송법 일부개정법률](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all)의 원문 내용에 한정한다. 원본 parent capture SHA-256은 `118c6f456955549e3a38ff6ee46bb885dffc8b5f402450151296a75e0c7e045b`이고, 정확 문자열은 `⊙법률 제21857호`와 `형사소송법 일부개정법률`이다. 재조판 recipe SHA-256은 `5fc8e21e6c8862881a1ea5effb38454f90ae26e2576b099155e5fd5621d68f3e`, scoped authorization은 `SH006-statutory-document-content-v02`다. 이 범위는 법률 문서 내용만 허용하고 국가법령정보센터 UI·로고·아이콘과 전체 스크린샷 재사용은 제외한다. Source: [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json#L439), [source approval implementation](../../src/lib/sh006-source-approval.ts#L19), [facsimile derivation helper](../../src/lib/sh006-document-derivation.ts#L33).

B01은 고해상도 재조판 overview, B02는 문서 제목·날짜의 native framing focus, B03은 두 줄 exact retypeset quote 순서다. B02는 모바일 360×203에서도 읽기 흐름을 확인하는 별도 disclosure contract를 가지며, 현재 review profile은 `source-photo-treatment`다. [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json#L421)와 [mobile reading contact](../../video/qa/episode-001-work-v01/rendered/SH006-mobile-reading-contact.png)가 이를 결속하지만, 자동 검사는 사용자 품질 승인이나 cut PASS가 아니다.

현재 검수 산출물은 SH006 provisional MP4 SHA-256 `1705e847baeffc0d4d91a2d7a397eaf25edc52ff173f4fa734cb2d8f21e5eb81`, episode provisional MP4 `cc2f9093248d24af79740b177a82b0f4b7783a46fbd357e6f2bded58d3c92cd6`, full contact `878a1c69954974770dc8883bbdd05976b97626d2eae52b0b58184f4568770eb3`, mobile reading contact `f931516f904b4546752bc642298ca43b73d976b2c98f846240b60d2e78ab20eb`, unchanged background-only F0 `e7c4e0673c676189d14f7b3721aa67dceba589def87d9fcd454e66ff8f728e69`다. review ledger SHA-256은 `c17015f07fb38473260fdb31dc8fe229b77acb00a9d3c8ef5969fdf461a14cea`, catalog SHA-256은 `60d121db8fc4299b0b4d323298bc9ee85bec0e52872e0d2e0b7162c4b090fb26`이다. [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json)와 [render catalog](../../video/episodes/episode-001/generated/render-catalog.json)이 각 artifact·profile·authority hash를 결속한다.

집중 검증은 15/15 통과했고 독립 review에는 남은 code/media severity finding이 없었다. hi-res 교체 후 canonical `pnpm run check`는 정확히 한 번 실행되어 typecheck·episode-spec·render-authority까지 통과했지만, acquisition 단계에서 queue의 spec hash drift를 발견해 exit 1로 중단됐다(기대하던 구 hash `9d2ed...`와 새 episode spec hash `9fabd13a2ccb9fe4333b4fa22cb8cb7be4fab746f8a1ba032a9edf376a6e7253` 불일치). 따라서 그 실행에서는 tests와 build에 도달하지 않았다. 원인은 `pnpm video:prepare-acquisition`으로 수정했고, 이후 targeted acquisition validator가 통과했다. 갱신된 queue SHA-256은 `cb9017894fdf9e6372623b0d1f8b9e8285c1ab8c990e8ba631359764397ea3c2`이며 169 requirements·15 candidates·13 source IDs·94 links·19 missing·56 blocked·0 approved/materialized·1 historical candidate를 기록한다. 후속 단계는 개별 검증으로 cut-design 48 cuts/15,179f, cuts·effects·narration 505.967초 provisional·production stage·visuals가 통과했고, tests는 220 total/218 pass/2 skip/0 fail, Next build도 통과했다. 이는 canonical 전체 통과가 아니며 두 번째 canonical 실행도 아니다. 사용자 시각 품질 검토·cut PASS·rights approval·episode stage advance는 아직 pending이고 상태는 `timing-draft`, `active_cut_root=null`, Omni blocked를 유지한다. Source: [production state](../../video/episodes/episode-001/production-state.json), [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json), [episode spec](../../video/episodes/episode-001/episode-spec.json), [prepare acquisition](../../video/scripts/prepare-episode-acquisition.mjs), [acquisition validator](../../video/scripts/validate-episode-acquisition.mjs), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

### 2026-08-29 SH006 paired statutory-change source-photo candidate (superseded by viewer-first Remotion explanation)

사용자는 제목·법률번호만 반복하는 198프레임 후보가 `무엇이 바뀌는가`를 전달하지 못한다고 판단했다. 현재 SH006은 30fps·264프레임 `v04-paired-statutory-change-safe-card-layout`이며, 임시 대본 `검사의 직접수사 근거인 제196조는 삭제됐지만, 보완수사요구와 재수사요구는 남았습니다.`와 사용자 실측 4.965자/초를 기준으로 한다. 네 beat는 각각 6프레임 진입과 60프레임 안정 읽기를 갖는다: B01 법률 제21857호·2026-10-02 시행 출처 인증, B02 `제196조를 삭제한다.`, B03 제195조제2항 중 `보완수사요구, 재수사요구 등 / 이 법률에서 정하는 직무를 수행한다.`, B04 `직접수사 일반 근거 삭제 / 보완수사요구·재수사요구 존속` 병렬 비교다. 서면 이유·내용과 1개월 기한은 후속 컷의 설명 책임으로 남겨 SH006에 넣지 않는다. Source: [episode spec](../../video/episodes/episode-001/episode-spec.json), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [official statutory text](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all).

법률 사이트 전체 캡처는 제작 화면에 쓰지 않는다. UI 없는 공식 원문 기반 재조판 입력은 [source authentication](../../video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-source-authentication.png) SHA `2e4a210aa411a735e233c0c7a8239722f6310f1da6611cccc9bd6cd0a9dcc1d6`, [제196조 삭제](../../video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-article-196-deletion.png) SHA `b69082320643a3236f1e36d3959b0a2bf49b91bbafc59398634e21e06bfd3793`, [제195조제2항 존속](../../video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-article-195-retained.png) SHA `487bfdfc23c564849bb8e033608ce9e9902351a34261245988cd7cfe02a424ed`다. recipe SHA는 `63f8e8115189052c03518ca5645e40756ccae7611b1e7739f15965f43b070ec6`, 정확 전사·사용 범위를 고정한 marker SHA는 `83b97dda5ac240346d30f2df2460fb12c831572ec21bfbbe5d0bd1df5b0fc000`다. marker는 cut PASS·rights·Omni·단계 승인을 부여하지 않는다. 제목 전용 고해상도 후보와 underline/provenance 겹침·badge clipping이 있던 최초 비교 PNG는 삭제하지 않고 `source-lock/derived/superseded`에 보존한다. Source: [derivation helper](../../src/lib/sh006-document-derivation.ts), [source contract](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-paired-statutory-text-contract.json), [manifest superseded records](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json).

현재 단일 EpisodeTimeline catalog은 SH003–SH006 854프레임이며 catalog SHA는 `2ac88dee6b6bc5928635e674cb18cc0dd428a40a4c5d9539d163d9147b3e9e2a`다. SH006 provisional MP4 SHA는 `7000a9d6b0747d619b70b803eac06f918d7e2c11d034d01fa3bfb48f31933b56`, episode provisional MP4 `df7dd550e0ef2619320ae385ed67e51d38df9427a031fcd1888a67dcb6867326`, full contact `c117a1005a3be3fc417c184341d72dab5084ea58156ea176015c4360e2d65348`, mobile contact `72d847f38a1ccdfed827a2a7a23dbf49ecfa49790a292d740d24dd724df5775f`, F0 `e7c4e0673c676189d14f7b3721aa67dceba589def87d9fcd454e66ff8f728e69`, review ledger `82fc168973f49ab141e048ada53e4d3ff24115987cc6b1a9f062043beea73f99`다. SH003–SH005의 영상 및 identity pixel SHA는 변화하지 않았다. 재생·가독성에 대한 사람 검토를 위해 준비된 provisional 후보일 뿐이며 stage는 `timing-draft`, `active_cut_root=null`, user/cut PASS false, rights pending, Omni blocked다. Source: [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json), [production state](../../video/episodes/episode-001/production-state.json).

spec SHA는 `dd13fd096795deb0fe80a15b46873e5bd49558048ff749fe66842bfe095fdf31`이며 48컷·110 semantic beats·15,245 provisional occupancy frames다. 변경 후 acquisition queue는 run 95/96에서 기존 15개 후보를 dedupe했고, targeted validator가 새 spec hash를 확인했다. queue SHA는 `6d895354f1931e4eacf632b6f66b9afe4cc3efbbcc392d25f78224da52eb1f10`; 169 requirements·15 candidates·13 linked source IDs·94 links·19 missing·56 blocked·0 approved/materialized·1 historical candidate다. Source: [episode spec](../../video/episodes/episode-001/episode-spec.json), [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json), [prepare acquisition](../../video/scripts/prepare-episode-acquisition.mjs), [acquisition validator](../../video/scripts/validate-episode-acquisition.mjs).

현재 변경 후 canonical `pnpm run check`는 정확히 한 번 실행했다. 모든 typecheck와 validator는 통과했고, 전체 223 tests 중 218 pass·3 fail·2 Windows symlink privilege skip에서 기존 SH006 198프레임·109 beat·15,179프레임을 고정한 테스트 기대값 세 곳 때문에 중단되어 build에는 도달하지 않았다. production contract를 완화하지 않고 기대값을 현재 권한 값인 SH006 264프레임·110 beat·15,245프레임·catalog 854프레임으로 갱신했다. 영향 테스트는 첫 targeted run에서 35개 중 34 pass·1 stale total-frame fail, 마지막 누락값 수정 후 render-authority 3/3 pass를 확인했으며 별도 Next production build도 통과했다. canonical 전체 재실행은 하지 않았다. Source: [cut-design test](../../tests/episode-cut-design.test.mjs), [episode-spec test](../../tests/episode-spec.test.mjs), [render-authority test](../../tests/render-authority.test.mjs), [render catalog](../../video/episodes/episode-001/generated/render-catalog.json).

### 2026-08-29 SH006 viewer-first Remotion explanation (current)

법률 설명 컷의 첫 질문은 `이 문서가 공식인가`가 아니라 `이 조문이 무슨 역할을 했고 무엇이 달라지는가`여야 한다. 제작 표기, 법률번호, 출처 인증 문구는 시청자용 focal component로 쓰지 않는다. 현재 SH006은 시행 전 제196조가 검사의 범인·범죄사실·증거 수사를 정한다는 역할을 먼저 보여준 뒤, 법률 제21857호의 제196조 삭제와 새 제195조제2항에 남은 보완수사요구·재수사요구 직무를 대비한다. 이는 모든 검사 기능이 사라진다는 주장이나 시행 결과 예측이 아니다. Source: [viewer-first official law source lock §1–§2](../../raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md).

구현 순서는 30fps·812프레임의 다섯 beat다. B01(0–165)은 검사와 수사 대상을 독립 PNG로 보여주고 105–165를 안정 hold로 둔다. B02(165–345)는 시행 전 제196조의 정확 문장을 최대 2줄로 표시하고 285–345를 읽기 hold로 둔다. B03(345–465)은 `제196조를 삭제한다.`를 보여주고 405–465를 hold한다. B04(465–615)는 새 제195조제2항의 남은 요구 직무를 검사→요구서→경찰 경로와 함께 보여주고 555–615를 hold한다. B05(615–812)는 왼쪽 `제196조 삭제`, 오른쪽 `제195조 요구 직무 존속`의 두 영역으로 요약하고 752–812를 hold한다. 임시 대본과 사용자 실측 4.965자/초가 길이 권한이며, reading hold 동안 문서·카메라 motion을 겹치지 않는다. Source: [episode spec](../../video/episodes/episode-001/episode-spec.json), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json).

인물·사람·범죄사실 폴더·증거·시행 전 제196조·삭제문·삭제 표시·새 제195조·요구서·경찰은 10개의 독립적이고 디코드 가능한 PNG다. 제작 recipe SHA는 `d26b9d01e8e0dc543140dc8a734539ab169595110c001330dceef1e278b4fee5`이며 각 입력 SHA는 manifest와 asset sheet에 결속된다. SH005→SH006과 SH006→SH007은 30프레임 `scene.crossfade@1` 전체 장면 전환이다. shared-element mapping이나 pair trajectory가 없으므로 morph로 부르지 않는다. source-photo v04 입력은 provenance history로만 남고 production-visible input이 아니다. Source: [asset generator](../../src/lib/sh006-viewer-assets.ts), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

현재 SH006 provisional MP4 SHA는 `583c73e9df7595c5b4119239835d4ea663e0e47bd285d254f53c24495c5ef7a0`, episode provisional MP4는 `711d475ee073dde5f78d3d0714c2df0b1a6846d27fc00789a34e3a3ce0f5011e`, SH005→SH006 boundary는 `f1caaa3fccbc014e5068a07b326d31cf9c1160808403f2fa3b56873db53486db`, full contact는 `546b6ea9d95aa6abe01c54a9e8bf03ee8744525618ff81af1751e95cb89fc27d`, mobile reading contact는 `6978832cc5f23d593e52f445092cdb6f152b5b2999224271c80906e9ea4880ad`, mobile final은 `9094390a545a229bcbe7af6bde1e83ac48adf43c6e482a46942187a9f65b02de`다. catalog은 1,372프레임·8 compositions·SHA `a793a963d9c4e06abd3b02482c8eeed9433a519224ae9780ee0af74ff0043c27`, ledger SHA는 `d83e4d903463fabaadc3546c9e75f1bede05eab8b5ba5381a6db5565b77779a7`다. 자동 검증은 검수 준비만 증명하며 사람의 cut PASS가 아니다. stage는 `timing-draft`, `active_cut_root=null`, user/cut PASS false, rights pending, Omni blocked를 유지한다. Source: [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json), [production state](../../video/episodes/episode-001/production-state.json).

현재 spec SHA는 `33ed3bfdbfa2bf0c6d135c0d9b53bd2324e0947c7f6b1ac4ac2bcdbb75e9736e`이며 48컷·111 semantic beats·15,746 provisional occupancy frames다. 최신 acquisition queue는 179 requirements·15 candidates·13 linked source IDs·94 links·19 missing·66 blocked·0 approved/materialized·1 historical candidate이며 SHA `c29981ed35b456874389d9c6fe0435bbc5d803f0033f6915ef7425626b42bac6`다. Source: [episode spec](../../video/episodes/episode-001/episode-spec.json), [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json).

### 2026-08-29 SH006 editorial style-frame quality gate (current review candidate)

기존 SH006은 내용 전달은 개선됐지만 서로 다른 clipart 화풍, 흰 UI 카드, 작은 final-summary 요소와 `등장→정지` 중심 구성이 방송용 완성도를 만들지 못했다. 이를 애니메이션 미세 조정으로 고치지 않고 전체 motion 전의 style-frame gate를 새 정본으로 추가했다. 새 visual family 또는 품질 거부 컷은 opening/evidence-or-change/final-summary 세 장의 1920×1080 프레임과 360×203 축소본을 먼저 만들고 사용자의 명시적 style-frame PASS를 받아야 한다. 이 PASS는 cut PASS·rights·Omni·stage 승인이 아니다. Source: [SH006 style-frame manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v01/manifest.json), [production state](../../video/episodes/episode-001/production-state.json).

`SH006-editorial-v01`의 반복 텍스트·출처 겹침 문제는 v02에서 해결했고 v03은 표면 등록을 시험했다. 그러나 v03은 B01의 PNG 아래 라벨까지 회전시켜 사용자의 최종 정의와 충돌하므로 역사 후보로 남기고 production authority에서 제외한다. 현재 `SH006-editorial-v04`는 B01의 범인·범죄사실·증거 라벨을 모두 0°로 되돌리고, B03의 문서 PNG 위에 실제로 겹쳐지는 법률 text group `-0.5° / -7°`와 B05의 문서·요구서 PNG 위 text group `+0.8° / -10.5°`만 표면 회전을 허용한다. 수평 배경 위 주 인용과 104px source chrome도 0°다. Source: [viewer-first official law source lock §1–§2](../../raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md), [v04 builder](../../video/scripts/build-sh006-editorial-style-frames-v04.mjs), [v04 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v04/manifest.json).

v04 contact SHA는 `0808b554b4722be66ff1ea1b5db58b7b42bb76c8e953369717e8401040881e0c`; B01/B03/B05 1080p SHA는 각각 `6678a8fd22c8edfe1ca633da3ad1b8bc88f8d4605dd809db8f32d3cb57769b5b`, `38a2b253288cb19774056336d89c12b5500f5e53df4db71c8e2d07a6eb50017e`, `44dac7d6851bd8a817b19f5788e82225b64a8f2dc3c4d1c2cc13a1b35223bfb2`이고 manifest SHA는 `3f9867981c62294f3f51068c7bbc905d0c48e7867685b8e823e85d54c33b39b4`다. 현재 status는 `pending-user-style-frame-review`이며 production decomposition, cut PASS, rights, Omni, stage advance를 허용하지 않는다. v03 승인 marker와 bundle은 감사 가능한 superseded history로만 보존한다. Source: [v04 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v04/manifest.json), [v03 historical approval](../../video/qa/style-frames/episode-001/SH006-editorial-v03/style-frame-approval.json), [production state](../../video/episodes/episode-001/production-state.json).

### 2026-08-30 visual-family reference gate와 사후 금지 감사 (historical design)

레퍼런스의 완성 구간을 00:00–00:40에서 2초 간격으로 다시 표본화했다. 관찰 가능한 순서는 `publication crop → 동일 배경의 물리 오브젝트 유지 → 가격/숫자 오브젝트 → 차트 → 지도·수치·인물의 누적`이다. 이는 정확한 컷 경계나 이징 측정이 아니라 화면 문법의 표본이며, 영상 전체에 같은 효과를 복사하라는 근거가 아니다. Source: [locked local reference video](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [2-second sample contact](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [source analysis](../sources/vox-style-claude-remotion-reference.md).

당시 EP001의 48컷을 여섯 visual family에 정확히 한 번씩 소속시키는 설계를 사용했다. 이 고정 family/coverage 모델은 v10까지의 human-review 실패 이력으로만 보존하며 현행 production gate가 아니다. 현행 schema v4는 source 승인·local materialization을 먼저 요구하고, 그 뒤 각 cut/visual beat가 승인 grammar에 대해 `applicable` 또는 `not-applicable`과 의미 근거를 선언한다. `applicable`만 exact grammar ID, episode input path·SHA-256, target과 observable delta를 결속해 style-direction 및 playable-parity 검수로 진행하며 family·sample 개수 quota는 없다. Source: [current reference transfer gate](../../video/episodes/episode-001/reference-style-gates.json), [historical v04 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v04/manifest.json), [historical family index](../../video/qa/style-frames/episode-001/reference-style-families-v01/family-index.json), [production state](../../video/episodes/episode-001/production-state.json).

각 컷의 임시 대본·시청자 takeaway·비트별 focal/support/hidden·planned operator·독립 asset target·전환·missing input은 [reference-bound cut blueprint](../../video/episodes/episode-001/generated/reference-cut-blueprint.json)에 결속한다. blueprint는 episode spec과 style-gate SHA에서만 생성하며 직접 편집하지 않는다. `scene-to-scene` 또는 `morph` intent가 있는 컷은 pair artifact 전에는 구현된 전환으로 주장하지 않는다. Source: [blueprint builder](../../video/scripts/build-episode-001-reference-blueprint.mjs), [episode spec](../../video/episodes/episode-001/episode-spec.json), [reference gate validator](../../video/scripts/validate-reference-style-gates.mjs).

금지 감사는 설계 전과 산출물 후 두 번 실행한다. 사후 감사 항목은 placeholder/무관 대체, 한 장 합성 이미지를 독립 모션 증거로 사용, runtime delta 없는 애니메이션 이름, reading hold 중 camera/document motion, pair artifact 없는 morph/scene-to-scene, 전체 컷 PASS 전 Omni video, 설명 텍스트박스를 focal로 사용, 전체 source UI를 읽기 화면으로 사용, 활성 구간 전 hidden component 노출, final summary의 동일 prominence, 대상에서 분리된 target label, render 중 network/generation을 포함한다. 현재 자동 검사는 family coverage·hash·해상도·pending/PASS flags·video 부재를 확인할 뿐 미감·이해·법적 사용권을 승인하지 않는다. Source: [gate contract](../../video/episodes/episode-001/reference-style-gates.json), [validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs).

### 2026-08-30 reference-parity editorial-depth v3와 still-to-playable 게이트

v02 후보는 label collision과 불규칙 간격은 해결했지만, 모든 자산을 같은 크기의 칸에 놓아 레퍼런스의 편집 콜라주 대신 PPT·박물관 진열처럼 보였다. v3는 `메시지 → dominant focal 1개 → supporting/hidden → background·midground·foreground → 의도한 occlusion → final hierarchy`를 presentation contract에 추가한다. Hook은 headline/date crop을 큰 종이 focal로 만들고 공식 원문은 작은 provenance support로 둔다. Assembly는 본회의장 구조를 중경에 유지한 채 실물 인물 PNG와 한글 법안명을 전경에 누적한다. Process는 삭제·존속 결론을 크게, 인물→요구→기관을 작은 깊이 경로로 둔다. 전체 source UI, 동일 크기 카드 열, 설명용 텍스트박스 focal, 종이보다 큰 회색 패널은 금지한다. 각 후보는 참고한 frame, 관찰한 문법, 의도적으로 제외한 요소를 manifest에 기록한다. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [reference sample contact](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [v03 board](../../video/qa/style-frames/episode-001/reference-style-families-v03/EP001-reference-style-family-review-board-v03.png), [layout contract](../../video/scripts/style-frame-layout-contract.mjs).

SH006 v06은 위 계약을 검사 가능한 좌표로 옮겼지만, 큰 제목·동일한 라벨 행·서로 다른 화풍의 자산이 다시 화면의 1차 구조가 되면서 레퍼런스보다 PPT에 가까워졌다. 현재 v07부터 정지 시안도 `제목으로 설명한 뒤 자산을 배치`하지 않고 `한 개의 큰 사물 관계가 먼저 의미를 전달`해야 한다. 화면 상단을 차지하는 슬라이드 제목·중복 설명문은 금지하고, 자막과 내레이션이 담당할 문장은 영상 사물 위에 반복하지 않는다. 인물·건물·사진처럼 출처와 렌더 화풍이 다른 자산은 한 화면 안에서 공통 흑백 인쇄 질감과 하나의 절제된 포인트색으로 통일한다. 문서·사진·인물은 물리적으로 겹치거나 같은 바닥선에 안착해 인과 관계를 보여주며, asset-label은 꼭 필요한 대상 아래 중앙에만 둔다. PNG 표면 위 글자만 그 표면의 각도를 상속하고, 출처 레일과 분리 라벨은 0°를 유지한다. Source: [locked Vox/MoSidd reference 00:06–00:12](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [v07 builder](../../video/scripts/build-sh006-editorial-style-frames-v07.mjs), [v07 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v07/manifest.json).

사용자가 정지 style frame을 PASS해도 곧바로 컷 PASS나 영상 권한이 생기지 않는다. 현행 상태는 선택된 applicable beat별로 `blocked-pre-style-pass → pending-playable-parity → passed-playable-parity`를 적용하며, `not-applicable` beat에는 모션 artifact를 요구하지 않는다. source 승인·materialization 전에는 style candidate를 만들지 않고, 정지 방향 승인 중에도 `timing-draft`·`active_cut_root=null`을 유지한다. 승인 marker는 manifest·contact·wide/mobile output·모든 frame input의 `kind|path|sha256` 정렬 묶음과 일치해야 한다. playable 단계는 해당 beat의 승인 manifest·input bundle, treatment contract 또는 명시적 none, semantic geometry fingerprint, runtime·artifact SHA-256을 결속하고 실제 operator/target과 opacity 이외의 geometry/content-state delta를 제출한다. 각 artifact는 ffprobe에서 1920×1080·30fps·양의 duration, 서로 다른 표본 frame hash, 최소 60프레임 stable hold를 통과해야 한다. 정지 PNG와 fade는 motion proof가 아니며, 자산·처리·geometry·runtime·artifact가 바뀌면 해당 parity를 무효화한다. Source: [reference transfer gate](../../video/episodes/episode-001/reference-style-gates.json), [reference validator](../../video/scripts/validate-reference-style-gates.mjs), [focused regression tests](../../tests/reference-style-gates.test.mjs), [production state](../../video/episodes/episode-001/production-state.json).

위 결속에서 receipt·속성명·DOM data attribute는 추적 메타데이터일 뿐 증거 자체가 아니다. `passed-playable-parity`는 family마다 별도의 `stable_reading_hold.start_frame/end_frame`을 요구하고, action과 hold의 중첩을 금지한다. 각 action target은 hash-bound 승인 manifest의 대표 프레임에서 `dominant_focal_asset_id = inputs[].asset_id = geometry.assets[].id`로 다시 파생하며 입력 SHA-256과 화면 안 `measurement_box`를 갖는다. 검증기는 승인 input과 byte hash가 같은 파일이 `video/public` 아래 존재하는지 확인하고, 정상 composition의 유일 target이 그 파일을 실제 `HTMLImageElement.currentSrc`로 읽은 경우에만 대상 결속을 인정한다. 그 뒤 결속된 TSX runtime을 실제 Remotion entrypoint로 번들링해 composition을 실행하고, action 시작·끝과 hold 시작·중간·끝의 직접 렌더 프레임을 제출 MP4의 같은 프레임과 대조한다. 별도의 장면 작성 `target-isolation` 모드는 사용하지 않는다. 검증기가 스크린샷 직전에 target node만 `visibility:hidden`으로 바꾸며, 정상/숨김 lossless 프레임의 1920×1080 차분을 target 기여 mask로 삼아 translation·형상 변화와 제출 MP4의 target 영역 보존을 측정한다. 제출 MP4 전체 프레임의 원해상도 mean·p95·match-fraction, 64×64 지역 타일의 mismatch-fraction·mean, 고차이 픽셀의 8-connected component 상한을 함께 적용해 작은 주변 supporting object와 가느다란 connector 누락도 차단한다. action 끝 DOM rect는 승인된 geometry bbox에 32px 이내로 수렴해야 하고 hold는 연속 픽셀 안정성을 통과해야 한다. 따라서 장면 분기 전용 decoy, 승인 해시 문자열만 단 다른 이미지, 같은 box 안 다른 asset의 움직임, 작은 focal 또는 supporting asset 누락을 전체 평균으로 숨긴 영상, composition 이름만 적은 파일, 손으로 만든 receipt, 전체·국소 fade-only, 2초 내내 움직이는 영상은 통과하지 못한다. Source: [Remotion target-contribution proof](../../video/scripts/remotion-parity-proof.mjs), [reference validator](../../video/scripts/validate-reference-style-gates.mjs), [focused regression tests](../../tests/reference-style-gates.test.mjs), [masked pixel regression](../../tests/remotion-parity-pixel-binding.test.mjs).

### 2026-08-30 SH006 real/official-source style candidate v08

사용자 정책에 맞춰 v07의 비인물 self-authored/editorial raster를 폐기하지 않고 역사로 보존한 채, 사람 asset만 예외적으로 imagegen을 허용하는 새 정지 시안을 만들었다. B01은 `fictional-generic` imagegen 인물과 사건 파일 실사 사진을 사용한다. B03은 국가법령정보센터 source-lock에서 exact quote를 가져와 v08 전용 evidence-view로 결정론적으로 재조판한다. 현재 제196조 카드는 1200px, 삭제문은 504px 표시 폭이며 source font·source dimension·표시 폭으로 계산한 `effective_font_px_1080=84`를 기록한다. B05는 왼쪽의 imagegen fictional supporting person → 1200px 폭의 중앙 새 제195조 제2항 evidence-view → 오른쪽의 Wikimedia Commons 실제 경찰청 건물 순서이며, 문서가 dominant focal이다. 경로는 공통 `connector_specs`에서 SVG와 manifest geometry를 함께 생성하며, 두 connector 모두 실제 asset 경계에 닿는 arrowhead를 가진다(`up-right`, `right`). 모든 비인물 raster는 실사/공식 source 또는 source-derived evidence-view로 고정하고, 라벨과 source rail은 0°이며 asset 아래 전용 레인에 배치한다. `supersession_is_historical_only=true`로 style 비교 후보와 production authority를 구분한다. Source: [v08 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v08/manifest.json), [v08 contact](../../video/qa/style-frames/episode-001/SH006-editorial-v08/outputs/SH006-editorial-real-source-v08-contact.png), [imagegen person manifest](../../video/qa/production-assets/episode-001/SH006-person-imagegen-v01/person-asset-manifest.json), [law source lock](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-paired-statutory-text-contract.json), [viewer-first text lock](../../video/qa/episode-001-work-v01/source-lock/SH006/SH006-viewer-first-text-contract.json).

v08는 `asset_origin_policy` v1을 선언하고 독립 raster 전부를 `asset_class`·source kind·source ID·source path/URL·license·SHA-256에 결속한다. imagegen은 가상 인물 1개에만 사용되며, 원본 v01의 halo를 alpha 192 기준으로 결정론적으로 제거한 clean derivative를 사용한다. checkerboard가 픽셀에 구워진 v02는 rejected로 기록하고 사용하지 않는다. 세 법률 asset은 각각 실제 source-lock 경로/해시, locator, exact/display quote, source dimensions·render font·display width, `overview → normalized-crop → exact-retype` 세 단계 local path/해시와 독립 derivation recipe/hash를 manifest에 기록한다. 상태는 `pending-user-style-frame-review`, `production_visible=false`, user style/cut PASS·rights·Omni·stage advance false다. 정지 시안 자동 검증은 정책·디코드·크기·해시·배치만 확인하며, 사람의 이미지 생성 적합성·권리와 최종 미감 승인을 대신하지 않는다. Source: [asset policy validator](../../video/scripts/asset-origin-policy.mjs), [imagegen person manifest](../../video/qa/production-assets/episode-001/SH006-person-imagegen-v01/person-asset-manifest.json), [focused style test](../../tests/sh006-style-frame.test.mjs), [production state](../../video/episodes/episode-001/production-state.json).

### 2026-08-30 full-card flip 모션 방식 오디션 v04

정지 시안에 단일 spring만 얹는 문제를 분리해서 검증하기 위해 B03→B05의 inactive Remotion 모션 방식 오디션을 만들었다. 기존 세로 wipe는 서로 다른 법률 문구의 음절을 잘라 동시에 보여 주거나 빈 문서를 만들었으므로 실패 이력으로 보존하고, v04는 동일 문서 셸 안에서 outgoing 전체 카드가 `rotateY(0→-90°)`, incoming 전체 카드가 `rotateY(+90→0°)`로 이어지는 18프레임 full-card flip-swap을 사용한다. F141·F234는 각각 1프레임 종이 edge이고, 잘린 두 문구를 동시에 노출하지 않는다. 제196조 취소선은 `[120,141)`에 유지한다. Source: [v04 runtime](../../video/src/sh006-vox-motion-calibration-v04.tsx), [v04 manifest](../../video/qa/style-calibration/episode-001-sh006-vox-motion-v04/manifest.json), [transition contact](../../video/qa/style-calibration/episode-001-sh006-vox-motion-v04/SH006-vox-motion-contact-v04.png).

읽기 구간은 F60–119, F150–224, F270–329, F390–449로 고정하며 각 구간의 시작·중간·끝 raw pixel SHA-256이 동일하다. final에서는 중앙 제195조 문서를 dominant focal로 유지하고, 가상 검사 역할 인물과 실제 경찰청 사진은 독립 진입한 support로 둔다. 두 asset-label은 대상 아래 32px, 중심 오차 0px, 회전 0°다. 경로는 사용하지 않는 SVG 파일을 입력으로 주장하지 않고 runtime-bound deterministic explanatory overlay와 runtime SHA에 결속한다. Source: [v04 manifest](../../video/qa/style-calibration/episode-001-sh006-vox-motion-v04/manifest.json), [focused test](../../tests/sh006-vox-motion-calibration-v04.test.mjs), [360×203 final hold](../../video/qa/style-calibration/episode-001-sh006-vox-motion-v04/final-hold-360x203.png).

이 결과의 허용 명칭은 `Vox-inspired motion method audition`뿐이다. MP4 SHA-256은 `562db7bb5a181817e27d3a6903552e2a51ce4c5da0bc7828d9e0afc569eaa49f`, contact는 `458b2f789f40e1a9b353d84cad519c87cd37f229ced9761f0c1b41e6ca0bb0c0`, mobile final은 `c59a806ee4c49d22dbd973e699a332092a60a515f67c6a81075859d4dcab51a6`, runtime은 `541015490c4535a7906b72ed37167a8675db5d858e1107a24518704bf0ece3ae`다. 독립 검수는 이 한정된 제시에서 P0/P1 없음으로 판정했지만, manifest와 production state는 production authority·user/style/cut PASS·rights·Omni·playable parity를 모두 false로 유지한다. Source: [v04 manifest](../../video/qa/style-calibration/episode-001-sh006-vox-motion-v04/manifest.json), [production state](../../video/episodes/episode-001/production-state.json).

### 2026-08-31 reference-first calibration 선행 게이트

`faithful reference reproduction`은 원본 픽셀 복제가 아니라 `reference-derived grammar prototype`을 뜻한다. 소재는 교체할 수 있고, 관찰된 역할·관계·깊이·텍스트 표면·모션·전환·처리만 동결 allowlist에서 가져온다.

allowlist는 [EP001 grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json)의 entry object로 관리한다. 현재 active 정적 관찰 ID는 `persistent-editorial-background`, `dominant-concrete-focal`, `supporting-source-object`, `layered-collage`, `background-midground-foreground`, `source-surface-text`이며 contract status는 `pending-human-grammar-approval`이다. `chart-self-draw`, `hard-cut`, `paper-print-texture`는 still만으로 실행을 입증할 수 없어 `pending_evidence_entries`에 보류했다. `persistent-source-rail`, `shared-baseline-accumulation`, `declared-shared-plane`, `document-crop-reveal`, `camera-reframe` 및 label/source-rights는 근거 부족으로 활성 grammar에서 제외했다. 사용하지 않는 category는 binding 0으로 남길 수 있다.

#### 2026-08-31 observed-grammar allowlist 보정

레퍼런스 학습의 목적은 원본 화면의 픽셀을 복사하는 것이 아니라, 레퍼런스에서 실제로 관찰된 시각 문법만 우리 소재에 이식하는 것이다. 원본 still·timecode·side-by-side는 관찰 위치와 무결성을 증명하는 locator이며 후보 화면이 원본과 픽셀 유사해야 한다는 뜻이 아니다. 정치인·건물·법률·뉴스·차트 데이터는 우리 출처로 교체할 수 있지만, 각 화면 요소의 역할·배치 관계·깊이/가림·텍스트 표면 역할·모션·전환·처리는 [동결된 grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json)의 ID에 결속해야 한다.

미래 PASS manifest에는 `reference_grammar_contract_version=1`과 `reference_grammar.bindings`를 기록한다. `visual_object_role`, `layout_relation`, `depth_occlusion`, `text_surface_role`, `motion_operator`, `transition_operator`, `treatment`의 모든 visible component/action/transition/treatment는 하나 이상의 관찰된 ID에 매핑되어야 하고 `unmapped_visual_grammar=[]`, `novel_visual_grammar=[]`여야 한다. 레퍼런스에 없던 설명 카드·범용 텍스트 박스·장식 아이콘·새 이펙트·새 전환은 금지한다. 필요한 새 문법은 추가 레퍼런스 연구→정확한 관찰 evidence→사람 승인→allowlist 갱신 후에만 사용할 수 있다.
`approved_subset`은 실제 모든 binding에서 사용한 grammar ID의 중복 없는 정렬 집합과 정확히 같아야 한다. 승인 marker의 `reviewer`는 자동화 주체가 아닌 실제 `user`만 허용하며, `pending_evidence_entries`는 일곱 category 안에서 전역 ID·사유·필요 증거가 모두 유효해야 한다.

채널 고정 예외는 정확히 `beige-checker-background`, `source-rights-chrome`, `source-locked-legal-retype`, `short-asset-label-below-target` 네 가지이며, focal·장식 모티프·motion·transition grammar가 될 수 없다. active motion/transition/treatment ID는 현재 실행 증거가 없어 비워 두고 `pending_evidence_entries`로 보류한다. 이 규칙은 [validator](../../video/scripts/validate-reference-style-gates.mjs)와 집중 회귀 테스트에 반영했다. 기존 10개 샘플은 이 계약을 채우지 않은 `reference-calibration-incomplete` 실험으로 계속 차단한다. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [reference analysis](../sources/vox-style-claude-remotion-reference.md), [grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json).

현재 10개 Remotion 샘플은 `reference-calibration-incomplete`인 비생산 실험이며 사용자 style-frame review 후보가 아니다. 순서는 `research/evidence → storyline/timing → reference inventory → exact source/frame/timecode binding → faithful reference reproduction → side-by-side reference/candidate human PASS → grammar extraction/promotion → representative episode style frames → 기존 후속 단계`로 고정한다. 정확한 로컬 reference still/frame/timecode, 관찰한 asset·text·geometry·depth·motion·transition·treatment, 차용/제외 요소, side-by-side artifact와 명시적 human calibration PASS가 없으면 문법을 production rule로 승격하지 않는다. 자동 hash·decode·schema·provenance 검사는 파일 무결성만 확인하며 reference fidelity를 증명하지 않는다. 출처 설명용 asset-label은 대상 밖 아래 전용 레인에 둘 수 있지만 사진·인물·건물 픽셀 위 설명문은 금지하고, 문서 원문·신문 headline·차트 축/수치처럼 source/evidence 자체인 글자만 named surface-content로 둔다. 앞선 `pending-user-style-frame-review` 표기는 legacy candidate manifest의 역사 문자열일 수 있으나 현재 outer gate가 이를 supersede하며 제시·승인 권한을 부여하지 않는다. Source: [locked Vox reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [reference grid](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [reference analysis](../sources/vox-style-claude-remotion-reference.md), [calibration candidate set](../../video/qa/style-frames/remotion-motion-grammar-v01/sample-index.json).

승인 단계에서는 episode marker의 sorted `kind|path|sha256` bundle을 validator가 실제 파일에서 재계산하며, 현재 `reference-cut-blueprint.json`은 calibration incomplete에 따라 48컷 모두 `blocked-pending-reference-calibration`이다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [blueprint generator](../../video/scripts/build-episode-001-reference-blueprint.mjs), [blueprint](../../video/episodes/episode-001/generated/reference-cut-blueprint.json).

승인 evidence는 실제 원본·still·candidate·side-by-side bytes와 실제 좌우 pixel identity의 의미 있는 결속이어야 한다. locked MP4 timecode와 별도 still/output을 exact row로 묶고, sample marker는 4개 evidence row, episode marker는 candidate set·10개 manifest/marker/still/output/side-by-side 및 locked video 전체를 validator가 재구성한다. 일반 contact나 후보 output을 reference still로 재사용할 수 없으며, side pixels가 결정론적 960×1080 contain 변환과 다르면 실패한다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs).
reference still의 provenance는 경로만으로 성립하지 않는다. validator와 fixture가 동일한 ffmpeg PNG 추출 명령으로 locked MP4의 `extracted_at_timecode` 프레임을 재생성해 raw RGBA를 비교하고, 10개 sample 전체의 output/mobile/contact/board SHA를 전역 제외 집합으로 적용해 외부 byte-identical 복사도 거부한다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs), [locked Vox reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4).
passed candidate set은 01..10 sample identity·slug·manifest directory/path·대표 candidate output이 서로 달라야 하며, 실제 decode/hash된 review board도 episode 승인 bundle의 `candidate-board` row로 결속한다. board record가 없거나 hash/dimensions가 맞지 않으면 validator가 fail-closed 한다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs), [candidate index](../../video/qa/style-frames/remotion-motion-grammar-v01/sample-index.json).
이 identity는 임의 slug로 대체할 수 없다. 현재 canonical 10개 allowlist와 sample 번호 순서를 사용하고, manifest는 `<candidateRoot>/<sample-id>/manifest.json`, candidate_id, sample_number를 모두 일치시킨다. 대표 candidate output은 경로뿐 아니라 실제 SHA도 sample 간 unique해야 한다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs).
allowlist 자체는 candidate index에서 동적으로 유도하지 않고 validator source에 immutable exact 상수로 고정한다. index와 의존 marker/hash를 함께 위조해도 arbitrary slug가 승인되지 않는다. Source: [gate validator](../../video/scripts/validate-reference-style-gates.mjs), [focused tests](../../tests/reference-style-gates.test.mjs).

### 2026-08-31 opening motion grammar evidence catalog

레퍼런스 opening `00:00–00:40`을 0.25–0.5초 간격과 scene-change로 조사하고, 완성본 구간 `00:05–00:40`에서 실제 start/mid/end 변화가 확인된 후보만 [motion catalog](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json)에 남겼다. 후보는 `staggered-object-accumulation`, `numeric-step-progression`, `chart-self-draw`, `directional-scene-exit-left`, `hard-cut`, `object-preserving-layout-reframe` 여섯 개다. 각각 locked MP4 SHA, 세 timecode, raw-RGBA 동일 프레임, 전체 delta, positive-duration review clip, contact와 사람 검수 board에 결속한다. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [catalog scope and uncertainty](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json), [review board](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-review-board.png).

이 catalog는 `pending-human-motion-grammar-approval`인 관찰 증거일 뿐 production allowlist가 아니다. 여섯 후보는 [grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json)의 `pending_evidence_entries`에만 연결하고 active `categories`는 비워 둔다. 사용자 승인 뒤에도 우리 소재를 사용한 target-bound runtime prototype과 실제 pair/motion proof를 별도로 통과해야 승격할 수 있다. `paper-print-texture`는 baked source와 runtime treatment를 구별하지 못하므로 보류하고, source-footage 내부 움직임은 Remotion grammar로 세지 않는다. `camera-reframe`은 구현 수단을 단정할 수 없어 더 좁은 `object-preserving-layout-reframe`으로만 기록한다. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [motion catalog](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json), [grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json).

### 2026-09-01 의미 충실도·텍스트 대체 금지 게이트

calibration sample은 텍스트가 화면의 의미를 대신하는지 먼저 검사한다. `asset-label`, `surface-content`, `screen-chrome`은 허용하지만 모두 supplemental이어야 한다. 설명문·출처 레일·일반 chrome을 숨긴 뒤에도 required visual claim이 실제 focal pixel과 관찰 가능한 비텍스트 action으로 전달되어야 한다. `semantic_fidelity`에는 `required_visual_claim`, `focal_asset_ids`, `focal_asset_classes`, focal별 실제 source binding, `observable_non_text_delta`, `text_roles_used`, `text_is_supplemental=true`, `no_semantic_substitution=true`를 반드시 기록한다. focal이 없거나 blank/placeholder/blocked이거나 source/data/operator가 요구 의미와 다르면 FAIL이며, v02 runtime의 `Rail`·screen-chrome·text-only surface를 semantic proof로 기록한 경우도 FAIL이다. 열 개 sample의 고정 의미·허용 focal class·필수 observable operator는 [semantic contract](../../video/scripts/semantic-fidelity-contract.mjs)와 [v02 design authority](../../video/qa/style-frames/remotion-motion-grammar-v02-design/manifest.json)를 따른다. 이 게이트를 통과하지 못한 후보는 사용자에게 PASS/FAIL 판단을 위임할 수 있는 review candidate가 아니다. Source: [semantic contract](../../video/scripts/semantic-fidelity-contract.mjs), [v02 sample validator](../../video/scripts/validate-remotion-motion-grammar-v02-sample-cuts.mjs), [v02 design authority](../../video/qa/style-frames/remotion-motion-grammar-v02-design/manifest.json).
## Frame-accurate motion-contract gate

Before any reference-derived Remotion implementation, create and validate a per-sample frame-accurate contract. A three-frame category label is discovery evidence only. The implementation authority must bind the exact source video bytes, source URL, fps/frame range, dense/event frames, fixed and moving layers, inside-surface versus whole-surface scope, target IDs, group membership, direction, content/count/path states, transitions, excluded source-footage motion, unknowns, and forbidden substitutes. The current corrected contract covers samples 01–09 as pending Remotion candidates and audits sample 10 only as a `source-video-selection` exclusion. Source and working example: [locked primary reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [frame-accurate v02 contract](../../video/qa/reference-study/frame-accurate-motion-contract-v02/manifest.json).

The gate is fail-closed:

1. Every visible editorial change maps to one declared action target. Live-action or source-footage internal motion is classified separately.
2. Fixed reference layers must remain fixed. A target-local reveal cannot become a whole-card or full-screen reveal.
3. Inside-surface actions require independent shell and content targets. For example, a chart path draw cannot be implemented by wiping a completed chart PNG.
4. Object-preserving motion must reuse the same target identity; replacement/crossfade is not equivalent.
5. Long reference windows must be segmented at observed boundaries. Later montage footage cannot be used as proof for an earlier device or comparison operator.
6. Hidden source code, easing, interpolation, and causality remain `unknown` or `inferred` with confidence until separately evidenced.
7. Technical validation proves structure and byte integrity only. Human side-by-side review is still required. The corrected 01–09 samples received exact user PASS and sample 10 exclusion acknowledgement on 2026-09-05. Calibration and grammar promotion do not require or authorize using every sample in an episode. v04–v10 family packages are historical human-review failures; v10 demonstrated that exact hashes and recognizable source pixels still cannot justify semantically mismatched chart, map, device, or presenter transfer. The current gate is source approval/materialization followed by a per-cut/beat `applicable` or `not-applicable` decision.

Stored evidence hashes are not sufficient provenance. The contract validator must re-extract every cited dense/event frame from the source video at the declared source frame, compare decoded pixel identity, independently ffprobe each review clip, and decode its video stream. A long context binding may use a narrower transferable operator scope only when `source_window_all_visible_change_mapped=false`, the exact mapped subrange is declared, and all excluded context segments are recorded.

The required order is `corrected suite -> frame-accurate contract v02 -> fail-closed contract validation -> corrected nine-sample review -> explicit v02 user marker -> derived grammar marker/contract -> grammar-ID/input-hash-bound style candidates -> style review`. The contract may depend only on the corrected suite; review/supersession back-edges are forbidden. The review manifest binds all nine active contracts plus the sample 10 exclusion contract, the exact 52-input inventory, pixel-exact boards, and exhaustively reconstructed 2,700-frame active plus 600-frame delta reels. The only approval mutation command is `pnpm run video:qa:apply-reference-calibration-v02`; it exports no writable API, accepts no arguments, resolves only canonical paths, rejects alternate roots and v01 authority, and prevalidates the current review bytes. Before replacing any canonical target it durably records the exact target set and byte-verified backups; a later invocation restores an interrupted prepared transaction before validation. Caught validation failure also restores every target. Reapplication is validation-only. Source: [single apply command](../../video/scripts/apply-reference-calibration-approval-v02.mjs), [frame contract validator](../../video/scripts/validate-frame-accurate-motion-contract-v02.mjs), [review validator](../../video/scripts/validate-motion-reverse-engineering-review-v02.mjs), [v02 approval validator](../../video/scripts/validate-reference-calibration-approval-v02.mjs), [correction validator](../../video/scripts/validate-reference-correction-v02.mjs).

### 2026-09-06 v09 source-pixel six-family style-frame gate (historical failure)

v08은 process 경로 누수와 time-data 표면 밖 day label, v09는 generic text box처럼 보인 paragraph strip, v10은 고정 6-family/sample coverage가 만든 의미 불일치 때문에 모두 역사적 `historical-human-review-failed`로 보존한다. v10 builder와 validator는 QA 역사 검증에만 남고 canonical check나 production state의 candidate index가 아니다. sample10은 계속 `source-video-selection` exclusion이며, 01–09도 실제 episode source 관계가 맞는 beat에서만 선택한다. Source: [current transfer gate](../../video/episodes/episode-001/reference-style-gates.json), [v10 historical index](../../video/qa/style-frames/episode-001/reference-style-families-v10/family-index.json), [locked primary reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4).

프레임의 모든 실제 visible input은 정확히 하나의 `visual_object_role` binding을 가져야 하고, 모든 binding target은 실제 visible input이어야 한다. scene-level layout/depth target도 `structural_grammar_targets`와 정확히 일치해야 한다. beige checker 같은 grammar 외 준수층은 `compliance_only_components`와 frozen channel exception으로만 선언한다. 누락·중복·역방향 고아 binding은 모두 실패한다. Source: [v04 validator](../../video/scripts/validate-grammar-bound-style-families-v04.mjs), [missing-visible-component regression](../../tests/grammar-bound-style-families-v04.test.mjs).

역사적 v09는 capture crop과 그 위 `surface-content`를 허용했으나 이 경로는 영구 폐기됐다. 웹페이지·앱·screen capture에 rendered text가 있으면 원본과 crop 모두 evidence/provenance-only이며 style frame pixel input, focal/supporting visual, production-visible asset, motion target이 될 수 없다. PNG/JPG/WebP 위에 타이핑·재조판한 텍스트를 합성하는 것도 `surface-content` 여부와 무관하게 금지한다. 정확한 source text는 래스터가 전혀 밑에 없는 native DOM/vector surface 또는 픽셀 자산과 겹치지 않는 별도 `screen-chrome` rail/frame로만 렌더한다. v09 renderer/validator/index는 실패 이력 감사용일 뿐 현재 제작 입력이 아니다. Source: [v09 historical index](../../video/qa/style-frames/episode-001/reference-style-families-v09/family-index.json), [current source/asset lineage](../../video/contracts/source-asset-lineage-v1.schema.json).

필수 source가 없으면 frame을 빈 채 review 대상으로 내놓지 않는다. 현재 실제 gate는 [acquisition queue](../../video/episodes/episode-001/generated/acquisition-queue.json)의 사람 source review와 materialization이다. assembly는 한국 본회의장/절차 source와 권리 기록, Omni는 SH008 노트북 결제 → SH011 잘못 온 물건 공개 → SH014 경찰 접수의 동일 fictional identity/place/prop continuity가 있는 PNG를 요구한다. source가 준비되기 전에는 grammar 선택, style candidate, active root, Omni video를 열지 않는다.

현재 source review의 단일 검토면은 [EP001 source-review v01](../../video/qa/source-review/episode-001-v01/README.md)이다. 이 패키지는 registry·archive DB·acquisition queue·episode spec의 exact bytes에서 결정론적으로 재구성하며, 등록 후보 15개의 captured-page contact sheet와 byte-preserved copy, provider/URL/license/rights, requirement/cut/source binding, uncovered requirement와 collision을 보여준다. 단, capture pixels는 source identity·locator·전사·provenance를 확인하는 evidence일 뿐 승인되더라도 production pixels로 승격될 수 없다. package와 후보 모두 `human_approval=false`, `rights_approval=false`, `materialized=false`, `production_authority=false`를 유지한다. Source: [source-review manifest](../../video/qa/source-review/episode-001-v01/manifest.json), [builder](../../video/scripts/build-episode-001-source-review.mjs), [validator](../../video/scripts/validate-episode-001-source-review.mjs).

고정 family 완료율은 더 이상 gate가 아니다. source-ready인 실제 episode cut만 대표 style direction으로 만들고, 각 visual beat가 승인 grammar를 쓸지 `applicable/not-applicable`과 이유를 기록한다. 정지 PASS 후에도 실제 선택 grammar에만 playable parity를 요구한다. 사용자에게 공백/placeholder PASS·FAIL을 요구하지 않으며 현재는 `active_cut_root=null`, `timing-draft`를 유지한다. Source: [style/transfer gates](../../video/episodes/episode-001/reference-style-gates.json), [production state](../../video/episodes/episode-001/production-state.json), [generated per-cut blueprint](../../video/episodes/episode-001/generated/reference-cut-blueprint.json).
### 2026-09-06 v10 recognizable source-surface gate (historical failure)

v10은 recognizable chrome/logo를 더 보존해 capture surface 문제를 해결하려 했지만, rendered-text capture pixels 자체를 production input으로 쓴다는 점 때문에 현재 정책상 영구 부적격이다. v10 index/validator/board는 `historical-human-review-failed`, non-production 감사 자료로만 보존하며 어떤 cue/hash 검증도 production eligibility를 되살리지 않는다. Source: [v10 historical index](../../video/qa/style-frames/episode-001/reference-style-families-v10/family-index.json), [current slice validator](../../video/scripts/validate-episode-001-vox-vertical-slice.mjs).

### 2026-09-06 non-promoting vertical slice

SH003·SH016·SH024은 full-pipeline proof를 준비하는 최소 vertical slice로 묶지만 production subset으로 승격하지 않는다. 계약은 `production_authority=false`, composition 미등록, active-root 설정 금지이며 세 컷의 source requirement가 blocked인 동안 렌더 준비·grammar 선택·PASS를 fail-closed한다. source가 준비된 뒤에도 새 renderer를 만들지 않고 generated catalog를 거친 canonical `EpisodeTimeline` window만 사용한다. Manifest V3의 reference transfer binding은 frozen allowlist의 grammar ID를 exact episode source ID·workspace-relative input path/SHA-256·runtime action/operator/target·action frame range·동일 beat의 60프레임 reading hold에 결속한다. `plot-local-progressive-reveal`은 `chart.reveal@1`의 실제 `chartProgress` 소비가 있을 때만 주장한다. Source: [slice contract](../../video/contracts/episode-001-vox-vertical-slice-v1.json), [slice validator](../../video/scripts/validate-episode-001-vox-vertical-slice.mjs), [V3 validator](../../video/scripts/visual-contract-v3.mjs), [V3 renderer](../../video/src/vox/scene/PresentationScene.tsx), [production state](../../video/episodes/episode-001/production-state.json).

이 slice에서 15개 `source_candidates`는 모두 rendered text가 있는 captured-page evidence이며 byte-identical archive 사본까지 provenance로만 결속한다. `slice_source_surfaces=[]`가 필수이고 캡처/crop은 화면에 나오지 않는다. SH016 사건파일과 SH024 달력은 별도 non-person `imagegen_asset_candidates`로 계획하되 읽을 수 있는 텍스트·이름·날짜·숫자·로고·UI·워터마크가 없어야 하고, evidence가 아니며 AI disclosure/source-reference hash/사람 검수/독립 분해를 요구한다. 독립 cutout은 decode 기준 alpha와 실제 투명 배경이 필수이고 baked checkerboard·gradient나 RGB-only PNG는 reject audit로만 보존한다. SH016 법률 표제·인용문, SH024 법률 문구·anchor·timeline은 `raster-free-native-dom-vector`, `raster_beneath=false`, `raster_composite=false`인 별도 surface다. B02 timeline만 source-text 승인 뒤 의미가 맞을 때 `plot-local-progressive-reveal → chart.reveal@1`을 조건부 선택한다. Source: [lineage schema](../../video/contracts/source-asset-lineage-v1.schema.json), [slice contract](../../video/contracts/episode-001-vox-vertical-slice-v1.json), [validator](../../video/scripts/validate-episode-001-vox-vertical-slice.mjs), [episode spec](../../video/episodes/episode-001/episode-spec.json).

새 공식-page capture는 기존 12개 파일의 누락 메타데이터를 추정해 채우지 않는다. 새/변경 바이트만 `captured_at`, Remotion Chromium/CDP capture tool, exact URL, DOM locator와 고정 viewport, 실제 MIME/확장자, capture SHA-256, 미승인 candidate 상태, 향후 byte-preserved-copy 결속을 요구한다. 대표 LAW-195/196/1972 재캡처는 별도의 [recapture-v03 manifest](../../video/source-intake/episode-001/official/recapture-v03/manifest.json)에 있고 registry·DB·raw·production asset으로 승격되지 않았다. 서로 다른 locator가 동일 screenshot을 만든 `recapture-v01`과 schema 결속 전 `recapture-v02`는 실패/중간 기록이며 사용 금지다. Source: [recapture script](../../video/scripts/recapture-episode-001-official-pages.mjs), [recapture validator](../../video/scripts/validate-official-page-recapture.mjs), [intake policy](../../video/source-intake/episode-001/README.md).

[recapture-v03 review package](../../video/qa/source-review/episode-001-official-recapture-v03/README.md)는 삭제하지 않고 `historical-evidence-only`로 보존한다. URL·locator·viewport·MIME·SHA·capture tool/time과 전사 확인에는 쓸 수 있지만 `production_eligibility=permanently-ineligible-capture-containing-rendered-text`이며 style-frame/production-visible/motion-target 플래그는 모두 false다. 여섯 human decision이 나중에 완료되어도 이 픽셀 금지는 해제되지 않는다. Source: [review manifest](../../video/qa/source-review/episode-001-official-recapture-v03/manifest.json), [review validator](../../video/scripts/validate-episode-001-official-recapture-review.mjs).
