# 뉴스룸 영상 제작 canonical contract

## 두 채널 공통 사전 제작실 (2026-09-23)

사용자 요청에 따라 `production-studio/`의 공통 소재·샷·대본 conform 계층을 내무습다와 쇼핑쇼츠가 함께 사용한다. 웹 화면은 Vercel의 `rnrwn1123-1967/production-studio-rnrwn1123` 프로젝트에 배포하며, 원본 파일·SQLite·FFmpeg·WISE와 기존 제작 엔진은 사용자의 로컬 PC에서 실행한다. 웹 배포는 영상 제작·검수·게시 승인을 의미하지 않는다. 공통 화면에서 생성한 항목은 **사전 제작 계획**이며 기존 사건·상품의 승인/거절/폐기 이력과 별도로 보존한다. 기존 내무습다 24fps/owner voice/제목 권위와 쇼핑 30fps/상품·옵션/선택 음성 권위는 각 엔진이 계속 검증한다.

공통 순서는 `대본 초안 → 문장별 소재 요구와 검색어 제안 → 공통 라이브러리·YouTube CC 후보·WISE 검색 → 권리 확인과 연속 구간 관측 → 샷 연결/현실 배경+2D 합성 미리보기 → 사실 보존 표현 conform → 기존 제작 엔진 인계`다. 문장 분리와 검색어 제안은 결정적 보조 도구이며 모델의 의미 분석 또는 독립 사실 검수로 주장하지 않는다. 소재 부족은 다른 소재·표현 제안·미해결 상태로 남기고 사건 사실, 순서, 수치, 법적 상태 또는 상품 효능·옵션을 바꾸지 않는다. conform의 운영자 확인도 기존 factual/legal/product 검수를 대신하지 않는다.

두 프로필의 원본/권리/샷 검색과 합성 구현은 같은 로컬 API와 라이브러리를 사용한다. 출처는 원본 바이트 해시와 귀속 문구를 보존하고 `local edit`, 변형, ImageGen 입력, Omni 입력 허용을 분리한다. CC 검색 결과의 표시는 후보일 뿐 항목별 권리 승인이나 원본 취득 권한이 아니다. 검색 API는 영상을 자동 다운로드하지 않는다. 실제 배경을 가공한 이미지·2D 합성·생성물은 실제 사건 현장 증거로 자동 승격하지 않는다.

Oxford VGG WISE는 확보한 로컬 미디어의 검색 계층이다. 실제 설치/서버/인덱스 상태를 표시하고, 연결되지 않았을 때 다른 검색을 WISE 결과로 표시하지 않는다. 검색 시간은 후보 위치이며 원본과 동일한 시간축, 등록된 출처 ID/해시와 연속 in/out 구간을 확인한 뒤 샷에 연결한다. 제공자 입력 권리가 없는 파일은 ImageGen/Omni로 전송하지 않는다.

공통 인계는 revision과 서버가 계산한 해시, 실제 소재 바이트, 출처·권리와 미해결 조건을 결합한 계획 패킷이다. 대본/소재/샷 변경은 이후 인계의 현재성을 무효화한다. 예전 승인을 복사하거나 production/provider/voice/render/upload/publication/Stage 07 gate를 자동으로 열지 않는다. 계약 스키마와 집중 테스트는 `production-studio/contracts/`, `production-studio/tests/`에서 관리하며 운영은 [공통 제작실 안내](../../production-studio/README.md)를 따른다.

## 쇼핑 쇼츠 독립 로컬 프로필 (2026-09-22)

사용자가 요청한 신규 쇼핑 쇼츠 앱은 `shopping-shorts/`의 `luna-browser-local-v1` 프로필과 `shopping-render-manifest-v2`를 사용한다. 이 절은 쇼핑 앱에만 적용하며 아래 기존 뉴스룸 계약과 사건별 승인·거절 역사를 변경하지 않는다. [구현 범위](../../shopping-shorts/README.md), [현재 Luna 작업 운영](../../shopping-shorts/OPERATOR.md), [신규 승인 이력](../../shopping-shorts/docs/DECISIONS.md)을 함께 따른다.

기본 실행은 현재 Codex Luna 작업의 Chrome Use/Computer Use 관측·의미 판단, FastAPI/React/SQLite 영속 큐와 로컬 FFmpeg다. 하위 에이전트·중첩 Codex·JEV 호출을 기본 경로에서 실행하지 않는다. JEV·WISE·클라우드 TTS와 분산 작업 계층은 별도 미검증 확장이다. 실제 사용 모델·표면·자료·관측은 운영자 진술로 보존하며 공급자가 서명한 실행 증명으로 주장하지 않는다.

상품/옵션/주장 근거 → 실제 원본·이용/취득 근거 → 정규화 30fps 마스터/동일 시간축 프록시/샷·프레임 관측 → claim/shot에 연결된 대본·제목 검수 → 초안 배치 → 선택한 목소리의 승인 beat별 음성 48kHz 실측 → frame/sample locked manifest → 1080×1920/30fps H.264/AAC 로컬 프리뷰 → 별도 사실/제품/화면/음성/자막 검수 → 출처·해시 포함 내보내기를 따른다. 기존 뉴스룸 24fps 레이아웃이나 owner voice/제목을 가져오지 않는다. 제품 근거가 불충분한 B-roll로 기능을 증명하지 않고, 영상·음성이 부족하면 자동 대체하지 않는다.

기록은 새 revision과 해시로 저장한다. 출처 철회·상품/대본/음성/관측 변경은 하위 권위를 무효화하고 파일 byte·현재 권한·근거·타임라인을 렌더 전후와 내보내기 때 재검사한다. `synthetic-test`와 production 프로젝트를 구분하며 합성 패턴/사인파/fixture 검수는 실제 상품·발음·Luna 실행의 증거가 아니다. 합성 검증 외 실제 프로젝트의 영상·제목·음성은 별도 승인 전까지 미확정이다. 구매·업로드·게시와 Stage 07은 이 앱으로 자동 승인되지 않는다.

이 페이지가 전체 영상 제작 계약의 단일 상위 기준이다. 실행 세부사항은 [단일 성공 루트](../../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md), 권리 조사 근거는 [실사 미디어 출처 카탈로그](../sources/real-media-source-catalog-2026-08-15.md)를 따른다.

## 현재 활성 권위

