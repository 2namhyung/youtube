import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,linkSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bindFinalizationMix,finalizationMixPayloadSha256,parseFinalizationMix} from '../visualmaker/core/finalization-mix.ts';
import {parseFinalizationSelection} from '../visualmaker/core/finalization.ts';
import {strictOwnedCleanup} from '../visualmaker/renderer/finalization-mix-adapter.ts';
import {runFixedGainMix} from '../visualmaker/renderer/fixed-gain-mix-engine.ts';
import {assertFinalizationV2StagingCapacity,cleanupFinalizationStagingAttempt} from '../visualmaker/core/jobs.ts';

const hash=value=>createHash('sha256').update(value).digest('hex');
const episode='video/episodes/episode-001/';
const source={job_id:'job_00000000-0000-0000-0000-000000000001',attempt:1,artifact_sha256:'a'.repeat(64),receipt_sha256:'b'.repeat(64)};
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'vm-fixed-gain-v2-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());if(existsSync(root))rmSync(root,{recursive:true,force:true});});return {root,put:(name,bytes)=>{const file=path.join(root,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,bytes);return file;}};}
function mix(stem){return {mode:'fixed-gain-stems',sample_rate:48000,channels:2,duration_samples:1000,voice_decoded_samples:1000,voice_tail_discard_samples:0,stems:[stem],approval_marker:`${episode}mix-approval.json`,approval_marker_sha256:'f'.repeat(64)};}
function stem(){return {id:'music',kind:'music',path:`${episode}music.wav`,sha256:'a'.repeat(64),bytes:10,decoded_samples:100,start_sample:0,gain_db:-20,source_url:'https://example.invalid/music',creator:'Fixture creator',license:'Synthetic fixture license',attribution:'Fixture music',rights_evidence_path:`${episode}rights.txt`,rights_evidence_sha256:'b'.repeat(64)};}

test('strict v2 mix selection binds explicit presented, decoded and codec tail counts',()=>{
  const valid=mix(stem());assert.equal(parseFinalizationMix(valid).duration_samples,1000);assert.match(finalizationMixPayloadSha256(valid),/^[a-f0-9]{64}$/u);
  for(const bad of [{...valid,voice_decoded_samples:1002},{...valid,voice_tail_discard_samples:1},{...valid,ducking:true},{...valid,stems:[{...stem(),gain_db:1}]},{...valid,stems:[{...stem(),start_sample:950}]}])assert.throws(()=>parseFinalizationMix(bad));
});

test('v2 readiness rejects unsupported literal caption syntax before a job can run',()=>{
  const selection={version:2,final_script:{path:`${episode}script.txt`,sha256:'c'.repeat(64)},source,picture_marker_sha256:'d'.repeat(64),captions:{segments:[{cut_id:'SH001',start_frame:0,end_frame:30,char_start:0,char_end:3,text:'한글 😀'}],approval_marker:`${episode}caption.json`,approval_marker_sha256:'e'.repeat(64)},thumbnail:{frame:0},mix:mix(stem())};
  assert.equal(parseFinalizationSelection(selection).version,2);
  for(const text of ['<b>','&amp;','{\\an8}'])assert.throws(()=>parseFinalizationSelection({...selection,captions:{...selection.captions,segments:[{...selection.captions.segments[0],text}]}}),/v2 자막/u);
});

test('rights evidence cannot alias the user mix marker through Windows case folding',t=>{
  const f=fixture(t),audio=Buffer.from('synthetic audio'),marker=Buffer.from('{"test_only":true}\n');
  f.put(`${episode}music.wav`,audio);f.put(`${episode}rights.txt`,marker);
  const item={...stem(),sha256:hash(audio),bytes:audio.length,rights_evidence_sha256:hash(marker)},value={...mix(item),approval_marker:`${episode}RIGHTS.TXT`,approval_marker_sha256:hash(marker)};
  const selection={version:2,final_script:{path:`${episode}script.txt`,sha256:'c'.repeat(64)},source,picture_marker_sha256:'d'.repeat(64),captions:{segments:[],approval_marker:`${episode}caption.json`,approval_marker_sha256:'e'.repeat(64)},thumbnail:{frame:0},mix:value};
  assert.throws(()=>bindFinalizationMix(f.root,selection,'f'.repeat(64),'e'.repeat(64),[]),/겹칩니다/);
});

test('hardlinked authority source cannot become a mix stem',t=>{
  const f=fixture(t),audio=Buffer.from('synthetic audio'),script=f.put(`${episode}script.txt`,audio);linkSync(script,path.join(f.root,`${episode}music.wav`));
  const rights=Buffer.from('synthetic permission text'),marker=Buffer.from('{"test_only":true}\n');f.put(`${episode}rights.txt`,rights);f.put(`${episode}mix-approval.json`,marker);
  const item={...stem(),sha256:hash(audio),bytes:audio.length,rights_evidence_sha256:hash(rights)},selection={version:2,final_script:{path:`${episode}script.txt`,sha256:hash(audio)},source,picture_marker_sha256:'d'.repeat(64),captions:{segments:[],approval_marker:`${episode}caption.json`,approval_marker_sha256:'e'.repeat(64)},thumbnail:{frame:0},mix:{...mix(item),approval_marker_sha256:hash(marker)}};
  assert.throws(()=>bindFinalizationMix(f.root,selection,'f'.repeat(64),'e'.repeat(64),[`${episode}script.txt`]),/실제 바이트|경로/);
});

