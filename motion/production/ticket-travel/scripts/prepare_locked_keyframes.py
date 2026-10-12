"""Build fixed-layout 9:16 master frames for Flow Frames-to-Video.

Source images are kept unchanged. Character images are photographed against a
near-white studio field, so a conservative border-connected background mask is
used before compositing. The output is intentionally deterministic: every
frame shares the same character anchor, feet baseline, and ticket geometry.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SRC_CHAR = ROOT / "assets" / "image-first" / "characters"
SRC_TICKET = ROOT / "assets" / "image-first" / "tickets"
SRC_INTRO = ROOT / "assets" / "keyframes" / "00-intro-traveler.png"
OUT = ROOT / "assets" / "locked-keyframes"
SIZE = (1080, 1920)

# The character is centered in the same 590 px-wide slot in all master frames.
# Its bottom is deliberately above the canvas edge to leave a stable floor line.
CHAR_BOX = (245, 260, 835, 1765)


def _studio_cutout(path: Path) -> Image.Image:
    """Return a soft RGBA cutout from the source's near-white studio field."""
    image = Image.open(path).convert("RGB")
    arr = np.asarray(image, dtype=np.float32)
    # Large blur follows the gentle studio gradient while retaining the subject.
    smooth = ndimage.gaussian_filter(arr, sigma=(32, 32, 0))
    delta = np.max(np.abs(arr - smooth), axis=2)
    luminance = arr.mean(axis=2)
    saturation = arr.max(axis=2) - arr.min(axis=2)
    # Only pixels plausibly belonging to the background can be flood-filled.
    bg_candidate = (delta < 11.0) & (luminance > 185.0) & (saturation < 42.0)
    seed = np.zeros(bg_candidate.shape, dtype=bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    bg = ndimage.binary_propagation(seed, mask=bg_candidate)
    subject = ~bg
    # Fill small holes inside garments and soften only the silhouette edge.
    subject = ndimage.binary_closing(subject, structure=np.ones((3, 3)))
    subject = ndimage.binary_fill_holes(subject)
    # The Hanoi source intentionally uses white-on-white clothing. Protect a
    # conservative hand-traced silhouette so its dress remains opaque when the
    # ticket is placed underneath it.
    if path.name == "04-hanoi-ao-dai.png":
        manual = Image.new("L", image.size, 0)
        draw = ImageDraw.Draw(manual)
        draw.polygon(
            [(438, 258), (330, 325), (292, 420), (350, 470), (266, 476),
             (236, 560), (302, 625), (356, 603), (335, 760), (292, 970),
             (220, 1190), (170, 1395), (270, 1515), (355, 1548),
             (432, 1494), (470, 1590), (555, 1593), (635, 1518),
             (735, 1440), (760, 1280), (694, 1040), (650, 820),
             (680, 695), (730, 620), (700, 500), (625, 470),
             (590, 462), (655, 420), (610, 325)],
            fill=255,
        )
        subject |= np.asarray(manual, dtype=bool)
    alpha = Image.fromarray((subject.astype(np.uint8) * 255), mode="L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def _fit_subject(source: Image.Image) -> Image.Image:
    """Fit the visible subject into the shared canvas slot."""
    bbox = source.getchannel("A").getbbox()
    if not bbox:
        raise ValueError(f"No subject detected in {source}")
    crop = source.crop(bbox)
    target_w = CHAR_BOX[2] - CHAR_BOX[0]
    target_h = CHAR_BOX[3] - CHAR_BOX[1]
    fitted = ImageOps.contain(crop, (target_w, target_h), method=Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", SIZE, (255, 255, 255, 0))
    x = CHAR_BOX[0] + (target_w - fitted.width) // 2
    y = CHAR_BOX[3] - fitted.height
    layer.alpha_composite(fitted, (x, y))
    return layer


def _ticket(path: Path) -> Image.Image:
    """Normalize ticket art to the exact output canvas without re-rendering text."""
    source = Image.open(path).convert("RGBA")
    if source.size != SIZE:
        source = ImageOps.fit(source, SIZE, method=Image.Resampling.LANCZOS)
    return source


def _compose(name: str, character: Path, ticket: Path | None = None) -> Image.Image:
    canvas = Image.new("RGBA", SIZE, (255, 255, 255, 255))
    if ticket:
        canvas.alpha_composite(_ticket(ticket))
    subject = _fit_subject(_studio_cutout(character))
    canvas.alpha_composite(subject)
    result = canvas.convert("RGB")
    result.save(OUT / f"{name}.png", format="PNG", optimize=False)
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames = [
        _compose("K0-casual-intro", SRC_INTRO),
        _compose("K1-seoul-hanbok", SRC_CHAR / "01-seoul-hanbok.png", SRC_TICKET / "01-seoul-ticket.png"),
        _compose("K2-tokyo-kimono", SRC_CHAR / "02-tokyo-kimono.png", SRC_TICKET / "02-tokyo-ticket.png"),
        _compose("K3-shanghai-qipao", SRC_CHAR / "03-shanghai-qipao.png", SRC_TICKET / "03-shanghai-ticket.png"),
        _compose("K4-hanoi-ao-dai", SRC_CHAR / "04-hanoi-ao-dai.png", SRC_TICKET / "04-hanoi-ticket.png"),
    ]
    thumb_w = 216
    thumb_h = 384
    sheet = Image.new("RGB", (thumb_w * len(frames), thumb_h + 28), "white")
    for i, frame in enumerate(frames):
        sheet.paste(ImageOps.contain(frame, (thumb_w, thumb_h)), (i * thumb_w, 0))
    sheet.save(OUT / "contact-sheet.png", format="PNG", optimize=False)


if __name__ == "__main__":
    main()
