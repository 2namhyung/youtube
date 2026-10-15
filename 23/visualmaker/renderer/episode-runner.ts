import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {makeCancelSignal,openBrowser,renderMedia,selectComposition} from '@remotion/renderer';
import {checkedBrowser} from './runner.ts';
import {EPISODE_RENDERER_VERSION} from './episode-contract.ts';
import type {EpisodeExecutionContract,EpisodeReceipt} from './episode-contract.ts';
import {EPISODE_OUTPUT_LIMIT,streamedFileFingerprint} from '../core/episode-provisional.ts';

type Stage='resolve'|'bundle'|'open'|'select'|'render'|'probe'|'decode'|'publish';
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const MAX_OUTPUT=EPISODE_OUTPUT_LIMIT;
function command(binary:'ffprobe'|'ffmpeg',args:string[],limit:number,signal?:AbortSignal):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});let used=0,settled=false;const chunks:Buffer[]=[];
    const timer=setTimeout(()=>{child.kill();finish(new Error('media-tool-timeout'));},600_000);
    function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(Buffer.concat(chunks));}
    child.stdout.on('data',(chunk:Buffer)=>{used+=chunk.length;if(used>limit){child.kill();finish(new Error('media-tool-output-limit'));}else chunks.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{used+=chunk.length;if(used>limit){child.kill();finish(new Error('media-tool-output-limit'));}});
    child.once('error',()=>finish(new Error('media-tool-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('media-tool-failed')));
  });
}
export async function measureEpisodeVideo(file:string,expected:NonNullable<EpisodeExecutionContract['report']['composition']>,onStage:(stage:Stage)=>void,signal?:AbortSignal):Promise<EpisodeReceipt['measured']>{
  onStage('probe');const raw=await command('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames','-of','json',file],2_000_000,signal);
  const data=JSON.parse(raw.toString('utf8')) as {format?:{duration?:string};streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;avg_frame_rate?:string;nb_read_frames?:string}>};
  const video=data.streams?.filter(stream=>stream.codec_type==='video')??[],audio=data.streams?.filter(stream=>stream.codec_type==='audio')??[];
  const v=video[0],duration=Number(data.format?.duration),fps=v?.avg_frame_rate?.split('/').map(Number);
  if(video.length!==1||audio.length!==0||v.codec_name!=='h264'||v.width!==expected.width||v.height!==expected.height||!fps||fps.length!==2||fps[0]/fps[1]!==expected.fps||Number(v.nb_read_frames)!==expected.durationFrames||!Number.isFinite(duration)||Math.abs(duration-expected.durationFrames/expected.fps)>Math.max(.12,2/expected.fps))throw new Error('episode-video-contract-mismatch');
  onStage('decode');const indexes=[0,Math.floor((expected.durationFrames-1)/2),expected.durationFrames-1] as const;const hashes:string[]=[];
  for(const index of indexes){const frame=await command('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${index})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],expected.width*expected.height*3+4096,signal);
    if(frame.length!==expected.width*expected.height*3)throw new Error('episode-frame-decode-failed');hashes.push(sha(frame));}
  return {width:expected.width,height:expected.height,fps:expected.fps,frames:expected.durationFrames,durationSeconds:duration,codec:'h264',audioStreams:0,frameSha256:hashes as [string,string,string]};
}

