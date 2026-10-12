"""Bounded A/B test of an existing-vs-common-source-time gait mapping.

The two 10-second Flow edits were both made directly from the canonical hanbok
history source (see performance-v2/long-variant-prompts.md).  A retains the
production mapping at the Seoul->Tokyo boundary: Tokyo restarts at source 2.5s.
B keeps the incoming Tokyo edit on the outgoing Seoul source clock and starts it
at source 7.9s, the source time reached by Seoul at the card boundary.

This is a 1.5-second silent diagnostic only.  It preserves the existing ticket
renderer and transition geometry; it does not alter production outputs.
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
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
V1_PATH = ROOT / "production" / "ticket-travel" / "final-sequence-v1" / "render_final_sequence.py"
SEOUL = PERF / "canonical-hanbok-10s.mp4"
TOKYO = PERF / "tokyo-parasol-10s.mp4"
FPS = 24
SIZE = (720, 1280)
FACTOR = 1.8
GLOBAL_START = 6.0
DURATION = 1.5
FRAMES = round(FPS * DURATION)
CARD_BOUNDARY = 6.5
SEOUL_BRANCH = 3.5
TOKYO_BRANCH = 6.5
SEOUL_START = 2.5
TOKYO_A_START = 2.5
TOKYO_B_START = 7.9
FFMPEG_DIR = Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin")
FFMPEG = str(FFMPEG_DIR / "ffmpeg.exe")
FFPROBE = str(FFMPEG_DIR / "ffprobe.exe")


def load_v1():
    spec = importlib.util.spec_from_file_location("ticket_v1_ab", V1_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(V1_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v1 = load_v1()


class Reader:
    def __init__(self, path: Path):
        self.proc = subprocess.Popen(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
            stdout=subprocess.PIPE,
        )
        assert self.proc.stdout is not None
        self.stream = self.proc.stdout
        self.bytes = SIZE[0] * SIZE[1] * 3
        self.index = -1
        self.frame = None

    def at(self, source_time: float) -> tuple[np.ndarray, int]:
        index = round(source_time * FPS)
        if index >= 240:
            raise RuntimeError(f"source frame {index} exceeds 240")
        while self.index < index:
            data = self.stream.read(self.bytes)
            if len(data) != self.bytes:
                raise RuntimeError(f"source ended before frame {index}")
            self.frame = np.frombuffer(data, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()
            self.index += 1
        assert self.frame is not None
        return self.frame, index

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
        self.stream.close()
        self.proc.wait()


def encode(frames: list[np.ndarray], path: Path) -> None:
    height, width = frames[0].shape[:2]
    proc = subprocess.Popen(
        [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "-",
         "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)],
        stdin=subprocess.PIPE,
    )
    assert proc.stdin is not None
    for frame in frames:
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"encode failed: {path}")


def render_variant(tokyo_start: float) -> tuple[list[np.ndarray], list[dict]]:
    tickets = [np.asarray(Image.open(p).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS))
               for p in v1.TICKETS[:2]]
    body = v1.v2._body_mask()
    seoul = Reader(SEOUL)
    tokyo = Reader(TOKYO)
    frames, mapping = [], []
    try:
        for i in range(FRAMES):
            global_t = GLOBAL_START + i / FPS
            if global_t < CARD_BOUNDARY:
                old, old_i = seoul.at(SEOUL_START + FACTOR * (global_t - SEOUL_BRANCH))
                out = v1._static(tickets[0], old, "seoul", old_i)
                mapping.append({"frame": i, "global_time": round(global_t, 6),
                                "old_source_frame": old_i,
                                "old_source_time": round(SEOUL_START + FACTOR * (global_t - SEOUL_BRANCH), 6)})
            elif global_t < CARD_BOUNDARY + 0.5:
                old, old_i = seoul.at(SEOUL_START + FACTOR * (global_t - SEOUL_BRANCH))
                new, new_i = tokyo.at(tokyo_start + FACTOR * (global_t - TOKYO_BRANCH))
                out = v1._transition(tickets[0], tickets[1], old, new,
                                     global_t - CARD_BOUNDARY, body, "seoul", "tokyo",
                                     old_i, new_i)
                mapping.append({"frame": i, "global_time": round(global_t, 6),
                                "old_source_frame": old_i,
                                "old_source_time": round(SEOUL_START + FACTOR * (global_t - SEOUL_BRANCH), 6),
                                "new_source_frame": new_i,
                                "new_source_time": round(tokyo_start + FACTOR * (global_t - TOKYO_BRANCH), 6)})
            else:
                new, new_i = tokyo.at(tokyo_start + FACTOR * (global_t - TOKYO_BRANCH))
                out = v1._static(tickets[1], new, "tokyo", new_i)
                mapping.append({"frame": i, "global_time": round(global_t, 6),
                                "new_source_frame": new_i,
                                "new_source_time": round(tokyo_start + FACTOR * (global_t - TOKYO_BRANCH), 6)})
            frames.append(out)
    finally:
        seoul.close()
        tokyo.close()
    return frames, mapping


def font(size: int):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def make_side_by_side(a: list[np.ndarray], b: list[np.ndarray], path: Path) -> None:
    frames = [np.hstack((x, y)) for x, y in zip(a, b)]
    # Overlay labels after stacking so the comparison is self-identifying.
    for i, frame in enumerate(frames):
        image = Image.fromarray(frame)
        draw = ImageDraw.Draw(image)
        draw.rectangle((10, 10, 365, 50), fill=(0, 0, 0, 180))
        draw.rectangle((730, 10, 1085, 50), fill=(0, 0, 0, 180))
        draw.text((18, 17), "A existing: Tokyo source 2.5s", fill="white", font=font(22))
        draw.text((738, 17), "B same clock: Tokyo source 7.9s", fill="white", font=font(22))
        frames[i] = np.asarray(image)
    encode(frames, path)


def extract_sheet(frames: list[np.ndarray], path: Path, title: str, foot: bool = False) -> None:
    # Dense sheet intentionally shows the 24fps frames around the card edge.
    cols, cell_w, cell_h, label_h = (6, 240, 426, 28) if not foot else (6, 300, 180, 28)
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * (cell_h + label_h) + 36), "#242424")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), title, fill="white", font=font(20))
    for i, frame in enumerate(frames):
        image = Image.fromarray(frame)
        if foot:
            image = image.crop((120, 900, 600, 1180))
        image.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
        col, row = i % cols, i // cols
        x = col * cell_w + (cell_w - image.width) // 2
        y = 36 + row * (cell_h + label_h) + (cell_h - image.height) // 2
        sheet.paste(image, (x, y))
        draw.text((col * cell_w + 5, 36 + row * (cell_h + label_h) + cell_h + 4),
                  f"f{i:02d}  g{GLOBAL_START + i / FPS:.3f}s", fill="white", font=font(14))
    sheet.save(path, quality=95, subsampling=0)


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def probe(path: Path) -> dict:
    result = subprocess.run([FFPROBE, "-v", "error", "-count_frames", "-show_entries",
                             "stream=width,height,r_frame_rate,nb_read_frames,duration",
                             "-show_entries", "format=duration", "-of", "json", str(path)],
                            capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    stream = next(s for s in data["streams"] if s.get("codec_type", "video") == "video")
    return {"width": stream.get("width"), "height": stream.get("height"),
            "fps": stream.get("r_frame_rate"), "frames": stream.get("nb_read_frames"),
            "duration": data.get("format", {}).get("duration")}


def decode(path: Path) -> None:
    subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "null", "-"], check=True)


def main() -> None:
    for p in (SEOUL, TOKYO):
        if not p.exists():
            raise FileNotFoundError(p)
    a, map_a = render_variant(TOKYO_A_START)
    b, map_b = render_variant(TOKYO_B_START)
    out_a = HERE / "A-existing-tokyo-restart-1.5s.mp4"
    out_b = HERE / "B-common-source-clock-1.5s.mp4"
    side = HERE / "AB-same-transition-side-by-side-1.5s.mp4"
    encode(a, out_a)
    encode(b, out_b)
    make_side_by_side(a, b, side)
    extract_sheet(a, HERE / "A-foot-transition-dense.jpg", "A — existing mapping; lower-body frame sequence", True)
    extract_sheet(b, HERE / "B-foot-transition-dense.jpg", "B — same source-time mapping; lower-body frame sequence", True)
    # Raw source contact sheets make the time mapping auditable without trusting the composite.
    raw = []
    for name, start in (("Seoul outgoing", SEOUL_START + FACTOR * (CARD_BOUNDARY - SEOUL_BRANCH)),
                        ("Tokyo A", TOKYO_A_START), ("Tokyo B", TOKYO_B_START)):
        reader = Reader(SEOUL if name.startswith("Seoul") else TOKYO)
        try:
            sample = []
            for j in range(12):
                ts = start + j * 0.075 * FACTOR
                frame, idx = reader.at(ts)
                crop = Image.fromarray(frame).crop((120, 900, 600, 1180)).resize((240, 140), Image.Resampling.LANCZOS)
                sample.append((name, ts, idx, crop))
            raw.extend(sample)
        finally:
            reader.close()
    cols, cw, ch = 6, 240, 170
    sheet = Image.new("RGB", (cols * cw, ((len(raw) + cols - 1) // cols) * ch + 32), "#242424")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 8), "Raw source lower-body samples — outgoing Seoul / A Tokyo / B Tokyo", fill="white", font=font(18))
    for i, (name, ts, idx, crop) in enumerate(raw):
        x, y = (i % cols) * cw, 32 + (i // cols) * ch
        sheet.paste(crop, (x, y))
        draw.text((x + 4, y + 143), f"{name} {ts:.3f}s / f{idx}", fill="white", font=font(12))
    raw_path = HERE / "raw-source-time-lower-body-contact.jpg"
    sheet.save(raw_path, quality=95, subsampling=0)
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "A/B test of production mapping vs same-source-time incoming edit",
        "provenance": {
            "source_note": "performance-v2/long-variant-prompts.md: Seoul and Tokyo each directly edit the original hanbok history source; neither is derived from the other",
            "seoul": str(SEOUL), "tokyo": str(TOKYO),
        },
        "timeline": {"global_start": GLOBAL_START, "duration": DURATION,
                      "card_boundary": CARD_BOUNDARY, "card_transition_seconds": 0.5,
                      "factor": FACTOR},
        "A_existing_production_mapping": {
            "seoul_start": SEOUL_START, "tokyo_start": TOKYO_A_START,
            "boundary": {"seoul_source_time": 7.9, "tokyo_source_time": 2.5},
            "description": "current all-city mapping restarts incoming Tokyo at source 2.5s",
            "frames": map_a,
        },
        "B_same_source_time_mapping": {
            "seoul_start": SEOUL_START, "tokyo_start": TOKYO_B_START,
            "boundary": {"seoul_source_time": 7.9, "tokyo_source_time": 7.9},
            "description": "incoming Tokyo starts at the source time reached by outgoing Seoul",
            "frames": map_b,
        },
        "limitations": [
            "The two Flow edits are independent generated renders; same nominal source timestamp is a design alignment, not proof of pixel-identical gait.",
            "Frame sheets show visible lower-body/foot continuity; no anatomical keypoint tracker is claimed.",
            "B consumes Tokyo source 7.9–9.7s and is a 1.5s diagnostic, not a full-sequence replacement.",
        ],
        "artifacts": {},
    }
    for p in (out_a, out_b, side, HERE / "A-foot-transition-dense.jpg", HERE / "B-foot-transition-dense.jpg", raw_path):
        metadata["artifacts"][p.name] = {"sha256": sha(p), "bytes": p.stat().st_size,
                                          "probe": probe(p) if p.suffix == ".mp4" else None}
    for p in (out_a, out_b, side):
        decode(p)
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# Same-source-time A/B gait test\n\n"
        "This bounded 1.5-second Seoul→Tokyo test compares the existing production source mapping (A) with an incoming Tokyo edit kept on the outgoing Seoul source clock (B). Both 10-second outfit edits were directly made from the original hanbok history source, as recorded in `production/ticket-travel/performance-v2/long-variant-prompts.md`.\n\n"
        "A reaches Seoul source 7.9s at the 6.5s card boundary but restarts Tokyo at source 2.5s. B starts Tokyo at source 7.9s, preserving the nominal source time across the boundary. The same 0.5s existing card transition, 1.80× sampling, fixed camera and ticket artwork are used in both.\n\n"
        "- [A existing mapping](A-existing-tokyo-restart-1.5s.mp4)\n"
        "- [B same-source-time mapping](B-common-source-clock-1.5s.mp4)\n"
        "- [A/B side-by-side](AB-same-transition-side-by-side-1.5s.mp4)\n"
        "- [A dense foot frames](A-foot-transition-dense.jpg)\n"
        "- [B dense foot frames](B-foot-transition-dense.jpg)\n"
        "- [Raw source-time lower-body samples](raw-source-time-lower-body-contact.jpg)\n"
        "- [Exact frame mapping and probes](metadata.json)\n\n"
        "Interpretation must be based on the frame sheets and playback. The B mapping is a diagnostic hypothesis: because the Flow edits are independent generations, it cannot by itself certify exact foot-contact identity.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
