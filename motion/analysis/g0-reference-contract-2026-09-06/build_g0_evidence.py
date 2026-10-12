"""Build read-only G0 evidence from the locked ticket-travel reference.

The frame groups are observation anchors, not a claim that the original layer
stack or hidden keyframes can be recovered from the MP4.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / "references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4"

GROUPS = {
    "entry-bangkok": [126, 127, 129, 130, 134, 135, 141, 144, 150],
    "bangkok-seoul": [196, 197, 198, 199, 200, 201, 203, 206, 214],
    "seoul-dali": [260, 261, 262, 263, 265, 266, 268, 270, 278],
    "dali-tokyo": [328, 329, 330, 331, 333, 334, 336, 338, 346],
}


def probe() -> dict:
    raw = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,nb_frames,duration,codec_name,pix_fmt",
            "-of", "json", str(SOURCE),
        ], text=True
    )
    stream = json.loads(raw)["streams"][0]
    num, den = map(int, stream["avg_frame_rate"].split("/"))
    return {
        "path": "references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4",
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": num / den,
        "avg_frame_rate": stream["avg_frame_rate"],
        "nb_frames": int(stream["nb_frames"]),
        "duration_seconds": float(stream["duration"]),
        "codec_name": stream["codec_name"],
        "pix_fmt": stream.get("pix_fmt"),
    }


def decode(indices: list[int], width: int = 270, height: int = 540) -> list[Image.Image]:
    expr = "+".join(f"eq(n,{n})" for n in indices)
    raw = subprocess.check_output(
        [
            "ffmpeg", "-v", "error", "-i", str(SOURCE),
            "-vf", f"select='{expr}',scale={width}:{height}",
            "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ]
    )
    stride = width * height * 3
    if len(raw) != len(indices) * stride:
        raise RuntimeError(f"decoded {len(raw)//stride} frames for {len(indices)} requested")
    return [Image.frombytes("RGB", (width, height), raw[i * stride:(i + 1) * stride]) for i in range(len(indices))]


def draw_sheet(name: str, indices: list[int], meta: dict) -> None:
    ims = decode(indices)
    cols = 4
    label_h = 34
    rows = math.ceil(len(ims) / cols)
    canvas = Image.new("RGB", (cols * 270, rows * (540 + label_h)), "#202020")
    d = ImageDraw.Draw(canvas)
    for i, (frame, im) in enumerate(zip(indices, ims)):
        x = (i % cols) * 270
        y = (i // cols) * (540 + label_h)
        canvas.paste(im, (x, y))
        d.text((x + 5, y + 545), f"F{frame}  {frame / meta['fps']:.3f}s", fill="white")
    canvas.save(OUT / f"{name}.jpg", quality=94)


def draw_overview(meta: dict) -> None:
    # Same absolute frame anchors in four rows keep cross-transition timing
    # visible. The last column is the first stable-looking frame used here.
    rows = [
        ("entry-bangkok", [126, 130, 134, 135, 144, 150]),
        ("bangkok-seoul", [196, 198, 200, 201, 203, 206]),
        ("seoul-dali", [260, 262, 265, 266, 268, 270]),
        ("dali-tokyo", [328, 330, 333, 334, 336, 338]),
    ]
    cell_w, cell_h, label_h = 270, 540, 42
    canvas = Image.new("RGB", (6 * cell_w, len(rows) * (cell_h + label_h + 24)), "#202020")
    d = ImageDraw.Draw(canvas)
    for r, (name, indices) in enumerate(rows):
        y0 = r * (cell_h + label_h + 24)
        d.text((5, y0 + 2), name, fill="#ffd166")
        for i, (frame, im) in enumerate(zip(indices, decode(indices))):
            x = i * cell_w
            y = y0 + 20
            canvas.paste(im, (x, y))
            d.text((x + 5, y + cell_h + 4), f"F{frame} {frame / meta['fps']:.3f}s", fill="white")
    canvas.save(OUT / "all-four-transition-anchors.jpg", quality=94)


def make_playable_clips() -> None:
    # Source-only excerpts: no compositing, retiming, or generated frames.
    # Each excerpt includes a little lead-in and settle so a reviewer can judge
    # the visible occlusion relationship at normal speed and half speed.
    windows = [
        ("ENTRY / BANGKOK", 4.20, 5.20),
        ("BANGKOK / SEOUL", 6.60, 7.40),
        ("SEOUL / DALI", 8.70, 9.50),
        ("DALI / TOKYO", 11.00, 11.80),
    ]
    filters = []
    labels = []
    for i, (label, start, end) in enumerate(windows):
        safe = label.replace("/", "\\/")
        filters.append(
            f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
            f"scale=540:1080:flags=lanczos,setsar=1,"
            f"drawtext=text='{safe}':fontcolor=black:fontsize=28:"
            f"box=1:boxcolor=white@0.75:boxborderw=8:x=18:y=18[v{i}]"
        )
        labels.append(f"[v{i}]")
    filters.append("".join(labels) + f"concat=n={len(windows)}:v=1:a=0[out]")
    base = [
        "ffmpeg", "-v", "error", "-y", "-i", str(SOURCE),
        "-filter_complex", ";".join(filters), "-map", "[out]",
        "-r", "30", "-an", "-c:v", "libx264", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ]
    subprocess.run(base + [str(OUT / "four-transitions-source-normal.mp4")], check=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", str(OUT / "four-transitions-source-normal.mp4"),
            "-vf", "setpts=2*PTS", "-r", "30", "-an", "-c:v", "libx264", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(OUT / "four-transitions-source-half-speed.mp4"),
        ],
        check=True,
    )


def main() -> None:
    meta = probe()
    meta["groups"] = {
        name: [{"frame": f, "time_seconds": f / meta["fps"]} for f in indices]
        for name, indices in GROUPS.items()
    }
    meta["measurement_warning"] = (
        "Frame anchors describe visible composition changes. They do not recover hidden first motion, "
        "original keyframes, layer order, or whether a card is a single rendered plate."
    )
    (OUT / "source-metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for name, indices in GROUPS.items():
        draw_sheet(name, indices, meta)
    draw_overview(meta)
    make_playable_clips()
    print(json.dumps({"source_sha256": meta["sha256"], "sheets": len(GROUPS) + 1}, indent=2))


if __name__ == "__main__":
    main()
