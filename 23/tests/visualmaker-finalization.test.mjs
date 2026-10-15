import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateFinalization,parseFinalizationSelection,validateCaptionCoverage,validateFinalizationApprovalMarker} from '../visualmaker/core/finalization.ts';
import {captionSidecars,runFinalizationEngine} from '../visualmaker/renderer/finalization-engine.ts';
import {streamedFileFingerprint} from '../visualmaker/core/episode-provisional.ts';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject} from '../visualmaker/core/store.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const fp=file=>streamedFileFingerprint(file,4_000_000_000);
function ffmpeg(args){const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{cwd:root,windowsHide:true,timeout:60_000,encoding:'utf8'});assert.equal(result.status,0,result.stderr||String(result.error));}
function selection(segments){return {version:1,final_script:{path:'wiki/syntheses/final-script.md',sha256:'a'.repeat(64)},source:{job_id:`job_${randomUUID()}`,attempt:1,artifact_sha256:'b'.repeat(64),receipt_sha256:'c'.repeat(64)},picture_marker_sha256:'d'.repeat(64),captions:{segments,approval_marker:'video/episodes/episode-001/caption-approval.json',approval_marker_sha256:'e'.repeat(64)},mix:{mode:'passthrough'},thumbnail:{frame:3}};}
const segments=[{cut_id:'SH001',start_frame:0,end_frame:6,char_start:0,char_end:5,text:'Hello'},{cut_id:'SH001',start_frame:6,end_frame:12,char_start:6,char_end:11,text:'world'}];

test('strict post-lock selection rejects unsupported mixing, paths and unknown fields',()=>{
  assert.equal(parseFinalizationSelection(selection(segments)).mix.mode,'passthrough');
  assert.throws(()=>parseFinalizationSelection({...selection(segments),source:{...selection(segments).source,job_id:randomUUID()}}),/최종화 선택/);
  assert.throws(()=>parseFinalizationSelection({...selection(segments),extra:true}),/최종화 선택/);
  assert.throws(()=>parseFinalizationSelection({...selection(segments),mix:{mode:'normalize'}}),/지원하지 않는 믹스/);
  assert.throws(()=>parseFinalizationSelection({...selection(segments),final_script:{path:'../../raw/source.md',sha256:'a'.repeat(64)}}),/최종화 선택/);
  assert.throws(()=>parseFinalizationSelection({...selection(segments),thumbnail:{frame:1.5}}),/최종화 선택/);
});

test('caption frames and Unicode spans cover every non-whitespace character in canonical cut order',()=>{
  validateCaptionCoverage(segments,[{cutId:'SH001',startFrame:0,endFrame:12,text:'Hello world'}],12);
  for(const bad of [
    [{...segments[0],char_end:4},segments[1]],
    [segments[1],segments[0]],
    [segments[0],{...segments[1],start_frame:5}],
    [segments[0],{...segments[1],end_frame:13}],
    [segments[0]],
    [segments[0],{...segments[1],text:' earth'}],
    [segments[0],{...segments[1],char_start:7,char_end:11,text:'orld'}],
    [segments[0],{...segments[1],char_start:4,char_end:11,text:'o world'}],
  ])assert.throws(()=>validateCaptionCoverage(bad,[{cutId:'SH001',startFrame:0,endFrame:12,text:'Hello world'}],12));
  assert.throws(()=>validateCaptionCoverage([{...segments[0],text:' Hello'},segments[1]],[{cutId:'SH001',startFrame:0,endFrame:12,text:' Helloworld'}],12));
  validateCaptionCoverage([{cut_id:'SH001',start_frame:0,end_frame:10,char_start:0,char_end:3,text:'가😀나'}],[{cutId:'SH001',startFrame:0,endFrame:10,text:'가😀나'}],10);
  validateCaptionCoverage([{cut_id:'SH001',start_frame:0,end_frame:5,char_start:0,char_end:2,text:'가😀'},{cut_id:'SH001',start_frame:5,end_frame:10,char_start:3,char_end:4,text:'나'}],[{cutId:'SH001',startFrame:0,endFrame:10,text:'가😀\u00a0나'}],10);
  assert.throws(()=>validateCaptionCoverage([{...segments[0],char_start:1,char_end:6,text:'Hello'},segments[1]],[{cutId:'SH001',startFrame:0,endFrame:12,text:' Hello world'}],12));
  assert.throws(()=>validateCaptionCoverage(segments,[{cutId:'SH001',startFrame:0,endFrame:12,text:'Hello world '}],12));
  const sidecars=captionSidecars(segments,30);assert.match(sidecars.srt,/00:00:00,200 --> 00:00:00,400/);assert.match(sidecars.vtt,/WEBVTT/);
  assert.throws(()=>captionSidecars([{...segments[0],end_frame:0}],30),/timing/);
});

