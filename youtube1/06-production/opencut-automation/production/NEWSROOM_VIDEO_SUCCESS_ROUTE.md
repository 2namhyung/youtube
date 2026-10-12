# 뉴스룸 영상 제작 단일 성공 루트

상위 권위는 [canonical contract](../../../../wiki/pipelines/newsroom-video-production.md)다. 2026-09-10부터 신규 생성 영상의 기본 계약은 `newsroom-imagegen-flow-i2v-v3`이다.

## 신규 ImageGen → Flow·Omni 성공 루트

이 루트의 구현 진입점은 전용 로컬 CLI다. 기존 웹 workflow·generic production orchestration·live Flow builder의 제작 버튼을 대체하거나 배포한 상태는 아니다.

v3 순서는 `fact spine → 승인 역사 owner 녹음의 문장별 발화율 분포 → 사실 보존 provisional timing → semantic shot/camera/ImageGen/animatic → 9개 표준 Flow batch(각 10초, 3/3/4초) → 모든 provider source 다운로드·보존 → usable source windows → OpenCut picture rough → semantic reconciliation → 표현 한정 final script conform → final owner narration lock → 최대 1회 bounded audio conform → captions/title/BGM → final factual AV QA`다. 90초는 초기 picture source coverage 계획(9×10초)이며 최종 런타임 권위가 아니다. first-last-frame은 고위험 shot/recovery 보조 경로로 최소 4초 source를 요구하고 baseline에 자동 합산하지 않는다. final conform은 연결어·중복·표현만 바꾸며 사실·순서·수치·법적 상태·claim lineage를 보존한다. Flow prompt bytes와 v27 역사 산출물은 수정하지 않는다. final AV QA 전에는 render eligibility가 열리지 않고 provider/render/upload/publication/Stage 07은 별도 gate다.

1. 같은 검증 자료에서 생성·검토한 narration/storyText를 사용한다. 현재 legal·final script·title·owner voice·locked timing·supersession을 재확인하고 storyline → semantic cut plan을 봉인한다.
2. 시퀀스별 실제 지역·시기·건물/도로 구조·재질·빛·촬영축을 정한다. 실사진은 source-use·변형·ImageGen 업로드·downstream 사용 권리를 각각 확인한다. 미확인 권리는 사진 입력을 막으며, 업로드 없는 지역 사실 기준표는 별도 방법이다.
3. 필요한 인물·차량·배경·소품 마스터와 각 샷의 행동 직전 entry frame을 ImageGen으로 만든다. 모든 샷은 `size/angle/position/composition/movement/axis/screenDirection/seat/focus/startState/endState` camera card를 완전히 채우고, movement는 한 종류만 쓴다. 이미지·prompt·입력 provenance·선택 파일의 exact bytes/SHA를 기록한다.
4. entry frame과 동일 camera card, 한 행동, 시작/끝 상태, 인접 연결, 현실 배경, 좌석·방향·촬영축을 사람 검수한다. 현재 sequence signature와 provisional timing draft를 결합한 애니매틱을 승인한다.
5. `newsroom-flow-situation-board-v3`를 컴파일·재검증한다. 정상 계획은 9개 표준 Flow transport batch이며 각 batch를 정확히 3개 shot, `[3.0, 3.0, 4.0]`초 source intent로 묶어 총 90초의 picture source 재료를 계획한다. prompt는 exact 10초 요청 문장, exact mannequin·피부·복장 보존 문장, 빈 줄, ordered `[Shot n]` 블록으로 구성하며 각 블록은 `[참조 이미지: filename - Korean description]`으로 끝난다. 공통 문장은 batch당 한 번만 쓴다. exact frame path/hash/tag/order는 packet과 manifest에 결합하고 모든 shot ID를 중복·누락 없이 한 번씩 덮는다.
6. 역사본을 이동·수정하지 않고 verified-copy deliverable을 만든다. root의 `README.md`, `SHA256SUMS.json`, plan count와 정확히 같은 `shot-images/`, combined txt/json/md와 `flow-ready-batches/B1.txt`…`Bn.txt`, `infinite-canvas/`, 종류별 `base-reference-assets/`와 generation records/manifest, `manifests-and-verification/`를 검증한다. reference manifest에는 used/unused provenance와 hash를 보존한다. 그 뒤 actual submitted prompt bytes, 이미지 업로드 순서/media receipt, 모델·surface·화면비·요청 길이·해상도를 packet과 대조한다. 여러 reference 업로드는 샷별 native first-frame binding의 증거가 아니다. 10초와 3/3/4는 source 요청 intent이고 final timing이 아니다. first-last-frame은 고위험 shot/recovery에 한해 최소 4초 source로 별도 기록한다.
7. 별도 승인된 Flow/Omni 실행 후 **모든 provider 영상을 먼저 다운로드·보존·해시**하고 실제 duration/dimensions/FPS/audio를 측정한다. 그 뒤 독립 QA로 usable continuous window를 고르고 OpenCut picture rough에서 필요 없는 프레임을 줄인다. semantic unit마다 `reshoot|trim|visual-bridge|script-expression-conform`으로 reconciliation한다. picture rough가 90초보다 짧아지는 것은 정상적인 conform 결과이며 최종 음성 길이를 결정하지 않는다.
8. final script conform은 연결어·중복·표현만 조정한다. fact spine 보존 검수 뒤 최종 owner narration을 승인·잠그고 0.95–1.05 audio conform을 최대 한 번 시행한다. captions/title/BGM과 final factual AV QA 뒤에만 render eligibility가 열린다. 오류 비용이 높은 샷이나 QA 실패 샷은 새 entry frame과 재검수를 거친 single-shot recovery만 쓴다. 실제 provider/render/upload/publication/Stage 07은 개별 gate다.

