#!/usr/bin/env python3
"""Offline dual-Whisper CER gate for all five role prompt samples."""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "validation"
MODELS = {
    "small": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-small\snapshots\536b0662742c02347bc0e980a01041f333bce120"),
    "medium": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-medium\snapshots\08e178d48790749d25932bbc082711ddcfdfbc4f"),
}
MAX_CER = 0.08


def normalize(text: str) -> str:
    return "".join(ch.lower() for ch in unicodedata.normalize("NFC", text) if ch.isalnum())


def distance(source: str, target: str) -> int:
    previous = list(range(len(target) + 1))
    for index, source_char in enumerate(source, 1):
        current = [index]
        for target_index, target_char in enumerate(target, 1):
            current.append(min(current[-1] + 1, previous[target_index] + 1,
                               previous[target_index - 1] + (source_char != target_char)))
        previous = current
    return previous[-1]


def main() -> None:
    generation = json.loads((OUT / "generation_report.json").read_text(encoding="utf-8"))
    if generation["status"] != "pass" or generation["loraLoaded"] or generation["adapterLoaded"]:
        raise RuntimeError("Base-only generation report must pass before ASR")
    report = {"status": "running", "maxCharacterErrorRate": MAX_CER, "models": {}}
    for model_name, model_path in MODELS.items():
        if not model_path.is_dir():
            raise RuntimeError(f"missing offline ASR model: {model_path}")
        model = WhisperModel(str(model_path), device="cpu", compute_type="int8",
                             local_files_only=True, cpu_threads=4)
        styles = {}
        for style, entry in generation["styles"].items():
            segments, info = model.transcribe(
                str(ROOT / entry["output"]), language="ko", beam_size=5,
                temperature=0.0, vad_filter=False, condition_on_previous_text=False,
            )
            transcript = "".join(segment.text for segment in segments).strip()
            expected = normalize(entry["text"]); actual = normalize(transcript)
            edits = distance(expected, actual); cer = edits / max(1, len(expected))
            styles[style] = {
                "expected": entry["text"], "transcript": transcript,
                "normalizedExpected": expected, "normalizedTranscript": actual,
                "edits": edits, "referenceCharacters": len(expected), "cer": cer,
                "languageProbability": info.language_probability,
                "passes": cer <= MAX_CER,
            }
        report["models"][model_name] = {
            "styles": styles, "status": "pass" if all(x["passes"] for x in styles.values()) else "fail"
        }
        del model
    report["status"] = "pass" if all(x["status"] == "pass" for x in report["models"].values()) else "fail"
    (OUT / "asr_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": report["status"], "report": str(OUT / "asr_report.json")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
