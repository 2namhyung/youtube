import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {APPROVAL_RUNTIME_FILES,SCENE_RUNTIME_FILES,TRANSITION_RUNTIME_FILES} from '../video/scripts/runtime-file-closure.mjs';
import {runtimeSha256,reviewBundleSha256} from '../video/scripts/visual-contract-v2.mjs';
import {sceneRuntimeSha256,transitionRuntimeSha256} from '../video/scripts/render-authority-lib.mjs';

const repo=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=(value)=>createHash('sha256').update(value).digest('hex');

test('shared approval closure covers all scene and transition files plus the production entrypoint',()=>{
  assert.equal(SCENE_RUNTIME_FILES.length,13);
  assert.equal(TRANSITION_RUNTIME_FILES.length,2);
  assert.equal(APPROVAL_RUNTIME_FILES.length,16);
  assert.equal(new Set(APPROVAL_RUNTIME_FILES).size,16);
  for(const file of [...SCENE_RUNTIME_FILES,...TRANSITION_RUNTIME_FILES,'video/src/production-index.tsx'])assert.ok(APPROVAL_RUNTIME_FILES.includes(file));
});

test('scene-only, transition-only and entrypoint mutations invalidate the old user approval bundle even after catalog hashes refresh',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'visual-runtime-approval-'));
  try{
    for(const relative of APPROVAL_RUNTIME_FILES){const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,await readFile(path.join(repo,relative)));}
    const manifest={schema_version:3,shot_id:'SH001',assets:[],effects:[],runtime_contract:{runtime_sha256:await runtimeSha256(root)},approvals:{generation_input:{status:'passed',user_pass:true,approved_bundle_sha256:'old',approval_marker:'old'}}};
    const cutRoot=path.join(root,'cut');
    const baselineRuntime=await runtimeSha256(root),baselineScene=await sceneRuntimeSha256(root),baselineTransition=await transitionRuntimeSha256(root);
    const rows=await Promise.all(APPROVAL_RUNTIME_FILES.map(async(relative)=>`${relative}|${hash(await readFile(path.join(root,relative)))}`));
    assert.equal(baselineRuntime,hash(rows.sort().join('\n')));
    const baselineBundle=await reviewBundleSha256({root,cutRoot,manifest});
    assert.equal(await runtimeSha256(root),baselineRuntime);
    assert.equal(await reviewBundleSha256({root,cutRoot,manifest}),baselineBundle);
    assert.notEqual(baselineRuntime,baselineScene);
    assert.notEqual(baselineRuntime,baselineTransition);
    for(const [relative,changes] of [
      ['video/src/vox/scene/presentation-runtime.ts',{scene:true,transition:false}],
      ['video/src/vox/scene/EpisodeTimeline.tsx',{scene:false,transition:true}],
      ['video/src/production-index.tsx',{scene:false,transition:false}],
    ]){
      const file=path.join(root,relative),before=await readFile(file);
      await writeFile(file,Buffer.concat([before,Buffer.from(`\n// approval-drift-${hash(relative).slice(0,8)}\n`)]));
      const refreshedRuntime=await runtimeSha256(root),refreshedScene=await sceneRuntimeSha256(root),refreshedTransition=await transitionRuntimeSha256(root);
      assert.notEqual(refreshedRuntime,baselineRuntime);
      assert.equal(refreshedScene!==baselineScene,changes.scene);
      assert.equal(refreshedTransition!==baselineTransition,changes.transition);
      manifest.runtime_contract.runtime_sha256=refreshedRuntime;
      assert.notEqual(await reviewBundleSha256({root,cutRoot,manifest}),baselineBundle,'regenerating catalog digests must not restore stale approval');
      await writeFile(file,before);
      manifest.runtime_contract.runtime_sha256=baselineRuntime;
      assert.equal(await reviewBundleSha256({root,cutRoot,manifest}),baselineBundle);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
