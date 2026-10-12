"""Render a bounded, reference-inspired 4-second Seoul-to-Tokyo transition.

The two source clips are decoded one frame at a time in lockstep, exactly as in
synced-transition-v1.  The incoming Tokyo ticket is a separate rounded panel:
it enters from below with a small, tunable tilt, eases upright, and has a
narrow directional trail on the card and its backing only.  The actors stay
fixed in screen space; their complementary mattes follow the transformed
card's slanted top edge.

This is a deterministic probe, not a claim that the reference's unknown
authoring values have been recovered.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent
SIZE = (720, 1280)
FPS = 24
FRAME_COUNT = 96

# These are deliberately explicit and tunable, not asserted reference values.
TRANSITION_START = 1.5
TRANSITION_END = 2.0
INITIAL_TILT_DEG = -5.0  # PIL convention: positive is counter-clockwise.
MAX_DIRECTIONAL_BLUR_PX = 6
CARD_TOP_MARGIN = round(116 / 1920 * SIZE[1])
CARD_LEFT = round(112 / 1080 * SIZE[0])
CARD_RIGHT = round(969 / 1080 * SIZE[0])
CARD_BOTTOM = round(1804 / 1920 * SIZE[1])
CARD_RADIUS = round(42 / 1080 * SIZE[0])
CARD_CENTER = ((CARD_LEFT + CARD_RIGHT) / 2, (CARD_TOP_MARGIN + CARD_BOTTOM) / 2)

SOURCE = Path(r"C:\Users\every\Downloads\Woman_walking_in_hanbok_202609052145.mp4")
NEW_EDIT = Path(r"C:\Users\every\Downloads\Woman_walking_in_hanbok-clip-1_202609052229.mp4")
SEOUL_TICKET = ROOT / "assets" / "image-first" / "tickets" / "01-seoul-ticket.png"
TOKYO_TICKET = ROOT / "assets" / "image-first" / "tickets" / "02-tokyo-ticket.png"


def _read_frames(path: Path):
    """Decode RGB frames without retiming, interpolation, or frame synthesis."""
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    proc = subprocess.Popen(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
        stdout=subprocess.PIPE,
    )
    assert proc.stdout is not None
    frame_bytes = SIZE[0] * SIZE[1] * 3
    try:
        while True:
            data = proc.stdout.read(frame_bytes)
            if len(data) != frame_bytes:
                break
            yield np.frombuffer(data, dtype=np.uint8).reshape(SIZE[1], SIZE[0], 3).copy()
    finally:
        proc.stdout.close()
        if proc.wait() != 0:
            raise RuntimeError(f"ffmpeg decode failed for {path}")


def _matte(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return foreground RGB and a narrow alpha for the near-white studio set."""
    rgb = frame.astype(np.float32)
    border = np.concatenate((rgb[:16].reshape(-1, 3), rgb[-16:].reshape(-1, 3),
                             rgb[:, :16].reshape(-1, 3), rgb[:, -16:].reshape(-1, 3)))
    bg = np.median(border, axis=0)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    darkness = bg.min() - rgb.min(axis=2)
    score = np.maximum(chroma * 1.55, darkness)
    seed = ndimage.binary_closing(score > 17.0, iterations=3)
    seed = ndimage.binary_opening(seed, iterations=1)
    labels, count = ndimage.label(seed)
    if count == 0:
        raise RuntimeError("white-background matte found no foreground")
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    candidates = []
    for label in np.argsort(sizes)[::-1]:
        ys, xs = np.where(labels == label)
        if len(xs) and xs.min() > 4 and ys.min() > 4 and xs.max() < SIZE[0] - 5 and ys.max() < SIZE[1] - 5:
            candidates.append(int(label))
            break
    if not candidates:
        candidates = [int(np.argmax(sizes))]
    subject = ndimage.binary_fill_holes(labels == candidates[0])
    core = ndimage.binary_erosion(subject, iterations=1)
    if not core.any():
        core = subject
    distance = ndimage.distance_transform_edt(subject)
    alpha = np.clip(distance / 1.5, 0.0, 1.0) * core.astype(np.float32)
    ring = subject & ~core
    alpha[ring] = np.clip(distance[ring] / 1.5, 0.0, 1.0)
    alpha = np.clip(alpha, 0.0, 1.0)
    corrected = rgb.copy()
    edge = alpha > 0.02
    a = alpha[edge, None]
    corrected[edge] = np.clip((rgb[edge] - bg[None, :] * (1.0 - a)) / np.maximum(a, 0.15), 0, 255)
    return corrected.astype(np.uint8), alpha