test('human picture and caption markers bind exact source, script and caption bytes without a spec hash cycle',()=>{
  const source={job_id:randomUUID(),attempt:1,artifact_sha256:'a'.repeat(64),receipt_sha256:'b'.repeat(64)};
  const binding={jobId:source.job_id,attempt:1,artifactSha256:source.artifact_sha256,receiptSha256:source.receipt_sha256,scriptSha256:'c'.repeat(64),captionSha256:'d'.repeat(64),pictureSha256:'e'.repeat(64)};
  const picture={schema_version:1,kind:'picture',episode_id:'episode-001',reviewer:'user',source,final_script_sha256:binding.scriptSha256};
  const caption={...picture,kind:'caption',caption_contract_sha256:binding.captionSha256,picture_marker_sha256:binding.pictureSha256};
  validateFinalizationApprovalMarker(picture,'picture',binding);validateFinalizationApprovalMarker(caption,'caption',binding);
  assert.throws(()=>validateFinalizationApprovalMarker({...picture,reviewer:'agent'},'picture',binding));
  assert.throws(()=>validateFinalizationApprovalMarker({...picture,source:{...source,artifact_sha256:'f'.repeat(64)}},'picture',binding));
  assert.throws(()=>validateFinalizationApprovalMarker({...caption,caption_contract_sha256:'f'.repeat(64)},'caption',binding));
  assert.throws(()=>validateFinalizationApprovalMarker({...caption,extra:true},'caption',binding));
});

