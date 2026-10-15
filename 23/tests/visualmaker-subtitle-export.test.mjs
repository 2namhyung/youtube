import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlan,validatePlan} from '../visualmaker/core/director.ts';
import {attachNarrationUpload} from '../visualmaker/core/narration.ts';
import {createManualTimingDraft,estimateNarrationTiming,serializeSubtitleDraft} from '../visualmaker/core/narration-timing.ts';
import {getProject,insertProject,saveNarrationTiming} from '../visualmaker/core/store.ts';
import {currentSubtitleDownload,validateSubtitleDownload,validateTimingExport} from '../src/components/studio/narration-timing-client.ts';

function wav(seconds=2){
  const rate=8000,payload=Math.round(rate*seconds)*2,bytes=Buffer.alloc(44+payload);
  bytes.write('RIFF',0);bytes.writeUInt32LE(36+payload,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);
  bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
  bytes.write('data',36);bytes.writeUInt32LE(payload,40);return bytes;
}
function setup(text='한글 😀 & <b>굵게</b> --> 첫째.\n같은 문단 둘째 줄.\n\n다음 문장입니다.'){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-subtitle-'));
  const initial=insertProject(createPlan('자막 초안',text));
  const {plan,take}=attachNarrationUpload(initial.id,initial.revision,initial.script.rawSha256,'fixture.wav',wav());
  const estimate=estimateNarrationTiming(plan,take);
  const rows=estimate.segments.map(row=>({segmentId:row.segmentId,startSeconds:row.startSeconds,endSeconds:row.endSeconds}));
  return {initial,plan,take,rows};
}
function headers(plan,take,timing,format,body){return {'Content-Type':format==='srt'?'application/x-subrip; charset=utf-8':'text/vtt; charset=utf-8',
  'Content-Disposition':`attachment; filename="subtitle-draft-${timing.id}.${format}"`,'Content-Length':String(Buffer.byteLength(body)),
  'Cache-Control':'no-store','X-Visualmaker-Schema':'visualmaker-subtitle-draft-v1','X-Visualmaker-Project-Id':plan.id,
  'X-Visualmaker-Revision':String(plan.revision),'X-Visualmaker-Take-Id':take.id,'X-Visualmaker-Timing-Id':timing.id,
  'X-Visualmaker-Script-Sha256':plan.script.rawSha256,'X-Visualmaker-Audio-Sha256':take.sha256,
  'X-Visualmaker-Production-Authority':'false'};}

