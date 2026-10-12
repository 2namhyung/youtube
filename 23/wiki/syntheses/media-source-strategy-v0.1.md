# Media source strategy

- Updated: 2026-09-13
- 역할: 외부 소스 수집 전략. 제작 방식·검수의 정본은 [[remotion-vox-production-playbook-v0.1]], 실제 검색 명세는 [episode-spec](../../video/episodes/episode-001/episode-spec.json), 검색·원본 처리 기준은 [[../concepts/media-acquisition-pipeline]]이다.
- 사용자 결정: 넓은 외부 소스 수급으로 대사에 맞는 실사와 모션그래픽을 만든다. 소스가 없다는 이유로 반복 컷·일반 도형·Omni로 바꾸지 않는다.

## 검색 범위를 넓히는 기준

| 필요한 내용 | 검색 축 | 사용 범위 |
|---|---|---|
| 실제 정치·입법 장면 | 정확 기관·회의·날짜·발언자, 현장 영상과 정지 사진 | 실제 사건이면 exact binding. 다른 회의는 일반 맥락으로만 검토 |
| 경찰·검찰·법원 | 정확 한국 기관, 민원·접수·자료 전달·복도·외관 | 외관만 계속 쓰지 않는다. 화면에 실제 있는 행위 이상을 주장하지 않음 |
| 기록과 보완 확인 | 기록 묶음·송부·분류·보관·통지, CCTV 장치·저장장치·우편·금융 관련 실물 | 여러 동작과 구도를 찾고 관계 설명에 필요한 독립 자산도 수집 |
| 모션그래픽 | 각 기관·사물의 원본 사진, 데이터·법률 원문 | 사진 자산과 정확 관계를 결속. 캡처는 evidence-only, 문구는 raster-free |
| 가상 사건 | 동일 구매자·상자·잘못 온 물건·기록의 상태 | Omni continuity 설계용. 실제 사건·실명 인물 생성 금지 |

기관·장소·정체성이 내용이면 한국성 확인이 필요하다. 배경을 분리할 CCTV·봉투·파일철 같은 일반 사물은 장소 중립적인 공개 원본도 찾는다. 검색 편의를 위해 모든 객체에 `Seoul Korea`를 붙이지 않는다. 법률 키워드만 검색하지 않고 대상·행동·동의어·매체 종류를 바꾼다.

## 공급처 운영

공식·공공기관의 항목별 공개 원본, KOGL, Commons의 파일별 원본을 기본 발견 경로로 사용한다. 필요에 맞는 LOC·공개 아카이브·기존 무료 스톡 경로는 각각의 실제 항목 조건과 의미 적합성을 확인한다. 플랫폼 이름만으로 권리를 확정하지 않는다. API나 검색 도구가 막히면 해당 query의 실패를 기록하고 다른 공개 검색 경로를 검토한다.

공급처 특성의 기존 출처: [라이브러리 조사](../../raw/sources/reusable-media-libraries-2026-08-22.md), [API 경로 검증](../../raw/sources/media-api-route-verification-2026-08-22.md), [원본 영상 수집 기록](../../raw/sources/keyless-video-implementation-2026-08-22.md), [KOGL·LOC 기록](../../raw/sources/kogl-and-loc-live-verification-2026-08-23.md). 이 자료는 과거 조사이며 현재의 전체 공급처 가용성을 보장하지 않는다.

[한국 소스 self-service 정책](korean-policy-media-intake-and-rights-v1.md)을 따른다. 이전 문서의 직접 촬영·유료 스톡 구매·라이선스 문의를 기본 루트로 제안하는 내용은 폐기한다. 연락·구매·직접 촬영을 후속 과제로 만들지 않는다. YouTube Standard와 권리 불명 영상은 제작 입력으로 자동 다운로드하지 않는다.

## 다양성은 파일 수와 다르다

원본 해시, 원본 URL, 대사에 대응하는 사물·행동, 장면과 구도를 함께 비교한다. 같은 영상의 인접 구간이나 같은 사진의 다른 크롭은 새 소스가 아니다. 한 원본의 점유율과 같은 업무 소재의 집중도는 사람이 고칠 문제를 찾는 진단값이며 의무 비율이 아니다.

검색 후보·다운로드 후보·사람이 선택한 원본·materialized asset·cut PASS를 구분한다. 두 분 프롤로그에 몇 개의 소스를 강제하는 옛 recipe는 폐기한다. 필요한 의미가 채워졌는지를 확인하고, 비어 있으면 그대로 남긴다.

현재 검색 계획과 실행 결과는 [파이프라인 검토판](../../video/qa/pipeline-audit/2026-09-13/review.html)과 [신규 후보 intake](../../video/source-intake/episode-001/broad-discovery-v01/)에서 확인한다. 이들은 production authority가 없는 검토 자료다.
