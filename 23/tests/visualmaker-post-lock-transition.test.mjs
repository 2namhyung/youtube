import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureAudioAuthoritySnapshot,currentPictureStage,parsePostLockJson,POST_LOCK_SPEC,POST_LOCK_STATE,readPostLockAddendum,readPostLockFile,unchangedAudioFingerprints,validateAudioAuthoritySnapshot,validatePostLockTransition,verifyPostLockMarkers} from '../visualmaker/core/post-lock-transition.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value));
const ADDENDUM='video/episodes/episode-001/post-lock-addendum.json';
const PICTURE='video/episodes/episode-001/picture-approval.json';
const CAPTION='video/episodes/episode-001/caption-approval.json';
const SCRIPT='wiki/syntheses/approved-script.md';
function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'vm-post-lock-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const put=(relative,bytes)=>{const file=path.join(directory,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,bytes);return file;};return {directory,put};}
function setup(t){
  const f=fixture(t),script=Buffer.from('Approved narration'),spec={episode_id:'episode-001',script_lock:{source_path:SCRIPT,source_sha256:sha(script),status:'locked',reviewer:'user'},post_lock_output:{version:1,addendum_path:ADDENDUM}};
  const before={episode_id:'episode-001',stage:'audio-timed-assembly',picture_lock:{status:'pending',approved:false,final_qc_marker:null},other:{value:[1,{nested:true}]}};
  const specBytes=encode(spec),beforeBytes=encode(before);f.put(POST_LOCK_SPEC,specBytes);f.put(POST_LOCK_STATE,beforeBytes);f.put(SCRIPT,script);
  const report={renderEligible:true,visual:{fingerprints:{[POST_LOCK_SPEC]:sha(specBytes)}},fingerprints:{[POST_LOCK_STATE]:sha(beforeBytes),[SCRIPT]:sha(script)},validators:[{name:'validate-production-stage.mjs --lock audio-timed-assembly',passed:true}]};
  const snapshot=captureAudioAuthoritySnapshot(f.directory,report);
  const after={...before,stage:'picture-locked',picture_lock:{status:'locked',approved:true,final_qc_marker:PICTURE}};
  f.put(POST_LOCK_STATE,encode(after));
  return {...f,script,spec,before,after,specBytes,beforeBytes,report,snapshot};
}

test('strict JSON rejects duplicate keys, invalid UTF-8, nonfinite numbers and oversized input',()=>{
  assert.deepEqual(parsePostLockJson(Buffer.from('{"a":1,"b":{"c":2}}')),{a:1,b:{c:2}});
  for(const bytes of [Buffer.from('{"a":1,"a":2}'),Buffer.from('{"a":1,"\\u0061":2}'),Buffer.from('{"a":{"b":1,"b":2}}'),Buffer.from('{"a":1e999}'),Buffer.concat([Buffer.from('{"a":"'),Buffer.from([0xf0,0x90,0x80]),Buffer.from('"}')]),Buffer.alloc(3_000_001,0x20)])assert.throws(()=>parsePostLockJson(bytes));
});

