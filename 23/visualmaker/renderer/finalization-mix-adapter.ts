import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,existsSync,fstatSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,readSync,readdirSync,realpathSync,rmSync,rmdirSync,statSync,writeSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {safeCanonicalFile} from '../core/canonical-cut-render.ts';
import {streamedFileFingerprint} from '../core/episode-provisional.ts';
import {dataRoot} from '../core/store.ts';
import {runFixedGainMix,type FixedGainMixReceipt} from './fixed-gain-mix-engine.ts';
import {fixedGainMixContractSha256,type FixedGainMixContract} from './fixed-gain-mix-contract.ts';
import type {FinalizationBinding,FinalizationMixMeasured} from './finalization-contract.ts';

const RATE=48_000,CHANNELS=2,MAX_RAW=RATE*600*CHANNELS*4,MAX_OUTPUT=100_000_000,PEAK_CEILING=10**(-1/20);
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
type Probe={streams?:Array<{codec_name?:string;sample_rate?:string;channels?:number;time_base?:string;start_time?:string}>;packets?:Array<{pts?:number;duration?:number;side_data_list?:Array<{side_data_type?:string;skip_samples?:number;discard_padding?:number}>}>;frames?:Array<{best_effort_timestamp?:number;nb_samples?:number}>};

async function command(binary:'ffmpeg'|'ffprobe',args:string[],signal:AbortSignal,output?:string,cap=12_000_000):Promise<string>{
  if(signal.aborted)throw new Error('mix-v2-aborted');
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,binary==='ffmpeg'&&output?['-n',...args]:args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',size=0,done=false,reason:Error|undefined;
    const kill=(error:Error)=>{if(reason)return;reason=error;child.kill('SIGKILL');};
    const timer=setTimeout(()=>kill(new Error('mix-v2-command-timeout')),120_000);
    const watch=setInterval(()=>{try{if(output&&existsSync(output)&&statSync(output).size>(output.endsWith('.f32le')?MAX_RAW:MAX_OUTPUT))kill(new Error('mix-v2-output-limit'));}catch{kill(new Error('mix-v2-output-watch'));}},50);
    const abort=()=>kill(new Error('mix-v2-aborted'));signal.addEventListener('abort',abort,{once:true});
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(watch);signal.removeEventListener('abort',abort);if(error||reason)reject(error??reason);else resolve(stdout.trim());};
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>cap)kill(new Error('mix-v2-tool-log-limit'));else stdout+=chunk.toString('utf8');});
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>cap)kill(new Error('mix-v2-tool-log-limit'));});
    child.once('error',()=>finish(new Error('mix-v2-tool-unavailable')));child.once('close',code=>finish(reason??(code===0?undefined:new Error('mix-v2-tool-failed'))));
  });
}
async function probe(file:string,signal:AbortSignal,audioOnly=false):Promise<{decodedSamples:number;presentedSamples:number;firstPacketPts:number;primingSkipSamples:number;packetCount:number;lastPacketDuration:number;containerDiscardPadding:number}>{
  const stream=JSON.parse(await command('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels,time_base,start_time','-of','json',file],signal)) as Probe;
  const video=JSON.parse(await command('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=start_time','-of','json',file],signal)) as Probe;
  const packets=JSON.parse(await command('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts,duration,side_data_list','-of','json',file],signal,undefined,20_000_000)) as Probe;
  const frames=JSON.parse(await command('ffprobe',['-v','error','-select_streams','a:0','-show_frames','-show_entries','frame=best_effort_timestamp,nb_samples','-of','json',file],signal,undefined,20_000_000)) as Probe;
  const audio=stream.streams?.[0],first=packets.packets?.[0],last=packets.packets?.at(-1),skip=first?.side_data_list?.find(entry=>entry.side_data_type==='Skip Samples');
  if(!audio||audio.codec_name!=='aac'||audio.sample_rate!=='48000'||audio.channels!==CHANNELS||audio.time_base!=='1/48000'||audio.start_time!=='0.000000'||!audioOnly&&video.streams?.[0]?.start_time!=='0.000000'||audioOnly&&video.streams?.length||!packets.packets?.length||!frames.frames?.length||!first||!last||!Number.isSafeInteger(skip?.skip_samples)||!Number.isSafeInteger(skip?.discard_padding)||(skip?.skip_samples??-1)<0||(skip?.discard_padding??-1)<0||first.pts!==-(skip?.skip_samples??0)||frames.frames[0]?.best_effort_timestamp!==0)throw new Error('mix-v2-presentation-start-unsupported');
  let expectedPts=first.pts!,sum=0,decoded=0;
  for(const packet of packets.packets){const duration=packet.duration;if(!Number.isSafeInteger(packet.pts)||!Number.isSafeInteger(duration)||duration!<1||duration!>1024||packet.pts!==expectedPts)throw new Error('mix-v2-packet-timeline');expectedPts+=duration!;sum+=duration!;}
  for(const frame of frames.frames){const count=frame.nb_samples;if(!Number.isSafeInteger(count)||count!<1||count!>1024||frame.best_effort_timestamp!==decoded)throw new Error('mix-v2-decoded-frame');decoded+=count!;}
  const endDiscard=last.side_data_list?.find(entry=>entry.side_data_type==='Skip Samples')?.discard_padding??0;
  if(!Number.isSafeInteger(endDiscard)||endDiscard<0||endDiscard>1023||decoded<1||decoded>RATE*600)throw new Error('mix-v2-presentation-padding');
  const presented=sum-skip!.skip_samples!-endDiscard;
  if(presented<1||presented>decoded||decoded-presented>1023||last.pts!+last.duration!-endDiscard!==presented)throw new Error('mix-v2-presentation-window');
  return {decodedSamples:decoded,presentedSamples:presented,firstPacketPts:first.pts!,primingSkipSamples:skip!.skip_samples!,packetCount:packets.packets.length,lastPacketDuration:last.duration!,containerDiscardPadding:endDiscard};
}
function fileIdentity(file:string):string{const stat=lstatSync(file,{bigint:true});if(stat.isSymbolicLink()||stat.ino===0n)return '';return `${stat.dev}:${stat.ino}`;}
function privateStagingParent(work:string):string{
  const staging=realpathSync(path.join(dataRoot(),'jobs','staging')),parent=realpathSync(path.dirname(work));
  if(!/^[a-f0-9-]{36}$/iu.test(path.basename(parent))||path.dirname(parent)!==staging||realpathSync(work)!==work||path.basename(work)!=='work')throw new Error('mix-v2-private-staging-root');
  return parent;
}
export function strictOwnedCleanup(root:string,owned:Map<string,string>):boolean{
  try{
    const parent=path.dirname(root),staging=path.join(dataRoot(),'jobs','staging'),allowedTemp=parent===realpathSync(os.tmpdir()),allowedStaging=existsSync(staging)&&path.dirname(parent)===realpathSync(staging)&&/^[a-f0-9-]{36}$/iu.test(path.basename(parent))&&realpathSync(parent)===parent;
    if(!/^vm-fixed-gain-v2-[A-Za-z0-9]+$/u.test(path.basename(root))||!allowedTemp&&!allowedStaging||realpathSync(root)!==root)return false;
    const output=path.join(root,'vm-fixed-gain-output');
    for(const entry of readdirSync(root)){
      const file=path.join(root,entry),relative=entry;
      if(!owned.has(relative)||fileIdentity(file)!==owned.get(relative))return false;
      if(entry==='vm-fixed-gain-output'){if(!lstatSync(output).isDirectory()||realpathSync(output)!==output)return false;for(const child of readdirSync(output)){const inner=path.join(output,child),key=`vm-fixed-gain-output/${child}`;if(!owned.has(key)||fileIdentity(inner)!==owned.get(key)||!lstatSync(inner).isFile()||lstatSync(inner).nlink!==1)return false;}}
      else if(!lstatSync(file).isFile()||lstatSync(file).nlink!==1)return false;
    }
    if(existsSync(output)){for(const child of readdirSync(output))rmSync(path.join(output,child));rmdirSync(output);}
    for(const entry of readdirSync(root))rmSync(path.join(root,entry));rmdirSync(root);return true;
  }catch{/* Preserve anything whose ownership cannot be verified. */return false;}
}
function rawSamples(file:string):number{const bytes=statSync(file).size;if(bytes<1||bytes>MAX_RAW||bytes%(CHANNELS*4)!==0)throw new Error('mix-v2-decoded-size');return bytes/(CHANNELS*4);}
async function stageBoundBytes(source:string,dest:string,expected:{sha256:string;bytes:number},signal:AbortSignal,owned:Map<string,string>,key:string,limit:number):Promise<void>{
  const input=openSync(source,'r');let output:number|undefined;
  try{output=openSync(dest,'wx');owned.set(key,fileIdentity(dest));const before=fstatSync(input,{bigint:true}),hash=createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);let count=0;
    if(!before.isFile()||before.ino===0n||before.size!==BigInt(expected.bytes)||expected.bytes<1||expected.bytes>limit)throw new Error('mix-v2-source-identity');
    while(count<expected.bytes){if(signal.aborted)throw new Error('mix-v2-aborted');await new Promise<void>(resolve=>setImmediate(resolve));const read=readSync(input,buffer,0,Math.min(buffer.length,expected.bytes-count),count);if(read<1)throw new Error('mix-v2-source-read');hash.update(buffer.subarray(0,read));if(writeSync(output,buffer,0,read)!==read)throw new Error('mix-v2-source-stage-write');count+=read;}
    const after=fstatSync(input,{bigint:true});if(after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size||hash.digest('hex')!==expected.sha256)throw new Error('mix-v2-source-drift');
  }finally{if(output!==undefined)closeSync(output);closeSync(input);}
  const staged=streamedFileFingerprint(dest,limit);if(staged.sha256!==expected.sha256||staged.bytes!==expected.bytes||fileIdentity(dest)!==owned.get(key))throw new Error('mix-v2-stage-drift');
}
async function copyRawPrefix(source:string,dest:string,bytes:number,signal:AbortSignal,owned:Map<string,string>,key:string):Promise<void>{
  const input=openSync(source,'r');let output:number|undefined;
  try{output=openSync(dest,'wx');owned.set(key,fileIdentity(dest));const buffer=Buffer.allocUnsafe(64*1024);let count=0;while(count<bytes){if(signal.aborted)throw new Error('mix-v2-aborted');await new Promise<void>(resolve=>setImmediate(resolve));const read=readSync(input,buffer,0,Math.min(buffer.length,bytes-count),count);if(read<1||writeSync(output,buffer,0,read)!==read)throw new Error('mix-v2-presented-copy');count+=read;}}
  finally{if(output!==undefined)closeSync(output);closeSync(input);}
  if(statSync(dest).size!==bytes)throw new Error('mix-v2-presented-size');
}
async function compareContent(reference:string,decoded:string,samples:number,decodedSamples:number,breaks:number[],signal:AbortSignal):Promise<{windows:Array<{start:number;end:number;referenceRms:number;decodedRms:number;errorRms:number;correlation:number}>;peak:number;rms:number;clippingCount:number}>{
  if(!Number.isSafeInteger(decodedSamples)||decodedSamples<samples||statSync(reference).size!==samples*8||statSync(decoded).size!==decodedSamples*8)throw new Error('mix-v2-content-size');
  const positions=[0,...breaks,samples].filter((n,index,self)=>Number.isSafeInteger(n)&&n>=0&&n<=samples&&self.indexOf(n)===index).sort((x,y)=>x-y),windows=[];
  const a=openSync(reference,'r'),b=openSync(decoded,'r'),block=4096*8,abuf=Buffer.allocUnsafe(block),bbuf=Buffer.allocUnsafe(block);let peak=0,rmsSum=0,clippingCount=0;
  try{for(let i=0;i<positions.length-1;i++){
    const start=positions[i],end=positions[i+1];
    let aa=0,bb=0,ab=0,error=0;const count=(end-start)*CHANNELS;
    for(let cursor=start;cursor<end;cursor+=4096){if(signal.aborted)throw new Error('mix-v2-aborted');await new Promise<void>(resolve=>setImmediate(resolve));const frames=Math.min(4096,end-cursor),bytes=frames*8;
      if(readSync(a,abuf,0,bytes,cursor*8)!==bytes||readSync(b,bbuf,0,bytes,cursor*8)!==bytes)throw new Error('mix-v2-content-read');
      for(let n=0;n<frames*CHANNELS;n++){const x=abuf.readFloatLE(n*4),y=bbuf.readFloatLE(n*4);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('mix-v2-nonfinite-decode');aa+=x*x;bb+=y*y;ab+=x*y;error+=(x-y)**2;rmsSum+=y*y;peak=Math.max(peak,Math.abs(y));if(Math.abs(y)>=1)clippingCount++;}
    }
    const referenceRms=Math.sqrt(aa/count),decodedRms=Math.sqrt(bb/count),errorRms=Math.sqrt(error/count),correlation=aa&&bb?ab/Math.sqrt(aa*bb):aa===0&&bb===0?1:0;
    if(referenceRms>0.01&&(decodedRms<referenceRms*0.75||decodedRms>referenceRms*1.25||correlation<0.9||errorRms>referenceRms*0.5)||referenceRms<=0.01&&decodedRms>0.03)throw new Error('mix-v2-encoded-content');
    if(end-start>=256)windows.push({start,end,referenceRms,decodedRms,errorRms,correlation});
  }
  for(let cursor=samples;cursor<decodedSamples;cursor+=4096){if(signal.aborted)throw new Error('mix-v2-aborted');await new Promise<void>(resolve=>setImmediate(resolve));const frames=Math.min(4096,decodedSamples-cursor),bytes=frames*8;if(readSync(b,bbuf,0,bytes,cursor*8)!==bytes)throw new Error('mix-v2-content-read');for(let n=0;n<frames*CHANNELS;n++){const y=bbuf.readFloatLE(n*4);if(!Number.isFinite(y))throw new Error('mix-v2-nonfinite-decode');rmsSum+=y*y;peak=Math.max(peak,Math.abs(y));if(Math.abs(y)>=1)clippingCount++;}}
  }finally{closeSync(a);closeSync(b);}
  if(!windows.length||clippingCount||peak>PEAK_CEILING)throw new Error('mix-v2-encoded-peak-or-content');return {windows,peak,rms:Math.sqrt(rmsSum/(decodedSamples*CHANNELS)),clippingCount};
}
export async function prepareFinalizationMix(input:{root:string;source:string;work:string;binding:FinalizationBinding;signal:AbortSignal;onStage:(stage:string)=>void;expectedPresentedSamples:number}):Promise<{source:string;m4a:string;measured:FinalizationMixMeasured;contentWindows:Awaited<ReturnType<typeof compareContent>>['windows'];cleanup:()=>void}>{
  const {binding,signal}=input,selection=binding.selection;if(selection.version!==2)throw new Error('mix-v2-selection');
  const parent=privateStagingParent(input.work),mix=selection.mix,temp=mkdtempSync(path.join(parent,'vm-fixed-gain-v2-')),owned=new Map<string,string>();
  try{
    const file=(name:string)=>path.join(temp,name),stagedSource=file('approved-source.mp4'),sourceRaw=file('voice-full.f32le'),presentedRaw=file('voice-presented.f32le'),voice=file('voice.wav'),output=file('vm-fixed-gain-output'),m4a=file('mixed.m4a'),encodedRaw=file('encoded.f32le');
    await stageBoundBytes(input.source,stagedSource,{sha256:binding.sourceSha256,bytes:binding.sourceBytes},signal,owned,'approved-source.mp4',4_000_000_000);
    const sourcePresentation=await probe(stagedSource,signal);
    if(!Number.isSafeInteger(input.expectedPresentedSamples)||sourcePresentation.presentedSamples!==input.expectedPresentedSamples||sourcePresentation.presentedSamples!==mix.duration_samples||sourcePresentation.decodedSamples!==mix.voice_decoded_samples||sourcePresentation.decodedSamples-sourcePresentation.presentedSamples!==mix.voice_tail_discard_samples)throw new Error('mix-v2-source-count-drift');
    input.onStage('mix-decode');
    await command('ffmpeg',['-nostdin','-v','error','-i',stagedSource,'-map','0:a:0','-vn','-sn','-dn','-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le',sourceRaw],signal,sourceRaw);owned.set('voice-full.f32le',fileIdentity(sourceRaw));
    if(rawSamples(sourceRaw)!==mix.voice_decoded_samples)throw new Error('mix-v2-decoder-count');
    const sourceVoiceHash=streamedFileFingerprint(sourceRaw,MAX_RAW).sha256;
    await copyRawPrefix(sourceRaw,presentedRaw,mix.duration_samples*8,signal,owned,'voice-presented.f32le');
    await command('ffmpeg',['-nostdin','-v','error','-f','f32le','-ar','48000','-ac','2','-i',presentedRaw,'-c:a','pcm_f32le',voice],signal,voice);owned.set('voice.wav',fileIdentity(voice));
    const voiceFp=streamedFileFingerprint(voice,MAX_RAW+4096),stems=[];
    for(let i=0;i<mix.stems.length;i++){
      const stem=mix.stems[i],name=`stem-${i}${path.extname(stem.path).toLowerCase()}`,source=safeCanonicalFile(input.root,stem.path),fp=streamedFileFingerprint(source,100_000_000);
      if(fp.sha256!==stem.sha256||fp.bytes!==stem.bytes||lstatSync(source).nlink!==1)throw new Error('mix-v2-stem-drift');
      await stageBoundBytes(source,file(name),{sha256:stem.sha256,bytes:stem.bytes},signal,owned,name,100_000_000);const staged=streamedFileFingerprint(file(name),100_000_000);
      stems.push({id:stem.id,kind:stem.kind,path:name,sha256:staged.sha256,bytes:staged.bytes,decodedSamples:stem.decoded_samples,startSample:stem.start_sample,gainDb:stem.gain_db});
    }
    mkdirSync(output);owned.set('vm-fixed-gain-output',fileIdentity(output));const mixerContract:FixedGainMixContract={schemaVersion:'visualmaker-fixed-gain-mix-v1',sampleRate:48000,channels:2,durationSamples:mix.duration_samples,voice:{id:'voice',path:'voice.wav',sha256:voiceFp.sha256,bytes:voiceFp.bytes,decodedSamples:mix.duration_samples,gainDb:0},stems};
    input.onStage('mix-pcm');const receipt:FixedGainMixReceipt=await runFixedGainMix({contract:mixerContract,repositoryRoot:temp,outputDir:output,signal,timeoutMs:120_000,privateFinalizationStagingRoot:parent});
    const mixed=path.join(output,'technical-fixed-gain-mix.wav'),receiptPath=path.join(output,'technical-fixed-gain-mix.json'),receiptSha=streamedFileFingerprint(receiptPath,1_000_000).sha256,mixedHash=streamedFileFingerprint(mixed,MAX_RAW+4096).sha256;
    owned.set('vm-fixed-gain-output/technical-fixed-gain-mix.wav',fileIdentity(mixed));owned.set('vm-fixed-gain-output/technical-fixed-gain-mix.json',fileIdentity(receiptPath));
    if(mixedHash!==receipt.output.sha256||receiptSha!==sha(readFileSync(receiptPath))||receipt.contractSha256!==fixedGainMixContractSha256(mixerContract)||receipt.sampleCount!==mix.duration_samples||receipt.clippingCount!==0)throw new Error('mix-v2-mixer-receipt');
    input.onStage('mix-encode');const before=streamedFileFingerprint(mixed,MAX_RAW+4096);
    await command('ffmpeg',['-nostdin','-v','error','-i',mixed,'-map','0:a:0','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart',m4a],signal,m4a);
    owned.set('mixed.m4a',fileIdentity(m4a));
    const after=streamedFileFingerprint(mixed,MAX_RAW+4096);if(before.sha256!==after.sha256||before.bytes!==after.bytes)throw new Error('mix-v2-encoder-input-drift');
    const encoded=streamedFileFingerprint(m4a,MAX_OUTPUT),encodedPresentation=await probeM4a(m4a,signal);
    if(encodedPresentation.presentedSamples!==mix.duration_samples)throw new Error('mix-v2-encoded-presentation');
    await command('ffmpeg',['-nostdin','-v','error','-i',m4a,'-map','0:a:0','-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le',encodedRaw],signal,encodedRaw);owned.set('encoded.f32le',fileIdentity(encodedRaw));
    if(rawSamples(encodedRaw)!==encodedPresentation.decodedSamples)throw new Error('mix-v2-encoded-count');
    const referenceRaw=file('mixed.f32le');await command('ffmpeg',['-nostdin','-v','error','-i',mixed,'-map','0:a:0','-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le',referenceRaw],signal,referenceRaw);owned.set('mixed.f32le',fileIdentity(referenceRaw));
    if(rawSamples(referenceRaw)!==mix.duration_samples)throw new Error('mix-v2-mixed-count');
    const breaks=mix.stems.flatMap(stem=>[stem.start_sample,stem.start_sample+stem.decoded_samples]);
    const content=await compareContent(referenceRaw,encodedRaw,mix.duration_samples,encodedPresentation.decodedSamples,breaks,signal);
    const packet=await packetHash(m4a,signal),decodedHash=streamedFileFingerprint(encodedRaw,MAX_RAW).sha256;
    const measured:FinalizationMixMeasured={sourceVoice:{sha256:sourceVoiceHash,...sourcePresentation,tailDiscardSamples:mix.voice_tail_discard_samples,sampleRate:48000,channels:2},mixer:{contractSha256:receipt.contractSha256,receiptSha256:receiptSha,outputSha256:mixedHash,sampleCount:receipt.sampleCount,peak:receipt.peak,rms:receipt.rms,clippingCount:receipt.clippingCount},encoded:{sha256:encoded.sha256,bytes:encoded.bytes,packetSha256:packet,decodedPcmSha256:decodedHash,...encodedPresentation,sampleRate:48000,channels:2,peak:content.peak,rms:content.rms,clippingCount:content.clippingCount},outputAudio:{packetSha256:'',decodedPcmSha256:'',...encodedPresentation,sampleRate:48000,channels:2},sourceVideoPacketSha256:''};
    if(streamedFileFingerprint(stagedSource,4_000_000_000).sha256!==binding.sourceSha256)throw new Error('mix-v2-staged-source-drift');
    return {source:stagedSource,m4a,measured,contentWindows:content.windows,cleanup:()=>{if(!strictOwnedCleanup(temp,owned))throw new Error('mix-v2-owned-cleanup-incomplete');}};
  }catch(error){strictOwnedCleanup(temp,owned);throw error;}
}
async function probeM4a(file:string,signal:AbortSignal):ReturnType<typeof probe>{
  // The same packet/frame checks apply; a standalone audio container has no video stream.
  return await probe(file,signal,true);
}
export async function packetHash(file:string,signal:AbortSignal):Promise<string>{const value=await command('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-c','copy','-f','hash','-hash','SHA256','pipe:1'],signal,undefined,4096);const match=/^SHA256=([a-f0-9]{64})$/iu.exec(value);if(!match)throw new Error('mix-v2-packet-hash');return match[1].toLowerCase();}
export async function verifyFinalizationMixOutput(file:string,expected:FinalizationMixMeasured,signal:AbortSignal):Promise<FinalizationMixMeasured['outputAudio']>{
  const presentation=await probe(file,signal),packet=await packetHash(file,signal);
  if(packet!==expected.encoded.packetSha256||presentation.presentedSamples!==expected.encoded.presentedSamples||presentation.decodedSamples!==expected.encoded.decodedSamples)throw new Error('mix-v2-mux-audio-drift');
  const parent=privateStagingParent(path.dirname(file)),temp=mkdtempSync(path.join(parent,'vm-fixed-gain-v2-')),raw=path.join(temp,'output.f32le'),owned=new Map<string,string>();
  try{await command('ffmpeg',['-nostdin','-v','error','-i',file,'-map','0:a:0','-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le',raw],signal,raw);owned.set('output.f32le',fileIdentity(raw));if(rawSamples(raw)!==presentation.decodedSamples)throw new Error('mix-v2-mux-decoded-count');const fp=streamedFileFingerprint(raw,MAX_RAW);if(fp.sha256!==expected.encoded.decodedPcmSha256)throw new Error('mix-v2-mux-decoded-content');return {packetSha256:packet,decodedPcmSha256:fp.sha256,...presentation,sampleRate:48000,channels:2};}
  finally{if(!strictOwnedCleanup(temp,owned))throw new Error('mix-v2-owned-cleanup-incomplete');}
}
