import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {searchWiseSources,importWiseSource} from '../visualmaker/core/wise-bridge.ts';
import {POST as searchPost} from '../src/app/api/studio/wise-search/route.ts';
import {POST as importPost} from '../src/app/api/studio/wise-import/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {validWiseImport} from '../src/components/studio/wise-source-client.ts';

const hash=value=>createHash('sha256').update(value).digest('hex');
const endpoint='http://127.0.0.1:8138';
function isolated(){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-wise-'));
  let plan=insertProject(importEpisode());
  const scene=plan.scenes.find(row=>row.candidates.some(candidate=>candidate.mode==='source-video'));
  assert.ok(scene);const candidate=scene.candidates.find(row=>row.mode==='source-video');
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:scene.id,candidateId:candidate.id});
  const requirement=plan.requirements.find(row=>candidate.requirementIds.includes(row.id)&&row.mediaType==='video'&&['external','official'].includes(row.acquisition));
  assert.ok(requirement);
  return {plan,requirement,input:{projectId:plan.id,baseRevision:plan.revision,requirementId:requirement.id,
    scriptSha256:plan.script.rawSha256,query:'courthouse exterior'}};
}
const scope=input=>({projectId:input.projectId,revision:input.baseRevision,requirementId:input.requirementId,scriptSha256:input.scriptSha256});
const source=(bytes)=>({sourceId:'src-1',wiseMediaId:'src-1.mp4',sha256:hash(bytes),metadataSha256:'a'.repeat(64),kind:'video',
  title:'Synthetic courthouse',creator:'Fixture creator',sourceUrl:'https://example.test/original',license:'CC BY 4.0',
  licenseUrl:'https://creativecommons.org/licenses/by/4.0/',rightsEvidence:'Fixture declaration',rightsConfirmed:true,
  durationSeconds:0.5});
