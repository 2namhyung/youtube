# Joint source-window T3 candidate — 2026-09-06

## Result

`joint-windows-1.80x-13s.mp4` is a provisional full-length candidate using
the selected per-city source starts below. The original T3 candidate and all
performance takes are preserved.

| city | source start | output role |
|---|---:|---|
| Seoul | 2.500s | 3.5–6.5s, outgoing overlap through 7.0s |
| Tokyo | 1.625s | 6.5–9.0s, outgoing overlap through 9.5s |
| Shanghai | 2.750s | 9.0–11.0s, outgoing overlap through 11.5s |
| Hanoi | 6.000s | 11.0–13.0s |

All person sources use external 1.80× playback. Card timing, card geometry,
mask/matte, fixed camera/layout, and 13-second audio timing are inherited.
There are no loops, freezes, padding, or frame-level repairs.

## Why these anchors

Tokyo 1.625s was selected from the Seoul outgoing 7.900s comparison while
retaining its useful umbrella action. With that start, Tokyo's outgoing source
edge at the next transition is 6.125s, so Shanghai was re-evaluated against
that actual pose. Shanghai 2.750s showed a more advancing first state than the
near-feet-together 2.500s candidate. Propagating that change moves Shanghai's
outgoing edge to 6.350s; Hanoi 6.000s continued the next advancing foot more
cleanly than 5.750s in the bounded comparison.

## QC status

The candidate is technically verified at 720×1280, 24fps, 312 video frames,
13.000s, with full FFmpeg decode passing. The prior T3 SHA-256 remains
`63041b7225fad09a25d296329a59e2f771280ed1b88bd6ab404aacf441cb94c3`.

This is **not T3 PASS**. Seoul→Tokyo still has a visible shoe/stance jump at
the reveal. Garments and the rising card hide portions of the feet, so those
frames are `NOT_MEASURABLE`; no anatomical contact timing is inferred.

## Evidence

- [Full 13-second candidate](joint-windows-1.80x-13s.mp4)
- [Corrected Seoul→Tokyo foot sheet](compact-seoul-tokyo-first12.jpg)
- [Corrected Tokyo→Shanghai A/B sheet](compact-tokyo-shanghai-first12.jpg)
- [Corrected Shanghai→Hanoi chain sheet](compact-shanghai-hanoi-first12.jpg)
- [Machine-readable metadata](joint-windows-metadata.json)
