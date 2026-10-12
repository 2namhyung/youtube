# 위키 운영 로그

## 2026-07-27 — 9단계 파이프라인 재구성

- 입력: 사용자가 확정한 01 조사 → 02 맥락·법률 → 03 대본·LoRA 음성 → 04 영상 자산 → 05 BGM → 06 OpenCut → 07 QA → 08 업로드 → 09 아카이브 순서.
- 출력: 루트 단계 폴더, [대시보드](../wiki.md), [인덱스](index.md), 단계 문서 9개를 같은 순서로 재구성했다.
- 보존: OpenCut 중첩 Git과 `out`은 06에 통째로 유지하고, 이전 Scratch/Vendor와 구 8단계 위키는 [09-archive](../09-archive)에 이동했다.
- 제주 상태: 대본·렌더·handoff는 존재하지만 최종 음성 acceptance가 false이고 BGM은 pending이어서 업로드가 차단된다.
- 미해결: 법률 적용과 최종 처분은 공개 자료 범위에서 불확실하며 사람의 법률·편집 검토가 필요하다. BGM 생성과 업로드는 실행하지 않았다.

## 2026-07-27 — Research 프론트 연결

- 루트 `package.json`과 `start.ps1`에서 포트 3002 뉴스룸을 실행하도록 연결했다.
- 01 Research의 `latest_candidates.csv`를 읽기 전용 `local-research-radar` 어댑터로 Newsroom API와 대시보드에 연결했다.
- 수집기 단위 테스트 5건, Newsroom fixture 테스트, HTTP 후보 조회와 7개 섹션 초안 변환, 브라우저 후보 표시를 검증했다.
- 구현·검증·운영 연결이 추가되어 01 Research 완성도를 84%에서 89%로 조정했다. 편집·권리 승인 기록과 스케줄러는 여전히 미구현이다.

## 2026-07-27 — 단계별 완전성 감사

- **입력:** 각 단계 `README.md`, 최소 관련 구현·테스트·출력 메타데이터. 원본 [`01-research/data/news-media-audit`](../01-research/data/news-media-audit)는 변경하지 않았고 `api.txt`는 읽거나 출력하지 않았다.
- **방법:** 입력·구현·설정/의존성·검증·산출물/운영을 각각 20점으로 채점했다. 존재가 확인된 파일만 사실로 기록하고, 역사 경로와 예약 단계를 별도 불확실성으로 표시했다.
- **출력:** 루트 대시보드 [`wiki.md`](../wiki.md), 인덱스 [`wiki/index.md`](index.md), 단계 문서 8개(`wiki/pipelines/01-research.md`–`08-vendor.md`)를 생성했다.
- **확인된 신호:** Fish provider 테스트와 voice recorder 테스트가 통과했다([provider test](../04-production/opencut-automation/scripts/fish-speech-lora-provider-tests.mjs), [recorder test](../03-voice/voice_recorder/tests/test_server.py)). 활성 경로는 새 단계로 해석되며, 현재 등록 OpenCut 렌더는 약 59.97초다([latest-render.json](../04-production/opencut-automation/out/latest-render.json)).
- **재확인 실행:** `python -m unittest discover -s tests -q`를 `03-voice/voice_recorder`에서 실행해 3개 테스트가 `OK`임을 확인했다([테스트](../03-voice/voice_recorder/tests/test_server.py)).
- **이전 검증 실행:** `node scripts/fish-speech-lora-provider-tests.mjs`를 `04-production/opencut-automation`에서 실행해 통과했다([테스트 스크립트](../04-production/opencut-automation/scripts/fish-speech-lora-provider-tests.mjs)).
- **점수 교정:** 등록 렌더와 별개로 중첩 최종 내레이션 판정이 실패했으므로 Voice를 86→79점, Production을 92→83점으로 낮췄다. 최종 QA 실패 시 게시·승격을 차단하는 것을 회복 조건으로 삼았다.
- **미해결:** latest-render와 일부 handoff의 절대 경로가 이동 전 루트를 가리킨다. 내레이션 메타데이터는 최상위 `accepted=true`지만 중첩 `speechAcceptance.final.accepted=false`이며 세 cue 오류가 남아 있다. 02·05는 계약/예약 단계라 승격 산출물이 없다.

## 2026-07-27 — 운영 런북 확장

