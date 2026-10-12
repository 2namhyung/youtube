# 국내 사진 수집 루트와 YouTube 적합성 — 2026-08-15

- Captured: 2026-08-15 KST
- Status: source-backed acquisition guidance; production admission 아님
- Scope: 국내 출처·국내 촬영 사진의 탐색, 권리 확인, YouTube 적합성. Provider, render, upload, publication, Stage 07 권한 없음.

## 결론

국내 사진을 80% 이상 쓰는 것은 가능하지만 `사진 사용 허가`만으로는 부족하다. YouTube는 저작권과 별개로 채널 전체의 reused/inauthentic content를 심사한다. 따라서 각 사진은 권리 증거와 함께 `내레이션에 새로 더하는 정보`, `컷별 실질 편집`, `자료사진 고지`, `사건 당사자 오인 방지`를 기록해야 한다.

현재 국내 전용 수집은 46개 실사진 필요 컷 중 물리 사진 21개를 보유했지만 모두 exact cut semantic review 전의 conditional이다. 미확보 25개는 경찰관 부친 13개와 제주 사건 12개이며, 기존 21개도 승인된 80% 커버리지로 계산하지 않는다.

## YouTube 공식 지침에서 파생되는 게이트

1. **재사용 콘텐츠는 저작권 허가와 별개다.** 온라인 출처를 실질적 원창작 해설·수정·교육/오락 가치 없이 재사용하면 문제가 될 수 있고, 이 심사는 채널 전체에 적용된다. 원권리자의 허가가 있어도 reused-content 심사를 자동 통과하지 않는다. Source: [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392).
2. **사진 슬라이드쇼 자체는 충분하지 않다.** 내레이션·논평·교육 가치가 거의 없는 이미지 슬라이드쇼, 반복 템플릿, 대량생산형 AI 콘텐츠는 수익화 불가 예시에 포함된다. 반대로 원본 스토리라인·해설과 실질적인 시청각 편집이 있어 채널 고유성이 드러나는 편집은 허용 예시에 든다. Source: [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392), [TeamYouTube 2025 clarification](https://support.google.com/youtube/thread/356734251).
3. **출처표시는 허가나 공정이용을 만들지 않는다.** YouTube는 CC BY가 상업 이용을 허용하면 수익화할 수 있다고 안내하지만, 타인의 콘텐츠 권리를 대신 허가하지 않는다. 공정이용은 사건별로 법원이 판단하며 출처표시나 면책문구만으로 성립하지 않는다. Source: [YouTube license types](https://support.google.com/youtube/answer/2797468), [Fair use on YouTube](https://support.google.com/youtube/answer/9783148).
4. **식별 인물은 동의·공익·뉴스가치를 별도로 본다.** 얼굴·음성·성명·연락처 등으로 식별되는 사람은 privacy complaint 대상이 될 수 있다. YouTube는 동의, 공익, 뉴스가치, 사망·중상 장면 여부를 고려한다. 교사·미성년 피의자·환자·일반 병원 직원은 기본 비식별 처리한다. Source: [YouTube privacy guidelines](https://support.google.com/youtube/answer/2801895).
5. **사건 사진의 맥락은 영상/음성 안에 있어야 한다.** 뉴스·교육·다큐 맥락은 광고 적합성 판단에 중요하며, 혈액·신체분비물·범죄현장 사진을 맥락 없이 초점화하면 제한 또는 광고 불가가 될 수 있다. 제목·설명만으로 충분하지 않은 고위험 맥락도 있다. Source: [Advertiser-friendly guidelines](https://support.google.com/youtube/answer/6162278), [EDSA evaluation](https://support.google.com/youtube/answer/6345162), [ad review principles](https://support.google.com/youtube/answer/9269751).
6. **현실적으로 보이는 Grok 재현은 공개 시 표시 대상이다.** 실제 사람·사건·장소를 현실적으로 변형하거나 실제로 없던 장면을 사실처럼 생성하면 altered/synthetic disclosure가 필요하다. 업스케일·샤프닝 같은 경미한 보정은 그 자체로 표시 대상이 아니다. Source: [altered or synthetic content disclosure](https://support.google.com/youtube/answer/14328491).

## 고정 국내 수집 루트

| 우선순위 | 루트 | 적합한 컷 | 이용 판정 | 수집 방법 |
|---|---|---|---|---|
| 1 | 자체 촬영·국내 위탁 촬영 | 빈 교실, 복도, 출입문, CCTV, 병원 대기실, 커피·문서·증거봉투 | 원본·촬영계약·인물/장소 release가 있으면 allow | shot list를 먼저 만들고 한 번의 촬영으로 변별 가능한 원본을 컷별 1장씩 확보한다. |
| 2 | 포토코리아 관광사진 OpenAPI | 제주·전주·구리 등 지역 establishing, 공공건물 외관, 도로·도심 | API 수록 사진은 KOGL1 후보; item metadata·촬영자·출처 보존 | 개발키로 키워드/지역 검색→item metadata→원본→SHA-256→출처문구 생성. 약 10만 장, 개발 1,000호출. [공식 API](https://www.data.go.kr/data/15101914/openapi.do) |
| 3 | 공공누리 원문·공유마당 사진 | 경찰·법원·교육·보건 시설, 장비, 제도 맥락 | KOGL0/1·국내 CC BY/PD만 allow; item 단위 | 이미지+원문 공공저작물+유형0/1 필터. 공유마당은 사진과 CC BY/만료/기증을 분리 검색한다. [공공누리](https://www.kogl.or.kr/info/license.do), [공유마당](https://gongu.copyright.or.kr/gongu/main/main.do) |
| 4 | 경찰청·지방경찰청 media room | 경찰차, 장비, 과학수사, 관제·치안 시설 | item KOGL1 allow; 미표시는 서면 허가 전 conditional | 부서·촬영일·사진 원저작자·상업 YouTube/편집 범위를 확인한다. [경찰청 정책](https://www.police.go.kr/www/guide/copyright.jsp) |
| 5 | 제주도·제주교육청·제주시교육지원청 | 제주 공공건물, 학교 외관, 빈 복도·교무실 | item KOGL1 allow; KOGL2/3/4 deny; 미표시는 서면 허가 | 미성년자·학교명·보안설비가 없는 사진만 사용하고 `자료사진·사건 학교와 무관`을 화면 안에 표시한다. [교육지원청 정책](https://www.jje.go.kr/jjse/index.jje?menuCd=DOM_000001508004000000) |
| 6 | 국가기록원·e영상역사관 | 한국의 경찰·법원·교육·의료 역사 맥락 | item KOGL0/1만 자동 후보; 미표시는 사전 협의 | item 페이지, 촬영일·장소, 유형, 담당자 허가서를 저장한다. [국가기록원](https://www.archives.go.kr/next/neworgan/copyrightProtection.do), [e영상역사관](https://www.ehistory.go.kr/etc/copyright) |
| 7 | 뉴스토어·국내 통신사 유료 사진 | 실제 사건 현장·기관 제공 증거사진·법원 자료사진 | 주문별 언론사 승인 후 conditional→allow | 사진을 기사와 별도 구매한다. 개인 크리에이터 영상은 현재 1년·건당 1만~4만 원(VAT 별도, 구독자 구간별). 크롭·자막·썸네일·보관·AI 전송을 주문서에 명시한다. [가격·절차](https://www.newstore.or.kr/store/prodct/single/list.do) |
| 8 | 촬영자 직접 제보 | 실제 현장·사건 전후 지역 사진 | 촬영자·인물·장소 권리와 상업 영상 범위가 서면 확인된 경우만 allow | 공개 게시물을 긁지 않고 원촬영자가 원본/EXIF와 계약서로 직접 제출한다. 실제 사건 실사진은 Grok에 전송하지 않고 로컬 편집만 한다. |

## 현재 미확보 25컷의 조달 분배

### 경찰관 부친 13컷

- 경찰청·전북경찰청 KOGL1 또는 서면 허가: 경찰 장비, 과학수사, CCTV 관제, 치안센터, 경찰차, 전북 경찰 맥락 등 7컷.
- 법원·검찰 기관 허가 또는 뉴스토어 자료사진: 법원, 검찰청, 법원 복도 3컷. 검찰 사이트의 일반 공개 이미지는 상업 허가로 보지 않는다.
- 자체 촬영: 증거 봉투·수사 서류·공공기관 문서 책상 3컷. 문서 내용은 허구/비식별 소품으로 만들고 사건 증거라고 부르지 않는다.

### 제주 사건 12컷

- 제주도·제주교육청·제주시교육지원청 KOGL1/서면 허가: 교육청, 학교 정문, 교육청 건물, 제주 공공기관 복도, 제주 경찰 맥락 등 6컷.
- 포토코리아·제주 공공기관: 제주 법원/공공건물 외관·지역 establishing 2컷. 정확한 기관이 아니면 `제주 지역 자료사진`으로만 쓴다.
- 자체 또는 위탁 촬영: 빈 교실 출입문, CCTV, 학교 복도, 교무실 4컷. 실제 사건 학교·교사·학생·증거물은 촬영하거나 암시하지 않는다.

## 컷별 입장 조건

사진 한 장마다 다음이 모두 있어야 한다.

- `storyId:cutId`, storyboard visual need, narration subspan
- canonical item URL, 원기관 URL, 촬영자·촬영일·촬영지, exact license/rights statement, 조회시각
- 원본 bytes/SHA-256/dimensions와 파생본 hash·crop/upscale 내역
- `imageContribution`: 장소·정체·증거·비교·결과 중 내레이션에 새로 더하는 한 가지
- `youtubeOriginalityPlan`: 내레이션 해설, 화면 내 출처/자료사진 고지, crop/pan/annotation/motion의 컷별 고유 계획
- 인물·미성년자·사생활·상표·학교 보안·지리 오인·사건 당사자 암시 검토
- `sourceUseStatus`와 `providerInputStatus` 분리. 실제 사건/인물 사진은 기본 `providerInputStatus=denied`.

같은 사진을 여러 컷에 반복하거나, 사진이 내레이션을 그대로 반복하거나, 다른 사건/지역 사진을 해당 현장처럼 보이게 하면 실제 사진 커버리지에서 제외한다. 이 문서는 수집 경로를 정한 것이며 현재 25개 미확보 사진을 실제로 취득하거나 production admission을 승인하지 않았다.
