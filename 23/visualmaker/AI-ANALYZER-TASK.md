# AI Analyzer core — review-only proposal v1

The runtime now uses [Codex CLI](AI-CLI-TASK.md). This card retains the original SDK/Gateway implementation and synthetic verification history; it is not the current server setup guide. Historical Gateway and SDK-test proposals remain readable.

## Purpose and ownership

Connect a structured AI SDK Analyzer without changing the planning or production authorities. This first slice is a server-side core boundary, not Studio integration or a completed AI workflow.

Root owns this card and dependency installation/registration while no implementation writer is active. A single backend writer then owns new `visualmaker/core/ai-analysis.ts` and `tests/visualmaker-ai-analysis.test.mjs`. Independent execution verification and read-only review follow. No redelegation.

Forbidden: existing editorial/domain/store/job behavior, user DB, credentials or env files, raw/wiki, episode specs/state, generated production files, assets, approval markers, other repository folders, Git commit/push. Do not make paid calls or external requests containing scripts. Tests use synthetic plans and SDK test models only.

## API/data contract

- A server-only core accepts an existing Plan snapshot and explicit project/revision/script SHA bindings, request ID, external-transmission consent, output token limit and AbortSignal. Validate the whole request before model invocation.
- The configured Gateway adapter is optional and has no default model; no credentials/model means unavailable. Only explicit local API-key configuration is supported in this slice; do not silently use linked-account/OIDC credentials. Never export credentials or raw provider errors. No keys in browser DTOs or receipts.
- The analysis proposal is immutable data returned to the caller, not saved or applied. Envelope records schema, request ID, project/revision/script and snapshot SHA-256, configured model identity, usage where known, and `productionAuthority=false`, `requiresHumanReview=true`.
- Structured model payload contains only a bounded list of segment-bound analysis records: segment ID, main message, uncertainty, visual-meaning brief, and Korean/English search briefs. All supplied segment IDs must exist and occur exactly once; preserve exact script segmentation/order. English text is a model-produced search suggestion, not a certified translation.
- Reject unknown fields, invalid strings/bounds, missing/duplicate/foreign segment IDs, attempts to introduce rights/assets/locks/approval/production fields. A locked scene may be analysed but never modified. Model output is untrusted suggestions, not fact verification.
- SDK `generateText` with `Output.object` and JSON schema plus strict application postvalidation; no tools or raw response persistence, and SDK retries are disabled. Gateway service routing/retries are not controlled or verified here. Bounded input/output, cancellation and timeout. Token cap is not a monetary budget. No durable jobs/idempotency ledger/UI/adoption in this slice; request ID is correlation only.
- Test dependency injection is a separate explicit test adapter using SDK test model; it must never become a missing-config fallback or carry real-provider verification claims.

## Completion and evidence

Typecheck plus focused tests must cover SDK structured call, exact snapshot/hash binding, Unicode Korean segmentation, unknown/missing/duplicate/foreign fields, prompt injection as data, missing configuration, pre-abort, timeout, malformed/failed provider responses, redacted errors, limits and zero plan mutation including locked scenes. Preserve existing tool tests. Independent verifier runs commands without edits; reviewer examines actual diff and execution evidence.

Real provider quality, live billing/authorization, Korean evaluation, durable storage/lifecycle, Studio review and deliberate adoption remain subsequent work. No user visual/rights/production approval is implied by tests.

## Implemented boundary

`createGatewayAnalysisAdapter({apiKey,modelId})` requires explicit server-supplied values and does not read env files. `createTestAnalysisAdapter` labels SDK mock results separately. `analyzePlan` binds the caller's expected model, project, revision, script and snapshot hashes before transmission and captures a validated copy before awaiting. The prompt contains the analysis schema version, script SHA-256 and segment IDs, Unicode codepoint spans, text and kind, not the complete Plan or asset/rights data.

Limits: 20,000 UTF-16 code units of script, 40 segments, 600 UTF-16 code units per proposal text field, 512–8192 requested output tokens, 10–120,000ms caller deadline. A deadline race bounds caller waiting even if a test model ignores cancellation; it cannot guarantee a remote provider stops processing or billing. Each output record preserves the input segment order and carries locally derived source spans/text. Results are frozen and `cost='unknown'`. Model IDs are configured rather than selected automatically; requested ID and response ID are separate, and response ID is null if it lacks a safe provider/model shape. Live model availability/capability remains a server connection prerequisite.

SDK installed: `ai@7.0.139`, matching `npm view ai version` at implementation. The existing node_modules junction uses the 23jung shared virtual store; installation retained that junction and added SDK dependencies with scripts disabled. Product package/lockfile are under `youtube-visualmaker/23`; no user credentials or production inputs were read or changed.

## Independent acceptance

`pnpm run visualmaker:check-ai` passed typecheck and 9/9 synthetic SDK tests (exit 0, 4,478ms wall). The separate existing `pnpm run visualmaker:check` passed typecheck and 227/227 tests, no failures/cancellations/skips (exit 0, 301,937ms wall; TAP 298,021ms). The AI tests are registered in the dedicated check-ai command, not included in the 227 count. Pre/post SHA-256 checks over 14 files found no drift, including code/tests/docs/package/lock and actual EP001 spec/state. Canonical repository `pnpm run check` was not run in this slice.

Raw merged stdout/stderr and result/hash JSON are retained under `C:/Users/every/AppData/Local/Temp/vm-ai-analysis-verification-20261014-083239`. Independent read-only review found no P1/P2 issues; the prompt inventory description was corrected to include the script hash and schema version. This acceptance covers the SDK core and safety boundary only, not live model semantics, Studio usability, durable job behavior, billing or production approval.
