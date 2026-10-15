// Add current Studio sources to a retained, normally produced synthetic fixture.
// No successful jobs, approvals, media, or runtime evidence are fabricated here.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

// lstat catches junctions (including dangling links); realpath also rejects
// ancestors that would resolve outside the exact owned directory.
export function checkedFixturePath(base,relative){
  const target=path.resolve(base,relative);
  assert.ok(target.startsWith(base+path.sep),'Fixture path must remain inside its root');
  assert.equal(lstatSync(base).isSymbolicLink(),false,'Fixture root cannot be a link');
  assert.equal(realpathSync(base),base,'Fixture root must be its physical path');
  let current=base;
  const parts=path.relative(base,target).split(path.sep);
  for(let index=0;index<parts.length;index++){
    current=path.join(current,parts[index]);
    let stat;
    try{stat=lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}
    assert.equal(stat.isSymbolicLink(),false,`Fixture path cannot traverse a link: ${current}`);
    assert.equal(realpathSync(current),current,`Fixture path must be physical: ${current}`);
    if(index<parts.length-1)assert.equal(stat.isDirectory(),true,'Fixture ancestor must be a directory');
  }
  return target;
}

export function validatePreparedV2Proof(preparedProof,plan,sha){
  assert.equal(preparedProof.schemaVersion,'visualmaker-synthetic-v2-browser-prepared-v1');
  assert.equal(preparedProof.test_only,true);assert.equal(preparedProof.genuineHumanApproval,false);assert.equal(preparedProof.finalizationExecuted,false);assert.equal(preparedProof.browserTested,false);
  assert.equal(preparedProof.projectId,plan.id);assert.equal(preparedProof.revision,plan.revision);assert.equal(preparedProof.planSnapshotSha256,sha(JSON.stringify(plan)));
  assert.equal(preparedProof.selectionVersion,2);assert.equal(preparedProof.renderEligible,true);assert.equal(preparedProof.productionAuthority,false);assert.equal(preparedProof.reviewApproved,false);
  assert.equal(preparedProof.database?.finalizationJobs,0);assert.equal(preparedProof.database?.finalizationArtifacts,0);
}

async function startBrowserServer(){
const browserMode=process.argv.slice(3);assert.ok(browserMode.length===0||browserMode.length===1&&browserMode[0]==='--prepared-mix-v2','Unsupported browser fixture mode');
const preparedMixV2=browserMode.length===1;
const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const requestedRoot=path.resolve(process.argv[2]||'');
assert.equal(lstatSync(requestedRoot).isSymbolicLink(),false,'Supplied fixture root cannot be a link');
const root=realpathSync(requestedRoot);
assert.equal(path.dirname(root),realpathSync(os.tmpdir()));
assert.match(path.basename(root),/^vm-canonical-export-[A-Za-z0-9]+$/u);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(base,relative)=>{const target=path.resolve(base,relative);assert.ok(target.startsWith(base+path.sep));return target;};
const proof=JSON.parse(readFileSync(inside(root,'technical-proof.json'),'utf8'));
assert.match(proof.scope,/synthetic/u);
const plan=JSON.parse(readFileSync(inside(root,'fixture-plan.json'),'utf8'));
assert.equal(plan.productionAuthority,false);
let preparedProof=null;
if(preparedMixV2){
  for(const forbidden of ['durable-api-proof.json','durable-export-success.json','canonical-export-success.json','finalization-job-queued.json','finalization-job-terminal.json'])assert.equal(existsSync(checkedFixturePath(root,forbidden)),false,`Prepared v2 fixture cannot have a prior export: ${forbidden}`);
  preparedProof=JSON.parse(readFileSync(checkedFixturePath(root,'prepared-finalization-v2-browser.json'),'utf8'));
  validatePreparedV2Proof(preparedProof,plan,sha);
}else{
  const exportEvidence=JSON.parse(readFileSync(inside(root,'durable-export-success.json'),'utf8'));
  assert.equal(exportEvidence.job.status,'succeeded');
  assert.equal(exportEvidence.job.projectId,plan.id);
}
assert.equal(lstatSync(inside(root,'node_modules')).isSymbolicLink(),true);
assert.equal(realpathSync(inside(root,'node_modules')),realpathSync(inside(repo,'node_modules')));
assert.equal(lstatSync(checkedFixturePath(root,'.fixture-data')).isDirectory(),true,'Fixture data must be a real directory');
// Next and job workers write nested cache/data files themselves. Reject existing
// reparse points anywhere they could reach, with only the verified read-only
// dependency junction exempted.
function checkExistingTree(relative=''){
  const directory=relative?checkedFixturePath(root,relative):root;
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    if(!relative&&entry.name==='node_modules')continue;
    const child=relative?relative+'/'+entry.name:entry.name;
    const target=checkedFixturePath(root,child);
    if(lstatSync(target).isDirectory())checkExistingTree(child);
  }
}
checkExistingTree();

