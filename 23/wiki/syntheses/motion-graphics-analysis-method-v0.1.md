# 모션그래픽 분석 방법 v0.1

> 이 문서는 완성된 MP4에서 **관찰 가능한 모션 문법**을 역설계하는 현재 방법만 정리한다. 원본 프로젝트의 레이어·마스크·키프레임을 복원했다고 주장하거나, 분석 결과만으로 reference-calibration PASS·grammar promotion·production authority를 부여하지 않는다. Source: [역설계 파일럿](motion-reverse-engineering-pilot-v0.1.md), [현재 교정 기록](reference-calibration-correction-2026-09-02.md).

## 분석의 단일 흐름

`원본 잠금 → 구간 잠금 → 프레임 추출 → 화면 분해 → 픽셀 측정 → operator 가설 → 최소 Remotion probe → 동기 좌우 비교 → probe 재측정 → 사람 판정 → grammar 승격` 순서만 사용한다. 비슷해 보이는 애니메이션 이름을 먼저 고르거나, 정지 화면·fade·설명 텍스트로 원본 동작을 대신하는 우회로는 허용하지 않는다. Source: [파일럿 목적과 playable proof](motion-reverse-engineering-pilot-v0.1.md), [제작 파이프라인 정본](remotion-vox-production-playbook-v0.1.md).

## 1. 원본과 분석 구간 잠금

1. 분석할 로컬 MP4의 경로·SHA-256·해상도·fps를 기록한다.
2. 샘플마다 exact timecode와 source frame 시작·끝을 고정한다. 경계가 의심되면 직전·직후 프레임도 별도 evidence로 둔다.
3. 짧은 동작은 구간의 모든 프레임을 추출한다. 긴 동작은 dense frame과 entrance·settle·internal-change·exit·cut boundary 프레임을 함께 추출한다.
4. 추출 프레임은 원본에서 다시 디코드한 raw RGBA/RGB와 identity를 대조할 수 있어야 한다.

이 단계가 고정되지 않으면 서로 다른 시점의 픽셀을 비교하게 되므로 이후 operator 판정은 무효다. Source: [잠긴 원본과 02·03 전 프레임 분석](motion-reverse-engineering-pilot-v0.1.md), [suite source identity와 boundary 분석](motion-reverse-engineering-suite-v0.1.md).

## 2. 화면을 역할과 수명주기로 분해

프레임을 하나의 완성 이미지로 보지 않고 `background / shell / dominant focal / supporting asset / surface-content / screen-chrome / source-video pixels`로 분해한다. 각 component는 `hidden → entering → focused/supporting → exiting → final-summary` 중 어느 상태인지 프레임 범위로 기록하며, 독립적으로 움직이는 인물·문서·경로·소품은 독립 layer와 target으로 취급한다. Source: [제작 파이프라인 정본](remotion-vox-production-playbook-v0.1.md), [reference 문법 계약](../../video/episodes/episode-001/reference-grammar-contract.json).

텍스트 역할은 `asset-label`, `surface-content`, `screen-chrome`만 허용한다. 세 역할은 보조 표현이지 focal asset, 근거 자산, observable motion을 대체할 수 없다. `asset-label`은 대상 아래 전용 레인, `surface-content`는 실제 문서·차트·기기 표면 안, `screen-chrome`은 제목·일반 설명·출처 레일에만 쓴다. Source: [production playbook의 typography/surface 계약](remotion-vox-production-playbook-v0.1.md).

## 3. 프레임에서 실제 변화를 측정

| 질문 | 주 측정 | 판정에 쓰는 값 |
|---|---|---|
| 대상이 움직였나 | ROI threshold mask, bbox, centroid, frame registration | `dx/dy`, trajectory, IoU |
| 크기·각도가 변했나 | bbox progression, contour, PCA orientation | width/height, scale, principal angle |
| 내부 내용만 변했나 | shell과 content ROI 분리, stable/dynamic mask | shell delta, glyph/path changed fraction |
| 차트가 어떻게 나왔나 | plot ROI, endpoint/right-edge progression, point lifecycle | reveal 시작·끝, path/point 증가량 |
| hard cut인가 | adjacent-frame difference 뒤 translation registration·normalized correlation·luma 비교 | 정합 가능성, correlation, 국소/전역 밝기 변화 |
| 읽기 정지인가 | action 종료 뒤 동일 ROI·전체 프레임의 연속 비교 | 최소 60프레임 무동작 |

전체 프레임 평균 차이만으로 cut을 선언하지 않는다. 카메라 pan은 큰 차이가 나도 registration 후 상관이 유지될 수 있고, flash는 정합된 배경 위 국소·휘도 변화일 수 있다. Source: [suite의 registration/correlation/luma 판정](motion-reverse-engineering-suite-v0.1.md), [sample 02·03 ROI 측정](motion-reverse-engineering-pilot-v0.1.md).

