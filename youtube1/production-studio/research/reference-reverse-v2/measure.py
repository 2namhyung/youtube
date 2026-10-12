"""Analysis-only measurements for one public reference video.

The script reads the existing VQazcEuV9Xw source bytes from the v1 source
directory and writes only derived evidence under this v2 directory. It does
not infer semantic shot names, rights, or production approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


SOURCE_URL = "https://youtube.com/shorts/VQazcEuV9Xw?si=ItY8QKfQsT2nwNzT"
ROI = {"x": 0, "y": 170, "width": 360, "height": 270}
SCENE_THRESHOLD = 0.18


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(source: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def scene_candidates(source: Path, output_dir: Path) -> tuple[list[dict], str]:
    log_path = output_dir / "measurements" / "ffmpeg-scene-score.log"
    filter_expr = "crop=iw:270:0:170,select='gt(scene,0.18)',metadata=print"
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-vf", filter_expr, "-an", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    log_path.write_text(result.stderr, encoding="utf-8")
    candidates: list[dict] = []
    pending_time: float | None = None
    for line in result.stderr.splitlines():
        time_match = re.search(r"pts_time:([0-9.]+)", line)
        score_match = re.search(r"lavfi\.scene_score=([0-9.]+)", line)
        if time_match:
            pending_time = float(time_match.group(1))
        if score_match is not None and pending_time is not None:
            candidates.append(
                {
                    "candidateIndex": len(candidates) + 1,
                    "timeSeconds": round(pending_time, 6),
                    "sceneScore": float(score_match.group(1)),
                    "threshold": SCENE_THRESHOLD,
                    "framewiseCandidateOnly": True,
                }
            )
            pending_time = None
    return candidates, str(log_path)


def image_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def crop_roi(image: Image.Image) -> Image.Image:
    return image.crop((ROI["x"], ROI["y"], ROI["x"] + ROI["width"], ROI["y"] + ROI["height"]))


def make_page(images: dict[int, Image.Image], items: list[tuple[int, str]], output: Path, *, cell: tuple[int, int], columns: int, rows_per_page: int) -> list[str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h = cell
    label_h = 30
    paths: list[str] = []
    per_page = columns * rows_per_page
    for page_index in range(math.ceil(len(items) / per_page)):
        group = items[page_index * per_page : (page_index + 1) * per_page]
        canvas = Image.new("RGB", (columns * cell_w, rows_per_page * (cell_h + label_h)), "#121212")
        draw = ImageDraw.Draw(canvas)
        label_font = image_font(16)
        for index, (frame_index, label) in enumerate(group):
            x = (index % columns) * cell_w
            y = (index // columns) * (cell_h + label_h)
            thumbnail = ImageOps.contain(images[frame_index], (cell_w, cell_h), method=Image.Resampling.LANCZOS)
            canvas.paste(thumbnail, (x + (cell_w - thumbnail.width) // 2, y))
            draw.rectangle((x, y + cell_h, x + cell_w, y + cell_h + label_h), fill="#000000")
            draw.text((x + 4, y + cell_h + 6), label, fill="#ffffff", font=label_font)
        destination = output.parent / f"{output.stem}-{page_index + 1:02d}.png"
        canvas.save(destination, optimize=True)
        paths.append(str(destination))
    return paths


def make_candidate_pages(images: dict[int, Image.Image], candidate_pairs: list[dict], output_dir: Path) -> list[str]:
    cell_w, cell_h = 210, 158
    columns, rows = 4, 4
    label_h = 34
    paths: list[str] = []
    for page_index in range(math.ceil(len(candidate_pairs) / (columns * rows))):
        group = candidate_pairs[page_index * columns * rows : (page_index + 1) * columns * rows]
        canvas = Image.new("RGB", (columns * cell_w * 2, rows * (cell_h + label_h)), "#121212")
        draw = ImageDraw.Draw(canvas)
        label_font = image_font(14)
        for index, pair in enumerate(group):
            x = (index % columns) * cell_w * 2
            y = (index // columns) * (cell_h + label_h)
            for side, frame_index in (("before", pair["beforeFrameIndex"]), ("after", pair["afterFrameIndex"])):
                thumbnail = ImageOps.contain(crop_roi(images[frame_index]), (cell_w, cell_h), method=Image.Resampling.LANCZOS)
                side_x = x if side == "before" else x + cell_w
                canvas.paste(thumbnail, (side_x + (cell_w - thumbnail.width) // 2, y))
            draw.rectangle((x, y + cell_h, x + cell_w * 2, y + cell_h + label_h), fill="#000000")
            draw.text((x + 4, y + cell_h + 6), f"C{pair['candidateIndex']:02d} t={pair['timeSeconds']:.4f}s", fill="#ffffff", font=label_font)
        destination = output_dir / "evidence" / f"candidate-before-after-{page_index + 1:02d}.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(destination, optimize=True)
        paths.append(str(destination))
    return paths


class RawFrameReader:
    def __init__(self, source: Path, width: int, height: int):
        self.width = width
        self.height = height
        self.bytes_per_frame = width * height * 3
        self.process = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
            stdout=subprocess.PIPE,
        )

    def frames(self):
        assert self.process.stdout is not None
        index = 0
        while True:
            data = self.process.stdout.read(self.bytes_per_frame)
            if len(data) != self.bytes_per_frame:
                break
            yield index, np.frombuffer(data, dtype=np.uint8).reshape((self.height, self.width, 3)).copy()
            index += 1
        self.process.wait()
        if self.process.returncode != 0:
            raise RuntimeError(f"ffmpeg raw decode failed: {self.process.returncode}")


def block_motion(prev: np.ndarray, curr: np.ndarray) -> dict:
    """Fallback block matching when cv2/LK is unavailable; never called optical flow."""
    prev_small = np.asarray(Image.fromarray(prev).resize((180, 135), Image.Resampling.BILINEAR), dtype=np.float32)
    curr_small = np.asarray(Image.fromarray(curr).resize((180, 135), Image.Resampling.BILINEAR), dtype=np.float32)
    patch = 9
    radius = 8
    vectors = []
    for y in range(12, 124, 20):
        for x in range(12, 168, 20):
            template = prev_small[y - patch // 2 : y + patch // 2 + 1, x - patch // 2 : x + patch // 2 + 1]
            if float(template.std()) < 4.0:
                continue
            scores = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    candidate = curr_small[y + dy - patch // 2 : y + dy + patch // 2 + 1, x + dx - patch // 2 : x + dx + patch // 2 + 1]
                    if candidate.shape != template.shape:
                        continue
                    scores.append((float(np.mean((candidate - template) ** 2)), dx, dy))
            scores.sort()
            if len(scores) < 2:
                continue
            best, second = scores[0], scores[1]
            confidence = (second[0] - best[0]) / (second[0] + 1e-6)
            if confidence >= 0.08:
                vectors.append((best[1], best[2], confidence))
    if not vectors:
        return {"sampledPatchCount": 0, "acceptedPatchCount": 0, "medianDxPixelsAtHalfResolution": None, "medianDyPixelsAtHalfResolution": None, "medianConfidence": None, "inlierRatio": 0.0, "reliability": "failed-no-textured-patches"}
    arr = np.asarray(vectors, dtype=float)
    median = np.median(arr[:, :2], axis=0)
    inliers = np.linalg.norm(arr[:, :2] - median, axis=1) <= 2.0
    if not inliers.any():
        median_dx = None
        median_dy = None
    else:
        median_dx = round(float(median[0]), 4)
        median_dy = round(float(median[1]), 4)
    return {
        "sampledPatchCount": int(len(vectors)),
        "acceptedPatchCount": int(inliers.sum()),
        "medianDxPixelsAtHalfResolution": median_dx,
        "medianDyPixelsAtHalfResolution": median_dy,
        "medianConfidence": round(float(np.median(arr[:, 2])), 4),
        "inlierRatio": round(float(inliers.mean()), 4),
        "reliability": "fallback-block-match-with-background-contamination-risk" if inliers.mean() < 0.6 else "fallback-block-match",
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("production-studio/research/reference-reverse-v1/source/VQazcEuV9Xw.mp4"))
    parser.add_argument("--output", type=Path, default=Path("production-studio/research/reference-reverse-v2"))
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    evidence = output / "evidence"
    measurements = output / "measurements"
    evidence.mkdir(parents=True, exist_ok=True)
    measurements.mkdir(parents=True, exist_ok=True)

    metadata = probe(source)
    video = next(item for item in metadata["streams"] if item.get("codec_type") == "video")
    duration = float(metadata["format"]["duration"])
    fps_num, fps_den = (int(item) for item in video["avg_frame_rate"].split("/"))
    fps = fps_num / fps_den
    width, height = int(video["width"]), int(video["height"])
    candidates, scene_log = scene_candidates(source, output)
    source_hash = sha256(source)
    write_json(measurements / "source-probe.json", metadata)
    max_frame_index = int(video.get("nb_frames", 0)) - 1

    sample_times = [round(i * 0.5, 2) for i in range(int(math.floor(duration / 0.5)) + 1)]
    if sample_times[-1] < duration - 1e-6:
        sample_times.append(duration)
    pose_times = [round(44.0 + 0.1 * i, 2) for i in range(46)]
    candidate_frame_indices = set()
    for candidate in candidates:
        center = int(round(candidate["timeSeconds"] * fps))
        candidate["centerFrameIndex"] = center
        candidate["beforeFrameIndex"] = max(center - 1, 0)
        candidate["afterFrameIndex"] = min(center + 1, int(video.get("nb_frames", 0)) - 1)
        candidate["centerFrameTimeSeconds"] = round(center / fps, 6)
        candidate_frame_indices.update((candidate["beforeFrameIndex"], candidate["centerFrameIndex"], candidate["afterFrameIndex"]))

    image_indices = set(min(round(time * fps), max_frame_index) for time in sample_times + pose_times) | candidate_frame_indices
    movement_start = int(math.ceil(19.185833 * fps))
    movement_end = int(math.ceil(22.6226 * fps))
    movement_indices = set(range(movement_start, movement_end))
    full_images: dict[int, Image.Image] = {}
    movement_frames: list[tuple[int, float, np.ndarray]] = []
    reader = RawFrameReader(source, width, height)
    for index, rgb in reader.frames():
        if index in image_indices:
            full_images[index] = Image.fromarray(rgb)
        if index in movement_indices:
            gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.uint8)
            movement_frames.append((index, index / fps, gray[ROI["y"] : ROI["y"] + ROI["height"], ROI["x"] : ROI["x"] + ROI["width"]]))

    full_frame_map = [{"requestedTimeSeconds": time, "frameIndex": min(round(time * fps), max_frame_index), "actualTimeSeconds": round(min(round(time * fps), max_frame_index) / fps, 6)} for time in sample_times]
    full_items = [(row["frameIndex"], f"t={row['requestedTimeSeconds']:.2f}s") for row in full_frame_map]
    full_pages = make_page(full_images, full_items, evidence / "full-sample", cell=(180, 320), columns=4, rows_per_page=5)
    pose_frame_map = [{"requestedTimeSeconds": time, "frameIndex": min(round(time * fps), max_frame_index), "actualTimeSeconds": round(min(round(time * fps), max_frame_index) / fps, 6)} for time in pose_times]
    pose_items = [(row["frameIndex"], f"t={row['requestedTimeSeconds']:.2f}s") for row in pose_frame_map]
    pose_pages = make_page(full_images, pose_items, evidence / "pose-detail", cell=(180, 320), columns=5, rows_per_page=2)
    candidate_pages = make_candidate_pages(full_images, candidates, output)

    candidate_summary = []
    for candidate in candidates:
        before_path = evidence / "candidates" / f"candidate-{candidate['candidateIndex']:02d}-before.png"
        center_path = evidence / "candidates" / f"candidate-{candidate['candidateIndex']:02d}-center.png"
        after_path = evidence / "candidates" / f"candidate-{candidate['candidateIndex']:02d}-after.png"
        before_path.parent.mkdir(parents=True, exist_ok=True)
        crop_roi(full_images[candidate["beforeFrameIndex"]]).save(before_path, optimize=True)
        crop_roi(full_images[candidate["centerFrameIndex"]]).save(center_path, optimize=True)
        crop_roi(full_images[candidate["afterFrameIndex"]]).save(after_path, optimize=True)
        candidate_summary.append({**candidate, "beforeEvidence": str(before_path), "centerEvidence": str(center_path), "afterEvidence": str(after_path)})
    write_json(measurements / "candidate-before-after.json", {"roi": ROI, "candidates": candidate_summary, "contactSheets": candidate_pages})

    motion_records = []
    stride = 3
    sampled = movement_frames[::stride]
    for (from_index, from_time, from_frame), (to_index, to_time, to_frame) in zip(sampled, sampled[1:]):
        background = block_motion(from_frame[0:120, :], to_frame[0:120, :])
        lower_band = block_motion(from_frame[90:270, :], to_frame[90:270, :])
        motion_records.append({"fromFrameIndex": from_index, "toFrameIndex": to_index, "fromTimeSeconds": round(from_time, 6), "toTimeSeconds": round(to_time, 6), "backgroundBand": background, "lowerBand": lower_band})
    write_json(measurements / "drone-farmer-motion.json", {
        "interval": {"startSeconds": 19.185833, "endSeconds": 22.6226, "sourceFps": fps, "frameIndexRange": [movement_start, movement_end], "frameIndexSemantics": "half-open [start,end); comparisons use exact source frames start <= index < end"},
        "roi": ROI,
        "regionDefinitions": {
            "backgroundBand": {"x": 0, "y": 0, "width": 360, "height": 120, "roiRelative": True, "purpose": "technical static-background comparison; not a semantic label"},
            "lowerBand": {"x": 0, "y": 90, "width": 360, "height": 180, "roiRelative": True, "purpose": "technical lower-band comparison; may contain field, drone, farmer or captions at adjacent coordinates"},
        },
        "method": "fallback-patch-image-displacement-not-semantic-motion",
        "cv2Available": False,
        "cv2Failure": "Python cv2 is unavailable in the configured runtime; no package was installed.",
        "lkOpticalFlowOrRansacExecuted": False,
        "limitations": ["This is not LK optical flow or RANSAC affine estimation.", "Reported dx/dy are image-patch displacements only and must not be read as semantic drone/farmer motion.", "Central ROI contains sky, field and composited figures; background contamination, clipped initial state and identity drift after lower-band appearance remain explicit risks.", "Measurements do not recover the source easing curve or establish semantic shot meaning."],
        "samplingStrideFrames": stride,
        "records": motion_records,
    })
    write_json(measurements / "pose-transition-candidates.json", {
        "interval": {"startSeconds": 44.0, "endSeconds": 48.5, "stepSeconds": 0.1, "sourceFps": fps},
        "roi": ROI,
        "frames": pose_frame_map,
        "contactSheets": pose_pages,
        "semanticLabels": "omitted; parent assigns shot meaning",
    })
    write_json(measurements / "full-sample-frame-map.json", {"interval": {"startSeconds": 0.0, "endSeconds": duration, "requestedStepSeconds": 0.5, "endSemantics": "source duration is inclusive only through the nearest decoded frame; sample requests use round(time*fps) and clamp to the final frame"}, "frames": full_frame_map})

    script_path = Path(__file__).resolve()
    owned_files = [script_path]
    owned_files.extend(path for path in sorted(evidence.rglob("*")) if path.is_file())
    owned_files.extend(path for path in sorted(measurements.rglob("*")) if path.is_file() and path.name != "manifest.json")
    files = [{"path": str(path.relative_to(output)).replace("\\", "/"), "bytes": path.stat().st_size, "sha256": sha256(path)} for path in owned_files]
    manifest = {
        "schema": "reference-reverse-measurement-v2",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": {"url": SOURCE_URL, "path": str(source), "sha256": source_hash, "bytes": source.stat().st_size, "analysisOnly": True, "reuseLicenseVerified": False},
        "measured": {"durationSeconds": duration, "width": width, "height": height, "avgFrameRate": video["avg_frame_rate"], "fps": fps, "frameCount": video.get("nb_frames"), "roi": ROI},
        "sceneDetection": {"threshold": SCENE_THRESHOLD, "candidateCount": len(candidates), "log": scene_log},
        "script": {"path": str(script_path), "sha256": sha256(script_path)},
        "files": files,
        "productionAuthority": False,
    }
    write_json(measurements / "manifest.json", manifest)
    print(json.dumps({"sourceSha256": source_hash, "candidateCount": len(candidates), "fullSamplePages": full_pages, "candidatePages": candidate_pages, "posePages": pose_pages, "manifest": str(measurements / 'manifest.json')}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
