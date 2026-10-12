# Remotion repository patterns for 23jung

검토일: 2026-08-25

이 페이지는 사용자가 추린 여섯 GitHub 저장소를 현재 23jung 제작 게이트에 대조한 적용 판단이다. 저장소 상태와 라이선스는 [공식 저장소 검증 캡처](../../raw/sources/remotion-repository-verification-2026-08-25.md)에 고정했다. 로컬 package 경로 정정은 [append-only correction](../../raw/sources/remotion-repository-verification-2026-08-25-correction.md)에 있다.

## 결론

어느 저장소도 새 프로젝트 베이스로 채택하지 않는다. 현재의 근거·출처·컷 manifest·SHA-256·48컷 개별 PASS·전체 provisional 영상 승인 체계를 유지하고, 필요한 패턴만 로컬 adapter 계층으로 구현한다.

우선순위는 다음과 같다.

1. `hassancs91`: 콜라주 카메라, 레이어, 컷아웃, 사진·문서 plate의 구현 패턴
2. `AleBrito`: 데이터 기반 차트, 공통 timing math, safe area, 결정적 프레임 계산
3. `Cele-san`: 종이·하프톤·형광펜·슬랩인이라는 시각 언어
4. `Cliff007007`: preflight, contact sheet, change-region, 첫·끝 프레임 연속성 검사
5. `remotion-dev/mapbox-example`: 경로 진행률과 카메라 보간 아이디어만 사용
6. `Anil-matcha`: style bake-off와 keyframe→clip 단계 분리만 참고

## 채택 판단표

| 저장소 | 코드 채택 | 적용할 부분 | 적용하지 않을 부분 |
|---|---|---|---|
| `hassancs91/claude-faceless-shorts-creator` | MIT 고지 후 선택 이식 | `CollageBoard`, depth/parallax `Layer`, `Cutout`, `ArchivalPhoto`, 손그림 경로 | Shorts 규격, 자동 대본·TTS·생성 미디어 공장, 원본 팔레트 그대로 사용 |
| `AleBrito124356/remotion-video-templates` | MIT 고지 후 선택 이식 | bar/line interpolation, SVG path reveal, shared timing math, safe area, seeded motion | 텍스트 박스 중심 lower-third·kinetic/caption 장면, 컴포넌트가 컷 길이를 임의 결정하는 구조 |
| `Cele-san/vox-style-animation` | 원리 또는 MIT 고지 후 자산·수치 참고 | paper slap-in, highlight sweep, halftone/duotone, 약한 camera drift, 반복 anchor | HyperFrames/GSAP 런타임 추가 |
| `Cliff007007/paper-collage-video` | 코드 복사 금지, 아이디어만 | Gate 0/1, contact sheet, collision/repetition 검사, `change_regions`, start/end continuity | 합성음성/SRT 우선, Seedance·Ark 종속, 장면당 자산·모션 고정 할당량 |
| `remotion-dev/mapbox-example` | 코드 복사 보류, 알고리즘 아이디어만 | frame→route progress→camera position | 렌더 중 Mapbox 토큰·원격 타일·GPU 의존 |
| `Anil-matcha/vox-ai-motion-graphics-generator` | 코드 복사 금지, 단계 아이디어만 | 대표 컷 style bake-off, keyframe와 motion clip 분리 | topic→final 자동화, 합성음성, 조기 `final.mp4`, 컷별 PASS 생략 |

`Cliff007007`, `Anil-matcha`, `remotion-dev/mapbox-example`은 검토 시점에 표준 라이선스 파일을 확인하지 못했다. 공개 저장소라는 사실만으로 코드 재사용 권한이 생기지 않으므로 구현을 복사하지 않는다. 상세 근거와 기준 커밋은 [공식 저장소 검증 캡처](../../raw/sources/remotion-repository-verification-2026-08-25.md)에 있다.

## 현재 코드와의 차이

현재 [motion.tsx](../../video/src/motion.tsx)에는 path morph, 카메라 board, keyframe/video plate, connector, source footer, AI 재구성 라벨이 있다. [cut-manifest.ts](../../video/src/cut-manifest.ts)는 asset, animation, chart, effect, continuity, source ID, AI 고지와 review 상태를 이미 가진다.

따라서 새로 필요한 것은 또 하나의 독립 제작기가 아니라 다음 다섯 묶음이다.

```text
video/src/vox/
  collage/     # 종이 컷아웃·사진·문서·레이어·카메라
  charts/      # bar·line·counter·process timeline
  maps/        # 로컬 GeoJSON/TopoJSON/SVG 경로
  motion/      # place·slap·highlight·route·camera preset
  scene/       # manifest를 실제 컴포넌트에 연결하는 adapter
```

