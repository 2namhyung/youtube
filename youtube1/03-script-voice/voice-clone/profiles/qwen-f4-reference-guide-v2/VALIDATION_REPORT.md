# Qwen F4 owner voice refresh v2

## Reconstructed method

The earlier accepted owner model was not a fine-tuned Qwen checkpoint. It kept
`Qwen/Qwen3-TTS-12Hz-0.6B-Base` revision
`5d83992436eae1d760afd27aff78a71d676296fc` fixed in BF16 with no LoRA or
adapter. A locked 10.76-second Instagram narration carrier supplied pacing,
pause, emphasis and intonation. CosyVoice3 `inference_vc` revision
`29e01c4e8d000f4bcd70751be16fa94bf3d85a18` converted that carrier to the
owner timbre. Qwen then used the converted waveform and its exact transcript as
the generation prompt. Instagram speaker identity was not retained.

## 2026-08-07 refresh input

- Source M4A SHA-256: `3b916a46a716ecba9f63c16b987d63c658f693deec539d13566a660cb45e8447`
- 24 kHz mono PCM16 SHA-256: `18e134ea8832a1f04f41641fea35855ef61d1b36007b6931245a7048233c10ce`
- Duration: 310.570667 seconds
- Full-script ASR CER: small `0.02654`, medium `0.01553`
- Selected owner timbre reference SHA-256: `00607c45de6bab30c37b353d3a7141fd5d65e88315279c6a00d4012e596e9914`
- Converted Instagram-delivery/owner-timbre guide SHA-256: `371ef34322274f681f3e5c07c317b144bb4baea66155e312c1c52f53bbb19b6d`

The candidate prompt bank uses the converted guide for neutral, hook, tension,
criticism and solution-closing delivery. It uses direct owner-recording clips
for news exposition and question contour.

## Initial gate result

Coffee probe `msiwl4cl-26340-g63lhv` stopped before rendering. After five
deterministic attempts, small and medium ASR did not simultaneously confirm the
two protected legal terms. The exact failed acceptance SHA-256 is
`6146a17e00ae33b674006144510eb912ff323066e8846280bb13cc085844551a`.
This result is retained as the historical pre-retake failure.

## Targeted legal retake and current gate

- Source `녹음 (5).m4a` SHA-256: `80479d0dc06f33f2310c3c7e21bc2d84e1bb1f6030bb9f58738474f101f3b7ab`
- Derived 24 kHz mono PCM16 SHA-256: `ff0de86723421d219e910f44c7b50120b25ccbfed1a1c20689f18a0d62285b11`
- Duration: 39.722667 seconds
- Direct legal prompt SHA-256: `4ee17671843f2458038e6a7a2d8a8c089751c21aa6baeb9ae9636c66ee8c1178`
- Locked prompt-bank manifest SHA-256: `25bbefae664db927ca14dd3ea48ef6ccfc5bcb65cfc566c0c513bbda2bc2ab3b`

The retake clearly supplied the attempted-murder phrase and refreshed owner
timbre. Both ASR models still heard the final syllable of the special-injury
term ambiguously in the raw retake, so production uses the approved spoken hint
with exact critical-phrase isolation. Captions and script text remain the
canonical legal spelling. The isolated Qwen output passed small and medium ASR
for all protected terms: pesticide, attempted murder, special injury, and the
three-year suspended sentence.

The accepted pre-retime narration has SHA-256
`cc2efaa297d769f8fdda952ff5764ee87b95401aabc9d49ec210c33683bcd7f3`.
Coffee render `msixrpzt-22396-m4r6c7` completed privately with retimed narration
SHA-256 `a72f3aed3461ff1c28dcefb410e575b96ac3f3790ff0035aed49827acfc1b5c9`
and MP4 SHA-256
`43eea637a1a9fa228cdd5311288f117b7c44b7be50ceb56b9da45c72ff0c849d`.

Machine validation is complete. The render is not registered or uploaded, and
the previous active profile remains unchanged until the owner confirms voice
identity, pronunciation, and phrase joins by listening to this exact artifact.
