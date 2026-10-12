"""Build hard-edged, green-screen person plates from the existing stills.

The Flow generations used previously were composited from near-white stills.
That bakes a white matte into the moving silhouette, which is the source of
the visible halo.  This script creates a deterministic plate set instead:

* the background is exactly RGB(0, 255, 0),
* the visible person box is the same in every plate,
* the outer 4 source pixels are removed and replaced from the interior, and
* the edge has only a sub-pixel antialias (no soft white feather).

The plates are intentionally person-only.  Ticket art remains a separate
layer and is added by ``compose_chromakey_ticket_reel.py``.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = ROOT / "assets" / "image-first" / "characters"
INTRO = ROOT / "assets" / "keyframes" / "00-intro-traveler.png"
OUT = ROOT / "assets" / "clean-plates"
SIZE = (720, 1280)
# Identical visible person bbox for all five outputs (x1, y1, x2, y2).
PERSON_BOX = (150, 170, 570, 1180)
GREEN = np.array([0, 255, 0], dtype=np.uint8)
ERODE_PX = 4
# Source rows below these limits are studio-floor shadows rather than the
# actor.  Trimming them before fitting prevents a white floor strip becoming
# part of the normalized silhouette.
BOTTOM_LIMITS = {
    "K0": 1490,
    "K1": 1504,
    "K2": 1492,
    "K3": 1508,
    "K4": 1504,
}


def _hanoi_protection(size: tuple[int, int]) -> np.ndarray:
    """Protect the white áo dài from the white studio background."""
    w, h = size
    # Coordinates are normalized from the source silhouette.  Keeping this
    # polygon conservative is preferable to retaining a white halo.
    points = [
        (438, 258), (330, 325), (292, 420), (350, 470), (266, 476),
        (236, 560), (302, 625), (356, 603), (335, 760), (292, 970),
        (220, 1190), (170, 1395), (270, 1515), (355, 1548),
        (432, 1494), (470, 1590), (555, 1593), (635, 1518),
        (735, 1440), (760, 1280), (694, 1040), (650, 820),
        (680, 695), (730, 620), (700, 500), (625, 470),
        (590, 462), (655, 420), (610, 325),
    ]
    sx, sy = w / 941.0, h / 1672.0
    scaled = [(round(x * sx), round(y * sy)) for x, y in points]
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(scaled, fill=255)
    return np.asarray(mask, dtype=bool)


def _subject_mask(image: Image.Image, hanoi: bool) -> np.ndarray:
    """Find the border-disconnected subject without using a white matte."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    # Estimate the studio field from all four borders.  The distance test is
    # deliberately conservative; flood fill prevents isolated white garment
    # pixels from being treated as background unless they touch the border.
    border = np.concatenate(
        (rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]), axis=0
    )
    bg_color = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - bg_color, axis=2)
    luminance = rgb.mean(axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    candidate = (distance < 22.0) & (luminance > 180.0) & (saturation < 58.0)
    seed = np.zeros(candidate.shape, dtype=bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    background = ndimage.binary_propagation(seed, mask=candidate)
    subject = ~background
    if hanoi:
        subject |= _hanoi_protection(image.size)
    subject = ndimage.binary_closing(subject, structure=np.ones((3, 3)))
    subject = ndimage.binary_fill_holes(subject)
    # Keep the main silhouette and attached props; eliminate tiny detached
    # specks caused by studio texture.
    labels, count = ndimage.label(subject)
    if count:
        sizes = np.bincount(labels.ravel())
        keep = sizes >= max(12, int(subject.size * 0.00001))
        keep[0] = False
        subject = keep[labels]
    return subject


def _interior_color(rgb: np.ndarray, subject: np.ndarray) -> np.ndarray:
    """Replace contaminated edge RGB with the nearest eroded interior RGB."""
    core = ndimage.binary_erosion(subject, iterations=ERODE_PX, border_value=0)
    if not core.any():
        raise ValueError("Subject mask vanished during erosion")
    _, indices = ndimage.distance_transform_edt(~core, return_indices=True)
    clean = rgb.copy()
    shell = subject & ~core
    clean[shell] = rgb[indices[0][shell], indices[1][shell]]
    return clean, core


def _fit_plate(source: Path, name: str) -> Image.Image:
    image = Image.open(source).convert("RGB")
    mask = _subject_mask(image, hanoi="hanoi" in name)
    tag = name[:2]
    if tag in BOTTOM_LIMITS:
        mask[BOTTOM_LIMITS[tag] :] = False
    # Compute the crop from the eroded global silhouette.  Cropping from the
    # raw mask can include a detached floor speck; that speck becomes a large
    # empty margin after the fixed-size resize and makes one actor look
    # narrower than the others.
    clean_global, core_global = _interior_color(np.asarray(image), mask)
    bbox = Image.fromarray(core_global.astype(np.uint8) * 255).getbbox()
    if not bbox:
        raise ValueError(f"No subject found in {source}")
    clean_rgb = clean_global[bbox[1] : bbox[3], bbox[0] : bbox[2]]
    core = core_global[bbox[1] : bbox[3], bbox[0] : bbox[2]]
    target_w = PERSON_BOX[2] - PERSON_BOX[0]
    target_h = PERSON_BOX[3] - PERSON_BOX[1]
    # Resize RGB and mask separately to keep the alpha boundary deterministic.
    rgb_img = Image.fromarray(clean_rgb, mode="RGB").resize(
        (target_w, target_h), Image.Resampling.LANCZOS
    )
    mask_img = Image.fromarray((core.astype(np.uint8) * 255), mode="L").resize(
        (target_w, target_h), Image.Resampling.LANCZOS
    )
    alpha = np.asarray(mask_img, dtype=np.float32) / 255.0
    alpha = np.clip(alpha, 0.0, 1.0)[..., None]
    fg = np.asarray(rgb_img, dtype=np.float32)
    out = np.broadcast_to(GREEN, (target_h, target_w, 3)).astype(np.float32).copy()
    out = np.round(fg * alpha + out * (1.0 - alpha)).astype(np.uint8)
    canvas = np.broadcast_to(GREEN, (SIZE[1], SIZE[0], 3)).copy()
    canvas[PERSON_BOX[1] : PERSON_BOX[3], PERSON_BOX[0] : PERSON_BOX[2]] = out
    result = Image.fromarray(canvas, mode="RGB")
    result.save(OUT / f"{name}.png", format="PNG", optimize=False)
    # Save a binary mask beside each plate for debugging and later keying.
    mask_canvas = np.zeros((SIZE[1], SIZE[0]), dtype=np.uint8)
    mask_canvas[PERSON_BOX[1] : PERSON_BOX[3], PERSON_BOX[0] : PERSON_BOX[2]] = (
        np.asarray(mask_img) > 127
    ).astype(np.uint8) * 255
    Image.fromarray(mask_canvas, mode="L").save(OUT / f"{name}-mask.png")
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = [
        ("K0-casual", INTRO),
        ("K1-seoul-hanbok", CHAR_DIR / "01-seoul-hanbok.png"),
        ("K2-tokyo-kimono", CHAR_DIR / "02-tokyo-kimono.png"),
        ("K3-shanghai-qipao", CHAR_DIR / "03-shanghai-qipao.png"),
        ("K4-hanoi-ao-dai", CHAR_DIR / "04-hanoi-ao-dai.png"),
    ]
    plates = [_fit_plate(path, name) for name, path in sources]
    thumb_w, thumb_h = 144, 256
    sheet = Image.new("RGB", (thumb_w * len(plates), thumb_h), tuple(int(v) for v in GREEN))
    for i, plate in enumerate(plates):
        sheet.paste(ImageOps.contain(plate, (thumb_w, thumb_h)), (i * thumb_w, 0))
    sheet.save(OUT / "clean-plates-contact-sheet.png", format="PNG", optimize=False)
    print(f"Built {len(plates)} clean plates in {OUT}")


if __name__ == "__main__":
    main()
