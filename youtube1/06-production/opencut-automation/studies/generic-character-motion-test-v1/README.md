# Generic character motion test v1

Private three-second Remotion study using only the user-approved transparent derivative of `generic-anonymous-adult-01` plus code-native SVG information graphics.

This folder now preserves three distinct tests:

1. `motion-test.mp4`: failed interpretation of character action; whole-character transform plus SVG only.
2. `character-action-test.mp4`: readable action through four ImageGen key-pose replacements; no joint interpolation.
3. `articulated-character-test.mp4`: continuous Remotion shoulder/elbow/torso hierarchy, rejected because the generated atlas makes each arm segment nearly torso-length and destroys the approved proportion.
4. `drawn-character-action-test.mp4`: corrected eight-drawing limited animation. It preserves the approximately 4.5-head body, mid-thigh relaxed fingertips and non-stretching limbs. This is the only current human-review candidate.
5. `drawn-character-action-test-v2.mp4`: no-flicker correction. It removes all dissolves, keeps every pose fully opaque and registers each drawing by a pelvis/weight-line anchor. Hard pose changes remain because eight unique drawings across three seconds equal only 2.6667 unique drawings per second.
6. `continuous-arm-mesh-test.mp4`: rejected. The hidden shoulder root was widened to 105px to conceal the join, but the taper remained visible and made the bent arm much thicker than the approved drawing.
7. `continuous-arm-thickness-locked-test.mp4`: corrected successor. The hidden first 14% tapers to a 64px half-width before becoming visible; visible upper-arm/elbow/wrist half-widths are fixed at the same normalized sleeve positions for every frame. It remains a narrow human-review candidate, not a complete character rig.

None of the tests authorizes production admission, upload or publication.

- Character authority: `public/character.png`, SHA-256 `8be0b62640316bb0311d171bc1e5db599740092ae1daa73377b15b55395b1136`
- Renderer: Remotion `4.0.508`
- Output: 1080x1920, 24fps, 72 frames, 3 seconds
- Rejected continuous-arm output SHA-256: `0e17870694abf7da7e3e82749a2a164c171dad685fdcd9d1260b3c1ea9f3928e`
- Thickness-locked successor SHA-256: `73bb31094eb81baa084a6ed3b2f1c35dbb10743084a6b8841b9fb57648f21b0c`
- Continuous-arm base SHA-256: `545d7133362a79f784d56a9fabfb01908d2f32f6ce013d70ec353e39c885cc92`
- Rig atlas: `rig-atlas-v1.png`; accepted only as a technical PoC candidate. `rig-atlas-v1-alpha-hard.png` uses hard key extraction because the rejected soft matte damaged skin and shirt opacity.

Run `python prepare-continuous-arm.py`, `npm run render:continuous-arm`, and then `npm run verify` for the new proof.
