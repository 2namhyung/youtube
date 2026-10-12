# Flow B direct-gait inspection

검사일: 2026-09-06. 판정은 **PROVISIONAL / HOLD**다. Flow B 원본을 정상 재생으로 source 2.5–4.5초(48 frames)만 잘라, 변경하지 않은 로컬 1.00× 및 1.80× 기준과 같은 2초 창에서 비교했다.

## 관찰 결과

6개 시점(t=0.00, 0.42, 0.79, 1.21, 1.58, 1.96초; nominal frame F0/F10/F19/F29/F38/F47)을 head/feet contact sheet로 확인했다.

| 비교본 | 시각적 보행 진행 |
| --- | --- |
| 원본 1.00× | Flow B와 유사한 자세·발 위치 진행. 의상 밑단이 발을 일부 가려 접지 확인은 제한됨. |
| Flow B raw | 원본 1.00×와 거의 같은 진행으로 보이며, 추가 발 교대·보폭 진행은 명확하지 않음. 1.8× 수준의 가속은 입증되지 않음. |
| 원본 1.80× | 같은 출력 시간에서 자세·발 위치가 더 앞서 있어 기준선과 시각적으로 구별됨. |

따라서 B는 원본 1.00× 대비 **걸음 변화 증가를 확인하지 못해 보류**한다. 이는 이번 take의 관찰 결과이며 Flow 전체의 생성 능력 실패를 뜻하지 않는다. Flow B에서 녹색 의상 톤이 원본과 달라진 점은 보이지만 속도 증거로 사용하지 않았다.

## 입력·산출물 근거

- Flow B raw: 720×1280, 24/1 fps, 240 video frames, video duration 10.000000초, container format duration 10.005333초. [raw copy](flow-direct-gait-B-10s.mp4)
- 검사 창: source 2.5–4.5초, 정상 재생, 48 frames, 2.000000초. [extracted window](flow-direct-gait-B-source2.5-2s.mp4)
- [three-column comparison](direct-gait-original1.00x-flowB-original1.80x-2s.mp4) — 1440×852 비교 패널, resize only, 24/1 fps, 48 frames, 2초.
- [head/feet contact sheet](direct-gait-flowB-head-feet-contact.jpg)
- 전체 probe·frame count·duration은 [flow-b-metadata.json](flow-b-metadata.json)에 기록했다.

## 한계

- 왼발/오른발 접지 주기와 궤적은 밑단 가림 및 take 차이로 정량 측정할 수 없어 **NOT_MEASURABLE**이다.
- 정확한 eye gaze는 측정하지 않아 **UNKNOWN**이다.
- 비교 MP4에서 playback speed를 바꾸지 않았다. 원본·생성 take 간 프레임 대응만 시각적으로 검토했으며, source/production/wiki/Flow 파일은 수정하지 않았다.
