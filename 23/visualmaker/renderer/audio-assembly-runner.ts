import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {AUDIO_SAMPLE_RATE} from '../core/audio-assembly.ts';
import {safeCanonicalFile} from '../core/canonical-cut-render.ts';
import {EPISODE_OUTPUT_LIMIT,streamedFileFingerprint} from '../core/episode-provisional.ts';
import {renderEpisodeEngine} from './episode-runner.ts';
import type {AudioAssemblyExecutionContract,AudioAssemblyResult,AudioVoiceMeasurement} from './audio-assembly-contract.ts';

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const PCM_FRAME_BYTES=8;
const MAX_PCM_BYTES=4_000_000_000;
const PROCESS_TIMEOUT=3_600_000;

async function command(binary:'ffmpeg'|'ffprobe',args:string[],signal:AbortSignal,output?:string):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let data='',size=0,settled=false;
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(watch);if(error)reject(error);else resolve(data.trim());};
    const timer=setTimeout(()=>{child.kill();finish(new Error('media-tool-timeout'));},PROCESS_TIMEOUT);
    const watch=setInterval(()=>{if(output&&existsSync(output)&&statSync(output).size>(output.endsWith('.pcm')?MAX_PCM_BYTES:EPISODE_OUTPUT_LIMIT)){child.kill();finish(new Error('media-output-limit'));}},1000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(new Error('media-tool-log-limit'));}else data+=chunk.toString('utf8');});
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(new Error('media-tool-log-limit'));}});
    child.once('error',()=>finish(new Error('media-tool-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('media-tool-failed')));
  });
}
async function scanPcm(file:string):Promise<{samples:number;audibleSamples:number;first:number;last:number;nonzero:boolean}>{
  const detail=await stat(file);if(detail.size<PCM_FRAME_BYTES||detail.size>MAX_PCM_BYTES||detail.size%PCM_FRAME_BYTES)throw new Error('decoded-audio-size');
  let sample=0,audibleSamples=0,first=-1,last=-1;
  for await(const chunk of createReadStream(file,{highWaterMark:PCM_FRAME_BYTES*8192})){
    const bytes=chunk as Buffer;if(bytes.length%PCM_FRAME_BYTES)throw new Error('decoded-audio-alignment');
    for(let offset=0;offset<bytes.length;offset+=PCM_FRAME_BYTES){
      const left=bytes.readFloatLE(offset),right=bytes.readFloatLE(offset+4);
      if(!Number.isFinite(left)||!Number.isFinite(right))throw new Error('decoded-audio-invalid');
      if(Math.abs(left)>0.0001||Math.abs(right)>0.0001){if(first<0)first=sample;last=sample;audibleSamples++;}
      sample++;
    }
  }
  return {samples:sample,audibleSamples,first,last,nonzero:first>=0};
}
async function audibleWindow(file:string,start:number,end:number):Promise<number>{
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start)throw new Error('audio-window-invalid');
  const handle=await import('node:fs/promises').then(module=>module.open(file,'r'));let audible=0;
  try{const buffer=Buffer.allocUnsafe(PCM_FRAME_BYTES*4096);
    for(let position=start;position<end;){const count=Math.min(4096,end-position),read=await handle.read(buffer,0,count*PCM_FRAME_BYTES,position*PCM_FRAME_BYTES);
      if(read.bytesRead!==count*PCM_FRAME_BYTES)throw new Error('audio-window-read');
      for(let index=0;index<count;index++)if(Math.abs(buffer.readFloatLE(index*PCM_FRAME_BYTES))>0.0001||Math.abs(buffer.readFloatLE(index*PCM_FRAME_BYTES+4))>0.0001)audible++;
      position+=count;
    }
  }finally{await handle.close();}
  return audible;
}
async function decodedFrameSha(file:string,index:number,width:number,height:number,signal:AbortSignal):Promise<string>{
  const {spawn:spawnCommand}=await import('node:child_process');
  return await new Promise((resolve,reject)=>{
    const child=spawnCommand('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${index})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    const expected=width*height*3,chunks:Buffer[]=[];let size=0,done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else if(size!==expected)reject(new Error('video-frame-size'));else resolve(sha(Buffer.concat(chunks)));};
    const timer=setTimeout(()=>{child.kill();finish(new Error('video-frame-timeout'));},600_000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>expected){child.kill();finish(new Error('video-frame-limit'));}else chunks.push(chunk);});
    child.stderr.on('data',()=>{});child.once('error',()=>finish(new Error('video-frame-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('video-frame-decode')));
  });
}
export async function runAudioAssemblyEngine(input:{contract:AudioAssemblyExecutionContract;entry:string;publicDir:string;rootDir:string;work:string;signal:AbortSignal;onStage:(stage:string)=>void}):Promise<AudioAssemblyResult>{
  const composition=input.contract.report.composition;
  if(!input.contract.report.renderEligible||!composition||input.contract.report.voices.length!==input.contract.report.visual.cuts.length)throw new Error('audio-contract-blocked');
  const source=path.join(input.work,'provisional-episode.mp4');
  input.onStage('visual-render');
  const visual=await renderEpisodeEngine({entry:input.entry,publicDir:input.publicDir,rootDir:input.rootDir,work:input.work,composition,signal:input.signal,onStage:input.onStage});
  if(visual.output.sha256!==streamedFileFingerprint(source,EPISODE_OUTPUT_LIMIT).sha256)throw new Error('visual-render-changed');
  const samplesPerFrame=AUDIO_SAMPLE_RATE/composition.fps,totalSamples=composition.durationFrames*samplesPerFrame;
  if(!Number.isSafeInteger(samplesPerFrame)||!Number.isSafeInteger(totalSamples)||totalSamples<1)throw new Error('audio-frame-rate');
  const measuredVoices:AudioVoiceMeasurement[]=[],pcmFiles:string[]=[];
  for(let index=0;index<input.contract.report.voices.length;index++){
    if(input.signal.aborted)throw new Error('cancelled');
    const voice=input.contract.report.voices[index],original=safeCanonicalFile(input.rootDir,voice.path),fingerprint=streamedFileFingerprint(original,2_000_000_000);
    if(fingerprint.sha256!==voice.sha256||fingerprint.bytes!==voice.bytes)throw new Error('voice-input-changed');
    const pcm=path.join(input.work,`voice-${index}.pcm`);input.onStage('voice-decode');
    await command('ffmpeg',['-v','error','-i',original,'-vn','-ac','2','-ar',String(AUDIO_SAMPLE_RATE),'-f','f32le',pcm],input.signal,pcm);
    const decoded=await scanPcm(pcm),voiceFrames=Math.ceil(decoded.samples/samplesPerFrame);
    if(!decoded.nonzero||decoded.samples!==voice.decodedSamples||decoded.audibleSamples!==voice.audibleSamples||decoded.first!==voice.firstAudibleSample||decoded.last!==voice.lastAudibleSample||voice.preRollFrames+voiceFrames+voice.postHoldFrames!==voice.cutEndFrame-voice.startFrame||voice.voiceStartSample+decoded.samples>(voice.cutEndFrame-voice.postHoldFrames)*samplesPerFrame||decoded.samples!==voice.voiceSamples)throw new Error(`${voice.cutId}: decoded-voice-timing-mismatch`);
    const prev=measuredVoices.at(-1);if(prev&&prev.voiceStartSample+prev.decodedSamples>voice.voiceStartSample)throw new Error('speech-overlap-unapproved');
    measuredVoices.push({...voice,decodedSamples:decoded.samples,firstAudibleSample:decoded.first,lastAudibleSample:decoded.last});pcmFiles.push(pcm);
  }
  const filters=measuredVoices.map((voice,index)=>`[${index+1}:a]adelay=${voice.voiceStartSample}S:all=1[a${index}]`);
  filters.push(`${measuredVoices.map((_,index)=>`[a${index}]`).join('')}amix=inputs=${measuredVoices.length}:duration=longest:normalize=0,apad,atrim=end_sample=${totalSamples}[mixed]`);
  const output=path.join(input.work,'provisional-voiced-episode.mp4');input.onStage('audio-mux');
  await command('ffmpeg',['-v','error','-i',source,...pcmFiles.flatMap(file=>['-f','f32le','-ar',String(AUDIO_SAMPLE_RATE),'-ac','2','-i',file]),'-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mixed]','-c:v','copy','-c:a','aac','-b:a','192k','-ar',String(AUDIO_SAMPLE_RATE),'-ac','2','-movflags','+faststart',output],input.signal,output);
  const version=(await command('ffmpeg',['-version'],input.signal)).split(/\r?\n/u)[0]??'';
  input.onStage('output-probe');
  const probe=JSON.parse(await command('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels','-of','json',output],input.signal)) as {format?:{duration?:string};streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;avg_frame_rate?:string;nb_read_frames?:string;sample_rate?:string;channels?:number}>};
  const videos=probe.streams?.filter(stream=>stream.codec_type==='video')??[],audios=probe.streams?.filter(stream=>stream.codec_type==='audio')??[],v=videos[0],a=audios[0],durationSeconds=Number(probe.format?.duration);
  if(videos.length!==1||audios.length!==1||v?.codec_name!=='h264'||a?.codec_name!=='aac'||v.width!==composition.width||v.height!==composition.height||v.avg_frame_rate!==`${composition.fps}/1`&&v.avg_frame_rate!==String(composition.fps)||Number(v.nb_read_frames)!==composition.durationFrames||Number(a.sample_rate)!==AUDIO_SAMPLE_RATE||a.channels!==2||!Number.isFinite(durationSeconds)||Math.abs(durationSeconds-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps))throw new Error('audio-output-contract-mismatch');
  const indexes=[0,Math.floor((composition.durationFrames-1)/2),composition.durationFrames-1];
  const frames=[];for(const index of indexes)frames.push(await decodedFrameSha(output,index,composition.width,composition.height,input.signal));
  if(JSON.stringify(frames)!==JSON.stringify(visual.measured.frameSha256))throw new Error('visual-frame-identity-mismatch');
  const packetHash=async(file:string)=>{
    const value=await command('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c','copy','-f','hash','-hash','SHA256','pipe:1'],input.signal);
    const match=/^SHA256=([a-f0-9]{64})$/iu.exec(value);if(!match)throw new Error('video-packet-hash-invalid');return match[1].toLowerCase();
  };
  const videoPacketSha256=await packetHash(source);
  if(videoPacketSha256!==await packetHash(output))throw new Error('visual-packet-identity-mismatch');
  const outputPcm=path.join(input.work,'output-audio.pcm');
  await command('ffmpeg',['-v','error','-i',output,'-map','0:a:0','-ac','2','-ar',String(AUDIO_SAMPLE_RATE),'-f','f32le',outputPcm],input.signal,outputPcm);
  const decodedOutput=await scanPcm(outputPcm);
  const expectedFirst=measuredVoices[0].voiceStartSample+measuredVoices[0].firstAudibleSample;
  if(!decodedOutput.nonzero||Math.abs(decodedOutput.first-expectedFirst)>2048||decodedOutput.samples<totalSamples||decodedOutput.samples>totalSamples+2048)throw new Error('audio-onset-or-length-mismatch');
  const voiceWindowActivity=[];
  for(const voice of measuredVoices){const startSample=voice.voiceStartSample+voice.firstAudibleSample,endSample=Math.min(decodedOutput.samples,voice.voiceStartSample+voice.lastAudibleSample+1);
    const audibleSamples=await audibleWindow(outputPcm,startSample,endSample);
    if(audibleSamples<Math.min(100,endSample-startSample))throw new Error(`${voice.cutId}: output-voice-inaudible`);
    voiceWindowActivity.push({cutId:voice.cutId,startSample,endSample,audibleSamples});
  }
  const fingerprint=streamedFileFingerprint(output,EPISODE_OUTPUT_LIMIT);
  return {output:{name:'provisional-voiced-episode.mp4',...fingerprint},visual:visual.measured,measured:{width:composition.width,height:composition.height,fps:composition.fps,frames:composition.durationFrames,durationSeconds,videoCodec:'h264',audioCodec:'aac',audioStreams:1,audioSampleRate:AUDIO_SAMPLE_RATE,audioChannels:2,decodedAudioSamples:decodedOutput.samples,decodedAudioNonzero:true,firstAudibleSample:decodedOutput.first,voiceWindowActivity,videoPacketSha256,frameSha256:frames as [string,string,string]},voices:measuredVoices,ffmpegVersion:version};
}

