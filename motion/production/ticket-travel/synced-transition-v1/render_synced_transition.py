"""Render a deterministic 4-second Seoul-to-Tokyo card transition probe.

The source clips are white-background renders of the same walk.  They are
decoded in lockstep, and the person layers remain fixed in the 720x1280 frame.
The Tokyo ticket is the only moving layer; its leading edge drives a bottom-up
reveal of the fixed Tokyo wardrobe.  This is deliberately a probe, not a claim
of production-quality roto: the matte uses a narrow edge and no broad feather.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SIZE = (720, 1280)
FPS = 24
FRAME_COUNT = 96
DURATION = FRAME_COUNT / FPS
TRANSITION_START = 1.5
TRANSITION_END = 2.0
CARD_TOP_MARGIN = round(116 / 1920 * SIZE[1])
CARD_LEFT = round(112 / 1080 * SIZE[0])
CARD_RIGHT = round(969 / 1080 * SIZE[0])
CARD_BOTTOM = round(1804 / 1920 * SIZE[1])
CARD_RADIUS = round(42 / 1080 * SIZE[0])

SOURCE = Path(r"C:\Users\every\Downloads\Woman_walking_in_hanbok_202609052145.mp4")
NEW_EDIT = Path(r"C:\Users\every\Downloads\Woman_walking_in_hanbok-clip-1_202609052229.mp4")
SEOUL_TICKET = ROOT / "assets" / "image-first" / "tickets" / "01-seoul-ticket.png"
TOKYO_TICKET = ROOT / "assets" / "image-first" / "tickets" / "02-tokyo-ticket.png"
OUT_DIR = Path(__file__).resolve().parent


def _read_frames(path: Path):
    """Yield decoded RGB frames without retiming or optical-flow synthesis."""
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
    """Return (foreground RGB, narrow-alpha) for a near-white studio frame.

    The score intentionally requires chroma or meaningful darkness, so the
    white set is not turned into a soft halo.  A one-pixel erosion plus a
    1.5-pixel distance ramp supplies only the antialiased boundary.
    """
    rgb = frame.astype(np.float32)
    border = np.concatenate((rgb[:16].reshape(-1, 3), rgb[-16:].reshape(-1, 3),
                             rgb[:, :16].reshape(-1, 3), rgb[:, -16:].reshape(-1, 3)))
    bg = np.median(border, axis=0)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    darkness = bg.min() - rgb.min(axis=2)
    # Pale pink kimono needs the chroma term; hair/shoes need darkness.
    score = np.maximum(chroma * 1.55, darkness)
    seed = score > 17.0
    seed = ndimage.binary_closing(seed, iterations=3)
    seed = ndimage.binary_opening(seed, iterations=1)
    labels, count = ndimage.label(seed)
    if count == 0:
        raise RuntimeError("white-background matte found no foreground")
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    # Reject set edges; choose the largest connected actor component.
    candidates = []
    for label in np.argsort(sizes)[::-1]:
        ys, xs = np.where(labels == label)
        if not len(xs):
            continue
        if xs.min() > 4 and ys.min() > 4 and xs.max() < SIZE[0] - 5 and ys.max() < SIZE[1] - 5:
            candidates.append(int(label))
            break
    if not candidates:
        candidates = [int(np.argmax(sizes))]
    subject = labels == candidates[0]
    subject = ndimage.binary_fill_holes(subject)
    core = ndimage.binary_erosion(subject, iterations=1)
    if not core.any():
        core = subject
    distance = ndimage.distance_transform_edt(subject)
    alpha = np.clip(distance / 1.5, 0.0, 1.0) * core.astype(np.float32)
    # Keep one narrow antialias ring, but no broad feather.
    ring = subject & ~core
    alpha[ring] = np.clip(distance[ring] / 1.5, 0.0, 1.0)
    alpha = np.clip(alpha, 0.0, 1.0)
    # Recover edge color from white-background compositing to avoid a white
    # fringe.  The correction is limited to the narrow matte boundary.
    corrected = rgb.copy()
    edge = alpha > 0.02
    a = alpha[edge, None]
    corrected[edge] = np.clip((rgb[edge] - bg[None, :] * (1.0 - a)) / np.maximum(a, 0.15), 0, 255)
    return corrected.astype(np.uint8), alpha


def _blend(dst: np.ndarray, src: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    a = alpha[..., None]
    return np.round(src.astype(np.float32) * a + dst.astype(np.float32) * (1.0 - a)).astype(np.uint8)


def _ticket_at(card: np.ndarray, offset: int) -> np.ndarray:
    """Place a full-frame card image at positive vertical offset."""
    if offset <= 0:
        return card.copy()
    if offset >= SIZE[1]:
        return np.full_like(card, 255)
    out = np.zeros_like(card)
    out[:offset] = 255
    out[offset:] = card[:SIZE[1] - offset]
    return out


def _ticket_silhouette_at(offset: int) -> np.ndarray:
    """Return the moving card's opaque rounded body, excluding PNG margins."""
    mask = Image.new("L", SIZE, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (CARD_LEFT, CARD_TOP_MARGIN, CARD_RIGHT, CARD_BOTTOM),
        radius=CARD_RADIUS, fill=255,
    )
    body = np.asarray(mask, dtype=np.uint8) > 0
    moved = np.zeros_like(body)
    if offset <= 0:
        return body
    if offset < SIZE[1]:
        moved[offset:] = body[:SIZE[1] - offset]
    return moved


