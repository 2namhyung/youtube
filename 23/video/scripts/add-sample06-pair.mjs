import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),rel=p=>path.relative(root,p).replaceAll('\\','/'),hash=b=>createHash('sha256').update(b).digest('hex'),fh=async p=>hash(await readFile(p));
const dir=path.join(root,'video/qa/style-frames/remotion-motion-grammar-v02-sample-cuts/sample-06-directional-exit-hard-cut-pair'),video=path.join(dir,'sample-06-directional-exit-hard-cut-pair-provisional.mp4');
const entries={},parts=[];for(const [name,frame] of [['outgoing_last',119],['incoming_first',120],['incoming_stable',121]]){const p=path.join(dir,`pair-${name}.png`);const r=spawnSync('ffmpeg',['-y','-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-update','1',p],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);entries[name]={path:rel(p),frame,sha256:await fh(p),dimensions:{width:1920,height:1080}};parts.push(await sharp(p).resize(640,360).png().toBuffer());}
const pair=path.join(dir,'adjacent-pair-provisional.png');await sharp({create:{width:1920,height:360,channels:4,background:'#f2ead8'}}).composite(parts.map((input,i)=>({input,left:i*640,top:0}))).png().toFile(pair);const mp=path.join(dir,'manifest.json'),m=JSON.parse(await readFile(mp,'utf8'));m.outputs.pair_artifact={path:rel(pair),sha256:await fh(pair),source:'decoded-candidate-mp4-frames',candidate_frames:entries,outgoing_scene_clear_frame:119,hard_cut_frame:120,incoming_stable_frame:121,reference_grammar_id:'hard-cut',status:'pending-human-pair-review'};await writeFile(mp,`${JSON.stringify(m,null,2)}\n`);
