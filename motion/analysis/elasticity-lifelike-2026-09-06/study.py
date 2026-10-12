"""Read-only source audit; all derived output stays beside this script.
Frame indices come from FFmpeg's decoded frame order, not estimated seeks.
"""
from pathlib import Path
import subprocess, json, hashlib, math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCES = {
 'ticket': 'references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4',
 'blind': 'references/taoagou/nonfinger/blind_outfit_7651359823430176018.mp4',
 'polaroid': 'references/taoagou/nonfinger/polaroid_7666847800793042183.mp4',
 'slap': 'references/taoagou/nonfinger/slap_travel_7536265348543270151.mp4',
 'interactive': 'references/taoagou/taoagou_interactive_swipe_KuXyyAClOqSnCAcAmYvUZyEMmlNf3fM6ECnFVT00cEuM.mp4',
 'flow_integrated': 'production/ticket-travel/rebuild-v2/probe-02-transition.mp4',
 'flow_final': 'production/ticket-travel/final-sequence-v1/final-sequence-v1.mp4',
}

def metadata(path):
    probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration','-of','json',str(path)]))['streams'][0]
    a,b = map(int,probe['avg_frame_rate'].split('/'))
    probe['fps'] = a/b
    probe['sha256'] = hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
    return probe

META = {key: dict(path=value, **metadata(ROOT/value)) for key,value in SOURCES.items()}

def frames(key, indices, height=480):
    meta = META[key]
    width = round(meta['width']/meta['height']*height/2)*2
    expr = '+'.join(f'eq(n,{n})' for n in indices)
    data = subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/SOURCES[key]),'-vf',f"select='{expr}',scale={width}:{height}",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-'])
    arr = np.frombuffer(data,np.uint8).reshape(-1,height,width,3)
    assert len(arr)==len(indices),(key,len(arr),len(indices))
    return arr

def sheet(key, indices, name, cols=6, height=360):
    ims=frames(key,indices,height)
    w=ims.shape[2]; h=height+25
    canvas=Image.new('RGB',(cols*w, math.ceil(len(ims)/cols)*h),'#202020')
    d=ImageDraw.Draw(canvas)
    for i,(n,arr) in enumerate(zip(indices,ims)):
        x=i%cols*w;y=i//cols*h
        canvas.paste(Image.fromarray(arr),(x,y))
        d.text((x+4,y+height+3),f'F{n}  {n/META[key]["fps"]:.3f}s',fill='white')
    canvas.save(OUT/(name+'.jpg'),quality=92)

if __name__=='__main__':
    (OUT/'source-lock.json').write_text(json.dumps(META,indent=2),encoding='utf-8')
    for key in SOURCES:
        fps=META[key]['fps']; count=int(META[key]['nb_frames'])
        step=round(fps*(1 if key=='interactive' else .5))
        sheet(key,list(range(0,count,step)),key+'-overview',cols=8,height=300)
    sheet('ticket',list(range(126,157)),'ticket-entry-every-frame',cols=8,height=400)
    sheet('ticket',list(range(198,216)),'ticket-second-every-frame',cols=6,height=400)
    sheet('flow_final',list(range(84,101)),'final-entry-every-frame',cols=6,height=400)
    sheet('flow_integrated',list(range(30,56)),'integrated-entry-every-frame',cols=7,height=400)
    sheet('polaroid',list(range(165,191)),'polaroid-flip-every-frame',cols=7,height=360)
    sheet('blind',list(range(30,46)),'blind-first-switch-every-frame',cols=8,height=360)
    # First card entry only: no old-card ambiguity; dark occupancy in left,
    # actor-free ROI gives an operational edge, NOT the hidden design boundary.
    ids=list(range(126,163)); ims=frames('ticket',ids,height=1080)
    values=[]
    for n,arr in zip(ids,ims):
        dark=(arr[:,45:100,:].mean(axis=2)<238).mean(axis=1)
        hits=np.where(dark>.32)[0]
        y=int(hits[0]) if len(hits) else None
        values.append({'frame':n,'time':n/30,'edge_y_at_540x1080':y})
    (OUT/'ticket-edge-candidate.json').write_text(json.dumps({'roi_x':[45,100],'luma_threshold':238,'occupancy_threshold':.32,'warning':'Operational left edge, includes shadow and tilt; inspect evidence before interpreting as trajectory.','samples':values},indent=2),encoding='utf-8')
    print(json.dumps({'outputs':len(list(OUT.glob('*.jpg'))),'ticket_edge':values},indent=2))
