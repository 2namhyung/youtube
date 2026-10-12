# 경찰 아버지 휴대전화 사건 — 주 제작 에이전트 정밀 컷 설계 v2

상태: `design-review-ready`, private only. 이 문서는 creator/verifier가 봉인한 `video-design-v1`이 아니며 provider·렌더·업로드 권한이 없다.

## 잠긴 입력

- 제목: `경찰 아버지가` / `부순 휴대전화`
- 대본 SHA-256: `47f7caa49138267382ce23ec2c360359e1448434671abb1835f314f52de7f8ae`
- 내레이션: `owner-voice-v1`, 55.016초, 7 cues, audio SHA-256 `d57593fd6d5437caac96148b8ba8e963ebc164f3e8db2cdb99fe4edab88a6ac6`
- 시각 권위: `paper-cut-keyframe-v1`, SHA-256 `fa7b2d40e2fb1e2ee1beac48bbcc9df0d71d00e076f1b564393aeb821de624ec`
- 법률: 출처 접두 문구는 요구하지 않는다. 익명, 얼굴/소속 식별 금지, 재구성 고지, 원본 방송 화면 사용 금지, 확인 중/경찰 설명상 표현은 유지한다.

## 구현 분배와 판정 기준

**결론: 비인물 deterministic layered paper-cut/FFmpeg 모션그래픽 17컷, Grok 애니메이션 1컷.** Grok과 모션그래픽의 수를 인위적으로 맞추지 않는다. 사람의 움직임이 필요한 컷은 Grok으로 보내고, MG는 문서·지도·관계선·타임라인·비교·법률 구조와 관절 없는 레이어/카메라 전환으로 제한한다. 컷 04의 은밀한 휴대전화 시도는 학생의 팔·손·휴대전화와 책상 가림의 연속 관계가 의미의 핵심이라 Grok 예외가 실제로 적용된다. 휴대전화 파손은 방법·도구·시점을 확인할 수 없으므로 행동을 생성하지 않고 상태 변화만 비교한다. 56초/1,344프레임 설계 영역에 55.016초 내레이션을 놓고 마지막 약 0.984초는 질문 장면 hold로 사용한다.

