import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {applyCommand,createPlan,validatePlan} from '../../visualmaker/core/director.ts';
import {insertProject,getProject,updateProject,attachAssetBytes,saveNarrationTiming,listProjects} from '../../visualmaker/core/store.ts';
import {attachUpload} from '../../visualmaker/core/upload.ts';
import {attachNarrationUpload} from '../../visualmaker/core/narration.ts';
import {BACKUP_LIMITS,exportProjectBackup} from '../../visualmaker/core/backup.ts';
import {initializeJobStorage} from '../../visualmaker/core/jobs.ts';

export const proofName='backup-browser-proof.json';
export const markerName='fixture-marker.json';
export const fixtureMarker='visualmaker-backup-browser-owned-v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const forbidden=relative=>relative.split('/').some(part=>part.startsWith('.env')||['raw','wiki','data','generated','episodes','.next'].includes(part))||/\.(?:mp4|mov|png|jpe?g|webp|wav|mp3|sqlite|db)$/iu.test(relative);

export function checkedRoot(given){
  const root=path.resolve(given),temp=realpathSync(os.tmpdir());
  assert.equal(path.normalize(path.dirname(root)).toLowerCase(),path.normalize(temp).toLowerCase(),'Fixture must be a direct child of the canonical Temp directory');
  assert.match(path.basename(root),/^vm-backup-browser-[a-z0-9]+$/iu,'Fixture name is not owned by this harness');
  const info=lstatSync(root);assert.ok(info.isDirectory());assert.equal(info.isSymbolicLink(),false);assert.equal(path.normalize(realpathSync(root)).toLowerCase(),path.normalize(root).toLowerCase());
  const markerPath=path.join(root,markerName),markerStat=lstatSync(markerPath);
  assert.ok(markerStat.isFile());assert.equal(markerStat.isSymbolicLink(),false);assert.equal(path.normalize(realpathSync(markerPath)).toLowerCase(),path.normalize(markerPath).toLowerCase());
  const marker=JSON.parse(readFileSync(markerPath,'utf8'));
  assert.deepEqual(Object.keys(marker).sort(),['marker','runId','test_only'].sort());assert.equal(marker.marker,fixtureMarker);assert.equal(marker.test_only,true);assert.match(marker.runId,/^[a-f0-9-]{36}$/u);
  return root;
}
export function checkedPath(given,relative){
  const root=checkedRoot(given),target=path.resolve(root,relative);assert.ok(target.startsWith(root+path.sep),'Fixture path escapes owned root');
  let current=root;
  for(const part of path.relative(root,target).split(path.sep)){
    current=path.join(current,part);let stat;try{stat=lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}
    assert.equal(stat.isSymbolicLink(),false,`Fixture path contains a link: ${relative}`);assert.equal(path.normalize(realpathSync(current)).toLowerCase(),path.normalize(current).toLowerCase());
  }
  return target;
}
function digestFile(root,relative){const file=checkedPath(root,relative),stat=lstatSync(file);assert.ok(stat.isFile());assert.equal(stat.isSymbolicLink(),false);const bytes=readFileSync(file);return {path:relative,bytes:bytes.length,sha256:sha(bytes)};}
function rowCounts(db){
  return {projects:db.prepare('SELECT COUNT(*) AS count FROM projects').get().count,
    revisions:db.prepare('SELECT COUNT(*) AS count FROM revisions').get().count,
    jobs:db.prepare('SELECT COUNT(*) AS count FROM visualmaker_jobs').get().count,
    attempts:db.prepare('SELECT COUNT(*) AS count FROM visualmaker_ai_analysis_attempts').get().count};
}
function planDocument(db,id){const row=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(id);assert.ok(row);return {revision:row.revision,document:row.document,sha256:sha(Buffer.from(row.document))};}
function projectSnapshot(root,plans){
  const db=new DatabaseSync(checkedPath(root,'.fixture-data/studio.sqlite'),{readOnly:true});
  try{
    const projects=plans.map(plan=>({id:plan.id,...planDocument(db,plan.id),history:db.prepare('SELECT revision,document FROM revisions WHERE project_id=? ORDER BY revision').all(plan.id).map(row=>({revision:row.revision,sha256:sha(Buffer.from(row.document))}))}));
    return {counts:rowCounts(db),projects};
  }finally{db.close();}
}
function writePng(width,height,color){return sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();}
function wav(){const rate=8000,samples=40000,bytes=Buffer.alloc(44+samples*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);return bytes;}
const assetFields={originalName:'synthetic.png',sourceUrl:'https://example.invalid/fixture',creator:'Synthetic fixture',rightsNote:'Generated local test media',semanticNote:'Synthetic browser backup test only',evidenceOnly:'false'};

