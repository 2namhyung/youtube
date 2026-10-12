import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {compareImagePixels,validateContractObject} from '../video/scripts/validate-frame-accurate-motion-contract-v01.mjs';

const root=path.resolve('video/qa/reference-study/frame-accurate-motion-contract-v01');
const read=id=>JSON.parse(fs.readFileSync(path.join(root,id,'contract.json')));

test('sample 02 rejects document/card substitution for fixed-context numeric grammar',()=>{
 const c=read('sample-02-numeric-step-progression');
 c.observed_scene_layers.find(x=>x.id==='tanker').stability='moving';
 c.actions.find(x=>x.id==='framewise-numeric-count-up').count_content_states=[];
 c.actions.push({...c.actions[0],id:'global-card',target_ids:['tanker'],scope:'global-surface'});
 const e=validateContractObject(c).join('\n');
 assert.match(e,/context must be fixed/);assert.match(e,/framewise numeric states missing/);assert.match(e,/forbidden global\/context motion/);
});

test('sample 02 rejects bogus values and a moving numeric bbox',()=>{
 const c=read('sample-02-numeric-step-progression');
 const n=c.actions.find(x=>x.id==='framewise-numeric-count-up');
 n.count_content_states[2].value='$0';
 n.bbox_trajectory[1].pixels[0]+=40;
 const e=validateContractObject(c).join('\n');
 assert.match(e,/exact framewise numeric states missing/);assert.match(e,/strictly monotonic/);assert.match(e,/bbox must remain fixed/);
});

test('sample 03 rejects a whole-chart PNG wipe',()=>{
 const c=read('sample-03-chart-reveal');
 c.actions=[{...c.actions[0],operator:'clipPath-wipe',target_ids:['chart-panel'],scope:'global-chart-surface'}];
 const e=validateContractObject(c).join('\n');
 assert.match(e,/inside-surface stroke draw missing/);assert.match(e,/stable shell layer targeted/);
});

test('sample 03 rejects stroke draw targeting axes',()=>{
 const c=read('sample-03-chart-reveal');
 c.actions.find(x=>x.operator==='svg.stroke-draw').target_ids.push('axes-grid-ticks-years');
 const e=validateContractObject(c).join('\n');
 assert.match(e,/series\/points only/);assert.match(e,/stable shell layer targeted/);
});

test('sample 05 rejects replacement instead of object-preserving reframe',()=>{
 const c=read('sample-05-object-preserving-layout-reframe');
 c.actions.find(x=>x.id==='map-preserving-reframe').operator='crossfade-replacement';
 const e=validateContractObject(c).join('\n');
 assert.match(e,/preserved-object reframe incomplete/);
});

test('sample 08 rejects moving the speaker as the overlay proof',()=>{
 const c=read('sample-08-speaker-supporting-overlay-entry');
 c.actions[0].target_ids=['speaker-footage'];
 const e=validateContractObject(c).join('\n');
 assert.match(e,/speaker must stay editorially fixed/);
});

test('sample 09 rejects full-frame screenshot swap as device state',()=>{
 const c=read('sample-09-device-light-focal-motion');
 c.actions.find(x=>x.target_ids.includes('dashboard-content')).scope='full-frame';
 const e=validateContractObject(c).join('\n');
 assert.match(e,/device\/inside-surface split missing/);
});

test('sample 10 rejects abstract diagram with no concrete comparison objects',()=>{
 const c=read('sample-10-narrative-scale-translation');
 c.actions=c.actions.filter(x=>!x.target_ids.includes('snack-product')&&!x.target_ids.includes('phone-device'));
 const e=validateContractObject(c).join('\n');
 assert.match(e,/concrete scale-translation contract incomplete/);
});

test('pixel identity helper rejects a tampered cited event frame',async()=>{
 const src=path.join(root,'sample-02-numeric-step-progression','events','02-$25.png');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frame-contract-test-')),out=path.join(dir,'tampered.png');
 try{const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});data[0]^=255;await sharp(data,{raw:info}).png().toFile(out);assert.equal(await compareImagePixels(src,out),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
