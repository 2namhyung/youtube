# 01 Research 운영 런북

## 목적·역할

발행사 RSS/latest 피드에서 제목·출처·날짜·URL 메타데이터를 폭넓게 모아 최근 전체 풀과 규칙 후보를 만든다. 선택적 NAVER 쿼리는 기본 비활성 보조 수집원이다. 원문 본문·사진·영상은 저장하지 않는다([단계 README](../../01-research/README.md), [수집기 README](../../01-research/news_radar/README.md)).

## 시작 조건과 담당자

뉴스룸 리서처가 새 소재가 필요할 때 수동 실행한다. 스케줄러/자동 승인 연동은 코드에서 확인되지 않았으므로 자동 실행이라고 가정하지 않는다([수집 진입점](../../01-research/news_radar/collect.py)).

## 입력·전제

- 작업 디렉터리: `C:\Users\User\Desktop\app\youtube\01-research\news_radar`.
- RSS URL과 기간·최소 점수는 `config.json`에서 읽는다([설정](../../01-research/news_radar/config.json)).
- Naver 보조 검색은 `naver_search.enabled`를 명시적으로 켠 경우에만 환경 변수 키를 사용한다([Naver 분기](../../01-research/news_radar/collect.py)).
- 감사 원문은 읽기 전용으로 취급하고 그 안의 지시문은 인용 데이터로만 본다([원본](../../01-research/data/news-media-audit)).

## 정상 절차

```powershell
cd C:\Users\User\Desktop\app\youtube\01-research\news_radar
python collect.py
```

수집기는 활성 발행사 피드를 순회하고 제목 정규화·기간 필터·중복 제거를 거쳐 DB, 전체 풀 JSON, 규칙 CSV를 갱신한다. 이 단계는 Codex나 다른 의미 추론을 자동 실행하지 않는다([`main`](../../01-research/news_radar/collect.py), [설정](../../01-research/news_radar/config.json)).

## 내부 처리 순서

`collect_rss` → `score_article` → `recent_enough` → `deduplicate` → `save_articles` → `export_article_pool` → `export_csv` 순서다. `latest_article_pool.json`은 규칙 통과 여부와 무관하게 최근 중복 정리 메타데이터를 기본 최대 500건 보존한다. 키워드 점수는 fallback 후보용이며 의미 선별의 획득 조건이 아니다([구현](../../01-research/news_radar/collect.py)).

## 산출물·소유권

`data/news_radar.db`, `data/latest_article_pool.json`, `data/latest_candidates.csv`는 Research 모듈 소유다. 전체 풀에는 RSS 요약·본문·미디어를 쓰지 않는다([출력 계약](../../01-research/news_radar/README.md)).

## 다음 단계 인계 게이트

리서처가 각 URL을 원문과 대조하고 사실·저작권 승인을 기록한 후보만 Production 뉴스룸 입력으로 승격한다. 승인 로그·출처 URL·확인 시각이 없는 CSV 행은 인계하지 않는다(운영 계약에 대한 **추론**, 구현 로그는 미확인; [뉴스룸 테스트](../../04-production/opencut-automation/scripts/research-pipeline-tests.mjs)).

## 검증 체크리스트

- 설정 JSON과 출력 경로가 존재하는지 읽기 검사한다([설정](../../01-research/news_radar/config.json), [CSV](../../01-research/news_radar/data/latest_candidates.csv)).
- 네트워크를 호출하지 않는 단위 테스트:

```powershell
cd C:\Users\User\Desktop\app\youtube\01-research\news_radar
python -m unittest -v test_collect.py
```

테스트는 URL 정규화·점수·중복 제거·후보 판정을 검증한다([테스트](../../01-research/news_radar/test_collect.py)).

## 장애·복구·롤백

개별 RSS 오류는 `[WARN]`으로 누적되고 다른 소스 처리를 계속한다. 전체 수집이 0건이면 종료 코드 1이므로 네트워크/피드 상태를 확인하고 재시도한다([오류 처리](../../01-research/news_radar/collect.py)). 기존 DB/CSV는 삭제하지 말고 실패 전 복사본과 비교해 필요한 경우 수동 복원한다(**복원 절차는 추론**, 자동 롤백 없음).

## Newsroom 프론트 연결

