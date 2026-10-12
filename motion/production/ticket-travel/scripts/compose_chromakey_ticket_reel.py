"""Compose person-only green-screen Flow clips over fixed ticket artwork.

This is the deterministic fallback for Flow generations that still redraw the
person or the ticket.  Flow should generate only the actor on a solid green
background.  This compositor keys that green, estimates the actor bbox on
each frame, and applies a per-frame affine scale/translation to the fixed
``PERSON_BOX``.  Tickets are rendered by this script, so their typography and
geometry never change.

Input contract
--------------
Four clips, in order, must be 9:16 H.264 exports from Flow with a solid
RGB(0,255,0) background and the same walking action.  The clip may contain
any duration.  The first and last frame should match the supplied clean
plates.  Use ``--clip`` four times and ``--ticket`` four times.  The script
outputs an exact 13-second 720x1280 H.264/AAC reel.

Example::

    python scripts/compose_chromakey_ticket_reel.py \
      --clip flow/01.mp4 --clip flow/02.mp4 --clip flow/03.mp4 --clip flow/04.mp4 \
      --ticket assets/image-first/tickets/01-seoul-ticket.png ... \
      --output output/chromakey-ticket-13s.mp4
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SIZE = (720, 1280)
FPS = 24
PERSON_BOX = (150, 170, 570, 1180)
GREEN = np.array([0, 255, 0], dtype=np.uint8)
TARGET_DURATIONS = (6.5, 2.5, 2.0, 2.0)


def _probe(ffprobe: str, path: Path) -> tuple[int, int, float]:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.splitlines()
    width, height = int(result[0]), int(result[1])
    duration = float(result[-1])
    return width, height, duration


def _key_and_normalize(frame: np.ndarray) -> np.ndarray:
    """Return RGBA actor normalized to PERSON_BOX, or transparent if absent."""
    rgb = frame[..., ::-1] if frame.shape[2] == 3 else frame
    r, g, b = rgb[..., 0].astype(np.int16), rgb[..., 1].astype(np.int16), rgb[..., 2].astype(np.int16)
    green = (g > 90) & (g - r > 28) & (g - b > 28) & (g > r * 1.18) & (g > b * 1.18)
    subject = ~green
    subject = ndimage.binary_opening(subject, iterations=1)
    subject = ndimage.binary_closing(subject, iterations=2)
    labels, count = ndimage.label(subject)
    if count == 0:
        return np.zeros((*SIZE[::-1], 4), dtype=np.uint8)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    label = int(np.argmax(sizes))
    subject = labels == label
    bbox = Image.fromarray(subject.astype(np.uint8) * 255).getbbox()
    if not bbox:
        return np.zeros((*SIZE[::-1], 4), dtype=np.uint8)
    # Remove contaminated green fringe by taking only the eroded interior.
    core = ndimage.binary_erosion(subject, iterations=2)
    if not core.any():
        core = subject
    _, indices = ndimage.distance_transform_edt(~core, return_indices=True)
    clean = rgb.copy()
    shell = subject & ~core
    clean[shell] = rgb[indices[0][shell], indices[1][shell]]
    crop = clean[bbox[1] : bbox[3], bbox[0] : bbox[2]]
    crop_mask = core[bbox[1] : bbox[3], bbox[0] : bbox[2]]
    w, h = PERSON_BOX[2] - PERSON_BOX[0], PERSON_BOX[3] - PERSON_BOX[1]
    fg = np.asarray(Image.fromarray(crop).resize((w, h), Image.Resampling.LANCZOS))
    alpha = np.asarray(Image.fromarray((crop_mask * 255).astype(np.uint8)).resize((w, h), Image.Resampling.LANCZOS))
    rgba = np.zeros((*SIZE[::-1], 4), dtype=np.uint8)
    rgba[PERSON_BOX[1] : PERSON_BOX[3], PERSON_BOX[0] : PERSON_BOX[2], :3] = fg
    rgba[PERSON_BOX[1] : PERSON_BOX[3], PERSON_BOX[0] : PERSON_BOX[2], 3] = alpha
    return rgba


def _read_frames(ffmpeg: str, clip: Path, width: int, height: int):
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(clip),
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"]
    process = subprocess.Popen(command, stdout=subprocess.PIPE)
    size = width * height * 3
    try:
        while True:
            data = process.stdout.read(size)
            if len(data) != size:
                break
            yield np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3)
    finally:
        process.stdout.close()
        process.wait()


def _render_segment(ffmpeg: str, clip: Path, ticket: Path, out: Path, duration: float) -> None:
    width, height, source_duration = _probe(shutil.which("ffprobe") or "ffprobe", clip)
    ticket_image = np.asarray(Image.open(ticket).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS))
    frame_count = max(1, round(duration * FPS))
    # Sample the full Flow clip so the desired endpoint remains available, then
    # resample to the target segment duration.  No Flow pixels are used for
    # ticket art, so typography cannot drift.
    frames = list(_read_frames(ffmpeg, clip, width, height))
    if not frames:
        raise RuntimeError(f"No video frames in {clip}")
    with out.open("wb") as handle:
        for i in range(frame_count):
            source_index = min(len(frames) - 1, round(i * (len(frames) - 1) / max(1, frame_count - 1)))
            actor = _key_and_normalize(frames[source_index])
            alpha = actor[..., 3:4].astype(np.float32) / 255.0
            composed = np.round(actor[..., :3] * alpha + ticket_image * (1.0 - alpha)).astype(np.uint8)
            handle.write(composed.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clip", action="append", required=True)
    parser.add_argument("--ticket", action="append", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if len(args.clip) != 4 or len(args.ticket) != 4:
        raise SystemExit("Exactly four --clip and four --ticket arguments are required")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe are required on PATH")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ticket-chromakey-") as temp:
        raw_segments = []
        for index, (clip, ticket, duration) in enumerate(zip(args.clip, args.ticket, TARGET_DURATIONS)):
            raw = Path(temp) / f"segment-{index:02d}.rgb"
            _render_segment(ffmpeg, Path(clip), Path(ticket), raw, duration)
            raw_segments.append((raw, duration))
        concat = Path(temp) / "concat.txt"
        # Re-encode each deterministic raw segment to one stream with exact
        # segment durations, then concatenate without re-rendering frames.
        encoded = []
        for i, (raw, duration) in enumerate(raw_segments):
            mp4 = Path(temp) / f"segment-{i:02d}.mp4"
            subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "720x1280",
                            "-r", str(FPS), "-i", str(raw), "-t", str(duration),
                            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                            "-pix_fmt", "yuv420p", "-an", str(mp4)], check=True)
            encoded.append(mp4)
        concat.write_text("\n".join(f"file '{p.as_posix()}'" for p in encoded), encoding="utf-8")
        subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                        "-f", "concat", "-safe", "0", "-i", str(concat),
                        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                        "-t", "13", "-map", "0:v:0", "-map", "1:a:0",
                        "-r", str(FPS), "-c:v", "libx264", "-preset", "medium",
                        "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
                        "-b:a", "192k", "-ar", "48000", "-ac", "2",
                        "-shortest", "-movflags", "+faststart", str(output)], check=True)
    print(f"Rendered {output}")


if __name__ == "__main__":
    main()
