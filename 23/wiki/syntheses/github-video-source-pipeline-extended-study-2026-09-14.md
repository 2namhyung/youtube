# GitHub 영상 제작·실사 수집 저장소 추가 조사

이 문서는 [1차 조사](github-video-source-pipeline-bottleneck-study-2026-09-14.md)에서 다룬 9개 저장소와 겹치지 않는 추가 후보를 평가한다. 현재 기준은 [source review manifest](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json)의 120개 원본, 89개 brief, exact 장면 0개다.

## 우선 검토할 저장소

| 순위 | 저장소 | 확인한 구현 | EP001 적용 | 판단 |
|---:|---|---|---|---|
| 1 | [cgallic/video-review-os](https://github.com/cgallic/video-review-os) | `source.json`에 원본 hash·stream·safety, `clips.json`에 exact range와 keep/trim/review/reject, `perception.json`에 shot type·setting·people·camera motion·화면 글자·subject position, `assemblies.json`에 EDL을 분리한다. 판단 점수는 decision을 덮어쓰지 않으며 transcript SHA 계보를 보존한다. MIT. | 현재의 candidate/brief/approval 분리를 유지하면서 scene perception을 추가하기 가장 좋은 구조다. `perception.json` 필드를 우리 `subject/action/place/viewpoint` 계약으로 확장할 수 있다. | **구조를 가장 먼저 차용.** 전체 설치보다 JSON contract와 additive scoring 원칙을 이식한다. |
| 2 | [ssrajadh/sentrysearch](https://github.com/ssrajadh/sentrysearch) | 겹치는 video chunk를 Gemini Embedding 2, Qwen cloud 또는 local Qwen3-VL로 직접 embedding하고 ChromaDB에 저장한다. text와 reference-image 검색, 실패 chunk 재시도, cache/state, 자동 exact clip trim을 지원한다. Apache-2.0, GitHub 화면 기준 176 commits. | 정지 keyframe CLIP이 놓치는 `저장매체를 꺼낸다`, `봉투를 건넨다` 같은 시간적 행동을 video embedding으로 검색하는 A/B 후보로 적합하다. | **작은 corpus 실험 권장.** 외부 API 비용과 local model 성능을 20개 영상으로 비교한 뒤 채택한다. |
| 3 | [line/lighthouse](https://github.com/line/lighthouse) | 자연어 video moment retrieval과 highlight detection을 위한 여러 모델·feature 조합과 inference API를 제공한다. Moment-DETR, QD-DETR, CG-DETR 등과 CLIP/SlowFast feature를 지원한다. Apache-2.0, EMNLP 2024 demo 기반. | 단순 chunk 유사도보다 행동의 시작·끝을 찾는 검증용 benchmark로 가치가 크다. exact window 후보를 자동 제안하고 현 validator가 최종 확인하게 할 수 있다. | **연구용 비교 기준.** 운영 의존성으로 바로 넣기보다 SentrySearch/CLIP 결과의 시간 경계 품질을 평가한다. |
| 4 | [vulture-s/arkiv](https://github.com/vulture-s/arkiv) | FFmpeg, ChromaDB, local LLM으로 transcript·vision tag·분위기·편집 위치를 붙이고 다국어 semantic search, DaVinci Resolve 전달, clip rating을 지원한다. | 한국어 brief와 영어 stock metadata 사이의 다국어 검색, 향후 편집기 전달 UX를 참고할 수 있다. | PolyForm Perimeter이고 무료 core는 3 projects 제한이다. **코드 이식보다 UX·metadata schema 참고**가 안전하다. |
| 5 | [WordPress/openverse](https://github.com/wordpress/openverse) | 공개 라이선스 이미지·오디오 metadata를 Airflow catalog→ingestion server→Django API→검색 UI로 모은다. MIT이며 다수 provider의 creator/license/source metadata를 정규화한다. | Remotion 독립 실사 레이어와 source-photo 후보 폭을 늘리고, 라이선스·creator·원 item 필드를 일관되게 받을 수 있다. | **사진 검색 provider로 추가 가치가 높다.** 현재 video gap은 해결하지 못한다. |

## 자산·검수·출처 계층 후보

| 저장소 | 쓸 수 있는 부분 | 한계 |
|---|---|---|
| [vincent/damask](https://github.com/vincent/damask) | content-hash dedup, perceptual-hash visual similarity, custom metadata, append-only activity log, non-destructive version rollback, source별 rule engine | semantic video moment 검색은 없으므로 현재 SQLite 원장과 review artifact의 자산 관리 원칙만 참고한다. |
| [elonen/clapshot](https://github.com/elonen/clapshot) | frame-by-frame 이동, loop I/O, timecoded comment, EDL import, 동기 검수, plugin workflow. 서버/클라이언트 GPLv2, plugin library MIT | 후보 검색보다 사용자 cut review UX에 적합하다. 전체 통합은 현재 정적 review보다 운영 부담이 크다. |
| [Techiebutler/freeframe](https://github.com/Techiebutler/freeframe) | frame-accurate comment, version side-by-side/wipe, reviewer별 approval, Resolve/Premiere/FCP XML·CSV export. MIT | 승인 marker를 우리 SHA 계약으로 연결하는 adapter가 필요하다. 검색 병목은 해결하지 않는다. |
| [Eyevinn/open-videocore](https://github.com/Eyevinn/open-videocore) | URL ingest, 기술 metadata, 임의 timecode thumbnail, child clip 생성, metadata filter, collections, job lifecycle | OSC cloud infrastructure 의존성이 크고 semantic search는 없다. 로컬 120개 원본 규모에는 과도하다. |
| [contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs) | JPEG·PNG·MP4 등에 C2PA manifest를 읽고 쓰며 source/수정 계보를 검증 | C2PA가 저작권 허가를 증명하지는 않는다. provenance 보조 신호로만 사용한다. |
| [tamnd/archive-cli](https://github.com/tamnd/archive-cli) | Internet Archive cursor 검색, metadata/file filter, 병렬 다운로드, MD5 검증 | item metadata가 시각 행동을 말하지 않으면 scene indexing은 여전히 별도 필요하다. Archive provider adapter 구현에는 유용하다. |
| [backblaze-b2-samples/video-semantic-search](https://github.com/backblaze-b2-samples/video-semantic-search) | source·transcript·embedding index를 object storage에 두고 timestamp 검색과 재색인을 제공하는 계층형 예제. MIT | 저장소 자체가 live provider E2E 미검증이라고 밝히므로 운영 채택 후보가 아니라 architecture 참고 자료다. |
| [HouJue919/media-agent](https://github.com/HouJue919/media-agent) | video keyframe 품질, blur/exposure/stability, HTML gallery, user decision CSV, 안전한 copy/move log. MIT | 행동 의미 검색은 약하다. 다운로드 직후 저품질·흔들림 후보를 싸게 제거하는 prefilter로만 적합하다. |

## 1차 조사에서 보완된 판단

1. **keyframe CLIP만으로는 부족하다.** 사진·건물·사물 검색에는 유효하지만 행동 brief는 SentrySearch식 video embedding 또는 Lighthouse식 moment retrieval과 비교해야 한다.
2. **자동 점수는 결정을 변경하면 안 된다.** video-review-os처럼 perception과 score를 additive record로 두고 `review/reject/approve`는 별도 사람 결정으로 유지해야 한다.
3. **검색 corpus와 제작 asset을 분리해야 한다.** 검색용 저해상도 chunk/keyframe/embedding은 production pixel이 아니다. 승인된 원본의 exact window만 현 materialization route로 들어간다.
4. **사진 공급처는 Openverse로 넓힐 수 있다.** 다만 Openverse의 라이선스 metadata도 원 item에서 재검증하고, 웹 preview/crop을 production asset으로 쓰지 않는다.
5. **검수 UI 교체는 후순위다.** 현재 가장 큰 문제는 후보가 정확하지 않은 것이므로 Clapshot·FreeFrame 도입보다 scene index와 active gap search가 먼저다.

## 구체적인 기술 선택

### 권장 최소 스택

- 장면 경계: 기존 1차 조사의 PySceneDetect
- 구조·계보: video-review-os의 `source / perception / clips / decision` 분리
- 1차 검색: OpenCLIP/Jina CLIP keyframe+caption index
- 행동 검색 실험: SentrySearch local Qwen3-VL과 Lighthouse moment retrieval 비교
- vector store: 현재 규모에서는 SQLite metadata + FAISS 또는 ChromaDB 하나면 충분하다. PostgreSQL/대형 MAM은 불필요하다.
- 공개 사진: Openverse provider adapter
- archive 영상: archive-cli가 사용하는 cursor·file filter·hash 검증 패턴
- 사람 검수: 현재 정적 review를 scene strip·loop·필드별 gap 중심으로 먼저 개선

### 채택하지 않을 것

- 자동 상위 1개 후보를 cut에 바로 배치하는 기능
- 검색용 preview·YouTube frame·웹 capture를 production pixel로 승격하는 기능
- C2PA 유무나 provider metadata만으로 rights approval을 주는 기능
- scene caption이 행동을 말했다는 이유만으로 exact evidence를 통과시키는 기능
- 전체 MAM/cloud stack 도입

## 다음 구현 실험

20개 영상 원본을 고정 benchmark로 두고 SH012, SH013, SH017, SH020, SH024의 행동 query를 실행한다. 비교군은 `title metadata`, `keyframe CLIP`, `structured caption+CLIP`, `video embedding`, `moment retrieval` 다섯 가지다. 각 방식에서 top-10의 대상·행동·장소·화각 충족률, 정확 onset/end 오차, 중복 cluster 수, 처리 시간과 비용을 기록한다. 이 결과가 나오기 전에는 특정 model이나 vector DB를 production dependency로 확정하지 않는다.