- 신규 생성 영상의 기본 제작 계약: `newsroom-imagegen-flow-i2v-v3` (2026-09-10). fact spine → 동일 owner/profile/settings의 승인 역사 녹음 발화율 분포 → 사실 보존 provisional timing draft → semantic shot/camera/ImageGen/animatic → 동결 Flow batch → source QA usable windows → OpenCut picture rough → semantic reconciliation → 표현 한정 final script conform → final owner narration lock → 한 번의 bounded audio conform → captions/title/BGM → final factual AV QA 순서다. Flow prompt bytes와 v27 역사 산출물은 불변이다. provider 실행과 실제 render/upload/publication은 별도 gate다.
- 신규 미확정 대본 생성은 input package schema `20`, authority `newsroom-autonomous-narration-v4`, generator `newsroom-autonomous-narration-prompt-v16`, independent critic `newsroom-independent-narration-critic-prompt-v6`, critique schema `newsroom-independent-narration-critique-v5`, active draft wrapper `newsroom-autonomous-script-draft-v7`, generation record schema `19`를 사용한다. 생성기는 검증 근거에 맞는 `suspense|curiosity-reversal|role-conflict|evidence-reversal|escalating-action|numeric-contrast` 중 하나와 narration, exact sentence claim refs만 작성한다. hook audit, narrative architecture, retention audit, 자기 평가는 권위가 아니다. 훅은 구체적 행동·위험·대비에서 시작해 사건 고유의 미해결 요소 하나를 남기되 exact 5초 claim bundle이나 보편 beat를 강제하지 않는다. 결말은 가장 강한 사건 고유의 검증 endpoint에서 직접 닫고 portable moral/question/reflection을 거절한다. 별도 critic은 대본을 수정·대체하거나 final authority를 만들 수 없으며 `factual-legal`, `audio-comprehension`, `narrative-progression`, `style-integrity` 네 finding과 `pass|revise|reject`만 반환한다. `pass`가 아니면 실행 전체를 원자적으로 reject하며 자동 rewrite·retry는 0이다. 코드 소유 claim lineage, 법률·surface, 70.0~80.0초 owner-rate estimate gate와 이후 실제 owner locked timing 권위는 유지한다. 생성 prompt는 경계 편차를 줄이기 위해 74~76초 내부 목표를 사용하고 package의 observed rate로 compact Unicode 문자 budget을 동적으로 계산한다(현재 6.87자/초에서는 공백 제외 509~522자). 이 내부 목표는 deterministic acceptance 범위를 바꾸지 않는다. 승인 스타일 corpus에는 사용자가 명시적으로 좋아한 road-rage 전체 대본과 hook만 positive reference로 기록하고, machine draft는 anti-pattern으로만 표시한다. reject response는 `newsroom-script-admission-rejection-v3`, 저장 감사 항목은 `newsroom-script-rejection-audit-v3`이며 기존 active/finalized authority를 보존한다. legacy v10~v15와 rejection v1~v2는 읽기 호환만 유지한다.
- 신규 활성 Stage 03은 input package schema `21`과 `newsroom-stage03-case-brief-v1`을 유지하면서 authority `newsroom-autonomous-narration-v8`, generator prompt v35, factual-legal critic prompt v18, critique v8, wrapper v12, generation schema 26, rejection v6/audit v12를 사용한다. 기존 generator 1회가 한국어 narration·exact sentence claim refs와 별도 영어 `storyText` 필드를 한 JSON 응답으로 반환한다. `storyText`는 같은 caseBrief에서 배경과 인물 관계, 발단, 행동과 선택, 갈등 고조, 확인된 결과를 잇는 2~5문단 영어 영화 줄거리 산문이며 문장 카드나 컷 지시가 아니다. 각 전환은 확인된 주체·대상·직전 상태 또는 출발 위치·행동 순서·결과를 구체적으로 연결한다. 원자료의 공간 표현이 시작·끝 위치, 방향, 거리나 궤적을 확정하지 않으면 그 표현을 복사·직역하거나 시각 경로를 발명하지 않고 여러 출처가 공통으로 확인하는 최소 행동까지만 명료화한다. 반복 등장인물은 첫 행동 전에 읽기 쉬운 로마자 이름·나이 또는 나이 범위·서로 색과 외곽선이 구별되는 복장을 설정하고 일관되게 유지한다. 반복 차량도 첫 움직임 전에 소유자와 서로 다른 색·차체 외형을 설정하며 이는 실제 차종·직업·지위의 증거가 아니다. 두 인물·차량이 나온 뒤에는 이름과 소유 차량 표현을 쓰고, 가능한 한 문장마다 주요 이동이나 행동 하나와 가시적 결과·다음 상태를 연결한다. 같은 물체는 동일성을 유지하고 확인 수준이 바뀌면 근거가 확인하는 주체·시점을 설명한다. 기준일이 불명확한 상대 날짜는 생략한다. 근거가 정확한 나이를 확인하면 이를 보존하고, 미확인 나이는 확인된 역할·학년·관계와 모순되지 않는 구체 나이 또는 범위를 영상 설정으로 정할 수 있다. 복장은 영상용 창작 설정일 뿐 사실 역할·직업·관계를 바꿀 수 없다. 이름·설정 나이·복장은 내부적으로 실제 신원이나 claim evidence가 아닌 영상 설정이며 narration이나 sentence claim에 들어갈 수 없다. 사용자용 본문에는 `fictional alias`, `visual setting`, `composite character` 같은 제작 라벨을 넣지 않는다. 경찰이 기관으로만 확인된 사건의 경찰 역할 이름은 내부적으로 합성 인물로만 취급하고 확인되지 않은 계급·대사·수사 행동·판단을 부여하지 않는다. 기존 factual/legal critic 1회가 narration과 storyText를 caseBrief 전체에 대조해 사실·법적 안전, 공간 의미, 인물·차량·물체의 의미와 시각 연속성을 함께 pass/reject하며 별도 story writer나 critic은 없다. 둘 중 하나라도 안전하지 않으면 전체 응답을 거절하고 기존 authority를 보존하며 attempted output을 append-only audit에 남긴다. 자동 rewrite·retry는 0이다. deterministic 65.0~80.0초 admission은 narration만 측정한다. creator는 두 필드에서 `narration.txt`와 `story-script.txt`를 각각 기록하며 결합 hash와 근거 ID는 내부 provenance에만 둔다. 장면 프롬프트는 대본 확정 후 별도 `scene-prompts` batch로 생성한다. 기존 한국어 storyText와 v32~v34 generation/reject history는 읽기 호환으로 보존한다.
- 활성 Stage 03 저장 planning mode는 `v21-narration-with-story-text`다. 이전 planning mode는 legacy 기록 해석에만 남는다.
- Flow Storyboard Studio용 시각 전개는 같은 generator 응답의 `storyText`를 서버가 `newsroom-story-script-v1`로 결합한다. exact authority SHA와 narration UTF-8 SHA는 내부 provenance이며 사용자용 텍스트에는 문장·claim ID, hash, 컷, 시간, 카메라나 에셋 지시 또는 제작용 가명 라벨을 넣지 않는다. legacy accepted storyText의 원문과 hash는 감사 근거로 보존하고, 화면·복사용 `plainText`만 허용된 제작 라벨을 결정적으로 제거한 표시 투영이다. 통과한 미확정 결과는 `draft-preview`이고, 내용이 같은 대본을 저장·확정하면 재생성 없이 `final-script-planning-only`로 다시 결합한다. 이 계획본은 cut·duration·locked owner timing·storyline·production/provider 권위를 만들지 않으며 복사용 일반 텍스트는 문서화되지 않은 Flow 문법이나 API 계약을 주장하지 않는다.
- Codex structured-output에 전달하는 모든 object schema는 `additionalProperties=false`이며 선언된 모든 property를 `required`로 닫는다. 의미상 선택적인 critic `exactQuote`는 빈 문자열 sentinel을 사용한다. persisted critic timing도 initial/final advisory estimate의 exact closed shape를 가진다.
- Stage 03 Codex 실패는 `generator-cli|generator-output|critic-cli|critic-output` 단계로 구분한다. 진단에는 exit/signal, bounded·redacted 오류 줄과 임시 output의 존재·바이트·JSON 여부만 허용하며 prompt, raw/model data, 로컬 경로, URL, credential은 남기지 않는다. SQLx slow-query 경고 단독은 원인으로 취급하지 않는다. 실패 run의 자동 재시도는 계속 0이다.
- storyline/cut: `newsroom-storyline-v2` → `newsroom-semantic-cut-plan-v2`
- 실사 요구/취득: `newsroom-real-media-needs-v1` → `newsroom-real-media-acquisition-admission-v1`
- authoritative coverage: `newsroom-real-media-duration-coverage-v1`
- 실사 admission projection seam: `newsroom-real-media-admission-projection-v1`
- 보존된 Grok 경로의 생성 컷 권위는 `paper-cut-grok-storyboard-v2`다. `paper-cut-keyframe-v1`은 신규 작업에서 fail-closed이며, 이력의 Grok-only 입력 제약은 아래 신규 ImageGen/Omni 기본 경로를 덮어쓰지 않는다.
- 신규 기본 경로는 `newsroom-fact-spine-v1`과 `newsroom-owner-speech-timing-model-v1`을 재검증한 뒤 `newsroom-full-visual-storyline-v1` → `newsroom-imagegen-reference-catalog-v1` → `newsroom-flow-situation-board-v3`를 컴파일한다. v2와 이전 packet은 역사 경로이며 어느 planning 계층도 provider 실행 권위는 아니다.

