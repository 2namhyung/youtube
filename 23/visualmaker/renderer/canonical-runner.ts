import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,existsSync,fstatSync,openSync,readFileSync,readSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {makeCancelSignal,openBrowser,renderMedia,selectComposition} from '@remotion/renderer';
import {checkedBrowser} from './runner.ts';
import {CANONICAL_RENDERER_VERSION} from './canonical-contract.ts';
import type {CanonicalExecutionContract,CanonicalReceipt} from './canonical-contract.ts';

type Stage='resolve'|'bundle'|'open'|'select'|'render'|'probe'|'decode'|'publish';
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const MAX_MP4=400_000_000;
function readBounded(file:string,max:number):Buffer{
  const fd=openSync(file,'r');try{const size=fstatSync(fd).size;if(size<1||size>max)throw new Error('bounded-read-size');
    const bytes=Buffer.allocUnsafe(size+1);let used=0;while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
    if(used!==size||fstatSync(fd).size!==size)throw new Error('bounded-read-changed');return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}

function command(binary:'ffprobe'|'ffmpeg',args:string[],limit:number):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks:Buffer[]=[];let used=0;let settled=false;
    const timer=setTimeout(()=>{child.kill();finish(new Error('media-tool-timeout'));},20_000);
    function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(Buffer.concat(chunks));}
    child.stdout.on('data',(chunk:Buffer)=>{used+=chunk.length;if(used>limit){child.kill();finish(new Error('media-tool-output-limit'));}else chunks.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{used+=chunk.length;if(used>limit){child.kill();finish(new Error('media-tool-output-limit'));}});
    child.once('error',()=>finish(new Error('media-tool-unavailable')));
    child.once('close',code=>finish(code===0?undefined:new Error('media-tool-failed')));
  });
}

async function measuredVideo(file:string,composition:NonNullable<CanonicalExecutionContract['report']['composition']>,onStage:(stage:Stage)=>void):Promise<CanonicalReceipt['measured']>{
  onStage('probe');
  const raw=await command('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames','-of','json',file],2_000_000);
  const data=JSON.parse(raw.toString('utf8')) as {format?:{duration?:string};streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;avg_frame_rate?:string;nb_read_frames?:string}>};
  const videos=data.streams?.filter(s=>s.codec_type==='video')??[];const audio=data.streams?.filter(s=>s.codec_type==='audio')??[];
  const v=videos[0];const duration=Number(data.format?.duration);const frameRate=v?.avg_frame_rate?.split('/').map(Number);
  if(videos.length!==1||audio.length!==0||v.codec_name!=='h264'||v.width!==composition.width||v.height!==composition.height||!frameRate||frameRate.length!==2||frameRate[0]/frameRate[1]!==composition.fps||Number(v.nb_read_frames)!==composition.durationFrames||!Number.isFinite(duration)||Math.abs(duration-composition.durationFrames/composition.fps)>Math.max(.12,2/composition.fps))throw new Error('canonical-video-contract-mismatch');
  onStage('decode');
  const indexes=[0,Math.floor((composition.durationFrames-1)/2),composition.durationFrames-1] as const;
  const hashes:string[]=[];
  for(const index of indexes){const frame=await command('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${index})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],composition.width*composition.height*3+4096);
    if(frame.length!==composition.width*composition.height*3)throw new Error('canonical-frame-decode-failed');hashes.push(sha(frame));}
  return {width:composition.width,height:composition.height,fps:composition.fps,frames:composition.durationFrames,durationSeconds:duration,codec:'h264',audioStreams:0,frameSha256:hashes as [string,string,string]};
}

