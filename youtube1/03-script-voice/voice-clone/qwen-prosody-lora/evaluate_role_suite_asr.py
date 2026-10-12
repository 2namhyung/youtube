"""Offline dual-ASR gate on the five mastered base/adapter role pairs."""
from __future__ import annotations

import json
import unicodedata
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs" / "role_suite"
MASTERED = OUT / "mastered"
MODELS = {
    "small": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-small\snapshots\536b0662742c02347bc0e980a01041f333bce120"),
    "medium": Path(r"C:\Users\User\.cache\huggingface\hub\models--Systran--faster-whisper-medium\snapshots\08e178d48790749d25932bbc082711ddcfdfbc4f"),
}


def normalize(text: str) -> str:
    return "".join(ch.lower() for ch in unicodedata.normalize("NFC", text) if ch.isalnum())


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
    base_generation = json.loads((OUT / "generation_base.json").read_text(encoding="utf-8"))
    adapter_generation = json.loads((OUT / "generation_adapter.json").read_text(encoding="utf-8"))
    if base_generation["status"] != "pass" or adapter_generation["status"] != "pass":
        raise RuntimeError("generation reports must pass before ASR")
    roles = base_generation["roles"]
    if set(roles) != set(adapter_generation["roles"]):
        raise RuntimeError("base/adapter role mismatch")
    report = {"status": "running", "support": "unsupported-experimental", "models": {}}
    for model_name, model_path in MODELS.items():
        model = WhisperModel(str(model_path), device="cpu", compute_type="int8",
                             local_files_only=True, cpu_threads=4)
        model_report = {"roles": {}}
        for role, role_info in roles.items():
            expected_text = role_info["text"]
            expected = normalize(expected_text)
            variants = {}
            for variant in ("base", "adapter"):
                segments, info = model.transcribe(
                    str(MASTERED / f"{role}_{variant}.wav"), language="ko",
                    beam_size=5, temperature=0.0, vad_filter=False,
                    condition_on_previous_text=False,
                )
                transcript = "".join(segment.text for segment in segments).strip()
                normalized = normalize(transcript)
                edits = distance(expected, normalized)
                cer = edits / max(1, len(expected))
                variants[variant] = {
                    "transcript": transcript, "normalized": normalized,
                    "edits": edits, "reference_characters": len(expected), "cer": cer,
                    "language_probability": info.language_probability,
                    "passes_cer_0_08": cer <= 0.08,
                }
            model_report["roles"][role] = variants
        base_mean = sum(x["base"]["cer"] for x in model_report["roles"].values()) / len(roles)
        adapter_mean = sum(x["adapter"]["cer"] for x in model_report["roles"].values()) / len(roles)
        worse_roles = sum(x["adapter"]["cer"] > x["base"]["cer"] for x in model_report["roles"].values())
        model_report["summary"] = {
            "base_mean_cer": base_mean, "adapter_mean_cer": adapter_mean,
            "adapter_minus_base_mean_cer": adapter_mean - base_mean,
            "adapter_worse_role_count": worse_roles,
            "all_adapter_samples_cer_le_0_08": all(x["adapter"]["cer"] <= 0.08 for x in model_report["roles"].values()),
            "mean_adapter_not_over_base_by_0_02": adapter_mean <= base_mean + 0.02,
            "no_majority_role_regression": worse_roles < 3,
        }
        model_report["status"] = "pass" if all(
            model_report["summary"][key] for key in (
                "all_adapter_samples_cer_le_0_08", "mean_adapter_not_over_base_by_0_02",
                "no_majority_role_regression",
            )
        ) else "fail"
        report["models"][model_name] = model_report
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
