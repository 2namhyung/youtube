# MoSidd Remotion production series

- Source channel: [MoSidd videos](https://www.youtube.com/@mo-sidd/videos)
- Captured: 2026-08-24
- Status: seven relevant videos reviewed from channel metadata, descriptions, thumbnails, and English automatic transcripts
- Local channel index: [playlist metadata](../../raw/inbox/mo-sidd-remotion/channel/UC1DOBzuJajJjhpj4e3EVQlQ.info.json)

## Selected source set

| Video | Duration | Local evidence | Primary lesson |
|---|---:|---|---|
| [Vox-style motion graphics](https://www.youtube.com/watch?v=7wuYBfE131U) | 13:11 | [metadata](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.png) | narration-led three-layer scenes and master assembly |
| [Viral documentary reel](https://www.youtube.com/watch?v=xOhh274Ayac) | 13:30 | [metadata](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.png) | voice-line storyboard, asset sheet, frame-accurate scene isolation |
| [Vox map explainer](https://www.youtube.com/watch?v=Y6mOBK5peDU) | 10:00 | [metadata](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.png) | real geodata, map camera, continuous-shot scene joins |
| [Vox-style animated charts](https://www.youtube.com/watch?v=dv3ADYu74DE) | 5:21 | [metadata](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.png) | code-driven cited charts, paper texture, controlled boil |
| [Collage animation](https://www.youtube.com/watch?v=aSNYHAzPEKc) | 7:09 | [metadata](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.png) | layer-first collage, occlusion sandwich, selective posterization |
| [Parameterized charts and graphics](https://www.youtube.com/watch?v=dBakc0BdHjY) | 18:28 | [metadata](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.png) | editable text, data, layout, and transparent renders through props |
| [SaaS animation](https://www.youtube.com/watch?v=b7KlsXNQobs) | 13:49 | [metadata](../../raw/inbox/mo-sidd-remotion/b7KlsXNQobs/b7KlsXNQobs.info.json), [transcript](../../raw/inbox/mo-sidd-remotion/b7KlsXNQobs/b7KlsXNQobs.en.vtt), [thumbnail](../../raw/inbox/mo-sidd-remotion/b7KlsXNQobs/b7KlsXNQobs.png) | glass/refraction and Three.js are optional specialized modules |

Durations, titles, upload dates, descriptions, and chapter boundaries come from each captured metadata file. The automatic transcripts can contain recognition errors such as `reotion` for Remotion; claims below use repeated context rather than isolated words.

The user-selected core learning set for the Remotion cut contract is the opening and full workflow of `7wuYBfE131U`, the map build from 03:14 of `Y6mOBK5peDU`, and the chart workflow in `dv3ADYu74DE`. The third unique chart reference was added after the first request repeated `7wuYBfE131U` as both the first and third link.

## Repeated production method

### 1. Write the edit as voice lines

The documentary-reel example uses five or six voice lines of roughly five seconds each, then assigns one scene to each line. Scene choreography and the asset list are generated only after those lines are locked. Source: [viral reel transcript, 01:08–03:21](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).

For 23jung, a voice line is not merely narration; it is the smallest production unit. Each line must have a claim ID, evidence ID, visual action, and exact start/end frame.

### 2. Build a master asset sheet before animation

The reel example averages about four assets per scene and separates wallpaper/background, location or structure, character/foreground, and film-treatment elements. The collage example first analyzes the reference into a storyboard and master asset sheet, then constructs layers independently. Source: [viral reel transcript, 02:31–04:05](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [collage transcript, 00:30–02:20](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt).

### 3. Isolate scenes, then assemble a master composition

The series repeatedly warns against one monolithic component: a fix in scene 1 can otherwise break scene 6. Scenes are built in separate folders/components, tested in Remotion Studio, and combined only after their timing is stable. Source: [Vox transcript, 03:24–04:03 and 10:55–11:13](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [viral reel transcript, 09:04–09:20](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).

Remotion's official documentation confirms that `<Sequence>` time-shifts components and can give each child a scene-local frame count. Source: [official Sequence documentation](https://www.remotion.dev/docs/sequence).

### 4. Tune by frame and props

The reel tutorial recommends referencing exact frame numbers rather than approximate seconds. The Vox and chart tutorials expose position, scale, timing, color, text, and data as props so revisions do not require rewriting the scene. Source: [viral reel transcript, 05:14–06:26](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [Vox transcript, 08:28–08:38](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [parameterized-graphics transcript, 06:54–07:40](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.en.vtt).

### 5. Use a small motion vocabulary

- `spring`: arrivals and pop-ups with physical settling. Source: [Vox transcript, 06:30–07:19](../../raw/inbox/mo-sidd-remotion/7wuYBfE131U/7wuYBfE131U.en.vtt), [official spring documentation](https://www.remotion.dev/docs/spring).
- `interpolate` plus easing: pans, zooms, opacity, scale, and value changes. The map tutorial contrasts mechanical linear motion with eased motion. Source: [map transcript, 03:54–05:10](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt), [official interpolate documentation](https://www.remotion.dev/docs/interpolate).
- selective posterization: hold only chosen collage elements for about two frames to create stop-motion cadence; applying it to the whole scene is discouraged. Source: [collage transcript, 05:39–06:26](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt).
- restrained boil: subtle frame-to-frame fractal-noise displacement evokes hand-drawn animation; excessive amplitude becomes distracting visual buzz. Source: [chart transcript, 04:05–04:48](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt).
- screen blend for light VFX: a black-background explosion clip is composited by retaining highlights and suppressing black. Source: [map transcript, 06:15–06:51](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt).

### 6. Create continuity without a giant scene

The map tutorial makes each new scene start from the exact visual state where the previous scene ended. This produces a continuous camera move while preserving modular components. World Atlas supplies country geometry, TopoJSON represents boundaries, and d3-geo projects the shapes. Source: [map metadata](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.info.json), [map transcript, 01:00–02:49 and 05:10–07:46](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt).

For political explainers this can connect `Korea overview → affected region → National Assembly → committee → clause` without unrelated transition effects.

### 7. Treat data and sources as editable inputs

The chart examples build bars, labels, line paths, counters, timelines, and diagram nodes from data rather than baking them into generated pictures. The channel claims its Vox charts use cited real data; 23jung must still independently verify every value and attach a source ID. Source: [chart metadata](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.info.json), [parameterized-graphics metadata](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.info.json).

### 8. Add a shared treatment and sound last

The reel demonstrates a texture sandwich using multiple texture layers with different contrast/brightness, plus scan lines, vignette, color grade, corner blur, and gate weave. The map and collage videos add voiceover, score, Foley, and selected whooshes after visual assembly. Source: [viral reel transcript, 03:21–05:09](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [map transcript, 07:48–09:28](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt), [collage metadata](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.info.json).

23jung should keep grain and distress weaker over legislation, dates, axes, and source labels so the treatment never lowers evidence legibility.

### 8.1 Selective treatment is the transferable lesson

The references do not justify a single global “Vox filter.” The chart tutorial uses a paper/grain overlay to keep a data graphic from looking purely digital, and explicitly shows grain over the frame; this is a style observation, not evidence that every political-explainer layer should receive the same treatment. Source: [chart transcript, 00:00:54–00:00:59 and 01:31–01:36](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt), [chart transcript, 02:08–02:15](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt).

The collage tutorial describes posterization as holding an image for two frames, then says to apply it to only a few elements rather than the entire scene. This supports a per-asset cadence for decorative collage pieces, not a blanket freeze over faces, documents, or source labels. Source: [collage transcript, 05:39–06:28](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.en.vtt).

The chart tutorial describes boil as a tiny fractal-noise jump that gives a static chart slight life, and warns that too much becomes visual buzz. The reel separately describes a subtle character boil and a texture sandwich with scan lines, vignette, color grade, and gate weave. These are reference observations; the exact helper implementations and thresholds are not public in the captured sources. Source: [chart transcript, 04:05–04:42](../../raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt), [reel transcript, 06:54–07:03 and 04:40–04:58](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).

#### Adaptation boundary for 23jung

The following names are an editorial catalog: `paper.background@1` (the fixed project background, not a treatment proof), `grain.overlay@1`, `tone.selective@1`, `highlight.sweep@1`, and `boil.seeded@1`. `grain.overlay@1` is now implemented as a deterministic static procedural SVG-tile operator for the EP001 SH003 candidate; the remaining treatment operators are still planned and are not PASS evidence. A treatment must first declare a target component/role, frame interval, parameter bounds, protected zones, and source/provenance; only then can its runtime and A/B review be considered. No minimum number of techniques is required. A visual beat needs only the observable change that explains its relationship. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [operator registry](../../video/src/vox/motion/operator-registry.ts), [presentation renderer](../../video/src/vox/scene/PresentationScene.tsx).

The proposed bounds below are project editorial inferences, not numbers claimed by the references: grain opacity 0.02–0.035 (hard maximum 0.045); selective halftone opacity 0.02–0.05 (hard maximum 0.06) with 5–8px pattern; highlight sweep 12–20 frames at opacity 0.25–0.42, once per beat and outside a reading hold; seeded boil updated every two frames with at most ±1px, ±0.15°, and ±0.003 scale. The reference only establishes the qualitative direction and the warning against excessive motion. The current implemented SH003 candidate uses opacity 0.035 and fixed seeds 31003/31031, within the grain bound. The earlier 0.028 candidate is superseded. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json).

Official faces/profile photos, exact legal or minutes quotations, dates, numbers, chart axes, source/provenance labels, AI disclosures, official video frames, and reading-hold regions are protected by default. For EP001, the implemented candidate applies low static grain only to SH003's fixed background and `rear-wall-b01`; Kim/Park/bill use alpha-core protection and labels/source chrome use render-order protection. SH004 remains untreated. Tone, highlight, boil, and all external effect files remain deferred until a beat requires them and a new A/B review passes. The external effect catalog still has zero downloaded/approved files. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [SH004 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH004/manifest.json), [review ledger treatment QA](../../video/qa/episode-001-work-v01/review-ledger.json#selective_treatment_qa), [effect catalog](effect-file-catalog.md).

#### EP001 SH003 implementation candidate (2026-08-29)

SH003 has exactly two `grain.overlay@1` actions: the background from frames 0–299 and `rear-wall-b01` from frames 15–299. Both use the current opacity `0.035`; fixed seeds are `31003` and `31031`. The operator is static over time and procedural, so no external effect file, license record, or empty effects folder is introduced. The manifest keeps `effects_required=false` and `effects=[]`; SH004 has no treatment declaration. The earlier opacity `0.028` candidate is superseded by this 0.035 candidate. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [SH004 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH004/manifest.json), [shared effect catalog](../../video/public/assets/shared/effects/catalog.json).

The machine QA compares the same frame/window before and after treatment at 1920×1080 and 360×203. For the current 0.035 candidate at frame 250, normal output changed 28,925 of 2,073,600 pixels with maximum channel delta 6; mobile changed 6,043 of 73,080 pixels with maximum channel delta 1. Protected alpha-core pixels changed 0 of 361,694, and the protected-isolation before/after artifact is byte-identical; each PNG has SHA-256 `e667f8a598ba999284ac7700b30f6d0a170550c5f3194087400f211fb6b08526`. The A/B contact is [SH003 treatment A/B contact](../../video/qa/episode-001-work-v01/treatment/SH003-treatment-ab-contact.png), SHA-256 `75e426f007ff310d78b4a640063faa7b2af28b22b21633de4fa8548488f2706b`; the full review ledger is [review-ledger.json](../../video/qa/episode-001-work-v01/review-ledger.json), SHA-256 `b5babbcb85bcc752af3dc11487c9df6d7a14eb552c1d48c1aacb7866a96cfd63`. These are automatic technical checks and an implemented candidate, not user visual-quality PASS or final approval. Source: [selective treatment QA](../../video/qa/episode-001-work-v01/review-ledger.json#selective_treatment_qa).

#### Route reveal and document adapter application (2026-08-29)

The route-map lesson from the chart/map references is applied in SH005 as sequential relationship drawing: `svg.stroke-draw@1` reveals the direct route at frames 101–122, then the supplementary-investigation request route at 122–143, followed by stable reading holds. The route-map SVG is a self-authored explanatory asset, not a substitute for LAW-196/LAW-1972 evidence. SH005 is provisional because those evidence claims remain blocked. Source: [SH005 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH005/manifest.json), [route-map asset sheet](../../video/public/assets/episode-001-work-v01/cuts/SH005/asset-sheet.json), [map transcript](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt).

The generic document adapters `camera.transform@1`, `mask.inset@1`, and `document.highlight@1` now exist as tested runtime capabilities, but are action-gated and do not imply that SH006 is materialized. `highlight.sweep@1` remains a separate planned treatment. SH006 is not in the current render authority; its official law candidate still needs exact crop/transcription and rights review. This is a project implementation boundary, not a claim that the reference source disclosed these helper implementations. Source: [operator registry](../../video/src/vox/motion/operator-registry.ts), [presentation renderer](../../video/src/vox/scene/PresentationScene.tsx), [episode spec SH006](../../video/episodes/episode-001/episode-spec.json).

## Important corrections to the channel's marketing language

- **“One prompt” does not mean one-pass production.** The reel transcript explicitly describes back-and-forth choreography revisions and Studio tuning. Source: [viral reel transcript, 02:05–02:31](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).
- **“No keyframes” means code-driven timing, not no timing decisions.** The tutorials repeatedly specify exact frame ranges and also discuss held frames. Source: [viral reel transcript, 05:14–06:26 and 11:28–11:37](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt).
- **Asset origin cannot be treated as irrelevant.** The reel suggests search images, generated images, or editor packs; 23jung must instead use the existing licensed/official acquisition routes and retain provenance. Source: [viral reel transcript, 03:40–04:05](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.en.vtt), [[../syntheses/media-source-strategy-v0.1]].
- **AI-generated collage is a technique demonstration, not an evidence standard.** The collage video's own description states that all assets were AI-generated. Source: [collage metadata](../../raw/inbox/mo-sidd-remotion/aSNYHAzPEKc/aSNYHAzPEKc.info.json).

## Additional local video acquisition and frame study (2026-08-31)

The six additional MoSidd videos and the separately registered `0Uxx-UrTVP0` reference were acquired as 640×360 progressive MP4 research copies using the YouTube `android` client and format 18. The original metadata or captured source note, title, duration, uploader, and URL remain the source of identity; the acquired copies are immutable study artifacts outside `raw/`. Each source has an exact start/mid/end frame triplet, a lossless RGB review clip, an overview/contact sheet, and a separate pending candidate catalog. Source: [MoSidd metadata bundle](../../raw/inbox/mo-sidd-remotion/), [0Uxx captured source note](../../raw/sources/youtube-reference-0Uxx-UrTVP0-2026-08-22.md), [aggregate catalog](../../video/qa/reference-study/additional-sources/v01/additional-motion-grammar-catalog-v01.json), [review board](../../video/qa/reference-study/additional-sources/v01/additional-reference-review-board.png).

| Video | Local copy | SHA-256 | Frame-study candidate |
|---|---|---|---|
| Y6mOBK5peDU | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/Y6mOBK5peDU.android.mp4) | `c7fa0419e50301e432b148b67dfd3d5de4a64882b09242b168148e7f3aeaf1a1` | `map-camera-continuity` |
| dv3ADYu74DE | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/dv3ADYu74DE.android.mp4) | `f4c0f717bac6c7ea3c93fbaa638a18e0a013d5d672ca36c926097bb61d821304` | `cited-chart-reveal` |
| aSNYHAzPEKc | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/aSNYHAzPEKc.android.mp4) | `71c9c00fdb5767214d1fd74dcdeace548a00fee837047e5b5b985f645e5564ab` | `layered-collage-cadence` |
| xOhh274Ayac | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/xOhh274Ayac.android.mp4) | `538b936edd16f847c5b72d3f513b55efc7ede6e2351ba755642eedfd9daac88b` | `voice-line-scene-isolation` |
| dBakc0BdHjY | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/dBakc0BdHjY.android.mp4) | `493e807a188437d6d163b2db42c12b5df7f70a8480a4c696b298f56d9f14200e` | `parameterized-graphic-inputs` |
| b7KlsXNQobs | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/b7KlsXNQobs.android.mp4) | `7ccb3068c49fca17348538fee5e9c59f5e4a1ff0114e01849f08d0765481cd8f` | `specialized-glass-module` |
| 0Uxx-UrTVP0 | [acquired MP4](../../video/qa/reference-study/additional-sources/acquired/0Uxx-UrTVP0.android.mp4) | `ed6839c20bfda2a52346e70bd9cbfa590299fb0a93df884698a6e65c91f5d647` | `narrative-scale-translation` |

The seven entries are **frame-bound candidates, not approved grammar**. The study windows are Y6m 320–340s, dv3 35–55s, aSNY 300–320s, xOhh 100–120s, dBakc 220–240s, b7Kls 170–190s, and 0Uxx 20–80s (within the captured 00:00–02:07 analysis scope). These windows were selected from the captured chapter/metadata context where available and are only temporal triage points; a human must inspect the contact and review clip before any grammar can enter the frozen contract. The aggregate and per-source catalogs therefore remain `pending-human-motion-grammar-approval`, `production_eligible=false`, and do not alter the episode's reference-calibration gate. Source: [aggregate catalog](../../video/qa/reference-study/additional-sources/v01/additional-motion-grammar-catalog-v01.json), [per-source catalogs](../../video/qa/reference-study/additional-sources/v01/).

## v02 finished-output correction (2026-08-31)

The v01 board is retained as historical evidence but is **rejected for grammar study**: several selected windows visibly showed tutorial/browser/editor/talking-head or workflow screens, so they cannot substantiate a finished-animation grammar. The v01 workflow labels `voice-line-scene-isolation` and `parameterized-graphic-inputs` are not carried forward because they describe production concepts rather than an observable finished-output action.

The v02 study reuses the same acquired bytes and selects only windows where the finished output is visibly playing, based on dense triage grids and a human inspection of the board. No source yielded zero candidates. The seven pending candidates are:

| Source | Finished-output window | Candidate |
|---|---:|---|
| Y6mOBK5peDU | 00:04 / 00:10 / 00:18 | `map-route-strike-assembly` |
| dv3ADYu74DE | 00:00 / 00:04 / 00:08 | `bar-chart-showcase-reveal` |
| aSNYHAzPEKc | 00:02 / 00:05 / 00:08 | `collage-asset-accumulation` |
| xOhh274Ayac | 00:00 / 00:06 / 00:12 | `finished-reel-collage-motion` |
| dBakc0BdHjY | 00:00 / 00:06 / 00:12 | `speaker-overlay-asset-entry` |
| b7KlsXNQobs | 00:02 / 00:10 / 00:18 | `saas-device-light-motion` |
| 0Uxx-UrTVP0 | 00:20 / 00:50 / 01:20 | `narrative-scale-translation` |

The canonical v02 aggregate is [additional-motion-grammar-catalog-v02.json](../../video/qa/reference-study/additional-sources/v02/additional-motion-grammar-catalog-v02.json), with [v02 review board](../../video/qa/reference-study/additional-sources/v02/additional-reference-review-board.png) and per-source catalogs under [v02](../../video/qa/reference-study/additional-sources/v02/). Every entry remains `pending-human-motion-grammar-approval` and `production_eligible=false`; no entry is active grammar or production authorization. The board is an observation aid, not a claim of rights or visual-quality approval.

## Ten-sample Remotion design package (2026-08-31)

The [v02 design manifest](../../video/qa/style-frames/remotion-motion-grammar-v02-design/manifest.json) and [overview](../../video/qa/style-frames/remotion-motion-grammar-v02-design/overview.md) translate only the primary locked reference candidates and additional v02 finished-output candidates into ten deduplicated inactive sample-cut designs. Each design binds exact source path, SHA-256, timecodes, frame paths/hashes, one dominant focal, semantic depth, 30fps action start/mid/end, and a 60-frame-or-longer motion-free reading hold. This is a design package, not rendered motion or a style-frame submission: `eligible_for_user_style_frame_review=false`, `production_visible=false`, `production_eligible=false`, and `active_cut_root=null`.

The package keeps the v01 sample index as historical/incomplete. It explicitly excludes tutorial/editor UI, unobserved cards/icons/effects/transitions, placeholders, and any grammar not bound to the observed catalogs. Real/official assets remain requirements to be sourced and rights-reviewed later; no design entry authorizes reuse of reference pixels. Typography/layout contract v2 is carried into every design: only text actually overlaid on a named PNG surface may rotate, while detached labels, titles, dates, quotes, and source chrome remain at 0°.

## v02-derived Remotion sample cuts (2026-08-31)

The [v02-derived catalog](../../video/qa/style-frames/remotion-motion-grammar-v02-sample-cuts/catalog.json), [review board](../../video/qa/style-frames/remotion-motion-grammar-v02-sample-cuts/review-board.png), and per-sample manifests are actual Remotion renders generated solely from the [v02 design manifest](../../video/qa/style-frames/remotion-motion-grammar-v02-design/manifest.json). Six samples render 1920×1080, 30fps, 300-frame provisional MP4s with opening/action/final-hold stills, 360×203 reduction, and a 960×1080-per-side contain side-by-side against the locked reference. Four samples are explicitly blocked because their required official inputs are absent; no unrelated substitute is rendered. Sample 06 also has a pending adjacent-pair artifact.

All candidate manifests remain `pending-human-reference-calibration-review`, `production_visible=false`, `production_eligible=false`, `active_cut_root=null`, and without PASS markers, rights approval, parity approval, grammar promotion, or Omni unlock. The local real/source-derived assets are copied with source path, source ID, license, and SHA-256; the legal evidence PNGs are derived from the SH006 official source-lock candidate. These records do not establish publication rights or user visual approval. Human inspection is still required for reference fidelity and artistic quality.

## Uncertainty and limits

- English subtitles are automatic and include transcription errors; timestamps were cross-checked against metadata chapters and visible page state where consequential.
- Default web/DASH analysis-video downloads returned HTTP 403. A 640×360 progressive Android-client copy was subsequently acquired for each of the six listed sources and is adequate for temporal triage, but it is not a high-resolution quality reference. Metadata, subtitles, thumbnails, and source hashes remain separately recorded; no published-program reuse rights are implied.
- Exact helper implementations for posterization, boil, gate weave, and the channel's prompt packs are not public in the captured sources.
- SaaS glass/refraction and Three.js techniques are optional and not required for the first political explainer.

## Frame-accurate finished-output correction (2026-09-01)

The additional-source category labels are no longer sufficient implementation authority. The [frame-accurate package](../../video/qa/reference-study/frame-accurate-motion-contract-v01/aggregate-contract.json) binds the actual acquired bytes and dense/event evidence for `Y6mOBK5peDU` `00:04–00:18`, `xOhh274Ayac` `00:00–00:12`, `dBakc0BdHjY` `00:00–00:12`, and `b7KlsXNQobs` `00:02–00:18`. Source identity and URL: [captured MoSidd metadata](../../raw/inbox/mo-sidd-remotion/); visual observations: the cited local MP4 intervals and their per-sample contacts under the frame-accurate package.

- The map source is a montage of geographic reframes/cuts plus registered border, flag, aircraft, strike, and path overlays; it is not evidence for an arbitrary single-map zoom-and-wipe. Source: [Y6m metadata](../../raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.info.json), [sample 04 contract](../../video/qa/reference-study/frame-accurate-motion-contract-v01/sample-04-map-route-reframe/contract.json).
- The reel source has three operator segments: speaker-side overlay cards, a horizontal gallery strip, and kinetic title replacement joined by hard cuts. Source: [xOhh metadata](../../raw/inbox/mo-sidd-remotion/xOhh274Ayac/xOhh274Ayac.info.json), [sample 07 contract](../../video/qa/reference-study/frame-accurate-motion-contract-v01/sample-07-hook-reel-collage-montage/contract.json).
- The speaker source keeps the presenter’s editorial placement while small supporting icons enter independently; live-action body motion is classified as source-footage internal motion. Source: [dBakc metadata](../../raw/inbox/mo-sidd-remotion/dBakc0BdHjY/dBakc0BdHjY.info.json), [sample 08 contract](../../video/qa/reference-study/frame-accurate-motion-contract-v01/sample-08-speaker-supporting-overlay-entry/contract.json).
- The SaaS source’s transferable device grammar is only the early phone/dashboard segment. The later money/clock montage is boundary context and cannot be used as phone-state proof. Source: [b7K metadata](../../raw/inbox/mo-sidd-remotion/b7KlsXNQobs/b7KlsXNQobs.info.json), [sample 09 contract](../../video/qa/reference-study/frame-accurate-motion-contract-v01/sample-09-device-light-focal-motion/contract.json).

All four remain research-reference-only and pending human grammar review; the 640×360 acquired copies establish timing, not publication rights or high-resolution appearance.
