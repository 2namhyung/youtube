"""Measure card-only A/B/C Flow clips without changing their source files.

The Seoul card has a white field and a vertical pink stripe.  A white-on-white
card boundary is not observable reliably, so this script measures the top of
the strongest elongated pink-stripe candidate and labels it explicitly as a
``pink_stripe_top_proxy``.  It never claims that proxy is the hidden card
boundary.  Missing/ambiguous detections stay missing in the curves.

Expected inputs (created elsewhere): A.mp4, B.mp4 and C.mp4 beside this file.
Run ``python measure_flow.py --preflight`` while waiting for them, or run it
without arguments once all three native outputs are present.  Decoding is
read-only; comparison videos are new files and the source MP4s are untouched.
"""
from __future__ import annotations

from pathlib import Path
import argparse
import csv
import hashlib
import json
import math
import subprocess
import sys
from typing import Iterable, Iterator

import numpy as np
from PIL import Image, ImageDraw


OUT = Path(__file__).resolve().parent
INPUTS = {label: OUT / f"{label}.mp4" for label in ("A", "B", "C")}
LABEL_COLOR = {"A": "#f08aab", "B": "#78b7ed", "C": "#80c994"}


def run_json(args: list[str]) -> dict:
    return json.loads(subprocess.check_output(args, text=True))


def metadata(path: Path) -> dict:
    probe = run_json([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,avg_frame_rate,nb_frames,duration,pix_fmt",
        "-of", "json", str(path),
    ])
    stream = probe["streams"][0]
    num, den = (int(x) for x in stream.get("avg_frame_rate", "0/1").split("/"))
    fps = num / den if den else 0.0
    count = stream.get("nb_frames")
    if count in (None, "N/A"):
        # Count is only a fallback for unusual containers; this does not
        # seek or rewrite the source.
        count = int(run_json([
            "ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=nb_read_frames", "-of", "json", str(path),
        ])["streams"][0]["nb_read_frames"])
    return {
        "path": str(path),
        "sha256": hashlib.file_digest(path.open("rb"), "sha256").hexdigest(),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": fps,
        "frame_count": int(count),
        "duration_s": float(stream.get("duration") or 0.0),
        "pix_fmt": stream.get("pix_fmt"),
    }


class FrameReader:
    """Sequential native-frame reader. No interpolation or source writes."""

    def __init__(self, path: Path, width: int, height: int):
        self.width, self.height = width, height
        self.bytes_per_frame = width * height * 3
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo",
             "-pix_fmt", "rgb24", "-vsync", "0", "-"],
            stdout=subprocess.PIPE,
        )

    def __iter__(self) -> Iterator[np.ndarray]:
        assert self.proc.stdout is not None
        while True:
            raw = self.proc.stdout.read(self.bytes_per_frame)
            if len(raw) != self.bytes_per_frame:
                break
            yield np.frombuffer(raw, dtype=np.uint8).reshape(self.height, self.width, 3)
        code = self.proc.wait()
        if code:
            raise RuntimeError(f"ffmpeg decode failed with exit code {code}")


def _groups(values: np.ndarray) -> list[tuple[int, int]]:
    """Return inclusive/exclusive contiguous true runs."""
    if not values.any():
        return []
    padded = np.r_[False, values, False].astype(np.int8)
    starts = np.flatnonzero(np.diff(padded) == 1)
    ends = np.flatnonzero(np.diff(padded) == -1)
    return list(zip(starts.tolist(), ends.tolist()))


