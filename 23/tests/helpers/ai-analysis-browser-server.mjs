import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {checkedPath,checkedRoot,deriveAdoptionMapping,proofName} from './prepare-ai-analysis-browser.mjs';
import {validatePlan} from '../../visualmaker/core/director.ts';
import {readAIProposal} from '../../visualmaker/core/ai-analysis-job.ts';
import {getProject} from '../../visualmaker/core/store.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const forbidden=relative=>relative.split('/').some(part=>part.startsWith('.env')||['raw','wiki','data','generated','episodes','.next'].includes(part))||/\.(?:mp4|mov|png|jpe?g|webp|wav|mp3|sqlite)$/iu.test(relative);
const JOB_NAMES=['staleQueued','succeeded','needsReview','currentQueued','cancelled'];
const JOB_FIELDS=['jobId','status','attempt','checkpointAttempt','requestedRevision','snapshotSha256','outcome','externalCallStartedAt','responseSha256'];
const BASELINE_JOBS={
  staleQueued:{status:'queued',attempt:0,outcome:'not-started',externalCall:false,response:false,revisionOffset:-1},
  succeeded:{status:'succeeded',attempt:1,outcome:'succeeded',externalCall:true,response:true,revisionOffset:0},
  needsReview:{status:'needs-review',attempt:1,outcome:'needs-review',externalCall:true,response:false,revisionOffset:0},
  currentQueued:{status:'queued',attempt:0,outcome:'not-started',externalCall:false,response:false,revisionOffset:0},
  cancelled:{status:'cancelled',attempt:0,outcome:'cancelled-before-call',externalCall:false,response:false,revisionOffset:0},
};

function validateProofShape(proof,plan,planDocument,db){
  const segmentCount=proof.variant==='adoption'?5:2;
  assert.equal(plan.script.segments.length,segmentCount,'Fixture variant segment count changed');
  assert.deepEqual(Object.keys(proof.jobs).sort(),[...JOB_NAMES].sort(),'Fixture must prove exactly the five named jobs');
  assert.deepEqual(Object.keys(proof.jobs.succeeded).sort(),[...JOB_FIELDS].sort(),'Succeeded job proof fields changed');
  const ids=new Set();
  for(const name of JOB_NAMES){
    const expected=proof.jobs[name],baseline=BASELINE_JOBS[name];
    assert.deepEqual(Object.keys(expected).sort(),[...JOB_FIELDS].sort(),`${name} proof fields changed`);
    assert.match(expected.jobId,/^job_[a-f0-9-]{36}$/u);
    assert.equal(ids.has(expected.jobId),false,`Duplicate job identity: ${name}`);ids.add(expected.jobId);
    assert.equal(expected.status,baseline.status,`${name} baseline status was altered`);
    assert.equal(expected.attempt,baseline.attempt,`${name} baseline attempt was altered`);
    assert.equal(expected.checkpointAttempt,1,`${name} checkpoint attempt was altered`);
    assert.equal(expected.outcome,baseline.outcome,`${name} baseline checkpoint was altered`);
    assert.equal(expected.requestedRevision,proof.revision+baseline.revisionOffset,`${name} requested revision changed`);
    assert.match(expected.snapshotSha256,/^[a-f0-9]{64}$/u);
    if(baseline.externalCall){
      assert.equal(typeof expected.externalCallStartedAt,'string');
      assert.ok(Number.isFinite(Date.parse(expected.externalCallStartedAt)));
    }else assert.equal(expected.externalCallStartedAt,null);
    if(baseline.response)assert.equal(expected.responseSha256,proof.proposal.sha256);
    else assert.equal(expected.responseSha256,null);
  }
  assert.equal(proof.jobs.succeeded.snapshotSha256,proof.snapshotSha256);
  assert.equal(proof.jobs.needsReview.snapshotSha256,proof.snapshotSha256);
  assert.equal(proof.jobs.currentQueued.snapshotSha256,proof.snapshotSha256);
  assert.equal(proof.jobs.cancelled.snapshotSha256,proof.snapshotSha256);
  const previous=db.prepare('SELECT document FROM revisions WHERE project_id=? AND revision=?').get(proof.projectId,proof.revision-1);
  assert.ok(previous,'Stale fixture revision is missing');
  assert.equal(proof.jobs.staleQueued.snapshotSha256,sha(previous.document),'Stale job is not bound to the previous Plan revision');
  if(proof.variant==='adoption'){
    assert.equal(proof.adoptionMapping?.eligible?.length,2);
    assert.equal(proof.adoptionMapping?.locked?.selectedCandidateId?.length>0,true);
    assert.ok(proof.adoptionMapping.locked.candidateIds.includes(proof.adoptionMapping.locked.selectedCandidateId));
    assert.equal(proof.adoptionMapping.locked.reviewStatus,'direction-selected');
    assert.equal(proof.adoptionMapping.merged?.segments?.length,2);
    assert.notEqual(proof.adoptionMapping.merged.segments[0].segmentId,proof.adoptionMapping.merged.segments[1].segmentId);
  }else assert.equal(proof.adoptionMapping,null,'Default fixture cannot claim adoption mappings');
  assert.equal(Buffer.byteLength(planDocument),proof.initialPlanBytes);
}

