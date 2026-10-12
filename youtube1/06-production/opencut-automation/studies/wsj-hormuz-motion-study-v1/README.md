# Private vertical motion study v1

This is a private, noncommercial learning study of the motion mechanics observed in the official short reference bound in `source/reference-binding.json`. It is not a WSJ reproduction, publication, upload, monetization asset, or evidence. The study contains no reference footage, audio, logo, watermark, copied headline, proprietary map, or source palette. The rendered excerpt uses original neutral replacement content (`PHONE EVENT / TRAINING SAMPLE`) and a hand-authored dummy geography.

The reference was temporarily fetched at low resolution with `yt-dlp` for dense visual inspection only. Temporary video, subtitles, metadata and raw frames were deleted after the ledger was written. The final study MP4 is 1080×1920, 24 fps, 25 seconds and carries `PRIVATE MOTION STUDY · NOT FOR DISTRIBUTION` on every frame.

## Files

- `shot-ledger.json` — dense reference shot boundaries and confidence notes. Timestamps are visual observations from the temporary review copy, not evidence admission.
- `layer-motion-spec.json` — reusable layer stack and mechanics translated into neutral study parameters.
- `comparison-difference-report.json` — numeric geometry/timing deltas and 0–100 mechanical-proximity scores only; no copyrighted frames or audio. The overall mechanical score is 74/100, below 90 because the excerpt is compressed, silent, uses dummy geography, and intentionally replaces footage/presenter/panels.
- `source/reference-binding.json` — official URL, review-copy metadata and no-retention policy.
- `components/motion-components.mjs` — dependency-free component API used by the renderer: route reveal, kinetic headline, icon callout, progress rail, source chip and wipe transition.
- `board/source/render-study.mjs` — deterministic renderer. It reads only local fonts/icons, writes temporary frame HTML outside production, invokes local Edge headless screenshots, then FFmpeg, contact sheet and thumbnail generation. No downloaded vendor HTML is executed.
- `board/source/verify-study.mjs` — fail-closed verifier for hashes, media geometry, frame count, no-network source policy, no source-brand strings, and exact local asset IDs/hashes.
- `out/studies/wsj-hormuz-motion-study-v1/study.mp4` — private study excerpt.
- `out/studies/wsj-hormuz-motion-study-v1/contact-sheet.jpg` and `thumbnail.jpg` — derived non-reference previews.
- `out/studies/wsj-hormuz-motion-study-v1/output-manifest.json` — generated hash-bound output manifest.

## Reproducible commands

From `06-production/opencut-automation`:

```powershell
node studies/wsj-hormuz-motion-study-v1/board/source/render-study.mjs
node studies/wsj-hormuz-motion-study-v1/board/source/verify-study.mjs
```

The renderer uses local `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` and `ffmpeg`. It creates temporary frame HTML/PNG files only under the system temp directory and deletes them in a `finally` block. If either executable is unavailable, rendering stops rather than switching to a network or provider path.

## Study mechanics

The excerpt translates the observed sequence into six neutral beats: cold-open evidence card, map/route reveal, stacked source panels with a directional wipe, source chip/lower-third hold, alternate route/legend, and return-test timeline. Geometry is intentionally approximate and confidence is recorded per beat; no WSJ composition is treated as authority. The study keeps action in the canonical y=480..1280 region, reserves the 1320..1580 caption-safe band, and uses one claim per screen.

## Legal and privacy boundary

The official reference URL is retained solely as a provenance pointer. Do not publish, upload, monetize, or use the study as evidence. Do not add the temporary reference media back to this directory. The neutral dummy labels do not identify a person, location, allegation, diagnosis, or real call record. Any future case adaptation must pass the canonical evidence/source/redaction contracts separately.
