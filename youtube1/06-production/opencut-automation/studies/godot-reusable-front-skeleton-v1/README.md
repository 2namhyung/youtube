# Godot reusable front skeleton study v1

Private, non-publishable validation of one `Skeleton2D`/`Bone2D` hierarchy driving two appearance packs. The images are review candidates and do not replace the approved three-quarter character authority.

- Engine: official portable Godot 4.7.1 stable Windows build.
- Geometry: one fixed front-view joint map.
- Art: Pack A and Pack B are automatically cut into the same named raster slots.
- Motion: one GDScript curve rotates only shared `Bone2D` nodes for three seconds.
- Render target: 1080x1920, 24 fps, 72 frames per pack.
- No ImageGen frame interpolation, pose swapping, provider call, upload, or publication.

This PoC tests technical skeleton reuse. It does not certify final artwork quality. Visible shoulder/elbow seams, thickness changes, or tearing fail the art-preparation gate and require improved hidden-fill artwork rather than different motion code.

## Result

The same runtime skeleton and gesture curve successfully render Pack A and Pack B. The validated automatic-cut envelope is deliberately small: right upper arm 7 degrees and forearm 16 degrees. This supports breathing, attention shifts, pointing preparation, and restrained explanatory gestures without regenerating frames.

It does **not** make arbitrary ImageGen character sheets fully riggable. Large reaches, overhead motion, turning, walking, and hand-object interaction require purpose-authored separated parts with hidden shoulder/elbow fills. Those are appearance-pack inputs; the skeleton and animation library remain reusable.

Run `node verify-study.mjs` to verify physical outputs, hashes, dimensions, FPS, frame count, duration, engine logs, private status, and the declared safe motion envelope.