현재 로컬 v3 compiler/schema는 사전 제작 packet과 hash 및 후반 제작 admission을 검증한다. 실제 provider adapter나 live Flow builder 배포, native first-frame binding, source semantic pass를 승인하지 않는다. 기존 v1 단일샷과 Gemini/Flow pilot artifact는 역사 경로다.

현재 v27 Flow 10초 캔버스는 owner voice acceptance 실패, S14–S17 추정 타이밍, 총 62.933초의 65초 미달, 3.5초 초과 샷 때문에 planning/manual-evaluation으로만 유지한다. 잠긴 owner narration과 successor cut plan 없이 provider submission 또는 production source로 승격하지 않는다.

## 보존된 v13 hybrid 경로

아래는 기존 `evidence-motion-documentary-v13-hybrid-real-media-admission`과 후속 이력의 재검증 규칙이다. 신규 ImageGen/Omni 작업에 실사 coverage나 Grok-only 입력 규칙을 자동 적용하지 않는다.

1. 승인 news/legal, final script, approved two-line title, owner narration와 locked timing의 exact SHA를 재확인한다. stale/superseded/Edge-TTS/비-owner 대체는 중단한다.
2. `newsroom-storyline-v2`를 승인하고 `newsroom-semantic-cut-plan-v2`에서 cut ID/order/count/evidence subspan/duration intent를 봉인한다. 정상 2–3초, attested required/final boundary만 1.5–3.5초다.
3. 모든 sealed cut을 네 source class로 분류한 `newsroom-real-media-needs-v1`를 승인한다.
4. origin item 권리, exact response/source hash, physical original, Lanczos derivative, risk flags, local processing을 검증해 `newsroom-real-media-acquisition-admission-v1`를 승인한다.
5. authored-duration 실사 coverage를 재계산해 0.80 이상인지 확인한다. locked timing/cut plan 부재, provisional photo/beat count, generative-altered asset은 통과 근거가 아니다.
6. 실사 컷은 local FFmpeg crop/pan/zoom/overlay only이고 provider input은 기본 deny다. 생성 컷만 rough/master→color board admission→Grok one-board 경로를 탄다.
7. 현재 `newsroom-real-media-admission-projection-v1` 이후 hybrid compiler continuation은 명시적으로 deferred다. provider/render/upload/publication/Stage 07은 실행하지 않는다.

