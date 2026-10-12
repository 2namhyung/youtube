import json, sys
from PIL import ImageFont
font = ImageFont.truetype(sys.argv[1], 100)
texts = json.load(open(sys.argv[2], encoding='utf-8'))
out = []
for text in texts:
    out.append(float(font.getlength(text)))
json.dump(out, sys.stdout)
