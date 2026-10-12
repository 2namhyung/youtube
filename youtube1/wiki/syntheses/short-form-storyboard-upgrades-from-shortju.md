# 짧주 분석에서 가져올 스토리보드·컷 설계 개선

- 근거: [짧주 대본·이미지 컷 분석](../sources/shortju-youtube-channel-cut-analysis-2026-08-15.md)
- 관련 문법: [뉴스룸 2–3초 컷 모션 패턴](newsroom-cut-motion-pattern-catalog.md)
- 적용 범위: locked narration과 sealed semantic cut plan 이후의 storyboard 설계

## 가져올 것

### 한 문장 절을 한 컷으로 묶는다

2–3초 컷 하나는 다음 중 한 기능만 수행한다.

- 대상 식별
- 과거 상태
- 사건 발생
- 직접 증거
- 비교·반전
- 결과·영향
- 결론

한 컷에 두 기능이 필요하면 주 이미지 하나와 evidence overlay 하나로 제한한다. 서로 다른 사진 두 장을 작은 화면에 억지로 나누지 않는다.

### 모든 컷에 `visualRole`과 `imageContribution`을 기록한다

스토리보드에는 최소한 다음 판단값이 있어야 한다.

| 필드 | 값 |
|---|---|
| `visualRole` | `identity`, `context`, `direct-evidence`, `comparison`, `consequence`, `reaction` |
| `sourceTier` | canonical source class인 `actual-case-evidence`, `institutional-context`, `generic-stock`, `grok-generated` |
| `imageContribution` | `repeats-narration`, `adds-identity`, `adds-place`, `adds-proof`, `adds-comparison`, `adds-consequence` |
| `reuseState` | `first-use`, `return-wide`, `return-crop`, `return-with-overlay` |
| `motionIntent` | `hard-cut`, `slow-push`, `crop-shift`, `source-highlight`, `natural-action` |

`repeats-narration`만 있는 컷은 다른 사진을 찾거나 대본에서 생략된 자료를 추가해야 한다.

### 실사 80%는 ‘사진 수’가 아니라 authored duration으로 계산한다

- 실제 사진·영상이 차지하는 authored duration 합계가 전체의 80% 이상이어야 한다.
- `actual-case-evidence`가 부족하면 `institutional-context`와 `generic-stock`을 사용할 수 있지만, 화면에서 사건 당사자·현장으로 오인되지 않게 표시한다.
- 문서·공지·판결·기관 화면은 실사 비율에 넣기 전에 라이선스와 screenshot 재사용 권리를 확인한다.
- Grok 생성은 권리·프라이버시 때문에 실사로 설명할 수 없는 행동·민감 장면과 연결 구조에만 `grok-generated`로 사용한다.

### 같은 이미지를 정보 상태를 바꿔 재사용한다

반복 자산은 단순 재탕이 아니라 다음 순서를 따른다.

1. 첫 등장: 전체 장면으로 대상 식별.
2. 재등장: 핵심 영역 crop.
3. 증거 단계: marker·source chip·문서 일부 overlay.
4. 결론 단계: 처음과 같은 구도로 돌아가되 결과 label 추가.

이 방식은 필요한 사진 수를 줄이면서 시청자가 같은 물증을 기억하게 한다.

### hard cut을 기본값으로 되돌린다

- 같은 사건 안의 사진 교체: hard cut.
- 같은 물건의 전체→세부: position match cut.
- 사람·차량·문 동작이 이어짐: cut-on-action.
- 시간·장소·절차 방향이 실제로 있음: directional wipe.
- 전후 상태 비교: split wipe.

전환 효과가 의미 관계를 설명하지 않으면 쓰지 않는다. 레퍼런스의 강점은 복잡한 효과가 아니라 이미지 선택 속도다.

## 보완해서 가져올 것

### 제목과 자막

레퍼런스의 상단 고정 제목은 방향을 잃지 않게 하지만 우리 canonical title track과 중복된다. 따라서:

- 제목은 기존 상단 title track에서만 유지한다.
- 미디어 영역에는 숫자·날짜·기관명·source chip만 둔다.
- 하단 자막은 내레이션 전체를 따라가되 강조색은 컷당 핵심어 하나만 사용한다.

### 직접 증거 컷

레퍼런스처럼 receipt를 중간에 반드시 배치하되, 우리 설계에서는 다음을 추가한다.

- 원문 전체 screenshot보다 필요한 문장·수치만 권리 허용 범위에서 재구성한다.
- source URL, 기관, 날짜, claim lineage를 storyboard metadata에 연결한다.
- 문서가 대본보다 새 정보를 줄 때만 별도 컷을 배정한다.
- 확인되지 않은 SNS 주장이나 커뮤니티 이미지는 direct evidence로 승격하지 않는다.

### 결론의 톤

- 상품·기술·가벼운 업계 소식: 짧은 반응 또는 질문형 결론 가능.
- 범죄·피해·미성년자·환자·교사 사건: 밈·감탄 대신 확인된 상태, 남은 쟁점, 제도적 질문으로 마감한다.

## 새 컷 설계 순서

1. locked narration을 의미 절로 나눈다.
2. 각 절에 `visualRole`을 하나 배정한다.
3. 뉴스·법률 자료에서 대본에 없는 추가 정보를 한 문장으로 기록한다.
4. 그 추가 정보를 입증할 이미지가 있을 때 `direct-evidence` 컷을 삽입한다.
5. 실사 권리 판정과 authored-duration 80%를 계산한다.
6. 누락된 민감 행동·구조만 `grok-generated`로 남긴다.

세 프로젝트의 구체 적용은 [3편 공통 내레이션·스토리보드 규칙](three-story-narration-storyboard-common-rules.md)을 따른다.
7. 실제 사진은 전체→세부→evidence overlay 순서로 storyboard를 만든다.
8. 컷 전환은 hard cut을 기본으로 의미가 있을 때만 다른 전환을 선택한다.

## 컷 승인 질문

- 이 이미지는 대본을 반복하는가, 아니면 신원·장소·증거·비교·결과 중 하나를 추가하는가?
- 실제 사건 이미지라면 동일 사건·동일 시점임이 확인됐는가?
- 자료사진이면 사건 당사자나 실제 현장으로 오인될 요소가 없는가?
- 같은 이미지를 이전 컷과 다른 정보 상태로 사용했는가?
- 문장 절과 이미지 컷의 시작·종료가 함께 움직이는가?
- 전환을 제거해도 의미가 같다면 hard cut으로 단순화했는가?