## v27/v13 script-first baseline approval (2026-09-06)

사용자는 2026-09-06에 v27 generator와 v13 independent factual/legal critic을 대본 생성 로직의 기준선으로 승인했다. 이 기록은 생성 로직 범위만 확정하며 개별 final script·title·owner narration·provider·render·publication을 승인하지 않는다. 대본은 65–80초 deterministic gate와 70–73초 내부 목표를 사용하고, Codex CLI generator 1회 뒤 read-only critic 1회를 거치며 자동 rewrite/retry는 0회다. road-rage는 도입·전개 style-only, coffee와 Jeju는 공감형 결말 style-only reference이며, 사실 문장은 직접 claimRefs, 논평 문장은 현재 사건 context anchors를 사용한다. 승인 당시 6건의 append-only 원문·critic·timing 기록은 [v27 final review](../out/newsroom/draft-runs/v27-final-review-20260906T085125331Z.md)에서 확인한다.

활성 v35 writer는 같은 응답의 별도 영어 `storyText`를 Flow가 분해하기 쉬운 2~5문단 영화 줄거리로 쓴다. 반복 인물과 차량은 첫 행동 전에 서로 구별되는 시각 설정과 소유 관계를 고정하고, 주요 이동·행동·가시적 결과를 가능한 한 문장별로 연결한다. v18 critic은 이를 사건 의미와 시각 연속성으로 검증하며 별도 story 모델·critic·rewrite는 추가하지 않는다.

Source-use와 provider-input status를 분리하고, sub-480 element, upscale QA, 사람/미성년자/민감당사자/privacy/trademark/artwork/property/geo/case-party flags 및 attribution/disclosure를 canonical contract대로 검증한다.

## 필수 검증

```powershell
node scripts/newsroom-real-media-admission-tests.mjs
node scripts/verify-three-story-real-media-v2.mjs
node scripts/verify-three-story-domestic-photo-completion-audit-v1.mjs
node scripts/three-story-domestic-photo-completion-audit-tests.mjs
npm run test:editorial-cartoon-template
npm run test:generic-pipeline
```

## v2 real-photo diversity gate

The sealed cut plan is the only search authority. Discovery runs after each `storyId:cutId` need is fixed; assignments never use modulo or positional fallback. A real-media cut receives one distinct primary source by default, with maximum reuse one only when continuity is attested, and each story must maintain a unique-primary ratio of at least 0.90. Source SHA-256 and pHash duplicates fail closed; derivatives do not count as new sources. Duration coverage is insufficient to approve an admission that fails this diversity gate.

## v3 domestic-photo-only gate

For the current three-story remake, every real-photo assignment must come from a Korean institution or Korean rightsholder and depict a Korean capture context. The creator records `originCountry=KR`, `captureCountry=KR`, `rightsholderCountry=KR`, the institution, the item-level license, and a detail-page hash. A Korean subject hosted only by Wikimedia/another foreign aggregator and a Korean-hosted foreign photograph both fail. Only KOGL 0/1, Korean-rightsholder CC0/PD/CC BY, or written Korean-rightsholder clearance can enter the route. The prior foreign-source acquisition is audit-only and cannot seed this successor. Completion remains deferred until 46 distinct domestic primaries pass the independent verifier.

## v4 temporal-fitness gate

Each sealed cut need and successor asset must carry `captureDate`, `captureYear`, `temporalEra`, `technologyGeneration`, and `anachronismFlags`. Approval requires capture year 2020 or later; unknown dates are conditional-only and pre-2020 media is legacy/rejected for modern coverage. Smartphone-era and modern-laptop needs fail closed when optical-disc drives, feature phones, CRT displays, or equivalent anachronisms are visible; device checks record `opticalDiscDriveVisible` and `featurePhoneVisible`. Provider, render, upload, publication, and Stage 07 remain prohibited.

## v5 newsroom-photo-risk successor