QA는 별도 스크립트로 둔다.

```text
video/scripts/
  render-cut-contact-sheet.mjs
  render-phone-preview.mjs
  validate-cut-visual-states.mjs
```

## 적용 계약

### 1. 외부 저장소가 게이트를 소유하지 않는다

저장소에서 가져오는 것은 시각 컴포넌트·프레임 수학·QA 패턴이다. 다음 정본 순서는 바뀌지 않는다.

```text
근거 잠금과 스토리라인
→ 임시 대본과 사용자 실측 발화속도
→ 실제 자료·Remotion 자산·Omni imagegen keyframe 준비
→ SH001–SH048 개별 PASS
→ Omni 영상 생성
→ 전체 provisional 영상
→ 전체 영상 별도 승인
→ 최종 대본
→ 사용자 최종 녹음
→ ffprobe 기반 재타이밍과 조립
→ picture lock
```

### 2. 렌더는 로컬 입력만 읽는다

Remotion 컴포넌트는 manifest에 등록되고 검증된 로컬 파일과 데이터만 읽는다. 렌더 중 네트워크 요청, 이미지·영상 생성, TTS, asset 다운로드, Mapbox 타일 호출을 하지 않는다. 외부 API가 만든 결과는 먼저 컷 폴더에 저장하고 출처·권리·해시·승인 상태를 기록한 뒤 입력으로 사용한다.

### 3. manifest가 시간의 권위다

AleBrito 저장소의 `calculateMetadata()`와 공통 timing math는 duration drift 방지 패턴으로 참고한다. 그러나 23jung에서는 provisional 길이는 임시 대본과 4.965자/초, final 길이는 사용자 음성의 `ffprobe` 측정값에서 나온 manifest 프레임이 권위다. 컴포넌트가 그 값을 다시 계산하거나 변경해서는 안 된다.

### 4. 결정적 프레임만 사용한다

모든 움직임은 `useCurrentFrame()`, `interpolate()`, `spring()`, `<Sequence>`와 고정 seed로 계산한다. `Date.now()`, 무작위 seed, CSS animation, 렌더 시점 네트워크 상태에 의존하지 않는다. 하프톤·듀오톤·누끼는 가능하면 asset 사전처리 결과로 고정한다.

### 5. 화면의 주체는 자료다

콜라주 컴포넌트는 실제 사진·문서·인물 PNG·차트를 보여주는 틀이다. `LabelChip`, kinetic text, lower third를 화면의 주인공으로 만들지 않는다. 텍스트는 단어·숫자·짧은 인용·축·단위·출처 보완에 한정한다.

## 단계별 구현안

### P0 — 출처와 adapter 경계

- `video/THIRD_PARTY_NOTICES.md`를 만들고 저장소, 기준 커밋, 라이선스, 가져온 파일/아이디어, 로컬 수정 내역을 기록한다.
- 외부 코드는 `video/src/vox/` 아래에서만 수용하고 기존 manifest validator를 우회하지 못하게 한다.
- 새 의존성은 별도 ADR 없이 추가하지 않는다. 기존 runtime validator가 있으므로 Zod 도입은 필수가 아니다.

### P1 — 콜라주와 공통 모션

- `PaperBackground`, `CollageBoard`, `Layer`, `Cutout`, `SourcePhoto`, `DocumentPlate`를 구현한다.
- `place`, `slap`, `rise`, `wipe`, `highlight`, `camera` preset을 프레임 데이터로 정의한다.
- 고정 베이지 체크 `background.png`와 현재 `background-only → reveal → final-hold` 생명주기를 유지한다.
- 기존 [motion.tsx](../../video/src/motion.tsx)의 `CameraBoard`, `MorphPath`, `KeyframePlate`를 재사용하거나 이동하고 중복 구현하지 않는다.

### P2 — 데이터 차트

- `BarChart`, `LineChart`, `Counter`, `ProcessTimeline`을 manifest `chart` 데이터에서 렌더한다.
- 값·단위·축·source ID가 없으면 렌더하지 않는다.
- 경로 공개·막대 성장·숫자 count-up은 컷 로컬 프레임으로 계산하고 final hold에서 정확한 최종값을 보인다.

### P3 — 연락처 시트와 휴대전화 QA

- 각 컷의 frame 0, reveal 중간, final hold를 자동 렌더한다.
- contact sheet에는 cut ID, mode, asset hash, source ID, review 상태를 표시한다.
- 1920×1080 원본뿐 아니라 축소된 휴대전화 크기에서 날짜·숫자·출처·조문 가독성을 확인한다.
- 이 산출물은 사용자 PASS를 돕지만 대신하지 않는다.

