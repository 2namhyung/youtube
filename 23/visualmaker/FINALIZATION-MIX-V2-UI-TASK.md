# Studio fixed gain mix v2 receipt support

## Purpose and ownership

Connect the verified v2 output to the existing Studio finalization UI without changing backend authority or adding mix settings. Root owns documentation/card; one frontend writer owns `src/components/studio/finalization-client.ts`, `finalization-panel.tsx`, `finalization-artifact.tsx`, optional pure `finalization-mix-client.ts`, and `tests/visualmaker-finalization-client.test.mjs`. Preserve unrelated edits, one writer, no redelegation. Release before root documentation and independent verification/review.

Forbidden: backend/renderer/contracts/routes/package/dependencies, actual episode spec/state/media/active/generated roots/markers, raw/wiki/user DB/env/credentials/providers/Git. No approval writes, fabricated success rows, source substitutions or EP001 stage advances. Parent read the React skill and effect-dependency/serialization rules; check both edited TSX components for unconditional hooks, primitive scope dependencies, stale async cancellation, accessible controls/status and no private/large server props. Backend types may be type-only imports; no server runtime imports.

## API and data contract

Readiness remains exact `visualmaker-post-lock-output-v1`: scope, composition, validators, redacted blockers, renderEligible, productionAuthority=false, reviewApproved=false. No new mix settings/selection/stems/evidence paths/approval payload in that public DTO. Enqueue keeps existing job kind and projectId/baseRevision/idempotencyKey. Existing job/source retrieval, including voice source outside the latest 50 jobs, stays unchanged.

Untrusted downloadable receipts need explicit v1/v2 branches. Keep every v1 exact check and passthrough semantics. V2 requires matching durable/technical versions, current job/attempt/project/revision/script/snapshot/execution/source, exact five artifact hashes and false authority/review. `receipt.source` is still the succeeded voice audio-assembly job, not a mix job. Strictly check actual backend fields: mixApproval and technical fixed-gain-stems payload/marker hash equality, one-to-one rights evidence, decoder/presented/codec-tail sample arithmetic, sample rate/channels, bounded finite measurements/content windows, zero clipping, encoded AAC/output packet and decoded PCM identity, presentation equality, and copied video packet binding. Reject unknown schemas/keys, drifted hashes, malformed numbers, source drift and authority claims. Use a small pure client validator; do not import filesystem core logic.

Owner-authenticated receipt downloads intentionally include canonical episode-relative `{id,path,sha256}` rights-evidence provenance locators. This is not public internet publishing or a document reader. Validate paths below `video/episodes/episode-001/`, rejecting absolute/UNC/traversal and extra content fields. Do not add paths to readiness or UI props, show or dereference them, or expose evidence contents, selection URLs or marker decisions. A short sharing caution may explain that verification records include relative provenance names. Root and independent security review accepted this metadata boundary.

Preserve MP4 OPFS streaming bounds, source-current guards, per-click authenticated sidecars, MIME/hash checks, exactly five fixed downloads and scope cleanup/abort. No arbitrary file endpoints/new artifacts. Local MP4 replay/download remains a previously authenticated copy, not another server freshness check or client video SHA calculation.

## UI behavior and verification

Correct unconditional original-audio copy: configured approved fixed-gain mixes are supported; readiness itself does not identify mode. After a valid receipt distinguish original-audio v1 from fixed-gain v2. Input approval is not legal certification, output listening/full-video PASS or whole-tool completion. Keep false authority and EP001 blocked. No approval/settings controls or claims that ducking/normalization/fades/repeats/unsupported caption characters work.

Preserve v1 tests; add accepted v2 and mutation negatives for schema/mode/payload/marker/rights IDs/paths/hashes, sample/codec arithmetic/clipping/video/source bindings/false flags. Keep private readiness-field rejection, source fallback and five downloads. Run focused client tests, `pnpm exec tsc --noEmit`, focused diff check and the React checklist; report exact results and release ownership. Separate verifier/reviewer validate changed client and registered suite. HTTP/browser acceptance is later: owned synthetic server, normal enqueue/worker and real authenticated files, never seeded successes or actual EP001 approvals.

Backend baseline is independent latest 225/225 with unchanged 32-file hashes. Canonical repository check still stops at six existing EP001 first-gate blockers; later gates/tests/build did not execute. Backend fixtures and client tests are not browser evidence.

## Completed technical acceptance

The reviewer found and the single frontend writer fixed two backend/client contract mismatches: separate rights-evidence files may share a SHA-256, and actual MP4 duration uses the backend tolerance `max(0.12, 2/fps)` rather than a stricter client-only limit. Acceptance/negative tests cover those client boundaries. Independent focused 4/4 and tsc passed; five UI and actual episode authority hashes were unchanged during verification. A separate single-copy change in `studio.tsx` describes both supported modes without changing hooks, props or controls. The React review found no required issue.

Latest independent `visualmaker:check`: 227/227, zero failed/cancelled/skipped, 332.81 seconds, 51-file pre/post hashes unchanged. Evidence: `C:/Users/every/AppData/Local/Temp/vm-finalization-v2-full-prep-f9d35ffb48e745c5b7ccc4e46ddacfed`. Backend duration threshold edges have no separate focused test; the client edges and normal backend path are covered.

Root observed a fresh synthetic v2 Studio job created and run through the real browser, displayed the validated v2 label and five downloads, and played the OPFS MP4 to end. Exact fixture and boundaries are in [the browser acceptance card](FINALIZATION-MIX-V2-BROWSER-TASK.md). This verifies the client connection, not actual EP001 approval, output listening/semantic quality or whole-tool completion. Actual rights/current-authority validation remains server-owned, not a client authorization decision.
