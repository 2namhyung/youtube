"""Render the deterministic 13-second ticket-travel sequence.

The final sequence is deliberately strict about source availability.  Every
card branch is sampled at the same master frame index (``(t - 3.5) * 24``),
with no looping, stretching, or retiming.  The card transition uses the
slanted, rounded silhouette and local backing treatment from
``synced-transition-v2``; actors remain fixed in screen space and are matted
after the card backgrounds.
"""
from __future__ import annotations

import argparse
import importlib.util
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent
PERF_DIR = ROOT / "performance-v2"
V2_PATH = ROOT / "synced-transition-v2" / "render_synced_transition_v2.py"
HANOI_MATTE_PATH = OUT_DIR / "hanoi_matte.py"
SIZE = (720, 1280)
FPS = 24
SECONDS = 13.0
FRAME_COUNT = round(SECONDS * FPS)
CARD_TIME_OFFSET = 3.5
TRANSITION_DURATION = 0.5

INTRO = PERF_DIR / "intro-casual.mp4"
SEOUL = PERF_DIR / "canonical-hanbok-10s.mp4"
TOKYO = PERF_DIR / "tokyo-parasol-10s.mp4"
SHANGHAI = PERF_DIR / "shanghai-fan-10s.mp4"
HANOI = PERF_DIR / "hanoi-hat-10s.mp4"
TICKETS = [ROOT / "assets" / "image-first" / "tickets" / f"0{i}-{'seoul' if i == 1 else 'tokyo' if i == 2 else 'shanghai' if i == 3 else 'hanoi'}-ticket.png" for i in range(1, 5)]


