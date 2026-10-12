from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SOURCE = (
    ROOT
    / "../../production/motion-assets/generic-character-poc-v1/master-approved-v1-alpha-v4.png"
).resolve()
OUTPUT_DIR = ROOT / "public/continuous-arm"
OUTPUT = OUTPUT_DIR / "character-base.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (1024, 1536):
        raise RuntimeError(f"unexpected master size: {source.size}")

    # Remove only the screen-right arm from the approved transparent derivative.
    # The replacement arm is rendered as one continuous deforming sleeve behind
    # this base. The polygon stays away from the collar, face, left arm and legs.
    erase = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(erase)
    draw.polygon(
        [
            (615, 425),
            (675, 430),
            (710, 500),
            (730, 620),
            (806, 696),
            (892, 704),
            (916, 914),
            (790, 958),
            (680, 910),
            (610, 770),
            (585, 650),
            (600, 520),
        ],
        fill=255,
    )
    # A small feather avoids a bright cut edge. It is not a dissolve and does
    # not change opacity during animation.
    alpha = source.getchannel("A")
    alpha_pixels = alpha.load()
    erase_pixels = erase.load()
    for y in range(source.height):
        for x in range(source.width):
            if erase_pixels[x, y]:
                alpha_pixels[x, y] = 0
    source.putalpha(alpha)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