function filesUnder(relative){
  return readdirSync(inside(repo,relative),{withFileTypes:true}).flatMap(entry=>{
    assert.equal(entry.isSymbolicLink(),false);
    const child=relative+'/'+entry.name;
    return entry.isDirectory()?filesUnder(child):[child];
  });
}
const queue=[...filesUnder('src/app/studio'),...filesUnder('src/app/api/studio'),
  ...filesUnder('src/components/studio'),'src/app/layout.tsx','src/app/globals.css',
  'next.config.ts','tsconfig.json','next-env.d.ts','package.json',
  // Job spawn targets are pathname-derived, so static-import discovery alone
  // cannot see them. Mirror their complete current import closures explicitly.
  'visualmaker/worker.ts','visualmaker/core/jobs.ts',
  'visualmaker/renderer/finalization-runner.ts','visualmaker/renderer/finalization-engine.ts',
  'visualmaker/renderer/episode-runner.ts','visualmaker/renderer/audio-assembly-runner.ts'];
const sources=new Map();
while(queue.length){
  const relative=queue.shift();if(sources.has(relative))continue;
  assert.ok(!relative.includes('.env'));
  const source=inside(repo,relative),bytes=readFileSync(source);
  assert.ok(bytes.length<2_000_000);
  sources.set(relative,bytes);
  if(!/\.[cm]?[jt]sx?$/u.test(relative))continue;
  for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*\(|import\s*)['"]((?:\.|@\/)[^'"]+)['"]/gu)){
    const requested=match[1].startsWith('@/')?inside(repo,'src/'+match[1].slice(2)):path.resolve(path.dirname(source),match[1]);
    assert.ok(requested.startsWith(repo+path.sep));
    const candidates=[requested,...['.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx'].map(suffix=>requested+suffix)];
    const resolved=candidates.find(file=>existsSync(file)&&lstatSync(file).isFile());
    assert.ok(resolved,`Unresolved local source dependency: ${relative} -> ${match[1]}`);
    const dependency=path.relative(repo,resolved).replaceAll('\\','/');
    // The retained canonical generator owns these; never copy real generated files.
    if(dependency.startsWith('video/src/generated/'))continue;
    queue.push(dependency);
  }
}
// Validate every collision before any mirror write. Existing source bytes are evidence.
for(const [relative,bytes] of sources){
  const target=checkedFixturePath(root,relative);
  if(existsSync(target))assert.equal(sha(readFileSync(target)),sha(bytes),`Existing retained source differs: ${relative}`);
}
const originalEvidence=proof.unchangedCode.map(item=>({path:item.path,sha256:sha(readFileSync(inside(root,item.path)))}));
for(const item of proof.unchangedCode)assert.equal(originalEvidence.find(value=>value.path===item.path).sha256,item.sha256,`Retained proof code changed: ${item.path}`);
const runDir=checkedFixturePath(root,`browser-acceptance-${Date.now()}`);mkdirSync(runDir);
const runFile=name=>checkedFixturePath(root,path.relative(root,path.join(runDir,name)));
const sourceInventory=[];
for(const [relative,bytes] of sources){
  const target=checkedFixturePath(root,relative),added=!existsSync(target);
  if(added){mkdirSync(path.dirname(target),{recursive:true});writeFileSync(checkedFixturePath(root,relative),bytes,{flag:'wx'});}
  sourceInventory.push({path:relative,sha256:sha(bytes),added});
}
writeFileSync(runFile('source-inventory.json'),JSON.stringify({sourceRoot:repo,retainedRoot:root,originalEvidence,sourceInventory},null,2));
function guardPreparedDatabase(){
  if(!preparedMixV2)return null;
  const db=new DatabaseSync(checkedFixturePath(root,'.fixture-data/studio.sqlite'),{readOnly:true});
  try{
    const finalizationJobs=db.prepare("SELECT COUNT(*) AS count FROM visualmaker_jobs WHERE kind='episode-finalization-export'").get().count;
    const finalizationArtifacts=db.prepare("SELECT COUNT(*) AS count FROM visualmaker_job_artifacts WHERE name IN ('export.mp4','export.srt','export.vtt','export.png','export.json')").get().count;
    assert.equal(finalizationJobs,0,'Prepared v2 DB has finalization jobs');assert.equal(finalizationArtifacts,0,'Prepared v2 DB has export artifacts');
    assert.equal(preparedProof.database.finalizationJobs,0);assert.equal(preparedProof.database.finalizationArtifacts,0);
    const source=preparedProof.source;
    assert.match(preparedProof.sourceJobId,/^job_[a-f0-9-]{36}$/u);
    assert.equal(source.job_id,preparedProof.sourceJobId);assert.equal(source.attempt,preparedProof.sourceAttempt);
    assert.match(source.artifact_sha256,/^[a-f0-9]{64}$/u);assert.match(source.receipt_sha256,/^[a-f0-9]{64}$/u);
    const audioJob=db.prepare('SELECT id,kind,status,project_id,requested_revision,snapshot_sha256,attempt FROM visualmaker_jobs WHERE id=?').get(source.job_id);
    assert.equal(audioJob?.kind,'audio-timed-assembly');assert.equal(audioJob.status,'succeeded');assert.equal(audioJob.project_id,plan.id);assert.equal(audioJob.requested_revision,plan.revision);assert.equal(audioJob.snapshot_sha256,preparedProof.planSnapshotSha256);assert.equal(audioJob.attempt,source.attempt);
    assert.deepEqual({id:audioJob.id,status:audioJob.status,kind:audioJob.kind,attempt:audioJob.attempt,snapshotSha256:audioJob.snapshot_sha256},preparedProof.database.audioJob);
    const artifacts=db.prepare('SELECT name,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? ORDER BY name').all(source.job_id).map(item=>({name:item.name,bytes:item.bytes,sha256:item.sha256}));
    assert.deepEqual(artifacts,preparedProof.database.audioArtifacts);
    assert.deepEqual(artifacts.map(item=>item.name),['provisional-voiced-episode.json','provisional-voiced-episode.mp4']);
    const folder=`.fixture-data/jobs/${source.job_id}/attempt-${source.attempt}`;
    const receiptBytes=readFileSync(checkedFixturePath(root,`${folder}/provisional-voiced-episode.json`));
    const mp4Bytes=readFileSync(checkedFixturePath(root,`${folder}/provisional-voiced-episode.mp4`));
    assert.equal(sha(receiptBytes),source.receipt_sha256);assert.equal(sha(mp4Bytes),source.artifact_sha256);
    assert.equal(receiptBytes.length,artifacts[0].bytes);assert.equal(mp4Bytes.length,artifacts[1].bytes);
    const receipt=JSON.parse(receiptBytes.toString('utf8'));
    assert.equal(receipt.productionAuthority,false);assert.equal(receipt.reviewApproved,false);
    assert.equal(receipt.output.sha256,source.artifact_sha256);assert.equal(receipt.output.bytes,mp4Bytes.length);
    return {finalizationJobs,finalizationArtifacts,audioJobId:source.job_id,audioAttempt:source.attempt,sourceArtifactSha256:source.artifact_sha256,sourceReceiptSha256:source.receipt_sha256};
  }finally{db.close();}
}
const preparedDatabase=guardPreparedDatabase();
const port=await new Promise((resolve,reject)=>{const reservation=net.createServer();reservation.once('error',reject);reservation.listen(0,'127.0.0.1',()=>{const selected=reservation.address().port;reservation.close(error=>error?reject(error):resolve(selected));});});
const env={NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',VISUALMAKER_DATA_DIR:checkedFixturePath(root,'.fixture-data')};
for(const name of ['Path','PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
if(preparedMixV2){
  const inspection=`import {createHash} from 'node:crypto';import {evaluateFinalization} from './visualmaker/core/finalization.ts';const report=await evaluateFinalization(${JSON.stringify(plan.id)},${JSON.stringify(plan.revision)});const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');process.stdout.write(JSON.stringify({renderEligible:report.renderEligible,productionAuthority:report.productionAuthority,reviewApproved:report.reviewApproved,selectionVersion:report.binding?.selection.version,source:report.binding?.selection.source,reportSha256:sha(report)}));`;
  const fresh=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',inspection],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:120_000,maxBuffer:1_000_000});
  assert.equal(fresh.status,0,'Prepared v2 fresh readiness evaluation failed');
  const current=JSON.parse(fresh.stdout);
  assert.equal(current.renderEligible,true,'Prepared v2 readiness is no longer eligible');assert.equal(current.productionAuthority,false);assert.equal(current.reviewApproved,false);assert.equal(current.selectionVersion,2);
  assert.deepEqual(current.source,preparedProof.source);assert.equal(current.reportSha256,preparedProof.finalizationReportSha256);
  assert.deepEqual(guardPreparedDatabase(),preparedDatabase);
}
const logPath=runFile('next-server.log'),log=createWriteStream(logPath,{flags:'wx'});
const next=spawn(process.execPath,[inside(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
next.stdout.pipe(log,{end:false});next.stderr.pipe(log,{end:false});
const url=`http://127.0.0.1:${port}`;
let exited=false;next.once('exit',(code,signal)=>{exited=true;log.end();console.log(JSON.stringify({event:'server-exited',code,signal}));});
next.once('error',error=>console.error(JSON.stringify({event:'server-error',message:error.message})));
const server={url:url+'/studio',pid:next.pid,supervisorPid:process.pid,root,runDir,logPath,projectId:plan.id,revision:plan.revision};
writeFileSync(runFile('server.json'),JSON.stringify(server,null,2));
console.log(JSON.stringify({event:'server-starting',...server}));
const shutdown=()=>{if(!exited)next.kill('SIGTERM');};
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
try{
  let response;
  for(let attempt=0;attempt<90;attempt++){
    assert.equal(exited,false,'Next exited before HTTP startup');
    try{response=await fetch(url+'/studio',{signal:AbortSignal.timeout(60_000)});break;}
    catch(error){if(attempt===89)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  assert.equal(response.status,200,'Studio HTTP compilation failed; inspect server log');
  const html=await response.text();
  const tokenMatch=html.match(/(?:\\?"token\\?")\s*:\s*\\?"([a-f0-9]{64})\\?"/u);
  assert.ok(tokenMatch,'Studio did not serialize its normal local token');
  const headers={'x-visualmaker-token':tokenMatch[1]};
  const listingResponse=await fetch(url+'/api/studio',{headers});
  assert.equal(listingResponse.status,200);
  const listing=await listingResponse.json();
  assert.ok(listing.projects.some(item=>item.id===plan.id&&item.revision===plan.revision));
  const readinessResponse=await fetch(`${url}/api/studio/finalization?projectId=${plan.id}&baseRevision=${plan.revision}`,{headers});
  assert.equal(readinessResponse.status,200);
  const readiness=await readinessResponse.json(),serialized=JSON.stringify(readiness);
  assert.equal(readiness.readiness.renderEligible,true,`Finalization readiness blocked: ${JSON.stringify(readiness.readiness.blockers)}`);
  assert.equal(readiness.readiness.productionAuthority,false);
  assert.equal(readiness.readiness.reviewApproved,false);
  if(preparedMixV2){assert.equal(readiness.readiness.binding,undefined);assert.deepEqual(guardPreparedDatabase(),preparedDatabase);}
  assert.ok(!serialized.includes(root)&&!serialized.includes(root.replaceAll('\\','/')));
  assert.ok(!serialized.includes('executionContract')&&!serialized.includes('binding')&&!serialized.includes('fingerprints'));
  const result={...server,studioStatus:response.status,planListingStatus:listingResponse.status,readinessStatus:readinessResponse.status,readiness,sourceFiles:sourceInventory.length,addedSources:sourceInventory.filter(item=>item.added).length,syntheticOnly:true};
  writeFileSync(runFile('http-startup-proof.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({event:'http-ready',...result}));
}catch(error){
  console.error(JSON.stringify({event:'first-broken-boundary',message:error.message,logPath}));
  shutdown();process.exitCode=1;
}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await startBrowserServer();