The strict 46-distinct statement is retained as historical v3 evidence. Active assignments use `newsroom-photo-risk-v1`: three risk tiers, separate copyright/editorial/YPP/claim statuses, mandatory `자료사진 · 사건과 무관` for conditional coverage, local-only transformation, and no case-evidence/location/party implication. One source may cover at most two contiguous cuts with attested continuity and distinct framing, never more than 15% of story duration; derivatives are not new primaries. Approval requires 0.80 authored-duration coverage per story and every risk/reuse/YPP gate.

```powershell
node scripts/newsroom-photo-risk-v1-tests.mjs
node scripts/create-three-story-domestic-photo-admission-v5.mjs
node scripts/verify-three-story-domestic-photo-admission-v5.mjs
```

## v6 sequence-first / radio-edit visual assembly successor

The locked owner narration and sealed semantic cut plan are the only sequence
authority. `newsroom-sequence-first-radio-edit-v1` keeps semantic units,
editorial visual blocks, and reusable source assets as separate records. Visual
roles are `evidence`, `context`, `explanation`, and `rhythm`; context blocks
must carry `자료사진 · 사건과 무관`, while evidence blocks must bind to actual
case evidence. A source asset may span contiguous cuts when continuity is
attested and each cut has a distinct authored treatment (`full`, `crop`, `pan`,
`zoom`, or `annotation`). Coverage is measured by authored screen time; there
is no fixed photo-per-cut or 0.90 unique-primary gate. Rights, privacy,
provider-local-only, and YPP-authored-transformation gates remain mandatory.

```powershell
node scripts/newsroom-sequence-first-radio-edit-tests.mjs
node scripts/create-three-story-visual-assembly-plan-v1.mjs --run-id=<append-only-run>
node scripts/verify-three-story-visual-assembly-plan-v1.mjs --run-id=<append-only-run>
```

The successor plan is pre-production only. Provider, render, upload,
publication, Stage 07, and continuation remain false until the evidence gaps
reported from v5 are independently closed.

### v7 coverage/evidence split successor

`newsroom-sequence-first-radio-edit-v2` reuses the admitted domestic assets as
illustrative backgrounds across contiguous semantic phases. It reports
`photoScreenTimeCoverage` separately from `evidenceCompleteness`: unresolved
exact-evidence gaps receive an `evidenceOverlayRequirement` and do not block a
clearly disclosed background photo. Blocks are phase-segmented (maximum two
cuts), treatments rotate, and all rights/privacy/provider-local-only/YPP gates
remain active. The latest append-only run is verified, but approval and every
provider/render/upload/publication/Stage 07 gate remain false.

```powershell
node scripts/create-three-story-visual-assembly-plan-v2.mjs --run-id=<append-only-run>
node scripts/verify-three-story-visual-assembly-plan-v2.mjs --run-id=<append-only-run>
```

### v8 v5-preserving successor

`newsroom-sequence-first-radio-edit-v3` preserves each original v5 admitted
assignment on its original cuts, then fills only formerly blocked cuts with
adjacent phase-compatible context. The verifier rejects replacement of any
original admitted asset, keeps evidence gaps `6/9/7`, and requires the same
photo-screen-time/evidence-completeness split.

```powershell
node scripts/create-three-story-visual-assembly-plan-v3.mjs --run-id=<append-only-run>
node scripts/verify-three-story-visual-assembly-plan-v3.mjs --run-id=<append-only-run>
```
### v5 photo-risk finalization checkpoint (2026-08-15)

The append-only v5 run `out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb` passed an independent policy verifier. Admission SHA-256: `83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1`; verifier SHA-256: `81c1aae0667574addf3b53f04889153f6fcd8b2e9cae77d5574db3b4868bde19`. Coverage is 0.526301/0.352943/0.470591 for police-father/jeju-school-intrusion/nurse-pesticide-coffee, with 6/9/7 remaining real-photo cuts. No story is approved and all provider/render/upload/publication/Stage 07 gates remain false.

## v9 65–80초 full-storyline / Gemini 사전 제작 경로

