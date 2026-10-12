"""Render bounded 1.5s visual auditions for Shanghai start-offset A/B/C.

This preserves the production renderer's transition/card/matte functions while
varying only Shanghai's source start. It writes silent review clips and a
three-column comparison for each affected boundary; no production file is read
or overwritten except as an input.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RENDER = ROOT / "analysis" / "t3-all-city-2026-09-06" / "render_t3_all_city.py"
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
SOURCES = {
    "tokyo": PERF / "tokyo-parasol-10s.mp4",
    "shanghai": PERF / "shanghai-fan-10s.mp4",
    "hanoi": PERF / "hanoi-hat-green-10s.mp4",
}
FFMPEG = "ffmpeg"
FPS, W, H = 24, 720, 1280
FACTOR = 1.8
OFFSETS = (2.375, 2.500, 2.625)


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


base = load_module(RENDER, "t3_phase_base")
v1, v2 = base.v1, base.v2
v1._green_matte = v2._green_matte


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def clip(boundary: str, shanghai_start: float, output: Path,
         hanoi_start: float = 6.0, start_abs: float | None = None,
         duration: float = 1.5) -> None:
    if start_abs is None:
        start_abs = 8.25 if boundary == "tokyo-shanghai" else 10.25
    end_abs = start_abs + duration
    tickets = [np.asarray(Image.open(p).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)) for p in v1.TICKETS]
    starts = {"tokyo": 2.5, "shanghai": shanghai_start, "hanoi": hanoi_start}
    readers = {name: base.SourceReader(path, starts[name]) for name, path in SOURCES.items()}
    body = v1.v2._body_mask()
    output.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
                             "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                             "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], stdin=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for i in range(round(duration * FPS)):
            t = start_abs + i / FPS
            if boundary == "tokyo-shanghai":
                if t < 9.0:
                    actor, ai, _ = readers["tokyo"].at(t - 6.5)
                    composed = v1._static(tickets[1], actor, "tokyo", ai, True)
                elif t < 9.5:
                    old, oi, _ = readers["tokyo"].at(t - 6.5)
                    new, ni, _ = readers["shanghai"].at(t - 9.0)
                    composed = v1._transition(tickets[1], tickets[2], old, new, t - 9.0, body,
                                               "tokyo", "shanghai", oi, ni, True)
                else:
                    actor, ai, _ = readers["shanghai"].at(t - 9.0)
                    composed = v1._static(tickets[2], actor, "shanghai", ai, True)
            else:
                if t < 11.0:
                    actor, ai, _ = readers["shanghai"].at(t - 9.0)
                    composed = v1._static(tickets[2], actor, "shanghai", ai, True)
                elif t < 11.5:
                    old, oi, _ = readers["shanghai"].at(t - 9.0)
                    new, ni, _ = readers["hanoi"].at(t - 11.0)
                    composed = v1._transition(tickets[2], tickets[3], old, new, t - 11.0, body,
                                               "shanghai", "hanoi", oi, ni, True)
                else:
                    actor, ai, _ = readers["hanoi"].at(t - 11.0)
                    composed = v1._static(tickets[3], actor, "hanoi", ai, True)
            proc.stdin.write(composed.tobytes())
    finally:
        proc.stdin.close()
        for reader in readers.values():
            reader.close()
    if proc.wait() != 0:
        raise RuntimeError(f"encode failed: {output}")


def stack(boundary: str, clips: list[Path], output: Path) -> None:
    inputs = [x for p in clips for x in ("-i", str(p))]
    labels = []
    for i, _ in enumerate(clips):
        labels.append(f"[{i}:v]drawtext=text='Shanghai start {OFFSETS[i]:.3f}s':x=18:y=18:fontsize=27:fontcolor=white:box=1:boxcolor=black@0.65[v{i}]")
    filt = ";".join(labels) + ";" + "".join(f"[v{i}]" for i in range(3)) + "hstack=inputs=3[out]"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", filt,
         "-map", "[out]", "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)])


def probe(path: Path) -> dict:
    raw = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries",
                          "stream=width,height,r_frame_rate,nb_read_frames,duration", "-show_entries",
                          "format=duration", "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return json.loads(raw.stdout)


def main() -> None:
    artifacts = {}
    for boundary in ("tokyo-shanghai", "shanghai-hanoi"):
        clips = []
        for offset in OFFSETS:
            path = HERE / f"audition-{boundary}-shanghai-{offset:.3f}.mp4"
            # Reuse completed bounded clips after a compositor-only failure.
            if not path.exists() or path.stat().st_size < 100_000:
                clip(boundary, offset, path)
            clips.append(path)
            artifacts[str(path)] = {"bytes": path.stat().st_size, "probe": probe(path)}
        comparison = HERE / f"audition-{boundary}-3col.mp4"
        stack(boundary, clips, comparison)
        artifacts[str(comparison)] = {"bytes": comparison.stat().st_size, "probe": probe(comparison)}
    meta = {"created_utc": datetime.now(timezone.utc).isoformat(), "factor": FACTOR,
            "duration_seconds": 1.5, "offsets": list(OFFSETS), "fixed": ["720x1280", "24fps",
            "card timing/geometry", "body mask and Hanoi matte", "Tokyo start 2.5", "Hanoi start 6.0"],
            "boundaries": {"tokyo-shanghai": "absolute output 8.25..9.75s", "shanghai-hanoi": "absolute output 10.25..11.75s"},
            "artifacts": artifacts,
            "note": "Silent visual audition only; no full 13s render or production overwrite."}
    (HERE / "audition-metadata.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print("wrote bounded Shanghai start-offset auditions")


if __name__ == "__main__":
    main()