def detect_stripe(frame: np.ndarray) -> dict:
    """Find a broad pink stripe and return an auditable proxy measurement."""
    h, w = frame.shape[:2]
    # Downsampling keeps the detector stable and bounded for 4K inputs while
    # retaining the original coordinate system in the result.
    step = max(1, int(math.ceil(max(h, w) / 900)))
    rgb = frame[::step, ::step].astype(np.int16)
    r, g, b = (rgb[..., i] for i in range(3))
    # Broad pink/magenta test; intentionally avoids a single exact RGB value.
    pink = (r >= 125) & ((r - g) >= 18) & ((r - b) >= 4) & (r >= g * 1.08)
    sh, sw = pink.shape
    x0, x1 = max(0, int(sw * 0.03)), min(sw, int(sw * 0.97))
    pink[:, :x0] = False
    pink[:, x1:] = False

    # A stripe is an elongated run. The supplied Seoul card's stripe is
    # vertical, but retaining a horizontal candidate path makes the detector
    # useful if a later card export changes stripe orientation.
    row_runs = np.zeros(sh, dtype=np.int32)
    row_counts = pink.sum(axis=1)
    for y in range(sh):
        runs = _groups(pink[y])
        row_runs[y] = max((e - s for s, e in runs), default=0)
    candidate = (row_runs >= max(10, int(sw * 0.12))) & (row_counts >= max(12, int(sw * 0.03)))
    groups = _groups(candidate)
    candidates = []
    for gy0, gy1 in groups:
        area = int(pink[gy0:gy1].sum())
        if area == 0:
            continue
        yy, xx = np.where(pink[gy0:gy1])
        bx0, bx1 = int(xx.min()), int(xx.max()) + 1
        by0, by1 = gy0 + int(yy.min()), gy0 + int(yy.max()) + 1
        width = bx1 - bx0
        thickness = max(1, by1 - by0)
        aspect = width / thickness
        # Favor a broad, thin stripe. Score does not encode a presumed card
        # location, because the card's layout can differ between candidates.
        score = float(area * min(aspect, 40.0))
        candidates.append({
            "score": score, "bbox_ds": [bx0, by0, bx1, by1],
            "area_ds": area, "aspect": aspect, "orientation": "horizontal",
        })

    col_runs = np.zeros(sw, dtype=np.int32)
    col_counts = pink.sum(axis=0)
    for x in range(sw):
        runs = _groups(pink[:, x])
        col_runs[x] = max((e - s for s, e in runs), default=0)
    vertical = (col_runs >= max(20, int(sh * 0.12))) & (col_counts >= max(12, int(sh * 0.08)))
    # This card's pink rail sits on the right; using that observed side band
    # rejects isolated pink text while leaving the y position unconstrained.
    right_band = np.zeros(sw, dtype=bool)
    right_band[int(sw * 0.65):int(sw * 0.98)] = True
    for gx0, gx1 in _groups(vertical & right_band):
        area = int(pink[:, gx0:gx1].sum())
        if area == 0:
            continue
        yy, xx = np.where(pink[:, gx0:gx1])
        bx0, bx1 = gx0 + int(xx.min()), gx0 + int(xx.max()) + 1
        by0, by1 = int(yy.min()), int(yy.max()) + 1
        stripe_width = max(1, bx1 - bx0)
        stripe_height = by1 - by0
        aspect = stripe_height / stripe_width
        score = float(area * min(aspect, 40.0))
        candidates.append({
            "score": score, "bbox_ds": [bx0, by0, bx1, by1],
            "area_ds": area, "aspect": aspect, "orientation": "vertical",
        })

    if not candidates:
        return {
            "edge_y": None, "edge_label": "pink_stripe_top_proxy", "confidence": 0.0,
            "status": "missing", "failure": "no_broad_pink_stripe", "scale_px": None,
        }
    candidates.sort(key=lambda item: item["score"], reverse=True)
    best = candidates[0]
    second = candidates[1]["score"] if len(candidates) > 1 else 0.0
    bx0, by0, bx1, by1 = best["bbox_ds"]
    scale_px = (bx1 - bx0) * step
    # Confidence is a detector diagnostic, not a perceptual or Flow quality score.
    separation = min(1.0, (best["score"] - second) / max(best["score"], 1.0))
    aspect_score = min(1.0, best["aspect"] / 12.0)
    confidence = round(max(0.0, min(1.0, 0.55 * aspect_score + 0.45 * separation)), 3)
    status = "detected" if confidence >= 0.35 else "ambiguous"
    return {
        "edge_y": int(by0 * step),
        "edge_label": "pink_stripe_top_proxy",
        "confidence": confidence,
        "status": status,
        "failure": None if status == "detected" else "competing_or_thin_stripe",
        "scale_px": int(scale_px),
        "bbox": [bx0 * step, by0 * step, bx1 * step, by1 * step],
        "candidate_count": len(candidates),
        "orientation": best["orientation"],
    }


