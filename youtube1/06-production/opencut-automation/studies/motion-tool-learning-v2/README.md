# Motion tool learning v2 (successor)

v1 is retained as a rejected attempt. v2 is append-only and writes to `out/studies/motion-tool-learning-v2b`.

The generator is invoked with `MOTION_LEARNING_VERSION=2`; measured signatures are computed from decoded PNG pixels (colored-pixel occupancy and bounding boxes), never copied from expected signatures. Every sample records the pinned package/hash, invoked frame-seek API, blocked-network assertion, and frame seek times. Ten mechanics per tool are named explicitly and each sample has a distinct mechanic ID.

```powershell
$env:MOTION_LEARNING_VERSION='2'
node studies/motion-tool-learning-v1/generate-motion-tool-learning.mjs 10 out/studies/motion-tool-learning-v2-successor
node studies/motion-tool-learning-v1/make-contact-sheets.mjs out/studies/motion-tool-learning-v2-successor
node studies/motion-tool-learning-v1/verify-motion-tool-learning.mjs out/studies/motion-tool-learning-v2-successor
```
