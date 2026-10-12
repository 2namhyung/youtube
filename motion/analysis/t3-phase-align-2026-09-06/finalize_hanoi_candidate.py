"""Assemble a provisional Hanoi-only offset correction; keep other cuts intact."""
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
BASE = HERE.parent/'t3-all-city-2026-09-06'/'t3-all-city-1.80x-13s.mp4'
TAIL = HERE/'hanoi-start-5.750-last3s.mp4'
OUT = HERE/'provisional-hanoi-phase-13s.mp4'
COMPARE = HERE/'hanoi-phase-before-after-last3s.mp4'
BIN = Path('C:/Users/every/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin')
FF = str(BIN/'ffmpeg.exe')
FP = str(BIN/'ffprobe.exe')

def run(args):
    return subprocess.run(args, check=True, capture_output=True)

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    before_hash = digest(BASE)
    run([FF,'-y','-v','error','-i',str(BASE),'-i',str(TAIL),'-filter_complex',
        '[0:v]trim=end_frame=240,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]',
        '-map','[v]','-map','0:a:0','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
        '-c:a','copy','-movflags','+faststart',str(OUT)])
    run([FF,'-y','-v','error','-ss','10','-i',str(BASE),'-i',str(TAIL),'-filter_complex',
        "[0:v]setpts=PTS-STARTPTS,drawtext=text='BEFORE - Hanoi 6.000s':x=15:y=15:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7[a];"
        "[1:v]drawtext=text='CANDIDATE - Hanoi 5.750s':x=15:y=15:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7[b];[a][b]hstack=inputs=2[v]",
        '-map','[v]','-an','-t','3','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(COMPARE)])
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
    sheet=Image.new('RGB',(720,1350),'#222222'); draw=ImageDraw.Draw(sheet)
    for col,(path,seek,label) in enumerate(((BASE,10,'BEFORE'),(TAIL,0,'CANDIDATE'))):
        data=run([FF,'-v','error','-ss',str(seek),'-i',str(path),'-vf','select=between(n\\,23\\,27)',
            '-vsync','0','-f','rawvideo','-pix_fmt','rgb24','-']).stdout
        size=720*1280*3
        assert len(data)==5*size
        for row in range(5):
            im=Image.frombytes('RGB',(720,1280),data[row*size:(row+1)*size])
            sheet.paste(im.crop((180,930,540,1170)),(col*360,row*270+30))
            draw.text((col*360+7,row*270+6),f'{label} t={10+(23+row)/24:.3f}s',font=font,fill='white')
    sheet.save(HERE/'hanoi-phase-foot-switch-before-after.jpg',quality=95)
    artifacts={}
    for path in (OUT,TAIL,COMPARE):
        run([FF,'-v','error','-i',str(path),'-f','null','-'])
        probe=json.loads(run([FP,'-v','error','-count_frames','-show_entries',
            'stream=width,height,r_frame_rate,nb_read_frames,duration:format=duration','-of','json',str(path)]).stdout)
        artifacts[path.name]={'sha256':digest(path),'probe':probe,'full_decode':'PASS'}
    assert digest(BASE)==before_hash
    (HERE/'hanoi-candidate-metadata.json').write_text(json.dumps({
        'status':'provisional visual candidate, no user phase PASS',
        'change':'Only Hanoi source start 6.000 -> 5.750 seconds; source end nominal 9.350 seconds',
        'factor':1.8,'card_times':[3.5,6.5,9.0,11.0],
        'preserved':'Other city source maps, card geometry/masks/timing, original audio and 13s duration',
        'baseline':str(BASE),'baseline_sha256':before_hash,'artifacts':artifacts,
        'limits':'Offset is a visual pose-continuity candidate, not tracked anatomical contact certification. Head direction and outfit geometry remain unchanged.'
    },indent=2)+'\n',encoding='utf-8')
    print(json.dumps(artifacts,indent=2))

if __name__=='__main__': main()
