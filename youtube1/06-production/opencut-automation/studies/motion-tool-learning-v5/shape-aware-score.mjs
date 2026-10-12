import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const HEX64=/^[0-9a-f]{64}$/;
export const sha256=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exact=(o,keys,where,errors)=>{if(!o||typeof o!=='object'||Array.isArray(o)){errors.push(`${where}:object`);return false;}for(const k of keys)if(!(k in o))errors.push(`${where}:missing:${k}`);for(const k of Object.keys(o))if(!keys.includes(k))errors.push(`${where}:additional:${k}`);return true;};
export function validateInputSchema(x){
 const e=[];if(!exact(x,['schema','sampleId','frameContract','reference','learned'],'root',e))return e;
 if(x.schema!=='motion-tool-learning-v5-independent-input-v2')e.push('root:schema');if(typeof x.sampleId!=='string'||!x.sampleId)e.push('root:sampleId');
 if(exact(x.frameContract,['width','height','fps','frameCount'],'frameContract',e))for(const k of ['width','height','fps','frameCount'])if(!Number.isInteger(x.frameContract[k])||x.frameContract[k]<(k==='frameCount'?3:k==='width'||k==='height'?64:1))e.push(`frameContract:${k}`);
 for(const side of ['reference','learned'])if(exact(x[side],['file','sha256','bytes','semanticObjectClass','componentLabels'],side,e)){
  const a=x[side];if(typeof a.file!=='string'||!a.file)e.push(`${side}:file`);if(!HEX64.test(a.sha256||''))e.push(`${side}:sha256`);if(!Number.isInteger(a.bytes)||a.bytes<1)e.push(`${side}:bytes`);if(typeof a.semanticObjectClass!=='string'||!a.semanticObjectClass)e.push(`${side}:semanticObjectClass`);if(!Array.isArray(a.componentLabels)||!a.componentLabels.length||new Set(a.componentLabels).size!==a.componentLabels.length||a.componentLabels.some(v=>typeof v!=='string'||!v))e.push(`${side}:componentLabels`);
 }
 return e;
}
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0, clamp=x=>Math.max(0,Math.min(100,x));
export function decodeArtifact(mp4,c,ffmpeg,ffprobe){
 const q=spawnSync(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_read_frames','-of','json',mp4],{encoding:'utf8'});if(q.status!==0)throw new Error(`ffprobe:${q.stderr}`);const p=JSON.parse(q.stdout).streams[0];
 if(p.width!==c.width||p.height!==c.height||p.r_frame_rate!==`${c.fps}/1`||+p.nb_read_frames!==c.frameCount)throw new Error(`frame-contract:${JSON.stringify(p)}`);
 const r=spawnSync(ffmpeg,['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:null,maxBuffer:c.width*c.height*3*c.frameCount+1048576});if(r.status!==0)throw new Error(`decode:${r.stderr}`);const size=c.width*c.height*3;if(r.stdout.length!==size*c.frameCount)throw new Error('decoded-byte-count');
 return {probe:p,frames:Array.from({length:c.frameCount},(_,i)=>r.stdout.subarray(i*size,(i+1)*size)),frameHashes:Array.from({length:c.frameCount},(_,i)=>crypto.createHash('sha256').update(r.stdout.subarray(i*size,(i+1)*size)).digest('hex'))};
}
export function analyzeDecodedFrame(buf,w,h,labels){
 const bg=[buf[0],buf[1],buf[2]],foreground=new Set();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*3;if(Math.abs(buf[j]-bg[0])+Math.abs(buf[j+1]-bg[1])+Math.abs(buf[j+2]-bg[2])>=60)foreground.add(y*w+x);}
 const regions=[],seen=new Set();
 for(const seed of foreground){if(seen.has(seed))continue;const stack=[seed],pts=[];seen.add(seed);while(stack.length){const v=stack.pop();pts.push(v);const x=v%w,y=(v/w)|0;for(const n of [v-1,v+1,v-w,v+w])if(n>=0&&n<w*h&&foreground.has(n)&&!seen.has(n)&&Math.abs((n%w)-x)+Math.abs(((n/w)|0)-y)===1){seen.add(n);stack.push(n);}}if(pts.length>=24)regions.push({pts});}
 regions.sort((a,b)=>mean(a.pts.map(v=>v%w))-mean(b.pts.map(v=>v%w)));
 const comps=regions.map((r,i)=>{let x0=w,y0=h,x1=0,y1=0,perim=0,sr=0,sg=0,sb=0;const set=new Set(r.pts);for(const v of r.pts){const x=v%w,y=(v/w)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);const j=v*3;sr+=buf[j];sg+=buf[j+1];sb+=buf[j+2];for(const n of [v-1,v+1,v-w,v+w])if(!set.has(n))perim++;}const bw=x1-x0+1,bh=y1-y0+1;
  const outside=new Set(),q=[];for(let x=x0;x<=x1;x++)for(const y of [y0,y1]){const v=y*w+x;if(!set.has(v)){outside.add(v);q.push(v);}}for(let y=y0;y<=y1;y++)for(const x of [x0,x1]){const v=y*w+x;if(!set.has(v)){outside.add(v);q.push(v);}}while(q.length){const v=q.pop(),x=v%w,y=(v/w)|0;for(const n of [v-1,v+1,v-w,v+w]){const nx=n%w,ny=(n/w)|0;if(nx>=x0&&nx<=x1&&ny>=y0&&ny<=y1&&!set.has(n)&&!outside.has(n)){outside.add(n);q.push(n);}}}let holes=0,hseen=new Set();for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const v=y*w+x;if(set.has(v)||outside.has(v)||hseen.has(v))continue;holes++;const z=[v];hseen.add(v);while(z.length){const u=z.pop();for(const n of [u-1,u+1,u-w,u+w]){const nx=n%w,ny=(n/w)|0;if(nx>=x0&&nx<=x1&&ny>=y0&&ny<=y1&&!set.has(n)&&!outside.has(n)&&!hseen.has(n)){hseen.add(n);z.push(n);}}}}
  return{label:labels[i]||`unlabeled-${i}`,area:r.pts.length,areaFraction:r.pts.length/(w*h),x:x0,y:y0,w:bw,h:bh,cx:mean(r.pts.map(v=>v%w)),cy:mean(r.pts.map(v=>(v/w)|0)),aspect:bw/bh,solidity:r.pts.length/(bw*bh),contour:perim*perim/(4*Math.PI*r.pts.length),holes,luminance:(.2126*sr+.7152*sg+.0722*sb)/r.pts.length};});
 const relations=[];for(let i=0;i<comps.length;i++)for(let j=i+1;j<comps.length;j++){const a=comps[i],b=comps[j],ox=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),oy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));relations.push(`${a.label}:${b.label}:${ox*oy>0?'overlaps':Math.abs(a.cx-b.cx)>=Math.abs(a.cy-b.cy)?a.cx<b.cx?'left-of':'right-of':a.cy<b.cy?'above':'below'}`);}
 const overlapOrder=relations.filter(x=>x.endsWith('overlaps')).map(x=>{const [a,b]=x.split(':'),ca=comps.find(c=>c.label===a),cb=comps.find(c=>c.label===b);return`${a}:${b}:${ca.areaFraction>cb.areaFraction?a:b}`;});
 return{visible:comps.length>0,components:comps,relations,overlapOrder,areaRank:[...comps].sort((a,b)=>b.area-a.area).map(x=>x.label),luminanceRank:[...comps].sort((a,b)=>b.luminance-a.luminance).map(x=>x.label)};
}
const similarity=(a,b,scale=1)=>clamp(100*(1-Math.abs(a-b)/Math.max(scale,Math.abs(a),Math.abs(b),1e-9)));
export function verifyShapeAwareV5(input,{workspaceRoot='.',ffmpeg='ffmpeg',ffprobe='ffprobe'}={}){
 const failures=validateInputSchema(input);if(failures.length)return{schema:'motion-tool-learning-v5-independent-verifier-v2',pass:false,failures};
 const root=path.resolve(workspaceRoot), resolved={};for(const side of ['reference','learned']){const a=input[side],p=path.resolve(root,a.file);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p){failures.push(`${side}:containment`);continue;}if(fs.statSync(p).size!==a.bytes||sha256(p)!==a.sha256)failures.push(`${side}:artifact-drift`);resolved[side]=p;}if(failures.length)return{schema:'motion-tool-learning-v5-independent-verifier-v2',pass:false,failures};
 let dec={};try{for(const side of ['reference','learned'])dec[side]=decodeArtifact(resolved[side],input.frameContract,ffmpeg,ffprobe);}catch(e){return{schema:'motion-tool-learning-v5-independent-verifier-v2',pass:false,failures:[String(e.message)]};}
 const analyses={};for(const side of ['reference','learned'])analyses[side]=dec[side].frames.map(f=>analyzeDecodedFrame(f,input.frameContract.width,input.frameContract.height,input[side].componentLabels));
 for(const side of ['reference','learned']){if(!analyses[side][0].visible||!analyses[side].at(-1).visible)failures.push(`${side}:invisible-endpoint`);if(Math.max(...analyses[side].map(f=>f.components.length))!==input[side].componentLabels.length)failures.push(`${side}:component-label-inventory`);}
 if(input.reference.semanticObjectClass!==input.learned.semanticObjectClass)failures.push('semantic-object-class');
 if(dec.reference.frameHashes.some((h,i)=>h===dec.learned.frameHashes[i]))failures.push('pixel-clone-frame');
 const labels=input.reference.componentLabels, rs=analyses.reference,ls=analyses.learned;if(labels.length!==input.learned.componentLabels.length)failures.push('component-label-count');for(let i=0;i<rs.length;i++)if(rs[i].components.length!==ls[i].components.length)failures.push(`component-count-frame:${i}`);
 const layoutParts=[],motionParts=[],structureParts=[];
 for(let i=0;i<Math.min(rs.length,ls.length);i++)for(const label of labels){const a=rs[i].components.find(x=>x.label===label),b=ls[i].components.find(x=>x.label===label);if(!a||!b)continue;layoutParts.push(similarity(a.cx,b.cx,input.frameContract.width),similarity(a.cy,b.cy,input.frameContract.height),similarity(a.w,b.w,input.frameContract.width),similarity(a.h,b.h,input.frameContract.height));structureParts.push(similarity(a.aspect,b.aspect),similarity(a.solidity,b.solidity),similarity(a.contour,b.contour));if(a.holes!==b.holes)failures.push(`topology:${label}`);}
 const traj=(arr,label,k)=>arr.map(f=>f.components.find(x=>x.label===label)?.[k]);for(const label of labels)for(const k of ['cx','cy']){const a=traj(rs,label,k),b=traj(ls,label,k);if(a.some(x=>x==null)||b.some(x=>x==null))continue;const da=a.slice(1).map((x,i)=>x-a[i]),db=b.slice(1).map((x,i)=>x-b[i]);motionParts.push(...da.map((x,i)=>similarity(x,db[i],k==='cx'?input.frameContract.width:input.frameContract.height)));const activeA=da.map(x=>Math.abs(x)>0.5),activeB=db.map(x=>Math.abs(x)>0.5);motionParts.push(100*activeA.filter((x,i)=>x===activeB[i]).length/activeA.length);}
 const relationAgreement=100*rs.filter((x,i)=>JSON.stringify(x.relations)===JSON.stringify(ls[i].relations)).length/rs.length, areaHierarchy=100*rs.filter((x,i)=>JSON.stringify(x.areaRank)===JSON.stringify(ls[i].areaRank)).length/rs.length,colorHierarchy=100*rs.filter((x,i)=>JSON.stringify(x.luminanceRank)===JSON.stringify(ls[i].luminanceRank)).length/rs.length,layerOrder=100*rs.filter((x,i)=>JSON.stringify(x.overlapOrder)===JSON.stringify(ls[i].overlapOrder)).length/rs.length;
 layoutParts.push(relationAgreement);structureParts.push(areaHierarchy,colorHierarchy,layerOrder);
 const scores={layout:mean(layoutParts),motion:mean(motionParts),structureStyle:mean(structureParts)};scores.weighted=.3*scores.layout+.35*scores.motion+.35*scores.structureStyle;
 if(relationAgreement<90)failures.push('pairwise-relations');if(areaHierarchy<90)failures.push('area-hierarchy');if(colorHierarchy<90)failures.push('color-hierarchy');if(layerOrder<90)failures.push('occlusion-layer-order');
 for(const k of ['layout','motion','structureStyle'])if(scores[k]<90)failures.push(`${k}-below-90`);if(scores.weighted<90)failures.push('weighted-below-90');
 return{schema:'motion-tool-learning-v5-independent-verifier-v2',input:{sampleId:input.sampleId,sourceArtifacts:{reference:{file:input.reference.file,sha256:input.reference.sha256,bytes:input.reference.bytes},learned:{file:input.learned.file,sha256:input.learned.sha256,bytes:input.learned.bytes}},decodedFrameHashes:{reference:dec.reference.frameHashes,learned:dec.learned.frameHashes}},independentMeasurements:{reference:analyses.reference,learned:analyses.learned},scores,agreements:{pairwiseRelations:relationAgreement,areaHierarchy,colorHierarchy,occlusionLayerOrder:layerOrder},failures:[...new Set(failures)],pass:failures.length===0};
}
