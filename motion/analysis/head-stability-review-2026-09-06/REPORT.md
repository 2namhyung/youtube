# Head stability and gaze-orientation review

조사일: 2026-09-06  
목적: 레퍼런스가 지속적인 정면(렌즈) 주시인지, 현재 Seoul/Tokyo source와 T3 후보의 head/trunk orientation이 어떻게 다른지 bounded visual review한다. 영상·위키·코드·Flow 산출물은 수정하지 않았다.

## 판정 요약

1. **레퍼런스의 지속적인 렌즈 정면 주시는 확인되지 않는다.** 레퍼런스 Seoul은 F204–240 (약 6.80–8.00s, 30fps)에서 캡 아래 얼굴과 고개가 휴대폰 쪽으로 내려가고 팔이 접혀 있다. 레퍼런스 Tokyo는 F336–372 (약 11.20–12.40s)에서 고개/얼굴이 뻗은 손목 쪽으로 내려가며 걷는다. 기존 감사의 도시별 관찰과 일치한다: [reference performance audit](../reference-performance-audit-v1/report.md).
2. **우리 source는 정면에 더 가까운 순간이 있지만 고정되어 있지는 않다.** Seoul F60 (2.50s)은 아래를 보는 시작 자세이고 F82/F103/F125 (3.40/4.30/5.20s)은 얼굴이 더 가시적이고 대체로 전방/카메라 쪽이다. Tokyo F125/F146/F168/F190 (5.20/6.10/7.00/7.90s)은 정면에 가까운 순간에서 우산·손목 쪽의 낮은 시선으로 변한다. 이것은 head orientation/face visibility 관찰이지 렌즈 직시의 증거가 아니다.
3. **T3 first-pair에서도 모든 상체 동작을 억제하는 것이 최선이라는 근거는 없다.** 후보 overlap F36/F40/F44/F47 (local 1.50/1.67/1.83/1.96s)은 카드 가림 사이에서 Seoul의 비교적 전방 얼굴과 Tokyo의 우산/손 동작을 유지한다. 전환 중 화면 가림과 독립 source phase 때문에 머리의 작은 차이를 배속 효과나 실제 gaze shift로 분리할 수 없다.

## 증거 표

| 자료 | 프레임/시간 | 관찰 가능한 head·trunk | 말할 수 없는 것 |
|---|---|---|---|
| Reference Seoul | F204/F216/F228/F240 ≈ 6.80/7.20/7.60/8.00s | 캡 아래 고개가 폰 쪽으로 낮고, 몸통은 비교적 세워진 채 왼팔 폰·오른팔 접힘 유지 | 눈동자가 실제 화면을 향하는 정확한 각도, 렌즈 직시 여부 |
| Reference Tokyo | F336/F348/F360/F372 ≈ 11.20/11.60/12.00/12.40s | 머리와 얼굴이 뻗은 손목/팔 쪽으로 낮아지고 몸통은 보행 방향을 유지 | 손목을 보는지, 렌즈에서 몇 도 벗어났는지의 정량값 |
| Current Seoul 10s | F60/F82/F103/F125 = 2.50/3.40/4.30/5.20s | 아래 보기에서 전방에 가까운 얼굴로 바뀌며 몸통/어깨는 대체로 세로 안정 | 카메라를 실제로 응시하는지, 이 변화가 factor 때문인지 |
| Current Tokyo 10s | F125/F146/F168/F190 = 5.20/6.10/7.00/7.90s | 우산을 든 상태에서 얼굴 가시성이 높고 후반에는 낮은 손/우산 쪽 방향이 섞임 | 정확한 eye-vector, reference와 동일한 acting phase |
| T3 local candidate | F36/F40/F44/F47 = 1.50/1.67/1.83/1.96s | 1.5–2.0s 카드 wipe 동안 두 source가 교대하며 얼굴·몸통이 크게 번역되지 않음 | transition mask 아래 joint continuity와 exact gaze/foot phase |

프레임 목록과 crop box는 [metadata.json](metadata.json), 비교 이미지는 [head-stability-contact.jpg](head-stability-contact.jpg)에 고정했다. 입력은 [reference MP4](../../references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4), [Seoul 10s source](../../production/ticket-travel/performance-v2/canonical-hanbok-10s.mp4), [Tokyo 10s source](../../production/ticket-travel/performance-v2/tokyo-parasol-10s.mp4), [T3 candidate](../t3-cut-local-2026-09-06/t3-seoul-tokyo-local-1.80x-4s.mp4)다. 기존 source는 모두 720×1280/24fps, 레퍼런스는 1080×2160/30fps이며, 서로 다른 인물·의상·생성 take다.

## 속도 원인과 설계 판단

이 자료만으로 레퍼런스의 빠른 인상이 **배속 하나 때문이라고 확정할 수 없다.** 보폭·발 가림·의상·소품·상체 acting·서로 다른 source가 함께 바뀐다. 현재 T3 후보의 1.80×는 선택된 cut-local playback factor일 뿐 레퍼런스의 측정 계수가 아니다. [walking cadence audit](../walking-cadence-audit-2026-09-06/report.md)도 정확한 steps/s와 global factor를 확정하지 않았다.

따라서 다음 합성 원칙이 가장 안전하다.

- reference의 도시별 관심 대상과 손동작은 유지하되, `look directly at the lens` 같은 새 연기를 강제하지 않는다. reference 자체가 Seoul의 폰 보기와 Tokyo의 손목 보기처럼 목적 지향적이기 때문이다.
- pelvis/trunk/평균 화면 위치와 head orientation의 큰 점프는 억제하고, 눈·머리·어깨가 완전히 rigid group이 되지 않도록 작은 비동기 변화를 허용한다. 이는 [lifelike motion research §4](../elasticity-lifelike-2026-09-06/RESEARCH.md)의 관찰과 맞는다.
- 얼굴이 더 잘 보이는 우리 source를 “렌즈 정면 주시”로 포장하지 않는다. 이번 판단은 `head orientation: broadly forward / down-to-prop / unknown eye gaze`처럼 분리 기록한다.

## 한계와 다음 사용

정확한 눈동자 방향은 이 해상도와 crop에서 직접 측정하지 않았으므로 `UNKNOWN`이다. Contact sheet는 시각적 orientation/face visibility의 위치표이며, 상체 억제·배속·phase continuity의 통계적 증명이 아니다. 이 first-pair는 head/trunk 회귀용 provisional evidence이고 전체 T3 PASS가 아니다. 추가 source/후보가 생기면 같은 프레임 역할과 시간 표기로 반복 비교한다.
