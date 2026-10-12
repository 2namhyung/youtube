# Wiki promotion candidate: motion tool learning v3

Status: **eligible for human review; not yet added to wiki.md**.

## Independently verified result

- Six pinned local deterministic engines x ten different-topic, mechanically distinct samples = 60 samples.
- Every sample was decoded to all 48 frames at 972x972/24fps.
- Similarity means official-reference mechanic agreement: at least 9 of 10 independent temporal/pixel observations, not copied example pixels.
- Result: 60/60 passed at 90% or above; within-tool near-duplicate pairs: 0.
- Runtime ran with network blocked and pinned authority/dependency hashes. Exact authored HTML or FFmpeg filter-graph bytes are retained per sample and rehashed by the verifier. Creator, verifier, and shared implementation bytes are SHA-bound. FFmpeg remained the final FFV1 encode and FFprobe frame-contract boundary.
- Verifier report SHA-256: `cd56b51ab9fd7bf839396d36aaa826a54edebd0f41f2598843878cc9175a24fb`.
- Verifier implementation SHA-256: `8161a8319990493b33a160f0499cb781721765ae36347ce20ae3de9e5b535b7d`.

| Tool | Passed | Mechanics distinct |
|---|---:|---|
| gsap-html-v1 | 10/10 | yes |
| motion-canvas-v1 | 10/10 | yes |
| canvas-d3-v1 | 10/10 | yes |
| lottie-web-v1 | 10/10 | yes |
| dotlottie-web-v1 | 10/10 | yes |
| ffmpeg-layer-keyframes-v1 | 10/10 | yes |

## Mechanics and evidence

The ten visible mechanics are translation, scale, quarter-turn rotation, opacity reveal, three-object stagger, progressive draw, horizontal wipe, closed orbit, bounce/settle, and two-stage translate-then-scale sequence. Each uses a different neutral topic. The FFmpeg set records actual per-frame filter graph evidence, including overlay, scale, rotate, fade/colorchannelmixer, drawbox, crop, zoompan and xfade.

Sources: [reference mechanics](reference-mechanics.json), [study README](README.md). Generated evidence: `out/studies/motion-tool-learning-v3-full-d/creator.json`, `verifier.json`, per-sample authored execution evidence, six contact sheets and six reels.

## Rejected and superseded attempts retained

- v1: rejected self-copied expected/measured signatures and constant scores.
- v2/v2b: rejected constant scores and visually repeated mechanics.
- v3 full-a: rejected by the independent verifier because bounce did not reverse/settle and FFmpeg opacity stayed transparent.
- v3 full-b: passed pixel/mechanic gates but was superseded because exact temporary authored scene/filter-graph bytes were not retained for later audit.
- v3 full-c: passed all motion/runtime-evidence gates but was superseded to bind creator/verifier/shared implementation file hashes explicitly.

Human review should inspect all six contact sheets/reels before copying this candidate into the canonical wiki.
