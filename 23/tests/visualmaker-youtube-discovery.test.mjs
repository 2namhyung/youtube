import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importEpisode} from '../visualmaker/core/episode.ts';
import {getProject,insertProject,updateProject} from '../visualmaker/core/store.ts';
import {searchYouTubeSources} from '../visualmaker/core/youtube-discovery.ts';
import {YOUTUBE_CC_LABEL} from '../visualmaker/core/youtube-source.ts';
import {searchArgs} from '../visualmaker/core/youtube-cli.ts';
import {validYouTubeDiscovery} from '../src/components/studio/youtube-discovery-client.ts';
import {POST as searchPost} from '../src/app/api/studio/youtube-search/route.ts';
import {studioToken} from '../visualmaker/core/http.ts';

const ids=['abcdefghijk','lmnopqrstuv','wxyzABCDEF0'];
const base='http://127.0.0.1:8138';
function isolated(){
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-yt-discovery-'));
  let plan=insertProject(importEpisode());
  const scene=plan.scenes.find(row=>row.candidates.some(candidate=>candidate.mode==='source-video'));
  assert.ok(scene);const candidate=scene.candidates.find(row=>row.mode==='source-video');
  plan=updateProject(plan.id,plan.revision,{type:'select',sceneId:scene.id,candidateId:candidate.id});
  const requirement=plan.requirements.find(row=>candidate.requirementIds.includes(row.id)&&row.mediaType==='video');
  assert.ok(requirement);
  return {plan,input:{projectId:plan.id,baseRevision:plan.revision,requirementId:requirement.id,
    scriptSha256:plan.script.rawSha256,query:'public archive footage'}};
}
const scope=input=>({projectId:input.projectId,revision:input.baseRevision,requirementId:input.requirementId,scriptSha256:input.scriptSha256});
const flat=(entries=ids.map(id=>({id,_type:'url',url:`https://evil.test/${id}`})))=>Buffer.from(JSON.stringify({_type:'playlist',entries}));
function metadata(id,change={}){return Buffer.from(JSON.stringify({id,extractor_key:'Youtube',
  webpage_url:`https://www.youtube.com/watch?v=${id}`,_type:'video',availability:'public',live_status:'not_live',
  title:'Synthetic candidate',channel:'Fixture creator',channel_id:'UCfixture',duration:5,
  license:YOUTUBE_CC_LABEL,formats:[{format_id:'18',ext:'mp4',protocol:'https',vcodec:'avc1',acodec:'mp4a',
    width:640,height:360,filesize:100000}],...change}));}
const runner=(calls,changes={})=>async request=>{
  calls.push(request);
  if(request.args.includes('--flat-playlist'))return flat();
  const id=new URL(request.args.at(-1)).searchParams.get('v');
  if(changes[id] instanceof Error)throw changes[id];
  return metadata(id,changes[id]);
};

test('fixed keyword search verifies each ID, preserves order and never follows flat URLs',async()=>{
  const {input}=isolated(),calls=[],result=await searchYouTubeSources(input,{runner:runner(calls,{[ids[1]]:{license:'YouTube standard license'},
    [ids[2]]:{formats:[]}})});
  assert.equal(validYouTubeDiscovery(result,scope(input),input.query),true);
  assert.deepEqual(result.candidates.map(card=>card.videoId),[ids[0],ids[2]]);
  assert.equal(result.candidates[1].rightsEligible,false);
  assert.deepEqual(result.counts,{attempted:3,verified:2,excluded:1,failed:0});
  assert.deepEqual(calls[0].args,searchArgs(input.query));
  assert.equal(calls[0].args.at(-1),`ytsearch5:${input.query}`);
  assert.equal(calls[0].maxBytes,1_000_000);
  assert.ok(calls.slice(1).every(call=>call.args.at(-1).startsWith('https://www.youtube.com/watch?v=')));
  assert.ok(calls.every(call=>!call.args.includes('--output')&&!call.args.some(arg=>arg.includes('evil.test'))));
  assert.equal(getProject(input.projectId).assets.length,0);
});

