# 위키 운영 로그

## 2026-08-15 — v12 순환 없는 2단계 successor 승격

- 이 항목은 같은 날짜의 `newsroom-storyline-v1`/`evidence-motion-documentary-v11-color-storyboard` 활성 선언을 supersede한다. 현재 권위는 `newsroom-storyline-v2` → `newsroom-semantic-cut-plan-v2` → `newsroom-color-storyboard-admission-v2` → `video-design-v7-two-stage-color-storyboard` 순서와 `paper-cut-grok-storyboard-v2`다.
- storyline approval hash는 exact news/script/narration audio/canonical timing authority를 포함한 canonical content에서 creator/verifier가 재계산한다. 컷 ID·개수·duration intent는 board 작업 전에 봉인한다.
- rough·character master·color board의 contained nonsymlink file bytes/hash, character 0–3개 고유성, scene duration/plan binding과 authored duration ±0.05초 semantic window를 검증한다.
- generic continuation은 별도 provider gate 전까지 `deferred`, `continuationAuthorized=false`다. provider/render/upload/publication/Stage 07은 실행하지 않았다.
- 위키 lint에서 제거된 historical 링크 6개를 current/history 설명으로 정리하고 index orphan 3개를 등록했다. Source: [canonical contract](pipelines/newsroom-video-production.md), [success route](../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md).

## 2026-08-15 — storyline 승인과 동적 2–3초 컷 계약

- 고정 17·18·19컷 지침을 제거하고, 승인 뉴스·대본·owner narration에서 먼저 작성·승인한 `newsroom-storyline-v1` prose(뉴스·대본·나레이션 hash, addedNewsFacts, qualifiers, beginning/development/turn/resolution/endQuestion, approved hash)를 컷 계획의 선행 권위로 명시했다.
- 컷 수는 storyline 의미 beat와 locked narration duration에서 유도한다. 정상 컷은 2.0–3.0초이며, 마지막 필수 문장 또는 명시된 필수 문장 경계만 1.5–3.5초 예외를 허용하고 `durationIntent.exceptionReason`과 boundary evidence를 요구한다. 2–4초 균등 분배와 `allowedDurationSeconds: [2,3,4]`는 활성 계약에서 제거했다.
- planner/authority/template와 focused fixture를 갱신했다. `node scripts/newsroom-video-design-planner-tests.mjs` 통과. Provider/render/upload/publication은 실행하지 않았다. Source: [canonical contract](pipelines/newsroom-video-production.md), [success route](../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md).

## 2026-08-15 — 컬러 스토리보드 단일 입력 계약

- 뉴스룸 활성 경로를 `evidence-motion-documentary-v11-color-storyboard`로 통일했다. 컷별 연필 rough와 승인 캐릭터 0–3장으로 ImageGen 컬러 스토리보드 1장을 만들고, Grok에는 그 승인된 컬러 스토리보드만 입력한다.
- 별도 rough·character·environment·prop·document·diagram PNG를 Grok에 함께 넣는 경로와 deterministic/legacy/fallback 경로는 fail-closed다. 루트 `wiki.md`는 제거하고 [canonical contract](pipelines/newsroom-video-production.md)로 단일화했다.
- 플래너·오케스트레이션·editorial plan·creator/verifier·fixtures를 동일 계약으로 갱신했고 필수 두 npm 회귀 suite를 통과했다. Source: [success route](../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md).

## 2026-08-15 — Grok 컷별 새 탭과 의미 우선 QA

- Grok 웹 작업은 컷마다 새 탭에서 reference 업로드, 구체적 한국어 camera/action prompt, 생성, 다운로드를 완료하고 탭을 닫도록 바꿨다. 이전 컷의 첨부·prompt·파일 선택 상태를 다음 컷에 넘기지 않는다. Source: [success route](../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md).
- 사용자 판정에 따라 cut-001 UI 후보 1·3·4는 의미 전달 합격, 후보 2만 실패로 기록했다. 작은 동선·줌·소품 위치 편차는 경고로 낮추고, 잘못된 인물·반대 사건·근거 없는 유죄/파손 방법·신원 노출·의미 역전만 critical failure로 유지했다. Source: [v6r1 manifest](../06-production/opencut-automation/out/.private/research-6b1a8af9b4143acb/grok-meaning-final-v6r1/final-manifest-v6r1.json).
- v37의 17개 완성형 paper-cut keyframe과 Grok 입력용 480px 사본을 생성했다. Chrome 첨부 이벤트 장애로 신규 provider 생성은 완료하지 못했으며, v6r1 private candidate는 새 cut-001과 기존 v5r1 Grok source를 결합한 정직한 재승격본이다. 나머지 컷은 v37 keyframe 재생성본이 아니라고 manifest에 명시했다. Source: [keyframe contact sheet](../06-production/opencut-automation/out/prototypes/research-6b1a8af9b4143acb-v37-production-keyframes-v1/production-keyframes-contact-sheet-v1.png), [v6r1 manifest](../06-production/opencut-automation/out/.private/research-6b1a8af9b4143acb/grok-meaning-final-v6r1/final-manifest-v6r1.json).

## 2026-08-14 — all-Grok 단일 제작 루트와 자산 입장 게이트

- 활성 영상 경로를 `뉴스·법률 → 승인 대본·제목·owner narration → 17~19컷 all-Grok 직접 설계 → 공통 마스터 전체 승인 → 컷 PNG 전체 승인 → Grok 6초 source → semantic clip selection → FFmpeg 조립·QA` 하나로 정리했다.
- 외부 영상 플래너, deterministic 장면 렌더, legacy render, 자동 creative repair/fallback은 새 production authority에서 선택할 수 없다. 과거 파일은 감사 이력과 Grok prompt용 motion grammar 연구로만 보존한다.
- 경찰관 부친 사건의 공통 마스터 13종은 기술·시각 QA를 통과했다. review board SHA-256은 `e1352092b15f71ce6f358a6e241b4e92f00dbb5895da2ae526efe44f6bb7baf1`이며 명시적 사람 승인 대기다.
- 컷 전용 정보요소 51종은 독립 1:1 RGBA PNG로 생성했고, 공통 마스터 13종의 원본과 1254x1254 Grok-square 파생본을 포함한 creator/verifier QA를 통과했다. manifest SHA-256은 `7007423afe93767118e5f122d5a77fb767b3675c6378689997bff720efe4927c`, contact sheet SHA-256은 `f5ea9e9ea7dc4eb5ec1a0a90eb4ebc2eee047a63eea5489af414a56fdd3a30bc`이다.
- 두 세트 모두 `production.approved=false`다. 사용자가 정확한 contact sheet를 승인한 뒤 append-only production successor가 exact bytes를 결합하기 전에는 Grok provider를 호출하지 않는다.

## 2026-08-13 — Rive public-rig inspection and arm import PoC

- Inspected four public CC BY Rive preview files temporarily and retained no binaries. Recorded confirmed object-name evidence, source URLs and topology/weight uncertainty in [the source note](sources/rive-community-character-rig-inspection-2026-08-13.md).
- Updated the Rive workflow contract to require an arm-free torso, exactly one arm/sleeve attachment per side and rigid hand attachments.
- Built and validated the isolated [arm import PoC](../06-production/opencut-automation/studies/rive-character-arm-poc-v1/README.md). Rive Editor weights and extreme-pose seam QA remain pending; no animation, provider, upload or production promotion occurred.
- Opened the Rive Editor and stopped at owner sign-in without entering credentials. The next gate is five-layer import plus left-arm rest/35°/65° seam review only.

## 2026-08-13 — Rive 캐릭터 파츠 시트 연구

- 공식 Rive 문서에 근거한 [Rive 캐릭터 제작 워크플로](concepts/rive-character-production-workflow.md)를 추가했다.
- 승인 캐릭터를 참조해 24칸 ImageGen 파츠 시트를 생성하고 투명 RGBA 후보로 변환했다. 결과는 `needs-repair`이며 세부 내용은 [연구 로그](logs/2026-08-13-rive-character-parts-sheet-v1.md)에 기록했다.
- 이 시트는 제작 권위가 아니며, 셀 수정·분리·정적 조립 QA 전에는 Rive 리깅이나 애니메이션으로 진행하지 않는다.
- 셀 단위 v3 수정으로 몸통·골반만 교체하고 나머지 22개를 보존했다. 24개 개별 RGBA, 24px 안전 여백, 해시·경로 검증은 통과했으며 정적 조립본은 사람의 디자인 검토 대기 상태다.
- 관절 절단선이 보이는 마네킹형 디자인을 우선 후보에서 내리고, 팔 전체와 다리 전체를 각각 하나의 연속 mesh로 쓰는 자연형 20파트 후보를 추가했다. 기계 검증은 통과했지만 Rive weight와 동작은 아직 미검증이다.

## 2026-08-01 — Qwen 음성 생성 파이프라인 canonical lock

- 사용자 승인 preview `msa88n03-34276-4w0ivx`를 [canonical manifest](../03-script-voice/releases/qwen-jeju-canonical-20260801/manifest.json)로 잠갔습니다. Qwen3-TTS 0.6B Base BF16 revision `5d83992436eae1d760afd27aff78a71d676296fc`, 무LoRA·무adapter·무fallback입니다.
- 기존 F4 declarative guide hash와 owner-only `question.wav`(SHA-256 `eca578b86fcfc6e35de187f34de97dbb681dc7994f6ee037a79aeb9602de82ec`, 원본 `녹음 (3).m4a` SHA-256 `d6b4f584b578799dec8bc9e1916e4d85ac3e6e1c1d067a9331cb835432f0ae33`)를 고정하고 세 질문만 exact-match `question` 라우팅합니다.
- 발화 전용 정규화는 `<참교육>`→`참교육에 나오는`, `성적 목적`→`성적인 목적`이며 authoritative 자막/source는 변경하지 않습니다. strict dual-ASR·critical phrase·signal/clipping/tail gate, 13개 0.45초 semantic pause, forward-only 20ms guard, 101 monotonic anchors, no-BGM을 회귀 검사합니다.
- 생성 없는 회귀 명령은 `npm run test:qwen-canonical-jeju`입니다. MP4/narration/handoff golden SHA는 각각 `d1d95d7da08ebc90c6f57aef3ca00f5b414f5d612f75d796dfd9293800ccf015`, `2699e7f9450a915d196ca6086c3f7699c6eab4f4be1f0e542154e94cef6ff946`, `3e050a5e8ba7fb41558ff5af0c8b2349b3826ed699c585b8c3593d6f1b17950a`입니다. 결과는 기술 승인 preview일 뿐 `publishable=false`, `uploadBlocked=true`입니다.
- Checker는 live project narration/releaseGate와 normalized config hashes를 handoff에 대조하고, `ffprobe`로 H.264·단일 mono 24 kHz AAC·무BGM을 확인합니다. Critical phrase 모델은 실제 증거와 동일한 `medium` 단일 모델입니다. active prompt-bank manifest는 비식별 sourceId/SHA/duration/owner-local 메타데이터만 보존하며, immutable golden handoff의 pre-sanitization SHA만 evidence 비교용으로 남겼습니다.
- Privacy migration: prompt-bank manifest의 owner source 절대 경로를 `sourceId`·SHA·duration·`ownerOnly`/`localOnly` 메타데이터로 치환했습니다. 현재 manifest SHA는 `8704f692397d1ac61dcb3507c146153135a1b1809f9c1ab52b151ef6f56e6877`, 기존 handoff golden SHA는 `8fb8c68a22b49c4e8950614979ac69c4594176d03e49b75cd8f14ff7583304b6`로 별도 검증합니다. owner prompt WAV와 원본 녹음은 공개·업로드·handoff/API 노출 금지입니다.