## 4. 관찰과 구현 가설을 분리

각 동작은 아래 여섯 필드로 계약화한다.

```text
observed_fact: 프레임에서 직접 측정된 사실
candidate_operator: 그 사실을 가장 적게 가정하고 재현하는 1순위 operator
alternative: 같은 픽셀 결과를 만들 수 있는 다른 operator
confidence: 후보별 상대 신뢰도와 근거
uncertainty: MP4만으로 확정할 수 없는 항목
forbidden_substitute: 관찰을 훼손하지만 쉽게 만들 수 있는 대체 구현
```

예를 들어 선이 자라 보인다는 사실은 `svg.stroke-draw`일 수도 있고 `plot-local clip`일 수도 있다. 완성 픽셀로 두 방식을 구분하지 못하면 둘을 확률적 가설로 유지하며, whole-chart wipe처럼 shell까지 함께 드러나는 구현만 명확히 반려한다. Source: [sample 03 operator 가설](motion-reverse-engineering-pilot-v0.1.md), [sample 03 hypothesis JSON](../../video/qa/reference-study/motion-reverse-engineering-pilot-v01/sample-03-chart-reveal/operator-hypotheses.json).

## 5. 최소 Remotion probe로 검증

분석마다 원본 디자인 전체를 재제작하지 않고, 판정하려는 observable operator만 포함한 최소 probe를 만든다. 현재 비교 probe의 기본 규격은 1920×1080, 30fps, 300프레임이며 원본 action span을 가능한 한 1:1 frame offset으로 대응시키고, action 종료 후 최소 60프레임의 완전한 reading hold를 둔다. Source: [파일럿 playable proof](motion-reverse-engineering-pilot-v0.1.md), [suite probe 규격](motion-reverse-engineering-suite-v0.1.md).

probe에는 분석 대상 component를 독립 render target으로 두고, 원본에서 관찰된 entrance·geometry 변화·internal state·exit만 재현한다. source-footage 내부 픽셀 움직임은 별도 `source-video pixels`로 기록하며 Remotion motion operator 개수에 포함하지 않는다. Source: [sample 02의 세 층 분리](motion-reverse-engineering-pilot-v0.1.md), [production playbook의 runtime operator 규칙](remotion-vox-production-playbook-v0.1.md).

## 6. 좌우 비교와 역검증

같은 의미의 source frame과 probe frame을 시간 동기화해 좌우 비교 MP4와 360×203 contact를 만든다. 두 열은 16:9 `contain`으로 보존하고 frame 번호를 표시하며, portrait cell의 `cover` crop으로 차이를 숨기지 않는다. Source: [파일럿 contact 규칙](motion-reverse-engineering-pilot-v0.1.md), [suite contact 규칙](motion-reverse-engineering-suite-v0.1.md).

렌더 영수증이나 runtime 문자열만 검사하지 않고 제출된 probe MP4를 다시 디코드해 target의 trajectory·bbox·glyph/path progression·action boundary·final hold를 재측정한다. 해시만 다시 맞춘 fixed asset, step-card, global wipe, hard reset, delayed overlay 같은 대체 영상을 adversarial fixture로 넣어 validator가 실제로 거부하는지도 확인한다. Source: [파일럿 validator와 adversarial tests](motion-reverse-engineering-pilot-v0.1.md), [suite measurement/rejection model](motion-reverse-engineering-suite-v0.1.md).

## 7. 판정과 승격

기술 검증은 `원본/프레임/probe/contact의 byte 무결성`, `규격`, `선언한 target의 실제 픽셀 변화`, `reading hold`까지만 증명한다. 사람은 동기 좌우 비교를 보고 focal, timing, motion character, transition, treatment가 레퍼런스 문법으로 충분히 충실한지 PASS/FAIL을 결정한다. 사람 PASS 전에는 grammar contract에 승격하거나 production cut·Omni 생성에 사용하지 않는다. Source: [현재 human review와 gate state](reference-calibration-correction-2026-09-02.md), [reference grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json).

## 현재 적용 중인 교정 범위

- Active candidate는 01–09이며 모두 human review pending이다.
- 08은 presenter 영역을 비워 두고 좌우의 비인물 supporting overlay motion만 분석·이식한다.
- 09는 사람을 재구성하지 않고 phone shell, surface state, chart/value 변화, non-person support overlay만 분석·이식한다.
- 10은 모션그래픽 샘플이 아니라 `source-video-selection`이므로 Remotion probe와 grammar binding 대상에서 제외한다.
- 현재 episode 상태는 `timing-draft`, `active_cut_root=null`이며 reference calibration, style review, cut PASS, Omni, production 권한은 닫혀 있다.