| 컷 | 정확 대본 바인딩 | 화면의 단일 주장·행동 | 모드와 판단 | 역할 / 그래픽 | 라이브러리 패턴 / 주 동작 |
|---|---|---|---|---|---|
| 01 | span-001 0..22 | 불법 촬영 시도 적발 뒤 고소가 시작됨 | MG — 고소 표식과 휴대전화 토큰 reveal이면 충분 | `breach_state` / `evidence-comparison` | `document-marker-scan` / `marker-scan` |
| 02 | span-001 22..59 | 핵심 휴대전화가 경찰 아버지에 의해 없어짐 | MG — 존재→부재 상태와 역할만 연결; 제거 방법은 생성 금지 | `evidence_record` / `evidence-comparison` | `before-after-divider-wipe` / `state-swap` |
| 03 | span-002 0..22 | 전주·익명 파출소·A 경감의 공간 맥락 | MG — 도시→익명 파출소 위치 이동; 정확 근무지는 숨김 | `spatial_context` / `spatial-search-map` | `map-route-draw` / `endpoint-pulse` |
| 04 | span-002 22..57 | 고교생 아들·성인 여교사·휴대전화 시도와 적발 | Grok — 학생 팔·손·휴대전화가 책상에 가려지는 연속 동작을 정적 관계 토큰으로 바꾸면 은밀한 시도의 의미가 손실됨; 구체 촬영 각도·신체 접촉은 추가 금지 | `breach_state` / `n/a` | `grok-i2v-1x1-480x480-6s-v1` / articulated reach-and-occlusion |
| 05 | span-002 57..79 | 아버지가 내부망에 휴대전화를 부쉈다고 기록 | MG — 내부 글 카드와 정상·파손 토큰 reveal; 파손 순간·도구 금지 | `evidence_record` / `document-highlight` | `document-marker-scan` / `document-reveal` |
| 06 | span-003 0..21 | 아들이 검찰로 넘겨짐 | MG — 사건철의 추상 절차 이동으로 충분 | `investigation_progress` / `investigation-flow` | `vertical-investigation-flow` / `step-reveal` |
| 07 | span-004 0..29 | A 경감 행동이 즉시 발견되지 않음 | MG — 비어 있는 시간 구간을 강조 | `discovery_timeline` / `timeline-gap` | `beat-timeline-rows` / `beat-pulse` |
| 08 | span-004 29..55 | 경찰 가족 연루 사건 전수조사 | MG — 폴더 셀을 순차 채워 조사 범위를 표현 | `discovery_timeline` / `audit-grid` | `audit-grid-population` / `grid-populate` |
| 09 | span-004 55..66 | 전수조사에서 뒤늦게 확인 | MG — 마지막 확인 패널만 뒤늦게 활성화 | `discovery_timeline` / `audit-grid` | `stacked-panel-directional-wipe` / `directional-wipe` |
| 10 | span-005 0..20 | 경찰관에게 증거 보전 의무가 있음 | MG — 증거 보전 기준 문서를 기준 상태로 제시 | `ordinary_baseline` / `document-highlight` | `document-marker-scan` / `marker-scan` |
| 11 | span-005 20..39 | 가족 사건의 증거가 없어짐 | MG — 보전 의무→부재의 대비; 보관 장소는 만들지 않음 | `breach_state` / `evidence-comparison` | `before-after-divider-wipe` / `state-swap` |
| 12 | span-006 0..34 | 동료 비판과 성인 피해 교사의 위치 | MG — 정확 근거 범위의 비판 패널과 `성인 피해 교사` 역할 라벨; 사람 형상·직접 인용문 금지 | `victim_aftermath` / `evidence-comparison` | `stacked-panel-directional-wipe` / `panel-stack` |
| 13 | span-007 0..26 | A 경감이 증거 인멸 혐의로 입건 | MG — 입건 기록과 상태 reveal; 소지품은 만들지 않음 | `evidence_record` / `document-highlight` | `document-marker-scan` / `document-reveal` |
| 14 | span-007 26..43 | 보도 시점 기준 지난주 자택 압수수색 | MG — 익명 자택과 수색 기록의 추상 경로; 수납장·압수품 금지 | `investigation_progress` / `spatial-search-map` | `map-route-draw` / `route-draw` |
| 15 | span-008 0..20 | 수사 개입 의혹을 확인 중 | MG — 의혹 노드에서 열린 조사 단계로 추적 | `investigation_progress` / `investigation-flow` | `vertical-investigation-flow` / `vertical-trace` |
| 16 | span-009 0..44 | 경찰 설명상 직계혈족 처벌특례 장벽 | MG — 직계혈족 관계 라벨과 법률 장벽의 비인물 비교; `경찰 설명상` 고정 | `legal_comparison` / `legal-barrier` | `legal-track-barrier` / `barrier-lock` |
| 17 | span-010 0..32 | 입건·수사 가능과 실제 처벌 사이 간극 | MG — 두 트랙의 차이를 divider로 비교 | `legal_comparison` / `track-gap` | `before-after-divider-wipe` / `divider-wipe` |
| 18 | span-011 0..51 | 가족 증거 훼손 뒤 경찰 수사에 대한 신뢰 질문 | MG — 제도·증거 레일을 시민 시점으로 되돌리고 미해결 hold | `return_test` / `track-gap` | `return-rail` / `rail-return` |

### 컷별 실제 엔진·레이어·beat

`F`는 선택 엔진/의존성/해시/프레임 검증이 하나라도 없으면 다른 엔진이나 정지 카드로 바꾸지 않고 실패한다는 뜻이다. 모든 MG 행은 bundle `newsroom-deterministic-motion-engines-v1` creator SHA-256 `63b989bab30c0ee07634a8cd0b32ae7d0615d59b32c5415efae6b9831089fe18`, adapter SHA-256 `ed1f1820ecd1c061c97e4e434b18527ffa9464de45c24d232738aa5bfbd4b59c`, 선택 엔진별 authority ID와 renderer contract를 바인딩한다.

