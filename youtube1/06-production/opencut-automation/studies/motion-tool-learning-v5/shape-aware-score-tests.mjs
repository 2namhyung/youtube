import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {sha256,validateInputSchema,verifyShapeAwareV5} from './shape-aware-score.mjs';

JSON.parse(fs.readFileSync(new URL('./shape-aware-score.schema.json',import.meta.url),'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'motion-v5-real-frames-')),edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',ffmpeg='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe',ffprobe='C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe',W=320,H=240,N=12;
try{
 const variants=['reference','learned','rectangle','single','color-mismatch','topology-reference','topology-solid','overlap-reference','overlap-reversed','invisible-endpoints'];
 const browser=await chromium.launch({executablePath:edge,headless:true});const page=await browser.newPage({viewport:{width:W,height:H}});
 await page.setContent(`<canvas width=${W} height=${H}></canvas><script>globalThis.draw=(v,f)=>{const c=document.querySelector('canvas'),x=c.getContext('2d'),d=x.createImageData(${W},${H}),p=d.data;for(let i=0;i<p.length;i+=4){p[i]=248;p[i+1]=246;p[i+2]=241;p[i+3]=255}const put=(test,color)=>{for(let y=0;y<${H};y++)for(let x=0;x<${W};x++)if(test(x,y)){let j=(y*${W}+x)*4;p[j]=color[0];p[j+1]=color[1];p[j+2]=color[2];p[j+3]=255}};if(v==='invisible-endpoints'&&(f===0||f===${N-1})){x.putImageData(d,0,0);return}const dx=f*3,hx=75+dx,hy=115;const heart=(xx,yy)=>{const X=(xx-hx)/32,Y=-(yy-hy)/32+.15,q=X*X+Y*Y-1;return q*q*q-X*X*Y*Y*Y<=0};const rect=(xx,yy)=>xx>=hx-32&&xx<=hx+32&&yy>=hy-32&&yy<=hy+32;const circle=(xx,yy)=>{const X=xx-(225+dx),Y=yy-115;return X*X+Y*Y<=24*24};const donut=(xx,yy)=>{const X=xx-hx,Y=yy-hy,r=X*X+Y*Y;return r<=32*32&&r>=15*15};const solid=(xx,yy)=>{const X=xx-hx,Y=yy-hy;return X*X+Y*Y<=32*32};const left=(xx,yy)=>xx>=90+dx&&xx<=160+dx&&yy>=80&&yy<=150,right=(xx,yy)=>xx>=130+dx&&xx<=200+dx&&yy>=100&&yy<=170;let primary=[250,200,40],secondary=[30,70,150];if(v==='learned'){primary=[245,160,190];secondary=[70,35,130]}if(v==='color-mismatch'){primary=[55,25,110];secondary=[250,180,45]}if(v==='single'){put(rect,[90,45,150])}else if(v==='rectangle'){put(rect,[245,160,190]);put(circle,[70,35,130])}else if(v==='topology-reference'){put(donut,primary);put(circle,secondary)}else if(v==='topology-solid'){put(solid,[245,160,190]);put(circle,[70,35,130])}else if(v==='overlap-reference'){put(left,primary);put(right,secondary)}else if(v==='overlap-reversed'){put(right,[70,35,130]);put(left,[245,160,190])}else{put(heart,primary);put(circle,secondary)}x.putImageData(d,0,0)};</script>`);
 for(const v of variants){const dir=path.join(tmp,v);fs.mkdirSync(dir);for(let f=0;f<N;f++){await page.evaluate(([v,f])=>draw(v,f),[v,f]);await page.locator('canvas').screenshot({path:path.join(dir,`${String(f).padStart(3,'0')}.png`)});}const q=spawnSync(ffmpeg,['-y','-framerate','24','-i',path.join(dir,'%03d.png'),'-frames:v',String(N),'-c:v','ffv1','-pix_fmt','rgb24',path.join(tmp,`${v}.mkv`)],{encoding:'utf8'});assert.equal(q.status,0,q.stderr);}
 await browser.close();
 const artifact=(v,labels=['primary','secondary'])=>{const p=path.join(tmp,`${v}.mkv`);return{file:`${v}.mkv`,sha256:sha256(p),bytes:fs.statSync(p).size,semanticObjectClass:'two-part neutral emblem',componentLabels:labels}};
 const input=(ref='reference',learned='learned')=>({schema:'motion-tool-learning-v5-independent-input-v2',sampleId:`${ref}-${learned}`,frameContract:{width:W,height:H,fps:24,frameCount:N},reference:artifact(ref),learned:artifact(learned)});
 const verify=x=>verifyShapeAwareV5(x,{workspaceRoot:tmp,ffmpeg,ffprobe});
 const positive=verify(input());assert.equal(positive.pass,true,JSON.stringify({failures:positive.failures,scores:positive.scores,agreements:positive.agreements}));assert.equal(positive.input.decodedFrameHashes.reference.length,N);assert.equal(positive.input.sourceArtifacts.reference.sha256,sha256(path.join(tmp,'reference.mkv')));
 const negatives=[];
 negatives.push(['heart-to-same-bbox-rectangle',input('reference','rectangle')]);
 negatives.push(['multi-component-to-single',input('reference','single')]);
 const missingLabels=input();delete missingLabels.learned.componentLabels;negatives.push(['missing-labels',missingLabels]);
 const missingComponents=input();missingComponents.learned.componentLabels=['primary','secondary','tertiary'];negatives.push(['missing-components',missingComponents]);
 negatives.push(['both-invisible-endpoints',input('reference','invisible-endpoints')]);
 negatives.push(['color-hierarchy-mismatch',input('reference','color-mismatch')]);
  negatives.push(['topology-mismatch',input('topology-reference','topology-solid')]);
  negatives.push(['occlusion-layer-order-mismatch',input('overlap-reference','overlap-reversed')]);
 const injected=input();injected.scores={layout:100,motion:100,structureStyle:100,weighted:100};injected.hardGates={all:true};negatives.push(['injected-score-and-gates',injected]);
 const missing=input();delete missing.frameContract;negatives.push(['missing-required-schema',missing]);
 const drift=input();drift.learned.sha256='0'.repeat(64);negatives.push(['artifact-drift',drift]);
 for(const [name,x] of negatives){const r=verify(x);assert.equal(r.pass,false,`${name} unexpectedly passed ${JSON.stringify(r.scores)}`);}
 assert(validateInputSchema(injected).some(x=>x.includes('additional:scores')));
 console.log(`shape-aware independent verifier v5: 1 positive + ${negatives.length} rendered/contract negatives passed`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
