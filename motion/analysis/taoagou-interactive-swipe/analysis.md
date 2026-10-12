# Taoagou 인터랙티브 스와이프 영상 1차 역설계

## 잠긴 원본

- 파일: `../../references/taoagou/taoagou_interactive_swipe_KuXyyAClOqSnCAcAmYvUZyEMmlNf3fM6ECnFVT00cEuM.mp4`
- 공개 게시물 설명: `和你玩的很开心！#变装 #手保健操 #手指游戏 #互动视频 #电子逗猫棒`
- SHA-256: `64681B25A2EA36CC61936B6C9F2073C3FCF90FB6DE943F83C20B9E41EC089B12`
- 컨테이너 길이: 24.085333초
- 영상: H.264 High, 960×1920, 약 59.94fps, 1439프레임, BT.709, progressive
- 오디오: AAC-LC, 48kHz, stereo

이 문서는 완성 MP4의 관찰 가능한 결과만 다룬다. 원본 레이어, 마스크, 키프레임, easing 또는 사용 앱을 복원했다고 주장하지 않는다.

## 화면 구조

영상은 하나의 긴 변신 장면이 아니라, 시청자의 손가락 동작을 가상의 입력 장치로 삼는 여섯 개 모듈의 연쇄다.

| 구간 | 관찰 가능한 focal | 화면 역할과 수명주기 | 1차 구현 가설 |
|---|---|---|---|
| 0.000–8.734 | 잠옷 인물과 `Wave your Finger` 안내 | 인물/방 배경은 거의 고정되고, screen-chrome 텍스트·화살표·흰 손가락 궤적이 순차 진입·이동·반복된다. | 실제 손가락 영상이 아니라 결정론적 SVG path/outline 애니메이션을 인물 plate 위에 합성한다. |
| 8.734–11.470 | 여러 의상 상태의 동일 인물 | 같은 방과 원형 발판을 공통 shell로 유지하며, 의상별 인물이 작게 나타나 전후 이동·회전·scale 변화로 focal을 교대한다. | 의상별 독립 Omni clip 또는 pose-matched still/clip을 만들고, cutout을 2.5D carousel 좌표에 배치한다. |
| 11.470–14.189 | 눈 클로즈업 → 소품 선택 | 눈꺼풀/홍채/메이크업 상태가 blink를 경계로 교체되고 작은 삼각·사각 sparkle이 나타난다. 이후 가방과 체크 패브릭이 전경으로 투척된다. | 눈 close-up은 별도 Omni clip 두 상태를 blink occlusion에서 교체한다. sparkle과 소품은 독립 PNG/SVG 및 foreground occlusion transition으로 합성한다. |
| 14.189–16.942 | 운전석 POV 몽타주 | steering wheel과 rear-view mirror의 눈이 shell로 남고, 전면 배경이 옆으로 이동하며 상점/거리 상태를 빠르게 교체한다. | 차량 shell과 mirror crop을 고정하고 배경 panorama/plate만 translate 또는 hard/whip cut한다. 실제 3D 운전 장면 전체 생성은 불필요하다. |
| 16.942–19.111 | 케이크를 먹는 얼굴 | fork와 케이크가 foreground에서 움직이고, 표정/눈감기 뒤 pixel-heart가 짧게 등장한다. | 인물·fork 행동은 하나의 Omni clip로 생성하고, 케이크 plate와 heart sprite는 합성한다. 손-포크 접촉 오류가 생기면 포크 포함 행동을 생성하고 케이크만 별도 plate로 둔다. |
| 19.111–24.085 | 카메라 앱 UI → 회전/낙하 전환 | 스마트폰 camera chrome과 lens dial이 인물·건축 배경 위에 덮이고, 이후 프레임 전체가 회전·기울어지며 강한 motion blur/전경 가림으로 최종 클로즈업에 연결된다. | camera UI는 SVG/HTML로 결정론적 조판한다. 인물 clip은 별도이며, 마지막은 2D camera transform + directional blur + foreground wipe로 연결한다. |

