# YouTube 설명 영상 제작 playbook — 대본·외부 원본 중심 정본

Updated: 2026-09-17. 이 문서는 현재 운영 절차다. 이전 실험·실패·48컷 계획·style family v01–v10 상세는 [역사 기록](remotion-vox-production-playbook-history-2026-09-13.md)에 보존하며 현재 제작 authority가 아니다. 사용자 규칙의 세부 검증 계약은 [AGENTS.md](../../AGENTS.md), 편집 내용은 [episode-spec](../../video/episodes/episode-001/episode-spec.json)을 따른다.

## 0. 제작 전에 VisualMaker에서 장면을 설계한다

이 절은 2026-09-17 사용자 요청을 반영한 운영 결정이다. 시작점은 [VisualMaker 실행 안내](../../visualmaker/README.md)와 [구현 계약](../../visualmaker/IMPLEMENTATION.md)이다. 설계안은 대본과 화면을 함께 편집하는 방향을 채택하되, 고정 6종 템플릿·캡처 픽셀 합성·빈 그래픽으로 자료 공백을 채우는 예시는 이 프로젝트에 적용하지 않는다. 관찰 문법의 근거는 [잠긴 참조 원본](../../raw/inbox/vox-style-claude-remotion-reference.mp4)을 유지한다.

1. 새 대본 또는 현재 episode-spec의 작업 사본을 연다. 원문·메모·참고 URL을 분리하고 전달 의미를 확인한다.
2. 같은 의미를 전달하는 두 표현을 비교한다. 대상/행동/관계, 시작/변화/도착, 필요한 독립 원본과 근거를 따로 확인한다.
3. 장면 목표와 표현을 직접 고치거나 의미에 맞게 합친다. 재사용은 이유를 남기며 원본 수를 부풀리지 않는다.
4. 대본 수정은 변경 전후와 영향 장면을 보고 새 리비전으로 채택한다. 잠긴 장면을 바꿔야 하면 사용자가 먼저 잠금을 해제한다. 자료 부족이 사실·대상·조건·제작 모드를 자동으로 바꾸지 않는다.
5. 검색 지시와 실제 파일을 구분한다. 원본 파일·출처·의미 대응·이용 조건을 등록해도 검토 전 상태다. 캡처는 화면 밖 근거 확인용이다.
6. 장면표와 미해결 자료 요구를 내보내고 방향을 검토한다. 전달안은 비생산 제안서이며 episode-spec 반영과 기존 생성/검증은 별도 단계다.

현재 로컬 제안기는 규칙 기반 초안이다. 의미 이해를 검증한 LLM, 자동 스톡 검색, TTS, 애니매틱·Remotion·Omni 생성은 이 작업대에 아직 연결하지 않았다. [기존 수급 기록](../../raw/sources/keyless-media-implementation-2026-08-22.md)은 검색 연결 후에도 원본 검토가 필요하다는 출처 계보의 기준으로 유지한다.

## 1. 대본에서 제작 방식을 결정한다

| 제작 방식 | 선택 기준 | 필수 자료와 구현 |
|---|---|---|
| 실사 영상/사진 | 실제 인물·장소·업무 행동, 실제 발언 또는 사건의 원문을 보여줘야 한다 | 외부 원본을 찾고 정확한 장소·내용·앞뒤 맥락·사진/영상 구간을 확인한다. 행동의 진행이 중요하면 영상, 한 상태를 읽히면 사진 |
| 모션그래픽(Remotion) | 법률 문구·관계·비교·경로·조건·기간을 순서대로 설명해야 한다 | 외부에서 확보한 실제 사물·기관·인물 원본을 독립 자산으로 사용한다. 연결선·강조·숫자·정확 법률 문구는 별도 설명 표면에 둔다 |
| Omni 가상 사건 | 가정한 사건에서 구매·개봉·접수·확인 같은 행동이 이어져야 한다 | 같은 가상 인물·장소·소품을 유지한다. 실제 인물/사건/성과를 생성해 증거처럼 보이지 않는다. 모든 컷 PASS 전에는 PNG 키프레임 입력만 허용한다 |

