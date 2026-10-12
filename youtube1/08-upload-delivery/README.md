# 08 Upload and delivery

Stage 08 uploads only the exact Stage 07-approved video, thumbnail and script hashes. YouTube uploads always start `private`, even when the API application is audited. Public visibility is a separate exact-job action after provider processing and explicit human approval.

Local job states are `draft | consented | uploading | processing | published | failed | deleted`. Here `published` means provider processing succeeded; the YouTube `privacy` field remains authoritative and is initially `private`. Idempotency checks scan the complete valid local job inventory, ignore malformed partial JSON, exclude deleted/removed jobs, and use an exclusive per-key claim so concurrent identical requests cannot double-upload. The UI displays only the newest twelve jobs.

Safe maintenance commands resolve the platform ID from a local job instead of embedding release/version IDs:

```powershell
node scripts/youtube-maintenance.mjs status --job <youtube-job-id>
node scripts/youtube-maintenance.mjs sync --job <youtube-job-id>
node scripts/youtube-maintenance.mjs make-public --job <youtube-job-id> --confirm-public
node scripts/youtube-maintenance.mjs delete --job <youtube-job-id> --confirm-delete
node scripts/retry-youtube-thumbnail.mjs --job <youtube-job-id> --audit ../07-quality-assurance/runs/<version>.stage07-audit.json --confirm-thumbnail
```

`status` is read-only. `sync` updates only the matching local job. `make-public` requires a fully processed private job and verifies the exact ID before and after mutation. `delete` updates the local job to `deleted` only after the exact remote ID is confirmed absent.

The YouTube video ID is persisted immediately after the remote video PUT and before thumbnail I/O. Thumbnail failure therefore remains a repairable warning and never causes a second video upload. Thumbnail retry requires a private eligible exact job, matching account/project/version and video/registry/thumbnail hashes, plus remote video preflight and post-verification. Caption files are preserved in the editable handoff but are not uploaded by the current YouTube adapter; captions require a later authenticated implementation or manual upload.

OAuth material remains under ignored runtime paths. Do not use `api.txt` as an application input.
