import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,copyFileSync,constants,fstatSync,mkdirSync,openSync,readSync,readdirSync,realpathSync,statfsSync} from 'node:fs';
import path from 'node:path';
import type {Plan} from './model.ts';
import {EPISODE_SPEC_PATH,PRODUCTION_STATE_PATH} from './adoption-review.ts';
import {buildTimelineBase} from './timeline-inspection.ts';
import {safeCanonicalFile,validationSourceFingerprints} from './canonical-cut-render.ts';
import {StoreError} from './store.ts';

export const EPISODE_PROVISIONAL_SCHEMA='visualmaker-episode-provisional-v1' as const;
export const EPISODE_COMPOSITION_ID='EP001-Episode-Provisional' as const;
export const EPISODE_OUTPUT_LIMIT=4_000_000_000;
const CONTRACTS='video/episodes/episode-001/generated/manifest-contracts.json';
const CATALOG='video/episodes/episode-001/generated/render-catalog.json';
const CATALOG_TS='video/src/generated/render-authority-catalog.ts';
const INDEX='video/src/production-index.tsx';
const MAX_JSON=25_000_000;
const MAX_FILE=2_000_000_000;
const MAX_INPUTS=16_000_000_000;
const HASH_BUFFER=1024*1024;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export type EpisodeInput={path:string;sha256:string;bytes:number;cutId:string};
export type EpisodeBlocker={code:string;detail:string};
export type EpisodeReport={schemaVersion:typeof EPISODE_PROVISIONAL_SCHEMA;episodeId:'episode-001';scope:{projectId:string;revision:number;scriptSha256:string;snapshotSha256:string};composition:{id:typeof EPISODE_COMPOSITION_ID;width:number;height:number;fps:number;durationFrames:number}|null;cuts:Array<{cutId:string;startFrame:number;durationFrames:number;mode:string}>;boundaries:Array<{boundaryId:string;outgoingCutId:string;incomingCutId:string;startFrame:number;durationFrames:number}>;inputs:EpisodeInput[];fingerprints:Record<string,string|null>;validators:Array<{name:string;passed:boolean}>;blockers:EpisodeBlocker[];renderEligible:boolean;productionAuthority:false;reviewApproved:false;audioSynchronized:false};

