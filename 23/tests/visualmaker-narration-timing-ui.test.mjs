import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan} from '../visualmaker/core/director.ts';
import {createManualTimingDraft,narrationTimingReport} from '../visualmaker/core/narration-timing.ts';
import {parseTimingInputs,validateTimingExport,validateTimingReport,validateTimingSave} from '../src/components/studio/narration-timing-client.ts';

function fixture(){
  const plan=createPlan('시간 초안 UI 검증','첫 문장입니다.\n\n[메모] 화면 메모입니다.\n\n두 번째 문장입니다.');
  const take={id:'take-timing-test',projectId:plan.id,originalName:'test.wav',format:'wav',mimeType:'audio/wav',
    byteCount:100,sha256:'b'.repeat(64),path:`narration/${'b'.repeat(64)}.wav`,durationSeconds:3,
    sampleRate:44100,channels:1,createdAt:new Date().toISOString(),capturedRevision:plan.revision,
    scriptSha256:plan.script.rawSha256,measurement:'ffprobe',alignmentStatus:'unavailable',productionAuthority:false};
  plan.narrationTakes=[take];
  const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,epoch:3};
  return {plan,take,scope};
}

test('timing GET estimate is accepted only for exact current project, take and non-authoritative ranges',()=>{
  const {plan,take,scope}=fixture();
  const report=narrationTimingReport(plan,take.id);
  assert.equal(validateTimingReport(report,plan,take,scope),report);
  assert.equal(report.estimate.segments.length,2);
  for(const changed of [
    {...report,projectId:'other'},
    {...report,revision:scope.revision+1},
    {...report,take:{...take,sha256:'c'.repeat(64)}},
    {...report,productionAuthority:true},
    {...report,estimate:{...report.estimate,observedSpeech:true}},
    {...report,estimate:{...report.estimate,segments:[...report.estimate.segments,{...report.estimate.segments[0]}]}},
  ])assert.throws(()=>validateTimingReport(changed,plan,take,scope));
});

test('number input conversion rejects blank, nonfinite, reverse, overlap and out-of-duration values',()=>{
  const valid=[{segmentId:'a',startSeconds:'0',endSeconds:'1.25'},{segmentId:'b',startSeconds:'1.5',endSeconds:'3'}];
  assert.deepEqual(parseTimingInputs(valid,3),[{segmentId:'a',startSeconds:0,endSeconds:1.25},{segmentId:'b',startSeconds:1.5,endSeconds:3}]);
  for(const rows of [
    [{...valid[0],startSeconds:''},valid[1]],
    [{...valid[0],endSeconds:'NaN'},valid[1]],
    [{...valid[0],endSeconds:'-1'},valid[1]],
    [valid[0],{...valid[1],startSeconds:'1'}],
    [valid[0],{...valid[1],endSeconds:'3.001'}],
  ])assert.throws(()=>parseTimingInputs(rows,3));
});

test('saved timing response and JSON export remain bound to the current script and audio',()=>{
  const {plan,take,scope}=fixture();
  const report=narrationTimingReport(plan,take.id);
  const timing=createManualTimingDraft(plan,take,report.estimate.segments.map(row=>({segmentId:row.segmentId,startSeconds:row.startSeconds,endSeconds:row.endSeconds})),true);
  const savedPlan={...plan,revision:plan.revision+1,narrationTimings:[timing]};
  assert.equal(validateTimingSave({plan:savedPlan,timing},plan,take,scope).timing.id,timing.id);
  assert.equal(validateTimingExport({exportKind:'provisional-narration-timing-draft',timing,productionAuthority:false},plan,take,timing.id).timing.id,timing.id);
  const currentReport=narrationTimingReport(savedPlan,take.id);
  assert.equal(validateTimingReport(currentReport,savedPlan,take,{...scope,revision:savedPlan.revision}),currentReport);
  assert.throws(()=>validateTimingSave({plan:{...savedPlan,productionAuthority:true},timing},plan,take,scope));
  assert.throws(()=>validateTimingSave({plan:savedPlan,timing:{...timing,reviewStatus:'approved'}},plan,take,scope));
  assert.throws(()=>validateTimingExport({exportKind:'provisional-narration-timing-draft',timing,productionAuthority:true},plan,take,timing.id));
});
