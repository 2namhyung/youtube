"""Make a late matched-source-time lower-body sheet without rerendering video."""
from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PRIOR = ROOT / "analysis" / "same-time-ab-2026-09-06" / "run_same_time_ab.py"
SEOUL = ROOT / "production" / "ticket-travel" / "performance-v2" / "canonical-hanbok-10s.mp4"
A = ROOT / "production" / "ticket-travel" / "performance-v2" / "tokyo-parasol-10s.mp4"
B = Path("C:/Users/every/Downloads/Woman_walking_in_hanbok_202609061909.mp4")
TIMES = [8.500, 8.575, 8.650, 8.725, 8.800, 8.875]


def load_prior():
    spec = importlib.util.spec_from_file_location("same_time_late_sheet", PRIOR)
    if spec is None or spec.loader is None:
        raise ImportError(PRIOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if not B.is_file():
        raise FileNotFoundError(B)
    prior = load_prior()
    sources = [("Seoul outgoing", SEOUL), ("A historical Tokyo", A), ("B clothing-only Tokyo", B)]
    rows = []
    for name, source in sources:
        reader = prior.Reader(source)
        row = []
        try:
            for source_time in TIMES:
                frame, frame_i = reader.at(source_time)
                crop = Image.fromarray(frame).crop((120, 850, 600, 1210)).resize((300, 225), Image.Resampling.LANCZOS)
                canvas = Image.new("RGB", (300, 260), "#242424")
                canvas.paste(crop, (0, 0))
                ImageDraw.Draw(canvas).text((5, 232), f"{name} f{frame_i} source {source_time:.3f}s", fill="white")
                row.append(canvas)
        finally:
            reader.close()
        rows.append(row)
    sheet = Image.new("RGB", (len(TIMES) * 300, len(rows) * 260), "#242424")
    for r, row in enumerate(rows):
        for c, image in enumerate(row):
            sheet.paste(image, (c * 300, r * 260))
    ImageDraw.Draw(sheet).text((6, 6), "Late matched source-clock lower-body samples: Seoul / A / B", fill="white")
    out = HERE / "raw-three-way-late-source-clock-feet.jpg"
    sheet.save(out, quality=95, subsampling=0)
    print(out)


if __name__ == "__main__":
    main()