## ImageGen / Flow·Omni I2V 신규 기본 계약 (2026-09-10)

이 절은 신규 생성 영상의 제작 방향에 관하여 아래 과거 hybrid/Grok/Flow pilot 기본값을 대체한다. Stage 03 narration·storyText와 factual/legal critic, 개별 사건의 승인 권위, 봉인된 cut ID/order/evidence/duration, 원자료·거절물 보존, provider·QA·render·publication의 별도 gate는 유지한다. 기존 실사 0.80 coverage는 해당 hybrid 계약을 선택한 기존 프로젝트의 조건이며 새 생성 영상에 실사 비중이나 실사 증거성을 부여하지 않는다.

v3는 locked narration을 Flow 전제에서 제거한다. news/legal fact spine을 먼저 잠그고, 승인된 역사 owner 녹음 두 개 이상의 문장별 발화율 분포로 provisional timing을 만든다. 초기 picture source coverage는 최종 런타임이 아니라 **9개 표준 Flow batch × 10초 = 90초**로 계획하며, 각 batch는 정확히 3개 shot을 `[3.0, 3.0, 4.0]`초 source intent로 배분한다. first-last-frame은 고위험 shot/recovery 전용 보조 경로이고 provider source 최소 4초를 요구하며 90초 baseline에 자동 합산하지 않는다. Flow prompt는 v2에서 확정된 exact header/mannequin/reference 형식과 batch UTF-8 bytes를 그대로 동결한다. 모든 provider source 영상을 먼저 다운로드·보존·해시한 뒤 source QA와 OpenCut picture rough를 진행한다. picture rough는 usable window를 골라 줄이는 편집 결과이며 90초나 10초 배치를 최종 런타임으로 승격하지 않는다. semantic unit마다 `reshoot|trim|visual-bridge|script-expression-conform`을 결정한다. final script conform은 연결어·중복·표현만 바꿀 수 있고 사실·순서·수치·법적 상태·claim lineage는 바꿀 수 없다. 그 대본으로 최종 owner narration을 승인·잠근 뒤 0.95–1.05 범위 audio conform을 최대 한 번 시행한다. captions/title/BGM과 factual AV QA가 모두 통과해야 `renderEligible=true`가 되며 실제 production flag는 계속 별도 권위다.

1. **fact spine과 timing draft**: news/legal 근거의 semantic unit·사실·순서·수치·법적 상태를 먼저 잠근다. 동일 owner/profile/settings의 승인 역사 녹음 두 개 이상에서 문장별 발화율 분포를 만들고, fact spine을 보존한 provisional timing draft를 봉인한다. 이 draft는 ImageGen·애니매틱·Flow planning 권위이며 final owner narration이나 final timing 권위가 아니다.
2. **공간과 ImageGen 이미지**: 시퀀스별 장소·시기·도로/건물 구조·재질·자연광·촬영축을 정하고 필요한 인물·차량·소품·배경 마스터만 ImageGen으로 만든다. 각 샷의 시작 이미지는 실제 선택한 마스터와 장소 근거로 ImageGen이 만든 하나의 구도·한 순간이다. 모든 생성 이미지와 생성 prompt, 선택 입력과 근거는 physical nonsymlink contained bytes/SHA로 결합한다. Omni는 이미지 제작·배경 재설계를 담당하지 않는다.
3. **현실 배경과 출처**: 장소 기준표와 실제 지역 자료를 사용하되 source-use, 변형, ImageGen 입력, downstream Omni 이용 권리를 각각 확인한다. 사진을 입력했다면 그 lineage를 배경·시작 이미지까지 보존한다. 권리 불명 자료를 생성 이미지로 가공해 제한을 우회할 수 없다. 허가된 사진을 못 구한 경우 업로드 없는 지역 사실·관찰 기준표로 일반적 재현을 만들 수 있다. 생성된 장소·인물·동작은 실제 현장·신원·사건 증거·semantic QA의 권위가 아니다.
4. **한 행동·카메라 카드·연결**: 모든 샷은 시작 상태, 주체·동작·대상·관찰 결과, 끝 상태와 닫힌 `cameraCard`를 갖는다. 필수 필드는 `size`, `angle`, `position`, `composition`, `movement`, `axis`, `screenDirection`, `seat`, `focus`, `startState`, `endState`다. `movement`는 `locked-off`를 포함해 정확히 한 종류만 선언하며, 좌석이 없는 장면도 `seat=not-applicable`을 명시한다. 카드의 시작/끝 상태는 샷의 상태와 정확히 같아야 한다. `actionCount=1` 선언은 의미 검수 증거가 아니다. 앞 exit와 다음 entry, 장소·진행 방향·촬영축을 검수하고 entry frame과 같은 camera card를 애니매틱과 Flow prompt에 사용한다.
5. **ImageGen entry frame과 애니매틱 gate**: ImageGen은 각 camera card의 `size/angle/position/composition`을 그대로 반영한 행동 직전의 `entry-frame-reference` 한 장을 만든다. 선택 파일의 contained relative path, bytes, SHA-256, asset ID, role tag와 order를 결합한다. 사람·차량·좌석·소품·행동 준비 상태·초점·축·화면 방향·추가 문구와 인접 연속성을 사람 검수하고, 현재 sequence signature와 provisional timing draft를 결합한 애니매틱을 승인한다. fact spine·timing model·이미지·카드·순서가 바뀌면 이 검수와 애니매틱은 무효다.
6. **기본 Flow transport**: 초기 계획은 9개 표준 batch로 90초 picture source coverage를 확보한다. 각 batch는 정확히 10초이며 authored order의 정확히 3개 shot을 `[3.0, 3.0, 4.0]`초 source intent로 묶는다. prompt 첫 줄은 정확히 `Generate a single 10-second multi-shot video using the provided references.`, 둘째 줄은 정확히 `All people appearing in every shot are realistic 3D ivory-toned mannequins with completely blank, featureless faces. Only faces and exposed skin use the ivory mannequin material. Preserve each character's exact clothing, clothing colors, accessories, body proportions, and seating shown in the corresponding reference image; do not remove, replace, recolor, or simplify the clothing.`, 셋째 줄은 빈 줄이다. 그 뒤 ordered `[Shot n]` 블록만 쓰며 각 블록은 동일 camera card, 한 행동, 시작/끝 상태를 담고 `[참조 이미지: filename - Korean description]`으로 끝난다. 공통 문장은 batch당 한 번만 쓰고 shot마다 반복하지 않는다. exact path/hash/tag/order는 prompt가 아니라 packet·upload manifest·handoff manifest에 결합한다. 10초와 3/3/4 배분은 provider source 요청 intent이며 내레이션 또는 최종 컷 시간 권위가 아니다. 여러 이미지를 업로드했다는 사실만으로 후속 샷의 native first-frame binding을 주장하지 않는다. actual submitted UTF-8 prompt, 업로드 순서/media receipt, model/surface/aspect/duration/resolution을 보존한다. first-last-frame은 고위험 shot/recovery에서만 사용하며 provider source 최소 길이는 4초다.
7. **다운로드 후 picture-first conform과 최종 음성**: Flow/first-last-frame provider 영상을 전부 다운로드한 뒤 exact bytes, hash, decoded duration/dimensions/FPS/audio를 보존한다. 그 이후에만 source QA에서 usable continuous window를 고르고 OpenCut에서 picture rough를 만든다. 90초 source coverage는 충분한 편집 재료를 확보하기 위한 목표이고 최종 런타임은 아니다. semantic unit마다 `reshoot|trim|visual-bridge|script-expression-conform`으로 reconciliation한다. final script conform은 연결어·중복·표현만 바꾸며 fact spine·claim lineage를 보존한다. 그 대본으로 최종 owner narration을 승인·잠근 뒤 0.95–1.05 audio conform을 최대 한 번 시행한다. captions/title/BGM과 final factual AV QA가 모두 통과해야 render eligibility가 열린다. provider audio를 폐기한다.
8. **복구와 독립 gate**: 오류 비용이 높은 샷을 batch 전에 분리하거나 multishot source QA에서 실패한 샷을 복구할 때만 같은 파이프라인의 `single-shot-i2v`를 사용한다. 실패한 entry frame을 그대로 재사용하지 않고 새 버전을 ImageGen으로 만들며 camera-card/샷/인접 검수와 현재 sequence 애니매틱 승인을 다시 받는다. 그 뒤 실제 surface가 한 장을 native first frame으로 받았다는 receipt가 있을 때만 해당 binding을 주장한다. 정상 batch와 거절 source는 보존하고 자동 provider retry는 하지 않는다. provider, source admission, semantic QA, derivative/render, upload, publication, Stage 07와 continuation은 개별 gate다.

