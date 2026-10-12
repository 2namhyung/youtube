# OpenCut local automation POC

This directory contains a shallow OpenCut Classic clone plus a manifest importer. The importer uses OpenCut's `ProjectManager`, `MediaManager`, `TimelineManager`, subtitle parser, and storage service; it does not write IndexedDB or OPFS directly.

## Install

```powershell
cd C:\Users\User\Desktop\app\youtube\06-production\opencut-automation
npm install
npx playwright install chromium

cd opencut-classic
npm install

# Starts only the automation server with local placeholder env values.
cd ..
npm run dev:automation
```

The upstream repository uses Bun for its workspace lockfile. If Bun is available, use `bun install` in `opencut-classic` instead.

## Run the local editor

```powershell
cd C:\Users\User\Desktop\app\youtube\06-production\opencut-automation
npm run dev:automation
```

OpenCut exposes `/automation`. The page accepts one manifest JSON and multiple local asset files. After import it navigates to `/editor/<projectId>` and publishes the project id in `window.__OPENCUT_AUTOMATION__` and `body[data-automation-project-id]`.

## Import and export headlessly

First verify the two-second smoke project:

```powershell
npm run import -- `
  --base-url http://localhost:3002 `
  --manifest examples/smoke.json `
  --assets-dir examples/school-case-assets `
  --output out/smoke.mp4 `
  --timeout 90000
```

Then render the complete project:

```powershell
cd C:\Users\User\Desktop\app\youtube\06-production\opencut-automation
npm run import -- `
  --base-url http://localhost:3002 `
  --manifest examples/school-case.json `
  --assets-dir C:\Users\User\Desktop\app\youtube\06-production\opencut-automation\examples\school-case-assets `
  --output C:\Users\User\Desktop\app\youtube\06-production\opencut-automation\out\school-case.mp4 `
  --timeout 1800000
```

The example asset directory contains the twelve clips, `preview_narration.mp3`, and `preview_subtitles.srt`. Use `--headed` for visual debugging, `--base-url` for another local port, and `--timeout` to increase the default 120 seconds. The browser renderer took longer than ten minutes for the 130-second 1080x1920 example on the test machine, so the full command uses a 30-minute timeout.

## Local voice clone narration

The production pipeline can synthesize the project script with the sibling
`voice-clone` CosyVoice3 runtime. Reference recordings remain local; the
pipeline passes only a script file and output path to the isolated Python
process.

```json
{
  "narration": {
    "mode": "local-clone",
    "style": "neutral",
    "cloneSpeed": 1
  }
}
```

Transcript-aligned styles are `neutral`, `hook`, and `solution`. The generated
WAV is transcribed locally for captions, then follows the same silence and
tempo processing as other narration modes.

The existing `edge-tts` mode is unchanged. To opt into it only when local
generation or local transcription fails, add `"fallback": "edge-tts"` plus
optional `fallbackVoice`, `fallbackRate`, and `fallbackPitch`. No network
fallback occurs unless it is explicitly configured.

Every render metadata file and editable handoff records
`narrationProvider`: requested and actual provider, whether fallback was used,
a sanitized fallback reason, the pinned model id/revision, style, and SHA-256
of the prompt reference. An explicit fallback also emits a console warning;
local exception messages and private paths are not copied into metadata.

## Qwen F4 prosody candidate scoring

Qwen3-TTS Base/BF16 can keep the owner's F4 identity prompt while choosing among several deterministic generations using a non-identifying reference profile. Configure `prosodyProfile` and `prosodyCandidates` together:

```json
{
  "narration": {
    "mode": "qwen3-tts",
    "style": "auto",
    "maxAttempts": 5,
    "prosodyProfile": "../../../../../03-script-voice/reference-audio/instagram/hyepang_pick/prosody-bank/profile.json",
    "prosodyCandidates": 2
  }
}
```

Each candidate must first pass the existing dual-ASR, critical-phrase, clipping, and boundary gates. The remaining candidates are ranked by delivery rate, pause distribution, relative pitch range, sentence-ending contour, energy range, and active-speech ratio. Absolute speaker pitch is excluded. The third-party reference waveform is never loaded by the Qwen worker; metadata records the profile hash and `thirdPartyWaveformUsedForGeneration=false`.

## Background music and reusable-video review

