# Production projects

The canonical narration provider is `Qwen/Qwen3-TTS-12Hz-0.6B-Base` on CUDA in BF16. New projects created with `npm run short:new -- <id>` use the locked local Qwen reference voice and do not fall back to another TTS engine.

## Requirements

- Node.js 20+
- Python runtime: `C:/Users/User/tools/qwen3-tts-pilot/.venv`
- Qwen Base cache: `C:/Users/User/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-Base`
- Locked model revision: `5d83992436eae1d760afd27aff78a71d676296fc` (`local_files_only`)
- NVIDIA CUDA GPU; the target machine is an RTX 3060 Ti 8 GB
- Absolute regular FFmpeg, FFprobe, Python, and Edge TTS executable paths (PATH lookup is not used by `produce-short`)
- `C:/Windows/Fonts/NotoSansKR-VF.ttf`

## Create and produce

```powershell
npm run short:new -- my-short
npm run short:produce -- --project production/projects/my-short/project.json --ffmpeg-executable C:/absolute/path/ffmpeg.exe --ffprobe-executable C:/absolute/path/ffprobe.exe --python-executable C:/absolute/path/python.exe --edge-tts-executable C:/absolute/path/edge-tts.exe
```

`narration.style` may opt into one validated owner prompt for the entire run:
`hook`, `news_exposition`, `tension`, `criticism`, or `solution_closing`.
Omitting `style` preserves the existing canonical neutral reference and its
required `referenceAudio`/`referenceTranscript`. Role styles resolve through
[`profiles/qwen-f4/prompt-bank/manifest.json`](../../../03-script-voice/voice-clone/profiles/qwen-f4/prompt-bank/manifest.json);
caller-supplied reference fields, when present, must exactly match the selected
entry. Missing manifests/assets, SHA mismatch, or style mismatch fail closed.

Set `narration.style` to `auto` to classify blank-line-delimited sections before
synthesis. The versioned deterministic rules use first/last position, explicit
`[[style]]` labels, and fixed content-keyword priority; zero-evidence middle
sections use the canonical neutral bank prompt. A manual `stylePlan` override is
bound to the cleaned section content with exactly `segmentIndex`, lowercase
`textSha256`, and one explicit non-neutral role. Duplicate indexes, out-of-range
indexes, text drift, custom reference fields, and unknown styles fail before the
worker starts. A section keeps one style across all of its sentence groups.

Qwen synthesis rules:

- natural sentence groups, not caption-sized microsegments;
- one persistent BF16 worker and one immutable cached prompt per used style;
- locked 0.6B Base only: the worker rejects LoRA/adapters and records both as unloaded;
- deterministic candidate seeds with no provider fallback;
- Whisper small and medium CPU verification, both capped at 8% character error rate;
- no artificial join silence;
- gain-only active-RMS matching capped at +/-3 dB and -1 dBFS headroom; no pitch/formant processing, compression, or crossfade;
- optional final whole-wave tempo adjustment is limited to `1.00`-`1.08`;
- GPU admission at 52 C or below and hard stop at 74 C;
- final captions are mapped from accepted word timestamps back to the source cues.

Use `npm run test:canonical` for the fast contract suite,
`npm run test:qwen3-tts-gpu-smoke` for the neutral reference check, and
`npm run test:qwen3-tts-auto-gpu-smoke` for the five-style real BF16 check.

Historical `edge-tts`, CosyVoice, Fish Speech and GPT-SoVITS project metadata may remain in archived evidence, but their model weights are not part of the active production runtime.

Role prompts were validated on one fixed sentence and seed per style with
Whisper small+medium and signal gates. This is not a blinded human preference
test. The accepted automatic mixed-style artifact, subtitles, classifier plan,
prompt hashes, word anchors, loudness joins, and GPU evidence are in
[`runs/qwen-auto-style-20260730`](../../../03-script-voice/runs/qwen-auto-style-20260730).
