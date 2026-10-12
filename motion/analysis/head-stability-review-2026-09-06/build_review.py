"""Build a bounded visual review of face/head/trunk orientation.

This is an observation artifact only. It reads existing videos, extracts
selected frames, crops the upper body for legibility, and writes a contact
sheet plus metadata; it never changes a source or production output.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REFERENCE = ROOT / "references" / "taoagou" / "nonfinger" / "ticket_travel_7648553013002489109.mp4"
SEOUL = ROOT / "production" / "ticket-travel" / "performance-v2" / "canonical-hanbok-10s.mp4"
TOKYO = ROOT / "production" / "ticket-travel" / "performance-v2" / "tokyo-parasol-10s.mp4"
CANDIDATE = ROOT / "analysis" / "t3-cut-local-2026-09-06" / "t3-seoul-tokyo-local-1.80x-4s.mp4"

ROWS = [
    ("reference Seoul", REFERENCE, (6.8, 7.2, 7.6, 8.0), 30, (170, 180, 910, 1400)),
    ("reference Tokyo", REFERENCE, (11.2, 11.6, 12.0, 12.4), 30, (170, 180, 910, 1400)),
    ("current Seoul source", SEOUL, (2.5, 3.4, 4.3, 5.2), 24, (120, 30, 600, 850)),
    ("current Tokyo source", TOKYO, (5.2, 6.1, 7.0, 7.9), 24, (120, 30, 600, 850)),
    ("T3 candidate overlap", CANDIDATE, (1.5, 1.666667, 1.833333, 1.958333), 24, (120, 30, 600, 850)),
]


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "stream=width,height,r_frame_rate,nb_frames,duration", "-show_entries", "format=duration",
         "-of", "json", str(path)], capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    return {"width": stream.get("width"), "height": stream.get("height"),
            "r_frame_rate": stream.get("r_frame_rate"), "nb_frames": stream.get("nb_frames"),
            "duration": data.get("format", {}).get("duration")}


def extract(path: Path, index: int, destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-vf", f"select=eq(n\\,{index})", "-frames:v", "1", str(destination)])


def build_contact() -> dict:
    cell_w, cell_h, label_h = 320, 440, 34
    sheet = Image.new("RGB", (cell_w * 4, (cell_h + label_h) * len(ROWS)), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
    except OSError:
        font = ImageFont.load_default()
    temp_files: list[Path] = []
    frame_records = []
    try:
        for row_index, (row_name, source, times, fps, crop) in enumerate(ROWS):
            for col, timestamp in enumerate(times):
                source_index = round(timestamp * fps)
                frame_path = HERE / f".frame-{row_index}-{col}.png"
                extract(source, source_index, frame_path)
                temp_files.append(frame_path)
                frame = Image.open(frame_path).convert("RGB").crop(crop)
                frame = ImageOps.contain(frame, (cell_w - 10, cell_h - 10), Image.Resampling.LANCZOS)
                x = col * cell_w + (cell_w - frame.width) // 2
                y = row_index * (cell_h + label_h) + label_h + (cell_h - frame.height) // 2
                sheet.paste(frame, (x, y))
                draw.text((col * cell_w + 7, row_index * (cell_h + label_h) + 8),
                          f"{row_name}  t={timestamp:.2f}s F{source_index}", fill="white", font=font)
                frame_records.append({"row": row_name, "path": str(source), "time_seconds": timestamp,
                                      "frame_index": source_index, "fps": fps, "crop_box": crop})
    finally:
        for path in temp_files:
            path.unlink(missing_ok=True)
    destination = HERE / "head-stability-contact.jpg"
    sheet.save(destination, quality=95)
    return {"path": str(destination), "sha256": sha256(destination), "bytes": destination.stat().st_size,
            "width": sheet.width, "height": sheet.height, "frames": frame_records}


def main() -> None:
    for _, source, _, _, _ in ROWS:
        if not source.exists():
            raise FileNotFoundError(source)
    contact = build_contact()
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "bounded visual review of face/head orientation, gaze proxy, and trunk position",
        "sources": {str(path): {"sha256": sha256(path), "probe": probe(path)}
                    for path in (REFERENCE, SEOUL, TOKYO, CANDIDATE)},
        "rows": [{"name": name, "source": str(source), "times_seconds": list(times),
                  "fps": fps, "crop_box_xyxy": crop}
                 for name, source, times, fps, crop in ROWS],
        "contact": contact,
        "limits": [
            "visual head orientation is a proxy, not lens-gaze or eye-vector measurement",
            "different people/costumes/cards and independent generated takes confound speed attribution",
            "T3 candidate remains provisional and is not a full T3 PASS",
        ],
    }
    (HERE / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "README.md").write_text(
        "# Head stability review\n\n"
        "Bounded visual review only. The contact sheet crops face/head/upper trunk from selected frames of the reference, "
        "current Seoul/Tokyo 10-second sources, and the provisional T3 candidate. It tests whether the reference is "
        "consistently lens-facing and whether suppressing upper-body action is a sound correction.\n\n"
        "- [Contact sheet](head-stability-contact.jpg)\n"
        "- [Metadata and frame list](metadata.json)\n"
        "- [Build script](build_review.py)\n\n"
        "Eye direction is not directly measured. Exact speed causality is not established. No source, production, wiki, "
        "Flow, or generated media file was modified; this is evidence for a provisional design decision, not an approval.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
