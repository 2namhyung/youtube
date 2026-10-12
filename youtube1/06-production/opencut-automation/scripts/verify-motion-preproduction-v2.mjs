import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=path.resolve('C:/Users/User/Desktop/app/youtube');
const out=path.join(root,'06-production/opencut-automation/out/studies/research-6b1a8af9b4143acb/motion-design-preproduction-v2');
const a=JSON.parse(fs.readFileSync(path.join(out,'motion-design-preproduction-v2.json'),'utf8')); const err=[];
if(a.cuts.length!==18)err.push('cuts'); if(a.durationSeconds!==55.016||a.fps!==24)err.push('timing');
if(a.geometry.media.width!==972||a.geometry.media.height!==972||a.geometry.media.x!==54||a.geometry.media.y!==474)err.push('media');
for(const c of a.cuts){if(!c.preproduction.visualRepair?.distinctSilhouette)err.push(`silhouette:${c.cutId}`);if(c.preproduction.focalObjectOccupancyPercent<70||c.preproduction.focalObjectOccupancyPercent>85)err.push(`occupancy:${c.cutId}`)}
const anim=path.join(out,'animatic/animatic-1080x1920-24fps.mp4'); const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',anim],{encoding:'utf8'})); const v=probe.streams.find(s=>s.codec_type==='video');
if(!v||v.width!==1080||v.height!==1920||v.r_frame_rate!=='24/1')err.push('video-geometry'); if(Math.abs(Number(probe.format.duration)-55.016)>.03)err.push('video-duration');
const frameDir=path.join(out,'animatic'); const f0=fs.readFileSync(path.join(frameDir,'frame-0000.png')); const fMid=fs.readFileSync(path.join(frameDir,'frame-0066.png')); if(f0.equals(fMid))err.push('static-frame');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); const result={schema:'motion-design-preproduction-verifier-v2',pass:err.length===0,errors:err,artifactSha256:hash(path.join(out,'motion-design-preproduction-v2.json')),animaticSha256:hash(anim),contactSheetSha256:hash(path.join(out,'animatic-contact-sheet.png')),styleframeSha256:hash(path.join(out,'cut001-styleframe/cut001-styleframe.png')),observed:{duration:Number(probe.format.duration),frames:v.nb_frames?Number(v.nb_frames):null,width:v.width,height:v.height,fps:v.r_frame_rate},policy:{providerCalls:false,productionRender:false,upload:false,publication:false,priorBytesModified:false}};
fs.writeFileSync(path.join(out,'motion-design-preproduction-v2.verifier.json'),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2)); if(err.length)process.exit(1);