## 2026-08-01 — 제주 한국어 문장경계 13개 무음 보정

- `production-lib.mjs`가 권위 대본의 문장부호를 기준으로 경계를 계산하고 쉼표로 끝나는 줄바꿈은 이어지는 문장으로 유지한다. 마지막 질문은 제외해 13개 경계를 만들며, 기존 무음은 0.45초로 맞추고 없으면 단어 앵커 주변 ±50ms RMS·zero-crossing 지점에 무음을 삽입한다.
- Qwen source-cue 매핑은 전역 단어 앵커를 보존하고, retime 뒤 101개 앵커를 오름차순·중복 제거해 handoff에 기록한다. 자막/권위 대본은 변경하지 않았고 발화 입력의 `성적 목적`→`성적인 목적`, `<참교육>` 꺾쇠 제거 규칙은 유지했다.
- 비공개 렌더 `msa5jb2h-25992-t6lu3e`는 48.73초·1080×1920·30fps이며 narration-only/무BGM이다. handoff의 13개 edit는 모두 0.45초이고 decoded AAC `silencedetect`에서 0.431–0.470초(encoder tolerance)로 확인했다. Qwen provider·production tests, ASR/signal gate(클리핑 0, endpoint 3e-5, boundary jump 0.00061)를 통과했다.
- 후속 검수에서 `현실에도 진짜 필요한 거 아니에요?`의 종결 모음 tail이 앞서 삽입된 것을 확인해, 검색을 최종 ASR 단어 앵커 이후 20ms guard의 forward-only 저에너지·zero-crossing으로 제한했다. `msa60kt5-32072-6qsjsz`는 해당 삽입점을 4.342375초에서 4.400초로 이동했고, hook 5.2초 ASR가 `...필요한 거 아니에요.`를 보존함을 확인했다. 전체 13개 경계와 narration-only 조건은 유지한다.

## 2026-07-31 — 최종 짧은 대본 무BGM 영상·별도 BGM VPS 보관

- 사용자 확정 대본을 [프로젝트 입력](../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json)으로 고정하고, 신규 AI 재연 이미지 12장과 Qwen3-TTS 0.6B Base BF16 내레이션으로 `ms8aq0zb-23556-qfhk7n`을 제작했다.
- 완성 영상은 1080×1920·30fps·52.73초이며 영상에는 BGM이 없다. OpenCut 프로젝트 `24c4fdfa-138c-4b1c-9f1d-23e7cd95b12e`에는 이미지 12개, 자막 35개, 제목과 내레이션만 등록했다. Source: [MP4](../06-production/opencut-automation/out/jeju-school-intrusion-short-v1-ms8aq0zb-23556-qfhk7n.mp4), [handoff](../06-production/opencut-automation/out/registry/versions/ms8aq0zb-23556-qfhk7n.handoff.json).
- 검수용 BGM은 영상과 분리해 [review-bgm.wav](../06-production/opencut-automation/production/projects/jeju-school-intrusion-short-v1/assets/audio/review-bgm.wav)로 생성했다. 제3자 샘플 없이 로컬에서 생성했으며 provenance와 SHA-256을 보존했다.
- 영상과 BGM을 VPS `/opt/youtube-videos/releases/2026-07-31/jeju-school-intrusion/ms8aq0zb-23556-qfhk7n`에 원자적으로 전송하고 `/opt/youtube-videos/current-preview`를 갱신했다. 영상 SHA-256은 `2c38ade79a73cf410241000a98725e3f99bef9489a3e8d21a458a9e7752c0c09`, BGM SHA-256은 `3e88ec6128c7927dca9e7e7b34c83e36521eb4753286580aabb334da10a5833c`이며 서버와 로컬이 일치한다.
- VPS 보관만 수행했다. `publishable=false`·`uploadBlocked=true`와 법률 사람 검토 게이트는 유지하며 YouTube 공개 업로드는 하지 않았다.

## 2026-07-31 — 제주 사건 preview VPS 비공개 보관

- 최종 영상 `school-case-ms7qcycq-28268-nh9zw5.mp4`를 VPS의 `/opt/youtube-videos/releases/2026-07-31/jeju-school-intrusion/ms7qcycq-28268-nh9zw5`에 원자적으로 전송하고 `/opt/youtube-videos/current-preview`로 연결했다.
- 서버의 `sha256sum -c`가 통과했으며 파일 크기 9,818,884바이트와 SHA-256 `1e1bdca6e2b18bcbdab85391d2c5d2b8f1ebaa57439d99c06d607ddb115d2cff`가 로컬 원본과 일치한다.
- 릴리스 디렉터리는 `700`, 영상·`release.json`·`SHA256SUMS`는 `600` 권한이며 공개 웹 경로에 두지 않았다. `release.json`에도 `releaseStatus=preview`, `publishable=false`, `uploadBlocked=true`를 기록했다.
- 이번 작업은 VPS 보관만 수행했다. 법률 QA 차단과 YouTube 업로드 미실행 상태는 유지한다.

## 2026-07-31 — 제주 사건 Qwen F4 E2E preview 완성

- 사용자 승인 대본을 Qwen 전용 확정 입력으로 고정했다. 당시 전용 입력 파일은 이후 제거되어 현재 링크 권위가 아니며, 프로젝트 상태는 [현재 제주 project record](../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json)에서 확인한다. Qwen3-TTS 0.6B Base BF16가 19개 구간을 실제 생성했으며 fallback은 없었다. Whisper small+medium 이중 ASR의 최대 CER은 0.0741로 0.08 게이트를 통과했다.
- 최종 preview는 버전 `ms7qcycq-28268-nh9zw5`, 1080×1920·30fps·2,983프레임·99.43초이다. Source: [MP4](../06-production/opencut-automation/out/school-case-ms7qcycq-28268-nh9zw5.mp4), [registry handoff](../06-production/opencut-automation/out/registry/versions/ms7qcycq-28268-nh9zw5.handoff.json).
- OpenCut 프로젝트 `0986312f-e8a4-4354-8725-9134e71e247c`에 검증된 이미지·KCTV 20개 자산, 편집 가능한 자막 73개, 제목·Qwen 내레이션·BGM 트랙을 등록했다. importer는 같은 세션에서도 원본 media object URL과 thumbnail URL을 유지한다.
- 검증된 private handoff를 재생성 없이 registry로 승격하는 `npm run render:promote-private` 명령을 추가했다. 경로 containment, ID·config SHA, 자산 hash, ffprobe, 중복 파일과 실패 cleanup을 검사한다. Source: [promotion script](../06-production/opencut-automation/scripts/promote-private-render.mjs).
- `test:render-handoff`와 `test:canonical`을 통과했다. 최종 영상과 자산 Range/API 응답, 20개 자산 hash 일치도 확인했다.
- 기존 대법원 2021도7538 관련 release blocker는 별도 사람 검토 전까지 유지했다. 현재 결과는 `publishable=false`, `uploadBlocked=true`, `releaseStatus=preview`이며 YouTube 업로드는 실행하지 않았다.

## 2026-07-30 — Qwen3-TTS Base BF16 고정 및 모델 정리

- 활성 음성 엔진을 `Qwen/Qwen3-TTS-12Hz-0.6B-Base`, CUDA BF16로 고정하고 신규 프로젝트 기본값과 뉴스룸 생성 경로를 Qwen으로 통일했다. Source: [profile](../03-script-voice/voice-clone/profiles/qwen-f4/manifest.json), [new project template](../06-production/opencut-automation/scripts/new-short.mjs), [newsroom integration](../06-production/opencut-automation/scripts/newsroom-lib.mjs).
- 생성기는 모델과 화자 prompt를 한 번만 로드하는 persistent worker, 자연 문장군 합성, 결정적 후보 seed, 무 fallback, source cue 재매핑을 사용한다. Windows Node→Python 표준입력은 UTF-8로 강제해 한국어 손상을 막았다. Source: [provider](../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs), [worker](../06-production/opencut-automation/scripts/qwen3-tts-worker.py).
- Base 가중치는 revision `5d83992436eae1d760afd27aff78a71d676296fc`와 `local_files_only`로 고정했다. worker 시작 실패는 즉시 reject하고, 74°C 도달 시 진행 중 추론을 포함해 worker를 hard-stop하며, 참조음 SHA-256 불일치와 source cue 전체 텍스트 불일치는 생성 전에 차단한다. Source: [worker](../06-production/opencut-automation/scripts/qwen3-tts-worker.py), [provider tests](../06-production/opencut-automation/scripts/qwen3-tts-provider-tests.mjs).
- 발음 검증은 GPU 메모리 충돌을 피하려고 Whisper small+medium을 CPU int8로 실행하며 두 모델 모두 문자 오류율 8% 이하일 때만 통과한다. 실제 BF16 한국어 smoke는 accepted, 최고 GPU 온도 54°C였다. Source: [acceptance](../03-script-voice/runs/qwen-canonical-20260730/smoke.acceptance.json).
- Fish Speech, GPT-SoVITS, CosyVoice, Qwen CustomVoice와 중복 캐시를 삭제해 61.94GiB를 회수했다. 사용자 녹음과 보고서, Qwen Base, Whisper/CAMPPlus 검증 자산은 보존했다. Source: [cleanup report](../03-script-voice/voice-clone/MODEL_CLEANUP_20260730.md).
- 빠른 계약 검증은 `npm run test:canonical`, 실제 GPU 합성은 `npm run test:qwen3-tts-gpu-smoke`로 분리했다. Source: [package scripts](../06-production/opencut-automation/package.json).

## 2026-07-29 — F4 stacked-base stage-2 최종 중단

- target step 40 LoRA를 Fish Speech 1.5 base에 CPU 병합했다. 203 tensor key의 shape가 모두 일치하고 145 tensors가 base와 달랐다. 이 stacked base 위에 fresh r4·alpha 8·LR `1e-5` adapter를 사용했다. Source: [stage-2 report](../03-script-voice/voice-clone/training/F4-stage2-20260729/STAGE2_REPORT.md).
- target 10문장×2와 일반화용 dual-exact salvage 10문장×1, 총 30클립·113.21초로 구성했다. validation 2문장은 hash-lock 상태로 training·augmentation·prompt에서 격리했다. Source: [dataset manifest](../03-script-voice/voice-clone/training/F4-stage2-20260729/fish-dataset-v2/dataset_manifest.json).
- smoke 2/2는 통과했다. 전체 학습은 75°C가 관측돼 74°C hard stop으로 종료했고 재개하지 않았다. 허용 후보 10·15·20 중 step 10만 저장됐으며 validation loss 8.375, top-5 0.36328125였다.
- fixed critical 원문에는 `교권보호국은 제주에서 제조한 텀블러를 봤습니다.`가 포함된다. primary와 turbo 전사는 모두 `교권보호국은 제주에서 제조한 텀블러를 받습니다.`였고 `봤습니다=false`였다. 양쪽 held-out 전문과 나머지 critical token은 통과했다. Source: [stage-2 comparison](../03-script-voice/runs/F4-stage2-20260729/stage2-checkpoint-comparison.json).
- 최종 판정은 `REJECT_NO_STAGE2_CANDIDATE_QUALIFIED`이다. step 10 병합본은 candidate-only이며 selected production model·렌더·업로드를 변경하지 않았다.

