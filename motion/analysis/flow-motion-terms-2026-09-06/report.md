# Flow card timing comparison

Generated from native decoded frames; sources were not modified.

## Measurement boundary

The tracked edge is the top of the strongest elongated pink stripe (`pink_stripe_top_proxy`) on the white Seoul card. It is a visible colored-stripe proxy, not a recovered white-card boundary or a claim about Flow internals.

All A/B/C rows use the same decoded frame index. The comparison videos use the common prefix only; no optical-flow interpolation is introduced.

## Inputs

- **A:** `A.mp4`, 720×1280, 24 fps, 96 frames, SHA-256 `171bf8f1a2a93fd34c03af32256e2e7f6120e5be2defaf253fcf696e5367ab54`
- **B:** `B.mp4`, 720×1280, 24 fps, 96 frames, SHA-256 `650c4a13c30886eb22cf708abc446d74fff526ef5cadf73bf209e7fca7813d7f`
- **C:** `C.mp4`, 720×1280, 24 fps, 96 frames, SHA-256 `95b88800b24414a3a1218c2bfc466c51d36ba27b5c33118206017cfd44c14972`

Common frame count used for same-index comparison: `96`.

## Observations

### A

- Detected `59/96` frames; proxy moved upward `1020 px` from y=1096 (F37, 1.542s) toward final y≈76 (F95).
- Stable-width onset: F39 (1.625s); earlier detections are retained but flagged for stripe-width drift.
- First sustained settled proxy (within 2 px of final for the remaining detected frames): F59 (2.458s).
- Largest measured one-frame speed: `1728.0 px/s` after F43→F44 (midpoint 1.812s).
- Scale-drift flag (>15% from this clip's median stripe width): `2` frames.
- Detector failures/ambiguities: `37` frames; see `failure` and `bbox` in `a-measurements.csv`.
### B

- Detected `62/96` frames; proxy moved upward `1008 px` from y=1084 (F34, 1.417s) toward final y≈76 (F95).
- Stable-width onset: F35 (1.458s); earlier detections are retained but flagged for stripe-width drift.
- First sustained settled proxy (within 2 px of final for the remaining detected frames): F55 (2.292s).
- Largest measured one-frame speed: `1776.0 px/s` after F38→F39 (midpoint 1.604s).
- Scale-drift flag (>15% from this clip's median stripe width): `1` frames.
- Detector failures/ambiguities: `34` frames; see `failure` and `bbox` in `b-measurements.csv`.
### C

- Detected `59/96` frames; proxy moved upward `968 px` from y=1044 (F37, 1.542s) toward final y≈76 (F95).
- Stable-width onset: F37 (1.542s); earlier detections are retained but flagged for stripe-width drift.
- First sustained settled proxy (within 2 px of final for the remaining detected frames): F52 (2.167s).
- Largest measured one-frame speed: `2832.0 px/s` after F41→F42 (midpoint 1.729s).
- Scale-drift flag (>15% from this clip's median stripe width): `1` frames.
- Detector failures/ambiguities: `37` frames; see `failure` and `bbox` in `c-measurements.csv`.

## Visual interpretation uncertainty

In the sampled contact sheet, the visible right pink rail and the Seoul card's text/barcode layout remain visually consistent after entry, and the measured rail top is monotonic for each clip. That is consistent with a slide-like result.

This evidence cannot distinguish an independently translated rigid card from a generated dissolve/morph that happens to preserve the rail. The proxy tracks one colored feature only; it does not establish pixel identity, layer independence, or absence of hidden blending. Treat independent-slide versus dissolve/morph as unresolved and inspect the full normal/half-speed comparisons.

## Artifacts

- `contact-sheet-same-frames.jpg` — sampled same-index frames.
- `transition-contact-sheet.jpg` — denser same-index frames around the observed card movement.
- `comparison-normal.mp4` and `comparison-half-speed.mp4` — three columns A/B/C.
- `normalized-edge-progress.png` — normalized proxy progress curves.
- `edge-displacement.png` — absolute per-frame displacement speed curves.
- `measurements.json` and `*-measurements.csv` — rows, failures, confidence, and scale diagnostics.

Timing-only scope: this run does not assess people, acting, image quality, or unsupported Flow capabilities.