The newsroom visual-assets stage can search YouTube with `videoLicense=creativeCommon`, `videoEmbeddable=true`, and `videoSyndicated=true`, then verify each result's `status.license`, `status.embeddable`, and duration. A Creative Commons badge is only a candidate signal; the UI keeps the uploader-rights warning and requires editor approval.

YouTube API results are never downloaded automatically. Clip extraction accepts only a local, authorized MP4/MOV/WebM/MKV file inside the newsroom workspace, an affirmative rights attestation, and bounded start/end times; `ffmpeg` writes a contained MP4 clip for OpenCut handoff.

Optional BGM uses a provider adapter. Set `STABLE_AUDIO_3_COMMAND` or `ACE_STEP_COMMAND` to an installed local command accepting `--prompt`, `--duration`, `--seed`, and `--output`. If neither is configured, the render reports an actionable unavailable status. A project may instead set `bgm.audio` to a local file. The renderer trims/loops, fades, loudness-normalizes, ducks under narration, and defaults to -25 dB.

## ImageGen prompt recipes

New editorial-cartoon projects may provide per-scene `sceneRecipes` instead of
raw `imageGenPrompts`. The `imagegen-prompt-recipe-v1` layer resolves declared
`{{variables}}` and defaults before producing the unchanged `static-frame-v1`
spec. Unknown or unresolved variables fail closed.

Each resolved recipe records its family, source metadata, observed model,
taxonomy, reference-role requirements, QA lint report, rendered static prompt,
and a canonical SHA-256 hash. The creator propagates that provenance into the
project, asset contract, and motion plan; the verifier rejects hash, prompt, or
spec drift. Engagement values from an external prompt library are retained only
as discovery metadata and are never treated as generation QA.

Static-frame lint rejects multi-beat or camera-motion instructions and missing
or duplicate required reference roles. Style buzzwords, possible multi-location
scenes, and text-density risks are warnings. Wan motion remains a separate,
allowlisted downstream field, and FFmpeg continues to consume only approved
still or motion assets.

See [`production/templates/editorial-cartoon-default.md`](production/templates/editorial-cartoon-default.md)
for the recipe shape and creation commands. Run
`npm run test:editorial-cartoon-template` for the focused contract tests.

## Stage 03 script contract

Active Stage 03 uses URL-free, hash-bound case-brief input package schema 21,
`newsroom-autonomous-narration-prompt-v21`, authority
`newsroom-autonomous-narration-v6`, active draft wrapper v9, and generation record schema 21. The generator returns only autonomous continuous narration plus exact sentence claim references. It receives no narrative engine, curated examples, hook, disclosure, beat, ending, article-tone, repetition, or style prescription, and it may not extend a fact's time span beyond the case brief. A separate `newsroom-independent-narration-critic-prompt-v9` is read-only and returns factual/legal safety `pass|reject`; it has no rewrite or final-authority power. Neither call retries. Generation uses a human-countable 700–720-character target including spaces and punctuation. Code-owned claim lineage and deterministic admission remain 481–549 compact Unicode characters at the current 6.87 rate, or 70.0–80.0 seconds. Actual owner narration locked timing remains authoritative downstream. Rejected hashes and reasons append without replacing active or finalized authority. Legacy prompt v20 and older histories remain read-only.
Finalized Stage 03 authorities remain immutable.

On a Codex failure, the public diagnostic names the exact phase
(`generator-cli`, `generator-output`, `critic-cli`, or `critic-output`) and reports
only exit/signal, bounded safe error lines, and output-artifact presence/byte/JSON
shape. It never emits prompts, model output, local paths, URLs, or credentials; a
SQLx slow-query warning alone is explicitly not treated as the failure reason.

### Retired v13 read contract

Prompt v13, critic prompt v3, critique v2, active draft wrapper v4, generation
schema 16, and planning mode `v13-script-authority-only` remain readable history.
They cannot be used for a new write or finalization because duration was advisory
and the critic could admit provenance narration or insufficient story material.

### Retired v12 read contract

Prompt v12, critic prompt v2, active draft wrapper v3, generation schema 15, and
planning mode `v12-script-authority-only` remain readable history. They cannot be
used for a new write or finalization because their critic could pass a sourcing
opening or reusable reflective coda.

### Retired v11 read contract

Prompt v11, narration v2, critic v1, generation schema 14, and planning mode
`v11-script-authority-only` remain readable audit history only. Their copied
`legalQualification` substrings and initial-sentence indexes are not accepted for
new writes because harmless wording and critic revisions could invalidate them.

