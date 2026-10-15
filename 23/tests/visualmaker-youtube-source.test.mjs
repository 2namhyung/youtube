import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,lstatSync,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {dataRoot,getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {inspectYouTubeSource,acquireYouTubeSource,YOUTUBE_CC_LABEL} from '../visualmaker/core/youtube-source.ts';
import {inspectArgs,downloadArgs,runBoundedProcess} from '../visualmaker/core/youtube-cli.ts';
import {validYouTubeInspect,validYouTubeAcquire,currentYouTubeRequest} from '../src/components/studio/youtube-source-client.ts';
import {POST as inspectPost} from '../src/app/api/studio/youtube-inspect/route.ts';
import {POST as acquirePost} from '../src/app/api/studio/youtube-acquire/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';

const id='abcdefghijk',url=`https://www.youtube.com/watch?v=${id}`;
const base='http://127.0.0.1:8138';
function isolated(){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-yt-source-'));
  let plan=insertProject(importEpisode());
  const scene=plan.scenes.find(scene=>scene.candidates.some(candidate=>candidate.mode==='source-video'));
  assert.ok(scene);const candidate=scene.candidates.find(row=>row.mode==='source-video');
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:scene.id,candidateId:candidate.id});
  const requirement=plan.requirements.find(row=>candidate.requirementIds.includes(row.id)&&row.mediaType==='video');
  assert.ok(requirement);
  return {plan,requirement,input:{projectId:plan.id,baseRevision:plan.revision,requirementId:requirement.id,
    scriptSha256:plan.script.rawSha256,url}};
}
function metadata(change={}){return {id,extractor_key:'Youtube',webpage_url:url,_type:'video',availability:'public',live_status:'not_live',
  is_live:false,title:'Synthetic public video',channel:'Fixture creator',channel_id:'UCfixture',duration:5,upload_date:'20260102',
  license:YOUTUBE_CC_LABEL,formats:[{format_id:'18',ext:'mp4',protocol:'https',vcodec:'avc1',acodec:'mp4a',
    width:640,height:360,filesize:100000}],...change};}
function runnerFactory(meta=metadata(),bytes=Buffer.from('dummy')){const calls=[];const runner=async request=>{
  calls.push(request);
  if(request.args.includes('--dump-single-json'))return Buffer.from(JSON.stringify(meta));
  return bytes;
};return {runner,calls};}
function scope(input){return {projectId:input.projectId,revision:input.baseRevision,requirementId:input.requirementId,scriptSha256:input.scriptSha256};}

test('canonical URL and fixed CLI arguments reject unsafe input before any subprocess',async()=>{
  const {input}=isolated(),{runner,calls}=runnerFactory();
  for(const bad of ['https://evil.test/watch?v='+id,`https://www.youtube.com/watch?v=${id}&list=PL1`,
    `https://www.youtube.com/watch?v=${id}&v=${id}`,`https://u:p@www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/playlist?list=PL1`,`-o /tmp/x`])
    await assert.rejects(inspectYouTubeSource({...input,url:bad},{runner}));
  assert.equal(calls.length,0);
  assert.deepEqual(inspectArgs(url).slice(-2),['--',url]);
  assert.deepEqual(downloadArgs(url,'18').slice(-2),['--',url]);
  assert.ok(inspectArgs(url).includes('--no-plugin-dirs'));
  assert.ok(downloadArgs(url,'18').includes('--no-remote-components'));
  assert.equal((await inspectYouTubeSource({...input,url:`https://youtu.be/${id}`},{runner})).canonicalUrl,url);
});

