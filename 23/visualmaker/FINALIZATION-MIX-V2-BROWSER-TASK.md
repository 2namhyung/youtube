# Fixed-gain v2 Studio browser acceptance

## Scope and ownership

Verify Studio -> authenticated enqueue/run -> normal durable worker -> five artifacts -> receipt display/download/playback using a fresh owned synthetic Temp mirror. No seeded successful finalization jobs and no retained already-exported fixture. Root owns this card, package test registration and browser actions; one backend writer owns only `tests/helpers/canonical-export-child.mjs`, `tests/helpers/finalization-browser-server.mjs`, `tests/helpers/prepare-finalization-v2-browser.mjs` and `tests/visualmaker-finalization-browser-prep.test.mjs`. No redelegation. Release before execution verifier and independent reviewer; no other writer may edit concurrently.

Forbidden: product backend/UI/authority behavior, package/dependencies, actual episode spec/state/media/markers/generated roots, user DB/env/credentials, raw/wiki, providers, Git operations or deletions. Existing canonical fixture machinery may create clearly labelled synthetic markers/media only inside its exact `vm-canonical-export-*` Temp directory. Do not interpret these as genuine rights, user approval or production PASS.

## Prep and server contract

`--pipeline --mix-v2 --prepare-browser` must run the unchanged normal provisional and audio-assembly jobs, author synthetic fixed-gain inputs, and confirm eligible finalization. Stop before durableExport. Assert the isolated database contains no finalization job or finalization artifacts, source audio succeeded/current scope, no durable/canonical finalization success proof, and persist a narrow prepared proof identifying plan/revision/source and `test_only=true`, `genuineHumanApproval=false`, `finalizationExecuted=false`, `browserTested=false`.

Server `--prepared-mix-v2` must retain the existing default v1 succeeded-fixture guard, add a separate strict prepared-proof guard, verify the actual isolated DB/source job/no finalization rows, and load the latest current code closure. Explicit path-derived worker/runner seeds must be current and hash-bound; no real generated files or .env copies. Keep physical Temp-root checks, source collision rejection, minimal environment and localhost binding, credential-free evidence. Do not print token/header/HTML. Only normal browser actions enqueue/run finalization after startup.

## Verification and evidence

Syntax/focused helper checks and typecheck before prep. Independently inspect the helper diff and prep proof; reject stale mirrors or seeded success. Browser must observe eligible state, click enqueue/run, see succeeded v2 receipt with false production/review flags, download all five fixed files and validate downloaded bytes/SHA against durable artifact records, play the MP4 to end without media error, and check console/server logs. Preserve source video/frame/thumbnail parity and mixed AAC packet/PCM binding evidence without claiming listening/semantic approval.

Stop at the first broken boundary, fix only within separately assigned ownership, and repeat only the affected verification. Always report HTTP/browser evidence separately from unit/handler tests. Capture owned server PID/tree/port and shut down only that verified tree; confirm no listener afterwards. Leave user tabs 8137/8138 and actual EP001 unchanged. Retain exact synthetic proof paths; no broad cleanup.

Baseline: independent backend 225/225; UI focused 4/4 and tsc passed after two server/client tolerance corrections. UI/helper review found no remaining P1/P2. Latest full suite and fresh browser execution are recorded below. Real EP001 remains timing-draft/36 cuts/no active root; canonical repository check stops at six existing production first-gate blockers.

## Progress evidence

Independent UI focused verification: 4/4 and tsc exit 0, five UI files and actual EP001 spec/state unchanged during verification. Raw logs: `C:/Users/every/AppData/Local/Temp/vm-finalization-ui-verify-ca5b38dab8704a999915f4cde978be20`. Reviewer closed the duplicate rights-evidence SHA and MP4 container duration tolerance P2s. Client boundaries are tested; backend duration threshold edges are not separately covered by focused tests. A separate single-copy change in `studio.tsx` now describes both configured v1/v2 modes while preserving the no-user-approval warning; tsc passed, no hook/props/control changes.

Helper writer released after syntax checks, prep-proof negative test 1/1 and tsc. No prep pipeline/server was run by that writer. The prep test is registered in `visualmaker:check`.

