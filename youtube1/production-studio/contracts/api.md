# Production Studio API v1

The shared local control plane runs at `http://127.0.0.1:8766` and keeps its
SQLite database and source bytes under `production-studio/data` (override with
`STUDIO_DATA_DIR` and `STUDIO_DB_PATH`). It is a pre-production workspace for
the newsroom (`내무습다`) and shopping shorts profiles. It does not publish,
upload, or approve final video work.

## Session and mutation rules

`GET /api/studio/session` returns a process-local random token. Every `POST`
must send `X-Studio-Token` and a unique `Idempotency-Key`. The server accepts
only loopback hosts. Browser origins are exact allowlist entries from
`STUDIO_ALLOWED_ORIGINS`, with local development ports and
`https://production-studio-rnrwn1123.vercel.app` as defaults. Unknown origins,
including preflight requests, are rejected.

Every project-changing request carries `expected_revision`. A successful
change appends an immutable project revision and increments the revision
number. A stale revision receives `409 REVISION_CONFLICT`; reusing an
idempotency key with a different request receives `409 IDEMPOTENCY_CONFLICT`.

## Workflow endpoints

- `GET /api/studio/health`, `/profiles`, `/projects`, `/sources`
- `POST /api/studio/projects` with `{name, profile, script?}`
- `POST /api/studio/projects/{id}/analyze` with `{script, expected_revision}`
- `POST /api/studio/sources` with JSON metadata or multipart `metadata` plus an
  optional `file`. Metadata includes `title`, `source_url`, `creator`,
  `license` (`CC-BY`, `CC0`, `public-domain`, `permission`, `owned`,
  `unknown`), `license_url`, `rights_evidence`, `rights_confirmed`, `role`
  (`context`, `evidence`, `broll`, `character`), and independent
  `allow_transform`, `allow_imagegen`, `allow_omni` flags. Optional `context`
  or `origin` values are retained for provenance; generated or generic context
  is blocked if it is classified as case evidence.
- `POST /api/studio/projects/{id}/shots/{shot_id}` with
  `{expected_revision, source_id?, in_seconds?, out_seconds?, visual_mode,
  notes?, query?}`. The server validates known media duration and keeps source
  rights separate from shot/evidence status. Context sources are never
  promoted to case evidence.
- `POST /api/studio/projects/{id}/conform` with
  `{expected_revision, text, change_note, facts_confirmed}`. The exact before
  and after texts are retained. `facts_confirmed` is an operator attestation;
  it is not an independent factual approval, and later voice/timeline/render
  work is invalidated.
- `GET /api/studio/projects/{id}/handoff` returns the path-free,
  hash-bound `production-studio-preproduction-handoff-v1` packet. Blockers
  remain visible and provider/render/upload/publication flags are false.
- `GET /api/studio/projects/{id}/export` downloads a path-free ZIP containing
  `project.json`, the exact current `handoff.json` packet, `attribution.md`,
  and `SHA256SUMS.json` with byte hashes for every payload member. The export
  preserves current revision, blockers, media artifacts, and all
  pre-production gates as `false`; it never grants production or publication
  authority. Source bytes and hashes are rechecked before export.

## Media, CC candidates, and WISE

The default `backend.main:create_app` mounts the shared media router on the
same `StudioStore`. It never creates a second source catalog.

- `GET /api/studio/sources/{source_id}/file` serves a previously registered
  source after contained-path and byte checks. It does not accept a path from
  the browser.
- `POST /api/studio/projects/{id}/composite` accepts
  `{expected_revision, background_source_id, character_source_id, x, y,
  scale, duration}`. `expected_revision` is required for a canonical project
  and is checked before and during artifact binding. Coordinates are bounded
  to `-10000..10000`; `scale` is `0.01..10`; and `duration` is `0.1..60`
  seconds (defaults are `0`, `0`, `1`, and `3`). The project must exist, both
  sources must be locally registered PNG assets, and the source rights must
  allow the requested local transformation. The `Idempotency-Key` determines
  the stable composite ID; a reused key with a different body is rejected.
  The response contains `id`, decoded media metadata,
  `production_eligible: false`, the bound project revision, and a path-free
  `file_url`.
- `GET /api/studio/projects/{id}/composites` lists path-free composite
  metadata. `GET /api/studio/projects/{id}/composites/{composite_id}/file`
  serves the generated MP4. A composite is a review artifact; it does not
  approve provider execution, render, upload, or publication.
- `GET /api/studio/youtube?q=...&max_results=1..25&page_token=...` searches
  only YouTube Data API Creative Commons candidates. Results carry
  `rights_state: candidate-unconfirmed`, `attribution_required: true`, and
  `downloaded: false`. `status` is `available`, `quota`, or `offline`.
  Quota/rate-limit errors are surfaced and never trigger key rotation; a
  second configured key is used only for an authentication failure.
- `GET /api/studio/wise/status` reports `available` or `offline` and may
  include an active local index run. `POST /api/studio/wise/search` accepts
  `{query, top_k?, search_in?}`. `query` is 1–500 characters, `top_k` is
  1–50, and `search_in` defaults to `auto` with the supported visual modes
  `auto`, `image`, and `video` (the adapter also accepts the explicit
  compatibility modes `audio` and `av`). It returns `results` or an explicit
  `offline`/`unavailable` response. Results preserve WISE timestamps and are
  mapped back to known source IDs and hashes; unknown media remains unresolved.
- `POST /api/studio/wise/index` accepts one to 500 registered `source_ids` and
  returns a `queued`, `running`, `ready`, or `failed` job. The job is
  idempotent by `Idempotency-Key`; `GET /api/studio/wise/index/{job_id}` reads
  its status. Indexing searches the acquired local collection only. It does
  not download YouTube candidates, confirm rights, or admit a production
  source automatically.

After media decoding and hashing, the worker binds a composite or WISE
artifact to the project with
`record_media_artifact(app, project_id, expected_revision, artifact)`. The
artifact must contain an ID, SHA-256, source IDs, and
`production_eligible: false`; this appends the expected project revision and
surfaces it in the handoff packet without opening any final gate.

## Native and media seams

`GET /api/studio/native/newsroom` probes only the fixed local engine at port
3002; `GET /api/studio/native/shopping` probes only port 8765. Results are
read-only and path-sanitized. A media worker may use
`backend.integration.get_store`, `resolve_source_path`, and `get_source` and
register an explicit router with `attach_media_router` (the media router's own
prefix is preserved by default); no arbitrary URL proxy
or implicit provider execution is exposed.

After a composite or WISE-derived pre-production artifact is independently
decoded and hashed, the media worker can call
`backend.integration.record_media_artifact`. That helper appends a
path-free project revision and keeps `production_eligible=false`; it does not
approve render, upload, or publication.

`backend.main:create_app` includes the local media router before the static SPA
fallback. The lower-level `backend.app:create_app` accepts an explicit
`media_router` argument for tests and custom embedding. This is the seam used by the local FFmpeg,
YouTube CC candidate, and WISE worker; the worker must keep provider execution
and source admission as separate gates.

Project responses expose only the active shot revision in `shots`; superseded
shot records remain under `shot_history` for audit. Source responses include a
non-path `preview` status and the original byte hash/size. A preview does not
change the source's rights or evidence role.
