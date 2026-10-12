# Reference-v3 newsroom runbook

## Canonical contract

`reference-v3` is locked to 1080×1920 at 30 fps. It uses a black 474/972/474 layout, a centered 1080×972 `cover` image band at y=474, 12 balanced scenes, and image-first selection. Title line 1 is Noto Sans KR bold 120px at y=201 in `#27D3E8`; line 2 is 143px at y=326 in white. Captions use Noto Sans KR 800, 88px, white, a 5px black outline, x=540, y=1400, safe width 920, ScaleX 94, and at most two lines with line height 1.08.

Narration is locked to speech tempo 1.0106, terminal pause 0.62 seconds, semantic pause 0.30 seconds, join safety 0.005 seconds, with silence removal enabled. Explicit project values may be supplied, but newsroom-generated projects always write these canonical values.

Legacy jobs may retain `reference-v3-semantic-2line`; new editorial-cartoon jobs use `information-delta-v14-white-on-black-2line`. The machine-readable segmentation contract is authoritative in `knowledge/wiki/concepts/caption-generation-rules.md`. Producer validation rejects drift, and calibrated libass measurement minimally splits only cues that exceed the safe width.

The Jeju approved baseline is:

- render/handoff version `msd9973q-34604-9llgdn`
- OpenCut project `0986312f-e8a4-4354-8725-9134e71e247c`
- 50.8 seconds, 1,524 frames, 36 editable captions, and 12 `canonical-v2` images
- AI reconstruction disclosure is right-aligned at `x=w-tw-72`, exactly 40 pixels left of the original 32-pixel right margin; the editable OpenCut text layer uses center X `810`
- narration approved AAC SHA-256 `58e4d9d1bcfb04790953556b1fbf9f873386eb1dd978191e28853f593f554649`
- BGM A source SHA-256 `9fe2ddabf1a7274706c3888ecd3316dcfef7447eb4b211617dd512762709c899`, mixed at `-16 dB`, ducked under narration, with 1.2-second fades
- approved thumbnail: `reference-v3-scene-02-layout-caption-free`, SHA-256 `55eebc7a231c87295884943b769c2f97fec5c1fadade2be0c2b441952b47ed38`, copied byte-for-byte to the registry and handoff `thumbnail.png`

The exact image order, hashes, repair pause, BGM contract, and audio hash live in `production/projects/jeju-school-intrusion-short-v1/canonical-baseline.json`. The prior approved narration is recoverable at `03-script-voice/quarantine/20260803-pre-canonical-promotion/approved-narration`; restore that directory and the prior manifest hash to roll back. Do not make an intermediate render latest.

## Newsroom UI

From `opencut-automation`:

```text
npm run dev:newsroom
```

Open `http://localhost:3002/newsroom` (or the port printed by the server), then:

1. Collect candidates.
2. Create and edit the seven-section draft.
3. Resolve every verification marker or explicitly acknowledge the exception.
4. Approve only images whose rights were checked, then start the private render.
5. Open the completed handoff in OpenCut. The same producer contract supplies 12 image clips, exact narration audio, two title tracks, captions, and the final MP4 fallback.
6. Use `/renders` for the registered final and `/projects` for the matching editable handoff.

## CLI

Use the same deterministic newsroom commands:

```text
npm run newsroom:cli -- candidates --query "사회 안전" --limit 24
npm run newsroom:cli -- draft < candidate.json
npm run newsroom:cli -- render --job <job-id>
```

`render` requires the job request produced by the UI/API because editorial approval and media-rights acknowledgement are human decisions. It invokes the normal producer with `--no-register`; the private render now receives the same canonical image/audio/title/caption handoff automatically. `refresh-image-handoff.mjs` is retained only as source history for the completed baseline migration. Do not invoke it in normal production: changing the pinned baseline requires a deliberate new golden file, full review, and coordinated latest-pointer update.

For a directly configured project:

```text
npm run short:produce -- --project production/projects/<id>/project.json --ffmpeg-executable <absolute-ffmpeg-path> --ffprobe-executable <absolute-ffprobe-path> --python-executable <absolute-python-path> --edge-tts-executable <absolute-edge-tts-path>
```

Explicit `scenes` preserve their order. Without explicit scenes, images are preferred over videos and cycled deterministically to 12 balanced scene slots.

## Verification

```text
npm run test:canonical
```

Optional live and full render smokes:

```text
npm run test:newsroom -- --live
npm run test:newsroom -- --render-smoke
```

The canonical test includes a bounded private newsroom render. It fails if the producer cannot generate the 12-scene editable handoff, if the latest pointer moves away from the baseline, any original image byte changes, scene order or frame allocation changes, cue text/timing changes, audio changes, or the reference-v3 visual/narration tokens drift.
