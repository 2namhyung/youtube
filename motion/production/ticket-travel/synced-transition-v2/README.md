# Synced transition v2 probe

This is a bounded reference-inspired refinement of `synced-transition-v1`.
The accepted v1 files are preserved unchanged.

The renderer uses the exact same two 720x1280, 24fps, 96-frame Downloads clips
as v1, decoded frame-for-frame in lockstep:

- `C:\Users\every\Downloads\Woman_walking_in_hanbok_202609052145.mp4`
- `C:\Users\every\Downloads\Woman_walking_in_hanbok-clip-1_202609052229.mp4`

During 1.50–2.00s, only the incoming Tokyo ticket moves. Its rounded body
enters from below with a chosen `-5.0°` initial tilt and eases upright; this is
a tunable design value, not a claim that the reference used exactly that angle.
A narrow 6px maximum directional trail is applied only to the card. A local,
restrained gray backing/stack edge and shadow follow the same silhouette. The
person layers remain fixed and are composited after the card backgrounds. Old
and new mattes are complementary above/below the transformed card's actual
slanted top edge, so the card's PNG white margins cannot erase the old head.
No retiming, optical flow, or new generation is used.

## Outputs

- `synced-transition-v2.mp4` — normal-speed 4s probe (96 frames)
- `synced-transition-v2-half-speed.mp4` — the same 96 frames at 0.5x (about 8s, 12fps timeline)
- `synced-transition-v2-contact.jpg` — overall checks plus every 2nd frame from 1.50–2.00s
- `synced-transition-v2-matte-contact.jpg` — matte evidence
- `midpoint-card-silhouette.png` — transformed card geometry at 1.75s

Render and verify both outputs with:

```powershell
python .\render_synced_transition_v2.py
ffmpeg -hide_banner -loglevel error -i .\synced-transition-v2.mp4 -f null -
ffmpeg -hide_banner -loglevel error -i .\synced-transition-v2-half-speed.mp4 -f null -
```

The script runs those full ffmpeg decodes itself and also checks that each
output contains 96 decoded video frames. This is evidence for this bounded
probe only, not a claim of an exact reference recreation or a final 13-second
sequence.
