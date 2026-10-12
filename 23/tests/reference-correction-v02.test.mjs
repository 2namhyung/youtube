import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {applyReferenceCalibrationApproval} from '../video/scripts/apply-reference-calibration-approval-v01.mjs';
import {validateCorrectedSuite} from '../video/scripts/validate-motion-reverse-engineering-suite-v02.mjs';
import {validateCorrectedReview,validateReelIdentity} from '../video/scripts/validate-motion-reverse-engineering-review-v02.mjs';
import {validateReferenceCorrection} from '../video/scripts/validate-reference-correction-v02.mjs';
import {validateApprovalMarkerObjectV02,validateReferenceCalibrationApprovalV02} from '../video/scripts/validate-reference-calibration-approval-v02.mjs';

const ROOT=process.cwd();
const paths={suite:'video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json',review:'video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json',supersession:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json',calibrationMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',grammarMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-grammar-approval-v02.json',runtime:'video/src/motion-reverse-engineering-suite-v02.tsx',gates:'video/episodes/episode-001/reference-style-gates.json',grammar:'video/episodes/episode-001/reference-grammar-contract.json',binding:'video/episodes/episode-001/reference-grammar-binding.json',state:'video/episodes/episode-001/production-state.json'};
const sha=(value)=>createHash('sha256').update(value).digest('hex');
async function altered(key,mutate){const value=JSON.parse(await readFile(path.join(ROOT,paths[key]),'utf8'));await mutate(value);const dir=await mkdtemp(path.join(os.tmpdir(),'reference-correction-v02-'));const file=path.join(dir,`${key}.json`);await writeFile(file,`${JSON.stringify(value,null,2)}\n`);return{dir,file};}

test('canonical corrected suite and review remain immutable while approval state is current',async()=>{
  assert.deepEqual(await validateCorrectedSuite({verifyMedia:false}),{samples:9,corrected_samples:[8,9],excluded_sample:10});
  const reviewResult=await validateCorrectedReview({verifyMedia:false});
  assert.equal(reviewResult.review_status,'pending');
  const review=JSON.parse(await readFile(path.join(ROOT,paths.review),'utf8'));
  assert.equal(review.motion_contract_package.required,true);
  assert.deepEqual(review.motion_contract_package.active_contracts.map((row)=>row.sample_number),[1,2,3,4,5,6,7,8,9]);
  assert.equal(review.motion_contract_package.exclusion_contract.sample_number,10);
  const result=await validateReferenceCorrection({verifyMedia:false});
  assert.equal(result.status,'reference-calibration-passed');assert.equal(result.active_samples,9);assert.equal(result.excluded_sample,10);
  const [state,gates,blueprint,candidate]=await Promise.all([
    readFile(path.join(ROOT,paths.state),'utf8').then(JSON.parse),
    readFile(path.join(ROOT,paths.gates),'utf8').then(JSON.parse),
    readFile(path.join(ROOT,'video/episodes/episode-001/generated/reference-cut-blueprint.json'),'utf8').then(JSON.parse),
    readFile(path.join(ROOT,'video/qa/style-frames/episode-001/reference-style-families-v10/family-index.json'),'utf8'),
  ]);
  assert.equal(state.reference_style_gates.candidate_index,null);
  assert.equal(state.reference_style_gates.candidate_index_sha256,null);
  assert.equal(gates.historical_candidates.find((row)=>row.candidate_id==='reference-style-families-v10').sha256,sha(candidate));
  assert.equal(state.reference_style_gates.contract_sha256,sha(await readFile(path.join(ROOT,paths.gates))));
  assert.equal(state.reference_style_gates.cut_blueprint_sha256,sha(await readFile(path.join(ROOT,'video/episodes/episode-001/generated/reference-cut-blueprint.json'))));
  assert.equal(gates.status,'blocked-pending-source-approval-and-materialization');
  assert.equal(gates.reference_calibration.next_gate,'source-approval-and-materialization');
  assert.equal(blueprint.status,'blocked-pending-source-approval-and-materialization');
  assert.equal(gates.grammar_allowlist.all_samples_must_be_used,false);
  assert.equal(state.active_cut_root,null);
});

test('rejects any active sample10 row, probe, or grammar binding',async()=>{
  const suite=await altered('suite',(manifest)=>{manifest.sample_count=10;manifest.active_transferable_sample_numbers.push(10);manifest.samples.push({sample_number:10,sample_id:'sample-10-forged',probe:{path:'sample-10-remotion-probe.mp4'}});});
  try{await assert.rejects(()=>validateCorrectedSuite({manifestPath:suite.file,verifyMedia:false}),/exactly samples 01-09|no sample10 row|cannot appear/u);}finally{await rm(suite.dir,{recursive:true,force:true});}
  const grammar=await altered('grammar',(manifest)=>{manifest.bindings.push({sample_number:10,grammar_id:'forged'});manifest.approved_subset.push('forged');});
  try{await assert.rejects(()=>validateReferenceCorrection({grammar:grammar.file,verifyMedia:false}),/active grammar bindings\/subset must be empty|approved grammar categories\/bindings\/subset must exactly derive/u);}finally{await rm(grammar.dir,{recursive:true,force:true});}
});

test('rejects graphic/live-person reconstruction in corrected runtime',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'reference-correction-runtime-'));const file=path.join(dir,'runtime.tsx');
  const runtime=await readFile(path.join(ROOT,paths.runtime),'utf8');await writeFile(file,`${runtime}\nconst forged = <div data-suite-target="presenter-context">avatar silhouette</div>;\n`);
  try{await assert.rejects(()=>validateCorrectedSuite({runtimePath:file,verifyMedia:false}),/forbidden graphic\/live-person reconstruction/u);}finally{await rm(dir,{recursive:true,force:true});}
});

