"""Render a direct-gait 1.00x versus 1.80x Seoul comparison.

This bounded test imports the existing high-tempo retime helper and changes
only its source, start time, and factor list. No source or production file is
written.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HELPER_PATH = ROOT / "analysis" / "high-tempo-probe-2026-09-06" / "render_high_tempo_probe.py"
SOURCE = ROOT / "production" / "ticket-travel" / "performance-v2" / "canonical-hanbok-10s.mp4"
SOURCE_START = 2.5
OUTPUT_SECONDS = 2.0
FPS = 24
FRAME_COUNT = 48
FACTORS = (1.00, 1.80)


def load_helper():
    spec = importlib.util.spec_from_file_location("high_tempo_helper", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_comparison(helper, outputs: list[tuple[float, Path]], destination: Path) -> None:
    inputs = [item for _, path in outputs for item in ("-i", str(path))]
    filters = []
    for index, (factor, _) in enumerate(outputs):
        filters.append(
            f"[{index}:v]scale=720:1280,drawtext=text='Seoul {factor:.2f}x':x=18:y=18:fontsize=28:"
            "fontcolor=white:box=1:boxcolor=black@0.65[v" + str(index) + "]"
        )
    filters.append("[v0][v1]hstack=inputs=2[out]")
    helper.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
        "-filter_complex", ";".join(filters), "-map", "[out]", "-an",
        "-frames:v", str(FRAME_COUNT), "-r", str(FPS), "-c:v", "libx264",
        "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
    ])


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    helper = load_helper()
    helper.SOURCE = SOURCE
    helper.SOURCE_START = SOURCE_START
    helper.OUTPUT_SECONDS = OUTPUT_SECONDS
    helper.FRAME_COUNT = FRAME_COUNT
    outputs: list[tuple[float, Path]] = []
    for factor in FACTORS:
        path = HERE / f"canonical-hanbok-{factor:.2f}x-2s.mp4"
        helper.render_candidate(factor, path)
        outputs.append((factor, path))
    comparison = HERE / "canonical-hanbok-1.00x-vs-1.80x-2s.mp4"
    make_comparison(helper, outputs, comparison)
    for _, path in outputs:
        helper.decode_check(path)
    helper.decode_check(comparison)
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Direct Seoul gait comparison at unchanged source start, 1.00x versus user-selected 1.80x",
        "source": str(SOURCE),
        "source_probe": helper.probe(SOURCE),
        "source_start_seconds": SOURCE_START,
        "factor_definition": "standard playback speed; source_time = source_start + factor * output_time",
        "output": {"fps": FPS, "frames": FRAME_COUNT, "seconds": OUTPUT_SECONDS, "width": 720, "height": 1280},
        "candidates": [
            {"factor": 1.00, "source_window_seconds": [2.5, 4.5], "output_window_seconds": [0.0, 2.0]},
            {"factor": 1.80, "source_window_seconds": [2.5, 6.1], "output_window_seconds": [0.0, 2.0]},
        ],
        "comparison": {"layout": "2 columns, 720x1280 each, 1440x1280 total", "seconds": 2.0},
        "fixed": ["same canonical Seoul source and source start", "person-only retime", "no card, head, matte, audio, Flow, or production changes"],
        "artifacts": {},
    }
    for path in (SOURCE, *[path for _, path in outputs], comparison):
        metadata["artifacts"][str(path)] = {
            "sha256": helper.sha256(path), "bytes": path.stat().st_size,
            "probe": helper.probe(path),
        }
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# Direct gait test — canonical Seoul\n\n"
        "A bounded person-only comparison using the existing canonical Seoul 10-second source. Both candidates begin at source 2.5s and output 2.0s at 24fps/48 frames; only the playback factor changes.\n\n"
        "- [1.00x baseline, source 2.5–4.5s](canonical-hanbok-1.00x-2s.mp4)\n"
        "- [1.80x candidate, source 2.5–6.1s](canonical-hanbok-1.80x-2s.mp4)\n"
        "- [Side-by-side comparison](canonical-hanbok-1.00x-vs-1.80x-2s.mp4)\n"
        "- [Metadata](metadata.json)\n"
        "- [Render script](render_direct_gait_test.py)\n\n"
        "The 1.80x result is a retime candidate, not a reference-measured speed or approval. Card/head/matte/audio were excluded. All MP4 outputs were ffmpeg-decoded and metadata-checked; no Flow submission or production overwrite was performed.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
