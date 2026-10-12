# Flow / Omni Flash 1.1 prompts

아래 프롬프트는 이 애니매틱의 해당 구간을 Gemini Omni Flash 1.1에서 컷별로 생성하기 위한 초안입니다. 먼저 360p draft로 일관성·동작·가림을 확인한 다음 성공한 컷만 고해상도로 재생성합니다. 오디오와 대사는 필요 없으므로 무음으로 생성하거나 후반에서 제거합니다.

Flow/Omni에서 생성 길이는 4초로 요청합니다. 각 프롬프트의 동작은 지정된 원본 컷 길이/프레임 안에 완료하고, 남은 생성 구간은 깨끗한 정지 상태로 유지합니다. 생성 후 `render.ps1`에서 해당 프레임 범위만 트림해 교체합니다.

## 공통 입력 역할

- `Image 1 — first frame`: 해당 컷의 시작 상태. 카메라 위치, 인물 크기, 의상, 손 위치의 기준입니다.
- `Image 2 — last frame`: 해당 컷의 종료 상태. 카드가 등장하는 컷에서는 카드의 최종 위치와 회전 상태의 기준입니다.
- `Image 3 — character reference`: 동일한 가상 여행자 캐릭터의 얼굴·헤어·체형·색감 참조입니다.
- `Image 4 — ticket card reference`: 결정론적 카드 SVG/PNG의 디자인 참조. 카드의 텍스트와 비율은 변경하지 않습니다.

모든 컷에 다음 제약을 붙입니다: `vertical 9:16, locked camera, clean warm-white studio background, no logos, no real airline branding, no extra people, no morphing, no scene cut inside the shot, natural hands, preserve the same fictional traveler.`

## Cut 01 — intro close crop (0–2.267s)

```text
Use Image 1 as the first frame and Image 2 as the last frame. Use Image 3 only for identity consistency.
Create a single continuous vertical 9:16 shot, locked camera, close crop from chest to knees.
The fictional traveler walks in place with a very small weight shift while looking down at a small red travel notebook.
Keep the face, hands, notebook, backpack straps, lighting and warm-white background stable.
The camera has only a barely perceptible vertical parallax, not a zoom or handheld shake.
No outfit change, no card, no text, no transition, no extra fingers, no speaking, no audio.
Generate a 4-second clip. Complete the described motion within the first 68 frames, then hold the final clean state without introducing new motion. Trim to frames 0–67 (2.267 seconds) when replacing the animatic.
```

## Cut 02 — intro full body (2.267–4.400s)

```text
Use Image 1 as the first frame and Image 2 as the last frame. Use Image 3 for the same fictional traveler.
Create one continuous full-body vertical 9:16 studio shot with a locked camera.
The traveler makes two subtle walking-in-place weight shifts, keeps the notebook open, and glances down once.
Preserve the full-body framing, backpack, shoes, shadows and warm-white background. Motion must remain restrained and deterministic.
Do not introduce a ticket card yet. No outfit change, no camera pan, no scene cut, no morphing, no audio.
Generate a 4-second clip. Complete the described motion within the first 64 frames, then hold the final clean state. Trim to frames 68–131 (2.133 seconds) when replacing the animatic.
```

## Cut 03 — card entrance (4.400–4.833s)

```text
Use Image 1 as the first frame. Use Image 2 as the last frame showing the finished TRAVEL PASS card. Use Image 3 for the traveler and Image 4 for the card design.
Create a single 9:16 vertical shot. The traveler remains behind the foreground card and makes only a tiny settling motion.
From the bottom edge, one cream paper travel card slides upward over 13 frames, with a subtle rotation from about -5 degrees to 0 degrees and a soft fixed shadow.
The card progressively occludes the traveler. Keep the card geometry, window, border, text, shadow and final position stable. Do not add a hand holding it.
No morphing, no second card, no logo, no real airline name, no scene cut inside the entrance.
Generate a 4-second clip. Complete the card entrance within the first 13 frames, then hold the final card position cleanly. Trim to frames 132–144 (0.433 seconds) when replacing the animatic.
```

## Cut 04 — pink dress card hold (4.833–6.667s)

