"""Create a bounded whole-body walking-tempo comparison.

This probe deliberately operates on the existing Tokyo person component only.
It does not modify the 13-second compositor, card artwork, camera, or audio.
Each candidate starts at the same source time and consumes the source at the
requested standard playback factor, then is exported as a two-second,
720x1280/24fps, silent visual-only clip for like-for-like review.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / "production" / "ticket-travel" / "performance-v2" / "tokyo-parasol-10s.mp4"
FPS = 24
WIDTH, HEIGHT = 720, 1280
# v2's Tokyo branch begins around source 3.0s (final t=6.5s). Use a later,
# stable walking interval that is actually present in the v2 timeline.
SOURCE_START = 3.5
OUTPUT_SECONDS = 2.0
FACTORS = (1.00, 1.10, 1.20)
FRAME_COUNT = round(OUTPUT_SECONDS * FPS)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def probe(path: Path) -> dict[str, str]:
    ffprobe = shutil.which("ffprobe") or "ffprobe"
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    stream = next(x for x in data.get("streams", []) if x.get("codec_type", "video") == "video")
    return {
        "width": str(stream.get("width")),
        "height": str(stream.get("height")),
        "r_frame_rate": str(stream.get("r_frame_rate")),
        "avg_frame_rate": str(stream.get("avg_frame_rate")),
        "nb_frames": str(stream.get("nb_frames")),
        "duration": str(data.get("format", {}).get("duration")),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def render_candidate(factor: float, output: Path) -> None:
    source_window = OUTPUT_SECONDS * factor
    # trim makes the consumed source window explicit; setpts maps it to the
    # common two-second review timeline. -frames:v fixes the CFR frame count.
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", f"{SOURCE_START:.6f}", "-i", str(SOURCE),
        "-vf", f"trim=start=0:duration={source_window:.6f},setpts=PTS/{factor:.8f}",
        "-an", "-r", str(FPS), "-frames:v", str(FRAME_COUNT),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ])


def make_side_by_side(outputs: list[tuple[float, Path]], destination: Path) -> None:
    inputs = [item for pair in outputs for item in ("-i", str(pair[1]))]
    labels = [f"[{index}:v]drawtext=text='{factor:.2f}x {'ORIGINAL' if factor == 1.0 else 'RETIME'}':x=22:y=24:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.78:boxborderw=10[v{index}]" for index, (factor, _) in enumerate(outputs)]
    joined = ";".join(labels) + ";" + "".join(f"[v{i}]" for i in range(len(outputs))) + f"hstack=inputs={len(outputs)}[outv]"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
        "-filter_complex", joined, "-map", "[outv]", "-an",
        "-r", str(FPS), "-frames:v", str(FRAME_COUNT),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
    ])


def extract_contact_frames(path: Path, prefix: str) -> list[Path]:
    frame_dir = HERE / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    # Five equal review instants, including the final available frame.
    pattern = frame_dir / f"{prefix}-%02d.png"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vf", "select='eq(n,0)+eq(n,12)+eq(n,24)+eq(n,36)+eq(n,47)'",
        "-vsync", "0", str(pattern),
    ])
    return sorted(frame_dir.glob(f"{prefix}-*.png"))


def make_contact_sheet(outputs: list[tuple[float, Path]], destination: Path) -> None:
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
    try:
        small_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 22)
    except OSError:
        small_font = font
    times = (0.0, 0.5, 1.0, 1.5, 1.9583)
    cell_w, cell_h = 300, 560
    sheet = Image.new("RGB", (cell_w * len(outputs), (cell_h + 64) * len(times)), "#202020")
    draw = ImageDraw.Draw(sheet)
    for row, time in enumerate(times):
        frame_no = min(FRAME_COUNT - 1, round(time * FPS))
        for col, (factor, output) in enumerate(outputs):
            frames = extract_contact_frames(output, f"f{factor:.2f}")
            frame = Image.open(frames[min(row, len(frames) - 1)]).convert("RGB")
            frame.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
            x = col * cell_w + (cell_w - frame.width) // 2
            y = row * (cell_h + 64) + 48 + (cell_h - frame.height) // 2
            sheet.paste(frame, (x, y))
            label = f"{factor:.2f}x  t={time:.3f}s  f={frame_no}"
            draw.text((col * cell_w + 10, row * (cell_h + 64) + 12), label, fill="white", font=small_font)
    sheet.save(destination, quality=95)


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    source_meta = probe(SOURCE)
    if (source_meta["width"], source_meta["height"], source_meta["r_frame_rate"]) != (str(WIDTH), str(HEIGHT), "24/1"):
        raise RuntimeError(f"unexpected source metadata: {source_meta}")
    outputs: list[tuple[float, Path]] = []
    for factor in FACTORS:
        output = HERE / f"tokyo-person-{factor:.2f}x-2s.mp4"
        render_candidate(factor, output)
        outputs.append((factor, output))
    side = HERE / "tokyo-person-tempo-comparison-side-by-side.mp4"
    make_side_by_side(outputs, side)
    contact = HERE / "tokyo-person-tempo-contact-sheet.jpg"
    make_contact_sheet(outputs, contact)

    artifacts = {}
    for path in [SOURCE, *[path for _, path in outputs], side, contact]:
        artifacts[str(path.relative_to(HERE.parent.parent)) if path != SOURCE else str(path)] = {
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "probe": probe(path) if path.suffix.lower() == ".mp4" else None,
        }
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "T1 whole-body person-only tempo probe; not a reference speed measurement",
        "source": str(SOURCE),
        "source_sha256": sha256(SOURCE),
        "source_start_seconds": SOURCE_START,
        "output_seconds": OUTPUT_SECONDS,
        "fps": FPS,
        "frame_count": FRAME_COUNT,
        "factor_definition": "standard playback speed; source_time = source_start + factor * output_time",
        "candidates": [
            {"factor": factor, "source_window_seconds": OUTPUT_SECONDS * factor, "output_window_seconds": OUTPUT_SECONDS}
            for factor in FACTORS
        ],
        "fixed": [
            "card not included in this person-only probe; production card remains unchanged",
            "original source camera and background; no spatial transform",
            "audio omitted for visual isolation",
            "source start",
        ],
        "known_limit": "whole-body retime also changes face, upper body, arms, props and cloth; stride amplitude is not increased",
        "artifacts": artifacts,
    }
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
