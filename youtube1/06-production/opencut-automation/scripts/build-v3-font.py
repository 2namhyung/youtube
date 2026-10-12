from pathlib import Path
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


if len(sys.argv) not in (3, 4):
    raise SystemExit("Usage: python scripts/build-v3-font.py <input.ttf> <output.ttf> [weight]")

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
weight = int(sys.argv[3]) if len(sys.argv) == 4 else 800
if weight not in (800, 900):
    raise SystemExit("Weight must be 800 or 900")
font = TTFont(source)
instantiateVariableFont(font, {"wght": weight}, inplace=True)

family = "School Shorts V3 Noto Sans KR" if weight == 800 else "School Shorts V3 Title Noto Sans KR"
style = "ExtraBold" if weight == 800 else "Black"
postscript_name = f"SchoolShortsV3NotoSansKR-{style}"
for platform_id, encoding_id, language_id in ((3, 1, 0x409), (1, 0, 0)):
    font["name"].setName(family, 1, platform_id, encoding_id, language_id)
    font["name"].setName(style, 2, platform_id, encoding_id, language_id)
    font["name"].setName(f"{family} {style}", 4, platform_id, encoding_id, language_id)
    font["name"].setName(postscript_name, 6, platform_id, encoding_id, language_id)
    font["name"].setName(family, 16, platform_id, encoding_id, language_id)
    font["name"].setName(style, 17, platform_id, encoding_id, language_id)

output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
print(f"Wrote Noto Sans KR weight {weight} to {output}")
