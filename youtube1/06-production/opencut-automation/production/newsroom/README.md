# Local newsroom automation

The canonical reference-v3 contract and UI/CLI operations are documented in `production/RUNBOOK.md`.

Open `http://localhost:3000/newsroom` while the OpenCut Classic web app is running. The flow is:

1. Fetch and rank candidate metadata from configurable RSS adapters.
2. Give the hash-bound case brief and necessary legal constraints to one Codex generator call; then run one separate read-only factual/legal critic call.
3. Review the critic-checked continuous narration and two-line title; duration remains undecided until owner narration locked timing.
4. Open `사진 자료 찾기` to inspect action-time `og:image`, `twitter:image`, JSON-LD, and RSS media candidates. Explicitly approve each image only after checking its rights, then run the existing `reference-v3` short-video pipeline privately.

Each generated newsroom project explicitly stores its locked caption preset. New editorial-cartoon projects use `information-delta-v14-white-on-black-2line`; legacy projects remain readable with `reference-v3-semantic-2line`. The private render handoff carries the selected preset and producer-fitted semantic cues to OpenCut, so the final MP4 and editable timeline use the same contract.

## Data boundary

The collector retains only title, source, direct RSS item URL, publication date, adapter ID, and newsroom-owned tags/scores. It does not parse or persist article bodies. Photo metadata is discovered only when the editor opens the media review panel; candidates default to `needs-review` and are never auto-approved. Approved photos are downloaded into the job's contained assets folder, never hot-linked into a render, and the temporary assets are deleted after rendering. Generated cards remain the fallback when no photo is approved.

Default adapters are configured in `scripts/newsroom-lib.mjs`:

- Google News RSS search (`google-news`)
- SBS society and life RSS feeds (`sbs`)
- YonhapTV society/local search through Google News RSS (`yonhaptv`)

SBS states that its RSS service is allowed for personal, non-commercial use. Confirm source terms before other use.

### Starting same-event research for a new project

Promoting a candidate persists the registered slug and source in `out/newsroom/research-dossiers.json`. Stage 01 research can start immediately, even before the workflow page has been opened: `scripts/research-pipeline.mjs` derives and persists `<slug>.research.config.json` from that exact promoted dossier. A typo or unregistered slug remains rejected with `Unknown newsroom project`; do not create registry rows from free-form input. Hand-authored `<slug>.research.config.json` files remain authoritative.

## Verification and rendering

Planning mode `v18-script-authority-only` uses generator prompt v27 and factual-legal critic prompt v13 to create script-only `newsroom-autonomous-narration-v8` inside active draft wrapper v9 with generation record schema 23. The hash-bound input package remains schema 21 and its deterministic case brief remains the sole case source. The generator returns narration with exact sentence claim refs and no scene cuts. Road-rage is a style-only reference for concrete action sequencing; approved coffee and Jeju endings are separate empathy-only references for connecting verified current-case objects, spaces or relationships to ordinary safety, trust or respect. Their facts never become evidence for another case. The final 2~3 sentences should make that current-case connection concrete, avoiding abstract moral instruction, unsupported emotion, aftermath, motive or policy effect. Factual sentences use direct claim refs; empathy, norm and question sentences use current-case context anchors. Deterministic admission is 65.0~80.0 seconds at the observed owner rate; the inner target is 70~73 seconds and the prompt character ceiling uses a 73-second safety margin. After approval, one separate `scene-prompts` batch creates sentence-bound camera/action and English video prompts. It cannot rewrite or retry. Legacy v7 and older histories remain read-only.

Every newsroom render invokes:

```text
node scripts/produce-short.mjs --project <job>/project/project.json --no-register --ffmpeg-executable <absolute-ffmpeg-path> --ffprobe-executable <absolute-ffprobe-path> --python-executable <absolute-python-path> --edge-tts-executable <absolute-edge-tts-path>
```

This keeps `out/latest-render.json` unchanged. The producer also writes a job-scoped private canonical handoff containing the image assets, retimed narration, title tracks, exact cues, and final thumbnail. The newsroom API exposes contained asset URLs for that handoff plus the private final-video fallback; it never returns absolute render paths.

