from hashlib import sha256
from json import dumps
from pathlib import Path
from PIL import Image

study = Path(__file__).resolve().parent
source = (study / '../../production/motion-assets/generic-character-poc-v1/phone-pickup-8-keyposes-v1-alpha.png').resolve()
target = study / 'public/keyposes-v2'
target.mkdir(parents=True, exist_ok=True)
image = Image.open(source).convert('RGBA')
cols, rows = 4, 2
cell_w = image.width // cols
row_edges = [0, image.height // rows, image.height]
records = []

for index in range(8):
    col, row = index % cols, index // cols
    x0 = col * cell_w
    x1 = image.width if col == cols - 1 else (col + 1) * cell_w
    y0, y1 = row_edges[row], row_edges[row + 1]
    cell = image.crop((x0, y0, x1, y1))
    bbox = cell.getchannel('A').getbbox()
    if bbox is None:
        raise RuntimeError(f'pose {index + 1} has no opaque pixels')
    pad = 8
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(cell.width, bbox[2] + pad)
    bottom = min(cell.height, bbox[3] + pad)
    pose = cell.crop((left, top, right, bottom))
    output = target / f'pose-{index + 1:02d}.png'
    pose.save(output)
    payload = output.read_bytes()
    records.append({
        'id': f'pose-{index + 1:02d}',
        'sourceCell': [x0, y0, x1, y1],
        'opaqueBboxInCell': list(bbox),
        'cropInCell': [left, top, right, bottom],
        'width': pose.width,
        'height': pose.height,
        'sha256': sha256(payload).hexdigest(),
    })

manifest = {
    'schema': 'character-keypose-crops-v1',
    'source': str(source),
    'sourceSha256': sha256(source.read_bytes()).hexdigest(),
    'sourceDimensions': [image.width, image.height],
    'poses': records,
}
(target / 'manifest.json').write_text(dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(dumps(manifest, ensure_ascii=False, indent=2))
