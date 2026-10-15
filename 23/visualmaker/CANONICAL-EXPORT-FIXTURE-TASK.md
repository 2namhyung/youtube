# Canonical export technical fixture — task card

## Purpose / owner

Prove the currently unverified successful audio → picture-lock transition → finalization evaluator → FFmpeg export path using actual unchanged production generators/validators and normal job enqueue/claim/execution in an isolated test mirror. This is technical capability evidence with synthetic test approvals, never real episode human approval or completion of the entire tool.

One frontier implementation writer owns new `tests/helpers/canonical-export-fixture.mjs`, `tests/visualmaker-canonical-export.test.mjs`, and a small fixture child driver under `tests/helpers/` if needed. Root owns task documentation/package suite registration after writer release. No redelegation; preserve unrelated edits. Independent verifier and reviewer follow separately.

## Allowed and forbidden

Allowed edits are only the owned test/helper files. Any discovered product defect must be reported with exact evidence for a separate bounded ownership handoff, not silently bypassed or fixed in fixtures. Use `apply_patch` for repository edits. Generated ephemeral fixture files/media/SQLite are created by these test helpers only inside a uniquely allocated, validated Temp directory.

Do not edit real `video/episodes`, generated files, active manifests, raw/wiki/data/approval markers, env/dependencies, API/UI/job code, user DB/media, or Git state. Never copy credentials, `.env`, real data or full large media. Reuse read-only code/dependencies in a bounded mirror; copy only the runtime/validator dependency closure. Any node_modules linkage is explicit dependency access, not a production input. Cleanup only exact owned Temp root after resolved containment validation; retain proof outputs on request. No deployment/provider/network/paid generation/server changes.

## Existing data/API contracts

Fixed EP001 authority remains `spec -> generated manifest contracts -> active manifests -> generated catalog -> EpisodeTimeline`. Fixture authors its own complete explicit synthetic source-selected spec/state and input source/rights/materialization evidence, then invokes real generators; generated contracts/catalogs are never edited by hand. Use real decodable images and positive audible recordings; no empty media or silence. Source-photo mode is preferred for a small auditable flow; number of planned cuts must satisfy unchanged validators, not quotas invented by fixture. Never clear source requirements as the old helper does to skip acquisition gates.

Spec declares stable `post_lock_output={version:1,addendum_path}` before plan import/audio enqueue; spec bytes remain frozen afterwards. Script source hash, ordered narration and plan origin agree. Active manifests bind generated contract/spec byte hashes, assets, runtime realization, source provenance and required typed approval/QC records. Test approval records are explicitly synthetic (even where required schema field reviewer=user); do not describe their presence as genuine human review.

Run actual production/render/source/asset/lifecycle validators with their normal canonical paths, not stub commands, mocked functions, edited validator source, environment bypasses, caller validation callbacks, path override routes or prewritten passing reports. Import Studio plan from fixture spec through normal adapter, then normal audio enqueue -> claim -> execute/worker -> succeeded attempt and real published MP4/receipt. Do not INSERT a succeeded job/report/contract/artifact or replace enqueue output in SQLite.

Perform explicit fixture-only picture approval/state update restricted to the existing four-field allowlist. Construct typed addendum/caption markers bound to real published MP4/receipt/script and measured cut timing. Assert old strict reader rejects state drift, new archival reader succeeds, canonical finalization evaluator is eligible, and actual finalization engine produces MP4/SRT/VTT/PNG/receipt with required frame/packet/cue integrity. Preserve productionAuthority=false/reviewApproved=false outputs.

## Verification and stopping rules

Record exact commands, gate failures, real source job ID/attempt/contract/receipt/video hashes and export artifact hashes. Include minimal negative cases after success (alter approved marker/script/voice/addendum/state/MP4 then require rejection). Count how much of the full path actually ran; never label lower-level helper success as normal enqueue/worker proof.

Stop at the first verified missing/broken boundary, report evidence, and fix the fixture's legitimate authoring inputs or request product ownership where the code is defective. Do not weaken production validation to obtain green tests. More than two failures from the same cause requires reporting/escalation rather than endless retries. Main goal remains active if this slice is incomplete.

Writer runs focused test and typecheck; independent verifier reruns focused/full tool check/canonical repository first failure; reviewer audits fixture and actual execution logs. Keep full repository diagnostic failures separate from a passing isolated technical fixture. No commit without focused human diff review.

## Verified technical checkpoint

Independent focused acceptance passed (1/1, about 83 seconds), with retained proof at `C:/Users/every/AppData/Local/Temp/vm-canonical-export-ClcL1z/technical-proof.json`. Normal import, provisional enqueue/claim/execute/publication, audio enqueue/claim/execute/publication, restricted picture-state transition, archival reader, canonical finalization evaluation and actual FFmpeg export all ran. Default spec validation and all recorded generator/validator commands passed. Five outputs were verified: 1920x1080, 30fps, 109-frame MP4; SRT; VTT; PNG; receipt. Audio/video packet hashes, sampled frames and thumbnail pixels matched the source; six input mutations were rejected. Old strict readers rejected state drift; the archival reader accepted the allowed transition.

Independent review found no additional P1/P2 and confirmed no seeded succeeded jobs, mocked validators, cleared requirements or real authority/data/environment mutations. Test approvals remain synthetic, `genuineHumanApproval=false`, `productionAuthority=false`, `reviewApproved=false`. This is a one-cut, 3.633-second technical fixture, not real EP001 production, rights/human approval, API/UI end-to-end verification or whole-tool completion. The acceptance is now registered in `visualmaker:check`; full registered-suite reexecution follows. Real EP001 still has its six existing canonical spec blockers. No commit/push.

Historical registered-suite independent execution: `pnpm run visualmaker:check` passed typecheck and 194/194 tests (about 93 seconds). `pnpm run check` stopped at the first real EP001 spec gate with the same six blockers; later gates did not run. At that checkpoint finalization called the evaluator and engine directly, without its own durable job/API.

## Subsequent durable/API fixture

The fixture now exercises actual finalization readiness/enqueue/run/download handlers, dispatch process, worker and child FFmpeg, followed by atomic publication of exactly five verified files. Released author acceptance passed 1/1 in 234.47 seconds; retained proof is `C:/Users/every/AppData/Local/Temp/vm-canonical-export-0jfEDm/technical-proof.json` and `durable-export-success.json`. Independent review recalculated all five published file hashes, checked the four actual attempt outcomes and 76 unchanged copied product-file hashes, and found no additional P1/P2. The 46 API/FD checks cover authorization/scope, full/range/sidecar downloads, six input and five output mutations, lease recovery, publication rollback/retry, child-start cancellation and shared stream cancel/drift FD closure. Fault injection only changes an owned Temp lease expiry and temporarily adds an owned artifact INSERT trigger; it does not seed success or weaken validators.

Final independent `pnpm run visualmaker:check` passed typecheck and 197/197 tests (219.2 seconds, zero failures/skips); its canonical fixture passed in 218.95 seconds. Independently retained proof: `C:/Users/every/AppData/Local/Temp/vm-canonical-export-cBIwOK/technical-proof.json`. `pnpm run check` still stopped at the real EP001 first spec gate with the same six blockers; later gates did not run. Studio UI and HTTP-server/browser E2E remain unverified. Cancellation does not include observed active FFmpeg PID evidence, and route catch/finally FD closure is not directly instrumented. All approval records remain synthetic and output authority/review flags remain false. Real EP001 and its existing blockers are untouched. See [durable/API task](FINALIZATION-JOB-API-TASK.md) for the new product contract.
