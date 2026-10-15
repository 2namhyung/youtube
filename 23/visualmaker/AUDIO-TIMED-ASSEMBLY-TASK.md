# Audio-timed assembly task and contract

## UI handoff and current verification scope

Latest lifecycle verification (2026-10-14): independent focused tests 7/7 and full visualmaker:check 173/173 passed, with standalone typecheck and diff checks passing. Evidence: `C:/Users/every/AppData/Local/Temp/visualmaker-audio-lifecycle-verification-20261014.md`. The earlier 6/6 and 172/172 counts below describe the previous UI handoff snapshot, not the latest suite. The new real Remotion/FFmpeg fixture exercises shared production publisher/reader and stream mechanics using an explicitly injected synthetic contract in an isolated SQLite store. It verifies full/range/hash equality and cancellation, expired lease, changed Plan/voice/authority, and modified MP4/receipt rejection. Its production media GET rejection is an in-process handler call after authority drift, not a live authenticated eligible-job success. Canonical pnpm run check still stops at the same six existing episode-spec findings.

Studio now includes an audio assembly readiness panel with explicit blockers and scoped job controls. Its voiced artifact component parses the bound receipt before OPFS chunked download/playback, and does not use the generic buffer download path. Backend focused tests passed independently 6/6; the full independent visualmaker:check passed 172/172 including both UI tests. Typecheck and git diff --check passed. Independent backend/UI review found no remaining P1/P2 after two backend corrections; a preliminary UI scope concern was withdrawn after verifying the parent's scope-key remount. Actual browser verification confirmed three real EP001 blockers, recheck/loading behavior and the disabled creation button, with no console errors. The UI tests cover blocked real API and forged receipt parsing, not a successful DOM/OPFS playback flow.

Final independent evidence: `C:/Users/every/AppData/Local/Temp/visualmaker-audio-assembly-final-20261014.md`; screenshot: `C:/Users/every/AppData/Local/Temp/visualmaker-audio-assembly-blocked-20261014.png`. The isolated mirror matched 315 source/input files with zero hash mismatches; authenticated readiness/jobs returned HTTP 200 and unauthenticated readiness/audio-media returned HTTP 403. No real data or approval marker was changed. The owned test server on port 58200/PID 13384 and the temporary browser tab were closed; other servers were not stopped.

Browser playback/download currently rejects voiced outputs above 2 GB while the backend output limit is 4 GB. This is a disclosed product limitation, not verified large-output support. Canonical pnpm run check stopped at video:validate-episode-spec with six existing editorial/generated-contract/hash-binding findings; later production gates did not run and no authority files were repaired to obtain a passing result.

The real EP001 report remains blocked by absent generated manifest contracts, render catalog and active cut root. Synthetic renderer execution and helper tests do not prove the full eligible-authority workflow or successful authenticated voiced download. Shared publication/reader mechanics now have isolated cancellation, lease and post-publication tamper tests; their canonical gated end-to-end equivalents remain unverified. Neither this feature slice nor its technical audio result means the whole tool is complete.

## Scope and ownership

### Follow-up: durable success-path verification

Close the remaining audio job lifecycle evidence gap without altering real EP001 authority. Sole implementation writer owns focused audio lifecycle tests/fixture helpers, and only small jobs/audio core corrections exposed by these tests; root owns task-card scope first and releases before implementation. UI, production validators, real raw/media/data/spec/state/generated files, credentials, deployment and commits remain forbidden.

Test-only authority trees may be generated under a fresh Temp root using synthetic input bytes and clearly isolated test approval records. They must never enter the repository's episode directories, active root or UI user database; they are not human approval. Prefer a genuinely valid canonical fixture through unmodified validators and exact input hashes. If a lower-level injected validator/evaluator is necessary to exercise lifecycle mechanics, identify the injection explicitly, keep it inaccessible from production routes/worker, and do not count it as eligible-authority end-to-end proof.

Required evidence: successful durable job with real runner/voiced media and receipt; authenticated full/range/media receipt download and byte/hash equality; rejection of scope/attempt mismatch and modified MP4/receipt; cancellation before publication and lost/expired lease preventing artifact publication; changed snapshot/authority/audio bytes blocking publication and stale download. Test the production publication and serving functions, not only a copied implementation. No test environment variable, user parameter or CLI switch may bypass real production gates. Use owned Temp artifacts only. Report actual executed boundaries and remaining unverified boundaries separately. Run focused tests/typecheck before release; independent verifier and reviewer then inspect the real diff and run full visualmaker:check/canonical diagnostic.

