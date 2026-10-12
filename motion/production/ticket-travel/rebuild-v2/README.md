# Ticket travel rebuild v2 — actual Flow probes

Status: two real generated and downloaded 4-second probes. Not the final 13-second reproduction; user visual review pending.

## Actual workflow

- ImageGen ticket background: `assets/T1-bangkok-imagegen.png`.
- ImageGen composed person + ticket frames: `assets/F1-bangkok-imagegen.png`, `assets/F2-seoul-imagegen.png`. F2 preserves F1 identity/layout while changing destination and outfit from the reference.
- Flow custom tool: [Ticket Journey Frame Director](https://flow.google.com/project/a37f8501-9284-4599-bee5-bafd23699149/tool/81bf79b6-43bd-4ce1-a32a-3609491097e7).
- Use **Select from Flow → 미디어 업로드 → choose image → 미디어 추가**. The applet's Local Upload chooser did not work through browser automation; the host Flow picker did.
- Model: `Omni 1.1 Flash`; aspect 9:16; 720p; 4 seconds. Tool invokes `Flow.generate.video`, not merely a prompt handoff. Results appear automatically in the project gallery.
- Download via result in project gallery → 장면 다운로드. Applet direct media download did not yield a usable local download in this run.

## Results and evidence

- `probe-01-omni.mp4`: Bangkok walking only; 720×1280, 24fps, 96 frames. Exact request: `probe-01-request.json`. Sampled card extent stable; person motion visible; no obvious broad white halo. See `probe-01-geometry.txt` for limits.
- `probe-02-transition.mp4`: Bangkok → Seoul foreground card slide; same format. Exact request: `probe-02-request.json`. `probe-02-contact.jpg` shows incoming card traveling upward and occluding the previous scene, then continued leg motion. Exact pose-phase continuity and pixel-perfect subject scale are not proven.

## Known limitations

- New ImageGen card margins differ from the original 1:2 reference when adapted to 9:16. Do not call the current design identical.
- The walk is more in-place/march-like than the reference's relaxed gait.
- Initial backpack scene, DALI, TOKYO and full sound/timing assembly are not produced in v2 yet.
- Initial Veo Lite 4s request returned only `Error: rj`. Builder attributed it to tier/duration restrictions; that cause was not independently verified. Omni 4s succeeded.
- Changing applet code changed its storage origin and lost visible bindings; gallery assets remained safe and were reselected. Do not promise cross-version persistence.

No local application diagnostic suite exists for this hosted Flow tool. Focused verification used ffprobe metadata and ffmpeg decoding, plus visual review. No repository build, publish, or deploy was performed.
