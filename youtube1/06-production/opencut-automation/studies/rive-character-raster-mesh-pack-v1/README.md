# Rive character raster mesh pack v1

- Status: `private-static-reconstruction-review / production-unapproved`
- Parent: [preferred anatomy sheet](../rive-character-anatomy-sheet-v1/README.md)

This pack preserves pixels from the preferred raster design instead of replacing them with the weaker hand-authored vector interpretation. It contains five physical, same-origin RGBA layers: an arm-free torso, bilateral continuous shoulder-to-wrist arms and bilateral rigid hands. Small opaque navy shoulder underlaps are hidden behind the torso in the rest pose.

The source-versus-separated comparison is the current visual gate. The pack is not a `.riv` file and contains no mesh contour, weights or animation. Only the left arm may proceed to Rive after the static reconstruction is accepted.

Run:

```powershell
python .\build_pack.py
python .\validate_pack.py
```

## Layered PSD handoff

Run `python build_rive_psd.py` and `python validate_rive_psd.py`. The result is
`rive/char_anon01_front_upper_body-v1.psd`: five full-canvas, same-origin RGBA
layers with stable ASCII names. The validator reads the PSD back and requires
pixel-exact RGBA, name, order, dimension, origin, and hash equality.

Rive import is deliberately bounded to the left arm first:

1. Owner signs in to Rive Editor and imports the PSD.
2. Confirm the five layers and 361x949 artboard before creating bones.
3. Create only `shoulder_l -> elbow_l -> wrist_l`.
4. Mesh-bind only `char_anon01_front_arm_l`; keep the hand rigid under
   `wrist_l` and the torso outside the arm chain.
5. Review rest, moderate, and maximum explain poses for seam, thickness, and
   silhouette continuity. Do not build the right arm or export a runtime until
   this gate passes.

The PSD and its sidecar remain private import candidates. They do not replace
the approved design authority and are not production assets.
