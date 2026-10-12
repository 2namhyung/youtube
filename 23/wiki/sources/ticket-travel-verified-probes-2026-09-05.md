# Ticket travel Flow 검증 프로브 기록

- Captured: 2026-09-05
- Provenance: 이 페이지는 현재 대화의 사용자 보고·화면 관찰과 vault 외부 `motiongraphic/` 및 Downloads 파일을 인용한 실험 기록이다. 대응하는 raw 캡처를 새로 만들지 않았으며 raw를 수정하지 않았다.
- Status: reviewed, 4초 프로브 범위만 사용자 합격선 판정
- Scope: 사용자가 제공한 레퍼런스를 참고한 독자적 fictional 영상 제작 실험. 원본 authoring 프로젝트나 픽셀 복제를 입증하는 자료가 아니다.

## Source inventory

- Reference video: [ticket_travel_7648553013002489109.mp4](../../../motiongraphic/references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4). Earlier analysis records 1080×2160, 30fps, about 13.333 seconds. Source: [analysis](../../../motiongraphic/analysis/taoagou-nonfinger-comparison/analysis.md).
- Flow work notes and exact prompts: [motion-edit-probe README](../../../motiongraphic/production/ticket-travel/motion-edit-probe/README.md).
- Current local composite: [synced-transition-v1 README](../../../motiongraphic/production/ticket-travel/synced-transition-v1/README.md), [render script](../../../motiongraphic/production/ticket-travel/synced-transition-v1/render_synced_transition.py).
- User-provided downloadable inputs: `C:\Users\every\Downloads\Woman_walking_in_hanbok_202609052145.mp4` and `C:\Users\every\Downloads\Woman_walking_in_hanbok-clip-1_202609052229.mp4`.

## Exact prompts

The following are quoted as exact prompts from the local work record or the user's message. The original ImageGen image-generation prompts were not found in the current local record and are intentionally not reconstructed.

### Baseline walk

```text
A single continuous 4-second full-body fashion editorial shot of this exact woman in this exact hanbok. She walks in place with a relaxed, regular natural walking cycle throughout, alternating foot contacts and gentle arm swing. Keep her centered at the same screen position and the same apparent body size. Maintain the starting three-quarter body orientation. Locked-off camera, no pan, zoom or dolly. Infinite white studio background with a soft natural contact shadow. Preserve her face, hair, body proportions and outfit. No cards, no text, no transitions, no wardrobe change, no freeze or pause.
```

Result: user retry succeeded. Source: [probe README](../../../motiongraphic/production/ticket-travel/motion-edit-probe/README.md). Downloaded `source-hanbok.mp4`; SHA-256 `C99CE2FDD62DFDF77C16CB6AD56A4233BC472718D51DE6A2FE46B08C443151B5`.

### First clothing-only edit

```text
Change only the woman’s clothing throughout this source video to the pale pink floral kimono and obi shown in the supplied reference image. Preserve the source video’s exact walking motion, alternating foot-contact timing, arm motion, body proportions, face, short hair, screen position and apparent size. Keep the original white studio background, camera and lighting unchanged. Use the reference only for the kimono fabric and garment design; do not add its boarding pass, text, border, umbrella or hairstyle. Keep the original handheld item and its motion. The kimono is already worn from the first frame to the last: no transformation, no transition and no cut. Keep everything else the same.
```

Result: user retry succeeded; strict frame-level gait match was not yet certified. Source: [probe README](../../../motiongraphic/production/ticket-travel/motion-edit-probe/README.md).

### Revised gait-focused edit

```text
Edit this source video so the woman wears the pale pink floral kimono and obi from the reference image throughout the entire clip.

Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed, and direction. Do not restart, slow down, pause, or replace the walk with smaller kimono-style steps. Let the kimono fabric accommodate the existing leg movement.

Keep her face, short hair, body proportions, screen position, and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting.

Her arms and hands may move naturally to suit the kimono; matching their original motion is not essential.

Use the reference image only for the kimono and obi design. Do not add its boarding pass, text, border, or umbrella.

She wears the kimono from the first frame to the last. No wardrobe transformation, transition, or cut.
```

Result: the user observed that the walking looked identical. The accepted criterion was walking continuity, not exact hand/arm/prop identity. Source: user's message, 2026-09-05.

## Local transition probe

The 4-second `synced-transition-v1.mp4` was made by keeping the two time-aligned Flow walking clips and adding a local deterministic card/occlusion treatment. It was not a new Flow generation, retime, or optical-flow pass. At about 1.5–2.0 seconds (about 12 frames at 24fps), the card rises from below with ease-out; the card surface crosses the subject and complementary masks reveal the new clothing. The person stays approximately fixed in screen position and scale.

The user judged this limited 4-second method as “합격선”. That is not approval of a 13-second final, nor proof that every edge, barcode, floor shadow, or destination variant is clean. Current SHA-256: `59DA8FA6B0B29AAC5DFA410C4DBB48B51AD9E7B7FD4C22CE826DA6726A9D596C`. The render recipe SHA-256 is `FD6F2C15AFD5A9D325CDB4610469EB22DF858BE0FF4288F94128CC9D583AA644`.

