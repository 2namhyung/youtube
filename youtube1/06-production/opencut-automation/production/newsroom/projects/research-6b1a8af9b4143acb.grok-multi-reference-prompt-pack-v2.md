# 경찰관 부친 휴대전화 사건 — Grok 다중 참조 프롬프트 팩 v2

Status: `provider-ready-private-only`; supersedes v1 single-first-frame/four-second-hold rules. The exact 13+51 reference bundle is production-approved for private Grok provider input only; no render/upload/publication/Stage 07 authority.

Asset completion: all 51 required `scene-*` IDs are present as independent normalized 1254x1254 RGBA PNGs under `out/prototypes/research-6b1a8af9b4143acb-v32-grok-reference-assets-v1/final`. The creator manifest and independent verifier in that root bind this prompt pack and all exact PNG bytes; the contact-sheet SHA-256 is `f5ea9e9ea7dc4eb5ec1a0a90eb4ebc2eee047a63eea5489af414a56fdd3a30bc`. The user approved that sheet and the common-master review board on 2026-08-14. Append-only successor `research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1` binds 64 read-only files with admission manifest SHA-256 `a817b0ecc96aeb67322b0665a0772746680cb3519bb5878d20504100fc48b54b` and bundle digest `8f54090b3801ec5f38878ed696d6a43459494a84698c9b51afddd2c02dc5c1bc`.

## 공통 규칙

- 컷마다 아래 2~7개 이미지를 Grok에 함께 올린다. v32 인물·배경·전화·문서 마스터는 사람 승인된 successor bytes만 쓴다.
- `scene-*` 정보요소는 각각 독립 1:1 ImageGen PNG로 만든다: flat matte fibrous torn-paper, beige/dark-green/navy/burgundy, no text/logo/face/shadow/3D, uniform `#ff00ff` extraction background.
- 프롬프트 순서: 업로드 역할 → 배치 → 한 가지 상태 변화 → reveal 순서/동선 → 이펙트 → 카메라 → 종이 재질 → 금지 사항. 제목·자막·날짜·법률 문구는 생성하지 않는다.
- Grok 6초 결과에서 의미가 가장 정확한 연속 구간을 고르고 `selectedInSeconds`, `selectedOutSeconds`, 선택 이유를 QA에 기록한다. 0초 시작, 4초 종료, 6초 정지를 강제하지 않는다.
- 공통 lock: `Premium flat 2D editorial paper-cut collage, matte fibrous paper, visible torn edges, restrained beige, dark green, navy and burgundy, believable paper weight, square composition, blank unprinted faces, no readable text, no logo, no new person or prop, no photorealism, no glossy 3D, no morphing, no reversal, no loop.`

## 컷별 업로드 팩과 모션