Implement the missing authoritative-input audio assembly adapter, not a scratch narration dub. Retain local Next Route Handlers, SQLite durable jobs, registered Remotion EpisodeTimeline, and installed FFmpeg. Backend implementation is the sole writer until released; frontend and verification follow sequentially. Preserve unrelated changes. No redelegation.

Allowed: visualmaker core/renderer/worker, Studio assembly API and existing job integration, focused tests, package test registration and implementation documentation. UI follows under separate writer ownership.

Forbidden: raw, user data/DB, episode-spec, production-state, generated authority files, active cut manifests, approval markers, historical media, other repository subfolders, credentials, deployments, commits or pushes. No production approvals may be synthesized for the real episode.

## Input authority and eligibility

- Read the current canonical spec/state/contracts/catalog and fixed stage validators. Require audio-timed-assembly eligibility, including final-script/final-voice and strict picture inputs. Actual EP001 currently remains blocked; report exact blockers without changing authority.
- Consume already retimed spec-derived catalog. No measured-only alternate catalog, automatic editorial retiming or Studio script substitution.
- Find exactly one measured final narration file for each shot. Existing narration validator warnings about duplicate files are insufficient: reject ambiguous files, path mismatch, undecodable/no-audio inputs and incomplete coverage.
- Bind manifest voiceover path to the same real local final narration file measured by the narration plan. Record SHA-256, bytes, measured duration, sample rate/channels and exact shot identity. Reject scratch Studio takes.
- Bind all authority, approval, runtime, visual and narration bytes to the execution contract; recheck before publishing. Keep productionAuthority=false and reviewApproved=false. A technical audio-alignment result never grants human approval.

## Timing and engine

- Re-render the full registered EpisodeTimeline using the validated canonical catalog. Do not depend on an obsolete visual job or change the active visual entrypoint.
- Voice start = catalog cut start frame + narration plan pre-roll frames. Measured voice and post-hold must fit its declared cut window. Transition overlap changes catalog start frames: do not concatenate voices sequentially.
- Use explicitly defined frame-to-sample placement at a fixed output sample rate with bounded rounding; no silent time-stretch, arbitrary trimming, gain normalization or crossfade. Reject simultaneous speech windows unless an explicit existing canonical policy authorizes them. Missing policy is a blocker, not permission.
- FFmpeg produces a voiced provisional MP4 and deterministic bound receipt. No captions, background music, final mix or final/master naming before picture lock. Preserve visual frame identity and duration.
- Cancellation, revision conflict, attempt lease, timeout and input drift must prevent publication. Bound buffers, input/output sizes, process lifetime and stderr. Use shell-free argv, no arbitrary URLs/client filesystem paths.
- Validate actual output audio stream, positive decoded audio, exact visual dimensions/fps/frame count, duration and audio placement. Receipts must describe measurements actually performed, not inferred pass labels.

## API/data contract

Expose a read-only authenticated readiness report scoped by projectId/baseRevision, with schema version, canonical fingerprints, per-cut windows, measured voice bindings, validators and explicit blockers. Job creation accepts only existing project/revision/idempotency scope and the new job kind; server derives all input paths. Register durable worker dispatch, job output allowlist and authenticated range/media download using verified file descriptors and receipt/hash validation.

Execution receipt includes job/attempt/snapshot/execution hashes, canonical/visual/audio input fingerprints, cut start/pre-roll/voice sample placements, renderer and FFmpeg identity, measured output audio/video metadata and artifact SHA-256. Separate technical measurements from production/user approval booleans. Final exported names and exact signatures are to be recorded by implementation before UI handoff.

## Verification and completion

1. Focused core/API/job tests: current episode blocked, strict request/auth/revision checks, duplicate/mismatched audio, stale authority, speech collision, overflow, cancellation and artifact tampering.
2. Real installed FFmpeg synthetic fixture: differing pre/post-roll plus transition overlap, deterministic voice onset and silence windows, actual decoded audio and visual frame identity. Fixtures are isolated technical proof, never real episode approval.
3. Independent execution verification and independent diff review, then frontend writer integrates truthful readiness/job/output playback states without treating blockers as success.
4. Run pnpm run visualmaker:check, typecheck and git diff --check. Run canonical pnpm run check separately; record first failing production gate without repairing editorial authority to obtain green checks.
5. No whole-tool completion claim from this slice. Captions/mix/export after picture lock remain separate downstream work. Human focused-diff review is required before commit.

