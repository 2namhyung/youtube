import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,fstatSync,lstatSync,openSync,readSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import type {Plan} from './model.ts';
import {EPISODE_SPEC_PATH} from './adoption-review.ts';
import {openDb,StoreError} from './store.ts';
import {validatePlan} from './director.ts';
import {importEpisode} from './episode.ts';

export const CANONICAL_SCHEMA='visualmaker-canonical-cut-render-v1' as const;
export const CANONICAL_EPISODE='episode-001' as const;
const STATE='video/episodes/episode-001/production-state.json';
const CONTRACTS='video/episodes/episode-001/generated/manifest-contracts.json';
const CATALOG='video/episodes/episode-001/generated/render-catalog.json';
const CATALOG_TS='video/src/generated/render-authority-catalog.ts';
const INDEX='video/src/production-index.tsx';
const ADAPTER=['visualmaker/core/canonical-cut-render.ts','visualmaker/core/jobs.ts','visualmaker/renderer/canonical-runner.ts','visualmaker/renderer/canonical-contract.ts','visualmaker/renderer/runner.ts'];
const VALIDATION_SOURCE=['video/scripts/render-authority-lib.mjs','video/scripts/validate-render-authority.mjs','video/scripts/validate-production-stage.mjs','video/scripts/validate-cut-assets.mjs','video/scripts/validate-cut-visual-states.mjs'];
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const safeRelative=(value:string)=>!path.isAbsolute(value)&&!value.startsWith('\\')&&!value.startsWith('//')&&value.split(/[\\/]/).every(part=>part!==''&&part!=='.'&&part!=='..');
const json=(bytes:Buffer)=>JSON.parse(bytes.toString('utf8')) as Record<string,any>;
const MAX_JSON=25_000_000;
const MAX_INPUT=250_000_000;
const MAX_AGGREGATE=1_000_000_000;
export type CanonicalBlocker={code:string;detail:string};
export type CanonicalInput={path:string;sha256:string;bytes:number;cutId:string;boundaryIds:string[]};
export type CanonicalReport={schemaVersion:typeof CANONICAL_SCHEMA;scope:{projectId:string;revision:number;sceneId:string;cutId:string|null};episodeId:typeof CANONICAL_EPISODE;snapshotSha256:string;scriptSha256:string;fingerprints:Record<string,string|null>;blockers:CanonicalBlocker[];validators:Array<{name:string;passed:boolean}>;composition:{id:string;width:number;height:number;fps:number;durationFrames:number;mode:string}|null;dependencyCutIds:string[];boundaryIds:string[];inputs:CanonicalInput[];renderEligible:boolean;productionAuthority:false;cutPass:false;stylePass:false;playableParity:false};

export function safeCanonicalFile(root:string,relative:string):string{
  if(!safeRelative(relative))throw new StoreError('허용되지 않은 제작 입력 경로입니다.',409);
  const target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep))throw new StoreError('제작 입력 경로가 저장소를 벗어났습니다.',409);
  let segment=root;
  for(const part of path.relative(root,target).split(path.sep)){
    segment=path.join(segment,part);
    if(lstatSync(segment).isSymbolicLink()||realpathSync(segment).toLowerCase()!==segment.toLowerCase())throw new StoreError('제작 입력에 링크 또는 재분석 경로가 있습니다.',409);
  }
  const actual=realpathSync(target);
  if(!actual.startsWith(root+path.sep)||actual.toLowerCase()!==target.toLowerCase())throw new StoreError('제작 입력이 다른 위치를 가리킵니다.',409);
  return actual;
}

function readBounded(root:string,relative:string,max=MAX_JSON):Buffer|null{
  try{
    const target=safeCanonicalFile(root,relative);const fd=openSync(target,'r');
    try{const size=fstatSync(fd).size;
      if(size<1||size>max)throw new StoreError('제작 입력 크기가 허용 범위를 벗어났습니다.',409);
      const bytes=Buffer.allocUnsafe(size+1);let used=0;
      while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
      if(used!==size||fstatSync(fd).size!==size)throw new StoreError('제작 입력이 읽는 중 변경됐습니다.',409);
      return bytes.subarray(0,used);
    }finally{closeSync(fd);}
  }catch(error){if(error instanceof StoreError)throw error;return null;}
}

function fingerprint(root:string,relative:string,max=MAX_JSON):string|null{return (bytes=>bytes?sha(bytes):null)(readBounded(root,relative,max));}

