"""Inspect Flow A against unchanged 1.00x/1.80x local gait candidates."""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FLOW = HERE / "flow-direct-gait-A-10s.mp4"
SOURCE = ROOT / "production" / "ticket-travel" / "performance-v2" / "canonical-hanbok-10s.mp4"
BASELINE = HERE / "canonical-hanbok-1.00x-2s.mp4"
FAST = HERE / "canonical-hanbok-1.80x-2s.mp4"
START = 2.5
SECONDS = 2.0
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
            "nb_frames": stream.get("nb_frames"), "duration": data.get("format", {}).get("duration")}


def extract_flow(destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(FLOW),
         "-vf", f"trim=start={START}:duration={SECONDS},setpts=PTS-STARTPTS", "-an",
         "-frames:v", str(FRAMES), "-r", str(FPS), "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination)])


def make_comparison(paths: list[tuple[str, Path]], destination: Path) -> None:
    inputs = [item for _, path in paths for item in ("-i", str(path))]
    filters = []
    for index, (label, _) in enumerate(paths):
        safe = label.replace("'", "\\'")
        filters.append(f"[{index}:v]scale=480:852,drawtext=text='{safe}':x=12:y=12:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.65[v{index}]")
    filters.append("[v0][v1][v2]hstack=inputs=3[out]")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filters), "-map", "[out]", "-an", "-frames:v", str(FRAMES),
         "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(destination)])


def frame(path: Path, index: int, destination: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-vf", f"select=eq(n\\,{index})", "-frames:v", "1", str(destination)])


def make_contact(paths: list[tuple[str, Path]], destination: Path) -> None:
    times = (0.0, 0.4, 0.8, 1.2, 1.6, 1.958333)
    cell_w, cell_h, label_h = 360, 300, 32
    sheet = Image.new("RGB", (cell_w * 3, (cell_h + label_h) * len(times) * 2), "#202020")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    temp: list[Path] = []
    try:
        for section, crop in (("head", (120, 70, 600, 570)), ("feet", (50, 760, 670, 1270))):
            section_offset = 0 if section == "head" else len(times)
            for row, timestamp in enumerate(times):
                for col, (label, path) in enumerate(paths):
                    idx = round(timestamp * FPS)
                    tmp = HERE / f".contact-{section}-{row}-{col}.jpg"
                    frame(path, idx, tmp)
                    temp.append(tmp)
                    image = Image.open(tmp).convert("RGB").crop(crop)
                    image = ImageOps.contain(image, (cell_w - 8, cell_h - 8), Image.Resampling.LANCZOS)
                    x = col * cell_w + (cell_w - image.width) // 2
                    y = (row + section_offset) * (cell_h + label_h) + label_h + (cell_h - image.height) // 2
                    sheet.paste(image, (x, y))
                    title = f"{section} {label} t={timestamp:.2f}s F{idx}"
                    draw.text((col * cell_w + 6, (row + section_offset) * (cell_h + label_h) + 6), title, fill="white", font=font)
    finally:
        for path in temp:
            path.unlink(missing_ok=True)
    sheet.save(destination, quality=95)


def main() -> None:
    for path in (FLOW, SOURCE, BASELINE, FAST):
        if not path.exists():
            raise FileNotFoundError(path)
    flow_extract = HERE / "flow-direct-gait-A-source2.5-2s.mp4"
    comparison = HERE / "direct-gait-original1.00x-flowA-original1.80x-2s.mp4"
    contact = HERE / "direct-gait-flowA-head-feet-contact.jpg"
    extract_flow(flow_extract)
    paths = [("original 1.00x", BASELINE), ("Flow A raw", flow_extract), ("original 1.80x", FAST)]
    make_comparison(paths, comparison)
    make_contact(paths, contact)
    for _, path in paths:
        run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])
    run(["ffmpeg", "-v", "error", "-i", str(comparison), "-f", "null", "-"])
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Raw Flow A gait inspection at the same source start/window as local 1.00x and 1.80x candidates",
        "flow_input": {"path": str(FLOW), "downloaded_raw_preserved": True, "probe": probe(FLOW), "sha256": sha256(FLOW)},
        "source": {"path": str(SOURCE), "probe": probe(SOURCE), "sha256": sha256(SOURCE)},
        "window": {"source_start_seconds": START, "output_seconds": SECONDS, "fps": FPS, "frames": FRAMES,
                    "flow_extract": "2.5–4.5s raw normal playback; no retime"},
        "comparison": {"columns": ["original 1.00x", "Flow A raw", "original 1.80x"],
                       "resize_only_for_comparison": True, "width": 1440, "height": 852,
                       "fps": FPS, "frames": FRAMES, "seconds": SECONDS},
        "foot_phase": {"status": "NOT_MEASURABLE", "reason": "visual contact sheet only; clothing hem and generated take differences prevent reliable left/right contact and trajectory tracking"},
        "head_feet_contact": {"status": "visual_review_artifact", "exact_eye_gaze": "UNKNOWN"},
        "artifacts": {},
        "limits": ["Flow A is kept at raw normal playback; no claim that Flow universally changes gait", "comparison resize does not alter playback speed", "no card/head/matte/production changes"],
    }
    for path in (FLOW, SOURCE, BASELINE, FAST, flow_extract, comparison, contact):
        metadata["artifacts"][str(path)] = {"sha256": sha256(path), "bytes": path.stat().st_size,
                                             "probe": probe(path) if path.suffix.lower() == ".mp4" else None}
    (HERE / "flow-a-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "flow-a-README.md").write_text(
        "# Flow A direct-gait inspection\n\n"
        "Flow A is preserved as a raw 10-second download. The extracted review window is source 2.5–4.5s at normal playback, 720×1280/24fps/48 frames. The three-column comparison is original 1.00×, Flow A raw, and original 1.80×; only the comparison panels are resized to 480×852.\n\n"
        "- [Raw Flow A copy](flow-direct-gait-A-10s.mp4)\n"
        "- [Flow A source 2.5–4.5s](flow-direct-gait-A-source2.5-2s.mp4)\n"
        "- [Three-column comparison](direct-gait-original1.00x-flowA-original1.80x-2s.mp4)\n"
        "- [Head/feet contact sheet](direct-gait-flowA-head-feet-contact.jpg)\n"
        "- [Metadata](flow-a-metadata.json)\n"
        "- [Inspection script](inspect_flow_a.py)\n\n"
        "Selected-frame visual review cannot establish left/right foot-contact period or exact eye gaze; both remain NOT_MEASURABLE/UNKNOWN. Flow A remains raw normal playback, so no universal Flow gait claim is made. All review MP4s were ffmpeg-decoded; no source, production, Flow, upload, or wiki file was modified.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
