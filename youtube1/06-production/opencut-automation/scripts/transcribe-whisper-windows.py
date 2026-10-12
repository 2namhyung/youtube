import argparse
import json

from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio


parser = argparse.ArgumentParser()
parser.add_argument("audio")
parser.add_argument("windows")
parser.add_argument("output")
parser.add_argument("--models", default="small,medium")
parser.add_argument("--device", default="cpu")
parser.add_argument("--compute-type", default="int8")
parser.add_argument("--beam-size", type=int, default=5)
args = parser.parse_args()

with open(args.windows, "r", encoding="utf-8") as handle:
    windows = json.load(handle)

if not isinstance(windows, list) or not windows:
    raise ValueError("pronunciation windows must be a non-empty array")

sampling_rate = 16000
audio = decode_audio(args.audio, sampling_rate=sampling_rate)
models = [item.strip() for item in args.models.split(",") if item.strip()]
if models != ["small", "medium"]:
    raise ValueError("pronunciation QA requires small,medium")

results = [{**item, "checks": []} for item in windows]
for model_name in models:
    model = WhisperModel(model_name, device=args.device, compute_type=args.compute_type)
    for index, item in enumerate(windows):
        start = max(0, round(float(item["start"]) * sampling_rate))
        end = min(len(audio), round(float(item["end"]) * sampling_rate))
        if end <= start:
            raise ValueError(f"empty pronunciation window {item.get('id', index)}")
        segments, _ = model.transcribe(
            audio[start:end],
            language="ko",
            beam_size=args.beam_size,
            best_of=max(1, args.beam_size),
            temperature=0.0,
            vad_filter=False,
            word_timestamps=True,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        results[index]["checks"].append({"model": model_name, "text": text})
    del model

payload = {
    "schema": "localized-korean-pronunciation-asr-v1",
    "models": models,
    "windows": results,
}
with open(args.output, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
