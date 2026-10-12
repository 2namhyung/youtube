from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source" / "front-anatomy-design-candidate-v1.png"
REVIEW = ROOT / "review"
OVERLAY = REVIEW / "front-landmark-overlay-v1.png"
CROP = REVIEW / "front-character-crop-v1.png"
MANIFEST = ROOT / "front-design-gate-v1.json"

# Coordinates are measured on the immutable 1536x1024 review sheet.
LANDMARKS = {
    "head_top": (988, 47),
    "chin": (988, 220),
    "shoulder_l": (878, 267),
    "shoulder_r": (1098, 267),
    "elbow_l": (856, 414),
    "elbow_r": (1118, 414),
    "wrist_l": (858, 520),
    "wrist_r": (1115, 520),
    "hip_l": (944, 537),
    "hip_r": (1033, 537),
    "knee_l": (948, 744),
    "knee_r": (1029, 744),
    "ankle_l": (947, 895),
    "ankle_r": (1029, 895),
    "baseline": (988, 956),
}

GUIDES = [
    ("HEAD TOP", 47),
    ("CHIN", 220),
    ("SHOULDER", 267),
    ("ELBOW", 414),
    ("WRIST", 520),
    ("HIP", 537),
    ("KNEE", 744),
    ("ANKLE", 895),
    ("BASELINE", 956),
]


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def font(size: int) -> ImageFont.ImageFont:
    candidate = Path("C:/Windows/Fonts/arial.ttf")
    return ImageFont.truetype(str(candidate), size) if candidate.exists() else ImageFont.load_default()


def main() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    image = Image.open(SOURCE).convert("RGB")
    if image.size != (1536, 1024):
        raise ValueError(f"unexpected source dimensions: {image.size}")

    # Preserve original pixels. This crop is a review convenience, not an alpha rig asset.
    image.crop((807, 27, 1168, 976)).save(CROP)

    overlay = image.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    label_font = font(15)
    line_color = (19, 139, 160, 145)
    dot_fill = (255, 214, 69, 235)
    dot_outline = (20, 38, 48, 255)

    for label, y in GUIDES:
        draw.line((790, y, 1178, y), fill=line_color, width=2)
        draw.rounded_rectangle((1178, y - 11, 1284, y + 11), radius=5, fill=(250, 248, 241, 230))
        draw.text((1185, y - 8), label, font=label_font, fill=(20, 38, 48, 255))

    for name, (x, y) in LANDMARKS.items():
        if name in {"head_top", "chin", "baseline"}:
            continue
        radius = 6
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=dot_fill, outline=dot_outline, width=2)

    # Structural axes: shoulder girdle, pelvis, limbs and center line.
    draw.line((878, 267, 1098, 267), fill=(232, 77, 104, 210), width=4)
    draw.line((944, 537, 1033, 537), fill=(232, 77, 104, 210), width=4)
    draw.line((988, 220, 988, 537), fill=(232, 77, 104, 180), width=3)
    for side in ("l", "r"):
        draw.line(
            (
                *LANDMARKS[f"shoulder_{side}"],
                *LANDMARKS[f"elbow_{side}"],
                *LANDMARKS[f"wrist_{side}"],
            ),
            fill=(232, 77, 104, 210),
            width=4,
            joint="curve",
        )
        draw.line(
            (
                *LANDMARKS[f"hip_{side}"],
                *LANDMARKS[f"knee_{side}"],
                *LANDMARKS[f"ankle_{side}"],
            ),
            fill=(232, 77, 104, 210),
            width=4,
            joint="curve",
        )

    overlay.save(OVERLAY)

    head_length = LANDMARKS["chin"][1] - LANDMARKS["head_top"][1]
    body_height = LANDMARKS["baseline"][1] - LANDMARKS["head_top"][1]
    upper_arm = ((878 - 856) ** 2 + (267 - 414) ** 2) ** 0.5
    forearm = ((856 - 858) ** 2 + (414 - 520) ** 2) ** 0.5
    manifest = {
        "schema": "rive-front-design-gate-v1",
        "status": "human-preferred-landmark-review-pending",
        "productionApproved": False,
        "source": {
            "path": SOURCE.relative_to(ROOT).as_posix(),
            "sha256": digest(SOURCE),
            "dimensions": list(image.size),
        },
        "review": {
            "overlayPath": OVERLAY.relative_to(ROOT).as_posix(),
            "overlaySha256": digest(OVERLAY),
            "cropPath": CROP.relative_to(ROOT).as_posix(),
            "cropSha256": digest(CROP),
        },
        "landmarks": LANDMARKS,
        "measurements": {
            "bodyHeightPx": body_height,
            "headLengthPx": head_length,
            "headsTall": round(body_height / head_length, 3),
            "upperArmCenterlinePx": round(upper_arm, 3),
            "forearmCenterlinePx": round(forearm, 3),
            "upperArmToForearmRatio": round(upper_arm / forearm, 3),
        },
        "nextGate": "human-landmark-and-silhouette-approval-before-vector-redraw",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"built landmark review: {manifest['measurements']['headsTall']} heads tall, "
        f"arm ratio {manifest['measurements']['upperArmToForearmRatio']}"
    )


if __name__ == "__main__":
    main()

