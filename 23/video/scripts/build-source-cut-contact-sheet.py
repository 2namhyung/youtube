from argparse import ArgumentParser
from math import ceil
from pathlib import Path
from PIL import Image

parser = ArgumentParser()
parser.add_argument('--input-dir', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--expected-count', type=int, required=True)
parser.add_argument('--columns', type=int, default=5)
parser.add_argument('--cell-width', type=int, default=380)
parser.add_argument('--cell-height', type=int, default=214)
args = parser.parse_args()

files = sorted(Path(args.input_dir).glob('*.jpg'))
if len(files) != args.expected_count:
    raise SystemExit(f'expected {args.expected_count} midpoint frames, found {len(files)}')

cell_w, cell_h, gap = args.cell_width, args.cell_height, 4
rows = ceil(len(files) / args.columns)
canvas = Image.new('RGB', (cell_w * args.columns + gap * (args.columns + 1), cell_h * rows + gap * (rows + 1)), 'white')
for index, file in enumerate(files):
    frame = Image.open(file).convert('RGB')
    frame.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
    x = gap + (index % args.columns) * (cell_w + gap) + (cell_w - frame.width) // 2
    y = gap + (index // args.columns) * (cell_h + gap) + (cell_h - frame.height) // 2
    canvas.paste(frame, (x, y))
canvas.save(args.output, quality=91, optimize=True)
