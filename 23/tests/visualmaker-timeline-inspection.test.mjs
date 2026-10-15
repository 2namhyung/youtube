import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {createPlan} from '../visualmaker/core/director.ts';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {insertProject,updateProject} from '../visualmaker/core/store.ts';
import {buildTimelineBase,buildTimelineInspection,timelineCandidateMetadataReason,timelineCandidateWindowReason,timelineStillCurrent} from '../visualmaker/core/timeline-inspection.ts';
import {GET as timelineGet} from '../src/app/api/studio/timeline/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {currentTimeline,timelineResponseScope} from '../src/components/studio/timeline-client.ts';
import {createManualTimingDraft} from '../visualmaker/core/narration-timing.ts';

const spec=readFileSync('video/episodes/episode-001/episode-spec.json');
const state=readFileSync('video/episodes/episode-001/production-state.json');
const base='http://127.0.0.1:8138/api/studio/timeline';
const headers={'x-visualmaker-token':studioToken()};
function isolated(){process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-timeline-'));return insertProject(importEpisode());}
function url(plan,format=''){return `${base}?${new URLSearchParams({id:plan.id,baseRevision:String(plan.revision),...(format?{format}:{})})}`;}
const sha=value=>createHash('sha256').update(value).digest('hex');

test('candidate window gaps never claim older valid results do not exist',()=>{
  const reason=timelineCandidateWindowReason('최신 후보의 파일 기록이 바뀌었습니다.');
  assert.match(reason,/최대 50개/);assert.match(reason,/최대 2개/);assert.match(reason,/이전 결과는 미확인/);
  const scope={projectId:'plan_current',sceneId:'scene_1',revision:3,snapshotSha256:'a'.repeat(64)};
  const candidate={status:'succeeded',projectId:scope.projectId,sceneId:scope.sceneId,
    requestedRevision:scope.revision,snapshotSha256:scope.snapshotSha256,attempt:1};
  assert.match(timelineCandidateMetadataReason([candidate],scope),/성공 작업 기록이 있습니다.*재검증하지 않습니다/);
  assert.match(timelineCandidateMetadataReason([{...candidate,sceneId:'scene_2'}],scope),/결속과 다릅니다/);
  assert.match(timelineCandidateMetadataReason([{...candidate,requestedRevision:2}],scope),/결속과 다릅니다/);
  assert.match(timelineCandidateMetadataReason([],scope),/이전 결과는 미확인/);
});

test('actual EP001 is ordered by current spec frames and blocked before active root',async()=>{
  const plan=isolated();const report=await buildTimelineInspection(plan.id,plan.revision);
  assert.equal(report.schemaVersion,'visualmaker-timeline-inspection-v1');
  assert.equal(report.rows.length,36);assert.equal(report.rows[0].cutId,'SH001');assert.equal(report.rows[35].cutId,'SH036');
  assert.equal(report.rows[0].windowStartSeconds,0);
  assert.equal(report.rows[1].windowStartSeconds,report.rows[0].windowEndSeconds);
  assert.equal(report.rows[0].sceneId,plan.scenes[0].id);
  assert.equal(report.originCurrent,true);assert.equal(report.activeCutRootPresent,false);
  assert.equal(report.rows.every(row=>!row.preview.available&&row.preview.reason.includes('활성 컷 루트')),true);
  assert.equal(report.coverageComplete,false);assert.equal(report.narration.status,'absent');
  assert.deepEqual(report.inspectionLimits,{recentJobs:50,candidatesPerScene:2,artifactValidation:'not-performed'});
  assert.deepEqual([report.productionAuthority,report.reviewApproved,report.audioSynchronized],[false,false,false]);
  assert.equal(timelineStillCurrent(report),true);
  assert.equal(JSON.stringify(report).includes(process.env.VISUALMAKER_DATA_DIR),false);
  const db=new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'),{readOnly:true});
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='visualmaker_jobs'").get(),undefined);
  db.close();
});

test('edited, freeform, duplicated and stale origins never receive an invented scene mapping',()=>{
  isolated();const imported=importEpisode();
  for(const mutate of [
    p=>{p.scenes[1].originCutIds=[p.scenes[0].originCutIds[0]];},
    p=>{p.scenes[0].candidates[0].change='different motion';},
    p=>{p.origin.sha256='0'.repeat(64);},
    p=>{p.beats[0].intent='different meaning';}
  ]){const plan=structuredClone(imported);mutate(plan);const report=buildTimelineBase(plan,spec,state);
    assert.equal(report.originCurrent,false);assert.equal(report.rows.length,36);
    assert.equal(report.rows.every(row=>row.sceneId===null&&!row.preview.available),true);
    assert.equal(report.coverageComplete,false);}
  const freeform=buildTimelineBase(createPlan('other','An unrelated script.'),spec,state);
  assert.equal(freeform.originCurrent,false);assert.equal(freeform.rows[0].sceneId,null);
  const staleState=JSON.parse(state);staleState.expected_cut_count=35;
  assert.ok(buildTimelineBase(imported,spec,Buffer.from(JSON.stringify(staleState))).blockers.some(item=>item.includes('컷 수')));
  staleState.active_cut_root='video/public/assets/candidate';staleState.render_authority.cut_root=staleState.active_cut_root;
  const blocked=buildTimelineBase(imported,spec,Buffer.from(JSON.stringify(staleState)));
  assert.equal(blocked.rows.every(row=>row.preview.reason.includes('아직 확인하지 않았습니다')),true);
});

test('current narration without a verified file stays separate and unavailable',()=>{
  isolated();const plan=importEpisode();plan.narrationTakes=[{id:'take_00000000-0000-0000-0000-000000000001',projectId:plan.id,originalName:'missing.wav',
    format:'wav',mimeType:'audio/wav',byteCount:10,sha256:'a'.repeat(64),path:`narration/${'a'.repeat(64)}.wav`,
    durationSeconds:5,sampleRate:48000,channels:1,createdAt:new Date().toISOString(),capturedRevision:1,
    scriptSha256:plan.script.rawSha256,measurement:'ffprobe',alignmentStatus:'unavailable',productionAuthority:false}];
  const report=buildTimelineBase(plan,spec,state);
  assert.equal(report.narration.status,'stale');assert.equal(report.narration.takeId,null);
  assert.deepEqual(report.narration.segments,[]);assert.equal(report.audioSynchronized,false);
});

test('verified take and saved paragraph timing appear only on the draft axis',()=>{
  isolated();const plan=importEpisode();const bytes=Buffer.from('timeline fixture audio bytes');const audioSha=sha(bytes);
  const take={id:'take_00000000-0000-0000-0000-000000000002',projectId:plan.id,originalName:'fixture.wav',
    format:'wav',mimeType:'audio/wav',byteCount:bytes.length,sha256:audioSha,path:`narration/${audioSha}.wav`,
    durationSeconds:36,sampleRate:8000,channels:1,createdAt:new Date().toISOString(),capturedRevision:1,
    scriptSha256:plan.script.rawSha256,measurement:'ffprobe',alignmentStatus:'unavailable',productionAuthority:false};
  mkdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'narration'),{recursive:true});
  mkdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'narration-receipts'),{recursive:true});
  writeFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,take.path),bytes);
  writeFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,'narration-receipts',`${take.id}.json`),
    JSON.stringify({version:1,take,takeSha256:sha(JSON.stringify(take))}));
  const inputs=plan.script.segments.filter(segment=>segment.kind==='narration').map((segment,index)=>({
    segmentId:segment.id,startSeconds:index,endSeconds:index+.75}));
  const timing=createManualTimingDraft(plan,take,inputs,true);
  plan.narrationTakes=[take];plan.narrationTimings=[timing];
  const report=buildTimelineBase(plan,spec,state);
  assert.equal(report.narration.status,'current-draft');assert.equal(report.narration.timingId,timing.id);
  assert.equal(report.narration.manualReviewConfirmed,true);
  assert.equal(report.narration.segments.length,36);
  assert.equal(report.rows[0].windowEndSeconds===report.narration.segments[0].endSeconds,false);
  assert.equal(report.audioSynchronized,false);
});

