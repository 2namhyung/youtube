# 뉴스룸 오디오 Shorts 대본 원칙 v21

Stage 03 생성기는 검증된 사건 자료 안에서 자연스럽고 흥미로운 한국어 낭독문을 자율적으로 작성한다. 구성·문체·재미는 모델이 자율적으로 결정하며 코드나 예시가 서사 형식을 처방하지 않는다.

## 생성 입력과 출력

- hash-bound input package schema 21의 `caseBrief`만 사건 자료로 사용한다.
- 출력은 한국어 연속 `narration`, narration의 실제 문장별 `claimRefs`, 별도 영어 `storyText`다. `storyText`는 2~5문단 영화 줄거리 산문이며 반복 인물과 차량을 첫 행동 전에 서로 구별되는 시각 설정과 소유 관계로 소개하고, 주요 이동·행동·가시적 결과를 가능한 한 문장별로 잇는다. 이는 실제 신원·차종·직업·지위의 증거가 아니며 narration이나 claim에 들어갈 수 없다.
- 모든 문장은 현재 사건의 검증 claim을 하나 이상 직접 참조한다.
- 인물·차량·물건과 그 관계를 바꾸거나 근거 없는 사실·행동·대사·감정·인과를 만들 수 없다.
- `caseBrief`가 확인한 사실의 시점·기간을 앞뒤 행동 전체로 확대할 수 없다.
- 혐의·주장·수사·재판 단계와 필요한 법적 한정을 보존한다.

## 길이와 안전 검토

- 모델이 직접 세기 쉬운 띄어쓰기·문장부호 포함 일반 문자 수를 생성기에 전달한다. 기존 대본의 약 0.75 compact/ordinary 비율과 v20의 8% 미달 실측을 반영한 현재 6.87자/초 내부 목표는 700~720자다.
- deterministic admission은 이 일반 문자 목표와 별개로 계속 공백 제외 Unicode 기반 65.0~80.0초 예상 범위와 정확한 sentence claim lineage를 확인한다. 모델 내부 목표는 70~75초이며, 실제 owner narration locked timing은 이후 확정 gate다. 장면 프롬프트는 대본 승인 뒤 별도 batch에서 생성한다.
- 별도 read-only critic은 factual grounding, entity/object identity, legal qualification과 storyText의 인물·차량·물체 의미 및 시각 연속성만 pass 또는 reject로 판정한다.
- critic은 재미·문체·구성·정보 순서·반복을 평가하거나 대본을 수정하지 않는다.
- reject면 실행은 원자적으로 끝나며 rewrite와 retry는 0이다. 기존 active/finalized authority와 append-only history는 보존한다.