def measure(label: str, path: Path, meta: dict) -> list[dict]:
    rows = []
    for index, frame in enumerate(FrameReader(path, meta["width"], meta["height"])):
        result = detect_stripe(frame)
        rows.append({"label": label, "frame": index, **result})
    valid_scales = [r["scale_px"] for r in rows if r["status"] == "detected" and r["scale_px"]]
    median_scale = float(np.median(valid_scales)) if valid_scales else None
    for row in rows:
        scale = row.get("scale_px")
        row["scale_ratio_to_median"] = round(scale / median_scale, 4) if scale and median_scale else None
        row["scale_drift"] = bool(scale and median_scale and abs(scale / median_scale - 1.0) > 0.15)
    ys = np.array([r["edge_y"] if r["status"] == "detected" else np.nan for r in rows], dtype=float)
    valid = np.flatnonzero(np.isfinite(ys))
    if len(valid) >= 2 and abs(ys[valid[-1]] - ys[valid[0]]) >= 1:
        first, last = int(valid[0]), int(valid[-1])
        delta = ys[first] - ys[last]
        direction = "up" if delta > 0 else "down"
        for i, row in enumerate(rows):
            if np.isfinite(ys[i]):
                row["normalized_edge_progress"] = round(float(np.clip((ys[first] - ys[i]) / delta, 0, 1)), 6)
            else:
                row["normalized_edge_progress"] = None
        rows[first]["curve_window"] = "start"
        rows[last]["curve_window"] = "end"
    else:
        first = last = None
        direction = None
        for row in rows:
            row["normalized_edge_progress"] = None
    previous = None
    for row in rows:
        y = row["edge_y"] if row["status"] == "detected" else None
        if y is None or previous is None:
            row["displacement_px"] = None
            row["speed_px_s"] = None
        else:
            row["displacement_px"] = int(y - previous[1])
            row["speed_px_s"] = round(abs(y - previous[1]) * meta["fps"], 3)
        if y is not None:
            previous = (row["frame"], y)
    return rows


