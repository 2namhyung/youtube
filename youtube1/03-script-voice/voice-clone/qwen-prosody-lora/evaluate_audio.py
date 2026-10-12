"""Signal, boundary, pitch, and tempo checks for matched comparison WAVs."""
from __future__ import annotations

import json
import math
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs" / "comparison"
EXPECTED_CHARACTERS = 21


def metrics(path: Path) -> dict:
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim != 1 or sample_rate != 24000 or not np.isfinite(audio).all():
        raise RuntimeError(f"invalid comparison audio: {path}")
    duration = len(audio) / sample_rate
    frame_length, hop_length = 600, 240
    rms = librosa.feature.rms(y=audio, frame_length=frame_length,
                              hop_length=hop_length, center=False)[0]
    silent = rms < 0.01  # -40 dBFS
    silence_ratio = float(np.mean(silent))
    voiced_seconds = max(duration * (1.0 - silence_ratio), 1e-9)
    f0, voiced_flag, _ = librosa.pyin(
        audio, fmin=60.0, fmax=500.0, sr=sample_rate,
        frame_length=2048, hop_length=240,
    )
    voiced_f0 = f0[np.isfinite(f0)]
    if len(voiced_f0) < 10:
        raise RuntimeError(f"insufficient voiced pitch frames: {path}")
    edge_n = min(len(audio), int(0.020 * sample_rate))
    boundary_diffs = np.concatenate((np.diff(audio[:edge_n]), np.diff(audio[-edge_n:])))
    return {
        "path": str(path.resolve()),
        "sample_rate": sample_rate,
        "duration_seconds": duration,
        "peak": float(np.max(np.abs(audio))),
        "clipped_sample_ratio": float(np.mean(np.abs(audio) >= 0.999)),
        "silence_ratio_rms_below_minus_40_dbfs": silence_ratio,
        "voiced_seconds_estimate": voiced_seconds,
        "tempo_characters_per_voiced_second": EXPECTED_CHARACTERS / voiced_seconds,
        "boundary_endpoint_max_abs_amplitude": float(max(abs(audio[0]), abs(audio[-1]))),
        "boundary_max_adjacent_jump_first_last_20ms": float(np.max(np.abs(boundary_diffs))),
        "pitch_hz": {
            "median": float(np.median(voiced_f0)),
            "p10": float(np.percentile(voiced_f0, 10)),
            "p90": float(np.percentile(voiced_f0, 90)),
            "voiced_frames": int(len(voiced_f0)),
        },
    }


def ratio(adapter: float, base: float) -> float:
    return adapter / base if base else math.inf


def main() -> None:
    base = metrics(OUT / "base.wav")
    adapter = metrics(OUT / "adapter.wav")
    comparisons = {
        "duration_ratio_adapter_to_base": ratio(adapter["duration_seconds"], base["duration_seconds"]),
        "silence_ratio_delta_adapter_minus_base": (
            adapter["silence_ratio_rms_below_minus_40_dbfs"]
            - base["silence_ratio_rms_below_minus_40_dbfs"]
        ),
        "tempo_ratio_adapter_to_base": ratio(
            adapter["tempo_characters_per_voiced_second"],
            base["tempo_characters_per_voiced_second"],
        ),
        "median_pitch_ratio_adapter_to_base": ratio(
            adapter["pitch_hz"]["median"], base["pitch_hz"]["median"]
        ),
    }
    gates = {
        "duration_ratio_0_75_to_1_35": 0.75 <= comparisons["duration_ratio_adapter_to_base"] <= 1.35,
        "adapter_silence_ratio_le_0_45": adapter["silence_ratio_rms_below_minus_40_dbfs"] <= 0.45,
        "adapter_silence_increase_le_0_15": comparisons["silence_ratio_delta_adapter_minus_base"] <= 0.15,
        "tempo_ratio_0_75_to_1_35": 0.75 <= comparisons["tempo_ratio_adapter_to_base"] <= 1.35,
        "median_pitch_ratio_0_75_to_1_333": 0.75 <= comparisons["median_pitch_ratio_adapter_to_base"] <= 1.333,
        "adapter_no_clipping": adapter["clipped_sample_ratio"] == 0.0,
        "adapter_endpoint_amplitude_le_0_02": adapter["boundary_endpoint_max_abs_amplitude"] <= 0.02,
        "adapter_boundary_jump_le_0_25": adapter["boundary_max_adjacent_jump_first_last_20ms"] <= 0.25,
    }
    asr = json.loads((OUT / "asr_report.json").read_text(encoding="utf-8"))
    report = {
        "base": base, "adapter": adapter, "comparison": comparisons,
        "audio_gate": gates, "asr_status": asr["status"],
    }
    report["status"] = "pass" if all(gates.values()) and asr["status"] == "pass" else "fail"
    (OUT / "quality_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"status": report["status"], "report": str(OUT / "quality_report.json")}))


if __name__ == "__main__":
    main()
