# Relative prosody transfer prototype

`prosody_transfer.py` creates a same-text comparison from the accepted Qwen
canonical recording. It uses only the numeric aggregate values in
`voice-clone/instagram-prosody-profile.json`; Instagram waveforms are never
loaded as prompt audio. The user's own median F0 is retained and only the
relative contour is blended at 50% and 80%. FFmpeg Rubber Band is run with
`formant=preserved` on short windows, then overlap-added at the source duration.

```powershell
python prosody_transfer.py
```

Outputs, provenance, LUFS, peak/clipping checks, and contour-strength metrics
are recorded in `manifest.json`.

This is a 3.75-second, one-sentence prototype: it validates relative pitch
contour only. Pause timing, speaking rate, and emphasis transfer require a
longer multi-sentence sample in the next stage.