- **목적:** 01–08 각 단계 페이지를 목적·트리거·입력·의존성·명령/수동 계약·내부 순서·산출물·인계 게이트·검증·복구·공백까지 포함한 한국어 운영 런북으로 확장했다([단계 인덱스](index.md)).
- **확인한 근거:** `01-research/README.md`, `news_radar/collect.py`, `config.json`, `test_collect.py`, `data/latest_candidates.csv`; 02·05·06·07·08 각 README와 실제 폴더; `03-voice/voice_recorder/{README.md,start.ps1,server.py,tests/test_server.py}`, `voice-clone/{README.md,model-lock.json,verification.json}`; `04-production/README.md`, automation `README.md`, `package.json`, `scripts/produce-short.mjs`, provider·newsroom·render-handoff·research 테스트, `out/latest-render.json`을 읽기 조사했다. 비밀 `api.txt`와 불변 원본 `01-research/data/news-media-audit` 내용은 읽거나 변경하지 않았다([AGENTS](../AGENTS.md)).
- **작성 출력:** [루트 운영 방법](../wiki.md#운영-방법), [인덱스 handoff/빠른 시작](index.md), 8개 런북([01](pipelines/01-research.md)–[08](pipelines/08-vendor.md))을 갱신했다. 각 페이지에 보존 점수 84·7·79·83·13·36·26·48을 유지했다.
- **문서화한 명령:** `python collect.py`, `python -m unittest -v test_collect.py`, recorder `./start.ps1` 및 `python -m unittest discover -s tests -q`, clone `download_model.py`/`synthesize.py`, Production `npm run short:produce -- --project ...`, `node --check`, `production-tests.mjs`, `render-handoff-tests.mjs`, `research-pipeline-tests.mjs`, `newsroom-tests.mjs`를 기존 README/package/code에서 파생해 적었다. 네트워크 수집·TTS 합성·렌더·다운로드·업로드는 실행하지 않았다.
- **미해결:** 04의 현재 59.966667초 렌더는 `speechAcceptance.final.accepted=false`(cue 7·11·15)라 05 승격을 차단해야 한다. 02·05는 실행 코드가 없는 계약 단계이고, 06–08은 보존/실험/vendor 감사 자동화와 일부 provenance가 없다. `out`·scratch 메타데이터의 역사적 절대 경로는 live config로 취급하지 않는다([latest render](../04-production/opencut-automation/out/latest-render.json)).
- **검토 교정:** Voice 포트 변경 명령을 PowerShell 환경 변수 문법으로 교정했다. 활성 OpenCut 프로젝트는 프로젝트 내부 이미지·KCTV 교체 클립을 사용하며, 별도 `video_project`는 현재 등록 렌더의 직접 입력으로 확인되지 않아 독립 레거시 경로로 명시했다([프로젝트 manifest](../04-production/opencut-automation/production/projects/school-case-production/project.json)).

## 2026-07-27 — Newsroom 기사 묶음

- `newsroom-lib.mjs`에 결정적 기사 묶음, 안정적 ID, 쇼츠 적합도 세부 점수와 단일 기사 보존 로직을 추가했다.
- 중복 실행 잠금이 있는 `collect-research` API/CLI를 추가하고, Research 패널에 분리된 뉴스 수집·파일 새로고침과 원문 기사 펼침 기능을 추가했다.
- 검증: Newsroom 스크립트의 `node --check`와 `node scripts/newsroom-tests.mjs`가 통과했다.
- 다중 수집·기사 묶음·쇼츠 적합도 운영이 추가되어 01 Research 완성도를 89%에서 91%로 조정했다. 편집·권리 승인은 여전히 사람의 확인이 필요하다.
- 프론트와 동일한 수집 API를 실운영 검증해 250건 수집, 중복 정리 후 216건, 엄격 필터 후보 1건을 확인했다. 화면에는 이 세 수치를 별도 원장으로 표시한다.
## 2026-07-27 — Optional Research Codex CLI evaluation

- Added bounded `analyze-research` CLI/API action using local `codex exec` in an isolated temp directory with strict schema/application validation and sanitized persistence (`out/newsroom/research-llm-analysis.json`).
- Added CLI availability/version detection and Research panel button/status plus explicit AI-suggestion labeling. Deterministic story grouping remains usable when CLI is unavailable or output is rejected.
- Verification: `node 04-production/opencut-automation/scripts/newsroom-tests.mjs`; mocked valid, unknown-URL, and unavailable-child cases pass; live `node scripts/newsroom-cli.mjs codex-status` reports codex-cli 0.121.0.
