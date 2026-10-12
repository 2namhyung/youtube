# 01 조사

- 상태: 운영 가능 (98%, 교차 검증은 사람 게이트)
- 입력: 발행사 RSS, 공식 publisher sitemap/archive, 선택적 보조 검색, 편집 기준
- 처리: 최초 30일 구축 → 이후 마지막 성공 시각부터 신규 URL만 증분 수집 → SQLite archive 병합 → 한국 날짜별 최대 100건·전체 최대 3,000건 semantic pool → 신규 기사만 Codex CLI 의미 선별·기존 후보와 병합 → 사람 승격 → 교차 검증
- 출력: v2 `latest_article_pool.json`, 후보 목록, durable Research dossier seed, 사건별 조사 스냅샷
- 게이트: 원문·날짜·공통 사실·충돌·승인 기록

일반 수집은 [collect.py](../../01-research/news_radar/collect.py)가 담당합니다. 제주 사건은 전용 [research snapshot](../../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.research.json)에 기사·법령·충돌을 보존했습니다. 날짜와 진술 충돌은 해결된 사실로 바꾸지 않습니다.

## 현재 운영 계약

- v2 풀은 RSS/Atom `description`/`summary` 또는 official sitemap에서 발견한 기사 페이지의 `og:title`·발행일·설명 메타만 정제·제한해 보존합니다. 기사 본문·사진·영상은 저장하지 않으며 provenance는 `rss-description-or-atom-summary` 또는 `publisher-sitemap`입니다.
- `generated_at`과 `stale_after_hours`(기본 6시간)로 신선도를 계산합니다. stale 풀은 API/UI에 경고하고 의미 선별을 차단합니다.
- UI의 **신규 기사만 갱신·AI 선별** 또는 `npm run newsroom:refresh-research`는 마지막 성공 이후의 신규 URL을 병합한 뒤 delta만 Codex CLI로 선별합니다. 프론트에는 이 일반 운영 동작을 위한 버튼 하나만 노출합니다. `npm run newsroom:backfill-30`은 최초 구축·복구 전용이고, `npm run newsroom:schedule-research`는 현재 RSS만 반복하는 별도 foreground 수집기입니다.
- 프론트 기본 화면은 **선택한 다음 영상 소재**와 상위 **다음 영상 후보** 최대 6개만 보여줍니다. 각 추천 카드의 **다음 영상 소재로 선택**은 같은 URL의 `active-review` dossier를 만들며 제작 완료를 뜻하지 않습니다. 전체 의미 후보·규칙 후보·수집 통계는 기본적으로 닫힌 **전체 후보·수집 상세** 안에 둡니다. Source: [Research panel](../../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx), [Newsroom styles](../../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom.module.css).
- 역수집은 설정된 HTTPS publisher host/path만 허용하고 public DNS와 모든 redirect를 다시 검증합니다. depth/count/URL/response bytes/concurrency/timeout 상한과 XML DTD 차단을 적용하며, 한 출처나 하루의 실패가 다른 성공 자료를 지우지 않습니다. 지원원은 한국경제·JTBC 공식 XML sitemap과 나우뉴스 공식 날짜별 전체기사 HTML archive입니다.
- SQLite에는 과거 실행의 오래된 행이 남을 수 있지만 현재 archive 통계와 semantic pool은 오늘 기준 최대 30일만 활성 범위로 인정합니다. semantic pool v3는 발행 시각을 한국 시간으로 바꿔 날짜를 계산하고, 발행 시각이 없을 때만 최초 수집 시각을 사용합니다. 각 날짜 안에서는 최신순 최대 100건, 전체 최대 3,000건을 atomic export하며 `daily_counts`, `daily_article_limit`, `covered_day_count`를 기록합니다. API/UI는 archive 전체와 이 날짜 균형 semantic pool을 분리해 표시합니다. Source: [collector](../../01-research/news_radar/collect.py), [config](../../01-research/news_radar/config.json).
- 일반 갱신은 `incremental`입니다. 마지막 성공 수집 시각과 SQLite URL 집합을 읽고, 필요한 날짜 목록만 조회합니다. 이미 저장된 URL은 publisher 상세 조회·upsert·AI 분석에서 제외합니다. `latest_collection_delta.json`은 이번에 새로 저장되고 현재 bounded pool에도 포함된 article ID, 이전 URL 수, 기준 시각, pool 생성 시각을 원자적으로 기록합니다. 이 delta가 현재 pool과 일치할 때만 새 기사 AI 결과를 기존 후보에 병합합니다. 30일 전체 재조회는 최초 구축과 명시적 복구 명령에만 허용합니다. Source: [collector](../../01-research/news_radar/collect.py), [delta schema](../../01-research/news_radar/collection-delta.schema.json), [newsroom-lib](../../06-production/opencut-automation/scripts/newsroom-lib.mjs).
- 의미 후보 승격 API는 persisted semantic output과 현재 풀에 동시에 있는 정확한 URL만 받습니다. 동일 URL은 idempotent하게 [research-dossiers.json](../../06-production/opencut-automation/out/newsroom/research-dossiers.json)에 하나만 보존됩니다.
- persisted semantic 후보도 현재 rolling pool exact URL과 서버에서 교집합 처리합니다. unavailable 후보 수와 pool-selection mismatch를 API/UI에 표시하고, 사라진 후보의 카드·승격 버튼은 숨깁니다. 신규 delta 결과는 현재 pool에 남은 기존 후보와 다시 점수·사건 중복 순서를 계산합니다.
- Node 로더와 의미 선별 입력은 v3 풀을 다시 500건으로 자르지 않고 최대 3,000건까지 읽습니다. 통합 실행은 최대 60건·45,000자 이하의 bounded batch로 전체 풀을 검사하고, 검증·사건 중복 제거 후 점수순 최대 300개 후보를 저장합니다. 프론트는 6개씩 페이지를 나눠 보여줍니다. Source: [newsroom-lib](../../06-production/opencut-automation/scripts/newsroom-lib.mjs), [Research panel](../../06-production/opencut-automation/opencut-classic/apps/web/src/app/newsroom/newsroom-research-panel.tsx).
- 최초 전체 선별 뒤에는 delta article ID만 최대 60건·45,000자 이하 배치로 분석합니다. 새 결과는 현재 pool에 남은 기존 후보와 사건 단위로 다시 중복 제거해 최대 300건을 유지합니다. 각 배치는 기본 2회까지만 재시도하며, 이전 실행에서 실패한 묶음은 pool·feedback 해시가 그대로일 때 `retry-failed-research`로 해당 묶음만 복구할 수 있습니다.
- 승격 seed는 `active-review`이며 자동 승인 완료가 아닙니다. 원문 사실, 독립 출처, 당사자·기관 반론을 확인하기 전에는 02로 넘기지 않습니다.

