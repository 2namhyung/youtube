# VisualMaker implementation — 2026-09-17

## 2026-10-13 현재 추가 사항: 녹음 수집 백엔드

Studio용 인증 API에 사용자 음성 녹음 수집과 읽기를 추가했다. WAV/MP3/M4A를 실제 바이트 형식으로 판별하고 시스템 ffprobe에서 오디오 스트림과 길이를 측정한다. Plan JSON의 선택적 `narrationTakes`에 파일 SHA-256, 대본 SHA-256, 수집 리비전, 측정치를 저장하고 콘텐츠 주소 파일 및 별도 검증 기록을 읽을 때 다시 확인한다. 대본 변경은 이전 녹음을 삭제하지 않고 현재 대본과 불일치하게 표시할 수 있게 한다. 프로젝트 사본 import에서는 녹음 기록을 비운다. 이 항목은 2026-09-17의 원래 구현 목록을 소급해서 바꾸지 않는다.

API의 `productionAuthority`는 계속 false다. 자동 음성 정렬과 최종 녹음 승인은 구현되지 않았다. 이후 Studio에 녹음 업로드·재생 화면과 별도 렌더 엔진 진단·정식 컷 임시 렌더 어댑터를 연결했다. 현재 EP001의 실제 정식 컷 렌더 성공은 입력 부재로 검증되지 않았다.

같은 날짜에 수동 내레이션 시간 초안 API와 화면을 추가했다. 녹음된 전체 길이를 발화 문단의 글자 수에 비례 배분하는 미저장 추정치를 보여주고, 사용자가 정한 문단별 초 범위를 검증해 불변 이력으로 저장한다. `narrationTimings`는 대본·녹음 SHA-256과 발화 문단의 ID·Unicode 구간·문장 스냅샷에 묶인다. 이 기록은 자동 음성 정렬이나 실제 단어 발화 시점 측정이 아니며, 제작 파일에 쓰지 않는다.

수동 확인을 명시한 새 시간 초안은 현재 대본·녹음·리비전에 일치할 때 문단별 작업용 SRT/VTT로 내보낼 수 있다. 오래된 미확인 이력은 JSON으로만 읽는다. 자막 생성은 자동 정렬·자막 승인·영상 조립을 의미하지 않는다.

Studio의 에피소드 타임라인 점검은 현재 `episode-spec.json`의 36컷 순서·임시 프레임 창과 현재 Plan의 가져온 장면 대응을 읽기 전용으로 보여준다. `GET /api/studio/timeline`은 인증·프로젝트 리비전·Plan/episode-spec/production-state SHA-256에 결속되고, `format=download`는 영상이 아닌 1MB 이하 점검 정보 JSON이다. 활성 컷 루트가 있을 때 최근 작업 최대 50개·장면당 최신 후보 최대 2개의 메타데이터를 조회하지만 영상·영수증·컷 입력은 이 요청에서 읽거나 검증하지 않는다. 성공 작업 기록도 `preview.available=false`이며 작업 패널의 인증된 정식 컷 영상 경로에서 별도로 검증한다. 이 조회 범위 밖 결과는 없다고 단정하지 않는다. 활성 컷 루트가 없는 현재 EP001에서는 작업 조회도 생략하고 36개 빈 구간과 차단 이유를 반환한다. 녹음 문단 초안은 컷 프레임 창과 별도로 표시한다. 이 타임라인 점검 자체는 음성 동기화·영상 조립·제작 승인이 아니다. 별도 조건부 오디오 조립 작업은 현재 제작 입력과 측정 최종 녹음을 요구한다.

자막 직렬화는 발화 문단의 리터럴 `<`, `>`, `&`를 안전한 텍스트로 이스케이프하고 CRLF를 LF로 정규화한다. 빈 줄이나 지원하지 않는 제어 문자가 큐 경계를 흐릴 경우 SRT/VTT는 거부하며 대본 바이트를 수정하지 않는다. UTF-8 응답은 1MB 이하로 제한하고 이력 JSON은 유지한다.

현재 구현은 **장면 편집·원본/로컬 아카이브 후보/녹음 수집·선택형 실시간 자료 검색과 수집·수동 시간 초안과 작업용 SRT/VTT·타임라인 점검·진단 렌더·검증 조건부 정식 컷 및 전체 에피소드 시각 임시 렌더·조건부 최종 녹음 오디오 조립**까지다. 전체 유튜브 제작 도구의 완성이나 현재 EP001 정식 렌더 성공을 뜻하지 않는다. 원 설계의 `DESIGN.md`/`BACKLOG.md`는 변경하지 않은 제안 부분까지 포함한 역사 자료다. 여기서는 구현과 남은 작업을 구분한다.

