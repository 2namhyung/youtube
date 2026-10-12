"""Build a deterministic RGBA probe plate from the generated blue-screen still."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source.png"
OUT = ROOT / "probe-plate-rgba.png"
MASK_OUT = ROOT / "probe-plate-mask.png"
QC_OUT = ROOT / "probe-plate-qc.json"
SIZE = (1080, 1920)

# The source is 941x1672 and has the same portrait ratio as the target. Keep
# one explicit, uniform transform so subsequent composites are reproducible.
SOURCE_SIZE = (941, 1672)
SCALE = SIZE[1] / SOURCE_SIZE[1]
TX = (SIZE[0] - SOURCE_SIZE[0] * SCALE) / 2.0
TY = 0.0
BG_DISTANCE = 130.0
ERODE_PX = 1


def subject_mask(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return border-disconnected subject and estimated blue-screen color."""
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]), axis=0)
    bg = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - bg, axis=2)
    # The second test protects saturated blue wardrobe details from being
    # treated as screen color; flood fill still handles all blue-screen shades.
    blue_dominance = rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1])
    screen = (distance <= BG_DISTANCE) & (blue_dominance >= 75.0)
    seed = np.zeros(screen.shape, dtype=bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    background = ndimage.binary_propagation(seed, mask=screen)
    subject = ~background
    # Do not fill enclosed holes: the blue gap between the sleeve and skirt
    # is real background and must stay transparent in the RGBA plate.
    labels, count = ndimage.label(subject)
    if count:
        sizes = np.bincount(labels.ravel())
        keep = sizes >= max(16, int(subject.size * 0.00001))
        keep[0] = False
        subject = keep[labels]
    return subject, bg


def edge_decontaminate(rgb: np.ndarray, subject: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Copy RGB for the one-pixel shell from the nearest eroded interior."""
    core = ndimage.binary_erosion(subject, iterations=ERODE_PX, border_value=0)
    if not core.any():
        raise ValueError("subject mask vanished during matte shrink")
    _, nearest = ndimage.distance_transform_edt(~core, return_indices=True)
    clean = rgb.copy()
    shell = subject & ~core
    clean[shell] = rgb[nearest[0][shell], nearest[1][shell]]
    # The antialias band is centered on the shrunken matte, so its outer half
    # is technically outside ``subject``. Pull that band from the same clean
    # interior too; otherwise transparent-edge RGB would retain blue-screen
    # contamination and produce a visible fringe on dark backgrounds.
    inside = ndimage.distance_transform_edt(core)
    outside = ndimage.distance_transform_edt(~core)
    partial = (inside - outside > -0.5) & (inside - outside < 0.5)
    clean[partial] = rgb[nearest[0][partial], nearest[1][partial]]
    return clean, core


def fixed_transform(image: Image.Image, mask: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Fit source to the 1080x1920 canvas with the fixed uniform transform."""
    # This is equivalent to scale=SCALE, translate=(TX, TY), with Lanczos
    # resampling. The half-pixel horizontal crop is intentional and fixed.
    scaled_size = (round(image.width * SCALE), round(image.height * SCALE))
    # Resize premultiplied RGB and alpha separately. Straight RGB resizing
    # would pull blue pixels from the transparent surround into the edge.
    rgb_arr = np.asarray(image, dtype=np.float32)
    alpha_arr = np.asarray(mask, dtype=np.float32) / 255.0
    premult = np.round(rgb_arr * alpha_arr[..., None]).clip(0, 255).astype(np.uint8)
    rgb = Image.fromarray(premult, "RGB").resize(scaled_size, Image.Resampling.LANCZOS)
    alpha = mask.resize(scaled_size, Image.Resampling.LANCZOS)
    canvas_rgb = Image.new("RGB", SIZE, (0, 0, 0))
    canvas_alpha = Image.new("L", SIZE, 0)
    canvas_rgb.paste(rgb, (round(TX), round(TY)))
    canvas_alpha.paste(alpha, (round(TX), round(TY)))
    premult_canvas = np.asarray(canvas_rgb, dtype=np.float32)
    alpha_canvas = np.asarray(canvas_alpha, dtype=np.float32) / 255.0
    straight = np.zeros_like(premult_canvas, dtype=np.uint8)
    visible = alpha_canvas > 1e-5
    straight[visible] = np.clip(
        np.round(premult_canvas[visible] / alpha_canvas[visible, None]), 0, 255
    ).astype(np.uint8)
    return Image.fromarray(straight, "RGB"), Image.fromarray(
        np.round(alpha_canvas * 255.0).clip(0, 255).astype(np.uint8), "L"
    )


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(source, dtype=np.float32)
    subject, bg = subject_mask(rgb)
    clean_rgb, core = edge_decontaminate(rgb, subject)

    # Signed-distance alpha gives a one-pixel antialiased transition while
    # keeping the shrunk matte fully opaque in the interior.
    inside = ndimage.distance_transform_edt(core)
    outside = ndimage.distance_transform_edt(~core)
    signed = inside - outside
    alpha = np.clip(0.5 + signed, 0.0, 1.0)
    # Pixels not in the matte remain exactly transparent regardless of RGB.
    alpha[~core & (outside > 0.5)] = 0.0

    transformed_rgb, transformed_alpha = fixed_transform(
        Image.fromarray(np.clip(np.round(clean_rgb), 0, 255).astype(np.uint8), "RGB"),
        Image.fromarray(np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8), "L"),
    )
    # Avoid retaining blue RGB in fully transparent pixels and keep output
    # straight-alpha RGBA for broad compositor compatibility.
    rgba = np.dstack((np.asarray(transformed_rgb), np.asarray(transformed_alpha)))
    rgba[rgba[..., 3] == 0, :3] = 0
    Image.fromarray(rgba, "RGBA").save(OUT, format="PNG", optimize=False)
    Image.fromarray(np.asarray(transformed_alpha), "L").save(MASK_OUT, format="PNG", optimize=False)

    a = rgba[..., 3]
    visible = a > 0
    bbox = Image.fromarray(a, "L").getbbox()
    edge = (a > 0) & (a < 255)
    edge_pixels = rgba[edge, :3]
    blue_edge = int(np.sum((edge_pixels[:, 2] - np.maximum(edge_pixels[:, 0], edge_pixels[:, 1])) > 45)) if edge_pixels.size else 0
    screen_like_edge = int(
        np.sum(np.linalg.norm(edge_pixels.astype(np.float32) - bg, axis=1) < 85.0)
    ) if edge_pixels.size else 0
    transparent_rgb_nonzero = int(np.sum((a == 0) & np.any(rgba[..., :3] != 0, axis=2)))
    qc = {
        "source": str(SOURCE),
        "output": str(OUT),
        "size": list(SIZE),
        "mode": "RGBA",
        "transform": {"scale": SCALE, "translate": [round(TX, 6), TY], "resampling": "LANCZOS"},
        "estimated_background_rgb": [float(x) for x in bg],
        "subject_bbox_source_xyxy": list(Image.fromarray(subject.astype(np.uint8) * 255, "L").getbbox()),
        "subject_bbox_output_xyxy": list(bbox) if bbox else None,
        "visible_pixel_count": int(visible.sum()),
        "opaque_pixel_count": int((a == 255).sum()),
        "partial_alpha_pixel_count": int(edge.sum()),
        "transparent_pixel_count": int((a == 0).sum()),
        "partial_alpha_blue_dominant_pixels": blue_edge,
        "partial_alpha_screen_like_pixels_d85": screen_like_edge,
        "transparent_rgb_nonzero_pixels": transparent_rgb_nonzero,
        "alpha_min_max": [int(a.min()), int(a.max())],
        # Stable measurement windows on the source mask (head and footwear).
        "head_bbox_output_xyxy": [int(round(397 * SCALE + TX)), int(round(193 * SCALE)), int(round(574 * SCALE + TX)), int(round(400 * SCALE))],
        "feet_bbox_output_xyxy": [int(round(203 * SCALE + TX)), int(round(1350 * SCALE)), int(round(739 * SCALE + TX)), int(round(1492 * SCALE))],
    }
    QC_OUT.write_text(json.dumps(qc, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(qc, indent=2))


if __name__ == "__main__":
    main()