export function validationSourceFingerprints(root:string,seeds:readonly string[]=VALIDATION_SOURCE):Record<string,string>{
  const found:Record<string,string>={};const pending=[...seeds];let aggregate=0;
  while(pending.length){
    if(Object.keys(found).length>200)throw new StoreError('검증기 로컬 의존성 수가 제한을 넘었습니다.',409);
    const relative=pending.pop()!;if(Object.hasOwn(found,relative))continue;
    if(!relative.startsWith('video/')||!/\.(?:mjs|js|ts|tsx|json)$/.test(relative))throw new StoreError('검증기 로컬 의존성 경로가 올바르지 않습니다.',409);
    const bytes=readBounded(root,relative,5_000_000);if(!bytes)throw new StoreError('검증기 로컬 의존성 파일이 없습니다.',409);
    aggregate+=bytes.length;if(aggregate>40_000_000)throw new StoreError('검증기 로컬 의존성 크기가 제한을 넘었습니다.',409);
    found[relative]=sha(bytes);
    if(relative.endsWith('.json'))continue;
    const source=bytes.toString('utf8');const imports:string[]=[];
    for(const pattern of [/^\s*(?:import|export)\s+(?:[^\r\n]*?\s+from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm,/\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g]){
      for(const match of source.matchAll(pattern))imports.push(match[1]);
    }
    for(const specifier of imports){const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier));
      if(!path.posix.extname(resolved))continue; // Generated TS source literals are not executable Node imports.
      if(!resolved.startsWith('video/'))throw new StoreError('검증기 로컬 import가 허용 범위를 벗어났습니다.',409);
      pending.push(resolved);
    }
  }
  return found;
}

function validator(name:string,args:string[],root:string,signal?:AbortSignal):Promise<boolean>{
  const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production'};
  for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[key])env[key]=process.env[key];
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(root,'video','scripts',name),...args],{cwd:root,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let done=false;let size=0;const finish=(passed:boolean)=>{if(done)return;done=true;clearTimeout(timer);resolve(passed);};
    const timer=setTimeout(()=>{child.kill();finish(false);},30_000);
    for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>300_000){child.kill();finish(false);}});
    child.once('error',()=>finish(false));child.once('close',code=>finish(code===0&&size<=300_000&&!signal?.aborted));
  });
}

export function currentPlanForCanonical(projectId:string,baseRevision:number):Plan{
  if(!/^plan-[a-f0-9-]{36}$/.test(projectId))throw new StoreError('프로젝트 ID가 올바르지 않습니다.');
  if(!Number.isSafeInteger(baseRevision)||baseRevision<1)throw new StoreError('리비전이 올바르지 않습니다.');
  // Kept separate from getProject: missing planning assets must be reported by the canonical gate, not throw first.
  const db=openDb();
  try{
    const row=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!row)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(row.revision!==baseRevision)throw new StoreError('대본과 장면이 변경됐습니다. 최신 리비전을 불러오세요.',409);
    return validatePlan(JSON.parse(row.document));
  }finally{db.close();}
}

export function resolveCanonicalWindow(catalog:Record<string,any>,cutId:string):{composition:NonNullable<CanonicalReport['composition']>;boundaryIds:string[];dependencies:Array<{cutId:string;boundaryIds:string[]}>}|null{
  if(!Array.isArray(catalog.cuts)||!Array.isArray(catalog.compositions)||!Array.isArray(catalog.boundaries))return null;
  const matches=catalog.compositions.filter((entry:any)=>entry.kind==='cut'&&entry.shot_id===cutId);if(matches.length!==1)return null;
  const selected=catalog.cuts.find((cut:any)=>cut.shot_id===cutId);const item=matches[0];
  if(!selected||item.composition_id!==`EP001-Cut-${cutId}-Provisional`||!Number.isSafeInteger(item.duration_frames)||item.duration_frames<1||!Number.isSafeInteger(item.window_start_frame)||item.window_start_frame<0||!Number.isSafeInteger(catalog.width)||catalog.width<1||!Number.isSafeInteger(catalog.height)||catalog.height<1||!Number.isSafeInteger(catalog.fps)||catalog.fps<1||typeof selected.manifest?.production_mode!=='string')return null;
  const start=item.window_start_frame,end=start+item.duration_frames;const closure=new Map<string,Set<string>>([[cutId,new Set()]]);const boundaryIds:string[]=[];
  for(const boundary of catalog.boundaries){const bStart=boundary.start_frame,bEnd=bStart+boundary.duration_frames;
    if(!Number.isSafeInteger(bStart)||!Number.isSafeInteger(boundary.duration_frames)||boundary.duration_frames<1||bEnd<=start||bStart>=end)continue;
    if(boundary.outgoing_shot_id!==cutId&&boundary.incoming_shot_id!==cutId)continue;
    if(typeof boundary.boundary_id!=='string'||!catalog.cuts.some((cut:any)=>cut.shot_id===boundary.outgoing_shot_id)||!catalog.cuts.some((cut:any)=>cut.shot_id===boundary.incoming_shot_id))return null;
    boundaryIds.push(boundary.boundary_id);
    for(const id of [boundary.outgoing_shot_id,boundary.incoming_shot_id]){if(!closure.has(id))closure.set(id,new Set());closure.get(id)!.add(boundary.boundary_id);}
  }
  return {composition:{id:item.composition_id,width:catalog.width,height:catalog.height,fps:catalog.fps,durationFrames:item.duration_frames,mode:selected.manifest.production_mode},boundaryIds:boundaryIds.sort(),dependencies:[...closure].map(([id,ids])=>({cutId:id,boundaryIds:[...ids].sort()})).sort((a,b)=>a.cutId.localeCompare(b.cutId))};
}

