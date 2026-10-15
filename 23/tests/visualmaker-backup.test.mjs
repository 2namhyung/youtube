import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,linkSync,mkdirSync,existsSync,symlinkSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,getProject,updateProject,saveNarrationTiming,listProjects,attachAssetBytes} from '../visualmaker/core/store.ts';
import {attachUpload} from '../visualmaker/core/upload.ts';
import {attachNarrationUpload} from '../visualmaker/core/narration.ts';
import {BACKUP_LIMITS,exportProjectBackup,restoreProjectBackup} from '../visualmaker/core/backup.ts';
import {GET,POST} from '../src/app/api/studio/backup/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';

function root(){return process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-backup-test-'));}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function wav(){const rate=8000,samples=4000,bytes=Buffer.alloc(44+samples*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes;}
const fields={originalName:'synthetic.png',sourceUrl:'https://example.org/synthetic',creator:'Synthetic fixture',rightsNote:'Local test',semanticNote:'Synthetic test only',evidenceOnly:'false'};
function count(rootDir,table,id){const db=new DatabaseSync(path.join(rootDir,'studio.sqlite'));try{return db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${table==='projects'?'id':'project_id'}=?`).get(id).n;}finally{db.close();}}
function auth(extra={}){return {host:'127.0.0.1:31337',origin:'http://127.0.0.1:31337','x-visualmaker-token':studioToken(),...extra};}
function request(url,options={}){return new Request(`http://127.0.0.1:31337${url}`,{...options,headers:{...auth(),...options.headers}});}

test('empty project exports and restores as a new project with one coherent revision',async()=>{
  const dir=root(),source=insertProject(createPlan('빈 백업','첫 문단을 설명합니다.'));
  const {bytes}=exportProjectBackup(source.id,source.revision);
  assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
  const result=await restoreProjectBackup(bytes);
  assert.notEqual(result.plan.id,source.id);assert.equal(result.plan.revision,source.revision);
  assert.equal(result.plan.productionAuthority,false);assert.equal(result.summary.assets,0);
  assert.equal(count(dir,'revisions',result.plan.id),1);assert.equal(count(dir,'projects',source.id),1);
  assert.deepEqual(getProject(source.id),source);assert.deepEqual(getProject(result.plan.id),result.plan);
});

test('populated roundtrip retains every assigned and unassigned byte, recording, history and draft timing',async()=>{
  const sourceDir=root();let plan=insertProject(createPlan('풍부한 백업','첫 문단입니다.\n\n둘째 문단입니다.'));
  plan=updateProject(plan.id,plan.revision,{type:'revise-script',text:'첫 문단을 다시 설명합니다.\n\n둘째 문단을 설명합니다.'});
  const selected=plan.scenes[0];plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:selected.id,candidateId:selected.candidates[0].id});
  const imageRequirements=plan.requirements.filter(item=>item.mediaType==='image');assert.ok(imageRequirements.length>=2);
  const png=await sharp({create:{width:12,height:9,channels:3,background:'#ffffff'}}).png().toBuffer();
  plan=await attachUpload(plan.id,plan.revision,imageRequirements[0].id,png,fields,{originalAcquisitionMarker:'source-machine-only'});
  const asset=plan.assets[0],other=imageRequirements.find(item=>item.id!==imageRequirements[0].id);
  plan=updateProject(plan.id,plan.revision,{type:'assign-asset',requirementId:other.id,assetId:asset.id});
  plan=updateProject(plan.id,plan.revision,{type:'review-source',requirementId:imageRequirements[0].id,dimension:'source',decision:'acceptable',rationale:'Synthetic source test'});
  const extraRequirement=plan.requirements.find(item=>item.assetId===null&&item.mediaType==='image');assert.ok(extraRequirement);
  const png2=await sharp({create:{width:13,height:10,channels:3,background:'#eeeeee'}}).png().toBuffer();
  plan=await attachUpload(plan.id,plan.revision,extraRequirement.id,png2,{...fields,originalName:'other.png'});
  plan=updateProject(plan.id,plan.revision,{type:'detach-asset',requirementId:extraRequirement.id});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:selected.id,locked:true});
  const recording=wav(),uploaded=attachNarrationUpload(plan.id,plan.revision,plan.script.rawSha256,'voice.wav',recording);plan=uploaded.plan;
  const narration=plan.script.segments.filter(item=>item.kind==='narration');
  const rows=narration.map((item,index)=>({segmentId:item.id,startSeconds:index*0.25,endSeconds:(index+1)*0.25}));
  plan=saveNarrationTiming(plan.id,plan.revision,uploaded.take.id,plan.script.rawSha256,uploaded.take.sha256,rows,true).plan;
  const sourceDocuments=count(sourceDir,'revisions',plan.id),backup=exportProjectBackup(plan.id,plan.revision).bytes;
  assert.ok(backup.includes(Buffer.from('source-machine-only')));
  const destination=root();insertProject(createPlan('기존 프로젝트','기존 데이터입니다.'));
  const {plan:copy,summary}=await restoreProjectBackup(backup);
  assert.equal(copy.revision,plan.revision);assert.equal(count(destination,'revisions',copy.id),1);assert.equal(count(sourceDir,'revisions',plan.id),sourceDocuments);
  assert.equal(copy.script.rawText,plan.script.rawText);assert.deepEqual(copy.script.history,plan.script.history);
  assert.deepEqual(copy.scenes.map(s=>[s.selectedCandidateId,s.locked]),plan.scenes.map(s=>[s.selectedCandidateId,s.locked]));
  assert.equal(copy.sourceReviews.length,0);assert.equal(summary.clearedSourceReviews,plan.sourceReviews.length);
  assert.equal(summary.clearedSourceReceiptExtensions,1);
  assert.equal(readFileSync(path.join(destination,'receipts',`${copy.assets[0].id}.json`),'utf8').includes('source-machine-only'),false);
  assert.equal(copy.assets.length,2);assert.equal(copy.requirements.filter(r=>r.assetId===copy.assets[0].id).length,2);
  assert.equal(copy.requirements.some(r=>r.assetId===copy.assets[1].id),false);
  assert.notEqual(copy.assets[0].id,plan.assets[0].id);assert.equal(copy.assets[0].sha256,sha(png));assert.equal(copy.assets[1].sha256,sha(png2));
  assert.deepEqual(readFileSync(path.join(destination,copy.assets[0].path)),png);assert.deepEqual(readFileSync(path.join(destination,copy.assets[1].path)),png2);
  assert.deepEqual(readFileSync(path.join(destination,copy.narrationTakes[0].path)),recording);
  assert.notEqual(copy.narrationTakes[0].id,uploaded.take.id);assert.equal(copy.narrationTakes[0].projectId,copy.id);
  assert.equal(copy.narrationTakes[0].capturedRevision,uploaded.take.capturedRevision);
  assert.equal(copy.narrationTimings[0].takeId,copy.narrationTakes[0].id);assert.equal(copy.narrationTimings[0].projectId,copy.id);
  assert.equal(copy.narrationTimings[0].manualReviewConfirmed,undefined);assert.equal(copy.narrationTimings[0].manualReviewConfirmedAt,undefined);
  assert.equal(summary.clearedTimingAttestations,1);assert.deepEqual(getProject(copy.id),copy);
  assert.equal(listProjects().length,2);
});

