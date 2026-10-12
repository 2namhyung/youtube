from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


PART_POLYGONS = {
    "head": [(335, 80), (690, 80), (690, 430), (335, 430)],
    "upper_arm_l": [(340, 420), (430, 430), (390, 650), (285, 675), (235, 600)],
    "forearm_l": [(270, 585), (410, 610), (350, 865), (105, 1010), (95, 745)],
    "upper_arm_r": [(594, 430), (684, 420), (789, 600), (739, 675), (634, 650)],
    "forearm_r": [(614, 610), (754, 585), (929, 745), (919, 1010), (674, 865)],
}

# Extraction overlaps the torso so a moving sleeve covers the shoulder seam.
# Removal is narrower: it clears the original hanging arm/hand without cutting
# a triangular hole into the jacket body underneath it.
REMOVE_POLYGONS = {
    "head": PART_POLYGONS["head"],
    "upper_arm_l": [(340, 420), (390, 445), (355, 650), (285, 675), (235, 600)],
    "forearm_l": PART_POLYGONS["forearm_l"],
    "upper_arm_r": [(634, 445), (684, 420), (789, 600), (739, 675), (669, 650)],
    "forearm_r": PART_POLYGONS["forearm_r"],
}


def masked_part(source: Image.Image, polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    alpha = ImageChops.multiply(source.getchannel("A"), mask)
    output = source.copy()
    output.putalpha(alpha)
    return output


def body_part(source: Image.Image) -> Image.Image:
    removed = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(removed)
    for polygon in REMOVE_POLYGONS.values():
        draw.polygon(polygon, fill=255)
    keep = ImageChops.subtract(source.getchannel("A"), removed)
    output = source.copy()
    output.putalpha(keep)
    # A rig-ready character needs artwork that does not exist in the flat
    # master: jacket pixels hidden behind the resting sleeves. Generate a
    # conservative under-sleeve fill from each pack's own jacket color. The
    # articulated sleeve is rendered above this patch, so no hinge is drawn.
    draw_output = ImageDraw.Draw(output)
    left_jacket = source.getpixel((430, 520))
    right_jacket = source.getpixel((594, 520))
    draw_output.polygon([(370, 465), (420, 465), (410, 735), (380, 735)], fill=left_jacket)
    draw_output.polygon([(604, 465), (654, 465), (644, 735), (614, 735)], fill=right_jacket)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack-a", required=True)
    parser.add_argument("--pack-b", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output_root = Path(args.output)
    summary = {"schema": "godot-front-skeleton-parts-v1", "packs": {}}
    for pack_id, source_path in (("a", args.pack_a), ("b", args.pack_b)):
        source = Image.open(source_path).convert("RGBA")
        if source.size != (1024, 1536):
            raise ValueError(f"{pack_id} canvas mismatch: {source.size}")
        pack_root = output_root / f"pack-{pack_id}"
        pack_root.mkdir(parents=True, exist_ok=True)
        parts = {"body": body_part(source)}
        parts.update({name: masked_part(source, polygon) for name, polygon in PART_POLYGONS.items()})
        summary["packs"][pack_id] = {}
        for name, image in parts.items():
            target = pack_root / f"{name}.png"
            image.save(target)
            summary["packs"][pack_id][name] = {"bbox": image.getchannel("A").getbbox(), "path": target.as_posix()}
    (output_root / "parts-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"prepared packs at {output_root}")


if __name__ == "__main__":
    main()