자동 scene-difference 후보는 8.734, 11.470, 14.189, 16.942, 19.111초다. 이는 의미 구간 경계 후보이지 원본 편집 방식의 증명은 아니다.

## 핵심 문법

1. **손가락을 controller로 만든다.** 손가락 궤적과 화면 focal의 이동 방향이 일치해야 하며, 안내 궤적이 먼저 동작을 학습시킨 뒤 실제 변신이 시작된다.
2. **공통 shell을 남기고 content만 교체한다.** 방, 원형 발판, 차량 대시보드, 카메라 UI가 연속성을 유지한다.
3. **불연속은 가림 안에 숨긴다.** blink, 전경 소품, whip, blur, 전체 회전이 AI 클립의 pose/identity 차이를 감춘다.
4. **인물과 모션그래픽을 분리한다.** 의상 인물, 눈, 케이크 행동은 source-video pixels이고, 경로·UI·sparkle·heart·카메라 변형은 후반 operator다.
5. **한 번에 하나의 focal만 활성화한다.** carousel에서도 여러 인물이 동일 prominence로 보이지 않고 중앙/전경 인물만 focused 상태가 된다.

## 구현 계약

### Gemini Omni에 맡길 것

- 의상별 2–3초 인물 동작 clip
- blink 경계를 포함한 눈 close-up 두 상태
- fork를 입으로 가져가고 표정이 변하는 단일 행동
- 마지막 야외 인물의 안정된 pose 및 반응

각 clip은 카메라 고정, 배경 단순화, 전신/손 보존, 시작·끝 pose 명시, 텍스트와 추가 소품 금지를 기본으로 한다. 전체 24초를 한 번에 생성하지 않는다.

### 결정론적 합성에 맡길 것

- 손가락 SVG 궤적과 안내 텍스트
- 원형 발판, carousel의 position/scale/z-order
- sparkle, pixel-heart, 카메라 UI
- 차량 shell과 이동 배경
- 가방·패브릭 foreground wipe
- 전체 프레임 회전, scale, directional blur, hard/flash cut
- 모든 텍스트와 아이콘

### 권장 첫 probe

먼저 0.000–11.470초만 재현한다. 1080×1920, 30fps로 만들되 원본의 59.94fps timecode를 초 단위로 유지한다.

1. 0–2초: 새 문구와 독자적인 손가락 궤적을 보여준다.
2. 2–6초: 같은 인물 plate 위에서 세 번의 gesture rehearsal을 수행한다.
3. 6–9초: 손가락 방향과 맞춘 carousel entrance를 실행한다.
4. 9–11.47초: 한 의상을 중앙 focal로 확정하고 최소 2초 reading hold를 둔다.

원본의 문구·의상·방 세트·정확한 궤적은 복제하지 않고, `gesture tutorial → controlled transformation` 구조만 사용한다.

## 불확실성과 금지 대체

- 의상 교체가 실제 촬영, 누끼, 3D 카드, AI video-to-video 중 무엇인지는 MP4만으로 확정할 수 없다.
- 눈 상태 교체가 메이크업 촬영 두 테이크인지 생성/보정인지는 확정할 수 없다.
- 차량 구간의 배경이 panorama translation인지 여러 실사 clip의 match cut인지 추가 dense-frame registration 전에는 확정하지 않는다.
- 전체 인물을 한 장짜리 opacity fade로만 교체하거나, carousel 전체를 global wipe하는 대체는 금지한다.
- 스마트폰 UI를 생성형 영상 속 글자로 만들지 않는다.
- 원본을 frame-by-frame 복제하는 video-to-video prompt는 사용하지 않는다.

## 증거

- [전략 프레임 컨택트시트](evidence/strategic_contact.jpg)
- [0–8.75초](evidence/contact_00-08.75.jpg)
- [8.70–14.20초](evidence/contact_08.70-14.20.jpg)
- [14.15–19.20초](evidence/contact_14.15-19.20.jpg)
- [19.05–24.09초](evidence/contact_19.05-24.09.jpg)

현재 단계는 1차 관찰·가설이다. 최소 playable probe와 원본/재현 좌우 비교 전에는 문법 PASS로 승격하지 않는다.
