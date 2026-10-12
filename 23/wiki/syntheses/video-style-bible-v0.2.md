# 23jung video style bible v0.3

- Status: working synthesis; pilot references removed from production registry
- Updated: 2026-08-29
- Supersedes: conversational v0.1 notes

> 정본 역할: 이 문서는 시각 언어와 사람이 판단할 품질 기준만 담당한다. 단계·schema·승인 규칙은 [[remotion-vox-production-playbook-v0.1]]를 따른다.

## Core language

`populated-cut-preview-first editorial collage + final-voice-retimed spatial canvas + evidence-preserving data/document motion`

The primary visual reference is the reviewed [Vox-style Claude + Remotion tutorial](../sources/vox-style-claude-remotion-reference.md). Its reusable lesson is a scene system with layered editorial assets and precise timing—not a preset look, a one-click generator, or a requirement to record before designing visuals.

The broader MoSidd series confirms that the method is iterative. For 23jung, the adapted order is: temporary script plus the user's measured speaking rate sets provisional timing; real assets and Omni imagegen keyframes populate every cut; the user passes all cuts before any Omni MP4 is generated; the assembled provisional video receives a separate user review; only then are the final script and recording locked; measured final voice retimes the approved scenes. Scratch recording is optional. Source: [[../sources/mo-sidd-remotion-production-series]], [[remotion-vox-production-playbook-v0.1]].

The channel's normal long-form target is 8–10 minutes (480–600 seconds). This is a runtime envelope, not a reason to pad narration: episode-001 uses 48 concise cut-local narration units, and the user's final recordings remain the timing authority.

## Vox-style scene contract

Each temporary-script line or 5–10 second visual beat must define:

`claim / voiceover / background / midground / foreground / source / transition / sound cue / verification state / AI disclosure`

- The principal object is a photograph, video, document, map, chart, number, or cut-out—not a floating interface panel.
- One shared paper/grid/editorial texture can join otherwise heterogeneous sources into a coherent visual world.
- Background, midground, and foreground remain separate so their timing, scale, and position can be tuned independently.
- Each scene is implemented as its own component with props; the master composition sequences scenes against the measured final voiceover.
- Important reveals and cuts land on the relevant spoken word. Evidence: [scene plan at 01:30](../../raw/assets/vox-style-reference/00-01-30.jpg), [component controls at 03:38](../../raw/assets/vox-style-reference/00-03-38.jpg), [voiceover timing at 12:00](../../raw/assets/vox-style-reference/00-12-00.jpg).

## Fifteen rules

1. One movement explains one relationship.
2. Every shot retains a location anchor.
3. Use `overview → detail → overview` as the default loop.
4. Show one primary object and no more than two supporting groups.
5. Narration states the claim; the screen supplies evidence.
6. Match cuts need shared visual properties and editorial meaning.
7. Split screens are used only for necessary simultaneous comparison.
8. Data changes are staged and followed by a reading hold.
9. Axes, dates, units, sources, and verification state remain visible.
10. Sound marks selected state changes, not every motion.
11. Confirmed fact, report, testimony, and inference have separate visual treatments.
12. The interactive board provides a reduced-motion presentation.
13. Do not use a text box as the default shot; type belongs on documents, labels, charts, headlines, and intentionally designed editorial typography.
14. Do not use full-screen AI stills as the default shot. Use generated imagery only for disclosed reconstruction or a missing explanatory object.
15. Source media should remain recognizable while editorial treatments—cut-out, halftone, crop, parallax, highlight, chart draw, or map movement—direct attention.

