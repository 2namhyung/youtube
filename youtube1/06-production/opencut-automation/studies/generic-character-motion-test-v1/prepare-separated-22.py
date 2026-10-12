from __future__ import annotations

from hashlib import sha256
from json import dumps
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SOURCE = (
    ROOT
    / "../../production/motion-assets/generic-character-poc-v1/imagegen-22-separated-v1"
).resolve()
PUBLIC = ROOT / "public/separated-22-v1"
OUTPUT = (
    ROOT / "../../out/studies/generic-character-motion-test-v1/separated-22-v1"
).resolve()

BODY_SHEETS = {
    "k12": "body-keys-01-02-sheet.png",
    "k34": "body-keys-03-04-sheet.png",
    "k56": "body-keys-05-06-sheet.png",
    "k78": "body-keys-07-08-sheet.png",
    "i12": "body-inbetweens-01-02-sheet.png",
    "i23": "body-inbetweens-02-03-sheet.png",
    "i34": "body-inbetweens-03-04-sheet.png",
    "i45": "body-inbetweens-04-05-sheet.png",
    "i56": "body-inbetweens-05-06-sheet.png",
    "i67": "body-inbetweens-06-07-sheet.png",
    "i78": "body-inbetweens-07-08-sheet.png",
}

SEQUENCE = [
    ("k12", 0, 1), ("i12", 0, 1), ("i12", 1, 1), ("k12", 1, 1),
    ("i23", 0, 2), ("i23", 1, 2), ("k34", 0, 2),
    ("i34", 0, 3), ("i34", 1, 3), ("k34", 1, 3),
    ("i45", 0, 3), ("i45", 1, 3), ("k56", 0, 3),
    ("i56", 0, 3), ("i56", 1, 3), ("k56", 1, 3),
    ("i67", 0, 4), ("i67", 1, 4), ("k78", 0, 5),
    ("i78", 0, 5), ("i78", 1, 6), ("k78", 1, 6),
]