| 컷 | 실제 엔진 | 핵심 레이어 | key beats | fallback |
|---|---|---|---|---|
| 01 | `gsap-html-v1` | 고소 문서·휴대전화·SVG 마커 | document enter → marker scan → hold | F |
| 02 | `ffmpeg-layer-keyframes-v1` | 정상/부재 전화·divider·역할 라벨 | before enter → divider wipe → absence hold | F |
| 03 | `canvas-d3-v1` | 전주 지도·익명 파출소 끝점·SVG 경로 | map enter → route draw → endpoint pulse | F |
| 04 | `grok-i2v-1x1-480x480-6s-v1` | 승인 캐릭터 초기 프레임·학생 팔/손·전화·책상 가림 | reach/occlude by 4s → hold; 별도 semantic QA | provider/QA 미승인 시 컷 봉인 실패 |
| 05 | `lottie-web-v1` | 내부 글 카드·정상/파손 전화 토큰 | card reveal → state pair emphasize → hold | F |
| 06 | `motion-canvas-v1` | 사건철·절차 spine·검찰 끝점 | file enter → step reveal → endpoint hold | F |
| 07 | `dotlottie-web-v1` | 시간축·빈 지연 구간·마커 | rows enter → gap pulse → hold | F |
| 08 | `canvas-d3-v1` | 전수조사 CSS grid·폴더 셀·범위 라벨 | grid enter → cells populate → scope hold | F |
| 09 | `edge-html-svg-capture-v1` | 조사 HTML 패널·마지막 확인 셀 | panels enter → directional wipe → late cell hold | F |
| 10 | `gsap-html-v1` | 증거 보전 기준 문서·SVG 마커 | document enter → marker scan → duty hold | F |
| 11 | `ffmpeg-layer-keyframes-v1` | 보전/부재 상태·divider | before enter → state swap → absence hold | F |
| 12 | `motion-canvas-v1` | 비판 패널·성인 피해 교사 역할 라벨 | panels stack → label emphasize → hold | F |
| 13 | `lottie-web-v1` | 입건 기록·혐의 상태 SVG 마커 | record enter → document reveal → status hold | F |
| 14 | `canvas-d3-v1` | 익명 자택 지도·수색 기록·SVG 경로 | map enter → route draw → record endpoint | F |
| 15 | `motion-canvas-v1` | 의혹 노드·조사 spine·열린 종단 | node enter → vertical trace → open-end hold | F |
| 16 | `dotlottie-web-v1` | 수사/처벌 SVG track·법률 장벽·경찰 설명상 라벨 | tracks enter → barrier lock → qualified hold | F |
| 17 | `ffmpeg-layer-keyframes-v1` | 입건/수사·처벌 SVG track·gap divider | tracks enter → divider wipe → gap hold | F |
| 18 | `edge-html-svg-capture-v1` | 제도·증거 SVG rail·시민 시점 끝점 | origin enter → rail return → unresolved hold | F |

배정은 검증된 authored adapter만 사용한다. GSAP은 문서/패널 timing, Canvas/D3는 지도·grid·관계 geometry, Motion Canvas는 절차 signal flow, Lottie-web/dotLottie-web은 authored 비인물 state/timeline, Edge HTML/SVG는 rail/panel, FFmpeg keyframes는 정밀 comparison을 담당한다. 다운로드한 예제·fixture·catalog template은 실행하지 않으며 모든 최종 encode/mux/QC는 FFmpeg가 담당한다.

## Grok 예외 검토

컷 04만 `GROK_EXCEPTION_RE`를 실제로 만족한다. 학생의 팔·손·휴대전화가 책상에 의해 연속 가려지는 변화가 은밀한 시도의 의미를 전달하므로, 이를 독립 요소의 위치 이동으로 바꾸면 관절 변형과 가림 관계가 손실된다. 다른 17컷은 사람을 움직이지 않는 문서·지도·관계선·타임라인·비교·법률 구조로 설계한다. 컷 04에는 아래 공통 suffix를 사용한다:

`Complete the single action by second 4, then hold. Preserve the exact supplied blank-faced fibrous matte paper-cut characters, clothing, props, object state and square composition. Restrained 2D movement. No new people, facial features, readable text, logos, rank insignia, object morphing, extra limbs, camera orbit, scene change or invented breaking method.`

컷 02·05·11은 상태 전환과 문서 reveal만 키프레임으로 표현하고 파손 방식·도구·순간을 생성하지 않는다. 컷 04 Grok은 증거가 뒷받침하는 `휴대전화 촬영 시도`와 적발 관계까지만 표현하며 구체 촬영 각도·접촉·교실 배치는 만들지 않는다. 컷 14는 수납장·압수품을, 컷 18은 교사와 조사관의 물리적 인계를 만들지 않는다. 나머지 17컷은 Grok에 보내지 않는다.