### Retired v10 read contract

The retired Stage 03 contract used `newsroom-autonomous-narration-prompt-v10` and
artifact contract `newsroom-autonomous-narration-v1`. The trusted UTF-8 writing
guide is `production/newsroom/youtube-shorts-script-guide.md`; it defines factual,
legal and audio-only quality principles, not a story template.

The schema-v17 input package contains the current verified case history, complete
legal policy and prohibitions, freshness hashes, the 70–80 second listening goal,
advisory owner speech-rate evidence, and an optional user-authored
`editorialDirection`. Text length is never duration evidence. Codex receives this
package once and autonomously chooses structure, beat count/order, information
release and sentence rhythm. It returns one continuous Korean `narration`,
variable descriptive `beats` with claim references, and an `editorialDecision`
that names and explains a single model-selected central narrative axis. Its
hash-bound quality guidance asks the model to compress details that do not support
that axis, use only verified current-case physical cues, and autonomously shape
escalation, a brief hinge/re-hook and breathing contrast instead of uniform fact
enumeration. The first one or two sentences lead with the highest-impact verified
current-case fact or action, deferring background and reporting process unless they
are themselves the central risk. They must directly collide (A) a verified
ordinary role, relationship, situation or protection/trust expectation with (B) the
verified concrete action or risk that breaks it. Those sides appear in one sentence
or two adjacent sentences; scene-setting without the collision is invalid. Heard
alone, the opening must identify the expectation, breach and scale with precise
verbs and verified case-specific targets, tools, counts, times, amounts or results
when available. The narration is scene-embedded: exact evidence-bound physical and
action spans let an audio-only listener follow space, sound, action and change.
It cannot invent sensory detail, dialogue, interior state or unrecorded action.
Required attribution stays accurate but, when possible, is absorbed briefly after
the action or at the end of a clause or sentence. It must name the responsible
source or record, such as police, a court, a complaint or an identified party.
Reportorial production meta and subjectless passive attribution are prohibited
throughout the narration, including mid-sentence. An evidence object such as a
black box, CCTV or video may be the direct subject when it is itself important to
understanding the case. The model
chooses the case-specific hook form without a fixed phrase, type or timing template,
and may reveal the central reversal up front when that makes the collision concrete.
It records exact `openingText`, an exact `impactText` and `impactClaimRefs`, a
free-form `impactMechanism`, exact `expectationText`/`breachText` and their claim
references, one evidence-supported question plus its `retentionGap`, and its later
exact `payoff`. `editorialDecision.sceneCraft` records the free-form scene approach,
continuity rationale, exact narration `sceneSpans` and current-case claim lineage,
plus the attribution strategy and any exact legally necessary attribution spans.
At least one verified scene span must occur in the opening. All hook, scene,
attribution and impact claims must also occur in
model-authored beat lineage. Structural placeholders are never case facts and cannot
be copied or cross-bound.
Content-free meta-teasers, clickbait, unsupported suspense, fabricated dialogue or
emotion, exaggerated questions and the blocked stock opening phrases are prohibited.
Delayed reveal is optional and valid only when it reinterprets earlier
meaning. Every narration has a final movement with evidence-grounded affective
resonance and listener self-projection; any legal outcome appears before that coda,
and the final sentence reflects current-case facts through general human emotion
without adding facts or prescribing action. When current evidence contains a role
conflict or reversal, the model may clarify it near the ending without inventing a
victim's interior state. The prompt never supplies a universal action, desire,
emotion, moral, question or stock coda sentence; the model chooses a free-form,
case-specific `dominantAftertaste`, explains its `codaRationale`, and binds the
exact final `closingText` and claim lineage. Reusable abstract endings about everyday
life, trust, safety or boundaries being shaken are rejected as stock language. The
reversal and required
coda are integrated by re-editing the whole narration rather than appending a
detached ending. Prior approved work contributes structural principles
only: no wording or case fact is included or cross-bound. Code does not impose
profiles, section names, a fixed opening or closing, or a character-count target.
The only text length limit is a technical 30,000-character safety ceiling.

The server attaches exact package, event-dossier and legal-report lineage and
validates every `claimRefs` value against the current case. Generation record
schema v13 records exactly one attempt and hashes the prompt, package and autonomous
authority. Human narration edits are explicitly marked without discarding the
original generation hash. Final acceptance of 70–80 seconds happens only after
approved owner narration and locked timing.

