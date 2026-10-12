# 쇼핑 Shorts 수집 병목 조사와 해결안 (2026-09-23)

## 결론

대량 수집은 YouTube Data API가 담당하고 Chrome/Luna는 쇼핑 상품 카드의 소량 표본 검증에만 사용한다. 공개 Data API에는 YouTube Shopping 상품 태그 목록이나 태그 유무 필드가 없다. 따라서 전체 채널을 `태그 있음/없음`으로 강제 분류하지 않고 `태그 확인`, `태그 미관찰`, `API 기반 쇼핑 후보`를 분리한다.

## 1. API 할당량 병목

2026년 6월부터 YouTube Data API는 세분화된 할당량으로 전환 중이다. 현재 공식 문서에서 `search.list`는 Search Queries 버킷에서 호출당 1, 기본 100회/일이다. 일반 읽기 메서드는 별도 기본 10,000 단위/일이다. 현재 코드의 `search` 비용 100 단위 가정은 최신 구조와 맞지 않으므로 검색·일반 읽기·통계 갱신 예산을 서로 다른 카운터로 분리해야 한다.

- 검색: `search.list`, 최대 50건 × 100회 = 일일 최대 약 5,000개 검색 결과 행(중복 전)
- 채널 초기화: `channels.list`에 채널 ID 50개씩 묶기
- 전체 업로드 ID: `contentDetails.relatedPlaylists.uploads`와 `playlistItems.list` 사용
- 영상 메타데이터: `videos.list`에 ID 50개씩 묶기
- 조회수 갱신: 2026년 6월 추가된 `videos.batchGetStats` 사용

`videos.batchGetStats`는 조회수, 좋아요, 댓글, 게시 시각, 길이를 반환하고 호출당 1 단위이며 기본 10,000회/일인 독립 버킷을 가진다. 230,948개 영상을 50개씩 보수적으로 묶으면 약 4,619회로 한 번의 일일 버킷 안에 들어간다. 영상 제목·설명이 이미 저장된 경우 통계 갱신에 `videos.list`를 반복할 이유가 없다.

API가 실제로 403을 반환하면 내부 예산 문제가 아니라 프로젝트 버킷 소진 또는 제한이다. Google Cloud Console에서 버킷별 사용량을 확인하고, 지속 운영에 필요한 경우 공식 감사·할당량 증액 절차를 사용한다. 같은 용도의 Cloud 프로젝트를 여러 개 만들어 할당량을 우회하는 방식은 금지되어 있다.

## 2. 쇼핑 채널 발굴의 낮은 정밀도

`추천템`, `꿀템`, `리뷰`, `언박싱`은 쇼핑 상품 태그가 없는 일반 콘텐츠에도 널리 쓰인다. 제목 키워드는 후보 생성에는 유효하지만 태그 확정 증거가 아니다.

다음 순서로 검색 정밀도를 높인다.

1. `search.list`에서 `type=video`, `videoDuration=short`, `regionCode=KR`, `relevanceLanguage=ko`를 유지한다.
2. 별도 탐색군에 `videoPaidProductPlacement=true`를 적용한다. 이 필터는 제작자가 유료 프로모션으로 표시한 영상만 반환한다. Shopping 태그와 동일하지 않지만 일반 추천 영상보다 강한 상업 신호다.
3. 검색어마다 Chrome 확인 정밀도를 누적하고 다음 검색·검증 순위에 반영한다.
4. 이미 확인된 채널의 업로드는 검색으로 다시 찾지 않고 업로드 재생목록에서 가져온다.
5. `paidProductPlacementDetails.hasPaidProductPlacement`는 보조 신호로 저장하되 Shopping 태그로 간주하지 않는다.

## 3. 쇼핑 태그 확인 병목

공식 도움말상 Shorts의 실제 증거는 영상 좌하단의 Shopping 상품 스티커 또는 `제품 보기` 상품 링크다. 기능은 시청 지역에 따라 보이지 않을 수 있고, 라이선스 음악이나 Remix 콘텐츠에서는 태그가 있어도 라벨이 표시되지 않을 수 있다. 따라서 한 영상에서 버튼을 찾지 못한 결과는 `태그 없음`이 아니라 `태그 미관찰`이다.

공개 Data API의 `paidProductPlacementDetails`는 유료 PPL 공개 여부만 나타낸다. YouTube Shopping 상품 태그 목록이나 태그 유무와는 다른 필드다. 경쟁 채널의 Shopping 태그를 대량으로 조회하는 공식 공개 API는 현재 확인되지 않았다.

Chrome/Luna 검증은 다음 용도로 제한한다.

- API 후보 중 우선순위가 높은 채널의 2~3개 Shorts 표본
- DOM의 실제 `제품 보기` 링크나 화면의 상품 스티커 확인
- 태그 확인 채널에서 검색 모델을 개선할 학습 표본 생성
- UI 변경 시 탐지 규칙 회귀 검사

YouTube 개발자 정책은 YouTube 애플리케이션의 직접·간접 스크래핑을 금지한다. 그러므로 Chrome 자동화를 1,833개 채널의 대량 데이터 수집기로 확대하지 않는다. 브라우저는 사람이 수행할 수 있는 제한된 품질 감사로 두고, 대량 데이터는 공식 API로만 수집한다.

