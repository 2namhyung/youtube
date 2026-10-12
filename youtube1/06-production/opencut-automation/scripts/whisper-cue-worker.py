import json
import sys
import argparse
from faster_whisper import WhisperModel

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


parser = argparse.ArgumentParser()
parser.add_argument("--model", default="small")
args = parser.parse_args()
model = WhisperModel(args.model, device="cpu", compute_type="int8")
emit({"ready": True})
for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        segments, _ = model.transcribe(request["audio"], language="ko", vad_filter=True, word_timestamps=True)
        payload = {"segments": []}
        for segment in segments:
            payload["segments"].append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "words": [
                    {"start": word.start, "end": word.end, "text": word.word.strip()}
                    for word in (segment.words or [])
                    if word.start is not None and word.end is not None and word.word.strip()
                ],
            })
        emit({"id": request["id"], "ok": True, "transcript": payload})
    except Exception as error:
        emit({"id": request.get("id") if isinstance(request, dict) else None, "ok": False, "error": str(error)})