test('current EP001 has no post-lock output contract and reports a blocker',async()=>{
  const prior=process.env.VISUALMAKER_DATA_DIR;const temp=mkdtempSync(path.join(os.tmpdir(),'vm-finalization-current-'));
  try{process.env.VISUALMAKER_DATA_DIR=temp;const plan=insertProject(importEpisode());const report=await evaluateFinalization(plan.id,plan.revision);
    assert.equal(report.renderEligible,false);assert.equal(report.productionAuthority,false);assert.equal(report.reviewApproved,false);
    assert.ok(report.blockers.some(block=>block.code==='post-lock-contract-missing'));
    assert.equal(JSON.parse(readFileSync(path.join(root,'video/episodes/episode-001/episode-spec.json'),'utf8')).post_lock_output,undefined);
  }finally{if(prior===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=prior;rmSync(temp,{recursive:true,force:true});}
});

test('real FFmpeg post-lock technical export preserves video/audio packets and frames with soft subtitles', {timeout:180_000},async t=>{
  const prior=process.env.VISUALMAKER_DATA_DIR,data=mkdtempSync(path.join(os.tmpdir(),'vm-finalization-engine-'));process.env.VISUALMAKER_DATA_DIR=data;
  t.after(()=>{if(prior===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=prior;rmSync(data,{recursive:true,force:true});});
  const job=`job_${randomUUID()}`,staging=path.join(data,'jobs','staging',randomUUID(),'work'),sourceDir=path.join(data,'jobs',job,'attempt-1');mkdirSync(staging,{recursive:true});mkdirSync(sourceDir,{recursive:true});
  const source=path.join(sourceDir,'provisional-voiced-episode.mp4');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=0.4','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.4','-frames:v','12','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-c:a','aac','-ar','48000','-ac','2','-shortest',source]);
  const receiptBytes=Buffer.from('{"synthetic":true}\n');writeFileSync(path.join(sourceDir,'provisional-voiced-episode.json'),receiptBytes,{flag:'wx'});
  const sourceHash=fp(source);const chosen=selection(segments);chosen.source.job_id=job;chosen.source.artifact_sha256=sourceHash.sha256;
  const binding={sourcePath:source,sourceSha256:sourceHash.sha256,sourceBytes:sourceHash.bytes,receiptSha256:sha(receiptBytes),receipt:{},addendumPath:'video/episodes/episode-001/finalization-addendum.json',addendumSha256:'a'.repeat(64),preLockStateSha256:'b'.repeat(64),specSha256:'a'.repeat(64),stateSha256:'b'.repeat(64),scriptSha256:'d'.repeat(64),pictureMarkerSha256:'e'.repeat(64),captionMarkerSha256:'f'.repeat(64),captionContractSha256:sha(JSON.stringify({segments})),selection:chosen};
  const report={schemaVersion:'visualmaker-post-lock-output-v1',episodeId:'episode-001',scope:{projectId:'synthetic',revision:1,scriptSha256:'d'.repeat(64),snapshotSha256:'a'.repeat(64)},composition:{width:320,height:180,fps:30,durationFrames:12},binding,fingerprints:{},validators:[{name:'synthetic-mechanics-only',passed:true}],blockers:[],renderEligible:true,productionAuthority:false,reviewApproved:false};
  const contract={schemaVersion:'visualmaker-finalization-execution-v1',report,reportSha256:sha(JSON.stringify(report))};
  const result=await runFinalizationEngine({contract,rootDir:root,work:staging,signal:new AbortController().signal,onStage:()=>{}});
  assert.deepEqual(result.files.map(file=>file.name),['export.mp4','export.srt','export.vtt','export.png','export.json']);
  assert.equal(result.measured.videoPacketSha256,result.measured.sourceVideoPacketSha256);
  assert.equal(result.measured.audioPacketSha256,result.measured.sourceAudioPacketSha256);
  assert.deepEqual(result.measured.frameSha256,result.measured.sourceFrameSha256);
  assert.equal(result.measured.thumbnailFrameSha256,result.measured.sourceThumbnailFrameSha256);
  assert.deepEqual(result.measured.subtitleText,['Hello','world']);
  assert.deepEqual(result.measured.subtitleTimes,[{startMs:0,endMs:200},{startMs:200,endMs:400}]);
  assert.match(readFileSync(path.join(staging,'export.vtt'),'utf8'),/WEBVTT/);
  const receipt=JSON.parse(readFileSync(path.join(staging,'export.json'),'utf8'));assert.equal(receipt.reviewApproved,false);assert.equal(receipt.mix.mode,'passthrough');
  const altered={...report,binding:{...binding,sourceSha256:'0'.repeat(64)}};
  const alteredWork=path.join(data,'jobs','staging',randomUUID(),'work');mkdirSync(alteredWork,{recursive:true});
  await assert.rejects(runFinalizationEngine({contract:{schemaVersion:'visualmaker-finalization-execution-v1',report:altered,reportSha256:sha(JSON.stringify(altered))},rootDir:root,work:alteredWork,signal:new AbortController().signal,onStage:()=>{}}),/input-drift/);
  const stoppedWork=path.join(data,'jobs','staging',randomUUID(),'work');mkdirSync(stoppedWork,{recursive:true});const aborted=new AbortController();aborted.abort();
  await assert.rejects(runFinalizationEngine({contract,rootDir:root,work:stoppedWork,signal:aborted.signal,onStage:()=>{}}));
  assert.equal(existsSync(path.join(stoppedWork,'export.json')),false);
  writeFileSync(path.join(sourceDir,'provisional-voiced-episode.json'),'{"synthetic":false}\n');
  const driftWork=path.join(data,'jobs','staging',randomUUID(),'work');mkdirSync(driftWork,{recursive:true});
  await assert.rejects(runFinalizationEngine({contract,rootDir:root,work:driftWork,signal:new AbortController().signal,onStage:()=>{}}),/input-drift/);
  assert.equal(existsSync(path.join(driftWork,'export.json')),false);
});
