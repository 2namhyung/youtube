from __future__ import annotations
import hashlib, importlib.util, json, shutil, subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
BASE_PATH=HERE.parent/"t3-all-city-2026-09-06"/"render_t3_all_city.py"
OLD=HERE.parent/"t3-all-city-2026-09-06"/"t3-all-city-1.80x-13s.mp4"
OUT=HERE/"joint-windows-1.80x-13s.mp4"
SILENT=HERE/".joint-windows-1.80x-13s-silent.mp4"
FF=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe")
FP=Path("C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffprobe.exe")

def load(path,name):
 sp=importlib.util.spec_from_file_location(name,path); assert sp and sp.loader
 m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
base=load(BASE_PATH,"joint_full_base")
STARTS={"seoul":2.5,"tokyo":1.625,"shanghai":2.75,"hanoi":6.0}
base.SOURCE_STARTS=STARTS

def sha(p):
 h=hashlib.sha256();
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def probe(p):
 r=subprocess.run([str(FP),'-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,width,height,r_frame_rate,nb_read_frames,duration','-show_entries','format=duration','-of','json',str(p)],capture_output=True,text=True,check=True)
 return json.loads(r.stdout)
def main():
 if sha(OLD)!="63041b7225fad09a25d296329a59e2f771280ed1b88bd6ab404aacf441cb94c3": raise RuntimeError('old T3 baseline changed')
 base.render_silent(SILENT)
 base.mux_audio(SILENT,OUT)
 # Full decode after final mux.
 subprocess.run([str(FF),'-v','error','-i',str(OUT),'-f','null','-'],check=True)
 out_probe=probe(OUT)
 video=next(s for s in out_probe["streams"] if s.get("codec_type")=="video")
 assert (video.get("width"),video.get("height"),video.get("r_frame_rate"),video.get("nb_read_frames"),video.get("duration")) == (720,1280,"24/1","312","13.000000")
 assert sha(OLD)=="63041b7225fad09a25d296329a59e2f771280ed1b88bd6ab404aacf441cb94c3"
 meta={"created_utc":datetime.now(timezone.utc).isoformat(),"status":"provisional joint source-window candidate; not T3 PASS","factor":1.8,"source_starts":STARTS,"timeline":base.BRANCH_STARTS,"transition_duration":base.TRANSITION_DURATION,"output":{"path":str(OUT),"sha256":sha(OUT),"probe":out_probe,"full_decode":"PASS","assertions":"720x1280, 24fps, 312 video frames, 13.000s"},"preserved":{"prior_t3_path":str(OLD),"prior_t3_sha256":sha(OLD),"prior_t3_unchanged":True,"card_timing_geometry":"inherited","audio":"copied from production/ticket-travel/final-sequence-v2/final-sequence-v2.mp4; original timing retained","matte":"inherited Hanoi green matte","no_loops_freezes_padding":True},"phase_qc":{"seoul_tokyo":"NOT_MEASURABLE/visible stance jump remains; no PASS","tokyo_shanghai":"bounded candidate selected at Shanghai 2.750s; visual review only","shanghai_hanoi":"bounded candidate selected at Hanoi 6.000s; visual review only","note":"garments/card matte hide contact; no anatomical foot tracker"}}
 (HERE/'joint-windows-metadata.json').write_text(json.dumps(meta,indent=2)+"\n",encoding='utf-8')
 print(json.dumps(meta["output"],indent=2))
if __name__=='__main__': main()
