import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {makeCancelSignal,openBrowser,renderMedia,selectComposition} from '@remotion/renderer';
import {DIAGNOSTIC_FILES,DIAGNOSTIC_ID,DIAGNOSTIC_RECIPE} from './contract.ts';
import type {DiagnosticReceipt} from './contract.ts';

const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const here=path.dirname(fileURLToPath(import.meta.url));
const entry=path.join(here,'diagnostic.tsx');
const runner=fileURLToPath(import.meta.url);
const BROWSER_RELATIVE='node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';

export function checkedBrowser():string{
  const root=realpathSync(process.cwd());
  // This checkout may use a junction to a shared local node_modules install.
  let modules:string;let cache:string;
  try{modules=realpathSync(path.join(root,'node_modules'));cache=realpathSync(path.join(modules,'.remotion'));}
  catch{throw new Error('캐시된 Remotion browser 설치 폴더가 없습니다. 기존 로컬 설치 상태를 확인하세요.');}
  if(!cache.startsWith(modules+path.sep))throw new Error('Remotion browser cache 경로가 설치 폴더를 벗어났습니다.');
  const browser=path.join(cache,BROWSER_RELATIVE.slice('node_modules/.remotion/'.length));
  if(!existsSync(browser))throw new Error('캐시된 Remotion headless browser가 없습니다. 기존 브라우저 설치 상태를 확인하세요.');
  const actual=realpathSync(browser);
  if(!actual.startsWith(cache+path.sep))throw new Error('Remotion browser 경로가 캐시를 벗어났습니다.');
  return actual;
}

async function command(binary:'ffprobe'|'ffmpeg',args:string[],timeoutMs=20_000):Promise<Buffer>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks:Buffer[]=[];let size=0;let done=false;
    const timer=setTimeout(()=>{child.kill();finish(new Error(`${binary} 실행 시간이 초과됐습니다.`));},timeoutMs);
    function finish(error?:Error){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(Buffer.concat(chunks));}
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){child.kill();finish(new Error(`${binary} 출력 제한을 넘었습니다.`));}else chunks.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){child.kill();finish(new Error(`${binary} 출력 제한을 넘었습니다.`));}});
    child.once('error',()=>finish(new Error(`${binary}를 실행할 수 없습니다. 기존 FFmpeg 설치와 PATH를 확인하세요.`)));
    child.once('close',code=>finish(code===0?undefined:new Error(`${binary} 검증이 실패했습니다.`)));
  });
}

