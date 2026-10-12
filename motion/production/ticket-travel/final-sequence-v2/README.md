# Final sequence v2 — green-screen Hanoi variant

This is an isolated v2 output directory. It imports the locked renderer from
[`../final-sequence-v1/render_final_sequence.py`](../final-sequence-v1/render_final_sequence.py)
for the 13s timeline, ticket geometry, fixed-screen actors, complementary
transition masks, audio sketch, and ffmpeg verification. The v1 directory and
its review outputs are not modified.

The only changed source choice is Hanoi: v2 explicitly keys the uniform-green
background from `../performance-v2/hanoi-hat-green-10s.mp4`. White clothing is
kept as opaque source RGB, with only a narrow soft edge; no broad blur or
white-fabric heuristic is used. Seoul, Tokyo, and Shanghai retain the v1
sources and mattes exactly.

The renderer refuses a missing green input and never falls back to the white
Hanoi source. It also redirects temporary video/audio files into this
directory, so a v2 run cannot overwrite v1 artifacts.

The canonical v2 outputs were rendered after validating the green source at
720x1280/24fps with 240 frames and checking frame 216 before the full run.
The current `final-sequence-v2.mp4`, half-speed output, and contact sheet are
review artifacts; final approval remains with the sequence owner.

## Provenance

The performance prompts and source provenance are recorded in
[`../performance-v2/long-variant-prompts.md`](../performance-v2/long-variant-prompts.md).
The required green edit is the Flow background-only edit of the completed
Hanoi 10s performance; motion and cloth must remain unchanged before render
approval.

## Render

Run after the green source exists and motion has been checked:

```powershell
python .\render_final_sequence.py
ffmpeg -hide_banner -loglevel error -i .\final-sequence-v2.mp4 -f null -
ffmpeg -hide_banner -loglevel error -i .\final-sequence-v2-half-speed.mp4 -f null -
```

Outputs are 312 frames at 720x1280/24fps (13.000s) and a 26s half-speed
review with 312 video frames at 12fps. The v1 renderer also validates metadata
and performs full ffmpeg decode checks.
