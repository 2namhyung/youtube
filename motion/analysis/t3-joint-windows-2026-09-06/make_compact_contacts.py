from __future__ import annotations
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE=Path(__file__).resolve().parent
FF=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
FPS=24; W,H=720,1280

def read_frames(path):
 p=subprocess.Popen([str(FF),"-hide_banner","-loglevel","error","-i",str(path),"-f","rawvideo","-pix_fmt","rgb24","-vsync","0","pipe:1"],stdout=subprocess.PIPE)
 data=p.stdout.read(W*H*3*36); p.terminate(); p.wait()
 a=np.frombuffer(data,dtype=np.uint8).reshape((-1,H,W,3)); return [Image.fromarray(x) for x in a]

def sheet(items,out):
 font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",17); cols=8; cw,ch,lh=250,185,32
 rows=len(items); result=Image.new('RGB',(cols*cw,(ch+lh)*rows),'#202020'); d=ImageDraw.Draw(result)
 for r,(label,path) in enumerate(items):
  frames=read_frames(path)
  for j,idx in enumerate(range(4,12)):
   # The card edge begins at local frame 6. Keep the complete footwear ROI.
   im=frames[idx].crop((180,930,540,1170)); im.thumbnail((cw,ch),Image.Resampling.LANCZOS)
   x=j*cw; y=r*(ch+lh); result.paste(im,(x+(cw-im.width)//2,y))
   d.text((x+4,y+ch+5),f"{label} f{idx} ({idx/24:.3f}s)",fill='white',font=font)
 result.save(out,quality=94)

def main():
 groups={
  'tokyo-shanghai':[("base sh=2.500",HERE/'joint-audition-tokyo-shanghai-base.mp4'),("A sh=2.500",HERE/'joint-audition-tokyo-shanghai-shanghai-2.500.mp4'),("B sh=2.750",HERE/'joint-audition-tokyo-shanghai-shanghai-2.750.mp4')],
  'shanghai-hanoi':[("base",HERE/'joint-audition-shanghai-hanoi-base.mp4'),("chain h=5.750",HERE/'joint-audition-shanghai-hanoi-chain-shanghai-2.750-hanoi-5.750.mp4'),("chain h=6.000",HERE/'joint-audition-shanghai-hanoi-chain-shanghai-2.750-hanoi-6.000.mp4')],
  'seoul-tokyo':[("joint",HERE/'joint-audition-seoul-tokyo-base.mp4')],
 }
 for n,items in groups.items(): sheet(items,HERE/f'compact-{n}-first12.jpg')
if __name__=='__main__': main()
