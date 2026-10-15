# Source-first v3 progression repair

## Evidence / purpose

The canonical export fixture used unchanged normal generators and a fixed-path Temp v3 source-selected source-photo spec with an approved material requirement. `validate-episode-spec.mjs` rejected it for three contradictory editorial assumptions: every v3 real-media cut still requires a blocked search gap; progression permits only v2's status despite accepting v3's approved status earlier; no-fiction source-photo episodes require SH001–003 Omni disclosure. Separate missing active-manifest/stage approvals remain legitimate failures and must not be removed.

Evidence: `C:/Users/every/AppData/Local/Temp/vm-canonical-export-23StWZ/technical-proof.json`. Current new acceptance test intentionally fails at this boundary; it is not registered in the normal suite and must not be changed to claim success from generator output alone.

## Writer ownership

One backend writer owns `video/scripts/validate-episode-spec.mjs`, optional small pure policy module under `video/scripts/`, and focused policy regression test under `tests/`. Root owns task cards/package registration after release. No redelegation, preserve unrelated edits. No fixture/helper, real episode spec/state, generated/manifests, raw/wiki/data, approval markers, dependency/environment/API/UI or Git changes. Frontier fixture writer is released/read-only until repair handoff ends.

## Data / policy contract

- Do not generalize historical v2 hardcoded script hashes merely to pass the fixture. V3 already uses actual canonical script bytes and ordered narration; preserve those hash checks.
- Keep candidate/editorial production authority false. In `candidate-plan-blocked` v3 real-media cuts, an explicit fail-closed blocked `SOURCE-SEARCH-SH###` requirement remains mandatory.
- In v3 `source-selected-editorial-plan`, a real-media cut must instead contain an approved material requirement (`source-original` or `transparent-derivative`) with concrete approved media ID/provenance/materialization references, no unresolved production requirement. Do not convert missing media to other modes or accept an empty requirement set. Existing exact source/rights/materialization/decodable-file validators and all stage approvals remain mandatory.
- Source-selected v3 progression accepts only the corresponding approved-script-narrative-source-first-plan status; v2 retains approved-script-source-first-semantic-plan. Blocked/candidate statuses cannot activate. This editorial validator still calls the actual production stage validator; policy success alone cannot grant production authority.
- V3 without any Omni cuts and with no declared fictional continuity must not require fictional opening notices. Preserve all existing disclosure requirements when Omni cuts exist. Reject phantom declared fiction IDs/mode mismatches rather than silently treating them as no fiction. Do not invent a new disclosure exception or weaken actual Omni approvals.

## Verification

Candidate-only shortcuts must bind `editorial_revision.status`, not merely a draft state or null active root. A selected plan cannot skip acquisition-matrix byte/cut checks by declaring pending review fields, and always reaches the actual production-stage validator even if state still says timing-draft. The no-fiction exemption requires both zero Omni cuts and an actually empty declared continuity ID list.

Implementation checkpoint: four focused policy tests and typecheck passed. Copying unchanged repaired code into the isolated mirror removed six contradictory validator errors; one genuine stage/asset/user-approval blocker remains. This is not canonical export success. Independent execution verification and diff review are required before continuing the fixture.

Focused pure policy tests for blocked missing-gap refusal, selected missing/blocked/unmaterialized requirement refusal, correctly bound selected requirement accepted only as editorial policy, proper v2/v3 statuses, no-fiction non-Omni exemption, and actual Omni disclosure requirement preserved. Execute the canonical fixture generator/spec-validator boundary again to demonstrate removal of these contradictory errors while missing stage approval still fails. Do not patch validator source in the mirror or override paths; copy current unchanged repaired repository code.

Run focused tests and typecheck, then independent verifier full VisualMaker check and canonical check. Actual EP001 retains its original source/narration/hash/approval failures; never edit it to green the check. Independent reviewer audits exact diff and fail-closed boundaries. Synthetic rights/approval fields prove typed gate behavior only, not real acquisition/license/human approval. No commit/push.
