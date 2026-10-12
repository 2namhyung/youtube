# Rive character arm PoC v1

- Status: `private-editor-import-ready / production-unapproved`
- Purpose: verify the reference-derived `torso / continuous sleeve arm / rigid hand` hierarchy in Rive Editor before any full-character animation.
- Parent design: [organic mesh study](../rive-character-organic-mesh-sheet-v1/README.md).

## Implemented structure

The import pack contains five physical 1024x1536 RGBA layers with the same origin: an arm-free torso, one continuous shoulder-to-wrist sleeve per side, and one relaxed hand per side. Draw order is `arms -> torso -> hands`, so the torso armholes cover only the shoulder roots and never draw a second sleeve.

The manifest fixes `root/spine`, bilateral `shoulder/elbow/wrist` joints, exact layer hashes, origins, bounds, semantic roles and Rive mesh intent. The two arms are the only deforming raster meshes. Hands remain rigid children of wrist bones.

## Rive Editor procedure

1. Create artboard `char_anon01_front`, 1024x1536.
2. Import all five `import-layers/*.png` at x=0, y=0 without resizing.
3. Set hierarchy/draw order exactly as `rive-import-manifest.json`.
4. Create the bones at the manifest joint coordinates.
5. Add a custom mesh to `arm_l`; keep the contour close to the visible sleeve and add interior vertices around shoulder and elbow.
6. Bind `arm_l` to `shoulder_l`, `elbow_l`, and `wrist_l`. Blend neighboring weights at shoulder/elbow; total vertex weight remains 100%.
7. Parent `hand_relaxed_l` rigidly to `wrist_l`.
8. Test only three poses: rest, 35-degree explain gesture, 65-degree point preparation. Do not build a full animation yet.
9. Repeat on the right only after the left arm passes 200% seam, outline, thickness and rest-return review.

Rive documents mesh creation, interior vertices, bone binding and 100% blended weights in [Meshes](https://rive.app/docs/editor/manipulating-shapes/meshes) and [Bones](https://rive.app/docs/editor/manipulating-shapes/bones), checked 2026-08-13.

## Current boundary

Local automation can generate and validate the import pack, but Rive does not publish a Windows/Node authoring CLI for creating Editor mesh contours and painting weights. A real `.riv` file therefore requires the Rive Editor step above. The current outputs are not an animation and are not production authority.

The Rive Editor was opened on 2026-08-13 and stopped at its sign-in screen. No credentials were entered and no `.riv` file was created. After the owner signs in, the first editor gate is limited to importing these five layers and rigging only the left arm; the right arm and animation remain blocked until the three-pose seam review passes.

Run:

```powershell
python .\build_import_pack.py
python .\validate_import_pack.py
```
