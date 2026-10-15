// Serve the current blocked episode authority in a fresh, isolated Studio.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {checkedFixturePath} from './finalization-browser-server.mjs';

const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const temporaryParent=realpathSync(os.tmpdir());
const root=realpathSync(mkdtempSync(path.join(temporaryParent,'vm-finalization-blocked-')));
assert.equal(path.dirname(root),temporaryParent);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePath=relative=>checkedFixturePath(repo,relative);
const targetPath=relative=>checkedFixturePath(root,relative);
const inventory=[];
function put(relative,bytes,kind){
  const target=targetPath(relative);mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(targetPath(relative),bytes,{flag:'wx'});
  inventory.push({path:relative,sha256:sha(bytes),bytes:bytes.length,kind});
}
function filesUnder(relative){
  return readdirSync(sourcePath(relative),{withFileTypes:true}).flatMap(entry=>{
    assert.equal(entry.isSymbolicLink(),false);
    const child=relative+'/'+entry.name;
    return entry.isDirectory()?filesUnder(child):[child];
  });
}
function localImports(source,bytes){
  const imports=[];
  const parsed=ts.createSourceFile(source,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
  function visit(node){
    const literal=(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))?node.moduleSpecifier
      :ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword?node.arguments[0]
      :ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)?node.argument.literal:undefined;
    if(literal&&ts.isStringLiteral(literal)&&/^(?:\.|@\/)/u.test(literal.text))imports.push(literal.text);
    ts.forEachChild(node,visit);
  }
  visit(parsed);return imports;
}
const queue=[...filesUnder('src/app/studio'),...filesUnder('src/app/api/studio'),
  ...filesUnder('src/components/studio'),'src/app/layout.tsx','src/app/globals.css',
  'next.config.ts','tsconfig.json','next-env.d.ts','package.json',
  'visualmaker/worker.ts','visualmaker/renderer/finalization-runner.ts',
  'visualmaker/renderer/episode-runner.ts','visualmaker/renderer/audio-assembly-runner.ts',
  'video/scripts/validate-production-stage.mjs','video/scripts/validate-episode-spec.mjs',
  'video/scripts/validate-narration-plan.mjs','video/scripts/validate-render-authority.mjs',
  'video/scripts/validate-cut-assets.mjs','video/scripts/validate-cut-visual-states.mjs'];
