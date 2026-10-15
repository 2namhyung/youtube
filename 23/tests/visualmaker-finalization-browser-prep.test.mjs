import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {validatePreparedV2Proof} from './helpers/finalization-browser-server.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const plan={id:'synthetic-plan',revision:1,productionAuthority:false};
const proof={schemaVersion:'visualmaker-synthetic-v2-browser-prepared-v1',test_only:true,genuineHumanApproval:false,finalizationExecuted:false,browserTested:false,projectId:plan.id,revision:plan.revision,planSnapshotSha256:sha(JSON.stringify(plan)),selectionVersion:2,renderEligible:true,productionAuthority:false,reviewApproved:false,database:{finalizationJobs:0,finalizationArtifacts:0}};

test('prepared browser proof accepts only fresh pre-finalization v2 state',()=>{
  assert.doesNotThrow(()=>validatePreparedV2Proof(proof,plan,sha));
  for(const changed of [
    {finalizationExecuted:true},{browserTested:true},{genuineHumanApproval:true},
    {selectionVersion:1},{planSnapshotSha256:'0'.repeat(64)},
    {database:{finalizationJobs:1,finalizationArtifacts:0}},
    {database:{finalizationJobs:0,finalizationArtifacts:1}},
  ])assert.throws(()=>validatePreparedV2Proof({...proof,...changed},plan,sha));
});
