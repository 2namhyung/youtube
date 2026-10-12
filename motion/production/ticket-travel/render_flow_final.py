"""Render the ticket reel with moving character pixels from Google Flow.

The boarding-pass artwork and edit are kept deterministic in ``render_ticket``.
Only the character plates are replaced with frames from the downloaded Flow
clips, with a soft studio-background matte applied before they enter a card.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

from render_ticket import FPS, FRAMES, H, W, card_frame, ticket_card


ROOT = Path(__file__).resolve().parent
FLOW = ROOT / "assets" / "flow-clips"
OUTPUT = ROOT / "output" / "ticket-travel-flow-stabilized.mp4"
NAMES = ("pink", "blue", "neutral", "city")
ACTOR_SIZE = (190, 590)
ACTOR_CANVAS = (270, 615)
TOTAL_FRAMES = 13 * FPS


def load_flow(name: str) -> np.ndarray:
    """Decode one 360x640/24fps Flow clip as RGB frames."""
    path = FLOW / f"{name}-flow.mp4"
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    )
    return np.frombuffer(raw, dtype=np.uint8).reshape((-1, 640, 360, 3))


def flow_cutout(frame: np.ndarray) -> Image.Image:
    """Make a fixed-size, decontaminated alpha cutout from a Flow frame.

    The side strips provide a per-row studio-white reference.  The actor is
    then normalized to a fixed local bbox before entering the ticket, so Flow
    bbox/scale drift cannot become visible in the final edit.  Edge pixels are
    sampled from the eroded interior rather than the white studio field; this
    removes the white fringe that the old 1.15px feather left behind.
    """
    a = frame.astype(np.int16)
    side = np.concatenate((a[:, :24], a[:, -24:]), axis=1)
    row_bg = np.median(side, axis=1, keepdims=True)
    dist = np.sqrt(((a - row_bg) ** 2).sum(axis=2))
    gray = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    seed = (dist > 25.0) | (gray < 180.0) | (sat > 25.0)

    labels, count = ndimage.label(seed, structure=np.ones((3, 3), dtype=bool))
    selected = np.zeros(seed.shape, dtype=bool)
    for label in range(1, count + 1):
        ys, xs = np.where(labels == label)
        if len(xs) < 300:
            continue
        # Keep central figure components; the side/background components are
        # discarded even when a floor gradient touches the frame edge.
        if xs.max() < 35 or xs.min() > 325:
            continue
        if ys.min() > 220:
            continue
        selected |= labels == label

    if not selected.any():
        # Defensive fallback for an unusually bright frame: keep only the
        # central band, still avoiding a full rectangular source panel.
        selected[:, 48:312] = True

    selected = ndimage.binary_closing(selected, iterations=2)
    selected = ndimage.binary_fill_holes(selected)
    # Remove any remaining floor tail below the connected silhouette's extent.
    ys, xs = np.where(selected)
    if len(xs):
        bottom = min(selected.shape[0], int(ys.max()) + 5)
        selected[bottom:] = False

    # Erode the matte before sampling RGB.  A tiny antialias is applied only
    # after decontamination; there is no broad white/gray feather.
    core = ndimage.binary_erosion(selected, iterations=3)
    if not core.any():
        core = selected
    _, indices = ndimage.distance_transform_edt(~core, return_indices=True)
    clean = frame.copy()
    shell = selected & ~core
    clean[shell] = frame[indices[0][shell], indices[1][shell]]
    bbox = Image.fromarray((core.astype(np.uint8) * 255), "L").getbbox()
    if not bbox:
        return Image.fromarray(frame, "RGB").convert("RGBA")
    left, top, right, bottom = bbox
    src = clean[top:bottom, left:right]
    matte = core[top:bottom, left:right].astype(np.uint8) * 255
    # Resize every frame to the exact same actor bbox.  This is deliberately a
    # controlled affine normalization, not a person.height-derived resize.
    fg = Image.fromarray(src, "RGB").resize(ACTOR_SIZE, Image.Resampling.LANCZOS)
    alpha = Image.fromarray(matte, "L").resize(ACTOR_SIZE, Image.Resampling.LANCZOS)
    plate = Image.new("RGBA", ACTOR_CANVAS, (0, 0, 0, 0))
    plate.alpha_composite(Image.merge("RGBA", (*fg.split(), alpha)),
                          ((ACTOR_CANVAS[0] - ACTOR_SIZE[0]) // 2,
                           ACTOR_CANVAS[1] - ACTOR_SIZE[1]))
    return plate


def source_index(look: int, frame: int, clip: np.ndarray) -> int:
    """Map the 30fps edit to an action-rich window in a 24fps Flow clip."""
    if look == 0:
        # Pink begins with a ticket animation; start once the person is clear.
        start, span = 1.15, 2.15
        local = max(0, frame - 134) / FPS
    else:
        start, span = 0.15, 3.05
        starts = (200, 267, 334)
        local = max(0, frame - starts[look - 1]) / FPS
    idx = round((start + min(1.0, local / max(span, 0.001)) * span) * 24)
    return max(0, min(len(clip) - 1, idx))


def intro_frame(frame: np.ndarray, n: int) -> Image.Image:
    """Use the intro clip with a fixed camera crop (no scale drift)."""
    src = Image.fromarray(frame, "RGB")
    scale = max(W / src.width, H / src.height)
    nw, nh = round(src.width * scale), round(src.height * scale)
    im = src.resize((nw, nh), Image.Resampling.LANCZOS)
    top = round((nh - H) / 2)
    left = round((nw - W) / 2)
    left = max(0, min(nw - W, left))
    top = max(0, min(nh - H, top))
    return im.crop((left, top, left + W, top + H))


def needed_looks(frame: int) -> list[int]:
    if frame < 150:
        return [0]
    starts = {200: (0, 1), 267: (1, 2), 334: (2, 3)}
    for start, pair in starts.items():
        if start <= frame < start + 8:
            return list(pair)
    return [0 if frame < 200 else 1 if frame < 267 else 2 if frame < 334 else 3]


def run() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    clips = [load_flow("intro"), *[load_flow(name) for name in NAMES]]
    # clips[0] is intro; card looks are clips[1:5].
    ffmpeg = "ffmpeg"
    cmd = [
        ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
        "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(OUTPUT),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for n in range(TOTAL_FRAMES):
            if n < 134:
                # The downloaded intro contains its own ticket animation after
                # roughly 2.3s.  Stretch only the preceding traveler action so
                # that Flow's card never leaks into the deterministic design.
                intro_idx = min(round(n * 52 / 133), 52)
                image = intro_frame(clips[0][intro_idx], n)
            else:
                cards = [None] * 4
                for look in needed_looks(n):
                    clip = clips[look + 1]
                    rgba = flow_cutout(clip[source_index(look, n, clip)])
                    cards[look] = ticket_card(look, rgba)
                image = card_frame(cards, n).convert("RGB")
            proc.stdin.write(image.tobytes())
    finally:
        proc.stdin.close()
    code = proc.wait()
    if code:
        raise RuntimeError(f"ffmpeg encoder failed with exit code {code}")

    contact = OUTPUT.parent / "flow-stabilized-contact.jpg"
    select = "select='eq(n\\,100)+eq(n\\,165)+eq(n\\,230)+eq(n\\,295)+eq(n\\,360)'"
    subprocess.run([
        ffmpeg, "-y", "-loglevel", "error", "-i", str(OUTPUT), "-vf",
        f"{select},scale=216:-1:flags=lanczos,tile=5x1:padding=8:margin=8:color=0xf4f1ea",
        "-vsync", "0", "-frames:v", "1", "-q:v", "3", str(contact),
    ], check=True)
    print(f"Rendered {OUTPUT}")
    print(f"Contact sheet {contact}")


if __name__ == "__main__":
    run()
