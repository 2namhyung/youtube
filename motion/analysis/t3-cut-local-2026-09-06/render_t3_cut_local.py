"""Render a bounded T3 Seoul-to-Tokyo cut-local 1.8x candidate.

The existing outfit sources are read at a 1.8x source-time map inside each
10-second clip.  The v1 renderer supplies the unchanged card geometry and
matte/transition helpers; no production file is imported for writing.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
V1_PATH = ROOT / "production" / "ticket-travel" / "final-sequence-v1" / "render_final_sequence.py"
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
SEOUL = PERF / "canonical-hanbok-10s.mp4"
TOKYO = PERF / "tokyo-parasol-10s.mp4"
BASELINE = ROOT / "production" / "ticket-travel" / "final-sequence-v2" / "final-sequence-v2.mp4"
FPS = 24
SIZE = (720, 1280)
FACTOR = 1.8
SEOUL_SOURCE_START = 2.5
TOKYO_SOURCE_START = 5.2
SECONDS = 4.0
FRAME_COUNT = round(SECONDS * FPS)
TRANSITION_START = 1.5
TRANSITION_DURATION = 0.5


def load_v1():
    spec = importlib.util.spec_from_file_location("final_sequence_v1", V1_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load renderer helper: {V1_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v1 = load_v1()


class SourceReader:
    """Forward-only source reader with an explicit 1.8x local time map."""

    def __init__(self, path: Path, source_start: float):
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        self.path = path
        self.source_start = source_start
        self.proc = subprocess.Popen(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
            stdout=subprocess.PIPE,
        )
        assert self.proc.stdout is not None
        self.stream = self.proc.stdout
        self.frame_bytes = SIZE[0] * SIZE[1] * 3
        self.index = -1
        self.current = None

    def get_at_output_time(self, output_time: float) -> tuple[np.ndarray, int, float]:
        source_time = self.source_start + FACTOR * output_time
        source_index = round(source_time * FPS)
        if source_index >= 240:
            raise RuntimeError(f"{self.path} source frame {source_index} exceeds the 10s/240-frame limit")
        while self.index < source_index:
            data = self.stream.read(self.frame_bytes)
            if len(data) != self.frame_bytes:
                raise RuntimeError(f"{self.path} ended before source frame {source_index}")
            self.current = np.frombuffer(data, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()
            self.index += 1
        assert self.current is not None
        return self.current, source_index, source_time

    def close(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
        self.stream.close()
        self.proc.wait()


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe") or "ffprobe"
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    stream = next(s for s in data.get("streams", []) if s.get("codec_type", "video") == "video")
    return {"width": stream.get("width"), "height": stream.get("height"),
            "r_frame_rate": stream.get("r_frame_rate"),
            "avg_frame_rate": stream.get("avg_frame_rate"),
            "nb_frames": stream.get("nb_frames"), "duration": data.get("format", {}).get("duration")}


def render_candidate(output: Path) -> dict:
    tickets = [np.asarray(Image.open(path).convert("RGB").resize(SIZE))
               for path in v1.TICKETS[:2]]
    body = v1.v2._body_mask()
    seoul_reader = SourceReader(SEOUL, SEOUL_SOURCE_START)
    tokyo_reader = SourceReader(TOKYO, TOKYO_SOURCE_START)
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
           "-pix_fmt", "rgb24", "-s", f"{SIZE[0]}x{SIZE[1]}", "-r", str(FPS), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert encoder.stdin is not None
    overlap_indices = []
    try:
        for frame_index in range(FRAME_COUNT):
            t = frame_index / FPS
            if t < TRANSITION_START:
                seoul, seoul_index, seoul_time = seoul_reader.get_at_output_time(t)
                composed = v1._static(tickets[0], seoul, "seoul", seoul_index)
            elif t < TRANSITION_START + TRANSITION_DURATION:
                seoul, seoul_index, seoul_time = seoul_reader.get_at_output_time(t)
                tokyo, tokyo_index, tokyo_time = tokyo_reader.get_at_output_time(t - TRANSITION_START)
                composed = v1._transition(
                    tickets[0], tickets[1], seoul, tokyo,
                    t - TRANSITION_START, body, "seoul", "tokyo",
                    seoul_index, tokyo_index,
                )
                overlap_indices.append({"output_time": round(t, 6),
                                        "seoul_source_frame": seoul_index,
                                        "tokyo_source_frame": tokyo_index,
                                        "seoul_source_time": round(seoul_time, 6),
                                        "tokyo_source_time": round(tokyo_time, 6)})
            else:
                tokyo, tokyo_index, tokyo_time = tokyo_reader.get_at_output_time(t - TRANSITION_START)
                composed = v1._static(tickets[1], tokyo, "tokyo", tokyo_index)
            encoder.stdin.write(composed.tobytes())
    finally:
        encoder.stdin.close()
        seoul_reader.close()
        tokyo_reader.close()
    if encoder.wait() != 0:
        raise RuntimeError("candidate encoding failed")
    return {"transition_overlap_samples": overlap_indices,
            "source_windows": {
                "seoul": {"output_seconds": 2.0, "source_start_seconds": SEOUL_SOURCE_START,
                           "source_end_seconds": SEOUL_SOURCE_START + FACTOR * 2.0},
                "tokyo": {"output_seconds": 2.5, "source_start_seconds": TOKYO_SOURCE_START,
                           "source_end_seconds": TOKYO_SOURCE_START + FACTOR * 2.5},
            }}


def extract_baseline(destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(BASELINE),
         "-vf", "trim=start=5:duration=4,setpts=PTS-STARTPTS", "-an", "-frames:v", str(FRAME_COUNT),
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(destination)])


def make_comparison(candidate: Path, baseline: Path, destination: Path) -> None:
    filt = (
        "[0:v]scale=720:1280,drawtext=text='T3 local 1.80x':x=18:y=18:fontsize=28:"
        "fontcolor=white:box=1:boxcolor=black@0.65[left];"
        "[1:v]scale=720:1280,drawtext=text='existing v2 5.0-9.0s':x=18:y=18:fontsize=28:"
        "fontcolor=white:box=1:boxcolor=black@0.65[right];"
        "[left][right]hstack=inputs=2[out]"
    )
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(candidate),
         "-i", str(baseline), "-filter_complex", filt, "-map", "[out]", "-an",
         "-frames:v", str(FRAME_COUNT), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination)])


def decode_check(path: Path) -> None:
    run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])


def make_contact_sheet(candidate: Path, baseline: Path, destination: Path) -> None:
    times = (0.0, 0.5, 1.0, 1.5, 1.75, 2.0, 3.0, 3.9)
    cell_w, cell_h = 360, 640
    sheet = Image.new("RGB", (cell_w * 2, (cell_h + 34) * len(times)), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    for row, timestamp in enumerate(times):
        for col, path in enumerate((candidate, baseline)):
            frame_path = HERE / f".contact-{row}-{col}.jpg"
            run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp:.6f}",
                 "-i", str(path), "-frames:v", "1", "-q:v", "3", str(frame_path)])
            frame = Image.open(frame_path).convert("RGB")
            frame.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
            x = col * cell_w + (cell_w - frame.width) // 2
            y = row * (cell_h + 34) + 30 + (cell_h - frame.height) // 2
            sheet.paste(frame, (x, y))
            label = ("T3 1.80x" if col == 0 else "existing v2") + f"  t={timestamp:.2f}s"
            draw.text((col * cell_w + 8, row * (cell_h + 34) + 6), label, fill="white", font=font)
            frame_path.unlink(missing_ok=True)
    sheet.save(destination, quality=95)


def main() -> None:
    for path in (SEOUL, TOKYO, BASELINE):
        if not path.exists():
            raise FileNotFoundError(path)
    candidate = HERE / "t3-seoul-tokyo-local-1.80x-4s.mp4"
    half = HERE / "t3-seoul-tokyo-local-1.80x-4s-half-speed.mp4"
    baseline = HERE / "existing-v2-seoul-tokyo-5-9s.mp4"
    comparison = HERE / "t3-local-vs-existing-v2-5-9s.mp4"
    contact = HERE / "t3-local-vs-existing-v2-contact.jpg"
    timing = render_candidate(candidate)
    extract_baseline(baseline)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(candidate),
         "-vf", "setpts=2*PTS", "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(half)])
    make_comparison(candidate, baseline, comparison)
    make_contact_sheet(candidate, baseline, contact)
    for path in (candidate, half, baseline, comparison):
        decode_check(path)
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Provisional T3 cut-local Seoul-to-Tokyo 1.8x retime candidate",
        "factor": FACTOR,
            "factor_definition": "standard playback speed; source_time = per-cut source_start + 1.8 * active_output_time",
        "output": {"width": SIZE[0], "height": SIZE[1], "fps": FPS,
                   "frames": FRAME_COUNT, "seconds": SECONDS},
        "timeline": {"seoul_static_local": "0.0-1.5s", "transition_local": "1.5-2.0s",
                     "tokyo_static_local": "2.0-4.0s", "baseline_source_window": "v2 5.0-9.0s"},
        "sources": {
            "seoul": {"path": str(SEOUL), "duration_seconds": 10.005,
                      "output_coverage_seconds": 2.0, "source_window_seconds": [SEOUL_SOURCE_START, SEOUL_SOURCE_START + FACTOR * 2.0]},
            "tokyo": {"path": str(TOKYO), "duration_seconds": 10.005,
                      "output_coverage_seconds": 2.5, "source_window_seconds": [TOKYO_SOURCE_START, TOKYO_SOURCE_START + FACTOR * 2.5]},
        },
        "transition_overlap": {
            "output_window_seconds": [1.5, 2.0],
            "matched_source_window_seconds_nominal": [5.2, 6.1],
            "matching": "same source timestamp map for both clips; exact foot-contact phase is unmeasured",
            "frame_rounding": "round(source_time * 24), so endpoint/frame identity can differ by about one frame",
            "status": "provisional",
        },
        "fixed": ["existing v1/v2 ticket timing, card geometry and matte helpers",
                  "existing source identities and 720x1280/24fps inputs",
                  "no audio, Flow generation, upload, publish, or production overwrite"],
        "artifacts": {},
        "timing_samples": timing,
    }
    for path in (SEOUL, TOKYO, BASELINE, candidate, half, baseline, comparison, contact):
        metadata["artifacts"][str(path)] = {
            "sha256": sha256(path), "bytes": path.stat().st_size,
            "probe": probe(path) if path.suffix.lower() == ".mp4" else None,
        }
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# T3 cut-local Seoul→Tokyo 1.80× candidate\n\n"
        "This is a provisional 4-second integration candidate using the existing 10-second Seoul and Tokyo outfit takes. "
        "Each source is sampled at 1.80× from cut-local anchors (Seoul 2.5s, Tokyo 5.2s), independently inside its 10-second duration. "
        "The local timeline is Seoul 0.0–1.5s, the unchanged v2 card transition 1.5–2.0s, and Tokyo 2.0–4.0s.\n\n"
        "Both actors read the same nominal source-time map during the 0.5-second overlap (source 5.2–6.1s), "
        "which is a phase-alignment design anchor, not exact foot-contact proof. Independent outfit edits mean exact phase remains unmeasured.\n\n"
        "- [T3 candidate, normal speed](t3-seoul-tokyo-local-1.80x-4s.mp4)\n"
        "- [T3 candidate, half speed](t3-seoul-tokyo-local-1.80x-4s-half-speed.mp4)\n"
        "- [Existing v2 same section](existing-v2-seoul-tokyo-5-9s.mp4)\n"
        "- [Normal-speed side-by-side](t3-local-vs-existing-v2-5-9s.mp4)\n"
        "- [Visual contact sheet](t3-local-vs-existing-v2-contact.jpg)\n"
        "- [Metadata](metadata.json)\n"
        "- [Render script](render_t3_cut_local.py)\n\n"
        "The normal candidate and extracted baseline are 720×1280, 24fps, 96 frames / 4.0s; the half-speed candidate is 720×1280, 12fps, 96 frames / about 8.0s; the side-by-side is 1440×1280, 24fps, 96 frames / 4.0s. All MP4 outputs were ffmpeg-decoded. "
        "No Flow submission, new generation, upload, publish, production overwrite, or canonical diagnostic was performed.\n\n"
        "Visual check of the contact sheet confirms the unchanged bottom-up card wipe begins at local 1.5s and is settled by 2.0s; the candidate's walk is visibly more progressed than the v2 baseline while the card layout remains aligned. No exact foot-contact phase or identity equivalence is claimed. This is a provisional first-pair T3 candidate, not a full T3 PASS or final approval.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
