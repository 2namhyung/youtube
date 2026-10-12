"""Raw and mastered signal/prosody metrics for all five matched role pairs."""
from __future__ import annotations

import json
import math
import unicodedata
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from generate_role_suite import OUT, RAW, ROLES
from master_role_suite import MASTERED


def normalized_char_count(text: str) -> int:
    return sum(ch.isalnum() for ch in unicodedata.normalize("NFC", text))


def metrics(path: Path, character_count: int) -> dict:
    audio, sr = sf.read(path, dtype="float32", always_2d=False)
    if sr != 24000 or audio.ndim != 1 or not np.isfinite(audio).all():
        raise RuntimeError(f"invalid audio: {path}")
    duration = len(audio) / sr
    rms = librosa.feature.rms(y=audio, frame_length=600, hop_length=240, center=False)[0]
    silence_ratio = float(np.mean(rms < 0.01))
    voiced_seconds = max(duration * (1.0 - silence_ratio), 1e-9)
    f0, _, _ = librosa.pyin(audio, fmin=60.0, fmax=500.0, sr=sr,
                            frame_length=2048, hop_length=240)
    f0 = f0[np.isfinite(f0)]
    if len(f0) < 10:
        raise RuntimeError(f"insufficient pitch frames: {path}")
    p10, median, p90 = (float(np.percentile(f0, q)) for q in (10, 50, 90))
    edge_n = min(len(audio), 480)
    edge_diffs = np.concatenate((np.diff(audio[:edge_n]), np.diff(audio[-edge_n:])))
    return {
        "path": str(path.resolve()), "sample_rate": sr, "duration_seconds": duration,
        "silence_ratio_rms_below_minus_40_dbfs": silence_ratio,
        "tempo_characters_per_voiced_second": character_count / voiced_seconds,
        "peak": float(np.max(np.abs(audio))),
        "clipped_sample_ratio": float(np.mean(np.abs(audio) >= 0.999)),
        "endpoint_max_abs_amplitude": float(max(abs(audio[0]), abs(audio[-1]))),
        "boundary_max_adjacent_jump_first_last_20ms": float(np.max(np.abs(edge_diffs))),
        "pitch_hz": {"median": median, "p10": p10, "p90": p90,
                     "p10_p90_range_semitones": 12.0 * math.log2(p90 / p10),
                     "voiced_frames": int(len(f0))},
    }


def ratio(a: float, b: float) -> float:
    return a / b if b else math.inf


def main() -> None:
    report = {"status": "running", "support": "unsupported-experimental", "roles": {}}
    for role, text in ROLES.items():
        count = normalized_char_count(text)
        row = {"text": text, "normalized_characters": count, "raw": {}, "mastered": {}}
        for stage, directory in (("raw", RAW), ("mastered", MASTERED)):
            base = metrics(directory / f"{role}_base.wav", count)
            adapter = metrics(directory / f"{role}_adapter.wav", count)
            comparison = {
                "duration_ratio_adapter_to_base": ratio(adapter["duration_seconds"], base["duration_seconds"]),
                "silence_delta_adapter_minus_base": adapter["silence_ratio_rms_below_minus_40_dbfs"] - base["silence_ratio_rms_below_minus_40_dbfs"],
                "tempo_ratio_adapter_to_base": ratio(adapter["tempo_characters_per_voiced_second"], base["tempo_characters_per_voiced_second"]),
                "median_pitch_ratio_adapter_to_base": ratio(adapter["pitch_hz"]["median"], base["pitch_hz"]["median"]),
            }
            gates = {
                "adapter_no_clipping": adapter["clipped_sample_ratio"] == 0.0,
                "duration_ratio_0_70_to_1_40": 0.70 <= comparison["duration_ratio_adapter_to_base"] <= 1.40,
                "adapter_silence_ratio_le_0_45": adapter["silence_ratio_rms_below_minus_40_dbfs"] <= 0.45,
                "adapter_silence_increase_le_0_15": comparison["silence_delta_adapter_minus_base"] <= 0.15,
                "tempo_ratio_0_70_to_1_40": 0.70 <= comparison["tempo_ratio_adapter_to_base"] <= 1.40,
                "median_pitch_ratio_0_75_to_1_333": 0.75 <= comparison["median_pitch_ratio_adapter_to_base"] <= 1.333,
                "adapter_endpoint_amplitude_le_0_02": adapter["endpoint_max_abs_amplitude"] <= 0.02,
                "adapter_boundary_jump_le_0_25": adapter["boundary_max_adjacent_jump_first_last_20ms"] <= 0.25,
            }
            row[stage] = {"base": base, "adapter": adapter, "comparison": comparison,
                          "gates": gates, "status": "pass" if all(gates.values()) else "fail"}
        report["roles"][role] = row
    report["status"] = "pass" if all(
        row[stage]["status"] == "pass" for row in report["roles"].values()
        for stage in ("raw", "mastered")
    ) else "fail"
    (OUT / "audio_metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": report["status"], "report": str(OUT / "audio_metrics.json")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
