"""Render the green-background Hanoi variant using the locked v1 geometry."""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path

import numpy as np
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent
V1_PATH = ROOT / "final-sequence-v1" / "render_final_sequence.py"
DEFAULT_GREEN = ROOT / "performance-v2" / "hanoi-hat-green-10s.mp4"


def _load_v1():
    spec = importlib.util.spec_from_file_location("final_sequence_v1_renderer", V1_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load locked v1 renderer: {V1_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v1 = _load_v1()


def _green_matte(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Soft-key saturated green while keeping the white Hanoi fabric opaque."""
    rgb = frame.astype(np.float32)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    non_green = np.maximum(red, blue)
    # Actual cloth samples are green-excess 10–25; the background is mostly
    # 60+. The smooth range keeps a narrow edge without eroding white cloth.
    excess = green - non_green
    x = np.clip((excess - 35.0) / 30.0, 0.0, 1.0)
    smooth = x * x * (3.0 - 2.0 * x)
    alpha = 1.0 - smooth

    # Suppress isolated non-green Flow marks while retaining the actor. This
    # support mask is used only to reject separate components; it never fills
    # enclosed background between the arms, under the hat, or at the legs.
    support = alpha > 0.5
    labels, count = ndimage.label(support)
    chosen = 0
    if count:
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        for label in np.argsort(sizes)[::-1]:
            ys, xs = np.where(labels == label)
            if len(xs) and xs.min() > 4 and xs.max() < v1.SIZE[0] - 5 and ys.min() > 4 and ys.max() < v1.SIZE[1] - 5:
                chosen = int(label)
                break
    if chosen:
        # One-pixel support keeps the smooth edge; no hole filling or body
        # erosion is applied, so real gaps remain transparent.
        keep = ndimage.binary_dilation(labels == chosen, iterations=1)
        alpha[~keep] = 0.0

    # Despill only the retained actor RGB: opaque white fabric stays present,
    # but its green cast is reduced to the brighter of red/blue.
    output = frame.copy()
    despilled_green = np.minimum(green, non_green).astype(np.uint8)
    output[..., 1] = np.where(alpha > 0.0, despilled_green, output[..., 1])
    return output, np.clip(alpha, 0.0, 1.0).astype(np.float32)


# v1's Hanoi branch already accepts an explicit green-source switch. Replace
# only its green matte implementation for v2 so the white-source helper and
# every other branch remain byte-for-byte untouched.
v1._green_matte = _green_matte


def render(output: Path, half_speed: Path, contact: Path,
           hanoi_green: Path = DEFAULT_GREEN) -> None:
    """Render with v1 timing/geometry and an explicit green Hanoi source."""
    if not hanoi_green.exists():
        raise FileNotFoundError(
            "explicit Hanoi green-screen input is missing: " + str(hanoi_green)
        )
    # v1.render uses its module OUT_DIR for temporary silent video, WAV, and
    # mux files. Redirect that scratch space so a v2 render cannot overwrite
    # v1's retained review artifacts.
    previous_out_dir = v1.OUT_DIR
    v1.OUT_DIR = OUT_DIR
    try:
        v1.render(output, half_speed, contact, hanoi_green)
    finally:
        v1.OUT_DIR = previous_out_dir

    old_audio = OUT_DIR / "final-sequence-v1-procedural-audio.wav"
    new_audio = OUT_DIR / "final-sequence-v2-procedural-audio.wav"
    if old_audio.exists():
        if new_audio.exists():
            new_audio.unlink()
        old_audio.replace(new_audio)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT_DIR / "final-sequence-v2.mp4")
    parser.add_argument("--half-speed", type=Path,
                        default=OUT_DIR / "final-sequence-v2-half-speed.mp4")
    parser.add_argument("--contact", type=Path,
                        default=OUT_DIR / "final-sequence-v2-contact.jpg")
    parser.add_argument("--hanoi-green", type=Path, default=DEFAULT_GREEN,
                        help="Explicit saturated-green Hanoi 10s source; no white-source fallback.")
    args = parser.parse_args()
    render(args.output, args.half_speed, args.contact, args.hanoi_green)
    print(f"wrote {args.output}")
    print(f"wrote {args.half_speed}")
    print(f"wrote {args.contact}")


if __name__ == "__main__":
    main()
