import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,symlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {buildFixtureEnvironment,checkedPath,checkedRoot,collectSourceClosure,prepareBackupBrowserFixture,proofName,validatePreparedFixture} from './helpers/prepare-backup-browser.mjs';
import {validateOwnedServerRecord} from './helpers/backup-browser-server.mjs';

test('synthetic backup fixture has strict hashes, real measured media, and unchanged unrelated project',async t=>{
  const {root,proof}=await prepareBackupBrowserFixture();
  const {plan,unrelated}=validatePreparedFixture(root);
  assert.equal(checkedRoot(root),root);assert.equal(plan.id,proof.projectId);assert.equal(plan.revision,proof.revision);
  assert.equal(unrelated.id,proof.unrelatedProjectId);assert.equal(proof.baseline.counts.jobs,0);assert.equal(proof.baseline.counts.attempts,0);
  assert.equal(plan.assets.length,3);assert.equal(proof.media.assets.length,3);assert.equal(plan.narrationTakes[0].measurement,'ffprobe');
  assert.equal(proof.backup.sourceProjectId,plan.id);assert.equal(proof.backup.sourceRevision,plan.revision);
  assert.ok(proof.sourceInventory.length>0);assert.equal(proof.sourceInventory.some(item=>item.path.startsWith('raw/')||item.path.startsWith('wiki/')||item.path.startsWith('data/')),false);
  await t.test('path and marker checks reject traversal, links, and forged proof hashes',()=>{
    assert.throws(()=>checkedPath(root,'../outside'));
    const target=checkedPath(root,'link-target');mkdirSync(target);const link=checkedPath(root,'link-inside');
    try{symlinkSync(target,link,'junction');assert.throws(()=>checkedPath(root,'link-inside/anything'));}
    catch(error){if(error.code!=='EPERM'&&error.code!=='EACCES'&&error.code!=='ENOTSUP')throw error;}
    const proofPath=checkedPath(root,proofName),original=readFileSync(proofPath,'utf8'),forged=JSON.parse(original);forged.backup.sha256='0'.repeat(64);
    writeFileSync(proofPath,JSON.stringify(forged),{flag:'w'});assert.throws(()=>validatePreparedFixture(root));writeFileSync(proofPath,original,{flag:'w'});
    assert.doesNotThrow(()=>validatePreparedFixture(root));
  });
  await t.test('source closure and environment reject private inputs and inherited provider secrets',()=>{
    const sources=collectSourceClosure();assert.ok(sources.size>0);
    for(const relative of sources.keys())assert.equal(/(?:^|\/)(?:\.env[^/]*|raw|wiki|data|generated|episodes)(?:\/|$)|\.(?:png|jpe?g|webp|wav|mp3|sqlite)$/iu.test(relative),false,relative);
    const env=buildFixtureEnvironment(proof.dataRoot,{PATH:'synthetic-path',OPENAI_API_KEY:'do-not-copy',ANTHROPIC_API_KEY:'do-not-copy',AI_GATEWAY_API_KEY:'do-not-copy',USERPROFILE:'synthetic-profile'});
    assert.deepEqual(Object.keys(env).sort(),['NODE_ENV','NEXT_TELEMETRY_DISABLED','VISUALMAKER_AI_ENABLED','VISUALMAKER_DATA_DIR','PATH','USERPROFILE'].sort());
    assert.equal(env.VISUALMAKER_DATA_DIR,proof.dataRoot);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.AI_GATEWAY_API_KEY,undefined);
  });
  await t.test('server record must be bound to this fixture and a non-user port',()=>{
    const runDir=checkedPath(root,`browser-run-${proof.runId}`);mkdirSync(runDir);
    const record={schemaVersion:'visualmaker-backup-browser-server-v1',runId:proof.runId,root,appRoot:root,dataRoot:proof.dataRoot,runDir,
      url:'http://127.0.0.1:18081/studio',port:18081,supervisorPid:10,childPid:11,sourceInventorySha256:'a'.repeat(64),sourceFiles:2,startedAt:new Date().toISOString(),state:'ready'};
    assert.doesNotThrow(()=>validateOwnedServerRecord(root,record));assert.throws(()=>validateOwnedServerRecord(root,{...record,port:8138,url:'http://127.0.0.1:8138/studio'}));
    assert.throws(()=>validateOwnedServerRecord(root,{...record,runId:'00000000-0000-0000-0000-000000000000'}));
  });
});