## 제주 사건이 live radar에서 나오지 않은 이유

기존 누락의 1차 원인은 **latest-only 피드만 사용했던 것**입니다. dossier 원문 중 날짜가 있는 세 건은 2026-06-16~17 보도인데 당시 수집기는 RSS가 현재 내주는 `item`/`entry`만 읽었습니다. 한국경제·JTBC 공식 일별 sitemap과 나우뉴스 날짜별 전체기사 archive를 추가했으며, 현재 운용 범위는 오늘 기준 최대 30일입니다.

2차 원인은 당시의 **출처 구성**입니다. 당시 기본 6개 feed는 뉴시스 4종·SBS 사회·MBN 사회였고, dossier 원문 도메인 `headlinejeju.co.kr`, `khan.co.kr`, `nownews.seoul.co.kr`, `jejumbc.com`은 포함되지 않았습니다. 실제 제주 dossier의 provenance는 live radar가 아니라 `google-news`, `yonhaptv`를 사용한 사건명 표적 조사입니다.

이후 특정 사건 키워드 없이 범용 사회 feed 5개와 세 historical source를 추가했습니다. 나우뉴스는 `robots.txt`의 고장 난 4개 sitemap 지시어 대신 공식 홈페이지가 연결한 `전체기사/사이트맵`의 날짜 archive를 사용합니다. 사후 exact-URL 대조에서 제주 dossier의 나우뉴스 원문 1건이 실제 DB에 저장됐습니다. 이 URL은 acquisition seed로 쓰지 않았습니다.

헤드라인제주는 `robots.txt`에 sitemap이 없고 공식 전체기사의 `page=2`, `page=100`도 page 1과 동일한 최신 ID를 반환했습니다. 경향신문 공식 sitemap은 최신 400 article만 제공하고 날짜/연도 index가 없습니다. 제주MBC는 sitemap·pagination·archive/API를 공개하지 않고 최신 고정 목록만 제공합니다. 따라서 이 세 원문은 여전히 MISS이며 지원된 것으로 표시하지 않습니다.

v1 풀이 title-only였던 점은 유사 사건에서 관계·위험 맥락을 놓칠 수 있는 3차 요인이지만, 제주 원문은 애초 pool에 없었으므로 해당 사건 누락의 직접 원인은 아닙니다. v2 bounded feed excerpt는 이 의미 판단 공백을 줄이되 source/time coverage를 가장하지 않습니다.

참고로 2026-07-27의 이전 60일 재실행은 현재 RSS 763건과 historical discovered/fetched 2,235/2,235건을 처리해 한국경제 588건, JTBC 600건, 나우뉴스 1,045건을 accepted했습니다. durable historical archive는 2,238건, 전체 SQLite archive는 3,233건이며 최저/최고 날짜는 2026-05-29/2026-07-27, `actualCoveredDayRange=60`이었습니다. 이 수치는 현재 30일 운영 결과가 아니라 레거시 실행 기록입니다.

이전 v2 최신 500건 계약의 2026-07-27 기록은 RSS 644건과 historical 1,125건, 30일 활성 archive 2,157건, Codex CLI 17개 배치와 의미 후보 24건이었습니다. 이 기록은 회귀 비교용이며 v3 날짜 균형 계약의 현재 운영 수치로 사용하지 않습니다. Source: [latest collection status](../../01-research/news_radar/data/latest_collection_status.json), [semantic selection](../../06-production/opencut-automation/out/newsroom/research-llm-analysis.json).

2026-08-09 v3 최초 구축 결과는 30일·1,643건, 날짜별 최대 100건, 30개 날짜다. AI는 28개 batch 중 최초 시간 초과 1개를 전체 재수집 없이 batch 13만 재시도해 모두 완료했고 후보는 24건이 됐다. 이어진 증분 검증은 직전 성공 시각 이후 하루 목록만 확인했고 기존 publisher URL은 상세 조회 전에 건너뛰었다. 두 번째 검증에서는 새 URL 4건이 저장됐지만 모두 현재 pool의 기존 제목과 중복되어 delta article ID와 추가 AI 분석은 0건이었다. 활성 pool은 1,643건 그대로이고 전체 archive는 4,491건이다. Source: [pool](../../01-research/news_radar/data/latest_article_pool.json), [delta](../../01-research/news_radar/data/latest_collection_delta.json), [collection status](../../01-research/news_radar/data/latest_collection_status.json), [semantic selection](../../06-production/opencut-automation/out/newsroom/research-llm-analysis.json).

다음: [02 맥락·법률 분석](02-context-legal.md)
