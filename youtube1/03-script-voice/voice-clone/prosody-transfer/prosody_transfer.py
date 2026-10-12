"""Bounded relative-prosody transfer prototype.

This intentionally does not use a reference speaker embedding or absolute F0
from the Instagram material.  It derives a zero-centred contour from the
published aggregate prosody numbers, then applies that contour as a relative
deviation around the Qwen source recording's own median F0.  Pitch changes are
performed in short windows with Rubber Band's formant-preserving mode.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import medfilt, resample


def load_wav(path: Path) -> tuple[int, np.ndarray]:
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    scale = float(np.iinfo(np.int16).max) if np.issubdtype(x.dtype, np.integer) else 1.0
    # wavfile.read converts integer input before this point; normalise by peak.
    peak = np.max(np.abs(x)) or 1.0
    if peak > 2.0:
        x /= 32768.0
    return sr, np.clip(x, -1.0, 1.0)


def track_f0(x: np.ndarray, sr: int, frame_s: float = 0.04, hop_s: float = 0.02):
    n, hop = int(sr * frame_s), int(sr * hop_s)
    times, f0, rms = [], [], []
    lo, hi = max(1, int(sr / 500)), min(n - 1, int(sr / 70))
    for a in range(0, max(1, len(x) - n), hop):
        z = x[a : a + n]
        if len(z) < n:
            z = np.pad(z, (0, n - len(z)))
        z = z - z.mean()
        rms.append(float(np.sqrt(np.mean(z * z) + 1e-12)))
        z = z * np.hanning(n)
        ac = np.correlate(z, z, mode="full")[n - 1 :]
        ac[:lo] = 0
        j = lo + int(np.argmax(ac[lo:hi]))
        conf = float(ac[j] / (ac[0] + 1e-9))
        f0.append(sr / j if conf > 0.25 else np.nan)
        times.append((a + n / 2) / sr)
    t, f, r = np.asarray(times), np.asarray(f0), np.asarray(rms)
    gate = r > np.percentile(r, 20) + 0.02 * (np.percentile(r, 95) - np.percentile(r, 20))
    voiced = np.isfinite(f) & gate
    f_smooth = f.copy()
    if voiced.sum() >= 5:
        vals = np.interp(t, t[voiced], f[voiced])
        f_smooth[voiced] = medfilt(vals, 5)[voiced]
    return t, f_smooth, voiced


def relative_contour(t: np.ndarray, f0: np.ndarray, voiced: np.ndarray, profile: dict) -> tuple[np.ndarray, dict]:
    """Return desired F0 in Hz, centred on source median (no absolute target)."""
    src = f0[voiced]
    src_med = float(np.median(src)) if len(src) else 120.0
    src_st = float(np.std(12.0 * np.log2(src / src_med))) if len(src) else 1.0
    src_st = max(src_st, 1.0)
    summary = profile["reference_summary"]
    # Use only relative target statistics: falling cadence plus bounded emphasis.
    slope = float(summary.get("sentence_slope_median_st_per_s", -0.59))
    spread_st = 12.0 * math.log2(float(summary["f0_target_range_hz"][1]) / float(summary["f0_target_range_hz"][0]))
    # Keep the user's own vocal range/timbre; target spread only controls shape.
    shape_amp = min(max(spread_st / 8.0, 0.8), 1.8) * src_st
    centre = float(np.median(t)) if len(t) else 0.0
    u = t - centre
    target_rel = slope * u + 0.35 * shape_amp * np.sin(2 * np.pi * (t / 1.15))
    # Zero-centre over voiced frames so no global pitch shift is introduced.
    if voiced.any():
        target_rel -= float(np.median(target_rel[voiced]))
    desired = src_med * (2.0 ** (target_rel / 12.0))
    return desired, {"source_median_hz": round(src_med, 3), "source_spread_st": round(src_st, 3),
                     "profile_slope_st_per_s": slope, "profile_relative_spread_st": round(spread_st, 3)}


def rubberband_chunk(chunk: np.ndarray, sr: int, ratio: float, out_len: int, temp: Path) -> np.ndarray:
    src = temp / "in.wav"
    dst = temp / "out.wav"
    wavfile.write(src, sr, np.asarray(np.clip(chunk, -1, 1) * 32767, dtype=np.int16))
    filt = f"rubberband=pitch={ratio:.8f}:formant=preserved:smoothing=on"
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", filt, "-ar", str(sr), "-ac", "1", str(dst)]
    subprocess.run(cmd, check=True)
    out_sr, y = wavfile.read(dst)
    y = y.astype(np.float64) / (32768.0 if np.max(np.abs(y)) > 2 else 1.0)
    if out_sr != sr or len(y) != out_len:
        y = resample(y, out_len)
    return np.asarray(y, dtype=np.float64)


def transfer(x: np.ndarray, sr: int, t: np.ndarray, f0: np.ndarray, voiced: np.ndarray,
             desired: np.ndarray, strength: float) -> np.ndarray:
    hop = int(sr * 0.30)
    win = int(sr * 0.42)
    out = np.zeros_like(x)
    weights = np.zeros_like(x)
    with tempfile.TemporaryDirectory(prefix="prosody-rb-") as td:
        temp = Path(td)
        for start in range(0, len(x), hop):
            end = min(len(x), start + win)
            n = end - start
            if n < int(sr * 0.12):
                break
            mid = (start + end) / 2 / sr
            idx = int(np.argmin(np.abs(t - mid))) if len(t) else 0
            src_hz = float(f0[idx]) if len(f0) and np.isfinite(f0[idx]) else float(np.nanmedian(f0))
            dst_hz = float(desired[idx]) if len(desired) else src_hz
            ratio = 2.0 ** (strength * 12.0 * math.log2(max(dst_hz, 1.0) / max(src_hz, 1.0)) / 12.0)
            ratio = float(np.clip(ratio, 0.82, 1.22))
            y = rubberband_chunk(x[start:end], sr, ratio, n, temp)
            fade = np.ones(n)
            edge = min(int(sr * 0.035), n // 2)
            if edge:
                fade[:edge] = np.linspace(0, 1, edge)
                fade[-edge:] = np.linspace(1, 0, edge)
            out[start:end] += y * fade
            weights[start:end] += fade
    out /= np.maximum(weights, 1e-6)
    # Preserve source loudness and avoid clipping; no timbre/equalisation stage.
    src_rms = np.sqrt(np.mean(x * x) + 1e-12)
    dst_rms = np.sqrt(np.mean(out * out) + 1e-12)
    out *= src_rms / max(dst_rms, 1e-9)
    return np.clip(out, -0.999, 0.999)


def lufs(path: Path) -> float | None:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-filter_complex", "ebur128=framelog=verbose", "-f", "null", "-"], capture_output=True, text=True)
    vals = re.findall(r"\bI:\s*(-?\d+(?:\.\d+)?) LUFS", p.stderr)
    return round(float(vals[-1]), 2) if vals else None


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def metrics(path: Path, source_f0: tuple[np.ndarray, np.ndarray, np.ndarray]) -> dict:
    sr, x = load_wav(path)
    t, f, v = track_f0(x, sr)
    med = float(np.median(f[v])) if v.any() else None
    # Compare contour variation to source using semitone deviations from each median.
    spread = float(np.std(12 * np.log2(f[v] / med))) if v.any() else None
    return {"sample_rate_hz": sr, "duration_s": round(len(x) / sr, 4),
            "integrated_lufs": lufs(path), "peak_dbfs": round(20 * math.log10(max(np.max(np.abs(x)), 1e-9)), 2),
            "clipped_samples": int(np.sum(np.abs(x) >= 0.999)), "f0_median_hz": None if med is None else round(med, 2),
            "f0_spread_st": None if spread is None else round(spread, 3)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=Path("../../runs/qwen-canonical-20260730/smoke.wav"))
    ap.add_argument("--profile", type=Path, default=Path("../instagram-prosody-profile.json"))
    ap.add_argument("--out-dir", type=Path, default=Path(__file__).parent)
    args = ap.parse_args()
    root = Path(__file__).resolve().parent
    source = args.source.resolve() if args.source.is_absolute() else (root / args.source).resolve()
    profile_path = args.profile.resolve() if args.profile.is_absolute() else (root / args.profile).resolve()
    out_dir = args.out_dir.resolve(); out_dir.mkdir(parents=True, exist_ok=True)
    sr, x = load_wav(source)
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    t, f0, voiced = track_f0(x, sr)
    desired, contour_info = relative_contour(t, f0, voiced, profile)
    names = {"qwen_original": x, "relative_prosody_50": transfer(x, sr, t, f0, voiced, desired, 0.50),
             "relative_prosody_80": transfer(x, sr, t, f0, voiced, desired, 0.80)}
    # Loudness-match all variants. The 80% render has the least peak headroom,
    # so choose one shared safe target rather than boosting it into clipping.
    with tempfile.TemporaryDirectory(prefix="prosody-pre-") as td:
        pre = {}
        for name, y in names.items():
            p = Path(td) / f"{name}.wav"
            wavfile.write(p, sr, np.asarray(np.clip(y, -0.999, 0.999) * 32767, dtype=np.int16))
            pre[name] = metrics(p, (t, f0, voiced))
        safe_target = min(float(v["integrated_lufs"]) - 1.0 - float(v["peak_dbfs"]) for v in pre.values())
        # A small safety margin keeps integer WAV rounding below -1 dBFS.
        safe_target -= 0.05
        for name, y in names.items():
            gain_db = safe_target - float(pre[name]["integrated_lufs"])
            names[name] = np.clip(y * (10.0 ** (gain_db / 20.0)), -0.999, 0.999)
    paths = {}
    for name, y in names.items():
        p = out_dir / f"{name}.wav"; wavfile.write(p, sr, np.asarray(y * 32767, dtype=np.int16)); paths[name] = str(p)
    text_source = source.with_name(f"{source.stem}-script.txt")
    text = text_source.read_text(encoding="utf-8").strip() if text_source.exists() else ""
    m = {"schema_version": 1, "text": text,
         "text_source": str(text_source) if text_source.exists() else None,
         "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
         "source": {"path": str(source), "sha256": file_sha256(source)},
         "profile": {"path": str(profile_path), "sha256": file_sha256(profile_path)},
         "algorithm": {"type": "relative_post_generation_prosody", "pitch_engine": "ffmpeg rubberband", "formant_mode": "preserved", "strengths": [0, 0.5, 0.8], "absolute_pitch_shift": False, "reference_audio_used": False, "loudness_normalization": {"shared_target_lufs": round(safe_target, 2), "peak_ceiling_dbfs": -1.0, "method": "pre-measure integrated LUFS then apply per-render gain"}, **contour_info},
         "outputs": {k: {"path": v, "sha256": file_sha256(Path(v)), "strength": 0 if k == "qwen_original" else float(k.rsplit("_", 1)[-1]) / 100} for k, v in paths.items()},
         "metrics": {k: metrics(Path(v), (t, f0, voiced)) for k, v in paths.items()},
         "limitations": ["This 3.75-second one-sentence prototype validates relative pitch contour only; pause timing, speaking rate, and emphasis transfer require a longer multi-sentence sample in the next stage.", "Prototype uses short-window Rubber Band pitch shifts; boundary artefacts may remain.", "Instagram material contributes aggregate numeric contour statistics only; no third-party waveform or speaker embedding is used.", "Text/ASR is inherited from the canonical Qwen acceptance record; this manifest does not rerun ASR."]}
    (out_dir / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"outputs": paths, "metrics": m["metrics"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