async function createFixtureProjects(){
  const firstScript='이 장면은 자료의 맥락을 설명합니다.\n\n두 번째 문장은 기간별 수치의 차이를 비교합니다.\n\n마지막 문장은 요점을 정리합니다.';
  const initial=createPlan('Synthetic backup browser fixture','이 장면은 자료의 맥락을 설명합니다.\n\n두 번째 문장은 선택한 방향을 설명합니다.\n\n마지막 문장은 요점을 정리합니다.');
  const revised=applyCommand(initial,{type:'revise-script',text:firstScript});
  const segment=initial.script.segments[0],beat=initial.beats[0],scene=initial.scenes[0];
  const adoption={schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:`adopt_${randomUUID()}`,createdAt:new Date().toISOString(),jobId:`job_${randomUUID()}`,
    artifactSha256:'2'.repeat(64),scope:{projectId:initial.id,revision:1,scriptSha256:initial.script.rawSha256,snapshotSha256:'3'.repeat(64)},
    model:{adapter:'sdk-test',requestedModelId:'synthetic/test',responseModelId:'synthetic/test'},beforeRevision:1,afterRevision:2,scriptSha256:initial.script.rawSha256,
    productionAuthority:false,requiresHumanReview:true,records:[{segmentId:segment.id,beatId:beat.id,sceneId:scene.id,source:{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind},
      mainMessage:beat.intent,uncertainty:'Synthetic fixture uncertainty',visualMeaningBrief:'Synthetic visual meaning',searchBriefKo:'합성 테스트 검색',searchBriefEn:'synthetic test search',beforeIntent:'Before synthetic review',appliedIntent:beat.intent}]};
  let plan=insertProject({...revised,revision:2,origin:{kind:'episode-spec',path:'synthetic-fixture/episode-spec.json',sha256:'1'.repeat(64)},
    scenes:revised.scenes.map(item=>({...item,originCutIds:['cut_fixture_1']})),aiAnalysisAdoption:adoption});
  const unrelated=insertProject(createPlan('Unrelated preserved fixture','이 프로젝트는 복원 테스트와 무관합니다.'));
  const firstScene=plan.scenes[0];plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:firstScene.id,candidateId:firstScene.candidates[0].id});
  const imageRequirements=plan.requirements.filter(item=>item.mediaType==='image');assert.ok(imageRequirements.length>=3);
  const sharedPng=await writePng(18,12,'#3284b8'),unassignedPng=await writePng(15,11,'#da7653');
  plan=await attachUpload(plan.id,plan.revision,imageRequirements[0].id,sharedPng,{...assetFields,originalName:'shared-fixture.png'});
  const shared=plan.assets.find(asset=>asset.sha256===sha(sharedPng));assert.ok(shared);
  plan=updateProject(plan.id,plan.revision,{type:'assign-asset',requirementId:imageRequirements[1].id,assetId:shared.id});
  plan=updateProject(plan.id,plan.revision,{type:'review-source',requirementId:imageRequirements[0].id,dimension:'source',decision:'acceptable',rationale:'Synthetic fixture review through the existing Studio command'});
  const spare=plan.requirements.find(item=>item.mediaType==='image'&&item.assetId===null);assert.ok(spare);
  plan=await attachUpload(plan.id,plan.revision,spare.id,unassignedPng,{...assetFields,originalName:'unassigned-fixture.png'});
  const unassigned=plan.assets.find(asset=>asset.sha256===sha(unassignedPng));assert.ok(unassigned);
  plan=updateProject(plan.id,plan.revision,{type:'detach-asset',requirementId:spare.id});
  const dataRequirement=plan.requirements.find(item=>item.mediaType==='data');assert.ok(dataRequirement);
  const dataBytes=Buffer.from(JSON.stringify({fixture:'synthetic',values:[3,5,8]})),dataSha=sha(dataBytes);
  const dataAsset={id:`asset_${randomUUID()}`,originalName:'fixture-data.json',mediaType:'data',path:`assets/${dataSha}.json`,sha256:dataSha,mimeType:'application/json',width:null,height:null,durationSeconds:null,
    sourceUrl:'https://example.invalid/data',creator:'Synthetic fixture',rightsNote:'Generated local test data',semanticNote:'Synthetic numeric data',status:'pending-review',evidenceOnly:true};
  plan=attachAssetBytes(plan.id,plan.revision,dataRequirement.id,dataAsset,dataBytes);
  const recording=wav(),uploaded=attachNarrationUpload(plan.id,plan.revision,plan.script.rawSha256,'fixture-voice.wav',recording);plan=uploaded.plan;
  const narration=plan.script.segments.filter(item=>item.kind==='narration');
  const rows=narration.map((item,index)=>({segmentId:item.id,startSeconds:index,endSeconds:index+1}));
  plan=saveNarrationTiming(plan.id,plan.revision,uploaded.take.id,plan.script.rawSha256,uploaded.take.sha256,rows,true).plan;
  plan=updateProject(plan.id,plan.revision,{type:'review-source',requirementId:imageRequirements[0].id,dimension:'source',decision:'acceptable',rationale:'Synthetic fixture review through the existing Studio command'});
  plan=updateProject(plan.id,plan.revision,{type:'lock',sceneId:firstScene.id,locked:true});
  plan=validatePlan(getProject(plan.id));
  assert.equal(plan.script.history.length>=1,true);assert.equal(plan.scenes.find(item=>item.id===firstScene.id)?.locked,true);
  assert.equal(plan.requirements.filter(item=>item.assetId===shared.id).length,2);assert.equal(plan.requirements.some(item=>item.assetId===unassigned.id),false);
  assert.equal(plan.assets.some(item=>item.sha256===dataSha),true);assert.equal(plan.narrationTakes.length,1);assert.equal(plan.narrationTimings.length,1);
  assert.equal(plan.narrationTimings[0].manualReviewConfirmed,true);assert.equal(plan.sourceReviews.length>0,true);
  assert.equal(plan.productionAuthority,false);
  return {plan,unrelated,media:{sharedPng,unassignedPng,dataBytes,recording}};
}

