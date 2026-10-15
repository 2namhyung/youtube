import test from 'node:test';
import assert from 'node:assert/strict';
import {streamEpisodeToPrivateFile,MAX_EPISODE_BROWSER_BYTES} from '../src/components/studio/episode-opfs.ts';

const id='00000000-0000-0000-0000-000000000001';
const name=`provisional-episode-${id}.mp4`;
function fixture(options={}){
  const events=[],files=new Map([['unrelated-user-data.bin',{size:7}]]);
  let written=0;
  const directory={
    async getDirectoryHandle(key,config){assert.equal(key,'visualmaker-episode-temporary');assert.equal(config.create,true);return directory;},
    async getFileHandle(key,config){if(!config){if(files.has(key))return files.get(key);throw Object.assign(new Error('missing'),{name:'NotFoundError'});}
      assert.equal(config.create,true);const handle={
        async createWritable(){events.push('open');return {
          async write(chunk){events.push(`write:${chunk.byteLength}`);if(options.quotaOnWrite)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});
            written+=chunk.byteLength;options.onWrite?.();},
          async close(){events.push('close');files.set(key,{size:written});},
          async abort(){events.push('abort');}
        };},
        async getFile(){events.push('getFile');return {size:written};}
      };files.set(key,handle);return handle;},
    async removeEntry(key){events.push(`remove:${key}`);files.delete(key);}
  };
  const storage={async estimate(){return {usage:options.usage??0,quota:options.quota??MAX_EPISODE_BROWSER_BYTES+1};},
    async getDirectory(){events.push('root');return directory;}};
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));controller.enqueue(new Uint8Array([3,4]));controller.close();}}),
    {headers:{'Content-Length':String(options.declaredLength??4),'Content-Type':'video/mp4'}});
  response.arrayBuffer=()=>{throw new Error('whole arrayBuffer forbidden');};
  response.blob=()=>{throw new Error('whole blob forbidden');};
  return {events,files,storage,response};
}
function args(f,overrides={}){return {response:f.response,storage:f.storage,expectedBytes:4,id,signal:new AbortController().signal,current:()=>true,...overrides};}

test('streams only chunks to a new private file, exposes disk file and removes exact owned name',async()=>{
  const f=fixture();const saved=await streamEpisodeToPrivateFile(args(f));
  assert.equal(saved.bytes,4);assert.equal(saved.file.size,4);assert.equal(saved.name,name);
  assert.deepEqual(f.events.filter(item=>item.startsWith('write:')),['write:2','write:2']);
  assert.equal(f.events.includes('close'),true);assert.equal(f.files.has(name),true);
  await saved.cleanup();await saved.cleanup();
  assert.equal(f.files.has(name),false);assert.equal(f.files.has('unrelated-user-data.bin'),true);
  assert.deepEqual(f.events.filter(item=>item.startsWith('remove:')),[`remove:${name}`]);
});

test('declared or streamed length mismatch cannot publish a file',async()=>{
  const wrongHeader=fixture({declaredLength:5});
  await assert.rejects(streamEpisodeToPrivateFile(args(wrongHeader)),/크기가 검증된 기록과 다릅니다/);
  assert.equal(wrongHeader.events.includes('open'),false);
  const short=fixture({declaredLength:5});await assert.rejects(streamEpisodeToPrivateFile(args(short,{expectedBytes:5})),/완전히 전달되지 않았습니다/);
  assert.equal(short.events.includes('abort'),true);assert.equal(short.files.has(name),false);
  assert.equal(short.files.has('unrelated-user-data.bin'),true);
});

test('quota estimate and actual write failure report space and clean only owned file',async()=>{
  const estimated=fixture({quota:3});
  await assert.rejects(streamEpisodeToPrivateFile(args(estimated)),/공간이 부족합니다/);
  assert.equal(estimated.events.includes('root'),false);
  const actual=fixture({quotaOnWrite:true});
  await assert.rejects(streamEpisodeToPrivateFile(args(actual)),/공간이 부족합니다/);
  assert.equal(actual.events.includes('abort'),true);assert.equal(actual.files.has(name),false);
  assert.equal(actual.files.has('unrelated-user-data.bin'),true);
});

test('scope change or signal cancellation aborts and removes the exact temporary file',async()=>{
  let current=true;const stale=fixture({onWrite:()=>{current=false;}});
  await assert.rejects(streamEpisodeToPrivateFile(args(stale,{current:()=>current})),/작업이 변경됐습니다/);
  assert.equal(stale.events.includes('abort'),true);assert.equal(stale.files.has(name),false);
  const controller=new AbortController();const cancelled=fixture({onWrite:()=>controller.abort()});
  await assert.rejects(streamEpisodeToPrivateFile(args(cancelled,{signal:controller.signal})),/작업이 변경됐습니다/);
  assert.equal(cancelled.events.includes('abort'),true);assert.equal(cancelled.files.has(name),false);
});

test('2GB cap and existing exact filename fail before opening a writable file',async()=>{
  const f=fixture();
  await assert.rejects(streamEpisodeToPrivateFile(args(f,{expectedBytes:MAX_EPISODE_BROWSER_BYTES+1})),/최대 2GB/);
  assert.equal(f.events.includes('root'),false);
  f.files.set(name,{size:123});
  await assert.rejects(streamEpisodeToPrivateFile(args(f)),/이미 사용 중/);
  assert.equal(f.files.get(name).size,123);assert.equal(f.events.includes('open'),false);
});
