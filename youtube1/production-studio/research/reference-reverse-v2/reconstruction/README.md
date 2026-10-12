# `VQazcEuV9Xw` motion-structure reconstruction v2

This is a standalone local research demo for two bounded intervals of the
reference Short. It is not a production asset, similarity claim, or approval.

The own render uses the reference's 30000/1001 fps timebase and draws the
field, farmer, drone, robot, metal ladle-like prop, and glitch marks as SVG in
`src/scene.jsx`. It does not reuse source pixels or extracted character assets.
The 360x338 local scene, including its background, is clipped and scaled into
the same 540x507 central viewport as the reference excerpt. The drone and
farmer are one transformed parent group; both hands use the same lower-bar
anchor above the head. The farmer begins outside the viewport and finishes
fully visible while the drone top is partially cropped. The robot keeps its
mouth inside its head, raises a shoulder-connected index arm on viewer-left,
and receives the left-entering ladle above its head. Runtime parameters are
read directly from `config/motion-parameters.json` by `src/scene.jsx`.

## Render without installing packages

The renderer reuses Remotion `4.0.508` and its installed CLI from the existing
`generic-character-motion-test-v1` study. From this directory:

```powershell
node scripts/render.mjs
node scripts/record-manifest.mjs
```

Outputs are silent and local-only. The viewer consumes `output/comparison.mp4`:

- `output/reconstruction-only.mp4` — own SVG reconstruction only.
- `output/comparison.mp4` — original analysis clips on
  the left and the own reconstruction on the right.
- `output/manifest.json` — source/output hashes, byte counts, ffprobe records and
  explicit false production/promotion gates.
- `output/comparison-contact.jpg` — decoded frames 0, 40, 80, 102, 103, 130,
  142, 232, 250 and 262, each labelled with its output timestamp.

The predecessor with incorrect cropping and character geometry is preserved
under `output/rejected-20260923-geometry-v1/`; it is not an active result.

The reference input is read from the immutable v1 source and is never copied
into this directory or published. Review contact sheets and sample frames
manually; this study deliberately makes no automated similarity-pass claim.
