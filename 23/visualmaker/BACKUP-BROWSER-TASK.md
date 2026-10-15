# Isolated Studio backup browser verification

Verify the complete planning backup story: Studio download → authenticated ZIP response → browser file → new-copy restore → validated UI → persisted Plan and local bytes. This gate follows backend and UI acceptance. It does not grant production or human review authority.

## Ownership and scope

Use `C:/Users/every/Documents/project/youtube-visualmaker/23`. Root owns this contract and browser interactions. After UI writer release and review, one fixture writer owns new `tests/helpers/prepare-backup-browser.mjs`, `backup-browser-server.mjs` and `tests/visualmaker-backup-browser-prep.test.mjs`. Root owns diagnostic registration and documentation only after fixture writer release. No concurrent writer, no redelegation. Independent reviewers and execution verifiers never edit product files.

Forbidden: actual user data, `.env*`, private configuration, raw/wiki, EP001/spec/state/generated/production inputs, provider calls, credentials, Git mutation and sibling workspaces. Never use, navigate, restart or stop user servers/tabs at 8137/8138. No fixture production approval. Preserve unrelated dirty changes.

## Owned synthetic fixture

Create a fresh canonical Temp root with a unique backup marker and `.fixture-data`; check root/path containment and reject links. Prepare a project using existing real core/store functions: meaningful synthetic script and immutable revision history, selected direction and locked scene, a PNG shared by requirements, an unassigned PNG, a valid JSON data asset, a decodable measured synthetic WAV and coherent draft narration timing. Use only generated non-person test media; no external acquisition. Include source-review/manual timing confirmation records only through valid existing APIs so restore scrub can be demonstrated. Keep an unrelated second project to prove no overwrite. Preserve baseline original project documents, revision rows, media/receipt hashes, project count and job/attempt counts in a strict proof.

Proof binds source project ID/revision, script/Plan hashes, input path/size/hash and measured metadata, expected preserved and cleared fields, fixture identity and false production authority. Validate actual bytes and SQLite rows before serving. Plan/media preparation cannot rely on forged receipt fields. Browser upload uses only the synthetic ZIP made by this fixture or downloaded from its own server.

Mirror only the app/source dependency closure into an owned Temp app root. Do not copy source-workspace `.env*`, `data`, `raw`, `wiki`, real SQLite/media or production inputs. The synthetic data root is created separately and never overwritten by source copying. Keep source-closure hashes and verify containment. Reuse reviewed AI/finalization supervisor patterns rather than launching a server in the user checkout; adapt the source-closure collector for backup routes/UI but exclude actual binary/user inputs. Bind localhost on a free non-user port. Pass a minimal allowlisted environment with fixture data directory, synthetic token and provider disablement; do not inherit secrets or load source `.env` files. Do not weaken the normal token/origin guard.

Record run ID, root/data/app paths, listener address/port, supervisor/child process identity, source hashes, stdout/stderr and startup probe. Stop only the exact processes recorded for this owned run after validating command lines/root identity. Confirm zero matching descendants and zero owned listener afterward; never kill by port or all-node process name. Retain logs/proof/media artifacts for review. Cleanup may not recursively delete user paths or evidence.

## Browser and persisted data checks

Main reads computer-use guidance, confirmation policy and file-upload/local-app documentation before UI actions. Use the documented in-app browser API, an owned hidden tab and current DOM observations. Download the current project ZIP through the real control and capture the actual download path before checking ZIP byte hash, entry bindings and byte equality to original local inputs. A request made by a shell is not browser download evidence. Do not upload until the required browser file-upload confirmation has been obtained at action time for this synthetic ZIP and exact local server. No personal data or third-party transmission.

Check restore is disabled until a valid file and explicit new-copy acknowledgement are selected; use the documented file chooser. Submit once and observe the new project/retained counts/cleared-review disclosure. Reload, reselect the restored project and confirm persistence. Check console and server logs, one POST/201 and no duplicate restore. Preserve a readable screenshot of the result and embed it in the user-facing verification report. Unknown outcomes require project-list reconciliation, not a blind second POST.

Independent verifier reads actual API and SQLite state after browser actions: exactly one additional project with one initial revision row at the preserved source revision; original and unrelated projects/revisions unchanged; exact media bytes, shared asset remapping, unassigned asset retention, new asset/take IDs, narration/timing binding, script history/direction locks retained, approvals/origins/AI provenance/listening attestations cleared. No additional jobs/provider attempts or production mutations. Compare original DB rows rather than the whole SQLite file hash, since a successful copy changes the DB.

Stop at a broken browser/API/data boundary and return a specific fix to the sole writer before proceeding. Record which facts were observed in UI versus independently measured; unit tests and static source checks do not substitute for browser behavior. Finish by closing the owned tab and verifying the owned server stopped, without touching user surfaces.

## Fixture acceptance

Tests cover strict proof, real media measurements, baseline hashes, owned-path/marker/link rejection, wrong source closure and environment, failure cleanup, ready/stop lifecycle and no-source-user-data copying. Use isolated Temp only. Run typecheck and fixture preparation tests before server start, then independent fixture review. Register tests only after writer release. Actual browser acceptance remains pending until the browser and persisted-data checks above succeed.

## Download verification and restore status

The owned browser downloaded `visualmaker-project-13.zip`: 111,383 bytes with SHA-256 `c9a4732245105a03ae1ef5eec37c1b97b8693beb27f4059bc926f807c3fba861`. Independent verification matched the prepared archive and checked ten STORE entries, CRC/header/manifest bindings and all media/receipt bytes. The baseline remained two projects, thirteen revision rows and zero jobs/attempts. This is download evidence, not restore acceptance.

The user declined browser upload. No restore POST was made. The owned tab was closed and the exact owned server stopped; independent checks found no owned process or listener on port 61354 and unchanged original/unrelated project rows and inputs. Preserve the archive and evidence. Browser restore, acknowledgement gating and reload persistence remain unverified; do not substitute another upload route for the declined action.

Next dev automatically rewrote the copied Temp `next-env.d.ts`; that file no longer matched the pre-start inventory. The original source and other 107 copied files matched at verification. The inventory describes the startup snapshot, not a claim that every generated Temp file stayed unchanged. Evidence: `C:/Users/every/AppData/Local/Temp/vm-backup-browser-prep-verify-0214ca956069416e860fbb8586ae6b2f`.
