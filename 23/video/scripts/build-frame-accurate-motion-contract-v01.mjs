import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';

const repo = path.resolve(import.meta.dirname, '../..');
const root = path.join(repo, 'video/qa/reference-study/frame-accurate-motion-contract-v01');
const rel = p => path.relative(repo, p).replaceAll('\\', '/');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tc = s => new Date(s * 1000).toISOString().slice(11, 23);
const primary = 'raw/inbox/vox-style-claude-remotion-reference.mp4';
const acquired = id => `video/qa/reference-study/additional-sources/acquired/${id}.android.mp4`;

const samples = [
  {n:1,id:'sample-01-shared-background-accumulation',src:primary,url:'https://x.com/xingbugengming/status/2074317574528209097',fps:30,start:5.233,end:7.733,step:1,events:[[5.233,'background-only'],[5.633,'building-entering'],[6.133,'building-settled'],[6.467,'left-person-entering'],[7.000,'right-person-entering'],[7.733,'accumulated-layout']]},
  {n:2,id:'sample-02-numeric-step-progression',src:primary,url:'https://x.com/xingbugengming/status/2074317574528209097',fps:30,start:18.767,end:20.767,step:1,events:[[18.767,'numeric-group-hidden'],[19.250,'$25'],[19.500,'$40'],[19.750,'$57'],[20.000,'$70'],[20.250,'$89'],[20.500,'$103'],[20.767,'$116']]},
  {n:3,id:'sample-03-chart-reveal',src:primary,url:'https://x.com/xingbugengming/status/2074317574528209097',fps:30,start:24.967,end:27.900,step:1,events:[[24.967,'empty-fixed-chart-shell'],[25.233,'first-line-segment'],[25.733,'early-series'],[26.233,'pre-spike-series'],[26.733,'spike-segment'],[27.233,'post-spike-series'],[27.900,'complete-series']]},
  {n:4,id:'sample-04-map-route-reframe',src:acquired('Y6mOBK5peDU'),url:'https://www.youtube.com/watch?v=Y6mOBK5peDU',fps:25,start:4,end:18,step:5,events:[[4,'US-map-person-marker'],[5.6,'world-map-reset'],[7.6,'regional-map-Israel-marker'],[9.6,'Iran-outline-and-aircraft'],[11.8,'strike-event'],[13.8,'country-reframe'],[15.8,'route/trajectory-overlay'],[18,'route-final']]},
  {n:5,id:'sample-05-object-preserving-layout-reframe',src:primary,url:'https://x.com/xingbugengming/status/2074317574528209097',fps:30,start:33.167,end:34.033,step:1,events:[[33.167,'chart-and-map-side-by-side'],[33.433,'map-moving-left'],[33.700,'map-becoming-focal'],[34.033,'map-centered-chart-exited']]},
  {n:6,id:'sample-06-directional-exit-hard-cut-pair',src:primary,url:'https://x.com/xingbugengming/status/2074317574528209097',fps:30,start:23.700,end:24.200,step:1,events:[[23.700,'full-scene-before-exit'],[23.933,'scene-group-exiting-left'],[24.200,'scene-cleared']],secondary:{start:12.333,end:12.367,events:[[12.333,'pre-cut-scene'],[12.367,'post-cut-scene']]}},
  {n:7,id:'sample-07-hook-reel-collage-montage',src:acquired('xOhh274Ayac'),url:'https://www.youtube.com/watch?v=xOhh274Ayac',fps:25,start:0,end:12,step:5,events:[[0,'speaker-opening'],[1.6,'speaker-left-card'],[3.4,'speaker-multi-card-overlay'],[4.24,'speaker-overlay-final-before-cut'],[4.28,'hard-cut-gallery'],[6.4,'gallery-horizontal-scroll'],[8.0,'gallery-later-cards'],[9.08,'gallery-final-before-cut'],[9.12,'hard-cut-kinetic-title'],[10.4,'title-word-replacement'],[12,'title-final']]},
  {n:8,id:'sample-08-speaker-supporting-overlay-entry',src:acquired('dBakc0BdHjY'),url:'https://www.youtube.com/watch?v=dBakc0BdHjY',fps:24000/1001,start:0,end:12,step:4,events:[[0,'speaker-only'],[1.8,'handshake-icon-entering'],[3.0,'handshake-icon-settled'],[6.8,'tombstone-icon-entering-left'],[8.8,'two-supporting-icons'],[10.2,'right-person-icon-entering'],[12,'supporting-icons-final']]},
  {n:9,id:'sample-09-device-light-focal-motion',src:acquired('b7KlsXNQobs'),url:'https://www.youtube.com/watch?v=b7KlsXNQobs',fps:30000/1001,start:2,end:18,step:5,events:[[2,'presenter-device-entering'],[4,'device-dashboard-visible'],[6,'device-state-change'],[8,'device-and-brand-icons'],[10,'device-segment-ending'],[12.9129,'hard-cut-story-segment'],[13.1131,'rapid-cut'],[13.3133,'rapid-cut'],[13.546867,'rapid-cut'],[18,'later-segment']],notes:'Only the early device segment is transferable to a device-state sample; later footage is boundary evidence, not device motion grammar.'},
  {n:10,id:'sample-10-narrative-scale-translation',src:acquired('0Uxx-UrTVP0'),url:'https://www.youtube.com/watch?v=0Uxx-UrTVP0',fps:2997/100,start:20,end:80,step:15,events:[[20,'inflation-bar-chart'],[21.254588,'hard-cut-shopping-cart'],[25.458792,'hard-cut-empty-shelves'],[31.898565,'comparison-stage-empty'],[32.5,'product-entry'],[34,'product-price-comparison'],[36,'phone-entry'],[38,'product-and-phone-final'],[38.838839,'hard-cut-to-currency-footage'],[40.407074,'rapid-cut-sequence-start'],[42.776109,'street-vendor-footage'],[44.544545,'city-footage'],[47.180514,'paper-map'],[48.415082,'movie-clip'],[49.716383,'movie-clip-change'],[51.718385,'movie-clip-change'],[56.790123,'report-surface'],[64.964965,'money-footage'],[69.002336,'report/chart-surface'],[73.20654,'chart-treatment'],[75.909243,'market-chart-footage'],[79.546213,'end-boundary']]}
];

