"""Assemble the four Flow first/last-frame clips into an exact 13-second reel.

The source clips are expected to be the 10-second Flow exports in
``assets/flow-frames-chained-clips``.  Two frames (1/12 s) of visual and audio
crossfade are retained at each join; the final output is trimmed to exactly
13 seconds after encoding.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "flow-frames-chained-clips"
OUTPUT = ROOT / "output" / "flow-frames-chained-13s.mp4"

FPS = 24
WIDTH = 720
HEIGHT = 1280
SAMPLE_RATE = 48_000
TRANSITION = 2 / FPS
TARGET_DURATIONS = (6.5, 2.5, 2.0, 2.0)

SOURCES = tuple(
    SOURCE_DIR / name
    for name in (
        "01-casual-seoul.mp4",
        "02-seoul-tokyo.mp4",
        "03-tokyo-shanghai.mp4",
        "04-shanghai-hanoi.mp4",
    )
)


def _video_filter(index: int, duration: float, source_duration: float) -> str:
    # Retiming the complete source is important: its final Flow keyframe must
    # arrive at the join, rather than being lost by a front-only trim.
    speed = duration / source_duration
    return (
        f"[{index}:v]setpts=PTS-STARTPTS,setpts=PTS*{speed:.9f},"
        f"trim=duration={duration:.6f},setpts=PTS-STARTPTS,fps={FPS},"
        f"settb=1/{FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos,setsar=1,"
        f"format=yuv420p[v{index}]"
    )


def _audio_filter(index: int, duration: float, source_duration: float) -> str:
    speed = source_duration / duration
    return (
        f"[{index}:a]asetpts=PTS-STARTPTS,atempo={speed:.9f},"
        f"atrim=duration={duration:.6f},asetpts=PTS-STARTPTS,"
        f"aresample={SAMPLE_RATE}[a{index}]"
    )


def _probe_duration(ffprobe: str, path: Path) -> float:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def run() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required on PATH")
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required on PATH")

    missing = [str(path) for path in SOURCES if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing source clip(s): " + ", ".join(missing))

    source_durations = tuple(_probe_duration(ffprobe, path) for path in SOURCES)
    # The first three clips carry a 2-frame tail for the next join.  The last
    # clip ends exactly at 13.000 s, so its generated end keyframe is retained.
    retimed_durations = tuple(
        duration + (TRANSITION if index < len(TARGET_DURATIONS) - 1 else 0)
        for index, duration in enumerate(TARGET_DURATIONS)
    )
    filters = [
        *(
            part
            for index, (duration, source_duration) in enumerate(
                zip(retimed_durations, source_durations)
            )
            for part in (
                _video_filter(index, duration, source_duration),
                _audio_filter(index, duration, source_duration),
            )
        ),
        f"[v0][v1]xfade=transition=fade:duration={TRANSITION:.6f}:offset=6.5[v01]",
        f"[v01][v2]xfade=transition=fade:duration={TRANSITION:.6f}:offset=9.0[v012]",
        f"[v012][v3]xfade=transition=fade:duration={TRANSITION:.6f}:offset=11.0[v123]",
        f"[a0][a1]acrossfade=d={TRANSITION:.6f}:c1=tri:c2=tri[a01]",
        f"[a01][a2]acrossfade=d={TRANSITION:.6f}:c1=tri:c2=tri[a012]",
        f"[a012][a3]acrossfade=d={TRANSITION:.6f}:c1=tri:c2=tri[a123]",
        f"[v123]trim=duration=13,setpts=PTS-STARTPTS,fps={FPS},"
        f"scale={WIDTH}:{HEIGHT}:flags=lanczos,setsar=1[vout]",
        f"[a123]loudnorm=I=-16:TP=-1.5:LRA=11:linear=true,"
        f"aresample={SAMPLE_RATE},atrim=duration=13,asetpts=PTS-STARTPTS[aout]",
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
        str(FPS),
        "-fps_mode",
        "cfr",
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
