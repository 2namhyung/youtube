from __future__ import annotations
import importlib.util
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
RENDER=ROOT/"analysis"/"t3-all-city-2026-09-06"/"render_t3_all_city.py"
FF=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
PERF=ROOT/"production"/"ticket-travel"/"performance-v2"
SOURCES={"seoul":PERF/"canonical-hanbok-10s.mp4","tokyo":PERF/"tokyo-parasol-10s.mp4","shanghai":PERF/"shanghai-fan-10s.mp4","hanoi":PERF/"hanoi-hat-green-10s.mp4"}
STARTS={"seoul":2.5,"tokyo":1.625,"shanghai":2.5,"hanoi":5.75}
BRANCH={"seoul":3.5,"tokyo":6.5,"shanghai":9.0,"hanoi":11.0}
PREV={"tokyo":"seoul","shanghai":"tokyo","hanoi":"shanghai"}
CARD={"seoul":0,"tokyo":1,"shanghai":2,"hanoi":3}
FPS=24; W,H=720,1280; DUR=.5

def load(path,name):
    sp=importlib.util.spec_from_file_location(name,path); assert sp and sp.loader
    m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
base=load(RENDER,"joint_base"); v1,v2=base.v1,base.v2; v1._green_matte=v2._green_matte

def run(cmd): subprocess.run(cmd,check=True)

def clip(boundary,start_abs,starts=None,duration=1.5,tag="base"):
    new=boundary; old=PREV[new]
    starts = dict(STARTS if starts is None else starts)
    tickets=[__import__('numpy').asarray(Image.open(p).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)) for p in v1.TICKETS]
    readers={n:base.SourceReader(p,starts[n]) for n,p in SOURCES.items()}; body=v1.v2._body_mask()
    out=HERE/f"joint-audition-{old}-{new}-{tag}.mp4"
    proc=subprocess.Popen([str(FF),"-y","-hide_banner","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",str(out)],stdin=subprocess.PIPE)
    assert proc.stdin
    try:
      for i in range(round(duration*FPS)):
        t=start_abs+i/FPS; st=BRANCH[new]
        if t < st:
          actor,ai,_=readers[old].at(t-BRANCH[old]); composed=v1._static(tickets[CARD[old]],actor,old,ai,True)
        elif t < st+DUR:
          p=t-st; a,ai,_=readers[old].at(t-BRANCH[old]); b,bi,_=readers[new].at(t-st)
          composed=v1._transition(tickets[CARD[old]],tickets[CARD[new]],a,b,p,body,old,new,ai,bi,True)
        else:
          actor,ai,_=readers[new].at(t-st); composed=v1._static(tickets[CARD[new]],actor,new,ai,True)
        proc.stdin.write(composed.tobytes())
    finally:
      proc.stdin.close()
      for r in readers.values(): r.close()
    if proc.wait()!=0: raise RuntimeError(out)
    return out

def contact(boundary,clip_path,start_abs,tag="base"):
    font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",18)
    # Dense first 8 frames around the card edge, plus 1.5s overview every 6 frames.
    ts=[start_abs+i/FPS for i in range(8)]+[start_abs+i/FPS for i in range(8,36,4)]
    cw,ch,lh=360,500,32; cols=2
    out=Image.new("RGB",(cw*cols,(ch+lh)*((len(ts)+1)//2)),"#202020"); d=ImageDraw.Draw(out)
    for i,t in enumerate(ts):
      p=HERE/f".contact-{boundary}-{i}.jpg"; run([str(FF),"-y","-hide_banner","-loglevel","error","-ss",f"{t-start_abs:.6f}","-i",str(clip_path),"-frames:v","1","-q:v","3",str(p)])
      im=Image.open(p).convert('RGB'); im.thumbnail((cw,ch),Image.Resampling.LANCZOS); x=(i%cols)*cw;y=(i//cols)*(ch+lh)
      out.paste(im,(x+(cw-im.width)//2,y)); d.text((x+6,y+ch+5),f"global {t:.3f}s / local {t-start_abs:.3f}s",fill='white',font=font); p.unlink(missing_ok=True)
    out.save(HERE/f"joint-audition-{boundary}-{tag}-contact.jpg",quality=94)

def main():
  records=[]
  for b,s in (("tokyo",6.25),("shanghai",8.75),("hanoi",10.75)):
    old=PREV[b]; path=clip(b,s); contact(f"{old}-{b}",path,s)
    records.append({"boundary":f"{old}->{b}","global_start":s,"duration":1.5,"output":str(path),"starts":STARTS})
  # Dynamic A/B around the only still-ambiguous joint edge.  This keeps
  # Tokyo's proposed outgoing source time 6.125s fixed while changing only
  # Shanghai's incoming start.
  for sh_start,tag in ((2.5,"shanghai-2.500"),(2.75,"shanghai-2.750")):
    st=dict(STARTS); st["shanghai"]=sh_start
    path=clip("shanghai",8.75,st,tag=tag); contact("tokyo-shanghai",path,8.75,tag)
    records.append({"boundary":"tokyo->shanghai","global_start":8.75,"duration":1.5,"output":str(path),"starts":st})
  # If Shanghai moves to 2.750s its outgoing edge moves from 6.100 to 6.350s;
  # check Hanoi 5.750 and 6.000 against that actual incoming state.
  for h_start,tag in ((5.75,"chain-shanghai-2.750-hanoi-5.750"),(6.0,"chain-shanghai-2.750-hanoi-6.000")):
    st=dict(STARTS); st["shanghai"]=2.75; st["hanoi"]=h_start
    path=clip("hanoi",10.75,st,tag=tag); contact("shanghai-hanoi",path,10.75,tag)
    records.append({"boundary":"shanghai->hanoi","global_start":10.75,"duration":1.5,"output":str(path),"starts":st})
  (HERE/"joint-audition-metadata.json").write_text(json.dumps({"factor":1.8,"source_starts":STARTS,"records":records,"status":"bounded visual auditions; no T3 PASS"},indent=2)+"\n",encoding="utf-8")

if __name__=="__main__": main()
