"""Deterministic recreation of the reference boarding-pass fashion reel.

The character stills are treated as source plates; the ticket, typography,
replacement motion, framing, and timing are rendered locally so the design is
stable from run to run.  FFmpeg only encodes the RGB frames emitted here.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


W, H, FPS, FRAMES = 1080, 1920, 30, 400
ROOT = Path(__file__).resolve().parent
KEYFRAMES = ROOT / "assets" / "keyframes"
OUTPUT = Path(os.environ.get("TICKET_RENDER_OUTPUT", str(ROOT / "output"))) / "ticket-travel-animatic.mp4"


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        path = r"C:\Windows\Fonts\consola.ttf"
    elif bold:
        path = r"C:\Windows\Fonts\arialbd.ttf"
    else:
        path = r"C:\Windows\Fonts\arial.ttf"
    return ImageFont.truetype(path, size)


def eased(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def person_cutout(path: Path) -> Image.Image:
    """Extract the central figure from the near-white Imagegen plate."""
    src = Image.open(path).convert("RGB")
    a = np.asarray(src).astype(np.int16)
    border = np.concatenate((a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3),
                             a[-24:, :24].reshape(-1, 3), a[-24:, -24:].reshape(-1, 3)))
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    gray = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    # The source plates have a very light studio background. Preserve pale
    # clothing through saturation/darkness while suppressing the floor cast.
    strength = np.maximum.reduce((dist - 6.0, (226.0 - gray) * 1.15, (sat - 10.0) * 1.5))
    alpha = np.clip(strength * 16.0, 0, 255).astype(np.uint8)
    matte = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.2))
    # Keep a clean silhouette and discard isolated floor speckles.
    hard = Image.fromarray((alpha > 34).astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(5))
    matte = ImageChops.multiply(matte, hard)
    bbox = matte.point(lambda p: 255 if p > 35 else 0).getbbox()
    if not bbox:
        return src.convert("RGBA")
    left, top, right, bottom = bbox
    pad = 10
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(src.width, right + pad), min(src.height, bottom + pad)
    return Image.merge("RGBA", (*src.crop((left, top, right, bottom)).split(), matte.crop((left, top, right, bottom))))


def fit_intro(src: Image.Image, frame: int) -> Image.Image:
    """Slow push from a face/torso crop into the full traveler plate."""
    if frame < 68:
        p = frame / 67.0
        zoom = 1.40 - 0.34 * eased(p)
        cy = 555 + 220 * eased(p)
    else:
        p = (frame - 68) / 66.0
        zoom = 1.04 - 0.025 * p
        cy = 870 + 12 * math.sin(p * math.pi)
    scale = max(W / src.width, H / src.height) * zoom
    nw, nh = round(src.width * scale), round(src.height * scale)
    im = src.resize((nw, nh), Image.Resampling.LANCZOS)
    cx = nw / 2 + 5 * math.sin(frame / 24.0)
    sy = cy * scale
    left = round(cx - W / 2)
    top = round(sy - H / 2)
    left = max(0, min(nw - W, left))
    top = max(0, min(nh - H, top))
    return im.crop((left, top, left + W, top + H)).convert("RGB")


def vertical_text(text: str, size: int, fill: str, bold: bool = False, tracking: int = 0) -> Image.Image:
    f = font(size, bold=bold)
    # Draw horizontally then rotate, matching the sideways type in the reel.
    lines = text.split("\n")
    widths = [f.getlength(line) + 12 + tracking * max(0, len(line) - 1) for line in lines]
    width = max(20, round(max(widths)))
    tile = Image.new("RGBA", (width, max(1, len(lines)) * (size + 5) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    for row, line in enumerate(lines):
        x = 6
        y = row * (size + 5)
        for ch in line:
            d.text((x, y), ch, font=f, fill=fill)
            x += d.textlength(ch, font=f) + tracking
    return tile.rotate(90, expand=True, resample=Image.Resampling.BICUBIC)


def draw_barcode(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, seed: int = 1) -> None:
    # Deterministic irregular barcode blocks rather than a generic rectangle.
    widths = [3, 6, 2, 10, 4, 2, 8, 3, 5, 2, 11, 3, 7, 2, 4, 9]
    pos = x
    i = seed
    while pos < x + w:
        bar = widths[i % len(widths)]
        gap = 2 + ((i * 7 + seed) % 4)
        d.rectangle((pos, y, min(x + w, pos + bar), y + h), fill="#25282a")
        pos += bar + gap
        i += 1


def ticket_card(look: int, person: Image.Image) -> Image.Image:
    """Build one 900x1810 portrait boarding pass with a full-body subject."""
    cw, ch = 900, 1810
    colors = [("#eeb4c0", "BANGKOK"), ("#7cc9e5", "SEOUL"), ("#b9afa5", "DALI"), ("#69b8da", "TOKYO")]
    band, destination = colors[look]
    mask = Image.new("L", (cw, ch), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, cw - 1, ch - 1), radius=34, fill=255)
    # The small half-circle bite at the foot of the card is visible in the ref.
    md.ellipse((cw // 2 - 21, ch - 17, cw // 2 + 21, ch + 25), fill=0)

    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    body = Image.new("RGBA", (cw, ch), (251, 250, 246, 255))
    body.putalpha(mask)
    card.alpha_composite(body)
    band_layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band_layer)
    bd.rectangle((cw - 126, 0, cw, ch), fill=band)
    band_layer.putalpha(ImageChops.multiply(band_layer.getchannel("A"), mask))
    card.alpha_composite(band_layer)
    d = ImageDraw.Draw(card)

    # Card outline and the top stub/perforation.
    d.rounded_rectangle((2, 2, cw - 3, ch - 3), radius=34, outline="#42484b", width=3)
    d.line((26, 285, cw - 145, 285), fill="#aeb3b4", width=2)
    for x in range(30, cw - 145, 18):
        d.line((x, 277, min(x + 9, cw - 145), 277), fill="#b8bcbd", width=2)
    d.line((cw - 126, 0, cw - 126, ch), fill="#ffffff", width=2)

    # Pale oversized watermark letters behind the subject.
    watermark = font(168, bold=True)
    d.text((34, 380), "TAO", font=watermark, fill="#e0e1df")
    d.text((34, 540), "AGOU", font=watermark, fill="#e0e1df")

    # Stub data and micro labels.
    d.text((28, 36), "BOARDING PASS", font=font(18, bold=True), fill="#6c7477")
    d.text((28, 62), "NX 1042", font=font(21, mono=True), fill="#31383b")
    d.text((cw - 146, 42), "42", font=font(28, bold=True), fill="#ffffff")
    d.text((cw - 146, 78), "GATE", font=font(14, bold=True), fill="#ffffff")
    draw_barcode(d, 35, 100, 126, 138, 5 + look)
    for y, txt in [(112, "SEAT 42A"), (160, "TIME 0042"), (208, "GATE 42")]:
        d.text((178, y), txt, font=font(18, mono=True), fill="#42484b")
    d.text((35, 246), "PASSENGER / TAO AGOU", font=font(13, bold=True), fill="#687074")

    # Composite the current full-body plate into the main card region. The
    # ticket design remains legible around and over the figure like the reel.
    # Keep the actor scale invariant across looks.  The previous look-specific
    # height made one card visibly grow at every replacement, even when the
    # source plate was normalized.  All person plates now share one target
    # height and the same feet baseline.
    target_h = 1290
    ratio = target_h / person.height
    pw = max(1, round(person.width * ratio))
    subject = person.resize((pw, target_h), Image.Resampling.LANCZOS)
    sx = 380 - pw // 2
    sy = 360 if look != 3 else 350
    card.alpha_composite(subject, (sx, sy))

    # Main information is intentionally sideways and crosses the figure.
    fields = [
        (40, 360, "NAME\nTao / Agou"),
        (165, 720, "FLT\nNX 1042"),
        (290, 400, "GATE\n42"),
        (425, 670, "TIME\n0042"),
        (560, 420, "SEAT\n42A"),
        (694, 650, f"FROM\nGUANGZHOU\nTO\n{destination}"),
    ]
    for x, y, value in fields:
        tile = vertical_text(value, 22, "#33383a", bold=False, tracking=1)
        card.alpha_composite(tile, (x, y))
    d = ImageDraw.Draw(card)
    d.text((35, 1450), "GATE CLOSES 25 MINUTES BEFORE DEPARTURE", font=font(16, mono=True), fill="#525b5e")
    d.text((35, 1484), "BAGGAGE 07 KG   /   CABIN 02", font=font(14, mono=True), fill="#778083")
    draw_barcode(d, 34, 1570, 705, 158, 11 + look * 3)
    d.text((35, 1751), "BOARDING 0042   ·   TAOAGOU AIRLINES", font=font(14, mono=True), fill="#70787a")

    # Vertical airline strip, with a simple plane silhouette to avoid font-
    # dependent glyph substitutions.
    d.polygon([(cw - 74, 360), (cw - 46, 360), (cw - 60, 330), (cw - 64, 330)], fill="#364044")
    d.polygon([(cw - 60, 329), (cw - 67, 303), (cw - 62, 303), (cw - 54, 326)], fill="#364044")
    word = vertical_text("TAOAGOU AIRLINES", 30, "#304044", bold=True, tracking=1)
    card.alpha_composite(word, (cw - 98, 425))
    small = vertical_text("BOARDING PASS", 16, "#ffffff", bold=True, tracking=1)
    card.alpha_composite(small, (cw - 84, 80))
    bottom = vertical_text("BOARDING PASS", 16, "#ffffff", bold=True, tracking=1)
    card.alpha_composite(bottom, (cw - 84, 1505))

    return card


def place_rotated(canvas: Image.Image, layer: Image.Image, y: float, angle: float, opacity: int = 255) -> None:
    rotated = layer.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    if opacity < 255:
        rotated.putalpha(rotated.getchannel("A").point(lambda p: p * opacity // 255))
    x = (W - rotated.width) // 2
    canvas.alpha_composite(rotated, (x, round(y)))


def card_frame(cards: list[Image.Image], frame: int) -> Image.Image:
    bg = Image.new("RGBA", (W, H), "#f8f8f5")
    # shadow is made from the card alpha, which gives the same down-right
    # photographic cast as the source reel.
    def with_shadow(layer: Image.Image, y: float, angle: float, offset: tuple[int, int] = (0, 0), opacity: int = 255) -> None:
        r = layer.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
        shadow = Image.new("RGBA", r.size, (0, 0, 0, 0))
        sa = r.getchannel("A").filter(ImageFilter.GaussianBlur(24))
        shadow.paste((36, 34, 31, 120), mask=sa)
        x = (W - r.width) // 2 + 20 + offset[0]
        sy = round(y) + 22 + offset[1]
        bg.alpha_composite(shadow, (x, sy))
        if opacity == 255:
            bg.alpha_composite(r, ((W - r.width) // 2 + offset[0], round(y) + offset[1]))
        else:
            r.putalpha(r.getchannel("A").point(lambda p: p * opacity // 255))
            bg.alpha_composite(r, ((W - r.width) // 2 + offset[0], round(y) + offset[1]))

    target_y = 55.0
    if frame < 150:
        p = eased((frame - 134) / 16.0)
        y = 1930.0 + (target_y - 1930.0) * p
        with_shadow(cards[0], y, 2.3 - 2.7 * p)
        return bg

    look = 0 if frame < 200 else 1 if frame < 267 else 2 if frame < 334 else 3
    transition_starts = {200: (0, 1), 267: (1, 2), 334: (2, 3)}
    if frame in transition_starts or any(s <= frame < s + 8 for s in transition_starts):
        start = max(s for s in transition_starts if s <= frame)
        old, new = transition_starts[start]
        p = eased((frame - start) / 8.0)
        # Old ticket remains as a tiny exposed layer while the replacement
        # rises from below with a micro-rotation.
        with_shadow(cards[old], target_y - 11 + 11 * p, -0.65 + 0.35 * p, (-8, -8), 255)
        with_shadow(cards[new], target_y + 18 - 18 * p, 0.85 - 1.05 * p, (7, 5), 255)
        return bg
    with_shadow(cards[look], target_y, -0.15, (0, 0), 255)
    return bg


def run() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    intro_src = Image.open(KEYFRAMES / "00-intro-traveler.png").convert("RGB")
    people = [person_cutout(KEYFRAMES / name) for name in (
        "01-pink-dress.png", "02-blue-knit.png", "03-neutral-utility.png", "04-city-classic.png")]
    cards = [ticket_card(i, people[i]) for i in range(4)]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required on PATH")
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
           "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUTPUT)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for frame in range(FRAMES):
            if frame < 134:
                image = fit_intro(intro_src, frame)
            else:
                image = card_frame(cards, frame).convert("RGB")
            proc.stdin.write(image.tobytes())
    finally:
        proc.stdin.close()
    code = proc.wait()
    if code:
        raise RuntimeError(f"ffmpeg encoder failed with exit code {code}")

    contact = OUTPUT.parent / "contact-sheet.jpg"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(OUTPUT), "-vf",
                    "fps=1/2,scale=270:-1:flags=lanczos,tile=4x2:padding=8:margin=8:color=0xf4f1ea",
                    "-frames:v", "1", "-q:v", "3", str(contact)], check=True)
    print(f"Rendered {OUTPUT}")
    print("Frames: 400 at 30 fps (13.333 s target)")


if __name__ == "__main__":
    run()
