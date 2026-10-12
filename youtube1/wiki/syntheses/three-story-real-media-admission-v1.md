# 3편 실사진 배정·시간 커버리지 v1

2026-08-15에 봉인된 경찰관 부친·제주 교실 침입·간호조무사 커피 살충제 3편의 컷 계획은 바꾸지 않고, 실사진 요구 분류와 컷→사진 결합만 successor로 다시 봉인했다.

## 결과

- 경찰관 부친: 총 55.016초 중 46.329초, `84.2100%`가 admitted real media다. `cut-017`~`cut-019`는 생성 컷으로 남는다.
- 제주 교실 침입: 총 50.773초 중 44.800초, `88.2359%`가 admitted real media다. `cut-016`~`cut-017`은 생성 컷으로 남는다.
- 간호조무사 커피 살충제: 총 48.794초 중 43.054초, `88.2363%`가 admitted real media다. `cut-016`~`cut-017`은 생성 컷으로 남는다.
- 전체는 154.583초 중 134.183초, `86.8032%`다. 검증기는 19개 자산, 46개 컷 결합과 세 편 각각의 80% 이상을 독립 재계산했다.

Source: [duration coverage](../../06-production/opencut-automation/out/studies/newsroom-real-media-admission-v1/run-20260815T052257Z-bf2f6a/duration-coverage.json), [independent verifier](../../06-production/opencut-automation/out/studies/newsroom-real-media-admission-v1/run-20260815T052257Z-bf2f6a/verifier.json), captured 2026-08-15.

## 조건부 자산과 제외 자산

- 손이 보이는 휴대전화 `commons-03`은 사건 당사자가 아닌 자료사진이라는 disclosure와 element 사용 조건으로 간호조무사 컷에만 결합했다.
- 상표가 보이는 농약 용기 `commons-16`은 로컬 crop/mask/blur와 `사건 제품과 무관` disclosure를 조건으로 간호조무사 컷에만 결합했다.
- 역사적 해외 병동 `commons-19`은 현재 한국 사건의 시간·지역을 오인시킬 수 있어 coverage에서 제외했다.
- 모든 실사진은 `providerInputStatus=denied`이며 Grok·ImageGen 입력이 아니다. YouTube 공개본 프레임도 제작 자산이 아니다.

Source: [admission](../../06-production/opencut-automation/out/studies/newsroom-real-media-admission-v1/run-20260815T052257Z-bf2f6a/admission.json), [canonical contract](../pipelines/newsroom-video-production.md), captured 2026-08-15.

## 남은 한계

- 80%는 고유 사진 수가 아니라 authored-duration 기준이다. 19개 자산이 46개 컷에 재사용되므로 시각적 반복성은 후속 편집 설계에서 따로 검토해야 한다.
- generic/institutional 자료사진은 사건 현장이나 당사자 증거가 아니다. 컷별 disclosure와 출처 표시는 최종 편집에서도 유지해야 한다.
- 이번 gate는 사진 배정과 권리·시간 커버리지만 승인한다. local FFmpeg 편집, 생성 컷 보드, Grok, 렌더, 업로드, 공개, Stage 07은 실행·승인하지 않았다.

Source: [manifest](../../06-production/opencut-automation/out/studies/newsroom-real-media-admission-v1/run-20260815T052257Z-bf2f6a/manifest.json), [success route](../../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md), captured 2026-08-15.

## Status (superseded)

This v1 record is immutable historical evidence only. Its duration-positive result is a false-positive for the v2 diversity contract because repeated/conditional sources were counted without the per-story 0.90 unique-primary gate. It is not an active production admission.

Successor status: [newsroom real-media acquisition v2](newsroom-real-media-acquisition-v2-status.md).
