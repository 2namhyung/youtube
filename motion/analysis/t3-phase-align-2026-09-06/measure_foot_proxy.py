"""Small, explainable foot/hem proxy measurements for candidate phase windows.

This is intentionally not a pose model: it reports bottom-of-frame colored/shoe
pixel centroids in two actor-side x bands.  The CSV is supporting evidence for
visual inspection and flags Shanghai as low-confidence because white shoes blend
with the background.
"""
from __future__ import annotations

import csv
import subprocess
from pathlib import Path

import numpy as np
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
SOURCES = {"tokyo": PERF / "tokyo-parasol-10s.mp4", "shanghai": PERF / "shanghai-fan-10s.mp4"}
W, H, FPS = 720, 1280, 24


def frames(path: Path):
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"], stdout=subprocess.PIPE)
    assert p.stdout is not None
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) != n:
            break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    p.stdout.close()
    p.wait()


def proxy(img: np.ndarray, city: str) -> tuple[float, float, float, float, int]:
    # Feet/shadows occupy the bottom ~230px.  Side bands prevent the dress hem
    # from becoming the only measurement.  Shanghai shoes are low-confidence.
    a = img[1040:1255, 175:360]
    b = img[1040:1255, 360:545]
    if city == "tokyo":
        masks = [np.max(q, axis=2) < 150 for q in (a, b)]
    else:
        # Beige skin/shoe against near-white background; exclude saturated green.
        masks = [((q[:, :, 0] < 238) | (q[:, :, 1] < 232) | (q[:, :, 2] < 225)) &
                 ((np.max(q, axis=2) - np.min(q, axis=2)) < 55) for q in (a, b)]
    vals = []
    for xoff, mask in zip((175, 360), masks):
        labels, count = ndimage.label(mask)
        comps = []
        for lab in range(1, count + 1):
            yy, xx = np.where(labels == lab)
            if len(xx) >= 3:
                comps.append((len(xx), float(np.mean(xx + xoff)), float(np.mean(yy + 1040))))
        comps.sort(reverse=True)
        if comps:
            area, cx, cy = comps[0]
        else:
            area, cx, cy = 0.0, float("nan"), float("nan")
        vals.extend((cx, cy, area))
    return vals[0], vals[1], vals[3], vals[4], int(vals[2] + vals[5])


def main():
    rows = []
    for city, path in SOURCES.items():
        all_frames = list(frames(path))
        # Dense complete source track plus a few candidate cut offsets.
        for i, img in enumerate(all_frames):
            if i % 1:
                continue
            lcx, lcy, rcx, rcy, area = proxy(img, city)
            rows.append({"city": city, "source_frame": i, "source_time": round(i / FPS, 6),
                         "left_band_x": round(lcx, 2), "left_band_y": round(lcy, 2),
                         "right_band_x": round(rcx, 2), "right_band_y": round(rcy, 2),
                         "proxy_area": area,
                         "confidence": "low" if city == "shanghai" else "medium"})
    out = HERE / "foot_proxy_measurements.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader(); w.writerows(rows)
    print(f"wrote {out} ({len(rows)} frame rows)")


if __name__ == "__main__":
    main()