export function validatePreparedFixture(given){
  const root=checkedRoot(given),proofPath=checkedPath(root,proofName),proof=JSON.parse(readFileSync(proofPath,'utf8'));
  const keys=['schemaVersion','marker','runId','test_only','productionAuthority','humanApproval','liveProviderCalls','root','dataRoot','appRoot','projectId','revision','scriptSha256','plan','expectedScrub','unrelatedProjectId','unrelatedPlan','baseline','media','backup','sourceInventory'];
  assert.deepEqual(Object.keys(proof).sort(),keys.sort());assert.equal(proof.schemaVersion,'visualmaker-backup-browser-proof-v1');assert.equal(proof.marker,fixtureMarker);
  assert.equal(proof.runId,JSON.parse(readFileSync(checkedPath(root,markerName),'utf8')).runId);assert.equal(proof.test_only,true);assert.equal(proof.productionAuthority,false);assert.equal(proof.humanApproval,false);assert.equal(proof.liveProviderCalls,0);
  assert.equal(proof.root,root);assert.equal(proof.dataRoot,checkedPath(root,'.fixture-data'));assert.equal(proof.appRoot,root);assert.notEqual(proof.projectId,proof.unrelatedProjectId);
  assert.equal(lstatSync(proof.dataRoot).isDirectory(),true);assert.equal(lstatSync(checkedPath(root,'.fixture-data/studio.sqlite')).isFile(),true);
  assert.match(proof.plan.sha256,/^[a-f0-9]{64}$/u);assert.equal(proof.plan.revision,proof.revision);
  const current=projectSnapshot(root,[{id:proof.projectId},{id:proof.unrelatedProjectId}]);assert.deepEqual(current,proof.baseline);
  const db=new DatabaseSync(checkedPath(root,'.fixture-data/studio.sqlite'),{readOnly:true});let plan,unrelated;
  try{plan=validatePlan(JSON.parse(planDocument(db,proof.projectId).document));unrelated=validatePlan(JSON.parse(planDocument(db,proof.unrelatedProjectId).document));}
  finally{db.close();}
  assert.equal(plan.revision,proof.revision);assert.equal(plan.script.rawSha256,proof.scriptSha256);assert.equal(sha(Buffer.from(JSON.stringify(plan))),proof.plan.sha256);
  assert.equal(plan.productionAuthority,false);assert.equal(plan.sourceReviews.length>0,true);assert.equal(plan.scenes.some(scene=>scene.locked),true);assert.equal(plan.scenes.some(scene=>scene.selectedCandidateId),true);
  assert.equal(plan.script.history.length>=1,true);assert.equal(plan.narrationTakes.length,1);assert.equal(plan.narrationTimings.length,1);assert.equal(plan.narrationTimings[0].manualReviewConfirmed,true);
  assert.equal(plan.origin?.kind,'episode-spec');assert.equal(plan.scenes.filter(scene=>scene.originCutIds?.length).length,proof.expectedScrub.sceneOriginCutIds);
  assert.deepEqual(proof.expectedScrub,{sourceReviews:plan.sourceReviews.length,episodeOrigin:1,sceneOriginCutIds:plan.scenes.filter(scene=>scene.originCutIds?.length).length,aiAdoption:1,timingAttestations:1});
  assert.equal(plan.requirements.filter(requirement=>requirement.assetId===proof.media.sharedAssetId).length,2);
  assert.equal(plan.requirements.some(requirement=>requirement.assetId===proof.media.unassignedAssetId),false);
  assert.equal(plan.assets.some(asset=>asset.id===proof.media.dataAssetId),true);assert.equal(unrelated.id,proof.unrelatedProjectId);
  const assets=plan.assets.map(asset=>({asset,media:digestFile(root,`.fixture-data/${asset.path}`),receipt:digestFile(root,`.fixture-data/receipts/${asset.id}.json`)}));
  const takes=plan.narrationTakes.map(take=>({take,media:digestFile(root,`.fixture-data/${take.path}`),receipt:digestFile(root,`.fixture-data/narration-receipts/${take.id}.json`)}));
  assert.deepEqual(proof.media.assets,assets.map(item=>({id:item.asset.id,sha256:item.asset.sha256,media:item.media,receipt:item.receipt})));
  assert.deepEqual(proof.media.takes,takes.map(item=>({id:item.take.id,sha256:item.take.sha256,media:item.media,receipt:item.receipt,measurement:{format:item.take.format,durationSeconds:item.take.durationSeconds,sampleRate:item.take.sampleRate,channels:item.take.channels,measurement:item.take.measurement}})));
  assert.equal(proof.backup.path,'synthetic-source-backup.zip');const backup=digestFile(root,proof.backup.path);assert.deepEqual(backup,{path:proof.backup.path,bytes:proof.backup.bytes,sha256:proof.backup.sha256});
  assert.ok(proof.backup.bytes>0&&proof.backup.bytes<=BACKUP_LIMITS.archive);assert.equal(proof.backup.sourceProjectId,plan.id);assert.equal(proof.backup.sourceRevision,plan.revision);
  for(const item of proof.sourceInventory){assert.equal(forbidden(item.path),false);assert.match(item.sha256,/^[a-f0-9]{64}$/u);assert.deepEqual(digestFile(root,item.path),{path:item.path,bytes:item.bytes,sha256:item.sha256});}
  return {root,proof,plan,unrelated};
}

