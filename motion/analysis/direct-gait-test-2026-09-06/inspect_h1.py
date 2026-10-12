"""Bounded inspection of the H1 head-stability Flow output."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
DOWNLOAD = Path(r"C:\Users\every\Downloads\Edit_only_the_head_performance_202609061709.mp4")
SCENE_DOWNLOAD = Path(r"C:\Users\every\Downloads\Woman_walking_in_hanbok_202609061706.mp4")
FLOW = HERE / "flow-head-stable-H1-direct-download-10s.mp4"
SCENE_FLOW = HERE / "flow-head-stable-H1-10s.mp4"
BASELINE_RAW = HERE / "canonical-hanbok-1.00x-2s.mp4"
BASELINE_FAST = HERE / "canonical-hanbok-1.80x-2s.mp4"
START = 2.5
RAW_SECONDS = 2.0
FAST_SOURCE_SECONDS = 3.6
OUTPUT_SECONDS = 2.0
FPS = 24
FRAMES = 48


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    data = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout)
    stream = next(s for s in data["streams"] if s.get("codec_type", "video") == "video")
    return {"codec": stream.get("codec_name"), "width": stream.get("width"), "height": stream.get("height"),
            "r_frame_rate": stream.get("r_frame_rate"), "avg_frame_rate": stream.get("avg_frame_rate"),
            "nb_frames": stream.get("nb_frames"), "duration": stream.get("duration"),
            "format_duration": data.get("format", {}).get("duration")}


def extract_raw(input_path: Path, destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(input_path),
         "-vf", f"trim=start={START}:duration={RAW_SECONDS},setpts=PTS-STARTPTS",
         "-an", "-frames:v", str(FRAMES), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination)])


def extract_fast(destination: Path) -> None:
    # The 1.80x window is source 2.5–6.1s, output 2.0s; no card/head/matte change.
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(FLOW),
         "-vf", f"trim=start={START}:duration={FAST_SOURCE_SECONDS},setpts=PTS-STARTPTS,setpts=PTS/1.8",
         "-an", "-frames:v", str(FRAMES), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination)])


def frame(path: Path, index: int, destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-vf", f"select=eq(n\\,{index})", "-frames:v", "1", str(destination)])


def make_side_by_side(paths: list[tuple[str, Path]], destination: Path) -> None:
    inputs = [item for _, path in paths for item in ("-i", str(path))]
    filters = []
    for index, (label, _) in enumerate(paths):
        safe = label.replace("'", "\\'")
        filters.append(f"[{index}:v]scale=480:852,drawtext=text='{safe}':x=12:y=12:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.65[v{index}]")
    filters.append("[v0][v1]hstack=inputs=2[out]")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filters), "-map", "[out]", "-an", "-frames:v", str(FRAMES),
         "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(destination)])


def make_contact(paths: list[tuple[str, Path]], destination: Path) -> None:
    times = (0.0, 0.4, 0.8, 1.2, 1.6, 1.958333)
    cell_w, cell_h, label_h = 300, 250, 32
    sheet = Image.new("RGB", (cell_w * len(paths), (cell_h + label_h) * len(times) * 2), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    temp: list[Path] = []
    try:
        for section, crop in (("head", (120, 70, 600, 570)), ("feet", (50, 760, 670, 1270))):
            section_offset = 0 if section == "head" else len(times)
            for row, timestamp in enumerate(times):
                for col, (label, path) in enumerate(paths):
                    idx = round(timestamp * FPS)
                    tmp = HERE / f".h1-contact-{section}-{row}-{col}.jpg"
                    frame(path, idx, tmp)
                    temp.append(tmp)
                    image = Image.open(tmp).convert("RGB").crop(crop)
                    image = ImageOps.contain(image, (cell_w - 8, cell_h - 8), Image.Resampling.LANCZOS)
                    x = col * cell_w + (cell_w - image.width) // 2
                    y = (row + section_offset) * (cell_h + label_h) + label_h + (cell_h - image.height) // 2
                    sheet.paste(image, (x, y))
                    draw.text((col * cell_w + 5, (row + section_offset) * (cell_h + label_h) + 6),
                              f"{section} {label} t={timestamp:.2f} F{idx}", fill="white", font=font)
    finally:
        for path in temp:
            path.unlink(missing_ok=True)
    sheet.save(destination, quality=95)


def make_head_overview(path: Path, destination: Path) -> None:
    times = tuple(round(i * 0.5, 2) for i in range(20))
    cell_w, cell_h, label_h = 180, 170, 26
    sheet = Image.new("RGB", (cell_w * 5, (cell_h + label_h) * 4), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    temp: list[Path] = []
    try:
        for i, timestamp in enumerate(times):
            idx = min(round(timestamp * FPS), 239)
            tmp = HERE / f".h1-overview-{i}.jpg"
            frame(path, idx, tmp)
            temp.append(tmp)
            image = Image.open(tmp).convert("RGB").crop((120, 70, 600, 570))
            image = ImageOps.contain(image, (cell_w - 6, cell_h - 6), Image.Resampling.LANCZOS)
            col, row = i % 5, i // 5
            x = col * cell_w + (cell_w - image.width) // 2
            y = row * (cell_h + label_h) + label_h + (cell_h - image.height) // 2
            sheet.paste(image, (x, y))
            draw.text((col * cell_w + 4, row * (cell_h + label_h) + 5), f"t={timestamp:.1f}s F{idx}", fill="white", font=font)
    finally:
        for path in temp:
            path.unlink(missing_ok=True)
    sheet.save(destination, quality=95)


def main() -> None:
    if not DOWNLOAD.exists():
        raise FileNotFoundError(DOWNLOAD)
    if not FLOW.exists():
        shutil.copy2(DOWNLOAD, FLOW)
    if not SCENE_FLOW.exists() and SCENE_DOWNLOAD.exists():
        shutil.copy2(SCENE_DOWNLOAD, SCENE_FLOW)
    for path in (FLOW, SCENE_FLOW, BASELINE_RAW, BASELINE_FAST):
        if not path.exists():
            raise FileNotFoundError(path)

    raw_extract = HERE / "flow-head-stable-H1-source2.5-2s.mp4"
    scene_raw_extract = HERE / "flow-head-stable-H1-scene-export-source2.5-2s.mp4"
    fast_extract = HERE / "flow-head-stable-H1-1.80x-2s.mp4"
    comparison = HERE / "flow-head-stable-H1-original1.80x-vs-H1-1.80x-2s.mp4"
    provenance_comparison = HERE / "flow-head-stable-H1-direct-vs-scene-export-2.5-2s.mp4"
    contact = HERE / "flow-head-stable-H1-head-feet-contact.jpg"
    overview = HERE / "flow-head-stable-H1-head-overview.jpg"
    extract_raw(FLOW, raw_extract)
    extract_raw(SCENE_FLOW, scene_raw_extract)
    extract_fast(fast_extract)
    make_side_by_side([("original 1.80x", BASELINE_FAST), ("H1 1.80x", fast_extract)], comparison)
    make_side_by_side([("H1 direct", raw_extract), ("H1 scene export", scene_raw_extract)], provenance_comparison)
    make_contact([("original 1.00x", BASELINE_RAW), ("H1 raw", raw_extract),
                  ("original 1.80x", BASELINE_FAST), ("H1 1.80x", fast_extract)], contact)
    make_head_overview(FLOW, overview)
    for path in (FLOW, SCENE_FLOW, raw_extract, scene_raw_extract, fast_extract, comparison, provenance_comparison):
        run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])

    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Bounded H1 head-stability review at source 2.5s with raw and 1.80x windows",
        "flow_input": {"path": str(FLOW), "downloaded_raw_preserved": True, "download_kind": "direct video download", "probe": probe(FLOW), "sha256": sha256(FLOW)},
        "scene_export_input": {"path": str(SCENE_FLOW), "downloaded_raw_preserved": True, "probe": probe(SCENE_FLOW), "sha256": sha256(SCENE_FLOW)},
        "window": {
            "source_start_seconds": START, "raw_source_window_seconds": [START, START + RAW_SECONDS],
            "retimed_source_window_seconds": [START, START + FAST_SOURCE_SECONDS],
            "output_seconds": OUTPUT_SECONDS, "fps": FPS, "frames": FRAMES,
            "raw_extract": "2.5–4.5s raw normal playback; no retime",
            "retimed_extract": "2.5–6.1s source mapped to 2.0s at 1.80x; nominal endpoints",
        },
        "comparison": {"columns": ["original 1.80x", "H1 1.80x"], "resize_only_for_comparison": True,
                       "width": 960, "height": 852, "fps": FPS, "frames": FRAMES, "seconds": OUTPUT_SECONDS},
        "provenance_comparison": {"columns": ["H1 direct download", "H1 scene export"], "window": "source 2.5–4.5s nominal",
                                   "resize_only_for_comparison": True, "width": 960, "height": 852,
                                   "fps": FPS, "frames": FRAMES, "seconds": OUTPUT_SECONDS},
        "review_questions": {
            "head_down_interval_source_seconds": [2.5, 3.5],
            "exact_eye_gaze": "UNKNOWN",
            "foot_phase_quantification": "NOT_REQUESTED",
            "qualitative_targets": ["head upright/chin level", "simultaneous foot pose preservation", "face/colour side effects"],
        },
        "limits": ["H1 is a generated take; no exact identity/phase measurement", "comparison resize does not alter playback speed",
                   "no claim of universal Flow behavior", "no card/head/matte/production/wiki changes"],
        "artifacts": {},
    }
    for path in (FLOW, SCENE_FLOW, BASELINE_RAW, BASELINE_FAST, raw_extract, scene_raw_extract,
                 fast_extract, comparison, provenance_comparison, contact, overview):
        metadata["artifacts"][str(path)] = {"sha256": sha256(path), "bytes": path.stat().st_size,
                                             "probe": probe(path) if path.suffix.lower() == ".mp4" else None}
    (HERE / "flow-h1-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "flow-h1-README.md").write_text(
        "# Flow H1 head-stability inspection\n\n"
        "H1 is preserved as a raw 10-second download. The review uses source 2.5–4.5s at normal playback and source 2.5–6.1s retimed to 1.80x for a 2.0s output (24fps/48 frames). The 1.80x side-by-side is original 1.80x versus H1 1.80x; comparison panels only are resized.\n\n"
        "- [Raw H1 direct-download copy](flow-head-stable-H1-direct-download-10s.mp4)\n"
        "- [Earlier scene-export copy (preserved)](flow-head-stable-H1-10s.mp4)\n"
        "- [H1 raw source 2.5–4.5s](flow-head-stable-H1-source2.5-2s.mp4)\n"
        "- [Scene-export source 2.5–4.5s](flow-head-stable-H1-scene-export-source2.5-2s.mp4)\n"
        "- [H1 1.80x source 2.5–6.1s](flow-head-stable-H1-1.80x-2s.mp4)\n"
        "- [Original 1.80x vs H1 1.80x](flow-head-stable-H1-original1.80x-vs-H1-1.80x-2s.mp4)\n"
        "- [Direct download vs scene export](flow-head-stable-H1-direct-vs-scene-export-2.5-2s.mp4)\n"
        "- [Head/feet contact sheet](flow-head-stable-H1-head-feet-contact.jpg)\n"
        "- [Full-ten-second head overview](flow-head-stable-H1-head-overview.jpg)\n"
        "- [Metadata](flow-h1-metadata.json)\n"
        "- [Inspection script](inspect_h1.py)\n"
        "- [Result report](FLOW_H1_REPORT.md)\n\n"
        "Exact eye gaze is UNKNOWN; foot-phase quantification was not attempted. Visual review is limited to the stated head-down interval and regression checks. No source, production, Flow, upload, or wiki file was modified.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
