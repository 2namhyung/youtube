# Approved post-lock transition — task and data contract

## Purpose / ownership / boundaries

Make the real post-lock output path usable without invalidating a successful audio source or weakening existing readers. Main owns this task card, suite registration and final documentation. One backend writer owns the paths below, followed by a separate verifier and reviewer. No redelegation; preserve all unrelated edits.

Allowed implementation: `visualmaker/core/post-lock-transition.ts`, `core/jobs.ts`, `core/audio-assembly.ts`, `core/finalization.ts`, `renderer/audio-assembly-contract.ts`, necessary audio runner v1/v2 parsing compatibility, `renderer/finalization-contract.ts`, focused transition/finalization/audio tests. No UI/API/worker job-kind changes in this slice. Forbidden: real spec/state/generated/active manifests/approval markers/raw/wiki, user DB/media, environment or dependencies, commit/push. Synthetic fixtures live only in isolated temp data.

## Exact authority DAG

Before audio generation, spec may explicitly declare only `post_lock_output={version:1,addendum_path:<safe episode-relative canonical reference>}`. Spec bytes must remain unchanged after the audio job; no inline outcome hashes in spec. Absent declaration blocks finalization; existing historical inline selection is not promoted.

Read addendum from this exact locator with a closed schema:

```ts
{schema_version:1,episode_id:'episode-001',
 authority:{episode_spec_sha256,pre_lock_state_sha256,source_execution_contract_sha256},
 selection:FinalizationSelection}
```

Selection contains the actual `job_<UUID>` ID, attempt, video/receipt hashes, canonical final script path/hash, exact caption code-point spans, picture/caption marker hashes, explicit passthrough mix and thumbnail frame. Markers keep the prior acyclic source/receipt/script/caption bindings and never reference addendum/spec whole hashes. Addendum fingerprints enter the finalization report/receipt so edits invalidate execution.

New audio execution v2 contracts preserve versioned `authoritySnapshot` with fixed spec/state paths, exact SHA-256 and original bytes (bounded canonical base64). The complete serialized execution contract must be at most 5,000,000 bytes before enqueue. Capture only when eligible, and compare captured SHA against evaluated report fingerprints before storing. Bind it through DB execution contract SHA and receipt executionContractSha256. Preserve v1 reads for old audio behavior; old contracts lacking snapshots cannot be retrofitted or used for archival finalization. Add the canonical script source bytes/hash explicitly to audio fingerprints.

## Strict transition validation

Authenticate original spec/state snapshot bytes and hashes against source contract fingerprints. Current spec and every other visual/audio fingerprint file must remain byte-identical. The only state value changes allowed are `/stage` and `/picture_lock/status`, `/picture_lock/approved`, `/picture_lock/final_qc_marker`. Require old stage `final-voice-locked` or `audio-timed-assembly`, old picture approved=false, and a recorded passing genuine audio-timed stage gate. Current stage must be `picture-locked`, picture status `locked`, approved=true, final_qc_marker the verified marker path. Picture object has exactly its three declared keys. Other JSON fields preserve types, keys, values and array order; no new/deleted authority fields. State key ordering/formatting can be structurally equivalent, not described as byte-identical. Reject duplicate keys, non-finite parsed numbers, malformed/unknown snapshot/addendum fields, unsafe/symlink paths, over-limit reads.

## New reader, not a bypass option

Add `readAudioAssemblyForFinalization(id, {projectId,baseRevision,attempt}, signal?)` as a separately gated entrypoint. Do not add caller-controlled ignore flags, validation callbacks, fake gates, or environment bypasses. Existing `audioAssemblyArtifactFile` and `readVerifiedAudioAssemblyArtifact` retain current exact fingerprint behavior. A private shared byte/receipt reader may remove duplication only if every public caller always applies its own mandatory authority checks.

The new reader requires exact succeeded job/attempt, matching immutable snapshot/current project, completed successful attempt and cleared lease, execution contract/report/snapshot hashes, exact two artifact list/paths/receipt bindings/MP4 bytes+hash, snapshot-based allowed transition, unchanged non-state fingerprints, and actual current `validate-production-stage.mjs --lock picture-locked`. Check state/addendum/markers and output stability before and after; release FD on every failure. Current finalization evaluates canonical script/caption/marker contracts as before and binds addendum authority hashes to this verified source. Finalization engine rechecks all report fingerprints. All output approval/production flags remain false.

## Verification / acceptance

- Regression actual `job_` IDs are accepted, UUID-only is rejected.
- Unit strict snapshot/transition/addendum tests: legitimate transition accepted; no snapshot/v1 rejected for new reader; any unlisted state/spec/asset/script/runtime change rejected; duplicate keys/unknown fields/unsafe paths rejected.
- Exercise durable succeeded job/attempt/artifact records plus real FFmpeg bytes and receipts in isolated data. Old readers still reject post-lock drift; new reader's shared archival verification can accept only the exact allowlist and matching markers, and must reject artifact/receipt/attempt/snapshot drift. If full canonical current stage success is not built, explicitly separate lower-level mechanics tests from production eligibility; no synthetic success claims.
- Work toward a self-contained minimal canonical episode mirror using real generator/validators/enqueue/worker. Existing helper depends on absent real generated contracts and is not full E2E proof. Report precisely what executes and what remains unverified; do not fabricate real approvals or modify actual EP001 to satisfy tests.
- Focused tests + `pnpm exec tsc --noEmit`; separate verifier runs full `pnpm run visualmaker:check`, canonical `pnpm run check`, diff check. Reviewer checks actual code and execution evidence. Real EP001 remains source/approval blocked. No tool-complete claim from this slice.

## Independent result — 2026-10-14

- Combined transition/audio/finalization focused tests: 16/16 passed. Registered complete VisualMaker suite: 182/182 passed, with typecheck; standalone typecheck and diff check passed (CRLF warnings only).
- Strict JSON, snapshot hashes, state transition allowlist, unchanged source fingerprints, marker/addendum binding and actual `job_` IDs are exercised. Existing real Remotion/FFmpeg audio and soft-caption/thumbnail mechanics remain passing.
- Durable synthetic v1 source rejects missing snapshot; synthetic v2 rejects the real EP001's missing locator. The actual current picture-lock validator fails as expected. **No positive canonical `readAudioAssemblyForFinalization` or finalization evaluator success has been verified.** Unit transition tests use isolated test states and explicit synthetic passing-stage evidence.
- Canonical repository check still stops at episode-spec validation with six existing byte drift/missing contract/hash-binding failures; later gates were not run. Real authority/data/markers were not changed.
- Independent reviewer found no additional P1/P2 code defect after UTF-8/media-limit corrections and confirmed the existing strict readers remain intact. Execution evidence: `C:/Users/every/AppData/Local/Temp/visualmaker-post-lock-transition-verification-20261014.md`.
- Next: self-contained eligible technical episode fixture to exercise the real source-reader success path and generators/validators, then durable finalization job/API/Studio integration. No commit/push until human focused diff review.