| 컷 | 업로드 팩 | Grok 구현과 선택 구간 |
|---|---|---|
| 01 | teacher, records-office, phone, `scene-complaint-document`, `scene-marker-strip` | `document-marker-scan`: 문서가 전화 쪽으로 이동하고 marker가 위→아래 한 번 sweep. 문서 이동 직전~sweep 종료 직후 선택. |
| 02 | father, phone, `scene-paper-divider`, `scene-state-endpoint` | `before-after-divider-wipe`: 부친의 손은 떨어진 채 divider가 intact를 가리고 changed state를 reveal. 두 상태가 함께 읽히는 wipe 구간 선택. |
| 03 | `scene-jeonju-map-field`, `scene-anonymous-station-block`, `scene-route-strip`, `scene-endpoint-marker` | `map-route-draw`: wide map→station pan, route unroll, endpoint pulse. route 시작~settle 선택. |
| 04 | son, teacher, classroom, phone | 아들이 전화 각도를 한 번 바꾸고 교사가 알아차려 돌아서 한 걸음 물러난다. 전화 변화 직전~회피 완료 선택. |
| 05 | father, records-office, phone, `scene-internal-post-card`, marker | 짧은 typing→blank card unfold→marker scan→phone state comparison. 마지막 typing~비교 정착 선택. |
| 06 | `scene-police-folder-stack`, `scene-prosecution-folder-stack`, `scene-case-folder`, `scene-transfer-channel` | `vertical-investigation-flow`: folder가 channel을 따라 한 번 이동. 이륙 직전~도착 settle 선택. |
| 07 | `scene-timeline-rail`, `scene-first-event-node`, `scene-late-discovery-node`, `scene-empty-gap-fold` | `beat-timeline-rows`: 긴 빈 interval 뒤 late node reveal. 첫 node~late pulse 선택. |
| 08 | investigator, `scene-report-panel`, `scene-reform-panel`, `scene-audit-panel`, `scene-family-folder-group` | `stacked-panel-directional-wipe`: 폴더 배치에 맞춰 report→reform→audit 순차 wipe. 첫 배치~세 번째 settle 선택. |
| 09 | investigator, `scene-audit-grid`, `scene-anonymous-folders`, `scene-selected-folder`, `scene-cell-highlight` | `audit-grid-population`: grid wave 뒤 recessed folder를 중앙으로 꺼낸다. wave 후~folder settle 선택. |
| 10 | father, `scene-confirmed-report-card`, `scene-response-card`, `scene-qualifier-divider` | response card가 앞 카드 뒤에서 별도 우측 위치로 나온다. 발화·표정 금지. 분리 시작~qualifier 공간 확보 선택. |
| 11 | father, phone, `scene-duty-emblem`, `scene-straight-duty-track`, `scene-diverging-family-track`, divider | duty track은 직선, family track만 갈라지고 divider lock. 부친은 전화에 손대지 않는다. 분기 시작~lock 선택. |
| 12 | male-colleague, female-colleague, teacher, `scene-institution-card`, `scene-relationship-connectors` | `constellation-network-build`: 인물 정착 뒤 기관에서 connector가 순서대로 draw. 대화·지목 금지. 배치 완료 직전~teacher 연결 완성 선택. |
| 13 | father, `scene-case-card`, `scene-booking-status-tab`, `scene-card-notch` | card unfold 뒤 status tab이 notch에 lock. 체포·수갑·유죄 암시 금지. unfold~lock 선택. |
| 14 | investigator, male-colleague, home, `scene-approach-route`, `scene-threshold-marker` | 두 인물이 짧은 route를 따라 닫힌 문 앞에서 멈춘다. 문 개방·압수품 금지. 접근 시작~threshold 정지 선택. |
| 15 | investigator, `scene-relationship-board`, `scene-allegation-node`, `scene-verification-node`, `scene-open-final-node`, connector | `vertical-investigation-flow`: card 삽입, allegation→verification draw, final node는 열린 채 pulse. 삽입~open pulse 선택. |
| 16 | father, son, `scene-family-token`, `scene-punishment-track`, `scene-legal-barrier` | `legal-track-barrier`: token이 이동하다 barrier에 막히고 paper flex 후 lock. 이동 시작~lock 선택. |
| 17 | `scene-investigation-track`, `scene-punishment-track`, `scene-track-markers`, `scene-gap-divider`, `scene-gap-mask` | 두 marker 동시 출발, upper는 끝까지, lower는 reveal된 gap에서 정지. 동시 출발~서로 다른 endpoint 완성 선택. |
| 18 | civilian-male, civilian-female, `scene-institution-silhouette`, phone, `scene-case-folder`, `scene-return-rails` | `return-rail`: 시민은 전경으로 한 걸음, phone/folder는 rails를 따라 오다 unresolved gap 앞 정지, 2% pullback. 진입~negative space 완성 선택. |

## 정보요소 ImageGen 생성 순서

1. 선형 요소: marker strip, paper divider, route strip, endpoint marker, relationship connectors.
2. 문서/상태: complaint, internal-post, case, report, response cards; booking tab; phone endpoint.
3. 공간/흐름: map/station, folder stacks/channel, timeline nodes/gap, audit grid/folders.
4. 법률/결말: duty/family tracks, family token, legal barrier, gap mask, institution silhouette, return rails.
5. 각 파일은 v32 style/master authority, prompt, exact bytes/hash, alpha/chroma QA를 기록한 뒤 Grok 업로드 팩에 들어간다.

## QA와 FFmpeg

- required state change가 온전히 보이는 시작/끝 프레임을 찾는다. 컷 슬롯은 2~4초이며 기본 1배속이다. 좋은 동작이 6초 후반에 있어도 사용할 수 있다.
- 동일성, 정보 순서, 동선 방향, 관계 endpoint, 금지 객체, 의미 반전, 생성 글자를 검사한다. 실패를 trim으로 숨기지 말고 재생성한다.
- 합격 clip만 FFmpeg가 trim, 972x972 fit, 색/노이즈 보정, 제목·자막·승인 내레이션 mux를 수행한다.