## 조사·레퍼런스 매핑

- `evidence-motion-v2`는 타임라인, 세로 절차 흐름, 지도 경로, 문서 마커, 전후 비교, 방향 와이프의 동작 문법을 참고한다. 로컬 HTML과 샘플은 `source-only`이므로 그대로 실행하거나 사실·스타일 권위로 사용하지 않고, 활성 v29 패턴 ID와 provenance ID만 설계에 바인딩한다.
- `wsj-hormuz-motion-study-v1`은 지도 경로 reveal, 적층 패널 와이프, return-test의 중립적 움직임만 학습 자료로 참고한다. 브랜드, 영상, 문구, 사건 사실은 가져오지 않는다.
- 17개 MG 컷의 순서는 컷 04 Grok을 제외하고 인접 패턴·주 동작이 다르며, MG-only rolling 3-cut 범위에서도 같은 패턴/주 동작 조합을 반복하지 않는다. 전역 유일성이나 최대 컷 수 제한은 적용하지 않는다.
- `constellation-network-build`는 이번 설계에서 사용하지 않는다. 확인된 핵심은 복잡한 관계망이 아니라 행위·증거·절차·법률 간극이므로 관계망을 억지로 추가하지 않는다.

## 모션그래픽 요소 팩

각 MG 컷은 완성 화면이 아니라 아래 요소를 각각 ImageGen으로 만든다. 모두 1:1 작업 캔버스, `#ff00ff` 균일 배경 또는 검증된 alpha, 종이 질감, 개별 z-index를 사용한다.

- 01–03·05 MG: 휴대전화 상태쌍, 익명 역할 라벨, 고소·내부 글 카드, 익명 파출소·전주 위치판. 사람 형상, 증거 봉투, 파손 동작은 생성하지 않는다. 컷 04만 승인된 공통 캐릭터 마스터를 초기 프레임에 사용하고 별도 Grok/semantic-QA 권위를 요구한다.
- 06–09: 사건철, 검찰 절차 끝점, 시간선, 빈 지연 구간, 전수조사 폴더 셀, 뒤늦은 확인 패널.
- 10–12: 증거 보전 기준 문서, 휴대전화 부재 상태, 동료 비판 패널, `성인 피해 교사` 역할 라벨. 사람 형상·실제 보관함·직접 인용문은 생성하지 않는다.
- 13–15: 입건 기록, 익명 자택·수색 기록, 수사 개입 의혹 노드, 확인 중 열린 종단. 소지품·수납장·압수품은 생성하지 않는다.
- 16–18: 직계혈족 관계 라벨, 수사·처벌 트랙, 특례 장벽, `경찰 설명상` 라벨, 간극 표식, 시민 시점·신뢰 레일과 미해결 종단. 사람 형상은 생성하지 않는다.

요소는 enter → emphasize → hold → exit 순으로 조립하고 로컬 y=846..972에는 핵심 라벨과 관계선을 놓지 않는다. ImageGen 글자의 자간만 벌어져도 정확히 읽히면 human override를 기록할 수 있지만, 글자 누락·대체·추가로 의미가 달라지면 재생성한다.

## 공통 마스터 상태

후보 보드와 분리 PNG는 `out/prototypes/research-6b1a8af9b4143acb-v30-paper-master-candidates`에 있다. 캐릭터 4종, 환경 3종, 휴대전화 상태쌍, 증거팩을 컷별 생성 전에 사용한다. 현재는 private candidate이며 production/public 승격 전 사람의 최종 시각 승인이 필요하다. 경찰 아버지 어깨의 계급장처럼 보일 수 있는 작은 표식은 제거하거나 컷 프롬프트에서 금지한다. `character-master-board-alpha-v1.png`의 검은 영역은 투명 배경이 앱에서 검게 보이는 것이며 실제 opaque 검정 배경이 아니다.

## 고정 레이아웃

- 캔버스 1080x1920, 24fps.
- 제목 `경찰 아버지가` / `부순 휴대전화`: x=540, y=201/326, 120/143px, 920px safe width.
- 영상·모션그래픽: x=54, y=474, 972x972. 좌우 54px 검은 여백.
- 자막: x=540, y=1400, 88px, 최대 2줄, 920px safe width.
- 제목·자막·재구성 고지는 ImageGen이 아니라 기존 deterministic text track이 렌더한다.
