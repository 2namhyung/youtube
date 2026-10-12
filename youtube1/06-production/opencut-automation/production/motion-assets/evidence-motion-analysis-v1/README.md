# Evidence motion analysis v1

Foundational study: `motion-graphics-foundations-v1.md`, `motion-graphics-classification-rubric-v1.json`, and `motion-graphics-calibration-cases-v1.json` define motion graphics, separate it from adjacent disciplines, separate classification from quality and case relevance, and provide 18 labeled calibration cases. These files must be applied before any further reference admission.

Current catalog: `reference-motion-2026-strict.json` restores the valid 2026 motion-graphics references. `reference-motion-2026-retraction.json` retracts only the two incorrectly added WSJ timestamp claims. Motion-graphics classification and relevance to the current cases are recorded separately, so a valid animated map may remain non-primary without being mislabeled as non-motion.

This directory is an authored analysis layer over the immutable `evidence-motion-v1` (20 assets) and `evidence-motion-v2` (158 assets) packs. It does not modify either pack, the pipeline, `wiki.md`, `api.txt`, or raw research directories.

## Outputs

- `asset-effects-catalog.json` groups all 178 manifest assets into 14 effect-level modules. Every record retains the exact `asset_id`, manifest version, local path, bytes and SHA-256. Module records include visual behavior, parameters, phase grammar, 9:16 layout, editability, runtime/dependency notes, license URLs, direct/source-only status, case mappings for Jeju/간호조무사/휴대전화, privacy/semantic risks and a deterministic implementation suggestion.
- `reference-scene-analysis.json` records the nine requested official YouTube URLs. Six videos were sampled from low-resolution `yt-dlp` worst-progressive review copies at 30-second cadence (long-form) or 10-second cadence (vertical/short), with key change points visually inspected from FFmpeg contact sheets; no copyrighted bytes or thumbnails remain. Three URLs returned HTTP 403 for video bytes and are metadata-only deferred rows.
- `reproduction-feasibility.json` maps generic reference grammars (map route, document highlight, split screen, timeline, network, Korean kinetic type, transitions, phone provenance, lower thirds, camera grammar and SFX) to module IDs with `READY`, `ADAPT`, `BUILD` or `DO_NOT_COPY` verdicts, work estimates, tools, legal/style-copy risks and closest functional equivalents. Six of nine references have dense visual frame coverage (67% by reference count); local module coverage is 100%.
- `validate-analysis.mjs` is a deterministic validator. It checks the 178-asset union, unique module IDs, complete one-to-one asset mapping, URL/timestamp syntax, reference IDs, module IDs and verdict enum.

Run from this directory:

```powershell
node generate-analysis.mjs
node validate-analysis.mjs
```

Observed verification output:

```text
analysis-v1 valid: 178 assets, 14 modules, 9 references, 12 feasibility rows, 0 errors
```

## Source inspection and ingest guardrails

The v1/v2 manifests, READMEs, license captures and source trees were inventory-read by bytes/hash and format. Text/HTML/TSX/JS/JSON/SVG metadata was inspected without executing downloaded code; raster/audio dimensions and durations were checked where available. v1 contributes HyperFrames Apache-2 source examples, Lucide ISC SVGs, Natural Earth public-domain geography and Poly Haven CC0 textures. v2 contributes Iconoir/Tabler/Phosphor permissive SVGs, MIT Motion Canvas examples, ISC D3 source, MIT Lottie/dotLottie fixtures, HyperFrames source, GSAP runtime, TopoJSON atlases/runtime, OFL Korean fonts, public-domain NARA document references and documentary SFX (including one CC BY teleprinter cue). Remote URLs found inside source HTML are dependency warnings, not runtime permissions: localize fonts/GSAP/data before deterministic render.

The catalog is a planning/forensics aid, not an admission of evidence. Every production render still needs authority-bound evidence IDs, redaction/PHI review, exact source labels, physical nonsymlink checks and the canonical pipeline contracts.

## Reference-video sampling and acquisition queue

The requested nine YouTube references are listed exactly in `reference-scene-analysis.json`. The six sampled ledgers record `start_s`/`end_s`, visible action, narrative purpose, motion grammar, evidence status and 9:16 transfer note. Three metadata-only rows (Rayshard Brooks, WaPo backup calls and Kurzgesagt Dyson) remain explicitly blocked after HTTP 403 video responses; do not infer their scene grammar from titles or recollection. Retry those three with an approved visible/frame source and rerun the validator. No login, API key or upload was used.

The review-only acquisition used `yt-dlp --no-playlist -f "worst[ext=mp4]/worst"` (version 2026.07.04) and FFmpeg `fps=1/30` or `fps=1/10` contact sheets. Temporary files were deleted after visual inspection; production contains ledgers and source URLs only.

Priority next builds: (1) browser-visible scene sampler and timestamp ledger; (2) compile/localize HyperFrames + D3 modules into frame-seek adapters; (3) bind authority schemas for Jeju route, nurse records and phone provenance; (4) add per-scene visual QA and caption contrast checks.
