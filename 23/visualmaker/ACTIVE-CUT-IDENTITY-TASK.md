# Active cut identity contract repair

## Evidence / ownership

The isolated fixture passed default render-authority validation without flags, cut-review stage and cut visual-state checks. Normal import/store/audio evaluation then reached the cut-assets validator, which compares a manifest's logical episode ID to its versioned directory basename. Authority loading requires the same manifest ID to equal state.episode_id=`episode-001`; setting it to `episode-001-v99` would break that authority gate. Evidence: `C:/Users/every/AppData/Local/Temp/vm-canonical-export-IykyWH/technical-proof.json` and `audio-evaluation.json`. No provisional/audio job or export has run.

One backend writer owns only `video/scripts/validate-cut-assets.mjs`, an optional small pure identity helper under `video/scripts/`, and a focused regression test under `tests/`. Root owns documentation/package registration after release. Preserve unrelated edits; no redelegation. No fixture, real episode/state/generated/active manifest/approval/raw/wiki/data, environment/dependencies/UI/API or Git writes.

## Contract / verification

For the exact state-declared active versioned root only, compare manifest identity to the verified logical episode ID from production state (and spec consistency where needed). Inactive historical folders retain their existing folder-name convention; do not generalize unrelated historical records or infer active status from a substring/basename alone. Shot ID still matches its physical cut folder. Preserve all active root/spec/generated binding, count, source/rights/materialization, visual asset, lifecycle and review checks. An active versioned manifest falsely using the versioned directory name must fail.

Focused regressions cover exact active-root canonical identity success, versioned-ID impostor failure, different root remaining historical, inactive legacy behavior and malformed/mismatched state/spec identity failure. Run focused tests/typecheck/scoped diff checks; independently review exact diff and execute full VisualMaker check. Fixture writer later copies unchanged repaired code and reruns normal evaluation; remaining provisional/script/voice inputs are legitimate blockers, not bypass targets. No commit/push or real approval promotion.

Implementation checkpoint: three focused tests and typecheck passed; the focused suite is registered in `visualmaker:check`. Actual normal fixture reevaluation and independent final review remain required. No provisional/audio job or final export success is claimed from these pure policy tests.
