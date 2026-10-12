import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const sha256=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function validateDocuments(manifest,full,safe,{implementationSha,sourceFacts}={}){
 const failures=[];
 if(manifest?.schema!=='motion-tool-learning-v5-lottie-layer-instrumentation-g-manifest-v1')failures.push('manifest-schema');
 if(full?.schema!=='motion-tool-learning-v5-lottie-layer-instrumentation-g-v1')failures.push('full-schema');
 if(safe?.schema!=='motion-tool-learning-v5-creator-safe-structural-record-v2')failures.push('safe-schema');
 if(manifest?.officialCommit!=='507be7fa7fbf748962dd7b1b190d99cc9cf6079b'||full?.officialCommit!==manifest?.officialCommit||safe?.officialCommit!==manifest?.officialCommit)failures.push('commit-drift');
 if(implementationSha&&manifest?.implementation?.sha256!==implementationSha)failures.push('instrumentation-drift');
 if(sourceFacts)for(const item of manifest.sourceFiles||[]){const fact=sourceFacts.get(item.file);if(!fact||fact.sha256!==item.sha256||fact.bytes!==item.bytes)failures.push(`source-drift:${item.file}`)}
 if(!Array.isArray(full?.frames)||full.frames.length!==48)failures.push('full-frame-coverage');
 if(!Array.isArray(full?.aggregatedFrames)||full.aggregatedFrames.length!==48||!Array.isArray(safe?.frames)||safe.frames.length!==48)failures.push('aggregate-frame-coverage');
 const identities=full?.frames?.[0]?.layers?.map(x=>JSON.stringify(x.sourceIdentity))||[];
 if(identities.length!==10||new Set(identities).size!==10)failures.push('source-identity-collapse');
 for(const [i,frame] of (full?.frames||[]).entries()){
  if(frame.layers?.length!==10)failures.push(`omitted-layer:${i}`);
  const ids=frame.layers?.map(x=>JSON.stringify(x.sourceIdentity))||[];if(JSON.stringify(ids)!==JSON.stringify(identities))failures.push(`identity-drift:${i}`);
  for(const layer of frame.layers||[])if(!layer.bbox||!Array.isArray(layer.transform)||!Array.isArray(layer.nested)||!Number.isFinite(layer.opacity))failures.push(`missing-measurement:${i}:${layer.order}`);
 }
 const mappings=full?.sourceStructuralIdentityMapping||[],members=mappings.flatMap(x=>x.members?.map(y=>y.order)||[]);
 if(mappings.length!==8||members.length!==10||new Set(members).size!==10||members.slice().sort((a,b)=>a-b).some((x,i)=>x!==i))failures.push('aggregation-collapse');
 for(const [i,frame] of (full?.aggregatedFrames||[]).entries())if(frame.nodes?.length!==8||new Set(frame.nodes.map(x=>x.role)).size!==8)failures.push(`aggregate-role-coverage:${i}`);
 for(const [i,frame] of (safe?.frames||[]).entries()){
  if(frame.nodes?.length!==8)failures.push(`safe-role-coverage:${i}`);
  if(JSON.stringify(frame).match(/sourceIdentity|sourceOrders|\"name\"/))failures.push(`safe-source-leak:${i}`);
  for(const n of frame.nodes||[])if(!n.bbox||!Array.isArray(n.memberTransforms)||!Number.isFinite(n.opacity)||!n.shapeDescriptor)failures.push(`safe-measurement:${i}:${n.role}`);
 }
 if(manifest?.creatorBoundary?.allowed!=='creator-safe-record.json only'||!manifest?.creatorBoundary?.forbidden?.includes('sourceIdentity'))failures.push('creator-boundary');
 if(manifest?.promotionEligible!==false||manifest?.productionEligible!==false)failures.push('eligibility');
 return[...new Set(failures)];
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(root,'out/studies/motion-tool-learning-v5-lottie-layer-instrumentation-g');
 const mp=path.join(out,'extractor.manifest.json'),fp=path.join(out,'instrumentation.json'),sp=path.join(out,'creator-safe-record.json'),vp=path.join(out,'verifier.json');if(fs.existsSync(vp))throw new Error('append-only verifier exists');
 const manifest=JSON.parse(fs.readFileSync(mp)),full=JSON.parse(fs.readFileSync(fp)),safe=JSON.parse(fs.readFileSync(sp));
 const facts=new Map(manifest.sourceFiles.map(x=>{const p=path.join(root,x.file);return[x.file,{sha256:sha256(p),bytes:fs.statSync(p).size}]}));
 const failures=validateDocuments(manifest,full,safe,{implementationSha:sha256(path.join(root,manifest.implementation.file)),sourceFacts:facts});
 if(manifest.records.full.sha256!==sha256(fp)||manifest.records.full.bytes!==fs.statSync(fp).size)failures.push('full-record-drift');if(manifest.records.creatorSafe.sha256!==sha256(sp)||manifest.records.creatorSafe.bytes!==fs.statSync(sp).size)failures.push('safe-record-drift');
 const report={schema:'motion-tool-learning-v5-lottie-layer-instrumentation-g-independent-gate-v1',verifiedAt:new Date().toISOString(),inputs:{manifest:{sha256:sha256(mp)},full:{sha256:sha256(fp)},creatorSafe:{sha256:sha256(sp)},gate:{sha256:sha256(fileURLToPath(import.meta.url))}},coverage:full.coverage,failures:[...new Set(failures)],pass:failures.length===0,promotionEligible:false,productionEligible:false};fs.writeFileSync(vp,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
}
