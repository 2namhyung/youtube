# Flow H1 head-stability inspection

검사일: 2026-09-06. 판정은 **PROVISIONAL / HOLD**다. H1의 목표(고개를 세우고 턱을 수평에 가깝게 유지)가 일부 보이지만, 핵심 source 2.5–3.5초 구간에서 원본 대비 개선이 일관되게 입증되지는 않았다.

## 핵심 구간 관찰

최종 기준은 720p direct-download H1이다. 기존 9.56MB scene export도 삭제하지 않고 별도 보존했으며, 두 H1의 source 2.5–4.5초 F0/F24/F47을 side-by-side로 확인한 결과 head lift와 보행 진행은 동일하게 보였다. 원본 H1 raw와 기존 원본 1.00×를 같은 source window(2.5–4.5초)에서, H1 1.80×와 기존 원본 1.80×를 같은 output window에서 비교했다. Contact sheet의 시점은 nominal t=0.00, 0.40, 0.80, 1.20, 1.60, 1.96초(F0/F10/F19/F29/F38/F47)다.

- source 2.5–약3.0초(F0–F12): H1도 턱이 내려간 모습이 남아 있어 deliberate look-down 제거가 확인되지 않는다.
- source 약3.3–3.5초(F19–F24): H1은 보다 정면/수평에 가까운 방향으로 올라오지만, 기존 원본도 같은 구간에 유사한 전환이 있어 H1 단독 개선으로 확정할 수 없다.
- 10초 overview: H1은 이후에도 간헐적 아래 시선/고개 하강이 보인다. 완전 고정이나 지속적인 렌즈 응시는 아니다.

## 보행·부작용

- H1 raw의 발 포즈는 동시간 원본 1.00×와 대체로 대응한다. 다만 밑단 가림, 생성 take 차이, 일부 발끝 위치 차이 때문에 alternating contact timing의 정확한 보존은 판정하지 않는다.
- H1 1.80×와 기존 원본 1.80×의 발 진행은 큰 틀에서 같은 source mapping을 사용하지만, 프레임별 발·밑단 모양은 달라진다. 이는 정량 phase 증거가 아니다.
- 얼굴/정체성은 대체로 유지되지만 표정과 얼굴 방향이 미세하게 달라졌다. H1의 녹색 치마는 기존 원본보다 더 밝고 청록 기운이 강해 색 부작용으로 기록한다.
- 정확한 eye gaze는 측정하지 않아 **UNKNOWN**이다.

## 입력·산출물

- [raw H1 direct-download copy](flow-head-stable-H1-direct-download-10s.mp4): 720×1280, 24fps, 240 video frames, 10초 take 보존
- [earlier scene-export copy (preserved)](flow-head-stable-H1-10s.mp4): 별도 원본 보존본
- [H1 raw 2초 창](flow-head-stable-H1-source2.5-2s.mp4): source 2.5–4.5초, 정상 재생, 48 frames
- [H1 1.80× 창](flow-head-stable-H1-1.80x-2s.mp4): source 2.5–6.1초를 2초로 retime, 48 frames
- [original 1.80× vs H1 1.80×](flow-head-stable-H1-original1.80x-vs-H1-1.80x-2s.mp4)
- [direct-download vs scene-export parity](flow-head-stable-H1-direct-vs-scene-export-2.5-2s.mp4)
- [head/feet contact sheet](flow-head-stable-H1-head-feet-contact.jpg)
- [full-ten-second head overview](flow-head-stable-H1-head-overview.jpg)
- probe, frame count, duration, source windows는 [flow-h1-metadata.json](flow-h1-metadata.json)에 기록했다.

모든 비교 MP4는 ffmpeg decode 검사 완료. 비교 패널 resize 외 playback/card/head/matte/production/Flow/wiki 파일은 수정하지 않았다.
