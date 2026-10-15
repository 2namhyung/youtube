import test from 'node:test';
import assert from 'node:assert/strict';
import {readAIConnectionStatus,validateAIConnectionStatus} from '../src/components/studio/ai-connection-client.ts';

const status={schemaVersion:'visualmaker-ai-connection-v2',provider:'codex-cli',
  checks:{enabled:false,cliAvailable:false,modelConfigured:false},ready:false,
  providerVerified:false,productionAuthority:false,externalCalls:0};
const clone=value=>structuredClone(value);

test('connection report validates exact public fields and readiness consistency',()=>{
  assert.deepEqual(validateAIConnectionStatus(status),status);
  const ready={...status,checks:{enabled:true,cliAvailable:true,modelConfigured:true},ready:true};
  assert.deepEqual(validateAIConnectionStatus(ready),ready);
  for(const changed of [
    {...status,secret:'private'},
    {...status,checks:{...status.checks,apiKey:'private'}},
    {...status,checks:{...status.checks,cliAvailable:true},ready:true},
    {...ready,ready:false},
    {...status,providerVerified:true},
    {...status,productionAuthority:true},
    {...status,externalCalls:1},
    {...status,provider:'local'},
    {...status,checks:{...status.checks,enabled:'false'}},
  ])assert.equal(validateAIConnectionStatus(changed),null);
  const missing=clone(status);delete missing.checks.modelConfigured;
  assert.equal(validateAIConnectionStatus(missing),null);
});

test('connection status GET is bounded, authenticated and sends no model request',async()=>{
  const calls=[];
  const response=()=>new Response(JSON.stringify(status),{status:200,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const fetcher=async(...args)=>{calls.push(args);return response();};
  assert.deepEqual(await readAIConnectionStatus('local-token',new AbortController().signal,fetcher),status);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/api/studio/ai-connection');
  assert.deepEqual({method:calls[0][1].method,headers:calls[0][1].headers,cache:calls[0][1].cache},
    {method:'GET',headers:{'x-visualmaker-token':'local-token'},cache:'no-store'});
  assert.equal('body' in calls[0][1],false);
});

test('connection status failure cannot expose server response or oversized data',async()=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const cases=[
    new Response(JSON.stringify({...status,apiKey:'sensitive'}),{headers}),
    new Response(JSON.stringify(status),{headers:{...headers,'X-Content-Type-Options':'other'}}),
    new Response(JSON.stringify(status),{status:500,headers}),
    new Response(JSON.stringify(status).padEnd(1100,' '),{headers}),
  ];
  for(const response of cases)await assert.rejects(
    readAIConnectionStatus('token',new AbortController().signal,async()=>response),
    error=>error instanceof Error&&!error.message.includes('sensitive')&&error.message.includes('상태를 확인하지 못했습니다'));
  const controller=new AbortController();controller.abort();
  let called=false;
  await assert.rejects(readAIConnectionStatus('token',controller.signal,async()=>{called=true;return cases[0];}));
  assert.equal(called,false);
});