Observed limitations retained for follow-up: narrow matte and floor/barcode residuals can remain; the proof is visual spot-check rather than exact joint/heel-toe certification; the probe is not a production cut. Source: [transition README](../../../motiongraphic/production/ticket-travel/synced-transition-v1/README.md), [motion-edit findings](../../../motiongraphic/production/ticket-travel/motion-edit-probe/findings.md), user review, 2026-09-05.

## Historical correction

### 이전 실험과 현재 방식의 차이

- Frame Director의 시작/끝 이미지 방식으로 만든 [v3 영상](../../../motiongraphic/production/ticket-travel/continuity-v3/flow-seoul-tokyo-4s-original.mp4)은 점진적 환복은 보였지만 전환의 두꺼운 파란 띠와 티켓 인쇄 변형이 문제였다. [v4 영상](../../../motiongraphic/production/ticket-travel/continuity-v3/flow-seoul-tokyo-v4.mp4)은 흰색/회색 경계 번짐이 남아 합격본으로 채택하지 않았다. Source: 현재 대화의 프레임 검수 기록, 2026-09-05. 두 결과를 현재 성공한 보행 편집본과 혼동하지 않는다.
- 새 프롬프트 비교본: [일반 속도](../../../motiongraphic/production/ticket-travel/motion-edit-probe/comparison-new-prompt.mp4), [0.5배속](../../../motiongraphic/production/ticket-travel/motion-edit-probe/comparison-new-prompt-slow.mp4). 왼쪽은 한복 원본, 오른쪽은 `2229` 새 결과이며 시작 시점만 맞췄고 보행을 시간 보정하지 않았다. Source: 현재 대화의 비교본 생성 기록, 2026-09-05.
- 전환 합성의 중간 오류는 카드 PNG의 흰 바깥 여백이 이전 인물의 머리를 지우는 것이었다. 카드 실루엣만 이동시키고, 카드 배경을 먼저 그린 뒤 경계 위/아래의 두 인물을 합성하여 수정했다. Source: [수정 기록과 코드](../../../motiongraphic/production/ticket-travel/synced-transition-v1/README.md).

### 재사용 가능한 Flow 조작 경로

관찰일 2026-09-05. [프로젝트](https://flow.google.com/project/a37f8501-9284-4599-bee5-bafd23699149), [보행/편집 기록 화면](https://flow.google.com/project/a37f8501-9284-4599-bee5-bafd23699149/edit/b96890f4-9f04-4f33-9def-54303814b5c0).

1. 기존 업로드 `01-seoul-hanbok.png`의 애니메이션 메뉴에서 9:16·720p·4초·1개 출력을 설정한다.
2. 완성된 **영상**을 열고 ‘이 동영상을 어떻게 수정할지’ 입력란에서 Omni 1.1 Flash 편집을 사용한다. 시작/끝 이미지 생성창으로 돌아가지 않는다.
3. 소재 추가에서 `K2-tokyo-kimono.png`를 첨부한다. 이 참조에는 카드와 우산이 있어 프롬프트가 이를 제외하도록 했다.
4. 기록 보기에서 원본과 편집 입력·결과를 구분한다. 정책 오류가 발생했던 시도와 사용자가 재시도해 성공한 결과를 별도로 기록한다. 오류 메시지만으로 기능 불가를 단정하지 않는다.
5. 다운로드는 프로젝트 갤러리의 해당 영상 타일 우클릭 → 다운로드 → **720p 원본 크기**로 성공했다. 장면 내보내기와 구분한다. 파일명만으로 의상을 판단하지 않는다(기모노 결과도 `Woman_walking_in_hanbok...` 이름으로 내려왔다).

위 절차는 당시 실제 화면 관찰 기록이지 모든 계정·향후 버전의 동일 UI를 보장하지 않는다. 공식 기능 설명: [Flow 영상 편집](https://support.google.com/flow/answer/16935718?hl=en), [커스텀 도구](https://support.google.com/flow/answer/17104535?hl=en). 현재 성공한 전환은 Flow 커스텀 도구 실행이 아니라 로컬 Python/FFmpeg 합성이다.

The earlier v0.1 synthesis treated “card and moving person together as one incoming precomp” as the observed implementation. That was an implementation hypothesis, not evidence of the original file. The successful current probe instead separates the canonical walk from the independently moving card and uses the card edge as the reveal boundary. Render order: card backgrounds first, then complementary old/new person masks. See the current [pipeline synthesis](../syntheses/taoagou-ticket-journey-flow-imagegen-pipeline-v0.1.md).

## Unresolved

- Exact ImageGen source prompts are unavailable in this local record.
- Flow Characters and other templates were researched but not validated as gait locks or temporal mattes.
- The native Omni edit path must be tested for each additional outfit from the same canonical walk.
- A 13-second four-destination provisional and its user review remain pending.