Legacy v4 section/four-variant workflows remain loadable and visible as immutable
read-only evidence. A new write requires explicit regeneration into the autonomous
contract, and a finalized Stage 03 authority cannot be overwritten. Run
`npm run test:script-contract` and `npm run test:codex-drafts` for focused checks.

For shell-safe editorial direction input, `scripts/stage03-save-drafts.mjs`
accepts `--editorial-direction-file <path>`. The path must resolve to a regular,
non-symlink UTF-8 file inside this automation workspace. Without that explicit
option, each slug independently uses
`production/newsroom/editorial-directions/<slug>.txt` when the file exists; a
missing file keeps the generic prompt. The server applies the same slug-specific
default to both the UI/API generation POST and workflow PATCH. An explicit
client `editorialDirection` (including `null` or an empty string) remains the
exact override and is hash-bound as supplied. The CLI sends the same decoded
string to POST and PATCH, so policy-package hashing cannot diverge through shell
escaping.
Example:

```powershell
node scripts/stage03-save-drafts.mjs research-0123456789abcdef `
  --editorial-direction-file production/newsroom/fixtures/editorial-direction.txt
```

When an unfinalized active draft is replaced, the workflow route appends an exact
copy (without recursive history) to `draft.history[]` under
`newsroom-draft-history-entry-v1`, together with its canonical SHA-256. Any
associated production approval is archived with a separate hash before being
invalidated. Existing history entries are hash-verified and copied only from the
stored workflow; clients cannot rewrite them. Finalized drafts still fail closed.

## One-click private production

The existing `최종 대본 확정` action now hash-binds the selected final script,
current research snapshot, legal report, and approved policy, then enqueues one
idempotent `production-<authority-hash>` job. The job checkpoints `finalized →
evidence_bundle → video_design_planner → video_plan → codex_monitor → reference_assets → imagegen → wan →
ffmpeg_private_render → qa → codex_final_audit → completed` using atomic status writes and an
exclusive lock. A changed authority creates a new job; an identical click
reuses or resumes the prior job. It always invokes `produce-short --no-register`
and never runs Stage 07, registry mutation, upload, or publication.

Image generation is an explicit provider boundary. Set
`NEWSROOM_IMAGEGEN_EXECUTABLE` to an absolute executable path and optionally set
`NEWSROOM_IMAGEGEN_ARGS_JSON` to a JSON array of fixed arguments. Production
provenance also requires `NEWSROOM_IMAGEGEN_PROVIDER_ID` and
`NEWSROOM_IMAGEGEN_PROVIDER_VERSION`; these identifiers are part of the final
authority hash. The adapter is
called with `--request <json> --output-dir <contained-dir>` and must create the
requested `scene-NNN.png` files. It receives a minimal allowlisted environment,
not application credentials. The orchestrator rejects symlinks, extra files,
non-PNG bytes, non-9:16 dimensions, decode/probe failures, and diagnostic or
fallback provider provenance before creating its own byte/hash manifest.
The provider must also return `provider-attestation.json`, binding its ID/version,
authority/request hashes, and every output byte/hash with production/no-fallback flags.
Bridge v1.1 additionally preserves the exact near-9:16 built-in ImageGen source
hash/dimensions, normalizes it to 1080x1920 with the authority-pinned FFmpeg
executable and a fixed Lanczos scale/crop, and attests the source, transform and
output hashes separately. Stage with `--ffmpeg <absolute pinned ffmpeg.exe>`;
an unpinned or changed transform fails orchestration admission.

Before any provider runs, verified evidence is projected into a URL/path-free,
instruction-isolated `llm-video-design-planner-input-v1`. A noninteractive
Codex CLI (`gpt-5.6-sol`, reasoning `medium`) proposes `llm-video-design-v1`:
cut count/order, exact script-span bindings, structured static ImageGen specs,
catalog reference IDs/roles, bounded Wan information deltas, and enum-only
FFmpeg edit intent. The deterministic compiler rejects unknown fields,
invented claim/reference IDs or anchor text, span gaps/overlap/reordering,
legal/identity violations, invalid static-frame grammar, multi-action or
ungrounded Wan selections, command/path/URL text, and budget overruns. It then
seals immutable `video-design-v1`. Planner failure or absence blocks production;
there is no deterministic creative fallback. A separate Codex monitor audits
the compiled design but cannot authorize providers, legal compliance, or QA.
Every approved ImageGen source still is generated and admitted before selected
Wan scenes run.

One-click and the reusable editorial-cartoon creator share one visual authority:
`production/templates/editorial-cartoon-default.json`. Its exact byte hash,
`visualPlanning.cutDensity`, restrained-ink/flat-gouache style grammar, palette,
material language, competing-style exclusions, and same-story-world continuity
enter the production authority, planner input, compiler, ImageGen prompts, and
sealed design. For a normal 300+ non-whitespace-character Short the planner
targets 20–22 cuts and must remain inside 19–23; long sentences are split into
context/action/evidence/consequence/institutional-response/public-stakes beats.
The deterministic compiler injects the template style into every static frame,
so `templateId` is not metadata-only and one sentence can no longer silently
collapse to one generic still.

The compiler projects each cut into `compiled-scene-evidence-v1`, preserving
exact subspan offsets plus the authoritative claim/evidence/legal/media union;
split coverage is gap-free and duplicate-free, and merged cuts retain every
bound span. Split cuts repeat the complete claim set of their source span.
Wan eligibility is derived only from authoritative span/claim visible-change
facts, never from planner prompts, expected deltas, or reference metadata.
`exact_text_policy` accepts only exact covered-script text, legal-approved text,
or cited-reference `exactText` allowlists.

Project references can be persisted through workflow action
`save-video-references`; finalization automatically loads that sanitized catalog
and its scene recipes when the request does not override them. A reference with
`assetId` resolves only from
`production/newsroom/reference-assets/<slug>/<assetId>`. Its bytes/hash are part
of production authority, and only a contained read-only admitted job copy is
included in the ImageGen provider request. Asset paths never enter Codex input.
Reference IDs and `assetId` values are individually unique. Checkpoint reuse
revalidates root/file type, real path, byte length, and hash; selected references
stay read-locked for provider calls and bind exact ID/role/hash/bytes through
requests, attestations, manifests, and project provenance. Wan continuity retains
the exact selected reference IDs, not merely their roles.

Wan uses two explicit, independently manifested provider bundles:
`NEWSROOM_WAN_BUNDLE_ROOT` for generation and
`NEWSROOM_WAN_SEMANTIC_QA_BUNDLE_ROOT` for semantic admission. Each contains a
`.newsroom-tool-bundle.json` binding its relative executable, fixed arguments,
adjacent libraries/models/config, and every canonical file byte. Authority also
binds distinct generator and semantic-QA provider IDs/versions. The adapters get a minimal allowlisted
environment and `--request <contained-json> --output-dir <contained-dir>`.
`NEWSROOM_WAN_SEMANTIC_QA_PUBLIC_KEY_PATH` must point to an administrator-owned,
regular nonsymlink Ed25519 public key outside the workspace, temporary and user
profile trees. Its SPKI fingerprint and bytes are production authority. Semantic
QA signs a canonical payload binding its provider and executable bundle, request,
design, source/output/frame hashes and verdict fields; unsigned, generator-signed
or forged attestations fail closed. Neither Wan child receives PATH or secrets.
Attestation binds provider ID/version, authority/request/video-design hashes,
source-still scene and byte hash, and each MP4 byte/hash/duration with
`productionAsset:true` and `fallbackUsed:false`. Independent admission requires
a contained nonsymlink 1080×1920 MP4 with allowed FPS/matching duration; authority
FFmpeg emits the source plus nine fixed ordered video checkpoints, including
exact first/last frames, only through bounded stdout; the orchestrator accepts
exactly nine silent 1080x1920 RGB24 frames in one bounded Buffer and never
creates a writable extraction target. It creates exclusive, fsynced, readonly
semantic frame copies, binds every index/position/hash into the request, and
share-locks them for the semantic child. The independent semantic-QA provider
must separately measure the selected action trajectory (phone aimed toward the
second anonymous figure, or phone intact-to-damaged), including source/endpoint
continuity and reversal/repeat checks. It signs the exact source, output,
first/last/checkpoint and bundle hashes, measured observed delta, high-confidence
pass, and `reversalDetected:false`; planner/provider echo and Codex are not evidence.
The request-specific source copy and original ImageGen still are read-locked
through generation/admission, while their hashes and the ImageGen manifest hash
are fenced before, during, and after execution. If a Wan
output passes, its MP4 and exact signed semantic attestation bytes are copied
under the same read lock into readonly `wan-admitted/` and `wan-provenance/`
files. Only those copies enter creator, verifier and render; provider output is
never a downstream asset. The pinned PEM is also copied into `wan-provenance/`;
its exact bytes, SPKI fingerprint, semantic executable hash and complete bundle
manifest are propagated through the Wan manifest, project and pipeline contract.
The canonical verifier reconstructs and verifies the Ed25519 payload offline.
A single outer Windows share-lock validates manifest-declared hashes and byte
lengths, then holds admitted media, attestations and the pinned PEM continuously
across creator, both verifier passes, the complete private render child and QA.
Its v2 authority binds the owner PID to the exact OS process-start identity and
keeps an actual parent process handle. Parent exit, PID reuse, or identity-query
failure releases every media handle without waiting for a release file; the
request is removed before the readiness signal so an abrupt owner death cannot
leave lock-control artifacts. A live or paused matching process is never reaped.
If a scene lacks a configured or valid provider, the private job blocks at `wan`
with the exact scene/reason; it never silently substitutes a static asset. A
design selecting no Wan scenes remains a valid static pipeline. Codex audits
the immutable design after verification and before providers, but cannot alter
the selection, invent provider behavior, or override canonical QA.
The active planner contract is `newsroom-llm-video-design-v10-action-first-taxonomy-locked`; the authority-bound
Wan ceiling is dynamically capped by the compiled cut budget. Wan is selected only
for one source-grounded visible action from the allowlisted action classes
`wan-action-phone-aimed-recording-at-teacher` or
`wan-action-phone-intact-to-damaged`; ambient/context motion is not a provider
capability. When the authority budget admits one action, the recording-attempt
gesture is preferred. The source-frame compiler preserves a visually legible male
high-school student, adult female teacher and police officer with simplified
non-identifying features rather than black faceless silhouettes. Independent QA
measures nine ordered checkpoints with action-specific phone/arm trajectory or
phone-damage metrics and blocks reversal, repeat, background drift or a mismatched
first frame. The local RTX 3060 Ti profile generates Wan2.2 TI2V internally at
576x1024 (exact 9:16), 49 frames/24 fps, UniPC, CFG 5, 24 steps and shift 8
with a recorded deterministic seed; the visually reviewed recording-gesture
profile pins its accepted seed. A visually reviewed Wan candidate may be copied
into the authority bundle and hash-pinned for deterministic revalidation instead
of paying the GPU sampling cost again. ImageGen first frames and the final
vertical composition remain 1080x1920. Normalization always retains the admitted
source as frame zero and the generated endpoint; for an exact 2s cut it drops one
interior generated frame to produce 48 frames, while longer 2-6 second cuts hold
that endpoint rather than inventing additional action. The final normalization
upscales the latent pass with Lanczos and encodes H.264 `libx264` at CRF 18.

Rendered title copy keeps the reference two-line positions and colors, but each
line is deterministically reduced from its reference font size when its weighted
Korean/ASCII width would exceed the 920px safe band. Short established titles
retain the original 120/143px sizes; long newsroom headlines never render beyond
the canvas edges. Captions remain independently fixed at the canonical 88px,
920px safe width, two-line center anchor.

One-click production is authority-scoped: enqueue requires an approved
`headline:{approved:true,line1,line2}` input whose lines fit the 120px/143px
reference sizes inside the 920px safe band. Narration is bound to the
validation-passed `owner-voice-v1` Qwen3-TTS prompt-bank profile; Edge-TTS,
non-owner substitutions, original article titles, and the rejected
`msis571v` preview are never production authority.

The URL/path-free planner projection is embedded
directly in the isolated Codex request as untrusted JSON, so planning never
depends on a model tool call to read a local input file. Identity anonymization, face suppression,
publisher-footage prohibition, and AI-reconstruction disclosure are mandatory
motion safeguards, but do not by themselves force an editorial illustration to
stay static. Only an explicit motion, animation, or reenactment prohibition
blocks Wan. The compiler still admits each `wan-info-delta` only for one exact
source-grounded visible change and seals the applicable restrictions for both
motion classes. Legal
transfer, indictment, investigation, discovery, trust, criticism, and policy
cannot be converted into invented walking, door, folder, or other motion.
Anonymization hides identity rather than verified event information. Reported
adult/minor status, sex or gender, occupation, family relationship, and
institutional responsibility remain visually legible. Police subjects retain
generic uniform silhouette, plain unmarked epaulets, radio, utility belt, and
workplace context while real emblems, names, ranks, and unit identifiers remain
excluded.
The UI uses an authority-scoped POST resume operation with an atomic PID/expiry
lease; status GET remains read-only.
Long provider/render subprocesses renew the fenced worker heartbeat periodically;
a live worker PID is reused, while GET exposes only the derived orphan-resume
condition consumed by the explicit POST. Project research refresh and script
finalization share one mutation lock, preventing snapshot/write interleaving.
Creator contract v1 is legacy-only and must set `legacyCompatibilityMode:true`;
one-click authority artifacts require v2 and otherwise fail `migration-required`.
That lock atomically publishes complete main/gate records with an exclusive hard
link; stale or legacy-partial state is reclaimed only after grace and exact
token/byte/inode quarantine verification, including own-token cleanup when a
post-create gate wait cannot settle. Each record binds PID, process start
identity, and a random process-instance ID to a diagnostic atomically refreshed
heartbeat. A foreign owner is protected while its PID is live and its recorded
birth identity matches the OS process birth identity, regardless of heartbeat
age or absence; an unavailable identity lookup and legacy live-PID records fail
closed. PID death or a birth mismatch permits fenced recovery. Exact-token/raw-identity abandonment tombstones make
failed main/gate cleanup or release recoverable while the old process remains
alive. Own birth-identity lookup uses bounded retry and never caches rejection.
Heartbeat timers and lease state remain registered until exact cleanup is
confirmed; a later same-process acquisition adopts the exact heartbeat after a
transient cleanup error instead of deadlocking on the existing file. Same-instance active-token fencing,
conservative heartbeat diagnostics,
and pre/post critical-scope ownership checks prevent overlap; only safely
identified stale artifacts are scavenged. Run
`npm run test:newsroom-production-orchestration`.

### Bounded Codex QA and repair

Finalization starts a job-scoped, monitor-only Codex QA checkpoint before
evidence or media generation and a second idempotent, read-only audit after
canonical private-render QA and before completion. The final audit receives
only authority/artifact hashes and check summaries; a concrete code-defect
finding may enter the same bounded repair path, but Codex never sets QA pass.
Configure the server account with an absolute
`NEWSROOM_CODEX_EXECUTABLE` path (and optional fixed string-array
`NEWSROOM_CODEX_ARGS_JSON`) plus a dedicated absolute `NEWSROOM_CODEX_HOME`
(ordinary `CODEX_HOME` fallback is not accepted) for CLI authentication. The
directory must be provisioned outside the automation root, OS temp,
`HOME`/`USERPROFILE`, must not be the default `.codex`, and must contain a
regular `.newsroom-codex-home.json` with schema `newsroom-codex-home-v1`.
`HOME` and `USERPROFILE` are never inherited. The child runs `codex exec` with
`gpt-5.6-sol`, an explicit medium reasoning override, exact
`default_permissions=":read-only"`, native
Windows `windows.sandbox="elevated"` after a fail-closed sandbox preflight that
exercises both `codex sandbox -P :read-only` and `-P :workspace`; each must read
a local sentinel and fail to read a private automation-root canary outside the
shadow, temp, and authentication home,
`--ignore-user-config`, `--strict-config`, `--skip-git-repo-check`,
`--ephemeral`, JSON events, an output
schema, a contained working directory, and a minimal auth/runtime environment.
Repair invocations alone use exact `default_permissions=":workspace"` inside
their shadow. Codex tool
shells inherit no environment; the CLI itself may use saved `CODEX_HOME` auth or
the dedicated `CODEX_API_KEY` (never the application `OPENAI_API_KEY`). Its output is advisory: it cannot approve canonical QA, run a
provider, create media, upload, publish, or mutate the registry.

Only an explicit immutable-core `CODE_DEFECT` classification in a plan,
leaf-provider adapter, private render, or QA stage can start repair; generic
JavaScript exceptions and malformed provider/config JSON never qualify. An
attempt is reserved before Codex starts, so a crash consumes it, and the limit
is two. The exclusive random shadow contains only three precreated leaf
invocation adapters for ImageGen, Wan, and FFprobe. Symlinks, junction parents,
hardlinks, new/deleted/renamed files, outside imports, and authority/job/title/
slug/hash-specific branches are rejected.

Automatic source promotion is disabled. Codex can produce a durable private
proposal and byte-hash diagnostics for an administrator, but real source is
never overwritten or rolled back. The job becomes terminal
`admin_review_required` with `retryable:false`, avoiding repeated billing. The
API exposes only fixed audit/result enums, never model prose or patch contents.

Private production requires absolute dedicated `NEWSROOM_FFMPEG_BUNDLE_ROOT`
and `NEWSROOM_PYTHON_BUNDLE_ROOT` directories. Each root has a
`.newsroom-tool-bundle.json` (`newsroom-tool-bundle-v1`) declaring its kind and
relative launch paths: `ffmpeg`/`ffprobe`, or `python`. The complete
regular-file tree—including codec DLLs, Python runtime files, `Scripts`, and
`Lib/site-packages`—is a canonical path/byte-size/SHA-256 manifest bound to the
production authority. Links, junctions, forbidden workspace/temp/profile
roots fail closed. Existing regular source hardlinks are admitted by bound
bytes/path identity, but each invocation independently copies the complete
revalidated bundle into a fresh mirror, so source inode mutation and
cross-volume placement cannot alias invoked bytes. On Windows these ephemeral
mirrors and their owner claims live beneath the dedicated short
`C:\ProgramData\NJB` root; this keeps native Python extension/DLL paths below
Windows loader limits while preserving the same manifest, realpath, claim,
read-only, read-lock, and cleanup fences. `produce-short` receives the full
mirror manifest and its hash. It hashes each complete mirror once per producer
process, then reuses that result only on Windows while the outer FileShare.Read
holder denies writes, deletes, and replacement for every authority file; other
platforms retain a complete re-hash before every spawn. Mirror files are OS
read-only for the child lifetime, and the parent checks the complete manifest
immediately before and after the locked spawn. The Windows holder hashes each
file as it acquires its exact read handle and owns those handles for the child
lifetime; the parent does not redundantly traverse the complete tree on a 100ms
timer while that stronger lock is active. Cleanup unseals only an exact verified
target.
A successful private producer also atomically writes one contained metadata JSON
whose echoed authority SHA-256 is the exact tool-invocation manifest hash. The
orchestrator reads that file, not captured console output, and rejects missing,
linked, escaped, stale, or mismatched metadata before admitting the render.
A PID, OS process-birth identity, token, and heartbeat claim is published before
directory creation. The scavenger preserves live owners regardless of age and
removes only attributable dead-owner, contained, link-free torn, partial, or
exactly bound ready mirrors; unknown directories remain untouched.
`produce-short` requires matching absolute `--ffmpeg-executable`,
`--ffprobe-executable`, `--python-executable`, `--tool-bundle-manifest`, and
`--tool-bundle-manifest-sha256` options pointing inside those mirrors and
contains no bare PATH lookup for these tools. Edge TTS runs only as mirrored
Python `-m edge_tts`; no pip-generated launcher is invoked. The recursively
resolved local ESM graphs rooted at `produce-short.mjs`, the editorial creator,
and verifier, plus
`transcribe-whisper.py`, `build-v3-font.py`,
and `analyze-libass-calibration.py` hashes are authority-bound too. The Python
child receives mirror-only `PYTHONHOME`/`PYTHONPATH`; all tool children receive
only the minimal Windows runtime environment, never application credentials or
caller-provided PATH. Authority renders explicitly disable `local-clone`, Fish
Speech, and Qwen narration until their complete external worker/runtime/token
dependency trees use the same bundle and admission contract. Unknown commands
fail closed.

Provision dedicated roots with `npm run newsroom:provision-tool-bundles --
--ffmpeg-source-root <ffmpeg-source-root> --python-source-root
<python-source-root> --target-base <dedicated-target-base>`. The command copies
complete regular-file trees to fresh sibling staging directories, writes the
launch marker last, and publishes each target by atomic rename. Links, broad or
profile/temp/workspace targets, missing launch files, and existing non-empty
targets are rejected; an exact ready target is reused. The Python tree is
copied in full for mirrored `-I -S` execution. Use
`npm run newsroom:verify-tool-bundles` for a read-only status check.

The pre-orchestration multipart `render` API and `newsroom-cli render` command
are disabled. They cannot generate fallback cards or start an unbound render;
finalized scripts enter production only through the authority-bound one-click
orchestration job. The legacy media `clip` action returns HTTP 410. A migrated
finalized workflow without a production job shows `migration-required`; its
only migration action is clicking the existing `최종 대본 확정` button again.
