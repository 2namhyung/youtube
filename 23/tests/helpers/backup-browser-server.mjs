import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkedPath,checkedRoot,buildFixtureEnvironment,collectSourceClosure,proofName,validatePreparedFixture} from './prepare-backup-browser.mjs';
import {BACKUP_LIMITS} from '../../visualmaker/core/backup.ts';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const forbidden=relative=>relative.split('/').some(part=>part.startsWith('.env')||['raw','wiki','data','generated','episodes','.next'].includes(part))||/\.(?:mp4|mov|png|jpe?g|webp|wav|mp3|sqlite|db)$/iu.test(relative);
const runPattern=/^browser-run-([a-f0-9-]{36})$/u;

function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();assert.ok(address&&typeof address==='object');const port=address.port;assert.ok(port>1024&&port!==8137&&port!==8138);server.close(error=>error?reject(error):resolve(port));});});}
function hashInventory(sources){return [...sources].map(([relative,bytes])=>({path:relative,bytes:bytes.length,sha256:sha(bytes)}));}
function copyClosure(root,sources){
  const inventory=[];
  for(const [relative,bytes] of sources){assert.equal(forbidden(relative),false);const target=checkedPath(root,relative);
    if(existsSync(target)){const existing=readFileSync(target);assert.equal(sha(existing),sha(bytes),`Source mirror differs: ${relative}`);}
    else{mkdirSync(path.dirname(target),{recursive:true});writeFileSync(checkedPath(root,relative),bytes,{flag:'wx'});}
    inventory.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
  }
  return inventory;
}
function assertInventory(root,inventory){
  assert.ok(Array.isArray(inventory)&&inventory.length>0);
  for(const item of inventory){assert.equal(forbidden(item.path),false);const bytes=readFileSync(checkedPath(root,item.path));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);}
  return sha(Buffer.from(JSON.stringify(inventory)));
}
function sourceRootIdentity(root){const stat=lstatSync(root);assert.ok(stat.isDirectory());assert.equal(stat.isSymbolicLink(),false);assert.equal(realpathSync(root),root);return {root,dev:stat.dev,ino:stat.ino};}
function processSnapshot(){
  if(process.platform==='win32'){
    const command='Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress';
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15_000});
    assert.equal(result.status,0,result.stderr);const rows=JSON.parse(result.stdout.trim());return (Array.isArray(rows)?rows:[rows]).map(row=>({pid:Number(row.ProcessId),parentPid:Number(row.ParentProcessId),executable:row.ExecutablePath??'',command:row.CommandLine??''}));
  }
  const result=spawnSync('ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',windowsHide:true,timeout:10_000});assert.equal(result.status,0,result.stderr);
  return result.stdout.split(/\r?\n/u).flatMap(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u);return match?[{pid:Number(match[1]),parentPid:Number(match[2]),executable:'',command:match[3]}]:[];});
}
function ownedProcessTree(record){
  const rows=processSnapshot(),root=rows.find(row=>row.pid===record.childPid);assert.ok(root,'Owned Next process is not running');
  assert.match(root.command,/next(?:\.js)?(?:\s|$)/iu);assert.ok(root.command.includes(record.root));assert.ok(root.command.includes('--hostname 127.0.0.1'));assert.ok(root.command.includes(`--port ${record.port}`));
  const pids=new Set([record.childPid]);let changed=true;while(changed){changed=false;for(const row of rows)if(pids.has(row.parentPid)&&!pids.has(row.pid)){pids.add(row.pid);changed=true;}}
  return {rows,pids:[...pids]};
}
function validateOwnedProcess(record){
  assert.equal(Number.isSafeInteger(record.childPid)&&record.childPid>0,true);assert.equal(Number.isSafeInteger(record.port)&&record.port>1024,true);assert.ok(record.port!==8137&&record.port!==8138);
  ownedProcessTree(record);
}
function terminateOwnedProcess(record){
  const {pids}=ownedProcessTree(record);
  if(process.platform==='win32'){
    const result=spawnSync('taskkill.exe',['/PID',String(record.childPid),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:15_000});
    assert.equal(result.status,0,`Could not stop owned Next process: ${result.stderr}`);return pids;
  }else process.kill(record.childPid,'SIGTERM');
  return pids;
}
async function waitStopped(record,ownedPids){
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline){
    const current=new Set(processSnapshot().map(row=>row.pid)),alive=ownedPids.some(pid=>current.has(pid));
    let listening=false;try{await new Promise((resolve,reject)=>{const socket=net.connect(record.port,'127.0.0.1');socket.once('connect',()=>{listening=true;socket.destroy();resolve();});socket.once('error',resolve);});}catch{listening=false;}
    if(!alive&&!listening)return;await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.fail('Owned server process or listener remained after stop');
}