test('owned temporary cleanup preserves a foreign collision even at an expected filename',t=>{
  const f=fixture(t),file=f.put('mixed.m4a',Buffer.from('foreign collision'));
  assert.equal(strictOwnedCleanup(f.root,new Map([['mixed.m4a','0:0']])),false);assert.deepEqual(readFileSync(file),Buffer.from('foreign collision'));
  const stat=lstatSync(file,{bigint:true}),owned=new Map([['mixed.m4a',`${stat.dev}:${stat.ino}`]]);
  assert.equal(strictOwnedCleanup(f.root,owned),true);assert.equal(existsSync(f.root),false);
});

test('v2 parent finally preserves an uncertain child staging collision on failure',t=>{
  const f=fixture(t),previous=process.env.VISUALMAKER_DATA_DIR;process.env.VISUALMAKER_DATA_DIR=f.root;t.after(()=>{if(previous===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=previous;});
  const staging=path.join(f.root,'jobs','staging','00000000-0000-0000-0000-000000000000'),foreign=path.join(staging,'vm-fixed-gain-v2-abcd','mixed.m4a');
  mkdirSync(path.dirname(foreign),{recursive:true});writeFileSync(foreign,'foreign collision');
  const stat=lstatSync(staging,{bigint:true}),identity=`${stat.dev}:${stat.ino}`;
  assert.equal(cleanupFinalizationStagingAttempt(staging,identity,true,false),'retained');assert.equal(readFileSync(foreign,'utf8'),'foreign collision');
  assert.equal(cleanupFinalizationStagingAttempt(staging,identity,true,true),'retained');assert.equal(readFileSync(foreign,'utf8'),'foreign collision');
  assert.equal(cleanupFinalizationStagingAttempt(f.root,identity,false,true),'retained');assert.equal(existsSync(f.root),true);
});

test('private mixer output option rejects a lookalike staging root outside actual data root',async t=>{
  const f=fixture(t),fake=path.join(f.root,'jobs','staging','00000000-0000-0000-0000-000000000000'),repository=path.join(fake,'vm-fixed-gain-v2-abcd'),output=path.join(repository,'vm-fixed-gain-output');
  mkdirSync(output,{recursive:true});
  const contract={schemaVersion:'visualmaker-fixed-gain-mix-v1',sampleRate:48000,channels:2,durationSamples:8,voice:{id:'voice',path:'voice.wav',sha256:'a'.repeat(64),bytes:100,decodedSamples:8,gainDb:0},stems:[{id:'music',kind:'music',path:'music.wav',sha256:'b'.repeat(64),bytes:100,decodedSamples:8,startSample:0,gainDb:-20}]};
  await assert.rejects(runFixedGainMix({contract,repositoryRoot:repository,outputDir:output,privateFinalizationStagingRoot:fake}),/ENOENT|fixed-gain-mix-output-root|fixed-gain-mix-path-link/u);
  assert.equal(requireEmpty(output),true);
});
function requireEmpty(dir){return !existsSync(path.join(dir,'technical-fixed-gain-mix.wav'))&&!existsSync(path.join(dir,'technical-fixed-gain-mix.json'));}

test('v2 staging admission blocks a fifth UUID attempt without touching retained bytes',t=>{
  const f=fixture(t),previous=process.env.VISUALMAKER_DATA_DIR;process.env.VISUALMAKER_DATA_DIR=f.root;t.after(()=>{if(previous===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=previous;});
  const parent=path.join(f.root,'jobs','staging'),retained=[];mkdirSync(parent,{recursive:true});
  for(let i=0;i<4;i++){const file=path.join(parent,`${String(i).padStart(8,'0')}-0000-0000-0000-000000000000`,'foreign.txt');mkdirSync(path.dirname(file));writeFileSync(file,`retained-${i}`);retained.push(file);}
  assert.throws(()=>assertFinalizationV2StagingCapacity(parent,100),/보존 시도 수/u);
  for(let i=0;i<4;i++)assert.equal(readFileSync(retained[i],'utf8'),`retained-${i}`);
  assert.throws(()=>assertFinalizationV2StagingCapacity(f.root,100),/저장소 경로/u);
});

test('v2 parent finally removes only a complete owned successful stage',t=>{
  const f=fixture(t),previous=process.env.VISUALMAKER_DATA_DIR;process.env.VISUALMAKER_DATA_DIR=f.root;t.after(()=>{if(previous===undefined)delete process.env.VISUALMAKER_DATA_DIR;else process.env.VISUALMAKER_DATA_DIR=previous;});
  const staging=path.join(f.root,'jobs','staging','11111111-1111-1111-1111-111111111111'),work=path.join(staging,'work');mkdirSync(work,{recursive:true});
  for(const name of ['contract.json','export.mp4','export.srt','export.vtt','export.png','export.json'])writeFileSync(path.join(work,name),name);
  const stat=lstatSync(staging,{bigint:true}),identity=`${stat.dev}:${stat.ino}`;
  assert.equal(cleanupFinalizationStagingAttempt(staging,identity,true,true),'removed');assert.equal(existsSync(staging),false);
});