```text
Use Image 1 as the first frame and Image 2 as the last frame. Use Image 3 as the same-character reference and Image 4 as the exact foreground card reference.
Create a locked vertical 9:16 shot of the finished cream TRAVEL PASS card.
The card and its soft shadow are completely fixed. Inside the rectangular portrait window, the traveler wears a soft pink sleeveless dress, bucket hat, pale bag and sneakers, and performs a tiny natural breathing motion while checking a phone.
Keep the portrait crop and card window fixed. Do not animate the card, its typography, border, shadow or barcode.
No scene cut, no card rotation, no extra fingers, no real branding, no audio.
Generate a 4-second clip. Complete the subtle breathing/phone-check motion within the first 55 frames, then hold the clean final state. Trim to frames 145–199 (1.833 seconds) when replacing the animatic.
```

## Cut 05 — blue knit card hold (6.667–8.900s)

```text
Use Image 1 and Image 2 as matching first/last frames of a fixed TRAVEL PASS card. Use Image 3 for identity and Image 4 for the exact card layout.
The card, portrait window, border, typography, shadow and barcode remain pixel-stable. Only the person inside the window is visible.
The same traveler wears a pale blue cable-knit vest over a white long-sleeve top, a grey skirt and red flats, looking at a phone with a subtle weight shift.
Keep the framing and lighting consistent. No morphing, no card movement, no real logos, no audio.
Generate a 4-second clip. Complete the subtle weight shift within the first 67 frames, then hold the clean final state. Trim to frames 200–266 (2.233 seconds) when replacing the animatic.
```

## Cut 06 — neutral utility card hold (8.900–11.133s)

```text
Use Image 1 as the first frame and Image 2 as the last frame. Use Image 3 for the same fictional traveler and Image 4 for the fixed TRAVEL PASS card.
Hold the card completely still. Inside its window, show the traveler in a neutral taupe utility vest, light knit top, long utility skirt, canvas tote and brown boots.
She makes one small shoulder-settling motion while holding the tote strap. Preserve the portrait crop, face, hands and warm-white lighting.
No transition within the shot, no card animation, no new objects, no branding, no audio.
Generate a 4-second clip. Complete the shoulder-settling motion within the first 67 frames, then hold the clean final state. Trim to frames 267–333 (2.233 seconds) when replacing the animatic.
```

## Cut 07 — city classic card hold (11.133–13.333s)

```text
Use Image 1 as the first frame and Image 2 as the last frame. Use Image 3 for character identity and Image 4 for the unchanged card.
The cream TRAVEL PASS card and soft shadow remain fixed. Inside the portrait window, the traveler wears a white short-sleeve collared shirt, charcoal pleated skirt, black crossbody bag, glasses and Mary Jane shoes.
She makes a tiny wrist-check gesture and then settles, with no camera movement. Preserve face, glasses, hands, crop, light and background.
No morphing, no card movement, no extra person, no real airline branding, no audio.
Generate a 4-second clip. Complete the wrist-check and settling motion within the first 66 frames, then hold the clean final state. Trim to frames 334–399 (2.200 seconds) when replacing the animatic.
```

## 교체 절차

1. 각 컷을 360p로 생성하고 첫·끝 프레임과 참조 이미지를 고정합니다.
2. 컷의 길이를 위 표의 초 단위가 아니라 프레임 수로 맞춥니다: `68, 64, 13, 55, 67, 67, 66`.
3. 생성된 MP4를 해당 구간의 `generated/clips/` 파일로 대체하고, 카드 입구 컷과 카드 hold 컷을 별도로 유지합니다.
4. `render.ps1`를 다시 실행해 전체 애니매틱을 재연결합니다. 카드 입구는 13프레임, 카드 hold의 내부 인물은 구간 경계에서 하드컷해야 카드·그림자가 흔들리지 않습니다.
5. 마지막으로 성공한 컷만 720p 이상으로 재생성하고, 동일한 프레임 수로 프록시를 교체합니다. 정확한 카드 텍스트·그림자·타이밍은 후반 FFmpeg/AE 레이어가 기준입니다.
