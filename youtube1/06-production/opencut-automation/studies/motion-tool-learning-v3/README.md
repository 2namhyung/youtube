# Motion tool learning v3

v3 is the fail-closed successor to rejected v1/v2. It defines “90% same” as agreement with ten observable properties of an official-reference mechanic, never as similarity to copyrighted example pixels. The creator records only invocation and immutable artifacts; the verifier independently decodes all 48 frames and computes every score.

The feasibility pilot is retained. The current complete successor is `out/studies/motion-tool-learning-v3-full-d`: all six tools have ten distinct mechanics, every sample scores at least 9/10, there are no within-tool near duplicates, all runtime/authority/hash/frame checks pass, exact authored HTML or FFmpeg graph bytes are retained, creator/verifier/shared implementation bytes are hash-bound, and the independent verifier sets `promotionEligible=true`. This creates only `WIKI_PROMOTION_CANDIDATE.md`; it does not edit `wiki.md`.

```powershell
node studies/motion-tool-learning-v3/create-v3.mjs out/studies/motion-tool-learning-v3-pilot-a 2
node studies/motion-tool-learning-v3/verify-v3.mjs out/studies/motion-tool-learning-v3-pilot-a
node studies/motion-tool-learning-v3/negative-tests.mjs out/studies/motion-tool-learning-v3-pilot-a
```

Full successor verification and review artifacts:

```powershell
node studies/motion-tool-learning-v3/create-v3.mjs out/studies/motion-tool-learning-v3-full-d 10
node studies/motion-tool-learning-v3/verify-v3.mjs out/studies/motion-tool-learning-v3-full-d
node studies/motion-tool-learning-v3/make-contact-sheets.mjs out/studies/motion-tool-learning-v3-full-d
node studies/motion-tool-learning-v3/negative-tests.mjs out/studies/motion-tool-learning-v3-full-d out/studies/motion-tool-learning-v3-full-d/negative-tests.json
node studies/motion-tool-learning-v3/finalize-review-artifacts.mjs out/studies/motion-tool-learning-v3-full-d
node studies/motion-tool-learning-v3/write-promotion-candidate.mjs out/studies/motion-tool-learning-v3-full-d
```

The ten mechanics are visibly different: translation, scaling, rotation, opacity, three-part stagger, progressive drawing, horizontal wipe, closed orbit, bounce/settle, and two-stage sequence. Each has a different neutral topic. Official links and the exact observation boundary are in `reference-mechanics.json`.

## Rejected predecessors

- v1: rejected because expected and measured signatures were self-copied while scores were constants.
- v2/v2b: rejected because decoded pixel occupancy was added but scores remained constants and samples repeated the same movement/scale composition under different topic labels.
- v3 full-a: rejected because bounce lacked reversal/settle and FFmpeg opacity stayed transparent.
- v3 full-b: passed mechanic/pixel gates but was superseded because authored scene/filter-graph bytes were not retained for later audit.
- v3 full-c: passed all motion/runtime-evidence gates but was superseded to bind creator/verifier/shared implementation file hashes explicitly.

These attempts and their artifacts remain append-only evidence. v3 never edits them.