def _load_v2():
    spec = importlib.util.spec_from_file_location("synced_transition_v2", V2_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load v2 geometry helper: {V2_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v2 = _load_v2()


def _load_hanoi_matte():
    spec = importlib.util.spec_from_file_location("hanoi_matte", HANOI_MATTE_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load Hanoi matte helper: {HANOI_MATTE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hanoi_matte = _load_hanoi_matte()


def _ffprobe(path: Path) -> tuple[int, int, int, int, int]:
    ffprobe = shutil.which("ffprobe") or "ffprobe"
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True,
    )
    fields = result.stdout.strip().split(",")
    if len(fields) != 4:
        raise RuntimeError(f"unexpected ffprobe metadata for {path}: {result.stdout!r}")
    width, height = int(fields[0]), int(fields[1])
    numerator, denominator = (int(x) for x in fields[2].split("/"))
    return width, height, numerator, denominator, int(fields[3])


class FrameReader:
    """Forward-only raw decoder; requesting a frame never retimes it."""

    def __init__(self, path: Path):
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        self.path = path
        self.proc = subprocess.Popen(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
            stdout=subprocess.PIPE,
        )
        assert self.proc.stdout is not None
        self.stream = self.proc.stdout
        self.frame_bytes = SIZE[0] * SIZE[1] * 3
        self.index = -1
        self.current = None

    def get(self, index: int) -> np.ndarray:
        if index < self.index:
            raise ValueError(f"non-monotonic frame request {index} after {self.index} for {self.path}")
        while self.index < index:
            data = self.stream.read(self.frame_bytes)
            if len(data) != self.frame_bytes:
                raise RuntimeError(f"{self.path} ended before required frame {index}")
            self.current = np.frombuffer(data, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()
            self.index += 1
        assert self.current is not None
        return self.current

    def close(self) -> None:
        # Reads stop at the highest requested master frame, not necessarily
        # EOF. Termination is intentional; requested-frame decode failures are
        # already raised by ``get``.
        if self.proc.poll() is None:
            self.proc.terminate()
        self.stream.close()
        self.proc.wait()


def _blend(dst: np.ndarray, src: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return v2._blend(dst, src, alpha)


def _green_matte(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Key a saturated-green Hanoi plate while preserving opaque white cloth."""
    rgb = frame.astype(np.float32)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    non_green = np.maximum(red, blue)
    green_background = (green > 70.0) & (green - non_green > 28.0) & (green > red * 1.12) & (green > blue * 1.12)
    # Flood from the border so green props/edge pixels do not become a broad
    # matte; keep the central connected actor and its hat/garment details.
    background = np.zeros(green_background.shape, dtype=bool)
    border = np.zeros_like(background)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    background = ndimage.binary_propagation(border, mask=green_background)
    subject = ~background
    labels, count = ndimage.label(subject)
    if count:
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        central = []
        for label in np.argsort(sizes)[::-1]:
            ys, xs = np.where(labels == label)
            if len(xs) and xs.min() > 4 and xs.max() < SIZE[0] - 5 and ys.min() > 4 and ys.max() < SIZE[1] - 5:
                central.append(int(label))
                break
        if central:
            subject = labels == central[0]
    subject = ndimage.binary_fill_holes(subject)
    core = ndimage.binary_erosion(subject, iterations=1)
    distance = ndimage.distance_transform_edt(subject)
    alpha = np.clip(distance / 1.5, 0.0, 1.0) * core.astype(np.float32)
    ring = subject & ~core
    alpha[ring] = np.clip(distance[ring] / 1.5, 0.0, 1.0)
    return frame.copy(), np.clip(alpha, 0.0, 1.0)


def _actor_matte(actor: np.ndarray, branch: str, frame_index: int | None = None,
                 hanoi_greenscreen: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Use the frozen white helper or explicit Hanoi green key."""
    if branch == "hanoi":
        if hanoi_greenscreen:
            return _green_matte(actor)
        return hanoi_matte.matte(actor, frame_index)
    return v2._matte(actor)


def _static(card: np.ndarray, actor: np.ndarray, branch: str, frame_index: int | None = None,
            hanoi_greenscreen: bool = False) -> np.ndarray:
    rgb, alpha = _actor_matte(actor, branch, frame_index, hanoi_greenscreen)
    return _blend(card, rgb, alpha)


def _transition(old_card: np.ndarray, incoming_card: np.ndarray, old_frame: np.ndarray,
                new_frame: np.ndarray, t: float, body: Image.Image,
                old_branch: str, new_branch: str, old_index: int | None = None,
                new_index: int | None = None, hanoi_greenscreen: bool = False) -> np.ndarray:
    """Composite one half-second card transition with complementary actor masks."""
    old_rgb, old_a = _actor_matte(old_frame, old_branch, old_index, hanoi_greenscreen)
    new_rgb, new_a = _actor_matte(new_frame, new_branch, new_index, hanoi_greenscreen)
    p = min(1.0, max(0.0, t / TRANSITION_DURATION))
    if p >= 1.0:
        return _static(incoming_card, new_frame, new_branch, new_index, hanoi_greenscreen)
    eased = 1.0 - (1.0 - p) ** 3
    offset = round((1.0 - eased) * SIZE[1])
    angle = v2.INITIAL_TILT_DEG * (1.0 - eased)
    blur_px = round(v2.MAX_DIRECTIONAL_BLUR_PX * (1.0 - p))
    canvas = old_card.copy()
    if p > 0:
        canvas = v2._backing(canvas, body, offset, angle, blur_px)
        card_rgb, card_alpha = v2._directional_card(incoming_card, body, offset, angle, blur_px)
        canvas = _blend(canvas, card_rgb, card_alpha)
        _, geometry_alpha = v2._rotated_card(incoming_card, body, offset, angle)
        old_region, new_region = v2._complementary_person_regions(geometry_alpha)
    else:
        old_region = np.ones(SIZE[::-1], dtype=np.float32)
        new_region = np.zeros(SIZE[::-1], dtype=np.float32)
    canvas = _blend(canvas, old_rgb, old_a * old_region)
    return _blend(canvas, new_rgb, new_a * new_region)


def _font(size: int):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _contact(frames: list[tuple[float, np.ndarray]], path: Path) -> None:
    thumb_w, thumb_h = 108, 192
    columns = 7
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGB", (thumb_w * columns, (thumb_h + 24) * rows), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (time_s, frame) in enumerate(frames):
        col, row = i % columns, i // columns
        x, y = col * thumb_w, row * (thumb_h + 24)
        sheet.paste(Image.fromarray(frame).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 2, y + thumb_h + 4), f"{time_s:.1f}s", fill=(20, 20, 20), font=_font(11))
    sheet.save(path, quality=92, subsampling=0)


def _write_audio(path: Path) -> None:
    """Create original low-level pulse/slide accents; no external audio assets."""
    rate = 48_000
    samples = round(SECONDS * rate)
    ts = np.arange(samples, dtype=np.float64) / rate
    audio = np.zeros(samples, dtype=np.float64)
    # Subtle regular beat, kept well below dialogue/music levels.
    for beat in np.arange(0.0, SECONDS, 0.5):
        dt = ts - beat
        active = dt >= 0
        env = np.where(active, np.exp(-dt * 34.0), 0.0)
        audio += 0.018 * env * np.sin(2.0 * np.pi * 72.0 * dt)
    # A short rising slide at each card change, including the first card.
    for start in (3.5, 6.5, 9.0, 11.0):
        dt = ts - start
        active = (dt >= 0) & (dt < 0.34)
        phase = np.clip(dt / 0.34, 0.0, 1.0)
        env = np.where(active, np.sin(np.pi * phase) ** 1.4, 0.0)
        audio += 0.012 * env * np.sin(2.0 * np.pi * (180.0 * dt + 420.0 * dt * dt))
    # Small resolved tail inside the 13s endpoint.
    dt = ts - 12.72
    env = np.where(dt >= 0, np.exp(-dt * 16.0), 0.0)
    audio += 0.008 * env * np.sin(2.0 * np.pi * 96.0 * dt)
    pcm = np.clip(audio, -0.8, 0.8)
    stereo = np.column_stack((pcm, pcm * 0.92))
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(np.int16(stereo * 32767).tobytes())


def _verify(path: Path, expected_frames: int, expected_rate: tuple[int, int]) -> None:
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    result = subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"full ffmpeg decode failed for {path}: {result.stderr.strip()}")
    width, height, num, den, frames = _ffprobe(path)
    if (width, height, num, den, frames) != (SIZE[0], SIZE[1], expected_rate[0], expected_rate[1], expected_frames):
        raise RuntimeError(f"unexpected output metadata for {path}: {width}x{height} {num}/{den}fps {frames} frames")


def render(output: Path, half_speed: Path, contact: Path, hanoi_greenscreen: Path | None = None) -> None:
    hanoi_source = hanoi_greenscreen if hanoi_greenscreen is not None else HANOI
    required = {"intro": INTRO, "seoul": SEOUL, "tokyo": TOKYO, "shanghai": SHANGHAI, "hanoi": hanoi_source}
    missing = [f"{name}: {path}" for name, path in required.items() if not path.exists()]
    if missing:
        raise FileNotFoundError("required final-sequence inputs are missing:\n" + "\n".join(missing))
    for name, path in required.items():
        width, height, num, den, frames = _ffprobe(path)
        min_frames = 96 if name == "intro" else 240
        if (width, height, num, den) != (SIZE[0], SIZE[1], FPS, 1) or frames < min_frames:
            raise RuntimeError(f"{name} must be >= {min_frames} frames at 720x1280/24fps; got {width}x{height} {num}/{den} {frames} frames: {path}")
    ticket_arrays = [np.asarray(Image.open(path).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)) for path in TICKETS]
    body = v2._body_mask()
    readers = {name: FrameReader(path) for name, path in required.items()}
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix="final-sequence-silent-", suffix=".mp4", dir=OUT_DIR, delete=False) as temp:
        silent = Path(temp.name)
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{SIZE[0]}x{SIZE[1]}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
           "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(silent)]
    encoder = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert encoder.stdin is not None
    contact_frames: list[tuple[float, np.ndarray]] = []
    try:
        for index in range(FRAME_COUNT):
            t = index / FPS
            if t < 3.5:
                frame = readers["intro"].get(index)
                # Preserve the generated intro RGB, including its airplane
                # shadow, until the first card wipe begins.
                composed = frame.copy()
            else:
                card_t = t - CARD_TIME_OFFSET
                master_index = min(239, round(card_t * FPS))
                if t < 6.5:
                    branch, card_index = "seoul", 0
                elif t < 9.0:
                    branch, card_index = "tokyo", 1
                elif t < 11.0:
                    branch, card_index = "shanghai", 2
                else:
                    branch, card_index = "hanoi", 3
                actor = readers[branch].get(master_index)
                if t < 4.0:
                    old = readers["intro"].get(index)
                    # Use the intro frame as the old background so its shadow
                    # changes smoothly under the rising first card.
                    composed = _transition(readers["intro"].get(index), ticket_arrays[0], old, actor, t - 3.5, body, "intro", "seoul", index, master_index, hanoi_greenscreen is not None)
                elif (branch, t) in (("tokyo", 6.5), ("shanghai", 9.0), ("hanoi", 11.0)) or (branch == "tokyo" and t < 7.0) or (branch == "shanghai" and t < 9.5) or (branch == "hanoi" and t < 11.5):
                    previous = {"tokyo": ("seoul", 0), "shanghai": ("tokyo", 1), "hanoi": ("shanghai", 2)}[branch]
                    old_actor = readers[previous[0]].get(master_index)
                    composed = _transition(ticket_arrays[previous[1]], ticket_arrays[card_index], old_actor, actor, t - {"tokyo": 6.5, "shanghai": 9.0, "hanoi": 11.0}[branch], body, previous[0], branch, master_index, master_index, hanoi_greenscreen is not None)
                else:
                    composed = _static(ticket_arrays[card_index], actor, branch, master_index, hanoi_greenscreen is not None)
            encoder.stdin.write(composed.tobytes())
            if index % 12 == 0 or index in {84, 90, 96, 108, 120, 132, 144, 156, 168, 180, 192, 204, 216, 228, 240, 252, 264, 276, 288, 300}:
                contact_frames.append((t, composed.copy()))
    finally:
        encoder.stdin.close()
        for reader in readers.values():
            reader.close()
    if encoder.wait() != 0:
        silent.unlink(missing_ok=True)
        raise RuntimeError("silent video encoding failed")
    audio_file = OUT_DIR / "final-sequence-v1-procedural-audio.wav"
    _write_audio(audio_file)
    muxed = OUT_DIR / "final-sequence-v1-muxed.mp4"
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent), "-i", str(audio_file),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k",
                    "-shortest", "-movflags", "+faststart", str(muxed)], check=True)
    silent.unlink(missing_ok=True)
    if output.exists():
        output.unlink()
    muxed.replace(output)
    _contact(contact_frames, contact)
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(output), "-vf", "setpts=2*PTS",
                    "-af", "atempo=0.5", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-movflags", "+faststart", str(half_speed)], check=True)
    _verify(output, FRAME_COUNT, (FPS, 1))
    _verify(half_speed, FRAME_COUNT, (FPS // 2, 1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT_DIR / "final-sequence-v1.mp4")
    parser.add_argument("--half-speed", type=Path, default=OUT_DIR / "final-sequence-v1-half-speed.mp4")
    parser.add_argument("--contact", type=Path, default=OUT_DIR / "final-sequence-v1-contact.jpg")
    parser.add_argument("--hanoi-greenscreen", type=Path, default=None,
                        help="Explicitly replace the white Hanoi source with a saturated-green 10s source.")
    args = parser.parse_args()
    render(args.output, args.half_speed, args.contact, args.hanoi_greenscreen)
    print(f"wrote {args.output}")
    print(f"wrote {args.half_speed}")
    print(f"wrote {args.contact}")


if __name__ == "__main__":
    main()
