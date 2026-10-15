# Runtime approval hash contract repair

## Purpose and ownership

The isolated canonical fixture passed the actual fixed-path production stage at cut-review-approved and generated the render catalog. The unchanged manifest was then rejected by render authority: its runtime hash is required to be both the four-file cut-review digest and the different thirteen-file scene digest. Evidence: `C:/Users/every/AppData/Local/Temp/vm-canonical-export-y1nkhH/technical-proof.json` and `runtime-contract-boundary.json` in that directory. Full audio enqueue/export has not run.

One backend writer owns only `video/scripts/visual-contract-v2.mjs`, `video/scripts/render-authority-lib.mjs`, `video/scripts/validate-render-authority.mjs`, an optional pure runtime-file-list module under `video/scripts/`, and a focused regression test under `tests/`. Root owns documentation and package registration after release. No redelegation. Preserve unrelated edits. No fixture, real episode/state/generated/active manifest/approval/raw/wiki/data, dependencies/environment/UI/API or Git writes.

## Contract

Use a shared explicit runtime file closure comprising the existing thirteen scene files, two transition files and actual production entrypoint `video/src/production-index.tsx` (sixteen unique). Default `runtimeSha256(root)` and the existing `reviewBundleSha256` runtime contribution must use that broad closure, so scene-only, transition-only and entrypoint edits invalidate previous user approval bundles. Render authority must compare the manifest runtime hash to this same digest, not its separate scene-only digest. Keep catalog/state scene and transition hashes separate and retain their current exact-byte validation. A four-file-only comparison fix is insufficient: regenerated catalogs must not preserve stale user cut approval. Dependency package bytes are outside this source-file repair's scope.

Do not fabricate historical ledgers, weaken source/rights/playable/stage approvals, preserve old PASS across runtime changes, or hand-edit generated outputs. Existing historical four-file approvals become stale, not automatically migrated. Other validator errors, including missing historical duplicate-renderer records, must remain reported and not silently bypassed in this repair.

## Verification

Focused tests cover shared closure identity, unchanged repeatability, and scene-only, transition-only and entrypoint mutations invalidating both runtime and approval bundle hashes. Verify that regenerating scene/transition catalog digests does not restore the old approval bundle. Exercise actual fixed-path fixture validators with unchanged repaired repository code where feasible; the hash contradiction must disappear, while unrelated missing approvals/records remain failures.

Implementation checkpoint: two focused tests and typecheck passed. Copying current repaired code alone into the retained mirror correctly rejected its old four-file runtime hash and approval bundle. A newly authored fixture approval is required before a positive normal-path claim; none was created by the product repair writer. The missing historical duplicate-renderer ledger remains a separate reported boundary. Both new source-first and runtime-hash regression tests are registered in `visualmaker:check`; the incomplete canonical export acceptance remains intentionally outside that suite.

Writer runs focused tests, typecheck and scoped diff checks, then releases ownership. Independent execution verifier and reviewer inspect exact diff and evidence; distinguish technical checks from real human/media approval. No commit or push.
