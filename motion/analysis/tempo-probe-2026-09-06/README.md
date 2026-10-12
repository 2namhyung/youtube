# T1 보행 tempo probe — Tokyo person component

작성일: 2026-09-06

이 폴더는 기존 13초 합성본을 retime하지 않고, 기존 Tokyo 의상 보행 take만으로
  whole-body 재생속도 후보를 비교한 진단 산출물이다. 새 matte를 만들거나 카드와
  인물을 재합성하지 않는다. 레퍼런스의 실제 배속 계수를
측정하거나 확정하는 자료가 아니다.

## 실험 고정 조건

- 입력: `production/ticket-travel/performance-v2/tokyo-parasol-10s.mp4`
- source 시작: `3.500s`로 세 후보 동일. v2의 Tokyo branch가 약 3.0초
  source부터 읽히므로, 실제 v2 사용 구간 안의 안정적인 보행 구간을 선택했다.
- 출력: `2.000s`, `720×1280`, `24fps`, 48 frames, silent visual-only
- 후보: `1.00×`, `1.10×`, `1.20×`
- source 소비: 각각 `2.000s`, `2.200s`, `2.400s`
- 고정/비교 제외: 카드·카드 매트 합성, 합성 카메라, 배경 설계, 13초 타임라인,
  오디오. 이 산출물은 **카드와 매트를 합성하지 않은 기존 Tokyo person-only
  source의 시각 비교**이며, 카드·카메라·오디오까지 고정한 전체 컷의 결과로
  주장하지 않는다.
- 범위 제한: whole-body take를 retime하므로 얼굴·상체·팔·우산·의상 후속동작도
  함께 빨라진다. 재생속도는 보폭 진폭을 키우지 않는다.

## 결과물

- [1.00× original](tokyo-person-1.00x-2s.mp4)
- [1.10× retime](tokyo-person-1.10x-2s.mp4)
- [1.20× retime](tokyo-person-1.20x-2s.mp4)
- [가로 3안 비교](tokyo-person-tempo-comparison-side-by-side.mp4)
- [대표 프레임 contact sheet](tokyo-person-tempo-contact-sheet.jpg)
- [메타데이터·SHA-256](metadata.json)
- [재현 스크립트](render_tempo_probe.py)

contact sheet는 각 후보의 출력 시각 `0.000 / 0.500 / 1.000 / 1.500 /
1.958s`를 같은 행에 놓은 정지 비교다. 프레임 시트만으로 보행의 temporal
자연스러움이나 레퍼런스와의 합격을 확정하지 않는다. 최종 판정은 native
비교 영상을 원속도와 휴대폰 크기로 재생해 사용자가 남긴다.

## 관찰 기록(사전 판정 아님)

세 후보는 같은 첫 자세에서 시작하며 factor가 커질수록 같은 2초 안에 더 앞선
보행 자세에 도달한다. 1.10×와 1.20×가 레퍼런스의 경쾌한 인상에 가까운지는
상체·우산·표정이 급해지는지와 함께 native 영상으로 판단해야 한다. 이 probe의
결과만으로 T1 PASS, Flow 보행 편집 필요 여부, 또는 13초 전체 factor를 결정하지
않는다.

다음 단계는 사용자 비교 판정이다. T1이 부족하거나 whole-body retime 때문에
상체가 급해지면 T2의 Flow 보행 편집 prompt로 이동하고, 하나의 factor가 선택되면
T3에서 모든 도시 의상 source에 같은 시간 매핑과 보행 위상을 적용한다.

## 검증

`render_tempo_probe.py` 실행 시 source 메타데이터를 확인하고 결과를 생성했다.
생성 후 모든 MP4에 대해 ffmpeg 전체 decode와 ffprobe를 다시 수행했다.

- 세 native 결과: `720×1280`, `24/1fps`, `48 frames`, `2.000000s`
- 가로 비교: `2160×1280`, `24/1fps`, `48 frames`, `2.000000s`
- source SHA-256은 실행 전후 `2BE9D87556ADF3049D0489340AD441089BEF1CB4BDD9BD799E9A0CEF4AF5B9B0`로 동일
