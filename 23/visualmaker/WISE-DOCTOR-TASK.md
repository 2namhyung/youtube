# WISE runtime diagnostic

## Purpose and ownership

Provide a read-only local CLI diagnostic before attempting the existing WISE library bridge. This does not implement registration or indexing. The canonical app is `youtube/23`; the sibling Production Studio remains unchanged. One implementation writer owns only `visualmaker/scripts/wise-doctor.mjs`, `tests/visualmaker-wise-doctor.test.mjs`, and the package scripts needed to run those files. No nested delegation.

Forbidden: changes to sibling projects, raw/media, data, SQLite contents, environment files, production authority, approval markers, installation, model downloads, service startup, registration, or indexing. Do not import/instantiate StudioStore: its constructor writes.

## CLI/data contract

`pnpm run visualmaker:wise-doctor` prints a bounded JSON report and exits nonzero when prerequisites are missing or unsafe. Resolve the existing bridge defaults and overrides (`WISE_STUDIO_ROOT`, `STUDIO_DATA_DIR`, `STUDIO_DB_PATH`, `WISE_URL`). Inspect only those paths and the fixed backend module names used by the bridge. Do not recurse or expose absolute paths, credentials, environment values, source metadata or database contents in output. Report individual missing/unsafe prerequisites, not just the first failure. Reject symlinks/junctions in path ancestry, matching the bridge. Existing database and sources directory are prerequisites; never create them. If present, report existence only, not schema/rights/index validity.

Probe only the configured loopback TCP endpoint with a short timeout, no HTTP request, proxy, redirects, subprocess, or network discovery. Reject credentials, query/fragment, invalid ports, non-loopback destinations and non-HTTP(S) schemes before any connection. A reachable port is only `tcp-reachable`, never verified WISE or semantic-search readiness. Return `productionAuthority:false`, `semanticSearchVerified:false`, and status `blocked` or `prerequisites-present-unverified`, with safe actionable reason codes. Do not claim model availability or index health from filenames. No required legacy `active.json` path: different WISE configurations may use different indexes.

Export an injectable diagnostic function without running the CLI on import. Tests use temporary synthetic filesystem paths and injected TCP probing; verify missing/unsafe paths, valid defaults/overrides, malicious URLs, bounded timeout behavior, partial failures, no network call for invalid destinations, no secrets/paths in serialized output, reachable-not-verified semantics, and no files created/changed. Direct CLI execution must use real bounded probing. Package scripts: `visualmaker:wise-doctor` and `visualmaker:check-wise-doctor`.

## Completion

Run focused Node tests and the doctor on the current host; a blocked exit is the expected honest result when the catalog/service is absent. A separate verifier reruns focused tests plus existing WISE bridge regression and typecheck. An independent reviewer checks actual diff and execution evidence. No commit without focused human review. Actual source registration and explicit asynchronous indexing remain the next integration step after runtime setup.