test('guarded binary route rejects stale, forged, malformed and oversized requests without adding a project',async()=>{
  const dir=root(),source=insertProject(createPlan('API 백업','테스트 대본입니다.'));
  const url=`/api/studio/backup?projectId=${source.id}&baseRevision=${source.revision}`;
  const good=await GET(request(url));assert.equal(good.status,200);assert.equal(good.headers.get('content-type'),'application/zip');assert.equal(good.headers.get('cache-control'),'no-store');
  const bytes=Buffer.from(await good.arrayBuffer());assert.equal(Number(good.headers.get('content-length')),bytes.length);
  for(const headers of [{'x-visualmaker-token':'0'.repeat(64)},{origin:'https://evil.example'}])assert.equal((await GET(request(url,{headers}))).status,403);
  assert.equal((await GET(request(url+'&other=1'))).status,400);
  assert.equal((await GET(request(url.replace('baseRevision=1','baseRevision=2')))).status,409);
  const post=(body,headers={})=>POST(request('/api/studio/backup',{method:'POST',body,...(body instanceof ReadableStream?{duplex:'half'}:{}),headers:{'content-type':'application/zip','x-visualmaker-restore-copy':'1',...headers}}));
  assert.equal((await post(bytes,{'x-visualmaker-restore-copy':'0'})).status,400);
  assert.equal((await post(bytes,{'content-type':'application/json'})).status,400);
  assert.equal((await post(bytes,{'x-visualmaker-token':'0'.repeat(64)})).status,403);
  assert.equal((await post(Buffer.alloc(0))).status,400);
  const over=new ReadableStream({start(controller){controller.enqueue(Buffer.alloc(BACKUP_LIMITS.archive));controller.enqueue(Buffer.from('x'));controller.close();}});
  assert.equal((await post(over)).status,413);
  assert.equal(listProjects().length,1);
  const restored=await post(bytes);assert.equal(restored.status,201);assert.equal(restored.headers.get('cache-control'),'no-store');
  const result=await restored.json();assert.notEqual(result.plan.id,source.id);assert.equal(count(dir,'revisions',result.plan.id),1);
});