def _blend(dst: np.ndarray, src: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    a = alpha[..., None]
    return np.round(src.astype(np.float32) * a + dst.astype(np.float32) * (1.0 - a)).astype(np.uint8)


def _shift(image: Image.Image, dx: int, dy: int, fill) -> Image.Image:
    out = Image.new(image.mode, image.size, fill)
    out.paste(image, (dx, dy))
    return out


def _body_mask() -> Image.Image:
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (CARD_LEFT, CARD_TOP_MARGIN, CARD_RIGHT, CARD_BOTTOM),
        radius=CARD_RADIUS, fill=255,
    )
    return mask


def _rotated_card(card: np.ndarray, body: Image.Image, offset: int, angle: float):
    """Return a rotated/translated card and its transformed body alpha."""
    rgb = Image.fromarray(card, mode="RGB").rotate(
        angle, resample=Image.Resampling.BICUBIC, expand=False,
        center=CARD_CENTER, fillcolor=(255, 255, 255),
    )
    alpha = body.rotate(
        angle, resample=Image.Resampling.BICUBIC, expand=False,
        center=CARD_CENTER, fillcolor=0,
    )
    rgb = _shift(rgb, 0, offset, (255, 255, 255))
    alpha = _shift(alpha, 0, offset, 0)
    return np.asarray(rgb, dtype=np.uint8), np.asarray(alpha, dtype=np.float32) / 255.0