test('immutable authority snapshot and exact pre/post picture transition reject unlisted changes',t=>{
  const f=setup(t),currentSpec=readFileSync(path.join(f.directory,POST_LOCK_SPEC)),currentState=readFileSync(path.join(f.directory,POST_LOCK_STATE));
  assert.deepEqual(validatePostLockTransition(f.snapshot,f.report,currentSpec,currentState,PICTURE),{specSha256:sha(f.specBytes),stateSha256:sha(currentState),preLockStateSha256:sha(f.beforeBytes)});
  assert.equal(unchangedAudioFingerprints(f.directory,f.report),true);
  const reordered={other:f.before.other,picture_lock:f.after.picture_lock,stage:'picture-locked',episode_id:'episode-001'};
  validatePostLockTransition(f.snapshot,f.report,currentSpec,encode(reordered),PICTURE);
  assert.throws(()=>validatePostLockTransition(f.snapshot,f.report,currentSpec,encode({...f.after,other:{value:[2]}}),PICTURE));
  assert.throws(()=>validatePostLockTransition(f.snapshot,f.report,currentSpec,encode({...f.after,picture_lock:{...f.after.picture_lock,extra:true}}),PICTURE));
  assert.throws(()=>validatePostLockTransition(f.snapshot,f.report,currentSpec,encode({...f.after,picture_lock:{...f.after.picture_lock,approved:false}}),PICTURE));
  assert.throws(()=>validatePostLockTransition(f.snapshot,f.report,encode({...f.spec,title:'drift'}),currentState,PICTURE));
  assert.throws(()=>validateAudioAuthoritySnapshot({...f.snapshot,episodeSpec:{...f.snapshot.episodeSpec,bytesBase64:'!!!!'}},f.report));
  assert.throws(()=>validateAudioAuthoritySnapshot({...f.snapshot,unknown:true},f.report));
  f.put(SCRIPT,'changed');assert.equal(unchangedAudioFingerprints(f.directory,f.report),false);
});

test('stable addendum locator and acyclic user markers bind exact source and caption bytes',t=>{
  const f=setup(t),source={job_id:`job_${randomUUID()}`,attempt:1,artifact_sha256:'a'.repeat(64),receipt_sha256:'b'.repeat(64)},segments=[{cut_id:'SH001',start_frame:0,end_frame:10,char_start:0,char_end:7,text:'Caption'}];
  const captionContractSha=sha(JSON.stringify({segments})),picture={schema_version:1,kind:'picture',episode_id:'episode-001',reviewer:'user',source,final_script_sha256:sha(f.script)};
  const pictureBytes=encode(picture);f.put(PICTURE,pictureBytes);
  const caption={...picture,kind:'caption',caption_contract_sha256:captionContractSha,picture_marker_sha256:sha(pictureBytes)};const captionBytes=encode(caption);f.put(CAPTION,captionBytes);
  const selection={version:1,final_script:{path:SCRIPT,sha256:sha(f.script)},source,picture_marker_sha256:sha(pictureBytes),captions:{segments,approval_marker:CAPTION,approval_marker_sha256:sha(captionBytes)},mix:{mode:'passthrough'},thumbnail:{frame:5}};
  const contractSha='c'.repeat(64),addendum={schema_version:1,episode_id:'episode-001',authority:{episode_spec_sha256:sha(f.specBytes),pre_lock_state_sha256:sha(f.beforeBytes),source_execution_contract_sha256:contractSha},selection};
  f.put(ADDENDUM,encode(addendum));
  const bound=readPostLockAddendum(f.directory,f.spec,sha(f.specBytes),sha(f.beforeBytes),contractSha);
  assert.equal(bound.selection.source.job_id,source.job_id);assert.equal(bound.sha256,sha(encode(addendum)));
  assert.deepEqual(verifyPostLockMarkers(f.directory,f.after,selection,sha(f.script)),{pictureSha256:sha(pictureBytes),captionSha256:sha(captionBytes),captionContractSha256:captionContractSha});
  assert.throws(()=>readPostLockAddendum(f.directory,f.spec,sha(f.specBytes),sha(f.beforeBytes),'d'.repeat(64)));
  f.put(ADDENDUM,encode({...addendum,extra:true}));assert.throws(()=>readPostLockAddendum(f.directory,f.spec,sha(f.specBytes),sha(f.beforeBytes),contractSha));
  assert.throws(()=>readPostLockAddendum(f.directory,{...f.spec,post_lock_output:{version:1,addendum_path:'../../outside.json'}},sha(f.specBytes),sha(f.beforeBytes),contractSha));
  assert.throws(()=>readPostLockFile(f.directory,'../../outside.json'));
});

test('real current picture-lock validator stays blocked on EP001',async()=>{
  assert.equal(await currentPictureStage(root),false);
});
