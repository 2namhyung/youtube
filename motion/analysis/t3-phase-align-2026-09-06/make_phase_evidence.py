"""Dense lower-body evidence for the Tokyo->Shanghai card overlap.

The overlap is fixed at output 9.000s.  At delta d after that cut,
the retained outgoing Tokyo source time is 7.0 + 1.8*d and incoming
Shanghai is 2.5 + 1.8*d.  This script only decodes existing takes and
writes inspection sheets; it does not render or modify production media.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
SOURCES = {
    "tokyo": PERF / "tokyo-parasol-10s.mp4",
    "shanghai": PERF / "shanghai-fan-10s.mp4",
}
FFMPEG = "ffmpeg"
FPS = 24
W, H = 720, 1280


def read_frames(path: Path) -> list[Image.Image]:
    proc = subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
        stdout=subprocess.PIPE,
    )
    assert proc.stdout is not None
    nbytes = W * H * 3
    frames: list[Image.Image] = []
    while True:
        data = proc.stdout.read(nbytes)
        if len(data) != nbytes:
            break
        frames.append(Image.frombytes("RGB", (W, H), data))
    proc.stdout.close()
    if proc.wait() != 0:
        raise RuntimeError(f"decode failed: {path}")
    return frames


def lower(frame: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Keep torso/hips and feet.  The upper edge is deliberately above hips
    # because skirts/robes can hide the actual ankle line.
    return frame.crop((0, 520, W, H)).resize(size, Image.Resampling.LANCZOS)


def lower_close(frame: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Centered actor crop for inspecting toe/heel placement; keep hip reference.
    return frame.crop((170, 650, 550, H)).resize(size, Image.Resampling.LANCZOS)


def font(size: int = 18):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def make_grid(name: str, frames: list[Image.Image], times: list[float], output: Path,
              cols: int = 8, cell=(300, 420), title: str = "") -> None:
    cw, ch = cell
    label_h = 28
    rows = (len(times) + cols - 1) // cols
    out = Image.new("RGB", (cols * cw, rows * (ch + label_h)), "#202020")
    draw = ImageDraw.Draw(out)
    fnt = font(17)
    for i, ts in enumerate(times):
        idx = max(0, min(len(frames) - 1, round(ts * FPS)))
        x, y = (i % cols) * cw, (i // cols) * (ch + label_h)
        out.paste(lower(frames[idx], (cw, ch)), (x, y + label_h))
        draw.text((x + 6, y + 5), f"{name}  src={ts:.3f}s  f={idx}", fill="white", font=fnt)
    draw.text((8, 2), title, fill="#ffd166", font=font(19))
    out.save(output, quality=95)


def make_boundary(tokyo: list[Image.Image], shanghai: list[Image.Image], output: Path) -> None:
    # One output frame per column: exact cut plus first 11 transition frames.
    deltas = [i / FPS for i in range(12)]
    cw, ch, lh = 360, 560, 30
    out = Image.new("RGB", (len(deltas) * cw, 2 * (ch + lh)), "#202020")
    draw = ImageDraw.Draw(out)
    fnt = font(18)
    for col, d in enumerate(deltas):
        tokyo_t, shanghai_t = 7.0 + 1.8 * d, 2.5 + 1.8 * d
        for row, (name, frames, ts) in enumerate(
            (("TOKYO outgoing", tokyo, tokyo_t), ("SHANGHAI incoming", shanghai, shanghai_t))
        ):
            idx = max(0, min(len(frames) - 1, round(ts * FPS)))
            x, y = col * cw, row * (ch + lh)
            out.paste(lower(frames[idx], (cw, ch)), (x, y + lh))
            draw.text((x + 5, y + 6), f"{name}  {ts:.3f}s f{idx}", fill="white", font=fnt)
    draw.text((8, 2), "Tokyo->Shanghai fixed overlap: output delta 0..0.458s; lower body / hip-to-feet crop", fill="#ffd166", font=font(20))
    out.save(output, quality=95)


def make_cut_atlas(name: str, frames: list[Image.Image], starts: list[float], output: Path,
                   cut_time: float, title: str) -> None:
    """Show the exact outgoing/incoming frame for each legal start offset."""
    cw, ch, lh = 270, 420, 28
    cols = 10
    rows = (len(starts) + cols - 1) // cols
    out = Image.new("RGB", (cols * cw, rows * (ch + lh)), "#202020")
    draw = ImageDraw.Draw(out)
    fnt = font(16)
    for i, start in enumerate(starts):
        source_t = start + cut_time
        idx = max(0, min(len(frames) - 1, round(source_t * FPS)))
        x, y = (i % cols) * cw, (i // cols) * (ch + lh)
        out.paste(lower(frames[idx], (cw, ch)), (x, y + lh))
        draw.text((x + 5, y + 5), f"start={start:.2f}  src={source_t:.2f} f{idx}", fill="white", font=fnt)
    draw.text((8, 2), title, fill="#ffd166", font=font(18))
    out.save(output, quality=95)


def make_close_atlas(name: str, frames: list[Image.Image], starts: list[float], output: Path,
                     cut_time: float, title: str) -> None:
    cw, ch, lh = 360, 600, 28
    cols = 8
    rows = (len(starts) + cols - 1) // cols
    out = Image.new("RGB", (cols * cw, rows * (ch + lh)), "#202020")
    draw = ImageDraw.Draw(out)
    fnt = font(17)
    for i, start in enumerate(starts):
        source_t = start + cut_time
        idx = max(0, min(len(frames) - 1, round(source_t * FPS)))
        x, y = (i % cols) * cw, (i // cols) * (ch + lh)
        out.paste(lower_close(frames[idx], (cw, ch)), (x, y + lh))
        draw.text((x + 5, y + 5), f"start={start:.2f} src={source_t:.2f} f{idx}", fill="white", font=fnt)
    draw.text((8, 2), title, fill="#ffd166", font=font(19))
    out.save(output, quality=97)


def main() -> None:
    decoded = {name: read_frames(path) for name, path in SOURCES.items()}
    make_boundary(decoded["tokyo"], decoded["shanghai"], HERE / "tokyo-shanghai-boundary-dense.jpg")
    # A readable close-up of the splice-adjacent first four output frames.
    boundary = Image.open(HERE / "tokyo-shanghai-boundary-dense.jpg")
    boundary.crop((0, 0, 4 * 360, boundary.height)).save(HERE / "tokyo-shanghai-boundary-first4.jpg", quality=97)
    make_grid(
        "tokyo", decoded["tokyo"], [6.5 + i * 0.125 for i in range(17)],
        HERE / "tokyo-lowerbody-phase-grid.jpg", cols=9,
        title="Tokyo broader outgoing phase: source 6.50..8.50s (0.125s cadence)",
    )
    make_grid(
        "shanghai", decoded["shanghai"], [2.0 + i * 0.125 for i in range(17)],
        HERE / "shanghai-lowerbody-phase-grid.jpg", cols=9,
        title="Shanghai broader incoming phase: source 2.00..4.00s (0.125s cadence)",
    )
    # Legal windows at the fixed 9.000s cut: Tokyo's outgoing frame is
    # start+4.5s, Shanghai's incoming frame is exactly its start.
    make_cut_atlas(
        "tokyo", decoded["tokyo"], [i * 0.25 for i in range(23)],
        HERE / "tokyo-cut-phase-atlas.jpg", 4.5,
        "Tokyo outgoing phase atlas: candidate start 0.00..5.50s -> cut source start+4.50s",
    )
    make_cut_atlas(
        "shanghai", decoded["shanghai"], [i * 0.25 for i in range(26)],
        HERE / "shanghai-cut-phase-atlas.jpg", 0.0,
        "Shanghai incoming phase atlas: candidate start 0.00..6.25s -> cut source=start",
    )
    make_close_atlas(
        "tokyo", decoded["tokyo"], [i * 0.125 for i in range(45)],
        HERE / "tokyo-cut-phase-close-atlas.jpg", 4.5,
        "Tokyo close cut-phase atlas: starts 0.00..5.50s at 0.125s; centered hip/feet",
    )
    make_close_atlas(
        "shanghai", decoded["shanghai"], [i * 0.125 for i in range(51)],
        HERE / "shanghai-cut-phase-close-atlas.jpg", 0.0,
        "Shanghai close cut-phase atlas: starts 0.00..6.25s at 0.125s; centered hip/feet",
    )
    manifest = {
        "purpose": "Dense visible lower-body evidence before any full candidate render",
        "fixed_boundary_output_seconds": 9.0,
        "factor": 1.8,
        "boundary_mapping": {
            "tokyo_outgoing": "7.0 + 1.8*d",
            "shanghai_incoming": "2.5 + 1.8*d",
            "d_seconds": "0..0.458333 (12 output frames)",
        },
        "sources": {k: str(v) for k, v in SOURCES.items()},
        "artifacts": [
            "tokyo-shanghai-boundary-dense.jpg",
            "tokyo-shanghai-boundary-first4.jpg",
            "tokyo-lowerbody-phase-grid.jpg",
            "shanghai-lowerbody-phase-grid.jpg",
            "tokyo-cut-phase-atlas.jpg",
            "shanghai-cut-phase-atlas.jpg",
            "tokyo-cut-phase-close-atlas.jpg",
            "shanghai-cut-phase-close-atlas.jpg",
        ],
        "note": "Visual foot/ankle confidence is reduced where parasol/robe/fan or card matte occludes ankles; hip and hem motion remain visible.",
    }
    (HERE / "evidence_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("wrote dense Tokyo->Shanghai evidence")


if __name__ == "__main__":
    main()