test('rejects a static shape inserted into the sample08 reserved presenter region',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'reference-correction-static-person-'));const file=path.join(dir,'runtime.tsx');
  const runtime=(await readFile(path.join(ROOT,paths.runtime),'utf8')).replace(/(<div data-suite-target="reserved-source-video-region"[^>]*)\/>/u,'$1><div style={{width: 180, height: 360, borderRadius: 90, background: "#17212b"}} /></div>');
  await writeFile(file,runtime);
  try{await assert.rejects(()=>validateCorrectedSuite({runtimePath:file,verifyMedia:false}),/empty self-closing element/u);}finally{await rm(dir,{recursive:true,force:true});}
});

test('rejects removal of sample08/09 presenter and internal-motion exclusions',async()=>{
  for(const number of [8,9]){
    const manifest=JSON.parse(await readFile(path.join(ROOT,paths.suite),'utf8'));const row=manifest.samples.find((item)=>item.sample_number===number);const analysis=JSON.parse(await readFile(path.join(ROOT,row.analysis.path),'utf8'));analysis.excluded_scope.pop();
    const dir=await mkdtemp(path.join(os.tmpdir(),'reference-correction-analysis-'));const analysisFile=path.join(dir,'analysis.json');await writeFile(analysisFile,`${JSON.stringify(analysis,null,2)}\n`);row.analysis.path=analysisFile;row.analysis.sha256=sha(await readFile(analysisFile));const manifestFile=path.join(dir,'manifest.json');await writeFile(manifestFile,`${JSON.stringify(manifest,null,2)}\n`);
    try{await assert.rejects(()=>validateCorrectedSuite({manifestPath:manifestFile,verifyMedia:false}),/presenter\/internal-motion exclusions incomplete/u);}finally{await rm(dir,{recursive:true,force:true});}
  }
});

test('rejects stale ten-sample approval reuse in corrected review and historical marker',async()=>{
  const review=await altered('review',(manifest)=>{manifest.human_pass=true;manifest.grammar_promoted=true;});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:review.file,verifySuite:false,verifyMedia:false}),/must not grant approval/u);}finally{await rm(review.dir,{recursive:true,force:true});}
  const marker=await altered('calibrationMarker',(manifest)=>{manifest.schema_version=1;manifest.marker_id='legacy-v01-marker';});
  try{await assert.rejects(()=>validateReferenceCorrection({calibrationMarker:marker.file,verifyMedia:false}),/v02 marker root schema|identity\/status\/reviewer/u);}finally{await rm(marker.dir,{recursive:true,force:true});}
  await assert.rejects(()=>applyReferenceCalibrationApproval(),/historical-only and cannot be reapplied/u);
});

