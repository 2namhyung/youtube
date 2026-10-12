"""Matte the white Hanoi outfit from its near-white studio background.

This is deliberately specific to the locked 720x1280 Hanoi performance.  A
plain colour key loses the white ao-dai.  The matte below combines that key
with a row-tracked garment envelope: the envelope supplies opaque white cloth
only between observed left/right garment edges, while the original key keeps
the separated arms, hat and feet.  Source RGB is never recoloured.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


SIZE = (720, 1280)
TEST_FRAMES = (180, 192, 204, 216, 227)


def _row_background(rgb: np.ndarray) -> np.ndarray:
    """Estimate the studio colour per row without sampling the central actor."""
    sides = np.concatenate((rgb[:, :120], rgb[:, -120:]), axis=1)
    background = np.median(sides, axis=1)
    return ndimage.gaussian_filter1d(background, 12.0, axis=0, mode="nearest")


def _central_component(seed: np.ndarray) -> np.ndarray:
    """Keep the largest enclosed component that overlaps the actor corridor."""
    closed = ndimage.binary_closing(seed, iterations=3)
    closed = ndimage.binary_opening(closed, iterations=1)
    labels, count = ndimage.label(closed)
    if count == 0:
        return np.zeros_like(seed)
    best_label = 0
    best_score = -1.0
    for label in range(1, count + 1):
        ys, xs = np.where(labels == label)
        if len(xs) < 24:
            continue
        overlap = np.count_nonzero((xs >= 180) & (xs <= 540))
        if not overlap:
            continue
        # Central overlap dominates; total size breaks ties for hands/props.
        score = overlap * 5.0 + len(xs)
        if score > best_score:
            best_score = score
            best_label = label
    return labels == best_label if best_label else np.zeros_like(seed)


def _row_span(row: np.ndarray, centre: int = 350) -> tuple[float, float] | None:
    """Join substantial neighbouring evidence runs around the garment centre."""
    labels, count = ndimage.label(ndimage.binary_closing(row, iterations=3))
    runs: list[tuple[int, int]] = []
    for label in range(1, count + 1):
        xs = np.flatnonzero(labels == label)
        if len(xs) >= 4:
            runs.append((int(xs[0]), int(xs[-1])))
    if not runs:
        return None
    anchor = min(range(len(runs)), key=lambda i: 0 if runs[i][0] <= centre <= runs[i][1]
                 else min(abs(runs[i][0] - centre), abs(runs[i][1] - centre)))
    left = right = anchor
    while left > 0 and runs[left][0] - runs[left - 1][1] <= 58:
        left -= 1
    while right + 1 < len(runs) and runs[right + 1][0] - runs[right][1] <= 58:
        right += 1
    return float(runs[left][0]), float(runs[right][1])


def _garment_envelope(score: np.ndarray, subject: np.ndarray) -> np.ndarray:
    """Recover opaque central cloth without filling arm or foot openings."""
    height, width = score.shape
    ys, xs = np.where(subject)
    if not len(xs):
        return np.zeros_like(score, dtype=np.float32)

    top, bottom = int(ys.min()), int(ys.max())
    # On this locked full-body shot this begins below the elbows and finishes
    # before the separated shoes.  Values are relative to detected actor bounds,
    # so the five tested walking poses do not share a hard absolute cut line.
    start = min(height - 1, top + 300)
    # Limit the reconstruction by both detected bottom and actor-relative
    # height.  The latter prevents the connected floor shadow from extending
    # the garment envelope down across the ticket barcode.
    solid_end = min(height - 1, bottom - 105, top + 875)
    feather_end = min(height - 1, bottom - 45, top + 910)

    evidence = score > 7.0
    raw_left = np.full(height, np.nan, dtype=np.float32)
    raw_right = np.full(height, np.nan, dtype=np.float32)
    for y in range(max(0, start - 24), min(height, feather_end + 1)):
        row = evidence[y, 190:520]
        span = _row_span(row, centre=350 - 190)
        if span is not None:
            raw_left[y] = span[0] + 190
            raw_right[y] = span[1] + 190

    valid = np.flatnonzero(np.isfinite(raw_left) & np.isfinite(raw_right))
    if len(valid) < 8 or solid_end <= start:
        return np.zeros_like(score, dtype=np.float32)
    all_y = np.arange(height)
    left = np.interp(all_y, valid, raw_left[valid])
    right = np.interp(all_y, valid, raw_right[valid])
    left = ndimage.median_filter(left, size=15, mode="nearest")
    right = ndimage.median_filter(right, size=15, mode="nearest")
    left = ndimage.gaussian_filter1d(left, 3.0, mode="nearest")
    right = ndimage.gaussian_filter1d(right, 3.0, mode="nearest")
    # Do not let isolated studio gradients make a broad white rectangle.
    left = np.clip(left, 205, 455)
    right = np.clip(right, left + 45, 495)

    mask = np.zeros((height, width), dtype=bool)
    for y in range(start, max(start, solid_end + 1)):
        l, r = int(round(left[y])), int(round(right[y]))
        mask[y, l:r + 1] = True

    # Below the solid garment, retain individual observed runs and close only
    # narrow cloth gaps.  This continues the silhouette without bridging feet.
    for y in range(max(start, solid_end + 1), feather_end + 1):
        l, r = int(round(left[y])), int(round(right[y]))
        local = score[y, l:r + 1] > 4.5
        local = ndimage.binary_closing(local, iterations=18)
        mask[y, l:r + 1] |= local
        # A short (not full lower-band) taper avoids a seam without turning the
        # floor shadow into an opaque white wedge.
        carry = max(0.0, 1.0 - (y - solid_end) / 16.0)
        if carry > 0.0:
            inset = int(round((1.0 - carry) * 28.0))
            if r - l > inset * 2:
                mask[y, l + inset:r - inset + 1] = True

    # One-pixel antialiasing at the actual silhouette, not a broad blur/halo.
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    return np.clip(0.5 + (inside - outside) / 2.0, 0.0, 1.0).astype(np.float32)


def matte(frame: np.ndarray, frame_index: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Return unchanged RGB and a robust actor alpha for one Hanoi frame."""
    del frame_index  # Accepted for renderer diagnostics/future temporal caching.
    if frame.shape != (SIZE[1], SIZE[0], 3):
        raise ValueError(f"expected 1280x720 RGB frame, got {frame.shape}")
    rgb = frame.astype(np.float32)
    background = _row_background(rgb)
    residual = np.max(np.abs(rgb - background[:, None, :]), axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)

    subject = _central_component(np.maximum(residual, chroma * 1.4) > 14.0)
    subject = ndimage.binary_fill_holes(subject)
    ys = np.where(subject)[0]
    if len(ys):
        # The studio contact shadow is connected to the shoes and therefore
        # survives a component filter.  In the final lower band require real
        # material colour/contrast, then let the garment envelope cover only
        # the white trouser pixels immediately above it.
        floor_start = min(SIZE[1], int(ys.min()) + 850)
        material = (chroma > 9.0) | (residual > 35.0)
        material = ndimage.binary_closing(material, iterations=2)
        material = ndimage.binary_dilation(material, iterations=1)
        subject[floor_start:] &= material[floor_start:]
    # Preserve narrow outer details with a one-pixel edge.  Avoid unpremultiply:
    # the source pixels are already correct and amplification creates white rims.
    inside = ndimage.distance_transform_edt(subject)
    outside = ndimage.distance_transform_edt(~subject)
    base_alpha = np.clip(0.5 + (inside - outside) / 2.0, 0.0, 1.0).astype(np.float32)
    garment_alpha = _garment_envelope(residual, subject)
    alpha = np.maximum(base_alpha, garment_alpha)
    return frame.copy(), alpha