test('tampered ZIP and linked originals fail without state change',async()=>{
  const dir=root(),source=insertProject(createPlan('무결성 검사','자료를 확인합니다.'));
  const valid=exportProjectBackup(source.id,source.revision).bytes;
  for(const mutation of [bytes=>{bytes[0]=0;},bytes=>{bytes[bytes.length-22]=0;},bytes=>{bytes[40]^=1;}]){
    const changed=Buffer.from(valid);mutation(changed);await assert.rejects(restoreProjectBackup(changed));
  }
  assert.equal(listProjects().length,1);
  const png=await sharp({create:{width:4,height:4,channels:3,background:'#abcdef'}}).png().toBuffer();
  let plan=await attachUpload(source.id,source.revision,source.requirements.find(r=>r.mediaType==='image').id,png,fields);
  const file=path.join(dir,plan.assets[0].path),hard=path.join(dir,'assets','hardlink.png');linkSync(file,hard);
  assert.throws(()=>exportProjectBackup(plan.id,plan.revision),/파일 형식|연결|변경/);
  assert.equal(getProject(plan.id).revision,plan.revision);
});

test('ZIP count, method, CRC and local names are checked before any materialization',async()=>{
  root();const source=insertProject(createPlan('ZIP 검사','보관 내용을 확인합니다.'));
  const valid=exportProjectBackup(source.id,source.revision).bytes,mutations=[];
  const overCount=Buffer.from(valid);overCount.writeUInt16LE(BACKUP_LIMITS.entries+1,overCount.length-22+10);mutations.push([overCount,413]);
  const method=Buffer.from(valid);method.writeUInt16LE(8,8);mutations.push([method,400]);
  const crc=Buffer.from(valid);crc[45]^=1;mutations.push([crc,400]);
  const name=Buffer.from(valid);name.write('..\\evil.json',30,'ascii');mutations.push([name,400]);
  for(const [bad,status] of mutations)await assert.rejects(restoreProjectBackup(bad),error=>error.status===status);
  assert.equal(listProjects().length,1);
});

test('conflicting and hardlinked destination media preserve existing bytes and database rows',async()=>{
  root();const source=insertProject(createPlan('복원 충돌','사진 자료를 확인합니다.'));
  const png=await sharp({create:{width:8,height:6,channels:3,background:'#ffeeee'}}).png().toBuffer();
  const saved=await attachUpload(source.id,source.revision,source.requirements.find(r=>r.mediaType==='image').id,png,fields);
  const backup=exportProjectBackup(saved.id,saved.revision).bytes;
  const destination=root();insertProject(createPlan('기존 내용','기존 내용입니다.'));
  mkdirSync(path.join(destination,'assets'));const target=path.join(destination,saved.assets[0].path),wrong=Buffer.from('existing-different-bytes');
  writeFileSync(target,wrong,{flag:'wx'});
  await assert.rejects(restoreProjectBackup(backup),error=>error.status===409);
  assert.deepEqual(readFileSync(target),wrong);assert.equal(listProjects().length,1);
  const linked=path.join(destination,'assets','other-hardlink');linkSync(target,linked);
  await assert.rejects(restoreProjectBackup(backup),error=>error.status===409);
  assert.deepEqual(readFileSync(target),wrong);assert.equal(listProjects().length,1);
});

