# M1 regenerate-from-images (2026-09-06)

This is a user-authorized Flow image-to-video regeneration from supplied start/end images, not an approved T3 motion-preservation run. The original 13 s source remains unchanged.

## Selected inputs

- Start: `production/ticket-travel/assets/locked-keyframes/K1-seoul-hanbok.png` (K1 Seoul hanbok).
- End: `production/ticket-travel/assets/locked-keyframes/K2-tokyo-kimono.png` (K2 Tokyo kimono).
- Flow picker history matched the prior `START SEOUL / END TOKYO` scene `2c754118-d4b8-49e8-87ab-d6c5a5b1ff13`.

## Generation submission

- Scene: `2c754118-d4b8-49e8-87ab-d6c5a5b1ff13`.
- Settings: Frames, Omni1.1Flash, 9:16, 720p, 4 s, 1×.
- Credits displayed: 7.
- Exact prompt: `prompt.txt`.
- Status: generation completed, but QC failed; no local download is verified.

## Result and QC

- Scene: `4ae94342-a7a5-4c3b-a184-0ff91c50e11b`.
- Observed media: `1a612ee6-6554-4434-9e70-aa9364700985`, 4 s in the UI.
- Timeline inspection: around 1:12 (~1.5 s), the edge was just at the bottom; around 1:17 (~1.708 s), two heads were visible while the incoming kimono moved upward with the card; at 2:00, the card had not reached its final position.
- QC: fail. The desired independent person motion and edge-led wardrobe reveal were not achieved. This is not a pass and does not replace or certify the original 13 s source.
- The download button was clicked, but no local file is verified; the page reported an Assets bundle fetch failure.

The K1/K2 names refer to the existing selected assets above. Prior picker history is only generic `START SEOUL / END TOKYO` history and does not prove these are the exact old inputs used in that prior scene.

This generation is not evidence that the selected T3 walking baseline, anatomy, or source-clock motion has been preserved. It is a regenerate-from-images comparison path. No original files were mutated.

See `manifest.json` for hashes, authorization and provenance.