## 2026-07-29 — F4 target 보정 입학·안전 중단·모델 채택 거절

- `재물손괴`, `봤습니다`, `교권보호국` target 녹음 3개·10문장은 immutable hash, clipping 0, dual-ASR normalized full exact, critical exact, no-restart/no-long-pause gate를 통과했다. Source: [target admission](../03-script-voice/runs/F4-target-20260729/target-admission.json).
- 기존 salvage 25클립·125.0초를 1회, target 10문장을 최대 2회 사용해 45클립·189.32초를 구성했다. 검증 2클립·14.8초는 training·augmentation·prompt에서 격리했고 VQ는 train 45/45, validation 2/2를 통과했다. Source: [dataset manifest](../03-script-voice/voice-clone/training/F4-target-20260729/fish-dataset/dataset_manifest.json).
- step 40 continuation은 LoRA-only state에 없는 base weight 203개 때문에 strict restore에서 거절됐다. optimizer step은 0이고 원본 checkpoint SHA는 전후 동일하다. Source: [safe resume evidence](../03-script-voice/runs/F4-target-20260729/safe-resume.json).
- base fallback smoke는 2/2를 통과했다. bounded run은 step 44에서 80°C가 관측되어 78°C hard stop으로 종료했고 마지막 안전 checkpoint는 step 40이다. Source: [training safety](../03-script-voice/runs/F4-target-20260729/base-training-safety.json).
- validation 상위 step 40·30은 held-out을 양쪽 ASR에서 통과했지만 critical에서 `교권보호국`, `봤습니다`, `재물손괴` 중 하나 이상을 실패했다. 최종 판정은 `REJECT_NO_TARGET_MODEL_QUALIFIED`, `selected_model=null`; Production·렌더·업로드를 변경하지 않았다. Source: [checkpoint comparison](../03-script-voice/runs/F4-target-20260729/target-checkpoint-comparison.json), [human-readable report](../03-script-voice/voice-clone/training/F4-target-20260729/REMEDIATION_REPORT.md).

## 2026-07-29 — 제주 사건 F4 문장 salvage·안전 중단·채택 거절

- 새 녹음과 기존 clean item을 동일한 whole-file/문장 gate로 재평가했다. 전체 파일 입학은 모두 거절했고, primary·turbo가 canonical 문장과 정확히 일치하며 핵심어·발화 연속성·150ms 경계 조건을 만족한 25/43문장, 125.0초만 salvage했다. Source: [입학 판정](../03-script-voice/runs/F4-20260729/new-recordings-admission-rejection.json), [문장 판정](../03-script-voice/runs/F4-20260729/sentence-salvage.json).
- 검증 2문장·14.8초는 training·augmentation·reference prompt에서 격리했고 25개 학습 audio/lab hash를 manifest에 고정했다. Source: [dataset manifest](../03-script-voice/voice-clone/training/F4-20260729/fish-dataset/dataset_manifest.json).
- Fish Speech 1.5 LoRA 학습은 step 114에서 GPU 83°C가 되어 82°C 상한에 따라 중단했다. 종료 경합으로 생긴 step 120은 평가·병합·probe에서 제외했고, 안전 checkpoint 중 validation 상위 step 60·40만 냉각 후 순차 검증했다. Source: [최종 학습 보고서](../03-script-voice/voice-clone/training/F4-20260729/TRAINING_REPORT.md).
- step 60·40 모두 held-out은 통과했지만 `교권보호국`, `봤습니다`, `재물손괴` 중 하나 이상이 dual-ASR exact gate를 실패했다. 최종 판정은 `REJECT_NO_F4_MODEL_SELECTED`; 후보 병합본은 production model이 아니며 selected marker·프로젝트·렌더·업로드를 변경하지 않았다. Source: [checkpoint 비교](../03-script-voice/runs/F4-20260729/checkpoint-comparison.json).
- 다음 녹음은 `교권보호국`, `봤습니다`와 `받습니다` 대조, `재물손괴`를 여러 짧은 자연 문장으로 집중 확보한다.

## 2026-07-28 — F4 추가 녹음 입학 검사 거절

