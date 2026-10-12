"""Render a bounded all-city T3 1.80x cut-local candidate.

Only person playback timing changes.  Intro, ticket timing/geometry, Hanoi
green matte, and audio are inherited from the locked v2 composition.  Every
outfit is sampled from a forward-only window in its existing 10-second take;
there is no looping, freezing, padding, or cross-city source-clock reset in a
window.
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
V2_PATH = ROOT / "production" / "ticket-travel" / "final-sequence-v2" / "render_final_sequence.py"
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
INTRO = PERF / "intro-casual.mp4"
SOURCES = {
    "seoul": PERF / "canonical-hanbok-10s.mp4",
    "tokyo": PERF / "tokyo-parasol-10s.mp4",
    "shanghai": PERF / "shanghai-fan-10s.mp4",
    "hanoi": PERF / "hanoi-hat-green-10s.mp4",
}
BASELINE = ROOT / "production" / "ticket-travel" / "final-sequence-v2" / "final-sequence-v2.mp4"
FFMPEG_DIR = Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin")
FFMPEG = str(FFMPEG_DIR / "ffmpeg.exe")
FFPROBE = str(FFMPEG_DIR / "ffprobe.exe")
FPS = 24
SIZE = (720, 1280)
FACTOR = 1.8
FRAME_COUNT = 312
TRANSITION_DURATION = 0.5
BRANCH_STARTS = {"seoul": 3.5, "tokyo": 6.5, "shanghai": 9.0, "hanoi": 11.0}
# Chosen from visible full-body/lower-body continuity in the existing takes.
# Exact foot-contact phase remains unmeasured across independent generations.
SOURCE_STARTS = {"seoul": 2.5, "tokyo": 2.5, "shanghai": 2.5, "hanoi": 6.0}


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v1 = load_module(V1_PATH, "t3_v1_renderer")
v2 = load_module(V2_PATH, "t3_v2_renderer")
# v2's explicit green-screen matte is the retained Hanoi matte for this cut.
v1._green_matte = v2._green_matte


class SourceReader:
    def __init__(self, path: Path, start: float, factor: float = FACTOR):
        self.path, self.start, self.factor = path, start, factor
        self.proc = subprocess.Popen(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
            stdout=subprocess.PIPE,
        )
        assert self.proc.stdout is not None
        self.stream = self.proc.stdout
        self.frame_bytes = SIZE[0] * SIZE[1] * 3
        self.index = -1
        self.current: np.ndarray | None = None

    def at(self, local_time: float) -> tuple[np.ndarray, int, float]:
        source_time = self.start + self.factor * local_time
        source_index = round(source_time * FPS)
        if source_index >= 240:
            raise RuntimeError(f"{self.path.name} source frame {source_index} exceeds 10s")
        while self.index < source_index:
            data = self.stream.read(self.frame_bytes)
            if len(data) != self.frame_bytes:
                raise RuntimeError(f"{self.path.name} ended before source frame {source_index}")
            self.current = np.frombuffer(data, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()
            self.index += 1
        assert self.current is not None
        return self.current, source_index, source_time

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
        self.stream.close()
        self.proc.wait()


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def probe(path: Path) -> dict:
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-count_frames", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    stream = next(s for s in data["streams"] if s.get("codec_type", "video") == "video")
    return {"width": stream.get("width"), "height": stream.get("height"),
            "r_frame_rate": stream.get("r_frame_rate"), "frames": stream.get("nb_read_frames"),
            "duration": data.get("format", {}).get("duration")}


def render_silent(path: Path) -> dict:
    tickets = [np.asarray(Image.open(p).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)) for p in v1.TICKETS]
    body = v1.v2._body_mask()
    readers = {name: SourceReader(src, SOURCE_STARTS[name]) for name, src in SOURCES.items()}
    intro_reader = SourceReader(INTRO, 0.0, 1.0)
    path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{SIZE[0]}x{SIZE[1]}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
         "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)],
        stdin=subprocess.PIPE,
    )
    assert proc.stdin is not None
    samples = []
    try:
        for frame_index in range(FRAME_COUNT):
            t = frame_index / FPS
            if t < 3.5:
                frame, _, _ = intro_reader.at(t)
                composed = frame
            elif t < 4.0:
                old, _, _ = intro_reader.at(t)
                new, ni, nt = readers["seoul"].at(t - 3.5)
                composed = v1._transition(old, tickets[0], old, new, t - 3.5, body,
                                           "intro", "seoul", frame_index, ni, True)
                samples.append({"time": round(t, 6), "old": "intro", "new": "seoul",
                                "new_source_frame": ni, "new_source_time": round(nt, 6)})
            else:
                branch = "seoul" if t < 6.5 else "tokyo" if t < 9.0 else "shanghai" if t < 11.0 else "hanoi"
                previous = {"tokyo": "seoul", "shanghai": "tokyo", "hanoi": "shanghai"}.get(branch)
                if previous and t < BRANCH_STARTS[branch] + TRANSITION_DURATION:
                    old, oi, ot = readers[previous].at(t - BRANCH_STARTS[previous])
                    new, ni, nt = readers[branch].at(t - BRANCH_STARTS[branch])
                    composed = v1._transition(tickets[0 if previous == "seoul" else 1 if previous == "tokyo" else 2],
                                               tickets[1 if branch == "tokyo" else 2 if branch == "shanghai" else 3],
                                               old, new, t - BRANCH_STARTS[branch], body, previous, branch, oi, ni, True)
                    samples.append({"time": round(t, 6), "old": previous, "new": branch,
                                    "old_source_frame": oi, "new_source_frame": ni,
                                    "old_source_time": round(ot, 6), "new_source_time": round(nt, 6)})
                else:
                    actor, ai, at = readers[branch].at(t - BRANCH_STARTS[branch])
                    card = {"seoul": 0, "tokyo": 1, "shanghai": 2, "hanoi": 3}[branch]
                    composed = v1._static(tickets[card], actor, branch, ai, True)
            proc.stdin.write(composed.tobytes())
    finally:
        proc.stdin.close()
        intro_reader.close()
        for reader in readers.values():
            reader.close()
    if proc.wait() != 0:
        raise RuntimeError("silent candidate encoding failed")
    return {"transition_samples": samples}


def mux_audio(silent: Path, output: Path) -> None:
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent), "-i", str(BASELINE),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-shortest",
         "-movflags", "+faststart", str(output)])
    silent.unlink(missing_ok=True)


def make_side_by_side(candidate: Path, output: Path) -> None:
    filt = ("[0:v]scale=720:1280,drawtext=text='T3 all-city 1.80x':x=18:y=18:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.65[left];"
            "[1:v]scale=720:1280,drawtext=text='existing v2':x=18:y=18:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.65[right];"
            "[left][right]hstack=inputs=2[out]")
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(candidate), "-i", str(BASELINE),
         "-filter_complex", filt, "-map", "[out]", "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)])


def make_contact(candidate: Path, baseline: Path, output: Path) -> None:
    times = (3.25, 3.5, 3.75, 4.0, 6.25, 6.5, 6.75, 7.0, 8.75, 9.0, 9.25, 9.5, 10.75, 11.0, 11.25, 11.5, 12.0, 12.75)
    cw, ch, label_h = 270, 480, 30
    sheet = Image.new("RGB", (cw * 2, (ch + label_h) * len(times)), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 19)
    except OSError:
        font = ImageFont.load_default()
    for row, ts in enumerate(times):
        for col, src in enumerate((candidate, baseline)):
            frame_path = HERE / f".contact-{row}-{col}.jpg"
            run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{ts:.6f}", "-i", str(src),
                 "-frames:v", "1", "-q:v", "3", str(frame_path)])
            frame = Image.open(frame_path).convert("RGB")
            frame.thumbnail((cw, ch), Image.Resampling.LANCZOS)
            x = col * cw + (cw - frame.width) // 2
            y = row * (ch + label_h) + label_h + (ch - frame.height) // 2
            sheet.paste(frame, (x, y))
            draw.text((col * cw + 7, row * (ch + label_h) + 6),
                      ("T3 1.80x" if col == 0 else "existing v2") + f"  t={ts:.2f}s", fill="white", font=font)
            frame_path.unlink(missing_ok=True)
    sheet.save(output, quality=94)


def make_source_scan(output: Path) -> None:
    """Record the coarse full-body/lower-body scan used to choose windows."""
    consumption = {"seoul": 6.3, "tokyo": 5.4, "shanghai": 4.5, "hanoi": 3.6}
    fw, fh, lw, lh = 240, 426, 240, 240
    row_h = 24 + fh + lh + 28
    sheet = Image.new("RGB", (fw * 3, row_h * 4), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for row, (name, src) in enumerate(SOURCES.items()):
        start = SOURCE_STARTS[name]
        times = (start, start + consumption[name] / 2.0, start + consumption[name])
        draw.text((4, row * row_h + 3), f"{name} source window; full frame above / lower-body crop below", fill="white", font=font)
        for col, ts in enumerate(times):
            frame_path = HERE / f".scan-{name}-{col}.jpg"
            run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{ts:.6f}", "-i", str(src),
                 "-frames:v", "1", "-q:v", "3", str(frame_path)])
            frame = Image.open(frame_path).convert("RGB")
            full = frame.resize((fw, fh), Image.Resampling.LANCZOS)
            lower = frame.crop((0, frame.height // 2, frame.width, frame.height)).resize((lw, lh), Image.Resampling.LANCZOS)
            x = col * fw
            y = row * row_h + 24
            sheet.paste(full, (x, y))
            sheet.paste(lower, (x, y + fh))
            draw.text((x + 4, y + fh + lh + 4), f"source {ts:.2f}s", fill="white", font=font)
            frame_path.unlink(missing_ok=True)
    sheet.save(output, quality=94)


def split_boundary_contacts(contact: Path) -> None:
    """Split the tall all-boundary sheet into readable per-boundary sheets."""
    row_h = 510  # make_contact: 480px image + 30px label
    groups = {
        "intro-seoul": (0, 3), "seoul-tokyo": (4, 7),
        "tokyo-shanghai": (8, 11), "shanghai-hanoi": (12, 14),
    }
    image = Image.open(contact).convert("RGB")
    metadata_path = HERE / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else None
    for name, (first, last) in groups.items():
        destination = HERE / f"t3-all-city-boundary-{name}.jpg"
        image.crop((0, first * row_h, image.width, (last + 1) * row_h)).save(destination, quality=94)
        if metadata is not None:
            metadata.setdefault("artifacts", {})[str(destination)] = {
                "sha256": sha256(destination), "bytes": destination.stat().st_size, "probe": None
            }
    if metadata is not None:
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def decode_check(path: Path) -> None:
    run([FFMPEG, "-v", "error", "-i", str(path), "-f", "null", "-"])


def main() -> None:
    for path in (*SOURCES.values(), INTRO, BASELINE, *v1.TICKETS):
        if not path.exists():
            raise FileNotFoundError(path)
    candidate = HERE / "t3-all-city-1.80x-13s.mp4"
    silent = HERE / ".t3-all-city-silent.mp4"
    half = HERE / "t3-all-city-1.80x-13s-half-speed.mp4"
    comparison = HERE / "t3-all-city-vs-existing-v2.mp4"
    contact = HERE / "t3-all-city-transition-contact.jpg"
    source_scan = HERE / "t3-all-city-source-window-scan.jpg"
    timing = render_silent(silent)
    mux_audio(silent, candidate)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(candidate), "-vf", "setpts=2*PTS",
         "-af", "atempo=0.5", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
         "-movflags", "+faststart", str(half)])
    make_side_by_side(candidate, comparison)
    make_contact(candidate, BASELINE, contact)
    make_source_scan(source_scan)
    for path in (candidate, half, comparison):
        decode_check(path)
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Provisional all-city T3 cut-local 1.80x person-only external retime",
        "status": "provisional; not T3 approval",
        "factor": FACTOR,
        "factor_definition": "source_time = chosen per-city source_start + 1.80 * local outfit output time",
        "output": {"width": 720, "height": 1280, "fps": FPS, "frames": FRAME_COUNT, "seconds": 13.0,
                   "audio": "copied from existing final-sequence-v2; original timing retained"},
        "timeline": {"intro": "0.0-3.5s", "seoul": "3.5-6.5s", "tokyo": "6.5-9.0s",
                     "shanghai": "9.0-11.0s", "hanoi": "11.0-13.0s", "transition_duration": 0.5},
        "source_windows": {
            name: {"path": str(path), "source_start_seconds": SOURCE_STARTS[name],
                   "nominal_consumption_seconds": {"seoul": 6.3, "tokyo": 5.4, "shanghai": 4.5, "hanoi": 3.6}[name],
                   "source_end_seconds": round(SOURCE_STARTS[name] + {"seoul": 6.3, "tokyo": 5.4, "shanghai": 4.5, "hanoi": 3.6}[name], 6),
                   "available_seconds": 10.0}
            for name, path in SOURCES.items()
        },
        "phase_matching": {
            "observed": "Windows were chosen for bounded coverage, continuous lower-body walking where visible, and retention of existing prop/acting portions; the included coarse scan is posthoc visual QA evidence.",
            "unmeasurable": "Exact left/right foot-contact phase across city boundaries is not certified: feet are partly occluded by garments/matte and these are independent generated takes. Same nominal frame/time does not imply identical motion.",
            "boundary_review": "Transition contact sheet is supplied for visual review; no boundary is marked PASS here."
        },
        "fixed": ["intro frames", "card timing and geometry", "ticket artwork", "Hanoi green matte/despill", "original v2 audio timing", "720x1280/24fps", "no loops/freezes/padding"],
        "artifacts": {}, "timing_samples": timing,
    }
    for path in (INTRO, *SOURCES.values(), BASELINE, candidate, half, comparison, contact, source_scan):
        metadata["artifacts"][str(path)] = {"sha256": sha256(path), "bytes": path.stat().st_size,
                                            "probe": probe(path) if path.suffix.lower() == ".mp4" else None}
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# T3 all-city 1.80x cut-local candidate\n\n"
        "Provisional 13-second 9:16 composition using all four existing 10-second outfit takes. Only person playback timing changes: each take is sampled at 1.80x from a bounded local source window. Intro, card timing/geometry, green Hanoi matte, and original v2 audio/card timings are retained. No loop, freeze, padding, or source extension is used.\n\n"
        "Source anchors (seconds) are Seoul 2.5, Tokyo 2.5, Shanghai 2.5, Hanoi 6.0. Transition-inclusive nominal source consumption is Seoul 6.3, Tokyo 5.4, Shanghai 4.5, Hanoi 3.6 seconds; all windows fit inside the 10-second takes. Anchors prioritize bounded coverage and retaining visible props/actions; the included coarse visual lower-body/prop scan is posthoc QA. Exact cross-take foot-contact phase is unmeasurable, so this candidate does not claim that same nominal frame/time means identical motion.\n\n"
        "- [13s candidate](t3-all-city-1.80x-13s.mp4)\n"
        "- [13s half-speed review](t3-all-city-1.80x-13s-half-speed.mp4)\n"
        "- [Full side-by-side with existing v2](t3-all-city-vs-existing-v2.mp4)\n"
        "- [Transition contact sheet](t3-all-city-transition-contact.jpg)\n"
        "- [Source-window full/lower-body scan](t3-all-city-source-window-scan.jpg)\n"
        "- [Metadata, hashes, mappings and timing samples](metadata.json)\n"
        "- [Render script](render_t3_all_city.py)\n\n"
        "Boundary status is provisional/unapproved. Review the contact sheet for lower-body continuity, card-edge reveal, face/prop stability and Hanoi matte at 3.5/6.5/9.0/11.0 seconds. Existing v2 remains the baseline and was not overwritten.\n",
        encoding="utf-8",
    )
    print(f"wrote {candidate}")


if __name__ == "__main__":
    main()
