from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageDraw


HEAD = [(330, 80), (694, 80), (694, 430), (330, 430)]
ARM_ERASE = {
    "l": [(325, 395), (438, 410), (430, 540), (390, 680), (335, 805), (320, 920), (130, 960), (90, 835), (170, 700), (235, 540)],
    "r": [(699, 395), (586, 410), (594, 540), (634, 680), (689, 805), (704, 920), (894, 960), (934, 835), (854, 700), (789, 540)],
}
BODY_MASK = [(350, 390), (674, 390), (660, 500), (650, 835), (630, 900), (694, 1435), (330, 1435), (394, 900), (374, 835), (364, 500)]
JOINTS = {
    "shoulder_l": (386, 456), "elbow_l": (318, 637), "wrist_l": (252, 782),
    "shoulder_r": (638, 456), "elbow_r": (706, 637), "wrist_r": (772, 782),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mask_polygon(size: tuple[int, int], polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask


def sample_median(source: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    values = []
    for r, g, b, a in source.crop(box).getdata():
        if a > 245 and 45 < r + g + b < 700 and max(r, g, b) - min(r, g, b) > 10:
            values.append((r, g, b))
    if not values:
        raise ValueError(f"no color sample in {box}")
    return tuple(int(median(channel)) for channel in zip(*values)) + (255,)


def source_part(source: Image.Image, source_mask: Image.Image, underfills: list[tuple[str, tuple[int, int, int, int], tuple[int, int, int, int]]]) -> Image.Image:
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    for shape, bounds, color in underfills:
        if shape == "ellipse":
            draw.ellipse(bounds, fill=color)
        else:
            draw.rounded_rectangle(bounds, radius=min(bounds[2] - bounds[0], bounds[3] - bounds[1]) // 2, fill=color)
    masked = source.copy()
    masked.putalpha(ImageChops.multiply(source.getchannel("A"), source_mask))
    out.alpha_composite(masked)
    return out


def partition_arm_masks(source: Image.Image, side: str) -> dict[str, Image.Image]:
    region = mask_polygon(source.size, ARM_ERASE[side])
    sx, sy = JOINTS[f"shoulder_{side}"]
    ex, ey = JOINTS[f"elbow_{side}"]
    wx, wy = JOINTS[f"wrist_{side}"]
    dx, dy = wx - sx, wy - sy
    length2 = dx * dx + dy * dy
    elbow_t = ((ex - sx) * dx + (ey - sy) * dy) / length2
    upper = Image.new("L", source.size, 0)
    forearm = Image.new("L", source.size, 0)
    hand = Image.new("L", source.size, 0)
    region_px = region.load()
    targets = (upper.load(), forearm.load(), hand.load())
    for y in range(source.height):
        for x in range(source.width):
            if not region_px[x, y]:
                continue
            t = ((x - sx) * dx + (y - sy) * dy) / length2
            target = 0 if t < elbow_t else (1 if t < 0.96 else 2)
            targets[target][x, y] = 255
    return {f"upper_arm_{side}": upper, f"forearm_{side}": forearm, f"hand_{side}": hand}


def build_pack(source: Image.Image) -> dict[str, Image.Image]:
    coat = sample_median(source, (400, 480, 470, 700))
    skin = sample_median(source, (465, 250, 560, 380))
    body = source.copy()
    # The fixed body is an explicit central silhouette, not a flattened figure
    # with limbs erased. This keeps the jacket sides fixed and prevents any
    # original sleeve contour from becoming a second moving outline.
    body.putalpha(ImageChops.multiply(source.getchannel("A"), mask_polygon(source.size, BODY_MASK)))
    head = source_part(source, mask_polygon(source.size, HEAD), [])
    parts = {"body": body, "head": head}
    for side in ("l", "r"):
        sx, sy = JOINTS[f"shoulder_{side}"]
        ex, ey = JOINTS[f"elbow_{side}"]
        wx, wy = JOINTS[f"wrist_{side}"]
        masks = partition_arm_masks(source, side)
        parts[f"upper_arm_{side}"] = source_part(source, masks[f"upper_arm_{side}"], [
            ("ellipse", (sx - 24, sy - 24, sx + 24, sy + 24), coat),
            ("ellipse", (ex - 18, ey - 18, ex + 18, ey + 18), coat),
        ])
        parts[f"forearm_{side}"] = source_part(source, masks[f"forearm_{side}"], [
            ("ellipse", (ex - 19, ey - 19, ex + 19, ey + 19), coat),
            ("ellipse", (wx - 15, wy - 15, wx + 15, wy + 15), coat),
        ])
        parts[f"hand_{side}"] = source_part(source, masks[f"hand_{side}"], [
            ("ellipse", (wx - 14, wy - 14, wx + 14, wy + 14), skin),
        ])
    return parts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack-a", required=True)
    parser.add_argument("--pack-b", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    summary = {"schema": "godot-front-separated-appearance-pack-v2", "parts": {}, "sourceHashes": {}}
    for pack, raw in (("a", args.pack_a), ("b", args.pack_b)):
        source_path = Path(raw).resolve(strict=True)
        source = Image.open(source_path).convert("RGBA")
        if source.size != (1024, 1536) or source.getchannel("A").getbbox() != (182, 110, 842, 1430):
            raise ValueError(f"pack {pack} geometry authority mismatch")
        summary["sourceHashes"][pack] = sha256(source_path)
        pack_dir = output / f"pack-{pack}"
        pack_dir.mkdir(parents=True, exist_ok=True)
        summary["parts"][pack] = {}
        for name, image in build_pack(source).items():
            target = pack_dir / f"{name}.png"
            image.save(target, optimize=False)
            summary["parts"][pack][name] = {"bbox": image.getchannel("A").getbbox(), "bytes": target.stat().st_size, "sha256": sha256(target)}
    (output / "parts-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
