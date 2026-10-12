# Ticket travel animatic

이 폴더는 레퍼런스 릴의 항공권 패션 전환을 재현하는 무음 애니매틱입니다. 카드의 세로형 보딩패스 레이아웃·그림자·타이포그래피·교체 모션은 결정론적으로 재생성하고, `ticket-travel-flow-final.mp4`는 `assets/flow-clips`의 실제 움직이는 픽셀을 인물 레이어로 사용합니다.

## 실행

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\render.ps1
```

출력은 `output/ticket-travel-animatic.mp4`, `output/contact-sheet.jpg`, `output/reference-comparison-contact.jpg`입니다. 렌더는 1080×1920, 30fps, 400프레임(13.333초), 무음 H.264입니다.

## Flow 인물 모션 최종본

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\render_flow_final.ps1
```

출력은 `output/ticket-travel-flow-final.mp4`와 `output/flow-final-contact.jpg`입니다. `render_flow_final.py`는 Flow 360×640/24fps 프레임을 디코드하고, 근접 백색 스튜디오 배경에 연결된 중앙 인물만 골라 feathered alpha matte를 만든 뒤 기존 티켓 카드 안에 합성합니다. 인트로의 Flow 자체 항공권은 소스 인물 구간까지만 사용하여 최종 카드 그래픽과 중복되지 않게 했습니다.

## 프레임 타임라인

| 구간 | 프레임 | 내용 |
|---|---:|---|
| 0–2.267s | 0–67 | 인트로 클로즈 크롭, 느린 줌/팬 |
| 2.267–4.467s | 68–133 | 인트로 풀바디, 약한 패럴랙스 |
| 4.467–5.000s | 134–149 | 세로형 카드가 아래에서 올라오며 약간 회전, 인트로를 가림 |
| 5.000–6.667s | 150–199 | 핑크 드레스 |
| 6.667–8.900s | 200–266 | 블루 니트 |
| 8.900–11.133s | 267–333 | 뉴트럴 유틸리티 |
| 11.133–13.333s | 334–399 | 시티 클래식 |

카드는 5초 이후 같은 위치에 고정됩니다. 레퍼런스와 같이 인물은 카드 전체 높이의 약 70%로 중앙 배치하고, 구간 경계에서 8프레임 동안 이전 카드가 뒤로 노출되며 새 카드가 미세 회전해 교체됩니다. 마지막 구간은 66프레임으로 맞춰 전체 길이를 정확히 400프레임으로 유지했습니다.

## 카드 템플릿

`assets/ticket-card.svg`는 이전 실험용 카드이고, 현재 출력은 `render_ticket.py`의 900×1810 세로형 템플릿을 사용합니다. 템플릿에는 흰색 재질, 우측 컬러 밴드, 세로 `TAOAGOU AIRLINES`, 큰 회색 워터마크, 점선 천공, 승객/항공편 필드, 바코드, 하단 노치, 우하단 그림자를 포함했습니다.

## Flow 합성의 한계

Flow 버전은 요청에 따라 각 의상 클립의 실제 동작을 사용합니다. 다만 현재 내려받은 Flow 클립의 얼굴/의상은 키프레임 인물과 완전히 동일하지 않으며, 360p 소스라 가장자리와 옅은 의상에 약한 matte 흔적이 남을 수 있습니다. 카드·타이밍·출력 규격은 기존 결정본과 동일하게 유지됩니다.
