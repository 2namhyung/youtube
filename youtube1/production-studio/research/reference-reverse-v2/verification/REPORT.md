# VQazcEuV9Xw reverse study verification

검증일: 2026-09-23

이 문서는 `reference-reverse-v2`의 분석·연구 산출물에 대한 독립 검증 기록이다. 원본 재사용 권리, 제작자 소프트웨어, 실제 사건 증거, production/provider/render/upload/publication 권위를 승인하지 않는다.

## 측정 산출물

- `measurements/manifest.json`의 파일 목록 79개를 현재 바이트와 SHA-256으로 다시 확인했다.
- 누락 파일 0개, 바이트 또는 hash drift 0개.
- 원본 source SHA-256은 manifest와 일치한다.
- source probe는 `360×640`, `30000/1001` fps, `1464` video frames를 기록한다.
- `shot-analysis.json`은 22개 row다.
- 모든 row는 `[startFrame,endFrame)`로 `0..1464`를 연속적으로 덮는다.
- `startSeconds`와 `endSeconds`는 각각 `frame × 1001 / 30000`과 일치한다.
- 모든 row는 한국어 `label`, 의미 요약임을 밝힌 `narrationSummary`, `observed` 필드를 갖는다. `layers`, `techniques`, `recipe`는 관찰 사실과 분리된 추론·재현 제안으로 기록되어 있다.
- 전체 링크 검사에서 깨진 상대 링크는 0개다.

검증한 주요 semantic row는 실내 로봇과 기대는 농부(004), 병 close-up과 하단 퇴장·갈색 밭(018), 머리를 감싸는 농부(019), 등진 로봇과 화난 농부의 대면(020), 정면 로봇 응답·검지(021)다.

## 브라우저·뷰어 확인

부모 작업에서 `http://127.0.0.1:8793/reference-reverse-v2/viewer/`를 브라우저로 확인했다.

- 22개 분석 구간이 뷰어에 로드됐다.
- source AV1 media가 ready 상태이고 duration은 `48.854s`이며 브라우저 오류는 관찰되지 않았다.
- `#stepForward`로 `19.185833 → 19.219199` 이동 후 `paused=true`를 확인했다.
- shot 10을 반복 재생한 뒤 `19.950443s`가 해당 구간 안에 있음을 확인했다.
- “드론” 검색 결과가 2개 구간으로 표시됐다.
- comparison 패널 toggle 뒤 comparison media가 ready, duration `8.775433s`, `hidden=false`였다.
- row 21 선택 시 `43.526816s`에서 frame 1304의 정면 neutral pose를 확인했고, 한 프레임 전진 시 `43.560183s` frame 1305에서 paused 상태를 확인했다. 한 프레임 후진 시 다시 `43.526816s` frame 1304에서 paused 상태를 확인했다.
- `.5×` 재생 rate의 `aria-pressed=true`, loop, 검색, comparison 동작을 확인했다.

이 항목은 부모의 브라우저 관찰 기록이며, 분석 JSON의 semantic truth나 원본 제작 방식의 증거로 승격하지 않는다.

## 필수 인계 테스트

`06-production/opencut-automation`에서 다음 두 명령을 실행했고 모두 exit code `0`이었다.

- `npm.cmd run test:editorial-cartoon-template`
- `npm.cmd run test:generic-pipeline`

Node의 `draft-history.ts` module-type warning은 있었지만 테스트 실패는 없었다. 이 테스트 결과는 계약·회귀 검증이며 제작/provider/render/publication 승인이 아니다.

## Reconstruction 최종 확인과 한계

최종 geometry 수정 후 재렌더가 없다는 specialist 확인을 전제로 output을 독립 확인했다. [reconstruction manifest](../reconstruction/output/manifest.json)의 source/config/code/contact/output hash와 bytes가 현재 파일과 일치한다. `comparison.mp4` SHA-256은 `f54fe194a1c5821435f42ee94c8fea1d04dc13c5aec910f79f4c10f96bf3a60c`, `reconstruction-only.mp4` SHA-256은 `6dc1db554e243fe4d74083c7e17ee026f1b83b85c6afb7a852baf5aa2921f51c`다.

두 MP4는 ffprobe 기준 `30000/1001` fps, `263` frames, `8.775433s`이며 audio stream이 없다. decoded comparison contact에서 frame 103의 장면 전환을 확인했다. reconstruction contact의 실제 시각 검토에서 초기 농부 비가시 상태, 마지막의 전신 농부와 부분적으로 잘린 드론, 손과 드론 하부 bar의 접점, 로봇 입의 head 내부 위치, viewer-left 검지, 화면 안의 국자와 glitch overlay를 확인했다. 이는 자체 SVG 구조 연구의 geometry 확인이며 원본 스타일·정확한 easing·픽셀 유사성의 통과 판정이 아니다.

reconstruction 상태는 geometry 검증 완료로 `pending`을 해소할 수 있지만, `productionEligible=false`, `promotionEligible=false`, `similarityPassClaim=false`는 유지한다. 원본 reference의 재사용 권리는 확인되지 않았고 comparison은 왼쪽 원본 excerpt와 오른쪽 자체 SVG를 함께 보이는 로컬 분석용 비교물이다. reconstruction-only에는 원본 pixel이 없다.

최종 렌더 후 새 브라우저 탭에서 최종 comparison을 재확인했다. `readyState=4`, `duration=8.775433`, `error=null`, `hidden=false`였고, Space 재생 시 `paused=false`, `currentTime=0.010739→7.177361`로 실제 재생됐다. 화면에는 왼쪽 원본 excerpt와 오른쪽 자체 SVG 로봇·검지가 함께 보였다. 이 기록은 최종 버전에 대한 확인이며 이전 버전 검증 결과를 의미하지 않는다.

분석은 원본의 실제 프레임과 관찰된 visual beat를 바탕으로 하지만 모든 후보가 hard cut이라는 뜻은 아니다. 정확한 easing curve, 회전각, 픽셀 이동량, 중간 프레임 보간, 원본 layer/file/software, CC·재사용 권리는 확인하지 않았다. 드론·농부 이동 측정은 fallback block matching 기반의 patch displacement이며 semantic optical-flow 또는 RANSAC 결과가 아니다. `narrationSummary`는 화면 자막의 의미 요약이고 원문 대본·음성 전사가 아니다.

comparison은 왼쪽에 원본 excerpt, 오른쪽에 자체 SVG 연구 렌더를 둔 분석용 비교물이다. reconstruction-only에는 원본 pixel이 들어 있지 않다. 다만 원본 reference의 재사용 권리는 확인되지 않았으므로 두 산출물 모두 로컬 분석용으로만 취급하며 public reuse나 production derivative로 승격하지 않는다. 이 문서와 v2 분석은 canonical ImageGen/Flow/I2V, owner voice, factual/legal review, provider, render, upload, publication, Stage 07 gate를 열지 않는다.