**자료 부족은 모드를 바꾸는 이유가 아니다.** 서류 사진이 없다고 빈 카드로 때우거나, 실제 발언을 Omni로 대신 만들지 않는다. 필요한 행동·사물·구도를 더 검색하고 미확보 상태를 기록한다. 비율·최소 기법 수·고정 family 수를 목표로 맞추지 않는다.

각 컷의 `production_decision`에 목적, 화면에 보여줄 대상, 관찰 가능한 행동, 선택 이유, 다른 방식의 배제 이유, 외부 자료 명세, 필요한 경우 가상 사건 연속성 그룹과 회수 이유를 기록한다. 최종 화면을 보기 전 자동 검사는 의미와 미감을 승인하지 않는다.

## 2. 표현 초안 뒤 실제 원본을 확인하고 화면을 구체화한다

검색은 대본 전체를 한 번에 ‘정치/경찰/서울’로 조회하는 방식이 아니다. 컷별로 **사물 + 행동 + 구도 + 필요한 출처 수준**을 분리한다. 예를 들어 기록을 읽기, 이유 작성, 요청 봉투 발송, 자료 인계, 접수, 대조, 분류, 서고에서 꺼내기, 통보는 서로 다른 검색 명세다.

- 한국 국회·경찰·검찰·법원 등 기관 정체성은 한국 원본으로 확인한다. 외국 기관을 대체하지 않는다.
- 링 바인더·봉투·CCTV 기기·보관 상자 등 장소 중립 사물은 의미가 맞는 공개 원본까지 넓게 찾는다.
- 특정 발언·사건 증거는 당사자·날짜·원문·정확 시간구간을 대조한다. 일반 업무 맥락 영상과 혼동하지 않는다.
- 사진과 영상을 모두 검색하고, MG에 쓸 독립 원본도 함께 수집한다. 하나의 단체 사진을 여러 인물 자산으로 잘랐다고 독립 원본 수가 늘지 않는다.
- 고정 등록 후보 목록은 기존 상태 보고다. 새 검색·빈 결과·실패·미지원 경로·다음 검색 offset을 별도 원장에 기록한다.

공급처의 실제 지원 상태는 수급 코드와 실행 원장에서 확인한다. Commons·KOGL·Pexels 등의 연결 가능 여부와 해당 실행의 성공을 혼동하지 않는다. 공식 개별 공개 원문·특정 국회 발언·법률 근거는 수동 확인 또는 미지원 경로가 남을 수 있다. [수급 파이프라인](../concepts/media-acquisition-pipeline.md)과 [소스 전략](media-source-strategy-v0.1.md)의 실행·선택 규칙을 따른다. 기존 수급 구현 근거는 [정적 이미지 수집 기록](../../raw/sources/keyless-media-implementation-2026-08-22.md)에 있다.

연락·계약·구매·직접 촬영을 전제로 하지 않는다. 항목별 공개 조건을 확인하는 [self-service 정책](korean-policy-media-intake-and-rights-v1.md)을 유지한다. 검색·다운로드·라이선스 문자열은 사용자 권리/의미 승인과 별개다.

## 3. 반복은 실제 원본과 화면으로 판단한다

원본 SHA-256별 노출 시간, 연속 노출, 동일 사진 크롭, 대상·행동·구도·장소의 반복을 함께 본다. source ID·파일명·크롭·인접 시간구간은 새로운 원본이 아니다. 해시가 없는 원격 locator를 확보한 원본으로 세지 않는다.

결론에서 도입을 회수하는 반복은 해당 노출의 `reuse_reason`을 남긴다. 마지막 컷의 회수 이유로 앞부분의 무근거 반복을 승인하지 않는다. 같은 의미군이 여러 컷에 나타나면 행동/구도 차이와 실제 프레임을 검토한다. 검색 건수나 비율 임계치는 품질 PASS가 아니다.

컷을 무조건 2–4초 구간으로 잘라 원본 다양성을 부풀리지 않는다. 의미상 연속 행동은 검토된 정확 원본 구간 안에서 유지할 수 있다. 내레이션에 따른 컷 타이밍, 읽기 hold, 전환 overlap은 별도로 검증한다.

## 4. 하나의 편집·구현 authority

```text
VisualMaker: 대본/Beat/Scene/표현 대안/자료 요구 (proposal-only)
  → 사용자 방향 검토 → episode-spec에 채택할 변경안

제작 권한의 유일 경로:
episode-spec.json
  → generated/manifest-contracts.json
  → active-cut-manifests
  → generated/render-catalog.json
  → EpisodeTimeline
```