Jobs use ASCII IDs, contained paths, atomic JSON writes, a per-job exclusive render lock, `shell:false` child processes, and upload limits of eight files at 25 MB each. Accepted types are PNG, JPEG, MP4, WebM, and MOV. Remote article/photo requests allow only HTTP(S), manually validate every redirect and DNS answer, block localhost/private/link-local/reserved targets, cap article HTML at 2 MB and images at 12 MB, and verify PNG/JPEG/WebP MIME plus magic bytes. A rights acknowledgement is required server-side before any approved photo is downloaded.

## Tests

From `opencut-automation`:

```text
node scripts/newsroom-tests.mjs
node scripts/newsroom-tests.mjs --live
node scripts/newsroom-tests.mjs --render-smoke
```

The normal test is fixture-only and deterministic. `--live` is an optional adapter smoke. `--render-smoke` requires the existing FFmpeg, Python, Edge TTS, and Korean font prerequisites; it renders with `--no-register` and asserts that the current latest render is unchanged.

Finalizing the selected Stage 03 script is also the sole normal production
trigger. It creates/reuses a hash-keyed private orchestration job and immediately
returns to the UI; Stage 04/05/06 buttons remain legacy diagnostics only when no
orchestration job is bound. Status lives under `out/newsroom/jobs/<job>/status.json`
with resumable per-stage input/output hashes. The pipeline creates and verifies
the evidence bundle and `editorial-video-plan-v2` before calling any generation
provider, uses ImageGen by default, permits at most one explicitly allowlisted
Wan information delta, and defaults every camera to none and every boundary to
a hard cut. Nonempty Wan allowlists currently block with
`wan-provider-not-implemented`; only an empty allowlist may continue with its
verified static assets. Provider outputs are admitted only after contained
realpath/symlink checks, PNG signature and 9:16 decode/probe checks, and an
provider attestation bound to authority/request and exact asset hashes, followed
by an orchestrator-generated provenance/hash manifest. Status GET is read-only;
automatic recovery calls the authority-scoped POST resume endpoint, whose
PID/expiry lease permits one worker spawn. Provider/render children renew that
lease periodically; live workers are never reclaimed as slow, and only the
derived orphan condition is exposed to the UI. Research snapshot persistence
and finalization use the same project mutation lock. It stops after private render QA and does not approve Stage 07,
register, upload, or publish.

Generic workflow Stage 02 turns verified research into a video decision and legal
policy. Stage 03 builds a URL-free schema-v18 package and projects only normalized
current-case claims plus necessary legal constraints into the model prompt; raw
`allowedFacts`, `allowedClaims`, article bodies, URLs, and source instructions are
not model input. A generator call writes the v2 narration authority and a separate
critic call checks nine semantic categories and revises when needed. Both calls must
succeed; there are no automatic retries. Runtime and API validators bind every
sentence claim to the current case, retain the reportorial blacklist as a secondary
fail-closed gate, and persist initial/critique/final hashes. Legacy fixed-section
and v10 artifacts remain immutable read-only evidence.

### Event dossier v1

The generic contract uses eventDossier rather than checklist summaries. Stage 01
resolves aggregators to original publishers, deduplicates canonical URLs, and
records attributed claims, chronology, later changes, conflicts, unknowns, and
corroboration. Stage 02 rejects missing or stale dossier hashes. Stage 03 cannot
invent missing case facts and binds its autonomous editorial choices to those
verified claims and the approved legal policy.

For `research-657380fce7eaccc9`, the 2026-08-06 migration backed up the prior workflow/research/config files, refreshed the dossier to 3 verified sources from 2 independent publishers (2 representative reports and 1 follow-up), and then invalidated the old legal approval and draft. The workflow remains at Stage 02 with no approval, generated script, finalization, render, or publication performed. The available 2026 appeal update is represented by one verified follow-up publisher; no second independent follow-up report was found.

Run the focused checks from this directory:

```text
npm run test:event-dossier
npm run test:research-pipeline
npm run test:generic-pipeline
```
