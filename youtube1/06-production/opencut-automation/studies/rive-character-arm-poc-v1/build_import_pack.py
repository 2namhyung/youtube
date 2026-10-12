from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = ROOT.parent / "rive-character-organic-mesh-sheet-v1"
LAYERS = ROOT / "import-layers"
OUT = ROOT / "review"
MANIFEST = ROOT / "rive-import-manifest.json"
CANVAS = (1024, 1536)

SPECS = {
    "torso": ("04-torso.png", (512, 555), (300, 430), "body-shell-no-arms-or-sleeves", 30),
    "arm_l": ("06-arm_full_l.png", (340, 620), (125, 440), "continuous-shoulder-to-wrist-sleeve", 20),
    "arm_r": ("07-arm_full_r.png", (684, 620), (125, 440), "continuous-shoulder-to-wrist-sleeve", 20),
    "hand_relaxed_l": ("11-hand_relaxed_l.png", (332, 805), (86, 145), "rigid-hand-attachment", 40),
    "hand_relaxed_r": ("12-hand_relaxed_r.png", (692, 805), (86, 145), "rigid-hand-attachment", 40),
}

BONES = {
    "root": {"parent": None, "joint": [512, 755]},
    "spine": {"parent": "root", "joint": [512, 555]},
    "shoulder_l": {"parent": "spine", "joint": [382, 494]},
    "elbow_l": {"parent": "shoulder_l", "joint": [323, 625]},
    "wrist_l": {"parent": "elbow_l", "joint": [323, 755]},
    "shoulder_r": {"parent": "spine", "joint": [642, 494]},
    "elbow_r": {"parent": "shoulder_r", "joint": [701, 625]},
    "wrist_r": {"parent": "elbow_r", "joint": [701, 755]},
}


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def tight(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("empty image")
    return image.crop(box)


def fit(image: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    scale = min(max_size[0] / image.width, max_size[1] / image.height)
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)


def place(source: Image.Image, point: tuple[int, int], max_size: tuple[int, int]) -> tuple[Image.Image, list[int]]:
    item = fit(tight(source), max_size)
    x = round(point[0] - item.width / 2)
    y = round(point[1] - item.height / 2)
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    layer.alpha_composite(item, (x, y))
    box = layer.getchannel("A").getbbox()
    if box is None:
        raise ValueError("placed layer is empty")
    return layer, list(box)


def main() -> None:
    LAYERS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    rendered = {}
    for slot, (filename, center, max_size, role, draw_order) in SPECS.items():
        source = SOURCE_ROOT / "parts" / filename
        layer, bounds = place(Image.open(source).convert("RGBA"), center, max_size)
        target = LAYERS / f"char_anon01_front_{slot}.png"
        layer.save(target)
        rendered[slot] = layer
        records.append({
            "slot": slot,
            "semanticRole": role,
            "path": target.relative_to(ROOT).as_posix(),
            "sourcePath": source.relative_to(ROOT.parent.parent.parent).as_posix(),
            "sourceSha256": digest(source),
            "sha256": digest(target),
            "canvas": list(CANVAS),
            "alphaBounds": bounds,
            "origin": [0, 0],
            "drawOrder": draw_order,
        })

    composite = Image.new("RGBA", CANVAS, (238, 233, 221, 255))
    for slot in ("arm_l", "arm_r", "torso", "hand_relaxed_l", "hand_relaxed_r"):
        composite.alpha_composite(rendered[slot])
    composite_path = OUT / "static-composite.png"
    composite.save(composite_path)

    overlay = composite.copy()
    draw = ImageDraw.Draw(overlay)
    for name, bone in BONES.items():
        x, y = bone["joint"]
        if bone["parent"]:
            px, py = BONES[bone["parent"]]["joint"]
            draw.line((px, py, x, y), fill=(236, 64, 122, 230), width=7)
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(0, 229, 255, 255), outline=(15, 15, 15, 255), width=3)
        draw.text((x + 12, y - 12), name, fill=(20, 20, 20, 255), stroke_width=2, stroke_fill=(255, 255, 255, 255))
    overlay_path = OUT / "rig-overlay.png"
    overlay.save(overlay_path)

    manifest = {
        "schema": "rive-character-import-pack-v1",
        "status": "private-editor-import-ready",
        "productionApproved": False,
        "artboard": {"name": "char_anon01_front", "width": 1024, "height": 1536},
        "referencePattern": "torso-separate-from-arm-sleeve-and-hand",
        "hierarchy": {
            "root": ["torso", "arm_l", "arm_r", "hand_relaxed_l", "hand_relaxed_r"],
            "drawOrderBackToFront": ["arm_l", "arm_r", "torso", "hand_relaxed_l", "hand_relaxed_r"],
            "exactlyOneVisibleArmPerSide": True,
        },
        "bones": BONES,
        "layers": records,
        "meshPlan": {
            "torso": {"mode": "rigid-or-light-spine-deform", "boundBones": ["root", "spine"]},
            "arm_l": {"mode": "raster-mesh", "boundBones": ["shoulder_l", "elbow_l", "wrist_l"]},
            "arm_r": {"mode": "raster-mesh", "boundBones": ["shoulder_r", "elbow_r", "wrist_r"]},
            "hands": {"mode": "rigid-child", "parents": {"hand_relaxed_l": "wrist_l", "hand_relaxed_r": "wrist_r"}},
        },
        "review": {
            "staticComposite": {"path": composite_path.relative_to(ROOT).as_posix(), "sha256": digest(composite_path)},
            "rigOverlay": {"path": overlay_path.relative_to(ROOT).as_posix(), "sha256": digest(overlay_path)},
            "riveEditorMeshWeights": "pending",
            "extremePoseSeamQa": "pending",
        },
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"built {len(records)} full-canvas Rive import layers")


if __name__ == "__main__":
    main()