test('malformed, oversized and hostile flat results fail closed; duplicate IDs inspect once',async()=>{
  const {input}=isolated();
  for(const output of [Buffer.from('{'),Buffer.from('{}'),flat([{id:'-o'}]),flat([{id:ids[0]},{id:'bad/evil000'}]),
    flat(Array.from({length:6},()=>({id:ids[0]}))),Buffer.alloc(1_000_001)]){
    const calls=[];await assert.rejects(searchYouTubeSources(input,{runner:async request=>{calls.push(request);return output;}}));
    assert.equal(calls.length,1);
  }
  const calls=[];const result=await searchYouTubeSources(input,{runner:async request=>{
    calls.push(request);return request.args.includes('--flat-playlist')?flat([{id:ids[0]},{id:ids[0]}]):metadata(ids[0]);
  }});
  assert.equal(calls.length,2);assert.deepEqual(result.counts,{attempted:1,verified:1,excluded:0,failed:0});
});

test('invalid query and stale scope reject before and after CLI awaits',async()=>{
  const {input,plan}=isolated(),calls=[];
  for(const query of ['x','contains\nline','  spaced','x'.repeat(121)])
    await assert.rejects(searchYouTubeSources({...input,query},{runner:runner(calls)}));
  assert.equal(calls.length,0);
  const stale=async request=>{calls.push(request);updateProject(plan.id,plan.revision,{type:'edit-beat',
    beatId:plan.beats[0].id,intent:'changed',role:plan.beats[0].role});return flat();};
  await assert.rejects(searchYouTubeSources(input,{runner:stale}),error=>error.status===409);
  assert.equal(calls.length,1);
  await assert.rejects(searchYouTubeSources(input,{runner:runner(calls)}),error=>error.status===409);
  assert.equal(calls.length,1);
});

test('individual invalid metadata yields bounded partial result; all failures are not success',async()=>{
  const {input}=isolated(),calls=[];
  const result=await searchYouTubeSources(input,{runner:runner(calls,{[ids[1]]:{duration:999},
    [ids[2]]:{license:'YouTube standard license'}})});
  assert.equal(result.partial,true);assert.deepEqual(result.counts,{attempted:3,verified:1,excluded:1,failed:1});
  await assert.rejects(searchYouTubeSources(input,{runner:async request=>request.args.includes('--flat-playlist')?flat():Buffer.from('{}')}),
    error=>error.status===502);
  assert.equal(getProject(input.projectId).assets.length,0);
});

test('cancellation stops inspection and client rejects tampered or stale response',async()=>{
  const {input}=isolated(),controller=new AbortController();let calls=0;
  await assert.rejects(searchYouTubeSources(input,{signal:controller.signal,runner:async request=>{
    calls++;if(request.args.includes('--flat-playlist'))return flat();controller.abort();return metadata(ids[0]);
  }}),error=>error.status===409);
  assert.equal(calls,2);
  const result=await searchYouTubeSources(input,{runner:runner([])});
  assert.equal(validYouTubeDiscovery({...result,query:'different'},scope(input),input.query),false);
  assert.equal(validYouTubeDiscovery({...result,candidates:[result.candidates[0],result.candidates[0]]},scope(input),input.query),false);
  assert.equal(validYouTubeDiscovery(result,{...scope(input),revision:input.baseRevision+1},input.query),false);
  const ui=readFileSync(new URL('../src/components/studio/youtube-source.tsx',import.meta.url),'utf8');
  assert.match(ui,/onClick=\{\(\)=>\{setChecked\(card\);setUrl\(card.canonicalUrl\)/);
});

test('overall deadline ends a pending search without inspecting or changing a project',async()=>{
  const {input}=isolated();let calls=0;
  await assert.rejects(searchYouTubeSources(input,{deadlineMs:20,runner:request=>new Promise((resolve,reject)=>{
    calls++;request.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })}),error=>error.status===504);
  assert.equal(calls,1);assert.equal(getProject(input.projectId).assets.length,0);
});

test('HTTP guard and exact DTO reject unauthenticated and injected search requests',async()=>{
  const {input}=isolated();
  const unauthorized=await searchPost(new Request(base+'/api/studio/youtube-search',{method:'POST',body:JSON.stringify(input)}));
  assert.equal(unauthorized.status,403);
  const injected=await searchPost(new Request(base+'/api/studio/youtube-search',{method:'POST',
    headers:{'x-visualmaker-token':studioToken()},body:JSON.stringify({...input,command:'yt-dlp --all'})}));
  assert.equal(injected.status,400);
});
