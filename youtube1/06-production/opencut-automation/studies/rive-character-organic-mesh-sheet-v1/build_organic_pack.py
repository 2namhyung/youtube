from __future__ import annotations

from collections import deque
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source" / "organic-mesh-sheet-v1-alpha.png"
TORSO_REPAIR = ROOT / "source" / "torso-repair-v2-alpha.png"
PARTS = ROOT / "parts"
ATLAS = ROOT / "source" / "organic-mesh-atlas-v1-alpha.png"
ASSEMBLY = ROOT / "source" / "organic-mesh-static-assembly-v1.png"
REPORT = ROOT / "organic-mesh-report.json"

NAMES = [
    "head_base", "hair_back", "hair_front", "torso", "pelvis_hidden",
    "arm_full_l", "arm_full_r", "leg_full_l", "leg_full_r", "eyes_neutral",
    "hand_relaxed_l", "hand_relaxed_r", "hand_open_l", "hand_open_r", "hand_point_r",
    "eyes_blink", "mouth_neutral", "mouth_speaking", "mouth_concerned", "mouth_surprised",
]


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def tight(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("empty part")
    return image.crop(box)


def resized(image: Image.Image, scale: float) -> Image.Image:
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)


def fit(image: Image.Image, max_size: tuple[int, int], allow_upscale: bool = True) -> Image.Image:
    scale = min(max_size[0] / image.width, max_size[1] / image.height)
    if not allow_upscale:
        scale = min(scale, 1.0)
    return resized(image, scale)


def center(canvas: Image.Image, image: Image.Image, point: tuple[int, int], max_size: tuple[int, int]) -> None:
    item = fit(image, max_size)
    canvas.alpha_composite(item, (round(point[0] - item.width / 2), round(point[1] - item.height / 2)))


