# M1 local translation-curve candidate

The user accepted the preceding joint-window gait result and authorized the next card-motion improvement. This experiment does not regenerate Flow performances or replace the accepted baseline.

- Baseline: [accepted joint-window 13s](../t3-joint-windows-2026-09-06/joint-windows-1.80x-13s.mp4).
- Changed: vertical card translation progress, and therefore the time its edge reveals the next outfit.
- Preserved: exact person source-clock formulas and windows, 1.80x outfit playback, 1.0x intro playback, 0.5s transitions, rotation and blur time curves, ticket artwork, complementary-mask algorithm, Hanoi green matte, audio and 13s timeline.
- Curve source: [measured reference edge](../elasticity-lifelike-2026-09-06/ticket-edge-candidate.json), frames 130–144. Normalized monotone PCHIP interpolation is a design candidate derived from a visible-edge proxy, not recovered original keyframes or proof of reference identity.
- Important: preserving source clocks does not guarantee that a different reveal instant preserves perceived gait continuity. Inspect every transformation before promotion.

## Outputs

- [13s candidate](card-curve-candidate-13s.mp4)
- [4s comparison, previous left / candidate right](before-after-seoul-tokyo-4s.mp4)
- [Same-time transition frames, previous top / candidate bottom](transition-contact.jpg)
- [Technical verification and hashes](metadata.json)

## Verification

Run `render_candidate.py` with the configured Hermes Python interpreter. It checks a monotone endpoint-bounded curve, preserves the baseline hash, renders the candidate once, performs full FFmpeg decode on both MP4s, and asserts 720x1280 / 24fps / 312 frames / 13s. This isolated media folder has no repository diagnostic suite; application-wide builds are out of scope. Visual/user approval is separate from these technical checks.

The new progress affects all four card boundaries. No original production files were edited.
