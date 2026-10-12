"""Reproducible, analysis-only measurements for a public reference video.

The script preserves the source bytes and writes only derived metadata,
contact sheets, and candidate change scores. It does not assert shot labels,
rights, or production readiness.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


SOURCE_URL = "https://youtube.com/shorts/VQazcEuV9Xw?si=ItY8QKfQsT2nwNzT"
ACQUISITION_DATE = "2026-09-23"
ANALYSIS_NOTICE = (
    "Analysis-only copy of a public reference. No reuse or public license was verified; "
    "not production authority."
)


def run_json(command: list[str]) -> dict:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(completed.stdout)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def ffmpeg_frame(source: Path, seconds: float) -> Image.Image:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{seconds:.3f}",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
    ]
    completed = subprocess.run(command, check=True, capture_output=True)
    return Image.open(io.BytesIO(completed.stdout)).convert("RGB")


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ("C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def contact_sheets(source: Path, output_dir: Path, duration: float) -> list[str]:
    cell_w, cell_h = 180, 320
    columns, rows = 6, 4
    sheet_paths: list[str] = []
    timestamps = list(range(math.ceil(duration)))
    for sheet_index in range(math.ceil(len(timestamps) / (columns * rows))):
        page = timestamps[sheet_index * columns * rows : (sheet_index + 1) * columns * rows]
        sheet = Image.new("RGB", (columns * cell_w, rows * (cell_h + 24)), "#141414")
        draw = ImageDraw.Draw(sheet)
        label_font = font(16)
        for cell_index, seconds in enumerate(page):
            frame = ffmpeg_frame(source, min(float(seconds), max(duration - 0.01, 0)))
            thumb = ImageOps.contain(frame, (cell_w, cell_h), method=Image.Resampling.LANCZOS)
            x = (cell_index % columns) * cell_w
            y = (cell_index // columns) * (cell_h + 24)
            sheet.paste(thumb, (x + (cell_w - thumb.width) // 2, y))
            draw.rectangle((x, y + cell_h, x + cell_w, y + cell_h + 24), fill="#000000")
            draw.text((x + 5, y + cell_h + 3), f"t={seconds:02d}s", fill="#ffffff", font=label_font)
        destination = output_dir / f"contact-sheet-{sheet_index + 1:02d}.png"
        sheet.save(destination, optimize=True)
        sheet_paths.append(str(destination))
    return sheet_paths


def roi_scores(source: Path, output_dir: Path, duration: float, width: int, height: int) -> tuple[dict, list[str]]:
    # Full-frame dimensions are measured before selecting this source-specific ROI.
    # y=170..440 excludes the fixed title and the burned-in lower captions visible
    # in this reference, retaining the central photo/character composition.
    roi = {"x": 0, "y": 170, "width": width, "height": 270, "reason": "source-specific central visual region; excludes title and lower captions"}
    samples = []
    previous: Image.Image | None = None
    for seconds in range(math.ceil(duration)):
        frame = ffmpeg_frame(source, min(float(seconds), max(duration - 0.01, 0)))
        current = frame.crop((roi["x"], roi["y"], roi["x"] + roi["width"], roi["y"] + roi["height"])).resize((90, 140))
        if previous is None:
            score = None
        else:
            pixels_a = list(previous.convert("L").getdata())
            pixels_b = list(current.convert("L").getdata())
            score = round(sum(abs(a - b) for a, b in zip(pixels_a, pixels_b)) / len(pixels_a) / 255, 6)
        samples.append({"timeSeconds": seconds, "roiMeanAbsoluteDifference": score})
        previous = current

    scored = [row for row in samples if row["roiMeanAbsoluteDifference"] is not None]
    ranked = sorted(scored, key=lambda row: row["roiMeanAbsoluteDifference"], reverse=True)
    candidates = [
        {
            "timeSeconds": row["timeSeconds"],
            "score": row["roiMeanAbsoluteDifference"],
            "basis": "1-second central-ROI frame difference; candidate only",
        }
        for row in ranked[: min(12, len(ranked))]
    ]
    scores_path = output_dir / "roi-change-scores.json"
    scores_path.write_text(json.dumps({"roi": roi, "samples": samples, "candidates": candidates}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"roi": roi, "sampleCount": len(samples), "sampledCandidateCount": len(candidates)}, [str(scores_path)]


def ffmpeg_scene_candidates(source: Path, output_dir: Path) -> tuple[str, int]:
    log_path = output_dir / "ffmpeg-scene-score.log"
    filter_expr = "crop=iw:270:0:170,select='gt(scene,0.18)',metadata=print"
    command = ["ffmpeg", "-hide_banner", "-i", str(source), "-vf", filter_expr, "-an", "-f", "null", "-"]
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    raw = completed.stderr
    log_path.write_text(raw, encoding="utf-8")
    candidates = []
    pending_time = None
    for line in raw.splitlines():
        time_match = re.search(r"pts_time:([0-9.]+)", line)
        score_match = re.search(r"lavfi\.scene_score=([0-9.]+)", line)
        if time_match:
            pending_time = float(time_match.group(1))
        if score_match and pending_time is not None:
            candidates.append({"timeSeconds": round(pending_time, 6), "score": float(score_match.group(1)), "threshold": 0.18, "basis": "FFmpeg framewise scene score on central ROI; candidate only"})
            pending_time = None
    scene_path = output_dir / "ffmpeg-scene-candidates.json"
    scene_path.write_text(json.dumps({"roi": {"x": 0, "y": 170, "width": 360, "height": 270}, "threshold": 0.18, "candidates": candidates}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return str(scene_path), len(candidates)


def detail_contact_sheet(source: Path, output_dir: Path, name: str, timestamps: list[float]) -> str:
    cell_w, cell_h = 240, 360
    columns = 5
    rows = math.ceil(len(timestamps) / columns)
    sheet = Image.new("RGB", (columns * cell_w, rows * (cell_h + 28)), "#141414")
    draw = ImageDraw.Draw(sheet)
    label_font = font(18)
    for index, seconds in enumerate(timestamps):
        frame = ffmpeg_frame(source, min(seconds, 48.84)).crop((0, 170, 360, 440))
        thumb = ImageOps.contain(frame, (cell_w, cell_h), method=Image.Resampling.LANCZOS)
        x = (index % columns) * cell_w
        y = (index // columns) * (cell_h + 28)
        sheet.paste(thumb, (x + (cell_w - thumb.width) // 2, y))
        draw.rectangle((x, y + cell_h, x + cell_w, y + cell_h + 28), fill="#000000")
        draw.text((x + 5, y + cell_h + 4), f"t={seconds:04.2f}s", fill="#ffffff", font=label_font)
    destination = output_dir / f"detail-{name}.png"
    sheet.save(destination, optimize=True)
    return str(destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    probe = run_json(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)])
    video = next(stream for stream in probe["streams"] if stream.get("codec_type") == "video")
    audio = next((stream for stream in probe["streams"] if stream.get("codec_type") == "audio"), None)
    duration = float(probe["format"]["duration"])
    fps_num, fps_den = (int(value) for value in video["avg_frame_rate"].split("/"))
    metadata = {
        "schema": "reference-reverse-analysis-v1",
        "source": {
            "path": str(source),
            "sha256": sha256(source),
            "sizeBytes": source.stat().st_size,
            "acquisitionUrl": SOURCE_URL,
            "acquisitionDate": ACQUISITION_DATE,
            "analysisNotice": ANALYSIS_NOTICE,
        },
        "measured": {
            "durationSeconds": duration,
            "video": {"codec": video.get("codec_name"), "width": video["width"], "height": video["height"], "avgFrameRate": video["avg_frame_rate"], "fps": fps_num / fps_den, "frameCount": video.get("nb_frames")},
            "audio": None if audio is None else {"codec": audio.get("codec_name"), "sampleRate": audio.get("sample_rate"), "channels": audio.get("channels"), "durationSeconds": float(audio.get("duration", 0))},
        },
        "contactSheets": [],
        "roiAnalysis": {},
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "script": str(Path(__file__).resolve()),
    }
    metadata["contactSheets"] = contact_sheets(source, output_dir, duration)
    roi_summary, score_paths = roi_scores(source, output_dir, duration, video["width"], video["height"])
    scene_path, framewise_candidate_count = ffmpeg_scene_candidates(source, output_dir)
    metadata["roiAnalysis"] = {**roi_summary, "scoreFile": score_paths[0], "sceneCandidatesFile": scene_path, "framewiseCandidateCount": framewise_candidate_count}
    metadata["detailContactSheets"] = [
        detail_contact_sheet(source, output_dir, "drone-rise-19p5-23p0", [19.5 + 0.25 * i for i in range(15)]),
        detail_contact_sheet(source, output_dir, "robot-finger-43p5-48p5", [43.5 + 0.5 * i for i in range(11)]),
    ]
    metadata_path = output_dir / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"metadata": str(metadata_path), "contactSheets": metadata["contactSheets"], "scores": score_paths}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
