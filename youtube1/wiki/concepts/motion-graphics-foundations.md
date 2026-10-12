# 모션그래픽 판별과 제작 기초

## 목적

이 문서는 뉴스 영상에서 **모션그래픽**, 원본 영상, 단순 편집, 정지 그래픽을 혼동하지 않기 위한 판별 기준이다. 레퍼런스 조사와 장면 설계 전에 이 기준을 먼저 적용한다.

## 작업 정의

모션그래픽은 **의미·정보·위계·감정을 전달하도록 설계된 그래픽 요소가 시간에 따라 변하는 표현**이다. 텍스트, 도형, 선, 아이콘, 도표, 문서 강조, 합성 레이어가 생성·이동·변형·강조·소멸하며 설명 기능을 수행한다.

같은 물체가 계속 움직여야만 모션그래픽인 것은 아니다. 새로운 노드가 생기거나, 연결선이 그려지거나, 문서의 특정 문장이 강조되거나, 숫자와 상태가 교체되는 것도 모션그래픽이다. 반대로 영상 클립을 붙이거나 카메라가 움직이는 것만으로는 모션그래픽이 아니다.

Adobe는 모션그래픽을 움직이는 텍스트와 디자인 요소로 설명하고, After Effects의 position·opacity 등 속성을 키프레임 사이에서 변화시키는 방식을 기본 원리로 제시한다. 출처: [Adobe Motion Graphics](https://www.adobe.com/uk/creativecloud/animation/discover/motion-graphics.html), [Adobe Animation Basics](https://helpx.adobe.com/after-effects/using/animation-basics.html).

## 분류 경계

| 화면에서 일어나는 일 | 기본 분류 | 모션그래픽으로 인정되는 조건 |
|---|---|---|
| 취재 영상·스톡 영상 재생 | 원본 영상 | 그래픽 레이어가 별도의 설명 기능을 수행할 때 그 레이어만 모션그래픽 |
| 컷 편집·크로스페이드·줌 | 영상 편집 | 정보 구조를 새로 만들지 않으면 모션그래픽 아님 |
| 사진의 패닝·줌 | 사진 애니메이션 | 사진 위의 관계·시간·증거를 그래픽으로 설명할 때만 해당 레이어 인정 |
| 고정된 제목·문서·도표 | 정지 그래픽 | 위치·상태·위계가 시간에 따라 의미 있게 변해야 함 |
| 자막이 뜨고 사라짐 | 타이포그래피 애니메이션 | 단순 자막보다 정보 위계·강조·전환을 설계한 경우 |
| 노드 생성과 연결선 전개 | 모션그래픽 | 관계·원인·책임·흐름을 설명할 때 |
| 문장 하이라이트 진행 | 모션그래픽 | 근거 문서의 특정 구절을 독자가 찾도록 안내할 때 |
| 캐릭터가 걷고 연기 | 캐릭터 애니메이션 | 도형·텍스트·정보 레이어와 결합된 부분만 별도 판정 |
| 3D 공간 재연 | 3D 애니메이션·재구성 | 정보 그래픽과 혼동하지 않으며 근거가 없으면 사건 재연에 사용하지 않음 |
| 연기·폭발·글리치 합성 | VFX | 설명 구조가 없으면 모션그래픽으로 세지 않음 |

## 세 가지를 별도로 평가한다

1. **분류 정확성**: 실제로 모션그래픽인가.
2. **디자인 품질**: 구도, 타이포그래피, easing, 타이밍, 색, 레이어가 전문적인가.
3. **사건 적합성**: 제주·간호조무사·휴대전화 사건의 설명에 필요한가.

모션그래픽이 맞더라도 품질이 낮거나 사건에 불필요할 수 있다. 지도 모션그래픽이 훌륭해도 위치 관계가 핵심이 아닌 사건에는 채택하지 않는다.

## 프레임 단위 판별 절차

1. 후보 구간을 앞·중간·뒤 프레임으로 확인한다.
2. 원본 영상과 합성 그래픽 레이어를 분리해 기록한다.
3. 변하는 그래픽 속성을 적는다: 위치, 크기, 회전, opacity, path, mask, 색, 숫자, 텍스트, 연결 상태.
4. 그 변화가 전달하는 의미를 한 문장으로 적는다.
5. 그래픽 레이어를 제거했을 때 설명 정보가 사라지는지 확인한다.
6. 단지 장면이 바뀌거나 카메라가 움직인 것이라면 탈락시킨다.
7. 사건에 동일한 정보 구조가 있을 때만 레퍼런스로 채택한다.

## 좋은 모션의 제작 원칙

- **정보 위계 우선**: 한 화면에서 무엇을 먼저, 다음으로 볼지 명확해야 한다. School of Motion은 위계가 정보를 빠르게 전달하도록 구성한다고 설명한다. 출처: [Fundamental Composition Rules](https://schoolofmotion.com/blog/fundamental-composition-rules-for-designers).
- **연속성과 의미 보존**: 요소가 이동하거나 변형되어도 독자가 같은 대상·관계를 추적할 수 있어야 한다.
- **순차 공개**: 모든 것을 한 번에 보여주지 않고 내레이션 순서대로 핵심 요소를 만든다.
- **easing은 장식이 아니라 안내**: IBM Carbon은 동작이 시선을 유도하고 의미·공간의 연속성을 유지해야 하며, 과장된 동작이 주의를 빼앗지 않아야 한다고 설명한다. 출처: [Carbon Motion Overview](https://v10.carbondesignsystem.com/guidelines/motion/overview/), [Carbon Choreography](https://v10.carbondesignsystem.com/guidelines/motion/choreography/).
- **음성 기준 타이밍**: 키워드가 들리는 순간 핵심 그래픽 상태가 도착해야 한다.
- **스타일프레임과 애니매틱 선행**: brief → script/visual description → moodboard → thumbnails → styleframes → storyboard → animatic → blocking → finish 순서로 큰 변경을 앞단에서 해결한다. 출처: [School of Motion workflow PDF](https://connect.schoolofmotion.com/hubfs/Email%20Images/Bring%20Your%20Ideas%20To%20Life%20Workshop/Bring_Your_Ideas_To_Life.pdf), [Ordinary Folk Process](https://www.ordinaryfolk.co/process).

## 뉴스 사건용 기본 모듈

- 관계·책임망: 사람·기관 노드, 역할 라벨, 방향성 연결선, 상태 변화.
- 증거 흐름: 정상 상태 → 확보·이동 → 훼손·분실 → 뒤늦은 확인.
- 문서 포렌식: 원문 전체 맥락 → 해당 문장 위치 → 제한된 강조 → 출처·불확실성 표시.
- 시간축: 사건·발견·수사·처분을 날짜 순으로 공개.
- 비교·변화: 판결 전후, 주장과 확인 사실, 수사와 처벌의 차이.
- 키네틱 타이포그래피: 핵심 질문이나 짧은 대비만 사용하고 본문 자막을 대신하지 않음.

지도는 지리적 이동이나 관할·거리·위치 관계가 주장 이해에 필수일 때만 사용한다. 현재 세 사건의 공통 핵심 모듈은 지도보다 관계망, 증거 상태, 문서 강조, 시간축이다.

## 내부 학습 자료

- [모션그래픽 기초 원문](../../06-production/opencut-automation/production/motion-assets/evidence-motion-analysis-v1/motion-graphics-foundations-v1.md)
- [판별 루브릭](../../06-production/opencut-automation/production/motion-assets/evidence-motion-analysis-v1/motion-graphics-classification-rubric-v1.json)
- [교정 사례 18건](../../06-production/opencut-automation/production/motion-assets/evidence-motion-analysis-v1/motion-graphics-calibration-cases-v1.json)

이 내부 자료는 분류 연습용이다. 특정 유튜브 영상의 장면을 자동으로 모션그래픽이라고 보증하지 않는다.