## 4. 1,944개 채널의 영상 표본 부재

모든 채널을 공평하게 한 페이지씩 수집하는 현재 sample-first 방향이 맞다. 필요한 요청량은 대략 다음과 같다.

- `channels.list`: 1,944 / 50 ≈ 39회
- 첫 업로드 페이지: 채널당 `playlistItems.list` 1회 ≈ 1,944회
- 첫 페이지 영상 상세: 채널당 최대 `videos.list` 1회 ≈ 1,944회

합계 약 3,927회로 일반 읽기 10,000 단위 안에 들어간다. 첫 표본을 모두 확보한 다음, Chrome에서 태그가 확인됐거나 API 상업 신호가 강한 채널만 전체 이력을 백필한다.

## 5. 지속 수집의 폴링 비용

YouTube는 채널 업로드 및 영상 제목·설명 변경을 PubSubHubbub/WebSub 알림으로 제공한다. 확인된 채널에 웹훅을 구독하면 모든 채널을 주기적으로 다시 조회할 필요가 없다. 알림의 `yt:videoId`와 `yt:channelId`를 저장한 뒤 새 영상만 API로 보강한다.

사용자가 예약 실행을 원하지 않는 현재 상태에서는 이를 활성화하지 않는다. 추후 지속 수집을 켤 때는 12시간 전체 폴링보다 Vercel의 공개 콜백 엔드포인트와 WebSub 구독이 효율적이다.

## 6. 돌연변이 영상 판별

업로드 기간을 필터로 제외하지 않되, 오래된 영상이 누적 조회수 때문에 자동으로 이상치가 되는 문제는 보정해야 한다.

- 채널별 `log1p(viewCount)` 중앙값과 MAD를 사용한 강건한 이상치 점수
- 업로드 연령 구간별 비교 점수와 채널 전체 순위를 함께 보관
- 최소 영상 수가 부족한 채널은 `근거 부족` 처리
- 반복 통계 스냅샷이 생긴 뒤에는 누적 조회수보다 24시간·7일 조회 증가량을 우선
- 조회수, 좋아요, 댓글은 원자료로 보존하고 파생값의 계산식과 기준 시점을 표시

2025년 3월 31일부터 Shorts 조회수는 재생 또는 재재생이 시작되면 집계되므로, 이전 정의로 수집된 시계열과 새 수치를 혼합하지 않는다. SciPy의 MAD는 표준편차보다 이상치에 덜 민감한 분산 척도다.

YouTube 개발자 정책은 채널에 독자적인 품질·브랜드 점수를 부여하는 행위를 제한한다. 대시보드에는 채널 품질 점수 대신 원 조회수, 채널 내 순위, 중앙값 대비 단순 배수와 계산 시점을 표시하고, Shopping 태그 관찰 결과를 별도 출처로 명시한다.

## 구현 우선순위

1. API 예산을 `search`, `general read`, `batch stats` 세 버킷으로 분리한다.
2. `videoPaidProductPlacement=true` 검색군을 추가하고 기존 검색군과 성과를 별도 측정한다.
3. 1,944개 무표본 채널의 첫 업로드 페이지를 모두 채운다.
4. 조회수 갱신을 `videos.batchGetStats`로 전환한다.
5. 태그 확인 57개 및 새 API 고정밀 후보만 전체 업로드를 백필한다.
6. 채널별 MAD·연령 구간·조회 증가량 기반 돌연변이 분류를 생성한다.
7. 지속 수집을 다시 허용할 때만 WebSub 알림을 연결한다.

## 2026-09-23 적용 상태

- 완료: 검색·일반 읽기·일괄 통계 예산을 독립 버킷으로 분리했다.
- 완료: `videoPaidProductPlacement=true` 전용 검색군 10개를 추가했다.
- 완료: 전체 조회수 갱신을 `videos.batchGetStats`로 전환했다.
- 완료: 제목·설명 등 메타데이터는 25일 이상 지난 항목만 `videos.list`로 다시 받아 30일 보존 규칙을 지킨다.
- 완료: 검색 또는 일반 읽기 예산이 끝나도 일괄 통계 갱신을 계속한다.
- 검증: 전체 테스트 41개가 통과했고, 실제 API에서 일괄 통계 1건과 유료 프로모션 검색 50건 응답을 확인했다.
- 미실행: 예약 작업과 WebSub 구독은 사용자의 현재 지시에 따라 만들지 않았다.

## 공식 근거

- [YouTube Data API search.list](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube Data API videos.batchGetStats](https://developers.google.com/youtube/v3/docs/videos/batchGetStats)
- [YouTube Data API videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [YouTube Data API 채널 업로드 재생목록](https://developers.google.com/youtube/v3/guides/implementation/channels)
- [YouTube Data API 푸시 알림](https://developers.google.com/youtube/v3/guides/push_notifications)
- [YouTube Shopping 상품 태그](https://support.google.com/youtube/answer/10191533)
- [YouTube Data API 할당량 및 감사](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [YouTube API 개발자 정책](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube Data API 변경 기록](https://developers.google.com/youtube/v3/revision_history)
- [SciPy median_abs_deviation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.median_abs_deviation.html)