기존 news/legal → approved script/title/owner narration의 current tuple을 `newsroom-v9-entry-authority-v1`에서 exact storyId/SHA와 supersession reconciliation로 확인하고 `newsroom-storyline-v2` → `newsroom-semantic-cut-plan-v2` 뒤에만 다음을 실행한다: `newsroom-full-visual-storyline-v1` → 선택적 `newsroom-imagegen-reference-catalog-v1` → `newsroom-gemini-multishot-prompt-batch-v1` → canonical operator attestation + physical receipt → 수동 평가 source `newsroom-gemini-web-source-capture-v1` → `newsroom-gemini-multishot-semantic-qa-v1`.

Reference는 사실·신원·증거·QA 권위가 아니다. Creator/verifier는 role/scope, 생성 model/prompt, 실제 decoded image와 physical hash를 확인하고 compiler도 직전에 재검증한다. 전체 locked narration/cut duration은 65–80초이며 6–10초 batch의 4/3/3 등은 shot intent이고 final cut은 sealed 2–3초를 유지한다. source import는 사람이 작성한 exact prompt/reference/model/surface attestation과 screenshot receipt 및 decoded media를 확인하되 provider 사실의 절대 증명으로 승격하지 않는다. QA는 ordered observed boundary와 source MP4에서 deterministic 재생성한 selected start/end frame evidence로 authored duration ±0.05초 window를 고른다. provider audio는 폐기한다.

```powershell
npm run test:newsroom-gemini-storyboard-pipeline
node scripts/newsroom-gemini-storyboard-pipeline-cli.mjs seal-entry --storyline=... --cut-plan=... --legal-review=... --title-approval=... --owner-narration-approval=... --supersession-reconciliation=... --output=...
node scripts/newsroom-gemini-storyboard-pipeline-cli.mjs seal-visual --draft=... --storyline=... --cut-plan=... --entry-authority=... --legal-review=... --title-approval=... --owner-narration-approval=... --supersession-reconciliation=... --output=...
node scripts/newsroom-gemini-storyboard-pipeline-cli.mjs compile-batches --visual=... --references=... --asset-root=... --draft=... --output=...
node scripts/newsroom-gemini-storyboard-pipeline-cli.mjs capture-source --batches=... --batch-id=... --source-root=... --source=... --attestation=... --evidence-root=... --output=...
```

도구는 Gemini를 호출하지 않는다. provider/render/upload/publication/Stage 07/continuation은 별도 provider gate 승인 전까지 모두 `false`다.

## 2026-09-07 무광 마네킹 Gemini Web 파일럿

사용자가 승인한 범위는 fictional 3-shot provider pilot 한 번이다. 현재 73.537792초/27컷 paused preview는 upstream timing 참고일 뿐 final authority나 본편 cut coverage가 아니다. active reference는 `FRAME-S01-v1` → `CHAR-M01-v1` → `CAR-A-v1` → `CAR-B-v1` 순서이고, 실제 Gemini DOM 제출 문자열 `PILOT-S01-submitted-v1.txt`의 bytes/SHA가 실행 prompt 권위다. 8초는 UI 지원 주장이 아니라 request intent이며 원본 다운로드 뒤 ffprobe로 관찰값을 기록한다.

```powershell
npm run test:newsroom-gemini-web-mannequin-pilot
node scripts/newsroom-gemini-web-mannequin-pilot-cli.mjs prepare --bundle-root=... --scene-plan=... --audio=... --input=...
node scripts/newsroom-gemini-web-mannequin-pilot-cli.mjs verify --bundle-root=... --scene-plan=... --audio=... --input=... --packet=...
node scripts/newsroom-gemini-web-mannequin-pilot-cli.mjs import-source --bundle-root=... --scene-plan=... --audio=... --packet=... --operator-input=... --source-root=... --source=... --receipt-root=...
```

`prepare`는 1–5개 physical reference와 exact generation prompt, 1–3개 fictional shot intent, 제출 prompt를 canonical packet/MD/HTML로 묶는다. `verify`는 파일을 다시 쓰지 않고 physical drift를 검사한다. `import-source`는 operator 기록·screenshot receipt·원본 MP4를 결합하고 별도 shot-QA pending 기록을 만든다. 전체 production gate는 계속 false다.

