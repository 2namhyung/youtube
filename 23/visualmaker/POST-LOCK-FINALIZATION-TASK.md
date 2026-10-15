# Post-picture-lock finalization — implementation contract

## Purpose and ownership

Implement a fail-closed final-output input contract and executable local export engine. This slice is not full tool completion: durable queue/API/UI integration follows after independently verified core execution. Root owns this task card; one delegated backend writer owns implementation and focused tests. No redelegation; preserve all existing edits.

Allowed: new `visualmaker/core/finalization.ts`, `visualmaker/renderer/finalization-contract.ts`, `visualmaker/renderer/finalization-engine.ts`, `tests/visualmaker-finalization.test.mjs`; small necessary exports in existing renderer utilities only with explicit explanation. Forbidden: real episode spec/state, generated files, active manifests, approval markers, raw, wiki, user data, UI, jobs/worker/API, dependencies, credentials, commits/pushes.

## Editorial and data contract

- Sole editorial authority remains episode-spec.json. An optional `post_lock_output={version:1,addendum_path}` property selects a fixed external version-1 finalization contract path before audio production; absence blocks execution. Spec stays byte-identical after audio production. Never manufacture that property or approvals in actual EP001.
- Readiness requires the existing canonical `picture-locked` stage validator AND strict additional exact-byte bindings: user picture-lock marker, approved voiced MP4 and audio-assembly receipt, episode spec/state/final script, caption alignment review, and all mix assets. A boolean picture-lock flag or nonblank filename is insufficient.
- Human marker must identify reviewer=user and exact approved voiced artifact/receipt/script hashes. Report and output always retain `productionAuthority=false`, `reviewApproved=false`; technical success creates no human approval.
- Caption segments must explicitly declare integral start/end frames, nonempty exact final-script text, cut association, sequence/order, bounds, and user alignment approval bound to the voiced artifact and complete caption contract hash. Do not derive ends, text, or alignment from draft start-only word cues. Use deterministic SRT/VTT and optional MP4 mov_text; no burn-in or raster text compositing.
- Mix must explicitly select passthrough or bounded gain/asset placement. No inferred music, rights, normalization, ducking, defaults or trimming. For first slice allow explicit voice passthrough plus optional approved fixed-gain SFX/music at exact sample/frame placement, only if executable and validated; reject unsupported policies rather than silently ignore them.
- Thumbnail is an explicitly selected in-bounds frame from the same approved voiced video, extracted without adding text, effects, or AI assets; extraction is not thumbnail human approval.
- Paths are repository-contained canonical references, reject traversal/symlinks and unsafe output roots. Hash before and after work. No network, remote URL, arbitrary CLI/filter string, caller-controlled production paths, or authorization bypass.
- Pure contract validation may accept injected byte-reading/stage evidence for isolated tests. Production reader must run real stage validation with no test environment switch. Distinguish synthetic mechanics verification from genuine canonical eligible execution in reports.

## Executable deliverables

Typed versioned report/contract/result and strict unknown/malformed field handling; canonical read-only report that truthfully blocks actual EP001; local FFmpeg engine producing MP4 + SRT + VTT + PNG + SHA-256 receipt in a safe temporary output directory. Preserve source video stream packets and first/middle/last decoded frame identity; probe exact duration, streams, subtitle timing/text, and audio behavior for selected policy. Abort/timeout and input drift must fail without exposing completed artifacts. Artifact names are neutral exports, not assertions of final approval.

## Verification and handoff

Focused tests must execute real FFmpeg on short synthetic inputs, not only inspect strings: subtitles/sidecars, copy video identity, extracted thumbnail frame, explicit mix behavior where implemented. Negative tests: missing approval, wrong reviewer/hash, stale script/text, unordered/overlapping/out-of-bounds captions, invalid placement/rights, traversal/symlink, input tampering/cancellation. Actual EP001 remains blocked. Run focused node tests using repository loader pattern, `pnpm exec tsc --noEmit`, then independent verifier runs `pnpm run visualmaker:check` and canonical `pnpm run check` (known failures reported separately). Independent reviewer checks actual diff and evidence without editing product code. No commit until focused human diff review.

## Implemented scope and explicit limits

- Four new core/renderer/test files; no queue/API/UI connection in this slice. `visualmaker:check` now includes the focused finalization suite.
- V1 supports only explicit audio passthrough. Music, gain adjustment, ducking and normalization are rejected, not implemented.
- Script bytes must match the source selected by the canonical spec; caption code-point spans cover ordered cut narration without losing non-whitespace characters. Only Unicode White_Space gaps between declared spans are allowed; first/last spans cover the cut boundaries. Visible cue text is the exact selected substring and has no leading/trailing whitespace, preventing subtitle conversion from silently trimming it. Word-boundary splits and emoji/code-point boundaries are tested.
- Marker hashes form a directed acyclic chain: picture marker binds source job/attempt/video/receipt/script; caption marker adds caption payload and picture-marker hashes. Markers do not bind the whole spec hash, which is separately fingerprinted by the execution report.
- Existing public source job verification is retained unchanged. A subsequent implementation adds v2 authority snapshots and a separate archival finalization reader which permits only a strict picture-lock state transition with unchanged spec bytes. See [transition contract](POST-LOCK-TRANSITION-TASK.md). Genuine canonical eligible success remains unverified; old v1 snapshots are not retrofitted.
- Synthetic engine contracts test FFmpeg mechanics only; they do not establish canonical production eligibility or human approval. Current EP001 remains blocked for missing post-lock contract and existing production authority gaps.

## Next integration prerequisite

The separately gated transition validator and stable predeclared addendum locator are implemented in the next transition slice, without backward rewriting of execution receipts, approval fabrication, or arbitrary fingerprint exceptions. Queue/API/Studio integration and genuine eligible end-to-end proof are still required; internal mechanics tests are not that proof. Historical audio artifact readers remain strict.

## Independent verification snapshot — 2026-10-14

This records the earlier output-engine slice before the subsequent transition implementation; its 178-test count is historical, not the current suite count.

- Focused finalization tests: 5/5 passed; complete `visualmaker:check`: 178/178 passed, including typecheck. Separate typecheck and diff check passed (CRLF warnings only).
- Actual synthetic FFmpeg execution verified MP4 subtitle text/times, preserved video/audio packets, first/middle/last decoded frames, and exact thumbnail pixels. Synthetic success does not prove canonical eligibility.
- Actual EP001 remains blocked for absent `post_lock_output`. Canonical `pnpm run check` stops at existing episode-spec validation with six source/narration/cut/design byte drift and missing generated-contract/hash-binding findings; later gates were not run.
- Independent reviewer found no additional P1/P2 code defect after corrections. Positive canonical evaluator path and its symlink/script-drift/missing-marker rejection cases are not established by the synthetic engine fixture; these remain unverified acceptance boundaries.
- Execution report: `C:/Users/every/AppData/Local/Temp/visualmaker-post-lock-finalization-verification-20261014.md`. No real episode authority, approval marker, user data, commit or push was changed.