export async function evaluateCanonicalCut(plan:Plan,sceneId:string,signal?:AbortSignal):Promise<CanonicalReport>{
  if(typeof sceneId!=='string'||!/^scene[-_][A-Za-z0-9_-]{1,100}$/.test(sceneId))throw new StoreError('장면 ID가 올바르지 않습니다.');
  const scene=plan.scenes.find(item=>item.id===sceneId);
  if(!scene)throw new StoreError('장면을 찾을 수 없습니다.',404);
  const root=realpathSync(process.cwd());
  const report:CanonicalReport={schemaVersion:CANONICAL_SCHEMA,scope:{projectId:plan.id,revision:plan.revision,sceneId,cutId:null},episodeId:CANONICAL_EPISODE,snapshotSha256:sha(JSON.stringify(plan)),scriptSha256:plan.script.rawSha256,fingerprints:{},blockers:[],validators:[],composition:null,dependencyCutIds:[],boundaryIds:[],inputs:[],renderEligible:false,productionAuthority:false,cutPass:false,stylePass:false,playableParity:false};
  const block=(code:string,detail:string)=>report.blockers.push({code,detail});
  for(const relative of [EPISODE_SPEC_PATH,STATE,CONTRACTS,CATALOG,CATALOG_TS,INDEX,...ADAPTER]){
    try{report.fingerprints[relative]=fingerprint(root,relative);}catch{report.fingerprints[relative]=null;block('unsafe-authority-file','제작 입력 경로·크기를 안전하게 확인할 수 없습니다.');}
  }
  try{Object.assign(report.fingerprints,validationSourceFingerprints(root));}catch{block('unsafe-validator-closure','검증기 로컬 의존성을 안전하게 결속할 수 없습니다.');}
  if([INDEX,...ADAPTER,...VALIDATION_SOURCE].some(relative=>!report.fingerprints[relative]))block('missing-render-adapter','정식 렌더 entrypoint·검증기 또는 어댑터 파일이 없습니다.');
  let specBytes:Buffer|null=null;let stateBytes:Buffer|null=null;
  try{specBytes=readBounded(root,EPISODE_SPEC_PATH);stateBytes=readBounded(root,STATE);}catch{block('unsafe-episode-authority','에피소드 명세 또는 상태를 안전하게 읽을 수 없습니다.');return report;}
  if(!specBytes||!stateBytes){block('missing-episode-authority','현재 에피소드 명세 또는 제작 상태가 없습니다.');return report;}
  let spec:Record<string,any>;let state:Record<string,any>;
  try{spec=json(specBytes);state=json(stateBytes);}catch{block('invalid-episode-authority','에피소드 명세 또는 상태를 읽을 수 없습니다.');return report;}
  const cuts=Array.isArray(spec.cuts)?spec.cuts:[];
  if(spec.episode_id!==CANONICAL_EPISODE||state.episode_id!==CANONICAL_EPISODE||cuts.length===0){block('invalid-episode-authority','고정 에피소드 또는 컷 명세가 올바르지 않습니다.');return report;}
  if(plan.origin?.kind!=='episode-spec'||plan.origin.path!==EPISODE_SPEC_PATH||plan.origin.sha256!==sha(specBytes))block('stale-or-freeform-plan','현재 episode-spec에 결속된 가져온 계획이 아닙니다.');
  try{
    const baseline=importEpisode();
    const changed=plan.script.rawText!==baseline.script.rawText||plan.script.segments.length!==baseline.script.segments.length||plan.beats.length!==baseline.beats.length||plan.scenes.length!==baseline.scenes.length||plan.scenes.some((row,index)=>{
      const original=baseline.scenes[index];const beat=plan.beats.find(b=>b.id===row.beatIds[0]);const originalBeat=baseline.beats.find(b=>b.id===original.beatIds[0]);
      const segment=plan.script.segments.find(s=>s.id===beat?.segmentIds[0]);const originalSegment=baseline.script.segments.find(s=>s.id===originalBeat?.segmentIds[0]);
      return row.originCutIds?.length!==1||row.originCutIds[0]!==cuts[index].shot_id||JSON.stringify(row.beatIds)!==JSON.stringify(original.beatIds)||JSON.stringify(row.candidates)!==JSON.stringify(original.candidates)||row.selectedCandidateId!==null&&row.selectedCandidateId!==original.candidates[0].id||!beat||!originalBeat||beat.intent!==originalBeat.intent||beat.role!==originalBeat.role||JSON.stringify(beat.segmentIds)!==JSON.stringify(originalBeat.segmentIds)||!segment||!originalSegment||segment.text!==originalSegment.text||segment.kind!==originalSegment.kind||segment.start!==originalSegment.start||segment.end!==originalSegment.end;
    });
    if(changed)block('unadopted-editorial-change','Studio의 대본·의미 beat·세그먼트·선택 표현 변경을 episode-spec에 먼저 채택해야 합니다.');
  }catch{block('unadopted-editorial-change','현재 episode-spec에 대응하는 계획 구조를 검증할 수 없습니다.');}
  const origin=scene.originCutIds??[];
  if(origin.length!==1||!cuts.some((cut:any)=>cut.shot_id===origin[0]))block('ambiguous-origin-cut','장면이 정확히 하나의 현재 컷에 대응하지 않습니다.');
  if(origin.length===1&&cuts.some((cut:any)=>cut.shot_id===origin[0]))report.scope.cutId=origin[0];
  if(state.active_cut_root===null||state.render_authority?.cut_root===null){block('missing-active-cut-root','현재 활성 컷 루트가 없어 실제 컷을 렌더할 수 없습니다.');return report;}
  if(state.active_cut_root!==state.render_authority?.cut_root||!safeRelative(state.active_cut_root)||!state.active_cut_root.startsWith('video/public/assets/')){block('invalid-active-cut-root','활성 컷 루트 결속이 올바르지 않습니다.');return report;}
  if(state.expected_cut_count!==cuts.length||state.draft_inputs?.episode_spec_sha256!==sha(specBytes))block('stale-production-state','제작 상태가 현재 명세와 다릅니다.');
  let physical:string[]=[];
  try{const active=safeCanonicalFile(root,state.active_cut_root);const cutsRoot=safeCanonicalFile(root,path.relative(root,path.join(active,'cuts')));physical=readdirSync(cutsRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();for(const id of physical)safeCanonicalFile(root,path.relative(root,path.join(cutsRoot,id)));}
  catch{block('missing-active-cuts','활성 컷 폴더를 안전하게 확인할 수 없습니다.');return report;}
  if(JSON.stringify(physical)!==JSON.stringify(cuts.map((cut:any)=>cut.shot_id).sort()))block('cut-membership-mismatch','물리 컷 목록이 현재 episode-spec과 일치하지 않습니다.');
  let contractBytes:Buffer|null=null;let catalogBytes:Buffer|null=null;let tsBytes:Buffer|null=null;
  try{contractBytes=readBounded(root,CONTRACTS);catalogBytes=readBounded(root,CATALOG);tsBytes=readBounded(root,CATALOG_TS);}catch{block('unsafe-generated-authority','생성 계약 또는 카탈로그를 안전하게 읽을 수 없습니다.');return report;}
  if(!contractBytes||!catalogBytes||!tsBytes){block('missing-generated-authority','manifest-contracts, render-catalog 또는 생성 TypeScript가 없습니다.');return report;}
  if(report.blockers.length)return report;
  let catalog:Record<string,any>;let contracts:Record<string,any>;
  try{catalog=json(catalogBytes);contracts=json(contractBytes);}catch{block('invalid-generated-authority','생성된 계약 또는 카탈로그를 읽을 수 없습니다.');return report;}
  if(catalog.episode_id!==CANONICAL_EPISODE||catalog.authority_root!==state.active_cut_root||state.render_authority?.catalog_sha256!==sha(catalogBytes)||!Array.isArray(catalog.cuts)||catalog.cuts.length!==cuts.length||!Array.isArray(contracts.cuts)||contracts.cuts.length!==cuts.length){block('stale-generated-authority','생성 카탈로그·계약·상태 결속이 현재 명세와 다릅니다.');return report;}
  for(const entry of catalog.cuts){
    for(const relative of [entry.manifest_path,entry.asset_sheet_path]){
      if(typeof relative!=='string'){block('unsafe-cut-authority','컷 계약 경로가 올바르지 않습니다.');continue;}
      try{report.fingerprints[relative]=fingerprint(root,relative);}catch{report.fingerprints[relative]=null;block('unsafe-cut-authority','컷 계약 파일을 안전하게 읽을 수 없습니다.');}
    }
  }
  try{
    const loader=Function('specifier','return import(specifier)') as (specifier:string)=>Promise<{buildAuthorityCatalog:()=>Promise<Record<string,any>>;renderCatalogTypeScript:(value:unknown)=>string}>;
    const helper=await loader(new URL('../../video/scripts/render-authority-lib.mjs',import.meta.url).href);
    const fresh=await helper.buildAuthorityCatalog();
    if(JSON.stringify(fresh)!==JSON.stringify(catalog)||helper.renderCatalogTypeScript(catalog)!==tsBytes.toString('utf8'))block('stale-canonical-catalog','현재 컷/런타임에서 다시 계산한 카탈로그와 생성 파일이 다릅니다.');
  }catch{block('canonical-build-failed','현재 카탈로그를 안전하게 재계산하지 못했습니다.');}
  if(report.blockers.length)return report;
  const commands:[string,string[]][]=[['validate-render-authority.mjs',['--allow-missing-review']],['validate-production-stage.mjs',['--lock','cut-previews-ready']],['validate-cut-assets.mjs',['--require-cuts']],['validate-cut-visual-states.mjs',[]]];
  for(const [name,args] of commands){if(signal?.aborted){block('preflight-cancelled','컷 사전 검증이 중단됐습니다.');return report;}const passed=await validator(name,args,root,signal);report.validators.push({name,passed});if(!passed)block('validator-failed',`${name} 검증을 통과하지 못했습니다.`);}
  if(report.blockers.length)return report;
  const resolved=resolveCanonicalWindow(catalog,report.scope.cutId!);
  if(!resolved){block('missing-cut-composition','현재 컷의 정식 composition 또는 경계 결속이 없습니다.');return report;}
  report.composition=resolved.composition;report.dependencyCutIds=resolved.dependencies.map(item=>item.cutId);report.boundaryIds=resolved.boundaryIds;
  let total=0;
  for(const {cutId,boundaryIds} of resolved.dependencies){const cut:any=catalog.cuts.find((row:any)=>row.shot_id===cutId);if(!cut){block('missing-dependent-cut','경계가 참조하는 컷이 카탈로그에 없습니다.');continue;}
    const manifest=cut.manifest;const names=[manifest?.background,...(manifest?.assets??[]).map((a:any)=>a.file),...(manifest?.effects??[]).map((e:any)=>e.file),...(manifest?.omni?.keyframes??[]).map((k:any)=>k.file)];
    if(names.length<2)block('missing-local-visual','실제 로컬 화면 입력이 없는 컷입니다.');
    for(const name of names){if(typeof name!=='string'||!safeRelative(name)){block('unsafe-public-input','컷 입력 경로가 안전하지 않습니다.');continue;}
      const relative=`video/public/${cut.cut_base_path}/${name}`.replaceAll('\\','/');
      try{const bytes=readBounded(root,relative,MAX_INPUT);if(!bytes)throw new Error('missing');total+=bytes.length;if(total>MAX_AGGREGATE)throw new StoreError('선택 컷 입력의 총 크기가 1GB를 넘었습니다.',409);
        report.inputs.push({path:relative,sha256:sha(bytes),bytes:bytes.length,cutId,boundaryIds});report.fingerprints[relative]=sha(bytes);
      }catch{block('missing-or-unsafe-public-input','선택 컷의 로컬 원본 또는 경계 입력을 안전하게 확인할 수 없습니다.');}
    }
  }
  report.inputs.sort((a,b)=>a.path.localeCompare(b.path));
  if(!report.blockers.length)report.renderEligible=true;
  return report;
}

export function authorityFingerprintsStillMatch(report:CanonicalReport):boolean{
  const root=realpathSync(process.cwd());
  return Object.entries(report.fingerprints).every(([relative,expected])=>{
    try{return fingerprint(root,relative,relative.startsWith('video/public/')?MAX_INPUT:MAX_JSON)===expected;}catch{return false;}
  });
}
