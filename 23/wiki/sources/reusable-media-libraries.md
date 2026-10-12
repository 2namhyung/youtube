# Reusable media libraries

- Source: [library capture](../../raw/sources/reusable-media-libraries-2026-08-22.md)
- Captured: 2026-08-22
- Status: reviewed

## Operational route status

| Route | Current status | What is available now |
|---|---|---|
| Pexels photos and videos | operational | Authenticated search, bounded download, creator/source/credit metadata and deduplication in the local app |
| Wikimedia Commons | photo and video collectors operational | Keyless original-file download with per-file license, creator and credit metadata; live video smoke passed |
| NASA Image and Video Library | photo and video collectors operational | Keyless image download plus two-stage `/asset/{nasa_id}` video selection; live bounded fallback passed |
| Library of Congress | photo and video collectors operational | Nested film/video resource discovery, oversize fallback and a bounded live MP4 download passed |
| National Archives of Korea | approval required | Search fields and audiovisual filters are documented, but the existing public-data key is not authorized for this service |
| KOGL / Public Nuri | keyless photo and video collector operational | Annual official CSV resolves original media paths; bounded live photo/video downloads passed, but per-file KOGL type remains unresolved |

Source: [live route verification](../../raw/sources/media-api-route-verification-2026-08-22.md)

Implementation and bounded live smoke evidence: [keyless media implementation capture](../../raw/sources/keyless-media-implementation-2026-08-22.md)

Original-video implementation and live evidence: [keyless video implementation capture](../../raw/sources/keyless-video-implementation-2026-08-22.md)

KOGL and final LOC live evidence: [KOGL and LOC verification capture](../../raw/sources/kogl-and-loc-live-verification-2026-08-23.md)

Digital-culture metadata adapter and current upstream timeout: [digital culture API implementation](../../raw/sources/digital-culture-api-implementation-2026-08-23.md)

## Recommended source roles

| Role | First choice | Backup |
|---|---|---|
| Korean official evidence | Assembly KOGL items, KOGL portal | National Archives, KTV item-level KOGL |
| Generic lifestyle B-roll | Pexels | Pixabay, Unsplash for stills |
| Historical/global media | Wikimedia Commons | LOC, NARA, NASA, Europeana |
| Consistent cinematic B-roll | Artgrid or Storyblocks | Motion Array or Envato |
| Templates, SFX, lower thirds | Motion Array | Envato Elements |

The roles are project recommendations. The underlying availability and license characteristics are documented in the [source capture](../../raw/sources/reusable-media-libraries-2026-08-22.md).

## Practical selection

- Start without a subscription using KOGL, Pexels, Wikimedia Commons, and self-shot props.
- When producing weekly, add one cinematic footage subscription rather than several overlapping libraries.
- Use Motion Array or Envato when templates and sound effects are a larger bottleneck than footage.
- Treat news sites and ordinary YouTube uploads as evidence-discovery sources; use only the exact excerpt needed to discuss that source, not as routine decorative B-roll.

## Separate effect-file route

Visual effects and sound effects are acquired as reusable files rather than recreated ad hoc inside every scene. The free starting route is Pixabay for overlay footage and SFX; the repeat-production paid route remains Motion Array or Envato Elements. Every downloaded item still needs its item URL, contributor, acquisition date, exact license state and project-use record. Source: [library capture, Pixabay and subscription terms](../../raw/sources/reusable-media-libraries-2026-08-22.md).

| Effect need | Preferred file | First route | Remotion use |
|---|---|---|---|
| paper/grain/dust | seamless PNG or loopable WebM/MP4 | self-made or Pixabay; paid pack if consistency is needed | `multiply`, `overlay`, or low-opacity normal layer |
| flash/explosion/light | alpha WebM/MOV, otherwise black-background video | Pixabay; Motion Array/Envato for a consistent pack | alpha composite or `screen` blend |
| ink/marker wipe | alpha video or luma-matte video | self-made scan or licensed pack | mask reveal tied to exact frames |
| whoosh/pop/hit | 48 kHz WAV preferred | Pixabay; Motion Array/Envato | place on the visual impact frame |
| paper/pen/office Foley | 48 kHz WAV preferred | self-recorded or licensed library | support document movement without replacing narration |

The source file is copied into the cut's `effects/` directory. A manifest entry records its frame range, blend mode, opacity or gain, checksum, source ID and rights-review state. Effects never serve as evidence and are weakened or masked over faces, clauses, axes, dates and source labels.

The item-level candidate list, technical specifications, intended blend/preprocessing, and editorial risk are maintained in [[effect-file-catalog]]. A candidate is not production-approved until its local file and checksum exist.

## Minimum metadata

Save the asset URL, creator/publisher, download date, license/type, required credit, subject releases or editorial-only status, local path, and the episode/scene where it was used.

## Related

- [[effect-file-catalog]]
- [[../concepts/media-acquisition-pipeline]]
- [[../syntheses/media-source-strategy-v0.1]]