export function streamedFdFingerprint(fd:number,max=MAX_FILE):{sha256:string;bytes:number;identity:{size:number;mtimeMs:number;ino:number}}{
    const initial=fstatSync(fd);if(!initial.isFile()||initial.size<1||initial.size>max)throw new StoreError('영상 입력 또는 출력 크기가 허용 범위를 벗어났습니다.',409);
    const hash=createHash('sha256');const buffer=Buffer.allocUnsafe(HASH_BUFFER);let total=0;
    for(;;){const count=readSync(fd,buffer,0,buffer.length,total);if(!count)break;total+=count;if(total>max)throw new StoreError('영상 입력 또는 출력 크기가 허용 범위를 벗어났습니다.',409);hash.update(buffer.subarray(0,count));}
    const after=fstatSync(fd);if(total!==initial.size||after.size!==initial.size||after.mtimeMs!==initial.mtimeMs||after.ino!==initial.ino)throw new StoreError('영상 입력 또는 출력이 확인 중 변경됐습니다.',409);
    return {sha256:hash.digest('hex'),bytes:total,identity:{size:after.size,mtimeMs:after.mtimeMs,ino:after.ino}};
}
export function streamedFileFingerprint(file:string,max=MAX_FILE):{sha256:string;bytes:number}{
  const fd=openSync(file,'r');try{
    const {sha256,bytes}=streamedFdFingerprint(fd,max);return {sha256,bytes};
  }finally{closeSync(fd);}
}
export function omniRenderedOutputBinding(manifest:Record<string,any>,outputSha256:string):boolean{
  const output=manifest.omni?.output;
  if(manifest.schema_version!==3||!safeRelative(output)||!/^([a-f0-9]{64})$/.test(outputSha256))return false;
  const matching=(manifest.assets??[]).filter((asset:any)=>asset?.file===output&&asset?.media_type?.startsWith('video/')&&asset?.sha256===outputSha256&&typeof asset?.asset_id==='string');
  if(matching.length!==1)return false;
  const assetId=matching[0].asset_id,beats=Array.isArray(manifest.visual_beats)?manifest.visual_beats:[];
  // Match PresentationScene's template slots: a component without a rect is not rendered.
  const slots:Record<string,readonly string[]>={'experience-hero':['hero','echo-1','echo-2','echo-3','support'],'document-focus':['overview','crop','quote','provenance','support','hero'],'process-flow':['actor-left','actor-right','request','result','route-primary','route-return','quote','provenance','support'],'before-after':['comparison-left','comparison-right','quote','provenance']};
  return (manifest.visual_components??[]).some((component:any)=>component?.render_kind==='asset'&&component?.asset_id===assetId&&typeof component.component_id==='string'&&Array.isArray(component.visibility_timeline)&&component.visibility_timeline.some((visible:any)=>
    Number.isSafeInteger(visible.start_frame)&&Number.isSafeInteger(visible.end_frame)&&visible.end_frame>visible.start_frame&&visible.state!=='hidden'&&beats.some((beat:any)=>
      Number.isSafeInteger(beat.start_frame)&&Number.isSafeInteger(beat.end_frame)&&visible.start_frame<beat.end_frame&&visible.end_frame>beat.start_frame&&!beat.hidden_component_ids?.includes(component.component_id)&&
      (component.layout?Number.isFinite(component.layout.width)&&Number.isFinite(component.layout.height)&&component.layout.width>0&&component.layout.height>0:slots[beat.layout_template]?.includes(component.presentation_slot)))));
}
function smallFile(root:string,relative:string):Buffer|null{
  let file:string;try{file=safeCanonicalFile(root,relative);}catch(error){if(error instanceof StoreError)throw error;return null;}
  const fd=openSync(file,'r');try{const initial=fstatSync(fd);if(!initial.isFile()||initial.size<1||initial.size>MAX_JSON)throw new StoreError('제작 계약 파일 크기가 허용 범위를 벗어났습니다.',409);
    const bytes=Buffer.allocUnsafe(initial.size+1);let used=0;while(used<bytes.length){const count=readSync(fd,bytes,used,bytes.length-used,null);if(!count)break;used+=count;}
    const after=fstatSync(fd);if(used!==initial.size||after.size!==initial.size||after.mtimeMs!==initial.mtimeMs)throw new StoreError('제작 계약 파일이 읽는 중 변경됐습니다.',409);return bytes.subarray(0,used);
  }finally{closeSync(fd);}
}
function safeJson(bytes:Buffer):Record<string,any>{try{const value=JSON.parse(bytes.toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new StoreError('제작 계약 JSON을 읽을 수 없습니다.',409);}}
function safeRelative(value:unknown):value is string{return typeof value==='string'&&value.length>0&&!path.isAbsolute(value)&&!value.startsWith('\\')&&!value.startsWith('//')&&value.split(/[\\/]/).every(part=>part!==''&&part!=='.'&&part!=='..');}
function runtimeFiles(root:string):string[]{
  const found:string[]=[];const pending=['video/src'];
  while(pending.length){const relative=pending.pop()!,dir=safeCanonicalFile(root,relative);
    for(const entry of readdirSync(dir,{withFileTypes:true})){const child=`${relative}/${entry.name}`;
      if(entry.isSymbolicLink())throw new StoreError('렌더 runtime에 링크가 있습니다.',409);
      if(entry.isDirectory())pending.push(child);
      else if(entry.isFile()&&/\.(?:ts|tsx|js|jsx|json|css)$/.test(entry.name))found.push(child);
    }
    if(found.length+pending.length>2000)throw new StoreError('렌더 runtime 파일 수가 제한을 넘었습니다.',409);
  }
  return found.sort();
}
async function runValidator(root:string,name:string,args:string[],signal?:AbortSignal):Promise<boolean>{
  const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production'};
  for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[key])env[key]=process.env[key];
  return await new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(root,'video','scripts',name),...args],{cwd:root,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let done=false,size=0;const finish=(passed:boolean)=>{if(done)return;done=true;clearTimeout(timer);resolve(passed);};
    const timer=setTimeout(()=>{child.kill();finish(false);},60_000);
    for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>500_000){child.kill();finish(false);}});
    child.once('error',()=>finish(false));child.once('close',code=>finish(code===0&&size<=500_000&&!signal?.aborted));
  });
}
export function episodeFingerprintsStillMatch(report:EpisodeReport):boolean{
  const root=realpathSync(process.cwd());return Object.entries(report.fingerprints).every(([relative,expected])=>{
    try{const file=safeCanonicalFile(root,relative);return expected!==null&&streamedFileFingerprint(file,relative.startsWith('video/public/')||relative.startsWith('video/qa/')?MAX_FILE:MAX_JSON).sha256===expected;}catch{return expected===null;}
  });
}
export function verifyEpisodeCopiedInputs(work:string,report:EpisodeReport):void{
  const root=realpathSync(process.cwd()),publicDir=realpathSync(path.join(work,'public'));
  if(publicDir!==path.join(work,'public'))throw new StoreError('에피소드 복사본 경로가 변경됐습니다.',409);
  for(const input of report.inputs){const original=safeCanonicalFile(root,input.path);const relative=input.path.slice('video/public/'.length);const copy=path.resolve(publicDir,relative);
    if(!copy.startsWith(publicDir+path.sep)||realpathSync(copy)!==copy)throw new StoreError('에피소드 복사본 경로가 변경됐습니다.',409);
    for(const file of [original,copy]){const current=streamedFileFingerprint(file,MAX_FILE);if(current.sha256!==input.sha256||current.bytes!==input.bytes)throw new StoreError('에피소드 영상 입력이 변경됐습니다.',409);}
  }
}
export function copyEpisodeInputs(work:string,report:EpisodeReport):void{
  const root=realpathSync(process.cwd()),publicDir=path.join(work,'public');mkdirSync(publicDir);
  if(realpathSync(publicDir)!==publicDir)throw new StoreError('에피소드 임시 공개 경로가 올바르지 않습니다.',403);
  const aggregate=report.inputs.reduce((sum,input)=>sum+input.bytes,0),fs=statfsSync(work),free=fs.bavail*fs.bsize;
  if(aggregate<1||aggregate>MAX_INPUTS||free<aggregate+EPISODE_OUTPUT_LIMIT*2+500_000_000)throw new StoreError('전체 에피소드 렌더 저장 공간이 부족합니다.',507);
  const copied=new Set<string>();
  for(const input of report.inputs){if(copied.has(input.path))continue;copied.add(input.path);
    if(!input.path.startsWith('video/public/'))throw new StoreError('에피소드 입력이 public 밖을 가리킵니다.',403);
    const original=safeCanonicalFile(root,input.path);const relative=input.path.slice('video/public/'.length);if(!safeRelative(relative))throw new StoreError('에피소드 입력 경로가 올바르지 않습니다.',403);
    const target=path.resolve(publicDir,relative);if(!target.startsWith(publicDir+path.sep))throw new StoreError('에피소드 복사 대상이 잘못됐습니다.',403);
    const before=streamedFileFingerprint(original);if(before.sha256!==input.sha256||before.bytes!==input.bytes)throw new StoreError('에피소드 원본이 변경됐습니다.',409);
    mkdirSync(path.dirname(target),{recursive:true});if(realpathSync(path.dirname(target))!==path.dirname(target))throw new StoreError('에피소드 복사 대상에 링크가 있습니다.',403);
    copyFileSync(original,target,constants.COPYFILE_EXCL);
    const after=streamedFileFingerprint(target);if(after.sha256!==input.sha256||after.bytes!==input.bytes)throw new StoreError('에피소드 복사본이 원본과 다릅니다.',409);
  }
}