Flow 인계본은 역사본을 이동하거나 수정하지 않고 deliverable root에 검증된 사본으로 만든다. root에는 `README.md`, `SHA256SUMS.json`, `shot-images/`, `flow-prompts-and-shot-plan/`(combined `.txt`·`.json`·`.md` 각 하나와 `flow-ready-batches/B1.txt`…`Bn.txt`), `infinite-canvas/`, `base-reference-assets/{people,vehicles,props,backgrounds,generation-records}/`와 base manifest, `manifests-and-verification/`가 있어야 한다. `shot-images/`의 활성 이미지 수는 고정값이 아니라 plan shot count와 정확히 같고, batch 파일 수도 plan batch count와 같다. reference manifest는 사용·미사용 여부, provenance와 exact hash를 모두 보존한다. 물리 nonsymlink 파일, manifest, 전 파일 checksum을 검증하기 전에는 Flow submission gate를 열지 않는다.

현재 v27 Flow 10초 캔버스는 **provisional planning/manual-evaluation**이다. owner 음성 합성은 발음 gate에서 fail-closed되어 acceptance가 `false`이고, S14–S17은 측정값이 아닌 추정 발화율이며 총 62.933초로 활성 65–80초 admission에 못 미친다. S03·S04·S05·S07·S14·S16·S17의 계획 길이도 3.5초를 넘는다. 따라서 현재 이미지·프롬프트·캔버스는 카메라/행동 검토에는 쓸 수 있지만 locked timing, sealed cut plan, provider submission 또는 production source 권위를 만들지 않는다.

현재 로컬 구현 범위는 사전 제작 계획·파일/권리/검수 결합과 요청 대조다. 실제 Omni 호출 또는 live Flow builder 배포를 수행하는 자동 provider adapter는 이 변경에 포함되지 않는다. 기존 파일럿의 잘못된 I2V 라벨/R2V payload, 좌석 반전과 미해결 두 차선 이동은 [실패 진단](../../06-production/opencut-automation/out/newsroom/flow-preview/guide-first-two-20260908/DIAGNOSIS-20260908.md)에 남긴다. 모델별 기능과 제작 사례, 배경 출처의 근거는 [2026-09-10 조사](../sources/imagegen-omni-image-to-video-research-2026-09-10.md)를 따른다.

### v27/v13 script-first baseline approval (2026-09-06)

사용자는 2026-09-06에 `newsroom-autonomous-narration-v8`의 v27 generator와 v13 independent factual/legal critic을 대본 생성 기준선으로 승인했다. 이 승인은 대본 생성 로직의 범위에만 해당하며, 개별 사건의 final script·title·owner voice·provider·render·publication을 승인한 기록이 아니다. 활성 기준은 65–80초 deterministic gate와 70–73초 내부 목표, Codex CLI generator 1회와 read-only critic 1회, 자동 rewrite/retry 0회다. road-rage reference는 도입·전개의 구체 행동 순서만, coffee와 Jeju reference는 공감형 결말의 연결 감각만 사용하며 사실·역할·수치·사건을 교차 주입하지 않는다. 사실 문장의 claimRefs는 직접 근거이고 공감·규범·질문 문장의 claimRefs는 현재 사건의 확인된 물건·공간·관계를 가리키는 context anchor다. 승인 당시의 append-only 6건 결과와 원문은 [v27 final review](../../06-production/opencut-automation/out/newsroom/draft-runs/v27-final-review-20260906T085125331Z.md)에 보존한다.

## 보존된 v13 hybrid 순서

