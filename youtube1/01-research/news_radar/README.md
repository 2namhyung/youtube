# News Radar

운영 기본값은 최초 1회만 현재 시점 기준 최대 30일(1..30일로 강제)을 구축합니다. 이후 OpenCut 뉴스룸의 `신규 기사만 갱신·AI 선별`은 마지막 성공 수집 시각부터 현재 날짜의 publisher 목록만 열고, SQLite에 이미 있는 URL은 기사 조회·저장·AI 분석에서 제외합니다. 새 URL을 archive에 합친 뒤 최근 30일 rolling pool을 다시 계산하며, 한국 날짜 기준 하루 최대 100건·전체 최대 3,000건으로 제한해 한 날짜의 기사량이 다른 날짜를 밀어내지 못하게 합니다.

유튜브 쇼츠용 소재를 찾기 위해 **현재 RSS와 발행사의 공식 일별 sitemap에서 기사 메타데이터를 넓게 모으는** 수집기입니다. 사건 키워드 검색은 기본 수집 경로가 아닙니다.

기사 본문, 사진, 영상은 저장하지 않습니다. 제목·출처·발행일·원문 링크와 RSS/Atom이 제공한 `description`/`summary`를 HTML 제거 후 최대 600자로 제한해 저장하고 후보 점수를 계산합니다.

## 바로 실행

```powershell
cd C:\Users\User\Desktop\app\youtube\01-research\news_radar
python collect.py --mode current
python collect.py --mode backfill --days 30
python collect.py --mode incremental --days 30
```

결과:

- `data/news_radar.db`: 누적 데이터와 검토 상태를 저장하는 SQLite DB
- `data/latest_article_pool.json`: SQLite 30일 rolling window를 한국 날짜별 최대 100건, 전체 최대 3,000건으로 균형 export한 의미 선별 입력. 각 날짜 안에서는 최신 기사를 우선하고 `daily_counts`로 실제 포함량을 공개한다. `archive`는 전체 저장 건수와 실제 날짜 범위를 별도로 노출한다.
- `data/latest_collection_delta.json`: 마지막 성공 수집 이후 새로 저장됐고 현재 bounded pool에도 들어온 기사 ID만 기록한다. 풀 생성 시각과 묶어 검증하며 후속 AI는 이 ID만 추가 분석한다.
- `data/latest_collection_status.json`: 현재 RSS와 historical discovered/fetched/saved, 출처별 오류, archive 날짜 범위를 atomic 기록
- `data/latest_candidates.csv`: 엑셀에서 바로 열 수 있는 최신 상위 후보

Python `collect.py`만 직접 실행하면 수집만 수행합니다. OpenCut의 통합 실행은 수집 성공 직후 로컬 Codex CLI가 최대 3,000건의 날짜 균형 풀 전체를 제한된 배치로 의미 선별합니다.

전체 흐름은 `npm run newsroom:refresh-research` 또는 **신규 기사만 갱신·AI 선별** 버튼을 사용합니다. 최초 구축/복구용 `npm run newsroom:backfill-30`만 30일을 다시 조회합니다. 일반 갱신은 `incremental`이며, 같은 날짜 목록에서 발견한 기존 URL도 상세 조회와 AI 입력 전에 제거합니다. 클라이언트는 임의 host/URL이나 30일을 넘는 범위를 지정할 수 없습니다.

## 공식 30일 역수집

2026-07-27 공식 `robots.txt`가 선언한 다음 비검색 archive를 실응답 검증해 사용합니다.

- 한국경제: `https://www.hankyung.com/robots.txt` → `https://www.hankyung.com/sitemap/daily-article.xml` → 일별 sitemap
- JTBC: `https://news.jtbc.co.kr/robots.txt` → `https://news.jtbc.co.kr/sitemaps/articles/2026` → 일별 sitemap
- 나우뉴스: 홈페이지의 `전체기사/사이트맵` → `https://nownews.seoul.co.kr/sitemap/sitemap_index.php` → 날짜별 `sitemap_index_YYYYMMDD` HTML archive. `robots.txt`의 이름 없는 4개 sitemap 지시어는 2026-07-27 현재 모두 404라 사용하지 않습니다.

수집기는 설정된 HTTPS publisher host/path만 허용하며 public DNS 확인, redirect 재검증, depth 2·hard cap 200 archive pages·URL 4,000개·응답 2MB/750KB·동시성 8·20초 상한을 코드에서 강제합니다. XML DTD/entity는 거절합니다. 한국경제·JTBC는 일별 최대 10개를 균등 표본하고, 나우뉴스 날짜 archive는 공개된 전체 article link를 최대 50개까지 읽습니다. 기사 페이지에서는 제목·canonical·발행일·최대 1,200자 설명 메타만 읽고 본문과 미디어는 저장하지 않습니다.

