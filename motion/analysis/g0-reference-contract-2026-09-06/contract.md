# G0 레퍼런스·모션 계약 — 항공권 여행 카드

상태: **AWAITING_USER_REVIEW** (G0 PASS 아님)

작성일: 2026-09-06

이 문서는 원본 영상에서 관찰 가능한 화면 문법만 잠그는 G0 산출물이다. 원본의 제작 도구, 레이어 구조, 마스크, 숨은 키프레임을 복원했다고 주장하지 않는다. G0 검토가 끝나기 전에는 ImageGen 자산을 늘리거나 13초 Flow 생성을 확장하지 않는다.

## 1. 대상과 시간축

잠근 원본은 [ticket_travel_7648553013002489109.mp4](../../references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4)이다.

| 항목 | 값 |
|---|---|
| 해상도 | 1080×2160 |
| 영상 | 400 frames, 30 fps, 13.333333 s |
| SHA-256 | `bd60b90c27e588a57c506621f390294a25ca34bd01adbfc3aeb183ccbdac0cdc` |
| 분석 범위 | 오프닝부터 네 번의 카드 진입·정착과 각 도시 인물의 후속 보행 |

원본에서 관찰한 카드 진입은 대략 F130, F198, F262, F330 부근(각각 4.333, 6.600, 8.733, 11.000초)이다. 이는 우리 영상의 시간표가 아니다. 우리 adaptation의 권위는 별도 [사용자 브리프](../../../23jung/wiki/sources/taoagou-ticket-journey-user-brief-2026-09-05.md)의 0–2초 여권, 2–3.5초 걸어 나가기, 3.5초 이후 Seoul/Tokyo/Shanghai/Hanoi 구조다. 원본의 도시명·의상·절대 시각을 그대로 복사하지 않고, 아래의 전환·연기 문법만 차용한다.

## 2. 프레임 증거

전체 네 전환을 같은 방식으로 확인할 수 있도록 다음 파생물을 만들었다.

- [네 전환 앵커 4행 요약](all-four-transition-anchors.jpg): 각 행은 선택된 진입·빠른 겹침·새 인물 공개 표본이다. 첫 열이 반드시 진입 이전이거나 마지막 열이 최종 정착 프레임인 것은 아니며, 전후 확인은 전환별 sheet와 발췌 영상을 함께 사용한다.
- [Bangkok 진입 dense sheet](entry-bangkok.jpg)
- [Bangkok→Seoul dense sheet](bangkok-seoul.jpg)
- [Seoul→Dali dense sheet](seoul-dali.jpg)
- [Dali→Tokyo dense sheet](dali-tokyo.jpg)
- [원본 네 전환 정상속도 발췌](four-transitions-source-normal.mp4)
- [원본 네 전환 0.5배속 발췌](four-transitions-source-half-speed.mp4)
- [프레임·시각·원본 hash metadata](source-metadata.json)

정상속도 발췌는 원본에서 trim/scale/라벨을 적용한 source-only 증거다. 0.5배속은 검토를 위해 재생 시간을 늘린 자료이며, 인물·카드의 상대 타이밍을 수정하지 않았다. 두 자료 모두 인물·카드 합성, optical-flow 보간, 생성 프레임을 넣지 않았다. 서로 다른 발췌 사이의 연결 컷은 분석용 편집이며 원본 전환이 아니다.

## 3. 네 전환의 검토 앵커

프레임 번호는 0부터 세며 `time = frame / 30`. “첫 가시 edge”는 화면에 보이는 카드/그림자/기울어진 모서리의 관찰 앵커이지, 원래 애니메이션의 첫 키프레임이 아니다. `settled-looking`은 카드의 큰 이동이 끝나고 카드 표면과 인물이 읽히기 시작한 구간이며, 내부 미세 움직임의 완전한 정지를 뜻하지 않는다.

