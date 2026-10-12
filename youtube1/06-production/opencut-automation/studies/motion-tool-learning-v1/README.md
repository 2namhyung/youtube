# Motion tool learning v1

This study is an offline, authored reconstruction curriculum for six pinned deterministic motion engines. It contains ten neutral topics per engine (60 samples total). Official documentation links are provenance only; no example asset, fixture, template, or code is copied.

The fixed contract is 972×972, 24 fps, 48 frames (2 seconds), network blocked, frame-seek capture, and FFmpeg as the final encode/mux/QC boundary. Each sample records an expected and measured numeric signature for timing, path progress, transform/occupancy, state/layer order, and effect/easing. A sample passes at 90/100 or above; a tool succeeds only when all ten samples pass.

Run a two-topic smoke first:

```powershell
node studies/motion-tool-learning-v1/generate-motion-tool-learning.mjs 2 out/studies/motion-tool-learning-v1-smoke
```

Generate the full set and verify it:

```powershell
node studies/motion-tool-learning-v1/generate-motion-tool-learning.mjs 10 out/studies/motion-tool-learning-v1
node studies/motion-tool-learning-v1/verify-motion-tool-learning.mjs out/studies/motion-tool-learning-v1
```

The output contains sample JSON, first/mid/last PNG triplets, six tool contact sheets, an immutable manifest, and an overall report. Failed attempts remain preserved under their output root; do not overwrite them with a successor attempt.