1. 승인된 뉴스·법률 검토, final 대본, 두 줄 제목, owner narration과 locked timing을 다시 확인한다. stale/superseded 음성·제목 또는 Edge-TTS/비-owner 대체는 중단한다.
2. exact authority SHA를 묶은 `newsroom-storyline-v2`를 승인하고, 그 storyline과 locked narration만으로 path-free `newsroom-semantic-cut-plan-v2`를 봉인한다. cut ID·순서·개수·evidence subspan·duration intent는 이때 고정된다.
3. 그 뒤에만 모든 컷을 `actual-case-evidence`, `institutional-context`, `generic-stock`, `grok-generated` 중 하나로 분류한 `newsroom-real-media-needs-v1`를 승인한다.
4. 실사 파일·권리·위험·처리 계획과 cut→asset 결합을 `newsroom-real-media-acquisition-admission-v1`로 승인한다. 동일 사진 재사용은 가능하지만 매 컷의 exact asset ID/SHA/rights가 결합돼야 한다.
5. `sum(admitted real-media cut authored durations) / sum(all active authored durations) >= 0.80`을 creator와 독립 verifier가 재계산한다. locked timing 또는 sealed cut plan이 없으면 `approved=false`다. 사진 수·beat 수와 과거 80/80/90은 연구용 provisional 지표일 뿐 production authority가 아니다.
6. 실사 컷은 admitted 사진만 로컬 FFmpeg crop/pan/zoom/overlay로 편집한다. `grok-generated` 컷에만 승인 rough + character master 0–3개 → ImageGen color storyboard → Grok one-storyboard-image 규칙을 적용한다.
7. 현재 코드는 실사 admission을 path-free projection으로 봉인하지만 hybrid local-media compiler는 아직 `deferred`, `continuationAuthorized=false`다. 기존 all-storyboard v12 compiler가 실사를 Grok에 보내거나 production을 자동 계속할 수 없다.

## source use와 provider input