export function validatePreparedFixture(givenRoot){
  const root=checkedRoot(givenRoot),proof=JSON.parse(readFileSync(checkedPath(root,proofName),'utf8'));
  assert.equal(proof.schemaVersion,'visualmaker-ai-browser-proof-v1');
  assert.equal(proof.marker,'visualmaker-ai-browser-owned-v1');
  assert.equal(proof.root,root);assert.equal(proof.dataRoot,checkedPath(root,'.fixture-data'));
  assert.equal(proof.test_only,true);assert.equal(proof.productionAuthority,false);
  assert.equal(proof.liveProviderCalls,0);assert.equal(proof.humanApproval,false);assert.equal(proof.mockCalls,2);
  assert.ok(proof.variant==='default'||proof.variant==='adoption');
  assert.equal(lstatSync(proof.dataRoot).isDirectory(),true);
  const db=new DatabaseSync(checkedPath(root,'.fixture-data/studio.sqlite'),{readOnly:true});
  try{
    const planRow=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(proof.projectId);
    assert.equal(planRow?.revision,proof.revision);
    const plan=JSON.parse(planRow.document);
    validateProofShape(proof,plan,planRow.document,db);
    assert.equal(Buffer.byteLength(planRow.document),proof.initialPlanBytes);
    assert.equal(sha(planRow.document),proof.initialPlanSha256);
    assert.equal(sha(planRow.document),proof.snapshotSha256);
    assert.equal(plan.script.rawSha256,proof.scriptSha256);
    const historyCount=db.prepare('SELECT COUNT(*) AS count FROM revisions WHERE project_id=?').get(proof.projectId).count;
    assert.equal(historyCount,proof.baselineHistoryCount);
    assert.equal(proof.baselineHistoryCount,proof.revision,'Baseline history must contain every immutable Plan revision');
    if(proof.variant==='adoption'){
      const previousDataRoot=process.env.VISUALMAKER_DATA_DIR;
      process.env.VISUALMAKER_DATA_DIR=proof.dataRoot;
      try{
        const current=validatePlan(getProject(proof.projectId));
        const mapping=deriveAdoptionMapping(current);
        assert.deepEqual(mapping,proof.adoptionMapping);
        const proposal=readAIProposal(proof.projectId,proof.revision,proof.jobs.succeeded.jobId);
        assert.equal(proposal.proposal.records.length,5);
        assert.deepEqual(proposal.proposal.records.map(record=>record.segmentId),current.script.segments.map(segment=>segment.id));
        for(const [index,record] of proposal.proposal.records.entries()){
          const segment=current.script.segments[index];
          assert.deepEqual(record.source,{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind});
        }
      }finally{
        if(previousDataRoot===undefined)delete process.env.VISUALMAKER_DATA_DIR;
        else process.env.VISUALMAKER_DATA_DIR=previousDataRoot;
      }
    }else assert.equal(proof.adoptionMapping,null);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM visualmaker_jobs WHERE project_id=? AND kind='ai-script-analysis'").get(proof.projectId).count,5);
    for(const name of JOB_NAMES){
      const expected=proof.jobs[name];
      const row=db.prepare('SELECT kind,status,attempt,project_id,requested_revision,snapshot_sha256 FROM visualmaker_jobs WHERE id=?').get(expected.jobId);
      const cp=db.prepare('SELECT attempt,outcome,external_call_started_at,response_sha256 FROM visualmaker_ai_analysis_attempts WHERE job_id=?').get(expected.jobId);
      assert.equal(row?.kind,'ai-script-analysis');assert.equal(row.project_id,proof.projectId);
      const browserCancelled=proof.variant==='default'&&(name==='staleQueued'||name==='currentQueued')&&row.status==='cancelled'&&cp?.outcome==='cancelled-before-call';
      assert.equal(browserCancelled||row.status===expected.status,true,`${name} runtime job state changed unexpectedly`);
      assert.equal(browserCancelled||cp?.outcome===expected.outcome,true,`${name} runtime checkpoint changed unexpectedly`);
      assert.equal(row.attempt,expected.attempt);
      assert.equal(cp.attempt,expected.checkpointAttempt);
      assert.equal(row.requested_revision,expected.requestedRevision);
      assert.equal(row.snapshot_sha256,expected.snapshotSha256);
      assert.equal(cp.external_call_started_at,expected.externalCallStartedAt);
      assert.equal(cp.response_sha256,expected.responseSha256);
    }
    const success=proof.jobs.succeeded;
    const artifact=db.prepare('SELECT path,bytes,sha256 FROM visualmaker_job_artifacts WHERE job_id=? AND name=?').get(success.jobId,'ai-analysis-proposal.json');
    assert.equal(artifact?.path,proof.proposal.path.replace(/^\.fixture-data\//u,''));
    assert.equal(artifact.bytes,proof.proposal.bytes);assert.equal(artifact.sha256,proof.proposal.sha256);
  }finally{db.close();}
  const bytes=readFileSync(checkedPath(root,proof.proposal.path));
  assert.equal(bytes.length,proof.proposal.bytes);assert.equal(sha(bytes),proof.proposal.sha256);
  assert.equal(sha(Buffer.from(JSON.stringify(JSON.parse(bytes.toString('utf8'))))),proof.proposal.compactJsonSha256);
  return {root,proof};
}

function filesUnder(relative){
  return readdirSync(path.join(repo,relative),{withFileTypes:true}).flatMap(entry=>{
    assert.equal(entry.isSymbolicLink(),false);
    const child=`${relative}/${entry.name}`;
    return entry.isDirectory()?filesUnder(child):[child];
  });
}
export function collectSourceClosure(){
  const queue=[...filesUnder('src/app/studio'),...filesUnder('src/app/api/studio'),...filesUnder('src/components/studio'),
    'src/app/layout.tsx','src/app/globals.css','next.config.ts','tsconfig.json','next-env.d.ts','package.json',
    'visualmaker/worker.ts','visualmaker/core/jobs.ts','visualmaker/renderer/finalization-runner.ts',
    'visualmaker/renderer/finalization-engine.ts','visualmaker/renderer/episode-runner.ts','visualmaker/renderer/audio-assembly-runner.ts'];
  for(const optional of ['postcss.config.mjs','postcss.config.js'])if(existsSync(path.join(repo,optional)))queue.push(optional);
  const result=new Map();
  while(queue.length){
    const relative=queue.shift().replaceAll('\\','/');if(result.has(relative))continue;
    assert.equal(forbidden(relative),false,`Forbidden fixture source: ${relative}`);
    const source=path.resolve(repo,relative);assert.ok(source.startsWith(repo+path.sep));
    assert.equal(lstatSync(source).isFile(),true);assert.equal(realpathSync(source),source);
    const bytes=readFileSync(source);assert.ok(bytes.length<2_000_000);
    result.set(relative,bytes);
    if(!/\.[cm]?[jt]sx?$/u.test(relative))continue;
    const contents=bytes.toString('utf8');
    const localImports=[
      ...[...contents.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^\n]*?\sfrom\s*['"]((?:\.|@\/)[^'"]+)['"]/gmu)].map(match=>match[1]),
      ...[...contents.matchAll(/^\s*import\s*['"]((?:\.|@\/)[^'"]+)['"]/gmu)].map(match=>match[1]),
      ...[...contents.matchAll(/\bimport\s*\(\s*['"]((?:\.|@\/)[^'"]+)['"]/gu)].map(match=>match[1]),
      ...[...contents.matchAll(/new\s+URL\s*\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gu)].map(match=>match[1]),
    ];
    for(const specifier of localImports){
      const requested=specifier.startsWith('@/')?path.resolve(repo,'src',specifier.slice(2)):path.resolve(path.dirname(source),specifier);
      assert.ok(requested.startsWith(repo+path.sep));
      const candidates=[requested,...['.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx'].map(suffix=>requested+suffix)];
      const resolved=candidates.find(file=>existsSync(file)&&lstatSync(file).isFile());
      assert.ok(resolved,`Unresolved local import: ${relative} -> ${specifier}`);
      queue.push(path.relative(repo,resolved).replaceAll('\\','/'));
    }
  }
  return result;
}
function checkTree(root,relative=''){
  const folder=relative?checkedPath(root,relative):root;
  for(const entry of readdirSync(folder,{withFileTypes:true})){
    if(!relative&&entry.name==='node_modules')continue;
    const child=relative?`${relative}/${entry.name}`:entry.name;
    const candidate=checkedPath(root,child);
    if(lstatSync(candidate).isDirectory())checkTree(root,child);
  }
}
function reducedEnv(dataRoot){
  const env={NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',VISUALMAKER_DATA_DIR:dataRoot};
  for(const name of ['Path','PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
  for(const name of ['VISUALMAKER_AI_ENABLED','AI_GATEWAY_API_KEY','VISUALMAKER_AI_MODEL'])assert.equal(env[name],undefined);
  return env;
}
function stopOwnedChild(pid){
  if(!Number.isSafeInteger(pid)||pid<=0)return;
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:15_000});
  else{try{process.kill(pid,'SIGTERM');}catch{}}
}
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}

export async function startAIAnalysisBrowserServer(givenRoot){
  const {root,proof}=validatePreparedFixture(givenRoot);
  const dependency=checkedPath(root,'node_modules');
  if(!existsSync(dependency))symlinkSync(path.join(repo,'node_modules'),dependency,'junction');
  assert.equal(lstatSync(dependency).isSymbolicLink(),true);
  assert.equal(realpathSync(dependency),realpathSync(path.join(repo,'node_modules')));
  checkTree(root);
  const sources=collectSourceClosure(),inventory=[];
  for(const [relative,bytes] of sources){
    const target=checkedPath(root,relative);
    if(existsSync(target))assert.equal(sha(readFileSync(target)),sha(bytes),`Existing mirror source drift: ${relative}`);
    else{mkdirSync(path.dirname(target),{recursive:true});writeFileSync(checkedPath(root,relative),bytes,{flag:'wx'});}
    inventory.push({path:relative,sha256:sha(bytes)});
  }
  const runDir=checkedPath(root,`browser-run-${Date.now()}`);mkdirSync(runDir);
  const runFile=name=>checkedPath(root,path.relative(root,path.join(runDir,name)));
  writeFileSync(runFile('source-inventory.json'),JSON.stringify({sourceRoot:repo,sourceInventory:inventory},null,2),{flag:'wx'});
  const port=await freePort(),url=`http://127.0.0.1:${port}`,env=reducedEnv(proof.dataRoot);
  const logPath=runFile('next-server.log'),log=createWriteStream(logPath,{flags:'wx'});
  const next=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});
  next.stdout.pipe(log,{end:false});next.stderr.pipe(log,{end:false});
  const server={root,runDir,logPath,url:url+'/studio',supervisorPid:process.pid,childPid:next.pid,projectId:proof.projectId,revision:proof.revision};
  writeFileSync(runFile('server.json'),JSON.stringify(server,null,2),{flag:'wx'});
  process.stdout.write(JSON.stringify({event:'server-starting',...server})+'\n');
  let exited=false;next.once('exit',()=>{exited=true;log.end();});
  const shutdown=()=>{if(!exited)stopOwnedChild(next.pid);};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try{
    const deadline=Date.now()+120_000;let page;
    while(Date.now()<deadline){
      assert.equal(exited,false,'Next exited before ready');
      try{page=await fetch(url+'/studio',{signal:AbortSignal.timeout(10_000)});if(page.status===200)break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.equal(page?.status,200,'Studio startup timed out');
    const html=await page.text(),match=html.match(/(?:\\?"token\\?")\s*:\s*\\?"([a-f0-9]{64})\\?"/u);
    assert.ok(match,'Authenticated Studio token unavailable');
    const headers={'x-visualmaker-token':match[1]};
    const base=`${url}/api/studio/ai-analysis?projectId=${proof.projectId}&baseRevision=${proof.revision}`;
    const reportResponse=await fetch(base,{headers,cache:'no-store'});
    assert.equal(reportResponse.status,200);assert.equal(reportResponse.headers.get('cache-control'),'no-store');
    const {report}=await reportResponse.json();
    assert.equal(report.capability.available,false);assert.equal(report.capability.providerVerified,false);
    assert.equal(report.scope.snapshotSha256,proof.snapshotSha256);
    assert.equal(report.jobs.length,5);
    const proposalResponse=await fetch(`${base}&jobId=${proof.jobs.succeeded.jobId}&format=proposal`,{headers,cache:'no-store'});
    assert.equal(proposalResponse.status,200);assert.equal(proposalResponse.headers.get('cache-control'),'no-store');
    const {job,proposal}=await proposalResponse.json();
    assert.equal(job.jobId,proof.jobs.succeeded.jobId);
    assert.equal(job.artifact.sha256,proof.proposal.sha256);
    assert.equal(proposal.model.adapter,'sdk-test');
    assert.equal(sha(Buffer.from(JSON.stringify(proposal))),proof.proposal.sha256);
    const generic=await fetch(`${url}/api/studio/jobs?projectId=${proof.projectId}`,{headers,cache:'no-store'});
    assert.equal(generic.status,200);assert.deepEqual((await generic.json()).jobs,[]);
    validatePreparedFixture(root);
    const startup={...server,studioStatus:page.status,reportStatus:reportResponse.status,proposalStatus:proposalResponse.status,genericStatus:generic.status,
      sourceFiles:inventory.length,sourceInventorySha256:sha(Buffer.from(JSON.stringify(inventory))),test_only:true,liveProviderCalls:0,productionAuthority:false};
    writeFileSync(runFile('http-startup-proof.json'),JSON.stringify(startup,null,2),{flag:'wx'});
    process.stdout.write(JSON.stringify({event:'http-ready',...startup})+'\n');
    return startup;
  }catch(error){
    shutdown();process.stderr.write(JSON.stringify({event:'startup-failed',message:error instanceof Error?error.message:'unknown',logPath})+'\n');throw error;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,3,'Expected exactly one prepared Temp fixture root');
  await startAIAnalysisBrowserServer(process.argv[2]);
}
