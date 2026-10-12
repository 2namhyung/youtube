# Rive character anatomy sheet v1

- Status: `design-review-candidate / production-unapproved`
- Generated: 2026-08-13 using the built-in ImageGen tool
- Design authority reference: `generic-character-poc-v1/master-approved-v1.png`
- Candidate: `source/front-anatomy-design-candidate-v1.png`
- Candidate SHA-256: `7b7a2a5d0f5806873ec3c8ddc1157efedc5b110b45e40b299e75677efe68601f`
- Dimensions: 1536x1024

## Purpose

This sheet is the design gate before any part extraction or Rive rigging. The left figure is a simplified construction mannequin; the right figure is the proposed finished anonymous editorial character. They share a front view, baseline and intended landmark heights.

## Current assessment

The candidate corrects the prior study's largest anatomical failures: the hand is shorter than the forearm, the arm originates at the shoulder rather than beside the torso, the ribcage and pelvis read as separate masses, and the legs support a stable front-view stance. The silhouette now reads as an adult editorial character rather than a collection of detached parts.

It is not yet a rig or production authority. ImageGen did not create separable layers, vector paths, exact mesh topology, hidden underlaps or Rive weights. The mannequin and finished figure also require human comparison at the elbow, wrist and knee landmark heights before promotion.

## Fail-closed next gate

1. Human approval of the complete front-view character only.
2. Draw a deterministic landmark overlay on the approved finished figure.
3. Redraw the approved figure as clean vector-friendly shapes; do not regenerate independent body parts.
4. Derive an arm-free torso, continuous left/right sleeve meshes and rigid hands from that single approved drawing.
5. Test only the left arm in Rive at rest, explain and point-preparation poses.

No animation, provider upload, publication or production promotion is authorized by this study.

## Landmark gate

`build_landmark_review.py` deterministically preserves the selected candidate pixels, extracts a review crop, and places measured structural guides over the finished figure. `validate_landmark_review.py` verifies physical contained files, hashes, image decoding, the approximately five-head design band and the upper-arm/forearm centerline ratio. These checks validate the review artifact, not artistic approval.

Run:

```powershell
python .\build_landmark_review.py
python .\validate_landmark_review.py
```