| 전환 | 이전 상태 참조(진입과 겹칠 수 있음) | 첫 가시 진입 후보 | 빠른 겹침·가림 | 새 인물 공개 | 정착 looking | 확신·한계 |
|---|---|---|---|---|---|---|
| 오프닝→Bangkok | F126 / 4.200s | F127–130 / 4.233–4.333s | F134 / 4.467s: 이전 여행자 상체와 새 카드·하체가 동시에 보임 | F135 / 4.500s 부근부터 새 모자·얼굴이 읽힘 | F144–150 / 4.800–5.000s | pre/겹침/공개는 높음. F127은 모서리의 약한 가시성, 왼쪽 ROI 검출은 F130이므로 true onset은 불확실 |
| Bangkok→Seoul | F196 / 6.533s | F196–198 / 6.533–6.600s의 하단 sliver | F200–201 / 6.667–6.700s: 이전 카드·상체와 Seoul 카드·하체가 겹침 | F201–203 / 6.700–6.767s | F203–206 / 6.767–6.867s | 화면 앵커 확신 중상. 실제 layer/matte 경계와 정확한 onset은 MP4만으로 분리 불가 |
| Seoul→Dali | F260 / 8.667s | F260–262 / 8.667–8.733s의 하단 sliver | F266 / 8.867s: Seoul 상태와 새 카드·부츠/하체의 동시 노출 | F267–270 / 8.900–9.000s | F270–278 / 9.000–9.267s | 화면 앵커 확신 중상. F260은 전 상태 끝과 새 edge가 가까워 첫 움직임 시점은 불확실 |
| Dali→Tokyo | F328 / 10.933s | F328–330 / 10.933–11.000s의 하단 sliver | F333–334 / 11.100–11.133s: 이전 카드·상체와 Tokyo 카드·하체가 겹침 | F334–336 / 11.133–11.200s | F336–346 / 11.200–11.533s | 화면 앵커 확신 중상. F328의 작은 blue edge가 실제 첫 운동인지 압축/그림자와 분리해 확정할 수 없음 |

첫 전환의 별도 측정은 왼쪽 인물 없는 ROI에서 F130–F144의 operational edge를 잡아 약 0.467초의 **관측 이동 구간**을 얻었다. 이 값은 다른 세 전환의 전체 지속시간이나 원래 easing curve로 일반화하지 않는다. F133→F135에 큰 이동이 집중된다는 이전 측정도 첫 전환의 edge proxy에 한정한다. 전체 이동 시작을 재려면 각 전환의 첫 visible corner/edge를 별도 프레임 주석해야 한다.

## 4. 관찰 사실과 구현 후보

아래 표는 [모션그래픽 분석법](../../../23jung/wiki/syntheses/motion-graphics-analysis-method-v0.1.md)의 `observed_fact → candidate_operator → alternative → confidence → uncertainty → forbidden_substitute` 형식을 따른다. 대안과 금지 항목은 Flow의 실제 기능 보장을 의미하지 않는다.

| observed_fact | candidate_operator | alternative | confidence | uncertainty | forbidden_substitute |
|---|---|---|---|---|---|
| 카드가 화면 하단에서 비스듬한 모서리·그림자와 함께 상승하고, 중간에 큰 화면 이동이 집중된 뒤 정착한다 | 독립 카드의 `bottom-up translation + tilt settle + short motion blur`, 시간축은 먼저 state-in/action/state-out으로 시험 | 카드 transform을 결정론적으로 합성하고 인물 reveal을 별도 레이어로 관리 | 높음(화면 변화), 중간(원래 구현) | 정확한 easing·회전각·blur 양·원본 keyframe은 미측정 | 전체를 등속 슬라이드, 큰 spring bounce, 원인 없는 overshoot |
| 네 전환 모두 새 카드가 이전 상태의 일부를 덮으며, 이전 상체와 새 카드/하체가 동시에 읽히는 구간이 있다 | 카드 전경과 인물 reveal의 z-order/경계를 분리하고, 전환 중에도 보행을 유지 | 가림을 단순 세로 wipe로 제한하되 실제 edge 위치를 맞춘다 | 높음 | 카드가 실제로 종이 전경인지 평면 합성인지, person matte가 별도인지 알 수 없음 | 사람+카드 전체 bitmap을 하나로 묶어 함께 위로 운반하거나, blank full-cover 뒤 hard cut으로 대체 |
| F134/F200/F266/F333 부근에서 old upper body와 incoming lower body가 공존한다 | 관찰된 부분 가림 관계를 기준으로 상체/하체 reveal을 시간상 겹치게 설계 | 짧은 2–4프레임 occlusion window 안에 의상 교체를 넣고 전후 보행 phase를 확인 | 높음 | 모든 픽셀이 같은 인물 layer인지, 새 인물의 머리가 언제 생성됐는지는 불명 | “카드가 전신을 완전히 가린 뒤 새 인물이 컷으로 등장”을 기본 계약으로 고정 |
| 카드 표면의 목적지·바코드·세로 색 띠·그림자는 카드 정착 후 안정적으로 읽히고, 하단에는 이전 카드/백킹 sliver가 잠시 남을 수 있다 | 카드 표면 asset과 shadow/backing을 분리한 고정 geometry, z-index stack | 단일 flat ticket plate에 동일한 slanted mask를 적용 | 높음(표면), 중간(레이어 분리) | 원본의 텍스트가 생성인지 후반 조판인지, 실제 card stack 깊이는 불명 | 생성 영상의 텍스트·바코드 정확성을 검수 없이 보장하거나, 매 전환마다 카드 폭/기준선을 바꾸기 |
| 새 목적지 상태에서도 인물의 상체 행동·시선·소품 관계가 도시마다 다르며 걷기는 계속된다 | 공통 보행 궤적 위에 목적지별 `attention target → action → reaction`을 얹는다 | 같은 보행 source의 clothing-only edit 후 독립 소품/시선 행동을 검수 | 높음(서로 다른 화면 행동), 중간(생성 재현) | 발 접지의 exact phase와 원본 촬영/합성 여부는 영상만으로 확정 불가 | 모든 도시를 같은 미소·팔 흔들기·정지 포즈로 만들거나, 상체까지 픽셀 고정 |
| 인물은 오프닝 이후 도시 구간에서 평균 화면 위치·크기를 유지하는 듯 보이지만, 발·골반·팔은 프레임마다 달라진다 | 고정 카메라와 identity/outfit anchor, person bbox가 아닌 head-to-ankle/hip center의 평균 track 검수 | Flow 단독 생성 후 same-phase frame 비교, 실패 시 별도 보행 source를 사용한 실험으로 분리 | 중간 | 원본 인물의 실제 screen-space track과 촬영 원본은 정량 추적하지 않음 | “같은 프롬프트”만으로 위치·크기·보폭 일관성이 보장된다고 주장 |