def _frame(source: np.ndarray, new: np.ndarray, seoul: np.ndarray, tokyo: np.ndarray, time_s: float):
    old_rgb, old_a = _matte(source)
    new_rgb, new_a = _matte(new)
    canvas = seoul.copy()
    if time_s < TRANSITION_START:
        return _blend(canvas, old_rgb, old_a), old_a, new_a
    progress = min(1.0, max(0.0, (time_s - TRANSITION_START) / (TRANSITION_END - TRANSITION_START)))
    eased = 1.0 - (1.0 - progress) ** 3
    offset = round((1.0 - eased) * SIZE[1])
    moved = _ticket_at(tokyo, offset)
    # Move only the rounded ticket body. Its white PNG margin remains
    # transparent here, so it cannot erase the old face above the leading edge.
    moving_body = _ticket_silhouette_at(offset)
    if progress >= 1.0:
        canvas = tokyo.copy()
    else:
        canvas[moving_body] = moved[moving_body]
    # Match wardrobe reveal to the ticket's visible rounded-card top edge.  The
    # actor itself is not translated with the card.
    reveal_y = min(SIZE[1], offset + CARD_TOP_MARGIN)
    if progress >= 1.0:
        reveal_y = 0
    remaining = old_a.copy()
    remaining[reveal_y:] = 0.0
    canvas = _blend(canvas, old_rgb, remaining)
    reveal = new_a.copy()
    reveal[:reveal_y] = 0.0
    canvas = _blend(canvas, new_rgb, reveal)
    return canvas, old_a, new_a


def _font(size: int):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _contact(frames: list[tuple[float, np.ndarray]], output: Path) -> None:
    thumb_w, thumb_h = 180, 320
    sheet = Image.new("RGB", (thumb_w * len(frames), thumb_h + 28), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (time_s, frame) in enumerate(frames):
        thumb = Image.fromarray(frame).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (i * thumb_w, 0))
        draw.text((i * thumb_w + 5, thumb_h + 5), f"{time_s:.2f}s", fill=(20, 20, 20), font=_font(16))
    sheet.save(output, quality=92, subsampling=0)


def render(output: Path, contact: Path, mask_contact: Path) -> None:
    if not SOURCE.exists() or not NEW_EDIT.exists():
        raise FileNotFoundError("expected Downloads source clips are missing")
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
    try:
        source_frames, new_frames = _read_frames(SOURCE), _read_frames(NEW_EDIT)
        for index in range(FRAME_COUNT):
            try:
                source_frame, new_frame = next(source_frames), next(new_frames)
            except StopIteration as exc:
                raise RuntimeError(f"synchronized decode ended before frame {index}") from exc
            t = index / FPS
            frame, old_a, new_a = _frame(source_frame, new_frame, seoul, tokyo, t)
            encoder.stdin.write(frame.tobytes())
            if index in {0, 36, 42, 48, 84}:
                selected.append((t, frame.copy()))
                selected_masks.append((t, np.maximum(old_a, new_a)))
                if index == 42:
                    Image.fromarray(np.uint8(new_a * 255), mode="L").save(OUT_DIR / "midpoint-matte.png")
    finally:
        encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg encoding failed")
    _contact(selected, contact)
    # Mask evidence is intentionally grayscale: it makes any matte limitation
    # visible instead of hiding it with a polished thumbnail.
    mask_sheet = Image.new("L", (180 * len(selected_masks), 320), 255)
    for i, (_, mask) in enumerate(selected_masks):
        thumb = Image.fromarray(np.uint8(mask * 255), mode="L").resize((180, 320), Image.Resampling.NEAREST)
        mask_sheet.paste(thumb, (i * 180, 0))
    mask_sheet.save(mask_contact)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUT_DIR / "synced-transition-v1.mp4")
    parser.add_argument("--contact", type=Path, default=OUT_DIR / "synced-transition-v1-contact.jpg")
    parser.add_argument("--mask-contact", type=Path, default=OUT_DIR / "synced-transition-v1-matte-contact.jpg")
    args = parser.parse_args()
    render(args.output, args.contact, args.mask_contact)
    print(f"wrote {args.output}")
    print(f"wrote {args.contact}")
    print(f"wrote {args.mask_contact}")


if __name__ == "__main__":
    main()
