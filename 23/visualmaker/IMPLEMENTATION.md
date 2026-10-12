# VisualMaker implementation — 2026-09-17

현재 구현은 **P1 장면 편집 MVP + 수동 원본 등록**이다. 원 설계의 `DESIGN.md`/`BACKLOG.md`는 변경하지 않은 제안 부분까지 포함한 역사 자료다. 여기서는 구현과 남은 작업을 구분한다.

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

## 아직 연결하지 않은 항목

1. 실제 LLM Analyzer/Director, 구조화 응답 provider adapter와 한국어 품질 평가. 로컬 규칙 제안은 의미 해석 품질을 보증하지 않으며 `queryEn`을 자동 번역한 것으로 표시하지 않는다.
2. Studio에서 기존 Commons/KOGL/Pexels 검색 결과를 자료 요구에 배정하는 연결. 현재는 명시된 검색어 링크와 수동 파일 등록이다. 기존 `/sources` 수집기는 별도 도구다.
3. 음성 업로드/TTS 정렬, 프레임 시계, 애니매틱, 실제 Remotion/Omni 렌더.
4. 유료 생성 작업 큐·예산 원장·취소/중복 요청 복구, 클라우드 인증.
5. v0.2 JSON → runtime v1 변환, 파일 포함 백업 ZIP, 검토 marker를 만드는 UI.

대본 재작성은 사용자가 직접 작성한 비교안만 채택한다. 로컬 자동 위험 표시가 모든 수치·단위·주체·부정/예외 변경을 판별하는 것은 아니다. 자동 이미지 검증도 캡처/실명/의미·권리를 판정하지 않는다. 검토 전 자산을 제작 authority로 넘기는 경로가 없는 상태를 유지한다.

## 검증과 변경 검토

빠른 검사: `pnpm run visualmaker:check`. 저장소 정식 검사: `pnpm run check` (기존 영상 회귀 검사 포함). 결과와 화면 증거는 [이번 작업 기록](../audit/visualmaker-2026-09-17/README.md)에 기록한다.

현재 작업 폴더에는 `.git`이 없다. 기존 문서/설정은 `audit/visualmaker-2026-09-17/before/`에 최초 바이트를 보관했다. 검토용 `git diff --no-index`와 새 파일 목록을 제공하며, 저장소 생성·commit·push·삭제는 이 구현에 포함하지 않는다.
