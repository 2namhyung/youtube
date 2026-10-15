import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan} from '../visualmaker/core/director.ts';
import {beginNarrationReload,IntervalEndMonitor,isCurrentNarrationScope,validateNarrationUploadResult} from '../src/components/studio/narration-client.ts';

function fixture(){
  const plan=createPlan('녹음 화면 검증','첫 문장입니다.');
  const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,epoch:2};
  const take={id:'take-test',projectId:plan.id,originalName:'voice.wav',format:'wav',mimeType:'audio/wav',
    byteCount:100,sha256:'a'.repeat(64),path:`narration/${'a'.repeat(64)}.wav`,durationSeconds:1.25,
    sampleRate:44100,channels:1,createdAt:new Date().toISOString(),capturedRevision:plan.revision,
    scriptSha256:plan.script.rawSha256,measurement:'ffprobe',alignmentStatus:'unavailable',productionAuthority:false};
  const saved={...plan,revision:plan.revision+1,narrationTakes:[take]};
  return {scope,response:{plan:saved,take,currentScriptMatch:true}};
}

test('a late upload cannot apply after project, revision, script, or request generation changes',()=>{
  const {scope}=fixture();
  assert.equal(isCurrentNarrationScope(scope,{...scope}),true);
  for(const changed of [{projectId:'other'},{revision:scope.revision+1},{scriptSha256:'b'.repeat(64)},{epoch:scope.epoch+1}]){
    assert.equal(isCurrentNarrationScope(scope,{...scope,...changed}),false);
  }
});

test('a busy reload cannot invalidate an upload and an actual reload advances the request generation',()=>{
  const {scope}=fixture();
  assert.equal(beginNarrationReload(scope,true),null);
  assert.equal(isCurrentNarrationScope(scope,scope),true);
  const next=beginNarrationReload(scope,false);
  assert.equal(next.epoch,scope.epoch+1);
  assert.equal(isCurrentNarrationScope(scope,next),false);
});

test('successful upload response must be bound to the expected project and script without authority',()=>{
  const {scope,response}=fixture();
  assert.equal(validateNarrationUploadResult(response,scope),response);
  const bad=[
    {...response,currentScriptMatch:false},
    {...response,plan:{...response.plan,id:'other'}},
    {...response,plan:{...response.plan,revision:scope.revision+2}},
    {...response,plan:{...response.plan,productionAuthority:true}},
    {...response,plan:{...response.plan,script:{...response.plan.script,rawSha256:'b'.repeat(64)}}},
    {...response,take:{...response.take,productionAuthority:true}},
    {...response,take:{...response.take,scriptSha256:'b'.repeat(64)}},
    {...response,plan:{...response.plan,narrationTakes:[]}},
  ];
  for(const value of bad) assert.throws(()=>validateNarrationUploadResult(value,scope),/현재 프로젝트|확인할 수/);
});

test('interval monitor stops at short end boundary and cancels work on cleanup or pause',()=>{
  let nextId=0;const frames=new Map();let ended=0;
  const monitor=new IntervalEndMonitor(callback=>{const id=++nextId;frames.set(id,callback);return id;},id=>frames.delete(id),()=>{ended+=1;});
  const audio={currentTime:0,paused:false,seeking:false,pause(){this.paused=true;}};
  const frame=()=>{const [id,callback]=frames.entries().next().value;frames.delete(id);callback();};
  monitor.start(audio,0.01);assert.equal(frames.size,1);
  audio.currentTime=0.009;frame();assert.equal(audio.paused,false);assert.equal(frames.size,1);
  audio.seeking=true;audio.currentTime=0.02;frame();assert.equal(audio.paused,false);
  audio.seeking=false;frame();assert.equal(audio.paused,true);assert.equal(audio.currentTime,0.01);assert.equal(ended,1);assert.equal(frames.size,0);
  audio.paused=false;monitor.start(audio,1);assert.equal(frames.size,1);monitor.stop();assert.equal(frames.size,0);
  monitor.start(audio,1);audio.paused=true;frame();assert.equal(frames.size,0);assert.equal(ended,1);
});