## 5. G0에서 빌릴 것과 제외할 것

### 차용할 grammar allowlist

- 순백의 넓은 스튜디오 여백과 고정 카메라 인상.
- 세로형 항공권 카드가 아래에서 위로 진입하고 비스듬한 leading edge가 수직에 가까워지며 정착하는 구조.
- 카드 이동 중 old upper/new lower가 잠시 공존하는 실제 가림 관계.
- 카드 표면의 고정된 정보 구조, 컬러 edge stripe, 바코드, 회색 backing/shadow.
- 카드가 정착해도 인물은 walking/attention action을 계속하는 시간적 독립성.
- 목적지마다 다른 관심 대상·상체 행동·시선·표정의 조합.

### 이번 독자적 adaptation에서 제외할 것

- 원본의 Taoagou Airlines 이름, Bangkok/Seoul/Dali/Tokyo 텍스트와 동일한 티켓 정보.
- 원본 인물의 얼굴·헤어·의상·가방을 pixel-copy하는 것.
- 원본 MP4에서 확인할 수 없는 제작 도구·생성 모델·레이어 구조의 주장.
- 모든 카드를 사람 전체를 한 번에 덮는 불투명 full-screen wipe로 단순화하는 것.
- 생성 모델의 티켓 typography와 barcode가 정확히 유지된다고 검수 없이 가정하거나, 변형된 표면을 PASS시키는 것. ImageGen 카드 입력을 Flow에서 움직이는 경로 자체를 배제하지는 않는다.
- “elastic”, “ease-out”, “stacked slide-up”이라는 이름만으로 구현·합격을 주장하는 것.

## 6. 사용자 검토 요청과 다음 게이트

G0는 아래 네 자료를 사용자가 확인해야 열린다.

1. [all-four-transition-anchors.jpg](all-four-transition-anchors.jpg)에서 네 행의 pre→entry→overlap→reveal→settle 관계가 레퍼런스 관찰과 맞는지 확인.
2. [정상속도 발췌](four-transitions-source-normal.mp4)에서 실제 리듬과 old upper/new lower 공존을 확인.
3. [0.5배속 발췌](four-transitions-source-half-speed.mp4)에서 카드 경계와 인물 공개 순서를 확인.
4. 원본 제작 추정이 아니라 **이 문서의 grammar allowlist로 우리 독자적 영상을 만들 것**에 동의.

사용자 확인 전 판정은 `AWAITING_USER_REVIEW`이며 PASS가 아니다. 확인 후 다음 순서는 G1(ImageGen identity/outfit/ticket anchors) → G2(Flow 카드 단독) → G3(기준 보행·의상 변형)이다. 사용자가 관계나 타이밍을 수정하면 이 계약과 영향을 받는 후속 게이트를 먼저 갱신한다.

## 7. 한계와 provenance

- 원본의 30fps를 작업용 24fps에 같은 frame index로 복사하지 않는다. 시간 기준으로 변환하고, 새 결과는 별도 계측한다.
- 인물의 숨은 발·카드에 가려진 영역은 `NOT_MEASURABLE`이다. 프레임이 보이지 않는 부분의 gait를 추측해 PASS하지 않는다.
- 이 분석은 원본 한 파일의 관찰이다. 다른 Taoagou 업로드나 원 제작자의 전체 프로젝트를 전수 검증한 것이 아니다.
- source-only 발췌의 라벨은 검수 편의를 위한 것이며 원본 화면 문법의 일부가 아니다.
