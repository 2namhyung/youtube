# Luna Shopping Shorts Studio

JEV 없이 Codex **GPT-5.6 Luna 작업 + Chrome Use / Computer Use + 로컬 FFmpeg**로 운영할 수 있는 쇼핑 쇼츠 제작 앱이다. 앱이 모델을 호스팅하거나 실행 중인 작업의 모델을 바꾸지는 않는다. 데스크톱 작업의 모델 선택기에서 Luna를 고르거나 `codex exec -m gpt-5.6-luna`를 사용하고 [운영 가이드](OPERATOR.md)를 따른다. 현재 새 1단계는 수동 실행한다. 사용자의 지시에 따라 예약을 새로 만들거나 재개하지 않는다.

## 이야기 우선 1단계 (2026-09-23)

기본 화면은 **주제 발굴**이다. 상품 키워드나 쇼핑 태그를 진입 조건으로 쓰지 않고, 이야기 자체의 가치·현재 관심 증가·자연스러운 상품 연결을 각각 확인한다. 실제 실행 절차는 [OPERATOR.md](OPERATOR.md), 구현 범위와 한계는 [설계 문서](docs/stage-1-story-trend-commerce-v2.md)에 있다.

새 실행기: `python scripts/discover_story_topics.py --collect`. 현재 89개 후보의 조회수와 영상 길이를 확보했다. 전체가 썰 쇼츠로 확인된 것은 아니다. 이야기 첫 검토는 후보 7개·추가 확인 3개, 트렌드·상품 연결 검토 주제는 9개다. [1단계 기획 결과물](data/reports/story-discovery/planning-briefs.md)에 기획 후보 3개와 채널 활동 확인 전 참고안 1개를 제공한다. 관심 상승까지 검증된 최종 통과는 0개다. 기획 활용과 유행 확정을 화면에서 구분한다. 기존 채널 수집/이상치 도구는 보조 자료다. 제작 경로 중 5단계의 이야기 사실 근거 계약 확장은 별도 후속 작업이다.

## 실행

```powershell
cd C:\Users\User\Desktop\app\youtube\shopping-shorts
.\setup.ps1
.\start.ps1
```

주소: http://127.0.0.1:8765. Python 3.11+와 Node 20.19+/22.12+, PATH의 FFmpeg/ffprobe가 필요하다. 검증 환경은 Windows, Python 3.14, Node 24, FFmpeg 8.1이다. 이 FFmpeg는 **렌더 엔진용**이며 WISE 환경용이 아니다. 기존 뉴스룸 `npm run dev`는 그대로 유지된다. 루트에서 `npm run dev:shopping`으로도 시작할 수 있다.

`SHOPPING_PORT`, `SHOPPING_DATA_DIR`, `SHOPPING_FFMPEG`, `SHOPPING_FFPROBE`, `SHOPPING_FONT_PATH` 환경 변수로 경로를 설정한다. 1단계 YouTube 공개 데이터 수집은 `YOUTUBE_API_KEY`와 인증 오류 대비용 `YOUTUBE_API_KEY_2`를 사용한다. 할당량 소진 시 키를 교체해 우회하지 않는다. `api.txt`를 자동으로 읽지 않으므로 시작 전에 현재 셸이나 사용자 환경 변수에 키를 설정한다. 기본 폰트는 로컬 Windows 맑은 고딕 또는 Linux NanumGothic이다. 폰트 파일을 공개 배포하는 권한을 자동 부여하지 않는다. `api.txt`, `pixel.txt`, 로그인 정보는 읽지 않는다.

한국 쇼핑쇼츠 채널 확장 수집은 `scripts/discover_shopping_channels.py`가 담당한다. 음식·생활용품·전자제품·뷰티·패션·육아·자동차/아웃도어·건강·반려동물·취미 등 105개 검색어를 쿼터 안에서 순환하여 채널 ID를 추가하고 uploads playlist를 이어서 백필한다. 모든 업로드 기간의 현재 조회수를 채널 내부 중앙값과 log-MAD로 비교한다. 결과는 잠정 이상치이며 Chrome/Luna의 Shorts·쇼핑·상품 태그 관측 이후 확정할 수 있다. 검색어와 근거는 [검색어 조사](docs/search-keyword-research.md)에 기록한다.

