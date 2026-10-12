from pathlib import Path
import json
import sys

from fontTools.ttLib import TTFont


if len(sys.argv) != 5:
    raise SystemExit(
        "Usage: python scripts/analyze-libass-calibration.py "
        "<font.ttf> <texts.json> <frames.rgb> <output.json>"
    )

font_path = Path(sys.argv[1]).resolve()
texts_path = Path(sys.argv[2]).resolve()
frames_path = Path(sys.argv[3]).resolve()
output_path = Path(sys.argv[4]).resolve()
texts = json.loads(texts_path.read_text(encoding="utf-8"))

font = TTFont(font_path, lazy=True)
if "fvar" in font:
    raise SystemExit("Caption font must be a static Noto Sans KR 800 instance")
weight = font["OS/2"].usWeightClass
if weight != 800:
    raise SystemExit(f"Caption font must have weight 800, found {weight}")
supported = set()
for table in font["cmap"].tables:
    supported.update(table.cmap)
font.close()

missing = {}
for cue_index, text in enumerate(texts, 1):
    unsupported = sorted(
        {character for character in text if not character.isspace() and ord(character) not in supported},
        key=ord,
    )
    if unsupported:
        missing[cue_index] = [
            {"character": character, "codepoint": f"U+{ord(character):04X}"}
            for character in unsupported
        ]
if missing:
    details = "; ".join(
        f"cue {index}: " + ", ".join(f"{item['codepoint']} {item['character']!r}" for item in characters)
        for index, characters in missing.items()
    )
    raise SystemExit(
        "Static Noto Sans KR 800 does not contain every caption glyph; "
        f"libass fallback is forbidden ({details})"
    )

width = 1080
height = 360
y_offset = 1050
channels = 3
frame_size = width * height * channels
frames = frames_path.read_bytes()
expected_size = len(texts) * frame_size
if len(frames) != expected_size:
    raise SystemExit(
        f"Expected {len(texts)} RGB24 calibration frames ({expected_size} bytes), "
        f"found {len(frames)} bytes"
    )

measurements = []
for index, text in enumerate(texts):
    frame = memoryview(frames)[index * frame_size : (index + 1) * frame_size]
    left = width
    top = height
    right = -1
    bottom = -1
    for offset in range(0, frame_size, channels):
        red, green, blue = frame[offset : offset + channels]
        # Measure only the white glyph core. The black outline is deliberately
        # excluded so visual centering cannot be biased by outline rasterization.
        if min(red, green, blue) >= 200 and max(red, green, blue) - min(red, green, blue) <= 8:
            pixel = offset // channels
            x = pixel % width
            y = pixel // width + y_offset
            left = min(left, x)
            top = min(top, y)
            right = max(right, x)
            bottom = max(bottom, y)
    if right < left or bottom < top:
        raise SystemExit(
            f"libass rendered no white caption pixels for cue {index + 1}: {text!r}"
        )
    rendered_width = right - left + 1
    center_x = (left + right) / 2
    measurements.append(
        {
            "renderedWidth": rendered_width,
            "textX": 540 + (540 - center_x),
            "calibrationBounds": [left, top, right + 1, bottom + 1],
            "calibrationCenterX": center_x,
        }
    )

output_path.write_text(
    json.dumps(measurements, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
