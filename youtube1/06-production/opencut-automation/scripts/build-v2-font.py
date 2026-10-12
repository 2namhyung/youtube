from pathlib import Path
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


if len(sys.argv) != 3:
    raise SystemExit("Usage: python scripts/build-v2-font.py <input.ttf> <output.ttf>")

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
font = TTFont(source)
instantiateVariableFont(font, {"wght": 800}, inplace=True)

family = "School Shorts Noto Sans KR"
postscript_name = "SchoolShortsNotoSansKR-ExtraBold"
for platform_id, encoding_id, language_id in ((3, 1, 0x409), (1, 0, 0)):
    font["name"].setName(family, 1, platform_id, encoding_id, language_id)
    font["name"].setName("ExtraBold", 2, platform_id, encoding_id, language_id)
    font["name"].setName(f"{family} ExtraBold", 4, platform_id, encoding_id, language_id)
    font["name"].setName(postscript_name, 6, platform_id, encoding_id, language_id)
    font["name"].setName(family, 16, platform_id, encoding_id, language_id)
    font["name"].setName("ExtraBold", 17, platform_id, encoding_id, language_id)

output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
print(f"Wrote Noto Sans KR weight 800 to {output}")