test('copy clears episode cut origin and AI adoption while retaining source plan inside the archive',async()=>{
  root();const base=createPlan('출처 격리','기존 출처 문장입니다.');const segment=base.script.segments[0],beat=base.beats[0],scene=base.scenes[0];
  const source=insertProject({...base,revision:2,origin:{kind:'episode-spec',path:'video/episodes/test/episode-spec.json',sha256:'1'.repeat(64)},
    scenes:base.scenes.map(item=>({...item,originCutIds:['cut-1']})),
    aiAnalysisAdoption:{schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:`adopt_${randomUUID()}`,createdAt:new Date().toISOString(),jobId:`job_${randomUUID()}`,artifactSha256:'2'.repeat(64),
      scope:{projectId:base.id,revision:1,scriptSha256:base.script.rawSha256,snapshotSha256:'3'.repeat(64)},model:{adapter:'sdk-test',requestedModelId:'test/model',responseModelId:'test/model'},
      beforeRevision:1,afterRevision:2,scriptSha256:base.script.rawSha256,productionAuthority:false,requiresHumanReview:true,
      records:[{segmentId:segment.id,beatId:beat.id,sceneId:scene.id,source:{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind},
        mainMessage:beat.intent,uncertainty:'불확실성 검토',visualMeaningBrief:'의미 설명',searchBriefKo:'검색어',searchBriefEn:'query',beforeIntent:'이전',appliedIntent:beat.intent}]}});
  const backup=exportProjectBackup(source.id,2).bytes;
  const local=root(),{plan,summary}=await restoreProjectBackup(backup);
  assert.equal(plan.origin,undefined);assert.equal(plan.aiAnalysisAdoption,undefined);assert.ok(plan.scenes.every(item=>item.originCutIds===undefined));
  assert.equal(summary.clearedEpisodeOrigin,1);assert.equal(summary.clearedSceneOriginCutIds,1);assert.equal(summary.clearedAIAdoption,1);
  assert.equal(plan.revision,2);assert.equal(count(local,'revisions',plan.id),1);
  assert.deepEqual(getProject(plan.id),plan);
});

test('late media conflict rolls back only files created by this restore',async()=>{
  root();let source=insertProject(createPlan('부분 게시 실패','첫 사진을 설명합니다.\n\n둘째 사진을 설명합니다.'));
  const requirements=source.requirements.filter(item=>item.mediaType==='image');assert.ok(requirements.length>=2);
  const first=await sharp({create:{width:6,height:5,channels:3,background:'#ff0000'}}).png().toBuffer();
  const second=await sharp({create:{width:7,height:5,channels:3,background:'#0000ff'}}).png().toBuffer();
  source=await attachUpload(source.id,source.revision,requirements[0].id,first,fields);
  source=await attachUpload(source.id,source.revision,requirements[1].id,second,{...fields,originalName:'second.png'});
  const backup=exportProjectBackup(source.id,source.revision).bytes,dest=root();insertProject(createPlan('기존 저장','그대로 둡니다.'));
  mkdirSync(path.join(dest,'assets'));
  const occupied=path.join(dest,source.assets[1].path),original=Buffer.from('old independent content');writeFileSync(occupied,original,{flag:'wx'});
  await assert.rejects(restoreProjectBackup(backup),error=>error.status===409);
  assert.equal(existsSync(path.join(dest,source.assets[0].path)),false);assert.deepEqual(readFileSync(occupied),original);
  assert.equal(listProjects().length,1);
});

