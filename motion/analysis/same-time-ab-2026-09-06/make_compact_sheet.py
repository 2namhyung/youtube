"""Create a compact paired lower-body sheet from the rendered A/B MP4s."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FFMPEG = str(Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe"))
FPS, W, H = 24, 720, 1280

def load(path: Path):
    p = subprocess.Popen([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"], stdout=subprocess.PIPE)
    data = p.stdout.read() if p.stdout else b""
    p.wait()
    size = W * H * 3
    return [Image.frombytes("RGB", (W, H), data[i:i+size]) for i in range(0, len(data), size) if len(data[i:i+size]) == size]

def main():
    a, b = load(HERE / "A-existing-tokyo-restart-1.5s.mp4"), load(HERE / "B-common-source-clock-1.5s.mp4")
    picks = list(range(11, 17))
    cw, ch, lh = 360, 190, 38
    out = Image.new("RGB", (cw * 2, 36 + len(picks) * (ch + lh)), "#242424")
    draw = ImageDraw.Draw(out)
    try: font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    except OSError: font = ImageFont.load_default()
    draw.text((8, 8), "Seoul→Tokyo transition: paired lower-body frames (A left / B right)", fill="white", font=font)
    for row, i in enumerate(picks):
        y = 36 + row * (ch + lh)
        for col, frames in enumerate((a, b)):
            crop = frames[i].crop((120, 900, 600, 1180)).resize((cw, ch), Image.Resampling.LANCZOS)
            out.paste(crop, (col * cw, y))
        draw.text((8, y + ch + 8), f"A f{i:02d} / global {6 + i/FPS:.3f}s", fill="white", font=font)
        draw.text((cw + 8, y + ch + 8), f"B f{i:02d} / global {6 + i/FPS:.3f}s", fill="white", font=font)
    out.save(HERE / "AB-foot-paired-frames-f11-f16.jpg", quality=96, subsampling=0)

if __name__ == "__main__": main()
