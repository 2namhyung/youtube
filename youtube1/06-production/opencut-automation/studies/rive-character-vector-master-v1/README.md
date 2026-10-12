# Rive character vector master v1

- Status: `private-design-review / production-unapproved`
- Parent design: [front anatomy sheet v1](../rive-character-anatomy-sheet-v1/README.md)
- Purpose: create the first editable vector master without regenerating independent body parts.

The SVG has explicit semantic groups for `legs`, `arms`, `torso`, `neck_head`, `hands` and `face`. The torso contains no arm or sleeve artwork. Each arm is one continuous shoulder-to-wrist shape and each hand is a rigid attachment. The source preserves an approximately 5.25-head adult editorial proportion and puts wrists near the pelvis.

This is a hand-authored vector interpretation of the preferred raster design, not an automatic trace and not a Rive rig. It must pass visual comparison before any Rive import, mesh, weights or animation.

The second rendered revision corrected the first revision's oversized head and hands. Visual review still finds the shoulders more angular and the face/clothing finish weaker than the preferred raster design. It is therefore retained only as a technical structure candidate and must not replace the preferred raster design authority.

## Fail-closed gate

Reject if the preview shows detached shoulders, duplicated sleeves, hands longer than forearms, inconsistent arm thickness, an adolescent silhouette, broken five-finger readability or material drift from the approved navy/cream/charcoal design.

Run the structural verifier with:

```powershell
python .\validate_vector_master.py
```
