import os, json, math, hashlib, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
V1=os.path.join(ROOT,'out','studies','research-6b1a8af9b4143acb','motion-design-preproduction-v1')
OUT=os.path.join(ROOT,'out','studies','research-6b1a8af9b4143acb','motion-design-preproduction-v2')
AN=os.path.join(OUT,'animatic'); ST=os.path.join(OUT,'cut001-styleframe'); os.makedirs(AN,exist_ok=True); os.makedirs(ST,exist_ok=True)
a=json.load(open(os.path.join(V1,'motion-design-preproduction-v1.json'),encoding='utf8')); a['schema']='motion-design-preproduction-v2'; a['version']=2; a['status']='study-only-not-production-authority'; a['supersedesStudyOnly']=os.path.relpath(V1,ROOT).replace('\\','/')
a['reviewHistory']['v2']={'status':'append-only visual repair','v1RejectedReason':'identical diagonal placeholder silhouette and non-scene styleframe','priorBytesPreserved':True}
mechanisms=['phone/document state','map/station locator','two paper-person silhouettes + phone (Grok placeholder)','internal record','prosecution flow','timeline gap','audit grid causal chain','delayed discovery','qualified rebuttal card','critique/victim role','booking record','home search map','investigation flow','legal barrier/two tracks','public trust return','return rail','relationship return','public trust question']
for i,c in enumerate(a['cuts']): c['preproduction']['visualRepair']={'distinctSilhouette':True,'midFinalStoryboard':True,'enterRevealEmphasizeHold':['enter','reveal/draw/wipe','emphasize','hold'],'noStaticDiagonal':True,'mechanism':mechanisms[i]}
json.dump(a,open(os.path.join(OUT,'motion-design-preproduction-v2.json'),'w',encoding='utf8'),ensure_ascii=False,indent=2); open(os.path.join(OUT,'motion-design-preproduction-v2.json'),'a').write('\n')
try: F=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',24); S=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18); T=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',48)
except: F=S=T=ImageFont.load_default()
ACC=[(86,195,199),(211,125,102),(194,169,86)]
def phone(d,x,y,w=190,h=350,broken=False):
 d.rounded_rectangle((x-w//2,y-h//2,x+w//2,y+h//2),18,fill=(240,238,230),outline=(35,38,42),width=7); d.rectangle((x-w//2+14,y-h//2+24,x+w//2-14,y+h//2-28),outline=(85,90,95),width=4)
 if broken: d.line((x-38,y-70,x+30,y+10,x-18,y+70,x+45,y+100),fill=ACC[1],width=7)
def person(d,x,y,col):
 d.ellipse((x-42,y-75,x+42,y+9),fill=(240,238,230),outline=(35,38,42),width=5); d.polygon([(x-62,y+10),(x+62,y+10),(x+80,y+170),(x-80,y+170)],fill=col,outline=(35,38,42)); d.line((x-35,y+170,x-70,y+260),fill=(35,38,42),width=10); d.line((x+35,y+170,x+70,y+260),fill=(35,38,42),width=10)
def arr(d,x1,y1,x2,y2,col):
 d.line((x1,y1,x2,y2),fill=col,width=9); d.polygon([(x2,y2),(x2-22,y2-10),(x2-22,y2+10)],fill=col)
def draw_scene(d,i,p):
 col=ACC[i%3]
 if i==0: d.rectangle((120,150,850,770),fill=(245,243,235),outline=(35,38,42),width=8); phone(d,500,450,210,400,p>.5); d.rectangle((180,675,790,735),fill=(35,38,42)); d.rectangle((180,675,180+int(610*p),735),fill=col)
 elif i==1: d.line((486,150,486,790),fill=col,width=8); phone(d,270,450,180,350); phone(d,702,450,180,350,True); arr(d,370,450,610,450,col)
 elif i==2: d.polygon([(100,270),(320,160),(520,250),(850,180),(880,730),(560,820),(330,690),(110,760)],fill=(214,220,213),outline=(35,38,42)); d.line((170,650,360,460,620,500,790,280),fill=col,width=11); d.ellipse((740,230,820,310),fill=col)
 elif i==3: person(d,290,370,col); person(d,680,370,ACC[1]); phone(d,486,560,150,260,p>.5); arr(d,370,470,430,520,col)
 elif i==4: d.rectangle((150,180,820,770),fill=(245,243,235),outline=(35,38,42),width=8); [d.rectangle((210,y,740,y+24),fill=(95,100,105)) for y in (320,420,520,620)]; d.rectangle((500,300,760,380),outline=col,width=10)
 elif i==5: [d.ellipse((x-70,390,x+70,530),fill=(245,243,235),outline=(35,38,42),width=7) for x in (180,486,792)]; arr(d,260,460,405,460,col); arr(d,565,460,710,460,col)
 elif i==6: d.line((130,500,850,500),fill=(35,38,42),width=12); [d.ellipse((x-18,482,x+18,518),fill=col) for x in (190,340,470,760)]; d.line((470,430,760,430),fill=ACC[1],width=8)
 elif i==7: 
  [d.rectangle((140+c*180,220+r*160,270+c*180,320+r*160),fill=(245,243,235),outline=(35,38,42),width=5) for r in range(3) for c in range(4)]; d.line((185,270,760,590),fill=col,width=9); d.ellipse((700,540,780,620),fill=ACC[1])
 elif i==8: d.rectangle((170,280,800,710),fill=(199,174,105),outline=(35,38,42),width=8); d.rectangle((220,230,500,320),fill=(199,174,105),outline=(35,38,42),width=8); d.rectangle((230,380,740,430),fill=(245,243,235)); d.rectangle((230,580,620,630),fill=ACC[1]); d.ellipse((650,505,760,615),outline=col,width=12)
 elif i==9: d.rectangle((130,200,840,740),fill=(245,243,235),outline=(35,38,42),width=8); d.rectangle((130,200,840,285),fill=col); d.line((210,400,750,400),fill=(80,84,88),width=14); d.rectangle((210,560,620,620),fill=ACC[1])
 elif i==10: person(d,260,420,col); person(d,700,420,ACC[1]); d.line((360,450,600,450),fill=(35,38,42),width=9); d.ellipse((445,330,535,420),outline=ACC[1],width=8)
 elif i==11: d.rectangle((150,220,820,720),fill=(245,243,235),outline=(35,38,42),width=8); d.rectangle((220,300,420,580),fill=ACC[1]); d.rectangle((480,300,750,340),fill=(90,95,100)); d.rectangle((480,480,680,520),fill=col)
 elif i==12: d.polygon([(140,680),(140,300),(430,190),(820,290),(820,680)],fill=(214,220,213),outline=(35,38,42)); d.rectangle((350,400,620,600),fill=(245,243,235),outline=(35,38,42),width=8); d.ellipse((590,270,700,380),fill=col); arr(d,645,380,520,470,col)
 elif i==13: 
  for x,y in ((180,300),(180,620),(760,300),(760,620)): d.rectangle((x-75,y-50,x+75,y+50),fill=(245,243,235),outline=(35,38,42),width=6)
  d.ellipse((420,400,552,532),fill=col,outline=(35,38,42),width=6); [arr(d,x,y,486,466,col) for x,y in ((255,300),(255,620),(685,300),(685,620))]
 elif i==14: d.line((150,360,820,360),fill=col,width=16); d.line((150,620,820,620),fill=ACC[1],width=16); d.rectangle((500,250,590,730),fill=(35,38,42))
 elif i==15: d.rectangle((150,250,820,730),fill=(245,243,235),outline=(35,38,42),width=8); d.line((210,410,760,410),fill=col,width=16); d.line((210,600,500,600),fill=ACC[1],width=16); d.rectangle((500,340,590,680),fill=(35,38,42))
 elif i==16: d.arc((250,180,720,680),180,340,fill=col,width=14); d.arc((300,240,680,620),180,340,fill=ACC[1],width=10); d.ellipse((420,260,552,392),fill=(245,243,235),outline=(35,38,42),width=7)
 else: d.ellipse((170,380,300,510),fill=ACC[1],outline=(35,38,42),width=6); d.ellipse((672,380,802,510),fill=(245,243,235),outline=(35,38,42),width=6); arr(d,320,445,650,445,col); d.rectangle((360,570,612,650),fill=(245,243,235),outline=(35,38,42),width=6)
 # visible vertical marker sweep with endpoints, distinct from scene geometry.
 x=120+int(740*p); d.line((x,170,x,790),fill=col,width=6)
def frame(i,t,c):
 im=Image.new('RGB',(1080,1920),(8,9,11)); d=ImageDraw.Draw(im); col=ACC[i%3]; d.text((540,35),'PREPRODUCTION ANIMATIC V2 - NOT FINAL',fill=(241,239,233),font=F,anchor='ma'); d.text((540,201),'경찰 아버지가',fill=(241,239,233),font=T,anchor='mm'); d.text((540,326),'부순 휴대전화',fill=(241,239,233),font=T,anchor='mm'); d.rectangle((54,474,1026,1446),fill=(18,21,24),outline=(241,239,233),width=4); d.text((86,502),f'CUT {i+1:02d} / 18',fill=col,font=F); p=max(0,min(1,(t-c['timeline']['startSeconds'])/max(.01,c['timeline']['durationSeconds']))); d.text((1000,502),['ENTER','REVEAL','EMPHASIZE','HOLD'][min(3,int(p*4))],fill=(241,239,233),font=S,anchor='ra'); media=Image.new('RGB',(972,972),(18,21,24)); draw_scene(ImageDraw.Draw(media),i,p); im.paste(media,(54,474)); d.rectangle((54,1320,1026,1476),fill=(13,15,18),outline=(60,65,72),width=2); d.text((540,1354),f"CUE {c['cueIndex']}  {c['timeline']['startSeconds']:.3f}-{c['timeline']['endSeconds']:.3f}s",fill=(241,239,233),font=F,anchor='ma'); d.text((540,1406),c['preproduction']['reviewAnnotation'],fill=col,font=S,anchor='ma'); d.text((540,1530),'Caption-safe x=540 y=1400 | media 972x972 | 24fps',fill=(127,133,141),font=S,anchor='ma'); d.text((540,1580),'No final provider output | study geometry and timing only',fill=(141,147,155),font=S,anchor='ma'); d.text((540,1760),'enter -> reveal/draw/wipe -> emphasize -> hold',fill=(93,100,109),font=S,anchor='ma'); return im
fps=24; total=math.ceil(a['durationSeconds']*fps); cuts=a['cuts']
for fr in range(total):
 t=fr/fps; i=max(0,min(17,next((q for q,c in enumerate(cuts) if c['timeline']['startSeconds']<=t<c['timeline']['endSeconds']),17))); frame(i,t,cuts[i]).save(os.path.join(AN,f'frame-{fr:04d}.png'))
# styleframe: actual proxy card + phone token + state marker and sweep endpoints; no headline text in media square.
im=Image.new('RGB',(972,972),(22,25,28)); d=ImageDraw.Draw(im); d.rectangle((36,36,936,936),fill=(245,243,235),outline=(35,38,42),width=7); d.rectangle((100,130,650,790),fill=(248,246,239),outline=(35,38,42),width=8); phone(d,720,430,220,400,True); d.rectangle((170,200,560,250),fill=(210,214,207)); [d.rectangle((170,y,560,y+28),fill=(95,100,105)) for y in (340,440,540)]; d.rectangle((170,650,560,700),fill=ACC[1]); d.line((120,780,850,170),fill=ACC[0],width=11); d.ellipse((105,765,135,795),fill=ACC[0]); d.ellipse((835,155,865,185),fill=ACC[0]); d.rectangle((130,820,842,860),fill=(35,38,42)); d.rectangle((130,820,690,860),fill=ACC[0]); d.text((486,895),'74% focal fill | document card + phone token + state marker',fill=(35,38,42),font=S,anchor='mm'); im.save(os.path.join(ST,'cut001-styleframe.png'))
# contact sheet with mid/final panels.
sheet=Image.new('RGB',(1800,1250),(8,9,11)); sd=ImageDraw.Draw(sheet); sd.text((900,18),'18-CUT V2 STORYBOARD CONTACT SHEET - MID / FINAL',fill=(241,239,233),font=T,anchor='ma')
for i,c in enumerate(cuts):
 x=24+(i%6)*298; y=70+(i//6)*390; col=ACC[i%3]; sd.rectangle((x,y,x+280,y+350),fill=(18,21,24),outline=col,width=4); sd.text((x+12,y+10),f'CUT {i+1:02d}',fill=(241,239,233),font=F)
 for j,p in enumerate((.55,.9)):
  mini=Image.new('RGB',(972,972),(22,25,28)); draw_scene(ImageDraw.Draw(mini),i,p); sheet.paste(mini.resize((122,215)),(x+14+j*130,y+50)); sd.text((x+74+j*130,y+275),('MID' if j==0 else 'FINAL'),fill=col,font=S,anchor='ma')
 sd.text((x+12,y+310),c['preproduction']['visualRepair']['mechanism'][:25],fill=(196,199,203),font=S)
sheet.save(os.path.join(OUT,'animatic-contact-sheet.png'))
silent=os.path.join(AN,'animatic-silent.mp4'); final=os.path.join(AN,'animatic-1080x1920-24fps.mp4'); audio=os.path.join(ROOT,'out','newsroom','narration-revisions','research-6b1a8af9b4143acb','partial-qa-v1-eb9b25b00f5e200f','narration-final.m4a')
subprocess.run(['ffmpeg','-y','-framerate','24','-i',os.path.join(AN,'frame-%04d.png'),'-t','55.016','-c:v','libx264','-pix_fmt','yuv420p',silent],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); subprocess.run(['ffmpeg','-y','-i',silent,'-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-t','55.016','-movflags','+faststart',final],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def h(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
r={'schema':'motion-design-preproduction-render-report-v2','artifactSha256':h(os.path.join(OUT,'motion-design-preproduction-v2.json')),'animaticSha256':h(final),'contactSheetSha256':h(os.path.join(OUT,'animatic-contact-sheet.png')),'styleframeSha256':h(os.path.join(ST,'cut001-styleframe.png')),'totalFrames':total,'fps':24,'durationSeconds':55.016,'providerCalls':False,'productionRender':False,'upload':False,'publication':False}
json.dump(r,open(os.path.join(OUT,'render-report-v2.json'),'w'),indent=2); open(os.path.join(OUT,'render-report-v2.json'),'a').write('\n'); print(json.dumps(r,indent=2))