Latest independent suite passed 227/227, zero failures/cancellations/skips, in 332.81 seconds; 51 relevant pre/post file hashes were unchanged. Fresh prep launcher passed in 104.84 seconds. Read-only SQL verified two normal succeeded provisional/audio jobs, zero finalization jobs and zero export artifact rows; actual source MP4/receipt bytes and hashes matched DB/proof. Logs: `C:/Users/every/AppData/Local/Temp/vm-finalization-v2-full-prep-f9d35ffb48e745c5b7ccc4e46ddacfed`.

## Browser observations

Owned fresh fixture: `C:/Users/every/AppData/Local/Temp/vm-canonical-export-4aLC3x`. Browser proof directory: `browser-acceptance-1791933002771/`. Startup verified Studio/list/readiness HTTP 200, eligible scope and redacted readiness. The root clicked enqueue/run in Studio: finalization job `job_35730c29-d13b-4d8c-ab68-ce782bd480be`, attempt 1, project `plan-17187fd7-3eff-48fc-9bea-c5aa79352fd4`, revision 1; source `job_f9f3c8cd-714b-4f02-bf59-b3785c43ebbd`, attempt 1. It went queued -> running -> succeeded and displayed the validated fixed-gain v2 label and no-production-approval warning.

Root clicked OPFS save/play and all five fixed download controls. Observed files: `C:/Users/every/Downloads/visualmaker-episode-001-r1-export (1).{mp4,srt,vtt,png,json}`; no older download was overwritten. Browser video reported 1920×1080, duration/currentTime 3.633333, ended=true, error=null; console errors were empty. Existing CSS autoprefixer warning remains. Screenshot `studio-v2-succeeded.jpg` and `root-browser-observation.json` record root observations, not independent browser replay or listening/visual approval. Independent downloaded-file verification is separate.

Initial navigation timed out during Next compilation; the same created tab loaded HTTP 200 and was rebound. A result-locator deadline occurred while the worker still ran; no enqueue/run action was repeated. The final expected UI state was subsequently observed. The owned tab 13 and verified supervisor 5212/Next 15452/listener 17496/child 5232 were closed/stopped. A separate fresh check returned zero listeners on 63292 and zero owned processes, exit 0; fixture/downloads remain retained. No user production files, authority, approvals or server were removed.

## Independent file verification

Read-only SQLite confirmed the browser-created finalization job succeeded with exactly five artifact rows; each exact downloaded file matched its fixture/DB size and SHA-256 (5/5). Sizes: MP4 72,613 bytes, PNG 25,141 bytes, SRT 57 bytes, VTT 62 bytes, JSON 9,924 bytes. Source succeeded attempt/scope and MP4/receipt hashes matched the final receipt. Independent ffprobe/FFmpeg confirmed H.264 1920×1080, 30fps, 109 frames, 3.633333 seconds; source/export video packets, three sampled decoded frames and thumbnail matched receipt/parity records. Mixed AAC packet/decoded PCM matched encoded/outputAudio records; source PCM matched sourceVoice. Presented samples 174400, full decoded 175104, declared codec tail 704 and clipping zero were bound to fixed-gain 48kHz stereo records. Synthetic rights/approval hashes matched but grant no real permission.

All 101 source-inventory hashes match current repository sources, and all 81 original-evidence hashes match retained files. Retained copies match 100/101: Next development regenerated only `next-env.d.ts` from `.next` to `.next-dev/types/routes.d.ts`, as configured by unchanged `next.config.ts`. Reviewer confirmed this is generated type-declaration drift, not a missing/stale product dependency. Fixture authority hashes differ from real EP001 by design; actual EP001 retains the baseline spec/state hashes and no production approval. Browser observations remain root-owned; the separate verifier independently checked files/DB/FFmpeg and did not interact with the browser.

Independent artifact result locator: `C:/Users/every/AppData/Local/Temp/vm-browser-artifact-verify-9437447a0c4f49e0a2e9bf02f66ae235/independent-artifact-verification-summary.json`, 4,960 bytes, SHA-256 `703e1fa3faec1ebdd8c0c3c04ae7d2af36304ecd99edda5046b42d96291b0dc9`. It summarizes already captured outputs; the artifact SQL/download/FFmpeg raw terminal transcript was not retained (`rawTerminalTranscriptRetained=false`). The source inventory audit has a separate raw log in that directory. This retention limit is distinct from the full-suite/prep raw logs above and from root browser screenshots/observations.
