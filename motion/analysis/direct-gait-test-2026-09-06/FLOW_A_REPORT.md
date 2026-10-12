# Flow A direct-gait result

조사일: 2026-09-06  
범위: Flow A raw output과 같은 canonical Seoul source의 1.00×/1.80× 후보를 source `2.5s`에서 동일하게 2초 비교. Flow A는 원속도 그대로 보존했고, comparison panel만 resize했다. 카드·head·matte·production 파일은 변경하지 않았다.

## 판정

**보류(`PROVISIONAL / HOLD`)**. Contact sheet의 0.00/0.40/0.80/1.20/1.60/1.96초 샘플에서 Flow A는 원본 1.00×와 대체로 같은 연속 보행과 비슷한 발 위치 진행을 보인다. 일부 hem/발 가림과 생성 take 차이는 있으나, 이 2초 창에서 Flow A가 원본 1.00×보다 더 많은 양발 교대나 1.80×에 가까운 cadence를 만든다고 시각적으로 확정하기 어렵다. 원본 1.80×는 같은 창의 후반 자세 진행이 더 빠르게 보이지만, Flow A가 그 수준에 도달했다는 증거는 부족하다.

따라서 Flow A를 “direct faster gait 성공” 또는 `1.8× footfall` 결과로 승격하지 않는다. 한 번의 raw 결과로 Flow의 전체 능력도 단정하지 않는다. 다음 판단은 사용자에게 세 열 비교를 보여준 뒤, 필요하면 별도 후보를 선택하는 것으로 남긴다.

## 프레임·소스 근거

| 자료 | 선택 구간 | 관찰 |
|---|---:|---|
| Original 1.00× | source 2.5–4.5s, F0/F10/F19/F29/F38/F47 | 연속 보행. 발은 옷자락에 부분 가림되며, 좌우 접지의 완전한 주기는 확정 불가 |
| Flow A raw | source 2.5–4.5s, F0/F10/F19/F29/F38/F47 | 원본과 broad progression은 비슷하고 정지/셔플은 명확히 보이지 않지만, 1.80× 수준의 추가 교대는 입증되지 않음 |
| Original 1.80× | source 2.5–6.1s, output F0/F10/F19/F29/F38/F47 | 같은 output 시간에서 원본 1.00×보다 pose/발 진행이 앞섬; 이는 비교 기준이지 레퍼런스 계수 측정값이 아님 |

정확한 입력·출력 metadata와 frame 목록은 [flow-a-metadata.json](flow-a-metadata.json), 세 열 비교는 [comparison MP4](direct-gait-original1.00x-flowA-original1.80x-2s.mp4), head/feet crop은 [contact sheet](direct-gait-flowA-head-feet-contact.jpg)다. 원본 Flow 다운로드 보존본은 [flow-direct-gait-A-10s.mp4](flow-direct-gait-A-10s.mp4)이다. 다운로드 source는 720×1280, 24fps, 240 video frames, 10.000s video duration(컨테이너 format 10.005333s)이다.

## 제한

- 양발 접지 주기와 foot trajectory는 `NOT_MEASURABLE`: 긴 한복 hem, 부분 가림, independent generated take 때문에 좌/우 발을 안정적으로 추적하지 않았다.
- 눈동자 방향은 `UNKNOWN`; Flow A가 기존 head gesture를 유지했는지는 보이지만 eye-vector를 측정하지 않았다.
- Flow A prompt는 upper-body/head choreography를 추가하지 않도록 고정했으므로, 이 시험은 cadence 변수만의 관찰을 목표로 한다. 실제 cadence 변화와 상체 pacing의 분리는 추가 정량 검증 없이는 확정할 수 없다.
