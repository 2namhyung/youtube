# Blind transition prototype

This is a deterministic ffmpeg prototype for the Taoagou-style blind/outfit
transition. It uses the two supplied stills as the light and dark looks; the
existing cord in the source artwork is kept visible while a tiny, phase-matched
crop drift provides restrained Ken Burns / pull motion.

## Run

From PowerShell:

```powershell
Set-Location 'C:\Users\every\Documents\project\motiongraphic\prototype\blind-transition'
& .\render.ps1
```

The script resolves every path from `$PSScriptRoot`, creates `output` if needed,
and writes `output\blind-transition-prototype.mp4`. It requires `ffmpeg` and
`ffprobe` on `PATH`; no network access is used.

## Timeline

- `0.000–2.333 s`: light character still, with a very small animated crop drift.
- `2.333–2.633 s`: horizontal blind slats close outward from the center and
  occlude the light look.
- `2.633 s`: maximum occlusion; the light source is replaced by the dark source.
- `2.633–2.933 s`: the dense slat field opens from the center, revealing the
  dark character still.
- `2.933–6.200 s`: dark character still, with the same phase-matched drift.

The output is 1080x1920, 30 fps, 186 frames (6.2 seconds), H.264, and has no
audio track.

## Replacing the person with Gemini Omni

Keep the deterministic slat and edit structure. Replace the two still-image
inputs in `render.ps1` with two rendered person clips (or two clip paths) at the
`[0:v]` and `[1:v]` inputs. The Gemini Omni clips should preserve the same
framing, hand/cord position, camera scale, and duration. If the clips are
longer, trim them to the same 6.2-second timeline before the `blend` node; if
they contain audio, keep `-an` unless an intentional sound design pass is
added.

The current slat mask is generated in the `[slats]` node. Its close/open timing
and density are independent of the person-generation step, so they can be
tuned without regenerating the character clips.
