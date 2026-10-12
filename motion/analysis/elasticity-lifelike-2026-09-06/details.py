"""Supplementary research evidence, not a production renderer."""
from study import *

sheet('blind', list(range(44,63)), 'blind-covered-switch', cols=7, height=360)
sheet('blind', list(range(74,87)), 'blind-return-switch', cols=7, height=360)
sheet('slap', list(range(77,103)), 'slap-first-whip', cols=7, height=360)
sheet('interactive', list(range(260,301,2)), 'interactive-carousel', cols=7, height=360)
sheet('polaroid', list(range(185,200)), 'polaroid-flip-settle', cols=5, height=400)
sheet('ticket', list(range(262,280)), 'ticket-third', cols=6, height=360)
sheet('ticket', list(range(330,348)), 'ticket-fourth', cols=6, height=360)

ids=list(range(130,153)); ims=frames('ticket',ids,1080)
trials=[]
for roi in [(45,100),(65,115)]:
    for threshold in (232,238,244):
        values=[]
        for arr in ims:
            occ=(arr[:,roi[0]:roi[1],:].mean(axis=2)<threshold).mean(axis=1)
            hits=np.where(occ>.32)[0]
            values.append(int(hits[0]) if len(hits) else None)
        trials.append(dict(roi_x=roi,threshold=threshold,frames=ids,y=values))
(OUT/'edge-sensitivity.json').write_text(json.dumps(trials,indent=2),encoding='utf-8')

# Operational position curve from the selected edge, plus the existing
# renderer's mathematical curve. Comparison is normalized, not a curve fit.
ys=np.array(trials[1]['y'][:15],dtype=float)
progress=(ys[0]-ys)/(ys[0]-ys[-1])
elapsed=np.arange(len(ys))/30
im=Image.new('RGB',(1100,660),'white'); d=ImageDraw.Draw(im)
d.text((50,20),'Ticket entry: measured edge vs existing renderer curve',fill='black')
d.text((50,43),'Reference 540x1080 ROI x45:100; normalized visible F130-F144 (0.467s)',fill='black')
box=(85,100,1010,565)
for tick in range(11):
    y=565-tick/10*465
    d.line((85,y,1010,y),fill='#dddddd')
    d.text((48,y-7),f'{tick*10}%',fill='black')
for tick in range(11):
    x=85+tick/10*925
    d.text((x-10,580),f'{tick/10:.1f}',fill='black')
def point(t,p): return (85+t*925,565-p*465)
def poly(ts,ps,color): d.line([point(t,p) for t,p in zip(ts,ps)],fill=color,width=4)
u=np.arange(len(ys))/(len(ys)-1)
poly(u,progress,'#0066cc')
for x,y in map(lambda tp:point(*tp),zip(u,progress)): d.ellipse((x-4,y-4,x+4,y+4),fill='#0066cc')
q=np.linspace(0,1,201)
poly(q,1-(1-q)**3,'#e47700')
poly(q,q,'#999999')
d.text((120,615),'Blue: measured reference    Orange: code 1-(1-u)^3    Gray: linear',fill='black')
d.text((760,640),'x: normalized visible progress time',fill='black')
im.save(OUT/'ticket-timing-curve.png')

# Annotations let a reviewer check that detection remains on the left edge.
check=[130,133,134,135,138,144]; images=frames('ticket',check,1080)
board=Image.new('RGB',(6*270,570),'#202020')
for i,(n,arr) in enumerate(zip(check,images)):
    pic=Image.fromarray(arr); draw=ImageDraw.Draw(pic)
    y=trials[1]['y'][ids.index(n)]
    draw.line((20,y,180,y),fill='red',width=4)
    draw.rectangle((45,max(0,y-12),100,min(1079,y+12)),outline='red',width=3)
    board.paste(pic.resize((270,540)),(i*270,0))
    ImageDraw.Draw(board).text((i*270+5,545),f'F{n}: y={y}',fill='white')
board.save(OUT/'ticket-edge-verification.jpg',quality=95)

def compare_clip():
    # Place first visible incoming-card frame at approximately t=0.20.
    # Native speed, no optical flow. 120fps output repeats native 24/30fps
    # frames; it does not invent motion samples. 1:2 reference is contained.
    starts={'ticket':124,'flow_integrated':28,'flow_final':80}
    lengths={'ticket':42,'flow_integrated':34,'flow_final':34}
    order=list(starts)
    args=['ffmpeg','-v','error','-y']
    for key in order: args+=['-i',str(ROOT/SOURCES[key])]
    filters=[]
    titles=['REFERENCE first entry','FLOW integrated probe','FLOW clips + local composite']
    for i,key in enumerate(order):
        start=starts[key];end=start+lengths[key]
        filters.append(f'[{i}:v]trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,scale=360:720:force_original_aspect_ratio=decrease,pad=360:760:(ow-iw)/2:40:color=black,setsar=1,fps=120,drawtext=text={titles[i]}:fontcolor=white:fontsize=17:x=8:y=12[v{i}]')
    filters.append('[v0][v1][v2]hstack=inputs=3:shortest=1[out]')
    args+=['-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264','-crf','19','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'transition-comparison.mp4')]
    subprocess.run(args,check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(OUT/'transition-comparison.mp4'),'-vf','setpts=2*PTS','-r','60','-an','-c:v','libx264','-crf','19','-pix_fmt','yuv420p',str(OUT/'transition-comparison-half-speed.mp4')],check=True)
compare_clip()
print(json.dumps({'sensitivity':trials,'progress':progress.tolist()},indent=2))