## 제작 기반과 기존 보조 경로

1. **이전 영상 이상치 분석(보조):** YouTube Data API v3의 `search.list`와 `videos.list`로 공개 게시 시각·채널·영상 길이·현재 조회수를 가져와 응답 원문과 정규화 스냅샷을 해시 보존한다. 동일 채널의 과거 동일 연령 비교, 24/72/168시간 ±30분, 후보 제외, 최소 10·최대 30개, 정의/공급자 분리, 중앙값 0·누락·음수 증가를 처리한다. API에 Shorts·상품 유형 판정 필드가 없으므로 길이만 맞는 영상은 `probable`, 상품 유형은 `unknown`으로 남겨 별도 Luna·Chrome 관측에서 확정한다. 첫 실행은 관측 기록을 만들며 현재 누적값을 과거 수치로 만들지 않는다. 비인가 공개 API 데이터는 30일 이내 관측만 재사용한다.
2. **상품:** 실제 상품/옵션 관측과 근거 등록. 추적 파라미터만 제거하고 옵션 ID는 보존한다. 주장마다 근거 수준·만료·근거 ID를 저장한다.
3. **검색:** Luna의 KO/EN/ZH/JA 쿼리를 계약으로 검증하고 보존한다. 브라우저에서 실제 검색하고 원문·근거를 등록한다. API 키나 검색 API를 기본 전제로 삼지 않는다.
4. **미디어:** multipart 업로드 → 원본 SHA 보존 → 회전/SAR/30fps/PTS 정규화 마스터 → 전체 시간축 프록시 → FFmpeg 장면 검출+최대 8초 창 → 원본 PTS 대응표와 시작/중간/끝 프레임. Luna 관측은 실제 샷·프레임 ID에 결합한다. 관측 설명 검색은 로컬 인덱스로 제공된다.
5. **대본:** Luna가 입력 계약에 맞춰 작성한다. 등록 주장·유효 샷만 허용하고 판매자 주장/실제 관측을 구분한다. 대본과 제목은 별도 검수 기록이 있어야 음성을 연결할 수 있다.
6. **배치:** beat당 최대 3개 후보와 폭 20의 beam 탐색. 동일 상품·동작 완결·1배속·연속 구간·중복/역순 금지. fit 또는 실제 oriented master 픽셀 crop을 검증한다.
7. **음성·효과음:** 사용자가 선택한 음성의 beat별 파일을 업로드한다. 실제 WAV를 48kHz로 변환·측정하고 최대 1프레임 미만의 끝 무음을 명시적으로 기록한다. 발음·숫자·제품명은 청취 근거를 연결한다. 권리 근거가 있는 효과음을 카탈로그에 등록하고 beat별 sample offset·gain·fade로 배치한다. `6b lock`에서 정확한 frame/sample 길이로 확정한다. 임의 음성 합성/Edge-TTS 대체는 없다.
8. **렌더:** FFmpeg, 한글 ASS/SRT, 측정한 줄바꿈, 제목/광고표시, hard cut, 음성 2-pass loudnorm, 원본 오디오 제거. 실제 1080×1920/30fps/H.264/AAC48kHz 디코드를 검증한다. 별도 완성본 의미·청취 검수 후 MP4/SRT/script/timeline/credits/source manifest/QA/SHA256 ZIP을 생성한다. 구매·업로드·게시는 구현 범위 밖이다.

## Luna와 앱의 경계

Luna는 **현재 대화의 도구**로 관측·판단·대본을 수행한다. 서버는 작업 패킷·JSON Schema·참조 ID·입력 해시를 발행하고 결과를 검증한다. `WAITING_INPUT`은 현재 작업의 Luna가 채울 입력이다. 앱의 버튼만으로 별도 LLM을 호출하는 완전 무인 서버는 아니다. 실제 사용 모델은 `attestation.model`에 기록하며 이는 공급자가 서명한 모델 실행 증명이 아닌 **운영자 진술**이다.

