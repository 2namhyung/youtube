import argparse
import json
import os
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument("audio")
parser.add_argument("output")
parser.add_argument("--model", default="small")
parser.add_argument("--device", default="cpu")
parser.add_argument("--compute-type", default="int8")
parser.add_argument("--beam-size", type=int, default=1)
args = parser.parse_args()
audio, output = args.audio, args.output
model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
segments, _ = model.transcribe(
    audio,
    language="ko",
    beam_size=args.beam_size,
    best_of=max(1, args.beam_size),
    temperature=0.0,
    # The authority-bound Python mirror can live below a deeply nested job path on
    # Windows.  Silero VAD imports onnxruntime, whose native DLL loader can fail at
    # that depth even though faster-whisper itself is healthy.  Full-audio decoding
    # keeps the strict small+medium ASR acceptance gate while avoiding that optional
    # native dependency.
    vad_filter=False,
    word_timestamps=True,
    condition_on_previous_text=False,
)
segments = list(segments)
def ts(value):
    ms = max(0, round(value * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
if os.path.splitext(output)[1].lower() == ".json":
    payload = {
        "segments": [
            {
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "words": [
                    {"start": word.start, "end": word.end, "text": word.word.strip()}
                    for word in (seg.words or [])
                    if word.start is not None and word.end is not None and word.word.strip()
                ],
            }
            for seg in segments
        ]
    }
    with open(output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
else:
    with open(output, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")