### P4 — 로컬 지도

- 실제로 지도 컷이 필요한 에피소드에서만 구현한다.
- 로컬 GeoJSON/TopoJSON 또는 승인된 SVG/PNG를 입력으로 사용하고, 경로 진행률·카메라 이동만 프레임으로 계산한다.
- Mapbox/MapLibre 도입 전에는 동일 프레임 반복 렌더 해시, 오프라인 렌더, 글꼴·라벨 고정 여부를 검증한다.

### P5 — Omni 연속성 보조

- Omni manifest에 `start_state`, `end_state`, `change_regions`, `fixed_regions`, keyframe hash를 추가할 수 있다.
- 이 메타데이터는 imagegen keyframe 검수 단계에서만 작성한다.
- 실제 Omni 영상 생성은 48/48 컷 PASS와 승인 입력 해시가 확정된 뒤에만 허용한다.

## 첫 적용 범위

보완수사법 에피소드에서는 P1–P3만 먼저 적용한다. 공간 이동이 주제가 아니므로 Mapbox나 지도 런타임은 필요하지 않다. 첫 구현의 완료 기준은 “예쁜 예제 영상”이 아니라 다음 세 가지다.

1. 실제 자료 PNG 3종과 문서 plate를 같은 콜라주 scene에서 manifest만 바꿔 재사용할 수 있다.
2. 법률 절차 전후를 `ProcessTimeline`으로 만들고 값·문구·source ID가 final hold에서 검증된다.
3. 한 컷의 frame 0·중간·final hold와 휴대전화 축소본이 자동 contact sheet로 생성된다.

이 세 항목을 통과한 뒤에만 전체 48컷에 확장한다.

## 구현 상태 — 2026-08-25

P0–P3를 현재 제작 코드에 이식했다. 공통 구현은 [video/src/vox](../../video/src/vox/index.ts)에 있으며, collage·motion preset·bar/line/counter/dot-plot/process chart와 기존 `CutManifest`를 읽는 scene adapter를 제공한다. 별도 Zod schema나 외부 렌더러는 추가하지 않았다. Source: [manifest scene](../../video/src/vox/scene/ManifestScene.tsx), [chart renderer](../../video/src/vox/charts/index.tsx), [motion presets](../../video/src/vox/motion/presets.ts).

지원하는 QA 진입점은 `pnpm video:production-qa` 하나다. 이 명령은 기존 cut-assets·production-stage 검증과 새 visual-state 검증을 먼저 실행한 뒤, active root의 컷 수와 반려 상태를 확인하고 3상태 contact sheet와 360px final-hold 프리뷰를 만든다. 내부 렌더 스크립트를 직접 실행해도 같은 게이트를 다시 거치며, `timing-draft`에서 active root가 없으면 파일을 만들지 않고 명시적으로 skip한다. Source: [package scripts](../../package.json), [production QA](../../video/scripts/production-qa.mjs), [QA runtime](../../video/scripts/qa-runtime.mjs).

QA Still은 일반 영상 registry에서 분리된 [qa-index.tsx](../../video/src/qa-index.tsx)에만 등록한다. Windows에서는 `pnpm.cmd`를 자식 프로세스로 직접 실행하지 않고 현재 Node로 로컬 `@remotion/cli`를 호출한다. 배경과 모든 manifest 입력은 preview fingerprint에 포함된다. Source: [QA runtime](../../video/scripts/qa-runtime.mjs), [CLI probe](../../video/scripts/probe-remotion-cli.mjs).

visual validator는 non-hold 모션과 cue/effect 변화가 final hold 안으로 들어오는 것을 차단하고, 영상 CutAsset은 final hold 직전 프레임에서 `Freeze`한다. provisional 단계에서는 임시 대본의 compact 글자 수·계획 발화속도·pre/post-roll에서 계산한 정확한 컷 프레임을, final-voice 단계 이후에는 strict `ffprobe` 측정 결과를 manifest와 대조한다. Source: [manifest scene](../../video/src/vox/scene/ManifestScene.tsx), [visual-state validation](../../video/scripts/visual-state-lib.mjs), [narration timing](../../video/scripts/narration-timing-lib.mjs), [integration tests](../../tests/remotion-vox-integration.test.mjs).

P4 로컬 지도와 P5 Omni 연속성 메타데이터 확장은 아직 구현하지 않았다. 보완수사법 첫 영상의 현재 단계는 계속 `timing-draft`, active cut root는 `null`이며 반려된 68컷은 제작 입력으로 승격하지 않았다. Source: [production state](../../video/episodes/episode-001/production-state.json).