Source: [현재 교정 기록](reference-calibration-correction-2026-09-02.md), [corrected suite manifest](../../video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json), [production state](../../video/episodes/episode-001/production-state.json).

현재 기계 판정 정본은 [frame-accurate motion contract v02](../../video/qa/reference-study/frame-accurate-motion-contract-v02/manifest.json)다. 01–09는 각각 별도 계약으로 exact source와 측정 분석을 결속하고, 10은 같은 감사 묶음 안의 `source-video-selection` exclusion 계약으로만 존재한다. 빌드와 검증은 `pnpm run video:qa:build-frame-accurate-motion-contract-v02`와 `pnpm run video:qa:validate-frame-accurate-motion-contract-v02` 한 쌍을 사용한다. 이 QA 계약은 production authoring route와 active cut root를 선택하거나 승인할 수 없다. Source: [v02 README](../../video/qa/reference-study/frame-accurate-motion-contract-v02/README.md), [builder](../../video/scripts/build-frame-accurate-motion-contract-v02.mjs), [validator](../../video/scripts/validate-frame-accurate-motion-contract-v02.mjs), [production authoring contract](../../video/contracts/production-authoring-contract-v1.json).

## 지금까지 확정한 대표 판정

- **02:** 탱커의 독립 translation, 바다의 source-footage internal motion, 숫자 그룹의 upward reveal과 그룹 내부 framewise count-up을 서로 다른 층으로 본다. fixed tanker, frozen ocean, 숫자 카드 몇 장 교체는 반려한다.
- **03:** chart shell이 먼저 settle한 뒤 plot 내부 series와 point만 reveal된다. whole-chart wipe는 반려하고, stroke draw와 plot-local clip은 숨은 구현을 확정할 수 없어 대안 가설로 함께 보존한다.
- **04:** 큰 인접 프레임 차이는 hard cut이 아니라 registration 가능한 연속 map/camera pan이었고, 이후 변화는 정합된 지도 위 국소 flash였다.
- **09:** 기기 각도는 거의 고정되고 surface의 값·퍼센트·차트와 support icon 상태가 변한다. 다음 money montage 경계는 분석 구간에서 제외한다.

Source: [02·03 파일럿 결과](motion-reverse-engineering-pilot-v0.1.md), [04·09 suite 결과](motion-reverse-engineering-suite-v0.1.md), [09 corrected analysis](../../video/qa/reference-study/motion-reverse-engineering-suite-v02/sample-09-device-light-focal-motion-corrected/analysis.json).

## MP4 역설계의 한계

완성 MP4만으로 원래 authoring tool의 layer tree, mask, keyframe 값, easing curve, blur/opacity 조합, stroke-draw와 local clip의 실제 선택, perspective/homography를 확정할 수 없다. 따라서 결과는 “원본 구현 복원”이 아니라 “관찰 가능한 결과를 만족하는 최소 operator 계약”이다. OCR로 읽지 못한 법률 문구·날짜·수치·인명은 source frame 기반 수동 전사로 표시하고 자동 인식 결과로 가장하지 않는다. Source: [파일럿의 hidden implementation 한계와 수동 전사](motion-reverse-engineering-pilot-v0.1.md), [suite의 불확실성 기록](motion-reverse-engineering-suite-v0.1.md).

## 샘플별 필수 산출물

- exact source window와 source-frame identity
- `analysis.json`과 operator hypothesis/alternative/uncertainty
- source evidence frames와 측정 ROI/geometry
- 1920×1080·30fps·300f 최소 Remotion probe
- probe 재디코드 측정 JSON
- 동기 side-by-side MP4와 360×203 contact
- hash-bound manifest와 validator 결과
- human review decision 또는 명시적 `pending`

이 묶음이 모두 있어야 “분석 완료”라고 부를 수 있고, 그 뒤에도 human PASS와 grammar promotion은 별도 단계다. Source: [파일럿 manifest](../../video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json), [corrected review manifest](../../video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json), [현재 검증 한계](reference-calibration-correction-2026-09-02.md).

## 에피소드 적용 계약

역설계 결과는 제작 할당표가 아니라 allowlist다. source 승인·materialization 뒤 각 cut/visual beat가 `applicable` 또는 `not-applicable`과 의미 근거를 선언한다. `applicable`은 승인 grammar ID, exact episode input path·SHA-256, target ID, observable delta와 frame range를 결속하고, readable evidence에는 최소 60프레임 hold를 둔다. `not-applicable`은 비어 있지 않은 이유와 빈 grammar binding을 갖는다. sample 사용 개수나 visual family 충족률은 품질 또는 production authority가 아니다. Source: [reference transfer gate](../../video/episodes/episode-001/reference-style-gates.json), [production authoring contract](../../video/contracts/production-authoring-contract-v1.json).
