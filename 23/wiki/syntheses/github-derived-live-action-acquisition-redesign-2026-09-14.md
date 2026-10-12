# GitHub 조사 기반 실사 수집 로직 재설계와 재실행

## 판정

기존 1,299개 원장은 `plan-no-network`였으므로 실제 수집 완료를 뜻하지 않았다. 이번 변경은 [GitHub 1차 조사](github-video-source-pipeline-bottleneck-study-2026-09-14.md)와 [추가 조사](github-video-source-pipeline-extended-study-2026-09-14.md)의 공통 결론을 적용해, 공급처·파일 제목 중심 탐색에 행동 gap 쿼리와 장면 인덱스를 추가한다. 검색·caption·점수는 승인 결정을 바꾸지 않으며, 권리·원본·exact window·사람 검토 gate를 유지한다.

## 새 수집 경로

1. `episode-spec.json`의 production mode로 사진과 영상을 분리한다.
2. 대상·장소 쿼리와 별개로, 현재 검토판에서 비어 있는 행동을 `observed-gap-action` 쿼리로 실행한다.
3. `--cut-id`로 정확 행동이 필요한 컷만 묶어 API quota를 우선 배정한다.
4. 결과는 metadata 후보로만 기록하며, 다운로드·decode·SHA-256 확인을 통과한 파일만 로컬 후보가 된다.
5. 다운로드한 영상은 6초 chunk와 2초 overlap, chunk당 3개 keyframe으로 색인한다. 각 chunk의 `subject/action/place/viewpoint/objects/text/people/quality` perception은 관찰 전까지 비워 둔다.
6. 사람이 exact window와 의미를 확인한 뒤에만 현재 sequence coverage와 materialization 경로로 보낸다. 같은 SHA, 같은 행동, 같은 화각의 반복은 새 후보로 세지 않는다.

Source: [통합 검색기](../../video/scripts/search-episode-media.mjs), [장면 인덱서](../../video/scripts/index-acquired-video-scenes.mjs), [장면 원장](../../video/source-intake/episode-001/scene-index-v01/scene-index.json).

## 1차 실제 실행 결과

우선 컷은 SH012, SH013, SH017, SH020, SH024, SH025, SH039, SH043, SH046이다. Commons에 131개 고유 쿼리를 실제 실행했다. 13개 검색이 성공하고 60개 metadata 후보가 나왔으며, 66개는 빈 결과, 3개는 metadata 불일치, 49개는 HTTP 429였다. bounded download 8개 가운데 사전조건과 순위·응답을 통과해 실제 저장된 영상은 1개였다. Source: [실행 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T08-54-07-709Z.json).

확보 영상은 러시아의 운석 낙하 CCTV 기록 35.54초, 1280×720, Public Domain이었다. 9개 겹침 chunk와 27개 keyframe으로 색인한 뒤 화면을 확인했다. 눈 덮인 야외와 운석 섬광만 보이고 CCTV/DVR 장치나 저장매체 검토 행동은 없으며 고정 타임코드가 있다. 따라서 SH012에서 제외했다. 이는 `surveillance camera`라는 metadata 일치가 장면의 행동 일치가 아니라는 GitHub 조사 진단을 실제로 재확인한다. Source: [curation](../../video/source-intake/episode-001/source-selection-v02/curation.json), [scene index](../../video/source-intake/episode-001/scene-index-v01/scene-index.json).

## 다음 실행 규칙

- HTTP 429가 발생한 49개는 같은 실행에서 무한 재시도하지 않는다. provider·cursor·오류를 보존하고 다음 창에서 재개한다.
- SH012는 `DVR 저장장치를 꺼냄/연결함/검토함`, SH013은 `봉인 기록 묶음을 사무 담당자가 인계·수령함`, SH020·SH046은 `한 위치를 가리킴/두 기록을 나란히 대조함`을 필수 행동으로 둔다.
- Pexels API key가 있는 실행 환경에서는 같은 컷 필터를 Pexels video에 실행한다. 한국 기관 정확성이 필요한 컷은 공식·KOGL 경로로 분리하고 generic 행동에는 한국 기관을 지어내지 않는다.
- scene perception과 유사도는 후보 정렬에만 쓰며 `exact`와 source PASS는 사람이 실제 픽셀과 구간을 확인할 때만 기록한다.

이번 변경과 실행은 production mode, source PASS, cut PASS, production authority를 변경하지 않았다. 재생성된 검토판은 exact brief 0/89, partial 70, missing 19, sequence-ready 0/48이다. Source: [검토 원장](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json).

## Pexels 행동 영상 재실행

Pexels key가 확인된 환경에서 우선 9컷의 117개 영상 쿼리를 실행해 오류 없이 metadata 후보 543개를 받았다. 첫 실행은 Pexels video 응답에 서술형 object metadata가 없다는 이유로 543개가 모두 다운로드 전 차단됐다. `observed-gap-action`으로 찾은 generic 영상에만 이 metadata precondition을 완화하고, 최대 8개 다운로드·decode·hash·사람 픽셀 검토 제한은 유지했다. 이어 SH012·SH013·SH020·SH046의 57개 쿼리를 다시 실행해 후보 312개 중 영상 8개를 확보했다. Source: [Pexels 9컷 실행 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T09-30-21-877Z.json), [4컷 bounded download 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T09-32-50-920Z.json).

