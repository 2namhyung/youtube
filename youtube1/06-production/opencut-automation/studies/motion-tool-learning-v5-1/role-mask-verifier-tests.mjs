import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyRoleMasks,sha256,sha256Bytes,validateInputSchema} from './role-mask-verifier.mjs';

const c={width:96,height:72,fps:6,frameCount:4},roleIds=Array.from({length:8},(_,i)=>`neutral-role-${String(i+1).padStart(2,'0')}`),frameSize=c.width*c.height;
const rect=(m,x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)m[yy*c.width+xx]=255;};
const maskSet=()=>Array.from({length:c.frameCount},(_,f)=>Array.from({length:8},(_,j)=>{const m=new Uint8Array(frameSize),x=4+(j%4)*22+(j===2?f:0),y=5+Math.floor(j/4)*34;rect(m,x,y,16,18);if(j===0){rect(m,x+3,y+4,2,2);rect(m,x+7,y+4,2,2);rect(m,x+4,y+11,8,2);if(f===2)rect(m,x+6,y+21,4,3);}if(j===1)rect(m,x-3,y+7,6,4);return m;}));
const composeLabels=(sets)=>sets.map((roles)=>{const out=new Uint8Array(frameSize);for(let j=0;j<8;j++)for(let p=0;p<frameSize;p++)if(roles[j][p])out[p]=j+1;return out;});
const composite=(labels,extra=false)=>labels.map(l=>{const b=Buffer.alloc(frameSize*3);for(let p=0;p<frameSize;p++)if(l[p]){b[p*3]=255;b[p*3+1]=255;b[p*3+2]=255;}if(extra)for(let y=63;y<68;y++)for(let x=86;x<92;x++){const p=y*c.width+x;b[p*3]=255;b[p*3+1]=255;b[p*3+2]=255;}return b;});
const encode=(frames,pixFmt,out)=>{const r=spawnSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format',pixFmt,'-video_size',`${c.width}x${c.height}`,'-framerate',String(c.fps),'-i','pipe:0','-frames:v',String(c.frameCount),'-c:v','ffv1','-level','3',out],{input:Buffer.concat(frames.map(Buffer.from)),encoding:null,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr?.toString());};
const decode=(file,pixFmt)=>{const channels=pixFmt==='gray'?1:3,r=spawnSync('ffmpeg',['-v','error','-i',file,'-f','rawvideo','-pix_fmt',pixFmt,'pipe:1'],{encoding:null,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return Array.from({length:c.frameCount},(_,i)=>r.stdout.subarray(i*frameSize*channels,(i+1)*frameSize*channels));};
const fileRef=(root,p,withFrames=false,pixFmt='rgb24')=>({file:path.relative(root,p),sha256:sha256(p),bytes:fs.statSync(p).size,...(withFrames?{frameHashes:decode(p,pixFmt).map(sha256Bytes)}:{})});
const pgm=(m)=>Buffer.concat([Buffer.from(`P5\n${c.width} ${c.height}\n255\n`),Buffer.from(m)]);
const bbox=m=>{const on=[];for(let i=0;i<m.length;i++)if(m[i])on.push(i);const xs=on.map(v=>v%c.width),ys=on.map(v=>(v/c.width)|0);return[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs)+1,Math.max(...ys)-Math.min(...ys)+1];};

function makeFixture(root,name,mutate={}){
 const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});const sets=maskSet();if(mutate.missingStatic)for(let f=0;f<c.frameCount;f++)sets[f][7].fill(0);if(mutate.shiftMask)for(let f=0;f<c.frameCount;f++){const src=sets[f][2],dst=new Uint8Array(frameSize);for(let y=0;y<c.height;y++)for(let x=0;x<c.width-7;x++)dst[y*c.width+x+7]=src[y*c.width+x];sets[f][2]=dst;}
 const baseOfficial=maskSet(),officialLabels=composeLabels(baseOfficial),learnedLabels=composeLabels(sets),renderLabels=learnedLabels.map(x=>Uint8Array.from(x));if(mutate.labelInjection)learnedLabels[1][1*c.width+1]=1;
 const ref=path.join(dir,'reference.mkv'),learned=path.join(dir,'learned.mkv'),labels=path.join(dir,'learned-role-labels.mkv');encode(composite(officialLabels),'rgb24',ref);encode(composite(renderLabels,mutate.rawGaming),'rgb24',learned);encode(learnedLabels,'gray',labels);
 const source=path.join(dir,'official-source.bin');fs.writeFileSync(source,Buffer.from('official-runtime-source-v5.1-fixture'));
 const refBinding=fileRef(root,ref,true),frames=[];for(let f=0;f<c.frameCount;f++){const roles=[];for(let j=0;j<8;j++){const p=path.join(dir,`official-f${f}-r${j}.pgm`),bytes=pgm(baseOfficial[f][j]);fs.writeFileSync(p,bytes);const b=bbox(baseOfficial[f][j]);roles.push({roleId:roleIds[j],bbox:b,transform:[1,0,0,1,b[0],b[1]],opacity:1,zOrder:j,order:j,mask:fileRef(root,p)});}frames.push({index:f,referenceFrameHash:refBinding.frameHashes[f],roles});}
 const matrix=Array.from({length:10},(_,i)=>Array.from({length:8},(_,j)=>i<8?+(i===j):+(i===8&&j===0||i===9&&j===1)));if(mutate.aggregationCollapse){matrix[9]=[1,0,0,0,0,0,0,0];}
 const authority={schema:'motion-tool-learning-v5.1-role-mask-authority-v1',frameContract:c,sourceArtifacts:[{authorityId:'official-runtime-source',...fileRef(root,source)}],reference:{file:refBinding.file,sha256:refBinding.sha256,bytes:refBinding.bytes},sourceIds:Array.from({length:10},(_,i)=>`source-${i+1}`),roleIds,aggregationMatrix:matrix,roles:roleIds.map((roleId,i)=>({roleId,labelId:i+1,semanticClass:i<2?'text-owning-panel':'paper-shape'})),frames,eventGraph:[{frame:2,roleId:roleIds[0],type:'split',from:1,to:2},{frame:3,roleId:roleIds[0],type:'merge',from:2,to:1}]};const ap=path.join(dir,'authority.json');fs.writeFileSync(ap,JSON.stringify(authority));
 return{schema:'motion-tool-learning-v5.1-role-mask-input-v1',sampleId:name,frameContract:c,authority:fileRef(root,ap),reference:refBinding,learned:{...fileRef(root,learned,true),roleMask:fileRef(root,labels,true,'gray')},roleIds};
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'motion-v51-role-mask-'));
try{
 const positive=makeFixture(root,'positive'),pass=verifyRoleMasks(positive,{workspaceRoot:root});assert.equal(pass.pass,true,JSON.stringify(pass.failures));assert.equal(pass.authorityMaskHashes.length,c.frameCount*8);assert.equal(pass.recomputedVisibleRoleMaskHashes.official.length,c.frameCount*8);assert.equal(pass.recomputedVisibleRoleMaskHashes.learned.length,c.frameCount*8);assert(pass.recomputedVisibleRoleMaskHashes.learned.every(x=>/^[0-9a-f]{64}$/.test(x.fullMaskSha256)&&/^[0-9a-f]{64}$/.test(x.cropSha256)));assert.equal(pass.independentMeasurements.learned.length,c.frameCount);assert(pass.scores.weighted>=90);
 const callerScores=structuredClone(positive);callerScores.scores={weighted:100};assert(validateInputSchema(callerScores).includes('input:additional:scores'));
 const cases=[
  ['role-label-injection',{labelInjection:true},x=>x.some(v=>v.startsWith('role-label-injection:'))],
  ['mask-mismatch',{shiftMask:true},x=>x.includes('weighted:below-90')||x.includes('shape-topology:below-90')||x.includes('layout:below-90')],
  ['missing-static-region',{missingStatic:true},x=>x.some(v=>v.startsWith('visibility:'))],
  ['aggregation-collapse',{aggregationCollapse:true},x=>x.includes('aggregation:collapse')],
  ['raw-component-gaming',{rawGaming:true},x=>x.some(v=>v.startsWith('unlabeled-foreground:'))]
 ];
 for(const [name,mutation,expected] of cases){const report=verifyRoleMasks(makeFixture(root,name,mutation),{workspaceRoot:root});assert.equal(report.pass,false,name);assert(expected(report.failures),`${name}: ${JSON.stringify(report.failures)}`);}
 {const x=makeFixture(root,'learned-artifact-hash-drift');x.learned.sha256='0'.repeat(64);assert(verifyRoleMasks(x,{workspaceRoot:root}).failures.includes('learned:artifact-drift'));}
 {const x=makeFixture(root,'learned-frame-hash-drift');x.learned.frameHashes[0]='0'.repeat(64);assert(verifyRoleMasks(x,{workspaceRoot:root}).failures.includes('learned:frame-hash-drift'));}
 {const x=makeFixture(root,'role-mask-frame-hash-drift');x.learned.roleMask.frameHashes[0]='0'.repeat(64);assert(verifyRoleMasks(x,{workspaceRoot:root}).failures.includes('learned-role-mask:frame-hash-drift'));}
 {const x=makeFixture(root,'official-source-drift'),a=JSON.parse(fs.readFileSync(path.join(root,x.authority.file)));fs.appendFileSync(path.join(root,a.sourceArtifacts[0].file),'drift');assert(verifyRoleMasks(x,{workspaceRoot:root}).failures.includes('source:official-runtime-source:artifact-drift'));}
 {const x=makeFixture(root,'authority-mask-drift'),a=JSON.parse(fs.readFileSync(path.join(root,x.authority.file)));fs.appendFileSync(path.join(root,a.frames[0].roles[0].mask.file),'drift');assert(verifyRoleMasks(x,{workspaceRoot:root}).failures.includes('authority-mask:0:0:artifact-drift'));}
 console.log('motion v5.1 role-mask verifier: 1 positive + schema score rejection + 5 rendered negatives + 5 binding negatives passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
