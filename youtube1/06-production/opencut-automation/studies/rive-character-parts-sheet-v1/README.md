# Rive character parts sheet v1

- Status: `design-review / needs-repair / production-unapproved`
- Generated: 2026-08-13 with the built-in ImageGen tool.
- Design authority reference: `production/motion-assets/generic-character-poc-v1/master-approved-v1.png`
- Authority SHA-256: `4f7717edcdda6eab8abcd6314056f98176b68e360a45a585cb83b25d7e859a56`
- Chroma source SHA-256: `7e0e8c35f397f21ba13c5e225cea8aa2feefeab076681a166920e90b221c2500`
- Alpha derivative SHA-256: `66666b19dc64a63131c4af8580264bf855bc4bbd59685a80e68ed3fec8c1446b`
- Dimensions: 1536x1024.

Corrected v2 was generated after the first mechanical review:

- v2 chroma SHA-256: `c27fc3d4310691ee40cf6c1c7589993af692481d8083da2dc235885497c33916`
- v2 alpha SHA-256: `36cd7967c3a512bdf7c004d335baa60796a358e8d40dde4d3f54478550dc2540`
- v2 keeps all 24 cells occupied and removes the ears from back hair and skin wrists from forearm pieces.
- v2 still fails a 16-pixel cell-boundary safety inset in cells `1,1`, `1,2`, `1,4`, `3,1`, `3,2`, `4,1`, `4,2`, and `4,3`.
- v2 pelvis still reads as shorts rather than a compact waist/hip bridge.

## Intended contents

The 6x4 sheet requests 24 isolated front-view rig elements: head, back/front hair, torso, pelvis, neutral eyes, bilateral upper arms, forearms and relaxed hands, bilateral open hands, one pointing hand, bilateral thighs, blink eyes, bilateral shins and feet, neutral mouth and concerned/speaking mouth.

The prompt required identical bilateral scale, consistent outline width, opaque joint underlap, no hinge graphics, no labels, and no assembled full character. The green source was converted to RGBA with the ImageGen skill chroma-removal helper.

## Visual review

The sheet is not rig-ready and must not be admitted as a production appearance pack.

- Pass: one-page 6x4 layout, 24 occupied cells, front-oriented parts, no inter-cell overlap, approved navy/ivory/charcoal palette, usable RGBA extraction.
- Fail: the back-hair cell contains ears and therefore is not an independent hair layer.
- Needs repair: the torso shoulder ends resemble closed sleeve caps rather than clean torso underlap geometry.
- Needs repair: the pelvis reads as shorts and must be checked against the trouser-thigh assembly.
- Needs measurement: bilateral limb length/thickness, joint underlap, pivot compatibility, and outline continuity have not been mechanically validated.

The second full-sheet attempt improved semantic separation but remains `needs-repair`. Further full-sheet regeneration is stopped because it can drift already-correct cells. Repairs must now be cell-local and preserve the v2 page coordinates.

## v3 cell-local repair and deterministic normalization

Only the torso and pelvis were regenerated on a two-item repair plate. The other 22 v2 parts were preserved. `build_parts_v3.py` then extracted the 24 semantic groups, replaced only those two parts, centered every attachment into a 256x256 RGBA cell with a 24-pixel safety inset, wrote 24 physical PNG files, rebuilt the 1536x1024 atlas and produced a neutral front static assembly.

- v3 atlas SHA-256: `69f2eaa81ca05e81c22d7b3392e58b75a009ede196034ff2fd692d82c93fe065`
- static assembly SHA-256: `11d467097ef11f174a1ef4993cc81dc6aecfb73b19521bb10d5db1659b605015`
- repair chroma SHA-256: `86f779d3d6c2f7ef1a5edb11d8e127ec2e39c0e0dfdaf20b9505062d51be8621`
- repair alpha SHA-256: `48109bac7c3d77e0380779ed8437a0428f78a5568821ee7a5b9f7625ff8dd07a`
- mechanical result: 24/24 parts, all 24-pixel safe-inset checks pass, all files are physical nonsymlinks, hashes pass.
- visual result: neutral assembly is coherent enough for human design review; Rive mesh, weights, pivots and motion remain untested.

The status remains `private-review-candidate / production-unapproved`. Human approval of the static design is required before authoring a Rive artboard.

Next gate: repair only the failed cells while keeping the same 6x4 coordinates, then split cells into physical PNG attachments and validate transparent bounds, pivots, underlap, mirrored dimensions and a static front assembly. No Rive mesh, animation, export, upload or production promotion is authorized by this sheet.

## Files

- `source/rive-character-parts-sheet-v1-chroma.png`: immutable ImageGen output copy.
- `source/rive-character-parts-sheet-v1-alpha.png`: local chroma-key derivative for visual inspection only.
- `source/rive-character-parts-sheet-v2-chroma.png`: corrected full-sheet ImageGen output.
- `source/rive-character-parts-sheet-v2-alpha.png`: corrected RGBA inspection derivative.
- `source/torso-pelvis-repair-v1-{chroma,alpha}.png`: cell-local repair source and derivative.
- `source/rive-character-parts-sheet-v3-alpha.png`: deterministic 24-cell review atlas.
- `source/rive-character-static-assembly-v1.png`: neutral front assembly for proportion/seam review.
- `parts-v3/*.png`: 24 physical 256x256 RGBA attachments.
- `build_parts_v3.py`, `validate_parts_v3.py`, `parts-v3-report.json`: reproducible builder, strict validator and hash report.