type DiagnosticStage='resolve'|'bundle'|'open'|'select'|'render'|'probe'|'decode'|'publish';
async function verifyVideo(file:string,onStage:(stage:DiagnosticStage)=>void){
  onStage('probe');
  const probe=JSON.parse((await command('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames','-of','json',file])).toString('utf8')) as {format?:{duration?:string};streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;avg_frame_rate?:string;nb_read_frames?:string}>};
  const video=probe.streams?.filter(s=>s.codec_type==='video')??[];
  const audio=probe.streams?.filter(s=>s.codec_type==='audio')??[];
  const duration=Number(probe.format?.duration);
  if(video.length!==1||audio.length!==0||video[0].codec_name!=='h264'||video[0].width!==640||video[0].height!==360||video[0].avg_frame_rate!=='30/1'||Number(video[0].nb_read_frames)!==60||!Number.isFinite(duration)||duration<1.9||duration>2.1)throw new Error('진단 MP4의 실제 코덱·크기·프레임·길이가 고정 계약과 다릅니다.');
  onStage('decode');
  const first=await command('ffmpeg',['-v','error','-i',file,'-vf','select=eq(n\\,0)','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  const last=await command('ffmpeg',['-v','error','-i',file,'-vf','select=eq(n\\,59)','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  if(first.length!==640*360*3||last.length!==first.length||hash(first)===hash(last))throw new Error('진단 MP4의 시작·마지막 프레임 변화가 확인되지 않았습니다.');
  return {width:640,height:360,fps:30,frames:60,durationSeconds:duration,codec:'h264' as const,audioStreams:0 as const,firstFrameSha256:hash(first),lastFrameSha256:hash(last),framesDiffer:true as const};
}

export async function runDiagnostic(input:{staging:string;jobId:string;projectId:string;requestedRevision:number;snapshotSha256:string;check:(progress:number)=>void;abortSignal?:AbortSignal;onStage?:(stage:DiagnosticStage)=>void}):Promise<DiagnosticReceipt>{
  input.onStage?.('resolve');
  const root=realpathSync(input.staging);
  const emptyPublic=path.join(root,'empty-public');mkdirSync(emptyPublic);
  if(realpathSync(emptyPublic)!==emptyPublic)throw new Error('진단 public 폴더가 안전하지 않습니다.');
  const browserExecutable=checkedBrowser();
  const contract=path.join(here,'contract.ts');
  const entryBefore=hash(readFileSync(entry));const runnerBefore=hash(readFileSync(runner));const contractBefore=hash(readFileSync(contract));
  const version=JSON.parse(readFileSync(path.join(process.cwd(),'node_modules','@remotion','renderer','package.json'),'utf8')).version as string;
  if(version!=='4.0.516')throw new Error('Remotion renderer 버전이 진단 계약과 다릅니다.');
  const deadline=Date.now()+120_000;
  const {cancelSignal,cancel}=makeCancelSignal();
  let stopped=false;
  let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
  const abort=()=>{stopped=true;cancel();void browser?.close({silent:true}).catch(()=>{});};
  input.abortSignal?.addEventListener('abort',abort,{once:true});
  const check=()=>{
    if(stopped)return;
    if(Date.now()>deadline){stopped=true;cancel();return;}
    try{input.check(45);}catch{stopped=true;cancel();}
  };
  const poll=setInterval(check,1000);
  try{
    input.check(15);
    input.onStage?.('bundle');
    const serveUrl=await bundle({entryPoint:entry,publicDir:emptyPublic,rootDir:process.cwd(),outDir:path.join(root,'bundle'),enableCaching:false,onProgress:()=>{},onSymlinkDetected:()=>{throw new Error('번들에 symlink를 사용할 수 없습니다.');}});
    check();if(stopped)throw new Error('진단 실행이 취소되거나 제한 시간을 넘었습니다.');
    input.onStage?.('open');
    browser=await openBrowser('chrome',{browserExecutable,chromeMode:'headless-shell',logLevel:'error'});
    input.onStage?.('select');
    const composition=await selectComposition({serveUrl,id:DIAGNOSTIC_ID,puppeteerInstance:browser,browserExecutable,logLevel:'error'});
    if(composition.width!==640||composition.height!==360||composition.fps!==30||composition.durationInFrames!==60)throw new Error('진단 composition이 고정 계약과 다릅니다.');
    check();if(stopped)throw new Error('진단 실행이 취소되거나 제한 시간을 넘었습니다.');
    const mp4=path.join(root,DIAGNOSTIC_FILES[0]);
    input.onStage?.('render');
    await renderMedia({serveUrl,composition,codec:'h264',outputLocation:mp4,puppeteerInstance:browser,browserExecutable,chromeMode:'headless-shell',concurrency:1,overwrite:false,muted:true,enforceAudioTrack:false,cancelSignal,logLevel:'error',onProgress:()=>check()});
    check();if(stopped)throw new Error('진단 실행이 취소되거나 제한 시간을 넘었습니다.');
    const measured=await verifyVideo(mp4,stage=>input.onStage?.(stage));
    input.onStage?.('publish');
    if(hash(readFileSync(entry))!==entryBefore||hash(readFileSync(runner))!==runnerBefore||hash(readFileSync(contract))!==contractBefore)throw new Error('진단 실행 중 runtime 코드가 변경됐습니다.');
    input.check(90);
    const output=readFileSync(mp4);if(output.length>40_000_000||statSync(mp4).size!==output.length)throw new Error('진단 MP4 크기가 허용 범위를 넘었습니다.');
    return {schemaVersion:'visualmaker-renderer-diagnostic-v1',artifactKind:'renderer-diagnostic',purpose:'engine-execution-check',reviewProfile:'remotion-motion',reviewScope:'engine-diagnostic-only',productionAuthority:false,cutPreview:false,eligibleForCutReview:false,grammarApproved:false,playableParity:false,sourceAssetIds:[],episodeIds:[],jobId:input.jobId,projectId:input.projectId,requestedRevision:input.requestedRevision,snapshotSha256:input.snapshotSha256,compositionId:DIAGNOSTIC_ID,recipe:DIAGNOSTIC_RECIPE,rendererVersion:version,entrySha256:entryBefore,runnerSha256:runnerBefore,contractSha256:contractBefore,output:{name:'diagnostic.mp4',bytes:output.length,sha256:hash(output)},measured};
  }catch(error){
    if(stopped)throw new Error('진단 실행이 취소되거나 제한 시간을 넘었습니다.');
    throw error;
  }finally{clearInterval(poll);input.abortSignal?.removeEventListener('abort',abort);cancel();await browser?.close({silent:true}).catch(()=>{});}
}

if(process.argv[2]==='--diagnostic-child'){
  const [, , , staging, jobId, projectId, revision, snapshotSha256]=process.argv;
  const dataRoot=process.env.VISUALMAKER_DATA_DIR;
  const actualRoot=dataRoot?realpathSync(dataRoot):'';
  const actualStaging=staging?realpathSync(staging):'';
  if(!actualRoot||!actualStaging.startsWith(actualRoot+path.sep)||!/\/jobs\/staging\/[a-f0-9-]{36}\/work$/i.test(actualStaging.replaceAll('\\','/'))||!/^job_[a-f0-9-]{36}$/.test(jobId||'')||!/^plan-[a-f0-9-]{36}$/.test(projectId||'')||!Number.isSafeInteger(Number(revision))||!/^[a-f0-9]{64}$/.test(snapshotSha256||''))throw new Error('진단 자식 프로세스 입력이 올바르지 않습니다.');
  const abortController=new AbortController();
  process.on('message',message=>{if(message&&typeof message==='object'&&'type' in message&&message.type==='cancel')abortController.abort();});
  let stage:DiagnosticStage='resolve';
  runDiagnostic({staging:actualStaging,jobId,projectId,requestedRevision:Number(revision),snapshotSha256,check:()=>{},abortSignal:abortController.signal,onStage:next=>{stage=next;if(process.send&&process.connected)process.send({type:'diagnostic-stage',stage:next});}}).then(receipt=>{
    if(process.send&&process.connected)process.send({type:'diagnostic-result',receipt},()=>process.disconnect?.());
  }).catch(error=>{
    const message=error instanceof Error?error.message:'';
    const code=/browser|chrome|chromium/i.test(message)?'browser-unavailable':/ffprobe/i.test(message)?'probe-failed':/ffmpeg/i.test(message)?'decode-failed':/cancel|lease|제한 시간|취소/i.test(message)?'cancelled-or-timeout':/module|bundle|webpack|rspack/i.test(message)?'bundle-failed':'stage-failed';
    process.exitCode=1;
    if(process.send&&process.connected)process.send({type:'diagnostic-error',stage,code},()=>process.disconnect?.());
    else if(process.connected)process.disconnect?.();
  });
}
