"""Bounded clothing-only A/B diagnostic.

Run only after downloading the new B Flow output, for example:

    python run_clothing_only_ab.py "C:/Users/every/Downloads/<new-B>.mp4"

The command-line path is mandatory so an accidental rerun cannot substitute an
old or guessed Flow output. A and B use the same source-clock mapping at the
Seoul->Tokyo boundary (Tokyo source 7.9s) and the same 1.80x sampling. This
script creates silent diagnostics only; it never overwrites production media.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PRIOR = ROOT / "analysis" / "same-time-ab-2026-09-06" / "run_same_time_ab.py"
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
A_PATH = PERF / "tokyo-parasol-10s.mp4"
FPS = 24
FACTOR = 1.8
GLOBAL_START = 6.0
BOUNDARY = 6.5
DURATION = 1.5
TOKYO_START = 7.9


def load_prior():
    spec = importlib.util.spec_from_file_location("same_time_ab_clothing_only", PRIOR)
    if spec is None or spec.loader is None:
        raise ImportError(PRIOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def label(image: Image.Image, text: str, xy: tuple[int, int] = (8, 8)) -> None:
    draw = ImageDraw.Draw(image)
    draw.rectangle((xy[0] - 4, xy[1] - 3, xy[0] + len(text) * 11, xy[1] + 23), fill=(0, 0, 0))
    draw.text(xy, text, fill="white")


def compact_transition(prior, a: list[np.ndarray], b: list[np.ndarray], path: Path) -> None:
    """Six full-frame A/B pairs around the 6.5s card boundary."""
    picks = list(range(12, 18))
    cells: list[Image.Image] = []
    for i in picks:
        for name, frames in (("A historical", a), ("B clothing-only", b)):
            image = Image.fromarray(frames[i]).resize((360, 640), Image.Resampling.LANCZOS)
            label(image, f"{name}  f{i}  g{GLOBAL_START + i / FPS:.3f}s")
            cells.append(image)
    sheet = Image.new("RGB", (6 * 360, 2 * 640), "#242424")
    for col in range(6):
        sheet.paste(cells[2 * col], (col * 360, 0))
        sheet.paste(cells[2 * col + 1], (col * 360, 640))
    sheet.save(path, quality=95, subsampling=0)


def raw_three_way(prior, b_path: Path, path: Path) -> None:
    """Raw matched source-clock lower-body samples: Seoul, A and B."""
    from PIL import ImageFont

    times = [BOUNDARY + i / FPS for i in range(6)]
    readers = [
        ("Seoul outgoing", prior.SEOUL),
        ("A historical Tokyo", A_PATH),
        ("B clothing-only Tokyo", b_path),
    ]
    rows: list[list[Image.Image]] = []
    for name, source in readers:
        reader = prior.Reader(source)
        row: list[Image.Image] = []
        try:
            for global_t in times:
                source_t = prior.SEOUL_START + FACTOR * (global_t - prior.SEOUL_BRANCH) if name.startswith("Seoul") else TOKYO_START + FACTOR * (global_t - prior.TOKYO_BRANCH)
                frame, frame_i = reader.at(source_t)
                crop = Image.fromarray(frame).crop((120, 850, 600, 1210)).resize((240, 180), Image.Resampling.LANCZOS)
                canvas = Image.new("RGB", (240, 212), "#242424")
                canvas.paste(crop, (0, 0))
                draw = ImageDraw.Draw(canvas)
                draw.text((4, 185), f"{name} f{frame_i} t{source_t:.3f}", fill="white")
                row.append(canvas)
        finally:
            reader.close()
        rows.append(row)
    sheet = Image.new("RGB", (6 * 240, 3 * 212), "#242424")
    draw = ImageDraw.Draw(sheet)
    for r, row in enumerate(rows):
        for c, image in enumerate(row):
            sheet.paste(image, (c * 240, r * 212))
    draw.text((6, 6), "Raw matched source-clock lower-body samples", fill="white")
    sheet.save(path, quality=95, subsampling=0)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("B download path required; no render was run")
    b_path = Path(sys.argv[1]).expanduser().resolve()
    if not b_path.is_file():
        raise FileNotFoundError(f"B download does not exist: {b_path}")
    if b_path.resolve() == A_PATH.resolve():
        raise SystemExit("B path resolves to historical A; refusing to run")
    prior = load_prior()
    prior.TOKYO = A_PATH
    a, _ = prior.render_variant(TOKYO_START)
    prior.TOKYO = b_path
    b, _ = prior.render_variant(TOKYO_START)
    assert len(a) == len(b) == 36
    assert all(frame.shape == (1280, 720, 3) for frame in a + b)
    out_a = HERE / "A-historical-sameclock-1.5s.mp4"
    out_b = HERE / "B-clothing-only-sameclock-1.5s.mp4"
    out_side = HERE / "AB-clothing-only-sameclock-1.5s.mp4"
    prior.encode(a, out_a)
    prior.encode(b, out_b)
    side = [np.hstack((x, y)) for x, y in zip(a, b)]
    assert all(frame.shape == (1280, 1440, 3) for frame in side)
    prior.encode(side, out_side)
    compact_transition(prior, a, b, HERE / "AB-transition-6frames.jpg")
    raw_three_way(prior, b_path, HERE / "raw-three-way-matched-source-clock-feet.jpg")
    for output in (out_a, out_b, out_side):
        prior.decode(output)
    print("completed", out_a, out_b, out_side)


if __name__ == "__main__":
    main()
