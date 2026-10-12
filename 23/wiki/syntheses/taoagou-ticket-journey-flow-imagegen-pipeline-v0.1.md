# Taoagou 항공권 여행 카드: 기존 13초 고도화 로드맵 v0.6

> **2026-09-06 실행 결정 v0.6 — v0.5보다 우선:** 이번 제작의 인물 tempo는 **외부 1.80× retime**으로 고정한다. 사용자 속도 비교 선택과 후속 진행 요청에 따른 제작 결정이지, 레퍼런스가 실제 1.80×로 제작됐다는 판정이 아니다. Flow 직접 보행 가속 A/B는 목표 cadence를 입증하지 못했다. 1.80× 동작 참조를 다시 넣는 후속 검증은 컴퓨터 제어 중단으로 **미실행**이며 모델 실패로 집계하지 않는다. Source: 사용자 대화(2026-09-06, “1.80x가 가장 괜찮아보이네”, 속도 결론 후 “진행해”), [A/B 실제 결과](../../../motiongraphic/analysis/direct-gait-test-2026-09-06/RESULTS.md).

> **다음 순서:** T3 네 의상의 컷별 source window·전환 보행 연결 → M1 카드 가속 → M2 정렬/필요 시 카드 blur → 필요한 상체 연기 → 13초 통합 비교. 카드/오디오/전체 타임라인에 1.80×를 적용하지 않는다. 인물 영상 전체를 retime하므로 팔·표정·옷도 빨라진다는 한계는 그대로 검수한다. 이전 A1의 고개 숙이기→들기 지시는 현재 실행안이 아니다. 컷마다 얼굴의 주 방향을 안정적으로 유지하고 작은 표정·손 움직임을 살리되, 픽셀 고정/상체 freeze를 요구하지 않는다. H1은 개선 미확인, H2는 정책 거절이므로 재시도로 우회하지 않는다. Source: 사용자 후속 연기 교정 및 [순차 실험 결과](../../../motiongraphic/analysis/direct-gait-test-2026-09-06/RESULTS.md). 아래 v0.4/v0.5의 조건부 T2·연기 초안은 이 결정과 충돌하는 부분에 한해 역사 기록이다.

> **현재 실행 정본은 위 v0.6 결정과 아래 v0.5의 비충돌 세부 절차다.** 13초 영상은 이미 제작되어 있다. 기존 G0–G7을 다시 통과하며 처음부터 제작하는 계획은 폐기하고 기록으로만 남긴다. 4초 사용자 합격 이력, 기존 13초 제작 완료, 최종 미감 승인 여부, Flow 단독 능력 검증은 서로 다른 상태다. Source: 사용자 교정 요청(2026-09-06), [13초 v2 기록](../../../motiongraphic/production/ticket-travel/final-sequence-v2/README.md).

### v0.6 T3 네 도시 비교 후보 — 사용자 승인 전

- 기술 검증: 수정 후보 720×1280, 24fps, 312프레임, 13.000초, 전체 FFmpeg decode 통과. 후보 SHA-256 `63041B7225FAD09A25D296329A59E2F771280ED1B88BD6AB404AACF441CB94C3`. 첫 전환 배경 입력 오류를 수정한 뒤 미디어/시트를 다시 생성했고, 메인 검수에서 3.5초 카드 조기 노출이 사라진 것을 확인했다. 기술 통과는 보행 연결의 사용자 승인이 아니다. Source: [metadata](../../../motiongraphic/analysis/t3-all-city-2026-09-06/metadata.json), [첫 경계 시트](../../../motiongraphic/analysis/t3-all-city-2026-09-06/t3-all-city-boundary-intro-seoul.jpg), 로컬 render/decode 및 메인 시각 검수(2026-09-06).
- [13초 1.80× 후보](../../../motiongraphic/analysis/t3-all-city-2026-09-06/t3-all-city-1.80x-13s.mp4), [기존 v2와 좌우 비교](../../../motiongraphic/analysis/t3-all-city-2026-09-06/t3-all-city-vs-existing-v2.mp4), [실행 기록](../../../motiongraphic/analysis/t3-all-city-2026-09-06/README.md), [입력·시간 매핑·해시](../../../motiongraphic/analysis/t3-all-city-2026-09-06/metadata.json).
- 후보 source 구간(전환 겹침 포함 명목값): Seoul 2.5–8.8초, Tokyo 2.5–7.9초, Shanghai 2.5–7.0초, Hanoi 6.0–9.6초. 이전 서울→도쿄 4초 후보의 source anchor와 다르므로 그 후보의 위상 검수를 상속하지 않는다. Hanoi는 후반 모자 쓰기 동작을 포함한다. Source: 위 metadata 및 [source scan](../../../motiongraphic/analysis/t3-all-city-2026-09-06/t3-all-city-source-window-scan.jpg).
- **상태:** 로컬 retime·합성 비교 후보이며 새 Flow 생성물이나 T3 PASS가 아니다. 선택 구간의 머리 숙임은 남아 있다. 겉옷에 가려진 발의 정확한 접지는 판정 유보하며, 전환의 발 진행·얼굴·크기 연속성은 원속 비교 검수가 필요하다. 카드 가속 M1 및 머리 방향 개선을 수행했다고 주장하지 않는다. Source: [전환 시트](../../../motiongraphic/analysis/t3-all-city-2026-09-06/t3-all-city-transition-contact.jpg), 위 실행 기록.

> **현재 상태 — 2026-09-06:** `final-sequence-v2.mp4`(13초)를 보존하면서 먼저 레퍼런스보다 느리게 읽히는 보행이 제한적 retime만으로 개선되는지 확인하고, 필요하면 Flow 보행 편집을 거친다. 그 뒤 선택한 tempo를 의상별 source에 공통 적용한 상태에서 카드의 중간 급가속·감속·정렬과 목적지별 생동감을 개선한다. Flow는 이 개선을 시험하는 수단이며, Flow 단독 제작 증명이 별도의 최종 목표가 아니다. 기존 카드 단독 A/B/C의 C 정착 2.167초는 제한된 실험 결과로 보존하며, 이를 이유로 이미 제작한 13초를 미완료로 돌리지 않는다. Source: [보행 속도 감사](../../../motiongraphic/analysis/walking-cadence-audit-2026-09-06/report.md), [카드 실험](../../../motiongraphic/analysis/flow-motion-terms-2026-09-06/report.md), [고도화 연구](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md).

## 범위와 근거

- 사용자가 제공한 13초 브리프는 내용·의상·목적지·타이밍의 권위다. Source: [사용자 브리프](../sources/taoagou-ticket-journey-user-brief-2026-09-05.md).
- 레퍼런스 MP4에서 차용하는 것은 카드가 아래에서 위로 들어오고, 새 카드가 이전 카드를 가리는 관찰 가능한 문법뿐이다. 원래 어떻게 제작했는지는 MP4만으로 확정할 수 없다. Source: [레퍼런스 분석](../../../motiongraphic/analysis/taoagou-nonfinger-comparison/analysis.md), [원본 MP4](../../../motiongraphic/references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4).
- 이번 실험의 목적은 레퍼런스의 픽셀 복사가 아니라, 동일한 구조를 새 fictional 인물·새 티켓 디자인·새 목적지 조합으로 모방하는 것이다. Source: 사용자 요청, 2026-09-05.

## 핵심 수정: 인물과 카드를 분리한다

이전 문서의 “카드와 인물을 하나의 incoming precomp로 만들어 함께 올린다”는 설명은 관찰 사실과 구현 가설을 혼동한 역사적 기록이다. 아래는 현재 13초에도 이어지는 **검증된 제작 기반**이며, 다음 작업은 이 기반 위의 v0.4 고도화다.

1. ImageGen으로 동일한 fictional 인물, 원래 복장과 목적지별 네 의상 이미지, 티켓 이미지를 각각 준비한다.
2. Flow에서 카드 없는 기준 보행 영상을 하나 생성한다.
3. 같은 기준 보행 영상을 Omni 영상 편집에 넣고 의상만 바꿔 목적지별 보행 영상을 만든다. 독립적인 이미지→영상 생성 대신 기존 영상의 움직임을 조건으로 사용한다. 모델 내부에서 보행 픽셀을 그대로 복사한다고 보장하지 않으므로 결과의 보행 일관성은 별도로 검수한다.
4. 확정된 보행 영상 위에 티켓을 독립 레이어로 합성한다. 카드가 올라오는 동안 인물을 다시 생성하거나, 카드와 인물을 정지 이미지로 붙이지 않는다.
5. 실제 렌더 순서는 **기존·새 카드 배경 합성 → 경계 위의 이전 인물 → 경계 아래의 새 인물**이다. 카드 이미지의 바깥 흰 여백은 이동 카드 마스크에서 제외한다. 두 인물 마스크는 상호보완 관계이며, 카드의 상승 경계에 맞춰 환복되는 시각적 가림을 만든다. 카드 전체를 두 인물 위에 덮는 방식은 아니다. Source: [실제 렌더 스크립트](../../../motiongraphic/production/ticket-travel/synced-transition-v1/render_synced_transition.py).