`episode-spec.json`만 수동 편집 authority다. 계획·계약·catalog·blueprint를 손으로 고치지 않고 생성기를 실행한다. Active manifest는 자신의 generated cut contract와 exact bytes/hash로 결속하고 구현/asset/runtime만 더한다. QA·calibration·historical·standalone entrypoint는 production root를 선택하거나 승격할 수 없다.

검색 초안은 `candidate-plan-blocked`, `timing-draft`, `active_cut_root=null`이며 현재 catalog는 빈 비생산 결과다. Source 선택 이후에는 `source-selected-editorial-plan`과 대응하는 top-level editorial 상태를 기록한다. 이 상태명만으로 승격되지 않는다. 실제 source/materialization·manifest·runtime·사용자 approval marker가 stage 검증을 통과해야 한다. 검색 중인 blocked 계획이 활성 상태와 공존할 수 없으며, 반대로 source-led라는 revision 이름 때문에 모든 후속 단계를 영구 차단하지 않는다.

승인 마커는 사용자가 실제 검토한 입력·출력·runtime·effect SHA-256에 결속한다. 승인 파일을 교체하면 PASS는 무효다. 검증기는 파일 무결성과 조건을 확인하며 사람의 승인 기록을 만들지 않는다.

## 5. 제작 단계 순서

1. Research/evidence lock → 대본 storyline와 임시 timing.
2. Reference inventory → 정확 source/frame/timecode 결속 → reference-derived grammar prototype → side-by-side grammar audit **사용자 PASS** → grammar 추출/승격.
3. Episode source의 사용자 승인/materialization → 각 cut/beat의 grammar `applicable` 또는 `not-applicable`과 의미상 이유.
4. Source-ready 대표 episode style frame → **사용자 style-frame PASS** → 실제로 선택한 grammar의 playable parity.
5. 독립 production asset 분해 → 계획한 입력이 채워진 전체 cut preview → **모든 계획 컷의 사용자 PASS**.
6. Omni 영상 생성 → 별도 generated-motion 검토 → full provisional video → **사용자 전체 영상 검토**.
7. Final script lock → 사용자 최종 녹음 → ffprobe 실측 retiming → audio-timed assembly → picture lock → captions/mix/thumbnail.

Scratch 녹음은 선택이다. Provisional timing은 임시 대본과 사용자의 실측 발화속도를 따른다. 최종 녹음 이후에는 ffprobe 측정값이 retiming authority다. Visual review 전 명칭은 `animatic` 또는 `provisional`이며 `master/final/picture-locked`를 사용하지 않는다.

## 6. 참조 문법과 화면 자산