test('rejects sample10 as an active review artifact',async()=>{
  const review=await altered('review',(manifest)=>{manifest.inputs.push({sample_number:10,kind:'probe',path:'sample-10-remotion-probe.mp4',sha256:'0'.repeat(64)});});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:review.file,verifySuite:false,verifyMedia:false}),/sample10 cannot enter active review inputs|input bundle drift/u);}finally{await rm(review.dir,{recursive:true,force:true});}
});

test('corrected review rejects missing, mismatched, or hash-rebound motion-contract inputs',async()=>{
  const missing=await altered('review',(manifest)=>{delete manifest.motion_contract_package;for(const row of manifest.samples)delete row.motion_contract;delete manifest.excluded_sample_10.motion_contract;manifest.inputs=manifest.inputs.filter((item)=>!item.kind.startsWith('motion-contract'));manifest.input_bundle_sha256=sha(Buffer.from(manifest.inputs.map((item)=>`${item.sample_number}|${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')));});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:missing.file,verifySuite:false,verifyMedia:false}),/mandatory contract manifest|matching immutable motion contracts|each exact contract/u);}finally{await rm(missing.dir,{recursive:true,force:true});}

  const rebound=await altered('review',(manifest)=>{const fake='f'.repeat(64);manifest.motion_contract_package.active_contracts[7].sha256=fake;manifest.samples[7].motion_contract.sha256=fake;const input=manifest.inputs.find((item)=>item.sample_number===8&&item.kind==='motion-contract');input.sha256=fake;manifest.input_bundle_sha256=sha(Buffer.from(manifest.inputs.map((item)=>`${item.sample_number}|${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')));});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:rebound.file,verifySuite:false,verifyMedia:false}),/active motion contract bindings|matching immutable motion contracts|each exact contract/u);}finally{await rm(rebound.dir,{recursive:true,force:true});}

  const wrongId=await altered('review',(manifest)=>{manifest.samples[8].motion_contract.contract_id='sample-09-rebound';});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:wrongId.file,verifySuite:false,verifyMedia:false}),/canonical suite evidence and immutable motion contracts/u);}finally{await rm(wrongId.dir,{recursive:true,force:true});}
});

test('corrected review validator owns suite identity and every canonical sample/evidence row',async()=>{
  const suiteRebind=await altered('review',(manifest)=>{manifest.suite={path:'video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json',sha256:'a'.repeat(64)};});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:suiteRebind.file,verifySuite:false,verifyMedia:false}),/validator-owned exact path\/hash/u);}finally{await rm(suiteRebind.dir,{recursive:true,force:true});}
  const rowMutation=await altered('review',(manifest)=>{manifest.samples[0].sample_id='sample-01-relabeled';manifest.samples[0].analysis=structuredClone(manifest.samples[1].analysis);});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:rowMutation.file,verifySuite:false,verifyMedia:false}),/exactly match canonical suite evidence/u);}finally{await rm(rowMutation.dir,{recursive:true,force:true});}
  const sample10Leak=await altered('review',(manifest)=>{manifest.excluded_sample_10.sample_id='sample-10-remotion-relabel';manifest.excluded_sample_10.analysis=structuredClone(manifest.samples[0].analysis);});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:sample10Leak.file,verifySuite:false,verifyMedia:false}),/canonical source-video exclusion acknowledgement/u);}finally{await rm(sample10Leak.dir,{recursive:true,force:true});}
});

