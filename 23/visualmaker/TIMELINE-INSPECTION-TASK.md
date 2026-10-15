# Timeline inspection task — 2026-10-13

## Purpose and ownership

Add a read-only Studio timeline inspection of current episode cut order, existing canonical preview availability, and separately labelled manual narration timing drafts. One implementation writer owns core/API/UI/tests and focused README/IMPLEMENTATION updates. Parent owns this task card; no concurrent writes. Preserve all unrelated edits.

Allowed: visualmaker/core, src/app/api/studio/timeline, src/components/studio, focused tests, package.json test registration, VisualMaker implementation docs.
Forbidden: raw, production episode files/spec/state/contracts/catalog/manifests/media/approval markers, user databases, .env, youtube1/motion, git commit/push. No new renders or placeholder media; no production timing adoption.

## API/data contract

- Authenticated GET timeline with project id and baseRevision. Reject stale revision and foreign scopes; no-store JSON, bounded response. JSON download is metadata only, not a video or media backup.
- Versioned report binds project/revision/script/snapshot hashes and current episode spec/state hashes. Only exact imported EP001 origin can claim canonical episode order; edited/non-origin projects show actionable mismatch rather than invented mapping.
- Rows retain all current spec cuts, their IDs/order/estimated time windows and mapped scene IDs. Time estimates are not audio synchronization. Missing inputs and stale/invalid jobs remain explicit gaps.
- Final scope after independent performance review: metadata-only. Never call canonicalArtifactFile/evaluateCanonicalCut or read MP4/receipt bytes during timeline GET. A scoped successful job record is explicitly unverified, preview.available=false, and directs the user to the existing authenticated job playback path. Recent-job/candidate scan limits are explicit; uninspected older results are not declared absent. Never expose filesystem paths or tokens or mark preview available from job metadata.
- Narration and manual timing remain a separate draft axis with matching current script/take/segment/hash checks; never imply approved timing or alignment to cut windows.
- Always productionAuthority=false, review approval=false; no production writes or marker promotion. Current active_cut_root=null must remain blocked.
- UI supports refresh, cut-row scene selection and metadata report download; loading/error/stale races must not display another project's report. Show absent draft or preview explicitly. Existing authenticated playback may be reused; no fabricated sequence or silent skipping of unavailable cuts.

## Completion and verification

Core/API/client tests: auth, stale revision, mismatched origin, unmapped/duplicate scene bindings, missing root, metadata scan not claiming artifact validity, stale narration, no absolute path leak, false authority. Positive fixture ordering/window/draft binding tests. Typecheck and visualmaker:check; independent reviewer checks actual diff and evidence. Actual EP001 blocked read path must be tested without altering production files. Changed receipt/input hashes, actual successful canonical artifacts, full canonical video assembly and real voice alignment remain outside this metadata-only slice and unverified.

## Final verification

- Latest independent execution: visualmaker:check typecheck and 130/130 tests passed; diff --check passed. Six temporary mirror source hashes matched the worktree. No production files or user database edited.
- Isolated Next HTTP: current EP001 import, 36 ordered cuts, null active root, unavailable previews, absent narration and all authority/approval/synchronization flags false. GET and JSON attachment returned 200 with byte-identical bodies; unauthenticated request 403. Metadata-only limits 50 recent jobs / 2 scene candidates / artifactValidation=not-performed. Initial harness incorrectly expected shot IDs in sceneId; corrected scene-N assertion exited 0.
- Parent actual fresh browser: selected imported EP001, clicked SH002 (aria-current=true), downloaded 36-row metadata JSON; fresh tab console error log empty after duplicate sibling keys were fixed. Screenshot saved outside repository in Temp/visualmaker-timeline-inspection-20261013.png.
- Independent final static review: no remaining P1/P2 in narrowed metadata-only scope. Existing successful-job metadata scanning is unit-tested but not live-observed because actual active root is null. Real canonical artifact validity, whole-video assembly, actual voice alignment and repository-wide check/build remain unverified in this slice. No commit/push.
