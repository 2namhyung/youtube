# Historical ledger isolation boundary

## Evidence and ownership

The canonical fixture reached cut-review-approved stage validation and normal catalog generation, but render authority unconditionally reads a historical SH003/SH004 duplicate-renderer ledger. That ledger is absent in the real code/wiki checkout and ignored under `video/qa/`. It is a non-production historical isolation record, not approval for unrelated current source-led cuts. Evidence is retained in `C:/Users/every/AppData/Local/Temp/vm-canonical-export-y1nkhH/technical-proof.json`; full enqueue/export is still unverified.

One backend writer owns only `video/scripts/validate-render-authority.mjs`, an optional small pure policy helper under `video/scripts/`, and one focused regression test under `tests/`. Root owns task card/package registration after release. No redelegation; preserve unrelated edits including the reviewed runtime-hash repair. No fixture, real episode/state/generated/active manifests/approval/raw/wiki/data, dependencies/environment/UI/API or Git writes.

## Contract and completion

For the already recognized source-led active route only, absence of this historical ledger with exact ENOENT may be explicitly reported as unavailable and non-production. It grants no authority or approval. Keep legacy-route absence fatal. A present malformed JSON file, wrong isolation fields, non-ENOENT I/O failure, or injected historical renderer/catalog/registry remains fatal. Retain all current source/rights/runtime/catalog/state/approval validators and production-authority rules. Do not broadly catch failures, exempt the whole legacy check, manufacture a ledger or fabricate historical review evidence.

Focused tests must cover source-led ENOENT reporting, legacy ENOENT rejection, present valid isolation record, malformed JSON, each false isolation field, and non-ENOENT error rejection. Existing historical input rejection checks remain unchanged. Writer runs focused tests/typecheck/diff checks, then releases ownership for independent review/execution. Fixture-only newly authored approvals and normal fixed-path positive checks are performed later by the fixture writer, not this product repair. No commit/push.

Implementation checkpoint: two focused tests covering the required subcases and typecheck passed. The diagnostic reports `historical_duplicate_renderer_ledger.status=unavailable-non-production` with `production_authority=false`, including on otherwise failed validation. The focused test is registered in `visualmaker:check`; independent review/full execution and a positive fixed-path fixture boundary remain required.