def _directional_card(card: np.ndarray, body: Image.Image, offset: int, angle: float, blur_px: int):
    """Make a short vertical entry trail on the ticket only."""
    current_rgb, current_alpha = _rotated_card(card, body, offset, angle)
    if blur_px <= 0:
        return current_rgb, current_alpha
    # The card is moving upward, so its narrow trail is below the current edge.
    copies = ((blur_px, 0.12), (max(1, blur_px // 2), 0.18), (0, 0.70))
    rgb_acc = np.zeros((*SIZE[::-1], 3), dtype=np.float32)
    alpha_acc = np.zeros(SIZE[::-1], dtype=np.float32)
    for trail, weight in copies:
        layer_rgb, layer_alpha = _rotated_card(card, body, offset + trail, angle)
        rgb_acc += layer_rgb.astype(np.float32) * (layer_alpha[..., None] * weight)
        alpha_acc += layer_alpha * weight
    out_rgb = np.full_like(current_rgb, 255)
    present = alpha_acc > 1e-4
    out_rgb[present] = np.clip(rgb_acc[present] / alpha_acc[present, None], 0, 255).astype(np.uint8)
    return out_rgb, np.clip(alpha_acc, 0.0, 1.0)


def _solid_layer(canvas: np.ndarray, color: tuple[int, int, int], alpha: np.ndarray) -> np.ndarray:
    return _blend(canvas, np.full_like(canvas, color, dtype=np.uint8), alpha)


def _backing(canvas: np.ndarray, body: Image.Image, offset: int, angle: float, blur_px: int) -> np.ndarray:
    """Add a restrained offset backing, stack edge, and local shadow."""
    _, shape = _rotated_card(np.full((*SIZE[::-1], 3), 255, dtype=np.uint8), body, offset, angle)
    # Keep these local to the silhouette; there is intentionally no broad halo.
    edge = np.asarray(_shift(
        Image.fromarray(np.uint8(shape * 255), mode="L"), 8, 12, 0), dtype=np.float32) / 255.0
    stack = np.asarray(_shift(
        Image.fromarray(np.uint8(shape * 255), mode="L"), 5, 7, 0), dtype=np.float32) / 255.0 * 0.72
    if blur_px:
        # A faint, short trailing copy gives the backing its own entry softness;
        # this remains local to the card silhouette and never touches the actor.
        trail = np.asarray(_shift(
            Image.fromarray(np.uint8(shape * 255), mode="L"), 8, 12 + max(1, blur_px // 2), 0),
            dtype=np.float32,
        ) / 255.0
        edge = np.clip(edge + trail * 0.16, 0.0, 1.0)
        stack = np.clip(stack + trail * 0.08, 0.0, 1.0)
    shadow = np.asarray(Image.fromarray(np.uint8(edge * 255), mode="L").filter(
        ImageFilter.GaussianBlur(radius=4.0 if blur_px else 2.5)), dtype=np.float32) / 255.0 * 0.34
    canvas = _solid_layer(canvas, (112, 121, 133), shadow)
    canvas = _solid_layer(canvas, (163, 171, 181), stack)
    return _solid_layer(canvas, (112, 120, 133), edge * 0.70)


def _complementary_person_regions(card_alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Build old-above/new-below masks from the actual slanted card top edge."""
    visible = card_alpha > 0.15
    edge_y = np.full(SIZE[0], SIZE[1], dtype=np.int32)
    for x in range(SIZE[0]):
        ys = np.flatnonzero(visible[:, x])
        if len(ys):
            edge_y[x] = int(ys[0])
    y = np.arange(SIZE[1], dtype=np.int32)[:, None]
    new_region = (y >= edge_y[None, :]).astype(np.float32)
    return 1.0 - new_region, new_region


def _frame(source: np.ndarray, new: np.ndarray, seoul: np.ndarray, tokyo: np.ndarray,
           body: Image.Image, time_s: float):
    old_rgb, old_a = _matte(source)
    new_rgb, new_a = _matte(new)
    canvas = seoul.copy()
    if time_s < TRANSITION_START:
        return _blend(canvas, old_rgb, old_a), old_a, new_a, np.zeros(SIZE[::-1], dtype=np.float32)
    progress = min(1.0, max(0.0, (time_s - TRANSITION_START) / (TRANSITION_END - TRANSITION_START)))
    eased = 1.0 - (1.0 - progress) ** 3
    offset = round((1.0 - eased) * SIZE[1])
    angle = INITIAL_TILT_DEG * (1.0 - eased)
    blur_px = round(MAX_DIRECTIONAL_BLUR_PX * (1.0 - progress)) if progress < 1 else 0
    if progress >= 1.0:
        canvas = tokyo.copy()
        old_region = np.zeros(SIZE[::-1], dtype=np.float32)
        new_region = np.ones(SIZE[::-1], dtype=np.float32)
        card_alpha = np.ones(SIZE[::-1], dtype=np.float32)
    else:
        canvas = _backing(canvas, body, offset, angle, blur_px)
        card_rgb, card_alpha = _directional_card(tokyo, body, offset, angle, blur_px)
        canvas = _blend(canvas, card_rgb, card_alpha)
        # Use the unblurred silhouette for the reveal so blur cannot make a halo.
        _, geometry_alpha = _rotated_card(tokyo, body, offset, angle)
        old_region, new_region = _complementary_person_regions(geometry_alpha)
    canvas = _blend(canvas, old_rgb, old_a * old_region)
    canvas = _blend(canvas, new_rgb, new_a * new_region)
    return canvas, old_a, new_a, card_alpha


def _font(size: int):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _contact(frames: list[tuple[float, np.ndarray]], output: Path) -> None:
    thumb_w, thumb_h = 144, 256
    sheet = Image.new("RGB", (thumb_w * len(frames), thumb_h + 27), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (time_s, frame) in enumerate(frames):
        thumb = Image.fromarray(frame).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (i * thumb_w, 0))
        draw.text((i * thumb_w + 3, thumb_h + 5), f"{time_s:.3f}s", fill=(20, 20, 20), font=_font(13))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92, subsampling=0)


def _verify_decode(path: Path, expected_frames: int) -> None:
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    probe = subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True,
    )
    if probe.returncode:
        raise RuntimeError(f"full ffmpeg decode failed for {path}: {probe.stderr.strip()}")
    ffprobe = shutil.which("ffprobe") or "ffprobe"
    meta = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    count = int(meta.stdout.strip() or 0)
    if count != expected_frames:
        raise RuntimeError(f"{path} decoded {count} frames; expected {expected_frames}")


def render(output: Path, contact: Path, mask_contact: Path, half_speed: Path) -> None:
    for path in (SOURCE, NEW_EDIT, SEOUL_TICKET, TOKYO_TICKET):
        if not path.exists():
            raise FileNotFoundError(f"required asset is missing: {path}")
    body = _body_mask()
    seoul = np.asarray(Image.open(SEOUL_TICKET).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS))
    tokyo = np.asarray(Image.open(TOKYO_TICKET).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS))
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{SIZE[0]}x{SIZE[1]}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
           "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert encoder.stdin is not None
    selected: list[tuple[float, np.ndarray]] = []
    selected_masks: list[tuple[float, np.ndarray]] = []
    dense_indices = set(range(round(TRANSITION_START * FPS), round(TRANSITION_END * FPS) + 1, 2))
    overall_indices = {0, 30, 36, 48, 84, 95}
    try:
        source_frames, new_frames = _read_frames(SOURCE), _read_frames(NEW_EDIT)
        for index in range(FRAME_COUNT):
            try:
                source_frame, new_frame = next(source_frames), next(new_frames)
            except StopIteration as exc:
                raise RuntimeError(f"synchronized decode ended before frame {index}") from exc
            t = index / FPS
            frame, old_a, new_a, card_a = _frame(source_frame, new_frame, seoul, tokyo, body, t)
            encoder.stdin.write(frame.tobytes())
            if index in dense_indices or index in overall_indices:
                selected.append((t, frame.copy()))
                selected_masks.append((t, np.maximum(old_a, new_a)))
            if index == round(1.75 * FPS):
                Image.fromarray(np.uint8(np.clip(card_a, 0, 1) * 255), mode="L").save(OUT_DIR / "midpoint-card-silhouette.png")
    finally:
        encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg encoding failed")
    _contact(selected, contact)
    mask_sheet = Image.new("L", (180 * len(selected_masks), 320), 255)
    for i, (_, mask) in enumerate(selected_masks):
        thumb = Image.fromarray(np.uint8(mask * 255), mode="L").resize((180, 320), Image.Resampling.NEAREST)
        mask_sheet.paste(thumb, (i * 180, 0))
    mask_sheet.save(mask_contact)
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(output),
                    "-vf", "setpts=2*PTS", "-an", "-c:v", "libx264", "-crf", "18",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(half_speed)], check=True)
    _verify_decode(output, FRAME_COUNT)
    _verify_decode(half_speed, FRAME_COUNT)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT_DIR / "synced-transition-v2.mp4")
    parser.add_argument("--half-speed", type=Path, default=OUT_DIR / "synced-transition-v2-half-speed.mp4")
    parser.add_argument("--contact", type=Path, default=OUT_DIR / "synced-transition-v2-contact.jpg")
    parser.add_argument("--mask-contact", type=Path, default=OUT_DIR / "synced-transition-v2-matte-contact.jpg")
    args = parser.parse_args()
    render(args.output, args.contact, args.mask_contact, args.half_speed)
    for path in (args.output, args.half_speed, args.contact, args.mask_contact):
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