8개를 38개 overlap chunk로 색인해 비교한 결과, SH020의 문서 특정 행을 손가락으로 따라가는 영상과 SH046의 두 사람이 여러 문서를 나란히 대조하는 영상이 가장 직접적인 후보다. SH013에는 봉투 인계와 문서 전달 행동 3개가 부분 후보로 남았다. CCTV 관제실은 SH012 장소 맥락 후보지만 저장매체 확인 행동은 없었다. 서버 rack, 카세트 녹음기, 비공식 봉투 교환은 각각 DVR·저장매체·공식 기록 인계와 달라 제외했다. Source: [장면 비교판](../../video/source-intake/episode-001/scene-index-v01/contact.jpg), [curation](../../video/source-intake/episode-001/source-selection-v02/curation.json).

재생성된 검토판은 로컬 고유 원본 129개, 영상 23개, 의미군 44개다. partial brief는 72개, missing brief는 17개로 바뀌었지만 exact와 sequence-ready는 여전히 0이다. 행동 후보가 늘어난 것과 제작 준비 완료는 구분한다. Source: [현재 검토 원장](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json).

## SH012·SH013 2차 정밀 실행

검색어를 장비명에서 실제 손동작으로 더 좁혔다. SH012는 HDD·SD 카드·외장 드라이브의 분리·삽입·연결, SH013은 봉인 봉투의 창구 수령·서명·기록 묶음 인계로 확장했다. Pexels 51개 쿼리에서 metadata 후보 243개를 확인하고, 이미 받은 candidate ID를 건너뛴 뒤 신규 영상 7개를 다운로드·디코딩·SHA-256 확인했다. Source: [2차 실행 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T11-20-18-514Z.json).

픽셀 검토 결과 CCTV 다중 모니터를 확인하는 관제 인력은 SH012의 장소·맥락에는 적합하지만 저장매체를 꺼내거나 연결하는 핵심 행동이 없었다. 서비스 공간에서 종이 한 장을 건네는 장면은 SH013의 전달 행동에는 가깝지만 사건기록·수사기관·봉인 증거가 없다. 사무실 판지 상자, 야외 소포, 택배 스캐너, 일반 사무기기, 식별 불가 소형 물건은 의미 불일치로 제외했다. Source: [2차 비교판](../../video/source-intake/episode-001/scene-index-v01/sh012-sh013-round2-contact.jpg), [curation](../../video/source-intake/episode-001/source-selection-v02/curation.json).

현재 검토판은 고유 원본 136개, 영상 30개, 의미군 51개다. 화면용 명세 89개 중 partial 72, missing 17이며 exact와 sequence-ready는 0이다. SH012는 실제 DVR/저장매체 취급 영상, SH013은 공식 기관 맥락이 확인되는 기록 묶음 인계 영상이 추가로 필요하다. Source: [현재 검토 원장](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json).

## 명세 오류 제거와 3차 공급처 조사

SH013의 보조 명세가 `택배 우편 분류 배송 물류`를 요구해 사건기록 인계와 무관한 소포·스캐너 후보를 반복 유입시키고 있었다. 이를 삭제하고 `대한민국 경찰·검찰의 사건기록 접수 또는 인계 장소` 명세로 교체했다. SH012는 관제실·녹화장치의 장소 확립과 HDD·SD 카드·외장 저장장치의 실제 분리·삽입·연결 행동을 서로 다른 brief로 분리했다. Source: [episode spec](../../video/episodes/episode-001/episode-spec.json).

수정 명세로 Commons 51개 쿼리를 전부 실행했다. metadata 후보 28개, HTTP 429 오류 21개, 신규 다운로드 1개였으나 이 영상은 국경 검문소 차량 사고의 CCTV 화면으로 저장매체 취급과 무관해 제외했다. Source: [3차 실행 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T11-28-52-797Z.json), [프레임 비교판](../../video/source-intake/episode-001/scene-index-v01/sh012-commons-round3.jpg), [curation](../../video/source-intake/episode-001/source-selection-v02/curation.json).

무료 후보 밖에서는 SH012의 CCTV 녹화기에 HDD를 장착하는 Shutterstock 항목과 SH013의 한 사람이 dossier를 놓고 다른 사람이 가져가는 iStock 항목이 강한 부분 후보였다. 두 항목 모두 유료 라이선스 원본과 정확 행동 timecode가 없으므로 production 후보로 넣지 않고 구매 전 검증 목록에만 기록했다. Pexels 7255101은 AI Video 표시와 행동 부족, 8814711은 일반 계약 문서 전달 및 인물 정책 제한 때문에 제외했다. Source: [외부 항목 shortlist](../../video/source-intake/episode-001/source-selection-v02/exact-action-external-shortlist-v01.json).

KOGL 전체 CSV 검색은 첫 실행에서 약 2GB 메모리를 쓰며 장시간 정체됐다. 원인은 최대 90MB의 넓은 CSV에서 모든 열과 모든 행을 객체로 보관한 뒤 쿼리별로 다시 훑는 구조였다. 검색에 필요한 열만 투영하고, 이번 실행의 쿼리 중 하나에도 제목이 맞지 않는 행은 파싱 중 즉시 버리도록 바꿨다. 재실행의 working set은 약 298MB였고 SH012·SH013의 50개 KOGL 사진·영상 쿼리를 오류 없이 끝냈다. 결과 후보는 0개였으며 이를 성공 원장으로 남겼다. Source: [KOGL 파서](../../src/lib/kogl-media.ts), [통합 검색기](../../video/scripts/search-episode-media.mjs), [KOGL 실행 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-14T11-44-46-670Z.json).