레거시 60일 실행 기록(현재 기본값 아님): 2026-07-27 재실행은 한국경제 588건, JTBC 600건, 나우뉴스 1,045건을 accepted했고 durable historical archive는 2,238건입니다. 당시 전체 SQLite archive는 3,233건, 날짜 범위는 2026-05-29~2026-07-27(`actualCoveredDayRange=60`)이었습니다. 현재 실행은 30일 창으로 제한됩니다. 한국경제 일별 sitemap XML 오류 1건과 삭제 기사 404 1건은 상태에 남겼고 다른 성공 데이터는 보존했습니다.

이전 500건 계약의 2026-07-27 검증 기록: RSS 644건과 historical 1,125건을 조회해 활성 archive 2,157건(과거 archive 1,154건)을 구성했습니다. 범위는 2026-06-28~2026-07-27이며 당시 최신 500건을 Codex CLI 17개 배치로 선별해 후보 24건을 저장했습니다. 한국경제 XML 오류 1건과 나우뉴스 기사 502 오류 1건은 부분 오류로 기록됐습니다. 이 수치는 현재 v3 날짜 균형 계약의 운영 검증값이 아닙니다.

제주 dossier의 나머지 원문 매체는 다음 이유로 아직 범용 30일 adapter가 없습니다.

- 헤드라인제주: `robots.txt`에 sitemap 지시어가 없습니다. 홈페이지가 전체기사 목록과 pagination을 링크하지만 `page=2`, `page=100` 요청도 page 1과 동일한 최신 기사 ID를 반환해 비검색 30일 순회가 불가능했습니다.
- 경향신문: `robots.txt`의 `sitemap.xml`은 authors/sections/latest/daily media만 연결하고 `latest-articles.xml`은 최신 400건뿐입니다. 날짜별·연도별 article archive index는 공개하지 않습니다.
- 제주MBC: `robots.txt`에 sitemap이 없고 공식 뉴스 페이지는 pagination/archive 링크나 publisher-wide API 없이 최신 고정 목록만 제공합니다.

## 선택적 정기 수집

정기 수집은 개발 서버와 함께 몰래 시작되지 않는 foreground opt-in 작업입니다. 현재 RSS만 수집하며 잠금, 120초 timeout, atomic 상태 파일을 사용합니다. 30일 역수집과 의미 선별은 별도 명시 작업이므로 LLM 비용을 만들지 않습니다.

```powershell
cd C:\Users\User\Desktop\app\youtube\06-production\opencut-automation
npm run newsroom:schedule-research         # 60분 간격, Ctrl+C로 종료
npm run newsroom:schedule-research-once    # 한 번만 실행·상태 검증
```

상태는 `out/newsroom/research-scheduler.json`에 기록됩니다. 한 feed 항목이 다음 snapshot에서 사라져도 lookback 안의 SQLite history에는 남고, 해당 한국 날짜의 100건 상한과 전체 3,000건 상한 안에서 semantic pool에 유지됩니다. 풀은 기본 6시간 뒤 stale로 판정되고, 뉴스룸과 API가 경고를 표시하며 새 수집 전 의미 선별을 차단합니다.

## 점수 기준

- 두려움: 사고, 추락, 붕괴, 화재, 싱크홀 등 × 2
- 답답함: 책임 회피, 보상, 방치, 관리 부실 등 × 2
- 황당함: 착각, 실수, 갑자기, 정체불명 등 × 2
- 생활밀착: 아파트, 주차장, 도로, 택배, 배달 등 × 2
- 영상성: CCTV, 블랙박스, 영상, 포착 등 × 1
- 제외 주제: 정치, 연예, 스포츠, 증시 등 × -4

후보가 되려면 생활 공간/서비스 맥락에 더해 위험·피해 신호와 황당한 전개 또는 책임 회피가 함께 있어야 합니다. 따라서 맥락 없는 일반 범죄·정책 기사는 제외됩니다. 목표는 카페·주차장·아파트·학교·신차·온라인 쇼핑처럼 누구나 이용하는 곳에서 사소한 계기가 폭력·오염·침입·위험으로 급변하고, 설명 불일치나 판매자/플랫폼의 회피가 드러나는 사건입니다.

이 규칙 점수는 빠른 보조 후보와 장애 시 fallback을 위한 것입니다. 의미 선별은 전체 풀을 입력으로 사용하므로 `칼`, `총` 같은 사건 도구 단어를 미리 열거하거나 규칙 필터를 통과할 필요가 없습니다.

## 선택적 NAVER API HUB 뉴스 검색

기본값은 `naver_search.enabled: false`입니다. 공식 발행사 RSS/latest 피드가 backbone이며, Naver 쿼리는 운영자가 설정에서 명시적으로 켠 경우에만 보조 수집원으로 사용합니다.

```powershell
$env:NAVER_API_HUB_CLIENT_ID='발급받은_클라이언트_ID'
$env:NAVER_API_HUB_CLIENT_SECRET='발급받은_클라이언트_시크릿'
python collect.py
```