export async function prepareBackupBrowserFixture(){
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'vm-backup-browser-'))),runId=randomUUID();
  writeFileSync(path.join(root,markerName),JSON.stringify({marker:fixtureMarker,runId,test_only:true}),{flag:'wx'});
  const dataRoot=checkedPath(root,'.fixture-data');mkdirSync(dataRoot);
  process.env.VISUALMAKER_DATA_DIR=dataRoot;
  for(const name of ['VISUALMAKER_AI_ENABLED','AI_GATEWAY_API_KEY','VISUALMAKER_AI_MODEL','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY'])delete process.env[name];
  initializeJobStorage();
  const {plan,unrelated,media}=await createFixtureProjects();
  assert.deepEqual(listProjects().map(item=>item.id).sort(),[plan.id,unrelated.id].sort());
  const backup=exportProjectBackup(plan.id,plan.revision).bytes;writeFileSync(checkedPath(root,'synthetic-source-backup.zip'),backup,{flag:'wx'});
  const appRoot=root;const proof={schemaVersion:'visualmaker-backup-browser-proof-v1',marker:fixtureMarker,runId,test_only:true,productionAuthority:false,humanApproval:false,liveProviderCalls:0,
    root,dataRoot,appRoot,projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,plan:{revision:plan.revision,sha256:sha(Buffer.from(JSON.stringify(plan)))},
    expectedScrub:{sourceReviews:plan.sourceReviews.length,episodeOrigin:plan.origin?1:0,sceneOriginCutIds:plan.scenes.filter(scene=>scene.originCutIds?.length).length,aiAdoption:plan.aiAnalysisAdoption?1:0,timingAttestations:plan.narrationTimings.filter(timing=>timing.manualReviewConfirmed).length},unrelatedProjectId:unrelated.id,
    unrelatedPlan:{sha256:sha(Buffer.from(JSON.stringify(unrelated))),revision:unrelated.revision},baseline:projectSnapshot(root,[plan,unrelated]),
    media:{sharedAssetId:plan.assets.find(asset=>asset.sha256===sha(media.sharedPng)).id,unassignedAssetId:plan.assets.find(asset=>asset.sha256===sha(media.unassignedPng)).id,dataAssetId:plan.assets.find(asset=>asset.sha256===sha(media.dataBytes)).id,
      assets:plan.assets.map(asset=>({id:asset.id,sha256:asset.sha256,media:digestFile(root,`.fixture-data/${asset.path}`),receipt:digestFile(root,`.fixture-data/receipts/${asset.id}.json`)})),
      takes:plan.narrationTakes.map(take=>({id:take.id,sha256:take.sha256,media:digestFile(root,`.fixture-data/${take.path}`),receipt:digestFile(root,`.fixture-data/narration-receipts/${take.id}.json`),measurement:{format:take.format,durationSeconds:take.durationSeconds,sampleRate:take.sampleRate,channels:take.channels,measurement:take.measurement}}))},
    backup:{path:'synthetic-source-backup.zip',bytes:backup.length,sha256:sha(backup),sourceProjectId:plan.id,sourceRevision:plan.revision},sourceInventory:[]};
  writeFileSync(checkedPath(root,proofName),JSON.stringify(proof,null,2),{flag:'wx'});
  const sources=collectSourceClosure();proof.sourceInventory=[...sources].map(([relative,bytes])=>{const target=checkedPath(root,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});return {path:relative,bytes:bytes.length,sha256:sha(bytes)};});
  writeFileSync(checkedPath(root,proofName),JSON.stringify(proof,null,2),{flag:'w'});
  validatePreparedFixture(root);return {root,proof};
}

