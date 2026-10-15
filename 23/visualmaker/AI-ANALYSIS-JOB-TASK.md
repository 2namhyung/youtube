# AI analysis durable jobs and Studio contract

Current runtime configuration and invocation use [Codex CLI](AI-CLI-TASK.md), not the Gateway API key configuration below. The queue, consent, immutable scope and checkpoint contracts remain; Gateway configuration and SDK token-limit wording in this original card describe the pre-CLI implementation. CLI output tokens are not a guaranteed execution or monetary cap.

AI analysis must become a usable script-to-review workflow while remaining separate from editorial and production authority. This stage adds a dedicated authenticated API backed by the existing local job queue; the subsequent UI consumes this contract. An external-call checkpoint prevents application-level automatic replay of an uncertain paid call.

## Ownership and protected paths

Root owns this card before implementation. One backend writer owns new `visualmaker/core/ai-analysis-job.ts`, new `src/app/api/studio/ai-analysis/route.ts`, focused `tests/visualmaker-ai-analysis-job.test.mjs`, and narrow integration edits in `core/jobs.ts`, `core/dispatch.ts`, `visualmaker/worker.ts`, `src/app/api/studio/jobs/route.ts`. Core `ai-analysis.ts` may receive narrowly necessary exported validation helpers, with existing tests preserved. No other writers, no redelegation. Root later registers tests/docs; frontend ownership and independent verification/review are sequential handoffs.

Database schema is a preceding single-writer handoff: the database owner creates only `core/ai-analysis-schema.ts` and `tests/visualmaker-ai-analysis-schema.test.mjs`. Export `ensureAIAnalysisSchema(db)` for integration after existing job tables are initialized. It creates the focused checkpoint table and integrity constraints idempotently; the backend integrates the call and writes lifecycle data, not DDL. Do not overload job errors/blockers as call checkpoints.

Forbidden: user DB, credentials/env files, raw/wiki, episode spec/state/generated production files, assets/approval markers, youtube1/motion, Git commit/push. Tests use owned temporary SQLite roots and synthetic SDK models. No live model requests, model-account configuration, budget mutations, or secret logging.

## Configuration and safety

Use existing Next.js/local-session guard and SQLite queue. New kind `ai-script-analysis`; proposal artifact `ai-analysis-proposal.json`. No default model and no mock fallback. Server opt-in `VISUALMAKER_AI_ENABLED=1`, explicit `AI_GATEWAY_API_KEY`, and `VISUALMAKER_AI_MODEL` are required. Only those named values may be added to the AI worker's reduced environment; never process arguments, DB rows, public DTOs, receipts or logs. A queued contract binds the configured model; changing/removing config blocks execution before transmission. Model syntax alone is not live availability/capability proof.

Readiness and enqueue validate all existing core limits (20,000 UTF-16 script units, 1–40 segments, 512–8192 output tokens, 10–120,000ms timeout) before accepting a job. Call limits are not monetary budgets. Per-request `externalTransmissionConsent=true` and `billingConsent=true` bind the script/snapshot/model; billing amount is unknown and cancellation may not stop remote processing or charges. No SDK retries, automatic new consent, or fabricated production approval.

## API and DTO

All responses are no-store; guard all operations. Reject unknown, missing, coerced or incorrectly typed fields and conflicting query modes. Error strings are static safe messages. No request paths, custom prompts, keys, adapter/test flags, provider options, arbitrary raw response or approval markers are accepted.

`GET /api/studio/ai-analysis?projectId=P&baseRevision=N` returns a versioned report with exact current scope `{projectId,revision,scriptSha256,snapshotSha256}`, capability `{available,modelId,reason}`, core limits, current project's last 50 analysis jobs plus safe external-call status, and `productionAuthority=false`, `requiresHumanReview=true`, `cost='unknown'`. Supplied revision must equal current Plan revision; stale scope is 409. Jobs from older revisions remain identifiable as stale metadata, never silently treated as current analysis.

`POST` enqueue exact fields: `{action:'enqueue',projectId,baseRevision,idempotencyKey,expectedModelId,externalTransmissionConsent:true,billingConsent:true,maxOutputTokens,timeoutMs}`. Capture authoritative immutable Plan snapshot and both hashes in a transaction. Idempotency key is scoped to project, and the request hash includes all analysis settings and consent. Same key/same contract returns the original job; altered contract returns 409. No overwriting or automatic requeue.

`POST` run/cancel/recover exact fields: `{action,projectId,baseRevision,jobId}`. Supplied project/current revision must match current Plan and job ownership. Run additionally requires job requested revision and snapshot to remain current. Cancel/recover may operate on a stale owned job to stop it after a script edit. Analysis jobs are rejected by generic jobs POST commands so the dedicated scope checks cannot be bypassed.

