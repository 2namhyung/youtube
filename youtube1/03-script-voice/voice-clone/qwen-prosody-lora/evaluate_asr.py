"""Offline dual-ASR intelligibility check for the matched comparison WAVs."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs" / "comparison"
TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다."
MODELS = {
    "small": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-small\snapshots\536b0662742c02347bc0e980a01041f333bce120"),
    "medium": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-medium\snapshots\08e178d48790749d25932bbc082711ddcfdfbc4f"),
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return "".join(ch for ch in text.lower() if ch.isalnum())


def distance(a: str, b: str) -> int:
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def main() -> None:
    expected = normalize(TEXT)
    report = {"expected": TEXT, "normalized_expected": expected, "models": {}}
    for model_name, model_path in MODELS.items():
        if not model_path.is_dir():
            raise RuntimeError(f"missing offline ASR model: {model_path}")
        model = WhisperModel(str(model_path), device="cpu", compute_type="int8",
                             local_files_only=True, cpu_threads=4)
        model_results = {}
        for variant in ("base", "adapter"):
            wav = OUT / f"{variant}.wav"
            segments, info = model.transcribe(str(wav), language="ko", beam_size=5,
                                               temperature=0.0, vad_filter=False,
                                               condition_on_previous_text=False)
            transcript = "".join(segment.text for segment in segments).strip()
            normalized = normalize(transcript)
            edits = distance(expected, normalized)
            cer = edits / max(1, len(expected))
            model_results[variant] = {
                "transcript": transcript,
                "normalized": normalized,
                "edits": edits,
                "reference_characters": len(expected),
                "cer": cer,
                "language_probability": info.language_probability,
                "passes_cer_0_08": cer <= 0.08,
            }
        report["models"][model_name] = model_results
        del model
    report["gate"] = {
        "adapter_both_cer_le_0_08": all(
            report["models"][name]["adapter"]["passes_cer_0_08"] for name in MODELS
        ),
    }
    report["comparison"] = {
        name: {
            "adapter_minus_base_cer": (
                report["models"][name]["adapter"]["cer"]
                - report["models"][name]["base"]["cer"]
            )
        }
        for name in MODELS
    }
    report["status"] = "pass" if all(report["gate"].values()) else "fail"
    (OUT / "asr_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"status": report["status"], "report": str(OUT / "asr_report.json")}))


if __name__ == "__main__":
    main()