export function validateOwnedServerRecord(givenRoot,record){
  const root=checkedRoot(givenRoot);assert.deepEqual(Object.keys(record).sort(),['schemaVersion','runId','root','appRoot','dataRoot','runDir','url','port','supervisorPid','childPid','sourceInventorySha256','sourceFiles','startedAt','state'].sort());
  assert.equal(record.schemaVersion,'visualmaker-backup-browser-server-v1');const match=path.basename(record.runDir).match(runPattern);assert.ok(match);
  const marker=JSON.parse(readFileSync(checkedPath(root,'fixture-marker.json'),'utf8'));assert.equal(record.runId,marker.runId);assert.equal(match[1],record.runId);
  assert.equal(record.root,root);assert.equal(record.appRoot,root);assert.equal(record.dataRoot,checkedPath(root,'.fixture-data'));
  assert.equal(checkedPath(root,path.relative(root,record.runDir)),record.runDir);assert.equal(lstatSync(record.runDir).isDirectory(),true);
  assert.match(record.url,new RegExp(`^http://127\\.0\\.0\\.1:${record.port}/studio$`,'u'));assert.ok(record.port!==8137&&record.port!==8138);
  assert.equal(record.supervisorPid>0,true);assert.equal(record.childPid>0,true);assert.equal(record.state==='starting'||record.state==='ready',true);
  assert.match(record.sourceInventorySha256,/^[a-f0-9]{64}$/u);assert.equal(record.sourceFiles>0,true);assert.ok(Number.isFinite(Date.parse(record.startedAt)));
  return record;
}