def _decode_frame(video: Path, index: int) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"select=eq(n\\,{index})",
           "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    result = subprocess.run(cmd, check=True, capture_output=True)
    expected = SIZE[0] * SIZE[1] * 3
    if len(result.stdout) != expected:
        raise RuntimeError(f"frame {index}: decoded {len(result.stdout)} bytes, expected {expected}")
    return np.frombuffer(result.stdout, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()


def _debug(video: Path, ticket: Path, output: Path) -> None:
    card = np.asarray(Image.open(ticket).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS))
    panels: list[Image.Image] = []
    for index in TEST_FRAMES:
        frame = _decode_frame(video, index)
        rgb, alpha = matte(frame, index)
        composite = np.rint(rgb * alpha[..., None] + card * (1.0 - alpha[..., None])).astype(np.uint8)
        alpha_rgb = np.repeat(np.rint(alpha[..., None] * 255).astype(np.uint8), 3, axis=2)
        panel = Image.new("RGB", (SIZE[0] * 2, SIZE[1]), "white")
        panel.paste(Image.fromarray(composite), (0, 0))
        panel.paste(Image.fromarray(alpha_rgb), (SIZE[0], 0))
        draw = ImageDraw.Draw(panel)
        draw.rectangle((0, 0, 230, 40), fill=(0, 0, 0))
        draw.text((12, 9), f"frame {index}: composite | alpha", fill=(255, 255, 255), font=ImageFont.load_default())
        panels.append(panel.resize((504, 448), Image.Resampling.LANCZOS))
    sheet = Image.new("RGB", (504 * len(panels), 448), "white")
    for i, panel in enumerate(panels):
        sheet.paste(panel, (i * 504, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94, subsampling=0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--ticket", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    _debug(args.video, args.ticket, args.output)


if __name__ == "__main__":
    main()
