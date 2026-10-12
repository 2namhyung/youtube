from __future__ import annotations

from collections import deque
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source" / "rive-character-parts-sheet-v2-alpha.png"
REPAIR = ROOT / "source" / "torso-pelvis-repair-v1-alpha.png"
OUT = ROOT / "parts-v3"
ATLAS = ROOT / "source" / "rive-character-parts-sheet-v3-alpha.png"
ASSEMBLY = ROOT / "source" / "rive-character-static-assembly-v1.png"
REPORT = ROOT / "parts-v3-report.json"

NAMES = [
    "head_base", "hair_back", "hair_front", "torso", "pelvis", "eyes_neutral",
    "upper_arm_l", "upper_arm_r", "forearm_l", "forearm_r", "hand_relaxed_l", "hand_relaxed_r",
    "hand_open_l", "hand_open_r", "hand_point_r", "thigh_l", "thigh_r", "eyes_blink",
    "shin_l", "shin_r", "foot_l", "foot_r", "mouth_neutral", "mouth_concerned",
]


def alpha_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    box = im.getchannel("A").getbbox()
    if box is None:
        raise ValueError("empty alpha image")
    return box


def tight(im: Image.Image) -> Image.Image:
    return im.crop(alpha_bbox(im))


def resize_fit(im: Image.Image, max_w: int, max_h: int, allow_upscale: bool = False) -> Image.Image:
    scale = min(max_w / im.width, max_h / im.height)
    if not allow_upscale:
        scale = min(scale, 1.0)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    return im.resize(size, Image.Resampling.LANCZOS)


def extract_by_components(im: Image.Image) -> list[Image.Image]:
    rgba = np.asarray(im.convert("RGBA"))
    fg = rgba[:, :, 3] > 8
    h, w = fg.shape
    seen = np.zeros((h, w), dtype=np.uint8)
    groups = [np.zeros((h, w), dtype=bool) for _ in NAMES]
    centers = np.array([((c + 0.5) * w / 6, (r + 0.5) * h / 4) for r in range(4) for c in range(6)])
    for y0, x0 in zip(*np.nonzero(fg & (seen == 0))):
        if seen[y0, x0]:
            continue
        q = deque([(int(y0), int(x0))])
        seen[y0, x0] = 1
        pixels: list[tuple[int, int]] = []
        sx = sy = 0
        while q:
            y, x = q.popleft()
            pixels.append((y, x)); sx += x; sy += y
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        q.append((ny, nx))
        if len(pixels) < 2:
            continue
        centroid = np.array((sx / len(pixels), sy / len(pixels)))
        target = int(np.argmin(np.sum((centers - centroid) ** 2, axis=1)))
        ys, xs = zip(*pixels)
        groups[target][np.array(ys), np.array(xs)] = True

    pieces: list[Image.Image] = []
    for index, mask in enumerate(groups):
        if not mask.any():
            raise ValueError(f"missing component group: {NAMES[index]}")
        # Recover antialiased fringe around thresholded connected components.
        expanded = mask.copy()
        for _ in range(2):
            p = np.pad(expanded, 1)
            expanded = np.logical_or.reduce([
                p[0:h, 0:w], p[0:h, 1:w + 1], p[0:h, 2:w + 2],
                p[1:h + 1, 0:w], p[1:h + 1, 1:w + 1], p[1:h + 1, 2:w + 2],
                p[2:h + 2, 0:w], p[2:h + 2, 1:w + 1], p[2:h + 2, 2:w + 2],
            ])
        layer = np.zeros_like(rgba)
        layer[expanded] = rgba[expanded]
        pieces.append(tight(Image.fromarray(layer, "RGBA")))
    return pieces


