"""Pair-wise common-target loudness matching for the five-role suite."""
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

from generate_role_suite import OUT, RAW, ROLES
from pilot import sha256

MASTERED = OUT / "mastered"
TARGET_LUFS = -23.0
PEAK_CEILING_DBFS = -1.0


def integrated_lufs(path: Path) -> float:
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=True,
    )
    values = re.findall(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", process.stderr)
    if not values:
        raise RuntimeError(f"ffmpeg did not report integrated loudness for {path}")
    value = float(values[-1])
    if not math.isfinite(value) or value <= -70:
        raise RuntimeError(f"invalid integrated loudness {value} for {path}")
    return value


def raw_peak_dbfs(audio: np.ndarray) -> float:
    peak = float(np.max(np.abs(audio)))
    return 20.0 * math.log10(max(peak, 1e-12))


def main() -> None:
    MASTERED.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "running", "support": "unsupported-experimental",
        "policy": {
            "nominal_target_lufs": TARGET_LUFS,
            "peak_ceiling_dbfs": PEAK_CEILING_DBFS,
            "pair_fairness": "one common safe LUFS target per role; gain only; no dynamics or trimming",
        },
        "roles": {},
    }
    for role in ROLES:
        measured = {}
        for variant in ("base", "adapter"):
            path = RAW / f"{role}_{variant}.wav"
            audio, sr = sf.read(path, dtype="float32", always_2d=False)
            if sr != 24000 or audio.ndim != 1 or not np.isfinite(audio).all():
                raise RuntimeError(f"invalid raw input: {path}")
            measured[variant] = {
                "path": path, "audio": audio, "sr": sr,
                "lufs": integrated_lufs(path), "peak_dbfs": raw_peak_dbfs(audio),
            }
        safe_targets = [
            item["lufs"] + (PEAK_CEILING_DBFS - item["peak_dbfs"])
            for item in measured.values()
        ]
        common_target = min(TARGET_LUFS, *safe_targets)
        role_report = {"common_target_lufs": common_target, "variants": {}}
        for variant, item in measured.items():
            gain_db = common_target - item["lufs"]
            mastered = item["audio"] * (10.0 ** (gain_db / 20.0))
            if float(np.max(np.abs(mastered))) >= 1.0:
                raise RuntimeError(f"mastering would clip {role}/{variant}")
            path = MASTERED / f"{role}_{variant}.wav"
            sf.write(path, mastered, item["sr"], subtype="PCM_16")
            reread, _ = sf.read(path, dtype="float32")
            post_lufs = integrated_lufs(path)
            clipped = int(np.count_nonzero(np.abs(reread) >= 0.999))
            role_report["variants"][variant] = {
                "raw_path": str(item["path"].resolve()), "raw_sha256": sha256(item["path"]),
                "raw_lufs": item["lufs"], "raw_peak_dbfs": item["peak_dbfs"],
                "gain_db": gain_db, "mastered_path": str(path.resolve()),
                "mastered_sha256": sha256(path), "mastered_lufs": post_lufs,
                "mastered_peak_dbfs": raw_peak_dbfs(reread), "clipped_samples": clipped,
            }
        post = role_report["variants"]
        role_report["loudness_delta_lu"] = abs(post["base"]["mastered_lufs"] - post["adapter"]["mastered_lufs"])
        role_report["passes"] = (
            role_report["loudness_delta_lu"] <= 0.2
            and all(item["clipped_samples"] == 0 for item in post.values())
        )
        report["roles"][role] = role_report
    report["status"] = "pass" if all(row["passes"] for row in report["roles"].values()) else "fail"
    (OUT / "mastering_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": report["status"], "report": str(OUT / "mastering_report.json")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
