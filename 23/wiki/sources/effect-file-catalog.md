# Remotion effect-file catalog

- Verified: 2026-08-29
- Machine-readable catalog: [`catalog.json`](../../video/public/assets/shared/effects/catalog.json)
- Current state: 17 verified candidates, 0 downloaded, 0 approved

`candidate` means that the official item page and its stated license were checked. It does **not** mean that the binary file has been acquired or cleared for an episode. Promotion to `approved` requires a local file under `video/public/assets/shared/effects/files/`, a SHA-256 checksum, technical inspection, and an editorial-safety review. The catalog validator enforces this separation: [`validate-effect-catalog.mjs`](../../video/scripts/validate-effect-catalog.mjs).

## Visual effects

| Candidate | Source specification | Intended Remotion treatment | Editorial risk |
|---|---|---|---|
| [Smoke in motion](https://mixkit.co/free-stock-video/smoke-in-motion-1964/) | MP4, 22 s, Full HD, 24 fps | `screen`; low-opacity uncertainty/transition layer | Medium: never imply smoke at a real event |
| [Black ink covering a green screen](https://mixkit.co/free-stock-video/black-ink-covering-a-green-screen-3988/) | MP4, 10 s, Full HD, 24 fps | chroma-key to alpha/matte, then normal composite | Low |
| [Black liquid covering a green screen](https://mixkit.co/free-stock-video/black-liquid-covering-a-green-screen-3993/) | MP4, 12 s, Full HD, 24 fps | chroma-key to alpha/matte | Low |
| [Black liquid on white background](https://mixkit.co/free-stock-video/black-liquid-on-white-background-3989/) | MP4, 12 s, Full HD, 24 fps | `multiply` or luma matte | Low |
| [White particles on black](https://mixkit.co/free-stock-video/white-particles-moving-on-black-background-4407/) | MP4, 8 s, Full HD, 30 fps | `screen`; subtle still-image depth | Low |
| [White particles on multicolor](https://mixkit.co/free-stock-video/white-particles-moving-on-multicolor-background-4408/) | MP4, 9 s, Full HD, 30 fps | normal layer; desaturate if retained | Medium |
| [Burning lava particles](https://mixkit.co/free-stock-video/burning-lava-particles-leaping-through-the-air-4426/) | MP4, 12 s, Full HD, 30 fps | `screen`; fictional/abstract reconstruction only | High |
| [Fire particles on dark](https://mixkit.co/free-stock-video/fire-particles-on-dark-background-3460/) | MP4, 14 s, Full HD, 24 fps | `screen`; 6–12-frame accent only | High |

Every selected Mixkit item page labels the file as a free download for commercial or personal use under the Mixkit Stock Video Free License. Mixkit maintains multiple license types, so the item page and the official [Mixkit license page](https://mixkit.co/license/) must be rechecked at download time. These files use manual browser acquisition; bulk scraping is not part of this route.

A green-screen file is not production-ready merely because a blend mode is assigned. It must be chroma-keyed into an alpha asset or matte first. Black-background light and particle effects can be tested with `screen` or `lighten`; white-background ink can be tested with `multiply` or as a luma matte. Every result still needs a frame render to detect a residual rectangle, color spill, or obscured evidence.

## Sound effects

| Candidate | Source specification | Intended use | Risk |
|---|---|---|---|
| [Deep Whoosh #2](https://freesound.org/people/Kinoton/sounds/351259/) | WAV, 3.060 s, 44.1 kHz, 24-bit stereo | major camera or evidence reveal | Low |
| [Click](https://freesound.org/people/colorsCrimsonTears/sounds/562294/) | WAV, 1.120 s, 44.1 kHz, 16-bit mono | pin, snap, keyword accent | Low |
| [Page Turn (1)](https://freesound.org/people/OwlStorm/sounds/151220/) | WAV, 0.588 s, 44.1 kHz, 16-bit stereo | document page change | Low |
| [Cinematic Impact](https://freesound.org/people/deleted_user_3277771/sounds/177242/) | WAV, 7.922 s, 48 kHz, 24-bit stereo | one restrained chapter impact | Medium |
| [Bass Cinematic Impact Hit](https://freesound.org/people/ItsJowy/sounds/786705/) | WAV, 8.000 s, 48 kHz, 24-bit stereo | low-frequency chapter accent | Medium |
| [Whoosh Sci-Fi](https://freesound.org/people/Capashen/sounds/118933/) | WAV, 8.500 s, 96 kHz, 32-bit stereo | map/chart travel or fictional reconstruction | Medium |
| [Whoosh](https://freesound.org/people/usagi_mira/sounds/334130/) | MP3, 2.994 s, 44.1 kHz, 131 kbps mono | basic PNG slide or timeline move | Low |
| [Click with Big Reverb](https://freesound.org/people/Rvgerxini/sounds/475691/) | MP3, 15.623 s, 44.1 kHz, 156 kbps stereo | a single question/number with tail | Medium |
| [Paper Turning](https://freesound.org/people/Mikes-MultiMedia/sounds/349701/) | MP3, 9.789 s, 44.1 kHz, 128 kbps mono | split into document-montage Foley samples | Low |

All nine selected Freesound item pages display [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Freesound requires a signed-in account to download the original files, so these remain manual-download candidates. Attribution is not required by CC0, but the project still preserves the creator and item URL in credits and provenance.

Before use, preferred SFX masters are conformed to 48 kHz WAV, trimmed, peak-checked, and mixed below narration. Impact and long-reverb sounds need an additional editorial check because loudness and low frequency can make an ordinary policy development feel more alarming than the evidence supports.

## Starter set and unresolved gap

The first practical pack should be one ink matte, one white-particle overlay, one basic whoosh, one click, and one page turn. Smoke, multicolor particles, fire/lava, cinematic impacts, and long reverb remain optional rather than house-style defaults.

No paper-grain or film-dust texture has yet met the same item-level review standard. Until a candidate is verified, use a project-made texture rather than an unattributed pack. No catalog entry currently has a local file or checksum; therefore none may be referenced by a final composition yet.

## EP001 treatment boundary and procedural candidate (2026-08-29)

The external candidate list is an acquisition catalog, not proof that an external treatment runtime exists. The catalog still has 17 candidates, 0 downloaded files, and 0 approved files. In particular, no external paper-grain or film-dust file has passed item-level review. Separately, EP001 SH003 now has an implemented procedural `grain.overlay@1` candidate; it is not an item in this external effect-file catalog and therefore does not change the downloaded/approved counts. Source: [machine-readable catalog](../../video/public/assets/shared/effects/catalog.json), [effect validator](../../video/scripts/validate-effect-catalog.mjs), [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json).

The implemented EP001 SH003 candidate uses a project-made low static grain treatment on the fixed background and `rear-wall-b01` only. SH004 remains untreated. Do not put it over official faces, exact law/minutes text, dates, numbers, axes, source/provenance/AI labels, official video frames, or reading holds. `tone.selective@1`, `highlight.sweep@1`, and `boil.seeded@1` remain deferred until a visual beat requires them and a same-frame A/B review passes. These are editorial decisions, not claims about the captured references.

External effect files remain conditional: `effects_required: false` means no empty effects folder; `effects_required: true` requires a real local file, source/provenance, rights state, technical inspection, and checksum. SH003's procedural candidate keeps `effects_required=false` and `effects=[]`; it has no external file or effects folder. Its no-treatment/treatment A/B comparison was recorded at 1080p and 360×203 with protected-zone difference evidence. This is automatic QA for an implemented candidate, not an episode asset approval or user PASS. Source: [SH003 manifest](../../video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json), [treatment QA](../../video/qa/episode-001-work-v01/review-ledger.json#selective_treatment_qa), [production playbook](../syntheses/remotion-vox-production-playbook-history-2026-09-13.md#2026-08-29-선택적-treatment-학습과-구현-게이트), [cut validator](../../video/scripts/validate-cut-assets.mjs).

## Related

- [[reusable-media-libraries]]
- [[../syntheses/remotion-vox-production-playbook-v0.1]]