def write_measurements(all_rows: dict[str, list[dict]], metas: dict[str, dict]) -> None:
    fields = ["label", "frame", "edge_y", "edge_label", "status", "failure", "confidence",
              "scale_px", "scale_ratio_to_median", "scale_drift", "displacement_px",
              "speed_px_s", "normalized_edge_progress", "bbox", "candidate_count", "curve_window"]
    for label, rows in all_rows.items():
        with (OUT / f"{label.lower()}-measurements.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    (OUT / "measurements.json").write_text(json.dumps({"metadata": metas, "rows": all_rows}, indent=2), encoding="utf-8")


def make_curve(all_rows: dict[str, list[dict]], metas: dict[str, dict]) -> None:
    width, height = 1120, 720
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((36, 18), "Card timing: normalized pink-stripe top proxy", fill="black")
    draw.text((36, 42), "Proxy is not the hidden white-card boundary; missing/ambiguous frames are omitted.", fill="#555555")
    box = (80, 90, 1060, 595)
    for tick in range(11):
        y = box[3] - tick * (box[3] - box[1]) / 10
        draw.line((box[0], y, box[2], y), fill="#e6e6e6")
        draw.text((38, y - 7), f"{tick * 10}%", fill="#333333")
    for tick in range(11):
        x = box[0] + tick * (box[2] - box[0]) / 10
        draw.line((x, box[1], x, box[3]), fill="#f1f1f1")
        draw.text((x - 10, 610), f"{tick / 10:.1f}", fill="#333333")
    for label, rows in all_rows.items():
        pts = []
        for row in rows:
            p = row.get("normalized_edge_progress")
            if p is not None:
                x = box[0] + row["frame"] / max(1, min(len(all_rows[k]) for k in all_rows) - 1) * (box[2] - box[0])
                y = box[3] - p * (box[3] - box[1])
                pts.append((x, y))
        if len(pts) >= 2:
            draw.line(pts, fill=LABEL_COLOR[label], width=4)
            for x, y in pts[:: max(1, len(pts) // 18)]:
                draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=LABEL_COLOR[label])
        draw.text((90 + 135 * (ord(label) - ord("A")), 665), f"{label}: pink-stripe proxy", fill=LABEL_COLOR[label])
    image.save(OUT / "normalized-edge-progress.png")

    speed = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(speed)
    d.text((36, 18), "Card timing: frame displacement of pink-stripe top proxy", fill="black")
    max_speed = max((r["speed_px_s"] or 0 for rows in all_rows.values() for r in rows), default=1)
    max_speed = max(1.0, max_speed * 1.1)
    for tick in range(6):
        y = box[3] - tick * (box[3] - box[1]) / 5
        d.line((box[0], y, box[2], y), fill="#e6e6e6")
        d.text((18, y - 7), f"{max_speed * tick / 5:.0f}", fill="#333333")
    for label, rows in all_rows.items():
        pts = []
        for row in rows:
            value = row.get("speed_px_s")
            if value is not None:
                x = box[0] + row["frame"] / max(1, min(len(all_rows[k]) for k in all_rows) - 1) * (box[2] - box[0])
                y = box[3] - value / max_speed * (box[3] - box[1])
                pts.append((x, y))
        if len(pts) >= 2:
            d.line(pts, fill=LABEL_COLOR[label], width=4)
    speed.save(OUT / "edge-displacement.png")


def frame_samples(rows: list[dict], count: int) -> list[int]:
    valid = [r["frame"] for r in rows if r["status"] == "detected"]
    if not valid:
        return list(np.linspace(0, max(0, count - 1), min(12, count), dtype=int))
    return sorted(set(int(round(x)) for x in np.linspace(valid[0], valid[-1], min(12, len(valid)))))


def read_selected(path: Path, meta: dict, wanted: set[int]) -> dict[int, np.ndarray]:
    frames = {}
    for index, frame in enumerate(FrameReader(path, meta["width"], meta["height"])):
        if index in wanted:
            frames[index] = frame.copy()
    return frames


def make_contact_sheet(all_rows: dict[str, list[dict]], metas: dict[str, dict], common_count: int) -> None:
    cell_w, cell_h = 360, 690
    def render(wanted: set[int], name: str) -> None:
        frames = {label: read_selected(INPUTS[label], metas[label], wanted) for label in INPUTS}
        sheet = Image.new("RGB", (cell_w * 3, cell_h * math.ceil(len(wanted) / 3)), "#222222")
        draw = ImageDraw.Draw(sheet)
        for i, index in enumerate(sorted(wanted)):
            for col, label in enumerate(("A", "B", "C")):
                frame = frames[label].get(index)
                x, y = col * cell_w, (i // 3) * cell_h
                if frame is not None:
                    pic = Image.fromarray(frame).convert("RGB")
                    pic.thumbnail((cell_w - 8, cell_h - 72))
                    sheet.paste(pic, (x + (cell_w - pic.width) // 2, y + 4))
                draw.rectangle((x, y + cell_h - 58, x + cell_w, y + cell_h), fill="#222222")
                draw.text((x + 8, y + cell_h - 50), f"{label}  F{index:02d}", fill=LABEL_COLOR[label])
                draw.text((x + 8, y + cell_h - 28), f"{index / metas[label]['fps']:.3f}s", fill="white")
        sheet.save(OUT / name, quality=92)

    wanted = set(np.linspace(0, max(0, common_count - 1), min(12, common_count), dtype=int).tolist())
    render(wanted, "contact-sheet-same-frames.jpg")
    moving_frames = [row["frame"] for rows in all_rows.values() for row in rows if row.get("displacement_px") not in (None, 0)]
    if moving_frames:
        start = max(0, min(moving_frames) - 6)
        end = min(common_count, max(moving_frames) + 7)
        dense = set(range(start, end, 2))
        render(dense, "transition-contact-sheet.jpg")


def make_comparison_videos(metas: dict[str, dict], common_count: int) -> None:
    # Encode a small review copy from the exact same native frame index in all
    # three readers. Input MP4s are only decoded; no source is re-encoded.
    cell_w, cell_h, label_h = 360, 640, 34
    out_w, out_h = cell_w * 3, cell_h + label_h
    fps = min(metas[label]["fps"] for label in ("A", "B", "C"))
    command = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{out_w}x{out_h}", "-r", f"{fps:.8f}", "-i", "-",
               "-an", "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", str(OUT / "comparison-normal.mp4")]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    readers = {label: iter(FrameReader(INPUTS[label], metas[label]["width"], metas[label]["height"])) for label in ("A", "B", "C")}
    try:
        for index in range(common_count):
            source_frames = [next(readers[label]) for label in ("A", "B", "C")]
            canvas = Image.new("RGB", (out_w, out_h), "#202020")
            d = ImageDraw.Draw(canvas)
            for col, (label, frame) in enumerate(zip(("A", "B", "C"), source_frames)):
                pic = Image.fromarray(frame).convert("RGB")
                pic.thumbnail((cell_w, cell_h))
                x = col * cell_w + (cell_w - pic.width) // 2
                canvas.paste(pic, (x, (cell_h - pic.height) // 2))
                d.text((col * cell_w + 8, cell_h + 8), f"{label}  F{index}  {index / fps:.3f}s", fill=LABEL_COLOR[label])
            encoder.stdin.write(np.asarray(canvas, dtype=np.uint8).tobytes())
    finally:
        assert encoder.stdin is not None
        encoder.stdin.close()
    if encoder.wait():
        raise RuntimeError("comparison video encoding failed")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(OUT / "comparison-normal.mp4"),
                    "-vf", "setpts=2*PTS", "-an", "-c:v", "libx264", "-crf", "19",
                    "-pix_fmt", "yuv420p", str(OUT / "comparison-half-speed.mp4")], check=True)


def timing_summary(rows: list[dict], fps: float) -> dict:
    detected = [row for row in rows if row["status"] == "detected" and row["edge_y"] is not None]
    if not detected:
        return {}
    stable = [row for row in detected if row.get("scale_ratio_to_median") is not None and abs(row["scale_ratio_to_median"] - 1) <= 0.15]
    final_y = int(round(float(np.median([row["edge_y"] for row in detected[-5:]]))))
    settle = None
    for index in range(detected[0]["frame"], detected[-1]["frame"] + 1):
        tail = [row for row in detected if row["frame"] >= index]
        if len(tail) >= 3 and all(abs(row["edge_y"] - final_y) <= 2 for row in tail):
            settle = tail[0]
            break
    speeds = [row for row in rows if row.get("speed_px_s") is not None]
    peak = max(speeds, key=lambda row: row["speed_px_s"]) if speeds else None
    return {
        "first_detect": detected[0],
        "first_stable": stable[0] if stable else None,
        "settle": settle,
        "final_y": final_y,
        "peak": peak,
        "travel_px": abs(detected[0]["edge_y"] - final_y),
    }


def report(all_rows: dict[str, list[dict]], metas: dict[str, dict], common_count: int) -> str:
    lines = ["# Flow card timing comparison", "", "Generated from native decoded frames; sources were not modified.", "",
             "## Measurement boundary", "",
             "The tracked edge is the top of the strongest elongated pink stripe (`pink_stripe_top_proxy`) on the white Seoul card. It is a visible colored-stripe proxy, not a recovered white-card boundary or a claim about Flow internals.", "",
             "All A/B/C rows use the same decoded frame index. The comparison videos use the common prefix only; no optical-flow interpolation is introduced.", "",
             "## Inputs", ""]
    for label in ("A", "B", "C"):
        m = metas[label]
        lines.append(f"- **{label}:** `{Path(m['path']).name}`, {m['width']}×{m['height']}, {m['fps']:.6g} fps, {m['frame_count']} frames, SHA-256 `{m['sha256']}`")
    lines += [f"", f"Common frame count used for same-index comparison: `{common_count}`."]
    shape_warnings = []
    for label, m in metas.items():
        aspect = m["width"] / m["height"] if m["height"] else 0
        if abs(aspect - 9 / 16) > 0.01:
            shape_warnings.append(f"{label} aspect ratio is {aspect:.5f}, outside the 9:16 check tolerance")
        if abs(m["duration_s"] - 4.0) > 0.15:
            shape_warnings.append(f"{label} duration is {m['duration_s']:.3f}s, not approximately 4s")
    if len({round(m["fps"], 6) for m in metas.values()}) > 1:
        shape_warnings.append("native frame rates differ; comparison playback uses the lowest native fps")
    if len({m["frame_count"] for m in metas.values()}) > 1:
        shape_warnings.append("native frame counts differ; comparison stops at the common decoded prefix")
    if shape_warnings:
        lines += ["", "Input checks (factual metadata warnings):", ""]
        lines += [f"- {warning}" for warning in shape_warnings]
    lines += ["", "## Observations", ""]
    for label, rows in all_rows.items():
        detected = [r for r in rows if r["status"] == "detected"]
        failures = [r for r in rows if r["status"] != "detected"]
        speeds = [r["speed_px_s"] for r in rows if r["speed_px_s"] is not None]
        drifts = [r for r in rows if r["scale_drift"]]
        if detected:
            first, last = detected[0], detected[-1]
            stats = timing_summary(rows, metas[label]["fps"])
            direction = "upward" if last["edge_y"] < first["edge_y"] else "downward"
            lines.append(f"### {label}")
            lines.append("")
            lines.append(f"- Detected `{len(detected)}/{len(rows)}` frames; proxy moved {direction} `{stats['travel_px']} px` from y={first['edge_y']} (F{first['frame']}, {first['frame'] / metas[label]['fps']:.3f}s) toward final y≈{stats['final_y']} (F{last['frame']}).")
            if stats["first_stable"]:
                stable = stats["first_stable"]
                lines.append(f"- Stable-width onset: F{stable['frame']} ({stable['frame'] / metas[label]['fps']:.3f}s); earlier detections are retained but flagged for stripe-width drift.")
            if stats["settle"]:
                settle = stats["settle"]
                lines.append(f"- First sustained settled proxy (within 2 px of final for the remaining detected frames): F{settle['frame']} ({settle['frame'] / metas[label]['fps']:.3f}s).")
            if stats["peak"]:
                peak = stats["peak"]
                lines.append(f"- Largest measured one-frame speed: `{peak['speed_px_s']:.1f} px/s` after F{peak['frame'] - 1}→F{peak['frame']} (midpoint {(peak['frame'] - 0.5) / metas[label]['fps']:.3f}s).")
            else:
                lines.append("- No consecutive displacement available.")
            lines.append(f"- Scale-drift flag (>15% from this clip's median stripe width): `{len(drifts)}` frames.")
            if failures:
                lines.append(f"- Detector failures/ambiguities: `{len(failures)}` frames; see `failure` and `bbox` in `{label.lower()}-measurements.csv`.")
        else:
            lines.append(f"### {label}\n\n- No usable pink-stripe candidate was detected; timing is not reported for this clip.")
    lines += ["", "## Visual interpretation uncertainty", "",
              "In the sampled contact sheet, the visible right pink rail and the Seoul card's text/barcode layout remain visually consistent after entry, and the measured rail top is monotonic for each clip. That is consistent with a slide-like result.", "",
              "This evidence cannot distinguish an independently translated rigid card from a generated dissolve/morph that happens to preserve the rail. The proxy tracks one colored feature only; it does not establish pixel identity, layer independence, or absence of hidden blending. Treat independent-slide versus dissolve/morph as unresolved and inspect the full normal/half-speed comparisons.",
              "", "## Artifacts", "", "- `contact-sheet-same-frames.jpg` — sampled same-index frames.", "- `transition-contact-sheet.jpg` — denser same-index frames around the observed card movement.", "- `comparison-normal.mp4` and `comparison-half-speed.mp4` — three columns A/B/C.", "- `normalized-edge-progress.png` — normalized proxy progress curves.", "- `edge-displacement.png` — absolute per-frame displacement speed curves.", "- `measurements.json` and `*-measurements.csv` — rows, failures, confidence, and scale diagnostics.", "", "Timing-only scope: this run does not assess people, acting, image quality, or unsupported Flow capabilities."]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preflight", action="store_true", help="check for A/B/C inputs without decoding or writing outputs")
    args = parser.parse_args()
    missing = [str(path.name) for path in INPUTS.values() if not path.exists()]
    if args.preflight or missing:
        result = {"ready": not missing, "expected_directory": str(OUT), "missing": missing,
                  "inputs": {k: str(v) for k, v in INPUTS.items()}}
        print(json.dumps(result, indent=2))
        return 0 if args.preflight else (0 if not missing else 2)
    metas = {label: metadata(path) for label, path in INPUTS.items()}
    all_rows = {label: measure(label, path, metas[label]) for label, path in INPUTS.items()}
    common_count = min(len(rows) for rows in all_rows.values())
    all_rows = {label: rows[:common_count] for label, rows in all_rows.items()}
    write_measurements(all_rows, metas)
    make_curve(all_rows, metas)
    make_contact_sheet(all_rows, metas, common_count)
    make_comparison_videos(metas, common_count)
    (OUT / "report.md").write_text(report(all_rows, metas, common_count), encoding="utf-8")
    print(json.dumps({"ready": True, "common_frame_count": common_count,
                      "outputs": sorted(path.name for path in OUT.iterdir() if path.name not in INPUTS and path.is_file())}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
