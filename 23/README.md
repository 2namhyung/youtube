# 정치 아카이브 스튜디오

## VisualMaker — 대본과 장면 설계

`pnpm run visualmaker:dev` 후 [로컬 작업대](http://127.0.0.1:3017/studio)를 엽니다. 현재 EP001 가져오기 또는 한국어 대본 입력 → 표현 비교 → 직접 수정/잠금 → 원본 파일/출처 등록 또는 기존 로컬 수집 보관함 후보 연결 → 장면표 JSON/CSV·자료 요구·파이프라인 전달안 내보내기를 지원합니다. 보관함 검색은 이미 수집된 제목·제공처·검색어의 로컬 조회이며 새 자료를 인터넷에서 자동 수집하지 않습니다. 수집 원본 연결도 출처·권리·의미 승인이나 제작 허가가 아닙니다.

원장은 `data/visualmaker/studio.sqlite`, 원본 파일은 `data/visualmaker/assets/`에 저장됩니다. 자세한 범위·복원 방법·제약은 [실행 안내](visualmaker/README.md), [구현과 설계 변경](visualmaker/IMPLEMENTATION.md), [제작 운영 정본](wiki/syntheses/remotion-vox-production-playbook-v0.1.md)을 따릅니다.


현재 YouTube 제작 진입점은 [운영 플레이북](wiki/syntheses/remotion-vox-production-playbook-v0.1.md)과 `episode-spec.json`이다. `pnpm run media:search-episode -- --plan`으로 실사·모션그래픽의 외부 검색 명세를 확인하고 `--execute`로 후보를 찾는다. `pnpm run video:validate-editorial-routing -- --check`는 모드 선택과 반복을 진단한다. 과거 QA 빌더를 현재 제작 경로로 사용하지 않는다.

출처와 장면을 한 화면에서 정리하는 영상 제작용 스토리보드 MVP입니다. Next.js App Router와 Node.js 내장 `node:sqlite`만 사용해 로컬에서 데이터를 저장합니다.

## 실행

```bash
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다. 첫 실행 시 `data/archive.sqlite`가 생성되고, 실제 정치인·사건을 주장하지 않는 `데모 인물 A`와 데모 카드만 삽입됩니다. `data/*.sqlite`는 Git에서 무시됩니다.

## 주요 기능

- 16:9 영상 프레임과 안전영역을 포함한 확대·이동 캔버스
- 카드 드래그 위치 저장, 카드 추가·편집·삭제
- 인물별 카드 필터와 상단 인물 선택기
- 카드별 출처 URL, 발행처, 발행일, 라이선스, 검증 상태, 저작권 메모
- 서버 컴포넌트 초기 조회, Server Actions 기반 변경, SQLite 정규화 테이블
- 그래프 노드·관계, Claim→Evidence 연결, 중복 방지용 canonical URL/해시
- `/graph`, `/graph/explorer`, `/sources`, `/review`에서 그래프 경로·수집원·검토 큐 확인
- `PRAGMA user_version` 기반 idempotent graph migration: 기존 storyboard 테이블과 카드 보존
- 국회 `ALLNAMEMBER` fixture parser와 안전한 staged roster sync (`ASSEMBLY_API_KEY` 필요)
- Pexels 사진·영상 fixture/API 수집: `/sources`에서 `서울 일상` 기본 검색을 한국어·가로형 우선의 작은 배치로 실행하며 `PEXELS_API_KEY`를 우선 읽고 로컬 호환용 `pixel.txt`를 보조로 사용합니다. 키는 저장·로그·URL에 남기지 않습니다.
- 키 없는 미디어 수집: `/sources`에서 Wikimedia Commons(`Seoul`), NASA Images(`Earth`), Library of Congress(사진 `Seoul`, 영상 `trailer`)를 1~3건의 fixture/API bounded batch로 실행합니다. API·아이템·다운로드 호스트 allowlist, HTTPS·redirect·MIME·크기 검사, 원자적 raw 저장, URL/SHA-256 중복 방지를 적용합니다.
- 키 없는 원본 영상 수집: `/sources`에서 Commons·NASA·LOC 영상을 각각 1건씩 시험합니다. NASA는 검색 후 `/asset/{nasa_id}`를 다시 조회하고 1080p 이하 우선 파일만 선택하며, Commons는 `video/*` 원본 업로드만, LOC는 `film-and-videos` 검색 후 항목의 `resources`·`video_stream`·`video`·`download` 필드에서 공식 video URL만 선택합니다. JPG preview는 영상으로 저장하지 않습니다.
- KOGL 추천공공저작물 원본 CSV 수집(데이터셋 15133902): `/sources`의 `KOGL 사진 1건`·`KOGL 영상 1건` 버튼은 data.go.kr 공식 파일 데이터 다운로드 POST로 CSV 식별자를 해석한 뒤 CP949 CSV의 `/upload_recommend/` 경로만 `www.kogl.or.kr`에서 bounded GET합니다. CSV는 90MB, 미디어는 선언·실제 50MB 상한과 image/video MIME·HTML 검사를 적용하고 원본 CSV와 미디어를 원자적으로 보관합니다. 큰 후보는 기록 후 다음 후보로 제한된 횟수만큼 fallback하며, 파일별 KOGL 유형은 자동 확정하지 않고 `KOGL 유형 미확인 — 공개 전 상세 페이지 확인 필요` 상태로 staged 검토합니다. 영상 모드는 실제 CSV의 영상이 대용량이거나 크기 공란인 항목이 많아 50MB 정책으로 실패할 수 있습니다.
- 디지털문화자원 메타데이터: `/sources`의 `디지털문화 메타 10건`은 `DATA_GO_KR_SERVICE_KEY`가 있을 때만 공식 API를 호출합니다. 썸네일은 다운로드하지 않고 메타데이터만 `cultural_resource` 그래프 노드로 upsert하며, 원격 `thumbFileUrl`은 검토용 문자열로만 보관합니다. API 오류·권리 상태는 staged/review로 유지합니다.
- 국회 회의록: `/sources`의 `최근 본회의 회의록 1건`·`최근 위원회 회의록 1건`은 `ASSEMBLY_API_KEY`와 제22대·현재연도 조건으로 공식 메타 API를 조회한 뒤, 국회 회의록 summary에서 item을 찾고 공식 HTML view를 순차 수집합니다. 원문 HTML·SHA-256·발언자·발언 텍스트를 `meeting`·`speech`·`evidence` 그래프에 staged로 저장하며, 인물명 일치만으로는 `POSSIBLY_SPOKEN_BY`만 연결합니다. PDF/VOD는 따라가지 않고, API·HTML 호스트/MIME/크기 제한과 요청 간격을 적용합니다.

## 데이터 신뢰·수집 정책

국회·선관위·회의록·의안 등 1차 자료를 신뢰 등급 1순위로 사용합니다. BIGKinds는 기사 탐지용이고, Poliwiki는 발견·누락 점검 전용(`discovery_only`)이며 Poliwiki의 값을 사실로 확정하지 않습니다. 주장(Claim)은 검증 상태와 신뢰도 점수를 가지며, Evidence의 URL·발행처·수집일·라이선스·원문 위치를 함께 저장해야 검토 큐에서 승인할 수 있습니다.

국회 API로 들어온 의원 행은 `NAAS_CD`, `NAAS_NM`, `PLPT_NM`, `ELECD_NM`, `ELECD_DIV_NM`, `CMIT_NM`, `BLNG_CMIT_NM`, `GTELT_ERACO`, `NAAS_PIC`만 공식 필드로 매핑합니다. `GTELT_ERACO`는 선출 대수(예: 제22대), `ELECD_NM`은 선거구(예: 비례대표), `ELECD_DIV_NM`은 선거구 구분으로 취급합니다. `GTELT_ERACO`에 22대가 명시된 행만 `22대 후보·미검증`으로 staging하고 현재 국회의원으로 자동 확정하지 않습니다. `NAAS_CD`를 canonical ID로 삼아 선관위·국회 기준 대조 후 수동 검토를 거쳐 72시간짜리 `verified_current`로 승격합니다. 만료된 검증은 현재 의원으로 조회하지 않으며, 사퇴·변동은 수동/2차 출처 검토 전까지 감지되지 않을 수 있습니다. API 성공 envelope는 keyed fixture로 확인하기 전까지 문서에서 미확정으로 표시합니다. API 키는 `ASSEMBLY_API_KEY` 환경변수에서만 읽고 저장하거나 로그에 출력하지 않습니다.

페이지별 API 원문은 `data/raw/assembly`에 JSON으로 보관하고 SHA-256, 검색 페이지, 수집 시각, 원문 경로를 `evidence_sources`에 기록합니다. `ARCHIVE_RAW_ROOT`로 테스트·운영 보관 루트를 바꿀 수 있습니다. 페이지 안전 상한에 도달하면 ingest run을 실패 처리합니다.

사진·영상 원본은 DB BLOB으로 넣지 않습니다. `media/` 아래 raw/normalized/thumbnails/transcripts 파일을 운영하고 그래프에는 경로, 원본 URL, SHA-256, MIME, 길이, 라이선스와 attribution만 둡니다. 기사 전문·방송 영상 재배포는 피하고 최소 인용과 원문 링크를 유지하세요.

Pexels 수집은 `images.pexels.com`·`videos.pexels.com` 원본만 허용하고 HTTP 리다이렉트, MIME 불일치, 크기 초과를 차단합니다. Pexels 사진은 제작자·Pexels 페이지·검색어·수집시각을 `media_assets.properties_json`에, 실행 요약을 `ingest_runs.metadata_json`에 보존합니다. 수집 시점에는 후보를 막지 않되 공개 전 Pexels 약관과 사진·영상별 인물·상표·음원 권리를 확인합니다.

키 없는 세 루트도 동일하게 `graph_nodes`·`media_assets`·`ingest_runs`에 저장하지만 `discovery_only`와 `semantics=discovery_candidate_staged_rights_review_required`를 유지합니다. Wikimedia 파일별 라이선스, NASA의 제3자·초상·상표 권리, Library of Congress의 `Rights and Access`를 자동으로 퍼블릭 도메인으로 확정하지 않습니다. 파일별 출처·제작자·항목 페이지·검색어·수집시각·권리 메타데이터를 검토 큐에서 확인한 뒤 영상 공개에 사용하세요. 원본은 `data/raw/{provider}/{runId}/{mediaType}`에 원자적으로 보관합니다. API 요청은 식별 User-Agent와 직렬 다운로드를 사용하며, 운영 연락처가 생기면 `MEDIA_USER_AGENT_CONTACT`에 URL이나 이메일을 설정합니다.

원본 영상 수집도 `video/*` MIME과 선언·실제 50MB 상한을 모두 통과해야 저장합니다. NASA·LOC의 2단계 조회에서 허용된 다운로드 URL이 없거나 권리 제한·미디어 형식이 불명확하면 `no_allowed_video_resource`로 기록하고 실패/부분 상태를 유지합니다.

## 품질 확인

```bash
npm run check
```

`check`는 TypeScript 타입 검사, SQLite 스모크 테스트, Next.js production build를 순서대로 실행합니다.

Node.js 22.5 이상에서 실행하세요. 앱은 Node.js 내장 `node:sqlite` API를 사용하며, 이 API는 Node 버전에 따라 Experimental 경고가 표시될 수 있습니다. 배포용 멀티 인스턴스 DB가 아니라 `localhost`에서 한 명이 사용하는 무인증 로컬 도구를 전제로 합니다. `data/archive.sqlite` 파일을 공유하거나 인터넷에 노출하지 마세요.

이 도구는 영상 제작 보조용 기록장입니다. 출처의 사실성·최신성·저작권은 사용자가 최종 확인해야 합니다.
