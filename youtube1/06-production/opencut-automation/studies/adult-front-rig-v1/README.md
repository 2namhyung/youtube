# Adult front rig study v1

Private, non-publishable front-view reusable-rig study. It does not replace the approved three-quarter `generic-anonymous-adult-01` authority.

- Pack A is a front-view derivative of the approved anonymous adult.
- Pack B changes hair, face and wardrobe while retaining the same front pose and normalized alpha bounds.
- Both candidates use one declared joint map in `front-rig-spec.json`.
- The validator binds physical nonsymlink files, hashes, canvas size and normalized alpha bounds.
- This stage proves asset normalization only. It does **not** yet prove that large acting motions survive one shared OpenToonz Plastic skeleton.

## Texture-swap result

The direct flattened-raster swap failed. The validated earlier `.tnz`/`.mesh` scene was copied, its adjacent PNG was replaced with Pack A, and OpenToonz `tcomposer.exe` rendered frames 1–72. The output still showed the old three-quarter character, proving that this Plastic mesh embeds or binds the old texture. The output under `out/studies/adult-front-rig-v1/pack-a/` is retained as failure evidence, not as a character preview.

Next gate: split both packs into the same overlapping head/torso/upper-arm/forearm/hand/thigh/shin/foot layer contract with hidden fills. Reuse joint coordinates and motion keys across equivalent layers/columns, not the embedded mesh texture. Render one identical 72-frame action from both packs and compare joint silhouettes. If either pack tears, changes limb thickness or exposes a hinge, reject it.
