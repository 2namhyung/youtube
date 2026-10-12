# GitHub 영상 제작 저장소로 본 EP001 실사 수집 병목

## 결론

EP001의 병목은 공급처 수나 다운로드 개수가 아니다. 현재 검토판에는 120개 고유 원본과 89개 화면 brief가 있지만 `대상 + 행동 + 장소 + 화각 + 정확 시점`을 모두 증명하는 brief가 0개다. 70개는 부분 후보이고 19개는 미확보다. 즉, 검색 결과를 파일·제목 단위로 모은 뒤 사람이 뒤늦게 의미를 판정하는 구조가 장면 단위 수급을 막고 있다. Source: [현재 review manifest](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json), [수집 원장](../../video/source-intake/episode-001/source-first-rebuild-v01/source-acquisition-matrix.json).

## 참고할 GitHub 구현

| 저장소 | 실제 해결 방식 | EP001 적용 가치 | 그대로 쓰기 어려운 점 |
|---|---|---|---|
| [igoforth/broll-search](https://github.com/igoforth/broll-search) | 영상을 장면으로 분리하고 keyframe, 음성 전사, 시각 caption, CLIP embedding을 장면별로 저장한다. 대본 문장별 후보를 검색하고 중복을 제거한다. | 다운로드한 14개 영상 전체를 scene 단위로 재색인해 `손이 저장매체를 꺼냄`, `두 문서를 대조함` 같은 실제 행동을 찾는 기반으로 가장 적합하다. | GPU·PostgreSQL/pgvector·caption model 운영비가 필요하며 권리·한국 기관 정확성은 별도 gate가 필요하다. |
| [iBz-04/boomerang](https://github.com/iBz-04/boomerang) | 기본 6초/2초 overlap chunk, 다중 쿼리 확장, reciprocal-rank fusion, exact/span 시간 refinement를 쓴다. | 한 제목에 의존하지 않고 대상·행동·장소·화각 쿼리를 각각 검색한 뒤 합의 점수로 결합할 수 있다. 컷 경계에 걸친 행동도 놓치지 않는다. | 의미 유사도는 사실성·권리 승인과 다르므로 exact evidence gate를 대체할 수 없다. |
| [erfsalehi/B-Roll-Finder](https://github.com/erfsalehi/B-Roll-Finder) | 대본을 shot intent와 쿼리로 바꾸고 Pexels·Pixabay·YouTube·로컬 라이브러리를 함께 검색한다. LLM judge, rate-limit pacing, 교차 세션 cache, gallery review, 연속 중복 방지를 둔다. | provider별 수집을 하나의 후보 pool로 합치고, API quota를 쿼리 우선순위와 batch로 관리하는 참고 구현이다. | 제목·설명 기반 LLM rank만으로 실제 픽셀 행동을 승인하면 현재 오류가 반복된다. YouTube 후보의 재사용 권리도 별도 판정해야 한다. |
| [Netsoro/openmontage](https://github.com/Netsoro/openmontage) | Pexels·Archive.org·NASA·Wikimedia·Unsplash를 CLIP 색인 corpus로 묶고 provider를 task fit·quality·control·reliability·cost·latency·continuity로 평가한다. scene plan과 asset approval을 분리한다. | 공급처 breadth와 provider fallback을 늘리되 컷별 선택 이유를 감사 가능하게 남기는 구조를 참고할 수 있다. | 저장소가 주장하는 자동화 범위가 넓다. EP001의 법률·권리·사실 gate는 더 엄격하게 유지해야 한다. |
| [feyzilim/clipfactory](https://github.com/feyzilim/clipfactory) | 자체 B-roll library에 100개 단위 shot list와 coverage UI를 두고, scene 하나만 교체·재생성·승인할 수 있게 모든 artifact를 versioning한다. | `원본 개수` 대신 필요한 행동 shot의 촬영·수급 coverage를 보여주고 컷 단위 교체를 지원하는 UI가 유용하다. | 자체 촬영 library 중심이라 외부 공식·공개 라이선스 수급기는 아니다. |
| [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | content/adaptive/threshold detector로 scene boundary를 검출하고 exact timecode와 대표 frame을 만든다. | 외부 장편 영상과 공식 기록 영상을 수집 직후 자동 분할해 검색 단위를 파일에서 scene으로 바꿀 수 있다. | 장면 분할만 제공하므로 caption·embedding·권리 메타데이터는 별도 구현해야 한다. |
| [voxel51/fiftyone](https://github.com/voxel51/fiftyone) | similarity search, near-duplicate grouping, uniqueness score, embedding visualization으로 대규모 시각 후보를 큐레이션한다. | SHA가 다른 유사 사진·인접 프레임·같은 행동군 반복을 찾아내고, 각 brief에서 시각적으로 먼 후보를 우선 제시할 수 있다. | 데이터셋 도구라 편집 타임라인과 라이선스 gate는 직접 연결해야 한다. |
| [rom1504/img2dataset](https://github.com/rom1504/img2dataset) | URL 목록을 병렬·incremental shard로 내려받고 URL, caption, status, error, dimensions, EXIF, SHA-256을 함께 저장한다. | API 제한이 있는 대량 사진 수집에서 재시작, 실패 원인, 원본 hash와 메타데이터를 일관되게 남기는 참고 구현이다. | 검색·선정 엔진은 아니며 사전 필터가 나쁘면 무관한 후보만 대량으로 늘어난다. |
| [AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | 컷 순서·길이·외부 media reference를 표준 timeline으로 표현하고 adapter로 편집기 형식을 교환한다. | 승인된 exact source window를 편집기로 넘길 때 timecode 결속이 깨지는 문제를 줄일 수 있다. | 수집과 검색은 해결하지 않는다. source-ready 이후 단계에만 적용 가치가 있다. |

## 우리 파이프라인의 구체적 병목

1. **검색 대상이 원본 파일이다.** 영상 안에 적합한 2–8초 행동이 있어도 제목·페이지 metadata가 그 행동을 말하지 않으면 찾지 못한다.
2. **쿼리 확장은 했지만 검색 신호가 결합되지 않는다.** 대상·행동·장소·화각을 한 긴 문자열로 보내면 provider 검색엔진이 일부 명사만 맞춘다. 그래서 CCTV 사진은 많아져도 저장매체를 확인하는 행동은 비어 있다.
3. **사진과 영상의 역할이 수집 초기에 충분히 갈리지 않는다.** 정지사진 subject-fit이 source-video 행동 brief 주변에 계속 노출되어 사람의 검토량만 늘린다.
4. **부분 후보가 다음 검색을 학습시키지 않는다.** `CCTV 장치는 있음 / 손동작 없음`이라는 판정이 다음 쿼리의 필수 조건과 negative query로 자동 환류되지 않는다.
5. **diversity가 SHA·subject family 중심이다.** 서로 다른 파일이어도 같은 정면 건물, 책상, 필기 행동이 반복된다. shot scale, camera angle, human action, place context를 별도 축으로 다뤄야 한다.
6. **provider quota가 brief 가치와 연결되지 않는다.** 정확 행동이 필요한 source-video 컷과 설명용 정지 자산이 같은 탐색 폭을 소비한다.
7. **검색과 승인 사이의 간격이 크다.** 현재 fail-closed 승인 규칙은 옳지만, 검색 결과에 자동 scene caption과 exact time window가 없어 사람이 120개 원본을 다시 열어봐야 한다.

## 권장 구현 순서

### P0 — 현재 수집기를 scene-first로 변경

- 수집한 모든 영상에 PySceneDetect를 실행해 `scene_id`, start/end timecode, 3개 대표 frame을 만든다.
- scene마다 시각 caption과 embedding을 생성한다. caption schema는 자유 문장이 아니라 `subject`, `action`, `place`, `viewpoint`, `objects`, `visible_text_or_logo`, `people`, `quality` 필드로 고정한다.
- brief도 같은 필드의 독립 쿼리 6–12개로 확장한다. 검색은 각 쿼리의 결과를 reciprocal-rank fusion으로 합친다.
- 검색 결과는 `source file`이 아니라 `exact scene window`를 반환한다. 현재 sequence-coverage validator가 최종 승인 판단을 계속 소유한다.

### P1 — 부족한 축을 이용한 능동 재검색

- 부분 후보 판정에서 부족한 필드를 계산한다. 예: SH012는 `CCTV/DVR subject 충족`, `storage-removal/review action 미충족`, `close-up viewpoint 미충족`이다.
- 다음 검색은 충족된 일반 명사를 줄이고 부족한 행동과 화각을 강화한다. 예: `technician removes SD card from DVR close-up`, `investigator reviews CCTV storage media hands`.
- 한국 기관 exact claim은 공식·KOGL·Commons의 정확 metadata가 있을 때만 연결하고, generic object/action은 해외 공개·스톡 provider까지 넓힌다.

### P2 — 후보 다양성 최적화

- SHA 중복 제거 뒤 CLIP near-duplicate cluster를 만든다.
- 각 brief에서 relevance 상위 후보 중 `source`, `subject family`, `action`, `shot scale`, `camera angle`, `place`가 다른 후보를 maximal-marginal-relevance 방식으로 12–20개 제시한다.
- 인접 컷에는 같은 cluster를 자동 감점하고, 반복 사용은 명시적 continuity 이유가 있을 때만 허용한다.

### P3 — quota와 사람 검토 최적화

- 우선순위를 `source-video exact action gap > Korean institution exact context > Remotion independent real layer > generic photo alternative`로 둔다.
- provider별 요청 budget, Retry-After, 다음 재개 cursor, cache hit를 ledger에 기록한다.
- gallery에는 파일 대표 썸네일 한 장 대신 scene strip, exact timecode, 필드별 충족/부족, 라이선스, 같은 cluster 후보를 함께 표시한다.

### P4 — 승인 이후 편집 전달

- 사용자 승인된 exact window만 OpenTimelineIO 또는 현재 render catalog로 내보낸다.
- source approval 전에는 지금처럼 production authority를 열지 않는다.

## EP001에 바로 적용할 첫 검증 세트

- SH012: `CCTV/DVR 설치 전경`과 `저장매체를 꺼내거나 연결해 검토하는 손 클로즈업`을 별도 scene으로 찾는다.
- SH013: 외부 검색은 `경찰·검찰 장소 원본`과 `기록 묶음/봉투 원본` 확보에 한정한다. 경찰→검사 관계 자체는 실사 stock 검색으로 억지 충족하지 않고 Remotion 관계 표현으로 구현한다.
- SH017/020: 두 사람이 같은 문서를 읽는 후보에서 멈추지 말고 `두 기록을 나란히 비교`, `한 항목을 가리키고 다른 기록 확인` 행동을 찾는다.
- SH024/025/039/043/046: `받기`, `분류`, `보관`, `대조`, `반출`을 하나의 문서 workflow로 합치지 않고 각각 독립 행동 cluster로 수집한다.

## 채택 판단

전체 저장소를 가져오는 방식보다 기능을 좁게 이식하는 편이 안전하다. 우선 도입할 핵심은 `PySceneDetect 장면 분할 + 구조화 caption + CLIP scene index + Boomerang식 multi-query/RRF/time refinement + FiftyOne식 near-duplicate/uniqueness`다. 현재의 provenance, rights, SHA-256, production authority, human PASS validator는 유지한다. B-Roll-Finder와 OpenMontage의 provider orchestration은 검색 budget과 review UX만 참고하고 자동 승인 로직은 가져오지 않는다.
