import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync,linkSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseFixedGainMixContract,fixedGainMixContractSha256} from '../visualmaker/renderer/fixed-gain-mix-contract.ts';
import {runFixedGainMix} from '../visualmaker/renderer/fixed-gain-mix-engine.ts';

const digest=data=>createHash('sha256').update(data).digest('hex');
function wav(samples){
  const data=Buffer.alloc(samples.length*2*4),header=Buffer.alloc(44);
  samples.forEach((sample,index)=>{data.writeFloatLE(sample,index*8);data.writeFloatLE(sample,index*8+4);});
  header.write('RIFF',0);header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48_000,24);header.writeUInt32LE(48_000*8,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(data.length,40);return Buffer.concat([header,data]);
}
function fixture(){
  const root=mkdtempSync(path.join(os.tmpdir(),'vm-mix-source-')),output=mkdtempSync(path.join(os.tmpdir(),'vm-fixed-gain-'));
  mkdirSync(path.join(root,'audio'));
  const inputs=[['voice',wav([.1,.1,.1,.1,.1,.1,.1,.1])],['music',wav([.2,.2,.2])],['sfx',wav([-.1,-.1])]];
  for(const [id,bytes] of inputs)writeFileSync(path.join(root,'audio',`${id}.wav`),bytes);
  const record=(id,n)=>({id,path:`audio/${id}.wav`,sha256:digest(inputs.find(row=>row[0]===id)[1]),bytes:inputs.find(row=>row[0]===id)[1].length,decodedSamples:n,gainDb:0});
  const contract={schemaVersion:'visualmaker-fixed-gain-mix-v1',sampleRate:48000,channels:2,durationSamples:8,voice:record('voice',8),stems:[{...record('music',3),kind:'music',startSample:2,gainDb:-6},{...record('sfx',2),kind:'sfx',startSample:5,gainDb:0}]};
  return {root,output,contract,cleanup(){rmSync(root,{recursive:true,force:true});rmSync(output,{recursive:true,force:true});}};
}
test('installed FFmpeg mixes exact sample windows and binds WAV plus technical receipt',async()=>{
  const f=fixture();try{
    const probe=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',path.join(f.root,'audio','voice.wav'),'-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:1024*1024});
    assert.equal(probe.status,0,String(probe.stderr));assert.ok(Math.abs(probe.stdout.readFloatLE(0)-.1)<1e-6,`decoded first ${probe.stdout.readFloatLE(0)}`);
    const parsed=parseFixedGainMixContract(f.contract),receipt=await runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output});
    const bytes=readFileSync(path.join(f.output,receipt.output.name));
    const ffprobe=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels,duration_ts','-of','json',path.join(f.output,receipt.output.name)],{windowsHide:true,encoding:'utf8'});
    assert.equal(ffprobe.status,0,ffprobe.stderr);const stream=JSON.parse(ffprobe.stdout).streams[0];assert.equal(stream.codec_name,'pcm_f32le');assert.equal(stream.sample_rate,'48000');assert.equal(stream.channels,2);assert.equal(Number(stream.duration_ts),8);
    const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',path.join(f.output,receipt.output.name),'-f','f32le','-c:a','pcm_f32le','pipe:1'],{windowsHide:true,maxBuffer:1024*1024});
    assert.equal(decoded.status,0,String(decoded.stderr));assert.equal(decoded.stdout.length,8*2*4);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt16LE(20),3);assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt16LE(22),2);
    assert.equal(bytes.length,44+8*2*4);assert.equal(receipt.output.sha256,digest(bytes));assert.equal(receipt.sampleCount,8);
    assert.equal(receipt.contractSha256,fixedGainMixContractSha256(parsed));assert.equal(receipt.productionAuthority,false);assert.equal(receipt.reviewApproved,false);assert.equal(receipt.productionEligible,false);assert.equal(receipt.clippingCount,0);
    const expected=[.1,.1,.1+.2*10**(-6/20),.1+.2*10**(-6/20),.1+.2*10**(-6/20),0,0,.1];
    for(let frame=0;frame<8;frame++)for(let channel=0;channel<2;channel++){
      assert.ok(Math.abs(bytes.readFloatLE(44+(frame*2+channel)*4)-expected[frame])<1e-6,`frame ${frame} channel ${channel}`);
      assert.ok(Math.abs(decoded.stdout.readFloatLE((frame*2+channel)*4)-expected[frame])<1e-6,`independent decode frame ${frame} channel ${channel}`);
    }
    assert.deepEqual(receipt.inputs.map(item=>item.id),['voice','music','sfx']);assert.deepEqual(JSON.parse(readFileSync(path.join(f.output,'technical-fixed-gain-mix.json'),'utf8')),receipt);
    assert.deepEqual(readdirSync(f.output).sort(),['technical-fixed-gain-mix.json','technical-fixed-gain-mix.wav']);
  }finally{f.cleanup();}
});
test('NTFS hardlink aliases of the same physical input cannot be mixed twice',async()=>{
  const f=fixture();try{
    const alias=path.join(f.root,'audio','music-alias.wav');linkSync(path.join(f.root,'audio','music.wav'),alias);
    const aliasStem={...f.contract.stems[0],id:'alias',path:'audio/music-alias.wav',startSample:5};
    await assert.rejects(runFixedGainMix({contract:{...f.contract,stems:[f.contract.stems[0],aliasStem]},repositoryRoot:f.root,outputDir:f.output}),/duplicate-physical-input/);
    assert.deepEqual(readdirSync(f.output),[]);
  }finally{f.cleanup();}
});
test('foreign WAV collision after empty output check preserves sentinel and closes raw handles',async()=>{
  const f=fixture();let timer;try{
    const sentinel=Buffer.from('foreign-wav-owner'),wavPath=path.join(f.output,'technical-fixed-gain-mix.wav');let inserted=false;
    timer=setInterval(()=>{
      if(inserted)return;
      const work=readdirSync(f.output).find(name=>name.startsWith('.mix-work-'));if(!work)return;
      const lastRaw=path.join(f.output,work,'2.f32le');
      if(existsSync(lastRaw)&&statSync(lastRaw).size===2*2*4){try{writeFileSync(wavPath,sentinel,{flag:'wx'});inserted=true;}catch(error){if(error.code!=='EEXIST')throw error;}}
    },1);
    await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output}),/EEXIST/);
    assert.equal(inserted,true);assert.deepEqual(readFileSync(wavPath),sentinel);assert.deepEqual(readdirSync(f.output),['technical-fixed-gain-mix.wav']);
  }finally{clearInterval(timer);f.cleanup();}
});
test('foreign receipt collision preserves its bytes while removing only owned WAV',async()=>{
  const f=fixture();let timer;try{
    const sentinel=Buffer.from('foreign-receipt-owner'),wavPath=path.join(f.output,'technical-fixed-gain-mix.wav'),receiptPath=path.join(f.output,'technical-fixed-gain-mix.json');let inserted=false;
    timer=setInterval(()=>{
      if(inserted||!existsSync(wavPath))return;
      if(statSync(wavPath).size===44+8*2*4){try{writeFileSync(receiptPath,sentinel,{flag:'wx'});inserted=true;}catch(error){if(error.code!=='EEXIST')throw error;}}
    },1);
    await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output}),/EEXIST/);
    assert.equal(inserted,true);assert.deepEqual(readFileSync(receiptPath),sentinel);assert.deepEqual(readdirSync(f.output),['technical-fixed-gain-mix.json']);
  }finally{clearInterval(timer);f.cleanup();}
});
test('abort delivered during actual WAV sample writing removes partial output',async()=>{
  const f=fixture();let timer;
  try{
    const count=48_000*12,voice=wav(Array(count).fill(.1)),music=wav(Array(count).fill(.1));
    writeFileSync(path.join(f.root,'audio','voice.wav'),voice);writeFileSync(path.join(f.root,'audio','music.wav'),music);
    const contract={...f.contract,durationSamples:count,voice:{...f.contract.voice,bytes:voice.length,sha256:digest(voice),decodedSamples:count},stems:[{...f.contract.stems[0],bytes:music.length,sha256:digest(music),decodedSamples:count,startSample:0},f.contract.stems[1]]};
    const controller=new AbortController(),outputFile=path.join(f.output,'technical-fixed-gain-mix.wav');let partialBytes=0;
    timer=setInterval(()=>{if(existsSync(outputFile)){const size=statSync(outputFile).size;if(size>44&&size<44+count*8){partialBytes=size;controller.abort();}}},1);
    await assert.rejects(runFixedGainMix({contract,repositoryRoot:f.root,outputDir:f.output,signal:controller.signal}),/aborted/);
    assert.ok(partialBytes>44,`partial WAV observed: ${partialBytes}`);assert.deepEqual(readdirSync(f.output),[]);
  }finally{clearInterval(timer);f.cleanup();}
});
test('simulated global deadline expires after real WAV sample writing has begun',async t=>{
  const f=fixture();let deadlineTimer;
  try{
    const count=48_000*12,voice=wav(Array(count).fill(.1)),music=wav(Array(count).fill(.1));
    writeFileSync(path.join(f.root,'audio','voice.wav'),voice);writeFileSync(path.join(f.root,'audio','music.wav'),music);
    const contract={...f.contract,durationSamples:count,voice:{...f.contract.voice,bytes:voice.length,sha256:digest(voice),decodedSamples:count},stems:[{...f.contract.stems[0],bytes:music.length,sha256:digest(music),decodedSamples:count,startSample:0},f.contract.stems[1]]};
    t.mock.timers.enable({apis:['Date'],now:Date.now()});
    const outputFile=path.join(f.output,'technical-fixed-gain-mix.wav');let partial=0,advanced=false;
    deadlineTimer=setInterval(()=>{if(!advanced&&existsSync(outputFile)){const size=statSync(outputFile).size;if(size>44&&size<44+count*8){partial=size;advanced=true;t.mock.timers.setTime(Date.now()+200_000);}}},1);
    await assert.rejects(runFixedGainMix({contract,repositoryRoot:f.root,outputDir:f.output,timeoutMs:120_000}),/timeout/);
    assert.ok(advanced&&partial>44,`deadline advanced after partial WAV: ${partial}`);
    assert.deepEqual(readdirSync(f.output),[]);
  }finally{clearInterval(deadlineTimer);t.mock.timers.reset();f.cleanup();}
});
test('strict contract rejects unknown fields, paths, identity, placement and gain without output',async()=>{
  const f=fixture();try{
    const base=f.contract;
    const bad=[{...base,extra:true},{...base,durationSamples:0},{...base,durationSamples:7},{...base,stems:[]},{...base,voice:{...base.voice,path:'../voice.wav'}},{...base,voice:{...base.voice,gainDb:-1}},{...base,stems:[{...base.stems[0],extra:true},base.stems[1]]},{...base,stems:[{...base.stems[0],id:'voice'},base.stems[1]]},{...base,stems:[{...base.stems[0],path:base.voice.path},base.stems[1]]},{...base,stems:[{...base.stems[0],startSample:6},base.stems[1]]},{...base,stems:[{...base.stems[0],gainDb:1},base.stems[1]]},{...base,stems:[{...base.stems[0],gainDb:NaN},base.stems[1]]},{...base,voice:{...base.voice,bytes:base.voice.bytes+1}},{...base,voice:{...base.voice,sha256:'f'.repeat(64)}},{...base,voice:{...base.voice,decodedSamples:7}}];
    for(const value of bad)await assert.rejects(runFixedGainMix({contract:value,repositoryRoot:f.root,outputDir:f.output}));
    assert.deepEqual(readdirSync(f.output),[]);
  }finally{f.cleanup();}
});
test('decoded sample mismatch, nonfinite samples, excess peak and cancellation remove work',async()=>{
  const f=fixture();try{
    const musicPath=path.join(f.root,'audio','music.wav');
    const shorter=wav([.2,.2]);writeFileSync(musicPath,shorter);
    const mismatch={...f.contract,stems:[{...f.contract.stems[0],sha256:digest(shorter),bytes:shorter.length},f.contract.stems[1]]};
    await assert.rejects(runFixedGainMix({contract:mismatch,repositoryRoot:f.root,outputDir:f.output}),/decoded-samples/);assert.deepEqual(readdirSync(f.output),[]);
    const nonfinite=wav([NaN,.2,.2]);writeFileSync(musicPath,nonfinite);
    await assert.rejects(runFixedGainMix({contract:{...f.contract,stems:[{...f.contract.stems[0],sha256:digest(nonfinite),bytes:nonfinite.length},f.contract.stems[1]]},repositoryRoot:f.root,outputDir:f.output}),/nonfinite/);assert.deepEqual(readdirSync(f.output),[]);
    const loud=wav([.9,.9,.9]);writeFileSync(musicPath,loud);
    await assert.rejects(runFixedGainMix({contract:{...f.contract,stems:[{...f.contract.stems[0],sha256:digest(loud),bytes:loud.length,gainDb:0},f.contract.stems[1]]},repositoryRoot:f.root,outputDir:f.output}),/peak-ceiling/);assert.deepEqual(readdirSync(f.output),[]);
    writeFileSync(musicPath,wav([.2,.2,.2]));
    const controller=new AbortController();setTimeout(()=>controller.abort(),20);
    await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output,signal:controller.signal}),/aborted/);assert.deepEqual(readdirSync(f.output),[]);
  }finally{f.cleanup();}
});
test('source and destination junctions, changed input, output reuse and deadline fail closed',async()=>{
  const f=fixture();try{
    const changed=wav([.3,.3,.3]);writeFileSync(path.join(f.root,'audio','music.wav'),changed);
    await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output}),/input-drift/);
    writeFileSync(path.join(f.output,'occupied.txt'),'owned');await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output}),/output-root/);rmSync(path.join(f.output,'occupied.txt'));
    const outside=mkdtempSync(path.join(os.tmpdir(),'ordinary-output-'));
    try{await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:outside}),/output-root/);assert.deepEqual(readdirSync(outside),[]);}finally{rmSync(outside,{recursive:true,force:true});}
    const alternate=mkdtempSync(path.join(os.tmpdir(),'vm-mix-link-target-'));
    try{
      const linked=path.join(f.root,'linked');symlinkSync(alternate,linked,'junction');
      await assert.rejects(runFixedGainMix({contract:{...f.contract,voice:{...f.contract.voice,path:'linked/voice.wav'}},repositoryRoot:f.root,outputDir:f.output}));
      const target=path.join(alternate,'vm-fixed-gain-linked');mkdirSync(target);const outputLink=path.join(os.tmpdir(),`vm-fixed-gain-link-${process.pid}-${Date.now()}`);symlinkSync(target,outputLink,'junction');
      try{await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:outputLink}),/path-link/);}finally{rmSync(outputLink);}
      assert.deepEqual(readdirSync(target),[]);
    }finally{rmSync(alternate,{recursive:true,force:true});}
    // The finite deadline exercises child timeout separately from the abort test.
    writeFileSync(path.join(f.root,'audio','music.wav'),wav([.2,.2,.2]));
    await assert.rejects(runFixedGainMix({contract:f.contract,repositoryRoot:f.root,outputDir:f.output,timeoutMs:100}),/timeout/);
    assert.deepEqual(readdirSync(f.output),[]);
  }finally{f.cleanup();}
});
