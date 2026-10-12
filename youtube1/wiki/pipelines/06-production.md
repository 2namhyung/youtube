# 06 OpenCut 영상 제작

## 현재 뉴스룸 제작 계약 (2026-08-15)

활성 compile은 `evidence-motion-documentary-v12-two-stage-color-storyboard`와 `video-design-v7-two-stage-color-storyboard`를 사용한다. 컷 수는 고정값이 아니라 sealed storyline/locked narration 의미 분할에서 나오며 정상 컷은 2–3초다. Grok source의 independent semantic-QA 선택 창 길이는 authored duration ±0.05초여야 한다. generic orchestration은 현재 `assembly-ready-v5-color-storyboard`의 `deferred`, `continuationAuthorized=false`에서 멈추며 별도 provider gate 없이는 provider/render/upload/publication을 실행하지 않는다. 아래 30fps·과거 제주 renderer 기록은 project history이고 현재 24fps canonical contract를 대체하지 않는다. Source: [canonical contract](newsroom-video-production.md), [success route](../../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md).

- 상태: 부분 운영 (85%)
- 입력: 03 대본·음성, 04 장면 자산, 05 BGM 계약
- 처리: 프레임 할당 → 자막 ASS → 오디오 mix → FFmpeg 렌더 → OpenCut handoff
- 출력: MP4, 썸네일, registry metadata, editable handoff
- 게이트: 1080×1920/30fps, 상대경로 자산, 체크섬, 분리 편집 계약

[produce-short.mjs](../../06-production/opencut-automation/scripts/produce-short.mjs)는 새 렌더에서 대본 JSON, 내레이션, 26개 장면 클립, 자막 cue와 BGM을 `opencut-editable-tracks-v1`의 독립 트랙으로 기록합니다. 프로젝트의 `releaseGate`도 metadata와 handoff에 보존해 preview가 `publishable=false`, `uploadBlocked=true`임을 OpenCut 쪽에서 판별할 수 있습니다.

2026-07-27 실행은 [음성 실패](../../06-production/opencut-automation/out/.private/school-case-ms38nout-17636-4oh18b-failed/failure.json) 때문에 FFmpeg 렌더 전에 종료됐습니다. 따라서 기존 등록 버전은 건드리지 않았고, 새 preview MP4·handoff·registry version은 없습니다. 합성 실패 run을 삭제하기 전에 `.private/*-failed`로 복사하는 보존 로직은 정상 작동했습니다.

다음: [07 품질 검사](07-quality-assurance.md)