export async function startBackupBrowserServer(givenRoot){
  const {root,proof}=validatePreparedFixture(givenRoot);sourceRootIdentity(root);
  const dependency=checkedPath(root,'node_modules');
  if(!existsSync(dependency))symlinkSync(path.join(repo,'node_modules'),dependency,'junction');
  assert.equal(lstatSync(dependency).isSymbolicLink(),true);assert.equal(realpathSync(dependency),realpathSync(path.join(repo,'node_modules')));
  const sources=collectSourceClosure(),inventory=copyClosure(root,sources);assert.deepEqual(inventory,hashInventory(sources));
  assertInventory(root,inventory);
  const runDir=checkedPath(root,`browser-run-${proof.runId}`);mkdirSync(runDir);const runFile=name=>checkedPath(root,path.relative(root,path.join(runDir,name)));
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,url=origin+'/studio',env=buildFixtureEnvironment(proof.dataRoot);
  assert.equal(env.VISUALMAKER_DATA_DIR,proof.dataRoot);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.AI_GATEWAY_API_KEY,undefined);
  const logPath=runFile('server.log'),log=createWriteStream(logPath,{flags:'wx'}),executable=path.join(root,'node_modules/next/dist/bin/next');
  const child=spawn(process.execPath,[executable,'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});
  const record={schemaVersion:'visualmaker-backup-browser-server-v1',runId:proof.runId,root,appRoot:root,dataRoot:proof.dataRoot,runDir,url,port,supervisorPid:process.pid,childPid:child.pid,
    sourceInventorySha256:sha(Buffer.from(JSON.stringify(inventory))),sourceFiles:inventory.length,startedAt:new Date().toISOString(),state:'starting'};
  validateOwnedServerRecord(root,record);writeFileSync(runFile('source-inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});writeFileSync(runFile('server.json'),JSON.stringify(record,null,2),{flag:'wx'});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});let exited=false;child.once('exit',()=>{exited=true;log.end();});
  const shutdown=async()=>{if(exited)return;try{const owned=terminateOwnedProcess(record);await waitStopped(record,owned);}finally{log.end();}};
  process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
  try{
    const deadline=Date.now()+120_000;let page;
    while(Date.now()<deadline){assert.equal(exited,false,'Isolated Next server exited during startup');try{page=await fetch(url,{signal:AbortSignal.timeout(10_000),cache:'no-store'});if(page.status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
    assert.equal(page?.status,200,'Isolated Studio server did not become ready');const html=await page.text(),match=html.match(/(?:\\?"token\\?")\s*:\s*\\?"([a-f0-9]{64})\\?"/u);assert.ok(match,'Studio session token not found');
    const response=await fetch(`${origin}/api/studio/backup?projectId=${encodeURIComponent(proof.projectId)}&baseRevision=${proof.revision}`,{headers:{'x-visualmaker-token':match[1]},cache:'no-store'});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-type')??'',/^application\/zip/iu);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(Number(response.headers.get('content-length')),bytes.length);assert.ok(bytes.length>0&&bytes.length<=BACKUP_LIMITS.archive);assert.equal(bytes.subarray(0,4).toString('hex'),'504b0304');
    assert.equal(sha(bytes),proof.backup.sha256,'Server source backup differs from prepared core archive');
    record.state='ready';writeFileSync(runFile('server.json'),JSON.stringify(record,null,2),{flag:'w'});
    writeFileSync(runFile('startup-proof.json'),JSON.stringify({...record,studioStatus:page.status,backupStatus:response.status,backupBytes:bytes.length,backupSha256:sha(bytes),sourceInventorySha256:record.sourceInventorySha256,test_only:true,productionAuthority:false,liveProviderCalls:0},null,2),{flag:'wx'});
    process.stdout.write(JSON.stringify({event:'backup-browser-ready',...record,logPath})+'\n');return record;
  }catch(error){
    try{await shutdown();}catch{}process.stderr.write(JSON.stringify({event:'backup-browser-start-failed',message:error instanceof Error?error.message:'unknown',runDir,logPath})+'\n');throw error;
  }
}

export async function stopBackupBrowserServer(givenRoot,runId){
  const root=checkedRoot(givenRoot),proof=JSON.parse(readFileSync(checkedPath(root,proofName),'utf8'));assert.equal(runId,proof.runId,'Stop must name the exact fixture run');
  const runDir=checkedPath(root,`browser-run-${runId}`),statePath=checkedPath(root,path.relative(root,path.join(runDir,'server.json'))),record=JSON.parse(readFileSync(statePath,'utf8'));
  validateOwnedServerRecord(root,record);assert.equal(record.runId,runId);assert.equal(record.state,'ready');const owned=terminateOwnedProcess(record);await waitStopped(record,owned);
  const stopped={...record,state:'stopped',stoppedAt:new Date().toISOString()};writeFileSync(checkedPath(root,path.relative(root,statePath)),JSON.stringify(stopped,null,2),{flag:'w'});
  writeFileSync(checkedPath(root,path.relative(root,path.join(runDir,'shutdown-proof.json'))),JSON.stringify({runId,root,appRoot:record.appRoot,dataRoot:record.dataRoot,port:record.port,supervisorPid:record.supervisorPid,childPid:record.childPid,listenerAbsent:true,ownedProcessAbsent:true,stoppedAt:stopped.stoppedAt,test_only:true},null,2),{flag:'wx'});
  return stopped;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [action,givenRoot,runId]=process.argv.slice(2);assert.ok((action==='start'&&givenRoot&&runId===undefined)||(action==='stop'&&givenRoot&&runId),'Expected start <fixture-root> or stop <fixture-root> <run-id>');
  if(action==='start')await startBackupBrowserServer(givenRoot);else await stopBackupBrowserServer(givenRoot,runId);
}