## 설계에서 채택하고 바꾼 것

| 항목 | 현재 결정 |
|---|---|
| 기반 | 현재 저장소의 Next.js 15 / React 19 / Node SQLite 재사용. script2video 코드를 복사하거나 포크하지 않음 |
| 편집 도메인 | Script/Segment → Beat → Scene → Candidate. 원문 해시·Unicode code point 구간, 방향 잠금, 리비전 충돌, 원문 변경 이력 |
| UI | `/studio`의 대본·장면표·표현/자료 패널. 키 없는 로컬 규칙 초안과 직접 편집 |
| 규격 | `core/model.ts`와 `core/director.ts`의 `visualmaker-plan-v1` 검증. `contracts/scene-plan.schema.json` v0.2는 이전 제안이며 호환 import를 주장하지 않음 |
| 표현 | 전달 역할, 자료 확보, 독립 레이어, 시작/변화/끝을 구분. 고정 6종 template registry는 실행하지 않음 |
| EP001 | 현재 spec에서 대본·모드·검색 브리프를 읽고 원문 SHA에 결속한 작업 사본 생성 |
| 소스 | 요구와 실제 파일을 분리. 업로드 decode/hash/출처 검증 후에도 pending. 캡처는 화면 밖 근거 전용 |
| 저장 | SQLite 프로젝트 + 불변 revision snapshot. 트랜잭션 안에서 baseRevision·잠금 검사, 실패 시 rollback |
| 제작 연결 | JSON/CSV/자료 요구/전달안 export. 전달안은 proposal-only. episode-spec·generated contracts·active root·approval marker에 쓰지 않음 |

`방향 선택/잠금`은 장면표의 편집 상태다. `자료 승인`, `style-frame PASS`, `cut PASS`, `production authority`와 합치지 않는다. 비교 대상·기간·정확 원문이 필요한 설명은 Remotion 방향으로 설계하되 화면용 독립 원본과 화면 밖 사실 근거를 따로 요구한다. 가상 연속성은 명시적으로 선언된 경우에만 후보로 사용한다.

작업대의 시간 가안은 현재 [episode-spec의 측정 발화율](../video/episodes/episode-001/episode-spec.json)인 공백 제외 4.965자/초를 기본값으로 사용한다. 가져온 컷은 기존 추정 시간을 보존하고 대본을 바꾸면 해당 장면의 발화 원문으로 다시 계산한다. 녹음 길이·reading hold·전환이 검증된 타임라인은 아니다.

## 파일 경계

- `core/model.ts`: 클라이언트/서버 공통 TypeScript 규격과 이름.
- `core/director.ts`: 로컬 초안 생성, 참조·원문 검증, 편집 명령, 변경 영향, CSV/자료 요구.
- `core/store.ts`: SQLite 트랜잭션·원장·원본 경로/hash 검증.
- `core/episode.ts`: EP001 read-only import와 비생산 전달안.
- `core/upload.ts`: 허용 미디어 decode, 해시 파일명, 출처 메타데이터.
- `core/http.ts`: 로컬 host/origin/세션 토큰과 본문 크기 제한.
- `../src/app/api/studio/`: 목록/생성/수정/내보내기/파일 등록 API.
- `../src/components/studio/studio.tsx`: 세 패널 편집 UI.

## 제작 흐름

```text
현재 대본 또는 episode-spec 작업 사본
  → 의미/표현 대안/자료 요구
  → 선택 · 수정 · 재사용 · 방향 잠금
  → 원본과 근거의 실제 확보/사람 검토
  → 검토할 editorial handoff
  → 사용자 채택 후 episode-spec 수정
  → 기존 생성기 · 검증기 · 제작 stage gates
```

후속 적용 시 `originUnchanged=false`면 현재 spec과 다시 비교한다. JSON 불러오기는 새 프로젝트 사본을 만들고 기존 프로젝트를 덮어쓰지 않는다. 계획 JSON은 미디어 백업이 아니며 등록 자료가 없거나 hash가 바뀌면 복원/JSON export가 실패한다.

## 원래 설계 당시의 미연결 목록과 현재 남은 범위