test('real saved confirmed draft produces exact paragraph SRT/VTT, literal-safe Korean and Unicode, no title cue',()=>{
  const f=setup();
  assert.throws(()=>saveNarrationTiming(f.plan.id,f.plan.revision,f.take.id,f.plan.script.rawSha256,f.take.sha256,f.rows,false));
  assert.equal(getProject(f.plan.id).revision,f.plan.revision);
  const {plan,timing}=saveNarrationTiming(f.plan.id,f.plan.revision,f.take.id,f.plan.script.rawSha256,f.take.sha256,f.rows,true);
  assert.equal(timing.manualReviewConfirmed,true);
  assert.match(timing.manualReviewConfirmedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(plan.scenes,f.plan.scenes);
  const srt=serializeSubtitleDraft(plan,f.take,timing,'srt'),vtt=serializeSubtitleDraft(plan,f.take,timing,'vtt');
  assert.match(srt,/^1\n00:00:00,000 --> /);assert.match(vtt,/^WEBVTT\n\n00:00:00\.000 --> /);
  assert.match(srt,/한글 😀 &amp; &lt;b&gt;굵게&lt;\/b&gt; --&gt; 첫째\./);
  assert.ok(srt.includes('첫째.'));assert.ok(srt.includes('같은 문단 둘째 줄.'));
  assert.ok(!srt.includes('자막 초안'));assert.ok(!vtt.includes('manualReviewConfirmed'));
  const scope={projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,epoch:7};
  for(const [format,body] of [['srt',srt],['vtt',vtt]]){
    const bytes=new TextEncoder().encode(body),response=new Response(body,{headers:headers(plan,f.take,timing,format,body)});
    assert.equal(validateSubtitleDownload(response,bytes,plan,f.take,timing,scope,format),body);
    const wrong=new Response(body,{headers:{...headers(plan,f.take,timing,format,body),'X-Visualmaker-Project-Id':'other'}});
    assert.throws(()=>validateSubtitleDownload(wrong,bytes,plan,f.take,timing,scope,format));
    assert.throws(()=>validateSubtitleDownload(response,bytes.subarray(0,bytes.length-1),plan,f.take,timing,scope,format));
  }
  assert.equal(currentSubtitleDownload(scope,scope,false),true);
  assert.equal(currentSubtitleDownload(scope,{...scope,revision:scope.revision+1},false),false);
  assert.equal(currentSubtitleDownload(scope,scope,true),false);
});

test('server and client agree on canonical UTC millisecond confirmation timestamps',()=>{
  const f=setup();const {plan,timing}=saveNarrationTiming(f.plan.id,f.plan.revision,f.take.id,f.plan.script.rawSha256,f.take.sha256,f.rows,true);
  const exported=value=>({exportKind:'provisional-narration-timing-draft',timing:value,productionAuthority:false});
  assert.equal(validatePlan(plan).narrationTimings[0].manualReviewConfirmedAt,timing.manualReviewConfirmedAt);
  assert.equal(validateTimingExport(exported(timing),plan,f.take,timing.id).timing.manualReviewConfirmedAt,timing.manualReviewConfirmedAt);
  for(const stamp of ['2026-10-13T12:00:00Z','2026-02-30T12:00:00.000Z','2026-10-13T12:00:00.12Z',
    '2026-10-13T12:00:00.000+00:00','2026-13-13T12:00:00.000Z']){
    const changed={...timing,manualReviewConfirmedAt:stamp};
    assert.throws(()=>validatePlan({...plan,narrationTimings:[changed]}),stamp);
    assert.throws(()=>validateTimingExport(exported(changed),plan,f.take,timing.id),stamp);
  }
});

test('legacy timing remains valid JSON but is not silently promoted into a caption export',()=>{
  const f=setup();const saved=saveNarrationTiming(f.plan.id,f.plan.revision,f.take.id,f.plan.script.rawSha256,f.take.sha256,f.rows,true);
  const legacy={...saved.timing};delete legacy.manualReviewConfirmed;delete legacy.manualReviewConfirmedAt;
  const historical=validatePlan({...saved.plan,narrationTimings:[legacy]});
  assert.equal(historical.narrationTimings[0].manualReviewConfirmed,undefined);
  assert.equal(validateTimingExport({exportKind:'provisional-narration-timing-draft',timing:legacy,productionAuthority:false},historical,f.take,legacy.id).timing.id,legacy.id);
  assert.throws(()=>serializeSubtitleDraft(historical,f.take,legacy,'srt'),/수동 구간 확인/);
  for(const changed of [
    {...saved.timing,manualReviewConfirmed:false},
    {...saved.timing,manualReviewConfirmedAt:undefined},
    {...saved.timing,manualReviewConfirmedAt:'bad'},
    {...legacy,manualReviewConfirmed:true},
    {...legacy,manualReviewConfirmedAt:new Date().toISOString()},
  ])assert.throws(()=>validatePlan({...saved.plan,narrationTimings:[changed]}));
});

test('millisecond rounding handles minute/hour carry and rejects collapse, overlap, or audio overrun',()=>{
  const f=setup('첫 문단입니다.\n\n다음 문단입니다.');
  const longTake={...f.take,durationSeconds:3601.5};
  const valid=[{...f.rows[0],startSeconds:59.9995,endSeconds:60.0005},
    {...f.rows[1],startSeconds:3599.9995,endSeconds:3600.5005}];
  const timing=createManualTimingDraft(f.plan,longTake,valid,true);
  const srt=serializeSubtitleDraft(f.plan,longTake,timing,'srt');
  assert.match(srt,/00:01:00,000 --> 00:01:00,001/);
  assert.match(srt,/01:00:00,000 --> 01:00:00,501/);
  assert.match(serializeSubtitleDraft(f.plan,longTake,timing,'vtt'),/01:00:00\.000 --> 01:00:00\.501/);
  const collapsed={...timing,segments:[{...timing.segments[0],startSeconds:0.0001,endSeconds:0.0004},timing.segments[1]]};
  assert.throws(()=>serializeSubtitleDraft(f.plan,longTake,collapsed,'srt'),/밀리초/);
  const overlap={...timing,segments:[{...timing.segments[0],startSeconds:1,endSeconds:1.0006},{...timing.segments[1],startSeconds:1.0004,endSeconds:2}]};
  assert.throws(()=>serializeSubtitleDraft(f.plan,longTake,overlap,'vtt'),/밀리초/);
  const beyond={...timing,segments:[timing.segments[0],{...timing.segments[1],endSeconds:3601.5004}]};
  assert.throws(()=>serializeSubtitleDraft(f.plan,longTake,beyond,'srt'));
  const fractionalTake={...longTake,durationSeconds:3601.5006};
  const roundedBeyond={...timing,segments:[timing.segments[0],{...timing.segments[1],endSeconds:fractionalTake.durationSeconds}]};
  assert.throws(()=>serializeSubtitleDraft(f.plan,fractionalTake,roundedBeyond,'srt'),/밀리초/);
});

test('stale script/audio/segment and unsupported plaintext controls fail without altering script',()=>{
  const f=setup();const timing=createManualTimingDraft(f.plan,f.take,f.rows,true);
  const original=f.plan.script.rawText;
  for(const changed of [
    {...timing,scriptSha256:'0'.repeat(64)},
    {...timing,audioSha256:'0'.repeat(64)},
    {...timing,segments:[{...timing.segments[0],segmentId:'wrong'},...timing.segments.slice(1)]},
    {...timing,segments:[{...timing.segments[0],text:'different'},...timing.segments.slice(1)]},
  ])assert.throws(()=>serializeSubtitleDraft(f.plan,f.take,changed,'srt'));
  for(const [text,shouldReject] of [['첫 줄\r\n다음 줄',false],['줄 하나\n\n줄 둘',true],['제어\u0000문자',true]]){
    const p=createPlan('제어 문자 테스트',text);
    // Build one paragraph spanning the exact source text to exercise serializer delimiters directly.
    p.script.segments=[{id:'segment-1',start:0,end:[...p.script.rawText].length,text:p.script.rawText,kind:'narration'}];
    const t={...f.take,projectId:p.id,scriptSha256:p.script.rawSha256};
    const ranges=[{segmentId:'segment-1',startSeconds:0,endSeconds:t.durationSeconds}];
    const draft=createManualTimingDraft(p,t,ranges,true);
    if(shouldReject)assert.throws(()=>serializeSubtitleDraft(p,t,draft,'vtt'));
    else assert.match(serializeSubtitleDraft(p,t,draft,'vtt'),/첫 줄\n다음 줄/);
  }
  assert.equal(f.plan.script.rawText,original);
});
