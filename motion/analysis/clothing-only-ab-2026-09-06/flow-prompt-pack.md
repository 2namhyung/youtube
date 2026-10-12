# Clothing-only Flow A/B test

Status: prepared; do not render or assemble until the new B output has been downloaded.

## Test purpose

Compare the existing Tokyo performance edit (A) against a new edit (B) made from the same canonical hanbok source, with the same kimono reference, but with no newly requested parasol, glance, smile, or other independent upper-body performance. The test isolates whether those extra acting requests were contributing to residual gait drift. This is a screening comparison against a historical render, not a causal experiment: Flow generations are stochastic.

## B — new clothing-only edit prompt

Input source: `C:/Users/every/Documents/project/motiongraphic/production/ticket-travel/performance-v2/canonical-hanbok-10s.mp4`

Reference image: `C:/Users/every/Documents/project/motiongraphic/production/ticket-travel/assets/locked-keyframes/K2-tokyo-kimono.png`

Paste this prompt into Flow:

```text
Edit this entire 10-second source video so the same woman wears the pale pink floral kimono and obi shown in the supplied reference image. Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed and direction. Do not restart, slow down, pause or replace the walk with smaller kimono-style steps. Let the kimono fabric accommodate the existing leg movement. Keep her facial identity, short bob hair, body proportions, screen position and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting. Preserve the source video's original upper-body behavior exactly: keep the original arm motion, hand positions, head direction, gaze direction, facial expression and handheld pouch, including their timing and motion. Do not add a parasol, umbrella, glance, smile, head turn, pose change or any other independent performance. Keep the pelvis orientation and uninterrupted walk. Keep everything else the same. Use the supplied reference only for the kimono and obi fabric, color, cut and garment design; do not copy or add its boarding pass, ticket, text, border, umbrella, parasol, accessory or hairstyle. The kimono is already worn from the first frame to the last: no wardrobe transformation, transition or cut.
```

## A — existing historical edit

Existing output: `C:/Users/every/Documents/project/motiongraphic/production/ticket-travel/performance-v2/tokyo-parasol-10s.mp4`

Historical prompt, preserved verbatim from `production/ticket-travel/performance-v2/long-variant-prompts.md`:

```text
Edit this entire 10-second source video so the same woman wears the pale pink floral kimono and obi from the reference. Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed and direction. Do not restart, slow down, pause or replace the walk with smaller kimono-style steps. Let the kimono fabric accommodate the existing leg movement. Keep her facial identity, short bob hair, body proportions, screen position and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting. Give her a natural independent upper-body performance: carry an open Japanese paper parasol tilted over one shoulder. Between seconds 3 and 5, lightly adjust its handle, glance sideways beneath the canopy and give a faint relaxed smile, then look ahead. Arms, hands, head and facial expression may differ from the source, but keep the pelvis orientation and uninterrupted walk. Remove the original pouch. Use the reference only for kimono, obi and parasol design; do not add its boarding pass, text, border or hairstyle. She wears the kimono from the first frame to the last. No wardrobe transformation, transition or cut.
```

## Fixed comparison setup

- Use the same 10-second source-clock assembly as the previous Seoul→Tokyo A/B test.
- Outgoing Seoul source start: `2.5 s`.
- Card boundary: global `6.5 s`; card transition: `0.5 s`.
- Incoming Tokyo source start: `7.9 s` for both A and B (same-source-time mapping).
- Use person sampling factor `1.80x`; diagnostic interval global `6.0–7.5 s`, 36 frames at 24 fps.
- Keep ticket artwork, camera, geometry, mask, encoding and audio treatment unchanged.
- Compare B against A with identical global timing. Do not compare a new B rendered at a different source start to A in this test.

## Expected interpretation

If B has smaller foot-phase, head-direction or body-silhouette drift at the card boundary, the additional acting request was a likely contributor. If B's lower-body phase is still different, the remaining error is attributable to Flow's clothing edit/render variance or the compositing boundary; do not claim that the prompt guarantees identical gait.
