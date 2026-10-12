from __future__ import annotations
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
PERF=ROOT/"production"/"ticket-travel"/"performance-v2"
FF=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
SRC={"seoul":PERF/"canonical-hanbok-10s.mp4","tokyo":PERF/"tokyo-parasol-10s.mp4","shanghai":PERF/"shanghai-fan-10s.mp4","hanoi":PERF/"hanoi-hat-green-10s.mp4"}
BASE={"seoul":7.9,"tokyo":7.0,"shanghai":6.1}

def get(src,t):
    p=HERE/".tmp.jpg"
    subprocess.run([str(FF),"-y","-hide_banner","-loglevel","error","-ss",f"{t:.3f}","-i",str(src),"-frames:v","1","-q:v","2",str(p)],check=True)
    im=Image.open(p).convert("RGB")
    p.unlink(missing_ok=True)
    return im.crop((50,650,670,1280))

def sheet(boundary, old, new, old_start, candidates):
    font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",18)
    cw,ch=310,315
    out=Image.new("RGB",(cw*3,(ch+30)*((len(candidates)+2)//3)),"#202020")
    d=ImageDraw.Draw(out)
    # outgoing reference first
    items=[(f"OUT {old} {old_start:.3f}s",get(SRC[old],old_start))]+[(f"IN {new} {t:.3f}s",get(SRC[new],t)) for t in candidates]
    for i,(label,im) in enumerate(items):
        x=(i%3)*cw;y=(i//3)*(ch+30)
        im.thumbnail((cw,ch),Image.Resampling.LANCZOS)
        out.paste(im,(x+(cw-im.width)//2,y))
        d.text((x+5,y+ch+5),label,fill="white",font=font)
    out.save(HERE/f"{boundary}-incoming-candidates.jpg",quality=94)

def main():
    candidates=[i*.25 for i in range(19)]
    sheet("seoul-tokyo","seoul","tokyo",7.9,candidates)
    # Tokyo's proposed 1.625s start reaches 6.125s at the visible outgoing
    # edge (global 9.0s); do not compare Shanghai against the old 7.000s edge.
    sheet("tokyo-shanghai","tokyo","shanghai",6.125,candidates)
    sheet("shanghai-hanoi","shanghai","hanoi",6.1,[i*.25 for i in range(25)])
    # Larger, dense review around the proposed Tokyo outgoing pose.
    dense = [1.75 + i*.125 for i in range(13)]
    font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",20)
    cw,ch=420,430
    imout=Image.new("RGB",(cw*3,(ch+34)*5),"#202020"); d=ImageDraw.Draw(imout)
    items=[("Tokyo OUT 6.125s",get(SRC["tokyo"],6.125))]+[(f"Shanghai IN {t:.3f}s",get(SRC["shanghai"],t)) for t in dense]
    for i,(label,im) in enumerate(items):
        x=(i%3)*cw;y=(i//3)*(ch+34); im.thumbnail((cw,ch),Image.Resampling.LANCZOS)
        imout.paste(im,(x+(cw-im.width)//2,y)); d.text((x+6,y+ch+5),label,fill="white",font=font)
    imout.save(HERE/"tokyo-shanghai-dense-6.125.jpg",quality=95)

if __name__=="__main__": main()