const copied=new Set();
while(queue.length){
  const relative=queue.shift();if(copied.has(relative))continue;copied.add(relative);
  assert.ok(!relative.includes('.env'));
  const source=sourcePath(relative),bytes=readFileSync(source);
  assert.ok(bytes.length<2_000_000,`Unexpectedly large code input: ${relative}`);
  put(relative,bytes,'unchanged-source');
  if(!/\.[cm]?[jt]sx?$/u.test(relative))continue;
  for(const specifier of localImports(source,bytes)){
    const requested=specifier.startsWith('@/')?sourcePath('src/'+specifier.slice(2)):path.resolve(path.dirname(source),specifier);
    assert.ok(requested.startsWith(repo+path.sep));
    const candidates=[requested,...['.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx'].map(suffix=>requested+suffix)];
    const resolved=candidates.find(file=>existsSync(file)&&lstatSync(file).isFile());
    assert.ok(resolved,`Unresolved code dependency: ${relative} -> ${specifier}`);
    const dependency=path.relative(repo,resolved).replaceAll('\\','/');
    assert.ok(!dependency.startsWith('video/src/generated/'),'Do not copy generated production inputs implicitly');
    queue.push(dependency);
  }
}
const specPath='video/episodes/episode-001/episode-spec.json',statePath='video/episodes/episode-001/production-state.json';
const specBytes=readFileSync(sourcePath(specPath)),stateBytes=readFileSync(sourcePath(statePath));
const spec=JSON.parse(specBytes),state=JSON.parse(stateBytes);
assert.equal(spec.episode_id,'episode-001');assert.equal(state.episode_id,'episode-001');
// This branch proves the real absent post-lock locator. Do not manufacture a
// missing-file failure if the actual episode has progressed since this helper.
assert.equal(spec.post_lock_output,undefined,'Episode now has a post-lock locator; re-evaluate the blocked acceptance scope');
assert.equal(state.stage,'timing-draft');assert.equal(state.active_cut_root,null);
put(specPath,specBytes,'unchanged-current-authority');put(statePath,stateBytes,'unchanged-current-authority');
mkdirSync(targetPath('.fixture-data'));
const dependencyTarget=realpathSync(path.join(repo,'node_modules'));
symlinkSync(dependencyTarget,targetPath('node_modules'),process.platform==='win32'?'junction':'dir');
assert.equal(realpathSync(path.join(root,'node_modules')),dependencyTarget);
mkdirSync(targetPath('browser-evidence'));
const evidenceFile=name=>targetPath('browser-evidence/'+name);
writeFileSync(evidenceFile('source-inventory.json'),JSON.stringify({sourceRoot:repo,root,inventory,dependencyTarget,scope:'Current real spec/state unchanged; no media or user DB copied. Missing post-lock locator is intrinsic to the current real spec; other production gates are not claimed.'},null,2),{flag:'wx'});
const port=await new Promise((resolve,reject)=>{const reservation=net.createServer();reservation.once('error',reject);reservation.listen(0,'127.0.0.1',()=>{const selected=reservation.address().port;reservation.close(error=>error?reject(error):resolve(selected));});});
const env={NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',VISUALMAKER_DATA_DIR:targetPath('.fixture-data')};
for(const name of ['Path','PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE'])if(process.env[name])env[name]=process.env[name];
const logPath=evidenceFile('next-server.log'),log=createWriteStream(logPath,{flags:'wx'});
// node_modules is the one explicit read-only junction; writes remain under root.
const next=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
next.stdout.pipe(log,{end:false});next.stderr.pipe(log,{end:false});
const url=`http://127.0.0.1:${port}`;
let exited=false;next.once('exit',(code,signal)=>{exited=true;log.end();console.log(JSON.stringify({event:'server-exited',code,signal}));});
next.once('error',error=>console.error(JSON.stringify({event:'server-error',message:error.message})));
const server={url:url+'/studio',pid:next.pid,supervisorPid:process.pid,root,logPath};
writeFileSync(evidenceFile('server.json'),JSON.stringify(server,null,2),{flag:'wx'});
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
  const html=await response.text(),tokenMatch=html.match(/(?:\\?"token\\?")\s*:\s*\\?"([a-f0-9]{64})\\?"/u);
  assert.ok(tokenMatch,'Studio did not serialize its normal local token');
  const headers={'x-visualmaker-token':tokenMatch[1]};
  const createdResponse=await fetch(url+'/api/studio',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({operation:'episode'})});
  assert.equal(createdResponse.status,201,'Normal episode import did not create a project');
  const created=await createdResponse.json(),plan=created.plan;
  assert.equal(plan.origin.sha256,sha(specBytes));assert.equal(plan.productionAuthority,false);
  assert.equal(plan.scenes.length,spec.cuts.length);
  const listingResponse=await fetch(url+'/api/studio',{headers});assert.equal(listingResponse.status,200);
  const listing=await listingResponse.json();assert.ok(listing.projects.some(item=>item.id===plan.id&&item.revision===plan.revision));
  const readinessResponse=await fetch(`${url}/api/studio/finalization?projectId=${plan.id}&baseRevision=${plan.revision}`,{headers});
  assert.equal(readinessResponse.status,200);
  const readiness=await readinessResponse.json(),serialized=JSON.stringify(readiness);
  assert.equal(readiness.readiness.renderEligible,false);assert.equal(readiness.readiness.productionAuthority,false);assert.equal(readiness.readiness.reviewApproved,false);
  assert.deepEqual(readiness.readiness.blockers.map(item=>item.code),['post-lock-contract-missing']);
  assert.deepEqual(readiness.readiness.validators,[]);
  assert.ok(!serialized.includes(root)&&!serialized.includes(root.replaceAll('\\','/')));
  assert.ok(!serialized.includes('executionContract')&&!serialized.includes('binding')&&!serialized.includes('fingerprints'));
  for(const [relative,original] of [[specPath,specBytes],[statePath,stateBytes]]){
    assert.equal(sha(readFileSync(sourcePath(relative))),sha(original),'Real authority changed during probe');
    assert.equal(sha(readFileSync(targetPath(relative))),sha(original),'Mirrored authority changed during probe');
  }
  const result={...server,projectId:plan.id,revision:plan.revision,cutCount:plan.scenes.length,studioStatus:response.status,createProjectStatus:createdResponse.status,planListingStatus:listingResponse.status,readinessStatus:readinessResponse.status,readiness,specSha256:sha(specBytes),stateSha256:sha(stateBytes),sourceFiles:inventory.length,scope:'Actual absent post-lock locator from unchanged current real spec; later production gates were not run.'};
  writeFileSync(evidenceFile('http-startup-proof.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify({event:'http-ready',...result}));
}catch(error){
  console.error(JSON.stringify({event:'first-broken-boundary',message:error.message,logPath}));
  shutdown();process.exitCode=1;
}