test('corrected review exact input inventory rejects deletion, extra, and output hash rebinding',async()=>{
  const rehash=(manifest)=>{manifest.input_bundle_sha256=sha(Buffer.from(manifest.inputs.map((item)=>`${item.sample_number}|${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')));};
  const deleted=await altered('review',(manifest)=>{manifest.inputs.pop();rehash(manifest);});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:deleted.file,verifySuite:false,verifyMedia:false}),/input inventory must exactly equal/u);}finally{await rm(deleted.dir,{recursive:true,force:true});}
  const extra=await altered('review',(manifest)=>{manifest.inputs.push({sample_number:0,kind:'alternate-board',path:manifest.board.path,sha256:manifest.board.sha256});rehash(manifest);});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:extra.file,verifySuite:false,verifyMedia:false}),/input inventory must exactly equal/u);}finally{await rm(extra.dir,{recursive:true,force:true});}
  const rebound=await altered('review',(manifest)=>{const fake='d'.repeat(64);manifest.board.sha256=fake;manifest.inputs.find((item)=>item.kind==='review-board').sha256=fake;rehash(manifest);});
  try{await assert.rejects(()=>validateCorrectedReview({manifestPath:rebound.file,verifySuite:false,verifyMedia:false}),/active board\/reel records|input inventory must exactly equal/u);}finally{await rm(rebound.dir,{recursive:true,force:true});}
});

test('reel identity is exhaustive and rejects a rebound mutation in an unchecked middle byte',async()=>{
  const suite=JSON.parse(await readFile(path.join(ROOT,paths.suite),'utf8'));
  const review=JSON.parse(await readFile(path.join(ROOT,paths.review),'utf8'));
  const canonical=await validateReelIdentity({actualPath:review.reel.path,sourcePaths:suite.samples.map((row)=>row.side_by_side.path),frames:2700});
  assert.equal(canonical.valid,true);
  const dir=await mkdtemp(path.join(os.tmpdir(),'reference-reel-mutation-'));
  const mutatedFile=path.join(dir,'review-reel-rebound.mp4');
  try{
    const bytes=Buffer.from(await readFile(path.join(ROOT,review.reel.path)));bytes[Math.floor(bytes.length/2)]^=1;await writeFile(mutatedFile,bytes);
    const reboundSha=sha(bytes);assert.notEqual(reboundSha,review.reel.sha256);
    const result=await validateReelIdentity({actualPath:mutatedFile,sourcePaths:suite.samples.map((row)=>row.side_by_side.path),frames:2700});
    assert.equal(result.valid,false);assert.equal(result.actualSha256,reboundSha);assert.equal(result.verifiedFrames,2700);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('v02 approval route validates only the current exact explicit user decisions',async()=>{
  const current=await validateReferenceCalibrationApprovalV02({verifyMedia:false,requireMarker:true});
  assert.deepEqual({status:current.status,valid:current.valid},{status:'valid-explicit-human-marker',valid:true});
  const review=JSON.parse(await readFile(path.join(ROOT,paths.review),'utf8')),gates=JSON.parse(await readFile(path.join(ROOT,paths.gates),'utf8'));
  const reviewSha=sha(await readFile(path.join(ROOT,paths.review))),markerSha='e'.repeat(64);
  gates.reference_calibration.approval_marker='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json';gates.reference_calibration.approval_marker_sha256=markerSha;
  const marker={schema_version:2,marker_id:'reference-calibration-approval-v02-nine-active-plus-one-exclusion',status:'human-approved',reviewer:'user',reviewed_package:{path:paths.review,sha256:reviewSha,package_id:review.package_id,input_bundle_sha256:review.input_bundle_sha256},motion_contract_package:structuredClone(review.motion_contract_package),approved_inputs:structuredClone(review.inputs),approved_inputs_sha256:review.input_bundle_sha256,sample_decisions:review.samples.map((row)=>({sample_number:row.sample_number,sample_id:row.sample_id,decision:'PASS',contract_id:row.motion_contract.contract_id,contract_sha256:row.motion_contract.sha256,side_by_side_path:row.side_by_side.path,side_by_side_sha256:row.side_by_side.sha256,contact_path:row.contact.path,contact_sha256:row.contact.sha256})),sample10_exclusion_acknowledgement:{sample_number:10,sample_id:review.excluded_sample_10.sample_id,decision:'ACKNOWLEDGED-SOURCE-VIDEO-EXCLUSION',contract_id:review.excluded_sample_10.motion_contract.contract_id,contract_sha256:review.excluded_sample_10.motion_contract.sha256,review_frame_path:review.excluded_sample_10.review_frame.path,review_frame_sha256:review.excluded_sample_10.review_frame.sha256},non_grants:{production_authority:false,cut_pass:false,omni_video_generation:false,active_cut_root:null}};
  assert.deepEqual(validateApprovalMarkerObjectV02({marker,markerSha,review,reviewSha,gates}),[]);
  for(const mutate of [(value)=>{value.reviewer='automation';},(value)=>{value.sample_decisions.pop();},(value)=>{value.sample10_exclusion_acknowledgement.decision='PASS';},(value)=>{value.motion_contract_package.active_contracts[0].sha256='f'.repeat(64);},(value)=>{value.legacy_v01_pass=true;}]){const forged=structuredClone(marker);mutate(forged);assert.notEqual(validateApprovalMarkerObjectV02({marker:forged,markerSha,review,reviewSha,gates}).length,0);}
});

test('historical audit rejects stale, partial, and v01 calibration markers',async()=>{
  for(const [label,mutate] of [['stale',(marker)=>{marker.reviewed_package.sha256='a'.repeat(64);}],['partial',(marker)=>{marker.sample_decisions.pop();}],['v01',(marker)=>{marker.schema_version=1;marker.marker_id='legacy-v01-marker';}]]){
    const marker=await altered('calibrationMarker',mutate);
    try{await assert.rejects(()=>validateReferenceCorrection({calibrationMarker:marker.file,verifyMedia:false}),/v02 marker|candidate review|PASS decisions|root schema|identity/u,label);}finally{await rm(marker.dir,{recursive:true,force:true});}
  }
  const legacy=await altered('gates',(gates)=>{gates.reference_calibration.approval_route='motion-reverse-engineering-review-v01';});
  try{
    const style=spawnSync(process.execPath,['video/scripts/validate-reference-style-gates.mjs','--contract',legacy.file],{cwd:ROOT,encoding:'utf8',windowsHide:true});
    assert.notEqual(style.status,0);assert.match(style.stderr,/legacy v01 reference approval route is historical-only and disabled|contract binding drift/u);
  }finally{await rm(legacy.dir,{recursive:true,force:true});}
});

test('canonical CLI rejects alternate marker roots and historical grammar marker tampering',async()=>{
  const alternate=spawnSync(process.execPath,['video/scripts/validate-reference-style-gates.mjs','--approval-marker-root',os.tmpdir()],{cwd:ROOT,encoding:'utf8',windowsHide:true});
  assert.notEqual(alternate.status,0);assert.match(alternate.stderr,/unsupported or incomplete CLI option: --approval-marker-root/u);
  await assert.rejects(()=>validateReferenceCalibrationApprovalV02({markerPath:path.join(os.tmpdir(),'alternate-marker.json'),verifyMedia:false}),/canonical explicit path/u);

  const marker=await altered('grammarMarker',(value)=>{value.reviewer='automation';});
  try{await assert.rejects(()=>validateReferenceCorrection({grammarMarker:marker.file,verifyMedia:false}),/exact user-reviewed v02 promotion marker|grammar review\/marker binding/u);}finally{await rm(marker.dir,{recursive:true,force:true});}
});

test('correction validator owns full supersession rows and pending grammar semantics',async()=>{
  const supersession=await altered('supersession',(record)=>{record.carried_forward_candidates[0].contact_sha256='a'.repeat(64);record.invalidated_samples[2].reason='generic';record.non_grants.active_cut_root=false;});
  try{await assert.rejects(()=>validateReferenceCorrection({supersession:supersession.file,verifyMedia:false}),/supersession full canonical semantics/u);}finally{await rm(supersession.dir,{recursive:true,force:true});}
  const grammar=await altered('grammar',(record)=>{record.purpose='mutated pending semantics';});
  try{await assert.rejects(()=>validateReferenceCorrection({grammar:grammar.file,verifyMedia:false}),/approved v02 grammar root schema|pending grammar exact semantics/u);}finally{await rm(grammar.dir,{recursive:true,force:true});}
});

test('historical audit does not consume current downstream gate, state, or blueprint',async()=>{
  const result=await validateReferenceCorrection({gates:'missing-gates.json',state:'missing-state.json',blueprint:'missing-blueprint.json',verifyMedia:false});
  assert.equal(result.status,'reference-calibration-passed');
});

test('supersession command is an idempotent validating no-op after application',async()=>{
  const before=sha(await readFile(path.join(ROOT,paths.state)));
  const result=spawnSync(process.execPath,['video/scripts/supersede-reference-calibration-for-v02.mjs'],{cwd:ROOT,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/already applied; historical v02 chain validated; no files changed/u);
  assert.equal(sha(await readFile(path.join(ROOT,paths.state))),before);
});
