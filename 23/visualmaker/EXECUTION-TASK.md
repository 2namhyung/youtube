# VisualMaker execution slice

## Objective

Add a local durable job workflow to Studio. The first executable adapter exports a revision-bound planning package. Render adapters remain explicitly blocked until implemented; this slice grants no production authority and changes no production inputs.

## Ownership and scope

One implementation writer owns `visualmaker/core/jobs.ts`, narrowly needed job persistence additions to `visualmaker/core/store.ts`, `src/app/api/studio/jobs/**`, `src/components/studio/studio.tsx`, `src/app/studio/studio.css`, `tests/visualmaker-jobs.test.mjs`, and execution documentation. Preserve existing edits, scene locks, revisions, API security, and unrelated files.

Forbidden writes: `raw/**`, `video/**`, episode specifications, generated production catalogs/contracts, approval markers, existing media, `youtube1/**`, and `motion/**`. Do not install dependencies, generate production footage, or pretend a JSON receipt is a render.

## API and data contract

- Schema: `visualmaker-job-v1`; all jobs, snapshots, artifacts, and exported packages carry `productionAuthority=false`.
- Kinds: executable `planning-package`, explicitly unavailable `render-preview`.
- Snapshot: validated immutable project revision and plan; persist its deterministic SHA-256 and requested revision. A new revision never silently replaces a queued snapshot.
- Enqueue requires project ID, baseRevision, supported kind, and nonblank bounded idempotency key. Enforce the existing origin/host/session guards. Stale baseRevision returns 409; same key with incompatible input returns 409; same input/key returns the existing job.
- Job states: queued, running, succeeded, failed, cancelled, blocked. Record attempt, timestamps, bounded errors, progress, and recovery reason. Mutations use SQLite transactions and compare-and-set state transitions; no process-global queue as the durable authority.
- Cancel must not publish successful artifacts afterward. Retry only eligible terminal jobs; preserve the snapshot and attempt history. Interrupted running tasks can be explicitly recovered into a retryable state without stealing active work.
- The executable adapter produces plan JSON, scene CSV, and source requirements from existing export helpers under `data/visualmaker/jobs/`; record artifact relative path, byte size, and SHA-256. Reject escaping paths. Serve downloads only after exact artifact hash validation and successful job state.
- Plan exports are proposals, not populated cut previews, source approvals, or production PASS. Uploaded assets remain pending-review. Render requests have an explicit unimplemented blocker.
- UI displays job status, bound revision, staleness against current revision, progress, blockers/errors, and applicable run/retry/cancel/recover/download actions. Refresh persisted status; do not rely on a client flag for completion.

## Completion and verification

Meaningful tests cover stale revisions, idempotency collisions, snapshot fidelity after edits, concurrent claims, cancellation publication prevention, retries/recovery, artifact hashes/path confinement, blocked render mode, and authority staying false. Run `pnpm run visualmaker:check` and `pnpm run check`; distinguish infrastructure/historical failures from new regressions. Verify a real Studio API flow with the local guard/session token and inspect the UI if a browser is available. Independent execution verification and diff review follow implementation. No commit until the focused result is reviewable under the repository policy.
