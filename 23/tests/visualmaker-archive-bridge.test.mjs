import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync,closeSync,existsSync,fstatSync,mkdtempSync,openSync,readFileSync,readdirSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {createPlan} from '../visualmaker/core/director.ts';
import {insertProject,getProject,updateProject} from '../visualmaker/core/store.ts';
import {listArchiveCandidates,importArchiveCandidate,readArchiveBytesBounded} from '../visualmaker/core/archive-candidates.ts';
import {validArchiveImport,validArchiveList} from '../src/components/studio/archive-client.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=async({generatedKeyframe=false}={})=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'vm-archive-'));
  process.env.VISUALMAKER_DATA_DIR=path.join(root,'studio');
  process.env.ARCHIVE_DB_PATH=path.join(root,'archive.sqlite');
  process.env.ARCHIVE_RAW_ROOT=path.join(root,'raw');mkdirSync(process.env.ARCHIVE_RAW_ROOT);
  const draft=createPlan('보관함 테스트','두 자료를 비교합니다.');
  if(generatedKeyframe){const imageRequirement=draft.requirements.find(item=>item.mediaType==='image');assert.ok(imageRequirement);imageRequirement.acquisition='generated-keyframe';}
  const plan=insertProject(draft);
  const requirement=plan.requirements.find(item=>item.mediaType==='image');assert.ok(requirement);
  const image=await sharp({create:{width:12,height:9,channels:3,background:'#ffffff'}}).png().toBuffer();
  const file=path.join(process.env.ARCHIVE_RAW_ROOT,'image.png');writeFileSync(file,image);
  const db=new DatabaseSync(process.env.ARCHIVE_DB_PATH);
  db.exec(`CREATE TABLE graph_nodes(id INTEGER PRIMARY KEY,label TEXT NOT NULL);
    CREATE TABLE media_assets(id INTEGER PRIMARY KEY,node_id INTEGER NOT NULL,media_type TEXT NOT NULL,path TEXT NOT NULL,
    sha256 TEXT,mime_type TEXT,bytes INTEGER,duration_seconds REAL,license TEXT,attribution TEXT,properties_json TEXT);`);
  const props={provider:'fixture',providerId:'image-1',query:'compare',itemUrl:'https://example.org/item/1',creator:'Fixture Creator',publisher:'Fixture Publisher',rightsStatus:'review needed',retrievedAt:'2026-10-13T00:00:00Z'};
  const insert=(id,overrides={})=>{const row={media_type:'photo',path:file,sha256:hash(image),mime_type:'image/png',bytes:image.length,duration_seconds:null,
    license:'fixture permission pending',attribution:'Fixture Creator, example.org',properties_json:JSON.stringify(props),...overrides};
    db.prepare('INSERT INTO graph_nodes(id,label) VALUES (?,?)').run(id,`fixture ${id}`);
    db.prepare(`INSERT INTO media_assets(id,node_id,media_type,path,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,id,row.media_type,row.path,row.sha256,row.mime_type,row.bytes,row.duration_seconds,row.license,row.attribution,row.properties_json);
  };
  insert(1);db.close();
  return {root,plan,requirement,image,file,props,insert};
};
const query=(f,extra={})=>({id:f.plan.id,baseRevision:f.plan.revision,requirementId:f.requirement.id,...extra});
const body=(f,extra={})=>({...query(f),archiveAssetId:1,expectedSha256:hash(f.image),semanticNote:'두 자료의 시각 차이를 확인하는 시험용 원본',evidenceOnly:false,...extra});
const edit=(f,sql,...values)=>{const db=new DatabaseSync(process.env.ARCHIVE_DB_PATH);db.prepare(sql).run(...values);db.close();};

test('missing archive is unavailable and malformed schema is distinct without creating archive',async()=>{
  const f=await fixture();const missing=path.join(f.root,'missing.sqlite');process.env.ARCHIVE_DB_PATH=missing;
  const result=listArchiveCandidates(query(f));assert.equal(result.availability,'unavailable');assert.equal(existsSync(missing),false);
  process.env.ARCHIVE_DB_PATH=path.join(f.root,'malformed.sqlite');const db=new DatabaseSync(process.env.ARCHIVE_DB_PATH);db.exec('CREATE TABLE media_assets(id INTEGER)');db.close();
  assert.throws(()=>listArchiveCandidates(query(f)),error=>error.status===409&&!error.message.includes(f.root));
});

test('read-only bounded search exposes allowlisted metadata and stable pages without archive mutation',async()=>{
  const f=await fixture();const db=new DatabaseSync(process.env.ARCHIVE_DB_PATH);
  for(let id=2;id<=23;id++){
    db.prepare('INSERT INTO graph_nodes(id,label) VALUES (?,?)').run(id,`fixture ${id}`);
    db.prepare(`INSERT INTO media_assets(id,node_id,media_type,path,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json)
      SELECT ?,?,media_type,path,sha256,mime_type,bytes,duration_seconds,license,attribution,properties_json FROM media_assets WHERE id=1`).run(id,id);
  }db.close();const before=hash(readFileSync(process.env.ARCHIVE_DB_PATH));
  const first=listArchiveCandidates(query(f));assert.equal(first.candidates.length,20);assert.equal(first.nextCursor,'20');
  assert.equal(first.candidates[0].compatible,true);assert.equal(first.candidates[0].itemUrl,'https://example.org/item/1');
  assert.equal('path' in first.candidates[0],false);assert.equal('originalUrl' in first.candidates[0],false);
  assert.ok(validArchiveList(first,first.scope));
  const second=listArchiveCandidates(query(f,{cursor:first.nextCursor}));assert.deepEqual(second.candidates.map(x=>x.archiveAssetId),[21,22,23]);
  assert.equal(listArchiveCandidates(query(f,{q:'fixture 23'})).candidates.length,1);
  assert.equal(listArchiveCandidates(query(f,{q:'absent'})).candidates.length,0);
  assert.equal(hash(readFileSync(process.env.ARCHIVE_DB_PATH)),before);
  assert.throws(()=>listArchiveCandidates(query(f,{cursor:'-1'})));
  assert.throws(()=>listArchiveCandidates(query(f,{q:'x'.repeat(201)})));
});

test('real decodable image imports into a new pending-review Studio revision with provenance receipt',async()=>{
  const f=await fixture();const before=hash(readFileSync(process.env.ARCHIVE_DB_PATH));
  const result=await importArchiveCandidate(body(f));
  assert.equal(result.plan.revision,2);assert.equal(result.plan.productionAuthority,false);assert.equal(result.plan.assets.length,1);
  assert.equal(result.plan.assets[0].status,'pending-review');assert.equal(result.plan.assets[0].width,12);
  assert.equal(result.plan.requirements.find(x=>x.id===f.requirement.id).assetId,result.assetId);
  const bytes=readFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,result.plan.assets[0].path));assert.deepEqual(bytes,f.image);
  const receipt=JSON.parse(readFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts',`${result.assetId}.json`),'utf8'));
  assert.deepEqual(receipt.archiveProvenance.archiveAssetId,1);assert.equal(receipt.archiveProvenance.originalSha256,hash(f.image));
  assert.match(receipt.archiveProvenance.metadataSha256,/^[a-f0-9]{64}$/);
  assert.equal(receipt.archiveProvenance.creatorField,'creator');
  assert.ok(validArchiveImport(result,{projectId:f.plan.id,revision:1,requirementId:f.requirement.id,scriptSha256:f.plan.script.rawSha256},1,hash(f.image)));
  assert.equal(validArchiveImport({...result,assetId:'forged'},result.scope,1,hash(f.image)),false);
  assert.equal(hash(readFileSync(process.env.ARCHIVE_DB_PATH)),before);
  assert.equal(getProject(f.plan.id).revision,2);
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
});

test('bad selection/metadata/bytes/path and generated-keyframe rejects leave no owned artifacts',async()=>{
  const f=await fixture();
  await assert.rejects(importArchiveCandidate(body(f,{expectedSha256:'0'.repeat(64)})),error=>error.status===409);
  edit(f,'UPDATE media_assets SET bytes=bytes+1 WHERE id=1');await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  edit(f,'UPDATE media_assets SET bytes=? WHERE id=1',f.image.length);
  edit(f,'UPDATE media_assets SET mime_type=? WHERE id=1','image/gif');await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  edit(f,'UPDATE media_assets SET mime_type=? WHERE id=1','image/jpeg');await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  edit(f,'UPDATE media_assets SET mime_type=? WHERE id=1','image/png');
  edit(f,'UPDATE media_assets SET properties_json=? WHERE id=1',JSON.stringify({...f.props,creator:'',publisher:''}));
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  edit(f,'UPDATE media_assets SET properties_json=? WHERE id=1',JSON.stringify(f.props));
  edit(f,'UPDATE media_assets SET path=? WHERE id=1',path.join(f.root,'outside.png'));
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  edit(f,'UPDATE media_assets SET path=? WHERE id=1',f.file);
  writeFileSync(f.file,Buffer.from('tamper'));
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  assert.equal(getProject(f.plan.id).revision,1);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'assets')),false);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts')),false);
});

test('a generated-keyframe requirement cannot accept a collected PNG as an Omni keyframe',async()=>{
  const f=await fixture({generatedKeyframe:true});
  assert.equal(f.requirement.acquisition,'generated-keyframe');
  const candidate=listArchiveCandidates(query(f)).candidates[0];
  assert.equal(candidate.compatible,false);
  assert.match(candidate.blockers.join(' '),/Omni/);
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  assert.equal(getProject(f.plan.id).revision,1);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'assets')),false);
});

test('locked and stale requirements reject before ingest, including pre-existing same-hash bytes',async()=>{
  const f=await fixture();const selected=updateProject(f.plan.id,1,{type:'select',sceneId:f.plan.scenes[0].id,candidateId:f.plan.scenes[0].candidates[0].id});
  const locked=updateProject(f.plan.id,2,{type:'lock',sceneId:f.plan.scenes[0].id,locked:true});
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  if(locked.scenes[0].candidates.some(c=>c.requirementIds.includes(f.requirement.id)))
    await assert.rejects(importArchiveCandidate({...body(f),baseRevision:3}),error=>error.status===423);
  assert.equal(getProject(f.plan.id).revision,3);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'assets')),false);
});

test('decode failure and screenshot restrictions cannot create Studio attachments',async()=>{
  const f=await fixture();const invalid=Buffer.from('invalid PNG bytes');writeFileSync(f.file,invalid);
  edit(f,'UPDATE media_assets SET sha256=?,bytes=? WHERE id=1',hash(invalid),invalid.length);
  await assert.rejects(importArchiveCandidate(body(f,{expectedSha256:hash(invalid)})));
  assert.equal(getProject(f.plan.id).revision,1);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR,'assets')),false);
  writeFileSync(f.file,f.image);edit(f,'UPDATE media_assets SET sha256=?,bytes=? WHERE id=1',hash(f.image),f.image.length);
  edit(f,'UPDATE graph_nodes SET label=? WHERE id=1','screen capture of a document');
  assert.equal(f.plan.scenes.some(scene=>scene.candidates.some(option=>option.layers.some(layer=>layer.role==='focal'&&layer.requirementId===f.requirement.id))),true);
  const candidate=listArchiveCandidates(query(f)).candidates[0];assert.equal(candidate.evidenceOnlyRequired,true);
  assert.equal(candidate.compatible,false);assert.match(candidate.blockers.join(' '),/핵심/);
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  assert.equal(getProject(f.plan.id).revision,1);
});

test('pre-existing same-hash Studio bytes survive a later receipt failure',async()=>{
  const f=await fixture();const assets=path.join(process.env.VISUALMAKER_DATA_DIR,'assets');mkdirSync(assets);
  const existing=path.join(assets,`${hash(f.image)}.png`);writeFileSync(existing,f.image);
  writeFileSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts'),Buffer.from('occupied'));
  await assert.rejects(importArchiveCandidate(body(f)));
  assert.deepEqual(readFileSync(existing),f.image);
  assert.equal(getProject(f.plan.id).revision,1);
});

test('symlinked archive leaf is rejected without reading target bytes when OS permits fixture link',async(t)=>{
  const f=await fixture();const link=path.join(process.env.ARCHIVE_RAW_ROOT,'linked.png');
  let target=link;
  try{symlinkSync(f.file,link,'file');}catch{
    const outside=path.join(f.root,'outside');mkdirSync(outside);writeFileSync(path.join(outside,'image.png'),f.image);
    const junction=path.join(process.env.ARCHIVE_RAW_ROOT,'junction');
    try{symlinkSync(outside,junction,'junction');target=path.join(junction,'image.png');}
    catch{t.skip('symlink/junction fixture unavailable on this host');return;}
  }
  edit(f,'UPDATE media_assets SET path=? WHERE id=1',target);
  await assert.rejects(importArchiveCandidate(body(f)),error=>error.status===409);
  assert.equal(getProject(f.plan.id).revision,1);
});

test('bounded archive fd read rejects growth after the initial fstat without allocating the grown size',async()=>{
  const f=await fixture();const fd=openSync(f.file,'r');
  try{
    const recordedSize=fstatSync(fd).size;
    appendFileSync(f.file,Buffer.alloc(100_000,0x42));
    assert.throws(()=>readArchiveBytesBounded(fd,recordedSize),error=>error.status===409&&/크기/.test(error.message));
  }finally{closeSync(fd);}
  assert.equal(getProject(f.plan.id).revision,1);
});

test('transaction rollback after receipt creation removes only newly owned bytes and receipt',async()=>{
  for(const preexisting of [false,true]){
    const f=await fixture();const assetPath=path.join(process.env.VISUALMAKER_DATA_DIR,'assets',`${hash(f.image)}.png`);
    if(preexisting){mkdirSync(path.dirname(assetPath));writeFileSync(assetPath,f.image);}
    const db=new DatabaseSync(path.join(process.env.VISUALMAKER_DATA_DIR,'studio.sqlite'));
    db.exec(`CREATE TRIGGER fixture_reject_revision BEFORE INSERT ON revisions WHEN NEW.revision=2 BEGIN SELECT RAISE(ABORT,'fixture revision failure'); END;`);
    db.close();
    await assert.rejects(importArchiveCandidate(body(f)));
    assert.equal(getProject(f.plan.id).revision,1);
    assert.equal(existsSync(assetPath),preexisting);
    if(preexisting)assert.deepEqual(readFileSync(assetPath),f.image);
    assert.deepEqual(readdirSync(path.join(process.env.VISUALMAKER_DATA_DIR,'receipts')),[]);
  }
});