- 입력과 원본 불변: 학습 녹음 68.117354초, SHA-256 `9932cbe39dbd18c005e36cd25f815f5c7b489e31bd62b600427a38f42466ec20`; 검증 녹음 18.133313초, SHA-256 `180ac9954d84b3a7ac6ed5e4cfaab0f53df35f1e03cf64cfdb39fe6fbf2b7de8`. Source: [입학 검사 보고서](../03-script-voice/voice-clone/training/F4-20260728/RECORDING_ADMISSION_REPORT.md#immutable-source-lock)
- 음향 QC: train -29.4 LUFS/true peak -5.7 dBFS, validation -28.7 LUFS/true peak -9.1 dBFS이며 clipping sample은 모두 0이다. Source: [recording QC](../03-script-voice/voice-clone/training/F4-20260728/RECORDING_ADMISSION_REPORT.md#recording-qc)
- 차단: item 4 `봤습니다→받습니다`, item 5 primary `재물손괴→재물손기`, item 6 false start/restart, item 8 primary `불안에서→불안해서`. Source: [구조화 dual-ASR 증거](../03-script-voice/runs/F4-20260728/recording-admission-rejection.json)
- 재사용 계획: clean item 1·2·3·7은 구간만 기록했으며 Fish Speech 데이터셋으로 복사하지 않았다. item 2의 `열여섯 살→16살`은 ASR 표시 정규화로 기록하되 고정 대본 라벨을 바꾸지 않는다. Source: [reusable clean segment plan](../03-script-voice/voice-clone/training/F4-20260728/RECORDING_ADMISSION_REPORT.md#reusable-clean-segment-plan-not-a-dataset)
- 검증 격리: validation 2/2 문장은 양쪽 ASR을 통과했고 hash-locked 상태로 training·augmentation·reference prompt에서 제외됐다. F4 dataset, smoke/bounded training, checkpoint, merged model은 생성하지 않았다. Source: [결정](../03-script-voice/voice-clone/training/F4-20260728/RECORDING_ADMISSION_REPORT.md#decision)
- 다음 조건: item 4·5·6·8 전체를 clean take로 재녹음하고 같은 dual-ASR/restart gate를 모두 통과해야 F4 학습을 재개한다.

## 2026-07-27 — 다음 영상 선택 화면 단순화

- 동일 후보를 추천 영역과 전체 의미 후보 영역에서 다시 찾아야 했던 흐름을 제거했습니다. 기본 화면은 선택된 소재와 상위 추천 6개에 집중하고, 각 추천 카드에서 원문 확인과 **다음 영상 소재로 선택**을 바로 실행합니다. 선택은 `active-review` 조사 seed이며 제작 확정이나 02단계 통과가 아닙니다. Source: [Research panel](../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx).
- 전체 의미 후보 24개, 규칙 후보, SQLite/수집 통계, Codex 상태는 기본적으로 닫힌 **전체 후보·수집 상세**로 이동했습니다. Source: [Newsroom styles](../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom.module.css).
- 검증: newsroom fixture tests와 focused ESLint를 통과했습니다. `localhost:3002` 브라우저에서 수집 버튼 1개, 다음 영상 후보 제목 1개, 카드 내 선택 버튼 6개, 닫힌 상세 영역 1개, 오류 overlay/console error 0건을 확인했습니다. Source: [verification screenshot](../06-production/opencut-automation/out/newsroom/research-next-story-verification.png).

## 2026-07-27 — 01 조사 30일 단일 실행으로 통합

- 현재 운영 범위를 최대 60일에서 최대 30일로 변경하고 Python 수집기와 archive crawler의 입력을 1..30일로 clamp했습니다. Source: [collect.py](../01-research/news_radar/collect.py), [backfill.py](../01-research/news_radar/backfill.py), [config.json](../01-research/news_radar/config.json).
- 뉴스룸의 수집·역수집·새로고침·의미 선별 버튼을 **30일 뉴스 수집·AI 선별** 하나로 통합했습니다. 이 요청은 30일 수집이 성공한 뒤에만 Codex CLI 의미 선별을 실행하고, 완료된 후보를 다시 불러옵니다. Source: [newsroom-lib.mjs](../06-production/opencut-automation/scripts/newsroom-lib.mjs), [newsroom-cli.mjs](../06-production/opencut-automation/scripts/newsroom-cli.mjs), [Research panel](../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx).
- CLI 전체 실행은 `npm run newsroom:refresh-research`입니다. 단독 수집/진단 명령은 내부 호환을 위해 남기되 프론트 운영 버튼으로 노출하지 않습니다. 60일 실행 통계는 과거 기록으로 보존하며 현재 30일 결과로 재표기하지 않습니다. Source: [package.json](../06-production/opencut-automation/package.json).
- 검증: Python 23 tests, newsroom tests, research-pipeline tests, 변경 TSX/API focused ESLint를 통과했습니다. 첫 실제 실행에서 Codex 한 배치가 기존 120초 제한을 넘어 중단되어 통합 실행의 배치를 30건으로 낮추고 제한시간을 300초로 조정했으며, `collect → analyze` 순서 테스트를 추가했습니다.
- 실제 재실행: RSS 644건, historical discovered/fetched 1,125/1,125건, 30일 archive 2,157건, historical archive 1,154건, 날짜 2026-06-28~2026-07-27, semantic pool 500건입니다. Codex CLI 17개 배치가 완료되어 의미 후보 24건을 저장했고 현재 풀과 불일치한 URL은 0건입니다. 브라우저 검증은 단일 실행 버튼 1개, 상단 후보 카드 6개, 오류 overlay/console error 0건을 확인했습니다. Source: [latest collection status](../01-research/news_radar/data/latest_collection_status.json), [semantic selection](../06-production/opencut-automation/out/newsroom/research-llm-analysis.json), [verification screenshot](../06-production/opencut-automation/out/newsroom/research-30d-verification.png).

## 2026-07-27 — 제주 고정 대본 03~07 하이브리드 재실행 차단

- 입력: [final 대본](../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json), SHA-256 `612d65ba88206b407d032a6b5ae1945545f2d68465984d79c6a3167fb6affbe1`. 대본 내용은 변경하지 않았다.
- 03 음성: [소유자 녹음](../03-script-voice/voice-clone/samples/F3-prosody-prompt.wav)을 cue 1–3에 byte-identical로 배치하고 SHA-256 `6bf6c9a8...2f11`과 local large-v3/large-v3-turbo의 `교권보호국`을 런타임 검증했다. F3 LoRA cue 4–18은 연속 단위·최대 3회·tail trim only·microsegment/합성 silence 없음 정책으로 실행했으나 첫 단위가 3회 모두 `봤습니다` exact 검사를 실패했다. [비공개 실패 증거](../06-production/opencut-automation/out/.private/school-case-ms38nout-17636-4oh18b-failed/failure.json)를 보존했다.
- 04 자산: [검증 manifest](../04-visual-assets/runs/jeju-school-intrusion-20260727T204000+0900.assets.json) 기준 AI 이미지 12종과 KCTV 무음 3초 클립 4개가 checksum·고지·권리 조건을 통과했다.
- 05 BGM: 65초 로컬 생성 [BGM provenance](../06-production/opencut-automation/production/projects/school-case-production/assets/audio/generated-bgm.provenance.json)를 고정했다. SHA-256은 `5598dd85...64fdb`, 보컬과 제3자 sample은 없다.
- 06 제작: 음성 게이트 실패로 새 private MP4와 handoff를 만들지 않았고 OpenCut registry/latest를 갱신하지 않았다. 이후 preview가 생성될 경우 프로젝트 `releaseGate`를 metadata/handoff에 전달하도록 구현했다.
- 07 QA: [차단 보고서](../07-quality-assurance/runs/jeju-school-intrusion-ms38nout-17636-4oh18b.blocked.json)에 `publishable=false`, `uploadBlocked=true`를 기록했다. 고정 문장 `물건 오염만으로 성범죄가 적용되진 않기 때문입니다`는 [대법원 2021도7538](https://www.scourt.go.kr/supreme/news/NewsViewAction2.work?gubun=4&searchOption=&searchWord=&seqnum=8043)에 비추어 범주적으로 안전하지 않아 별도 법률 검토가 필요하다.
- 중단 경계: 새 목표 녹음이 제공되기 전에는 재합성·렌더·OpenCut 등록·업로드를 하지 않는다.
- 검증: Fish provider, Production, editable handoff, media pipeline 테스트와 Node/Python syntax를 통과했다. 실패 실행은 의도한 bounded QA 차단이며 업로드는 실행하지 않았다.

## 2026-07-27 — 01 조사 official archive 60일 역수집

- 이전의 `lookback_days: 60`은 이미 수집한 RSS 항목의 보존 범위일 뿐 과거 기사를 발견하지 못했습니다. 이를 명시적 `--mode backfill --days 60`, `npm run newsroom:backfill-60`, 뉴스룸 **60일 기사 역수집**으로 교정했습니다.
- 공식 provenance: 한국경제·JTBC의 공식 XML sitemap과 나우뉴스 홈페이지가 연결한 날짜별 전체기사 HTML archive입니다. 사건 키워드나 Naver/LLM HTTP API는 사용하지 않았습니다.
- 안전 경계: HTTPS exact host/path allowlist, public DNS 확인, redirect host/path 재검증과 3회 제한, depth 2·hard cap 200 archive pages·URL 4,000개, XML 2MB·HTML 750KB, concurrency 8, timeout 20초, DTD/entity 거절. 기사 본문·미디어는 저장하지 않고 title/canonical/date/bounded description과 `publisher-*` provenance만 저장합니다.
- durable/API/UI: SQLite 전체 archive와 최신 500건 semantic pool을 분리하고 archive count/date bounds, current RSS와 historical discovered/fetched/saved, 출처별 오류를 atomic pool/status와 뉴스룸에 노출합니다. 클라이언트는 1..60의 days만 전송할 수 있고 임의 host/URL은 받지 않습니다.
- 실제 실행: 현재 RSS 763건, historical discovered/fetched 2,235/2,235건, 한국경제 588건 + JTBC 600건 + 나우뉴스 1,045건 = 이번 실행 accepted 2,233건입니다. durable historical archive는 2,238건, 전체 SQLite archive는 3,233건, 날짜는 2026-05-29~2026-07-27(`actualCoveredDayRange=60`), semantic pool은 최신 500건입니다.
- 제주 교실 침입·텀블러 사건의 나우뉴스 원문(`2026-06-17`)은 공식 날짜 archive의 일반 링크 순회로 실제 DB에 저장됐습니다. 사후 exact-URL 검증만 했으며 수집 seed나 키워드 필터로 쓰지 않았습니다.
- 부분 오류: 한국경제 일별 sitemap XML 오류 1건과 삭제 기사 404 1건, JTBC·나우뉴스 0건입니다. HeadlineJeju는 page 파라미터가 최신 1면으로 되돌아오고, 경향신문은 최신 400건 sitemap만 공개하며, 제주MBC는 공식 60일 archive/pagination을 찾지 못해 해당 원문 3건은 미수집입니다. 추측 URL/기사 ID 열거는 하지 않았습니다.
- 검증: Python 23 tests, newsroom fixture tests, 변경 TSX/API focused ESLint, Node syntax check를 통과했습니다. 의미 선별은 비용 통제를 위해 실행하지 않았습니다.

## 2026-07-27 01 조사 rolling window 60일 확장

- `01-research/news_radar/config.json`의 기본 `lookback_days`를 60일로 설정하고 `collect.py`에서 1..60일로 clamp했습니다. SQLite eligible history는 이 유효 범위를 사용하며 bounded semantic 입력은 최신 최대 500건으로 유지합니다.
- `latest_article_pool.json`의 `rolling_window_days`, `NEWS_RADAR_STATS`의 `rolling_window_days`, newsroom API metadata의 `rollingWindowDays`, Research UI ledger에 활성 범위를 기록합니다.
- 발행일이 비어 있거나 파싱되지 않는 기사는 `collected_at`을 만료 시계로 사용합니다. 60일은 앞으로 수집되어 SQLite에 누적되는 rolling 범위이며, RSS에서 이미 밀려난 과거 기사를 소급 backfill하지 않습니다.
- 검증: Python news radar tests 및 newsroom Node tests에 clamp/metadata/stats/backward-compatibility assertions를 추가했습니다.

## 2026-07-27 — 9단계 파이프라인 재구성

- 입력: 사용자가 확정한 01 조사 → 02 맥락·법률 → 03 대본·LoRA 음성 → 04 영상 자산 → 05 BGM → 06 OpenCut → 07 QA → 08 업로드 → 09 아카이브 순서.
- 출력: 루트 단계 폴더, [canonical 영상 계약](pipelines/newsroom-video-production.md), [인덱스](index.md), [단계 문서 9개](pipelines/01-research.md)를 같은 순서로 재구성했다.
- 보존: OpenCut 중첩 Git과 `out`은 [06-production](../06-production)에 유지하고, 이전 Scratch/Vendor·구 8단계 위키·이전 로그는 [09-archive](../09-archive)에 이동했다.
- 제주 상태: 대본·렌더·handoff는 존재하지만 [최종 음성 acceptance](../06-production/opencut-automation/out/latest-render.json)가 false이고 BGM은 pending이어서 업로드가 차단된다.
- 미해결: 법률 적용과 최종 처분은 공개 자료 범위에서 불확실하며 사람의 법률·편집 검토가 필요하다. BGM 생성과 업로드는 실행하지 않았다.

## 2026-07-27 — 01 조사 운영 계약 완성

- 수집: [collect.py](../01-research/news_radar/collect.py)가 RSS/Atom description/summary를 HTML 제거 후 최대 600자로 제한한 v2 풀을 atomic 저장한다. 본문·미디어는 제외하고 SQLite legacy schema에는 `signal_text`를 migration한다.
- 신선도: 풀 생성 시각과 6시간 기준을 API/UI에 노출하고 stale이면 의미 선별을 차단한다. opt-in [scheduler](../06-production/opencut-automation/scripts/research-scheduler.mjs)는 lock·timeout·atomic status로 수집만 반복하며 semantic selection은 계속 수동이다.
- 승격: persisted semantic output과 현재 풀에 모두 있는 exact URL만 [durable dossier seed](../06-production/opencut-automation/out/newsroom/research-dossiers.json)로 승격한다. URL dedupe/idempotency, 승인 시각·provenance·fact-check 위험·관련 보도 후보와 `cross-source-verification-required` 상태를 저장한다.
- 프론트: stale 경고, scheduler 상태, 의미 후보 승격 버튼, active review 카드를 조사 데스크의 기존 editorial UI에 추가했다. 02 인계 전 원문·독립 출처·반론 확인이 필요하다고 명시한다.
- 제주 누락 진단: 2026-06-16~17 dossier 기사들은 2026-07-27 수집의 14일 창 밖이고, dossier 4개 도메인도 기본 뉴시스/SBS/MBN RSS에 없다. 기존 dossier는 google-news/yonhaptv 표적 조사 산출물이다. v1 title-only는 직접 원인이 아니라 유사 사건 의미 판단의 부차 요인이다.
- rolling/source hardening: current snapshot 저장 뒤 SQLite의 14일 history를 다시 읽어 bounded semantic pool을 만든다. 연합뉴스·JTBC·조선일보·한국경제·한겨레의 범용 사회 RSS를 HTTP/XML/최신 원문 기준으로 실검증해 추가했다. 사건별 검색어나 비밀 API는 사용하지 않았다.
- 실행 증거: 확장 후 실수집 761건 → 현재 snapshot 683건 → rolling eligible 959건 → bounded v2 풀 500건 → 규칙 후보 1건. 풀에는 8개 기사 도메인이 있고 398건에 feed excerpt가 있다. scheduler one-shot 성공. 나주 헬스장 선결제 사건 1건을 active-review seed로 실제 승격한 뒤 재호출이 `created:false`임을 확인했다.
- 검증: Python 13 tests, newsroom Node fixture tests, 변경 TSX/API focused ESLint 통과. 전체 `tsc --noEmit`은 기존 `bun:test` 타입 누락과 keybinding/media/registry 오류 때문에 실패했으며 이번 변경 파일 오류는 출력되지 않았다. 새 v2 풀에 대한 LLM 재선별은 자동 비용 발생을 피하기 위해 실행하지 않았다.
- semantic 일관성: source 확장 뒤 persisted 후보 23건 중 현재 bounded rolling pool exact URL에 남은 19건만 API/UI에 노출한다. unavailable 4건과 mismatch metadata를 표시하고 v2 feed excerpt 기준 explicit 재선별 안내를 추가했다. active-review dossier는 별도 durable 기록이라 유지된다.

## 2026-07-29 03-script-voice private A/B pilot

- Ran Qwen3-TTS 12Hz 0.6B Base and GPT-SoVITS V2 against the fixed F4 reference/text set with a <=52°C admission gate, 0.5 s polling, and 74°C hard stop.
- Both models generated local WAV evidence, but primary+turbo ASR strict critical/held-out checks failed. CAMPPlus CPU cosine evidence is recorded in [pilot manifest](../03-script-voice/voice-clone/pilots/model-ab-20260729/pilot-manifest.json).
- Decision: no promotion or production/OpenCut/render/upload change. Full details: [pilot report](../03-script-voice/voice-clone/pilots/model-ab-20260729/REPORT.md).

- Follow-up: official GPT-SoVITS V2 S1 few-shot used 25 admitted sentence clips (125.0 s), with validation/critical/held-out isolation and per-file hashes. Smoke/full runs stayed below the 74°C hard stop (47°C/58°C peaks); full-e2 candidate ASR strict improvement failed, despite CAMPPlus cosine gains. SoVITS S2 was not run under the 8 GB safety bound. Evidence: [few-shot evaluation](../03-script-voice/voice-clone/pilots/model-ab-20260729/gpt-v2-finetune/evaluation.json).

## 2026-08-01 — 남성 레퍼런스 억양 뱅크와 Qwen 후보 선택

- `hyepang_pick`의 active male index 182개 WAV에서 Faster-Whisper 전사와 음향 분석을 수행했습니다. 1,353개 구간 중 한국어 비율·ASR 반복도·신뢰도·활성 음성·상대 피치·클리핑 게이트를 통과한 832개만 후보로 남겼습니다.
- `hook`, `news_exposition`, `tension`, `criticism`, `solution_closing`에 서로 겹치지 않는 20개씩, 총 100개 분석 클립을 배정했습니다. 절대 피치는 점수에서 제외하고 각 구간 중앙값 기준의 상대 반음 변화만 사용합니다. [프로필](../03-script-voice/reference-audio/instagram/hyepang_pick/prosody-bank/profile.json) · [검증기](../03-script-voice/reference-audio/instagram/hyepang_pick/verify_prosody_bank.py)
- Qwen3-TTS는 계속 사용자 F4 prompt bank만 음색·생성 입력으로 사용합니다. 각 구간에서 dual-ASR·핵심어·신호 게이트를 통과한 후보를 2개 이상 만든 뒤 숫자화된 억양 프로필과 가장 가까운 후보를 선택합니다. 제3자 WAV는 Qwen worker로 전달하지 않으며 acceptance/provenance에 프로필 hash와 `thirdPartyWaveformUsedForGeneration=false`를 기록합니다.
- 제주 preview 프로젝트는 `prosodyCandidates=2`로 설정했습니다. 테스트에서는 두 후보 중 낮은 억양 거리 후보가 선택되고 모든 생성 후보의 prompt hash가 사용자 F4 reference와 일치하는 것을 확인했습니다. Production 및 Qwen provider 테스트가 통과했습니다.
- 실제 무BGM 비공개 검수본 `msa1ivf6-19712-s3yca5`를 생성했습니다. 6개 생성 단위가 모두 dual-ASR·핵심어·신호 게이트를 통과했고 각 단위에서 유효 후보 2개 중 억양 거리가 낮은 후보를 선택했습니다. 최종 영상은 50.60초·1080×1920·30fps이며 `publishable=false`를 유지합니다. [영상](../06-production/opencut-automation/out/.private/jeju-school-intrusion-short-v1/jeju-school-intrusion-short-v1-msa1ivf6-19712-s3yca5.mp4) · [handoff](../06-production/opencut-automation/out/.private/jeju-school-intrusion-short-v1/msa1ivf6-19712-s3yca5.handoff/handoff.json)

## 2026-08-01 — Qwen 질문형 owner prompt

- owner source `owner-recording-q3-20260801`은 AAC 48 kHz stereo 19.072 s이며 SHA-256은 `D6B4F584B578799DEC8BC9E1916E4D85AC3E6E1C1D067A9331CB835432F0AE33`입니다. small/medium Whisper가 첫 세 질문을 포함한 6개 질문을 정확히 전사했고 clipping은 0입니다.
- 첫 세 질문을 80 ms 안전 패딩과 120 ms 문장 가드로 이어 붙인 24 kHz mono PCM16 owner prompt를 [question.wav](../03-script-voice/voice-clone/profiles/qwen-f4-reference-guide-v1/prompt-bank/assets/question.wav)에 보존했습니다. SHA-256은 `ECA578B86FCFC6E35DE187F34DE97DBB681DC7994F6EE037A79AEB9602DE82EC`이며 원본 경로·hash·세그먼트 타임스탬프는 prompt-bank manifest에 기록했습니다.
- `question` 스타일과 `questionSentences` exact-match 분할을 Qwen provider/schema/production validation에 추가했습니다. 현재 제주 short의 세 질문만 독립 Qwen 단위로 라우팅하고 주변 선언문은 기존 스타일을 유지합니다. 질문 끝은 상승 억양을 강제하지 않고 녹음된 하강 contour·tail energy·dual-ASR 게이트를 기준으로 검증합니다. Provider/production tests 통과.
- Private render `msa88n03-34276-4w0ivx` accepted Qwen narration: 9 generation units, 3 `question` units, final question required 3 attempts (seeds `20260871`–`20260873`) and then small/medium CER 0.0. The owner `question.wav` hash and prompt-bank manifest hash are present in handoff; final MP4 is 49.6 s with one mono 24 kHz AAC narration track, no clipping, `publishable=false`, and registration/upload stayed blocked.
- Audit: `question-preview.wav` is a local 8.97 s mono PCM listening preview (three question clips separated by 0.7 s). Handoff retains 13 semantic pause edits, 101 monotonic/deduplicated global word anchors, 18 authoritative source cues mapped to 35 visual caption cues, one narration track, and no BGM.
- Registered full Qwen generation: `msaixlix-10524-6d9641` is the canonical full-generated handoff (48.733333 s, 18 source cues, 35 visual caption cues, 88 global word anchors, 13 semantic pauses, no BGM). Exact `<참교육>` spoken text preserves the script aside from non-spoken angle brackets; `성적 목적` remains exact with one +3 semitone local correction and post-correction dual-ASR evidence. MP4 SHA-256 is `1ac6fff5278bf07c99149839879f863700bd1a78397454de3bc09d93b313c3a0`, handoff SHA-256 is `1c06ea2ee7d2d7b5699bd7a3c0b1f422b79e137133cfdca4f3d490e9df769dfd`.

## 2026-08-05 — Tailscale 원격 접속 점검

- Tailscale 1.98.10 서비스가 자동 시작 상태이며 동일 tailnet의 다른 Windows PC와 통신되는 것을 확인했습니다. 로그아웃 후에도 연결을 유지하도록 unattended 모드를 활성화했고, 현재 전원 구성은 절전 안 함입니다.
- 이 PC는 Windows Home 에디션이므로 Microsoft RDP 호스트를 지원하지 않습니다. 라우터 포트 포워딩이나 3389 인터넷 공개는 하지 않았습니다. Windows Pro 업그레이드 후 RDP·NLA를 활성화하고 Tailscale 경로로만 허용해야 합니다.
- 대체 원격 제어로 공식 RustDesk 1.4.9 MSI를 게시된 SHA-256과 대조한 뒤 설치했습니다. RustDesk 서비스는 자동 시작하며 영구 비밀번호를 설정해 로컬 클립보드에만 전달했습니다.
- RustDesk 직접 IP 포트 21118을 활성화했습니다. 설치 프로그램이 만든 전체 주소 허용 인바운드 규칙은 비활성화하고, 승인된 Tailscale 피어에서 이 PC의 Tailscale 주소로 들어오는 TCP 21118만 허용했습니다. 공유기 포트포워딩은 사용하지 않습니다.
- 첫 외부 접속 진단에서 Tailscale과 21118 연결은 정상 도달했지만 RustDesk LocalService 설정의 영구 비밀번호 필드가 비어 있음을 확인했습니다. 관리자 컨텍스트에서 새 비밀번호를 설정하고 서비스 재시작 후 비밀번호 필드·리스너·자동 시작을 재검증했습니다.
- 후속 인증 실패 뒤 영구 비밀번호를 짧은 영문·숫자 조합으로 다시 저장했습니다. 설정 파일 갱신, 암호 필드 존재, 서비스 실행, 21118 리스너 및 로컬 Tailscale 경로를 모두 재확인했습니다.
## 2026-08-09 — 유사 판례 0건 법률 검토 교착 수정

- 자동 승격 사건의 research config가 `laws: []`인 상태에서 유사 판례가 최소 1건이어야만 첫 법률 검토를 완료하던 교착을 수정했다.
- 검증된 유사 판례가 없으면 비교 결론을 만들지 않고 조사 부재와 한계를 명시한 완료 결과를 생성한다. 대본은 특정 죄명·형사책임·처벌·향후 수사 결과를 단정하지 않는 조건으로 진행한다.
- Source: [legal-review-policy.mjs](../06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/legal-review-policy.mjs), [legal-context.ts](../06-production/opencut-automation/opencut-classic/apps/web/src/newsroom/legal-context.ts), [workflow route](../06-production/opencut-automation/opencut-classic/apps/web/src/app/api/newsroom/projects/%5Bslug%5D/workflow/route.ts).
- 검증: `test:legal-review-policy`, `test:newsroom`, `test:research-pipeline`, 변경 프런트 파일 ESLint, 대상 사건의 Stage 02 재생성 및 Stories 브라우저 확인.

## 2026-08-12 — 모션그래픽 판별 학습과 2026 도구 재조사

- 원본 영상·단순 편집·사진 이동·정지 그래픽·캐릭터 애니메이션·3D 재구성과 모션그래픽의 경계를 새 개념 문서로 정리했습니다. 분류 정확성, 디자인 품질, 사건 적합성을 별도 평가하도록 했습니다.
- Adobe, School of Motion, IBM Carbon, Ordinary Folk의 공식 자료를 바탕으로 정보 위계, 연속성, 순차 공개, easing, 음성 동기화, styleframe·animatic 선행 원칙을 기록했습니다.
- 2026-08-12 GitHub 공식 저장소와 문서를 다시 확인해 Remotion, HyperFrames, Motion Canvas, Revideo, D3, Lottie-web, React Three Fiber, Theatre.js, Manim, Blender, OpenTimelineIO, Penpot을 라이선스·활동성·통합 비용·재현성 기준으로 비교했습니다.
- 주 스택은 `Penpot/정적 보드 → Remotion → SVG/D3 → FFmpeg/ffprobe`로 결정했습니다. HyperFrames는 휴대전화 관계망·간호조무사 문서 강조·제주 증거 시간축의 동일 18초 비교 PoC를 통과하기 전에는 보조 후보입니다.
- Canonical production 계약이나 provider/render 상태는 변경하지 않았고, 조사·학습 Wiki만 갱신했습니다.

## 2026-08-12 — ImageGen 2D 캐릭터 제작 계획 및 첫 PoC 규격

- TED-Ed, The Infographics Show, Kurzgesagt의 2026년 공식 영상에서 캐릭터 연기와 정보 그래픽이 결합되는 구간을 선별하고, 실제 영상 삽입과 모션그래픽을 별도 매체로 분류했습니다.
- `evidence-hard / story-soft / motion-early-lock` 원칙 아래 대본·evidence → 매체 선택 → 캐릭터 authority → animatic → 선택적 rig → 최종 렌더 순서를 계획 문서로 고정했습니다.
- 첫 산출물로 익명 성인 캐릭터의 체형, 의상, palette, 선 굵기, 기준 포즈, 파생 편집, identity·anatomy·privacy 검수 규격을 작성했습니다.
- ImageGen master는 승인된 한 장에서만 좁은 편집으로 파생하고, 기본 동작은 Remotion 포즈 교체로 처리하며 반복 관절 동작만 별도 rig 후보로 둡니다.
- 실행 경계: ImageGen/provider/render/upload/publication 호출 없음. Canonical pipeline contract 변경 없음. 사용자 승인 전에는 master 후보도 생성하지 않습니다.
- 미해결: identity drift 허용 기준, chroma와 alpha의 가장자리 품질 비교, 포즈 교체와 part rig의 비용 경계.
- 사용자 지시에 따라 `generic-character-poc-v1/master-candidate-01.png` 한 장만 built-in ImageGen으로 생성했습니다. 결과는 `candidate-unapproved`이며 SHA-256은 `84875bbbfe0b6965dcc14f9d7fc54f94f5550490daa8c8ba818af378ca22983e`입니다. 파생 이미지, 배경 제거, rig, 영상 렌더는 진행하지 않았습니다.
- 실제 TED-Ed 공식 영상 본편 프레임을 다시 확인한 뒤, 일반적인 웹툰형 후보 01–04를 탈락시키고 4.5등신·큰 머리와 손·최소 얼굴선·불규칙 잉크 외곽선·평면색을 적용한 후보 05를 사용자가 승인했습니다. `master-approved-v1.png`는 후보 05와 바이트가 동일하며 SHA-256은 `4f7717edcdda6eab8abcd6314056f98176b68e360a45a585cb83b25d7e859a56`입니다. 이는 PoC 승인이고 Canonical authority 승격은 아닙니다.
- 사용자 지시에 따라 한 페이지형 `character-model-sheet-v1.png`를 생성했습니다. 정면·3/4·좌우 측면·후면, 6개 표정, 기본 신체·손 파트를 포함하며 SHA-256은 `3c78b9842ab2b3606332f6b06ed3bb963212489ef4d8510d86c5a2da4688ebaf`입니다. 상완·하완과 발·발목이 완전한 독립 파트로 분해되지는 않아 디자인 승인용이며 production rig atlas로는 미승인입니다.
- 2026-08-12 캐릭터 PoC 상태를 재검토했습니다. TED-Ed 링크 제목을 실제 공식 영상 `What toys have kids played with throughout history?`로 바로잡고, 승인 master·alpha-v4·model sheet와 거절된 alpha/side-view 이력을 Wiki에 반영했습니다. 이번 3초 테스트 범위는 승인 alpha의 transform animation과 코드로 만든 휴대전화 아이콘·관계선이며, 표정 교체와 관절 rig는 미검증 상태로 유지합니다. 당시 `imagegen-2d-character-production-plan.md`는 제거된 비활성 계획 문서이며 현재 권위가 아니다. Source: [style spec](../06-production/opencut-automation/production/motion-assets/generic-character-poc-v1/style-spec.md), [TED-Ed 공식 영상](https://www.youtube.com/watch?v=aob7rM5PV5A), 확인일 2026-08-12.
- 2026-08-12 Remotion `4.0.508`로 승인 alpha만 사용한 3초 limited-motion study를 격리 제작했습니다. verifier가 1080x1920, 24fps, 72프레임, 3.000초와 입력/output SHA-256을 확인했고 접촉 시트로 캐릭터 등장→휴대전화 아이콘→관계선→라벨 순서를 검토했습니다. 확인 범위는 전체 캐릭터 transform과 코드 SVG이며 표정·관절·hidden fill·production admission은 제외됩니다. Source: [study README](../06-production/opencut-automation/studies/generic-character-motion-test-v1/README.md), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 사용자의 정정에 따라 위 limited transform을 캐릭터 행동 모션으로 인정한 판단을 철회했습니다. 승인 master를 단일 참조로 ImageGen에서 `발견→손을 뻗음→집어 듦→확인` 네 키포즈를 만들고 Remotion 3초 pose-to-pose 테스트로 다시 검증했습니다. 고개·시선·몸통·팔·손·휴대전화 상태 변화는 행동으로 통과했지만, 관절 보간이 아닌 짧은 dissolve 교체이므로 부드러운 연기는 미검증입니다. 제거된 계획 문서는 현재 권위가 아니다. Source: [action study](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/character-action-test.mp4), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 전용 cutout rig atlas를 두 차례 구조 수리한 뒤 Remotion 부모→자식 관절 테스트를 제작했습니다. 첫 atlas의 부착 팔, 수리본의 팔 누락, soft matte의 피부/셔츠 투명도 훼손, 첫 관절 배치의 관절 이격을 모두 탈락시키고 hard-key atlas와 tight crop으로 다시 구성했습니다. 최종 3초본은 어깨·팔꿈치·몸통이 연속 보간되어 행동 PoC에는 통과했지만 로봇 같은 timing과 부정확한 손-휴대전화 접촉 때문에 production/human approval은 보류했습니다. Source: [관절 테스트](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/articulated-character-test.mp4), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 사용자 비율 검토 후 위 관절 PoC 통과 판정을 철회했습니다. 상·하완을 각각 전체 팔처럼 생성한 atlas 때문에 손이 무릎 아래로 내려가고 몸통·다리 비율이 무너졌습니다. 승인 master의 4.5등신과 허벅지 중간 손끝을 잠근 8개 전신 원화를 새로 만들고 8fps 제한 애니메이션으로 재렌더했습니다. 새 결과만 human-review candidate이며 cutout rig는 거절 이력입니다. Source: [수정 영상](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/drawn-character-action-test.mp4), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 위 기록의 `8fps` 표현도 정정했습니다. 3초에 고유 드로잉 8장이므로 실제 고유 드로잉 비율은 2.6667장/초입니다. 깜박임 원인이던 2프레임 dissolve와 silhouette 중앙 정렬을 제거하고, 모든 pose를 완전 불투명 상태로 골반/체중선 anchor에 등록한 v2를 렌더했습니다. 이중 얼굴·외곽선 번쩍임은 제거됐지만 9프레임마다 hard pose change는 남습니다. Source: [v2 영상](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/drawn-character-action-test-v2.mp4), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 — 승인된 generic character alpha-v4에서 화면 오른쪽 팔만 연구용 사본으로 마스킹하고, ImageGen 중간상 없이 하나의 가변 폭 소매 곡선을 24fps로 연속 변형하는 3초 Remotion/SVG PoC를 제작했습니다. 팔꿈치 원형 힌지·겹침선·절단선·디졸브·optical flow는 사용하지 않았고, 열린 어깨 단면은 원래 몸통 아래에 숨겼습니다. 결과 `continuous-arm-mesh-test.mp4` SHA-256은 `0e17870694abf7da7e3e82749a2a164c171dad685fdcd9d1260b3c1ea9f3928e`입니다. 한쪽 팔 외곽선만 검증했으며 손은 벡터 근사, 몸통/머리/다리는 정지, 고정 길이 IK와 production admission은 미검증입니다. Source: [study README](../06-production/opencut-automation/studies/generic-character-motion-test-v1/README.md), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-12 — 사용자 검토에서 `continuous-arm-mesh-test.mp4`가 자세에 따라 팔 두께가 달라지는 실패로 판정되었습니다. 기존 파일은 `rejected-variable-thickness` 이력으로 보존했습니다. 수정본 `continuous-arm-thickness-locked-test.mp4`는 숨김 root taper를 처음 14% 안에서 끝내고 가시 상완·팔꿈치·손목 폭을 normalized sleeve position에만 결합해 프레임 변화와 분리했습니다. 새 SHA-256은 `73bb31094eb81baa084a6ed3b2f1c35dbb10743084a6b8841b9fb57648f21b0c`입니다. 한쪽 팔·벡터 손·비고정 골격 길이는 여전히 미해결입니다. Source: [study README](../06-production/opencut-automation/studies/generic-character-motion-test-v1/README.md), [manifest](../06-production/opencut-automation/out/studies/generic-character-motion-test-v1/output-manifest.json).
- 2026-08-13: Primary-agent 18-cut plan sealed for validation with separate supplemental visual evidence lineage: cut08 `claim-6ef4504d0361`; cut10 qualified `claim-c70549eed18d` (`qualify-claim-c70549eed18d`). No provider/render/upload/Stage07; common masters remain unapproved.
- 2026-08-14: Promoted deterministic motion-tool learning v3 after append-only full-d independently passed 60/60 samples across six engines and ten mechanics per engine. The authority covers non-human motion grammar only and does not authorize story assets, Grok, providers, rendering, upload, publication or Stage 07. Source: [concept record](concepts/motion-tool-learning-v3.md), [current canonical contract](pipelines/newsroom-video-production.md).
- 2026-08-14: Historical project-specific Grok decisions remain in project approval/rejection records and are not active generic instructions. Source: [canonical video contract](pipelines/newsroom-video-production.md), [prompt pack](../06-production/opencut-automation/production/newsroom/projects/research-6b1a8af9b4143acb.grok-multi-reference-prompt-pack-v2.md).
- 2026-08-14: Historical project asset admissions remain immutable audit evidence; active provider input is now one approved color storyboard per cut. Source: [canonical video contract](pipelines/newsroom-video-production.md), [production admission history](../06-production/opencut-automation/out/prototypes/research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1/production-admission-v1.json).
- 2026-08-15: Real-media acquisition v2 remains non-admitted at 20/46 unique primaries; the Openverse/LOC fallback collector preserves blocked partials and requires the per-story 0.90 diversity gate. Source: [v2 acquisition status](syntheses/newsroom-real-media-acquisition-v2-status.md), [fallback collector](../06-production/opencut-automation/scripts/collect-newsroom-photo-assets-v2-fallback.mjs).
- 2026-08-15: Added the append-only Shared Work v2 domestic route. Six item-level CC BY originals were fetched from official Gongu detail pages using the public `wrtFileDownload.do` endpoint, with rights HTML, source SHA-256, decoded dimensions, pHash, and one-to-one story/cut bindings preserved. Independent verifier passed; contact-sheet QA marked five approved and one conditional for a visible PENTAX logo. No provider/render/upload/publication/Stage07. Source: [v2 collector](../06-production/opencut-automation/scripts/collect-gongu-domestic-photo-expansion-v2.mjs), [v2 manifest](../06-production/opencut-automation/out/studies/gongu-domestic-photo-expansion-v2/run-20260815T135157620Z-188ac6/manifest.json), [visual review](../06-production/opencut-automation/out/studies/gongu-domestic-photo-expansion-v2/run-20260815T135157620Z-188ac6/visual-review.json).
- 2026-08-15: Preserved the original Shared Work v2 run and created append-only JSON-fix successor `run-20260815T141200Z-jsonfix-6f10a2` after reproducing a PowerShell `ConvertFrom-Json` failure on the predecessor review file. The successor verifier parses visual-review JSON, checks asset bindings/counts, and recomputes manifest/contact-sheet hashes. Source: [JSON-fix creator](../06-production/opencut-automation/scripts/create-gongu-domestic-photo-expansion-v2-jsonfix.mjs), [strengthened verifier](../06-production/opencut-automation/scripts/verify-gongu-domestic-photo-expansion-v2.mjs).
- 2026-08-15: Active three-story photo collection moved to domestic-only v3: Korean origin institution/rightsholder, Korean capture context, and item-level KOGL0/1 or Korean-rightsholder open/written rights are mandatory. The Wikimedia 46-source run is preserved as audit-only and cannot satisfy the new gate. Source: [v3 domestic-only status](syntheses/newsroom-real-media-acquisition-v3-domestic-only-status.md), [needs creator](../06-production/opencut-automation/scripts/create-newsroom-photo-needs-v3-domestic-only.mjs), [collector](../06-production/opencut-automation/scripts/collect-newsroom-photo-assets-v3-domestic-only.mjs).
- 2026-08-14: cut-001 private Grok request를 5개 ordered reference(교사, 기록 사무실, 전화, 신고 문서, marker)로 creator/verifier 봉인했다. Request SHA-256은 `f3881ae49f341fb2ed6ec675664625f9099bd7c332c3e37831ec583e7b693f85`; 480x480/6초 source와 후속 independent semantic-QA를 요구하고 render/upload/publication/Stage 07은 false다. Chrome 플러그인이 `Browser is not available: chrome`로 연결되지 않아 provider 호출은 아직 발생하지 않았다. Source: [request](../06-production/opencut-automation/out/newsroom/grok-sources/research-6b1a8af9b4143acb/cut-001/request-v1/grok-request-v1.json).
- 2026-08-15: canonical video contract를 `evidence-motion-documentary-v13-hybrid-real-media-admission`으로 갱신했다. Sealed semantic cuts 뒤 `newsroom-real-media-needs-v1`와 `newsroom-real-media-acquisition-admission-v1`, authored-duration 80% gate, 독립 source/provider status, rights/origin/hash/upscale/person/trademark/geo gate를 추가했다. 기존 bytes만 사용한 append-only `three-story-real-media-acquisition-v2`는 Coffeecup/phone/Roundup/foreign ward를 재분류했고 locked timing/cut plan 부재로 authoritative coverage를 false로 보존했다. Hybrid compiler/provider continuation은 deferred이며 provider/render/upload/publication/Stage 07을 실행하지 않았다. Source: [canonical contract](pipelines/newsroom-video-production.md), [source catalog](sources/real-media-source-catalog-2026-08-15.md), [helper](../06-production/opencut-automation/scripts/newsroom-real-media-admission.mjs).

## 2026-08-15 — 실사 미디어 출처 카탈로그 링크·경로 보강

- Openverse와 Google Arts & Culture의 폐기된 URL을 현재 공식 terms/API 경로로 교체했다.
- Flickr Commons, The Met, Art Institute of Chicago, Rijksmuseum, NYPL, NGA, DOI/NPS를 역사·문화 맥락용 보조 수집 경로로 추가했다. 공개 API 노출은 권리 허가가 아니며 origin item 권리와 비저작권 위험을 계속 검증한다.
- 국립중앙도서관의 현재 저작권정책과 공공누리 AI 유형을 연결하고, AI 학습 허용을 Grok image-to-video 입력 허용으로 해석하지 않도록 명시했다.
- Source: [실사 미디어 출처 카탈로그](sources/real-media-source-catalog-2026-08-15.md), captured 2026-08-15.

## 2026-08-15 — 국내 사진 수집 루트·YouTube 정책 대조

- YouTube의 reused/inauthentic-content 수익화 심사는 사진 저작권 허가와 별개이며, 단순 이미지 슬라이드쇼·반복 템플릿은 허가 사진이어도 수익화에 불리하다는 공식 지침을 확인했다.
- 국내 고정 루트에 포토코리아 약 10만 장 KOGL1 OpenAPI, 경찰청·제주교육청 item KOGL1/서면허가, 국가기록원·e영상역사관, 뉴스토어 보도사진 단건 라이선스, 자체·위탁 촬영을 추가했다.
- 현재 미확보 25컷은 경찰관 부친 13컷과 제주 12컷이며, 기관 사진·유료 보도사진·자체 촬영으로 역할을 분리했다. 기존 conditional 21장도 exact cut semantic review 전에는 80% 커버리지로 승인하지 않는다.
- 실제 인물·사건 사진은 Grok 입력을 기본 거부하고, 현실적인 합성 재현은 YouTube altered/synthetic disclosure 대상으로 처리한다. Provider, render, upload, publication, Stage 07은 실행하지 않았다.
- Source: [국내 사진·YouTube 정책 조사](syntheses/korean-photo-acquisition-youtube-policy-2026-08-15.md), [출처 카탈로그](sources/real-media-source-catalog-2026-08-15.md), captured 2026-08-15.

## 2026-08-15 — 컷 내부·컷 전환 모션 레퍼런스 정리

- Reuters/Rare Volume, WSJ, Bloomberg, Vox, NYT, Kurzgesagt, BBC/Gapminder, School of Motion과 공식 도구 예제를 조사했다.
- 공개된 사실과 시각적 관찰을 분리하고, 2–3초 정사각형 뉴스 컷용 내부 패턴 10종과 전환 패턴 10종으로 번역했다.
- 원본 영상·프레임은 다운로드하거나 제작 자산으로 승격하지 않았다. provider/render/upload/publication/Stage 07 호출도 없었다.
- Source: [레퍼런스 조사](sources/motion-reference-cut-mechanics-2026-08-15.md), [패턴 카탈로그](syntheses/newsroom-cut-motion-pattern-catalog.md).

## 2026-08-15 — 짧주 채널 대본·이미지 컷 분석

- 짧주 채널의 2026-08-12~15 공개 Shorts 10편을 한국어 자동자막과 프레임 표본으로 대조했다.
- 대본의 제목→식별→배경→갈등→receipt→반전→결론 구조와 identity/context/direct-evidence/comparison/consequence 이미지 역할을 분리했다.
- 2–3초 컷의 기본 전환을 hard cut으로 두고, 실제 사진의 정보 기여·재사용 상태·source tier를 스토리보드에 기록하는 개선안을 작성했다.
- 분석용 임시 저해상도 사본은 제작 자산이나 권리 authority로 승격하지 않았고 provider/render/upload/publication/Stage 07 호출도 없었다.
- Source: [채널 분석](sources/shortju-youtube-channel-cut-analysis-2026-08-15.md), [스토리보드 개선](syntheses/short-form-storyboard-upgrades-from-shortju.md).

## 2026-08-15 — 3편 공통 내레이션·스토리보드 규칙

- 경찰관 부친, 제주 교실 침입, 간호조무사 커피 살충제 사건의 현재 대본·내레이션 authority와 승인·충돌 기록을 다시 확인했다.
- 훅→대상·장소→사건 행위→직접 증거→수사·재판→남은 간극→피해자 관점 결론의 공통 7단 구조를 정의했다.
- 각 컷에 narration subspan, visual role, canonical source class, image contribution, visual-only claim delta, evidence authority, reuse state, motion, sensitivity, duration을 기록하도록 정리했다.
- Shortju synthesis의 비공식 `generated-gap` 용어를 canonical `grok-generated`로 정정했다.
- 이 문서는 설계 guidance이며 storyline-v2/cut-plan-v2를 봉인하거나 provider/render/upload/publication/Stage 07을 실행하지 않았다.
- Source: [3편 공통 규칙](syntheses/three-story-narration-storyboard-common-rules.md), [canonical contract](pipelines/newsroom-video-production.md).

## 2026-08-15 — 3편 authority reapproval v2

- 제주 `zxdR6K_6vO0`와 간호조무사 `zuJXFG1SlvU`만 YouTube 사람 검토·재승인 evidence로 허용하고, 경찰관 부친은 YouTube claim 없이 복구된 local canonical tuple만 사용했다.
- 세 편의 `newsroom-storyline-v2`, path-free `newsroom-semantic-cut-plan-v2`, `newsroom-real-media-needs-v1` successor package를 생성·독립 검증했다. 모든 컷은 2–3초 intent이며 YouTube 프레임 재사용·provider/render/upload/publication/Stage 07은 거부했다.
- Source: [authority reapproval v2](syntheses/three-story-authority-reapproval-v2.md), [successor verifier](../06-production/opencut-automation/scripts/verify-three-story-authority-reapproval-v2.mjs).

## 2026-08-15 — 3편 실사진 배정·시간 커버리지 v1

- 기존 all-Grok `real-media-needs` 분류를 supersede하고, 봉인된 storyline/cut timing은 그대로 유지한 채 19개 권리 검토 자산을 46개 컷에 결합했다.
- authored-duration 기준 커버리지는 경찰 84.2100%, 제주 88.2359%, 간호조무사 88.2363%, 전체 86.8032%로 독립 검증됐다.
- 휴대전화 손 사진과 농약 용기는 disclosure·로컬 처리 조건으로만 허용했고, 역사적 해외 병동은 제외했다. 모든 provider input은 denied다.
- 19개 사진의 반복 사용은 남은 시각적 다양성 한계로 기록했다. Provider/render/upload/publication/Stage 07은 실행하지 않았다.
- Source: [실사진 admission 기록](syntheses/three-story-real-media-admission-v1.md), [verifier](../06-production/opencut-automation/out/studies/newsroom-real-media-admission-v1/run-20260815T052257Z-bf2f6a/verifier.json).
- 2026-08-15: 스토리보드 컷에 직접 결합한 공유마당 CC BY 원본 21개와 상세페이지를 수집해 SHA-256·해상도·pHash·귀속 문구를 보존했다. 독립 검증과 시각 QA 결과는 승인 후보 10개, 크롭/블러 조건부 1개, 의미 불일치·민감 의료·오인 위험 탈락 10개다. 다운로드 성공은 커버리지 승인으로 계산하지 않는다. Source: [국내 수집 상태](syntheses/newsroom-real-media-acquisition-v3-domestic-only-status.md), [수집 manifest](../06-production/opencut-automation/out/studies/gongu-domestic-photo-expansion-v1/run-20260815T131609032Z-a6e887/manifest.json), [시각 검토](../06-production/opencut-automation/out/studies/gongu-domestic-photo-visual-review-v1/run-20260815T131816008Z-6fc851/visual-review.json).
- 2026-08-15: Modern domestic successor downloaded six 2020 Shared Work CC BY originals at `out/studies/gongu-domestic-photo-modern-v1/run-20260815T141427517Z-48f607`; 3 object-only coffee photographs approved and 3 recognizable-person office photographs rejected. Manifest SHA `1f5ac97e5f397327f05f6588bd66f731e5f96756e4729d7c2a423c6301fa5b61`; contact-sheet SHA `57597f1fb23e276697ce6b85ea2d150fc1ed0ef56695fdb6c8bbd6c852455ac2`. The temporal gate requires `captureDate`, `captureYear`, `temporalEra`, `technologyGeneration`, and `anachronismFlags` on each sealed need/asset; pre-2020 or unknown-date media cannot become approved modern coverage, and optical-disc/feature-phone/CRT flags fail modern laptop/smartphone cuts. Source: [modern manifest](../06-production/opencut-automation/out/studies/gongu-domestic-photo-modern-v1/run-20260815T141427517Z-48f607/manifest.json), [temporal tests](../06-production/opencut-automation/scripts/newsroom-real-media-temporal-tests.mjs), [reclassification](../06-production/opencut-automation/out/studies/gongu-domestic-photo-temporal-reclassification-v1/run-20260815T141332457Z-9028ff/reclassification.json).
- 2026-08-15: Append-only modern successor refresh at `out/studies/gongu-domestic-photo-modern-v1/run-20260815T141824807Z-964f18`; manifest SHA `e8dabb07cd65d544827e237034636e547faaddcc8ba9b501a42092084af79ad5`, 6 acquired, 3 approved, 3 rejected. Device temporal aliases `opticalDiscDriveVisible` and `featurePhoneVisible` are now recorded.
- 2026-08-15: Additional official Gongu laptop-photo audit (`13271646`, `13271689`, `13271508`, `13271510`) downloaded in append-only `out/studies/gongu-domestic-device-crop-v1/run-20260815T142335805Z-420cfb`. Original+crop contact sheet was visually inspected; all four retained hands/faces/bodies or tablet/meeting context, so 0/4 approved and no modern slim-laptop claim was admitted. Smartphone crop audit likewise remains 0 approved. Source: official item-level CC BY pages recorded in the manifest.
- 2026-08-15: Device-crop salvage successor `out/studies/gongu-domestic-device-crop-salvage-v1/run-20260815T142705073Z-a6580b` preserved smartphone originals and deterministic crops. Contact-sheet QA approved one hand-held smartphone crop (device-003) conditionally and rejected two crops (keyboard/no device; lower face/body retained). Manifest SHA `f6f1c269e0cff9c0218ffc85075b6da2e26dcbdb1b20a9636c9e3c0723b113c8`, contact SHA `79e7a8251f45f02287e8d1fd888813b6312c0a7d2ac1dad2492fa3e2cb6e6b17`. No laptop approval.
- 2026-08-15: Verified laptop crop salvage run `out/studies/gongu-laptop-crop-salvage-v1/run-20260815T142844344Z-5c13c2`: 2/2 modern laptop crops conditionally approved after contact-sheet inspection (screen+keyboard, no faces/heads; hands/sleeves only). Manifest SHA `589c9720634ab32527ef2e256c7b1451ced98cb462a9c7379d071aecf9bdfdd3`; contact SHA `f320443e6c9439d39a8b790b949bfc850d6c530f37e420fdcdaeaf78ee6476ef`; independent verifier pass. Smartphone salvage verifier also passes (1 approved, 2 rejected).
- 2026-08-15: Re-ran the official cut-specific KOGL route and independently verified `run-20260815T143734Z-expanded-3b85ab`: 24 conditional files were retained, zero added, 441 search candidates rejected, and `complete=false`. The new append-only three-story completion audit verified all 53 sealed cuts and admitted only two exact modern domestic matches: nurse coffee cuts `cut-001` and `cut-011`. Police is 0/16, Jeju 0/15, nurse 2/15 with 0.117658 authored-duration coverage; 44 real-photo cuts remain blocked. Audit SHA `6368cea7acfdaa818ea404e5d1b6d80b678f8893d15bb12b1b7c10c379662753`. Provider, render, upload, publication and Stage 07 remain false. Source: [completion audit](../06-production/opencut-automation/out/studies/three-story-domestic-photo-completion-audit-v1/run-20260815T144908529Z-18f2d0/completion-audit.json), [verifier](../06-production/opencut-automation/out/studies/three-story-domestic-photo-completion-audit-v1/run-20260815T144908529Z-18f2d0/verifier.json), [status](syntheses/newsroom-real-media-acquisition-v3-domestic-only-status.md).
- 2026-08-16: v5 three-tier photo risk successor verified 24/46 conditional assignments; police 10/16, Jeju 6/15, nurse 8/15. All stories remain below 0.80 and fail closed. [Status](syntheses/three-story-domestic-photo-admission-v5.md).
- 2026-08-16: v5 finalization rerun used sealed authority/reapproval, domestic-photo needs, existing Gongu/KOGL manifests, and the v5 creator/verifier policy. Output: [append-only run](../06-production/opencut-automation/out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/), admission-with-contact-sheets SHA-256 `83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1`, independent verifier SHA-256 `81c1aae0667574addf3b53f04889153f6fcd8b2e9cae77d5574db3b4868bde19`. Counts: 53 active cuts, 46 real-photo needs, 24 conditional assignments, 22 blocked, 7 generated, 12 unique primaries. Exact coverage/remaining: police-father `28.955/55.016=0.526301` (6), jeju-school-intrusion `17.920/50.773=0.352943` (9), nurse-pesticide-coffee `22.962/48.794=0.470591` (7). Unresolved cuts remain blocked; all stories `approved=false`. No provider, render, upload, publication, or Stage 07 action was taken. [v5 status](syntheses/three-story-domestic-photo-admission-v5.md), [verifier](../06-production/opencut-automation/out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/verifier.json).
- 2026-08-16: Independent verifier rerun preserved the original `verifier.json` and wrote [verifier-rerun-20260815T162624275Z.json](../06-production/opencut-automation/out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/verifier-rerun-20260815T162624275Z.json), SHA-256 `d0f5beb316c3ba768a5780d16488174acd40b17760f7fd65387f797355c9df47`; `verified=true`, `errors=[]`, same admission SHA and coverage. No provider actions.
- 2026-08-16: Added the sequence-first/radio-edit successor contract and negative gates. The append-only creator/verifier reads sealed authority run `run-20260815T051236587Z-a2871f` plus v5 assets `run-20260815T162235412Z-7840eb`; it preserves cut IDs and reports remaining evidence gaps (6/9/7) without authorizing provider, render, upload, publication, or Stage 07.
- 2026-08-16: Sequence-first visual assembly successor run [run-20260816T000003000Z-sequence-v1](../06-production/opencut-automation/out/studies/three-story-visual-assembly-v1/run-20260816T000003000Z-sequence-v1/) verified true; plan SHA-256 `ad02ebd469856a154aac9f4694f28bb37527014a5247ab6a6a65b5fa69a6a3f9`, 53 cuts, 18 visual blocks, authored screen-time coverage police `0.526301`, Jeju `0.352943`, nurse `0.470591`, remaining evidence gaps `6/9/7`.
- 2026-08-16: v2 coverage/evidence split successor [run-20260816T000007000Z-sequence-v2](../06-production/opencut-automation/out/studies/three-story-visual-assembly-v2/run-20260816T000007000Z-sequence-v2/) verified true; plan SHA-256 `a477a8c65a5397ce0e7b2004e63f6842f6a35ffd5a8762075f361cc899343dfb`. Photo screen-time coverage is police `0.842100`, Jeju `0.882359`, nurse `0.882363`; evidence completeness remains false with unresolved gaps `6/9/7`. 46 semantic-phase blocks (maximum two cuts), 12 admitted assets; all provider/render/upload/publication/Stage 07 gates remain false.
- 2026-08-16: v3 v5-preserving successor [run-20260816T000009000Z-sequence-v3](../06-production/opencut-automation/out/studies/three-story-visual-assembly-v3/run-20260816T000009000Z-sequence-v3/) verified true; plan SHA-256 `861d0bfad08a342b2bdaf4bb8101dc7a5d3368f4c6844df833bf5bf8fe0a04de`. Original admitted assignments remain unchanged; only blocked cuts gain adjacent phase-compatible context. Coverage police `0.842100`, Jeju `0.882359`, nurse `0.882363`; evidence gaps `6/9/7`; 47 blocks, 12 assets, 53 cuts.
- 2026-09-05: Stage 03 canonical script contract를 input package schema 19, generator prompt v15, critic prompt v5, critique v4, active wrapper v6, generation schema 18, planning mode `v15-script-authority-only`로 갱신했다. Exact owner-rate 5초 prefix의 비교 hook 감사, narrative architecture/cold-open 정보 이득, retention ledger·portable-coda 차단, action-scene 조기 법적 결과 누출 차단, hash-bound editorial intent와 legacy 충돌 fail-closed를 명시했다. 기존 v14 기록은 읽기 전용 호환으로 보존하며 provider/render/finalize/upload는 실행하지 않았다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-05: Stage 03 active contract를 단순화한 v16으로 교체했다. Generator는 검증 근거에 맞는 서사 엔진 하나와 narration·문장 claim refs만 만들고, 별도 critic은 수정 권위 없이 네 범주의 `pass|revise|reject`만 반환한다. non-pass는 자동 rewrite/retry 없이 원자적으로 거절한다. Exact 5초 comparative audit와 고정 narrative architecture/retention metadata는 active path에서 제거했고, 사용자가 명시적으로 좋아한 road-rage 대본·hook만 immutable style reference로, machine 문구는 anti-pattern으로 구분했다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-05: v16 첫 runtime 시도가 594 compact chars/86.463초로 안전하게 거절된 결과를 반영해 acceptance 70.0~80.0초는 유지하면서 generator 목표만 74~76초 내부 구간으로 조정했다. Prompt는 package의 observed owner rate에서 compact Unicode budget을 계산하며 현재 6.87자/초 기준 509~522자다. 자동 rewrite/retry와 기존 rejection audit/active authority는 변경하지 않았다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-05: Stage 03 v17/schema 21은 candidate·event dossier·legal report로부터 URL/경로 없는 hash-bound case brief를 결정적으로 만들고, 의미 역할·시간순 beat·중복 제거 facts·source grouping/corroboration·법률 허용/금지·claim-bound narrative inventory를 생성기/읽기 전용 critic의 주 입력으로 사용한다. 모든 대본 문장 claim refs, 무재시도, reject 원자성, 확정 권위 보호와 legacy v16 읽기 호환은 유지한다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-06: Stage 03 generator prompt v20은 deterministic 70.0~80.0초 admission을 유지하면서 내부 문자 목표를 owner rate의 72.75~78초(현재 6.87자/초에서 500~535자)로 옮겼고, case brief 근거보다 사실의 시점·기간을 확대하지 않는 안전 경계를 추가했다. Critic v9은 factual/legal read-only, 무수정·무재시도 계약을 유지하며 prompt v19 rejection/history는 읽기 호환으로 보존한다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-06: v20 runtime이 compact 462자/67.249초로 안전하게 거절된 결과를 반영해 Stage 03 prompt v21의 길이 지시만 사람이 셀 수 있는 띄어쓰기·문장부호 포함 700~720자로 바꿨다. 코드 admission은 계속 compact 481~549자/70.0~80.0초이며 critic v9, 무수정·무재시도, rejection 보존 계약은 변하지 않는다. Source: [canonical contract](pipelines/newsroom-video-production.md), [implementation guide](../06-production/opencut-automation/production/newsroom/youtube-shorts-script-guide.md).
- 2026-09-23: 통찰맨 채널과 `VQazcEuV9Xw` 숏폼을 style-reference로 추가하고, 사진 배경 위 평면 캐릭터·표정 교체·짧은 모션그래픽을 위한 좁은 GitHub 후보(Remotion, GSAP, Motion Canvas)를 기록했다. 초기 모션값은 측정값이 아닌 테스트 제안이며, 영상 저작권·CC 여부는 확인하지 않았다. 구현·렌더러 승격·provider/render/upload/publication은 실행하지 않았다. Source: [focused reference](sources/naemuseupda-cutout-motion-references-2026-09-23.md), [focused addendum](syntheses/motion-graphics-toolchain-2026.md).
- 2026-09-23: `VQazcEuV9Xw`의 49개 1초 샘플·ROI 변화 후보를 바탕으로 대본 beat→rough shot→소재→motion class→자체 자산 재현의 역분석 절차를 기록했다. 샘플은 경계·중간 모션·원본 레이어 구조를 확정하지 않으며, 29–30초 드론·분사 장면도 source video로 판정하지 않았다. 분석 사본 재사용과 MP4 재제작은 실행하지 않았다. Source: [shot reverse note](sources/neoibwat-VQazcEuV9Xw-shot-reverse-2026-09-23.md), [analysis metadata](../production-studio/research/reference-reverse-v1/analysis/metadata.json).
- 2026-09-23: 사용자가 공유한 X 게시물의 GitHub 후보를 좁혀 Hypit·HyperFrames Student Kit·OpenChatCut·anything2explainer의 역할과 라이선스 경계를 기록했다. Hypit식 beat/anchor 구조와 Student Kit 모션 패턴을 기존 Remotion과 결합하는 방안을 제안했으며, 설치·실행·렌더·제작 권위 승격은 하지 않았다. Source: [repository note](sources/x-donbaek2-motion-repos-2026-09-23.md), [donbaek2 X post](https://x.com/donbaek2/status/2100375215775924633?s=46).
- 2026-09-23: `VQazcEuV9Xw` 단일 레퍼런스의 v2 creator analysis를 생성했다. 0.5초 전 구간 샘플·20개 후보 전후 프레임·44–48.5초 0.1초 상세를 사용해 22개 grouped beat와 `[0,1464)` frame map을 만들었으며, 후보를 hard cut으로 확정하지 않았다. 대본 의미 요약·관찰·추론·미확인을 분리했고, comparison MP4는 원본 참조 패널과 자체 SVG 연구 렌더의 비교물로만 기록했다. source reuse license·사건 사실은 미확인이고 provider/render/upload/publication은 실행하지 않았다. Source: [v2 README](../production-studio/research/reference-reverse-v2/README.md), [v2 report](../production-studio/research/reference-reverse-v2/REPORT.md), [shot map](../production-studio/research/reference-reverse-v2/shot-analysis.json).
