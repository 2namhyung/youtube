"""Render a deterministic four-second boarding-pass probe.

The probe is intentionally self-contained: an opaque white canvas, a procedural
pink-striped pass, and the already matte-cleaned Seoul hanbok RGBA plate.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = (1080, 1920)
FPS = 30
DURATION = 4.0
FRAMES = int(FPS * DURATION)
PLATE = Path(__file__).resolve().parents[1] / "assets" / "imagegen-plates-v1" / "probe-plate-rgba.png"
OUT_DIR = Path(__file__).resolve().parent
OUT_MP4 = OUT_DIR / "4s-probe.mp4"
OUT_FRAME = OUT_DIR / "4s-probe-frame-3s.png"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "arialbd.ttf" if bold else "arial.ttf"
    candidate = Path("C:/Windows/Fonts") / name
    try:
        return ImageFont.truetype(str(candidate), size)
    except OSError:
        return ImageFont.load_default()


def make_ticket() -> Image.Image:
    """Return a high-resolution, antialiased, pink-striped boarding pass."""
    scale = 3
    width, height = 920 * scale, 340 * scale
    radius = 28 * scale
    card = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    mask = Image.new("L", (width, height), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)

    body = Image.new("RGBA", (width, height), (253, 251, 253, 255))
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle(
        (3 * scale, 3 * scale, width - 4 * scale, height - 4 * scale),
        radius=radius - 2 * scale,
        fill=(253, 251, 253, 255),
        outline=(211, 72, 132, 255),
        width=5 * scale,
    )

    # Clip broad diagonal pink stripes to the rounded ticket silhouette.
    stripes = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stripes)
    stripe_color = (239, 113, 166, 255)
    for x in range(-height, 260 * scale, 64 * scale):
        sd.polygon(
            [(x, 0), (x + 32 * scale, 0), (x + 32 * scale + height, height), (x + height, height)],
            fill=stripe_color,
        )
    stripes.putalpha(Image.composite(stripes.getchannel("A"), Image.new("L", (width, height), 0), mask))
    body = Image.alpha_composite(body, stripes)
    draw = ImageDraw.Draw(body)

    # Keep the pass legible but graphic; all marks stay inside the card.
    white = (255, 255, 255, 225)
    draw.rounded_rectangle((26 * scale, 34 * scale, 282 * scale, 306 * scale), radius=12 * scale, fill=white)
    draw.line((610 * scale, 28 * scale, 610 * scale, 312 * scale), fill=(211, 72, 132, 210), width=2 * scale)
    draw.text((48 * scale, 52 * scale), "BOARDING PASS", font=font(25 * scale, True), fill=(118, 39, 82, 255))
    draw.text((48 * scale, 101 * scale), "SEOUL", font=font(46 * scale, True), fill=(211, 52, 119, 255))
    draw.text((49 * scale, 156 * scale), "ICN  →  NRT", font=font(22 * scale, True), fill=(73, 67, 78, 255))
    draw.text((49 * scale, 203 * scale), "GATE 08   SEAT 12A", font=font(17 * scale), fill=(73, 67, 78, 255))
    draw.text((49 * scale, 247 * scale), "14 OCT 2026   09:40", font=font(15 * scale), fill=(73, 67, 78, 255))
    draw.text((645 * scale, 52 * scale), "TRAVEL", font=font(16 * scale, True), fill=(118, 39, 82, 255))
    draw.text((645 * scale, 82 * scale), "KOREA", font=font(27 * scale, True), fill=(211, 52, 119, 255))
    # Barcode-style marks on the detachable stub.
    bars_x = 645 * scale
    for i, bar_w in enumerate((3, 7, 2, 5, 3, 9, 2, 4, 7, 3, 2, 6, 3, 8, 2, 4, 3, 7, 2, 5)):
        draw.rectangle((bars_x, 150 * scale, bars_x + bar_w * scale, 275 * scale), fill=(73, 67, 78, 230))
        bars_x += (bar_w + 5) * scale
    draw.text((645 * scale, 286 * scale), "038 114 902", font=font(12 * scale), fill=(73, 67, 78, 255))

    card = Image.composite(body, card, mask)
    return card.resize((920, 340), Image.Resampling.LANCZOS)


def ease_out_cubic(progress: float) -> float:
    return 1.0 - (1.0 - progress) ** 3


def frame_at(time_s: float, plate: Image.Image, ticket: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", SIZE, (255, 255, 255, 255))
    if time_s >= 1.0:
        p = min(1.0, max(0.0, (time_s - 1.0) / 0.4))
        eased = ease_out_cubic(p)
        center_y = 2150.0 + (1220.0 - 2150.0) * eased
        angle = -4.0 + 4.0 * eased
        rotated = ticket.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        canvas.alpha_composite(rotated, (round(540 - rotated.width / 2), round(center_y - rotated.height / 2)))
    # The plate is never moved, scaled, rotated, or regenerated between frames.
    canvas.alpha_composite(plate)
    return canvas.convert("RGB")


def render(output: Path, representative: Path) -> None:
    plate = Image.open(PLATE).convert("RGBA")
    if plate.size != SIZE:
        raise ValueError(f"plate must be {SIZE}, got {plate.size}")
    if plate.getchannel("A").getbbox() is None:
        raise ValueError("plate alpha channel is empty")
    ticket = make_ticket()
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SIZE[0]}x{SIZE[1]}",
        "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium",
        "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for index in range(FRAMES):
            t = index / FPS
            image = frame_at(t, plate, ticket)
            if index == int(3.0 * FPS):
                image.save(representative, format="PNG", optimize=False)
            assert process.stdin is not None
            process.stdin.write(image.tobytes())
    finally:
        if process.stdin is not None:
            process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("ffmpeg failed while encoding the probe")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT_MP4)
    parser.add_argument("--representative", type=Path, default=OUT_FRAME)
    args = parser.parse_args()
    render(args.output, args.representative)
    print(f"wrote {args.output}")
    print(f"wrote {args.representative}")


if __name__ == "__main__":
    main()
