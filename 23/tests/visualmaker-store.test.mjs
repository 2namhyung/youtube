import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,getProject,updateProject,listProjects,assetFile} from '../visualmaker/core/store.ts';
import {attachUpload} from '../visualmaker/core/upload.ts';
import {guard,studioToken,readJson} from '../visualmaker/core/http.ts';
import {importEpisode,handoff} from '../visualmaker/core/episode.ts';

test('SQLite revisions reject stale writers and preserve locked scenes across process reads',()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'visualmaker-store-'));
  const plan=insertProject(createPlan('저장 테스트','실제 사람이 서류를 읽습니다.\n\n두 결과를 비교합니다.'));
  const scene=plan.scenes[0];
  const selected=updateProject(plan.id,1,{type:'select',sceneId:scene.id,candidateId:scene.candidates[0].id});
  assert.equal(selected.revision,2);
  assert.throws(()=>updateProject(plan.id,1,{type:'lock',sceneId:scene.id,locked:true}),e=>e.status===409);
  const locked=updateProject(plan.id,2,{type:'lock',sceneId:scene.id,locked:true});
  assert.throws(()=>updateProject(plan.id,3,{type:'regenerate',sceneId:scene.id}),e=>e.status===423);
  assert.deepEqual(getProject(plan.id),locked);
  const db=new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM revisions WHERE project_id=?').get(plan.id).n,3);
  db.close();
  assert.equal(listProjects().length,1);
});

test('local HTTP boundary rejects cross-origin, missing token, oversized and malformed bodies',async()=>{
  const valid={host:'127.0.0.1:3017',origin:'http://127.0.0.1:3017','x-visualmaker-token':studioToken()};
  assert.doesNotThrow(()=>guard(new Request('http://127.0.0.1:3017/api/studio',{headers:valid})));
  for(const override of [{origin:'https://untrusted.example'},{host:'evil.example'},{'x-visualmaker-token':''}])
    assert.throws(()=>guard(new Request('http://127.0.0.1:3017/api/studio',{headers:{...valid,...override}})),e=>e.status===403);
  await assert.rejects(readJson(new Request('http://localhost/api',{method:'POST',body:'12345'}),4),e=>e.status===413);
  await assert.rejects(readJson(new Request('http://localhost/api',{method:'POST',body:'[]'})));
  assert.throws(()=>assetFile('../../raw/inbox/private'));
});

test('EP001 import is a lossless narration planning copy with current mode and no production authority',()=>{
  const spec=JSON.parse(readFileSync('video/episodes/episode-001/episode-spec.json','utf8'));
  const plan=importEpisode();
  assert.equal(plan.scenes.length,spec.cuts.length);
  assert.equal(plan.script.rawText,spec.cuts.map(c=>c.draft_narration).join('\n\n'));
  assert.deepEqual(plan.scenes.map(s=>s.candidates[0].mode),spec.cuts.map(c=>c.production_mode));
  assert.equal(plan.productionAuthority,false);
  assert.equal(handoff(plan).originUnchanged,true);
  assert.deepEqual(plan.scenes.flatMap(s=>s.originCutIds),spec.cuts.map(c=>c.shot_id));
  assert.equal(handoff(createPlan('다른 주제','꽃이 피었습니다.')).target,null);
  assert.ok(plan.scenes.every(s=>s.selectedCandidateId===null&&!s.locked));
  assert.ok(plan.requirements.filter(r=>r.acquisition==='generated-keyframe').every(r=>r.mediaType==='image'));
});

test('uploaded images require decode/provenance and remain pending with a verified original hash',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'visualmaker-upload-'));
  const plan=insertProject(createPlan('자료 테스트','두 가지 결과를 비교합니다.'));
  const req=plan.requirements.find(r=>r.mediaType==='image');
  assert.ok(req);
  const fields={originalName:'fixture.png',sourceUrl:'https://example.org/test-fixture',creator:'Synthetic test fixture',rightsNote:'test only',semanticNote:'Non-production synthetic decoder test',evidenceOnly:'false'};
  await assert.rejects(attachUpload(plan.id,1,req.id,Buffer.from('not an image'),fields));
  assert.equal(getProject(plan.id).revision,1);
  const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#ffffff'}}).png().toBuffer();
  const saved=await attachUpload(plan.id,1,req.id,bytes,fields);
  assert.equal(saved.assets[0].status,'pending-review');
  assert.equal(saved.assets[0].width,12);
  assert.equal(saved.productionAuthority,false);
  assert.deepEqual(readFileSync(assetFile(saved.assets[0].path)),bytes);
  assert.throws(()=>insertProject({...saved,id:'malicious',assets:[{...saved.assets[0],path:'../../raw/inbox/private'}]}));
  assert.throws(()=>insertProject({...saved,id:'forged-dimensions',assets:[{...saved.assets[0],width:9000}]}),/검증 기록/);
  assert.doesNotThrow(()=>insertProject(saved,true));
  writeFileSync(assetFile(saved.assets[0].path),Buffer.from('changed bytes'));
  assert.throws(()=>getProject(plan.id),/검증 기록/);
});

test('failed video probes leave no importable original or fabricated decode receipt',async()=>{
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'visualmaker-invalid-video-'));
  const plan=insertProject(createPlan('영상 파일 검사','실제 사람이 문을 열고 이동합니다.'));
  const req=plan.requirements.find(r=>r.mediaType==='video');
  assert.ok(req);
  const fake=Buffer.from([0,0,0,24,102,116,121,112,0,0,0,0]);
  const hash=createHash('sha256').update(fake).digest('hex');
  await assert.rejects(attachUpload(plan.id,1,req.id,fake,{originalName:'fake.mp4',sourceUrl:'https://example.org/test-fixture',creator:'Test',rightsNote:'Test only',semanticNote:'Invalid file test',evidenceOnly:'false'}));
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'assets',`${hash}.mp4`)),false);
  assert.deepEqual(readdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'staging')),[]);
  assert.equal(getProject(plan.id).revision,1);
});
