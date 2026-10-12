"""Generate the four typography-correct boarding-pass plates used by the Flow edit.

The renderer intentionally has no random inputs: rerunning it produces the same
1080x1920 RGB PNGs and keeps the card artwork independent of the video render.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "image-first" / "tickets"
SIZE = (1080, 1920)

FONT_REGULAR = r"C:\Windows\Fonts\arial.ttf"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_CJK = r"C:\Windows\Fonts\simsun.ttc"

TICKETS = (
    {"slug": "seoul", "destination": "SEOUL", "cjk": "首尔", "airport": "ICN", "edge": "#e7a2b2", "gate": "12", "seat": "08A", "seed": 11},
    {"slug": "tokyo", "destination": "TOKYO", "cjk": "东京", "airport": "HND", "edge": "#73b7d8", "gate": "07", "seat": "14C", "seed": 23},
    {"slug": "shanghai", "destination": "SHANGHAI", "cjk": "上海", "airport": "PVG", "edge": "#a59a8f", "gate": "21", "seat": "03F", "seed": 37},
    {"slug": "hanoi", "destination": "HANOI", "cjk": "河内", "airport": "HAN", "edge": "#9bd5ea", "gate": "04", "seat": "19D", "seed": 47},
)


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def _text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, fill: str = "#252a2c", *, bold: bool = False, mono: bool = False, cjk: bool = False) -> None:
    path = FONT_CJK if cjk else FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=_font(path, size), fill=fill)


def _barcode(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], seed: int) -> None:
    """Draw an integer-aligned, deterministic Code-128-like barcode."""
    x, y, width, height = box
    draw.rectangle((x, y, x + width, y + height), fill="#f3f1ea")
    pattern = (2, 4, 1, 3, 7, 2, 5, 1, 4, 2, 8, 3, 1, 5, 2, 6, 3, 1, 7, 2)
    pos = x + 12
    index = seed
    while pos < x + width - 12:
        bar = pattern[index % len(pattern)]
        gap = 2 + ((index * 3 + seed) % 3)
        draw.rectangle((pos, y + 12, min(pos + bar, x + width - 12), y + height - 12), fill="#202527")
        pos += bar + gap
        index += 1
    # Quiet-zone guards make the mark scan-like at video resolution.
    for guard_x in (x + 8, x + width - 8):
        draw.rectangle((guard_x, y + 6, guard_x + 2, y + height - 6), fill="#202527")


def _shadow(card_mask: Image.Image) -> Image.Image:
    shadow = Image.new("RGBA", SIZE, (255, 255, 255, 0))
    blurred = card_mask.filter(ImageFilter.GaussianBlur(25))
    layer = Image.new("RGBA", SIZE, (45, 39, 35, 0))
    layer.putalpha(blurred.point(lambda p: round(p * 0.20)))
    shadow.alpha_composite(layer, (13, 16))
    return shadow


def render(ticket: dict[str, object]) -> Image.Image:
    card_left, card_top, card_right, card_bottom = 112, 116, 968, 1804
    card_w, card_h = card_right - card_left, card_bottom - card_top
    radius = 34

    mask = Image.new("L", SIZE, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((card_left, card_top, card_right, card_bottom), radius=radius, fill=255)
    canvas = Image.new("RGBA", SIZE, "#ffffff")
    canvas.alpha_composite(_shadow(mask))

    card = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((card_left, card_top, card_right, card_bottom), radius=radius, fill="#fffdf8", outline="#303638", width=3)

    # Color edge is clipped to the rounded card silhouette.
    edge_left = card_right - 126
    edge = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((edge_left, card_top, card_right, card_bottom), fill=str(ticket["edge"]))
    edge.putalpha(Image.composite(edge.getchannel("A"), Image.new("L", SIZE, 0), mask))
    card.alpha_composite(edge)
    cd = ImageDraw.Draw(card)
    cd.line((edge_left, card_top + 8, edge_left, card_bottom - 8), fill="#ffffff", width=2)

    # Header and route.
    _text(cd, (158, 170), "TAO AIRWAYS", 34, bold=True)
    _text(cd, (158, 216), "BOARDING PASS  /  IMAGE-FIRST FLOW", 16, fill="#667073", mono=True)
    _text(cd, (158, 302), "YOUR JOURNEY STARTS HERE", 15, fill="#7a8282", mono=True)
    _text(cd, (158, 344), str(ticket["destination"]), 96, bold=True)
    _text(cd, (162, 452), str(ticket["cjk"]), 48, fill="#343b3c", cjk=True)
    _text(cd, (158, 523), f"{ticket['airport']}  /  TAO 1042", 19, fill="#687274", mono=True)
    cd.line((158, 588, edge_left - 30, 588), fill="#b9bfbd", width=2)
    # A compact route arrow reinforces that the card is a travel pass.
    _text(cd, (158, 620), "FROM", 14, fill="#7b8484", bold=True)
    _text(cd, (158, 647), "GUANGZHOU  CAN", 24, mono=True)
    _text(cd, (435, 642), "→", 34, fill="#596365", bold=True)
    _text(cd, (525, 620), "TO", 14, fill="#7b8484", bold=True)
    _text(cd, (525, 647), f"{ticket['destination']}  {ticket['airport']}", 24, mono=True)

    # Main fields are printed, not embedded in imagery, for crisp OCR at 9:16.
    fields = (("NAME", "MINA PARK"), ("FLT", "TAO 1042"), ("GATE", str(ticket["gate"])), ("SEAT", str(ticket["seat"])))
    field_y = 760
    field_w = 157
    for index, (label, value) in enumerate(fields):
        x = 158 + index * (field_w + 20)
        cd.rounded_rectangle((x, field_y, x + field_w, field_y + 146), radius=12, outline="#c4c9c7", width=2, fill="#ffffff")
        _text(cd, (x + 16, field_y + 18), label, 15, fill="#7b8484", bold=True, mono=True)
        _text(cd, (x + 16, field_y + 62), value, 23, fill="#252a2c", bold=label in ("FLT", "GATE", "SEAT"), mono=True)
    _text(cd, (158, 956), "PASSENGER  /  MINA PARK", 15, fill="#7b8484", bold=True, mono=True)
    _text(cd, (158, 1001), "DEPARTURE  18 OCT 2026   07:30", 20, mono=True)
    _text(cd, (158, 1045), "CABIN  ECONOMY       BOARDING  07:00", 17, fill="#5f686a", mono=True)

    # Perforated ticket separation with end notches.
    perforation_y = 1152
    cd.line((card_left + 31, perforation_y, edge_left - 30, perforation_y), fill="#aeb6b4", width=2)
    for x in range(card_left + 43, edge_left - 38, 20):
        cd.line((x, perforation_y, x + 10, perforation_y), fill="#ffffff", width=4)
    for x in (card_left, edge_left):
        cd.ellipse((x - 14, perforation_y - 14, x + 14, perforation_y + 14), fill="#ffffff")

    _text(cd, (158, 1210), "KEEP THIS PASS WITH YOU", 16, fill="#687274", bold=True, mono=True)
    _text(cd, (158, 1257), "ZONE  02", 52, bold=True, mono=True)
    _text(cd, (158, 1330), "NO. 0001042   /   VALID FOR ONE JOURNEY", 16, fill="#687274", mono=True)
    _barcode(cd, (158, 1400, edge_left - 180, 148), int(ticket["seed"]))
    _text(cd, (158, 1578), "TAO1042  0001042  18OCT26", 17, fill="#424b4d", mono=True)
    _text(cd, (158, 1645), "THANK YOU FOR FLYING TAO AIRWAYS", 18, fill="#606a6b", bold=True, mono=True)

    # Vertical airline strip and micro-printing on the colored edge.
    _text(cd, (edge_left + 34, 176), "TAO", 27, fill="#ffffff", bold=True)
    _text(cd, (edge_left + 38, 240), "1042", 18, fill="#ffffff", mono=True)
    strip = Image.new("RGBA", (card_h - 350, 38), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    _text(sd, (0, 0), "TAO AIRWAYS  /  BOARDING PASS", 18, fill="#324043", bold=True, mono=True)
    card.alpha_composite(strip.rotate(90, expand=True), (edge_left + 36, 390))
    _text(cd, (edge_left + 35, 1650), "GATE", 13, fill="#ffffff", bold=True, mono=True)
    _text(cd, (edge_left + 34, 1680), str(ticket["gate"]), 36, fill="#ffffff", bold=True, mono=True)
    _text(cd, (edge_left + 35, 1735), str(ticket["airport"]), 16, fill="#ffffff", bold=True, mono=True)

    canvas.alpha_composite(card)
    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for ticket in TICKETS:
        path = OUT / f"{int(TICKETS.index(ticket)) + 1:02d}-{ticket['slug']}-ticket.png"
        render(ticket).save(path, format="PNG", optimize=False)
        print(f"{path}  {SIZE[0]}x{SIZE[1]}")


if __name__ == "__main__":
    main()