test('inspection exposes bounded public metadata while standard and free titles remain ineligible',async()=>{
  const {input}=isolated(),{runner}=runnerFactory();const card=await inspectYouTubeSource(input,{runner});
  assert.equal(validYouTubeInspect(card,scope(input)),true);assert.equal(card.rightsEligible,true);
  assert.equal(JSON.stringify(card).includes('formatId'),false);assert.equal(JSON.stringify(card).includes('formats'),false);
  for(const raw of [metadata({license:'YouTube standard license'}),metadata({license:'free to reuse',title:'copyright free'}),metadata({license:null})]){
    const result=await inspectYouTubeSource(input,{runner:runnerFactory(raw).runner});
    assert.equal(result.rightsEligible,false);assert.equal(validYouTubeInspect(result,scope(input)),true);
    await assert.rejects(acquireYouTubeSource({...input,metadataSha256:result.metadataSha256,semanticNote:'장면에 맞음',evidenceOnly:false},
      {runner:runnerFactory(raw).runner}),error=>error.status===409);
  }
  assert.equal(getProject(input.projectId).assets.length,0);
});

test('wrong identity, playlist, live, private, creator, format and malformed JSON fail closed',async()=>{
  const {input}=isolated();
  for(const raw of [metadata({id:'wrong000000'}),metadata({extractor_key:'Generic'}),metadata({webpage_url:'https://evil.test/x'}),
    metadata({_type:'playlist'}),metadata({live_status:'is_live'}),metadata({availability:'private'}),metadata({channel:''}),
    metadata({duration:601})])await assert.rejects(inspectYouTubeSource(input,{runner:runnerFactory(raw).runner}));
  const noFormat=await inspectYouTubeSource(input,{runner:runnerFactory(metadata({formats:[{format_id:'18',ext:'mp4',protocol:'m3u8',vcodec:'avc1',acodec:'mp4a',width:640,height:360,filesize:100}]})).runner});
  assert.equal(noFormat.rightsEligible,false);
  for(const body of ['{}\n{}','{','x'.repeat(2_000_001)])await assert.rejects(inspectYouTubeSource(input,{runner:async()=>Buffer.from(body)}));
});

test('changed metadata and revision block acquisition before download or attach',async()=>{
  const {input,plan}=isolated(),card=await inspectYouTubeSource(input,{runner:runnerFactory().runner});
  const calls=[];await assert.rejects(acquireYouTubeSource({...input,metadataSha256:card.metadataSha256,semanticNote:'메모',evidenceOnly:false},
    {runner:async request=>{calls.push(request);return Buffer.from(JSON.stringify(metadata({license:'YouTube standard license'})));}}),error=>error.status===409);
  assert.equal(calls.length,1);assert.equal(getProject(plan.id).assets.length,0);
  updateProject(plan.id,plan.revision,{type:'edit-beat',beatId:plan.beats[0].id,intent:'새 의미',role:plan.beats[0].role});
  await assert.rejects(inspectYouTubeSource(input,{runner:runnerFactory().runner}),error=>error.status===409);
});

test('post-download license drift and invalid video bytes leave no asset',async()=>{
  const {input}=isolated(),card=await inspectYouTubeSource(input,{runner:runnerFactory().runner});
  let step=0;const drift=async request=>{
    step++;return step===1?Buffer.from(JSON.stringify(metadata())):step===2?Buffer.from('not mp4'):
      Buffer.from(JSON.stringify(metadata({license:'YouTube standard license'})));
  };
  await assert.rejects(acquireYouTubeSource({...input,metadataSha256:card.metadataSha256,semanticNote:'메모',evidenceOnly:false},{runner:drift}));
  assert.equal(step,2);assert.equal(getProject(input.projectId).assets.length,0);
  // The reinspection comparison uses normalized license and identity, not a mutable time stamp.
  const ff=spawnSync('ffmpeg',['-f','lavfi','-i','color=c=red:s=32x32:r=10','-t','0.3','-c:v','libx264',
    '-pix_fmt','yuv420p','-f','mp4','-movflags','frag_keyframe+empty_moov','pipe:1'],
    {windowsHide:true,maxBuffer:2_000_000,timeout:15_000});assert.equal(ff.status,0);
  step=0;const changed=async()=>{step++;return step===2?ff.stdout:Buffer.from(JSON.stringify(metadata(step===3?{license:'YouTube standard license'}:{})));};
  await assert.rejects(acquireYouTubeSource({...input,metadataSha256:card.metadataSha256,semanticNote:'메모',evidenceOnly:false},{runner:changed}),error=>error.status===409);
  assert.equal(step,3);assert.equal(getProject(input.projectId).assets.length,0);
});

