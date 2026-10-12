import json, os, sys
from PIL import Image, ImageDraw, ImageFont

out_dir = sys.argv[1]
artifact = json.load(open(os.path.join(out_dir, 'motion-design-preproduction-v1.json'), encoding='utf-8'))
anim_dir = os.path.join(out_dir, 'animatic')
style_dir = os.path.join(out_dir, 'cut001-styleframe')
os.makedirs(anim_dir, exist_ok=True); os.makedirs(style_dir, exist_ok=True)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 26)
    title_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 46)
except Exception:
    font = ImageFont.load_default(); title_font = font
labels = ['EVIDENCE COMPARISON','SPATIAL SEARCH MAP','INVESTIGATION FLOW','TIMELINE GAP','AUDIT GRID','DOCUMENT HIGHLIGHT','LEGAL / TRACK GAP','LEGAL BARRIER']
accents = [(99,198,200),(213,138,112),(198,179,107)]
total_frames = int(__import__('math').ceil(artifact['durationSeconds'] * artifact['fps']))
cuts = artifact['cuts']
def frame_for(cut, idx, t):
    W,H=1080,1920; im=Image.new('RGB',(W,H),(9,10,12)); d=ImageDraw.Draw(im); accent=accents[idx%3]
    d.text((540,34),'PREPRODUCTION ANIMATIC - NOT FINAL MEDIA',fill=(241,239,233),font=font,anchor='ma')
    d.text((540,120),artifact['geometry']['title']['line1'],fill=(241,239,233),font=title_font,anchor='ma')
    d.text((540,245),artifact['geometry']['title']['line2'],fill=(241,239,233),font=title_font,anchor='ma')
    mx,my,ms=54,474,972; d.rectangle((mx,my,mx+ms,my+ms),fill=(21,24,28),outline=(241,239,233),width=4)
    mode='GROK PLACEHOLDER ONLY' if cut['implementationMode']=='image_to_video_animation' else labels[idx%len(labels)]
    d.text((mx+32,my+24),f"CUT {idx+1:02d} / 18  -  {mode}",fill=accent,font=font)
    phase=max(0,min(1,(t-cut['timeline']['startSeconds'])/max(.001,cut['timeline']['durationSeconds'])))
    fill=int(ms*(cut['preproduction']['focalObjectOccupancyPercent']/100)); xshift=int(18*phase)
    d.rectangle((mx+486-fill//2+xshift,my+290,mx+486+fill//2+xshift,my+650),fill=(241,239,233),outline=(29,32,36),width=5)
    d.line((mx+180,my+690,mx+792,my+290),fill=accent,width=8); d.ellipse((mx+770,my+268,mx+814,my+312),fill=accent)
    d.rectangle((mx+160,my+730,mx+792,my+764),fill=(38,42,48)); d.rectangle((mx+160,my+730,mx+160+int(632*phase),my+764),fill=accent)
    d.text((mx+486,my+500),'CODE-NATIVE PLACEHOLDER',fill=(29,32,36),font=font,anchor='mm')
    d.text((mx+32,my+850),'START -> MID -> FINAL',fill=(241,239,233),font=font)
    d.text((mx+32,my+888),'state change recorded in JSON; one claim per screen',fill=(196,199,203),font=font)
    d.rectangle((54,1320,1026,1476),fill=(16,18,22),outline=(60,65,72),width=2)
    d.text((540,1354),f"NARRATION CUE {cut['cueIndex']}  |  {cut['timeline']['startSeconds']:.3f}-{cut['timeline']['endSeconds']:.3f}s",fill=(241,239,233),font=font,anchor='ma')
    d.text((540,1406),cut['preproduction']['reviewAnnotation'],fill=accent,font=font,anchor='ma')
    d.text((540,1516),'Caption-safe x=540 y=1400 | media 972x972 | 24fps',fill=(127,133,141),font=font,anchor='ma')
    d.text((540,1580),'No final ImageGen, provider, upload or publication output',fill=(141,147,155),font=font,anchor='ma')
    d.text((540,1760),'STUDY OUTPUT - review geometry, timing and state change only',fill=(93,100,109),font=font,anchor='ma')
    return im
for frame in range(total_frames):
    t=frame/artifact['fps']; idx=max(0,min(len(cuts)-1,next((i for i,c in enumerate(cuts) if c['timeline']['startSeconds']<=t<c['timeline']['endSeconds']),len(cuts)-1)))
    frame_for(cuts[idx],idx,t).save(os.path.join(anim_dir,f'frame-{frame:04d}.png'))
style=Image.new('RGB',(972,972),(21,24,28)); d=ImageDraw.Draw(style); d.rectangle((34,34,938,938),fill=(241,239,233),outline=(29,32,36),width=6); d.rectangle((80,92,892,220),fill=(215,210,199)); d.rectangle((118,266,854,576),fill=(247,245,238),outline=(29,32,36),width=8); d.rectangle((118,626,854,668),fill=(38,42,48)); d.rectangle((118,626,728,668),fill=accents[0]); d.line((170,760,430,600,790,350),fill=accents[1],width=14); d.ellipse((764,324,816,376),fill=accents[1]);
for x,col in [(138,accents[2]),(344,accents[0]),(550,accents[1])]: d.rectangle((x,736,x+180,816),fill=col)
d.text((486,160),'CUT 001 - FINAL-STATE STUDY',fill=(29,32,36),font=title_font,anchor='mm'); d.text((486,460),'FOCAL PHONE EVIDENCE',fill=(29,32,36),font=title_font,anchor='mm'); d.text((486,886),'occupancy 74% | 8 functional layers | grayscale + limited accent',fill=(29,32,36),font=font,anchor='mm'); style.save(os.path.join(style_dir,'cut001-styleframe.png'))
sheet=Image.new('RGB',(1800,1080),(9,10,12)); sd=ImageDraw.Draw(sheet); sd.text((900,20),'18-CUT PREPRODUCTION ANIMATIC CONTACT SHEET - NOT FINAL',fill=(241,239,233),font=title_font,anchor='ma')
for i,c in enumerate(cuts):
    x=30+(i%6)*295; y=75+(i//6)*330; col=accents[i%3]; sd.rectangle((x,y,x+275,y+285),fill=(21,24,28),outline=col,width=4); sd.rectangle((x+18,y+40,x+257,y+220),fill=(241,239,233)); sd.line((x+35,y+190,x+220,y+70),fill=col,width=7); sd.text((x+18,y+12),f"CUT {i+1:02d} - {'GROK' if c['implementationMode']=='image_to_video_animation' else 'MG'}",fill=(241,239,233),font=font); sd.text((x+18,y+240),f"{c['timeline']['startSeconds']:.2f}-{c['timeline']['endSeconds']:.2f}s",fill=(196,199,203),font=font); sd.text((x+18,y+263),c['preproduction']['reviewAnnotation'],fill=col,font=ImageFont.load_default())
sheet.save(os.path.join(out_dir,'animatic-contact-sheet.png'))
