from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def magenta_strength(pixel: tuple[int, int, int]) -> float:
    red, green, blue = pixel
    # Chroma backgrounds have both red and blue well above green.  Skin and
    # rust clothing may be red, but do not have a strong blue component.
    return min(red, blue) - green


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed-threshold", type=float, default=58.0)
    parser.add_argument("--edge-threshold", type=float, default=24.0)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGB")
    width, height = source.size
    pixels = source.load()
    connected = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if connected[index]:
            return
        if magenta_strength(pixels[x, y]) < args.edge_threshold:
            return
        connected[index] = 1
        queue.append((x, y))

    for x in range(width):
        if magenta_strength(pixels[x, 0]) >= args.seed_threshold:
            enqueue(x, 0)
        if magenta_strength(pixels[x, height - 1]) >= args.seed_threshold:
            enqueue(x, height - 1)
    for y in range(height):
        if magenta_strength(pixels[0, y]) >= args.seed_threshold:
            enqueue(0, y)
        if magenta_strength(pixels[width - 1, y]) >= args.seed_threshold:
            enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    output = Image.new("RGBA", source.size)
    out = output.load()
    transparent = 0
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            index = y * width + x
            if connected[index]:
                strength = magenta_strength((red, green, blue))
                alpha = int(max(0.0, min(255.0, 255.0 * (args.seed_threshold - strength) / max(1.0, args.seed_threshold - args.edge_threshold))))
                # Remove magenta spill only in the connected background matte.
                spill = max(0, min(red, blue) - green)
                red = max(0, red - spill)
                blue = max(0, blue - spill)
                if alpha == 0:
                    transparent += 1
                out[x, y] = (red, green, blue, alpha)
            else:
                out[x, y] = (red, green, blue, 255)

    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    output.save(target)
    print(f"wrote={target} transparent={transparent} total={width * height}")


if __name__ == "__main__":
    main()