function syntheticVideo(){
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'vm-wise-mp4-')),'sample.mp4');
  const ff=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=64x64:r=10','-t','0.5','-c:v','libx264',
    '-pix_fmt','yuv420p',file],{windowsHide:true,encoding:'utf8',timeout:15_000});
  assert.equal(ff.status,0,ff.stderr);return readFileSync(file);
}
const runner=(source,bytes,calls)=>async request=>{
  calls.push(request);
  assert.deepEqual(request.args.slice(0,2),['-I','-B']);
  const action=request.args[3],payload=JSON.parse(Buffer.from(request.args[4],'base64').toString());
  if(action==='search'){
    assert.deepEqual(payload,{kind:'video',query:'courthouse exterior'});
    return Buffer.from(JSON.stringify({status:'available',candidates:[{...source,rawSpan:{startSeconds:0,endSeconds:0.2},
      selectedSpan:{startSeconds:0,endSeconds:0.2}}],counts:{hits:1,verified:1,unresolved:0}}));
  }
  assert.equal(action,'import');assert.equal(payload.sourceId,source.sourceId);
  return Buffer.from(JSON.stringify({status:'available',source,selectedSpan:{startSeconds:0,endSeconds:0.2},bytesBase64:bytes.toString('base64')}));
};
function request(route,body,token=studioToken()){
  return new Request(`${endpoint}/api/studio/${route}`,{method:'POST',headers:{host:'127.0.0.1:8138',origin:endpoint,
    'x-visualmaker-token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
}

test('WISE search returns verified candidate, scoped opaque selection, and no mutation',async()=>{
  const {input}=isolated(),bytes=syntheticVideo();
  const calls=[],result=await searchWiseSources(input,{runner:runner(source(bytes),bytes,calls)});
  assert.equal(result.status,'available');assert.equal(result.scope.revision,input.baseRevision);
  assert.equal(result.candidates.length,1);assert.match(result.candidates[0].selectionToken,/^[a-f0-9]{48}$/);
  assert.equal(getProject(input.projectId).assets.length,0);
  assert.equal(calls.length,1);assert.ok(!JSON.stringify(result).includes('relative_path'));
});

test('WISE import validates selection and bytes; only pending reviews and provenance receipt are added',async()=>{
  const {input}=isolated(),bytes=syntheticVideo();
  const src=source(bytes),calls=[],mock=runner(src,bytes,calls),found=await searchWiseSources(input,{runner:mock});
  const card=found.candidates[0],selection={...input,sourceId:card.sourceId,wiseMediaId:card.wiseMediaId,sha256:card.sha256,
    metadataSha256:card.metadataSha256,selectedSpan:card.selectedSpan,selectionToken:card.selectionToken,
    semanticNote:'Real exterior relevant to narration\nSecond observation\twith a time cue',evidenceOnly:false};
  await assert.rejects(importWiseSource({...selection,selectedSpan:{startSeconds:1,endSeconds:2}},{runner:mock}),error=>error.status===409);
  assert.equal(calls.length,1);
  const alternate=await import('../visualmaker/core/wise-bridge.ts?alternate-route-instance');
  const result=await alternate.importWiseSource(selection,{runner:mock});
  assert.equal(validWiseImport(result,scope(input),card),true);
  assert.equal(result.plan.productionAuthority,false);assert.equal(result.inputSha256,src.sha256);
  assert.equal(result.plan.requirements.find(row=>row.id===input.requirementId).assetId,result.assetId);
  const asset=result.plan.assets.find(row=>row.id===result.assetId);assert.equal(asset.status,'pending-review');
  assert.equal(asset.semanticNote,selection.semanticNote);
  const states=result.sourceReviewStates.find(row=>row.requirementId===input.requirementId);
  assert.deepEqual(Object.values(states.current).map(row=>row.decision),['pending','pending','pending']);
  const receipt=JSON.parse(readFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts',`${result.assetId}.json`),'utf8'));
  assert.equal(receipt.wiseSourceProvenance.sourceId,'src-1');assert.equal(receipt.wiseSourceProvenance.sourceSha256,src.sha256);
  assert.equal(receipt.wiseSourceProvenance.productionAuthority,false);
  assert.equal(receipt.wiseSourceProvenance.canonicalRights.licenseUrl,src.licenseUrl);
  await assert.rejects(importWiseSource(selection,{runner:mock}),error=>error.status===409);
});

test('changed source hash, offline, stale scope and guarded routes fail closed',async()=>{
  const {input,plan}=isolated(),bytes=syntheticVideo();
  const src=source(bytes),calls=[],mock=runner(src,bytes,calls),found=await searchWiseSources(input,{runner:mock});
  const card=found.candidates[0],selection={...input,sourceId:card.sourceId,wiseMediaId:card.wiseMediaId,sha256:card.sha256,
    metadataSha256:card.metadataSha256,selectedSpan:card.selectedSpan,selectionToken:card.selectionToken,
    semanticNote:'Relevant exterior',evidenceOnly:false};
  await assert.rejects(importWiseSource(selection,{runner:async req=>{calls.push(req);return Buffer.from(JSON.stringify({status:'available',source:src,
    selectedSpan:card.selectedSpan,bytesBase64:Buffer.from('changed').toString('base64')}));}}),error=>error.status===409);
  assert.equal(getProject(input.projectId).assets.length,0);
  await assert.rejects(searchWiseSources(input,{runner:async()=>Buffer.from('{"status":"unavailable","reason":"wise-not-configured"}')}),error=>error.status===503);
  const denied=await searchPost(request('wise-search',input,'0'.repeat(64)));assert.equal(denied.status,403);
  const bad=await importPost(request('wise-import',{...selection,path:'C:/secret'}));assert.equal(bad.status,400);
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'changed',role:plan.beats[0].role});
  await assert.rejects(importWiseSource(selection,{runner:mock}),error=>error.status===409);
  assert.equal(calls.length,2);
});

test('unrecognized offline reason is hidden and invalid WISE counts are rejected',async()=>{
  const {input}=isolated();
  await assert.rejects(searchWiseSources(input,{runner:async()=>Buffer.from(JSON.stringify({status:'unavailable',
    reason:'C:/private/operator/config'}))}),error=>error.status===503&&!error.message.includes('private'));
  for(const hits of [-1,Infinity,501,0.5]){
    await assert.rejects(searchWiseSources(input,{runner:async()=>Buffer.from(JSON.stringify({status:'available',candidates:[],
      counts:{hits,verified:0,unresolved:0}}))}),error=>error.status===502);
  }
});

test('WISE rejects unsafe license links and preserves long canonical rights in receipt',async()=>{
  const {input}=isolated(),bytes=syntheticVideo(),src=source(bytes);
  const unsafe=await searchWiseSources(input,{runner:runner({...src,licenseUrl:'file:///C:/private'},bytes,[])});
  assert.equal(unsafe.candidates.length,0);
  const long={...src,license:'L'.repeat(200),rightsEvidence:'E'.repeat(2000),
    licenseUrl:`https://example.test/${'x'.repeat(2027)}`};
  assert.ok(long.licenseUrl.length<=2048);
  const mock=runner(long,bytes,[]),found=await searchWiseSources(input,{runner:mock});
  assert.equal(found.candidates.length,1);
  const card=found.candidates[0];
  const imported=await importWiseSource({...input,sourceId:card.sourceId,wiseMediaId:card.wiseMediaId,sha256:card.sha256,
    metadataSha256:card.metadataSha256,selectedSpan:card.selectedSpan,selectionToken:card.selectionToken,
    semanticNote:'Meaningful source scene',evidenceOnly:false},{runner:mock});
  const asset=imported.plan.assets.find(row=>row.id===imported.assetId);
  assert.ok(asset.rightsNote.length<=4000);
  assert.match(asset.rightsNote,/WISE 원본 수집 기록/);
  const receipt=JSON.parse(readFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts',`${imported.assetId}.json`),'utf8'));
  assert.equal(receipt.wiseSourceProvenance.canonicalRights.rightsEvidence,long.rightsEvidence);
  assert.equal(receipt.wiseSourceProvenance.canonicalRights.licenseUrl,long.licenseUrl);
});