`sourceUseStatus`와 `providerInputStatus`는 서로 다른 필수 필드다. 실사 사진은 기본 `providerInputStatus=denied`/local-edit-only다. CC0·PD·CC BY라도 Grok 업로드를 자동 허용하지 않는다. AI 처리·보관·학습을 모두 명시적으로 허용하는 권리, 적용 약관 버전, 데이터 설정 증빙, 별도 human gate가 있어야만 provider input을 승인할 수 있다. xAI consumer terms(2026-06-26)는 입력에 광범위한 사용·저장·수정·파생·제품개선 권리를 받고 업로더에게 모든 권리와 인물 동의를 보증하게 한다. AUP(2026-08-14)는 승인되지 않은 bot/script 접근도 금지한다. Source: [xAI Terms](https://x.ai/legal/terms-of-service), [xAI AUP](https://x.ai/legal/acceptable-use-policy), captured 2026-08-15.

## 권리·증거 gate

- 자동 source-use 후보: CC0, Public Domain, CC BY, 공공누리 1유형, 명시적 미국 연방정부 PD. CC BY-SA는 share-alike human review 후 conditional이다.
- NC, ND, unknown, usage-conditions, KOGL 2/3/4는 이 상업·편집 경로에서 deny한다. AFP/Shutterstock/Alamy는 해당 item의 written clearance 없이는 deny한다.
- aggregator(Openverse, Europeana, DPLA)는 discovery-only다. origin item URL과 origin 권리문이 없으면 deny한다.
- 각 asset은 `itemUrl`, `originUrl`, `rightsUrl`, exact rights statement, license URI/version, provider, query, `retrievedAt`, response/source SHA-256을 보존한다. original과 Lanczos derivative는 physical nonsymlink contained realpath, bytes, SHA-256으로 재검증한다.

## 해상도·변형 gate

최소 변 480px 미만은 자동 거절하지 않고 original을 보존한다. `usageMode=element|full-frame`, requested display pixels, 계산된 upscale factor를 기록한다. Lanczos derivative를 별도 hash한다. 1.5× 이하는 기본 허용, 1.5× 초과 2× 이하는 human visual QA, 2× 초과 또는 AI/SR은 별도 human QA가 필요하다. 2× 초과 파생본은 증거 text·identity·trademark detail을 세울 수 없다. AI/SR 등 generative-altered asset은 실사 80% coverage에서 제외한다.

## 사람·사건·상표 gate

`recognizablePerson`, `minor`, `sensitiveParty`, `privacyPublicity`, `trademarkLogo`, `artwork`, `property`, `geographicMismatch`, `casePartyImplication`을 독립 boolean으로 기록한다. 사람은 blanket reject하지 않고 개별 권리·맥락 QA를 한다. 손이 보이는 phone 사진은 `unrelated illustrative photo` 표시를 조건으로 사용할 수 있다. 역사적 외국 병동은 현재 사건의 시간·지역 증거에서 deny한다. Roundup 사진은 로컬 crop/mask/blur와 unrelated label 후 conditional이며 generative replacement는 coverage에서 제외한다. 서로 다른 지역 사건으로 asset을 cross-bind하지 않는다.

## 생성 컷과 provider 이후

생성 컷은 승인 color storyboard 정확히 한 장만 Grok에 보낸다. rough, character, 실사, 환경, 소품, 문서, 지도, diagram 등을 추가 업로드하지 않는다. Grok source는 square/min-edge-480/about-6s exact bytes를 보존하고 독립 semantic QA가 authored duration ±0.05초의 연속 window를 고른다. 통과 후 FFmpeg가 audio를 제거하고 Lanczos 480×480/24fps derivative를 만든다. 최종 assembly 권위는 1080×1920/24fps, media `54,474,972,972`, title `x=540,y=201/326`, captions `x=540,y=1400`이다. Provider/render/upload/publication/Stage 07은 항상 별도 gate다.

Source: [NEWSROOM_VIDEO_SUCCESS_ROUTE.md](../../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md), [real-media helper](../../06-production/opencut-automation/scripts/newsroom-real-media-admission.mjs), [source catalog](../sources/real-media-source-catalog-2026-08-15.md), [AGENTS.md](../../AGENTS.md).

## Real-photo diversity gate (v2 successor)

Photo discovery is storyboard-first: search only after the sealed per-cut need exists, and every assignment is keyed by the composite `storyId:cutId`. Each real-media cut must receive a distinct primary source by default; at most one cut may reuse a primary unless continuity is independently attested. Every story must retain at least a 0.90 unique-primary ratio. Exact source SHA-256 and perceptual-hash duplicate checks are mandatory; a derivative never creates a new primary. Duration coverage cannot approve an admission that fails these diversity gates. The append-only v2 acquisition/checkpoint artifacts preserve failed partials and remain non-admitted until a complete successor admission and independent verifier pass.

## 국내 사진 전용 gate (v3 successor)

신규 3편의 실사 수집은 `newsroom-real-media-needs-v3-domestic-only`를 따른다. 실사 컷은 `originCountry=KR`, `captureCountry=KR`, `rightsholderCountry=KR`가 모두 항목 단위 증거로 확인되어야 한다. 국내 사이트에 올라온 해외 촬영물이나 해외 aggregator/Commons에 올라온 한국 피사체는 국내 사진으로 계산하지 않는다. 자동 허용 권리는 공공누리 0·1유형, 국내 권리자의 CC0·Public Domain·CC BY, 또는 국내 권리자의 서면 허가뿐이다. 각 asset은 국내 기관명, 상세 페이지 SHA-256, 국가 판정 근거를 `evidence.domesticOrigin`에 보존한다. 이전 Wikimedia 46장은 삭제하지 않고 감사 증거로만 유지하며 이 국내-only 경로에서는 모두 부적합이다. 국내 실사 46개가 컷별 1:1로 확보되고 독립 검증되기 전에는 admission, provider, render, upload, publication, Stage 07을 진행하지 않는다.

Sources: [KOGL license guide](https://www.kogl.or.kr/info/license.do), [Korean National Police copyright policy](https://www.police.go.kr/www/guide/copyright.jsp), captured 2026-08-15.

## Newsroom photo risk v1 (v5 successor)

위의 `국내 실사 46개 컷별 1:1`은 보존된 v3 감사 기준이며 신규 배정의 활성 규칙은 이 절이 대체한다. 사진은 `SAFE`, `CONDITIONAL_EDITORIAL_ILLUSTRATIVE`, `HIGH_RISK_DENY`로 분류하고 `copyrightUseStatus`, `editorialContextStatus`, `youtubeOriginalityStatus`, `claimRisk`를 분리 기록한다. 조건부 사진이 duration coverage에 들어가려면 내레이션 개념 일치, 화면 내 `자료사진 · 사건과 무관`, 실제 증거·현장·당사자 주장 금지, 사인·미성년자·피해자·피의자 식별 금지, 항목별 권리·출처·claim rationale, provider 입력 거부와 local-only 편집을 모두 충족해야 한다. 현재 기기 장면은 2020년 이후여야 하고, 연도 불명·2020년 이전 자료는 기술·장소·당사자를 주장하지 않는 시대 불변의 일반 사물·환경에 한해 시각적 시대 오류 검토 후 조건부로만 쓴다.

같은 source primary는 continuity rationale과 서로 다른 authored framing이 있을 때 연속 2컷까지만 허용한다. 비연속 재사용, 한 source가 story duration의 15%를 넘는 사용, derivative를 새 primary로 세는 행위는 금지한다. coverage 사진은 충분한 내레이션과 authored crop/pan/zoom/annotation을 요구하며 정적 슬라이드쇼·최소 편집은 통과하지 못한다. story별 authored-duration coverage가 0.80 미만이거나 어느 gate라도 실패하면 승인하지 않는다.
### v5 finalization checkpoint (2026-08-15)

Append-only creator rerun: `run-20260815T162235412Z-7840eb`. Independent verifier mode is `independent-policy-reimplementation`; admission-with-contact-sheets SHA-256 `83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1`, verifier SHA-256 `81c1aae0667574addf3b53f04889153f6fcd8b2e9cae77d5574db3b4868bde19`.

Per-story authored-duration coverage: police-father `28.955/55.016 = 0.526301` (6 remaining real-photo cuts); jeju-school-intrusion `17.920/50.773 = 0.352943` (9 remaining); nurse-pesticide-coffee `22.962/48.794 = 0.470591` (7 remaining). All remain below 0.80, with `approved=false`; provider/render/upload/publication/Stage 07 and continuation remain false. Film-camera, optical-disc, feature-phone, CRT, old-document and pre-2020 current-device classes are deny-only. Contact-sheet hashes and visual-review attestations are independently checked.

## Sequence-first / radio-edit successor (v6)

The next visual pass starts from the locked owner narration (radio edit), then
the sealed `newsroom-semantic-cut-plan-v2`; visual planning cannot change
titles, narration, storyline, cut IDs, order, or duration intents. The successor
schema `newsroom-sequence-first-radio-edit-v1` separates semantic units,
editorial visual blocks, and unique source assets. Every block declares one
role: `evidence`, `context`, `explanation`, or `rhythm`. Evidence claims must
bind to actual evidence; generic context is explicitly labelled `자료사진 · 사건과 무관`.

One admitted source may cover contiguous cuts when continuity is attested and
authored treatments differ (`full`, `crop`, `pan`, `zoom`, `annotation`). The
quality measure is authored screen-time coverage, not asset count, and no
fixed photo-per-cut or 0.90 unique-primary ratio is imposed. Rights/privacy,
provider-local-only and YPP transformation gates remain fail-closed.

### Coverage/evidence split successor (v7)

The visual assembly successor may reuse the 12 admitted domestic assets as
generic context across additional contiguous semantic phases. It records
`photoScreenTimeCoverage` independently from `evidenceCompleteness`, so an
illustrative background can cover authored screen time while an exact-evidence
claim remains unresolved. Such a cut carries an
`evidenceOverlayRequirement` with `status=unresolved`; it is never presented
as the case evidence. Blocks are segmented by semantic phase (at most two cuts)
and rotate authored treatments to satisfy YPP transformation. The latest
successor reaches truthful photo screen-time coverage above 0.80 for all three
stories, while evidence completeness remains false for 6/9/7 unresolved gaps.

### v5-preserving successor (v8)

`newsroom-sequence-first-radio-edit-v3` preserves every original v5 admitted
asset on its original cut IDs. Only formerly blocked cuts receive an adjacent
phase-compatible contextual asset; the verifier fails closed if any admitted
assignment is replaced. The photo-screen-time/evidence-completeness split and
all rights, privacy, local-only, transformation, and publication gates remain.

## 65–80초 full-storyline / Gemini planning successor (v9)

뉴스 수집·사건 조사 뒤 approved legal review, final script, approved two-line title, owner narration과 locked timing, current supersession reconciliation을 exact storyId/SHA로 묶은 `newsroom-v9-entry-authority-v1`을 먼저 재확인한다. 임의 title hash, stale/superseded authority, 비-owner voice, unresolved conflict는 중단한다. 그 뒤 `newsroom-storyline-v2` → path-free `newsroom-semantic-cut-plan-v2`를 봉인하는 기존 순서를 유지하고, `newsroom-full-visual-storyline-v1`이 65–80초 9:16 전체 visual arc와 sequence, 모든 sealed cut의 camera/action 및 entry/exit state ID와 내용을 기록한다. `continue`는 이전 exit state ID와 내용이 다음 entry state와 정확히 같아야 하며 prompt도 hard cut을 강제하지 않는다. visual planning은 승인 사실·제목·음성·cut ID/order/evidence subspan/duration을 바꿀 수 없다.

ImageGen storyboard·인물·장소·소품·동물·style·entry-frame은 `newsroom-imagegen-reference-catalog-v1`에 physical nonsymlink bytes/hash와 실제 decoder로 확인한 dimensions/MIME, 생성 model과 prompt bytes/hash를 보존한다. role마다 허용 influence scope는 하나로 고정하며 verifier가 creator를 canonical reconstruction하고 compiler 직전에 파일을 다시 읽는다. 모두 `non-authoritative-reference-only`이며 사실, 실제 인물 신원, 사건 증거, semantic QA, provider echo의 권위가 아니다. `newsroom-gemini-multishot-prompt-batch-v1`은 선택 reference의 1-based ordinal, role, exact hash/bytes와 influence scope를 봉인하되 Gemini Web 비공식 tag 문법은 저장하지 않는다.

각 Gemini batch는 같은 sequence의 sealed cut 1–3개를 6–10초 source intent로 묶고 전체 cut을 정확히 한 번 순서대로 cover한다. 4/3/3은 비결정적인 provider shot intent일 뿐 final timing이 아니다. final cut은 계속 2–3초이며 봉인된 필수/마지막 문장 경계만 1.5–3.5초 예외다. compiler가 full storyline의 승인 prompt/camera/action만으로 web prompt exact UTF-8 bytes/SHA를 만든다.

수동 평가 source는 별도 canonical `newsroom-gemini-web-operator-attestation-v1`과 physical screenshot receipt를 입력받아 `newsroom-gemini-web-source-capture-v1`으로만 import한다. CLI는 attestation의 prompt SHA나 upload order를 대신 만들어 주지 않는다. surface/model, prompt SHA, reference upload ordinal/ID/hash/bytes, receipt hash, operator statement, physical source hash/bytes와 decoded 9:16 duration/FPS/audio를 확인하되 이는 provider 내부 사실의 절대 증명이 아니라 human-attested record다. `newsroom-gemini-multishot-semantic-qa-v1`은 requested와 ordered/non-overlap observed window를 분리하고 selected start/end를 포함한 unique timestamp/file frame evidence를 source MP4에서 deterministic FFmpeg로 재생성·대조한다. 실제 decoded frames, semantic match, visible change, continuity, no-reversal을 독립 검증해 authored duration ±0.05초의 연속·비중첩 window만 선택한다. reference/provider echo는 QA evidence가 아니며 provider audio는 폐기하고 owner narration만 쓴다.

현재 구현은 planning/compiler/manual evaluation import/semantic QA뿐이다. Gemini 호출, production source admission, derivative/render/upload/publication/Stage 07/continuation은 모두 `false`이며 별도 provider gate와 사람 승인 전에는 실행하지 않는다.

## Gemini Web 무광 마네킹 단일 파일럿 (2026-09-07)

사용자는 2026-09-07에 무광 마네킹 3D 콘셉트의 일관성을 확인하기 위한 Gemini Web fictional 3-shot 파일럿 1회를 명시적으로 승인했다. 이 승인은 `research-65b3c6b9444d9499`의 73.537792초 owner-voice paused preview와 27컷 provisional scene plan을 변경하거나 final script·title·voice·storyline·semantic cut plan·production source로 승인하지 않는다. 파일럿 쇼트는 2.7/2.6/2.7초의 별도 걷기·시점 전환 테스트이고 본편 cut coverage를 주장하지 않는다.

재사용 가능한 `newsroom-gemini-web-mannequin-pilot-input-v1`은 1–5개 reference와 1–3개 fictional shot intent를 받는다. 현재 패킷은 `FRAME-S01-v1`, `CHAR-M01-v1`, `CAR-A-v1`, `CAR-B-v1` 네 이미지를 exact upload ordinal로 결합하고, 각 생성 prompt의 physical bytes/SHA와 실제 이미지 bytes/SHA/dimensions를 보존한다. 방향이 어긋난 `FRAME-S01-rejected-direction-v1`은 감사 이력으로만 남고 active input에 들어가지 않는다. 작성 의도 prompt와 Gemini Web DOM에 실제 입력한 submitted prompt를 별도 파일과 SHA로 보존하며 provider 실행은 submitted bytes만 결합한다.

관찰 당시 Gemini Web에는 Omni 안내, Flash 모드, 9:16 선택이 보였지만 duration control은 관찰되지 않았다. 따라서 8초는 request intent이고 지원 사실이 아니다. 다운로드 원본을 `newsroom-gemini-web-mannequin-pilot-source-capture-v1`로 import할 때 ffprobe가 실제 duration/dimensions/FPS/audio와 SHA를 기록하며, 한 결과가 8초에 가까워도 일반적인 provider 지원 증거로 승격하지 않는다. 별도 `newsroom-gemini-web-mannequin-pilot-shot-qa-pending-v1`은 independent shot QA를 pending으로 유지한다. source admission, derivative, render, upload, publication, Stage 07, continuation과 전체 final approval은 모두 `false`다.

기능 조사와 prompt 설계 근거는 [Gemini Web 무광 마네킹 3-shot 조사](../sources/gemini-web-matte-mannequin-three-shot-research-2026-09-07.md)와 [복사용 prompt pack](../sources/gemini-web-matte-mannequin-prompt-pack-2026-09-07.md)에 보존한다.

## 얼굴 없는 대본 기반 Gemini 검토 프리뷰 (2026-09-07)

사용자가 무광 마네킹의 얼굴 형상을 제거하고 승인된 road-rage 대본의 전체 흐름을 검토하기 위해 요청한 별도 프리뷰 경로다. `newsroom-gemini-faceless-review-input-v1`은 모든 인물에 `smooth continuous blank matte face with no facial geometry`를 요구하고, 두려움·분노 같은 감정은 얼굴 표정이 아니라 몸의 기울기·팔 동작·보폭으로 표현한다. 이는 Gemini provider source를 본편 cut evidence로 승격하지 않으며, 기존 provisional 27-cut plan·paused owner voice를 수정하지 않는다.

`newsroom-gemini-faceless-review-v1`은 생성 source와 prompt/capture hash, operator가 선택한 24fps source window, 누락 컷을 기록한다. 모든 컷에 source window가 없으면 `partial-missing-source-windows`로 멈추며 coverage를 추정하지 않는다. 완전한 window map만 `1080x1920/24fps` review assembly를 만들고, provider audio는 폐기한 뒤 기존 paused owner voice와 source SRT를 사용한다. 결과에는 `AI 재현 · 검토용` disclosure와 원본 SRT 자막을 입히고, source admission·derivative·render·upload·publication·Stage 07·continuation·final approval은 계속 false다.

각 직접 반입 source에는 `newsroom-gemini-faceless-review-source-receipt-v1`이 필수다. receipt는 exact submitted prompt SHA, 실제 업로드 순서와 각 reference의 contained physical path/bytes/SHA, 실행 화면 receipt, source path를 묶는다. creator는 prepare 시 reference와 source를 다시 읽고, assemble 직전 source·paused voice·SRT의 bytes/SHA drift를 재검사한다. 선택 window는 관찰된 source duration 안에 있고 같은 source끼리 겹치지 않아야 한다.

캐릭터 마스터는 aggressor의 비대칭 둥근 사다리꼴, 성인의 pebble, 청소년의 animal-ear, 경찰의 capsule, 아동의 antenna처럼 서로 다른 머리 실루엣을 사용할 수 있다. 일관성 계약은 머리 외곽선의 동일성이 아니라 역할별 master·의상·색상·무광 재질의 재현과 모든 얼굴 표면의 연속적인 무형상 상태를 확인한다.

## Gemini Web 이미지 태그 실험 바인딩 (2026-09-07)

사용자가 요청한 private live test를 위해 `scripts/newsroom-gemini-reference-tags.mjs`에 선택적 이미지 태그 컴파일러를 추가했다. 이 경로는 기존 `newsroom-gemini-multishot-prompt-batch-v1`의 권위나 provider gate를 대체하지 않는다. API에 문서화된 Omni 이미지 참조 문법은 [Gemini Omni 문서](https://ai.google.dev/gemini-api/docs/omni) (2026-09-01 기준)로 기록하되, Gemini Web에서의 효과는 실험적 수동 관찰 대상으로만 남긴다.

컴파일러는 asset root 안의 물리적 nonsymlink 파일을 순서대로 1–5개 받아 `<IMAGE_REF_0>@Image1`부터 `<IMAGE_REF_4>@Image5`까지 연속 바인딩한다. 각 태그에는 asset ID와 role을 함께 기록하고, exact UTF-8 prompt bytes/SHA-256 및 reference bytes/SHA-256 manifest를 만든다. 중복 ID·경로, 누락·탈출 경로, 알 수 없는 `<IMAGE_REF_n>`, OmniGen의 `<|image_n|>`·`<img>` 토큰은 fail closed다. prompt와 manifest는 reference-only이며 자동 semantic pass, source admission, render, upload, publication, Stage 07, continuation을 승인하지 않는다. `newsroom-gemini-reference-tags-v1` 테스트는 drift와 금지 토큰을 포함한 집중 검증을 수행한다.

이미 DOM에 입력한 prompt를 재작성하지 않고 검증할 때는 `recordGeminiReferenceTaggedPrompt`를 사용한다. 이 API는 header의 다중 공백·개행을 허용하면서 exact submitted bytes를 보존하고, creator가 별도 `newsroom-gemini-reference-tag-receipt-v1`을 만든 뒤 그 receipt의 prompt SHA와 upload order를 실제 파일과 대조하게 한다.

```powershell
node scripts/newsroom-gemini-reference-tags-tests.mjs
```
## Private Flow preview per-cut QA successor (2026-09-07)

The road-rage private preview rebuild uses `newsroom-flow-cut-qa-v1` before any assembly. The packet must cover the exact locked 27-cut plan, script hash, owner voice hash, and plan hash. Every cut requires an independent reviewer identity, a source hash and selected interval, decoded start/mid/end frame evidence, action-event evidence, complete interval-content coverage, expected front/rear/seat/punctuation counts, and evidence-backed `pass|revise|uncertain` results for script, actors, action, spatial, no-extra-text, and continuity. `revise` or `uncertain`, missing/out-of-window evidence, hash drift, order drift, an unexpected internal cut, or reuse of superseded approval blocks the wrapper.

New sources require a board-review evidence record. Legacy source reuse may carry `legacy-reuse` for the board record, but it still requires fresh per-cut source QA. Generator output and provider echo are not independent review evidence. The wrapper is the only rebuild entry point; the legacy assembler cannot bypass this gate. After per-cut QA, an adjacent-state review must still check the assembled sequence for hands, actors, props, spatial continuity, and unexpected internal cuts; this check cannot be replaced by automated vision claims. Failed renders and their metadata remain immutable review evidence in a versioned snapshot. This section authorizes only a private review packet and never implies render, upload, publication, or canonical admission.

## Private Flow multi-reference/multishot mannequin successor (2026-09-08)

The user replaced the branded five-silhouette direction with `realistic-proportion-faceless-matte-mannequin-v1`: every person has realistic human body proportions and one continuous smooth blank matte face; roles are carried by age, body scale, wardrobe, seat position and action. The successor packet is `newsroom-flow-multi-reference-multishot-v1`, with the local prompt template and validator under `06-production/opencut-automation/out/newsroom/flow-preview/road-rage-multi-reference-pilot-20260908/`. Historical CAST01–05 assets and rejected videos remain immutable audit evidence and are not active references.

Each Flow pilot batch may contain one to three related shots and must bind the selected character, vehicle, background, prop and/or frame images for that batch. Every physical image has a unique `assetId` and unique logical `roleTag` (`CHAR_*`, `CAR_*`, `BG_*`, `PROP_*`, or `FRAME_*`), contained nonsymlink bytes and SHA-256. Every shot declares its selected role tags; a missing, duplicate, unselected or reordered reference fails closed. `@ROLE_TAG` is a local receipt tag, not a claim about an undocumented Flow SDK or web syntax. The exact submitted UTF-8 prompt, hash, actual UI upload order, asset IDs/hashes, and screenshot/DOM receipt are recorded separately from the compiled intent. Native Flow multi-reference video binding remains unverified until that receipt exists; image API support or a builder label alone is insufficient evidence.

The batch prompt describes `START STATE`, one observable `ACTION`, `END STATE` and `CAMERA` for each shot, preserving screen direction, vehicle heading, seat assignment and background across the sequence. A requested ten-second, two-to-three-shot source is an intent only; actual provider duration and decoded frames require independent capture. The packet remains test-only: provider source admission, semantic QA, derivative, render, upload, publication, Stage 07 and continuation are all false, and automatic retry is disabled.

### Storyboard Studio parity extension (2026-09-08)

The Flow custom tool follows Storyboard Studio's `Narration → story script → Assets → Storyboard` sequence. The narration input preserves the reviewed Korean wording and order without rewriting. The separate story script is the generator's `storyText`: connected English movie-synopsis prose that gives the verified event a beginning, conflict, escalation and result without production syntax or repeated narration. Recurring people receive consistent romanized names plus a grounded or approximate age and creative clothing at first mention; these are internal visual settings rather than identity or evidence claims, and production labels stay out of the prose. Each transition identifies the verified actor, target, preceding state or starting position, ordered action and result. If evidence does not establish exact spatial start/end positions or trajectory, the prose omits those details and uses only the shared verified action. Its source narration and case package hashes remain internal provenance. Assets are registered as separately hashed character, vehicle, background, prop and frame references. Storyboard cards bind the selected references to two or three consecutive shots, each with a start state, one observable action, an end state and a camera instruction. Those selected shots and ordered references form one requested 10-second vertical multishot submission. This is a planning and receipt contract; provider duration, native reference binding, source admission, QA, render, upload and publication remain unverified until their separate evidence exists.

### Cast Director Pro situation-board extension (2026-09-08)

`newsroom-flow-situation-board-v1` is historical planning evidence. Its single-shot prompt and one whole multishot request are not active production authority.

The active local successor is `newsroom-flow-situation-board-v2`: `Script → Assets → ImageGen entry frame + camera card → Review → current-sequence owner-voice animatic → ordered 2–3-shot Flow 10s transport batch → source QA → edit`. Every shot binds one physical `FRAME_*` file and the complete camera card; every batch repeats that same card and exact frame path/hash/tag/order in its prompt and upload manifest. Batch coverage must preserve authored order and include each shot once. Review covers composition, actors, vehicles, direction, seats, no-extra-text, camera card, action readiness and adjacent continuity. Review and animatic bind the current sequence signature. Frame drift or replacement resets both. Native multishot first-frame binding stays unverified. A high-error-cost or failed multishot shot may enter single-shot recovery only after a new entry-frame version and review. Provider execution, source admission, semantic QA, render, upload, publication and continuation remain false.

The unified live custom tool target is [뉴스룸 스토리보드 디렉터 Pro](https://flow.google.com/project/a399b814-8c66-435b-bc9d-a129e36a4e96/tool/ec9ffe5d-1b28-4e4e-bfd9-ca2202c85f62). Its intended state is one shared `Script / Assets / Frames` model with per-shot situation-frame selections and ordered multishot references. The former Cast Director Pro tool (`ee6b6539-d3c2-4a5c-91c9-0a8ac5fc2b06`) remains archived evidence only. Live builder integration and native Flow input binding are not treated as verified by this local contract.

운영 절차와 입력 규칙은 [Flow 뉴스룸 스토리보드 디렉터 Pro 영상 제작 지침](flow-storyboard-director-production-guide.md)을 따른다.
