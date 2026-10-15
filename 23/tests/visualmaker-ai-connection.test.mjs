import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConnectionStatus} from '../visualmaker/core/ai-connection.ts';
import {aiConfiguration} from '../visualmaker/core/ai-analysis-job.ts';
import {studioToken} from '../visualmaker/core/http.ts';
import {GET} from '../src/app/api/studio/ai-connection/route.ts';

const good={enabled:'1',cliPath:process.execPath,modelId:'codex/test-model'};

test('local connection checks exactly match AI job readiness and never serialize credentials',()=>{
  const variants=[good,{}, {...good,enabled:'0'}, {...good,cliPath:' '},{...good,cliPath:'relative-codex.exe'},
    {...good,cliPath:'C:/missing/codex.exe'},{...good,modelId:'provider'},
    {...good,modelId:'codex/test-model '},{...good,modelId:'codex/'.concat('m'.repeat(160))}];
  for(const config of variants){
    const status=aiConnectionStatus(config);
    assert.equal(status.ready,aiConfiguration(config).available);
    assert.equal(status.ready,status.checks.enabled&&status.checks.cliAvailable&&status.checks.modelConfigured);
    assert.deepEqual([status.providerVerified,status.productionAuthority,status.externalCalls],[false,false,0]);
    assert.equal(JSON.stringify(status).includes(process.execPath),false);
    assert.equal(Object.hasOwn(status,'modelId'),false);
  }
  assert.deepEqual(aiConnectionStatus(good).checks,{enabled:true,cliAvailable:true,modelConfigured:true});
});

test('guarded GET returns bounded, noncached status and rejects query options',async()=>{
  const previous=Object.fromEntries(['VISUALMAKER_AI_ENABLED','VISUALMAKER_CODEX_CLI_PATH','VISUALMAKER_AI_MODEL'].map(name=>[name,process.env[name]]));
  try{
    process.env.VISUALMAKER_AI_ENABLED='1';
    process.env.VISUALMAKER_CODEX_CLI_PATH=process.execPath;
    process.env.VISUALMAKER_AI_MODEL='codex/test-model';
    const url='http://127.0.0.1:61354/api/studio/ai-connection';
    const headers={'x-visualmaker-token':studioToken(),host:'127.0.0.1:61354'};
    const response=await GET(new Request(url,{headers}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    const body=await response.json();
    assert.equal(body.ready,true);
    assert.equal(JSON.stringify(body).includes(process.execPath),false);
    assert.equal((await GET(new Request(`${url}?debug=1`,{headers}))).status,400);
    assert.equal((await GET(new Request(url,{headers:{host:'127.0.0.1:61354'}}))).status,403);
  }finally{
    for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
