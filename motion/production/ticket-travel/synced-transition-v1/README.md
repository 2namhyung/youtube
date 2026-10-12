# Synced transition v1 probe

Final QA: card outer white margins are excluded from the moving card silhouette. Both fixed-position person layers are composited AFTER the card backgrounds with complementary top/bottom reveal masks. This fixes an intermediate head-erasure defect. Normal output fully decoded with ffmpeg without errors; half-speed output regenerated from the corrected normal render. Contact sheet is current; earlier `*-render.png` snapshots are preliminary, not final evidence.

This is a bounded, deterministic 4-second probe using the exact 96-frame,
720x1280, 24fps source and new-edit clips:

- `C:\Users\every\Downloads\Woman_walking_in_hanbok_202609052145.mp4`
- `C:\Users\every\Downloads\Woman_walking_in_hanbok-clip-1_202609052229.mp4`

`render_synced_transition.py` decodes the two videos frame-for-frame in lockstep.
The Seoul and Tokyo image-first ticket PNGs are resized to the fixed 720x1280
canvas. The Tokyo card rises from below during 1.50–2.00s (12 frames); the
person layers are never translated, and the Tokyo wardrobe is revealed upward
from the card's visible top edge. No retiming, optical flow, or new generation
is used.

## Outputs

- `synced-transition-v1.mp4` — normal-speed 4s probe
- `synced-transition-v1-half-speed.mp4` — same frames at 0.5x (8s, 24fps)
- `synced-transition-v1-contact.jpg` — 0.00/1.50/1.75/2.00/3.50s evidence
- `synced-transition-v1-matte-contact.jpg` and `midpoint-matte.png` — matte evidence

The matte is a narrow, color-distance matte for the near-white studio set with
only a 1–2px edge ramp. It intentionally avoids broad feathering and crude
alpha blur; pale kimono fabric and the set's floor shadow can still show a
small edge/coverage limitation. This is diagnostic evidence, not a claim of a
finished roto or a final recreation.

Render the normal probe with:

```powershell
python .\render_synced_transition.py
```

The half-speed file was produced by `setpts=2*PTS` after the normal render.