export function collectSourceClosure(){
  const filesUnder=relative=>{
    const absolute=path.resolve(repo,relative);assert.ok(absolute.startsWith(repo+path.sep));
    return readdirSync(absolute,{withFileTypes:true}).flatMap(entry=>{assert.equal(entry.isSymbolicLink(),false);const child=`${relative}/${entry.name}`;return entry.isDirectory()?filesUnder(child):[child];});
  };
  const queue=[...filesUnder('src/app/studio'),...filesUnder('src/app/api/studio'),...filesUnder('src/components/studio'),
    'src/app/layout.tsx','src/app/globals.css','next.config.ts','tsconfig.json','next-env.d.ts','package.json'];
  for(const optional of ['postcss.config.mjs','postcss.config.js'])if(existsSync(path.join(repo,optional)))queue.push(optional);
  const result=new Map();
  while(queue.length){
    const relative=queue.shift().replaceAll('\\','/');if(result.has(relative))continue;assert.equal(forbidden(relative),false,`Forbidden source closure entry: ${relative}`);
    const source=path.resolve(repo,relative);assert.ok(source.startsWith(repo+path.sep));const stat=lstatSync(source);assert.ok(stat.isFile());assert.equal(stat.isSymbolicLink(),false);assert.equal(realpathSync(source),source);
    const bytes=readFileSync(source);assert.ok(bytes.length<2_000_000,`Source closure file is too large: ${relative}`);result.set(relative,bytes);
    if(!/\.[cm]?[jt]sx?$/u.test(relative))continue;const contents=bytes.toString('utf8');
    const imports=[...contents.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^\n]*?\sfrom\s*['"]((?:\.|@\/)[^'"]+)['"]/gmu)].map(match=>match[1]);
    imports.push(...[...contents.matchAll(/^\s*import\s*['"]((?:\.|@\/)[^'"]+)['"]/gmu)].map(match=>match[1]));
    imports.push(...[...contents.matchAll(/\bimport\s*\(\s*['"]((?:\.|@\/)[^'"]+)['"]\s*\)/gu)].map(match=>match[1]));
    imports.push(...[...contents.matchAll(/new\s+URL\s*\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gu)].map(match=>match[1]));
    for(const specifier of imports){const requested=specifier.startsWith('@/')?path.resolve(repo,'src',specifier.slice(2)):path.resolve(path.dirname(source),specifier);assert.ok(requested.startsWith(repo+path.sep));
      const candidates=[requested,...['.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx'].map(suffix=>requested+suffix)];const resolved=candidates.find(file=>existsSync(file)&&lstatSync(file).isFile());assert.ok(resolved,`Unresolved local import: ${relative} -> ${specifier}`);queue.push(path.relative(repo,resolved).replaceAll('\\','/'));}
  }
  assert.ok(result.size>0);return result;
}

export function buildFixtureEnvironment(dataRoot,source=process.env){
  const result={NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',VISUALMAKER_DATA_DIR:dataRoot,VISUALMAKER_AI_ENABLED:'0'};
  for(const name of ['Path','PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE'])if(typeof source[name]==='string')result[name]=source[name];
  for(const name of ['AI_GATEWAY_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','VISUALMAKER_AI_MODEL'])assert.equal(Object.hasOwn(result,name),false);
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'Preparation does not accept a caller-supplied fixture path');const {root}=await prepareBackupBrowserFixture();process.stdout.write(JSON.stringify({prepared:true,root,proofPath:checkedPath(root,proofName),backupPath:checkedPath(root,'synthetic-source-backup.zip')})+'\n');
}
