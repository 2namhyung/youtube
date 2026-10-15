import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {safeCanonicalFile} from '../core/canonical-cut-render.ts';
import {streamedFileFingerprint} from '../core/episode-provisional.ts';
import {dataRoot} from '../core/store.ts';
import {assertPlainCaptionText,bindFinalizationMix} from '../core/finalization-mix.ts';
import {prepareFinalizationMix,verifyFinalizationMixOutput} from './finalization-mix-adapter.ts';
import {auditPlainMovText} from './finalization-subtitle-audit.ts';
import type {CaptionSegment,FinalizationExecutionContract,FinalizationResult} from './finalization-contract.ts';

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const LIMIT=4_000_000_000;
async function command(binary:'ffmpeg'|'ffprobe',args:string[],signal:AbortSignal,output?:string,cap=1_000_000):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});let text='',size=0,done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(watch);if(error)reject(error);else resolve(text.trim());};
    const timer=setTimeout(()=>{child.kill();finish(new Error('finalization-tool-timeout'));},3_600_000);
    const watch=setInterval(()=>{if(output&&existsSync(output)&&statSync(output).size>LIMIT){child.kill();finish(new Error('finalization-output-limit'));}},1000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>cap){child.kill();finish(new Error('finalization-output-log-limit'));}else text+=chunk.toString('utf8');});
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>cap){child.kill();finish(new Error('finalization-output-log-limit'));}});
    child.once('error',()=>finish(new Error('finalization-tool-unavailable')));child.once('close',code=>finish(code===0&&!signal.aborted?undefined:new Error('finalization-tool-failed')));
  });
}
async function rawFrame(file:string,index:number,width:number,height:number,signal:AbortSignal):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const expected=width*height*3,child=spawn('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${index})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let size=0,done=false;const hash=createHash('sha256');const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else if(size!==expected)reject(new Error('finalization-frame-size'));else resolve(hash.digest('hex'));};
    const timer=setTimeout(()=>{child.kill();finish(new Error('finalization-frame-timeout'));},600_000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>expected){child.kill();finish(new Error('finalization-frame-limit'));}else hash.update(chunk);});
    child.stderr.on('data',()=>{});child.once('error',()=>finish(new Error('finalization-frame-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('finalization-frame-decode')));
  });
}
async function packetHash(file:string,stream:'v'|'a',signal:AbortSignal):Promise<string>{
  const output=await command('ffmpeg',['-v','error','-i',file,'-map',`0:${stream}:0`,'-c','copy','-f','hash','-hash','SHA256','pipe:1'],signal);
  const match=/^SHA256=([a-f0-9]{64})$/iu.exec(output);if(!match)throw new Error('finalization-packet-hash');return match[1].toLowerCase();
}
function timestamp(frame:number,fps:number,divider:','|'.'):string{
  const ms=Math.round(frame*1000/fps),hours=Math.floor(ms/3_600_000),minutes=Math.floor(ms%3_600_000/60_000),seconds=Math.floor(ms%60_000/1000),fraction=ms%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${divider}${String(fraction).padStart(3,'0')}`;
}
export function captionSidecars(segments:CaptionSegment[],fps:number):{srt:string;vtt:string}{
  if(!Number.isSafeInteger(fps)||fps<1||fps>120||!segments.length)throw new Error('finalization-fps');
  let previous=-1;const srt=[''],vtt=['WEBVTT',''];
  for(let index=0;index<segments.length;index++){
    const segment=segments[index],start=Math.round(segment.start_frame*1000/fps),end=Math.round(segment.end_frame*1000/fps);
    if(!Number.isSafeInteger(segment.start_frame)||!Number.isSafeInteger(segment.end_frame)||start<previous||end<=start||!segment.text.trim()||/[\r\n\u0000-\u001f]/u.test(segment.text))throw new Error('finalization-caption-timing-or-text');
    previous=end;
    srt.push(String(index+1),`${timestamp(segment.start_frame,fps,',')} --> ${timestamp(segment.end_frame,fps,',')}`,segment.text,'');
    vtt.push(`${timestamp(segment.start_frame,fps,'.')} --> ${timestamp(segment.end_frame,fps,'.')}`,segment.text,'');
  }
  return {srt:srt.join('\n'),vtt:vtt.join('\n')};
}
function inputStable(root:string,contract:FinalizationExecutionContract):boolean{
  const binding=contract.report.binding;if(!binding)return false;
  try{
    if(streamedFileFingerprint(binding.sourcePath,LIMIT).sha256!==binding.sourceSha256)return false;
    if(streamedFileFingerprint(path.join(path.dirname(binding.sourcePath),'provisional-voiced-episode.json'),5_000_000).sha256!==binding.receiptSha256)return false;
    if(binding.selection.version===2){if(!binding.mixAuthorityPaths?.length)return false;const mix=bindFinalizationMix(root,binding.selection,binding.captionContractSha256,binding.captionMarkerSha256,binding.mixAuthorityPaths);if(mix.payloadSha256!==binding.mixPayloadSha256||mix.markerSha256!==binding.mixApprovalMarkerSha256||JSON.stringify(mix.rightsEvidence)!==JSON.stringify(binding.mixRightsEvidence))return false;}
    for(const [relative,digest] of Object.entries(contract.report.fingerprints))if(!digest||streamedFileFingerprint(safeCanonicalFile(root,relative),binding.selection.version===2&&binding.selection.mix.stems.some(stem=>stem.path===relative)?100_000_000:25_000_000).sha256!==digest)return false;
    return true;
  }catch{return false;}
}
function subtitleMilliseconds(value:string):number{
  const match=/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/u.exec(value);
  if(!match)throw new Error('finalization-subtitle-time-format');
  return ((Number(match[1])*60+Number(match[2]))*60+Number(match[3]))*1000+Number(match[4]);
}
export async function runFinalizationEngine(input:{contract:FinalizationExecutionContract;rootDir:string;work:string;signal:AbortSignal;onStage:(stage:string)=>void}):Promise<FinalizationResult>{
  const report=input.contract.report,binding=report.binding,composition=report.composition;
  if(!binding||!composition||input.contract.schemaVersion!==(binding.selection.version===2?'visualmaker-finalization-execution-v2':'visualmaker-finalization-execution-v1')||input.contract.reportSha256!==sha(JSON.stringify(report))||!report.renderEligible||report.blockers.length||report.productionAuthority!==false||report.reviewApproved!==false||binding.selection.version===1&&binding.selection.mix.mode!=='passthrough'||binding.selection.version===2&&(binding.selection.mix.mode!=='fixed-gain-stems'||!binding.mixPayloadSha256||!binding.mixApprovalMarkerSha256))throw new Error('finalization-contract-blocked');
  const root=realpathSync(input.rootDir),work=realpathSync(input.work),source=realpathSync(binding.sourcePath),staging=realpathSync(path.join(dataRoot(),'jobs','staging'));
  if(!work.startsWith(staging+path.sep)||!/[\\/]jobs[\\/]staging[\\/][a-f0-9-]{36}[\\/]work$/iu.test(work))throw new Error('finalization-work-root');
  const sourceRoot=realpathSync(path.join(dataRoot(),'jobs'));
  if(!source.startsWith(sourceRoot+path.sep)||!/[\\/]jobs[\\/]job_[a-f0-9-]{36}[\\/]attempt-[1-9]\d*[\\/]provisional-voiced-episode\.mp4$/iu.test(source))throw new Error('finalization-source-root');
  if(!source||!inputStable(root,input.contract))throw new Error('finalization-input-drift');
  const {srt,vtt}=captionSidecars(binding.selection.captions.segments,composition.fps);
  // WebVTT markup/entity/ASS-looking text is not yet a supported literal-text
  // encoding contract. Do not allow the muxer to reinterpret visible text.
  if(binding.selection.version===2)assertPlainCaptionText(binding.selection.captions.segments);
  const file=(name:string)=>path.join(work,name);
  for(const name of ['export.mp4','export.srt','export.vtt','export.png','export.json'])if(existsSync(file(name)))throw new Error('finalization-output-exists');
  const mixSession=binding.selection.version===2?await prepareFinalizationMix({root,source,work,binding,signal:input.signal,onStage:input.onStage,expectedPresentedSamples:composition.durationFrames*48_000/composition.fps}):null;
  try{
  const renderSource=mixSession?.source??source;
  writeFileSync(file('export.srt'),srt,{flag:'wx'});writeFileSync(file('export.vtt'),vtt,{flag:'wx'});
  input.onStage('subtitle-mux');
  if(mixSession)await command('ffmpeg',['-v','error','-i',renderSource,'-i',mixSession.m4a,'-f','webvtt','-i',file('export.vtt'),'-map','0:v:0','-map','1:a:0','-map','2:0','-c:v','copy','-c:a','copy','-c:s','mov_text','-metadata:s:s:0','language=kor','-movflags','+faststart',file('export.mp4')],input.signal,file('export.mp4'));
  else await command('ffmpeg',['-v','error','-i',source,'-f','srt','-i',file('export.srt'),'-map','0:v:0','-map','0:a:0','-map','1:0','-c:v','copy','-c:a','copy','-c:s','mov_text','-metadata:s:s:0','language=kor','-movflags','+faststart',file('export.mp4')],input.signal,file('export.mp4'));
  if(!inputStable(root,input.contract))throw new Error('finalization-input-drift');
  input.onStage('thumbnail');
  const frame=binding.selection.thumbnail.frame;
  await command('ffmpeg',['-v','error','-i',renderSource,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-vsync','0',file('export.png')],input.signal,file('export.png'));
  input.onStage('verify');
  const probe=JSON.parse(await command('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels','-of','json',file('export.mp4')],input.signal)) as {format?:{duration?:string};streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;avg_frame_rate?:string;nb_read_frames?:string;sample_rate?:string;channels?:number}>};
  const video=probe.streams?.filter(s=>s.codec_type==='video')??[],audio=probe.streams?.filter(s=>s.codec_type==='audio')??[],subtitle=probe.streams?.filter(s=>s.codec_type==='subtitle')??[],durationSeconds=Number(probe.format?.duration);
  if(video.length!==1||audio.length!==1||subtitle.length!==1||video[0].width!==composition.width||video[0].height!==composition.height||video[0].codec_name!=='h264'||audio[0].codec_name!=='aac'||subtitle[0].codec_name!=='mov_text'||Number(video[0].nb_read_frames)!==composition.durationFrames||!Number.isFinite(durationSeconds)||Math.abs(durationSeconds-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps))throw new Error('finalization-stream-contract');
  const sourceVideoPacketSha256=await packetHash(renderSource,'v',input.signal),videoPacketSha256=await packetHash(file('export.mp4'),'v',input.signal),sourceAudioPacketSha256=await packetHash(renderSource,'a',input.signal),audioPacketSha256=await packetHash(file('export.mp4'),'a',input.signal);
  if(sourceVideoPacketSha256!==videoPacketSha256||!mixSession&&sourceAudioPacketSha256!==audioPacketSha256)throw new Error('finalization-packet-identity');
  if(mixSession){mixSession.measured.outputAudio=await verifyFinalizationMixOutput(file('export.mp4'),mixSession.measured,input.signal);mixSession.measured.sourceVideoPacketSha256=sourceVideoPacketSha256;if(mixSession.measured.outputAudio.packetSha256!==audioPacketSha256)throw new Error('mix-v2-output-packet-drift');}
  const indexes=[0,Math.floor((composition.durationFrames-1)/2),composition.durationFrames-1],sourceFrames:string[]=[],frames:string[]=[];
  for(const index of indexes){sourceFrames.push(await rawFrame(renderSource,index,composition.width,composition.height,input.signal));frames.push(await rawFrame(file('export.mp4'),index,composition.width,composition.height,input.signal));}
  if(JSON.stringify(sourceFrames)!==JSON.stringify(frames))throw new Error('finalization-frame-identity');
  const sourceThumbnailFrameSha256=await rawFrame(renderSource,frame,composition.width,composition.height,input.signal);
  const thumbnailFrameSha256=await rawFrame(file('export.png'),0,composition.width,composition.height,input.signal);
  if(sourceThumbnailFrameSha256!==thumbnailFrameSha256)throw new Error('finalization-thumbnail-identity');
  const decodedSrt=await command('ffmpeg',['-v','error','-i',file('export.mp4'),'-map','0:s:0','-f','srt','pipe:1'],input.signal,undefined,5_000_000);
  const subtitleBlocks=decodedSrt.split(/\r?\n\r?\n/u).filter(Boolean).map(block=>block.split(/\r?\n/u));
  const subtitleText=subtitleBlocks.map(lines=>lines.slice(2).join('\n'));
  const subtitleTimes=subtitleBlocks.map(lines=>{const timing=/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/u.exec(lines[1]??'');if(!timing)throw new Error('finalization-subtitle-time-format');return {startMs:subtitleMilliseconds(timing[1]),endMs:subtitleMilliseconds(timing[2])};});
  if(JSON.stringify(subtitleText)!==JSON.stringify(binding.selection.captions.segments.map(segment=>segment.text)))throw new Error('finalization-subtitle-text');
  if(subtitleTimes.length!==binding.selection.captions.segments.length||subtitleTimes.some((time,index)=>Math.abs(time.startMs-Math.round(binding.selection.captions.segments[index].start_frame*1000/composition.fps))>1||Math.abs(time.endMs-Math.round(binding.selection.captions.segments[index].end_frame*1000/composition.fps))>1))throw new Error('finalization-subtitle-timing');
  if(mixSession){
    const rawSubtitleProbe=JSON.parse(await command('ffprobe',['-v','error','-select_streams','s:0','-show_streams','-show_packets','-show_data','-show_entries','stream=codec_name,time_base,extradata:packet=pts,duration,data','-of','json',file('export.mp4')],input.signal,undefined,10_000_000));
    auditPlainMovText(rawSubtitleProbe,binding.selection.captions.segments,composition.fps);
  }
  if(!inputStable(root,input.contract)||input.signal.aborted)throw new Error('finalization-input-drift');
  const ffmpegVersion=(await command('ffmpeg',['-version'],input.signal)).split(/\r?\n/u)[0]??'';
  const measured={width:composition.width,height:composition.height,fps:composition.fps,frames:composition.durationFrames,durationSeconds,videoPacketSha256,sourceVideoPacketSha256,frameSha256:frames as [string,string,string],sourceFrameSha256:sourceFrames as [string,string,string],thumbnailFrameSha256,sourceThumbnailFrameSha256,audioPacketSha256,sourceAudioPacketSha256,subtitleCount:subtitleText.length,subtitleText,subtitleTimes};
  const mediaNames=['export.mp4','export.srt','export.vtt','export.png'] as const;
  const files:FinalizationResult['files']=mediaNames.map(name=>({name,...streamedFileFingerprint(file(name),LIMIT)}));
  const receipt={schemaVersion:mixSession?'visualmaker-finalization-receipt-v2':'visualmaker-finalization-receipt-v1',episodeId:'episode-001',source:{jobId:binding.selection.source.job_id,attempt:binding.selection.source.attempt,artifactSha256:binding.sourceSha256,receiptSha256:binding.receiptSha256},authority:{episodeSpecSha256:binding.specSha256,preLockStateSha256:binding.preLockStateSha256,productionStateSha256:binding.stateSha256,addendumPath:binding.addendumPath,addendumSha256:binding.addendumSha256,finalScriptSha256:binding.scriptSha256,pictureMarkerSha256:binding.pictureMarkerSha256,captionMarkerSha256:binding.captionMarkerSha256,captionContractSha256:binding.captionContractSha256},mix:mixSession?{mode:'fixed-gain-stems',payloadSha256:binding.mixPayloadSha256,approvalMarkerSha256:binding.mixApprovalMarkerSha256,rightsEvidence:binding.mixRightsEvidence,measurements:mixSession.measured,contentWindows:mixSession.contentWindows}:{mode:'passthrough'},thumbnail:{frame},measured,files,ffmpegVersion,productionAuthority:false,reviewApproved:false};
  writeFileSync(file('export.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});files.push({name:'export.json',...streamedFileFingerprint(file('export.json'),5_000_000)});
  if(!inputStable(root,input.contract))throw new Error('finalization-input-drift');
  return {files,measured,ffmpegVersion,...mixSession?{mixMeasured:mixSession.measured}:{},productionAuthority:false,reviewApproved:false};
  }finally{mixSession?.cleanup();}
}
