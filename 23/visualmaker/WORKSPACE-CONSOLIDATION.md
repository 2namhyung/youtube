# Canonical checkout and recoverable duplicate quarantine

## Scope and preservation contract

The requested canonical program location is `project/youtube/23`, on the repository's `main` branch. `visualmaker` remains the development branch. Publish source, tests and documentation only; do not add actual media, raw evidence, databases, credentials, dependencies, caches or exports.

The user selected: preserve `raw/` and unique material in place, quarantine confirmed duplicates only. Related source locations are `project/23jung`, `project/motiongraphic` and the registered `project/youtube-visualmaker` worktree. Other projects are out of scope. A whole-folder move is not authorized merely because many files match. Keep the registered worktree and the shared `23jung/node_modules` dependency target in place unless a later explicit archive decision changes that scope.

## Recorded preflight, 2026-10-15

- Primary `main` starts at `5a1c034`; its staged `23/` snapshot equals historical commit `18f461b`. It is not the latest program. Preserve the staged patch and a scoped staged stash before replacing that snapshot; do not reapply the historical snapshot over the new program.
- Development `visualmaker` starts at `13d469b`. The release changes are confined to `23/` and include the AI-to-source brief, provider-rights observations, YouTube CLI discovery/intake and the existing WISE canonical-library bridge.
- Primary `motion/` has 129 untracked collisions with development's tracked files: 121 byte-identical and eight strict UTF-8 CRLF-only differences. Preserve their original bytes and relative paths before fast-forwarding; do not overwrite or broadly move the `motion/` directory.
- Original `23jung` and `motiongraphic` contain unique media/data and must remain. Candidate duplicate files require an individual SHA-256 comparison against the canonical checkout immediately before moving. For explicitly recorded CRLF-only equivalence, retain both original and canonical hashes and verify strict UTF-8 text with no other difference. Never move any `raw/`, credentials, live data or dependency tree.

These are local preflight observations, not an execution receipt. No move, commit or push is implied by this document.

## Ordered release

1. Complete scoped tests and independent diff review. Show the focused human review before committing, as required by `AGENTS.md`.
2. Commit only the reviewed `23/` code/tests/docs on `visualmaker`, push it and verify the remote commit.
3. Back up the primary index and staged binary patch; retain the scoped stash object ID. Recheck that no new user edits appeared. Quarantine only the verified collision files into a dated sibling folder with a machine-readable source/destination/hash manifest.
4. Fast-forward primary `main` to the reviewed development commit, without reset, force checkout or force push. Push `main` and verify both branch tips.
5. Compare remaining related original code against the now-current canonical files. Move only individually confirmed duplicates, with a manifest entry written before each move and a destination hash check afterward. Preserve differing files, untracked unique material, `raw/`, data and credentials. Do not remove empty directories automatically.
6. Verify the canonical program using existing dependencies and explicit original data paths; report exactly what was moved and what remains. The quarantine remains recoverable until the user deletes it. A partial failure stops the operation and leaves the manifest for recovery.

## Existing data without relocation

`start-local.ps1` requires an existing real data directory, so an omitted path cannot silently create an empty replacement project store. From `project/youtube/23`, after dependency setup:

```powershell
powershell -NoProfile -File visualmaker/scripts/start-local.ps1 `
  -DataRoot ../../23jung/data/visualmaker `
  -ArchiveDb ../../23jung/data/archive.sqlite `
  -ArchiveRawRoot ../../23jung/data/raw -CheckOnly
# Remove -CheckOnly to start the local Studio on port 8138.
```

This launcher does not copy `.env.local`, `pixel.txt`, auth or database bytes. Existing credentials must be configured separately through the trusted local environment. `raw/` and production inputs are not relocated or automatically re-bound; missing production inputs remain blocked. A dependency junction, if used, must point to the verified existing `23jung/node_modules` and must never be recursively removed with its target.

WISE's new connection uses the existing sibling `youtube1/production-studio/backend` and its canonical source store. The normal default source DB and a running WISE service were not found in this preflight; unit tests do not establish runtime availability. The YouTube CLI search and WISE library search are explicit, separate actions. Automatic YouTube intake-to-WISE indexing is not implemented by this release.
