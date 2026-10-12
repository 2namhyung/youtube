# Final sequence v1 — strict 13-second renderer

This directory is a separate final-sequence scaffold. It does not modify
`synced-transition-v1` or `synced-transition-v2`.

The current MP4/contact files are v1 review outputs regenerated after
integrating the frozen `hanoi_matte.py` helper; they are not final-approved
green-screen outputs. The helper is used only for Hanoi actor mattes.

## Locked timeline

The output is 312 frames at 720x1280, 24fps (13.000s):

| Master time | Branch | Ticket | Source frame rule |
| --- | --- | --- | --- |
| 0.0–3.5s | intro | white studio | intro frame `t*24`, trimmed before 3.5s |
| 3.5–6.5s | Seoul | `01-seoul-ticket.png` | card time `t-3.5`, exact master index |
| 6.5–9.0s | Tokyo | `02-tokyo-ticket.png` | exact master index |
| 9.0–11.0s | Shanghai | `03-shanghai-ticket.png` | exact master index |
| 11.0–13.0s | Hanoi | `04-hanoi-ticket.png` | exact master index |

Each card change starts at its branch boundary and uses a 0.5s v2-style
bottom-up transition. The incoming card has the chosen tunable `-5°` initial
tilt, eases upright, and gets only narrow local directional softness plus
backing/stack/shadow. The actor remains in fixed screen space; the card body
silhouette excludes PNG white margins, and complementary old/new mattes follow
its slanted top edge. Hanoi's white ao dai is treated through the source matte,
including its fabric/interior gaps; it is never replaced with a blank plate.

## Required provenance inputs

The renderer uses these exact local paths:

- `../performance-v2/intro-casual.mp4` — expected 4s casual intro; trim to 3.5s.
- `../performance-v2/canonical-hanbok-10s.mp4` — Seoul branch; generated from the
  canonical 10s prompt recorded in [`../performance-v2/README.md`](../performance-v2/README.md).
- `../performance-v2/tokyo-parasol-10s.mp4` — Tokyo 10s performance variant.
- `../performance-v2/shanghai-fan-10s.mp4` — Shanghai 10s performance variant
  (the older `shanghai-fan.mp4` remains a 4s probe).
- `../performance-v2/hanoi-hat-10s.mp4` — Hanoi 10s performance variant (the
  older `hanoi-hat.mp4` remains a 4s probe).

An optional saturated-green Hanoi plate may be selected explicitly with
`--hanoi-greenscreen`; it is never substituted automatically. For example:

```powershell
python .\render_final_sequence.py --hanoi-greenscreen ..\performance-v2\hanoi-hat-greenscreen-10s.mp4
```

That flag applies a narrow chroma-key matte only to Hanoi and keeps the source
RGB for opaque white fabric. If the explicit path is missing or invalid, the
renderer fails its required-input check; the default white-source render is
unchanged. Other branches always retain their existing mattes.

Existing Flow provenance and prompts are recorded in
[`../performance-v2/long-variant-prompts.md`](../performance-v2/long-variant-prompts.md)
and summarized in [`../performance-v2/README.md`](../performance-v2/README.md). No unavailable
variant is silently looped, stretched, retimed, or replaced by a blank/person
still: the script refuses to render until all expected inputs are 720x1280,
24fps, and at least 240 frames. All five required inputs are now present and
checked at 720x1280/24fps, with 96 intro frames and 240 frames per 10s branch.

## Audio and verification

The script writes a generated PCM WAV temporarily with original low-level
heartbeat pulses, short tonal slide accents at 3.5/6.5/9/11s, and a small
ending tail inside the 13s endpoint, then muxes it as AAC. No copyrighted audio
is used. This is an original sound sketch, not a finished music mix. The
temporary WAV is retained as provenance (`final-sequence-v1-procedural-audio.wav`).

Run when all inputs are ready:

```powershell
python .\render_final_sequence.py
ffmpeg -hide_banner -loglevel error -i .\final-sequence-v1.mp4 -f null -
ffmpeg -hide_banner -loglevel error -i .\final-sequence-v1-half-speed.mp4 -f null -
```

The renderer also runs full ffmpeg decode checks and validates output frame
counts/metadata. Half-speed is 26s with the same 312 video frames at a 12fps
timeline and slowed original
procedural audio.
