"""Compose the four image-first Flow clips into the requested 13-second reel."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "flow-image-first-clips"
OUTPUT = ROOT / "output" / "flow-image-first-composite.mp4"

FPS = 24
WIDTH = 720
HEIGHT = 1280
SAMPLE_RATE = 48_000

SOURCES = (
    SOURCE_DIR / "01-intro-seoul.mp4",
    SOURCE_DIR / "02-seoul-tokyo.mp4",
    SOURCE_DIR / "03-tokyo-shanghai.mp4",
    SOURCE_DIR / "04-shanghai-hanoi.mp4",
)


def run() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required on PATH")
    missing = [str(path) for path in SOURCES if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing source clip(s): " + ", ".join(missing))

    # 144 source frames (6.000s) are stretched to 156 output frames (6.500s).
    # The next two clips use their opening transition windows; the final clip
    # uses its last 2 seconds so the composition ends on Flow's natural ending.
    filters = [
        "[0:v]trim=start_frame=0:end_frame=144,setpts=PTS-STARTPTS,setpts=PTS*13/12,fps=24,trim=duration=6.5,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,setsar=1[v0]",
        "[0:a]atrim=start=0:end=6,asetpts=PTS-STARTPTS,atempo=12/13,aresample=48000[a0]",
        "[1:v]trim=start_frame=0:end_frame=60,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,setsar=1[v1]",
        "[1:a]atrim=start=0:end=2.5,asetpts=PTS-STARTPTS,aresample=48000[a1]",
        "[2:v]trim=start_frame=0:end_frame=48,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,setsar=1[v2]",
        "[2:a]atrim=start=0:end=2,asetpts=PTS-STARTPTS,aresample=48000[a2]",
        "[3:v]trim=start_frame=48:end_frame=96,setpts=PTS-STARTPTS,scale=720:1280:flags=lanczos,setsar=1[v3]",
        "[3:a]atrim=start=2:end=4,asetpts=PTS-STARTPTS,aresample=48000[a3]",
        "[v0][a0][v1][a1][v2][a2][v3][a3]concat=n=4:v=1:a=1[vcat][acat]",
        "[vcat]trim=duration=13,setpts=PTS-STARTPTS,fps=24,scale=720:1280:flags=lanczos,setsar=1[vout]",
        "[acat]loudnorm=I=-16:TP=-1.5:LRA=11:linear=true,aresample=48000,atrim=duration=13,asetpts=PTS-STARTPTS[aout]",
    ]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        *(arg for source in SOURCES for arg in ("-i", str(source))),
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-t",
        "13",
        "-r",
        "24",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        str(OUTPUT),
    ]
    subprocess.run(command, check=True)
    print(f"Rendered {OUTPUT}")


if __name__ == "__main__":
    run()