관측/판정이 부족하면 `insufficient`, 제품 불일치, 미디어 대기, 타임라인 부족 등을 기록한다. 유사 제품이나 누락된 동작을 자동 정답으로 대체하지 않는다. 샷의 시작/중간/끝 썸네일만으로 빠른 동작의 완결을 보장하지 않는다. 운영자는 전체 프록시의 정확한 구간도 재생해 확인해야 한다.

## 명세에서 선택적으로 바꾼 부분

사용자 요청에 따라 1단계 공개 통계 수집에는 YouTube Data API 키를 사용하고, 의미 관측·대본은 현재 작업 Luna+브라우저 경로를 유지한다. JEV는 `DISABLED_UNVERIFIED`인 후속 확장이며 어떤 기본 단계도 JEV/Gemini/Azure 키를 요구하지 않는다. 음성은 원 설계의 승인 파일 입력 대체 경로를 구현했다.

Windows 한 명 운영용 기본 프로필은 **FastAPI + React/TypeScript + SQLite WAL 영속 작업 큐**다. PostgreSQL/Prefect/Redis/WSL2 설치 없이 시작할 수 있다. 장기 GPU/분산 운영용 PostgreSQL·Prefect 이관은 아직 구현하지 않았다. WISE/PySceneDetect 대신 기본 경로에는 FFmpeg 장면 검출·Luna 관측·로컬 설명 검색이 실제 작동한다. WISE 임베딩 검색, 자동 OCR/ASR, Azure TTS, BGM/자동 덕킹, 유료 외부 API adapters, 주기적 플랫폼 수집은 아직 구현·실계정 검증하지 않았다. 이 상태는 연결 화면에 드러나며 성공으로 표시하지 않는다.

## 데이터·안전·복구

- `data/shopping.sqlite3`: 프로젝트 head, append-only records, jobs, idempotency, revocations.
- `data/blobs`: 콘텐츠 해시 저장소. 파일 ID와 byte 해시는 별개다.
- `data/work`: 작업별 임시 렌더·로컬 프로세스 로그. 완료되지 않은 파일을 완성본으로 노출하지 않는다.
- 변경은 새로운 기록과 project revision을 만들고 하위 대본·음성·타임라인·렌더 권위를 무효화한다. 취소된 결과는 head에 결합하지 않는다. 재시작 때 RUNNING은 RETRYABLE_FAILURE가 되며 자동 유료 재호출은 없다.
- 완료 요청은 Idempotency-Key로 재사용한다. 프로젝트당 한 작업, 미디어 worker 한 개. 멀티 worker/원격 공개 운영은 지원하지 않는다.
- 실제 파일·SHA·참조·현재 철회 상태를 렌더 전후/내보내기 다운로드 때 다시 검사한다. 근거 철회는 샷 검색/새 렌더/기존 ZIP 다운로드를 즉시 막는다. 과거 감사 기록은 보존한다.
- HTTP는 loopback 전용, Host/Origin/세션 토큰 검사. URL은 자료로 저장하며 서버가 임의 URL을 다운로드하지 않는다. 미디어 프로세스는 shell 없이 실행하고 file/pipe 프로토콜만 허용한다.

## 검증

```powershell
.venv\Scripts\python.exe -m pytest tests -q
npm --prefix apps/web run build
.venv\Scripts\python.exe -m tests.test_media_flow data
```

마지막 명령은 화면에서 볼 수 있는 **합성 테스트** 프로젝트와 `data/SMOKE_RESULT.json`을 만든다. 컬러 테스트 패턴과 사인파 음원을 사용하므로 실제 상품/한국어 TTS/사람 의미 검수/Luna 실행의 증거가 아니다. 최종물에도 합성 테스트 표시를 넣는다. 다운로드 결과는 publication authority를 만들지 않는다.

계약과 근거: [워크스페이스 canonical 계약의 쇼핑 확장](../wiki/pipelines/newsroom-video-production.md), [구현·승인 이력](docs/DECISIONS.md), [FastAPI 파일 업로드](https://fastapi.tiangolo.com/tutorial/request-files/), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html). 원 설계 두 파일은 수정하지 않았다.