function run(args){ execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y',...args], {cwd:repo,stdio:'inherit'}); }
function frameNo(s,fps){ return Math.round(s*fps); }
async function info(p){ const m=await sharp(p).metadata(); return {path:rel(p),sha256:sha(p),width:m.width,height:m.height}; }
function fileInfo(p){return {path:rel(p),sha256:sha(p),bytes:fs.statSync(p).size};}
function videoInfo(p){const j=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration','-of','json',p],{encoding:'utf8'}));const v=j.streams?.[0];if(!v)throw new Error(`No video stream: ${p}`);return {...fileInfo(p),width:v.width,height:v.height,frame_rate:v.avg_frame_rate,frame_count:Number(v.nb_frames||0),duration_seconds:Number(v.duration||0)};}

async function makeContact(files,out){
  const thumbW=320, thumbH=180, cols=4, rows=Math.ceil(files.length/cols);
  const comps=[];
  for(let i=0;i<files.length;i++) comps.push({input:await sharp(files[i]).resize(thumbW,thumbH,{fit:'cover'}).png().toBuffer(),left:(i%cols)*thumbW,top:Math.floor(i/cols)*thumbH});
  await sharp({create:{width:cols*thumbW,height:rows*thumbH,channels:3,background:'#111'}}).composite(comps).png().toFile(out);
}

async function metrics(frames){
  const rows=[]; let prev=null; const max=new Uint8Array(320*180);
  for(let i=0;i<frames.length;i++){
    const cur=await sharp(frames[i]).resize(320,180,{fit:'fill'}).removeAlpha().raw().toBuffer();
    if(prev){let sum=0,changed=0,minX=320,minY=180,maxX=-1,maxY=-1;
      for(let p=0;p<320*180;p++){const d=(Math.abs(cur[p*3]-prev[p*3])+Math.abs(cur[p*3+1]-prev[p*3+1])+Math.abs(cur[p*3+2]-prev[p*3+2]))/3; sum+=d; if(d>max[p])max[p]=d; if(d>=18){changed++;const x=p%320,y=Math.floor(p/320);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
      rows.push({sample_index:i,mean_abs_rgb:+(sum/(320*180)).toFixed(4),changed_fraction_ge18:+(changed/(320*180)).toFixed(6),change_bbox_320x180:changed?[minX,minY,maxX-minX+1,maxY-minY+1]:null});
    } prev=cur;
  }
  return {rows,max};
}

fs.mkdirSync(root,{recursive:true});
for(const s of samples)fs.rmSync(path.join(root,s.id),{recursive:true,force:true});
fs.rmSync(path.join(root,'evidence-manifest.json'),{force:true});
const evidence=[];
for(const s of samples){
  const dir=path.join(root,s.id), dense=path.join(dir,'dense'), events=path.join(dir,'events'); fs.mkdirSync(dense,{recursive:true}); fs.mkdirSync(events,{recursive:true});
  const src=path.join(repo,s.src); const startFrame=frameNo(s.start,s.fps),endFrame=frameNo(s.end,s.fps);
  const filter=`select='between(n\\,${startFrame}\\,${endFrame})*not(mod(n-${startFrame}\\,${s.step}))',setpts=N/FRAME_RATE/TB`;
  run(['-i',src,'-vf',filter,'-vsync','0',path.join(dense,'frame-%04d.png')]);
  const review=path.join(dir,'review.mp4'); run(['-ss',String(s.start),'-to',String(s.end),'-i',src,'-an','-c:v','libx264rgb','-crf','0','-pix_fmt','rgb24',review]);
  const eventInfos=[];
  for(let i=0;i<s.events.length;i++){const [time,label]=s.events[i],out=path.join(events,`${String(i+1).padStart(2,'0')}-${label.replaceAll(/[^a-zA-Z0-9$-]/g,'-')}.png`);run(['-i',src,'-vf',`select='eq(n\\,${frameNo(time,s.fps)})'`,'-vsync','0','-frames:v','1',out]);eventInfos.push({...await info(out),label,source_time_seconds:time,source_timecode:tc(time),source_frame:frameNo(time,s.fps)});}
  if(s.secondary){for(let i=0;i<s.secondary.events.length;i++){const [time,label]=s.secondary.events[i],out=path.join(events,`pair-${i+1}-${label}.png`);run(['-i',src,'-vf',`select='eq(n\\,${frameNo(time,s.fps)})'`,'-vsync','0','-frames:v','1',out]);eventInfos.push({...await info(out),label,source_time_seconds:time,source_timecode:tc(time),source_frame:frameNo(time,s.fps)});}}
  const denseFiles=fs.readdirSync(dense).filter(x=>x.endsWith('.png')).map(x=>path.join(dense,x)); const m=await metrics(denseFiles); const mask=path.join(dir,'aggregate-change-mask.png'); await sharp(Buffer.from(m.max),{raw:{width:320,height:180,channels:1}}).png().toFile(mask);
  const contact=path.join(dir,'event-contact.png'); await makeContact(eventInfos.map(x=>path.join(repo,x.path)),contact);
  const metricPath=path.join(dir,'change-metrics.json');fs.writeFileSync(metricPath,JSON.stringify({analysis_resolution:[320,180],threshold:18,sample_step_frames:s.step,rows:m.rows},null,2)+'\n');
  const denseInfos=[]; for(let i=0;i<denseFiles.length;i++)denseInfos.push({...await info(denseFiles[i]),source_frame:startFrame+i*s.step,source_time_seconds:+((startFrame+i*s.step)/s.fps).toFixed(6)});
  const firstMeta=await sharp(denseFiles[0]).metadata();
  evidence.push({sample_id:s.id,source:{local_path:s.src,original_url:s.url,sha256:sha(src),width:firstMeta.width,height:firstMeta.height,fps:s.fps},window:{start_seconds:s.start,end_seconds:s.end,start_timecode:tc(s.start),end_timecode:tc(s.end),start_frame:startFrame,end_frame:endFrame},sampling:{mode:s.step===1?'every-source-frame':'fixed-frame-step',step_frames:s.step,dense_frame_count:denseInfos.length,justification:s.step===1?'Short reference segment: preserve every decoded source frame.':s.id.startsWith('sample-10')?'Long 60-second source: every 15 source frames (about 0.5 s) plus exact event/boundary frames.':'Long source: every 4–5 source frames (about 0.17–0.20 s) plus exact event/boundary frames.'},dense_frames:denseInfos,events:eventInfos,review_clip:videoInfo(review),contact:await info(contact),change_metrics:{...fileInfo(metricPath),row_count:m.rows.length},change_mask:await info(mask),notes:s.notes??null});
}
fs.writeFileSync(path.join(root,'evidence-manifest.json'),JSON.stringify({schema_version:1,status:'observational-evidence-only-pending-human-review',production_eligible:false,generated_at:new Date().toISOString(),samples:evidence},null,2)+'\n');
console.log(`built ${rel(root)} with ${evidence.reduce((a,x)=>a+x.dense_frames.length,0)} dense frames`);