참조 준비 상태는 `stage / focal / supporting / depth / entrance / internal-change / transition / hold / exclusions`의 아홉 차원으로 판단한다. 참조 이미지 수·고정 family 수·모든 sample 할당은 gate가 아니다. [로컬 참조 영상](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [샘플 grid](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [기존 분석](../sources/vox-style-claude-remotion-reference.md), [frozen grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json)를 연결한다.

가져오는 것은 관찰한 화면 문법이다. 승인 allowlist의 object/layout/depth/text/motion/transition/treatment ID에 실제 구성 요소를 결속하며 unmapped/novel grammar는 허용하지 않는다. 새 문법은 새 관찰 증거와 사용자 승인이 필요하다. 채널 예외는 AGENTS의 네 가지 frozen ID뿐이다.

실명 인물은 실제/공식 자료만 쓴다. 비인물 imagegen editorial reconstruction 예외는 정확 evidence source ID/path/hash → semantic summary → concrete visual translation → exact prompt/avoid list → 사람의 의미·픽셀·분해 검토를 거친다. AI disclosure=true, evidence=false이며 읽을 수 있는 글자·이름·날짜·숫자·로고·UI·워터마크를 픽셀로 생성하지 않는다.

화면/웹페이지/뉴스/법률 캡처와 crop은 evidence/provenance 전용이다. Production-visible source나 style-frame pixel input이 될 수 없다. 법률 정확 문구는 래스터 없는 native DOM/vector 표면에 조판한다. 사진/PNG 위에 결정론적 텍스트를 타이핑하지 않는다. 텍스트 역할은 `asset-label`, `surface-content`, `screen-chrome`이며 새 후보는 typography/layout contract v2를 선언한다. 라벨 전용 아래 레인·간격·정렬·occlusion 한계는 AGENTS와 실제 layout validator를 따른다.

## 7. 동작과 컷 검토

각 beat는 시청자에게 남길 한 문장, 정확히 하나의 focal, supporting/hidden 요소, layout template, narration window, 최소 2초 stable reading hold를 갖는다. 상태는 hidden/entering/focused/supporting/exiting/final-summary로 명시한다. 첫 활성 구간 전에 렌더하지 않고 최종 hold에서 모든 자산의 중요도를 같게 만들지 않는다.

Source 선택 전에는 차단된 `action_intent`만 둘 수 있다. Deferred intent가 남은 채 임의 operator를 추가해 구현을 주장할 수 없다. 실제 모션은 등록 runtime operator, 독립 asset/render target, 관찰되는 geometry/content-state 변화로 입증한다. 이름만 붙인 animation, 정지 PNG, keyframe fade는 모션 증거가 아니다.

Visual review profile은 `omni-keyframe-input`, `omni-generated-motion`, `remotion-motion`, `source-photo-treatment`, `source-video-selection`에서 선택한다. Style PASS는 정지 방향만 승인하고, Omni input PASS는 생성 입력만 승인한다. Morph/scene-to-scene은 인접 컷 pair artifact가 필요하다. Remotion parity는 실제 entrypoint/composition 렌더와 exact frame identity·target input bytes·mask/geometry·60프레임 reading hold로 검증한다.

Cut PASS를 요청하기 전에 source mapping, mode별 decodable local visual inputs, 전체 컷 contact sheet, stage 검증, 독립 review를 확인한다. 빠진 계획 입력을 placeholder로 채우지 않는다. `effects_required=true`일 때만 실제 effect 파일/manifest/provenance가 필요하며, false일 때 빈 effects 폴더를 완료처럼 남기지 않는다.

## 8. 현재 EP001 실행 기준

2026-09-17 기준 편집 정본은 [현재 36컷 episode-spec](../../video/episodes/episode-001/episode-spec.json)이다. VisualMaker의 `EP001 가져오기`는 이 파일을 매번 읽고 컷 ID·모드·내레이션·검색 브리프와 원본 SHA-256을 보존한 새 작업 사본을 만든다. 원본 spec의 변경 여부를 확인한 전달안을 사람이 검토하기 전에는 제작 명세로 적용하지 않는다. 컷 수·자료 충족도·승인 상태는 정본과 [production state](../../video/episodes/episode-001/production-state.json)에서 읽으며 작업대의 선택/잠금으로 갱신하지 않는다.

[64컷 설계 검토판](../../video/qa/pipeline-audit/2026-09-13/review.html)의 실사23·MG25·Omni16 및 source 명세114는 2026-09-13 당시 계획이다. 현재 실행 기준이나 확보 완료 수로 사용하지 않는다.

```powershell
pnpm run visualmaker:dev
# 대본/방향/자료 요구 편집 후 전달안 검토. 아래는 채택된 spec에 대한 기존 제작 명령이다.
pnpm run media:search-episode -- --plan
pnpm run media:search-episode -- --execute --provider commons --max-queries 24 --max-results 8 --download-candidates 8
# 같은 spec/task hash일 때 ledger의 next_query_offset으로 이어간다.
pnpm run video:generate-plans
pnpm run video:prepare-acquisition -- --report-only
pnpm run video:refresh-reference-source-gate
pnpm run video:qa:build-source-review
pnpm run video:generate-render-catalog
pnpm run video:validate-editorial-routing -- --check
pnpm run check
```

검색 후보와 원본은 intake에서 검토하고 선택 전 production authority를 주지 않는다. `video:prepare-acquisition`은 등록 원장 보고이며 전체 외부 검색이 아니다. [변경·정리·검증 결과](../../video/qa/pipeline-audit/2026-09-13/README.md), [EP001 정본 페이지](supplementary-investigation-first-video-v0.1.md), [production state](../../video/episodes/episode-001/production-state.json)를 함께 읽는다.
