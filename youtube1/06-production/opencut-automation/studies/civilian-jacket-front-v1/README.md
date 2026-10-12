# Civilian jacket front v1 — private Godot skin runtime scaffold

This directory is a private runtime scaffold for `godot-skin-slot-contract-v1`. It calls no provider, performs no upload, and creates no publication authority. The generated alpha-separated torso/upper-arm/forearm inputs are copied into deterministic full-canvas slot files; head, hair, hand and lower-body slots are bounded alpha extractions from the approved-history front master. All remain private review candidates, not production authority.

The runtime builds exactly one `Skeleton2D`/`Bone2D` hierarchy from the manifest and attaches the selected skin by semantic slot. The gesture is deterministic and bounded to three seconds at 24 fps (72 frames): right upper arm −7°, right forearm −16°, and a small head settle. `qa_hooks.gd` records a trace for rest-to-gesture-to-rest checks. `contact-extraction.mjs` and `verify-study.mjs` fail closed on missing frames, wrong timing, rest-frame mismatch, missing visual state changes, hash drift, or any non-private release flag.

## Incoming transparent PNG contract

Run `npm run build-manifest` only after every expected file below has arrived under `assets/skin-civilian-jacket-front-v1/`. Each file must be a physical, non-symlink, non-interlaced RGBA8 PNG at exactly 1024×1536. The builder records byte length, SHA-256 and alpha bounds; the shared contract validator then checks containment, geometry groups, unique z-order and hidden fills.

Visible slots:

`head-visible.png`, `hair_back-visible.png`, `hair_front-visible.png`, `torso-visible.png`, `upper_arm_l-visible.png`, `upper_arm_r-visible.png`, `forearm_l-visible.png`, `forearm_r-visible.png`, `hand_l-visible.png`, `hand_r-visible.png`, `thigh_l-visible.png`, `thigh_r-visible.png`, `shin_l-visible.png`, `shin_r-visible.png`, `foot_l-visible.png`, `foot_r-visible.png`

Required clothing/occlusion hidden fills:

`torso-hidden-fill.png`, `upper_arm_l-hidden-fill.png`, `upper_arm_r-hidden-fill.png`, `forearm_l-hidden-fill.png`, `forearm_r-hidden-fill.png`, `thigh_l-hidden-fill.png`, `thigh_r-hidden-fill.png`, `shin_l-hidden-fill.png`, `shin_r-hidden-fill.png`

Hidden fills are physical attachments, not metadata-only declarations. Do not substitute a flattened character raster; that is explicitly rejected by the skin contract and by the prior front-rig history.

## Focused checks

`npm run verify:scaffold` verifies the pending/private state. The deterministic loader trace can be checked without a renderer using Godot 4.7.1: `Godot_v4.7.1-stable_win64_console.exe --headless --path . -- --manifest=res://skin-manifest.json --qa-only --qa-trace=<absolute-private-output>/runtime-trace.json`. A real render must be run with a graphical-capable Godot movie backend; the headless dummy backend is expected to block rather than create a false visual pass. After obtaining 72 PNG frames, run `npm run extract-contact` and finish with `npm run verify`. Human full-resolution inspection is mandatory; seam, hinge exposure, outline ghosts, thickness jumps or pose drift fail the study honestly.
