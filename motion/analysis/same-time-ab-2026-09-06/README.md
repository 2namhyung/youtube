# Same-source-time A/B gait test

This bounded 1.5-second Seoul→Tokyo test compares the existing production source mapping (A) with an incoming Tokyo edit kept on the outgoing Seoul source clock (B). Both 10-second outfit edits were directly made from the original hanbok history source, as recorded in `production/ticket-travel/performance-v2/long-variant-prompts.md`.

A reaches Seoul source 7.9s at the 6.5s card boundary but restarts Tokyo at source 2.5s. B starts Tokyo at source 7.9s, preserving the nominal source time across the boundary. The same 0.5s existing card transition, 1.80× sampling, fixed camera and ticket artwork are used in both.

- [A existing mapping](A-existing-tokyo-restart-1.5s.mp4)
- [B same-source-time mapping](B-common-source-clock-1.5s.mp4)
- [A/B side-by-side](AB-same-transition-side-by-side-1.5s.mp4)
- [A dense foot frames](A-foot-transition-dense.jpg)
- [B dense foot frames](B-foot-transition-dense.jpg)
- [Paired frames f11–f16 (compact)](AB-foot-paired-frames-f11-f16.jpg)
- [Raw source-time lower-body samples](raw-source-time-lower-body-contact.jpg)
- [Exact frame mapping and probes](metadata.json)

## Frame review conclusion

At the card boundary (global 6.500s, output frame 12), A jumps from Seoul source 7.900s to Tokyo source 2.500s. B keeps both nominal source clocks at 7.900s. In the paired frames f13–f16, B retains a more progressed forward-foot/stride state immediately after the card begins to cover the person, while A shows a more reset-looking shoe arrangement. This is a visible improvement in this short boundary sample, not a complete match: the independent Tokyo render still differs in footwear silhouette and some later foot positions. The raw source contact sheet also shows residual state drift between the independently generated edits at the same nominal source time.

Conclusion: same-source-time mapping is preferable as the assembly rule and reduces the obvious restart at this boundary, but it is not a fundamental guarantee of gait continuity. To make it fundamental, Flow must produce the outfit variants as a true motion-preserving edit of one locked source (or the lower-body motion must be composited/controlled separately); selecting offsets after generation remains a correction, not proof. Interpretation must be based on the frame sheets and playback; no anatomical keypoint tracker or PASS threshold is claimed.