async function run(work:string,contract:CanonicalExecutionContract,signal:AbortSignal,onStage:(stage:Stage)=>void):Promise<Pick<CanonicalReceipt,'output'|'measured'>>{
  onStage('resolve');
  const root=realpathSync(process.cwd());const actualWork=realpathSync(work);
  const publicDir=realpathSync(path.join(actualWork,'public'));
  if(!actualWork.startsWith(realpathSync(process.env.VISUALMAKER_DATA_DIR!)+path.sep)||!publicDir.startsWith(actualWork+path.sep))throw new Error('unsafe-work-path');
  const entry=realpathSync(path.join(root,'video','src','production-index.tsx'));
  if(!entry.startsWith(root+path.sep)||!contract.report.renderEligible||!contract.report.composition)throw new Error('canonical-contract-blocked');
  const version=JSON.parse(readFileSync(path.join(root,'node_modules','@remotion','renderer','package.json'),'utf8')).version as string;
  if(version!==CANONICAL_RENDERER_VERSION)throw new Error('renderer-version-mismatch');
  const browserExecutable=checkedBrowser();const {cancelSignal,cancel}=makeCancelSignal();let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
  const abort=()=>{cancel();void browser?.close({silent:true}).catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    onStage('bundle');const serveUrl=await bundle({entryPoint:entry,publicDir,rootDir:root,outDir:path.join(actualWork,'bundle'),enableCaching:false,onSymlinkDetected:()=>{throw new Error('bundle-symlink');}});
    if(signal.aborted)throw new Error('cancelled');
    onStage('open');browser=await openBrowser('chrome',{browserExecutable,chromeMode:'headless-shell',logLevel:'error'});
    onStage('select');const expected=contract.report.composition;
    const composition=await selectComposition({serveUrl,id:expected.id,puppeteerInstance:browser,browserExecutable,logLevel:'error'});
    if(composition.id!==expected.id||composition.width!==expected.width||composition.height!==expected.height||composition.fps!==expected.fps||composition.durationInFrames!==expected.durationFrames)throw new Error('canonical-composition-mismatch');
    if(signal.aborted)throw new Error('cancelled');
    const mp4=path.join(actualWork,'provisional-cut.mp4');onStage('render');
    await renderMedia({serveUrl,composition,codec:'h264',outputLocation:mp4,puppeteerInstance:browser,browserExecutable,chromeMode:'headless-shell',concurrency:1,overwrite:false,muted:true,enforceAudioTrack:false,cancelSignal,logLevel:'error'});
    if(signal.aborted)throw new Error('cancelled');
    const measured=await measuredVideo(mp4,expected,onStage);
    if(signal.aborted)throw new Error('cancelled');
    const size=statSync(mp4).size;if(size<1||size>MAX_MP4)throw new Error('canonical-output-size');
    const bytes=readBounded(mp4,MAX_MP4);if(bytes.length!==size)throw new Error('canonical-output-changed');
    onStage('publish');return {output:{name:'provisional-cut.mp4',bytes:size,sha256:sha(bytes)},measured};
  }finally{signal.removeEventListener('abort',abort);cancel();await browser?.close({silent:true}).catch(()=>{});}
}

if(process.argv[2]==='--canonical-child'){
  const [, , , work,contractSha]=process.argv;const controller=new AbortController();
  process.on('message',message=>{if(message&&typeof message==='object'&&'type' in message&&message.type==='cancel')controller.abort();});
  let stage:Stage='resolve';
  (async()=>{
    if(!work||!/^[a-f0-9]{64}$/.test(contractSha||'')||!process.env.VISUALMAKER_DATA_DIR)throw new Error('invalid-child-input');
    const actual=realpathSync(work);const data=realpathSync(process.env.VISUALMAKER_DATA_DIR);
    if(!actual.startsWith(data+path.sep)||!/[\\/]jobs[\\/]staging[\\/][a-f0-9-]{36}[\\/]work$/i.test(actual))throw new Error('unsafe-work-path');
    const contractFile=path.join(actual,'contract.json');if(!existsSync(contractFile))throw new Error('invalid-contract-file');
    const bytes=readBounded(contractFile,5_000_000);if(sha(bytes)!==contractSha)throw new Error('contract-sha-mismatch');
    const contract=JSON.parse(bytes.toString('utf8')) as CanonicalExecutionContract;
    const result=await run(actual,contract,controller.signal,next=>{stage=next;if(process.connected)process.send?.({type:'canonical-stage',stage:next});});
    if(process.connected)process.send?.({type:'canonical-result',result},()=>process.disconnect?.());
  })().catch(error=>{const message=error instanceof Error?error.message:'';const code=/browser|chrome/i.test(message)?'browser-unavailable':/bundle|rspack|module/i.test(message)?'bundle-failed':/probe|media-tool/i.test(message)?'probe-failed':/frame-decode/i.test(message)?'decode-failed':/cancel/i.test(message)?'cancelled':'stage-failed';process.exitCode=1;if(process.connected)process.send?.({type:'canonical-error',stage,code},()=>process.disconnect?.());});
}
