from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4"
V2 = ROOT / "production/ticket-travel/final-sequence-v2/final-sequence-v2.mp4"
OUT = Path(__file__).resolve().parent


def probe(path: Path) -> dict:
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration",
        "-of", "json", str(path),
    ], text=True)
    s = json.loads(raw)["streams"][0]
    return {
        "path": str(path),
        "width": int(s["width"]), "height": int(s["height"]),
        "fps": s["r_frame_rate"], "duration": float(s["duration"]),
        "frames": int(s["nb_frames"]),
    }


def frames(path: Path, start: float, duration: float, rate: int = 10, width: int = 180):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(start),
           "-t", str(duration), "-i", str(path), "-vf", f"fps={rate},scale={width}:-1",
           "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    data = proc.stdout.read() if proc.stdout else b""
    proc.wait()
    # JPEG start/end markers are adequate for ffmpeg image2pipe output.
    chunks = []
    pos = 0
    while True:
        a = data.find(b"\xff\xd8", pos)
        if a < 0:
            break
        b = data.find(b"\xff\xd9", a + 2)
        if b < 0:
            break
        chunks.append(Image.open(__import__("io").BytesIO(data[a:b + 2])).convert("RGB"))
        pos = b + 2
    return chunks


def contact(path: Path, start: float, duration: float, label: str, name: str):
    ims = frames(path, start, duration)
    if not ims:
        raise RuntimeError(f"No frames decoded for {path}")
    font = ImageFont.load_default()
    pad, label_h = 3, 22
    cell_w, cell_h = ims[0].width, ims[0].height + label_h
    cols = 10
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell_w + pad) + pad, rows * (cell_h + pad) + pad), "black")
    draw = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        x = pad + (i % cols) * (cell_w + pad)
        y = pad + (i // cols) * (cell_h + pad)
        sheet.paste(im, (x, y + label_h))
        t = start + i / 10.0
        draw.rectangle((x, y, x + cell_w, y + label_h), fill="white")
        draw.text((x + 3, y + 5), f"{t:.2f}s", fill="red", font=font)
    sheet.save(OUT / name, quality=92)
    return {"label": label, "start": start, "duration": duration, "rate": 10, "frames": len(ims), "output": name}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = {
        "reference": probe(REF),
        "current_v2": probe(V2),
        "sheets": [
            contact(REF, 2.0, 2.3, "reference intro, walking onset", "reference-intro-2.0-4.3-labeled.jpg"),
            contact(V2, 1.8, 1.8, "current v2 intro, walking onset", "v2-intro-1.8-3.6-labeled.jpg"),
            contact(REF, 4.9, 1.4, "reference Bangkok clean city window", "reference-bangkok-4.9-6.3-labeled.jpg"),
            contact(REF, 6.8, 1.6, "reference Seoul clean city window", "reference-seoul-6.8-8.4-labeled.jpg"),
            contact(V2, 4.1, 1.8, "current v2 Seoul city window", "v2-seoul-4.1-5.9-labeled.jpg"),
            contact(V2, 6.8, 1.9, "current v2 Tokyo clean city window", "v2-tokyo-6.8-8.7-labeled.jpg"),
            contact(V2, 9.7, 1.5, "current v2 Shanghai clean city window", "v2-shanghai-9.7-11.2-labeled.jpg"),
        ],
    }
    (OUT / "metadata.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