AI 실행 경로는 아래 원래 Gateway 구현 이후 [Codex CLI](AI-CLI-TASK.md)로 전환했다. API 키 없이 서버의 CLI 로그인을 사용하며 실제 모델·한국어 품질은 미검증이다. 전체 기능의 동일 가중치 코드 구현율 추정치는 6/10, 약 60%다. 조건부 출력 경로 구현을 현재 에피소드의 제작 완료와 구분한다.

아래 목록은 2026-09-17의 원래 설계 백로그다. 이후 로컬 아카이브 후보, 녹음 수집·수동 시간 초안, Remotion 진단·조건부 컷/전체 시각 임시 렌더 및 오디오 조립이 추가되었다. 제한된 제공자 검색·선택 수집은 Studio와 API에 연결됐다. 조건부 자막·최종 출력과 승인된 음악·효과음의 v2 고정 게인 믹싱도 Studio에 연결됐으며 합성 입력의 브라우저 경로를 검증했다. 자동 음성 정렬과 실제 EP001 승인 제작은 아직 완료하지 않았다.

1. 실제 LLM Analyzer/Director의 사용자 작업 흐름과 한국어 품질 평가. [AI 분석 코어](AI-ANALYZER-TASK.md)와 [지속 작업/API](AI-ANALYSIS-JOB-TASK.md)는 선택적 Gateway adapter, 엄격한 구조화 응답 검증, 원고·리비전 해시 결속과 검토 전용 제안을 구현했다. 호출 체크포인트·중복 요청 방지·취소/복구·인증된 결과 조회를 합성 모델로 검증했다. [Studio 분석 화면](AI-ANALYSIS-UI-TASK.md)에서 명시적 요청·실행과 구간별 제안 검토를 제공한다. 격리된 합성 프로젝트의 실제 브라우저에서 설정 부재 시 실행 차단, 기존 결과 조회, 현재·이전 리비전 대기 작업 취소, 대본 변경 후 제안·동의 초기화를 확인했다. [선택한 분석 결과를 기획에 반영하는 백엔드](AI-ANALYSIS-ADOPTION-TASK.md)는 원문·제안 해시와 장면 잠금을 재확인한 단일 트랜잭션 및 기획 이력을 구현했다. [반영 화면](AI-ANALYSIS-ADOPTION-UI-TASK.md)도 구간 선택·기존/제안 메시지 비교·방향 초기화 확인·반영 이력과 공유 쓰기 잠금을 구현했고 독립 자동 검사와 코드 검수를 통과했다. [격리된 실제 브라우저 검증](AI-ANALYSIS-ADOPTION-BROWSER-TASK.md#local-browser-acceptance)에서 잠금·병합 구간 차단, 두 구간의 단일 리비전 반영, 재로딩 후 이력 보존과 API/DB의 원본·미선택 장면 보존을 확인했다. 실제 제공자의 한국어 품질·과금 검증은 남아 있다. 기존 Studio 제안기는 로컬 규칙이며 `queryEn`을 자동 번역한 것으로 표시하지 않는다.
2. Wikimedia Commons·NASA·LOC 선택형 검색과 파일 수집은 Studio에 연결됐다. KOGL/Pexels 및 대본 기반 자동 검색은 미연결이며 기존 `/sources` 수집기는 별도 도구다.
3. TTS·자동 음성 정렬·실제 Omni 생성은 남아 있다. 녹음 수집·수동 시간 초안·Remotion 진단·조건부 컷/전체 시각 렌더·오디오 조립·picture lock 이후 조건부 자막·믹스·최종 출력은 구현됐으나 실제 EP001의 인간 승인 제작 완료와는 다르다.
4. 유료 영상 생성 작업 큐·예산 원장·클라우드 인증은 남아 있다. AI 분석 큐의 호출 체크포인트·취소/중복 요청 복구는 별도로 구현했으나 금액 상한이나 실제 청구 검증을 제공하지 않는다.
5. v0.2 JSON → runtime v1 변환, 파일 포함 백업 ZIP, 검토 marker를 만드는 UI.

대본 재작성은 사용자가 직접 작성한 비교안만 채택한다. 로컬 자동 위험 표시가 모든 수치·단위·주체·부정/예외 변경을 판별하는 것은 아니다. 자동 이미지 검증도 캡처/실명/의미·권리를 판정하지 않는다. 검토 전 자산을 제작 authority로 넘기는 경로가 없는 상태를 유지한다.

## 검증과 변경 검토

빠른 검사: `pnpm run visualmaker:check`. 저장소 정식 검사: `pnpm run check` (기존 영상 회귀 검사 포함). 결과와 화면 증거는 [이번 작업 기록](../audit/visualmaker-2026-09-17/README.md)에 기록한다.

현재 작업 폴더에는 `.git`이 없다. 기존 문서/설정은 `audit/visualmaker-2026-09-17/before/`에 최초 바이트를 보관했다. 검토용 `git diff --no-index`와 새 파일 목록을 제공하며, 저장소 생성·commit·push·삭제는 이 구현에 포함하지 않는다.

## 추가 구현: 읽기 전용 미리보기 준비 상태

현재 Studio의 준비 상태 패널은 `visualmaker-preview-readiness-v1` 보고서를 요청할 때만 생성합니다. SQLite의 현재 프로젝트 문서를 읽기 전용으로 열어 프로젝트 ID·리비전을 확인하고, 선택 방향의 자료 요구에 대해 원본 경로·크기·SHA-256·등록 영수증과 현재 출처/사용 조건/의미 관찰을 검사합니다. 손상된 자료나 선택하지 않은 대안은 전체 응답을 숨기지 않고 장면별로 구분합니다. 임시 녹음의 미등록·손상은 가안 장면의 차단 사유가 아닙니다.

클라이언트는 보고서의 프로젝트·리비전·대본 SHA-256·계획 스냅샷 SHA-256과 네 개의 false 권위 필드를 확인하고, 전환 시 이전 요청을 중단합니다. 이 보고서는 실제 프레임·재생 미리보기·컷 PASS를 생성하지 않습니다. `pnpm run visualmaker:check`에 서버 평가와 클라이언트 범위 검사를 포함했습니다.
# Renderer diagnostic boundary

The independent `renderer-diagnostic` job runs only a fixed Remotion self-test composition from `visualmaker/renderer`. Its bundle uses an empty job-local public directory and does not read Plan assets, narration, episode files, or production entrypoints. It publishes exactly `diagnostic.mp4` and `diagnostic.json` after actual video probing and frame decode; the authenticated media route revalidates the persisted hashes. The report's `remotion-motion` profile is only an engine-execution label, never motion-grammar or cut approval. All production and review flags remain false. This does not implement `render-preview` or turn preview-readiness into a PASS.

## Canonical cut adapter (bounded scope)

`canonical-cut-preview` is a new, separate durable job kind. The read-only contract route binds a current imported Plan scene to one episode-spec cut, current active root, generated contracts/catalog, physical cut membership, and four fixed production validators. The immutable job contract persists independently of the Plan snapshot and is re-evaluated before rendering and publishing. A child process bundles the existing `video/src/production-index.tsx` with only the selected composition's local input closure, selects the catalog composition without props overrides, renders a full-length provisional H.264 MP4, and probes/decodes it before atomic two-file publication. Media and download routes require local authentication, job/project/scene/attempt scope, receipt integrity, source/runtime fingerprints, and file hashes. Cancellation and a whole-job deadline fence the publish; false production/review flags are unconditional.

Current EP001 has no active cut root, so only the blocked contract/job path is executable with current inputs. Neither this adapter nor its synthetic tests establish successful production rendering, source/rights/grammar approval, or cut PASS. Future work still requires actual approved assets, human reviews, additional providers/automatic discovery, post-picture-lock captions/mix/final export, and an independently exercised canonical success path. Conditional audio assembly is implemented separately; it does not close these gaps.

## Audio assembly and lifecycle verification boundary

`audio-timed-assembly` binds current canonical visual inputs and unique measured final narration, re-renders EpisodeTimeline and copies its video stream while adding sample-aligned audio. Studio readiness and scoped OPFS playback use dedicated authenticated APIs. Production authority and human review flags remain false.

The shared publisher validates stored contracts/current Plan snapshots, leases, input fingerprints and output bytes before atomic publication; the shared reader verifies bytes and receipts through an open descriptor. Production worker and media route retain canonical revalidation. Isolated tests may call these lower-level functions with a synthetic SQLite contract and real Remotion/FFmpeg media to exercise cancellation, expired leases, drift and tampering. That fixture cannot pass the production media API and does not prove eligible-authority end-to-end success. See [the task card](AUDIO-TIMED-ASSEMBLY-TASK.md) for executed evidence and remaining gaps.

## Whole provisional episode renderer (backend, 2026-10-14)

`POST /api/studio/jobs`의 `kind=episode-provisional-video`는 `projectId`, `baseRevision`, `idempotencyKey`만 받는다. 현재 EP001 작업 사본의 대본·컷 순서가 현재 `episode-spec.json`과 일치하고 활성 컷 루트·생성 카탈로그/TS·물리 컷 수·입력 해시가 정확할 때만 큐에 넣는다. 기존 제작 검증기 네 개와 `cut-review-approved` 단계 잠금 검사를 실행한다. Omni 컷은 생성 영상 파일과 별도의 `omni-generated-motion` playable PASS 및 현행 review bundle SHA를 요구한다. 컷 영상 MP4를 이어 붙이지 않고 기존 `video/src/production-index.tsx`의 `EP001-Episode-Provisional` Remotion composition 전체를 실행하므로 카탈로그의 컷 겹침·전환을 그대로 사용한다.

워커는 실제 media 입력을 소유한 임시 public 폴더에 복사하고 원본/복사본 해시를 렌더 전후와 결과 게시 전에 재확인한다. H.264 무음 MP4를 FFprobe 프레임·FPS·길이·크기·오디오 스트림 수로 측정하고 첫·중간·끝 프레임을 FFmpeg로 디코딩하여 SHA-256을 기록한다. 출력 MP4와 실행 범위·컷·경계·입력·runtime 해시·측정값을 담은 JSON 영수증을 한 작업 시도에 게시한다. 출력은 4GB 이하, 단일 입력은 2GB 이하, 총 입력은 16GB 이하로 제한하고 게시용 두 번째 MP4 복사까지 저장 공간을 예약한다. 출력·입력 해시는 1MB 버퍼로 스트리밍 계산한다. 임대·취소·60분 제한·재시도/복구는 기존 작업 큐 규칙을 따른다.

`GET /api/studio/jobs/episode-media?jobId=…&projectId=…&baseRevision=…&attempt=…`는 인증 후 현재 계획·제작 입력·검증기·영수증·MP4 해시를 다시 확인하고 MP4를 작은 메모리 청크로 스트리밍한다. `Range: bytes=start-end` 단일 범위도 지원하며 전체 파일을 메모리에 싣지 않는다. 해시를 계산한 바로 그 열린 파일 디스크립터를 응답 스트림에 전달하고 읽는 동안 파일 identity를 재확인하므로 같은 크기의 경로 교체 파일을 전송하지 않는다. `name=provisional-episode.json`은 영수증 다운로드다. 매 요청마다 전체 입력·검증기 확인이 반복되므로 큰 소스나 탐색 재생은 느릴 수 있다. 이 경로는 현재 입력 결속을 엄격히 확인하며 오래된 영상을 자동으로 최신 승인으로 취급하지 않는다. 카탈로그·review bundle 해시는 기존 직렬화와 동일한 SHA-256을 제한된 청크로 계산한다. 일부 기존 제작 검증기 자체에는 아직 전체 파일 읽기 경로가 남아 있어 매우 큰 후보 입력의 검증 메모리 상한까지 보증하지는 않는다.

### 선택형 실시간 자료 탐색·수집 백엔드

`GET /api/studio/source-search`는 `projectId`, `baseRevision`, `requirementId`, `provider` (`wikimedia|nasa|loc`), `mediaType` (`image|video`), 명시적 `query`, `page`를 모두 요구한다. 현재 빈 자료 요구·제작 방식·장면 잠금을 확인한 뒤 제공처 메타데이터만 최대 12개 읽고 `visualmaker-live-source-v1` 범위·후보 카드·metadata SHA-256을 반환한다. 탐색 자체는 파일·SQLite·보관함을 변경하지 않는다. Wikimedia Commons는 사진/영상, NASA Image Library와 Library of Congress는 사진만 지원한다. 다른 제공처와 유형은 명시적으로 거절한다. 후보 카드에는 다운로드 URL을 보내지 않고, 제작자·권리 정보가 없으면 미상으로 남긴다. Commons `imageinfo.url`은 원본, NASA 검색 preview는 파일이 아니며 LOC `image_url`은 원본 여부 미확인 변형본으로 표시한다.

`POST /api/studio/source-acquire`는 같은 범위·검색어·페이지·선택 provider ID·metadata SHA-256에 `semanticNote`, `evidenceOnly`를 더해 한 항목만 요청한다. 서버는 검색 메타데이터를 재조회해 ID/해시를 비교한다. NASA는 별도 `/asset/{nasa_id}` 게시 파일 목록에서 이미지 파일을 골라 목록 SHA·선택 SHA를 영수증에 결속하며 검색 preview를 수집하지 않는다. NASA manifest가 고정 `images-assets.nasa.gov` 호스트의 HTTP href를 줄 때만 주소 구조·인증정보·포트·경로를 검사하고 HTTPS로 바꿔 요청한다. HTTP 요청은 하지 않으며 제공처의 원래 href와 실제 HTTPS 선택 주소를 내부 provenance 영수증에 각각 보존한다. 클라이언트 후보 카드에는 다운로드 주소를 보내지 않는다. 고정 HTTPS 호스트·리디렉션 차단·시간 제한·메타데이터 1MB·원본 40MB 스트리밍 상한·MIME/실제 디코드 검사 후 기존 `attachUpload`의 리비전/원본 해시/트랜잭션을 재사용한다. 결과는 항상 `pending-review`, 모든 자료·권리·의미 승인은 미결이고 `productionAuthority=false`다. 제공처 차단(예: LOC 403)은 실패로 보고하며 빈 검색 결과로 바꾸지 않는다. 이 API는 episode-spec·활성 컷·제작 승인 파일을 쓰지 않는다.

이 영상은 시각 임시본만 담고 음성·자막·최종 승인 단계는 담지 않는다. `productionAuthority=false`, `reviewApproved=false`, `audioSynchronized=false`를 유지한다. 실제 EP001은 `timing-draft`, 활성 컷 루트 없음, 생성 카탈로그/계약 없음으로 enqueue 시 blocked가 된다. 별도 격리된 12프레임 합성 Remotion composition의 실제 렌더·디코드·H.264/무음 측정은 확인했으나 정식 EP001 성공 증거가 아니다.

Studio의 `전체 에피소드 임시 영상` 패널은 현재 Plan과 계약 해시를 확인한 뒤 작업을 요청하고, 차단 이유와 대기·실행·재시도를 일반 작업 목록에 표시한다. 작업 생성 응답을 수락한 후 목록 새로고침에 실패하면 저장 사실과 갱신 실패를 따로 표시하며, 확인되지 않은 요청은 같은 idempotency key로 재시도한다. 성공한 같은 프로젝트·리비전·시도의 결과는 인증된 JSON 영수증을 최대 2MB로 읽어 artifact SHA-256과 범위·측정값을 다시 확인한다. 전체 MP4는 브라우저 메모리에 한 번에 복사하지 않는다. OPFS(origin private file system)를 지원하는 브라우저에서 인증된 MP4 응답을 최대 2GB의 고유 임시 파일 하나에 청크로 저장하고 정확한 전달 바이트 수를 확인한 뒤 디스크 파일을 재생하거나 다운로드한다. 브라우저 quota 추정치는 사전 안내용이며 실제 quota 실패도 처리한다. 정상 취소·실패·컴포넌트 해제에서는 자신이 만든 정확한 파일명만 정리한다. 갑작스러운 탭·브라우저 종료 시 삭제 보장은 없다. 기존 사용자 파일을 선택하거나 덮어쓰지 않는다. 서버는 제공 직전 MP4 SHA-256을 스트리밍 검증하지만 브라우저가 저장된 큰 파일의 SHA-256을 독립 재계산한 것은 아니다. 실제 EP001 전체 영상 성공·시각 검토는 아직 확인되지 않았다.
# Archive candidate → Studio bridge (2026-10-13)

`/api/studio/archive-candidates`는 현재 Plan 리비전과 자료 요구에 묶어 기존 `ARCHIVE_DB_PATH` (기본 `data/archive.sqlite`)를 읽기 전용·`query_only`로 조회한다. 없으면 `unavailable`로 표시하며 생성·마이그레이션하지 않는다. 최대 20개씩 ID cursor로 제목·제공처·수집 검색어만 찾는다. 로컬 경로와 다운로드 URL은 응답에 포함되지 않는다.

`/api/studio/archive-import`는 항목 ID와 기대 SHA-256을 다시 조회하고 `ARCHIVE_RAW_ROOT` (기본 `data/raw`) 안의 정규 파일·크기·해시를 확인한 뒤 기존 이미지/영상 디코더로 검사한다. Studio 소유 content-addressed 바이트와 새 영수증의 archive provenance를 Plan 리비전 업데이트와 함께 기록한다. 업로드 공통 저장 경로는 새로 만든 바이트/영수증만 실패 시 회수하고, 같은 SHA의 기존 바이트는 바이트 일치 재검증 후 보존한다. 후보는 항상 `pending-review`, `productionAuthority=false`이며 archive review_queue 결과는 가져오지 않는다. 스크린샷·문서는 근거 확인 전용이다. 실제 사용자 보관함 수집/승인, 정식 제작 렌더 성공은 이 연결로 증명되지 않는다.