`GET` with `jobId` and `format=proposal` returns only a succeeded, hash-validated analysis artifact whose job/project/requested revision/snapshot match the supplied current scope. Revalidate strict proposal shape/authority/model/request IDs, all exact segment bindings and artifact bytes/hash. Old-revision results cannot be adopted as current. No generic download bypass; that endpoint remains unavailable for the AI kind.

Safe job metadata exposes requested model, call-start timestamp/outcome (not private adapter/config), request contract SHA, ordinary status/attempt metadata and one artifact locator only on success. Proposal contains the core's explicitly labelled adapter origin, segment source spans/text, usage and unknown cost. No auto-adoption command in this stage. Readiness explicitly includes `capability.providerVerified=false`; availability means configured and within input limits, not a verified provider connection. Proposal retrieval returns `{job,proposal}`.

## Durable lifecycle

Reuse existing jobs/attempts/artifacts; store immutable execution contract and a focused AI attempt checkpoint. Claim is exclusive and AI attempts cannot exceed one. Check scope/config/consent again immediately before committing `external_call_started_at`, then call the SDK using only the captured script data. The checkpoint is committed before external I/O; it means dispatch may have occurred, not that billing definitely happened.

Before checkpoint: config/scope failures fail safely without a call; queued cancellation is `cancelled`. After checkpoint: cancellation, timeout, process death, expired lease, network errors or lost publication authority become terminal `needs-review`, with no proposal publication or automatic retry. Application cancellation signals a live executor where possible; the durable state, not in-memory cancellation, fences publication. Recovery preserves ambiguity. Every retry of an AI job is rejected; a fresh user request needs a fresh key and renewed consent. Successful validated response publishes exactly one JSON artifact atomically under the current lease; retain original Plan and locked scenes unchanged.

`needs-review` is not production review or a success state. It tells the user to inspect provider outcome/billing before deciding whether to create another request. SDK retry prevention does not control Gateway's internal routing or guarantee exactly-once provider processing.

## Required verification

Implementation handoff: backend self-check passed typecheck and 32 synthetic/core/existing-job tests. Schema hardening self-check passed 6 schema tests and 10 AI job tests, including checkpoint and parent `INSERT OR REPLACE` rejection with recursive triggers off. These are implementation evidence, not independent lifecycle acceptance. Root registered all three AI test files in `visualmaker:check-ai`; independent verification/review and Studio integration remain pending.

## Independent acceptance — 2026-10-14

Independent review identified three P2 defects: partial staging-write cleanup, corrupt queued AI drain starvation, and unbounded reads of a tampered proposal file. The backend corrected them and added regression cases for partial writes, artifact-DB rollback, foreign-path replacement preservation, oversized-file rejection and actual worker drain progress. Final read-only review found those defects closed and no additional P1/P2 issues in this slice.

Independent execution verification passed `visualmaker:check-ai` (typecheck, 29/29: core 9, schema 6, jobs 14), existing jobs/worker (13/13), and the separate `visualmaker:check` (typecheck, 227/227; TAP 268,292ms, wall 272,357ms). All commands exited 0 with no failures/cancellations/skips. Pre/post SHA-256 over 21 selected implementation/schema/test/route/config/docs and EP001 files found no drift. Raw logs and summary are in `C:/Users/every/AppData/Local/Temp/vm-ai-jobs-verification-20261014-090225`. Root added this acceptance documentation after those hash checks; it is not part of the unchanged verification snapshot.

This backend acceptance is synthetic/local queue and API evidence, not actual provider availability, Korean semantic quality, billing, real Studio browser interaction or production approval. Canonical repository `pnpm run check` was not run. No live provider request, user DB, episode authority or approval marker was changed. The subsequent Studio implementation and isolated browser acceptance are recorded separately in [UI](AI-ANALYSIS-UI-TASK.md) and [browser verification](AI-ANALYSIS-BROWSER-TASK.md).

Focused synthetic integration covers enqueue/readiness strict input/config/consent limits, current/stale/cross-project scope, same-key replay and key conflicts, exclusive claim, immutable contract/snapshot and locked Plan, success artifact authenticated retrieval and tampering, provider failure and timeout redaction, queued/in-flight cancellation, expired lease recovery before/after checkpoint, late result fencing, and retry rejection. Count SDK model invocations to prove at most one per job in tested lifecycle. Test seams are programmatic only and must not be exposed via HTTP/CLI/env fallback. Verify existing job/worker/API tests and typecheck independently, then read-only diff/evidence review. Actual provider semantics/billing and Studio/browser interaction require their own evidence and remain unproven here.
