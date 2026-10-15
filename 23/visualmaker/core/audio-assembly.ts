import {spawn} from 'node:child_process';
import {readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {currentPlanForCanonical,safeCanonicalFile} from './canonical-cut-render.ts';
import {evaluateEpisodeProvisional,episodeFingerprintsStillMatch,streamedFileFingerprint} from './episode-provisional.ts';
import type {EpisodeBlocker,EpisodeReport} from './episode-provisional.ts';
import {StoreError} from './store.ts';

export const AUDIO_ASSEMBLY_SCHEMA='visualmaker-audio-assembly-v1' as const;
export const AUDIO_SAMPLE_RATE=48_000;
const FINAL_AUDIO_DIR='video/source-intake/episode-001/narration/final';
const STATE='video/episodes/episode-001/production-state.json';
const CATALOG='video/episodes/episode-001/generated/render-catalog.json';
const AUDIO_EXT=new Set(['.wav','.mp3','.m4a','.webm']);
const SAFE_RELATIVE=/^(?![\\/])(?![A-Za-z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9_.\-/]+$/u;

export type VoiceBinding={cutId:string;path:string;sha256:string;bytes:number;durationSeconds:number;sampleRate:number;channels:number;decodedSamples:number;audibleSamples:number;firstAudibleSample:number;lastAudibleSample:number;startFrame:number;preRollFrames:number;postHoldFrames:number;voiceStartFrame:number;voiceStartSample:number;voiceSamples:number;cutEndFrame:number};
export type AudioAssemblyReport={schemaVersion:typeof AUDIO_ASSEMBLY_SCHEMA;episodeId:'episode-001';scope:EpisodeReport['scope'];composition:EpisodeReport['composition'];visual:EpisodeReport;voices:VoiceBinding[];fingerprints:Record<string,string|null>;validators:Array<{name:string;passed:boolean}>;blockers:EpisodeBlocker[];renderEligible:boolean;productionAuthority:false;reviewApproved:false;technicalAudioAligned:false};

async function processJson(binary:string,args:string[],signal?:AbortSignal):Promise<any>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    const out:Buffer[]=[];let size=0,done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else{try{resolve(JSON.parse(Buffer.concat(out).toString('utf8')));}catch{reject(new Error('invalid-media-json'));}}};
    const timer=setTimeout(()=>{child.kill();finish(new Error('media-tool-timeout'));},60_000);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(new Error('media-tool-output-limit'));}else out.push(chunk);});
    child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){child.kill();finish(new Error('media-tool-output-limit'));}});
    child.once('error',()=>finish(new Error('media-tool-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('media-tool-failed')));
  });
}
export async function probeDecodedVoice(file:string,signal?:AbortSignal):Promise<{decodedSamples:number;audibleSamples:number;firstAudibleSample:number;lastAudibleSample:number}>{
  const before=statSync(file);if(!before.isFile()||before.size<1||before.size>2_000_000_000)throw new StoreError('최종 녹음 파일 크기가 올바르지 않습니다.',409);
  return await new Promise((resolve,reject)=>{
    const child=spawn('ffmpeg',['-v','error','-i',file,'-vn','-ac','2','-ar',String(AUDIO_SAMPLE_RATE),'-f','f32le','pipe:1'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let decodedSamples=0,audibleSamples=0,firstAudibleSample=-1,lastAudibleSample=-1,carry:Buffer<ArrayBufferLike>=Buffer.alloc(0),used=0,stderrBytes=0,done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else{
      const after=statSync(file);
      if(carry.length||decodedSamples<1||firstAudibleSample<0||audibleSamples<Math.min(4800,Math.ceil(decodedSamples*0.05))||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)reject(new Error('decoded-voice-invalid-or-changed'));
      else resolve({decodedSamples,audibleSamples,firstAudibleSample,lastAudibleSample});
    }};
    const timer=setTimeout(()=>{child.kill();finish(new Error('audio-decode-timeout'));},120_000);
    child.stdout.on('data',(chunk:Buffer)=>{
      used+=chunk.length;if(used>2_000_000_000){child.kill();finish(new Error('audio-decode-output-limit'));return;}
      const bytes=carry.length?Buffer.concat([carry,chunk]):chunk,aligned=bytes.length-bytes.length%8;
      for(let offset=0;offset<aligned;offset+=8){const left=bytes.readFloatLE(offset),right=bytes.readFloatLE(offset+4);
        if(!Number.isFinite(left)||!Number.isFinite(right)){child.kill();finish(new Error('audio-decode-invalid-sample'));return;}
        if(Math.abs(left)>0.0001||Math.abs(right)>0.0001){if(firstAudibleSample<0)firstAudibleSample=decodedSamples;lastAudibleSample=decodedSamples;audibleSamples++;}
        decodedSamples++;
      }
      carry=bytes.subarray(aligned);
    });
    child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>100_000){child.kill();finish(new Error('audio-decode-log-limit'));}});
    child.once('error',()=>finish(new Error('audio-decode-unavailable')));child.once('close',code=>finish(code===0?undefined:new Error('audio-decode-failed')));
  });
}
async function stageValidation(root:string,signal?:AbortSignal):Promise<{passed:boolean;failures:string[]}>{
  return await new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(root,'video/scripts/validate-production-stage.mjs'),'--lock','audio-timed-assembly'],{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let bytes=0,done=false,stdout='';const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);let failures:string[]=[];
      try{const parsed=JSON.parse(stdout) as {failures?:unknown};if(Array.isArray(parsed.failures))failures=parsed.failures.filter((value):value is string=>typeof value==='string').slice(0,30);}catch{}
      resolve({passed:ok,failures});};
    const timer=setTimeout(()=>{child.kill();finish(false);},120_000);
    child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1_000_000){child.kill();finish(false);}else stdout+=chunk.toString('utf8');});
    child.stderr.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1_000_000){child.kill();finish(false);}});
    child.once('error',()=>finish(false));child.once('close',code=>finish(code===0&&bytes<=1_000_000&&!signal?.aborted));
  });
}
function jsonFile(root:string,relative:string):Record<string,any>{
  const file=safeCanonicalFile(root,relative),bytes=readFileSync(file);
  if(bytes.length<1||bytes.length>25_000_000)throw new StoreError('오디오 제작 계약 크기가 올바르지 않습니다.',409);
  const parsed=JSON.parse(bytes.toString('utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid-json');
  return parsed;
}
export function narrationPlanPathFromState(root:string,state:Record<string,any>):string{
  const value=state.draft_inputs?.narration_plan;
  if(typeof value!=='string'||!SAFE_RELATIVE.test(value)||value.split(/[\\/]/).some(part=>part==='.'||part==='..'||!part))throw new StoreError('제작 상태에 최종 녹음 계획 경로가 없습니다.',409);
  safeCanonicalFile(root,value);
  return value.replaceAll('\\','/');
}
function exactAudioFile(root:string,manifestPath:string,value:unknown,expected:string):boolean{
  if(typeof value!=='string'||!SAFE_RELATIVE.test(value)||value.split(/[\\/]/).some(part=>part==='.'||part==='..'||!part))return false;
  const bases=[root,path.dirname(safeCanonicalFile(root,manifestPath))];
  return bases.some(base=>{try{const candidate=realpathSync(path.resolve(base,value));return candidate===expected&&candidate.startsWith(root+path.sep);}catch{return false;}});
}
export function bindUniqueFinalVoiceFile(root:string,audioDir:string,cutId:string,manifestPath:string,manifestAudio:unknown,names:string[]):{path:string;file:string}{
  if(!/^SH\d{3}$/u.test(cutId)||!SAFE_RELATIVE.test(audioDir)||!SAFE_RELATIVE.test(manifestPath))throw new StoreError('최종 녹음 컷이나 경로가 올바르지 않습니다.',409);
  const matches=names.filter(name=>name.toUpperCase().startsWith(`${cutId}.`)&&AUDIO_EXT.has(path.extname(name).toLowerCase()));
  if(matches.length!==1)throw new StoreError(`${cutId}: 최종 녹음 파일은 정확히 하나여야 합니다.`,409);
  const relative=`${audioDir}/${matches[0]}`,file=safeCanonicalFile(root,relative);
  if(!exactAudioFile(root,manifestPath,manifestAudio,file))throw new StoreError(`${cutId}: manifest 녹음과 최종 파일이 다릅니다.`,409);
  return {path:relative,file};
}
export function placeVoices(cuts:EpisodeReport['cuts'],planCuts:Array<{shot_id:string;pre_roll_frames:number;post_hold_frames:number}>,measurements:Array<{cutId:string;path:string;sha256:string;bytes:number;durationSeconds:number;sampleRate:number;channels:number;decodedSamples:number;audibleSamples:number;firstAudibleSample:number;lastAudibleSample:number}>,fps:number):VoiceBinding[]{
  if(!Number.isSafeInteger(fps)||fps<1||AUDIO_SAMPLE_RATE%fps!==0||cuts.length!==planCuts.length||cuts.length!==measurements.length)throw new StoreError('오디오 조립 컷 수와 FPS가 올바르지 않습니다.',409);
  const samplesPerFrame=AUDIO_SAMPLE_RATE/fps,result:VoiceBinding[]=[];
  for(let i=0;i<cuts.length;i++){
    const cut=cuts[i],plan=planCuts[i],m=measurements[i];
    if(cut.cutId!==plan.shot_id||cut.cutId!==m.cutId||!Number.isSafeInteger(plan.pre_roll_frames)||plan.pre_roll_frames<0||!Number.isSafeInteger(plan.post_hold_frames)||plan.post_hold_frames<0||!Number.isFinite(m.durationSeconds)||m.durationSeconds<=0||!Number.isSafeInteger(m.decodedSamples)||m.decodedSamples<1||!Number.isSafeInteger(m.audibleSamples)||m.audibleSamples<Math.min(4800,Math.ceil(m.decodedSamples*0.05))||!Number.isSafeInteger(m.firstAudibleSample)||m.firstAudibleSample<0||!Number.isSafeInteger(m.lastAudibleSample)||m.lastAudibleSample<m.firstAudibleSample||m.lastAudibleSample>=m.decodedSamples)throw new StoreError('오디오 조립 컷의 시간 또는 녹음 결속이 올바르지 않습니다.',409);
    const voiceSamples=m.decodedSamples,voiceFrames=Math.ceil(voiceSamples/samplesPerFrame),voiceStartFrame=cut.startFrame+plan.pre_roll_frames,voiceStartSample=voiceStartFrame*samplesPerFrame,cutEndFrame=cut.startFrame+cut.durationFrames;
    if(Math.ceil(m.durationSeconds*fps)!==voiceFrames)throw new StoreError(`${cut.cutId}: 컨테이너 길이와 실제 디코딩한 음성 길이가 다릅니다.`,409);
    if(plan.pre_roll_frames+voiceFrames+plan.post_hold_frames!==cut.durationFrames||voiceStartSample+voiceSamples>(cutEndFrame-plan.post_hold_frames)*samplesPerFrame)throw new StoreError(`${cut.cutId}: 측정 녹음과 확정 컷 시간이 맞지 않습니다.`,409);
    const previous=result.at(-1);
    if(previous&&previous.voiceStartSample+previous.voiceSamples>voiceStartSample)throw new StoreError(`${previous.cutId}/${cut.cutId}: 승인된 발화 중첩 정책이 없습니다.`,409);
    result.push({...m,startFrame:cut.startFrame,preRollFrames:plan.pre_roll_frames,postHoldFrames:plan.post_hold_frames,voiceStartFrame,voiceStartSample,voiceSamples,cutEndFrame});
  }
  return result;
}
export function audioAssemblyFingerprintsStillMatch(report:AudioAssemblyReport):boolean{
  const root=realpathSync(process.cwd());
  return episodeFingerprintsStillMatch(report.visual)&&Object.entries(report.fingerprints).every(([relative,digest])=>{
    try{return digest!==null&&streamedFileFingerprint(safeCanonicalFile(root,relative),2_000_000_000).sha256===digest;}catch{return digest===null;}
  });
}
export async function evaluateAudioAssembly(projectId:string,baseRevision:number,signal?:AbortSignal):Promise<AudioAssemblyReport>{
  const root=realpathSync(process.cwd()),plan=currentPlanForCanonical(projectId,baseRevision),visual=await evaluateEpisodeProvisional(plan,signal);
  const report:AudioAssemblyReport={schemaVersion:AUDIO_ASSEMBLY_SCHEMA,episodeId:'episode-001',scope:visual.scope,composition:visual.composition,visual,voices:[],fingerprints:{},validators:[],blockers:[...visual.blockers],renderEligible:false,productionAuthority:false,reviewApproved:false,technicalAudioAligned:false};
  const block=(code:string,detail:string)=>report.blockers.push({code,detail});
  for(const relative of ['visualmaker/core/audio-assembly.ts','visualmaker/renderer/audio-assembly-runner.ts','visualmaker/renderer/audio-assembly-contract.ts','video/scripts/validate-narration-plan.mjs','video/scripts/validate-production-stage.mjs']){
    try{report.fingerprints[relative]=streamedFileFingerprint(safeCanonicalFile(root,relative),25_000_000).sha256;}
    catch{report.fingerprints[relative]=null;block('missing-audio-runtime',`${relative} 오디오 조립 실행 또는 검증 파일이 없습니다.`);}
  }
  try{
    report.fingerprints[STATE]=streamedFileFingerprint(safeCanonicalFile(root,STATE),25_000_000).sha256;
    const spec=jsonFile(root,'video/episodes/episode-001/episode-spec.json');
    const script=spec.editorial_revision?.approved_script_source??spec.editorial_revision?.source_path??spec.script_lock?.source_path;
    if(typeof script!=='string'||!SAFE_RELATIVE.test(script)||script.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('script-path');
    const digest=streamedFileFingerprint(safeCanonicalFile(root,script),5_000_000).sha256;
    if(digest!==spec.script_lock?.source_sha256)throw new Error('script-hash');
    report.fingerprints[script]=digest;
  }catch{block('final-script-binding','최종 대본 출처의 바이트와 episode-spec 결속을 확인할 수 없습니다.');}
  if(!visual.renderEligible||!visual.composition)return report;
  const stage=await stageValidation(root,signal);report.validators.push({name:'validate-production-stage.mjs --lock audio-timed-assembly',passed:stage.passed});
  if(!stage.passed){for(const failure of stage.failures)block('audio-stage-blocked',failure);if(!stage.failures.length)block('audio-stage-blocked','최종 녹음과 엄격한 컷 QC를 포함한 오디오 조립 제작 게이트를 통과하지 못했습니다.');return report;}
  let narration:Record<string,any>,catalog:Record<string,any>,files:string[],planPath:string;
  try{
    planPath=narrationPlanPathFromState(root,jsonFile(root,STATE));
    narration=jsonFile(root,planPath);catalog=jsonFile(root,CATALOG);
    files=readdirSync(safeCanonicalFile(root,FINAL_AUDIO_DIR));
    for(const relative of [planPath,CATALOG])report.fingerprints[relative]=streamedFileFingerprint(safeCanonicalFile(root,relative),25_000_000).sha256;
  }catch{block('audio-contract-missing','최종 녹음 계획 또는 제작 카탈로그를 읽을 수 없습니다.');return report;}
  if(!Array.isArray(narration.cuts)||!Array.isArray(catalog.cuts)||narration.cuts.length!==visual.cuts.length||catalog.cuts.length!==visual.cuts.length||narration.fps!==visual.composition.fps){block('audio-cut-membership','최종 녹음 계획과 확정 카탈로그의 컷 수 또는 FPS가 다릅니다.');return report;}
  const measurements:Parameters<typeof placeVoices>[2]=[];
  for(let i=0;i<visual.cuts.length;i++){
    const cut=visual.cuts[i],entry=catalog.cuts[i],planCut=narration.cuts[i];
    if(entry?.shot_id!==cut.cutId||planCut?.shot_id!==cut.cutId||typeof entry.manifest_path!=='string'){block('audio-cut-order',`${cut.cutId}: 카탈로그와 녹음 컷 순서가 다릅니다.`);continue;}
    try{
      const manifest=jsonFile(root,entry.manifest_path);
      if(manifest.voiceover?.status!=='final-measured')throw new Error('manifest-voice-status');
      const {path:relative,file}=bindUniqueFinalVoiceFile(root,FINAL_AUDIO_DIR,cut.cutId,entry.manifest_path,manifest.voiceover?.audio,files);
      const probed=await processJson('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate,channels','-of','json',file],signal);
      const streams=probed.streams?.filter((stream:any)=>stream.codec_type==='audio')??[];
      const durationSeconds=Number(probed.format?.duration),sampleRate=Number(streams[0]?.sample_rate),channels=Number(streams[0]?.channels);
      if(streams.length!==1||!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isSafeInteger(channels)||channels<1||channels>2)throw new Error('audio-probe-mismatch');
      const fingerprint=streamedFileFingerprint(file,2_000_000_000);report.fingerprints[relative]=fingerprint.sha256;
      const decoded=await probeDecodedVoice(file,signal);
      const after=streamedFileFingerprint(file,2_000_000_000);if(after.sha256!==fingerprint.sha256||after.bytes!==fingerprint.bytes)throw new Error('audio-changed-during-decode');
      measurements.push({cutId:cut.cutId,path:relative,...fingerprint,durationSeconds,sampleRate,channels,...decoded});
    }catch(error){block(error instanceof StoreError&&error.message.includes('정확히 하나')?'final-voice-ambiguous':'final-voice-mismatch',`${cut.cutId}: manifest 녹음과 유일한 측정 파일이 일치하지 않거나 디코딩할 수 없습니다.`);}
  }
  if(report.blockers.length)return report;
  try{report.voices=placeVoices(visual.cuts,narration.cuts,measurements,visual.composition.fps);}catch(error){block('audio-placement',error instanceof Error?error.message:'녹음 배치를 확인할 수 없습니다.');}
  if(!report.blockers.length&&audioAssemblyFingerprintsStillMatch(report))report.renderEligible=true;
  else if(!report.blockers.length)block('input-changed','오디오 조립 입력이 확인 중 변경됐습니다.');
  return report;
}