HEAD_SHEETS = [
    "heads-01-02-sheet.png",
    "heads-03-04-sheet.png",
    "heads-05-06-sheet.png",
]


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def remove_magenta(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    # ImageGen produces a lightly graded magenta field. Estimate the key from
    # four corners, then use a soft distance matte so black ink is preserved.
    samples = np.vstack([
        rgb[:32, :32].reshape(-1, 3),
        rgb[:32, -32:].reshape(-1, 3),
        rgb[-32:, :32].reshape(-1, 3),
        rgb[-32:, -32:].reshape(-1, 3),
    ])
    key = np.median(samples, axis=0)
    distance = np.linalg.norm(rgb - key, axis=2)
    alpha = np.clip((distance - 42.0) / (132.0 - 42.0), 0.0, 1.0)
    # Only key pixels whose red/blue dominance identifies the magenta field.
    key_like = (rgb[:, :, 0] > 175) & (rgb[:, :, 2] > 75) & (rgb[:, :, 1] < 115)
    alpha = np.where(key_like, alpha, 1.0)
    rgba[:, :, 3] = np.round(alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def split_alpha(sheet_path: Path, side: int) -> Image.Image:
    sheet = Image.open(sheet_path).convert("RGBA")
    middle = sheet.width // 2
    crop = sheet.crop((0 if side == 0 else middle, 0, middle if side == 0 else sheet.width, sheet.height))
    keyed = remove_magenta(crop)
    bbox = keyed.getchannel("A").point(lambda p: 255 if p > 18 else 0).getbbox()
    if bbox is None:
        raise RuntimeError(f"no opaque subject in {sheet_path.name} side {side}")
    pad = 12
    box = (
        max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(keyed.width, bbox[2] + pad), min(keyed.height, bbox[3] + pad),
    )
    return keyed.crop(box)


def skin_anchor(body: Image.Image) -> tuple[float, float]:
    data = np.asarray(body.convert("RGBA"))
    r, g, b, a = [data[:, :, i] for i in range(4)]
    skin = (a > 100) & (r > 175) & (g > 95) & (g < 215) & (b < 155) & ((r.astype(int) - g.astype(int)) < 135)
    ys, xs = np.where(skin)
    if len(xs) == 0:
        raise RuntimeError("body has no detectable neck skin")
    top = ys.min()
    band = skin & (np.indices(skin.shape)[0] <= top + 90)
    by, bx = np.where(band)
    return float(np.median(bx)), float(top + 32)


def compose(body: Image.Image, head: Image.Image) -> tuple[Image.Image, dict]:
    canvas = Image.new("RGBA", (1080, 1600), (0, 0, 0, 0))
    body_scale = 1.08
    bw, bh = round(body.width * body_scale), round(body.height * body_scale)
    body_scaled = body.resize((bw, bh), Image.Resampling.LANCZOS)
    body_x = round((1080 - bw) / 2)
    body_y = 1480 - bh
    canvas.alpha_composite(body_scaled, (body_x, body_y))

    neck_x, neck_y = skin_anchor(body)
    anchor_x = body_x + neck_x * body_scale
    anchor_y = body_y + neck_y * body_scale
    # Four-and-a-half-head proportion: body below the head is ~3.5 heads.
    target_head_h = round(bh / 3.5)
    target_head_w = round(head.width * target_head_h / head.height)
    head_scaled = head.resize((target_head_w, target_head_h), Image.Resampling.LANCZOS)
    head_x = round(anchor_x - target_head_w * 0.50)
    head_y = round(anchor_y - target_head_h + target_head_h * 0.12)
    canvas.alpha_composite(head_scaled, (head_x, head_y))
    return canvas, {
        "bodyPlacement": [body_x, body_y, bw, bh],
        "neckAnchor": [round(anchor_x, 2), round(anchor_y, 2)],
        "headPlacement": [head_x, head_y, target_head_w, target_head_h],
    }


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "bodies").mkdir(exist_ok=True)
    (PUBLIC / "heads").mkdir(exist_ok=True)
    (PUBLIC / "frames").mkdir(exist_ok=True)

    heads = []
    head_records = []
    for sheet_name in HEAD_SHEETS:
        for side in (0, 1):
            head = split_alpha(SOURCE / sheet_name, side)
            index = len(heads) + 1
            output = PUBLIC / "heads" / f"head-{index:02d}.png"
            head.save(output)
            heads.append(head)
            head_records.append({
                "id": f"head-{index:02d}", "sheet": sheet_name, "side": side,
                "width": head.width, "height": head.height, "sha256": digest(output),
            })

    frame_records = []
    composites = []
    for index, (sheet_id, side, head_index) in enumerate(SEQUENCE, start=1):
        source_path = SOURCE / BODY_SHEETS[sheet_id]
        body = split_alpha(source_path, side)
        body_path = PUBLIC / "bodies" / f"body-{index:02d}.png"
        body.save(body_path)
        composite, placement = compose(body, heads[head_index - 1])
        frame_path = PUBLIC / "frames" / f"frame-{index:02d}.png"
        composite.save(frame_path)
        composites.append(composite)
        frame_records.append({
            "frame": index,
            "body": {
                "file": body_path.relative_to(ROOT).as_posix(),
                "sourceSheet": BODY_SHEETS[sheet_id], "sourceSide": side,
                "sha256": digest(body_path), "width": body.width, "height": body.height,
            },
            "head": f"head-{head_index:02d}",
            "composite": {
                "file": frame_path.relative_to(ROOT).as_posix(),
                "sha256": digest(frame_path),
            },
            **placement,
        })

    # A labelled contact sheet is review-only and never used by the renderer.
    thumb_w, thumb_h = 216, 320
    contact = Image.new("RGB", (thumb_w * 6, thumb_h * 4), "#e9e3da")
    draw = ImageDraw.Draw(contact)
    for i, frame in enumerate(composites):
        preview = frame.copy()
        preview.thumbnail((thumb_w - 12, thumb_h - 32), Image.Resampling.LANCZOS)
        x = (i % 6) * thumb_w + (thumb_w - preview.width) // 2
        y = (i // 6) * thumb_h + 24
        contact.paste(preview, (x, y), preview)
        draw.text(((i % 6) * thumb_w + 8, (i // 6) * thumb_h + 5), f"{i + 1:02d}", fill="#27231f")
    contact_path = OUTPUT / "separated-22-contact-sheet.jpg"
    contact.save(contact_path, quality=92)

    manifest = {
        "schema": "imagegen-separated-character-frames-v1",
        "status": "private-study-only",
        "frameCount": 22,
        "canvas": [1080, 1600],
        "sourceRoot": str(SOURCE),
        "sourceSheets": [
            {"file": path.name, "sha256": digest(path)}
            for path in sorted(SOURCE.glob("*.png"))
        ],
        "heads": head_records,
        "frames": frame_records,
        "contactSheet": {"file": str(contact_path), "sha256": digest(contact_path)},
        "rules": {
            "bodyScale": 1.08,
            "baselineY": 1480,
            "headScale": "body-height / 3.5",
            "crossDissolve": False,
            "bodyAndHeadStoredSeparately": True,
        },
    }
    manifest_path = PUBLIC / "manifest.json"
    manifest_path.write_text(dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"prepared {len(frame_records)} bodies, {len(heads)} heads and {len(composites)} composites")
    print(contact_path)


if __name__ == "__main__":
    main()
