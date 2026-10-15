# Editorial adoption dry-run task

## Ownership and scope

One delegated writer owns `visualmaker/core/episode.ts`, a new pure/server-side adoption-review module as needed, focused tests, `package.json` test inclusion and `visualmaker/README.md`. Preserve all prior uncommitted worker/source-review changes. Do not delegate. No UI changes are needed: existing `format=handoff` download exposes the enhanced report.

Forbidden writes: raw/, wiki/, video/, generated files, production-state, episode-spec, active roots, approval markers, media, runtime user data, dependencies, original 23jung, youtube1/motion. No commit, push, deletion or renderer execution.

## Objective

Extend the existing proposal-only handoff with a deterministic read-only editorial adoption review. It must help a human compare Studio intent with the current EP001 spec without implementing adoption or creating executable patches. Keep existing handoff-v1 fields compatible; add `adoptionReview` with its own `visualmaker-adoption-review-v1` schema. Every output keeps productionAuthority=false, manualAdoptionRequired=true, renderEligible=false, appliesChanges=false. Planning source observations are never source/rights/grammar/style/cut approval.

## Data/API contract

- Existing authenticated GET `/api/studio?projectId=...&format=handoff` remains the entrypoint (confirm actual query names before implementation). No POST/adopt route or shell execution.
- Read only fixed canonical EP001 spec and production-state paths, never client-supplied path or Plan.origin path. Hash exact bytes once per export; hash current serialized Plan snapshot. No timestamp-dependent report content.
- `adoptionReview` contains target spec/state path+SHA or explicit unavailable/invalid state; origin match, plan revision/hash, actual current stage/cut count/active-root summary (top-level current state only, never superseded fields), scene rows, unmapped current cuts, mapping conflicts, and separately labeled editorial blockers vs production blockers.
- Rows map only explicit `originCutIds` to real unique current shot IDs. Never infer mapping from scene position/text similarity. Single origin = comparison; multiple origin IDs = merge proposal requiring manual structural review, not auto-apply; no origin = unbound. Unknown/duplicate/multiple use of same cut = conflict. Include original cut order and proposed scene order; reordered mappings flagged as manual structural change. Removed/unmapped cuts flagged, never silently deleted.
- Per row: explicit chosen candidate or direction-unselected; locked is planning-only. Before/after narration (from exact narration segments/beat links, not notes/reference URLs), purpose/beat intent, mode, observable action and takeaway/end-state where meaning maps; field comparisons are proposal comparisons, NOT valid complete episode spec. Preserve literal strings and separate estimates from production timing (no seconds->frames coercion). Do not invent runtime operators, source IDs, geometry, layout, transition, approvals or generated contracts.
- Include selected requirement IDs only, assigned asset ID/path/SHA/source/rights metadata and current sourceReviewState (all three dimensions + history) as observations-only. Missing/tampered asset exports must retain existing fail-closed store verification. No asset import/materialization. When candidate unselected, show alternatives distinctly; don't claim union of alternatives is chosen.
- Treat an imported origin hash mismatch as stale even if mapping IDs still exist. No origin/mismatched fixed path = unbound. Missing or malformed spec/state returns a clearly blocked proposal report, not a misleading ready result or accidental authority. Preserve expected auth/error behavior; unknown target not supported.
- All reports include manual steps: user editorial diff review -> manual sole episode-spec edit -> official generators/validators -> separate source/materialization/reference/style/parity/cut gates. Command strings may be documentation only; never executed. State summary is unverified declared state, no validator PASS claim.

## Completion and verification

Automated tests: unchanged import has36 exact mappings; selected edit produces before/after; non-narration omitted; merge/reorder/unbound/unknown/duplicate/missing mappings; stale source spec hash; missing/invalid state and spec; source observations stay non-authoritative even allacceptable; sourceReviews absence preserves old snapshot; no automatic writes (file SHA before/after); current rather than superseded state. Tests use synthetic fixtures/temp only, no production edits.

Run `pnpm run visualmaker:check` and `git diff --check`. Independent verifier will exercise actual authenticated HTTP handoff and hash production files before/after. Repository-wide check has known missing/drifted production inputs; do not repair them in this task. Stop writer on completion and report actual test count and limitations.
