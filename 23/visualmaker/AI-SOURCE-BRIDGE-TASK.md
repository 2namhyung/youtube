# Adopted AI analysis to explicit source search

## Task card

- Purpose: offer adopted Korean/English search briefs for the current selected scene requirement without automatically searching or acquiring media.
- Writer: one implementation delegate owns the selector, Studio/LiveSource integration, focused tests and package test scripts. Root owns this task card before/after implementation, not concurrently.
- Allowed: `src/components/studio/ai-analysis-adoption-client.ts`, a focused pure source-suggestion helper beside it, `src/components/studio/studio.tsx`, `src/components/studio/live-source.tsx`, focused `tests/visualmaker-*` tests, `package.json`.
- Forbidden: `raw/`, real `data/`, episode specs/states, production approval markers, media, authentication, CLI/provider implementation, other repository subfolders, existing unrelated edits including `next-env.d.ts`.
- Completion: explicit suggestion application preserves full text; only separate search submission performs network access; ineligible/stale/unadopted suggestions fail closed; no Plan writes or production authority.

## Data and interaction contract

- Input: validated current Plan and exact requirement ID. Output: optional Korean/English suggestions derived only from `aiAnalysisAdoption`, retaining complete brief strings and explicit unverified/human-review labeling.
- Require matching project/script receipt scope, valid adoption revision bounds, exact segment span/text/kind, unique singleton segment/beat/scene ownership, unchanged applied intent, unlocked scene, selected current candidate and exact adoption-generated candidate/requirement draft shape. Candidate selection may advance revision; receipt revision need not equal current revision.
- Require eligible unacquired external/official image/video requirements, no ambiguous shared requirement owner, and exact selected candidate/layer binding. Reuse the existing draft projection rather than inventing weaker ID-only matching.
- Suggestions do not alter persisted requirement queries, rights review, assets, or approval states. Their use is optional; manual search remains available.
- Clicking a suggestion fills the complete local query only. No effect/render/open/apply handler may fetch. Search remains a separate explicit user submit.
- Providers accept 2–120 trimmed characters. AI briefs may reach 600: never truncate, provide editing guidance and disable submission until valid. Preserve abort/epoch/scope protections and prevent old suggestions/results from crossing scope changes.
- No new API, DB schema, dependency, external model invocation, batch search, or download is required.

## Verification and review

- Independent execution: typecheck; focused selector tests; AI adoption/client suites; existing live-source/core/UI suites with synthetic fixtures and mocked network only.
- Cover both languages, full long text, stale script/source/intent/revision/project, mapping ambiguity, locked/unselected/foreign/regenerated requirements, acquired/unsupported requirements, explicit no-fetch application and current-scope invalidation.
- Independent reviewer inspects actual diff and execution evidence; product files are not edited by reviewer/verifier. Apply React dependency/event/conditional-render checks. Static tests are not browser interaction evidence.
- Compare EP001 spec/state hashes with baseline; do not repair unrelated production gates. Show focused diff and obtain human review before any commit.

## Evidence

Implemented in `src/components/studio/adopted-source-brief.ts`, with explicit Korean/English application buttons in `live-source.tsx` and selected-requirement wiring in `studio.tsx`. The existing draft projection is shared from `ai-analysis-adoption-client.ts`. No API, persisted query, or production authority changed.

Independent execution before review repair: `pnpm run visualmaker:check-ai` passed typecheck and 65 tests, with one existing Windows file-symlink `EPERM` skip; live-source core/UI suites passed 18 tests. Independent review found a valid multiline-brief rejection and a mismatched provider query validation boundary. These were repaired: AI LF/CR/tab content remains verbatim; the search field requires explicit user editing to a 2–120-character query with no control characters, matching the server. No automatic joining or truncation occurs.

Final independent post-repair execution: `rtk pnpm run visualmaker:check-ai` passed typecheck and 66 tests, with one Windows file-symlink `EPERM` skip and no failures. The seven bridge tests are included. `rtk node --experimental-strip-types --test tests/visualmaker-live-source.test.mjs tests/visualmaker-live-source-ui.test.mjs` passed 18 tests without skips or failures. `git diff --check` passed. Independent re-review confirmed the P2 repair and found no additional P1/P2 in this scope. The focused bridge tests are included in both `visualmaker:check-ai` and `visualmaker:check`.

Limits: no browser-click acceptance test or external AI/provider call was performed. Source-string assertions are wiring checks, not browser interaction proof. Adoption with unchanged intent keeps its old draft and intentionally offers manual search only: this receipt does not byte-bind the pre-existing candidate/requirements to the analysis. Edited/regenerated drafts likewise require manual search. An unchanged receipt remains useful after ordinary candidate selection advances revision.

EP001 spec/state hashes remained at the recorded baseline during independent verification. The existing repository-wide production gate blockers are not repaired or bypassed by this planning feature. Commit/push require focused diff presentation and human review.