test('bounded local subprocess enforces stdout cap, timeout and abort',async()=>{
  const args=script=>['-e',script];
  assert.equal((await runBoundedProcess(process.execPath,{args:args('process.stdout.write("ok")'),maxBytes:10,timeoutMs:3000})).toString(),'ok');
  await assert.rejects(runBoundedProcess(process.execPath,{args:args('process.stdout.write("x".repeat(10000))'),maxBytes:100,timeoutMs:3000}),
    error=>error.status===413);
  await assert.rejects(runBoundedProcess(process.execPath,{args:args('setTimeout(()=>{},10000)'),maxBytes:100,timeoutMs:100}),
    error=>error.status===504);
  const controller=new AbortController();const pending=runBoundedProcess(process.execPath,
    {args:args('setTimeout(()=>{},10000)'),maxBytes:100,timeoutMs:3000,signal:controller.signal});
  setTimeout(()=>controller.abort(),50);await assert.rejects(pending,error=>error.status===409);
});

test('timeout and abort terminate the owned descendant process tree',async()=>{
  const script='const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit",windowsHide:true});require("node:fs").writeFileSync(process.argv[1],JSON.stringify({parent:process.pid,descendant:c.pid}));setInterval(()=>{},1000)';
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  const awaitDead=async pid=>{for(let n=0;n<30;n++){if(!alive(pid))return;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.fail(`Owned descendant ${pid} was not terminated`);};
  const directory=mkdtempSync(path.join(os.tmpdir(),'vm-yt-tree-'));
  const file=path.join(directory,'timeout.pid'),abortFile=path.join(directory,'abort.pid');
  const controller=new AbortController();let pending;
  try{
    await assert.rejects(runBoundedProcess(process.execPath,{args:['-e',script,file],maxBytes:100,timeoutMs:500}),error=>error.status===504);
    assert.equal(existsSync(file),true);await awaitDead(JSON.parse(readFileSync(file,'utf8')).descendant);
    pending=runBoundedProcess(process.execPath,{args:['-e',script,abortFile],maxBytes:100,timeoutMs:3000,signal:controller.signal});
    for(let n=0;n<20&&!existsSync(abortFile);n++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(existsSync(abortFile),true);controller.abort();await assert.rejects(pending,error=>error.status===409);
    await awaitDead(JSON.parse(readFileSync(abortFile,'utf8')).descendant);
  }finally{
    controller.abort();if(pending)await pending.catch(()=>{});
    for(const target of [file,abortFile])if(existsSync(target))try{
      const owned=JSON.parse(readFileSync(target,'utf8'));
      for(const pid of [owned.parent,owned.descendant])if(Number.isSafeInteger(pid)&&pid>0&&alive(pid)){
        if(process.platform==='win32')spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),
          ['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:3000});
        else try{process.kill(pid,'SIGKILL');}catch{}
      }
    }catch{/* Preserve the original assertion failure. */}
    try{const temp=realpathSync(os.tmpdir()),actual=realpathSync(directory),stat=lstatSync(directory);
      const descendants=[file,abortFile].filter(target=>existsSync(target)).map(target=>JSON.parse(readFileSync(target,'utf8')).descendant);
      if(!descendants.some(pid=>Number.isSafeInteger(pid)&&alive(pid))&&!stat.isSymbolicLink()&&stat.isDirectory()&&
        path.dirname(actual).toLowerCase()===temp.toLowerCase()&&
        path.basename(actual).startsWith('vm-yt-tree-'))rmSync(actual,{recursive:true,force:false});
    }catch{/* Preserve the original assertion failure. */}
  }
});

test('synthetic local MP4 attaches atomically with version-unspecified rights observation',async()=>{
  const {input,requirement}=isolated(),out=path.join(mkdtempSync(path.join(os.tmpdir(),'vm-yt-mp4-')),'synthetic.mp4');
  const ff=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=64x64:r=10','-t','0.5','-c:v','libx264',
    '-pix_fmt','yuv420p',out],{windowsHide:true,encoding:'utf8',timeout:15_000});assert.equal(ff.status,0,ff.stderr?.slice(-300));
  const bytes=readFileSync(out),card=await inspectYouTubeSource(input,{runner:runnerFactory().runner});
  const {runner,calls}=runnerFactory(metadata(),bytes);
  const result=await acquireYouTubeSource({...input,metadataSha256:card.metadataSha256,semanticNote:'실제 움직임을 보여줌',evidenceOnly:false},{runner});
  assert.equal(validYouTubeAcquire(result,scope(input),card),true);
  assert.equal(calls.filter(call=>call.args.includes('--dump-single-json')).length,2);
  assert.equal(calls.filter(call=>call.args.includes('--output')).length,1);
  const asset=result.plan.assets.find(row=>row.id===result.assetId);assert.equal(asset.mimeType,'video/mp4');
  const receipt=JSON.parse(readFileSync(path.join(dataRoot(),'receipts',`${asset.id}.json`),'utf8'));
  assert.equal(receipt.youTubeSourceProvenance.downloadSha256,asset.sha256);
  assert.equal(receipt.automaticRightsPolicy.license,'YouTube CC BY (version unspecified)');
  const state=result.sourceReviewStates.find(row=>row.requirementId===requirement.id);
  assert.equal(state.current.rights.decision,'acceptable');assert.equal(state.current.source.decision,'pending');
  assert.equal(state.current.semantic.decision,'pending');assert.equal(result.plan.productionAuthority,false);
});