test('linked staging directory is rejected before project insertion',async(t)=>{
  root();const source=insertProject(createPlan('스테이징 링크','녹음을 설명합니다.'));
  const archive=exportProjectBackup(source.id,source.revision).bytes,dest=root();insertProject(createPlan('기존 프로젝트','기존 문장입니다.'));
  const outside=mkdtempSync(path.join(os.tmpdir(),'vm-backup-outside-'));
  try{symlinkSync(outside,path.join(dest,'backup-staging'),'junction');}catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('Windows junction privilege unavailable');return;}throw error;}
  await assert.rejects(restoreProjectBackup(archive),error=>error.status===409);
  assert.equal(listProjects().length,1);
});

test('valid JSON data asset is measured and retained by portable copy',async()=>{
  root();const source=insertProject(createPlan('JSON 자료','두 수치를 비교합니다.'));
  const requirement=source.requirements.find(item=>item.mediaType==='data');assert.ok(requirement);
  const bytes=Buffer.from(JSON.stringify({label:'synthetic',values:[1,2]})),digest=sha(bytes);
  const asset={id:`asset_${randomUUID()}`,originalName:'numbers.json',mediaType:'data',path:`assets/${digest}.json`,sha256:digest,mimeType:'application/json',
    width:null,height:null,durationSeconds:null,sourceUrl:'https://example.org/synthetic',creator:'Synthetic fixture',rightsNote:'Local test',semanticNote:'Synthetic values',status:'pending-review',evidenceOnly:true};
  const stored=attachAssetBytes(source.id,source.revision,requirement.id,asset,bytes);
  const archive=exportProjectBackup(stored.id,stored.revision).bytes,dest=root();const result=await restoreProjectBackup(archive);
  assert.equal(result.plan.assets[0].mimeType,'application/json');assert.equal(result.plan.assets[0].path,asset.path);
  assert.deepEqual(readFileSync(path.join(dest,asset.path)),bytes);assert.equal(result.plan.requirements.find(item=>item.id===requirement.id).assetId,result.plan.assets[0].id);
});

test('video restore rejects junction staging before any source byte is written outside',async(t)=>{
  root();const source=insertProject(createPlan('영상 경로 검사','사람이 문을 열고 이동합니다.'));
  const requirement=source.requirements.find(item=>item.mediaType==='video');assert.ok(requirement);
  const video=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.2','-an','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:2_000_000,windowsHide:true});assert.equal(video.status,0);
  const saved=await attachUpload(source.id,source.revision,requirement.id,video.stdout,{...fields,originalName:'clip.mp4'});
  const archive=exportProjectBackup(saved.id,saved.revision).bytes,dest=root(),outside=mkdtempSync(path.join(os.tmpdir(),'vm-video-outside-'));
  try{symlinkSync(outside,path.join(dest,'staging'),'junction');}catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('Windows junction privilege unavailable');return;}throw error;}
  await assert.rejects(restoreProjectBackup(archive),error=>error.status===409);
  assert.deepEqual(readdirSync(outside),[]);assert.equal(listProjects().length,0);
});

test('direct video intake also rejects linked probe staging without writing outside',async(t)=>{
  const dir=root(),source=insertProject(createPlan('영상 직접 수집','사람이 문을 열고 이동합니다.'));
  const requirement=source.requirements.find(item=>item.mediaType==='video');assert.ok(requirement);
  const video=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.2','-an','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:2_000_000,windowsHide:true});assert.equal(video.status,0);
  const outside=mkdtempSync(path.join(os.tmpdir(),'vm-upload-outside-'));
  try{symlinkSync(outside,path.join(dir,'staging'),'junction');}catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('Windows junction privilege unavailable');return;}throw error;}
  await assert.rejects(attachUpload(source.id,source.revision,requirement.id,video.stdout,{...fields,originalName:'clip.mp4'}));
  assert.deepEqual(readdirSync(outside),[]);assert.equal(getProject(source.id).revision,source.revision);
});

test('unexpected storage error returns a fixed 500 without local path disclosure',async()=>{
  const dir=root();writeFileSync(path.join(dir,'studio.sqlite'),Buffer.from('invalid sqlite payload'),{flag:'wx'});
  const response=await GET(request('/api/studio/backup?projectId=plan_test&baseRevision=1'));
  assert.equal(response.status,500);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.error,'백업 요청을 처리할 수 없습니다.');assert.equal(JSON.stringify(body).includes(dir),false);
});