export async function evaluateEpisodeProvisional(plan:Plan,signal?:AbortSignal):Promise<EpisodeReport>{
  const root=realpathSync(process.cwd());const report:EpisodeReport={schemaVersion:EPISODE_PROVISIONAL_SCHEMA,episodeId:'episode-001',scope:{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:sha(JSON.stringify(plan))},composition:null,cuts:[],boundaries:[],inputs:[],fingerprints:{},validators:[],blockers:[],renderEligible:false,productionAuthority:false,reviewApproved:false,audioSynchronized:false};
  const block=(code:string,detail:string)=>report.blockers.push({code,detail});
  const authority=[EPISODE_SPEC_PATH,PRODUCTION_STATE_PATH,CONTRACTS,CATALOG,CATALOG_TS,INDEX,'visualmaker/core/episode-provisional.ts','visualmaker/core/jobs.ts','visualmaker/renderer/episode-runner.ts','visualmaker/renderer/episode-contract.ts'];
  let runtime:string[]=[];try{runtime=runtimeFiles(root);}catch{block('unsafe-runtime','렌더 runtime 파일을 안전하게 확인할 수 없습니다.');}
  for(const relative of [...new Set([...authority,...runtime])]){try{const file=safeCanonicalFile(root,relative);report.fingerprints[relative]=streamedFileFingerprint(file,MAX_JSON).sha256;}catch{report.fingerprints[relative]=null;block('missing-authority-file',`${relative} 파일을 안전하게 확인할 수 없습니다.`);}}
  try{Object.assign(report.fingerprints,validationSourceFingerprints(root));}catch{block('unsafe-validator-closure','제작 검증기 의존성을 확인할 수 없습니다.');}
  let specBytes:Buffer|null=null,stateBytes:Buffer|null=null,catalogBytes:Buffer|null=null,contractsBytes:Buffer|null=null,tsBytes:Buffer|null=null;
  try{specBytes=smallFile(root,EPISODE_SPEC_PATH);stateBytes=smallFile(root,PRODUCTION_STATE_PATH);catalogBytes=smallFile(root,CATALOG);contractsBytes=smallFile(root,CONTRACTS);tsBytes=smallFile(root,CATALOG_TS);}catch{block('unsafe-episode-files','제작 명세나 카탈로그를 안전하게 읽을 수 없습니다.');}
  if(!specBytes||!stateBytes){block('missing-episode-authority','현재 에피소드 명세 또는 제작 상태가 없습니다.');return report;}
  let spec:Record<string,any>,state:Record<string,any>;
  try{spec=safeJson(specBytes);state=safeJson(stateBytes);}catch{block('invalid-episode-authority','에피소드 명세 또는 상태 JSON이 올바르지 않습니다.');return report;}
  try{const timeline=buildTimelineBase(plan,specBytes,stateBytes);if(!timeline.originCurrent)block('stale-plan-origin','계획의 컷·대본 구조가 현재 에피소드 명세와 다릅니다.');}catch{block('stale-plan-origin','계획의 원본 컷 연결을 검증할 수 없습니다.');}
  const specCuts=Array.isArray(spec.cuts)?spec.cuts:[];
  if(spec.episode_id!=='episode-001'||state.episode_id!=='episode-001'||specCuts.length<1||specCuts.length>100){block('invalid-episode-authority','고정 에피소드와 컷 명세가 올바르지 않습니다.');return report;}
  if(!safeRelative(state.active_cut_root)||state.active_cut_root!==state.render_authority?.cut_root||!state.active_cut_root.startsWith('video/public/assets/')){block('missing-active-cut-root','현재 활성 컷 루트와 렌더 권한 결속이 없습니다.');return report;}
  if(state.expected_cut_count!==specCuts.length||state.draft_inputs?.episode_spec_sha256!==sha(specBytes))block('stale-production-state','제작 상태의 컷 수 또는 명세 해시가 현재 명세와 다릅니다.');
  try{const cutsDir=safeCanonicalFile(root,`${state.active_cut_root}/cuts`);const physical=readdirSync(cutsDir,{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name).sort();if(JSON.stringify(physical)!==JSON.stringify(specCuts.map((cut:any)=>cut.shot_id).sort()))block('cut-membership-mismatch','활성 컷 폴더 수와 명세 순서가 일치하지 않습니다.');}catch{block('missing-active-cuts','활성 컷 폴더를 안전하게 확인할 수 없습니다.');}
  if(!catalogBytes||!contractsBytes||!tsBytes){block('missing-generated-authority','생성된 카탈로그와 컷 계약이 아직 없습니다.');return report;}
  let catalog:Record<string,any>,contracts:Record<string,any>;
  try{catalog=safeJson(catalogBytes);contracts=safeJson(contractsBytes);}catch{block('invalid-generated-authority','생성 카탈로그나 계약 JSON이 올바르지 않습니다.');return report;}
  if(catalog.episode_id!=='episode-001'||catalog.authority_root!==state.active_cut_root||state.render_authority?.catalog_sha256!==sha(catalogBytes)||!Array.isArray(catalog.cuts)||!Array.isArray(contracts.cuts)||catalog.cuts.length!==specCuts.length||contracts.cuts.length!==specCuts.length||JSON.stringify(catalog.cuts.map((cut:any)=>cut.shot_id))!==JSON.stringify(specCuts.map((cut:any)=>cut.shot_id)))block('stale-generated-authority','카탈로그·명세·컷 계약의 수와 순서가 일치하지 않습니다.');
  try{const loader=Function('specifier','return import(specifier)') as (specifier:string)=>Promise<{buildAuthorityCatalog:()=>Promise<Record<string,any>>;renderCatalogTypeScript:(value:unknown)=>string}>;const helper=await loader(new URL('../../video/scripts/render-authority-lib.mjs',import.meta.url).href);const fresh=await helper.buildAuthorityCatalog();if(JSON.stringify(fresh)!==JSON.stringify(catalog)||helper.renderCatalogTypeScript(catalog)!==tsBytes.toString('utf8'))block('stale-canonical-catalog','렌더 카탈로그가 현재 컷과 runtime에서 재생성한 값과 다릅니다.');}catch{block('catalog-rebuild-failed','현재 컷에서 렌더 카탈로그를 재계산하지 못했습니다.');}
  const episodeCompositions=(catalog.compositions??[]).filter((item:any)=>item.kind==='episode');const composition=episodeCompositions.length===1?episodeCompositions[0]:null;
  if(!composition||composition.composition_id!==EPISODE_COMPOSITION_ID||composition.window_start_frame!==0||composition.duration_frames!==catalog.total_frames||!Number.isSafeInteger(catalog.total_frames)||catalog.total_frames<1||catalog.total_frames>216_000||catalog.width!==1920||catalog.height!==1080||!Number.isSafeInteger(catalog.fps)||catalog.fps<1||catalog.fps>120)block('invalid-episode-composition','전체 에피소드 composition과 FPS·길이가 올바르지 않습니다.');
  else report.composition={id:EPISODE_COMPOSITION_ID,width:catalog.width,height:catalog.height,fps:catalog.fps,durationFrames:catalog.total_frames};
  if(!Array.isArray(catalog.boundaries))block('invalid-boundaries','컷 전환 카탈로그가 올바르지 않습니다.');
  if(report.blockers.length)return report;
  let total=0;for(const [index,entry] of catalog.cuts.entries()){
    const cut=specCuts[index],id=entry.shot_id,manifest=entry.manifest;
    if(!/^SH\d{3}$/.test(id)||entry.duration_frames!==cut.duration_frames||!Number.isSafeInteger(entry.start_frame)||entry.start_frame<0||!Number.isSafeInteger(entry.duration_frames)||entry.duration_frames<1||!['remotion','source-photo','source-video','omni'].includes(manifest?.production_mode)){block('invalid-cut-window','컷 시간과 제작 모드가 현재 명세와 다릅니다.');continue;}
    report.cuts.push({cutId:id,startFrame:entry.start_frame,durationFrames:entry.duration_frames,mode:manifest.production_mode});
    for(const relative of [entry.manifest_path,entry.asset_sheet_path]){if(!safeRelative(relative)){block('unsafe-cut-authority','컷 계약 경로가 올바르지 않습니다.');continue;}try{report.fingerprints[relative]=streamedFileFingerprint(safeCanonicalFile(root,relative),MAX_JSON).sha256;}catch{block('missing-cut-authority','컷 manifest 또는 asset sheet가 없습니다.');}}
    const names=[manifest.background,...(manifest.assets??[]).map((asset:any)=>asset.file),...(manifest.effects??[]).map((effect:any)=>effect.file),...(manifest.omni?.keyframes??[]).map((keyframe:any)=>keyframe.file)];
    if(manifest.production_mode==='omni'){
      const approval=manifest.approvals?.playable_cut;const output=manifest.omni?.output;
      if(manifest.review_profile!=='omni-generated-motion'||!safeRelative(output)||!output.startsWith('omni/')||!/(?:\.mp4|\.webm|\.mov)$/i.test(output)||approval?.user_pass!==true||approval.status!=='passed'||!approval.approval_marker||!manifest.review_requirements?.review_artifact)block('omni-generated-motion-unapproved',`${id}: 생성된 Omni 동영상의 별도 playable PASS·출력 결속이 없습니다.`);
      else {try{if(!safeRelative(entry.cut_base_path)||!entry.cut_base_path.startsWith('assets/'))throw new StoreError('Omni 컷 경로가 올바르지 않습니다.',409);
        const outputPath=`video/public/${entry.cut_base_path}/${output}`;const outputSha=streamedFileFingerprint(safeCanonicalFile(root,outputPath)).sha256;
        if(!omniRenderedOutputBinding(manifest,outputSha)){block('omni-output-not-rendered',`${id}: 승인된 생성 영상이 실제 표시되는 비디오 asset에 결속되지 않았습니다.`);continue;}
        const reviewPath=manifest.review_requirements.review_artifact;if(!safeRelative(reviewPath)||!reviewPath.startsWith('video/qa/'))throw new StoreError('Omni 검수 경로가 올바르지 않습니다.',409);
        const cutRoot=safeCanonicalFile(root,`video/public/${entry.cut_base_path}`);report.fingerprints[reviewPath]=streamedFileFingerprint(safeCanonicalFile(root,reviewPath),MAX_FILE).sha256;
        const loader=Function('specifier','return import(specifier)') as (specifier:string)=>Promise<{reviewBundleSha256:(args:Record<string,unknown>)=>Promise<string>}>;const helper=await loader(new URL('../../video/scripts/visual-contract-v2.mjs',import.meta.url).href);
        const actual=await helper.reviewBundleSha256({root,cutRoot,manifest,reviewArtifact:reviewPath});if(approval.approved_bundle_sha256!==actual||!approval.approval_marker.includes(actual))block('omni-playable-hash-mismatch',`${id}: 생성 Omni playable 승인 묶음이 현재 입력과 다릅니다.`);
      }catch{block('omni-playable-hash-mismatch',`${id}: 생성 Omni playable 승인을 검증하지 못했습니다.`);}}
    }
    if(names.length<2)block('missing-local-visual',`${id}: 실제 로컬 화면 입력이 없습니다.`);
    for(const name of names){if(!safeRelative(name)||!safeRelative(entry.cut_base_path)){block('unsafe-public-input',`${id}: 미디어 입력 경로가 올바르지 않습니다.`);continue;}
      const relative=`video/public/${entry.cut_base_path}/${name}`;try{const fingerprint=streamedFileFingerprint(safeCanonicalFile(root,relative));total+=fingerprint.bytes;if(total>MAX_INPUTS)throw new StoreError('전체 입력 크기가 제한을 넘었습니다.',409);report.inputs.push({...fingerprint,path:relative,cutId:id});report.fingerprints[relative]=fingerprint.sha256;}catch{block('missing-or-unsafe-public-input',`${id}: 로컬 미디어 입력을 안전하게 확인할 수 없습니다.`);}
    }
  }
  report.inputs.sort((a,b)=>a.path.localeCompare(b.path));
  for(const boundary of catalog.boundaries){if(!/^SH\d{3}__SH\d{3}$/.test(boundary.boundary_id)||!Number.isSafeInteger(boundary.start_frame)||!Number.isSafeInteger(boundary.duration_frames)||boundary.duration_frames<1)block('invalid-boundary','컷 전환 시간이나 ID가 올바르지 않습니다.');else report.boundaries.push({boundaryId:boundary.boundary_id,outgoingCutId:boundary.outgoing_shot_id,incomingCutId:boundary.incoming_shot_id,startFrame:boundary.start_frame,durationFrames:boundary.duration_frames});}
  if(report.cuts.length===specCuts.length){for(let i=0;i<report.cuts.length;i++){const cut=report.cuts[i],prev=report.cuts[i-1];if(i===0&&cut.startFrame!==0)block('invalid-timeline-start','에피소드 시작 프레임이 0이 아닙니다.');if(prev){const bridge=report.boundaries.find(b=>b.outgoingCutId===prev.cutId&&b.incomingCutId===cut.cutId);if(cut.startFrame!==prev.startFrame+prev.durationFrames-(bridge?.durationFrames??0))block('invalid-cut-order',`${cut.cutId}: 컷 시간 또는 전환 겹침이 순서와 다릅니다.`);}}const last=report.cuts.at(-1)!;if(last.startFrame+last.durationFrames!==report.composition?.durationFrames)block('invalid-timeline-end','에피소드 끝 프레임이 composition과 다릅니다.');}
  if(report.blockers.length)return report;
  for(const [name,args] of [['validate-render-authority.mjs',['--allow-missing-review']],['validate-production-stage.mjs',['--lock','cut-review-approved']],['validate-cut-assets.mjs',['--require-cuts']],['validate-cut-visual-states.mjs',[]]] as [string,string[]][]){if(signal?.aborted){block('preflight-cancelled','사전 검증이 중단됐습니다.');return report;}const passed=await runValidator(root,name,args,signal);report.validators.push({name,passed});if(!passed)block('validator-failed',`${name} 검증을 통과하지 못했습니다.`);}
  if(!report.blockers.length&&episodeFingerprintsStillMatch(report))report.renderEligible=true;
  else if(!report.blockers.length)block('input-changed','검증 중 에피소드 입력이 변경됐습니다.');
  return report;
}
