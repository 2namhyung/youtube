import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveCodexCli,runCodexProcess} from '../visualmaker/core/ai-codex-cli.ts';

const fixture=mkdtempSync(path.join(os.tmpdir(),'vm-codex-fixture-'));
const script=path.join(fixture,'mock-cli.cjs');
writeFileSync(script,`
const fs=require('node:fs');
const args=process.argv.slice(2);
let prompt=''; process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>prompt+=chunk);
process.stdin.on('end',()=>{
  const mode=process.env.VM_SYNTHETIC_MODE||'valid';
  if(mode==='hang'){setInterval(()=>{},1000);return;}
  if(mode==='nonzero'){process.stderr.write('SECRET_PROVIDER_RESPONSE');process.exit(7);}
  const file=args[args.indexOf('-o')+1];
  const schema=args[args.indexOf('--output-schema')+1];
  const payload={args,prompt,schema:JSON.parse(fs.readFileSync(schema,'utf8')),
    cwd:process.cwd(),hasApiKey:!!process.env.AI_GATEWAY_API_KEY,hasMode:!!process.env.VM_SYNTHETIC_MODE};
  fs.writeFileSync(file,mode==='invalid'?'not-json':mode==='oversize'?'x'.repeat(600000):
    mode==='near'?JSON.stringify({large:'한'.repeat(60000)}):JSON.stringify(payload));
});
`);
process.on('exit',()=>rmSync(fixture,{recursive:true,force:true}));
const schema={type:'object',additionalProperties:false,required:['records'],properties:{records:{type:'array'}}};
const invoke=(signal=new AbortController().signal,timeoutMs=3000)=>runCodexProcess(process.execPath,[script],'codex/default','PRIVATE_SCRIPT_SENTINEL',schema,signal,timeoutMs);
const waitUntil=async(check,limitMs=3000)=>{
  const deadline=Date.now()+limitMs;
  while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.fail('Synthetic subprocess did not reach expected state');
};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

test('Codex runner uses stdin, private cwd, schema, disabled tools and filtered environment',async()=>{
  const prior=process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY='SECRET_API_KEY';
  try{
    const result=await invoke();
    assert.equal(result.prompt,'PRIVATE_SCRIPT_SENTINEL');
    assert.deepEqual(result.schema,schema);
    assert.equal(result.hasApiKey,false);
    assert.equal(result.hasMode,false);
    assert.ok(result.cwd.startsWith(os.tmpdir()));
    assert.ok(result.args.includes('--no-daemon'));
    assert.ok(result.args.includes('--ignore-user-config'));
    assert.ok(result.args.includes('--ignore-rules'));
    assert.ok(result.args.includes('--ephemeral'));
    assert.ok(result.args.includes('--output-schema'));
    assert.ok(result.args.includes('read-only'));
    assert.ok(result.args.includes('web_search="disabled"'));
    assert.ok(result.args.includes('shell_tool'));
    assert.equal(result.args.at(-1),'-');
    assert.equal(result.args.some(arg=>arg.includes('PRIVATE_SCRIPT_SENTINEL')),false);
    assert.equal(existsSync(result.cwd),false);
  }finally{if(prior===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=prior;}
});

test('Codex runner rejects malformed, oversized, failed and interrupted subprocess output',async()=>{
  const near=path.join(fixture,'mock-near.cjs');
  writeFileSync(near,readFileSync(script,'utf8').replace('const mode=process.env.VM_SYNTHETIC_MODE||\'valid\';',"const mode='near';"));
  const nearResult=await runCodexProcess(process.execPath,[near],'codex/default','private',schema,new AbortController().signal,3000);
  assert.equal(nearResult.large.length,60000);
  for(const mode of ['invalid','oversize','nonzero','hang']){
    const mock=path.join(fixture,`mock-${mode}.cjs`);
    writeFileSync(mock,readFileSync(script,'utf8').replace('const mode=process.env.VM_SYNTHETIC_MODE||\'valid\';',`const mode='${mode}';`));
    await assert.rejects(runCodexProcess(process.execPath,[mock],'codex/default','private',schema,new AbortController().signal,mode==='hang'?500:3000));
  }
  const controller=new AbortController();
  const mock=path.join(fixture,'mock-cancel.cjs');
  writeFileSync(mock,readFileSync(script,'utf8').replace('const mode=process.env.VM_SYNTHETIC_MODE||\'valid\';',"const mode='hang';"));
  const pending=runCodexProcess(process.execPath,[mock],'codex/default','private',schema,controller.signal,3000);
  setTimeout(()=>controller.abort(),150);
  await assert.rejects(pending);
});

test('CLI path resolver rejects relative and missing paths',()=>{
  assert.equal(resolveCodexCli('relative.exe'),null);
  assert.equal(resolveCodexCli(path.join(fixture,'missing.exe')),null);
  assert.equal(resolveCodexCli(process.execPath),process.execPath);
});

test('cancel waits for synthetic process tree termination and owned Temp cleanup',async()=>{
  const marker=path.join(fixture,'tree-marker.json'),treeScript=path.join(fixture,'mock-tree.cjs');
  writeFileSync(treeScript,`
    const fs=require('node:fs'),{spawn}=require('node:child_process');
    const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    fs.writeFileSync(process.argv[2],JSON.stringify({parent:process.pid,grandchild:grandchild.pid,cwd:process.cwd()}));
    process.stdin.resume();setInterval(()=>{},1000);
  `);
  const controller=new AbortController();
  const pending=runCodexProcess(process.execPath,[treeScript,marker],'codex/default','private',schema,controller.signal,5000);
  // Attach a handler immediately, including if marker creation or an assertion fails.
  void pending.catch(()=>{});
  let state;
  try{
    await waitUntil(()=>{
      try{
        if(!existsSync(marker))return false;
        const value=JSON.parse(readFileSync(marker,'utf8'));
        if(!Number.isInteger(value.parent)||!Number.isInteger(value.grandchild)||value.parent<1||value.grandchild<1)return false;
        state=value;return true;
      }catch{return false;}
    });
    assert.equal(alive(state.parent),true);assert.equal(alive(state.grandchild),true);
    controller.abort();
    await assert.rejects(pending);
    await waitUntil(()=>!alive(state.parent)&&!alive(state.grandchild));
    assert.equal(existsSync(state.cwd),false);
  }finally{
    controller.abort();
    if(state)for(const pid of [state.grandchild,state.parent])if(alive(pid))try{process.kill(pid,'SIGKILL');}catch{}
    await Promise.race([pending.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);
    if(state)await waitUntil(()=>!alive(state.parent)&&!alive(state.grandchild),1500);
  }
});