def repair_piece(repair: Image.Image, side: str, target: Image.Image) -> Image.Image:
    x0, x1 = (0, repair.width // 2) if side == "left" else (repair.width // 2, repair.width)
    piece = tight(repair.crop((x0, 0, x1, repair.height)))
    return resize_fit(piece, target.width, target.height, allow_upscale=False)


def centered_cell(piece: Image.Image, size: int = 256, margin: int = 24) -> Image.Image:
    fitted = resize_fit(piece, size - margin * 2, size - margin * 2, allow_upscale=False)
    cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cell.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return cell


def paste_center(canvas: Image.Image, piece: Image.Image, center: tuple[int, int], max_size: tuple[int, int]):
    fitted = resize_fit(piece, max_size[0], max_size[1], allow_upscale=True)
    canvas.alpha_composite(fitted, (round(center[0] - fitted.width / 2), round(center[1] - fitted.height / 2)))


def build_static_assembly(pieces: dict[str, Image.Image]) -> Image.Image:
    canvas = Image.new("RGBA", (1024, 1536), (238, 233, 221, 255))
    # Back-to-front neutral cutout assembly. This is a seam/proportion review, not rig output.
    paste_center(canvas, pieces["hair_back"], (512, 222), (250, 250))
    paste_center(canvas, pieces["thigh_l"], (455, 885), (100, 260))
    paste_center(canvas, pieces["thigh_r"], (569, 885), (100, 260))
    paste_center(canvas, pieces["shin_l"], (455, 1045), (92, 250))
    paste_center(canvas, pieces["shin_r"], (569, 1045), (92, 250))
    paste_center(canvas, pieces["foot_l"], (430, 1195), (150, 105))
    paste_center(canvas, pieces["foot_r"], (594, 1195), (150, 105))
    paste_center(canvas, pieces["pelvis"], (512, 736), (205, 105))
    paste_center(canvas, pieces["upper_arm_l"], (343, 550), (92, 250))
    paste_center(canvas, pieces["upper_arm_r"], (681, 550), (92, 250))
    paste_center(canvas, pieces["forearm_l"], (330, 688), (78, 210))
    paste_center(canvas, pieces["forearm_r"], (694, 688), (78, 210))
    paste_center(canvas, pieces["hand_relaxed_l"], (326, 818), (82, 145))
    paste_center(canvas, pieces["hand_relaxed_r"], (698, 818), (82, 145))
    paste_center(canvas, pieces["torso"], (512, 515), (330, 390))
    paste_center(canvas, pieces["head_base"], (512, 245), (235, 275))
    paste_center(canvas, pieces["hair_front"], (512, 187), (235, 170))
    return canvas


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    repair = Image.open(REPAIR).convert("RGBA")
    raw = extract_by_components(source)
    raw[3] = repair_piece(repair, "left", raw[3])
    raw[4] = repair_piece(repair, "right", raw[4])

    cells = [centered_cell(piece) for piece in raw]
    atlas = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
    records = []
    piece_map: dict[str, Image.Image] = {}
    for i, (name, piece, cell) in enumerate(zip(NAMES, raw, cells)):
        row, col = divmod(i, 6)
        atlas.alpha_composite(cell, (col * 256, row * 256))
        path = OUT / f"{i + 1:02d}-{name}.png"
        cell.save(path)
        piece_map[name] = tight(cell)
        box = alpha_bbox(cell)
        records.append({
            "index": i + 1,
            "name": name,
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": digest(path),
            "alphaBounds": list(box),
            "width": box[2] - box[0],
            "height": box[3] - box[1],
            "safeInset24": box[0] >= 24 and box[1] >= 24 and box[2] <= 232 and box[3] <= 232,
        })
    atlas.save(ATLAS)
    assembly = build_static_assembly(piece_map)
    assembly.save(ASSEMBLY)
    report = {
        "schema": "rive-character-parts-sheet-report-v1",
        "status": "private-review-candidate",
        "productionApproved": False,
        "source": {"path": SOURCE.relative_to(ROOT).as_posix(), "sha256": digest(SOURCE)},
        "repair": {"path": REPAIR.relative_to(ROOT).as_posix(), "sha256": digest(REPAIR)},
        "atlas": {"path": ATLAS.relative_to(ROOT).as_posix(), "sha256": digest(ATLAS), "width": 1536, "height": 1024},
        "assembly": {"path": ASSEMBLY.relative_to(ROOT).as_posix(), "sha256": digest(ASSEMBLY), "width": 1024, "height": 1536},
        "parts": records,
        "checks": {
            "partCount": len(records),
            "allSafeInset24": all(r["safeInset24"] for r in records),
            "physicalNonsymlink": all((ROOT / r["path"]).is_file() and not (ROOT / r["path"]).is_symlink() for r in records),
            "visualQa": "pending-human-review",
        },
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["checks"], ensure_ascii=False))


if __name__ == "__main__":
    main()
