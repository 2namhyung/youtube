import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync,mkdtempSync,readFileSync,renameSync,rmdirSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareAIAnalysisBrowser,checkedPath,checkedRoot,deriveAdoptionMapping,proofName} from './helpers/prepare-ai-analysis-browser.mjs';
import {collectSourceClosure,validatePreparedFixture} from './helpers/ai-analysis-browser-server.mjs';
import {getProject} from '../visualmaker/core/store.ts';
import {cancelAIAnalysis} from '../visualmaker/core/ai-analysis-job.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function rejectsTamperedProof(root,mutate){
  const proofPath=checkedPath(root,proofName),original=readFileSync(proofPath);
  try{
    const proof=JSON.parse(original.toString('utf8'));mutate(proof);
    writeFileSync(proofPath,JSON.stringify(proof,null,2));
    assert.throws(()=>validatePreparedFixture(root));
  }finally{writeFileSync(proofPath,original);}
}

test('owned Temp preparation seeds only synthetic AI states and verifies stored bytes',async()=>{
  const {root,proof}=await prepareAIAnalysisBrowser();
  const reopened=validatePreparedFixture(root).proof;
  assert.deepEqual(reopened,proof);
  assert.equal(proof.liveProviderCalls,0);assert.equal(proof.mockCalls,2);
  assert.equal(proof.productionAuthority,false);assert.equal(proof.humanApproval,false);
  assert.deepEqual(Object.values(proof.jobs).map(job=>[job.status,job.outcome]),[
    ['queued','not-started'],['succeeded','succeeded'],['needs-review','needs-review'],['queued','not-started'],['cancelled','cancelled-before-call']]);
  assert.equal(sha(readFileSync(checkedPath(root,proofName))),sha(Buffer.from(JSON.stringify(proof,null,2))));
  assert.equal(sha(readFileSync(checkedPath(root,proof.proposal.path))),proof.proposal.compactJsonSha256);
  assert.throws(()=>checkedPath(root,'../outside'));
  assert.throws(()=>validatePreparedFixture(process.cwd()));
});

test('adoption variant prepares five source-bound segments with two eligible, one locked and one merged scene',async()=>{
  const {root,proof}=await prepareAIAnalysisBrowser({variant:'adoption'});
  const {proof:reopened}=validatePreparedFixture(root);
  assert.deepEqual(reopened,proof);
  assert.equal(proof.variant,'adoption');assert.equal(proof.liveProviderCalls,0);assert.equal(proof.mockCalls,2);
  assert.equal(proof.productionAuthority,false);assert.equal(proof.humanApproval,false);
  assert.equal(proof.initialPlanBytes>0,true);assert.equal(proof.initialPlanSha256,proof.snapshotSha256);
  assert.equal(proof.baselineHistoryCount,proof.revision);
  assert.equal(proof.adoptionMapping.eligible.length,2);
  assert.equal(proof.adoptionMapping.locked.sceneId.length>0,true);
  assert.equal(proof.adoptionMapping.merged.segments.length,2);
  assert.equal(proof.adoptionMapping.merged.segments[0].segmentId!==proof.adoptionMapping.merged.segments[1].segmentId,true);
  assert.equal(proof.proposal.bytes>0,true);
  assert.deepEqual(Object.values(proof.jobs).map(job=>[job.status,job.outcome]),[
    ['queued','not-started'],['succeeded','succeeded'],['needs-review','needs-review'],['queued','not-started'],['cancelled','cancelled-before-call']]);
  assert.deepEqual(deriveAdoptionMapping(getProject(proof.projectId)),proof.adoptionMapping);
});