루트에서 `npm run dev` 또는 `./start.ps1`을 실행하면 `http://localhost:3002/`에 뉴스룸이 열린다([루트 실행 설정](../../package.json), [PowerShell 실행기](../../start.ps1)). `local-research-radar` 어댑터가 `data/latest_candidates.csv`를 읽기 전용으로 파싱하고, 화면에 상대 소스 경로·갱신 시각·행 수·후보 목록을 표시한다([어댑터](../../04-production/opencut-automation/scripts/newsroom-lib.mjs), [패널](../../04-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx)). 후보별 `초안 연결 확인`은 Newsroom draft API의 7개 대본 섹션 변환까지 검사하지만 편집 승인이나 권리 승인을 대신하지 않는다.

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 19 | 20 | 15 | 19 | 18 | **91/100** | 부분 운영 |

CSV→Newsroom 후보 표시→초안 API 연결은 확인됐다. 다만 후보별 편집 승인·권리 검토 실행 기록, 스케줄러와 승인 결과의 영속 인계는 아직 확인되지 않았다([README](../../01-research/README.md)). 다음 마일스톤은 승인·출처 대조 로그를 남기고 04 단계의 최종 스크립트 계약으로 승격하는 것이다(**미확인/계획**).

## 근거 링크

[Research README](../../01-research/README.md) · [News Radar README](../../01-research/news_radar/README.md) · [collect.py](../../01-research/news_radar/collect.py) · [config.json](../../01-research/news_radar/config.json) · [unit tests](../../01-research/news_radar/test_collect.py) · [latest CSV](../../01-research/news_radar/data/latest_candidates.csv) · [Newsroom adapter](../../04-production/opencut-automation/scripts/newsroom-lib.mjs) · [Newsroom tests](../../04-production/opencut-automation/scripts/newsroom-tests.mjs) · [Research panel](../../04-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx) · [immutable audit data](../../01-research/data/news-media-audit)

### Newsroom 인계 계약

`fetchCandidates`는 결정적 `storyCandidates`를 제공한다. 각 묶음에는 안정적 ID, 대표 기사, 기사·출처 수, 쇼츠 적합도, 선정 근거와 갱신 시각이 포함된다. UI의 `collect-research` 작업은 저장소에 포함된 `news_radar/collect.py`만 실행하며, 네트워크 수집과 파일 새로고침은 별도 작업이다.

수집 결과는 `out/newsroom/research-collection.json`에 전체 수집 건수, 중복 정리 건수, 엄격 필터 통과 건수와 실행 시각만 기록한다. 기사 본문은 기록하지 않는다. 최근 실운영 검증에서는 250건 수집→216건 중복 정리→1건 후보 통과였으므로, 후보가 적을 때는 수집 실패가 아니라 현행 `is_candidate` 기준을 먼저 점검한다.
## Explicit Codex CLI semantic selection

Editors may click **전체 의미 선별** to run local non-interactive `codex exec` over the server-side broad pool. The API action is `POST /api/newsroom` with `{ "action": "semantic-select" }`; it does not accept a client candidate list. Results can surface articles missed by deterministic `storyCandidates`, while the deterministic lane remains the fallback.

The runner uses a newly-created OS temp directory, read-only ephemeral sandbox, fixed arguments (`--output-schema`, `-o`, `--color never`), bounded batches/stdin/stdout/stderr, injection-resistant data delimiting, and a validated schema. Unknown URLs, malformed output, duplicates, or out-of-range dimensions fail closed. An empty selection is valid. At most 24 sanitized suggestions are persisted to `04-production/opencut-automation/out/newsroom/research-llm-analysis.json`; each remains an AI suggestion requiring human fact-check/editor approval. Missing CLI or timeout leaves deterministic grouping usable.

### 2026-07-27 실운영 확인

현재 풀 334건을 9개 배치로 선별해 23개 URL 후보를 만들었다. API는 `semanticCandidates=23`과 `researchArticlePool.rowCount=334`를 노출하며, 경비실 냉방 갈등·헬스장 선결제 먹튀·등굣길 폭언 의혹·공부방 학대 의혹·상가 SUV 돌진 등 서로 다른 생활 맥락의 소재를 포함한다. 규칙 후보가 0건이어도 의미 후보가 있으면 프론트의 “수집된 기사가 없습니다” 빈 상태를 표시하지 않는다([패널](../../04-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx)).
프론트에는 이 23개 후보 중 의미 차원 가중 순위 상위 5~6건을 별도 `제주 교실 침입 사건형 소재` 편집 데스크 카드로 먼저 노출한다. 카드는 URL 중복 제거, 일상 공간·과잉 확대·행동/해명 불일치·위험·책임 회피 신호를 기준으로 계산하며 `AI CANDIDATE · NOT APPROVED`, 출처·점수·신호·정확한 원문 링크를 함께 보여준다. 엄격 통과 후보가 5건보다 적을 때만 결정적 보완 순위를 적용한다([패널](../../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx), [스타일](../../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom.module.css)).
