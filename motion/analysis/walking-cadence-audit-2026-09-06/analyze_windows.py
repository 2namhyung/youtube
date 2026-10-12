from __future__ import annotations

import io
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.signal import find_peaks, periodogram

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
REF = ROOT / "references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4"
V2 = ROOT / "production/ticket-travel/final-sequence-v2/final-sequence-v2.mp4"


def probe(path):
    raw = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=r_frame_rate", "-of", "json", str(path)], text=True)
    rate = json.loads(raw)["streams"][0]["r_frame_rate"].split("/")
    return float(rate[0]) / float(rate[1])


def decode(path, start, end, width=360):
    fps = probe(path)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(start), "-t", str(end-start),
           "-i", str(path), "-vf", f"scale={width}:-1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    data = subprocess.check_output(cmd)
    out, pos = [], 0
    while True:
        a = data.find(b"\xff\xd8", pos)
        if a < 0: break
        b = data.find(b"\xff\xd9", a + 2)
        if b < 0: break
        out.append(np.asarray(Image.open(io.BytesIO(data[a:b+2])).convert("L"), dtype=np.float32))
        pos = b + 2
    return np.stack(out), fps


def metrics(path, start, end, label):
    ims, fps = decode(path, start, end)
    # Lower-body crop: excludes face/hand actions, retains legs and feet.
    y0 = int(ims.shape[1] * 0.52)
    crop = ims[:, y0:, :]
    # Remove static background by using temporal differences, then smooth lightly.
    d = np.mean(np.abs(np.diff(crop, axis=0)), axis=(1, 2))
    d = np.convolve(d, np.ones(3) / 3, mode="same")
    peaks, props = find_peaks(d, distance=max(2, int(fps * 0.18)), prominence=max(0.05, np.std(d) * 0.12))
    times = [start + (int(p)+1) / fps for p in peaks]
    intervals = np.diff(times)
    # Periodogram is a secondary estimate; broad motion can dominate it.
    freq, power = periodogram(d - np.mean(d), fs=fps)
    valid = (freq >= 0.35) & (freq <= 2.5)
    peak_freq = float(freq[valid][np.argmax(power[valid])]) if np.any(valid) else None
    return {"label": label, "start": start, "end": end, "fps": fps, "frames": int(len(ims)),
            "diff_peaks_s": times, "diff_intervals_s": intervals.tolist(),
            "periodogram_peak_hz": peak_freq,
            "diff_mean": float(np.mean(d)), "diff_std": float(np.std(d))}


def main():
    rows = [
        metrics(REF, 2.30, 4.20, "reference intro walking, passport lowered"),
        metrics(V2, 2.60, 3.45, "current v2 intro clean walk before first card"),
        metrics(REF, 4.95, 6.35, "reference Bangkok after first card settle"),
        metrics(REF, 6.90, 8.45, "reference Seoul city window"),
        metrics(V2, 4.10, 5.90, "current v2 Seoul city window"),
        metrics(V2, 6.95, 8.85, "current v2 Tokyo city window"),
    ]
    (OUT / "window-metrics.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    for r in rows:
        print(r["label"], "fps", r["fps"], "peaks", [round(x, 3) for x in r["diff_peaks_s"]],
              "intervals", [round(x, 3) for x in r["diff_intervals_s"]], "period", r["periodogram_peak_hz"])


if __name__ == "__main__":
    main()
