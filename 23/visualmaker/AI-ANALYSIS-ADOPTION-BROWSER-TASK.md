# Isolated browser verification of Studio analysis adoption

Verify the user story from individual segment selection through authenticated POST, one SQLite revision, the exact saved receipt and its Studio rendering. Use an owned synthetic project with eligible, locked and merged rows. This acceptance covers local planning adoption, not real model quality, billing or production approval.

## Ownership and boundaries

After the UI writer is released and independent diagnostics finish, one fixture writer owns narrow changes to `tests/helpers/prepare-ai-analysis-browser.mjs`, `tests/helpers/ai-analysis-browser-server.mjs` and `tests/visualmaker-ai-analysis-browser-prep.test.mjs`. Root owns this card and subsequent actual browser interaction. Independent read-only fixture review and execution verification follow writer release. No redelegation. Preserve the default two-paragraph fixture and unrelated changes.

Forbidden: product UI/backend/schema, package/lock/env/credentials, actual user data, raw/wiki, episode specs/state, generated production files, approval markers, sibling projects, live providers and Git mutation. Use `C:/Users/every/Documents/project/youtube-visualmaker/23`. Do not modify files while another verifier is recording their before/after hashes.

## Synthetic adoption fixture

Add an explicit local preparation variant, not an HTTP or environment test fallback. Prepare five Korean paragraphs: two independently adoptable singleton scenes, one direction-selected and locked scene, and two segments merged into one scene. Use existing planning commands before creating the original queued job; then edit the first beat to make that job exactly one revision stale, as in the default fixture. Do not fabricate database job, lock, review or approval rows directly.

Retain the real core and installed SDK test adapter preparation: one succeeded current analysis, one needs-review call, one current queued job, one stale queued job and one cancelled-before-call job. Exactly two preparation SDK mock calls and zero live provider calls are permitted. All five exact source segments must be present in the successful proposal, including unavailable mappings. Provider configuration remains absent in the browser server, so paid enqueue/run controls stay unavailable.

Bind the initial Plan bytes/revision/script/snapshot, baseline revision-history count, exact job/checkpoint/artifact identity and expected eligible/locked/merged segment, beat and scene mappings in the owned fixture proof. Declare `test_only:true`, `productionAuthority:false`, `humanApproval:false`. Validate the mappings and successful current proposal through actual core readers before startup. The original fixture proof remains a startup baseline; do not weaken startup identity checks to make a changed post-adoption Plan pass the original proof.

Use a fresh canonical real `vm-ai-browser-*` OS Temp directory and the existing ownership marker/path checks. Reject linked, foreign and swapped paths. The mirrored source closure must include the new adoption route/client and all changed child components without copying user data, credentials or production inputs. Keep the existing bounded closure and process ownership controls.

## Preparation verification

Execute preparation tests for both default and adoption variants, proving exact singleton eligibility, unavailable locked/merged rows, initial Plan/proposal/hash consistency, baseline history, checkpoint outcomes and mock call count. Invalid variant arguments must be rejected rather than silently falling back. Verify source inventory includes `/api/studio/ai-analysis-adoption` and its bounded core/client dependencies. Retain raw evidence in a fresh owned Temp directory and record any platform skip explicitly.

Do not start the server until the fixture writer releases ownership and independent review and preparation execution complete. The current loopback server supervisor must retain reduced environment, free-port discovery, bounded readiness probes and owned shutdown. Never print the session token or inherit AI credentials. User servers/tabs at ports 8137/8138 are outside this fixture.

## Browser and persisted evidence

Root opens only the owned server tab using the approved computer-use surface. Confirm the synthetic warning, original passages, before/proposed messages and four notes. Initially all individual selection boxes and direction-reset acknowledgement are unchecked and save is disabled. Locked and merged rows are visibly unavailable with reasons. Selecting only eligible rows still requires reset acknowledgement; no select-all or automatic adoption is permitted.

Select both eligible rows, acknowledge the direction reset and submit one batch. Confirm the saved revision increments once, the historical receipt shows both exact original/applied records and provenance, and old proposal/selection/acknowledgements disappear after the keyed scope change. Inspect browser errors, real server request outcomes and persisted document/revision history. A subsequent current-project reload must retain the receipt and show the original success as stale, without enabling another adoption from its old snapshot.

An independent authenticated checkpoint must confirm exact receipt/Plan agreement, one new revision-history row, unchanged script/history/assets/narration/timing, unchanged locked and merged scenes, valid draft reset for only selected scenes, unchanged original artifact bytes/SHA and unchanged AI job/attempt counts. Old-base adoption retry and old proposal reads must reject with no-store and leave document/history unchanged. Malformed confirmation requests may be checked only against this owned fixture and must not mutate it. Do not use a mock API response as browser evidence.

The synchronous child-write gate is supported by focused executable tests and code review; claim browser race coverage only for interactions actually observed. Do not initiate real external media collection, recording upload or paid AI calls solely to demonstrate a lock. Missing provider configuration is expected, not a reason to enable a fake key.

Stop the exact owned server and descendants after inspection, verify its listener is gone, and close only the owned tab. Retain screenshots, logs, initial proof and post-adoption checkpoint; do not rewrite their baseline hashes. Report fixture preparation, actual browser behavior and persisted evidence separately. Neither this acceptance nor green tests completes the whole video-production tool.

## Local browser acceptance

On 2026-10-14, independent preparation verification passed 8 tests with one existing Windows file-symlink `EPERM` skip. Typecheck passed; registered `visualmaker:check-ai` passed 54 of 55 tests with the same skip. The default and adoption variants, proof-tamper rejection and 114-file source closure were checked. Twenty-three scoped hashes and the EP001 spec/state remained unchanged. Evidence is retained under `C:/Users/every/AppData/Local/Temp/ai-analysis-adoption-browser-verification-20261014-104907`.

Actual Studio interaction used the owned synthetic adoption fixture `vm-ai-browser-ANBFQq`. All five rows began unchecked; the locked row and both merged rows were disabled with reasons. Selecting the two eligible rows did not enable save until the direction-reset acknowledgement was checked. One submission saved revision 5 to 6, cleared the old proposal and selection, and displayed both original/applied records and their four notes. Reload retained the receipt and made the original successful job stale. Browser error logs were empty. This observed disabled-controls state is not a browser race test.

Independent authenticated API and read-only SQLite verification confirmed the exact two-record receipt, one appended revision, unchanged script/assets/decisions/nonselected beats, unchanged locked and merged scenes, selected-scene draft resets with timing retained, and unchanged five jobs, five attempts and original artifact. The old proposal GET returned 409/no-store; old-base POST returned 409 and malformed confirmation POST returned 400, with no extra stored revision. Those two POST response headers were not retained because the verification harness stopped before saving them; automated rejection tests separately cover no-store. Checkpoint evidence is at `C:/Users/every/AppData/Local/Temp/ai-adoption-post-ui-checkpoint-20261014-105644`.

The owned server returned one successful adoption POST and was stopped with its descendants; zero owned Node processes and zero listeners remained on port 60415. Owned tab 15 was closed. Screenshot, reloaded DOM, browser errors and server logs remain in `C:/Users/every/AppData/Local/Temp/vm-ai-browser-ANBFQq/browser-run-1791942657942`. User ports 8137/8138 and their tabs were outside the interaction. Preparation used two SDK mocks and zero live calls; this acceptance does not establish actual provider quality, billing or human production approval.