def extract_by_components(image: Image.Image) -> list[Image.Image]:
    rgba = np.asarray(image.convert("RGBA"))
    foreground = rgba[:, :, 3] > 8
    height, width = foreground.shape
    seen = np.zeros((height, width), dtype=np.uint8)
    groups = [np.zeros((height, width), dtype=bool) for _ in NAMES]
    # ImageGen respects semantic rows but not exact equal-width cell centers.
    # These reviewed anchors keep wide multi-component face overlays together.
    row_x_anchors = [
        [170, 480, 770, 1060, 1370],
        [170, 450, 650, 850, 1280],
        [170, 450, 760, 1060, 1360],
        [170, 450, 760, 1060, 1360],
    ]
    row_y_anchors = [128, 384, 640, 896]

    for y0, x0 in zip(*np.nonzero(foreground & (seen == 0))):
        if seen[y0, x0]:
            continue
        queue = deque([(int(y0), int(x0))])
        seen[y0, x0] = 1
        pixels = []
        sum_x = sum_y = 0
        while queue:
            y, x = queue.popleft()
            pixels.append((y, x)); sum_x += x; sum_y += y
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and foreground[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        queue.append((ny, nx))
        if len(pixels) < 2:
            continue
        centroid_x = sum_x / len(pixels)
        centroid_y = sum_y / len(pixels)
        row = min(range(4), key=lambda candidate: abs(row_y_anchors[candidate] - centroid_y))
        col = min(range(5), key=lambda candidate: abs(row_x_anchors[row][candidate] - centroid_x))
        target = row * 5 + col
        ys, xs = zip(*pixels)
        groups[target][np.array(ys), np.array(xs)] = True

    output = []
    for index, mask in enumerate(groups):
        if not mask.any():
            raise ValueError(f"missing component group: {NAMES[index]}")
        expanded = mask.copy()
        for _ in range(2):
            padded = np.pad(expanded, 1)
            expanded = np.logical_or.reduce([
                padded[0:height, 0:width], padded[0:height, 1:width + 1], padded[0:height, 2:width + 2],
                padded[1:height + 1, 0:width], padded[1:height + 1, 1:width + 1], padded[1:height + 1, 2:width + 2],
                padded[2:height + 2, 0:width], padded[2:height + 2, 1:width + 1], padded[2:height + 2, 2:width + 2],
            ])
        layer = np.zeros_like(rgba)
        layer[expanded] = rgba[expanded]
        output.append(tight(Image.fromarray(layer, "RGBA")))
    return output


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    raw = extract_by_components(source)
    if len(raw) != 20:
        raise ValueError("expected 20 parts")

    # The original sheet's torso cell included both full sleeves. Rendering it
    # with the dedicated arm meshes produced two visible arms per side. Keep
    # the original sheet immutable, but replace only the torso slot with an
    # arm-free body shell sized to the same source-space height.
    torso_repair = tight(Image.open(TORSO_REPAIR).convert("RGBA"))
    raw[3] = fit(torso_repair, (205, raw[3].height))

    # One global scale preserves the relative body-part proportions.
    scale = min(1.0, min(272 / item.width for item in raw), min(208 / item.height for item in raw))
    normalized = [resized(item, scale) for item in raw]

    PARTS.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (1600, 1024), (0, 0, 0, 0))
    records = []
    pieces = {}
    for index, (name, item) in enumerate(zip(NAMES, normalized)):
        cell = Image.new("RGBA", (320, 256), (0, 0, 0, 0))
        cell.alpha_composite(item, ((320 - item.width) // 2, (256 - item.height) // 2))
        row, col = divmod(index, 5)
        atlas.alpha_composite(cell, (col * 320, row * 256))
        path = PARTS / f"{index + 1:02d}-{name}.png"
        cell.save(path)
        box = cell.getchannel("A").getbbox()
        assert box is not None
        pieces[name] = tight(cell)
        records.append({
            "index": index + 1,
            "name": name,
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": digest(path),
            "alphaBounds": list(box),
            "safeInset24": box[0] >= 24 and box[1] >= 24 and box[2] <= 296 and box[3] <= 232,
        })
    atlas.save(ATLAS)

    assembly = Image.new("RGBA", (1024, 1536), (238, 233, 221, 255))
    center(assembly, pieces["hair_back"], (512, 235), (255, 270))
    center(assembly, pieces["pelvis_hidden"], (512, 755), (220, 100))
    center(assembly, pieces["leg_full_l"], (449, 940), (135, 550))
    center(assembly, pieces["leg_full_r"], (575, 940), (135, 550))
    center(assembly, pieces["arm_full_l"], (340, 620), (125, 440))
    center(assembly, pieces["arm_full_r"], (684, 620), (125, 440))
    center(assembly, pieces["torso"], (512, 555), (300, 430))
    center(assembly, pieces["head_base"], (512, 245), (235, 275))
    center(assembly, pieces["hair_front"], (512, 190), (235, 175))
    center(assembly, pieces["hand_relaxed_l"], (332, 805), (86, 145))
    center(assembly, pieces["hand_relaxed_r"], (692, 805), (86, 145))
    assembly.save(ASSEMBLY)

    report = {
        "schema": "rive-organic-mesh-pack-report-v1",
        "status": "private-review-candidate",
        "productionApproved": False,
        "source": {"path": SOURCE.relative_to(ROOT).as_posix(), "sha256": digest(SOURCE)},
        "torsoReplacement": {
            "path": TORSO_REPAIR.relative_to(ROOT).as_posix(),
            "sha256": digest(TORSO_REPAIR),
            "semanticContract": "arm-free-neck-to-waist-body-shell",
            "supersedes": "source-sheet-torso-with-baked-sleeves",
        },
        "globalScale": scale,
        "atlas": {"path": ATLAS.relative_to(ROOT).as_posix(), "sha256": digest(ATLAS), "width": 1600, "height": 1024},
        "assembly": {"path": ASSEMBLY.relative_to(ROOT).as_posix(), "sha256": digest(ASSEMBLY), "width": 1024, "height": 1536},
        "parts": records,
        "checks": {
            "partCount": 20,
            "allSafeInset24": all(r["safeInset24"] for r in records),
            "physicalNonsymlink": all((ROOT / r["path"]).is_file() and not (ROOT / r["path"]).is_symlink() for r in records),
            "visibleElbowKneeAnkleCuts": False,
            "visualQa": "pending-human-review",
        },
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["checks"], ensure_ascii=False))


if __name__ == "__main__":
    main()