test('authenticated read and metadata download bind all current hashes; stale request fails',async()=>{
  const plan=isolated();const response=await timelineGet(new Request(url(plan),{headers}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const report=await response.json();assert.ok(await currentTimeline(report,plan));assert.equal(timelineResponseScope(response,plan,report),true);
  const download=await timelineGet(new Request(url(plan,'download'),{headers}));
  assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment; filename="timeline-inspection-episode-001-r1\.json"/);
  assert.deepEqual(await download.json(),report);
  assert.equal((await timelineGet(new Request(url(plan)))).status,403);
  assert.equal((await timelineGet(new Request(`${url(plan)}&path=secret`,{headers}))).status,400);
  assert.equal((await timelineGet(new Request(url(plan,'mp4'),{headers}))).status,400);
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'A changed beat',role:'context'});
  assert.equal((await timelineGet(new Request(url(plan),{headers}))).status,409);
  assert.equal(timelineStillCurrent(report),false);
  assert.equal(await currentTimeline({...report,productionAuthority:true},plan),null);
  assert.equal(await currentTimeline({...report,scope:{...report.scope,projectId:'plan_other'}},plan),null);
  assert.equal(await currentTimeline({...report,inspectionLimits:undefined},plan),null);
  assert.equal(await currentTimeline({...report,inspectionLimits:{...report.inspectionLimits,artifactValidation:'passed'}},plan),null);
  assert.equal(await currentTimeline({...report,coverageComplete:true},plan),null);
  assert.equal(await currentTimeline({...report,rows:[{...report.rows[0],preview:{available:true,jobId:'job_x',attempt:1,sha256:'a'.repeat(64),reason:'forged'}}]},plan),null);
  assert.equal(await currentTimeline({...report,rows:[{...report.rows[0],preview:{...report.rows[0].preview,jobId:'job_x'}}]},plan),null);
});
