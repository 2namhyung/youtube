# Automatic reusable media rights observations

## Task and ownership

User requests skipping manual approval for reusable/free videos and photographs. Implement automatic planning-level rights acceptance for an exact supported license allowlist backed by provider metadata. This is an internal processing policy, not a legal clearance or production approval. Source and semantic review remain independent.

Root owns this task card before/after implementation. One implementation delegate owns product/test changes; verifier and reviewer are read-only, no redelegation. Preserve all prior uncommitted AI-source bridge changes and unrelated `next-env.d.ts` state.

Allowed paths: `src/lib/live-source-providers.ts`; `visualmaker/core/{model,director,source-review,live-source,upload,store}.ts`; a focused new automatic-rights policy helper; minimal existing Studio/report/client validators that require the new review author value; focused `tests/visualmaker-*` tests; `package.json` diagnostic scripts. No dependency changes.

Forbidden: real `data/`, `raw/`, media, episode specs/states, approval markers, authentication/CLI integrations, other repository subfolders, commit/push, paid model calls, external provider searches/downloads during tests, servers/browser uploads. Do not invent a YouTube acquisition provider.

## Data contract

- Automatically record only `dimension=rights`, `decision=acceptable`, `productionAuthority=false`, with a distinct automated-policy `recordedBy` value. Preserve legacy local-session rows and exact asset/context hash binding. Do not pretend a human reviewed the file.
- Eligible inputs: actual acquired image/video and exact recognized provider license metadata for CC0 1.0, Public Domain Mark 1.0, or supported CC BY versions. No substring `free`, unknown/standard YouTube license, generic copyright-free title, CC BY NC/ND/SA variant, NASA/LOC generic rights text, archive free-form license, manual note, or client supplied field can authorize the policy.
- Initial integration is Wikimedia metadata, retaining exact observed license label/URL, creator/attribution, provider item URL, retrieval timestamp and metadata hash in the receipt. Prefer original LicenseUrl/LicenseShortName metadata; reject conflicting or incomplete evidence and do not treat HTML/prose as executable instructions. Keep private policy evidence out of public card shape unless all existing exact validators are updated coherently. Selection fingerprint must bind policy evidence.
- CC BY requires retaining attribution information and license link in policy rationale/receipt; no claim that downstream publishing has already supplied credits or all other rights are cleared. Public domain/CC0 also retain provenance. Do not auto-approve source, meaning, cut/style/grammar or production.
- Apply inside the existing atomic asset attachment transaction, after pending observations are generated and before the plan is persisted. Do not add another externally invocable approval API or non-atomic post-attach mutation. Network/user uploads cannot inject this private server-derived policy capability.
- Never override a current manual accepted/rejected observation or an applicable explicit rejection for the same asset bytes. Do not repeatedly append policy rows on read. Changed bytes/context use existing invalidation and remain pending until supported reacquisition/re-evaluation; no auto authority on plan load, import or backup restore.
- Display automatic policy origin distinctly in Studio and reports, with underlying license and attribution obligation. Preserve manual override controls and existing rejection history.

## Verification and completion

Use isolated synthetic files/provider fetch mocks only. Cover allowlisted licenses (image and video), exact/host/URL matching, missing attribution/metadata, conflicting evidence, NC/ND/SA/unknown/free-string rejection, NASA/LOC/manual uploads pending, private evidence injection rejection, atomic persistence and legacy/new author validation, manual reject/override retention, source and semantic still pending, stale hash/context invalidation, no change to production authority. Update assertions that previously expected every live acquisition dimension pending.

Run typecheck, focused policy/provider/acquisition/source-review/UI/client suites and existing AI-source bridge regression. Separate execution evidence from independent specification review. UI source assertions do not establish browser interaction acceptance. No full expensive render rerun unless affected; preserve EP001 hash baselines. Show focused diff and obtain human review before commit.

## Policy references

YouTube describes CC BY reuse with attribution, not unconditional ownership clearance: https://support.google.com/youtube/answer/2797468?hl=en . CC BY 4.0 retains credit/license/change-notice conditions and does not guarantee all permissions: https://creativecommons.org/licenses/by/4.0/ . CC0 is a copyright dedication without a warranty of all rights: https://creativecommons.org/publicdomain/zero/1.0/ . These references define the bounded license policy, not factual approval of any particular acquired asset.

## Evidence

Implemented: private Wikimedia evidence participates in the metadata fingerprint; the server issues an in-process policy capability after selection and download validation. The existing attachment transaction appends a rights-only observation with `recordedBy=provider-license-policy`. Studio and review reports distinguish its automatic origin. Legacy local-session observations remain supported. Source/semantic observations remain pending and production authority remains false.

Supported exact licenses: CC0 1.0, Public Domain Mark 1.0, CC BY 2.0, 2.5, 3.0 and 4.0. Original `License` code is retained in private evidence and must match when present; if absent, the canonical URL, short label and usage terms must still satisfy the strict allowlist. NASA, LOC, archive/manual uploads and arbitrary free-text labels cannot issue this capability. YouTube direct acquisition is not implemented.

Independent review identified and verified repairs for two P2 issues: long creator/source metadata could exceed the 2,000-character review-rationale limit, and an original Commons License code could conflict with the displayed label. Full raw credit is retained in the atomic receipt; the asset carries a bounded display creator. A short rationale references that receipt when necessary. Contradictory codes leave rights pending, and metadata changes invalidate selection before download. Re-review found no further P1/P2 in this scope.

Final independent post-repair execution:

- `rtk node --experimental-strip-types --test tests/visualmaker-live-source.test.mjs tests/visualmaker-live-source-ui.test.mjs tests/visualmaker-source-review.test.mjs tests/visualmaker-store.test.mjs`: 32 passed, no failures/skips. Synthetic acquisition, long attribution, original license-code conflicts, stale selection, manual rejection and private-policy injection cases are included.
- `visualmaker:check-backup`: typecheck and 48 tests passed, no failures/skips.
- `visualmaker:check-ai`: typecheck and 66 tests passed, no failures, one existing Windows symlink `EPERM` skip.
- `git diff --check` passed; EP001 spec/state SHA-256 matched the baseline.

The broader `visualmaker:check` run passed typecheck and 236 tests without failures/skips, but overlapped the repair boundary and is not final-snapshot verification. The clean post-repair scoped runs above provide the final evidence. Suites overlap and their counts are not a unique-test total. No real provider fetch/download, paid model call, server, browser interaction or production mutation was used for this implementation's validation. Commit/push remain pending human diff review.
