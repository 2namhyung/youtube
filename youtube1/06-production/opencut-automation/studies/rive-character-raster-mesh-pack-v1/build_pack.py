from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
PARENT = ROOT.parent / "rive-character-anatomy-sheet-v1" / "source" / "front-anatomy-design-candidate-v1.png"
OUT = ROOT / "layers"
REVIEW = ROOT / "review"
CROP_BOX = (807, 27, 1168, 976)
BG = (253, 247, 233)

PARTS = {
    "torso": [(62, 226), (98, 204), (143, 194), (218, 194), (263, 204), (299, 226), (294, 501), (235, 505), (181, 493), (127, 505), (68, 501)],
    "arm_l": [(28, 220), (76, 215), (126, 246), (117, 506), (36, 510), (24, 420)],
    "arm_r": [(333, 220), (285, 215), (235, 246), (244, 506), (325, 510), (337, 420)],
    "hand_l": [(28, 480), (111, 480), (108, 612), (24, 612)],
    "hand_r": [(333, 480), (250, 480), (253, 612), (337, 612)],
}

ORDER = ["arm_l", "arm_r", "torso", "hand_l", "hand_r"]


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def subject_alpha(rgb: np.ndarray) -> np.ndarray:
    delta = np.max(np.abs(rgb.astype(np.int16) - np.array(BG, dtype=np.int16)), axis=2)
    return np.clip((delta - 5) * (255.0 / 14.0), 0, 255).astype(np.uint8)


def build_layer(source: Image.Image, part: str, polygon: list[tuple[int, int]]) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"))
    alpha = subject_alpha(rgb)
    spatial = Image.new("L", source.size, 0)
    ImageDraw.Draw(spatial).polygon(polygon, fill=255)
    alpha = np.minimum(alpha, np.asarray(spatial))
    rgba = np.dstack([rgb, alpha]).astype(np.uint8)
    rgba[alpha == 0, :3] = 0
    layer = Image.fromarray(rgba)

    # Opaque underlaps exist only behind the torso and are hidden in the rest pose.
    if part in {"arm_l", "arm_r"}:
        fill = Image.new("RGBA", source.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(fill)
        box = (82, 225, 120, 275) if part == "arm_l" else (241, 225, 279, 275)
        draw.ellipse(box, fill=(38, 72, 105, 255))
        fill.alpha_composite(layer)
        layer = fill
    return layer


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    source_full = Image.open(PARENT).convert("RGB")
    source = source_full.crop(CROP_BOX)
    if source.size != (361, 949):
        raise ValueError(f"unexpected crop: {source.size}")

    records = []
    layers = {}
    for part, polygon in PARTS.items():
        layer = build_layer(source, part, polygon)
        path = OUT / f"char_anon01_front_{part}.png"
        layer.save(path)
        layers[part] = layer
        records.append({
            "slot": part,
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": digest(path),
            "dimensions": list(layer.size),
            "origin": [0, 0],
            "alphaBounds": list(layer.getchannel("A").getbbox() or (0, 0, 0, 0)),
            "mode": "raster-mesh" if part.startswith("arm_") else "rigid-or-light-deform",
        })

    composite = Image.new("RGB", source.size, (248, 243, 232))
    for part in ORDER:
        composite.paste(layers[part], (0, 0), layers[part])
    composite.save(REVIEW / "upper-body-static-composite-v1.png")

    comparison = Image.new("RGB", (722, 949), (248, 243, 232))
    comparison.paste(source, (0, 0))
    comparison.paste(composite, (361, 0))
    ImageDraw.Draw(comparison).line((361, 0, 361, 949), fill=(32, 45, 54), width=2)
    comparison.save(REVIEW / "source-vs-separated-v1.png")

    manifest = {
        "schema": "rive-raster-mesh-pack-v1",
        "status": "private-static-reconstruction-review",
        "productionApproved": False,
        "parent": {"path": str(PARENT), "sha256": digest(PARENT), "cropBox": list(CROP_BOX)},
        "canvas": [361, 949],
        "drawOrderBackToFront": ORDER,
        "layers": records,
        "review": {
            "composite": {"path": "review/upper-body-static-composite-v1.png", "sha256": digest(REVIEW / "upper-body-static-composite-v1.png")},
            "comparison": {"path": "review/source-vs-separated-v1.png", "sha256": digest(REVIEW / "source-vs-separated-v1.png")},
        },
        "nextGate": "human-static-reconstruction-review-before-rive-left-arm-mesh",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("built Rive raster mesh pack: 5 same-origin layers")


if __name__ == "__main__":
    main()
