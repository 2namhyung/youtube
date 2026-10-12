# M1 card-acceleration prep

Prepared 2026-09-06 from the accepted T3 joint-windows source for the next M1 timing test.

## Input

- `m1-input-seoul-tokyo-4s.mp4`: global 5.0–9.0 s extraction, exactly 96 video frames at 720×1280 and 24 fps (4.000 s), video-only.
- Extraction is a straight time-window cut with no retime, speed change, camera change, or audio track.
- Source: `../t3-joint-windows-2026-09-06/joint-windows-1.80x-13s.mp4`.

## Prompts

`A.txt` contains the M1 common block plus the concise A change block. `B.txt` contains the same common block plus the structured B change block. The prompt text is copied from the ticket-journey flow pipeline synthesis, lines 318–340; the 1.5–2.0 s transition constraint is retained verbatim.

## Authorization and status

The user accepted the gait for this card test today and authorized the next M1 step. That acceptance is a creative motion-selection decision, not anatomical proof or pixel-identical gait certification. The user then authorized the ordinary Flow `동의` choice (not “never again”); upload completed as scene `bd42d146-275e-4b96-b370-53048b28223f` in project `a37f8501-9284-4599-bee5-bafd23699149`.

Flow record: upload and consent completed for scene `bd42d146-275e-4b96-b370-53048b28223f` in project `a37f8501-9284-4599-bee5-bafd23699149`. With the 4 s duration UI and Omni1.1Flash, exact `A.txt` was submitted first and retried once after refresh; both returned the generic no-charge failure `죄송합니다. 동영상을 생성할 수 없습니다`. Exact `B.txt` was then submitted once with the same settings and returned the same generic no-charge failure. The reCAPTCHA service connection warning disappeared after refresh. Total before sequential diagnostics: 3 requests (A×2, B×1), 0 outputs, so there is no quality comparison. Exact `C-simple.txt` was submitted on the same scene/settings and returned the same generic no-charge failure with no output. Exact `D-control.txt` (`Make this video black and white. Keep everything else the same.`) was submitted on the same original scene with 4 s Omni1.1Flash settings and returned the same generic no-charge failure with no output. Status is now `isolation_diagnostic_e_success_download_pending`: the same exact D-control prompt was submitted as an isolation check against a separate 10 s Flow-generated kimono clothing-only variant in the latest clothing-only stack (ingredient: pink kimono; visible result: kimono), scene `782edb55-2d01-4e7e-b61c-380fbdcdcd11`, with Omni1.1Flash. The UI completed visibly in grayscale; the main download click was made, but no local download is verified. The exact source asset ID is unavailable, so this is not claimed as canonical hanbok. The 10 s generated kimono variant versus the 4 s uploaded input is a confound and cannot prove the root cause. It suggests the input/ingest/content path may be involved, not a global Flow outage or the long prompt alone; no exact cause is established. This is not classified as policy refusal or model capability failure. The raw 13 s input remained untouched, and no original files were mutated. Main handoff is in the UI.

See `manifest.json` for hashes and exact extraction/provenance metadata.