```text
ImageGen identity / outfit / ticket plates
        ↓
Flow canonical walk (one motion source)
        ↓
Flow Omni edit: clothing-only variants, same walk source
        ↓
deterministic card + complementary person masks
        ↓
fixed 9:16 provisional render and matched-frame QC
```

이 분리는 얼굴·복장 정체성, 시간축 보행, 카드 인쇄·기하를 서로 다른 검수 문제로 만든다. `Characters`는 아직 이 실험에 투입하지 않았으며, 보행 고정 기능으로 간주하지 않는다. Source: [Flow 캐릭터 안내](https://support.google.com/flow/answer/16935308?co=GENIE.Platform%3DDesktop&hl=en) 및 [실험 기록](../sources/ticket-travel-verified-probes-2026-09-05.md).

## 검증된 Flow 입력 프롬프트

아래 세 프롬프트는 실제 작업 기록에 남아 있는 정확한 입력이다. ImageGen 원본 이미지를 만드는 프롬프트의 정확한 원문은 현재 로컬 기록에서 확인되지 않으므로 추정해 채우지 않는다.

### 1. 기준 한복 보행 — 사용자 재시도 후 성공

```text
A single continuous 4-second full-body fashion editorial shot of this exact woman in this exact hanbok. She walks in place with a relaxed, regular natural walking cycle throughout, alternating foot contacts and gentle arm swing. Keep her centered at the same screen position and the same apparent body size. Maintain the starting three-quarter body orientation. Locked-off camera, no pan, zoom or dolly. Infinite white studio background with a soft natural contact shadow. Preserve her face, hair, body proportions and outfit. No cards, no text, no transitions, no wardrobe change, no freeze or pause.
```

Source: [기준 보행 프로브 기록](../../../motiongraphic/production/ticket-travel/motion-edit-probe/README.md). 최초 생성은 정책 메시지를 보였지만 사용자가 재시도해 성공했다. 이 메시지는 fictional 인물이 실제 유명인이라는 증거가 아니며, 당시 차단 원인은 미확인이다.

### 2. 첫 기모노 편집 — 사용자 재시도 후 성공, 보행 엄밀 검증 전

```text
Change only the woman’s clothing throughout this source video to the pale pink floral kimono and obi shown in the supplied reference image. Preserve the source video’s exact walking motion, alternating foot-contact timing, arm motion, body proportions, face, short hair, screen position and apparent size. Keep the original white studio background, camera and lighting unchanged. Use the reference only for the kimono fabric and garment design; do not add its boarding pass, text, border, umbrella or hairstyle. Keep the original handheld item and its motion. The kimono is already worn from the first frame to the last: no transformation, no transition and no cut. Keep everything else the same.
```

Source: [영상 편집 프로브 기록](../../../motiongraphic/production/ticket-travel/motion-edit-probe/README.md). 첫 결과는 성공했으나 당시에는 보행의 프레임 단위 접지 타이밍을 엄밀히 인증하지 않았다.

### 3. 수정 기모노 편집 — 보행 유지에 초점, 사용자 관찰상 성공

```text
Edit this source video so the woman wears the pale pink floral kimono and obi from the reference image throughout the entire clip.

Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed, and direction. Do not restart, slow down, pause, or replace the walk with smaller kimono-style steps. Let the kimono fabric accommodate the existing leg movement.

Keep her face, short hair, body proportions, screen position, and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting.

Her arms and hands may move naturally to suit the kimono; matching their original motion is not essential.

Use the reference image only for the kimono and obi design. Do not add its boarding pass, text, border, or umbrella.

She wears the kimono from the first frame to the last. No wardrobe transformation, transition, or cut.
```

Source: 사용자 제공 프롬프트 및 2026-09-05 관찰. 사용자는 “이번엔 걷는게 동일한 것 같네”라고 판정했다. 이는 상체·소품의 동일성보다 걷기 일관성을 우선한 품질 판단이며, exact heel/toe 접지의 기계적 인증을 뜻하지 않는다.

## 실제 산출물과 상태

| 산출물 | 의미 | 상태 |
|---|---|---|
| `source-hanbok.mp4` | 4초 기준 한복 보행, 720×1280, 24fps | 사용자 재시도 후 성공; SHA-256 `C99CE2FDD62DFDF77C16CB6AD56A4233BC472718D51DE6A2FE46B08C443151B5` |
| `Woman_walking_in_hanbok-clip-1_202609052229.mp4` | 수정 프롬프트의 기모노 편집 다운로드본 | 사용자 관찰상 보행 일치; SHA-256 `A548D5D59B939864DCBDD412468F3CD3718F275DE67D6536A691BF11CD12E1D0` |
| `synced-transition-v1.mp4` | 한복·기모노 보행을 같은 시간축으로 맞춘 4초 카드 전환 프로브 | 사용자 “이정도면 합격선” 판정; SHA-256 `59DA8FA6B0B29AAC5DFA410C4DBB48B51AD9E7B7FD4C22CE826DA6726A9D596C` |
| `synced-transition-v1-half-speed.mp4` | 같은 프로브의 0.5배속 검수본 | 전환 경계 확인용 |

파일 위치는 각각 [motion-edit-probe](../../../motiongraphic/production/ticket-travel/motion-edit-probe/)와 [synced-transition-v1](../../../motiongraphic/production/ticket-travel/synced-transition-v1/)다. 프로브는 9:16, 4초이며, 전환은 약 1.5–2.0초(24fps 기준 약 12프레임) 동안 아래에서 위로 올라온다. 카드 이동은 ease-out으로 처리하고, 인물의 보행 영상을 retime·optical-flow·재생성하지 않았다. Source: [로컬 합성 README](../../../motiongraphic/production/ticket-travel/synced-transition-v1/README.md), [렌더 스크립트](../../../motiongraphic/production/ticket-travel/synced-transition-v1/render_synced_transition.py), 사용자 검수 발언 2026-09-05.

## 전환 구현에서 확정한 것

- 카드가 올라오며 인물을 실제로 가리는 구조를 사용한다.
- 영상의 흰 배경 분리는 색상 거리 기반의 좁은 1–2px 인물 matte로 처리했다. 카드의 환복 reveal 마스크와 인물의 배경 제거 matte는 서로 다른 마스크다. 넓은 feather는 사용하지 않았으나 정밀 로토스코핑 완료를 의미하지 않는다.
- 카드 경계가 지나간 영역은 새 의상, 아직 지나가지 않은 영역은 이전 의상이 보이도록 complementary reveal을 적용한다.
- 합성 단계에서 인물 레이어의 위치·크기를 바꾸지 않는다. 원본 보행 안의 자연스러운 움직임까지 픽셀 단위로 고정한다는 의미는 아니다. 프레임마다 crop/scale로 보정하지 않는다.
- 손·팔·소품의 완전한 동일성은 필수 기준이 아니다. 핵심 기준은 같은 시간에 같은 방향으로 걷고, 전환에서 발·하체 동작이 튀지 않는지다. Source: 사용자 품질 기준 수정, 2026-09-05.

프로브는 좁은 matte와 바닥/바코드 잔여가 남을 수 있으므로 13초 최종본으로 승격하지 않는다. 사용자가 승인한 것은 이 4초 전환 방식의 합격선이지, 13초 전체 영상이나 모든 목적지의 최종 PASS가 아니다.

## Flow와 모션그래픽의 역할(역사적 하이브리드 기록)

- Flow/Omni: 하나의 기준 보행을 만들고, 같은 영상에서 의상만 편집하는 역할.
- ImageGen: fictional 인물·의상·티켓의 시각 자산을 만드는 역할. 티켓의 읽을 수 있는 정보·바코드는 생성 결과가 변형될 수 있으므로 최종 surface는 별도 이미지/결정론적 합성을 고려한다.
- 결정론적 합성: 카드 입장, z-order, 가림 경계, 고정 크기·좌표, 최종 세로 타임라인을 책임진다.
- Flow 템플릿 이름만으로 보행 고정·시간축 마스크·픽셀 일관성을 주장하지 않는다. `Transition Machine`, `Pose Text`, `Blob Tracking`, `Mask Magic`은 이 병목을 자동 해결한다고 확인되지 않았다.

이 역할 분리는 [모션그래픽 분석 방법](motion-graphics-analysis-method-v0.1.md)의 관찰→가설→최소 probe→동기 비교→픽셀 검수 원칙을 따른다. 완성 MP4는 원래 authoring tool을 증명하지 않으며, 관찰된 결과와 우리 구현 가설을 분리해야 한다.

## 역사적 하이브리드의 후속 후보(로드맵 이전)

> 아래 항목은 G0–G7 Flow-native 로드맵이 우선하는 이전 하이브리드 계획의 미해결 후보를 보존한 것이다. 현재 진행 순서나 native Flow PASS로 읽지 않는다.

1. 현재 성공한 기준 보행과 수정 기모노 편집을 기준으로 Shanghai·Hanoi도 각각 같은 원본에서 분기한다.
2. Seoul→Tokyo 4초 프로브에서 카드 edge, 인물 경계, 바닥 그림자, 티켓 표면을 별도 ROI로 점검한다.
3. 동일한 보행 위상으로 네 카드의 0.4초 slide-up과 0.2초 settle을 연결해 13초 provisional을 만든다.
4. 13초 전체를 사용자 검수하기 전에는 `final`, `picture-locked`, production asset이라고 부르지 않는다.

아직 해결하지 않은 항목은 목적지별 새 보행 편집, 티켓 인쇄의 생성 중 변형, 머리카락·발 주변 matte, 13초 전체의 연속성, 실제 화면에서 Flow custom tool이 영상 편집 호출을 재현할 수 있는지다. Characters는 identity 후보이지 gait lock이 아니므로 별도 비교 실험이 필요하다.

## 역사적 수정 기록

초기 v0.1은 레퍼런스의 카드+인물 관계를 “하나의 incoming precomp”로 단정했다. 현재 MP4만으로 그 원래 레이어 구조를 확인할 수 없고, 실제 성공한 프로브는 **기준 보행 영상과 카드 전경을 분리한 동기 합성**이었다. 따라서 v0.1/v0.2의 설명은 역사적 검증 대안으로만 보존한다. 현재 실행 우선순위와 승격 기준은 이 문서의 G0–G7 Flow-native 로드맵이다.

## 폐기된 실행 계획: 2026-09-06 G0–G7 신규 제작 게이트

이 절의 생성 차단·재승인·재시작 순서는 더 이상 실행하지 않는다. 후술 v0.4가 대체한다. 기존 수치 기준은 필요시 개선 후보의 회귀 검수에 참고하되 사용자 합격 이력을 소급 취소하지 않는다. Source: 사용자의 기존 13초 제작 완료 및 고도화 목적 재확인, 2026-09-06.

### 목표와 판정 원칙

목표는 레퍼런스의 픽셀 복사가 아니라, **고정된 인물·카드 기하, 끊기지 않는 보행, 카드 edge와 동기화된 의상 reveal, 목적지별 목적 있는 상체 연기**라는 관찰 문법을 새 ImageGen 자산으로 모방한 독자적 13초 영상이다. 오프닝 00:00–00:03.5의 여권 확인→몸 돌리기·대각선 보행·약간의 축소는 의도된 예외다. 위치·크기·보폭 불변 기준은 00:03.5 이후 도시 보행/전환 구간에 적용하며, 숨겨진 발은 `NOT_MEASURABLE`로 기록하고 추측해 PASS시키지 않는다. Source: [사용자 브리프](../sources/taoagou-ticket-journey-user-brief-2026-09-05.md), [레퍼런스 분석](../../../motiongraphic/analysis/taoagou-nonfinger-comparison/analysis.md), [탄력감 연구](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md).

모든 게이트는 실패를 평균으로 상쇄하지 않는다. 원본 Flow 결과와 후처리 비교본을 분리하고, local composite가 예쁘다는 사실을 Flow-native 능력의 증거로 사용하지 않는다. 모든 후보는 `raw clip/hash + prompt + model/settings + input IDs/hash + QC report + measured status + user decision`을 함께 보존한다.

### 게이트 정의

| 게이트 | 통과시킬 질문 | PASS 조건과 산출물 |
|---|---|---|
| **G0 증거·모션 계약** | 무엇을 레퍼런스에서 관찰했고 무엇을 새로 설계했는가? | 레퍼런스 MP4의 SHA·정확한 timecode/frame, 네 전환 모두의 시작/종료/가림/정착 관찰, 사용자 브리프, 차용·제외 요소, 측정 불확실성을 한 계약에 고정한다. 첫 카드만으로 전체를 일반화하지 않는다. 사용자가 목표 계약을 확인하기 전 생성 확대 금지. |
| **G1 ImageGen 앵커** | 같은 사람이 원래 복장과 네 의상에서 같은 사람·같은 화면 크기로 보이는가? | ImageGen fictional 인물 identity pack 1개, 원래 복장 1개와 한복·기모노·치파오·아오자이 의상 plate 4개, 티켓 plate 4개, 9:16 위치·크기 기준 frame을 만든다. 얼굴·헤어·체형·신발·조명·카드 폭/높이/엣지 위치를 정지 frame과 contact sheet로 점검한다. 생성 티켓의 읽을 수 있는 정보는 시각 디자인 참고로만 두고 사실/정확한 문자는 별도 surface로 취급한다. |
| **G2 카드 시간축·기하** | Flow가 카드만 독립적으로 레퍼런스 같은 속도 프로파일로 올릴 수 있는가? | 기존 A/B/C는 한 조건당 1회인 baseline이다. 다음 G2 라운드는 동일한 pure-white start와 ImageGen Seoul end, 동일 모델/해상도/4초/9:16/24fps에서 **A: `start state → action → end state`로 명확히 쓴 C형 프롬프트, B: A와 동일한 프롬프트에 짧은 motion-guide 영상 참조만 추가**를 각각 2회씩 시험한다. UI가 motion-guide를 허용하지 않으면 B는 별도 설계로 `plain motion`을 비교한다고 선언하고, 동일 라운드 결과로 섞지 않는다. 모델 변경은 별도 라운드로 분리한다. 레퍼런스의 실제 첫 visible edge와 종료 edge를 별도 annotation하기 전에는 전체 전환 지속시간을 PASS로 추정하지 않는다. 측정된 목표 형태의 전환 길이는 약 0.47–0.50초(제안 기준, `±2 output frames`), normalized edge-progress RMSE `≤0.05`(제안 기준), 단조 상승, 총 이동량의 1%를 넘는 overshoot 금지, 최종 카드 위치 오차 축당 frame의 1% 이하, 카드 폭·높이 drift 2% 이하로 둔다. 폭/높이는 pink rail 하나가 아니라 카드의 여러 모서리·텍스트 기준점·바코드/엣지 표식을 함께 확인하고, 표면 identity가 유지되는지 별도 육안/프레임 검수한다. 검출 불확실성·누락은 0이 아니라 별도 confidence/manual review다. 현재 C는 2.167초에 정착해 목표 2.0초와의 절대 tolerance(약 2프레임)를 통과하지 못했으므로 **G2 미통과**다. Source: [Flow 실험 manifest](../../../motiongraphic/analysis/flow-motion-terms-2026-09-06/experiment.md), [Flow timing report](../../../motiongraphic/analysis/flow-motion-terms-2026-09-06/report.md), [측정 연구](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md). |
| **G3 마스터 보행→의상 변형** | 같은 보폭·발 위상으로 의상만 바뀌는가? | 하나의 master walk를 만들고 각 의상은 같은 source를 clothing-only edit한다. 기존 수정 기모노 결과는 사용자 관찰상 합격선의 역사 증거지만 새 정량 게이트는 pending이다. 도시 보행 구간에서 hip center가 master와 frame 폭/높이 기준 1% 이내, 머리–발목 projected height가 3% 이내(garment bbox가 아님), 좌/우 발 접지 순서와 시점이 ±1 frame, 보행 예상 구간에 3프레임 이상 의도하지 않은 freeze/restart가 없도록 한다. 카드가 가린 발은 `NOT_MEASURABLE`; 가림 전후 visible contact를 검사하고 manual check 없이는 PASS하지 않는다. 상체·시선·표정·팔은 목적에 맞게 달라져도 되며, 이 게이트는 상체를 픽셀 잠그지 않는다. |
| **G4 단일 통합 전환 — Flow-native** | 카드 edge와 새 의상 reveal이 자연스럽게 동기화되고, 인물은 계속 걷는가? | 4초 한 전환을 먼저 생성한다. 카드와 사람의 motion role을 분리해 지정하고, G0에서 확인한 실제 reference relation에 맞춰 edge 통과와 새 의상 reveal의 관계를 검사한다. 카드가 전신을 완전히 덮는지, 부분 가림인지, 다른 wipe인지 사전에 단정하지 않는다. 인물·카드의 평균 위치/크기 유지, 얼굴 identity jump, 이중 팔다리, white halo, hard cut, dissolve/morph 흔적이 없어야 한다. 원본 Flow output만 증거로 제출하며 local matte/retime/repair는 별도 비교본으로 라벨한다. 이 게이트가 두 라운드 안에 막히면 원인(입력/모델/프롬프트/도구)을 진단하고 사용자와 하이브리드 대안을 선택한다. |
| **G5 목적지별 생동감** | 보폭은 이어지면서 도시마다 실제 사람 같은 목적 있는 디테일이 다른가? | Seoul은 소품을 확인·정리하고 앞을 보는 한 행동, Tokyo는 우산/시선의 관계, Shanghai는 부채·시선·반응, Hanoi는 논라를 들어 쓰는 행동처럼 `관심 대상 → 행동 → 반응`을 각각 한 문장으로 고정한다. 걷기와 무관한 상체 동작은 허용하되, 행동이 보행을 멈추거나 발 위상을 재시작하지 않아야 한다. 정상 속도와 0.5배속, 모바일 축소본에서 행동의 목적이 읽히고 전환 직전/직후에도 gait가 이어져야 한다. |
| **G6 13초 provisional** | 네 전환과 오프닝이 하나의 독자적 영상으로 이어지는가? | 00:00–00:13, 9:16, 720p 우선, 24fps/312 frames, 오디오 포함의 provisional을 조립한다. 네 카드의 stacked slide-up 방향, edge reveal, settle, 지속 보행, 목적지별 연기, sound hit를 타임라인에 고정한다. 1080×1920은 720p PASS 이후 선택적 upscale로만 기록하고 native 1080으로 부르지 않는다. 원속 full review와 half-speed/frame contact sheet에서 치명적 identity/geometry/gait/transition 오류가 없어야 한다. |
| **G7 반복성·내보내기·사용자 최종 승인** | 같은 입력으로 다시 만들어도 품질이 유지되고, 사용자가 최종본을 승인했는가? | 한 라운드 최대 `2 variants × 2 repeats = 4` 생성으로 제한한다. 반복 2/3 이상 QC 통과는 pilot reproducibility 기록이지 통계적 보장이 아니다. 최대 두 라운드 후에도 실패하면 새 모델/크레딧 구매나 자동 하이브리드 전환을 하지 않고 진단 결과와 선택지를 사용자에게 보고한다. 최종 raw/output hash, prompt/settings/input IDs, QC report, export metadata를 묶고 사용자의 13초 정상속도·반속도 검토를 명시적으로 받아야 PASS다. |

### 실행 순서와 실험 설계

1. **계약 고정:** G0에서 네 전환의 visible edge, 카드가 가리는 범위, 인물의 허용 궤적, 오프닝 예외를 먼저 주석화한다. 원본 연구의 pink-stripe 검출은 visible proxy일 뿐 true first motion이나 Flow 내부 transform이 아니므로, 정착 시점과 전환 지속시간을 혼동하지 않는다.
2. **앵커 고정:** G1에서 ImageGen으로 identity/outfit/ticket plate를 만들고, 각 이미지의 역할을 Flow input manifest에 기록한다. 같은 인물의 여러 새 이미지로 매번 영상을 시작하지 않는다.
3. **작은 native probe:** G2에서 카드만 시험한다. 기존 A/B/C는 baseline으로 보존하고, 다음 라운드는 A(`start state → action → end state`로 명확히 쓴 C형 프롬프트)와 B(동일 프롬프트+짧은 motion guide)를 각각 2회씩 비교한다. UI가 guide를 지원하지 않으면 B를 plain-motion 별도 설계로 선언한다. 한 번에 한 변수만 바꾸고 모델 변경은 별도 라운드로 둔다. 속도 곡선의 정확한 LUT를 Flow가 읽는다고 가정하지 않으며, 공식 API/도구에 easing·mask·z-order 제어가 있다고 추정하지 않는다.
4. **보행 기준:** 2026-09-06 사용자의 “하나씩 순차적으로 수행” 요청에 따라 G2 검토 뒤 G3를 진행한다. G3에서 master walk 1개와 clothing-only variant를 비교한다. raw output의 같은 실제 시간 비교를 1차로 하고, frame/phase 정렬은 2차 분석으로만 사용해 변형의 위상 오류를 숨기지 않는다. visible foot contact만 측정하며 상체의 자연스러운 차이는 보존한다. Source: 사용자 실행 순서 요청, 2026-09-06.
5. **통합 증명:** G4에서 4초 단일 전환 하나만 Flow로 생성한다. 카드 움직임·인물 보행·가림 reveal을 한 결과에서 확인한 뒤에만 두 번째 목적지로 확대한다.
6. **연기와 조립:** G5→G6 순서로 목적지별 행동을 추가하고 13초 provisional을 조립한다. G6 전에는 최종 음악·썸네일·production 승격을 하지 않는다.
7. **반복과 승인:** G7에서 동일 조건을 다시 생성해 변동성을 확인하고, raw와 local-composite comparison을 별도 보관한 뒤 사용자 승인으로 종료한다.

### Flow 도구와 외부 사례의 위치

공개 제작 사례는 Flow/Omni를 스타일·참조 이미지·짧은 행동 단위로 반복 생성하고, 결과를 선별하거나 후반 편집하는 경향을 보고한다. Robby J의 Flow/Omni 인물+그래픽 사례는 모션은 생성되지만 숫자·텍스트·스크린샷 정확성은 별도 검사해야 한다고 기록한다. Carla Engelbrecht의 Flow 도구 개조 사례는 start frame·Ingredients·저장 frame·Type Overlay를 역할별로 사용하지만, 맞춤 도구가 위치/크기 일관성을 자동 보장한다고 말하지 않는다. Taruma Sakti의 **OpenArt 기반 Omni** 실험은 `ease-out`, `wipe`, `reveal`, `stagger`를 시작 상태→동작→종료 상태와 함께 썼지만, 정확한 frame curve를 검증한 것은 아니다. Design Force의 **구형 Veo 중심** 사례는 Flow 능력의 직접 검증이 아니며 timing·color·composite를 후반 보정한 제작팀 보고다. Oimi의 boarding-pass 템플릿도 Seedance용 워크플로이므로 Flow 능력의 직접 증거가 아니다. Source: [Robby J](https://automatewithrobby.fyi/blog/google-flow-tutorial-edit-any-video-with-gemini-omni.html), [Carla Engelbrecht](https://carlaeng.substack.com/p/personalize-your-ai-animation-tools), [Taruma Sakti](https://taruma.substack.com/p/motion-design-with-gemini-omni-flash), [Design Force](https://designforce.co/blog/google-flow-for-motion-teams/), [Oimi Seedance template](https://oimi.ai/en/templates/ai-travel-transition-video-prompt).

이 외부 자료는 제작 방향과 실패 가능성을 참고하는 **creator report**이며, 이 프로젝트의 PASS를 대신하지 않는다. 이 프로젝트의 계측 근거는 로컬 레퍼런스 분석과 native Flow A/B/C raw output뿐이다. 현재 Flow의 custom tool은 easing/matte/레이어 독립성을 강제하는 렌더러로 간주하지 않고, 먼저 수동 UI로 검증한 뒤 input ID·prompt·settings·raw download·hash·QC를 기록하는 얇은 실험 러너로 만든다.

### 산출물·상태 규칙

- 게이트별 폴더에는 `manifest`, 원본 입력 hash, raw Flow clip, frame extraction/contact, 측정 CSV/JSON, QC report, 판정(`PASS`/`FAIL`/`NOT_MEASURABLE`/`BLOCKED`)을 둔다.
- 생성 영상과 비교용 half-speed/contact/composite를 파일명과 보고서에서 구별한다. 후처리본을 Flow 결과로 제시하지 않는다.
- G2의 현재 C 결과와 G3의 기존 사용자 관찰상 성공은 각각 “미통과/역사적 참고”로 기록한다. G4–G7은 선행 게이트 PASS 전까지 `blocked`다.
- 입력 이미지, 프롬프트, 모델/해상도/길이/설정, 카드·인물 hash가 바뀌면 영향을 받는 게이트와 PASS를 무효화하고 해당 게이트부터 다시 검수한다.
- 모든 기준은 이 프로젝트의 **제안된 engineering thresholds**다. 레퍼런스 제작자가 공개한 규격이나 Flow의 공식 보장으로 표현하지 않는다.

## G0 실행 기록 — 2026-09-06, 사용자 검토 대기

Source: [G0 관찰·모션 계약](../../../motiongraphic/analysis/g0-reference-contract-2026-09-06/contract.md), [원본 잠금과 표본 메타데이터](../../../motiongraphic/analysis/g0-reference-contract-2026-09-06/source-metadata.json), [네 전환 프레임 비교](../../../motiongraphic/analysis/g0-reference-contract-2026-09-06/all-four-transition-anchors.jpg).

- 원본은 1080×2160(1:2), 30fps, 400프레임, 약 13.333초다. SHA-256: `bd60b90c27e588a57c506621f390294a25ca34bd01adbfc3aeb183ccbdac0cdc`. 우리의 13초·9:16·24fps 브리프와 구별하며, 원본 프레임 번호를 출력 프레임 번호로 그대로 복사하지 않는다.
- 네 전환의 중간 표본 모두에서 이전 복장의 상체와 새 복장의 하체가 동시에 보인다. 예: 첫 진입 F134/4.467초. 따라서 관찰에 맞는 목표는 **상승하는 카드 경계에 연동된 아래→위 의상 공개**이며, “빈 불투명 카드가 전신을 덮은 뒤 의상을 컷으로 교체”하는 방식은 목표가 아니다. 원본의 실제 마스크·레이어·생성 모델은 MP4만으로 확정하지 않는다.
- 원본 목적지(Bangkok/Seoul/Dali/Tokyo), 원본 얼굴·의상·항공사 표면을 그대로 옮기지 않는다. 목적지·전통복·13초 배분은 [사용자 브리프](../sources/taoagou-ticket-journey-user-brief-2026-09-05.md)를 유지하고 ImageGen 독자 자산을 사용한다.
- 카드 이동, 보행, 상체 연기는 별도 관찰 항목이다. 걷기 인상이 이어진다는 사실을 원본의 모든 접지·관절이 정확히 동일하다는 증거로 승격하지 않는다. 원본보다 엄격한 보행 정합 기준은 우리 제작 목표로 표시한다.
- 카드가 처음 보이는 시점, 인물의 복장이 바뀌는 빠른 구간, 카드 정착 시점은 서로 다른 사건이다. 첫 카드의 특정 경계 ROI에서 측정한 약 0.467초를 네 전환의 전체 진입 시간으로 일반화하지 않는다.

검토 자료: [원속 네 전환](../../../motiongraphic/analysis/g0-reference-contract-2026-09-06/four-transitions-source-normal.mp4), [0.5배속 네 전환](../../../motiongraphic/analysis/g0-reference-contract-2026-09-06/four-transitions-source-half-speed.mp4). 이 영상들은 **원본에서 발췌한 분석용 자료**이지 Flow 생성물이나 우리 제작 결과가 아니다.

이 기록의 당시 상태는 `G0_REVIEW_PENDING`이었다. 현재는 기존 고도화의 참고 증거이며, 이 재승인을 이유로 13초 개선 작업을 막지 않는다. 실행 순서는 아래 v0.4를 따른다.

## 13초 고도화 로드맵 v0.5 — 컷별 source window 실행 정본

2026-09-06 사용자 교정: 기존 의상별 10초 영상을 컷별로 선택해 1.80× 압축한다. 10초 source는 약 5.56초 출력이므로 긴 source 연장은 필수가 아니다. 아래의 기존 전역 시간축 부족 계산은 해당 구현을 그대로 유지할 때만 성립하며, 현재 제작 차단 조건에서 해제한다. 먼저 Seoul→Tokyo 한 쌍을 검증하고 나머지 경계로 확장한다. Source: 현재 대화의 사용자 「이 영상은 10초로 뽑았네?」「작성한 로드맵 다시 읽고 순차적으로 구현해봐」 및 [기존 source 기록](../../../motiongraphic/production/ticket-travel/performance-v2/README.md).

### 1. 시작점과 변경 범위

기준본: [final-sequence-v2.mp4](../../../motiongraphic/production/ticket-travel/final-sequence-v2/final-sequence-v2.mp4), 720×1280, 24fps, 312프레임, 13.000초. SHA-256 `23DE9DF7F3458C57DC353B00044CBB2291F5EFEABDA5AC46178BE8CD0400A1C1`.

v2는 v1의 타임라인·카드 기하·전환 함수를 재사용하고 Hanoi 흰 아오자이의 매트를 개선한 버전이다. 따라서 아래 연구의 **v1 전환 곡선 진단은 v2에도 적용되는 코드 근거가 있다.** 연구의 모든 시각 결함을 v2에 그대로 적용한다는 뜻은 아니다. Source: [v2 README](../../../motiongraphic/production/ticket-travel/final-sequence-v2/README.md), [v2 wrapper](../../../motiongraphic/production/ticket-travel/final-sequence-v2/render_final_sequence.py), [v1 renderer](../../../motiongraphic/production/ticket-travel/final-sequence-v1/render_final_sequence.py).

유지: 인물 정체성, 기존 ImageGen 인물·의상·카드 자산, 목적지와 순서, 13초·9:16, 기존 보행 기반, 기존 우산/부채/모자 행동, 개선된 Hanoi 매트. 오프닝의 리듬·사운드는 먼저 변경하지 않는다. 전통복이나 목적지가 레퍼런스와 다르다는 것은 결함이 아니다.

변경 축은 순서대로 **T: 목표 보행 tempo**, **M: 카드 전환의 시간·기하·변신 연결**, **A: 목적 있는 연기와 후속 반응**이다. 먼저 T1에서 같은 인물 take만 제한적으로 비교하고, retime만으로 부족할 때 T2 Flow 보행 편집을 추가한다. 선택한 tempo를 T3에서 의상별 source에 잠근 뒤 M/A를 진행한다. 동일 실험에서 T/M/A를 동시에 바꾸지 않으며, 기존 13초의 원본 파일은 덮어쓰지 않는다.

필독 근거: [RESEARCH 전체](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md) §2·4·5·6·7, [HANDOFF 전체](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/HANDOFF.md), [보행 속도 감사](../../../motiongraphic/analysis/walking-cadence-audit-2026-09-06/report.md), [기존 연기 프롬프트](../../../motiongraphic/production/ticket-travel/performance-v2/long-variant-prompts.md), [v2 화면 표본](../../../motiongraphic/production/ticket-travel/final-sequence-v2/final-sequence-v2-contact.jpg).

### 1A. T1–T3 보행 tempo를 먼저 확정한다

보행 감사의 현재 결론은 **레퍼런스가 기준본보다 빠르게 읽힌다**는 질적 관찰까지다. 레퍼런스가 전역 배속되었다는 증거, 정확한 배속 계수, steps/s 또는 동일 발 접지 주기는 아직 없다. 그러므로 1.10/1.20은 레퍼런스에서 추정한 숫자가 아니라 다음 편집 실험을 위한 **제안 tempo factor**다. Source: [보행 속도 감사](../../../motiongraphic/analysis/walking-cadence-audit-2026-09-06/report.md) 결론·측정 제한.

**T1 — 같은 인물 take의 제한적 retime probe**

- 동일한 배우/의상/구도에서 person-only component take를 추출해 **같은 source 시작 시각과 같은 review 출력 길이(예: 2초)**를 유지한 채 `1.00`, `1.10`, `1.20` 후보를 만든다. 카드·카메라·오디오·13초 타임라인은 이 실험에서 고정한다. 13초 완성 MP4를 통째로 retime해 카드까지 빨라지게 하지 않는다.
- factor는 이 로드맵에서 **표준 재생속도 배율**로 고정하고, 결과 메타데이터에 `source_window`, `output_window`, `effective_playback_speed`를 기록한다. 따라서 `1.20×`에서 2초 출력은 2.4초 source를 소비하고, 2초 source는 약 1.667초 출력이 된다. 이 정의를 프롬프트나 파일명에서 다른 시간 배율과 혼용하지 않는다.
- retime은 다리만 조절하는 것이 아니다. 얼굴·상체·팔·소품·옷의 후속 움직임을 포함한 **whole-body take**가 함께 빨라진다. 상체를 원속으로 남긴 채 다리만 가속하는 것은 별도 제어가 검증되기 전까지 사용하지 않는다.
- `1.10` 이상은 레퍼런스 속도의 측정값이 아니라 비교 후보다. retime은 실제 보폭 진폭을 키우지 않으므로, 레퍼런스와 v2의 전신 take·의상이 다른 상태에서 원속/1.10/1.20을 원속·반속도·모바일 크기로 보고 보행 리듬·속도 인상이 가까워지는지, 상체·소품이 급해지거나 끊기는지, 같은 사람이 유지되는지 확인한다. 작은 보폭 자체가 남으면 T2의 새 보행 source 문제로 분리한다.

T1의 **PASS**는 “조금 가속한 후보가 기준본보다 레퍼런스의 경쾌한 보행 리듬·속도 인상에 가까워지고, 상체·소품·인물 크기·카드가 허용 가능한 상태”다. 실제 보폭이 여전히 짧거나 세 후보 모두 어색하면 T1은 `insufficient`로 기록하고 T2로 간다. 이 단계에서는 정확한 발 접지 수치를 만들지 않는다. 가려진 발은 `NOT_MEASURABLE`로 남긴다.

**T1 현재 판정 — 사용자 선택 `1.80×` (Tokyo source에만 한정)**

2026-09-06 high-tempo probe에서 현재 `tokyo-parasol-10s.mp4`의 person-only 구간을 `1.50×/1.80×/2.00×`로 비교했고, 각 결과는 2초·48프레임이었다. 사용자는 이 비교에서 **1.80×를 현재 Tokyo source의 작업 tempo로 선택**했다. `1.80×`는 표준 재생속도 배율이며 해당 2초 출력은 source `3.5–7.1s`를 소비한다. 이 선택은 레퍼런스에서 측정한 계수도, 모든 의상 source에 대한 승인도, 13초 전체 배속 승인도 아니다. Source: [high-tempo metadata](../../../motiongraphic/analysis/high-tempo-probe-2026-09-06/metadata.json), [probe README](../../../motiongraphic/analysis/high-tempo-probe-2026-09-06/README.md).

**T2 — T1이 부족할 때만 Flow 보행 편집**

가속 후에도 작은 보폭이 문제로 남거나, 단순 retime이 상체·소품을 급하게 만들거나, 보행이 끊기면 아래 prompt로 **기존 walking take만** 편집한다. 의상·카드·새 인물 이미지를 함께 바꾸지 않는다.

```text
Edit the supplied walking take to feel slightly more purposeful and brisk while preserving the same woman, clothing, white studio, locked camera, average screen position and apparent size. Keep a continuous, natural alternating walk from the first frame to the last: clear forward weight transfer, readable alternating steps, and a consistent stride rhythm. Do not pause, pose, shuffle in place, restart the gait, or freeze between steps. Do not make her sprint, lunge, or let the camera chase her.

Keep the existing upper-body performance alive and natural: allow small independent head, eye, shoulder, arm and prop follow-through rather than locking the torso, but do not add a new story action in this gait test. Preserve identity, body proportions and clothing design. The requested change is a modestly brisk walking performance, not a global camera move or a new choreography. Keep the output long enough to cover the selected timeline without arbitrary looping, padding or a repeated contact pose.
```

이 prompt의 “same walk”은 identity·방향·연속성·목표 tempo를 뜻하며, 의도적으로 tempo를 바꾸는 T2에서 원본의 **정확히 같은 foot-contact timestamp**를 보장한다고 쓰지 않는다. T2 raw output이 합격한 경우에만 그 take를 T3의 tempo source로 채택한다.

**T2 현재 상태 — 조건부 대기**

현재 Tokyo T1 선택을 이유로 T2 Flow 보행 편집은 실행하지 않는다. 새 source가 부족하거나 선택 tempo에서 보행이 끊기고 상체·소품이 급해지는 경우에만, 기존 walking take에 한정해 T2를 재개한다. 새 의상·카드·인물 이미지를 섞지 않는다.

**T3 의상 편집 공통 보존 블록**

```text
Preserve the selected walking baseline in each outfit edit: continuous alternating left/right steps, stride rhythm, walking direction, average screen position and apparent size. Continue walking throughout the entire source without a start pose, pause, slowdown or ending pose. Let the face, eyes, shoulders, arms and props vary naturally for the destination. Do not change the gait tempo or make the person sprint. Source excerpts will be selected and phase-matched during editing; do not generate a wardrobe transition in this take.
```

**T3 — 선택한 tempo를 도시·의상에 잠근다**

- T1 또는 T2에서 고른 tempo와 공통 phase anchor를 기준으로 Seoul→Tokyo→Shanghai→Hanoi source를 매핑한다. 각 도시에서 보행 위상을 새로 시작하지 않으며, 임의 loop·freeze·빈 프레임 padding으로 길이를 맞추지 않는다.
- 각 도시의 source 시간을 전체 영상 시각에 고정하지 않고 `u = source_in + 1.8 × (t - cut_in)`으로 선택한다. 0.5초 전환 겹침을 포함한 nominal source 소비량은 Seoul 6.3초, Tokyo 5.4초, Shanghai 4.5초, Hanoi 3.6초다. 각 10초 source 안에 들어간다. 이는 길이 충족이지 보행 위상 일치의 증거는 아니다. Source: [기존 전환 구간 산술](../../../motiongraphic/analysis/t3-coverage-2026-09-06/REPORT.md), 위 사용자 교정.
- **T3 현재 상태 — active, 컷별 위상·연기 구간 검증:** 먼저 Seoul→Tokyo 4초 후보에서 1.80×만 변경하고 기존 카드 시간·기하·매트를 유지한다. 양쪽 source 시간을 동일하게 선택 가능한 구간부터 시험한다. 이후 Tokyo→Shanghai→Hanoi는 source_in을 독립 선택하되 전환 겹침 전후의 지지발·좌우 접지 순서·다리 진행 방향을 실제 프레임으로 맞춘다. 숫자 source 시각의 변경은 허용하지만 화면에서 보행이 재시작하거나 점프하는 것은 허용하지 않는다. 목적 있는 상체 행동도 채택 구간 안에 남아야 한다. 맞는 구간이 없을 때만 해당 take의 Flow 재편집을 검토한다. [이전 global coverage 보고서](../../../motiongraphic/analysis/t3-coverage-2026-09-06/REPORT.md)는 폐기하지 않고 조건부 구현 진단으로 보존한다.
- 카드 M1 실험은 T3에서 선택된 tempo의 동일한 4초 발췌를 source로 삼고, 원래 느린 v2 발췌는 항상 별도 baseline으로 보존·비교한다. 카드 motion 개선과 보행 tempo를 한 후보에서 동시에 재추정하지 않는다.

T3 **PASS**는 컷별 source window와 공통 1.80×가 기록되고, 실제 전환에서 보행 위상·크기가 이어지며 loop·freeze·padding 없이 13초 구성을 덮는 경우다. 첫 pair의 통과는 나머지 도시의 통과가 아니다. T1/T2와 T3의 source 및 hash가 바뀌면 뒤의 M/A 게이트를 해당 source로 다시 검사한다.

### 2. 레퍼런스와 기준본의 차이 → 수정 항목

| 항목 | 레퍼런스 관찰 | 현재 13초 | 개선 명세 |
|---|---|---|---|
| 보행 tempo | 발 교대·보폭이 더 빠르고 경쾌하게 읽힘. 전역 배속·정확한 계수는 미확정 | v2는 도시 take의 스텝 폭과 정지에 가까운 구간 때문에 상대적으로 느리게 읽힘 | T1에서 같은 person take를 1.00/1.10/1.20으로 비교. 부족하거나 부자연스러우면 T2 Flow 보행 편집, 이후 T3에서 선택 tempo를 모든 의상에 공통 잠금 |
| 카드 속도 | 작은 초기 진입→중간 급통과→긴 감속 | `1-(1-p)^3`: 시작부터 가장 빠른 cubic ease-out | 이동량이 중간 짧은 구간에 집중되는 비대칭 가속·감속으로 변경. 단순히 ease-out을 추가하는 작업 아님 |
| 회전 정착 | 기울어진 경계가 상승하며 직립하는 복합 움직임 | 위치와 각도에 같은 eased 값을 사용 | 먼저 y 진행만 개선한 뒤 각도 정착을 따로 비교. 마지막에 속도 연동 blur 검사 |
| 환복 경계 | 이전 상체/새 하체가 동시에 보이는 아래→위 공개 | 독립 인물·카드와 보완형 가림은 이미 구현 | 새 곡선에서도 경계와 의상 공개가 붙어 움직이고, 발 위상이 튀지 않게 유지 |
| Seoul 연기 | 원본 첫 도시부터 시선·소품 관계가 읽힘 | 다른 도시에 비해 주 행동이 덜 명확하다는 연구 관찰 | 현재 복주머니를 확인·정리하고 앞을 보는 짧은 행동부터 시험 |
| 나머지 도시 | 각기 다른 관심 대상과 반응 | 우산·부채·모자 행동이 이미 존재 | 새 소품보다 시선→행동→반응의 읽힘과 실제 사용 구간을 개선 |
| 옷·끈·시선 | 보행과 별개로 자연스럽게 이어지는 움직임 | 구간별 추가 검수 필요; 모든 부위의 결함을 입증한 것은 아님 | 눈/머리/어깨 동시 회전 강제 금지. 손동작 뒤 천·끈의 후속 움직임 허용 |

Source: [연구 §2·4·5](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md), v1/v2 renderer 및 위 v2 표본. 첫 진입의 F130–144@30fps는 왼쪽 가시 경계 proxy이고, F133→135에 관측 이동량의 62.5%가 집중됐다. 이것은 네 전환의 숨은 키프레임이나 동일 보행의 증거가 아니다. 큰 위치 bounce는 관측되지 않았으므로 기본값으로 넣지 않는다.

### 3. 외부 Flow 연구를 실제 설계로 번역

| 자료 | 가져올 방법 | 가져오지 않을 주장 |
|---|---|---|
| [Robby J: Flow 영상 편집](https://automatewithrobby.fyi/blog/google-flow-tutorial-edit-any-video-with-gemini-omni.html) | 기존 영상을 편집 입력으로 사용; 공통 유지 조건+2–4개 시간 beat; 실제 디자인 입력; 여러 후보 비교 | 공개 페이지는 전체 템플릿이 아니라 구조·실패 보고다. 정확한 그래픽 복제·시간 준수 보장이 아님 |
| [Carla: Flow 도구 개조](https://carlaeng.substack.com/p/personalize-your-ai-animation-tools) | source preview, 입력 선택, prompt inspector, 개별 재시도, 버전/결과 저장; 시작 구도와 참조 역할 분리 | 도구의 존재가 렌더·갤러리 저장 성공이나 위치 고정을 보장하지 않음 |
| [Taruma: OpenArt의 Omni](https://taruma.substack.com/p/motion-design-with-gemini-omni-flash) | 요소별 시작 상태→동작→종료 상태, 용어와 실제 행동 설명 결합 | Flow 직접 실험이 아니며 숫자 곡선 검증 없음. 예제의 bounce/flash/glitch를 우리 영상에 복사하지 않음 |
| [Google Omni 프롬프트 가이드](https://deepmind.google/models/gemini-omni/prompt-guide/) | 기존 영상의 특정 요소 수정, 참조 입력, 시작·끝 프레임 기능을 필요에 따라 사용 | 문서상의 보존 설명은 우리 영상의 발 접지·픽셀 보존 검수 대체 불가 |

이것들은 제작자 보고/공식 기능 설명이지 우리의 성공 결과가 아니다. Design Force의 구형 Veo 사례는 과거 맥락으로만 유지하며 현재 Omni의 실패 근거로 쓰지 않는다. Flow 카드 단독 A/B/C도 이미 수행했으므로 그대로 재실행하지 않는다. C는 정착 2.167초로 당시 목표보다 늦었고, 단일 색 띠 계측만으로 강체 이동을 입증하지 못했다. 다음은 **기존 인물 포함 전환에서 편집 지시가 개선을 만드는지**를 시험한다. Source: [A/B/C 기록](../../../motiongraphic/analysis/flow-motion-terms-2026-09-06/experiment.md), [측정 한계](../../../motiongraphic/analysis/flow-motion-terms-2026-09-06/report.md).

### 4. Flow 입력·도구 설계

첫 대상은 **T3에서 선택한 tempo의 5.0–9.0초 Seoul→Tokyo 전환 하나**다. 24fps F120–215, 4초, 전환은 이 발췌의 1.5–2.0초에 위치한다. 원래 느린 `final-sequence-v2` 발췌는 항상 같은 구간의 비교 baseline으로 보존한다. 인트로→Seoul보다 보행·구도 변화가 적어 카드 모션의 영향부터 분리하기 좋다는 설계 판단이다. 첫 진입 문제는 뒤의 전체 검수에서 반드시 다시 본다. 실제 발췌 전 renderer 이벤트/프레임을 확인한다.

입력 역할:

- **편집 대상 영상:** 기존 13초의 위 4초 발췌. 보행·인물·전환 전후 내용의 기준. 원본 레퍼런스 영상과 혼동하지 않는다.
- **디자인 참조:** 기존 ImageGen Seoul/Tokyo 카드. 가능하면 해당 편집 UI가 허용하는 필요한 이미지 하나부터 연결한다. 참조를 넣었다고 표면이 고정됐다고 간주하지 않는다.
- **시작/끝 정지 프레임:** 우선 QC 앵커다. 영상 편집 모드와 동시 결합이 지원된다고 가정하지 않는다. 별도 Frames 경로를 시험할 때만 구도 입력으로 승격하며, 보행 재생성 위험을 따로 표시한다.
- **동작 가이드:** 첫 라운드에는 넣지 않는다. 실패 원인이 시간 곡선 해석일 때, UI가 참조 영상을 지원하면 카드만 담긴 새 가이드를 별도 실험 입력으로 검토한다. 원본 인물·항공권을 제작 자산으로 추출하지 않는다.

맞춤 도구 가칭 **Ticket Motion & Performance Lab**. 새 이미지 생성기는 만들지 않고 기존 ImageGen 이미지를 불러온다. Nano Banana로 대체하지 않는다. 세 모드 `Tempo Review` / `Motion Edit` / `Acting Edit`를 둔다. `Tempo Review`에는 target gait asset, source/output window, factor 정의, whole-body retime 여부와 T1/T2/T3 상태를 표시한다.

필수 기능은 (1) 현재 project/gallery의 source 선택·미리보기, (2) target gait asset과 입력별 역할 라벨, (3) factor 및 source/output window 기록, (4) 공통 유지 조건과 변경 블록 분리, (5) 실제 전송 프롬프트 확인, (6) 모델/길이/비율/해상도 및 비용 표시, (7) 한 조건씩 제출·상태/오류 보존, (8) 원본 결과 갤러리 저장·다운로드, (9) v2/1.00/1.10/1.20/T2와 같은 시각 비교 및 검수 메모다. 파일 hash와 프레임 계측은 다운로드 후 로컬에서 처리할 수 있다.

도구 구현 순서: 현재 화면의 영상 편집 입력/출력 경로 확인→Tempo Review의 source/output window·factor 기록→선택·프롬프트 미리보기·기존 결과 내보내기 smoke test→실험 제출 버튼 연결→비교 UI. Flow에 retime API나 exact cadence/easing/mask 제어가 있다고 가정하지 않는다. 프롬프트 작성만 하는 UI를 영상 생성 도구 완성으로 보고하지 않는다. 지원하지 않는 기능은 비활성화하고 실제 수동 Flow 경로를 명시한다. 도구가 픽셀 좌표·Bézier·LUT·z-order·matte를 강제하는 API라고 가정하지 않는다. 수치 QC는 프롬프트의 화면 텍스트가 아니라 별도 검사 메타데이터다. Source: [Flow Tools 공식 안내](https://support.google.com/flow/answer/17104535?hl=en), Carla 제작자 보고. 공개 공유/게시하지 않는다.

### 5. 순차 고도화 게이트 — 기존 제작을 재승인하는 절차가 아님

| 단계 | 실행 | 산출물·통과 조건 |
|---|---|---|
| **T1 보행 tempo probe** | 같은 person component take를 1.00/1.10/1.20 factor로 비교. 카드·카메라·오디오·13초 타임라인은 고정하고, whole-body retime 결과를 별도 파일로 보존 | 레퍼런스의 경쾌한 인상이 개선되고 얼굴·상체·소품·인물 크기·카드가 허용 가능하면 factor 선택. 전역 배속의 증거나 레퍼런스의 실제 계수로 승격하지 않음 |
| **T2 조건부 Flow 보행 편집** | T1이 보폭 부족·끊김·급해진 상체·소품 문제를 보이면 기존 take에만 T2 prompt 적용. 새 카드·의상·인물 이미지는 섞지 않음 | 목적 있는 연속 보행, 명확한 교대와 보폭, 안정된 평균 위치. sprint·shuffle·pause·restart·loop·freeze가 없고 선택 tempo source로 쓸 수 있어야 함 |
| **T3 의상별 tempo lock** | 기존 10초 take의 컷별 source window를 고르고 1.80× 적용. Seoul→Tokyo부터 전환 겹침의 보행 위상을 검증한 뒤 나머지 도시로 확장 | 실제 보행 점프 없이 같은 tempo·접지 관계·크기를 유지. 기존 상체 행동이 선택 구간에 남음. 긴 source 생성은 필수가 아니며 맞는 구간이 없을 때만 해당 take 재편집 |
| **M1 카드 가속** | T3의 선택 tempo 4초 발췌를 보존. A=간결한 동작 편집 지시, B=같은 목표를 상태/시간 beat로 명시. 각 2회; 새 상체 연기·추가 blur·회전 변경은 하지 않음 | 기준 v2와 T3 tempo baseline 및 A/B를 원속·반속도 비교. 작은 진입→중간 급통과→긴 감속이 분명해지고, 선택 보행·카드 기하·표면·환복 경계가 악화되지 않음 |
| **M2 정렬·질감** | M1 합격 후보에서 먼저 회전 정착만 조정. 필요할 때 다음 실험에서 카드에만 짧은 속도 연동 blur | 속도 개선을 유지하며 기울기가 정돈되고 정착 후 흔들리지 않음. 얼굴/인물 외곽에 blur·white halo를 만들면 반려 |
| **A1 Seoul 생동감** | 카드 개선 조건은 보존. 먼저 기존 take의 사용 구간 확인; 부족하면 해당 보행 source에서 관심 대상→행동→반응 하나만 편집 | 무음 약 2초에 복주머니 확인/정리 행동이 읽히고 보행·크기가 유지됨. 행동 후 포즈 정지 없음 |
| **A2 나머지 도시** | Tokyo→Shanghai→Hanoi 순으로 기존 take를 검수. 필요한 장면만 한 가지 반응을 편집 | 우산·부채·모자라는 기존 성과를 유지하면서 각기 다른 목적이 읽힘. 필요한 동작이 실제 채택 구간 안에 들어옴 |
| **I1 결합·전환 회귀** | 개선한 연기와 카드 전환을 한 쌍에서 다시 검수한 뒤 네 경계로 확대 | 같은 입력을 썼다는 기록이 아니라 실제 경계 전후의 접지·얼굴·크기·가림 관계가 유지됨. 오프닝→Seoul 포함 |
| **I2 13초 교체본** | 개선 통과한 구간만 기존 구성에 반영, 기존 오디오 유지 후 필요한 slide sound 동기만 확인 | 13초·9:16 원속 전체에서 리듬 개선, 기존 v2 대비 퇴행 없음. 사용자 비교 승인 후 개선본으로 채택 |

게이트 순서는 **T1 → (필요 시 T2) → T3 → M1 → M2 → A1/A2 → I1/I2**다. T1/T2/T3는 기존 13초 v2를 소급해 무효화하는 재승인이 아니라, 이후 개선본의 보행 baseline을 정하는 단계다. M1의 A/B는 새 실험 프롬프트다. 로컬 합성 기준본에 존재하지 않는 “기존 통합 Flow 프롬프트”를 만들어낸 기록으로 남기지 않는다. 같은 source에서 독립적으로 분기하고 모델/입력은 고정한다. 두 조건×두 결과=최대4개/라운드. 두 라운드로 개선이 없으면 원인(tempo 정의/시간 지시/입력 역할/편집 보존/도구 호출)을 좁혀 다음 방식을 제안한다. 아무 변화 없는 재시도를 계속하거나 원본을 덮어쓰지 않는다.

### 6. 실제 입력용 프롬프트 초안 — 아직 생성하지 않음

아래는 연구를 적용한 새 작성물이지 다른 제작자의 전문 프롬프트나 검증된 성공 프롬프트가 아니다. 실제 UI에서 연결된 이미지/영상의 역할과 4초 길이를 확인한 뒤 사용한다.

**M1 공통 유지 블록**

```text
Edit the supplied four-second Seoul-to-Tokyo transition video. Change only the timing profile of the incoming Tokyo boarding-pass card and the wardrobe reveal that follows its moving edge.
Preserve the selected T3 walking-tempo baseline: continuous alternating steps, the left/right foot-contact order and chosen contact timing, its chosen stride rhythm, walking direction, identity, body proportions, and average screen position and apparent size. Do not revert to the slower original-v2 cadence or silently change the person's tempo during this card test. Preserve her current upper-body performance; do not add a new gesture in this test. Keep the camera locked and the white studio unchanged.
The card moves independently of the woman. Its rising edge reveals the existing Tokyo look from the legs upward while the previous upper body remains visible until the edge passes. Do not carry the woman upward with the card or cover her completely with a blank card before switching outfits.
Keep the existing ticket artwork, lettering, barcode, card dimensions, tilt path and shadow treatment. Do not add labels, effects or motion blur. No hard cut, dissolve, rubbery morph, doubled body, white halo, zoom, bounce or overshoot. Do not speed up or slow down the whole video, the camera, or the selected walking take. The card timing is the only motion variable in this test.
```

**M1-A 간결한 변경 블록**

```text
Keep the transition within 1.5 to 2.0 seconds. Use asymmetric acceleration and deceleration: a small, slow initial entry, a very fast middle passage, then a longer, progressively gentler deceleration into the existing final placement. Before and after that interval, retain the source action and composition. The card settles once; the woman's walk continues.
```

**M1-B 구조화 변경 블록**

```text
STATE IN, 0.0-1.5 seconds: retain the source Seoul card and ongoing walk. The Tokyo card remains below the frame.
CARD MOTION, 1.5-2.0 seconds: use an asymmetric speed profile for the existing bottom-up slide and edge-led reveal. First expose only a small portion of the leading edge with a slow entry. Accelerate sharply through a brief middle passage that covers most of the travel. Then decrease the movement progressively over a longer settling tail, reaching the existing final placement at 2.0 seconds.
SIMULTANEOUS PERSON ACTION: throughout that passage, continue the selected T3 walking-tempo baseline without a restart or pause. The woman's body does not inherit the card's upward travel. The wardrobe reveal follows the moving card edge, not a full-frame cut.
STATE OUT, 2.0-4.0 seconds: retain the settled Tokyo card, the existing kimono and parasol performance, and continuous walking. No card bounce or drift.
```

이 실험의 시각 지정은 목표값이지 Flow의 강제 타임라인 제어가 아니다. 기존 tilt path 보존은 위치의 시간 함수만 바꾸기 위한 비교 조건이며, 위치와 회전의 완전한 분리를 보장하지 않는다. 실제 각도까지 바뀐 후보는 그 차이를 기록한다.

**A1 생동감 편집 초안 — Seoul의 실제 보행 source에 적용**

```text
Edit this existing hanbok walking take. Keep the selected T3 tempo baseline: continuous alternating steps, the left/right foot-contact order and chosen contact timing, its chosen stride rhythm and walking direction. Preserve her identity, body proportions, average screen position and apparent size, the camera, white background and clothing.
While continuing to walk, she briefly looks down at the small pouch already in her hand, makes one natural adjustment to its handle or strap, then looks ahead with a relaxed, lightly pleased expression. Do not introduce a new prop.
Let her eyes, head and shoulders respond naturally rather than turning as one rigid unit. Allow the existing cloth and pouch strap to follow her movement with a slight natural delay. Her free arm may balance the walk.
Do not pause, restart the walk, shorten the steps, or stop to pose after the adjustment. The action flows into continued walking beyond the selected moment. Keep everything else the same.
```

해당 source에 실제 손잡이/끈이 없는 경우 관찰 가능한 소품 구조에 맞게 문구를 바꾼다. 생성 이미지의 새로운 포즈로 전체 보행을 다시 시작하지 않는다. 긴 take의 가장 읽히는 구간을 고르되 발 위상·방향이 맞지 않는 구간을 시간 이동으로 숨겨 채택하지 않는다.

### 7. 목적지별 생동감 명세

| 구간 | 이미 있는 성과 | 필요한 경우 추가할 작은 사건 | 유지 조건 |
|---|---|---|---|
| Seoul | 한복·복주머니·보행 | 소품 확인→한 번 정리→앞을 봄 | 가장 먼저 시험. 끈/손 모양은 기존 자산에 맞춤 |
| Tokyo | 우산을 든 기모노 보행 | 손잡이를 가볍게 조정→우산 가장자리 쪽 시선→앞으로 복귀 | 새 우산 생성·새 헤어·보행 재시작 금지 |
| Shanghai | 치파오·부채 동작 | 한두 번 부침→바람을 느끼는 짧은 표정 변화 | 계속 부채만 흔드는 루프를 강제하지 않음 |
| Hanoi | 논라를 들어 쓰는 행동, 흰 옷 매트 개선 | 챙을 살짝 정리→짧은 만족 반응 | 이미 잘 읽히면 재생성하지 않음. 흰 옷 투명화/halo 재발 금지 |

기준은 작거나 많은 움직임이 아니라 **무엇을 보고 왜 움직이는지가 읽히는가**다. 보행의 체중 이동과 팔의 비대칭은 허용하고 눈·머리·어깨·옷이 같은 프레임에 시작/종료하도록 강제하지 않는다. Source: [RESEARCH §4·6](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/RESEARCH.md), [HANDOFF §2](../../../motiongraphic/analysis/elasticity-lifelike-2026-09-06/HANDOFF.md).

### 8. 검수·반영·실패 처리

- **개선 검사:** 카드 가시 경계의 프레임별 이동량·최대 속도 시점·정착 시점을 비교한다. 여러 모서리/표면 기준점으로 강체 유지도 검사한다. 속도 형태의 정규화 그래프와 절대 시간 그래프를 모두 보며 시작 오차를 정렬로 감추지 않는다. 첫 ROI의 62.5%를 모든 카드의 절대 합격 숫자로 강제하지 않는다.
- **퇴행 방지:** T1의 의도적인 tempo 변경으로 인해 원래 느린 v2와 접지 시각이 달라지는 것은 FAIL로 세지 않는다. T3가 선택된 뒤 M/A 후보는 **선택된 T3 baseline과 같은 시간**에서 좌/우 접지 순서와 선택 접지 시점, 골반 평균 위치, 신체 크기, 카드 표면, reveal 경계, 앞뒤 연결을 비교한다. 원래 v2는 속도 인상의 별도 참고본으로만 남긴다. 이전 ±1프레임 접지·인물 3%·카드 2% 등의 제안치는 경고/재검토 기준이지 이미 승인한 영상의 소급 FAIL 조건이 아니다. 가려진 발은 측정 불가로 남긴다.
- **육안:** 무음 원속·휴대폰 크기에서 전환 리듬과 약 2초 행동을 먼저 보고, 반속도/프레임으로 halo·이중 팔다리·얼굴 점프를 찾는다. 느리게 볼 때만 좋아 보이는 결과는 채택하지 않는다.
- **재결합:** Flow가 인물과 카드가 포함된 구간 전체를 개선했다면 raw 후보의 진입·종료 연결을 검수해 교체한다. 연기만 개선했다면 기존 독립 인물/카드 합성 경로에 반영한다. 원본 Flow, 비교용 발췌, 로컬 합성 개선본을 구분하며 어느 경로든 사용자에게 출처를 명시한다.
- **실패 시:** 우선 같은 입력의 편집 지시를 수정한다. 카드의 정확한 시간 제어만 남으면 연구가 제안한 로컬 LUT/Bézier 비교를 별도 후보로 제시할 수 있다. 이는 이미 있는 합성 기반의 개선 옵션이지 강제 전환이나 Flow 단독 실패 선언이 아니다. 전체 영상 retime으로 카드만 빠르게 보이게 만들면 보행까지 바뀌므로 금지한다.
- **기록:** baseline/input/output hash, 실제 prompt/settings/mode, 반복 번호, 성공·실패 모두의 raw 결과, 변경 변수, 측정 불확실성, 사용자 비교 판정을 남긴다. 변경된 구간과 연결만 재검수하며 무관한 기존 성과는 유지한다.

현재 실행은 **T3 컷별 1.80× 보행 연결 후보 → 모든 도시 경계 검사 → M1 Flow 카드 가속 A/B → M2 회전·필요 시 blur → A1/A2 필요한 연기만 개선 → I1/I2 13초 통합**이다. T1은 완료, T2는 조건부다. 기존 10초 source로 시작하며 연장 기능 활성화나 신규 이미지 생성은 선행 조건이 아니다. 첫 T3 후보는 로컬 편집 비교이며 새 Flow 생성 결과라고 부르지 않는다. Source: 위 사용자 교정, [high-tempo probe](../../../motiongraphic/analysis/high-tempo-probe-2026-09-06/README.md).

**T3 첫 실행 후보:** [서울→도쿄 4초 비교](../../../motiongraphic/analysis/t3-cut-local-2026-09-06/t3-local-vs-existing-v2-5-9s.mp4), [source window·실행 기록](../../../motiongraphic/analysis/t3-cut-local-2026-09-06/README.md). Seoul source 2.5–6.1초, Tokyo 5.2–9.7초를 1.80×로 사용하며 전환 overlap source 5.2–6.1초는 동일 시각으로 맞춘다. 기존 카드 timing/geometry는 유지한다. 이는 nominal 설계 앵커이며 실제 발 접지 일치나 전체 T3 통과를 뜻하지 않는다. Tokyo 기존 prompt의 3–5초 우산 조정 사건은 이번 source window 앞에 있으므로, 연기 보존 검수에서 실제 결과를 확인하고 후속 후보의 window 또는 해당 연기를 조정할 수 있다. Source: [metadata](../../../motiongraphic/analysis/t3-cut-local-2026-09-06/metadata.json), [기존 연기 프롬프트](../../../motiongraphic/production/ticket-travel/performance-v2/long-variant-prompts.md).