export async function renderEpisodeEngine(input:{entry:string;publicDir:string;rootDir:string;work:string;composition:NonNullable<EpisodeExecutionContract['report']['composition']>;signal:AbortSignal;onStage:(stage:Stage)=>void}):Promise<Pick<EpisodeReceipt,'output'|'measured'>>{
  const browserExecutable=checkedBrowser(),{cancelSignal,cancel}=makeCancelSignal();let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
  const abort=()=>{cancel();void browser?.close({silent:true}).catch(()=>{});};input.signal.addEventListener('abort',abort,{once:true});
  try{
    if(input.signal.aborted)throw new Error('cancelled');
    input.onStage('bundle');const serveUrl=await bundle({entryPoint:input.entry,publicDir:input.publicDir,rootDir:input.rootDir,outDir:path.join(input.work,'bundle'),enableCaching:false,onSymlinkDetected:()=>{throw new Error('bundle-symlink');}});
    if(input.signal.aborted)throw new Error('cancelled');
    input.onStage('open');browser=await openBrowser('chrome',{browserExecutable,chromeMode:'headless-shell',logLevel:'error'});
    input.onStage('select');const expected=input.composition;
    const composition=await selectComposition({serveUrl,id:expected.id,puppeteerInstance:browser,browserExecutable,logLevel:'error'});
    if(composition.id!==expected.id||composition.width!==expected.width||composition.height!==expected.height||composition.fps!==expected.fps||composition.durationInFrames!==expected.durationFrames)throw new Error('episode-composition-mismatch');
    if(input.signal.aborted)throw new Error('cancelled');
    const mp4=path.join(input.work,'provisional-episode.mp4');input.onStage('render');
    await renderMedia({serveUrl,composition,codec:'h264',outputLocation:mp4,puppeteerInstance:browser,browserExecutable,chromeMode:'headless-shell',concurrency:1,overwrite:false,muted:true,enforceAudioTrack:false,cancelSignal,logLevel:'error',onProgress:()=>{if(input.signal.aborted||existsSync(mp4)&&statSync(mp4).size>MAX_OUTPUT)cancel();}});
    if(input.signal.aborted)throw new Error('cancelled');
    const measured=await measureEpisodeVideo(mp4,expected,input.onStage,input.signal);
    if(input.signal.aborted)throw new Error('cancelled');
    const output=streamedFileFingerprint(mp4,MAX_OUTPUT);if(output.bytes!==statSync(mp4).size)throw new Error('episode-output-changed');
    input.onStage('publish');return {output:{name:'provisional-episode.mp4',...output},measured};
  }finally{input.signal.removeEventListener('abort',abort);cancel();await browser?.close({silent:true}).catch(()=>{});}
}

async function run(work:string,contract:EpisodeExecutionContract,signal:AbortSignal,onStage:(stage:Stage)=>void):Promise<Pick<EpisodeReceipt,'output'|'measured'>>{
  onStage('resolve');const root=realpathSync(process.cwd()),actual=realpathSync(work),publicDir=realpathSync(path.join(actual,'public'));
  if(!process.env.VISUALMAKER_DATA_DIR||!actual.startsWith(realpathSync(process.env.VISUALMAKER_DATA_DIR)+path.sep)||!publicDir.startsWith(actual+path.sep)||!contract.report.renderEligible||!contract.report.composition||contract.report.composition.id!=='EP001-Episode-Provisional')throw new Error('episode-contract-blocked');
  const entry=realpathSync(path.join(root,'video','src','production-index.tsx'));if(!entry.startsWith(root+path.sep))throw new Error('episode-entry-unsafe');
  const version=JSON.parse(readFileSync(path.join(root,'node_modules','@remotion','renderer','package.json'),'utf8')).version as string;
  if(version!==EPISODE_RENDERER_VERSION)throw new Error('renderer-version-mismatch');
  return renderEpisodeEngine({entry,publicDir,rootDir:root,work:actual,composition:contract.report.composition,signal,onStage});
}

if(process.argv[2]==='--episode-child'){
  const [, , ,work,contractSha]=process.argv;const controller=new AbortController();
  process.on('message',message=>{if(message&&typeof message==='object'&&'type' in message&&message.type==='cancel')controller.abort();});
  let stage:Stage='resolve';
  (async()=>{
    if(!work||!/^[a-f0-9]{64}$/.test(contractSha||'')||!process.env.VISUALMAKER_DATA_DIR)throw new Error('invalid-child-input');
    const actual=realpathSync(work),data=realpathSync(process.env.VISUALMAKER_DATA_DIR);
    if(!actual.startsWith(data+path.sep)||!/[\\/]jobs[\\/]staging[\\/][a-f0-9-]{36}[\\/]work$/i.test(actual))throw new Error('unsafe-work-path');
    const contractFile=path.join(actual,'contract.json');if(!existsSync(contractFile)||statSync(contractFile).size>5_000_000)throw new Error('invalid-contract-file');
    const bytes=readFileSync(contractFile);if(sha(bytes)!==contractSha)throw new Error('contract-sha-mismatch');
    const contract=JSON.parse(bytes.toString('utf8')) as EpisodeExecutionContract;
    const result=await run(actual,contract,controller.signal,next=>{stage=next;if(process.connected)process.send?.({type:'episode-stage',stage:next});});
    if(process.connected)process.send?.({type:'episode-result',result},()=>process.disconnect?.());
  })().catch(error=>{const message=error instanceof Error?error.message:'';const code=/browser|chrome/i.test(message)?'browser-unavailable':/bundle|rspack|module/i.test(message)?'bundle-failed':/probe|media-tool/i.test(message)?'probe-failed':/frame-decode/i.test(message)?'decode-failed':/cancel/i.test(message)?'cancelled':'stage-failed';process.exitCode=1;if(process.connected)process.send?.({type:'episode-error',stage,code},()=>process.disconnect?.());});
}
