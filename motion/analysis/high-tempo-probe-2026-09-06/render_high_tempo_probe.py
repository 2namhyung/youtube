"""Render a bounded high-tempo person-only comparison for the existing v2 take.

The source is decoded from its beginning and trimmed by timestamps so the probe
does not inherit inaccurate input seeking. No Flow generation, interpolation,
matte, card, audio, or production-file changes are involved.
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
ROOT = HERE.parents[1]
SOURCE = ROOT / "production" / "ticket-travel" / "performance-v2" / "tokyo-parasol-10s.mp4"
REFERENCE = ROOT / "references" / "taoagou" / "nonfinger" / "ticket_travel_7648553013002489109.mp4"
FPS = 24
WIDTH, HEIGHT = 720, 1280
SOURCE_START = 3.5
OUTPUT_SECONDS = 2.0
FACTORS = (1.50, 1.80, 2.00)
FRAME_COUNT = round(OUTPUT_SECONDS * FPS)
REFERENCE_START = 4.95
REFERENCE_SECONDS = 1.40
COMPARE_FPS = 120
COMPARE_W, COMPARE_H = 540, 1080


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
    # Decode from the beginning; trim selects the exact source-time window.
    vf = (
        f"trim=start={SOURCE_START:.6f}:duration={source_window:.6f},"
        f"setpts=PTS-STARTPTS,setpts=PTS/{factor:.8f}"
    )
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(SOURCE),
        "-vf", vf, "-an", "-r", str(FPS), "-frames:v", str(FRAME_COUNT),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ])


def make_comparison(outputs: list[tuple[float, Path]], destination: Path) -> None:
    inputs = ["-i", str(REFERENCE)]
    inputs.extend(item for _, path in outputs for item in ("-i", str(path)))
    labels = []
    names = ["REFERENCE Bangkok 4.95-6.35s"] + [f"T1 {factor:.2f}x" for factor, _ in outputs]
    trims = [
        f"trim=start={REFERENCE_START:.6f}:duration={REFERENCE_SECONDS:.6f}"
    ] + [f"trim=duration={REFERENCE_SECONDS:.6f}" for _ in outputs]
    for i, (name, trim) in enumerate(zip(names, trims)):
        text = name.replace("'", "\\'")
        labels.append(
            f"[{i}:v]{trim},setpts=PTS-STARTPTS,"
            f"scale={COMPARE_W}:{COMPARE_H}:force_original_aspect_ratio=decrease,"
            f"pad={COMPARE_W}:{COMPARE_H}:(ow-iw)/2:(oh-ih)/2:color=white,"
            f"drawtext=text='{text}':x=12:y=18:fontsize=22:fontcolor=black:"
            f"box=1:boxcolor=white@0.78[v{i}]"
        )
    joined = ";".join(labels)
    joined += ";" + ";".join(f"[v{i}]fps={COMPARE_FPS}[r{i}]" for i in range(4))
    joined += ";" + "".join(f"[r{i}]" for i in range(4)) + "hstack=inputs=4[outv]"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
        "-filter_complex", joined, "-map", "[outv]", "-an",
        "-frames:v", str(round(REFERENCE_SECONDS * COMPARE_FPS)), "-r", str(COMPARE_FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
    ])


def extract_frame(path: Path, timestamp: float, destination: Path) -> None:
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vf", f"trim=start={timestamp:.6f}:duration=0.001,select=eq(n\\,0)",
        "-frames:v", "1", "-q:v", "2", str(destination),
    ])


def make_contact_sheet(outputs: list[tuple[float, Path]], destination: Path) -> None:
    frame_dir = HERE / "contact-frames"
    frame_dir.mkdir(exist_ok=True)
    times = (0.0, 0.20, 0.40, 0.60, 0.80, 1.00, 1.20, 1.35)
    sources = [("REFERENCE", REFERENCE, REFERENCE_START)] + [
        (f"{factor:.2f}x", path, 0.0) for factor, path in outputs
    ]
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    cell_w, cell_h = 300, 560
    sheet = Image.new("RGB", (cell_w * 4, (cell_h + 52) * len(times)), "#202020")
    draw = ImageDraw.Draw(sheet)
    for row, t in enumerate(times):
        for col, (label, path, offset) in enumerate(sources):
            frame_path = frame_dir / f"{col}-{row}.jpg"
            extract_frame(path, offset + t, frame_path)
            frame = Image.open(frame_path).convert("RGB")
            frame.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
            x = col * cell_w + (cell_w - frame.width) // 2
            y = row * (cell_h + 52) + 40 + (cell_h - frame.height) // 2
            sheet.paste(frame, (x, y))
            draw.text((col * cell_w + 8, row * (cell_h + 52) + 10),
                      f"{label}  t={t:.2f}s", fill="white", font=font)
    sheet.save(destination, quality=95)


def decode_check(path: Path) -> None:
    run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])


def main() -> None:
    if not SOURCE.exists() or not REFERENCE.exists():
        raise FileNotFoundError("missing source or reference")
    source_meta = probe(SOURCE)
    if (source_meta["width"], source_meta["height"], source_meta["r_frame_rate"]) != (str(WIDTH), str(HEIGHT), "24/1"):
        raise RuntimeError(f"unexpected source metadata: {source_meta}")
    outputs: list[tuple[float, Path]] = []
    for factor in FACTORS:
        output = HERE / f"tokyo-person-{factor:.2f}x-2s.mp4"
        render_candidate(factor, output)
        outputs.append((factor, output))
    comparison = HERE / "reference-bangkok-vs-high-tempo-1.50-1.80-2.00.mp4"
    make_comparison(outputs, comparison)
    contact = HERE / "reference-bangkok-vs-high-tempo-contact-sheet.jpg"
    make_contact_sheet(outputs, contact)

    for path in [*([SOURCE, REFERENCE]), *[path for _, path in outputs], comparison]:
        if path.suffix.lower() == ".mp4":
            decode_check(path)
    artifacts = {}
    for path in [SOURCE, REFERENCE, *[path for _, path in outputs], comparison, contact]:
        artifacts[str(path)] = {
            "sha256": sha256(path), "bytes": path.stat().st_size,
            "probe": probe(path) if path.suffix.lower() == ".mp4" else None,
        }
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "High-tempo T1 person-only retime probe; not a measured reference speed",
        "source": str(SOURCE), "source_sha256": sha256(SOURCE),
        "reference": str(REFERENCE), "reference_sha256": sha256(REFERENCE),
        "source_start_seconds": SOURCE_START, "output_seconds": OUTPUT_SECONDS,
        "fps": FPS, "frame_count": FRAME_COUNT,
        "factor_definition": "standard playback speed; source_time = source_start + factor * output_time",
        "candidates": [{"factor": f, "source_window_seconds": OUTPUT_SECONDS * f,
                        "output_window_seconds": OUTPUT_SECONDS} for f in FACTORS],
        "comparison": {"reference_start_seconds": REFERENCE_START,
                       "duration_seconds": REFERENCE_SECONDS,
                       "fps": COMPARE_FPS,
                       "layout": "4 columns, 540x1080 each, 2160x1080 total",
                       "conversion": "fps-only frame duplication to 120fps; no optical-flow interpolation"},
        "fixed": ["person component only", "card/camera/design/audio excluded", "native 720x1280 candidates",
                  "reference decoded from beginning then trim-selected to avoid inaccurate input seeking"],
        "known_limits": ["whole-body retime also changes face, upper body, arms, parasol and cloth",
                          "stride amplitude is not increased", "exact foot-contact count not independently measured"],
        "artifacts": artifacts,
    }
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# High-tempo T1 probe\n\n"
        "Tokyo person component only, rendered from the existing v2 source at 1.50x, 1.80x, and 2.00x. "
        "Each candidate is 720x1280, 24fps, 48 frames / 2.0s, beginning at source 3.5s. "
        "The source window is 3.5–6.5s, 3.5–7.1s, and 3.5–7.5s respectively.\n\n"
        "The comparison uses the reference's 4.95–6.35s interval and the first 1.4s of each candidate. "
        "It is 4 columns at 540x1080 (2160x1080 total), exported at 120fps by frame duplication only; "
        "there is no optical-flow interpolation. Exact step counts were not independently measured.\n\n"
        "- [4-column reference comparison](reference-bangkok-vs-high-tempo-1.50-1.80-2.00.mp4)\n"
        "- [contact sheet](reference-bangkok-vs-high-tempo-contact-sheet.jpg)\n"
        "- [metadata](metadata.json)\n- [render script](render_high_tempo_probe.py)\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