test('HTTP guards, exact bodies and stale client scope do not run the CLI',async()=>{
  const {input}=isolated(),body=JSON.stringify(input);
  for(const [handler,request] of [[inspectPost,new Request(base+'/api/studio/youtube-inspect',{method:'POST',body})],
    [acquirePost,new Request(base+'/api/studio/youtube-acquire',{method:'POST',body})]])assert.equal((await handler(request)).status,403);
  const wrong=await inspectPost(new Request(base+'/api/studio/youtube-inspect',{method:'POST',
    headers:{'x-visualmaker-token':studioToken()},body:JSON.stringify({...input,extra:1})}));assert.equal(wrong.status,400);
  assert.equal(currentYouTubeRequest(scope(input),{...scope(input),revision:input.baseRevision+1},1,1,false),false);
  assert.equal(currentYouTubeRequest(scope(input),scope(input),1,2,false),false);
  assert.equal(currentYouTubeRequest(scope(input),scope(input),1,1,true),false);
});

test('client rejects tampered inspection/acquisition and UI wires explicit actions only',async()=>{
  const {input}=isolated(),card=await inspectYouTubeSource(input,{runner:runnerFactory().runner});
  assert.equal(validYouTubeInspect({...card,rightsEligible:true,licenseLabel:'YouTube standard license'},scope(input)),false);
  assert.equal(validYouTubeInspect({...card,canonicalUrl:'https://evil.test/video'},scope(input)),false);
  assert.equal(validYouTubeInspect({...card,downloadUrl:'https://evil.test/file'},scope(input)),false);
  const ui=readFileSync(new URL('../src/components/studio/youtube-source.tsx',import.meta.url),'utf8');
  const parent=readFileSync(new URL('../src/components/studio/studio.tsx',import.meta.url),'utf8');
  assert.match(ui,/async function inspect\(event:FormEvent/);
  assert.match(ui,/async function acquire\(event:FormEvent/);
  assert.match(ui,/beginMutation\(\)/);
  assert.match(ui,/currentYouTubeRequest/);
  assert.match(parent,/candidate\.mode==='source-video'/);
  assert.match(parent,/onAcquired=\{youtubeAcquired\}/);
});