### 얼굴 없는 전체 대본 review preview

사용자가 승인한 얼굴 없는 무광 마네킹 프리뷰는 `production/newsroom/gemini-faceless-review-preview.schema.json`과 `scripts/newsroom-gemini-faceless-review.mjs`의 별도 경로를 사용한다. Gemini source는 prompt/reference/capture bytes와 hash를 보존하고, 각 provisional cut에 대해 operator가 고른 연속 source window를 24fps 누적 frame 수로 맞춘다. 누락 window가 하나라도 있으면 prepare 상태는 `partial-missing-source-windows`이며 assemble은 중단된다.

완전한 map만 `assemble`할 수 있다. 각 window는 1x로 잘라 1080x1920/24fps로 만들고, provider audio는 버린다. paused owner voice와 source SRT를 다시 섞고 화면에 `AI 재현 · 검토용`을 표시한다. 이 산출물은 대본 전체를 시각적으로 검토하기 위한 private review preview이며, script/title/voice/storyline/cut-plan authority 또는 production source admission이 아니다. 모든 production gate는 false로 남는다.

각 source는 `newsroom-gemini-faceless-review-source-receipt-v1`을 반드시 갖고, receipt의 prompt SHA·upload ordinal·reference path/bytes/SHA·screenshot·source path를 실제 파일과 대조한다. source window는 ffprobe로 관찰된 원본 범위 안에서만 선택되며 동일 source의 선택 window는 겹칠 수 없다. assemble 직전 source, paused voice, SRT bytes를 다시 해시해 capture 이후 drift가 있으면 중단한다.

검토용 five-cast 입력은 머리 실루엣이 서로 달라도 허용한다. 검증 대상은 `faceGeometryAllowed=false`와 `facialGeometry=none`이며, 공통 얼굴 모양이나 단일 캐릭터 형상을 강제하지 않는다.

```powershell
node scripts/newsroom-gemini-faceless-review-cli.mjs prepare --bundle-root=... --scene-plan=... --audio=... --srt=... --input=...
node scripts/newsroom-gemini-faceless-review-cli.mjs verify --bundle-root=... --scene-plan=... --audio=... --srt=... --capture=... --input=...
node scripts/newsroom-gemini-faceless-review-cli.mjs assemble --bundle-root=... --capture=... --output-root=... --ffmpeg=... --ffprobe=...
```

### Gemini Web 이미지 태그 private test

사용자가 승인한 private live test에 한해 `scripts/newsroom-gemini-reference-tags.mjs`가 1–5개 ordered reference를 `<IMAGE_REF_0>@Image1` 형식으로 명시적으로 묶는다. 이 helper는 [Gemini Omni 문서](https://ai.google.dev/gemini-api/docs/omni)의 2026-09-01 문서 기준을 보존하지만 Gemini Web의 실제 tag effectiveness는 실험적이다. Web 결과는 자동 semantic pass나 provider 사실 증명이 아니다.

컴파일 입력은 asset ID, contained relative path, role, scene prompt다. helper는 중복·누락·unsafe path·unknown image tag·OmniGen legacy token을 거절하고, 물리적 nonsymlink reference의 bytes/SHA-256과 exact UTF-8 compiled prompt의 bytes/SHA-256을 manifest에 기록한다. 이 packet의 production flags는 계속 `false`이며 기존 entry authority, storyline, cut plan, source receipt, independent QA, final approval 게이트를 우회하지 않는다.

이미 제출된 Web prompt는 `recordGeminiReferenceTaggedPrompt`로 다시 컴파일하지 않고 기록한다. 이 경로는 header의 다중 공백·개행을 허용하되 exact submitted bytes를 유지하고, creator receipt의 prompt SHA와 upload order를 실제 파일에서 재계산한다.

```powershell
node scripts/newsroom-gemini-reference-tags-tests.mjs
```