## Investigation evidence

Local code inspection: validate-narration-plan.mjs measures one SH-prefixed file but only warns about duplicates; measured cut duration = pre-roll + ceil(audio seconds * fps) + post-hold. render-authority-lib.mjs advances next-cut starts by transition overlap. Existing EpisodeTimeline/ManifestScene and episode-runner render no audio. Stage validation does not currently validate assembled audio output. These findings motivate the additional strict binding and real execution checks above.

Installed FFmpeg filter help was inspected for adelay, amix, atrim and apad. Official web fetch timed out; no online verification is claimed. Validate chosen filter/sample syntax using real execution fixtures.

## Implemented backend contract

### Durable publication follow-up evidence

The audio publication transaction and verified artifact reader are now shared by the normal production job/download path and focused lifecycle tests. A test-only isolated SQLite job with a synthetic report uses a real Remotion render and FFmpeg voiced MP4, then invokes the actual publication and byte-reader functions. The fixture does **not** pass the canonical production validators or represent human approval. Its validation callback is supplied only by the test; the worker and authenticated route continue to call the fixed canonical `evaluateAudioAssembly` gate.

Focused tests passed 7/7, including whole-file and byte-range equality, receipt hash, scope/attempt mismatch, cancellation, expired lease, changed voice/authority/Plan, and modified MP4/receipt rejection. Typecheck and focused `git diff --check` passed. The real EP001 API still rejects the seeded synthetic artifact because current production authority remains blocked. Successful authenticated route streaming under a genuinely eligible canonical authority tree remains unverified.

- `GET /api/studio/audio-assembly?projectId=<plan ID>&baseRevision=<integer>` returns `{report}` with `schemaVersion=visualmaker-audio-assembly-v1`, canonical visual report, voice bindings, validators, blockers and `renderEligible`. It requires Studio authentication.

- `POST /api/studio/jobs` with `{action:"enqueue",kind:"audio-timed-assembly",projectId,baseRevision,idempotencyKey}` creates a durable queued or blocked job. Arbitrary input paths and render options are rejected. Existing `run`, `cancel`, `retry` and `recover` job actions apply.
- `GET /api/studio/jobs/audio-media?jobId&projectId&baseRevision&attempt&name` serves only `provisional-voiced-episode.mp4` or `.json` through a verified file descriptor. MP4 supports one bounded byte range. The receipt schema is `visualmaker-audio-assembly-receipt-v1` and execution contract schema is `visualmaker-audio-assembly-execution-v1`.
- Audio placement uses 48,000 samples per second and requires `48000 / catalog fps` to be integral. Start sample equals `(catalog cut start frame + pre-roll frames) * samples per frame`; measured decoded samples must fit before post-hold and the next voice start. `ffmpeg` applies sample delays, mixes without normalization, pads the output timeline and copies H.264 video packets. It does not stretch or trim a voice recording.
- Readiness resolves the narration plan from `production-state.json` at `draft_inputs.narration_plan`, matching the stage validator's authority. It fingerprints that exact file. Every unique final voice is decoded to bounded 48 kHz stereo PCM before `renderEligible`; empty, silent, undecodable, inconsistent-duration or changed files block. The runner decodes the same source bytes again and requires exact sample count and audible bounds.
- The result receipt records decoded input voice lengths and audible bounds, actual output audio stream/sample measurements, per-cut audible output windows, copied-video packet hash, decoded first/middle/last frame hashes and MP4 SHA-256. The technical audio-alignment flag is separate from false production/user approval flags.
- Current EP001 remains blocked at missing active cut root. Isolated tests verify alternative state-selected plan binding and mutation detection, unique voice/manifest matching, silent-audio rejection, decoded duration checks, plus two voices with different pre/post timing and an overlapping catalog cut boundary. The fixture measures an intermediate silent interval and the second voice onset in decoded output PCM. These fixtures are not production approval or a complete eligible-authority integration test.
