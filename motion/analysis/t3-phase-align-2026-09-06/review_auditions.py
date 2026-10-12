"""Read-only video review: extract the actual foot-switch frames into a sheet."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FFMPEG = 'C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
OFFSETS = (2.375, 2.5, 2.625)
FRAMES = (17, 18, 19, 20, 21)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 19)

def sheet(boundary):
    output = Image.new('RGB', (1080, 5*270), '#222222')
    draw = ImageDraw.Draw(output)
    for col, offset in enumerate(OFFSETS):
        path = HERE / f'audition-{boundary}-shanghai-{offset:.3f}.mp4'
        data = subprocess.run([FFMPEG, '-v', 'error', '-i', str(path), '-vf',
            'select=between(n\\,17\\,21)', '-vsync', '0', '-f', 'rawvideo',
            '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
        size = 720*1280*3
        if len(data) != len(FRAMES)*size:
            raise ValueError(f'incomplete review frames: {path}')
        for row, frame in enumerate(FRAMES):
            im = Image.frombytes('RGB', (720,1280), data[row*size:(row+1)*size])
            crop = im.crop((180, 930, 540, 1170))
            x, y = col*360, row*270
            output.paste(crop, (x,y+30))
            draw.text((x+7,y+6), f'start {offset:.3f}s | F{frame} ({(frame-18)/24:+.3f}s)', font=font, fill='white')
    output.save(HERE / f'review-{boundary}-foot-switch.jpg', quality=95)

if __name__ == '__main__':
    import sys
    for boundary in sys.argv[1:]:
        sheet(boundary)
