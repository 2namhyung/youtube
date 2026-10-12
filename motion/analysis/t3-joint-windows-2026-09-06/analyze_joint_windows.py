from __future__ import annotations

import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PERF = ROOT / "production" / "ticket-travel" / "performance-v2"
FF = Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
SOURCES = {
    "seoul": PERF / "canonical-hanbok-10s.mp4",
    "tokyo": PERF / "tokyo-parasol-10s.mp4",
    "shanghai": PERF / "shanghai-fan-10s.mp4",
    "hanoi": PERF / "hanoi-hat-green-10s.mp4",
}

def frame(src: Path, t: float, out: Path) -> None:
    subprocess.run([str(FF), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.4f}", "-i", str(src), "-frames:v", "1", "-q:v", "3", str(out)], check=True)

def main() -> None:
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 15)
    times = [i * .25 for i in range(40)]
    cw, ch, lh = 180, 320, 155
    for name, src in SOURCES.items():
        sheet = Image.new("RGB", (cw * 5, (ch + lh) * 8), "#202020")
        draw = ImageDraw.Draw(sheet)
        for i, t in enumerate(times):
            p = HERE / f".f-{name}-{i}.jpg"
            frame(src, t, p)
            im = Image.open(p).convert("RGB")
            x, y = (i % 5) * cw, (i // 5) * (ch + lh)
            full = im.resize((cw, ch), Image.Resampling.LANCZOS)
            lower = im.crop((0, 640, 720, 1280)).resize((cw, lh), Image.Resampling.LANCZOS)
            sheet.paste(full, (x, y)); sheet.paste(lower, (x, y + ch))
            draw.text((x + 3, y + ch + 3), f"{name} {t:.2f}s lower", fill="white", font=font)
            p.unlink(missing_ok=True)
        sheet.save(HERE / f"{name}-full-lower-0-10s.jpg", quality=93)

if __name__ == "__main__":
    main()