`naver_search.enabled`가 켜져 있어도 실행 환경이 `NAVER_API_HUB_CLIENT_ID`/`NAVER_API_HUB_CLIENT_SECRET`를 제공하지 않으면 검색을 건너뜁니다. 레거시 키도 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 이름으로 지원합니다. 비밀 파일 로더는 없으며 키 값은 로그나 저장 파일에 기록하지 않습니다.

2026년 6월 25일 출시된 NAVER API HUB의 뉴스 검색 API를 우선 사용합니다. 기존 네이버 개발자센터 키도 종료 전까지 호환되지만, 신규 구축에는 HUB 키를 권장합니다.

## RSS 출처

`config.json`에는 다음 공식 RSS를 기본 활성화했습니다.

- 뉴시스 사회·수도권·지방·포토: `nwww.newsis.com/RSS/*.xml`
- SBS 뉴스 사회: `news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER`
- MBN 뉴스 사회: `www.mbn.co.kr/rss/society/`
- 연합뉴스 사회: `www.yna.co.kr/rss/society.xml`
- JTBC 뉴스 사회: `news-ex.jtbc.co.kr/v1/get/rss/section/30`
- 조선일보 사회: `www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml`
- 한국경제 사회: `www.hankyung.com/feed/society`
- 한겨레 사회: `www.hani.co.kr/rss/society/`

2026-07-27에 위 11개 feed의 HTTP/XML 응답과 실제 최신 기사 URL을 모두 검증했습니다. 5개 추가 feed는 사건명이나 제주 키워드가 없는 범용 사회 category입니다. 각 피드는 독립적으로 실패하며 한 출처의 장애가 다른 출처나 로컬 저장을 막지 않습니다.

## 자동 의미 선별

`latest_article_pool.json`에는 제목·출처·발행/수집 시각·원문 URL·로컬 점수와 정제·제한된 설명을 저장합니다. provenance는 현재 RSS의 `rss-description-or-atom-summary`, XML 역수집의 `publisher-sitemap`, HTML 날짜 archive의 `publisher-archive`이며 기사 본문·사진·영상은 포함하지 않습니다. SQLite archive 전체가 아니라 날짜별 100건·전체 3,000건으로 제한한 v3 균형 풀만 의미 선별 대상입니다. v1 title-only와 v2 최신순 풀도 계속 읽을 수 있습니다. 통합 실행은 이 풀을 최대 60건·입력 45,000자 이하 배치로 나눠 로컬 `codex exec`에 전달하고, 사건 중복을 합친 뒤 점수순 최대 300개의 제안을 보존합니다.

선별 기준은 평범한 상황의 불균형한 격화, 행동과 설명의 불일치, 구체적 위험, 책임 회피, 시청자가 느낄 답답함·두려움입니다. 일반 범죄나 일반적 악재만으로는 선별하지 않습니다. 결과는 URL·스키마 검증을 통과한 **AI 제안**이며 사실 확인이나 편집 승인이 아닙니다. CLI 실패·거절·빈 결과 때도 규칙 기반 CSV 후보는 그대로 사용할 수 있습니다.

저장된 의미 선별 결과를 다시 표시할 때 서버는 현재 bounded rolling pool의 exact URL과 교집합을 취합니다. pool에서 밀려났거나 더 이상 없는 후보는 카드와 승격 버튼에서 숨기고 `unavailableCount`/`poolSelectionMismatch`를 노출합니다. 운영자는 **30일 균형 수집·AI 선별**을 다시 실행해 수집과 v3 feed excerpt 기준 재점수화를 한 번에 갱신합니다.

의미 후보 카드의 **취재 파일로 승격**은 클라이언트가 보낸 제목/점수를 신뢰하지 않고, 서버가 persisted semantic output과 현재 풀에 모두 존재하는 정확한 URL만 받습니다. 같은 URL은 idempotent하게 하나의 `out/newsroom/research-dossiers.json` seed로 유지됩니다. seed에는 제목·출처·날짜·hook·의미 차원·fact-check 위험·관련 보도 후보·승인 시각·provenance를 넣으며, 원문·독립 출처·반론 확인 전에는 02 인계를 금지한다고 명시합니다.

## 저작권 원칙

- 이 도구의 수집 결과는 **소재 발견과 사실 확인을 위한 내부 인덱스**입니다.
- 기사 문장, 사진, 방송 영상의 이용 권한이 자동으로 생기는 것은 아닙니다.
- 쇼츠 제작 시 원문을 교차 확인하고, 영상·사진은 별도 사용 허가나 적절한 라이선스를 확보합니다.
- SBS RSS는 공식 안내상 개인의 비상업적 사용만 허용됩니다. 상업적 이용이 필요하면 SBS에 별도 문의하세요.