test('preparation variant rejects unknown, extra and malformed arguments without a fixture fallback',async()=>{
  await assert.rejects(()=>prepareAIAnalysisBrowser({variant:'unknown'}),/Unknown AI browser fixture variant/u);
  await assert.rejects(()=>prepareAIAnalysisBrowser({variant:'adoption',unexpected:true}),/Unexpected preparation option/u);
  await assert.rejects(()=>prepareAIAnalysisBrowser(null),/Expected an options object/u);
  const script=fileURLToPath(new URL('./helpers/prepare-ai-analysis-browser.mjs',import.meta.url));
  const invalid=spawnSync(process.execPath,['--experimental-strip-types',script,'--variant','unknown'],{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Expected no arguments or --variant/u);assert.equal(invalid.stdout,'');
});

test('startup proof rejects variant downgrade, job omissions/additions and fabricated job or checkpoint state',async()=>{
  const {root}=await prepareAIAnalysisBrowser({variant:'adoption'});
  rejectsTamperedProof(root,proof=>{proof.variant='default';proof.adoptionMapping=null;});
  rejectsTamperedProof(root,proof=>{delete proof.jobs.needsReview;});
  rejectsTamperedProof(root,proof=>{proof.jobs.extra={...proof.jobs.cancelled};});
  rejectsTamperedProof(root,proof=>{proof.jobs.succeeded.status='queued';proof.jobs.succeeded.outcome='not-started';});
  rejectsTamperedProof(root,proof=>{proof.jobs.succeeded.attempt=0;});
  rejectsTamperedProof(root,proof=>{proof.jobs.currentQueued.requestedRevision-=1;});
  rejectsTamperedProof(root,proof=>{proof.jobs.staleQueued.responseSha256='a'.repeat(64);});
  assert.equal(validatePreparedFixture(root).proof.variant,'adoption');
});

test('adoption proof binds the selected locked direction candidate and review state',async()=>{
  const {root}=await prepareAIAnalysisBrowser({variant:'adoption'});
  rejectsTamperedProof(root,proof=>{proof.adoptionMapping.locked.selectedCandidateId='candidate-fabricated';});
  rejectsTamperedProof(root,proof=>{proof.adoptionMapping.locked.reviewStatus='draft';});
  assert.equal(validatePreparedFixture(root).proof.adoptionMapping.locked.reviewStatus,'direction-selected');
});

test('adoption baseline rejects cancellation of either queued job',async()=>{
  const {root,proof}=await prepareAIAnalysisBrowser({variant:'adoption'});
  cancelAIAnalysis(proof.projectId,proof.revision,proof.jobs.currentQueued.jobId);
  cancelAIAnalysis(proof.projectId,proof.revision,proof.jobs.staleQueued.jobId);
  assert.throws(()=>validatePreparedFixture(root));
});

test('current Studio static closure contains only bounded permitted source files',()=>{
  const sources=collectSourceClosure();
  assert.ok(sources.size>50&&sources.size<300);
  assert.ok(sources.has('src/app/studio/page.tsx'));
  assert.ok(sources.has('src/app/api/studio/ai-analysis/route.ts'));
  assert.ok(sources.has('src/app/api/studio/ai-analysis-adoption/route.ts'));
  assert.ok(sources.has('visualmaker/core/ai-analysis-job.ts'));
  assert.ok(sources.has('visualmaker/core/ai-analysis-adoption.ts'));
  assert.ok(sources.has('src/components/studio/ai-analysis-adoption-client.ts'));
  assert.ok(sources.has('src/components/studio/ai-analysis-panel.tsx'));
  assert.ok(sources.has('video/scripts/render-authority-lib.mjs'));
  assert.ok(sources.has('video/scripts/asset-sheet-contract.mjs'));
  for(const [relative,bytes] of sources){
    assert.ok(!relative.includes('.env')&&!relative.startsWith('raw/')&&!relative.startsWith('wiki/')&&!relative.startsWith('data/')&&!relative.includes('/episodes/'));
    assert.ok(bytes.length<2_000_000);
  }
});

test('a linked marker leaf is rejected before its outside target can establish ownership',async t=>{
  const {root}=await prepareAIAnalysisBrowser();
  const outside=mkdtempSync(path.join(os.tmpdir(),'vm-ai-browser-'));
  const sentinel=path.join(outside,'marker-sentinel.json');
  writeFileSync(sentinel,JSON.stringify({marker:'visualmaker-ai-browser-owned-v1',outside:true}),{flag:'wx'});
  const marker=path.join(root,'fixture-marker.json'),saved=path.join(root,'fixture-marker.saved.json');
  renameSync(marker,saved);
  try{
    try{symlinkSync(sentinel,marker,'file');}
    catch(error){
      if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`file symlink unavailable: ${error.code}`);return;}
      throw error;
    }
    assert.throws(()=>checkedRoot(root));
    assert.throws(()=>checkedPath(root,proofName));
    assert.equal(readFileSync(sentinel,'utf8'),JSON.stringify({marker:'visualmaker-ai-browser-owned-v1',outside:true}));
  }finally{
    try{unlinkSync(marker);}catch(error){if(error.code!=='ENOENT')throw error;}
    renameSync(saved,marker);
  }
});

test('a marker-leaf directory junction cannot establish ownership',async t=>{
  const {root}=await prepareAIAnalysisBrowser();
  const outside=mkdtempSync(path.join(os.tmpdir(),'vm-ai-browser-'));
  const sentinel=path.join(outside,'fixture-marker.json');
  writeFileSync(sentinel,JSON.stringify({marker:'visualmaker-ai-browser-owned-v1',outside:true}),{flag:'wx'});
  const marker=path.join(root,'fixture-marker.json'),saved=path.join(root,'fixture-marker.saved.json');
  assert.equal(checkedRoot(root),root);
  renameSync(marker,saved);
  let linked=false;
  try{
    try{symlinkSync(outside,marker,'junction');linked=true;}
    catch(error){
      if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`directory junction unavailable: ${error.code}`);return;}
      throw error;
    }
    assert.equal(lstatSync(marker).isSymbolicLink(),true);
    assert.throws(()=>checkedRoot(root),error=>error.code==='ERR_ASSERTION');
    assert.throws(()=>checkedPath(root,proofName),error=>error.code==='ERR_ASSERTION');
    assert.equal(readFileSync(sentinel,'utf8'),JSON.stringify({marker:'visualmaker-ai-browser-owned-v1',outside:true}));
  }finally{
    if(linked){assert.equal(lstatSync(marker).isSymbolicLink(),true);rmdirSync(marker);}
    renameSync(saved,marker);
  }
});
