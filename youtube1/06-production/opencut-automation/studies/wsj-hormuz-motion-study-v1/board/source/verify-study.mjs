import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const studyRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repo=path.resolve(studyRoot,'../..'); const out=path.resolve(repo,'out/studies/wsj-hormuz-motion-study-v1');
const err=[]; const read=p=>fs.readFileSync(p,'utf8'); const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const f of ['study.mp4','contact-sheet.jpg','thumbnail.jpg','output-manifest.json']) if(!fs.existsSync(path.join(out,f))) err.push(`missing ${f}`);
const m=JSON.parse(read(path.join(out,'output-manifest.json'))); if(m.private_no_upload!==true) err.push('private_no_upload must be true'); if(!m.content_policy?.includes('no WSJ marks')) err.push('content policy missing no-brand guard');
const diffPath=path.join(studyRoot,'comparison-difference-report.json'); if(!fs.existsSync(diffPath)) err.push('missing comparison-difference-report.json'); else {const d=JSON.parse(read(diffPath)); if(!d.copyright_policy?.includes('no reference frames')) err.push('difference report missing no-frame policy'); if(typeof d.overall_mechanical_proximity_score!=='number'||d.overall_mechanical_proximity_score<0||d.overall_mechanical_proximity_score>100) err.push('difference score invalid'); for(const [k,v] of Object.entries(d.mechanical_proximity_scores_0_to_100||{})) if(typeof v.score!=='number'||v.score<0||v.score>100) err.push(`difference score invalid ${k}`); if(d.mechanical_proximity_scores_0_to_100?.audio?.score!==0) err.push('audio must remain unimplemented score 0');}
for(const f of ['study.mp4','contact-sheet.jpg','thumbnail.jpg']) if(m.outputs?.[f]?.sha256!==sha(path.join(out,f))) err.push(`hash mismatch ${f}`);
const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=width,height,r_frame_rate,nb_frames','-of','json',path.join(out,'study.mp4')],{encoding:'utf8'}); if(probe.status!==0) err.push('ffprobe failed'); else {const j=JSON.parse(probe.stdout);const s=j.streams?.[0],d=Number(j.format?.duration);if(s?.width!==1080||s?.height!==1920||s?.r_frame_rate!=='24/1'||s?.nb_frames!=='600'||Math.abs(d-25)>0.01) err.push(`media contract mismatch ${JSON.stringify({s,d})}`);}
for(const f of ['study.mp4','output-manifest.json']) {const bytes=fs.readFileSync(path.join(out,f)); if(bytes.includes(Buffer.from('xhTbSgZqpvU'))) err.push(`${f} contains reference video id`);}
const files=[path.join(studyRoot,'shot-ledger.json'),path.join(studyRoot,'layer-motion-spec.json'),path.join(studyRoot,'source/reference-binding.json'),path.join(studyRoot,'components/motion-components.mjs')]; for(const f of files){const s=read(f);if(/https?:\/\/(?!www\.youtube\.com\/shorts\/xhTbSgZqpvU)/.test(s)&&!f.endsWith('reference-binding.json')) err.push(`unexpected remote URL in ${f}`); if(/youtube\.com\/shorts\/xhTbSgZqpvU/.test(s)&&!f.endsWith('reference-binding.json')) err.push(`reference URL leaked into ${f}`);}
const readme=read(path.join(studyRoot,'README.md')); if(/[횞쨌�]|\?\?/.test(readme)) err.push('README contains mojibake');
if(err.length){console.error(err.join('\n'));process.exit(1);} console.log('private wsj motion study valid: 1080x1920, 24fps, 600 frames, 25.000s, hashes/network/brand guards pass');
