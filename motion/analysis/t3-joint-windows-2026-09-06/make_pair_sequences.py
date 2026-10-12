from __future__ import annotations
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[1]; P=ROOT/"production"/"ticket-travel"/"performance-v2"
FF=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
SRC={"tokyo":P/"tokyo-parasol-10s.mp4","shanghai":P/"shanghai-fan-10s.mp4","hanoi":P/"hanoi-hat-green-10s.mp4"}
def get(name,t):
 p=HERE/".pair.jpg"; subprocess.run([str(FF),"-y","-hide_banner","-loglevel","error","-ss",f"{t:.4f}","-i",str(SRC[name]),"-frames:v","1","-q:v","2",str(p)],check=True); im=Image.open(p).convert('RGB'); p.unlink(missing_ok=True); return im.crop((50,650,670,1280))
def make(name,anchor,cands,out):
 font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",17); cw,ch=180,180; lh=27; cols=7
 sheet=Image.new('RGB',(cw*cols,(ch+lh)*(len(cands)+1)),'#202020'); d=ImageDraw.Draw(sheet)
    # Reference outgoing sequence occupies the first row, then each incoming
    # candidate advances by the same 0.075s source step.
    for j in range(6):
      t=anchor+j*.075; im=get('tokyo',t); im.thumbnail((cw,ch),Image.Resampling.LANCZOS)
      x=j*cw; sheet.paste(im,(x+(cw-im.width)//2,0)); d.text((x+2,ch+3),f"Tokyo OUT {t:.3f}",fill='white',font=font)
 # rows are candidates, each advances the same source delta (4 output frames = .1667 source sec at 1.8x)
 for r,c in enumerate(cands,1):
  for j in range(6):
   t=(anchor+j*.075) if j==0 and False else (c+j*.075)
   im=get(name,t); im.thumbnail((cw,ch),Image.Resampling.LANCZOS); x=j*cw; y=r*(ch+lh); sheet.paste(im,(x+(cw-im.width)//2,y))
  d.text((6*cw+2,y+3),f"IN {c:.3f} + 0:.075...",fill='white',font=font)
 sheet.save(out,quality=94)
def main():
  make('shanghai',6.125,[2.375,2.5,2.625,2.75,2.875,3.0],HERE/'tokyo-shanghai-sequence-grid.jpg')
 make('hanoi',6.35,[5.5,5.625,5.75,5.875,6.0,6.125],HERE/'shanghai-hanoi-sequence-grid.jpg')
if __name__=='__main__': main()
