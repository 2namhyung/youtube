# Local worker execution slice — 2026-10-13

## Objective and ownership

Move planning-package execution out of the Next request process. SQLite remains the durable queue; this prepares a renderer boundary but does not implement video rendering or grant production authority.

One implementation writer owns `visualmaker/core/jobs.ts`, new worker/dispatch modules and CLI under `visualmaker/`, `src/app/api/studio/jobs/route.ts`, narrowly needed Studio job UI copy, `tests/visualmaker-*-worker*.test.mjs`, `package.json` worker/check commands, and `visualmaker/README.md`/this task card. Preserve snapshots, revision conflict checks, locks and security guards.

Forbidden writes: `raw/**`, `video/**`, data in existing user projects, episode specs/state, approval markers, generated production files, `youtube1/**`, `motion/**`, original youtube checkout and original 23jung source. No dependency installation or media generation. No commit/push in this slice.

## API/data and execution contract

- Keep `visualmaker-job-v1` and the existing four artifact names. All public jobs, snapshots and outputs keep `productionAuthority=false`. `render-preview` stays explicitly blocked.
- API `run` requests dispatch a fixed local worker entrypoint with validated job ID, not caller-supplied commands/paths. They must return asynchronously (202), never execute exports in the Next process. Origin/host/session guards remain unchanged. Surface spawn/dispatch failures clearly.
- The worker can run a specific job and can drain the durable queue using a documented CLI. Queue claims are transactional/CAS; multiple workers must not duplicate a claim. Polling is only a wake-up mechanism, not an in-memory queue authority.
- Worker process receives a resolved data directory so API and CLI do not accidentally use different databases. Do not expose session tokens or sensitive environment data. Fixed child command uses the running Node executable, argument array, no shell, Windows hidden window.
- Keep lease tokens private; reject expired claims at execution/publication and renewal. Support renewal/progress and bounded failure records as appropriate. A cancelled or recovered attempt cannot publish or renew. Claim validation failure must not poison/drain-block unrelated queued work.
- Recovery is explicit after expiry; retry preserves input snapshot and attempt history. Do not automatically loop on permanent failures or recover active work. Document crash behavior honestly.
- Revalidate snapshot-bound local source bytes immediately before executing the adapter; changes after enqueue must fail closed, not export a falsely current package.
- Successful publication is atomic at the database authority boundary; cancellation race loses publication. Downloads continue validating path confinement, bytes and SHA-256. No newly populated previews, source/style/cut PASS or production readiness claim.
- UI explains asynchronous execution and explicit worker CLI behavior; retains poll/stale-revision/actions/downloads and blocked renderer disclosure. No hidden auto-render on page load.

## Completion and verification

Test actual subprocess execution, API dispatch behavior, competing workers, cancellation before publication, expired lease rejection/renewal, crashed claim recovery and retry, snapshot preservation, mutation of local inputs, blocked render and false authority. Use isolated temporary data directories. Run focused VisualMaker diagnostics using existing dependencies (do not copy node_modules into Git); record missing historical/generated production inputs separately. Independent verifier and reviewer inspect command results and focused diff before handoff. Keep source/wiki-only Git policy; no runtime DB or artifacts staged.

## Implementation handoff

The fixed worker entrypoint is `visualmaker/worker.ts` (`--job <id>` or `--drain`). The API starts it with the current Node binary, an absolute data directory, and no shell or caller supplied command. `--drain` is a one-shot queue processor; the API starts one detached process per explicit run request. Successful artifacts keep the original four names and false production authority. Database schema is unchanged. A temporary ignored `node_modules` junction points at the preexisting 23jung dependencies for local verification only.
