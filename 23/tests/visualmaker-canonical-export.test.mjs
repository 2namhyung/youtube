import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createCanonicalExportFixture,prepareCanonicalExportInputs,runFixtureGate} from './helpers/canonical-export-fixture.mjs';

test('canonical export fixture proceeds through normal production authority gates',t=>{
  const fixture=createCanonicalExportFixture();let completed=false;
  t.after(()=>{if(completed&&process.env.VISUALMAKER_KEEP_CANONICAL_PROOF!=='1')fixture.cleanup();else t.diagnostic(`Retained exact isolated technical evidence: ${fixture.proofPath}`);});
  prepareCanonicalExportInputs(fixture);
  runFixtureGate(fixture,process.execPath,['tests/helpers/canonical-export-child.mjs']);
  runFixtureGate(fixture,process.execPath,['video/scripts/generate-render-catalog.mjs']);
  const stageGate=runFixtureGate(fixture,process.execPath,['video/scripts/validate-production-stage.mjs','--lock','cut-review-approved'],{allowFailure:true});
  const firstGate=runFixtureGate(fixture,process.execPath,['video/scripts/validate-render-authority.mjs'],{allowFailure:true});
  assert.equal(stageGate.status,0,`Production cut-review gate failed:\n${stageGate.stdout}\n${stageGate.stderr}\nProof: ${fixture.proofPath}`);
  fixture.proof.achieved.push('Spec-bound active manifest with synthetic materialization and exact review bundles authored.','Unchanged render-catalog generator succeeded.','Unchanged canonical cut-review production validator passed with one active cut.');
  fixture.proof.notYetAttempted=['audio-timed stage full provisional/script/voice approval checks','normal audio enqueue/claim/execute','picture transition','finalization evaluator/FFmpeg export'];
  fixture.saveProof();
  // This validator reports editorial failures as text on stderr; nested stage
  // diagnostics are JSON. Keep both byte-for-byte instead of inventing a report.
  assert.equal(firstGate.status,0,`Canonical export is not yet proven. First production boundary failed:\n${firstGate.stdout}\n${firstGate.stderr}\nProof: ${fixture.proofPath}`);
  const evaluation=runFixtureGate(fixture,process.execPath,['tests/helpers/canonical-export-child.mjs','--pipeline'],{allowFailure:true});
  if(evaluation.status!==0){
    runFixtureGate(fixture,process.execPath,['video/scripts/validate-cut-assets.mjs','--require-cuts'],{allowFailure:true});
    runFixtureGate(fixture,process.execPath,['video/scripts/validate-production-stage.mjs','--lock','audio-timed-assembly'],{allowFailure:true});
  }
  assert.equal(evaluation.status,0,`Canonical pipeline failed at the recorded boundary: ${evaluation.stdout}\n${evaluation.stderr}\n${fixture.proofPath}`);
  runFixtureGate(fixture,process.execPath,['video/scripts/validate-episode-spec.mjs']);
  const success=JSON.parse(readFileSync(path.join(fixture.root,'canonical-export-success.json'),'utf8'));
  assert.match(success.provisionalJob,/^job_[a-f0-9-]{36}$/u);
  assert.match(success.audioJob,/^job_[a-f0-9-]{36}$/u);
  assert.match(success.finalizationJob,/^job_[a-f0-9-]{36}$/u);
  assert.equal(success.finalizationAttempt,4);
  assert.match(success.cancelledChildJob,/^job_[a-f0-9-]{36}$/u);
  assert.equal(success.childStartCancellationProved,true);
  assert.ok(success.apiCheckCount>=25);
  assert.equal(success.httpServerTested,false);
  assert.equal(success.browserTested,false);
  assert.equal(success.oldStrictReadersRejectStateDrift,true);
  assert.equal(success.newArchivalReaderPassed,true);
  assert.equal(success.negatives.length,6);
  assert.equal(success.productionAuthority,false);
  assert.equal(success.reviewApproved,false);
  assert.equal(success.genuineHumanApproval,false);
  fixture.proof.achieved.push('Normal imported project produced a published succeeded provisional job and verified receipt.','Normal audio enqueue/claim/worker published a succeeded measured audio job.','Only the permitted four state fields changed; strict old readers rejected drift and archival reader passed.','Actual readiness/jobs handlers dispatched a real finalization worker; atomic five-file publication and job-bound receipt verified.','Actual media handler full/range/sidecar responses and auth/scope/input rejection were verified; this is not an HTTP server or browser test.','Six altered source-input cases and five published-artifact mutations were rejected and restored.');
  fixture.proof.notYetAttempted=[];
  fixture.proof.coverageGaps=success.coverageGaps;
  fixture.proof.result=success;
  fixture.saveProof();
  completed=true;
});