if(process.argv[2]==='--audio-child'){
  const [, , ,work,contractSha]=process.argv,controller=new AbortController();
  process.on('message',message=>{if(message&&typeof message==='object'&&'type' in message&&message.type==='cancel')controller.abort();});
  let stage='resolve';
  (async()=>{
    if(!work||!/^[a-f0-9]{64}$/u.test(contractSha||'')||!process.env.VISUALMAKER_DATA_DIR)throw new Error('invalid-child-input');
    const root=realpathSync(process.cwd()),actual=realpathSync(work),data=realpathSync(process.env.VISUALMAKER_DATA_DIR);
    if(!actual.startsWith(data+path.sep)||!/[\\/]jobs[\\/]staging[\\/][a-f0-9-]{36}[\\/]work$/iu.test(actual))throw new Error('unsafe-work-path');
    const bytes=readFileSync(path.join(actual,'contract.json'));
    if(bytes.length<1||bytes.length>5_000_000||sha(bytes)!==contractSha)throw new Error('contract-sha-mismatch');
    const contract=JSON.parse(bytes.toString('utf8')) as AudioAssemblyExecutionContract;
    const entry=safeCanonicalFile(root,'video/src/production-index.tsx'),publicDir=realpathSync(path.join(actual,'public'));
    const result=await runAudioAssemblyEngine({contract,entry,publicDir,rootDir:root,work:actual,signal:controller.signal,onStage:next=>{stage=next;if(process.connected)process.send?.({type:'audio-stage',stage:next});}});
    if(process.connected)process.send?.({type:'audio-result',result},()=>process.disconnect?.());
  })().catch(()=>{process.exitCode=1;if(process.connected)process.send?.({type:'audio-error',stage},()=>process.disconnect?.());});
}
