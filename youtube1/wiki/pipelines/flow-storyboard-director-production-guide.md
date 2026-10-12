# Flow 뉴스룸 스토리보드 디렉터 Pro 영상 제작 지침

> 2026-09-10: 신규 생성 영상은 [canonical contract](newsroom-video-production.md)의 `newsroom-imagegen-flow-i2v-v3`를 따른다. fact spine과 역사 owner 발화율 분포로 만든 provisional timing에서 ImageGen entry frame·camera card·animatic을 검수한 뒤 정확히 3샷/10초 Flow transport batch(3/3/4초 source intent)로 보낸다. 정상 초기 계획은 9개 batch/90초 picture source coverage이며 최종 런타임 권위가 아니다. 확정 prompt bytes는 변경하지 않는다.

Flow 이후에는 usable source window를 고르고 OpenCut picture rough를 먼저 만든다. semantic reconciliation에서 각 unit을 `reshoot|trim|visual-bridge|script-expression-conform`으로 처리한 뒤, fact spine과 법적 claim을 보존하며 연결어·중복·표현만 final conform한다. 최종 owner narration을 녹음·승인·잠그고 0.95–1.05 audio conform을 최대 한 번 수행한다. captions/title/BGM과 final factual AV QA 전에는 render할 수 없다.

이 문서는 승인된 대본을 Flow의 통합 도구로 영상화할 때의 실무 순서와 입력 규칙이다. 기준 도구는 [뉴스룸 스토리보드 디렉터 Pro](https://flow.google.com/project/a399b814-8c66-435b-bc9d-a129e36a4e96/tool/ec9ffe5d-1b28-4e4e-bfd9-ca2202c85f62)이며 화면 순서는 `원문 내레이션·스토리 스크립트·음성 → 공통 에셋 → 샷·상황 이미지 → 가편집·검수 → 영상·결과`다.

이 문서는 Flow private preview에서 사용하는 운영 지침이다. 생성 모델이 대본을 다시 쓰거나 자동 검수한다는 뜻이 아니다. Flow에 넣는 것은 이미 결정하고 검수한 장면 설계이며, 출력 영상은 별도 source QA를 거쳐야 한다.

## 1. 제작 전 고정

다음 권위를 같은 사건 ID로 재확인한다.

1. 뉴스·법률 검토가 끝난 사건 자료
2. 승인된 원문 대본·두 줄 제목
3. 실제 사용할 owner narration과 잠긴 측정 타이밍
4. storyline·semantic cut plan의 컷 ID·순서·길이 의도

대본은 원문 그대로 잠근다. 샷의 `scriptExcerpt`는 대본의 정확한 부분 문자열이어야 한다. `narrationStart/End`는 owner narration 기준으로 기록한다. Flow의 10초 멀티샷은 정확히 3개 shot을 3/3/4초 source intent로 묶는 재료 확보 단계이며 최종 타이밍이 아니다. 정상 초기 계획은 9개 batch/27개 shot slot/90초 picture source coverage다. 모든 provider 영상을 다운로드·보존·해시한 뒤 실제 컷 경계를 측정하고 OpenCut에서 필요한 길이로 줄인다.

## 2. 제작 순서

```text
검토 대본 → 문장 결합 시각 스토리 스크립트
→ 승인 대본·owner narration
→ 의미 단위·컷 ID 봉인
→ 카메라·공간·행동 설계
→ 필요한 공통 마스터 생성
→ 샷별 시작 상황 이미지 생성
→ Flow에 대본·에셋·상황 이미지 연결
→ 샷 5항목·시퀀스 3항목 검수
→ 애니매틱과 연결된 owner narration으로 정보 흐름 확인
→ authored order의 10초 3샷 Flow transport batch (3/3/4초 source intent)
→ 모든 provider 원본 다운로드·보존·실제 컷 경계·프레임 QA
→ 통과한 구간만 최종 컷으로 편집
```

실패한 샷은 immutable revision으로 교체한다. 오류 비용이 높아 미리 분리하거나 multishot source QA에서 실패했을 때만 single-shot I2V로 복구한다. 이 경우 새 entry frame을 만들고 camera card·샷·인접 상태와 현재 sequence 애니매틱을 다시 승인한다. 다른 샷의 미디어와 검수 기록은 보존한다.

## 3. 생성할 이미지

### 공통 마스터

화면에 실제로 등장하거나 여러 샷에서 재사용할 때만 만든다.

| 마스터 | 내용 |
|---|---|
| `CHAR-MOTHER`, `CHAR-TEEN`, `CHAR-AGGRESSOR` | 필요한 역할의 전신 단독 이미지 |
| `CHAR-CHILD` | 후반부 차량 안의 아이가 실제로 보일 때만 추가 |
| `CAR-A`, `CAR-B` | 피해 차량과 상대 차량의 단일 차량 원본 |
| `BG-ROAD` | 차선·합류 지점·정체 구간이 읽히는 도로 |
| `PROP-GUN-SHAPED`, `PROP-AWL` | 해당 물건이 화면의 의미를 담당할 때만 |
| `FRAME-*` | 각 샷의 실제 시작 배치를 합성한 단일 상황 이미지 |

모든 인물은 `realistic-proportion-faceless-matte-mannequin-v1`로 통일한다. 밝은 아이보리 무광, 현실적인 신체비율, 머리카락·눈·코·입·귀가 없는 하나의 매끈한 머리를 사용한다. 공포·분노는 얼굴이 아니라 몸의 기울기, 어깨, 팔, 거리, 보폭으로 표현한다.

공통 인물 프롬프트:

```text
Create one full-body canonical reference for a fictional [ROLE], portrait
9:16, one figure only, plain light-gray background, natural realistic
[adult/teen/child] proportions. Bright ivory matte 3D mannequin with one
continuous smooth blank head: no facial geometry, eyes, nose, mouth, ears or
hair. Emotion only through posture, torso, shoulders and arms. [WARDROBE].
Soft diffuse daylight and restrained realistic 3D materials. No extra
figures, props, text, numbers, logos, brands, montage or toy proportions.
```

차량·배경·소품만 있는 이미지에는 위 인물 마네킹 문장을 넣지 않는다. 차량은 한 이미지에 한 대만 넣는다. 차체·바퀴·창문·앞뒤가 보이는 일반 세단으로 만들고 제조사 배지, 글자, 번호판 식별 정보는 제거한다. 배경에는 실제 샷에 필요한 차선과 건물만 넣는다. 시트·부품 분해도·캐릭터 여러 각도 몽타주는 디자인 검토용이며 영상 입력용이 아니다.

### 샷별 상황 이미지

샷마다 `FRAME-<cutId>-v1` 하나를 만든다. 이 이미지는 마스터를 실제 구도에 합성한 **행동 시작 상태**다.

- 단일 구도, 세로 9:16, 한 순간
- 역할·좌석·차량 앞뒤·차선·화면 방향이 보임
- 행동이 아직 끝나지 않음
- 다음 샷으로 넘길 `entry state`가 분명함
- 필요한 대상만 존재하고 글자·CAST 라벨·로고·추가 인물이 없음

상황 이미지 프롬프트:

```text
Create one portrait 9:16 situation frame, not a storyboard grid. Use the
attached canonical masters only for [CHAR_*], [CAR_*], [BG_*], [PROP_*].
START STATE: [exact beginning position and object state].
SPATIAL BLOCKING: [screen direction, lane, seat, front/rear relation and
camera side of the action axis]. ONE OBSERVABLE ACTION TO FOLLOW: [one
action]. This image is before that action is completed.
CAMERA CARD: size [size]; angle [angle]; position [position]; composition
[composition]; movement [one type and direction]; axis [action axis and camera
side]; screenDirection [direction]; seat [vehicle seat or not-applicable];
focus [subject/focus behavior]. Keep required subjects visible.
Preserve any listed bright-ivory faceless matte mannequins, vehicle identity,
daylight and background. When no person is listed, do not add a mannequin.
No new people, objects, text, labels, logos,
dialogue, subtitles, collage or split screen.
```

대본은 무엇을 말하는지, 상황 이미지는 그 문장을 어느 공간과 순간으로 보여줄지 결정한다. 이미지에 다음 결과까지 미리 그려 넣으면 영상 모델이 행동을 생략할 수 있다.

## 4. 카메라·공간 카드

각 샷을 만들기 전에 다음을 채운다.

1. 시청자가 새로 알게 되는 사실 한 가지
2. 그 사실에 필요한 동시 화면 대상
3. 카메라의 높이·방향·거리
4. 피사체 움직임과 카메라 움직임
5. 다음 샷으로 넘길 마지막 상태

| 필드 | 규칙 |
|---|---|
| `size` | wide / medium / close-up 중 정보가 보이는 최소 크기 |
| `angle` | eye-level / elevated / high-angle 등 높이 |
| `position` | 도로 옆·차량 전면·앞유리 안 등 물리 위치 |
| `composition` | 프레임 안 주피사체 위치, lead room, 동시에 보여야 할 대상 |
| `movement` | locked-off / pan / tilt / tracking / push-in / pull-back / crane / arc / handheld / zoom 중 정확히 1개와 방향. rack focus는 `focus`에 기록 |
| `axis` | 차량 진행축과 카메라가 놓인 쪽 |
| `screenDirection` | 화면상 좌→우 또는 우→좌 |
| `seat` | 차량 기준 운전석·조수석. 좌석이 없으면 `not-applicable` |
| `focus` | 주 초점 대상과 고정/랙 포커스 계획 |
| `start/endState` | 시작·한 행동 후의 위치와 물체 상태 |

차량 관계·좌석 설명은 `locked-off`를 기본으로 한다. 이동은 정보 전달이 필요할 때만 쓴다. 같은 사건 단계에서는 카메라를 행동 축의 같은 쪽에 놓고 모든 차량의 코와 진행 방향을 유지한다. 축을 넘길 때는 먼저 넓은 재설정 샷을 둔다.

편집은 하드컷을 기본으로 한다. 방향이나 형태가 실제로 이어지는 지점만 매치 컷·짧은 페이드를 검토한다. 모든 컷에 마스크·와이프·휘프팬·줌을 넣지 않는다.

## 5. Flow 입력 순서

### 1 대본·음성

원문 한국어 내레이션은 그대로 보존하고 owner narration을 연결한다. 신규 Stage 03에서는 기존 Codex generator 한 응답이 내레이션·문장 근거와 별도 영어 `storyText`를 함께 반환한다. `storyText`는 같은 caseBrief에서 배경과 인물 관계, 발단, 행동과 선택, 갈등 고조, 확인된 결과를 잇는 2~5문단 영어 영화 줄거리 산문이다. 각 전환은 확인된 주체와 대상, 직전 상태 또는 출발 위치, 이동·행동 순서와 결과를 구체적으로 연결한다. 기사 문구가 시작·끝 위치, 방향, 거리나 궤적을 확정하지 않으면 그대로 복사·직역하거나 임의의 화면 동선으로 해석하지 않고 공통으로 확인된 최소 행동만 쓴다. 반복 등장인물은 로마자 이름을 일관되게 사용하고, 첫 등장에 나이 또는 나이 범위와 구체적인 복장을 자연스럽게 설정한다. 근거가 정확한 나이를 확인하면 이를 보존하고, 미확인 나이는 확인된 역할·학년·관계와 모순되지 않는 구체 나이 또는 범위를 영상 설정으로 정할 수 있다. 이름·설정 나이·복장은 실제 신원이나 claim evidence가 아닌 내부 영상 설정이며 narration에 넣지 않는다. 본문에는 `fictional alias`, `visual setting`, `composite character` 같은 제작 설명을 쓰지 않는다. 경찰이 기관으로만 확인됐다면 경찰 역할 이름도 내부적으로 합성 인물로 관리하고 확인되지 않은 계급·대사·수사 행동을 만들지 않는다. legacy accepted 한국어 원문은 감사 근거로 보존한다. 문장별 카드, 컷 ID, 시간, 카메라, 에셋 태그, claim ID나 hash를 사용자용 글에 넣지 않는다. 기존 factual/legal critic 한 번이 대본과 storyText의 사실·관계·인과·법적 한정, 공간 의미와 인물 설정의 존재·일관성을 caseBrief 전체로 함께 검토하며 별도 story writer나 critic은 두지 않는다. creator는 generator의 서로 다른 필드에서 `narration.txt`와 `story-script.txt`를 각각 기록한다. 잠근 뒤 샷을 설계하고, 대본 전체를 영상 모델에 창작 프롬프트로 다시 보내지 않으며 각 카드의 정확한 발췌와 행동 지시만 사용한다. 10초 source가 내레이션·자막·대사를 자동 생성한다고 가정하지 않는다.

### 2 공통 에셋

마스터는 ImageGen 합성 provenance에 보존한다. Flow batch에는 검수된 샷별 `FRAME-*`만 authored order로 업로드한다. 다음 정보는 외부 receipt/manifest에 보존한다.

```text
assetId / roleTag / 실제 media ID / 생성 도구 /
prompt hash / image bytes hash
```

실제 파일은 물리 파일과 hash를 보존한다. `@ROLE_TAG`는 내부 receipt용 식별자이며 Flow 공식 태그 문법으로 기록하지 않는다.

### 3 샷·상황 이미지

각 카드에 `purpose`, `oneAction`, exact `scriptExcerpt`, locked `narrationStart/End`, `spatialStart/End`, 완전한 camera card, 실제로 보이는 `linkedAssetIds`, `FRAME-*`의 asset ID·contained file·bytes·SHA-256·role tag를 입력한다. batch별 선택 순서와 실제 media receipt를 별도로 보존한다. 공통 마스터 등록이나 prompt의 role tag는 영상 입력 또는 native binding을 증명하지 않는다.

### 4 가편집·검수

현재 sequence signature와 잠긴 owner narration을 결합한 애니매틱을 검토한다. 잠기지 않은 음성이나 추정 발화율 애니매틱은 planning preview일 뿐 Flow submission gate를 열지 않는다. 각 샷은 다음 항목을 모두 reviewer와 note를 포함해 `PASS`로 저장한다.

| 검수 | 질문 |
|---|---|
| `composition` | camera card가 요구한 대상과 여백이 한 프레임에 보이는가? |
| `actors` | 필요한 역할·외형·인물 스타일이 맞는가? |
| `vehicles` | 필요한 차량·앞뒤 관계·차선 배치가 맞는가? |
| `direction` | 행동축과 화면 진행 방향이 맞는가? |
| `seats` | 차량 기준 좌석이 맞거나 `not-applicable`인가? |
| `noExtraText` | 추가 인물·문구·로고·불가능한 상태가 없는가? |
| `cameraCard` | entry frame이 size·angle·position·composition·focus를 따르고 movement가 하나뿐인가? |
| `actionReadiness` | 한 가지 행동이 가능한 시작 상태인가? |
| `adjacentContinuity` | 앞 exit/다음 entry, 축·화면 방향·좌석이 이어지는가? |

시퀀스도 `중복 내용`, `정보 누락`, `공간 연속성` 세 항목을 reviewer/note와 함께 `PASS`로 저장한다. 하나라도 pending/revise면 영상 생성을 누르지 않는다.

### 5 영상·결과

기본은 같은 공간·시간·축에서 이어지는 정확히 3샷을 10초 transport batch로 묶는 것이다. authored order의 `FRAME-*` 3장을 요청 순서대로 넣고 각각 3/3/4초 source intent를 기록하며 sealed sequence를 batch 전체에서 중복·누락 없이 한 번씩 덮는다. 정상 초기 계획은 9개 batch/27개 shot slot/90초 provider source coverage다. 오류 비용이 높은 샷은 새 entry frame과 재검수를 거쳐 first-last-frame(최소 4초 provider source) 또는 single-shot recovery로 분리할 수 있으나 baseline coverage에 자동 합산하지 않는다. 마스터는 Flow에 별도 업로드하지 않는다.

영상 prompt 첫 줄은 정확히 `Generate a single 10-second multi-shot video using the provided references.`다. 둘째 줄은 정확히 `All people appearing in every shot are realistic 3D ivory-toned mannequins with completely blank, featureless faces. Only faces and exposed skin use the ivory mannequin material. Preserve each character's exact clothing, clothing colors, accessories, body proportions, and seating shown in the corresponding reference image; do not remove, replace, recolor, or simplify the clothing.`다. 셋째 줄은 빈 줄이다. 이어 `[Shot 1]`, `[Shot 2]`, 필요하면 `[Shot 3]` 블록을 ordered sequence로 쓰고, 각 블록에 동일 camera card와 `START STATE / ONE ACTION / END STATE`를 넣은 뒤 `[참조 이미지: filename - Korean description]`으로 끝낸다. 공통 문장은 batch당 한 번만 쓰며 shot마다 반복하지 않는다. exact path/hash/tag/order는 packet·upload manifest에 둔다. provider 오디오는 버린다.

## 6. 10초 3샷 예시

실제 사건 순서는 승인된 semantic cut plan이 우선이다. 아래는 추월·차선 이동·감속 정지를 서로 다른 의미로 분리하는 설계 예시다.

| 요청상 순서 | 시작 이미지 | 한 행동 | 카메라 |
|---|---|---|---|
| Shot 1 | 두 차량이 같은 방향 인접 차선, 짙은 차가 뒤 | 짙은 차가 앞쪽으로 추월 | 두 차량 측면 와이드, locked-off |
| Shot 2 | 짙은 차가 아이보리 차보다 충분히 앞선 인접 차선, 두 차 모두 같은 방향 | 짙은 차가 아이보리 차 앞 차선으로 한 번 이동해 가로막음 | 차선이 보이는 높은 와이드, locked-off |
| Shot 3 | 짙은 차 앞·아이보리 차 뒤, 같은 방향·같은 차선 | 두 차량이 함께 감속해 정지 | 간격이 보이는 미디엄 와이드 |

세 시작 이미지는 각각 별도 파일이다. 첫 이미지에 추월 완료 상태를 그려 놓고 추월을 지시하지 않는다. 두 번째 이미지는 짙은 차가 이미 충분히 앞선 상태에서 차선 이동 직전이어야 하며, 세 번째 이미지는 짙은 차가 앞에 있고 아이보리 차가 뒤에서 감속을 시작하는 상태여야 한다. 세 shot의 source intent는 3/3/4초지만 실제 내부 경계와 최종 길이는 모든 provider 영상을 다운로드·보존한 뒤 source QA와 picture rough conform에서 정한다.

```text
[Shot 1] [style]. Camera: [complete camera card]. Start state: [state].
One observable action: [one action]. End state: [state].
[참조 이미지: frame-01.png - 첫 번째 샷 시작 구도]

[Shot 2] [style]. Camera: [complete camera card]. Start state: [state].
One observable action: [one action]. End state: [state].
[참조 이미지: frame-02.png - 두 번째 샷 시작 구도]

[Shot 3] [style]. Camera: [complete camera card]. Start state: [state].
One observable action: [one action]. End state: [state].
[참조 이미지: frame-03.png - 세 번째 샷 시작 구도]

Use the ordered uploaded images only as shot references. Do not claim native
first-frame binding. Use sequential full-screen shots; no collage, split
screen, extra people, vehicles, props, text, dialogue, music, morphing or
action reversal. Preserve axis, screen direction, seats and identity.
```

## 7. 생성 후 검사

모든 provider 영상을 먼저 다운로드하고 원본 bytes·SHA를 보존한 뒤 provider·모델·실제 길이·FPS·해상도·오디오, 내부 컷 경계, 각 샷의 시작·중간·끝 프레임을 기록한다. 다음을 순서대로 확인한다.

1. 인물·차량·소품이 마스터와 동일한가
2. 얼굴·머리카락·CAST 문구·새 인물·새 차량이 생기지 않았는가
3. 차량 앞뒤·차선·진행 방향·운전석·조수석이 맞는가
4. 한 샷에 한 행동만 있고 역방향·행동 재시작이 없는가
5. 샷 순서·상태·대본 의미가 맞는가
6. 다음 샷의 시작이 앞 샷 끝과 공간적으로 이어지는가

다른 캐릭터, 얼굴, 반대 진행 방향, 잘못된 조수석 자세, 동작 과밀, camera card 불일치, 내부 컷 순서 오류, CAST 문구, 대본에 없는 사건은 즉시 `REVISE`다. 실패한 샷의 새 entry frame을 ImageGen으로 만들고 재검수한 뒤에만 single-shot recovery를 쓴다. 변형된 결과를 새 canonical 마스터로 쓰지 않는다.

## 8. 확인된 범위와 중단 조건

로컬 v3 schema/compiler에 구현된 범위는 exact 대본·참조 파일, 샷별 entry frame과 camera card, 9개 검수 항목, 현재 sequence 애니매틱 hash, ordered 3샷/10초 batch와 3/3/4 source intent, 90초 초기 coverage plan, prompt/upload manifest hash, 다운로드·보존 선행 조건, Import/Export 무효화다. 다음은 별도 receipt 없이는 확인됐다고 쓰지 않는다.

- provider에 실제 reference가 native binding됐다는 사실
- `@ROLE_TAG`가 Flow 공식 태그라는 주장
- 10초 안에서 3/3/4초 shot 경계가 provider에서 그대로 생성됐다는 주장
- source semantic QA, production admission, 최종 render·upload·publication
- 자동 저장 및 Stage 07 인계

Import는 대본·에셋·샷 순서를 복원해도 이미지 연결과 검수 상태를 초기화할 수 있다. Import 직후 media ID를 다시 확인하고 검수를 새로 서명한다.

## 체크리스트

생성 전에는 승인 authority·컷 ID·카메라 카드·필요 마스터·샷별 `FRAME-*`를 확인한다. Flow에서는 대본·owner voice, entry frame 업로드 order, 카드·9개 검수·현재 sequence 애니매틱, 3샷/10초와 3/3/4 source intent 순서로 진행한다. 생성 후에는 모든 원본을 다운로드·보존하고 hash와 실제 컷 경계를 기록한 뒤, OpenCut에서 locked narration에 맞춰 통과한 구간만 최종 편집에 사용한다. first-last-frame은 최소 4초 source의 고위험/recovery 경로에서만 사용하고 single-shot은 새 entry frame과 재검수를 거친 복구 경로에서만 사용한다.

## 근거 문서

- 상위 계약: [newsroom-video-production.md](newsroom-video-production.md)
- 성공 루트: [NEWSROOM_VIDEO_SUCCESS_ROUTE.md](../../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md)
- 카메라·전환 연구: [report-source.md](../../01-research/camera-work-study-20260908/report-source.md)
- 마네킹 조사: [gemini-web-matte-mannequin-three-shot-research-2026-09-07.md](../sources/gemini-web-matte-mannequin-three-shot-research-2026-09-07.md)
- 프롬프트 조사: [gemini-web-matte-mannequin-prompt-pack-2026-09-07.md](../sources/gemini-web-matte-mannequin-prompt-pack-2026-09-07.md)
- Flow 검증: [VERIFICATION.md](../../06-production/opencut-automation/out/newsroom/flow-preview/cast-director-situation-20260908/VERIFICATION.md)
- 멀티레퍼런스 계약: [MULTI-REFERENCE-FLOW-CONTRACT.md](../../06-production/opencut-automation/out/newsroom/flow-preview/road-rage-multi-reference-pilot-20260908/MULTI-REFERENCE-FLOW-CONTRACT.md)

이 지침은 신규 v2 사전 제작 계약과 기존 Flow private preview의 운영 문서다. canonical 계약의 source admission·semantic QA·render·upload·publication 조건을 완화하지 않으며, provider 기능은 화면과 파일 receipt로 확인한 범위만 기록한다.
