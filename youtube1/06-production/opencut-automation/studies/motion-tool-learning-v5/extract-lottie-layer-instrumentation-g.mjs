import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const authority=path.join(root,'out/studies/motion-tool-learning-v4-authority-b/originals/lottie-web-v1');
const out=path.join(root,'out/studies/motion-tool-learning-v5-lottie-layer-instrumentation-g');
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if(fs.existsSync(out))throw new Error(`append-only output exists: ${out}`);
fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rels=['LICENSE.md','build/player/lottie.js','demo/bodymovin/index.html','demo/bodymovin/data.json'];
const sourceFiles=rels.map(file=>{const p=path.join(authority,file);return{file:`out/studies/motion-tool-learning-v4-authority-b/originals/lottie-web-v1/${file}`,sha256:sha(p),bytes:fs.statSync(p).size}});

const server=await new Promise(resolve=>{const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');let p;if(u.pathname.startsWith('/demo/'))p=path.join(authority,'demo/bodymovin',u.pathname.slice(6));else if(u.pathname.startsWith('/build/'))p=path.join(authority,u.pathname.slice(1));if(!p||!fs.existsSync(p)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(p))});s.listen(0,'127.0.0.1',()=>resolve(s))});
const port=server.address().port;
const browser=await chromium.launch({executablePath:edge,headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
const ctx=await browser.newContext({viewport:{width:960,height:540}});let blocked=0;
await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'&&+u.port===port)route.continue();else{blocked++;route.abort('blockedbyclient')}});
const page=await ctx.newPage();await page.goto(`http://127.0.0.1:${port}/demo/index.html`,{waitUntil:'networkidle'});await page.waitForFunction(()=>globalThis.anim?.isLoaded);
const total=await page.evaluate(()=>anim.totalFrames);const frames=[];
for(let frame=0;frame<48;frame++){
 await page.evaluate(n=>anim.goToAndStop(n,true),frame*(total-1)/47);
 frames.push(await page.evaluate(frame=>{
  const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}};
  const matrix=e=>{const t=getComputedStyle(e).transform;return t==='none'?[1,0,0,1,0,0]:(t.match(/-?[\d.]+/g)||[]).map(Number)};
  const domPath=e=>{const q=[];while(e&&e!==document.body){const p=e.parentElement;if(!p)break;q.push([...p.children].indexOf(e));e=p}return q.reverse().join('.')};
  const layers=anim.renderer.elements.map((e,order)=>{if(!e?.layerElement)return null;const layer=e.layerElement,all=[layer,...layer.querySelectorAll('*')],visible=all.map((node,i)=>{const b=rect(node),c=getComputedStyle(node);return{node,i,b,c}}).filter(x=>x.b.w>.25&&x.b.h>.25&&x.c.display!=='none'&&x.c.visibility!=='hidden'&&+x.c.opacity>0);const boxes=visible.map(x=>x.b),bbox=boxes.length?{x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),w:Math.max(...boxes.map(b=>b.x+b.w))-Math.min(...boxes.map(b=>b.x)),h:Math.max(...boxes.map(b=>b.y+b.h))-Math.min(...boxes.map(b=>b.y))}:{x:0,y:0,w:0,h:0};const nested=visible.filter(x=>x.node!==layer).slice(0,12).map((x,nestedOrder)=>({domPath:domPath(x.node),nestedOrder,tag:x.node.tagName,bbox:x.b,opacity:+x.c.opacity,transform:matrix(x.node),maskCount:x.node.querySelectorAll?.('mask,clipPath').length||0,pathCount:x.node.matches?.('path')?1:(x.node.querySelectorAll?.('path').length||0),parentDomPath:x.node.parentElement?domPath(x.node.parentElement):null}));return{sourceIdentity:{name:e.data?.nm??null,index:e.data?.ind??order,type:e.data?.ty??null,parentIndex:e.data?.parent??null},order,bbox,opacity:+getComputedStyle(layer).opacity,transform:matrix(layer),zIndex:getComputedStyle(layer).zIndex,maskCount:layer.querySelectorAll('mask,clipPath').length,pathCount:layer.querySelectorAll('path').length,childCount:layer.children.length,nested}}).filter(Boolean);
  return{frame,layers};
 },frame));
}
await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));if(blocked)throw new Error(`external requests blocked: ${blocked}`);
const groups=[[0,1],[2],[3],[4],[5],[6],[7,8],[9]];
const aggregate=(layers,indexes,role)=>{const q=indexes.map(i=>layers.find(x=>x.order===i));if(q.some(x=>!x))throw new Error(`missing layer in ${role}`);const boxes=q.map(x=>x.bbox).filter(b=>b.w>0&&b.h>0),bbox=boxes.length?{x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),w:Math.max(...boxes.map(b=>b.x+b.w))-Math.min(...boxes.map(b=>b.x)),h:Math.max(...boxes.map(b=>b.y+b.h))-Math.min(...boxes.map(b=>b.y))}:{x:0,y:0,w:0,h:0};return{role,order:+role.slice(-2)-1,bbox,opacity:Math.max(...q.map(x=>x.opacity)),memberTransforms:q.map(x=>x.transform),sourceOrders:indexes,parentRole:'composition-root',shapeDescriptor:{pathCount:q.reduce((n,x)=>n+x.pathCount,0),childCount:q.reduce((n,x)=>n+x.childCount,0),maskCount:q.reduce((n,x)=>n+x.maskCount,0),nestedMeasuredCount:q.reduce((n,x)=>n+x.nested.length,0)}}};
const aggregatedFrames=frames.map(f=>({frame:f.frame,nodes:groups.map((g,i)=>aggregate(f.layers,g,`neutral-role-${String(i+1).padStart(2,'0')}`))}));
const full={schema:'motion-tool-learning-v5-lottie-layer-instrumentation-g-v1',toolId:'lottie-web-v1',officialCommit:'507be7fa7fbf748962dd7b1b190d99cc9cf6079b',renderer:'official lottie-web HTML renderer',totalOfficialFrames:total,frameContract:{width:960,height:540,fps:24,frameCount:48},sourceFiles,sourceStructuralIdentityMapping:groups.map((members,i)=>({role:`neutral-role-${String(i+1).padStart(2,'0')}`,members:members.map(order=>{const x=frames[0].layers.find(y=>y.order===order);return{order,sourceIdentity:x.sourceIdentity}})})),frames,aggregatedFrames,coverage:{rawLayerCountRange:[Math.min(...frames.map(f=>f.layers.length)),Math.max(...frames.map(f=>f.layers.length))],stableSourceIdentity:true,aggregatedRoleCount:8,nestedMeasurements:frames.reduce((n,f)=>n+f.layers.reduce((m,l)=>m+l.nested.length,0),0)}};
const safe={schema:'motion-tool-learning-v5-creator-safe-structural-record-v2',toolId:'lottie-web-v1',officialCommit:full.officialCommit,semanticClass:'multi-component kinetic wordmark composition',frameContract:full.frameContract,frames:aggregatedFrames.map(f=>({frame:f.frame,nodes:f.nodes.map(({sourceOrders,...n})=>n)}))};
const fullPath=path.join(out,'instrumentation.json'),safePath=path.join(out,'creator-safe-record.json');fs.writeFileSync(fullPath,JSON.stringify(full,null,2)+'\n');fs.writeFileSync(safePath,JSON.stringify(safe,null,2)+'\n');
const manifest={schema:'motion-tool-learning-v5-lottie-layer-instrumentation-g-manifest-v1',createdAt:new Date().toISOString(),implementation:{file:'studies/motion-tool-learning-v5/extract-lottie-layer-instrumentation-g.mjs',sha256:sha(fileURLToPath(import.meta.url))},officialCommit:full.officialCommit,sourceFiles,network:{externalAllowed:false,blockedRequests:blocked,loopbackOnly:true},records:{full:{file:'instrumentation.json',sha256:sha(fullPath),bytes:fs.statSync(fullPath).size},creatorSafe:{file:'creator-safe-record.json',sha256:sha(safePath),bytes:fs.statSync(safePath).size}},creatorBoundary:{allowed:'creator-safe-record.json only',forbidden:['instrumentation.json','sourceIdentity','official source','official pixels','official frames','official text','official colors']},promotionEligible:false,productionEligible:false};fs.writeFileSync(path.join(out,'extractor.manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({out,manifestSha256:sha(path.join(out,'extractor.manifest.json')),coverage:full.coverage},null,2));