Rules 1–3 are based on spatial-canvas precedents and motion guidance. Source: [visual references](../../raw/sources/visual-reference-works-2026-08-21.md#spatial-canvas-and-drawing), [Material guidance](../../raw/sources/motion-accessibility-and-korean-text-2026-08-21.md#sources)

Rules 4–5 and 8 draw on signaling, segmenting, coherence, and complementary modality. Source: [multimedia-learning capture](../../raw/sources/multimedia-learning-2026-08-21.md#sources)

Rules 6–9 incorporate object constancy and the risk of false causal animation. Source: [animated-transition capture](../../raw/sources/animated-transitions-and-sound-2026-08-21.md#animated-data-transitions)

Rules 10 and 12 draw on audiovisual-attention and accessibility guidance. Source: [sound research](../../raw/sources/animated-transitions-and-sound-2026-08-21.md#audiovisual-synchrony), [W3C capture](../../raw/sources/motion-accessibility-and-korean-text-2026-08-21.md#sources)

## Production order

제작 순서의 운영 정본은 [[remotion-vox-production-playbook-v0.1#2026-08-25-visual-contract-v2-개정]]이다.

## Visual Contract v2 품질 기준

- **Fake diversity 금지:** 서로 다른 이름이 같은 opacity·transform·clip 연산으로 끝나면 여러 기법으로 세지 않는다. 화면에서 구분되는 operator와 변화만 보고한다. 구현 기준은 [operator registry](../../video/src/vox/motion/operator-registry.ts)다.
- **독립 PNG 기준:** 별도로 등장·이동·강조할 인물·문서·소품을 하나의 합성 PNG로 묶지 않는다. 한 레이어는 한 편집 가능 오브젝트다.
- **source 의미 번역 기준:** source 캡처는 화면 재료가 아니라 사실 확인 근거다. Imagegen을 사용할 때는 확인된 내용을 `semantic_summary`로 줄이고, 그 의미를 구체적인 글자 없는 사물·장면으로 번역한 프롬프트로 독립 asset을 만든다. 요약문을 이미지에 쓰거나 빈 PNG에 별도 설명문을 타이핑해 의미를 만드는 것은 금지한다. Source: [lineage schema](../../video/contracts/source-asset-lineage-v1.schema.json), [EP001 vertical slice](../../video/contracts/episode-001-vox-vertical-slice-v1.json).
- **Beat 우선:** 기법 개수를 채우지 않는다. 각 beat가 설명할 관계에 필요한 layer entry, path draw, document emphasis, chart reveal, camera reframe 중 적합한 변화를 가져야 한다.
- **Omni 구분:** 정지 키프레임은 구도·인물·소품·행동 시작점의 생성 입력이다. 키프레임 fade를 움직이는 컷처럼 보여주지 않는다. 생성 결과의 행동·연속성은 별도 playable 검수 대상이다.
- **전환 증거:** 인접 장면을 함께 렌더한 pair artifact가 없으면 morph나 scene-to-scene이 구현됐다고 표현하지 않는다.
- **과잉 모션 방지:** 모든 요소를 움직이지 않는다. 한 beat의 주인공과 설명 관계만 적극적으로 움직이고, 문서 가독성과 final hold를 보존한다.
- **사용자 판단:** 자동 검사는 no-op·잘못된 target·누락된 capability·해시 변경을 차단한다. 리듬, 집중점, 설명력, 과잉 여부는 전체 재생 영상을 본 사용자가 승인한다.

## 선택적 treatment 계약 (2026-08-29)

MoSidd 레퍼런스에서 가져올 것은 “전체 화면에 필터를 씌운다”가 아니라, paper/grain·posterize·boil·texture sandwich를 특정 레이어의 목적에 맞게 제한하는 방식이다. 차트 영상은 paper/grain이 디지털 느낌을 줄이는 사례를 보여주고, collage 영상은 두 프레임 posterize를 일부 요소에만 적용하라고 설명하며, boil은 작은 fractal-noise 움직임이어야 하고 과하면 buzz가 된다고 경고한다. Source: [chart transcript, 00:00:54–00:00:59 and 04:05–04:42](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt), [collage transcript, 05:39–06:28](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt), [reel transcript, 03:24–04:58](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).

현재는 다음 순서로만 treatment를 제안한다.

1. `visual beat → presentation contract → 대상 component/role → treatment 범위·시간·파라미터 → runtime operator → A/B 검수` 순서를 지킨다.
2. 법률 원문·날짜·숫자·축·정확한 인용문·공식 인물 얼굴·출처/권리/AI 표시·official video frame·reading hold는 보호 영역으로 선언하고 treatment를 적용하지 않는다.
3. 계획 카탈로그는 `paper.background@1`, `grain.overlay@1`, `tone.selective@1`, `highlight.sweep@1`, `boil.seeded@1`까지로 제한한다. `grain.overlay@1`만 EP001 SH003에서 deterministic static procedural SVG-tile operator로 구현된 후보이며, 나머지는 `planned / not implemented / not PASS`다. 이름만으로 runtime capability나 기법 수를 주장하지 않는다. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [operator registry](../../video/src/vox/motion/operator-registry.ts).
4. 제안 수치는 레퍼런스의 측정값이 아니라 프로젝트의 안전 추정값이다: grain opacity 0.02–0.035(최대 0.045), 선택 halftone 5–8px·opacity 0.02–0.05(최대 0.06), highlight 12–20f·opacity 0.25–0.42·beat당 1회, boil은 2f마다 갱신하며 ±1px·±0.15°·±0.003 scale 이내다.
5. treatment가 필요한 beat만 사용하며 최소 기법 개수는 강제하지 않는다. reading hold에는 camera/document motion과 treatment motion을 겹치지 않는다.

검수는 no-treatment와 treatment를 같은 frame/window로 1080p 및 360×203에서 비교한다. 보호 영역의 pixel identity/difference mask, 실제 runtime operator의 변화, manifest·asset-sheet·treatment 선언·runtime·review artifact의 SHA-256을 함께 기록해야 한다. 어느 하나라도 바뀌면 해당 검수는 무효다. EP001 SH003에서는 이 계약에 따라 background와 `rear-wall-b01`에만 저강도 static grain 후보를 구현했고, SH004는 untreated로 남겼다. 법률 텍스트·얼굴·label·source chrome 및 외부 effect 파일은 제외한다. Source: [MoSidd treatment study](../sources/mo-sidd-remotion-production-series.md#81-selective-treatment-is-the-transferable-lesson), [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [SH004 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH004/manifest.json), [effect catalog](../sources/effect-file-catalog.md).

### 선택적 treatment 구현 후보: EP001 SH003 (2026-08-29)

SH003에는 `grain.overlay@1` 두 개만 있다. 고정 베이지 배경은 0–299프레임, `rear-wall-b01`은 15–299프레임에 현재 opacity `0.035`로 적용하며 seed는 `31003`과 `31031`이다. 처리는 외부 effect file이 아닌 결정론적 정적 SVG tile이므로 `effects_required=false`, `effects=[]`, effects folder 없음 상태를 유지한다. Kim/Park/bill은 alpha-core, labels/source는 render-order로 보호한다. 이전 0.028 candidate는 superseded다. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [operator registry](../../video/src/vox/motion/operator-registry.ts), [presentation renderer](../../video/src/vox/scene/PresentationScene.tsx), [shared effect catalog](../../video/public/assets/shared/effects/catalog.json).

현재 0.035 candidate의 동일 frame/window A/B 자동 검수는 1920×1080과 360×203에서 수행됐다. frame 250의 normal output은 2,073,600픽셀 중 28,925픽셀이 변했고 최대 channel delta는 6, mobile은 73,080픽셀 중 6,043픽셀이 변했고 최대 delta는 1이었다. 보호 alpha-core는 361,694픽셀 중 0픽셀이 변했고, protected-isolation before/after는 SHA-256 `e667f8a598ba999284ac7700b30f6d0a170550c5f3194087400f211fb6b08526`으로 동일하다. [A/B contact](../../video/qa/episode-001-work-v01/treatment/SH003-treatment-ab-contact.png)의 SHA-256은 `75e426f007ff310d78b4a640063faa7b2af28b22b21633de4fa8548488f2706b`, [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json)의 SHA-256은 `b5babbcb85bcc752af3dc11487c9df6d7a14eb552c1d48c1aacb7866a96cfd63`다. 이는 구현 후보와 automatic QA 기록이며, 사용자 visual-quality PASS나 최종본을 뜻하지 않는다. Source: [selective_treatment_qa](../../video/qa/episode-001-work-v01/review-ledger.json#selective_treatment_qa).

### Route reveal 및 법률 문서 런타임 경계 (2026-08-29)

SH005는 지도·차트 레퍼런스에서 배운 관계선 공개를 적용한 기술 후보다. 자체 제작 route-map SVG를 먼저 고정하고 `svg.stroke-draw@1`로 직접 확인 경로(101–122프레임), 보완수사 요구 경로(122–143프레임)를 순차 공개한 뒤 안정 hold에 들어간다. 이 SVG는 설명용 도식이며 LAW-196/LAW-1972 원문 근거를 대체하지 않는다. SH004→SH005는 사건파일 component/asset을 유지하는 30프레임 `scene.shared-element@1` boundary로 연결되며, SH005 window F0의 bridge는 timeline window 설계 결과다. Source: [SH005 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH005/manifest.json), [render catalog](../../video/episodes/episode-001/generated/render-catalog.json), [MoSidd map source](../sources/mo-sidd-remotion-production-series.md#6-create-continuity-without-a-giant-scene).

V3 generic adapters `camera.transform@1`, `mask.inset@1`, `document.highlight@1`은 실제 runtime에서 action이 활성일 때만 CSS를 내보내도록 구현·테스트됐다. 이들은 `highlight.sweep@1`과 다른 계열이다. SH006은 현재 partial timing-draft authority에 materialized됐지만 user cut PASS·rights approval·active-root promotion은 여전히 pending/block 상태다. 첫 adapter가 neutral transform/clipPath를 무조건 출력해 Chromium AA baseline을 바꾼 회귀는 action-gated CSS와 non-leakage test로 수정됐고 SH003 0.035 A/B 지표가 복원됐다. Source: [operator registry](../../video/src/vox/motion/operator-registry.ts), [PresentationScene](../../video/src/vox/scene/PresentationScene.tsx), [SH006 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH006/manifest.json), [review ledger](../../video/qa/episode-001-work-v01/review-ledger.json).

### 텍스트–asset 공간 계약 v2 (2026-08-30)

텍스트 회전은 `PNG와 관련 있다`는 이유만으로 허용되지 않는다. `surface-content`가 이름이 지정된 PNG render target의 표면 위에 실제로 겹쳐지고 target에 결속될 때만 ±2° 안에서 표면각을 상속한다. PNG를 설명하는 `asset-label`은 target의 완전한 아래쪽 예약 레인에 수평으로 놓고 모든 asset과 32–72px 떨어뜨리며 target 중심선 오차를 ±16px 안에 둔다. 제목·독립 인용·출처·일반 설명은 `screen-chrome` 0°다. 같은 행의 독립 asset은 64px 이상 떨어뜨리고 인접 간격 편차도 64px 이하로 제한하며, 모든 row asset은 기준선 group 또는 명시적 예외를 갖는다. 같은 역할의 하단 기준선은 ±24px, 인물 눈높이는 ±20px, connector는 비대상 asset·label에서 24px 이상 확보한다. 의도하지 않은 겹침은 즉시 반려한다. 이 계약은 SH006 v04와 family v01의 라벨 충돌·임의 좌표·불규칙 리듬을 거부한 뒤 v05/v02에서 적용했으며, 두 후보군은 아직 사용자 PASS 전이다. Source: [layout contract](../../video/scripts/style-frame-layout-contract.mjs), [SH006 v05 manifest](../../video/qa/style-frames/episode-001/SH006-editorial-v05/manifest.json), [family v02 index](../../video/qa/style-frames/episode-001/reference-style-families-v02/family-index.json), [production state](../../video/episodes/episode-001/production-state.json).

### 레퍼런스 동등성·편집 깊이 계약 v3 (2026-08-30)

레퍼런스의 핵심은 베이지색이나 특정 폰트가 아니라 `한 시점에 한 개의 큰 focal → 비대칭 supporting object → 배경·중경·전경의 가림과 누적 → 다음 장면에 남는 공통 오브젝트`다. 새 visual-family 후보는 reference frame·관찰한 문법·가져오지 않을 요소를 manifest에 기록하고, 한 beat의 dominant focal을 정확히 하나만 선언한다. 같은 크기의 카드·문서·인물을 가로로 나열하는 museum/PPT layout, 종이보다 큰 회색 UI 받침, 화면 전체 웹 캡처, 설명용 박스가 focal인 화면은 반려한다. 기사·법률은 핵심 문구 crop이나 source-locked 재조판을 종이 오브젝트로 만들고, 제한된 tilt·bbox shadow·부분 가림을 사용한다. Assembly 계열은 본회의장 구조를 중경으로 유지하고 실물 인물 PNG와 한글 법안명을 전경 focal에 결합한다. 절차 계열은 삭제·존속 같은 결론을 크게 두고 인물→요구→기관은 작은 깊이 경로로 보조한다. Source: [locked Vox reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [2-second reference contact](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [reference analysis](../sources/vox-style-claude-remotion-reference.md), [v03 family index](../../video/qa/style-frames/episode-001/reference-style-families-v03/family-index.json).

정지 style-frame PASS는 색·구도 방향만 승인한다. source 승인·local materialization 뒤 각 cut/visual beat가 승인 grammar에 대해 `applicable` 또는 `not-applicable`을 선언하며, family·sample coverage quota는 없다. `applicable` beat만 `blocked-pre-style-pass → pending-playable-parity → passed-playable-parity`로 진행하고, `not-applicable`은 비어 있지 않은 의미 근거를 남기되 모션 artifact를 요구하지 않는다. 두 번째 상태에서는 `active_cut_root=null`과 `timing-draft`를 유지한다. 승인 marker는 manifest·contact·wide/mobile output·모든 frame input을 `kind|path|sha256`로 정렬한 묶음과 정확히 같아야 한다. playable parity는 선택한 beat의 exact grammar ID, episode source/input path·SHA-256, target, semantic geometry fingerprint, runtime·artifact를 결속하고 실제 operator와 opacity 이외의 observable delta를 기록한다. 각 artifact는 ffprobe에서 1920×1080·30fps·양의 duration, 서로 다른 표본 frame hash, 최소 60프레임 reading hold를 통과해야 한다. 정지 PNG나 fade는 motion proof가 아니며 입력·geometry·runtime·검수 영상이 바뀌면 해당 parity를 무효화한다. Source: [reference transfer gate](../../video/episodes/episode-001/reference-style-gates.json), [reference validator](../../video/scripts/validate-reference-style-gates.mjs), [focused regression tests](../../tests/reference-style-gates.test.mjs), [production state](../../video/episodes/episode-001/production-state.json).

렌더 출처는 receipt 문구나 DOM data attribute로 판정하지 않는다. 각 applicable beat의 결속 runtime은 실제 Remotion production entrypoint로 번들링되어 해당 composition을 등록해야 한다. action 시작·끝 및 최소 60프레임 reading hold의 시작·중간·끝에서 직접 렌더한 기준 프레임이 제출 MP4의 같은 프레임과 일치해야 한다. target ID·입력 SHA-256·끝 geometry는 승인된 대표 style frame에서 검증기가 직접 파생한다. 정상 composition에는 해당 ID·입력 해시를 가진 `[data-parity-target]`가 정확히 하나 있어야 하고, 그 node는 승인 input과 byte-identical한 `video/public` 파일을 실제 `HTMLImageElement.currentSrc`로 읽어야 한다. 검증기가 그 node만 숨긴 lossless 프레임과 정상 프레임의 원해상도 차분으로 실제 target 기여 mask를 만들고 이동·형상 변화를 검사한다. 제출 MP4는 같은 target mask의 엄격한 픽셀 대조, 전체 1920×1080 프레임의 mean·p95·match-fraction, 64×64 지역 타일의 mismatch-fraction·mean, 고차이 픽셀의 8-connected component 대조를 함께 통과해야 한다. 장면 작성 isolation 분기, 중복·미등록 target, 해시 문자열만 맞춘 다른 이미지, 다른 asset 이동, 가느다란 connector나 작은 icon을 포함한 focal/supporting asset 누락, 비-opacity 속성명으로 위장한 전체·국소 fade, 계속 움직이는 reading hold는 실패한다. Source: [Remotion target-contribution proof](../../video/scripts/remotion-parity-proof.mjs), [reference gate validator](../../video/scripts/validate-reference-style-gates.mjs), [masked pixel regression](../../tests/remotion-parity-pixel-binding.test.mjs).

## Known unknowns

- Camera speed and reading holds need testing on phone screens.
- One primary reference now has timestamped frame captures, but exact cut lengths, easing curves, and audio peaks remain unmeasured.
- The rules have not yet been tested with politically uninterested Korean viewers aged 20–39.
- The implemented `grain.overlay@1` candidate has runtime/A-B evidence for SH003 only; the proposed bounds remain editorial inferences, and user visual-quality review is still pending. Tone, highlight, boil, and other treatment operators remain unimplemented.

## 시청자 우선 화면 위계 (v06)

- 한 visual beat에는 focal target이 하나만 있다. focal은 100%, supporting은 20~35% prominence이며 hidden은 렌더하지 않는다.
- `모든 요소가 보이는 final hold`는 동일한 크기·대비가 아니라 결론의 위계를 보존하는 summary를 뜻한다.
- 공식 전체 화면은 출처 인증용이다. 시청자가 읽을 법률은 normalized crop과 72px 이상·최대 2줄의 exact retype view로 전환한다.
- reading hold는 30fps 기준 최소 60프레임이며 camera/document motion을 겹치지 않는다.
- desktop contact sheet와 360×203 mobile artifact를 함께 보되 자동 통과는 사용자 미감·이해도 PASS가 아니다.

구현 기준: [Manifest v3](../../video/src/cut-manifest.ts), [semantic renderer](../../video/src/vox/scene/PresentationScene.tsx), [mobile QA](../../video/scripts/style-calibration-qa.mjs).

## Related

### 의미 충실도 fail-closed 규칙 (2026-09-01)

`asset-label`, `surface-content`, `screen-chrome`은 계속 허용한다. 다만 이 텍스트는 보조 표현층일 뿐이며, 누락·공백·차단된 focal asset/data/operator를 설명문으로 대신할 수 없다. 모든 calibration sample은 `semantic_fidelity` 계약에서 `required_visual_claim`, focal asset ID/class/source binding, 관찰 가능한 비텍스트 delta/operator, `text_roles_used`, `text_is_supplemental=true`, `no_semantic_substitution=true`를 선언한다. 해당 텍스트를 숨겨도 focal pixel과 실제 observable action만으로 시청자 takeaway가 전달되지 않으면 FAIL이다. 빈 입력, blocked manifest, 의미가 다른 문서·카드·일반 텍스트 박스, 또는 v02 `Rail`/screen chrome만을 semantic proof로 삼는 후보는 검수 보드에 올리지 않는다. 열 개 canonical sample의 계약은 [v02 semantic contract](../../video/scripts/semantic-fidelity-contract.mjs)와 [v02 design authority](../../video/qa/style-frames/remotion-motion-grammar-v02-design/manifest.json)에 고정한다.

- [[../concepts/spatial-camera-grammar]]
- [[../concepts/evidence-comparison]]
- [[../concepts/data-animation]]
- [[../concepts/audiovisual-rhythm]]
- [[../concepts/cognitive-load-and-accessibility]]
- [[media-source-strategy-v0.1]]
- [[../sources/seojaero36-money-cheaper-than-paper]]
- [[../sources/vox-style-claude-remotion-reference]]
- [[../sources/mo-sidd-remotion-production-series]]
- [[remotion-vox-production-playbook-v0.1]]

## 2026-08-31 Reference-first calibration boundary

### 2026-08-31 Reference grammar allowlist boundary

allowlist의 각 ID는 단순 문자열이 아니다. [계약](../../video/episodes/episode-001/reference-grammar-contract.json)의 entry object가 locked MP4 SHA, forward timecode range, 실제 local still SHA/dimensions, observed fact, source-analysis anchor, human approval marker를 함께 가져야 한다. 현재 계약은 사람 승인 전 상태이며, 실제로 사용하지 않는 범주는 binding 0으로 남길 수 있다.

현재 active 정적 관찰 ID는 `persistent-editorial-background`, `dominant-concrete-focal`, `supporting-source-object`, `layered-collage`, `background-midground-foreground`, `source-surface-text`다. `chart-self-draw`, `hard-cut`, `paper-print-texture`는 still만으로 runtime/양 끝 프레임 또는 인접 pair를 입증할 수 없어 `pending_evidence_entries`에 보류한다. 근거가 약한 `persistent-source-rail`, `shared-baseline-accumulation`, `declared-shared-plane`, `document-crop-reveal`, `camera-reframe`와 asset-label/source-rights는 자동 grammar가 아니라 별도 channel exception으로 취급한다.

레퍼런스는 픽셀 복사용 원본이 아니라 시각 문법의 관찰 자료다. 후보는 소재를 우리 정치·법률·뉴스·차트·건물·인물 자료로 바꿀 수 있지만, visible component/action/transition/treatment의 역할과 관계는 [동결 계약](../../video/episodes/episode-001/reference-grammar-contract.json)의 관찰된 ID만 사용한다. 미래 PASS manifest는 일곱 범주(`visual_object_role`, `layout_relation`, `depth_occlusion`, `text_surface_role`, `motion_operator`, `transition_operator`, `treatment`)의 `reference_grammar.bindings`와 `reference_grammar_contract_version=1`을 가져야 하며 `unmapped_visual_grammar=[]`, `novel_visual_grammar=[]`를 강제한다. 미관찰 카드·설명 박스·장식 아이콘·새 effect/transition은 금지한다. 레퍼런스 요소 전체를 복사할 필요는 없지만 allowlist subset을 조합할 수만 있다. 새 문법은 추가 연구와 사람 승인 및 계약 갱신 뒤에만 허용한다.
`approved_subset`은 bindings의 실제 grammar ID 집합과 정확히 일치해야 하며 중복을 허용하지 않는다. 사람 승인 marker는 `reviewer=user`만 인정하고, 실행 증거가 없는 pending entry는 유효한 category·전역 고유 ID·비어 있지 않은 사유와 증거 목록을 가져야 한다.

채널 예외는 정확히 `beige-checker-background`, `source-rights-chrome`, `source-locked-legal-retype`, `short-asset-label-below-target` 네 가지로 동결한다. 이들은 focal·장식 모티프·motion·transition이 될 수 없고, 실제 component registry의 exception-only target에만 적용한다. still/timecode/side-by-side는 관찰 locator와 파일 무결성 증거일 뿐 pixel similarity 승인 기준이 아니다. Source: [grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json), [validator](../../video/scripts/validate-reference-style-gates.mjs), [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4).

The ten Remotion motion-grammar samples are currently `reference-calibration-incomplete` and `eligible_for_user_style_frame_review=false`; they are not production style-frame candidates. Before grammar promotion, each candidate needs an exact local reference still/frame/timecode, observed asset/text/geometry/depth/motion/transition/treatment notes, borrowed and excluded elements, a side-by-side reference/candidate artifact, and an explicit human reference-calibration PASS. Automated file checks do not establish visual reference fidelity. Asset labels belong outside/below their target; text over photo/person/building pixels is excluded, while source-derived document text, headlines, and chart axes/values may remain surface-content. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [reference grid](../../video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png), [reference analysis](../sources/vox-style-claude-remotion-reference.md), [calibration set](../../video/qa/style-frames/remotion-motion-grammar-v01/sample-index.json).

### Opening motion grammar candidates (2026-08-31)

완성본 opening에서 start/mid/end 변화로 확인된 후보는 여섯 개다: `staggered-object-accumulation`, `numeric-step-progression`, `chart-self-draw`, `directional-scene-exit-left`, `hard-cut`, `object-preserving-layout-reframe`. 이는 효과 이름 목록이 아니라 source frame에서 관찰된 변화 범위를 좁게 명명한 것이다. 중국어/영어 repost subtitle, watermark, progress bar는 문법에서 제외한다. Source: [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4), [catalog scope and uncertainty](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json).

현재 여섯 개 모두 사람 승인 전이며 production에서 사용할 수 없다. `chart-self-draw`와 `hard-cut`은 기존 pending 항목에 실제 motion/pair evidence가 연결됐지만, human review와 우리 소재의 runtime prototype이 남아 있다. `paper-print-texture`, `selective-animated-texture`는 before/after isolation이 없어 pending이고, source-footage 내부 움직임은 Remotion operator가 아니다. `camera-reframe`도 source pixels만으로 camera와 object transform을 구별할 수 없어 허용하지 않는다. Source: [grammar contract](../../video/episodes/episode-001/reference-grammar-contract.json), [motion catalog](../../video/qa/reference-study/vox-primary/motion-grammar-v01/motion-grammar-catalog.json), [locked reference](../../raw/inbox/vox-style-claude-remotion-reference.mp4).
