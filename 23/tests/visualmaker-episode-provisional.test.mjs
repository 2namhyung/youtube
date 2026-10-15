import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSync,mkdtempSync,openSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {episodeFingerprintsStillMatch,evaluateEpisodeProvisional,omniRenderedOutputBinding,streamedFdFingerprint,streamedFileFingerprint} from '../visualmaker/core/episode-provisional.ts';
import {claimJob,enqueueEpisodeJob,episodeArtifactFile,episodeJobContract,getJob,retryJob} from '../visualmaker/core/jobs.ts';
import {POST as jobsPost} from '../src/app/api/studio/jobs/route.ts';
import {episodeByteRange,GET as mediaGet,videoStream} from '../src/app/api/studio/jobs/episode-media/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {streamingSha256} from '../video/scripts/streaming-sha256.mjs';
import {reviewBundleSha256} from '../video/scripts/visual-contract-v2.mjs';
import {APPROVAL_RUNTIME_FILES} from '../video/scripts/runtime-file-closure.mjs';

const url='http://127.0.0.1:8138',headers={'x-visualmaker-token':studioToken()};
function isolated(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-episode-'));return insertProject(importEpisode());}

test('current EP001 blocks full provisional rendering before validators or any output',async()=>{
  const plan=isolated(),report=await evaluateEpisodeProvisional(plan);
  assert.equal(report.renderEligible,false);assert.equal(report.composition,null);assert.equal(report.validators.length,0);assert.equal(report.inputs.length,0);
  assert.ok(report.blockers.some(block=>block.code==='missing-active-cut-root'));
  assert.deepEqual([report.productionAuthority,report.reviewApproved,report.audioSynchronized],[false,false,false]);
  assert.equal(episodeFingerprintsStillMatch(report),true);
  const job=await enqueueEpisodeJob(plan.id,1,'current-blocked');assert.equal(job.status,'blocked');assert.equal(job.kind,'episode-provisional-video');assert.equal(job.attempt,0);assert.equal(job.artifacts.length,0);
  const contract=episodeJobContract(job.id);assert.equal(contract.report.renderEligible,false);
  assert.throws(()=>claimJob(job.id),error=>error.status===409);assert.throws(()=>retryJob(job.id),error=>error.status===409);
});

test('exact idempotency scope, stale revision and request option rejection',async()=>{
  const plan=isolated(),job=await enqueueEpisodeJob(plan.id,1,'same');
  assert.deepEqual(await enqueueEpisodeJob(plan.id,1,'same'),job);
  const alien=insertProject(importEpisode());const alienJob=await enqueueEpisodeJob(alien.id,1,'same');assert.notEqual(alienJob.id,job.id);
  updateProject(plan.id,1,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새로운 의미',role:'context'});
  assert.deepEqual(await enqueueEpisodeJob(plan.id,1,'same'),job);
  await assert.rejects(enqueueEpisodeJob(plan.id,1,'new'),error=>error.status===409);
  const payload={action:'enqueue',kind:'episode-provisional-video',projectId:plan.id,baseRevision:1,idempotencyKey:'evil',entry:'video/src/other.tsx'};
  const rejected=await jobsPost(new Request(`${url}/api/studio/jobs`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)}));assert.equal(rejected.status,400);
  const unauthorized=await jobsPost(new Request(`${url}/api/studio/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));assert.equal(unauthorized.status,403);
});

test('blocked, cross-project and malformed media scope cannot expose bytes',async()=>{
  const plan=isolated(),job=await enqueueEpisodeJob(plan.id,1,'media');
  await assert.rejects(episodeArtifactFile(job.id,{projectId:plan.id,baseRevision:1,attempt:1}),error=>error.status===409);
  const query=new URLSearchParams({jobId:job.id,projectId:plan.id,baseRevision:'1',attempt:'1'});
  assert.equal((await mediaGet(new Request(`${url}/api/studio/jobs/episode-media?${query}`,{headers}))).status,409);
  assert.equal((await mediaGet(new Request(`${url}/api/studio/jobs/episode-media?${query}`))).status,403);
  query.set('projectId','plan-00000000-0000-0000-0000-000000000000');
  assert.equal((await mediaGet(new Request(`${url}/api/studio/jobs/episode-media?${query}`,{headers}))).status,409);
  query.set('name','../../raw/secret');
  assert.equal((await mediaGet(new Request(`${url}/api/studio/jobs/episode-media?${query}`,{headers}))).status,400);
  assert.equal(getJob(job.id).artifacts.length,0);
});

test('range policy and streaming fingerprints reject changed or oversized files',()=>{
  assert.deepEqual(episodeByteRange('bytes=2-5',100),{start:2,end:5});
  assert.deepEqual(episodeByteRange('bytes=0-',2_000_000),{start:0,end:1_999_999});
  assert.deepEqual(episodeByteRange('bytes=0-1048576',2_000_000),{start:0,end:1_048_576});
  assert.equal(episodeByteRange('bytes=-1',100),null);
  assert.equal(episodeByteRange('bytes=0-1,4-5',100),null);
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'vm-episode-hash-')),'frame.bin');writeFileSync(file,Buffer.alloc(1024*1024+11,13));
  const bytes=readFileSync(file);assert.deepEqual(streamedFileFingerprint(file),{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  assert.throws(()=>streamedFileFingerprint(file,1024),error=>error.status===409);
});

test('Omni generated video must be the byte-bound asset of a visible rendered component',()=>{
  const hash='a'.repeat(64);
  const manifest={schema_version:3,omni:{output:'omni/generated.mp4'},assets:[{asset_id:'motion',file:'omni/generated.mp4',media_type:'video/mp4',sha256:hash}],visual_components:[{component_id:'visible',asset_id:'motion',render_kind:'asset',presentation_slot:'hero',visibility_timeline:[{start_frame:0,end_frame:10,state:'focused'}]}],visual_beats:[{start_frame:0,end_frame:10,layout_template:'experience-hero',hidden_component_ids:[]}]};
  assert.equal(omniRenderedOutputBinding(manifest,hash),true);
  assert.equal(omniRenderedOutputBinding(manifest,'b'.repeat(64)),false);
  assert.equal(omniRenderedOutputBinding({...manifest,assets:[]},hash),false);
  assert.equal(omniRenderedOutputBinding({...manifest,visual_components:[]},hash),false);
  assert.equal(omniRenderedOutputBinding({...manifest,visual_components:[{...manifest.visual_components[0],presentation_slot:'not-rendered'}]},hash),false);
  assert.equal(omniRenderedOutputBinding({...manifest,visual_beats:[{start_frame:0,end_frame:10,hidden_component_ids:['visible']}]},hash),false);
  assert.equal(omniRenderedOutputBinding({...manifest,visual_components:[{...manifest.visual_components[0],visibility_timeline:[{start_frame:10,end_frame:20,state:'focused'}]}]},hash),false);
});

test('streaming canonical hashes retain byte and review-bundle serialization',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'vm-episode-review-')),cutRoot=path.join(root,'cut');
  const asset=path.join(cutRoot,'motion.mp4'),review=path.join(root,'review.mp4');
  const {mkdirSync}=await import('node:fs');mkdirSync(cutRoot);
  const media=Buffer.alloc(2*1024*1024+7,31),reviewMedia=Buffer.alloc(1024*1024+3,49);
  writeFileSync(asset,media);writeFileSync(review,reviewMedia);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(await streamingSha256(asset),hash(media));
  const manifest={assets:[{file:'motion.mp4'}],omni:{keyframes:[]},effects:[],approvals:{playable_cut:{status:'passed',user_pass:true,approval_marker:'marker',approved_bundle_sha256:'old'}}};
  const runtime=APPROVAL_RUNTIME_FILES;
  for(const [index,relative] of runtime.entries()){const file=path.join(root,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,`runtime-${index}`);}
  const copy=structuredClone(manifest);copy.approvals.playable_cut={status:'pending',user_pass:false,approval_marker:null,approved_bundle_sha256:null};
  const runtimeHash=hash(Buffer.from(runtime.map(relative=>`${relative}|${hash(readFileSync(path.join(root,relative)))}`).sort().join('\n')));
  const rows=[`manifest|${hash(Buffer.from(JSON.stringify(copy)))}`,`asset|motion.mp4|${hash(media)}`,`runtime|${runtimeHash}`,`review-artifact|review.mp4|${hash(reviewMedia)}`];
  assert.equal(await reviewBundleSha256({root,cutRoot,manifest,reviewArtifact:'review.mp4'}),hash(Buffer.from(rows.sort().join('\n'))));
});

test('media streams verified descriptor after same-size path replacement',async(t)=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'vm-episode-fd-')),file=path.join(dir,'video.mp4'),moved=path.join(dir,'moved.mp4'),replacement=path.join(dir,'replacement.mp4');
  const original=Buffer.from('original-verified-media'),attacker=Buffer.from('X'.repeat(original.length));
  writeFileSync(file,original);writeFileSync(replacement,attacker);
  const fd=openSync(file,'r'),fingerprint=streamedFdFingerprint(fd);
  try{renameSync(file,moved);renameSync(replacement,file);}catch(error){closeSync(fd);t.skip(`platform does not permit rename of an open file: ${error.code}`);return;}
  const bytes=Buffer.from(await new Response(videoStream(fd,fingerprint.identity,0,original.length-1)).arrayBuffer());
  assert.deepEqual(bytes,original);assert.deepEqual(readFileSync(file),attacker);
});
